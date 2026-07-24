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
  MINSTE_TALLBUD,
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
import { byggDDOppsett, trekkVerdenBelief, type Verden } from "../solver/sampler.ts";

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
  /**
   * Tidsbudsjett i millisekunder for ett kortvalg. Er dette satt, trekker
   * boten stadig nye verdener til tiden er ute (anytime), i stedet for et
   * fast antall – «tenk lenger = sterkere». Overstyrer `verdener`/`maksEval`
   * for spillefasen.
   */
  readonly tidsbudsjettMs?: number;
  /**
   * «Klarsynthet» i budestimatet: hvor mange sluttstikk som løses eksakt
   * (dobbelt-dummy) per verden. 0 = ren grådig utspilling (ikke-klarsynt).
   * Standard 6. Empiri: fordi botens FAKTISKE kortspill (PIMC) er sterkt og
   * ligger nær dobbelt-dummy, forutsier dobbelt-dummy-estimatet (med diskonto)
   * de realiserte stikkene bedre enn et grådig «ærlig» estimat – og gir klart
   * flere poeng (+100 mot +36 per kamp i test). Derfor er dette standard.
   */
  readonly budTerskel?: number;
  /**
   * Kalibreringsmargin trukket fra budestimatet (stikk). Korrigerer for at
   * dobbelt-dummy er litt optimistisk. Standard 1 – gir ~89 % innfrielse og
   * best poeng; 0 overbyr (65 % innfrielse, færre poeng).
   */
  readonly budDiskonto?: number;
  /**
   * Nodetak per enkelt-søk i dobbelt-dummy-løseren. Standard bounder verste-
   * fall (~0,1 s) ved å falle til grådig på patologisk tunge giver – nødvendig
   * for det harde tidstaket. Sett **0 for eksakt spill uten fallback** (maks
   * styrke, men ingen tidsgaranti). Se {@link MAKS_STYRKE}.
   */
  readonly nodeTak?: number;
  /**
   * EKSPERIMENTELL motstander-inferens: nedvekt sampla verdener der budlaget
   * ikke kan nå budet. **Standard av** – den naive versjonen skader spillet
   * fordi den bruker det REALISERTE DD-utfallet, mens en melder byr på HÅNDEN
   * sin (ikke klarsynt). Den forkaster derfor «sterk hånd, uheldig fordeling»-
   * verdener – nettopp der godt forsvar setter kontrakten. En korrekt variant
   * må vekte på melderens håndstyrke, ikke utfallet. A/B over 24 fulle kamper:
   * −8,7 poeng/kamp (13/24 seiere) – uskillbart fra null / marginalt negativt.
   * Beholdt som opt-in for videre arbeid (riktig løsning = CFR på budrunden).
   */
  readonly budInferens?: boolean;
  /** «Mykhet» i budinferensen (stikk). Lavere = skarpere nedvekting. Standard 1,5. */
  readonly inferensTau?: number;
  /**
   * ADAPTIV DYBDE for kortvalg med tidsbudsjett: 55 % av tiden rangerer
   * kandidatene i bredden (mange verdener, basisterskel), resten re-evaluerer
   * topp-3 på friske verdener med terskel + 2 og firedoblet nodetak.
   * Kombinerer breddens lave varians med dybdens presisjon der det gjelder.
   */
  readonly adaptivDybde?: boolean;
}

const STD_VERDENER = 20;
const STD_TERSKEL = 7;
const STD_MAKS_EVAL = 240; // ~kandidater × verdener-tak per spill-beslutning

/**
 * Maksimal styrke: spill alltid det virkelig beste kortet ut fra
 * informasjonen, uten forenklinger. Løser hver sampla verden EKSAKT hele veien
 * (terskel = alle stikk, `nodeTak: 0` – ingen grådig fallback) og velger
 * argmax. Kombiner med `tidsbudsjettMs` eller mange `verdener` for å tenke så
 * lenge du vil. Merk: ingen 2-sekunders-garanti – et åpningsutspill kan ta
 * sekunder fordi 12-stikks eksaktløsning er tung.
 */
