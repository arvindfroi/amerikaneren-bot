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
import { estimerStikk } from "../nevro/agent.ts";

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
// --- Lagspill-sensorer (privat, men lovlig, lagkunnskap) ---
// Den hemmelige makkeren VET selv at den er makker (holder det etterlyste
// kortet) lenge før avsløringen – og alle vet med sikkerhet om de er
// forsvarere. Uten disse eksplisitt måtte nettet komponere «etterlyst = X»
// × «jeg holder X» over 52 kort – i praksis udiskuterbart for evolusjonen.
const ER_HEMMELIG_MAKKER = 280; // 1: jeg er makkeren (holder etterlyst / avslørt)
const PÅ_BUDLAGET = 281; //       1: jeg er på budlaget (budvinner eller makker)
const ER_FORSVARER = 282; //      1: jeg er forsvarer (med visshet)
const LAG_STIKK_PRIVAT = 283; //  1: budlagets stikk inkl. egen private kunnskap
const MANGLER_STIKK = 284; //     1: stikk kontrakten fortsatt mangler (/antallStikk)
const MAKKER_KJENT = 285; //      1: makkeren er offentlig avslørt
// --- Budhistorikk: hvem meldte hva (styrkesignal rundt bordet) ---
const BUD_HIST = 286; //          4: hver spillers høyeste bud (rel. seter, /antallStikk; am/solo=1)
// --- Lag i stikket: hvem av oss/dem har spilt og leder akkurat nå ---
const MAKKER_SPILT = 290; //      1: kjent lagkamerat har lagt kort i stikket
const MAKKER_LEDER = 291; //      1: kjent lagkamerat vinner stikket akkurat nå
const FIENDE_LEDER = 292; //      1: kjent motstander vinner stikket akkurat nå
// --- Trumfkontroll: trumfen slår alle andre farger, og lengde = kontroll ---
// Uten disse eksplisitt måtte nettet utlede «jeg kan trumfe her» av (renons i
// utspillsfargen) × (har trumf) over 4 farger, og «bør trekke trumf» av
// (på budlaget) × (motstandere har trumf igjen) – dyrt å komponere.
const MINE_TRUMF = 293; //        1: antall trumf på egen hånd (/antallStikk)
const KAN_TRUMFE = 294; //        1: renons i utspillsfargen + har trumf (kan stjele stikket)
const TRUMF_BOSS = 295; //        1: jeg holder høyeste LEVENDE trumf (topp trumfkontroll)
const TREKK_TRUMF = 296; //       1: på budlaget OG levende trumf ute hos andre (bør trekkes)
// --- Håndvurdering (D2): hva er hånden verdt med HVER farge som trumf? ---
// MÅLT blindsone: å låne bort trumfvalget til NevroHjerne løftet D1s gull
// 32,4 ± 3,0 poeng/kamp – 32 av et samlet gap på 41,7. NevroHjerne bruker
// ikke nett til trumfvalget i det hele tatt, men en håndlagd formel
// (estimerStikk). D1 måtte utlede det samme av 52 rå kortbiter og fire
// fargelengder, med ~1 150 vekter delt på HELE spillet.
// Her serveres formelen som sensorer: nettet står fritt til å bruke dem,
// avvike fra dem eller ignorere dem – men slipper å gjenoppfinne dem.
const EST_STIKK = 297; //         4: estimerte lagstikk med hver farge som trumf (/12)
const EST_BESTE = 301; //         1: beste fargeestimat (/12)
const EST_ARGMAX = 302; //        4: one-hot – hvilken farge estimatet peker på
const ESS = 306; //               1: antall ess (/4)
const KONGER = 307; //            1: antall konger (/4)
const RENONS_EGEN = 308; //       1: antall egne renonsfarger (/3)
const SINGELTON_EGEN = 309; //    1: antall egne singeltonfarger (/3)
const LENGSTE = 310; //           1: lengste farge (/8)
// --- Sekvenser og fargefordeling (D5) --------------------------------------
// Arvinds observasjon: i vraking og budgivning teller hvor mange SORTER man
// har og hvor lange SERIER man sitter med. Fargelengdene fantes (164–167),
// men sekvenser var ikke kodet i det hele tatt – og de er noe helt annet enn
// lengde: K-Q-J er tre kort som tvinger ut esset og gir to sikre stikk,
// mens K-8-3 er tre kort som gir ett usikkert. Uten dette måtte nettet
// utlede «sammenhengende valører» av 52 uavhengige kortbiter, som er
// nøyaktig den typen komposisjon evolusjonen ikke finner (jf. D2s ubrukte
// håndvurdering).
const SEKVENS = 311; //           4: lengste sammenhengende serie per farge (/6)
const TOPPSEKVENS = 315; //       1: lengste serie regnet FRA esset og ned (/6)
const ANTALL_SEKVENSER = 316; //  1: antall serier på ≥ 2 kort (/6)
const SORTER = 317; //            1: antall farger man har kort i (/4)
export const ANTALL_INN = 318;

