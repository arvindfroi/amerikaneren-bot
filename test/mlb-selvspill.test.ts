/**
 * SELVSPILLØKKA — spiller den lovlig, og er gjenspillingen den SAMME kampen?
 *
 * `docs/mlb.md` fase 1: «et TILFELDIG nett spiller lovlig i 1000 kamper uten å
 * krasje». Det er prøven under, i miniatyr — og den fant noe:
 *
 * ===================== ET LØP TIL 30 TAR IKKE ALLTID SLUTT =============
 *
 * Med en tilfeldig policy synker ALLE fire seter monotont: `amerikaner` og
 * `solo` er i masken, en tilfeldig policy tar dem ofte, og de koster
 * `målPoeng/2` og `målPoeng` når de ryker. Maksimum synker med dem, og løpet
 * til 30 blir UBUNDET — frø 4 161 736 sto i runde 365 på −1455/−2364/−2044/
 * −1693 og var fortsatt ikke ferdig. Prøven under holder fast på at taket
 * finnes og at en avbrutt kamp er MERKET som avbrutt, slik at andelen kan
 * måles i stedet for å bli borte.
 *
 * ===================== OG BUFFERET MÅ KUNNE GJENSPILLES ================
 *
 * `docs/mlb.md` §5a: hele grunnen til at trekklayouten IKKE er låst er at
 * bufferet lagrer kamper og ikke vektorer. Den påstanden er bare sann hvis
 * gjenspillingen gir nøyaktig de samme trekkvektorene. Det er prøvd bit for
 * bit her — ikke antatt fordi løkka er «den samme».
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lagRng } from "../src/kort.ts";
import { lagIndre, ADAMS_MAALT } from "../src/moe2/agentspek.ts";
import { lagRegler } from "../src/regler.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import { HANDLING_LENGDE } from "../src/mlb/handling.ts";
import { TREKK_LENGDE } from "../src/mlb/trekk.ts";
import { lagVane, VANER_TRENING } from "../src/mlb/liga.ts";
import {
  gjenspill,
  kamploggFraLinje,
  kamploggTilLinje,
  POLICY_UT,
  spillKamp,
  tdFordel,
  tilfeldigNett,
  TRO_UT,
  velgKode,
  type Sete,
} from "../src/mlb/selvspill.ts";

const nettSete = (navn: string, frø: number, temperatur: number): Sete => ({
  navn,
  nett: tilfeldigNett(lagRng(frø)),
  temperatur,
  samle: true,
});

// ===========================================================================
// Kontrakten mot nettet
// ===========================================================================

test("selvspill: POLICY_UT og TRO_UT er AVLEDET av layouten, ikke skrevet av", () => {
  assert.equal(POLICY_UT, HANDLING_LENGDE);
  assert.equal(POLICY_UT, 68);
  assert.equal(TRO_UT, 208);
});

test("velgKode: temperatur 0 er argmaks, og masken er en HARD skranke", () => {
  const logits = new Float32Array(HANDLING_LENGDE);
  for (let i = 0; i < logits.length; i++) logits[i] = i; // høyest til slutt
  const m = new Uint8Array(HANDLING_LENGDE);
  m[3] = 1;
  m[9] = 1;
  assert.equal(velgKode(logits, m, 0, lagRng(1)), 9, "argmaks skal ta den beste LOVLIGE");

  // Samplet: 4 000 trekk skal ALDRI treffe en ulovlig plass.
  const rng = lagRng(42);
  const sett = new Set<number>();
  for (let i = 0; i < 4000; i++) sett.add(velgKode(logits, m, 1, rng));
  assert.deepEqual([...sett].sort((a, b) => a - b), [3, 9]);
});

test("velgKode: temperatur > 0 sampler FAKTISK, ellers er utforskningen død", () => {
  const logits = new Float32Array(HANDLING_LENGDE);
  logits[3] = 1;
  logits[9] = 1.2;
  const m = new Uint8Array(HANDLING_LENGDE);
  m[3] = 1;
  m[9] = 1;
  const rng = lagRng(7);
  let treff3 = 0;
  for (let i = 0; i < 2000; i++) if (velgKode(logits, m, 1, rng) === 3) treff3++;
  assert.ok(
    treff3 > 200 && treff3 < 1800,
    `sampling ga ${treff3}/2000 på den nest beste — det ser ut som argmaks i forkledning, ` +
      `og da ser nettet aldri noe annet enn det den alt tror (AVGJØRELSE 4)`,
  );
});

// ===========================================================================
// Fase 1: spiller et tilfeldig nett lovlig?
// ===========================================================================

test("fase 1: 25 kamper med et TILFELDIG nett — ingen ulovlig handling, ingen krasj", () => {
  let kamper = 0;
  let beslutninger = 0;
  let avbrutte = 0;
  for (let k = 0; k < 25; k++) {
    const frø = 2_700_000 + k * 6131;
    const e = spillKamp({
      frø,
      seter: [0, 1, 2, 3].map((i) => nettSete(`n${i}`, frø + i, 1)),
      målPoeng: 30,
      /**
       * ET LAVERE TAK ENN I PRODUKSJON, med vilje. En tilfeldig policy gir
       * kamper som kan gå i hundrevis av runder, og en prøve som bruker et
       * halvminutt blir en prøve folk slutter å kjøre.
       */
      maksRunder: 50,
      samleTrekk: false,
    });
    kamper++;
    beslutninger += e.logg.koder.length;
    if (e.fasit.avbrutt) avbrutte++;
    assert.ok(e.rader.length > 0, "kampen ga ingen rader");
    assert.equal(e.fasit.sluttpoeng.length, 4);
    assert.ok(e.fasit.runder >= 1);
  }
  assert.equal(kamper, 25);
  assert.ok(beslutninger > 10_000, `bare ${beslutninger} beslutninger — prøven er for liten`);
  /**
   * DET AVBRUTTE ER IKKE EN FEIL, MEN DET SKAL VÆRE SYNLIG. Er andelen 0 %,
   * har noen fjernet taket; er den 100 %, spiller ingen ferdig i det hele tatt.
   */
  assert.ok(avbrutte < kamper, "ALLE kampene ble avbrutt på rundetaket — noe er galt med løpet");
});

