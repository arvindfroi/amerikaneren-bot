/**
 * D7-2 – LIGA MED DELT POPULASJON, DD-FORANKRET BUDFASIT OG GIV-VEKTING.
 *
 *   node examples/d7-liga2.ts --popp 96 --gen 100000 --dir trening-d7-2
 *   node examples/d7-liga2.ts --kalibrer 200 --dir maal-d7-2   (bare maaling)
 *
 * d7-liga.ts er FUNDAMENTET (liga + Elo som fitness) og roeres ikke – fire
 * shards kjoerer paa den. Denne fila er de tre neste stegene som stod
 * oppfoert som «ikke med enda» i d7-liga.ts:
 *
 *  1. TO UAVHENGIGE POPULASJONER: budgivere og spillere, hver med sin egen
 *     Evolusjon, sin egen Elo og sin egen arv. Ved kamptid settes et sete
 *     sammen av ett budgivergenom (BUDRUNDE/VRAK/VELG) og ett spillergenom
 *     (SPILL).
 *  2. DD-FORANKRET BUDFASIT i stedet for rollout mot egen spillestyrke.
 *  3. VEKTING AV GIV ETTER std(SD), saa giv som avgjoeres av flaks teller
 *     mindre.
 *
 * Alt annet er identisk med d7-liga.ts, med ÉTT bevisst unntak: `maksRunder`
 * er 1 i stedet for 12. Det er en foelge av punkt 3 – vekten gjelder ÉN giv,
 * og en kamp over 12 runder blander 12 giv med hver sin std sammen til ett
 * poengtall som ikke kan vektes per giv. Med én giv per kamp er vekten
 * entydig. Kostnaden er lavere enn d7-liga: 6 bordrunder x popp/2 bord x 4
 * rotasjoner x 1 runde = 12*popp rundespill, mot d7-ligas 3 x popp/4 x 4 x 12
 * = 36*popp.
 *
 * ADVART OM spillFasit: d7-liga.ts sender `{ sjanse, rate, dybde }` uten
 * `verdener` og `nodeTak`. Fordi tsconfig har "include": ["src"] blir
 * examples/ aldri typesjekket, saa feilen staar. Effekten er at
 * `solverBesteKort` avslutter med `verdener === 0` med det samme og
 * returnerer null – spillfasiten i d7-liga er altsaa en NO-OP. Her er den
 * derfor AV som standard (--spillfasit 0): aa skru paa en fasit som aldri
 * har kjoert ville blandet en fjerde endring inn i A/B-en.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { FARGER, lagRng } from "../src/kort.ts";
import { opprettSpill, utfør, type GameState, type Handling } from "../src/motor.ts";
import { MINSTE_TALLBUD } from "../src/regler.ts";
import { NevroAgent } from "../src/nevro/agent.ts";
import { evaluerHybrid, kortTilInt, type DDOppsett } from "../src/solver/dds.ts";
import { Evolusjon, genomFraJson, genomTilJson, NeatAgent, type Genom } from "../src/neat/index.ts";
import type { BudEstimat } from "../src/neat/agent.ts";
import { spillGruppekamp, type KampOpts, type TurneringsAgent } from "../src/neat/turnering.ts";
import { dommenOverBarnet, STANDARD_RATER } from "../src/neat/genom.ts";
import { andelerFraPoeng, nyRating, oppdaterBord, type Rating } from "../src/neat/elo.ts";
import type { Kort } from "../src/kort.ts";

// ---------------------------------------------------------------------------
// Flagg
// ---------------------------------------------------------------------------

let popp = 96;
let generasjoner = 100000;
let dir = "trening-d7-2";
let fraBud: string | null = null;
let fraSpill: string | null = null;
let paringer = 6;
let evoFrø = 0xd72;
/**
 * Eksakt-horisont for DD-ankeret. MAALT paa denne maskinen (100 rollouts for
 * 4–8, faerre for de dyre; terskel 7 er dessuten maalt paa 1200 rollouts med
 * --kalibrer 300 og landet paa 9,13 ms):
 *
 *   terskel 4:  0,09 ms/loesning   terskel 8:  50,2 ms/loesning
 *   terskel 5:  0,25 ms            terskel 9: ~213 ms
 *   terskel 6:  0,91 ms            terskel 10: ~400 ms (nodetak slaar inn)
 *   terskel 7:  9,13 ms            terskel 11: ~2800 ms
 *
 * EKSAKT DD FRA STIKK 1 (terskel 12) ER IKKE MULIG her: maalt >30 s per
 * loesning og heap-kollaps ved 4 GB etter ~10 loesninger. Loeseren i
 * src/solver/dds.ts er ren JS med Map-basert transposisjonstabell, og 48
 * ply er for mye for den. Derfor er ankeret hybrid: graadig spill (med full
 * informasjon, samme ordning som soeket bruker) ned til `ddTerskel` stikk
 * igjen, saa eksakt loesning. 7 er valgt fordi ankeret der er praktisk talt
 * det samme som ved 8 (informasjonsdifferanse 0,21 mot 0,26) til 1/7 av
 * kostnaden.
 */
