/**
 * TEMPERATUREN PÅ TROVEKTEN — og kravet som gjør resten troverdig.
 *
 * Knotten er `~mlbu=<fil>,T<temp>`, og formen er `logW_tro / T`. Fire ting må holde:
 *
 *   1. T = 1 er BIT-IDENTISK med en spek uten knotten. Ikke «omtrent», ikke «samme
 *      beslutning» — samme σ, samme n, samme kort, i hver stilling. Uten det kan ingen
 *      T-måling leses, fordi armen ved T = 1 ikke lenger er dagens bot.
 *   2. FORMEN er virkelig delingen: `trotemp: T` skal gi NØYAKTIG samme verdier som en
 *      trovekt kalleren selv har delt på T. Da er det målt at knotten gjør det den sier,
 *      ikke bare at den gjør noe.
 *   3. Den NÅR FRAM. En temperatur som ikke endrer noen σ er ikke koblet, og det er
 *      nøyaktig feilklassen kanal 2 sto i fra §111 til 13. sep.
 *   4. Parseren kaster på tull i stedet for å tie. En filsti kan slutte på «T3», og det er
 *      derfor knotten står bak komma — prøven holder komma-skillet fast.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { opprettSpill, utfør } from "../src/index.ts";
import { lovligeKort, type GameState } from "../src/motor.ts";
import { lagRng } from "../src/kort.ts";
import { lagIndre, utenSøk, ADAMS } from "../src/moe2/agentspek.ts";
import { vurderPar } from "../src/moe2/sdpar.ts";
import { Sikkerorakel } from "../src/moe2/sikkerorakel.ts";
import { lagTrovektFraVisning } from "../src/moe2/troprior.ts";
import type { Utspiller } from "../src/moe2/sdkort.ts";
import type { Verden } from "../src/solver/sampler.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";

type Indre = ConstructorParameters<typeof Sikkerorakel>[0];

const TROFIL = "e1-modell/mlb-tro.bin";
const TRO = MlbTronett.fraBytes(readFileSync(TROFIL));
const motpart = lagIndre(ADAMS) as unknown as Utspiller;

/** Kortvalg med minst to lovlige kort, som i `sik-tro.test.ts`. */
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

test("stillingene finnes", () => {
  assert.ok(STILLINGER.length >= 12, `bare ${STILLINGER.length} stillinger`);
});

test("KRAVET: T1 er bit-identisk med speken uten knotten", () => {
  const uten = `sik:alle:0:8k32~mlbu=${TROFIL}:${ADAMS}`;
  const medT1 = `sik:alle:0:8k32~mlbu=${TROFIL},T1:${ADAMS}`;
  // Rollout-motparten må være den samme: feltantallet er uendret, så `utenSøk` stripper likt.
  assert.equal(utenSøk(medT1), ADAMS);
  assert.equal(utenSøk(uten), utenSøk(medT1));

  const a = lagIndre(uten) as unknown as Sikkerorakel;
  const b = lagIndre(medT1) as unknown as Sikkerorakel;
  assert.equal(a.trotemp, 1);
  assert.equal(b.trotemp, 1);
  for (const s of STILLINGER) {
    const ha = a.velgHandling(s);
    const hb = b.velgHandling(s);
    assert.deepEqual(hb, ha, "T1 valgte et annet kort enn speken uten knotten");
    assert.equal(b.siste?.sigma, a.siste?.sigma, "T1 ga en annen σ");
    assert.equal(b.siste?.n, a.siste?.n);
    assert.equal(b.siste?.lag, a.siste?.lag);
  }
});

test("KRAVET: trotemp 1 i vurderPar er samme funksjonsobjekt — verdiene er identiske", () => {
  for (const s of STILLINGER.slice(0, 4)) {
    const sete = s.iTur!;
    const trovekt = lagTrovektFraVisning(TRO, s, sete, null);
    assert.ok(trovekt !== null);
    const felles = { verdener: 6, verdenKandidater: 32, budvekt: false as const, trovekt };
    const uten = vurderPar(s, sete, motpart, { ...felles, rng: lagRng(31) });
    const medT1 = vurderPar(s, sete, motpart, { ...felles, rng: lagRng(31), trotemp: 1 });
    assert.ok(uten !== null && medT1 !== null);
    for (const [i, k] of uten.kandidater.entries()) {
      assert.deepEqual([...medT1.kandidater[i]!.perVerden], [...k.perVerden]);
    }
    assert.equal(medT1.sigma, uten.sigma);
  }
});

