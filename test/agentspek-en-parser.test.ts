/**
 * ÉN parser, ikke sju kopier – håndhevet.
 *
 * Fram til 5. august hadde `lagIndre` sju kopier, og driften var ikke
 * kosmetisk: `examples/gate2.ts` kjente elleve spekformer, de seks
 * analyseverktøyene kjente TRE. De kunne ikke parse `vr:`, og de bygde
 * `Budagent` UTEN terskelargument – altså standard 2,5 der Adams bruker −3,0.
 * Det er den samme konstanten som ga +0,392 da den ble flyttet.
 *
 * Hver atferdsanalyse prosjektet hadde kjørt, målte dermed en annen bot enn
 * den som spiller. Samme feilklasse som breddedriften og som trosnettet: DET
 * SOM MÅLES OG DET SOM RULLES UT VAR IKKE SAMME TING.
 *
 * Denne testen gjør at det ikke kan skje igjen i stillhet.
 */

import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { ADAMS, lagIndre, tall, ADAMS_MAALT, ADAMS_V6, ADAMS_V6_FULL } from "../src/moe2/agentspek.ts";

const ROT = join(import.meta.dirname, "..");

test("ingen fil utenfor agentspek.ts definerer sin egen lagIndre", () => {
  const skyldige: string[] = [];
  for (const mappe of ["examples", "src", "test"]) {
    for (const f of readdirSync(join(ROT, mappe))) {
      if (!f.endsWith(".ts")) continue;
      const sti = join(mappe, f);
      if (sti === join("src", "moe2", "agentspek.ts")) continue;
      const kilde = readFileSync(join(ROT, sti), "utf8");
      if (/(?:^|\n)\s*(?:export\s+)?function lagIndre\s*\(/.test(kilde)) skyldige.push(sti);
    }
  }
  assert.deepEqual(skyldige, [], `disse har sin egen kopi av parseren: ${skyldige.join(", ")}`);
});

test("ADAMS-speken bygger, og inneholder hvert lag i den utrullede stakken", () => {
  for (const lag of ["vr:", "budm:", "vakt:", "e1:"]) {
    assert.ok(ADAMS.includes(lag), `ADAMS mangler laget «${lag}»`);
  }
  // Terskelen MÅ stå eksplisitt. Uten «@» får Budagent standardverdien 2,5,
  // og det er nettopp den stille regresjonen testen finnes for.
  assert.match(ADAMS, /@-?\d/, "ADAMS mangler eksplisitt budterskel");
  const a = lagIndre(ADAMS);
  assert.equal(typeof a.velgHandling, "function");
  assert.equal(typeof a.nyKamp, "function");
});

test("tall() feiler HØYLYTT på noe som ikke er et tall", () => {
  assert.equal(tall(undefined, 7, "x"), 7);
  assert.equal(tall("42", 7, "x"), 42);
  // Den ekte feilen: en spek sendt inn der et frø var ventet ga NaN, og NaN
  // som frø gir samme giv om og om igjen – en måling som ser ferdig ut.
  assert.throws(() => tall("vr:e1-modell/vrakrang.bin:telrd", 7, "frø"), /må være et tall/);
  assert.throws(() => tall("", 7, "frø"), /må være et tall/);
});

/**
 * ALLE NAVNGITTE STAKKER MÅ FAKTISK LA SEG BYGGE.
 *
 * `ADAMS_V6_FULL` forekom nøyaktig én gang i repoet: sin egen deklarasjon. Den
 * er en spek på ni ledd som ingen bygde og ingen testet — altså en påstand om
 * en bot som kanskje ikke finnes.
 *
 * Speker er strenger. Ingen typesjekk krysser dem, så et ledd som endrer navn
 * eller får et nytt argument bryter en ubenyttet spek i stillhet, og feilen
 * dukker opp den dagen noen endelig kjører den.
 */
test("hver navngitt ADAMS-stakk lar seg bygge", () => {
  for (const [navn, spek] of [
    ["ADAMS", ADAMS],
    ["ADAMS_MAALT", ADAMS_MAALT],
    ["ADAMS_V6", ADAMS_V6],
    ["ADAMS_V6_FULL", ADAMS_V6_FULL],
  ] as const) {
    let agent: unknown = null;
    assert.doesNotThrow(() => {
      agent = lagIndre(spek);
    }, `${navn} lot seg ikke bygge: ${spek}`);
    assert.ok(agent !== null, `${navn} ga ingen agent`);
    assert.ok(
      typeof (agent as { velgHandling?: unknown }).velgHandling === "function",
      `${navn} ga noe uten velgHandling`,
    );
  }
});
