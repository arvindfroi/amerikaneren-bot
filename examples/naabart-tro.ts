/**
 * NÅBAR TRO — DET INFORMASJONSRETTFERDIGE TAKET FOR K8 (12. sep).
 *
 * K8-raden måler trohodets log-tap på skjulte kort som «% av veien gulv → tak», med gulv ln 3
 * og tak KLARSYN (log-tap 0). Ingen spiller ved bordet kan nå klarsyn, så forslaget «≥ 25 %»
 * måles mot et tak som ikke finnes. Samme feil som K3.1/K3.4/K3.6/K7 hadde, rettet samme dag i
 * `naabart-bud.ts` og `naabart-handling.ts`. Denne fila er grepet for troen.
 *
 * ============ HVA TAKET ER ================================================
 *
 * Bayes-posterioren over hvor de skjulte kortene ligger, gitt ALT som er offentlig for setet
 * OG definisjonen av policyene de andre setene faktisk spiller. Policyene uten søk er, i KANONISK
 * form (`kanonisk` under: hånden sortert, frø 0), DETERMINISTISKE funksjoner av det setet kan vite,
 * så likelihooden for et offentlig valg er 0 eller 1: en giv er forenlig
 * hvis og bare hvis hvert sete, spilt på sin hånd i den given, gjør nøyaktig det bordet så.
 * Prioren er uniform stokking. Posterioren er da uniform over de forenlige givene, og
 * marginalene er andelen av dem der kortet ligger hos hvert sete.
 *
 * Et trohode kan ikke gjøre det bedre i forventning (det er Bayes-optimalt for disse
 * motstanderne), og det kan komme dit uten klarsyn. POLICY → NÅBAR er det troen kan hente;
 * NÅBAR → KLARSYN finnes ikke ved bordet.
 *
 * ============ HVA SOM ER SKJULT, OG HVA SOM ER EN FAKTOR ==================
 *
 * Partikkelen er den OPPRINNELIGE given sett fra observatøren `o`: `loc[kort]` er setet kortet
 * ble delt ut til, eller TALONG. Spilte kort er festet der de ble spilt. To tilfeller:
 *
 *   o ER BUDVINNER  talongen og vraket er kjent (`KJENT`). Skjult: de tre andres hender.
 *   o ER IKKE DET   skjult: to hender, budvinnerens tolv, og hvilke fire av hennes seksten
 *                   som var talongen. VRAKET er IKKE en fri variabel: det er det budvinnerens
 *                   policy vraker av de seksten (samme K2-fiks som `medVerden`, 381df73:
 *                   vraket følger verdenen). Budvinnerens spilte kort kan ha kommet fra
 *                   talongen, så de er «halvfestet»: hos henne eller i talongen.
 *
 * Likelihooden FAKTORISERER per sete, fordi hvert sete bare ser sin egen hånd (K2, prøvd for
 * speken i `k2-spek.test.ts`): ikke-budvinner q har én faktor på sine tolv kort (bud og kort);
 * budvinneren har to — `B` på de tolv hun byr med, `S` på de seksten (vrak → trumfvalg → kort).
 * Hver faktor huskes per kortmaske (`Trominne`), så en hånd som er prøvd for én partikkel er
 * prøvd for alle, og for alle partikkeltall i konvergensmålingen.
 *
 * ============ EKSAKT FAKTORISERT TELLING — DET SOM BRUKES ==================
 *
 * Posterioren er uniform over de forenlige givene, så marginalene er TELLINGER. Tellingen går
 * sete for sete og skjærer bort tidlig, fordi likelihooden faktoriserer:
 *
 *   1. De frie kortene deles på setene uten budvinneren i tur (kombinasjoner av riktig størrelse).
 *      Hvert sete sjekkes på sin maske med en gang; en hånd som ikke gjenskaper setets bud og kort
 *      stopper hele grenen. Det siste setet (budvinneren er observatør) eller budvinnerens seksten
 *      (ellers) er da tvunget.
 *   2. o IKKE BUDVINNER: budvinnerens seksten sjekkes mot `S` (vrak → trumfvalg → kort) og regelen
 *      om det etterlyste kortet. Hvilke fire av de seksten som var talongen, påvirker BARE `B`
 *      (budene på de tolv): given teller med vekten w(seksten) = #{T ⊂ seksten, |T| = 4 : B(seksten \ T)},
 *      husket per seksten. Klassen (sete eller død binge) avhenger ikke av T, så marginalene er de
 *      vektede tellingene, identiske med å telle alle giver (T inkludert) én og én — prøvd mot den
 *      naive tellingen (`telling: "naiv"`) og mot full omspilling av runden.
 *
 * Kostnaden styres av STØRRELSEN (`størrelse()`): multinomialen av de frie kortene på gruppene,
 * uten T. Det er en øvre grense for antall blader før skjæring; policykallene er langt færre
 * (én sjekk per distinkt maske per sete, husket i `Trominne`). `eksaktGrense` er i denne enheten.
 * Grensen i `k8-tak.ts` er valgt fra målt kostnad (se commit-meldingen og `--eksakt-grense`).
 *
 * POLICY-BLIND (`regel: true`, bare budvinneren som observatør): samme telling der en hendelse er
 * forenlig hvis den er LOVLIG med hånden (kortet følger regelen; bud avhenger ikke av hånden).
 * Posterioren er da uniform over de regelforenlige givene — sammenlikningen som viser hva
 * policyene er verdt. For en ikke-budvinner er vraket en fri variabel i den tellingen og ikke
 * implementert.
 *
 * ============ SEKVENSIELL MONTE CARLO — EKSPERIMENTELL =====================
 *
 * MÅLT 12. sep: TIDLIG i runden kollapser filteret eller scorer verre enn uniform uten ~40
 * foryngelsestrekk per partikkel (0,87–0,89 log-tap i stikk 3 med 200 partikler, 20–60 s per
 * stilling). Det er IKKE et tak før blandingen er løst, og ingen prøve holder det. Koden står for
 * videre arbeid; `partikler: 0` slår den helt av.
 *
 * Hendelsene behandles i bordets rekkefølge. Ved hver offentlige handling av et annet sete
 * sjekkes den setets faktor fram til og med handlingen; partikler som ikke gjenskaper den dør.
 * Faller andelen levende under `terskel`, trekkes N nye blant de levende (systematisk), og hver
 * FORYNGES med Metropolis-trekk som har posterioren som invariant fordeling:
 *
 *   BYTT   to skjulte kort i ulike seter bytter plass (festede kort står; halvfestede bare
 *          mellom budvinneren og talongen). Forslaget er symmetrisk (to kort uniformt fra en
 *          fast liste), målet uniform på støtten, så trekket godtas hvis og bare hvis given
 *          fortsatt er forenlig.
 *   FERSK  en ny giv trukket EKSAKT uniformt gitt det festede (håndstørrelser, talongens
 *          plass, det etterlyste kortet aldri hos budvinneren). Uavhengig Metropolis med en
 *          forslagsfordeling lik prioren på støtten: godtas hvis forenlig. Brukes så lenge den
 *          faktisk godtas (≥ 2 % i forrige foryngelse); sent i runden gjør den det ikke.
 *
 * Før HVER stilling som skal scores foryngelse i tillegg, så duplikatene etter en trekning ikke
 * står igjen som falsk sikkerhet. Dør alle, startes filteret på nytt fra given (inntil tre
 * ganger); ellers er raden `null` og telles som kollaps.
 *
 * EKSAKT NÅR ROMMET ER LITE. Er størrelsen ≤ `eksaktGrense`, telles alle i stedet (over).
 *
 * ============ K2: POSTERIOREN LESER BARE DET SETET SER ====================
 *
 *   1. Loggen VASKES før filteret ser den (`vaskStilling`): de andres hender, talongen, vraket
 *      for en ikke-budvinner, en ikke-avslørt makker og frøet tas bort. Et skjult vrak er en
 *      handling uten innhold. Alt filteret regner på er den vaskede loggen.
 *   2. RNG-en er `visningsfrø` av den vaskede startstillingen.
 *   3. De ekte hendene brukes BARE til å score, i kalleren, og i `forenlig` (kontrollen: den
 *      sanne given skal alltid være forenlig, ellers gjenskaper replayet ikke policyene).
 *
 * `test/naabart-tro.test.ts` bytter alle skjulte kort (hender, talong, vrak, VRAK-handlingen),
 * makker og frø og krever bit-identisk EKSAKT fordeling, med en felle som MÅ bli tatt: `felleKlarsyn`
 * teller bare den ekte given (i SMC: starter partiklene i den).
 *
 * ============ HVA TALLET ER, OG HVA DET IKKE ER ===========================
 *
 *   SESSIONSTILSTAND. Policyene har tilstand over kampen (`okt:`/`profil:`/BudQ-boka), men den
 *   bokfører bare ved RUNDE_SLUTT, og ellers bare offentlig poengstilling. Kalleren gir derfor
 *   SKYGGEAGENTER som ser hver ekte tilstand via `observer`; innen runden er de rene funksjoner
 *   av stillingen. Én ting krysser beslutninger: `Vrakrangerer` husker trumfen fra vraket til
 *   trumfvalget, så vrak og trumfvalg spilles alltid ut etter hverandre for samme hånd.
 *   ENDELIG N (bare SMC). Marginalene er andeler over N partikler med gulv 1/(2N). Log-tap straffer
 *   varians (Jensen), så med endelig N er tapet en ØVRE grense for det nåbare tapet.
 *   HUSKINGEN PER MASKE forutsetter at et setes beslutning bare avhenger av egen hånd og det
 *   offentlige (K2 for speken). Andre seters kort i replay-stillingen er fylt med en vilkårlig
 *   lovlig plassering, og et vrak som ikke er regnet ut ennå er en stedfortreder (`stat`). Holdt
 *   policyene ikke K2, ville faktorisert og naiv telling skilt lag — prøven sammenlikner dem.
 */

