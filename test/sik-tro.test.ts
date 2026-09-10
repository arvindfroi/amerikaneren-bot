/**
 * TROEN I SØKET, OG FRISTEN (11. sep).
 *
 * Søket i den utrullede boten trakk verdener vektet etter budet alene. Nå kan
 * MLB-trohodet vekte dem (`~mlb=` / `~mlbu=` i `sik:`-speken, `tronett` i
 * `byggUtrullet`), og appen kan gi søket en frist. Fem ting må holde:
 *
 *   1. REKKEFØLGEN: utspillingen går verden for verden nå. Verdiene per kort og
 *      verden skal være NØYAKTIG de den gamle kort-for-kort-løkka ga.
 *   2. BUDVEKTEN AV er virkelig av: da er verdenene de uvektede trekningene.
 *   3. K2: troen bygges av spillerens visning. Bytt motstandernes kort, og vekten
 *      er den samme.
 *   4. KLASSENE: rel. sete 1 er neste sete, klasse 3 er vraket. En plantet
 *      fordeling skal trekke verdenen dit den peker.
 *   5. FRISTEN kutter hele verdener, og null verdener lar nettet stå.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { opprettSpill, utfør } from "../src/index.ts";
import { lovligeKort, type GameState } from "../src/motor.ts";
import { lagRng } from "../src/kort.ts";
import { lagIndre, utenSøk, ADAMS } from "../src/moe2/agentspek.ts";
import { medVerden, standardMål, trekkVerdener, type Utspiller } from "../src/moe2/sdkort.ts";
import { vurderPar } from "../src/moe2/sdpar.ts";
import { Sikkerorakel } from "../src/moe2/sikkerorakel.ts";
import { lagTrovektFraVisning, type Visningstro } from "../src/moe2/troprior.ts";
import { byggUtrullet } from "../src/moe2/utrullet.ts";
import { tolkBudmodell } from "../src/moe2/budmodell.ts";
import { trekkVerden, type Verden } from "../src/solver/sampler.ts";
import { kortTilInt } from "../src/solver/dds.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import { nettFraBytes, type NevroNett } from "../src/nevro/nett.ts";
import { E1Agent } from "../src/e1/agent.ts";

type Indre = ConstructorParameters<typeof Sikkerorakel>[0];

const motpart = lagIndre(ADAMS) as unknown as Utspiller;
const TRO = MlbTronett.fraBytes(readFileSync("e1-modell/mlb-tro.bin"));

/** Kortvalg med minst to lovlige kort fra noen Adams-giv. */
const STILLINGER: GameState[] = (() => {
  const ut: GameState[] = [];
  const agenter = [0, 1, 2, 3].map(() => lagIndre(ADAMS));
  for (const frø of [5_110_901, 5_110_902, 5_110_903]) {
    let s = opprettSpill({ antallSpillere: 4 }, frø);
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
      const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (sete === null || sete === undefined) break;
      if (s.fase === "SPILL" && s.iTur !== null && lovligeKort(s, s.iTur).length >= 2 && vakt % 3 === 0) ut.push(s);
      s = utfør(s, agenter[sete]!.velgHandling(s)).state;
    }
  }
  return ut;
})();

const spillFerdig = (start: GameState, m: Utspiller): GameState => {
  let s = start;
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) s = utfør(s, m.velgHandling(s)).state;
  return s;
};

const somVerden = (hender: number[][]): Verden => ({ hender }) as unknown as Verden;

test("stillingene finnes", () => {
  assert.ok(STILLINGER.length >= 12, `bare ${STILLINGER.length} stillinger`);
});

test("verden for verden gir nøyaktig verdiene fra den gamle kort-for-kort-løkka", () => {
  for (const s of STILLINGER.slice(0, 5)) {
    const sete = s.iTur!;
    const par = vurderPar(s, sete, motpart, { verdener: 4, rng: lagRng(77) });
    assert.ok(par !== null);
    const verdener = trekkVerdener(s, sete, 4, lagRng(77));
    assert.equal(par.n, verdener.length);
    for (const [i, kort] of lovligeKort(s, sete).entries()) {
      // DEN GAMLE LØKKA, ordrett: ytre over kort, indre over verdener.
      const gammel = verdener.map((hender) =>
        standardMål(spillFerdig(utfør(medVerden(s, hender, sete), { type: "SPILL", spiller: sete, kort }).state, motpart), sete),
      );
      assert.deepEqual([...par.kandidater[i]!.perVerden], gammel);
    }
  }
});

