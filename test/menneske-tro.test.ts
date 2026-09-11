/**
 * K8 OG K6 MOT MENNESKER — gjenskapingen, skriptet og dommene (11. sep).
 *
 * `examples/menneske-logg.ts`, `examples/menneske-tro.ts`, `examples/menneske-tro-dom.ts`.
 *
 *   1. GJENSKAPINGEN gir FASITTILSTANDENE loggen ble spilt med, også når en runde ender i
 *      kampslutt. Loggens `budrunde`-felt holdes mot gjenskapingen. FELLE: et plantet botbud som
 *      avviker fra speken skal gi nøyaktig ÉTT avvik, og uten avvik skal runden avvises.
 *   2. SKRIPTET ende til ende: én rad per stilling med ≥ 2 lovlige kort; null = null2 overalt; i
 *      runde 0 er tro = null = fremmed (tom bok); boka har sett HVER tidligere runde, også den som
 *      endte i FERDIG; og tapet i radene er det prøven regner selv av fasiten med eget nett og egen
 *      bok. FELLE: en bok som fikk FERDIG rått, gir et annet tap i runden etter.
 *   3. DOMMENE på konstruerte rader: stigning i begge halvdeler med fella tatt er ja; flat gevinst
 *      er nei; fremmed like god som tro er stum; null ≠ null2 på én rad er stum.
 */

import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { lovligeKort, spillerVisning, type GameState } from "../src/motor.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import { LN3, nettTap } from "../examples/k8-maal.ts";
import { gjenskapRunde, kamprunder, lesMenneskelogg, nyTeller, somRundeslutt, V5_KJEDE } from "../examples/menneske-logg.ts";
import { domK6Menneske, domK8Menneske, type MenneskeTroRad } from "../examples/menneske-tro-dom.ts";
import { syntetiskLogg, type SyntetiskKamp } from "./menneske-syntetisk.ts";

const ROT = fileURLToPath(new URL("..", import.meta.url));
const MAPPE = `_test-menneske-tro-${process.pid}`;
const TRO = `${ROT}/e1-modell/tro-1.bin`;
const FILER = [TRO, ...["d7alle.bin", "vrakrang.bin", "bud-menneske.json"].map((f) => `${ROT}/e1-modell/${f}`)];
const skip = FILER.some((f) => !existsSync(f)) ? "mangler e1-modell (ikke sporet)" : false;

before(() => mkdirSync(`${ROT}/${MAPPE}`, { recursive: true }));
after(() => rmSync(`${ROT}/${MAPPE}`, { recursive: true, force: true }));

const KAMPER: SyntetiskKamp[] = [
  { spillId: "mt-a", frø: 8_800_003, spiller: "p-a", målPoeng: 100, runder: [{ rundeNr: 0 }, { rundeNr: 1, før: [99, 99, 99, 99] }, { rundeNr: 2, før: [40, 40, 40, 40] }] },
  { spillId: "mt-b", frø: 8_800_004, spiller: "p-b", målPoeng: 100, runder: [{ rundeNr: 0 }, { rundeNr: 1 }] },
];

let logg: ReturnType<typeof syntetiskLogg> | null = null;
const lagLogg = (): ReturnType<typeof syntetiskLogg> => (logg ??= syntetiskLogg(KAMPER));
const skrivLogg = (navn: string, linjer: readonly string[]): string => {
  const sti = `${ROT}/${MAPPE}/${navn}`;
  writeFileSync(sti, `${linjer.join("\n")}\n`);
  return sti;
};
const nøkkel = (s: GameState): string => JSON.stringify(s);

// ===========================================================================
// 1. Gjenskapingen
// ===========================================================================

