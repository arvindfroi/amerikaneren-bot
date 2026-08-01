/**
 * MINNEBLOKKEN i `e1SpillTrekk` (v2, indeks 273–339).
 *
 * Hullet den lukker ble MÅLT, ikke gjettet: `examples/hukommelseshull.ts` fant
 * at i 18,9 % av budvinnerens kortvalg er «høyeste kort ute» i minst én farge
 * et kort budvinneren vraket selv. Fasiten vi trener mot – SD-orakelet – er
 * vrak-bevisst, så etiketten avhang av informasjon inngangen ikke hadde.
 *
 * De to påstandene som virkelig betyr noe her:
 *
 *   1. BAKOVERKOMPATIBILITET. Indeks 0–272 må være BIT FOR BIT det samme i v1
 *      og v2. Ellers leser sd-r2.bin en annen verden enn den ble trent på, og
 *      det ville ikke feilet – det ville bare spilt dårligere, stille.
 *
 *   2. LOVLIGHET. Bare budvinneren får se vraket. Lekker de fire kortene til
 *      et forsvarersete, har vi bygget en juksende bot, og en juksende bot
 *      måler ingenting om menneskene.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { e1SpillTrekk, E1_SPILL_DIM, E1_SPILL_DIM_V2 } from "../src/e1/trekk.ts";

/** Spiller fram til første kortvalg i en runde der noen har vraket. */
function stillingMedVrak(frø: number): GameState | null {
  const nevro = new NevroAgent();
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let g = 0;
  while (s.fase !== "SPILL" && s.fase !== "FERDIG" && g++ < 200) {
    s = utfør(s, nevro.velgHandling(s)).state;
  }
  return s.fase === "SPILL" && s.vrak.length > 0 ? s : null;
}

test("v2 lar de 273 første trekkene stå urørt", () => {
  let sjekket = 0;
  for (let frø = 7_700_000; frø < 7_700_040; frø++) {
    const s = stillingMedVrak(frø);
    if (s === null) continue;
    for (let sete = 0; sete < 4; sete++) {
      const v1 = e1SpillTrekk(s, sete);
      const v2 = e1SpillTrekk(s, sete, E1_SPILL_DIM_V2);
      assert.equal(v1.length, E1_SPILL_DIM);
      assert.equal(v2.length, E1_SPILL_DIM_V2);
      for (let i = 0; i < E1_SPILL_DIM; i++) {
        assert.equal(v2[i], v1[i], `indeks ${i} endret seg mellom v1 og v2 (frø ${frø}, sete ${sete})`);
      }
      sjekket++;
    }
  }
  assert.ok(sjekket >= 20, `for få stillinger sjekket (${sjekket}) til at påstanden betyr noe`);
});

test("bare budvinneren ser vraket - blokken lekker ikke til de andre", () => {
  let budvinnere = 0;
  let andre = 0;
  for (let frø = 7_700_000; frø < 7_700_040; frø++) {
    const s = stillingMedVrak(frø);
    if (s === null) continue;
    for (let sete = 0; sete < 4; sete++) {
      const v = e1SpillTrekk(s, sete, E1_SPILL_DIM_V2);
      const vrakBlokk = v.slice(E1_SPILL_DIM, E1_SPILL_DIM + 56); // 4 farger + 52 kort
      const sum = vrakBlokk.reduce((a, x) => a + x, 0);
      if (sete === s.budvinner) {
        budvinnere++;
        // Fire kort: fargeandelene summerer til 1, én-av-52 til 4.
        assert.ok(Math.abs(sum - 5) < 1e-5, `budvinnerens vrakblokk summerte til ${sum}, forventet 5`);
        assert.equal(v[E1_SPILL_DIM + 65], 1, "budvinneren skal vite at han kjenner de døde");
        for (const k of s.vrak) {
          assert.equal(v[E1_SPILL_DIM + 4 + kortIndeks(k)], 1, "vraket kort mangler i én-av-52");
        }
      } else {
        andre++;
        assert.equal(sum, 0, "et sete som ikke er budvinner har fått se vraket - det er juks");
        assert.equal(v[E1_SPILL_DIM + 65], 0);
        for (const k of s.vrak) {
          assert.equal(v[E1_SPILL_DIM + 4 + kortIndeks(k)], 0, "vraket kort lekket til feil sete");
        }
      }
    }
  }
  assert.ok(budvinnere >= 5 && andre >= 15, `for få seter sjekket (${budvinnere}/${andre})`);
});

test("den korrigerte «hoyeste ute» trekker fra det budvinneren vraket selv", () => {
  // Selve poenget med blokken: finn en stilling der v1 tror et kort lever
  // mens budvinneren la det ned selv, og vis at v2 ikke tror det.
  let funnet = 0;
  for (let frø = 7_700_000; frø < 7_700_200 && funnet === 0; frø++) {
    const s = stillingMedVrak(frø);
    if (s === null || s.budvinner === null) continue;
    const v = e1SpillTrekk(s, s.budvinner, E1_SPILL_DIM_V2);
    for (let f = 0; f < 4; f++) {
      const gammel = v[E1_SPILL_DIM - 35 + 24 + f]!; // indeks 262+f: hoyeste ute, ukorrigert
      const ny = v[E1_SPILL_DIM + 56 + f]!; //            korrigert for eget vrak
      if (ny < gammel) {
        funnet++;
        // Korrigeringen kan bare senke: et dodt kort fjernes, det legges aldri til.
        assert.ok(ny >= 0 && ny <= 1);
      }
      assert.ok(ny <= gammel + 1e-6, "korrigeringen loftet hoyeste ute - da er fortegnet snudd");
    }
  }
  assert.ok(funnet > 0, "fant ingen stilling der eget vrak senket «hoyeste ute» - blokken gjor ingenting");
});
