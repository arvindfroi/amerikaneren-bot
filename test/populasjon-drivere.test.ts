/**
 * POPULASJONEN I DATAGENERATORENE (`--drivere`, `--rotasjon`, 11. sep) — `examples/drivere.ts`.
 *
 * Et blandet bord er bare verdt noe hvis det FAKTISK er blandet: at den oppgitte speken spiller
 * det oppgitte setet, i kampen og i utspillingene, og at bare kandidatens seter skrives. Ingen
 * av delene krasjer når de er feil — en generator som stille satte kandidaten i alle fire seter
 * ville skrevet like pene rader. Prøvene:
 *
 *   PARSEREN     `@`, fire felt, minst én kandidat, rotasjonen.
 *   STANDARDEN   uten flagget er utdataene byte-identiske med `--drivere "@|@|@|@"`, i alle tre.
 *                (Mot koden FØR endringen er de sjekket med sha1 på de samme røykkommandoene.)
 *   SETENE       kampen spilles på nytt her med agentene satt ut for hånd, og radene i fila må
 *                stemme. FELLE: bytt to populasjonsseter i referansen — sjekken skal slå ut.
 *   UTSPILLINGENE  BudQ- og VrakQ-etikettene er regnet mot bordets speker. FELLE: kandidaten i
 *                alle utspillingsseter gir andre etiketter.
 *   OBSERVER     en populasjonsspek med hukommelsestro kjører gjennom rundene i trodata-generatoren,
 *                og den samme stakken uten tikk kaster (ellers beviser det ingenting).
 *
 * Generatorene importeres ikke (to av dem skriver fil når de lastes); det som prøves er fila de
 * FAKTISK skriver.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeHandlinger, spillerVisning } from "../src/motor.ts";
import type { Bud } from "../src/regler.ts";
import { lagRng } from "../src/kort.ts";
import { lagIndre, STANDARDNETT } from "../src/moe2/agentspek.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { BUDQ_BUD, budqTrekk } from "../src/moe2/budq.ts";
import { vraktrekk } from "../src/moe2/vraktrekk.ts";
import { Seiersprediktor } from "../src/mlb/seier.ts";
import { troFasit } from "../src/mlb/fasit.ts";
import { MLB_TRO_HUKOMMELSE, MLB_TRO_INN, troTrekkForBredde } from "../src/mlb/trotrekk.ts";
import { lesBord, lesDrivere, slot, tilSeter } from "../examples/drivere.ts";
import { spillKamp, spillUt, type Kampagent, type Par } from "../examples/vrakq-data.ts";

const ROT = fileURLToPath(new URL("..", import.meta.url));
/** Relativ til ROT, uten kolon (`sik:` deler på «:»), ignorert av git (`/_*`), per prosess. */
const MAPPE = `_test-populasjon-${process.pid}`;
const TRO804 = `${MAPPE}/tro-804.bin`;

/**
 * Billige, ulike speker. Kandidaten byr og vraker som NevroHjerne; B byr med budmodellen. Kortnettet
 * hentes fra `agentspek.ts` (`test/spek-en-kilde.test.ts`: ingen nye håndskrevne vektstier).
 */
const KAND = `vakt:abmpf:e1:${STANDARDNETT}`;
const POP_A = "nevro";
const POP_B = `budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:e1:${STANDARDNETT}`;
/** Hukommelsestro i en POPULASJONSSTOL: kaster i runde 2 om driveren ikke viser RUNDE_SLUTT. */
const POP_BOK = `sik:foerer:0:2~mlbu=${TRO804}:${POP_B}`;

