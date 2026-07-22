/**
 * PIMC-bot: spiller Amerikaner så nær optimalt som informasjonen tillater.
 *
 * Metode: Perfekt-informasjons-Monte-Carlo (determinisert dobbelt-dummy).
 * For hver beslutning trekkes mange «verdener» som er forenlige med det
 * boten vet (egen hånd, spilte kort, renonce, etterlyst kort), hver verden
 * løses med dobbelt-dummy-søkeren (eksakt sluttspill), og boten velger
 * handlingen med best forventet egen-poeng snittet over verdenene.
 *
 * Modellen: budlaget maksimerer sine stikk, forsvaret minimerer dem
 * (standard erklærer-mot-forsvar). Botens egen-poeng regnes ut fra rollen:
 * budvinner/makker etter budet (terskel), forsvarer etter egen stikk-andel.
 *
 * Grensene ligger i informasjonen og i determiniseringen (PIMC antar at
 * skjulte kort blir kjent – kjent «strategifusjon»), ikke i sluttspillet,
 * som løses eksakt. Alt er avhengighetsfritt og deterministisk gitt seed.
 */

import { FARGER, type Farge, type Kort, kortId, lagRng, likeKort } from "../kort.ts";
import {
  AMERIKANER,
  type Bud,
  PASS,
  SOLO,
} from "../regler.ts";
import {
  type GameState,
  type Handling,
  lovligeEtterlys,
  lovligeHandlinger,
  lovligeKort,
} from "../motor.ts";
import {
  type DDOppsett,
  evaluerEtterTrekk,
  evaluerHybrid,
  intTilKort,
  kortTilInt,
} from "../solver/dds.ts";
import { byggDDOppsett, trekkVerden, type Verden } from "../solver/sampler.ts";

export interface BotOpts {
  /** Antall verdener (determiniseringer) per beslutning. */
  readonly verdener?: number;
  /** Antall stikk igjen som løses eksakt (resten spilles grådig). */
  readonly terskel?: number;
  /** Egen tilfeldighetskilde (for reproduserbarhet). */
  readonly rng?: () => number;
  /** Seed dersom `rng` ikke er oppgitt. */
  readonly frø?: number;
  /**
   * Tak på (kandidater × verdener) per spill-beslutning – styrer maksimal
   * tenketid. Øk for sterkere (og tregere) spill. Standard 240.
   */
  readonly maksEval?: number;
}

const STD_VERDENER = 20;
const STD_TERSKEL = 7;
const STD_MAKS_EVAL = 240; // ~kandidater × verdener-tak per spill-beslutning

function lagOppsettRng(opts: BotOpts): () => number {
  if (opts.rng) return opts.rng;
  return lagRng((opts.frø ?? 0x1234abcd) >>> 0);
}

// ---------------------------------------------------------------------------
// Poeng sett fra observatørens rolle (gitt budlagets sluttstikk)
// ---------------------------------------------------------------------------

interface PoengKontekst {
  readonly observator: number;
  readonly budvinner: number;
  readonly meldingstype: "tall" | "amerikaner" | "solo";
  readonly bud: number;
  readonly totalStikk: number;
  readonly mål: number;
  readonly N: number;
}

function observatørPoeng(lagStikk: number, verden: Verden, k: PoengKontekst): number {
  const { observator, budvinner, totalStikk: T, mål } = k;
  const påLag = verden.declLag[observator] === true;
  const lagStørrelse = verden.declLag.filter(Boolean).length;
  const antallForsvar = k.N - lagStørrelse;

  if (!påLag) {
    // Forsvarer: egen poeng ≈ andel av forsvarets stikk (+1 per stikk).
    return (T - lagStikk) / Math.max(1, antallForsvar);
  }

  if (k.meldingstype === "tall") {
    const klart = lagStikk >= k.bud;
    if (observator === budvinner) return klart ? 2 * k.bud : -2 * k.bud;
    return klart ? k.bud : -k.bud; // makker
  }
  if (k.meldingstype === "amerikaner") {
    const klart = lagStikk === T;
    if (observator === budvinner) return klart ? mål / 2 : -mål / 2;
    return klart ? mål / 4 : -mål / 4; // makker
  }
  // solo (kun budvinner på laget)
  const klart = lagStikk === T;
  return klart ? mål : -mål;
}

