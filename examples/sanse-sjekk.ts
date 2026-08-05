/**
 * ER SANSENE LIKE I TRENING OG SPILL?
 *
 * Nettet laerte paa korpusets kolonner. Moeter det ANDRE verdier under spill,
 * er det utenfor fordelingen sin – og ingenting ville feilet. Denne sjekken
 * sammenlikner blokk for blokk: korpusrader mot det spillestien produserer.
 */
import { readFileSync } from "node:fs";
import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeKort } from "../src/motor.ts";
import { e1SpillTrekk, e1SpillTrekkMedTro, E1_SPILL_DIM_V10 } from "../src/e1/trekk.ts";
import { Trosnett } from "../src/moe2/trosnett.ts";
import { nettFraBytes } from "../src/nevro/nett.ts";
import { lagIndre, ADAMS } from "../src/moe2/agentspek.ts";

const tro = new Trosnett(nettFraBytes(new Uint8Array(readFileSync("e1-modell/tro.bin")))[0]!);
const BLOKKER: [string, number, number][] = [
  ["kjerne", 0, 273], ["v2-v4", 273, 364], ["plan", 364, 376], ["tro", 376, 428],
  ["verdi", 428, 458], ["doede", 458, 470], ["SANSER", 470, 558], ["hvemla", 558, 714],
];

function stat(rader: number[][]): Map<string, [number, number, number]> {
  const m = new Map<string, [number, number, number]>();
  for (const [navn, a, b] of BLOKKER) {
    let sum = 0, ikkeNull = 0, n = 0;
    for (const r of rader) for (let i = a; i < b; i++) { sum += r[i]!; if (Math.abs(r[i]!) > 1e-9) ikkeNull++; n++; }
    m.set(navn, [sum / n, ikkeNull / n, b - a]);
  }
  return m;
}

// 1. KORPUSET
const korpus: number[][] = [];
for (const ln of readFileSync("sd-v10/skard-b0.jsonl", "utf8").split("\n")) {
  if (!ln.trim()) continue;
  korpus.push(JSON.parse(ln).t as number[]);
  if (korpus.length >= 400) break;
}

// 2. SPILLESTIEN – noeyaktig slik E1Agent bygger vektoren
const bot = lagIndre(ADAMS);
const spill: number[][] = [];
const utenTro: number[][] = [];
for (let d = 0; spill.length < 400 && d < 400; d++) {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 3_100_000 + d * 7717);
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    // SAMME FILTER SOM ORAKELET: det merker bare stillinger med minst to
    // lovlige kort. Uten filteret sammenlikner vi ulike stillingsutvalg og
    // tolker forskjellen som en koblingsfeil.
    if (s.fase === "SPILL" && s.iTur !== null && lovligeKort(s, s.iTur).length >= 2) {
      spill.push([...e1SpillTrekkMedTro(s, s.iTur, E1_SPILL_DIM_V10, tro)]);
      utenTro.push([...e1SpillTrekk(s, s.iTur, E1_SPILL_DIM_V10)]);
    }
    const iT = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iT === null || iT === undefined) break;
    s = utfør(s, bot.velgHandling(s)).state;
  }
}
const k = stat(korpus), p = stat(spill), u = stat(utenTro);
console.log(`korpus ${korpus.length} rader, spill ${spill.length} stillinger\n`);
console.log("blokk      trekk   KORPUS snitt/fyll    SPILL snitt/fyll     UTEN tro fyll");
for (const [navn] of BLOKKER) {
  const [ks, kf, n] = k.get(navn)!, [ps, pf] = p.get(navn)!, [, uf] = u.get(navn)!;
  const avvik = Math.abs(ks - ps) > 0.02 * Math.max(0.01, Math.abs(ks)) + 0.005 ? "  <-- AVVIK" : "";
  console.log(
    `${navn.padEnd(9)} ${String(n).padStart(4)}   ${ks.toFixed(4).padStart(8)} ${(kf * 100).toFixed(1).padStart(5)} %` +
    `   ${ps.toFixed(4).padStart(8)} ${(pf * 100).toFixed(1).padStart(5)} %` +
    `   ${(uf * 100).toFixed(1).padStart(6)} %${avvik}`,
  );
}
