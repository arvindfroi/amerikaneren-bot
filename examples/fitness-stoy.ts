/**
 * HVOR MANGE GIVER MAA EN GENERASJON HA FOER FITNESSEN BETYR NOE?
 *
 *   node examples/fitness-stoy.ts
 *
 * Det avgjoerende tallet er ikke den absolutte standardfeilen, men den
 * PARREDE: hvor mye stoey det er i aa rangere to genom mot hverandre. Det er
 * det seleksjonen faktisk gjoer. Fordi hele populasjonen spiller de SAMME
 * giverne faller giverflaksen ut av differansen, saa den parrede feilen er
 * langt mindre enn den absolutte - og det er den som avgjoer om en generasjon
 * velger signal eller stoey.
 *
 * MAALEMETODEN. To genom maales R ganger paa hvert sitt FERSKE giversett ved
 * hver stoerrelse. Spredningen i den maalte differansen over de R gjentakelsene
 * ER den parrede standardfeilen. Den sammenlignes med den SANNE differansen,
 * maalt én gang paa et stort sett.
 *
 * Uten dette tallet er «ligaen maa ha mange kamper» en foelelse. Med det er
 * det en dimensjonering.
 */

import { readFileSync } from "node:fs";

import { genomFraJson, NeatAgent, type Genom } from "../src/neat/index.ts";
import { målSDRunder } from "../src/neat/anker.ts";
import { tømCache } from "../src/neat/singledummy.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { grådigHandling } from "./graadig.ts";

const les = (f: string): Genom => {
  const rå = JSON.parse(readFileSync(f, "utf8")) as { genom?: unknown };
  return genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(f, "utf8"));
};

const nevro = new NevroAgent();
const motNevro = (s: Parameters<typeof grådigHandling>[0]): ReturnType<typeof grådigHandling> =>
  nevro.velgHandling(s);

const par: { navn: string; g: Genom }[] = [
  { navn: "d5-gull", g: les("d7/fro-d5-gull.json") },
  { navn: "d6-klar", g: les("d7/fro-d6-klar.json") },
  { navn: "d8d", g: les("trening-d8d/mester.json") },
];

const mål = (g: Genom, n: number, frø: number): number =>
  målSDRunder(
    () => new NeatAgent(g, { læringsrate: 0 }),
    grådigHandling,
    motNevro,
    nevro,
    n,
    frø,
    1,
  ).diff;

// SANN differanse: ett stort sett, samme giver for alle.
console.log("SANN skaar (120 givere x 4 seter, felles giversett):");
const sant = par.map((k) => {
  const v = mål(k.g, 120, 7_000_000);
  console.log(`  ${k.navn.padEnd(10)} ${v.toFixed(2)}`);
  return v;
});
const sannDiff: number[] = [];
for (let i = 0; i < par.length; i++) {
  for (let j = i + 1; j < par.length; j++) {
    sannDiff.push(sant[i]! - sant[j]!);
    console.log(`  ${par[i]!.navn} − ${par[j]!.navn} = ${(sant[i]! - sant[j]!).toFixed(2)}`);
  }
}
const typiskDiff =
  sannDiff.reduce((a, b) => a + Math.abs(b), 0) / sannDiff.length;

console.log(`\nTypisk |differanse| mellom to genom: ${typiskDiff.toFixed(2)} poeng/runde`);
console.log("\nPARRET STANDARDFEIL per giverantall (8 gjentakelser, ferskt sett hver gang):");
console.log(
  "givere".padStart(7) + "runder".padStart(9) + "parret SE".padStart(12) +
    "signal/stoey".padStart(14) + "P(riktig rekkefolge)".padStart(22),
);
console.log("-".repeat(64));

/** Andel av normalfordelingen under x – for sannsynligheten for riktig rangering. */
function normalcdf(x: number): number {
  // Abramowitz & Stegun 7.1.26 via erf.
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp((-x * x) / 2);
  return x >= 0 ? 0.5 + y / 2 : 0.5 - y / 2;
}

for (const n of [4, 8, 16, 32]) {
  const R = 8;
  const differ: number[] = [];
  for (let r = 0; r < R; r++) {
    // Ferskt giversett per gjentakelse; cachen toemmes saa SD-analysen ikke
    // gjenbrukes paa tvers av sett.
    tømCache();
    const frø = 7_500_000 + r * 4096;
    for (let i = 0; i < par.length; i++) {
      for (let j = i + 1; j < par.length; j++) {
        differ.push(mål(par[i]!.g, n, frø) - mål(par[j]!.g, n, frø));
      }
    }
  }
  // Spredningen rundt den SANNE differansen, ikke rundt det maalte snittet:
  // det er avviket fra sannheten som er feilen.
  let sq = 0;
  let k = 0;
  for (let r = 0; r < R; r++) {
    for (let p = 0; p < sannDiff.length; p++) {
      const d = differ[k++]! - sannDiff[p]!;
      sq += d * d;
    }
  }
  const se = Math.sqrt(sq / (R * sannDiff.length));
  const forhold = typiskDiff / se;
  // Sannsynligheten for at to genom med typisk avstand rangeres riktig.
  const p = normalcdf(forhold);
  console.log(
    String(n).padStart(7) +
      String(n * 4).padStart(9) +
      se.toFixed(2).padStart(12) +
      forhold.toFixed(2).padStart(14) +
      `${Math.round(100 * p)} %`.padStart(22),
  );
}
