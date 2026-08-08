/**
 * DEN GLISSNE FRAMOVERPASSERINGEN MÅ VÆRE BIT-IDENTISK MED DEN TETTE.
 *
 * `forover` hopper over ledd der inngangen er eksakt null. Profilen 8. august
 * viste hvorfor: 95 % av alpha-mu-søkets tid er dette ene kallet, og
 * aktiveringene i `d7alle` er 78–89 % nuller. Men en optimalisering som endrer
 * ett eneste kortvalg er ikke en optimalisering — den er en ny bot, og da måler
 * ingen lenger det de tror de måler.
 *
 * Derfor sammenliknes det mot en TETT REFERANSE som er skrevet ut her, ordrett
 * slik `forover` så ut før endringen. Referansen ligger i testen og ikke i
 * kildekoden med vilje: den er en fasit, ikke en kodesti noen skal kunne slå på.
 *
 * `Object.is` og ikke `===`, fordi `===` ikke skiller `-0` fra `+0`. Nettopp
 * den forskjellen er det ene stedet hoppingen KAN endre en bit, så den skal
 * testen se — ikke skjule.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { forover, type NevroNett } from "../src/nevro/nett.ts";
import { lesE1Nett } from "../src/e1/nett.ts";
import { e1SpillTrekk } from "../src/e1/trekk.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { lagRng } from "../src/kort.ts";

/** `forover` slik den var før den glissne varianten. Fasiten, ordrett. */
function foroverTett(nett: NevroNett, x: Float32Array): Float32Array {
  let a = x;
  for (let i = 0; i < nett.lag.length; i++) {
    const l = nett.lag[i]!;
    const y = new Float32Array(l.ut);
    for (let r = 0; r < l.ut; r++) {
      let sum = l.bias[r]!;
      const rad = r * l.inn;
      for (let c = 0; c < l.inn; c++) sum += l.vekter[rad + c]! * a[c]!;
      y[r] = sum;
    }
    if (i < nett.lag.length - 1) {
      for (let j = 0; j < y.length; j++) if (y[j]! < 0) y[j] = 0;
    }
    a = y;
  }
  return a;
}

const nett = lesE1Nett("e1-modell/d7alle.bin");
const DIM = nett.lag[0]!.inn;

const likeBit = (a: Float32Array, b: Float32Array, hva: string): void => {
  assert.equal(a.length, b.length, `${hva}: ulik lengde`);
  for (let i = 0; i < a.length; i++) {
    assert.ok(Object.is(a[i], b[i]), `${hva}: utgang ${i} er ${a[i]}, fasiten er ${b[i]}`);
  }
};

/** Ekte trekkvektorer fra ekte stillinger — det er dem søket faktisk mater inn. */
function ektevektorer(antall: number, frø: number): Float32Array[] {
  const ut: Float32Array[] = [];
  const ag = [0, 1, 2, 3].map(() => new NevroAgent());
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  while (ut.length < antall && s.fase !== "FERDIG" && vakt++ < 5000) {
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iT = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iT === null || iT === undefined) break;
    if (s.fase === "SPILL") ut.push(e1SpillTrekk(s, iT, DIM));
    s = utfør(s, ag[iT]!.velgHandling(s)).state;
  }
  return ut;
}

test("glissen forover er bit-identisk med den tette paa EKTE trekkvektorer", () => {
  const v = ektevektorer(120, 20260808);
  assert.ok(v.length >= 100, `fikk bare ${v.length} vektorer`);
  for (let i = 0; i < v.length; i++) likeBit(forover(nett, v[i]!), foroverTett(nett, v[i]!), `stilling ${i}`);
});

test("glissen forover er bit-identisk paa TETTE vektorer uten en eneste null", () => {
  // Uten denne ville testen bare dekket den glisne grenen. En tett inngang er
  // verste fall for hoppingen og beste fall for a avsloere en indeksfeil.
  const rng = lagRng(4711);
  for (let n = 0; n < 20; n++) {
    const x = new Float32Array(DIM);
    for (let i = 0; i < DIM; i++) x[i] = (rng() - 0.5) * 4 || 0.5;
    likeBit(forover(nett, x), foroverTett(nett, x), `tett ${n}`);
  }
});

test("glissen forover taaler ren null, negativ null og enkelttrekk", () => {
  const null0 = new Float32Array(DIM);
  likeBit(forover(nett, null0), foroverTett(nett, null0), "bare nuller");

  const negnull = new Float32Array(DIM);
  negnull.fill(-0);
  likeBit(forover(nett, negnull), foroverTett(nett, negnull), "bare negative nuller");

  // Ett trekk av gangen: treffer hver eneste kolonne i foerste lag alene.
  for (let i = 0; i < DIM; i++) {
    const x = new Float32Array(DIM);
    x[i] = 1;
    likeBit(forover(nett, x), foroverTett(nett, x), `enkelttrekk ${i}`);
  }
});

test("logitsene fra ett kall overlever neste kall — mellombufferen lekker ikke", () => {
  /**
   * Mellomlagene skriver i gjenbrukte buffere. Slapp en av dem ut som
   * returverdi, ville et nytt kall overskrevet logitsene til den som holdt dem
   * — en feil som ikke ville sett ut som en feil noe sted, bare som at
   * rangeringen plutselig gjaldt en annen stilling.
   */
  const v = ektevektorer(3, 555);
  assert.ok(v.length === 3);
  const a = forover(nett, v[0]!);
  const kopi = Float32Array.from(a);
  forover(nett, v[1]!);
  forover(nett, v[2]!);
  likeBit(a, kopi, "logits etter to nye kall");
});
