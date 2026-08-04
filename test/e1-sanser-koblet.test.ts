/**
 * SANSENE MÅ VÆRE KOBLET — ikke bare bygd.
 *
 * Revisjonen 5. august fant at saanseblokken var 95 % død: 84 av 88 trekk sto
 * konstant null over 5 760 ekte stillinger. Blokken var korrekt, testet og
 * registrert i alle fem breddestedene. Den var bare aldri KOBLET TIL: `tro` er
 * et valgfritt argument med standard `null`, `fyllSanser` returnerer da etter
 * de fire posisjonstrekkene, og ingen kaller sendte inn troen.
 *
 * Denne testen fastholder BEGGE halvdelene av det faktumet, så ingen av dem
 * kan gå tapt igjen i stillhet.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { e1SpillTrekk, e1SpillTrekkMedTro, E1_SPILL_DIM_V9 } from "../src/e1/trekk.ts";
import { SANS_FRA, SANS_ANTALL } from "../src/e1/sanser.ts";
import { TRO_KLASSER, TRO_KORT } from "../src/moe2/trosnett.ts";

/** En tro som ikke er et nett: jevn fordeling. Nok til å fylle blokken. */
const jevnTro = {
  fordeling: () => Array.from({ length: TRO_KORT }, () => Array(TRO_KLASSER).fill(1 / TRO_KLASSER)),
};

function stillinger(antall: number): GameState[] {
  const ut: GameState[] = [];
  for (let d = 0; d < antall; d++) {
    const ag = [0, 1, 2, 3].map(() => new NevroAgent());
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 6_600_000 + d * 7717);
    let g = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
      if (s.fase === "SPILL" && s.iTur !== null) ut.push(s);
      const iT = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iT === null || iT === undefined) break;
      s = utfør(s, ag[iT]!.velgHandling(s)).state;
    }
  }
  return ut;
}

function levende(lag: (s: GameState) => Float32Array, ss: GameState[]): number {
  const sum = new Float64Array(SANS_ANTALL);
  const sum2 = new Float64Array(SANS_ANTALL);
  for (const s of ss) {
    const v = lag(s);
    for (let i = 0; i < SANS_ANTALL; i++) {
      const x = v[SANS_FRA + i]!;
      sum[i]! += x;
      sum2[i]! += x * x;
    }
  }
  let n = 0;
  for (let i = 0; i < SANS_ANTALL; i++) {
    const m = sum[i]! / ss.length;
    if (sum2[i]! / ss.length - m * m > 1e-12) n++;
  }
  return n;
}

test("UTEN tro er sanseblokken nesten helt død – dette er feilen som ble funnet", () => {
  const ss = stillinger(12);
  assert.ok(ss.length > 100, `for få stillinger (${ss.length})`);
  const n = levende((s) => e1SpillTrekk(s, s.iTur ?? 0, E1_SPILL_DIM_V9), ss);
  // Bare de fire posisjonstrekkene kan leve uten troen.
  assert.ok(n <= 4, `${n} trekk lever uten tro – da er tidligreturen i fyllSanser borte`);
});

test("MED tro fylles blokken – koblingen virker", () => {
  const ss = stillinger(12);
  const n = levende((s) => e1SpillTrekkMedTro(s, s.iTur ?? 0, E1_SPILL_DIM_V9, jevnTro), ss);
  assert.ok(n > 40, `bare ${n} av ${SANS_ANTALL} trekk lever MED tro – koblingen er brutt`);
});

test("koblingen rører ikke ett eneste trekk under sanseblokken", () => {
  for (const s of stillinger(6).slice(0, 40)) {
    const sete = s.iTur ?? 0;
    const uten = e1SpillTrekk(s, sete, E1_SPILL_DIM_V9);
    const med = e1SpillTrekkMedTro(s, sete, E1_SPILL_DIM_V9, jevnTro);
    for (let i = 0; i < SANS_FRA; i++) {
      assert.equal(med[i], uten[i], `indeks ${i} endret seg da troen ble koblet på`);
    }
  }
});
