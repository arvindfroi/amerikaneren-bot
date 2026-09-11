/**
 * TAKKARTET — HVOR I RUNDEN LIGGER POENGENE?
 *
 * ARVIND: «vil du ta mer audits og store analyser slik at vi kan finne
 * forklaringer, hull, og dermed forbedringspotensial.»
 *
 * §59 målte taket i de siste fem stikkene: +0,95 poeng per runde, og to
 * tredeler av det i 16 giver av 1000. Det var ett vindu. Denne filen måler
 * ALLE vinduene med nøyaktig samme metode, slik at tallene er sammenliknbare.
 *
 * METODEN. Vårt sete forgreiner seg over alle lovlige handlinger INNENFOR
 * vinduet; utenfor spiller det sin egen policy. De tre andre spiller alltid
 * sin ekte policy. Bladet er rundens poeng for vårt sete. Vi tar maksimum.
 *
 * Det er beste svar mot de faktiske motstanderne, MED klarsyn — fordi vi ser
 * hvordan hver linje faktisk endte. Ingen strategi kan gjøre det bedre. Et
 * lavt tall stenger et vindu; et høyt tall er en øvre grense, ikke et løfte.
 *
 * HVORFOR DETTE ER DEN VIKTIGSTE MÅLINGEN VI HAR. `fanget` er et forholdstall
 * mot et gulv og sier hvor NÆR vi er i hver fase, ikke hvor mange POENG som
 * ligger der. En fase kan være 95 % «fanget» og likevel romme mest av alt som
 * er igjen, hvis gulvet er høyt. Kartet her er i poeng, og poeng er målet.
 *
 * VINDUER:
 *   --fase bud                 budrunden, alle våre budturer
 *   --fase vrak                trumfvalget og etterlysningen
 *   --fase spill --fra A --til B   stikk A til B (0-indeksert)
 *
 * KOSTNAD. Forgreiningen er bare VÅR, så treet er ~b^v blader der v er antall
 * egne beslutninger i vinduet. Tre stikk med snitt 2–3 lovlige kort er noen
 * titalls utspillinger per beslutning.
 *
 * ============ HELE BOTEN I KARTET: TRE OPT-IN-KNOTTER (11. sep) ==========
 *
 * Med en søkende spek (`sik:alle:…`) er hvert blad en runde der fire seter søker, og
 * kartet ble uframkommelig. Knottene under er AV som standard, og da er stien og
 * hver rad byte-identisk med før.
 *
 *   --gjenbruk       Fire agenter for hele treet, nullstilt med `nyKamp()` der den
 *                    gamle koden bygde fire nye (`lagIndre` per node). I tillegg
 *                    spilles REN-runden (uten taklinje) én gang per giv i stedet for
 *                    én gang per sete: den avhenger ikke av setet, bare av hvem som
 *                    leser poengene. For en deterministisk spek er begge delene
 *                    bit-identiske med standardstien — `test/tak-kart-gjenbruk.test.ts`
 *                    holder det. For en søkende spek er de IKKE det: `Sikkerorakel`
 *                    nullstiller ikke RNG-en i `nyKamp()`, så utspillingene i treet
 *                    trekker en annen (like gyldig) strøm. Paringen FØR vinduet er
 *                    uendret, fordi hver runde fortsatt får ferske agenter. Med agent
 *                    A sitt deterministiske per-beslutning-frø forsvinner forskjellen.
 *   --maks-noder N   Tak på forgreinede noder per taksøk. Over taket spiller vårt
 *                    sete sin egen policy videre. Taket er da en NEDRE grense for det
 *                    ekte taket, og gapet likeså: «gapet er null» kan ikke leses fra et
 *                    kappet tre, «gapet er stort» kan. Radene får `noder` og `kappet`.
 *   --skard i/N      Bare giv g med g mod N = i, for parallelle prosesser.
 *   --andre <spek>   De TRE andre setene spiller denne speken, vårt sete `--spek`. Målt i
 *                    røyk: et budvindu med fire søkende seter kostet 190 prosess-sekunder
 *                    for ÉN giv. Spørsmålet blir «gapet til beste svar mot et bord av
 *                    <andre>», og det står i kravrapporten. Ren-runden og takrunden får
 *                    samme bord, så paringen holder.
 *
 * ============ DET NÅBARE TAKET OG BUDDUELLEN (11. sep, K3.1) =============
 *
 * Klarsynstaket i budvinduet kan ikke nås av noen budgiver (se `naabart-bud.ts`), så
 * K3.1-porten kunne aldri lukkes. Fire nye knotter, alle AV som standard — da er stien,
 * radene og utskriften byte-identiske med før (sha1 på fire små kjøringer 11. sep):
 *
 *   --naabart W       (bare `--fase bud`) En TREDJE runde per sete: ved HVER av våre
 *                     budturer spør setets agent som i ren-runden (samme kallfølge, så
 *                     paringen er eksakt), og budet byttes med `naabartBud` — argmax av
 *                     snittpoeng over W verdener fra setets visning. Radene får `naabart`,
 *                     `diffNaabart` (= naabart − rein) og `naabartEndret` (antall byttede
 *                     bud). KONTROLL GRATIS: `naabartEndret = 0` ⇒ `diffNaabart` eksakt 0.
 *   --naabart-spek S  Speken ALLE FIRE seter spiller i verdenene. Standard rundens egne
 *                     (`--spek` i vårt sete, `--andre` i de andre). `--naabart-kand K`
 *                     setter kandidatverdenene (standard 32).
 *   --mot-spek S      En runde per sete der vårt sete spiller S i stedet for `--spek`.
 *                     Byttes bare budlaget i speken, er det BUDDUELLEN: samme giv, samme
 *                     bord, samme kortspill, bare budet ulikt. Radene får `mot`, `diffMot`
 *                     (= mot − rein) og `motLik` (samme budfølge for setet). KONTROLL:
 *                     `motLik` ⇒ `diffMot` eksakt 0.
 *   --seier <fil>     100·ΔP(seier) for setet over runden fra 0–0 (`src/mlb/seier.ts`), i
 *                     `seierRein` og for hver arm som er på.
 *   --uten-tak        Hopp over klarsynstreet (`tak` og `diff` blir null). For armer der
 *                     bare det nåbare taket eller duellen skal leses.
 *
 * ============ DET NÅBARE TAKET I TRUMFVALGET OG KORTSPILLET (11. sep, K3.4/K3.6/K7) ====
 *
 * Klarsynstaket i `--fase vrak` og `--fase spill` har samme feil som det hadde i budet: det
 * leser hvordan hver linje faktisk endte. Batteriet 11. sep (iter1) ga Adams like stort gap
 * som hele boten i alle tre vinduene. To utvidelser, begge AV som standard — da er stien,
 * radene og utskriften byte-identiske med før (sha1 på fire små kjøringer 11. sep, også
 * `--fase bud --naabart`):
 *
 *   --naabart W       gjelder nå også `--fase vrak` og `--fase spill`. Ved HVER av våre
 *                     beslutninger INNE I VINDUET spørres setets agent som i ren-runden, og
 *                     handlingen byttes med `naabartHandling` (`naabart-handling.ts`): argmax av
 *                     snittpoeng over W verdener fra setets visning. Radene får de samme feltene
 *                     som i budet, pluss `naabartBeslutninger` (antall vurderte beslutninger).
 *                     KONTROLLEN er den samme: `naabartEndret = 0` ⇒ `diffNaabart` eksakt 0.
 *   --felle F         Vårt sete spiller FELLA inne i vinduet (etter å ha spurt agenten, så
 *                     paringen står): `lav` eller `tilfeldig` i `--fase spill`, `kortest` i
 *                     `--fase vrak` (se `felleHandling`). Gjelder ren-runden, klarsynsrunden og
 *                     den nåbare runden, ikke `--mot-spek`. Med `--naabart` er det porten sin
 *                     KRAFTPRØVE: en bevisst dårlig regel MÅ ha nåbart gap > 2 SE. Utspillingene
 *                     i verdenene spilles uten fella (`--naabart-spek`).
 */