let ddTerskel = 7;
/**
 * INFORMASJONSDIFFERANSEN som trekkes fra DD-tallet. Se lang begrunnelse
 * ved `ddBudMål`. Standardverdien er MAALT, ikke antatt:
 *
 *   node examples/d7-liga2.ts --kalibrer 300 --ddterskel 7
 *   -> DD − NevroHjernes oppnaadde lagstikk = 0,304 ± 0,039 stikk
 *      (n = 1200 rollouts, std 1,35)
 *
 * Merk hvor LITEN den er sammenlignet med bridgetommelfingeren 0,5–1 stikk.
 * Grunnen er at DD gir perfekt spill til BEGGE sider: budlaget vinner paa aa
 * se motstandernes kort, men taper paa at forsvaret ogsaa gjoer det, og mot
 * NevroHjernes ufullkomne forsvar spiser de to effektene hverandre nesten
 * opp. Spredningen per giv (std 1,35) er derimot stor – DD-tallet baerer et
 * ekte per-giv-signal, det er bare NIVAAET som ligger naer nevros.
 */
let infoGap = 0.304;
/** Antall SD-rollouts per giv for std-maalingen. */
let sdK = 5;
/**
 * Skalaen i vekten. MAALT fordeling av std(SD) over 300 giv:
 * min 0,00 / p10 0,50 / median 1,30 / p90 2,06 / maks 3,04.
 */
let alfa = 1.0;
let budFasitSjanse = 0.5;
let budFasitRate = 0.05;
let spillFasitSjanse = 0;
let kalibrer = 0;
let brukVekt = true;
let brukDD = true;

for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--popp") popp = Number(process.argv[++i]);
  else if (a === "--gen") generasjoner = Number(process.argv[++i]);
  else if (a === "--dir") dir = process.argv[++i]!;
  else if (a === "--fra") {
    const f = process.argv[++i]!;
    fraBud = f;
    fraSpill = f;
  } else if (a === "--fra-bud") fraBud = process.argv[++i]!;
  else if (a === "--fra-spill") fraSpill = process.argv[++i]!;
  else if (a === "--par") paringer = Number(process.argv[++i]);
  else if (a === "--fro") evoFrø = Number(process.argv[++i]);
  else if (a === "--ddterskel") ddTerskel = Number(process.argv[++i]);
  else if (a === "--infogap") infoGap = Number(process.argv[++i]);
  else if (a === "--sdk") sdK = Number(process.argv[++i]);
  else if (a === "--alfa") alfa = Number(process.argv[++i]);
  else if (a === "--budfasit") budFasitSjanse = Number(process.argv[++i]);
  else if (a === "--budrate") budFasitRate = Number(process.argv[++i]);
  else if (a === "--spillfasit") spillFasitSjanse = Number(process.argv[++i]);
  else if (a === "--kalibrer") kalibrer = Number(process.argv[++i]);
  else if (a === "--uten-vekt") brukVekt = false;
  else if (a === "--uten-dd") brukDD = false;
}
mkdirSync(dir, { recursive: true });

const logg: string[] = [];
const si = (s: string): void => {
  console.log(s);
  logg.push(s);
  // MAALINGER SKAL ALDRI BARE STAA I STDOUT. Loggen skrives fra prosessen
  // selv ved hver femte linje, saa en flertimers kjoering overlever at
  // roeret dettes.
  if (logg.length % 5 === 0) writeFileSync(`${dir}/liga2.log`, logg.join("\n") + "\n");
};

// ---------------------------------------------------------------------------
// GIV-ANALYSE: DD-anker, informasjonsdifferanse og std(SD)
// ---------------------------------------------------------------------------

const nevro = new NevroAgent();

interface GivAnalyse {
  /** DD-stikk for budlaget per tvunget budvinner-sete. */
  readonly dd: number[];
  /** NevroHjernes faktisk oppnaadde lagstikk per sete (single dummy). */
  readonly sd: number[];
  /** Makkerens stikk i samme rollout (fasit for makker-hodet). */
  readonly makkerSD: number[];
  /** Standardavvik over sd[] – spredningen som ikke skyldes ferdighet. */
  readonly stdSD: number;
  /** Snitt DD − SD for denne giva (bidraget til informasjonsdifferansen). */
  readonly gap: number;
}