export const MAKS_STYRKE: BotOpts = {
  terskel: 13,
  nodeTak: 0,
  budTerskel: 8,
  budDiskonto: 1,
  verdener: 40,
};

/**
 * Sterkeste innstilling som fortsatt holder et hardt tidstak litt under 3 s
 * per tur. Sluttspillet løses uansett eksakt; den ekstra tiden går til FLERE
 * verdener (lavere varians), ikke dypere eksaktsøk – målt gir terskel 7 ~34
 * verdener på åpningsutspillet mot bare ~4 for terskel 9 (som kaster bort tid
 * på tunge eksaktsøk som uansett faller til grådig). Nodetaket er litt høyere
 * enn standard, så flere 7-stikks sluttspill fullføres eksakt. Ment for
 * {@link BotAgent} med pondering:
 *
 * ```ts
 * const agent = new BotAgent(minPlass, KVALITET_3S);
 * agent.pondre(state, ledigTid);      // tenk mens du venter (banker verdener)
 * agent.beslutt(state, MAKS_MS_3S);   // blokkerer < 3 s
 * ```
 */
export const KVALITET_3S: BotOpts = {
  terskel: 7,
  nodeTak: 700_000,
  budTerskel: 8,
  budDiskonto: 1,
};

/** Anbefalt hardt tidstak for {@link KVALITET_3S} (ms) – trygg margin til 3 s. */
export const MAKS_MS_3S = 2650;

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
// Spillefase: PIMC som en inkrementell akkumulator (muliggjør «pondering»)
// ---------------------------------------------------------------------------

/**
 * En pågående kort-beslutning. PIMC er inkrementell: hver ny verden legges
 * til `sumPoeng`, så vi kan tenke i porsjoner (anytime) og gjenoppta senere.
 */
interface SpillAkk {
  readonly signatur: string;
  readonly state: GameState;
  readonly spiller: number;
  readonly lovlige: Kort[];
  readonly kortInt: number[];
  readonly sumPoeng: number[];
  readonly kontekst: PoengKontekst;
  readonly terskel: number;
  readonly nodeTak: number; // 0 = eksakt (ingen grådig fallback)
  readonly rng: () => number;
  readonly fast: Kort | null; // satt når bare ett lovlig kort
  readonly inferens: boolean; // vekt verdener etter bud-rasjonalitet
  readonly tau: number;
  readonly målStikk: number; // budets stikkmål (for inferensvekt)
  antall: number; // antall gyldige verdener behandlet
  // Adaptiv dybde (fase 2): topp-kandidatene fra breddefasen re-evalueres
  // på friske verdener med dypere eksaktsøk. Se utvidTidAdaptivt.
  dypSum: number[];
  dypAntall: number;
  dypKandidater: number[] | null;
}

/** Kompakt signatur for en spillbeslutning (samme => samme akkumulator). */
function spillSignatur(state: GameState, spiller: number): string {
  const hånd = (state.hender[spiller] ?? []).map(kortId).sort().join("");
  const bord = state.bord.map((kp) => kp.spiller + kortId(kp.kort)).join(",");
  const et = state.etterlyst ? kortId(state.etterlyst) : "-";
  return `${state.rundeNr}|${state.stikkSpilt}|${spiller}|${state.trumf}|${et}|${state.makkerAvslørt ? 1 : 0}|${hånd}|${bord}`;
}

