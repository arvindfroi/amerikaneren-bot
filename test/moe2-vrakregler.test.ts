import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  fargeAv,
  fargelengder,
  håndprofil,
  håndtrekk,
  valørAv,
  vrakKorteste,
  vrakKortesteBevarAK,
  vrakKortesteBevarEss,
  vrakRenonsUtenEss,
  vrakScore,
  vrakVeid,
} from "../src/moe2/vrakregler.ts";
import { ols, r2Ute, sentrerPerGruppe, løsLikninger } from "../src/moe2/regresjon.ts";

/**
 * Kortindekser bygges her på ÉN måte: farge × 13 + valør − 2. Testene skriver
 * hendene sine gjennom denne funksjonen og ikke som rå tall, for da er en
 * feillest indeks en feil i `kort`, ikke en usynlig forskjell mellom testens
 * koding og modulens.
 */
const kort = (farge: number, valør: number): number => farge * 13 + valør - 2;

test("valørAv og fargeAv er invers av kortkodingen", () => {
  for (let f = 0; f < 4; f++) {
    for (let v = 2; v <= 14; v++) {
      assert.equal(fargeAv(kort(f, v)), f);
      assert.equal(valørAv(kort(f, v)), v);
    }
  }
});

test("håndtrekk holder ESS og KONGE i hvert sitt felt", () => {
  // Hånd: ess og konge i farge 0, to lave i farge 1.
  const hånd = [kort(0, 14), kort(0, 13), kort(1, 3), kort(1, 4)];
  const begge = håndtrekk(hånd, [kort(0, 14), kort(0, 13)]);
  assert.equal(begge.vraketEss, 1);
  assert.equal(begge.vraketKonge, 1);
  // Renonsen skal telles på fargen som ble TOM, ikke på antall kastede kort.
  assert.equal(begge.fargerIgjen, 1);
  assert.equal(begge.renonser, 3);

  const bareKonge = håndtrekk(hånd, [kort(0, 13)]);
  assert.equal(bareKonge.vraketEss, 0);
  assert.equal(bareKonge.vraketKonge, 1);
  assert.equal(bareKonge.fargerIgjen, 2);
});

test("korte sterke farger krever ≤ 3 kort OG en honnør", () => {
  // Farge 0: A + tre små = fire kort, altså IKKE kort. Farge 1: K + én = kort.
  const hånd = [
    kort(0, 14), kort(0, 2), kort(0, 3), kort(0, 4),
    kort(1, 13), kort(1, 5),
  ];
  const t = håndtrekk(hånd, []);
  assert.equal(t.korteSterke, 1);
  assert.equal(t.harKortSterk, 1);
});

test("«aldri ess» kaster konge, «aldri A/K» kaster ingen av dem", () => {
  // Farge 0 er kortest (to kort: ess og konge). Fritt vrak skal ta dem begge.
  const hånd = [
    kort(0, 14), kort(0, 13),
    kort(1, 2), kort(1, 3), kort(1, 4), kort(1, 5), kort(1, 6),
  ];
  const fritt = håndtrekk(hånd, vrakKorteste(hånd, 2));
  assert.equal(fritt.vraketEss, 1);
  assert.equal(fritt.vraketKonge, 1);

  const utenEss = håndtrekk(hånd, vrakKortesteBevarEss(hånd, 2));
  assert.equal(utenEss.vraketEss, 0, "esset skal aldri kastes av denne regelen");
  assert.equal(utenEss.vraketKonge, 1, "kongen SKAL kunne kastes – det er hele skillet");

  const utenAK = håndtrekk(hånd, vrakKortesteBevarAK(hånd, 2));
  assert.equal(utenAK.vraketEss, 0);
  assert.equal(utenAK.vraketKonge, 0);
});

test("vrakKorteste tømmer den korteste fargen først", () => {
  const hånd = [
    kort(0, 9), kort(0, 10),
    kort(1, 2), kort(1, 3), kort(1, 4), kort(1, 5),
  ];
  const vrak = vrakKorteste(hånd, 2);
  assert.deepEqual([...vrak].sort((a, b) => a - b), [kort(0, 9), kort(0, 10)]);
  assert.equal(håndtrekk(hånd, vrak).fargerIgjen, 1);
});

test("vrakRenonsUtenEss tømmer fargen – men ikke når esset står der", () => {
  const utenEss = [
    kort(0, 9), kort(0, 10),
    kort(1, 2), kort(1, 3), kort(1, 4), kort(1, 5), kort(1, 6),
  ];
  assert.equal(håndtrekk(utenEss, vrakRenonsUtenEss(utenEss, 3)).fargerIgjen, 1);

  // Samme form, men esset ligger i den korte fargen: da skal den IKKE tømmes.
  const medEss = [
    kort(0, 14), kort(0, 10),
    kort(1, 2), kort(1, 3), kort(1, 4), kort(1, 5), kort(1, 6),
  ];
  const t = håndtrekk(medEss, vrakRenonsUtenEss(medEss, 3));
  assert.equal(t.vraketEss, 0);
  assert.equal(t.fargerIgjen, 2, "fargen med esset skal stå igjen");
});

