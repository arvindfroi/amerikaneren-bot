/**
 * KJERNENE ER BIT-IDENTISKE MED REFERANSEN (17. sep): `foroverSimd` og `foroverRask` mot
 * `foroverRef`, på kortnettet med glisne, tette og hjørne-innganger (−0, 1, store verdier).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { foroverRef, forover, nettFraBytes, type NevroNett } from "../src/nevro/nett.ts";
import { foroverRask } from "../src/nevro/nett-rask.ts";
import { foroverSimd, simdTilgjengelig } from "../src/nevro/nett-simd.ts";
import { lagRng } from "../src/kort.ts";

const nett: NevroNett = nettFraBytes(new Uint8Array(readFileSync("e1-modell/kort-8.bin")))[0]!;
const rng = lagRng(17_092_026);
const innganger: Float32Array[] = [];
for (let i = 0; i < 300; i++) {
  const x = new Float32Array(493);
  const tetthet = i % 3 === 0 ? 1 : i % 3 === 1 ? 0.2 : 0.05;
  for (let c = 0; c < 493; c++) {
    if (rng() >= tetthet) continue;
    const u = rng();
    x[c] = u < 0.5 ? 1 : u < 0.6 ? -0 : u < 0.7 ? (rng() - 0.5) * 1e4 : rng() * 2 - 1;
  }
  innganger.push(x);
}
const likeBiter = (a: Float32Array, b: Float32Array): boolean =>
  a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

test("SIMD-kjernen finnes i Node og er bit-identisk med referansen", () => {
  assert.equal(simdTilgjengelig(), true);
  for (const x of innganger) assert.ok(likeBiter(foroverSimd(nett, x)!, foroverRef(nett, x)));
});

test("JS-kolonnekjernen er bit-identisk med referansen", () => {
  for (const x of innganger) assert.ok(likeBiter(foroverRask(nett, x), foroverRef(nett, x)));
});

test("forover (auto) gir referansens biter, og utgangen overlever neste kall", () => {
  const a = forover(nett, innganger[0]!);
  const kopi = a.slice();
  forover(nett, innganger[1]!);
  assert.ok(likeBiter(a, kopi));
  assert.ok(likeBiter(a, foroverRef(nett, innganger[0]!)));
});

test("odde utganger og for kort inngang faller tilbake uten feil", () => {
  const lag = { inn: 3, ut: 3, vekter: Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]), bias: Float32Array.from([0.5, -1, 2]) };
  const odde: NevroNett = { lag: [lag] };
  assert.equal(foroverSimd(odde, Float32Array.from([1, 0, 2])), null);
  assert.ok(likeBiter(forover(odde, Float32Array.from([1, 0, 2])), foroverRef(odde, Float32Array.from([1, 0, 2]))));
  assert.equal(foroverSimd(nett, new Float32Array(10)), null);
});
