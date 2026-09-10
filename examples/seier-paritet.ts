/**
 * TS MOT PYTORCH for seiersprediktoren — på de trente vektene, ikke på en
 * tilfeldig initialisering.
 *
 *   node examples/seier-paritet.ts <ut>      (leser <ut>.bin og <ut>-ref.json)
 *
 * `verktoy/seier-tren.py` skriver 64 holdout-tavler med inngangen og fordelingen
 * PyTorch regnet. Her regnes de samme med `seierTrekk` og `Seiersprediktor`.
 * Inngangen skal være EKSAKT lik (samme float64-regning, lagret som float32);
 * fordelingen innenfor 1e-5. En inngang regnet ulikt på de to sidene feiler
 * ingenting — prediktoren bare spår feil — så dette er den eneste prøven på det.
 */
import { readFileSync } from "node:fs";
import { Seiersprediktor, seierTrekk } from "../src/mlb/seier.ts";

const ut = process.argv[2];
if (ut === undefined) throw new Error("bruk: node examples/seier-paritet.ts <ut-prefiks>");

interface Referanse {
  poeng: number[];
  sete: number;
  maal: number;
  trekk: number[];
  p: number[];
}

const pred = Seiersprediktor.fraFil(`${ut}.bin`);
const ref = JSON.parse(readFileSync(`${ut}-ref.json`, "utf8")) as Referanse[];
let maksTrekk = 0;
let maksP = 0;
const seter = new Set<number>();
for (const r of ref) {
  seter.add(r.sete);
  const x = seierTrekk(r.poeng, r.sete, r.maal);
  r.trekk.forEach((v, i) => (maksTrekk = Math.max(maksTrekk, Math.abs(v - x[i]!))));
  const p = pred.fordeling(r.poeng, r.sete, r.maal);
  r.p.forEach((v, i) => (maksP = Math.max(maksP, Math.abs(v - p[i]!))));
}
const ok = ref.length > 0 && maksTrekk === 0 && maksP < 1e-5 && seter.size > 1;
console.log(
  `seier-paritet: ${ref.length} tavler, seter ${[...seter].sort().join("/")}, ` +
    `maks avvik inngang ${maksTrekk} (skal vaere 0), fordeling ${maksP.toExponential(2)} (< 1e-5) ` +
    `-> ${ok ? "OK" : "AVVIK"}`,
);
if (!ok) process.exit(1);
