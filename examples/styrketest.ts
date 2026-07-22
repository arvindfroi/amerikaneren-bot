/**
 * Styrketest: måler PIMC-botens spillestyrke mot tilfeldig spill på
 * IDENTISKE givere (lav varians). For hver giv bygges en fast kontrakt
 * (budvinner 0, makker 2, tallbud 7), og vi sammenligner budlagets stikk
 * når laget spilles av boten kontra tilfeldig – og hvor mye boten holder
 * motstanderlaget nede når den forsvarer.
 *
 *   node examples/styrketest.ts [antallGivere] [verdener] [terskel]
 */

import { opprettSpill, lovligeHandlinger, utfør, type GameState } from "../src/index.ts";
import { velgHandling } from "../src/index.ts";
import { lagRng } from "../src/index.ts";

const antall = Number(process.argv[2] ?? 24);
const verdener = Number(process.argv[3] ?? 12);
const terskel = Number(process.argv[4] ?? 6);

function byggStart(seed: number): GameState | null {
  const base = opprettSpill({ antallSpillere: 4 }, seed);
  const p2 = base.hender[2]!;
  const tel: Record<string, number> = { S: 0, H: 0, R: 0, K: 0 };
  for (const k of base.hender[0]!) tel[k.farge]!++;
  for (const k of p2) tel[k.farge]!++;
  const trumf = (["S", "H", "R", "K"] as const)
    .filter((f) => p2.some((k) => k.farge === f))
    .sort((a, b) => tel[b]! - tel[a]!)[0];
  if (!trumf) return null;
  const et = p2.filter((k) => k.farge === trumf).sort((a, b) => b.verdi - a.verdi)[0]!;
  return {
    ...base,
    fase: "SPILL",
    budvinner: 0,
    melding: { type: "tall", bud: 7 },
    trumf,
    etterlyst: et,
    makker: 2,
    makkerAvslørt: false,
    utspiller: 0,
    iTur: 0,
    bord: [],
    stikkVunnet: [0, 0, 0, 0],
    stikkSpilt: 0,
    historikk: [],
    forrigeStikk: null,
    vrak: base.talong,
    talong: [],
  };
}

function spillUt(start: GameState, pimc: Set<number>, rng: () => number): number {
  let s = start;
  let g = 0;
  while (s.fase === "SPILL" && g++ < 200) {
    const seat = s.iTur!;
    let h;
    if (pimc.has(seat)) {
      h = velgHandling(s, { verdener, terskel, frø: 500 + seat * 31 + g });
    } else {
      const lov = lovligeHandlinger(s);
      h =
        lov.fase === "SPILL"
          ? { type: "SPILL" as const, spiller: lov.spiller, kort: lov.kort[Math.floor(rng() * lov.kort.length)]! }
          : { type: "NESTE" as const };
    }
    s = utfør(s, h).state;
  }
  const sv = s.sisteRunde ? s.sisteRunde.stikkVunnet : s.stikkVunnet;
  return (sv[0] ?? 0) + (sv[2] ?? 0);
}

const rng = lagRng(55);
let sumP = 0;
let sumR = 0;
let sumD = 0;
let n = 0;
const t0 = performance.now();
for (let seed = 1; seed <= antall; seed++) {
  const start = byggStart(seed * 13 + 3);
  if (!start) continue;
  sumP += spillUt(start, new Set([0, 2]), rng);
  sumR += spillUt(start, new Set(), rng);
  sumD += spillUt(start, new Set([1, 3]), rng);
  n++;
}
console.log(`Amerikaner – PIMC-styrketest (${n} givere, verdener=${verdener}, terskel=${terskel})\n`);
console.log(`Budlagets stikk som ANGREP:`);
console.log(`  PIMC-budlag:      ${(sumP / n).toFixed(2)} stikk/giv`);
console.log(`  tilfeldig budlag: ${(sumR / n).toFixed(2)} stikk/giv   (+${((sumP - sumR) / n).toFixed(2)} for boten)\n`);
console.log(`Budlagets stikk når PIMC FORSVARER:`);
console.log(`  mot PIMC-forsvar:      ${(sumD / n).toFixed(2)} stikk/giv`);
console.log(`  mot tilfeldig forsvar: ${(sumR / n).toFixed(2)} stikk/giv   (−${((sumR - sumD) / n).toFixed(2)} takket være boten)\n`);
console.log(`Tid: ${((performance.now() - t0) / 1000).toFixed(1)}s`);
