/**
 * PLANBLOKKEN (v5, indeks 364–375): kontraktsregnskapet.
 *
 * Blokken er en REN FUNKSJON av de 364 første trekkene, ikke av `state`. Det
 * er hele grunnen til at den kan legges på ferdige datarader – men det gjør
 * også at en feil her er usynlig: den ville gitt et konsistent, og konsistent
 * galt, regnestykke i både trening og spill.
 *
 * Derfor testes den mot SPILLTILSTANDEN, som er den uavhengige fasiten:
 *
 *   1. BAKOVERKOMPATIBILITET. 0–363 må stå bit for bit likt i v4 og v5.
 *   2. REGNESTYKKET MÅ STEMME med bud, lagstikk og stikk igjen slik motoren
 *      kjenner dem – ikke med det de avrundede trekkene tilfeldigvis gir.
 *   3. FLAGGENE MÅ VÆRE GJENSIDIG UTELUKKENDE der de skal være det. «Sikret»
 *      og «tapt» kan ikke være sanne samtidig; det ville vært en stille feil
 *      som bare gir et litt dårligere nett.
 *   4. TRUMFREGNSKAPET må aldri påstå at flere trumf er ute enn som finnes.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { e1SpillTrekk, E1_SPILL_DIM_V4, E1_SPILL_DIM_V5 } from "../src/e1/trekk.ts";
import { PLAN_FRA } from "../src/e1/plan.ts";

const P = PLAN_FRA;

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

test("v5 lar de 364 foerste trekkene staa uroert", () => {
  let sjekket = 0;
  for (let frø = 6_600_000; frø < 6_600_030; frø++) {
    const s = stillingISpill(frø, 3);
    if (s === null) continue;
    for (let sete = 0; sete < 4; sete++) {
      const v4 = e1SpillTrekk(s, sete, E1_SPILL_DIM_V4);
      const v5 = e1SpillTrekk(s, sete, E1_SPILL_DIM_V5);
      assert.equal(v5.length, E1_SPILL_DIM_V5);
      for (let i = 0; i < E1_SPILL_DIM_V4; i++) {
        assert.equal(v5[i], v4[i], `indeks ${i} endret seg mellom v4 og v5 (froe ${frø}, sete ${sete})`);
      }
      sjekket++;
    }
  }
  assert.ok(sjekket >= 40, `for faa stillinger sjekket (${sjekket})`);
});

test("regnestykket stemmer med spilltilstanden", () => {
  let sjekket = 0;
  for (let frø = 6_600_000; frø < 6_600_040; frø++) {
    for (const stikkNr of [1, 4, 7]) {
      const s = stillingISpill(frø, stikkNr);
      if (s === null || s.budvinner === null || s.melding?.type !== "tall") continue;
      const bud = s.melding.bud;
      const igjen = s.giving.antallStikk - s.stikkSpilt;
      // Lagstikk slik SETET kjenner dem – makkerens teller bare når makkeren
      // ER avslørt. Samme regel som indeks 230, og den MÅ være samme regel.
      let lagStikk = s.stikkVunnet[s.budvinner] ?? 0;
      if (s.makkerAvslørt && s.makker !== null) lagStikk += s.stikkVunnet[s.makker] ?? 0;
      const mangler = Math.max(0, bud - lagStikk);

      for (let sete = 0; sete < 4; sete++) {
        const v = e1SpillTrekk(s, sete, E1_SPILL_DIM_V5);
        assert.ok(
          Math.abs(v[P]! * 13 - mangler) < 1e-6,
          `mangler: kodet ${v[P]! * 13}, fasit ${mangler} (froe ${frø}, stikk ${stikkNr}, sete ${sete})`,
        );
        assert.ok(
          Math.abs(v[P + 1]! * 13 - igjen) < 1e-6,
          `stikk igjen: kodet ${v[P + 1]! * 13}, fasit ${igjen}`,
        );
        assert.equal(v[P + 3], lagStikk >= bud ? 1 : 0, "«sikret» stemmer ikke");
        assert.equal(v[P + 4], mangler > igjen ? 1 : 0, "«tapt» stemmer ikke");
        const påLag = sete === s.budvinner || (s.makkerAvslørt && s.makker === sete) || s.makker === sete;
        assert.equal(v[P + 6], påLag ? 1 : 0, `«paa budlaget» stemmer ikke for sete ${sete}`);
        sjekket++;
      }
    }
  }
  assert.ok(sjekket >= 60, `for faa stillinger sjekket (${sjekket})`);
});

test("flaggene er gjensidig utelukkende og alt ligger i [-1,1]", () => {
  let sjekket = 0;
  let sågSikret = 0;
  let sågTapt = 0;
  for (let frø = 6_600_000; frø < 6_600_060; frø++) {
    for (const stikkNr of [2, 5, 8]) {
      const s = stillingISpill(frø, stikkNr);
      if (s === null) continue;
      for (let sete = 0; sete < 4; sete++) {
        const v = e1SpillTrekk(s, sete, E1_SPILL_DIM_V5);
        for (let i = 0; i < 12; i++) {
          const x = v[P + i]!;
          assert.ok(Number.isFinite(x), `indeks ${P + i} er ikke endelig`);
          assert.ok(x >= -1 && x <= 1, `indeks ${P + i} utenfor [-1,1]: ${x}`);
        }
        // SIKRET og TAPT kan ikke begge vaere sanne. Ville vaert en stille feil.
        assert.ok(!(v[P + 3] === 1 && v[P + 4] === 1), "baade sikret og tapt satt");
        // Trumf ute kan aldri overstige 13, og aldri vaere negativ.
        assert.ok(v[P + 8]! >= 0 && v[P + 8]! <= 1, "trumf ute utenfor [0,1]");
        // Er det ingen trumf, skal trumftellingene vaere null.
        if (v[P + 11] === 0) {
          assert.equal(v[P + 8], 0, "trumf ute satt uten trumf");
          assert.equal(v[P + 9], 0, "egne trumf satt uten trumf");
        }
        if (v[P + 3] === 1) sågSikret++;
        if (v[P + 4] === 1) sågTapt++;
        sjekket++;
      }
    }
  }
  assert.ok(sjekket >= 60, `for faa stillinger sjekket (${sjekket})`);
  // Begge tilstandene MAA forekomme, ellers har testen bare bekreftet den ene
  // grenen og ville ikke merket at den andre var brekt.
  assert.ok(sågSikret > 0, "ingen stilling med sikret kontrakt - testen er tom");
  assert.ok(sågTapt > 0, "ingen stilling med tapt kontrakt - testen er tom");
});
