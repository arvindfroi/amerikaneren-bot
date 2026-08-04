/**
 * SANSEBLOKKEN (v9) må ikke påstå noe umulig.
 *
 * Blokken er utledet av trosnettet, og et nett kan gi hva som helst. Alt som
 * går videre til treningen må derfor kontrolleres mot spillets faktiske
 * skranker – ellers lærer nettet en usannhet, og det er verre enn å mangle
 * trekket.
 *
 * TESTENE BRUKER EN SYNTETISK «TRO» i stedet for det ekte nettet. Det er med
 * vilje: her sjekkes REGNESTYKKET, ikke modellen. En perfekt tro og en elendig
 * tro skal begge gi lovlige tall ut, og skiller vi ikke de to, vet vi ikke hva
 * en feil betyr når den kommer.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { fyllSanser, SANS_FRA, SANS_ANTALL } from "../src/e1/sanser.ts";
import { STIKK_FRA, STIKK_ANTALL } from "../src/e1/stikksjanse.ts";

const BREDDE = SANS_FRA + SANS_ANTALL;
const LENGDE = STIKK_FRA + STIKK_ANTALL;
const RENONS = LENGDE + 16;
const POSISJON = RENONS + 16;

/** En «tro» som fordeler alt likt på de tre skjulte setene. */
function uniformTro(): number[][] {
  return Array.from({ length: 52 }, () => [1 / 3, 1 / 3, 1 / 3, 0]);
}

/** Den EKTE fordelingen, som en perfekt tro ville gitt. */
function perfektTro(s: GameState, sete: number): number[][] {
  const ut: number[][] = Array.from({ length: 52 }, () => [0, 0, 0, 0]);
  for (let p = 0; p < 4; p++) {
    if (p === sete) continue;
    const r = (p - sete + 4) % 4;
    for (const k of s.hender[p] ?? []) ut[kortIndeks(k)]![r - 1] = 1;
  }
  for (const k of s.vrak) ut[kortIndeks(k)]![3] = 1;
  return ut;
}

/** Spiller en giv og kaller `sjekk` i hver spillestilling. */
function overGiver(antall: number, sjekk: (s: GameState, sete: number) => void): number {
  let n = 0;
  for (let i = 0; i < antall; i++) {
    const ag = [0, 1, 2, 3].map(() => new NevroAgent());
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 6_200_000 + i * 7717);
    let g = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      if (s.fase === "SPILL") {
        sjekk(s, iTur);
        n++;
      }
      s = utfør(s, ag[iTur]!.velgHandling(s)).state;
    }
  }
  return n;
}

test("alle verdier ligger i [0, 1] – også med en tro som er helt gal", () => {
  // En «tro» som paastaar at ALT ligger hos sete 1. Den er umulig, og det er
  // poenget: regnestykket skal fortsatt gi lovlige tall.
  const gal: number[][] = Array.from({ length: 52 }, () => [1, 0, 0, 0]);
  const n = overGiver(6, (s, sete) => {
    for (const tro of [uniformTro(), gal, perfektTro(s, sete)]) {
      const v = new Float32Array(BREDDE);
      fyllSanser(v, s, sete, tro);
      for (let i = SANS_FRA; i < BREDDE; i++) {
        const x = v[i]!;
        assert.ok(Number.isFinite(x), `indeks ${i} er ikke endelig: ${x}`);
        assert.ok(x >= 0 && x <= 1, `indeks ${i} utenfor [0,1]: ${x}`);
      }
    }
  });
  assert.ok(n > 50, `for få stillinger (${n})`);
});

test("stikksjansen er null for kort man IKKE har", () => {
  overGiver(6, (s, sete) => {
    const v = new Float32Array(BREDDE);
    fyllSanser(v, s, sete, uniformTro());
    const egne = new Set((s.hender[sete] ?? []).map(kortIndeks));
    for (let k = 0; k < 52; k++) {
      if (!egne.has(k)) assert.equal(v[STIKK_FRA + k], 0, `kort ${k} er ikke på hånden`);
    }
  });
});

/**
 * MED PERFEKT TRO SKAL RENONSANSLAGET VÆRE EKSAKT. Vet man nøyaktig hvem som
 * har hva, er «sannsynligheten for at han er tom» enten 0 eller 1 – og hvis
 * den ikke er det, er det regnestykket som er galt, ikke modellen.
 */
test("perfekt tro gir eksakt renonsanslag", () => {
  let sjekket = 0;
  overGiver(8, (s, sete) => {
    const v = new Float32Array(BREDDE);
    fyllSanser(v, s, sete, perfektTro(s, sete));
    for (let r = 1; r <= 3; r++) {
      const p = (sete + r) % 4;
      for (let f = 0; f < 4; f++) {
        const har = (s.hender[p] ?? []).some((k) => ["S", "H", "R", "K"].indexOf(k.farge) === f);
        const anslag = v[RENONS + (r - 1) * 4 + f]!;
        assert.ok(
          har ? anslag < 0.001 : anslag > 0.999,
          `sete ${p}, farge ${f}: har=${har}, anslag=${anslag.toFixed(4)}`,
        );
        sjekket++;
      }
    }
  });
  assert.ok(sjekket > 300, `for få sjekker (${sjekket})`);
});

test("perfekt tro gir forventet fargelengde lik den faktiske", () => {
  overGiver(6, (s, sete) => {
    const v = new Float32Array(BREDDE);
    fyllSanser(v, s, sete, perfektTro(s, sete));
    for (let r = 1; r <= 3; r++) {
      const p = (sete + r) % 4;
      for (let f = 0; f < 4; f++) {
        const faktisk = (s.hender[p] ?? []).filter(
          (k) => ["S", "H", "R", "K"].indexOf(k.farge) === f,
        ).length;
        const anslag = Math.round(v[LENGDE + (r - 1) * 4 + f]! * 13);
        assert.equal(anslag, faktisk, `sete ${p}, farge ${f}`);
      }
    }
  });
});

test("posisjon i stikket er nøyaktig ett flagg, og stemmer med bordet", () => {
  overGiver(6, (s, sete) => {
    const v = new Float32Array(BREDDE);
    fyllSanser(v, s, sete, null); // posisjonen krever ingen tro
    let n = 0;
    let satt = -1;
    for (let i = 0; i < 4; i++) {
      if (v[POSISJON + i] === 1) {
        n++;
        satt = i;
      }
    }
    assert.equal(n, 1, "nøyaktig ett posisjonsflagg");
    assert.equal(satt, Math.min(3, s.bord.length), "posisjonen stemmer ikke med bordet");
  });
});

test("uten tro står hele blokken på null – bortsett fra posisjonen", () => {
  overGiver(4, (s, sete) => {
    const v = new Float32Array(BREDDE);
    fyllSanser(v, s, sete, null);
    for (let i = SANS_FRA; i < POSISJON; i++) {
      assert.equal(v[i], 0, `indeks ${i} skulle vært null uten tro`);
    }
  });
});
