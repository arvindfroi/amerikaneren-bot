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

import { lagRng, type Kort } from "../kort.ts";
import {
  lovligeKort,
  type GameState,
  type Handling,
} from "../motor.ts";
import { evaluerEtterTrekk, kortTilInt } from "../solver/dds.ts";
import { byggDDOppsett, trekkVerdenBelief, type Verden } from "../solver/sampler.ts";
import { NeatAgent, type BudEstimat } from "./agent.ts";
import type { Genom } from "./genom.ts";

export interface SolverKortOpts {
  /** Antall samplede verdener forenlige med spillerens informasjon. */
  readonly verdener: number;
  /** Stikk som løses eksakt per verden (resten spilles grådig). */
  readonly dybde: number;
  readonly nodeTak: number;
  readonly rng: () => number;
  /** Begrens søket til disse kandidatene (ellers alle lovlige kort). */
  readonly kandidater?: readonly Kort[];
}

/**
 * Solverens beste kort fra SPILLERENS eget informasjonsbilde: verdener
 * samples, hver kandidat evalueres (grådig ned til `dybde` stikk igjen, så
 * eksakt), og argmax forventet egenpoeng returneres. null hvis samplingen
 * feiler. Gjenbrukes av HybridAgent (sluttspill + midtspill) og av
 * turneringens sluttsøk/spillfasit (D1-linja).
 */
export function solverBesteKort(
  state: GameState,
  spiller: number,
  opts: SolverKortOpts,
): Kort | null {
  const lovlige = opts.kandidater ?? lovligeKort(state, spiller);
  if (lovlige.length === 0) return null;
  if (lovlige.length === 1) return lovlige[0]!;
  const kortInt = lovlige.map(kortTilInt);
  const sum = new Array<number>(lovlige.length).fill(0);
  let verdener = 0;
  let tomme = 0;
  while (verdener < opts.verdener && tomme < 40) {
    const verden = trekkVerdenBelief(state, spiller, opts.rng);
    if (!verden) {
      tomme++;
      continue;
    }
    tomme = 0;
    const oppsett = byggDDOppsett(state, verden);
    for (let i = 0; i < lovlige.length; i++) {
      const lag = evaluerEtterTrekk(oppsett, kortInt[i]!, opts.dybde, opts.nodeTak);
      sum[i]! += egenPoeng(lag, verden, state, spiller);
    }
    verdener++;
  }
  if (verdener === 0) return null;
  let best = 0;
  for (let i = 1; i < lovlige.length; i++) if (sum[i]! > sum[best]!) best = i;
  return lovlige[best]!;
}

export interface HybridOpts {
  /** Overtar med eksakt søk når så mange (eller færre) stikk gjenstår. */
  readonly stikkTerskel?: number;
  /** Antall samplede verdener per sluttspillbeslutning. */
  readonly verdener?: number;
  readonly frø?: number;
  /** Nodetak per eksaktsøk (0 = ubegrenset). */
  readonly nodeTak?: number;
  /**
   * MIDTSPILLSØK (C6): antall kandidatkort nettets korthode nominerer i
   * stikk FØR sluttspillterskelen. 0 (standard) = av; da spiller nettet
   * midtspillet alene. Med K > 0 verifiseres nettets topp-K i samplede
   * verdener (grådig ned til `midtDybde` stikk igjen, deretter eksakt –
   * samme regnemodell som PIMC-boten), og argmax forventet egenpoeng
   * spilles. Nettet gir intuisjonen, søket presisjonen.
   */
  readonly midtKandidater?: number;
  /** Antall samplede verdener per midtspillbeslutning. */
  readonly midtVerdener?: number;
  /** Stikk som løses eksakt i midtspillevalueringen (resten grådig). */
  readonly midtDybde?: number;
}

export class HybridAgent {
  private readonly nett: NeatAgent;
  private readonly stikkTerskel: number;
  private readonly verdener: number;
  private readonly nodeTak: number;
  private readonly rng: () => number;
  private readonly midtKandidater: number;
  private readonly midtVerdener: number;
  private readonly midtDybde: number;

  constructor(genom: Genom, opts: HybridOpts = {}) {
    this.nett = new NeatAgent(genom, { læringsrate: 0 });
    this.stikkTerskel = opts.stikkTerskel ?? 5;
    this.verdener = opts.verdener ?? 12;
    this.nodeTak = opts.nodeTak ?? 400_000;
    this.rng = lagRng((opts.frø ?? 0x7e57) >>> 0);
    this.midtKandidater = opts.midtKandidater ?? 0;
    this.midtVerdener = opts.midtVerdener ?? 8;
    this.midtDybde = opts.midtDybde ?? 6;
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
      } else if (this.midtKandidater > 0) {
        const valg = this.midtValg(state, state.iTur);
        if (valg !== null) return valg;
      }
    }
    return this.nett.velgHandling(state);
  }

  /**
   * Midtspillsøk: nettets korthode nominerer topp-K kandidater, som
   * verifiseres i samplede verdener (grådig til `midtDybde` stikk igjen,
   * så eksakt). Argmax forventet egenpoeng spilles.
   */
  private midtValg(state: GameState, spiller: number): Handling | null {
    const lovlige = lovligeKort(state, spiller);
    if (lovlige.length === 1) return { type: "SPILL", spiller, kort: lovlige[0]! };
    const kandidater = this.nett
      .rangerKort(state, spiller, lovlige)
      .slice(0, this.midtKandidater);
    const kort = solverBesteKort(state, spiller, {
      verdener: this.midtVerdener,
      dybde: this.midtDybde,
      nodeTak: this.nodeTak,
      rng: this.rng,
      kandidater,
    });
    return kort !== null ? { type: "SPILL", spiller, kort } : null;
  }

  /** Eksakt sluttspill: argmax forventet egenpoeng over samplede verdener. */
  private eksaktValg(state: GameState, spiller: number): Handling | null {
    const gjenstår = state.giving.antallStikk - state.stikkSpilt;
    const kort = solverBesteKort(state, spiller, {
      verdener: this.verdener,
      dybde: gjenstår,
      nodeTak: this.nodeTak,
      rng: this.rng,
    });
    return kort !== null ? { type: "SPILL", spiller, kort } : null;
  }
}

/** Egenpoeng gitt budlagets sluttstikk (samme rollemodell som PIMC-boten). */
export function egenPoeng(lagStikk: number, verden: Verden, s: GameState, observator: number): number {
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