/** Nullpunktet K6 → K8 fra `test/mlb-observer-drivere.test.ts`: inngangen utvidet med nullkolonner bakerst. */
function utvidTronett(fra: string, til: string, ekstra: number): void {
  const b = readFileSync(fra);
  let p = 0;
  const int = (): number => {
    const v = b.readInt32LE(p);
    p += 4;
    return v;
  };
  const hode = (a: number, c: number): Buffer => {
    const h = Buffer.alloc(8);
    h.writeInt32LE(a, 0);
    h.writeInt32LE(c, 4);
    return h;
  };
  const deler = int();
  const lag = int();
  const biter: Buffer[] = [hode(deler, lag)];
  for (let l = 0; l < lag; l++) {
    const inn = int();
    const ut = int();
    const w = b.subarray(p, p + inn * ut * 4);
    p += inn * ut * 4;
    const bias = b.subarray(p, p + ut * 4);
    p += ut * 4;
    if (l === 0) {
      const ny = inn + ekstra;
      const nw = Buffer.alloc(ny * ut * 4);
      for (let r = 0; r < ut; r++) w.copy(nw, r * ny * 4, r * inn * 4, (r + 1) * inn * 4);
      biter.push(hode(ny, ut), nw, Buffer.from(bias));
    } else {
      biter.push(hode(inn, ut), Buffer.from(w), Buffer.from(bias));
    }
  }
  writeFileSync(til, Buffer.concat(biter));
}

before(() => {
  mkdirSync(`${ROT}/${MAPPE}`, { recursive: true });
  utvidTronett(`${ROT}/e1-modell/mlb-tro.bin`, `${ROT}/${TRO804}`, MLB_TRO_HUKOMMELSE);
});
after(() => rmSync(`${ROT}/${MAPPE}`, { recursive: true, force: true }));