test("gjenskapingen gir fasittilstandene, også med kampslutt — og budrunde-feltet holdes mot den", { skip }, () => {
  const { linjer, fasit } = lagLogg();
  assert.equal(fasit[0]!.runder[1]!.tilstander.at(-1)!.fase, "FERDIG", "kampslutt-fella er ikke spilt");
  const kamper = lesMenneskelogg(skrivLogg("gjenskap.jsonl", linjer));
  const budgivere = [0, 1, 2, 3].map(() => lagIndre(V5_KJEDE));
  const teller = nyTeller();
  for (const f of fasit) {
    const steg = [...kamprunder(kamper.get(f.spillId)!, budgivere, teller)];
    assert.equal(steg.length, f.runder.length);
    for (let i = 0; i < steg.length; i++) {
      const g = steg[i]!.runde;
      assert.ok(g !== null, `${f.spillId} runde ${i} avvist: ${steg[i]!.avvist}`);
      assert.equal(g.budavvik, 0);
      assert.deepEqual(g.tilstander.map(nøkkel), f.runder[i]!.tilstander.map(nøkkel), `${f.spillId} runde ${i}: andre tilstander`);
    }
  }
  assert.equal(teller.kampslutt, 1);

  // Loggens budrunde-felt: det sanne godtas, et endret avvises.
  const felt = (endre: boolean): string[] =>
    linjer.map((l) => {
      const h = JSON.parse(l) as { spillId: string; type: string; data: Record<string, unknown> };
      if (h.spillId !== "mt-b" || h.type !== "runde" || h.data["rundeNr"] !== 0) return l;
      const s = fasit[1]!.runder[0]!.tilstander.at(-1)!;
      const sisteBud = [...s.budrunde.sisteBud];
      if (endre) sisteBud[1] = sisteBud[1] === null ? 5 : null;
      h.data["budrunde"] = { sisteBud, passet: s.budrunde.passet };
      return JSON.stringify(h);
    });
  const sann = lesMenneskelogg(skrivLogg("felt-sann.jsonl", felt(false))).get("mt-b")!;
  const gal = lesMenneskelogg(skrivLogg("felt-gal.jsonl", felt(true))).get("mt-b")!;
  assert.ok(!("avvist" in gjenskapRunde(sann, sann.runder[0]!, budgivere)));
  const avvist = gjenskapRunde(gal, gal.runder[0]!, budgivere);
  assert.ok("avvist" in avvist && avvist.avvist === "budrundefelt", JSON.stringify(avvist));
});

test("FELLE: et plantet botbud som avviker fra speken løses med nøyaktig ett avvik — og uten avvik avvises runden", { skip }, () => {
  /** Sete 2 passer i stedet for sitt første bud; ellers V5. */
  const plantet = () => {
    const v5 = [0, 1, 2, 3].map(() => lagIndre(V5_KJEDE));
    let brukt = false;
    return v5.map((a, sete) => ({
      velgHandling(s: GameState) {
        const h = a.velgHandling(s);
        if (sete === 2 && !brukt && s.fase === "BUDRUNDE" && h.type === "BUD" && h.bud !== "PASS") {
          brukt = true;
          return { type: "BUD" as const, spiller: 2, bud: "PASS" as const };
        }
        return h;
      },
      nyKamp() {
        brukt = false;
        a.nyKamp();
      },
    }));
  };
  const budgivere = [0, 1, 2, 3].map(() => lagIndre(V5_KJEDE));
  let funnet = false;
  for (let i = 0; i < 12 && !funnet; i++) {
    let g;
    try {
      g = syntetiskLogg([{ spillId: `pl-${i}`, frø: 8_810_000 + i * 17, spiller: "p", målPoeng: 100, runder: [{ rundeNr: 0 }] }], V5_KJEDE, plantet);
    } catch {
      continue; // alle passet: et annet frø
    }
    const k = lesMenneskelogg(skrivLogg(`plantet-${i}.jsonl`, g.linjer)).get(`pl-${i}`)!;
    const uten = gjenskapRunde(k, k.runder[0]!, budgivere, 0);
    if (!("avvist" in uten)) continue; // avviket endret ikke budvinner eller kontrakt: prøver ingenting
    funnet = true;
    assert.equal(uten.avvist, "budrunde");
    const med = gjenskapRunde(k, k.runder[0]!, budgivere, 2);
    assert.ok(!("avvist" in med), JSON.stringify(med));
    assert.equal(med.budavvik, 1);
    const fasit = g.fasit[0]!.runder[0]!.tilstander.at(-1)!;
    const slutt = med.tilstander.at(-1)!;
    assert.deepEqual([slutt.budvinner, slutt.melding, slutt.sisteRunde?.delta], [fasit.budvinner, fasit.melding, fasit.sisteRunde?.delta]);
  }
  assert.ok(funnet, "ingen av frøene ga et avvik som flyttet budvinner eller kontrakt — fella er ikke spilt");
});

