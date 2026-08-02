/**
 * GATE 2: er en ny vekt bedre enn den som staar ute – VED VAART EGET BORD?
 *
 *   node examples/gate2.ts \
 *     --kandidat vakt:abmp:e1:e1-modell/ablasjon-v1.bin \
 *     --kandidat vakt:abmp:e1:e1-modell/ablasjon-v2.bin \
 *     --miljo vakt:abmp:e1:e1-modell/sd-r2.bin \
 *     --froe 900000 --giver 400 --skard 0/8 --ut analyse/gate2-0.jsonl
 *
 * ================= HVORFOR IKKE `neat-evaluer.ts` =========================
 *
 * neat-evaluer setter kandidaten i ETT sete og `grådig` i de tre andre. Det
 * gir et tall, men ikke det tallet vi trenger, av to grunner:
 *
 *   MILJOET ER FEIL. Arvind: «du må jo bruke de beste bottene vi har.» Vi
 *   skal spille mot MesterAI og mot familien, ikke mot en grådig agent. En
 *   forskjell maalt ved et svakt bord har ingen garanti for aa overleve ved
 *   et sterkt – linjer som straffes haardt av gode motstandere ser billige ut
 *   naar ingen straffer dem.
 *
 *   OG DET ER SKJEVT MOT KANDIDATEN. Nettene her trenes med
 *   `--motpart vakt:abmp`, altsaa med vaar egen beste bot i rolloutene. Et
 *   grådig bord er utenfor den fordelingen de er trent for, men ikke
 *   noedvendigvis utenfor fordelingen den GAMLE vekten ble trent for. Da
 *   maaler man hvem som passer testmiljoet, ikke hvem som spiller best.
 *
 * Derfor: alle fire seter er `vakt:abmp`, og BARE vektene skiller kandidaten
 * fra de tre andre. Samme forsoeksdesign som `budagent-benk.ts`.
 *
 * ============================ MAALTALLET ==================================
 *
 * Poengdifferanse per runde for kandidatsetet mot snittet av de tre andre.
 * Referansen er noedvendig: uten den summerer poengene til null over setene,
 * og enhver effekt forsvinner per konstruksjon.
 *
 * KONTROLLARMEN er miljoet mot seg selv i samme sete. Den skal maale 0 innen
 * stoeyen. Gjoer den ikke det, er det seteskjevhet i oppsettet og ingen av de
 * andre tallene kan leses.
 *
 * Parret paa (giv, sete), tegntest ved siden av snittet fordi poengene har
 * +/-50 og +/-100 i halene.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { Ensemble, type EnsembleModus } from "../src/moe2/ensemble.ts";

let giver = 400;
let frøBase = 900_000;
let skardI = 0;
let skardN = 1;
const kandidater: string[] = [];
let miljøSpek = "vakt:abmp:e1:e1-modell/sd-r2.bin";
let ut = "analyse/gate2-0.jsonl";
let rapport: string | null = null;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--giver") giver = Number(process.argv[++i]);
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--kandidat") kandidater.push(process.argv[++i]!);
  else if (a === "--miljo") miljøSpek = process.argv[++i]!;
  else if (a === "--ut") ut = process.argv[++i]!;
  else if (a === "--rapport") rapport = process.argv[++i]!;
  else if (a === "--skard") {
    const [x, y] = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(x);
    skardN = Number(y);
  }
}

interface Linje {
  giv: number;
  sete: number;
  /** armnavn → poengdifferanse for setet. */
  d: Record<string, number>;
}

const sn = (v: readonly number[]): number => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const se = (v: readonly number[]): number => {
  if (v.length < 2) return NaN;
  const m = sn(v);
  let s = 0;
  for (const x of v) s += (x - m) * (x - m);
  return Math.sqrt(s / (v.length - 1) / v.length);
};
function tegntest(k: number, n: number): number {
  if (n === 0) return NaN;
  const lf: number[] = [0];
  for (let i = 1; i <= n; i++) lf[i] = lf[i - 1]! + Math.log(i);
  const m = Math.min(k, n - k);
  let s = 0;
  for (let i = 0; i <= m; i++) s += Math.exp(lf[n]! - lf[i]! - lf[n - i]! - n * Math.LN2);
  return Math.min(1, 2 * s);
}