// ---------------------------------------------------------------------------
// Spillefase: velg kort via PIMC
// ---------------------------------------------------------------------------

function velgKort(state: GameState, spiller: number, opts: BotOpts): Handling {
  const rng = lagOppsettRng(opts);
  const terskel = opts.terskel ?? STD_TERSKEL;
  const lovlige = lovligeKort(state, spiller);
  if (lovlige.length === 1) return { type: "SPILL", spiller, kort: lovlige[0]! };

  const maksEval = opts.maksEval ?? STD_MAKS_EVAL;
  let verdener = opts.verdener ?? STD_VERDENER;
  verdener = Math.max(6, Math.min(verdener, Math.floor(maksEval / lovlige.length)));

  const kontekst: PoengKontekst = {
    observator: spiller,
    budvinner: state.budvinner!,
    meldingstype: state.melding!.type,
    bud: state.melding!.bud,
    totalStikk: state.giving.antallStikk,
    mål: state.regler.målPoeng,
    N: state.antallSpillere,
  };

  const sumPoeng = new Array<number>(lovlige.length).fill(0);
  const kortInt = lovlige.map(kortTilInt);
  let gyldige = 0;
  for (let w = 0; w < verdener; w++) {
    const verden = trekkVerden(state, spiller, rng);
    if (!verden) continue;
    gyldige++;
    const oppsett = byggDDOppsett(state, verden);
    for (let i = 0; i < lovlige.length; i++) {
      const lag = evaluerEtterTrekk(oppsett, kortInt[i]!, terskel);
      sumPoeng[i]! += observatørPoeng(lag, verden, kontekst);
    }
  }
  if (gyldige === 0) return { type: "SPILL", spiller, kort: lovlige[0]! };

  let best = 0;
  for (let i = 1; i < lovlige.length; i++) if (sumPoeng[i]! > sumPoeng[best]!) best = i;
  return { type: "SPILL", spiller, kort: lovlige[best]! };
}

// ---------------------------------------------------------------------------
// Sampling for før-spill-beslutninger (budvinner kjenner egen hånd + vrak)
// ---------------------------------------------------------------------------

/** Del ut de usette kortene til de øvrige spillerne; plasser evt. kall-kort. */
function delMotstandere(
  kjentEgen: number[],
  utelatt: number[],
  callInt: number | null,
  N: number,
  kortPer: number,
  egenIdx: number,
  rng: () => number,
): number[][] | null {
  const brukt = new Set<number>([...kjentEgen, ...utelatt]);
  const usett: number[] = [];
  for (let c = 0; c < 52; c++) if (!brukt.has(c)) usett.push(c);
  for (let i = usett.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = usett[i]!;
    usett[i] = usett[j]!;
    usett[j] = t;
  }
  const hender: number[][] = [];
  for (let p = 0; p < N; p++) hender.push(p === egenIdx ? kjentEgen.slice() : []);
  const andre: number[] = [];
  for (let p = 0; p < N; p++) if (p !== egenIdx) andre.push(p);

  let k = 0;
  if (callInt !== null) {
    const p = andre[Math.floor(rng() * andre.length)]!;
    hender[p]!.push(callInt);
    k = usett.indexOf(callInt);
    if (k >= 0) usett.splice(k, 1);
  }
  let idx = 0;
  for (const p of andre) {
    while (hender[p]!.length < kortPer) {
      if (idx >= usett.length) return null;
      hender[p]!.push(usett[idx++]!);
    }
  }
  return hender;
}

