/**
 * ALPHA-MU SOM AGENT — `amu:<rolle>:<verdener>[k<kand>][s][aM<n>]:<indre>`
 *
 * Binder sammen de fire delene fra §79 som til nå har vært separate:
 *
 *   A1  verdenene vektes av SPILLET (`spillvekt.ts`)     — «s» i feltet
 *   A2  rolloutene bruker MOTSTANDERMODELLEN             — `motpartFor`
 *   A7  uleselig valg blant like gode kort               — `epsilon`
 *   A8  Pareto-søk over egne framtidige valg             — «aM<n>»
 *
 * Grunnen til at de hører sammen i én agent er ikke bekvemmelighet: de er
 * avhengige. alpha-mu er en beslutningsregel over et utvalg (A1 lager
 * utvalget), rolloutene definerer hva «utfall» betyr (A2), og uleseligheten
 * må komme SIST slik at den bare velger blant kort søket allerede har
 * godkjent (A7).
 *
 * KOSTNADEN ER REELL og derfor er `rolle` med, som i `sik:`: uten den
 * evalueres hver eneste beslutning, og en enkelt måling tar timer.
 */

import { lovligeKort, type GameState, type Handling } from "../motor.ts";
import { standardMål, trekkVerdener, type Utspiller } from "./sdkort.ts";
import { alphaMu } from "./alphamu.ts";
import { lagHvemLaVekt } from "./hvemla-slutning.ts";
import { rolleFor, type Rolle } from "./rolleorakel.ts";
import { stillingsfrø, velgUleselig } from "./uleselig.ts";
import { lagRng } from "../kort.ts";

export interface AmuOpts {
  readonly verdener: number;
  readonly verdenKandidater?: number;
  /** A1: vekt verdenene etter spillet, ikke bare budrunden. */
  readonly spillvekt?: boolean;
  /** A8: antall EGNE beslutninger å søke over. 1 = dagens dybde. */
  readonly M?: number;
  /** A7: randomiser blant kort innenfor ε av det beste. 0 = av. */
  readonly epsilon?: number;
  readonly roller?: readonly Rolle[];
  readonly frø?: number;
  /**
   * A2: MOTSTANDERMODELLEN. Gir policyen som skal spille et gitt sete i
   * rolloutene. Uten den brukes `indre` i alle seter — altså antakelsen om at
   * de andre spiller nøyaktig som oss, som er feil mot familien.
   */
  readonly motpartFor?: (sete: number) => Utspiller;
}

export class Alphamuagent {
  private readonly indre: { velgHandling(s: GameState): Handling; nyKamp(): void };
  private readonly motpart: Utspiller;
  private readonly o: AmuOpts;
  private readonly rng: () => number;
  readonly tellere = { beslutninger: 0, vurdert: 0, overstyrt: 0, uleselig: 0 };

  constructor(
    indre: { velgHandling(s: GameState): Handling; nyKamp(): void },
    motpart: Utspiller,
    opts: AmuOpts,
  ) {
    this.indre = indre;
    this.motpart = motpart;
    this.o = opts;
    this.rng = lagRng(opts.frø ?? 20260806);
  }

  nyKamp(): void {
    this.indre.nyKamp();
  }

  velgHandling(state: GameState): Handling {
    if (state.fase !== "SPILL" || state.iTur === null) return this.indre.velgHandling(state);
    const sete = state.iTur;
    const roller = this.o.roller ?? [];
    if (roller.length > 0) {
      const r = rolleFor(state, sete);
      if (r === null || !roller.includes(r)) return this.indre.velgHandling(state);
    }
    if (lovligeKort(state, sete).length <= 1) return this.indre.velgHandling(state);
    this.tellere.beslutninger++;

    const verdener = trekkVerdener(
      state,
      sete,
      this.o.verdener,
      this.rng,
      undefined,
      this.o.spillvekt === true ? lagHvemLaVekt(state, sete) : undefined,
      this.o.verdenKandidater ?? 3,
    );
    if (verdener.length === 0) return this.indre.velgHandling(state);
    this.tellere.vurdert++;

    /**
     * A2: hvert sete kan få sin egen policy i rolloutene. `alphaMu` tar én
     * `Utspiller`, så modellen pakkes som en ruter som slår opp på hvem som
     * er i tur — da trenger ikke søket å vite at det finnes flere modeller.
     */
    const motpartFor = this.o.motpartFor;
    const ruter: Utspiller =
      motpartFor === undefined
        ? this.motpart
        : {
            velgHandling: (s: GameState) => {
              const p = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
              return (p === null || p === undefined ? this.motpart : motpartFor(p)).velgHandling(s);
            },
          };

    const grener = alphaMu(state, sete, verdener, {
      M: Math.max(1, this.o.M ?? 1),
      mål: standardMål,
      motpart: ruter,
    });
    if (grener.length === 0) return this.indre.velgHandling(state);

    const snitt = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
    const eps = this.o.epsilon ?? 0;
    let valgt = grener[0]!;
    if (eps > 0) {
      // A7 SIST: uleseligheten velger bare blant kort soeket alt har godkjent
      // som omtrent likeverdige. Aa randomisere foer soeket ville kastet poeng.
      const før = valgt;
      valgt = velgUleselig(grener, (g) => snitt(g.vektor), eps, stillingsfrø(state, sete));
      if (valgt !== før) this.tellere.uleselig++;
    } else {
      for (const g of grener) if (snitt(g.vektor) > snitt(valgt.vektor)) valgt = g;
    }

    const eget = this.indre.velgHandling(state);
    if (eget.type === "SPILL" && eget.kort.farge === valgt.kort.farge && eget.kort.verdi === valgt.kort.verdi) {
      return eget;
    }
    this.tellere.overstyrt++;
    return { type: "SPILL", spiller: sete, kort: valgt.kort };
  }
}
