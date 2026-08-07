/**
 * Atferdsprofil MOT MESTERAI – beslutning for beslutning, på NØYAKTIG samme
 * stillinger.
 *
 * examples/spillprofil.ts gjorde dette mot NevroHjerne og lukket gapet dit.
 * Dette skriptet gjør det samme mot MesterAI, som er det virkelige målet.
 *
 * METODEN – parret, ikke bare «samme frø»
 *   Adapterprotokollen har `{"type":"beslutt","sete":n}`: den spør MesterAI hva
 *   den ville gjort i gjeldende stilling UTEN å utføre det. Det gjør en eksakt
 *   parret sammenlikning mulig:
 *
 *     1. MesterAI besetter ALLE FIRE setene og driver spillet framover.
 *     2. Ved HVERT beslutningspunkt spørres BÅDE MesterAI OG hver kandidat.
 *        Alle ser den identiske GameState-en – samme hånd, samme bord, samme
 *        historikk, samme poengstilling.
 *     3. MESTERAIS valg utføres. Kandidatens svar registreres og kastes.
 *
 *   Vi profilerer altså i de stillingene MesterAI FAKTISK skaper. Det er der
 *   vi må være gode, og det gjør at ingen kandidat kan «rømme» til stillinger
 *   den selv liker. Ingen rad i tabellen sammenlikner tall fra ulike stillinger.
 *
 * MÅLEDISIPLIN – hele poenget med skriptet
 *   Alt i tabellen kommer fra ÉN kjøring og de SAMME beslutningspunktene.
 *   Blandes tall fra to måleoppsett (f.eks. hele kamper til 100 poeng mot
 *   enkeltrunde-differanser) får man et gap som er feil med en størrelsesorden.
 *   Derfor: én løkke, én stilling, alle kandidatene svarer, alt logges sammen.
 *
 * TO AVSNITT SOM SVARER PÅ KONKRETE SPØRSMÅL FRA SPILLEBORDET
 *   - UTSPILL/stikk 1–3: hva åpner spilleføreren MED? Konvensjonen er at når
 *     man har etterlyst et kort, spiller man ut en LAV TRUMF: det etterlyste
 *     kortet er den høyeste trumfen man ikke selv har, så det står, makkeren
 *     tar stikket med det, og man har avslørt makkeren uten å bruke egne
 *     honnører. Stikk 2 og 3 måles med de samme radene, så det går an å se om
 *     et mønster er en ÅPNINGSKONVENSJON eller bare generell stil.
 *   - GARANTI/<rolle>: «slo medspillerens stikk» delt i to. Er stikket ikke
 *     sikret ennå, er overtak et legitimt valg og telles uten dom. ER det
 *     sikret, er hvert ekstra poeng valør rent tap, og da måles det som tap.
 *     Se kommentaren over `garantertFasit` for hvordan garantien avgjøres.
 *
 * TO TING SOM IKKE ER PARRET, OG SOM ER MERKET DERETTER
 *   - VRAK: «vraket i fargen som senere ble trumf» bruker den trumfen som
 *     FAKTISK ble valgt i linja (MesterAIs). Kandidatens eget trumfvalg skjer
 *     på en annen hånd (etter MesterAIs vrak), så den ville vært et annet mål.
 *     Referansen er den samme for alle kandidatene, så raden er sammenliknbar.
 *   - SOM BUDVINNER: bare MesterAI spiller faktisk ut kontrakten, så stikktallet
 *     er linjas. Per kandidat måles budet den ville gitt i BUDVINNERENS siste
 *     budstilling, mot det stikktallet. Raden er merket «hypotetisk».
 *
 * KJØRING (adapteren må være bygget – se arena/README.md)
 *   node examples/mesterai-atferd.ts --runder 60 \
 *        --adapter wsl:/home/arvind/arena-adapter/.build/release/adapter
 *
 * | Flagg | Standard | Betydning |
 * |---|---|---|
 * | `--runder` | 60 | antall runder som profileres (hovedkostnaden) |
 * | `--froe` | 660000 | frøbase; kamp k bruker frø `froe + k` |
 * | `--maksRunder` | 12 | runder per kamp før nytt frø (holder poengstillingen realistisk) |
 * | `--ms` | 450 | tidsbudsjett per kortvalg for MesterAI |
 * | `--verdener` | – | låser MesterAIs min/maksVerdener; gjør målingen lastuavhengig |
 * | `--kandidater` | `e1:e1-modell/d7alle.bin,nevro` | kommaliste: `nevro`, `e1:<fil>`, `pimc`, `graadig` |
 * | `--adapter` | arena/adapter/.build/release/adapter | adapterbinær, `wsl:`-prefiks støttes |
 * | `--ut` | analyse/mesterai-atferd | skriver `<ut>.txt` og `<ut>.json` |
 *
 * OM `--ms` PÅ EN OPPTATT MASKIN: MesterAIs søk stopper når minVerdener er nådd
 * OG fristen er ute. Står det treningsjobber og spiser kjerner rekker den færre
 * verdener på de samme 450 ms og spiller svakere – uten at noe røper det. Bruk
 * `--verdener N` når tallet skal være en varig målestokk.
 *
 * VARIG UTDATA: `<ut>.txt` og `<ut>.json` skrives på nytt etter HVER runde.
 * En flertimers kjøring som avbrytes etterlater derfor alltid en gyldig,
 * ferdig regnet rapport for de rundene som rakk å bli spilt.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { FARGER, likeKort, type Farge, type Kort } from "../src/kort.ts";
import {
  lovligeEtterlys,
  lovligeHandlinger,
  lovligeKort,
  opprettSpill,
  stikkvinner,
  utfør,
  type GameState,
  type Handling,
} from "../src/motor.ts";
// Garantien og «synlig for spilleren» bor i src/moe2/synlig.ts, for
// konvensjonsvakten må avgjøre NØYAKTIG det samme spørsmålet på nøyaktig samme
// måte som denne målingen. To kopier ville gjort tallene uforenlige.
import {
  etterlystTarStikket,
  garantertFasit,
  garantertSynlig,
  pris,
} from "../src/moe2/synlig.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import type { Bud } from "../src/regler.ts";
import { velgHandling as pimcVelg, type BotOpts } from "../src/bot/bot.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { grådigHandling } from "./graadig.ts";
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

const målRunder = flagg("runder", 60);
const frøBase = flagg("froe", 660000);
const maksRunderPerKamp = flagg("maksRunder", 12);
const tidMs = flagg("ms", 450);
const låsteVerdener = flagg("verdener", 0);
const adapterSti = tekstFlagg("adapter", "arena/adapter/.build/release/adapter");
const utBase = tekstFlagg("ut", "analyse/mesterai-atferd");
const kandidatSpec = tekstFlagg("kandidater", "e1:e1-modell/d7alle.bin,nevro");

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
  // «vakt:<flagg>:<indre>» – konvensjonsvakten utenpå en hvilken som helst
  // annen kandidat. Navnet beholder hele spesifikasjonen, så rapporten sier
  // hvilken vakt som svarte.
  const vakt = delVaktspek(spec);
  if (vakt !== null) {
    const indre = lagKandidat(vakt.indre);
    const pakket = new Konvensjonsvakt({ velgHandling: (s) => indre.velg(s) }, vakt.valg);
    return {
      // Kort navn: tabellkolonnene er 15 tegn brede.
      navn: `v${vakt.flagg}:${indre.navn}`,
      nyKamp: (frø) => indre.nyKamp(frø),
      velg: (s) => pakket.velgHandling(s),
    };
  }
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
      navn: spec.slice(3).split(/[\\/]/).pop() ?? spec,
      nyKamp: () => agent.nyKamp(),
      velg: (s) => agent.velgHandling(s),
    };
  }
  throw new Error(`Ukjent kandidat «${spec}» (nevro, e1:<fil>, pimc, graadig)`);
}

const kandidater = kandidatSpec
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s.length > 0)
  .map(lagKandidat);

/** Kolonne 0 er ALLTID MesterAI: fasiten alle avvik måles mot. */
const kolonner = ["MesterAI", ...kandidater.map((k) => k.navn)];

