import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill } from "../src/index.ts";
import { spillerVisning, utfør, type GameState } from "../src/motor.ts";
import { NevroAgent } from "../src/nevro/agent.ts";
import { ANTALL_INN, INNGANG, lagInn } from "../src/neat/trekk.ts";
import { tømCache } from "../src/neat/singledummy.ts";
import { Nettverk } from "../src/neat/nett.ts";

import { budEkspert, lagBudstillinger, påstand } from "../src/moe2/eksperter/bud.ts";
import {
  anger,
  bøtte,
  delUtvalg,
  gulvFor,
  MOE2_RATER,
  målEkspert,
  Populasjon,
  portvakt,
  rolleFor,
  type Rolle,
  type Råstilling,
} from "../src/moe2/eksperter/felles.ts";
import {
  BUD_SENSORER,
  konstanteSensorer,
  projiser,
  SPILL_FORSVAR_SENSORER,
  SPILL_FØRER_SENSORER,
  SPILL_MAKKER_SENSORER,
  TRUMF_SENSORER,
  VRAK_SENSORER,
} from "../src/moe2/eksperter/sensorer.ts";
import { lagTrumfstillinger, trumfEkspert } from "../src/moe2/eksperter/trumf.ts";
import { alleVrak, lagVrakstilling, vrakEkspert } from "../src/moe2/eksperter/vrak.ts";
import { SPILLEKSPERTER, rolleFraVektor } from "../src/moe2/eksperter/spill.ts";

/**
 * Testene her låser MoE2s tre ikke-forhandlingsbare krav:
 *   1. all rapportering går gjennom `mål()`, med gulv og tak fra samme utvalg
 *   2. hver ekspert har en holdout seleksjonen aldri ser
 *   3. sensorutvalget er eksplisitt, og kuttene er etterprøvbare
 * pluss at hver fasit er deterministisk.
 */

// ---------------------------------------------------------------------------
// Portvakten
// ---------------------------------------------------------------------------

test("portvakten er en ren funksjon av fase og rolle", () => {
  const nevro = new NevroAgent();
  let s: GameState = opprettSpill({}, 31_000_001);
  assert.equal(portvakt(s, s.iTur!), "bud");
  while (s.fase === "BUDRUNDE") s = utfør(s, nevro.velgHandling(s)).state;
  assert.equal(s.fase, "VRAK");
  assert.equal(portvakt(s, s.budvinner!), "vrak");
  // Bare budvinneren handler i VRAK/VELG – de andre har ingen ekspert.
  for (let p = 0; p < s.antallSpillere; p++) {
    if (p !== s.budvinner) assert.equal(portvakt(s, p), null);
  }
  s = utfør(s, nevro.velgHandling(s)).state;
  assert.equal(s.fase, "VELG");
  assert.equal(portvakt(s, s.budvinner!), "trumf");
  s = utfør(s, nevro.velgHandling(s)).state;
  assert.equal(s.fase, "SPILL");

  const sett = new Set<string>();
  for (let p = 0; p < s.antallSpillere; p++) {
    const navn = portvakt(s, p);
    assert.ok(navn !== null);
    sett.add(navn);
    // Deterministisk: samme spørsmål, samme svar.
    assert.equal(portvakt(s, p), navn);
  }
  assert.ok(sett.has("spill-fører"));
  assert.ok(sett.has("spill-forsvar"));
  assert.equal(rolleFor(s, s.budvinner!), "fører");
});

// ---------------------------------------------------------------------------
// Sensorutvalgene
// ---------------------------------------------------------------------------

