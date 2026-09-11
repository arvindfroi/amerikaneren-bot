/**
 * TROSDATA FRA MENNESKEKAMPER (`examples/mlb-trodata.ts --menneske`, 11. sep).
 *
 * Et korpus fra innspilte kamper ser riktig ut også når det er feil: alle tall endelige, alle
 * etiketter lovlige, riktig dim i hodet. Prøvene går etter de måtene det kan være feil på uten
 * at noe krasjer:
 *
 *   1. GJENSKAPINGEN ER IKKE KAMPEN   radene sammenliknes BIT FOR BIT med referanserader bygd av
 *                                     FASITTILSTANDENE loggen ble spilt med (`menneske-syntetisk.ts`),
 *                                     med 920 satt sammen av DELENE (776-trekkene og en egen bok),
 *                                     som i `mlb-trodata-kamp.test.ts`. FELLE: etiketten forskjøvet
 *                                     én rad skal tas.
 *   2. BOKA MISTET EN RUNDE           kampslutt (FERDIG) må vises som rundeslutt, ellers mangler
 *                                     runden i boka for neste runde. FELLE: referansen med en bok
 *                                     som fikk FERDIG rått, skal avvike fra fila.
 *   3. BÅNDENE ER IKKE DISJUNKTE      trening og holdout har ingen kamp felles og dekker alle.
 *   4. EN RUNDE SOM IKKE STEMMER      loggens `delta` endret → runden avvises, ingen rader fra den,
 *      BLIR LIKEVEL RADER             og boka startes på nytt (nullblokk i runden etter).
 *
 * Og standarden uten `--menneske` er det den var: `mlb-trodata-kamp.test.ts` holder den, og sha1
 * av tre små kjøringer var lik før og etter flagget kom inn (11. sep).
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { spillerVisning, type GameState } from "../src/motor.ts";
import { troFasit } from "../src/mlb/fasit.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import { MLB_TRO_INN, MLB_TRO_INN_H, MLB_TRO_INN_HS, MLB_TRO_INN_S, troTrekkForBredde } from "../src/mlb/trotrekk.ts";
import { fnv, halvdel, menneskeBånd, skardAv, somRundeslutt } from "../examples/menneske-logg.ts";
import { syntetiskLogg, type Fasitkamp, type SyntetiskKamp } from "./menneske-syntetisk.ts";

const ROT = fileURLToPath(new URL("..", import.meta.url));
const MAPPE = `_test-trodata-menneske-${process.pid}`;
const FILER = ["d7alle.bin", "vrakrang.bin", "bud-menneske.json"].map((f) => `${ROT}/e1-modell/${f}`);
const skip = FILER.some((f) => !existsSync(f)) ? "mangler e1-modell (ikke sporet)" : false;

before(() => mkdirSync(`${ROT}/${MAPPE}`, { recursive: true }));
after(() => rmSync(`${ROT}/${MAPPE}`, { recursive: true, force: true }));

function kjør(args: readonly string[]): { status: number | null; tekst: string } {
  const r = spawnSync(process.execPath, ["examples/mlb-trodata.ts", ...args], { cwd: ROT, encoding: "utf8" });
  return { status: r.status, tekst: `${r.stdout}\n${r.stderr}` };
}

interface Rad {
  t: Float32Array;
  f: Int8Array;
  frø: number;
  stikk: number;
  sete: number;
}

function lesMlbt(sti: string): { dim: number; rader: Rad[] } {
  const b = readFileSync(`${ROT}/${sti}`);
  assert.equal(b.toString("ascii", 0, 4), "MLBT");
  const dim = b.readInt32LE(8);
  const post = dim * 4 + 52 + 4 + 2 + 2;
  assert.equal((b.length - 12) % post, 0);
  const rader: Rad[] = [];
  for (let o = 12; o < b.length; o += post) {
    const t = new Float32Array(dim);
    for (let i = 0; i < dim; i++) t[i] = b.readFloatLE(o + i * 4);
    const p = o + dim * 4;
    const f = new Int8Array(52);
    for (let i = 0; i < 52; i++) f[i] = b.readInt8(p + i);
    rader.push({ t, f, frø: b.readInt32LE(p + 52), stikk: b.readInt16LE(p + 56), sete: b.readInt16LE(p + 58) });
  }
  return { dim, rader };
}

/** Kamp-id-er i et gitt bånd, funnet ved å prøve (båndet er en hash og kan ikke velges direkte). */
function idIBånd(bånd: "trening" | "holdout", n: number, prefiks: string): string[] {
  const ut: string[] = [];
  for (let i = 0; ut.length < n; i++) if (menneskeBånd(`${prefiks}${i}`) === bånd) ut.push(`${prefiks}${i}`);
  return ut;
}

