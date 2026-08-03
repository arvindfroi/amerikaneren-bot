/**
 * VERDIBLOKKEN (v7, indeks 428–457): hva hånden er verdt akkurat nå.
 *
 * DEN AVGJØRENDE TESTEN: et «sikkert stikk» må faktisk være sikkert. Påstanden
 * er at kortet er høyere enn ALT som fortsatt er ute i fargen – og den kan
 * testes mot de skjulte hendene, som er den uavhengige fasiten. Er den noen
 * gang usann, lærer nettet å telle stikk det ikke har, og feilen ville aldri
 * krasjet noe – den ville bare gitt en spillefører som overvurderer hånden sin.
 *
 * MERK PRESISJONEN I PÅSTANDEN. «Sikker i fargen» er ikke «sikker i runden»:
 * et ess kan trumfes. Testen sjekker derfor at kortet er høyest i fargen blant
 * alle uspilte, ikke at det faktisk tar stikket. Skillet er meningen, og det er
 * derfor `andre er renons` ligger som eget trekk ved siden av.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { fargeIndeks } from "../src/nevro/trekk.ts";
import { e1SpillTrekk, E1_SPILL_DIM_V6, E1_SPILL_DIM_V7 } from "../src/e1/trekk.ts";
import { VERDI_FRA } from "../src/e1/verdi.ts";

const MESTER = VERDI_FRA;
const SIKRE = VERDI_FRA + 4;
const TAPERE = VERDI_FRA + 8;
const MIN_RENONS = VERDI_FRA + 12;
const KAN_TVINGE = VERDI_FRA + 20;

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

/** Kortene i farge `f` som ingen har spilt ennå, hos ANDRE enn `sete`. */
function uteHosAndre(s: GameState, sete: number, f: number): number[] {
  const ut: number[] = [];
  for (let p = 0; p < 4; p++) {
    if (p === sete) continue;
    for (const k of s.hender[p] ?? []) if (fargeIndeks(k.farge) === f) ut.push(k.verdi);
  }
  return ut;
}

test("v7 lar de 428 foerste trekkene staa uroert", () => {
  let sjekket = 0;
  for (let frø = 8_800_000; frø < 8_800_030; frø++) {
    const s = stillingISpill(frø, 3);
    if (s === null) continue;
    for (let sete = 0; sete < 4; sete++) {
      const v6 = e1SpillTrekk(s, sete, E1_SPILL_DIM_V6);
      const v7 = e1SpillTrekk(s, sete, E1_SPILL_DIM_V7);
      assert.equal(v7.length, E1_SPILL_DIM_V7);
      for (let i = 0; i < E1_SPILL_DIM_V6; i++) {
        assert.equal(v7[i], v6[i], `indeks ${i} endret seg mellom v6 og v7`);
      }
      sjekket++;
    }
  }
  assert.ok(sjekket >= 40, `for faa stillinger sjekket (${sjekket})`);
});

test("SIKRE STIKK er faktisk hoeyest i fargen - testet mot de skjulte hendene", () => {
  let sjekket = 0;
  let sågSikre = 0;
  for (let frø = 8_800_000; frø < 8_800_060; frø++) {
    for (const stikkNr of [2, 5, 8]) {
      const s = stillingISpill(frø, stikkNr);
      if (s === null) continue;
      for (let sete = 0; sete < 4; sete++) {
        const v = e1SpillTrekk(s, sete, E1_SPILL_DIM_V7);
        for (let f = 0; f < 4; f++) {
          const sikre = Math.round(v[SIKRE + f]! * 13);
          if (sikre === 0) continue;
          sågSikre += sikre;
          const mine = (s.hender[sete] ?? [])
            .filter((k) => fargeIndeks(k.farge) === f)
            .map((k) => k.verdi)
            .sort((a, b) => b - a);
          const andres = uteHosAndre(s, sete, f);
          // De `sikre` hoeyeste av mine kort maa alle ligge over ALT andre har.
          for (let i = 0; i < sikre; i++) {
            const kort = mine[i];
            assert.ok(kort !== undefined, `paastod ${sikre} sikre, men har bare ${mine.length}`);
            for (const a of andres) {
              assert.ok(
                kort! > a,
                `SIKKER STIKK LYVER: mitt ${kort} i farge ${f} er ikke over motstanderens ${a} ` +
                  `(froe ${frø}, stikk ${stikkNr}, sete ${sete})`,
              );
            }
          }
          // MESTER-flagget maa vaere paa naar det finnes minst ett sikkert stikk.
          assert.equal(v[MESTER + f], 1, `mester-flagget av med ${sikre} sikre i farge ${f}`);
        }
        sjekket++;
      }
    }
  }
  assert.ok(sjekket >= 60, `for faa stillinger sjekket (${sjekket})`);
  assert.ok(sågSikre > 50, `for faa sikre stikk observert (${sågSikre}) - baerer trekket noe?`);
});

test("renons og tvingning stemmer med haanden, og alt ligger i [-1,1]", () => {
  let sjekket = 0;
  let sågTvinge = 0;
  for (let frø = 8_800_000; frø < 8_800_060; frø++) {
    const s = stillingISpill(frø, 6);
    if (s === null) continue;
    for (let sete = 0; sete < 4; sete++) {
      const v = e1SpillTrekk(s, sete, E1_SPILL_DIM_V7);
      for (let i = 0; i < 30; i++) {
        const x = v[VERDI_FRA + i]!;
        assert.ok(Number.isFinite(x) && x >= -1 && x <= 1, `indeks ${VERDI_FRA + i} = ${x}`);
      }
      for (let f = 0; f < 4; f++) {
        const antall = (s.hender[sete] ?? []).filter((k) => fargeIndeks(k.farge) === f).length;
        assert.equal(v[MIN_RENONS + f], antall === 0 ? 1 : 0, `egen renons feil i farge ${f}`);
        // Sikre + tapere = alle mine kort i fargen.
        const sum = Math.round(v[SIKRE + f]! * 13) + Math.round(v[TAPERE + f]! * 13);
        assert.equal(sum, antall, `sikre+tapere (${sum}) != kort i farge ${f} (${antall})`);
        // TVINGNING krever at jeg HAR fargen - ellers kan jeg ikke spille den.
        if (v[KAN_TVINGE + f] === 1) {
          assert.ok(antall > 0, `paastaar tvingning i farge ${f} uten aa ha den`);
          sågTvinge++;
        }
      }
      sjekket++;
    }
  }
  assert.ok(sjekket >= 40, `for faa stillinger sjekket (${sjekket})`);
  assert.ok(sågTvinge > 0, "saa aldri en tvingningsmulighet - er trekket doedt?");
});
