/**
 * SAMMENDRAG av `troledd.ts`-radene fra alle arbeiderne.
 *
 *   node examples/troledd-sum.ts analyse/troledd-w*.jsonl
 *
 * Tre tall, i den rekkefølgen oppdraget spør om dem:
 *
 *   1  Hvor ofte endrer troen kortet — MOT STØYGULVET (A-C). Uten gulvet er
 *      andelen uleselig: `sd-stoy.ts` målte at to uavhengige verdenstrekk er
 *      uenige om beste kort i 92,5 % av tilfellene ved 12 verdener.
 *   2  Er endringene BEDRE? Regret mot den eksakte poengløseren på den
 *      virkelige given, bare i stillinger der fasiten faktisk skiller.
 *   3  Hvilket `verdenKombi`-kriterium henter mest ut av den SAMME troen.
 */

import { readFileSync } from "node:fs";

const filer = process.argv.slice(2).filter((a) => a.endsWith(".jsonl"));
if (filer.length === 0) {
  console.error("Bruk: node examples/troledd-sum.ts <fil.jsonl> [...]");
  process.exit(1);
}

interface Rad {
  rolle: string;
  stikk: number;
  igjen: number;
  ulikArgmax: boolean;
  ulikSpilt: boolean;
  ulikAC: boolean;
  spredning: number | null;
  lovlige: number;
  [k: string]: unknown;
}

const rader: Rad[] = [];
for (const f of filer) {
  for (const linje of readFileSync(f, "utf8").split("\n")) {
    if (linje.trim() !== "") rader.push(JSON.parse(linje) as Rad);
  }
}

const KRITERIER = ["snitt", "min", "kvantil", "flest"] as const;
const ARMER = ["A", "B"] as const;

/** Andel med binomisk SE. */
const andel = (k: number, n: number): string => {
  if (n === 0) return "   –   ";
  const p = k / n;
  const se = Math.sqrt((p * (1 - p)) / n);
  return `${(100 * p).toFixed(1)}% ± ${(100 * se).toFixed(1)}`;
};

console.log(`\n=== TROLEDDET: ${rader.length} beslutninger fra ${filer.length} arbeidere ===\n`);

// ---------------------------------------------------------------- punkt 1
console.log("1. ENDRER TROEN KORTVALGET? — og hva gjør REN STØY?");
console.log("");
console.log("gruppe          |     n | A-B argmaks     | A-B spilt       | STØYGULV A-C    | A-B minus gulv");
console.log("-".repeat(100));

const grupper: [string, (r: Rad) => boolean][] = [
  ["ALLE", () => true],
  ["  foerer", (r) => r.rolle === "foerer"],
  ["  makker", (r) => r.rolle === "makker"],
  ["  forsvar", (r) => r.rolle === "forsvar"],
  ["  stikk 0-3", (r) => r.stikk <= 3],
  ["  stikk 4-7", (r) => r.stikk >= 4 && r.stikk <= 7],
  ["  stikk 8+", (r) => r.stikk >= 8],
];

for (const [navn, filter] of grupper) {
  const g = rader.filter(filter);
  const n = g.length;
  if (n === 0) continue;
  const ab = g.filter((r) => r.ulikArgmax).length;
  const ac = g.filter((r) => r.ulikAC).length;
  const sp = g.filter((r) => r.ulikSpilt).length;
  // Differansen mellom to andeler målt på SAMME rader: parret, så SE-en er på differansen.
  const d = (ab - ac) / n;
  const se = Math.sqrt(
    g.reduce((a, r) => {
      const x = (r.ulikArgmax ? 1 : 0) - (r.ulikAC ? 1 : 0);
      return a + (x - d) ** 2;
    }, 0) /
      Math.max(1, n - 1) /
      n,
  );
  console.log(
    `${navn.padEnd(15)} | ${String(n).padStart(5)} | ${andel(ab, n).padStart(15)} | ${andel(sp, n).padStart(15)} | ${andel(ac, n).padStart(15)} | ${(100 * d >= 0 ? "+" : "") + (100 * d).toFixed(1)} ± ${(100 * se).toFixed(1)} pp`,
  );
}

// ---------------------------------------------------------------- punkt 2/3
const skiller = rader.filter((r) => typeof r.spredning === "number" && r.spredning > 1e-9);
const flate = rader.filter((r) => typeof r.spredning === "number" && r.spredning <= 1e-9);
console.log(
  `\n\n2./3. FASITDOMMEN — ${skiller.length} skillende stillinger (${flate.length} flate forkastet, ` +
    `${rader.length - skiller.length - flate.length} utenfor vinduet)\n`,
);

