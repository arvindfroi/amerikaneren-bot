/**
 * VRAK-EKSPERTEN – behold-score per kort.
 *
 * FASIT: dobbelt-dummy-verdien av hånden ETTER vraket. Alle C(16,4) = 1 820
 * lovlige vrak enumereres og løses, så gulvet («tilfeldig lovlig valg») er
 * EKSAKT og ikke samplet, og kandidatens valg er et oppslag i en tabell som
 * allerede finnes.
 *
 * TO VALG SOM MÅ STÅ EKSPLISITT:
 *
 * 1. TRUMFEN HOLDES FAST AV EN DETERMINISTISK REGEL, ikke maksimert.
 *    Vraking skjer FØR trumfvalget, så «verdien av hånden etter vrak» krever
 *    en trumf. Å ta maks over de fire fargene ville latt vrakeksperten hente
 *    poeng fra et bedre trumfvalg – altså nøyaktig det indre bytteforholdet
 *    MoE2 finnes for å hindre (feil 7 i docs/moe2.md). I stedet fikses
 *    trumfen av håndvurderingen (`estimerStikk`, den samme formelen
 *    NevroHjerne bruker) på hånden som BLIR IGJEN, og etterlysningen settes
 *    til det høyeste lovlige kortet i den fargen. Da måler fasiten bare
 *    vraket.
 *
 * 2. DYBDEN ER EN KJENT GRENSE. Eksakt dobbelt-dummy fra 12 stikk tar ~90
 *    sekunder per stilling (målt her, samme maskin). `evaluerHybrid` spiller
 *    grådig ned til `dybde` stikk gjenstår og løser resten eksakt; med dybde
 *    6 koster ett oppslag ~1,2 ms. Fasiten er dermed presis i sluttspillet og
 *    grov i åpningen – samme kjente skjevhet som i orakelbenken, og den skal
 *    ikke skjules bak et tall som ser eksakt ut.
 */

import { FARGER, type Kort } from "../../kort.ts";
import { opprettSpill } from "../../index.ts";
import { type GameState, spillerVisning, utfør } from "../../motor.ts";
import { estimerStikk, NevroAgent } from "../../nevro/agent.ts";
import { kortIndeks, lagInn } from "../../neat/trekk.ts";
import { evaluerHybrid } from "../../solver/dds.ts";
import { rangeringsmål, type Ekspert, type Råstilling } from "./felles.ts";
import { projiser, VRAK_SENSORER } from "./sensorer.ts";

/** Et vrak: fire kortindekser, alltid sortert stigende. */
export type Vrakhandling = readonly number[];

/** Kortindeks → kort. Samme koding som `kortIndeks`. */
export function kortFraIndeks(i: number): Kort {
  return { farge: FARGER[Math.floor(i / 13)]!, verdi: ((i % 13) + 2) as Kort["verdi"] };
}

function nøkkel(vrak: Vrakhandling): string {
  return vrak.join(",");
}

/**
 * Hånden i en vrakstilling, utledet av handlingene (unionen av alle vrak er
 * nøyaktig de 16 kortene). Memoisert per stilling – uten det ville hver
 * `velg` iterert 1 820 × 4 kortindekser, for hvert genom, i hver generasjon.
 */
const håndCache = new WeakMap<object, number[]>();
function hånden(s: Råstilling<Vrakhandling>): number[] {
  const truffet = håndCache.get(s);
  if (truffet !== undefined) return truffet;
  const sett = new Set<number>();
  for (const v of s.handlinger) for (const k of v) sett.add(k);
  const ut = [...sett].sort((a, b) => a - b);
  håndCache.set(s, ut);
  return ut;
}

const indeksCache = new WeakMap<object, Map<string, number>>();
function handlingsindeks(s: Råstilling<Vrakhandling>): Map<string, number> {
  const truffet = indeksCache.get(s);
  if (truffet !== undefined) return truffet;
  const kart = lagIndeks(s.handlinger);
  indeksCache.set(s, kart);
  return kart;
}

function lagIndeks(handlinger: readonly Vrakhandling[]): Map<string, number> {
  const kart = new Map<string, number>();
  handlinger.forEach((h, i) => kart.set(nøkkel(h), i));
  return kart;
}