// ---------------------------------------------------------------------------
// VELG: trumffarge + etterlyst kort
// ---------------------------------------------------------------------------

function fargeTelling(hånd: readonly Kort[]): Record<Farge, number> {
  const t: Record<Farge, number> = { S: 0, H: 0, R: 0, K: 0 };
  for (const k of hånd) t[k.farge]++;
  return t;
}

function velgTrumfOgKall(state: GameState, spiller: number, opts: BotOpts): Handling {
  const rng = lagOppsettRng(opts);
  const terskel = opts.terskel ?? Math.min(STD_TERSKEL, 7);
  const verdener = Math.max(6, Math.floor((opts.verdener ?? STD_VERDENER) / 2));
  const egen = state.hender[spiller]!;
  const egenInt = egen.map(kortTilInt);
  const vrakInt = state.vrak.map(kortTilInt);
  const N = state.antallSpillere;
  const T = state.giving.antallStikk;
  const kortPer = state.giving.kortPerSpiller;
  const erSolo = state.melding!.type === "solo";

  const tel = fargeTelling(egen);
  // Kandidattrumfer: farger sortert etter lengde (de to lengste er mest aktuelle).
  const trumfKand = (FARGER.slice() as Farge[]).sort((a, b) => tel[b] - tel[a]).slice(0, 3);

  let beste: { trumf: Farge; etterlyst: Kort | null; verdi: number } | null = null;

  for (const trumf of trumfKand) {
    const kall = lovligeEtterlys(state, trumf).sort((a, b) => b.verdi - a.verdi);
    const kallKand: (Kort | null)[] = kall.slice(0, 2);
    if (erSolo) kallKand.push(null); // solo kan la være å etterlyse
    if (kallKand.length === 0) continue;

    for (const kall1 of kallKand) {
      const callInt = kall1 ? kortTilInt(kall1) : null;
      let sum = 0;
      let gyldige = 0;
      for (let w = 0; w < verdener; w++) {
        const hender = delMotstandere(egenInt, vrakInt, callInt, N, kortPer, spiller, rng);
        if (!hender) continue;
        const makker = finnHolder(hender, callInt, erSolo);
        const declLag = new Array<boolean>(N).fill(false);
        declLag[spiller] = true;
        if (makker !== null) declLag[makker] = true;
        const oppsett: DDOppsett = {
          N,
          trump: FARGER.indexOf(trumf),
          declLag,
          hender,
          iTur: spiller,
          totalStikk: T,
        };
        const lag = evaluerHybrid(oppsett, terskel);
        sum += observatørPoeng(lag, { hender, declLag, makkerVerden: makker }, {
          observator: spiller,
          budvinner: spiller,
          meldingstype: state.melding!.type,
          bud: state.melding!.bud,
          totalStikk: T,
          mål: state.regler.målPoeng,
          N,
        });
        gyldige++;
      }
      const verdi = gyldige > 0 ? sum / gyldige : -Infinity;
      if (!beste || verdi > beste.verdi) beste = { trumf, etterlyst: kall1, verdi };
    }
  }

  if (!beste) {
    // Nødløsning: lengste farge, høyeste manglende trumf.
    const trumf = trumfKand[0]!;
    const kall = erSolo ? null : (lovligeEtterlys(state, trumf).sort((a, b) => b.verdi - a.verdi)[0] ?? null);
    return { type: "VELG", spiller, trumf, etterlyst: kall };
  }
  return { type: "VELG", spiller, trumf: beste.trumf, etterlyst: beste.etterlyst };
}

function finnHolder(hender: number[][], callInt: number | null, erSolo: boolean): number | null {
  if (callInt === null || erSolo) return null;
  for (let p = 0; p < hender.length; p++) if (hender[p]!.includes(callInt)) return p;
  return null;
}

// ---------------------------------------------------------------------------
// VRAK: velg kort å vrake – søk over kandidater (ikke bare heuristikk)
// ---------------------------------------------------------------------------

