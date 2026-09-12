/**
 * STIGEN OVER 996 — TEMPO OG AUKSJON SAMMEN (12. sep).
 *
 * To sanser landet samme dag, hver skrevet som «den neste bredden»: tempo (32,
 * `src/mlb/tempotrekk.ts`) og auksjonens rekkefølge (44, `src/mlb/auksjonsrekke.ts`). De
 * utelukker ikke hverandre, så etter sammenslåingen finnes FIRE bredder over 996 — 996, 1028,
 * 1040 og 1072 — og BudQ har 323 og 367. Hver av dem må være lovlig, og ingen av dem får røre
 * de 996 første trekkene.
 *
 * `test/mlb-tempo.test.ts` og `test/mlb-auksjonsrekke.test.ts` prøver hver sin sans alene. Denne
 * fila prøver det INGEN av dem kan se: at de to lever sammen. Det som må holde, og som ingen
 * krasj avslører:
 *
 *   1. STIGEN. Kolonnekartet legger nuller bakerst for 996 → 1028/1040/1072 og 1028 → 1072 —
 *      men 1040 → 1072 må FLYTTE auksjonen fra 996 til 1028, fordi tempoet står imellom.
 *      FELLE: var auksjonen bare lagt bakerst i 1072, ville kartet vært identitet, og
 *      auksjonsvektene ville lest tempoblokken. Det er 776 → 920-feilen, en gang til.
 *   2. BLOKKENE LIGGER DER LAYOUTEN SIER. Tempoblokken i 1072 er bit for bit tempoblokken i
 *      1028, og auksjonsblokken i 1072 er bit for bit den i 1040 — bare flyttet.
 *   3. FLAGGENE ER UAVHENGIGE. Å endre tempoboka rører BARE tempoblokken; å endre auksjonen
 *      rører BARE auksjonsblokken. FELLE: begge må faktisk endre sin egen blokk, ellers måler
 *      prøven at to nullblokker er like.
 *   4. NULLPUNKTET GJENNOM HELE STIGEN. Et 996-nett utvidet til 1028, 1040 ELLER 1072 gir
 *      bit-identisk tro, og det gjør 1028 → 1072 og 1040 → 1072 også. FELLE: én koblet kolonne
 *      i hver ny blokk må endre troen.
 *   5. KORPUSET, IKKE BARE ÉN STILLING. Enhetsprøvene går på én visning og var grønne mens
 *      generatoren skrev feil: `medBok` valgte hukommelsen på en HÅNDHOLDT LISTE av bredder, og
 *      lista i menneskegrenen stoppet på 920. `--menneske --sanser2` skrev derfor 996-rader med
 *      en NULLET hukommelsesblokk — 144 av de 996 «urørte» trekkene borte, uten at noe feilet —
 *      og `--tempo` (1028) arvet feilen. Bare en sammenlikning av HELE KORPUS ser det.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { spillerVisning, type SpillerVisning } from "../src/motor.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import { AUKSJONINNGANG as AU, MLB_AUKSJON } from "../src/mlb/auksjonsrekke.ts";
import { MLB_TEMPO, TEMPOINNGANG as T, Tempobok, type Tempohendelse } from "../src/mlb/tempotrekk.ts";
import {
  MLB_TRO_BREDDER,
  MLB_TRO_INN_HS2,
  MLB_TRO_INN_HS2A,
  MLB_TRO_INN_HS2T,
  MLB_TRO_INN_HS2TA,
  MLB_TRO_LAYOUT,
  troKolonnekart,
  troTrekkForBredde,
} from "../src/mlb/trotrekk.ts";
import { MlbTronett, utvidTronett } from "../src/mlb/tronett.ts";
import { nettFraBytes, type NevroNett } from "../src/nevro/nett.ts";
import { menneskeBånd } from "../examples/menneske-logg.ts";
import { syntetiskLogg, type SyntetiskKamp } from "./menneske-syntetisk.ts";

const ROT = fileURLToPath(new URL("..", import.meta.url));
const fil = (navn: string): string => fileURLToPath(new URL(`../e1-modell/${navn}`, import.meta.url));
/** Relativ til ROT og ignorert av git (`/_*`). Per prosess, så parallelle kjøringer ikke deler fil. */
const MAPPE = `_test-stigen-${process.pid}`;
before(() => mkdirSync(`${ROT}/${MAPPE}`, { recursive: true }));
after(() => rmSync(`${ROT}/${MAPPE}`, { recursive: true, force: true }));