const givCache = new Map<string, GivAnalyse>();

/**
 * Nullstiller en budstilling til «ingen har budt», med poengstillingen satt
 * til null. Det siste er ikke kosmetikk: analysen maa vaere en REN FUNKSJON
 * av (froe, rundeNr) for at cachen skal kunne deles av alle bordene i en
 * bordrunde, og totalPoeng er det eneste feltet som ellers ville variert
 * mellom bord som spiller samme giv.
 */
function friskBudrunde(s: GameState, sete: number): GameState {
  const N = s.antallSpillere;
  return {
    ...s,
    fase: "BUDRUNDE",
    iTur: sete,
    totalPoeng: new Array<number>(N).fill(0),
    vinner: null,
    budrunde: {
      passet: new Array<boolean>(N).fill(false),
      høyeste: null,
      sisteBud: new Array<null>(N).fill(null),
      // Frisk budrunde: ingen melding har falt ennå, så rekka er tom — som aggregatene.
      rekke: [],
    },
    budvinner: null,
    melding: null,
    vrak: [],
    trumf: null,
    etterlyst: null,
    makker: null,
    makkerAvslørt: false,
    utspiller: null,
    bord: [],
    stikkVunnet: new Array<number>(N).fill(0),
    stikkSpilt: 0,
    forrigeStikk: null,
    historikk: [],
    sisteRunde: null,
  };
}

/** DD-oppsett for stillingen ved foerste kortvalg, med ALLE fire hender. */
function ddOppsettVedStart(s: GameState): DDOppsett {
  const declLag = new Array<boolean>(s.antallSpillere).fill(false);
  declLag[s.budvinner!] = true;
  if (s.makker !== null) declLag[s.makker] = true;
  return {
    N: s.antallSpillere,
    trump: FARGER.indexOf(s.trumf!),
    declLag,
    hender: s.hender.map((h) => h.map(kortTilInt)),
    iTur: s.iTur!,
    bord: [],
    declStikkFør: 0,
    ferdigeStikk: 0,
    totalStikk: s.giving.antallStikk,
  };
}

/**
 * Analyserer én giv: for hvert sete tvinges setet til aa vinne budrunden med
 * minste lovlige tallbud, NevroHjerne vraker og velger trumf, og deretter
 * maales to ting i samme stilling:
 *
 *  - DD: hva budlaget tar med perfekt informasjon paa begge sider.
 *  - SD: hva NevroHjerne faktisk henter hjem naar den spiller alle fire seter.
 *
 * DE K ROLLOUTENE. NevroHjerne er HELT deterministisk (ren argmax, ingen
 * rng), saa K rollouts fra samme stilling gir K identiske tall og std 0. Den
 * eneste variasjonen som finnes i en fast giv, og som samtidig er ukjent i
 * budoeyeblikket, er HVEM som ender med kontrakten – og dermed hvilken trumf
 * og hvilken skjult makker giva faar. Derfor er rollout k = sete k, og K
 * klippes til antall seter (4). Verdier over 4 gir bare duplikater; det
 * logges i stedet for aa kjoeres.
 */
function analyserGiv(budState: GameState): GivAnalyse {
  const nøkkel = `${budState.frø}:${budState.rundeNr}`;
  const truffet = givCache.get(nøkkel);
  if (truffet !== undefined) return truffet;

  const N = budState.antallSpillere;
  const K = Math.min(sdK, N);
  const dd: number[] = [];
  const sd: number[] = [];
  const makkerSD: number[] = [];
  for (let sete = 0; sete < K; sete++) {
    let s = friskBudrunde(budState, sete);
    s = utfør(s, { type: "BUD", spiller: sete, bud: MINSTE_TALLBUD }).state;
    let vakt = 0;
    while (s.fase === "BUDRUNDE" && vakt++ < 8) {
      s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
    }
    vakt = 0;
    while ((s.fase === "VRAK" || s.fase === "VELG") && vakt++ < 10) {
      s = utfør(s, nevro.velgHandling(s)).state;
    }
    if (s.fase !== "SPILL") continue;
    dd.push(evaluerHybrid(ddOppsettVedStart(s), ddTerskel, 0));
    vakt = 0;
    while (s.fase === "SPILL" && vakt++ < 250) s = utfør(s, nevro.velgHandling(s)).state;
    const res = s.sisteRunde;
    if (res === null) {
      dd.pop();
      continue;
    }
    sd.push(res.lagStikk);
    makkerSD.push(
      res.makker !== null && res.makker !== res.budvinner ? (res.stikkVunnet[res.makker] ?? 0) : 0,
    );
  }
  const n = sd.length || 1;
  const snitt = sd.reduce((a, b) => a + b, 0) / n;
  const stdSD = Math.sqrt(sd.reduce((a, b) => a + (b - snitt) * (b - snitt), 0) / n);
  const gap = (dd.reduce((a, b) => a + b, 0) - sd.reduce((a, b) => a + b, 0)) / n;
  const analyse: GivAnalyse = { dd, sd, makkerSD, stdSD, gap };
  givCache.set(nøkkel, analyse);
  return analyse;
}

