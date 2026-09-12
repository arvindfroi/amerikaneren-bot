/**
 * LØPET MOT MENNESKET — K1 målt som det faktisk er formulert (12. sep).
 *
 *   node examples/lop-menneske.ts --klon "<klonespek>" --bot "<botspek>" --lop 100 \
 *     --skard 0/6 --ut analyse/lop-menneske/helbot-s0.jsonl
 *   node examples/lop-menneske.ts --dom analyse/lop-menneske/helbot-s*.jsonl
 *
 * ===================== HVA EIEREN BA OM ==================================
 *
 * «Over 100 race til 100 poeng skal mennesker bare vinne rundt 5 % av gangene.» Det er en
 * VINNERANDEL I HELE KAMPER, og det er ikke det K1 måler i dag. Duplikatet
 * (`duplikat-menneske.ts`) måler ΔP(seier) per runde med kortflaksen nullet ut — riktig som
 * duplikat, men det kan ikke gjøres om til en racesandel. `verktoy/race100.py` sier hvorfor:
 * et race er ~23 runder med en TERSKEL, så det er HALEN som avgjør, ikke snittet. To boter med
 * samme snitt per runde kan ha svært ulik racesjanse.
 *
 * Her spilles racet. Mennesket sitter i ett sete som en KLONE (`menn:`-speken,
 * `src/moe2/menneskeklon.ts`), tre botsete rundt, første til 100 vinner.
 *
 * ===================== SETET ROTERER =====================================
 *
 * Klonen sitter i sete `løp mod 4`. Giverrotasjonen og utspillsplikten gjør setene ULIKE, og en
 * klone som alltid satt i sete 0 ville målt sete 0 like mye som klonen. Over fire løp dekkes
 * alle fire, og frøet følger løpet — ikke setet — så armene ser de samme givene.
 *
 * ===================== KONTROLLEN SOM MÅ GI 25 % =========================
 *
 * `--klon` lik `--bot` er FIRE LIKE SETER, og da MÅ vinnerandelen for fokussetet være 25 % ±
 * støy. Er den ikke det, er seterotasjonen eller poengtellingen gal, og hvert annet tall denne
 * fila skriver er verdiløst. Kontrollen er ikke en formalitet — den er den eneste måten å se
 * forskjell på «klonen taper» og «harnesket teller feil». `test/lop-menneske.test.ts` kjører
 * den med en deterministisk spek og en FELLE: en rigget rotasjon som gir 0 % / 100 %, så det er
 * vist at sjekken kan slå ut.
 *
 * ===================== BÅNDET ============================================
 *
 * Frøbånd 1,250 G + k·7717, avsatt her. Disjunkt fra alt dokumentert i repoet: styrkebåndet
 * 1,900 G, portbåndene 1,800/1,850 G, kampbenken 1,950/1,985 G, `mlb-data` 2,000 G+,
 * `mlb-motalle` 2,100/2,150 G, trodata 1,6/1,7/1,75 G og `kamp.ts` 700 M.
 *
 * ===================== USIKKERHETEN ======================================
 *
 * Hvert løp er ETT uavhengig forsøk (eget frø, egne agenter), så andelen bootstrappes over løp:
 * 95 %-intervallet er persentiler av resamplingsfordelingen, ikke snitt ± 1,96 SE. Med en andel
 * nær 5 % og hundre løp er normaltilnærmingen dårlig nettopp der svaret betyr noe.
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { opprettSpill, utfør, type GameState } from "../src/motor.ts";
import { lagRng } from "../src/kort.ts";
import { lagIndre, tall } from "../src/moe2/agentspek.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const har = (n: string): boolean => process.argv.includes(n);

/** Frøbåndet for løpene. Se toppen — disjunkt fra hvert dokumentert bånd. */
export const LOP_BASE = 1_250_000_000;
export const LOP_STEG = 7717;

export interface Løperad {
  readonly frø: number;
  readonly løp: number;
  /** Setet klonen satt i. */
  readonly sete: number;
  readonly klonVant: 0 | 1;
  readonly vinner: number;
  readonly runder: number;
  readonly klonPoeng: number;
  readonly beste: number;
}

