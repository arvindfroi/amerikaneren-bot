import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fraKortId,
  kortId,
  lagRng,
  likeKort,
  nyStokk,
  stokk,
} from "../src/kort.ts";

test("full stokk har 52 unike kort", () => {
  const s = nyStokk();
  assert.equal(s.length, 52);
  const ids = new Set(s.map(kortId));
  assert.equal(ids.size, 52);
});

test("kortId og fraKortId er inverse", () => {
  for (const k of nyStokk()) {
    assert.ok(likeKort(fraKortId(kortId(k)), k), `roundtrip feilet for ${kortId(k)}`);
  }
  assert.equal(kortId({ farge: "S", verdi: 14 }), "SA");
  assert.equal(kortId({ farge: "H", verdi: 10 }), "H10");
  assert.equal(kortId({ farge: "K", verdi: 11 }), "KJ");
});

test("stokking med samme seed er deterministisk", () => {
  const a = stokk(nyStokk(), lagRng(42));
  const b = stokk(nyStokk(), lagRng(42));
  const c = stokk(nyStokk(), lagRng(43));
  assert.deepEqual(a.map(kortId), b.map(kortId));
  assert.notDeepEqual(a.map(kortId), c.map(kortId));
  // Stokken bevarer alle 52 kort.
  assert.equal(new Set(a.map(kortId)).size, 52);
});
