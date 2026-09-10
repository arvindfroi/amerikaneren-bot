/**
 * KOLONNEKJERNEN: raskere, IKKE bit-identisk — og derfor av som standard.
 *
 * `src/nevro/nett-kolonne.ts` summerer i en annen rekkefølge enn `forover`. Den
 * er for TRENINGSDATA alene (`--rask-kjerne`); all måling skal bruke den
 * bit-identiske stien. Tre ting holdes fast her, og hver av dem kan feile:
 *
 *   1. STANDARDEN ER URØRT. Uten bryteren er `framover` bit for bit den samme
 *      kjeden av `forover`-kall som før. Ellers har en fartsendring flyttet
 *      måleverktøyene uten at noen ba om det.
 *   2. BRYTEREN FYRER. Med den på skal minst én bit være ulik over ekte
 *      trekkvektorer. En bryter som ikke endrer noe ville gjort fartstallet
 *      til en måling av ingenting — prosjektets gjentatte feil med kode som
 *      finnes uten å kjøre.
 *   3. AVVIKET ER STØY. Små absolutte avvik, og samme valg: samme argmaks på
 *      policyen og samme trofordeling til praktisk talt alle desimaler.
 *
 * Trekkvektorene er EKTE, fanget fra et selvspill med et tilfeldig sandkassenett
 * og det sporede trohodet `e1-modell/mlb-tro.bin`.
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { Sandkassenett } from "../src/mlb/nett.ts";
import { spillKamp, type Sete } from "../src/mlb/selvspill.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import { forover, type NevroNett } from "../src/nevro/nett.ts";
import type { Framover } from "../src/mlb/nett.ts";

const FRØ_NETT = 7_310_001;
const TROSTI = "e1-modell/mlb-tro.bin";

/** Fanger inngangene til begge nettene fra ekte kamper. */
function fang(antall: number): { nett: Float32Array[]; tro: Float32Array[] } {
  const ekte = Sandkassenett.tilfeldig(FRØ_NETT);
  const trohode = MlbTronett.fraBytes(readFileSync(TROSTI));
  const nett: Float32Array[] = [];
  const tro: Float32Array[] = [];
  const fanger = {
    framover(x: Float32Array): Framover {
      if (nett.length < antall) nett.push(Float32Array.from(x));
      return ekte.framover(x);
    },
  };
  const trofanger = {
    fordeling(x: Float32Array): number[][] {
      if (tro.length < antall) tro.push(Float32Array.from(x));
      return trohode.fordeling(x);
    },
  };
  const seter: Sete[] = [0, 1, 2, 3].map((i) => ({ navn: `t${i}`, nett: fanger, temperatur: 1 }));
  let frø = 9_100_001;
  while (nett.length < antall || tro.length < antall) {
    spillKamp({ frø: frø++, seter, målPoeng: 30, maksRunder: 3, tronett: trofanger, samleTrekk: false });
    assert.ok(frø < 9_100_050, "fikk ikke fanget nok trekkvektorer på 50 kamper");
  }
  return { nett, tro };
}

const fanget = fang(250);

test("1. uten bryteren er framover bit for bit den samme forover-kjeden som før", () => {
  const n = Sandkassenett.tilfeldig(FRØ_NETT);
  assert.equal(n.kjerne, "rad");
  const del = n as unknown as { stamme: NevroNett; policyHode: NevroNett; troHode: NevroNett };
  for (const x of fanget.nett.slice(0, 60)) {
    const h = forover(del.stamme, x);
    for (let i = 0; i < h.length; i++) if (h[i]! < 0) h[i] = 0;
    const fasitPolicy = forover(del.policyHode, h);
    const fasitTro = forover(del.troHode, h);
    const ut = n.framover(x);
    for (let i = 0; i < fasitPolicy.length; i++) {
      assert.ok(Object.is(ut.policy[i], fasitPolicy[i]), `policy[${i}] ${ut.policy[i]} ≠ ${fasitPolicy[i]}`);
    }
    for (let i = 0; i < fasitTro.length; i++) {
      assert.ok(Object.is(ut.tro[i], fasitTro[i]), `tro[${i}] ${ut.tro[i]} ≠ ${fasitTro[i]}`);
    }
  }
});

test("2+3. sandkassenettet: bryteren fyrer, avviket er støy, argmaks er lik", () => {
  const rad = Sandkassenett.tilfeldig(FRØ_NETT);
  const kol = Sandkassenett.tilfeldig(FRØ_NETT).brukKolonnekjerne();
  assert.equal(kol.kjerne, "kolonne");
  let ulikeBiter = 0;
  let maksRel = 0;
  let likArgmaks = 0;
  for (const x of fanget.nett) {
    const a = rad.framover(x);
    const b = kol.framover(x);
    const par: [ArrayLike<number>, ArrayLike<number>][] = [
      [a.policy, b.policy], [a.tro, b.tro], [a.stikk ?? [], b.stikk ?? []],
      [a.verdiKvantil ?? [], b.verdiKvantil ?? []], [[a.verdi], [b.verdi]],
    ];
    for (const [p, q] of par) {
      assert.equal(p.length, q.length);
      for (let i = 0; i < p.length; i++) {
        if (!Object.is(p[i], q[i])) ulikeBiter++;
        maksRel = Math.max(maksRel, Math.abs(p[i]! - q[i]!) / Math.max(1, Math.abs(p[i]!)));
      }
    }
    let ia = 0;
    let ib = 0;
    for (let i = 1; i < a.policy.length; i++) {
      if (a.policy[i]! > a.policy[ia]!) ia = i;
      if (b.policy[i]! > b.policy[ib]!) ib = i;
    }
    if (ia === ib) likArgmaks++;
  }
  assert.ok(ulikeBiter > 0, "bryteren endret ikke en eneste bit — den fyrer ikke");
  assert.ok(maksRel < 1e-5, `relativt avvik ${maksRel} er mer enn numerisk støy`);
  assert.ok(likArgmaks / fanget.nett.length >= 0.99, `argmaks lik i bare ${likArgmaks}/${fanget.nett.length}`);
});

test("2+3. trohodet: bryteren fyrer, fordelingene er like til støy", () => {
  const rad = MlbTronett.fraBytes(readFileSync(TROSTI));
  const kol = MlbTronett.fraBytes(readFileSync(TROSTI)).brukKolonnekjerne();
  assert.equal(rad.kjerne, "rad");
  assert.equal(kol.kjerne, "kolonne");
  let ulike = 0;
  let maks = 0;
  for (const x of fanget.tro) {
    const p = rad.fordeling(x);
    const q = kol.fordeling(x);
    for (let k = 0; k < p.length; k++) {
      for (let c = 0; c < p[k]!.length; c++) {
        if (!Object.is(p[k]![c], q[k]![c])) ulike++;
        maks = Math.max(maks, Math.abs(p[k]![c]! - q[k]![c]!));
      }
    }
  }
  assert.ok(ulike > 0, "bryteren endret ikke en eneste sannsynlighet — den fyrer ikke");
  assert.ok(maks < 1e-5, `maks avvik i sannsynlighet ${maks} er mer enn numerisk støy`);
});
