import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { test } from "node:test";

import { lagRng, type Kort } from "../src/kort.ts";
import { lovligeEtterlys, opprettSpill, utfør, type GameState, type Handling } from "../src/motor.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { Vrakrangerer } from "../src/moe2/vrakrang.ts";
import { ETTERLYST_DIM, ETTERLYST_MAKS, etterlystKandidater, etterlystTrekk } from "../src/moe2/vraktrekk.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { nettFraBytes, type NevroNett } from "../src/nevro/nett.ts";

/**
 * K3.5/K3.8 (11. sep): KALLET (etterlysningen) SOM ET LÆRT VALG.
 *
 * «Høyeste lovlige» var målt best blant FASTE nivåer 4. august, men et fast nivå er ikke en
 * lært beslutning. `Vrakrangerer` kan nå få et etterlystnett. Prøvene låser:
 *
 *   – uten nett er kallet regelen, nøyaktig som før (appen og alle speker bygger uten);
 *   – et nett som setter høyeste lovlige øverst, eller ikke skiller kandidatene, velger likt;
 *   – FELLA: et nett som foretrekker det laveste kallet ENDRER valgene – ellers når nettet
 *     ikke fram, og en omtrening ville målt null av feil grunn;
 *   – K2: trekkene, kandidatene og selve valget er uendret når skjulte kort byttes;
 *   – speken `vr:<fil>@<etterlystfil>:` bygger nettet, og `vr:<fil>:` gjør det ikke.
 */

const VRAKFIL = "e1-modell/vrakrang.bin";
const vraknett = (): NevroNett => nettFraBytes(readFileSync(VRAKFIL))[0]!;

/** Ett lineært lag ETTERLYST_DIM → 1 med de gitte vektene; resten null. */
function lineært(vekter: Readonly<Record<number, number>>, inn = ETTERLYST_DIM, ut = 1): NevroNett {
  const w = new Float32Array(inn * ut);
  for (const [i, x] of Object.entries(vekter)) w[Number(i)] = x;
  return { lag: [{ inn, ut, vekter: w, bias: new Float32Array(ut) }] };
}

/** Appens vektformat (`skriv_vekter` i vrak-tren.py), for spekprøven. */
function tilBytes(n: NevroNett): Buffer {
  const ints = (...xs: number[]): Buffer => Buffer.from(new Int32Array(xs).buffer);
  const flyt = (a: Float32Array): Buffer => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
  return Buffer.concat([ints(1, n.lag.length), ...n.lag.flatMap((l) => [ints(l.inn, l.ut), flyt(l.vekter), flyt(l.bias)])]);
}

/** VRAK-stillinger fra NevroHjerne-kamper, med budvinner og talong. */
function vrakstillinger(antall: number): GameState[] {
  const ut: GameState[] = [];
  const nevro = new NevroAgent();
  for (let f = 0; ut.length < antall && f < 30; f++) {
    let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, 8_800_000 + f);
    let vakt = 0;
    while (s.fase !== "FERDIG" && vakt++ < 20_000 && ut.length < antall) {
      if (s.fase === "RUNDE_SLUTT") {
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      if (s.fase === "VRAK" && s.budvinner !== null) ut.push(s);
      s = utfør(s, nevro.velgHandling(s)).state;
    }
  }
  return ut;
}

/** VRAK og så VELG gjennom samme rangerer (den husker trumfen imellom). Kallet må være lovlig. */
function vrakOgKall(vr: Vrakrangerer, s: GameState): { vrak: Handling; velg: Handling; etter: GameState } {
  const vrak = vr.velgHandling(s);
  assert.equal(vrak.type, "VRAK");
  const etter = utfør(s, vrak).state;
  const velg = vr.velgHandling(etter);
  assert.equal(velg.type, "VELG");
  utfør(etter, velg); // kaster ved et ulovlig kall
  return { vrak, velg, etter };
}

const kt = (k: Kort | null | undefined): string => (k === null || k === undefined ? "null" : `${k.farge}${k.verdi}`);
const kall = (h: Handling): string => (h.type === "VELG" ? `${h.trumf}:${kt(h.etterlyst)}` : h.type);

/** Samme VELG-tilstand med de ANDRE spillernes kort stokket om mellom dem (samme antall hver). */
function byttSkjulte(s: GameState, sete: number, frø: number): GameState {
  const rng = lagRng(frø);
  const andre = s.hender.flatMap((h, p) => (p === sete ? [] : h));
  for (let i = andre.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [andre[i], andre[j]] = [andre[j]!, andre[i]!];
  }
  let o = 0;
  const hender = s.hender.map((h, p) => (p === sete ? h : andre.slice(o, (o += h.length))));
  return { ...s, hender };
}

