/**
 * Måler MesterAI (appens President-nivå, via Swift-adapteren) mot tre grådige
 * boter – NØYAKTIG samme oppsett og metrikk som neat-pimc-referanse.ts, så
 * tallet kan tegnes som referansestrek i fremgangsgrafen ved siden av
 * PIMC-streken og C4/D1-kurvene.
 *
 * Krever at arena-adapteren er bygget (se arena/README.md):
 *   1) bash arena/hent-appkode.sh
 *   2) cd arena/adapter && swift build -c release
 *   3) node examples/mesterai-referanse.ts [antallFrø=8] [--ms 450]
 *            [--adapter arena/adapter/.build/release/adapter]
 *
 * Skriver trening-felles/mesterai-referanse.json {diff, mester, grådig, kamper}.
 * neat-graf.ts plukker den opp automatisk og tegner MesterAI-streken.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";

import { opprettSpill, utfør, type Handling } from "../src/motor.ts";
import { grådigHandling } from "./graadig.ts";
import {
  Adapter,
  handlingFraJson,
  handlingTilJson,
  rundeStart,
  sjekkSynk,
} from "../arena/adapterklient.ts";

function flagg(navn: string, standard: number): number {
  const i = process.argv.indexOf(`--${navn}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? Number(process.argv[i + 1]) : standard;
}
function tekstFlagg(navn: string, standard: string): string {
  const i = process.argv.indexOf(`--${navn}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : standard;
}

const posisjonelle = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const antallFrø = Number(posisjonelle[0] ?? 8);
const tidMs = flagg("ms", 450);
const adapterSti = tekstFlagg("adapter", "arena/adapter/.build/release/adapter");

if (!existsSync(adapterSti)) {
  console.error(
    `Fant ikke adapteren på ${adapterSti}.\n` +
      "Bygg den først – se arena/README.md – eller pek på den med --adapter.",
  );
  process.exit(1);
}

/** Spiller én 40-runders kamp: MesterAI i `sete`, grådig i de tre andre. */
async function spillKamp(adapter: Adapter, frø: number, sete: number): Promise<number[]> {
  await adapter.send({ type: "nyKamp", mesterSeter: [sete] });
  let state = opprettSpill({ antallSpillere: 4 }, frø);
  await adapter.send(rundeStart(state));

  let guard = 0;
  while (state.fase !== "FERDIG" && guard++ < 20000) {
    if (state.fase === "RUNDE_SLUTT") {
      if (state.rundeNr + 1 >= 40) break;
      const res = utfør(state, { type: "NESTE" });
      state = res.state;
      for (const h of res.hendelser) {
        if (h.type === "NY_RUNDE") await adapter.send(rundeStart(state));
      }
      continue;
    }
    const aktør = state.fase === "VRAK" || state.fase === "VELG" ? state.budvinner! : state.iTur!;
    let handling: Handling;
    if (aktør === sete) {
      const svar = await adapter.send({ type: "beslutt", sete: aktør });
      handling = handlingFraJson(svar.handling!);
    } else {
      handling = grådigHandling(state);
    }
    const res = utfør(state, handling);
    state = res.state;
    const svar = await adapter.send({ type: "handling", handling: handlingTilJson(handling) });
    sjekkSynk(state, svar, `runde ${state.rundeNr}, ${handling.type} fra sete ${aktør}`);
    for (const h of res.hendelser) {
      if (h.type === "NY_RUNDE") await adapter.send(rundeStart(state));
    }
  }
  return state.totalPoeng.slice();
}

async function hoved(): Promise<void> {
  const adapter = new Adapter(adapterSti);
  await adapter.send({ type: "init", mesterSeter: [], tidsbudsjettMs: tidMs });

  let mesterPoeng = 0;
  let grådigPoeng = 0;
  let seire = 0;
  let kamper = 0;
  console.log(`MesterAI-referanse: ${antallFrø} frø × 4 seter, ${tidMs} ms per kortvalg\n`);
  for (let f = 0; f < antallFrø; f++) {
    for (let sete = 0; sete < 4; sete++) {
      // Samme frø-serie (777000+f) som neat-pimc-referanse.ts → sammenliknbart.
      const poeng = await spillKamp(adapter, 777000 + f, sete);
      mesterPoeng += poeng[sete] ?? 0;
      grådigPoeng += (poeng.reduce((a, b) => a + b, 0) - (poeng[sete] ?? 0)) / 3;
      const vant = poeng[sete] === Math.max(...poeng);
      if (vant) seire++;
      kamper++;
      console.log(`kamp ${kamper}/${antallFrø * 4} ferdig (sete ${sete})`);
    }
  }
  adapter.stopp();

  const diff = (mesterPoeng - grådigPoeng) / kamper;
  mkdirSync("trening-felles", { recursive: true });
  writeFileSync(
    "trening-felles/mesterai-referanse.json",
    JSON.stringify({
      diff: Math.round(diff * 10) / 10,
      mester: Math.round((mesterPoeng / kamper) * 10) / 10,
      grådig: Math.round((grådigPoeng / kamper) * 10) / 10,
      kamper,
    }),
  );
  console.log(
    `\nMesterAI-referanse: ${(mesterPoeng / kamper).toFixed(1)} vs grådig ` +
      `${(grådigPoeng / kamper).toFixed(1)}, diff ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}, ` +
      `seire ${seire}/${kamper}\n→ trening-felles/mesterai-referanse.json (grafen tegner streken)`,
  );
}

hoved().catch((feil: unknown) => {
  console.error(feil);
  process.exit(1);
});