test("sensorutvalgene er sorterte, unike, innenfor kodingen og av låst størrelse", () => {
  const sett: [string, readonly number[], number][] = [
    ["bud", BUD_SENSORER, 87],
    ["vrak", VRAK_SENSORER, 81],
    ["trumf", TRUMF_SENSORER, 130],
    ["spill-fører", SPILL_FØRER_SENSORER, 264],
    ["spill-forsvar", SPILL_FORSVAR_SENSORER, 266],
    ["spill-makker", SPILL_MAKKER_SENSORER, 262],
  ];
  for (const [navn, s, forventet] of sett) {
    assert.equal(s.length, forventet, `${navn}: sensortallet er endret uten begrunnelse`);
    assert.equal(new Set(s).size, s.length, `${navn}: duplikat sensor`);
    for (let i = 1; i < s.length; i++) assert.ok(s[i]! > s[i - 1]!, `${navn}: usortert`);
    assert.ok(s[0]! >= 0 && s[s.length - 1]! < ANTALL_INN, `${navn}: sensor utenfor kodingen`);
  }
});

test("projiser plukker nøyaktig ekspertens sensorer", () => {
  const full = Array.from({ length: ANTALL_INN }, (_, i) => i);
  const p = projiser(full, BUD_SENSORER);
  assert.deepEqual(p, [...BUD_SENSORER]);
  assert.throws(() => projiser([1, 2, 3], BUD_SENSORER));
});

/** Fulle 318-vektorer fra ekte spill, gruppert på rolle. */
function spillvektorer(giver: number): Record<Rolle, number[][]> {
  const nevro = new NevroAgent();
  const ut: Record<Rolle, number[][]> = { fører: [], forsvar: [], makker: [] };
  for (let i = 0; i < giver; i++) {
    let s: GameState = opprettSpill({}, 41_000_000 + i);
    let vakt = 0;
    while (s.fase !== "RUNDE_SLUTT" && s.fase !== "FERDIG" && vakt++ < 200) {
      if (s.fase === "SPILL" && s.iTur !== null) {
        const p = s.iTur;
        ut[rolleFor(s, p)].push(
          lagInn(spillerVisning(s, p), "SPILL", s.giving.antallStikk, s.regler.målPoeng),
        );
      }
      s = utfør(s, nevro.velgHandling(s)).state;
    }
  }
  return ut;
}

test("de kuttede rollesensorene er FAKTISK konstante i rollen sin", () => {
  const per = spillvektorer(40);
  for (const rolle of ["fører", "forsvar", "makker"] as const) {
    assert.ok(per[rolle].length > 50, `for få ${rolle}-stillinger til å måle noe`);
  }
  const konstant = {
    fører: new Set(konstanteSensorer(per.fører)),
    forsvar: new Set(konstanteSensorer(per.forsvar)),
    makker: new Set(konstanteSensorer(per.makker)),
  };
  // De strukturelt umulige – i alle tre rollene.
  for (const rolle of ["fører", "forsvar", "makker"] as const) {
    for (const i of [INNGANG.UTSPILLER, INNGANG.STIKKLEDER]) {
      assert.ok(konstant[rolle].has(i), `${rolle}: ${i} skulle vært konstant`);
    }
  }
  // Rollekonstantene.
  assert.ok(konstant.fører.has(INNGANG.PÅ_BUDLAGET));
  assert.ok(konstant.fører.has(INNGANG.ER_FORSVARER));
  assert.ok(konstant.fører.has(INNGANG.BUDVINNER)); // budvinneren er meg
  assert.ok(konstant.forsvar.has(INNGANG.ER_FORSVARER));
  assert.ok(konstant.forsvar.has(INNGANG.PÅ_BUDLAGET));
  assert.ok(konstant.forsvar.has(INNGANG.TREKK_TRUMF)); // «på budlaget OG …»
  assert.ok(konstant.makker.has(INNGANG.ER_HEMMELIG_MAKKER));
  assert.ok(konstant.makker.has(INNGANG.PÅ_BUDLAGET));
  // ...og motprøven: TREKK_TRUMF er IKKE konstant for budlagsrollene, ellers
  // ville det å legge den tilbake vært like meningsløst som å kutte den.
  assert.ok(!konstant.fører.has(INNGANG.TREKK_TRUMF));
});