import { lovligeKort, type GameState, type Handling } from "../src/motor.ts";
import { lagRng, type Kort } from "../src/kort.ts";
import { intTilKort, kortTilInt } from "../src/solver/dds.ts";
import { visningsfrø } from "../src/moe2/sikkerorakel.ts";
import type { Spekagent } from "../src/moe2/agentspek.ts";
import { handlingNøkkel } from "./naabart-handling.ts";
import { rel } from "./k8-maal.ts";

/**
 * KANONISK STILLING — POLICYENE SOM EN FUNKSJON AV HÅNDMENGDEN (12. sep).
 *
 * MÅLT: i 5 av 24 kamper (19 av 384 K8-rader, 48 runder) var den SANNE given uforenlig. Årsaken var tre
 * kortvalg (f.eks. sete 1, stikk 4: ruter 3 med hånden i utdelingsorden, hjerter 3 med samme hånd
 * sortert) der speken bryter likhet etter HVOR i hånden kortene ligger. Utdelingsordenen er skjult,
 * så en slik policy er ikke deterministisk gitt det observatøren kan vite; likelihooden ville vært en
 * blanding over ordener (og korrelert mellom beslutninger). `frø` leses også av enkelte lag
 * (`budvakt`, `uleselig`) og er like skjult.
 *
 * Taket defineres derfor for de KANONISKE policyene: hender, talong og vrak sortert, frø 0 — nøyaktig
 * stillingen replayet bygger. Driverne ved bordet spiller den samme veien (`kanoniskAgent`), så de
 * skiller seg fra K8-radens drivere bare i likhetsbrudd, og den sanne given er da alltid forenlig
 * (`sann_ok`). `observer` får den ekte stillingen: bøkene fører bare offentlige ting.
 */
const etterKort = (a: Kort, b: Kort): number => kortTilInt(a) - kortTilInt(b);
export function kanonisk(s: GameState): GameState {
  return { ...s, frø: 0, hender: s.hender.map((h) => h.slice().sort(etterKort)), talong: s.talong.slice().sort(etterKort), vrak: s.vrak.slice().sort(etterKort) };
}
export function kanoniskAgent(a: Spekagent): Spekagent {
  return {
    velgHandling: (s: GameState) => a.velgHandling(kanonisk(s)),
    nyKamp: () => a.nyKamp(),
    ...(a.observer === undefined ? {} : { observer: (s: GameState) => a.observer!(s) }),
  };
}

/** Instansfrøet. Frøbånd i målingen kommer fra givene, ikke herfra. */
export const TRO_FRØ = 20_260_913;
/** `loc`-kodene utover setene 0..3. */
export const TALONG = 4;
export const KJENT = 5;

const KORT: readonly Kort[] = Array.from({ length: 52 }, (_, c) => intTilKort(c));
/** 2^c: kortmasker som vanlige tall (52 bit < 2^53, så summene er eksakte). */
const POT: readonly number[] = Array.from({ length: 52 }, (_, c) => 2 ** c);
const LNF: number[] = [0];
for (let i = 1; i <= 64; i++) LNF.push(LNF[i - 1]! + Math.log(i));
const harBit = (mask: number, c: number): boolean => Math.floor(mask / POT[c]!) % 2 === 1;

/** Én post i rundens logg: stillingen FØR handlingen, og handlingen. Første post er givens start. */
export interface Loggpost {
  readonly s: GameState;
  readonly h: Handling;
}

interface Vasket {
  readonly s: GameState;
  /** `null`: handlingen er skjult for observatøren (budvinnerens vrak). */
  readonly h: Handling | null;
  readonly aktør: number;
  /** Kort spilt før denne stillingen (historikk + bord). */
  readonly spilt: Uint8Array;
  /** Håndstørrelsene, som er offentlige. */
  readonly antall: readonly number[];
}

/**
 * Stillingen slik observatøren `o` kan kjenne den. Alt skjult tas bort; hendene fylles av
 * partikkelen ved replay. `sisteRunde`, poengene, budrunden, historikken og bordet er offentlige.
 */
export function vaskStilling(s: GameState, o: number): GameState {
  return {
    ...s,
    frø: 0,
    hender: s.hender.map((h, p) => (p === o ? h.slice() : [])),
    talong: [],
    vrak: s.budvinner === o ? s.vrak.slice() : [],
    makker: s.makkerAvslørt ? s.makker : null,
  };
}

function vask(s: GameState, h: Handling | null, o: number): Vasket {
  const spilt = new Uint8Array(52);
  for (const st of s.historikk) for (const kp of st.kort) spilt[kortTilInt(kp.kort)] = 1;
  for (const kp of s.bord) spilt[kortTilInt(kp.kort)] = 1;
  const aktør = h === null || h.type === "NESTE" ? -1 : h.spiller;
  const skjult = h !== null && h.type === "VRAK" && aktør !== o;
  return { s: vaskStilling(s, o), h: skjult ? null : h, aktør, spilt, antall: s.hender.map((x) => x.length) };
}

