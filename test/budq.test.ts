/**
 * BUDQ — BUDET SOM ET LÆRT VALG (K3.1, 11. sep). Fem ting må holde:
 *
 *   1. INDEKSENE: hvert bud har nøyaktig én utgang, og et bud uten utgang kastes.
 *   2. K2: trekkene endres ikke når de SKJULTE hendene byttes. Kontroll: egen hånd
 *      og kampstillingen endrer dem.
 *   3. VALGET er argmax over de LOVLIGE budene — et bedre, men ulovlig bud velges aldri.
 *   4. SPEKEN `budq:<fil>:<indre>` bygger agenten fra fil, og feil bredde kastes.
 *   5. DEN UTRULLEDE VEIEN (`byggUtrullet`, `byggAdams`) bygger det samme budlaget som
 *      speken, kaster på to budlag, og står AV til noen slår den på.
 */
import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeHandlinger } from "../src/motor.ts";
import { lagIndre, ADAMS } from "../src/moe2/agentspek.ts";
import { BUDQ_BUD, BUDQ_INN, BUDQ_UT, BudQagent, budqIndeks, budqTrekk } from "../src/moe2/budq.ts";
import { byggUtrullet } from "../src/moe2/utrullet.ts";
import { tolkBudmodell } from "../src/moe2/budmodell.ts";
import { E1Agent } from "../src/e1/agent.ts";
import { nettFraBytes, type NevroNett } from "../src/nevro/nett.ts";
import { byggAdams } from "../web/adamskjede.ts";

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

test("den utrullede veien bygger samme budlag som speken, kaster på to budlag, og står av som standard", () => {
  const katalog = "node_modules/.cache";
  const fil = `${katalog}/budq-prove2.bin`;
  mkdirSync(katalog, { recursive: true });
  // Et nett som faktisk skiller mellom budene, så paritet ikke er gratis.
  const nett = plantet(bias({ "10": 4, "11": 3, "9": 2.5, PASS: 3.5 }));
  writeFileSync(fil, tilBytes(nett));
  try {
    const kortfil = ADAMS.slice(ADAMS.lastIndexOf("e1:") + 3);
    const kortBytes = new Uint8Array(readFileSync(kortfil));
    const bygd = byggUtrullet({
      kortnett: nettFraBytes(kortBytes)[0]!,
      kort: E1Agent.fraBytes(kortBytes),
      vaktflagg: "abmp",
      budq: nett,
    }).agent;
    const spek = lagIndre(`budq:${fil}:vakt:abmp:e1:${kortfil}`);
    let s = opprettSpill({ antallSpillere: 4 }, 3_300_119);
    let n = 0;
    let bud = 0;
    for (let i = 0; i < 400 && s.fase !== "RUNDE_SLUTT" && s.fase !== "FERDIG"; i++) {
      const a = bygd.velgHandling(s);
      assert.deepEqual(a, spek.velgHandling(s), `divergens i fase ${s.fase} etter ${n} valg`);
      if (a.type === "BUD") bud++;
      n++;
      s = utfør(s, a).state;
    }
    assert.ok(n > 20 && bud > 0, `for lite sammenliknet (${n} valg, ${bud} bud)`);

    assert.throws(
      () =>
        byggUtrullet({
          kortnett: nettFraBytes(kortBytes)[0]!,
          kort: E1Agent.fraBytes(kortBytes),
          vaktflagg: "abmp",
          bud: tolkBudmodell(JSON.parse(readFileSync("e1-modell/bud-vant.json", "utf8"))),
          budq: nett,
        }),
      /budq/,
    );

    const vekter = {
      kort: Buffer.from(kortBytes).toString("base64"),
      bud: null,
      vrak: null,
      budq: tilBytes(nett).toString("base64"),
    };
    const konfig = { vaktflagg: "abmp", vrakflagg: "telrd", budterskel: -3, verdener: 0, sigma: 0.5 };
    assert.equal(byggAdams(vekter, konfig, false).budq, false, "BudQ skal stå av uten budqPå");
    assert.equal(byggAdams(vekter, { ...konfig, budqPå: true }, false).budq, true);
    const feilForm = { ...vekter, budq: tilBytes(plantet(bias({}), BUDQ_INN - 3)).toString("base64") };
    assert.equal(byggAdams(feilForm, { ...konfig, budqPå: true }, false).budq, false, "feil form skal falle tilbake");
  } finally {
    rmSync(fil, { force: true });
  }
});
