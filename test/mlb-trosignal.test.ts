import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { opprettSpill, spillerVisning, utfør, type GameState, type SpillerVisning } from "../src/motor.ts";
import { MLB_TRO_SIGNAL, SIGNALINNGANG } from "../src/mlb/signaltrekk.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import {
  MLB_TRO_INN,
  MLB_TRO_INN_H,
  MLB_TRO_INN_HS,
  MLB_TRO_INN_S,
  troTrekk,
  troTrekkForBredde,
} from "../src/mlb/trotrekk.ts";
import { NevroAgent } from "../src/nevro/agent.ts";
import { nettFraBytes, type NevroNett } from "../src/nevro/nett.ts";

/**
 * SIGNALBLOKKEN I TROHODET (K8 kanal 5 og 2, 11. sep).
 *
 * Samme kontrakt som hukommelsen fikk (`mlb-trohukommelse.test.ts`): blokken ligger
 * BAKERST, et gammelt nett utvidet med nullkolonner gir NØYAKTIG samme tro, og én
 * koblet kolonne endrer den – ellers når blokken ikke fram, og en omtrening ville
 * målt null av en grunn som ikke har med signalene å gjøre.
 */

const TROSTI = fileURLToPath(new URL("../e1-modell/mlb-tro.bin", import.meta.url));

function utvid(nett: NevroNett, ekstra: number): NevroNett {
  const [første, ...resten] = nett.lag;
  const inn = første!.inn + ekstra;
  const vekter = new Float32Array(første!.ut * inn);
  for (let r = 0; r < første!.ut; r++) {
    vekter.set(første!.vekter.subarray(r * første!.inn, (r + 1) * første!.inn), r * inn);
  }
  return { lag: [{ inn, ut: første!.ut, vekter, bias: første!.bias.slice() }, ...resten] };
}

const STILLINGER: { s: GameState; v: SpillerVisning }[] = (() => {
  const nevro = new NevroAgent();
  const ut: { s: GameState; v: SpillerVisning }[] = [];
  for (let f = 0; ut.length < 40 && f < 30; f++) {
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 8_400_000 + f);
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
      if (s.fase === "SPILL" && s.iTur !== null && s.stikkSpilt >= 2 && s.stikkSpilt % 2 === 0) {
        ut.push({ s, v: spillerVisning(s, s.iTur) });
      }
      s = utfør(s, nevro.velgHandling(s)).state;
    }
  }
  return ut;
})();

test("breddene: 660 + 116 og 804 + 116", () => {
  assert.equal(MLB_TRO_SIGNAL, 116);
  assert.equal(MLB_TRO_INN_S, MLB_TRO_INN + MLB_TRO_SIGNAL);
  assert.equal(MLB_TRO_INN_HS, MLB_TRO_INN_H + MLB_TRO_SIGNAL);
  assert.equal(MLB_TRO_INN_S, 776);
  assert.equal(MLB_TRO_INN_HS, 920);
});

test("776-trekkene er 660-trekkene med signalblokken bakerst, og blokken er ikke tom", () => {
  let ikkeTom = 0;
  for (const { s, v } of STILLINGER) {
    const gammel = troTrekk(v, s.giving.antallStikk, 100);
    const ny = troTrekkForBredde(MLB_TRO_INN_S, v, s.giving.antallStikk, 100, null);
    assert.equal(ny.length, MLB_TRO_INN_S);
    assert.deepEqual([...ny.subarray(0, MLB_TRO_INN)], [...gammel]);
    if (ny.subarray(MLB_TRO_INN).some((x, i) => x !== 0 && i % SIGNALINNGANG.PER_CELLE !== SIGNALINNGANG.TAK)) ikkeTom++;
  }
  assert.ok(ikkeTom > 20, `signalblokken var tom i nesten alle stillinger (${ikkeTom})`);
  assert.throws(() => troTrekkForBredde(700, STILLINGER[0]!.v, 12, 100, null), /ingen trekkbredde 700/);
});

test("nullpunktet: et nett utvidet med nullkolonner for signalblokken gir nøyaktig samme tro", () => {
  const rå = nettFraBytes(readFileSync(TROSTI))[0]!;
  const gammel = new MlbTronett(rå);
  const ny = new MlbTronett(utvid(rå, MLB_TRO_SIGNAL));
  assert.equal(gammel.brukerSignal, false);
  assert.equal(ny.brukerSignal, true);
  assert.equal(ny.brukerHukommelse, gammel.brukerHukommelse, "signalblokken må ikke endre om hukommelsen leses");
  for (const { s, v } of STILLINGER.slice(0, 20)) {
    const pg = gammel.fordeling(gammel.trekkFor(v, s.giving.antallStikk, 100, null));
    const pn = ny.fordeling(ny.trekkFor(v, s.giving.antallStikk, 100, null));
    assert.deepEqual(pn, pg);
  }
});

test("fella: én koblet signalkolonne endrer troen", () => {
  const rå = nettFraBytes(readFileSync(TROSTI))[0]!;
  const gammel = new MlbTronett(rå);
  const plantet = utvid(rå, MLB_TRO_SIGNAL);
  const første = plantet.lag[0]!;
  // LEDET for relativt sete 1 i spar: ikke null når venstre nabo har spilt ut spar.
  const kolonne = rå.lag[0]!.inn + (1 * 4 + 0) * SIGNALINNGANG.PER_CELLE + SIGNALINNGANG.LEDET;
  for (let r = 0; r < første.ut; r++) første.vekter[r * første.inn + kolonne] = 3;
  const ny = new MlbTronett(plantet);
  let endret = 0;
  for (const { s, v } of STILLINGER) {
    const pg = gammel.fordeling(gammel.trekkFor(v, s.giving.antallStikk, 100, null));
    const pn = ny.fordeling(ny.trekkFor(v, s.giving.antallStikk, 100, null));
    if (JSON.stringify(pg) !== JSON.stringify(pn)) endret++;
  }
  assert.ok(endret > 0, "en koblet signalkolonne endret ingen tro – blokken når ikke fram");
});

test("en bredde utenfor 660/804/776/920 avvises", () => {
  const rå = nettFraBytes(readFileSync(TROSTI))[0]!;
  assert.throws(() => new MlbTronett(utvid(rå, 40)), /660.*804.*776.*920/);
});
