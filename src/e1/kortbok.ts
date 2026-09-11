/**
 * KORTNETTET MED MOTSTANDERBOKA OG SANSER 2 (K6 → kortspillet, K7), 11. sep.
 *
 * Troen (996) og BudQ (323) leser boka (`src/mlb/hukommelse.ts`) og de nye sansene; kortnettet
 * under `vakt:abmp` leste ingen av dem. Vaner kunne da bare nå kortvalget INDIREKTE, gjennom
 * søket, og nettet som spiller utspillingene i søket og alle stillingene porten holder, visste
 * aldri hvem det spilte mot. Denne fila gir kortnettet de samme tre blokkene, bakerst:
 *
 *   0–272     grunn       `e1SpillTrekk(state, sete, 273)` — NØYAKTIG det d7alle og kort-K ser
 *   273–416   hukommelse  `bok.vektor(sete, 4)`: de tre motstanderne, 48 tall hver, relative seter
 *   417–452   stilling    `stillingTrekk(visning, …)` (sans A, 36)
 *   453–492   valgt bort  `valgtBortTrekk(visning)` (sans B, 40)
 *
 * ============ HVORFOR 493, OG HVORFOR IKKE I `LOVLIGE_BREDDER` ============================
 *
 * E1-breddene (273, 340, …, 714) er en PREFIKSKJEDE: en bredde N betyr «de første N kolonnene av
 * v10-kodingen», og `test/e1-bredder.test.ts` krever at hver er et bit-eksakt prefiks av alle
 * bredere. `sd-tren.py --klipp` hviler på det. Fra 558 og opp ligger sanseblokken, som krever en
 * tro ved spilletid (`kort-data` og `e1r:` nekter den). En 493-vektor er IKKE et prefiks av
 * kjeden — kolonne 273 er bok her og minneblokk (v2) der — så den står i sin EGEN liste,
 * `E1_KORT_BOK_BREDDER`, og velges av bredden alene, som `MLB_TRO_BREDDER` og `BUDQ_BREDDER`.
 * 493 kolliderer ikke med noen kjedebredde og ligger under 558, så ingen «≥ 558 = sanseblokk»-
 * vakt leser den feil. Blokkene er bakerst: et 273-nett utvidet med nullkolonner gir nøyaktig
 * samme logits (`test/e1-kortbok.test.ts`).
 *
 * ============ K2 ==========================================================================
 *
 * Grunnen er `e1SpillTrekk`, som tar en `GameState` og holder disiplinen ved konvensjon (og
 * `test/kort-data.test.ts`). De tre nye blokkene bygges av `spillerVisning(state, sete)` og boka
 * ALENE. Boka bokfører bare ferdige runder (`Hukommelse.observer` ved `RUNDE_SLUTT`, der alle kort
 * er offentlige). Prøven bytter skjulte hender, vraket og talongen for hver ikke-budvinner og
 * krever bit-lik vektor; fellene leser den ekte makkeren før avsløringen og mater boka stillingen.
 *
 * ============ DEN STILLE FEILEN `Kortbok` KASTER PÅ =======================================
 *
 * Boka fylles bare når noen viser den `RUNDE_SLUTT`, og kortlaget ligger under `vakt:` — som ikke
 * videresendte `observer` før dette. Et bokleddet nett uten den koblingen spiller på 144 nuller,
 * altså som et 273-nett, og ingenting feiler. Samme felle `MlbSøketro` kaster på, og samme regel:
 * er en runde passert uten å bli vist som `RUNDE_SLUTT`, kastes det. Går rundenummeret bakover, er
 * det en ny kamp, og boka nullstilles — boka er kampens, aldri botens.
 */

import { spillerVisning, type GameState } from "../motor.ts";
import { Hukommelse, HUKOMMELSE_LENGDE_4 } from "../mlb/hukommelse.ts";
import { MLB_STILLING, stillingTrekk } from "../mlb/stillingtrekk.ts";
import { MLB_VALGT_BORT, valgtBortTrekk } from "../mlb/valgtbort.ts";
import { e1SpillTrekk, E1_SPILL_DIM } from "./trekk.ts";

export const KORTBOK_FRA = E1_SPILL_DIM;
export const STILLING_FRA = KORTBOK_FRA + HUKOMMELSE_LENGDE_4;
export const VALGT_BORT_FRA = STILLING_FRA + MLB_STILLING;
/** 273 + 144 + 36 + 40. */
export const E1_KORT_BOK_DIM = VALGT_BORT_FRA + MLB_VALGT_BORT;
/**
 * Bredder med bok. ÉN i dag; en liste fordi `e1NettFraBytes`, `sd-tren.py` (`KORTBOK_DIM`) og
 * prøven må være enige, og en liste kan sjekkes av en test.
 */