import { appendFileSync } from "node:fs";

import {
  lovligeHandlinger,
  opprettSpill,
  utfør,
  type Bud,
  type GameState,
  type Handling,
} from "../src/index.ts";
import { FARGER } from "../src/kort.ts";
import { lovligeEtterlys } from "../src/motor.ts";
import { lagIndre, ADAMS, tall, type Spekagent } from "../src/moe2/agentspek.ts";
import { Seiersprediktor } from "../src/mlb/seier.ts";
import { naabartBud } from "./naabart-bud.ts";
import { FELLER, felleHandling, handlingNøkkel, naabartHandling, type Felle } from "./naabart-handling.ts";

const arg = (n: string, s: string) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const FRØ = tall(arg("--froe", "900000"), 900000, "froe");
const GIVER = tall(arg("--giver", "250"), 250, "giver");
const FASE = arg("--fase", "spill");
const FRA = tall(arg("--fra", "0"), 0, "fra");
const TIL = tall(arg("--til", "2"), 2, "til");
const UT = arg("--ut", "analyse/tak-kart.jsonl");
const MERKE = arg("--merke", `${FASE}-${FRA}-${TIL}`);
/**
 * HVILKEN BOT MÅLES MOT TAKET — og hvorfor det ikke er likegyldig.
 *
 * Kartet i §60 ble målt med `ADAMS`, den UTRULLEDE stakken: ingen `okt:`,
 * ingen `amu:`, ingen `profil:`. Tallet «sluttspillet er 0,3 % av taket» er
 * derfor gapet til taket for DEN boten, ikke for full stakk. Og det er full
 * stakk gate 2 måler kandidater i.
 *
 * Det er ikke en liten forskjell i prinsippet: alpha-mu sitter nettopp i
 * sluttspillet, så et vindu som er lukket for en bot uten `amu:` kan i
 * prinsippet være åpnet eller lukket hardere av en bot med den. Uten dette
 * flagget kunne spørsmålet ikke stilles.
 *
 * STANDARD ER `ADAMS`, så null-punktet er bit-identisk med hvert tall som
 * allerede står i `analyse/tak-enkelt-*.jsonl` og i §60. Verifisert ved at
 * `--fra 10 --til 10 --giver 250` reproduserer arkivet rad for rad.
 */