/** Faktorstatus per kortmaske: ≥ 0 = så mange av faktorens hendelser er gjenskapt; −(j+1) = feilet på nr. j. */
export class Trominne {
  readonly status = new Map<string, Map<number, number>>();
  /** Budvinnerens seksten (maske) → vraket policyen hennes gir (maske), −1 = ikke et vrak. */
  readonly vrak = new Map<number, number>();
  /** Budvinnerens seksten (maske) → antall talonger T (|T| = 4) der budene på seksten \ T gjenskapes. */
  readonly bVekt = new Map<number, number>();
  /** Policykall, for kostnaden. */
  kall = 0;
  unntak = 0;
  kart(navn: string): Map<number, number> {
    let m = this.status.get(navn);
    if (m === undefined) {
      m = new Map();
      this.status.set(navn, m);
    }
    return m;
  }
}

export interface NaabartTroOpts {
  /** N: partikler. 0 = bare eksakt telling (`eksaktTro`); SMC er eksperimentell (filhodet). */
  readonly partikler: number;
  /** POLICY-BLIND telling: forenlig = lovlig med hånden. Bare eksakt, bare budvinneren som observatør. */
  readonly regel?: boolean;
  /** Den eksakte tellingen: faktorisert (standard) eller naiv (alle plasseringer, T inkludert; for prøven). */
  readonly telling?: "faktorisert" | "naiv";
  /** Seteagentene hvis policyer definerer likelihooden (skyggeagentene, se filhodet). */
  readonly agenter: readonly Spekagent[];
  /** BYTT-forslag per partikkel per foryngelse. Standard 6. */
  readonly trekk?: number;
  /** Andel levende under hvilken det trekkes og forynges. Standard 0,5. */
  readonly terskel?: number;
  /** Tell eksakt når `størrelse()` er så liten. Standard 2000; 0 = aldri. */
  readonly eksaktGrense?: number;
  readonly frø?: number;
  /** Delt faktorhukommelse (rene resultater, så deling endrer ingen tall, bare kostnaden). */
  readonly minne?: Trominne;
  /** Andel BYTT-forslag der det andre kortet er i samme farge. Standard 0,5. */
  readonly likFarge?: number;
  /** Redningsforsøk (foryngelse med 4 × trekk under målet før handlingen) før omstart. Standard 4. */
  readonly redning?: number;
  /** FELLE for K2-prøven: partiklene starter i den EKTE given. Skal bli tatt. */
  readonly felleKlarsyn?: boolean;
}

export interface Trotall {
  foryngelser: number;
  forslag: number;
  godtatt: number;
  fersk: number;
  ferskGodtatt: number;
  redninger: number;
  omstart: number;
  kollaps: boolean;
}

export interface Troresultat {
  /** 52 × 4: relativt sete 1, 2, 3 og død binge (talong/vrak), samme form som trohodet. */
  readonly fordeling: number[][];
  readonly eksakt: boolean;
  /** Antall forenlige plasseringer ved eksakt telling, ellers N. */
  readonly n: number;
}

interface Faktor {
  readonly navn: string;
  readonly sete: number;
  readonly hendelser: number[];
}

interface Partikkel {
  loc: Int8Array;
  mask: Float64Array;
}

const kopi = (x: Partikkel): Partikkel => ({ loc: x.loc.slice(), mask: x.mask.slice() });

export class NaabartTro {
  private readonly o: number;
  private readonly N: number;
  private readonly trekkPer: number;
  private readonly terskel: number;
  private readonly grense: number;
  private readonly agenter: readonly Spekagent[];
  private readonly felle: boolean;
  private readonly frø: number;
  private minne: Trominne;
  readonly tall: Trotall = { foryngelser: 0, forslag: 0, godtatt: 0, fersk: 0, ferskGodtatt: 0, redninger: 0, omstart: 0, kollaps: false };
  /** Foryngelser med handlingen tatt ut før filteret starter på nytt. */
  private readonly redning: number;
  private readonly likFarge: number;
  private readonly regel: boolean;
  private readonly naiv: boolean;

  private v: Vasket[] = [];
  private nå: Vasket | null = null;
  private klar = false;
  private b = -1;
  private tilfB = false;
  private origO: number[] = [];
  private kjentT: number[] = [];
  private kap: number[] = [0, 0, 0, 0, 0, 0];
  private etterlyst = -1;
  private vrakIndeks = -1;
  private velgIndeks = -1;
  private faktorer: Faktor[] = [];
  private faktorFor = new Map<number, Faktor>();
  private faktorerFor: Faktor[][] = [];
  private ps: Partikkel[] = [];
  private levende = new Uint8Array(0);
  private neste = 0;
  private festet = new Int8Array(52).fill(-1);
  private rng: () => number = () => 0;
  private brukFersk = true;
  private rå0: GameState | null = null;

  constructor(o: number, opts: NaabartTroOpts) {
    if (!(opts.partikler >= 0)) throw new Error("NaabartTro: partikler ≥ 0");
    if (opts.regel === true && opts.partikler > 0) throw new Error("NaabartTro: regel-tellingen er bare eksakt (partikler 0)");
    this.regel = opts.regel === true;
    this.naiv = opts.telling === "naiv";
    this.o = o;
    this.N = opts.partikler;
    this.trekkPer = opts.trekk ?? 6;
    this.terskel = opts.terskel ?? 0.5;
    this.grense = opts.eksaktGrense ?? 2000;
    this.agenter = opts.agenter;
    this.felle = opts.felleKlarsyn === true;
    this.frø = opts.frø ?? TRO_FRØ;
    this.minne = opts.minne ?? new Trominne();
    this.redning = opts.redning ?? 4;
    this.likFarge = opts.likFarge ?? 0.5;
  }

  /**
   * Posterioren for observatøren i `s`. `logg` er rundens poster fra givens start til (men ikke med)
   * `s`; neste kall skal ha den samme loggen forlenget. `null` = filteret kollapset.
   */
  tro(logg: readonly Loggpost[], s: GameState): Troresultat | null {
    if (this.N === 0) throw new Error("NaabartTro: partikler 0 er bare eksakt — bruk eksaktTro");
    this.les(logg, s);
    const k = this.v.length;
    if (this.grense > 0) {
      // Den eksakte tellingen trenger bare festingene og faktorene NÅ, ikke partiklene: de står urørt.
      const r = this.vedTid(k, () => (this.størrelse() <= this.grense ? this.eksakt() : undefined));
      if (r !== undefined) return r;
    }
    this.kjørTil(k);
    if (this.tall.kollaps) return null;
    this.foryng();
    return { fordeling: this.fordelingAvPartikler(), eksakt: false, n: this.N };
  }

  /**
   * BARE DEN EKSAKTE TELLINGEN, uten partikler. `størrelse` er alltid regnet; `r` er `undefined` over
   * `eksaktGrense`, og `null` hvis ingen giv er forenlig (skal ikke skje når `forenlig(sann)` holder).
   */
  eksaktTro(logg: readonly Loggpost[], s: GameState): { størrelse: number; r: Troresultat | null | undefined } {
    this.les(logg, s);
    return this.vedTid(this.v.length, () => {
      const størrelse = this.størrelse();
      return { størrelse, r: størrelse <= this.grense ? this.eksakt() : undefined };
    });
  }

