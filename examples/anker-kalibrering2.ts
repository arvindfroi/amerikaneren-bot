/**
 * Runde 2 av kalibreringen. Runde 1 sammenlignet en grådig-basert fitness mot
 * en grådig-basert fasit (neat-evaluer) og fikk rho=0,86 – men det er
 * SIRKULÆRT, samme motstander på begge sider. Nevro-fitnessen fikk rho=-0,14
 * til -0,57 mot den samme grådig-fasiten, og det kan bety to helt ulike ting:
 *
 *   (a) å slå nevro er en annen ferdighet enn å slå grådig, eller
 *   (b) nevro-målingen er bare for støyete til å rangere noe som helst.
 *
 * Her skilles de. Fasiten er en DYR nevro-måling (40 givere x 4 seter), og
 * spørsmålet er om de billige nevro-målingene rangerer likt som den. Gjør de
 * det, er (a) sant og nevro er et gyldig – om enn dyrt – anker. Gjør de det
 * ikke, er (b) sant og nevro kan ikke brukes som fitness i det hele tatt.
 *
 *   node examples/anker-kalibrering2.ts
 */

import { readFileSync } from "node:fs";

import { genomFraJson, NeatAgent, type Genom } from "../src/neat/index.ts";
import { målAnkret } from "../src/neat/anker.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { grådigHandling } from "./graadig.ts";

const les = (f: string): Genom => genomFraJson(readFileSync(f, "utf8"));

const kandidater: { navn: string; g: Genom; grådigFasit: number }[] = [
  { navn: "d5-klar", g: les("d7/fro-d5-klar.json"), grådigFasit: 71.33 },
  { navn: "d5-gull", g: les("d7/fro-d5-gull.json"), grådigFasit: 71.21 },
  { navn: "d7c-mester", g: les("trening-d7c/mester.json"), grådigFasit: 66.79 },
  { navn: "d6-klar", g: les("d7/fro-d6-klar.json"), grådigFasit: 62.05 },
  { navn: "d7a-mester", g: les("trening-d7a/mester.json"), grådigFasit: 61.97 },
  { navn: "d7b-mester", g: les("trening-d7b/mester.json"), grådigFasit: 61.06 },
  { navn: "d7d-mester", g: les("trening-d7d/mester.json"), grådigFasit: 46.58 },
];

function spearman(a: number[], b: number[]): number {
  const rang = (v: number[]): number[] => {
    const idx = v.map((x, i) => ({ x, i })).sort((p, q) => p.x - q.x);
    const r = new Array<number>(v.length);
    idx.forEach((p, k) => (r[p.i] = k));
    return r;
  };
  const ra = rang(a);
  const rb = rang(b);
  const n = a.length;
  let d2 = 0;
  for (let i = 0; i < n; i++) d2 += (ra[i]! - rb[i]!) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
}

const nevro = new NevroAgent();
const motNevro = (s: Parameters<typeof grådigHandling>[0]): ReturnType<typeof grådigHandling> =>
  nevro.velgHandling(s);

const kjør = (g: Genom, mot: typeof motNevro | typeof grådigHandling, n: number, frø: number) =>
  målAnkret(() => new NeatAgent(g, { læringsrate: 0 }), mot, n, frø);

console.log("FASIT: 40 givere x 4 seter mot nevro (frø 960000)");
const fasitNevro = kandidater.map((k) => {
  const m = kjør(k.g, motNevro, 40, 960_000);
  console.log(`  ${k.navn.padEnd(12)} diff ${m.diff.toFixed(1).padStart(7)} +- ${m.se.toFixed(1)}`);
  return m.diff;
});

console.log("");
console.log("Rangerer de billige målingene likt som den dyre?");
// Et ANNET frøsett enn fasiten: sammenfallende frø ville målt hukommelse,
// ikke pålitelighet.
for (const givere of [4, 8, 16]) {
  const billig = kandidater.map((k) => kjør(k.g, motNevro, givere, 970_000).diff);
  console.log(
    `  nevro ${String(givere).padStart(2)} givere: rho mot dyr nevro-fasit = ` +
      `${spearman(fasitNevro, billig).toFixed(2)}`,
  );
}

console.log("");
console.log("Er «slå nevro» og «slå grådig» samme ferdighet?");
console.log(
  `  rho(grådig-fasit, nevro-fasit) = ${spearman(
    kandidater.map((k) => k.grådigFasit),
    fasitNevro,
  ).toFixed(2)}`,
);
