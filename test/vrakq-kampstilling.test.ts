import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/motor.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { Vrakrangerer } from "../src/moe2/vrakrang.ts";
import { vraktrekk, vraktrekkK, VRAK_DIM, VRAK_DIM_K } from "../src/moe2/vraktrekk.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { nettFraBytes, type NevroNett } from "../src/nevro/nett.ts";

/**
 * VRAKQ V2 (11. sep, K5): vraknettet kan lese kampstillingen.
 *
 * Tre ting låses: et 24-nett velger nøyaktig som før, et 24-nett utvidet med nullkolonner til
 * 27 velger likt (så v2 kan starte fra dagens nett), og en koblet kampstillingskolonne endrer
 * valget – ellers når inngangen ikke fram, og en omtrening ville målt null av feil grunn.
 */

const VRAKFIL = "e1-modell/vrakrang.bin";

function utvid(nett: NevroNett, ekstra: number): NevroNett {
  const [første, ...resten] = nett.lag;
  const inn = første!.inn + ekstra;
  const vekter = new Float32Array(første!.ut * inn);
  for (let r = 0; r < første!.ut; r++) vekter.set(første!.vekter.subarray(r * første!.inn, (r + 1) * første!.inn), r * inn);
  return { lag: [{ inn, ut: første!.ut, vekter, bias: første!.bias.slice() }, ...resten] };
}

/** VRAK-stillinger fra kamper til 100 der poengtavla er i bevegelse. */
function vrakstillinger(antall: number): GameState[] {
  const ut: GameState[] = [];
  const nevro = new NevroAgent();
  for (let f = 0; ut.length < antall && f < 20; f++) {
    let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, 8_700_000 + f);
    let vakt = 0;
    while (s.fase !== "FERDIG" && vakt++ < 20_000 && ut.length < antall) {
      if (s.fase === "RUNDE_SLUTT") {
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      if (s.fase === "VRAK" && s.rundeNr >= 2) ut.push(s);
      s = utfør(s, nevro.velgHandling(s)).state;
    }
  }
  return ut;
}

const velg = (vr: Vrakrangerer, s: GameState): string => {
  const h: Handling = vr.velgHandling(s);
  return h.type === "VRAK" ? h.kort.map((k) => `${k.farge}${k.verdi}`).sort().join(",") : h.type;
};

test("breddene og trekkene: 27 = 24 + kampstillingen", () => {
  assert.equal(VRAK_DIM_K, VRAK_DIM + 3);
  for (const s of vrakstillinger(5)) {
    const sete = s.budvinner!;
    const hånd = s.hender[sete]!;
    const vrak = hånd.slice(0, s.giving.talong);
    const a = vraktrekk(s, sete, hånd, vrak, "S");
    const b = vraktrekkK(s, sete, hånd, vrak, "S");
    assert.deepEqual([...b.subarray(0, VRAK_DIM)], [...a]);
    assert.equal(b[VRAK_DIM], Math.fround((s.totalPoeng[sete] ?? 0) / 100));
    assert.equal(b[VRAK_DIM + 2], Math.fround(Math.min(1, s.rundeNr / 20)));
  }
});

test("nullpunktet: et 24-nett utvidet med nullkolonner til 27 velger nøyaktig likt", () => {
  const rå = nettFraBytes(readFileSync(VRAKFIL))[0]!;
  const innerst = () => lagIndre("vakt:abmp:e1:e1-modell/d7alle.bin");
  const stillinger = vrakstillinger(12);
  assert.ok(stillinger.length >= 8);
  for (const s of stillinger) {
    const gammel = new Vrakrangerer(innerst(), rå);
    const ny = new Vrakrangerer(innerst(), utvid(rå, 3));
    assert.equal(velg(ny, s), velg(gammel, s));
  }
});

test("fella: en koblet kampstillingskolonne endrer vraket i minst én stilling", () => {
  const rå = nettFraBytes(readFileSync(VRAKFIL))[0]!;
  const plantet = utvid(rå, 3);
  const første = plantet.lag[0]!;
  // «Rundenummeret» sterkt koblet til hver skjult enhet, med vekslende fortegn.
  for (let r = 0; r < første.ut; r++) første.vekter[r * første.inn + VRAK_DIM + 2] = r % 2 === 0 ? 6 : -6;
  let endret = 0;
  for (const s of vrakstillinger(20)) {
    const a = velg(new Vrakrangerer(lagIndre("vakt:abmp:e1:e1-modell/d7alle.bin"), rå), s);
    const b = velg(new Vrakrangerer(lagIndre("vakt:abmp:e1:e1-modell/d7alle.bin"), plantet), s);
    if (a !== b) endret++;
  }
  assert.ok(endret > 0, "en koblet kampstillingskolonne endret ingen vrak – inngangen når ikke fram");
});

test("andre bredder avvises", () => {
  const rå = nettFraBytes(readFileSync(VRAKFIL))[0]!;
  assert.throws(() => new Vrakrangerer(lagIndre("vakt:abmp:e1:e1-modell/d7alle.bin"), utvid(rå, 5)), /24.*27/);
});
