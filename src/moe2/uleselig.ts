/**
 * A7 — ULESELIGHET. Adams er i dag en REN FUNKSJON.
 *
 * Verifisert: samme stilling, fem kall, ett eneste valg. Mot et menneske som
 * spiller mange runder er det utnyttbart — og målet ER definert mot en
 * gjentakende motstander (mennesket skal vinne 1 av 20 i et race til 100).
 * Et menneske som lærer «når hun spiller ut ruter her, har hun ikke trumf»
 * spiller mot en bot som ikke kan skjule noe.
 *
 * ================= HVORFOR DETTE ER FARLIG Å GJØRE FEIL ==================
 *
 * Hver eneste måling i prosjektet hviler på at KONTROLLARMEN måler nøyaktig
 * 0,0000 (gate 2) eller 0,2500 (kampbenken). Det krever determinisme. Ekte
 * `Math.random()` ville drept parringen, og dermed alle målinger vi har.
 *
 * Derfor er randomiseringen FRØSTYRT og utledet av STILLINGEN:
 *
 *   frø = hash(giv-frø, stikk, sete, kortene på bordet)
 *
 * Samme stilling gir alltid samme valg — så parringen overlever og
 * kontrollarmen er fortsatt eksakt. Men stillingen bestemmer valget på en
 * måte motstanderen ikke kan lese av kortene sine, fordi hashen blander inn
 * givens frø.
 *
 * MOT ET MENNESKE er dette nok: hen ser aldri samme giv to ganger, så en
 * deterministisk-men-uforutsigbar avbildning er umulig å skille fra ekte
 * tilfeldighet. Mot en analytiker med tilgang til frøet er den gjennomsiktig,
 * og det er en bevisst avveining: målbarhet slår kryptografisk uleselighet.
 *
 * ================= NÅR DEN SKAL SLÅ TIL ==================================
 *
 * BARE mellom handlinger som er OMTRENT LIKE GODE. Å randomisere mellom et
 * godt og et dårlig kort er å kaste poeng for å være uforutsigbar. `epsilon`
 * er terskelen i samme enhet som utfallsmålet (poengdifferanse), og settes
 * lavt: koster ε per konstruksjon, og ε skal sveipes som `evForsvar` ble det.
 */

import type { GameState } from "../motor.ts";
import { kortIndeks } from "../nevro/trekk.ts";

/**
 * Stillingsavledet frø. Blander givens frø med hvor i runden vi er, slik at
 * to ulike beslutninger i samme giv ikke får samme trekning.
 */
export function stillingsfrø(state: GameState, sete: number): number {
  let h = (state.frø ?? 0) >>> 0;
  h = (Math.imul(h ^ 0x9e3779b9, 0x85ebca6b) + state.stikkSpilt) >>> 0;
  h = (Math.imul(h ^ (sete + 1), 0xc2b2ae35) + state.bord.length) >>> 0;
  for (const kp of state.bord) h = (Math.imul(h ^ kortIndeks(kp.kort), 0x27d4eb2f) + 1) >>> 0;
  return h >>> 0;
}

/** Deterministisk [0,1) fra et 32-bits frø. */
export function fraFrø(frø: number): number {
  let t = (frø + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Velger blant kandidater som ligger innenfor `epsilon` av den beste.
 *
 * Er bare ÉN innenfor, returneres den — da er valget ikke jevnt, og å
 * randomisere ville kostet poeng uten å skjule noe.
 */
export function velgUleselig<T>(
  kandidater: readonly T[],
  verdi: (k: T) => number,
  epsilon: number,
  frø: number,
): T {
  if (kandidater.length <= 1) return kandidater[0]!;
  let best = -Infinity;
  for (const k of kandidater) {
    const v = verdi(k);
    if (v > best) best = v;
  }
  const nær = kandidater.filter((k) => verdi(k) >= best - epsilon);
  if (nær.length <= 1) return nær[0] ?? kandidater[0]!;
  return nær[Math.min(nær.length - 1, Math.floor(fraFrø(frø) * nær.length))]!;
}