/**
 * ÉN KAMP TIL `målPoeng`. Agentene bygges per løp, som `examples/kamp.ts` gjør: en agent bærer
 * bok, økt og RNG, og to løp som deler dem er ikke uavhengige forsøk.
 *
 * `observer` kalles på HVER tilstand, også `RUNDE_SLUTT` — helboten har `okt:`, `profil:` og en
 * søketro som bokfører der, og uten kallet kaster søketroen i runde 2. Samme grunn som
 * kommentaren i `kamp.ts`.
 */
export function spillLøp(
  seter: readonly string[],
  frø: number,
  målPoeng: number,
  maksRunder: number,
): { vinner: number; poeng: number[]; runder: number } | null {
  const agenter = seter.map((sp) => lagIndre(sp));
  for (const a of agenter) a.nyKamp();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng }, frø);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.rundeNr < maksRunder && vakt++ < 200_000) {
    for (const a of agenter) a.observer?.(s);
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, agenter[iTur]!.velgHandling(s)).state;
  }
  for (const a of agenter) a.observer?.(s);
  if (s.fase !== "FERDIG" || s.vinner === null || s.vinner === undefined) return null;
  return { vinner: s.vinner, poeng: [...s.totalPoeng], runder: s.rundeNr };
}

/** Setet klonen sitter i for løp nummer `løp`. Roterer, se toppen. */
export const klonSete = (løp: number): number => ((løp % 4) + 4) % 4;

// ===========================================================================
// DOMMEN — ren funksjon, prøvd i test/lop-menneske.test.ts
// ===========================================================================

export interface Løpsdom {
  readonly n: number;
  readonly seire: number;
  readonly andel: number;
  readonly se: number;
  readonly lav: number;
  readonly høy: number;
  readonly runder: number;
  readonly perSete: number[];
}

/**
 * ANDELEN MED PERSENTIL-BOOTSTRAP over løp. Hvert løp er ett uavhengig forsøk, så resamplingen
 * er den enkleste som finnes — og den riktige: en normaltilnærming rundt 5 % på hundre løp
 * bommer på nettopp den halen spørsmålet handler om.
 */
export function domLøp(rader: readonly Løperad[], B = 20_000, frø = 20_260_912): Løpsdom {
  const n = rader.length;
  if (n === 0) return { n: 0, seire: 0, andel: NaN, se: NaN, lav: NaN, høy: NaN, runder: NaN, perSete: [0, 0, 0, 0] };
  const seire = rader.reduce((a, r) => a + r.klonVant, 0);
  const andel = seire / n;
  const runder = rader.reduce((a, r) => a + r.runder, 0) / n;
  const perSete = [0, 1, 2, 3].map((s) => {
    const i = rader.filter((r) => r.sete === s);
    return i.length === 0 ? NaN : i.reduce((a, r) => a + r.klonVant, 0) / i.length;
  });
  const rng = lagRng(frø);
  const prøver: number[] = [];
  let m1 = 0;
  let m2 = 0;
  for (let b = 0; b < B; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += rader[Math.floor(rng() * n)]!.klonVant;
    const v = s / n;
    prøver.push(v);
    m1 += v;
    m2 += v * v;
  }
  prøver.sort((a, b2) => a - b2);
  const m = m1 / B;
  return {
    n,
    seire,
    andel,
    se: Math.sqrt(Math.max(0, m2 / B - m * m)),
    lav: prøver[Math.floor(0.025 * B)]!,
    høy: prøver[Math.min(B - 1, Math.floor(0.975 * B))]!,
    runder,
    perSete,
  };
}

const pst = (x: number): string => `${(100 * x).toFixed(1)} %`;

// ===========================================================================
// DOM-MODUS
// ===========================================================================

function kjørDom(): void {
  const filer = process.argv.slice(process.argv.indexOf("--dom") + 1).filter((x) => !x.startsWith("--"));
  if (filer.length === 0) throw new Error("--dom <filer...>");
  const rader: Løperad[] = [];
  for (const f of filer) {
    for (const l of readFileSync(f, "utf8").split("\n")) {
      if (l === "") continue;
      rader.push(JSON.parse(l) as Løperad);
    }
  }
  const d = domLøp(rader);
  console.log(`${d.n} løp til 100 poeng, ${d.runder.toFixed(1)} runder per løp`);
  console.log(`KLONENS VINNERANDEL ${pst(d.andel)}  (${d.seire}/${d.n})  95 % [${pst(d.lav)}, ${pst(d.høy)}]  SE ${pst(d.se)}`);
  console.log(`  per sete: ${d.perSete.map((x, i) => `${i}: ${Number.isNaN(x) ? "–" : pst(x)}`).join("  ")}`);
  console.log(`\nFire like seter gir 25 %. Eierens mål for K1 er ~5 %.`);
  // Maskinlesbart, bakerst.
  console.log(`ANDEL ${d.andel.toFixed(5)}`);
  console.log(`LAV ${d.lav.toFixed(5)}`);
  console.log(`HOEY ${d.høy.toFixed(5)}`);
  console.log(`RUNDER ${d.runder.toFixed(2)}`);
  console.log(`N ${d.n}`);
}