interface Ref {
  frø: number;
  stikk: number;
  sete: number;
  runde: number;
  f: number[];
  t: Float32Array;
}

/**
 * REFERANSEN, av fasittilstandene: én bok per kamp som ser hver tilstand, og hver SPILL-stilling
 * med ukjente kort (driveren kjøres med `--sjanse 1`). `rå` = boka får FERDIG uten omskriving (fella).
 * `hopp` = runder (kamp-id|rundeNr) som skal være avvist: ingen rader, og ny bok etter dem.
 */
function referanse(fasit: readonly Fasitkamp[], rå = false, hopp: ReadonlySet<string> = new Set()): Ref[] {
  const ut: Ref[] = [];
  for (const k of fasit) {
    let bok = new Hukommelse();
    for (const r of k.runder) {
      if (hopp.has(`${k.spillId}|${r.rundeNr}`)) {
        bok = new Hukommelse();
        continue;
      }
      for (const s0 of r.tilstander) {
        const s: GameState = rå ? s0 : somRundeslutt(s0);
        bok.observer(s);
        if (s.fase !== "SPILL" || s.iTur === null) continue;
        const sete = s.iTur;
        const f = [...troFasit(s, sete)];
        if (!f.some((x) => x > 0)) continue;
        const t776 = troTrekkForBredde(MLB_TRO_INN_S, spillerVisning(s, sete), s.giving.antallStikk, s.regler.målPoeng, null);
        const t = new Float32Array(MLB_TRO_INN_HS);
        t.set(t776.subarray(0, MLB_TRO_INN), 0);
        t.set(bok.vektor(sete, 4), MLB_TRO_INN);
        t.set(t776.subarray(MLB_TRO_INN), MLB_TRO_INN_H);
        ut.push({ frø: k.frø | 0, stikk: s.stikkSpilt, sete, runde: r.rundeNr, f, t });
      }
    }
  }
  return ut;
}

function radfeil(rader: readonly Rad[], ref: readonly Ref[]): string[] {
  if (rader.length !== ref.length) return [`${rader.length} rader i fila, referansen har ${ref.length}`];
  const feil: string[] = [];
  for (let i = 0; i < rader.length && feil.length < 6; i++) {
    const r = rader[i]!;
    const e = ref[i]!;
    if (r.frø !== e.frø || r.stikk !== e.stikk || r.sete !== e.sete) {
      feil.push(`rad ${i}: (frø ${r.frø}, stikk ${r.stikk}, sete ${r.sete}) mot (${e.frø}, ${e.stikk}, ${e.sete})`);
      continue;
    }
    if (e.f.some((x, k) => x !== r.f[k])) feil.push(`rad ${i}: etiketten er ikke troFasit`);
    const k = r.t.findIndex((x, j) => !Object.is(x, e.t[j]));
    if (k >= 0) feil.push(`rad ${i} (runde ${e.runde}): trekk ${k} er ${r.t[k]}, referansen ${e.t[k]}`);
  }
  return feil;
}

const [T0, T1] = idIBånd("trening", 2, "tm");
const [H0] = idIBånd("holdout", 1, "tm");
/**
 * Kamp T0: runde 1 starter på 99-99-99-99, så motoren når målet (FERDIG), og runde 2 spilles fra en
 * annen tavle — «mennesket spilte videre». Samme frø og tavler som `duplikat-menneske.test.ts`.
 */