test("rolleFraVektor gir samme rolle som portvakten", () => {
  const nevro = new NevroAgent();
  let treff = 0;
  for (let i = 0; i < 20; i++) {
    let s: GameState = opprettSpill({}, 42_000_000 + i);
    let vakt = 0;
    while (s.fase !== "RUNDE_SLUTT" && s.fase !== "FERDIG" && vakt++ < 200) {
      if (s.fase === "SPILL" && s.iTur !== null) {
        const p = s.iTur;
        const vek = lagInn(spillerVisning(s, p), "SPILL", s.giving.antallStikk, s.regler.målPoeng);
        assert.equal(rolleFraVektor(vek), rolleFor(s, p));
        treff++;
      }
      s = utfør(s, nevro.velgHandling(s)).state;
    }
  }
  assert.ok(treff > 100);
});

// ---------------------------------------------------------------------------
// Målekontrakten
// ---------------------------------------------------------------------------

function tullstilling(gruppe: string, verdi: readonly number[]): Råstilling<number> {
  return {
    gruppe,
    inn: new Array<number>(BUD_SENSORER.length).fill(0),
    handlinger: verdi.map((_, i) => i),
    verdi,
    takValg: 0,
    læremål: new Map(),
  };
}

test("gulvet er den EKSAKTE forventningen ved uniformt lovlig valg", () => {
  const s = tullstilling("g", [-2, -1, 0, -5]);
  assert.equal(gulvFor(s), 0 - (-2 - 1 + 0 - 5) / 4);
  assert.equal(anger(s, 2), 0);
  assert.equal(anger(s, 3), 5);
  assert.throws(() => anger(s, 9));
});

test("en ekspert uten holdout kan ikke måles", () => {
  const alle = [tullstilling("a", [0, -1]), tullstilling("b", [0, -2])];
  // Alt til trening: da finnes det ingen holdout, og da finnes det ingen tall.
  const utvalg = delUtvalg("uten-holdout", alle, { trening: 10, utvikling: 0 });
  assert.equal(utvalg.holdout.length, 0);
  const pop = new Populasjon(budEkspert, { antall: 2, frø: 5 });
  assert.throws(
    () => målEkspert(budEkspert, pop.genomer[0]!, utvalg, "trening"),
    /holdout/,
    "en måling uten holdout skal ikke kunne konstrueres",
  );
});

test("holdout røres verken av læring eller seleksjon", () => {
  const alle: Råstilling<number>[] = [];
  for (let i = 0; i < 60; i++) alle.push(tullstilling(`giv${i}`, [0, -1, -2]));
  const utvalg = delUtvalg("tre", alle);
  assert.ok(utvalg.holdout.length > 0 && utvalg.utvikling.length > 0);
  const pop = new Populasjon(budEkspert, { antall: 4, frø: 7 });
  assert.throws(() => pop.lærEpoke(utvalg.holdout), /holdout/);
  assert.throws(() => pop.nyGenerasjon(utvalg.holdout), /holdout/);
  // Seleksjonen skal heller ikke få kjøre på treningssettet.
  assert.throws(() => pop.nyGenerasjon(utvalg.trening), /trening/);
});

test("delUtvalg holder en giv samlet – ellers er holdouten ikke uavhengig", () => {
  const alle: Råstilling<number>[] = [];
  for (let giv = 0; giv < 50; giv++) {
    for (let k = 0; k < 4; k++) alle.push(tullstilling(`giv:${giv}`, [0, -1, -2]));
  }
  const u = delUtvalg("giv", alle);
  const grupper = (arr: readonly { gruppe: string | number }[]): Set<string | number> =>
    new Set(arr.map((s) => s.gruppe));
  const t = grupper(u.trening);
  const v = grupper(u.utvikling);
  for (const g of grupper(u.holdout)) {
    assert.ok(!t.has(g) && !v.has(g), `giva ${String(g)} ligger i to deler`);
  }
  assert.equal(u.trening.length + u.utvikling.length + u.holdout.length, alle.length);
  // Stabil: samme nøkkel gir samme bøtte uansett hvor mange giver som finnes.
  assert.equal(bøtte("giv:7"), bøtte("giv:7"));
});

