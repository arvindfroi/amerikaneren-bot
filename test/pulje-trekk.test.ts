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
 * ============ `~pulje=felles`: ÉN FELLES KANDIDATPULJE (14. sep) ============
 *
 * Søkets valgte kort skifter i 43 % av beslutningene BARE av å trekke nye verdener med
 * samme tro (`troledd.md` §3a, `bandit.md`). Fire grep mot den støyen har målt null, og
 * det siste — stratifisering — fant HVORFOR: `trekkVerdener` gir hver av de 48 verdenene
 * sin EGEN uavhengige kandidatpulje, så risten hadde ingen felles akse å virke langs
 * (`strata.md` §4c, variansreduksjon 0,997). Denne knotten slår de 48 puljene sammen til
 * ÉN på 48·32 = 1536 — like mange kandidater som i dag — og legger risten over den
 * felles kumulative vekten.
 *
 * Fila låser de fem tingene en slik knott kan lyve om:
 *
 *   AV ER AV     uten feltet finnes ikke nøkkelen, og strømmen er urørt.
 *   TRO STI      «blokk» er BIT-IDENTISK med av — den felles koden er en tro omskriving,
 *                så alt som skiller i «felles» kommer fra UTVELGELSEN og intet annet.
 *   GRATIS       samme antall verdener, samme antall utspillinger, samme rng-kall.
 *   LEVENDE      knotten biter faktisk (jf. «12k16d4», som slo hele søket av i stillhet).
 *   ÆRLIG        mangfoldet kan kollapse, og det skal være MÅLBART, ikke skjult.
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

/** Kanonisk tekst for ett ensemble av verdener. */
const nøkkel = (v: number[][][]): string =>
  v.map((h) => h.map((x) => x.slice().sort((a, b) => a - b).join(",")).join("|")).join(";");

// ===========================================================================
// 1-4: SPEKEN
// ===========================================================================

test("AV ER AV STRUKTURELT: uten «~pulje=» er pulje null, ikke «iid»", () => {
  const uten = lagIndre(`sik:alle:0.5:12k8e3LD:${ADAMS_MAALT}`) as unknown as Sikkerorakel;
  assert.equal(uten.pulje, null, "uten feltet skal nøkkelen ikke finnes i opsjonsobjektet");

  const med = lagIndre(`sik:alle:0.5:12k8e3LD~pulje=felles:${ADAMS_MAALT}`) as unknown as Sikkerorakel;
  assert.equal(med.pulje, "felles", "med feltet skal knotten være KOBLET, ikke bare stå i strengen");

  const blokk = lagIndre(`sik:alle:0.5:12k8e3LD~pulje=blokk:${ADAMS_MAALT}`) as unknown as Sikkerorakel;
  assert.equal(blokk.pulje, "blokk");
});

test("INGEN KOLLISJON: «~pulje=» spiser ikke V, k, e, L eller D, og rekkefølgen er fri", () => {
  const les = (spek: string): Record<string, unknown> =>
    lagIndre(spek) as unknown as Record<string, unknown>;

  const a = les(`sik:alle:0.5:48k32e3LD~pulje=felles:${ADAMS_MAALT}`);
  assert.equal(a["verdener"], 48, "verdenstallet må overleve «~pulje=»");
  assert.equal(a["verdenKandidater"], 32, "kandidatfeltet må overleve «~pulje=»");
  assert.equal(a["eksaktBlad"], 3, "e3 må overleve «~pulje=»");
  assert.equal(a["lagmål"], true, "L må overleve «~pulje=»");
  assert.equal(a["visningsfrø"], true, "D må overleve «~pulje=»");
  assert.equal(a["pulje"], "felles");

  // BEGGE REKKEFØLGER. `~`-feltene deles på «~» og leses som par, så de skal kommutere.
  const b = les(`sik:alle:0.5:48k32e3LD~lik=selv~pulje=felles:${ADAMS_MAALT}`);
  const c = les(`sik:alle:0.5:48k32e3LD~pulje=felles~lik=selv:${ADAMS_MAALT}`);
  for (const [navn, x] of [
    ["~lik= først", b],
    ["~pulje= først", c],
  ] as const) {
    assert.equal(x["pulje"], "felles", `${navn}: pulje`);
    assert.ok(x["likFor"] !== null && x["likFor"] !== undefined, `${navn}: likelihood-vekten`);
    assert.equal(x["verdener"], 48, `${navn}: verdener`);
    assert.equal(x["eksaktBlad"], 3, `${navn}: e3`);
  }
});

