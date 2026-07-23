/**
 * GameEngine – tilstandsmaskinen for en Amerikaner-kamp.
 *
 * Motoren er ren og deterministisk: `utfør(state, handling)` tar imot en
 * spillerhandling og returnerer en NY tilstand pluss en liste hendelser.
 * Ingenting muteres på tvers av kall, all tilstand er JSON-serialiserbar,
 * og en seedbar RNG gjør spill reproduserbare. Dermed kan den samme
 * motoren kjøre server-autoritativt, i en klient, eller i tester.
 */

import {
  type Farge,
  FARGER,
  type Kort,
  kortId,
  likeKort,
  lagRng,
  nyStokk,
  stokk,
  type Verdi,
} from "./kort.ts";
import {
  type Bud,
  type GameRules,
  type Kortgiving,
  type Meldingsinfo,
  PASS,
  SOLO,
  beregnPoeng,
  budRang,
  erHøyereBud,
  kortgiving,
  lagRegler,
  meldingsinfo,
  MINSTE_TALLBUD,
  AMERIKANER,
} from "./regler.ts";

export type Fase = "BUDRUNDE" | "VRAK" | "VELG" | "SPILL" | "RUNDE_SLUTT" | "FERDIG";

export interface KortPåBord {
  readonly spiller: number;
  readonly kort: Kort;
}

export interface Budrunde {
  readonly passet: boolean[];
  readonly høyeste: { spiller: number; bud: Exclude<Bud, typeof PASS> } | null;
}

export interface Stikk {
  readonly kort: KortPåBord[];
  readonly vinner: number;
}

export interface RundeResultat {
  readonly delta: number[];
  readonly klart: boolean;
  readonly lagStikk: number;
  readonly melding: Meldingsinfo;
  readonly budvinner: number;
  readonly makker: number | null;
  readonly stikkVunnet: number[];
}

/** Hele spilltilstanden. Alt er vanlige data – trygt å serialisere/lagre. */
export interface GameState {
  readonly regler: GameRules;
  readonly giving: Kortgiving;
  readonly antallSpillere: number;

  /** Seed for reproduserbar stokking. */
  readonly frø: number;
  readonly rundeNr: number;
  readonly giver: number;

  readonly fase: Fase;
  /** Spilleren som er i tur, eller null (RUNDE_SLUTT/FERDIG). */
  readonly iTur: number | null;

  readonly totalPoeng: number[];
  /** Kampvinner når fase === "FERDIG". */
  readonly vinner: number | null;

  // Rundedata
  readonly hender: Kort[][];
  readonly talong: Kort[];
  readonly budrunde: Budrunde;
  readonly budvinner: number | null;
  readonly melding: Meldingsinfo | null;
  readonly vrak: Kort[];
  readonly trumf: Farge | null;
  readonly etterlyst: Kort | null;
  readonly makker: number | null;
  readonly makkerAvslørt: boolean;

  readonly utspiller: number | null;
  readonly bord: KortPåBord[];
  readonly stikkVunnet: number[];
  readonly stikkSpilt: number;
  readonly forrigeStikk: Stikk | null;
  /** Alle fullførte stikk denne runden (offentlig – alle ser lagte kort). */
  readonly historikk: Stikk[];

  readonly sisteRunde: RundeResultat | null;
}

// ---------------------------------------------------------------------------
// Handlinger og hendelser
// ---------------------------------------------------------------------------

export type Handling =
  | { readonly type: "BUD"; readonly spiller: number; readonly bud: Bud }
  | { readonly type: "VRAK"; readonly spiller: number; readonly kort: readonly Kort[] }
  | {
      readonly type: "VELG";
      readonly spiller: number;
      readonly trumf: Farge;
      readonly etterlyst: Kort | null;
    }
  | { readonly type: "SPILL"; readonly spiller: number; readonly kort: Kort }
  | { readonly type: "NESTE" };

