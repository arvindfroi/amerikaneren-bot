/**
 * BUDQ MED MOTSTANDERBOKA (K6.6, 11. sep). Eieren: «byr 11 → gode kort» — og mennesker
 * byr 11 tre ganger så ofte som botene. Et 287-nett leser MLB-hukommelsen bakerst i
 * budtrekkene. Seks ting må holde:
 *
 *   1. 143-NETT ER URØRT: samme trekk, samme valg som den gamle regelen, ingen bok.
 *   2. NULLUTVIDET 287 = 143: bit-identiske Q og valg også når boka er full — ellers er
 *      varmstarten i `budq-tren.py --vekter` ikke en start fra det samme nettet.
 *   3. FELLA: en sterkt koblet bokkolonne ENDRER bud etter første ferdige runde, og
 *      ingen før. Uten den kunne (2) vært grønn fordi boka aldri ble lest.
 *   4. K2: verdener forenlige med setets visning gir samme trekk og valg. Kontroll: et
 *      annet setes trekk (DERES hånd) ser byttet, så prøven kan feile.
 *   5. BOKA ER KAMPENS: `nyKamp` tømmer den, og uten `observer` fylles den aldri.
 *   6. `budq-data --hukommelse` skriver 287-rader, uten flagget 143.
 *   7. SPEKEN `budq:<287-fil>` fyller boka via `observer`; APPKJEDEN (`byggAdams`) avviser
 *      287, fordi hovedtråden i `web/app.ts` aldri kaller `observer` ved RUNDE_SLUTT.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { lovligeHandlinger } from "../src/motor.ts";
import { lagRng } from "../src/kort.ts";
import { ADAMS, lagIndre } from "../src/moe2/agentspek.ts";
import { byggAdams } from "../web/adamskjede.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { BUDQ_BUD, BUDQ_HUKOMMELSE, BUDQ_INN, BUDQ_INN_H, BUDQ_UT, BudQagent, budqTrekk } from "../src/moe2/budq.ts";
import { LEDD_NAVN, LENGDE_PER_SETE } from "../src/mlb/hukommelse.ts";
import { forover, type NevroNett } from "../src/nevro/nett.ts";

const SKJULT = 24;

/** Et tilfeldig to-lags nett. PASS får en negativ bias, så 143-nettet nesten aldri passer (fella trenger det). */
function tilfeldigNett(inn: number, frø: number): NevroNett {
  const rng = lagRng(frø);
  const tall = (n: number, skala: number): Float32Array => Float32Array.from({ length: n }, () => (rng() - 0.5) * skala);
  const bias2 = tall(BUDQ_UT, 1);
  bias2[0] = -3; // PASS
  return {
    lag: [
      { inn, ut: SKJULT, vekter: tall(inn * SKJULT, 0.4), bias: tall(SKJULT, 0.2) },
      { inn: SKJULT, ut: BUDQ_UT, vekter: tall(SKJULT * BUDQ_UT, 0.6), bias: bias2 },
    ],
  };
}

/** 143 → 287 med nullkolonner i første lag — det `budq-tren.py --vekter` gjør. */
function nullutvid(n: NevroNett): NevroNett {
  const [l0, ...resten] = n.lag;
  const v = new Float32Array(l0!.ut * BUDQ_INN_H);
  for (let r = 0; r < l0!.ut; r++) v.set(l0!.vekter.subarray(r * BUDQ_INN, (r + 1) * BUDQ_INN), r * BUDQ_INN_H);
  return { lag: [{ inn: BUDQ_INN_H, ut: l0!.ut, vekter: v, bias: Float32Array.from(l0!.bias) }, ...resten] };
}

/**
 * FELLA: skjult enhet 0 får en stor vekt fra «budandel.tiltro» for første motstander,
 * og PASS en stor vekt fra enhet 0. Tiltroen er 0 uten ferdige runder og ≥ 1/9 etter
 * én, så PASS vinner straks boka har sett en runde — og aldri før.
 */