function kjør(skript: string, args: readonly string[]): string {
  const r = spawnSync(process.execPath, [skript, ...args], { cwd: ROT, encoding: "utf8" });
  assert.equal(r.status, 0, `${skript} ${args.join(" ")}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

// ---------------------------------------------------------------------------
// Parseren
// ---------------------------------------------------------------------------

test("drivere: @ er kandidaten, fire felt, minst én kandidat, og rotasjonen flytter slotene", () => {
  const std = lesDrivere(null, "X");
  assert.deepEqual([std.spek, std.opptak, std.rotasjon, std.blandet], [["X", "X", "X", "X"], [true, true, true, true], false, false]);
  assert.throws(() => lesDrivere(null, "X", true), /--rotasjon uten --drivere/);

  // «@» inne i en spek (budm:<fil>@<ev>) er IKKE kandidaten; bare et felt som er nøyaktig «@».
  const b = lesDrivere("@|budm:f.json@-3.0:e1:x|@|nevro", "X");
  assert.deepEqual(b.spek, ["X", "budm:f.json@-3.0:e1:x", "X", "nevro"]);
  assert.deepEqual(b.opptak, [true, false, true, false]);
  assert.throws(() => lesDrivere("@|A|B", "X"), /4 speker/);
  assert.throws(() => lesDrivere("A|B|C|D", "X"), /minst ett «@»/);
  assert.throws(() => lesDrivere("@||A|B", "X"), /tomt/);
  assert.throws(() => lesBord(["--drivere"], "X"), /mangler verdi/);
  assert.throws(() => lesBord(["--drivere", "--rotasjon"], "X"), /mangler verdi/);

  const rot = lesBord(["--drivere", "@|A|@|B", "--rotasjon"], "X");
  assert.equal(slot(rot, 0, 1), 1);
  assert.equal(slot(rot, 3, 1), 0);
  assert.equal(slot(rot, 2, 6), 0);
  assert.deepEqual(tilSeter(rot, ["a", "b", "c", "d"], 1), ["b", "c", "d", "a"]);
  assert.deepEqual(tilSeter(b, ["a", "b", "c", "d"], 1), ["a", "b", "c", "d"], "uten rotasjon sitter slot = sete");
});

// ---------------------------------------------------------------------------
// Standarden
// ---------------------------------------------------------------------------

test("standarden: uten --drivere er alle tre generatorene byte-identiske med «@|@|@|@»", () => {
  const armer: [string, string, string[]][] = [
    ["budq", "examples/budq-data.ts", ["--spek", KAND, "--kamper", "1", "--maksrunder", "1", "--verdener", "1", "--sjanse", "1", "--hukommelse"]],
    ["vrak", "examples/vrakq-data.ts", ["--spek", KAND, "--kamper", "1", "--maksrunder", "2", "--verdener", "4", "--sjanse", "1", "--etterlyst"]],
    ["tro-kamp", "examples/mlb-trodata.ts", ["--kamp", "--hukommelse", "--kamper", "1", "--maksrunder", "2", "--sjanse", "1", "--spek", KAND]],
    ["tro-giv", "examples/mlb-trodata.ts", ["--giver", "2", "--spek", KAND]],
  ];
  for (const [navn, skript, args] of armer) {
    const a = `${MAPPE}/std-${navn}-a`;
    const b = `${MAPPE}/std-${navn}-b`;
    kjør(skript, [...args, "--ut", a]);
    kjør(skript, [...args, "--drivere", "@|@|@|@", "--ut", b]);
    const fa = readFileSync(`${ROT}/${a}`);
    assert.ok(fa.length > 200, `${navn}: røyken skrev nesten ingenting (${fa.length} byte)`);
    assert.ok(fa.equals(readFileSync(`${ROT}/${b}`)), `${navn}: «@|@|@|@» er ikke byte-identisk med standarden`);
  }
});

// ---------------------------------------------------------------------------
// mlb-trodata: setene, rotasjonen og observer
// ---------------------------------------------------------------------------

interface Trorad {
  frø: number;
  stikk: number;
  sete: number;
  f: number[];
  t: Float32Array;
}

function lesMlbt(sti: string): Trorad[] {
  const b = readFileSync(`${ROT}/${sti}`);
  assert.equal(b.toString("ascii", 0, 4), "MLBT");
  const dim = b.readInt32LE(8);
  const post = dim * 4 + 52 + 4 + 2 + 2;
  const ut: Trorad[] = [];
  for (let o = 12; o < b.length; o += post) {
    const t = new Float32Array(dim);
    for (let i = 0; i < dim; i++) t[i] = b.readFloatLE(o + i * 4);
    const p = o + dim * 4;
    const f: number[] = [];
    for (let i = 0; i < 52; i++) f.push(b.readInt8(p + i));
    ut.push({ frø: b.readInt32LE(p + 52), stikk: b.readInt16LE(p + 56), sete: b.readInt16LE(p + 58), f, t });
  }
  return ut;
}

/** REFERANSEN for `--kamp` (660 bredt, `--sjanse 1`): kamp `k` med slotene satt ut for hånd. */
function troReferanse(slots: readonly string[], opptak: readonly boolean[], rotasjon: boolean, k: number, maksRunder: number, tikk = true): Trorad[] {
  const agenter = slots.map((x) => lagIndre(x));
  for (const a of agenter) a.nyKamp();
  const iSete = (sete: number): number => (rotasjon ? (sete + k) % 4 : sete);
  const frø = 1_950_000_000 + k * 7717;
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, frø);
  const ut: Trorad[] = [];
  let vakt = 0;
  while (s.fase !== "FERDIG" && vakt++ < 500_000) {
    if (tikk) for (const a of agenter) a.observer?.(s);
    if (s.fase === "RUNDE_SLUTT") {
      if (s.rundeNr + 1 >= maksRunder) break;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    if (s.fase === "SPILL" && s.iTur !== null && opptak[iSete(s.iTur)]) {
      const f = [...troFasit(s, s.iTur)];
      if (f.some((x) => x > 0)) {
        const t = troTrekkForBredde(MLB_TRO_INN, spillerVisning(s, s.iTur), s.giving.antallStikk, s.regler.målPoeng, null);
        ut.push({ frø, stikk: s.stikkSpilt, sete: s.iTur, f, t });
      }
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, agenter[iSete(iTur)]!.velgHandling(s)).state;
  }
  return ut;
}

function trofeil(rader: readonly Trorad[], ref: readonly Trorad[]): string[] {
  if (rader.length !== ref.length) return [`${rader.length} rader i fila, referansen har ${ref.length}`];
  const feil: string[] = [];
  for (let i = 0; i < rader.length && feil.length < 5; i++) {
    const r = rader[i]!;
    const e = ref[i]!;
    if (r.frø !== e.frø || r.stikk !== e.stikk || r.sete !== e.sete) feil.push(`rad ${i}: (${r.frø}, ${r.stikk}, ${r.sete}) mot (${e.frø}, ${e.stikk}, ${e.sete})`);
    else if (r.f.some((x, j) => x !== e.f[j])) feil.push(`rad ${i}: etiketten`);
    else if (r.t.some((x, j) => !Object.is(x, e.t[j]))) feil.push(`rad ${i}: trekkene`);
  }
  return feil;
}

test("mlb-trodata --drivere --rotasjon: riktig spek i riktig sete, bare @-seter skrives — og byttede seter blir tatt", () => {
  const ut = `${MAPPE}/tro-bord.bin`;
  const drivere = `@|${POP_A}|@|${POP_BOK}`;
  const stdout = kjør("examples/mlb-trodata.ts", [
    "--kamp", "--kamper", "2", "--fra", "1", "--maksrunder", "3", "--sjanse", "1",
    "--spek", KAND, "--drivere", drivere, "--rotasjon", "--ut", ut,
  ]);
  assert.match(stdout, /Bord \(giv\/kamp 0\)/, "en blandet kjøring skal si det i loggen");
  const rader = lesMlbt(ut);
  const slots = [KAND, POP_A, KAND, POP_BOK];
  const opptak = [true, false, true, false];

  // Kamp 1 med rotasjon: sete i har slot (i+1) mod 4, så kandidaten sitter i sete 1 og 3.
  assert.ok(rader.length > 40, `bare ${rader.length} rader`);
  assert.deepEqual([...new Set(rader.map((r) => r.sete))].sort(), [1, 3], "rader fra et sete uten kandidat");
  let runder = 1;
  for (let i = 1; i < rader.length; i++) if (rader[i]!.stikk < rader[i - 1]!.stikk) runder++;
  assert.ok(runder >= 3, `radene dekker bare ${runder} runder — observer-prøven gikk ikke gjennom runde 2`);

  assert.deepEqual(trofeil(rader, troReferanse(slots, opptak, true, 1, 3)), [], "fila er ikke kampen med dette bordet");
  // FELLENE: populasjonssetene byttet, og det samme bordet uten rotasjon.
  assert.ok(trofeil(rader, troReferanse([KAND, POP_BOK, KAND, POP_A], opptak, true, 1, 3)).length > 0, "byttede populasjonsseter ble ikke tatt");
  assert.ok(trofeil(rader, troReferanse(slots, opptak, false, 1, 3)).length > 0, "manglende rotasjon ble ikke tatt");
  // Og hukommelsestroen i populasjonsstolen er ekte: uten tikk kaster den samme kampen.
  assert.throws(() => troReferanse(slots, opptak, true, 1, 3, false), /aldri vist som RUNDE_SLUTT/);
});

// ---------------------------------------------------------------------------
// budq-data: kampen, budradene og utspillingene
// ---------------------------------------------------------------------------

interface Budrad {
  runde: number;
  sete: number;
  policy: string | null;
  x: number[];
  q: Record<string, number[]>;
}

const rund2 = (x: number): number => Math.round(x * 100) / 100;

/** REFERANSEN for `budq-data` uten `--seier` og `--hukommelse`, `--sjanse 1`, kamp 0. */
function budqReferanse(slots: readonly string[], opptak: readonly boolean[], utspillSlots: readonly string[], maksRunder: number, K: number): Budrad[] {
  const kamp = slots.map((x) => lagIndre(x));
  const utspill = utspillSlots.map((x) => lagIndre(x));
  for (const a of [...kamp, ...utspill]) a.nyKamp();
  const frø = 15_000_000;
  const spillUtBud = (start: GameState, sete: number, bud: Bud): number => {
    let s = utfør(start, { type: "BUD", spiller: sete, bud }).state;
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && s.rundeNr === start.rundeNr && vakt++ < 400) {
      const i = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (i === null || i === undefined) break;
      s = utfør(s, utspill[i]!.velgHandling(s)).state;
    }
    const d = s.sisteRunde?.delta;
    if (d === undefined) return 0;
    const egne = d[sete] ?? 0;
    return egne - (d.reduce((a, x) => a + x, 0) - egne) / (d.length - 1);
  };
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, frø);
  const ut: Budrad[] = [];
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.rundeNr < maksRunder && vakt++ < 40_000) {
    for (const a of [...kamp, ...utspill]) a.observer?.(s);
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (sete === null || sete === undefined) break;
    const h = kamp[sete]!.velgHandling(s);
    if (s.fase === "BUDRUNDE" && opptak[sete]) {
      const lov = lovligeHandlinger(s);
      const kandidater = lov.fase === "BUDRUNDE" ? lov.bud.filter((b) => BUDQ_BUD.includes(b)) : [];
      if (kandidater.length >= 2) {
        const verdener = trekkVerdener(s, sete, K, lagRng((frø * 31 + ut.length * 104_729 + sete) >>> 0), undefined, undefined, 32, undefined, true);
        if (verdener.length > 0) {
          const q: Record<string, number[]> = {};
          for (const b of kandidater) q[String(b)] = verdener.map((hender) => rund2(spillUtBud(medVerden(s, hender, sete), sete, b)));
          ut.push({
            runde: s.rundeNr,
            sete,
            policy: h.type === "BUD" ? String(h.bud) : null,
            x: [...budqTrekk(s, sete, null)].map((x) => Math.round(x * 10_000) / 10_000),
            q,
          });
        }
      }
    }
    s = utfør(s, h).state;
  }
  return ut;
}

test("budq-data --drivere: budradene er kampen med dette bordet, Q er regnet mot bordet — og fellene blir tatt", () => {
  const ut = `${MAPPE}/budq-bord.jsonl`;
  kjør("examples/budq-data.ts", [
    "--spek", KAND, "--drivere", `@|${POP_A}|@|${POP_B}`, "--kamper", "1", "--maksrunder", "2",
    "--verdener", "1", "--sjanse", "1", "--ut", ut,
  ]);
  const rader = readFileSync(`${ROT}/${ut}`, "utf8").trim().split("\n").map((l) => {
    const r = JSON.parse(l) as Budrad;
    return { runde: r.runde, sete: r.sete, policy: r.policy, x: r.x, q: r.q };
  });
  assert.ok(rader.length >= 3, `bare ${rader.length} budrader`);
  assert.ok(rader.every((r) => r.sete === 0 || r.sete === 2), "budrad fra et sete uten kandidat");

  const slots = [KAND, POP_A, KAND, POP_B];
  const opptak = [true, false, true, false];
  const utenQ = (xs: readonly Budrad[]) => xs.map(({ q: _q, ...r }) => r);
  assert.deepEqual(rader, budqReferanse(slots, opptak, slots, 2, 1), "fila er ikke kampen og utspillingene med dette bordet");
  assert.notDeepEqual(
    utenQ(rader),
    utenQ(budqReferanse([KAND, POP_B, KAND, POP_A], opptak, [KAND, POP_B, KAND, POP_A], 2, 1)),
    "byttede populasjonsseter ble ikke tatt",
  );
  const kandidatOveralt = budqReferanse(slots, opptak, [KAND, KAND, KAND, KAND], 2, 1);
  assert.deepEqual(utenQ(rader), utenQ(kandidatOveralt), "utspillingene skal ikke endre kampen");
  assert.notDeepEqual(rader.map((r) => r.q), kandidatOveralt.map((r) => r.q), "Q regnet med kandidaten i alle seter ble ikke tatt");
});

// ---------------------------------------------------------------------------
// vrakq-data: vrakstillingene og utspillingene
// ---------------------------------------------------------------------------

interface Vrakrad {
  runde: number;
  sete: number;
  t: number[];
  vs: number;
  vp: number;
}

const rund = (x: number, n = 1000): number => Math.round(x * n) / n;

/**
 * REFERANSEN for `vrakq-data` uten `--kampstilling`/`--etterlyst`, `--sjanse 1`, kamp 0: policyparets rad.
 * Frøet er 23 200 000 fordi kandidatsetene ikke vant ett eneste bud i de første åtte rundene med
 * standardfrøet; en prøve uten vrakrader ville vært grønn på ingenting.
 */
function vrakReferanse(slots: readonly string[], opptak: readonly boolean[], utspillSlots: readonly string[], maksRunder: number): Vrakrad[] {
  const kamp: Kampagent[] = slots.map((x) => lagIndre(x));
  const utspill: Kampagent[] = utspillSlots.map((x) => lagIndre(x));
  const ref = lagIndre(KAND);
  const prediktor = Seiersprediktor.fraFil(`${ROT}/e1-modell/seier-g0.bin`);
  const frø = 23_200_000;
  for (const a of kamp) a.nyKamp();
  const ut: Vrakrad[] = [];
  spillKamp(opprettSpill({ antallSpillere: 4, målPoeng: 100 }, frø), kamp, [...kamp, ...utspill, ref], maksRunder, (x, sete) => {
    if (!opptak[sete]) return;
    const hånd = (x.hender[sete] ?? []).slice();
    const h = ref.velgHandling(x);
    if (h.type !== "VRAK") return;
    const v = ref.velgHandling(utfør(x, h).state);
    if (v.type !== "VELG") return;
    const par: Par = { trumf: v.trumf, vrak: h.kort.slice() };
    const verdener = trekkVerdener(x, sete, 4, lagRng((frø * 31 + ut.length * 104_729 + sete) >>> 0), undefined, undefined, 32, undefined, true);
    if (verdener.length < 4) return;
    const u = verdener.map((hender) => spillUt(utspill, prediktor, medVerden(x, hender, sete), sete, par));
    ut.push({
      runde: x.rundeNr,
      sete,
      t: Array.from(vraktrekk(x, sete, hånd, par.vrak, par.trumf), (z) => rund(z, 10_000)),
      vs: rund(u.reduce((a, y) => a + y.vs, 0) / u.length),
      vp: rund(u.reduce((a, y) => a + y.vp, 0) / u.length),
    });
  });
  return ut;
}

test("vrakq-data --drivere: vrakradene er kampen med dette bordet, utspillingene bruker bordets speker — og fellene blir tatt", () => {
  const ut = `${MAPPE}/vrak-bord.jsonl`;
  kjør("examples/vrakq-data.ts", [
    "--spek", KAND, "--drivere", `@|${POP_A}|@|${POP_B}`, "--kamper", "1", "--maksrunder", "7",
    "--verdener", "4", "--sjanse", "1", "--froe", "23200000", "--ut", ut,
  ]);
  const rader: Vrakrad[] = readFileSync(`${ROT}/${ut}`, "utf8").trim().split("\n").map((l) => {
    const r = JSON.parse(l) as { runde: number; sete: number; kand: { t: number[]; vs: number; vp: number; nevro?: number }[] };
    const p = r.kand.find((c) => c.nevro === 1);
    assert.ok(p !== undefined, `runde ${r.runde}: policyparet er ikke merket`);
    return { runde: r.runde, sete: r.sete, t: p.t, vs: p.vs, vp: p.vp };
  });
  assert.ok(rader.length >= 1, "ingen vrakrader — kandidaten vant aldri budet, prøven prøver ingenting");
  assert.ok(rader.every((r) => r.sete === 0 || r.sete === 2), "vrakrad der budvinneren ikke er kandidaten");

  const slots = [KAND, POP_A, KAND, POP_B];
  const opptak = [true, false, true, false];
  assert.deepEqual(rader, vrakReferanse(slots, opptak, slots, 7), "fila er ikke kampen og utspillingene med dette bordet");
  const stilling = (xs: readonly Vrakrad[]) => xs.map((r) => [r.runde, r.sete, r.t]);
  assert.notDeepEqual(
    stilling(rader),
    stilling(vrakReferanse([KAND, POP_B, KAND, POP_A], opptak, [KAND, POP_B, KAND, POP_A], 7)),
    "byttede populasjonsseter ble ikke tatt",
  );
  const kandidatOveralt = vrakReferanse(slots, opptak, [KAND, KAND, KAND, KAND], 7);
  assert.deepEqual(stilling(rader), stilling(kandidatOveralt), "utspillingene skal ikke endre kampen");
  assert.notDeepEqual(rader.map((r) => [r.vs, r.vp]), kandidatOveralt.map((r) => [r.vs, r.vp]), "utspilling med kandidaten i alle seter ble ikke tatt");
});