const BESLUTNINGER: readonly Beslutning[] = ["BUD", "VRAK", "VELG", "SPILL"];

/**
 * Inngangsgrupper [fra, til) for genom-analyse: hvilke sensorfamilier et
 * genom faktisk har koblet på, brukes til å forklare fitnessvariasjon
 * (se examples/neat-forklar.ts).
 */
export const SENSORGRUPPER = {
  hånd: [HÅND, HÅND + 52],
  historikk: [SETT, SETT + 52],
  renons: [RENONS, RENONS + 12],
  bossTelling: [SKJULTE_I_FARGE, TRUMF_UTE + 1],
  taktikk: [BESTE_ER_TRUMF, STIKKLEDER + 4],
  lagspill: [ER_HEMMELIG_MAKKER, MAKKER_KJENT + 1],
  budhistorikk: [BUD_HIST, BUD_HIST + 4],
  lagstikk: [MAKKER_SPILT, FIENDE_LEDER + 1],
  trumfkontroll: [MINE_TRUMF, TREKK_TRUMF + 1],
  håndvurdering: [EST_STIKK, LENGSTE + 1],
  sekvenser: [SEKVENS, SORTER + 1],
} as const;

// --- Utgangslayout ----------------------------------------------------------
/** xT-median – forventet antall lagstikk gitt hånden (skalert av agenten). */
export const UT_XT = 0;
/** Tilbøyelighet til å melde Amerikaner. */
export const UT_AMERIKANER = 1;
/** Tilbøyelighet til å melde solo-amerikaner. */
export const UT_SOLO = 2;
/** Budmargin: lært aggressivitet (skyver EV-terskelen i budvalget). */
export const UT_MARGIN = 3;
/** 4 trumffarge-verdier (S,H,R,K). */
export const UT_TRUMF = 4;
/** 52 kortverdier: brukes til vraking, etterlysning og kortspill. */
export const UT_KORT = 8;
/**
 * Fordelings-hoder: hånden ved budøyeblikket er ikke alene indikativ for
 * lagstikkene – talongen kommer og makkeren produserer stikk. Nettet
 * forutsier derfor en FORDELING (20 %- og 80 %-kvantil rundt medianen), og
 * budet velges EV-maksimerende over den. UT_MAKKER lærer makkerens bidrag
 * separat (hjelpeoppgave med egen fasit: makkerens faktiske stikk).
 */
