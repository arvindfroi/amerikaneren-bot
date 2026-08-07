/**
 * TO KONKRETE KONVENSJONSBRUDD, målt mot MesterAI på nøyaktig samme stillinger.
 *
 * examples/mesterai-atferd.ts profilerer bredt: femti rader om bud, vrak, trumf
 * og spill. Dette skriptet gjør det motsatte – det måler TO ting, begge helt
 * presise, begge etterprøvbare, begge reagert på av en spiller som kan spillet.
 * Malen (parret måling mot MesterAI) er den samme; det er utvalget som er nytt.
 *
 * METODEN – parret, ikke bare «samme frø»
 *   Adapterprotokollen har `{"type":"beslutt","sete":n}`: den spør MesterAI hva
 *   den ville gjort i gjeldende stilling UTEN å utføre det. Da går det an å
 *   sammenlikne eksakt:
 *
 *     1. MesterAI besetter ALLE FIRE setene og driver spillet framover.
 *     2. Ved HVERT beslutningspunkt spørres BÅDE MesterAI OG hver kandidat.
 *        Alle ser den identiske GameState-en – samme hånd, samme bord, samme
 *        historikk, samme poengstilling.
 *     3. MESTERAIS valg utføres. Kandidatens svar registreres og kastes.
 *
 *   Ingen rad sammenlikner tall fra ulike stillinger. Kolonne 1 er både fasit
 *   og kontroll. Kandidatene spørres i ALLE faser, ikke bare de to som måles,
 *   slik at agentenes interne kamptilstand får nøyaktig samme kallsekvens som i
 *   den brede profilen – ellers ville tallene ikke vært sammenliknbare med den.
 *
 * ------------------------------------------------------------------------
 * KONVENSJONSBRUDD 1 – å legge ess på makkerens etterlyste konge
 * ------------------------------------------------------------------------
 * Det etterlyste kortet er den høyeste trumfen spillefører IKKE har. Har han
 * essen, er det riktige å etterlyse kongen. Makkeren MÅ da legge kongen i
 * stikk 1 (makkerplikten), og kongen tar stikket FOR LAGET – spillefører har
 * essen, så ingen kan overta.
 *
 * Feilen: spillefører åpner MED essen. Makkeren er tvunget til å legge kongen
 * oppi, essen tar stikket, og laget har brukt opp BEGGE topptrumfene på ett
 * eneste stikk det hadde uansett. Ett garantert stikk er drept.
 *
 * Motoren tvinger budvinneren til å åpne i trumf i stikk 1 når han har trumf,
 * så «slår sitt eget etterlyste kort» er identisk med «spilte ut en trumf over
 * det etterlyste kortets valør». Det gjør bruddet trivielt å avgjøre – ingen
 * gjetting om hva noen VIL gjøre.
 *
 * Vi rapporterer det generelle tilfellet (spillefører slår sitt eget etterlyste
 * kort, uansett valør) OG ess-på-konge for seg, siden det er den reneste formen.
 *
 * KOSTNADEN måles på to måter, begge deterministiske:
 *   DREPTE GARANTERTE STIKK – hadde konvensjonskortet gått ut, ville det
 *       etterlyste kortet GARANTERT tatt stikk 1 (makkerplikten treffer, ingen
 *       forsvarer har et lovlig kort som slår det). Da er et sikkert stikk
 *       byttet mot et stikk laget hadde fra før. Eksakt, ingen simulering.
 *   UTSPILLING – fra nøyaktig samme stilling spilles resten av runden ut to
 *       ganger GJENNOM MOTOREN, med NevroHjerne i alle fire seter: én gang med
 *       kortet kandidaten valgte, én gang med konvensjonskortet (laveste trumf
 *       under det etterlyste). Differansen i lagets stikk er anslaget.
 *       Politikken er den SAMME i begge greinene og for alle kandidatene, så
 *       differansen bærer selv om nivået ikke gjør det. Utspillingen går
 *       gjennom `utfør`/`lovligeKort`, så ALLE reglene håndheves – makkerplikten
 *       inkludert.
 *
 *   HVORFOR IKKE DOBBELT-DUMMY? Det var første forsøk, og det er feil verktøy
 *   her – av to grunner, begge målt:
 *     1. `src/solver/dds.ts` modellerer ikke makkerplikten. Den håndhever bare
 *        følgeplikt. I løserens verden kan altså makkeren DUKKE det etterlyste
 *        kortet under essen og beholde kongen til senere – nøyaktig den regelen
 *        konvensjonen hviler på. Målt på 82 anledninger «lønner» det seg da med
 *        +0,15 stikk å legge ut høyeste trumf, som er et artefakt av at regelen
 *        mangler.
 *     2. Selv med regelen på plass er dobbelt-dummy perfekt informasjon, og
 *        halve poenget med konvensjonen er å AVSLØRE makkeren billig. En løser
 *        som allerede kjenner alle hendene kan per konstruksjon ikke se verdien
 *        av informasjon. Enkeltdummy-utspilling kan.
 *
 * ------------------------------------------------------------------------
 * KONVENSJONSBRUDD 2 – makkerens utspill i stikk 2
 * ------------------------------------------------------------------------
 * Har det etterlyste kortet tatt stikk 1, er makkeren avslørt og har utspillet
 * i stikk 2. (At makkeren i det hele tatt leder stikk 2 ER beviset på at det
 * etterlyste kortet tok stikk 1 – han hadde ikke noe annet lovlig kort.)
 *
 * Arvinds konvensjon: da spiller man nesten utelukkende TRUMF, ESS, eller det
 * HØYESTE kortet man har. Alternativt kaster man et kort i en farge man har
 * ÉN av (singleton), slik at trumfen åpner seg i den fargen senere.
 *
 * Bruddet: et lavt, tilfeldig kort – verken trumf, ess, håndens høyeste eller
 * en singleton. Stikk 3 måles med de samme radene som kontroll: er mønsteret
 * en KONVENSJON knyttet til avsløringen, eller bare generell utspillsstil?
 *
 * ------------------------------------------------------------------------
 * KJØRING (adapteren må være bygget – se arena/README.md)
 *   node examples/mesterai-konvensjoner.ts --runder 600 \
 *        --adapter wsl:/home/arvind/arena-adapter/.build/release/adapter
 *
 * | Flagg | Standard | Betydning |
 * |---|---|---|
 * | `--runder` | 300 | antall runder som profileres (hovedkostnaden) |
 * | `--froe` | 660000 | frøbase; kamp k bruker frø `froe + k` |
 * | `--maksRunder` | 12 | runder per kamp før nytt frø (realistisk poengstilling) |
 * | `--ms` | 450 | tidsbudsjett per kortvalg for MesterAI |
 * | `--verdener` | – | låser MesterAIs min/maksVerdener; gjør målingen lastuavhengig |
 * | `--kandidater` | sd-r2-begge-512, d7alle, nevro | kommaliste: `nevro`, `e1:<fil>`, `pimc`, `graadig` |
 * | `--adapter` | arena/adapter/.build/release/adapter | adapterbinær, `wsl:`-prefiks støttes |
 * | `--ut` | analyse/mesterai-konvensjoner | skriver `<ut>.txt` og `<ut>.json` |
 *
 * OM `--ms` PÅ EN OPPTATT MASKIN: MesterAIs søk stopper når minVerdener er nådd
 * OG fristen er ute. Står det treningsjobber og spiser kjerner rekker den færre
 * verdener på de samme 450 ms og spiller svakere – uten at noe røper det.
 * Maskinlasten hører derfor med i rapporten, og `--verdener N` bør brukes når
 * tallet skal være en varig målestokk.
 *
 * VARIG UTDATA: `<ut>.txt` og `<ut>.json` skrives på nytt etter HVER runde.
 * En flertimers kjøring som avbrytes etterlater alltid en gyldig, ferdig regnet
 * rapport for de rundene som rakk å bli spilt.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { likeKort, type Farge, type Kort } from "../src/kort.ts";
import {
  lovligeKort,
  opprettSpill,
  stikkvinner,
  utfør,
  type GameState,
  type Handling,
} from "../src/motor.ts";
import { velgHandling as pimcVelg, type BotOpts } from "../src/bot/bot.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { grådigHandling } from "./graadig.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { Budagent, lesBudmodell } from "../src/moe2/budagent.ts";
import {
  Adapter,
  handlingFraJson,
  handlingTilJson,
  løsAdapter,
  rundeStart,
  sjekkSynk,
  type AdapterKommando,
} from "../arena/adapterklient.ts";

// --- Argumenter -------------------------------------------------------------

function flagg(navn: string, standard: number): number {
  const i = process.argv.indexOf(`--${navn}`);
  if (i < 0 || process.argv[i + 1] === undefined) return standard;
  const v = Number(process.argv[i + 1]);
  if (!Number.isFinite(v)) throw new Error(`Ugyldig verdi for --${navn}`);
  return v;
}
function tekstFlagg(navn: string, standard: string): string {
  const i = process.argv.indexOf(`--${navn}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : standard;
}

const målRunder = flagg("runder", 300);
const frøBase = flagg("froe", 660000);
const maksRunderPerKamp = flagg("maksRunder", 12);
const tidMs = flagg("ms", 450);
const låsteVerdener = flagg("verdener", 0);
const adapterSti = tekstFlagg("adapter", "arena/adapter/.build/release/adapter");
const utBase = tekstFlagg("ut", "analyse/mesterai-konvensjoner");
const kandidatSpec = tekstFlagg(
  "kandidater",
  "e1:e1-modell/sd-r2-begge-512.bin,e1:e1-modell/d7alle.bin,nevro",
);
const merke = tekstFlagg("merke", "");

let adapterKmd: AdapterKommando;
try {
  adapterKmd = løsAdapter(adapterSti);
} catch (feil) {
  console.error(feil instanceof Error ? feil.message : String(feil));
  process.exit(1);
}

// --- Kandidatene ------------------------------------------------------------

/**
 * En kandidat svarer bare «hva ville du gjort her». Den utfører aldri noe –
 * MesterAI eier linja – så den trenger ingen kamphukommelse ut over `nyKamp`.
 */
