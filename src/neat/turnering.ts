/**
 * Turneringsmotoren for evolusjonen: cup i grupper på 4 med flakskontroll.
 *
 * FLAKSKONTROLL (duplikat-prinsippet fra turneringsbridge): en gruppekamp
 * består av 4 hele kamper med NØYAKTIG samme kortgiving (samme frø), der
 * agentene roteres syklisk gjennom setene. Hver agent spiller altså hver
 * hånd fra hver posisjon; god- og dårlig-kort jevnes ut, og differansen som
 * står igjen er ferdighet – ikke flaks.
 *
 * CUPEN: feltet deles i grupper på 4; gruppevinneren (flest kampseire,
 * deretter flest duplikatpoeng) går videre, resten er slått ut – de dårlige
 * spillerne lukes bort. Hvor langt en agent når (dybden) er grunnlaget for
 * fitness. Går ikke antallet opp i 4, fylles gruppene med «lucky losers»
 * (de beste allerede utslåtte), som kan spille seg videre igjen.
 *
 * ANGER (regret): for hver kontrakt bokføres hvor feil budvinnerens
 * xT-estimat var (kalibrering) og hva feilbudet kostet (falt kontrakt,
 * eller ubrukt overskudd). Snittangeren trekkes fra i fitness – populasjonen
 * lærer på regret, ikke bare på plassering.
 */

import { lagRng } from "../kort.ts";
import type { GameState, Handling, Hendelse } from "../motor.ts";
import { opprettSpill, utfør } from "../motor.ts";
import type { BudEstimat } from "./agent.ts";

/** Det en agent må kunne for å delta (NeatAgent oppfyller dette). */
export interface TurneringsAgent {
  nyKamp(): void;
  velgHandling(state: GameState): Handling;
  estimatFor(rundeNr: number): BudEstimat | undefined;
}

export interface KampOpts {
  /** Rundetak per kamp (sikkerhetsventil; avgjøres da på poeng). */
  readonly maksRunder?: number;
  /** Handlingstak per kamp (vern mot evige budrunder hos svake nett). */
  readonly maksHandlinger?: number;
}

const STD_MAKS_RUNDER = 40;
const STD_MAKS_HANDLINGER = 20000;

export interface GruppeResultat {
  /** Sum kamppoeng per agent over alle 4 seterotasjoner. */
  readonly poeng: number[];
  /** Antall kampseire per agent (0–4). */
  readonly seire: number[];
  /** Sum anger og antall kontrakter per agent (for snittberegning). */
  readonly regretSum: number[];
  readonly regretRunder: number[];
  /** Agentindekser sortert best → dårligst. */
  readonly rekkefølge: number[];
}

/**
 * Spiller en flakskontrollert gruppekamp mellom 4 agenter: samme frø i alle
 * 4 kampene, agentene roterer ett sete per kamp.
 */
export function spillGruppekamp(
  agenter: readonly TurneringsAgent[],
  frø: number,
  rng: () => number,
  opts: KampOpts = {},
): GruppeResultat {
  if (agenter.length !== 4) throw new Error("Gruppekamp krever nøyaktig 4 agenter");
  const maksRunder = opts.maksRunder ?? STD_MAKS_RUNDER;
  const maksHandlinger = opts.maksHandlinger ?? STD_MAKS_HANDLINGER;

  const poeng = [0, 0, 0, 0];
  const seire = [0, 0, 0, 0];
  const regretSum = [0, 0, 0, 0];
  const regretRunder = [0, 0, 0, 0];

  for (let rotasjon = 0; rotasjon < 4; rotasjon++) {
    // Agent i sitter i sete (i + rotasjon) % 4.
    const agentISete = (sete: number): number => (sete - rotasjon + 4) % 4;
    for (const a of agenter) a.nyKamp();

    let state = opprettSpill({ antallSpillere: 4 }, frø);
    let handlinger = 0;
    while (state.fase !== "FERDIG" && handlinger++ < maksHandlinger) {
      if (state.fase === "RUNDE_SLUTT" && state.rundeNr + 1 >= maksRunder) break;
      const sete =
        state.fase === "VRAK" || state.fase === "VELG"
          ? state.budvinner!
          : state.fase === "RUNDE_SLUTT"
            ? 0
            : state.iTur!;
      const agent = agenter[agentISete(sete)]!;
      const handling =
        state.fase === "RUNDE_SLUTT" ? ({ type: "NESTE" } as const) : agent.velgHandling(state);
      const res = utfør(state, handling);
      bokførRegret(state, res.hendelser, agenter, agentISete, regretSum, regretRunder);
      state = res.state;
    }

    for (let sete = 0; sete < 4; sete++) {
      poeng[agentISete(sete)]! += state.totalPoeng[sete] ?? 0;
    }
    if (state.vinner !== null) seire[agentISete(state.vinner)]!++;
  }

  // Full likhet avgjøres av en forhåndstrukket loddtrekning (stabil komparator).
  const lodd = [rng(), rng(), rng(), rng()];
  const rekkefølge = [0, 1, 2, 3].sort(
    (a, b) => seire[b]! - seire[a]! || poeng[b]! - poeng[a]! || lodd[b]! - lodd[a]!,
  );
  return { poeng, seire, regretSum, regretRunder, rekkefølge };
}