function nySpillAkk(state: GameState, spiller: number, opts: BotOpts): SpillAkk {
  const lovlige = lovligeKort(state, spiller);
  const gjenstår = state.giving.antallStikk - state.stikkSpilt;
  const terskel = Math.min(opts.terskel ?? STD_TERSKEL, Math.max(1, gjenstår));
  return {
    signatur: spillSignatur(state, spiller),
    state,
    spiller,
    lovlige,
    kortInt: lovlige.map(kortTilInt),
    sumPoeng: new Array<number>(lovlige.length).fill(0),
    kontekst: {
      observator: spiller,
      budvinner: state.budvinner!,
      meldingstype: state.melding!.type,
      bud: state.melding!.bud,
      totalStikk: state.giving.antallStikk,
      mål: state.regler.målPoeng,
      N: state.antallSpillere,
    },
    terskel,
    nodeTak: opts.nodeTak ?? NODE_TAK,
    rng: lagOppsettRng(opts),
    fast: lovlige.length <= 1 ? (lovlige[0] ?? null) : null,
    inferens: opts.budInferens ?? false,
    tau: opts.inferensTau ?? 1.5,
    målStikk: state.melding!.type === "tall" ? state.melding!.bud : state.giving.antallStikk,
    antall: 0,
    dypSum: new Array<number>(lovlige.length).fill(0),
    dypAntall: 0,
    dypKandidater: null,
  };
}

// Nodetak per enkelt-evaluering – bounder verste-fall for ett kort (~0,1 s),
// slik at et helt sveip ikke sprenger tidsbudsjettet. Faller til grådig.
const NODE_TAK = 400_000;

/**
 * Inferensvekt for en verden: budlagets DD-stikk her (`verdenDD`) sett mot
 * budet. Når laget ikke kan nå budet, er verdenen lite forenlig med at noen
 * meldte så høyt → mykt nedvektet. 1 hvis inferens er av eller budet nås.
 */
function verdenVekt(akk: SpillAkk, verdenDD: number): number {
  if (!akk.inferens) return 1;
  const mangler = akk.målStikk - verdenDD;
  return mangler <= 0 ? 1 : Math.exp(-mangler / akk.tau);
}

/** Behandler én verden (uten tidssjekk innad); false hvis sampling mislyktes. */
function utvidEn(akk: SpillAkk): boolean {
  const verden = trekkVerdenBelief(akk.state, akk.spiller, akk.rng);
  if (!verden) return false;
  const oppsett = byggDDOppsett(akk.state, verden);
  const påLag = verden.declLag[akk.spiller] === true;
  const n = akk.lovlige.length;
  const lags = new Array<number>(n);
  // verdenDD = budlagets stikk ved optimalt spill = beste kandidat sett fra
  // spilleren (maks hvis på laget, min hvis forsvarer).
  let verdenDD = påLag ? -1 : 999;
  for (let i = 0; i < n; i++) {
    const lag = evaluerEtterTrekk(oppsett, akk.kortInt[i]!, akk.terskel, akk.nodeTak);
    lags[i] = lag;
    if (påLag ? lag > verdenDD : lag < verdenDD) verdenDD = lag;
  }
  const w = verdenVekt(akk, verdenDD);
  for (let i = 0; i < n; i++) akk.sumPoeng[i]! += w * observatørPoeng(lags[i]!, verden, akk.kontekst);
  akk.antall++;
  return true;
}

/**
 * Tenk til `frist` (Date.now-ms). Tid sjekkes MELLOM hver kandidat, og en
 * halvferdig verden forkastes – da er verste-fall overskuddet ett kortvalg
 * (nodetaket holder det ~0,1 s), så blokkeringen holder seg under taket.
 */
