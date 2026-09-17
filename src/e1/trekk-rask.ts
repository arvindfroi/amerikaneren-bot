/**
 * GRUNNTREKKENE (0–272) UTEN MELLOMVEKTORER — 17. sep, `D:/amb-grp/loop/fart.md`.
 *
 * Profilen av helbotens søk med SIMD-kjernen: trekkbyggingen er ~23 % av tiden, og
 * `e1SpillTrekk` alene 11 %. Den bygger `spillTrekk` (238) i en egen vektor, kopierer den, og slår
 * opp kort i en `Set<string>` med malstrenger. Her skrives de samme 273 tallene rett inn i målet,
 * med en 52-plass tabell i stedet for strenger.
 *
 * BIT-IDENTISK MED `e1SpillTrekk(state, sete, E1_SPILL_DIM)` — ikke «omtrent»:
 *   - hver indeks får nøyaktig samme uttrykk (samme doble-presisjonsregning, så Float32-avrunding);
 *   - opphopningene `+= 1 / 13` gjøres som gjentatte Float32-addisjoner, som i originalen (alle
 *     leddene er like, så rekkefølgen spiller ingen rolle — men antallet addisjoner gjør det, og
 *     `n * (1/13)` ville gitt andre biter);
 *   - målet MÅ være nullstilt i 0–272 (det er det: `e1KortBokTrekk` lager en fersk vektor).
 * `test/fart-trekk.test.ts` holder likheten på tusenvis av stillinger fra ekte partier.
 */
import { FARGER, type Kort } from "../kort.ts";
import type { GameState } from "../motor.ts";
import { SPILL_DIM } from "../nevro/trekk.ts";

const BASIS = SPILL_DIM;
const fi = (k: Kort): number => FARGER.indexOf(k.farge);
const idx = (k: Kort): number => FARGER.indexOf(k.farge) * 13 + (k.verdi - 2);
const rel = (sete: number, annet: number): number => (annet - sete + 4) % 4;

const sett = new Uint8Array(52);
const ren = new Uint8Array(16);

export function e1GrunnTrekkInn(v: Float32Array, state: GameState, sete: number): void {
  const hånd = state.hender[sete] ?? [];
  const hist = state.historikk;
  const bord = state.bord;
  sett.fill(0);

  // ---- spillTrekk (0–237) ----
  for (const k of hånd) {
    const c = idx(k);
    v[c] = 1;
    sett[c] = 1;
  }
  const e = state.etterlyst;
  const eIdx = e === null ? -1 : idx(e);
  let ønsketLagt = false;
  for (const stikk of hist) {
    for (const kp of stikk.kort) {
      const c = idx(kp.kort);
      v[52 + c] = 1;
      sett[c] = 1;
      if (c === eIdx) ønsketLagt = true;
    }
  }
  for (const kp of bord) {
    const c = idx(kp.kort);
    v[52 + c] = 1;
    v[104 + c] = 1;
    sett[c] = 1;
    if (c === eIdx) ønsketLagt = true;
  }
  if (e !== null && !ønsketLagt) v[156 + eIdx] = 1;
  if (state.budvinner !== null) v[208 + rel(sete, state.budvinner)] = 1;
  const leder = state.bord[0]?.spiller ?? state.iTur ?? sete;
  v[212 + rel(sete, leder)] = 1;
  if (state.makkerAvslørt && state.makker !== null) v[216 + rel(sete, state.makker)] = 1;
  else if (state.makker === sete) v[216] = 1;
  if (state.trumf !== null) v[220 + FARGER.indexOf(state.trumf)] = 1;
  else v[224] = 1;
  const h = state.budrunde.høyeste;
  if (h !== null && typeof h.bud === "number") v[225] = h.bud / 13;
  v[226] = state.melding?.type === "amerikaner" ? 1 : 0;
  v[227] = sete === state.budvinner || state.makker === sete ? 1 : 0;
  v[228] = state.stikkSpilt / Math.max(1, state.giving.kortPerSpiller);
  v[229] = (state.stikkVunnet[sete] ?? 0) / 13;
  let lagStikk = state.budvinner !== null ? (state.stikkVunnet[state.budvinner] ?? 0) : 0;
  if (state.makkerAvslørt && state.makker !== null) lagStikk += state.stikkVunnet[state.makker] ?? 0;
  v[230] = lagStikk / 13;
  const mål = state.regler.målPoeng;
  v[231] = Math.min(state.totalPoeng[sete] ?? 0, mål) / mål;
  let maks = 0;
  for (let s = 0; s < 4; s++) if (s !== sete) maks = Math.max(maks, state.totalPoeng[s] ?? 0);
  v[232] = Math.min(maks, mål) / mål;
  for (let s = 0; s < 4; s++) v[233 + rel(sete, s)] = (state.stikkVunnet[s] ?? 0) / 13;
  v[237] = state.melding?.type === "solo" ? 1 : 0;

  // ---- E1-basis (238–272) ----
  for (const k of hånd) v[BASIS + fi(k)]! += 1 / 13;
  // «spilt» er historikken og så bordet, i den rekkefølgen.
  for (const stikk of hist) for (const kp of stikk.kort) v[BASIS + 4 + fi(kp.kort)]! += 1 / 13;
  for (const kp of bord) v[BASIS + 4 + fi(kp.kort)]! += 1 / 13;

  ren.fill(0);
  const renons = (stikk: readonly { spiller: number; kort: Kort }[]): void => {
    const første = stikk[0];
    if (første === undefined) return;
    const led = første.kort.farge;
    for (const kp of stikk) if (kp.kort.farge !== led) ren[kp.spiller * 4 + FARGER.indexOf(led)] = 1;
  };
  for (const stikk of hist) renons(stikk.kort);
  if (bord.length > 0) renons(bord);
  for (let s = 0; s < 4; s++) {
    const r = (s - sete + 4) % 4;
    for (let f = 0; f < 4; f++) if (ren[s * 4 + f] === 1) v[BASIS + 8 + r * 4 + f] = 1;
  }

  for (let f = 0; f < 4; f++) {
    let høyest = 0;
    let antall = 0;
    for (let verdi = 2; verdi <= 14; verdi++) {
      if (sett[f * 13 + verdi - 2] === 1) continue;
      antall++;
      if (verdi > høyest) høyest = verdi;
    }
    v[BASIS + 24 + f] = høyest === 0 ? 0 : (høyest - 2) / 12;
    v[BASIS + 28 + f] = antall / 13;
  }
  v[BASIS + 32] = (state.giving.antallStikk - state.stikkSpilt) / 13;
  v[BASIS + 33] = state.bord.length === 0 ? 1 : 0;
  v[BASIS + 34] = 1;
}