const STILLINGER = vrakstillinger(24);

test("stillingene finnes (ellers måler prøvene ingenting)", () => {
  assert.ok(STILLINGER.length >= 20, `bare ${STILLINGER.length} vrakstillinger`);
});

test("uten etterlystnett er kallet regelen «høyeste lovlige», nøyaktig som før", () => {
  const nett = vraknett();
  for (const s of STILLINGER) {
    const a = vrakOgKall(new Vrakrangerer(new NevroAgent(), nett), s);
    const b = vrakOgKall(new Vrakrangerer(new NevroAgent(), nett, "telrd", null), s);
    assert.deepEqual(b.vrak, a.vrak);
    assert.deepEqual(b.velg, a.velg);
    const lovlige = a.velg.type === "VELG" ? lovligeEtterlys(a.etter, a.velg.trumf) : [];
    assert.equal(kt(a.velg.type === "VELG" ? a.velg.etterlyst : null), kt(lovlige[lovlige.length - 1] ?? null));
  }
});

test("et nett som setter høyeste lovlige øverst – eller ikke skiller kandidatene – velger som regelen", () => {
  const nett = vraknett();
  const nettene: [string, NevroNett][] = [
    ["nivå straffes", lineært({ 4: -1 })],
    ["høyeste belønnes", lineært({ 0: 2 })],
    ["alle likt (likhet → første = høyeste)", lineært({})],
  ];
  for (const s of STILLINGER) {
    const regel = vrakOgKall(new Vrakrangerer(new NevroAgent(), nett), s);
    for (const [navn, e] of nettene) {
      const lært = vrakOgKall(new Vrakrangerer(new NevroAgent(), nett, "telrd", e), s);
      assert.deepEqual(lært.vrak, regel.vrak, navn);
      assert.equal(kall(lært.velg), kall(regel.velg), navn);
    }
  }
});

test("fella: et nett som foretrekker det laveste kallet endrer valgene", () => {
  const nett = vraknett();
  let endret = 0;
  for (const s of STILLINGER) {
    const regel = vrakOgKall(new Vrakrangerer(new NevroAgent(), nett), s);
    const lav = vrakOgKall(new Vrakrangerer(new NevroAgent(), nett, "telrd", lineært({ 4: 1 })), s);
    assert.ok(lav.velg.type === "VELG" && regel.velg.type === "VELG");
    assert.equal(lav.velg.trumf, regel.velg.trumf, "trumfen skal ikke påvirkes av kallnettet");
    const kand = etterlystKandidater(lav.etter, lav.velg.trumf);
    assert.equal(kt(lav.velg.etterlyst), kt(kand[kand.length - 1] ?? null));
    if (kall(lav.velg) !== kall(regel.velg)) endret++;
  }
  assert.ok(endret >= STILLINGER.length / 2, `bare ${endret} av ${STILLINGER.length} kall endret – nettet når ikke fram`);
});

test("kandidatsettet: kappet, høyeste først, de tre høyeste lovlige + den laveste", () => {
  for (const s of STILLINGER) {
    const { velg, etter } = vrakOgKall(new Vrakrangerer(new NevroAgent(), vraknett()), s);
    assert.ok(velg.type === "VELG");
    const lovlige = lovligeEtterlys(etter, velg.trumf); // stigende
    const kand = etterlystKandidater(etter, velg.trumf);
    assert.ok(kand.length <= ETTERLYST_MAKS);
    assert.equal(kand.length, Math.min(lovlige.length, ETTERLYST_MAKS));
    if (lovlige.length === 0) continue;
    assert.equal(kt(kand[0]), kt(lovlige[lovlige.length - 1]));
    assert.equal(kt(kand[kand.length - 1]), kt(lovlige[0]));
    for (let i = 1; i < kand.length; i++) assert.ok(kand[i]!.verdi < kand[i - 1]!.verdi, "ikke synkende");
    const topp3 = lovlige.slice(-3).reverse().map(kt);
    assert.deepEqual(kand.slice(0, topp3.length).map(kt), topp3);
  }
});

