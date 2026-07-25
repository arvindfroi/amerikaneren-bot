/**
 * Trekkuttrekk for appens nevronett, portert fra `NevroTrekk` i
 * `Amerikaneren/AI/NevroNett.swift`.
 *
 * VIKTIG: dette er en eksakt gjengivelse av appens inngangsvektorer – samme
 * indekser, samme normalisering, samme rekkefølge. Nettet er trent på nøyaktig
 * disse tallene, så enhver avvikende koding gir nettet søppel inn. Der appens
 * motor og denne motoren bruker ulike navn på samme ting, oversetter vi her:
 *
 *   appens GameEngine          →  denne motorens GameState
 *   hands[sete]                →  hender[sete]
 *   spilteKort                 →  historikk (alle stikk) + bord
 *   currentTrick               →  bord
 *   ønsketKort / ønsketLagt    →  etterlyst / om etterlyst er spilt
 *   budgiverSeat               →  budvinner
 *   aktivSpiller               →  iTur
 *   trickNummer                →  stikkSpilt
 *   stikkTatt                  →  stikkVunnet
 *   scores                     →  totalPoeng
 *   harPasset                  →  budrunde.passet
 *
 * Kortindeksen er appens `Kortmaske.indeks`: fargeindeks × 13 + (verdi − 2),
 * med fargerekkefølgen spar, hjerter, ruter, kløver – identisk med `FARGER`
 * her (S, H, R, K).
 */

import { FARGER, type Farge, type Kort } from "../kort.ts";
import { AMERIKANER, PASS, SOLO, type Bud } from "../regler.ts";
import { type GameState } from "../motor.ts";

export const BUD_DIM = 64;
export const BYTT_DIM = 59;
export const SPILL_DIM = 238;

/** Appens `Kortmaske.fargeIndeks`. */
export function fargeIndeks(f: Farge): number {
  return FARGER.indexOf(f);
}

/** Appens `Kortmaske.indeks`: 0–51. */
export function kortIndeks(k: Kort): number {
  return fargeIndeks(k.farge) * 13 + (k.verdi - 2);
}

/**
 * Budhandlingene nettets 12 utganger svarer til, i appens rekkefølge:
 * pass, 5…13 stikk, amerikaner, solo-amerikaner.
 */
export const BUD_HANDLINGER: readonly Bud[] = [
  PASS, 5, 6, 7, 8, 9, 10, 11, 12, 13, AMERIKANER, SOLO,
];

/** Utgangsindeksen for et bud, eller −1 om budet ikke finnes i listen. */
export function budUtgang(bud: Bud): number {
  return BUD_HANDLINGER.indexOf(bud);
}

/** Appens `BidAction.rang`: pass −1, tallbud n, amerikaner 1000, solo 2000. */
export function budRang(bud: Bud): number {
  if (bud === PASS) return -1;
  if (bud === AMERIKANER) return 1000;
  if (bud === SOLO) return 2000;
  return bud;
}

/** Appens `rel`: setet sett relativt til eget sete. */
function rel(sete: number, annet: number): number {
  return (annet - sete + 4) % 4;
}

function settKort(v: Float32Array, basis: number, kort: readonly Kort[]): void {
  for (const k of kort) v[basis + kortIndeks(k)] = 1;
}

/** Alle kort som er lagt denne runden (fullførte stikk + det åpne stikket). */
export function spilteKort(s: GameState): Kort[] {
  const ut: Kort[] = [];
  for (const stikk of s.historikk) for (const kp of stikk.kort) ut.push(kp.kort);
  for (const kp of s.bord) ut.push(kp.kort);
  return ut;
}

const erAmerikaner = (s: GameState): boolean => s.melding?.type === "amerikaner";
const erSolo = (s: GameState): boolean => s.melding?.type === "solo";

/** min(egen poengsum, målPoeng) / målPoeng – som i appen. */
function egenPoeng(s: GameState, sete: number): number {
  const mål = s.regler.målPoeng;
  return Math.min(s.totalPoeng[sete] ?? 0, mål) / mål;
}

/** min(høyeste poengsum blant de ANDRE, målPoeng) / målPoeng. */
function andresPoeng(s: GameState, sete: number): number {
  const mål = s.regler.målPoeng;
  let maks = 0;
  for (let i = 0; i < 4; i++) {
    if (i !== sete) maks = Math.max(maks, s.totalPoeng[i] ?? 0);
  }
  return Math.min(maks, mål) / mål;
}