function fellenett(n143: NevroNett): NevroNett {
  const n = nullutvid(n143);
  const kolonne = BUDQ_INN + LEDD_NAVN.indexOf("meso.budandel.tiltro");
  assert.ok(kolonne >= BUDQ_INN && kolonne < BUDQ_INN + LENGDE_PER_SETE);
  const [l0, l1] = n.lag as [NevroNett["lag"][number], NevroNett["lag"][number]];
  const v0 = Float32Array.from(l0.vekter);
  v0[0 * BUDQ_INN_H + kolonne] = 300;
  const v1 = Float32Array.from(l1.vekter);
  v1[0 * SKJULT + 0] = 5; // PASS-raden, enhet 0
  return { lag: [{ ...l0, vekter: v0 }, { ...l1, vekter: v1 }] };
}

/** Den gamle regelen skrevet ut: argmax av Q over 143 trekk, blant de lovlige budene. */
function gammeltValg(nett: NevroNett, s: GameState): Handling {
  const lov = lovligeHandlinger(s);
  assert.ok(lov.fase === "BUDRUNDE");
  const q = forover(nett, budqTrekk(s, s.iTur!));
  let beste = lov.bud[0]!;
  let bv = -Infinity;
  for (const b of lov.bud) {
    const i = BUDQ_BUD.indexOf(b);
    if (i >= 0 && q[i]! > bv) {
      bv = q[i]!;
      beste = b;
    }
  }
  return { type: "BUD", spiller: s.iTur!, bud: beste };
}

/** En kamp med NevroHjerne ved bordet; `besøk` ser HVER tilstand, også RUNDE_SLUTT. */
function kjør(frø: number, maksRunder: number, besøk: (s: GameState) => void): GameState {
  const drivere = [0, 1, 2, 3].map(() => lagIndre("nevro"));
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  for (let vakt = 0; s.fase !== "FERDIG" && s.rundeNr < maksRunder && vakt < 5000; vakt++) {
    besøk(s);
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (sete === null || sete === undefined) break;
    s = utfør(s, drivere[sete]!.velgHandling(s)).state;
  }
  return s;
}

const harBok = (x: Float32Array): boolean => x.subarray(BUDQ_INN).some((v) => v !== 0);
const erBudtur = (s: GameState): boolean => s.fase === "BUDRUNDE" && s.iTur !== null;

test("bredden: 287 = 143 + 3 × 48, og feil bredde kastes med begge tallene", () => {
  assert.equal(BUDQ_INN, 143);
  assert.equal(BUDQ_HUKOMMELSE, 3 * LENGDE_PER_SETE);
  assert.equal(BUDQ_INN_H, 287);
  assert.throws(() => new BudQagent(lagIndre("nevro"), tilfeldigNett(200, 1)), /143 eller 287/);
});

test("143-nett: samme trekk og samme valg som den gamle regelen, og ingen bok", () => {
  const nett = tilfeldigNett(BUDQ_INN, 11);
  const agent = new BudQagent(lagIndre("nevro"), nett);
  assert.equal(agent.leserHukommelse, false);
  let n = 0;
  kjør(4_400_001, 4, (s) => {
    agent.observer(s);
    if (!erBudtur(s)) return;
    const x = agent.trekk(s, s.iTur!);
    assert.equal(x.length, BUDQ_INN);
    assert.deepEqual([...x], [...budqTrekk(s, s.iTur!)]);
    assert.deepEqual(agent.velgHandling(s), gammeltValg(nett, s));
    n++;
  });
  assert.ok(n >= 8, `for få budbeslutninger (${n})`);
});

test("287-nett nullutvidet fra et 143-nett: bit-identiske Q og valg, også med full bok", () => {
  const n143 = tilfeldigNett(BUDQ_INN, 12);
  const a = new BudQagent(lagIndre("nevro"), n143);
  const b = new BudQagent(lagIndre("nevro"), nullutvid(n143));
  assert.equal(b.leserHukommelse, true);
  let medBok = 0;
  kjør(4_400_002, 5, (s) => {
    a.observer(s);
    b.observer(s);
    if (!erBudtur(s)) return;
    const sete = s.iTur!;
    const xb = b.trekk(s, sete);
    assert.equal(xb.length, BUDQ_INN_H);
    assert.deepEqual([...xb.subarray(0, BUDQ_INN)], [...a.trekk(s, sete)]);
    if (harBok(xb)) medBok++;
    assert.deepEqual([...b.q(s, sete)], [...a.q(s, sete)]);
    assert.deepEqual(b.velgHandling(s), a.velgHandling(s));
  });
  // En grønn prøve på bare tomme bøker ville ikke bevist noe om nullkolonnene.
  assert.ok(medBok >= 4, `boka var fylt i bare ${medBok} stillinger`);
});

