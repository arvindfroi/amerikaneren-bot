/**
 * KRAVBATTERIETS EGEN PRØVE — måler prøvene det de sier de måler?
 *
 * `examples/mlb-k4.ts`, `-k5.ts` og `-k6.ts` er MÅLEAPPARAT, ikke bot. Et
 * måleapparat som ikke selv er prøvd er nøyaktig det prosjektet har blitt bitt
 * av fire ganger: en grønn prøve som viste seg å være stum, og én av dem var
 * K6-detektoren som «bestod» på ren støy (§108).
 *
 * Derfor krever denne fila to ting av hver prøve, og de er ikke de samme:
 *
 *   KONTROLLARMEN MÅ TREFFE ET KJENT TALL. Eksakt 0,0000, ikke «nær null».
 *   Armene er bit-identiske per konstruksjon, så et avvik er en feil i benken
 *   og ikke støy.
 *
 *   FALSIFISERINGSARMEN MÅ BLI TATT. Et nett som beviselig HAR evnen prøven
 *   leter etter, konstruert av `plantetNett`/`plantetPåTrekk`. Går den
 *   gjennom uoppdaget, betyr et lavt tall fra ekte vekter «prøven er stum» og
 *   ikke «nettet mangler evnen» — og de to må aldri forveksles.
 *
 * ===================== HVORFOR TILFELDIGE VEKTER HER =====================
 *
 * Prøvene er vektuavhengige: kontrollarmen er null fordi armene er like, og
 * den plantede armen fyrer fordi den er plantet. Ingen av delene krever et
 * trent nett, og et trent nett ville dessuten gjort testen avhengig av en fil
 * i arbeidstreet. `Sandkassenett.tilfeldig` bygges alltid mot HEADs
 * `TREKK_LENGDE`, så prøven kan ikke råtne når trekklayouten endrer seg.
 *
 * Det er også den eneste måten den KAN kjøres i dag: hver MLB-vektfil i
 * `e1-modell/` er skrevet mot en 1 032 trekk bred stamme, mens HEAD har 1 031
 * etter at §126 fjernet én inngang. `Sandkassenett.fraFil` avviser dem alle.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lagIndre } from "../src/moe2/agentspek.ts";
import { målK4 } from "../examples/mlb-k4.ts";
import { døm as dømK5, målK5 } from "../examples/mlb-k5.ts";
import { døm as dømK6, kantPerRunde, målK6 } from "../examples/mlb-k6.ts";
import { mlbSpek, plantetNett, plantetPåTrekk, trekkIndeks } from "../examples/mlb-krav-felles.ts";
import { Sandkassenett } from "../src/mlb/nett.ts";
import { TREKK_LENGDE } from "../src/mlb/trekk.ts";

const VEKT = "tilfeldig7310001";

// ===========================================================================
// Speken
// ===========================================================================

test("mlbSpek: `h0` havner FØR tilden, ellers leses trostien som «...binh0»", () => {
  assert.equal(mlbSpek({ vekt: "a.bin" }), "mlb:a.bin");
  assert.equal(mlbSpek({ vekt: "a.bin", hukommelse: false }), "mlb:a.binh0");
  assert.equal(mlbSpek({ vekt: "a.bin", tro: "t.bin" }), "mlb:a.bin~t.bin");
  assert.equal(
    mlbSpek({ vekt: "a.bin", tro: "t.bin", hukommelse: false }),
    "mlb:a.binh0~t.bin",
    "h0 må stå på vektstien: `agentspek.ts` klipper `~<tro>` FØRST",
  );
  assert.equal(mlbSpek({ vekt: "a.bin", temperatur: 0.5 }), "mlb:a.bin@0.5");
});

test("mlbSpek: `lagIndre` bygger begge hukommelsesstillingene uten å kaste", () => {
  for (const h of [true, false]) {
    const a = lagIndre(mlbSpek({ vekt: VEKT, hukommelse: h }));
    assert.equal(typeof a.velgHandling, "function", `speken med hukommelse=${h} ga ingen agent`);
  }
});

// ===========================================================================
// De plantede nettene — de MÅ endre valget, ellers er falsifiseringen tom
// ===========================================================================

test("plantetNett: policyen snus når blokka er ulik null, og BARE da", () => {
  const rå = Sandkassenett.tilfeldig(4242);
  const p = plantetNett(rå, "HUKOMMELSE");
  const tom = new Float32Array(TREKK_LENGDE);
  assert.deepEqual(
    Array.from(p.framover(tom).policy),
    Array.from(rå.framover(tom).policy),
    "med en NULL hukommelsesblokk skal det plantede nettet være bit-identisk",
  );
  const fylt = new Float32Array(TREKK_LENGDE);
  fylt[trekkIndeks("makro.racepress")] = 0.5;
  const huk = new Float32Array(TREKK_LENGDE);
  huk[534] = 0.5; // inne i HUKOMMELSE-blokka
  const a = Array.from(rå.framover(huk).policy);
  const b = Array.from(p.framover(huk).policy);
  assert.ok(
    a.some((x, i) => x !== b[i]),
    "med en FYLT hukommelsesblokk skal policyen være en annen — ellers er armen stum",
  );
});

test("plantetPåTrekk: snur bare over terskelen — det blokkvarianten IKKE klarte for K5", () => {
  const rå = Sandkassenett.tilfeldig(4242);
  const i = trekkIndeks("makro.racepress");
  const p = plantetPåTrekk(rå, i, 0);
  const bak = new Float32Array(TREKK_LENGDE);
  bak[i] = 0.36;
  const foran = new Float32Array(TREKK_LENGDE);
  foran[i] = -0.36;
  assert.deepEqual(
    Array.from(p.framover(foran).policy),
    Array.from(rå.framover(foran).policy),
    "under terskelen skal armen være urørt",
  );
  const a = Array.from(rå.framover(bak).policy);
  const b = Array.from(p.framover(bak).policy);
  assert.ok(a.some((x, k) => x !== b[k]), "over terskelen skal policyen snus");
});

// ===========================================================================
// K4
// ===========================================================================

test("K4: kontrollarmen er EKSAKT 0, den plantede blir tatt, og uten tikk dør den", () => {
  const dommer = målK4({
    vekt: VEKT,
    tro: null,
    kamper: 1,
    målRunde: 2,
    målPoeng: 60,
    maksRunder: 8,
    perRunde: 3,
  });
  const finn = (n: string) => {
    const d = dommer.find((x) => x.arm === n);
    assert.ok(d !== undefined, `armen «${n}» mangler`);
    assert.ok(d.stillinger > 0, `armen «${n}» fikk 0 stillinger — prøven måler ingenting`);
    return d;
  };

  assert.equal(
    finn("KONTROLL").andel,
    0,
    "KONTROLL har hukommelsen AV i begge halvdelene. Er den ikke eksakt 0, måler " +
      "prøven RNG-posisjon eller agentbygging, og ingen andre tall kan leses.",
  );
  assert.ok(
    finn("PLANTET").andel > 0.5,
    "et nett som beviselig lar hukommelsesblokka styre valget ble IKKE tatt. " +
      "Da måler prøven ingenting, og et lavt tall fra ekte vekter betyr ikke noe.",
  );
  /**
   * DEFEKTEN, LÅST SOM ET TALL. `Sandkasseagent` heter `observerRunde`, mens
   * `examples/kamp.ts`, `okt:`, `vr:` og `amu:` alle kaller `observer`. Uten
   * tikket bokføres ingen runder, og en arm som HAR evnen måler null.
   *
   * Blir den raden en dag ulik null, er navnene møttes — og da skal denne
   * testen skrives om, ikke slettes.
   */
  assert.equal(
    finn("PLANTET-utikk").andel,
    0,
    "samme plantede nett uten tikk skal måle 0: hukommelsen bokfører bare på " +
      "RUNDE_SLUTT, og ingen spør en agent om et trekk i den fasen.",
  );
  assert.equal(
    finn("PLANTET-utikk").maksBokførte,
    0,
    "uten tikk skal ingen runder være bokført i det hele tatt",
  );
  assert.ok(
    finn("mlb").maksBokførte > 0,
    "MLB-armen bokførte ingen runder — da er hukommelsen strukturelt umålbar, " +
      "og prøven svarer på et annet spørsmål enn den stiller",
  );
});

