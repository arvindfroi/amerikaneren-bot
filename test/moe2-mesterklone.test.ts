import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lovligeKort, opprettSpill } from "../src/index.ts";
import { utfør, type GameState } from "../src/motor.ts";
import { NevroAgent } from "../src/nevro/agent.ts";
import { kortIndeks } from "../src/neat/trekk.ts";
import type { NevroNett } from "../src/nevro/nett.ts";
import { KLONE_DIM, kloneTrekk, MesterKlone, NEVRO_SNARVEI } from "../src/moe2/mesterklone.ts";
import { E1_SPILL_DIM } from "../src/e1/trekk.ts";

/**
 * Klonen er NevroHjerne pluss en lært korreksjon. Testene her låser nøyaktig
 * det: at snarveien virker, og at trekkvektoren er den treneren bygger.
 */

const nevro = new NevroAgent();

function framTilValg(frø: number): GameState | null {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 200) {
    if (s.fase === "SPILL" && s.iTur !== null && lovligeKort(s, s.iTur).length >= 3) return s;
    s = utfør(s, nevro.velgHandling(s)).state;
  }
  return null;
}

/** Et nett som alltid gir null ut – da er snarveien alt som avgjør. */
function nullnett(): NevroNett {
  return {
    lag: [
      {
        inn: KLONE_DIM,
        ut: 52,
        vekter: new Float32Array(KLONE_DIM * 52),
        bias: new Float32Array(52),
      },
    ],
  };
}

test("et UTRENT nett spiller nøyaktig som NevroHjerne – snarveien virker", () => {
  // Dette er hele grunnen til at snarveien finnes. Uten den starter klonen på
  // gulvet (42 % målt) i stedet for på nullpunktet (68 %), og en poengmåling
  // etterpå ville ikke kunnet skille «feil motstandermodell» fra «dårligere
  // modell».
  assert.ok(NEVRO_SNARVEI > 0);
  const s = framTilValg(4242);
  assert.ok(s !== null, "fant ingen stilling med tre lovlige kort");
  const klone = new MesterKlone(nullnett());
  const a = klone.velgHandling(s);
  const b = nevro.velgHandling(s);
  assert.deepEqual(a, b);
});

test("trekkvektoren er 273 E1-trekk + én-av-52 for NevroHjernes valg", () => {
  // Treneren bygger nøyaktig denne vektoren fra `t` og `kn` i mester-data.
  // Gikk de to fra hverandre, ville nettet fått en annen inngang enn det ble
  // trent på – og ingenting ville feilet.
  const s = framTilValg(4242);
  assert.ok(s !== null);
  const h = nevro.velgHandling(s);
  assert.equal(h.type, "SPILL");
  if (h.type !== "SPILL") return;
  const x = kloneTrekk(s, s.iTur!, h.kort);
  assert.equal(x.length, KLONE_DIM);
  assert.equal(KLONE_DIM, E1_SPILL_DIM + 52);
  let satt = 0;
  for (let i = E1_SPILL_DIM; i < KLONE_DIM; i++) if (x[i] !== 0) satt++;
  assert.equal(satt, 1);
  assert.equal(x[E1_SPILL_DIM + kortIndeks(h.kort)], 1);
});