// ===========================================================================
// 2. Skriptet ende til ende
// ===========================================================================

test("menneske-tro.ts: én rad per stilling, kontrollen eksakt, tom bok i runde 0, kampslutten i boka — og tapet er fasitens", { skip }, () => {
  const { linjer, fasit } = lagLogg();
  const data = skrivLogg("tro.jsonl", linjer);
  const ut = `${ROT}/${MAPPE}/tro-rader.jsonl`;
  const r = spawnSync(process.execPath, ["examples/menneske-tro.ts", "--data", data, "--nett", TRO, "--ut", ut], { cwd: ROT, encoding: "utf8" });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /5\/5 runder gjenskapt/);
  const rader = readFileSync(ut, "utf8").split("\n").filter((l) => l !== "").map((l) => JSON.parse(l) as MenneskeTroRad);

  const nett = MlbTronett.fraBytes(new Uint8Array(readFileSync(TRO)));
  let i = 0;
  let sjekketFerdig = 0;
  let fellaTatt = 0;
  for (const k of fasit) {
    const bok = new Hukommelse();
    const råBok = new Hukommelse();
    for (const [nr, runde] of k.runder.entries()) {
      for (const s0 of runde.tilstander) {
        const s = somRundeslutt(s0);
        bok.observer(s);
        råBok.observer(s0);
        if (s.fase !== "SPILL" || s.iTur === null || lovligeKort(s, s.iTur).length < 2) continue;
        const sete = s.iTur;
        const x = rader[i++];
        assert.ok(x !== undefined, "fila har for få rader");
        assert.deepEqual([x.spill, x.runde, x.stikk, x.sete, x.bok], [k.spillId, runde.rundeNr, s.stikkSpilt, sete, nr]);
        assert.equal(x.ulik2, 0);
        assert.equal(x.null2, x.null);
        assert.equal(x.gulv, Number(LN3.toFixed(5)));
        if (runde.rundeNr === 0) assert.deepEqual([x.tro, x.fremmed], [x.null, x.null], "tom bok i runde 0 skal gi tro = null = fremmed");
        if (sete === 0) assert.equal(x.m_kort, undefined);
        else assert.equal(x.m_kort, s.hender[0]!.length);
        // Tapet regnet her av fasiten, med eget nett og egen bok.
        const kort = x.kort;
        const v = spillerVisning(s, sete);
        const egen = nettTap(nett.fordeling(nett.trekkFor(v, s.giving.antallStikk, s.regler.målPoeng, bok.vektor(sete, 4))), s, sete, kort).tap;
        assert.equal(x.tro, egen, `rad ${i - 1}: tro-tapet er ikke fasitens`);
        if (k.spillId === "mt-a" && runde.rundeNr === 2) {
          sjekketFerdig++;
          const rå = nettTap(nett.fordeling(nett.trekkFor(v, s.giving.antallStikk, s.regler.målPoeng, råBok.vektor(sete, 4))), s, sete, kort).tap;
          if (rå !== x.tro) fellaTatt++;
        }
      }
    }
  }
  assert.equal(i, rader.length, "fila har flere rader enn stillinger");
  assert.ok(sjekketFerdig > 10);
  assert.ok(fellaTatt > 0, "en bok uten kampslutt-runden ga samme tap — prøven ser ikke om runden er med");
  assert.ok(rader.some((x) => x.runde > 0 && x.tro !== x.null), "boka endrer aldri troen — prøven prøver ikke hukommelsen");
});

// ===========================================================================
// 3. Dommene
// ===========================================================================

interface Oppsett {
  g: (runde: number, k: number) => number;
  fremmedGap?: number;
  ulikNull?: boolean;
  gulv?: number;
}

