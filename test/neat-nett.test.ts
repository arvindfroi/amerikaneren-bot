import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lagRng } from "../src/kort.ts";
import {
  biasId,
  førsteSkjulteId,
  Innovasjonsbok,
  nyttGenom,
  utId,
  type Genom,
} from "../src/neat/genom.ts";
import { Nettverk } from "../src/neat/nett.ts";

function tomtGenom(inn: number, ut: number): Genom {
  const noder = [];
  for (let i = 0; i < inn; i++) noder.push({ id: i, type: "inn" as const });
  noder.push({ id: biasId(inn), type: "bias" as const });
  for (let j = 0; j < ut; j++) noder.push({ id: utId(inn, j), type: "ut" as const });
  return { antallInn: inn, antallUt: ut, noder, koblinger: [] };
}

test("nettet regner riktig for en enkel kobling", () => {
  const g = tomtGenom(2, 1);
  g.koblinger.push({ inn: 0, ut: utId(2, 0), vekt: 1.5, aktiv: true, innovasjon: 0 });
  const nett = new Nettverk(g);
  const [y] = nett.aktiver([0.4, 0]);
  assert.ok(Math.abs(y! - Math.tanh(0.6)) < 1e-12);
});

test("bias er alltid 1 og deaktiverte koblinger ignoreres", () => {
  const g = tomtGenom(1, 1);
  g.koblinger.push({ inn: biasId(1), ut: utId(1, 0), vekt: 2, aktiv: true, innovasjon: 0 });
  g.koblinger.push({ inn: 0, ut: utId(1, 0), vekt: 100, aktiv: false, innovasjon: 1 });
  const nett = new Nettverk(g);
  const [y] = nett.aktiver([1]);
  assert.ok(Math.abs(y! - Math.tanh(2)) < 1e-12);
});

test("signal forplanter seg gjennom en kjede av skjulte noder", () => {
  const g = tomtGenom(1, 1);
  const s1 = førsteSkjulteId(1, 1);
  const s2 = s1 + 1;
  g.noder.push({ id: s1, type: "skjult" }, { id: s2, type: "skjult" });
  g.koblinger.push(
    { inn: 0, ut: s1, vekt: 1, aktiv: true, innovasjon: 0 },
    { inn: s1, ut: s2, vekt: 1, aktiv: true, innovasjon: 1 },
    { inn: s2, ut: utId(1, 0), vekt: 1, aktiv: true, innovasjon: 2 },
  );
  const nett = new Nettverk(g);
  const [y] = nett.aktiver([0.9]);
  const forventet = Math.tanh(Math.tanh(Math.tanh(0.9)));
  assert.ok(Math.abs(y! - forventet) < 1e-12, `kjedet signal (${y} vs ${forventet})`);
});

test("ALLE nevroner beregnes – også dinglende noder uten sti til utgang", () => {
  const g = tomtGenom(2, 1);
  const dingle = førsteSkjulteId(2, 1);
  g.noder.push({ id: dingle, type: "skjult" });
  // Dinglenoden mates fra inngang 1 men går ingen steder (ennå).
  g.koblinger.push(
    { inn: 0, ut: utId(2, 0), vekt: 1, aktiv: true, innovasjon: 0 },
    { inn: 1, ut: dingle, vekt: 1, aktiv: true, innovasjon: 1 },
  );
  const nett = new Nettverk(g);
  assert.equal(nett.antallBeregnedeNoder, 2, "både utgang og dinglenode beregnes");
  const [y] = nett.aktiver([0.5, 0.7]);
  assert.ok(Math.abs(y! - Math.tanh(0.5)) < 1e-12);
});

test("rekurrente koblinger og selvsløyfer krasjer ikke og gir endelige verdier", () => {
  const g = tomtGenom(1, 1);
  const s = førsteSkjulteId(1, 1);
  g.noder.push({ id: s, type: "skjult" });
  g.koblinger.push(
    { inn: 0, ut: s, vekt: 1, aktiv: true, innovasjon: 0 },
    { inn: s, ut: s, vekt: 0.5, aktiv: true, innovasjon: 1 }, // selvsløyfe
    { inn: utId(1, 0), ut: s, vekt: 0.3, aktiv: true, innovasjon: 2 }, // fra utgang (bakover)
    { inn: s, ut: utId(1, 0), vekt: 1, aktiv: true, innovasjon: 3 },
  );
  const nett = new Nettverk(g);
  const [y] = nett.aktiver([1]);
  assert.ok(Number.isFinite(y!));
  assert.ok(y! > -1 && y! < 1);
});

test("antall pass vokser med skjulte noder (signalrekkevidde) opp til taket", () => {
  const bok = new Innovasjonsbok(3, 2);
  const g = nyttGenom(3, 2, bok, lagRng(1), 2);
  assert.equal(new Nettverk(g).antallPass, 2);
  const s = førsteSkjulteId(3, 2);
  g.noder.push({ id: s, type: "skjult" }, { id: s + 1, type: "skjult" });
  assert.equal(new Nettverk(g).antallPass, 4);
});

test("feil antall innganger avvises", () => {
  const g = tomtGenom(3, 1);
  const nett = new Nettverk(g);
  assert.throws(() => nett.aktiver([1, 2]));
});

test("kalibrerUtgang flytter utgangen mot fasit og skriver vektene tilbake i genomet", () => {
  const g = tomtGenom(2, 1);
  g.koblinger.push(
    { inn: 0, ut: utId(2, 0), vekt: 0.5, aktiv: true, innovasjon: 0 },
    { inn: biasId(2), ut: utId(2, 0), vekt: 0.1, aktiv: true, innovasjon: 1 },
  );
  const nett = new Nettverk(g);
  const inn = [0.8, 0];
  const [før] = nett.aktiver(inn);
  const mål = 0.9;
  nett.kalibrerUtgang(0, mål, 0.5);
  // Vektene i GENOMET er endret (lamarckisk læring).
  assert.notEqual(g.koblinger[0]!.vekt, 0.5);
  assert.notEqual(g.koblinger[1]!.vekt, 0.1);
  const [etter] = new Nettverk(g).aktiver(inn);
  assert.ok(Math.abs(mål - etter!) < Math.abs(mål - før!), "utgangen nærmet seg fasit");
});

test("kalibrerUtgang krever et foregående aktiver-kall", () => {
  const g = tomtGenom(1, 1);
  assert.throws(() => new Nettverk(g).kalibrerUtgang(0, 0, 0.1));
});