test("fella: en sterkt koblet bokkolonne endrer bud etter første ferdige runde, og ingen før", () => {
  const n143 = tilfeldigNett(BUDQ_INN, 13);
  const a = new BudQagent(lagIndre("nevro"), n143);
  const c = new BudQagent(lagIndre("nevro"), fellenett(n143));
  let førBok = 0;
  let endret = 0;
  let medBok = 0;
  kjør(4_400_003, 5, (s) => {
    a.observer(s);
    c.observer(s);
    if (!erBudtur(s)) return;
    const fylt = harBok(c.trekk(s, s.iTur!));
    const likt = JSON.stringify(c.velgHandling(s)) === JSON.stringify(a.velgHandling(s));
    if (!fylt) {
      førBok++;
      assert.ok(likt, "uten ferdige runder er boka null, og valget skal være 143-nettets");
    } else {
      medBok++;
      if (!likt) endret++;
    }
  });
  assert.ok(førBok > 0 && medBok > 0, `oppsettet: ${førBok} stillinger før boka, ${medBok} etter`);
  assert.ok(endret > 0, "boka endret ingen bud - nettet leser den ikke");
});

test("K2: skjulte hender endrer verken trekk (med bok) eller valg; kontrollen ser byttet", () => {
  const c = new BudQagent(lagIndre("nevro"), fellenett(tilfeldigNett(BUDQ_INN, 14)));
  let stillinger = 0;
  let kontroll = 0;
  kjør(4_400_004, 5, (s) => {
    c.observer(s);
    if (!erBudtur(s) || stillinger >= 10) return;
    const sete = s.iTur!;
    const x = [...c.trekk(s, sete)];
    if (!harBok(Float32Array.from(x))) return;
    const verdener = trekkVerdener(s, sete, 3, lagRng(777_000 + stillinger * 31), undefined, undefined, 4);
    if (verdener.length < 2) return;
    const valg = c.velgHandling(s);
    stillinger++;
    const annen = (sete + 1) % 4;
    for (const hender of verdener) {
      const s2 = medVerden(s, hender, sete);
      assert.deepEqual(s2.hender[sete], s.hender[sete], "medVerden rørte setets egen hånd");
      assert.deepEqual([...c.trekk(s2, sete)], x, "trekkene avhenger av SKJULTE kort");
      assert.deepEqual(c.velgHandling(s2), valg, "budet avhenger av SKJULTE kort");
      if (JSON.stringify([...budqTrekk(s2, annen)]) !== JSON.stringify([...budqTrekk(s, annen)])) kontroll++;
    }
  });
  assert.ok(stillinger >= 4, `prøven fikk bare ${stillinger} stillinger med fylt bok`);
  assert.ok(kontroll > 0, "verdenene byttet ingen skjulte kort - prøven kunne ikke feilet");
});

test("boka er kampens: nyKamp tømmer den, går videre innover, og uten observer fylles den aldri", () => {
  let indreNyKamp = 0;
  const nevro = lagIndre("nevro");
  const spion = { velgHandling: (s: GameState) => nevro.velgHandling(s), nyKamp: () => void indreNyKamp++ };
  const b = new BudQagent(spion, nullutvid(tilfeldigNett(BUDQ_INN, 15)));
  const blind = new BudQagent(lagIndre("nevro"), nullutvid(tilfeldigNett(BUDQ_INN, 15)));
  let siste: GameState | null = null;
  kjør(4_400_005, 4, (s) => {
    b.observer(s);
    if (!erBudtur(s)) return;
    // `blind` blir bare spurt om trekk: velgHandling ser aldri RUNDE_SLUTT.
    blind.velgHandling(s);
    assert.equal(harBok(blind.trekk(s, s.iTur!)), false, "boka fyltes uten observer - hvor kom rundene fra?");
    if (harBok(b.trekk(s, s.iTur!))) siste = s;
  });
  assert.ok(siste !== null, "oppsettet: boka ble aldri fylt");
  const s = siste as GameState;
  b.nyKamp();
  assert.equal(indreNyKamp, 1);
  assert.equal(harBok(b.trekk(s, s.iTur!)), false, "nyKamp tømte ikke boka");
});

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