/** De fem blokkene i 996, slik kolonnekartet skal gjengi dem i enhver bredere layout. */
const P996: [number, number, number][] = [
  [0, 0, 660],
  [660, 660, 144],
  [804, 804, 116],
  [920, 920, 36],
  [956, 956, 40],
];

const post = (sete: number, ms: number, ekstra: Partial<Tempohendelse> = {}): Tempohendelse => ({
  sete,
  fase: "S",
  stikk: null,
  ms,
  skjultMs: 0,
  ufokusMs: 0,
  angre: 0,
  ...ekstra,
});

function bokMed(poster: readonly Tempohendelse[]): Tempobok {
  const b = new Tempobok();
  b.rundeSett(poster.length > 0);
  for (const p of poster) b.se(p);
  return b;
}

/** Ekte spillestillinger med boka for bordet — auksjonen er da faktisk spilt. */
function stillinger(frø: number, antall: number, maksRunder = 3): { s: GameState; sete: number; huk: Float64Array }[] {
  const drivere = [0, 1, 2, 3].map(() => lagIndre("nevro"));
  const bok = new Hukommelse();
  const ut: { s: GameState; sete: number; huk: Float64Array }[] = [];
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, frø);
  for (let vakt = 0; s.fase !== "FERDIG" && vakt < 20_000 && ut.length < antall; vakt++) {
    bok.observer(s);
    if (s.fase === "RUNDE_SLUTT") {
      if (s.rundeNr + 1 >= maksRunder) break;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (sete === null || sete === undefined) break;
    if (s.fase === "SPILL" && s.stikkSpilt >= 1) ut.push({ s, sete, huk: bok.vektor(sete, 4) });
    s = utfør(s, drivere[sete]!.velgHandling(s)).state;
  }
  return ut;
}

// ---------------------------------------------------------------------------
// 1. Stigen
// ---------------------------------------------------------------------------

test("stigen: fire bredder over 996, og 1040 → 1072 FLYTTER auksjonen fordi tempoet står foran", () => {
  assert.equal(MLB_TEMPO, 32);
  assert.equal(MLB_AUKSJON, 44);
  assert.deepEqual([MLB_TRO_INN_HS2, MLB_TRO_INN_HS2T, MLB_TRO_INN_HS2A, MLB_TRO_INN_HS2TA], [996, 1028, 1040, 1072]);
  assert.deepEqual([...MLB_TRO_BREDDER], [660, 804, 776, 920, 996, 1028, 1040, 1072]);

  // De fem 996-blokkene står på nøyaktig samme plass i hver eneste bredde over.
  for (const til of [MLB_TRO_INN_HS2T, MLB_TRO_INN_HS2A, MLB_TRO_INN_HS2TA]) {
    assert.deepEqual(troKolonnekart(MLB_TRO_INN_HS2, til), P996, `996 → ${til} flyttet en 996-blokk`);
  }
  // 1028 → 1072: tempoet blir stående på 996, og resten er nuller bakerst.
  assert.deepEqual(troKolonnekart(MLB_TRO_INN_HS2T, MLB_TRO_INN_HS2TA), [...P996, [996, 996, 32]]);
  // 1040 → 1072: auksjonen MÅ flytte seg 996 → 1028.
  assert.deepEqual(troKolonnekart(MLB_TRO_INN_HS2A, MLB_TRO_INN_HS2TA), [...P996, [996, 1028, 44]]);
  // FELLA: nuller bakerst her ville latt auksjonsvektene lese tempoblokken.
  assert.notDeepEqual(
    troKolonnekart(MLB_TRO_INN_HS2A, MLB_TRO_INN_HS2TA),
    [...P996, [996, 996, 44]],
    "1040 → 1072 la auksjonen bakerst i stedet for å flytte den forbi tempoet",
  );

  // En utvidelse som MISTER en blokk er ikke en utvidelse — i begge retninger, for begge sansene.
  assert.throws(() => troKolonnekart(MLB_TRO_INN_HS2TA, MLB_TRO_INN_HS2T), /auksjon.*finnes ikke/);
  assert.throws(() => troKolonnekart(MLB_TRO_INN_HS2TA, MLB_TRO_INN_HS2A), /tempo.*finnes ikke/);
  assert.throws(() => troKolonnekart(MLB_TRO_INN_HS2A, MLB_TRO_INN_HS2T), /auksjon.*finnes ikke/);
  assert.throws(() => troKolonnekart(MLB_TRO_INN_HS2T, MLB_TRO_INN_HS2A), /tempo.*finnes ikke/);

  // Layouten og breddene er det SAMME tallet: en blokk lagt til uten å telle med er en stille feil.
  for (const b of MLB_TRO_BREDDER) {
    const sum = (MLB_TRO_LAYOUT[b] ?? []).reduce((a, [, l]) => a + l, 0);
    assert.equal(sum, b, `layouten for ${b} summerer til ${sum}`);
  }
});

