/**
 * K4 PRØVE A MED EN VILKÅRLIG SPEK — prøver for `--spek` i `examples/k4-hukommelse.ts`.
 *
 * Det nye er ikke prøven, men forutsetningen den hviler på: at speken er en funksjon av
 * tilstanden. Med `sik:` er den ikke det, og da måler «fersk mot mett» RNG-posisjon.
 * Verktøyet skal SI det, ikke bare vise et avvik i nullarmen.
 */

import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { test } from "node:test";

import { ADAMS_MAALT, lagIndre } from "../src/moe2/agentspek.ts";
import {
  A_MINNE,
  A_NULL,
  BASE_DET,
  dømK4Spek,
  erDeterministisk,
  kjørK4Spek,
  slåSammenK4,
  spillOgTaOpp,
  type K4SpekRapport,
} from "../examples/k4-hukommelse.ts";
import { budqLeserMinne, utenMinne, utenØktmotstander } from "../examples/spek-lag.ts";

test("K4 --spek: nullarmen avledet av A_MINNE er nøyaktig A_NULL", () => {
  assert.equal(utenMinne(A_MINNE), A_NULL, "avledningen bygger en annen nullarm enn den faste");
  assert.equal(A_NULL, BASE_DET);
});

/** Hele boten slik batteriet kjørte den 11. sep (D:/amb-grp/loop/iter0/krav.txt). */
const HELBOT_11SEP =
  "okt:vr:e1-modell/vrak-1.bin:telrd:eks:3Lt2000:profil:sik:alle:0.5:24k32e3LMD~mlbu=e1-modell/tro-1.bin:" +
  "budq:e1-modell/budq-1.bin:vakt:abmp:e1:e1-modell/d7alle.bin";
const HELBOT_FILER = ["vrak-1.bin", "tro-1.bin", "budq-1.bin", "d7alle.bin"].map((f) => `e1-modell/${f}`);
const manglerFiler = HELBOT_FILER.filter((f) => !existsSync(f));

test(
  "utenMinne: helbotens nullarm BYGGER — «M» følger okt: ut, og en avledning som lar «M» stå blir tatt",
  { skip: manglerFiler.length > 0 ? `mangler ${manglerFiler.join(", ")} (e1-modell er ikke sporet)` : false },
  () => {
    const nul = utenMinne(HELBOT_11SEP);
    // `budq-1.bin` er et 287-nett som fører motstanderboka selv: nullarmen får `h0` (se utenMinne).
    assert.equal(
      nul,
      "vr:e1-modell/vrak-1.bin:telrd:eks:3Lt2000:sik:alle:0.5:24k32e3LD:budq:e1-modell/budq-1.binh0:vakt:abmp:e1:e1-modell/d7alle.bin",
    );
    // Batteriet 11. sep: alle 24 K4-jobber kastet her.
    assert.doesNotThrow(() => lagIndre(nul));
    // FELLA: avledningen slik den var (troen ut, «M» igjen) SKAL kaste ved bygging — ellers
    // kunne prøven over vært grønn fordi byggingen ikke sjekker «M» lenger.
    const gammel = nul.replace("24k32e3LD", "24k32e3LMD");
    assert.notEqual(gammel, nul);
    assert.throws(() => lagIndre(gammel), /ber om «M»/);
  },
);

test(
  "utenMinne: et BudQ-nett som leser boka får h0, et som ikke gjør det står — og h0 er det eneste som skiller",
  { skip: manglerFiler.length > 0 ? `mangler ${manglerFiler.join(", ")} (e1-modell er ikke sporet)` : false },
  () => {
    assert.equal(budqLeserMinne("e1-modell/budq-1.bin"), true, "budq-1.bin skal være et 287-nett");
    // FELLA: med en leser som sier «ingen bok» står budq-laget urørt. Uten den kunne h0 komme fra
    // noe annet enn nettets bredde, og nullarmen for et 143-nett ville fått en bryter den ikke har.
    const uten = utenMinne(HELBOT_11SEP, undefined, () => false);
    assert.equal(uten, utenMinne(HELBOT_11SEP).replace("budq-1.binh0:", "budq-1.bin:"));
    // Idempotent: nullarmen av nullarmen er nullarmen (ingen «h0h0»).
    assert.equal(utenMinne(utenMinne(HELBOT_11SEP)), utenMinne(HELBOT_11SEP));
  },
);

