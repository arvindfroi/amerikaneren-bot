/**
 * Trekkuttrekk: koder en spillers LOVLIGE informasjon (SpillerVisning) til
 * en fast inngangsvektor for nettverket. Agenten ser aldri skjult
 * informasjon – alt hentes fra `spillerVisning`, som redigerer bort andres
 * hender, talong og uavslørt makker. Nettverket får dermed nøyaktig det en
 * menneskelig spiller med perfekt hukommelse ville visst.
 *
 * Alle relative seter roteres slik at 0 = meg, 1 = neste med klokka osv. –
 * nettet lærer posisjonsuavhengig.
 */

import { FARGER, type Farge, type Kort } from "../kort.ts";
import type { SpillerVisning } from "../motor.ts";

export type Beslutning = "BUD" | "VRAK" | "VELG" | "SPILL";

/** Kortindeks 0..51: farge-blokk (S,H,R,K) × verdi (2..14). */
export function kortIndeks(k: Kort): number {
  return FARGER.indexOf(k.farge) * 13 + (k.verdi - 2);
}

// --- Inngangslayout (offsets) ----------------------------------------------
const HÅND = 0; //            52: egen hånd
const SETT = 52; //           52: kort som er ute av spill sett fra meg (historikk + bord + eget vrak)
const BORD = 104; //          52: kort på bordet i inneværende stikk
const TRUMF = 156; //          4: trumffarge one-hot
const BESLUTNING = 160; //     4: hvilken beslutning som tas (BUD/VRAK/VELG/SPILL)
const FARGELENGDER = 164; //   4: antall egne kort per farge (/8, klippet)
const BUD_HØYESTE = 168; //    1: høyeste tallbud (/antallStikk)
const BUD_AMERIKANER = 169; // 1: høyeste bud er Amerikaner
const BUD_SOLO = 170; //       1: høyeste bud er solo
const BUD_MEG = 171; //        1: jeg har høyeste bud
const PASSET = 172; //         4: hvem har passet (relative seter)
const BUDVINNER = 176; //      4: budvinner one-hot (relative seter)
const MELDING = 180; //        3: meldingstype (tall/amerikaner/solo)
const KONTRAKT = 183; //       1: kontraktstørrelse (/antallStikk; amerikaner/solo=1)
const ER_BUDVINNER = 184; //   1: jeg er budvinner
const ER_MAKKER = 185; //      1: jeg er (avslørt) makker
const MAKKER_SETE = 186; //    4: avslørt makker one-hot (relative seter)
const STIKK_SPILT = 190; //    1: andel stikk spilt
const MINE_STIKK = 191; //     1: mine stikk (/antallStikk)
const LAG_STIKK = 192; //      1: budlagets stikk så langt (/antallStikk)
const BORD_ANTALL = 193; //    1: antall kort på bordet (/3)
const UTSPILLER = 194; //      4: hvem spilte ut i stikket (relative seter)
const MINE_POENG = 198; //     1: egne kamppoeng (/målPoeng, klippet)
const BESTE_MOTSTANDER = 199;//1: beste motstanders kamppoeng
const ETTERLYST_UTE = 200; //  1: etterlyst kort ennå ikke lagt
const ETTERLYST = 201; //     52: det etterlyste kortet
// --- Avledede sensorer (offentlig deduksjon servert ferdig) ---
const RENONS = 253; //        12: avslørt renons hos motspillerne (rel. sete 1–3 × farge)
const SKJULTE_I_FARGE = 265; // 4: antall skjulte kort per farge (/13)
const BOSS = 269; //           4: jeg holder høyeste LEVENDE kort i fargen
const TRUMF_UTE = 273; //      1: trumf igjen utenfor egen hånd (/13)
const BESTE_ER_TRUMF = 274; // 1: beste kort på bordet er trumf
const KAN_SLÅ = 275; //        1: jeg har et lovlig kort som slår bordet
const STIKKLEDER = 276; //     4: hvem vinner stikket akkurat nå (rel. sete)
export const ANTALL_INN = 280;

const BESLUTNINGER: readonly Beslutning[] = ["BUD", "VRAK", "VELG", "SPILL"];

