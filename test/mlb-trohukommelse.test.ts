/**
 * HUKOMMELSEN SOM INNGANG TIL TROEN (K6 → K8, 11. september).
 *
 * Trosnettet gjettet om motstanderne uten å vite HVEM de var, og troen er
 * motstanderspesifikk (§119). Hukommelsen legges bakerst i trotrekkene. Tre ting må
 * holde, og alle tre er prøvd her:
 *
 *   1. OPPSETTET: de første 660 er `troTrekk` uendret, halen er hukommelsen.
 *   2. NULLPUNKTET: et nett utvidet med nullkolonner gir NØYAKTIG samme fordeling —
 *      og samme `byggTrekk` — som nettet det ble utvidet fra. Da kan R2 starte fra
 *      dagens trosnett uten at ett eneste valg flytter seg før nettet har lært noe.
 *   3. FELLA: én vekt ulik null i en hukommelseskolonne SKAL endre fordelingen. Uten
 *      den halvdelen ville «identisk» like gjerne betydd «hukommelsen når aldri fram».
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { spillerVisning, type SpillerVisning } from "../src/motor.ts";
import { lagIndre, ADAMS_MAALT } from "../src/moe2/agentspek.ts";
import { HUKOMMELSE_LENGDE_4, Hukommelse } from "../src/mlb/hukommelse.ts";
import { byggTrekk } from "../src/mlb/trekk.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import {
  MLB_TRO_HUKOMMELSE,
  MLB_TRO_INN,
  MLB_TRO_INN_H,
  troTrekk,
  troTrekkMedHukommelse,
} from "../src/mlb/trotrekk.ts";
import { nettFraBytes, type NevroNett } from "../src/nevro/nett.ts";

const TROSTI = fileURLToPath(new URL("../e1-modell/mlb-tro.bin", import.meta.url));

interface Stilling {
  readonly s: GameState;
  readonly v: SpillerVisning;
  readonly huk: Float64Array;
}

/** Kortvalg fra runde 2 og utover i Adams-kamper, med hukommelsen slik den sto. */
const STILLINGER: Stilling[] = (() => {
  const ut: Stilling[] = [];
  for (const frø of [7_330_101, 7_330_202]) {
    const huk = new Hukommelse();
    const drivere = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
    let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, frø);
    let vakt = 0;
    while (s.fase !== "FERDIG" && vakt++ < 8000 && ut.length < 60) {
      huk.observer(s);
      if (s.fase === "RUNDE_SLUTT") {
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (sete === null || sete === undefined) break;
      if (s.fase === "SPILL" && s.rundeNr >= 2 && vakt % 7 === 0) {
        ut.push({ s, v: spillerVisning(s, sete), huk: huk.vektor(sete, 4) });
      }
      s = utfør(s, drivere[sete]!.velgHandling(s)).state;
    }
  }
  return ut;
})();

/** Første lag utvidet med `ekstra` nullkolonner bakerst. */
const utvidet = (nett: NevroNett, ekstra: number): NevroNett => {
  const [første, ...resten] = nett.lag;
  const inn = første!.inn + ekstra;
  const vekter = new Float32Array(første!.ut * inn);
  for (let r = 0; r < første!.ut; r++) {
    for (let c = 0; c < første!.inn; c++) vekter[r * inn + c] = første!.vekter[r * første!.inn + c]!;
  }
  return { lag: [{ inn, ut: første!.ut, vekter, bias: første!.bias }, ...resten] };
};

test("bredden på hukommelsen i troen er den hukommelsen faktisk har", () => {
  assert.equal(MLB_TRO_HUKOMMELSE, HUKOMMELSE_LENGDE_4);
  assert.equal(MLB_TRO_INN_H, MLB_TRO_INN + HUKOMMELSE_LENGDE_4);
});

test("oppsettet: troTrekk først, hukommelsen bakerst, null gir nullblokk", () => {
  assert.ok(STILLINGER.length >= 20, `bare ${STILLINGER.length} stillinger`);
  let ikkeTom = 0;
  for (const { s, v, huk } of STILLINGER) {
    const gammel = troTrekk(v, s.giving.antallStikk, 100);
    const ny = troTrekkMedHukommelse(v, s.giving.antallStikk, 100, huk);
    assert.equal(ny.length, MLB_TRO_INN_H);
    assert.deepEqual([...ny.subarray(0, MLB_TRO_INN)], [...gammel]);
    assert.deepEqual([...ny.subarray(MLB_TRO_INN)], [...Float32Array.from(huk)]);
    if (huk.some((x) => x !== 0)) ikkeTom++;
    const tom = troTrekkMedHukommelse(v, s.giving.antallStikk, 100, null);
    assert.ok(tom.subarray(MLB_TRO_INN).every((x) => x === 0));
  }
  assert.ok(ikkeTom > 10, `hukommelsen var tom i nesten alle stillinger (${ikkeTom}) — prøven ser ingenting`);
});

test("nullpunktet: et nett utvidet med nullkolonner gir nøyaktig samme fordeling og samme byggTrekk", () => {
  const rå = nettFraBytes(readFileSync(TROSTI))[0]!;
  const gammel = new MlbTronett(rå);
  const ny = new MlbTronett(utvidet(rå, MLB_TRO_HUKOMMELSE));
  assert.equal(gammel.brukerHukommelse, false);
  assert.equal(ny.brukerHukommelse, true);
  for (const { s, v, huk } of STILLINGER.slice(0, 25)) {
    const pg = gammel.fordeling(gammel.trekkFor(v, s.giving.antallStikk, 100, huk));
    const pn = ny.fordeling(ny.trekkFor(v, s.giving.antallStikk, 100, huk));
    assert.deepEqual(pn, pg);
    const kontekst = { regler: s.regler, giving: s.giving, hukommelse: huk };
    const bg = byggTrekk(v, { ...kontekst, tronett: gammel });
    const bn = byggTrekk(v, { ...kontekst, tronett: ny });
    assert.deepEqual([...bn], [...bg]);
  }
});

test("fella: én vekt ulik null i en hukommelseskolonne endrer troen", () => {
  const rå = nettFraBytes(readFileSync(TROSTI))[0]!;
  const gammel = new MlbTronett(rå);
  const plantet = utvidet(rå, MLB_TRO_HUKOMMELSE);
  const første = plantet.lag[0]!;
  // Én kolonne i hukommelsesblokken, sterkt koblet til hver skjult enhet.
  for (let r = 0; r < første.ut; r++) første.vekter[r * første.inn + MLB_TRO_INN + 5] = 3;
  const ny = new MlbTronett(plantet);
  let endret = 0;
  for (const { s, v, huk } of STILLINGER) {
    if (huk[5] === 0) continue;
    const pg = gammel.fordeling(gammel.trekkFor(v, s.giving.antallStikk, 100, huk));
    const pn = ny.fordeling(ny.trekkFor(v, s.giving.antallStikk, 100, huk));
    if (JSON.stringify(pg) !== JSON.stringify(pn)) endret++;
  }
  assert.ok(endret > 0, "en koblet hukommelseskolonne endret ingen tro — hukommelsen når ikke fram");
});

test("en annen bredde enn 660 eller 804 avvises", () => {
  const rå = nettFraBytes(readFileSync(TROSTI))[0]!;
  assert.throws(() => new MlbTronett(utvidet(rå, 40)), /660|804/);
});
