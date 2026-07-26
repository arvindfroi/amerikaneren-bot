import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lovligeKort, opprettSpill } from "../src/index.ts";
import { utfør, type GameState } from "../src/motor.ts";
import { NevroAgent } from "../src/nevro/agent.ts";
import { kortIndeks } from "../src/neat/trekk.ts";
import { lagMotpart, SDAgent } from "../src/moe2/sdagent.ts";
import type { Utspiller } from "../src/moe2/sdkort.ts";

/**
 * SD-evalueringen som policy. Invariantene her er de som gjør en måling av
 * TO MOTSTANDERMODELLER gyldig – hvis de brytes, måler man noe annet enn det
 * man tror.
 */

const nevro = new NevroAgent();

/** Spiller fram til SPILL-fasen med minst to lovlige kort for den i tur. */
function framTilValg(frø: number): GameState | null {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 200) {
    if (s.fase === "SPILL" && s.iTur !== null && lovligeKort(s, s.iTur).length >= 2) return s;
    s = utfør(s, nevro.velgHandling(s)).state;
  }
  return null;
}

test("SDAgent spiller alltid et LOVLIG kort – reglene håndheves av motoren", () => {
  const s = framTilValg(4242);
  assert.ok(s !== null, "fant ingen stilling med to lovlige kort");
  const agent = new SDAgent(new NevroAgent(), { verdener: 2, frø: 1 });
  const h = agent.velgHandling(s);
  assert.equal(h.type, "SPILL");
  if (h.type !== "SPILL") return;
  const lovlige = lovligeKort(s, s.iTur!).map(kortIndeks);
  assert.ok(lovlige.includes(kortIndeks(h.kort)));
});

test("motstandermodellen er FAKTISK i bruk – to ulike modeller gir ulike utspillinger", () => {
  // Poenget med hele øvelsen er at `motpart` styrer rolloutene. Blir den
  // ignorert, ville en måling av «nevro-modell mot MesterAI-modell» vært en
  // måling av ingenting – og den feilen ville ikke gitt noe utslag i typer,
  // bare et flatt resultat man kunne tolket som «byttet hjelper ikke».
  const s = framTilValg(4242);
  assert.ok(s !== null);
  let kall = 0;
  const teller: Utspiller = {
    velgHandling: (st) => {
      kall++;
      return nevro.velgHandling(st);
    },
  };
  const agent = new SDAgent(teller, { verdener: 2, frø: 1 });
  agent.velgHandling(s);
  assert.ok(kall > 0, "motstandermodellen ble aldri spurt");
});

test("nyKamp setter verdenstrekningen tilbake – to kandidater trekker samme verdener", () => {
  // Uten dette ville differansen mellom to motstandermodeller vært dominert av
  // hvilke hender som tilfeldigvis ble samplet, ikke av modellene. Det er den
  // samme parringen duplikatgiverne på benken bygger på.
  const s = framTilValg(4242);
  assert.ok(s !== null);
  const agent = new SDAgent(new NevroAgent(), { verdener: 4, frø: 99 });
  const a = agent.velgHandling(s);
  agent.nyKamp();
  const b = agent.velgHandling(s);
  assert.deepEqual(a, b);
});

test("lagMotpart avviser ukjente spesifikasjoner i stedet for å gjette", () => {
  assert.ok(lagMotpart("nevro") !== null);
  assert.throws(() => lagMotpart("mesterai"), /Ukjent motstandermodell/);
});
