/**
 * Forklaringsanalyse: hvilke genom-trekk forklarer godt/dårlig spill?
 *
 *   node examples/neat-forklar.ts [dir=trening-c4] [sisteGen=alle]
 *
 * Leser analyse.jsonl (trekk + fitness per individ per generasjon, skrevet
 * av treneren), standardiserer trekkene og kjører multippel lineær
 * regresjon mot fitness. Rapporterer R² (hvor mye av fitnessvariasjonen
 * trekkene forklarer), standardiserte koeffisienter (retning og styrke
 * når alt annet holdes likt) og enkle korrelasjoner.
 */

import { existsSync, readFileSync } from "node:fs";

const dir = process.argv[2] ?? "trening-c4";
const sisteGen = process.argv[3] !== undefined ? Number(process.argv[3]) : Infinity;

const fil = `${dir}/analyse.jsonl`;
if (!existsSync(fil)) {
  console.error(`Fant ikke ${fil} – treneren må ha kjørt med analyse-dumping.`);
  process.exit(1);
}

const TREKK = [
  "noder",
  "koblinger",
  "skjulte",
  "aktivAndel",
  "snittAbsVekt",
  "kortInn",
  "xtInn",
  "fraHistorikk",
  "fraRenons",
  "fraBossTelling",
  "fraTaktikk",
  "fraLagspill",
  "fraBudhist",
  "fraLagstikk",
  "regret",
] as const;

interface Rad {
  x: number[];
  y: number;
}

const rader: Rad[] = [];
let generasjoner = 0;
for (const linje of readFileSync(fil, "utf8").split("\n")) {
  if (linje.trim() === "") continue;
  const d = JSON.parse(linje) as { gen: number; individer: Record<string, number>[] };
  if (d.gen > sisteGen) continue;
  generasjoner++;
  for (const ind of d.individer) {
    rader.push({ x: TREKK.map((t) => ind[t] ?? 0), y: ind["fitness"] ?? 0 });
  }
}
if (rader.length < TREKK.length * 3) {
  console.error(`For få rader (${rader.length}) – la treningen samle mer data.`);
  process.exit(1);
}

// Standardiser trekk og fitness.
const n = rader.length;
const p = TREKK.length;
const snitt = new Array<number>(p).fill(0);
const std = new Array<number>(p).fill(0);
for (const r of rader) for (let j = 0; j < p; j++) snitt[j]! += r.x[j]! / n;
for (const r of rader) for (let j = 0; j < p; j++) std[j]! += (r.x[j]! - snitt[j]!) ** 2 / n;
for (let j = 0; j < p; j++) std[j] = Math.sqrt(std[j]!) || 1;
const ySnitt = rader.reduce((a, r) => a + r.y, 0) / n;
const yStd = Math.sqrt(rader.reduce((a, r) => a + (r.y - ySnitt) ** 2, 0) / n) || 1;

const X = rader.map((r) => [1, ...r.x.map((v, j) => (v - snitt[j]!) / std[j]!)]);
const y = rader.map((r) => (r.y - ySnitt) / yStd);

// OLS med liten ridge for stabilitet: (XᵀX + λI)β = Xᵀy, Gauss-eliminasjon.
const m = p + 1;
const A: number[][] = Array.from({ length: m }, () => new Array<number>(m + 1).fill(0));
for (const [i, rad] of X.entries()) {
  for (let a = 0; a < m; a++) {
    for (let b = 0; b < m; b++) A[a]![b]! += rad[a]! * rad[b]!;
    A[a]![m]! += rad[a]! * y[i]!;
  }
}
for (let a = 1; a < m; a++) A[a]![a]! += 1e-6 * n;
for (let kol = 0; kol < m; kol++) {
  let piv = kol;
  for (let r = kol + 1; r < m; r++) if (Math.abs(A[r]![kol]!) > Math.abs(A[piv]![kol]!)) piv = r;
  [A[kol], A[piv]] = [A[piv]!, A[kol]!];
  for (let r = 0; r < m; r++) {
    if (r === kol || A[kol]![kol] === 0) continue;
    const f = A[r]![kol]! / A[kol]![kol]!;
    for (let c = kol; c <= m; c++) A[r]![c]! -= f * A[kol]![c]!;
  }
}
const beta = A.map((rad, i) => (rad[i] !== 0 ? rad[m]! / rad[i]! : 0));

// R² og korrelasjoner.
let ssRes = 0;
let ssTot = 0;
for (const [i, rad] of X.entries()) {
  const pred = rad.reduce((a, v, j) => a + v * beta[j]!, 0);
  ssRes += (y[i]! - pred) ** 2;
  ssTot += y[i]! ** 2;
}
const r2 = 1 - ssRes / ssTot;

const korr = TREKK.map((_, j) => {
  let s = 0;
  for (const [i, rad] of X.entries()) s += rad[j + 1]! * y[i]!;
  return s / n;
});

console.log(`Forklaringsanalyse: ${n} individer over ${generasjoner} generasjoner (${dir})`);
console.log(`R² = ${r2.toFixed(3)} – trekkene forklarer ${(100 * r2).toFixed(1)} % av fitnessvariasjonen\n`);
console.log("trekk               β (std.)   korrelasjon   (β: effekt når alt annet holdes likt)");
const rekkefølge = TREKK.map((t, j) => ({ t, b: beta[j + 1]!, k: korr[j]! })).sort(
  (a, b) => Math.abs(b.b) - Math.abs(a.b),
);
for (const { t, b, k } of rekkefølge) {
  console.log(
    `${t.padEnd(18)} ${(b >= 0 ? "+" : "") + b.toFixed(3)}     ${(k >= 0 ? "+" : "") + k.toFixed(3)}`,
  );
}
