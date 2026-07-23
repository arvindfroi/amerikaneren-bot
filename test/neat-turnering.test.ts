import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lagRng } from "../src/kort.ts";
import { Innovasjonsbok, nyttGenom } from "../src/neat/genom.ts";
import { NeatAgent } from "../src/neat/agent.ts";
import { ANTALL_INN, ANTALL_UT } from "../src/neat/trekk.ts";
import {
  beregnFitness,
  kjørTurnering,
  spillGruppekamp,
  type TurneringsResultat,
} from "../src/neat/turnering.ts";

function nyAgenter(antall: number, frøStart = 1): NeatAgent[] {
  const bok = new Innovasjonsbok(ANTALL_INN, ANTALL_UT);
  return Array.from(
    { length: antall },
    (_, i) => new NeatAgent(nyttGenom(ANTALL_INN, ANTALL_UT, bok, lagRng(frøStart + i))),
  );
}

const KJAPP = { maksRunder: 12 } as const;

test("flakskontroll: identiske agenter får identiske duplikatpoeng", () => {
  const bok = new Innovasjonsbok(ANTALL_INN, ANTALL_UT);
  const genom = nyttGenom(ANTALL_INN, ANTALL_UT, bok, lagRng(99));
  const agenter = Array.from({ length: 4 }, () => new NeatAgent(genom));
  const res = spillGruppekamp(agenter, 12345, lagRng(1), KJAPP);
  // Samme genom i alle seter + samme kortgiving i alle rotasjoner ⇒ hver
  // agent har spilt nøyaktig de samme fire setene i nøyaktig samme kamp.
  assert.equal(new Set(res.poeng).size, 1, `like poeng, fikk ${res.poeng.join(",")}`);
  assert.equal(new Set(res.seire).size, 1);
});

test("gruppekamp er deterministisk gitt frø", () => {
  const a1 = nyAgenter(4);
  const a2 = nyAgenter(4);
  const r1 = spillGruppekamp(a1, 777, lagRng(5), KJAPP);
  const r2 = spillGruppekamp(a2, 777, lagRng(5), KJAPP);
  assert.deepEqual(r1.poeng, r2.poeng);
  assert.deepEqual(r1.rekkefølge, r2.rekkefølge);
});

test("cupturnering: dybder, mester og lucky losers henger sammen", () => {
  const agenter = nyAgenter(8);
  const res = kjørTurnering(agenter, 2024, KJAPP);
  assert.equal(res.dybde.length, 8);
  // 8 → 2 grupper → 2 vinnere → fylles til 4 med lucky losers → finale.
  assert.equal(res.runder, 2);
  const maks = Math.max(...res.dybde);
  assert.equal(res.dybde[res.mesterIdx], maks, "mesteren har størst dybde");
  assert.equal(res.dybde.filter((d) => d === maks).length, 1, "én mester");
  assert.ok(res.dybde.every((d) => d >= 0 && d <= res.runder));
  // Alle spilte minst én gruppekamp – duplikatpoeng er bokført.
  assert.ok(res.poeng.some((p) => p !== 0));
});

test("turneringen avviser felt som ikke er delelig med 4", () => {
  assert.throws(() => kjørTurnering(nyAgenter(6), 1));
  assert.throws(() => kjørTurnering(nyAgenter(0), 1));
});

test("fitness: dybde dominerer, poeng skiller, regret straffer", () => {
  const res: TurneringsResultat = {
    dybde: [2, 1, 1, 0],
    poeng: [400, 300, 100, 50],
    seire: [6, 3, 2, 0],
    regretSnitt: [0.1, 0.2, 0.2, 1.5],
    mesterIdx: 0,
    runder: 2,
  };
  const fit = beregnFitness(res, null);
  assert.ok(fit[0]! > fit[1]!, "større dybde gir mer fitness");
  assert.ok(fit[1]! > fit[2]!, "lik dybde: flere poeng gir mer fitness");
  assert.ok(fit[2]! > fit[3]!);
  // Poengbonus (< 1) kan aldri slå ett dybdesteg (2 i base).
  assert.ok(fit[1]! - fit[2]! < 2);
  for (const f of fit) assert.ok(f > 0);
});

test("fitness relativt til forrige mester: å slå mesterens dybde gir mer enn mesteren", () => {
  const res: TurneringsResultat = {
    dybde: [1, 2, 0, 1],
    poeng: [200, 250, 100, 150],
    seire: [3, 6, 1, 2],
    regretSnitt: [0, 0, 0, 0],
    mesterIdx: 1,
    runder: 2,
  };
  // Forrige mester står på plass 0 og nådde dybde 1; agent 1 nådde lenger.
  const fit = beregnFitness(res, 0);
  assert.ok(fit[1]! > fit[0]!, "dypere enn mesteren ⇒ høyere fitness enn mesteren");
  assert.ok(fit[2]! < fit[0]!, "grunnere enn mesteren ⇒ lavere fitness");
  // Samme dybde som mesteren rangeres via poeng, tett på mesteren.
  assert.ok(Math.abs(fit[3]! - fit[0]!) < 2);
});