export const vrakEkspert: Ekspert<Vrakhandling> = {
  navn: "vrak",
  fase: "VRAK",
  rolle: null,
  sensorer: VRAK_SENSORER,
  antallUt: 52,
  velg(ut, s) {
    const hånd = hånden(s);
    const antall = s.handlinger[0]!.length;
    const sortert = hånd.slice().sort((a, b) => {
      const d = ut[a]! - ut[b]!;
      return d !== 0 ? d : a - b; // stabilt ved likhet: laveste kortindeks først
    });
    const vrak = sortert.slice(0, antall).sort((a, b) => a - b);
    const i = handlingsindeks(s).get(nøkkel(vrak));
    if (i === undefined) throw new Error("vrakEkspert: valget står ikke i fasittabellen");
    return i;
  },
};

/** Alle C(n,k)-utvalg av `kort`, som sorterte indekslister. */
export function alleVrak(kort: readonly number[], antall: number): number[][] {
  const ut: number[][] = [];
  const nå: number[] = [];
  const gå = (start: number): void => {
    if (nå.length === antall) {
      ut.push(nå.slice());
      return;
    }
    for (let i = start; i < kort.length; i++) {
      nå.push(kort[i]!);
      gå(i + 1);
      nå.pop();
    }
  };
  gå(0);
  return ut;
}

/**
 * Trumf + etterlysning for en hånd, etter den deterministiske regelen fasiten
 * er definert med: håndvurderingens beste farge, og det høyeste kortet i den
 * fargen som verken er på hånden eller i vraket. En farge uten lovlig
 * etterlysning hoppes over, slik motoren også ville tvunget fram.
 */
export function fastTrumfvalg(
  hånd: readonly number[],
  vrak: readonly number[],
): { trumf: number; etterlyst: number } | null {
  const kortHånd = hånd.map(kortFraIndeks);
  const rangert = FARGER.map((f, i) => ({ i, est: estimerStikk(kortHånd, f) })).sort(
    (a, b) => b.est - a.est,
  );
  const utelukket = new Set<number>([...hånd, ...vrak]);
  for (const r of rangert) {
    for (let v = 14; v >= 2; v--) {
      const idx = r.i * 13 + (v - 2);
      if (!utelukket.has(idx)) return { trumf: r.i, etterlyst: idx };
    }
  }
  return null;
}

export interface VrakstillingOpts {
  /** Stikk som løses EKSAKT per oppslag (resten spilles grådig fram dit). */
  readonly dybde?: number;
  readonly nodeTak?: number;
}

/**
 * Bygger én vrakstilling fra en GameState som står i VRAK.
 *
 * Fasiten bruker de EKTE hendene til alle fire – det er lov, en fasit er et
 * orakel og ikke en spiller. Sensorvektoren bygges derimot fra
 * `spillerVisning`, så eksperten ser bare det budvinneren lovlig vet.
 */
export function lagVrakstilling(
  state: GameState,
  opts: VrakstillingOpts = {},
): Råstilling<Vrakhandling> | null {
  if (state.fase !== "VRAK" || state.budvinner === null) return null;
  const dybde = opts.dybde ?? 6;
  const nodeTak = opts.nodeTak ?? 400_000;
  const bv = state.budvinner;
  const T = state.giving.antallStikk;
  const antall = state.giving.talong;
  if (antall <= 0) return null;
  const håndKort = state.hender[bv] ?? [];
  const hånd = håndKort.map(kortIndeks).sort((a, b) => a - b);
  if (hånd.length !== T + antall) return null;
  const andre = state.hender.map((h, p) => (p === bv ? [] : h.map(kortIndeks)));

  const handlinger = alleVrak(hånd, antall);
  const verdi: number[] = [];
  for (const vrak of handlinger) {
    const ute = new Set(vrak);
    const igjen = hånd.filter((k) => !ute.has(k));
    const valg = fastTrumfvalg(igjen, vrak);
    if (valg === null) {
      verdi.push(0);
      continue;
    }
    const hender: number[][] = [];
    for (let p = 0; p < state.antallSpillere; p++) hender.push(p === bv ? igjen : andre[p]!);
    const declLag = hender.map((h, p) => p === bv || h.includes(valg.etterlyst));
    verdi.push(
      evaluerHybrid(
        { N: state.antallSpillere, trump: valg.trumf, declLag, hender, iTur: bv, totalStikk: T },
        dybde,
        nodeTak,
      ),
    );
  }

  const nevrosKort = new NevroAgent().velgVrak(state, bv, håndKort, antall);
  const nevrosVrak = nevrosKort.map(kortIndeks).sort((a, b) => a - b);
  const takValg = lagIndeks(handlinger).get(nøkkel(nevrosVrak)) ?? 0;

  return {
    gruppe: `vrak:${state.frø}:${state.rundeNr}`,
    inn: projiser(lagInn(spillerVisning(state, bv), "VRAK", T, state.regler.målPoeng), VRAK_SENSORER),
    handlinger,
    verdi,
    takValg,
    læremål: behold(hånd, handlinger, verdi),
  };
}