/**
 * DD-FORANKRET BUDFASIT.
 *
 * `budRollout` i turnering.ts setter budmaalet til det agentens EGET nett
 * spiller hjem – kommentaren der sier det rett ut: «budene vokser i takt med
 * spilleevnen». Det baker botens svakhet inn i budet, og sloeyfa er
 * selvbekreftende: svakt korthode -> lavt budmaal -> ingen grunn til aa
 * forbedre korthodet. Her er maalet i stedet forankret i KORTENE.
 *
 * MEN DD KAN IKKE BRUKES RAATT. DD ser alle fire hender; aa by DD ville vaert
 * systematisk overbud, akkurat som i bridge, der single dummy typisk ligger
 * 0,5–1 stikk under DD for spillefoereren. Det som skal trekkes fra er
 * INFORMASJONSDIFFERANSEN – prisen for aa ikke se de andre haendene – og
 * IKKE FERDIGHETSDIFFERANSEN, altsaa ikke det botens eget svake spill mister.
 * Trekker man fra ferdighetsdifferansen er man tilbake til budRollout.
 *
 * Differansen maales derfor mot en STERK referanse (NevroHjerne, ~50 poeng
 * over NEAT-linjene og appens sterkeste raske spiller): infoGap = snitt(DD −
 * NevroHjernes oppnaadde lagstikk) over mange giv. MAALT: se --kalibrer og
 * `infoGap`-standardverdien.
 *
 * Merk at fradraget er en KONSTANT, ikke per giv. Per giv ville
 * DD − (DD − SD) = SD vaert sirkulaert, altsaa bare «hva nevro tok». Som
 * konstant beholder maalet DDs per-giv-signal (som er et renere maal paa hva
 * kortene er verdt enn én enkelt rollout) og kalibreres bare slik at
 * NIVAAET tilsvarer det en sterk spiller faktisk henter hjem.
 *
 * Makkerfasiten kan ikke komme fra DD – loeseren gir bare lagets sum, ikke
 * fordelingen – og hentes derfor fra nevro-rolloutet.
 */
function ddBudMål(
  budState: GameState,
  sete: number,
): { lagStikk: number; makkerStikk: number } | null {
  const a = analyserGiv(budState);
  const dd = a.dd[sete];
  if (dd === undefined) return null;
  const T = budState.giving.antallStikk;
  return {
    lagStikk: Math.max(0, Math.min(T, dd - infoGap)),
    makkerStikk: a.makkerSD[sete] ?? 0,
  };
}

/**
 * MEDIAN-std(SD) over 300 maalte giv. Brukes til aa NORMALISERE vekten, se
 * `givVekt`.
 */
const STD_REFERANSE = 1.3;

/**
 * VEKT FOR ÉN GIV: (1 + ref/alfa) / (1 + std/alfa).
 *
 * Ideen: er spredningen i lagstikk stor naar en sterk spiller sitter paa alle
 * fire seter, avgjoeres giva av hvordan kortene tilfeldigvis ligger og ikke av
 * hvem som spiller den. En falt kontrakt der sier mindre om agenten, og skal
 * telle mindre.
 *
 * NORMALISERINGEN er ikke pynt. Den raa formen 1/(1 + std/alfa) ga MAALT en
 * snittvekt paa 0,464 over 300 giv – altsaa ville halve laeringsraten i
 * ligaen forsvunnet uniformt, noe som ikke er en vekting i det hele tatt,
 * bare en tregere linje. Med telleren (1 + ref/alfa) er vekten 1,0 for en
 * median-giv, over 1 for rolige giv og under 1 for urolige. Da OMFORDELER
 * vekten trykket i stedet for aa skru det ned. Maalt spenn ved alfa 1,0:
 * p10 (std 0,50) -> 1,53; median (1,30) -> 1,00; p90 (2,06) -> 0,75;
 * maks (3,04) -> 0,57. Klippet til [0,3, 2,0] saa én ekstremgiv ikke kan
 * rive Elo-oppdateringen ut av proporsjon.
 *
 * HVORFOR std(SD) OG IKKE DD−SD-SNITTET: snittgapet blander sammen «umulig aa
 * vite» og «vanskelig, men mulig aa finne». Det siste er nettopp det linja
 * SKAL trenes paa; bare det foerste skal dempes. Spredningen fanger det
 * foerste alene.
 *
 * RISIKO – SKAL LESES FOER TALLENE TOLKES: aa dempe giv med hoey varians er
 * det samme som aa flytte seleksjonstrykket mot de LETTE givene. Tas det for
 * langt (liten alfa) trenes linja paa giv der alt gaar av seg selv, og
 * populasjonen kan bli MAALT bedre uten aa vaere det – de vanskelige givene
 * er da borte fra maalestokken, saa ratingen stiger mens spillestyrken staar
 * stille. Derfor: alfa er et flagg, standard 1,0 er mild, --uten-vekt
 * kjoerer A-armen, og std- og vektfordelingen skrives til giv-vekter.jsonl
 * hver generasjon nettopp for aa kunne se i ettertid om treningsfordelingen
 * har skjevet seg mot de lette givene.
 */
