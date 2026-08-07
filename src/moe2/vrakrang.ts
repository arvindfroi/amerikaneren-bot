/**
 * VRAK OG TRUMF MED EN LÆRT RANGERER — ingen søk ved spilletid.
 *
 * Arvind: «når det kommer til vrak og trumf komboen så bør det ikke være søk.
 * du må finne noe bedre.»
 *
 * HVORFOR SØK TAPTE, målt på `examples/vrakbenk.ts` over 3 000
 * budvinnerrunder: **−0,5119 ± 0,2501** mot NevroHjerne. Ved vrak er ingenting
 * spilt, så verdensrommet er 3,8 × 10¹⁴, og `argmax` over kandidater som hver
 * er anslått på 24 trukne verdener plukker den som fikk de snilleste verdenene.
 * Skjevheten VOKSER med antall kandidater.
 *
 * MEN STØYEN ER ET SANNTIDSPROBLEM. Offline har vi råd til 40 verdener per
 * kandidat, felles per stilling, og resten av støyen midles bort over tusenvis
 * av stillinger under trening. Samme mekanisme som gjorde SD-orakelet til en
 * god LÆRER for forsvarsspillet (+0,187) selv om det er en dårlig SPILLER der
 * (−0,09).
 *
 * MÅLT PÅ HOLDOUT (`verktoy/vrak-tren.py`, 1 132 stillinger, giv-delt):
 *
 *     NevroHjernes egen anger   1,8062
 *     rangeringsmodellen        0,6347
 *
 * altså **1,17 poeng bedre per budvinnerrunde** på givere modellen aldri har
 * sett. Om det holder i spill avgjøres av vrakbenken, ikke av dette tallet.
 *
 * NEVROHJERNES EGET PAR ER ALLTID EN KANDIDAT. Uten det kan velgeren bare
 * gjøre det verre: policyen «kast de fire laveste» overstyrte NevroHjerne 897
 * ganger av 3 000 og målte −0,5396, fordi kandidatene var dårligere enn det de
 * skulle slå. Med det bestående i settet kan modellen velge å la være.
 */

import { FARGER, type Farge, type Kort } from "../kort.ts";
import { lovligeEtterlys, utfør, type GameState, type Handling } from "../motor.ts";
import { forover, type NevroNett } from "../nevro/nett.ts";
import { NevroAgent } from "../nevro/index.ts";
import { lesVrakflagg, type Vrakpolicy } from "./vrakpolicy.ts";
import { vraktrekk, VRAK_DIM } from "./vraktrekk.ts";

const nøkkel = (k: Kort): string => `${k.farge}${k.verdi}`;

/** Samme kandidatgenerering som merkingen brukte – policyene, ikke en heuristikk. */
export function vrakkandidater(
  hånd: readonly Kort[],
  trumf: Farge,
  antall: number,
  pol: Vrakpolicy,
): Kort[][] {
  const pool = hånd.filter(
    (k) =>
      !(pol.ikkeTrumf && k.farge === trumf) &&
      !(pol.ikkeEss && k.verdi === 14) &&
      !(pol.ikkeKonge && k.verdi === 13),
  );
  if (pool.length < antall) return [];
  const lavest = pool.slice().sort((a, b) => a.verdi - b.verdi);
  const ut: Kort[][] = [];
  const sett = new Set<string>();
  const legg = (v: Kort[]): void => {
    if (v.length !== antall) return;
    const n = v.map(nøkkel).sort().join(",");
    if (!sett.has(n)) {
      sett.add(n);
      ut.push(v);
    }
  };
  const perFarge = new Map<Farge, Kort[]>();
  for (const k of hånd) perFarge.set(k.farge, [...(perFarge.get(k.farge) ?? []), k]);
  if (pol.laveste) legg(lavest.slice(0, antall));
  const forbudt = (k: Kort): boolean =>
    (pol.ikkeEss && k.verdi === 14) || (pol.ikkeKonge && k.verdi === 13);
  const korte = [...perFarge.entries()]
    .filter(([f, ks]) => f !== trumf && ks.length <= antall && !ks.some(forbudt))
    .sort((a, b) => a[1].length - b[1].length);
  if (pol.renonse) {
    for (const [f, ks] of korte) {
      legg([...ks, ...lavest.filter((k) => k.farge !== f).slice(0, antall - ks.length)]);
    }
  }
  if (pol.dobbelRenonse) {
    for (let i = 0; i < korte.length; i++) {
      for (let j = i + 1; j < korte.length; j++) {
        const a = korte[i]![1];
        const b = korte[j]![1];
        if (a.length + b.length > antall) continue;
        const brukt = new Set([...a, ...b].map(nøkkel));
        legg([
          ...a,
          ...b,
          ...lavest.filter((k) => !brukt.has(nøkkel(k))).slice(0, antall - a.length - b.length),
        ]);
      }
    }
  }
  return ut;
}

