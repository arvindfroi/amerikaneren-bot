/**
 * «HVILKET KORT HAR JEG MINST BRUK FOR?» – Arvinds definisjon, implementert.
 *
 * ===================== HVORFOR `billigste` IKKE HOLDER =====================
 *
 * `billigste` i `synlig.ts` rangerer på pris: trumf koster 100 + valør,
 * sidekort koster valøren. Det gjør den til en ren VALØRREGEL. Den kaster
 * alltid den laveste toeren, uansett hvilken farge den ligger i og uansett
 * hva hånden ellers ser ut som.
 *
 * Arvind, om vakt `k`: «dette burde gi utslag hvis den vet hva "billigste"
 * betyr i denne sammenhengen. Det bør enten være å legge på det laveste man
 * har i serien / forsøke å bli kvitt en annen serie (hvis man har trumf) /
 * spare på kort med høy valør eller serier som tvinger frem trumfen til
 * motstandere. billig her betyr egentlig "jeg kan ikke ta stikket så hvilket
 * lovlige kort har jeg minst bruk for"»
 *
 * Det er fire krav, og bare det første er valør:
 *
 *   1. lavest i serien       – innenfor en farge, kast nedenfra
 *   2. tøm en farge          – MEN BARE hvis vi har trumf igjen. En renons
 *                              uten trumf å bruke den med er verdiløs.
 *   3. spar høy valør        – ess og konge er stikk senere
 *   4. spar serier som       – K-D-K-nedover tvinger ut trumf hos motparten;
 *      tvinger ut trumf         å bryte den opp gir bort det presset
 *
 * Kravene 2 og 3 kan trekke i hver sin retning: den korteste fargen kan være
 * den med esset i. Derfor vektes de i stedet for å ordnes strengt, og vektene
 * står som TALL her slik at de kan endres og måles – ikke gjemmes i en
 * sorteringsrekkefølge der ingen ser dem.
 *
 * ========================= HVA SOM IKKE ER MED =============================
 *
 * Signalering. Ingen medspiller i denne motoren leser valøren på et tapt kort,
 * så det finnes ingen skjult verdi å ødelegge – men det finnes heller ingen å
 * bygge. Arvind om `l`: «den gir marginale retur, men kommuniserer og funker
 * en sjelden gang.» Kommunikasjonsdelen kan ikke måles her.
 *
 * Og dette er en HYPOTESE. `k` med `billigste` måler −0,048 ± 0,031 over
 * 11 200 giv. Om den samme betingelsen med et bedre kortvalg måler positivt,
 * er det kortvalget som var feil; måler den også negativt, er det betingelsen.
 * Det er samme oppdeling som skilte `d` fra `e`.
 */

import type { Farge, Kort } from "../kort.ts";

/**
 * Vektene. Skrudd som tall, ikke som rekkefølge, så de kan måles.
 *
 * VALØR er grunnlinjen: 2 koster 2, ess koster 14. Alt annet er tillegg
 * oppå den, og størrelsene er valgt slik at de KAN slå valøren men ikke
 * gjør det automatisk – en toer i en lang farge skal fortsatt ryke før
 * en konge i en kort.
 */
export interface Nyttevekter {
  /** Trekk fra for hvert kort MINDRE vi har i fargen (belønner å tømme). */
  readonly renonsPerManglendeKort: number;
  /** Ekstra for det SISTE kortet i en farge – renonsen fullføres. */
  readonly renonsFullfør: number;
  /** Tillegg for ess og konge utover valøren. */
  readonly høyvalørVern: number;
  /** Tillegg for et kort som inngår i en serie fra toppen av fargen. */
  readonly serievern: number;
}

export const STANDARDVEKTER: Nyttevekter = {
  renonsPerManglendeKort: 1.2,
  renonsFullfør: 4.0,
  høyvalørVern: 3.0,
  serievern: 2.5,
};

/**
 * Nytteverdien av å BEHOLDE kortet. Høy verdi = vil beholde. Kastet blir
 * argmin.
 *
 * `hånd` er hele hånden, ikke bare de lovlige kortene: hvor mange kort vi har
 * igjen i fargen avgjør om et kast bringer oss nærmere renons, og det kan
 * ikke leses av utvalget alene.
 */
export function beholdsverdi(
  k: Kort,
  hånd: readonly Kort[],
  trumf: Farge,
  vekter: Nyttevekter = STANDARDVEKTER,
): number {
  // Trumf beholdes alltid framfor sidekort – samme prinsipp som `pris`, og
  // det er ikke til diskusjon: å brenne trumf i et stikk vi ikke kan ta er
  // det dyreste vi gjør.
  if (k.farge === trumf) return 1000 + k.verdi;

  let v = k.verdi;

  const iFargen = hånd.filter((x) => x.farge === k.farge);
  const harTrumf = hånd.some((x) => x.farge === trumf);

  // KRAV 2: tøm en farge – men bare hvis vi har trumf å bruke renonsen med.
  // Uten trumf er en renons bare en farge vi ikke kan følge i.
  if (harTrumf) {
    // Jo kortere fargen er, jo billigere er det å bli kvitt resten av den.
    v -= vekter.renonsPerManglendeKort * Math.max(0, 5 - iFargen.length);
    if (iFargen.length === 1) v -= vekter.renonsFullfør;
  }

  // KRAV 3: spar ess og konge. De er stikk senere, ikke tall.
  if (k.verdi >= 13) v += vekter.høyvalørVern;

  // KRAV 4: spar serier som tvinger ut trumf. En serie fra toppen – A, A-K,
  // A-K-D ... – tvinger motparten til å trumfe for å ta stikket. Bryter vi
  // den opp, gir vi bort presset. Bare kort som ER i serien vernes; en toer
  // under en A-K-serie er fortsatt fritt vilt.
  if (iSerieFraToppen(k, iFargen)) v += vekter.serievern;

  return v;
}

/**
 * Er kortet en del av en ubrutt serie som starter på ess?
 *
 * A, A-K, A-K-D, A-K-D-J … Serien må starte på ess for å tvinge ut trumf:
 * en K-D uten esset tar ikke stikket mot esset, og tvinger derfor ingenting.
 */
function iSerieFraToppen(k: Kort, iFargen: readonly Kort[]): boolean {
  const verdier = new Set(iFargen.map((x) => x.verdi));
  if (!verdier.has(14)) return false;
  for (let v = 14; v >= k.verdi; v--) {
    if (!verdier.has(v as Kort["verdi"])) return false;
  }
  return true;
}

/**
 * Kortet vi har MINST bruk for blant `utvalg`.
 *
 * Uavgjort brytes av rekkefølgen i `utvalg`, som er deterministisk – hele
 * målebenken forutsetter at agentene er det.
 */
export function minstBrukFor(
  utvalg: readonly Kort[],
  hånd: readonly Kort[],
  trumf: Farge,
  vekter: Nyttevekter = STANDARDVEKTER,
): Kort {
  let beste = utvalg[0]!;
  let bv = beholdsverdi(beste, hånd, trumf, vekter);
  for (const k of utvalg) {
    const v = beholdsverdi(k, hånd, trumf, vekter);
    if (v < bv) {
      bv = v;
      beste = k;
    }
  }
  return beste;
}
