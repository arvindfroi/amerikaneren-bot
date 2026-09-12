/**
 * TEMPOBLOKKEN (tenketiden ved bordet, 12. sep). Det som må holde, og som ingen krasj avslører:
 *
 *   1. BREDDEN: 1028 = 996 + 32, og 996 → 1028 er nuller BAKERST — ingen blokk flytter seg.
 *   2. K2: blokken og hele 1028-vektoren er BIT-IDENTISKE når bare de skjulte kortene byttes.
 *      FELLE: en blokk som leser en skjult hånd blir tatt av nøyaktig den prøven.
 *   3. EGEN TID ER IKKE EN SANS: observatørens EGNE tider endrer ikke blokken han får. Sete 0
 *      har ingen plass i layouten, så dette kan ikke brytes ved uhell — men FELLA viser at
 *      prøven ville tatt det om noen la det inn likevel.
 *   4. BOTENES REGNETID: `rundeTempo` leser `runde`-radens `tempo` og ALDRI `bottrekk`.
 *      FELLE: en `bottrekk`-rad med tider skal gi null, ikke poster.
 *   5. SEMANTIKKEN: håndbygde bøker der vi vet svaret — rotasjon, log-skala, avvik fra eget
 *      fasesnitt, skjult/ufokusert, og skillet «ingen tid» mot «null tid».
 *   6. NULLPUNKTET: et 996-nett med nuller bakerst gir NØYAKTIG samme tro, og én koblet
 *      kolonne i tempoblokken endrer den — ellers når blokken ikke fram.
 */
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { spillerVisning, type SpillerVisning } from "../src/motor.ts";
import { lagRng } from "../src/kort.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import {
  MLB_TEMPO,
  TEMPO_TAK_ANGRE,
  TEMPO_TAK_MS,
  TEMPO_TAK_N,
  TEMPOINNGANG as T,
  Tempobok,
  tempofaseAv,
  tempoLog,
  tempoTrekk,
  type Tempohendelse,
} from "../src/mlb/tempotrekk.ts";
import {
  MLB_TRO_BREDDER,
  MLB_TRO_INN_HS2,
  MLB_TRO_INN_HS2T,
  troKolonnekart,
  troTrekkForBredde,
} from "../src/mlb/trotrekk.ts";
import { MlbTronett, utvidTronett } from "../src/mlb/tronett.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { nettFraBytes, type NevroNett } from "../src/nevro/nett.ts";
import { NevroAgent } from "../src/nevro/agent.ts";
import { rundeTempo, type Hendelse } from "../examples/menneske-logg.ts";

const fil = (navn: string): string => fileURLToPath(new URL(`../e1-modell/${navn}`, import.meta.url));
const nevro = new NevroAgent();

/** Minimal visning: blokken leser BARE `deg` og antall seter. Det er hele poenget med den. */
const vis = (deg: number): SpillerVisning => ({ deg, antallKort: [12, 12, 12, 12] }) as unknown as SpillerVisning;

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

/** En bok med gitte poster, og én bokført runde med tider. */
function bokMed(poster: readonly Tempohendelse[]): Tempobok {
  const b = new Tempobok();
  b.rundeSett(poster.length > 0);
  for (const p of poster) b.se(p);
  return b;
}

/** Spillestillinger fra ekte kamper, med boka for bordet. */
function stillinger(frø: number, antall: number, maksRunder = 3): { s: GameState; huk: Hukommelse }[] {
  const ut: { s: GameState; huk: Hukommelse }[] = [];
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
    s = utfør(s, nevro.velgHandling(s)).state;
  }
  return ut;
}

// ---------------------------------------------------------------------------
// 1. Bredden
// ---------------------------------------------------------------------------