// ===========================================================================
// KJØREMODUS
// ===========================================================================

function kjørLøp(): void {
  const KLON = arg("--klon", "");
  const BOT = arg("--bot", "");
  if (KLON === "" || BOT === "") throw new Error("--klon <spek> og --bot <spek> må oppgis");
  const LØP = tall(arg("--lop", "100"), 100, "--lop");
  const MÅL = tall(arg("--maalpoeng", "100"), 100, "--maalpoeng");
  const MAKS = tall(arg("--maksrunder", "200"), 200, "--maksrunder");
  const BASE = tall(arg("--froe", String(LOP_BASE)), LOP_BASE, "--froe");
  const UT = arg("--ut", "analyse/lop-menneske/s0.jsonl");
  const [SI, SN] = arg("--skard", "0/1").split("/").map(Number) as [number, number];
  if (!Number.isFinite(SI) || !Number.isFinite(SN) || SN < 1) throw new Error("--skard <i>/<n>");
  mkdirSync(dirname(UT), { recursive: true });

  const kontroll = KLON === BOT;
  console.log(
    `${LØP} løp til ${MÅL}${kontroll ? "  [KONTROLL: fire like seter, ventet 25 %]" : ""}\n` +
      `  klon: ${KLON}\n  bot:  ${BOT}`,
  );

  let skrevet = 0;
  let seire = 0;
  let uferdige = 0;
  const t0 = Date.now();
  for (let l = 0; l < LØP; l++) {
    if (l % SN !== SI) continue;
    const sete = klonSete(l);
    const frø = BASE + l * LOP_STEG;
    const seter = [0, 1, 2, 3].map((p) => (p === sete ? KLON : BOT));
    const r = spillLøp(seter, frø, MÅL, MAKS);
    if (r === null) {
      uferdige++;
      continue;
    }
    const klonVant: 0 | 1 = r.vinner === sete ? 1 : 0;
    seire += klonVant;
    const beste = Math.max(...r.poeng.filter((_, p) => p !== sete));
    const rad: Løperad = {
      frø,
      løp: l,
      sete,
      klonVant,
      vinner: r.vinner,
      runder: r.runder,
      klonPoeng: r.poeng[sete] ?? 0,
      beste,
    };
    appendFileSync(UT, JSON.stringify(rad) + "\n");
    skrevet++;
    const sek = (Date.now() - t0) / 1000;
    process.stdout.write(
      `\r  skard ${SI}/${SN}: ${skrevet} løp, klonen ${seire} (${pst(seire / Math.max(1, skrevet))}), ` +
        `${(sek / Math.max(1, skrevet)).toFixed(1)} s/løp   `,
    );
  }
  const sek = (Date.now() - t0) / 1000;
  console.log(
    `\nSkard ${SI}/${SN} ferdig: ${skrevet} løp, klonen vant ${seire}` +
      (uferdige > 0 ? `, ${uferdige} løp nådde ikke målet innen --maksrunder` : "") +
      ` → ${UT}`,
  );
  // Maskinlesbart, bakerst: kostnaden en full kjøring dimensjoneres etter.
  console.log(`SEKUNDER ${sek.toFixed(1)}`);
  console.log(`SEK-PER-LOEP ${skrevet > 0 ? (sek / skrevet).toFixed(1) : "nan"}`);
}

/**
 * BARE SOM KOMMANDO. `test/lop-menneske.test.ts` importerer `domLøp`, `klonSete` og `spillLøp`,
 * og uten denne vakten ville importen KJØRT kjøremodus og kastet på manglende `--klon`.
 * Samme mønster som `examples/kort-data.ts`.
 */
const inngang = process.argv[1];
if (inngang !== undefined && import.meta.url === pathToFileURL(inngang).href) {
  if (har("--dom")) kjørDom();
  else kjørLøp();
}