interface Kandidat {
  readonly navn: string;
  nyKamp(frø: number): void;
  velg(state: GameState): Handling;
}

function lagKandidat(spec: string): Kandidat {
  if (spec === "pimc") {
    let opts: BotOpts = { tidsbudsjettMs: tidMs, terskel: 7 };
    return {
      navn: spec,
      nyKamp: (frø) => {
        opts = { tidsbudsjettMs: tidMs, terskel: 7, frø };
      },
      velg: (s) => pimcVelg(s, opts),
    };
  }
  if (spec === "graadig") return { navn: spec, nyKamp: () => {}, velg: (s) => grådigHandling(s) };
  if (spec === "nevro") {
    const agent = new NevroAgent();
    return { navn: spec, nyKamp: () => agent.nyKamp(), velg: (s) => agent.velgHandling(s) };
  }
  if (spec.startsWith("e1:")) {
    const agent = E1Agent.fraFil(spec.slice(3));
    return {
      navn: spec.slice(3).split(/[\\/]/).pop()?.replace(/\.bin$/, "") ?? spec,
      nyKamp: () => agent.nyKamp(),
      velg: (s) => agent.velgHandling(s),
    };
  }
  /**
   * `vakt:<flagg>:<indre>` og `budm:<modellfil>:<indre>`, nøstet.
   *
   * HVORFOR DE MÅ INN HER. Konvensjonsbrudd 2 er makkerens utspill i stikk 2 –
   * nøyaktig stillingen vaktflagget `m` dekker. Uten vakten i spekken måler
   * skriptet det RÅ nettet og sier at konvensjonen brytes, mens boten som
   * faktisk spiller har en regel som forbyr bruddet. Da beskriver tallet en
   * bot vi ikke har.
   *
   * Og makkersetet er der det største målte hullet mot MesterAI ligger
   * (−0,22 poeng per runde i fasegapet), så det er nettopp der spekken må
   * være presis.
   */
  if (spec.startsWith("vakt:")) {
    const v = delVaktspek(spec);
    if (v === null) throw new Error(`Ugyldig vaktspek «${spec}»`);
    const indre = lagKandidat(v.indre);
    const vakt = new Konvensjonsvakt(
      { velgHandling: (s) => indre.velg(s), nyKamp: () => indre.nyKamp(0) },
      v.valg,
    );
    return { navn: `v${v.flagg}:${indre.navn}`.slice(0, 18), nyKamp: (f) => indre.nyKamp(f), velg: (s) => vakt.velgHandling(s) };
  }
  if (spec.startsWith("budm:")) {
    const rest = spec.slice(5);
    const skille = rest.indexOf(":");
    if (skille < 0) throw new Error(`Ugyldig budm-spek «${spec}»`);
    const indre = lagKandidat(rest.slice(skille + 1));
    const bud = new Budagent(
      { velgHandling: (s) => indre.velg(s), nyKamp: () => indre.nyKamp(0) },
      lesBudmodell(rest.slice(0, skille)),
    );
    return { navn: `budm:${indre.navn}`.slice(0, 18), nyKamp: (f) => indre.nyKamp(f), velg: (s) => bud.velgHandling(s) };
  }
  throw new Error(
    `Ukjent kandidat «${spec}» (nevro, e1:<fil>, pimc, graadig, vakt:<flagg>:<indre>, budm:<fil>:<indre>)`,
  );
}

