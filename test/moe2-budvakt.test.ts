import { strict as assert } from "node:assert";
import { test } from "node:test";

import { kortId } from "../src/kort.ts";
import { opprettSpill, utfør, type GameState, type Handling } from "../src/motor.ts";
import { MINSTE_TALLBUD, PASS } from "../src/regler.ts";
import { NevroAgent } from "../src/nevro/agent.ts";
import { analyserGiv } from "../src/neat/singledummy.ts";
import {
  Budvakt,
  blindSd,
  budvaktBud,
  delBudspek,
  lesBudflagg,
  lovligMinstebud,
  tømBlindCache,
  type Budvalg,
} from "../src/moe2/budvakt.ts";
import type { Innagent } from "../src/moe2/konvensjonsvakt.ts";

/**
 * Testene låser tre ting i src/moe2/budvakt.ts:
 *
 *   1. GRENSENE: vakten rører BARE PASS, bare tallbud, og bare når et tallbud
 *      finnes. Et bud den senker eller endrer ville vært en helt annen policy
 *      enn den som måles.
 *   2. INFORMASJONSDISIPLINEN i den BLINDE estimatoren. Den er den eneste av
 *      de to som kan promoteres, og hele påstanden om at den er lovlig hviler
 *      på at tallet ikke endrer seg når motstandernes kort byttes om. Den
 *      testen er derfor den viktigste i fila.
 *   3. At orakelvarianten faktisk JUKSER – også det er en påstand som må
 *      holde, for den er begrunnelsen for at den ikke kan promoteres.
 */

const orakel = new NevroAgent();

const ORAKEL0: Budvalg = { margin: 0, brukSnitt: false, verdener: 0, nettFil: null };

/** Frisk budrunde på en ekte giv. */
function giv(frø: number): GameState {
  return opprettSpill({ antallSpillere: 4 }, frø);
}

// ---------------------------------------------------------------------------
// Spesifikasjonen
// ---------------------------------------------------------------------------

test("lesBudflagg leser orakelmarginer med og uten fortegn", () => {
  assert.deepEqual(lesBudflagg("0"), { margin: 0, brukSnitt: false, verdener: 0, nettFil: null });
  assert.deepEqual(lesBudflagg("1"), { margin: 1, brukSnitt: false, verdener: 0, nettFil: null });
  assert.deepEqual(lesBudflagg("-1"), { margin: -1, brukSnitt: false, verdener: 0, nettFil: null });
  assert.deepEqual(lesBudflagg("m-0.6"), { margin: -0.6, brukSnitt: true, verdener: 0, nettFil: null });
});

test("lesBudflagg leser den blinde varianten, og krever fortegn", () => {
  assert.deepEqual(lesBudflagg("b8+0.5"), { margin: 0.5, brukSnitt: false, verdener: 8, nettFil: null });
  assert.deepEqual(lesBudflagg("b12-1"), { margin: -1, brukSnitt: false, verdener: 12, nettFil: null });
  // Uten fortegn kan ikke verdenstallet skilles fra marginen.
  assert.throws(() => lesBudflagg("b8"), /mangler fortegn/);
  assert.throws(() => lesBudflagg("tull"), /Ukjent budmargin/);
});

test("lesBudflagg leser den LÆRTE varianten, med sti og margin", () => {
  assert.deepEqual(lesBudflagg("h@e1-modell/hand-a.bin@+0.5"), {
    margin: 0.5,
    brukSnitt: false,
    verdener: 0,
    nettFil: "e1-modell/hand-a.bin",
  });
  // Bindestrek i stien er derfor stien får sin egen separator og ikke deles
  // på fortegnet slik den blinde varianten gjør.
  assert.deepEqual(lesBudflagg("h@e1-modell/hand-a.bin@-1"), {
    margin: -1,
    brukSnitt: false,
    verdener: 0,
    nettFil: "e1-modell/hand-a.bin",
  });
  assert.throws(() => lesBudflagg("h@bare-sti"), /Ukjent håndnettflagg/);
  assert.throws(() => lesBudflagg("h@sti@tull"), /Ukjent margin/);
});

test("vakten nekter å bruke håndnettet hvis det ikke er lastet", () => {
  // Alternativet – å falle stille tilbake på orakelet – ville målt juks og
  // rapportert det som en lovlig spiller.
  const s = giv(4242);
  assert.throws(
    () => budvaktBud(s, 0, PASS, lesBudflagg("h@finnes-ikke.bin@0"), orakel),
    /mangler håndnettet/,
  );
});