// ---------------------------------------------------------------------------
// 2. Blokkene ligger der layouten sier
// ---------------------------------------------------------------------------

test("trekkene: 1072 er 996 + tempoblokken fra 1028 + auksjonsblokken fra 1040, flyttet til 1028", () => {
  const pos = stillinger(9_310_001, 8);
  assert.ok(pos.length >= 4, `for få stillinger (${pos.length})`);
  const bok = bokMed([0, 1, 2, 3].map((p) => post(p, 800 + p * 1300)));
  let medTempo = 0;
  let medAuksjon = 0;
  for (const { s, sete, huk } of pos) {
    const v = spillerVisning(s, sete);
    const t = (bredde: number): Float32Array => troTrekkForBredde(bredde, v, s.giving.antallStikk, 100, huk, bok);
    const t996 = t(MLB_TRO_INN_HS2);
    const t1028 = t(MLB_TRO_INN_HS2T);
    const t1040 = t(MLB_TRO_INN_HS2A);
    const t1072 = t(MLB_TRO_INN_HS2TA);
    assert.deepEqual([t996.length, t1028.length, t1040.length, t1072.length], [996, 1028, 1040, 1072]);

    // De 996 første er de samme i alle fire.
    for (const [navn, x] of [["1028", t1028], ["1040", t1040], ["1072", t1072]] as const) {
      assert.deepEqual([...x.subarray(0, 996)], [...t996], `${navn} rørte de 996 første trekkene`);
    }
    // Tempoblokken: samme bytes i 1028 og 1072, på samme plass.
    assert.deepEqual([...t1072.subarray(996, 1028)], [...t1028.subarray(996, 1028)], "tempoblokken er ikke den samme i 1072");
    // Auksjonsblokken: samme bytes, men FLYTTET fra 996 (i 1040) til 1028 (i 1072).
    assert.deepEqual([...t1072.subarray(1028, 1072)], [...t1040.subarray(996, 1040)], "auksjonsblokken er ikke den samme i 1072");

    if (t1028.subarray(996, 1028).some((x) => x !== 0)) medTempo++;
    if (t1040.subarray(996, 1040).some((x) => x !== 0)) medAuksjon++;
  }
  // FELLA: er begge blokkene tomme, sammenlikner prøven over bare nuller med nuller.
  assert.ok(medTempo >= 4, `tempoblokken var tom i alle stillinger (${medTempo})`);
  assert.ok(medAuksjon >= 4, `auksjonsblokken var tom i alle stillinger (${medAuksjon})`);
});

// ---------------------------------------------------------------------------
// 3. Flaggene er uavhengige
// ---------------------------------------------------------------------------

