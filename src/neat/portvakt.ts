/**
 * PIMC-portvakter i cupen (C6): billige PIMC-solvere stiller som IKKE-
 * reproduserende deltakere i turneringen, på samme måte som hall of fame.
 * Da peker seleksjonstrykket direkte mot «slå solveren» i stedet for «slå
 * søsknene» – populasjonen kan ikke sykle rundt i selvspill, og genomer
 * som takler solverens spillestil premieres hver eneste generasjon.
 *
 * Portvakten er en tynn adapter rundt den heuristiske PIMC-boten
 * (src/bot/bot.ts) som oppfyller TurneringsAgent-grensesnittet: ingen
 * regret-læring, ingen budestimater – den bare spiller. Frøet utledes
 * deterministisk av (frøBase, beslutningsteller), så gruppekampen forblir
 * en ren funksjon av (deltakere, gruppeFrø) – parallell avvikling gir
 * bit-identisk resultat med sekvensiell.
 */

import { velgHandling as pimcVelg } from "../bot/bot.ts";
import type { GameState, Handling } from "../motor.ts";
import { NevroAgent } from "../nevro/agent.ts";
import type { BudEstimat } from "./agent.ts";
import type { Genom } from "./genom.ts";
import type { TurneringsAgent } from "./turnering.ts";

/** Sentinel som kan sendes gjennom arbeidstråd-poolen i stedet for et genom. */
export interface PimcMarkør {
  readonly pimc: true;
  /** Basefrø for portvaktens beslutninger (deterministisk per felt-plass). */
  readonly frøBase: number;
  /** Antall samplede verdener per beslutning. */
  readonly verdener: number;
  /** Stikk som løses eksakt (resten grådig) i evalueringen. */
  readonly terskel: number;
  /** Tak på kandidater × verdener per kortvalg (styrer tenketiden). */
  readonly maksEval: number;
}

/**
 * NevroHjerne-portvakt: appens ferdigtrente nett som målestokk. Sterkere
 * enn den billige PIMC-portvakten (90,1 mot 78,7 på appens stige) og flere
 * hundre ganger raskere, siden den ikke søker – portvakten koster da
 * praktisk talt ingenting av generasjonstiden.
 */
export interface NevroMarkør {
  readonly nevro: true;
}

export type PortvaktMarkør = PimcMarkør | NevroMarkør;

/** En turneringsdeltaker: et populasjons-/hallgenom eller en portvakt. */
export type Deltaker = Genom | PortvaktMarkør;

export function erPimc(d: Deltaker): d is PimcMarkør {
  return (d as PimcMarkør).pimc === true;
}

export function erNevro(d: Deltaker): d is NevroMarkør {
  return (d as NevroMarkør).nevro === true;
}

export function erPortvakt(d: Deltaker): d is PortvaktMarkør {
  return erPimc(d) || erNevro(d);
}

export function lagPortvakt(m: PortvaktMarkør): TurneringsAgent {
  return erPimc(m) ? new PimcPortvakt(m) : new NevroPortvakt();
}

/** Billige standardinnstillinger: merkbar motstand uten å dominere tiden. */
export const STD_PORTVAKT = { verdener: 3, terskel: 3, maksEval: 36 } as const;

export class PimcPortvakt implements TurneringsAgent {
  private readonly frøBase: number;
  private readonly verdener: number;
  private readonly terskel: number;
  private readonly maksEval: number;
  private teller = 0;

  constructor(markør: PimcMarkør) {
    this.frøBase = markør.frøBase >>> 0;
    this.verdener = markør.verdener;
    this.terskel = markør.terskel;
    this.maksEval = markør.maksEval;
  }

  nyKamp(): void {
    this.teller = 0;
  }

  velgHandling(state: GameState): Handling {
    return pimcVelg(state, {
      verdener: this.verdener,
      terskel: this.terskel,
      maksEval: this.maksEval,
      frø: (this.frøBase + Math.imul(this.teller++, 0x9e3779b1)) >>> 0,
    });
  }

  estimatFor(): BudEstimat | undefined {
    return undefined; // ingen regret-bokføring for portvakter
  }
}

/**
 * NevroHjerne som portvakt. Deterministisk (ren argmax, ingen sampling),
 * så gruppekampen forblir en ren funksjon av (deltakere, gruppeFrø) – og
 * den koster mikrosekunder per trekk i stedet for millisekunder.
 */
export class NevroPortvakt implements TurneringsAgent {
  private readonly agent = new NevroAgent();

  nyKamp(): void {}

  velgHandling(state: GameState): Handling {
    return this.agent.velgHandling(state);
  }

  estimatFor(): BudEstimat | undefined {
    return undefined;
  }
}