const SPEK = arg("--spek", ADAMS);
const GJENBRUK = process.argv.includes("--gjenbruk");
const MAKS_NODER_TEKST = arg("--maks-noder", "");
const MAKS_NODER = MAKS_NODER_TEKST === "" ? Infinity : tall(MAKS_NODER_TEKST, 0, "maks-noder");
const [SKARD_I, SKARD_N] = arg("--skard", "0/1").split("/").map((x) => tall(x, 0, "skard")) as [number, number];
const ANDRE = arg("--andre", "");
const NAABART_TEKST = arg("--naabart", "");
const NAABART = NAABART_TEKST === "" ? null : tall(NAABART_TEKST, 0, "naabart");
const NAABART_SPEK = arg("--naabart-spek", "");
const NAABART_KAND = tall(arg("--naabart-kand", "32"), 32, "naabart-kand");
const MOT_SPEK = arg("--mot-spek", "");
const SEIER = arg("--seier", "");
const UTEN_TAK = process.argv.includes("--uten-tak");
const FELLE_TEKST = arg("--felle", "");
const FELLE: Felle | null = FELLE_TEKST === "" ? null : (FELLE_TEKST as Felle);
if (FELLE !== null && !FELLER.includes(FELLE)) throw new Error(`--felle må være én av ${FELLER.join(", ")}, fikk «${FELLE_TEKST}»`);
if (FELLE !== null && (FASE === "bud" || (FELLE === "kortest") !== (FASE === "vrak"))) {
  throw new Error(`--felle ${FELLE} passer ikke til --fase ${FASE} (kortest: vrak; lav/tilfeldig: spill)`);
}
const prediktor = SEIER === "" ? null : Seiersprediktor.fraFil(SEIER);