/**
 * Anger for budvinnerens kontrakt når en runde er ferdig:
 *  - kalibrering: |xT-estimat − faktiske lagstikk|
 *  - utfall: falt kontrakt koster (mål − stikk); klart med slakk koster
 *    0,25 · overskuddet (poeng lagt igjen på bordet).
 * Normalisert med antall stikk i runden, slik at verdien er ~[0, 2].
 */
function bokførRegret(
  førState: GameState,
  hendelser: readonly Hendelse[],
  agenter: readonly TurneringsAgent[],
  agentISete: (sete: number) => number,
  regretSum: number[],
  regretRunder: number[],
): void {
  for (const h of hendelser) {
    if (h.type !== "RUNDE_SLUTT") continue;
    const res = h.resultat;
    const agentIdx = agentISete(res.budvinner);
    const est = agenter[agentIdx]!.estimatFor(førState.rundeNr);
    if (est === undefined) continue;
    const antallStikk = førState.giving.antallStikk;
    const mål = res.melding.type === "tall" ? res.melding.bud : antallStikk;
    const kalibrering = Math.abs(est.xt - res.lagStikk);
    const utfall = res.klart ? 0.25 * Math.max(0, res.lagStikk - mål) : mål - res.lagStikk;
    regretSum[agentIdx]! += (kalibrering + utfall) / antallStikk;
    regretRunder[agentIdx]!++;
  }
}

// ---------------------------------------------------------------------------
// Cupturnering
// ---------------------------------------------------------------------------

export interface TurneringsResultat {
  /** Hvor mange grupperunder agenten vant seg gjennom (0 = røk i første). */
  readonly dybde: number[];
  /** Sum duplikatpoeng over alle gruppekamper agenten spilte. */
  readonly poeng: number[];
  /** Sum kampseire. */
  readonly seire: number[];
  /** Snittanger per kontrakt (0 om agenten aldri vant en budrunde). */
  readonly regretSnitt: number[];
  /** Turneringsvinneren. */
  readonly mesterIdx: number;
  /** Antall grupperunder som ble spilt. */
  readonly runder: number;
}

/**
 * Kjører hele cupen. `agenter.length` må være ≥ 4 og delelig med 4 (da
 * trengs aldri utfylling i første runde). Deterministisk gitt frø.
 */
