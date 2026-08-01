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
 *
 * MINNEBLOKKEN (v2, indeks 273–339) retter et hull som ble målt, ikke gjettet:
 * budvinneren tok opp talongen og vraket fire kort. De fire er DØDE – de kan
 * ikke ligge på noen hånd – og budvinneren er den eneste som vet hvilke.
 * Kodingen over utleder «hva er fortsatt ute» av egen hånd pluss åpent spilte
 * kort, så de fire døde telles alltid som levende.
 *
 * `examples/hukommelseshull.ts` målte hva det koster i informasjon: i 18,9 %
 * av budvinnerens kortvalg er det «høyeste kortet ute» i minst én farge et
 * kort budvinneren vraket selv. Nettet tror altså at en trussel lever, mens
 * spilleren rundt bordet husker at han la den ned.
 *
 * DET GJØR MER ENN Å KOSTE OPPSIDE. Fasiten vi trener mot – SD-orakelet – ER
 * vrak-bevisst (`src/moe2/synlig.ts`, `src/solver/sampler.ts`). Etiketten er
 * altså en funksjon av informasjon inngangen ikke kan uttrykke, og de
 * stillingene er ikke bare vanskelige: de er ULÆRBARE. Nettet kan bare midle
 * over dem, og middelet lekker som støy inn i nabostillingene.
 *
 * BAKOVERKOMPATIBELT MED VILJE. Indeks 0–272 er urørt og betyr NØYAKTIG det
 * samme som før, så nett trent på v1 (sd-r2.bin) leser fortsatt sin egen
 * verden. Rettelsene ligger i egne indekser ved siden av de gamle, ikke oppå
 * dem. `e1SpillTrekkFor(dim)` gir den bredden nettet faktisk ble trent med.
 */

import { FARGER, type Farge, type Kort } from "../kort.ts";
import type { GameState } from "../motor.ts";
import { fargeIndeks, kortIndeks, SPILL_DIM, spillTrekk } from "../nevro/trekk.ts";

/** 238 fra appen + 35 egne. Kodingen sd-r2.bin og eldre nett ble trent med. */
export const E1_SPILL_DIM = SPILL_DIM + 35;

/** v1 + 67 minnetrekk. Kodingen nye nett trenes med. */
export const E1_SPILL_DIM_V2 = E1_SPILL_DIM + 67;

const BASIS = SPILL_DIM;
/** Der minneblokken begynner. */
const MINNE = E1_SPILL_DIM;

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

export function e1SpillTrekk(state: GameState, sete: number, dim: number = E1_SPILL_DIM): Float32Array {
  const v = new Float32Array(dim);
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

  if (dim <= E1_SPILL_DIM) return v;

  // --- MINNEBLOKKEN (v2) --------------------------------------------------
  // Bare budvinneren har SETT vraket. For alle andre er blokkens kjente del
  // tom, og det er riktig: de vet at fire kort er døde, ikke hvilke.
  const erBudvinner = sete === state.budvinner;
  const mittVrak = erBudvinner ? state.vrak : [];
  const dødt = new Set<string>();
  for (const k of mittVrak) dødt.add(`${k.farge}${k.verdi}`);

  // 273–276: eget vrak per farge. 277–328: eget vrak, ett kort per indeks.
  for (const k of mittVrak) {
    v[MINNE + fargeIndeks(k.farge)]! += 1 / 4;
    v[MINNE + 4 + kortIndeks(k)] = 1;
  }

  // 329–332 / 333–336: samme to spørsmål som 262–269, men med de døde
  // kortene trukket fra. For alle andre enn budvinneren er de identiske med
  // originalene – da er det ingenting å rette.
  let levendeUte = 0;
  for (let f = 0; f < 4; f++) {
    const farge = FARGER[f] as Farge;
    let høyest = 0;
    let antall = 0;
    for (let verdi = 2; verdi <= 14; verdi++) {
      const id = `${farge}${verdi}`;
      if (sett.has(id) || dødt.has(id)) continue;
      antall++;
      if (verdi > høyest) høyest = verdi;
    }
    v[MINNE + 56 + f] = høyest === 0 ? 0 : (høyest - 2) / 12;
    v[MINNE + 60 + f] = antall / 13;
    levendeUte += antall;
  }

  // 337: hvor mange kort som VIRKELIG er i spill hos de andre. Budvinneren
  // kjenner tallet eksakt; de andre vet bare at talongens fire er borte, og
  // det trekkes fra her – ellers tror kodingen at 40 kort er i omløp når 36
  // er det.
  const usett = levendeUte - (erBudvinner ? 0 : state.giving.talong);
  v[MINNE + 64] = Math.max(0, usett) / 39;
  // 338: vet jeg HVILKE kort som er døde?
  v[MINNE + 65] = erBudvinner ? 1 : 0;
  // 339: er minneblokken i det hele tatt fylt ut? Alltid 1 i spill. Treneren
  // setter den til 0 på gamle rader som ble merket før blokken fantes, slik
  // at nullene der leses som «ukjent» og ikke som «ingen døde kort».
  v[MINNE + 66] = 1;
  return v;
}
