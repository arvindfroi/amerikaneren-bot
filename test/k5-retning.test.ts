/**
 * K5-RETNINGEN FOR EN VILKÅRLIG SPEK — prøver for `examples/k5-retning.ts`.
 *
 * Kontrollen må treffe EKSAKT 0, og begge budfellene må tas hver sin vei. Og dommen
 * må kunne si JA: en spek som faktisk byr høyere bak — her den plantede armen lagt i
 * spekens plass — skal dømmes innfridd, og den motsatte ikke.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { ADAMS_MAALT } from "../src/moe2/agentspek.ts";
import { AMERIKANER, PASS, SOLO } from "../src/regler.ts";
import { budNivå, dømK5R, målK5R, type K5RRad } from "../examples/k5-retning.ts";

let buf: K5RRad[] | null = null;
/** Én måling deles av testene: CPU-en deles med treningen. */
const rader = (): K5RRad[] => (buf ??= målK5R({ spek: ADAMS_MAALT, giver: 6, budPerGiv: 4, spillPerGiv: 1 }));

test("budNivå: pass 0, tallbud = stikk, amerikaner 14, solo 15 — samme skala som mlb-k5", () => {
  assert.equal(budNivå(PASS), 0);
  assert.equal(budNivå(9), 9);
  assert.equal(budNivå(AMERIKANER), 14);
  assert.equal(budNivå(SOLO), 15);
});

test("K5R: kontrollen er EKSAKT 0 og fellene tas begge veier", () => {
  const d = dømK5R(rader());
  assert.ok(d.armer["KONTROLL"]!.budN > 0, "kontrollarmen fikk ingen budstillinger");
  assert.equal(d.kontrollOk, true, "lik stilling må gi eksakt 0 — ellers måler prøven agentbygging eller RNG");
  const pl = d.armer["PLANTET+BUD"]!;
  const mi = d.armer["PLANTET-BUD"]!;
  assert.ok(pl.høyere > pl.lavere && pl.p < 0.05, `PLANTET+BUD skulle by høyere bak: ${pl.høyere}/${pl.lavere}, p=${pl.p}`);
  assert.ok(mi.lavere > mi.høyere && mi.p < 0.05, `PLANTET-BUD skulle by lavere bak: ${mi.høyere}/${mi.lavere}, p=${mi.p}`);
  assert.ok(d.armer["PLANTET-SPILL"]!.andel > 0.5, "kortbytte-fella ble ikke tatt");
  assert.equal(d.felleOk, true);
});

test("K5R: ADAMS_MAALT leser ikke kampstillingen i budet — retningen er IKKE vist", () => {
  const d = dømK5R(rader());
  assert.equal(d.armer["spek"]!.budGap, 0, "budm uten kamp<λ> skal by likt bak og foran");
  assert.equal(d.dom, "nei");
});

test("K5R-dommen KAN si ja: den plantede +1-armen i spekens plass innfrir, −1-armen gjør det ikke", () => {
  const alle = rader();
  const som = (arm: string): K5RRad[] => [
    ...alle.filter((r) => r.arm !== "spek"),
    ...alle.filter((r) => r.arm === arm).map((r) => ({ ...r, arm: "spek" })),
  ];
  assert.equal(dømK5R(som("PLANTET+BUD")).dom, "ja", "en spek som byr høyere bak ble ikke dømt innfridd");
  assert.equal(dømK5R(som("PLANTET-BUD")).dom, "nei", "en spek som byr LAVERE bak ble dømt innfridd");
});

test("K5R: én ulik kontrollrad gjør hele raden stum", () => {
  const alle = rader();
  let byttet = false;
  const tuklet = alle.map((r) => {
    if (byttet || r.arm !== "KONTROLL" || r.fase !== "BUD") return r;
    byttet = true;
    return { ...r, budgap: 1, ulikt: 1 as const };
  });
  assert.equal(dømK5R(tuklet).dom, "stum");
});