export type Hendelse =
  | { readonly type: "KORT_GITT"; readonly rundeNr: number }
  | { readonly type: "BUD"; readonly spiller: number; readonly bud: Bud }
  | { readonly type: "PASS"; readonly spiller: number }
  | { readonly type: "ALLE_PASSET" }
  | { readonly type: "BUDVINNER"; readonly spiller: number; readonly bud: Bud }
  | { readonly type: "VRAKET"; readonly spiller: number; readonly antall: number }
  | {
      readonly type: "TRUMF_VALGT";
      readonly trumf: Farge;
      readonly etterlyst: Kort | null;
    }
  | { readonly type: "KORT_SPILT"; readonly spiller: number; readonly kort: Kort }
  | { readonly type: "MAKKER_AVSLØRT"; readonly spiller: number }
  | { readonly type: "STIKK_FERDIG"; readonly vinner: number; readonly stikk: KortPåBord[] }
  | { readonly type: "RUNDE_SLUTT"; readonly resultat: RundeResultat; readonly totalPoeng: number[] }
  | { readonly type: "NY_RUNDE"; readonly rundeNr: number; readonly giver: number }
  | { readonly type: "KAMP_SLUTT"; readonly vinner: number };

export interface UtførResultat {
  readonly state: GameState;
  readonly hendelser: Hendelse[];
}

// ---------------------------------------------------------------------------
// Oppsett og kortgiving
// ---------------------------------------------------------------------------

function blandeSeed(frø: number, rundeNr: number): number {
  return (frø + Math.imul(rundeNr + 1, 2654435761)) >>> 0;
}

/** Deler ut kort for en gitt runde deterministisk ut fra frø + rundeNr. */
function delUt(
  regler: GameRules,
  giving: Kortgiving,
  frø: number,
  rundeNr: number,
): { hender: Kort[][]; talong: Kort[] } {
  const rng = lagRng(blandeSeed(frø, rundeNr));
  const stokket = stokk(nyStokk(), rng);
  const hender: Kort[][] = [];
  let i = 0;
  for (let s = 0; s < regler.antallSpillere; s++) {
    hender.push(stokket.slice(i, i + giving.kortPerSpiller));
    i += giving.kortPerSpiller;
  }
  const talong = stokket.slice(i, i + giving.talong);
  return { hender, talong };
}

/** Oppretter en ny kamp og deler ut første runde. */
export function opprettSpill(
  regler: Partial<GameRules> = {},
  frø: number = Math.floor(Math.random() * 0xffffffff),
): GameState {
  const r = lagRegler(regler);
  const giving = kortgiving(r);
  const giver = 0;
  const { hender, talong } = delUt(r, giving, frø, 0);
  return {
    regler: r,
    giving,
    antallSpillere: r.antallSpillere,
    frø: frø >>> 0,
    rundeNr: 0,
    giver,
    fase: "BUDRUNDE",
    iTur: (giver + 1) % r.antallSpillere,
    totalPoeng: new Array<number>(r.antallSpillere).fill(0),
    vinner: null,
    hender,
    talong,
    budrunde: { passet: new Array<boolean>(r.antallSpillere).fill(false), høyeste: null },
    budvinner: null,
    melding: null,
    vrak: [],
    trumf: null,
    etterlyst: null,
    makker: null,
    makkerAvslørt: false,
    utspiller: null,
    bord: [],
    stikkVunnet: new Array<number>(r.antallSpillere).fill(0),
    stikkSpilt: 0,
    forrigeStikk: null,
    historikk: [],
    sisteRunde: null,
  };
}

// ---------------------------------------------------------------------------
// Hjelpere
// ---------------------------------------------------------------------------

function harKort(hånd: readonly Kort[], k: Kort): boolean {
  return hånd.some((h) => likeKort(h, k));
}

function utenKort(hånd: readonly Kort[], k: Kort): Kort[] {
  return hånd.filter((h) => !likeKort(h, k));
}

function nesteAktive(passet: readonly boolean[], fra: number): number {
  const n = passet.length;
  for (let d = 1; d <= n; d++) {
    const p = (fra + d) % n;
    if (!passet[p]) return p;
  }
  return fra;
}

function antallAktive(passet: readonly boolean[]): number {
  return passet.filter((p) => !p).length;
}

