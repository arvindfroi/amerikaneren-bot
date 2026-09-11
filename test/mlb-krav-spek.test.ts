/**
 * KRAVBATTERIET FOR HELE BOTEN — dommene og statistikken (`examples/krav-helbot.ts`,
 * `examples/klynge.ts`).
 *
 * Dommene er rene funksjoner nettopp for at de skal kunne prøves uten timer med CPU:
 * hver regel i filhodet til krav-helbot.ts har en prøve her, og hver regel som gjør en
 * rad STUM har en prøve som viser at den faktisk slår til. Til slutt én liten ekte
 * kjøring av `mlb-krav.ts --spek` som viser at orkestreringen skriver rapporten.
 */

import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { ADAMS_MAALT } from "../src/moe2/agentspek.ts";
import { klyngeSnitt, klyngeStigning } from "../examples/klynge.ts";
import {
  biter,
  domK1,
  domK6,
  domK8,
  domBudduell,
  domNaabart,
  domTak,
  sprikende,
  type D1,
  type K8Rad,
  type NaabartRad,
  type Takrad,
} from "../examples/krav-helbot.ts";
import type { Runderad } from "../examples/k6-vaner.ts";
import type { Kravrad } from "../examples/mlb-krav.ts";

// ===========================================================================
// Klyngestatistikken
// ===========================================================================

test("klyngeSnitt: snittet er radsnittet, og kopierte rader i én klynge gir IKKE mindre SE", () => {
  const enkelt = [1, 3, 2, 5, 4, 6, 2, 3].map((v, i) => ({ k: i, v }));
  const kopiert = enkelt.flatMap((r) => [r, r, r, r]);
  const a = klyngeSnitt(enkelt, (r) => r.k, (r) => r.v);
  const b = klyngeSnitt(kopiert, (r) => r.k, (r) => r.v);
  assert.equal(a.snitt, 3.25);
  assert.equal(b.snitt, 3.25);
  assert.equal(b.klynger, 8);
  // Fire kopier av samme giv er ÉN måling. En naiv SE ville krympet med faktor 2.
  assert.ok(Math.abs(b.se - a.se) < 0.05 * a.se, `klynget SE ${b.se} mot ${a.se}`);
  assert.ok(Number.isNaN(klyngeSnitt([{ k: 0, v: 1 }], (r) => r.k, (r) => r.v).se), "én klynge kan ikke gi en SE");
});

test("klyngeStigning: eksakt linje gir riktig stigning og SE ≈ 0", () => {
  const rader = [0, 1, 2, 3, 4, 5].flatMap((k) => [0, 1, 2, 3].map((x) => ({ k, x, y: 2 * x + k })));
  const s = klyngeStigning(rader, (r) => r.k, (r) => r.x, (r) => r.y);
  assert.ok(Math.abs(s.b - 2) < 1e-9, `stigning ${s.b}`);
  assert.ok(s.se < 1e-9);
});

test("biter: sammenhengende, dekker alt, aldri tomme", () => {
  assert.deepEqual(biter(10, 3), [
    { start: 0, len: 4 },
    { start: 4, len: 3 },
    { start: 7, len: 3 },
  ]);
  assert.deepEqual(biter(2, 8), [
    { start: 0, len: 1 },
    { start: 1, len: 1 },
  ]);
});

// ===========================================================================
// K3/K7: takvinduet
// ===========================================================================

const tak = (differ: number[], kappet = false): Takrad[] =>
  differ.map((d, i) => ({ frø: i % 6, diff: d, kappet }));
const nuller = tak([0, 0, 0, 0, 0, 0]);
const sterkStakk = tak([2, 3, 2.5, 3.5, 2, 3]);

test("domTak: lukket vindu er ja, men ALDRI fra et kappet tre", () => {
  assert.equal(domTak(tak([0.1, -0.1, 0, 0.2, -0.2, 0]), sterkStakk, nuller).innfridd, "ja");
  assert.equal(
    domTak(tak([0.1, -0.1, 0, 0.2, -0.2, 0], true), sterkStakk, nuller).innfridd,
    "stum",
    "et kappet tre er en nedre grense — «gapet er null» kan ikke leses fra det",
  );
  assert.equal(domTak(tak([2, 3, 2, 3, 2, 3], true), sterkStakk, nuller).innfridd, "nei", "et stort gap er et funn også når treet er kappet");
});