// --- Profilen ---------------------------------------------------------------

/**
 * Rollene i spillfasen. Målt på grunnsannheten (state.makker), ikke på hva
 * spilleren kan vite – dette er en atferdsbeskrivelse, ikke en modell av
 * informasjonen. Makkeren er skjult til den avsløres, men han oppfører seg
 * som makker fra første kort, og det er oppførselen vi profilerer.
 */
type Rolle = "spillefører" | "makker" | "forsvarer";
const ROLLER: readonly Rolle[] = ["spillefører", "makker", "forsvarer"];

interface Rolleprofil {
  valg: number;
  likt: number;
  // Forsvarsmålene fra examples/forsvarsprofil.ts
  utspill: number;
  utspillTrumf: number;
  utspillHøyt: number;
  kunneTa: number;
  tokDet: number;
  medforsvarerLeder: number;
  sloEgetStikk: number;
  kastetHonnørBort: number;
  renonsMedTrumf: number;
  trumfetInn: number;
  // «Slo medspillerens stikk», delt på om stikket alt var sikret for laget.
  // Nevnerne her henger bare på STILLINGEN, ikke på hva kandidaten valgte,
  // så de er identiske i alle kolonnene – radene er parret.
  garantert: number;
  garantertSlo: number;
  garantertIkkeBilligst: number;
  garantertBrentTrumf: number;
  garantertHonnør: number;
  /** Valøren på kortet som faktisk ble lagt, i de tilfellene det ikke var billigst. */
  garantertLagtVerdi: number[];
  /** Valøren på det billigste lovlige kortet i nøyaktig de samme tilfellene. */
  garantertBilligstVerdi: number[];
  offGarantert: number;
  offGarantertSlo: number;
  ikkeGarantert: number;
  ikkeGarantertSlo: number;
  /** Garantert i fasit, men ikke mulig å avgjøre ut fra offentlig informasjon. */
  skjultGaranti: number;
}

const nyRolleprofil = (): Rolleprofil => ({
  valg: 0, likt: 0,
  utspill: 0, utspillTrumf: 0, utspillHøyt: 0,
  kunneTa: 0, tokDet: 0,
  medforsvarerLeder: 0, sloEgetStikk: 0, kastetHonnørBort: 0,
  renonsMedTrumf: 0, trumfetInn: 0,
  garantert: 0, garantertSlo: 0, garantertIkkeBilligst: 0, garantertBrentTrumf: 0,
  garantertHonnør: 0, garantertLagtVerdi: [], garantertBilligstVerdi: [],
  offGarantert: 0, offGarantertSlo: 0, ikkeGarantert: 0, ikkeGarantertSlo: 0,
  skjultGaranti: 0,
});

/**
 * Utspill som SPILLEFØRER, målt per stikk.
 *
 * Konvensjonen fra spillebordet: har du etterlyst et kort, åpner du med en LAV
 * TRUMF. Det etterlyste kortet er den høyeste trumfen du ikke selv sitter med,
 * så det står uansett – makkeren må legge det i første stikk (makkerplikten)
 * og tar stikket med det. Du har dermed avslørt makkeren uten å bruke opp en
 * eneste av dine egne honnører. Åpner du derimot med din høyeste trumf, tar du
 * stikket selv, brenner en honnør og lærer ingenting du ikke visste.
 *
 * Merk at motoren TVINGER trumfutspill i stikk 1 for budvinneren når han har
 * trumf (`lovligeKort`), så «trumf ut» er ~100 % i stikk 1 for alle. Det
 * interessante der er VALØREN. I stikk 2 og 3 er trumfutspill et fritt valg.
 */
interface Utspillsprofil {
  utspill: number;
  trumfUt: number;
  valør: number[];
  /** Valør ≤ 7: «lavt kort». */
  lav: number;
  lavTrumf: number;
  høyesteEgenTrumf: number;
  lavesteEgenTrumf: number;
  /** Stikk 1: stillinger der det finnes en etterlysning og en makker. */
  etterlysAnledning: number;
  /** … og der det etterlyste kortet GARANTERT tar stikket etter dette utspillet. */
  etterlysTokStikket: number;
}

