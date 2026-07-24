/**
 * Trekkuttrekk for NevroHjerne – en tro oversettelse av `NevroTrekk` i
 * Amerikaneren-App (Amerikaneren/AI/NevroNett.swift). Hver indeks må ligge
 * NØYAKTIG der appen la den, ellers ser nettet noe annet enn det ble trent
 * på; derfor står feltnumrene eksplisitt i koden under.
 *
 * Alt kodes relativt til eget sete (`rel`), og bare informasjon setet
 * lovlig har brukes: egen hånd, spilte kort, bordet, meldinger, avslørt
 * makker (eller at man selv ER makkeren – man ser jo sitt eget kort) og
 * poengstillingen.
 *
 * Kortindeks er appens: farge × 13 + (verdi − 2), farger [S, H, R, K].
 */

import { FARGER, type Farge, type Kort } from "../kort.ts";
import { lovligeHandlinger, type GameState } from "../motor.ts";
import { AMERIKANER, budRang, PASS, SOLO } from "../regler.ts";

export const BUD_DIM = 64;
export const BYTT_DIM = 59;
export const SPILL_DIM = 238;

/** Budhandlingene nettets 12 utganger svarer til, i appens rekkefølge. */
export const BUD_HANDLINGER: readonly (number | typeof PASS | typeof AMERIKANER | typeof SOLO)[] = [
  PASS,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  AMERIKANER,
  SOLO,
];

export function fargeIndeks(f: Farge): number {
  return FARGER.indexOf(f);
}

export function kortIndeks(k: Kort): number {
  return fargeIndeks(k.farge) * 13 + (k.verdi - 2);
}

function settKort(v: Float32Array, basis: number, kort: readonly Kort[]): void {
  for (const k of kort) v[basis + kortIndeks(k)] = 1;
}

/** Motpartens sete sett fra `sete` (0 = meg selv, 1 = neste i tur, …). */
function rel(sete: number, annet: number): number {
  return (annet - sete + 4) % 4;
}

function egenPoengAndel(state: GameState, sete: number): number {
  return Math.min(state.totalPoeng[sete] ?? 0, state.regler.målPoeng) / state.regler.målPoeng;
}

function maksAndresPoengAndel(state: GameState, sete: number): number {
  let maks = 0;
  for (let s = 0; s < 4; s++) if (s !== sete) maks = Math.max(maks, state.totalPoeng[s] ?? 0);
  return Math.min(maks, state.regler.målPoeng) / state.regler.målPoeng;
}

const erAmerikaner = (state: GameState): boolean => state.melding?.type === "amerikaner";
const erSolo = (state: GameState): boolean => state.melding?.type === "solo";

/** Tallbudet som ligger høyest, eller null (Amerikaner/solo/ingen bud). */
function høyesteTallbud(state: GameState): number | null {
  const h = state.budrunde.høyeste;
  return h !== null && typeof h.bud === "number" ? h.bud : null;
}

// --- Budrunden --------------------------------------------------------------
export function budTrekk(state: GameState, sete: number): Float32Array {
  const v = new Float32Array(BUD_DIM);
  settKort(v, 0, state.hender[sete] ?? []);
  const lov = lovligeHandlinger(state);
  const tall = lov.fase === "BUDRUNDE" ? lov.bud.filter((b): b is number => typeof b === "number") : [];
  v[52] = (tall.length > 0 ? Math.min(...tall) : 0) / 13;
  const høyeste = state.budrunde.høyeste;
  if (høyeste !== null) {
    // Appen mapper Amerikaner (rang 1000) ned til 13, men lar solo (2000) stå
    // – vi speiler det nøyaktig, for nettet er trent med akkurat den skjevheten.
    const rang = budRang(høyeste.bud);
    v[53] = Math.max(0, rang === 1000 ? 13 : rang) / 13;
    v[54 + rel(sete, høyeste.spiller)] = 1;
  }
  v[58] = state.budrunde.passet.filter(Boolean).length / 3;
  v[59] = egenPoengAndel(state, sete);
  v[60] = maksAndresPoengAndel(state, sete);
  v[61] = state.regler.medByttekort ? 1 : 0;
  v[62] = state.giving.kortPerSpiller / 13;
  v[63] = 1; // bias-inngang
  return v;
}

// --- Byttekort (vrak) -------------------------------------------------------
export function byttTrekk(state: GameState, sete: number): Float32Array {
  const v = new Float32Array(BYTT_DIM);
  settKort(v, 0, state.hender[sete] ?? []);
  const tall = høyesteTallbud(state);
  if (tall !== null) v[52] = tall / 13;
  v[53] = erAmerikaner(state) ? 1 : 0;
  v[54] = egenPoengAndel(state, sete);
  v[55] = maksAndresPoengAndel(state, sete);
  v[56] = state.giving.kortPerSpiller / 13;
  v[57] = 1;
  v[58] = erSolo(state) ? 1 : 0;
  return v;
}

// --- Kortspill --------------------------------------------------------------
export function spillTrekk(state: GameState, sete: number): Float32Array {
  const v = new Float32Array(SPILL_DIM);
  settKort(v, 0, state.hender[sete] ?? []);
  // Appens `spilteKort` inkluderer kortene som ligger på bordet nå – de
  // markeres altså i BEGGE blokkene (52 og 104). Det er tilsiktet der.
  for (const stikk of state.historikk) settKort(v, 52, stikk.kort.map((k) => k.kort));
  settKort(v, 52, state.bord.map((k) => k.kort));
  settKort(v, 104, state.bord.map((k) => k.kort));

  const ønsketLagt =
    state.etterlyst !== null &&
    [...state.historikk.flatMap((s) => s.kort), ...state.bord].some(
      (k) => k.kort.farge === state.etterlyst!.farge && k.kort.verdi === state.etterlyst!.verdi,
    );
  if (state.etterlyst !== null && !ønsketLagt) v[156 + kortIndeks(state.etterlyst)] = 1;

  if (state.budvinner !== null) v[208 + rel(sete, state.budvinner)] = 1;
  const leder = state.bord[0]?.spiller ?? state.iTur ?? sete;
  v[212 + rel(sete, leder)] = 1;
  // Makkeren slik setet kjenner den: avslørt for alle, eller jeg er den selv.
  if (state.makkerAvslørt && state.makker !== null) v[216 + rel(sete, state.makker)] = 1;
  else if (state.makker === sete) v[216] = 1;

  if (state.trumf !== null) v[220 + fargeIndeks(state.trumf)] = 1;
  else v[224] = 1;

  const tall = høyesteTallbud(state);
  if (tall !== null) v[225] = tall / 13;
  v[226] = erAmerikaner(state) ? 1 : 0;
  v[227] = sete === state.budvinner || state.makker === sete ? 1 : 0;
  v[228] = state.stikkSpilt / Math.max(1, state.giving.kortPerSpiller);
  v[229] = (state.stikkVunnet[sete] ?? 0) / 13;
  let lagStikk = state.budvinner !== null ? (state.stikkVunnet[state.budvinner] ?? 0) : 0;
  if (state.makkerAvslørt && state.makker !== null) lagStikk += state.stikkVunnet[state.makker] ?? 0;
  v[230] = lagStikk / 13;
  v[231] = egenPoengAndel(state, sete);
  v[232] = maksAndresPoengAndel(state, sete);
  for (let s = 0; s < 4; s++) v[233 + rel(sete, s)] = (state.stikkVunnet[s] ?? 0) / 13;
  v[237] = erSolo(state) ? 1 : 0;
  return v;
}
