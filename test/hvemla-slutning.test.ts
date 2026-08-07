/**
 * A1: SPILLVEKTEN MÅ FAKTISK STRAFFE DET DEN SIER.
 *
 * Regelen er: fulgte du farge og lot stikket gå, har du sannsynligvis ikke noe
 * høyere i den fargen. En verden som gir spilleren nettopp det kortet, skal
 * vektes ned.
 *
 * Faren er en vekt som alltid returnerer 0. Den ville ikke feilet, ikke
 * krasjet, og målingen ville sagt «spillvekt gir ingenting» på et oppsett som
 * ikke kunne gitt noe annet — nøyaktig slik sanseblokken lå død i 95 % av
 * kodingen (§32) og v2-budblokken ville vært null uten forkastningstrekking.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { Kort } from "../src/kort.ts";
import type { GameState } from "../src/motor.ts";
import {
  hvemLaForenlighet as spillForenlighet,
  STRAFF_IKKE_VANT as STRAFF,
  STRAFF_IKKE_TRUMFET,
} from "../src/moe2/hvemla-slutning.ts";

const k = (farge: string, verdi: number): Kort => ({ farge, verdi }) as Kort;

/** Minimal tilstand: ett ferdigspilt stikk, ledet i spar, vunnet av sete 0. */
function medStikk(kort: { kort: Kort; spiller: number }[], trumf: string | null): GameState {
  return {
    trumf,
    historikk: [{ kort, vinner: 0 }],
    bord: [],
  } as unknown as GameState;
}

test("verden som gir en spiller det VINNENDE kortet de ikke spilte, straffes", () => {
  // Sete 1 fulgte med spar 4 i et stikk vunnet av spar konge.
  const stikk = [
    { kort: k("S", 13), spiller: 0 },
    { kort: k("S", 4), spiller: 1 },
  ];
  const s = medStikk(stikk, "H");
  // Verden A gir sete 1 spar ess – de lot altså et gratis stikk gå.
  const a = spillForenlighet(s, [[], [k("S", 14)], [], []], 0);
  // Verden B gir sete 1 bare smått – helt forenlig.
  const b = spillForenlighet(s, [[], [k("S", 2)], [], []], 0);
  assert.equal(b, 0, "forenlig verden skal ikke straffes");
  assert.ok(a < b, `verden med det vinnende kortet skal vektes ned (${a} mot ${b})`);
  assert.equal(a, -STRAFF);
});

test("ÉN straff per stikk per spiller, ikke per kort", () => {
  const stikk = [
    { kort: k("S", 10), spiller: 0 },
    { kort: k("S", 4), spiller: 1 },
  ];
  const s = medStikk(stikk, "H");
  const to = spillForenlighet(s, [[], [k("S", 14), k("S", 13)], [], []], 0);
  assert.equal(to, -STRAFF, "to hoeye kort skal ikke gi dobbel straff");
});

test("OBSERVATOEREN slutter ikke om seg selv", () => {
  const stikk = [
    { kort: k("S", 13), spiller: 0 },
    { kort: k("S", 4), spiller: 1 },
  ];
  const s = medStikk(stikk, "H");
  // Sete 1 er observatoer: vi VET hva vi har, ingen slutning.
  assert.equal(spillForenlighet(s, [[], [k("S", 14)], [], []], 1), 0);
});

test("stikk vunnet med TRUMF gir ingen slutning om ledfargen", () => {
  // Spar ledet, sete 0 trumfet med hjerter. At sete 1 har spar ess betyr da
  // ingenting – esset ville ikke vunnet.
  const stikk = [
    { kort: k("S", 3), spiller: 2 },
    { kort: k("S", 4), spiller: 1 },
    { kort: k("H", 2), spiller: 0 },
  ];
  const s = medStikk(stikk, "H");
  assert.equal(spillForenlighet(s, [[], [k("S", 14)], [], []], 0), 0);
});

test("den som VANT stikket slutter vi ingenting om", () => {
  const stikk = [
    { kort: k("S", 13), spiller: 0 },
    { kort: k("S", 4), spiller: 1 },
  ];
  const s = medStikk(stikk, "H");
  // Sete 0 vant. At de fortsatt har spar ess er helt normalt.
  assert.equal(spillForenlighet(s, [[k("S", 14)], [], [], []], 1), 0);
});

test("AVKAST straffes ikke - det er renonseforbudets jobb", () => {
  const stikk = [
    { kort: k("S", 13), spiller: 0 },
    { kort: k("R", 4), spiller: 1 }, // kastet av, foelger ikke farge
  ];
  const s = medStikk(stikk, "H");
  assert.equal(spillForenlighet(s, [[], [k("S", 14)], [], []], 0), 0);
});

/**
 * SLUTNING 3 — DEN STERKESTE AV DE MYKE.
 *
 * Var du renons i utspillsfargen og kastet av i stedet for å trumfe et stikk du
 * ville vunnet, har du neppe trumf igjen. Den er sterk fordi den er DYR å
 * bryte: å la et stikk gå man kunne tatt gratis koster nesten alltid.
 */