export const UT_XT_LAV = 60;
export const UT_XT_HØY = 61;
export const UT_MAKKER = 62;
export const ANTALL_UT = 63;

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

  // Håndvurdering: samme formel NevroHjerne og MesterAI bruker til trumfvalg.
  // Beregnes én gang per beslutning – 4 farger × en håndgjennomgang.
  {
    const hånd = visning.dinHånd;
    let beste = -Infinity;
    let besteF = 0;
    for (let f = 0; f < 4; f++) {
      const e = estimerStikk(hånd, FARGER[f]!);
      inn[EST_STIKK + f] = Math.min(1, e / 12);
      if (e > beste) {
        beste = e;
        besteF = f;
      }
    }
    inn[EST_BESTE] = Math.min(1, Math.max(0, beste) / 12);
    inn[EST_ARGMAX + besteF] = 1;
    let ess = 0;
    let konger = 0;
    const lengder = [0, 0, 0, 0];
    for (const k of hånd) {
      if (k.verdi === 14) ess++;
      else if (k.verdi === 13) konger++;
      lengder[FARGER.indexOf(k.farge)]!++;
    }
    inn[ESS] = ess / 4;
    inn[KONGER] = konger / 4;
    inn[RENONS_EGEN] = lengder.filter((x) => x === 0).length / 3;
    inn[SINGELTON_EGEN] = lengder.filter((x) => x === 1).length / 3;
    inn[LENGSTE] = Math.min(1, Math.max(...lengder) / 8);

    // Sekvenser: sammenhengende valører i samme farge. Regnes per farge fra
    // høyeste valør og ned, så en «serie» er kort som følger rett etter
    // hverandre (K-Q-J), ikke bare kort i samme farge.
    let flestSerier = 0;
    let toppSerie = 0;
    let sorter = 0;
    for (let f = 0; f < 4; f++) {
      const farge = FARGER[f]!;
      const verdier = hånd.filter((k) => k.farge === farge).map((k) => k.verdi).sort((a, b) => b - a);
      if (verdier.length > 0) sorter++;
      let beste = verdier.length > 0 ? 1 : 0;
      let løpende = beste;
      for (let i = 1; i < verdier.length; i++) {
        løpende = verdier[i]! === verdier[i - 1]! - 1 ? løpende + 1 : 1;
        if (løpende > beste) beste = løpende;
      }
      inn[SEKVENS + f] = Math.min(1, beste / 6);
      if (beste >= 2) flestSerier++;
      // Topp-serien starter på esset: A-K-Q er umiddelbare stikk, K-Q-J ikke.
      if (verdier[0] === 14) {
        let n = 1;
        while (n < verdier.length && verdier[n]! === verdier[n - 1]! - 1) n++;
        if (n > toppSerie) toppSerie = n;
      }
    }
    inn[TOPPSEKVENS] = Math.min(1, toppSerie / 6);
    inn[ANTALL_SEKVENSER] = Math.min(1, flestSerier / 6);
    inn[SORTER] = sorter / 4;
  }

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
    const b = visning.budrunde.sisteBud[s];
    if (b != null) inn[BUD_HIST + rel(s)] = typeof b === "number" ? b / antallStikk : 1;
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

  // --- Lagspill: privat (men lovlig) lagkunnskap ----------------------------
  // Den hemmelige makkeren kjenner seg selv: den holder det etterlyste
  // kortet. Forsvarere vet med visshet at de er forsvarere (de holder det
  // ikke og er ikke budvinner). Budvinneren vet at den har ET lag, men ikke
  // hvem – nøyaktig som informasjonen ligger i spillet.
  // Kjente lagkamerater/motstandere sett fra MEG (fylles i lagspill-blokken,
  // brukes også av stikk-sensorene under).
  const lagVenner = new Set<number>();
  const lagFiender = new Set<number>();
  if (visning.budvinner !== null && visning.melding !== null) {
    const erBudvinner = visning.budvinner === meg;
    const holderEtterlyst =
      visning.etterlyst !== null &&
      visning.dinHånd.some(
        (k) => k.farge === visning.etterlyst!.farge && k.verdi === visning.etterlyst!.verdi,
      );
    const erMakker = visning.makker === meg || (holderEtterlyst && !erBudvinner);
    const soloUtenMakker = visning.melding.type === "solo" || visning.etterlyst === null;
    if (erMakker) inn[ER_HEMMELIG_MAKKER] = 1;
    if (erBudvinner || erMakker) inn[PÅ_BUDLAGET] = 1;
    else inn[ER_FORSVARER] = 1;
    // Hvem vet jeg med SIKKERHET er med/mot meg? Den hemmelige makkeren vet
    // alt; budvinneren vet først alt når makkeren er avslørt (eller ved
    // solo); forsvarere kjenner budvinneren, og resten etter avsløring.
    if (erMakker) {
      lagVenner.add(visning.budvinner);
      for (let s = 0; s < n; s++) {
        if (s !== meg && s !== visning.budvinner) lagFiender.add(s);
      }
    } else if (erBudvinner) {
      if (visning.makker !== null && visning.makker !== meg) lagVenner.add(visning.makker);
      if (visning.makker !== null || soloUtenMakker) {
        for (let s = 0; s < n; s++) {
          if (s !== meg && !lagVenner.has(s)) lagFiender.add(s);
        }
      }
    } else {
      lagFiender.add(visning.budvinner);
      if (visning.makker !== null) lagFiender.add(visning.makker);
      if (visning.makker !== null || soloUtenMakker) {
        for (let s = 0; s < n; s++) {
          if (s !== meg && !lagFiender.has(s)) lagVenner.add(s);
        }
      }
    }
    for (const kp of visning.bord) {
      if (lagVenner.has(kp.spiller)) inn[MAKKER_SPILT] = 1;
    }
    // Lagets stikk sett med MIN kunnskap: budvinners + avslørt makkers +
    // (mine, hvis jeg er den uavslørte makkeren).
    let lag = visning.stikkVunnet[visning.budvinner] ?? 0;
    if (visning.makker !== null && visning.makker !== visning.budvinner) {
      lag += visning.stikkVunnet[visning.makker] ?? 0;
    } else if (erMakker && !soloUtenMakker) {
      lag += visning.stikkVunnet[meg] ?? 0;
    }
    inn[LAG_STIKK_PRIVAT] = lag / antallStikk;
    const mål = visning.melding.type === "tall" ? visning.melding.bud : antallStikk;
    inn[MANGLER_STIKK] = klipp01((mål - lag) / antallStikk);
    if (visning.makker !== null) inn[MAKKER_KJENT] = 1;
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
    if (lagVenner.has(beste.spiller)) inn[MAKKER_LEDER] = 1;
    if (lagFiender.has(beste.spiller)) inn[FIENDE_LEDER] = 1;
    const kandidater = visning.lovligeKort.length > 0 ? visning.lovligeKort : visning.dinHånd;
    if (kandidater.some((k) => slårPå(k, beste.kort, trumf, ledFarge))) inn[KAN_SLÅ] = 1;
  }

  // --- Trumfkontroll ---------------------------------------------------------
  // Trumfen slår alle andre farger; lengde og topp-trumf = kontroll over spillet.
  if (visning.trumf !== null) {
    const trumf = visning.trumf;
    const tIdx = FARGER.indexOf(trumf);
    inn[MINE_TRUMF] = klipp01(mineIFarge[trumf]! / antallStikk);
    // Jeg holder høyeste levende trumf? (samme deduksjon som BOSS)
    if (inn[BOSS + tIdx] === 1) inn[TRUMF_BOSS] = 1;
    // Bør trekke trumf: på budlaget og levende trumf fortsatt ute hos andre.
    if (inn[PÅ_BUDLAGET] === 1 && inn[TRUMF_UTE]! > 0) inn[TREKK_TRUMF] = 1;
    // Kan trumfe: renons i utspillsfargen (som ikke er trumf) og har trumf.
    if (visning.bord.length > 0) {
      const ledFarge = visning.bord[0]!.kort.farge;
      const renonsILed = !visning.dinHånd.some((k) => k.farge === ledFarge);
      if (ledFarge !== trumf && renonsILed && mineIFarge[trumf]! > 0) inn[KAN_TRUMFE] = 1;
    }
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