test("uavhengighet: tempoboka rører BARE tempoblokken, og auksjonen BARE auksjonsblokken", () => {
  const pos = stillinger(9_310_002, 6);
  assert.ok(pos.length >= 3, `for få stillinger (${pos.length})`);
  const { s, sete, huk } = pos.find((x) => spillerVisning(x.s, x.sete).budrunde.rekke.length >= 2) ?? pos[0]!;
  const v = spillerVisning(s, sete);
  const snudd: SpillerVisning = { ...v, budrunde: { ...v.budrunde, rekke: [...v.budrunde.rekke].reverse() } };
  assert.ok(v.budrunde.rekke.length >= 2, "for kort auksjon til å permutere");

  const rask = bokMed([0, 1, 2, 3].map((p) => post(p, 300)));
  const treg = bokMed([0, 1, 2, 3].map((p) => post(p, 45_000)));
  const t = (vis: SpillerVisning, bok: Tempobok): Float32Array =>
    troTrekkForBredde(MLB_TRO_INN_HS2TA, vis, s.giving.antallStikk, 100, huk, bok);

  const grunn = t(v, rask);
  const annenTid = t(v, treg);
  const annenAuksjon = t(snudd, rask);

  // Et annet tempo endrer tempoblokken og INGENTING annet.
  assert.deepEqual([...annenTid.subarray(0, 996)], [...grunn.subarray(0, 996)], "tempoet rørte de 996 første");
  assert.deepEqual([...annenTid.subarray(1028)], [...grunn.subarray(1028)], "tempoet rørte auksjonsblokken");
  assert.notDeepEqual([...annenTid.subarray(996, 1028)], [...grunn.subarray(996, 1028)], "tempoet endret ikke tempoblokken");

  // En annen auksjon endrer auksjonsblokken og INGENTING annet. (996 er blind for rekkefølgen.)
  assert.deepEqual([...annenAuksjon.subarray(0, 996)], [...grunn.subarray(0, 996)], "auksjonen rørte de 996 første");
  assert.deepEqual([...annenAuksjon.subarray(996, 1028)], [...grunn.subarray(996, 1028)], "auksjonen rørte tempoblokken");
  assert.notDeepEqual([...annenAuksjon.subarray(1028)], [...grunn.subarray(1028)], "auksjonen endret ikke auksjonsblokken");

  // Og uten bok er tempoblokken tom, mens auksjonen står — de to henger ikke sammen.
  const utenBok = troTrekkForBredde(MLB_TRO_INN_HS2TA, v, s.giving.antallStikk, 100, huk, null);
  assert.deepEqual([...utenBok.subarray(996, 1028)], new Array<number>(MLB_TEMPO).fill(0));
  assert.deepEqual([...utenBok.subarray(1028)], [...grunn.subarray(1028)]);
});

// ---------------------------------------------------------------------------
// 4. Nullpunktet gjennom hele stigen
// ---------------------------------------------------------------------------

