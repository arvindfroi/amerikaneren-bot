import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lagRng, likeKort } from "../src/kort.ts";
import { lovligeKort, opprettSpill, utfør, type GameState } from "../src/motor.ts";
import { ADAMS_MAALT, lagIndre, utenSøk } from "../src/moe2/agentspek.ts";
import { trekkVerdener } from "../src/moe2/sdkort.ts";
import { vurderPar } from "../src/moe2/sdpar.ts";
import { Sikkerorakel } from "../src/moe2/sikkerorakel.ts";
import { NevroAgent } from "../src/nevro/agent.ts";

/**
 * ============ `~trekk=strata`: STRATIFISERT UTVALG AV VERDENENE (14. sep) ============
 *
 * Søkets valgte kort skifter i 43 % av beslutningene BARE av å trekke nye verdener med
 * samme tro (`troledd.md` §3a, `bandit.md`). Tre grep mot den støyen har målt null —
 * flere verdener, σ-porten og adaptiv budsjettering — og alle tre endret HVORDAN
 * BUDSJETTET BRUKES. Denne knotten endrer i stedet hvordan verdenene TREKKES: samme
 * antall verdener, samme antall utspillinger, men et utvalg som dekker vektfordelingen
 * jevnt i stedet for å klumpe seg.
 *
 * Fila låser de fire tingene en slik knott kan lyve om:
 *
 *   AV ER AV        uten feltet finnes ikke nøkkelen, og strømmen er urørt.
 *   GRATIS          samme antall verdener, samme antall utspillinger, samme rng-kall.
 *   RIKTIG          troens marginal står stille — det er utvalget som endres.
 *   LEVENDE         knotten biter faktisk (jf. «12k16d4», som slo hele søket av i stillhet).
 */

const nevro = new NevroAgent();

/** N spillstillinger med minst to lovlige kort, drevet fram av nettet alene. */
function stillinger(antall: number, frø = 8_610_000): GameState[] {
  const ut: GameState[] = [];
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  while (s.fase !== "FERDIG" && ut.length < antall && vakt++ < 40_000) {
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    if (s.fase === "SPILL" && s.iTur !== null && lovligeKort(s, s.iTur).length >= 2) ut.push(s);
    s = utfør(s, nevro.velgHandling(s)).state;
  }
  return ut;
}

/** Teller `rng`-kall, så «samme budsjett» kan PÅVISES og ikke bare påstås. */
function tellende(rng: () => number): { f: () => number; n: () => number } {
  let k = 0;
  return {
    f: (): number => {
      k++;
      return rng();
    },
    n: (): number => k,
  };
}

// ===========================================================================
// 1-4: SPEKEN
// ===========================================================================

test("AV ER AV STRUKTURELT: uten «~trekk=» er trekk null, ikke «iid»", () => {
  const uten = lagIndre(`sik:alle:0.5:12k8e3LD:${ADAMS_MAALT}`) as unknown as Sikkerorakel;
  assert.equal(uten.trekk, null, "uten feltet skal nøkkelen ikke finnes i opsjonsobjektet");

  const med = lagIndre(`sik:alle:0.5:12k8e3LD~trekk=strata:${ADAMS_MAALT}`) as unknown as Sikkerorakel;
  assert.equal(med.trekk, "strata", "med feltet skal knotten være KOBLET, ikke bare stå i strengen");
});

test("INGEN KOLLISJON: «~trekk=» spiser ikke V, k, e, L eller D, og rekkefølgen er fri", () => {
  const les = (spek: string): Record<string, unknown> =>
    lagIndre(spek) as unknown as Record<string, unknown>;

  const a = les(`sik:alle:0.5:48k32e3LD~trekk=strata:${ADAMS_MAALT}`);
  assert.equal(a["verdener"], 48, "verdenstallet må overleve «~trekk=»");
  assert.equal(a["verdenKandidater"], 32, "kandidatfeltet må overleve «~trekk=»");
  assert.equal(a["eksaktBlad"], 3, "e3 må overleve «~trekk=»");
  assert.equal(a["lagmål"], true, "L må overleve «~trekk=»");
  assert.equal(a["visningsfrø"], true, "D må overleve «~trekk=»");
  assert.equal(a["trekk"], "strata");

  // BEGGE REKKEFØLGER. `~`-feltene deles på «~» og leses som par, så de skal kommutere.
  const b = les(`sik:alle:0.5:48k32e3LD~lik=selv~trekk=strata:${ADAMS_MAALT}`);
  const c = les(`sik:alle:0.5:48k32e3LD~trekk=strata~lik=selv:${ADAMS_MAALT}`);
  for (const [navn, x] of [
    ["~lik= først", b],
    ["~trekk= først", c],
  ] as const) {
    assert.equal(x["trekk"], "strata", `${navn}: trekk`);
    assert.ok(x["likFor"] !== null && x["likFor"] !== undefined, `${navn}: likelihood-vekten`);
    assert.equal(x["verdener"], 48, `${navn}: verdener`);
    assert.equal(x["eksaktBlad"], 3, `${navn}: e3`);
  }
});