test("breddene: 32 i blokken, 1028 = 996 + 32, og 996 → 1028 er nuller bakerst", () => {
  assert.equal(MLB_TEMPO, 32);
  assert.equal(MLB_TRO_INN_HS2T, 1028);
  assert.deepEqual([...MLB_TRO_BREDDER], [660, 804, 776, 920, 996, 1028]);
  // Hver blokk i 996 står der den sto: utvidelsen legger BARE nuller bakerst.
  assert.deepEqual(troKolonnekart(996, 1028), [[0, 0, 660], [660, 660, 144], [804, 804, 116], [920, 920, 36], [956, 956, 40]]);
  // En utvidelse som mister en blokk er ikke en utvidelse.
  assert.throws(() => troKolonnekart(1028, 996), /tempo.*finnes ikke/);
});

// ---------------------------------------------------------------------------
// 2. K2: bytt de skjulte kortene
// ---------------------------------------------------------------------------

test("K2: tempoblokken og hele 1028-vektoren er bit-identiske når bare de skjulte kortene byttes", () => {
  let sjekket = 0;
  let ikkeTom = 0;
  for (const { s, huk } of stillinger(7_310_001, 10)) {
    const sete = s.iTur!;
    // Alle fire seter har tider, også observatøren — nettopp det byttet ikke skal kunne røre.
    const bok = bokMed([0, 1, 2, 3].map((p) => post(p, 900 + p * 700)));
    const fasit = troTrekkForBredde(MLB_TRO_INN_HS2T, spillerVisning(s, sete), s.giving.antallStikk, 100, huk.vektor(sete, 4), bok);
    assert.equal(fasit.length, 1028);
    if (fasit.subarray(MLB_TRO_INN_HS2).some((x) => x !== 0)) ikkeTom++;
    for (const hender of trekkVerdener(s, sete, 2, lagRng(5151 + sjekket), undefined, undefined, 4)) {
      const s2 = medVerden(s, hender, sete);
      const annen = troTrekkForBredde(MLB_TRO_INN_HS2T, spillerVisning(s2, sete), s.giving.antallStikk, 100, huk.vektor(sete, 4), bok);
      assert.deepEqual([...annen], [...fasit], "1028-vektoren endret seg da bare skjulte kort ble byttet");
      sjekket++;
    }
  }
  assert.ok(sjekket >= 10, `for få verdenssammenlikninger (${sjekket})`);
  assert.ok(ikkeTom >= 10, `tempoblokken var tom i alle stillinger (${ikkeTom}) — prøven beviser da ingenting`);
});

test("FELLE: en tempoblokk som leser en SKJULT hånd blir tatt av den samme prøven", () => {
  let avvik = 0;
  for (const { s } of stillinger(7_310_002, 4)) {
    const sete = s.iTur!;
    const bok = bokMed([0, 1, 2, 3].map((p) => post(p, 1500)));
    // Den «naturlige» juksen: la tempoet skaleres av noe på en annen hånd.
    const juks = (st: GameState): Float32Array => {
      const v = tempoTrekk(spillerVisning(st, sete), bok, "S");
      v[T.SISTE_LOG] += (st.hender[(sete + 1) % 4] ?? []).reduce((a, k) => a + k.verdi, 0) / 1000;
      return v;
    };
    const fasit = juks(s);
    for (const hender of trekkVerdener(s, sete, 2, lagRng(6161), undefined, undefined, 4)) {
      const annen = juks(medVerden(s, hender, sete));
      if (fasit.some((x, i) => !Object.is(x, annen[i]))) avvik++;
    }
  }
  assert.ok(avvik > 0, "en tempoblokk som leser en skjult hånd ble ikke tatt — K2-prøven over beviser da ingenting");
});

// ---------------------------------------------------------------------------
// 3. Egen tid er ikke en sans
// ---------------------------------------------------------------------------

test("EGEN TID: observatørens egne tider endrer ikke blokken han får — uansett hvor ulike de er", () => {
  for (const deg of [0, 1, 2, 3]) {
    const andre = [0, 1, 2, 3].filter((p) => p !== deg).map((p) => post(p, 1200 + p * 400));
    const uten = tempoTrekk(vis(deg), bokMed(andre), "S");
    // Samme bok, men observatøren har i tillegg fire helt ville egne tider.
    const med = tempoTrekk(
      vis(deg),
      bokMed([...andre, post(deg, 50), post(deg, 90_000), post(deg, 120), post(deg, 240_000, { angre: 3, skjultMs: 100_000 })]),
      "S",
    );
    assert.deepEqual([...med], [...uten], `sete ${deg} sin EGEN tenketid lekket inn i blokken han får`);
    assert.ok(uten.some((x) => x !== 0), "blokken var tom — prøven ville ikke sett en lekkasje");
  }
});

