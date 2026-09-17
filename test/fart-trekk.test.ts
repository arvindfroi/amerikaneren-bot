/**
 * GRUNNTREKKENE UTEN MELLOMVEKTORER ER BIT-IDENTISKE (17. sep, `src/e1/trekk-rask.ts`).
 * Alle fire seter i hver SPILL-stilling fra ekte partier mellom nett, med og uten bok.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { e1KortBokTrekk, e1KortBokTrekkRef } from "../src/e1/kortbok.ts";
import { HUKOMMELSE_LENGDE_4 } from "../src/mlb/hukommelse.ts";
import { lagRng } from "../src/kort.ts";

test("e1KortBokTrekk er bit-identisk med referansen i alle SPILL-stillinger", () => {
  const nett = new NevroAgent();
  const rng = lagRng(4242);
  const bok = new Float64Array(HUKOMMELSE_LENGDE_4).map(() => rng() * 2 - 1);
  let sjekket = 0;
  let avvik = 0;
  for (let parti = 0; parti < 6; parti++) {
    let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, 900 + parti);
    let vakt = 0;
    while (s.fase !== "FERDIG" && vakt++ < 20_000) {
      if (s.fase === "RUNDE_SLUTT") {
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      if (s.fase === "SPILL") {
        for (let sete = 0; sete < 4; sete++) {
          for (const b of [null, bok]) {
            const a = e1KortBokTrekk(s, sete, b);
            const r = e1KortBokTrekkRef(s, sete, b);
            sjekket++;
            if (!a.every((x, i) => Object.is(x, r[i]))) avvik++;
          }
        }
      }
      s = utfør(s, nett.velgHandling(s)).state;
    }
  }
  assert.ok(sjekket > 2000, `bare ${sjekket} vektorer sjekket`);
  assert.equal(avvik, 0, `${avvik} av ${sjekket} vektorer avviker`);
});
