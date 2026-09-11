/**
 * VARMSTARTEN OG GENERATORENE FOR SANSER 2 (11. sep).
 *
 * Loopen trener videre fra forrige iterasjons nett. Når bredden vokser, må første iterasjon
 * starte fra DET SAMME nettet — ellers er «sanser 2 hjalp ikke» og «varmstarten ødela nettet»
 * umulige å skille. Tre ting prøves her, alle mot det som faktisk kjører:
 *
 *   1. TRENERNE: `mlb-tro-tren.py --bare-utvid` og `budq-tren.py --bare-utvid` bruker nøyaktig
 *      varmstartkoden treningen bruker (`les_vekter` / `varmstart`), på CPU uten data. Filene de
 *      skriver skal være BYTE-IDENTISKE med `utvidTronett` / nuller bakerst i TS, og gi den samme
 *      troen og de samme budene på ekte stillinger. Det gamle 776 → 920-tilfellet (signalet
 *      settes inn på 804, ikke bakerst) er med, så generaliseringen ikke har brutt det.
 *      FELLA: de nye kolonnene i kildenettene er SMÅ TILFELDIGE TALL, ikke nuller — en blokk lagt
 *      på feil plass gir da en annen fil og en annen tro.
 *   2. GENERATORENE: `mlb-trodata --sanser2` og `budq-data --sanser2` skriver de samme radene
 *      som uten flagget, med blokkene bakerst — og avviser flagget uten det det bygger på.
 *
 * Python-delen hoppes over (med grunn) når ingen python med torch finnes; sett `AMB_PY`.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { spillerVisning } from "../src/motor.ts";
import { lagRng } from "../src/kort.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import { STILLINGINNGANG } from "../src/mlb/stillingtrekk.ts";
import {
  MLB_TRO_INN,
  MLB_TRO_INN_H,
  MLB_TRO_INN_HS,
  MLB_TRO_INN_HS2,
  MLB_TRO_INN_S,
  troKolonnekart,
} from "../src/mlb/trotrekk.ts";
import { MlbTronett, utvidTronett } from "../src/mlb/tronett.ts";
import { BUDQ_INN, BUDQ_INN_H, BUDQ_INN_HS2, BUDQ_UT, BudQagent } from "../src/moe2/budq.ts";
import { nettFraBytes, type NevroNett } from "../src/nevro/nett.ts";

const ROT = fileURLToPath(new URL("..", import.meta.url));
/** Relativ til ROT og ignorert av git (`/_*`). Per prosess, så parallelle kjøringer ikke deler fil. */
const MAPPE = `_test-sanser2-${process.pid}`;
before(() => mkdirSync(`${ROT}/${MAPPE}`, { recursive: true }));
after(() => rmSync(`${ROT}/${MAPPE}`, { recursive: true, force: true }));

const PY: string | null = (() => {
  const kandidater = [process.env.AMB_PY, "python", "python3"].filter((x): x is string => typeof x === "string" && x !== "");
  for (const k of kandidater) {
    const r = spawnSync(k, ["-c", "import torch, numpy"], { encoding: "utf8", timeout: 180_000 });
    if (r.status === 0) return k;
  }
  return null;
})();
const UTEN_PY = PY === null ? "fant ingen python med torch og numpy (sett AMB_PY)" : false;

function py(args: readonly string[]): { status: number | null; tekst: string } {
  const r = spawnSync(PY!, args, {
    cwd: ROT,
    encoding: "utf8",
    timeout: 300_000,
    // Maskinen trener: få tråder, og aldri GPU (`--bare-utvid` kjører på CPU uansett).
    env: { ...process.env, OMP_NUM_THREADS: "2", MKL_NUM_THREADS: "2", CUDA_VISIBLE_DEVICES: "" },
  });
  return { status: r.status, tekst: `${r.stdout}\n${r.stderr}` };
}

/** Appformatet `src/nevro/nett.ts` leser og trenerne skriver. */
function tilBytes(n: NevroNett): Buffer {
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
}

const modell = (navn: string): string => `${ROT}/e1-modell/${navn}`;

/** 660-nettet utvidet til `bredde`, med SMÅ TILFELDIGE vekter (ikke nuller) i alle nye kolonner. */
function medTilfeldigeKolonner(n660: NevroNett, bredde: number, frø: number): NevroNett {
  const u = utvidTronett(n660, bredde);
  const rng = lagRng(frø);
  const l = u.lag[0]!;
  for (let r = 0; r < l.ut; r++) for (let c = MLB_TRO_INN; c < bredde; c++) l.vekter[r * bredde + c] = (rng() - 0.5) * 0.05;
  return u;
}

