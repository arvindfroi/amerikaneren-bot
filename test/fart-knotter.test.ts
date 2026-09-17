/**
 * FARTSKNOTTENE (`~ekv=1`, `~topp=<p>`, `~flat=<n0>`) — 17. sep, `D:\amb-grp\loop\fart.md`.
 *
 * Holder fast: (1) av er av (null/false uten feltet), (2) ingen kollisjon med verdensfeltet,
 * (3) ugyldige verdier kaster, (4) hver knott BITER (endrer noe målbart i søket), og
 * (5) ekvivalensklassene er riktige på håndlagde stillinger.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeKort } from "../src/motor.ts";
import { ADAMS, lagIndre } from "../src/moe2/agentspek.ts";
import { settParlytter, toppKandidater, type Sikkerorakel } from "../src/moe2/sikkerorakel.ts";
import { kortklasser } from "../src/moe2/sdpar.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { FARGER, type Kort } from "../src/kort.ts";

const bygg = (vFelt: string, sigma = 0): Sikkerorakel =>
  lagIndre(`sik:alle:${sigma}:${vFelt}:${ADAMS}`) as unknown as Sikkerorakel;

test("AV ER AV: uten feltene er knottene av, og hver leses riktig", () => {
  const av = bygg("4k4");
  assert.equal(av.ekvivalens, false);
  assert.equal(av.toppP, null);
  assert.equal(av.flatStopp, null);
  assert.equal(bygg("4k4~ekv=1").ekvivalens, true);
  assert.equal(bygg("4k4~topp=0.05").toppP, 0.05);
  assert.equal(bygg("4k4~flat=8").flatStopp, 8);
});

test("INGEN KOLLISJON: 48k32e3LD med alle knottene bakpå leses likt", () => {
  const uten = bygg("48k32e3LD");
  const med = bygg("48k32e3LD~ekv=1~topp=0.05~flat=8~stikk=1-4");
  for (const felt of ["eksaktBlad", "lagmål", "visningsfrø"] as const) assert.deepEqual(med[felt], uten[felt]);
  assert.deepEqual(med.stikkvindu, [1, 4]);
  assert.equal(med.ekvivalens, true);
  assert.equal(med.toppP, 0.05);
  assert.equal(med.flatStopp, 8);
});

test("ugyldige verdier KASTER", () => {
  for (const d of ["~ekv=", "~ekv=0", "~ekv=ja", "~topp=0", "~topp=1", "~topp=", "~topp=x", "~flat=1", "~flat=", "~flat=2.5"]) {
    assert.throws(() => bygg(`4k4${d}`), /~(ekv|topp|flat)=/, `«${d}» skulle kastet`);
  }
});

/** Stillinger fra et parti mellom nett, der setet i tur har minst `min` lovlige kort. */
function stillinger(antall: number, min = 3): GameState[] {
  const ut: GameState[] = [];
  const nett = new NevroAgent();
  let s = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, 17_092_026);
  let vakt = 0;
  while (ut.length < antall && s.fase !== "FERDIG" && vakt++ < 20_000) {
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    if (s.fase === "SPILL" && s.iTur !== null && lovligeKort(s, s.iTur).length >= min) ut.push(s);
    s = utfør(s, nett.velgHandling(s)).state;
  }
  return ut;
}

test("KNOTTENE BITER: hver av dem endrer antall utspilte kandidater eller verdener", () => {
  const st = stillinger(40);
  const mål = (vFelt: string): { kand: number; verdener: number } => {
    let kand = 0;
    let verdener = 0;
    settParlytter((h) => {
      kand += h.par.kandidater.length;
      verdener += h.par.n;
    });
    const a = bygg(vFelt);
    for (const s of st) a.velgHandling(s);
    settParlytter(null);
    return { kand, verdener };
  };
  const av = mål("4k4D");
  const ekv = mål("4k4D~ekv=1");
  const topp = mål("4k4D~topp=0.2");
  const flat = mål("4k4D~flat=2");
  assert.ok(ekv.kand < av.kand, `ekv: ${ekv.kand} kandidater mot ${av.kand}`);
  assert.ok(topp.kand < av.kand, `topp: ${topp.kand} kandidater mot ${av.kand}`);
  assert.ok(flat.verdener < av.verdener, `flat: ${flat.verdener} verdener mot ${av.verdener}`);
});

const k = (farge: Kort["farge"], verdi: number): Kort => ({ farge, verdi: verdi as Kort["verdi"] });

test("EKVIVALENSKLASSER: sekvenser slås sammen, bordet og det etterlyste kortet skiller", () => {
  const s0 = stillinger(1)[0]!;
  const F = s0.hender[0]![0]!.farge;
  const G = FARGER.find((f) => f !== F)!;
  const base: GameState = { ...s0, historikk: [], bord: [], etterlyst: null };
  // 7 og 8 er naboer; 10 skilles fra 8 av en levende 9.
  const lovlige = [k(F, 7), k(F, 8), k(F, 10), k(G, 5)];
  const tekst = (kl: Kort[][]): string => kl.map((x) => x.map((c) => c.verdi).join("+")).join(" | ");
  assert.equal(tekst(kortklasser(base, lovlige)), "7+8 | 10 | 5");
  // 9 spilt i et FULLFØRT stikk: 7, 8 og 10 er én klasse.
  const spilt: GameState = {
    ...base,
    historikk: [{ kort: [{ spiller: 1, kort: k(F, 9) }], vinner: 1 } as unknown as GameState["historikk"][number]],
  };
  assert.equal(tekst(kortklasser(spilt, lovlige)), "7+8+10 | 5");
  // 9 på BORDET: det skiller (det ene kortet slår det, det andre ikke).
  const påBord: GameState = { ...base, bord: [{ spiller: 1, kort: k(F, 9) }] };
  assert.equal(tekst(kortklasser(påBord, lovlige)), "7+8 | 10 | 5");
  // Det etterlyste kortet står alltid alene.
  const etterlyst: GameState = { ...base, etterlyst: k(F, 8) };
  assert.equal(tekst(kortklasser(etterlyst, lovlige)), "7 | 8 | 10 | 5");
});

test("TOPP-KANDIDATENE: terskelen virker, og argmaks og det indre valget er alltid med", () => {
  const F = FARGER[1]!;
  const lovlige = [k(F, 2), k(F, 3), k(F, 4)];
  const idx = (c: Kort): number => FARGER.indexOf(c.farge) * 13 + c.verdi - 2;
  const logits = new Float32Array(52).fill(-50);
  logits[idx(lovlige[0]!)] = 0;
  logits[idx(lovlige[1]!)] = 0;
  logits[idx(lovlige[2]!)] = -10;
  // Prior ≈ 0,5 / 0,5 / 0,00002.
  assert.deepEqual(toppKandidater(lovlige, logits, 0.2, null).map((c) => c.verdi), [2, 3]);
  assert.deepEqual(toppKandidater(lovlige, logits, 0.2, lovlige[2]!).map((c) => c.verdi), [2, 3, 4]);
  logits[idx(lovlige[1]!)] = -1; // prior 0,73 / 0,27 / ~0
  assert.deepEqual(toppKandidater(lovlige, logits, 0.3, null).map((c) => c.verdi), [2]);
});
