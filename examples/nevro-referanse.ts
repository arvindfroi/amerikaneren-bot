/**
 * Måler appens nevronett (TS-porten i src/nevro) mot tre grådige boter –
 * NØYAKTIG samme oppsett, frø-serie og metrikk som neat-pimc-referanse.ts og
 * mesterai-referanse.ts, så tallet er direkte sammenliknbart med de andre
 * strekene i fremgangsgrafen.
 *
 *   node examples/nevro-referanse.ts [antallFrø=8]
 *
 * I motsetning til mesterai-referanse.ts trenger denne INGEN Swift og ingen
 * adapter: vektene ligger i web/nevro-vekter.b64.txt (hentes med
 * arena/hent-nevrovekter.ts). Skriver trening-felles/nevro-referanse.json.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { opprettSpill, utfør, type Handling } from "../src/motor.ts";
import { hjerneFraBase64 } from "../src/nevro/nett.ts";
import { NevroSpiller } from "../src/nevro/spiller.ts";
import { grådigHandling } from "./graadig.ts";

const antallFrø = Number(process.argv.slice(2).filter((a) => !a.startsWith("--"))[0] ?? 8);
const VEKTER = "web/nevro-vekter.b64.txt";

if (!existsSync(VEKTER)) {
  console.error(
    `Fant ikke ${VEKTER}.\nHent vektene først:\n` +
      "  node arena/hent-nevrovekter.ts /sti/til/Amerikaneren-App",
  );
  process.exit(1);
}
const hjerne = hjerneFraBase64(readFileSync(VEKTER, "utf8"));

/** Spiller én 40-runders kamp: nevronettet i `sete`, grådig i de tre andre. */
function spillKamp(frø: number, sete: number): number[] {
  const nevro = new NevroSpiller(sete, hjerne);
  let state = opprettSpill({ antallSpillere: 4 }, frø);
  let guard = 0;
  while (state.fase !== "FERDIG" && guard++ < 20000) {
    if (state.fase === "RUNDE_SLUTT") {
      if (state.rundeNr + 1 >= 40) break;
      state = utfør(state, { type: "NESTE" }).state;
      continue;
    }
    const aktør = state.fase === "VRAK" || state.fase === "VELG" ? state.budvinner! : state.iTur!;
    const handling: Handling = aktør === sete ? nevro.velgHandling(state) : grådigHandling(state);
    state = utfør(state, handling).state;
  }
  return state.totalPoeng.slice();
}

let nevroPoeng = 0;
let grådigPoeng = 0;
let seire = 0;
let kamper = 0;
console.log(`Nevronett-referanse: ${antallFrø} frø × 4 seter\n`);
for (let f = 0; f < antallFrø; f++) {
  for (let sete = 0; sete < 4; sete++) {
    // Samme frø-serie (777000+f) som de andre referansemålingene.
    const poeng = spillKamp(777000 + f, sete);
    nevroPoeng += poeng[sete] ?? 0;
    grådigPoeng += (poeng.reduce((a, b) => a + b, 0) - (poeng[sete] ?? 0)) / 3;
    if (poeng[sete] === Math.max(...poeng)) seire++;
    kamper++;
  }
  console.log(`frø ${f + 1}/${antallFrø} ferdig (${kamper} kamper)`);
}

const diff = (nevroPoeng - grådigPoeng) / kamper;
mkdirSync("trening-felles", { recursive: true });
writeFileSync(
  "trening-felles/nevro-referanse.json",
  JSON.stringify({
    diff: Math.round(diff * 10) / 10,
    nevro: Math.round((nevroPoeng / kamper) * 10) / 10,
    grådig: Math.round((grådigPoeng / kamper) * 10) / 10,
    kamper,
  }),
);
console.log(
  `\nNevronett-referanse: ${(nevroPoeng / kamper).toFixed(1)} vs grådig ` +
    `${(grådigPoeng / kamper).toFixed(1)}, diff ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}, ` +
    `seire ${seire}/${kamper}\n→ trening-felles/nevro-referanse.json`,
);