/** Heuristisk vrak for én valgt trumf: vrak lavt fra korte sidefarger. */
function heuristiskVrak(hånd: readonly Kort[], trumf: Farge, antall: number, tel: Record<Farge, number>): Kort[] {
  const kandidater = hånd
    .filter((k) => k.farge !== trumf && k.verdi < 14)
    .map((k) => ({ k, score: k.verdi + (tel[k.farge]! > 3 ? 20 : 0) }))
    .sort((a, b) => a.score - b.score)
    .map((x) => x.k);
  const vrak = kandidater.slice(0, antall);
  if (vrak.length < antall) {
    const rest = hånd.filter((k) => !vrak.some((v) => likeKort(v, k))).sort((a, b) => a.verdi - b.verdi);
    for (const k of rest) {
      if (vrak.length >= antall) break;
      vrak.push(k);
    }
  }
  return vrak;
}

/** Genererer noen fornuftige vrak-kandidater for en gitt trumffarge. */
function vrakKandidater(hånd: readonly Kort[], trumf: Farge, antall: number, tel: Record<Farge, number>): Kort[][] {
  const kandidater: Kort[][] = [];
  const sett = new Set<string>();
  const leggTil = (v: Kort[]): void => {
    if (v.length !== antall) return;
    const nøkkel = v.map(kortId).sort().join(",");
    if (!sett.has(nøkkel)) {
      sett.add(nøkkel);
      kandidater.push(v);
    }
  };
  const ikkeTrumf = hånd.filter((k) => k.farge !== trumf).slice().sort((a, b) => a.verdi - b.verdi);

  // 1) heuristikk (kort farge først)
  leggTil(heuristiskVrak(hånd, trumf, antall, tel));
  // 2) rett og slett de laveste ikke-trumf-kortene
  leggTil(ikkeTrumf.slice(0, antall));
  // 3) laveste ikke-trumf uten ess
  leggTil(ikkeTrumf.filter((k) => k.verdi < 14).slice(0, antall));
  // 4) tøm de korteste sidefargene helt (skaper renonce for trumfing)
  const sidefarger = (FARGER.slice() as Farge[])
    .filter((f) => f !== trumf && tel[f]! > 0)
    .sort((a, b) => tel[a]! - tel[b]!);
  const void1: Kort[] = [];
  for (const f of sidefarger) {
    for (const k of hånd.filter((k) => k.farge === f).sort((a, b) => a.verdi - b.verdi)) {
      if (void1.length < antall && k.verdi < 14) void1.push(k);
    }
  }
  for (const k of ikkeTrumf) {
    if (void1.length >= antall) break;
    if (!void1.some((d) => likeKort(d, k))) void1.push(k);
  }
  leggTil(void1.slice(0, antall));

  if (kandidater.length === 0) {
    leggTil(hånd.slice().sort((a, b) => a.verdi - b.verdi).slice(0, antall));
  }
  return kandidater;
}

