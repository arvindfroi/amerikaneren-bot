/**
 * SYNLIG INFORMASJON og GARANTERTE STIKK – ett sted, brukt av både målingen
 * og spillerne.
 *
 * Logikken ble skrevet første gang i `examples/mesterai-atferd.ts` for å måle
 * hvor ofte en kandidat brenner materiale på et stikk laget alt hadde. Skal en
 * VAKT rette den samme feilen under spill, må den avgjøre nøyaktig det samme
 * spørsmålet på nøyaktig samme måte – ellers måler atferdsprofilen én ting og
 * vakten gjør en annen, og ingen av tallene betyr noe. Derfor bor logikken her
 * og importeres begge steder.
 *
 * TO NIVÅER, NØSTET:
 *
 *   FASIT (`garantertFasit`)  motorens fulle informasjon: ingen gjenstående
 *       motstander har et LOVLIG kort som slår det som ligger. Eksakt – men en
 *       fasit spilleren selv ikke kunne ha sett. BARE for måling; en agent som
 *       bruker den jukser.
 *
 *   SYNLIG (`garantertSynlig`)  bare det spilleren kan vite: egen hånd, alt
 *       som er spilt, eget vrak (bare budvinneren ser sitt) og renonser som er
 *       AVSLØRT i tidligere stikk. Alt annet antas å kunne ligge hos en
 *       motstander – også vrakets fire kort, for alle andre enn budvinneren.
 *       Konservativ: sier den «garantert», hadde spilleren grunnlag for å se
 *       det. Dette er nivået en agent har lov til å bruke.
 *
 * Synlig garanti medfører alltid fasit-garanti. Differansen er «skjult
 * garanti»: stikk som VAR sikret uten at spilleren kunne vite det.
 */

import { kortId, likeKort, nyStokk, type Farge, type Kort } from "../kort.ts";
import { lovligeKort, stikkvinner, type GameState } from "../motor.ts";

/** Setene som ennå ikke har lagt kort i dette stikket (utenom `sete` selv). */
export function gjenstående(s: GameState, sete: number): number[] {
  const lagt = new Set<number>(s.bord.map((b) => b.spiller));
  lagt.add(sete);
  const ut: number[] = [];
  for (let i = 0; i < s.antallSpillere; i++) if (!lagt.has(i)) ut.push(i);
  return ut;
}

/** Ville `kort` slått det kortet som leder stikket akkurat nå? */
export function slårLedende(s: GameState, kort: Kort): boolean {
  const MERKE = -1; // ikke et sete – bare en etikett stikkvinner kan gi tilbake
  return stikkvinner(s.bord.concat({ spiller: MERKE, kort }), s.trumf!) === MERKE;
}

/** FASIT: kan noen av de gjenstående motstanderne fortsatt overta stikket? */
export function garantertFasit(s: GameState, sete: number, våre: readonly number[]): boolean {
  for (const m of gjenstående(s, sete)) {
    if (våre.includes(m)) continue;
    for (const k of lovligeKort(s, m)) if (slårLedende(s, k)) return false;
  }
  return true;
}

/** Farger en spiller har VIST at han er renons i (kastet av i fargen som ble ledet). */
export function avslørteRenonser(s: GameState): Map<number, Set<Farge>> {
  const ut = new Map<number, Set<Farge>>();
  const legg = (sp: number, f: Farge): void => {
    const sett = ut.get(sp) ?? new Set<Farge>();
    sett.add(f);
    ut.set(sp, sett);
  };
  const seStikk = (kort: readonly { spiller: number; kort: Kort }[]): void => {
    if (kort.length === 0) return;
    const led = kort[0]!.kort.farge;
    for (const kp of kort) if (kp.kort.farge !== led) legg(kp.spiller, led);
  };
  for (const stikk of s.historikk) seStikk(stikk.kort);
  seStikk(s.bord);
  return ut;
}

/**
 * Kortene `sete` ikke kan utelukke at en motstander sitter med: hele stokken
 * minus egen hånd, minus alt som er spilt, minus eget vrak. For alle andre enn
 * budvinneren er vrakets fire kort usett, og de teller derfor med som mulige
 * motstanderkort. Det gjør vurderingen konservativ, aldri for optimistisk.
 */
export function ukjenteKort(s: GameState, sete: number): Kort[] {
  const sett = new Set<string>();
  for (const k of s.hender[sete] ?? []) sett.add(kortId(k));
  for (const stikk of s.historikk) for (const kp of stikk.kort) sett.add(kortId(kp.kort));
  for (const kp of s.bord) sett.add(kortId(kp.kort));
  if (sete === s.budvinner) for (const k of s.vrak) sett.add(kortId(k));
  return nyStokk().filter((k) => !sett.has(kortId(k)));
}