const nyeAgenter = (vårt: number, egen: string = SPEK) =>
  [0, 1, 2, 3].map((p) => lagIndre(p === vårt ? egen : ANDRE === "" ? SPEK : ANDRE));

/**
 * Treets agenter under `--gjenbruk`, ett sett per sete når `--andre` gjør setene ulike.
 * Aldri de samme som rundens egne — se `runde`.
 */
const pooler = new Map<number, Spekagent[]>();
/** Utspillingsagentene i det nåbare taket: ett sett, eller ett per sete når bordet er ulikt. */
const naabartPooler = new Map<number, Spekagent[]>();
function naabartAgenter(vårt: number): Spekagent[] {
  const nøkkel = NAABART_SPEK !== "" || ANDRE === "" ? 0 : vårt;
  let pool = naabartPooler.get(nøkkel);
  if (pool === undefined) {
    pool = NAABART_SPEK === "" ? nyeAgenter(vårt) : [0, 1, 2, 3].map(() => lagIndre(NAABART_SPEK));
    naabartPooler.set(nøkkel, pool);
  }
  return pool;
}
/** Forgreinede noder i det pågående taksøket, og om taket ble nådd. */
let noder = 0;
let kappet = false;

/** Er dette en av VÅRE beslutninger inne i vinduet vi måler? */
function iVindu(s: GameState, vårt: number): boolean {
  const spiller = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
  if (spiller !== vårt) return false;
  if (FASE === "bud") return s.fase === "BUDRUNDE";
  if (FASE === "vrak") return s.fase === "VELG";
  return s.fase === "SPILL" && s.stikkSpilt >= FRA && s.stikkSpilt <= TIL;
}

/**
 * Alle lovlige handlinger for `vårt` i den fasen vi står i.
 *
 * VRAK ER UTELATT MED VILJE. Å velge 4 av 16 kort er 1 820 kombinasjoner
 * ganget med trumfvalget — en helt annen kostnadsklasse enn resten av kartet,
 * og et tall som ikke ville vært sammenliknbart med de andre vinduene. `velg`
 * (trumf + etterlysning) er derimot en håndfull valg og måles.
 */
function alternativer(s: GameState, vårt: number): Handling[] {
  const l = lovligeHandlinger(s);
  if (l.fase === "BUDRUNDE") return l.bud.map((b) => ({ type: "BUD", spiller: vårt, bud: b }) as Handling);
  if (l.fase === "SPILL") return l.kort.map((k) => ({ type: "SPILL", spiller: vårt, kort: k }) as Handling);
  if (l.fase === "VELG") {
    /**
     * Alle trumffarger, med den HØYESTE lovlige etterlysningen i hver.
     *
     * Etterlysningen kan ikke arves fra policyen: den MÅ ligge i trumffargen,
     * og motoren kaster «Det etterlyste kortet må være i trumffargen» hvis den
     * ikke gjør det. Første forsøk gjorde nettopp det, og krasjet på giv 1 —
     * høylytt, som det skal.
     *
     * Høyeste er også konvensjonen boten selv følger, så vi måler TRUMFVALGET
     * og ikke to beslutninger på én gang.
     */
    const ut: Handling[] = [];
    for (const f of FARGER) {
      const kand = lovligeEtterlys(s, f);
      if (l.måEtterlyse && kand.length === 0) continue;
      const beste = kand.reduce<(typeof kand)[number] | null>(
        (a, k) => (a === null || k.verdi > a.verdi ? k : a),
        null,
      );
      ut.push({ type: "VELG", spiller: vårt, trumf: f, etterlyst: beste } as Handling);
    }
    return ut;
  }
  return [];
}

