/**
 * Web Worker for PIMC-boten: lange tenketider uten å fryse UI-tråden, MED
 * pondering og adaptiv dybde. Én BotAgent per bot-sete banker verdener i
 * små porsjoner («pondre»-meldinger sendes i UI-pausene – stikk-frys og
 * trekk-pauser) og gjenbruker alt akkumulert arbeid når beslutningen
 * («beslutt») trengs. Pondringen kjøres i 200 ms-skiver via setTimeout(0)
 * slik at en beslutt-melding aldri venter lenge i køen.
 */
import { BotAgent, velgHandling, type BotOpts } from "../src/bot/bot.ts";
import type { GameState, Handling } from "../src/motor.ts";
import { E1Agent } from "../src/e1/agent.ts";
import { Konvensjonsvakt, lesVaktflagg } from "../src/moe2/konvensjonsvakt.ts";
import { Budagent, tolkBudmodell } from "../src/moe2/budmodell.ts";
import { Vrakrangerer } from "../src/moe2/vrakrang.ts";
import { Rolleorakel } from "../src/moe2/rolleorakel.ts";
import { Trosnett } from "../src/moe2/trosnett.ts";
import { nettFraBytes } from "../src/nevro/nett.ts";

/**
 * ADAMS MED SØK, I WORKEREN.
 *
 * Søket koster ~1,3 s per kort NÅR BOTEN ER SPILLEFØRER, og boten er fører i
 * tre av fire runder fordi tre seter er bot. På hovedtråden ville det frosset
 * UI-et i nærmere femti sekunder per runde – ikke tregt, men umulig å skille
 * fra en krasj.
 *
 * Derfor bor søket her. Hovedtråden spør, workeren svarer, og siden svarer på
 * klikk hele veien.
 *
 * BARE de dyre beslutningene rutes hit. Nettet alene svarer på 0,5 ms, og å
 * sende dem gjennom en meldingskø ville vært ren overhead.
 */
type Velger = { velgHandling(s: GameState): Handling; nyKamp(): void };
let adams: Velger | null = null;

function tilBytes(b64: string): Uint8Array {
  const rå = atob(b64.trim());
  const bytes = new Uint8Array(rå.length);
  for (let i = 0; i < rå.length; i++) bytes[i] = rå.charCodeAt(i);
  return bytes;
}

let spillOpts: BotOpts = {};
let øvrigOpts: BotOpts = {};
const agenter = new Map<number, BotAgent>();

let ponderState: GameState | null = null;
let ponderStopp = 0; // Date.now-frist for pågående pondring
let ponderPlanlagt = false;

function agentFor(plass: number): BotAgent {
  let a = agenter.get(plass);
  if (a === undefined) {
    a = new BotAgent(plass, spillOpts);
    agenter.set(plass, a);
  }
  return a;
}

/** Pondrer i korte skiver så innkommende meldinger slipper til imellom. */
function ponderSkive(): void {
  ponderPlanlagt = false;
  const s = ponderState;
  if (s === null || Date.now() >= ponderStopp) return;
  if (s.fase === "SPILL" && s.iTur !== null && s.iTur !== 0) {
    agentFor(s.iTur).pondre(s, Math.min(200, ponderStopp - Date.now()));
  }
  if (Date.now() < ponderStopp && !ponderPlanlagt) {
    ponderPlanlagt = true;
    setTimeout(ponderSkive, 0);
  }
}

type Melding =
  | { type: "init"; spill: BotOpts; øvrig: BotOpts }
  | {
      type: "adams-init";
      kort: string;
      bud: unknown;
      vrak: string | null;
      tro: string | null;
      vaktflagg: string;
      vrakflagg: string;
      budterskel: number;
      verdener: number;
    }
  | { type: "adams-trekk"; id: number; state: GameState; sete: number }
  | { type: "pondre"; state: GameState; ms: number }
  | { type: "beslutt"; id: number; state: GameState; maksMs: number };

self.onmessage = (e: MessageEvent<Melding>) => {
  const m = e.data;
  if (m.type === "init") {
    spillOpts = m.spill;
    øvrigOpts = m.øvrig;
    agenter.clear();
    ponderState = null;
    return;
  }
  if (m.type === "adams-init") {
    // Bygges HER, ikke sendes ferdig: agenter kan ikke krysse en
    // meldingsgrense. Vektene kommer som base64 fra hovedtråden, som alt har
    // hentet dem – ingen dobbel nedlasting av sju megabyte.
    try {
      const kort: Velger = new Konvensjonsvakt(
        E1Agent.fraBytes(tilBytes(m.kort)),
        lesVaktflagg(m.vaktflagg),
      );
      let bot: Velger = kort;
      if (m.bud !== null) {
        try {
          bot = new Budagent(kort, tolkBudmodell(m.bud), m.budterskel);
        } catch { /* budmodellen avvist – nevros budgivning, som før */ }
      }
      if (m.vrak !== null) {
        const n = nettFraBytes(tilBytes(m.vrak))[0];
        if (n !== undefined) bot = new Vrakrangerer(bot, n, m.vrakflagg) as unknown as Velger;
      }
      let trosnett: Trosnett | null = null;
      if (m.tro !== null) {
        const n = nettFraBytes(tilBytes(m.tro))[0];
        if (n !== undefined) trosnett = new Trosnett(n);
      }
      // MOTPARTEN ER BOTEN UTEN SØK. Gis søkeagenten seg selv, starter hver
      // rollout et nytt søk – eksponentielt. Se utenSøk() i agentspek.ts.
      adams =
        m.verdener > 0
          ? (new Rolleorakel(bot, bot as never, "foerer", {
              verdener: m.verdener,
              trosnett,
              verdenKandidater: trosnett === null ? 3 : 32,
            }) as unknown as Velger)
          : bot;
    } catch (feil) {
      adams = null;
      (self as unknown as Worker).postMessage({ id: 0, feil: `adams-init: ${String(feil)}` });
    }
    return;
  }
  if (m.type === "adams-trekk") {
    try {
      if (adams === null) throw new Error("adams er ikke initialisert");
      (self as unknown as Worker).postMessage({ id: m.id, handling: adams.velgHandling(m.state) });
    } catch (feil) {
      (self as unknown as Worker).postMessage({ id: m.id, feil: String(feil) });
    }
    return;
  }
  if (m.type === "pondre") {
    ponderState = m.state;
    ponderStopp = Date.now() + m.ms;
    if (!ponderPlanlagt) {
      ponderPlanlagt = true;
      setTimeout(ponderSkive, 0);
    }
    return;
  }
  // beslutt: stans pondringen og svar innen maksMs.
  ponderState = null;
  try {
    const s = m.state;
    const handling: Handling =
      s.fase === "SPILL" && s.iTur !== null && s.iTur !== 0
        ? agentFor(s.iTur).beslutt(s, m.maksMs)
        : velgHandling(s, øvrigOpts);
    (self as unknown as Worker).postMessage({ id: m.id, handling });
  } catch (feil) {
    (self as unknown as Worker).postMessage({ id: m.id, feil: String(feil) });
  }
};
