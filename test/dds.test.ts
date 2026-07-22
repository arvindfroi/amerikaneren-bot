import { test } from "node:test";
import assert from "node:assert/strict";
import { løsDD, rotVerdier, evaluerHybrid, kortTilInt, intTilKort } from "../src/solver/dds.ts";
import { nyStokk, stokk, lagRng } from "../src/kort.ts";
import type { Farge } from "../src/kort.ts";

const c = (f: Farge, v: number): number => kortTilInt({ farge: f, verdi: v as never });

test("kortTilInt/intTilKort er inverse", () => {
  for (let i = 0; i < 52; i++) assert.equal(kortTilInt(intTilKort(i)), i);
});

test("DDS: høyeste trumf tar det ene stikket", () => {
  const v = løsDD({
    N: 4,
    trump: 0,
    declLag: [true, false, true, false],
    hender: [[c("S", 14)], [c("H", 2)], [c("H", 3)], [c("H", 4)]],
    iTur: 0,
    totalStikk: 1,
  });
  assert.equal(v, 1);
});

test("DDS: solo leder sidefarge, motstander trumfer -> 0 stikk", () => {
  const v = løsDD({
    N: 4,
    trump: 0,
    declLag: [true, false, false, false],
    hender: [[c("H", 5)], [c("S", 2)], [c("H", 7)], [c("H", 8)]],
    iTur: 0,
    totalStikk: 1,
  });
  assert.equal(v, 0);
});

test("DDS: alle trumf hos laget -> alle stikk", () => {
  const v = løsDD({
    N: 4,
    trump: 0,
    declLag: [true, false, true, false],
    hender: [
      [c("S", 14), c("S", 13), c("S", 12)],
      [c("H", 2), c("H", 3), c("H", 4)],
      [c("S", 11), c("S", 10), c("S", 9)],
      [c("H", 5), c("H", 6), c("H", 7)],
    ],
    iTur: 0,
    totalStikk: 3,
  });
  assert.equal(v, 3);
});

test("DDS: declStikkFør regnes med", () => {
  const v = løsDD({
    N: 4,
    trump: 0,
    declLag: [true, false, true, false],
    hender: [[c("S", 14)], [c("H", 2)], [c("H", 3)], [c("H", 4)]],
    iTur: 0,
    totalStikk: 5,
    declStikkFør: 3,
    ferdigeStikk: 4,
  });
  assert.equal(v, 4);
});

test("rotVerdier gir en verdi per lovlig kort", () => {
  const rv = rotVerdier({
    N: 4,
    trump: 0,
    declLag: [true, false, false, false],
    hender: [
      [c("S", 14), c("H", 2)],
      [c("S", 2), c("H", 3)],
      [c("S", 3), c("H", 4)],
      [c("S", 4), c("H", 5)],
    ],
    iTur: 0,
    totalStikk: 2,
  });
  assert.equal(rv.length, 2);
  for (const r of rv) assert.ok(r.lagStikk >= 0 && r.lagStikk <= 2);
});

test("evaluerHybrid = eksakt når restspill <= terskel", () => {
  // Med terskel >= antall stikk skal hybrid gi eksakt samme som løsDD.
  function deal(seed: number, k: number): number[][] {
    const s = stokk(nyStokk(), lagRng(seed)).map(kortTilInt);
    return [s.slice(0, k), s.slice(k, 2 * k), s.slice(2 * k, 3 * k), s.slice(3 * k, 4 * k)];
  }
  for (let i = 0; i < 20; i++) {
    const hender = deal(700 + i, 6);
    const o = {
      N: 4,
      trump: 0,
      declLag: [true, false, true, false],
      hender,
      iTur: 0,
      totalStikk: 6,
    };
    assert.equal(evaluerHybrid(o, 6), løsDD(o));
  }
});
