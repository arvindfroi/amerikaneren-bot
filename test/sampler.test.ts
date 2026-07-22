import { test } from "node:test";
import assert from "node:assert/strict";
import { opprettSpill, lovligeHandlinger, utfør, type GameState, type Handling } from "../src/motor.ts";
import { trekkVerden, byggDDOppsett, infererRenonce } from "../src/solver/sampler.ts";
import { lagRng, kortId } from "../src/kort.ts";
import { kortTilInt } from "../src/solver/dds.ts";

function enkelPolicy(s: GameState): Handling {
  const l = lovligeHandlinger(s);
  switch (l.fase) {
    case "BUDRUNDE": {
      const åpner = s.iTur === (s.giver + 1) % s.antallSpillere;
      if (åpner && s.budrunde.høyeste === null) return { type: "BUD", spiller: l.spiller, bud: 5 };
      return { type: "BUD", spiller: l.spiller, bud: "PASS" };
    }
    case "VRAK": {
      const srt = l.hånd.slice().sort((a, b) => a.verdi - b.verdi);
      return { type: "VRAK", spiller: l.spiller, kort: srt.slice(0, l.antall) };
    }
    case "VELG": {
      const h = s.hender[l.spiller]!;
      const t: Record<string, number> = { S: 0, H: 0, R: 0, K: 0 };
      for (const k of h) t[k.farge]!++;
      const tr = (["S", "H", "R", "K"] as const).slice().sort((a, b) => t[b]! - t[a]!)[0]!;
      const fin = new Set(h.filter((k) => k.farge === tr).map((k) => k.verdi));
      let et = null;
      for (let v = 14; v >= 2; v--)
        if (!fin.has(v as never)) {
          et = { farge: tr, verdi: v as never };
          break;
        }
      return { type: "VELG", spiller: l.spiller, trumf: tr, etterlyst: et };
    }
    case "SPILL":
      return { type: "SPILL", spiller: l.spiller, kort: l.kort[0]! };
    default:
      return { type: "NESTE" };
  }
}

function tilSpill(seed: number, kortSpilt: number): GameState {
  let s = opprettSpill({ antallSpillere: 4 }, seed);
  while (s.fase !== "SPILL") s = utfør(s, enkelPolicy(s)).state;
  for (let i = 0; i < kortSpilt && s.fase === "SPILL"; i++) s = utfør(s, enkelPolicy(s)).state;
  return s;
}

test("trekkVerden gir konsistente verdener", () => {
  const s = tilSpill(321, 6);
  const rng = lagRng(999);
  const played = new Set<number>();
  for (const st of s.historikk) for (const kp of st.kort) played.add(kortTilInt(kp.kort));
  for (const kp of s.bord) played.add(kortTilInt(kp.kort));
  const obs = s.iTur!;
  const egenIds = s.hender[obs]!.map(kortId).sort();

  for (let w = 0; w < 100; w++) {
    const v = trekkVerden(s, obs, rng);
    assert.ok(v, "skal finne en gyldig verden");
    // Håndstørrelser stemmer med de offentlige.
    for (let p = 0; p < 4; p++) assert.equal(v!.hender[p]!.length, s.hender[p]!.length);
    // Observatørens hånd er uendret.
    assert.deepEqual(
      v!.hender[obs]!.map((c) => kortId({ farge: (["S", "H", "R", "K"] as const)[Math.floor(c / 13)]!, verdi: ((c % 13) + 2) as never })).sort(),
      egenIds,
    );
    // Ingen allerede spilte kort dukker opp i en hånd.
    for (const h of v!.hender) for (const cc of h) assert.ok(!played.has(cc), "spilt kort lekket");
    // Alle kort er unike på tvers av hendene.
    const alle = v!.hender.flat();
    assert.equal(new Set(alle).size, alle.length);
  }
});

test("byggDDOppsett gjenspeiler stillingen", () => {
  const s = tilSpill(77, 4);
  const rng = lagRng(5);
  const v = trekkVerden(s, s.iTur!, rng)!;
  const o = byggDDOppsett(s, v);
  assert.equal(o.iTur, s.iTur);
  assert.equal(o.totalStikk, s.giving.antallStikk);
  assert.equal(o.ferdigeStikk, s.stikkSpilt);
  // Budlaget = budvinner + makker.
  assert.ok(o.declLag[s.budvinner!]);
});

test("renonce-inferens fanger fargesvikt", () => {
  const s = tilSpill(202, 8);
  const voids = infererRenonce(s);
  assert.equal(voids.length, 4);
  // Konsistens: en spiller merket renonce i en farge har ingen slike kort igjen.
  for (let p = 0; p < 4; p++) {
    for (const f of voids[p]!) {
      const farge = (["S", "H", "R", "K"] as const)[f]!;
      assert.ok(!s.hender[p]!.some((k) => k.farge === farge), `spiller ${p} skulle være tom i ${farge}`);
    }
  }
});