const kandidater = kandidatSpec
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s.length > 0)
  .map(lagKandidat);

/** Kolonne 0 er ALLTID MesterAI: fasiten alle avvik måles mot. */
const kolonner = ["MesterAI", ...kandidater.map((k) => k.navn)];

// --- Tellerne ---------------------------------------------------------------

/**
 * BRUDD 1 – spillefører slår sitt eget etterlyste kort i stikk 1.
 *
 * Nevnerne (`anledning`, `kanSlaa`, `unngaaelig`, `essKongeAnledning`,
 * `garantiAaDrepe`) henger BARE på stillingen, ikke på hva kandidaten valgte.
 * De er derfor identiske i alle kolonnene, og radene er parret.
 */
interface Brudd1 {
  /** Stikk 1, spillefører leder, det finnes etterlysning og makker, alt lovlig er trumf. */
  anledning: number;
  /** … og han HAR en trumf som slår det etterlyste kortet (kan begå bruddet). */
  kanSlaa: number;
  /** … og han har OGSÅ en trumf under det (bruddet var til å unngå). */
  unngaaelig: number;
  /** Stillinger der konvensjonskortet ville gitt makkeren stikket GARANTERT. */
  garantiAaDrepe: number;
  /** Ess-på-konge: etterlyst er trumf K, og spillefører sitter med trumf A. */
  essKongeAnledning: number;

  /** BRUDDET: kortet som ble lagt slår det etterlyste. */
  slo: number;
  /** Bruddet i de stillingene der det var til å unngå. */
  sloUnngaaelig: number;
  /** Bruddet i stillinger der et garantert stikk dermed ble drept. */
  drepteGaranti: number;
  /** Bruddet i ess-på-konge-stillingene: la ut trumfesset. */
  essPaaKonge: number;
  /** Valøren på kortet som ble lagt, i bruddtilfellene. */
  bruddValoer: number[];
  /** Valøren på det etterlyste kortet i de samme tilfellene. */
  bruddEtterlystValoer: number[];
  /** Valøren på utspillet i ALLE anledninger (bakgrunn for tallet over). */
  alleValoer: number[];

  /**
   * Grådig fullinfo-utrulling: lagets stikk med kortet kandidaten valgte,
   * minus lagets stikk med konvensjonskortet. Negativt tall = tapte stikk.
   */
  kostnadPerAnledning: number[];
  /** Samme differanse, men bare i de anledningene bruddet FAKTISK ble begått. */
  kostnadPerBrudd: number[];
}

const nyBrudd1 = (): Brudd1 => ({
  anledning: 0, kanSlaa: 0, unngaaelig: 0, garantiAaDrepe: 0, essKongeAnledning: 0,
  slo: 0, sloUnngaaelig: 0, drepteGaranti: 0, essPaaKonge: 0,
  bruddValoer: [], bruddEtterlystValoer: [], alleValoer: [],
  kostnadPerAnledning: [], kostnadPerBrudd: [],
});

/**
 * BRUDD 2 – makkerens utspill etter at han er avslørt.
 *
 * `konvensjonell` er unionen trumf ∪ ess ∪ høyeste-på-hånd ∪ singleton, og
 * `brudd` er nøyaktig komplementet. De to summerer alltid til `utspill`.
 */
interface Brudd2 {
  utspill: number;
  trumf: number;
  ess: number;
  hoyesteEgen: number;
  hoyesteIFarge: number;
  singleton: number;
  konvensjonell: number;
  brudd: number;
  /** Bruddet i sin groveste form: lavt kort (≤ 9) som ikke er singleton. */
  lavtIkkeSingleton: number;
  valoer: number[];
  /** Valøren i bruddtilfellene alene. */
  bruddValoer: number[];
}

const nyBrudd2 = (): Brudd2 => ({
  utspill: 0, trumf: 0, ess: 0, hoyesteEgen: 0, hoyesteIFarge: 0, singleton: 0,
  konvensjonell: 0, brudd: 0, lavtIkkeSingleton: 0, valoer: [], bruddValoer: [],
});

/** Stikkene makkerens utspill måles i: stikk 2 er saken, stikk 3 er kontrollen. */
const MAKKERSTIKK = [1, 2] as const;

interface Profil {
  brudd1: Brudd1;
  /** Indeksert som MAKKERSTIKK. */
  brudd2: Brudd2[];
  feil: number;
}

const nyProfil = (): Profil => ({
  brudd1: nyBrudd1(),
  brudd2: MAKKERSTIKK.map(nyBrudd2),
  feil: 0,
});

// --- Småhjelpere ------------------------------------------------------------

/** Antall kort spilleren har i hver farge. */
function fargeTelling(hånd: readonly Kort[]): Record<Farge, number> {
  const t: Record<Farge, number> = { S: 0, H: 0, R: 0, K: 0 };
  for (const k of hånd) t[k.farge]++;
  return t;
}

/**
 * Tar det etterlyste kortet stikk 1 hvis spilleføreren åpner med `utspill`?
 *
 * Deterministisk, uten å gjette hva noen VIL gjøre:
 *   1. Makkeren MÅ legge det etterlyste kortet (makkerplikten gir da bare
 *      det ene kortet). Gjør den ikke det, kommer kortet ikke ned – nei.
 *   2. Utspillet må ikke selv slå det.
 *   3. Ingen av de to forsvarerne må ha et LOVLIG kort som slår det.
 */
