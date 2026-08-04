/**
 * BUDRUNDEN I BUDTREKKENE (v2) — og at v1 er helt urørt.
 *
 * Revisjonen 5. august fant at budmodellen var blind for auksjonen: alle 128
 * trekk handlet om egen hånd, og hva de andre hadde bydd kom bare inn gjennom
 * `vant[N]`, en fast populasjonstabell.
 *
 * DEN FARLIGSTE FEILEN HER ER IKKE AT v2 BLIR GAL. Det er at v1 endrer seg.
 * `bud-gbt.json` står ute og spiller mot familien nå; endres de 128 første
 * trekkene med én verdi, spiller den plutselig annerledes uten at noe feiler
 * og uten at noen har målt det. Derfor kommer den testen først.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { budTrekk, BUD_DIM, BUD_DIM_V2 } from "../src/moe2/budtrekk.ts";

/** Spiller fram til budrunden og kaller `sjekk` i hver budstilling. */
function overBudrunder(antall: number, sjekk: (s: GameState, sete: number) => void): number {
  let n = 0;
  for (let i = 0; i < antall; i++) {
    const ag = [0, 1, 2, 3].map(() => new NevroAgent());
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 9_400_000 + i * 7717);
    let g = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
      if (s.fase === "BUDRUNDE" && s.iTur !== null) {
        sjekk(s, s.iTur);
        n++;
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      s = utfør(s, ag[iTur]!.velgHandling(s)).state;
    }
  }
  return n;
}

test("v2 endrer IKKE en eneste av de 128 første verdiene", () => {
  const n = overBudrunder(40, (s, sete) => {
    const v1 = budTrekk(s, sete);
    const v2 = budTrekk(s, sete, BUD_DIM_V2);
    assert.equal(v1.length, BUD_DIM);
    assert.equal(v2.length, BUD_DIM_V2);
    for (let i = 0; i < BUD_DIM; i++) {
      assert.equal(v2[i], v1[i], `indeks ${i} endret seg mellom v1 og v2`);
    }
  });
  assert.ok(n > 100, `for få budstillinger (${n})`);
});

test("alle v2-verdiene ligger i [0, 1] og er endelige", () => {
  overBudrunder(30, (s, sete) => {
    const v = budTrekk(s, sete, BUD_DIM_V2);
    for (let i = BUD_DIM; i < BUD_DIM_V2; i++) {
      const x = v[i]!;
      assert.ok(Number.isFinite(x), `indeks ${i} er ikke endelig`);
      assert.ok(x >= 0 && x <= 1, `indeks ${i} utenfor [0,1]: ${x}`);
    }
  });
});

/**
 * DET SOM FAKTISK SKAL VÆRE NYTT. Blir ingen av de tolv verdiene noen gang
 * ulik null, bærer blokken ingenting – og da ville modellen lært å ignorere
 * den, akkurat som minne- og telleblokken.
 */
test("budrunde-blokken bærer faktisk informasjon", () => {
  let medBud = 0;
  let medPass = 0;
  let iAlt = 0;
  overBudrunder(40, (s, sete) => {
    const v = budTrekk(s, sete, BUD_DIM_V2);
    iAlt++;
    // 128–130 er de tre andres bud, 131–133 om de har passet.
    if (v[BUD_DIM]! > 0 || v[BUD_DIM + 1]! > 0 || v[BUD_DIM + 2]! > 0) medBud++;
    if (v[BUD_DIM + 3]! > 0 || v[BUD_DIM + 4]! > 0 || v[BUD_DIM + 5]! > 0) medPass++;
  });
  assert.ok(medBud > iAlt * 0.2, `for få stillinger der noen hadde bydd (${medBud}/${iAlt})`);
  assert.ok(medPass > iAlt * 0.2, `for få stillinger der noen hadde passet (${medPass}/${iAlt})`);
});

test("høyeste bud stemmer med det motoren mener er høyeste", () => {
  overBudrunder(30, (s, sete) => {
    const v = budTrekk(s, sete, BUD_DIM_V2);
    let ventet = 0;
    for (let r = 1; r <= 3; r++) {
      const b = s.budrunde.sisteBud[(sete + r) % 4];
      const kodet = b === "AMERIKANER" || b === "SOLO" ? 13 : typeof b === "number" ? b : 0;
      if (kodet > ventet) ventet = kodet;
    }
    assert.ok(
      Math.abs(v[BUD_DIM + 6]! - ventet / 13) < 1e-6,
      `høyeste bud: ${v[BUD_DIM + 6]! * 13} mot ventet ${ventet}`,
    );
  });
});

/**
 * RELATIVT, IKKE SORTERT. Vrakrangereren sorterer budene høyest først og
 * mister hvem som bød hva. Her skal setet være bevart: at spilleren rett etter
 * meg bød 10 er noe annet enn at den rett før meg gjorde det, fordi de har
 * handlet med ulik informasjon.
 */
test("budene står på riktig RELATIVT sete, ikke sortert", () => {
  overBudrunder(30, (s, sete) => {
    const v = budTrekk(s, sete, BUD_DIM_V2);
    for (let r = 1; r <= 3; r++) {
      const b = s.budrunde.sisteBud[(sete + r) % 4];
      const kodet = b === "AMERIKANER" || b === "SOLO" ? 13 : typeof b === "number" ? b : 0;
      assert.ok(
        Math.abs(v[BUD_DIM + (r - 1)]! - kodet / 13) < 1e-6,
        `relativt sete ${r}: ${v[BUD_DIM + (r - 1)]! * 13} mot ventet ${kodet}`,
      );
    }
  });
});