  private les(logg: readonly Loggpost[], s: GameState): void {
    if (s.fase !== "SPILL") throw new Error(`NaabartTro: stillingen må være i SPILL, er ${s.fase}`);
    if (logg.length < this.v.length) throw new Error("NaabartTro: loggen ble kortere — ny runde trenger nytt filter");
    for (let i = this.v.length; i < logg.length; i++) {
      const p = logg[i]!;
      this.v.push(vask(p.s, p.h, this.o));
      if (this.klar) this.leggTilHendelse(i);
    }
    this.nå = vask(s, null, this.o);
    if (!this.klar) this.oppsett(logg);
  }

  /** Kjør `fn` med festingene og faktortiden ved hendelse `k`, og sett partikkelfilterets tilbake. */
  private vedTid<T>(k: number, fn: () => T): T {
    const festet = this.festet;
    const neste = this.neste;
    this.festet = new Int8Array(52).fill(-1);
    for (let e = 0; e < k; e++) {
      const h = this.v[e]!.h;
      if (this.faktorFor.has(e) && h !== null && h.type === "SPILL") this.festet[kortTilInt(h.kort)] = this.v[e]!.aktør;
    }
    this.neste = k;
    try {
      return fn();
    } finally {
      this.festet = festet;
      this.neste = neste;
    }
  }

  /**
   * KONTROLLEN: er plasseringen `loc` (den sanne, fra kalleren) forenlig med alt fram til nå? Egen hukommelse.
   * Regnes ved tiden til den SISTE stillingen (`vedTid`): uten det sjekket en ren eksakt instans (partikler 0,
   * der filterets tid står på 0) ingenting, og kontrollen godtok en giv med spilte kort i feil sete.
   */
  forenlig(loc: Int8Array, minne: Trominne = new Trominne()): boolean {
    if (!this.klar) throw new Error("forenlig: kall tro() eller eksaktTro() først");
    const gammel = this.minne;
    this.minne = minne;
    try {
      return this.vedTid(this.v.length, () => this.gyldig(this.lagPartikkel(loc)));
    } finally {
      this.minne = gammel;
    }
  }

  // ---------------------------------------------------------------------------

  private oppsett(logg: readonly Loggpost[]): void {
    const v0 = this.v[0];
    if (v0 === undefined || v0.s.fase !== "BUDRUNDE" || v0.s.budrunde.sisteBud.some((x) => x !== null) || v0.s.budrunde.passet.some(Boolean)) {
      throw new Error("NaabartTro: loggen må starte i givens første budstilling");
    }
    this.rå0 = logg[0]!.s;
    const nå = this.nå!.s;
    this.b = nå.budvinner!;
    this.tilfB = this.b !== this.o;
    this.origO = v0.s.hender[this.o]!.map(kortTilInt);
    this.vrakIndeks = this.v.findIndex((w) => w.s.fase === "VRAK");
    this.velgIndeks = this.v.findIndex((w) => w.s.fase === "VELG");
    if (this.velgIndeks < 0 || this.vrakIndeks < 0) throw new Error("NaabartTro: loggen mangler vraket eller trumfvalget");
    if (!this.tilfB) {
      const eget = new Set(this.origO);
      if (this.vrakIndeks >= 0) this.kjentT = this.v[this.vrakIndeks]!.s.hender[this.o]!.map(kortTilInt).filter((c) => !eget.has(c));
    }
    for (let q = 0; q < 4; q++) this.kap[q] = q === this.o ? 0 : v0.antall[q]!;
    this.kap[TALONG] = this.tilfB ? v0.s.giving.talong : 0;
    this.etterlyst = nå.etterlyst === null || nå.melding?.type === "solo" ? -1 : kortTilInt(nå.etterlyst);

    this.faktorerFor = [[], [], [], [], [], []];
    const lag = (navn: string, sete: number): Faktor => {
      const f: Faktor = { navn, sete, hendelser: [] };
      this.faktorer.push(f);
      return f;
    };
    // Rekkefølgen er sjekkrekkefølgen: B og S (som setter vraket) før de andre setene.
    if (this.tilfB) {
      const B = lag("B", this.b);
      const S = lag("S", this.b);
      this.faktorerFor[this.b]!.push(B, S);
      this.faktorerFor[TALONG]!.push(S);
    }
    for (let q = 0; q < 4; q++) {
      if (q === this.o || (this.tilfB && q === this.b)) continue;
      this.faktorerFor[q]!.push(lag(`q${q}`, q));
    }
    this.klar = true;
    for (let i = 0; i < this.v.length; i++) this.leggTilHendelse(i);
    this.start();
  }

  private leggTilHendelse(e: number): void {
    const w = this.v[e]!;
    if (w.h === null || w.aktør < 0 || w.aktør === this.o) return;
    const t = w.h.type;
    let f: Faktor | undefined;
    if (this.tilfB && w.aktør === this.b) {
      if (t === "BUD") f = this.faktorer.find((x) => x.navn === "B");
      else if (t === "VELG" || t === "SPILL") f = this.faktorer.find((x) => x.navn === "S");
    } else if (t === "BUD" || t === "SPILL") {
      f = this.faktorer.find((x) => x.navn === `q${w.aktør}`);
    }
    if (f === undefined) return;
    f.hendelser.push(e);
    this.faktorFor.set(e, f);
  }

  private start(): void {
    this.neste = 0;
    this.festet.fill(-1);
    this.brukFersk = true;
    this.rng = lagRng(visningsfrø(this.v[0]!.s, this.o, (this.frø + Math.imul(this.N, 0x9e3779b1) + this.tall.omstart) >>> 0));
    this.ps = [];
    for (let i = 0; i < this.N; i++) {
      const x = this.felle ? this.klarsynPartikkel() : this.trekk();
      if (x === null) throw new Error("NaabartTro: fant ingen startgiv");
      this.ps.push(x);
    }
    this.levende = new Uint8Array(this.N).fill(1);
  }

  /** FELLA: leser den ekte given. Finnes bare for at K2-prøven skal kunne feile. */
  private klarsynPartikkel(): Partikkel {
    return this.lagPartikkel(sannPlassering(this.rå0!, this.o, this.b));
  }

  private lagPartikkel(loc: Int8Array): Partikkel {
    const mask = new Float64Array(6);
    for (let c = 0; c < 52; c++) if (loc[c]! >= 0) mask[loc[c]!]! += POT[c]!;
    return { loc: loc.slice(), mask };
  }