function etterlystTarStikket(s: GameState, sete: number, utspill: Kort): boolean {
  const etterlyst = s.etterlyst;
  const makker = s.makker;
  if (etterlyst === null || makker === null || makker === sete) return false;
  const åpnet: GameState = { ...s, bord: [{ spiller: sete, kort: utspill }] };
  const makkerLov = lovligeKort(åpnet, makker);
  if (!(makkerLov.length === 1 && likeKort(makkerLov[0]!, etterlyst))) return false;
  const medEtterlyst = åpnet.bord.concat({ spiller: makker, kort: etterlyst });
  if (stikkvinner(medEtterlyst, s.trumf!) !== makker) return false;
  for (let d = 0; d < s.antallSpillere; d++) {
    if (d === sete || d === makker) continue;
    for (const k of lovligeKort(åpnet, d)) {
      if (stikkvinner(medEtterlyst.concat({ spiller: d, kort: k }), s.trumf!) === d) return false;
    }
  }
  return true;
}

/**
 * Politikken som spiller ut motfaktiske greiner. NevroHjerne har ingen
 * kamphukommelse (se `NevroAgent.nyKamp`), så én instans kan betjene alle fire
 * seter og gir samme svar på samme stilling hver gang – utspillingen er
 * deterministisk, og de to greinene er derfor sammenliknbare.
 */
const utspiller = new NevroAgent();

/**
 * Spiller resten av runden ut fra `s` med `kort` som første trekk, deretter
 * NevroHjerne i alle fire seter, og returnerer hvor mange stikk budlaget endte
 * med. `null` hvis runden ikke lot seg fullføre.
 *
 * Utspillingen går gjennom `utfør`, altså gjennom motorens regler: makkerplikt,
 * følgeplikt og utspillsplikt håndheves. Det er hele grunnen til at den brukes
 * framfor dobbelt-dummy-løseren – se hodekommentaren.
 *
 * Poenget er ikke NIVÅET, men DIFFERANSEN mellom to greiner fra samme stilling
 * med samme politikk: da faller politikkens svakhet ut som en felles komponent.
 */
function rullUt(s: GameState, sete: number, kort: Kort): number | null {
  let st: GameState;
  try {
    st = utfør(s, { type: "SPILL", spiller: sete, kort }).state;
  } catch {
    return null;
  }
  let vakt = 0;
  while (st.fase === "SPILL" && vakt++ < 200) {
    try {
      st = utfør(st, utspiller.velgHandling(st)).state;
    } catch {
      return null;
    }
  }
  return st.sisteRunde?.lagStikk ?? null;
}

/**
 * Utspillingene er DYRE og avhenger bare av hvilket KORT som legges, ikke av
 * hvilken kolonne som la det. Én hurtigbuffer per beslutningspunkt gjør at
 * fire kolonner som velger samme kort deler én utspilling.
 */
type Rullebuffer = Map<string, number | null>;

function rullBufret(buf: Rullebuffer, s: GameState, sete: number, kort: Kort): number | null {
  const id = `${kort.farge}${kort.verdi}`;
  const truffet = buf.get(id);
  if (truffet !== undefined) return truffet;
  const v = rullUt(s, sete, kort);
  buf.set(id, v);
  return v;
}

// --- Registrering av ÉN beslutning ------------------------------------------

/**
 * Er dette stikk 1 med spilleføreren på utspill, med etterlysning, makker, og
 * bare trumf som lovlige kort? Da – og bare da – er BRUDD 1 målbart.
 *
 * Kravet «bare trumf lovlig» er ikke en innstramming i praksis: motoren tvinger
 * budvinneren til å åpne i trumf når han har trumf, og en budvinner uten trumf
 * finnes knapt. Kravet gjør derimot avgjørelsen triviell og eksakt: alt lovlig
 * er trumf, så «slår det etterlyste» er nøyaktig «høyere valør enn det».
 */
function erBrudd1Stilling(s: GameState, sete: number): boolean {
  if (s.fase !== "SPILL" || s.bord.length !== 0 || s.stikkSpilt !== 0) return false;
  if (sete !== s.budvinner) return false;
  if (s.etterlyst === null || s.makker === null || s.makker === sete) return false;
  if (s.trumf === null || s.etterlyst.farge !== s.trumf) return false;
  const lovlige = lovligeKort(s, sete);
  return lovlige.length > 0 && lovlige.every((k) => k.farge === s.trumf);
}

/** Hvilket av MAKKERSTIKK-ene er dette utspillet, eller −1? */
function makkerstikkIndeks(s: GameState, sete: number): number {
  if (s.fase !== "SPILL" || s.bord.length !== 0) return -1;
  if (s.makker === null || sete !== s.makker || sete === s.budvinner) return -1;
  return MAKKERSTIKK.indexOf(s.stikkSpilt as (typeof MAKKERSTIKK)[number]);
}

