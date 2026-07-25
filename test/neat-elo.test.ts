import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  andelerFraPoeng,
  ETABLERT_ETTER,
  forventet,
  K_ETABLERT,
  K_NY,
  nyRating,
  oppdaterBord,
  START_RATING,
} from "../src/neat/elo.ts";

test("forventet score faller tilbake til klassisk Elo ved to spillere", () => {
  assert.equal(forventet(1500, [1500]), 0.5);
  assert.ok(forventet(1700, [1500]) > 0.75, "200 poengs forsprang gir ~0,76");
  assert.ok(forventet(1300, [1500]) < 0.25);
});

test("likt bord flytter ingen rating", () => {
  const r = [nyRating(), nyRating(), nyRating(), nyRating()];
  oppdaterBord(r, [0.25, 0.25, 0.25, 0.25]);
  for (const x of r) assert.ok(Math.abs(x.rating - START_RATING) < 1e-9, `flyttet til ${x.rating}`);
});

test("oppdateringen er uavhengig av rekkefoelgen paa spillerne", () => {
  // Regnes en spiller mot allerede oppdaterte ratinger, ville seteplassering
  // paavirket resultatet. Alle oppdateringer skal bruke ratingene FOER bordet.
  const a = [nyRating(), nyRating(), nyRating(), nyRating()];
  a[0]!.rating = 1600;
  const b = a.map((x) => ({ ...x }));
  oppdaterBord(a, [0.5, 0.2, 0.2, 0.1]);
  // Samme bord, men motsatt rekkefoelge
  const bRev = [...b].reverse();
  oppdaterBord(bRev, [0.1, 0.2, 0.2, 0.5]);
  const bTilbake = [...bRev].reverse();
  for (let i = 0; i < 4; i++) {
    assert.ok(
      Math.abs(a[i]!.rating - bTilbake[i]!.rating) < 1e-9,
      `spiller ${i}: ${a[i]!.rating} mot ${bTilbake[i]!.rating}`,
    );
  }
});

test("aa slaa en STERK motstander gir mer rating enn aa slaa en svak", () => {
  const motSterk = [nyRating(), nyRating(), nyRating(), nyRating()];
  motSterk[1]!.rating = 1900;
  motSterk[2]!.rating = 1900;
  motSterk[3]!.rating = 1900;
  const motSvak = [nyRating(), nyRating(), nyRating(), nyRating()];
  motSvak[1]!.rating = 1100;
  motSvak[2]!.rating = 1100;
  motSvak[3]!.rating = 1100;
  const seier = [0.7, 0.1, 0.1, 0.1];
  oppdaterBord(motSterk, seier);
  oppdaterBord(motSvak, seier);
  assert.ok(
    motSterk[0]!.rating > motSvak[0]!.rating,
    `mot sterke: ${motSterk[0]!.rating.toFixed(1)}, mot svake: ${motSvak[0]!.rating.toFixed(1)}`,
  );
});

test("barnet arver forelderens NIVAA, men ikke dens sikkerhet", () => {
  const forelder = nyRating();
  forelder.rating = 1750;
  forelder.kamper = 40;
  const barn = nyRating(forelder);
  assert.equal(barn.rating, 1750, "nivaaet arves - ellers mistes all historikk hver generasjon");
  assert.equal(barn.kamper, 0, "sikkerheten arves IKKE - en daarlig mutasjon maa kunne straffes raskt");

  // Og det gir barnet hoey K de foerste kampene.
  const r = [barn, nyRating(), nyRating(), nyRating()];
  const foer = barn.rating;
  oppdaterBord(r, [0.7, 0.1, 0.1, 0.1]);
  const nyttUtslag = Math.abs(barn.rating - foer);
  barn.kamper = ETABLERT_ETTER;
  const foer2 = barn.rating;
  oppdaterBord([barn, nyRating(), nyRating(), nyRating()], [0.7, 0.1, 0.1, 0.1]);
  const etablertUtslag = Math.abs(barn.rating - foer2);
  assert.ok(
    nyttUtslag > etablertUtslag,
    `ny K ${K_NY} ga ${nyttUtslag.toFixed(1)}, etablert K ${K_ETABLERT} ga ${etablertUtslag.toFixed(1)}`,
  );
});

test("andelerFraPoeng: summerer til 1, likt bord deles likt, monoton", () => {
  const like = andelerFraPoeng([50, 50, 50, 50]);
  for (const a of like) assert.ok(Math.abs(a - 0.25) < 1e-12);

  const ulike = andelerFraPoeng([100, 20, -30, 10]);
  assert.ok(Math.abs(ulike.reduce((a, b) => a + b, 0) - 1) < 1e-12, "summerer ikke til 1");
  // poeng 100 > 20 > 10 > -30, altsaa indeks 0 > 1 > 3 > 2.
  assert.ok(ulike[0]! > ulike[1]! && ulike[1]! > ulike[3]! && ulike[3]! > ulike[2]!, "ikke monoton");
  // Negative poeng maa haandteres: differanser kan vaere negative.
  assert.ok(ulike.every((a) => a >= 0), "negativ andel");
});
