/**
 * BUDAGENTEN: budmodellen satt inn som en spiller.
 *
 * Legger seg utenpå en vilkårlig agent og overtar BARE budrunden. Kortspill,
 * vrak og trumfvalg går urørt videre til den indre agenten – samme
 * forsøksdesign som `Konvensjonsvakt`, og av samme grunn: en målt forskjell
 * kan da bare komme fra budet.
 *
 * BESLUTNINGEN er ikke en klassifisering av «hvilket bud», men en utregning:
 *
 *     modellen gir  (μ, σ) for fordelingen av lagstikk
 *     P(N)        = 1 − Φ((N − 0,5 − μ)/σ)
 *     EV(N)       = P(vinner budrunden med N) · 2N(2P(N)−1)
 *                 + (1 − P(vinner)) · EV(forsvar)
 *     valg        = argmax over lovlige N, mot PASS
 *
 * Modellen lærer altså det som varierer mellom hender, og utbetalingstabellen
 * – som er kjent eksakt – regnes ut i stedet for å læres. Se
 * `examples/budmodell.ts` for hvorfor: å lære 6–8 EV-utganger hver for seg er
 * å lære den samme støyen åtte ganger.
 *
 * ================== EN AVHENGIGHET SOM MÅ STÅ HER =========================
 *
 * Modellen kan anbefale bud 8 eller 11. Kortnettet er trent på data der 92 %
 * av kontraktene er bud 9–10 (`analyse/budhandling.txt`), så det spiller en
 * åtter som om den var en nier. En budmodell er derfor ikke uavhengig av
 * fase 0 i `docs/budplan.md` – blir denne målt negativt FØR kortnettet er
 * trent på spredte kontrakter, er det ikke budmodellen som er motbevist.
 *
 * BUDRUNDE-SANNSYNLIGHETEN er lagret i modellfila som en populasjonsstørrelse.
 * Den avhenger nesten bare av hva de ANDRE har, ikke av vår egen hånd, og er
 * derfor estimert én gang over datasettet i stedet for per hånd. Det er en
 * forenkling: mot en motstander som byr annerledes enn NevroHjerne er kurven
 * en annen, og da må modellen måles på nytt.
 */

import { readFileSync } from "node:fs";

import { lovligeHandlinger, type GameState, type Handling } from "../motor.ts";
import { PASS } from "../regler.ts";
import { budTrekk, BUD_DIM } from "./budtrekk.ts";

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

export function lesBudmodell(fil: string): Budmodell {
  const m = JSON.parse(readFileSync(fil, "utf8")) as Budmodell;
  if (m.dim !== BUD_DIM) {
    throw new Error(
      `Budmodellen er trent med ${m.dim} trekk, men budTrekk gir ${BUD_DIM}. ` +
        `Trekkene er endret siden modellen ble trent – tren den på nytt.`,
    );
  }
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
  /**
   * Anslått verdi av å sitte som forsvarer. Målt over datasettet
   * (`analyse/bud-kvant.txt`) og lagt inn som konstant: å estimere den per
   * hånd ville krevd egne utspillinger i budøyeblikket, altså nettopp den
   * kjøretidsregningen modellen finnes for å slippe.
   */
  private readonly evForsvar: number;

  constructor(indre: Innagent, m: Budmodell, evForsvar = 2.5) {
    this.indre = indre;
    this.m = m;
    this.evForsvar = evForsvar;
  }

  nyKamp(): void {
    this.indre.nyKamp();
  }

  velgHandling(state: GameState): Handling {
    if (state.fase !== "BUDRUNDE" || state.iTur === null) return this.indre.velgHandling(state);
    const lov = lovligeHandlinger(state);
    if (lov.fase !== "BUDRUNDE") return this.indre.velgHandling(state);
    const tall = lov.bud.filter((b): b is number => typeof b === "number");
    // Ingen tallbud igjen – da er valget uansett ikke modellens.
    if (tall.length === 0) return this.indre.velgHandling(state);

    const sete = state.iTur;
    const x = budTrekk(state, sete);
    const μ = anslå(this.m.mμ, x, this.m.rate);
    const σ = Math.max(0.6, anslå(this.m.mσ, x, this.m.rate));

    let beste: number | typeof PASS = PASS;
    let bv = this.evForsvar;
    for (const N of tall) {
      const P = 1 - Φ((N - 0.5 - μ) / σ);
      // Bud utenfor det modellen har sett budrunde-tall for: anta at et hoeyt
      // bud vinner budrunden. Det er riktig retning - jo hoeyere bud, jo
      // sjeldnere blir man overbudt - og feiler konservativt for de lave.
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