test("FELLE: en blokk som skriver setets EGEN tid inn i en celle blir tatt av den samme prøven", () => {
  const deg = 2;
  const andre = [0, 1, 3].map((p) => post(p, 1200 + p * 400));
  const juks = (bok: Tempobok): Float32Array => {
    const v = tempoTrekk(vis(deg), bok, "S");
    const s = bok.sete(deg);
    // Den «naturlige» feilen: rotasjonen glemmer at rel 0 er meg, og egen tid havner i rel 1.
    if (s !== null && s.siste !== null) v[T.SISTE_LOG] += s.siste.log;
    return v;
  };
  const uten = juks(bokMed(andre));
  const med = juks(bokMed([...andre, post(deg, 90_000)]));
  assert.notDeepEqual([...med], [...uten], "en blokk som leser sin egen tid ble ikke tatt");
});

// ---------------------------------------------------------------------------
// 4. Botenes regnetid kommer aldri inn
// ---------------------------------------------------------------------------

test("bottrekk blir aldri tempo: bare `runde`-radens tempo-felt leses, og formen håndheves", () => {
  const rad = (type: string, data: Record<string, unknown>): Hendelse => ({ id: 1, tid: "2026-09-12T00:00:00.000Z", spillId: "x", spiller: "p", type, data });
  // FELLA: en bottrekk-rad med tider som SER ut som tempo. Den har ikke feltet, og gir null.
  const bot = rad("bottrekk", { rundeNr: 0, trekk: [[1, "B", "nett", 5], [2, "S", "soek", 974]], tempo: undefined });
  assert.equal(rundeTempo(bot), null, "en bottrekk-rad ga tempo — botenes regnetid kan da havne i sansen");
  // En runde fra før v13: ingen tider. `null`, ikke en tom liste og ikke nuller.
  assert.equal(rundeTempo(rad("runde", { rundeNr: 0, delta: [0, 0, 0, 0] })), null);
  // En runde fra v13 og utover, i appens eget format.
  const t = rundeTempo(rad("runde", {
    rundeNr: 0,
    tempo: [
      { fase: "B", ms: 7213 },
      { fase: "S", stikk: 3, ms: 2089, skjultMs: 500, angre: 2 },
      { fase: "Q", ms: 100 },
      { fase: "S", ms: "tull" },
    ],
  }));
  assert.ok(t !== null);
  // De to ulesbare postene er borte — et gjettet tall er verre enn et manglende.
  assert.equal(t.length, 2);
  assert.deepEqual(t[0], { sete: 0, fase: "B", stikk: null, ms: 7213, skjultMs: 0, ufokusMs: 0, angre: 0 });
  assert.deepEqual(t[1], { sete: 0, fase: "S", stikk: 3, ms: 2089, skjultMs: 500, ufokusMs: 0, angre: 2 });
});

// ---------------------------------------------------------------------------
// 5. Semantikken
// ---------------------------------------------------------------------------

