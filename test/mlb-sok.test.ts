/**
 * SØKEGRENSESNITTET (§127) — det som må holde mens det står AV.
 *
 * `src/mlb/sok.ts` er bygd, koblet inn i `Sete.søk`, og satt av. Det er en
 * farlig tilstand: kode som ikke kjøres i noen driver er kode ingen oppdager
 * har råtnet. Prøvene her er derfor de fire som gjør «av» til en PÅSTAND som
 * kan feile:
 *
 *   1. et bord MED et søk som alltid sier `null` gir BIT-IDENTISKE koder mot et
 *      bord uten søk i det hele tatt
 *   2. et søk som gir en ULOVLIG kode blir tatt, med søkets navn i meldingen
 *   3. de trukne verdenene respekterer kapasitetene EKSAKT, og legger aldri et
 *      kort jeg allerede har sett
 *   4. K2: bytt ut de skjulte hendene, og verdenene er bit-identiske
 *
 * Og AVGJØRELSE 5: et søk i en GJENSPILLING skal stoppe kjøringen, fordi det er
 * der gradienten bygges.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lagRng, type Kort } from "../src/kort.ts";
import { opprettSpill, spillerVisning, utfør, type GameState } from "../src/index.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { maske, ta, TOMT_DELVALG, type Delvalg } from "../src/mlb/handling.ts";
import { velgKode } from "../src/mlb/nett.ts";
import {
  gjenspill,
  spillKamp,
  tilfeldigNett,
  type Sete,
} from "../src/mlb/selvspill.ts";
import {
  INGEN_SØK,
  kapasitet,
  kortFraIndeks,
  trekkVerdener,
  type Søk,
} from "../src/mlb/sok.ts";
import { setteKort } from "../src/mlb/trotrekk.ts";

const bord = (søk: Søk | null): Sete[] => {
  const nett = tilfeldigNett(lagRng(4711));
  return [0, 1, 2, 3].map((i) => ({
    navn: `s${i}`,
    nett,
    temperatur: 1,
    samle: true,
    ...(søk === null ? {} : { søk }),
  }));
};

test("kortFraIndeks er den EKSAKTE inversen av kortIndeks", () => {
  for (let i = 0; i < 52; i++) {
    const k = kortFraIndeks(i);
    assert.equal(kortIndeks(k), i, `kort ${i} kom ikke tilbake`);
  }
});

test("et søk som alltid sier null gir BIT-IDENTISKE koder", () => {
  /**
   * Den ene egenskapen som gjør at grensesnittet kan stå påkoblet og AV
   * samtidig. Faller den, er «søket står av» ikke lenger en påstand om
   * oppførsel — det er bare en påstand om at ingen har satt feltet.
   */
  for (const frø of [11_000_001, 11_000_002, 11_000_003]) {
    const uten = spillKamp({ frø, målPoeng: 30, maksRunder: 12, seter: bord(null) });
    const med = spillKamp({ frø, målPoeng: 30, maksRunder: 12, seter: bord(INGEN_SØK) });
    assert.deepEqual([...med.logg.koder], [...uten.logg.koder], `frø ${frø}: kodene skilte lag`);
    assert.equal(med.fasit.vinner, uten.fasit.vinner);
    assert.deepEqual([...med.fasit.sluttpoeng], [...uten.fasit.sluttpoeng]);
  }
});

test("et søk som gir en ULOVLIG kode blir tatt, med navnet sitt", () => {
  const ulovlig: Søk = {
    navn: "juksesøket",
    // 67 er en trumfkode, og den er ulovlig i alt annet enn VELG_TRUMF.
    velg: (p) => (p.delsteg === "SPILL_KORT" ? 67 : null),
  };
  assert.throws(
    () => spillKamp({ frø: 11_000_009, målPoeng: 30, maksRunder: 12, seter: bord(ulovlig) }),
    /juksesøket.*ULOVLIG/s,
  );
});

test("AVGJØRELSE 5: et søk i en GJENSPILLING stopper kjøringen", () => {
  const e = spillKamp({ frø: 11_000_020, målPoeng: 30, maksRunder: 12, seter: bord(null) });
  // Uten søk går gjenspillingen fint. `maksRunder` MÅ være den samme som i
  // spillingen — ellers spiller gjenspillingen videre forbi taket og går tom
  // for koder, og feilmeldingen peker et helt annet sted enn feilen.
  gjenspill(e.logg, { samleTrekk: true, maksRunder: 12 });
  const medSøk: Sete[] = e.logg.seter.map((navn) => ({
    navn,
    nett: null,
    temperatur: 0,
    egen: () => 0,
    samle: true,
    søk: INGEN_SØK,
  }));
  assert.throws(
    () => gjenspill(e.logg, { seter: medSøk, samleTrekk: true, maksRunder: 12 }),
    /AVGJØRELSE 5/,
  );
});

// ===========================================================================
// Verdenstrekkingen
// ===========================================================================

