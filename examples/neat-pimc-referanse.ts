/**
 * Måler PIMC-solverens nivå på NØYAKTIG samme benk som treningen bruker:
 * én PIMC-bot mot tre grådige, duplikat med seterotasjon, samme frø som
 * målMotGrådig (777000+f). Differansen skrives til
 * trening-felles/pimc-referanse.json og tegnes som referanselinje i
 * fremgangsgrafen – når en mesterkurve krysser linja, spiller den på
 * solvernivå på identisk oppsett.
 *
 *   node examples/neat-pimc-referanse.ts [antallFrø=8]
 */

import { mkdirSync, writeFileSync } from "node:fs";

import { opprettSpill, utfør, velgHandling, type Handling } from "../src/index.ts";
import { grådigHandling } from "./graadig.ts";

const antallFrø = Number(process.argv[2] ?? 8);

let pimcPoeng = 0;
let grådigPoeng = 0;
let seire = 0;
let kamper = 0;
const t0 = performance.now();

for (let f = 0; f < antallFrø; f++) {
  for (let sete = 0; sete < 4; sete++) {
    let s = opprettSpill({ antallSpillere: 4 }, 777000 + f);
    let guard = 0;
    while (s.fase !== "FERDIG" && guard++ < 20000) {
      if (s.fase === "RUNDE_SLUTT" && s.rundeNr + 1 >= 40) break;
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
      let h: Handling;
      if (s.fase === "RUNDE_SLUTT") h = { type: "NESTE" };
      else if (iTur === sete)
        h = velgHandling(s, { verdener: 12, terskel: 6, frø: (f * 131 + sete * 17 + guard) >>> 0 });
      else h = grådigHandling(s);
      s = utfør(s, h).state;
    }
    pimcPoeng += s.totalPoeng[sete] ?? 0;
    grådigPoeng += (s.totalPoeng.reduce((a, b) => a + b, 0) - (s.totalPoeng[sete] ?? 0)) / 3;
    if (s.vinner === sete) seire++;
    kamper++;
    console.log(`kamp ${kamper}/${antallFrø * 4} ferdig`);
  }
}

const diff = (pimcPoeng - grådigPoeng) / kamper;
mkdirSync("trening-felles", { recursive: true });
writeFileSync(
  "trening-felles/pimc-referanse.json",
  JSON.stringify({
    diff: Math.round(diff * 10) / 10,
    pimc: Math.round((pimcPoeng / kamper) * 10) / 10,
    grådig: Math.round((grådigPoeng / kamper) * 10) / 10,
    seire,
    kamper,
  }),
);
console.log(
  `PIMC-referanse: ${(pimcPoeng / kamper).toFixed(1)} vs grådig ${(grådigPoeng / kamper).toFixed(1)}, ` +
    `diff ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}, seire ${seire}/${kamper} ` +
    `(${((performance.now() - t0) / 1000).toFixed(0)}s) → trening-felles/pimc-referanse.json`,
);
