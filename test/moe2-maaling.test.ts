import { strict as assert } from "node:assert";
import { test } from "node:test";

import { beskriv, framdrift, mål, overGulvet, slaarTaket } from "../src/moe2/maaling.ts";
import { prøvPorten, spearman } from "../src/moe2/port.ts";

/**
 * Disse testene låser de to invariantene MoE2 er bygget rundt, og begge
 * stammer fra feil som faktisk ble gjort 25. juli 2026.
 */

test("gulv og tak beregnes over SAMME stillinger som kandidaten", () => {
  // Feilen som skal være umulig: å hente referansen fra et annet utvalg.
  // Her er stillingene så ulike at et lånt referansetall ville gitt motsatt
  // konklusjon – akkurat som da nevro ble sitert til 0,9431 fra ett utvalg
  // mens genomet ble målt på et annet der nevro egentlig var 0,8381.
  const lette = [1, 1, 1];
  const tunge = [10, 10, 10];
  const m = mål({
    navn: "test",
    stillinger: tunge,
    holdout: true,
    retning: "lavereErBedre",
    kandidat: (s) => s * 0.9,
    gulv: (s) => s * 1.0,
    tak: (s) => s * 0.8,
  });
  assert.equal(m.verdi, 9);
  assert.equal(m.gulv, 10);
  assert.equal(m.tak, 8);
  // Samme kandidat på det LETTE settet gir helt andre råtall...
  const m2 = mål({
    navn: "test",
    stillinger: lette,
    holdout: true,
    retning: "lavereErBedre",
    kandidat: (s) => s * 0.9,
    gulv: (s) => s * 1.0,
    tak: (s) => s * 0.8,
  });
  assert.equal(m2.verdi, 0.9);
  // ...men SAMME framdrift, fordi referansene fulgte med.
  assert.ok(Math.abs(framdrift(m) - framdrift(m2)) < 1e-12);
});

test("framdrift: 0 er gulvet, 1 er taket, negativt er under gulvet", () => {
  const lag = (verdi: number) =>
    mål({
      navn: "x",
      stillinger: [1],
      holdout: true,
      retning: "lavereErBedre",
      kandidat: () => verdi,
      gulv: () => 1.0,
      tak: () => 0.8,
    });
  assert.ok(Math.abs(framdrift(lag(1.0))) < 1e-12);
  assert.ok(Math.abs(framdrift(lag(0.8)) - 1) < 1e-12);
  // Alle fire trente NEAT-genom lå her: over gulvet i anger = verre enn tilfeldig.
  assert.ok(framdrift(lag(1.1)) < 0);
  assert.equal(overGulvet(lag(1.1)), false);
  assert.equal(overGulvet(lag(0.9)), true);
  assert.equal(slaarTaket(lag(0.79)), true);
  assert.equal(slaarTaket(lag(0.81)), false);
});

test("en måling uten stillinger kan ikke lages", () => {
  assert.throws(() =>
    mål({
      navn: "tom",
      stillinger: [],
      holdout: true,
      retning: "lavereErBedre",
      kandidat: () => 0,
      gulv: () => 0,
      tak: () => 0,
    }),
  );
});

test("beskriv flagger når kandidaten er under gulvet", () => {
  const m = mål({
    navn: "d6",
    stillinger: [1],
    holdout: true,
    retning: "lavereErBedre",
    kandidat: () => 1.1446,
    gulv: () => 1.0354,
    tak: () => 0.8179,
  });
  assert.ok(beskriv(m).includes("UNDER GULVET"));
});

// --- Godkjenningsporten ----------------------------------------------------

test("upaalitelig referanse gir UGYLDIG, ikke avvist", () => {
  // Dette er den faktiske situasjonen fra 25. juli: poeng korrelerte -0,084
  // med seg selv. Første versjon av koden trykket «henger sammen» fordi
  // NaN-testen falt til else-grenen.
  const r = prøvPorten({
    fasit: [1, 2, 3, 4, 5, 6],
    referanseA: [3, 1, 5, 2, 6, 4],
    referanseB: [4, 6, 2, 5, 1, 3],
    sammeRetning: true,
  });
  assert.equal(r.dom, "ugyldig");
  assert.ok(Number.isNaN(r.korrigert), "korrigert skal ikke late som den finnes");
  assert.ok(r.begrunnelse.includes("hverken for eller mot"));
});

test("paalitelig referanse som fasiten foelger gir GODKJENT", () => {
  const fasit = [1, 2, 3, 4, 5, 6, 7, 8];
  const r = prøvPorten({
    fasit,
    referanseA: [1, 2, 3, 4, 5, 6, 7, 8],
    referanseB: [1, 2, 3, 5, 4, 6, 7, 8],
    sammeRetning: true,
  });
  assert.equal(r.dom, "godkjent");
  assert.ok(r.korrigert > 0.9);
});

test("paalitelig referanse som fasiten IKKE foelger gir AVVIST", () => {
  const r = prøvPorten({
    fasit: [1, 2, 3, 4, 5, 6, 7, 8],
    referanseA: [3, 7, 1, 8, 2, 6, 4, 5],
    referanseB: [3, 7, 1, 8, 2, 6, 5, 4],
    sammeRetning: true,
  });
  assert.equal(r.dom, "avvist");
});

test("motsatt fortegn avvises eksplisitt", () => {
  const r = prøvPorten({
    fasit: [1, 2, 3, 4, 5, 6, 7, 8],
    referanseA: [8, 7, 6, 5, 4, 3, 2, 1],
    referanseB: [8, 7, 6, 5, 4, 3, 1, 2],
    sammeRetning: true,
  });
  assert.equal(r.dom, "avvist");
  assert.ok(r.begrunnelse.includes("MOTSATT"));
});

test("spearman: kjente verdier", () => {
  assert.ok(Math.abs(spearman([1, 2, 3, 4], [1, 2, 3, 4]) - 1) < 1e-12);
  assert.ok(Math.abs(spearman([1, 2, 3, 4], [4, 3, 2, 1]) + 1) < 1e-12);
});
