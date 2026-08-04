/**
 * MESTERAIS LEKKASJER – hvor spiller den suboptimalt, og HVA KOSTER DET?
 *
 * PREMISSET (Arvinds observasjon). Vi har behandlet MesterAI som taket. Den er
 * ikke optimalt. `analyse/mesterai-atferd2.txt` viser at den tar stikket den
 * kunne ta i 90 %, lar sitt eget etterlyste kort stå i 93 %, og trumfer inn ved
 * renons i 72 %. Ingen av de tallene er logisk nødvendige. NevroHjerne klarer
 * 99 % på etterlyst-konvensjonen. Tallene er altså ikke en øvre grense – de er
 * kandidater til lekkasjer.
 *
 * MEN EN ANDEL ER IKKE EN LEKKASJE. At MesterAI lot være å ta et stikk kan
 * være en bevisst ofring. Skriptet her svarer derfor på det eneste spørsmålet
 * som betyr noe: HVA KOSTET DET? Ikke «hvor ofte avviker den fra en regel»,
 * men «hvor mye taper den på å gjøre det».
 *
 * ------------------------------------------------------------------------
 * METODEN – parret pris, ikke parret atferd
 * ------------------------------------------------------------------------
 * `examples/mesterai-atferd.ts` setter kandidatene opp mot MesterAI i de samme
 * stillingene. Her er det ingen kandidater. MesterAI besetter alle fire seter
 * og driver spillet; i hver stilling der en av lekkasjekandidatene under kan
 * OPPSTÅ, prises MesterAIs eget valg mot det alternativet situasjonen peker på:
 *
 *   1. Trekk 2K verdener forenlige med det SETET selv har sett
 *      (`trekkVerdener` → `trekkVerdenBelief`). Skjult informasjon forblir
 *      skjult; verdenene trekkes ÉN gang og brukes på begge grenene.
 *   2. Spill runden ferdig fra begge grenene i NØYAKTIG de samme verdenene,
 *      med NevroHjerne i alle fire seter (deterministisk, så eneste
 *      støykilden er verdenstrekningen).
 *   3. Δ = verdi(alternativ) − verdi(MesterAIs valg), målt både i POENG
 *      (egne minus snittet av de tre andre – samme differanse som benken) og i
 *      LAGETS STIKK, hentet fra den samme utspillingen.
 *
 * Δ > 0 betyr at MesterAI tapte på sitt valg. Δ ≈ 0 eller Δ < 0 betyr at
 * «avviket» var riktig – en bevisst ofring, ikke en tabbe. Fordi begge grenene
 * evalueres i de samme verdenene, er sammenlikningen parret og støyen faller
 * bort i differansen.
 *
 * HVORFOR SINGLE DUMMY OG IKKE DOBBELT-DUMMY. Målt gjennom godkjenningsporten
 * (`docs/moe2.md`): SD-kortspill korrelerer +0,718 med poeng, DD-kortspill
 * −0,609 – feil fortegn. DD ser hvem som sitter med hva og setter opp linjer
 * som bare virker mot perfekt forsvar. `src/solver/dds.ts` håndhever dessuten
 * ikke MAKKERPLIKTEN, som er nøyaktig regelen åpningskonvensjonen hviler på.
 * Utspillingen her går gjennom `utfør`/`lovligeKort` og er regelriktig.
 *
 * ------------------------------------------------------------------------
 * SELEKSJONSSKJEVHET – den fella hele målingen kunne gått i
 * ------------------------------------------------------------------------
 * For de FORHÅNDSDEFINERTE alternativene (situasjonene 1–5 og 8) er det ingen
 * seleksjon: alternativet følger av stillingen, ikke av evalueringen. Da er den
 * sammenslåtte differansen over alle 2K verdenene forventningsrett.
 *
 * For det UDEFINERTE søket (situasjon 7, «anger») er det seleksjon: å velge
 * argmax over støyete estimater og så rapportere det samme estimatet gir alltid
 * et positivt tall, også når alle kortene er like gode. Derfor kryssvalideres
 * det: verdenene deles i to halvdeler A og B, det beste kortet VELGES på A og
 * MÅLES på B (og omvendt). Da er tallet forventningsrett også der.
 *
 * KONTROLLRADER – og de er også instrumentets EGEN prøve. I stillingene der
 * MesterAI gjorde det konvensjonelle, prises avviket den IKKE tok: den ville
 * dukket i stedet for å ta stikket, brent det DYRESTE kortet på et garantert
 * stikk, kastet av i stedet for å trumfe inn, revet ned sitt eget etterlyste
 * kort. Alle fire er opplagte feil. Kommer de ikke ut som tydelig NEGATIVE Δ,
 * ser ikke fasiten forskjell på godt og dårlig i den situasjonstypen – og da
 * betyr lekkasjeraden over heller ingenting. Kontrollen er altså ikke pynt;
 * den er forutsetningen for å lese lekkasjeraden i det hele tatt.
 *
 * ------------------------------------------------------------------------
 * SITUASJONENE SOM MÅLES
 * ------------------------------------------------------------------------
 *  1. `aapning-etterlyst`   stikk 1, spillefører: utspillet river ned det
 *                           etterlyste kortet, enda et lovlig kort ville latt
 *                           det stå. Alternativ: det HØYESTE kortet som lar det
 *                           stå (så konvensjonen holdes uten å kaste bort en
 *                           lav trumf man kan trenge senere).
 *  2. `ikke-tatt-stikk`     motstander leder stikket, et lovlig kort ville tatt
 *                           det, MesterAI tok det ikke. Alternativ: det
 *                           billigste kortet som tar stikket.
 *  3. `renons-ikke-trumfet` renons i utspilt farge, motstander leder, en trumf
 *                           ville tatt stikket, MesterAI kastet av i stedet.
 *                           (Delmengde av 2, men egen rad – trumfvalget er en
 *                           annen avveining enn en vanlig overtakelse.)
 *  4. `garantert-dyrt`      medspiller leder et stikk som er GARANTERT lagets
 *                           (både i fasit og synlig for spilleren), og MesterAI
 *                           legger noe dyrere enn det billigste lovlige.
 *                           Alternativ: det billigste lovlige.
 *  5. `trumf-ikke-lengst`   budvinneren velger en trumffarge som ikke er hans
 *                           lengste. Alternativ: samme etterlysningsnivå i den
 *                           lengste fargen.
 *  6. `bud-ett-hakk-opp/ned` DETERMINISTISK etterpåklokskap: med stikktallet
 *                           laget faktisk tok, hva ville poengene blitt med
 *                           budet ett hakk opp eller ned? Svarer på om den byr
 *                           systematisk for lavt. Spillet holdes fast – se
 *                           kommentaren over `budEtterpåklokskap`.
 *  7. `anger`               sampled kortbeslutning uten hypotese: et utvalg av
 *                           de lovlige kortene vurderes, og kryssvalidert anger
 *                           måles. Det er kartet som finner lekkasjer vi ikke
 *                           gjettet på.
 *  8. `vrak-honnoer`        budvinneren vraker et ess eller en konge.
 *                           Alternativ: bytt honnøren mot det laveste kortet
 *                           han beholdt.
 *
 * ------------------------------------------------------------------------
 * KJØRING
 * ------------------------------------------------------------------------
 *   node examples/mesterai-lekkasjer.ts --runder 300 \
 *        --adapter wsl:/home/arvind/arena-adapter/.build/release/adapter
 *
 * | Flagg | Standard | Betydning |
 * |---|---|---|
 * | `--runder` | 300 | antall runder |
 * | `--froe` | 660000 | frøbase; kamp k bruker frø `froe + k` (samme som atferd2) |
 * | `--maksRunder` | 12 | runder per kamp |
 * | `--ms` | 450 | MesterAIs tidsbudsjett per kortvalg |
 * | `--verdener` | – | låser MesterAIs min/maksVerdener; gjør den lastuavhengig |
 * | `--sd` | 16 | K: halve verdensutvalget. Prisingen bruker 2K verdener. |
 * | `--anger` | 3 | antall sampled kortbeslutninger per runde til situasjon 7 |
 * | `--kontroll` | 0.3 | andel av de ikke-utløste stillingene som kontrollmåles |
 * | `--adapter` | arena/adapter/.build/release/adapter | adapterbinær, `wsl:` støttes |
 * | `--ut` | analyse/mesterai-lekkasjer | skriver `<ut>.txt` og `<ut>.json` |
 * | `--merke` | "" | fritekst om maskinlast, skrives i hodet |
 *
 * MESTERAI ER TIDSBUDSJETTERT. På en travel maskin rekker den færre verdener på
 * de samme 450 ms og spiller svakere, uten at noe røper det. Alle lekkasjer
 * målt med `--ms` er derfor ØVRE anslag for en MesterAI på en ledig maskin.
 * Kjør den samme målingen med `--verdener N` for et lastuavhengig tall.
 *
 * VARIG UTDATA: `<ut>.txt` og `<ut>.json` skrives på nytt etter HVER runde, så
 * en avbrutt flertimerskjøring alltid etterlater en ferdig regnet rapport.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { FARGER, likeKort, type Farge, type Kort } from "../src/kort.ts";
import {
  lovligeEtterlys,
  lovligeKort,
  opprettSpill,
  stikkvinner,
  utfør,
  type GameState,
  type Handling,
} from "../src/motor.ts";
import { MINSTE_TALLBUD, beregnPoeng, type RundeResultat } from "../src/regler.ts";
// Garantien, prisen og åpningskonvensjonen bor i src/moe2/synlig.ts – samme kode
// som atferdsprofilen og konvensjonsvakten bruker. To kopier ville gjort tallene
// uforenlige, og det er nettopp forenligheten som er poenget med målingen.
import {
  billigste,
  etterlystTarStikket,
  garantertFasit,
  garantertSynlig,
  pris,
} from "../src/moe2/synlig.ts";
import { trekkVerdener, vurderSD } from "../src/moe2/sdkort.ts";
import { NevroAgent } from "../src/nevro/index.ts";
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
const K = flagg("sd", 16);
const angerPerRunde = flagg("anger", 3);
const kontrollAndel = flagg("kontroll", 0.3);
const adapterSti = tekstFlagg("adapter", "arena/adapter/.build/release/adapter");
const utBase = tekstFlagg("ut", "analyse/mesterai-lekkasjer");
const merke = tekstFlagg("merke", "");

let adapterKmd: AdapterKommando;
try {
  adapterKmd = løsAdapter(adapterSti);
} catch (feil) {
  console.error(feil instanceof Error ? feil.message : String(feil));
  process.exit(1);
}

// --- Determinisme -----------------------------------------------------------

/** xorshift32 – samme generator som dds.ts bruker til Zobrist. */
function lagRng(frø: number): () => number {
  let a = (frø >>> 0) || 0x9e3779b9;
  return () => {
    a ^= a << 13;
    a >>>= 0;
    a ^= a >>> 17;
    a ^= a << 5;
    a >>>= 0;
    return a / 4_294_967_296;
  };
}