function givVekt(std: number): number {
  if (!brukVekt) return 1;
  const v = (1 + STD_REFERANSE / alfa) / (1 + std / alfa);
  return Math.max(0.3, Math.min(2, v));
}

// ---------------------------------------------------------------------------
// ParAgent: ett sete = ett budgivergenom + ett spillergenom
// ---------------------------------------------------------------------------

/**
 * Ruting etter FASE, ikke etter rolle (som SenatAgent i src/neat/senat.ts,
 * som ruter etter budvinner/makker/forsvar). Skillet her er det som faktisk
 * er to ulike oppgaver med to ulike fasiter: aa vurdere en haand foer spillet
 * (BUDRUNDE/VRAK/VELG) og aa spille kortene (SPILL).
 *
 * All laering foelger samme skille: xT-/margin-/makker-hodene og trumf-,
 * etterlys- og vrakfasiten hoerer budgiveren til; spill- og stikkfasiten
 * hoerer spilleren til. Da kan de to genomene ikke overskrive hverandres
 * kalibrering, som er hele poenget med aa dele dem.
 */
class ParAgent implements TurneringsAgent {
  readonly søkbar = true;

  // Vanlige felt, ikke parameteregenskaper: node kjoerer .ts i «strip-only»-
  // modus og stoetter ikke `constructor(private x)`.
  private readonly budgiver: NeatAgent;
  private readonly spiller: NeatAgent;

  constructor(budgiver: NeatAgent, spiller: NeatAgent) {
    this.budgiver = budgiver;
    this.spiller = spiller;
  }

  nyKamp(): void {
    this.budgiver.nyKamp();
    this.spiller.nyKamp();
  }

  velgHandling(state: GameState): Handling {
    return state.fase === "SPILL"
      ? this.spiller.velgHandling(state)
      : this.budgiver.velgHandling(state);
  }

  estimatFor(rundeNr: number): BudEstimat | undefined {
    return this.budgiver.estimatFor(rundeNr);
  }

  lærAvKontrakt(rundeNr: number, lagStikk: number, makkerStikk?: number): void {
    this.budgiver.lærAvKontrakt(rundeNr, lagStikk, makkerStikk);
  }

  lærBudFasit(
    state: GameState,
    spiller: number,
    lagStikk: number,
    makkerStikk: number,
    rate: number,
  ): void {
    this.budgiver.lærBudFasit(state, spiller, lagStikk, makkerStikk, rate);
  }

  lærTrumf(state: GameState, spiller: number, rate: number): void {
    this.budgiver.lærTrumf(state, spiller, rate);
  }

  lærVrak(state: GameState, spiller: number, rate: number): void {
    this.budgiver.lærVrak(state, spiller, rate);
  }

  lærEtterlys(state: GameState, spiller: number, kandidater: readonly Kort[], rate: number): void {
    this.budgiver.lærEtterlys(state, spiller, kandidater, rate);
  }

  lærSpill(state: GameState, spiller: number, solverKort: Kort, rate: number): void {
    this.spiller.lærSpill(state, spiller, solverKort, rate);
  }

  lærStikk(state: GameState, spiller: number, lovlige: readonly Kort[], rate: number): void {
    this.spiller.lærStikk(state, spiller, lovlige, rate);
  }

  rangerKort(state: GameState, spiller: number, lovlige: readonly Kort[]): Kort[] {
    return this.spiller.rangerKort(state, spiller, lovlige);
  }
}

