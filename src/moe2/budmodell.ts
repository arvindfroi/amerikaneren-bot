/**
 * BUDMODELLEN, uten filsystem – delen som også kjører i nettleseren.
 *
 * `budagent.ts` importerte `node:fs` på toppnivå, og et slikt modul kan ikke
 * bunles til nettsiden: esbuild med nettleserplattform stopper på `node:fs`.
 * Derfor ligger alt som er rent regnestykke her, og `budagent.ts` er en tynn
 * innpakning som legger `lesBudmodell` (fil) oppå. Alle eksisterende importer
 * fra `budagent.ts` virker uendret.
 *
 * Se `budagent.ts` for hvorfor beslutningen er en UTREGNING og ikke en
 * klassifisering, og for forbeholdet om at budrunde-sannsynligheten er
 * estimert som en populasjonsstørrelse.
 */

import { lovligeHandlinger, type GameState, type Handling } from "../motor.ts";
import { PASS } from "../regler.ts";
import { budTrekk, BUD_DIM, BUD_DIM_V2 } from "./budtrekk.ts";

interface Node {
  blad: boolean;
  verdi?: number;
  kol?: number;
  terskel?: number;
  v?: Node;
  h?: Node;
}
interface Skog {
  basis: number;
  trær: Node[];
}
export interface Budmodell {
  dim: number;
  bud: number[];
  rate: number;
  vant: Record<string, number>;
  mμ: Skog;
  mσ: Skog;
}

/**
 * Validerer en allerede parset modell. Bredden sjekkes fordi en modell trent
 * med andre trekk enn `budTrekk` gir nå ville lest inngangen sin feil – og det
 * ville ikke krasjet, bare bydd dårligere.
 */
export function tolkBudmodell(rå: unknown): Budmodell {
  const m = rå as Budmodell;
  if (m === null || typeof m !== "object" || typeof m.dim !== "number") {
    throw new Error("Budmodellen mangler «dim» – er dette riktig fil?");
  }
  // TO LOVLIGE BREDDER, og modellen sier selv hvilken den vil ha.
  //
  // v1 (128) er egen hånd alene. v2 (140) legger BUDRUNDEN oppå – revisjonen
  // 5. august fant at modellen var blind for hva de andre hadde bydd.
  //
  // Sjekken er en ren utvidelse OG IKKE en oppmykning: en modell med en tredje
  // bredde avvises fortsatt. Poenget er at `bud-gbt.json` (128) skal virke
  // uendret mens en v2-modell kan trenes ved siden av – uten at en kodeendring
  // kan velte budgivningen i den boten som står ute.
  if (m.dim !== BUD_DIM && m.dim !== BUD_DIM_V2) {
    throw new Error(
      `Budmodellen er trent med ${m.dim} trekk, men budTrekk gir ${BUD_DIM} (v1) ` +
        `eller ${BUD_DIM_V2} (v2). Trekkene er endret siden modellen ble trent – ` +
        `tren den på nytt.`,
    );
  }
  if (!m.mμ?.trær || !m.mσ?.trær) throw new Error("Budmodellen mangler skogene mμ/mσ");
  return m;
}

const forutsi = (n: Node, x: Float32Array): number =>
  n.blad ? n.verdi! : forutsi(x[n.kol!]! <= n.terskel! ? n.v! : n.h!, x);
const anslå = (s: Skog, x: Float32Array, rate: number): number =>
  s.basis + rate * s.trær.reduce((a, t) => a + forutsi(t, x), 0);

/** Normalfordelingens halesannsynlighet, Abramowitz–Stegun 7.1.26. */
function Φ(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p =
    d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

export interface Innagent {
  velgHandling(state: GameState): Handling;
  nyKamp(): void;
}

export class Budagent implements Innagent {
  private readonly indre: Innagent;
  private readonly m: Budmodell;
  private readonly evForsvar: number;
  /**
   * Gulv på usikkerheten i stikkanslaget. Er σ overvurdert, trekkes P mot 0,5
   * og modellen slutter å skille gode hender fra dårlige – den byr for likt
   * på alt. Gulvet ble satt til 0,6 mot et tidligere kortnett, og hører derfor
   * til samme klasse som `evForsvar`: et KALIBRERT ANSLAG, ikke en regel.
   */
  private readonly σGulv: number;

  constructor(indre: Innagent, m: Budmodell, evForsvar = 2.5, σGulv = 0.6) {
    this.indre = indre;
    this.m = m;
    this.evForsvar = evForsvar;
    this.σGulv = σGulv;
  }

  nyKamp(): void {
    this.indre.nyKamp();
  }

  velgHandling(state: GameState): Handling {
    if (state.fase !== "BUDRUNDE" || state.iTur === null) return this.indre.velgHandling(state);
    const lov = lovligeHandlinger(state);
    if (lov.fase !== "BUDRUNDE") return this.indre.velgHandling(state);
    const tall = lov.bud.filter((b): b is number => typeof b === "number");
    if (tall.length === 0) return this.indre.velgHandling(state);

    const sete = state.iTur;
    // Modellens EGEN bredde, ikke den nyeste. Et v1-nett skal se v1-trekk.
    const x = budTrekk(state, sete, this.m.dim);
    const μ = anslå(this.m.mμ, x, this.m.rate);
    const σ = Math.max(this.σGulv, anslå(this.m.mσ, x, this.m.rate));

    let beste: number | typeof PASS = PASS;
    let bv = this.evForsvar;
    for (const N of tall) {
      const P = 1 - Φ((N - 0.5 - μ) / σ);
      const p = this.m.vant[String(N)] ?? (N >= 11 ? 1 : 0);
      const ev = p * (2 * N * (2 * P - 1)) + (1 - p) * this.evForsvar;
      if (ev > bv) {
        bv = ev;
        beste = N;
      }
    }
    return { type: "BUD", spiller: sete, bud: beste };
  }
}