test("FORMEN: trotemp T er nøyaktig logW_tro / T", () => {
  let ulik = 0;
  for (const s of STILLINGER.slice(0, 6)) {
    const sete = s.iTur!;
    const rå = lagTrovektFraVisning(TRO, s, sete, null);
    assert.ok(rå !== null);
    for (const T of [1.5, 3, 8]) {
      const delt = (v: Verden): number => rå(v) / T;
      const felles = { verdener: 6, verdenKandidater: 32, budvekt: false as const };
      const viaKnott = vurderPar(s, sete, motpart, { ...felles, rng: lagRng(41), trovekt: rå, trotemp: T });
      const viaHånd = vurderPar(s, sete, motpart, { ...felles, rng: lagRng(41), trovekt: delt });
      assert.ok(viaKnott !== null && viaHånd !== null);
      for (const [i, k] of viaHånd.kandidater.entries()) {
        assert.deepEqual([...viaKnott.kandidater[i]!.perVerden], [...k.perVerden], `T=${T} er ikke logW/T`);
      }
      // Kontrollarm: temperaturen skal FAKTISK flytte verdenene et sted, ellers
      // beviser likheten over bare at to identiske nullbidrag er like.
      const T1 = vurderPar(s, sete, motpart, { ...felles, rng: lagRng(41), trovekt: rå });
      if (T1 !== null && JSON.stringify(T1.kandidater.map((k) => k.perVerden)) !== JSON.stringify(viaKnott.kandidater.map((k) => k.perVerden))) {
        ulik++;
      }
    }
  }
  assert.ok(ulik > 0, "ingen temperatur endret en eneste verden — knotten når ikke trekkeren");
});

test("den NÅR FRAM: T i speken endrer σ et sted", () => {
  const a = lagIndre(`sik:alle:0:8k32~mlbu=${TROFIL}:${ADAMS}`) as unknown as Sikkerorakel;
  const b = lagIndre(`sik:alle:0:8k32~mlbu=${TROFIL},T8:${ADAMS}`) as unknown as Sikkerorakel;
  assert.equal(b.trotemp, 8);
  let ulik = 0;
  for (const s of STILLINGER) {
    a.velgHandling(s);
    b.velgHandling(s);
    // Samme frø, samme kandidater — bare vektens skarphet skiller armene.
    assert.equal(b.siste?.n, a.siste?.n);
    if (b.siste?.sigma !== a.siste?.sigma) ulik++;
  }
  assert.ok(ulik > 0, "T8 ga nøyaktig samme σ overalt — temperaturen når ikke søket");
});

test("parseren kaster på tull, og komma-skillet holder", () => {
  const spek = (hale: string): string => `sik:alle:0.5:8k32~mlbu=${TROFIL}${hale}:${ADAMS}`;
  assert.throws(() => lagIndre(spek(",T0")), /T<temp>/);
  assert.throws(() => lagIndre(spek(",T-2")), /T<temp>/);
  assert.throws(() => lagIndre(spek(",Tx")), /T<temp>/);
  assert.throws(() => lagIndre(spek(",q3")), /T<temp>/);
  assert.throws(() => lagIndre(spek(",")), /T<temp>/);
  // KOMMA-SKILLET: en sti som slutter på «T3» er en STI, ikke en temperatur. Uten komma
  // finnes ikke fila, og feilen skal komme fra lesingen — ikke fra en stille temperatur 3.
  assert.throws(() => lagIndre(spek("T3")), /(ENOENT|no such file)/i);
  // Tom trokilde er fortsatt tom trokilde.
  assert.throws(() => lagIndre(`sik:alle:0.5:8k32~mlbu=,T2:${ADAMS}`), /[Tt]om trokilde/);
});

test("Sikkerorakel avviser en umulig temperatur", () => {
  const bygg = (trotemp: number): Sikkerorakel =>
    new Sikkerorakel(lagIndre(ADAMS) as unknown as Indre, motpart, { verdener: 2, trotemp });
  assert.throws(() => bygg(0), /trotemp/);
  assert.throws(() => bygg(-1), /trotemp/);
  assert.throws(() => bygg(Number.NaN), /trotemp/);
});