if (skiller.length === 0) {
  console.log("Ingen skillende stillinger — ingen dom.");
} else {
  console.log("kriterium |  arm | snitt regret | traff fasit      | n");
  console.log("-".repeat(62));
  const snittRegret = new Map<string, number>();
  for (const k of KRITERIER) {
    for (const arm of ARMER) {
      const felt = `reg_${arm}_${k}`;
      const v = skiller.map((r) => r[felt]).filter((x): x is number => typeof x === "number");
      if (v.length === 0) continue;
      const m = v.reduce((a, b) => a + b, 0) / v.length;
      snittRegret.set(`${arm}_${k}`, m);
      const traff = v.filter((x) => x < 1e-9).length;
      console.log(
        `${k.padEnd(9)} | ${(arm === "A" ? "tro" : "uten").padEnd(4)} | ${m.toFixed(3).padStart(12)} | ${andel(traff, v.length).padStart(16)} | ${String(v.length).padStart(4)}`,
      );
    }
  }

  // Parret differanse per kriterium: tro minus uten, på de samme stillingene.
  console.log("\nPARRET A−B per kriterium (negativ = TROEN gir lavere regret, altså bedre):");
  for (const k of KRITERIER) {
    const par = skiller
      .map((r) => [r[`reg_A_${k}`], r[`reg_B_${k}`]])
      .filter((x): x is [number, number] => typeof x[0] === "number" && typeof x[1] === "number");
    if (par.length < 2) continue;
    const d = par.map(([a, b]) => a - b);
    const m = d.reduce((a, b) => a + b, 0) / d.length;
    const varians = d.reduce((a, x) => a + (x - m) ** 2, 0) / (d.length - 1);
    const se = Math.sqrt(varians / d.length);
    console.log(
      `  ${k.padEnd(8)} ${(m >= 0 ? "+" : "") + m.toFixed(3)} ± ${se.toFixed(3)}  (z=${(m / (se || 1)).toFixed(2)}, n=${d.length})`,
    );
  }

  // Kriteriene mot hverandre INNENFOR arm A: henter noen av dem mer ut av samme tro?
  console.log("\nKRITERIENE INNENFOR ARM A (samme tro, samme verdener) — parret mot `snitt`:");
  for (const k of KRITERIER) {
    if (k === "snitt") continue;
    const par = skiller
      .map((r) => [r[`reg_A_${k}`], r.reg_A_snitt])
      .filter((x): x is [number, number] => typeof x[0] === "number" && typeof x[1] === "number");
    if (par.length < 2) continue;
    const d = par.map(([a, b]) => a - b);
    const m = d.reduce((a, b) => a + b, 0) / d.length;
    const varians = d.reduce((a, x) => a + (x - m) ** 2, 0) / (d.length - 1);
    const se = Math.sqrt(varians / d.length);
    console.log(
      `  ${k.padEnd(8)} ${(m >= 0 ? "+" : "") + m.toFixed(3)} ± ${se.toFixed(3)}  (z=${(m / (se || 1)).toFixed(2)}, n=${d.length})  ${m < 0 ? "<- bedre enn snitt" : ""}`,
    );
  }

  // Bare der troen FAKTISK endret kortet: er det nye kortet bedre?
  const endret = skiller.filter((r) => r.ulikArgmax);
  const par = endret
    .map((r) => [r.reg_A_snitt, r.reg_B_snitt])
    .filter((x): x is [number, number] => typeof x[0] === "number" && typeof x[1] === "number");
  if (par.length >= 2) {
    const d = par.map(([a, b]) => a - b);
    const m = d.reduce((a, b) => a + b, 0) / d.length;
    const varians = d.reduce((a, x) => a + (x - m) ** 2, 0) / (d.length - 1);
    const se = Math.sqrt(varians / d.length);
    const bedre = d.filter((x) => x < -1e-9).length;
    const verre = d.filter((x) => x > 1e-9).length;
    console.log(
      `\nBARE DER TROEN ENDRET KORTET (n=${d.length}): regret A−B = ${(m >= 0 ? "+" : "") + m.toFixed(3)} ± ${se.toFixed(3)} ` +
        `(z=${(m / (se || 1)).toFixed(2)})\n  troen bedre i ${bedre}, verre i ${verre}, likt i ${d.length - bedre - verre}`,
    );
  }
}
