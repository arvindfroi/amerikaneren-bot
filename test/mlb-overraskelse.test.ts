/**
 * OVERRASKELSESBLOKKA (K8 kanal 5, 13. sep). Det som må holde, og som ingen krasj avslører:
 *
 *   1. BREDDEN: 1044 = 996 + 48, og 996 → 1044 er nuller BAKERST — ingen blokk flytter seg.
 *      Kombinasjonene med tempo og auksjon er IKKE definert, og kartet skal si fra.
 *   2. EKVIVALENS, som er hele kanalen: SAMME kort, spilt av SAMME sete i SAMME stikk, må
 *      leses ULIKT når alternativene var ulike. Dame fra K‑D blanke er et TVUNGET valg og
 *      null bevis; dame fra D‑J‑10 med esset ute er et fritt valg med en målbar overraskelse.
 *      Er de to like, koder blokken ikke ekvivalens, og da er den bare `valgtbort` om igjen.
 *   3. MITT EGET VALG ER IKKE EN SANS. Observatørens egne kort skal ikke scores. DEKNING
 *      teller nøyaktig hvor mange av vinduets valg som ble lest, så dette er et TALL, ikke
 *      en påstand om layouten.
 *   4. K2: blokken og hele 1044-vektoren er BIT-IDENTISKE når bare de skjulte kortene byttes.
 *      FELLE: en blokk som leser en skjult hånd blir tatt av nøyaktig den prøven.
 *   5. NULLPUNKTET: et 996-nett med nuller bakerst gir NØYAKTIG samme tro, og én koblet
 *      kolonne i den nye blokken endrer den — ellers når blokken ikke fram.
 *   6. KORPUSET, IKKE BARE ÉN STILLING. `medBok`-fella er gjort to ganger: en ny bredde ble
 *      lagt til, generatoren nullet stille en hel blokk, og korpuset så helt riktig ut. Her
 *      genereres et 996- og et 1044-korpus fra SAMME frø, og prøven krever at de er
 *      bit-identiske i de 996 første trekkene OG at både hukommelsen og den nye blokken
 *      faktisk er FYLT i radene.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { spillerVisning, stikkvinner, type SpillerVisning } from "../src/motor.ts";
import { lagRng, type Farge, type Kort } from "../src/kort.ts";
import { PASS } from "../src/regler.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import {
  MLB_OVERRASKELSE,
  OVERRASKELSE_HTAK,
  OVERRASKELSE_LOGTAK,
  OVERRASKELSE_TEMP,
  OVERRASKELSE_VINDU,
  OVERRASKELSEINNGANG as O,
  overraskelseTrekk,
} from "../src/mlb/overraskelse.ts";
import {
  MLB_TRO_BREDDER,
  MLB_TRO_INN_HS2,
  MLB_TRO_INN_HS2O,
  MLB_TRO_INN_HS2TA,
  MLB_TRO_LAYOUT,
  troKolonnekart,
  troTrekkForBredde,
} from "../src/mlb/trotrekk.ts";
import { MlbTronett, utvidTronett } from "../src/mlb/tronett.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { nettFraBytes, type NevroNett } from "../src/nevro/nett.ts";

const ROT = fileURLToPath(new URL("..", import.meta.url));
const fil = (navn: string): string => fileURLToPath(new URL(`../e1-modell/${navn}`, import.meta.url));
/** Relativ til ROT og ignorert av git (`/_*`). Per prosess, så parallelle kjøringer ikke deler fil. */
const MAPPE = `_test-overraskelse-${process.pid}`;
before(() => mkdirSync(`${ROT}/${MAPPE}`, { recursive: true }));
after(() => rmSync(`${ROT}/${MAPPE}`, { recursive: true, force: true }));

const nær = (a: number, b: number, hva: string): void =>
  assert.ok(Math.abs(a - b) < 1e-4, `${hva}: ${a} mot ventet ${b}`);

const k = (t: string): Kort => ({ farge: t[0] as Farge, verdi: Number(t.slice(1)) as Kort["verdi"] });