test("semantikken: rotasjon, log-skala, avvik fra eget fasesnitt, skjult/ufokusert og angre", () => {
  const nær = (a: number, b: number, hva: string): void => assert.ok(Math.abs(a - b) < 1e-6, `${hva}: ${a} mot ${b}`);
  const P = T.PER_SETE;
  // Sete 1 har tre S-tider; sete 3 én, med skjult tid, ufokus og angre.
  const bok = bokMed([
    post(1, 1000),
    post(1, 1000),
    post(1, 8000),
    post(3, 4000, { skjultMs: 1000, ufokusMs: 2000, angre: 5 }),
  ]);
  const v = tempoTrekk(vis(0), bok, "S");
  assert.equal(v.length, MLB_TEMPO);

  // Sete 1 er rel 1 sett fra 0: celle 0.
  nær(v[0 * P + T.SETT]!, 1, "sete 1 sett");
  nær(v[0 * P + T.SISTE_LOG]!, tempoLog(8000), "sete 1 siste");
  nær(v[0 * P + T.SNITT_LOG]!, (tempoLog(1000) * 2 + tempoLog(8000)) / 3, "sete 1 snitt");
  nær(v[0 * P + T.SNITT_FASE]!, v[0 * P + T.SNITT_LOG]!, "alle tre er S, så fasesnittet er snittet");
  nær(v[0 * P + T.SETT_FASE]!, 1, "sete 1 sett i fasen");
  nær(v[0 * P + T.N_OBS]!, 3 / TEMPO_TAK_N, "sete 1 antall");
  // Avviket er mot snittet SLIK DET VAR FØR målingen: (log 8000 − log 1000), positivt.
  nær(v[0 * P + T.SISTE_AVVIK]!, tempoLog(8000) - tempoLog(1000), "sete 1 avvik");
  assert.ok(v[0 * P + T.SISTE_AVVIK]! > 0, "en tregere-enn-vanlig beslutning skal gi positivt avvik");

  // Sete 2 er rel 2 og har ingenting: hele cellen er null, og SETT sier hvorfor.
  assert.deepEqual([...v.subarray(1 * P, 2 * P)], new Array<number>(P).fill(0));
  assert.equal(v[1 * P + T.SETT], 0, "et sete uten tider skal si «vet ikke», ikke «raskt»");

  // Sete 3 er rel 3: første måling i fasen har avvik 0 (ikke sammenliknet med seg selv).
  nær(v[2 * P + T.SISTE_AVVIK]!, 0, "første måling har intet snitt å avvike fra");
  nær(v[2 * P + T.SISTE_SKJULT]!, 1000 / 4000, "sete 3 skjult");
  nær(v[2 * P + T.SISTE_UFOKUS]!, 2000 / 4000, "sete 3 ufokus");
  nær(v[2 * P + T.SISTE_ANGRE]!, 1, "5 angre er klemt til taket");
  assert.equal(TEMPO_TAK_ANGRE, 3);

  // Rotasjonen: samme bok sett fra sete 1 legger sete 3 i rel 2.
  const fra1 = tempoTrekk(vis(1), bok, "S");
  nær(fra1[1 * P + T.SISTE_SKJULT]!, 1000 / 4000, "sete 3 er rel 2 sett fra sete 1");
  // ... og sete 1 sine egne tider er BORTE for sete 1 selv.
  assert.equal(fra1[2 * P + T.SETT], 0, "sete 1 så sine egne tider i rel 3");

  // Log-skalaen: klemt i [0, 1], og taket er taket.
  nær(tempoLog(TEMPO_TAK_MS), 1, "taket");
  nær(tempoLog(10 * TEMPO_TAK_MS), 1, "over taket er fortsatt 1");
  assert.equal(tempoLog(0), 0);
  assert.equal(tempoLog(Number.NaN), 0);
  assert.ok(tempoLog(2000) > tempoLog(1000) && tempoLog(1000) > tempoLog(500));
});