test("kastet av naar en trumf ville vunnet -> verden med trumf straffes", () => {
  const stikk = [
    { kort: k("S", 13), spiller: 0 },
    { kort: k("R", 4), spiller: 1 }, // renons i spar, kastet av
  ];
  const s = medStikk(stikk, "H");
  const medTrumf = spillForenlighet(s, [[], [k("H", 2)], [], []], 0);
  const utenTrumf = spillForenlighet(s, [[], [k("R", 2)], [], []], 0);
  assert.equal(utenTrumf, 0, "verden uten trumf skal ikke straffes");
  assert.ok(medTrumf < utenTrumf, `verden med trumf skal vektes ned (${medTrumf})`);
  assert.equal(medTrumf, -STRAFF_IKKE_TRUMFET);
});

test("kastet av naar stikket alt var trumfet HOEYERE -> ingen slutning", () => {
  // Sete 0 trumfet med hjerter konge. At sete 1 har hjerter 2 igjen betyr
  // ingenting - den ville ikke vunnet.
  const stikk = [
    { kort: k("S", 13), spiller: 2 },
    { kort: k("H", 13), spiller: 0 },
    { kort: k("R", 4), spiller: 1 },
  ];
  const s = medStikk(stikk, "H");
  assert.equal(spillForenlighet(s, [[], [k("H", 2)], [], []], 0), 0);
});

/**
 * SLUTNING 4 — LENGDE. Svak med vilje: et fordelingsargument, ikke en
 * observasjon om et bestemt kort. Derfor POSITIV vekt, ikke straff.
 */
/**
 * DENNE TESTEN HEVDET DET MOTSATTE, OG DEN TOK FEIL.
 *
 * Den het «fulgte du en farge flere ganger, er flere igjen mer forenlig» og
 * haandhevet `VEKT_LENGDE = +0,15`. `examples/slutning-kalibrer.ts` maalte
 * hellingen over 1 870 (sete, farge)-par: **-0,671**. Motsatt vei, og
 * aapenbart i ettertid - kortene du spilte er borte.
 *
 * Testen var altsaa en KODIFISERT ANTAKELSE, ikke en maaling, og den holdt en
 * feil paa plass: A1 maalte daarligere trosnoeyaktighet enn INGEN slutning
 * (0,9624 mot 0,9509). Etter kalibreringen: 0,9559.
 *
 * Den er ikke slettet, den er snudd - og forventningen kommer naa fra den
 * maalte regresjonslinja i stedet for fra en antakelse.
 */
test("lengde: fulgte du en farge flere ganger, er FAERRE igjen mer forenlig", () => {
  const to = [
    { kort: k("S", 13), spiller: 0 },
    { kort: k("S", 9), spiller: 1 },
  ];
  const s = {
    trumf: "H",
    historikk: [
      { kort: to, vinner: 0 },
      { kort: [{ kort: k("S", 12), spiller: 0 }, { kort: k("S", 8), spiller: 1 }], vinner: 0 },
    ],
    bord: [],
  } as unknown as GameState;
  // Sete 1 fulgte spar TO ganger. Maalt forventning: 1,089 - 0,671*(2 - 1,449)
  // = 0,72 kort igjen i spar. En verden som gir dem TO er derfor mindre
  // forenlig enn en som gir dem null.
  const mange = spillForenlighet(s, [[], [k("S", 2), k("S", 3)], [], []], 0);
  const faa = spillForenlighet(s, [[], [k("R", 2), k("R", 3)], [], []], 0);
  assert.ok(
    faa > mange,
    `etter aa ha fulgt spar to ganger skal FAERRE spar igjen vaere mer forenlig ` +
      `(faa ${faa} skal slaa mange ${mange}) - maalt helling -0,671`,
  );
});

/**
 * VAKTEN MOT EN DOED VEKT. Over ekte stillinger MAA slutningen skille mellom
 * verdener - ellers er hele A1 en dyr nulloperasjon, akkurat som sanseblokken
 * laa doed i 95 % av kodingen (§32).
 */
test("over EKTE stillinger skiller vekten faktisk mellom verdener", async () => {
  const { opprettSpill, utfør } = await import("../src/index.ts");
  const { lagIndre, ADAMS } = await import("../src/moe2/agentspek.ts");
  const { trekkVerdener } = await import("../src/moe2/sdkort.ts");
  const { lagHvemLaVekt } = await import("../src/moe2/hvemla-slutning.ts");
  const { lagRng } = await import("../src/kort.ts");

  let ulike = 0;
  let sjekket = 0;
  for (let g = 0; g < 10; g++) {
    const ag = [0, 1, 2, 3].map(() => lagIndre(ADAMS));
    let s = opprettSpill({ antallSpillere: 4 }, 6_600_000 + g * 7717);
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
      if (s.fase === "SPILL" && s.stikkSpilt >= 4 && s.iTur !== null) {
        const verdener = trekkVerdener(s, s.iTur, 8, lagRng(g * 31 + 7), undefined, undefined, 3);
        if (verdener.length >= 2) {
          const vekt = lagHvemLaVekt(s, s.iTur);
          const v = verdener.map((h) => vekt({ hender: h }));
          sjekket++;
          if (new Set(v.map((x) => x.toFixed(4))).size > 1) ulike++;
        }
        break;
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      s = utfør(s, ag[iTur]!.velgHandling(s)).state;
    }
  }
  assert.ok(sjekket >= 5, `for få stillinger (${sjekket})`);
  assert.ok(ulike > 0, "vekten ga IDENTISK verdi til alle verdener – den er død");
});
