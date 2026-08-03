/**
 * PLANBLOKKEN (v5, indeks 364–375): kontraktsregnskapet, eksplisitt.
 *
 * HULLET, og det er et annet slag enn de tre foregående. Minne-, telle- og
 * auksjonsblokken ga nettet NY informasjon. Denne gir det ingenting nytt – alle
 * tolv trekkene er regnet ut av trekk nettet allerede har. Den gir det
 * REGNESTYKKET.
 *
 * Nettet ser budet (225), lagets stikk så langt (230) og stikk igjen å spille
 * (270). Det ser IKKE:
 *
 *     stikk som mangler   = bud − lagstikk
 *     er kontrakten sikret / matematisk tapt
 *     slakk               = stikk igjen − stikk som mangler
 *
 * Og poengreglene har et BRÅTT HOPP nøyaktig der: `beregnPoeng` gir budlaget
 * ±2n og ±n på `lagStikk >= n`, uten et eneste poeng for overstikk. Det
 * ellevte stikket i en niermelding er altså verdt omtrent ingenting for
 * budlaget – bare de 1/3 differansen det koster forsvaret. Verdien av et stikk
 * faller med en faktor på flere ganger i det øyeblikket kontrakten er i havn,
 * og nettet må lære det bruddet som en subtraksjon det aldri får se.
 *
 * DET SAMME GJELDER FORSVARET, og det er hele Arvinds forsvarsoppdrag:
 * «forsvarer må bli veldig god til å felle kontrakter». En forsvarer som vet
 * «de trenger to stikk til, og tre gjenstår» spiller fundamentalt annerledes
 * enn en som ikke vet det. Tallet er offentlig for alle ved bordet.
 *
 * BLOKKEN ER EN REN FUNKSJON AV DE 364 FØRSTE TREKKENE, ikke av spilltilstanden.
 * Det er et bevisst designvalg med to konsekvenser:
 *
 *   1. Den finnes bare ÉTT sted. `e1SpillTrekk` og datautvidelsen av eksisterende
 *      `sd-v4`-rader kaller samme funksjon, så de kan ikke komme i utakt. Dobbel
 *      implementasjon av trekk har kostet dette prosjektet dyrt før.
 *   2. 278 798 ferdige rader kan utvides på sekunder i stedet for å genereres
 *      på nytt i timevis.
 *
 * LOVLIGHET. Alt er utledet av offentlig informasjon pluss egen hånd: budet er
 * offentlig, `lagStikk` (230) teller bare makkerens stikk når makkeren ER
 * avslørt, og trumfregnskapet bruker samme «hva er fortsatt ute»-logikk som
 * indeks 262–269 alt gjør.
 *
 * INGEN HØY KARDINALITET. Alle tolv er tellinger eller flagg med få verdier.
 * De 52 én-av-kolonnene i minneblokken var en memoreringsfelle (de fungerte som
 * en runde-ID og kostet spillefører −1,475); denne blokken kan ikke feile slik.
 */

/** v4-bredden denne blokken legger seg oppå. */
export const PLAN_FRA = 364;
/** Antall trekk i planblokken. */
export const PLAN_ANTALL = 12;

/** Indeksene blokken leser fra. Samlet her fordi de ER en kontrakt. */
const I_HAAND_FRA = 0; // 0–51: egen hånd
const I_SPILT_FRA = 52; // 52–103: alle åpent spilte kort
const I_TRUMF_FRA = 220; // 220–223: trumffargen, 224 = ingen trumf
const I_BUD = 225;
const I_PAA_BUDLAG = 227;
const I_LAGSTIKK = 230;
const I_STIKK_IGJEN = 270; // BASIS + 32

/**
 * Fyller indeks 364–375 i `v`, som allerede må ha de 364 første trekkene satt.
 *
 * Normaliseringen deler på 13 som resten av kodingen, så «to stikk» betyr det
 * samme her som i 229 og 230.
 */
export function fyllPlanblokk(v: Float32Array): void {
  const bud = Math.round((v[I_BUD] ?? 0) * 13);
  const lagStikk = Math.round((v[I_LAGSTIKK] ?? 0) * 13);
  const igjen = Math.round((v[I_STIKK_IGJEN] ?? 0) * 13);
  const påBudlag = (v[I_PAA_BUDLAG] ?? 0) > 0.5;

  // Trumffargen, eller −1 ved grand.
  let trumf = -1;
  for (let f = 0; f < 4; f++) if ((v[I_TRUMF_FRA + f] ?? 0) > 0.5) trumf = f;

  let mineTrumf = 0;
  let spilteTrumf = 0;
  if (trumf >= 0) {
    for (let i = 0; i < 13; i++) {
      if ((v[I_HAAND_FRA + trumf * 13 + i] ?? 0) > 0.5) mineTrumf++;
      if ((v[I_SPILT_FRA + trumf * 13 + i] ?? 0) > 0.5) spilteTrumf++;
    }
  }
  // Trumf som verken er min eller er spilt – altså det motparten kan ha.
  // «Ute» her betyr det samme som i 262–269: ikke sett, ikke i egen hånd.
  const trumfUte = trumf >= 0 ? Math.max(0, 13 - mineTrumf - spilteTrumf) : 0;

  // MANGLER er budlagets regnestykke, og det er OFFENTLIG. Forsvarerne skal ha
  // nøyaktig samme tall – det er dét «felle kontrakten» betyr operasjonelt.
  const mangler = Math.max(0, bud - lagStikk);
  const slakk = igjen - mangler;

  const p = PLAN_FRA;
  v[p + 0] = mangler / 13;
  v[p + 1] = igjen / 13;
  // 366: slakk, med fortegn bevart og klippet til [−1, 1]. Negativ slakk betyr
  // at kontrakten ikke lenger KAN klares.
  v[p + 2] = Math.max(-1, Math.min(1, slakk / 13));
  // 367: kontrakten er i havn. Etter dette er flere stikk nesten verdiløse for
  // budlaget – de gir null i seg selv, bare 1/3 i differanse fra å nekte
  // forsvaret et stikk.
  v[p + 3] = bud > 0 && lagStikk >= bud ? 1 : 0;
  // 368: kontrakten er matematisk tapt.
  v[p + 4] = bud > 0 && mangler > igjen ? 1 : 0;
  // 369: den kan fortsatt akkurat klares, uten et eneste stikk til overs.
  v[p + 5] = bud > 0 && mangler === igjen && mangler > 0 ? 1 : 0;
  // 370–371: samme regnskap sett fra MIN side av bordet. Et flagg alene er ikke
  // nok – nettet må kunne skille «vi er i havn» fra «de er i havn».
  v[p + 6] = påBudlag ? 1 : 0;
  v[p + 7] = påBudlag ? v[p + 3]! : v[p + 4]!;
  // 372: trumf motparten fortsatt kan ha.
  v[p + 8] = trumfUte / 13;
  // 373: egne trumf.
  v[p + 9] = mineTrumf / 13;
  // 374: har jeg flere trumf enn det som er ute? Da er trumfen trukket, og
  // «trekk trumf»-planen er ferdig.
  v[p + 10] = trumf >= 0 && mineTrumf > trumfUte ? 1 : 0;
  // 375: er det trumf i det hele tatt (grand-flagget, positivt formulert).
  v[p + 11] = trumf >= 0 ? 1 : 0;
}