/** Motstandermodellen som spiller runden ferdig. Deterministisk. */
const motpart = new NevroAgent();

// --- Utfallsmålene ----------------------------------------------------------

/**
 * Lagets stikk i sluttstillingen, sett fra `spiller`.
 *
 * «Laget» avgjøres på fasit (budvinner + makker mot de andre). Det er lov her:
 * dette er en MÅLING av utfallet, ikke informasjon noen agent får se.
 */
function lagStikkFor(s: GameState, spiller: number): number {
  const bv = s.budvinner;
  const mk = s.makker;
  const erBudlag = (p: number): boolean => p === bv || p === mk;
  const megBudlag = erBudlag(spiller);
  let n = 0;
  for (let p = 0; p < s.antallSpillere; p++) {
    if (erBudlag(p) === megBudlag) n += s.stikkVunnet[p] ?? 0;
  }
  return n;
}

/** Egne poeng minus snittet av de tre andres – samme differanse som benken. */
function poengFor(s: GameState, spiller: number): number {
  const egne = s.totalPoeng[spiller] ?? 0;
  return egne - (s.totalPoeng.reduce((a, b) => a + b, 0) - egne) / 3;
}

interface Verdi2 {
  readonly poeng: number;
  readonly stikk: number;
  readonly n: number;
}

/**
 * SD-verdien av hver kandidathandling i NØYAKTIG de samme verdenene, i BÅDE
 * poeng og stikk.
 *
 * `vurderSD` tar ett utfallsmål. Stikktallet hentes derfor ut gjennom den samme
 * `mål`-funksjonen, som skriver det til en logg ved siden av. Kallrekkefølgen i
 * `vurderSD` er `for hver handling { for hver verden { … } }` og er den eneste
 * antakelsen dette hviler på; den er kontrollert med `n`-feltet under.
 */