test("UGYLDIG KASTER HØYLYTT: en knott som er død i strengen er verre enn ingen knott", () => {
  for (const verdi of ["", "iid", "Strata", "strata2", "sys", "stratifisert", "1", "systematic"]) {
    assert.throws(
      () => lagIndre(`sik:alle:0.5:12k8~trekk=${verdi}:${ADAMS_MAALT}`),
      /~trekk=/,
      `«~trekk=${verdi}» må kaste`,
    );
  }
  // Ukjent art skal fortsatt kaste, og meldingen skal nevne den nye formen.
  assert.throws(() => lagIndre(`sik:alle:0.5:12k8~tull=1:${ADAMS_MAALT}`), /trekk=strata/);
});

test("«utenSøk» ER URØRT: feltantallet er uendret, og motparten strippes til basen", () => {
  const uten = `sik:alle:0.5:48k32e3LD:${ADAMS_MAALT}`;
  const med = `sik:alle:0.5:48k32e3LD~trekk=strata:${ADAMS_MAALT}`;
  assert.equal(utenSøk(med), ADAMS_MAALT, "rollout-motparten må strippes som før");
  assert.equal(
    med.split(":").length,
    uten.split(":").length,
    "«~trekk=strata» inneholder ikke kolon, så feltantallet må være uendret",
  );
});

// ===========================================================================
// 5-7: KOSTNADEN — «samme budsjett» skal BEVISES, ikke hevdes
// ===========================================================================

test("SAMME ANTALL VERDENER OG SAMME ANTALL UTSPILLINGER, stilling for stilling", () => {
  let sett = 0;
  for (const s of stillinger(30)) {
    const sete = s.iTur!;
    const felles = { verdener: 16, verdenKandidater: 12, eksaktBlad: 3 } as const;
    const i = vurderPar(s, sete, nevro, { ...felles, rng: lagRng(90_210) });
    const t = vurderPar(s, sete, nevro, { ...felles, rng: lagRng(90_210), trekk: "strata" });
    if (i === null || t === null) continue;
    sett++;
    assert.equal(t.n, i.n, "antall verdener må være likt");
    assert.equal(
      t.kandidater.length,
      i.kandidater.length,
      "antall kandidater må være likt",
    );
    // `vurderPar` spiller ut verden-for-verden × kandidat-for-kandidat, så
    // utspillingene er EKSAKT n × kandidater. Er begge like, er budsjettet likt.
    assert.equal(t.n * t.kandidater.length, i.n * i.kandidater.length, "utspillinger");
    for (const k of t.kandidater) {
      assert.equal(k.perVerden.length, t.n, "hver kandidat må ha en verdi i hver verden");
    }
  }
  assert.ok(sett >= 20, `for få sammenliknbare stillinger (${sett})`);
});

test("RNG-NØYTRAL: strata bruker NØYAKTIG like mange rng-kall som i.i.d.", () => {
  let sett = 0;
  for (const s of stillinger(20)) {
    const sete = s.iTur!;
    const ti = tellende(lagRng(4_711));
    const ts = tellende(lagRng(4_711));
    const vi = trekkVerdener(s, sete, 16, ti.f, undefined, undefined, 12, undefined, true);
    const vs = trekkVerdener(s, sete, 16, ts.f, undefined, undefined, 12, undefined, true, "strata");
    assert.equal(
      ts.n(),
      ti.n(),
      "ett rng()-kall til utvelgelsen i begge grenene — ellers er poolene ikke lenger de samme",
    );
    assert.equal(vs.length, vi.length, "like mange verdener");
    sett++;
  }
  assert.ok(sett >= 15, `for få stillinger (${sett})`);
});