// --- Utgangslayout ----------------------------------------------------------
/** xT – forventet antall stikk for egen side gitt hånden (skalert av agenten). */
export const UT_XT = 0;
/** Tilbøyelighet til å melde Amerikaner. */
export const UT_AMERIKANER = 1;
/** Tilbøyelighet til å melde solo-amerikaner. */
export const UT_SOLO = 2;
/** Budmargin: lært aggressivitet lagt til xT før budet velges. */
export const UT_MARGIN = 3;
/** 4 trumffarge-verdier (S,H,R,K). */
export const UT_TRUMF = 4;
/** 52 kortverdier: brukes til vraking, etterlysning og kortspill. */
export const UT_KORT = 8;
export const ANTALL_UT = 60;

/**
 * Bygger inngangsvektoren for spilleren i `visning` ved beslutningstypen
 * `beslutning`. Målpoeng trengs for normalisering av kamppoeng.
 */
export function lagInn(
  visning: SpillerVisning,
  beslutning: Beslutning,
  antallStikk: number,
  målPoeng: number,
): number[] {
  const inn = new Array<number>(ANTALL_INN).fill(0);
  const meg = visning.deg;
  const n = visning.antallKort.length;
  const rel = (sete: number): number => ((sete - meg) % n + n) % n;

  for (const k of visning.dinHånd) {
    inn[HÅND + kortIndeks(k)] = 1;
    inn[FARGELENGDER + FARGER.indexOf(k.farge)] = Math.min(
      1,
      (inn[FARGELENGDER + FARGER.indexOf(k.farge)]! * 8 + 1) / 8,
    );
  }

  // Kort som er ute av spill sett fra meg: alle fullførte stikk, kortene på
  // bordet nå, og mitt eget vrak (kun budvinner kjenner sitt).
  const settUte = new Set<number>();
  for (const stikk of visning.historikk) {
    for (const kp of stikk.kort) settUte.add(kortIndeks(kp.kort));
  }
  for (const kp of visning.bord) {
    settUte.add(kortIndeks(kp.kort));
    inn[BORD + kortIndeks(kp.kort)] = 1;
  }
  for (const k of visning.dittVrak) settUte.add(kortIndeks(k));
  for (const i of settUte) inn[SETT + i] = 1;

  if (visning.trumf !== null) inn[TRUMF + FARGER.indexOf(visning.trumf)] = 1;
  inn[BESLUTNING + BESLUTNINGER.indexOf(beslutning)] = 1;

  const høyeste = visning.budrunde.høyeste;
  if (høyeste !== null) {
    if (typeof høyeste.bud === "number") inn[BUD_HØYESTE] = høyeste.bud / antallStikk;
    else if (høyeste.bud === "AMERIKANER") inn[BUD_AMERIKANER] = 1;
    else inn[BUD_SOLO] = 1;
    if (høyeste.spiller === meg) inn[BUD_MEG] = 1;
  }
  for (let s = 0; s < n; s++) {
    if (visning.budrunde.passet[s]) inn[PASSET + rel(s)] = 1;
  }

  if (visning.budvinner !== null) {
    inn[BUDVINNER + rel(visning.budvinner)] = 1;
    if (visning.budvinner === meg) inn[ER_BUDVINNER] = 1;
  }
  if (visning.melding !== null) {
    const m = visning.melding;
    inn[MELDING + (m.type === "tall" ? 0 : m.type === "amerikaner" ? 1 : 2)] = 1;
    inn[KONTRAKT] = m.type === "tall" ? m.bud / antallStikk : 1;
  }
  if (visning.makker !== null) {
    inn[MAKKER_SETE + rel(visning.makker)] = 1;
    if (visning.makker === meg) inn[ER_MAKKER] = 1;
  }

  inn[STIKK_SPILT] = visning.stikkSpilt / antallStikk;
  inn[MINE_STIKK] = (visning.stikkVunnet[meg] ?? 0) / antallStikk;
  if (visning.budvinner !== null) {
    const lag =
      (visning.stikkVunnet[visning.budvinner] ?? 0) +
      (visning.makker !== null && visning.makker !== visning.budvinner
        ? (visning.stikkVunnet[visning.makker] ?? 0)
        : 0);
    inn[LAG_STIKK] = lag / antallStikk;
  }
  inn[BORD_ANTALL] = visning.bord.length / Math.max(1, n - 1);
  if (visning.bord.length > 0) inn[UTSPILLER + rel(visning.bord[0]!.spiller)] = 1;

  inn[MINE_POENG] = klipp01((visning.totalPoeng[meg] ?? 0) / målPoeng);
  let beste = -Infinity;
  for (let s = 0; s < n; s++) {
    if (s === meg) continue;
    beste = Math.max(beste, visning.totalPoeng[s] ?? 0);
  }
  inn[BESTE_MOTSTANDER] = klipp01(beste / målPoeng);

  if (visning.etterlyst !== null) {
    const idx = kortIndeks(visning.etterlyst);
    inn[ETTERLYST + idx] = 1;
    if (!settUte.has(idx)) inn[ETTERLYST_UTE] = 1;
  }

  // --- Avledede sensorer -----------------------------------------------------

  // Avslørt renons: fulgte en spiller ikke utspillsfargen, er hen renons i
  // den (offentlig deduksjon). Egen renons (rel. sete 0) trengs ikke.
  const alleStikk = visning.bord.length > 0
    ? [...visning.historikk, { kort: visning.bord, vinner: -1 }]
    : visning.historikk;
  for (const stikk of alleStikk) {
    if (stikk.kort.length === 0) continue;
    const ledFarge = stikk.kort[0]!.kort.farge;
    for (const kp of stikk.kort) {
      if (kp.kort.farge !== ledFarge) {
        const r = rel(kp.spiller);
        if (r > 0) inn[RENONS + (r - 1) * 4 + FARGER.indexOf(ledFarge)] = 1;
      }
    }
  }

  // Skjulte kort og boss-kort per farge («levende» = verken på egen hånd
  // eller ute av spill; skjult = levende og ikke min).
  const minHøyeste: Record<Farge, number> = { S: 0, H: 0, R: 0, K: 0 };
  const mineIFarge: Record<Farge, number> = { S: 0, H: 0, R: 0, K: 0 };
  for (const k of visning.dinHånd) {
    mineIFarge[k.farge]++;
    if (k.verdi > minHøyeste[k.farge]) minHøyeste[k.farge] = k.verdi;
  }
  for (let f = 0; f < 4; f++) {
    const farge = FARGER[f]!;
    let uteAvSpill = 0;
    let høyesteSkjulte = 0;
    for (let v = 14; v >= 2; v--) {
      if (settUte.has(f * 13 + (v - 2))) uteAvSpill++;
      else if (høyesteSkjulte === 0 && v !== minHøyeste[farge] && !harVerdi(visning.dinHånd, farge, v)) {
        høyesteSkjulte = v;
      }
    }
    inn[SKJULTE_I_FARGE + f] = (13 - uteAvSpill - mineIFarge[farge]) / 13;
    if (minHøyeste[farge] > 0 && minHøyeste[farge] > høyesteSkjulte) inn[BOSS + f] = 1;
  }
  if (visning.trumf !== null) {
    const tIdx = FARGER.indexOf(visning.trumf);
    inn[TRUMF_UTE] = inn[SKJULTE_I_FARGE + tIdx]!;
  }

  // Stikket akkurat nå: hvem leder, er lederen trumf, og kan jeg slå?
  if (visning.bord.length > 0 && visning.trumf !== null) {
    const trumf = visning.trumf;
    const ledFarge = visning.bord[0]!.kort.farge;
    let beste = visning.bord[0]!;
    for (const kp of visning.bord) {
      if (slårPå(kp.kort, beste.kort, trumf, ledFarge)) beste = kp;
    }
    inn[STIKKLEDER + rel(beste.spiller)] = 1;
    if (beste.kort.farge === trumf) inn[BESTE_ER_TRUMF] = 1;
    const kandidater = visning.lovligeKort.length > 0 ? visning.lovligeKort : visning.dinHånd;
    if (kandidater.some((k) => slårPå(k, beste.kort, trumf, ledFarge))) inn[KAN_SLÅ] = 1;
  }

  return inn;
}

function harVerdi(hånd: readonly Kort[], farge: Farge, verdi: number): boolean {
  return hånd.some((k) => k.farge === farge && k.verdi === verdi);
}

/** Slår `ny` det beste kortet så langt i stikket? (Samme regel som motoren.) */
function slårPå(ny: Kort, beste: Kort, trumf: Farge, ledFarge: Farge): boolean {
  const nyT = ny.farge === trumf;
  const bT = beste.farge === trumf;
  if (nyT !== bT) return nyT;
  if (nyT) return ny.verdi > beste.verdi;
  if (ny.farge !== ledFarge) return false;
  if (beste.farge !== ledFarge) return true;
  return ny.verdi > beste.verdi;
}

function klipp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Farge for trumfutgang nr. i. */
export function trumfFraIndeks(i: number): Farge {
  return FARGER[i]!;
}
