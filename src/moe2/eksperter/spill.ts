/**
 * SPILL-EKSPERTENE – én per rolle: fører, forsvar, makker.
 *
 * FASIT: orakelbenken (`src/neat/angerbenk.ts`, data fra
 * `examples/e1-orakel.ts`). For hvert lovlig kort har orakelet regnet
 * forventet egenpoeng over samplede verdener, hver løst med dobbelt-dummy.
 * Angeren er `max(v) − v(valgt)`.
 *
 * HVORFOR TRE EKSPERTER OG IKKE ÉN MED EN ROLLESENSOR. Poengtap-
 * dekomponeringen målte at spillefører taper 16–32 poeng per runde mens
 * forsvar taper 2,2–2,6, og forsvarsprofilen viste at feilene er kvalitativt
 * ulike (trumfe inn når renons: 23 % mot nevros 68 %; ta stikket når budlaget
 * leder: 69 % mot 85 %). Et felles 52-korts hode må veie de to mot hverandre
 * gjennom delte vekter, og det er nøyaktig mekanismen som gjorde `lærForsvar`
 * verre enn ingenting.
 *
 * LÆREMÅLET ER ETT KORT OPP, INGEN NED. Det er ikke en forglemmelse.
 * `lærForsvar` satte mål for HVERT lovlig kort, ett opp og n−1 ned, og målte
 * monotont verre resultat med mer trening (trumfing 30 % → 27 % → 20 %) fordi
 * nettosignalet på det delte hodet pekte nedover for alle kort. Den formen
 * som ER målt å virke er en smal dytt på orakelets beste kort: 6 epoker over
 * 600 stillinger flyttet et avmettet genom fra anger 1,114 til 0,990, og
 * holdout bekreftet 1,0848 → 0,8580.
 */

import { readdirSync, readFileSync } from "node:fs";

import { type Benkstilling } from "../../neat/angerbenk.ts";
import { ANTALL_INN, INNGANG } from "../../neat/trekk.ts";
import { forover, nevroHjerne } from "../../nevro/nett.ts";
import { type Ekspert, type Rolle, type Råstilling } from "./felles.ts";
import {
  projiser,
  SPILL_FORSVAR_SENSORER,
  SPILL_FØRER_SENSORER,
  SPILL_MAKKER_SENSORER,
} from "./sensorer.ts";

/** Handlingen er kortindeksen 0..51. */
export type Spillhandling = number;

/**
 * En rad i orakelbenken, med GIVA den kommer fra.
 *
 * `frø` skrives av `examples/e1-orakel.ts` og er nøkkelen til giva. Uten den
 * kan stillinger fra samme runde – altså med de samme fire hendene – havne i
 * hver sin del av utvalget, og holdouten er da ikke uavhengig. Rader uten
 * `frø` grupperes derfor på (stikk, kortsett), som er så nær giva vi kommer
 * uten den.
 */
type Benkrad = Benkstilling & { readonly frø?: number };

function lagSpillekspert(
  navn: "spill-fører" | "spill-forsvar" | "spill-makker",
  rolle: Rolle,
  sensorer: readonly number[],
): Ekspert<Spillhandling> {
  return {
    navn,
    fase: "SPILL",
    rolle,
    sensorer,
    antallUt: 52,
    velg(ut, s) {
      let beste = 0;
      let besteScore = -Infinity;
      for (let i = 0; i < s.handlinger.length; i++) {
        const score = ut[s.handlinger[i]!]!;
        if (score > besteScore) {
          besteScore = score;
          beste = i;
        }
      }
      return beste;
    },
  };
}

export const spillFørerEkspert = lagSpillekspert("spill-fører", "fører", SPILL_FØRER_SENSORER);
export const spillForsvarEkspert = lagSpillekspert(
  "spill-forsvar",
  "forsvar",
  SPILL_FORSVAR_SENSORER,
);
export const spillMakkerEkspert = lagSpillekspert("spill-makker", "makker", SPILL_MAKKER_SENSORER);

export const SPILLEKSPERTER: Record<Rolle, Ekspert<Spillhandling>> = {
  fører: spillFørerEkspert,
  forsvar: spillForsvarEkspert,
  makker: spillMakkerEkspert,
};

/**
 * Rollen en benkstilling tilhører, lest rett ut av NEAT-vektoren.
 *
 * Dette er samme deterministiske portvakt som `portvakt()` – bare avlest fra
 * inngangsvektoren i stedet for fra en GameState, siden benken lagrer
 * vektoren og ikke stillingen. `ER_BUDVINNER`, `ER_HEMMELIG_MAKKER` og
 * `ER_FORSVARER` er gjensidig utelukkende per konstruksjon i `lagInn`.
 */