/** Maks poeng for `vårt` fra denne stillingen, med `budsjett` egne forgreninger igjen. */
function beste(state: GameState, vårt: number, budsjett: number): { poeng: number; kort: Handling | null } {
  /**
   * GJENBRUKEN ER TRYGG AV EN STRUKTURELL GRUNN: en node bruker agentene sine BARE i
   * løkka under, før den forgreiner seg. Når barna er ferdige, rører den dem aldri
   * igjen. Ett sett nullstilt her er derfor det samme som et nytt sett her — så langt
   * `nyKamp()` er det samme som en ny agent.
   */
  let ag: Spekagent[];
  if (GJENBRUK) {
    const nøkkel = ANDRE === "" ? 0 : vårt;
    let pool = pooler.get(nøkkel);
    if (pool === undefined) {
      pool = nyeAgenter(vårt);
      pooler.set(nøkkel, pool);
    }
    for (const a of pool) a.nyKamp();
    ag = pool;
  } else {
    ag = nyeAgenter(vårt);
  }
  let s = state;
  let vakt = 0;

  // Spill fram til neste beslutning som er VÅR og inne i vinduet.
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
    if (budsjett > 0 && iVindu(s, vårt)) break;
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, ag[iTur]!.velgHandling(s)).state;
  }
  if (s.fase === "FERDIG" || s.fase === "RUNDE_SLUTT" || budsjett <= 0 || !iVindu(s, vårt)) {
    return { poeng: poengFor(s, vårt), kort: null };
  }
  if (noder >= MAKS_NODER) {
    // TAKET PÅ TREET: herfra spiller vårt sete sin egen policy. Nedre grense, se hodet.
    kappet = true;
    return beste(s, vårt, 0);
  }
  noder++;

  let bestP = -Infinity;
  let bestK: Handling | null = null;
  for (const h of alternativer(s, vårt)) {
    const r = beste(utfør(s, h).state, vårt, budsjett - 1);
    if (r.poeng > bestP) {
      bestP = r.poeng;
      bestK = h;
    }
  }
  return bestK === null ? { poeng: poengFor(s, vårt), kort: null } : { poeng: bestP, kort: bestK };
}

function poengFor(s: GameState, sete: number): number {
  return s.sisteRunde?.delta?.[sete] ?? 0;
}

/** 100·(P(seier) etter runden − P(seier) ved 0–0) for `sete`; fasiten når runden avsluttet kampen. */
function seierFor(s: GameState, sete: number): number {
  const før = prediktor!.fordeling(s.totalPoeng.map(() => 0), sete, s.regler.målPoeng)[0]!;
  const etter = s.fase === "FERDIG" ? (s.vinner === sete ? 1 : 0) : prediktor!.fordeling(s.totalPoeng, sete, s.regler.målPoeng)[0]!;
  return 100 * (etter - før);
}

/** Antall egne forgreninger vinduet tillater. */
const BUDSJETT = FASE === "bud" ? 4 : FASE === "vrak" ? 1 : TIL - FRA + 1;

/**
 * Spiller en runde der `vårt` sete bruker taklinja inne i vinduet.
 *
 * RUNDEN FÅR ALLTID FERSKE AGENTER, også under `--gjenbruk`. Det er paringen: ren-runden
 * og takrunden skal ta nøyaktig de samme beslutningene FØR vinduet, og for en søkende
 * spek gjør de det bare når begge starter med RNG-en på frøet.
 *
 * `modus` «naabart» bytter hvert av VÅRE bud med det nåbare, ETTER at setets agent er
 * spurt som i ren-runden; «mot» lar vårt sete spille `--mot-spek`. `bud` er budfølgen per
 * sete, for `motLik`.
 */
