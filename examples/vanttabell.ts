/**
 * MAALER `vant[N]`: hvor ofte vinner bud N budrunden, ved DAGENS bord?
 *
 * Budregelen er `ev = p*2N(2P-1) + (1-p)*evForsvar` der `p = vant[N]`. Tabellen
 * i bud-gbt.json ble maalt med den GAMLE budgivningen, foer terskelen gikk til
 * -3,0. Med den nye byr alle fire setene helt annerledes - Adams vinner 80 % av
 * budrundene mot NevroHjernes 20 % - saa tabellen beskriver et rom som ikke
 * finnes lenger.
 *
 * Ingen trening. Bare telling.
 */
import { readFileSync } from "node:fs";
import { opprettSpill, utfør, lovligeHandlinger, type GameState, type Handling } from "../src/index.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { Budagent, lesBudmodell } from "../src/moe2/budagent.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { Vrakrangerer } from "../src/moe2/vrakrang.ts";
import { nettFraBytes } from "../src/nevro/nett.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";

let givere = 4000, frø = 820_000_000, spek = "nevro";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--giver") givere = Number(process.argv[++i]);
  else if (a === "--froe") frø = Number(process.argv[++i]);
  else if (a === "--spek") spek = process.argv[++i]!;
}
type Agent = { velgHandling(s: GameState): Handling; nyKamp(): void };
const ag = [0,1,2,3].map(() => lagIndre(spek));
// avgitt[N] = hvor mange ganger N ble bydd. vant[N] = hvor mange av dem som ble kontrakten.
const avgitt = new Map<number, number>(), vant = new Map<number, number>();
for (let g = 0; g < givere; g++) {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø + g * 7717);
  for (const a of ag) a.nyKamp();
  const mine: { sete: number; bud: number }[] = [];
  let v = 0;
  while (s.fase === "BUDRUNDE" && v++ < 40) {
    if (s.iTur === null) break;
    const h = ag[s.iTur]!.velgHandling(s);
    if (h.type === "BUD" && typeof h.bud === "number") mine.push({ sete: h.spiller, bud: h.bud });
    s = utfør(s, h).state;
  }
  if (s.budvinner === null || s.melding === null) continue;
  const vinnende = s.melding.type === "tall" ? s.melding.bud : -1;
  for (const m of mine) {
    avgitt.set(m.bud, (avgitt.get(m.bud) ?? 0) + 1);
    if (m.sete === s.budvinner && m.bud === vinnende) vant.set(m.bud, (vant.get(m.bud) ?? 0) + 1);
  }
  if (g % 500 === 0) process.stdout.write(`  ${g}/${givere}\r`);
}
console.log(`\n${givere} giver, ${spek.slice(0, 40)}`);
console.log("  bud   avgitt    vant    andel");
for (const n of [...avgitt.keys()].sort((a,b)=>a-b)) {
  const a = avgitt.get(n)!, w = vant.get(n) ?? 0;
  console.log(`  ${String(n).padStart(3)}  ${String(a).padStart(7)} ${String(w).padStart(7)}   ${(100*w/a).toFixed(1)} %`);
}