/** Spillestillinger fra runde 1 og utover (boka er fylt), med bokvektoren for setet. */
function stillinger(frø: number, maksRunder: number, maks: number): { s: GameState; sete: number; huk: Float64Array }[] {
  const drivere = [0, 1, 2, 3].map(() => lagIndre("nevro"));
  const bok = new Hukommelse();
  const ut: { s: GameState; sete: number; huk: Float64Array }[] = [];
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, frø);
  for (let vakt = 0; s.fase !== "FERDIG" && vakt < 20_000 && ut.length < maks; vakt++) {
    bok.observer(s);
    if (s.fase === "RUNDE_SLUTT") {
      if (s.rundeNr + 1 >= maksRunder) break;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (sete === null || sete === undefined) break;
    if (s.fase === "SPILL" && s.rundeNr >= 1 && s.stikkSpilt >= 2 && s.bord.length === 2) ut.push({ s, sete, huk: bok.vektor(sete, 4) });
    s = utfør(s, drivere[sete]!.velgHandling(s)).state;
  }
  return ut;
}

// ---------------------------------------------------------------------------
// 1. Trenerne
// ---------------------------------------------------------------------------

test("mlb-tro-tren --bare-utvid: byte-identisk med utvidTronett for 776→920, 920→996, 804→996, 776→996 — og samme tro", { skip: UTEN_PY }, () => {
  const n660 = nettFraBytes(readFileSync(modell("mlb-tro.bin")))[0]!;
  const kilder: Record<number, NevroNett> = {
    [MLB_TRO_INN_S]: medTilfeldigeKolonner(n660, MLB_TRO_INN_S, 31),
    [MLB_TRO_INN_H]: medTilfeldigeKolonner(n660, MLB_TRO_INN_H, 32),
    [MLB_TRO_INN_HS]: existsSync(modell("tro-1.bin"))
      ? nettFraBytes(readFileSync(modell("tro-1.bin")))[0]!
      : medTilfeldigeKolonner(n660, MLB_TRO_INN_HS, 33),
  };
  const pos = stillinger(6_130_001, 3, 12);
  assert.ok(pos.length >= 8, `for få stillinger (${pos.length})`);
  for (const [fra, til] of [[776, 920], [920, 996], [804, 996], [776, 996]] as const) {
    const inn = `${MAPPE}/tro-${fra}.bin`;
    const ut = `${MAPPE}/tro-${fra}-${til}.bin`;
    writeFileSync(`${ROT}/${inn}`, tilBytes(kilder[fra]!));
    const r = py(["verktoy/mlb-tro-tren.py", "--vekter", inn, "--bare-utvid", ut, "--dim", String(til)]);
    assert.equal(r.status, 0, r.tekst);
    const fraPy = readFileSync(`${ROT}/${ut}`);
    const fraTs = tilBytes(utvidTronett(kilder[fra]!, til));
    assert.ok(fraPy.equals(fraTs), `${fra} → ${til}: python og TS skrev ulike filer (${fraPy.length} mot ${fraTs.length} byte)`);

    const smal = new MlbTronett(kilder[fra]!);
    const bred = MlbTronett.fraBytes(new Uint8Array(fraPy));
    assert.equal(bred.innBredde, til);
    for (const { s, sete, huk } of pos) {
      const v = spillerVisning(s, sete);
      assert.deepEqual(
        bred.fordeling(bred.trekkFor(v, s.giving.antallStikk, 100, huk)),
        smal.fordeling(smal.trekkFor(v, s.giving.antallStikk, 100, huk)),
        `${fra} → ${til}: annen tro etter varmstarten`,
      );
    }
  }
  // FELLA FOR GENERALISERINGEN: nullene BAKERST for 776 → 920 (den gamle feilen) gir en annen tro.
  const feil = { lag: [...utvidTronett(kilder[776]!, 920).lag] };
  const l0 = kilder[776]!.lag[0]!;
  const vekter = new Float32Array(l0.ut * 920);
  for (let r = 0; r < l0.ut; r++) vekter.set(l0.vekter.subarray(r * 776, (r + 1) * 776), r * 920);
  feil.lag[0] = { ...feil.lag[0]!, vekter };
  const smal = new MlbTronett(kilder[776]!);
  const bakerst = new MlbTronett(feil);
  const ulik = pos.filter(({ s, sete, huk }) => {
    const v = spillerVisning(s, sete);
    return JSON.stringify(bakerst.fordeling(bakerst.trekkFor(v, 12, 100, huk))) !== JSON.stringify(smal.fordeling(smal.trekkFor(v, 12, 100, huk)));
  }).length;
  assert.ok(ulik > 0, "nuller bakerst for 776 → 920 ga samme tro — prøven over kunne ikke skilt riktig plassering fra feil");
  assert.deepEqual(troKolonnekart(776, 920), [[0, 0, 660], [660, 804, 116]]);

  // En utvidelse som MISTER en blokk avvises, i begge språk.
  writeFileSync(`${ROT}/${MAPPE}/tro-776b.bin`, tilBytes(kilder[776]!));
  const mist = py(["verktoy/mlb-tro-tren.py", "--vekter", `${MAPPE}/tro-776b.bin`, "--bare-utvid", `${MAPPE}/x.bin`, "--dim", "804"]);
  assert.notEqual(mist.status, 0);
  assert.match(mist.tekst, /signal.*finnes ikke i 804/);
});