// ---------------------------------------------------------------------------
// Kalibreringsmodus: maaler DD-kostnad, informasjonsdifferanse og std(SD)
// ---------------------------------------------------------------------------

if (sdK > 4) {
  si(
    `merk: --sdk ${sdK} klippes til 4. NevroHjerne er deterministisk, saa de ` +
      `eneste ulike rolloutene i en fast giv er de 4 tvungne budvinner-setene; ` +
      `rollout 5 og oppover ville vaert bit-identiske duplikater.`,
  );
}

if (kalibrer > 0) {
  const rader: {
    frø: number;
    dd: number[];
    sd: number[];
    stdSD: number;
    gap: number;
    msDD: number;
  }[] = [];
  const t0 = Date.now();
  for (let i = 0; i < kalibrer; i++) {
    const frø = (0x51ed_270b + Math.imul(i + 1, 0x9e37_79b1)) >>> 0;
    const start = opprettSpill({ antallSpillere: 4 }, frø);
    const a = Date.now();
    const an = analyserGiv(start);
    rader.push({ frø, dd: an.dd, sd: an.sd, stdSD: an.stdSD, gap: an.gap, msDD: Date.now() - a });
    if ((i + 1) % 25 === 0) si(`kalibrering: ${i + 1}/${kalibrer} giv`);
  }
  const n = rader.length;
  const snittGap = rader.reduce((a, r) => a + r.gap, 0) / n;
  const snittStd = rader.reduce((a, r) => a + r.stdSD, 0) / n;
  const alleGap: number[] = [];
  for (const r of rader) for (let i = 0; i < r.dd.length; i++) alleGap.push(r.dd[i]! - r.sd[i]!);
  const gapSnitt = alleGap.reduce((a, b) => a + b, 0) / alleGap.length;
  const gapStd = Math.sqrt(
    alleGap.reduce((a, b) => a + (b - gapSnitt) * (b - gapSnitt), 0) / alleGap.length,
  );
  const msTotal = rader.reduce((a, r) => a + r.msDD, 0);
  const sammendrag = {
    giv: n,
    rollouts: alleGap.length,
    ddTerskel,
    msPerGiv: msTotal / n,
    msPerLøsning: msTotal / alleGap.length,
    informasjonsdifferanse: gapSnitt,
    informasjonsdifferanseStd: gapStd,
    informasjonsdifferanseStdfeil: gapStd / Math.sqrt(alleGap.length),
    snittGapPerGiv: snittGap,
    snittStdSD: snittStd,
    snittVekt: rader.reduce((a, r) => a + givVekt(r.stdSD), 0) / n,
    sekunder: (Date.now() - t0) / 1000,
  };
  writeFileSync(`${dir}/dd-kalibrering.json`, JSON.stringify({ sammendrag, rader }, null, 2));
  si(`kalibrering ferdig -> ${dir}/dd-kalibrering.json`);
  si(
    `  ddTerskel ${ddTerskel}: ${sammendrag.msPerLøsning.toFixed(2)} ms/loesning, ` +
      `${sammendrag.msPerGiv.toFixed(1)} ms/giv (${alleGap.length / n} seter)`,
  );
  si(
    `  informasjonsdifferanse (DD − NevroHjerne): ${gapSnitt.toFixed(3)} ` +
      `± ${(gapStd / Math.sqrt(alleGap.length)).toFixed(3)} stikk (std ${gapStd.toFixed(2)})`,
  );
  si(`  std(SD) per giv: snitt ${snittStd.toFixed(3)}, snittvekt ${sammendrag.snittVekt.toFixed(3)}`);
  writeFileSync(`${dir}/liga2.log`, logg.join("\n") + "\n");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// To uavhengige populasjoner
// ---------------------------------------------------------------------------

function lastGenom(fil: string | null): Genom | undefined {
  if (fil === null) return undefined;
  const rå = JSON.parse(readFileSync(fil, "utf8")) as { genom?: unknown };
  return genomFraJson(
    rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(fil, "utf8"),
  );
}

const lagEvo = (frø: number, start: Genom | undefined): Evolusjon =>
  new Evolusjon({
    populasjon: popp,
    frø,
    startGenom: start,
    rater: { ...STANDARD_RATER, bevist: true },
  });

const budEvo = lagEvo(evoFrø, lastGenom(fraBud));
const spillEvo = lagEvo(evoFrø ^ 0x5eed, lastGenom(fraSpill));
const rng = lagRng(evoFrø ^ 0x11a6a);

let budRating: Rating[] = Array.from({ length: popp }, () => nyRating());
let spillRating: Rating[] = Array.from({ length: popp }, () => nyRating());

/**
 * FASIT-DOSENE er de samme som d7-liga kjoerer med (de eneste vi har maalt),
 * med to unntak: budFasit er byttet ut med budFasitDD, og spillFasit er av
 * som standard (se filhodet – d7-ligas variant er en no-op).
 */
const KAMP: KampOpts = {
  // ÉN GIV PER KAMP – se filhodet. Uten dette kan ikke std(SD)-vekten
  // tilordnes en enkelt giv.
  maksRunder: 1,
  trumfFasit: { sjanse: 0.5, rate: 0.05 },
  etterlysFasit: { sjanse: 0.6, rate: 0.05 },
  vrakFasit: { sjanse: 0.6, rate: 0.05 },
  stikkFasit: { sjanse: 0.25, rate: 0.05 },
  ...(brukDD
    ? { budFasitDD: { sjanse: budFasitSjanse, rate: budFasitRate, mål: ddBudMål } }
    : { budFasit: { sjanse: budFasitSjanse, rate: budFasitRate } }),
  ...(spillFasitSjanse > 0
    ? {
        spillFasit: {
          sjanse: spillFasitSjanse,
          verdener: 2,
          dybde: 4,
          nodeTak: 60_000,
          rate: 0.05,
        },
      }
    : {}),
};

/** Fisher–Yates paa indekser 0..n-1. */
const stokkIdx = (n: number): number[] => {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = t;
  }
  return idx;
};

