/**
 * BUDQ — BUDET SOM ET LÆRT VALG (K3.1, 11. sep). Fire ting må holde:
 *
 *   1. INDEKSENE: hvert bud har nøyaktig én utgang, og et bud uten utgang kastes.
 *   2. K2: trekkene endres ikke når de SKJULTE hendene byttes. Kontroll: egen hånd
 *      og kampstillingen endrer dem.
 *   3. VALGET er argmax over de LOVLIGE budene — et bedre, men ulovlig bud velges aldri.
 *   4. SPEKEN `budq:<fil>:<indre>` bygger agenten fra fil, og feil bredde kastes.
 */
import { strict as assert } from "node:assert";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeHandlinger } from "../src/motor.ts";
import { lagIndre, ADAMS } from "../src/moe2/agentspek.ts";
import { BUDQ_BUD, BUDQ_INN, BUDQ_UT, BudQagent, budqIndeks, budqTrekk } from "../src/moe2/budq.ts";
import type { NevroNett } from "../src/nevro/nett.ts";

/** Ett lineært lag med nullvekter: utgangen ER biasen, uansett stilling. */
const plantet = (bias: number[], inn = BUDQ_INN): NevroNett => ({
  lag: [{ inn, ut: BUDQ_UT, vekter: new Float32Array(inn * BUDQ_UT), bias: Float32Array.from(bias) }],
});

const bias = (favoritter: Record<string, number>): number[] =>
  BUDQ_BUD.map((b) => favoritter[String(b)] ?? 0);

/** Appformatet `src/nevro/nett.ts` leser. */
const tilBytes = (n: NevroNett): Buffer => {
  const deler: Buffer[] = [];
  const i32 = (x: number): void => {
    const b = Buffer.alloc(4);
    b.writeInt32LE(x);
    deler.push(b);
  };
  i32(1);
  i32(n.lag.length);
  for (const l of n.lag) {
    i32(l.inn);
    i32(l.ut);
    deler.push(Buffer.from(new Float32Array(l.vekter).buffer));
    deler.push(Buffer.from(new Float32Array(l.bias).buffer));
  }
  return Buffer.concat(deler);
};

/** Første melder byr 8; neste sete står for tur med 5–8 ulovlige. */
const etterÅtte = (): GameState => {
  const s0 = opprettSpill({ antallSpillere: 4 }, 3_300_117);
  return utfør(s0, { type: "BUD", spiller: s0.iTur!, bud: 8 }).state;
};

test("indeksene: hvert bud én utgang, ukjent bud kastes", () => {
  assert.equal(BUDQ_UT, 11);
  BUDQ_BUD.forEach((b, i) => assert.equal(budqIndeks(b), i));
  assert.throws(() => budqIndeks(13), /ingen utgang/);
});

test("K2: skjulte hender endrer ikke trekkene; egen hånd og kampstillingen gjør det", () => {
  const s = etterÅtte();
  const sete = s.iTur!;
  const a = (sete + 1) % 4;
  const b = (sete + 2) % 4;
  const hender = s.hender.map((h) => [...h]);
  [hender[a], hender[b]] = [hender[b]!, hender[a]!];
  const byttet: GameState = { ...s, hender, talong: [...s.talong].reverse() };
  const x = budqTrekk(s, sete);
  assert.equal(x.length, BUDQ_INN);
  assert.deepEqual([...budqTrekk(byttet, sete)], [...x]);

  // Kontroll 1: bytt ett kort i EGEN hånd med en motstander — trekkene SKAL endres.
  const egen = s.hender.map((h) => [...h]);
  const k = egen[sete]![0]!;
  egen[sete]![0] = egen[a]![0]!;
  egen[a]![0] = k;
  assert.notDeepEqual([...budqTrekk({ ...s, hender: egen }, sete)], [...x]);

  // Kontroll 2: kampstillingen er med.
  const poeng = s.totalPoeng.map((_, p) => (p === sete ? 60 : p === a ? 80 : 0));
  const y = budqTrekk({ ...s, totalPoeng: poeng }, sete);
  // Trekkene er Float32: sammenlign med den samme avrundingen.
  assert.equal(y[BUDQ_INN - 3], Math.fround(60 / s.regler.målPoeng));
  assert.equal(y[BUDQ_INN - 2], Math.fround(80 / s.regler.målPoeng));
});

test("valget er argmax over de LOVLIGE budene", () => {
  const s = etterÅtte();
  const lov = lovligeHandlinger(s);
  assert.ok(lov.fase === "BUDRUNDE");
  assert.ok(!lov.bud.includes(6) && lov.bud.includes(10), "oppsettet: 6 skal være ulovlig, 10 lovlig");

  const agent = new BudQagent(lagIndre("nevro"), plantet(bias({ "6": 10, "10": 5, PASS: 1 })));
  assert.deepEqual(agent.velgHandling(s), { type: "BUD", spiller: s.iTur, bud: 10 });

  // Amerikaner og solo er ekte valg, ikke fjernet.
  const solo = new BudQagent(lagIndre("nevro"), plantet(bias({ SOLO: 3, "10": 1 })));
  const h = solo.velgHandling(s);
  assert.equal(h.type, "BUD");
  if (lov.bud.includes("SOLO")) assert.equal((h as { bud: unknown }).bud, "SOLO");

  // Utenfor budrunden bestemmer laget under.
  let t = s;
  for (let i = 0; i < 40 && t.fase === "BUDRUNDE"; i++) t = utfør(t, { type: "BUD", spiller: t.iTur!, bud: "PASS" }).state;
  if (t.fase !== "BUDRUNDE" && t.iTur !== null) {
    const nevro = lagIndre("nevro");
    assert.deepEqual(agent.velgHandling(t), nevro.velgHandling(t));
  }
});

test("speken budq:<fil>:<indre> bygger fra fil, og feil bredde kastes", () => {
  assert.throws(() => new BudQagent(lagIndre("nevro"), plantet(bias({}), BUDQ_INN - 3)), new RegExp(String(BUDQ_INN)));

  const katalog = "node_modules/.cache";
  const fil = `${katalog}/budq-prove.bin`;
  mkdirSync(katalog, { recursive: true });
  writeFileSync(fil, tilBytes(plantet(bias({ "12": 9, PASS: 2 }))));
  try {
    // Speken er ADAMS med budmodellen byttet ut — kortnett, vakt og vrak står.
    const spek = ADAMS.replace(/budm:[^:]+:/, `budq:${fil}:`);
    assert.notEqual(spek, ADAMS, "ADAMS har ikke lenger et budm-lag å bytte");
    const agent = lagIndre(spek);
    const s0 = opprettSpill({ antallSpillere: 4 }, 3_300_118);
    assert.deepEqual(agent.velgHandling(s0), { type: "BUD", spiller: s0.iTur, bud: 12 });
  } finally {
    rmSync(fil, { force: true });
  }
});
