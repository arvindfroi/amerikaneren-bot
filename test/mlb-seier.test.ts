/**
 * SEIERSMÅLET (`src/mlb/seier.ts`) — poeng byttes mot vinnersjanse, og INGENTING
 * annet i målet flytter seg.
 *
 * Avbildningen rører bare `poengFør` og `sluttpoeng`, og den hviler på tre ting
 * som må være sanne i motoren og ikke bare i kommentaren:
 *
 *   1. `poengAlleFør` er tavla slik motoren hadde den, og den står stille
 *      gjennom runden (poeng faller bare ved rundeslutt).
 *   2. Summen av belønningene TELESKOPERER: med γ = 1 er målet ved setets
 *      første beslutning `SKALA · (1[vant] − P(start))`. Er det ikke det, er
 *      det ikke kampseier som trenes mot.
 *   3. Runde/hale-delingen (§125) er fortsatt eksakt: `Gr + Gh = G`.
 *
 * Prøvene kjøres på EKTE selvspillkamper (tilfeldige nett, motoren), med en
 * PLANTET sjansefunksjon — ikke den trente prediktoren, som ikke ligger i repoet
 * og ikke skal avgjøre om regnestykket er riktig.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lagRng } from "../src/kort.ts";
import {
  SEIER_INN,
  SEIER_SKALA,
  SEIER_UT,
  Seiersprediktor,
  seierTrekk,
  somSeiersmål,
  type Sjanse,
} from "../src/mlb/seier.ts";
import {
  delteRetur,
  diskontertRetur,
  spillKamp,
  tilfeldigNett,
  type Beslutningsrad,
  type Erfaring,
} from "../src/mlb/selvspill.ts";

const kamp = (frø: number): Erfaring =>
  spillKamp({
    frø,
    seter: [0, 1, 2, 3].map((i) => ({
      navn: `n${i}`,
      nett: tilfeldigNett(lagRng(frø + i)),
      temperatur: 1,
      samle: true,
    })),
    målPoeng: 30,
    maksRunder: 30,
    samleTrekk: false,
  });

const KAMPER = [7_310_101, 7_310_202, 7_310_303].map(kamp);

/** En sjanse som AVHENGER av hele tavla og av setet — en konstant ville skjult feil. */
const plantet: Sjanse = (p, s) => {
  let beste = -Infinity;
  for (let j = 0; j < p.length; j++) if (j !== s) beste = Math.max(beste, p[j]!);
  return 1 / (1 + Math.exp(-(p[s]! - beste) / 10));
};

const førsteRadPerSete = (rader: readonly Beslutningsrad[]): Map<number, number> => {
  const m = new Map<number, number>();
  rader.forEach((r, i) => {
    if (!m.has(r.sete)) m.set(r.sete, i);
  });
  return m;
};

test("tavla i raden er motorens, og den står stille gjennom runden", () => {
  let runderMedFlytt = 0;
  for (const e of KAMPER) {
    assert.ok(e.rader.length > 100, `bare ${e.rader.length} rader`);
    const perRunde = new Map<number, string>();
    for (const r of e.rader) {
      assert.equal(r.poengAlleFør.length, 4);
      assert.equal(r.poengAlleFør[r.sete], r.poengFør, "tavla og setets poengFør er uenige");
      const nøkkel = JSON.stringify(r.poengAlleFør);
      const før = perRunde.get(r.rundeNr);
      if (før === undefined) perRunde.set(r.rundeNr, nøkkel);
      else assert.equal(nøkkel, før, `tavla flyttet seg inne i runde ${r.rundeNr}`);
    }
    // Og den flytter seg MELLOM runder — ellers er prøven over tom.
    const tavler = [...perRunde.values()];
    for (let i = 1; i < tavler.length; i++) if (tavler[i] !== tavler[i - 1]) runderMedFlytt++;
  }
  assert.ok(runderMedFlytt > 5, `tavla flyttet seg bare ${runderMedFlytt} ganger mellom runder`);
});