function sdVerdier(
  state: GameState,
  sete: number,
  handlinger: readonly Handling[],
  verdener: readonly (readonly number[][])[],
): Verdi2[] {
  if (verdener.length === 0 || handlinger.length === 0) return [];
  const stikkLogg: number[] = [];
  const vurdert = vurderSD(state, sete, motpart, handlinger, {
    verdener: verdener.length,
    rng: () => 0, // ubrukt: verdenerHender er satt
    verdenerHender: verdener,
    mål: (slutt, spiller) => {
      stikkLogg.push(lagStikkFor(slutt, spiller));
      return poengFor(slutt, spiller);
    },
  });
  if (vurdert.length !== handlinger.length) return [];
  if (stikkLogg.length !== handlinger.length * verdener.length) {
    throw new Error(
      `sdVerdier: forventet ${handlinger.length * verdener.length} utspillinger, fikk ${stikkLogg.length}`,
    );
  }
  return vurdert.map((v, i) => {
    let sum = 0;
    for (let w = 0; w < verdener.length; w++) sum += stikkLogg[i * verdener.length + w]!;
    return { poeng: v.verdi, stikk: sum / verdener.length, n: v.n };
  });
}

// --- Registeret -------------------------------------------------------------

type Rolle = "spillefører" | "makker" | "forsvarer";

/** Én priset stilling. Alt som trengs for å regne enhver ny rad i ettertid. */
interface Post {
  readonly situasjon: string;
  /** `true` = MesterAI gjorde det avvikende, `false` = kontrollrad. */
  readonly utløst: boolean;
  readonly rolle: Rolle | "-";
  /** Stikknummer (0-indeksert) der det gir mening, ellers −1. */
  readonly stikk: number;
  readonly runde: number;
  /** Δ poeng = alternativ − MesterAI. Positivt = MesterAI tapte på sitt valg. */
  readonly dPoeng: number;
  /** Δ lagstikk, samme fortegn. */
  readonly dStikk: number;
  /** Antall verdener bak tallet. */
  readonly nVerdener: number;
  /** Valøren MesterAI la (2–14), eller budet. −1 der det ikke gir mening. */
  readonly valør: number;
  /** Valøren alternativet ville lagt. −1 der det ikke gir mening. */
  readonly altValør: number;
  /**
   * Antall lovlige kort i stillingen. Forgreningsgraden er den beste billige
   * målestokken på hvor KOMPLEKS stillingen er, og MesterAI er tidsbudsjettert:
   * rekker søket ikke fram, skal lekkasjen vokse med dette tallet.
   */
  readonly lovlige: number;
  readonly merknad?: string;
}

const poster: Post[] = [];
/** Hvor ofte stillingen i det hele tatt oppsto. Nevner for frekvensen. */
const anledninger: Record<string, number> = {};
/** Hvor ofte MesterAI gjorde det avvikende i den stillingen. */
const utløsninger: Record<string, number> = {};

const tell = (bok: Record<string, number>, nøkkel: string): void => {
  bok[nøkkel] = (bok[nøkkel] ?? 0) + 1;
};

// --- Situasjonshjelpere -----------------------------------------------------

function rollenTil(s: GameState, sete: number): Rolle {
  if (sete === s.budvinner) return "spillefører";
  if (sete === s.makker) return "makker";
  return "forsvarer";
}

/** Lagets seter i fasit. Måling, ikke agentinformasjon. */
function våreSeter(s: GameState, sete: number): number[] {
  const budlag = [s.budvinner, s.makker].filter((x): x is number => x !== null);
  if (budlag.includes(sete)) return budlag;
  return Array.from({ length: s.antallSpillere }, (_, i) => i).filter((i) => !budlag.includes(i));
}

/** Ville `kort` vunnet stikket slik bordet står nå? */
function vinnerNå(s: GameState, kort: Kort, sete: number): boolean {
  return stikkvinner(s.bord.concat({ spiller: sete, kort }), s.trumf!) === sete;
}

const lengder = (h: readonly Kort[]): Record<Farge, number> => {
  const t: Record<Farge, number> = { S: 0, H: 0, R: 0, K: 0 };
  for (const k of h) t[k.farge]++;
  return t;
};

// --- Prisingen --------------------------------------------------------------

/**
 * Priser ETT forhåndsdefinert alternativ mot MesterAIs valg, i 2K verdener.
 * Ingen seleksjon, så tallet er forventningsrett.
 */
function prisAlternativ(
  state: GameState,
  sete: number,
  valgt: Handling,
  alternativ: Handling,
  rng: () => number,
): { dPoeng: number; dStikk: number; n: number } | null {
  const verdener = trekkVerdener(state, sete, 2 * K, rng);
  if (verdener.length === 0) return null;
  const v = sdVerdier(state, sete, [valgt, alternativ], verdener);
  if (v.length !== 2) return null;
  return {
    dPoeng: v[1]!.poeng - v[0]!.poeng,
    dStikk: v[1]!.stikk - v[0]!.stikk,
    n: verdener.length,
  };
}

/**
 * KRYSSVALIDERT ANGER over en hel kandidatliste.
 *
 * Verdenene deles i to halvdeler. Det beste kortet VELGES på den ene og MÅLES
 * på den andre, begge veier, og snittet rapporteres. Uten den delingen ville
 * tallet vært argmax over støy og alltid positivt – også for en optimal spiller.
 */
function kryssAnger(
  state: GameState,
  sete: number,
  handlinger: readonly Handling[],
  mesterIndeks: number,
  rng: () => number,
): { dPoeng: number; dStikk: number; n: number } | null {
  if (handlinger.length < 2) return null;
  const alle = trekkVerdener(state, sete, 2 * K, rng);
  if (alle.length < 4) return null;
  const halv = Math.floor(alle.length / 2);
  const A = alle.slice(0, halv);
  const B = alle.slice(halv, 2 * halv);
  const vA = sdVerdier(state, sete, handlinger, A);
  const vB = sdVerdier(state, sete, handlinger, B);
  if (vA.length !== handlinger.length || vB.length !== handlinger.length) return null;

  const argmax = (v: readonly Verdi2[]): number => {
    let beste = 0;
    for (let i = 1; i < v.length; i++) if (v[i]!.poeng > v[beste]!.poeng) beste = i;
    return beste;
  };
  const iA = argmax(vA);
  const iB = argmax(vB);
  // Valgt på A, målt på B – og omvendt. Snittet av de to.
  const dP = (vB[iA]!.poeng - vB[mesterIndeks]!.poeng + (vA[iB]!.poeng - vA[mesterIndeks]!.poeng)) / 2;
  const dS = (vB[iA]!.stikk - vB[mesterIndeks]!.stikk + (vA[iB]!.stikk - vA[mesterIndeks]!.stikk)) / 2;
  return { dPoeng: dP, dStikk: dS, n: 2 * halv };
}