/** Legger kandidatens (eller MesterAIs egen) beslutning inn i profilen. */
function registrer(p: Profil, s: GameState, sete: number, h: Handling, buf: Rullebuffer): void {
  if (h.type !== "SPILL") return;
  const kort = h.kort;

  if (erBrudd1Stilling(s, sete)) {
    const b = p.brudd1;
    const etterlyst = s.etterlyst!;
    const lovlige = lovligeKort(s, sete);
    const høyere = lovlige.filter((k) => k.verdi > etterlyst.verdi);
    const lavere = lovlige.filter((k) => k.verdi < etterlyst.verdi);

    b.anledning++;
    b.alleValoer.push(kort.verdi);
    if (høyere.length > 0) b.kanSlaa++;
    if (høyere.length > 0 && lavere.length > 0) b.unngaaelig++;
    const harTrumfEss = lovlige.some((k) => k.verdi === 14);
    if (etterlyst.verdi === 13 && harTrumfEss) b.essKongeAnledning++;

    // Konvensjonskortet: laveste trumf som IKKE slår det etterlyste.
    const konvensjon =
      lavere.length > 0 ? lavere.reduce((a, x) => (x.verdi < a.verdi ? x : a)) : null;
    // «Garanti å drepe» krever BEGGE deler: at konvensjonskortet finnes og
    // sikrer stikket, OG at spilleren i det hele tatt har en trumf over det
    // etterlyste. Uten den siste kan garantien ikke drepes, og stillingen
    // hører ikke hjemme i nevneren.
    const garantiFinnes =
      konvensjon !== null && høyere.length > 0 && etterlystTarStikket(s, sete, konvensjon);
    if (garantiFinnes) b.garantiAaDrepe++;

    const slo = kort.verdi > etterlyst.verdi;
    if (slo) {
      b.slo++;
      b.bruddValoer.push(kort.verdi);
      b.bruddEtterlystValoer.push(etterlyst.verdi);
      if (lavere.length > 0) b.sloUnngaaelig++;
      if (garantiFinnes) b.drepteGaranti++;
      if (etterlyst.verdi === 13 && kort.verdi === 14) b.essPaaKonge++;
    }

    // Kostnaden – bare der bruddet var til å unngå, ellers finnes ingen
    // motfaktisk grein å sammenlikne med.
    if (konvensjon !== null && høyere.length > 0) {
      const valgt = rullBufret(buf, s, sete, kort);
      const alternativ = rullBufret(buf, s, sete, konvensjon);
      if (valgt !== null && alternativ !== null) {
        const diff = valgt - alternativ;
        b.kostnadPerAnledning.push(diff);
        if (slo) b.kostnadPerBrudd.push(diff);
      }
    }
    return;
  }

  const mi = makkerstikkIndeks(s, sete);
  if (mi >= 0) {
    const b = p.brudd2[mi]!;
    const hånd = s.hender[sete] ?? [];
    const tell = fargeTelling(hånd);
    const høyesteEgen = hånd.reduce((m, k) => Math.max(m, k.verdi), 0);
    const høyesteIFarge = hånd
      .filter((k) => k.farge === kort.farge)
      .reduce((m, k) => Math.max(m, k.verdi), 0);

    const erTrumf = kort.farge === s.trumf;
    const erEss = kort.verdi === 14;
    const erHøyeste = kort.verdi === høyesteEgen;
    const erSingleton = tell[kort.farge] === 1;

    b.utspill++;
    b.valoer.push(kort.verdi);
    if (erTrumf) b.trumf++;
    if (erEss) b.ess++;
    if (erHøyeste) b.hoyesteEgen++;
    if (kort.verdi === høyesteIFarge) b.hoyesteIFarge++;
    if (erSingleton) b.singleton++;
    if (erTrumf || erEss || erHøyeste || erSingleton) {
      b.konvensjonell++;
    } else {
      b.brudd++;
      b.bruddValoer.push(kort.verdi);
      if (kort.verdi <= 9) b.lavtIkkeSingleton++;
    }
  }
}

// --- Målinger og avvik ------------------------------------------------------

/** En observasjonsserie: nok til snitt, n OG et standardavvik for z-testen. */
interface Prøve {
  readonly verdi: number;
  readonly n: number;
  readonly varians: number;
}

const TOM: Prøve = { verdi: NaN, n: 0, varians: NaN };

function fraTall(x: readonly number[]): Prøve {
  const n = x.length;
  if (n === 0) return TOM;
  const m = x.reduce((a, b) => a + b, 0) / n;
  const v = n < 2 ? 0 : x.reduce((a, b) => a + (b - m) * (b - m), 0) / (n - 1);
  return { verdi: m, n, varians: v };
}

function fraAndel(a: number, b: number): Prøve {
  if (b === 0) return TOM;
  const p = a / b;
  return { verdi: p, n: b, varians: p * (1 - p) };
}

interface Måling {
  readonly gruppe: string;
  readonly navn: string;
  readonly slag: "snitt" | "andel";
  /** Sant for radene som ER bruddet – de rangeres først i funnlista. */
  readonly erBrudd: boolean;
  readonly uttrekk: (p: Profil) => Prøve;
}

function måleliste(): Måling[] {
  const m: Måling[] = [];
  const snitt = (
    gruppe: string, navn: string, f: (p: Profil) => readonly number[], erBrudd = false,
  ): void => {
    m.push({ gruppe, navn, slag: "snitt", erBrudd, uttrekk: (p) => fraTall(f(p)) });
  };
  const andel = (
    gruppe: string, navn: string, f: (p: Profil) => [number, number], erBrudd = false,
  ): void => {
    m.push({ gruppe, navn, slag: "andel", erBrudd, uttrekk: (p) => fraAndel(...f(p)) });
  };

  // --- BRUDD 1 ------------------------------------------------------------
  const G1 = "BRUDD 1/stikk 1";
  const b1 = (p: Profil): Brudd1 => p.brudd1;
  andel(G1, "SLO sitt eget etterlyste kort", (p) => [b1(p).slo, b1(p).anledning], true);
  andel(G1, "  … av dem som KUNNE slå det", (p) => [b1(p).slo, b1(p).kanSlaa], true);
  andel(G1, "  … når det var til å unngå", (p) => [b1(p).sloUnngaaelig, b1(p).unngaaelig], true);
  andel(G1, "ESS på makkerens KONGE", (p) => [b1(p).essPaaKonge, b1(p).essKongeAnledning], true);
  andel(G1, "drepte et GARANTERT stikk", (p) => [b1(p).drepteGaranti, b1(p).garantiAaDrepe], true);
  snitt(G1, "valør på utspillet (alle)", (p) => b1(p).alleValoer);
  snitt(G1, "valør lagt VED BRUDD", (p) => b1(p).bruddValoer);
  snitt(G1, "  … etterlyst valør der", (p) => b1(p).bruddEtterlystValoer);
  snitt(G1, "stikk-kostnad per anledning", (p) => b1(p).kostnadPerAnledning);
  snitt(G1, "stikk-kostnad per brudd", (p) => b1(p).kostnadPerBrudd);

  // --- BRUDD 2 ------------------------------------------------------------
  for (let i = 0; i < MAKKERSTIKK.length; i++) {
    const g = `BRUDD 2/makker stikk ${MAKKERSTIKK[i]! + 1}`;
    const b2 = (p: Profil): Brudd2 => p.brudd2[i]!;
    andel(g, "trumf ut", (p) => [b2(p).trumf, b2(p).utspill]);
    andel(g, "ess ut", (p) => [b2(p).ess, b2(p).utspill]);
    andel(g, "høyeste kort på hånden", (p) => [b2(p).hoyesteEgen, b2(p).utspill]);
    andel(g, "singleton (eneste i fargen)", (p) => [b2(p).singleton, b2(p).utspill]);
    andel(g, "høyeste i sin egen farge", (p) => [b2(p).hoyesteIFarge, b2(p).utspill]);
    andel(g, "KONVENSJONELT (union)", (p) => [b2(p).konvensjonell, b2(p).utspill]);
    andel(g, "BRUDD: lavt, ikke singleton", (p) => [b2(p).brudd, b2(p).utspill], true);
    andel(g, "  … og valør ≤ 9", (p) => [b2(p).lavtIkkeSingleton, b2(p).utspill], true);
    snitt(g, "snittvalør på utspillet", (p) => b2(p).valoer);
    snitt(g, "snittvalør VED BRUDD", (p) => b2(p).bruddValoer);
  }

  return m;
}

