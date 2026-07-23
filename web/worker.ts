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