test("budq-tren --bare-utvid: 287 → 323 og 143 → 323 byte-identisk med nuller bakerst — og samme Q og bud", { skip: UTEN_PY }, () => {
  const rng = lagRng(41);
  const tilfeldig = (inn: number): NevroNett => {
    const t = (n: number): Float32Array => Float32Array.from({ length: n }, () => (rng() - 0.5) * 0.4);
    return { lag: [{ inn, ut: 32, vekter: t(inn * 32), bias: t(32) }, { inn: 32, ut: BUDQ_UT, vekter: t(32 * BUDQ_UT), bias: t(BUDQ_UT) }] };
  };
  const nullerBakerst = (n: NevroNett, til: number): NevroNett => {
    const [l0, ...resten] = n.lag;
    const v = new Float32Array(l0!.ut * til);
    for (let r = 0; r < l0!.ut; r++) v.set(l0!.vekter.subarray(r * l0!.inn, (r + 1) * l0!.inn), r * til);
    return { lag: [{ inn: til, ut: l0!.ut, vekter: v, bias: Float32Array.from(l0!.bias) }, ...resten] };
  };
  const n287 = existsSync(modell("budq-1.bin")) ? nettFraBytes(readFileSync(modell("budq-1.bin")))[0]! : tilfeldig(BUDQ_INN_H);
  for (const [navn, kilde] of [["287", n287], ["143", tilfeldig(BUDQ_INN)]] as const) {
    const inn = `${MAPPE}/budq-${navn}.bin`;
    const ut = `${MAPPE}/budq-${navn}-323.bin`;
    writeFileSync(`${ROT}/${inn}`, tilBytes(kilde));
    const r = py(["verktoy/budq-tren.py", "--vekter", inn, "--bare-utvid", "--dim", String(BUDQ_INN_HS2), "--ut", ut]);
    assert.equal(r.status, 0, r.tekst);
    assert.ok(readFileSync(`${ROT}/${ut}`).equals(tilBytes(nullerBakerst(kilde, BUDQ_INN_HS2))), `${navn} → 323: ulike filer`);
  }
  const a = new BudQagent(lagIndre("nevro"), n287);
  const b = new BudQagent(lagIndre("nevro"), nettFraBytes(readFileSync(`${ROT}/${MAPPE}/budq-287-323.bin`))[0]!);
  let n = 0;
  const drivere = [0, 1, 2, 3].map(() => lagIndre("nevro"));
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, 6_130_002);
  for (let vakt = 0; s.fase !== "FERDIG" && s.rundeNr < 4 && vakt < 5000; vakt++) {
    a.observer(s);
    b.observer(s);
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    if (s.fase === "BUDRUNDE" && s.iTur !== null) {
      assert.deepEqual([...b.q(s, s.iTur)], [...a.q(s, s.iTur)]);
      assert.deepEqual(b.velgHandling(s), a.velgHandling(s));
      n++;
    }
    const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (sete === null || sete === undefined) break;
    s = utfør(s, drivere[sete]!.velgHandling(s)).state;
  }
  assert.ok(n >= 10, `for få budbeslutninger (${n})`);
});

// ---------------------------------------------------------------------------
// 2. Generatorene
// ---------------------------------------------------------------------------

function kjør(skript: string, args: readonly string[]): { status: number | null; tekst: string } {
  const r = spawnSync(process.execPath, [skript, ...args], { cwd: ROT, encoding: "utf8", timeout: 300_000 });
  return { status: r.status, tekst: `${r.stdout}\n${r.stderr}` };
}

