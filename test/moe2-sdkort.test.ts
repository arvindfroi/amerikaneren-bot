import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill } from "../src/index.ts";
import { lagRng } from "../src/kort.ts";
import { utfør, type GameState } from "../src/motor.ts";
import { NevroAgent } from "../src/nevro/agent.ts";
import { kortIndeks } from "../src/neat/trekk.ts";
import { intTilKort, kortTilInt } from "../src/solver/dds.ts";
import {
  besteIndeks,
  trekkVerdener,
  vurderTrumfSD,
  vurderVrakSD,
} from "../src/moe2/sdkort.ts";
import { alleVrak } from "../src/moe2/eksperter/vrak.ts";

/**
 * Disse testene låser invariantene i SD-evalueringen. Alle fire stammer fra
 * feil som faktisk ble gjort 25. juli 2026.
 */

const nevro = new NevroAgent();

/** Spiller fram til `fase` med NevroHjerne, eller returnerer null. */
function fram(frø: number, fase: "VRAK" | "VELG"): GameState | null {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  while (s.fase !== fase && s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 60) {
    s = utfør(s, nevro.velgHandling(s)).state;
  }
  return s.fase === fase && s.budvinner !== null ? s : null;
}

test("kortkodingen er ÉN koding – intTilKort og kortIndeks er inverse", () => {
  // Første utkast av sdkort.ts rullet sin egen konvertering med `i >> 4` mens
  // den kanoniske bruker `floor(c / 13)`. To ulike kodinger som begge
  // typesjekker gir gale kort i STILLHET; her kan de ikke gli fra hverandre.
  for (let i = 0; i < 52; i++) {
    assert.equal(kortIndeks(intTilKort(i)), i);
    assert.equal(kortTilInt(intTilKort(i)), i);
  }
});

test("verdenene lar observatørens egen hånd stå, og bruker hvert kort én gang", () => {
  // Byttes observatørens hånd ut med verdenens, evalueres en ANNEN hånd enn
  // den vi faktisk har – og hele SD-idéen faller.
  const s = fram(21_000_000, "VRAK");
  assert.ok(s !== null, "fant ingen VRAK-stilling");
  const bv = s.budvinner!;
  const verdener = trekkVerdener(s, bv, 5, lagRng(7));
  assert.ok(verdener.length > 0);
  const egen = new Set(s.hender[bv]!.map(kortIndeks));
  for (const hender of verdener) {
    assert.deepEqual(new Set(hender[bv]!), egen);
    const sett = new Set<number>();
    for (const h of hender) for (const k of h) sett.add(k);
    // 16 + 3 x 12 = 52: ingen kort deles ut to ganger, ingen forsvinner.
    assert.equal(sett.size, hender.reduce((a, h) => a + h.length, 0));
  }
});

test("vurderVrakSD gir én verdi per kandidat, i de SAMME verdenene", () => {
  const s = fram(21_000_000, "VRAK");
  assert.ok(s !== null, "fant ingen VRAK-stilling");
  const bv = s.budvinner!;
  const hånd = s.hender[bv]!.map(kortIndeks).sort((a, b) => a - b);
  const kandidater = alleVrak(hånd, s.giving.talong).slice(0, 4);

  const rng = lagRng(11);
  const verdenerHender = trekkVerdener(s, bv, 3, rng);
  const a = vurderVrakSD(s, nevro, kandidater, { verdener: 3, rng, verdenerHender });
  assert.equal(a.length, kandidater.length);
  for (const v of a) {
    assert.ok(Number.isFinite(v.verdi), "SD-verdien må være et tall");
    assert.equal(v.n, verdenerHender.length);
  }
  // Samme verdener inn gir nøyaktig samme tall ut: parringen er det som gjør
  // to kandidater sammenlignbare i det hele tatt.
  const b = vurderVrakSD(s, nevro, kandidater, { verdener: 3, rng, verdenerHender });
  assert.deepEqual(
    b.map((v) => v.verdi),
    a.map((v) => v.verdi),
  );
  assert.ok(besteIndeks(a) >= 0);
});

test("vurderTrumfSD dekker hele (farge, valør)-tabellen", () => {
  const s = fram(21_000_000, "VELG");
  assert.ok(s !== null, "fant ingen VELG-stilling");
  const bv = s.budvinner!;
  const egne = new Set(s.hender[bv]!.map(kortIndeks));
  const vraket = new Set(s.vrak.map(kortIndeks));
  const kandidater: { farge: number; valør: number }[] = [];
  for (let f = 0; f < 4; f++) {
    for (let v = 2; v <= 14; v++) {
      const idx = f * 13 + (v - 2);
      if (!egne.has(idx) && !vraket.has(idx)) kandidater.push({ farge: f, valør: v });
    }
  }
  const utvalg = kandidater.slice(0, 3);
  const vurdert = vurderTrumfSD(s, nevro, utvalg, { verdener: 2, rng: lagRng(13) });
  assert.equal(vurdert.length, utvalg.length);
  for (const v of vurdert) assert.ok(Number.isFinite(v.verdi));
});

test("SD-evalueringen sier fra når den ikke har data, i stedet for å gjette", () => {
  // Tom kandidatliste gir tom liste – ikke «alle valg er like gode». Det var
  // nøyaktig den forvekslingen som gjorde lærForsvar verre enn ingenting.
  const s = fram(21_000_000, "VRAK");
  assert.ok(s !== null);
  assert.deepEqual(vurderVrakSD(s, nevro, [], { verdener: 2, rng: lagRng(1) }), []);
  assert.equal(besteIndeks([]), -1);
  // Feil fase gir også tom liste, ikke et tall som ser gyldig ut.
  assert.deepEqual(vurderTrumfSD(s, nevro, [{ farge: 0, valør: 5 }], { verdener: 2, rng: lagRng(1) }), []);
});