function runde(frø: number, vårt: number, bruk: boolean, modus: "tak" | "naabart" | "mot" = "tak") {
  const ag = nyeAgenter(vårt, modus === "mot" ? MOT_SPEK : SPEK);
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let brukt = 0;
  let vakt = 0;
  let sumNoder = 0;
  let noenKappet = false;
  let endret = 0;
  let vurdert = 0;
  const bud: Bud[][] = [[], [], [], []];
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    let h: Handling | null = null;
    if (bruk && modus === "tak" && brukt < BUDSJETT && iVindu(s, vårt)) {
      noder = 0;
      kappet = false;
      h = beste(s, vårt, BUDSJETT - brukt).kort;
      sumNoder += noder;
      noenKappet ||= kappet;
      if (h !== null) brukt++;
    }
    /**
     * FELLA OG DET NÅBARE TAKET I VRAK/SPILL. Agenten spørres FØRST, som i ren-runden, så en
     * søkende spek med tro eller hukommelse ser nøyaktig samme kallfølge i begge runder til den
     * første byttede handlingen. Fella erstatter så policyens valg, og det nåbare taket kan
     * igjen erstatte fellas. Budvinduet går sin gamle vei under (byte-identisk).
     */
    const iMittVindu = h === null && modus !== "mot" && iTur === vårt && FASE !== "bud" && iVindu(s, vårt);
    if (iMittVindu && (FELLE !== null || (bruk && modus === "naabart"))) {
      const eget = ag[iTur]!.velgHandling(s);
      h = FELLE === null ? eget : felleHandling(FELLE, s, vårt);
      if (bruk && modus === "naabart") {
        vurdert++;
        const v = naabartHandling(s, vårt, h, { verdener: NAABART!, kandidater: NAABART_KAND, agenter: naabartAgenter(vårt) });
        if (handlingNøkkel(v.handling) !== handlingNøkkel(h)) {
          endret++;
          h = v.handling;
        }
      }
    }
    // `FASE === "bud"`: da `--naabart` ble åpnet for vrak/spill, byttet denne grenen også BUDENE i
    // de vinduene (røyk 11. sep: `naabartEndret` 2 med én vurdert trumfbeslutning, og en ikke-
    // budvinner som fikk trumfvalget). Prøvd i `test/naabart-handling.test.ts`.
    if (bruk && modus === "naabart" && FASE === "bud" && s.fase === "BUDRUNDE" && iTur === vårt) {
      const eget = ag[iTur]!.velgHandling(s);
      h = eget;
      if (eget.type === "BUD") {
        const v = naabartBud(s, vårt, eget.bud, { verdener: NAABART!, kandidater: NAABART_KAND, agenter: naabartAgenter(vårt) });
        if (v.bud !== eget.bud) {
          endret++;
          h = { type: "BUD", spiller: vårt, bud: v.bud };
        }
      }
    }
    const handling = h ?? ag[iTur]!.velgHandling(s);
    if (handling.type === "BUD") bud[handling.spiller]!.push(handling.bud);
    s = utfør(s, handling).state;
  }
  return { poeng: poengFor(s, vårt), bv: s.budvinner, s, noder: sumNoder, kappet: noenKappet, endret, vurdert, bud };
}