test("utenØktmotstander: tar bare «M» bakerst (foran «D»), og også når troen ikke leser boka", () => {
  assert.equal(utenØktmotstander("24k32e3LMD"), "24k32e3LD");
  assert.equal(utenØktmotstander("24k32e3LM"), "24k32e3L");
  assert.equal(utenØktmotstander("24k32e3LD"), "24k32e3LD");
  assert.equal(utenØktmotstander("12aminD"), "12aminD");
  // Økta forsvinner uansett hva troen leser, så «M» må ut også her.
  assert.equal(
    utenMinne("okt:sik:alle:0.5:2k2MD~mlb=x.bin:e1:e1-modell/d7alle.bin", () => false),
    "sik:alle:0.5:2k2D~mlb=x.bin:e1:e1-modell/d7alle.bin",
  );
  assert.equal(utenMinne("okt:sik:alle:0.5:2k2M:e1:e1-modell/d7alle.bin", () => false), "sik:alle:0.5:2k2:e1:e1-modell/d7alle.bin");
  // En spek uten «M» er urørt (samme streng som før fiksen).
  assert.equal(utenMinne(ADAMS_MAALT), ADAMS_MAALT);
});

test("K4 --spek: standardkallet er uendret — tomt `ekstra` gir samme opptak som før", () => {
  const a = spillOgTaOpp(A_MINNE, false, 4_400_000, 1, true);
  const b = spillOgTaOpp(A_MINNE, false, 4_400_000, 1, true, 0, 0, undefined, {});
  assert.ok(a.valg.length > 0);
  assert.deepEqual(b.valg, a.valg);
});

test("erDeterministisk: den faste stakken er det, et søk med vandrende RNG er det IKKE", () => {
  const det = erDeterministisk(ADAMS_MAALT, 1);
  assert.ok(det.kall > 0);
  assert.equal(det.ulike, 0, `ADAMS_MAALT ga ulikt svar på samme tilstand:\n${det.eksempler.join("\n")}`);
  // Fella: σ = 0 overstyrer alltid med to verdener — to kall trekker to ulike par.
  const støy = erDeterministisk(`sik:alle:0:2:${ADAMS_MAALT}`, 1);
  assert.ok(støy.ulike > 0, "et søk med vandrende RNG ble ikke oppdaget — advarselen kan aldri fyre");
});

test("K4 --spek: en liten ekte kjøring — nullarmen 0 avvik, de andre setene fra `andre`", () => {
  const r = kjørK4Spek({
    spek: `okt:${A_MINNE}`,
    nullSpek: utenMinne(`okt:${A_MINNE}`),
    andre: BASE_DET,
    giv: 1,
    frøBase: 4_400_000,
    målRunde: 2,
    forkamper: 0,
    deler: ["null", "minne"],
  });
  const nul = r.armer.find((a) => a.navn === "NULL");
  assert.ok(nul !== undefined && nul.n > 0, "nullarmen fikk ingen stillinger");
  assert.equal(nul.avvik, 0, "en deterministisk nullarm uten hukommelse avvek");
  assert.equal(r.nullSpek, A_NULL);
});

test("dømK4Spek: avvik i nullarmen med søkelag er STUM og peker på frøet — ikke «ja»", () => {
  const grunn: K4SpekRapport = {
    spek: "s",
    nullSpek: "n",
    andre: null,
    opts: { giv: 1, frøBase: 0, målRunde: 7, forkamper: 0 },
    determinisme: { kall: 10, ulike: 0, søkelag: false, eksempler: [] },
    armer: [
      { navn: "NULL", spek: "n", giv: 1, n: 10, avvik: 0, avvikBud: 0, avvikSpill: 0, bokførte: [0, 0, 0, 0], eksempler: [] },
      { navn: "MINNE", spek: "s", giv: 1, n: 10, avvik: 2, avvikBud: 2, avvikSpill: 0, bokførte: [3, 3, 3, 3], eksempler: [] },
    ],
    positivkontroll: [{ forsterk: 8, n: 10, avvik: 1 }],
    struktur: null,
    sekunder: 0,
  };
  assert.equal(dømK4Spek(grunn).dom, "ja");
  const støy = dømK4Spek({
    ...grunn,
    determinisme: { kall: 10, ulike: 3, søkelag: true, eksempler: [] },
    armer: grunn.armer.map((a) => (a.navn === "NULL" ? { ...a, avvik: 2 } : a)),
  });
  assert.equal(støy.dom, "stum");
  assert.match(støy.grunn, /per-beslutning-frø/);
  assert.equal(dømK4Spek({ ...grunn, positivkontroll: [{ forsterk: 8, n: 10, avvik: 0 }] }).dom, "stum");
  assert.equal(dømK4Spek({ ...grunn, armer: grunn.armer.map((a) => ({ ...a, avvik: 0 })) }).dom, "nei");
  // Skiver summeres per arm, kontrolldelen tas fra skiva som har den.
  const s = slåSammenK4([{ ...grunn, positivkontroll: null }, { ...grunn, armer: [] }]);
  assert.equal(s.armer.find((a) => a.navn === "MINNE")!.n, 10);
  assert.notEqual(s.positivkontroll, null);
});