test("budvekten av uten tro: verdenene er de uvektede trekningene, rng for rng", () => {
  const s = STILLINGER[0]!;
  const sete = s.iTur!;
  const av = trekkVerdener(s, sete, 6, lagRng(5), undefined, undefined, 32, undefined, false);
  const r = lagRng(5);
  const uvektet: number[][][] = [];
  for (let i = 0; i < 6; i++) {
    const w = trekkVerden(s, sete, r);
    if (w !== null) uvektet.push(w.hender);
  }
  assert.deepEqual(av, uvektet);
  // Kontroll: med budvekten på velges det blant 32 kandidater, og det SKAL synes.
  const på = trekkVerdener(s, sete, 6, lagRng(5), undefined, undefined, 32, undefined, true);
  assert.notDeepEqual(på, av);
});

test("K2: vekten fra MLB-trohodet endres ikke når motstandernes kort byttes", () => {
  let prøvd = 0;
  for (const s of STILLINGER) {
    const sete = s.iTur!;
    const a = (sete + 1) % 4;
    const b = (sete + 2) % 4;
    if (s.hender[a]!.length === 0 || s.hender[b]!.length === 0) continue;
    const hender = s.hender.map((h) => [...h]);
    const x = hender[a]![0]!;
    hender[a]![0] = hender[b]![0]!;
    hender[b]![0] = x;
    const byttet: GameState = { ...s, hender };
    const v1 = lagTrovektFraVisning(TRO, s, sete, null);
    const v2 = lagTrovektFraVisning(TRO, byttet, sete, null);
    assert.ok(v1 !== null && v2 !== null);
    const r = lagRng(11);
    const verdier = new Set<number>();
    for (let i = 0; i < 8; i++) {
      const w = trekkVerden(s, sete, r);
      if (w === null) continue;
      assert.equal(v2(w), v1(w));
      verdier.add(v1(w));
    }
    // Kontroll: vekten er ikke en konstant, ellers beviser likheten ingenting.
    assert.ok(verdier.size > 1, "troen ga alle verdener samme vekt");
    prøvd++;
  }
  assert.ok(prøvd >= 10, `bare ${prøvd} stillinger prøvd`);
});

test("klassene: rel. sete 1 er neste sete, og klasse 3 er vraket", () => {
  const s = STILLINGER.find((st) => st.hender[(st.iTur! + 1) % 4]!.length > 0 && st.hender[(st.iTur! + 2) % 4]!.length > 0)!;
  const sete = s.iTur!;
  const n1 = (sete + 1) % 4;
  const n2 = (sete + 2) % 4;
  const x = s.hender[n2]![0]!;
  const y = s.hender[n1]![0]!;
  const plantet = (klasse: number): Visningstro => ({
    trekkFor: () => new Float32Array(1),
    fordeling: () =>
      Array.from({ length: 52 }, (_, i) =>
        i === kortIndeks(x) ? [0, 1, 2, 3].map((c) => (c === klasse ? 0.97 : 0.01)) : [0.25, 0.25, 0.25, 0.25],
      ),
  });
  const ekte = s.hender.map((h) => h.map(kortTilInt));
  const flyttet = ekte.map((h) => [...h]);
  flyttet[n1]![0] = kortTilInt(x);
  flyttet[n2]![0] = kortTilInt(y);

  const tilSete1 = lagTrovektFraVisning(plantet(0), s, sete, null)!;
  assert.ok(tilSete1(somVerden(flyttet)) > tilSete1(somVerden(ekte)), "troen peker på neste sete, verdenen med kortet der skal vinne");
  const tilSete2 = lagTrovektFraVisning(plantet(1), s, sete, null)!;
  assert.ok(tilSete2(somVerden(ekte)) > tilSete2(somVerden(flyttet)));

  const utenX = ekte.map((h) => h.filter((c) => c !== kortTilInt(x)));
  const vraket = lagTrovektFraVisning(plantet(3), s, sete, null)!;
  assert.ok(vraket(somVerden(utenX)) > vraket(somVerden(ekte)), "klasse 3 skal være kortet som ikke er på noen hånd");
});