if (rapport !== null) {
  const R: Linje[] = [];
  const kat = dirname(rapport);
  const møn = basename(rapport).replace(/\*/g, ".*");
  const re = new RegExp("^" + møn + "$");
  for (const f of readdirSync(kat).filter((x) => re.test(x))) {
    for (const l of readFileSync(join(kat, f), "utf8").split("\n")) {
      if (l.trim() === "") continue;
      try {
        R.push(JSON.parse(l) as Linje);
      } catch {
        continue;
      }
    }
  }
  const armer = [...new Set(R.flatMap((r) => Object.keys(r.d)))];
  const L = [
    ``,
    `=== GATE 2: kandidat i ett sete, ${miljøSpek} i de tre andre ===`,
    `${R.length} (giv, sete). Alle fire seter har konvensjonsvakten; bare vektene skiller.`,
    ``,
    `arm                                        poeng/runde for setet`,
    `--------------------------------------------------------------------`,
    ...armer.map((k) => {
      const v = R.map((r) => r.d[k] ?? NaN).filter(Number.isFinite);
      return `${k.padEnd(42)} ${(sn(v) >= 0 ? "+" : "") + sn(v).toFixed(3)} ± ${se(v).toFixed(3)}`;
    }),
    `--------------------------------------------------------------------`,
    ``,
    `PARRET mot KONTROLL (miljoet mot seg selv i samme sete):`,
  ];
  for (const k of armer) {
    if (k === "KONTROLL") continue;
    const d = R.map((r) => (r.d[k] ?? NaN) - (r.d["KONTROLL"] ?? NaN)).filter(Number.isFinite);
    if (d.length < 2) continue;
    const pos = d.filter((x) => x > 0).length;
    const neg = d.filter((x) => x < 0).length;
    L.push(
      `  ${k.padEnd(40)} ${(sn(d) >= 0 ? "+" : "") + sn(d).toFixed(4)} ± ${se(d).toFixed(4)} ` +
        `(${(sn(d) / se(d)).toFixed(1)} SE)  ${pos}/${pos + neg}  p=${tegntest(pos, pos + neg).toFixed(3)}`,
    );
  }
  L.push(
    ``,
    `KONTROLLARMEN skal ligge paa 0. Gjoer den ikke det, er det seteskjevhet`,
    `i oppsettet, og ingen av de andre tallene kan leses.`,
    ``,
    `PORTEN: en ny vekt adopteres bare om den er positiv med margin OG`,
    `positiv i klart over halvparten av parene. Aldri adoptere paa stoey.`,
  );
  const tekst = L.join("\n");
  console.log(tekst);
  writeFileSync(rapport.replace(/[-*\d]*\.jsonl$/, ".txt"), tekst + "\n");
  process.exit(0);
}

if (kandidater.length === 0) {
  console.error("Bruk: --kandidat <vaktspek> [--kandidat ...] --miljo <vaktspek>");
  process.exit(1);
}

type Velger = { velgHandling(s: GameState): Handling; nyKamp(): void };
/** Nettene leses ÉN gang og deles; E1Agent holder ingen tilstand mellom kamper. */
const nettbuf = new Map<string, ReturnType<typeof lesE1Nett>>();
const lesNett = (fil: string): ReturnType<typeof lesE1Nett> => {
  if (!nettbuf.has(fil)) nettbuf.set(fil, lesE1Nett(fil));
  return nettbuf.get(fil)!;
};

/**
 * Indre agent av spekken etter `vakt:<flagg>:`. To former:
 *   e1:<fil>                      – ett nett
 *   ens:<modus>:<fil1,fil2,...>   – flere nett som stemmer
 */
function lagIndre(indre: string): { velgHandling(s: GameState): Handling; nyKamp(): void } {
  if (indre.startsWith("e1:")) return new E1Agent(lesNett(indre.slice(3)));
  if (indre.startsWith("ens:")) {
    const rest = indre.slice(4);
    const skille = rest.indexOf(":");
    if (skille < 0) throw new Error(`Ugyldig ensemblespek «${indre}» – forventet ens:<modus>:<filer>`);
    const modus = rest.slice(0, skille) as EnsembleModus;
    if (modus !== "snitt" && modus !== "rang" && modus !== "flertall") {
      throw new Error(`Ukjent ensemblemodus «${modus}» (snitt, rang, flertall)`);
    }
    const filer = rest
      .slice(skille + 1)
      .split(",")
      .filter((x) => x !== "");
    if (filer.length < 2) throw new Error(`Ensemble med ${filer.length} nett – bruk e1: for ett`);
    return new Ensemble(filer.map(lesNett), modus);
  }
  throw new Error(`Ukjent indre agent «${indre}» (e1:<fil> eller ens:<modus>:<filer>)`);
}

function lagVelger(spek: string): Velger {
  const v = delVaktspek(spek);
  if (v === null) throw new Error(`Ugyldig vaktspek «${spek}» – forventet vakt:<flagg>:<indre>`);
  return new Konvensjonsvakt(lagIndre(v.indre), v.valg);
}

mkdirSync(dirname(ut), { recursive: true });
const armer: { navn: string; spek: string }[] = [
  { navn: "KONTROLL", spek: miljøSpek },
  ...kandidater.map((s) => ({ navn: s, spek: s })),
];

/** Spiller giva med `spek` i `sete` og miljoet i de tre andre. */
function spill(frø: number, sete: number, spek: string): number | null {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  const v: Velger[] = [0, 1, 2, 3].map((p) => lagVelger(p === sete ? spek : miljøSpek));
  for (const b of v) b.nyKamp();
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    s = utfør(s, v[iTur]!.velgHandling(s)).state;
  }
  if (s.fase === "BUDRUNDE" || s.budvinner === null) return null;
  const p = s.totalPoeng;
  const egne = p[sete] ?? 0;
  return Math.round((egne - (p.reduce((a, x) => a + x, 0) - egne) / 3) * 1000) / 1000;
}

let n = 0;
for (let f = 0; f < giver; f++) {
  if (f % skardN !== skardI) continue;
  const frø = (frøBase + f) >>> 0;
  for (let sete = 0; sete < 4; sete++) {
    const d: Record<string, number> = {};
    let ok = true;
    for (const a of armer) {
      const r = spill(frø, sete, a.spek);
      if (r === null) {
        ok = false;
        break;
      }
      d[a.navn] = r;
    }
    if (!ok) continue;
    appendFileSync(ut, JSON.stringify({ giv: frø, sete, d } satisfies Linje) + "\n");
    n++;
  }
  process.stdout.write(`\r  skard ${skardI}: ${n} rader   `);
}
console.log(`\nSkard ${skardI} ferdig: ${n} rader → ${ut}`);
