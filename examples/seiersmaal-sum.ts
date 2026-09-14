/**
 * SAMMENDRAG av `examples/seiersmaal-fasit.ts`.
 *
 * Klyngebootstrap over KAMPER, B = 20 000. SE er bootstrapfordelingens standardavvik —
 * **ikke delt på √n en gang til** (`dekomp.md` §0, og feilen eieren gjorde i går med en
 * `sd()` som delte på n to ganger og ga 21× for små feilmarginer).
 *
 * Anger regnes BARE der den aktuelle fasiten skiller. Undergrupper er beste-av-mange
 * og merkes som det.
 *
 *   node examples/seiersmaal-sum.ts analyse/seiersmaal-w*.jsonl
 */
import { readFileSync } from "node:fs";

interface Rad {
  kamp: number;
  runde: number;
  stikk: number;
  sete: number;
  rolle: string | null;
  igjen: number;
  nLov: number;
  nKlasser: number;
  tavle: number[];
  maalPoeng: number;
  ledende: number;
  spredPoeng: number;
  spredP: number;
  vektorFlat: boolean;
  botKort: number;
  botV: number | null;
  botP: number | null;
  maksV: number;
  maksP: number;
  minP: number;
  argmaksPoeng: number;
  argmaksP: number;
  byttet: boolean;
  angerPoeng: number | null;
  angerP: number | null;
  P: number[];
  V: number[];
}

const filer = process.argv.slice(2).filter((x) => !x.startsWith("--"));
if (filer.length === 0) throw new Error("oppgi minst én jsonl-fil");

const rader: Rad[] = [];
const sett = new Set<string>();
let duplikat = 0;
for (const f of filer) {
  for (const l of readFileSync(f, "utf8").split("\n")) {
    if (l.trim() === "") continue;
    const r = JSON.parse(l) as Rad;
    // Duplikatkontroll — feilen bandit-kjøringen gikk i (to arbeidersett, samme filer).
    const n = `${r.kamp}|${r.runde}|${r.stikk}|${r.sete}`;
    if (sett.has(n)) {
      duplikat++;
      continue;
    }
    sett.add(n);
    rader.push(r);
  }
}
if (duplikat > 0) {
  console.error(`AVVIST: ${duplikat} dupliserte rader — to arbeidersett har skrevet samme kamper.`);
  process.exit(1);
}

const kamper = [...new Set(rader.map((r) => r.kamp))].sort((a, b) => a - b);
const perKamp = new Map<number, Rad[]>();
for (const k of kamper) perKamp.set(k, []);
for (const r of rader) perKamp.get(r.kamp)!.push(r);

/** Enkel deterministisk RNG, så sammendraget er reproduserbart. */
function lagRng(frø: number): () => number {
  let s = frø >>> 0;
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    return s / 4_294_967_296;
  };
}

const B = 20_000;

/**
 * Klyngebootstrap: trekk KAMPER med tilbakelegging, regn statistikken på nytt.
 * SE = SD i bootstrapfordelingen. Ingen ekstra deling på √n.
 */
function boot(utvalg: Rad[], stat: (rr: Rad[]) => number | null): { est: number | null; se: number; n: number } {
  const est = stat(utvalg);
  if (est === null) return { est: null, se: NaN, n: utvalg.length };
  const grupper = new Map<number, Rad[]>();
  for (const r of utvalg) {
    if (!grupper.has(r.kamp)) grupper.set(r.kamp, []);
    grupper.get(r.kamp)!.push(r);
  }
  const nøkler = [...grupper.keys()];
  if (nøkler.length < 2) return { est, se: NaN, n: utvalg.length };
  const rng = lagRng(20_260_914);
  const verdier: number[] = [];
  for (let b = 0; b < B; b++) {
    const bag: Rad[] = [];
    for (let i = 0; i < nøkler.length; i++) {
      bag.push(...grupper.get(nøkler[Math.floor(rng() * nøkler.length)]!)!);
    }
    const v = stat(bag);
    if (v !== null) verdier.push(v);
  }
  const m = verdier.reduce((a, b2) => a + b2, 0) / verdier.length;
  const sd = Math.sqrt(verdier.reduce((a, b2) => a + (b2 - m) ** 2, 0) / verdier.length);
  return { est, se: sd, n: utvalg.length };
}

const andel = (pred: (r: Rad) => boolean) => (rr: Rad[]): number | null =>
  rr.length === 0 ? null : (100 * rr.filter(pred).length) / rr.length;

const snitt = (v: (r: Rad) => number | null) => (rr: Rad[]): number | null => {
  const xs = rr.map(v).filter((x): x is number => x !== null);
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
};

const f = (x: number | null, d = 1): string => (x === null ? "—" : x.toFixed(d));
const pm = (r: { est: number | null; se: number }, d = 1): string =>
  r.est === null ? "—" : `${r.est.toFixed(d)} ± ${Number.isNaN(r.se) ? "—" : r.se.toFixed(d)}`;

const FLAT_POENG = (r: Rad): boolean => r.spredPoeng < 1e-9;
const FLAT_P = (r: Rad): boolean => r.spredP < 0.01;

console.log(`\n=== GRUNNLAG ===`);
console.log(`stillinger: ${rader.length}   kamper (klynger): ${kamper.length}   dupliserte: ${duplikat}`);