test("K2: trekk, kandidater og kall er uendret når de skjulte kortene byttes – og egen hånd teller", () => {
  const nett = vraknett();
  const lav = lineært({ 4: 1, 6: -3, 11: 2 });
  let kontroll = 0;
  STILLINGER.forEach((s, i) => {
    const sete = s.budvinner!;
    const a = new Vrakrangerer(new NevroAgent(), nett, "telrd", lav);
    const b = new Vrakrangerer(new NevroAgent(), nett, "telrd", lav);
    const h = a.velgHandling(s);
    assert.deepEqual(b.velgHandling(s), h);
    const etter = utfør(s, h).state;
    const byttet = byttSkjulte(etter, sete, 77 + i);
    assert.notDeepEqual(byttet.hender, etter.hender, "byttet ingenting – prøven ville vært tom");
    assert.equal(kall(b.velgHandling(byttet)), kall(a.velgHandling(etter)));

    for (const trumf of ["S", "H", "R", "K"] as const) {
      const ka = etterlystKandidater(etter, trumf);
      assert.deepEqual(etterlystKandidater(byttet, trumf).map(kt), ka.map(kt));
      for (const k of ka) {
        assert.deepEqual([...etterlystTrekk(byttet, sete, trumf, k)], [...etterlystTrekk(etter, sete, trumf, k)]);
      }
    }

    // KONTROLLARM: bytt ett av budvinnerens EGNE kort med en motstanders – da skal noe endres,
    // ellers beviser likheten over ingenting.
    const motst = (sete + 1) % 4;
    const egen = etter.hender[sete]!;
    const deres = etter.hender[motst]!;
    const hender = etter.hender.map((x) => x.slice());
    hender[sete]![0] = deres[0]!;
    hender[motst]![0] = egen[0]!;
    const egenByttet: GameState = { ...etter, hender };
    const trumf = deres[0]!.farge;
    const før = etterlystKandidater(etter, trumf);
    const etterBytte = etterlystKandidater(egenByttet, trumf);
    const likt =
      før.map(kt).join() === etterBytte.map(kt).join() &&
      før.every((k) => etterlystTrekk(etter, sete, trumf, k).join() === etterlystTrekk(egenByttet, sete, trumf, k).join());
    if (!likt) kontroll++;
  });
  assert.equal(kontroll, STILLINGER.length, "egen hånd endret ikke trekkene – de leser ikke hånden");
});

test("bredder: kallnettet må ha 25 inn og én ut, og et 25-nett avvises som vraknett", () => {
  const nett = vraknett();
  assert.equal(ETTERLYST_DIM, 25);
  assert.throws(() => new Vrakrangerer(new NevroAgent(), nett, "telrd", lineært({}, 24)), /25/);
  assert.throws(() => new Vrakrangerer(new NevroAgent(), nett, "telrd", lineært({}, 27)), /25/);
  assert.throws(() => new Vrakrangerer(new NevroAgent(), nett, "telrd", lineært({}, ETTERLYST_DIM, 2)), /ÉN utgang/);
  assert.throws(() => new Vrakrangerer(new NevroAgent(), lineært({})), /24.*27/);
});

test("speken: vr:<fil>@<etterlystfil>: bygger kallnettet, vr:<fil>: gjør det ikke", () => {
  // Relativ mappe: speken skiller på «:», så en absolutt Windows-sti (C:\...) lar seg ikke skrive.
  const mappe = mkdtempSync(".tmp-etterlyst-");
  try {
    const fil = `${mappe}/lav.bin`;
    writeFileSync(fil, tilBytes(lineært({ 4: 1 })));
    const nett = vraknett();
    const utenSpek = lagIndre(`vr:${VRAKFIL}:telrd:nevro`);
    const medSpek = lagIndre(`vr:${VRAKFIL}@${fil}:telrd:nevro`);
    let endret = 0;
    for (const s of STILLINGER.slice(0, 10)) {
      const regel = vrakOgKall(new Vrakrangerer(new NevroAgent(), nett), s);
      const lav = vrakOgKall(new Vrakrangerer(new NevroAgent(), nett, "telrd", lineært({ 4: 1 })), s);
      const hu = utenSpek.velgHandling(s);
      assert.deepEqual(hu, regel.vrak);
      assert.equal(kall(utenSpek.velgHandling(utfør(s, hu).state)), kall(regel.velg));
      const hm = medSpek.velgHandling(s);
      assert.deepEqual(hm, lav.vrak);
      assert.equal(kall(medSpek.velgHandling(utfør(s, hm).state)), kall(lav.velg));
      if (kall(lav.velg) !== kall(regel.velg)) endret++;
    }
    assert.ok(endret > 0, "spekprøven skilte ikke armene");
    assert.throws(() => lagIndre(`vr:${VRAKFIL}@:telrd:nevro`), /Tom etterlystfil/);
  } finally {
    rmSync(mappe, { recursive: true, force: true });
  }
});
