/**
 * MLB — ETIKETTEN: hvor lå hvert usett kort, sett fra ett sete?
 *
 * ===================== DENNE FILA SER SKJULT INFORMASJON ================
 *
 * Og det skal den. Etiketten ER hvor kortene faktisk lå, kjent ved rundeslutt,
 * og `docs/mlb.md` §0 fører den uttrykkelig opp som noe som IKKE er et orakel:
 * fasit om fortiden, ikke en dom fra en sterkere spiller.
 *
 * **Men den skal aldri inn i en INNGANG.** Trekkene bygges av
 * `spillerVisning` alene (`trotrekk.ts`), og `test/mlb-k2-tro.test.ts` bytter ut
 * de skjulte hendene og krever bit-identisk trekkvektor. Skulle noen en dag
 * lekke en etikett inn i kodingen, feiler den prøven samme sekund.
 *
 * ===================== KLASSENE, OG DEN FJERDE ==========================
 *
 *   0   sett (egen hånd, alt spilt, eget vrak) — MASKERT BORT, ikke gjetning
 *   1–3 relativt sete
 *   4   TALONGEN (budvinnerens fire vrakede kort)
 *
 * Den fjerde klassen er ikke pynt. Uten den måtte modellen fordele talongens
 * kort over tre hender som ikke har dem, og en marginal fordeling sammenliknet
 * mot et betinget gulv «viste» én gang at Adams var verre enn uniform. Det var
 * målingen som var gal, ikke troen.
 *
 * ===================== ÉN «SETT»-DEFINISJON, IKKE TO ====================
 *
 * Masken hentes fra `setteKort(spillerVisning(...))` — nøyaktig den samme
 * funksjonen kodingen bruker. Er de to uenige om hva som er synlig, blir et sett
 * kort merket som gjetning eller motsatt, og tapet måler noe annet enn troen.
 * `test/mlb-fasit.test.ts` håndhever at de er enige, rad for rad.
 */

import { spillerVisning, type GameState } from "../motor.ts";
import { kortIndeks } from "../nevro/trekk.ts";
import { setteKort } from "./trotrekk.ts";

/** Etiketten sett fra `sete`: én klasse per kort, 0 for det som alt er synlig. */
export function troFasit(state: GameState, sete: number): Int8Array {
  const ut = new Int8Array(52);
  const n = state.antallSpillere;
  const sett = setteKort(spillerVisning(state, sete));
  for (let p = 0; p < n; p++) {
    if (p === sete) continue;
    for (const k of state.hender[p] ?? []) {
      const i = kortIndeks(k);
      if (!sett.has(i)) ut[i] = ((p - sete + n) % n) as number;
    }
  }
  /**
   * Budvinneren SER sitt eget vrak, så de fire kortene er allerede i `sett` for
   * henne og faller ut her. For alle andre er de klasse 4. Den asymmetrien er
   * den samme som gjør kanal 2 strukturelt stum i budvinnerens sete (§117).
   */
  for (const k of state.vrak) {
    const i = kortIndeks(k);
    if (!sett.has(i)) ut[i] = 4;
  }
  return ut;
}
