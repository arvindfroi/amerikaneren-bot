/**
 * E1s orakel: fasiten nettet skal destilleres fra.
 *
 * For hvert lovlig kort samples mange kortfordelinger som er forenlige med
 * spillerens informasjon, hver løses med den eksakte dobbelt-dummy-søkeren,
 * og verdien er forventet EGENPOENG. Det er samme regnemodell som
 * PIMC-boten – men uten sanntidsbudsjett: orakelet får bruke sekunder per
 * beslutning der en spillende bot har millisekunder.
 *
 * Hvorfor ikke destillere MesterAI, slik appen gjorde for NevroHjerne? Da
 * er taket MesterAI. NevroHjerne endte på 90,1 mot MesterAIs 105,3 på
 * appens stige – en elev når ikke forbi læreren sin. Skal E1 SLÅ MesterAI,
 * må fasiten være noe sterkere enn MesterAI, og det eneste vi har som er
 * det, er eksakt løsning av mange verdener uten tidspress.
 */

import { lagRng, type Kort } from "../kort.ts";
import { lovligeKort, type GameState } from "../motor.ts";
import { egenPoeng } from "../neat/hybrid.ts";
import { evaluerEtterTrekk, kortTilInt } from "../solver/dds.ts";
import { byggDDOppsett, trekkVerdenBelief } from "../solver/sampler.ts";

export interface OrakelOpts {
  /** Antall samplede verdener. Flere = lavere varians i fasiten. */
  readonly verdener: number;
  /** Stikk som løses EKSAKT per verden (resten spilles grådig fram dit). */
  readonly dybde: number;
  readonly nodeTak: number;
  readonly frø: number;
}

export interface OrakelSvar {
  readonly kort: readonly Kort[];
  /** Forventet egenpoeng per kort, i samme rekkefølge som `kort`. */
  readonly verdi: readonly number[];
  /** Hvor mange verdener som faktisk ble samplet (kan bli færre enn bedt om). */
  readonly verdener: number;
}

/**
 * Verditabellen over alle lovlige kort. Returnerer null når stillingen
 * ikke gir noe å lære av (0–1 lovlige kort) eller samplingen mislykkes.
 */
export function orakelVerdier(state: GameState, spiller: number, opts: OrakelOpts): OrakelSvar | null {
  const lovlige = lovligeKort(state, spiller);
  if (lovlige.length < 2) return null;
  const rng = lagRng(opts.frø >>> 0);
  const kortInt = lovlige.map(kortTilInt);
  const sum = new Array<number>(lovlige.length).fill(0);
  let verdener = 0;
  let tomme = 0;
  while (verdener < opts.verdener && tomme < 40) {
    const verden = trekkVerdenBelief(state, spiller, rng);
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
  return { kort: lovlige, verdi: sum.map((s) => s / verdener), verdener };
}