export class Vrakrangerer {
  private readonly indre: { velgHandling(s: GameState): Handling; nyKamp(): void };
  private readonly nett: NevroNett;
  private readonly policy: Vrakpolicy;
  private readonly nevro = new NevroAgent();
  private valgt: Farge | null = null;

  constructor(
    indre: { velgHandling(s: GameState): Handling; nyKamp(): void },
    nett: NevroNett,
    flagg = "telrd",
  ) {
    const første = nett.lag[0]!;
    // BREDDEN HÅNDHEVES. Et nett med feil inngang ville gitt tause søppelvalg
    // i stedet for en feilmelding, og vrakvalget er én per runde – feilen ville
    // vært nesten usynlig i statistikken.
    if (første.inn !== VRAK_DIM) {
      throw new Error(`Vrakrangereren tar ${VRAK_DIM} trekk, nettet har ${første.inn}`);
    }
    const siste = nett.lag[nett.lag.length - 1]!;
    if (siste.ut !== 1) throw new Error(`Rangereren må ha ÉN utgang, nettet har ${siste.ut}`);
    this.indre = indre;
    this.nett = nett;
    this.policy = lesVrakflagg(flagg);
  }

  nyKamp(): void {
    this.indre.nyKamp();
    this.nevro.nyKamp();
    this.valgt = null;
  }

  /**
   * Videresender bokfoeringskroken. Uten den naar `observer` aldri
   * `Profilagent`, som ligger LENGER NED i stakken enn dette laget - og da er
   * profilen tom paa kampbenken (maalt 0 bokfoerte runder mot 25 med tikk).
   */
  observer(state: GameState): void {
    (this.indre as { observer?(s: GameState): void }).observer?.(state);
  }

  velgHandling(state: GameState): Handling {
    if (state.fase === "VRAK" && state.budvinner !== null) {
      const h = this.velgPar(state, state.budvinner);
      if (h !== null) return h;
    }
    if (state.fase === "VELG" && state.budvinner !== null && this.valgt !== null) {
      const trumf = this.valgt;
      this.valgt = null;
      const kand = lovligeEtterlys(state, trumf);
      // Høyeste lovlige. Målt 4. august: nest høyeste koster −0,911, tredje
      // −1,641. Regelen er riktig og skal stå.
      return {
        type: "VELG",
        spiller: state.budvinner,
        trumf,
        etterlyst: kand.length > 0 ? kand[kand.length - 1]! : null,
      };
    }
    return this.indre.velgHandling(state);
  }

  private velgPar(state: GameState, sete: number): Handling | null {
    const hånd = (state.hender[sete] ?? []).slice();
    const antall = state.giving.talong;
    if (antall <= 0 || hånd.length <= antall) return null;

    const par: { trumf: Farge; vrak: Kort[] }[] = [];
    for (const trumf of FARGER) {
      for (const vrak of vrakkandidater(hånd, trumf, antall, this.policy)) par.push({ trumf, vrak });
    }
    // NEVROHJERNES EGET PAR, alltid med.
    const eget = this.nevroPar(state, sete);
    if (eget !== null) {
      const n = eget.vrak.map(nøkkel).sort().join(",");
      if (!par.some((p) => p.trumf === eget.trumf && p.vrak.map(nøkkel).sort().join(",") === n)) {
        par.push(eget);
      }
    }
    if (par.length === 0) return null;

    let beste = par[0]!;
    let besteScore = -Infinity;
    for (const p of par) {
      const s = forover(this.nett, vraktrekk(state, sete, hånd, p.vrak, p.trumf))[0] ?? 0;
      if (s > besteScore) {
        besteScore = s;
        beste = p;
      }
    }
    this.valgt = beste.trumf;
    return { type: "VRAK", spiller: sete, kort: beste.vrak };
  }

  /** NevroHjernes eget par: dens vrak, og trumfen den ville valgt etterpå. */
  private nevroPar(s: GameState, sete: number): { trumf: Farge; vrak: Kort[] } | null {
    const h = this.nevro.velgHandling(s);
    if (h.type !== "VRAK") return null;
    const vrak = h.kort.slice();
    // Trumfen regnes av hånden som BLIR IGJEN, så den må simuleres.
    const etter = utfør(s, { type: "VRAK", spiller: sete, kort: vrak }).state;
    const v = this.nevro.velgHandling(etter);
    if (v.type !== "VELG") return null;
    return { trumf: v.trumf, vrak };
  }
}