/** Indeksene til den beste halvdelen etter rating. */
const toppHalv = (rat: readonly Rating[]): number[] =>
  rat
    .map((r, i) => ({ r: r.rating, i }))
    .sort((a, b) => b.r - a.r)
    .slice(0, Math.max(1, Math.floor(rat.length / 2)))
    .map((x) => x.i);

si(
  `D7-2: popp ${popp} x 2 populasjoner, ${paringer} paringer/agent/gen, ` +
    `DD ${brukDD ? `terskel ${ddTerskel}, infogap ${infoGap}` : "AV"}, ` +
    `vekt ${brukVekt ? `alfa ${alfa}` : "AV"}, fra bud=${fraBud ?? "ferskt"} spill=${fraSpill ?? "ferskt"}`,
);

for (let g = 0; g < generasjoner; g++) {
  const vekter: number[] = [];
  const stder: number[] = [];

  for (let r = 0; r < paringer; r++) {
    /**
     * PARING – IKKE STRENGT ETTER RANG.
     *
     * Med streng rangparing (beste budgiver + beste spiller, nest beste +
     * nest beste, ...) blir hver agent maalt i NOEYAKTIG ÉN kombinasjon.
     * Da kan et par laase seg i et middelmaadig lokalt optimum uten at noen
     * av halvdelene faar skylda: budgiveren byr lavt fordi makkeren spiller
     * daarlig, spilleren ser aldri en krevende kontrakt fordi budgiveren
     * aldri byr en, og begge maales som «greie» fordi de bare maales sammen.
     *
     * Derfor: hver budgiver trekkes mot `paringer` TILFELDIGE spillere fra
     * beste halvdel, og hver spiller mot like mange tilfeldige budgivere fra
     * beste halvdel. Fitness er snittet over paringene – som Elo allerede
     * gjoer, siden ratingen er et loepende snitt over kampene. Beste halvdel
     * (og ikke hele feltet) for aa unngaa at en god halvdel maales mot
     * stoey; tilfeldig innenfor halvdelen for aa faa flere kombinasjoner.
     */
    const topB = toppHalv(budRating);
    const topS = toppHalv(spillRating);
    const seter: { b: number; s: number }[] = [];
    for (let i = 0; i < popp; i++) seter.push({ b: i, s: topS[Math.floor(rng() * topS.length)]! });
    for (let i = 0; i < popp; i++) seter.push({ b: topB[Math.floor(rng() * topB.length)]!, s: i });
    const rekke = stokkIdx(seter.length);

    // Felles giver ved alle bord i runden (flakskontroll, som d7-liga).
    const giverFrø = Math.floor(rng() * 1_000_000);
    // Giv-analysen kjoeres ÉN gang og gjenbrukes av alle bordene – hele
    // populasjonen deler kostnaden. Nokkelen er (froe, rundeNr), og
    // spillGruppekamp bruker giverFroe direkte som kampfroe naar
    // froePerKamp er 1, saa cachen treffer.
    const analyse = analyserGiv(opprettSpill({ antallSpillere: 4 }, giverFrø));
    const vekt = givVekt(analyse.stdSD);
    vekter.push(vekt);
    stder.push(analyse.stdSD);

    for (let b = 0; b + 3 < rekke.length; b += 4) {
      const par = [rekke[b]!, rekke[b + 1]!, rekke[b + 2]!, rekke[b + 3]!].map((i) => seter[i]!);
      const agenter = par.map(
        (p) =>
          new ParAgent(
            new NeatAgent(budEvo.genomer[p.b]!, { læringsrate: 0 }),
            new NeatAgent(spillEvo.genomer[p.s]!, { læringsrate: 0 }),
          ),
      );
      const res = spillGruppekamp(agenter, giverFrø, KAMP);
      const andeler = andelerFraPoeng(res.poeng);
      // Vekten skaleres inn i Elo-oppdateringen ved aa krympe DELTAEN, som
      // er nøyaktig det samme som aa skalere K-faktoren for denne giva.
      // Gjoeres her og ikke i elo.ts fordi det er en D7-2-hypotese, ikke en
      // egenskap ved Elo.
      for (const [rat, idx] of [
        [budRating, par.map((p) => p.b)],
        [spillRating, par.map((p) => p.s)],
      ] as const) {
        const valgte = idx.map((i) => rat[i]!);
        const før = valgte.map((v) => v.rating);
        oppdaterBord(valgte, andeler);
        for (let k = 0; k < valgte.length; k++) {
          valgte[k]!.rating = før[k]! + vekt * (valgte[k]!.rating - før[k]!);
        }
      }
    }
  }

  const budFit = budRating.map((x) => x.rating);
  const spillFit = spillRating.map((x) => x.rating);
  // DOMMEN OVER BARNET per populasjon: skrittlengden vokser naar ratingen
  // steg, krymper og snur naar den falt (andre halvdel av bevist mutering).
  for (let i = 0; i < budEvo.genomer.length; i++) dommenOverBarnet(budEvo.genomer[i]!, budFit[i]!);
  for (let i = 0; i < spillEvo.genomer.length; i++) {
    dommenOverBarnet(spillEvo.genomer[i]!, spillFit[i]!);
  }
  const besteB = budFit.indexOf(Math.max(...budFit));
  const besteS = spillFit.indexOf(Math.max(...spillFit));
  const mesterB = budRating[besteB]!.rating;
  const mesterS = spillRating[besteS]!.rating;

  if ((g + 1) % 10 === 0 || g === 0) {
    const snitt = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
    si(
      `gen ${String(g + 1).padStart(5)}: bud ${mesterB.toFixed(0)}/${snitt(budFit).toFixed(0)} ` +
        `(${budEvo.genomer[besteB]!.koblinger.length} kobl), ` +
        `spill ${mesterS.toFixed(0)}/${snitt(spillFit).toFixed(0)} ` +
        `(${spillEvo.genomer[besteS]!.koblinger.length} kobl), ` +
        `std(SD) ${snitt(stder).toFixed(2)}, vekt ${snitt(vekter).toFixed(3)}`,
    );
    writeFileSync(`${dir}/mester-bud.json`, genomTilJson(budEvo.genomer[besteB]!));
    writeFileSync(`${dir}/mester-spill.json`, genomTilJson(spillEvo.genomer[besteS]!));
  }
  // Per-generasjon-maalingene skrives til fil hver generasjon, ikke bare til
  // loggen – vektfordelingen er hele grunnlaget for aa vurdere risikoen ved
  // std-vektingen i ettertid.
  appendFileSync(
    `${dir}/giv-vekter.jsonl`,
    JSON.stringify({
      gen: g + 1,
      stdSD: stder,
      vekt: vekter,
      budMester: mesterB,
      spillMester: mesterS,
    }) + "\n",
  );

  budEvo.nesteGenerasjonMed(budFit);
  spillEvo.nesteGenerasjonMed(spillFit);

  // Rating arves per populasjon: mesteren beholder sin, barna starter paa
  // feltets snitt med null kamper (hoey K). Samme regel som d7-liga.
  const arv = (fit: number[], gammel: Rating[], beste: number, evo: Evolusjon): Rating[] => {
    const snitt = fit.reduce((a, b) => a + b, 0) / fit.length;
    const forrigeMester: Rating = { rating: fit[beste]!, kamper: gammel[beste]!.kamper };
    return evo.genomer.map((_, i) =>
      i === 0 ? forrigeMester : nyRating({ rating: snitt, kamper: 0 }),
    );
  };
  budRating = arv(budFit, budRating, besteB, budEvo);
  spillRating = arv(spillFit, spillRating, besteS, spillEvo);

  // Giv-cachen tømmes mellom generasjoner: giverne er nye, og en cache som
  // vokser i 100 000 generasjoner er en lekkasje.
  givCache.clear();
}
