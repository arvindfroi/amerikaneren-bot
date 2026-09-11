/**
 * K4 PRØVE A MED EN VILKÅRLIG SPEK — prøver for `--spek` i `examples/k4-hukommelse.ts`.
 *
 * Det nye er ikke prøven, men forutsetningen den hviler på: at speken er en funksjon av
 * tilstanden. Med `sik:` er den ikke det, og da måler «fersk mot mett» RNG-posisjon.
 * Verktøyet skal SI det, ikke bare vise et avvik i nullarmen.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { ADAMS_MAALT } from "../src/moe2/agentspek.ts";
import {
  A_MINNE,
  A_NULL,
  BASE_DET,
  dømK4Spek,
  erDeterministisk,
  kjørK4Spek,
  slåSammenK4,
  spillOgTaOpp,
  type K4SpekRapport,
} from "../examples/k4-hukommelse.ts";
import { utenMinne } from "../examples/spek-lag.ts";

test("K4 --spek: nullarmen avledet av A_MINNE er nøyaktig A_NULL", () => {
  assert.equal(utenMinne(A_MINNE), A_NULL, "avledningen bygger en annen nullarm enn den faste");
  assert.equal(A_NULL, BASE_DET);
});

test("K4 --spek: standardkallet er uendret — tomt `ekstra` gir samme opptak som før", () => {
  const a = spillOgTaOpp(A_MINNE, false, 4_400_000, 1, true);
  const b = spillOgTaOpp(A_MINNE, false, 4_400_000, 1, true, 0, 0, undefined, {});
  assert.ok(a.valg.length > 0);
  assert.deepEqual(b.valg, a.valg);
});

test("erDeterministisk: den faste stakken er det, et søk med vandrende RNG er det IKKE", () => {
  const det = erDeterministisk(ADAMS_MAALT, 1);
  assert.ok(det.kall > 0);
  assert.equal(det.ulike, 0, `ADAMS_MAALT ga ulikt svar på samme tilstand:\n${det.eksempler.join("\n")}`);
  // Fella: σ = 0 overstyrer alltid med to verdener — to kall trekker to ulike par.
  const støy = erDeterministisk(`sik:alle:0:2:${ADAMS_MAALT}`, 1);
  assert.ok(støy.ulike > 0, "et søk med vandrende RNG ble ikke oppdaget — advarselen kan aldri fyre");
});

test("K4 --spek: en liten ekte kjøring — nullarmen 0 avvik, de andre setene fra `andre`", () => {
  const r = kjørK4Spek({
    spek: `okt:${A_MINNE}`,
    nullSpek: utenMinne(`okt:${A_MINNE}`),
    andre: BASE_DET,
    giv: 1,
    frøBase: 4_400_000,
    målRunde: 2,
    forkamper: 0,
    deler: ["null", "minne"],
  });
  const nul = r.armer.find((a) => a.navn === "NULL");
  assert.ok(nul !== undefined && nul.n > 0, "nullarmen fikk ingen stillinger");
  assert.equal(nul.avvik, 0, "en deterministisk nullarm uten hukommelse avvek");
  assert.equal(r.nullSpek, A_NULL);
});

test("dømK4Spek: avvik i nullarmen med søkelag er STUM og peker på frøet — ikke «ja»", () => {
  const grunn: K4SpekRapport = {
    spek: "s",
    nullSpek: "n",
    andre: null,
    opts: { giv: 1, frøBase: 0, målRunde: 7, forkamper: 0 },
    determinisme: { kall: 10, ulike: 0, søkelag: false, eksempler: [] },
    armer: [
      { navn: "NULL", spek: "n", giv: 1, n: 10, avvik: 0, avvikBud: 0, avvikSpill: 0, bokførte: [0, 0, 0, 0], eksempler: [] },
      { navn: "MINNE", spek: "s", giv: 1, n: 10, avvik: 2, avvikBud: 2, avvikSpill: 0, bokførte: [3, 3, 3, 3], eksempler: [] },
    ],
    positivkontroll: [{ forsterk: 8, n: 10, avvik: 1 }],
    struktur: null,
    sekunder: 0,
  };
  assert.equal(dømK4Spek(grunn).dom, "ja");
  const støy = dømK4Spek({
    ...grunn,
    determinisme: { kall: 10, ulike: 3, søkelag: true, eksempler: [] },
    armer: grunn.armer.map((a) => (a.navn === "NULL" ? { ...a, avvik: 2 } : a)),
  });
  assert.equal(støy.dom, "stum");
  assert.match(støy.grunn, /per-beslutning-frø/);
  assert.equal(dømK4Spek({ ...grunn, positivkontroll: [{ forsterk: 8, n: 10, avvik: 0 }] }).dom, "stum");
  assert.equal(dømK4Spek({ ...grunn, armer: grunn.armer.map((a) => ({ ...a, avvik: 0 })) }).dom, "nei");
  // Skiver summeres per arm, kontrolldelen tas fra skiva som har den.
  const s = slåSammenK4([{ ...grunn, positivkontroll: null }, { ...grunn, armer: [] }]);
  assert.equal(s.armer.find((a) => a.navn === "MINNE")!.n, 10);
  assert.notEqual(s.positivkontroll, null);
});