// --- Klassifisering av ÉN kortbeslutning ------------------------------------

/** Et alternativ situasjonen peker på, med etiketten det skal føres under. */
interface Kandidatsak {
  readonly situasjon: string;
  readonly utløst: boolean;
  readonly alternativ: Kort;
  readonly merknad?: string;
}

/**
 * Finner alle situasjonene stillingen reiser, og hvilket alternativ hver av dem
 * peker på. Anledningen telles her; prisingen skjer i kalleren.
 *
 * Rekkefølgen er bevisst: en stilling kan reise flere situasjoner samtidig (en
 * renons som ikke ble trumfet er også et stikk som ikke ble tatt), og begge
 * radene skal ha den. Prisingen deduperes på alternativkortet, så en stilling
 * som peker på det samme kortet to ganger koster bare én utspilling.
 */
function situasjoner(s: GameState, sete: number, kort: Kort): Kandidatsak[] {
  const ut: Kandidatsak[] = [];
  const trumf = s.trumf!;
  const lovlige = lovligeKort(s, sete);
  const rolle = rollenTil(s, sete);
  const våre = våreSeter(s, sete);

  // --- 1. Åpningskonvensjonen ---------------------------------------------
  if (
    s.bord.length === 0 &&
    s.stikkSpilt === 0 &&
    sete === s.budvinner &&
    s.etterlyst !== null &&
    s.makker !== null &&
    s.makker !== sete
  ) {
    const lar = lovlige.filter((k) => etterlystTarStikket(s, sete, k));
    const river = lovlige.filter((k) => !etterlystTarStikket(s, sete, k));
    if (lar.length > 0 && river.length > 0) {
      tell(anledninger, "aapning-etterlyst");
      const stod = etterlystTarStikket(s, sete, kort);
      if (!stod) {
        tell(utløsninger, "aapning-etterlyst");
        // Det HØYESTE kortet som fortsatt lar det etterlyste stå: konvensjonen
        // holdes uten å kaste bort en lav trumf man kan trenge senere. MesterAI
        // spiller selv sjelden sin laveste (23 %), så dette er dens egen stil.
        const alt = lar.reduce((a, b) => (b.verdi > a.verdi ? b : a));
        ut.push({ situasjon: "aapning-etterlyst", utløst: true, alternativ: alt });
      } else {
        // Kontroll: hva ville bruddet ha kostet i nøyaktig denne stillingen?
        const alt = river.reduce((a, b) => (pris(b, trumf) < pris(a, trumf) ? b : a));
        ut.push({ situasjon: "aapning-etterlyst", utløst: false, alternativ: alt });
      }
    }
  }

  if (s.bord.length === 0) return ut;

  const ledFarge = s.bord[0]!.kort.farge;
  const leder = stikkvinner(s.bord, trumf);
  const motstanderLeder = leder !== sete && !våre.includes(leder);
  const medspillerLeder = leder !== sete && våre.includes(leder);
  const vinnende = lovlige.filter((k) => vinnerNå(s, k, sete));

  // --- 2/3. Stikk som kunne vært tatt --------------------------------------
  if (motstanderLeder && vinnende.length > 0) {
    const sisteHånd = s.bord.length === s.antallSpillere - 1;
    const tokDet = vinnerNå(s, kort, sete);
    const merknad = sisteHånd ? "siste hånd" : "flere igjen";

    tell(anledninger, `ikke-tatt-stikk/${rolle}`);
    tell(anledninger, "ikke-tatt-stikk");
    tell(anledninger, `ikke-tatt-stikk/${merknad}`);
    if (!tokDet) {
      tell(utløsninger, `ikke-tatt-stikk/${rolle}`);
      tell(utløsninger, "ikke-tatt-stikk");
      tell(utløsninger, `ikke-tatt-stikk/${merknad}`);
      const alt = billigste(vinnende, trumf);
      ut.push({ situasjon: "ikke-tatt-stikk", utløst: true, alternativ: alt, merknad });
      ut.push({ situasjon: `ikke-tatt-stikk/${rolle}`, utløst: true, alternativ: alt, merknad });
      ut.push({ situasjon: `ikke-tatt-stikk/${merknad}`, utløst: true, alternativ: alt, merknad });
    } else {
      // NEGATIV KONTROLL. MesterAI TOK stikket. Hva ville det kostet å dukke?
      // Er instrumentet i det hele tatt i stand til å skille godt fra dårlig i
      // denne situasjonstypen, MÅ denne raden bli tydelig negativ. Blir den det
      // ikke, sier lekkasjeraden over heller ingenting.
      const duker = lovlige.filter((k) => !vinnerNå(s, k, sete));
      if (duker.length > 0) {
        const alt = billigste(duker, trumf);
        ut.push({ situasjon: "ikke-tatt-stikk", utløst: false, alternativ: alt, merknad });
        ut.push({ situasjon: `ikke-tatt-stikk/${rolle}`, utløst: false, alternativ: alt, merknad });
      }
    }

    // Renons i utspilt farge, og trumfen ville tatt stikket.
    const renons = !lovlige.some((k) => k.farge === ledFarge);
    const vinnendeTrumf = vinnende.filter((k) => k.farge === trumf);
    if (renons && vinnendeTrumf.length > 0 && lovlige.some((k) => k.farge !== trumf)) {
      tell(anledninger, "renons-ikke-trumfet");
      tell(anledninger, `renons-ikke-trumfet/${rolle}`);
      if (kort.farge !== trumf) {
        tell(utløsninger, "renons-ikke-trumfet");
        tell(utløsninger, `renons-ikke-trumfet/${rolle}`);
        const alt = billigste(vinnendeTrumf, trumf);
        ut.push({ situasjon: "renons-ikke-trumfet", utløst: true, alternativ: alt });
        ut.push({ situasjon: `renons-ikke-trumfet/${rolle}`, utløst: true, alternativ: alt });
      } else {
        // Negativ kontroll: den trumfet inn. Hva ville avkastet kostet?
        const avkast = lovlige.filter((k) => k.farge !== trumf);
        if (avkast.length > 0) {
          ut.push({ situasjon: "renons-ikke-trumfet", utløst: false, alternativ: billigste(avkast, trumf) });
        }
      }
    }
  }

  // --- 4. Garanterte stikk --------------------------------------------------
  if (medspillerLeder && garantertFasit(s, sete, våre) && garantertSynlig(s, sete, våre)) {
    const billig = billigste(lovlige, trumf);
    const kunneUnngåttTrumf = lovlige.some((k) => k.farge !== trumf);
    const kunneUnngåttHonnør = lovlige.some((k) => k.verdi < 13);
    tell(anledninger, "garantert-dyrt");
    tell(anledninger, `garantert-dyrt/${rolle}`);
    // Anledningen for delradene er stillingen, ikke valget: da blir andelen en
    // ekte rate og ikke 100 % per konstruksjon.
    if (kunneUnngåttTrumf) tell(anledninger, "garantert-brent-trumf");
    if (kunneUnngåttHonnør) tell(anledninger, "garantert-honnoer");
    if (pris(kort, trumf) > pris(billig, trumf)) {
      tell(utløsninger, "garantert-dyrt");
      tell(utløsninger, `garantert-dyrt/${rolle}`);
      ut.push({ situasjon: "garantert-dyrt", utløst: true, alternativ: billig });
      ut.push({ situasjon: `garantert-dyrt/${rolle}`, utløst: true, alternativ: billig });
      if (kort.farge === trumf && kunneUnngåttTrumf) {
        tell(utløsninger, "garantert-brent-trumf");
        ut.push({ situasjon: "garantert-brent-trumf", utløst: true, alternativ: billig });
      }
      if (kort.verdi >= 13 && kunneUnngåttHonnør) {
        tell(utløsninger, "garantert-honnoer");
        ut.push({ situasjon: "garantert-honnoer", utløst: true, alternativ: billig });
      }
    } else if (lovlige.length >= 2) {
      // NEGATIV KONTROLL. Den la ALT det billigste. Hva ville det dyreste
      // kostet? Dette er stedet instrumentet skal vise at det virker: å brenne
      // materiale på et stikk laget allerede har er den mest opplagte feilen
      // som finnes i spillet, og SD-fasiten må se den.
      const dyrest = lovlige.reduce((a, b) => (pris(b, trumf) > pris(a, trumf) ? b : a));
      ut.push({ situasjon: "garantert-dyrt", utløst: false, alternativ: dyrest });
      ut.push({ situasjon: `garantert-dyrt/${rolle}`, utløst: false, alternativ: dyrest });
    }
  }

  return ut;
}