const nyUtspillsprofil = (): Utspillsprofil => ({
  utspill: 0, trumfUt: 0, valør: [], lav: 0, lavTrumf: 0,
  høyesteEgenTrumf: 0, lavesteEgenTrumf: 0,
  etterlysAnledning: 0, etterlysTokStikket: 0,
});

/** Hvor mange av de første stikkene som får eget avsnitt. */
const UTSPILLSSTIKK = 3;

interface Profil {
  // BUD
  budAnledninger: number;
  budLikt: number;
  pass: number;
  amerikaner: number;
  solo: number;
  tallbud: number[];
  budHistogram: Record<number, number>;
  // VRAK
  vrakValg: number;
  vrakLikt: number;
  vrakKort: number;
  vrakVerdi: number[];
  vrakEssKonge: number;
  vrakISenereTrumf: number;
  fargerTømt: number[];
  // VELG (trumf + etterlysning)
  trumfValg: number;
  trumfLikt: number;
  trumfLengde: number[];
  trumfVarLengst: number;
  trumfSerie: number[];
  etterlysAntall: number;
  etterlysValgfritt: number;
  etterlysVerdi: number[];
  etterlysVarHøyest: number;
  // SPILL
  roller: Record<Rolle, Rolleprofil>;
  /** Utspill som spillefører i stikk 1, 2 og 3. */
  utspillStikk: Utspillsprofil[];
  // Utfall / kontrakter (se hodekommentaren: hypotetisk for kandidatene)
  kontrakter: number;
  faktiskStikk: number[];
  budetVar: number[];
  overskudd: number[];
  innfridd: number;
  villePasset: number;
  // Arbeidsminne innen runden
  sisteVrak: Kort[] | null;
  sisteBudPerSete: (Bud | null)[];
  feil: number;
}

function nyProfil(): Profil {
  return {
    budAnledninger: 0, budLikt: 0, pass: 0, amerikaner: 0, solo: 0,
    tallbud: [], budHistogram: {},
    vrakValg: 0, vrakLikt: 0, vrakKort: 0, vrakVerdi: [], vrakEssKonge: 0,
    vrakISenereTrumf: 0, fargerTømt: [],
    trumfValg: 0, trumfLikt: 0, trumfLengde: [], trumfVarLengst: 0, trumfSerie: [],
    etterlysAntall: 0, etterlysValgfritt: 0, etterlysVerdi: [], etterlysVarHøyest: 0,
    roller: { spillefører: nyRolleprofil(), makker: nyRolleprofil(), forsvarer: nyRolleprofil() },
    utspillStikk: Array.from({ length: UTSPILLSSTIKK }, nyUtspillsprofil),
    kontrakter: 0, faktiskStikk: [], budetVar: [], overskudd: [], innfridd: 0, villePasset: 0,
    sisteVrak: null, sisteBudPerSete: [null, null, null, null],
    feil: 0,
  };
}

// --- Småhjelpere ------------------------------------------------------------

const lengder = (h: readonly Kort[]): Record<Farge, number> => {
  const t: Record<Farge, number> = { S: 0, H: 0, R: 0, K: 0 };
  for (const k of h) t[k.farge]++;
  return t;
};

/** Lengste sammenhengende serie i en farge (samme definisjon som spillprofil.ts). */
function serie(hånd: readonly Kort[], farge: Farge): number {
  const v = hånd.filter((k) => k.farge === farge).map((k) => k.verdi).sort((a, b) => b - a);
  if (v.length === 0) return 0;
  let beste = 1;
  let løpende = 1;
  for (let i = 1; i < v.length; i++) {
    løpende = v[i]! === v[i - 1]! - 1 ? løpende + 1 : 1;
    if (løpende > beste) beste = løpende;
  }
  return beste;
}

/** Ville `kort` vunnet stikket slik bordet står nå? */
function vinnerNå(s: GameState, kort: Kort, sete: number): boolean {
  return stikkvinner(s.bord.concat({ spiller: sete, kort }), s.trumf!) === sete;
}

/** Er de to beslutningene identiske? Sammenliknes som mengder for VRAK. */
function likHandling(a: Handling, b: Handling): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "BUD" && b.type === "BUD") return a.bud === b.bud;
  if (a.type === "SPILL" && b.type === "SPILL") return likeKort(a.kort, b.kort);
  if (a.type === "VRAK" && b.type === "VRAK") {
    if (a.kort.length !== b.kort.length) return false;
    return a.kort.every((k) => b.kort.some((x) => likeKort(k, x)));
  }
  if (a.type === "VELG" && b.type === "VELG") {
    if (a.trumf !== b.trumf) return false;
    if (a.etterlyst === null || b.etterlyst === null) return a.etterlyst === b.etterlyst;
    return likeKort(a.etterlyst, b.etterlyst);
  }
  return false;
}

function rollenTil(s: GameState, sete: number): Rolle {
  if (sete === s.budvinner) return "spillefører";
  if (sete === s.makker) return "makker";
  return "forsvarer";
}

// --- Er stikket allerede sikret for laget? ----------------------------------
//
// «Slo medspillerens stikk» er IKKE i seg selv en feil. Seterekkefølgen
// avgjør: sitter det motstandere igjen som kan overta, er det et helt legitimt
// valg å legge på – man forsvarer stikket. ER stikket derimot alt garantert
// for laget, er hver eneste ekstra valør man legger på rent tap: kortet er
// borte, stikket var vårt uansett, og da skal det BILLIGSTE lovlige kortet ut.
//
// Garantien avgjøres på to nivåer, og begge rapporteres:
//
//   FASIT      motorens fulle informasjon. Ingen gjenstående motstander har et
//              LOVLIG kort som slår kortet som leder nå. Eksakt – men det er
//              en fasit spilleren selv ikke kunne ha sett.
//   OFFENTLIG  bare det spilleren kan vite: egen hånd, alt som er spilt, eget
//              vrak (bare budvinneren ser sitt), og renonser som er AVSLØRT i
//              tidligere stikk. Alt annet antas å kunne ligge hos hvem som
//              helst av motstanderne. Dette er den konservative varianten: er
//              stikket garantert HER, hadde spilleren grunnlag for å se det,
//              og overtak er en feil han kunne unngått.
//
// Offentlig garanti medfører alltid fasit-garanti, så tallene er nøstet.
// Differansen – «skjult garanti» – er nettopp de tilfellene som ikke lot seg
// klassifisere fra spillerens egen synsvinkel, og den rapporteres for seg.
//
// Selve avgjørelsene ligger i `src/moe2/synlig.ts` (garantertFasit,
// garantertSynlig, pris, etterlystTarStikket) – samme kode som
// konvensjonsvakten bruker under spill.

