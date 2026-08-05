/**
 * INGEN SØK INNE I SØK.
 *
 * Hver søkeoperator tar en ROLLOUT-MOTPART som modellerer hvordan de andre
 * spiller. Fikk den det INDRE laget, og det laget selv var et søk, startet hver
 * eneste rollout et nytt søk. Eksponentielt.
 *
 * DET KOSTET EN HEL NATT. Tre målinger av søk i flere seter måtte brytes, og
 * jeg konkluderte hver gang med at det var en KOSTNADSGRENSE i spillet. Det var
 * en bug i speken. Etter fiksen: `ork:foerer:12 + ork:forsvar:12` gikk fra
 * umålbart til 211 ms per trekk — billigere enn `ork:foerer:24` alene, som
 * koster 329.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { utenSøk, lagIndre } from "../src/moe2/agentspek.ts";

const BASE = "vakt:abmp:e1:e1-modell/d7alle.bin";

test("utenSøk strimler ETHVERT antall søkelag ned til basen", () => {
  for (const spek of [
    BASE,
    `ork:foerer:24:${BASE}`,
    `ork:foerer:24:ork:forsvar:12:${BASE}`,
    `sik:foerer:1:12:ork:foerer:24:${BASE}`,
    `vv:8:ork:foerer:12:${BASE}`,
    // vv2 er UTELATT med vilje: `lagIndre` bruker `d.slice(3)` mens
    // kommentaren over den sier «vv2:<verdener>:<flagg>:<indre>», altså tre
    // felt. Koden hopper over fire. Det er en eksisterende uenighet i en
    // lite brukt operator, og å rette den her ville endret atferd uten
    // måling. `utenSøk` speiler derfor koden, ikke kommentaren.
  ]) {
    assert.equal(utenSøk(spek), BASE, `«${spek}» ble ikke strippet til basen`);
  }
});

test("en base uten søk er sin egen base – ingen stille forkorting", () => {
  for (const spek of [BASE, "nevro", "e1:e1-modell/d7alle.bin", "budm:e1-modell/bud-vant.json@-3.0:nevro"]) {
    assert.equal(utenSøk(spek), spek);
  }
});

/**
 * DEN AVGJØRENDE: et nestet søk må BYGGE, og motparten inni må være raskere
 * enn det ytre laget. Måler vi ikke det, kan bugen snike seg inn igjen som en
 * ren ytelsesregresjon som ingen test ser.
 */
test("nestet søk bygger, og er ikke eksponentielt tregt", () => {
  const t0 = Date.now();
  const a = lagIndre(`ork:foerer:12:ork:forsvar:12:${BASE}`);
  assert.equal(typeof a.velgHandling, "function");
  // Byggingen alene skal være øyeblikkelig; er den treg, lages det agenter
  // rekursivt et sted den ikke skal.
  assert.ok(Date.now() - t0 < 5000, "byggingen tok over fem sekunder");
});