/**
 * Hvilke kort spilleren lovlig kan legge nå (spillefasen).
 * Håndhever utspillsplikt (budvinner må åpne i trumf i første stikk) og
 * makkerplikt (den som har det etterlyste kortet MÅ legge det i første
 * stikk hvis det er lovlig).
 */
export function lovligeKort(state: GameState, spiller: number): Kort[] {
  if (state.fase !== "SPILL") return [];
  const hånd = state.hender[spiller] ?? [];
  const { trumf, etterlyst, budvinner, stikkSpilt } = state;

  // Utspill (tomt bord)
  if (state.bord.length === 0) {
    if (stikkSpilt === 0 && spiller === budvinner && trumf !== null) {
      const trumfKort = hånd.filter((k) => k.farge === trumf);
      if (trumfKort.length > 0) return trumfKort;
    }
    return hånd.slice();
  }

  // Følge farge
  const ledFarge = state.bord[0]!.kort.farge;
  const følg = hånd.filter((k) => k.farge === ledFarge);
  const basis = følg.length > 0 ? følg : hånd.slice();

  // Makkerplikt i første stikk
  if (stikkSpilt === 0 && etterlyst !== null && harKort(hånd, etterlyst)) {
    if (basis.some((k) => likeKort(k, etterlyst))) {
      return [etterlyst];
    }
  }
  return basis;
}