// ===========================================================================
// K5
// ===========================================================================

test("K5: kontrollarmen er EKSAKT 0 på alle tre måltallene, og den plantede blir tatt", () => {
  const rader = målK5({ vekt: VEKT, tro: null, giver: 2, maksPerGiv: 2 });
  const k = dømK5(rader, "KONTROLL");
  assert.ok(k.stillinger > 0, "kontrollarmen fikk 0 stillinger");
  assert.equal(k.andel, 0, "lik stilling må gi 0 endrede valg");
  assert.equal(k.tvSnitt, 0, "lik stilling må gi TV-avstand eksakt 0");
  assert.equal(k.verdigap, 0, "lik stilling må gi verdigap eksakt 0");

  const p = dømK5(rader, "PLANTET");
  assert.ok(
    p.andel > 0.5,
    "et nett plantet på fortegnet av `makro.racepress` ble ikke tatt. " +
      "Merk at BLOKK-varianten var stum her: makroblokka er ulik null i begge " +
      "armene, så en snuing på «blokka ulik null» skjer likt på hver side.",
  );

  const m = dømK5(rader, "mlb");
  assert.ok(m.stillinger > 0, "MLB-armen fikk 0 stillinger");
  assert.notEqual(
    m.pressBak,
    m.pressForan,
    "racepress er likt i de to armene — da ble kampstillingen aldri konstruert, " +
      "og et nulltall sier ingenting om nettet",
  );
});