  private kjørTil(k: number): void {
    while (this.neste < k && !this.tall.kollaps) {
      const e = this.neste;
      this.neste = e + 1;
      const f = this.faktorFor.get(e);
      if (f === undefined) continue;
      const h = this.v[e]!.h!;
      if (h.type === "SPILL") this.festet[kortTilInt(h.kort)] = this.v[e]!.aktør;
      const til = this.til(f, this.neste);
      const før = this.levende.slice();
      let n = 0;
      for (let forsøk = 0; ; forsøk++) {
        n = 0;
        for (let i = 0; i < this.N; i++) {
          if (this.levende[i] === 0) continue;
          const x = this.ps[i]!;
          const ok = (h.type !== "SPILL" || this.festOk(x, kortTilInt(h.kort))) && this.sjekk(x, f, til);
          if (ok) n++;
          else this.levende[i] = 0;
        }
        if (n > 0 || forsøk >= this.redning) break;
        /**
         * REDNING FØR OMSTART. Ingen partikkel gjenskapte handlingen: den var usannsynlig under
         * populasjonen vi hadde. Handlingen tas ut igjen (festingen og faktortiden), populasjonen
         * forynges under målet FØR den, og handlingen prøves på nytt. Kjernen er invariant for det
         * målet, så dette er bare flere trekk, ikke et annet mål.
         */
        this.levende = før.slice();
        if (h.type === "SPILL") this.festet[kortTilInt(h.kort)] = -1;
        this.neste = e;
        this.tall.redninger++;
        this.foryng(this.trekkPer * 4);
        før.fill(1);
        this.neste = e + 1;
        if (h.type === "SPILL") this.festet[kortTilInt(h.kort)] = this.v[e]!.aktør;
      }
      if (n === 0) {
        if (this.tall.omstart >= 3) {
          this.tall.kollaps = true;
          return;
        }
        this.tall.omstart++;
        this.start();
        continue;
      }
      if (n < this.terskel * this.N) this.foryng();
    }
  }