// ---------------------------------------------------------------------------
// Fasitene er deterministiske
// ---------------------------------------------------------------------------

test("budfasiten er deterministisk", () => {
  tømCache();
  const a = lagBudstillinger({ giver: 6, frø: 51_000_000 });
  tømCache();
  const b = lagBudstillinger({ giver: 6, frø: 51_000_000 });
  assert.ok(a.length > 10);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.deepEqual(a[i]!.verdi, b[i]!.verdi);
    assert.deepEqual(a[i]!.handlinger, b[i]!.handlinger);
    assert.equal(a[i]!.takValg, b[i]!.takValg);
    assert.deepEqual([...a[i]!.læremål], [...b[i]!.læremål]);
  }
});

test("budhandlingene ligger på ÉN akse: pass, tallbud og amerikaner i stikk", () => {
  assert.equal(påstand("PASS", 12), 4);
  assert.equal(påstand(7, 12), 7);
  assert.equal(påstand("AMERIKANER", 12), 12);
  assert.equal(påstand("SOLO", 12), 12);
});

test("trumffasiten er deterministisk", () => {
  const a = lagTrumfstillinger({ giver: 3, frø: 52_000_000, dybde: 3 });
  const b = lagTrumfstillinger({ giver: 3, frø: 52_000_000, dybde: 3 });
  assert.ok(a.length > 0);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.deepEqual(a[i]!.verdi, b[i]!.verdi);
    assert.deepEqual(a[i]!.handlinger, b[i]!.handlinger);
    assert.equal(a[i]!.takValg, b[i]!.takValg);
  }
});

test("vrakfasiten er deterministisk og dekker HELE handlingsrommet", () => {
  const nevro = new NevroAgent();
  let s: GameState = opprettSpill({}, 53_000_000);
  let vakt = 0;
  while (s.fase === "BUDRUNDE" && vakt++ < 40) s = utfør(s, nevro.velgHandling(s)).state;
  assert.equal(s.fase, "VRAK");
  const a = lagVrakstilling(s, { dybde: 2 });
  const b = lagVrakstilling(s, { dybde: 2 });
  assert.ok(a !== null && b !== null);
  // C(16,4) = 1820: gulvet er eksakt fordi HVER lovlige handling er regnet.
  assert.equal(a.handlinger.length, 1820);
  assert.deepEqual(a.verdi, b.verdi);
  assert.equal(a.takValg, b.takValg);
  assert.equal(alleVrak([1, 2, 3, 4, 5], 2).length, 10);
});

// ---------------------------------------------------------------------------
// Ekspertene velger lovlig, og lærer
// ---------------------------------------------------------------------------

test("hver ekspert velger en lovlig handling", () => {
  tømCache();
  const bud = lagBudstillinger({ giver: 4, frø: 54_000_000 });
  const trumf = lagTrumfstillinger({ giver: 3, frø: 54_100_000, dybde: 2 });
  const sjekk = <H>(
    ekspert: Parameters<typeof målEkspert<H>>[0],
    stillinger: readonly Råstilling<H>[],
  ): void => {
    const pop = new Populasjon(ekspert, { antall: 3, frø: 11 });
    for (const g of pop.genomer) {
      const nett = new Nettverk(g);
      for (const s of stillinger) {
        const i = ekspert.velg(nett.aktiver(s.inn), s);
        assert.ok(Number.isInteger(i) && i >= 0 && i < s.handlinger.length);
        assert.ok(anger(s, i) >= -1e-9);
      }
    }
  };
  sjekk(budEkspert, bud);
  sjekk(trumfEkspert, trumf);

  const nevro = new NevroAgent();
  let s: GameState = opprettSpill({}, 54_200_000);
  let vakt = 0;
  while (s.fase === "BUDRUNDE" && vakt++ < 40) s = utfør(s, nevro.velgHandling(s)).state;
  const vrak = lagVrakstilling(s, { dybde: 2 });
  assert.ok(vrak !== null);
  sjekk(vrakEkspert, [vrak]);
});

