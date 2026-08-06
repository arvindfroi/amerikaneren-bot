/**
 * KAMPSTILLING SOM EVNE — testene som gjør den til noe annet enn en gjetning.
 *
 * Faren er en knott som enten aldri slår inn (da er den pynt) eller alltid slår
 * inn (da legger den varians i hver eneste runde uten grunn). Begge deler ville
 * vært usynlige: ingen feiler, tallene blir bare litt andre.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { racepress, racescore, snittOgSpredning } from "../src/moe2/race.ts";
import type { GameState } from "../src/motor.ts";

const stilling = (poeng: number[], mål = 100): GameState =>
  ({ totalPoeng: poeng, antallSpillere: 4, regler: { målPoeng: mål } }) as unknown as GameState;

test("presset er NULL tidlig i kampen, uansett gap", () => {
  // 10 mot 25 er et stort relativt gap, men racet har knapt begynt.
  assert.equal(racepress(stilling([10, 25, 0, 0]), 0), 0);
});

test("presset er positivt naar vi ligger bak SENT, negativt naar vi leder", () => {
  const bak = racepress(stilling([40, 90, 0, 0]), 0);
  const foran = racepress(stilling([90, 40, 0, 0]), 0);
  assert.ok(bak > 0, `bak skal gi positivt press, fikk ${bak}`);
  assert.ok(foran < 0, `ledelse skal gi negativt press, fikk ${foran}`);
  assert.equal(Math.sign(bak), -Math.sign(foran));
});

test("presset VOKSER mot slutten ved samme gap", () => {
  const tidlig = racepress(stilling([35, 55, 0, 0]), 0);
  const sent = racepress(stilling([75, 95, 0, 0]), 0);
  assert.ok(sent > tidlig, `samme gap skal presse hardere sent (${tidlig} -> ${sent})`);
});

test("lambda = 0 gir NOEYAKTIG snittet - bit-identisk med aa ikke bruke regelen", () => {
  const v = [3, -5, 11, 0];
  const { snitt } = snittOgSpredning(v);
  assert.equal(racescore(v, 0.9, 0), snitt);
  assert.equal(racescore(v, 0, 0.9), snitt, "press 0 skal ogsaa gi rent snitt");
});

test("bak: hoey spredning foretrekkes. foran: lav spredning foretrekkes", () => {
  const trygg = [2, 2, 2, 2]; // snitt 2, ingen spredning
  const vill = [-8, 12, -8, 12]; // snitt 2, stor spredning
  const λ = 0.5;
  assert.ok(racescore(vill, +1, λ) > racescore(trygg, +1, λ), "bak skal foretrekke varians");
  assert.ok(racescore(vill, -1, λ) < racescore(trygg, -1, λ), "ledelse skal unngaa varians");
});

test("spredningen regnes over utfallsvektoren, ikke gjettet", () => {
  const { snitt, spredning } = snittOgSpredning([0, 10]);
  assert.equal(snitt, 5);
  assert.ok(Math.abs(spredning - Math.sqrt(50)) < 1e-9, `fikk ${spredning}`);
});
