/**
 * TROSDATA FRA HELE KAMPER (`examples/mlb-trodata.ts --kamp`, 11. sep).
 *
 * Et 804/920-korpus ser riktig ut selv når det er feil: alle tall endelige, alle
 * etiketter lovlige, riktig dim i hodet. De tre måtene det kan være feil på, og som
 * ingen krasj avslører, er det prøvene her går etter:
 *
 *   1. HUKOMMELSEN BLE ALDRI MATET   blokken er null i hver rad, og nettet lærer at den
 *                                    ikke betyr noe. Prøvd med en FELLE: den samme sjekken
 *                                    på en kopi med nullet blokk skal slå ut.
 *   2. BOKA SÅ DEN PÅGÅENDE RUNDEN   blokken endrer seg midt i en runde (K2-brudd). Også
 *                                    med felle.
 *   3. LAYOUTEN ER EN ANNEN ENN NETTET LESER  920 er 804 + signal, så signalblokken står
 *                                    ETTER hukommelsen. Radene sammenliknes derfor bit for
 *                                    bit med en referanse bygd av DELENE (776-trekkene og
 *                                    en egen bok), ikke med samme uttrykk som driveren.
 *
 * Referansen spiller kampen på nytt her i testen, med egne agenter og egen bok. Driveren
 * importeres ikke — den er et skript som skriver fil når den lastes — så det som prøves er
 * fila den FAKTISK skriver.
 *
 * Og standarden uten `--kamp` skal være det den var: samme stillinger, samme bytes.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { spillerVisning } from "../src/motor.ts";
import { lagIndre, ADAMS_MAALT } from "../src/moe2/agentspek.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { lagRng } from "../src/kort.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { troFasit } from "../src/mlb/fasit.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import {
  MLB_TRO_HUKOMMELSE,
  MLB_TRO_INN,
  MLB_TRO_INN_H,
  MLB_TRO_INN_HS,
  MLB_TRO_INN_S,
  troTrekkForBredde,
} from "../src/mlb/trotrekk.ts";

const ROT = fileURLToPath(new URL("..", import.meta.url));
/** Relativ til ROT og ignorert av git (`/_*`). Per prosess, så parallelle kjøringer ikke deler fil. */
const MAPPE = `_test-trodata-kamp-${process.pid}`;

/** Båndene fra toppen av `examples/mlb-trodata.ts`. Knyttet til driveren av prøvene under. */
const KAMP_TRENING = { base: 1_950_000_000, steg: 7717, maks: 4_000 };
const KAMP_HOLDOUT = { base: 1_985_000_000, steg: 7717, maks: 1_500 };

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

