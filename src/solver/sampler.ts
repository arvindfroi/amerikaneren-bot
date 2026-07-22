/**
 * Verdenssampler for imperfekt informasjon.
 *
 * En bot ser bare sin egen hånd, de spilte kortene og offentlig info. For å
 * spille nær optimalt (PIMC) trekker den mange «verdener» – komplette
 * kortfordelinger som er forenlige med alt den vet – og løser hver eksakt.
 *
 * Denne modulen bygger slike determiniseringer fra en GameState sett fra én
 * spiller, og respekterer:
 *  - egen hånd og alle spilte kort (kjent),
 *  - motspillernes håndstørrelser (offentlig),
 *  - fargesvikt: en spiller som ikke fulgte farge er renonce i den fargen,
 *  - det etterlyste kortet ligger alltid hos en motspiller (aldri i vraket),
 *  - budvinnerens eget vrak når observatøren er budvinner.
 */

import { FARGER, type Kort } from "../kort.ts";
import { kortTilInt } from "./dds.ts";
import type { DDOppsett } from "./dds.ts";
import type { GameState } from "../motor.ts";

export interface Verden {
  /** Komplette hender for alle spillere (kort-int), inkl. observatøren. */
  readonly hender: number[][];
  /** declLag[spiller] = på budlaget (budvinner + makker i denne verdenen). */
  readonly declLag: boolean[];
  /** Makkeren i denne verdenen, eller null (solo / ingen). */
  readonly makkerVerden: number | null;
}

function alleKortInt(): number[] {
  const ut: number[] = [];
  for (let c = 0; c < 52; c++) ut.push(c);
  return ut;
}

/** Renonce-fargeindekser per spiller ut fra spillet så langt. */
export function infererRenonce(state: GameState): Set<number>[] {
  const voids: Set<number>[] = [];
  for (let p = 0; p < state.antallSpillere; p++) voids.push(new Set());
  const behandle = (kort: { spiller: number; kort: Kort }[]): void => {
    if (kort.length === 0) return;
    const led = FARGER.indexOf(kort[0]!.kort.farge);
    for (const kp of kort) {
      const f = FARGER.indexOf(kp.kort.farge);
      if (f !== led) voids[kp.spiller]!.add(led);
    }
  };
  for (const s of state.historikk) behandle(s.kort);
  behandle(state.bord);
  return voids;
}