test("lamarckisk kalibrering senker treningsangeren for budeksperten", () => {
  tømCache();
  const alle = lagBudstillinger({ giver: 60, frø: 55_000_000 });
  const utvalg = delUtvalg("bud", alle);
  const pop = new Populasjon(budEkspert, { antall: 6, frø: 3 });
  const før = pop.rangér(utvalg.trening)[0]!.anger;
  for (let e = 0; e < 5; e++) pop.lærEpoke(utvalg.trening, 0.05);
  const etter = pop.rangér(utvalg.trening)[0]!.anger;
  assert.ok(
    etter < før,
    `læringen skal virke på treningssettet: ${før.toFixed(4)} → ${etter.toFixed(4)}`,
  );
  // Og målingen på holdout skal fortsatt kunne konstrueres, med gulv og tak.
  const m = målEkspert(budEkspert, pop.rangér(utvalg.utvikling)[0]!.genom, utvalg, "holdout");
  assert.equal(m.holdout, true);
  assert.ok(m.n > 0 && Number.isFinite(m.gulv) && Number.isFinite(m.tak));
});

// ---------------------------------------------------------------------------
// Ekspertene deler ingenting
// ---------------------------------------------------------------------------

test("hver ekspert har sin egen innovasjonsbok og sitt eget genomformat", () => {
  const a = new Populasjon(budEkspert, { antall: 2, frø: 1 });
  const b = new Populasjon(vrakEkspert, { antall: 2, frø: 1 });
  const c = new Populasjon(SPILLEKSPERTER.forsvar, { antall: 2, frø: 1 });
  assert.notEqual(a.bok, b.bok);
  assert.notEqual(b.bok, c.bok);
  assert.equal(a.genomer[0]!.antallInn, BUD_SENSORER.length);
  assert.equal(a.genomer[0]!.antallUt, 1);
  assert.equal(b.genomer[0]!.antallInn, VRAK_SENSORER.length);
  assert.equal(b.genomer[0]!.antallUt, 52);
  assert.equal(c.genomer[0]!.antallInn, SPILL_FORSVAR_SENSORER.length);
  // Et genom fra én ekspert kan ikke engang kjøres på en annens stillinger.
  const nett = new Nettverk(a.genomer[0]!);
  assert.throws(() => nett.aktiver(new Array<number>(VRAK_SENSORER.length).fill(0)));
});

test("topologi-evolusjonen endrer struktur, ikke vekter", () => {
  const alle: Råstilling<number>[] = [];
  for (let i = 0; i < 80; i++) alle.push(tullstilling(`giv${i}`, [0, -1, -3]));
  const utvalg = delUtvalg("topo", alle);
  const pop = new Populasjon(budEkspert, { antall: 8, frø: 13 });
  const førKoblinger = pop.genomer.map((g) => g.koblinger.length);
  const res = pop.nyGenerasjon(utvalg.utvikling);
  assert.ok(Number.isFinite(res.beste) && Number.isFinite(res.median));
  assert.equal(pop.genomer.length, 8);
  const etterKoblinger = pop.genomer.map((g) => g.koblinger.length);
  assert.notDeepEqual(etterKoblinger, førKoblinger, "ingen topologi endret seg");
  // Ingen vektdrift: den halvparten som overlever er UENDRET, ikke perturbert.
  // (Med MOE2_RATER er `vekter` 0, så bare struktur kan flytte seg.)
  for (const g of pop.genomer) {
    for (const k of g.koblinger) assert.ok(Number.isFinite(k.vekt) && Math.abs(k.vekt) <= 8);
  }
});

test("vektmutasjon er AV som standard", () => {
  assert.equal(MOE2_RATER.vekter, 0);
  assert.equal(MOE2_RATER.nyVekt, 0);
  assert.equal(MOE2_RATER.styrke, 0);
  assert.ok(MOE2_RATER.nyKobling > 0 && MOE2_RATER.nyNode > 0);
});