test("fase 1: en kamp er DETERMINISTISK i frøet — ellers kan ingenting parres", () => {
  const frø = 3_010_101;
  const lag = (): Sete[] => [0, 1, 2, 3].map((i) => nettSete(`n${i}`, frø + i, 1));
  const a = spillKamp({ frø, seter: lag(), målPoeng: 30, samleTrekk: false });
  const b = spillKamp({ frø, seter: lag(), målPoeng: 30, samleTrekk: false });
  assert.deepEqual(a.logg.koder, b.logg.koder);
  assert.deepEqual(a.fasit, b.fasit);
});

// ===========================================================================
// §5a: bufferet lagrer kamper, og gjenspillingen må være bit-identisk
// ===========================================================================

test("§5a: gjenspill gir BIT-IDENTISKE trekkvektorer — ellers er ikke layouten fri", () => {
  const frø = 3_303_030;
  const seter: Sete[] = [
    nettSete("kandidat", frø, 1),
    { navn: "vane.grisk", nett: null, temperatur: 0, egen: lagVane(VANER_TRENING[0]!.spek), samle: true },
    nettSete("n2", frø + 2, 1),
    { navn: "vane.feig", nett: null, temperatur: 0, egen: lagVane(VANER_TRENING[1]!.spek), samle: true },
  ];
  const spilt = spillKamp({ frø, seter, målPoeng: 30, samleTrekk: true });
  assert.ok(spilt.rader.length > 50, `bare ${spilt.rader.length} rader`);

  // Gjennom serialiseringen, som er veien dataene faktisk går.
  const igjen = gjenspill(kamploggFraLinje(kamploggTilLinje(spilt.logg)), { samleTrekk: true });

  assert.equal(igjen.rader.length, spilt.rader.length, "ulikt antall rader");
  let sammenliknet = 0;
  for (let i = 0; i < spilt.rader.length; i++) {
    const a = spilt.rader[i]!;
    const b = igjen.rader[i]!;
    assert.equal(a.kode, b.kode, `rad ${i}: ulik kode`);
    assert.equal(a.sete, b.sete);
    assert.equal(a.delsteg, b.delsteg);
    assert.equal(a.rundeNr, b.rundeNr);
    assert.equal(a.poengFør, b.poengFør);
    assert.deepEqual([...a.troFasit], [...b.troFasit], `rad ${i}: ulik troFasit`);
    assert.ok(a.trekk !== null && b.trekk !== null);
    assert.equal(a.trekk.length, TREKK_LENGDE);
    for (let j = 0; j < TREKK_LENGDE; j++) {
      if (!Object.is(a.trekk[j], b.trekk[j])) {
        assert.fail(
          `rad ${i}, trekk ${j}: ${String(a.trekk[j])} spilt mot ${String(b.trekk[j])} gjenspilt. ` +
            `Da er §5a-påstanden falsk: bufferet kan IKKE bygges på nytt fra kamploggen.`,
        );
      }
    }
    sammenliknet++;
  }
  assert.ok(sammenliknet > 50);
  assert.deepEqual(igjen.fasit, spilt.fasit);
});