function stokkInt(arr: number[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
}

interface Bin {
  spiller: number; // -1 = vrak (dødt)
  kapasitet: number;
  forbud: Set<number> | null; // forbudte farger (renonce)
  kort: number[];
}

/**
 * Trekker én determinisering forenlig med observatørens informasjon.
 * Returnerer null dersom en gyldig fordeling ikke ble funnet (svært sjelden;
 * kalleren kan prøve igjen).
 */
export function trekkVerden(state: GameState, observator: number, rng: () => number): Verden | null {
  const N = state.antallSpillere;
  const budvinner = state.budvinner;

  // Spilte kort (offentlig) + observatørens hånd + eget vrak.
  const brukt = new Set<number>();
  for (const s of state.historikk) for (const kp of s.kort) brukt.add(kortTilInt(kp.kort));
  for (const kp of state.bord) brukt.add(kortTilInt(kp.kort));
  const egen = state.hender[observator]!.map(kortTilInt);
  for (const c of egen) brukt.add(c);
  const observatorErBudvinner = observator === budvinner;
  if (observatorErBudvinner) for (const k of state.vrak) brukt.add(kortTilInt(k));

  const usett = alleKortInt().filter((c) => !brukt.has(c));

  const voids = infererRenonce(state);
  const dødKapasitet = observatorErBudvinner ? 0 : state.giving.talong;

  const etterlystInt = state.etterlyst ? kortTilInt(state.etterlyst) : null;
  const erSolo = state.melding?.type === "solo";
  const spiltEtterlyst = etterlystInt !== null && brukt.has(etterlystInt);
  const måPlassereEtterlyst =
    etterlystInt !== null && !spiltEtterlyst && usett.includes(etterlystInt);

  const forsøk = (relaksVoids: boolean): Verden | null => {
    const bins: Bin[] = [];
    for (let p = 0; p < N; p++) {
      if (p === observator) continue;
      bins.push({
        spiller: p,
        kapasitet: state.hender[p]!.length,
        forbud: relaksVoids ? null : voids[p]!,
        kort: [],
      });
    }
    if (dødKapasitet > 0) {
      bins.push({ spiller: -1, kapasitet: dødKapasitet, forbud: null, kort: [] });
    }

    const igjen = usett.slice();
    stokkInt(igjen, rng);

    // Plasser det etterlyste kortet hos en tillatt motspiller (aldri i vraket).
    if (måPlassereEtterlyst && etterlystInt !== null) {
      const f = Math.floor(etterlystInt / 13);
      const kandidater = bins.filter(
        (b) => b.spiller !== -1 && b.kapasitet > 0 && !(b.forbud && b.forbud.has(f)),
      );
      if (kandidater.length === 0) return null;
      const b = kandidater[Math.floor(rng() * kandidater.length)]!;
      b.kort.push(etterlystInt);
      b.kapasitet--;
      igjen.splice(igjen.indexOf(etterlystInt), 1);
    }

    // Mest begrensede kort først (farge forbudt av flest bins).
    igjen.sort((a, b) => forbudtAntall(bins, b) - forbudtAntall(bins, a));

    for (const c of igjen) {
      const f = Math.floor(c / 13);
      let sumKap = 0;
      for (const b of bins) if (b.kapasitet > 0 && !(b.forbud && b.forbud.has(f))) sumKap += b.kapasitet;
      if (sumKap === 0) return null;
      let valg = Math.floor(rng() * sumKap);
      let plassert = false;
      for (const b of bins) {
        if (b.kapasitet <= 0 || (b.forbud && b.forbud.has(f))) continue;
        valg -= b.kapasitet;
        if (valg < 0) {
          b.kort.push(c);
          b.kapasitet--;
          plassert = true;
          break;
        }
      }
      if (!plassert) return null;
    }

    // Bygg hender.
    const hender: number[][] = [];
    for (let p = 0; p < N; p++) hender.push(p === observator ? egen.slice() : []);
    for (const b of bins) if (b.spiller !== -1) hender[b.spiller] = b.kort;

    // Makker i denne verdenen.
    let makkerVerden: number | null = null;
    if (!erSolo && etterlystInt !== null) {
      if (spiltEtterlyst) makkerVerden = state.makker;
      else {
        for (let p = 0; p < N; p++) if (hender[p]!.includes(etterlystInt)) makkerVerden = p;
      }
    }
    const declLag = new Array<boolean>(N).fill(false);
    if (budvinner !== null) declLag[budvinner] = true;
    if (makkerVerden !== null) declLag[makkerVerden] = true;

    return { hender, declLag, makkerVerden };
  };

  for (let i = 0; i < 30; i++) {
    const v = forsøk(false);
    if (v) return v;
  }
  // Fall tilbake til å ignorere renonce-hint hvis fordelingen er vanskelig.
  for (let i = 0; i < 10; i++) {
    const v = forsøk(true);
    if (v) return v;
  }
  return null;
}

function forbudtAntall(bins: Bin[], c: number): number {
  const f = Math.floor(c / 13);
  let n = 0;
  for (const b of bins) if (b.forbud && b.forbud.has(f)) n++;
  return n;
}

/** Bygger et DD-oppsett for stillingen NÅ (før spiller i tur har lagt kort). */
export function byggDDOppsett(state: GameState, verden: Verden): DDOppsett {
  const trump = state.trumf ? FARGER.indexOf(state.trumf) : 0;
  const bord = state.bord.map((kp) => ({ spiller: kp.spiller, kort: kortTilInt(kp.kort) }));
  let declStikkFør = 0;
  for (let p = 0; p < state.antallSpillere; p++) {
    if (verden.declLag[p]) declStikkFør += state.stikkVunnet[p] ?? 0;
  }
  return {
    N: state.antallSpillere,
    trump,
    declLag: verden.declLag,
    hender: verden.hender,
    iTur: state.iTur!,
    bord,
    declStikkFør,
    ferdigeStikk: state.stikkSpilt,
    totalStikk: state.giving.antallStikk,
  };
}
