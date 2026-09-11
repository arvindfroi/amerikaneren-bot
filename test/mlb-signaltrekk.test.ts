import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lagRng } from "../src/kort.ts";
import { opprettSpill, spillerVisning, utfør, type GameState } from "../src/motor.ts";
import { MLB_TRO_SIGNAL, SIGNALINNGANG as S, signalTrekk } from "../src/mlb/signaltrekk.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { NevroAgent } from "../src/nevro/agent.ts";

/**
 * SIGNALBLOKKEN (K8 kanal 5 og 2). Tre ting låses:
 *
 *  1. K2: blokken er BIT-IDENTISK når bare skjulte kort byttes. Den skal bare lese det
 *     alle ved bordet så.
 *  2. Tellingene stemmer med stikkene: hvert stikk har nøyaktig ett utspill, og hvert
 *     annet kort er enten fulgt (under/over, eller fulgt etter en trumf), kastet eller
 *     trumfet.
 *  3. Rotasjonen: samme hendelse havner i riktig relativt sete sett fra hvert sete.
 */

const nevro = new NevroAgent();

function stillinger(antall: number): GameState[] {
  const ut: GameState[] = [];
  for (let f = 0; ut.length < antall && f < 60; f++) {
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 8_300_000 + f);
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
      if (s.fase === "SPILL" && s.iTur !== null && s.stikkSpilt >= 3 && ut.length < antall && s.stikkSpilt % 3 === 0) {
        ut.push(s);
      }
      s = utfør(s, nevro.velgHandling(s)).state;
    }
  }
  return ut;
}

test("K2: signalblokken er bit-identisk når bare de skjulte kortene byttes", () => {
  let sjekket = 0;
  for (const s of stillinger(12)) {
    const sete = s.iTur!;
    const fasit = signalTrekk(spillerVisning(s, sete));
    assert.equal(fasit.length, MLB_TRO_SIGNAL);
    for (const hender of trekkVerdener(s, sete, 3, lagRng(4242 + sjekket), undefined, undefined, 4)) {
      const annen = signalTrekk(spillerVisning(medVerden(s, hender, sete), sete));
      assert.deepEqual([...annen], [...fasit], "signalblokken endret seg da bare skjulte kort ble byttet");
      sjekket++;
    }
  }
  assert.ok(sjekket >= 12, `for få verdenssammenlikninger (${sjekket})`);
});

test("tellingene stemmer med stikkene", () => {
  for (const s of stillinger(10)) {
    const sete = s.iTur!;
    const vis = spillerVisning(s, sete);
    const v = signalTrekk(vis);
    let ledet = 0;
    let andre = 0;
    for (let c = 0; c < 16; c++) {
      const b = c * S.PER_CELLE;
      ledet += v[b + S.LEDET]! * 4;
      andre += (v[b + S.FULGTE_UNDER]! + v[b + S.FULGTE_OVER]! + v[b + S.KASTET]!) * 4;
      assert.ok(v[b + S.TAK]! >= 0 && v[b + S.TAK]! <= 1);
      assert.ok(v[b + S.LEDHØYDE]! >= 0 && v[b + S.LEDHØYDE]! <= 1);
    }
    for (let r = 0; r < 4; r++) andre += v[S.TRUMFET + r]! * 4;
    const stikk = vis.historikk.length + (vis.bord.length > 0 ? 1 : 0);
    const kort = vis.historikk.reduce((a, st) => a + st.kort.length, 0) + vis.bord.length;
    assert.ok(Math.abs(ledet - stikk) < 1e-4, `utspill ${ledet} mot ${stikk} stikk`);
    // Å følge farge etter at noen har trumfet teller verken under eller over.
    assert.ok(andre <= kort - stikk + 1e-4, `${andre} ikke-utspill mot ${kort - stikk} kort`);
    let trumfFarger = 0;
    for (let f = 0; f < 4; f++) trumfFarger += v[S.BUDVINNER + f * 4]!;
    assert.equal(trumfFarger, vis.trumf === null ? 0 : 1);
  }
});

test("samme hendelse havner i riktig relativt sete fra hvert sete", () => {
  for (const s of stillinger(6)) {
    const blokker = [0, 1, 2, 3].map((sete) => signalTrekk(spillerVisning(s, sete)));
    // Utspillet i første stikk: sete a sin celle for utspilleren er rotert med (a − b).
    const første = s.historikk[0]!.kort[0]!;
    const f = ["S", "H", "R", "K"].indexOf(første.kort.farge);
    for (let sete = 0; sete < 4; sete++) {
      const r = (((første.spiller - sete) % 4) + 4) % 4;
      assert.ok(blokker[sete]![(r * 4 + f) * S.PER_CELLE + S.LEDET]! > 0, `sete ${sete} så ikke utspillet i rel sete ${r}`);
    }
    // Budvinnerblokken er ikke relativ: lik for alle.
    for (let sete = 1; sete < 4; sete++) {
      assert.deepEqual([...blokker[sete]!.slice(S.BUDVINNER)], [...blokker[0]!.slice(S.BUDVINNER)]);
    }
  }
});
