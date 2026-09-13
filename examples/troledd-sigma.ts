/**
 * ER PORTEN (σ) ET BRUKBART STØYFILTER? — ren reanalyse, ingen ny beregning.
 *
 *   node examples/troledd-sigma.ts analyse/troledd-w*.jsonl
 *
 * Funnet i `troledd.md`: søkets beste kort skifter i 43,8 % av beslutningene av
 * REN resampling. Porten i `sikkerorakel.ts:368` finnes nettopp for å la nettets
 * valg stå når marginen er utydelig — den er altså allerede prosjektets eget
 * støyfilter, og den står på σ = 0,5 mot klassens standard 1,5.
 *
 * Spørsmålet denne fila svarer på: skiller σ faktisk de stabile valgene fra de
 * støyete? Er støygulvet (A mot C — samme tro, annet verdenstrekk) lavt der σ er
 * høy, så er σ en billig knott som treffer nøyaktig den diagnostiserte feilen.
 * Er gulvet like høyt overalt, måler σ noe annet enn stabilitet, og å skru på den
 * ville vært å behandle et symptom vi ikke har vist at den ser.
 */
import { readFileSync } from "node:fs";

const filer = process.argv.slice(2).filter((a) => a.endsWith(".jsonl"));
const rader: Record<string, number | boolean | null>[] = [];
for (const f of filer) {
  for (const l of readFileSync(f, "utf8").split("\n")) if (l.trim() !== "") rader.push(JSON.parse(l));
}

const andel = (k: number, n: number): string => {
  if (n === 0) return "   –   ";
  const p = k / n;
  return `${(100 * p).toFixed(1)}% ± ${(100 * Math.sqrt((p * (1 - p)) / n)).toFixed(1)}`;
};

const bøtter: [string, (s: number) => boolean][] = [
  ["σ < 0,5  (porten holder)", (s) => s < 0.5],
  ["0,5 ≤ σ < 1,0", (s) => s >= 0.5 && s < 1.0],
  ["1,0 ≤ σ < 1,5", (s) => s >= 1.0 && s < 1.5],
  ["1,5 ≤ σ < 2,5", (s) => s >= 1.5 && s < 2.5],
  ["σ ≥ 2,5", (s) => s >= 2.5],
];

console.log(`\n=== PORTEN SOM STØYFILTER — ${rader.length} beslutninger ===\n`);
console.log("Gulvet = A mot C: samme tro, bare et annet verdenstrekk. LAVT = stabilt valg.\n");
console.log("sigma-baand              |     n | STØYGULV A-C    | A-B argmaks     | snitt regret A");
console.log("-".repeat(92));
for (const [navn, f] of bøtter) {
  const g = rader.filter((r) => typeof r.sigA === "number" && f(r.sigA));
  if (g.length === 0) continue;
  const ac = g.filter((r) => r.ulikAC === true).length;
  const ab = g.filter((r) => r.ulikArgmax === true).length;
  const reg = g.map((r) => r.reg_A_snitt).filter((x): x is number => typeof x === "number");
  const m = reg.length === 0 ? null : reg.reduce((a, b) => a + b, 0) / reg.length;
  console.log(
    `${navn.padEnd(24)} | ${String(g.length).padStart(5)} | ${andel(ac, g.length).padStart(15)} | ${andel(ab, g.length).padStart(15)} | ${m === null ? "    –" : m.toFixed(3).padStart(6)} (n=${reg.length})`,
  );
}

// Hvor mye av dagens overstyring er støy? Porten slipper gjennom sigma >= 0,5.
const gjennom = rader.filter((r) => typeof r.sigA === "number" && r.sigA >= 0.5);
const holdt = rader.filter((r) => typeof r.sigA === "number" && r.sigA < 0.5);
console.log(
  `\nPorten slipper gjennom ${gjennom.length} av ${rader.length} (${((100 * gjennom.length) / rader.length).toFixed(1)} %).`,
);
console.log(
  `  Av dem er ${andel(gjennom.filter((r) => r.ulikAC === true).length, gjennom.length)} ustabile under rent nytt verdenstrekk.`,
);
console.log(
  `  Av de ${holdt.length} porten HOLDER er ${andel(holdt.filter((r) => r.ulikAC === true).length, holdt.length)} ustabile.`,
);
