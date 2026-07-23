/**
 * HybridAgent («turbo»-varianten): NEAT-nettet spiller budrunde, vraking,
 * trumfvalg og de tidlige stikkene – men når få stikk gjenstår, overtar
 * EKSAKT søk: verdener forenlige med spillerens informasjon samples
 * (samme sampler som PIMC-boten), hver kandidat løses eksakt med
 * dobbelt-dummy, og kortet med best forventet egenpoeng spilles.
 *
 * AlphaZero-oppskriften i miniatyr: mønstergjenkjenning der rommet er
 * stort og skjult, eksakt regning der sluttspillet er lite nok til å
 * løses. Brukes som frittstående spiller/benkmåler – IKKE i treningen
 * (der holdes nettet rent, og søket ville kostet for mye).
 */

import { lagRng } from "../kort.ts";
import {
  lovligeKort,
  type GameState,
  type Handling,
} from "../motor.ts";
import { evaluerEtterTrekk, kortTilInt } from "../solver/dds.ts";
import { byggDDOppsett, trekkVerden, type Verden } from "../solver/sampler.ts";
import { NeatAgent, type BudEstimat } from "./agent.ts";
import type { Genom } from "./genom.ts";

export interface HybridOpts {
  /** Overtar med eksakt søk når så mange (eller færre) stikk gjenstår. */
  readonly stikkTerskel?: number;
  /** Antall samplede verdener per sluttspillbeslutning. */
  readonly verdener?: number;
  readonly frø?: number;
  /** Nodetak per eksaktsøk (0 = ubegrenset). */
  readonly nodeTak?: number;
}

export class HybridAgent {
  private readonly nett: NeatAgent;
  private readonly stikkTerskel: number;
  private readonly verdener: number;
  private readonly nodeTak: number;
  private readonly rng: () => number;

  constructor(genom: Genom, opts: HybridOpts = {}) {
    this.nett = new NeatAgent(genom, { læringsrate: 0 });
    this.stikkTerskel = opts.stikkTerskel ?? 5;
    this.verdener = opts.verdener ?? 12;
    this.nodeTak = opts.nodeTak ?? 400_000;
    this.rng = lagRng((opts.frø ?? 0x7e57) >>> 0);
  }

  nyKamp(): void {
    this.nett.nyKamp();
  }

  estimatFor(rundeNr: number): BudEstimat | undefined {
    return this.nett.estimatFor(rundeNr);
  }

  velgHandling(state: GameState): Handling {
    if (state.fase === "SPILL" && state.iTur !== null) {
      const gjenstår = state.giving.antallStikk - state.stikkSpilt;
      if (gjenstår <= this.stikkTerskel) {
        const valg = this.eksaktValg(state, state.iTur);
        if (valg !== null) return valg;
      }
    }
    return this.nett.velgHandling(state);
  }

  /** Eksakt sluttspill: argmax forventet egenpoeng over samplede verdener. */
  private eksaktValg(state: GameState, spiller: number): Handling | null {
    const lovlige = lovligeKort(state, spiller);
    if (lovlige.length === 1) return { type: "SPILL", spiller, kort: lovlige[0]! };
    const kortInt = lovlige.map(kortTilInt);
    const gjenstår = state.giving.antallStikk - state.stikkSpilt;
    const sum = new Array<number>(lovlige.length).fill(0);
    let verdener = 0;
    let tomme = 0;
    while (verdener < this.verdener && tomme < 40) {
      const verden = trekkVerden(state, spiller, this.rng);
      if (!verden) {
        tomme++;
        continue;
      }
      tomme = 0;
      const oppsett = byggDDOppsett(state, verden);
      for (let i = 0; i < lovlige.length; i++) {
        const lag = evaluerEtterTrekk(oppsett, kortInt[i]!, gjenstår, this.nodeTak);
        sum[i]! += egenPoeng(lag, verden, state, spiller);
      }
      verdener++;
    }
    if (verdener === 0) return null; // sampling feilet – fall til nettet
    let best = 0;
    for (let i = 1; i < lovlige.length; i++) if (sum[i]! > sum[best]!) best = i;
    return { type: "SPILL", spiller, kort: lovlige[best]! };
  }
}

/** Egenpoeng gitt budlagets sluttstikk (samme rollemodell som PIMC-boten). */
function egenPoeng(lagStikk: number, verden: Verden, s: GameState, observator: number): number {
  const T = s.giving.antallStikk;
  const mål = s.regler.målPoeng;
  const melding = s.melding!;
  const påLag = verden.declLag[observator] === true;
  if (!påLag) {
    const antallForsvar = verden.declLag.filter((x) => !x).length;
    return (T - lagStikk) / Math.max(1, antallForsvar);
  }
  const erBudvinner = observator === s.budvinner;
  if (melding.type === "tall") {
    const sats = erBudvinner ? 2 * melding.bud : melding.bud;
    return lagStikk >= melding.bud ? sats : -sats;
  }
  if (melding.type === "amerikaner") {
    const sats = erBudvinner ? mål / 2 : mål / 4;
    return lagStikk === T ? sats : -sats;
  }
  return lagStikk === T ? mål : -mål;
}
