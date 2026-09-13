/**
 * SAMMENDRAG av `trotemp-anger.ts` — hva temperaturen gjør med angeret.
 *
 *   node examples/trotemp-anger-sum.ts analyse/troanger-w*.jsonl
 *
 * PARRET, alltid. Alle armene er evaluert på NØYAKTIG samme stilling med samme RNG-strøm,
 * så differansen mellom to temperaturer skal regnes rad for rad. Den upparrede SE-en er
 * dominert av at noen stillinger er dyre og andre gratis, og den ville skjult effekten.
 *
 * REFERANSEN ER T = 1, som er dagens bot bit for bit (`test/trotemp.test.ts`).
 */

import { readFileSync } from "node:fs";

const filer = process.argv.slice(2).filter((a) => a.endsWith(".jsonl"));
if (filer.length === 0) {
  console.error("Bruk: node examples/trotemp-anger-sum.ts <fil.jsonl> [...]");
  process.exit(1);
}

interface Rad {
  rolle: string;
  stikk: number;
  igjen: number;
  lovlige: number;
  spredning: number;
  ulikAC?: boolean;
  [k: string]: unknown;
}

const rader: Rad[] = [];
for (const f of filer) {
  for (const linje of readFileSync(f, "utf8").split("\n")) {
    if (linje.trim() !== "") rader.push(JSON.parse(linje) as Rad);
  }
}
if (rader.length === 0) {
  console.error("ingen rader");
  process.exit(1);
}

/** Armene som faktisk står i dataene, i den rekkefølgen temperaturen stiger. */
const armer = [...new Set(rader.flatMap((r) => Object.keys(r)))]
  .filter((k) => k.startsWith("reg_T"))
  .map((k) => k.slice(4))
  .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
const BASE = armer[0]!;

const snitt = (x: readonly number[]): number => x.reduce((a, b) => a + b, 0) / x.length;
const parret = (
  felt: (r: Rad) => number | undefined,
  mot: (r: Rad) => number | undefined,
): { m: number; se: number; n: number; bedre: number; verre: number } | null => {
  const d: number[] = [];
  let bedre = 0;
  let verre = 0;
  for (const r of rader) {
    const a = felt(r);
    const b = mot(r);
    if (typeof a !== "number" || typeof b !== "number") continue;
    d.push(a - b);
    if (a < b - 1e-9) bedre++;
    else if (a > b + 1e-9) verre++;
  }
  if (d.length < 2) return null;
  const m = snitt(d);
  const v = d.reduce((s, x) => s + (x - m) ** 2, 0) / (d.length - 1);
  return { m, se: Math.sqrt(v / d.length), n: d.length, bedre, verre };
};
const tall = (felt: string) => (r: Rad): number | undefined =>
  typeof r[felt] === "number" ? (r[felt] as number) : undefined;

console.log(`\n=== ANGER PER TEMPERATUR — ${rader.length} SKILLENDE stillinger fra ${filer.length} filer ===`);
console.log(`(bare stillinger der fasiten faktisk skiller; ${armer.length} temperaturer + støygulv C + arm B uten tro)\n`);

const pst = (k: number, n: number): string => {
  if (n === 0) return "   –  ";
  const p = k / n;
  return `${(100 * p).toFixed(1)}% ± ${(100 * Math.sqrt((p * (1 - p)) / n)).toFixed(1)}`;
};

console.log("1. SNITT ANGER (diff-målet). LAVERE er bedre. Referansen er T=1 = dagens bot.\n");
console.log("arm      | snitt anger | traff fasit      | PARRET mot T=1        | bedre/verre | anger m/port");
console.log("-".repeat(104));
for (const a of [...armer, "C", "B"]) {
  const v = rader.map(tall(`reg_${a}`)).filter((x): x is number => typeof x === "number");
  if (v.length === 0) continue;
  const p = a === BASE ? null : parret(tall(`reg_${a}`), tall(`reg_${BASE}`));
  const sp = rader.map(tall(`regSpilt_${a}`)).filter((x): x is number => typeof x === "number");
  const merke = a === "C" ? "C(gulv)" : a === "B" ? "B(uten)" : a;
  console.log(
    `${merke.padEnd(8)} | ${snitt(v).toFixed(4).padStart(11)} | ${pst(v.filter((x) => x < 1e-9).length, v.length).padStart(16)} | ` +
      `${p === null ? "      (referanse)    " : `${(p.m >= 0 ? "+" : "") + p.m.toFixed(4)} ± ${p.se.toFixed(4)} z=${(p.m / (p.se || 1)).toFixed(2)}`.padStart(21)} | ` +
      `${p === null ? "     –     " : `${String(p.bedre).padStart(4)}/${String(p.verre).padEnd(4)}`.padStart(11)} | ${sp.length === 0 ? "  –  " : snitt(sp).toFixed(4)}`,
  );
}

console.log("\n2. SAMME, MED LAGMÅLET (det «L» i speken faktisk optimerer)\n");
console.log("arm      | snitt anger (lag) | PARRET mot T=1");
console.log("-".repeat(60));
for (const a of [...armer, "C", "B"]) {
  const v = rader.map(tall(`regL_${a}`)).filter((x): x is number => typeof x === "number");
  if (v.length === 0) continue;
  const p = a === BASE ? null : parret(tall(`regL_${a}`), tall(`regL_${BASE}`));
  const merke = a === "C" ? "C(gulv)" : a === "B" ? "B(uten)" : a;
  console.log(
    `${merke.padEnd(8)} | ${snitt(v).toFixed(4).padStart(17)} | ` +
      (p === null ? "(referanse)" : `${(p.m >= 0 ? "+" : "") + p.m.toFixed(4)} ± ${p.se.toFixed(4)} (z=${(p.m / (p.se || 1)).toFixed(2)})`),
  );
}

console.log("\n3. HVOR OFTE BYTTER TEMPERATUREN KORT — mot støygulvet\n");
{
  const ac = rader.filter((r) => r.ulikAC === true).length;
  console.log(`  STØYGULV (T=1 mot annet verdenstrekk):  ${pst(ac, rader.length)}`);
  for (const a of armer.slice(1)) {
    const k = rader.filter((r) => r[`ulik_${a}`] === true).length;
    console.log(`  T=1 mot ${a.padEnd(6)}:                        ${pst(k, rader.length)}`);
  }
}

console.log("\n4. PER ROLLE — snitt anger per arm\n");
const roller = [...new Set(rader.map((r) => r.rolle))].sort();
console.log(`gruppe     |     n | ${armer.map((a) => a.padStart(8)).join(" | ")} | ${"C".padStart(8)}`);
console.log("-".repeat(30 + 11 * (armer.length + 1)));
for (const rolle of ["ALLE", ...roller]) {
  const g = rolle === "ALLE" ? rader : rader.filter((r) => r.rolle === rolle);
  if (g.length === 0) continue;
  const kol = [...armer, "C"].map((a) => {
    const v = g.map(tall(`reg_${a}`)).filter((x): x is number => typeof x === "number");
    return v.length === 0 ? "    –   " : snitt(v).toFixed(4).padStart(8);
  });
  console.log(`${rolle.padEnd(10)} | ${String(g.length).padStart(5)} | ${kol.join(" | ")}`);
}
