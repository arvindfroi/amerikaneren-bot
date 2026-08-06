/**
 * A1: SPILLVEKTEN MÅ FAKTISK STRAFFE DET DEN SIER.
 *
 * Regelen er: fulgte du farge og lot stikket gå, har du sannsynligvis ikke noe
 * høyere i den fargen. En verden som gir spilleren nettopp det kortet, skal
 * vektes ned.
 *
 * Faren er en vekt som alltid returnerer 0. Den ville ikke feilet, ikke
 * krasjet, og målingen ville sagt «spillvekt gir ingenting» på et oppsett som
 * ikke kunne gitt noe annet — nøyaktig slik sanseblokken lå død i 95 % av
 * kodingen (§32) og v2-budblokken ville vært null uten forkastningstrekking.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { Kort } from "../src/kort.ts";
import type { GameState } from "../src/motor.ts";
import { spillForenlighet, STRAFF } from "../src/moe2/spillvekt.ts";

const k = (farge: string, verdi: number): Kort => ({ farge, verdi }) as Kort;

/** Minimal tilstand: ett ferdigspilt stikk, ledet i spar, vunnet av sete 0. */
function medStikk(kort: { kort: Kort; spiller: number }[], trumf: string | null): GameState {
  return {
    trumf,
    historikk: [{ kort, vinner: 0 }],
    bord: [],
  } as unknown as GameState;
}

test("verden som gir en spiller det VINNENDE kortet de ikke spilte, straffes", () => {
  // Sete 1 fulgte med spar 4 i et stikk vunnet av spar konge.
  const stikk = [
    { kort: k("S", 13), spiller: 0 },
    { kort: k("S", 4), spiller: 1 },
  ];
  const s = medStikk(stikk, "H");
  // Verden A gir sete 1 spar ess – de lot altså et gratis stikk gå.
  const a = spillForenlighet(s, [[], [k("S", 14)], [], []], 0);
  // Verden B gir sete 1 bare smått – helt forenlig.
  const b = spillForenlighet(s, [[], [k("S", 2)], [], []], 0);
  assert.equal(b, 0, "forenlig verden skal ikke straffes");
  assert.ok(a < b, `verden med det vinnende kortet skal vektes ned (${a} mot ${b})`);
  assert.equal(a, -STRAFF);
});

test("ÉN straff per stikk per spiller, ikke per kort", () => {
  const stikk = [
    { kort: k("S", 10), spiller: 0 },
    { kort: k("S", 4), spiller: 1 },
  ];
  const s = medStikk(stikk, "H");
  const to = spillForenlighet(s, [[], [k("S", 14), k("S", 13)], [], []], 0);
  assert.equal(to, -STRAFF, "to hoeye kort skal ikke gi dobbel straff");
});

test("OBSERVATOEREN slutter ikke om seg selv", () => {
  const stikk = [
    { kort: k("S", 13), spiller: 0 },
    { kort: k("S", 4), spiller: 1 },
  ];
  const s = medStikk(stikk, "H");
  // Sete 1 er observatoer: vi VET hva vi har, ingen slutning.
  assert.equal(spillForenlighet(s, [[], [k("S", 14)], [], []], 1), 0);
});

test("stikk vunnet med TRUMF gir ingen slutning om ledfargen", () => {
  // Spar ledet, sete 0 trumfet med hjerter. At sete 1 har spar ess betyr da
  // ingenting – esset ville ikke vunnet.
  const stikk = [
    { kort: k("S", 3), spiller: 2 },
    { kort: k("S", 4), spiller: 1 },
    { kort: k("H", 2), spiller: 0 },
  ];
  const s = medStikk(stikk, "H");
  assert.equal(spillForenlighet(s, [[], [k("S", 14)], [], []], 0), 0);
});

test("den som VANT stikket slutter vi ingenting om", () => {
  const stikk = [
    { kort: k("S", 13), spiller: 0 },
    { kort: k("S", 4), spiller: 1 },
  ];
  const s = medStikk(stikk, "H");
  // Sete 0 vant. At de fortsatt har spar ess er helt normalt.
  assert.equal(spillForenlighet(s, [[k("S", 14)], [], [], []], 1), 0);
});

test("AVKAST straffes ikke - det er renonseforbudets jobb", () => {
  const stikk = [
    { kort: k("S", 13), spiller: 0 },
    { kort: k("R", 4), spiller: 1 }, // kastet av, foelger ikke farge
  ];
  const s = medStikk(stikk, "H");
  assert.equal(spillForenlighet(s, [[], [k("S", 14)], [], []], 0), 0);
});
