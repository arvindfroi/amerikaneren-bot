import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lagRng } from "../src/kort.ts";
import {
  avstand,
  førsteSkjulteId,
  genomFraJson,
  genomTilJson,
  Innovasjonsbok,
  klonGenom,
  kryss,
  muterNyKobling,
  muterNyNode,
  muterVekter,
  nyttGenom,
  STANDARD_RATER,
} from "../src/neat/genom.ts";

const INN = 10;
const UT = 4;

test("nyttGenom har riktige noder og bare lovlige koblinger", () => {
  const bok = new Innovasjonsbok(INN, UT);
  const g = nyttGenom(INN, UT, bok, lagRng(1), 3);
  assert.equal(g.noder.filter((n) => n.type === "inn").length, INN);
  assert.equal(g.noder.filter((n) => n.type === "bias").length, 1);
  assert.equal(g.noder.filter((n) => n.type === "ut").length, UT);
  for (const k of g.koblinger) {
    assert.ok(g.noder.some((n) => n.id === k.inn));
    assert.ok(g.noder.some((n) => n.id === k.ut));
    assert.ok(k.ut >= INN + 1, "mål må være ut-node (ikke inngang/bias)");
  }
  // Hver utgang har minst bias-koblingen.
  for (let j = 0; j < UT; j++) {
    assert.ok(g.koblinger.some((k) => k.ut === INN + 1 + j));
  }
});

test("innovasjonsboka gir samme nummer for samme kobling og samme node for samme splitt", () => {
  const bok = new Innovasjonsbok(INN, UT);
  const a = bok.kobling(0, INN + 1);
  const b = bok.kobling(0, INN + 1);
  const c = bok.kobling(1, INN + 1);
  assert.equal(a, b);
  assert.notEqual(a, c);

  const s1 = bok.splitt(a, 0, INN + 1);
  const s2 = bok.splitt(a, 0, INN + 1);
  assert.equal(s1.nodeId, s2.nodeId);
  assert.equal(s1.innTilNy, s2.innTilNy);
  assert.ok(s1.nodeId >= førsteSkjulteId(INN, UT));
});

test("muterNyNode splitter en kobling og bevarer strukturen", () => {
  const bok = new Innovasjonsbok(INN, UT);
  const rng = lagRng(7);
  const g = nyttGenom(INN, UT, bok, rng, 3);
  const førKoblinger = g.koblinger.length;
  const ok = muterNyNode(g, bok, rng);
  assert.ok(ok);
  assert.equal(g.noder.filter((n) => n.type === "skjult").length, 1);
  assert.equal(g.koblinger.length, førKoblinger + 2);
  const av = g.koblinger.filter((k) => !k.aktiv);
  assert.equal(av.length, 1, "den splittede koblingen skal være deaktivert");
  const ny = g.noder.find((n) => n.type === "skjult")!;
  const innTilNy = g.koblinger.find((k) => k.ut === ny.id)!;
  const nyTilUt = g.koblinger.find((k) => k.inn === ny.id)!;
  assert.equal(innTilNy.vekt, 1);
  assert.equal(nyTilUt.vekt, av[0]!.vekt);
});

test("muterNyKobling unngår duplikater", () => {
  const bok = new Innovasjonsbok(INN, UT);
  const rng = lagRng(3);
  const g = nyttGenom(INN, UT, bok, rng, 3);
  for (let i = 0; i < 50; i++) muterNyKobling(g, bok, rng);
  const par = new Set(g.koblinger.map((k) => `${k.inn}>${k.ut}`));
  assert.equal(par.size, g.koblinger.length, "ingen dublerte koblinger");
});

test("kryssing gir gyldig genom der alle koblingsnoder finnes", () => {
  const bok = new Innovasjonsbok(INN, UT);
  const rng = lagRng(11);
  const a = nyttGenom(INN, UT, bok, rng, 3);
  const b = nyttGenom(INN, UT, bok, rng, 3);
  for (let i = 0; i < 10; i++) {
    muterNyKobling(a, bok, rng);
    muterNyNode(a, bok, rng);
    muterNyKobling(b, bok, rng);
  }
  const barn = kryss(a, b, rng);
  const ider = new Set(barn.noder.map((n) => n.id));
  for (const k of barn.koblinger) {
    assert.ok(ider.has(k.inn) && ider.has(k.ut), "koblingens noder finnes i barnet");
  }
  assert.equal(barn.koblinger.length, a.koblinger.length, "gener arves fra den sterkeste (a)");
});

test("avstand er 0 for identiske genomer og vokser med ulikhet", () => {
  const bok = new Innovasjonsbok(INN, UT);
  const rng = lagRng(5);
  const a = nyttGenom(INN, UT, bok, rng, 3);
  const b = klonGenom(a);
  assert.equal(avstand(a, b), 0);
  muterVekter(b, rng, STANDARD_RATER);
  const etterVekter = avstand(a, b);
  assert.ok(etterVekter > 0);
  for (let i = 0; i < 5; i++) muterNyKobling(b, bok, rng);
  assert.ok(avstand(a, b) > etterVekter);
});

test("genom kan serialiseres og leses tilbake", () => {
  const bok = new Innovasjonsbok(INN, UT);
  const rng = lagRng(9);
  const g = nyttGenom(INN, UT, bok, rng, 3);
  muterNyNode(g, bok, rng);
  const tilbake = genomFraJson(genomTilJson(g));
  assert.deepEqual(tilbake, g);
  assert.throws(() => genomFraJson("{}"));
});

test("hoppOver lar nye innovasjoner unngå kollisjon med lastet genom", () => {
  const bok1 = new Innovasjonsbok(INN, UT);
  const rng = lagRng(13);
  const g = nyttGenom(INN, UT, bok1, rng, 3);
  muterNyNode(g, bok1, rng);

  const bok2 = new Innovasjonsbok(INN, UT);
  bok2.hoppOver(g);
  const nyInnovasjon = bok2.kobling(0, INN + 1);
  const maksGammel = Math.max(...g.koblinger.map((k) => k.innovasjon));
  assert.ok(nyInnovasjon > maksGammel);
  const splitt = bok2.splitt(nyInnovasjon, 0, INN + 1);
  const maksNode = Math.max(...g.noder.map((n) => n.id));
  assert.ok(splitt.nodeId > maksNode);
});