// ===========================================================================
// K6
// ===========================================================================

test("K6: kant per runde summerer til sluttpoengene, og kontrollarmens dd er EKSAKT 0", () => {
  /**
   * AVLESNINGEN FØRST. `kantPerRunde` utleder rundepoeng av `poengFør` og
   * `sluttpoeng`. Er den regnet feil, er hele K6-tallet feil uten at noe
   * krasjer — derfor prøves identiteten direkte: summen av alle setenes
   * rundedeltaer må være sluttstillingen.
   */
  const rader = [
    { sete: 0, rundeNr: 0, poengFør: 0 },
    { sete: 1, rundeNr: 0, poengFør: 0 },
    { sete: 0, rundeNr: 1, poengFør: 9 },
    { sete: 1, rundeNr: 1, poengFør: -3 },
  ] as unknown as Parameters<typeof kantPerRunde>[0];
  const k = kantPerRunde(rader, [20, -5], 0, 2);
  assert.deepEqual(
    k,
    [
      { rundeNr: 0, kant: 9 - -3 },
      { rundeNr: 1, kant: 20 - 9 - (-5 - -3) },
    ],
    "kant per runde er feil utledet av poengFør/sluttpoeng",
  );
});

test("K6: kontrollarmen har dd EKSAKT 0 på hver rad, og den plantede blir tatt", () => {
  const rader = målK6({
    vekt: VEKT,
    tro: null,
    kamper: 1,
    målPoeng: 60,
    maksRunder: 8,
    vaner: ["test.ordentlig"],
  });
  const k = dømK6(rader, "KONTROLL", 4);
  assert.ok(k.n > 0, "kontrollarmen fikk 0 runder");
  assert.ok(
    rader.filter((r) => r.arm === "KONTROLL").every((r) => r.dd === 0),
    "KONTROLL har hukommelsen av i BEGGE halvdelene — kampene er bit-identiske, " +
      "så hver eneste rad må ha dd = 0. Er den ikke det, lekker noe annet enn " +
      "hukommelsen mellom armene.",
  );
  const p = dømK6(rader, "PLANTET", 4);
  assert.ok(
    Math.abs(p.dd) > 1e-9,
    "et nett som beviselig lar hukommelsesblokka styre valget ga dd = 0. " +
      "Da er benken stum, og MLB-armens tall betyr ingenting.",
  );
  const m = dømK6(rader, "mlb", 4);
  assert.ok(m.n > 0, "MLB-armen fikk 0 runder");
  assert.ok(
    m.maksRunde >= 4,
    `kampen nådde bare runde ${m.maksRunde}. K6 måler STIGNINGEN mot ` +
      `rundenummeret, og med målPoeng 30 varer en kamp 5,68 runder — da er ` +
      `kravet strukturelt ulærbart. Prøven må kjøres på lange løp.`,
  );
});