test("domTak: tomt vindu ulik 0, svak felle eller negativt gap gjør raden stum", () => {
  const liten = tak([0.1, -0.1, 0, 0.2, -0.2, 0]);
  assert.equal(domTak(liten, sterkStakk, tak([0, 0, 1, 0, 0, 0])).innfridd, "stum");
  assert.equal(domTak(liten, tak([0.1, -0.1, 0, 0.2, -0.2, 0]), nuller).innfridd, "stum");
  assert.equal(domTak(tak([-3, -2, -3, -2, -3, -2]), sterkStakk, nuller).innfridd, "stum");
});

// ===========================================================================
// K3.1: det nåbare taket og budduellen
// ===========================================================================

const nb = (differ: number[], endret: (i: number) => number = (i) => (i % 2 === 0 ? 1 : 0), mot?: number[]): NaabartRad[] =>
  differ.map((d, i) => ({
    frø: i % 6,
    diffNaabart: endret(i) === 0 ? 0 : d,
    naabartEndret: endret(i),
    diffMot: mot === undefined ? 0 : mot[i]!,
    motLik: mot === undefined ? true : mot[i] === 0 && i % 3 === 0,
    seierRein: 1,
    seierMot: 1,
  }));
const sterkPasser = nb([3, 4, 3.5, 4.5, 3, 4, 3, 4, 3.5, 4.5, 3, 4], () => 1, [3, 4, 3.5, 4.5, 3, 4, 3, 4, 3.5, 4.5, 3, 4]);

test("domNaabart: ensidig port — likt eller under taket er ja, signifikant over er nei", () => {
  assert.equal(domNaabart(nb([0.4, -0.2, 0.8, 0, -0.6, 0.2, 0.4, -0.2, 0.8, 0, -0.6, 0.2]), sterkPasser).innfridd, "ja");
  assert.equal(
    domNaabart(nb([-3, -2, -3, -2, -3, -2, -3, -2, -3, -2, -3, -2]), sterkPasser).innfridd,
    "ja",
    "et nåbart tak UNDER boten er W-støy (nedre grense), ikke en ødelagt måling",
  );
  // Ett uendret bud (rad 0) holder kontrollen i live; resten byttet og tapte.
  assert.equal(domNaabart(nb([3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2], (i) => (i === 0 ? 0 : 1)), sterkPasser).innfridd, "nei");
});

test("domNaabart: brutt paring, ingen uendrede rader eller en passer taket ikke ser gjør raden stum", () => {
  const ok = nb([0.4, -0.2, 0.8, 0, -0.6, 0.2, 0.4, -0.2, 0.8, 0, -0.6, 0.2]);
  const brutt = ok.map((r, i) => (i === 1 ? { ...r, diffNaabart: 1 } : r));
  assert.equal(domNaabart(brutt, sterkPasser).innfridd, "stum", "uendret bud med ulikt utfall = paringen holder ikke");
  assert.equal(domNaabart(nb([0.1, -0.1, 0.1, -0.1, 0.1, -0.1], () => 1), nb([0, 0, 0, 0, 0, 0], () => 1)).innfridd, "stum");
  assert.equal(domNaabart(ok, nb([0.2, -0.2, 0.1, 0, -0.1, 0.1], () => 1)).innfridd, "stum", "passeren slapp unna — taket har ikke kraft");
});

test("domBudduell: bot − Adams signifikant under 0 er nei; lik budfølge med ulikt utfall er stum", () => {
  const mot = (vals: number[]): number[] => vals.map((v, i) => (i % 3 === 0 ? 0 : v));
  const likt = nb(new Array(12).fill(0), () => 0, mot([0.5, -0.5, 1, 0, -1, 0.5, 0.5, -0.5, 1, 0, -1, 0.5]));
  assert.equal(domBudduell(likt, sterkPasser).innfridd, "ja");
  // diffMot = Adams − bot > 0 overalt: Adams er bedre.
  const adamsBedre = nb(new Array(12).fill(0), () => 0, mot([3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2]));
  assert.equal(domBudduell(adamsBedre, sterkPasser).innfridd, "nei");
  const brutt = likt.map((r, i) => (i === 3 ? { ...r, diffMot: 2 } : r));
  assert.equal(domBudduell(brutt, sterkPasser).innfridd, "stum");
  assert.equal(domBudduell(likt, nb([0, 0, 0, 0, 0, 0], () => 1, [0.1, -0.1, 0, 0.1, -0.1, 0])).innfridd, "stum", "boten uten søk slo ikke passeren");
});