/** Inngangsvektor for budnettet (`NevroTrekk.bud`). */
export function budTrekk(s: GameState, sete: number, lovligeBud: readonly Bud[]): Float32Array {
  const v = new Float32Array(BUD_DIM);
  settKort(v, 0, s.hender[sete] ?? []);
  // Laveste lovlige TALLBUD (0 om ingen tallbud er lovlige).
  let minste = 0;
  for (const b of lovligeBud) {
    if (typeof b === "number" && (minste === 0 || b < minste)) minste = b;
  }
  v[52] = minste / 13;
  const høyeste = s.budrunde.høyeste;
  if (høyeste !== null) {
    // Appen mapper amerikaner (rang 1000) til 13; solo (2000) står urørt.
    const rang = budRang(høyeste.bud);
    v[53] = Math.max(0, rang === 1000 ? 13 : rang) / 13;
    v[54 + rel(sete, høyeste.spiller)] = 1;
  }
  v[58] = s.budrunde.passet.filter(Boolean).length / 3;
  v[59] = egenPoeng(s, sete);
  v[60] = andresPoeng(s, sete);
  v[61] = s.giving.talong > 0 ? 1 : 0; // medByttekort
  v[62] = s.giving.kortPerSpiller / 13;
  v[63] = 1; // bias-inngang
  return v;
}

/** Inngangsvektor for vraknettet (`NevroTrekk.bytt`). */
export function byttTrekk(s: GameState, sete: number): Float32Array {
  const v = new Float32Array(BYTT_DIM);
  settKort(v, 0, s.hender[sete] ?? []);
  const bud = s.budrunde.høyeste?.bud;
  if (typeof bud === "number") v[52] = bud / 13;
  v[53] = erAmerikaner(s) ? 1 : 0;
  v[54] = egenPoeng(s, sete);
  v[55] = andresPoeng(s, sete);
  v[56] = s.giving.kortPerSpiller / 13;
  v[57] = 1;
  v[58] = erSolo(s) ? 1 : 0;
  return v;
}

/** Inngangsvektor for spillnettet (`NevroTrekk.spill`). */
export function spillTrekk(s: GameState, sete: number): Float32Array {
  const v = new Float32Array(SPILL_DIM);
  const lagt = spilteKort(s);
  settKort(v, 0, s.hender[sete] ?? []);
  settKort(v, 52, lagt);
  settKort(v, 104, s.bord.map((kp) => kp.kort));
  // Etterlyst kort som ennå ikke er lagt (appens ønsketKort/ønsketLagt).
  if (s.etterlyst !== null) {
    const ønsket = s.etterlyst;
    const lagtUt = lagt.some((k) => k.farge === ønsket.farge && k.verdi === ønsket.verdi);
    if (!lagtUt) v[156 + kortIndeks(ønsket)] = 1;
  }
  if (s.budvinner !== null) v[208 + rel(sete, s.budvinner)] = 1;
  const leder = s.bord.length > 0 ? s.bord[0]!.spiller : (s.iTur ?? sete);
  v[212 + rel(sete, leder)] = 1;
  // Makker slik setet kjenner den: avslørt for alle, eller meg selv.
  if (s.makkerAvslørt && s.makker !== null) {
    v[216 + rel(sete, s.makker)] = 1;
  } else if (s.makker === sete) {
    v[216] = 1;
  }
  if (s.trumf !== null) {
    v[220 + fargeIndeks(s.trumf)] = 1;
  } else {
    v[224] = 1;
  }
  const bud = s.budrunde.høyeste?.bud;
  if (typeof bud === "number") v[225] = bud / 13;
  v[226] = erAmerikaner(s) ? 1 : 0;
  v[227] = sete === s.budvinner || s.makker === sete ? 1 : 0;
  v[228] = s.stikkSpilt / Math.max(1, s.giving.kortPerSpiller);
  v[229] = (s.stikkVunnet[sete] ?? 0) / 13;
  let lagStikk = s.budvinner !== null ? (s.stikkVunnet[s.budvinner] ?? 0) : 0;
  if (s.makkerAvslørt && s.makker !== null) lagStikk += s.stikkVunnet[s.makker] ?? 0;
  v[230] = lagStikk / 13;
  v[231] = egenPoeng(s, sete);
  v[232] = andresPoeng(s, sete);
  for (let i = 0; i < 4; i++) {
    v[233 + rel(sete, i)] = (s.stikkVunnet[i] ?? 0) / 13;
  }
  v[237] = erSolo(s) ? 1 : 0;
  return v;
}
