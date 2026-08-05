/**
 * FLERE FORTSETTELSER — Brown & Sandholm (2019), tilpasset firespiller.
 *
 * Med ÉN rollout-policy antar evalueringen at motparten spiller nøyaktig slik.
 * Planen beskrev symptomet lenge før den navnga årsaken: «er modellen svakere
 * enn bordet, undervurderes systematisk de linjene som krever god oppfølging»
 * — og å bytte modell flyttet førersetet fra −0,357 til +0,896.
 *
 * `min` over fortsettelser er PARANOID-antakelsen fra flerspillersøk: alle
 * andre spiller det som skader oss mest. Sturtevants sammenlikning fant at
 * paranoid slår max^n i Hearts, altså i nettopp denne spillklassen.
 *
 * DEN VIKTIGSTE TESTEN ER DEN FØRSTE: én fortsettelse må gi BIT-IDENTISK
 * resultat med før. Ellers er dette en stille regresjon for hver eneste
 * eksisterende kaller.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { Konvensjonsvakt, lesVaktflagg } from "../src/moe2/konvensjonsvakt.ts";
import { vurderKortSD } from "../src/moe2/sdkort.ts";

function spillstilling(frø: number): GameState | null {
  const ag = [0, 1, 2, 3].map(() => new NevroAgent());
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    if (s.fase === "SPILL" && s.iTur !== null && s.stikkSpilt >= 2) return s;
    const iT = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iT === null || iT === undefined) break;
    s = utfør(s, ag[iT]!.velgHandling(s)).state;
  }
  return null;
}

const lagRng = (frø: number) => {
  let x = frø >>> 0;
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
};

test("ÉN fortsettelse er bit-identisk med den gamle formen", () => {
  let sjekket = 0;
  for (let d = 0; d < 8; d++) {
    const s = spillstilling(3_300_000 + d * 7717);
    if (s === null) continue;
    const m = new NevroAgent();
    const a = vurderKortSD(s, s.iTur!, m, { verdener: 6, rng: lagRng(99) });
    const b = vurderKortSD(s, s.iTur!, [m], { verdener: 6, rng: lagRng(99) });
    assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i++) {
      assert.equal(b[i]!.verdi, a[i]!.verdi, "listeformen endret verdien");
    }
    sjekket++;
  }
  assert.ok(sjekket >= 5, `for få stillinger (${sjekket})`);
});

/**
 * PARANOID ER ALDRI MER OPTIMISTISK. Legger vi til fortsettelser og tar
 * minimum, kan verdien bare falle eller stå stille – aldri stige. Det er
 * definisjonen, og den fanger en fortegnsfeil i kombinasjonen umiddelbart.
 */
test("min over flere fortsettelser er ALDRI hoeyere enn den foerste alene", () => {
  let sjekket = 0;
  let lavere = 0;
  for (let d = 0; d < 8; d++) {
    const s = spillstilling(4_400_000 + d * 7717);
    if (s === null) continue;
    const blueprint = new Konvensjonsvakt(new NevroAgent(), lesVaktflagg("abmp"));
    const variant = new Konvensjonsvakt(new NevroAgent(), lesVaktflagg("abmpd"));
    const en = vurderKortSD(s, s.iTur!, blueprint, { verdener: 6, rng: lagRng(7) });
    const to = vurderKortSD(s, s.iTur!, [blueprint, variant], { verdener: 6, rng: lagRng(7) });
    for (let i = 0; i < en.length; i++) {
      assert.ok(
        to[i]!.verdi <= en[i]!.verdi + 1e-9,
        `paranoid ga HOEYERE verdi (${to[i]!.verdi} > ${en[i]!.verdi})`,
      );
      if (to[i]!.verdi < en[i]!.verdi - 1e-9) lavere++;
    }
    sjekket++;
  }
  assert.ok(sjekket >= 5, `for få stillinger (${sjekket})`);
  // Er den ALDRI lavere, gjoer den andre fortsettelsen ingenting - og da er
  // hele konstruksjonen en dyr null.
  assert.ok(lavere > 0, "den andre fortsettelsen endret aldri noen verdi");
});

test("snitt-kombinasjonen ligger mellom den laveste og hoeyeste fortsettelsen", () => {
  const s = spillstilling(5_500_000);
  assert.ok(s !== null);
  const a = new Konvensjonsvakt(new NevroAgent(), lesVaktflagg("abmp"));
  const b = new Konvensjonsvakt(new NevroAgent(), lesVaktflagg("abmpd"));
  const va = vurderKortSD(s, s.iTur!, a, { verdener: 6, rng: lagRng(11) });
  const vb = vurderKortSD(s, s.iTur!, b, { verdener: 6, rng: lagRng(11) });
  const sn = vurderKortSD(s, s.iTur!, [a, b], { verdener: 6, rng: lagRng(11), fortsKombi: "snitt" });
  for (let i = 0; i < va.length; i++) {
    const lo = Math.min(va[i]!.verdi, vb[i]!.verdi);
    const hi = Math.max(va[i]!.verdi, vb[i]!.verdi);
    assert.ok(sn[i]!.verdi >= lo - 1e-9 && sn[i]!.verdi <= hi + 1e-9);
  }
});