/** Registrerer ett utspill fra spilleføreren i stikk `stikk` (0-indeksert). */
function registrerUtspill(p: Profil, s: GameState, sete: number, kort: Kort, stikk: number): void {
  const u = p.utspillStikk[stikk];
  if (u === undefined) return;
  // Hånden er ennå urørt: kortet som spilles ut ligger fortsatt i den.
  const egenTrumf = (s.hender[sete] ?? []).filter((k) => k.farge === s.trumf).map((k) => k.verdi);
  u.utspill++;
  u.valør.push(kort.verdi);
  if (kort.verdi <= 7) u.lav++;
  if (kort.farge === s.trumf) {
    u.trumfUt++;
    if (kort.verdi <= 7) u.lavTrumf++;
    if (egenTrumf.length > 0) {
      if (kort.verdi === Math.max(...egenTrumf)) u.høyesteEgenTrumf++;
      if (kort.verdi === Math.min(...egenTrumf)) u.lavesteEgenTrumf++;
    }
  }
  if (stikk === 0 && s.etterlyst !== null && s.makker !== null && s.makker !== sete) {
    u.etterlysAnledning++;
    if (etterlystTarStikket(s, sete, kort)) u.etterlysTokStikket++;
  }
}

// --- Registrering av ÉN beslutning ------------------------------------------

/**
 * Legger kandidatens (eller MesterAIs egen) beslutning inn i profilen.
 * `fasit` er MesterAIs valg i den samme stillingen; for MesterAIs egen profil
 * er `h === fasit`, og «likt valg»-raden blir 100 % – en gratis kontroll på at
 * målingen ser den samme handlingen på begge sider.
 */
