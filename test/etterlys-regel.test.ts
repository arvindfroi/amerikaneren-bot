/**
 * BUDVINNEREN KAN IKKE HA DET HUN ETTERLYSTE — en regel, ikke en slutning.
 *
 * ARVIND, 8. august: «han ber om konge - da har han nok essen selv.»
 *
 * Eksempelet er en MYK slutning (den hviler på at hun kaller den høyeste hun
 * ikke har). Men under den ligger en HARD regel, og den var ikke kodet inn:
 * `lovligeEtterlys` forbyr uttrykkelig å etterlyse et kort man har selv, så
 * budvinneren holder aldri det kalte kortet. Det er sant mot enhver motstander,
 * også et menneske som spiller helt uortodokst.
 *
 * ================= HVA MÅLINGEN VISTE ==================================
 *
 * 240 stillinger i stikk 1, 7680 trukne verdener, `ADAMS_MAALT`:
 *
 *                              før        etter
 *     kortet hos budvinneren   22,7 %     0,0 %
 *     ...som ga makker=bv      1742       0
 *
 * Den andre raden er den dyre. `medVerden` finner makkeren ved å lete opp hvem
 * som holder det etterlyste kortet, så i HVER umulige verden ble budvinneren
 * sin egen makker — og `avsluttRunde` ga et budlag på én person 2n uten
 * makkerens n. Rolloutene var ikke bare usannsynlige, de ble scoret feil.
 *
 * Og det bet i stikk 1, den ENESTE stillingen der kortet er uspilt:
 * makkerplikten legger det ned med en gang. Åpningsutspillet er hele
 * etterlysningskonvensjonen, så en fjerdedel av verdenene var søppel akkurat
 * der konvensjonen avgjøres.
 *
 * ================= AT PRØVEN KAN FEILE ER MÅLT ==========================
 *
 * De 22,7 % over ER falsifiseringsarmen: samme test på koden fra før fiksen
 * feiler på første stilling. En prøve som aldri har vært rød beviser ingenting
 * — det er lærdommen fra K2-prøven, som var grønn for en jukser.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør } from "../src/index.ts";
import type { GameState } from "../src/motor.ts";
import { likeKort } from "../src/kort.ts";
import { intTilKort } from "../src/solver/dds.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { ADAMS_MAALT, lagIndre } from "../src/moe2/agentspek.ts";

test("verdenstrekkingen legger aldri det etterlyste kortet hos budvinneren", () => {
  const V = 24;
  let stillinger = 0;
  let verdener = 0;
  let umulige = 0;
  let makkerFeil = 0;

  for (let g = 0; g < 20; g++) {
    const ag = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 51_000_000 + g * 977);
    let vakt = 0;
    while (s.fase !== "FERDIG" && vakt++ < 4000 && s.rundeNr < 2) {
      if (s.fase === "RUNDE_SLUTT") {
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;

      // STIKK 1, observatøren er ikke budvinneren, og holder ikke kortet selv —
      // ellers er kortets plassering allerede kjent og det er ingenting å trekke.
      const etterlyst = s.etterlyst;
      const bv = s.budvinner;
      if (
        s.fase === "SPILL" &&
        s.stikkSpilt === 0 &&
        etterlyst !== null &&
        bv !== null &&
        iTur !== bv &&
        !(s.hender[iTur] ?? []).some((k) => likeKort(k, etterlyst))
      ) {
        stillinger++;
        let r = 12_345 + stillinger * 7919;
        const rng = (): number => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
        for (const verden of trekkVerdener(s, iTur, V, rng, undefined, undefined, 16)) {
          verdener++;
          const bvHånd = verden[bv]!.map(intTilKort);
          if (bvHånd.some((k) => likeKort(k, etterlyst))) {
            umulige++;
            if (medVerden(s, verden, iTur).makker === bv) makkerFeil++;
          }
        }
      }
      s = utfør(s, ag[iTur]!.velgHandling(s)).state;
    }
  }

  // Uten stillinger måler testen ingenting og ville vært grønn for enhver feil.
  assert.ok(stillinger >= 20, `for få stikk-1-stillinger (${stillinger})`);
  assert.ok(verdener >= 400, `for få verdener trukket (${verdener})`);
  assert.equal(umulige, 0, `${umulige} av ${verdener} verdener bryter etterlysningsregelen`);
  assert.equal(makkerFeil, 0, `${makkerFeil} verdener gjorde budvinneren til sin egen makker`);
});
