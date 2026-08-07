/**
 * KAMPSTILLING SOM EVNE — risiko styrt av hvor racet står.
 *
 * ARVIND, om et spill til 100 poeng: «har den samme evner som mennesker …
 * hukommelse, strategi, optimalt valg, etc.»
 *
 * Målt: Adams REAGERER på kampstillingen — 6,3 % endrede valg når den ligger
 * langt bak, 5,9 % når den leder. Men vi har aldri målt om endringene er
 * RIKTIGE, og det finnes ingen eksplisitt regel. Nettet har lært et eller annet
 * av 426 kampstillinger i korpuset; hva det er, vet ingen.
 *
 * Dette gjør evnen eksplisitt og målbar.
 *
 * ================= HVORFOR VARIANS ER RIKTIG STØRRELSE ===================
 *
 * I et race til 100 er det ikke poengsnittet som avgjør, men om du kommer
 * FØRST. Ligger du 30 bak med få runder igjen, er en linje med snitt −1 og
 * stor spredning bedre enn en med snitt 0 og ingen: bare halen når målet.
 * Leder du, er det motsatt — da er spredning din fiende.
 *
 * Planen har hatt idéen siden S5 («race-bevisst varians», +0,08, «bygget, ikke
 * koblet»). Den manglet en god variansknott: budterskelen ble brukt som en, og
 * kostet 0,31 poeng for 13 % varians.
 *
 * ================= OG NÅ ER KNOTTEN GRATIS ===============================
 *
 * alpha-mu gir en UTFALLSVEKTOR per kandidat — ett tall per verden. Snitt og
 * spredning faller rett ut av den, uten en eneste ekstra utspilling. Det er
 * nettopp den knotten S5 etterlyste, og den kom som et biprodukt av A8.
 *
 * ================= FORMEN, OG HVORFOR DEN ER SÅ FORSIKTIG ================
 *
 *     score = snitt + λ · press · spredning
 *
 * `press` er positivt når vi ligger bak, negativt når vi leder, og NULL når
 * racet er jevnt eller tidlig. λ settes lavt: en variansknott som slår inn for
 * ofte er en måte å tape jevnt på. Den skal sveipes som `evForsvar` ble det.
 */

import type { GameState } from "../motor.ts";

/**
 * Hvor hardt presset vi er, i [−1, 1].
 *
 *   +1  håpløst bak — bare høy varians kan berge det
 *    0  jevnt, eller for tidlig til at det betyr noe
 *   −1  komfortabel ledelse — beskytt den
 *
 * NULL TIDLIG I KAMPEN er ikke en detalj. Med 0–0 på tavla er «bak» og «foran»
 * meningsløst, og en knott som slår inn der ville lagt til varians i hver
 * eneste runde uten grunn.
 */
export function racepress(state: GameState, sete: number): number {
  const mål = state.regler.målPoeng;
  if (mål <= 0) return 0;
  const egne = state.totalPoeng[sete] ?? 0;
  let beste = 0;
  for (let p = 0; p < state.antallSpillere; p++) {
    if (p !== sete) beste = Math.max(beste, state.totalPoeng[p] ?? 0);
  }

  /**
   * HVOR LANGT UT I RACET ER VI? Presset skal vokse mot slutten: å ligge 20
   * bak ved 30–50 er noe helt annet enn ved 70–90, der det er nesten over.
   */
  const framdrift = Math.min(1, Math.max(egne, beste) / mål);
  if (framdrift < 0.3) return 0;

  const gap = (beste - egne) / mål; // positivt = vi ligger bak
  return Math.max(-1, Math.min(1, gap * 2 * framdrift));
}

/** Snitt og standardavvik over utfallsvektoren fra alpha-mu. */
export function snittOgSpredning(v: readonly number[]): { snitt: number; spredning: number } {
  const n = Math.max(1, v.length);
  const m = v.reduce((a, b) => a + b, 0) / n;
  if (v.length < 2) return { snitt: m, spredning: 0 };
  const s2 = v.reduce((a, x) => a + (x - m) * (x - m), 0) / (v.length - 1);
  return { snitt: m, spredning: Math.sqrt(s2) };
}

