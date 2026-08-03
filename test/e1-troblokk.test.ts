/**
 * TROBLOKKEN (v6, indeks 376–427): hva hver motstander kan ha på hånd.
 *
 * DEN AVGJØRENDE TESTEN ER GRENSEN. `fyllTroblokk` påstår at sete r høyst kan
 * ha N kort av farge f igjen. Er den påstanden noen gang FOR LAV, lærer nettet
 * en slutning som er gal – og den feilen krasjer ingenting, den gir bare et
 * nett som plasserer kort feil og spiller litt dårligere.
 *
 * Testen bruker de SKJULTE hendene som fasit. Det er lovlig i en test og
 * ulovlig i et trekk, og skillet er hele poenget: trekket regnes av offentlig
 * informasjon, og testen sjekker at det offentlige anslaget aldri motsies av
 * sannheten.
 *
 * De øvrige påstandene:
 *   1. 0–375 må stå bit for bit likt i v5 og v6.
 *   2. Høyeste/laveste spilte rang må stemme med historikken.
 *   3. Renonse i troblokken må stemme med renonsflaggene i 246–261, som er
 *      utledet uavhengig i en annen fil.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { fargeIndeks } from "../src/nevro/trekk.ts";
import { e1SpillTrekk, E1_SPILL_DIM_V5, E1_SPILL_DIM_V6 } from "../src/e1/trekk.ts";
import { TRO_FRA } from "../src/e1/tro.ts";

const HØY = TRO_FRA;
const LAV = TRO_FRA + 16;
const GRENSE = TRO_FRA + 32;
const RENONS = TRO_FRA + 48;

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

test("v6 lar de 376 foerste trekkene staa uroert", () => {
  let sjekket = 0;
  for (let frø = 7_700_000; frø < 7_700_030; frø++) {
    const s = stillingISpill(frø, 3);
    if (s === null) continue;
    for (let sete = 0; sete < 4; sete++) {
      const v5 = e1SpillTrekk(s, sete, E1_SPILL_DIM_V5);
      const v6 = e1SpillTrekk(s, sete, E1_SPILL_DIM_V6);
      assert.equal(v6.length, E1_SPILL_DIM_V6);
      for (let i = 0; i < E1_SPILL_DIM_V5; i++) {
        assert.equal(v6[i], v5[i], `indeks ${i} endret seg mellom v5 og v6 (froe ${frø}, sete ${sete})`);
      }
      sjekket++;
    }
  }
  assert.ok(sjekket >= 40, `for faa stillinger sjekket (${sjekket})`);
});

test("OEVRE GRENSE blir aldri motsagt av den faktiske haanden", () => {
  let sjekket = 0;
  let stramme = 0;
  for (let frø = 7_700_000; frø < 7_700_060; frø++) {
    for (const stikkNr of [1, 4, 7, 9]) {
      const s = stillingISpill(frø, stikkNr);
      if (s === null) continue;
      for (let sete = 0; sete < 4; sete++) {
        const v = e1SpillTrekk(s, sete, E1_SPILL_DIM_V6);
        for (let p = 0; p < 4; p++) {
          const r = (p - sete + 4) % 4;
          for (let f = 0; f < 4; f++) {
            const faktisk = (s.hender[p] ?? []).filter((k) => fargeIndeks(k.farge) === f).length;
            const grense = Math.round(v[GRENSE + r * 4 + f]! * 13);
            assert.ok(
              faktisk <= grense,
              `GRENSEN LYVER: sete ${p} (rad ${r}) har ${faktisk} av farge ${f}, ` +
                `men grensen sier hoeyst ${grense} (froe ${frø}, stikk ${stikkNr}, observatoer ${sete})`,
            );
            if (grense === faktisk) stramme++;
          }
        }
        sjekket++;
      }
    }
  }
  assert.ok(sjekket >= 60, `for faa stillinger sjekket (${sjekket})`);
  // En grense som ALDRI er stram baerer ingen informasjon. At den treffer
  // eksakt i en god del tilfeller er det som gjoer trekket verdt aa ha.
  assert.ok(stramme > sjekket, `grensen er nesten aldri stram (${stramme}) - baerer den noe?`);
});

test("hoeyeste og laveste spilte rang stemmer med historikken", () => {
  let sjekket = 0;
  for (let frø = 7_700_000; frø < 7_700_040; frø++) {
    const s = stillingISpill(frø, 5);
    if (s === null) continue;
    const stikkene = [...s.historikk.map((x) => x.kort), ...(s.bord.length > 0 ? [s.bord] : [])];
    for (let sete = 0; sete < 4; sete++) {
      const v = e1SpillTrekk(s, sete, E1_SPILL_DIM_V6);
      const hø = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
      const la = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
      for (const stikk of stikkene) {
        for (const kp of stikk) {
          const r = (kp.spiller - sete + 4) % 4;
          const f = fargeIndeks(kp.kort.farge);
          if (hø[r]![f]! === 0 || kp.kort.verdi > hø[r]![f]!) hø[r]![f] = kp.kort.verdi;
          if (la[r]![f]! === 0 || kp.kort.verdi < la[r]![f]!) la[r]![f] = kp.kort.verdi;
        }
      }
      for (let r = 0; r < 4; r++) {
        for (let f = 0; f < 4; f++) {
          const ventetH = hø[r]![f]! === 0 ? 0 : (hø[r]![f]! - 1) / 13;
          const ventetL = la[r]![f]! === 0 ? 0 : (la[r]![f]! - 1) / 13;
          assert.ok(Math.abs(v[HØY + r * 4 + f]! - ventetH) < 1e-6, `hoeyeste feil (rad ${r}, farge ${f})`);
          assert.ok(Math.abs(v[LAV + r * 4 + f]! - ventetL) < 1e-6, `laveste feil (rad ${r}, farge ${f})`);
        }
      }
      sjekket++;
    }
  }
  assert.ok(sjekket >= 40, `for faa stillinger sjekket (${sjekket})`);
});

test("renonstellingen stemmer med de uavhengige renonsflaggene i 246-261", () => {
  let sjekket = 0;
  for (let frø = 7_700_000; frø < 7_700_040; frø++) {
    const s = stillingISpill(frø, 6);
    if (s === null) continue;
    for (let sete = 0; sete < 4; sete++) {
      const v = e1SpillTrekk(s, sete, E1_SPILL_DIM_V6);
      for (let r = 0; r < 4; r++) {
        let fra246 = 0;
        for (let f = 0; f < 4; f++) if (v[238 + 8 + r * 4 + f]! > 0.5) fra246++;
        assert.ok(
          Math.abs(v[RENONS + r]! * 4 - fra246) < 1e-6,
          `renonstelling ${v[RENONS + r]! * 4} mot flaggene ${fra246} (rad ${r})`,
        );
      }
      sjekket++;
    }
  }
  assert.ok(sjekket >= 40, `for faa stillinger sjekket (${sjekket})`);
});
