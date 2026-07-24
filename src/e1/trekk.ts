/**
 * E1s trekkuttrekk for kortspill.
 *
 * De 238 første indeksene er NØYAKTIG appens `NevroTrekk.spill` (se
 * src/nevro/trekk.ts). Det er bevisst: da er E1 mot NevroHjerne en
 * kontrollert sammenlikning – samme inngangsinformasjon, men bedre lærer
 * (eksakt dobbelt-dummy i stedet for destillert MesterAI) og større nett.
 *
 * Oppå ligger 35 ekstra trekk som VÅR motor kjenner og appens koding ikke
 * uttrykker: renonse-slutninger fra stikkhistorikken, hvilke kort som
 * fortsatt er ute, og fargefordelingen på egen hånd. Alt er lovlig
 * informasjon – utledet av offentlig stikkhistorikk og egen hånd, aldri av
 * skjulte hender, talongen eller andres vrak.
 */

import { FARGER, type Farge, type Kort } from "../kort.ts";
import type { GameState } from "../motor.ts";
import { fargeIndeks, SPILL_DIM, spillTrekk } from "../nevro/trekk.ts";

/** 238 fra appen + 35 egne. */
export const E1_SPILL_DIM = SPILL_DIM + 35;

const BASIS = SPILL_DIM;

/** Alle kort som er spilt åpent denne runden (historikk + bordet). */
function spilteKort(state: GameState): Kort[] {
  const ut: Kort[] = [];
  for (const stikk of state.historikk) for (const kp of stikk.kort) ut.push(kp.kort);
  for (const kp of state.bord) ut.push(kp.kort);
  return ut;
}

/**
 * Renonse: setet fulgte ikke farge i et stikk der den ble etterspurt.
 * Utledes av den offentlige stikkhistorikken – nøyaktig den slutningen en
 * oppmerksom menneskespiller gjør, og den PIMC-sampleren allerede bruker.
 */
function renonser(state: GameState): boolean[][] {
  const ut = [0, 1, 2, 3].map(() => [false, false, false, false]);
  const stikkene = [...state.historikk.map((s) => s.kort), ...(state.bord.length > 0 ? [state.bord] : [])];
  for (const stikk of stikkene) {
    const led = stikk[0]?.kort.farge;
    if (led === undefined) continue;
    for (const kp of stikk) {
      if (kp.kort.farge !== led) ut[kp.spiller]![fargeIndeks(led)] = true;
    }
  }
  return ut;
}

export function e1SpillTrekk(state: GameState, sete: number): Float32Array {
  const v = new Float32Array(E1_SPILL_DIM);
  v.set(spillTrekk(state, sete), 0);

  const hånd = state.hender[sete] ?? [];
  const spilt = spilteKort(state);

  // 238–241: egen fargefordeling.
  for (const k of hånd) v[BASIS + fargeIndeks(k.farge)]! += 1 / 13;
  // 242–245: hvor mange kort som er spilt i hver farge.
  for (const k of spilt) v[BASIS + 4 + fargeIndeks(k.farge)]! += 1 / 13;

  // 246–261: renonse per RELATIVT sete × farge (egen rad er alltid 0).
  const ren = renonser(state);
  for (let s = 0; s < 4; s++) {
    const r = (s - sete + 4) % 4;
    for (let f = 0; f < 4; f++) if (ren[s]![f]) v[BASIS + 8 + r * 4 + f] = 1;
  }

  // 262–265: høyeste kort som fortsatt er ute i hver farge (0 = ingen igjen).
  // 266–269: hvor mange kort som fortsatt er ute i hver farge.
  const sett = new Set<string>();
  for (const k of hånd) sett.add(`${k.farge}${k.verdi}`);
  for (const k of spilt) sett.add(`${k.farge}${k.verdi}`);
  for (let f = 0; f < 4; f++) {
    const farge = FARGER[f] as Farge;
    let høyest = 0;
    let antall = 0;
    for (let verdi = 2; verdi <= 14; verdi++) {
      if (sett.has(`${farge}${verdi}`)) continue;
      antall++;
      if (verdi > høyest) høyest = verdi;
    }
    v[BASIS + 24 + f] = høyest === 0 ? 0 : (høyest - 2) / 12;
    v[BASIS + 28 + f] = antall / 13;
  }

  // 270: stikk igjen. 271: har jeg utspillet? 272: bias.
  v[BASIS + 32] = (state.giving.antallStikk - state.stikkSpilt) / 13;
  v[BASIS + 33] = state.bord.length === 0 ? 1 : 0;
  v[BASIS + 34] = 1;
  return v;
}