// ===========================================================================
// K1: duplikatet
// ===========================================================================

function k1Rader(botFordel: number, seed = 1): D1[] {
  const ut: D1[] = [];
  let x = seed;
  const rnd = (): number => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let k = 0; k < 40; k++) {
    for (let r = 0; r < 6; r++) {
      const mP = 10 * (rnd() - 0.5);
      ut.push({ spill: `kamp${k}`, tid: "2026-08-20", runde: r, menneske: 3, bot: 4, diff: 1, mP, bP: mP + botFordel + 2 * (rnd() - 0.5) });
    }
  }
  return ut;
}

test("domK1: boten klart bedre enn mennesket og nevro klart dårligere gir ja", () => {
  const d = domK1(k1Rader(1.5), k1Rader(-3));
  assert.equal(d.kontrollOk, true);
  assert.equal(d.felleOk, true);
  assert.equal(d.innfridd, "ja");
});

/**
 * Rader med EKSAKT snitt og styrt klynge-SE: kamp k får ΔP = snitt ± spredning (vekselvis), så
 * snittet er nøyaktig `snitt` og SE ≈ spredning/√kamper. Rundene i en kamp deler verdien.
 */
function k1Fast(snitt: number, spredning: number, kamper = 40): D1[] {
  const ut: D1[] = [];
  for (let k = 0; k < kamper; k++) {
    const v = snitt + (k % 2 === 0 ? spredning : -spredning);
    for (let r = 0; r < 6; r++) {
      const mP = ((k * 7 + r * 3) % 11) - 5;
      ut.push({ spill: `kamp${k}`, tid: "2026-08-20", runde: r, menneske: 3, bot: 4, diff: 1, mP, bP: mP + v });
    }
  }
  return ut;
}

/** Fellearmen på NØYAKTIG de samme rundene (samme mP, kontrollen krever det): nevro 3 pp under mennesket. */
const k1FelleFor = (rader: readonly D1[]): D1[] => rader.map((x, i) => ({ ...x, bP: x.mP - 3 + (i % 2 === 0 ? 0.5 : -0.5) }));

test("domK1: porten er ≥ +1,0 pp OG z ≥ 3 — +0,86 med z ≈ 4,3 er NEI, der den gamle porten sa ja", () => {
  const felle = k1FelleFor(k1Fast(0, 0));
  const d = domK1(k1Fast(0.86, 1.265), felle);
  assert.ok(Math.abs(d.ks.snitt - 0.86) < 1e-9, `snitt ${d.ks.snitt}`);
  assert.ok(d.z > 3.5 && d.z < 5.5, `z ${d.z} — radene er ikke det prøven sier`);
  assert.equal(d.kontrollOk, true);
  assert.equal(d.felleOk, true);
  assert.equal(d.innfridd, "nei", "+0,86 pp er under terskelen på +1,0 pp uansett z");
  // FELLA FOR PRØVEN: den gamle regelen (> 2 SE og positiv i begge halvdeler) sier ja på de samme
  // radene. Ellers kunne «nei» over komme av noe annet enn terskelen.
  assert.ok(d.ks.snitt > 2 * d.ks.se && d.halv.every((h) => h.snitt > 0), "den gamle porten ville også sagt nei — prøven skiller ikke reglene");
  // Over terskelen og z ≥ 3: ja. Over terskelen men z < 3: nei.
  const sterk = domK1(k1Fast(1.5, 1.265), felle);
  assert.ok(sterk.z >= 3);
  assert.equal(sterk.innfridd, "ja");
  const usikker = domK1(k1Fast(1.2, 3.2), felle);
  assert.ok(usikker.z < 3 && usikker.ks.snitt >= 1.0, `z ${usikker.z}`);
  assert.equal(usikker.innfridd, "nei", "+1,2 pp med z < 3 er ikke målt godt nok");
});

test("domK1: fella som ikke taper for mennesket gjør raden stum; ulik menneskeside likeså", () => {
  assert.equal(domK1(k1Rader(1.5), k1Rader(0)).innfridd, "stum", "nevro på nivå med mennesket = målingen har ikke kraft");
  const f = k1Rader(-3).map((r, i) => (i === 7 ? { ...r, mP: r.mP + 1 } : r));
  assert.equal(domK1(k1Rader(1.5), f).innfridd, "stum", "menneskesiden må være identisk i begge armene");
  assert.equal(domK1(k1Rader(0.0), k1Rader(-3)).innfridd, "nei");
  // Rader før 10. aug teller ikke.
  const gamle = k1Rader(1.5).map((r) => ({ ...r, tid: "2026-07-30" }));
  assert.equal(domK1(gamle, gamle).ks.n, 0);
});