  /** Antall av faktorens hendelser med indeks < n. */
  private til(f: Faktor, n: number): number {
    let lo = 0;
    let hi = f.hendelser.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (f.hendelser[m]! < n) lo = m + 1;
      else hi = m;
    }
    return lo;
  }

  private festOk(x: Partikkel, c: number): boolean {
    const q = this.festet[c]!;
    if (q < 0) return true;
    const l = x.loc[c]!;
    return this.tilfB && q === this.b ? l === this.b || l === TALONG : l === q;
  }

  private maskFor(x: Partikkel, f: Faktor): number {
    if (f.navn === "S") return x.mask[this.b]! + x.mask[TALONG]!;
    return x.mask[f.sete]!;
  }

  private sjekk(x: Partikkel, f: Faktor, til: number): boolean {
    if (til === 0) return true;
    const mask = this.maskFor(x, f);
    // Regel- og policytellingen har ulike svar på samme maske: egne kart, så et delt minne ikke blander dem.
    const kart = this.minne.kart(this.regel ? `regel:${f.navn}` : f.navn);
    const st = kart.get(mask) ?? 0;
    if (st < 0) return -(st + 1) >= til;
    if (st >= til) return true;
    for (let j = st; j < til; j++) {
      let ok: boolean;
      try {
        ok = this.spillUt(x, f, j);
      } catch {
        this.minne.unntak++;
        ok = false;
      }
      if (!ok) {
        kart.set(mask, -(j + 1));
        return false;
      }
    }
    kart.set(mask, til);
    return true;
  }

  /** Gjenskaper faktorens hendelse nr. `j` for partikkelen. */
  private spillUt(x: Partikkel, f: Faktor, j: number): boolean {
    const e = f.hendelser[j]!;
    const w = this.v[e]!;
    const h = w.h!;
    const ag = this.agenter[f.sete]!;
    if (this.regel) {
      // Hva som er lovlig å by eller velge avhenger ikke av hånden (`lovligeHandlinger`); etterlysningen er `etterlystOk`.
      if (h.type !== "SPILL") return true;
      const c = kortTilInt(h.kort);
      if (x.loc[c] !== f.sete) return false;
      return lovligeKort(this.stat(x, e, false), w.aktør).some((k) => kortTilInt(k) === c);
    }
    if (h.type === "VELG") {
      // VRAK og trumfvalg etter hverandre på samme hånd: `Vrakrangerer` husker trumfen imellom.
      const m16 = x.mask[this.b]! + x.mask[TALONG]!;
      this.minne.kall += 2;
      const hv = ag.velgHandling(this.stat(x, this.vrakIndeks));
      let V = -1;
      if (hv.type === "VRAK" && hv.kort.length === this.kap[TALONG]) {
        V = 0;
        for (const k of hv.kort) V += POT[kortTilInt(k)]!;
      }
      this.minne.vrak.set(m16, V);
      if (V < 0) return false;
      return handlingNøkkel(ag.velgHandling(this.stat(x, e))) === handlingNøkkel(h);
    }
    if (h.type === "SPILL") {
      const c = kortTilInt(h.kort);
      const l = x.loc[c]!;
      if (f.navn === "S") {
        if (l !== this.b && l !== TALONG) return false;
        if (harBit(this.vrakFor(x), c)) return false;
      } else if (l !== f.sete) return false;
    }
    this.minne.kall++;
    return handlingNøkkel(ag.velgHandling(this.stat(x, e, f.navn === "S"))) === handlingNøkkel(h);
  }

  /**
   * Vraket for et ANNET setes replay. Er budvinnerens vrak regnet ut for denne seksten, brukes det;
   * ellers en stedfortreder (de laveste av seksten hun ikke har spilt). Setet som spiller ser verken
   * vraket eller hånden hennes (K2), så valget endrer ingen beslutning — den faktoriserte tellingen
   * sjekker andre seter før budvinnerens seksten er kjent, og SMC-veien regner alltid S først.
   */
  private vrakEllerStedfortreder(x: Partikkel): number {
    const V = this.minne.vrak.get(x.mask[this.b]! + x.mask[TALONG]!);
    if (V !== undefined && V >= 0) return V;
    let S = 0;
    let n = 0;
    for (let c = 0; c < 52 && n < this.kap[TALONG]!; c++) {
      const l = x.loc[c]!;
      if ((l === this.b || l === TALONG) && this.festet[c]! < 0) {
        S += POT[c]!;
        n++;
      }
    }
    return S;
  }

  private vrakFor(x: Partikkel): number {
    const V = this.minne.vrak.get(x.mask[this.b]! + x.mask[TALONG]!);
    if (V === undefined || V < 0) throw new Error("NaabartTro: vraket er ikke regnet ut før det trengs (S-faktoren først)");
    return V;
  }

  /**
   * Stillingen ved hendelse `e` (−1: nå) med partikkelens hender. Kortene står i stigende orden.
   * `streng`: budvinnerens eget replay, der vraket MÅ være regnet ut; ellers kan det være en stedfortreder.
   */
  private stat(x: Partikkel, e: number, streng = true): GameState {
    const w = e < 0 ? this.nå! : this.v[e]!;
    const vs = w.s;
    const fase = vs.fase;
    const hender: Kort[][] = [[], [], [], []];
    const talong: Kort[] = [];
    const vrak: Kort[] = [];
    const etterVrak = fase !== "BUDRUNDE" && fase !== "VRAK";
    const V = this.tilfB && etterVrak ? (streng ? this.vrakFor(x) : this.vrakEllerStedfortreder(x)) : 0;
    for (let c = 0; c < 52; c++) {
      if (w.spilt[c] === 1) continue;
      const l = x.loc[c]!;
      if (l === this.o) continue;
      if (l === KJENT) {
        if (fase === "BUDRUNDE") talong.push(KORT[c]!);
        continue;
      }
      if (this.tilfB && (l === TALONG || l === this.b)) {
        if (fase === "BUDRUNDE") (l === TALONG ? talong : hender[this.b]!).push(KORT[c]!);
        else if (fase === "VRAK") hender[this.b]!.push(KORT[c]!);
        else (harBit(V, c) ? vrak : hender[this.b]!).push(KORT[c]!);
        continue;
      }
      hender[l]!.push(KORT[c]!);
    }
    hender[this.o] = vs.hender[this.o]!;
    let makker = vs.makker;
    if (fase === "SPILL" && this.etterlyst >= 0 && !vs.makkerAvslørt) {
      const l = x.loc[this.etterlyst]!;
      makker = l === KJENT || l === TALONG ? null : l;
    }
    return { ...vs, hender, talong, vrak: this.tilfB ? vrak : vs.vrak, makker };
  }

  /** Alle faktorer og festinger fram til `neste`. */
  private gyldig(x: Partikkel): boolean {
    for (let c = 0; c < 52; c++) if (!this.festOk(x, c)) return false;
    if (!this.etterlystOk(x)) return false;
    for (const f of this.faktorer) if (!this.sjekk(x, f, this.til(f, this.neste))) return false;
    return true;
  }

  /** Regelen, ikke en slutning: budvinneren kan ikke etterlyse et kort hun har eller har vraket. */
  private etterlystOk(x: Partikkel): boolean {
    if (!this.tilfB || this.etterlyst < 0 || this.velgIndeks >= this.neste) return true;
    const l = x.loc[this.etterlyst]!;
    return l !== this.b && l !== TALONG;
  }

  /** Flyttbare kort nå: skjulte og ikke festet til et bestemt sete (halvfestede er med). */
  private flyttbare(): { fri: number[]; halv: number[] } {
    const fri: number[] = [];
    const halv: number[] = [];
    const eget = new Set([...this.origO, ...this.kjentT]);
    for (let c = 0; c < 52; c++) {
      if (eget.has(c)) continue;
      const q = this.festet[c]!;
      if (q < 0) fri.push(c);
      else if (this.tilfB && q === this.b) halv.push(c);
    }
    return { fri, halv };
  }

  /** Ledige plasser per `loc` for de frie kortene, gitt hvor mange halvfestede som ligger i talongen. */
  private ledig(halv: number, iTalong: number): number[] {
    const lp = this.kap.slice();
    for (let c = 0; c < 52; c++) {
      const q = this.festet[c]!;
      if (q >= 0 && !(this.tilfB && q === this.b) && q !== this.o) lp[q]!--;
    }
    if (this.tilfB) {
      lp[this.b]! -= halv - iTalong;
      lp[TALONG]! -= iTalong;
    }
    return lp;
  }

  /** log-vektene for antall halvfestede i talongen (j), eller null utenfor tilfelle B. */
  private jVekter(halv: number, nFri: number): number[] {
    const lnC = (n: number, k: number): number => LNF[n]! - LNF[k]! - LNF[n - k]!;
    const ut: number[] = [];
    for (let j = 0; j <= Math.min(halv, this.kap[TALONG]!); j++) {
      const lp = this.ledig(halv, j);
      if (lp.some((x, i) => i < 5 && x < 0)) {
        ut.push(-Infinity);
        continue;
      }
      let w = lnC(halv, j) + LNF[nFri]!;
      for (let l = 0; l < 5; l++) if (l !== this.o) w -= LNF[lp[l]!]!;
      ut.push(w);
    }
    return ut;
  }

  /** FERSK: en giv trukket eksakt uniformt gitt det festede nå. */
  private trekk(): Partikkel | null {
    const { fri, halv } = this.flyttbare();
    for (let forsøk = 0; forsøk < 200; forsøk++) {
      const loc = new Int8Array(52).fill(-1);
      for (const c of this.origO) loc[c] = this.o;
      for (const c of this.kjentT) loc[c] = KJENT;
      for (let c = 0; c < 52; c++) {
        const q = this.festet[c]!;
        if (q >= 0 && !(this.tilfB && q === this.b) && q !== this.o) loc[c] = q;
      }
      let j = 0;
      if (this.tilfB) {
        const w = this.jVekter(halv.length, fri.length);
        const m = Math.max(...w);
        const e = w.map((x) => Math.exp(x - m));
        let r = this.rng() * e.reduce((a, x) => a + x, 0);
        j = 0;
        for (; j < e.length - 1; j++) {
          r -= e[j]!;
          if (r < 0) break;
        }
        const h = halv.slice();
        stokk(h, this.rng);
        h.forEach((c, i) => (loc[c] = i < j ? TALONG : this.b));
      }
      const lp = this.ledig(halv.length, j);
      const plasser: number[] = [];
      for (let l = 0; l < 5; l++) if (l !== this.o) for (let i = 0; i < lp[l]!; i++) plasser.push(l);
      if (plasser.length !== fri.length) throw new Error(`NaabartTro: ${plasser.length} plasser til ${fri.length} kort`);
      stokk(plasser, this.rng);
      fri.forEach((c, i) => (loc[c] = plasser[i]!));
      const x = this.lagPartikkel(loc);
      if (this.etterlystOk(x)) return x;
    }
    return null;
  }

  private foryng(trekkPer = this.trekkPer): void {
    this.tall.foryngelser++;
    const lev: number[] = [];
    for (let i = 0; i < this.N; i++) if (this.levende[i] === 1) lev.push(i);
    const u = this.rng();
    const nye: Partikkel[] = [];
    for (let i = 0; i < this.N; i++) nye.push(kopi(this.ps[lev[Math.floor(((i + u) * lev.length) / this.N)]!]!));
    this.ps = nye;
    this.levende.fill(1);

    const { fri, halv } = this.flyttbare();
    const M = [...fri, ...halv];
    // Kortene per farge i M: LIKFARGE-bytter holder fargelengdene og renonsene, som policyene leser mest.
    const MF: number[][] = [[], [], [], []];
    for (const c of M) MF[Math.floor(c / 13)]!.push(c);
    const erHalv = new Uint8Array(52);
    for (const c of halv) erHalv[c] = 1;
    let fersk = 0;
    let ferskOk = 0;
    for (let i = 0; i < this.N; i++) {
      if (this.brukFersk) {
        const y = this.trekk();
        fersk++;
        if (y !== null && this.gyldig(y)) {
          this.ps[i] = y;
          ferskOk++;
        }
      }
      const x = this.ps[i]!;
      for (let t = 0; t < trekkPer && M.length > 1; t++) {
        this.tall.forslag++;
        // Blandingen av to symmetriske forslag er symmetrisk: `a` uniformt, `d` uniformt i M eller i a sin farge.
        const lik = this.rng() < this.likFarge;
        const a = M[Math.floor(this.rng() * M.length)]!;
        const pool = lik ? MF[Math.floor(a / 13)]! : M;
        const d = pool[Math.floor(this.rng() * pool.length)]!;
        const la = x.loc[a]!;
        const ld = x.loc[d]!;
        if (la === ld) continue;
        const bt = (l: number): boolean => l === this.b || l === TALONG;
        if ((erHalv[a] === 1 && !(this.tilfB && bt(ld))) || (erHalv[d] === 1 && !(this.tilfB && bt(la)))) continue;
        if (this.tilfB && this.etterlyst >= 0 && this.velgIndeks < this.neste && ((a === this.etterlyst && bt(ld)) || (d === this.etterlyst && bt(la)))) continue;
        x.loc[a] = ld;
        x.loc[d] = la;
        x.mask[la]! += POT[d]! - POT[a]!;
        x.mask[ld]! += POT[a]! - POT[d]!;
        let ok = true;
        for (const f of this.faktorer) {
          if (!this.faktorerFor[la]!.includes(f) && !this.faktorerFor[ld]!.includes(f)) continue;
          if (!this.sjekk(x, f, this.til(f, this.neste))) {
            ok = false;
            break;
          }
        }
        if (ok) {
          this.tall.godtatt++;
          continue;
        }
        x.loc[a] = la;
        x.loc[d] = ld;
        x.mask[la]! -= POT[d]! - POT[a]!;
        x.mask[ld]! -= POT[a]! - POT[d]!;
      }
    }
    this.tall.fersk += fersk;
    this.tall.ferskGodtatt += ferskOk;
    // Senere hendelser strammer bare inn: en fersk giv som ikke godtas nå, godtas ikke senere.
    if (this.brukFersk && fersk > 0 && ferskOk < 0.02 * fersk) this.brukFersk = false;
  }

  /** Klassen (rel sete − 1, eller 3 = død binge) for et skjult, uspilt kort i partikkelen. −1 = ikke skjult. */
  private klasse(x: Partikkel, c: number): number {
    const l = x.loc[c]!;
    if (this.nå!.spilt[c] === 1 || l === this.o || l === KJENT || l < 0) return -1;
    if (this.tilfB && (l === TALONG || l === this.b)) {
      if (l === TALONG && harBit(this.vrakFor(x), c)) return 3;
      if (harBit(this.vrakFor(x), c)) return 3;
      return rel(this.o, this.b, 4) - 1;
    }
    return rel(this.o, l, 4) - 1;
  }

  private fordelingAvPartikler(): number[][] {
    const f = Array.from({ length: 52 }, () => [0, 0, 0, 0]);
    for (const x of this.ps) {
      for (let c = 0; c < 52; c++) {
        const k = this.klasse(x, c);
        if (k >= 0) f[c]![k]! += 1 / this.N;
      }
    }
    return f;
  }

  /** Øvre grense for antall plasseringer av de skjulte kortene nå (etterlyst-regelen ikke trukket fra). */
  antallPlasseringer(): number {
    const { fri, halv } = this.flyttbare();
    if (!this.tilfB) {
      const lp = this.ledig(0, 0);
      let w = LNF[fri.length]!;
      for (let l = 0; l < 4; l++) if (l !== this.o) w -= LNF[lp[l]!]!;
      return Math.exp(w);
    }
    return this.jVekter(halv.length, fri.length).reduce((a, x) => a + Math.exp(x), 0);
  }

  /** Størrelsen tellingen dømmes på (enheten til `eksaktGrense`). */
  størrelse(): number {
    return this.naiv ? this.antallPlasseringer() : this.størrelseFaktorisert();
  }

  private eksakt(): Troresultat | null {
    return this.naiv ? this.eksaktNaiv() : this.eksaktFaktorisert();
  }

  /** Setene uten budvinneren i tur (i den faktoriserte tellingen), og kapasiteten til budvinnerens seksten. */
  private grupper(): { seter: number[]; kap: number[]; gKap: number; fri: number[]; halv: number[] } {
    const { fri, halv } = this.flyttbare();
    const lp = this.ledig(0, 0);
    const seter = [0, 1, 2, 3].filter((q) => q !== this.o && !(this.tilfB && q === this.b));
    const kap = seter.map((q) => lp[q]!);
    const gKap = this.tilfB ? lp[this.b]! + lp[TALONG]! - halv.length : 0;
    if (kap.some((x) => x < 0) || gKap < 0 || kap.reduce((a, x) => a + x, 0) + gKap !== fri.length) {
      throw new Error(`NaabartTro: kapasitetene ${kap.join("/")} + ${gKap} passer ikke ${fri.length} frie kort`);
    }
    return { seter, kap, gKap, fri, halv };
  }

  /** Multinomialen av de frie kortene på gruppene: øvre grense for bladene før skjæring. */
  private størrelseFaktorisert(): number {
    const { kap, gKap, fri } = this.grupper();
    let w = LNF[fri.length]! - LNF[gKap]!;
    for (const k of kap) w -= LNF[k]!;
    return Math.round(Math.exp(w));
  }

  /** EKSAKT, FAKTORISERT (filhodet): sete for sete med skjæring, T summert per seksten. */
  private eksaktFaktorisert(): Troresultat | null {
    if (this.regel && this.tilfB) throw new Error("NaabartTro: regel-tellingen gjelder bare budvinneren som observatør");
    const { seter, kap, fri, halv } = this.grupper();
    const x: Partikkel = { loc: new Int8Array(52).fill(-1), mask: new Float64Array(6) };
    for (const c of this.origO) x.loc[c] = this.o;
    for (const c of this.kjentT) x.loc[c] = KJENT;
    for (let c = 0; c < 52; c++) {
      const q = this.festet[c]!;
      if (q >= 0 && !(this.tilfB && q === this.b) && q !== this.o) x.loc[c] = q;
    }
    for (const c of halv) x.loc[c] = this.b;
    const fq = seter.map((q) => this.faktorerFor[q]![0]!);
    const tilQ = fq.map((f) => this.til(f, this.neste));
    const S = this.tilfB ? this.faktorer.find((f) => f.navn === "S")! : null;
    const B = this.tilfB ? this.faktorer.find((f) => f.navn === "B")! : null;
    const tilS = S === null ? 0 : this.til(S, this.neste);
    const relQ = seter.map((q) => rel(this.o, q, 4) - 1);
    const relB = rel(this.o, this.b, 4) - 1;
    // FELLA: bare den ekte given telles. Finnes bare for at K2-prøven skal kunne feile.
    const sann = this.felle ? sannPlassering(this.rå0!, this.o, this.b) : null;

    const masker = (): void => {
      x.mask.fill(0);
      for (let c = 0; c < 52; c++) if (x.loc[c]! >= 0) x.mask[x.loc[c]!]! += POT[c]!;
    };
    /** De frie kortene fra gruppe i og ut fylles i orden; budvinnerens laveste frie blir talongen. */
    const fyll = (i: number, rest: readonly number[]): void => {
      let j = 0;
      for (let g = i; g < seter.length; g++) for (let t = 0; t < kap[g]!; t++) x.loc[rest[j++]!] = seter[g]!;
      for (let t = 0; j < rest.length; j++, t++) x.loc[rest[j]!] = t < this.kap[TALONG]! ? TALONG : this.b;
      masker();
    };

    const tell = Array.from({ length: 52 }, () => [0, 0, 0, 0]);
    let n = 0;
    const valgt: number[][] = seter.map(() => []);
    const blad = (G: readonly number[]): void => {
      let w = 1;
      let V = 0;
      if (S !== null && B !== null) {
        if (this.etterlyst >= 0 && this.velgIndeks < this.neste) {
          const l = x.loc[this.etterlyst]!;
          if (l === this.b || l === TALONG) return;
        }
        if (!this.sjekk(x, S, tilS)) return;
        V = this.vrakFor(x);
        w = this.bVekt(x, B);
        if (w === 0) return;
      }
      n += w;
      for (let i = 0; i < seter.length; i++) for (const c of valgt[i]!) tell[c]![relQ[i]!]! += w;
      for (const c of G) tell[c]![harBit(V, c) ? 3 : relB]! += w;
    };
    const steg = (i: number, pool: readonly number[]): void => {
      if (i === seter.length) return blad(pool);
      kombinasjoner(pool, kap[i]!, (A, rest) => {
        if (sann !== null && A.some((c) => sann[c] !== seter[i])) return;
        for (const c of A) x.loc[c] = seter[i]!;
        fyll(i + 1, rest);
        if (!this.sjekk(x, fq[i]!, tilQ[i]!)) return;
        valgt[i] = A;
        steg(i + 1, rest);
      });
    };
    steg(0, fri);
    if (n === 0) return null;
    return { fordeling: tell.map((r) => r.map((v) => v / n)), eksakt: true, n };
  }

  /** w(seksten): antall talonger T der budvinnerens bud på seksten \ T gjenskapes. Husket per seksten. */
  private bVekt(x: Partikkel, B: Faktor): number {
    const m16 = x.mask[this.b]! + x.mask[TALONG]!;
    const husket = this.minne.bVekt.get(m16);
    if (husket !== undefined) return husket;
    const seksten: number[] = [];
    for (let c = 0; c < 52; c++) if (x.loc[c] === this.b || x.loc[c] === TALONG) seksten.push(c);
    const før = seksten.map((c) => x.loc[c]!);
    const tilB = this.til(B, this.neste);
    let w = 0;
    kombinasjoner(seksten, this.kap[TALONG]!, (T) => {
      for (const c of seksten) x.loc[c] = this.b;
      for (const c of T) x.loc[c] = TALONG;
      x.mask[this.b] = 0;
      x.mask[TALONG] = 0;
      for (const c of seksten) x.mask[x.loc[c]!]! += POT[c]!;
      if (this.sjekk(x, B, tilB)) w++;
    });
    seksten.forEach((c, i) => (x.loc[c] = før[i]!));
    x.mask[this.b] = 0;
    x.mask[TALONG] = 0;
    for (const c of seksten) x.mask[x.loc[c]!]! += POT[c]!;
    this.minne.bVekt.set(m16, w);
    return w;
  }

  /** EKSAKT, NAIV: tell alle plasseringer (T inkludert), uniform posterior over de forenlige. For prøven. */
  private eksaktNaiv(): Troresultat | null {
    const { fri, halv } = this.flyttbare();
    const base = new Int8Array(52).fill(-1);
    for (const c of this.origO) base[c] = this.o;
    for (const c of this.kjentT) base[c] = KJENT;
    for (let c = 0; c < 52; c++) {
      const q = this.festet[c]!;
      if (q >= 0 && !(this.tilfB && q === this.b) && q !== this.o) base[c] = q;
    }
    const tell = Array.from({ length: 52 }, () => [0, 0, 0, 0]);
    let n = 0;
    const lp = this.ledig(0, 0);
    // Halvfestede tar plass hos budvinneren eller i talongen; `ledig(0,0)` har ikke trukket dem fra.
    const blad = (): void => {
      const x = this.lagPartikkel(base);
      if (!this.etterlystOk(x) || !this.gyldig(x)) return;
      n++;
      for (let c = 0; c < 52; c++) {
        const k = this.klasse(x, c);
        if (k >= 0) tell[c]![k]!++;
      }
    };
    const friSteg = (i: number): void => {
      if (i === fri.length) return blad();
      const c = fri[i]!;
      for (let l = 0; l < 5; l++) {
        if (l === this.o || lp[l]! <= 0) continue;
        lp[l]!--;
        base[c] = l;
        friSteg(i + 1);
        base[c] = -1;
        lp[l]!++;
      }
    };
    const halvSteg = (i: number): void => {
      if (i === halv.length) return friSteg(0);
      const c = halv[i]!;
      for (const l of [this.b, TALONG]) {
        if (lp[l]! <= 0) continue;
        lp[l]!--;
        base[c] = l;
        halvSteg(i + 1);
        base[c] = -1;
        lp[l]!++;
      }
    };
    halvSteg(0);
    if (n === 0) return null;
    return { fordeling: tell.map((r) => r.map((x) => x / n)), eksakt: true, n };
  }
}