test("nullpunktet: 996 → 1028/1040/1072 og 1028/1040 → 1072 gir NØYAKTIG samme tro", () => {
  const kilde = existsSync(fil("tro-7.bin")) ? nettFraBytes(readFileSync(fil("tro-7.bin")))[0]! : null;
  if (kilde === null || kilde.lag[0]!.inn !== MLB_TRO_INN_HS2) return; // uten et 996-nett er det ingenting å utvide
  const pos = stillinger(9_310_003, 6);
  assert.ok(pos.length >= 4, `for få stillinger (${pos.length})`);
  const bok = bokMed([0, 1, 2, 3].map((p) => post(p, 1100 + p * 900)));
  const n996 = new MlbTronett(kilde);

  /** Nettet på bredden `b`, bygd fra 996-nettet med varmstarten. */
  const nettFor = (b: number): NevroNett => (b === MLB_TRO_INN_HS2 ? kilde : utvidTronett(kilde, b));

  const trapp: [number, number][] = [
    [MLB_TRO_INN_HS2, MLB_TRO_INN_HS2T],
    [MLB_TRO_INN_HS2, MLB_TRO_INN_HS2A],
    [MLB_TRO_INN_HS2, MLB_TRO_INN_HS2TA],
    [MLB_TRO_INN_HS2T, MLB_TRO_INN_HS2TA],
    [MLB_TRO_INN_HS2A, MLB_TRO_INN_HS2TA],
  ];
  for (const [fra, til] of trapp) {
    const bred = new MlbTronett(utvidTronett(nettFor(fra), til));
    assert.equal(bred.innBredde, til);
    for (const { s, sete, huk } of pos) {
      const v = spillerVisning(s, sete);
      assert.deepEqual(
        bred.fordeling(bred.trekkFor(v, s.giving.antallStikk, 100, huk, bok)),
        n996.fordeling(n996.trekkFor(v, s.giving.antallStikk, 100, huk)),
        `${fra} → ${til}: annen tro etter varmstarten`,
      );
    }
  }

  // Breddene svarer riktig på HVA de leser — getterne slår opp i layouten, ikke i en liste.
  const les = (b: number): boolean[] => {
    const n = new MlbTronett(nettFor(b));
    return [n.brukerHukommelse, n.brukerSignal, n.brukerSanser2, n.brukerTempo, n.brukerAuksjon];
  };
  assert.deepEqual(les(MLB_TRO_INN_HS2), [true, true, true, false, false]);
  assert.deepEqual(les(MLB_TRO_INN_HS2T), [true, true, true, true, false]);
  assert.deepEqual(les(MLB_TRO_INN_HS2A), [true, true, true, false, true]);
  assert.deepEqual(les(MLB_TRO_INN_HS2TA), [true, true, true, true, true]);

  // FELLA: én koblet kolonne i HVER ny blokk må endre troen, ellers når blokken ikke fram.
  const felle = (kolonne: number): number => {
    const plantet = utvidTronett(kilde, MLB_TRO_INN_HS2TA);
    const l = plantet.lag[0]!;
    for (let r = 0; r < l.ut; r++) l.vekter[r * l.inn + kolonne] = 3;
    const n = new MlbTronett(plantet);
    let endret = 0;
    for (const { s, sete, huk } of pos) {
      const v = spillerVisning(s, sete);
      const a = JSON.stringify(n.fordeling(n.trekkFor(v, s.giving.antallStikk, 100, huk, bok)));
      const b = JSON.stringify(n996.fordeling(n996.trekkFor(v, s.giving.antallStikk, 100, huk)));
      if (a !== b) endret++;
    }
    return endret;
  };
  assert.ok(felle(996 + T.SISTE_LOG) > 0, "en koblet TEMPO-kolonne endret ingen tro i 1072");
  assert.ok(felle(1028 + AU.FELLES + AU.LENGDE) > 0, "en koblet AUKSJON-kolonne endret ingen tro i 1072");
});

// ---------------------------------------------------------------------------
// 5. Korpuset: alle fire breddene fra samme logg, bit for bit i de 996 første
// ---------------------------------------------------------------------------

const HALE = 52 + 4 + 2 + 2;

function lesMlbt(sti: string): { dim: number; post: number; antall: number; data: Buffer } {
  const b = readFileSync(sti);
  assert.equal(b.subarray(0, 4).toString("latin1"), "MLBT", `${sti} er ikke en MLBT-fil`);
  assert.equal(b.readInt32LE(4), 1, "MLBT-versjonen er ikke 1");
  const dim = b.readInt32LE(8);
  const post = dim * 4 + HALE;
  const data = b.subarray(12);
  assert.equal(data.length % post, 0, "fila er ikke et helt antall poster");
  return { dim, post, antall: data.length / post, data };
}

function kjør(args: readonly string[]): { status: number | null; tekst: string } {
  const r = spawnSync(process.execPath, ["examples/mlb-trodata.ts", ...args], { cwd: ROT, encoding: "utf8", timeout: 600_000 });
  return { status: r.status, tekst: `${r.stdout}\n${r.stderr}` };
}

/** Kamp-id-er i et gitt bånd (båndet er en hash og kan ikke velges direkte). */
function idIBånd(bånd: "trening" | "holdout", n: number, prefiks: string): string[] {
  const ut: string[] = [];
  for (let i = 0; ut.length < n; i++) if (menneskeBånd(`${prefiks}${i}`) === bånd) ut.push(`${prefiks}${i}`);
  return ut;
}