function utvidTid(akk: SpillAkk, frist: number, maks = 100_000): void {
  if (akk.fast) return;
  const bidrag = new Array<number>(akk.lovlige.length);
  let tomme = 0;
  while (akk.antall < maks && Date.now() < frist) {
    const verden = trekkVerdenBelief(akk.state, akk.spiller, akk.rng);
    if (!verden) {
      if (++tomme > 50) break;
      continue;
    }
    tomme = 0;
    const oppsett = byggDDOppsett(akk.state, verden);
    const påLag = verden.declLag[akk.spiller] === true;
    let verdenDD = påLag ? -1 : 999;
    let avbrutt = false;
    for (let i = 0; i < akk.lovlige.length; i++) {
      if (Date.now() >= frist) {
        avbrutt = true;
        break;
      }
      const lag = evaluerEtterTrekk(oppsett, akk.kortInt[i]!, akk.terskel, akk.nodeTak);
      bidrag[i] = observatørPoeng(lag, verden, akk.kontekst);
      if (påLag ? lag > verdenDD : lag < verdenDD) verdenDD = lag;
    }
    if (avbrutt) break; // forkast den halvferdige verdenen
    const w = verdenVekt(akk, verdenDD);
    for (let i = 0; i < akk.lovlige.length; i++) akk.sumPoeng[i]! += w * bidrag[i]!;
    akk.antall++;
  }
  // Garanter minst én verden slik at vi alltid gir et reelt svar.
  let vakt = 0;
  while (akk.antall < 1 && vakt++ < 300) utvidEn(akk);
}

/** Tenk til et fast antall verdener (deterministisk gitt seed). */
function utvidAntall(akk: SpillAkk, mål: number): void {
  if (akk.fast) return;
  let tomme = 0;
  while (akk.antall < mål && tomme < 300) {
    if (!utvidEn(akk)) tomme++;
    else tomme = 0;
  }
}

/**
 * ADAPTIV DYBDE (anytime): først bredde – mange verdener på basisterskelen
 * rangerer kandidatene (55 % av budsjettet) – deretter dybde: de 3 beste
 * kandidatene re-evalueres på friske verdener med terskel + 2 og firedoblet
 * nodetak (færre kandidater per verden gjør dypere søk overkommelig).
 * Dybdefasen avgjør valget når den har nok verdener; ellers gjelder bredden.
 */
function utvidTidAdaptivt(akk: SpillAkk, frist: number): void {
  if (akk.fast) return;
  const start = Date.now();
  // Har pondering allerede banket rikelig med breddeverdener, går hele
  // budsjettet til dybdefasen; ellers brukes 55 % på bredden først.
  if (akk.antall < 20) utvidTid(akk, start + (frist - start) * 0.55);
  if (akk.antall === 0 || akk.lovlige.length < 3) {
    utvidTid(akk, frist);
    return;
  }
  const rekkefølge = akk.sumPoeng
    .map((_, i) => i)
    .sort((a, b) => akk.sumPoeng[b]! - akk.sumPoeng[a]!);
  const kandidater = rekkefølge.slice(0, 3);
  akk.dypKandidater = kandidater;
  const gjenstår = akk.state.giving.antallStikk - akk.state.stikkSpilt;
  const dypTerskel = Math.min(Math.max(1, gjenstår), akk.terskel + 2);
  const dypTak = akk.nodeTak === 0 ? 0 : akk.nodeTak * 4;
  const bidrag = new Array<number>(kandidater.length);
  let tomme = 0;
  while (Date.now() < frist && tomme < 50) {
    const verden = trekkVerdenBelief(akk.state, akk.spiller, akk.rng);
    if (!verden) {
      tomme++;
      continue;
    }
    tomme = 0;
    const oppsett = byggDDOppsett(akk.state, verden);
    let avbrutt = false;
    for (let j = 0; j < kandidater.length; j++) {
      if (Date.now() >= frist) {
        avbrutt = true;
        break;
      }
      const lag = evaluerEtterTrekk(oppsett, akk.kortInt[kandidater[j]!]!, dypTerskel, dypTak);
      bidrag[j] = observatørPoeng(lag, verden, akk.kontekst);
    }
    if (avbrutt) break; // forkast halvferdig verden
    for (let j = 0; j < kandidater.length; j++) akk.dypSum[kandidater[j]!]! += bidrag[j]!;
    akk.dypAntall++;
  }
}