test("med γ = 1 teleskoperer målet til SKALA · (1[vant] − P(start))", () => {
  for (const e of KAMPER) {
    const s = somSeiersmål(e.rader, e.fasit, plantet);
    const G = diskontertRetur(s.rader, s.fasit, 1);
    for (const [sete, i] of førsteRadPerSete(e.rader)) {
      const rad = e.rader[i]!;
      const ventet =
        SEIER_SKALA * (sete === e.fasit.vinner ? 1 : 0) -
        SEIER_SKALA * plantet(rad.poengAlleFør, sete, e.fasit.målPoeng);
      assert.ok(Math.abs(G[i]! - ventet) < 1e-9, `sete ${sete}: G ${G[i]} mot ventet ${ventet}`);
    }
  }
});

test("hver rad får SKALA · P(sin EGEN tavle, sitt EGET sete) — også når setene står ulikt", () => {
  /**
   * Teleskoperingsprøven over leser bare setets FØRSTE rad, og der er tavla
   * tom for alle fire, så en hurtigbuffer som glemte setet i nøkkelen besto den
   * (målt: mutanten «nøkkel uten sete» ga 8 av 8 grønne). Denne leser hver rad.
   */
  let runderDerSeteneSkiller = 0;
  for (const e of KAMPER) {
    const s = somSeiersmål(e.rader, e.fasit, plantet);
    const verdierPerRunde = new Map<number, Set<number>>();
    s.rader.forEach((r, i) => {
      const o = e.rader[i]!;
      const ventet = SEIER_SKALA * plantet(o.poengAlleFør, o.sete, e.fasit.målPoeng);
      assert.equal(r.poengFør, ventet, `rad ${i} (runde ${o.rundeNr}, sete ${o.sete})`);
      const sett = verdierPerRunde.get(o.rundeNr) ?? new Set<number>();
      sett.add(r.poengFør);
      verdierPerRunde.set(o.rundeNr, sett);
    });
    for (const sett of verdierPerRunde.values()) if (sett.size > 1) runderDerSeteneSkiller++;
  }
  assert.ok(runderDerSeteneSkiller > 5, `bare ${runderDerSeteneSkiller} runder der setene fikk ulik sjanse`);
});

test("runde/hale-delingen er fortsatt eksakt under seiersmålet (§125)", () => {
  for (const e of KAMPER) {
    const s = somSeiersmål(e.rader, e.fasit, plantet);
    for (const gamma of [0.5, 1]) {
      const G = diskontertRetur(s.rader, s.fasit, gamma);
      const d = delteRetur(s.rader, s.fasit, gamma);
      for (let i = 0; i < G.length; i++) {
        assert.ok(Math.abs(d.runde[i]! + d.hale[i]! - G[i]!) < 1e-9, `rad ${i}, γ ${gamma}`);
      }
    }
  }
});

test("belønningen er null inne i runden og faller ved rundeskillet", () => {
  let skiller = 0;
  for (const e of KAMPER) {
    const s = somSeiersmål(e.rader, e.fasit, plantet);
    for (let i = 0; i < s.rader.length; i++) {
      const j = s.rader[i]!.nesteISete;
      if (j < 0) continue;
      if (s.rader[j]!.rundeNr === s.rader[i]!.rundeNr) {
        assert.equal(s.rader[j]!.poengFør, s.rader[i]!.poengFør, `rad ${i} -> ${j} i samme runde`);
      } else if (s.rader[j]!.poengFør !== s.rader[i]!.poengFør) skiller++;
    }
  }
  assert.ok(skiller > 10, `bare ${skiller} rundeskiller flyttet sjansen`);
});

test("fasiten blir vinner = SKALA, resten 0 — og inngangen er urørt", () => {
  const e = KAMPER[0]!;
  const førPoeng = e.rader.map((r) => r.poengFør);
  const førSlutt = [...e.fasit.sluttpoeng];
  const s = somSeiersmål(e.rader, e.fasit, plantet);
  assert.deepEqual(
    s.fasit.sluttpoeng,
    e.fasit.sluttpoeng.map((_, i) => (i === e.fasit.vinner ? SEIER_SKALA : 0)),
  );
  assert.deepEqual(e.rader.map((r) => r.poengFør), førPoeng, "radene inn ble endret");
  assert.deepEqual([...e.fasit.sluttpoeng], førSlutt, "fasiten inn ble endret");
  assert.equal(s.rader[5]!.trekk, e.rader[5]!.trekk);
});

