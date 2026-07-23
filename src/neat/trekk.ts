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
export const ANTALL_INN = 253;

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

  return inn;
}

function klipp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Farge for trumfutgang nr. i. */
export function trumfFraIndeks(i: number): Farge {
  return FARGER[i]!;
}