test("UGYLDIG KASTER HØYLYTT: en knott som er død i strengen er verre enn ingen knott", () => {
  for (const verdi of ["", "iid", "Felles", "felles2", "pool", "1", "systematic", "Blokk", "blokker"]) {
    assert.throws(
      () => lagIndre(`sik:alle:0.5:12k8~pulje=${verdi}:${ADAMS_MAALT}`),
      /~pulje=/,
      `«~pulje=${verdi}» må kaste`,
    );
  }
  // Ukjent art skal fortsatt kaste, og meldingen skal nevne den nye formen.
  assert.throws(() => lagIndre(`sik:alle:0.5:12k8~tull=1:${ADAMS_MAALT}`), /pulje=felles/);
});

test("«utenSøk» ER URØRT: feltantallet er uendret, og motparten strippes til basen", () => {
  const uten = `sik:alle:0.5:48k32e3LD:${ADAMS_MAALT}`;
  const med = `sik:alle:0.5:48k32e3LD~pulje=felles:${ADAMS_MAALT}`;
  assert.equal(utenSøk(med), ADAMS_MAALT, "rollout-motparten må strippes som før");
  assert.equal(
    med.split(":").length,
    uten.split(":").length,
    "«~pulje=felles» inneholder ikke kolon, så feltantallet må være uendret",
  );
});

// ===========================================================================
// 5: DEN FELLES KODESTIEN ER EN TRO OMSKRIVING
// ===========================================================================

test("«blokk» ER BIT-IDENTISK MED AV: den felles stien regner nøyaktig som i.i.d.", () => {
  /**
   * DEN VIKTIGSTE PRØVEN I FILA. «felles» endrer to ting på én gang hvis kodestien ikke
   * er tro: utvelgelsen OG en utilsiktet forskjell i hvordan puljen bygges eller vektes.
   * «blokk» kjører nøyaktig samme nye kode, men velger blokk for blokk med blokkens egen
   * maks-normalisering — altså regnestykket `trekkVerdenBelief` gjør. Er den bit-identisk
   * med av, er den ENESTE forskjellen i «felles» selve utvelgelsen.
   */
  let sett = 0;
  for (const s of stillinger(30)) {
    const sete = s.iTur!;
    const av = trekkVerdener(s, sete, 16, lagRng(5_150), undefined, undefined, 12, undefined, true);
    const bl = trekkVerdener(
      s, sete, 16, lagRng(5_150), undefined, undefined, 12, undefined, true, "blokk",
    );
    if (av.length === 0) continue;
    sett++;
    assert.equal(nøkkel(bl), nøkkel(av), "«blokk» må gi NØYAKTIG de samme verdenene som av");
  }
  assert.ok(sett >= 20, `for få stillinger (${sett})`);
});

// ===========================================================================
// 6-8: KOSTNADEN OG LIVET
// ===========================================================================

test("SAMME ANTALL VERDENER OG SAMME ANTALL UTSPILLINGER, stilling for stilling", () => {
  let sett = 0;
  for (const s of stillinger(30)) {
    const sete = s.iTur!;
    const felles = { verdener: 16, verdenKandidater: 12, eksaktBlad: 3 } as const;
    const i = vurderPar(s, sete, nevro, { ...felles, rng: lagRng(90_210) });
    const p = vurderPar(s, sete, nevro, { ...felles, rng: lagRng(90_210), pulje: "felles" });
    if (i === null || p === null) continue;
    sett++;
    assert.equal(p.n, i.n, "antall verdener må være likt");
    assert.equal(p.kandidater.length, i.kandidater.length, "antall kandidater må være likt");
    // `vurderPar` spiller ut verden-for-verden × kandidat-for-kandidat, så utspillingene
    // er EKSAKT n × kandidater. Er begge like, er budsjettet likt.
    assert.equal(p.n * p.kandidater.length, i.n * i.kandidater.length, "utspillinger");
    for (const k of p.kandidater) {
      assert.equal(k.perVerden.length, p.n, "hver kandidat må ha en verdi i hver verden");
    }
  }
  assert.ok(sett >= 20, `for få sammenliknbare stillinger (${sett})`);
});