test("§5a: en kamplogg er liten — hele poenget med å lagre kamper og ikke vektorer", () => {
  const frø = 3_404_040;
  const e = spillKamp({
    frø,
    seter: [0, 1, 2, 3].map((i) => nettSete(`n${i}`, frø + i, 1)),
    målPoeng: 30,
    samleTrekk: false,
  });
  const bytes = Buffer.byteLength(kamploggTilLinje(e.logg));
  const somVektorer = e.logg.koder.length * TREKK_LENGDE * 4;
  assert.ok(
    bytes * 100 < somVektorer,
    `kamploggen er ${bytes} B mot ${somVektorer} B som vektorer — under 100× er ikke §5a`,
  );
});

// ===========================================================================
// Etikettene
// ===========================================================================

test("etiketten: troFasit står i RADEN, aldri i trekkvektoren", () => {
  const frø = 3_505_050;
  const e = spillKamp({
    frø,
    seter: [0, 1, 2, 3].map((i) => nettSete(`n${i}`, frø + i, 1)),
    målPoeng: 30,
    samleTrekk: true,
  });
  let medUsett = 0;
  for (const rad of e.rader) {
    assert.equal(rad.troFasit.length, 52);
    for (const kl of rad.troFasit) assert.ok(kl >= 0 && kl <= 4, `ulovlig troklasse ${kl}`);
    if ([...rad.troFasit].some((x) => x > 0)) medUsett++;
  }
  assert.ok(
    medUsett > e.rader.length / 2,
    `bare ${medUsett} av ${e.rader.length} rader har et usett kort i fasiten — ` +
      `en etikett som nesten alltid er tom bærer ingen gradient`,
  );
});

test("TD: r er en DIFFERANSE av poengFør, og siste rad henter fra sluttpoenget", () => {
  const frø = 3_606_060;
  const e = spillKamp({
    frø,
    seter: [0, 1, 2, 3].map((i) => nettSete(`n${i}`, frø + i, 1)),
    målPoeng: 30,
    samleTrekk: false,
  });
  // Med V ≡ 0 er A = r, og summen av alle r for ett sete er setets sluttpoeng.
  for (let sete = 0; sete < 4; sete++) {
    const iRader = e.rader.map((r, i) => ({ r, i })).filter((x) => x.r.sete === sete);
    if (iRader.length === 0) continue;
    let sum = 0;
    for (const { i } of iRader) sum += tdFordel(e.rader, i, e.fasit, () => 0);
    const forventet = (e.fasit.sluttpoeng[sete] ?? 0) - (iRader[0]!.r.poengFør ?? 0);
    assert.ok(
      Math.abs(sum - forventet) < 1e-9,
      `sete ${sete}: summen av delbelønninger er ${sum}, kampens poeng er ${forventet}. ` +
        `Da lekker eller mistes kreditt et sted i kjeden.`,
    );
  }
});