function velgVrak(state: GameState, spiller: number, opts: BotOpts): Handling {
  const rng = lagOppsettRng(opts);
  const terskel = opts.terskel ?? STD_TERSKEL;
  const verdener = Math.max(6, Math.floor((opts.verdener ?? STD_VERDENER) / 2));
  const antall = state.giving.talong;
  const hånd = state.hender[spiller]!;
  const N = state.antallSpillere;
  const T = state.giving.antallStikk;
  const kortPer = state.giving.kortPerSpiller;
  const tel = fargeTelling(hånd);

  if (antall === 0) return { type: "VRAK", spiller, kort: [] };

  // Vurder de tre lengste fargene som mulig trumf, med et par vrak-kandidater hver.
  const trumfKand = (FARGER.slice() as Farge[]).sort((a, b) => tel[b] - tel[a]).slice(0, 3);

  let beste: { vrak: Kort[]; verdi: number } | null = null;
  for (const trumf of trumfKand) {
    const trumfIdx = FARGER.indexOf(trumf);
    for (const vrak of vrakKandidater(hånd, trumf, antall, tel)) {
      const beholdt = hånd.filter((k) => !vrak.some((v) => likeKort(v, k)));
      const beholdtInt = beholdt.map(kortTilInt);
      const vrakInt = vrak.map(kortTilInt);
      // Antatt kall = høyeste manglende trumf (definerer makker i hver verden).
      const beholdtSet = new Set(beholdtInt);
      const vrakSet = new Set(vrakInt);
      let callInt: number | null = null;
      for (let r = 12; r >= 0; r--) {
        const c = trumfIdx * 13 + r;
        if (!beholdtSet.has(c) && !vrakSet.has(c)) {
          callInt = c;
          break;
        }
      }
      let sum = 0;
      let gyldige = 0;
      for (let w = 0; w < verdener; w++) {
        const hender = delMotstandere(beholdtInt, vrakInt, callInt, N, kortPer, spiller, rng);
        if (!hender) continue;
        const makker = finnHolder(hender, callInt, false);
        const declLag = new Array<boolean>(N).fill(false);
        declLag[spiller] = true;
        if (makker !== null) declLag[makker] = true;
        const lag = evaluerHybrid(
          { N, trump: trumfIdx, declLag, hender, iTur: spiller, totalStikk: T },
          terskel,
        );
        sum += observatørPoeng(lag, { hender, declLag, makkerVerden: makker }, {
          observator: spiller,
          budvinner: spiller,
          meldingstype: state.melding!.type,
          bud: state.melding!.bud,
          totalStikk: T,
          mål: state.regler.målPoeng,
          N,
        });
        gyldige++;
      }
      const verdi = gyldige > 0 ? sum / gyldige : -Infinity;
      if (!beste || verdi > beste.verdi) beste = { vrak, verdi };
    }
  }

  if (!beste) {
    return { type: "VRAK", spiller, kort: heuristiskVrak(hånd, trumfKand[0]!, antall, tel) };
  }
  return { type: "VRAK", spiller, kort: beste.vrak };
}

// ---------------------------------------------------------------------------
// BUD: sampling-basert budestimat
// ---------------------------------------------------------------------------

function estimerStikk(state: GameState, spiller: number, opts: BotOpts): number[] {
  const rng = lagOppsettRng(opts);
  const terskel = Math.min(opts.terskel ?? 6, 6);
  const verdener = Math.max(6, Math.floor((opts.verdener ?? STD_VERDENER) / 2));
  const egen = state.hender[spiller]!;
  const egenInt = egen.map(kortTilInt);
  const N = state.antallSpillere;
  const T = state.giving.antallStikk;
  const kortPer = state.giving.kortPerSpiller;
  const talong = state.giving.talong;

  const resultater: number[] = [];
  for (let w = 0; w < verdener; w++) {
    // Del ut: motstandere kortPer hver + talong til «dødt».
    const brukt = new Set<number>(egenInt);
    const usett: number[] = [];
    for (let c = 0; c < 52; c++) if (!brukt.has(c)) usett.push(c);
    for (let i = usett.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = usett[i]!;
      usett[i] = usett[j]!;
      usett[j] = t;
    }
    const talongKort = usett.slice(0, talong);

    // Budvinner tar talong (16 kort), vraker de `talong` laveste (ikke-trumf).
    const utvidet = egenInt.concat(talongKort);
    const utvidetKort = utvidet.map(intTilKort);
    const tel = fargeTelling(utvidetKort);
    const trumf = (FARGER.slice() as Farge[]).sort((a, b) => tel[b] - tel[a])[0]!;
    const beholdt = utvidet
      .map((c) => ({ c, k: intTilKort(c) }))
      .sort((a, b) => vrakScore(a.k, trumf, tel) - vrakScore(b.k, trumf, tel))
      .slice(talong) // fjern de `talong` verste
      .map((x) => x.c);
    const beholdtSet = new Set(beholdt);
    const dødt = utvidet.filter((c) => !beholdtSet.has(c)); // de vrakede (døde) kortene

    // Etterlys høyeste manglende trumf (ikke i hånd, ikke vraket) → makker.
    const trumfIdx = FARGER.indexOf(trumf);
    const dødSet = new Set(dødt);
    let callInt: number | null = null;
    for (let r = 12; r >= 0; r--) {
      const c = trumfIdx * 13 + r;
      if (!beholdtSet.has(c) && !dødSet.has(c)) {
        callInt = c;
        break;
      }
    }
    const hender = delMotstandere(beholdt, dødt, callInt, N, kortPer, spiller, rng);
    if (!hender) continue;
    const makker = finnHolder(hender, callInt, false);
    const declLag = new Array<boolean>(N).fill(false);
    declLag[spiller] = true;
    if (makker !== null) declLag[makker] = true;
    const lag = evaluerHybrid(
      { N, trump: trumfIdx, declLag, hender, iTur: spiller, totalStikk: T },
      terskel,
    );
    resultater.push(lag);
  }
  return resultater;
}

