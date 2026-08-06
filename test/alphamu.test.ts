/**
 * A8: ALPHA-MU MÅ FAKTISK VÆRE ALPHA-MU.
 *
 * To ting kan gå subtilt galt her, og ingen av dem ville krasjet:
 *
 *   PARETO-BESKJÆRINGEN kan fjerne for mye. Fjerner den en vektor som IKKE er
 *   dominert, forkaster søket en strategi som kunne vært best — og resultatet
 *   ser bare ut som «alpha-mu hjalp ikke».
 *
 *   KONSISTENSKRAVET kan falle bort. Velger søket ulikt kort i ulike verdener,
 *   er det ikke lenger alpha-mu; det er PIMC med ekstra steg, og det er
 *   nøyaktig strategifusjonen vi bygde den for å unngå.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { paretoFront, alphaMu } from "../src/moe2/alphamu.ts";
import { lagIndre, ADAMS } from "../src/moe2/agentspek.ts";
import { trekkVerdener } from "../src/moe2/sdkort.ts";
import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeKort } from "../src/motor.ts";
import { lagRng } from "../src/kort.ts";

test("dominerte vektorer fjernes, uavgjorte beholdes", () => {
  const g = [
    { vektor: [1, 1] }, // dominert av [2,2]
    { vektor: [2, 2] },
    { vektor: [3, 0] }, // uavgjort mot [2,2]
    { vektor: [0, 3] }, // uavgjort mot begge
  ];
  const f = paretoFront(g, 99);
  const sett = f.map((x) => x.vektor.join(","));
  assert.ok(!sett.includes("1,1"), "dominert vektor overlevde");
  assert.ok(sett.includes("2,2") && sett.includes("3,0") && sett.includes("0,3"));
  assert.equal(f.length, 3);
});

test("LIKE vektorer regnes ikke som dominerte (streng dominans)", () => {
  const f = paretoFront([{ vektor: [1, 1] }, { vektor: [1, 1] }], 99);
  assert.equal(f.length, 2, "identiske vektorer dominerer ikke hverandre");
});

test("beskjaeringen respekterer taket og beholder de beste", () => {
  const g = [{ vektor: [9, 0] }, { vektor: [0, 9] }, { vektor: [5, 4] }];
  const f = paretoFront(g, 2);
  assert.equal(f.length, 2);
  // Snittene er 4,5 / 4,5 / 4,5 - alle like, saa taket alene skal virke.
  const alle = paretoFront(g, 3);
  assert.equal(alle.length, 3, "uten tak skal ingen fjernes");
});

test("M=1 gir én verdi per verden, og de stemmer med en direkte utspilling", () => {
  const ag = [0, 1, 2, 3].map(() => lagIndre(ADAMS));
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 4_400_000);
  let vakt = 0;
  while (s.fase !== "FERDIG" && vakt++ < 400) {
    if (s.fase === "SPILL" && s.iTur !== null && lovligeKort(s, s.iTur).length > 1) break;
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, ag[iTur]!.velgHandling(s)).state;
  }
  assert.equal(s.fase, "SPILL");
  const sete = s.iTur!;
  const rng = lagRng(12345);
  const verdener = trekkVerdener(s, sete, 4, rng, undefined, undefined, 3);
  assert.ok(verdener.length > 0, "ingen verdener lot seg trekke");

  const motpart = lagIndre(ADAMS);
  const grener = alphaMu(s, sete, verdener, {
    M: 1,
    mål: (t, p) => (t.sisteRunde?.delta?.[p] ?? 0),
    motpart,
  });
  assert.equal(grener.length, lovligeKort(s, sete).length, "én gren per lovlig kort");
  for (const g of grener) {
    assert.equal(g.vektor.length, verdener.length, "én verdi per verden");
    for (const v of g.vektor) assert.ok(Number.isFinite(v), "ikke-endelig utfall");
  }
});

/**
 * KONSISTENSKRAVET. Med M=2 velger søket ett kort for hele
 * informasjonsmengden, ikke ett per verden. Testen sjekker at fronten faktisk
 * bæres gjennom: en vektor per verden, ikke et sammenfoldet snitt.
 */
test("M=2 baerer fortsatt en vektor per verden", () => {
  const ag = [0, 1, 2, 3].map(() => lagIndre(ADAMS));
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 5_500_000);
  let vakt = 0;
  // Gå et stykke ut i runden, så treet er lite nok til å være raskt.
  while (s.fase !== "FERDIG" && vakt++ < 400) {
    if (s.fase === "SPILL" && s.stikkSpilt >= 8 && s.iTur !== null && lovligeKort(s, s.iTur).length > 1) break;
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, ag[iTur]!.velgHandling(s)).state;
  }
  if (s.fase !== "SPILL") return; // fant ingen slik stilling i denne giva
  const sete = s.iTur!;
  const verdener = trekkVerdener(s, sete, 3, lagRng(999), undefined, undefined, 3);
  if (verdener.length === 0) return;
  const grener = alphaMu(s, sete, verdener, {
    M: 2,
    mål: (t, p) => (t.sisteRunde?.delta?.[p] ?? 0),
    motpart: lagIndre(ADAMS),
  });
  for (const g of grener) assert.equal(g.vektor.length, verdener.length);
});
