/**
 * TELLEBLOKKEN (v3, indeks 340–355): hvem har spilt hvilke farger.
 *
 * Blokken finnes fordi appens koding legger alle spilte kort i ÉN blokk uten
 * spillertilordning, og renonsflaggene bare fanger endepunktet «helt tom».
 * Nettet kunne derfor ikke skille «spillefører spilte tre spar, makkeren null»
 * fra det motsatte – slutningen en menneskelig forsvarer gjør hele tiden.
 *
 * Tre påstander må holde, og alle tre er av typen som IKKE krasjer om de
 * brytes – de gir bare et nett som spiller litt dårligere, stille:
 *
 *   1. BAKOVERKOMPATIBILITET. Indeks 0–339 må være bit for bit det samme i v2
 *      og v3. Ellers leser ftf1.bin en annen verden enn den ble trent på.
 *   2. TELLINGEN MÅ STEMME med den faktiske historikken, og den må være
 *      RELATIV til setet – rad 0 er alltid en selv.
 *   3. LOVLIGHET. Blokken skal bare telle åpent spilte kort. Summen over alle
 *      seter og farger må være nøyaktig antall kort som ligger på bordet eller
 *      i historikken – hverken mer (lekkasje) eller mindre (tapt informasjon).
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { fargeIndeks } from "../src/nevro/trekk.ts";
import { e1SpillTrekk, E1_SPILL_DIM_V2, E1_SPILL_DIM_V3 } from "../src/e1/trekk.ts";

const TELL = E1_SPILL_DIM_V2;

/** Spiller fram til `stikk` stikk er unnagjort, så det finnes noe å telle. */
function stillingEtter(frø: number, stikk: number): GameState | null {
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

test("v3 lar de 340 første trekkene staa uroert", () => {
  let sjekket = 0;
  for (let frø = 4_400_000; frø < 4_400_030; frø++) {
    const s = stillingEtter(frø, 4);
    if (s === null) continue;
    for (let sete = 0; sete < 4; sete++) {
      const v2 = e1SpillTrekk(s, sete, E1_SPILL_DIM_V2);
      const v3 = e1SpillTrekk(s, sete, E1_SPILL_DIM_V3);
      assert.equal(v3.length, E1_SPILL_DIM_V3);
      for (let i = 0; i < E1_SPILL_DIM_V2; i++) {
        assert.equal(v3[i], v2[i], `indeks ${i} endret seg mellom v2 og v3 (frø ${frø}, sete ${sete})`);
      }
      sjekket++;
    }
  }
  assert.ok(sjekket >= 40, `for faa stillinger sjekket (${sjekket})`);
});

test("tellingen stemmer med historikken, og er RELATIV til setet", () => {
  let sjekket = 0;
  for (let frø = 4_400_000; frø < 4_400_030; frø++) {
    const s = stillingEtter(frø, 5);
    if (s === null) continue;
    for (let sete = 0; sete < 4; sete++) {
      const v = e1SpillTrekk(s, sete, E1_SPILL_DIM_V3);
      // Fasit regnet uavhengig av kodingen.
      const fasit = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
      for (const stikk of s.historikk) {
        for (const kp of stikk.kort) fasit[kp.spiller]![fargeIndeks(kp.kort.farge)]!++;
      }
      for (const kp of s.bord) fasit[kp.spiller]![fargeIndeks(kp.kort.farge)]!++;

      for (let p = 0; p < 4; p++) {
        const r = (p - sete + 4) % 4;
        for (let f = 0; f < 4; f++) {
          const kodet = v[TELL + r * 4 + f]! * 13;
          assert.ok(
            Math.abs(kodet - fasit[p]![f]!) < 1e-6,
            `sete ${sete}, spiller ${p} (rad ${r}), farge ${f}: kodet ${kodet}, fasit ${fasit[p]![f]}`,
          );
        }
      }
      // Rad 0 ER meg selv – den paastanden er hele grunnen til at indekseringen
      // er relativ, og den er lett aa brekke ved en fortegnsfeil i (p - sete).
      for (let f = 0; f < 4; f++) {
        assert.ok(
          Math.abs(v[TELL + f]! * 13 - fasit[sete]![f]!) < 1e-6,
          `rad 0 er ikke setet selv (sete ${sete}, farge ${f})`,
        );
      }
      sjekket++;
    }
  }
  assert.ok(sjekket >= 40, `for faa stillinger sjekket (${sjekket})`);
});

test("blokken teller BARE aapent spilte kort - ingen lekkasje, ingen tap", () => {
  let sjekket = 0;
  for (let frø = 4_400_000; frø < 4_400_020; frø++) {
    for (const stikk of [1, 3, 6]) {
      const s = stillingEtter(frø, stikk);
      if (s === null) continue;
      const aapne = s.historikk.reduce((a, x) => a + x.kort.length, 0) + s.bord.length;
      for (let sete = 0; sete < 4; sete++) {
        const v = e1SpillTrekk(s, sete, E1_SPILL_DIM_V3);
        let sum = 0;
        for (let i = 0; i < 16; i++) sum += v[TELL + i]!;
        assert.ok(
          Math.abs(sum * 13 - aapne) < 1e-6,
          `summen er ${sum * 13}, men ${aapne} kort er spilt aapent (froe ${frø}, stikk ${stikk})`,
        );
        for (let i = 0; i < 16; i++) {
          assert.ok(Number.isFinite(v[TELL + i]!), `indeks ${TELL + i} er ikke endelig`);
          assert.ok(v[TELL + i]! >= 0 && v[TELL + i]! <= 1, `indeks ${TELL + i} utenfor [0,1]`);
        }
        sjekket++;
      }
    }
  }
  assert.ok(sjekket >= 40, `for faa stillinger sjekket (${sjekket})`);
});