test("KNOTTEN BITER: med samme frø velger strata noen ganger et annet kort", () => {
  let ulike = 0;
  let sett = 0;
  for (const s of stillinger(40)) {
    const sete = s.iTur!;
    if (lovligeKort(s, sete).length < 3) continue;
    const felles = { verdener: 12, verdenKandidater: 16, eksaktBlad: 3 } as const;
    const i = vurderPar(s, sete, nevro, { ...felles, rng: lagRng(31_337) });
    const t = vurderPar(s, sete, nevro, { ...felles, rng: lagRng(31_337), trekk: "strata" });
    if (i === null || t === null) continue;
    sett++;
    if (!likeKort(i.beste.kort, t.beste.kort)) ulike++;
  }
  assert.ok(sett >= 10, `for få stillinger med ≥ 3 lovlige kort (${sett})`);
  assert.ok(
    ulike > 0,
    `strata valgte ALDRI et annet kort i ${sett} stillinger — knotten er død i strengen`,
  );
});

// ===========================================================================
// 8: FORDELINGEN SKAL STÅ STILLE
// ===========================================================================

test("FORVENTNINGSRETT: troens marginal er uendret, men utvalget er strammere", () => {
  const K = 16;
  const KAND = 12;
  const REP = 120;
  const seter = 4;

  let cellerSjekket = 0;
  let maksAvvik = 0;
  let sumAbsAvvik = 0;
  let sumSdI = 0;
  let sumSdS = 0;
  let sdCeller = 0;

  for (const s of stillinger(3, 8_620_000)) {
    const sete = s.iTur!;
    const iRep: number[][] = [];
    const sRep: number[][] = [];

    for (let r = 0; r < REP; r++) {
      // SAMME FRØ i begge modusene: poolene blir bit-identiske, bare utvelgelsen skiller.
      const frø = (7_000_003 + r * 2_654_435_761) >>> 0;
      const vi = trekkVerdener(s, sete, K, lagRng(frø), undefined, undefined, KAND, undefined, true);
      const vs = trekkVerdener(
        s, sete, K, lagRng(frø), undefined, undefined, KAND, undefined, true, "strata",
      );
      if (vi.length === 0 || vs.length === 0) continue;
      const tell = (verdener: number[][][]): number[] => {
        const m = new Array<number>(52 * seter).fill(0);
        for (const hender of verdener) {
          for (let p = 0; p < seter && p < hender.length; p++) {
            for (const c of hender[p]!) m[c * seter + p] = m[c * seter + p]! + 1;
          }
        }
        return m.map((x) => x / verdener.length);
      };
      iRep.push(tell(vi));
      sRep.push(tell(vs));
    }
    if (iRep.length < 20) continue;

    const snitt = (x: number[]): number => x.reduce((a, b) => a + b, 0) / x.length;
    for (let c = 0; c < 52 * seter; c++) {
      const a = iRep.map((m) => m[c]!);
      const b = sRep.map((m) => m[c]!);
      const mA = snitt(a);
      const mB = snitt(b);
      // Celler som er konstant 0 i begge (kortet ligger synlig et annet sted) bærer ingenting.
      if (mA === 0 && mB === 0) continue;
      cellerSjekket++;
      const avvik = Math.abs(mB - mA);
      maksAvvik = Math.max(maksAvvik, avvik);
      sumAbsAvvik += avvik;
      const sd = (x: number[], m: number): number =>
        Math.sqrt(x.reduce((p, q) => p + (q - m) ** 2, 0) / (x.length - 1));
      const sdI = sd(a, mA);
      if (sdI > 1e-9) {
        sumSdI += sdI;
        sumSdS += sd(b, mB);
        sdCeller++;
      }
    }
  }

  assert.ok(cellerSjekket >= 100, `for få celler (${cellerSjekket})`);
  const snittAvvik = sumAbsAvvik / cellerSjekket;
  // MC-SE-en på en celle er ~0,5/√(REP·K) ≈ 0,010 her, så snittavviket skal ligge
  // på det nivået. En FLYTTET fordeling ville gitt et systematisk større tall.
  assert.ok(
    snittAvvik < 0.02,
    `troens marginal flyttet seg: snitt |Δ| = ${snittAvvik.toFixed(4)} (maks ${maksAvvik.toFixed(4)}). ` +
      `Stratifisering skal endre UTVALGET, ikke FORDELINGEN.`,
  );

  // Og den andre halvdelen: utvalget skal faktisk være strammere.
  assert.ok(sdCeller >= 50, `for få celler med varians (${sdCeller})`);
  const sdI = sumSdI / sdCeller;
  const sdS = sumSdS / sdCeller;
  assert.ok(
    sdS <= sdI,
    `strata var ikke strammere enn i.i.d.: SD ${sdS.toFixed(5)} mot ${sdI.toFixed(5)}`,
  );
});
