/**
 * ALPHA-MU VELGER DE SAMME KORTENE SOM FØR — M=1 OG M=2.
 *
 * `test/nett-glissen.test.ts` viser at den glissne framoverpasseringen gir
 * samme tall som den tette. Denne viser at det holder HELE VEIEN UT: gjennom
 * verdenstrekningen, rolloutene, Pareto-fronten, racescoren og uleseligheten,
 * fram til kortet som legges på bordet.
 *
 * ================= HVORFOR DEN MÅTTE VÆRE EN FASITLISTE =================
 *
 * En test kan ikke sammenlikne mot kode som ikke finnes lenger. Listene under
 * er derfor MÅLT 8. august med den tette `forover`-en, før endringen, og limt
 * inn her. De er den eneste formen for bevis som overlever at den gamle koden
 * blir borte.
 *
 * Fasitene ble tatt med SEKS verdener og fire kandidater, ikke Adams' 12k16.
 * Det er et bevisst bytte: koden som skal beskyttes er den samme, og en
 * enhetstest som tar et halvt minutt blir slått av. Selve kostnadsmålingen
 * bruker den ekte speken — se `examples/amu-kostnad.ts`.
 *
 * ================= HVA SOM FÅR DENNE TIL Å FEILE ========================
 *
 * Enhver endring i søket, i nettet, i verdenstrekningen eller i motoren som
 * flytter ett eneste kortvalg. Det er meningen. Flyttes et valg med vilje, er
 * det en NY BOT og skal måles på nytt — da skal fasiten skrives om i samme
 * commit som endringen, med målingen ved siden av.
 *
 * `e1-modell/*`-filene er derfor også en del av fasiten. Byttes nettet, feiler
 * denne, og det er riktig: da er det ikke lenger samme bot.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeKort } from "../src/motor.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { rolleFor } from "../src/moe2/rolleorakel.ts";
import { NevroAgent } from "../src/nevro/index.ts";

const spek = (m: number): string =>
  "okt:vr:e1-modell/vrakrang.bin:telrd:" +
  `amu:foerer:6k4sm${m}e0.25r1.5:` +
  "profil:budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:e1:e1-modell/d7alle.bin";

/**
 * Spiller fram til `stillinger` FØRERBESLUTNINGER med mer enn ett lovlig kort,
 * og gir kortene som ble valgt.
 *
 * Spillet drives av faste `NevroAgent`-er og ikke av boten selv. Da avhenger
 * stillingene bare av frøet, så to armer med ulik `M` — eller samme arm før og
 * etter en kodeendring — møter nøyaktig de samme stillingene.
 */
function valg(m: number, stillinger: number, frø: number): string[] {
  const bot = lagIndre(spek(m));
  const ref = [0, 1, 2, 3].map(() => new NevroAgent());
  const ut: string[] = [];
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  while (ut.length < stillinger && s.fase !== "FERDIG" && vakt++ < 20_000) {
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iT = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iT === null || iT === undefined) break;
    if (s.fase === "SPILL" && rolleFor(s, iT) === "foerer" && lovligeKort(s, iT).length > 1) {
      const h = bot.velgHandling(s);
      ut.push(h.type === "SPILL" ? `${h.kort.farge}${h.kort.verdi}` : h.type);
    }
    s = utfør(s, ref[iT]!.velgHandling(s)).state;
  }
  return ut;
}

/** Målt 8. august 2026 med den TETTE `forover`. Ikke rediger uten en måling. */
const FASIT: Record<string, { m: number; n: number; frø: number; kort: string[] }> = {
  "M=1, froe 987654": {
    m: 1,
    n: 12,
    frø: 987654,
    kort: ["K10", "H6", "K2", "K4", "K8", "H11", "K8", "K4", "K4", "K4", "K4", "K6"],
  },
  "M=2, froe 987654": {
    m: 2,
    n: 8,
    frø: 987654,
    kort: ["K10", "H12", "K2", "K10", "K8", "H6", "H11", "K4"],
  },
  "M=1, froe 4242": {
    m: 1,
    n: 8,
    frø: 4242,
    kort: ["K6", "R12", "K11", "K11", "R10", "R12", "K11", "K11"],
  },
  "M=2, froe 4242": {
    m: 2,
    n: 6,
    frø: 4242,
    kort: ["K10", "R12", "K11", "K11", "R10", "R10"],
  },
};

for (const [navn, f] of Object.entries(FASIT)) {
  test(`alpha-mu velger identisk med fasiten: ${navn}`, () => {
    assert.deepEqual(valg(f.m, f.n, f.frø), f.kort);
  });
}

test("M=2 er et ANNET soek enn M=1 - fasitene faar ikke vaere like", () => {
  /**
   * Uten denne kunne fasitene vært identiske uten at noen la merke til det, og
   * da ville testen «bevist» bit-identitet for et framoverblikk som aldri
   * fyrte. M≥2 skal endre valg — det er hele grunnen til at den finnes.
   */
  const m1 = FASIT["M=1, froe 987654"]!.kort.slice(0, 8);
  const m2 = FASIT["M=2, froe 987654"]!.kort;
  assert.notDeepEqual(m1, m2, "M=1 og M=2 valgte likt i alle 8 stillinger");
});
