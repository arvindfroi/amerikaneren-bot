/**
 * ELO FOR FIRESPILLERBORD – ratinggrunnlaget for D7s liga.
 *
 * Arvinds forslag: legg om fra cup til liga, og la fitness være Elo. Det
 * angriper støyen ved rota, og det er godt begrunnet: cupdybden er ETT
 * knockout-utfall per generasjon, mens en liga gir hvert genom mange kamper
 * mot mange motstandere.
 *
 * TRE TING SOM MÅ LØSES, OG HVORDAN:
 *
 * 1. ELO ER DEFINERT FOR 1-MOT-1. Ved et firespillerbord finnes ingen
 *    «motstander» – det sitter tre. Løsningen her er den vanlige for
 *    flerspiller: hver deltaker vurderes mot FELTETS snitt. Forventet score
 *    beregnes mot snittratingen av de tre andre, og faktisk score er hvor
 *    stor andel av bordets poeng man tok. Det faller tilbake til klassisk
 *    Elo når n = 2.
 *
 *    Merk at `poeng` i turneringen allerede er «egne kamppoeng minus snittet
 *    av motstandernes» – altså nøyaktig den relative størrelsen Elo trenger.
 *
 * 2. RATING MÅ ARVES. En ny generasjon består av nye genomer, og en rating
 *    bygget på null kamper er verdiløs. Barnet arver derfor forelderens
 *    rating som PRIOR, og får høyere K de første kampene (usikkerheten er
 *    større). Det er også dette som gir Arvinds «kontinuerlige forbedring»:
 *    ratingen bærer informasjon på tvers av generasjoner, i motsetning til
 *    cupdybden som nullstilles hver gang.
 *
 * 3. ELO ANTAR TRANSITIVITET. Kortspillstrategier kan være intransitive
 *    (A slår B slår C slår A), og da vil ratingen midle over noe som ikke er
 *    en enkelt akse. Det er en reell begrensning, ikke en detalj – men den
 *    rammer også enhver annen skalar fitness, inkludert dagens. Ligaen gjør
 *    den i det minste synlig: intransitivitet gir ustabile ratinger som
 *    svinger uten å konvergere, og det kan måles.
 */

/** K-faktor for et etablert genom. Lav = stabil, høy = raskt responsiv. */
export const K_ETABLERT = 16;
/** K-faktor for de første kampene, der ratingen er mest usikker. */
export const K_NY = 48;
/** Kamper før et genom regnes som etablert. */
export const ETABLERT_ETTER = 12;
/** Startrating for et genom uten forelder. */
export const START_RATING = 1500;

export interface Rating {
  rating: number;
  kamper: number;
}

export function nyRating(fraForelder?: Rating): Rating {
  // Barnet arver forelderens NIVÅ, men ikke dens sikkerhet: kamptelleren
  // starter på null, så de første resultatene får full vekt. Uten det ville
  // et barn med en dårlig mutasjon beholdt forelderens rating altfor lenge.
  return { rating: fraForelder?.rating ?? START_RATING, kamper: 0 };
}

function k(r: Rating): number {
  return r.kamper < ETABLERT_ETTER ? K_NY : K_ETABLERT;
}

/** Forventet andel av bordets poeng, gitt egen rating mot snittet av resten. */
export function forventet(egen: number, motstandere: readonly number[]): number {
  if (motstandere.length === 0) return 0.5;
  const snitt = motstandere.reduce((a, b) => a + b, 0) / motstandere.length;
  return 1 / (1 + Math.pow(10, (snitt - egen) / 400));
}

/**
 * Oppdaterer ratingene etter ett bord. `andel[i]` er spiller i sin andel av
 * bordets samlede utbytte, normalisert slik at summen er 1.
 *
 * Bruk poengDIFFERANSE, ikke rå poengsum: differansen er allerede relativ
 * til motstanderne, og det er den ligaen skal måle.
 */
export function oppdaterBord(ratinger: Rating[], andel: readonly number[]): void {
  if (ratinger.length !== andel.length) {
    throw new Error(`${ratinger.length} ratinger mot ${andel.length} andeler`);
  }
  const n = ratinger.length;
  if (n < 2) return;
  // Alle oppdateringer regnes fra ratingene FØR bordet, ellers ville
  // rekkefølgen på spillerne påvirket resultatet.
  const før = ratinger.map((r) => r.rating);
  for (let i = 0; i < n; i++) {
    const andre = før.filter((_, j) => j !== i);
    const e = forventet(før[i]!, andre);
    // Med n spillere er «uavgjort» 1/n, ikke 1/2. Skaler faktisk og forventet
    // til samme akse før de sammenlignes.
    const faktisk = andel[i]! * (n / 2);
    const forventetSkalert = e;
    ratinger[i]!.rating += k(ratinger[i]!) * (faktisk - forventetSkalert);
    ratinger[i]!.kamper++;
  }
}

/**
 * Gjør poengdifferanser om til andeler som summerer til 1.
 *
 * Softmax-fri og monoton: laveste differanse får 0, og resten fordeles
 * proporsjonalt. Er alle like, deles det likt – som et uavgjort bord skal.
 */
export function andelerFraPoeng(poeng: readonly number[]): number[] {
  const n = poeng.length;
  if (n === 0) return [];
  const min = Math.min(...poeng);
  const forskjøvet = poeng.map((p) => p - min);
  const sum = forskjøvet.reduce((a, b) => a + b, 0);
  if (sum <= 1e-12) return new Array<number>(n).fill(1 / n);
  return forskjøvet.map((p) => p / sum);
}