function lesMlbt(sti: string): { dim: number; t: Float32Array[]; rest: Buffer[] } {
  const b = readFileSync(`${ROT}/${sti}`);
  assert.equal(b.toString("ascii", 0, 4), "MLBT");
  const dim = b.readInt32LE(8);
  const post = dim * 4 + 60;
  assert.equal((b.length - 12) % post, 0);
  const t: Float32Array[] = [];
  const rest: Buffer[] = [];
  for (let o = 12; o < b.length; o += post) {
    const x = new Float32Array(dim);
    for (let i = 0; i < dim; i++) x[i] = b.readFloatLE(o + i * 4);
    t.push(x);
    rest.push(b.subarray(o + dim * 4, o + post));
  }
  return { dim, t, rest };
}

test("mlb-trodata --sanser2: 996-rader er 920-radene med sansene bakerst, og flagget krever --kamp --hukommelse --signal", () => {
  const felles = ["--kamp", "--hukommelse", "--signal", "--kamper", "1", "--maksrunder", "2", "--sjanse", "1"];
  const a = kjør("examples/mlb-trodata.ts", [...felles, "--ut", `${MAPPE}/k920.bin`]);
  assert.equal(a.status, 0, a.tekst);
  const b = kjør("examples/mlb-trodata.ts", [...felles, "--sanser2", "--ut", `${MAPPE}/k996.bin`]);
  assert.equal(b.status, 0, b.tekst);
  const r920 = lesMlbt(`${MAPPE}/k920.bin`);
  const r996 = lesMlbt(`${MAPPE}/k996.bin`);
  assert.equal(r920.dim, MLB_TRO_INN_HS);
  assert.equal(r996.dim, MLB_TRO_INN_HS2);
  assert.equal(r996.t.length, r920.t.length);
  assert.ok(r996.t.length > 40, `for få rader (${r996.t.length})`);
  let medValgtBort = 0;
  for (let i = 0; i < r996.t.length; i++) {
    const x = r996.t[i]!;
    assert.ok(x.subarray(0, MLB_TRO_INN_HS).every((y, j) => Object.is(y, r920.t[i]![j])), `rad ${i}: de første 920 er ikke 920-raden`);
    assert.ok(r996.rest[i]!.equals(r920.rest[i]!), `rad ${i}: etikett, frø, stikk eller sete er endret`);
    assert.ok(x[MLB_TRO_INN_HS + STILLINGINNGANG.IGJEN]! > 0, `rad ${i}: stillingsblokken er tom`);
    if (x.subarray(MLB_TRO_INN_HS + 36).some((y) => y !== 0)) medValgtBort++;
  }
  assert.ok(medValgtBort > r996.t.length / 3, `valgt-bort-blokken var tom i nesten alle rader (${medValgtBort})`);

  for (const mangler of [["--kamp", "--hukommelse"], ["--kamp", "--signal"], ["--hukommelse", "--signal"]]) {
    const c = kjør("examples/mlb-trodata.ts", [...mangler, "--sanser2", "--ut", `${MAPPE}/x.bin`]);
    assert.notEqual(c.status, 0, `--sanser2 med bare ${mangler.join(" ")} ble godtatt`);
  }
});

test("budq-data --sanser2: 323-rader er 287-radene med stillingsblokken bakerst, og flagget krever --hukommelse", () => {
  const felles = ["--kamper", "1", "--skard", "0/1", "--verdener", "1", "--sjanse", "1", "--maksrunder", "3", "--spek", "nevro", "--hukommelse"];
  const les = (f: string): Record<string, unknown>[] =>
    readFileSync(`${ROT}/${f}`, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
  const a = kjør("examples/budq-data.ts", [...felles, "--ut", `${MAPPE}/b287.jsonl`]);
  assert.equal(a.status, 0, a.tekst);
  const b = kjør("examples/budq-data.ts", [...felles, "--sanser2", "--ut", `${MAPPE}/b323.jsonl`]);
  assert.equal(b.status, 0, b.tekst);
  const ra = les(`${MAPPE}/b287.jsonl`);
  const rb = les(`${MAPPE}/b323.jsonl`);
  assert.equal(rb.length, ra.length);
  assert.ok(rb.length >= 4);
  rb.forEach((r, i) => {
    const x = r.x as number[];
    assert.equal(x.length, BUDQ_INN_HS2);
    assert.deepEqual(x.slice(0, BUDQ_INN_H), ra[i]!.x);
    assert.deepEqual({ ...r, x: null }, { ...ra[i]!, x: null }, `rad ${i}: noe annet enn x er endret`);
    assert.ok(x[BUDQ_INN_H + STILLINGINNGANG.IGJEN]! > 0, `rad ${i}: stillingsblokken er tom`);
  });
  const c = kjør("examples/budq-data.ts", ["--kamper", "1", "--sanser2", "--ut", `${MAPPE}/x.jsonl`]);
  assert.notEqual(c.status, 0);
  assert.match(c.tekst, /krever --hukommelse/);
});
