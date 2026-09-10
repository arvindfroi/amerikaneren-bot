/**
 * TROEN SOM VEKT PÅ VERDENSTREKKEREN.
 *
 * Verdenstrekkeren vektet til nå kandidatverdener etter BUDET alene — enten
 * `budForenlighet` (håndlagd formel) eller en lært budprior. Ingenting av
 * hvordan folk har SPILT talte med.
 *
 * MÅLINGEN SOM BEGRUNNER DETTE. `examples/sd-stoy.ts`: to uavhengige
 * verdenstrekk på samme stilling er uenige om beste kort i 92,5 % av
 * tilfellene ved 12 verdener, og signal/støy er 0,27. Etiketten er altså mest
 * støy, og støyen kommer fra at verdenene er dårlige utvalg.
 *
 * Solinas, Rebstock & Buro (arXiv 1903.09604) viser veien: en LÆRT
 * inferensmodell gir REPRESENTATIVE verdener, og da trengs langt færre av dem
 * for samme kvalitet. Trosnettet er nettopp en slik modell — målt til +4,86
 * prosentpoeng bedre verdenskvalitet — og det har ligget ubrukt fordi §29
 * konkluderte med at det ikke kunne betale seg. Den konklusjonen gjaldt SPILL
 * (Adams trekker ingen verdener der), ikke ETIKETTENE: orakelet trekker
 * verdener for hver eneste merkede stilling.
 *
 * ÉN UTREGNING PER TREKK, ikke per verden. Fordelingen avhenger av
 * STILLINGEN, ikke av verdenen, så den regnes ut én gang og gjenbrukes på alle
 * kandidatene. Vekten per verden blir da bare en sum av oppslag.
 *
 * ============ TO TROSNETT, ÉN VEKT (11. sep) ==============================
 *
 * `lagTrovekt` tar det gamle trosnettet (e1-trekk, K8-tap rundt 1,05). MLB-trohodet
 * (`src/mlb/tronett.ts`) er langt skarpere — rundt 0,95 på samme mål — men bodde bare
 * i MLB-agentens trekk, aldri i søkets verdener. `lagTrovektFraVisning` er broen.
 * Begge deler NØYAKTIG samme vekt fra fordelingen, så forskjellen mellom dem er
 * nettet og ingenting annet.
 */

import { spillerVisning, type GameState, type SpillerVisning } from "../motor.ts";
import type { Verden } from "../solver/sampler.ts";
import { e1SpillTrekk, E1_SPILL_DIM_V8 } from "../e1/trekk.ts";
import { kortIndeks } from "../nevro/trekk.ts";
import { TRO_KLASSER, TRO_KORT } from "./trosnett.ts";

/** Gulv på sannsynligheten, så en «umulig» plassering ikke gir −∞. */
const GULV = 1e-4;

/**
 * Kortene `sete` ikke ser, i stigende indeks.
 *
 * SYNLIGE kort teller ikke: alle verdener er enige om dem, så de ville lagt til en
 * konstant og bare gjort tallene større. `medEgetVrak` regner budvinnerens eget vrak
 * som sett — hun kastet det selv. Av for `lagTrovekt`, så den er bit-identisk med før.
 */
function skjulteKort(state: GameState, sete: number, medEgetVrak: boolean): number[] {
  const synlig = new Set<number>();
  for (const k of state.hender[sete] ?? []) synlig.add(kortIndeks(k));
  for (const t of state.historikk) for (const kp of t.kort) synlig.add(kortIndeks(kp.kort));
  for (const kp of state.bord) synlig.add(kortIndeks(kp.kort));
  if (medEgetVrak && state.budvinner === sete) for (const k of state.vrak) synlig.add(kortIndeks(k));

  const skjult: number[] = [];
  for (let i = 0; i < TRO_KORT; i++) if (!synlig.has(i)) skjult.push(i);
  return skjult;
}

/** Vekten fra en ferdig fordeling `p[kort][klasse]` (rel. sete 1–3, klasse 3 = talongen). */
function vektFraFordeling(
  p: readonly (readonly number[])[],
  skjult: readonly number[],
  sete: number,
): (v: Verden) => number {
  const log = new Float64Array(TRO_KORT * TRO_KLASSER);
  for (let i = 0; i < TRO_KORT; i++) {
    for (let c = 0; c < TRO_KLASSER; c++) {
      log[i * TRO_KLASSER + c] = Math.log(Math.max(GULV, p[i]?.[c] ?? GULV));
    }
  }

  return (v: Verden): number => {
    // Hvem holder hvert skjulte kort i DENNE verdenen.
    const hos = new Int8Array(TRO_KORT).fill(-1);
    for (let sp = 0; sp < v.hender.length; sp++) {
      for (const c of v.hender[sp]!) if (c >= 0 && c < TRO_KORT) hos[c] = sp;
    }
    let sum = 0;
    for (const i of skjult) {
      const sp = hos[i]!;
      // −1 = ingen hånd har kortet, altså vraket. Det er klasse 3, «dødt».
      const klasse = sp < 0 ? TRO_KLASSER - 1 : ((sp - sete + 4) % 4) - 1;
      sum += log[i * TRO_KLASSER + (klasse < 0 ? TRO_KLASSER - 1 : klasse)]!;
    }
    return sum;
  };
}

/**
 * Bygger vektfunksjonen for ÉN stilling. `null` når det ikke finnes skjulte
 * kort å vekte på – da er alle verdener like og troen bidrar ingenting.
 */
export function lagTrovekt(
  trosnett: { fordeling(trekk: Float32Array): number[][] },
  state: GameState,
  sete: number,
): ((v: Verden) => number) | null {
  const skjult = skjulteKort(state, sete, false);
  if (skjult.length === 0) return null;
  return vektFraFordeling(trosnett.fordeling(e1SpillTrekk(state, sete, E1_SPILL_DIM_V8)), skjult, sete);
}

/** Det et visningsbasert trohode må kunne. Strukturell type, så `moe2` ikke eier nettet. */
export interface Visningstro {
  /** Leser nettet hukommelsen (K6 → K8)? Mangler feltet, gjør det ikke. */
  readonly brukerHukommelse?: boolean;
  trekkFor(
    visning: SpillerVisning,
    antallStikk: number,
    målPoeng: number,
    hukommelse: Float64Array | null,
  ): Float32Array;
  /** → `p[kort][klasse]`, klasse 0–2 = rel. sete 1–3, klasse 3 = talongen. */
  fordeling(trekk: Float32Array): number[][];
}

/**
 * Samme vekt, fra MLB-trohodet.
 *
 * K2 ER STRUKTURELL HER: nettet får `spillerVisning(state, sete)` og de offentlige
 * regelparametrene, aldri `state`. De skjulte kortene leses fra egen hånd, stikkene,
 * bordet og — for budvinneren — eget vrak. `test/sik-tro.test.ts` bytter motstandernes
 * hender og krever samme vekt.
 */
export function lagTrovektFraVisning(
  nett: Visningstro,
  state: GameState,
  sete: number,
  hukommelse: Float64Array | null,
): ((v: Verden) => number) | null {
  const skjult = skjulteKort(state, sete, true);
  if (skjult.length === 0) return null;
  const trekk = nett.trekkFor(spillerVisning(state, sete), state.giving.antallStikk, state.regler.målPoeng, hukommelse);
  return vektFraFordeling(nett.fordeling(trekk), skjult, sete);
}
