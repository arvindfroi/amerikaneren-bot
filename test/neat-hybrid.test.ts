import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lagRng } from "../src/kort.ts";
import { opprettSpill, utfør, type GameState } from "../src/motor.ts";
import { Innovasjonsbok, nyttGenom } from "../src/neat/genom.ts";
import { HybridAgent } from "../src/neat/hybrid.ts";
import { ANTALL_INN, ANTALL_UT } from "../src/neat/trekk.ts";

test("HybridAgent spiller en hel kamp lovlig (eksakt sluttspill fra 3 stikk)", () => {
  const bok = new Innovasjonsbok(ANTALL_INN, ANTALL_UT);
  const agenter = [1, 2, 3, 4].map(
    (frø) => new HybridAgent(nyttGenom(ANTALL_INN, ANTALL_UT, bok, lagRng(frø)), {
      stikkTerskel: 3,
      verdener: 2,
      nodeTak: 50_000,
    }),
  );
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 77);
  let handlinger = 0;
  while (s.fase !== "FERDIG" && handlinger++ < 6000) {
    if (s.fase === "RUNDE_SLUTT") {
      if (s.rundeNr + 1 >= 4) break;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    // Motoren kaster ved ulovlige handlinger – testen feiler da automatisk.
    s = utfør(s, agenter[sete]!.velgHandling(s)).state;
  }
  assert.ok(handlinger < 6000, "kampen terminerte");
});