/** 12 kamper × 6 runder × 4 rader; tapene satt så `andel(tro) − andel(null) = g`. */
function rader(o: Oppsett): MenneskeTroRad[] {
  const ut: MenneskeTroRad[] = [];
  for (let k = 0; k < 12; k++) {
    for (let runde = 0; runde < 6; runde++) {
      for (let j = 0; j < 4; j++) {
        const støy = 0.0004 * (((k * 7 + runde * 3 + j) % 5) - 2);
        const nul = 0.8 + 0.01 * (j % 3);
        const tro = nul - (o.g(runde, k) + støy) * LN3;
        const fremmed = tro + (o.fremmedGap ?? 0.01) * LN3 + støy * LN3;
        const felles = {
          tro, null: nul, null2: o.ulikNull && k === 3 && runde === 2 && j === 1 ? nul + 1e-5 : nul,
          fremmed, rotert: fremmed, tro_fakta: tro - 0.01, null_fakta: nul - 0.01, gulv: o.gulv ?? Number(LN3.toFixed(5)), gulvPluss: 1.0,
        };
        ut.push({
          spill: `k${k}`, halvdel: k % 2, runde, runder: 6, bok: runde, stikk: j, sete: 1 + (j % 3), budavvik: 0, kort: 30,
          ...felles, ulik2: 0,
          m_kort: 12, m_tro: felles.tro, m_null: felles.null, m_null2: felles.null2, m_fremmed: felles.fremmed, m_rotert: felles.rotert,
          m_tro_fakta: felles.tro_fakta, m_null_fakta: felles.null_fakta, m_gulv: felles.gulv, m_gulvPluss: felles.gulvPluss,
        });
      }
    }
  }
  return ut;
}

test("domK6Menneske: stigning i begge halvdeler med fella tatt er ja; flat er nei; fremmed = tro er stum; null ≠ null2 er stum", () => {
  const stiger = (runde: number, k: number): number => 0.002 * runde + 0.001 * ((k % 3) - 1);
  const ja = domK6Menneske(rader({ g: stiger }));
  assert.equal(ja.kontrollOk, true);
  assert.equal(ja.felleOk, true);
  assert.equal(ja.innfridd, "ja", JSON.stringify(ja.halv));
  assert.ok(Math.abs(ja.stig.b - 0.002) < 3e-4, `stigningen ${ja.stig.b}`);
  assert.ok(ja.senMotTidlig.snitt > 0);

  assert.equal(domK6Menneske(rader({ g: (_r, k) => 0.003 + 0.001 * ((k % 3) - 1) })).innfridd, "nei");
  const slapp = domK6Menneske(rader({ g: stiger, fremmedGap: 0 }));
  assert.equal(slapp.felleOk, false);
  assert.equal(slapp.innfridd, "stum");
  const bom = domK6Menneske(rader({ g: stiger, ulikNull: true }));
  assert.equal(bom.kontrollOk, false);
  assert.equal(bom.innfridd, "stum");
  assert.equal(domK6Menneske([]).innfridd, "ikke målbar");
});

test("domK8Menneske: rapportert når kontrollen holder; gulv ulik ln 3 eller null ≠ null2 er stum; fella leser gulv+", () => {
  const g = (runde: number): number => 0.001 * runde;
  const ok = domK8Menneske(rader({ g }));
  assert.equal(ok.innfridd, "rapportert");
  assert.equal(ok.kontrollOk, true);
  assert.equal(ok.felleOk, true, "tro (~0,8) slår gulv+ (1,0)");
  assert.ok(ok.deler.menneske.andel.null.snitt > 0.2 && ok.deler.menneske.andel.null.snitt < 0.3);
  assert.equal(domK8Menneske(rader({ g, gulv: 1.0 })).innfridd, "stum");
  assert.equal(domK8Menneske(rader({ g, ulikNull: true })).innfridd, "stum");
  const svak = rader({ g }).map((x) => ({ ...x, tro: 1.05, m_tro: 1.05 }));
  assert.equal(domK8Menneske(svak).felleOk, false);
});