function besteKort(akk: SpillAkk): Kort {
  if (akk.fast) return akk.fast;
  if (akk.antall === 0) return akk.lovlige[0]!;
  // Dybdefasen overstyrer bredden når den har et minimum av verdener.
  if (akk.dypKandidater !== null && akk.dypAntall >= 3) {
    let best = akk.dypKandidater[0]!;
    for (const i of akk.dypKandidater) if (akk.dypSum[i]! > akk.dypSum[best]!) best = i;
    return akk.lovlige[best]!;
  }
  let best = 0;
  for (let i = 1; i < akk.lovlige.length; i++) if (akk.sumPoeng[i]! > akk.sumPoeng[best]!) best = i;
  return akk.lovlige[best]!;
}

function velgKort(state: GameState, spiller: number, opts: BotOpts): Handling {
  const akk = nySpillAkk(state, spiller, opts);
  if (akk.fast) return { type: "SPILL", spiller, kort: akk.fast };
  const budsjett = opts.tidsbudsjettMs ?? 0;
  if (budsjett > 0) {
    if (opts.adaptivDybde) utvidTidAdaptivt(akk, Date.now() + budsjett);
    else utvidTid(akk, Date.now() + budsjett);
  } else {
    const maksEval = opts.maksEval ?? STD_MAKS_EVAL;
    const verdener = Math.max(6, Math.min(opts.verdener ?? STD_VERDENER, Math.floor(maksEval / akk.lovlige.length)));
    utvidAntall(akk, verdener);
  }
  return { type: "SPILL", spiller, kort: besteKort(akk) };
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
        const lag = evaluerHybrid(oppsett, terskel, opts.nodeTak ?? NODE_TAK);
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
          opts.nodeTak ?? NODE_TAK,
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
  const terskel = opts.budTerskel ?? 6;
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
      opts.nodeTak ?? NODE_TAK,
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
  const mål = state.regler.målPoeng;

  // Estimatet er dobbelt-dummy (litt optimistisk). En kalibrert diskonto gir
  // forventet faktisk stikktall. Testet: dette forutsier botens realiserte
  // stikk bedre enn et ikke-klarsynt «ærlig» estimat, og gir flest poeng.
  const DISKONTO = opts.budDiskonto ?? 1;
  const justert = stikk.map((x) => x - DISKONTO);
  const antall = justert.length;
  // P(minst n stikk) og P(alle stikk) fra fordelingen.
  const P = (n: number): number => justert.filter((x) => x >= n).length / antall;
  const Pupp = (n: number): number => stikk.filter((x) => x >= n).length / antall; // udiskontert

  const rang = (b: Bud): number =>
    b === SOLO ? 2000 : b === AMERIKANER ? 1000 : typeof b === "number" ? b : 0;
  const nåværende = høyeste === null ? 0 : rang(høyeste);

  // Velg budet som MAKSIMERER forventet egen-poeng. Tallbud n: budvinner får
  // +2n hvis klart, −2n hvis ikke → EV = 2n·(2·P(n) − 1). Symmetrien gjør at
  // optimal terskel havner rundt 65–75 % sjanse, ikke ved «nesten sikkert».
  let besteBud: Bud = PASS;
  let besteEV = 0; // pass = 0
  for (let n = MINSTE_TALLBUD; n <= T; n++) {
    if (n <= nåværende) continue;
    const ev = 2 * n * (2 * P(n) - 1);
    if (ev > besteEV) {
      besteEV = ev;
      besteBud = n;
    }
  }
  // Amerikaner: alle stikk med makker, budvinner ±mål/2. Bruk udiskontert P
  // (diskontoen ville gjort «alle stikk» umulig), men krev høy sjanse.
  if (rang(AMERIKANER) > nåværende) {
    const pAll = Pupp(T);
    const ev = (mål / 2) * (2 * pAll - 1);
    if (pAll >= 0.85 && ev > besteEV) {
      besteEV = ev;
      besteBud = AMERIKANER;
    }
  }
  // Solo: alle stikk ALENE. Estimatet antar makker, så det overvurderer solo
  // kraftig – meld bare når hver eneste verden gir alle stikk.
  if (rang(SOLO) > nåværende && Pupp(T) >= 0.99) {
    const ev = mål; // klart nær sikkert
    if (ev > besteEV) besteBud = SOLO;
  }

  return { type: "BUD", spiller, bud: besteBud };
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

/** Standard hardt tak på blokkerende tenketid per tur (ms). Litt margin til 2 s. */
export const STD_MAKS_MS = 1700;

/**
 * Spillende agent for én plass, med **anytime**-tenking.
 *
 * Kortvalg er inkrementelt (PIMC), så agenten kan «pondre» – tenke på sin
 * egen beslutning i ledige porsjoner – og til slutt svare innenfor et hardt
 * tidstak (`maksMs`, standard {@link STD_MAKS_MS}). Slik holdes blokkerende
 * tid per tur under grensen, samtidig som ekstra tenketid som gis mens man
 * venter faktisk teller (flere verdener = sterkere, lavere varians).
 *
 * Bruk i en driver:
 * ```ts
 * const agent = new BotAgent(minPlass, { terskel: 7 });
 * // Mens du venter / har ledig tid på agentens beslutning:
 * agent.pondre(state, 300);          // trygt å kalle gjentatte ganger
 * // Når svaret trengs (blokkerer ≤ maksMs):
 * const handling = agent.beslutt(state, 1800);
 * ```
 */
export class BotAgent {
  readonly plass: number;
  private readonly opts: BotOpts;
  private akk: SpillAkk | null = null;

  constructor(plass: number, opts: BotOpts = {}) {
    this.plass = plass;
    this.opts = opts;
  }

  /** Er `state` en kortbeslutning for denne agenten? */
  private erMinKortbeslutning(state: GameState): boolean {
    return state.fase === "SPILL" && state.iTur === this.plass;
  }

  private sikreAkk(state: GameState): void {
    const sig = spillSignatur(state, this.plass);
    if (!this.akk || this.akk.signatur !== sig) this.akk = nySpillAkk(state, this.plass, this.opts);
  }

  /**
   * Tenk i inntil `msBudsjett` ms på agentens nåværende kortvalg. Bruk denne
   * mens du har ledig tid – akkumulert arbeid gjenbrukes av `beslutt` så lenge
   * stillingen er den samme. No-op hvis det ikke er agentens kortbeslutning.
   */
  pondre(state: GameState, msBudsjett: number): void {
    if (!this.erMinKortbeslutning(state)) return;
    this.sikreAkk(state);
    if (this.akk && !this.akk.fast) utvidTid(this.akk, Date.now() + Math.max(0, msBudsjett));
  }

  /** Hvor mange verdener som er tenkt gjennom for gjeldende beslutning. */
  ponderetVerdener(state: GameState): number {
    if (!this.erMinKortbeslutning(state)) return 0;
    const sig = spillSignatur(state, this.plass);
    return this.akk && this.akk.signatur === sig ? this.akk.antall : 0;
  }

  /**
   * Agentens tur: returner beste handling. For kortvalg toppes akkumulert
   * pondering opp innenfor et hardt tak `maksMs` og blokkerer aldri lenger.
   * Andre faser (bud/byttekort/trumf) er allerede godt under grensen.
   */
  beslutt(state: GameState, maksMs: number = STD_MAKS_MS): Handling {
    if (this.erMinKortbeslutning(state)) {
      this.sikreAkk(state);
      const akk = this.akk!;
      if (!akk.fast) {
        if (this.opts.adaptivDybde) utvidTidAdaptivt(akk, Date.now() + Math.max(1, maksMs));
        else utvidTid(akk, Date.now() + Math.max(1, maksMs));
      }
      const kort = besteKort(akk);
      this.akk = null;
      return { type: "SPILL", spiller: this.plass, kort };
    }
    // Ikke-kortfaser: bruk fasehåndtererne (alle godt under tidsgrensen).
    return velgHandling(state, this.opts);
  }
}