test("delBudspek deler spesifikasjonen og lar andre kandidater være", () => {
  assert.deepEqual(delBudspek("bud:0:vakt:at:e1:e1-modell/sd-r2.bin"), {
    valg: { margin: 0, brukSnitt: false, verdener: 0, nettFil: null },
    flagg: "0",
    indre: "vakt:at:e1:e1-modell/sd-r2.bin",
  });
  assert.equal(delBudspek("nevro"), null);
  assert.equal(delBudspek("vakt:at:nevro"), null);
  assert.throws(() => delBudspek("bud:0"), /mangler indre kandidat/);
});

// ---------------------------------------------------------------------------
// Det lovlige minstebudet
// ---------------------------------------------------------------------------

test("lovligMinstebud er minstebudet på en frisk budrunde, og stiger med budene", () => {
  const s = giv(4242);
  assert.equal(s.fase, "BUDRUNDE");
  assert.equal(lovligMinstebud(s), MINSTE_TALLBUD);
  const etter = utfør(s, { type: "BUD", spiller: s.iTur!, bud: 8 }).state;
  assert.equal(lovligMinstebud(etter), 9);
});

test("lovligMinstebud er null utenfor budrunden", () => {
  let s = giv(4242);
  let vakt = 0;
  while (s.fase === "BUDRUNDE" && vakt++ < 10) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: s.budrunde.høyeste === null ? 12 : PASS }).state;
  }
  assert.notEqual(s.fase, "BUDRUNDE");
  assert.equal(lovligMinstebud(s), null);
});

// ---------------------------------------------------------------------------
// Grensene: hva vakten IKKE rører
// ---------------------------------------------------------------------------

test("vakten rører aldri et bud som ikke er PASS", () => {
  const s = giv(4242);
  for (const bud of [5, 9, 12, "AMERIKANER", "SOLO"] as const) {
    // Margin −100 ville gjort om ethvert PASS til bud; her skal ingenting skje.
    assert.equal(budvaktBud(s, 0, bud, { margin: -100, brukSnitt: false, verdener: 0, nettFil: null }, orakel), bud);
  }
});

test("vakten byr det MINSTE lovlige tallbudet, aldri noe annet", () => {
  const s = giv(4242);
  const etter = utfør(s, { type: "BUD", spiller: s.iTur!, bud: 7 }).state;
  const bud = budvaktBud(etter, etter.iTur!, PASS, { margin: -100, brukSnitt: false, verdener: 0, nettFil: null }, orakel);
  assert.equal(bud, 8);
});

test("en umulig margin lar passet stå, en umulig lav margin byr alltid", () => {
  const s = giv(4242);
  assert.equal(budvaktBud(s, 0, PASS, { margin: 100, brukSnitt: false, verdener: 0, nettFil: null }, orakel), PASS);
  assert.equal(budvaktBud(s, 0, PASS, { margin: -100, brukSnitt: false, verdener: 0, nettFil: null }, orakel), MINSTE_TALLBUD);
});

test("terskelen er nøyaktig SD − minstebud ≥ margin", () => {
  const s = giv(7777);
  const sd = analyserGiv(s, orakel).sd[0]!;
  const b = lovligMinstebud(s)!;
  // Akkurat på grensen skal den by; ett hakk over skal den passe.
  assert.equal(budvaktBud(s, 0, PASS, { margin: sd - b, brukSnitt: false, verdener: 0, nettFil: null }, orakel), b);
  assert.equal(
    budvaktBud(s, 0, PASS, { margin: sd - b + 0.001, brukSnitt: false, verdener: 0, nettFil: null }, orakel),
    PASS,
  );
});

// ---------------------------------------------------------------------------
// Informasjonsdisiplin – den viktigste testen i fila
// ---------------------------------------------------------------------------

/** Bytter om kortene mellom de tre setene som IKKE er `sete`, og talongen. */
function stokkOmDeAndre(s: GameState, sete: number): GameState {
  const andre: number[] = [];
  for (let i = 0; i < s.antallSpillere; i++) if (i !== sete) andre.push(i);
  const hender = s.hender.map((h) => h.slice());
  // Roter de tre andre hendene, og bytt talongen mot den første av dem.
  const første = hender[andre[0]!]!;
  hender[andre[0]!] = hender[andre[1]!]!;
  hender[andre[1]!] = hender[andre[2]!]!;
  hender[andre[2]!] = første;
  const talong = s.talong.slice();
  const bytt = hender[andre[0]!]!.slice(0, talong.length);
  hender[andre[0]!] = talong.concat(hender[andre[0]!]!.slice(talong.length));
  return { ...s, hender, talong: bytt };
}

