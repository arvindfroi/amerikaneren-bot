/**
 * `utenSøk` MÅ FJERNE ALLE SØKELAG — ellers søker rolloutene.
 *
 * Funksjonen finnes av én grunn: å lage en ROLLOUT-MOTPART. Gis søkeagenten en
 * motpart som selv søker, starter hver rollout et nytt søk, og kostnaden blir
 * eksponentiell. `web/worker.ts` sier det rett ut: «Gis søkeagenten seg selv,
 * starter hver rollout et nytt søk.»
 *
 * ================= HVORFOR DENNE FILA FINNES =========================
 *
 * `amu:` MANGLET i lista. Den var ikke nåbar så lenge alpha-mu alltid lå
 * ytterst av søkelagene — men `sum:` gjorde den nåbar: `sum:…:amu:…` bygger et
 * søkeledd hvis motpart hentes fra den indre speken, og den inneholder `amu:`.
 *
 * Feilen ble funnet ved LESNING, ikke ved måling, og rettet før den kostet noe.
 * `ork:` av samme klasse kostet en gang en hel natt.
 *
 * Testen er skrevet slik at den fanger det NESTE laget noen legger til også:
 * den krever at ingen kjent søkeprefiks overlever strippingen, uansett
 * rekkefølge.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { utenSøk } from "../src/moe2/agentspek.ts";

/** Alle lag som utfører et søk. Legges et nytt til, hører det hjemme her. */
const SØKELAG = ["ork:", "sik:", "amu:", "vv:", "vv2:", "sum:"] as const;

const NETT = "vakt:abmpf:e1:e1-modell/d7alle.bin";

test("ingen soekeprefiks overlever utenSøk", () => {
  const speker = [
    `amu:foerer:12k16bgm1e0r1.5v0.5:${NETT}`,
    `sik:foerer:0.5:8:${NETT}`,
    `ork:foerer:12:${NETT}`,
    // NESTET: det er denne `sum:` gjorde naabar.
    `sum:nett=1,sok=0.5:amu:foerer:12k16bm1e0:${NETT}`,
    `amu:alle:6k4bgm2e0.25r1.5v0.5d5B4:${NETT}`,
  ];
  for (const spek of speker) {
    const rest = utenSøk(spek);
    for (const lag of SØKELAG) {
      assert.ok(
        !rest.startsWith(lag),
        `«${lag}» overlevde strippingen av «${spek}» -> «${rest}». En rollout-motpart ` +
          `som selv soeker gjoer hver rollout til et nytt soek.`,
      );
    }
  }
});

test("utenSøk roerer ikke lag som IKKE soeker", () => {
  // Vrak, budgivning, konvensjoner og nettet skal staa igjen - motparten maa
  // fortsatt vaere en spillende bot, ikke et tomt skall.
  const uten = utenSøk(`amu:foerer:12k16bm1e0:vr:e1-modell/vrakrang.bin:telrd:${NETT}`);
  assert.ok(uten.startsWith("vr:"), `forventet at «vr:» sto igjen, fikk «${uten}»`);
  assert.ok(uten.includes("vakt:abmpf"), "konvensjonsvakten skal staa igjen");
  assert.ok(uten.includes("e1:"), "nettet skal staa igjen - uten det kan motparten ikke spille");
});

test("en spek UTEN soek er sitt eget resultat", () => {
  // Null-punktet: `utenSøk` skal vaere identitet naar det ikke er noe aa fjerne,
  // saa kallerne trygt kan sammenligne med `===` for aa unngaa dobbeltbygging.
  const spek = `vr:e1-modell/vrakrang.bin:telrd:${NETT}`;
  assert.equal(utenSøk(spek), spek);
});