/** Kandidatkort som lovlig kan etterlyses gitt valgt trumf. */
export function lovligeEtterlys(state: GameState, trumf: Farge): Kort[] {
  const budvinner = state.budvinner;
  if (budvinner === null) return [];
  const egen = state.hender[budvinner] ?? [];
  const kandidater: Kort[] = [];
  const verdier: Verdi[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  for (const v of verdier) {
    const kort: Kort = { farge: trumf, verdi: v };
    if (harKort(egen, kort)) continue; // kan ikke etterlyse eget kort
    if (harKort(state.vrak, kort)) continue; // kan ikke etterlyse vraket kort
    kandidater.push(kort);
  }
  return kandidater;
}

// ---------------------------------------------------------------------------
// Lovlige handlinger (for klient/AI)
// ---------------------------------------------------------------------------

export type LovligeHandlinger =
  | { readonly fase: "BUDRUNDE"; readonly spiller: number; readonly bud: Bud[] }
  | { readonly fase: "VRAK"; readonly spiller: number; readonly antall: number; readonly hånd: Kort[] }
  | {
      readonly fase: "VELG";
      readonly spiller: number;
      readonly trumf: readonly Farge[];
      readonly måEtterlyse: boolean;
    }
  | { readonly fase: "SPILL"; readonly spiller: number; readonly kort: Kort[] }
  | { readonly fase: "RUNDE_SLUTT"; readonly kanFortsette: true }
  | { readonly fase: "FERDIG"; readonly vinner: number };

/** Oppsummerer hva spilleren i tur kan gjøre akkurat nå. */
export function lovligeHandlinger(state: GameState): LovligeHandlinger {
  switch (state.fase) {
    case "BUDRUNDE": {
      const spiller = state.iTur!;
      const høyeste = state.budrunde.høyeste?.bud ?? null;
      const bud: Bud[] = [PASS];
      for (let n = MINSTE_TALLBUD; n <= state.giving.antallStikk; n++) {
        if (erHøyereBud(n, høyeste, state.giving.antallStikk)) bud.push(n);
      }
      if (erHøyereBud(AMERIKANER, høyeste, state.giving.antallStikk)) bud.push(AMERIKANER);
      if (erHøyereBud(SOLO, høyeste, state.giving.antallStikk)) bud.push(SOLO);
      return { fase: "BUDRUNDE", spiller, bud };
    }
    case "VRAK":
      return {
        fase: "VRAK",
        spiller: state.budvinner!,
        antall: state.giving.talong,
        hånd: (state.hender[state.budvinner!] ?? []).slice(),
      };
    case "VELG":
      return {
        fase: "VELG",
        spiller: state.budvinner!,
        trumf: FARGER,
        måEtterlyse: state.melding!.type !== "solo",
      };
    case "SPILL":
      return { fase: "SPILL", spiller: state.iTur!, kort: lovligeKort(state, state.iTur!) };
    case "RUNDE_SLUTT":
      return { fase: "RUNDE_SLUTT", kanFortsette: true };
    case "FERDIG":
      return { fase: "FERDIG", vinner: state.vinner! };
  }
}

// ---------------------------------------------------------------------------
// utfør: reduser en handling til ny tilstand + hendelser
// ---------------------------------------------------------------------------

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function klon(state: GameState): Mutable<GameState> {
  // Strukturell kopi (dyp nok for våre datatyper – alt er data).
  return {
    ...state,
    totalPoeng: state.totalPoeng.slice(),
    hender: state.hender.map((h) => h.slice()),
    talong: state.talong.slice(),
    budrunde: { passet: state.budrunde.passet.slice(), høyeste: state.budrunde.høyeste },
    vrak: state.vrak.slice(),
    bord: state.bord.slice(),
    stikkVunnet: state.stikkVunnet.slice(),
    historikk: state.historikk.slice(),
  };
}

export function utfør(state: GameState, handling: Handling): UtførResultat {
  const s = klon(state);
  const hendelser: Hendelse[] = [];

  switch (handling.type) {
    case "BUD":
      utførBud(s, handling.spiller, handling.bud, hendelser);
      break;
    case "VRAK":
      utførVrak(s, handling.spiller, handling.kort, hendelser);
      break;
    case "VELG":
      utførVelg(s, handling.spiller, handling.trumf, handling.etterlyst, hendelser);
      break;
    case "SPILL":
      utførSpill(s, handling.spiller, handling.kort, hendelser);
      break;
    case "NESTE":
      utførNeste(s, hendelser);
      break;
  }

  return { state: s, hendelser };
}

function krev(betingelse: boolean, melding: string): void {
  if (!betingelse) throw new Error(melding);
}

function utførBud(s: Mutable<GameState>, spiller: number, bud: Bud, ev: Hendelse[]): void {
  krev(s.fase === "BUDRUNDE", "Ikke budrunde");
  krev(spiller === s.iTur, "Ikke din tur");
  const høyeste = s.budrunde.høyeste?.bud ?? null;
  krev(erHøyereBud(bud, høyeste, s.giving.antallStikk), `Ulovlig bud: ${String(bud)}`);

  const passet = s.budrunde.passet.slice();
  if (bud === PASS) {
    passet[spiller] = true;
    s.budrunde = { passet, høyeste: s.budrunde.høyeste };
    ev.push({ type: "PASS", spiller });
  } else {
    s.budrunde = { passet, høyeste: { spiller, bud } };
    ev.push({ type: "BUD", spiller, bud });
    if (bud === SOLO) {
      avsluttBudrunde(s, spiller, ev);
      return;
    }
  }

  const aktive = antallAktive(passet);
  if (aktive === 0) {
    // Alle passet – ny giver, ny kortgiving.
    ev.push({ type: "ALLE_PASSET" });
    nyGivning(s, ev);
    return;
  }
  if (aktive === 1 && s.budrunde.høyeste !== null) {
    avsluttBudrunde(s, s.budrunde.høyeste.spiller, ev);
    return;
  }
  s.iTur = nesteAktive(passet, spiller);
}

function avsluttBudrunde(s: Mutable<GameState>, vinner: number, ev: Hendelse[]): void {
  const bud = s.budrunde.høyeste!.bud;
  s.budvinner = vinner;
  s.melding = meldingsinfo(bud);
  ev.push({ type: "BUDVINNER", spiller: vinner, bud });

  if (s.giving.talong > 0) {
    // Budvinner tar opp talongen.
    const hånd = (s.hender[vinner] ?? []).concat(s.talong);
    s.hender = s.hender.map((h, i) => (i === vinner ? hånd : h));
    s.talong = [];
    s.fase = "VRAK";
  } else {
    s.fase = "VELG";
  }
  s.iTur = vinner;
}

function utførVrak(
  s: Mutable<GameState>,
  spiller: number,
  kort: readonly Kort[],
  ev: Hendelse[],
): void {
  krev(s.fase === "VRAK", "Ikke byttefase");
  krev(spiller === s.budvinner, "Bare budvinner kan vrake");
  krev(kort.length === s.giving.talong, `Må vrake nøyaktig ${s.giving.talong} kort`);
  let hånd = (s.hender[spiller] ?? []).slice();
  const ids = new Set<string>();
  for (const k of kort) {
    const id = kortId(k);
    krev(!ids.has(id), "Kan ikke vrake samme kort to ganger");
    ids.add(id);
    krev(harKort(hånd, k), `Har ikke kortet ${id} på hånd`);
    hånd = utenKort(hånd, k);
  }
  s.hender = s.hender.map((h, i) => (i === spiller ? hånd : h));
  s.vrak = kort.slice();
  s.fase = "VELG";
  s.iTur = spiller;
  ev.push({ type: "VRAKET", spiller, antall: kort.length });
}

function utførVelg(
  s: Mutable<GameState>,
  spiller: number,
  trumf: Farge,
  etterlyst: Kort | null,
  ev: Hendelse[],
): void {
  krev(s.fase === "VELG", "Ikke velgefase");
  krev(spiller === s.budvinner, "Bare budvinner velger trumf");
  krev(FARGER.includes(trumf), "Ugyldig trumffarge");
  const måEtterlyse = s.melding!.type !== "solo";
  if (etterlyst === null) {
    krev(!måEtterlyse, "Må etterlyse et kort ved dette budet");
  } else {
    krev(etterlyst.farge === trumf, "Det etterlyste kortet må være i trumffargen");
    const egen = s.hender[spiller] ?? [];
    krev(!harKort(egen, etterlyst), "Kan ikke etterlyse et kort du selv har");
    krev(!harKort(s.vrak, etterlyst), "Kan ikke etterlyse et kort du har vraket");
  }

  s.trumf = trumf;
  s.etterlyst = etterlyst;
  // Makker = spilleren som sitter med det etterlyste kortet (ikke ved solo).
  if (etterlyst !== null && s.melding!.type !== "solo") {
    s.makker = finnKortholder(s.hender, etterlyst);
  } else {
    s.makker = null;
  }
  s.makkerAvslørt = false;
  s.fase = "SPILL";
  s.utspiller = spiller;
  s.iTur = spiller;
  s.bord = [];
  s.stikkSpilt = 0;
  s.stikkVunnet = new Array<number>(s.antallSpillere).fill(0);
  s.forrigeStikk = null;
  s.historikk = [];
  ev.push({ type: "TRUMF_VALGT", trumf, etterlyst });
}

function finnKortholder(hender: readonly Kort[][], k: Kort): number | null {
  for (let i = 0; i < hender.length; i++) {
    if (harKort(hender[i]!, k)) return i;
  }
  return null;
}

function utførSpill(s: Mutable<GameState>, spiller: number, kort: Kort, ev: Hendelse[]): void {
  krev(s.fase === "SPILL", "Ikke spillefase");
  krev(spiller === s.iTur, "Ikke din tur");
  const lovlige = lovligeKort(s, spiller);
  krev(lovlige.some((k) => likeKort(k, kort)), `Ulovlig kort: ${kortId(kort)}`);

  s.hender = s.hender.map((h, i) => (i === spiller ? utenKort(h, kort) : h));
  s.bord = s.bord.concat({ spiller, kort });
  ev.push({ type: "KORT_SPILT", spiller, kort });

  if (s.etterlyst !== null && likeKort(kort, s.etterlyst) && !s.makkerAvslørt) {
    s.makkerAvslørt = true;
    ev.push({ type: "MAKKER_AVSLØRT", spiller });
  }

  if (s.bord.length < s.antallSpillere) {
    s.iTur = (spiller + 1) % s.antallSpillere;
    return;
  }

  // Stikket er fullt – avgjør vinner.
  const vinner = stikkvinner(s.bord, s.trumf!);
  const stikkVunnet = s.stikkVunnet.slice();
  stikkVunnet[vinner] = (stikkVunnet[vinner] ?? 0) + 1;
  s.stikkVunnet = stikkVunnet;
  s.forrigeStikk = { kort: s.bord.slice(), vinner };
  s.historikk = s.historikk.concat({ kort: s.bord.slice(), vinner });
  ev.push({ type: "STIKK_FERDIG", vinner, stikk: s.bord.slice() });
  s.bord = [];
  s.stikkSpilt += 1;
  s.utspiller = vinner;

  if (s.stikkSpilt >= s.giving.antallStikk) {
    avsluttRunde(s, ev);
  } else {
    s.iTur = vinner;
  }
}

/** Avgjør hvem som vinner et fullt stikk: høyeste trumf, ellers høyeste i utspillsfargen. */
export function stikkvinner(bord: readonly KortPåBord[], trumf: Farge): number {
  const ledFarge = bord[0]!.kort.farge;
  let best = bord[0]!;
  for (const kp of bord) {
    if (slårKort(kp.kort, best.kort, trumf, ledFarge)) best = kp;
  }
  return best.spiller;
}

function slårKort(ny: Kort, best: Kort, trumf: Farge, ledFarge: Farge): boolean {
  const nyTrumf = ny.farge === trumf;
  const bestTrumf = best.farge === trumf;
  if (nyTrumf && !bestTrumf) return true;
  if (!nyTrumf && bestTrumf) return false;
  if (nyTrumf && bestTrumf) return ny.verdi > best.verdi;
  // ingen trumf involvert: bare kort i utspillsfargen kan slå
  if (ny.farge !== ledFarge) return false;
  if (best.farge !== ledFarge) return true;
  return ny.verdi > best.verdi;
}

function avsluttRunde(s: Mutable<GameState>, ev: Hendelse[]): void {
  const res = beregnPoeng({
    regler: s.regler,
    melding: s.melding!,
    antallStikk: s.giving.antallStikk,
    antallSpillere: s.antallSpillere,
    budvinner: s.budvinner!,
    makker: s.makker,
    stikkPerSpiller: s.stikkVunnet,
  });
  const totalPoeng = s.totalPoeng.slice();
  for (let i = 0; i < totalPoeng.length; i++) totalPoeng[i] = (totalPoeng[i] ?? 0) + (res.delta[i] ?? 0);
  s.totalPoeng = totalPoeng;

  const resultat: RundeResultat = {
    delta: res.delta,
    klart: res.klart,
    lagStikk: res.lagStikk,
    melding: s.melding!,
    budvinner: s.budvinner!,
    makker: s.makker,
    stikkVunnet: s.stikkVunnet.slice(),
  };
  s.sisteRunde = resultat;
  s.iTur = null;
  ev.push({ type: "RUNDE_SLUTT", resultat, totalPoeng: totalPoeng.slice() });

  const vinner = kampvinner(s, totalPoeng);
  if (vinner !== null) {
    s.fase = "FERDIG";
    s.vinner = vinner;
    ev.push({ type: "KAMP_SLUTT", vinner });
  } else {
    s.fase = "RUNDE_SLUTT";
  }
}

/** Finn kampvinner (>= målPoeng). Ved likhet vinner budgiversiden. */
function kampvinner(s: GameState, total: readonly number[]): number | null {
  const mål = s.regler.målPoeng;
  const kandidater = [];
  for (let i = 0; i < total.length; i++) if ((total[i] ?? 0) >= mål) kandidater.push(i);
  if (kandidater.length === 0) return null;
  if (s.budvinner !== null && kandidater.includes(s.budvinner)) return s.budvinner;
  if (s.makker !== null && kandidater.includes(s.makker)) return s.makker;
  let best = kandidater[0]!;
  for (const k of kandidater) if ((total[k] ?? 0) > (total[best] ?? 0)) best = k;
  return best;
}

function utførNeste(s: Mutable<GameState>, ev: Hendelse[]): void {
  krev(s.fase === "RUNDE_SLUTT", "Kan ikke gå videre nå");
  nyGivning(s, ev);
}

/** Ny giver, ny kortgiving, tilbake til budrunde. */
function nyGivning(s: Mutable<GameState>, ev: Hendelse[]): void {
  const rundeNr = s.rundeNr + 1;
  const giver = (s.giver + 1) % s.antallSpillere;
  const { hender, talong } = delUt(s.regler, s.giving, s.frø, rundeNr);
  s.rundeNr = rundeNr;
  s.giver = giver;
  s.hender = hender;
  s.talong = talong;
  s.budrunde = { passet: new Array<boolean>(s.antallSpillere).fill(false), høyeste: null };
  s.budvinner = null;
  s.melding = null;
  s.vrak = [];
  s.trumf = null;
  s.etterlyst = null;
  s.makker = null;
  s.makkerAvslørt = false;
  s.utspiller = null;
  s.bord = [];
  s.stikkVunnet = new Array<number>(s.antallSpillere).fill(0);
  s.stikkSpilt = 0;
  s.forrigeStikk = null;
  s.historikk = [];
  s.sisteRunde = null;
  s.fase = "BUDRUNDE";
  s.iTur = (giver + 1) % s.antallSpillere;
  ev.push({ type: "NY_RUNDE", rundeNr, giver });
  ev.push({ type: "KORT_GITT", rundeNr });
}

// ---------------------------------------------------------------------------
// Per-spiller-visning (skjuler skjult informasjon)
// ---------------------------------------------------------------------------

export interface SpillerVisning {
  readonly fase: Fase;
  readonly iTur: number | null;
  readonly deg: number;
  readonly dinHånd: Kort[];
  readonly antallKort: number[];
  readonly totalPoeng: number[];
  readonly rundeNr: number;
  readonly giver: number;
  readonly budrunde: Budrunde;
  readonly budvinner: number | null;
  readonly melding: Meldingsinfo | null;
  readonly trumf: Farge | null;
  readonly etterlyst: Kort | null;
  /** Makker er kun synlig etter at kortet er avslørt i første stikk. */
  readonly makker: number | null;
  readonly bord: KortPåBord[];
  readonly stikkVunnet: number[];
  readonly stikkSpilt: number;
  readonly forrigeStikk: Stikk | null;
  /** Alle fullførte stikk denne runden – offentlig informasjon (alle så kortene). */
  readonly historikk: Stikk[];
  /** Egne vrakede kort (kun budvinner ser sine). */
  readonly dittVrak: Kort[];
  readonly sisteRunde: RundeResultat | null;
  readonly vinner: number | null;
  readonly lovligeKort: Kort[];
}

/**
 * Redigert tilstand sett fra én spiller: skjuler andres hender, talong,
 * andres vrak og makkerens identitet før den er avslørt. Trygt å sende
 * over nett til den enkelte klienten.
 */
export function spillerVisning(state: GameState, spiller: number): SpillerVisning {
  const makkerSynlig = state.makkerAvslørt ? state.makker : null;
  return {
    fase: state.fase,
    iTur: state.iTur,
    deg: spiller,
    dinHånd: (state.hender[spiller] ?? []).slice(),
    antallKort: state.hender.map((h) => h.length),
    totalPoeng: state.totalPoeng.slice(),
    rundeNr: state.rundeNr,
    giver: state.giver,
    budrunde: { passet: state.budrunde.passet.slice(), høyeste: state.budrunde.høyeste },
    budvinner: state.budvinner,
    melding: state.melding,
    trumf: state.trumf,
    etterlyst: state.etterlyst,
    makker: makkerSynlig,
    bord: state.bord.slice(),
    stikkVunnet: state.stikkVunnet.slice(),
    stikkSpilt: state.stikkSpilt,
    forrigeStikk: state.forrigeStikk,
    historikk: state.historikk.slice(),
    dittVrak: state.budvinner === spiller ? state.vrak.slice() : [],
    sisteRunde: state.sisteRunde,
    vinner: state.vinner,
    lovligeKort: state.fase === "SPILL" && state.iTur === spiller ? lovligeKort(state, spiller) : [],
  };
}

// re-eksport for bekvemmelighet
export { budRang };