test("alle reglene kaster nøyaktig `antall` ulike kort fra hånden", () => {
  const hånd = [
    kort(0, 14), kort(0, 13), kort(0, 7),
    kort(1, 2), kort(1, 3), kort(1, 12),
    kort(2, 5), kort(2, 6), kort(2, 9), kort(2, 11),
    kort(3, 4), kort(3, 8),
  ];
  const regler = [vrakKorteste, vrakKortesteBevarEss, vrakKortesteBevarAK, vrakRenonsUtenEss];
  for (const regel of regler) {
    const v = regel(hånd, 4);
    assert.equal(v.length, 4);
    assert.equal(new Set(v).size, 4, "ingen kort kan kastes to ganger");
    for (const k of v) assert.ok(hånd.includes(k), "kan bare kaste kort man har");
  }
});

test("vrakVeid maksimerer scoren den får oppgitt", () => {
  const hånd = [
    kort(0, 14), kort(0, 5),
    kort(1, 2), kort(1, 3), kort(1, 4), kort(1, 6), kort(1, 7),
  ];
  // Vekter som bare bryr seg om renonser: da SKAL den tømme farge 0, selv om
  // det koster esset. Regelen har ikke lov til å være klokere enn vektene.
  const vekter = {
    renons: 10,
    lengsteFarge: 0,
    korteSterke: 0,
    vraketValør: 0,
    vraketEss: 0,
    vraketKonge: 0,
  };
  const v = vrakVeid(hånd, 2, vekter);
  assert.deepEqual([...v].sort((a, b) => a - b), [kort(0, 5), kort(0, 14)]);
  assert.equal(vrakScore(håndtrekk(hånd, v), vekter), 30);

  // Snu esstapet opp, og valget skal snu.
  const strengt = { ...vekter, vraketEss: -100 };
  assert.equal(håndtrekk(hånd, vrakVeid(hånd, 2, strengt)).vraketEss, 0);
});

test("håndprofil skiller ess fra konger og finner «A K i kløver»", () => {
  const hånd = [
    kort(0, 14), kort(0, 13), // A K i en tokortsfarge
    kort(1, 2), kort(1, 3), kort(1, 4), kort(1, 5), kort(1, 6),
  ];
  const p = håndprofil(hånd);
  assert.equal(p.lengste, 5);
  assert.equal(p.nestLengste, 2);
  assert.equal(p.fargerBrukt, 2);
  assert.equal(p.ess, 1);
  assert.equal(p.konger, 1);
  assert.equal(p.korteAK, 1);
  assert.equal(p.sideAK, 2, "begge ligger utenfor den lengste fargen");
  assert.equal(p.honnør, 7);
  assert.equal(p.trumfSerie, 0, "den lengste fargen har verken ess eller serie");
});

test("fargelengder summerer til håndens størrelse", () => {
  const hånd = [kort(0, 2), kort(0, 3), kort(2, 9), kort(3, 14)];
  assert.deepEqual(fargelengder(hånd), [2, 0, 1, 1]);
});

// --- Regresjonen ------------------------------------------------------------

test("løsLikninger løser et system med kjent svar", () => {
  const x = løsLikninger([[2, 1], [1, 3]], [5, 10]);
  assert.ok(x !== null);
  assert.ok(Math.abs(x![0]! - 1) < 1e-9);
  assert.ok(Math.abs(x![1]! - 3) < 1e-9);
});

test("løsLikninger returnerer null på en singulær matrise", () => {
  assert.equal(løsLikninger([[1, 2], [2, 4]], [1, 2]), null);
});

test("ols gjenfinner koeffisientene i data uten støy", () => {
  // y = 2 + 3*x1 − 1*x2, eksakt.
  const X: number[][] = [];
  const y: number[] = [];
  for (let a = 0; a < 6; a++) {
    for (let b = 0; b < 6; b++) {
      X.push([a, b]);
      y.push(2 + 3 * a - b);
    }
  }
  const t = ols(X, y);
  assert.ok(t !== null);
  assert.ok(Math.abs(t!.beta[0]! - 3) < 1e-5, `fikk ${t!.beta[0]}`);
  assert.ok(Math.abs(t!.beta[1]! + 1) < 1e-5, `fikk ${t!.beta[1]}`);
  assert.ok(Math.abs(t!.konstant - 2) < 1e-5);
  assert.ok(t!.r2 > 0.9999);
  assert.ok(r2Ute(t!, X, y) > 0.9999);
});

test("giv-faste effekter fjerner et gruppenivå regresjonen ellers ville tatt for en effekt", () => {
  // Hver gruppe har sitt eget nivå, og nivået er KORRELERT med x. Den sanne
  // effekten innenfor en gruppe er +1; uten sentrering måles den til ~+11.
  const gruppe: number[] = [];
  const X: number[][] = [];
  const y: number[] = [];
  for (let g = 0; g < 40; g++) {
    for (const x of [0, 1, 2]) {
      gruppe.push(g);
      X.push([x + g]);
      y.push(10 * g + x);
    }
  }
  const rå = ols(X, y);
  assert.ok(rå !== null && rå.beta[0]! > 9, `uten faste effekter: ${rå?.beta[0]}`);

  const s = sentrerPerGruppe(gruppe, X, y);
  const fast = ols(s.X, s.y, { medKonstant: false });
  assert.ok(fast !== null);
  assert.ok(Math.abs(fast!.beta[0]! - 1) < 1e-4, `med faste effekter: ${fast!.beta[0]}`);
});