// --- Budet: deterministisk etterpåklokskap ----------------------------------

/**
 * BYR MESTERAI FOR LAVT ELLER FOR HØYT?
 *
 * SD-prising av budet er IKKE mulig med `vurderSD`: i budrunden ligger
 * talongens fire kort fortsatt i `state.talong`, mens verdenstrekningen legger
 * dem i en «død» bin som ikke kommer tilbake. Byttes hendene da, står talongen
 * igjen fra den virkelige givingen og de samme kortene kan dukke opp to steder.
 * Forsøket ga «Kan ikke vrake samme kort to ganger», og det er en ekte grense i
 * `medVerden`, ikke en tilfeldighet – den er dokumentert der.
 *
 * Derfor måles budet i stedet DETERMINISTISK, i etterpåklokskap: med det
 * stikktallet laget FAKTISK tok, hva ville poengene blitt med budet ett hakk
 * opp eller ett hakk ned? `beregnPoeng` er den samme funksjonen motoren bruker,
 * så tallet er eksakt.
 *
 * FORBEHOLDET, og det er reelt: spillet holdes fast. Et høyere bud kan endre
 * hvordan runden spilles, og for MesterAI som er kontraktbevisst er det ikke
 * uvesentlig. Tallet svarer derfor på «var budet feil PRISET gitt det som
 * skjedde», ikke «hva ville skjedd om den bød høyere». Fortegnet over mange
 * runder er likevel informativt: byr den systematisk under det den tar, ligger
 * det poeng igjen på bordet uansett hvordan spillet hadde artet seg.
 */
function budEtterpåklokskap(s: GameState, r: RundeResultat): void {
  if (r.melding.type !== "tall") return;
  const felles = {
    regler: s.regler,
    antallStikk: s.giving.antallStikk,
    antallSpillere: s.antallSpillere,
    budvinner: r.budvinner,
    makker: r.makker,
    stikkPerSpiller: r.stikkVunnet,
  };
  const nå = beregnPoeng({ ...felles, melding: r.melding }).delta[r.budvinner] ?? 0;
  const legg = (navn: string, bud: number): void => {
    if (bud < MINSTE_TALLBUD || bud > s.giving.antallStikk) return;
    tell(anledninger, navn);
    tell(utløsninger, navn);
    const alt = beregnPoeng({ ...felles, melding: { type: "tall", bud } }).delta[r.budvinner] ?? 0;
    poster.push({
      situasjon: navn,
      utløst: true,
      rolle: "spillefører",
      stikk: -1,
      runde: 0,
      // Poengmålet er budvinnerens eget delta, ikke differansen mot de tre
      // andre: det er budet hans som prøves, og han er den eneste som bærer det.
      dPoeng: alt - nå,
      dStikk: 0,
      nVerdener: 1,
      valør: r.melding.bud,
      altValør: bud,
      lovlige: -1,
      merknad: "etterpåklokskap, spillet holdt fast",
    });
  };
  legg("bud-ett-hakk-opp", r.melding.bud + 1);
  legg("bud-ett-hakk-ned", r.melding.bud - 1);
}

// --- Rapporten --------------------------------------------------------------

interface Rad {
  readonly situasjon: string;
  readonly anledninger: number;
  readonly utløst: number;
  readonly andel: number;
  readonly n: number;
  readonly dPoeng: number;
  readonly sePoeng: number;
  readonly dStikk: number;
  readonly seStikk: number;
  readonly frekvens: number;
  readonly evPoeng: number;
  readonly evSePoeng: number;
  readonly evStikk: number;
  readonly evSeStikk: number;
  readonly usikker: boolean;
}

function snitt(v: readonly number[]): number {
  return v.length === 0 ? 0 : v.reduce((a, b) => a + b, 0) / v.length;
}
function standardfeil(v: readonly number[]): number {
  if (v.length < 2) return 0;
  const m = snitt(v);
  const varians = v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1);
  return Math.sqrt(varians / v.length);
}