// ===========================================================================
// K8 og K6
// ===========================================================================

test("domK8: andel − 2 SE ≥ 25 % er ja; gulvet feil er stum; verre enn gulv+ er nei", () => {
  const ln3 = Math.log(3);
  const rader = (nett: number, gulv = ln3, gulvPluss = 1.0): K8Rad[] =>
    [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ frø: i, nett: nett + (i % 2 === 0 ? 0.01 : -0.01), gulv, gulvPluss }));
  assert.equal(domK8(rader(0.6)).innfridd, "ja");
  assert.equal(domK8(rader(0.95)).innfridd, "nei");
  assert.equal(domK8(rader(0.6, 1.0)).innfridd, "stum");
  assert.equal(domK8(rader(1.05, ln3, 1.0)).innfridd, "nei");
  assert.equal(domK8([]).innfridd, "stum");
});

function k6Rader(arm: string, gevinst: (runde: number, frø: number) => number): Runderad[] {
  const ut: Runderad[] = [];
  for (let k = 0; k < 8; k++) {
    for (let r = 0; r < 6; r++) {
      const felles = { arm: "okt", frø: 1000 + k, sete: 0, rundeNr: r, adamsPoeng: 0, andreSnitt: 0, bokRunder: 0, trumfN: 0, aggressivitet: null, vriSeter: 0, vriAktiv: false };
      ut.push({ ...felles, motstander: "noytral", kant: 0 });
      ut.push({ ...felles, motstander: "stilisert", kant: gevinst(r, k) });
    }
  }
  void arm;
  return ut;
}

test("domK6: dd som vokser med runden er ja; null mot null ulik 0 er stum", () => {
  const nul = k6Rader("null", (_r, k) => 3 + (k % 3));
  const minne = k6Rader("minne", (r, k) => 3 + (k % 3) + 0.5 * r + (k % 2 === 0 ? 0.1 : -0.1));
  const d = domK6(minne, nul, nul);
  assert.equal(d.kontrollOk, true);
  assert.equal(d.felleOk, true);
  assert.equal(d.innfridd, "ja");
  assert.equal(domK6(nul, nul, nul).innfridd, "nei");
  assert.equal(domK6(minne, nul, k6Rader("null2", (_r, k) => 3.5 + (k % 3))).innfridd, "stum");
});

test("sprikende: et krav med ulik dom i to bånd flagges", () => {
  const rad = (krav: string, innfridd: Kravrad["innfridd"], bånd: number): Kravrad => ({
    krav, bånd, navn: "", målt: "", kontroll: "", kontrollOk: true, felle: "", felleOk: true, innfridd, kilde: "", merknad: "",
  });
  assert.deepEqual(sprikende([rad("K5", "ja", 0), rad("K5", "nei", 1), rad("K2", "ja", 0), rad("K2", "ja", 1)]), ["K5"]);
});

// ===========================================================================
// Orkestreringen, ende til ende (liten)
// ===========================================================================

test("mlb-krav --spek: skriver tsv, txt og json med K5-raden, og MLB-stien lastes ikke", () => {
  const ut = join(mkdtempSync(join(tmpdir(), "krav-helbot-")), "roeyk");
  const r = spawnSync(
    process.execPath,
    ["examples/mlb-krav.ts", "--spek", ADAMS_MAALT, "--kjapp", "--bare", "k5", "--kjerner", "2", "--ut", ut],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  assert.equal(r.status, 0, r.stderr);
  for (const ending of [".tsv", ".txt", ".json"]) assert.ok(existsSync(`${ut}${ending}`), `mangler ${ut}${ending}`);
  const json = JSON.parse(readFileSync(`${ut}.json`, "utf8")) as { rader: { krav: string; kontrollOk: boolean; felleOk: boolean }[] };
  const k5 = json.rader.find((x) => x.krav === "K5");
  assert.ok(k5 !== undefined, "K5-raden mangler");
  assert.equal(k5.kontrollOk, true, "kontrollen i K5 bommet i orkestreringen");
  assert.match(readFileSync(`${ut}.txt`, "utf8"), /RØYKMODUS/);
});
