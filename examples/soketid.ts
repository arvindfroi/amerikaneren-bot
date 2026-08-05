import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lagIndre, ADAMS } from "../src/moe2/agentspek.ts";
import { NevroAgent } from "../src/nevro/index.ts";
const spek = process.argv[2]!;
const bot = lagIndre(spek);
const ag = [0, 1, 2, 3].map(() => new NevroAgent());
let s: GameState = opprettSpill({ antallSpillere: 4 }, 987654);
let g = 0, n = 0, ms = 0;
while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
  const iT = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
  if (iT === null || iT === undefined) break;
  if (s.fase === "SPILL") {
    const t0 = performance.now();
    bot.velgHandling(s);
    ms += performance.now() - t0; n++;
  }
  s = utfør(s, ag[iT]!.velgHandling(s)).state;
}
console.log(`${n} kortvalg, ${(ms / n).toFixed(1)} ms per trekk i snitt, ${ms.toFixed(0)} ms totalt`);
