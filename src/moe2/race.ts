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
export function racescore(vektor: readonly number[], press: number, lambda: number): number {
  const { snitt, spredning } = snittOgSpredning(vektor);
  if (lambda === 0 || press === 0) return snitt;
  return snitt + lambda * press * spredning;
}