export function kjørTurnering(
  agenter: readonly TurneringsAgent[],
  frø: number,
  opts: KampOpts = {},
): TurneringsResultat {
  const n = agenter.length;
  if (n < 4 || n % 4 !== 0) {
    throw new Error("Turneringen krever minst 4 agenter og et antall delelig med 4");
  }
  const rng = lagRng(frø ^ 0x9e3779b9);

  const dybde = new Array<number>(n).fill(0);
  const poeng = new Array<number>(n).fill(0);
  const seire = new Array<number>(n).fill(0);
  const regretSum = new Array<number>(n).fill(0);
  const regretRunder = new Array<number>(n).fill(0);

  let kandidater = stokkIndekser(n, rng);
  const utslåtte = new Set<number>();
  let runde = 0;

  while (kandidater.length > 1) {
    // Fyll opp til delelig med 4 med de beste utslåtte («lucky losers»).
    const mangler = (4 - (kandidater.length % 4)) % 4;
    if (mangler > 0 || kandidater.length < 4) {
      const inne = new Set(kandidater);
      const pool = [...utslåtte]
        .filter((i) => !inne.has(i))
        .sort((a, b) => dybde[b]! - dybde[a]! || poeng[b]! - poeng[a]!);
      const behov = kandidater.length < 4 ? 4 - kandidater.length : mangler;
      for (let i = 0; i < behov && i < pool.length; i++) kandidater.push(pool[i]!);
      if (kandidater.length % 4 !== 0) {
        throw new Error("Klarte ikke fylle gruppene – for få agenter");
      }
    }

    const vinnere: number[] = [];
    for (let g = 0; g < kandidater.length; g += 4) {
      const gruppe = kandidater.slice(g, g + 4);
      const gruppeFrø = (frø + Math.imul(runde * 131 + g + 1, 0x85ebca6b)) >>> 0;
      const res = spillGruppekamp(
        gruppe.map((i) => agenter[i]!),
        gruppeFrø,
        rng,
        opts,
      );
      for (let j = 0; j < 4; j++) {
        const idx = gruppe[j]!;
        poeng[idx]! += res.poeng[j]!;
        seire[idx]! += res.seire[j]!;
        regretSum[idx]! += res.regretSum[j]!;
        regretRunder[idx]! += res.regretRunder[j]!;
      }
      const vinner = gruppe[res.rekkefølge[0]!]!;
      vinnere.push(vinner);
      dybde[vinner] = runde + 1;
      for (const idx of gruppe) if (idx !== vinner) utslåtte.add(idx);
    }
    kandidater = vinnere;
    runde++;
  }

  const regretSnitt = regretSum.map((s, i) =>
    regretRunder[i]! > 0 ? s / regretRunder[i]! : 0,
  );
  return {
    dybde,
    poeng,
    seire,
    regretSnitt,
    mesterIdx: kandidater[0]!,
    runder: runde,
  };
}

function stokkIndekser(n: number, rng: () => number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = t;
  }
  return idx;
}

// ---------------------------------------------------------------------------
// Fitness
// ---------------------------------------------------------------------------

export interface FitnessOpts {
  /** Vekten angeren trekkes fra med. */
  readonly lambdaRegret?: number;
}

/**
 * Fitness fra turneringsresultatet.
 *
 * Første turnering (`mesterIdx === null`): fitness følger hvor langt
 * agenten nådde i cupen. Senere generasjoner: fitness er RANGERING
 * RELATIVT TIL FORRIGE MESTER, som selv deltar i feltet – dybden måles som
 * differanse mot mesterens dybde (skiftet så alt er positivt). Slår du
 * mesterens dybde, får du mer enn den; når du kortere, får du mindre.
 *
 * Duplikatpoengene skiller agenter på samme dybde (< 1 i utslag, dybden
 * dominerer alltid), og snittangeren per kontrakt trekkes fra – to agenter
 * som når like langt rangeres etter hvem som byr mest presist.
 */
export function beregnFitness(
  res: TurneringsResultat,
  forrigeMesterIdx: number | null,
  opts: FitnessOpts = {},
): number[] {
  const lambda = opts.lambdaRegret ?? 0.5;
  const n = res.dybde.length;
  const maksDybde = Math.max(...res.dybde);
  const referanse = forrigeMesterIdx === null ? 0 : res.dybde[forrigeMesterIdx]!;

  let minP = Infinity;
  let maksP = -Infinity;
  for (const p of res.poeng) {
    minP = Math.min(minP, p);
    maksP = Math.max(maksP, p);
  }
  const spenn = maksP - minP || 1;

  const fitness = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const relativDybde = res.dybde[i]! - referanse + maksDybde; // ≥ 0
    const base = (relativDybde + 1) * 2;
    const poengBonus = ((res.poeng[i]! - minP) / spenn) * 0.9;
    const anger = lambda * res.regretSnitt[i]!;
    fitness[i] = Math.max(0.05, base + poengBonus - anger);
  }
  return fitness;
}
