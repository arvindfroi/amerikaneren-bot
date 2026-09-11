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
 *
 * MOTSTANDERBOKA (K6.6, 11. sep). Eieren: «byr 11 → gode kort» — og dataene viser at
 * mennesker byr 11 tre ganger så ofte som botene. Samme bud betyr altså noe ANNET fra
 * ulike motstandere, og det kan bare læres om nettet ser hvem som byr. Et nett med
 * `BUDQ_INN_H` innganger får derfor MLB-hukommelsen (`src/mlb/hukommelse.ts`) bakerst:
 * 3 motstandere × 48 tall, relative seter. Boka bokfører BARE ferdigspilte runder
 * (`RUNDE_SLUTT`, der alle kort er offentlige), så K2 holder også her; se
 * `test/budq-hukommelse.test.ts`. Et 143-nett har ingen bok og er bit-identisk med før.
 */

import { lovligeHandlinger, type GameState, type Handling } from "../motor.ts";
import { AMERIKANER, PASS, SOLO, type Bud } from "../regler.ts";
import { forover, type NevroNett } from "../nevro/nett.ts";
import { budTrekk, BUD_DIM_V2 } from "./budtrekk.ts";
// Retningen moe2 → mlb er lov (som `agentspek.ts`); mlb importerer aldri herfra.
import { Hukommelse, HUKOMMELSE_LENGDE_4 } from "../mlb/hukommelse.ts";

/** Budene nettet har en utgang for, i utgangsrekkefølge. Fire spillere: tallbud 5–12. */
export const BUDQ_BUD: readonly Bud[] = [PASS, 5, 6, 7, 8, 9, 10, 11, 12, AMERIKANER, SOLO];
export const BUDQ_UT = BUDQ_BUD.length;
/** 140 budtrekk + 3 fra kampstillingen. */
export const BUDQ_INN = BUD_DIM_V2 + 3;
/** Motstanderboka ved fire spillere: 3 × 48. */
export const BUDQ_HUKOMMELSE = HUKOMMELSE_LENGDE_4;
/** 143 + motstanderboka = 287. */
export const BUDQ_INN_H = BUDQ_INN + BUDQ_HUKOMMELSE;

export function budqIndeks(b: Bud): number {
  const i = BUDQ_BUD.indexOf(b);
  if (i < 0) throw new Error(`BudQ har ingen utgang for budet ${String(b)}`);
  return i;
}

/**
 * Trekkene for `sete` i denne stillingen: budtrekk v2 + kampstillingen, og — bare når
 * en `hukommelse` er gitt — motstanderboka bakerst (`BUDQ_INN_H` i alt).
 *
 * Uten bok er vektoren nøyaktig den gamle (143), så data og nett fra før står.
 */
export function budqTrekk(state: GameState, sete: number, hukommelse: Hukommelse | null = null): Float32Array {
  if (state.antallSpillere !== 4) throw new Error("BudQ er bygd for fire spillere");
  const v = new Float32Array(hukommelse === null ? BUDQ_INN : BUDQ_INN_H);
  v.set(budTrekk(state, sete, BUD_DIM_V2), 0);
  const mål = state.regler.målPoeng;
  let beste = -Infinity;
  for (let p = 0; p < state.antallSpillere; p++) if (p !== sete) beste = Math.max(beste, state.totalPoeng[p] ?? 0);
  v[BUD_DIM_V2] = (state.totalPoeng[sete] ?? 0) / mål;
  v[BUD_DIM_V2 + 1] = beste / mål;
  v[BUD_DIM_V2 + 2] = Math.min(1, state.rundeNr / 20);
  // Relative seter: blokk 0 er setet etter `sete`. Float64 → Float32 som resten.
  if (hukommelse !== null) v.set(hukommelse.vektor(sete, state.antallSpillere), BUDQ_INN);
  return v;
}

type Innagent = { velgHandling(s: GameState): Handling; nyKamp(): void };

export class BudQagent {
  private readonly indre: Innagent;
  private readonly nett: NevroNett;
  /**
   * Motstanderboka for DENNE kampen, eller null for et 143-nett. Null er ikke bare en
   * sparing: et gammelt nett skal ikke engang bokføre, så standardveien er urørt.
   */
  private hukommelse: Hukommelse | null;

  constructor(indre: Innagent, nett: NevroNett) {
    const første = nett.lag[0];
    const siste = nett.lag[nett.lag.length - 1];
    if (første === undefined || (første.inn !== BUDQ_INN && første.inn !== BUDQ_INN_H)) {
      throw new Error(`BudQ-nettet må ta ${BUDQ_INN} eller ${BUDQ_INN_H} trekk, har ${første?.inn}`);
    }
    if (siste === undefined || siste.ut !== BUDQ_UT) {
      throw new Error(`BudQ-nettet må ha ${BUDQ_UT} utganger, har ${siste?.ut}`);
    }
    this.indre = indre;
    this.nett = nett;
    this.hukommelse = første.inn === BUDQ_INN_H ? new Hukommelse() : null;
  }

  /** Leser nettet motstanderboka? Da MÅ driveren vise agenten `RUNDE_SLUTT` via `observer`. */
  get leserHukommelse(): boolean {
    return this.hukommelse !== null;
  }

  nyKamp(): void {
    // Boka er kampens, aldri botens: en ny kamp er nye motstandere (samme regel som
    // `Sandkasseagent.nyKamp`).
    if (this.hukommelse !== null) this.hukommelse = new Hukommelse();
    this.indre.nyKamp();
  }

  /**
   * Bokfør uten å bli spurt. `velgHandling` kalles aldri ved `RUNDE_SLUTT` (ingen er i
   * tur), så uten dette kallet står boka tom hele kampen — den stille feilen
   * `src/mlb/spekagent.ts` beskriver. Driveren må kalle den på hver tilstand.
   */
  observer(state: GameState): void {
    this.hukommelse?.observer(state);
    (this.indre as { observer?(s: GameState): void }).observer?.(state);
  }

  /** Nøyaktig vektoren nettet ser for `sete` nå (143 eller 287). For data, benker og prøver. */
  trekk(state: GameState, sete: number): Float32Array {
    return budqTrekk(state, sete, this.hukommelse);
  }

  /** Q for hvert bud i `BUDQ_BUD`-rekkefølge. For benker og prøver. */
  q(state: GameState, sete: number): Float32Array | number[] {
    return forover(this.nett, this.trekk(state, sete));
  }

  velgHandling(state: GameState): Handling {
    // Som `Sandkasseagent`: også trekkstillingene bokføres (idempotent; boka rører seg
    // bare ved RUNDE_SLUTT, og fanger ellers bare den offentlige poengstillingen).
    this.hukommelse?.observer(state);
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