function registrer(p: Profil, s: GameState, sete: number, h: Handling, fasit: Handling): void {
  const likt = likHandling(h, fasit);

  if (h.type === "BUD") {
    p.budAnledninger++;
    if (likt) p.budLikt++;
    p.sisteBudPerSete[sete] = h.bud;
    if (h.bud === "PASS") p.pass++;
    else if (h.bud === "AMERIKANER") p.amerikaner++;
    else if (h.bud === "SOLO") p.solo++;
    else {
      p.tallbud.push(h.bud);
      p.budHistogram[h.bud] = (p.budHistogram[h.bud] ?? 0) + 1;
    }
    return;
  }

  if (h.type === "VRAK") {
    const hånd = s.hender[sete] ?? [];
    p.vrakValg++;
    if (likt) p.vrakLikt++;
    p.sisteVrak = [...h.kort];
    p.vrakKort += h.kort.length;
    for (const k of h.kort) {
      p.vrakVerdi.push(k.verdi);
      if (k.verdi >= 13) p.vrakEssKonge++;
    }
    // Hvor mange farger tømmes helt av dette vraket?
    const før = lengder(hånd);
    const etter = lengder(hånd.filter((k) => !h.kort.some((v) => likeKort(k, v))));
    p.fargerTømt.push(FARGER.filter((f) => før[f] > 0 && etter[f] === 0).length);
    return;
  }

  if (h.type === "VELG") {
    const hånd = s.hender[sete] ?? [];
    const len = lengder(hånd);
    p.trumfValg++;
    if (likt) p.trumfLikt++;
    p.trumfLengde.push(len[h.trumf]);
    p.trumfSerie.push(serie(hånd, h.trumf));
    if (len[h.trumf] === Math.max(...FARGER.map((f) => len[f]))) p.trumfVarLengst++;
    const lov = lovligeHandlinger(s);
    if (lov.fase === "VELG" && !lov.måEtterlyse) p.etterlysValgfritt++;
    if (h.etterlyst !== null) {
      p.etterlysAntall++;
      p.etterlysVerdi.push(h.etterlyst.verdi);
      const kandidater = lovligeEtterlys(s, h.trumf);
      const høyest = kandidater.reduce((m, k) => Math.max(m, k.verdi), 0);
      if (h.etterlyst.verdi === høyest) p.etterlysVarHøyest++;
    }
    return;
  }

  if (h.type !== "SPILL") return;

  const rolle = rollenTil(s, sete);
  const r = p.roller[rolle];
  r.valg++;
  if (likt) r.likt++;

  const kort = h.kort;
  const lovlige = lovligeKort(s, sete);

  if (s.bord.length === 0) {
    r.utspill++;
    if (kort.farge === s.trumf) r.utspillTrumf++;
    if (kort.verdi >= 13) r.utspillHøyt++;
    if (rolle === "spillefører" && s.stikkSpilt < UTSPILLSSTIKK) {
      registrerUtspill(p, s, sete, kort, s.stikkSpilt);
    }
    return;
  }

  const ledFarge = s.bord[0]!.kort.farge;
  const harFargen = lovlige.some((k) => k.farge === ledFarge);
  if (!harFargen && lovlige.some((k) => k.farge === s.trumf)) {
    r.renonsMedTrumf++;
    if (kort.farge === s.trumf) r.trumfetInn++;
  }

  // Forsvarsmålene krever et lag: hvem leder stikket, oss eller budlaget?
  const leder = stikkvinner(s.bord, s.trumf!);
  const våre = rolle === "forsvarer"
    ? [0, 1, 2, 3].filter((x) => x !== s.budvinner && x !== s.makker)
    : [s.budvinner, s.makker].filter((x): x is number => x !== null);
  const medspillerLeder = leder !== sete && våre.includes(leder);

  if (medspillerLeder) {
    r.medforsvarerLeder++;
    const slo = vinnerNå(s, kort, sete);
    if (slo) r.sloEgetStikk++;
    else if (kort.verdi >= 13) r.kastetHonnørBort++;

    // Delingen henger bare på stillingen, ikke på valget: nevnerne blir de
    // samme i alle kolonnene, og radene er dermed parret.
    if (garantertFasit(s, sete, våre)) {
      r.garantert++;
      if (slo) r.garantertSlo++;
      if (kort.verdi >= 13) r.garantertHonnør++;
      const trumf = s.trumf!;
      const billigst = lovlige.reduce((a, b) => (pris(b, trumf) < pris(a, trumf) ? b : a));
      if (pris(kort, trumf) > pris(billigst, trumf)) {
        r.garantertIkkeBilligst++;
        r.garantertLagtVerdi.push(kort.verdi);
        r.garantertBilligstVerdi.push(billigst.verdi);
      }
      if (kort.farge === trumf && lovlige.some((k) => k.farge !== trumf)) r.garantertBrentTrumf++;
      if (garantertSynlig(s, sete, våre)) {
        r.offGarantert++;
        if (slo) r.offGarantertSlo++;
      } else {
        r.skjultGaranti++;
      }
    } else {
      r.ikkeGarantert++;
      if (slo) r.ikkeGarantertSlo++;
    }
  } else if (leder !== sete) {
    if (lovlige.some((k) => vinnerNå(s, k, sete))) {
      r.kunneTa++;
      if (vinnerNå(s, kort, sete)) r.tokDet++;
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

const ENIGHET = "likt valg som MesterAI";

interface Måling {
  readonly gruppe: string;
  readonly navn: string;
  readonly slag: "snitt" | "andel" | "antall";
  /**
   * Enighetsrader måler ikke en ATFERD, men hvor ofte kandidaten trykker på
   * nøyaktig samme knapp som MesterAI. De er per definisjon 100 % i
   * MesterAI-kolonnen, så de topper enhver avviksliste uten å peke på noe som
   * kan rettes: «du er uenig i 40 % av kortvalgene» er en diagnose, ikke en
   * oppgave. De holdes derfor utenfor funnlista og får sin egen oversikt.
   */
  readonly erEnighet: boolean;
  readonly uttrekk: (p: Profil) => Prøve;
}

function måleliste(): Måling[] {
  const m: Måling[] = [];
  const snitt = (gruppe: string, navn: string, f: (p: Profil) => readonly number[]): void => {
    m.push({ gruppe, navn, slag: "snitt", erEnighet: false, uttrekk: (p) => fraTall(f(p)) });
  };
  const andel = (gruppe: string, navn: string, f: (p: Profil) => [number, number]): void => {
    m.push({
      gruppe, navn, slag: "andel", erEnighet: navn === ENIGHET,
      uttrekk: (p) => fraAndel(...f(p)),
    });
  };

  // BUD
  snitt("BUD", "snittbud (tallbud)", (p) => p.tallbud);
  andel("BUD", "passandel", (p) => [p.pass, p.budAnledninger]);
  andel("BUD", "andel bud ≥ 9", (p) => [p.tallbud.filter((b) => b >= 9).length, p.tallbud.length]);
  andel("BUD", "andel bud ≥ 7", (p) => [p.tallbud.filter((b) => b >= 7).length, p.tallbud.length]);
  andel("BUD", "amerikaner/solo", (p) => [p.amerikaner + p.solo, p.budAnledninger]);
  andel("BUD", ENIGHET, (p) => [p.budLikt, p.budAnledninger]);

  // VRAK
  snitt("VRAK", "snittvalør på vraket kort", (p) => p.vrakVerdi);
  andel("VRAK", "vraket ess/konge", (p) => [p.vrakEssKonge, p.vrakKort]);
  andel("VRAK", "vraket i senere trumf", (p) => [p.vrakISenereTrumf, p.vrakKort]);
  snitt("VRAK", "farger tømt av vraket", (p) => p.fargerTømt);
  andel("VRAK", ENIGHET, (p) => [p.vrakLikt, p.vrakValg]);

  // TRUMF
  snitt("TRUMF", "trumflengde", (p) => p.trumfLengde);
  andel("TRUMF", "valgte lengste farge", (p) => [p.trumfVarLengst, p.trumfValg]);
  snitt("TRUMF", "serie i trumf", (p) => p.trumfSerie);
  snitt("TRUMF", "etterlyst valør", (p) => p.etterlysVerdi);
  andel("TRUMF", "etterlyste høyeste lovlige", (p) => [p.etterlysVarHøyest, p.etterlysAntall]);
  andel("TRUMF", ENIGHET, (p) => [p.trumfLikt, p.trumfValg]);

  // SPILL, delt på rolle
  for (const rolle of ROLLER) {
    const g = `SPILL/${rolle}`;
    andel(g, ENIGHET, (p) => [p.roller[rolle].likt, p.roller[rolle].valg]);
    andel(g, "utspill: trumf ut", (p) => [p.roller[rolle].utspillTrumf, p.roller[rolle].utspill]);
    andel(g, "utspill: honnør ut", (p) => [p.roller[rolle].utspillHøyt, p.roller[rolle].utspill]);
    andel(g, "tok stikket når vi kunne", (p) => [p.roller[rolle].tokDet, p.roller[rolle].kunneTa]);
    andel(g, "trumfet inn ved renons", (p) => [p.roller[rolle].trumfetInn, p.roller[rolle].renonsMedTrumf]);
    andel(g, "slo medspillerens stikk", (p) => [p.roller[rolle].sloEgetStikk, p.roller[rolle].medforsvarerLeder]);
    andel(g, "kastet honnør bort", (p) => [p.roller[rolle].kastetHonnørBort, p.roller[rolle].medforsvarerLeder]);
  }

  // FØRSTE STIKK SOM SPILLEFØRER – og de to neste, som kontroll
  for (let i = 0; i < UTSPILLSSTIKK; i++) {
    const g = `UTSPILL/stikk ${i + 1}`;
    const u = (p: Profil): Utspillsprofil => p.utspillStikk[i]!;
    andel(g, "trumf ut", (p) => [u(p).trumfUt, u(p).utspill]);
    snitt(g, "valør på utspillet", (p) => u(p).valør);
    andel(g, "lavt kort (valør ≤ 7)", (p) => [u(p).lav, u(p).utspill]);
    andel(g, "LAV TRUMF ut (≤ 7)", (p) => [u(p).lavTrumf, u(p).utspill]);
    andel(g, "høyeste trumf på hånd", (p) => [u(p).høyesteEgenTrumf, u(p).utspill]);
    andel(g, "laveste trumf på hånd", (p) => [u(p).lavesteEgenTrumf, u(p).utspill]);
    andel(g, "etterlyst tar stikket", (p) => [u(p).etterlysTokStikket, u(p).etterlysAnledning]);
  }

  // GARANTERT STIKK – «slo medspillerens stikk» delt i to
  for (const rolle of ROLLER) {
    const g = `GARANTI/${rolle}`;
    const r = (p: Profil): Rolleprofil => p.roller[rolle];
    andel(g, "medspiller leder: garantert", (p) => [r(p).garantert, r(p).medforsvarerLeder]);
    andel(g, "GARANTERT: slo stikket", (p) => [r(p).garantertSlo, r(p).garantert]);
    andel(g, "GARANTERT: ikke billigste kort", (p) => [r(p).garantertIkkeBilligst, r(p).garantert]);
    snitt(g, "  → valør lagt", (p) => r(p).garantertLagtVerdi);
    snitt(g, "  → valør billigst mulig", (p) => r(p).garantertBilligstVerdi);
    andel(g, "GARANTERT: brente trumf", (p) => [r(p).garantertBrentTrumf, r(p).garantert]);
    andel(g, "GARANTERT: la honnør (≥13)", (p) => [r(p).garantertHonnør, r(p).garantert]);
    andel(g, "GARANTERT offentlig: slo det", (p) => [r(p).offGarantertSlo, r(p).offGarantert]);
    andel(g, "IKKE garantert: slo stikket", (p) => [r(p).ikkeGarantertSlo, r(p).ikkeGarantert]);
  }

  // SOM BUDVINNER – hypotetisk for kandidatene, se hodekommentaren
  snitt("BUDVINNER", "budet i samme stilling", (p) => p.budetVar);
  snitt("BUDVINNER", "stikk laget faktisk tok", (p) => p.faktiskStikk);
  snitt("BUDVINNER", "overskudd (stikk − bud)", (p) => p.overskudd);
  andel("BUDVINNER", "ville innfridd", (p) => [p.innfridd, p.budetVar.length]);
  andel("BUDVINNER", "ville passet i stedet", (p) => [p.villePasset, p.kontrakter]);

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

/** Innledninger som skrives rett over gruppa de gjelder. */
const GRUPPEINNLEDNING: Record<string, string[]> = {
  "UTSPILL/stikk 1": [
    "",
    "FØRSTE STIKK SOM SPILLEFØRER – og de to neste, som kontroll.",
    "",
    "Konvensjonen: har du etterlyst et kort, åpner du med en LAV TRUMF. Det",
    "etterlyste kortet er den høyeste trumfen du IKKE selv har, så det står.",
    "Makkeren må legge det i første stikk (makkerplikten) og tar stikket med",
    "det – du har avslørt makkeren uten å bruke opp én eneste egen honnør.",
    "Åpner du med din høyeste trumf, tar du stikket selv, brenner en honnør",
    "og lærer ingenting du ikke visste fra før.",
    "",
    "Merk at motoren TVINGER trumfutspill i stikk 1 for budvinneren som har",
    "trumf, så «trumf ut» er ~100 % der for alle tre. Det som skiller dem er",
    "VALØREN. I stikk 2 og 3 er trumfutspill et fritt valg, så de radene",
    "sier om et mønster er en åpningskonvensjon eller bare generell stil.",
    "",
    "«etterlyst tar stikket» er deterministisk: makkerplikten treffer, ingen",
    "av forsvarerne har et lovlig kort som slår det etterlyste, og utspillet",
    "slår det ikke selv. Ingen gjetting om hva noen VIL gjøre.",
  ],
  "GARANTI/spillefører": [
    "",
    "SLO MEDSPILLERENS STIKK – delt i to, for det er to helt ulike ting.",
    "",
    "Er stikket IKKE sikret ennå, kan motstandere som sitter igjen fortsatt",
    "overta det. Da er det et legitimt valg å legge på og forsvare stikket,",
    "og raden telles uten dom.",
    "",
    "Er stikket alt GARANTERT for laget, er hver ekstra valør man legger på",
    "rent tap: kortet er borte, stikket var vårt uansett. Da skal det",
    "billigste lovlige kortet ut – et sidekort før en trumf, lavest valør",
    "innenfor det. «ikke billigste kort» er det ekte sløsemålet.",
    "",
    "Garantien avgjøres på to nivåer, begge nøstet:",
    "  GARANTERT  – motorens fulle informasjon: ingen gjenstående motstander",
    "               har et LOVLIG kort som slår det som ligger. Eksakt.",
    "  … offentlig – bare det spilleren selv kan se: egen hånd, alt spilt,",
    "               eget vrak, og renonser avslørt i tidligere stikk. Alt",
    "               annet antas å kunne ligge hos en motstander. Er stikket",
    "               garantert HER, hadde spilleren grunnlag for å se det.",
    "Differansen mellom dem står som «skjult garanti» nederst: tilfellene",
    "som ikke lot seg klassifisere fra spillerens egen synsvinkel.",
  ],
};

function bygdRapport(profiler: Profil[], runder: number, sekunder: number): { txt: string; json: object } {
  const målinger = måleliste();
  const linjer: string[] = [];
  const bredde = 34;
  const kol = 17;
  const rad = (navn: string, v: string[]): void => {
    linjer.push(navn.padEnd(bredde) + v.map((x) => x.padStart(kol)).join(""));
  };

  const oppsett =
    låsteVerdener > 0 ? `${låsteVerdener} verdener per kortvalg (låst)` : `${tidMs} ms per kortvalg`;

  linjer.push("=== ATFERDSPROFIL MOT MESTERAI ===");
  linjer.push("");
  linjer.push(`Runder profilert:  ${runder}`);
  linjer.push(`Frøbase:           ${frøBase} (${maksRunderPerKamp} runder per kamp)`);
  linjer.push(`MesterAI:          ${oppsett}, alle fire seter`);
  linjer.push(`Tidsbruk:          ${(sekunder / 60).toFixed(1)} min`);
  linjer.push(`Skrevet:           ${new Date().toISOString()}`);
  linjer.push("");
  linjer.push("Alle kolonnene svarer på DE SAMME stillingene, i den samme kjøringen.");
  linjer.push("MesterAI driver spillet; kandidatene svarer på hvert beslutningspunkt");
  linjer.push("uten å utføre noe. Kolonne 1 er derfor både fasit og kontroll: den må");
  linjer.push("vise 100 % på hver «likt valg»-rad.");
  linjer.push("");
  linjer.push(`En n merket «*» er under ${TYNN_N} observasjoner. Slike rader er USIKRE:`);
  linjer.push("de kan svinge flere titalls prosentpoeng på ren tilfeldighet, og skal");
  linjer.push("ikke leses som funn uansett hvor stort avviket ser ut.");
  linjer.push("");

  const funn: {
    gruppe: string; navn: string; kandidat: string; erEnighet: boolean;
    mester: number; kand: number; avvik: number; n: number; nMester: number; z: number; slag: string;
  }[] = [];

  let forrigeGruppe = "";
  for (const m of målinger) {
    if (m.gruppe !== forrigeGruppe) {
      for (const l of GRUPPEINNLEDNING[m.gruppe] ?? []) linjer.push(l);
      linjer.push("");
      linjer.push(m.gruppe);
      linjer.push("-".repeat(bredde + kol * kolonner.length));
      rad("", kolonner.map((k) => k.slice(0, kol - 2)));
      forrigeGruppe = m.gruppe;
    }
    const prøver = profiler.map((p) => m.uttrekk(p));
    rad(`  ${m.navn}`, prøver.map((p) => fmt(p, m.slag)));
    // «*» = for få observasjoner til at raden bærer. Se tegnforklaringen.
    rad("    n", prøver.map((p) => (p.n === 0 ? "–" : `${p.n}${p.n < TYNN_N ? " *" : ""}`)));

    const fasit = prøver[0]!;
    for (let i = 1; i < profiler.length; i++) {
      const p = prøver[i]!;
      if (p.n === 0 || fasit.n === 0) continue;
      funn.push({
        gruppe: m.gruppe, navn: m.navn, kandidat: kolonner[i]!, erEnighet: m.erEnighet,
        mester: fasit.verdi, kand: p.verdi, avvik: p.verdi - fasit.verdi,
        n: p.n, nMester: fasit.n, z: zVerdi(p, fasit), slag: m.slag,
      });
    }
  }

  // Budfordelingen i sin helhet – snittet alene skjuler formen på den.
  linjer.push("");
  linjer.push("BUDFORDELING (antall tallbud per verdi)");
  linjer.push("-".repeat(bredde + kol * kolonner.length));
  rad("", kolonner.map((k) => k.slice(0, kol - 2)));
  for (let b = 5; b <= 12; b++) {
    const noen = profiler.some((p) => (p.budHistogram[b] ?? 0) > 0);
    if (!noen) continue;
    rad(
      `  bud ${b}`,
      profiler.map((p) => {
        const a = p.budHistogram[b] ?? 0;
        return p.tallbud.length === 0 ? "0" : `${a} (${Math.round((100 * a) / p.tallbud.length)} %)`;
      }),
    );
  }

  const fnavn = (v: number, slag: string): string =>
    slag === "andel" ? `${(100 * v).toFixed(0)} %` : v.toFixed(2);
  const relevante = funn.filter((f) => f.kandidat !== "MesterAI" && Number.isFinite(f.z));

  // --- Enighet: diagnosen, ikke arbeidslista -------------------------------
  linjer.push("");
  linjer.push("");
  linjer.push("=== ENIGHET: hvor ofte trykker kandidaten på samme knapp? ===");
  linjer.push("");
  linjer.push("Disse radene sier HVOR uenigheten sitter, ikke HVA som er galt. De kan");
  linjer.push("ikke rettes direkte, så de er holdt utenfor funnlista under.");
  linjer.push("");
  for (const f of relevante.filter((x) => x.erEnighet).sort((a, b) => a.kand - b.kand)) {
    linjer.push(
      `  ${(100 * f.kand).toFixed(0).padStart(3)} %  ${f.kandidat.padEnd(12)} ${f.gruppe}` +
        ` (n=${f.n})`,
    );
  }

  // --- Funnlista: største hull øverst --------------------------------------
  const rangerte = relevante
    .filter((f) => !f.erEnighet)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));

  linjer.push("");
  linjer.push("");
  linjer.push("=== FUNN: største atferdsavvik mot MesterAI, størst først ===");
  linjer.push("");
  linjer.push("Sortert på |z| = avviket målt i standardfeil. Det er det ærlige målet på");
  linjer.push("«størrelse»: et avvik på 20 prosentpoeng over 30 beslutninger og ett på 5");
  linjer.push("over 4000 er ikke like store funn, og rå prosentpoeng kan uansett ikke");
  linjer.push("rangeres mot snittvalører. z er regnet UPARRET og er derfor et NEDRE anslag –");
  linjer.push("stillingene er identiske, så den virkelige presisjonen er bedre enn dette.");
  linjer.push("Tommelfinger: |z| < 2 er støy, |z| > 4 er en reell atferdsforskjell.");
  linjer.push(`Rader med n < ${TYNN_N} er merket USIKKER og skal ikke leses som funn.`);
  linjer.push("");
  for (const f of rangerte) {
    const retning = f.avvik > 0 ? "MER" : "MINDRE";
    linjer.push(
      `|z| ${Math.abs(f.z).toFixed(1).padStart(5)}  ${f.kandidat} ${retning.padEnd(6)} ` +
        `${f.gruppe} / ${f.navn}: ` +
        `${fnavn(f.kand, f.slag)} mot MesterAIs ${fnavn(f.mester, f.slag)} ` +
        `(avvik ${f.avvik > 0 ? "+" : ""}${fnavn(f.avvik, f.slag)}, n=${f.n})` +
        (f.n < TYNN_N || f.nMester < TYNN_N ? "  ← USIKKER (n < 50)" : ""),
    );
  }

  // --- Hvor mye lot seg ikke klassifisere? ---------------------------------
  // Nevnerne er stillingsbestemte og derfor identiske i alle kolonnene;
  // MesterAI-profilen holder de samme tallene som de andre.
  linjer.push("");
  linjer.push("");
  linjer.push("=== GARANTI: hvor mange stillinger lot seg klassifisere? ===");
  linjer.push("");
  linjer.push("Med motorens fulle informasjon er ALLE stillinger klassifisert – det er");
  linjer.push("en eksakt avgjørelse, ikke et anslag, så «uklassifiserte» er null der.");
  linjer.push("Fra spillerens egen synsvinkel er det derimot en rest: stikk som VAR");
  linjer.push("garantert uten at han kunne vite det. De står som «skjult garanti», og");
  linjer.push("i dem er overtak ikke en feil han hadde grunnlag for å unngå.");
  linjer.push("");
  const g0 = profiler[0]!;
  for (const rolle of ROLLER) {
    const r = g0.roller[rolle];
    linjer.push(
      `  ${rolle.padEnd(13)} medspiller leder: ${String(r.medforsvarerLeder).padStart(5)}` +
        `   garantert (fasit): ${String(r.garantert).padStart(5)}` +
        `   av dem synlig for spilleren: ${String(r.offGarantert).padStart(5)}` +
        `   skjult garanti: ${String(r.skjultGaranti).padStart(5)}` +
        `   ikke garantert: ${String(r.ikkeGarantert).padStart(5)}` +
        `   uklassifiserte: 0`,
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
    froeBase: frøBase,
    maksRunderPerKamp,
    mesterOppsett: låsteVerdener > 0 ? { verdener: låsteVerdener } : { ms: tidMs },
    kolonner,
    budfordeling: profiler.map((p) => p.budHistogram),
    feil: profiler.map((p) => p.feil),
    maalinger: målinger.map((m) => ({
      gruppe: m.gruppe,
      navn: m.navn,
      slag: m.slag,
      erEnighet: m.erEnighet,
      per: profiler.map((p, i) => {
        const pr = m.uttrekk(p);
        return { kandidat: kolonner[i], verdi: pr.n === 0 ? null : pr.verdi, n: pr.n };
      }),
    })),
    tynnN: TYNN_N,
    enighet: relevante.filter((f) => f.erEnighet),
    funn: rangerte.map((f) => ({ ...f, usikker: f.n < TYNN_N || f.nMester < TYNN_N })),
    // Klassifiseringen av «stikket er garantert». Stillingsbestemt, altså lik
    // i alle kolonnene; tallene her er MesterAI-profilens, som er fasiten.
    garantiOversikt: ROLLER.map((rolle) => {
      const r = g0.roller[rolle];
      return {
        rolle,
        medspillerLeder: r.medforsvarerLeder,
        garantertFasit: r.garantert,
        garantertOffentlig: r.offGarantert,
        skjultGaranti: r.skjultGaranti,
        ikkeGarantert: r.ikkeGarantert,
        uklassifiserte: 0,
      };
    }),
    // Rå tellere per kandidat. Med dem kan enhver ny rad eller ny statistikk
    // regnes ut i ettertid uten å kjøre MesterAI på nytt – de timene er dyre.
    raaProfiler: profiler.map((p, i) => ({ kandidat: kolonner[i], ...p, sisteVrak: undefined })),
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
    `Atferdsprofil mot MesterAI: ${målRunder} runder, ` +
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
    for (const p of profiler) {
      p.sisteVrak = null;
      p.sisteBudPerSete = [null, null, null, null];
    }

    let state = opprettSpill({}, frø);
    await adapter.send(rundeStart(state));

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
        for (const p of profiler) {
          p.sisteVrak = null;
          p.sisteBudPerSete = [null, null, null, null];
        }
        continue;
      }

      const sete = state.fase === "VRAK" || state.fase === "VELG" ? state.budvinner! : state.iTur!;

      // 1) MesterAIs beslutning i DENNE stillingen – hentes, men ikke utført ennå.
      const svar = await adapter.send({ type: "beslutt", sete });
      const mesterH = handlingFraJson(svar.handling!);

      // 2) Alle kolonnene svarer på nøyaktig den samme stillingen.
      registrer(profiler[0]!, state, sete, mesterH, mesterH);
      for (let i = 0; i < kandidater.length; i++) {
        const p = profiler[i + 1]!;
        try {
          registrer(p, state, sete, kandidater[i]!.velg(state), mesterH);
        } catch {
          p.feil++;
        }
      }

      // 3) MesterAIs valg utføres: linja er MesterAIs, alltid.
      const fasenFør = state.fase;
      const res = utfør(state, mesterH);
      state = res.state;
      const ok = await adapter.send({ type: "handling", handling: handlingTilJson(mesterH) });
      sjekkSynk(state, ok, `runde ${state.rundeNr}, ${mesterH.type} fra sete ${sete}`);

      // Trumfen er kjent først NÅ. Tell hver kandidats vrakede kort i den fargen.
      if (fasenFør === "VELG" && state.trumf !== null) {
        for (const p of profiler) {
          for (const k of p.sisteVrak ?? []) if (k.farge === state.trumf) p.vrakISenereTrumf++;
          p.sisteVrak = null;
        }
      }

      for (const h of res.hendelser) {
        if (h.type !== "RUNDE_SLUTT") continue;
        ferdigeRunder++;
        const r = h.resultat;
        for (const p of profiler) {
          p.kontrakter++;
          const bud = p.sisteBudPerSete[r.budvinner];
          if (typeof bud === "number") {
            p.budetVar.push(bud);
            p.faktiskStikk.push(r.lagStikk);
            p.overskudd.push(r.lagStikk - bud);
            if (r.lagStikk >= bud) p.innfridd++;
          } else if (bud === "PASS" || bud === null) {
            p.villePasset++;
          }
        }
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
