/**
 * ADAPTIV BUDSJETTERING (`~fordel=halv`, 14. sep) — knotten, og at «av er av».
 *
 * Rotårsaken er målt (`D:\amb-grp\loop\troledd.md` §3a): søkets valgte kort skifter i
 * 43,8 % av beslutningene BARE av å trekke nye verdener med samme tro. Kuren som prøves
 * her er å fordele DE SAMME utspillingene adaptivt i stedet for jevnt.
 *
 * Åtte ting må holde, og de er valgt etter hva som har gått galt før i dette prosjektet:
 *
 *   1. AV ER AV, STRUKTURELT — uten feltet er `fordeling` null, ikke «jevn».
 *   2. INGEN KOLLISJON — `~fordel=` er strippet før D/M/L/s/a/e/k leses.
 *   3. UGYLDIG KASTER — en form som ikke finnes skal ikke bli en stille jevn fordeling.
 *   4. `utenSøk` URØRT — rollout-motparten strippes som før.
 *   5. BUDSJETTET HOLDER — halveringen bruker ALDRI flere utspillinger enn den jevne.
 *   6. PARRINGEN HOLDER — finalistene deler hver eneste verden.
 *   7. k = 2 ER BIT-IDENTISK — én runde over hele budsjettet ER den jevne fordelingen.
 *   8. KNOTTEN BITER — den er ikke død i strengen, slik `12k16d4` en gang var.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { opprettSpill, utfør } from "../src/index.ts";
import { lovligeKort, type GameState } from "../src/motor.ts";
import { lagRng } from "../src/kort.ts";
import { lagIndre, utenSøk, ADAMS } from "../src/moe2/agentspek.ts";
import { type Utspiller } from "../src/moe2/sdkort.ts";
import { vurderPar } from "../src/moe2/sdpar.ts";
import { visningsfrø } from "../src/moe2/sikkerorakel.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import { MlbSøketro } from "../src/moe2/soketro.ts";

const motpart = lagIndre(ADAMS) as unknown as Utspiller;
const TRO = MlbTronett.fraBytes(readFileSync("e1-modell/mlb-tro.bin"));

/** Kortvalg med minst to lovlige kort fra noen Adams-giv. Samme mønster som `sik-tro.test.ts`. */
const STILLINGER: GameState[] = (() => {
  const ut: GameState[] = [];
  const agenter = [0, 1, 2, 3].map(() => lagIndre(ADAMS));
  for (const frø of [6_140_901, 6_140_902, 6_140_903, 6_140_904]) {
    let s = opprettSpill({ antallSpillere: 4 }, frø);
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
      const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (sete === null || sete === undefined) break;
      if (s.fase === "SPILL" && s.iTur !== null && lovligeKort(s, s.iTur).length >= 2) ut.push(s);
      s = utfør(s, agenter[sete]!.velgHandling(s)).state;
    }
  }
  return ut;
})();

const FRØ = 20_260_804;
const felles = { verdenKandidater: 32, verdener: 8 } as const;
const strøm = (s: GameState, sete: number): (() => number) => lagRng(visningsfrø(s, sete, FRØ));

test("stillingene finnes", () => {
  assert.ok(STILLINGER.length >= 40, `bare ${STILLINGER.length} stillinger`);
});

// ---------------------------------------------------------------- 1. AV ER AV
test("AV ER AV: uten «~fordel=» er fordeling null, ikke «jevn»", () => {
  const uten = lagIndre(`sik:alle:0.5:12k32e3LD:${ADAMS}`) as unknown as { fordeling: unknown };
  assert.equal(uten.fordeling, null, "porten skal ikke finnes uten feltet");
  const med = lagIndre(`sik:alle:0.5:12k32e3LD~fordel=halv:${ADAMS}`) as unknown as { fordeling: unknown };
  assert.equal(med.fordeling, "halv", "knotten skal være koblet, ikke bare stå i strengen");
});

// ------------------------------------------------------------ 2. INGEN KOLLISJON
test("INGEN KOLLISJON: «~fordel=» er strippet før D/L/e/k leses, i begge rekkefølger", () => {
  for (const felt of [
    `12k32e3LD~fordel=halv`,
    `12k32e3LD~fordel=halv~mlbu=e1-modell/mlb-tro.bin`,
    `12k32e3LD~mlbu=e1-modell/mlb-tro.bin~fordel=halv`,
  ]) {
    const a = lagIndre(`sik:alle:0.5:${felt}:${ADAMS}`) as unknown as {
      fordeling: unknown;
      eksaktBlad: unknown;
      lagmål: unknown;
      visningsfrø: unknown;
      verdenKandidater: unknown;
      verdener: unknown;
    };
    assert.equal(a.fordeling, "halv", felt);
    assert.equal(a.eksaktBlad, 3, `e3 skal overleve «${felt}»`);
    assert.equal(a.lagmål, true, `L skal overleve «${felt}»`);
    assert.equal(a.visningsfrø, true, `D skal overleve «${felt}»`);
    assert.equal(a.verdenKandidater, 32, `k32 skal overleve «${felt}»`);
    assert.equal(a.verdener, 12, `verdenstallet skal overleve «${felt}»`);
  }
});