/** Alle k-delmengder av `pool` i leksikografisk orden, med resten (begge i poolens orden). */
function kombinasjoner(pool: readonly number[], k: number, fn: (valgt: number[], rest: number[]) => void): void {
  const n = pool.length;
  if (k < 0 || k > n) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  const med = new Uint8Array(n);
  for (;;) {
    med.fill(0);
    const valgt: number[] = [];
    for (const i of idx) {
      med[i] = 1;
      valgt.push(pool[i]!);
    }
    const rest: number[] = [];
    for (let i = 0; i < n; i++) if (med[i] === 0) rest.push(pool[i]!);
    fn(valgt, rest);
    let j = k - 1;
    while (j >= 0 && idx[j] === n - k + j) j--;
    if (j < 0) return;
    idx[j]!++;
    for (let t = j + 1; t < k; t++) idx[t] = idx[t - 1]! + 1;
  }
}

function stokk(a: number[], rng: () => number): void {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
}

/**
 * DEN SANNE PLASSERINGEN fra rundens første post (de ekte hendene og talongen). BARE for scoring,
 * kontrollen `forenlig` og fella — aldri for posterioren.
 */
export function sannPlassering(s0: GameState, o: number, budvinner: number | null): Int8Array {
  const loc = new Int8Array(52).fill(-1);
  s0.hender.forEach((h, p) => h.forEach((k) => (loc[kortTilInt(k)] = p)));
  // Talongen er kjent for budvinneren; ellers skjult. `s0` er budrunden, så budvinneren gis av kalleren.
  for (const k of s0.talong) loc[kortTilInt(k)] = budvinner === o ? KJENT : TALONG;
  return loc;
}