const MODELLER = ["d7alle.bin", "vrakrang.bin", "bud-menneske.json"].map((f) => `${ROT}/e1-modell/${f}`);
const skip = MODELLER.some((f) => !existsSync(f)) ? "mangler e1-modell (ikke sporet)" : false;

test("mlb-trodata --menneske: 1028-, 1040- og 1072-korpus er BYTE-IDENTISKE med 996-korpuset i de 996 første trekkene", { skip, timeout: 900_000 }, () => {
  // Tider på hver runde, så tempoblokken FAKTISK har innhold i korpuset. Uten dem ville
  // prøven sammenliknet nuller med nuller i nettopp den blokken den skal dømme.
  const tempo = [
    { fase: "B", ms: 6100 },
    { fase: "V", ms: 3400, skjultMs: 900 },
    { fase: "S", stikk: 0, ms: 2100, angre: 1 },
    { fase: "S", stikk: 1, ms: 15_800, ufokusMs: 4000 },
  ];
  const [T0, T1] = idIBånd("trening", 2, "st");
  const kamper: SyntetiskKamp[] = [
    { spillId: T0!, frø: 9_800_003, spiller: "p-a", målPoeng: 100, runder: [{ rundeNr: 0, tempo }, { rundeNr: 1, tempo }, { rundeNr: 2, tempo }] },
    { spillId: T1!, frø: 9_800_004, spiller: "p-b", målPoeng: 100, runder: [{ rundeNr: 0, tempo }, { rundeNr: 1, tempo }] },
  ];
  const { linjer } = syntetiskLogg(kamper);
  const data = `${MAPPE}/hendelser.jsonl`;
  writeFileSync(`${ROT}/${data}`, `${linjer.join("\n")}\n`);

  const felles = ["--menneske", data, "--band", "trening", "--hukommelse", "--signal", "--sanser2", "--sjanse", "1"];
  const ut: Record<string, string> = {};
  for (const [navn, ekstra] of [
    ["996", []],
    ["1028", ["--tempo"]],
    ["1040", ["--auksjon"]],
    ["1072", ["--tempo", "--auksjon"]],
  ] as const) {
    ut[navn] = `${ROT}/${MAPPE}/tro-${navn}.bin`;
    const r = kjør([...felles, ...ekstra, "--ut", ut[navn]!]);
    assert.equal(r.status, 0, r.tekst);
  }

  const a = lesMlbt(ut["996"]!);
  assert.equal(a.dim, MLB_TRO_INN_HS2);
  assert.ok(a.antall >= 50, `for få rader (${a.antall})`);

  /** Rader der de `dim`-første trekkene ELLER halen (etikett, frø, stikk, sete) avviker. */
  const avvikMot996 = (y: { dim: number; post: number; antall: number; data: Buffer }): number => {
    let avvik = 0;
    for (let i = 0; i < Math.min(a.antall, y.antall); i++) {
      const px = a.data.subarray(i * a.post, (i + 1) * a.post);
      const py = y.data.subarray(i * y.post, (i + 1) * y.post);
      if (!px.subarray(0, a.dim * 4).equals(py.subarray(0, a.dim * 4))) avvik++;
      else if (!px.subarray(a.dim * 4).equals(py.subarray(y.dim * 4))) avvik++;
    }
    return avvik;
  };

  for (const [navn, dim] of [["1028", MLB_TRO_INN_HS2T], ["1040", MLB_TRO_INN_HS2A], ["1072", MLB_TRO_INN_HS2TA]] as const) {
    const b = lesMlbt(ut[navn]!);
    assert.equal(b.dim, dim);
    assert.equal(b.antall, a.antall, `${navn}: ulikt antall rader — da er det ikke de samme stillingene`);
    assert.equal(avvikMot996(b), 0, `${navn}-korpuset endret noe i de 996 første trekkene eller i fasiten`);
  }

  /**
   * HUKOMMELSESBLOKKEN ER IKKE NULL. Dette er prøven for feilen `medBok` hadde: lista i
   * menneskegrenen stoppet på 920, så 996 og 1028 fikk `huk = null` og en nullet blokk. Alle
   * fire korpusene var da innbyrdes «identiske» — like galt er også likt.
   */
  const medBok = (x: { post: number; antall: number; data: Buffer }): number => {
    let n = 0;
    for (let i = 0; i < x.antall; i++) {
      const rad = x.data.subarray(i * x.post + 660 * 4, i * x.post + 804 * 4);
      if (rad.some((y) => y !== 0)) n++;
    }
    return n;
  };
  assert.ok(medBok(a) > a.antall / 4, `hukommelsesblokken var null i ${a.antall - medBok(a)} av ${a.antall} 996-rader`);

  // Og de nye blokkene må ha innhold, ellers beviser likheten over ingenting.
  const b1072 = lesMlbt(ut["1072"]!);
  let medTempo = 0;
  let medAuksjon = 0;
  for (let i = 0; i < b1072.antall; i++) {
    const o = i * b1072.post;
    if (b1072.data.subarray(o + 996 * 4, o + 1028 * 4).some((x) => x !== 0)) medTempo++;
    if (b1072.data.subarray(o + 1028 * 4, o + 1072 * 4).some((x) => x !== 0)) medAuksjon++;
  }
  assert.ok(medTempo > 0, "tempoblokken var tom i HVER rad — korpusprøven dømmer da ingenting");
  assert.ok(medAuksjon > b1072.antall / 2, `auksjonsblokken var tom i ${b1072.antall - medAuksjon} av ${b1072.antall} rader`);

  // FELLA: sammenlikningen må KUNNE slå ut. Et korpus fra en ANNEN logg må avvike.
  const andre: SyntetiskKamp[] = [
    { spillId: T0!, frø: 9_800_055, spiller: "p-a", målPoeng: 100, runder: [{ rundeNr: 0, tempo }, { rundeNr: 1, tempo }, { rundeNr: 2, tempo }] },
    { spillId: T1!, frø: 9_800_056, spiller: "p-b", målPoeng: 100, runder: [{ rundeNr: 0, tempo }, { rundeNr: 1, tempo }] },
  ];
  const dataB = `${MAPPE}/hendelser-annen.jsonl`;
  writeFileSync(`${ROT}/${dataB}`, `${syntetiskLogg(andre).linjer.join("\n")}\n`);
  const utB = `${ROT}/${MAPPE}/tro-annen.bin`;
  assert.equal(kjør(["--menneske", dataB, "--band", "trening", "--hukommelse", "--signal", "--sanser2", "--sjanse", "1", "--tempo", "--auksjon", "--ut", utB]).status, 0);
  assert.ok(avvikMot996(lesMlbt(utB)) > 0, "prøven ser ikke forskjell på to ULIKE korpus — den kan ikke feile");
});

test("mlb-trodata: --tempo og --auksjon avviser det de bygger på, hver for seg og sammen", { skip }, () => {
  const data = `${MAPPE}/tomt.jsonl`;
  writeFileSync(`${ROT}/${data}`, "");
  // --tempo krever --menneske OG --sanser2; --auksjon krever --sanser2.
  const a = kjør(["--kamp", "--kamper", "1", "--hukommelse", "--signal", "--sanser2", "--tempo", "--ut", `${MAPPE}/x.bin`]);
  assert.notEqual(a.status, 0, "--tempo ble godtatt uten --menneske");
  assert.match(a.tekst, /--tempo legger 32 trekk bak 996/);
  const b = kjør(["--menneske", data, "--hukommelse", "--signal", "--tempo", "--ut", `${MAPPE}/x.bin`]);
  assert.notEqual(b.status, 0, "--tempo ble godtatt uten --sanser2");
  const c = kjør(["--kamp", "--kamper", "1", "--hukommelse", "--signal", "--auksjon", "--ut", `${MAPPE}/x.bin`]);
  assert.notEqual(c.status, 0, "--auksjon ble godtatt uten --sanser2");
  assert.match(c.tekst, /--auksjon legger 44 trekk bak 996/);
});