test("speken budq:<287-fil> leser boka gjennom observer; appkjeden faller tilbake på 287 og tar 143", () => {
  const n143 = tilfeldigNett(BUDQ_INN, 16);
  // Windows-stien har et kolon («C:/…»), og speken deler på det første: fila må ha en
  // relativ sti. Katalogen ligger derfor i arbeidstreet (tmpdir kan være på en annen disk).
  const katalog = mkdtempSync(join(process.cwd(), ".budq-h-"));
  try {
    const fil = join(katalog, "felle.bin");
    writeFileSync(fil, tilBytes(fellenett(n143)));
    const spek = lagIndre(`budq:${relative(process.cwd(), fil).replaceAll("\\", "/")}:nevro`);
    assert.ok(spek instanceof BudQagent && spek.leserHukommelse, "speken bygde ikke et bokleddet BudQ-lag");
    const direkte = new BudQagent(lagIndre("nevro"), fellenett(n143));
    const a = new BudQagent(lagIndre("nevro"), n143);
    let endret = 0;
    kjør(4_400_006, 5, (s) => {
      spek.observer?.(s);
      direkte.observer(s);
      a.observer(s);
      if (!erBudtur(s)) return;
      const h = spek.velgHandling(s);
      assert.deepEqual(h, direkte.velgHandling(s));
      if (JSON.stringify(h) !== JSON.stringify(a.velgHandling(s))) endret++;
    });
    // Fella over: speken må faktisk ha fylt boka, ellers er likheten med `direkte` gratis.
    assert.ok(endret > 0, "spekagenten leste aldri boka");

    // APPKJEDEN: hovedtråden får aldri RUNDE_SLUTT (se web/adamskjede.ts), så 287 avvises.
    const kortfil = ADAMS.slice(ADAMS.lastIndexOf("e1:") + 3);
    const kort = readFileSync(kortfil).toString("base64");
    const konfig = { vaktflagg: "abmp", vrakflagg: "telrd", budterskel: -3, verdener: 0, sigma: 0.5, budqPå: true };
    const vekter = (n: NevroNett) => ({ kort, bud: null, vrak: null, budq: tilBytes(n).toString("base64") });
    assert.equal(byggAdams(vekter(fellenett(n143)), konfig, false).budq, false, "287 skal ikke inn i appen");
    assert.equal(byggAdams(vekter(n143), konfig, false).budq, true, "kontroll: 143 skal fortsatt inn");
  } finally {
    rmSync(katalog, { recursive: true, force: true });
  }
});

test("budq-data --hukommelse skriver 287-rader med bok etter første runde; uten flagget 143", () => {
  const katalog = mkdtempSync(join(tmpdir(), "budq-h-"));
  try {
    const kjørData = (fil: string, ekstra: string[]): Record<string, unknown>[] => {
      const r = spawnSync(
        process.execPath,
        ["examples/budq-data.ts", "--kamper", "1", "--skard", "0/1", "--verdener", "1", "--sjanse", "1",
          "--maksrunder", "3", "--spek", "nevro", "--ut", fil, ...ekstra],
        { encoding: "utf8", timeout: 300_000 },
      );
      assert.equal(r.status, 0, `budq-data feilet: ${r.stderr}`);
      return readFileSync(fil, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    };
    const med = kjørData(join(katalog, "h.jsonl"), ["--hukommelse"]);
    assert.ok(med.length >= 4, `for få rader (${med.length})`);
    for (const r of med) assert.equal((r.x as number[]).length, BUDQ_INN_H);
    const fylt = med.filter((r) => (r.x as number[]).slice(BUDQ_INN).some((v) => v !== 0));
    assert.ok(fylt.length > 0, "ingen rad hadde fylt bok - boka ble ikke observert");
    for (const r of med) if (r.runde === 0) assert.ok((r.x as number[]).slice(BUDQ_INN).every((v) => v === 0), "bok i runde 0");

    const uten = kjørData(join(katalog, "u.jsonl"), []);
    for (const r of uten) assert.equal((r.x as number[]).length, BUDQ_INN);
    // Samme kamp, samme stillinger: de første 143 er de samme med og uten boka.
    assert.equal(uten.length, med.length);
    uten.forEach((r, i) => assert.deepEqual(r.x, (med[i]!.x as number[]).slice(0, BUDQ_INN)));
  } finally {
    rmSync(katalog, { recursive: true, force: true });
  }
});