/** Avviket kandidat − MesterAI, i standardfeil. Uparret (konservativt). */
function zVerdi(a: Prøve, b: Prøve): number {
  if (a.n === 0 || b.n === 0) return NaN;
  const se = Math.sqrt(a.varians / a.n + b.varians / b.n);
  if (!(se > 0)) return a.verdi === b.verdi ? 0 : Infinity;
  return (a.verdi - b.verdi) / se;
}

// --- Rapporten --------------------------------------------------------------

const fmt = (p: Prøve, slag: Måling["slag"]): string => {
  if (p.n === 0) return "–";
  if (slag === "andel") return `${(100 * p.verdi).toFixed(0)} %`;
  return p.verdi.toFixed(2);
};

/**
 * Grensen for når en rad har for få observasjoner til å bety noe. Under denne
 * merkes både n-en i tabellen og linja i funnlista, så ingen kan lese en
 * tilfeldighet som et funn.
 */
const TYNN_N = 50;

const GRUPPEINNLEDNING: Record<string, string[]> = {
  "BRUDD 1/stikk 1": [
    "",
    "KONVENSJONSBRUDD 1 – Å LEGGE ESS PÅ MAKKERENS ETTERLYSTE KONGE",
    "",
    "Det etterlyste kortet er den høyeste trumfen spillefører IKKE har. Har",
    "han essen, er det riktige å etterlyse kongen: makkeren MÅ legge kongen i",
    "stikk 1 (makkerplikten), og kongen tar stikket FOR LAGET – spillefører",
    "har essen, så ingen kan overta.",
    "",
    "Feilen: spillefører åpner MED essen. Makkeren er tvunget til å legge",
    "kongen oppi, essen tar stikket, og laget har brukt opp BEGGE topptrumfene",
    "på ett stikk det hadde uansett. Ett garantert stikk er drept.",
    "",
    "Motoren tvinger trumfutspill i stikk 1, så alt lovlig er trumf og «slår",
    "sitt eget etterlyste kort» er nøyaktig «høyere valør enn det». Ingen",
    "gjetting. Nevnerne er stillingsbestemte og derfor like i alle kolonnene.",
    "",
    "  anledning     stikk 1, spillefører på utspill, etterlysning og makker",
    "  KUNNE slå     … og han sitter med en trumf over det etterlyste",
    "  til å unngå   … og han har OGSÅ en trumf under det",
    "  GARANTERT     … og konvensjonskortet ville gitt makkeren stikket sikkert",
    "",
    "Stikk-kostnaden er en utspilling av resten av runden fra SAMME stilling,",
    "gjennom motoren, med NevroHjerne i alle fire seter: én gang med kandidatens",
    "kort og én gang med konvensjonskortet (laveste trumf under det etterlyste).",
    "Politikken er den samme i begge greinene og for alle kandidatene, så",
    "DIFFERANSEN bærer selv om nivået ikke gjør det. Negativt = tapte stikk.",
    "",
    "Dobbelt-dummy ble prøvd først og forkastet. `src/solver/dds.ts` håndhever",
    "bare følgeplikt, ikke MAKKERPLIKTEN – i løserens verden kan makkeren dukke",
    "det etterlyste kortet under essen og spare kongen, altså nøyaktig den",
    "regelen konvensjonen hviler på. Målt på 82 anledninger «lønner» høyeste",
    "trumf seg da med +0,15 stikk, som er et rent artefakt. I tillegg er",
    "dobbelt-dummy perfekt informasjon, og halve poenget med konvensjonen er å",
    "avsløre makkeren billig – en løser som kjenner alle hendene fra før kan per",
    "konstruksjon ikke se verdien av informasjon. Utspillingen her går gjennom",
    "`utfør`/`lovligeKort` og er derfor regelriktig og enkeltdummy.",
  ],
  "BRUDD 2/makker stikk 2": [
    "",
    "KONVENSJONSBRUDD 2 – MAKKERENS UTSPILL I STIKK 2",
    "",
    "Har det etterlyste kortet tatt stikk 1, er makkeren avslørt og har",
    "utspillet i stikk 2. At makkeren i det hele tatt LEDER stikk 2 er selve",
    "beviset på at det etterlyste kortet tok stikk 1 – han hadde ikke noe",
    "annet lovlig kort å legge.",
    "",
    "Konvensjonen: da spiller man nesten utelukkende TRUMF, ESS eller det",
    "HØYESTE kortet man har. Alternativt kaster man et kort i en farge man har",
    "ÉN av (singleton), slik at trumfen åpner seg i den fargen senere.",
    "",
    "«KONVENSJONELT» er unionen av de fire; «BRUDD» er nøyaktig komplementet –",
    "et kort som verken er trumf, ess, håndens høyeste eller en singleton. De",
    "to summerer alltid til 100 %. Stikk 3 står under som KONTROLL: er",
    "mønsteret knyttet til avsløringen, eller bare generell utspillsstil?",
  ],
};

