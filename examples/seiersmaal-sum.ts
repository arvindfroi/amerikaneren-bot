/**
 * SAMMENDRAG av `examples/seiersmaal-fasit.ts`.
 *
 * Klyngebootstrap over KAMPER, B = 20 000. SE er bootstrapfordelingens standardavvik —
 * **ikke delt på √n en gang til** (`dekomp.md` §0; eieren gjorde i går feilen med en `sd()`
 * som delte på n to ganger og fikk 21× for små feilmarginer).
 *
 * ALLE statistikkene her er SNITT: en andel er snittet av en 0/1-indikator, og en
 * gjennomsnittlig anger er snittet av angeret. Bootstrappen utnytter det og resampler
 * **per-klynge-aggregater** (sum, antall) i stedet for å filtrere radene på nytt i hver av
 * de 20 000 runddene. Den naive formen var O(B × rader) — 20 000 × 60 000 rader per
 * statistikk — og ville tatt timer per tabellrad. Denne er O(B × klynger).
 *
 * Anger regnes BARE der den aktuelle fasiten skiller (`angerP`/`angerPoeng` er `null`
 * ellers, og `null` faller ut av snittet). Undergrupper er beste-av-mange og merkes som det.
 *
 *   node examples/seiersmaal-sum.ts analyse/seiersmaal-w0.jsonl analyse/seiersmaal-w1.jsonl ...
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

const B = 20_000;

/** Deterministisk RNG, så sammendraget er reproduserbart. */
function lagRng(frø: number): () => number {
  let s = frø >>> 0;
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    return s / 4_294_967_296;
  };
}

/**
 * Klyngebootstrap på per-kamp-aggregater. `val` gir radens tall, eller `null` for «denne
 * raden teller ikke» (f.eks. anger i en flat stilling).
 */
function boot(utvalg: readonly Rad[], val: (r: Rad) => number | null): { est: number | null; se: number; n: number } {
  const sum = new Map<number, number>();
  const ant = new Map<number, number>();
  let ts = 0;
  let ta = 0;
  for (const r of utvalg) {
    const v = val(r);
    if (v === null) continue;
    sum.set(r.kamp, (sum.get(r.kamp) ?? 0) + v);
    ant.set(r.kamp, (ant.get(r.kamp) ?? 0) + 1);
    ts += v;
    ta++;
  }
  if (ta === 0) return { est: null, se: NaN, n: 0 };
  const est = ts / ta;
  const nøkler = [...sum.keys()];
  const K = nøkler.length;
  if (K < 2) return { est, se: NaN, n: ta };
  const s = new Float64Array(K);
  const a = new Float64Array(K);
  for (let i = 0; i < K; i++) {
    s[i] = sum.get(nøkler[i]!)!;
    a[i] = ant.get(nøkler[i]!)!;
  }
  const rng = lagRng(20_260_914);
  let m = 0;
  let m2 = 0;
  let brukt = 0;
  for (let b = 0; b < B; b++) {
    let bs = 0;
    let ba = 0;
    for (let i = 0; i < K; i++) {
      const j = Math.floor(rng() * K);
      bs += s[j]!;
      ba += a[j]!;
    }
    if (ba === 0) continue;
    const v = bs / ba;
    brukt++;
    const d = v - m;
    m += d / brukt;
    m2 += d * (v - m);
  }
  return { est, se: Math.sqrt(m2 / brukt), n: ta };
}

const ind = (p: (r: Rad) => boolean) => (r: Rad): number => (p(r) ? 100 : 0);
const pm = (r: { est: number | null; se: number }, d = 1): string =>
  r.est === null ? "—" : `${r.est.toFixed(d)} ± ${Number.isNaN(r.se) ? "—" : r.se.toFixed(d)}`;
const f = (x: number | undefined, d = 3): string => (x === undefined ? "—" : x.toFixed(d));

const FLAT_POENG = (r: Rad): boolean => r.spredPoeng < 1e-9;
const FLAT_P = (r: Rad): boolean => r.spredP < 0.01;

const kamper = new Set(rader.map((r) => r.kamp));
console.log(`\n=== GRUNNLAG ===`);
console.log(`stillinger: ${rader.length}   kamper (klynger): ${kamper.size}   dupliserte: ${duplikat}`);
console.log(`ledende poeng: ${Math.min(...rader.map((r) => r.ledende))} – ${Math.max(...rader.map((r) => r.ledende))}`);

console.log(`\n=== 1. HOVEDTALLET: FLAT-ANDELEN, POENG MOT SEIERSANNSYNLIGHET ===\n`);
console.log(`| linjal | flate | andel (klynget SE) |`);
console.log(`|---|---|---|`);
console.log(`| **POENG** (diff, spredning 0) | ${rader.filter(FLAT_POENG).length} | **${pm(boot(rader, ind(FLAT_POENG)))} %** |`);
console.log(`| poengVEKTOR identisk | ${rader.filter((r) => r.vektorFlat).length} | ${pm(boot(rader, ind((r) => r.vektorFlat)))} % |`);
console.log(`| **SEIER** (< 0,01 pp) | ${rader.filter(FLAT_P).length} | **${pm(boot(rader, ind(FLAT_P)))} %** |`);