function byggRader(runder: number, utløst: boolean): Rad[] {
  const nøkler = Array.from(new Set(poster.filter((p) => p.utløst === utløst).map((p) => p.situasjon)));
  const rader: Rad[] = [];
  for (const nøkkel of nøkler) {
    const rel = poster.filter((p) => p.utløst === utløst && p.situasjon === nøkkel);
    const dP = rel.map((p) => p.dPoeng);
    const dS = rel.map((p) => p.dStikk);
    const anl = anledninger[nøkkel] ?? 0;
    const utl = utløsninger[nøkkel] ?? 0;
    // Frekvensen er hvor ofte den PRISEDE hendelsen inntreffer per runde. For
    // kontrollradene er det ikke-utløsningene, som ikke er en lekkasje – der
    // står frekvensen bare som kontekst.
    const hendelser = utløst ? utl : Math.max(0, anl - utl);
    const frekvens = runder > 0 ? hendelser / runder : 0;
    rader.push({
      situasjon: nøkkel,
      anledninger: anl,
      utløst: utl,
      andel: anl > 0 ? utl / anl : 0,
      n: rel.length,
      dPoeng: snitt(dP),
      sePoeng: standardfeil(dP),
      dStikk: snitt(dS),
      seStikk: standardfeil(dS),
      frekvens,
      evPoeng: frekvens * snitt(dP),
      evSePoeng: frekvens * standardfeil(dP),
      evStikk: frekvens * snitt(dS),
      evSeStikk: frekvens * standardfeil(dS),
      usikker: rel.length < 50,
    });
  }
  return rader.sort((a, b) => Math.abs(b.evPoeng) - Math.abs(a.evPoeng));
}

const f = (x: number, d = 3): string => (Number.isFinite(x) ? x.toFixed(d) : "–");
const pst = (x: number): string => `${(x * 100).toFixed(0)} %`;