function bygdRapport(
  profiler: Profil[], runder: number, sekunder: number,
): { txt: string; json: object } {
  const målinger = måleliste();
  const linjer: string[] = [];
  const bredde = 34;
  const kol = 18;
  const rad = (navn: string, v: string[]): void => {
    linjer.push(navn.padEnd(bredde) + v.map((x) => x.padStart(kol)).join(""));
  };

  const oppsett =
    låsteVerdener > 0 ? `${låsteVerdener} verdener per kortvalg (låst)` : `${tidMs} ms per kortvalg`;

  linjer.push("=== TO KONVENSJONSBRUDD MOT MESTERAI ===");
  linjer.push("");
  linjer.push(`Runder profilert:  ${runder}`);
  linjer.push(`Frøbase:           ${frøBase} (${maksRunderPerKamp} runder per kamp)`);
  linjer.push(`MesterAI:          ${oppsett}, alle fire seter`);
  linjer.push(`Tidsbruk:          ${(sekunder / 60).toFixed(1)} min`);
  linjer.push(`Skrevet:           ${new Date().toISOString()}`);
  if (merke !== "") linjer.push(`Merke:             ${merke}`);
  linjer.push("");
  linjer.push("Alle kolonnene svarer på DE SAMME stillingene, i den samme kjøringen.");
  linjer.push("MesterAI driver spillet; kandidatene svarer på hvert beslutningspunkt");
  linjer.push("uten å utføre noe. Kolonne 1 er fasit.");
  linjer.push("");
  linjer.push(`En n merket «*» er under ${TYNN_N} observasjoner. Slike rader er USIKRE:`);
  linjer.push("de kan svinge flere titalls prosentpoeng på ren tilfeldighet, og skal");
  linjer.push("ikke leses som funn uansett hvor stort avviket ser ut.");

  const funn: {
    gruppe: string; navn: string; kandidat: string; erBrudd: boolean;
    mester: number; kand: number; avvik: number; n: number; nMester: number; z: number; slag: string;
  }[] = [];

  let forrigeGruppe = "";
  for (const m of målinger) {
    if (m.gruppe !== forrigeGruppe) {
      for (const l of GRUPPEINNLEDNING[m.gruppe] ?? []) linjer.push(l);
      linjer.push("");
      linjer.push(m.gruppe + (m.gruppe.endsWith("stikk 3") ? "   (KONTROLL)" : ""));
      linjer.push("-".repeat(bredde + kol * kolonner.length));
      rad("", kolonner.map((k) => k.slice(0, kol - 2)));
      forrigeGruppe = m.gruppe;
    }
    const prøver = profiler.map((p) => m.uttrekk(p));
    rad(`  ${m.navn}`, prøver.map((p) => fmt(p, m.slag)));
    rad("    n", prøver.map((p) => (p.n === 0 ? "–" : `${p.n}${p.n < TYNN_N ? " *" : ""}`)));

    const fasit = prøver[0]!;
    for (let i = 1; i < profiler.length; i++) {
      const p = prøver[i]!;
      if (p.n === 0 || fasit.n === 0) continue;
      funn.push({
        gruppe: m.gruppe, navn: m.navn, kandidat: kolonner[i]!, erBrudd: m.erBrudd,
        mester: fasit.verdi, kand: p.verdi, avvik: p.verdi - fasit.verdi,
        n: p.n, nMester: fasit.n, z: zVerdi(p, fasit), slag: m.slag,
      });
    }
  }

  // --- Hvor mange stillinger fantes det i det hele tatt? -------------------
  // Rene stillingstall: identiske i alle kolonnene, så MesterAI-profilen holder.
  const g0 = profiler[0]!;
  linjer.push("");
  linjer.push("");
  linjer.push("=== STILLINGSGRUNNLAGET (likt i alle kolonnene) ===");
  linjer.push("");
  linjer.push(
    `  BRUDD 1  anledninger: ${g0.brudd1.anledning}` +
      `   kunne slå: ${g0.brudd1.kanSlaa}` +
      `   til å unngå: ${g0.brudd1.unngaaelig}` +
      `   garanti å drepe: ${g0.brudd1.garantiAaDrepe}` +
      `   ess-på-konge: ${g0.brudd1.essKongeAnledning}`,
  );
  for (let i = 0; i < MAKKERSTIKK.length; i++) {
    linjer.push(
      `  BRUDD 2  makkerutspill i stikk ${MAKKERSTIKK[i]! + 1}: ${g0.brudd2[i]!.utspill}`,
    );
  }

  const fnavn = (v: number, slag: string): string =>
    slag === "andel" ? `${(100 * v).toFixed(0)} %` : v.toFixed(2);

  // --- Funnlista: bruddradene først, størst avvik øverst -------------------
  const relevante = funn.filter((f) => Number.isFinite(f.z));
  const rangerte = relevante.slice().sort((a, b) => {
    if (a.erBrudd !== b.erBrudd) return a.erBrudd ? -1 : 1;
    return Math.abs(b.z) - Math.abs(a.z);
  });

  linjer.push("");
  linjer.push("");
  linjer.push("=== FUNN: bruddradene først, deretter største avvik ===");
  linjer.push("");
  linjer.push("Sortert på |z| = avviket målt i standardfeil. z er regnet UPARRET og er");
  linjer.push("derfor et NEDRE anslag – stillingene er identiske, så den virkelige");
  linjer.push("presisjonen er bedre. Tommelfinger: |z| < 2 er støy, |z| > 4 er reelt.");
  linjer.push(`Rader med n < ${TYNN_N} er merket USIKKER og skal ikke leses som funn.`);
  linjer.push("");
  for (const f of rangerte) {
    const retning = f.avvik > 0 ? "MER" : "MINDRE";
    linjer.push(
      `${f.erBrudd ? "BRUDD " : "      "}|z| ${Math.abs(f.z).toFixed(1).padStart(5)}  ` +
        `${f.kandidat} ${retning.padEnd(6)} ${f.gruppe} / ${f.navn}: ` +
        `${fnavn(f.kand, f.slag)} mot MesterAIs ${fnavn(f.mester, f.slag)} ` +
        `(avvik ${f.avvik > 0 ? "+" : ""}${fnavn(f.avvik, f.slag)}, n=${f.n})` +
        (f.n < TYNN_N || f.nMester < TYNN_N ? "  ← USIKKER (n < 50)" : ""),
    );
  }

  const feil = profiler.map((p, i) => `${kolonner[i]}: ${p.feil}`).join(", ");
  linjer.push("");
  linjer.push(`Beslutninger som kastet unntak: ${feil}`);
  linjer.push("");

  const json = {
    tid: new Date().toISOString(),
    runder,
    sekunder: Math.round(sekunder),
    merke,
    froeBase: frøBase,
    maksRunderPerKamp,
    mesterOppsett: låsteVerdener > 0 ? { verdener: låsteVerdener } : { ms: tidMs },
    kolonner,
    tynnN: TYNN_N,
    feil: profiler.map((p) => p.feil),
    stillingsgrunnlag: {
      brudd1: {
        anledning: g0.brudd1.anledning,
        kanSlaa: g0.brudd1.kanSlaa,
        unngaaelig: g0.brudd1.unngaaelig,
        garantiAaDrepe: g0.brudd1.garantiAaDrepe,
        essKongeAnledning: g0.brudd1.essKongeAnledning,
      },
      brudd2: MAKKERSTIKK.map((st, i) => ({ stikk: st + 1, utspill: g0.brudd2[i]!.utspill })),
    },
    maalinger: målinger.map((m) => ({
      gruppe: m.gruppe,
      navn: m.navn,
      slag: m.slag,
      erBrudd: m.erBrudd,
      per: profiler.map((p, i) => {
        const pr = m.uttrekk(p);
        return { kandidat: kolonner[i], verdi: pr.n === 0 ? null : pr.verdi, n: pr.n };
      }),
    })),
    funn: rangerte.map((f) => ({ ...f, usikker: f.n < TYNN_N || f.nMester < TYNN_N })),
    // Rå tellere per kandidat: enhver ny rad kan regnes ut i ettertid uten å
    // kjøre MesterAI på nytt – de timene er dyre.
    raaProfiler: profiler.map((p, i) => ({ kandidat: kolonner[i], ...p })),
  };

  return { txt: linjer.join("\n"), json };
}