const budLik = (a: readonly Bud[], b: readonly Bud[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

let n = 0;
let sum = 0;
let bedre = 0;
let antallKappet = 0;
const perRolle: Record<string, { n: number; sum: number; traff: number }> = {};
let nNaabart = 0;
let sumNaabart = 0;
let naabartEndret = 0;
let naabartBrudd = 0;
let naabartVurdert = 0;
let nMot = 0;
let sumMot = 0;
let motLik = 0;
let motBrudd = 0;

for (let g = 0; g < GIVER; g++) {
  if (g % SKARD_N !== SKARD_I) continue;
  const frø = FRØ + g * 7717;
  /**
   * REN-RUNDEN ÉN GANG PER GIV under `--gjenbruk`. Uten taklinja er `vårt` bare leseren
   * av poengtavla, så fire gjennomspillinger av samme runde med ferske agenter er fire
   * identiske tilstander. Med `--andre` sitter speken bare i vårt sete, og da er ren-runden
   * setets egen.
   */
  // Med `--felle` spiller vårt sete fella også i ren-runden, så den er setets egen.
  const ren = GJENBRUK && ANDRE === "" && FELLE === null ? runde(frø, 0, false) : null;
  for (let sete = 0; sete < 4; sete++) {
    const a = ren === null ? runde(frø, sete, false) : { poeng: poengFor(ren.s, sete), bv: ren.s.budvinner, s: ren.s, bud: ren.bud };
    const b = UTEN_TAK ? null : runde(frø, sete, true);
    if (a.bv === null) continue;
    // I budvinduet KAN budvinneren bli en annen – det er hele poenget der.
    if (FASE !== "bud" && b !== null && b.bv !== a.bv) continue;
    const rolle = sete === a.bv ? "foerer" : "annet";
    const rad: Record<string, unknown> = { merke: MERKE, frø, sete, rolle, rein: a.poeng, tak: null, diff: null };
    if (b !== null) {
      const d = b.poeng - a.poeng;
      n++;
      sum += d;
      if (d > 0) bedre++;
      const r = (perRolle[rolle] ??= { n: 0, sum: 0, traff: 0 });
      r.n++;
      r.sum += d;
      if (d > 0) r.traff++;
      rad["tak"] = b.poeng;
      rad["diff"] = d;
      if (Number.isFinite(MAKS_NODER)) {
        rad["noder"] = b.noder;
        rad["kappet"] = b.kappet;
        if (b.kappet) antallKappet++;
      }
    }
    if (prediktor !== null) rad["seierRein"] = seierFor(a.s, sete);
    if (NAABART !== null) {
      const c = runde(frø, sete, true, "naabart");
      const d = c.poeng - a.poeng;
      rad["naabart"] = c.poeng;
      rad["diffNaabart"] = d;
      rad["naabartEndret"] = c.endret;
      if (FASE !== "bud") rad["naabartBeslutninger"] = c.vurdert;
      if (prediktor !== null) rad["seierNaabart"] = seierFor(c.s, sete);
      nNaabart++;
      naabartVurdert += c.vurdert;
      sumNaabart += d;
      if (c.endret > 0) naabartEndret++;
      else if (d !== 0) naabartBrudd++;
    }
    if (MOT_SPEK !== "") {
      const m = runde(frø, sete, false, "mot");
      const d = m.poeng - a.poeng;
      const lik = budLik(m.bud[sete]!, a.bud[sete]!);
      rad["mot"] = m.poeng;
      rad["diffMot"] = d;
      rad["motLik"] = lik;
      if (prediktor !== null) rad["seierMot"] = seierFor(m.s, sete);
      nMot++;
      sumMot += d;
      if (lik) {
        motLik++;
        if (d !== 0) motBrudd++;
      }
    }
    appendFileSync(UT, `${JSON.stringify(rad)}\n`);
  }
}

if (!UTEN_TAK) {
  console.log(`# TAKKART ${MERKE}   n=${n}   budsjett=${BUDSJETT}`);
  console.log(`snitt poenggevinst per runde: ${(sum / n).toFixed(4)}`);
  console.log(`giver med gevinst: ${bedre} (${((100 * bedre) / n).toFixed(1)} %)`);
  for (const [k, v] of Object.entries(perRolle)) {
    const nårTraff = v.traff > 0 ? v.sum / v.traff : 0;
    console.log(
      `  ${k.padEnd(8)} n=${String(v.n).padStart(5)}  ${(v.sum / v.n).toFixed(4)}  traff ${v.traff} (${((100 * v.traff) / v.n).toFixed(1)} %)  naar den traff ${nårTraff.toFixed(1)}`,
    );
  }
  if (Number.isFinite(MAKS_NODER)) {
    console.log(`kappet ved ${MAKS_NODER} noder: ${antallKappet} av ${n} rader — gapet der er en NEDRE grense`);
  }
}
if (NAABART !== null) {
  console.log(
    `# NÅBART TAK W=${NAABART} kand=${NAABART_KAND}   n=${nNaabart}   snitt ${(sumNaabart / nNaabart).toFixed(4)}   ` +
      `rader med byttet bud ${naabartEndret}   uendret men ulik 0: ${naabartBrudd} (MÅ være 0)`,
  );
  if (FASE !== "bud") console.log(`# NÅBART ${MERKE}: ${naabartVurdert} beslutninger vurdert i vinduet${FELLE === null ? "" : `, felle ${FELLE}`}`);
}
if (MOT_SPEK !== "") {
  console.log(
    `# MOT-SPEK   n=${nMot}   snitt mot − rein ${(sumMot / nMot).toFixed(4)}   samme budfølge ${motLik}   samme bud men ulik 0: ${motBrudd} (MÅ være 0)`,
  );
}