const parret = boot(rader, (r) => (FLAT_P(r) ? 100 : 0) - (FLAT_POENG(r) ? 100 : 0));
console.log(`\nPARRET (seier − poeng), samme stillinger: **${pm(parret, 2)} pp**`);

console.log(`\nSensitivitet på seiersterskelen:`);
for (const t of [0.0000001, 0.001, 0.01, 0.1, 1.0]) {
  console.log(`  flat når spredning < ${String(t).padEnd(9)} pp:  ${pm(boot(rader, ind((r) => r.spredP < t)))} %`);
}

console.log(`\n=== 2. MEKANISMENS TAKHØYDE: flat i diff, men ULIK poengvektor ===\n`);
const flatePoeng = rader.filter(FLAT_POENG);
const komprimert = flatePoeng.filter((r) => !r.vektorFlat);
console.log(`flate i poeng (diff): ${flatePoeng.length}`);
console.log(`  av dem med ULIK poengvektor (der linjalen KAN skille): ${komprimert.length}` +
  `  (${pm(boot(flatePoeng, ind((r) => !r.vektorFlat)), 2)} %)`);
const skjult = flatePoeng.filter((r) => !FLAT_P(r));
console.log(`  av dem SKILLENDE i seier (> 0,01 pp): ${skjult.length}  (${pm(boot(flatePoeng, ind((r) => !FLAT_P(r))), 2)} %)`);

if (skjult.length > 0) {
  const sp = skjult.map((r) => r.spredP).sort((a, b) => a - b);
  const q = (p: number): number | undefined => sp[Math.min(sp.length - 1, Math.floor(p * sp.length))];
  console.log(`\n  spredning i seier på de skillende (pp):`);
  console.log(`    median ${f(q(0.5))}  p75 ${f(q(0.75))}  p90 ${f(q(0.9))}  maks ${f(sp[sp.length - 1])}`);
  console.log(`    snitt ${pm(boot(skjult, (r) => r.spredP), 3)} pp`);
  console.log(`    argmaks flytter seg: ${pm(boot(skjult, ind((r) => r.byttet)))} %  (${skjult.filter((r) => r.byttet).length} av ${skjult.length})`);
  console.log(`    ANGER for dagens bot: ${pm(boot(skjult, (r) => r.angerP), 3)} pp`);
  const opt = skjult.filter((r) => (r.angerP ?? 0) < 1e-9).length;
  console.log(`    botens kort er alt seiersoptimalt i ${((100 * opt) / skjult.length).toFixed(1)} %`);
}

console.log(`\n=== 3. ANGER DER FASITEN SKILLER ===\n`);
const skillPoeng = rader.filter((r) => !FLAT_POENG(r));
const skillP = rader.filter((r) => !FLAT_P(r));
console.log(`| fasit skiller i | n | snitt anger | argmaks byttet |`);
console.log(`|---|---|---|---|`);
console.log(`| POENG (anger i poeng/runde) | ${skillPoeng.length} | ${pm(boot(skillPoeng, (r) => r.angerPoeng), 3)} | — |`);
console.log(`| **SEIER** (anger i pp) | ${skillP.length} | **${pm(boot(skillP, (r) => r.angerP), 3)}** | ${pm(boot(skillP, ind((r) => r.byttet)))} % |`);
console.log(`\nDe to linjalene uenige om beste kort, over ALLE stillinger:`);
console.log(`  ${pm(boot(rader, ind((r) => r.byttet)))} %   (${rader.filter((r) => r.byttet).length} av ${rader.length})`);
console.log(`Uenige der POENGfasiten skiller (altså der det finnes noe å velge):`);
console.log(`  ${pm(boot(skillPoeng, ind((r) => r.byttet)))} %   (${skillPoeng.filter((r) => r.byttet).length} av ${skillPoeng.length})`);

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
  ["ledende 70-84", (r) => r.ledende >= 70 && r.ledende < 85],
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
    `| ${navn} | ${u.length} | ${pm(boot(u, ind(FLAT_POENG)))} % | ${pm(boot(u, ind(FLAT_P)))} % | ${pm(boot(u, ind((r) => r.byttet)))} % |`,
  );
}

console.log(`\n=== 5. H3-FORMKONTROLL: skiller seiersfasiten MER nær 100? ===\n`);
console.log(`| kampstilling (ledende) | n | snitt spredning i seier (pp) | snitt anger (pp) |`);
console.log(`|---|---|---|---|`);
for (const [navn, p] of grupper.filter(([n]) => n.startsWith("ledende"))) {
  const u = rader.filter(p);
  if (u.length === 0) continue;
  console.log(`| ${navn} | ${u.length} | ${pm(boot(u, (r) => r.spredP), 3)} | ${pm(boot(u, (r) => r.angerP), 3)} |`);
}
console.log();
