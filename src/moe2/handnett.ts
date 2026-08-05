/**
 * HÅNDVURDERINGSNETTET – hånd (+ budhistorikk, + posisjon) → forventede lagstikk.
 *
 * Nettet er trent av `verktoy/hand-tren.py` på fasiten `analyserGiv` skriver
 * gratis for hver giv vi har spilt, og skrives i NØYAKTIG samme binærformat
 * som E1- og SD-nettene (`src/nevro/nett.ts`). Eneste forskjell er formen:
 * `HAND_DIM` inn og ÉN utgang, som er et REGRESJONSTALL og ikke en logit –
 * ingen softmax, ingen maskering, ingen argmax.
 *
 * HVORFOR DEN FINNES. `analyse/budgrense.txt` målte taket: å by der vi passer,
 * når hånden bærer budet, er verdt +1,116 ± 0,058 poeng per sete-runde. Men
 * taket er satt av et orakel som ser alle fire hender, og den lovlige
 * estimatoren som sampler de 40 skjulte kortene henter +0,005 ± 0,026 av det.
 * Spørsmålet dette nettet svarer på er om en LÆRT håndvurdering ser mer enn 24
 * rollouts gjør – altså om gapet er en modellgrense eller en informasjonsgrense.
 *
 * Nettet er en lovlig spiller: `handTrekk` tar bare det setet ser (se
 * `src/moe2/handtrekk.ts`), og permutasjonstesten låser det.
 */

import { readFileSync } from "node:fs";

import type { GameState } from "../motor.ts";
import { forover, nettFraBytes, type NevroNett } from "../nevro/nett.ts";
import { handTrekk, HAND_DIM } from "./handtrekk.ts";

/**
 * Leser vektfilen og sjekker formen. Et nett med feil inngangsbredde ville
 * lest trekkene forskjøvet og gitt tall som ser ut som estimater uten å være
 * det – derfor er dette en hard feil og ikke en advarsel.
 */
export function lesHandNett(fil: string): NevroNett {
  const nett = nettFraBytes(new Uint8Array(readFileSync(fil)));
  if (nett.length !== 1) throw new Error(`Håndnett: forventet ett nett i ${fil}, fikk ${nett.length}`);
  const første = nett[0]!.lag[0]!;
  if (første.inn !== HAND_DIM) {
    throw new Error(`Håndnett: ${fil} tar ${første.inn} trekk, men handTrekk gir ${HAND_DIM}`);
  }
  const siste = nett[0]!.lag[nett[0]!.lag.length - 1]!;
  if (siste.ut !== 1) throw new Error(`Håndnett: ${fil} har ${siste.ut} utganger, forventet 1`);
  return nett[0]!;
}

const bufret = new Map<string, NevroNett>();

/** Leser nettet én gang per sti – flere kandidater deler samme fil. */
export function handNett(fil: string): NevroNett {
  let n = bufret.get(fil);
  if (n === undefined) {
    n = lesHandNett(fil);
    bufret.set(fil, n);
  }
  return n;
}

/**
 * Nettets estimat for `sete`: forventede lagstikk hvis setet får kontrakten.
 *
 * Tallet klippes til [0, antallStikk]. Et nett kan i prinsippet svare 14 på et
 * spill med 12 stikk; å la det tallet slippe gjennom ville gjort marginen i
 * budpolicyen meningsløs.
 */
export function handSd(nett: NevroNett, state: GameState, sete: number): number {
  const ut = forover(nett, handTrekk(state, sete))[0] ?? 0;
  return Math.max(0, Math.min(state.giving.antallStikk, ut));
}
