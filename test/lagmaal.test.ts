/**
 * LAGMAALET — at det er skrudd paa naar speken sier det, og at det maaler laget.
 *
 * ARVIND: «forsvar og makker skal ogsaa ha tilgang til alfa mu. jeg tipper
 * forsvar og makker burde bli bedre med det sant?»
 *
 * Prinsippet var riktig og maalingen sa nei, og grunnen laa i MAALET: `standardMål`
 * trekker fra MAKKERENS poeng, saa en makker undervurderer aa hjelpe med en
 * faktor tre. Denne fila vokter begge halvdeler av rettelsen.
 *
 * DEN FOERSTE er ikke pedanteri. «§-feilen» i dette prosjektet - tretten ganger
 * naa - er at det maalte og det bygde ikke var samme ting. En amu-spek der «L»
 * blir staaende igjen i flaggstrengen ville gitt `Number("12L")` = NaN, og en
 * syv timers kjoering som maalte noe annet enn den sa.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lagIndre } from "../src/moe2/agentspek.ts";
import { lagMål, standardMål } from "../src/moe2/sdkort.ts";
import type { GameState } from "../src/motor.ts";

const STAKK = ":vr:e1-modell/vrakrang.bin:telrd:vakt:abmpf:e1:e1-modell/d7alle.bin";
const opt = (spek: string): { lagmål?: boolean; verdener?: number; vetoMargin?: number } =>
  (lagIndre(spek) as unknown as { o: { lagmål?: boolean; verdener?: number; vetoMargin?: number } }).o;

test("«L» blir konsumert av parseren og slaar paa lagmaalet", () => {
  const med = opt(`amu:alle:12k16sm1e0.25r1.5v0.5L${STAKK}`);
  assert.equal(med.lagmål, true, "«L» skal slaa paa lagmaalet");
  // Blir «L» staaende igjen, blir `Number("12L")` NaN og hele kjoeringen maaler
  // noe annet enn speken sier.
  assert.equal(med.verdener, 12, "verdener skal fortsatt parses som 12");
  assert.equal(med.vetoMargin, 0.5, "«v» skal ikke forstyrres av «L»");
});

test("uten «L» er lagmaalet av - null-punktet er bevart", () => {
  const uten = opt(`amu:alle:12k16sm1e0.25r1.5v0.5${STAKK}`);
  assert.notEqual(uten.lagmål, true);
  assert.equal(uten.verdener, 12);
  assert.equal(uten.vetoMargin, 0.5);
});

test("lagmaalet ser laget der standardmaalet ser tre motstandere", () => {
  // Kontrakt klart: foerer(0) +18, makker(2) +9, forsvarerne 0.
  const s = {
    budvinner: 0, makker: 2, antallSpillere: 4, totalPoeng: [18, 0, 9, 0],
  } as unknown as GameState;

  // KJERNEN: makkeren og foereren er paa samme lag og skal se samme utfall.
  assert.equal(lagMål(s, 2), lagMål(s, 0));
  // Standardmaalet gjoer ikke det - og avviket er stort nok til aa snu valg.
  assert.ok(standardMål(s, 2) < standardMål(s, 0) / 4,
    "standardmaalet skal undervurdere makkerens andel kraftig (det er feilen)");

  // Forsvarerne skal se samme tall som hverandre, med motsatt fortegn av budlaget.
  assert.equal(lagMål(s, 1), lagMål(s, 3));
  assert.equal(lagMål(s, 1), -lagMål(s, 0));
});

test("uten budvinner faller lagmaalet tilbake paa standardmaalet", () => {
  // Under budrunden finnes ikke lagene enda. Da skal de to vaere identiske,
  // ikke «nesten like» - et lag paa null spillere maa aldri dele paa null.
  const s = { budvinner: null, makker: null, antallSpillere: 4, totalPoeng: [3, 1, 4, 1] } as unknown as GameState;
  for (let p = 0; p < 4; p++) assert.equal(lagMål(s, p), standardMål(s, p));
});
