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

let givere = 4000, frø = 820_000_000, spek = "nevro";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--giver") givere = Number(process.argv[++i]);
  else if (a === "--froe") frø = Number(process.argv[++i]);
  else if (a === "--spek") spek = process.argv[++i]!;
}
type Agent = { velgHandling(s: GameState): Handling; nyKamp(): void };
function lag(s: string): Agent {
  if (s === "nevro") return new NevroAgent();
  if (s.startsWith("vakt:")) { const v = delVaktspek(s); if (!v) throw new Error(s); return new Konvensjonsvakt(lag(v.indre), v.valg); }
  if (s.startsWith("vr:")) { const r = s.slice(3); const i = r.indexOf(":"); const j = r.indexOf(":", i+1);
    const n = nettFraBytes(new Uint8Array(readFileSync(r.slice(0,i))))[0]!; return new Vrakrangerer(lag(r.slice(j+1)), n, r.slice(i+1,j)); }
  if (s.startsWith("budm:")) { const r = s.slice(5); const k = r.indexOf(":"); const h = r.slice(0,k);
    const at = h.lastIndexOf("@"); const fil = at<0?h:h.slice(0,at); const ev = at<0?2.5:Number(h.slice(at+1));
    return new Budagent(lag(r.slice(k+1)), lesBudmodell(fil), ev); }
  if (s.startsWith("e1:")) return E1Agent.fraFil(s.slice(3));
  throw new Error(s);
}
const ag = [0,1,2,3].map(() => lag(spek));
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
