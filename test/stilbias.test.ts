/**
 * STILBIAS — de tre egenskapene den gamle detektoren manglet.
 *
 * ARVIND: «hvis det du prøvde på ikke funket så må du bygge noe nytt som
 * funker. Få K4 på plass først sammen med K8.»
 *
 * `Økt.aggressivitet` målte rå atferd og feilet på alle tre punktene under
 * (§108). Denne fila håndhever dem, så en ny variant ikke kan skli tilbake.
 *
 *   1. NULLPUNKTET ER NULL      fire identiske agenter skal ikke flagges
 *   2. VANEN BLIR FUNNET        en stilisert trumftrekker skal flagges
 *   3. LÆRINGEN ER TROFAST      det som læres ved rundeslutt må være nøyaktig
 *                               det som skjedde
 *
 * Punkt 3 er den som fanget mest. Rekonstruksjonen tok fire forsøk å få
 * riktig, og hver feil var stum:
 *
 *     fase arvet «RUNDE_SLUTT»       lovligeKort ga tom liste => null residualer
 *     historikk aldri bygget opp     nettet så en tom fortid i hvert valg
 *     pris-sortering ikke total      to farger med samme valør byttet rang
 *     tellerne arvet fra slutten     makkeren røpet fra første kort, og
 *                                    stikkVunnet sto på fasit hele runden
 *
 * Ingen av dem ville krasjet. Alle fire ville gitt en hukommelse som lærte av
 * en runde ingen spilte — prosjektets mest gjentatte feilklasse.
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { opprettSpill, utfør } from "../src/index.ts";
import type { GameState } from "../src/motor.ts";
import { forover, nettFraBytes } from "../src/nevro/nett.ts";
import { e1SpillTrekk } from "../src/e1/trekk.ts";
import { ADAMS_MAALT, lagIndre } from "../src/moe2/agentspek.ts";
import { lagTrumftrekker } from "../examples/k6-vaner.ts";
import {
  leggTil,
  residual,
  rundensResidualer,
  snitt,
  stilForskjell,
  TOMT_BIAS,
  type Biasanslag,
} from "../src/moe2/stilbias.ts";

const nett = nettFraBytes(new Uint8Array(readFileSync("e1-modell/d7alle.bin")))[0]!;
const atferd = {
  logits: (s: GameState, p: number): Float32Array => forover(nett, e1SpillTrekk(s, p, nett.lag[0]!.inn)),
};

/** Spiller `runder` runder og samler residualene live, per sete. */
function spill(medVane: boolean, frø: number, runder: number): {
  bias: Biasanslag[];
  avvikMotRekonstruksjon: number;
  par: number;
} {
  const bias: Biasanslag[] = [TOMT_BIAS, TOMT_BIAS, TOMT_BIAS, TOMT_BIAS];
  const ag = [0, 1, 2, 3].map((p) =>
    medVane && p === 1 ? lagTrumftrekker(ADAMS_MAALT) : lagIndre(ADAMS_MAALT),
  );
  for (const a of ag) a.nyKamp();

  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  let r = 0;
  let live = new Map<number, number[]>();
  let poengFør: readonly number[] = [0, 0, 0, 0];
  let avvik = 0;
  let par = 0;

  while (s.fase !== "FERDIG" && vakt++ < 60_000 && r < runder) {
    if (s.fase === "RUNDE_SLUTT") {
      // ORAKELET: det rekonstruerte må være identisk med det live-utregnede.
      const rek = rundensResidualer(s, atferd, poengFør);
      for (const [sete, liste] of live) {
        const b = rek.get(sete) ?? [];
        if (b.length !== liste.length) {
          avvik += Math.abs(b.length - liste.length);
          continue;
        }
        for (let i = 0; i < liste.length; i++) {
          par++;
          if (Math.abs(liste[i]! - b[i]!) > 1e-9) avvik++;
        }
      }
      live = new Map();
      r++;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    if (s.fase === "SPILL" && s.stikkSpilt === 0 && s.bord.length === 0) poengFør = s.totalPoeng;
    const h = ag[iTur]!.velgHandling(s);
    if (h.type === "SPILL" && s.fase === "SPILL") {
      const res = residual(s, iTur, h.kort, atferd);
      if (res !== null) {
        bias[iTur] = leggTil(bias[iTur]!, res);
        const l = live.get(iTur) ?? [];
        l.push(res);
        live.set(iTur, l);
      }
    }
    s = utfør(s, h).state;
  }
  return { bias, avvikMotRekonstruksjon: avvik, par };
}

const flagget = (bias: Biasanslag[]): boolean[] =>
  bias.map((b, p) => stilForskjell(b, bias.filter((_, q) => q !== p)).sikker);

test("laeringen er trofast: rekonstruksjonen ved rundeslutt er EKSAKT lik live", () => {
  const { avvikMotRekonstruksjon, par } = spill(true, 77_000_011, 8);
  assert.ok(par > 200, `for faa residualpar sammenlignet (${par}) - testen beviser lite`);
  assert.equal(
    avvikMotRekonstruksjon,
    0,
    `${avvikMotRekonstruksjon} av ${par} residualer avvek. Da laerer hukommelsen av en ` +
      `runde som ikke ble spilt, og det er stumt - ingenting krasjer.`,
  );
});

test("nullpunktet er null: fire IDENTISKE agenter flagges ikke", () => {
  const { bias } = spill(false, 77_000_011, 16);
  for (const b of bias) {
    assert.ok(b.n >= 60, `for faa observasjoner (${b.n}) - hele poenget er at de er mange`);
  }
  const f = flagget(bias);
  assert.equal(
    f.filter(Boolean).length,
    0,
    `${f.filter(Boolean).length} av 4 identiske agenter ble flagget som saeregne. ` +
      `Den gamle detektoren gjorde nettopp dette - et normalt sete fyrte som «passiv».`,
  );
});

test("vanen blir funnet: trumftrekkeren flagges, og bare han", () => {
  const { bias } = spill(true, 77_000_011, 16);
  const f = flagget(bias);
  assert.equal(f[1], true, "den stiliserte trumftrekkeren ble ikke funnet");
  assert.ok(
    snitt(bias[1]!) > 0,
    `trumftrekkeren ble lest som ${snitt(bias[1]!).toFixed(3)} - han spiller HOEYERE enn ` +
      `nettet forventer, saa fortegnet skal vaere positivt`,
  );
  const falske = [0, 2, 3].filter((p) => f[p]).length;
  assert.equal(
    falske,
    0,
    `${falske} normale seter ble ogsaa flagget. Referansen maa vaere medianspilleren, ` +
      `ellers drar én uteligger nullpunktet og gjoer alle de andre «saeregne».`,
  );
});
