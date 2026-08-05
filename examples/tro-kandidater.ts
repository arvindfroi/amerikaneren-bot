/** Verdenskvalitet mot ANTALL KANDIDATER - uten rollouts, altsaa raskt. */
import { readFileSync } from "node:fs";
import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { trekkVerdener } from "../src/moe2/sdkort.ts";
import { Trosnett } from "../src/moe2/trosnett.ts";
import { lagTrovekt } from "../src/moe2/troprior.ts";
import { nettFraBytes } from "../src/nevro/nett.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { NevroAgent } from "../src/nevro/index.ts";
const tro = new Trosnett(nettFraBytes(new Uint8Array(readFileSync("e1-modell/tro.bin")))[0]!);
const lagRng = (f: number) => { let x = f >>> 0; return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296); };
const pos: { s: GameState; sete: number }[] = [];
const ag = [0, 1, 2, 3].map(() => new NevroAgent());
for (let d = 0; pos.length < 120; d++) {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 2_200_000 + d * 7717);
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    if (s.fase === "SPILL" && s.iTur !== null && s.stikkSpilt >= 1 && s.stikkSpilt <= 8) { pos.push({ s, sete: s.iTur }); break; }
    const iT = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iT === null || iT === undefined) break;
    s = utfør(s, ag[iT]!.velgHandling(s)).state;
  }
}
function kvalitet(K: number, medTro: boolean): number {
  let treff = 0, av = 0;
  for (const [i, p] of pos.entries()) {
    const vekt = medTro ? (lagTrovekt(tro, p.s, p.sete) ?? undefined) : undefined;
    const w = trekkVerdener(p.s, p.sete, 12, lagRng(700 + i), undefined, vekt, K);
    const fasit = new Map<number, number>();
    for (let sp = 0; sp < 4; sp++) { if (sp === p.sete) continue; for (const k of p.s.hender[sp] ?? []) fasit.set(kortIndeks(k), sp); }
    for (const h of w) for (let sp = 0; sp < h.length; sp++) for (const c of h[sp]!) {
      const sant = fasit.get(c); if (sant === undefined) continue; av++; if (sant === sp) treff++;
    }
  }
  return av === 0 ? NaN : (treff / av) * 100;
}
console.log(`${pos.length} stillinger\n`);
console.log("kandidater   uten tro   MED tro   diff");
for (const K of [3, 8, 16, 32]) {
  const a = kvalitet(K, false), b = kvalitet(K, true);
  console.log(`${String(K).padStart(8)}   ${a.toFixed(2).padStart(8)} %  ${b.toFixed(2).padStart(6)} %  ${(b - a >= 0 ? "+" : "") + (b - a).toFixed(2)} pp`);
}
