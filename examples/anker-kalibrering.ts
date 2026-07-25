/**
 * Kalibrerer den ankrede fitnessen FØR den brukes til noe.
 *
 * To spørsmål, begge måtte besvares med tall før D8 kunne startes:
 *
 *  1. HVA KOSTER DEN? Antall givere per generasjon avgjør både støyen og
 *     farten, og de trekker motsatt vei.
 *  2. RANGERER DEN RIKTIG? En billig fitness som ikke korrelerer med den
 *     eksterne evalueringen er verre enn ingen fitness – den velger støy og
 *     ser ut som framgang. Det var nøyaktig D7s feil, og den fikk stå i
 *     1525 generasjoner fordi ingen målte korrelasjonen.
 *
 *   node examples/anker-kalibrering.ts
 */

import { readFileSync } from "node:fs";

import { genomFraJson, NeatAgent, type Genom } from "../src/neat/index.ts";
import { målAnkret } from "../src/neat/anker.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { grådigHandling } from "./graadig.ts";

const les = (f: string): Genom => genomFraJson(readFileSync(f, "utf8"));

/** Kandidater med KJENT innbyrdes rangering fra neat-evaluer (160 kamper). */
const kandidater: { navn: string; g: Genom; fasit: number }[] = [
  { navn: "d5-klar", g: les("d7/fro-d5-klar.json"), fasit: 71.33 },
  { navn: "d5-gull", g: les("d7/fro-d5-gull.json"), fasit: 71.21 },
  { navn: "d7c-mester", g: les("trening-d7c/mester.json"), fasit: 66.79 },
  { navn: "d6-klar", g: les("d7/fro-d6-klar.json"), fasit: 62.05 },
  { navn: "d7a-mester", g: les("trening-d7a/mester.json"), fasit: 61.97 },
  { navn: "d7b-mester", g: les("trening-d7b/mester.json"), fasit: 61.06 },
  { navn: "d7d-mester", g: les("trening-d7d/mester.json"), fasit: 46.58 },
];

/** Spearman – vi bryr oss om RANGERINGEN, det er den seleksjonen bruker. */
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
const motstandere = {
  grådig: grådigHandling,
  nevro: (s: Parameters<typeof grådigHandling>[0]) => nevro.velgHandling(s),
} as const;

console.log("kalibrering av ankret fitness – fasit er neat-evaluer, 160 kamper mot grådig");
console.log("");

for (const mot of ["grådig", "nevro"] as const) {
  for (const givere of [2, 4, 8]) {
    const t0 = performance.now();
    const skår: number[] = [];
    let seMax = 0;
    for (const k of kandidater) {
      // Frøbasen er FELLES for alle kandidater – det er hele poenget med
      // duplikatmåling: giverflaksen faller ut av differansen mellom to genom.
      const m = målAnkret(
        () => new NeatAgent(k.g, { læringsrate: 0 }),
        motstandere[mot],
        givere,
        950_000,
      );
      skår.push(m.diff);
      seMax = Math.max(seMax, m.se);
    }
    const ms = performance.now() - t0;
    const rho = spearman(
      kandidater.map((k) => k.fasit),
      skår,
    );
    console.log(
      `${mot.padEnd(7)} ${String(givere).padStart(2)} givere x4 seter: ` +
        `rho=${rho.toFixed(2).padStart(5)}  SE<=${seMax.toFixed(1).padStart(5)}  ` +
        `${(ms / kandidater.length).toFixed(0).padStart(5)} ms/genom  ` +
        `=> ${((ms / kandidater.length) * 96 / 1000).toFixed(0)} s/gen ved popp 96`,
    );
  }
}