export const E1_KORT_BOK_BREDDER: readonly number[] = [E1_KORT_BOK_DIM];
/** Blokkene i rekkefølge — for varmstart og dokumentasjon. */
export const E1_KORT_LAYOUT: readonly (readonly [string, number])[] = [
  ["grunn", E1_SPILL_DIM],
  ["hukommelse", HUKOMMELSE_LENGDE_4],
  ["stilling", MLB_STILLING],
  ["valgtbort", MLB_VALGT_BORT],
];

export const erKortbokBredde = (dim: number): boolean => E1_KORT_BOK_BREDDER.includes(dim);

/**
 * Trekkene for `sete`: grunnen, boka og de to sansene. `bok` er `Hukommelse.vektor(sete, 4)`;
 * `null` gir en nullblokk — den ærlige verdien før første runde er ferdig.
 */
export function e1KortBokTrekk(state: GameState, sete: number, bok: Float64Array | null): Float32Array {
  if (state.antallSpillere !== 4) throw new Error("Kortnettet med bok er bygd for fire spillere");
  const v = new Float32Array(E1_KORT_BOK_DIM);
  v.set(e1SpillTrekk(state, sete, E1_SPILL_DIM), 0);
  if (bok !== null) {
    if (bok.length !== HUKOMMELSE_LENGDE_4) {
      throw new Error(`Boka har ${bok.length} tall, kortnettet venter ${HUKOMMELSE_LENGDE_4}`);
    }
    // Float64 → Float32 som i troen og BudQ.
    v.set(bok, KORTBOK_FRA);
  }
  // K2: bare det setet SER. Ingen `state.hender`, `state.vrak`, `state.talong` eller `state.makker` her.
  const visning = spillerVisning(state, sete);
  v.set(stillingTrekk(visning, state.giving.antallStikk, state.regler.målPoeng), STILLING_FRA);
  v.set(valgtBortTrekk(visning), VALGT_BORT_FRA);
  return v;
}

/**
 * Motstanderboka for kortlaget i ÉN kamp, med vakten som kaster når `observer` ikke er koblet.
 *
 * DELT i en spek (`Spekkontekst.kortbok`): søkets utspillingsmotpart kan være en egen instans
 * (`amu:`, `sum:`, nestede søk), og en instans ingen viser `RUNDE_SLUTT` ville ellers spilt på
 * nuller mens den som spiller så boka. Boka er offentlig og `observer` idempotent, så deling er
 * trygt: den som ser en tilstand først, bokfører den.
 */
export class Kortbok {
  private bok = new Hukommelse();
  private førsteRunde: number | null = null;
  private sisteRunde = -1;
  private readonly bokført = new Set<number>();

  nyKamp(): void {
    this.bok = new Hukommelse();
    this.førsteRunde = null;
    this.sisteRunde = -1;
    this.bokført.clear();
  }

  /** Runder boka har bokført i denne kampen. */
  runder(): number {
    return this.bok.runder();
  }

  /** Hver virkelige tilstand, også `RUNDE_SLUTT`. Utenfor `RUNDE_SLUTT` noteres bare stillingen. */
  observer(state: GameState): void {
    if (state.rundeNr < this.sisteRunde) this.nyKamp();
    this.sisteRunde = state.rundeNr;
    if (this.førsteRunde === null) this.førsteRunde = state.rundeNr;
    if (state.fase === "RUNDE_SLUTT") this.bokført.add(state.rundeNr);
    this.bok.observer(state);
  }

  /** Boka sett fra `sete`. Kaster om forrige runde aldri ble vist som `RUNDE_SLUTT`. */
  vektor(state: GameState, sete: number): Float64Array {
    if (this.førsteRunde === null) this.førsteRunde = state.rundeNr;
    const forrige = state.rundeNr - 1;
    if (forrige >= this.førsteRunde && !this.bokført.has(forrige)) {
      throw new Error(
        `Kortbok: runde ${forrige} ble aldri vist som RUNDE_SLUTT — observer er ikke koblet til kortlaget, og nettet ville spilt på en tom bok`,
      );
    }
    return this.bok.vektor(sete, state.antallSpillere);
  }
}