test("verdien: samle er AV for motstandersetene — vi trener ikke på deres valg", () => {
  const frø = 3_707_070;
  const e = spillKamp({
    frø,
    seter: [
      nettSete("kandidat", frø, 1),
      { ...nettSete("m1", frø + 1, 1), samle: false },
      { ...nettSete("m2", frø + 2, 1), samle: false },
      { ...nettSete("m3", frø + 3, 1), samle: false },
    ],
    målPoeng: 30,
    samleTrekk: false,
  });
  assert.ok(e.rader.every((r) => r.sete === 0), "en rad kom fra et sete som ikke skulle samles");
  assert.ok(e.rader.length * 3 < e.logg.koder.length, "for mange rader — samle:false virket ikke");
});

// ===========================================================================
// Hukommelsen: delt bok = fire bøker, MÅLT
// ===========================================================================

test("hukommelsen: én delt bok gir BIT-IDENTISKE vektorer med fire egne bøker", () => {
  /**
   * Optimaliseringen i `kjørKamp` hviler helt på denne likheten, og den er
   * lovlig FORDI bokas innhold bare avhenger av `RUNDE_SLUTT` — det alle fire
   * så. Holder den ikke, er den delte boka en informasjonslekkasje, og da skal
   * denne testen si fra og ikke fartsmålingen.
   */
  const R = lagRegler({ antallSpillere: 4, målPoeng: 30 });
  let sammenlikninger = 0;
  let avvik = 0;
  for (let k = 0; k < 3; k++) {
    let s: GameState = opprettSpill(R, 3_300_000 + k * 911);
    const delt = new Hukommelse();
    const egne = [0, 1, 2, 3].map(() => new Hukommelse());
    const drivere = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
    let v = 0;
    while (s.fase !== "FERDIG" && v++ < 4000) {
      delt.observer(s);
      for (const b of egne) b.observer(s);
      if (s.fase === "RUNDE_SLUTT") {
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (sete === null) break;
      for (let p = 0; p < 4; p++) {
        const a = delt.vektor(p, 4);
        const b = egne[p]!.vektor(p, 4);
        sammenlikninger++;
        for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) avvik++;
      }
      s = utfør(s, drivere[sete]!.velgHandling(s)).state;
    }
  }
  assert.ok(sammenlikninger > 500, `bare ${sammenlikninger} sammenlikninger`);
  assert.equal(avvik, 0, `${avvik} tall skilte seg — den delte boka er IKKE den samme boka`);
});

// ===========================================================================
// Per økt, aldri til disk
// ===========================================================================

test("selvspill og liga RØRER ALDRI disk — spillerprofiler dør med økta", () => {
  /**
   * Regelen er hard i dette prosjektet: en profil om en spiller lever i minnet
   * og dør med prosessen. `okt.ts` lever under den samme regelen, håndhevet av
   * `test/okt.test.ts`, og hukommelsen i selvspillet er nøyaktig samme slags
   * data — hvordan de andre ved bordet spiller.
   *
   * En kommentar som sier «vi lagrer ikke» kan ryke ved neste endring. Denne
   * leser KILDEN. Kommentarer teller ikke: en fil som forklarer hvorfor den
   * ikke bruker `node:fs` skal ikke straffes for å dokumentere godt.
   */
  const utenKommentarer = (kilde: string): string =>
    kilde.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const rot = new URL("..", import.meta.url).pathname;
  for (const fil of ["src/mlb/selvspill.ts", "src/mlb/liga.ts"]) {
    const kilde = utenKommentarer(readFileSync(`${rot}${fil}`.replace(/^\//, ""), "utf8"));
    for (const forbudt of [
      "node:fs",
      "writeFile",
      "readFile",
      "appendFile",
      "localStorage",
      "indexedDB",
      "fetch(",
    ]) {
      assert.ok(!kilde.includes(forbudt), `${fil} inneholder «${forbudt}» — den lagrer noe`);
    }
  }
});
