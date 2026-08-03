/**
 * AUKSJONSBLOKKEN (v4, indeks 356–363): hvor høyt hvert sete bød.
 *
 * Blokken finnes fordi kodingen tok med hvem som VANT budrunden, men ingenting
 * om hva de andre bød underveis. `examples/budhull.ts` målte at signalet er
 * sterkt (13,3 SE på honnører, stratifisert på vinnerbudet).
 *
 * Samme tre påstander som telleblokken, og de svikter på samme stille måte –
 * ingen krasj, bare et nett som spiller litt dårligere:
 *
 *   1. BAKOVERKOMPATIBILITET. 0–355 må være bit for bit likt i v3 og v4.
 *   2. VERDIENE MÅ STEMME med `budrunde.sisteBud`, og være RELATIVE til setet.
 *   3. LOVLIGHET. Blokken skal bare si det auksjonen sa OFFENTLIG. Særlig:
 *      «bød aldri» må være skillbart fra «bød lavt», ellers koder vi to helt
 *      ulike situasjoner til samme tall.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { e1SpillTrekk, E1_SPILL_DIM_V3, E1_SPILL_DIM_V4 } from "../src/e1/trekk.ts";

const AUKSJON = E1_SPILL_DIM_V3;

/** Spiller fram til spillfasen, der auksjonen er ferdig og skal være lesbar. */
function stillingISpill(frø: number, stikk: number): GameState | null {
  const nevro = new NevroAgent();
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    if (s.fase === "SPILL" && s.stikkSpilt >= stikk) return s;
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    if (iTur === null || iTur === undefined) return null;
    s = utfør(s, nevro.velgHandling(s)).state;
  }
  return null;
}

test("v4 lar de 356 foerste trekkene staa uroert", () => {
  let sjekket = 0;
  for (let frø = 5_500_000; frø < 5_500_030; frø++) {
    const s = stillingISpill(frø, 3);
    if (s === null) continue;
    for (let sete = 0; sete < 4; sete++) {
      const v3 = e1SpillTrekk(s, sete, E1_SPILL_DIM_V3);
      const v4 = e1SpillTrekk(s, sete, E1_SPILL_DIM_V4);
      assert.equal(v4.length, E1_SPILL_DIM_V4);
      for (let i = 0; i < E1_SPILL_DIM_V3; i++) {
        assert.equal(v4[i], v3[i], `indeks ${i} endret seg mellom v3 og v4 (frø ${frø}, sete ${sete})`);
      }
      sjekket++;
    }
  }
  assert.ok(sjekket >= 40, `for faa stillinger sjekket (${sjekket})`);
});

test("budene stemmer med sisteBud, og er RELATIVE til setet", () => {
  let sjekket = 0;
  for (let frø = 5_500_000; frø < 5_500_030; frø++) {
    const s = stillingISpill(frø, 4);
    if (s === null) continue;
    for (let sete = 0; sete < 4; sete++) {
      const v = e1SpillTrekk(s, sete, E1_SPILL_DIM_V4);
      for (let p = 0; p < 4; p++) {
        const r = (p - sete + 4) % 4;
        const b = s.budrunde.sisteBud[p];
        const verdi = v[AUKSJON + r * 2]!;
        const flagg = v[AUKSJON + r * 2 + 1]!;
        if (typeof b === "number") {
          assert.ok(
            Math.abs(verdi * 13 - b) < 1e-6,
            `sete ${sete}, spiller ${p} (rad ${r}): kodet ${verdi * 13}, sisteBud ${b}`,
          );
          assert.equal(flagg, 0, `flagget skal vaere 0 naar setet boed (sete ${sete}, spiller ${p})`);
        } else {
          assert.equal(verdi, 0, `verdien skal vaere 0 naar setet aldri boed`);
          assert.equal(flagg, 1, `flagget skal vaere 1 naar setet aldri boed`);
        }
      }
      // Rad 0 ER meg selv – fortegnsfeil i (p - sete) er den lette feilen her,
      // og den ville gitt et nett som leser naboens bud som sitt eget.
      const egetB = s.budrunde.sisteBud[sete];
      if (typeof egetB === "number") {
        assert.ok(
          Math.abs(v[AUKSJON]! * 13 - egetB) < 1e-6,
          `rad 0 er ikke setet selv (sete ${sete})`,
        );
      }
      sjekket++;
    }
  }
  assert.ok(sjekket >= 40, `for faa stillinger sjekket (${sjekket})`);
});

test("«boed aldri» er skillbart fra «boed lavt», og alt ligger i [0,1]", () => {
  let sjekket = 0;
  let sågBød = 0;
  let sågPasset = 0;
  for (let frø = 5_500_000; frø < 5_500_060; frø++) {
    const s = stillingISpill(frø, 2);
    if (s === null) continue;
    for (let sete = 0; sete < 4; sete++) {
      const v = e1SpillTrekk(s, sete, E1_SPILL_DIM_V4);
      for (let r = 0; r < 4; r++) {
        const verdi = v[AUKSJON + r * 2]!;
        const flagg = v[AUKSJON + r * 2 + 1]!;
        assert.ok(Number.isFinite(verdi) && verdi >= 0 && verdi <= 1, `verdi utenfor [0,1]: ${verdi}`);
        assert.ok(flagg === 0 || flagg === 1, `flagget er ikke binaert: ${flagg}`);
        // Kjernen i paastanden: de to tilstandene deler aldri koding.
        assert.ok(
          !(verdi === 0 && flagg === 0),
          `(0,0) er tvetydig – «boed aldri» og «boed 0» ble kodet likt (sete ${sete}, rad ${r})`,
        );
        if (flagg === 1) sågPasset++;
        else sågBød++;
      }
      sjekket++;
    }
  }
  assert.ok(sjekket >= 40, `for faa stillinger sjekket (${sjekket})`);
  // Begge tilstandene MAA forekomme i utvalget, ellers har testen over bare
  // bekreftet den ene grenen og vi ville ikke merket at den andre var brekt.
  assert.ok(sågBød > 0, "ingen seter boed i utvalget – testen er tom");
  assert.ok(sågPasset > 0, "ingen seter passet med en gang i utvalget – testen er tom");
});