const KAMPER: SyntetiskKamp[] = [
  { spillId: T0!, frø: 8_800_003, spiller: "p-a", målPoeng: 100, runder: [{ rundeNr: 0 }, { rundeNr: 1, før: [99, 99, 99, 99] }, { rundeNr: 2, før: [40, 40, 40, 40] }] },
  { spillId: H0!, frø: 8_800_011, spiller: "p-b", målPoeng: 100, runder: [{ rundeNr: 0 }, { rundeNr: 1 }] },
  { spillId: T1!, frø: 8_800_004, spiller: "p-a", målPoeng: 100, runder: [{ rundeNr: 0 }, { rundeNr: 1 }, { rundeNr: 2 }] },
];

let logg: ReturnType<typeof syntetiskLogg> | null = null;
const lagLogg = (): ReturnType<typeof syntetiskLogg> => (logg ??= syntetiskLogg(KAMPER));

test("--menneske --hukommelse --signal: radene er fasittilstandenes 920-rader bit for bit, og kampslutt er med i boka", { skip }, () => {
  const { linjer, fasit } = lagLogg();
  const siste = fasit[0]!.runder[1]!.tilstander.at(-1)!;
  assert.equal(siste.fase, "FERDIG", "runde 1 i kamp T0 nådde ikke målet — kampslutt-fella er ikke spilt");
  const data = `${MAPPE}/hendelser.jsonl`;
  writeFileSync(`${ROT}/${data}`, `${linjer.join("\n")}\n`);
  const ut = `${MAPPE}/trening.bin`;
  const r = kjør(["--menneske", data, "--band", "trening", "--hukommelse", "--signal", "--sjanse", "1", "--ut", ut]);
  assert.equal(r.status, 0, r.tekst);
  assert.match(r.tekst, /6\/6 runder gjenskapt \(0 med budavvik, 1 kampslutt/);
  const { dim, rader } = lesMlbt(ut);
  assert.equal(dim, MLB_TRO_INN_HS);

  const trening = fasit.filter((k) => menneskeBånd(k.spillId) === "trening");
  const ref = referanse(trening);
  assert.ok(ref.length > 200, `bare ${ref.length} referanserader`);
  assert.deepEqual(radfeil(rader, ref), []);

  // Boka: null i runde 0, ikke-null fra runde 1 — også i runden etter kampslutten.
  for (let i = 0; i < ref.length; i++) {
    const tom = rader[i]!.t.subarray(MLB_TRO_INN, MLB_TRO_INN_H).every((x) => x === 0);
    assert.equal(tom, ref[i]!.runde === 0, `rad ${i} (runde ${ref[i]!.runde}): hukommelsesblokken ${tom ? "er" : "er ikke"} null`);
  }

  // FELLE 1: etiketten forskjøvet én rad.
  const skjøvet = rader.map((x, i) => ({ ...x, f: rader[(i + 1) % rader.length]!.f }));
  assert.ok(radfeil(skjøvet, ref).some((m) => m.includes("etiketten")), "forskjøvne etiketter ble ikke tatt");
  // FELLE 2: en bok som fikk FERDIG rått, har ikke runde 1 i T0 — runde 2 skal da avvike.
  assert.ok(radfeil(rader, referanse(trening, true)).some((m) => m.includes("runde 2")), "boka uten kampslutt-runden ble ikke tatt");
});

test("--band trening og --band holdout: disjunkte på kamp, og sammen dekker de alle", { skip }, () => {
  const { linjer, fasit } = lagLogg();
  const data = `${MAPPE}/hendelser-baand.jsonl`;
  writeFileSync(`${ROT}/${data}`, `${linjer.join("\n")}\n`);
  const frø = (band: string): Set<number> => {
    const ut = `${MAPPE}/${band}.bin`;
    const r = kjør(["--menneske", data, "--band", band, "--signal", "--sjanse", "1", "--ut", ut]);
    assert.equal(r.status, 0, r.tekst);
    const l = lesMlbt(ut);
    assert.equal(l.dim, MLB_TRO_INN_S, "uten --hukommelse er --menneske 776 bred med --signal");
    return new Set(l.rader.map((x) => x.frø));
  };
  const t = frø("trening");
  const h = frø("holdout");
  assert.deepEqual([...h], [KAMPER[1]!.frø]);
  assert.deepEqual([...t].sort(), [KAMPER[0]!.frø, KAMPER[2]!.frø].sort());
  assert.equal([...t].filter((x) => h.has(x)).length, 0);
  assert.equal(t.size + h.size, fasit.length);

  // Andelen holdout over mange id-er: hver fjerde, og like ofte i begge halvdelene og alle fire skardene.
  const uavhengig = (bånd: (id: string) => boolean): string[] => {
    const feil: string[] = [];
    const perHalvdel = [0, 0];
    const perSkard = [0, 0, 0, 0];
    let hold = 0;
    for (let i = 0; i < 8000; i++) {
      const id = `x${i}`;
      if (!bånd(id)) continue;
      hold++;
      perHalvdel[halvdel(id)]!++;
      perSkard[skardAv(id, 4)]!++;
    }
    if (hold < 1800 || hold > 2200) feil.push(`holdout-andel ${hold}/8000`);
    if (perHalvdel.some((n) => Math.abs(n - hold / 2) > 150)) feil.push(`holdout per halvdel ${perHalvdel.join("/")}`);
    if (perSkard.some((n) => Math.abs(n - hold / 4) > 120)) feil.push(`holdout per skard ${perSkard.join("/")}`);
    return feil;
  };
  assert.deepEqual(uavhengig((id) => menneskeBånd(id) === "holdout"), []);
  // FELLE: båndet slik det sto først (11. sep) — FNV uten blanding — la all holdout i én halvdel.
  assert.ok(
    uavhengig((id) => fnv(`hold:${id}`) % 4 === 0).some((m) => m.includes("per halvdel")),
    "et bånd som følger halvdelen ble ikke tatt",
  );
});

test("en runde med feil delta avvises: ingen rader fra den, og boka startes på nytt", { skip }, () => {
  const { linjer, fasit } = lagLogg();
  const endret = linjer.map((l) => {
    const h = JSON.parse(l) as { spillId: string; type: string; data: { rundeNr: number; delta: number[] } };
    if (h.spillId !== T1 || h.type !== "runde" || h.data.rundeNr !== 1) return l;
    h.data.delta = h.data.delta.map((x, i) => (i === 0 ? x + 1 : x));
    return JSON.stringify(h);
  });
  const data = `${MAPPE}/hendelser-feil.jsonl`;
  writeFileSync(`${ROT}/${data}`, `${endret.join("\n")}\n`);
  const ut = `${MAPPE}/feil.bin`;
  const r = kjør(["--menneske", data, "--band", "trening", "--hukommelse", "--signal", "--sjanse", "1", "--ut", ut]);
  assert.equal(r.status, 0, r.tekst);
  assert.match(r.tekst, /5\/6 runder gjenskapt.*avvist: \{"delta":1\}/);
  const { rader } = lesMlbt(ut);
  const trening = fasit.filter((k) => menneskeBånd(k.spillId) === "trening");
  const ref = referanse(trening, false, new Set([`${T1}|1`]));
  assert.deepEqual(radfeil(rader, ref), []);
  // Runde 2 i T1 har en tom bok: kortere hukommelse, aldri gal.
  const r2 = ref.map((x, i) => [x, i] as const).filter(([x]) => x.frø === KAMPER[2]!.frø && x.runde === 2);
  assert.ok(r2.length > 10);
  for (const [, i] of r2) assert.ok(rader[i]!.t.subarray(MLB_TRO_INN, MLB_TRO_INN_H).every((x) => x === 0));
  // Fella: uten avvisningen ville referansen hatt runde 1-radene, og fila har dem ikke.
  assert.notDeepEqual(radfeil(rader, referanse(trening)), []);
});

test("--menneske avviser flagg som ikke gjelder: --kamp, --giver", () => {
  const a = kjør(["--menneske", "finnes-ikke.jsonl", "--kamp", "--ut", `${MAPPE}/x.bin`]);
  assert.notEqual(a.status, 0);
  assert.match(a.tekst, /--menneske og --kamp utelukker hverandre/);
  const b = kjør(["--menneske", "finnes-ikke.jsonl", "--giver", "3", "--ut", `${MAPPE}/x.bin`]);
  assert.notEqual(b.status, 0);
  assert.match(b.tekst, /--giver gjelder ikke --menneske/);
});
