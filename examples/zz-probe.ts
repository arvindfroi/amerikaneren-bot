/** Midlertidig fartsmåling – slettes. */
import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { Konvensjonsvakt, lesVaktflagg } from "../src/moe2/konvensjonsvakt.ts";
import { analyserGiv } from "../src/neat/singledummy.ts";

const nevro = new NevroAgent();
const e1 = E1Agent.fraFil("e1-modell/sd-r2.bin");
const vakt = new Konvensjonsvakt(e1, lesVaktflagg("at"));

function énRunde(agent: { velgHandling(s: GameState): ReturnType<NevroAgent["velgHandling"]> }): void {
  let s = opprettSpill({ antallSpillere: 4 }, 40_000_000 + Math.floor(Math.random() * 1e6));
  let v = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && v++ < 20_000) {
    s = utfør(s, agent.velgHandling(s)).state;
  }
}

let t = Date.now();
for (let i = 0; i < 200; i++) énRunde(nevro);
console.log(`nevro runde: ${(Date.now() - t) / 200} ms`);

t = Date.now();
for (let i = 0; i < 200; i++) énRunde(vakt);
console.log(`vakt:at:e1 runde: ${(Date.now() - t) / 200} ms`);

t = Date.now();
for (let i = 0; i < 50; i++) {
  let s = opprettSpill({ antallSpillere: 4 }, 41_000_000 + i);
  analyserGiv(s, nevro);
}
console.log(`analyserGiv: ${(Date.now() - t) / 50} ms`);
