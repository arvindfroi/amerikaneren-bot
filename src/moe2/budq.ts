/**
 * BUDQ — BUDET SOM ET LÆRT VALG (K3.1, K3.2, K3.8), 11. sep.
 *
 * `Budagent` velger bud med en HÅNDLAGD regel: GBT-en anslår lagstikk (μ, σ), og
 * EV(N) = p_vant(N)·2N(2P−1) + (1−p)·forsvarsverdi, med en terskel (−3,0) og en
 * forsvarsverdi som er kalibrerte konstanter. Amerikaner og solo er aldri med, og
 * budrunden står igjen med 41,8 % av alt som er å hente (§60).
 *
 * `BudQagent` lærer i stedet VERDIEN av hvert bud direkte:
 *
 *     Q(stilling, bud) = forventet rundeutfall (egne poeng minus snittet av de tre
 *                        andre) når setet byr det og resten av runden spilles av policyen
 *
 * Etikettene kommer fra utspillinger i verdener trukket fra det setet VET
 * (`examples/budq-data.ts`); nettet er en MLP i appformatet (`verktoy/budq-tren.py`).
 * Valget er argmax over de LOVLIGE budene — ingen terskel, ingen konstanter, og
 * amerikaner og solo er ekte valg med sin egen verdi.
 *
 * KAMPSTILLINGEN ER MED (K5): egne poeng, beste motstanders poeng og rundenummeret
 * ligger bakerst i trekkene, så Q kan lære at samme hånd er verdt et annet bud når
 * man ligger bak.
 *
 * K2: trekkene er `budTrekk` (egen hånd og auksjonen) og poengtavla — nøyaktig det
 * `Budagent` leser. `test/budq.test.ts` bytter de skjulte hendene og krever samme bud.
 */

import { lovligeHandlinger, type GameState, type Handling } from "../motor.ts";
import { AMERIKANER, PASS, SOLO, type Bud } from "../regler.ts";
import { forover, type NevroNett } from "../nevro/nett.ts";
import { budTrekk, BUD_DIM_V2 } from "./budtrekk.ts";

/** Budene nettet har en utgang for, i utgangsrekkefølge. Fire spillere: tallbud 5–12. */
export const BUDQ_BUD: readonly Bud[] = [PASS, 5, 6, 7, 8, 9, 10, 11, 12, AMERIKANER, SOLO];
export const BUDQ_UT = BUDQ_BUD.length;
/** 140 budtrekk + 3 fra kampstillingen. */
export const BUDQ_INN = BUD_DIM_V2 + 3;

export function budqIndeks(b: Bud): number {
  const i = BUDQ_BUD.indexOf(b);
  if (i < 0) throw new Error(`BudQ har ingen utgang for budet ${String(b)}`);
  return i;
}

/** Trekkene for `sete` i denne stillingen: budtrekk v2 + kampstillingen. */
export function budqTrekk(state: GameState, sete: number): Float32Array {
  if (state.antallSpillere !== 4) throw new Error("BudQ er bygd for fire spillere");
  const v = new Float32Array(BUDQ_INN);
  v.set(budTrekk(state, sete, BUD_DIM_V2), 0);
  const mål = state.regler.målPoeng;
  let beste = -Infinity;
  for (let p = 0; p < state.antallSpillere; p++) if (p !== sete) beste = Math.max(beste, state.totalPoeng[p] ?? 0);
  v[BUD_DIM_V2] = (state.totalPoeng[sete] ?? 0) / mål;
  v[BUD_DIM_V2 + 1] = beste / mål;
  v[BUD_DIM_V2 + 2] = Math.min(1, state.rundeNr / 20);
  return v;
}

type Innagent = { velgHandling(s: GameState): Handling; nyKamp(): void };

export class BudQagent {
  private readonly indre: Innagent;
  private readonly nett: NevroNett;

  constructor(indre: Innagent, nett: NevroNett) {
    const første = nett.lag[0];
    const siste = nett.lag[nett.lag.length - 1];
    if (første === undefined || første.inn !== BUDQ_INN) {
      throw new Error(`BudQ-nettet må ta ${BUDQ_INN} trekk, har ${første?.inn}`);
    }
    if (siste === undefined || siste.ut !== BUDQ_UT) {
      throw new Error(`BudQ-nettet må ha ${BUDQ_UT} utganger, har ${siste?.ut}`);
    }
    this.indre = indre;
    this.nett = nett;
  }

  nyKamp(): void {
    this.indre.nyKamp();
  }

  observer(state: GameState): void {
    (this.indre as { observer?(s: GameState): void }).observer?.(state);
  }

  /** Q for hvert bud i `BUDQ_BUD`-rekkefølge. For benker og prøver. */
  q(state: GameState, sete: number): Float32Array | number[] {
    return forover(this.nett, budqTrekk(state, sete));
  }

  velgHandling(state: GameState): Handling {
    if (state.fase !== "BUDRUNDE" || state.iTur === null) return this.indre.velgHandling(state);
    const lov = lovligeHandlinger(state);
    if (lov.fase !== "BUDRUNDE") return this.indre.velgHandling(state);
    const sete = state.iTur;
    const q = this.q(state, sete);
    let beste: Bud | null = null;
    let bv = -Infinity;
    for (const b of lov.bud) {
      const i = BUDQ_BUD.indexOf(b);
      if (i < 0) continue;
      if (q[i]! > bv) {
        bv = q[i]!;
        beste = b;
      }
    }
    // Ingen av de lovlige budene har en utgang (skal ikke skje med fire spillere):
    // la laget under bestemme i stedet for å gjette.
    if (beste === null) return this.indre.velgHandling(state);
    return { type: "BUD", spiller: sete, bud: beste };
  }
}