// -------------------------------------------------------------- 3. UGYLDIG KASTER
test("UGYLDIG KASTER: en form som ikke finnes blir ikke en stille jevn fordeling", () => {
  for (const v of ["", "jevn", "ucb", "Halv", "halv2", "halvering"]) {
    assert.throws(
      () => lagIndre(`sik:alle:0.5:12k32e3LD~fordel=${v}:${ADAMS}`),
      /fordel|~-felt/,
      `«~fordel=${v}» skulle kastet`,
    );
  }
});

// --------------------------------------------------------------- 4. utenSøk URØRT
test("utenSøk er urørt: feltantallet er uendret, motparten strippes som før", () => {
  const med = `sik:alle:0.5:12k32e3LD~fordel=halv:${ADAMS}`;
  const uten = `sik:alle:0.5:12k32e3LD:${ADAMS}`;
  assert.equal(utenSøk(med), ADAMS);
  assert.equal(utenSøk(uten), ADAMS);
  assert.equal(med.split(":").length, uten.split(":").length, "«~fordel=» inneholder ingen kolon");
});

// ------------------------------------------------------------- 5./6./7./8. MÅLT
test("BUDSJETTET: halveringen bruker aldri flere utspillinger enn den jevne", () => {
  let sjekket = 0;
  for (const s of STILLINGER.slice(0, 60)) {
    const sete = s.iTur!;
    const k = lovligeKort(s, sete).length;
    const jevn = vurderPar(s, sete, motpart, { ...felles, rng: strøm(s, sete) });
    const halv = vurderPar(s, sete, motpart, { ...felles, rng: strøm(s, sete), fordeling: "halv" });
    if (jevn === null || halv === null) continue;
    sjekket++;
    assert.ok(
      halv.utspillinger <= jevn.utspillinger,
      `k=${k}: halv brukte ${halv.utspillinger} mot jevn ${jevn.utspillinger}`,
    );
    /**
     * Og den skal bruke NESTEN alt: resten som blir stående er mindre enn én hel verden
     * for de levende kandidatene, altså < k. Uten den nedre grensen kunne omfordelingen
     * ha «virket» ved i stillhet å søke mindre — nøyaktig felleklassen `12k16d4` var.
     */
    assert.ok(
      halv.utspillinger > jevn.utspillinger - k,
      `k=${k}: halv brukte bare ${halv.utspillinger} av ${jevn.utspillinger} — budsjett lekker`,
    );
  }
  assert.ok(sjekket >= 40, `bare ${sjekket} stillinger vurdert`);
});

test("PARRINGEN: finalistene deler hver eneste verden", () => {
  let sjekket = 0;
  for (const s of STILLINGER.slice(0, 60)) {
    const sete = s.iTur!;
    const halv = vurderPar(s, sete, motpart, { ...felles, rng: strøm(s, sete), fordeling: "halv" });
    if (halv === null || halv.nestBeste === null) continue;
    sjekket++;
    assert.equal(
      halv.beste.perVerden.length,
      halv.nestBeste.perVerden.length,
      "marginen ville vært uparret",
    );
    assert.equal(halv.n, halv.beste.perVerden.length);
    // Budsjettet er FLYTTET dit: finalistene skal ha sett flere verdener enn K.
    if (lovligeKort(s, sete).length >= 3) {
      assert.ok(halv.n > felles.verdener, `finalistene fikk bare ${halv.n} verdener av ${felles.verdener}`);
    }
  }
  assert.ok(sjekket >= 40, `bare ${sjekket} stillinger vurdert`);
});

test("k = 2: halveringen ER den jevne fordelingen, verdi for verdi", () => {
  let sjekket = 0;
  for (const s of STILLINGER) {
    const sete = s.iTur!;
    if (lovligeKort(s, sete).length !== 2) continue;
    const jevn = vurderPar(s, sete, motpart, { ...felles, rng: strøm(s, sete) });
    const halv = vurderPar(s, sete, motpart, { ...felles, rng: strøm(s, sete), fordeling: "halv" });
    if (jevn === null || halv === null) continue;
    sjekket++;
    assert.equal(halv.n, jevn.n);
    assert.equal(halv.utspillinger, jevn.utspillinger);
    assert.equal(halv.sigma, jevn.sigma);
    for (const [i, k] of jevn.kandidater.entries()) {
      assert.deepEqual([...halv.kandidater[i]!.perVerden], [...k.perVerden], "samme verdener, samme verdier");
    }
  }
  assert.ok(sjekket >= 3, `bare ${sjekket} stillinger med to lovlige kort`);
});

test("KNOTTEN BITER: med tre eller flere kandidater velger den noen ganger annerledes", () => {
  let flere = 0;
  let ulike = 0;
  const tro = new MlbSøketro(TRO);
  for (const s of STILLINGER) {
    const sete = s.iTur!;
    if (lovligeKort(s, sete).length < 3) continue;
    flere++;
    const trovekt = tro.vektFor(s, sete) ?? undefined;
    const o = { ...felles, trovekt, budvekt: false };
    const jevn = vurderPar(s, sete, motpart, { ...o, rng: strøm(s, sete) });
    const halv = vurderPar(s, sete, motpart, { ...o, rng: strøm(s, sete), fordeling: "halv" });
    if (jevn === null || halv === null) continue;
    if (jevn.beste.kort.farge !== halv.beste.kort.farge || jevn.beste.kort.verdi !== halv.beste.kort.verdi) ulike++;
  }
  assert.ok(flere >= 20, `bare ${flere} stillinger med tre eller flere kandidater`);
  assert.ok(ulike > 0, "halveringen valgte aldri annerledes - knotten er død i strengen");
});