/**
 * K8-TAPET for en fordeling fra taket: samme renormalisering over de tre setene som `mlb-k8.ts`, med
 * Monte-Carlo-armenes gulv (`gulv` = 1/(2N); ved eksakt telling 1e-12, som nettet).
 */
export function takTap(
  f: readonly (readonly number[])[],
  s: GameState,
  sete: number,
  kort: number,
  gulv: number,
): { tap: number; treff: number; gulvbandt: number } {
  let tap = 0;
  let treff = 0;
  let bandt = 0;
  for (let p = 0; p < s.antallSpillere; p++) {
    if (p === sete) continue;
    const r = rel(sete, p, s.antallSpillere);
    for (const k of s.hender[p] ?? []) {
      const rader = f[kortTilInt(k)]!;
      const sum = (rader[0] ?? 0) + (rader[1] ?? 0) + (rader[2] ?? 0);
      const rå = sum > 1e-12 ? (rader[r - 1] ?? 0) / sum : 0;
      if (rå < gulv) bandt++;
      tap += -Math.log(Math.max(gulv, rå));
      let best = 0;
      for (let i = 1; i < 3; i++) if ((rader[i] ?? 0) > (rader[best] ?? 0)) best = i;
      if (best === r - 1) treff++;
    }
  }
  return { tap: Number((tap / kort).toFixed(5)), treff: Number((treff / kort).toFixed(5)), gulvbandt: Number((bandt / kort).toFixed(5)) };
}