test("dekningen: en runde uten tider er «ikke målt», ikke «null tid»", () => {
  const tom = new Tempobok();
  assert.equal(tom.dekning, 0);
  assert.equal(tom.tom, true);
  const v = tempoTrekk(vis(0), tom, "S");
  assert.deepEqual([...v], new Array<number>(MLB_TEMPO).fill(0), "en tom bok skal gi en helt tom blokk");
  assert.equal(tempoTrekk(vis(0), null, "S")[T.NOEN], 0, "ingen bok er det samme som ingen tider");

  // Tre runder bokført, én med tider.
  const b = new Tempobok();
  b.rundeSett(false);
  b.rundeSett(true);
  b.se(post(1, 3000));
  b.rundeSett(false);
  assert.ok(Math.abs(b.dekning - 1 / 3) < 1e-9, `dekning ${b.dekning}`);
  const w = tempoTrekk(vis(0), b, "S");
  assert.ok(Math.abs(w[T.DEKNING]! - 1 / 3) < 1e-6);
  assert.equal(w[T.NOEN], 1);

  // Fasen styrer bare FASESNITTET: en B-tid gir ikke et S-snitt.
  const kunB = bokMed([post(1, 5000, { fase: "B" })]);
  assert.equal(tempoTrekk(vis(0), kunB, "S")[T.SETT_FASE], 0, "en B-tid ble talt som en S-tid");
  assert.equal(tempoTrekk(vis(0), kunB, "B")[T.SETT_FASE], 1);
  assert.equal(tempoTrekk(vis(0), kunB, "S")[T.SETT], 1, "setet er sett, selv om fasen ikke er det");
  assert.equal(tempofaseAv("SPILL"), "S");
  assert.equal(tempofaseAv("BUDRUNDE"), "B");
  assert.equal(tempofaseAv("VRAK"), "V");
  assert.equal(tempofaseAv("VELG"), "T");
  assert.equal(tempofaseAv("RUNDE_SLUTT"), null);
});

// ---------------------------------------------------------------------------
// 6. Nullpunktet
// ---------------------------------------------------------------------------

test("nullpunktet: et 996-nett med nuller bakerst gir NØYAKTIG samme tro; én koblet tempokolonne endrer den", () => {
  const kilde = existsSync(fil("tro-7.bin"))
    ? nettFraBytes(readFileSync(fil("tro-7.bin")))[0]!
    : existsSync(fil("tro-6.bin"))
    ? nettFraBytes(readFileSync(fil("tro-6.bin")))[0]!
    : null;
  if (kilde === null || kilde.lag[0]!.inn !== MLB_TRO_INN_HS2) {
    // Uten et 996-nett i e1-modell (ikke sporet) er det ingenting å utvide fra.
    return;
  }
  const gammel = new MlbTronett(kilde);
  const ny = new MlbTronett(utvidTronett(kilde, MLB_TRO_INN_HS2T));
  assert.equal(ny.innBredde, 1028);
  assert.deepEqual([ny.brukerHukommelse, ny.brukerSignal, ny.brukerSanser2, ny.brukerTempo], [true, true, true, true]);
  assert.equal(gammel.brukerTempo, false);

  const pos = stillinger(7_310_003, 8);
  assert.ok(pos.length >= 4, `for få stillinger (${pos.length})`);
  const bok = bokMed([0, 1, 2, 3].map((p) => post(p, 1100 + p * 900)));
  for (const { s, huk } of pos) {
    const v = spillerVisning(s, s.iTur!);
    const h = huk.vektor(s.iTur!, 4);
    const t = ny.trekkFor(v, s.giving.antallStikk, 100, h, bok);
    assert.equal(t.length, 1028);
    assert.ok(t.subarray(MLB_TRO_INN_HS2).some((x) => x !== 0), "tempoblokken er tom — nullpunktet prøver ingenting");
    assert.deepEqual(ny.fordeling(t), gammel.fordeling(gammel.trekkFor(v, s.giving.antallStikk, 100, h)));
  }

  // FELLA: én koblet kolonne. SISTE_LOG for rel 1 er ikke null i noen av stillingene over.
  const plantet: NevroNett = utvidTronett(kilde, MLB_TRO_INN_HS2T);
  const l = plantet.lag[0]!;
  for (let r = 0; r < l.ut; r++) l.vekter[r * l.inn + MLB_TRO_INN_HS2 + T.SISTE_LOG] = 3;
  const felle = new MlbTronett(plantet);
  let endret = 0;
  for (const { s, huk } of pos) {
    const v = spillerVisning(s, s.iTur!);
    const h = huk.vektor(s.iTur!, 4);
    const a = JSON.stringify(felle.fordeling(felle.trekkFor(v, s.giving.antallStikk, 100, h, bok)));
    const b = JSON.stringify(gammel.fordeling(gammel.trekkFor(v, s.giving.antallStikk, 100, h)));
    if (a !== b) endret++;
  }
  assert.ok(endret > 0, "en koblet tempokolonne endret ingen tro — blokken når ikke fram til nettet");
});