test("fristen kutter hele verdener, og null verdener lar nettet stå", () => {
  const s = STILLINGER[1]!;
  let t = 0;
  // Start = 1, frist = 3,5. Sjekk før verden 0: 2, verden 1: 3, verden 2: 4 → stopp.
  const sik = new Sikkerorakel(lagIndre(ADAMS) as unknown as Indre, motpart, {
    verdener: 6,
    sigma: 0,
    fristMs: 2.5,
    klokke: () => ++t,
  });
  sik.velgHandling(s);
  assert.equal(sik.siste?.n, 2);
  assert.equal(sik.tellere.avkortet, 1);

  let t2 = 0;
  const sik0 = new Sikkerorakel(lagIndre(ADAMS) as unknown as Indre, motpart, {
    verdener: 6,
    sigma: 0,
    fristMs: 0.5,
    klokke: () => ++t2,
  });
  const valg = sik0.velgHandling(s);
  assert.equal(sik0.siste?.lag, "nett");
  assert.equal(sik0.siste?.n, 0);
  assert.deepEqual(valg, lagIndre(ADAMS).velgHandling(s));

  const utenFrist = new Sikkerorakel(lagIndre(ADAMS) as unknown as Indre, motpart, { verdener: 6, sigma: 0 });
  utenFrist.velgHandling(s);
  assert.equal(utenFrist.siste?.n, 6);
  assert.equal(utenFrist.tellere.avkortet, 0);
});

test("speken: ~mlbu= bygger, utenSøk stripper som før, troen når fram, ukjent kilde kastes", () => {
  const medTro = `sik:alle:0:4k8~mlbu=e1-modell/mlb-tro.bin:${ADAMS}`;
  const utenTro = `sik:alle:0:4k8:${ADAMS}`;
  assert.equal(utenSøk(medTro), ADAMS);
  const a = lagIndre(medTro) as unknown as Sikkerorakel;
  const b = lagIndre(utenTro) as unknown as Sikkerorakel;
  assert.ok(a instanceof Sikkerorakel);
  let ulik = 0;
  for (const s of STILLINGER.slice(0, 6)) {
    a.velgHandling(s);
    b.velgHandling(s);
    if (a.siste?.sigma !== b.siste?.sigma) ulik++;
  }
  // Troen skal flytte verdenene, og dermed σ, et sted. Ellers er den ikke koblet.
  assert.ok(ulik > 0, "~mlbu= ga nøyaktig samme σ i alle stillinger — troen når ikke søket");
  assert.throws(() => lagIndre(`sik:foerer:0.5:4k8~abc=e1-modell/mlb-tro.bin:${ADAMS}`), /trokilde/);
});

test("byggUtrullet tar trohodet, og avviser et som leser hukommelsen", () => {
  const kortBytes = new Uint8Array(readFileSync("e1-modell/d7alle.bin"));
  const rå = nettFraBytes(readFileSync("e1-modell/mlb-tro.bin"))[0]!;
  const utvidet = (nett: NevroNett, ekstra: number): NevroNett => {
    const [første, ...resten] = nett.lag;
    const inn = første!.inn + ekstra;
    const vekter = new Float32Array(første!.ut * inn);
    for (let r = 0; r < første!.ut; r++) {
      for (let c = 0; c < første!.inn; c++) vekter[r * inn + c] = første!.vekter[r * første!.inn + c]!;
    }
    return { lag: [{ inn, ut: første!.ut, vekter, bias: første!.bias }, ...resten] };
  };
  const bygg = (tronett: MlbTronett) =>
    byggUtrullet({
      kortnett: nettFraBytes(kortBytes)[0]!,
      kort: E1Agent.fraBytes(kortBytes),
      vaktflagg: "abmp",
      bud: tolkBudmodell(JSON.parse(readFileSync("e1-modell/bud-vant.json", "utf8"))),
      budterskel: -3.0,
      søk: { type: "sik", verdener: 4, sigma: 0.5, verdenKandidater: 8, tronett, budvekt: false },
    });
  assert.ok(bygg(new MlbTronett(rå)).sik !== null);
  assert.throws(() => bygg(new MlbTronett(utvidet(rå, 144))), /hukommelsen/);
});
