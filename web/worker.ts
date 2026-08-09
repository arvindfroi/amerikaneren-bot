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
import { Budagent, tolkBudmodell } from "../src/moe2/budmodell.ts";
import { byggUtrullet, type Velger as UtrulletVelger } from "../src/moe2/utrullet.ts";
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
      sigma: number;
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
      /**
       * ============ ÉN BYGGEFUNKSJON, DELT MED MAALINGENE ==============
       *
       * Her sto kjeden bygd FOR HAAND, lag for lag, mens hver eneste maaling
       * gaar gjennom `lagIndre(<spek>)`. To kjeder uten felles kode og uten en
       * test som holdt dem sammen - og det er selve aarsaken til prosjektets
       * mest gjentatte feil: det maalte og det utrullede var ikke samme ting.
       *
       * `byggUtrullet` er den delte kjeden. `test/utrullet-lik-spek.test.ts`
       * spiller den og speken gjennom de samme stillingene og krever IDENTISKE
       * handlinger.
       *
       * REKKEFOELGEN VAR DET ENE AAPNE SPOERSMAALET: workeren la soeket
       * YTTERST, speken har `vr:` ytterst. `test/utrullet-rekkefolge.test.ts`
       * avgjorde det - identiske valg over 80+ beslutninger. Forskjellen er
       * altsaa uten virkning her, og byggeren foelger speken.
       *
       * OPPFOERSELEN ER UENDRET. Samme vaktflagg, samme budmodell, samme
       * konfidensport i foerersetet. Det som forsvinner er duplikatet.
       */
      const kortBytes = tilBytes(m.kort);
      let bud: ConstructorParameters<typeof Budagent>[1] | null = null;
      if (m.bud !== null) {
        try {
          bud = tolkBudmodell(m.bud);
        } catch {
          /* budmodellen avvist - nevros budgivning, som foer */
        }
      }
      const vraknett = m.vrak === null ? null : (nettFraBytes(tilBytes(m.vrak))[0] ?? null);

      /**
       * `tro` SENDES, MEN LESES IKKE - og det er ikke en glipp lenger.
       *
       * `Trosnett` krever et nett paa >= 558 trekk; `d7alle` har 273. Kanal 1 i
       * K8 (budene inn i troen) er derfor laast av NETTBREDDE, ikke av kode.
       * Feltet staar i meldingen for aa slippe en ny nedlasting den dagen et
       * bredere nett finnes. Se AdamsMax.md, «K8 utvidet».
       */
      adams = byggUtrullet({
        kortnett: nettFraBytes(kortBytes)[0]!,
        kort: E1Agent.fraBytes(kortBytes) as unknown as Velger,
        vaktflagg: m.vaktflagg,
        bud,
        budterskel: m.budterskel,
        vraknett,
        vrakflagg: m.vrakflagg,
        // KONFIDENSPORT, ikke alltid-soek. Maalt 6. august i to disjunkte baand:
        //   sik sigma=0,5   +1,78 / +1,68 i foerersetet   198 ms per trekk
        //   ork (alltid)    +1,25                         329 ms
        søk: m.verdener > 0 ? { type: "sik", verdener: m.verdener, sigma: m.sigma } : null,
        // K4/K6 er BYGD, men ikke maalt i spill enda. Naar ablasjonen har sagt
        // sitt, er dette den ene bryteren som slaar dem paa i appen.
        økt: false,
      }).agent;
      /**
       * KVITTERINGEN. Uten den kan ikke hovedtråden vite at det er DENNE
       * workeren den snakker med — se den lange kommentaren ved
       * `sikreAdamsIWorker` i `web/app.ts`. `klar: true` sendes bare herfra,
       * så en eldre worker kan ikke forfalske den ved uhell.
       */
      (self as unknown as Worker).postMessage({ id: 0, klar: true });
    } catch (feil) {
      adams = null;
      (self as unknown as Worker).postMessage({ id: 0, klar: false, feil: `adams-init: ${String(feil)}` });
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
