/**
 * RØYKPRØVE: går den utrullede speken i DENNE arbeidskopien, og hva koster den?
 *
 * Bare et nullpunkt før `troledd.ts`: spekken må parse, modellfilene må finnes,
 * og jeg må vite ms per kortvalg for å planlegge budsjettet.
 *
 *   node examples/troledd-royk.ts --runder 1
 */

import { opprettSpill, utfør } from "../src/index.ts";
import type { GameState } from "../src/motor.ts";
import { lagIndre, tall, utenSøk } from "../src/moe2/agentspek.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const RUNDER = tall(arg("--runder", "1"), 1, "runder");

/** Den utrullede speken, iter-8-modellene (`D:\amb-grp\loop\utrullingskandidat.md`). */
export const HELBOT =
  "okt:vr:e1-modell/vrak-8.bin@e1-modell/etterlyst-8.bin:telrd:eks:3Lt2000:profil:" +
  "sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-8.bin:budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin";

console.log("SPEK:", HELBOT);
console.log("UTEN SØK:", utenSøk(HELBOT));

const t0 = performance.now();
const agenter = [0, 1, 2, 3].map(() => lagIndre(HELBOT));
for (const a of agenter) a.nyKamp();
console.log(`Bygget 4 agenter på ${(performance.now() - t0).toFixed(0)} ms`);

let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, 13_000_777);
let vakt = 0;
let r = 0;
let kortvalg = 0;
let msKortvalg = 0;
const tStart = performance.now();

while (s.fase !== "FERDIG" && vakt++ < 40_000 && r < RUNDER) {
  if (s.fase === "RUNDE_SLUTT") {
    for (const a of agenter) (a as { observer?(x: GameState): void }).observer?.(s);
    r++;
    s = utfør(s, { type: "NESTE" }).state;
    continue;
  }
  const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
  if (iTur === null || iTur === undefined) break;
  const erSpill = s.fase === "SPILL";
  const t1 = performance.now();
  const h = agenter[iTur]!.velgHandling(s);
  const dt = performance.now() - t1;
  if (erSpill) {
    kortvalg++;
    msKortvalg += dt;
  }
  s = utfør(s, h).state;
}

console.log(
  `\n${r} runde(r), ${kortvalg} kortvalg, ${(msKortvalg / Math.max(1, kortvalg)).toFixed(0)} ms per kortvalg, ` +
    `${((performance.now() - tStart) / 1000).toFixed(1)} s totalt`,
);