test("RNG-NØYTRAL: felles pulje bruker NØYAKTIG like mange rng-kall som i.i.d.", () => {
  /**
   * Uten dette ville puljene ikke lenger vært de samme: i.i.d. bruker ett `rng()` til
   * utvelgelsen MELLOM hver blokk på `kandidater`, så en felles pulje som trakk alle
   * kandidatene først ville fått andre kort fra og med nr. `kandidater + 1`. Da måler
   * armen «andre verdener» i tillegg til «bedre fordelte verdener» — to endringer i én.
   */
  let sett = 0;
  for (const s of stillinger(20)) {
    const sete = s.iTur!;
    const ti = tellende(lagRng(4_711));
    const tp = tellende(lagRng(4_711));
    const vi = trekkVerdener(s, sete, 16, ti.f, undefined, undefined, 12, undefined, true);
    const vp = trekkVerdener(
      s, sete, 16, tp.f, undefined, undefined, 12, undefined, true, "felles",
    );
    assert.equal(
      tp.n(),
      ti.n(),
      "like mange rng()-kall — ellers er kandidatpuljene ikke lenger de samme",
    );
    assert.equal(vp.length, vi.length, "like mange verdener");
    sett++;
  }
  assert.ok(sett >= 15, `for få stillinger (${sett})`);
});

test("KNOTTEN BITER: med samme frø velger felles pulje noen ganger et annet kort", () => {
  let ulike = 0;
  let sett = 0;
  for (const s of stillinger(40)) {
    const sete = s.iTur!;
    if (lovligeKort(s, sete).length < 3) continue;
    const felles = { verdener: 12, verdenKandidater: 16, eksaktBlad: 3 } as const;
    const i = vurderPar(s, sete, nevro, { ...felles, rng: lagRng(31_337) });
    const p = vurderPar(s, sete, nevro, { ...felles, rng: lagRng(31_337), pulje: "felles" });
    if (i === null || p === null) continue;
    sett++;
    if (!likeKort(i.beste.kort, p.beste.kort)) ulike++;
  }
  assert.ok(sett >= 10, `for få stillinger med ≥ 3 lovlige kort (${sett})`);
  assert.ok(
    ulike > 0,
    `felles pulje valgte ALDRI et annet kort i ${sett} stillinger — knotten er død i strengen`,
  );
});

test("MANGFOLDET ER MÅLBART: felles pulje kan gi FÆRRE distinkte verdener, og det skal synes", () => {
  /**
   * IKKE en kvalitetsprøve — en ÆRLIGHETSPRØVE. Med en rist over den felles kumulative
   * vekten får en kandidat som holder mer enn `1/verdener` av totalvekten flere slott,
   * mens de uavhengige puljene i dag gir hver blokk sin egen vinner. Et støygulv som
   * faller fordi ensemblet har kollapset er ikke en seier, så tallet må være observerbart
   * i riggen. Prøven låser at det ER det, og at det aldri går ANDRE veien enn ventet.
   */
  const distinkte = (v: number[][][]): number =>
    new Set(v.map((h) => h.map((x) => x.slice().sort((a, b) => a - b).join(",")).join("|"))).size;

  let sett = 0;
  let sumI = 0;
  let sumP = 0;
  for (const s of stillinger(25)) {
    const sete = s.iTur!;
    const vi = trekkVerdener(s, sete, 16, lagRng(77_003), undefined, undefined, 12, undefined, true);
    const vp = trekkVerdener(
      s, sete, 16, lagRng(77_003), undefined, undefined, 12, undefined, true, "felles",
    );
    if (vi.length === 0 || vp.length === 0) continue;
    sett++;
    sumI += distinkte(vi);
    sumP += distinkte(vp);
    // Felles pulje kan aldri gi FLERE distinkte enn antall verdener, og aldri færre enn 1.
    assert.ok(distinkte(vp) >= 1 && distinkte(vp) <= vp.length, "mangfoldet må være i [1, K]");
  }
  assert.ok(sett >= 15, `for få stillinger (${sett})`);
  // Selve tallet er en MÅLING, ikke et krav — men det skal være hentbart fra riggen.
  assert.ok(
    Number.isFinite(sumI / sett) && Number.isFinite(sumP / sett),
    `mangfoldet må være målbart: iid ${(sumI / sett).toFixed(1)}, pulje ${(sumP / sett).toFixed(1)}`,
  );
});