/** SYNLIG: er stikket sikret ut fra bare det `sete` selv kan vite? */
export function garantertSynlig(s: GameState, sete: number, våre: readonly number[]): boolean {
  const truende = ukjenteKort(s, sete).filter((k) => slårLedende(s, k));
  if (truende.length === 0) return true;
  const renons = avslørteRenonser(s);
  for (const m of gjenstående(s, sete)) {
    if (våre.includes(m)) continue;
    const hans = renons.get(m) ?? new Set<Farge>();
    // Følgeplikt kan vi ikke bruke her – vi kan ikke VITE at han har fargen.
    if (truende.some((k) => !hans.has(k.farge))) return false;
  }
  return true;
}

/**
 * Hva koster det å bli kvitt kortet? Et sidekort går alltid foran en trumf –
 * å brenne trumf i et stikk laget alt har er dyrere enn å kaste en toer i en
 * sidefarge, uansett valør – og innenfor det avgjør valøren.
 */
export function pris(k: Kort, trumf: Farge): number {
  return (k.farge === trumf ? 100 : 0) + k.verdi;
}

/** Det billigste kortet i utvalget etter `pris`. Utvalget må være ikke-tomt. */
export function billigste(kort: readonly Kort[], trumf: Farge): Kort {
  return kort.reduce((a, b) => (pris(b, trumf) < pris(a, trumf) ? b : a));
}

/** Det dyreste kortet i utvalget etter `pris` – høyeste trumf før høyeste sidekort. */
export function dyreste(kort: readonly Kort[], trumf: Farge): Kort {
  return kort.reduce((a, b) => (pris(b, trumf) > pris(a, trumf) ? b : a));
}

/**
 * LAGET SETT FRA `sete`, med bare synlig informasjon.
 *
 * Budvinneren er offentlig. Makkeren er skjult til det etterlyste kortet
 * legges (`makkerAvslørt`) – men den som selv SITTER med kortet vet fra første
 * stikk at han er makker. Vet ikke spilleren hvem som er på hvilket lag,
 * returneres null, og den som spør må la være å bruke lagkunnskap.
 *
 * `state.makker` leses BARE når `makkerAvslørt` er sann, så funksjonen lekker
 * ingen informasjon en spiller ikke har.
 */
export function lagetSynlig(s: GameState, sete: number): number[] | null {
  const bv = s.budvinner;
  if (bv === null) return null;
  const alle = Array.from({ length: s.antallSpillere }, (_, i) => i);
  // Solo/amerikaner uten etterlysning: budvinneren spiller alene, og det er
  // offentlig kjent fra meldingen.
  if (s.etterlyst === null) return sete === bv ? [bv] : alle.filter((i) => i !== bv);
  const makker = s.makkerAvslørt ? s.makker : null;
  if (makker === null) {
    const egen = s.hender[sete] ?? [];
    if (egen.some((k) => likeKort(k, s.etterlyst!))) return [sete, bv]; // jeg ER makkeren
    return null; // ingen andre kan vite hvem makkeren er ennå
  }
  if (sete === bv || sete === makker) return [bv, makker];
  return alle.filter((i) => i !== bv && i !== makker);
}

/**
 * Tar det etterlyste kortet stikk 1 hvis spilleføreren åpner med `utspill`?
 *
 * MÅLEFUNKSJON – bruker `s.makker` (fasit) og de andres hender, og skal derfor
 * ikke kalles fra en agent.
 *
 * Deterministisk, uten å gjette hva noen VIL gjøre:
 *   1. Makkeren MÅ legge det etterlyste kortet hvis makkerplikten treffer
 *      (`lovligeKort` gir da bare det ene kortet). Gjør den ikke det, kommer
 *      kortet ikke ned, og svaret er nei.
 *   2. Utspillet må ikke selv slå det.
 *   3. Ingen av de to forsvarerne må ha et LOVLIG kort som slår det.
 * Da står stikket til makkeren uansett hva de andre finner på.
 */
export function etterlystTarStikket(s: GameState, sete: number, utspill: Kort): boolean {
  const etterlyst = s.etterlyst;
  const makker = s.makker;
  if (etterlyst === null || makker === null || makker === sete) return false;
  const åpnet: GameState = { ...s, bord: [{ spiller: sete, kort: utspill }] };
  const makkerLov = lovligeKort(åpnet, makker);
  if (!(makkerLov.length === 1 && likeKort(makkerLov[0]!, etterlyst))) return false;
  const medEtterlyst = åpnet.bord.concat({ spiller: makker, kort: etterlyst });
  if (stikkvinner(medEtterlyst, s.trumf!) !== makker) return false;
  for (let d = 0; d < s.antallSpillere; d++) {
    if (d === sete || d === makker) continue;
    for (const k of lovligeKort(åpnet, d)) {
      if (stikkvinner(medEtterlyst.concat({ spiller: d, kort: k }), s.trumf!) === d) return false;
    }
  }
  return true;
}