/**
 * Spiller fram til et gitt punkt og gir tilstanden der.
 *
 * Valgene tas av MLBs egen maske — den ENE lovlighetsregelen i systemet — så
 * stillingene er ekte og ikke konstruerte. Å byde «pass» fra alle fire er
 * ulovlig, og en håndskrevet sekvens ville truffet nettopp den slags.
 */
function stilling(frø: number, steg: number): GameState {
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 30 }, frø);
  const rng = lagRng(frø ^ 0x33);
  let tatt = 0;
  for (let i = 0; i < 5000 && s.fase !== "FERDIG" && tatt < steg; i++) {
    if (s.fase === "RUNDE_SLUTT") break;
    const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (sete === null) break;
    let delvalg: Delvalg = TOMT_DELVALG;
    for (let d = 0; d < 20; d++) {
      const visning = spillerVisning(s, sete);
      const m = maske(visning, s.giving, delvalg);
      const steget = ta(visning, s.giving, delvalg, velgKode(new Float32Array(m.length), m, 1, rng));
      if (steget.ferdig) {
        s = utfør(s, { ...steget.handling, spiller: sete } as never).state;
        tatt++;
        break;
      }
      delvalg = steget.delvalg;
    }
  }
  return s;
}

/** En flat tro: hver usett plassering like sannsynlig. */
const flatTro = (): number[][] => Array.from({ length: 52 }, () => [0.25, 0.25, 0.25, 0.25]);

test("trukne verdener respekterer kapasitetene EKSAKT", () => {
  let prøvd = 0;
  for (const frø of [21_000_001, 21_000_002, 21_000_003]) {
    for (const steg of [4, 8, 12, 16]) {
      const s = stilling(frø, steg);
      if (s.fase === "FERDIG" || s.fase === "RUNDE_SLUTT") continue;
      const sete = s.iTur ?? 0;
      const v = spillerVisning(s, sete);
      const sett = setteKort(v);
      const usett = 52 - sett.size;
      const kap = kapasitet(v, usett);
      const verdener = trekkVerdener(v, flatTro(), 8, lagRng(frø + steg));
      assert.ok(verdener.length > 0, `ingen verden trukket i frø ${frø} steg ${steg}`);
      for (const w of verdener) {
        prøvd++;
        assert.equal(w.talong.length, kap.talong, "talongen fikk feil antall");
        let sum = w.talong.length;
        for (let r = 1; r < 4; r++) {
          assert.equal(w.hender[r]!.length, kap.hender[r], `rel sete ${r} fikk feil antall`);
          sum += w.hender[r]!.length;
        }
        assert.equal(sum, usett, "verdenen delte ut et annet antall kort enn de usette");
        // INGEN SETT KORT I EN HYPOTESE. Et kort jeg har på hånden, har spilt,
        // eller har vraket selv er ikke en gjetning.
        const alle: Kort[] = [...w.talong, ...w.hender.flat()];
        const indekser = new Set(alle.map(kortIndeks));
        assert.equal(indekser.size, alle.length, "samme kort ble delt ut to ganger");
        for (const i of indekser) assert.ok(!sett.has(i), `kort ${i} er alt sett`);
      }
    }
  }
  assert.ok(prøvd > 20, `for få verdener prøvd: ${prøvd}`);
});

test("K2: verdenene er BIT-IDENTISKE når de skjulte hendene byttes ut", () => {
  /**
   * Trekkingen ser `SpillerVisning` og trohodets gjetning, og ingenting annet.
   * Prøven bytter ut de andres hender med noe helt annet — men beholder
   * ANTALLET, som er lovlig informasjon — og krever at verdenene er de samme.
   *
   * Feiler den, leser trekkingen skjult informasjon, og et søk oppå den ville
   * vært juks uansett hvor pent resten er skrevet.
   */
  for (const frø of [22_000_001, 22_000_002]) {
    const s = stilling(frø, 10);
    if (s.fase === "FERDIG" || s.fase === "RUNDE_SLUTT") continue;
    const sete = s.iTur ?? 0;
    const a = spillerVisning(s, sete);

    // Bytt de skjulte hendene: samme antall, andre kort. Ingen av dem kan være
    // noe setet har sett, ellers ville stillingen vært ulovlig og ikke bare ny.
    const sett = setteKort(a);
    const ledige = [...Array(52).keys()].filter((i) => !sett.has(i));
    const b: GameState = {
      ...s,
      hender: s.hender.map((h, p) => {
        if (p === sete) return h.slice();
        return h.map(() => kortFraIndeks(ledige.pop() ?? 0));
      }),
    };
    const v2 = spillerVisning(b, sete);
    const w1 = trekkVerdener(a, flatTro(), 5, lagRng(999));
    const w2 = trekkVerdener(v2, flatTro(), 5, lagRng(999));
    assert.deepEqual(w2, w1, "verdenene flyttet seg da de skjulte hendene ble byttet ut");
  }
});
