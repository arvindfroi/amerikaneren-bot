/**
 * ETIKETTEN OG KODINGEN MÅ VÆRE ENIGE OM HVA SOM ER SYNLIG.
 *
 * Dette er den feilklassen som felte §117s forgjenger: troens rader ble
 * sammenliknet mot et gulv som betinget på noe annet, og prøven «viste» at
 * Adams var verre enn uniform. Det var målingen som var gal.
 *
 * Her prøves de tre invariantene som gjør et treningsdatasett meningsfullt i
 * det hele tatt:
 *
 *   1. Et kort har etikett > 0 HVIS OG BARE HVIS kodingens `USETT`-bit er 1.
 *      Ellers trenes modellen på kort den allerede ser, eller den blir bedt om
 *      å tie om kort den må gjette.
 *   2. Antall etiketter i klasse 4 er nøyaktig den døde kapasiteten kodingen
 *      oppgir. Den fjerde klassen er hele grunnen til at prøven ble riktig.
 *   3. Er observatøren budvinner, finnes klasse 4 IKKE — hun kjenner sitt eget
 *      vrak. Samme asymmetri som gjør kanal 2 strukturelt stum i det setet.
 *
 * Og til slutt: hvert usett kort ligger ET sted. Summen av klasse 1–4 må være
 * lik antall usette kort, ellers har vi mistet et kort på gulvet.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { spillerVisning } from "../src/motor.ts";
import { lagIndre, ADAMS_MAALT } from "../src/moe2/agentspek.ts";
import { troFasit } from "../src/mlb/fasit.ts";
import { troTrekk, TROINNGANG } from "../src/mlb/trotrekk.ts";

test("MLB-fasit: etiketten og kodingen er enige om hva som er usett", () => {
  let stillinger = 0;
  let medTalong = 0;
  let budvinnerseter = 0;

  for (let g = 0; g < 12; g++) {
    const frø = 7_700_000 + g * 3541;
    const drivere = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
    let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 200) {
      if (s.fase === "SPILL" && s.iTur !== null) {
        const sete = s.iTur;
        const v = spillerVisning(s, sete);
        const t = troTrekk(v, s.giving.antallStikk, s.regler.målPoeng);
        const f = troFasit(s, sete);
        stillinger++;

        let usett = 0;
        let iKlasse = 0;
        let talong = 0;
        for (let i = 0; i < 52; i++) {
          const erUsett = t[TROINNGANG.USETT + i] === 1;
          if (erUsett) usett++;
          assert.equal(
            f[i]! > 0,
            erUsett,
            `frø ${frø} stikk ${s.stikkSpilt} sete ${sete} kort ${i}: etikett ${f[i]} ` +
              `men USETT-bit ${t[TROINNGANG.USETT + i]} — masken og fasiten er uenige`,
          );
          if (f[i]! > 0) iKlasse++;
          if (f[i] === 4) talong++;
        }
        assert.equal(iKlasse, usett, "et usett kort mangler en klasse");

        // Den døde kapasiteten kodingen oppgir, tilbake fra andelen.
        const sumH = [0, 1, 2, 3]
          .filter((p) => p !== sete)
          .reduce((a, p) => a + (v.antallKort[p] ?? 0), 0);
        assert.equal(
          talong,
          usett - sumH,
          `talongetiketter ${talong}, men usett − hånder = ${usett - sumH}`,
        );
        if (talong > 0) medTalong++;

        if (v.budvinner === sete) {
          budvinnerseter++;
          assert.equal(t[TROINNGANG.VRAK_KJENT], 1, "budvinneren skal ha VRAK_KJENT = 1");
          assert.equal(talong, 0, "budvinneren kjenner sitt eget vrak — klasse 4 kan ikke finnes");
          assert.equal(
            t[TROINNGANG.KAPASITET + 3],
            0,
            "budvinnerens døde kapasitet må være 0",
          );
        }

        // Kapasitetsprioren er en fordeling.
        let sum = 0;
        for (let c = 0; c < 4; c++) sum += t[TROINNGANG.KAPASITET + c]!;
        assert.ok(Math.abs(sum - 1) < 1e-5, `kapasitetsprioren summerer til ${sum}, ikke 1`);
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      s = utfør(s, drivere[iTur]!.velgHandling(s)).state;
    }
  }

  // En grønn test på null stillinger beviser ingenting — og heller ikke en som
  // aldri besøkte de to setene som oppfører seg ULIKT.
  assert.ok(stillinger >= 200, `bare ${stillinger} stillinger prøvd`);
  assert.ok(medTalong >= 20, `bare ${medTalong} stillinger hadde en talongetikett i det hele tatt`);
  assert.ok(budvinnerseter >= 20, `bare ${budvinnerseter} stillinger sett fra budvinnerens sete`);
});