function bygdRapport(runder: number, sekunder: number): { txt: string; json: unknown } {
  const L: string[] = [];
  L.push("=== MESTERAIS LEKKASJER: hvor spiller den suboptimalt, og hva koster det? ===");
  L.push("");
  L.push(`Runder:            ${runder}`);
  L.push(`Frøbase:           ${frøBase} (${maksRunderPerKamp} runder per kamp)`);
  L.push(
    `MesterAI:          ${låsteVerdener > 0 ? `${låsteVerdener} verdener (låst, lastuavhengig)` : `${tidMs} ms per kortvalg`}, alle fire seter`,
  );
  L.push(`SD-prising:        ${2 * K} verdener per stilling, NevroHjerne spiller ut`);
  L.push(`Tidsbruk:          ${(sekunder / 60).toFixed(1)} min`);
  L.push(`Skrevet:           ${new Date().toISOString()}`);
  if (merke) L.push(`Merke:             ${merke}`);
  L.push("");
  L.push("Δ = SD-verdi(alternativ) − SD-verdi(MesterAIs valg), i NØYAKTIG de samme");
  L.push("verdenene. POSITIVT betyr at MesterAI tapte på sitt valg; nær null eller");
  L.push("negativt betyr at «avviket» var riktig – en ofring, ikke en tabbe.");
  L.push("");
  L.push("EV/runde = frekvens × Δ. Det er tallet som rangerer: en lekkasje som");
  L.push("oppstår i 2 % av rundene og koster 0,1 stikk er ikke verdt noe.");
  L.push("");
  L.push("Rader med n < 50 er merket USIKKER. «±» er standardfeilen til snittet.");
  L.push("");

  const skrivTabell = (tittel: string, rader: readonly Rad[]): void => {
    L.push(tittel);
    L.push("-".repeat(134));
    L.push(
      "  situasjon".padEnd(34) +
        "anledn".padStart(8) +
        "utløst".padStart(8) +
        "andel".padStart(8) +
        "n".padStart(6) +
        "Δpoeng".padStart(11) +
        "±".padStart(8) +
        "Δstikk".padStart(9) +
        "±".padStart(8) +
        "frek/rd".padStart(9) +
        "EVpoeng".padStart(10) +
        "±".padStart(8) +
        "EVstikk".padStart(9) +
        "±".padStart(8),
    );
    for (const r of rader) {
      L.push(
        `  ${r.situasjon}`.padEnd(34) +
          String(r.anledninger).padStart(8) +
          String(r.utløst).padStart(8) +
          pst(r.andel).padStart(8) +
          String(r.n).padStart(6) +
          f(r.dPoeng).padStart(11) +
          f(r.sePoeng).padStart(8) +
          f(r.dStikk).padStart(9) +
          f(r.seStikk).padStart(8) +
          f(r.frekvens, 2).padStart(9) +
          f(r.evPoeng).padStart(10) +
          f(r.evSePoeng).padStart(8) +
          f(r.evStikk).padStart(9) +
          f(r.evSeStikk).padStart(8) +
          (r.usikker ? "  ← USIKKER" : ""),
      );
    }
    L.push("");
  };

  const erSøk = (r: Rad): boolean => r.situasjon.startsWith("anger") || r.situasjon.startsWith("bud") || r.situasjon.startsWith("pass");
  const utløste = byggRader(runder, true);
  const kontroll = byggRader(runder, false);

  L.push("1) LEKKASJER MED HYPOTESE – MesterAI gjorde det avvikende. Sortert på |EV/runde|.");
  L.push("   Alternativet følger av stillingen, ikke av evalueringen, så Δ er");
  L.push("   forventningsrett: ingen argmax å bli lurt av.");
  L.push("");
  skrivTabell("", utløste.filter((r) => !erSøk(r)));

  L.push("2) KONTROLL – de SAMME situasjonene der MesterAI gjorde det konvensjonelle.");
  L.push("   Δ er da prisen på avviket den IKKE tok. Er lekkasjen ekte, skal");
  L.push("   kontrollraden ha MOTSATT fortegn av lekkasjeraden. Ligger begge nær");
  L.push("   null, er «regelen» ikke verdt noe i den stillingen.");
  L.push("");
  skrivTabell("", kontroll);

  L.push("3) UDEFINERT SØK – ingen hypotese, bare «hvor mye taper MesterAI på sitt");
  L.push("   eget valg?».");
  L.push("");
  L.push("   `anger` er KRYSSVALIDERT: beste kort velges på halve verdenene og");
  L.push("   måles på de andre, begge veier. Den måler derfor ikke anger mot et");
  L.push("   optimum, men mot ÉN konkret motkandidat – en SD-velger med de samme");
  L.push(`   ${2 * K} verdenene. Negativt Δ betyr at MesterAI slår den velgeren,`);
  L.push("   og det er i seg selv et svar: da kan ikke SD med dette budsjettet");
  L.push("   brukes til å lete opp lekkasjer i kortspillet dens.");
  L.push("   Her prises bare et UTVALG av beslutningene, mens frekvensen er den");
  L.push("   ekte raten per runde – derfor er n mye mindre enn «utløst», og");
  L.push("   EV-kolonnen er ganget opp ~40x. Les EV± før EV.");
  L.push("");
  L.push("   `bud-ett-hakk-opp/ned` er DETERMINISTISK etterpåklokskap på");
  L.push("   budvinnerens eget poengdelta, ikke SD. Med ±2n for et tallbud er");
  L.push("   fortegnet lett å lese: å by ett hakk opp koster −(4n+2) når det");
  L.push("   ryker og gir +2 når det holder. `ned` har det ekstra forbeholdet at");
  L.push("   budrunden holdes fast: med et lavere bud kunne en annen tatt");
  L.push("   kontrakten, så den raden er et tak, ikke et tilbud.");
  L.push("");
  skrivTabell("", utløste.filter(erSøk));

  L.push("LESEVEILEDNING");
  L.push("  Δpoeng er egne poeng minus snittet av de tre andres, målt over");
  L.push(`  ${2 * K} verdener. Δstikk er lagets stikk i den samme utspillingen.`);
  L.push("  FORBEHOLDET: fasiten er SD med NevroHjerne som utspiller. Den er");
  L.push("  godkjent gjennom porten (+0,718 mot poeng), men den er ikke Gud – en");
  L.push("  linje som bare betaler seg mot et sterkere forsvar enn NevroHjerne blir");
  L.push("  undervurdert her. Tallene er et anslag med kjent fortegn, ikke en dom.");
  const json = {
    runder,
    frøBase,
    maksRunderPerKamp,
    tidMs,
    låsteVerdener,
    sdVerdener: 2 * K,
    angerPerRunde,
    kontrollAndel,
    merke,
    sekunder,
    skrevet: new Date().toISOString(),
    anledninger,
    utløsninger,
    lekkasjer: utløste,
    kontroll,
    // Rå poster: enhver ny rad kan regnes ut i ettertid uten å kjøre på nytt.
    poster,
  };
  return { txt: L.join("\n"), json };
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
    `Lekkasjemåling mot MesterAI: ${målRunder} runder, ` +
      (låsteVerdener > 0 ? `${låsteVerdener} verdener (låst)` : `${tidMs} ms per kortvalg`) +
      `\nSD-prising: ${2 * K} verdener per stilling` +
      `\n→ ${utBase}.txt / ${utBase}.json\n`,
  );

  const start = Date.now();
  let ferdigeRunder = 0;
  let prisinger = 0;
  let prisefeil = 0;
  let sdSekunder = 0;

  const skrivUt = (): void => {
    const { txt, json } = bygdRapport(ferdigeRunder, (Date.now() - start) / 1000);
    writeFileSync(`${utBase}.txt`, txt + "\n");
    writeFileSync(`${utBase}.json`, JSON.stringify(json, null, 2) + "\n");
  };

  for (let kamp = 0; ferdigeRunder < målRunder; kamp++) {
    const frø = frøBase + kamp;
    await adapter.send({ type: "nyKamp", mesterSeter: alleSeter });

    let state = opprettSpill({}, frø);
    await adapter.send(rundeStart(state));

    // Deterministisk RNG per kamp: verdenene er reproduserbare.
    const rng = lagRng(frø * 7919 + 13);
    // Anger-samplingen: hver kortbeslutning trekkes uavhengig med sjansen
    // `anger/48`, og runden stopper når kvoten er tatt. 48 er antall
    // kortbeslutninger i en full runde, så forventet antall treffer kvoten.
    let angerTattIRunden = 0;

    let guard = 0;
    while (
      state.fase !== "FERDIG" &&
      state.rundeNr < maksRunderPerKamp &&
      ferdigeRunder < målRunder &&
      guard++ < 20_000
    ) {
      if (state.fase === "RUNDE_SLUTT") {
        const res = utfør(state, { type: "NESTE" });
        state = res.state;
        for (const h of res.hendelser) if (h.type === "NY_RUNDE") await adapter.send(rundeStart(state));

        angerTattIRunden = 0;
        continue;
      }

      const sete = state.fase === "VRAK" || state.fase === "VELG" ? state.budvinner! : state.iTur!;
      const svar = await adapter.send({ type: "beslutt", sete });
      const mesterH = handlingFraJson(svar.handling!);

      const t0 = Date.now();
      const legg = (
        situasjon: string,
        utløst: boolean,
        rolle: Rolle | "-",
        stikk: number,
        d: { dPoeng: number; dStikk: number; n: number },
        merknad?: string,
        valør = -1,
        altValør = -1,
        lovlige = -1,
      ): void => {
        poster.push({
          situasjon,
          utløst,
          rolle,
          stikk,
          runde: ferdigeRunder,
          dPoeng: d.dPoeng,
          dStikk: d.dStikk,
          nVerdener: d.n,
          valør,
          altValør,
          lovlige,
          ...(merknad ? { merknad } : {}),
        });
        prisinger++;
      };

      try {
        if (mesterH.type === "SPILL") {

          const rolle = rollenTil(state, sete);
          const saker = situasjoner(state, sete, mesterH.kort);
          // Dedupliser på alternativkortet: flere situasjoner kan peke på det
          // samme kortet, og da skal utspillingen bare gjøres én gang.
          const priset = new Map<string, { dPoeng: number; dStikk: number; n: number } | null>();
          for (const sak of saker) {
            if (kontrollAndel <= 0 && !sak.utløst) continue;
            if (!sak.utløst && rng() > kontrollAndel) continue;
            const id = `${sak.alternativ.farge}${sak.alternativ.verdi}`;
            if (!priset.has(id)) {
              priset.set(
                id,
                prisAlternativ(
                  state,
                  sete,
                  mesterH,
                  { type: "SPILL", spiller: sete, kort: sak.alternativ },
                  rng,
                ),
              );
            }
            const d = priset.get(id);
            if (d) {
              legg(
                sak.situasjon,
                sak.utløst,
                rolle,
                state.stikkSpilt,
                d,
                sak.merknad,
                mesterH.kort.verdi,
                sak.alternativ.verdi,
                lovligeKort(state, sete).length,
              );
            }
          }

          // --- 7. ANGER: sampled kortbeslutning uten hypotese ---------------
          //
          // TELLERNE GÅR PÅ HVER ENESTE BESLUTNING, prisingen bare på et utvalg.
          // Det er hele forskjellen mellom en riktig og en gal EV: frekvensen
          // skal være den EKTE raten av beslutninger per runde (~44), ikke
          // utvalgsraten. Utvalget er tilfeldig og uavhengig av stillingen, så
          // snitt-Δ fra utvalget generaliserer til alle beslutningene.
          const lovligeAlle = lovligeKort(state, sete);
          const bøtte =
            state.stikkSpilt <= 3 ? "stikk 1-4" : state.stikkSpilt <= 7 ? "stikk 5-8" : "stikk 9-12";
          // Egen bøtte på forgreningsgrad: er MesterAI svakest der den har
          // flest valg, er det tidsbudsjettet og ikke policyen som lekker.
          const grein =
            lovligeAlle.length <= 3 ? "2-3 kort" : lovligeAlle.length <= 6 ? "4-6 kort" : "7+ kort";
          const angerNøkler = ["anger", `anger/${rolle}`, `anger/${bøtte}`, `anger/${grein}`];
          if (lovligeAlle.length >= 2) {
            for (const n of angerNøkler) {
              tell(anledninger, n);
              tell(utløsninger, n);
            }
          }
          if (
            angerPerRunde > 0 &&
            lovligeAlle.length >= 2 &&
            angerTattIRunden < angerPerRunde &&
            rng() < angerPerRunde / 44
          ) {
            angerTattIRunden++;
            // Tak på kandidatlisten: MesterAIs kort pluss et jevnt spredt
            // utvalg av resten, sortert på pris, så listen dekker spennet.
            const MAKS = 6;
            const andre = lovligeAlle
              .filter((k) => !likeKort(k, mesterH.kort))
              .sort((a, b) => pris(a, state.trumf!) - pris(b, state.trumf!));
            const valgte: Kort[] = [mesterH.kort];
            const steg = Math.max(1, Math.ceil(andre.length / (MAKS - 1)));
            for (let i = 0; i < andre.length && valgte.length < MAKS; i += steg) {
              valgte.push(andre[i]!);
            }
            const d = kryssAnger(
              state,
              sete,
              valgte.map((k) => ({ type: "SPILL", spiller: sete, kort: k }) as const),
              0,
              rng,
            );
            if (d) {
              const merk = `${valgte.length} kandidater`;
              for (const n of angerNøkler) {
                legg(n, true, rolle, state.stikkSpilt, d, merk, mesterH.kort.verdi, -1, lovligeAlle.length);
              }
            }
          }
        } else if (mesterH.type === "VELG") {
          // --- 5. Trumfvalget -----------------------------------------------
          const hånd = state.hender[sete] ?? [];
          const len = lengder(hånd);
          const maks = Math.max(...FARGER.map((x) => len[x]));
          tell(anledninger, "trumf-ikke-lengst");
          if (len[mesterH.trumf] < maks) {
            tell(utløsninger, "trumf-ikke-lengst");
            const lengste = FARGER.filter((x) => len[x] === maks);
            // Alternativene: hver lengste farge med sitt HØYESTE lovlige
            // etterlys – MesterAI etterlyser selv høyeste i 100 % av tilfellene.
            const alt: Handling[] = [];
            for (const farge of lengste) {
              const kand = lovligeEtterlys(state, farge);
              if (kand.length === 0) continue;
              const høyest = kand.reduce((a, b) => (b.verdi > a.verdi ? b : a));
              alt.push({ type: "VELG", spiller: sete, trumf: farge, etterlyst: høyest });
            }
            if (alt.length > 0) {
              // Flere alternativer ⇒ seleksjon ⇒ kryssvalidert anger.
              const d =
                alt.length === 1
                  ? prisAlternativ(state, sete, mesterH, alt[0]!, rng)
                  : kryssAnger(state, sete, [mesterH, ...alt], 0, rng);
              if (d) legg("trumf-ikke-lengst", true, "spillefører", -1, d, undefined, len[mesterH.trumf], maks);
            }
          }
        } else if (mesterH.type === "VRAK") {
          // --- 8. Vrakede honnører ------------------------------------------
          const hånd = state.hender[sete] ?? [];
          const honnører = mesterH.kort.filter((k) => k.verdi >= 13);
          tell(anledninger, "vrak-honnoer");
          if (honnører.length > 0) {
            const beholdt = hånd.filter((k) => !mesterH.kort.some((v) => likeKort(k, v)));
            const lavest = beholdt.length > 0 ? beholdt.reduce((a, b) => (b.verdi < a.verdi ? b : a)) : null;
            if (lavest !== null && lavest.verdi < honnører[0]!.verdi) {
              tell(utløsninger, "vrak-honnoer");
              const bytt = mesterH.kort.map((k) => (likeKort(k, honnører[0]!) ? lavest : k));
              const d = prisAlternativ(state, sete, mesterH, { type: "VRAK", spiller: sete, kort: bytt }, rng);
              if (d) legg("vrak-honnoer", true, "spillefører", -1, d, undefined, honnører[0]!.verdi, lavest.verdi);
            }
          }
        }
      } catch (feil) {
        prisefeil++;
        console.error(`  prising feilet: ${feil instanceof Error ? (feil.stack ?? feil.message) : String(feil)}`);
      }
      sdSekunder += (Date.now() - t0) / 1000;

      const res = utfør(state, mesterH);
      state = res.state;
      const ok = await adapter.send({ type: "handling", handling: handlingTilJson(mesterH) });
      sjekkSynk(state, ok, `runde ${state.rundeNr}, ${mesterH.type} fra sete ${sete}`);

      for (const h of res.hendelser) {
        if (h.type !== "RUNDE_SLUTT") continue;
        ferdigeRunder++;
        budEtterpåklokskap(state, h.resultat);
        skrivUt();
        const min = (Date.now() - start) / 60000;
        console.log(
          `runde ${ferdigeRunder}/${målRunder} (frø ${frø}, kamp-runde ${state.rundeNr}): ` +
            `budvinner ${h.resultat.budvinner} tok ${h.resultat.lagStikk} – ` +
            `${prisinger} prisinger, SD ${(sdSekunder / 60).toFixed(1)} min av ${min.toFixed(1)} min`,
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