const BASIS: SpillerVisning = {
  fase: "SPILL",
  iTur: null,
  deg: 0,
  dinHånd: [],
  antallKort: [12, 12, 12, 12],
  totalPoeng: [0, 0, 0, 0],
  rundeNr: 1,
  giver: 3,
  budrunde: {
    passet: [false, true, true, true],
    høyeste: { spiller: 0, bud: 8 },
    sisteBud: [8, null, null, null],
    rekke: [{ sete: 0, bud: 8 }, { sete: 1, bud: PASS }, { sete: 2, bud: PASS }, { sete: 3, bud: PASS }],
  },
  budvinner: 0,
  melding: { type: "tall", bud: 8 },
  trumf: "S",
  etterlyst: k("S13"),
  makker: null,
  bord: [],
  stikkVunnet: [0, 0, 0, 0],
  stikkSpilt: 0,
  forrigeStikk: null,
  historikk: [],
  dittVrak: [],
  sisteRunde: null,
  vinner: null,
  lovligeKort: [],
};

function medStikk(
  v: SpillerVisning,
  stikk: readonly (readonly [number, string])[][],
  bord: readonly (readonly [number, string])[] = [],
): SpillerVisning {
  const historikk = stikk.map((st) => {
    const kort = st.map(([spiller, t]) => ({ spiller, kort: k(t) }));
    return { kort, vinner: stikkvinner(kort, v.trumf!) };
  });
  return { ...v, historikk, stikkSpilt: historikk.length, bord: bord.map(([spiller, t]) => ({ spiller, kort: k(t) })) };
}

/** Cellen for absolutt sete `p` sett fra `deg`. Rel 0 (meg) finnes ikke i layouten. */
const celle = (blokk: Float32Array, deg: number, p: number): number[] => {
  const r = (p - deg + 4) % 4;
  assert.ok(r >= 1 && r <= 3, `sete ${p} er observatøren selv — det finnes ingen celle`);
  return [...blokk.subarray((r - 1) * O.PER_SETE, r * O.PER_SETE)];
};

/** Spillestillinger fra ekte kamper, med boka for bordet. */
function stillinger(frø: number, antall: number, maksRunder = 3): { s: GameState; huk: Hukommelse }[] {
  const ut: { s: GameState; huk: Hukommelse }[] = [];
  const drivere = [0, 1, 2, 3].map(() => lagIndre("nevro"));
  const bok = new Hukommelse();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, frø);
  for (let vakt = 0; s.fase !== "FERDIG" && vakt < 20_000 && ut.length < antall; vakt++) {
    bok.observer(s);
    if (s.fase === "RUNDE_SLUTT") {
      if (s.rundeNr + 1 >= maksRunder) break;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    if (s.fase === "SPILL" && s.iTur !== null && s.stikkSpilt >= 2) ut.push({ s, huk: bok });
    const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (sete === null || sete === undefined) break;
    s = utfør(s, drivere[sete]!.velgHandling(s)).state;
  }
  return ut;
}

// ---------------------------------------------------------------------------
// 1. Bredden
// ---------------------------------------------------------------------------

test("breddene: 48 i blokken, 1044 = 996 + 48, og 996 → 1044 er nuller bakerst", () => {
  assert.equal(MLB_OVERRASKELSE, 48);
  assert.equal(MLB_TRO_INN_HS2O, 1044);
  assert.deepEqual([...MLB_TRO_BREDDER], [660, 804, 776, 920, 996, 1028, 1040, 1072, 1044]);
  // Hver blokk i 996 står der den sto: utvidelsen legger BARE nuller bakerst.
  assert.deepEqual(troKolonnekart(996, 1044), [[0, 0, 660], [660, 660, 144], [804, 804, 116], [920, 920, 36], [956, 956, 40]]);
  // En utvidelse som mister en blokk er ikke en utvidelse.
  assert.throws(() => troKolonnekart(1044, 996), /overraskelse.*finnes ikke/);
  // Kombinasjonene med tempo og auksjon er IKKE definert. Kartet skal si fra, ikke gjette.
  assert.throws(() => troKolonnekart(MLB_TRO_INN_HS2O, MLB_TRO_INN_HS2TA), /overraskelse.*finnes ikke/);
  assert.throws(() => troKolonnekart(MLB_TRO_INN_HS2TA, MLB_TRO_INN_HS2O), /tempo.*finnes ikke/);
  // Layouten og bredden er det SAMME tallet.
  assert.equal((MLB_TRO_LAYOUT[MLB_TRO_INN_HS2O] ?? []).reduce((a, [, l]) => a + l, 0), MLB_TRO_INN_HS2O);
});