// --- Hovedløkka -------------------------------------------------------------

async function hoved(): Promise<void> {
  const adapter = new Adapter(adapterKmd);
  const alleSeter = [0, 1, 2, 3];
  await adapter.send({
    type: "init",
    mesterSeter: alleSeter,
    tidsbudsjettMs: låsteVerdener > 0 ? 3_600_000 : tidMs,
    ...(låsteVerdener > 0 ? { minVerdener: låsteVerdener, maksVerdener: låsteVerdener } : {}),
  });

  mkdirSync(dirname(utBase), { recursive: true });
  console.log(
    `To konvensjonsbrudd mot MesterAI: ${målRunder} runder, ` +
      (låsteVerdener > 0 ? `${låsteVerdener} verdener (låst)` : `${tidMs} ms per kortvalg`) +
      `\nKolonner: ${kolonner.join(", ")}` +
      `\n→ ${utBase}.txt / ${utBase}.json\n`,
  );

  const profiler = [nyProfil(), ...kandidater.map(() => nyProfil())];
  const start = Date.now();
  let ferdigeRunder = 0;

  const skrivUt = (): void => {
    const { txt, json } = bygdRapport(profiler, ferdigeRunder, (Date.now() - start) / 1000);
    writeFileSync(`${utBase}.txt`, txt + "\n");
    writeFileSync(`${utBase}.json`, JSON.stringify(json, null, 2) + "\n");
  };

  for (let kamp = 0; ferdigeRunder < målRunder; kamp++) {
    const frø = frøBase + kamp;
    await adapter.send({ type: "nyKamp", mesterSeter: alleSeter });
    for (const k of kandidater) k.nyKamp(frø * 4 + 1);

    let state = opprettSpill({}, frø);
    await adapter.send(rundeStart(state));

    let vakt = 0;
    while (
      state.fase !== "FERDIG" &&
      state.rundeNr < maksRunderPerKamp &&
      ferdigeRunder < målRunder &&
      vakt++ < 20_000
    ) {
      if (state.fase === "RUNDE_SLUTT") {
        const res = utfør(state, { type: "NESTE" });
        state = res.state;
        for (const h of res.hendelser) if (h.type === "NY_RUNDE") await adapter.send(rundeStart(state));
        continue;
      }

      const sete = state.fase === "VRAK" || state.fase === "VELG" ? state.budvinner! : state.iTur!;

      // 1) MesterAIs beslutning i DENNE stillingen – hentes, men ikke utført ennå.
      const svar = await adapter.send({ type: "beslutt", sete });
      const mesterH = handlingFraJson(svar.handling!);

      // 2) Alle kolonnene svarer på nøyaktig den samme stillingen. Kandidatene
      //    spørres i ALLE faser, ikke bare de målte, så den interne
      //    kamptilstanden deres får samme kallsekvens som i den brede profilen.
      const buf: Rullebuffer = new Map();
      registrer(profiler[0]!, state, sete, mesterH, buf);
      for (let i = 0; i < kandidater.length; i++) {
        const p = profiler[i + 1]!;
        try {
          registrer(p, state, sete, kandidater[i]!.velg(state), buf);
        } catch {
          p.feil++;
        }
      }

      // 3) MesterAIs valg utføres: linja er MesterAIs, alltid.
      const res = utfør(state, mesterH);
      state = res.state;
      const ok = await adapter.send({ type: "handling", handling: handlingTilJson(mesterH) });
      sjekkSynk(state, ok, `runde ${state.rundeNr}, ${mesterH.type} fra sete ${sete}`);

      for (const h of res.hendelser) {
        if (h.type !== "RUNDE_SLUTT") continue;
        ferdigeRunder++;
        const r = h.resultat;
        skrivUt();
        console.log(
          `runde ${ferdigeRunder}/${målRunder} (frø ${frø}, kamp-runde ${state.rundeNr}): ` +
            `budvinner ${r.budvinner} meldte ${r.melding.type === "tall" ? r.melding.bud : r.melding.type}, ` +
            `tok ${r.lagStikk} – ${((Date.now() - start) / 60000).toFixed(1)} min brukt`,
        );
      }
      for (const h of res.hendelser) if (h.type === "NY_RUNDE") await adapter.send(rundeStart(state));
    }
  }

  skrivUt();
  adapter.stopp();
  console.log(`\nFerdig etter ${((Date.now() - start) / 60000).toFixed(1)} min → ${utBase}.txt`);
}

hoved().catch((feil: unknown) => {
  console.error(feil);
  process.exit(1);
});
