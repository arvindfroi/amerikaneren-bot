/**
 * HVEM LA HVA (v10) må stemme med historikken – og bare med den.
 *
 * Blokken er den mest direkte gjengivelsen av offentlig informasjon i hele
 * kodingen: for hvert kort, hvilket relativt sete som la det. Nettopp derfor
 * er lekkasjefaren størst her. Leser den `state.hender` eller `state.vrak`,
 * ville nettet lært av noe det aldri får se i spill – og alle målinger bygget
 * på det ville vært verdiløse uten å se feil ut.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { fyllHvemLa, HVEMLA_FRA, HVEMLA_ANTALL } from "../src/e1/hvemla.ts";

const BREDDE = HVEMLA_FRA + HVEMLA_ANTALL;

function overGiver(antall: number, sjekk: (s: GameState) => void): number {
  let n = 0;
  for (let i = 0; i < antall; i++) {
    const ag = [0, 1, 2, 3].map(() => new NevroAgent());
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 7_300_000 + i * 7717);
    let g = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
      if (s.fase === "SPILL") {
        sjekk(s);
        n++;
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      s = utfør(s, ag[iTur]!.velgHandling(s)).state;
    }
  }
  return n;
}

test("blokken gjengir historikken NØYAKTIG, sett fra hvert sete", () => {
  const n = overGiver(10, (s) => {
    for (let sete = 0; sete < 4; sete++) {
      const v = new Float32Array(BREDDE);
      fyllHvemLa(v, s, sete);

      // Bygg fasiten uavhengig av implementasjonen.
      const ventet = new Set<number>();
      const alle = [...s.historikk.flatMap((t) => t.kort), ...s.bord];
      for (const kp of alle) {
        const r = (kp.spiller - sete + 4) % 4;
        if (r === 0) continue; // egne kort skal IKKE stå i blokken
        ventet.add((r - 1) * 52 + kortIndeks(kp.kort));
      }

      for (let i = 0; i < HVEMLA_ANTALL; i++) {
        const satt = v[HVEMLA_FRA + i] === 1;
        assert.equal(satt, ventet.has(i), `indeks ${i} for sete ${sete}`);
      }
    }
  });
  assert.ok(n > 80, `for få stillinger (${n})`);
});

test("egne kort står ALDRI i blokken", () => {
  overGiver(8, (s) => {
    for (let sete = 0; sete < 4; sete++) {
      const v = new Float32Array(BREDDE);
      fyllHvemLa(v, s, sete);
      const mine = [...s.historikk.flatMap((t) => t.kort), ...s.bord].filter(
        (kp) => kp.spiller === sete,
      );
      for (const kp of mine) {
        // Kortet kan stå i EN annen rad bare hvis en annen la det – umulig.
        for (let r = 0; r < 3; r++) {
          assert.equal(
            v[HVEMLA_FRA + r * 52 + kortIndeks(kp.kort)],
            0,
            "et kort jeg selv la dukket opp som en annens",
          );
        }
      }
    }
  });
});

/**
 * LEKKASJEVAKTEN. Blokken skal være en funksjon av historikken ALENE. Bytter
 * vi ut de skjulte hendene og vraket med noe helt annet, må hver eneste verdi
 * være uendret.
 */
test("skjulte hender og vrak påvirker ikke blokken", () => {
  let sammenliknet = 0;
  overGiver(8, (s) => {
    const forfalsket = {
      ...s,
      hender: s.hender.map((h, i) => (i === 0 ? h : [])),
      vrak: [],
    } as GameState;
    for (let sete = 0; sete < 4; sete++) {
      const a = new Float32Array(BREDDE);
      const b = new Float32Array(BREDDE);
      fyllHvemLa(a, s, sete);
      fyllHvemLa(b, forfalsket, sete);
      for (let i = HVEMLA_FRA; i < BREDDE; i++) {
        assert.equal(a[i], b[i], `indeks ${i}: skjult informasjon lekket inn`);
      }
      sammenliknet++;
    }
  });
  assert.ok(sammenliknet > 300, `for få sammenlikninger (${sammenliknet})`);
});

test("hvert kort står i høyst ÉN rad – det kan bare legges av én spiller", () => {
  overGiver(8, (s) => {
    for (let sete = 0; sete < 4; sete++) {
      const v = new Float32Array(BREDDE);
      fyllHvemLa(v, s, sete);
      for (let k = 0; k < 52; k++) {
        let n = 0;
        for (let r = 0; r < 3; r++) if (v[HVEMLA_FRA + r * 52 + k] === 1) n++;
        assert.ok(n <= 1, `kort ${k} er lagt av ${n} ulike seter`);
      }
    }
  });
});