console.log(`\n=== 1. FLAT-ANDELEN: POENG MOT SEIERSANNSYNLIGHET ===\n`);
console.log(`| linjal | flate | andel |`);
console.log(`|---|---|---|`);
const fp = boot(rader, andel(FLAT_POENG));
const fv = boot(rader, andel((r) => r.vektorFlat));
const fs1 = boot(rader, andel(FLAT_P));
console.log(`| POENG (diff, spredning 0) | ${rader.filter(FLAT_POENG).length} | **${pm(fp)} %** |`);
console.log(`| poengVEKTOR identisk | ${rader.filter((r) => r.vektorFlat).length} | ${pm(fv)} % |`);
console.log(`| SEIER (< 0,01 pp) | ${rader.filter(FLAT_P).length} | **${pm(fs1)} %** |`);

console.log(`\nSensitivitet på seiersterskelen:`);
for (const t of [0.001, 0.01, 0.1, 1.0]) {
  const b = boot(rader, andel((r) => r.spredP < t));
  console.log(`  < ${String(t).padEnd(6)} pp:  ${pm(b)} %`);
}

console.log(`\n=== 2. DER POENGFASITEN ER FLAT MEN SEIERSFASITEN IKKE ER ===\n`);
const flatePoeng = rader.filter(FLAT_POENG);
const skjult = flatePoeng.filter((r) => !FLAT_P(r));
console.log(`flate i poeng: ${flatePoeng.length}`);
console.log(`   av dem SKILLENDE i seier: ${skjult.length}  (${pm(boot(flatePoeng, andel((r) => !FLAT_P(r))))} %)`);
if (skjult.length > 0) {
  const sp = skjult.map((r) => r.spredP).sort((a, b) => a - b);
  const q = (p: number): number => sp[Math.min(sp.length - 1, Math.floor(p * sp.length))]!;
  console.log(`   spredning i seier (pp): median ${f(q(0.5), 3)}  p75 ${f(q(0.75), 3)}  p90 ${f(q(0.9), 3)}  maks ${f(sp[sp.length - 1]!, 3)}`);
  console.log(`   snitt spredning: ${pm(boot(skjult, snitt((r) => r.spredP)), 3)} pp`);
  console.log(`   argmaks flytter seg: ${pm(boot(skjult, andel((r) => r.byttet)))} %  (${skjult.filter((r) => r.byttet).length} av ${skjult.length})`);
  console.log(`   ANGER for dagens bot: ${pm(boot(skjult, snitt((r) => r.angerP)), 3)} pp`);
  console.log(`   botens kort er seiersoptimalt i ${f(100 * skjult.filter((r) => (r.angerP ?? 0) < 1e-9).length / skjult.length)} %`);
}

console.log(`\n=== 3. ANGER PÅ STILLINGENE DER FASITEN SKILLER ===\n`);
const skillPoeng = rader.filter((r) => !FLAT_POENG(r));
const skillP = rader.filter((r) => !FLAT_P(r));
console.log(`| fasit skiller i | n | snitt anger | argmaks byttet |`);
console.log(`|---|---|---|---|`);
console.log(`| POENG (anger i poeng) | ${skillPoeng.length} | ${pm(boot(skillPoeng, snitt((r) => r.angerPoeng)), 3)} | — |`);
console.log(`| SEIER (anger i pp) | ${skillP.length} | ${pm(boot(skillP, snitt((r) => r.angerP)), 3)} | ${pm(boot(skillP, andel((r) => r.byttet)))} % |`);

console.log(`\nHvor ofte er de to linjalene uenige om beste kort, over ALLE stillinger:`);
console.log(`  ${pm(boot(rader, andel((r) => r.byttet)))} %   (${rader.filter((r) => r.byttet).length} av ${rader.length})`);

console.log(`\n=== 4. UNDERGRUPPER — BESTE-AV-MANGE, IKKE FUNN ===\n`);
const grupper: [string, (r: Rad) => boolean][] = [
  ["igjen 7", (r) => r.igjen === 7],
  ["igjen 6", (r) => r.igjen === 6],
  ["igjen 5", (r) => r.igjen === 5],
  ["igjen 4", (r) => r.igjen === 4],
  ["igjen <= 3", (r) => r.igjen <= 3],
  ["foerer", (r) => r.rolle === "foerer"],
  ["makker", (r) => r.rolle === "makker"],
  ["forsvar", (r) => r.rolle === "forsvar"],
  ["ledende < 40", (r) => r.ledende < 40],
  ["ledende 40-69", (r) => r.ledende >= 40 && r.ledende < 70],
  ["ledende >= 70", (r) => r.ledende >= 70],
  ["ledende >= 85", (r) => r.ledende >= 85],
  ["2 lovlige", (r) => r.nLov === 2],
  ["3-4 lovlige", (r) => r.nLov >= 3 && r.nLov <= 4],
  ["5+ lovlige", (r) => r.nLov >= 5],
];
console.log(`| gruppe | n | flat i poeng | flat i seier | argmaks byttet |`);
console.log(`|---|---|---|---|---|`);
for (const [navn, p] of grupper) {
  const u = rader.filter(p);
  if (u.length === 0) continue;
  console.log(
    `| ${navn} | ${u.length} | ${pm(boot(u, andel(FLAT_POENG)))} % | ${pm(boot(u, andel(FLAT_P)))} % | ${pm(boot(u, andel((r) => r.byttet)))} % |`,
  );
}

console.log(`\n=== 5. H3-FORMKONTROLL: skiller seiersfasiten MER nær 100? ===\n`);
console.log(`| kampstilling (ledende) | n | snitt spredning i seier (pp) |`);
console.log(`|---|---|---|`);
for (const [navn, p] of grupper.filter(([n]) => n.startsWith("ledende"))) {
  const u = rader.filter(p);
  if (u.length === 0) continue;
  console.log(`| ${navn} | ${u.length} | ${pm(boot(u, snitt((r) => r.spredP)), 3)} |`);
}
console.log();