function vrakScore(k: Kort, trumf: Farge, tel: Record<Farge, number>): number {
  if (k.farge === trumf) return 100 + k.verdi; // behold trumf
  if (k.verdi === 14) return 90; // behold ess
  return k.verdi + (tel[k.farge] > 3 ? 15 : 0);
}

function velgBud(state: GameState, spiller: number, opts: BotOpts): Handling {
  const lov = lovligeHandlinger(state);
  if (lov.fase !== "BUDRUNDE") throw new Error("ikke budrunde");
  const høyeste = state.budrunde.høyeste?.bud ?? null;
  const T = state.giving.antallStikk;

  const stikk = estimerStikk(state, spiller, opts);
  if (stikk.length === 0) return { type: "BUD", spiller, bud: PASS };
  const sortert = stikk.slice().sort((a, b) => a - b);
  const andel = (n: number): number => sortert.filter((x) => x >= n).length / sortert.length;

  // Høyeste tallbud vi tror vi tar med margin (andel ≥ 0.55).
  let målBud = 0;
  for (let n = T; n >= 5; n--) {
    if (andel(n) >= 0.55) {
      målBud = n;
      break;
    }
  }

  const rang = (b: Bud): number =>
    b === SOLO ? 2000 : b === AMERIKANER ? 1000 : typeof b === "number" ? b : 0;
  const nåværende = høyeste === null ? 0 : rang(høyeste);

  // Amerikaner/solo bare når vi nær sikkert tar alt.
  if (andel(T) >= 0.85 && rang(SOLO) > nåværende) {
    return { type: "BUD", spiller, bud: SOLO };
  }
  if (andel(T) >= 0.6 && rang(AMERIKANER) > nåværende) {
    return { type: "BUD", spiller, bud: AMERIKANER };
  }
  if (målBud >= 5 && målBud > nåværende) {
    return { type: "BUD", spiller, bud: målBud };
  }
  return { type: "BUD", spiller, bud: PASS };
}

// ---------------------------------------------------------------------------
// Offentlig API
// ---------------------------------------------------------------------------

/** Velger bot-handling for spilleren i tur, ut fra dennes informasjon. */
export function velgHandling(state: GameState, opts: BotOpts = {}): Handling {
  const spiller = state.iTur;
  switch (state.fase) {
    case "BUDRUNDE":
      return velgBud(state, spiller!, opts);
    case "VRAK":
      return velgVrak(state, state.budvinner!, opts);
    case "VELG":
      return velgTrumfOgKall(state, state.budvinner!, opts);
    case "SPILL":
      return velgKort(state, spiller!, opts);
    case "RUNDE_SLUTT":
      return { type: "NESTE" };
    case "FERDIG":
      throw new Error("Kampen er ferdig");
  }
}