/** MLBT: «MLBT», versjon, dim, og så poster à dim×f32 + 52×i8 + i32 + i16 + i16. */
function lesMlbt(sti: string): { dim: number; rader: Rad[] } {
  const b = readFileSync(`${ROT}/${sti}`);
  assert.equal(b.toString("ascii", 0, 4), "MLBT", "magien mangler");
  assert.equal(b.readInt32LE(4), 1, "versjon");
  const dim = b.readInt32LE(8);
  const post = dim * 4 + 52 + 4 + 2 + 2;
  assert.equal((b.length - 12) % post, 0, `fila er ikke et helt antall poster à ${post} byte`);
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

interface Stilling {
  s: GameState;
  sete: number;
  runde: number;
  f: number[];
  /** Referansens egen bok for setet, lest i det stillingen oppsto. */
  huk: Float64Array;
}

/**
 * REFERANSEN: én kamp med fire `ADAMS_MAALT`, egen bok, `observer` på alt — og HVER
 * spillestilling med ukjente kort (driveren kjøres med `--sjanse 1`).
 */
function referansekamp(frø: number, maksRunder: number): Stilling[] {
  const agenter = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
  for (const a of agenter) a.nyKamp();
  const bok = new Hukommelse();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, frø);
  const ut: Stilling[] = [];
  let vakt = 0;
  while (s.fase !== "FERDIG" && vakt++ < 50_000) {
    bok.observer(s);
    for (const a of agenter) a.observer?.(s);
    if (s.fase === "RUNDE_SLUTT") {
      if (s.rundeNr + 1 >= maksRunder) break;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    if (s.fase === "SPILL" && s.iTur !== null) {
      const f = [...troFasit(s, s.iTur)];
      if (f.some((x) => x > 0)) ut.push({ s, sete: s.iTur, runde: s.rundeNr, f, huk: bok.vektor(s.iTur, 4) });
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, agenter[iTur]!.velgHandling(s)).state;
  }
  return ut;
}

/** Rad mot referanse, bit for bit, med 920 bygd av DELENE: 660 | bok | signal. */
function radfeil(rader: readonly Rad[], ref: readonly Stilling[], frø: number): string[] {
  if (rader.length !== ref.length) return [`${rader.length} rader i fila, referansen har ${ref.length}`];
  const feil: string[] = [];
  for (let i = 0; i < rader.length && feil.length < 8; i++) {
    const r = rader[i]!;
    const e = ref[i]!;
    if (r.frø !== frø || r.stikk !== e.s.stikkSpilt || r.sete !== e.sete) {
      feil.push(`rad ${i}: (frø ${r.frø}, stikk ${r.stikk}, sete ${r.sete}) mot (${frø}, ${e.s.stikkSpilt}, ${e.sete})`);
      continue;
    }
    if (e.f.some((x, k) => x !== r.f[k])) feil.push(`rad ${i}: etiketten er ikke troFasit`);
    const t776 = troTrekkForBredde(MLB_TRO_INN_S, spillerVisning(e.s, e.sete), e.s.giving.antallStikk, e.s.regler.målPoeng, null);
    const venter = new Float32Array(MLB_TRO_INN_HS);
    venter.set(t776.subarray(0, MLB_TRO_INN), 0);
    venter.set(e.huk, MLB_TRO_INN);
    venter.set(t776.subarray(MLB_TRO_INN), MLB_TRO_INN_H);
    const k = r.t.findIndex((x, j) => !Object.is(x, venter[j]));
    if (k >= 0) feil.push(`rad ${i} (runde ${e.runde}): trekk ${k} er ${r.t[k]}, referansen ${venter[k]}`);
  }
  return feil;
}

/**
 * DEN SJEKKEN FELLENE RETTES MOT: er hukommelsesblokken matet, og BARE med ferdige runder?
 * Null i runde 0, ikke-null fra runde 1, og bit-identisk gjennom hele runden for setet.
 */
function hukommelsesfeil(rader: readonly Rad[], runder: readonly number[]): string[] {
  const feil: string[] = [];
  const førsteIRunden = new Map<string, Float32Array>();
  for (let i = 0; i < rader.length; i++) {
    const blokk = rader[i]!.t.subarray(MLB_TRO_INN, MLB_TRO_INN_H);
    const tom = blokk.every((x) => x === 0);
    const runde = runder[i]!;
    if (runde === 0 && !tom) feil.push(`rad ${i}: hukommelse i runde 0 — boka så noe før en runde var ferdig`);
    if (runde >= 1 && tom) feil.push(`rad ${i}: hukommelsesblokken er null i runde ${runde} — boka ble ikke matet`);
    const nøkkel = `${runde}|${rader[i]!.sete}`;
    const første = førsteIRunden.get(nøkkel);
    if (første === undefined) førsteIRunden.set(nøkkel, blokk);
    else if (første.some((x, j) => !Object.is(x, blokk[j]))) {
      feil.push(`rad ${i}: hukommelsen endret seg MIDT i runde ${runde} — boka ser den pågående runden`);
    }
  }
  return feil;
}

test("--kamp --hukommelse --signal: 920-rader er 660 | bok | signal, og boka er matet med ferdige runder", () => {
  const ut = `${MAPPE}/kamp-920.bin`;
  const r = kjør(["--kamp", "--hukommelse", "--signal", "--kamper", "1", "--maksrunder", "3", "--sjanse", "1", "--ut", ut]);
  assert.equal(r.status, 0, r.tekst);
  const { dim, rader } = lesMlbt(ut);
  assert.equal(dim, MLB_TRO_INN_HS);
  assert.equal(MLB_TRO_INN_HS, MLB_TRO_INN + MLB_TRO_HUKOMMELSE + (MLB_TRO_INN_S - MLB_TRO_INN));

  const ref = referansekamp(KAMP_TRENING.base, 3);
  assert.deepEqual(radfeil(rader, ref, KAMP_TRENING.base), []);

  const runder = ref.map((x) => x.runde);
  for (const n of [0, 1, 2]) assert.ok(runder.filter((x) => x === n).length > 10, `for få rader i runde ${n}`);
  assert.deepEqual(hukommelsesfeil(rader, runder), []);

  // FELLE 1: en driver som aldri matet boka gir nøyaktig dette — `troTrekkForBredde(920, …, null)`.
  const umatet = rader.map((x) => {
    const t = x.t.slice();
    t.fill(0, MLB_TRO_INN, MLB_TRO_INN_H);
    return { ...x, t };
  });
  assert.ok(
    hukommelsesfeil(umatet, runder).some((m) => m.includes("ikke matet")),
    "en nullet hukommelsesblokk i runde ≥ 1 ble ikke tatt — sjekken over beviser da ingenting",
  );
  // FELLE 2: en bok som bokfører den pågående runden endrer blokken midt i runden.
  const i = runder.lastIndexOf(1);
  const lekk = rader.map((x, j) => {
    if (j !== i) return x;
    const t = x.t.slice();
    t[MLB_TRO_INN + 47] = t[MLB_TRO_INN + 47]! + 0.25;
    return { ...x, t };
  });
  assert.ok(
    hukommelsesfeil(lekk, runder).some((m) => m.includes("MIDT i runde")),
    "en hukommelse som endret seg midt i runden ble ikke tatt",
  );
});

test("standarden uten --kamp er uendret: én runde per giv, 660 trekk, samme utvalg", () => {
  const ut = `${MAPPE}/standard.bin`;
  const r = kjør(["--giver", "3", "--ut", ut]);
  assert.equal(r.status, 0, r.tekst);
  const { dim, rader } = lesMlbt(ut);
  assert.equal(dim, MLB_TRO_INN);

  // Den gamle løkka, skrevet av igjen: samme rng, samme sjanse, samme frø, boka null.
  let rng = 8_675_309;
  const tilfeldig = (): number => {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  };
  const agenter = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
  const ref: { s: GameState; sete: number; frø: number; f: number[] }[] = [];
  for (let g = 0; g < 3; g++) {
    const frø = 41_000_000 + g * 7717;
    let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
    for (const a of agenter) a.nyKamp();
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
      if (s.fase === "SPILL" && s.iTur !== null && tilfeldig() < 0.5) {
        const f = [...troFasit(s, s.iTur)];
        if (f.some((x) => x > 0)) ref.push({ s, sete: s.iTur, frø, f });
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      s = utfør(s, agenter[iTur]!.velgHandling(s)).state;
    }
  }
  assert.equal(rader.length, ref.length);
  for (let i = 0; i < ref.length; i++) {
    const e = ref[i]!;
    const r2 = rader[i]!;
    assert.deepEqual([r2.frø, r2.stikk, r2.sete], [e.frø, e.s.stikkSpilt, e.sete], `rad ${i}`);
    assert.deepEqual([...r2.f], e.f, `rad ${i}: etiketten`);
    const t = troTrekkForBredde(MLB_TRO_INN, spillerVisning(e.s, e.sete), e.s.giving.antallStikk, e.s.regler.målPoeng, null);
    assert.ok(r2.t.every((x, k) => Object.is(x, t[k])), `rad ${i}: trekkene er ikke de gamle 660`);
  }
});

test("frøbåndene: kamp k har frø base + k·7717, toppen er inne i int32, og ut over båndet avvises", () => {
  // Øverste kamp i treningsbåndet — der `frø | 0` ville slått om til negativt om båndet lå for høyt.
  const topp = `${MAPPE}/topp.bin`;
  const a = kjør(["--kamp", "--kamper", String(KAMP_TRENING.maks), "--fra", String(KAMP_TRENING.maks - 1), "--maksrunder", "1", "--sjanse", "1", "--ut", topp]);
  assert.equal(a.status, 0, a.tekst);
  const toppFrø = KAMP_TRENING.base + (KAMP_TRENING.maks - 1) * KAMP_TRENING.steg;
  const ta = lesMlbt(topp);
  assert.equal(ta.dim, MLB_TRO_INN, "uten --hukommelse og --signal er --kamp 660 bred");
  assert.ok(ta.rader.length > 0 && ta.rader.every((x) => x.frø === toppFrø), `frøet i fila er ikke ${toppFrø}`);

  const hold = `${MAPPE}/holdout.bin`;
  const b = kjør(["--kamp", "--band", "holdout", "--kamper", "1", "--maksrunder", "1", "--sjanse", "1", "--ut", hold]);
  assert.equal(b.status, 0, b.tekst);
  assert.ok(lesMlbt(hold).rader.every((x) => x.frø === KAMP_HOLDOUT.base));

  const c = kjør(["--kamp", "--kamper", String(KAMP_TRENING.maks + 1), "--ut", `${MAPPE}/x.bin`]);
  assert.notEqual(c.status, 0);
  assert.match(c.tekst, /avsatt til 4000 kamper/);
  const d = kjør(["--kamp", "--band", "holdout", "--kamper", String(KAMP_HOLDOUT.maks + 1), "--ut", `${MAPPE}/x.bin`]);
  assert.notEqual(d.status, 0);
  // Og hukommelse uten hele kamper er et korpus med bare nuller — avvist, ikke skrevet.
  const e = kjør(["--hukommelse", "--giver", "1", "--ut", `${MAPPE}/x.bin`]);
  assert.notEqual(e.status, 0);
  assert.match(e.tekst, /--hukommelse krever --kamp/);

  /**
   * DISJUNKT FRA DET SOM ER DOKUMENTERT. Grensene er rause der båndet er åpent oppover
   * (kampantallet er et flagg). Et nytt bånd i repoet hører til i denne lista.
   */
  const brukt: [string, number, number][] = [
    ["tro-noyaktighet / mlb-k8", 12_000_000, 12_000_000 + 100_000 * 6151],
    ["budq-data", 15_000_000, 16_000_000],
    ["vrakq-data", 23_000_000, 24_000_000],
    ["trodata trening", 41_000_000, 41_000_000 + 99_999 * 7717],
    ["kamp.ts / kampport.sh", 700_000_000, 700_000_000 + 10_000 * 7717],
    ["trodata holdout", 1_100_000_000, 1_100_000_000 + 19_999 * 7717],
    ["mlb-epoke selvspill", 1_300_000_000, 1_500_000_000],
    ["analyse/126-sveip", 1_600_000_000, 1_600_000_000 + 10_000 * 7717],
    ["analyse/126-roeyk", 1_700_000_000, 1_750_000_000 + 10_000 * 7717],
    ["mlb-port bånd 0", 1_800_000_000, 1_800_000_000 + 5_000 * 7717],
    ["mlb-port bånd 1", 1_850_000_000, 1_850_000_000 + 5_000 * 7717],
    ["styrkebåndet", 1_900_000_000, 1_900_000_000 + 5_000 * 7717],
    ["mlb-data trening", 2_000_000_000, 2_000_000_000 + 99_999 * 7717],
  ];
  for (const [navn, b0, b1] of [
    ["kamp-trening", KAMP_TRENING.base, toppFrø],
    ["kamp-holdout", KAMP_HOLDOUT.base, KAMP_HOLDOUT.base + (KAMP_HOLDOUT.maks - 1) * KAMP_HOLDOUT.steg],
  ] as const) {
    assert.ok(b1 <= 0x7fffffff, `${navn} går over int32`);
    for (const [annet, a0, a1] of brukt) assert.ok(b1 < a0 || b0 > a1, `${navn} overlapper ${annet}`);
  }
  assert.ok(toppFrø < KAMP_HOLDOUT.base, "trenings- og holdoutbåndet for --kamp overlapper");
});

// ---------------------------------------------------------------------------
// K2: raden er blind for de skjulte kortene, også med boka i
// ---------------------------------------------------------------------------

type Bygger = (s: GameState, sete: number, bok: Hukommelse) => Float32Array;

/** Uttrykket driveren bruker i `--kamp --hukommelse --signal`; prøvd lik fila i første test. */
const ærlig: Bygger = (s, sete, bok) =>
  troTrekkForBredde(MLB_TRO_INN_HS, spillerVisning(s, sete), s.giving.antallStikk, s.regler.målPoeng, bok.vektor(sete, s.antallSpillere));

/** KONTROLLEN: den samme vektoren pluss en sum over naboens skjulte hånd. */
const jukser: Bygger = (s, sete, bok) => {
  const v = ærlig(s, sete, bok);
  v[0] = v[0]! + (s.hender[(sete + 1) % s.antallSpillere] ?? []).reduce((a, k) => a + kortIndeks(k), 0);
  return v;
};

/**
 * Stillinger fra runde 1 i en kamp — der boka har en ferdig runde i seg — med de skjulte
 * hendene byttet mot forenlige verdener. Boka er bordets og deles av begge sider: at den
 * bare ser ferdige runder, holder `hukommelsesfeil` over (bit-identisk gjennom runden).
 */
function k2Prøve(bygg: Bygger): { stillinger: number; sammenlikninger: number; avvik: string[] } {
  const agenter = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
  for (const a of agenter) a.nyKamp();
  const bok = new Hukommelse();
  const frø = KAMP_TRENING.base + 11 * KAMP_TRENING.steg;
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, frø);
  const avvik: string[] = [];
  let stillinger = 0;
  let sammenlikninger = 0;
  let sisteStikk = -1;
  let vakt = 0;
  while (s.fase !== "FERDIG" && vakt++ < 50_000) {
    bok.observer(s);
    for (const a of agenter) a.observer?.(s);
    if (s.fase === "RUNDE_SLUTT") {
      if (s.rundeNr >= 1) break;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    if (s.fase === "SPILL" && s.iTur !== null && s.rundeNr === 1 && s.stikkSpilt >= 1 && s.stikkSpilt !== sisteStikk) {
      sisteStikk = s.stikkSpilt;
      const sete = s.iTur;
      const verdener = trekkVerdener(s, sete, 3, lagRng(71_000 + s.stikkSpilt * 13 + sete), undefined, undefined, 4);
      if (verdener.length >= 2) {
        stillinger++;
        const fasit = bygg(s, sete, bok);
        assert.equal(fasit.length, MLB_TRO_INN_HS);
        assert.ok(fasit.subarray(MLB_TRO_INN, MLB_TRO_INN_H).some((x) => x !== 0), "boka er tom i runde 1 — prøven prøver ikke hukommelsen");
        for (const hender of verdener) {
          const s2 = medVerden(s, hender, sete);
          assert.deepEqual(s2.hender[sete], s.hender[sete], "medVerden endret observatørens egen hånd");
          sammenlikninger++;
          const annen = bygg(s2, sete, bok);
          const k = fasit.findIndex((x, j) => !Object.is(x, annen[j]));
          if (k >= 0) avvik.push(`stikk ${s.stikkSpilt} sete ${sete}: trekk ${k} er ${fasit[k]} mot ${annen[k]}`);
        }
      }
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, agenter[iTur]!.velgHandling(s)).state;
  }
  return { stillinger, sammenlikninger, avvik };
}

test("K2/--kamp: 920-raden er bit-identisk når bare de skjulte hendene byttes — og en lekk blir tatt", () => {
  const ærligProve = k2Prøve(ærlig);
  assert.ok(ærligProve.stillinger >= 6, `bare ${ærligProve.stillinger} stillinger — beviser ingenting`);
  assert.ok(ærligProve.sammenlikninger >= 12);
  assert.deepEqual(ærligProve.avvik, [], "JUKS: raden avhenger av SKJULTE kort");
  assert.ok(k2Prøve(jukser).avvik.length > 0, "en rad som ser naboens hånd ble ikke tatt — prøven over måler ingenting");
});