export function rolleFraVektor(nt: readonly number[]): Rolle | null {
  if (nt.length !== ANTALL_INN) return null;
  if (nt[INNGANG.ER_BUDVINNER] === 1) return "fører";
  if (nt[INNGANG.ER_HEMMELIG_MAKKER] === 1) return "makker";
  if (nt[INNGANG.ER_FORSVARER] === 1) return "forsvar";
  return null;
}

export interface SpillstillingOpts {
  /** Mappe med orakelbenkens .jsonl-filer. Må ha NEAT-vektoren (`nt`). */
  readonly mappe: string;
  /** Maks antall stillinger PER ROLLE. */
  readonly perRolle: number;
  /**
   * Plukk hver n-te linje. Nabolinjer kommer fra samme runde og er sterkt
   * korrelerte; uten et steg måler man én giv mange ganger.
   */
  readonly steg?: number;
}

/**
 * Leser orakelbenken og deler den på rolle.
 *
 * Stillinger uten NEAT-vektor hoppes over i stedet for å telles med på
 * E1-vektoren. Det er ikke pirk: et tall som blander to inngangskodinger er
 * nøyaktig feilen «D7-benken skrev differanser i samme tekstformat som D5/D6
 * skrev råpoeng».
 */
export function lesSpillstillinger(
  opts: SpillstillingOpts,
): Record<Rolle, Råstilling<Spillhandling>[]> {
  const hjerne = nevroHjerne();
  const ut: Record<Rolle, Råstilling<Spillhandling>[]> = { fører: [], forsvar: [], makker: [] };
  const steg = opts.steg ?? 7;
  let filer: string[];
  try {
    filer = readdirSync(opts.mappe).filter((f) => f.endsWith(".jsonl")).sort();
  } catch {
    return ut;
  }
  let teller = 0;
  for (const f of filer) {
    let tekst: string;
    try {
      tekst = readFileSync(`${opts.mappe}/${f}`, "utf8");
    } catch {
      continue;
    }
    for (const linje of tekst.split("\n")) {
      if (linje.trim() === "") continue;
      if (teller++ % steg !== 0) continue;
      let r: Benkrad;
      try {
        r = JSON.parse(linje) as Benkrad;
      } catch {
        continue; // halvskrevet siste linje
      }
      if (r.nt === undefined || r.t === undefined || r.v === undefined) continue;
      const rolle = rolleFraVektor(r.nt);
      if (rolle === null) continue;
      if (ut[rolle].length >= opts.perRolle) {
        if (ut.fører.length >= opts.perRolle && ut.forsvar.length >= opts.perRolle && ut.makker.length >= opts.perRolle) {
          return ut;
        }
        continue;
      }
      const stilling = tilRåstilling(r, rolle, hjerne);
      if (stilling !== null) ut[rolle].push(stilling);
    }
  }
  return ut;
}

function tilRåstilling(
  r: Benkrad,
  rolle: Rolle,
  hjerne: ReturnType<typeof nevroHjerne>,
): Råstilling<Spillhandling> | null {
  const handlinger = Object.keys(r.v).map(Number);
  if (handlinger.length < 2) return null;
  const verdi = handlinger.map((k) => r.v[String(k)]!);
  // NevroHjernes spillnett tar de 238 første trekkene – E1-vektoren er
  // konstruert slik at de er identiske med appens koding.
  const logits = forover(hjerne.spill, Float32Array.from(r.t.slice(0, 238)));
  let takValg = 0;
  for (let i = 1; i < handlinger.length; i++) {
    if (logits[handlinger[i]!]! > logits[handlinger[takValg]!]!) takValg = i;
  }
  let beste = 0;
  for (let i = 1; i < verdi.length; i++) if (verdi[i]! > verdi[beste]!) beste = i;
  return {
    // Giva, ikke stillingen: alle stikk fra samme runde deler de fire hendene.
    // Uten `frø` faller vi tilbake på håndbiten, og det er en SVAKERE gruppering
    // enn giva: hånden krymper for hvert stikk, så to stillinger fra samme runde
    // får ulik nøkkel. e1-data3 og nyere skriver `frø`; eldre datasett gjør det
    // ikke, og da er holdouten bare like uavhengig som stillingene er ulike.
    gruppe: r.frø !== undefined ? `giv:${r.frø}` : `hånd:${r.stikk}:${r.nt!.slice(0, 52).join("")}`,
    inn: projiser(r.nt!, SPILLEKSPERTER[rolle].sensorer),
    handlinger,
    verdi,
    takValg,
    // Ett kort opp, ingen ned. Se modulkommentaren for hvorfor.
    læremål: new Map([[handlinger[beste]!, 0.9]]),
  };
}