test("den blinde estimatoren ser BARE egen hånd: uendret når de andre stokkes om", () => {
  const sete = 1;
  for (const frø of [1001, 1002, 1003]) {
    const s = giv(frø);
    tømBlindCache();
    const før = blindSd(s, sete, 6, orakel);
    const byttet = stokkOmDeAndre(s, sete);
    // Kontroll på at testen faktisk endret noe.
    assert.notDeepEqual(
      s.hender.map((h) => h.map(kortId).sort()),
      byttet.hender.map((h) => h.map(kortId).sort()),
    );
    assert.deepEqual(
      s.hender[sete]!.map(kortId),
      byttet.hender[sete]!.map(kortId),
      "egen hånd skal stå urørt",
    );
    tømBlindCache();
    assert.equal(blindSd(byttet, sete, 6, orakel), før);
  }
});

test("ORAKELET jukser – og det er derfor det ikke kan promoteres", () => {
  // Speilbildet av testen over: orakelets tall MÅ endre seg når kortene
  // flyttes, for det er nettopp motstandernes hender det leser.
  const sete = 1;
  let ulike = 0;
  for (const frø of [1001, 1002, 1003, 1004, 1005]) {
    const s = giv(frø);
    const før = analyserGiv(s, orakel).sd[sete]!;
    const byttet = stokkOmDeAndre(s, sete);
    // Egen frøverdi, ellers svarer cachen med det gamle tallet.
    const etter = analyserGiv({ ...byttet, frø: s.frø + 5_000_000 }, orakel).sd[sete]!;
    if (etter !== før) ulike++;
  }
  assert.ok(ulike > 0, "orakelet skal reagere på motstandernes kort – det er juksedefinisjonen");
});

test("det blinde estimatet er deterministisk og innenfor stikkområdet", () => {
  const s = giv(2024);
  tømBlindCache();
  const a = blindSd(s, 2, 6, orakel);
  tømBlindCache();
  assert.equal(blindSd(s, 2, 6, orakel), a);
  assert.ok(a >= 0 && a <= s.giving.antallStikk, `estimatet ${a} er utenfor [0, ${s.giving.antallStikk}]`);
});

// ---------------------------------------------------------------------------
// Innpakningen
// ---------------------------------------------------------------------------

/** En agent som alltid passer og alltid legger sitt første lovlige kort. */
class AlltidPass implements Innagent {
  velgHandling(state: GameState): Handling {
    if (state.fase === "BUDRUNDE") return { type: "BUD", spiller: state.iTur!, bud: PASS };
    return { type: "NESTE" };
  }
}

test("Budvakt teller passene og overstyringene, og lar andre handlinger passere", () => {
  const s = giv(4242);
  const vakt = new Budvakt(new AlltidPass(), { margin: -100, brukSnitt: false, verdener: 0, nettFil: null }, orakel);
  const h = vakt.velgHandling(s);
  assert.deepEqual(h, { type: "BUD", spiller: s.iTur, bud: MINSTE_TALLBUD });
  assert.equal(vakt.passTotalt, 1);
  assert.equal(vakt.overstyrt, 1);

  const streng = new Budvakt(new AlltidPass(), { margin: 100, brukSnitt: false, verdener: 0, nettFil: null }, orakel);
  assert.deepEqual(streng.velgHandling(s), { type: "BUD", spiller: s.iTur, bud: PASS });
  assert.equal(streng.passTotalt, 1);
  assert.equal(streng.overstyrt, 0);

  // Ikke-budhandlinger telles ikke og røres ikke.
  const utenfor = { ...s, fase: "RUNDE_SLUTT" as const };
  assert.deepEqual(vakt.velgHandling(utenfor), { type: "NESTE" });
  assert.equal(vakt.passTotalt, 1);
});

test("Budvakt lar kortspillet være i fred", () => {
  // Den indre agenten spiller; vakten skal levere handlingen uendret videre.
  const indre = new NevroAgent();
  const vakt = new Budvakt(indre, ORAKEL0, orakel);
  let s = giv(31415);
  let guard = 0;
  let spilte = 0;
  while (s.fase !== "FERDIG" && guard++ < 400 && spilte < 20) {
    if (s.fase === "RUNDE_SLUTT") break;
    const fra = vakt.velgHandling(s);
    if (fra.type === "SPILL") {
      assert.deepEqual(fra, indre.velgHandling(s));
      spilte++;
    }
    s = utfør(s, fra).state;
  }
  assert.ok(spilte > 0, "testen spilte ingen kort – da beviser den ingenting");
});
