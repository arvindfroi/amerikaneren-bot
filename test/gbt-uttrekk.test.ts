/**
 * GBT-UTTREKKET MÅ FORBLI DET SAMME REGNESTYKKET.
 *
 * `src/moe2/gbt.ts` ble trukket ut av `examples/budmodell.ts` slik at
 * `budmodell-v2.ts` kunne bruke samme kode i stedet for en kopi.
 *
 * FØRSTE FORSØK ENDRET MODELLEN, og det er derfor denne testen finnes. Jeg
 * SKREV OM splittvakten i stedet for å kopiere den:
 *
 *     original:  if (nv < minBlad || n0 - nv < minBlad) continue;
 *     min:       if (nv === 0 || nv === n0) continue;
 *
 * Trærne fikk dermed splitte på bittesmå blader, og modellen ble en annen —
 * 312 kB mot 388 kB på samme korpus. Ingenting feilet; md5-sammenlikningen
 * mot en lagret basismodell var det eneste som avslørte det.
 *
 * Testen låser den ene invarianten som gjorde uttrekket lovlig: at et blad
 * ALDRI får færre enn `minBlad` rader. Brytes den, kan en fersk modell ikke
 * lenger sammenliknes med en eldre, og hver måling som krysser den grensen er
 * ugyldig uten å se det.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { byggTre, trenSkog, forutsi, anslåSkog } from "../src/moe2/gbt.ts";

/** Teller radene i hvert blad ved å sende hver rad gjennom treet. */
function bladstørrelser(tre: ReturnType<typeof byggTre>, X: Float32Array[]): number[] {
  const tell = new Map<object, number>();
  for (const x of X) {
    let n = tre;
    while (!n.blad) n = (x[n.kol!]! <= n.terskel! ? n.v! : n.h!)!;
    tell.set(n, (tell.get(n) ?? 0) + 1);
  }
  return [...tell.values()];
}

test("ingen blad faar faerre enn minBlad rader", () => {
  const N = 600;
  const B = 8;
  const X: Float32Array[] = [];
  const y: number[] = [];
  for (let i = 0; i < N; i++) {
    const v = new Float32Array(B);
    // Deterministisk «tilfeldig» – testen skal ikke kunne flakke.
    for (let k = 0; k < B; k++) v[k] = ((i * 2654435761 + k * 40503) % 1000) / 1000;
    X.push(v);
    y.push(v[0]! * 3 - v[1]! * 2 + (v[2]! > 0.5 ? 1 : 0));
  }
  const minBlad = 25;
  const idx = y.map((_, i) => i);
  const tre = byggTre(idx, X, y, 4, minBlad, B);
  for (const s of bladstørrelser(tre, X)) {
    assert.ok(s >= minBlad, `et blad fikk ${s} rader, minBlad er ${minBlad}`);
  }
});

test("skogen er deterministisk og reduserer feilen", () => {
  const N = 400;
  const B = 6;
  const X: Float32Array[] = [];
  const y: number[] = [];
  for (let i = 0; i < N; i++) {
    const v = new Float32Array(B);
    for (let k = 0; k < B; k++) v[k] = ((i * 1103515245 + k * 12345) % 997) / 997;
    X.push(v);
    y.push(v[0]! * 2 + (v[1]! > 0.5 ? 1.5 : -0.5));
  }
  const o = { runder: 40, dybde: 3, rate: 0.1, bredde: B };
  const a = trenSkog(X, y, o);
  const b = trenSkog(X, y, o);
  assert.deepEqual(a, b, "skogen er ikke deterministisk");

  const feil = (m: typeof a) =>
    y.reduce((s, v, i) => s + (v - anslåSkog(m, X[i]!, o.rate)) ** 2, 0) / N;
  const basis = y.reduce((s, v) => s + (v - a.basis) ** 2, 0) / N;
  assert.ok(feil(a) < basis * 0.5, `skogen reduserer ikke feilen: ${feil(a)} mot ${basis}`);
});

test("bredde-argumentet begrenser hvilke kolonner som vurderes", () => {
  const N = 300;
  const X: Float32Array[] = [];
  const y: number[] = [];
  for (let i = 0; i < N; i++) {
    const v = new Float32Array(4);
    v[0] = 0.5;
    v[1] = 0.5;
    // Bare kolonne 3 baerer signalet.
    v[3] = i % 2;
    X.push(v);
    y.push(v[3]! * 5);
  }
  const idx = y.map((_, i) => i);
  // Med bredde 3 er signalkolonnen usynlig -> treet maa bli et blad.
  assert.equal(byggTre(idx, X, y, 3, 20, 3).blad, true);
  // Med bredde 4 finner den den.
  const med = byggTre(idx, X, y, 3, 20, 4);
  assert.equal(med.blad, false);
  assert.equal(med.kol, 3);
  void forutsi;
});
