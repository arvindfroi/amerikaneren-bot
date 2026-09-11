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
 */

import { appendFileSync } from "node:fs";

import {
  lovligeHandlinger,
  opprettSpill,
  utfør,
  type GameState,
  type Handling,
} from "../src/index.ts";
import { FARGER } from "../src/kort.ts";
import { lovligeEtterlys } from "../src/motor.ts";
import { lagIndre, ADAMS, tall, type Spekagent } from "../src/moe2/agentspek.ts";

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

const nyeAgenter = (vårt: number) =>
  [0, 1, 2, 3].map((p) => lagIndre(ANDRE === "" || p === vårt ? SPEK : ANDRE));

/**
 * Treets agenter under `--gjenbruk`, ett sett per sete når `--andre` gjør setene ulike.
 * Aldri de samme som rundens egne — se `runde`.
 */
const pooler = new Map<number, Spekagent[]>();
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

/** Antall egne forgreninger vinduet tillater. */
const BUDSJETT = FASE === "bud" ? 4 : FASE === "vrak" ? 1 : TIL - FRA + 1;

/**
 * Spiller en runde der `vårt` sete bruker taklinja inne i vinduet.
 *
 * RUNDEN FÅR ALLTID FERSKE AGENTER, også under `--gjenbruk`. Det er paringen: ren-runden
 * og takrunden skal ta nøyaktig de samme beslutningene FØR vinduet, og for en søkende
 * spek gjør de det bare når begge starter med RNG-en på frøet.
 */
function runde(frø: number, vårt: number, bruk: boolean) {
  const ag = nyeAgenter(vårt);
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let brukt = 0;
  let vakt = 0;
  let sumNoder = 0;
  let noenKappet = false;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    let h: Handling | null = null;
    if (bruk && brukt < BUDSJETT && iVindu(s, vårt)) {
      noder = 0;
      kappet = false;
      h = beste(s, vårt, BUDSJETT - brukt).kort;
      sumNoder += noder;
      noenKappet ||= kappet;
      if (h !== null) brukt++;
    }
    s = utfør(s, h ?? ag[iTur]!.velgHandling(s)).state;
  }
  return { poeng: poengFor(s, vårt), bv: s.budvinner, s, noder: sumNoder, kappet: noenKappet };
}

let n = 0;
let sum = 0;
let bedre = 0;
let antallKappet = 0;
const perRolle: Record<string, { n: number; sum: number; traff: number }> = {};

for (let g = 0; g < GIVER; g++) {
  if (g % SKARD_N !== SKARD_I) continue;
  const frø = FRØ + g * 7717;
  /**
   * REN-RUNDEN ÉN GANG PER GIV under `--gjenbruk`. Uten taklinja er `vårt` bare leseren
   * av poengtavla, så fire gjennomspillinger av samme runde med ferske agenter er fire
   * identiske tilstander. Med `--andre` sitter speken bare i vårt sete, og da er ren-runden
   * setets egen.
   */
  const ren = GJENBRUK && ANDRE === "" ? runde(frø, 0, false) : null;
  for (let sete = 0; sete < 4; sete++) {
    const a = ren === null ? runde(frø, sete, false) : { poeng: poengFor(ren.s, sete), bv: ren.s.budvinner };
    const b = runde(frø, sete, true);
    if (a.bv === null) continue;
    // I budvinduet KAN budvinneren bli en annen – det er hele poenget der.
    if (FASE !== "bud" && b.bv !== a.bv) continue;
    const d = b.poeng - a.poeng;
    n++;
    sum += d;
    if (d > 0) bedre++;
    const rolle = sete === a.bv ? "foerer" : "annet";
    const r = (perRolle[rolle] ??= { n: 0, sum: 0, traff: 0 });
    r.n++;
    r.sum += d;
    if (d > 0) r.traff++;
    const rad: Record<string, unknown> = { merke: MERKE, frø, sete, rolle, rein: a.poeng, tak: b.poeng, diff: d };
    if (Number.isFinite(MAKS_NODER)) {
      rad["noder"] = b.noder;
      rad["kappet"] = b.kappet;
      if (b.kappet) antallKappet++;
    }
    appendFileSync(UT, `${JSON.stringify(rad)}\n`);
  }
}

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
