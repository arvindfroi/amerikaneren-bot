/**
 * Hvilken FASE koster D1 poengene? Obduksjonen viste at kortvalgene er like
 * gode som NevroHjernes (anger 0,92 mot 0,89), men at D1 byr 6,9 mot 9,3 og
 * tar tilsvarende færre stikk. Da er spørsmålet hvor hånden blir svakere:
 * i budrunden, i vrakingen, i trumfvalget – eller i selve spillet.
 *
 *   node examples/d1-fasedeling.ts <genom.json> [--kamper 40]
 *
 * Metoden er å LÅNE faser: samme genom spiller, men én fase om gangen
 * settes bort til NevroHjerne. Løftet det gir, er fasens pris. Alle
 * variantene måles parret på de samme giverne mot tre grådige, så
 * forskjellen mellom dem er ren fase-effekt.
 */

import { readFileSync } from "node:fs";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { genomFraJson, NeatAgent } from "../src/neat/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { grådigHandling } from "./graadig.ts";

const genomFil = process.argv[2] ?? "laerling-test/d1-gull.json";
const kamper = Number(process.argv.includes("--kamper") ? process.argv[process.argv.indexOf("--kamper") + 1] : 40);

const rå = JSON.parse(readFileSync(genomFil, "utf8")) as { genom?: unknown };
const genom = genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(genomFil, "utf8"));

type Fase = "BUDRUNDE" | "VRAK" | "VELG" | "SPILL";
interface Variant {
  navn: string;
  /** Fasene NevroHjerne overtar. */
  lånt: Fase[];
}
const VARIANTER: Variant[] = [
  { navn: "D1 alene", lånt: [] },
  { navn: "D1 + lånt budrunde", lånt: ["BUDRUNDE"] },
  { navn: "D1 + lånt vrak", lånt: ["VRAK"] },
  { navn: "D1 + lånt trumf/etterlys", lånt: ["VELG"] },
  { navn: "D1 + lånt vrak+trumf", lånt: ["VRAK", "VELG"] },
  { navn: "D1 + lånt kortspill", lånt: ["SPILL"] },
  { navn: "NevroHjerne alene", lånt: ["BUDRUNDE", "VRAK", "VELG", "SPILL"] },
];

function kamp(v: Variant, frø: number, sete: number): number {
  const neat = new NeatAgent(genom, { læringsrate: 0 });
  const nevro = new NevroAgent();
  neat.nyKamp();
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  let guard = 0;
  while (s.fase !== "FERDIG" && guard++ < 20_000) {
    if (s.fase === "RUNDE_SLUTT" && s.rundeNr + 1 >= 40) break;
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
    let h: Handling;
    if (s.fase === "RUNDE_SLUTT") h = { type: "NESTE" };
    else if (iTur === sete) {
      const fase = s.fase as Fase;
      h = v.lånt.includes(fase) ? nevro.velgHandling(s) : neat.velgHandling(s);
    } else h = grådigHandling(s as GameState);
    s = utfør(s, h).state;
  }
  const egne = s.totalPoeng[sete] ?? 0;
  return egne - (s.totalPoeng.reduce((a, b) => a + b, 0) - egne) / 3;
}

const perGiver: number[][] = VARIANTER.map(() => []);
for (let f = 0; f < kamper; f++) {
  const frø = 940_000 + f;
  for (let i = 0; i < VARIANTER.length; i++) {
    let sum = 0;
    for (let sete = 0; sete < 4; sete++) sum += kamp(VARIANTER[i]!, frø, sete);
    perGiver[i]!.push(sum / 4);
  }
  if ((f + 1) % 10 === 0) console.log(`  ${f + 1}/${kamper} givere`);
}

const snitt = (x: readonly number[]): number => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
const se = (x: readonly number[]): number => {
  const m = snitt(x);
  return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, x.length - 1) / Math.max(1, x.length));
};

console.log(`\n=== Fasedeling: ${genomFil}, ${kamper} givere × 4 seter mot 3× grådig ===\n`);
console.log("variant".padEnd(26), "poeng/kamp".padStart(16), "løft mot D1 alene".padStart(22));
for (let i = 0; i < VARIANTER.length; i++) {
  const d = perGiver[i]!;
  const løft = i === 0 ? null : d.map((v, j) => v - perGiver[0]![j]!);
  console.log(
    VARIANTER[i]!.navn.padEnd(26),
    (snitt(d).toFixed(1) + " ± " + se(d).toFixed(1)).padStart(16),
    løft === null
      ? "–".padStart(22)
      : ((snitt(løft) >= 0 ? "+" : "") + snitt(løft).toFixed(1) + " ± " + se(løft).toFixed(1)).padStart(22),
  );
}