// ---------------------------------------------------------------------------
// 2. Ekvivalens — hele kanalen
// ---------------------------------------------------------------------------

const ALLE: string[] = [];
for (const f of ["S", "H", "R", "K"]) for (let v = 2; v <= 14; v++) ALLE.push(`${f}${v}`);

/**
 * En stilling der sete 1 la hjerter dame i siste stikk, og der BARE `kanHa` er kort hun
 * kunne hatt: observatøren (deg = 0) holder alt annet som ikke er spilt. Alternativmengden
 * er da nøyaktig den vi har designet, og tallene kan håndregnes.
 */
function damestilling(kanHa: string[]): SpillerVisning {
  const spilte = ["S2", "S3", "S13", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12"];
  const siste: [number, string][] = [[0, "H2"], [1, "H12"], [2, "H3"], [3, "H4"]];
  const brukt = new Set([...spilte, ...siste.map(([, t]) => t)]);
  const hånd = ALLE.filter((t) => !brukt.has(t) && !kanHa.includes(t)).map(k);
  const stikk: [number, string][][] = [];
  for (let i = 0; i + 3 < spilte.length; i += 4) {
    stikk.push([[0, spilte[i]!], [1, spilte[i + 1]!], [2, spilte[i + 2]!], [3, spilte[i + 3]!]]);
  }
  stikk.push(siste);
  return medStikk({ ...BASIS, deg: 0, dinHånd: hånd, makker: 2 }, stikk);
}

test("EKVIVALENS: samme dame, ulike alternativer — K‑D blanke er TVUNGET, D‑J‑10 er et valg", () => {
  // A: hun kunne bare hatt K og D i hjerter, og de HENGER SAMMEN — én ekvivalensklasse.
  //    Damen er da ikke et valg i det hele tatt, og skal være null bevis.
  const a = celle(overraskelseTrekk(damestilling(["H13", "H12"])), 0, 1);
  assert.equal(a[O.SETT], 1);
  assert.equal(a[O.SISTE_TVUNGET], 1, "K‑D blanke: damen var det eneste trekket, men blokken kalte det et valg");
  nær(a[O.SISTE_FRIHET]!, 1 / 13, "A frihet (én klasse)");
  assert.equal(a[O.SISTE_LOGP], 0, "et tvunget kort kan ikke være overraskende");
  assert.equal(a[O.SISTE_ENTROPI], 0);
  assert.equal(a[O.SISTE_TOPP], 0, "et tvunget kort er ikke «policyens toppvalg»");

  // B: hun kunne hatt esset OG D‑J‑10, og kongen ligger hos observatøren. Rekka brytes
  //    altså mellom esset og dama: TO klasser, og damen er et ekte valg.
  const b = celle(overraskelseTrekk(damestilling(["H14", "H12", "H11", "H10"])), 0, 1);
  assert.equal(b[O.SISTE_TVUNGET], 0, "D‑J‑10 med esset ute: damen var et valg");
  nær(b[O.SISTE_FRIHET]!, 2 / 13, "B frihet (to klasser: {A} og {D,J,10})");
  assert.equal(b[O.SISTE_TOPP], 1, "vinn billigst: dama slår toeren, esset er dyrere");
  assert.equal(b[O.SISTE_RANG], 0);

  /**
   * HÅNDREGNET, så tallene ikke bare er «det koden gjorde».
   * Nøklene er 0 + rang: dama 10, esset 12 (begge slår H2, altså samme gruppe).
   * w = [1, exp(−2/4)] → p(dama) = 1 / (1 + e^−0,5) = 0,62246.
   *   −log p = 0,47408  →  /LOGTAK 8 = 0,059260
   *   H = −(0,62246·ln 0,62246 + 0,37754·ln 0,37754) = 0,66284  →  /ln 13 = 0,258426
   */
  const p = 1 / (1 + Math.exp(-2 / OVERRASKELSE_TEMP));
  const h = -(p * Math.log(p) + (1 - p) * Math.log(1 - p));
  nær(b[O.SISTE_LOGP]!, -Math.log(p) / OVERRASKELSE_LOGTAK, "B log-sannsynlighet");
  nær(b[O.SISTE_ENTROPI]!, h / OVERRASKELSE_HTAK, "B entropi");
  nær(b[O.SISTE_LOGP]!, 0.05926, "B log-sannsynlighet (håndregnet)");
  nær(b[O.SISTE_ENTROPI]!, 0.258426, "B entropi (håndregnet)");

  // DETTE er kanalen: samme kort, samme sete, samme stikk — ulik lesning.
  assert.notDeepEqual(a, b, "de to damene ble lest likt — blokken koder ikke ekvivalens");
});

// ---------------------------------------------------------------------------
// 3. Mitt eget valg er ikke en sans
// ---------------------------------------------------------------------------

test("DEKNING teller bare de ANDRE setenes valg — mine egne kort scores aldri", () => {
  // Fire stikk = 16 kort. Vinduet er de 12 siste (stikk 2–4), og av dem er 3 mine.
  const v = medStikk({ ...BASIS, deg: 3, dinHånd: [k("S5"), k("H5"), k("R7")], makker: 2 }, [
    [[0, "S2"], [1, "S3"], [2, "S13"], [3, "S4"]],
    [[2, "H14"], [3, "H2"], [0, "H3"], [1, "R5"]],
    [[2, "K12"], [3, "K2"], [0, "K3"], [1, "K4"]],
    [[2, "K5"], [3, "K6"], [0, "K8"], [1, "K14"]],
  ]);
  const b = overraskelseTrekk(v);
  assert.equal(OVERRASKELSE_VINDU, 12);
  nær(b[O.FELLES + O.F_DEKNING]!, 9 / 12, "9 av vinduets 12 valg er de andres; 3 er mine");
  assert.equal(b[O.FELLES + O.F_NOEN], 1);
  // Alle tre motstanderne har tre valg hver i vinduet.
  for (const p of [0, 1, 2]) {
    const c = celle(b, 3, p);
    assert.equal(c[O.SETT], 1, `sete ${p} har ingen valg i vinduet`);
    nær(c[O.N_OBS]!, 3 / 4, `sete ${p} skal ha tre observasjoner`);
  }
  // Blokken har 3 × 14 + 6 tall, og ikke en plass til mitt eget sete.
  assert.equal(b.length, 3 * O.PER_SETE + 6);
  assert.equal(O.FELLES, 42);
});

test("før trumfen er valgt finnes ingen policy å måle mot: nullblokk", () => {
  const tom = overraskelseTrekk({ ...BASIS, budvinner: null, melding: null, trumf: null, fase: "BUDRUNDE" });
  assert.ok(tom.every((x) => x === 0), "blokken var ikke null før trumfen var valgt");
  // Og en runde uten et eneste spilt kort gir også null — ikke «ingen overraskelse».
  assert.ok(overraskelseTrekk(BASIS).every((x) => x === 0));
});

// ---------------------------------------------------------------------------
// 4. K2
// ---------------------------------------------------------------------------

test("K2: blokken og hele 1044-vektoren er bit-identiske når bare de skjulte kortene byttes", () => {
  let sjekket = 0;
  let ikkeTom = 0;
  for (const { s, huk } of stillinger(8_310_001, 10)) {
    const sete = s.iTur!;
    const fasit = troTrekkForBredde(MLB_TRO_INN_HS2O, spillerVisning(s, sete), s.giving.antallStikk, 100, huk.vektor(sete, 4));
    assert.equal(fasit.length, 1044);
    if (fasit.subarray(MLB_TRO_INN_HS2).some((x) => x !== 0)) ikkeTom++;
    for (const hender of trekkVerdener(s, sete, 2, lagRng(7171 + sjekket), undefined, undefined, 4)) {
      const s2 = medVerden(s, hender, sete);
      const annen = troTrekkForBredde(MLB_TRO_INN_HS2O, spillerVisning(s2, sete), s.giving.antallStikk, 100, huk.vektor(sete, 4));
      assert.deepEqual([...annen], [...fasit], "1044-vektoren endret seg da bare skjulte kort ble byttet");
      sjekket++;
    }
  }
  assert.ok(sjekket >= 10, `for få verdenssammenlikninger (${sjekket})`);
  assert.ok(ikkeTom >= 10, `overraskelsesblokken var tom i alle stillinger (${ikkeTom}) — prøven beviser da ingenting`);
});

test("FELLE: en overraskelsesblokk som leser en SKJULT hånd blir tatt av den samme prøven", () => {
  let avvik = 0;
  for (const { s } of stillinger(8_310_002, 4)) {
    const sete = s.iTur!;
    // Den «naturlige» juksen: la alternativmengden inkludere det motstanderen FAKTISK har.
    const juks = (st: GameState): Float32Array => {
      const v = overraskelseTrekk(spillerVisning(st, sete));
      v[O.SISTE_LOGP] += (st.hender[(sete + 1) % 4] ?? []).reduce((a, c) => a + c.verdi, 0) / 1000;
      return v;
    };
    const fasit = juks(s);
    for (const hender of trekkVerdener(s, sete, 2, lagRng(8181), undefined, undefined, 4)) {
      const annen = juks(medVerden(s, hender, sete));
      if (fasit.some((x, i) => !Object.is(x, annen[i]))) avvik++;
    }
  }
  assert.ok(avvik > 0, "en blokk som leser en skjult hånd ble ikke tatt — K2-prøven over beviser da ingenting");
});

// ---------------------------------------------------------------------------
// 5. Nullpunktet
// ---------------------------------------------------------------------------

test("nullpunktet: et 996-nett med nuller bakerst gir NØYAKTIG samme tro; én koblet kolonne endrer den", () => {
  const navn = ["tro-8.bin", "tro-3.bin", "tro-1.bin", "tro-0.bin"].find((n) => existsSync(fil(n)));
  const kilde = navn === undefined ? null : nettFraBytes(readFileSync(fil(navn)))[0]!;
  if (kilde === null || kilde.lag[0]!.inn !== MLB_TRO_INN_HS2) {
    // Uten et 996-nett i e1-modell (ikke sporet) er det ingenting å utvide fra.
    return;
  }
  const gammel = new MlbTronett(kilde);
  const ny = new MlbTronett(utvidTronett(kilde, MLB_TRO_INN_HS2O));
  assert.equal(ny.innBredde, 1044);
  assert.deepEqual(
    [ny.brukerHukommelse, ny.brukerSignal, ny.brukerSanser2, ny.brukerOverraskelse, ny.brukerTempo, ny.brukerAuksjon],
    [true, true, true, true, false, false],
  );
  assert.equal(gammel.brukerOverraskelse, false);

  const pos = stillinger(8_310_003, 8);
  assert.ok(pos.length >= 4, `for få stillinger (${pos.length})`);
  for (const { s, huk } of pos) {
    const v = spillerVisning(s, s.iTur!);
    const h = huk.vektor(s.iTur!, 4);
    const t = ny.trekkFor(v, s.giving.antallStikk, 100, h);
    assert.equal(t.length, 1044);
    assert.ok(t.subarray(MLB_TRO_INN_HS2).some((x) => x !== 0), "blokken er tom — nullpunktet prøver ingenting");
    assert.deepEqual(ny.fordeling(t), gammel.fordeling(gammel.trekkFor(v, s.giving.antallStikk, 100, h)));
  }

  // FELLA: én koblet kolonne. DEKNING er ikke null i noen av stillingene over.
  const plantet: NevroNett = utvidTronett(kilde, MLB_TRO_INN_HS2O);
  const l = plantet.lag[0]!;
  for (let r = 0; r < l.ut; r++) l.vekter[r * l.inn + MLB_TRO_INN_HS2 + O.FELLES + O.F_DEKNING] = 3;
  const felle = new MlbTronett(plantet);
  let endret = 0;
  for (const { s, huk } of pos) {
    const v = spillerVisning(s, s.iTur!);
    const h = huk.vektor(s.iTur!, 4);
    const a = JSON.stringify(felle.fordeling(felle.trekkFor(v, s.giving.antallStikk, 100, h)));
    const b = JSON.stringify(gammel.fordeling(gammel.trekkFor(v, s.giving.antallStikk, 100, h)));
    if (a !== b) endret++;
  }
  assert.ok(endret > 0, "en koblet kolonne endret ingen tro — blokken når ikke fram til nettet");
});

// ---------------------------------------------------------------------------
// 6. Korpuset — `medBok`-fella, som bare en korpussammenlikning ser
// ---------------------------------------------------------------------------

/** En MLBT-fil som (dim, rader, trekk per rad). Formatet står i `examples/mlb-trodata.ts`. */
function lesKorpus(sti: string): { dim: number; rader: number; trekk: (i: number) => Float32Array } {
  const buf = readFileSync(sti);
  assert.equal(buf.toString("ascii", 0, 4), "MLBT", `${sti}: ikke en MLBT-fil`);
  assert.equal(buf.readInt32LE(4), 1, `${sti}: ventet versjon 1`);
  const dim = buf.readInt32LE(8);
  const post = dim * 4 + 52 + 4 + 2 + 2;
  const rader = Math.floor((statSync(sti).size - 12) / post);
  return {
    dim,
    rader,
    trekk: (i: number): Float32Array => {
      const v = new Float32Array(dim);
      for (let q = 0; q < dim; q++) v[q] = buf.readFloatLE(12 + i * post + q * 4);
      return v;
    },
  };
}

test("korpuset: 1044 er 996 pluss nuller bakerst, og BÅDE hukommelsen og den nye blokken er FYLT", () => {
  const kjør = (ut: string, ekstra: string[]): void => {
    const r = spawnSync(
      process.execPath,
      ["examples/mlb-trodata.ts", "--kamp", "--hukommelse", "--signal", "--sanser2", ...ekstra,
        "--kamper", "3", "--band", "trening", "--skard", "0/1", "--ut", ut],
      { cwd: ROT, encoding: "utf8" },
    );
    assert.equal(r.status, 0, `mlb-trodata feilet: ${r.stderr}`);
  };
  const a = `${ROT}/${MAPPE}/a996.bin`;
  const b = `${ROT}/${MAPPE}/b1044.bin`;
  kjør(a, []);
  kjør(b, ["--overraskelse"]);

  const A = lesKorpus(a);
  const B = lesKorpus(b);
  assert.equal(A.dim, 996);
  assert.equal(B.dim, 1044);
  assert.ok(B.rader > 200, `for få rader (${B.rader})`);
  assert.equal(A.rader, B.rader, "samme frø ga ulikt antall rader — utvalget er ikke det samme");

  let fyltNy = 0;
  let fyltBok = 0;
  for (let i = 0; i < B.rader; i++) {
    const ta = A.trekk(i);
    const tb = B.trekk(i);
    // PREFIKSET: rad for rad, bit for bit. Dette er prøven enhetstestene ikke kan gjøre.
    for (let q = 0; q < 996; q++) {
      if (!Object.is(ta[q], tb[q])) {
        assert.fail(`rad ${i} skiller seg i post ${q}: ${ta[q]} mot ${tb[q]} — 1044 rørte de 996 første trekkene`);
      }
    }
    if (tb.subarray(996).some((x) => x !== 0)) fyltNy++;
    // `medBok`: blokken som ble nullet SIST gangen en bredde ble lagt til.
    if (tb.subarray(660, 804).some((x) => x !== 0)) fyltBok++;
  }
  assert.ok(
    fyltNy > B.rader * 0.8,
    `overraskelsesblokken er fylt i bare ${fyltNy} av ${B.rader} rader — blokken blir stille nullet`,
  );
  assert.ok(
    fyltBok > B.rader / 4,
    `hukommelsesblokken er fylt i bare ${fyltBok} av ${B.rader} rader i 1044 — det er «medBok»-fella om igjen`,
  );
});

test("mlb-trodata: --overraskelse avviser det den bygger på, og de udefinerte kombinasjonene", () => {
  const kjør = (args: string[]): string => {
    const r = spawnSync(process.execPath, ["examples/mlb-trodata.ts", ...args, "--kamper", "1", "--ut", `${ROT}/${MAPPE}/nei.bin`], {
      cwd: ROT,
      encoding: "utf8",
    });
    assert.notEqual(r.status, 0, `ventet at ${args.join(" ")} skulle stoppe`);
    return r.stderr;
  };
  assert.match(kjør(["--kamp", "--overraskelse"]), /krever --sanser2/);
  assert.match(
    kjør(["--kamp", "--hukommelse", "--signal", "--sanser2", "--overraskelse", "--auksjon"]),
    /ikke definert sammen med/,
  );
});