/**
 * Racejustert score for en kandidat.
 *
 * `lambda` = 0 gir NØYAKTIG snittet, altså bit-identisk med å ikke bruke
 * regelen. Det er standardverdien, så ingen måling endrer seg før noen ber om
 * det.
 */
/**
 * Kvantilen i en utfallsvektor, med lineær interpolasjon.
 *
 * Alpha-mu gir oss HELE fordelingen per kandidat — én verdi per verden — så vi
 * trenger ikke nøye oss med snitt og spredning. Det er nettopp det som gjør
 * kvantilformen mulig her og ikke i en PIMC som bare returnerer et snitt.
 */
function kvantil(v: readonly number[], q: number): number {
  if (v.length === 0) return 0;
  if (v.length === 1) return v[0]!;
  const s = [...v].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, q * (s.length - 1)));
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? s[lo]! : s[lo]! + (s[hi]! - s[lo]!) * (i - lo);
}

/**
 * Racejustert score for en kandidat.
 *
 * `lambda` = 0 gir NØYAKTIG snittet, altså bit-identisk med å ikke bruke
 * regelen. Det er standardverdien, så ingen måling endrer seg før noen ber om
 * det.
 *
 * ================= FORMEN VAR ASYMMETRISK, OG HALVE KNOTTEN VAR DØD =====
 *
 * Den sto `snitt + lambda * press * spredning`. K5-prøven målte hva det
 * betyr i praksis, med kampstillingen holdt fast:
 *
 *     ligger BAK   (press > 0)   **0 av 20** valg endret seg
 *     ligger FORAN (press < 0)     4 av 20 valg endret seg
 *
 * Årsaken er strukturell, ikke statistisk: grenen med høyest snitt har som
 * regel også størst spredning. Et POSITIVT ledd løfter da den som allerede
 * ledet, og argmaks flytter seg ikke. Bare det negative leddet kunne velte et
 * valg.
 *
 * Kravet er «å ligge under skal gi mer risiko, å lede mindre». Den første
 * halvdelen var altså aldri demonstrert.
 *
 * ================= KVANTILEN FIKSER DET, OG ER RIKTIGERE ================
 *
 * Ligger vi bak, vil vi ha den grenen som kan gi MYE — altså en øvre kvantil.
 * Leder vi, vil vi ha den som ikke kan gi lite — en nedre. Begge kan velte et
 * valg, fordi en gren med høyt snitt og elendig hale taper på den nedre, og en
 * med lavt snitt og god hale vinner på den øvre.
 *
 * Blandingen mot snittet gjør nullpunktet eksakt: ved `lambda = 0` er vekten 0
 * og scoren er snittet, bit for bit. Uten det kunne ingen sveip starte fra noe
 * kjent.
 */
export function racescore(vektor: readonly number[], press: number, lambda: number): number {
  const { snitt } = snittOgSpredning(vektor);
  if (lambda === 0 || press === 0) return snitt;
  /**
   * RETNINGEN STYRES AV `lambda * press`, IKKE AV `press` ALENE.
   *
   * Første utgave regnet `vekt = |lambda*press|` og valgte så kvantil på
   * fortegnet til `press`. Da forsvant lambdas fortegn helt: `lambda = -1,5`
   * oppførte seg NØYAKTIG som `+1,5`, og parameteren hadde ingen retning.
   *
   * K5-prøvens falsifiseringsarm fanget det med en gang — den kjører samme
   * kriterium med knotten vendt feil vei og krever at den ryker. Uten den
   * armen ville jeg hatt en grønn retningstest på en knott uten retning.
   */
  const x = lambda * press;
  const vekt = Math.min(1, Math.abs(x));
  const q = x > 0 ? 0.5 + 0.5 * vekt : 0.5 - 0.5 * vekt;
  return (1 - vekt) * snitt + vekt * kvantil(vektor, q);
}