/**
 * Kjører giver fram til VRAK-fasen og bygger én stilling per giv.
 *
 * Budrunden spilles av NevroHjerne. Det gir et REALISTISK utvalg kontrakter
 * (nevro byr 5–10, ikke uniformt), og det er den fordelingen eksperten faktisk
 * skal virke i. Merk skjevheten: stillingsfordelingen er nevros, ikke
 * ekspertens egen – samme forbehold som står i angerbenken.
 */
export function lagVrakstillinger(
  opts: VrakstillingOpts & { giver: number; frø?: number },
): Råstilling<Vrakhandling>[] {
  const nevro = new NevroAgent();
  const ut: Råstilling<Vrakhandling>[] = [];
  for (let i = 0; i < opts.giver; i++) {
    let s = opprettSpill({}, (opts.frø ?? 11_000_000) + i);
    let vakt = 0;
    while (s.fase === "BUDRUNDE" && vakt++ < 40) s = utfør(s, nevro.velgHandling(s)).state;
    if (s.fase !== "VRAK") continue;
    const stilling = lagVrakstilling(s, opts);
    if (stilling !== null) ut.push(stilling);
  }
  return ut;
}

/**
 * BEHOLD-SCORE PER KORT som læremål.
 *
 * For hvert kort: snittverdien av vrakene som BEHOLDER det, minus snittet av
 * vrakene som kaster det. Det er kortets marginale bidrag, regnet over hele
 * fasittabellen – ikke en avledning av ett enkelt «beste vrak».
 *
 * 16 mål på ett 52-hode er trygt HER, i motsetning til i `lærForsvar`: målene
 * er en rangering av kort som faktisk ligger på hånden, med snitt nær null,
 * ikke ett opp og n−1 ned per beslutning. Det var den formen som flatet ut
 * hodet og lot argmax bli avgjort av restforskjeller.
 */
function behold(
  hånd: readonly number[],
  handlinger: readonly (readonly number[])[],
  verdi: readonly number[],
): Map<number, number> {
  const medSum = new Map<number, number>();
  const medN = new Map<number, number>();
  const utenSum = new Map<number, number>();
  const utenN = new Map<number, number>();
  for (const k of hånd) {
    medSum.set(k, 0);
    medN.set(k, 0);
    utenSum.set(k, 0);
    utenN.set(k, 0);
  }
  handlinger.forEach((h, i) => {
    const ute = new Set(h);
    for (const k of hånd) {
      if (ute.has(k)) {
        utenSum.set(k, utenSum.get(k)! + verdi[i]!);
        utenN.set(k, utenN.get(k)! + 1);
      } else {
        medSum.set(k, medSum.get(k)! + verdi[i]!);
        medN.set(k, medN.get(k)! + 1);
      }
    }
  });
  const margin = hånd.map((k) => ({
    utgang: k,
    verdi: medSum.get(k)! / Math.max(1, medN.get(k)!) - utenSum.get(k)! / Math.max(1, utenN.get(k)!),
  }));
  return rangeringsmål(margin);
}
