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

/**
 * DEN AVGJØRENDE SAKEN, som den gamle formen ALDRI kunne klare.
 *
 * `snitt + lambda * press * spredning` kan bare velte et valg med et NEGATIVT
 * ledd. Grenen med høyest snitt har som regel også størst spredning, så et
 * positivt ledd løfter den som allerede ledet.
 *
 * K5-prøven målte konsekvensen med kampstillingen holdt fast:
 *
 *     ligger BAK   **0 av 20** valg endret seg
 *     ligger FORAN   4 av 20 valg endret seg
 *
 * Kravet er «å ligge under skal gi mer risiko». Halve knotten var altså død.
 *
 * Denne testen låser den saken formen MÅ håndtere: den TRYGGE grenen har
 * høyest snitt, og likevel skal vi velge den risikable når vi ligger bak.
 */
test("BAK velter til en risikabel gren som har LAVERE snitt", () => {
  const RISIKO = [-8, -4, -1, 3, 18]; // snitt 1,6
  const TRYGG = [1, 2, 2, 2, 3]; // snitt 2,0 - leder paa snitt
  const snitt = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
  assert.ok(snitt(TRYGG) > snitt(RISIKO), "testcasen er feil: TRYGG maa lede paa snitt");

  // Uten press vinner snittet, som det skal.
  assert.ok(racescore(TRYGG, 0, 1.5) > racescore(RISIKO, 0, 1.5), "uten press skal snittet vinne");

  // BAK: den risikable skal vinne, selv med lavere snitt.
  assert.ok(
    racescore(RISIKO, 0.36, 1.5) > racescore(TRYGG, 0.36, 1.5),
    "naar vi ligger BAK skal en gren med stor oppside slaa en med hoeyere snitt. " +
      "Klarer den ikke det, er «aa ligge under gir mer risiko» fortsatt udemonstrert.",
  );

  // FORAN: den trygge skal vinne, i hver styrke.
  for (const l of [0.4, 1.0, 1.5, 2.0]) {
    assert.ok(
      racescore(TRYGG, -0.36, l) > racescore(RISIKO, -0.36, l),
      `naar vi LEDER skal den trygge vinne ved lambda ${l}`,
    );
  }
});

test("nullpunktet staar etter formskiftet - lambda 0 er fortsatt eksakt snittet", () => {
  // Uten dette kan ingen sveip starte fra noe kjent.
  for (const v of [[1, 2, 3], [-5, 0, 12, 4], [7]]) {
    const snitt = v.reduce((a, b) => a + b, 0) / v.length;
    for (const press of [-1, -0.36, 0, 0.36, 1]) {
      assert.equal(racescore(v, press, 0), snitt, `lambda 0 ga ikke snittet ved press ${press}`);
    }
  }
});
