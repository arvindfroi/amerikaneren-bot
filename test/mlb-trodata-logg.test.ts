/**
 * TROSDATA FRA KAMPLOGGER (R2) — paringen mellom visning og etikett må holde.
 *
 * `examples/mlb-trodata-logg.ts` fanger visningen i beslutteren og henter
 * etiketten (`troFasit`) fra radene løkka lager, og de to pares på indeks. En
 * forskyvning med én ville gitt et datasett som SER riktig ut — alle tall
 * endelige, alle klasser lovlige — men der hver etikett hører til naboens
 * stilling. Trosnettet ville da lært støy, og K8 ville falt uten at noe krasjet.
 *
 * Prøven er derfor ikke «kommer det rader?», men «er kortene på egen hånd i
 * VISNINGEN nøyaktig de kortene etiketten kaller sett (klasse 0), og er setet det
 * samme?». Det kan bare stemme når paringen er riktig.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lagRng } from "../src/kort.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { kamploggFraLinje, kamploggTilLinje, spillKamp, tilfeldigNett } from "../src/mlb/selvspill.ts";
import { MLB_TRO_INN } from "../src/mlb/trotrekk.ts";
import { troRaderFraLogg } from "../examples/mlb-trodata-logg.ts";

const kampLogg = (frø: number) =>
  spillKamp({
    frø,
    målPoeng: 30,
    seter: [0, 1, 2, 3].map((i) => ({ navn: `n${i}`, nett: tilfeldigNett(lagRng(frø + i)), temperatur: 1 })),
    maksRunder: 12,
    samleTrekk: false,
  }).logg;

test("trosdata fra logg: visningens egen hånd er etikettens klasse 0, og setet stemmer", () => {
  let rader = 0;
  for (const frø of [7_320_011, 7_320_022, 7_320_033]) {
    const logg = kamploggFraLinje(kamploggTilLinje(kampLogg(frø)));
    const r = troRaderFraLogg(logg, { sjanse: 1, rng: () => 0, maksRunder: 12 });
    assert.ok(r.length > 20, `frø ${frø}: bare ${r.length} rader`);
    for (const rad of r) {
      assert.equal(rad.t.length, MLB_TRO_INN);
      assert.equal(rad.sete, rad.visning.deg, "raden og visningen er ulike seter");
      for (const k of rad.visning.dinHånd) {
        assert.equal(rad.f[kortIndeks(k)], 0, `frø ${frø}: et kort på egen hånd er ikke «sett» i etiketten`);
      }
      let ukjente = 0;
      for (let i = 0; i < 52; i++) if (rad.f[i]! > 0) ukjente++;
      const kjente = rad.visning.dinHånd.length;
      assert.ok(ukjente > 0 && ukjente + kjente <= 52);
    }
    rader += r.length;
  }
  assert.ok(rader > 100);
});

test("trosdata fra logg: en logg som ikke hører til kampen KASTER i stedet for å gi feil etiketter", () => {
  const logg = kampLogg(7_320_044);
  // Bytt ut en kode midt i kampen med en annen lovlig-utseende kode.
  const koder = [...logg.koder];
  const i = Math.floor(koder.length / 2);
  koder[i] = koder[i] === 0 ? 1 : 0;
  const ødelagt = { ...logg, koder };
  assert.throws(() => troRaderFraLogg(ødelagt, { sjanse: 1, rng: () => 0, maksRunder: 12 }));
});

test("trosdata fra logg: sjansen velger et utvalg, deterministisk av rng", () => {
  const logg = kampLogg(7_320_055);
  const alle = troRaderFraLogg(logg, { sjanse: 1, rng: () => 0, maksRunder: 12 }).length;
  const a = troRaderFraLogg(logg, { sjanse: 0.3, rng: lagRng(5), maksRunder: 12 });
  const b = troRaderFraLogg(logg, { sjanse: 0.3, rng: lagRng(5), maksRunder: 12 });
  assert.ok(a.length > 0 && a.length < alle, `utvalget ${a.length} av ${alle}`);
  assert.deepEqual(a.map((x) => [x.sete, x.stikk]), b.map((x) => [x.sete, x.stikk]));
});