test("en tavle som er uenig med poengFør kastes i stedet for å gi feil mål", () => {
  const e = KAMPER[1]!;
  const ødelagt = e.rader.map((r, i) =>
    i === 40 ? { ...r, poengAlleFør: r.poengAlleFør.map((p, j) => (j === r.sete ? p + 1 : p)) } : r,
  );
  assert.throws(() => somSeiersmål(ødelagt, e.fasit, plantet), /uenige/);
});

test("seierTrekk er rotert fra setet og klippet", () => {
  const rng = lagRng(99);
  for (let k = 0; k < 200; k++) {
    const p = [0, 1, 2, 3].map(() => Math.round((rng() - 0.4) * 250));
    const m = [30, 60, 100][k % 3]!;
    for (let s = 0; s < 4; s++) {
      const rot = [0, 1, 2, 3].map((j) => p[(s + j) % 4]!);
      assert.deepEqual([...seierTrekk(p, s, m)], [...seierTrekk(rot, 0, m)], `sete ${s}`);
    }
  }
  const x = seierTrekk([-1000, 29, 0, 0], 0, 30);
  assert.equal(x[0], 3, "avstanden klippes på 3");
  assert.equal(x[4], -3, "andelen klippes på −3");
  assert.ok(Math.abs(x[1]! - 0.01) < 1e-7);
  assert.ok(Math.abs(x[5]! - 29 / 30) < 1e-7);
  assert.ok(Math.abs(x[8]! - 0.3) < 1e-7);
  assert.throws(() => seierTrekk([0, 0, 0], 0, 30), /fire|4/);
});

/** Appens vektformat, skrevet for hånd — samme som `skriv_vekter` i `verktoy/seier-tren.py`. */
const tilBytes = (deler: { inn: number; ut: number; w: number[]; b: number[] }[][]): Uint8Array => {
  const tall: number[] = [];
  const typer: ("i" | "f")[] = [];
  const i32 = (v: number): void => void (tall.push(v), typer.push("i"));
  const f32 = (v: number): void => void (tall.push(v), typer.push("f"));
  i32(deler.length);
  for (const lag of deler) {
    i32(lag.length);
    for (const l of lag) {
      i32(l.inn);
      i32(l.ut);
      l.w.forEach(f32);
      l.b.forEach(f32);
    }
  }
  const dv = new DataView(new ArrayBuffer(tall.length * 4));
  tall.forEach((v, k) => (typer[k] === "i" ? dv.setInt32(k * 4, v, true) : dv.setFloat32(k * 4, v, true)));
  return new Uint8Array(dv.buffer);
};

test("prediktoren: fordelingen summerer til 1, lederen får mest, og feil form kastes", () => {
  // logit_j = −5 · avstand_j: nærmest målet får høyest sjanse.
  const w: number[] = [];
  for (let r = 0; r < SEIER_UT; r++) {
    for (let c = 0; c < SEIER_INN; c++) w.push(c === r ? -5 : 0);
  }
  const pred = Seiersprediktor.fraBytes(
    tilBytes([[{ inn: SEIER_INN, ut: SEIER_UT, w, b: [0, 0, 0, 0] }]]),
  );
  const lik = pred.fordeling([10, 10, 10, 10], 2, 100);
  for (const p of lik) assert.ok(Math.abs(p - 0.25) < 1e-6);
  const f = pred.fordeling([20, 5, -10, 0], 1, 60);
  assert.ok(Math.abs(f.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.ok(pred.sjanse([20, 5, -10, 0], 0, 60) > pred.sjanse([20, 5, -10, 0], 1, 60));
  assert.ok(pred.sjanse([20, 5, -10, 0], 1, 60) > pred.sjanse([20, 5, -10, 0], 2, 60));

  const nuller = (n: number): number[] => new Array<number>(n).fill(0);
  assert.throws(
    () => Seiersprediktor.fraBytes(tilBytes([[{ inn: 8, ut: 4, w: nuller(32), b: nuller(4) }]])),
    /tar 9 inn/,
  );
  assert.throws(
    () => Seiersprediktor.fraBytes(tilBytes([[{ inn: 9, ut: 3, w: nuller(27), b: nuller(3) }]])),
    /gir 4 ut/,
  );
  const en = { inn: 9, ut: 4, w: nuller(36), b: nuller(4) };
  assert.throws(() => Seiersprediktor.fraBytes(tilBytes([[en], [en]])), /ÉN del/);
});
