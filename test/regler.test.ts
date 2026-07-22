import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AMERIKANER,
  SOLO,
  PASS,
  beregnPoeng,
  budRang,
  erHøyereBud,
  kortgiving,
  lagRegler,
  meldingsinfo,
} from "../src/regler.ts";

test("kortgiving per spillerantall (byttekort)", () => {
  assert.deepEqual(kortgiving(lagRegler({ antallSpillere: 3 })), {
    kortPerSpiller: 17,
    talong: 1,
    antallStikk: 17,
  });
  assert.deepEqual(kortgiving(lagRegler({ antallSpillere: 4 })), {
    kortPerSpiller: 12,
    talong: 4,
    antallStikk: 12,
  });
  assert.deepEqual(kortgiving(lagRegler({ antallSpillere: 5 })), {
    kortPerSpiller: 10,
    talong: 2,
    antallStikk: 10,
  });
  assert.deepEqual(kortgiving(lagRegler({ antallSpillere: 6 })), {
    kortPerSpiller: 8,
    talong: 4,
    antallStikk: 8,
  });
});

test("klassiske regler: 13 kort, ingen talong", () => {
  assert.deepEqual(kortgiving(lagRegler({ medByttekort: false })), {
    kortPerSpiller: 13,
    talong: 0,
    antallStikk: 13,
  });
  assert.throws(() => lagRegler({ medByttekort: false, antallSpillere: 5 }));
});

test("budrangering: tall < amerikaner < solo", () => {
  assert.ok(budRang(5) < budRang(12));
  assert.ok(budRang(12) < budRang(AMERIKANER));
  assert.ok(budRang(AMERIKANER) < budRang(SOLO));
});

test("erHøyereBud håndhever min/max og stigende bud", () => {
  assert.equal(erHøyereBud(4, null, 12), false); // under minste (5)
  assert.equal(erHøyereBud(13, null, 12), false); // over antall stikk
  assert.equal(erHøyereBud(5, null, 12), true);
  assert.equal(erHøyereBud(6, 6, 12), false); // ikke høyere
  assert.equal(erHøyereBud(7, 6, 12), true);
  assert.equal(erHøyereBud(AMERIKANER, 12, 12), true);
  assert.equal(erHøyereBud(SOLO, AMERIKANER, 12), true);
  assert.equal(erHøyereBud(PASS, 7, 12), true); // pass alltid lov
});

test("poeng: tallbud klart – budvinner 2n, makker n, øvrige +1 per stikk", () => {
  const r = beregnPoeng({
    regler: lagRegler(),
    melding: meldingsinfo(6),
    antallStikk: 12,
    antallSpillere: 4,
    budvinner: 0,
    makker: 2,
    // lag tok 6+3=9 stikk (>=6, klart); øvrige 1 og 2
    stikkPerSpiller: [6, 1, 3, 2],
  });
  assert.equal(r.klart, true);
  assert.deepEqual(r.delta, [12, 1, 6, 2]);
});

test("poeng: tallbud feilet – negative for budlaget, øvrige +1 per stikk", () => {
  const r = beregnPoeng({
    regler: lagRegler(),
    melding: meldingsinfo(8),
    antallStikk: 12,
    antallSpillere: 4,
    budvinner: 1,
    makker: 3,
    // lag tok 3+2=5 (<8, feilet); øvrige 4 og 3
    stikkPerSpiller: [4, 3, 3, 2],
  });
  assert.equal(r.klart, false);
  assert.deepEqual(r.delta, [4, -16, 3, -8]);
});

test("poeng: amerikaner klart = +50/+25, feilet = -50/-25 + øvrige stikk", () => {
  const klart = beregnPoeng({
    regler: lagRegler(),
    melding: meldingsinfo(AMERIKANER),
    antallStikk: 12,
    antallSpillere: 4,
    budvinner: 0,
    makker: 1,
    stikkPerSpiller: [7, 5, 0, 0], // alle 12 stikk til laget
  });
  assert.equal(klart.klart, true);
  assert.deepEqual(klart.delta, [50, 25, 0, 0]);

  const feilet = beregnPoeng({
    regler: lagRegler(),
    melding: meldingsinfo(AMERIKANER),
    antallStikk: 12,
    antallSpillere: 4,
    budvinner: 0,
    makker: 1,
    stikkPerSpiller: [6, 4, 1, 1], // ett stikk glapp
  });
  assert.equal(feilet.klart, false);
  assert.deepEqual(feilet.delta, [-50, -25, 1, 1]);
});

test("poeng: solo-amerikaner klart = +mål alene, ingen makker", () => {
  const klart = beregnPoeng({
    regler: lagRegler(),
    melding: meldingsinfo(SOLO),
    antallStikk: 12,
    antallSpillere: 4,
    budvinner: 2,
    makker: null,
    stikkPerSpiller: [0, 0, 12, 0],
  });
  assert.equal(klart.klart, true);
  assert.deepEqual(klart.delta, [0, 0, 100, 0]);

  const feilet = beregnPoeng({
    regler: lagRegler(),
    melding: meldingsinfo(SOLO),
    antallStikk: 12,
    antallSpillere: 4,
    budvinner: 2,
    makker: null,
    stikkPerSpiller: [3, 4, 11, 1],
  });
  assert.equal(feilet.klart, false);
  assert.deepEqual(feilet.delta, [3, 4, -100, 1]);
});

test("amerikaner-satser skalerer med målPoeng", () => {
  const r = beregnPoeng({
    regler: lagRegler({ målPoeng: 200 }),
    melding: meldingsinfo(AMERIKANER),
    antallStikk: 12,
    antallSpillere: 4,
    budvinner: 0,
    makker: 1,
    stikkPerSpiller: [12, 0, 0, 0],
  });
  assert.deepEqual(r.delta, [100, 50, 0, 0]); // 200/2, 200/4
});
