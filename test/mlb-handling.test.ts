/**
 * Sandkassens handlingsrom: masken må stemme EKSAKT med motoren.
 *
 * Dette er den prøven som gjør handlingsrommet trygt. Nettet velger bare
 * blant plassene masken åpner, så hvis masken avviker fra motorens egen
 * `lovligeHandlinger` — i noen retning — kan nettet enten velge ulovlig
 * eller bli fratatt et lovlig valg. Begge er stille feil.
 *
 * Prøvene her er skrevet slik at de KAN feile: hver har en kontrollarm med
 * en konstruert avvikende maske, og kontrollarmen skal bli tatt. En prøve
 * som ikke kan feile måler ingenting (`docs/plan.md`, gjentatt lærdom).
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { lovligeHandlinger, lovligeEtterlys, spillerVisning } from "../src/motor.ts";
import { lagRng, type Kort } from "../src/kort.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { MINSTE_TALLBUD } from "../src/regler.ts";
import {
  HANDLING_LENGDE,
  HANDLING_NAVN,
  TOMT_DELVALG,
  budKode,
  budFraKode,
  kortFraKode,
  kortKode,
  maske,
  nesteDelsteg,
  ta,
  trumfFraKode,
  trumfKode,
  type Delvalg,
  type Giving,
} from "../src/mlb/handling.ts";

const GIVING: Giving = { antallStikk: 13, talong: 0 };

/** Givingen for et firespillerspill, lest av motoren i stedet for antatt. */
function givingFor(s: GameState): Giving {
  return { antallStikk: s.giving.antallStikk, talong: s.giving.talong };
}

const kortLik = (a: Kort, b: Kort): boolean => a.farge === b.farge && a.verdi === b.verdi;

/** Plassene masken åpner, som en sortert liste av navn. */
function åpne(m: Uint8Array): string[] {
  const ut: string[] = [];
  for (let i = 0; i < m.length; i++) if (m[i] === 1) ut.push(HANDLING_NAVN[i]!);
  return ut.sort();
}

// ===========================================================================
// Kodingen er en bijeksjon
// ===========================================================================

test("MLB-handling: kort, bud og trumf koder og dekoder tilbake til seg selv", () => {
  const sett = new Set<number>();

  for (let i = 0; i < 52; i++) {
    const k = kortFraKode(i);
    assert.equal(kortKode(k), i, `kort ${i}`);
    sett.add(i);
  }
  for (let b = MINSTE_TALLBUD; b <= 13; b++) {
    const kode = budKode(b);
    assert.equal(budFraKode(kode), b, `bud ${b}`);
    assert.ok(!sett.has(kode), `budkode ${kode} kolliderer`);
    sett.add(kode);
  }
  for (const b of ["PASS", "AMERIKANER", "SOLO"] as const) {
    const kode = budKode(b);
    assert.equal(budFraKode(kode), b, b);
    assert.ok(!sett.has(kode), `${b} kolliderer`);
    sett.add(kode);
  }
  for (const f of ["S", "H", "R", "K"] as const) {
    const kode = trumfKode(f);
    assert.equal(trumfFraKode(kode), f, f);
    assert.ok(!sett.has(kode), `trumf ${f} kolliderer`);
    sett.add(kode);
  }

  assert.equal(sett.size, HANDLING_LENGDE, "hver plass brukt nøyaktig én gang");
  assert.equal(
    HANDLING_NAVN.filter((n) => n !== undefined).length,
    HANDLING_LENGDE,
    "hver plass har et navn",
  );
});

// ===========================================================================
// Masken mot motoren, alle faser, mange giv
// ===========================================================================

/**
 * Spiller tilfeldige, LOVLIGE partier og sammenlikner masken mot motorens
 * `lovligeHandlinger` i hver eneste stilling.
 */
function sveip(antallGiv: number, saboter: boolean): { sjekket: number; avvik: string[] } {
  const avvik: string[] = [];
  let sjekket = 0;

  for (let frø = 6_100_000; frø < 6_100_000 + antallGiv; frø++) {
    let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
    const rng = lagRng(frø ^ 0x5eed);
    const giving = givingFor(s);

    for (let vakt = 0; vakt < 4000 && s.fase !== "FERDIG"; vakt++) {
      const lovlig = lovligeHandlinger(s);

      if (lovlig.fase === "RUNDE_SLUTT") {
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      if (lovlig.fase === "FERDIG") break;

      const sete = lovlig.spiller;
      const visning = spillerVisning(s, sete);
      let delvalg: Delvalg = TOMT_DELVALG;
      let handling: Handling | null = null;

      // Gå gjennom fasens delsteg og sjekk masken ved hvert av dem.
      for (let steg = 0; steg < 20 && handling === null; steg++) {
        const m = maske(visning, giving, delvalg);
        const fikk = åpne(m);
        const vil = forventet(s, visning, delvalg);
        sjekket++;

        if (saboter && sjekket === 3) fikk.push("kort:S2"); // kontrollarm

        if (JSON.stringify(fikk) !== JSON.stringify(vil)) {
          avvik.push(
            `frø ${frø} ${visning.fase}/${nesteDelsteg(visning, delvalg)}: ` +
              `maske [${fikk.join(",")}] != motor [${vil.join(",")}]`,
          );
        }

        // Velg en tilfeldig lovlig plass og gå videre.
        const åpneKoder: number[] = [];
        for (let i = 0; i < m.length; i++) if (m[i] === 1) åpneKoder.push(i);
        assert.ok(åpneKoder.length > 0, `tom maske i ${visning.fase}`);
        const valgt = åpneKoder[Math.floor(rng() * åpneKoder.length)]!;

        const res = ta(visning, giving, delvalg, valgt);
        if (res.ferdig) {
          const h = res.handling;
          handling =
            h.type === "BUD"
              ? { type: "BUD", spiller: sete, bud: h.bud }
              : h.type === "VRAK"
                ? { type: "VRAK", spiller: sete, kort: h.kort }
                : h.type === "VELG"
                  ? { type: "VELG", spiller: sete, trumf: h.trumf, etterlyst: h.etterlyst }
                  : { type: "SPILL", spiller: sete, kort: h.kort };
        } else {
          delvalg = res.delvalg;
        }
      }

      assert.ok(handling !== null, `fant ingen handling i ${s.fase}`);
      s = utfør(s, handling).state;
    }
  }
  return { sjekket, avvik };
}

/** Hva motoren sier er lovlig, oversatt til de samme navnene. */
function forventet(
  s: GameState,
  visning: ReturnType<typeof spillerVisning>,
  delvalg: Delvalg,
): string[] {
  const lovlig = lovligeHandlinger(s);
  const steg = nesteDelsteg(visning, delvalg);

  if (steg === "BUD" && lovlig.fase === "BUDRUNDE") {
    return lovlig.bud.map((b) => HANDLING_NAVN[budKode(b)]!).sort();
  }
  if (steg === "VRAK_KORT" && lovlig.fase === "VRAK") {
    return lovlig.hånd
      .filter((k) => !delvalg.vrak.some((v) => kortLik(v, k)))
      .map((k) => HANDLING_NAVN[kortKode(k)]!)
      .sort();
  }
  if (steg === "VELG_TRUMF" && lovlig.fase === "VELG") {
    return lovlig.trumf.map((f) => HANDLING_NAVN[trumfKode(f)]!).sort();
  }
  if (steg === "VELG_ETTERLYST") {
    // Motorens egen regel, kjørt på den fulle tilstanden.
    return lovligeEtterlys(s, delvalg.trumf!)
      .map((k) => HANDLING_NAVN[kortKode(k)]!)
      .sort();
  }
  if (steg === "SPILL_KORT" && lovlig.fase === "SPILL") {
    return lovlig.kort.map((k) => HANDLING_NAVN[kortKode(k)]!).sort();
  }
  throw new Error(`Uventet steg ${steg} i fase ${s.fase}`);
}

test("MLB-handling: masken er identisk med motorens lovligeHandlinger i alle faser", () => {
  const { sjekket, avvik } = sveip(40, false);
  assert.ok(sjekket > 2000, `for få stillinger sjekket: ${sjekket}`);
  assert.deepEqual(avvik, [], `${avvik.length} avvik, første: ${avvik[0] ?? "-"}`);
});

test("MLB-handling: prøven kan FEILE — en maske med ett kort for mye skal tas", () => {
  const { avvik } = sveip(3, true);
  assert.ok(avvik.length > 0, "kontrollarmen slapp gjennom — prøven måler ingenting");
});

// ===========================================================================
// K2: masken skal ikke endre seg når BARE de skjulte kortene byttes
// ===========================================================================

test("MLB-handling: masken er bit-identisk når BARE de skjulte hendene byttes", () => {
  let sjekket = 0;
  let avvik = 0;

  for (let frø = 6_300_000; frø < 6_300_012; frø++) {
    let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
    const rng = lagRng(frø ^ 0xbeef);

    // Spill fram til midt i spillfasen, der det finnes skjult informasjon.
    for (let vakt = 0; vakt < 400 && s.fase !== "FERDIG"; vakt++) {
      const lovlig = lovligeHandlinger(s);
      if (lovlig.fase === "RUNDE_SLUTT") {
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      if (lovlig.fase === "FERDIG") break;

      if (lovlig.fase === "SPILL" && s.stikkSpilt >= 2) {
        const sete = lovlig.spiller;
        const giving = givingFor(s);
        const fasit = maske(spillerVisning(s, sete), giving, TOMT_DELVALG);

        // Bytt ut ALLE andres kort med en annen lovlig verden.
        const verdener = trekkVerdener(s, sete, 4, rng);
        for (const hender of verdener) {
          const annen = medVerden(s, hender, sete);
          const m = maske(spillerVisning(annen, sete), giving, TOMT_DELVALG);
          sjekket++;
          for (let i = 0; i < HANDLING_LENGDE; i++) {
            if (m[i] !== fasit[i]) {
              avvik++;
              break;
            }
          }
        }
        break;
      }

      // Kom videre med et vilkårlig lovlig valg.
      const sete = lovlig.spiller;
      const visning = spillerVisning(s, sete);
      const giving = givingFor(s);
      let delvalg: Delvalg = TOMT_DELVALG;
      let handling: Handling | null = null;
      for (let steg = 0; steg < 20 && handling === null; steg++) {
        const m = maske(visning, giving, delvalg);
        const åpneKoder: number[] = [];
        for (let i = 0; i < m.length; i++) if (m[i] === 1) åpneKoder.push(i);
        const res = ta(visning, giving, delvalg, åpneKoder[Math.floor(rng() * åpneKoder.length)]!);
        if (res.ferdig) {
          const h = res.handling;
          handling =
            h.type === "BUD"
              ? { type: "BUD", spiller: sete, bud: h.bud }
              : h.type === "VRAK"
                ? { type: "VRAK", spiller: sete, kort: h.kort }
                : h.type === "VELG"
                  ? { type: "VELG", spiller: sete, trumf: h.trumf, etterlyst: h.etterlyst }
                  : { type: "SPILL", spiller: sete, kort: h.kort };
        } else delvalg = res.delvalg;
      }
      s = utfør(s, handling!).state;
    }
  }

  assert.ok(sjekket > 20, `for få verdener sjekket: ${sjekket}`);
  assert.equal(avvik, 0, `${avvik} av ${sjekket} masker endret seg av skjulte kort`);
});

test("MLB-handling: K2-prøven kan FEILE — en maske som leser en skjult hånd blir tatt", () => {
  // Kontrollarm: en maske som lekker ÉN bit fra en annens hånd.
  const s = opprettSpill({ antallSpillere: 4 }, 6_300_000);
  let t = s;
  for (let vakt = 0; vakt < 400 && t.fase !== "SPILL"; vakt++) {
    const lovlig = lovligeHandlinger(t);
    if (lovlig.fase === "RUNDE_SLUTT") {
      t = utfør(t, { type: "NESTE" }).state;
      continue;
    }
    if (lovlig.fase === "FERDIG") break;
    const sete = lovlig.spiller;
    const visning = spillerVisning(t, sete);
    const giving = givingFor(t);
    let delvalg: Delvalg = TOMT_DELVALG;
    let handling: Handling | null = null;
    const rng = lagRng(1);
    for (let steg = 0; steg < 20 && handling === null; steg++) {
      const m = maske(visning, giving, delvalg);
      const åpneKoder: number[] = [];
      for (let i = 0; i < m.length; i++) if (m[i] === 1) åpneKoder.push(i);
      const res = ta(visning, giving, delvalg, åpneKoder[Math.floor(rng() * åpneKoder.length)]!);
      if (res.ferdig) {
        const h = res.handling;
        handling =
          h.type === "BUD"
            ? { type: "BUD", spiller: sete, bud: h.bud }
            : h.type === "VRAK"
              ? { type: "VRAK", spiller: sete, kort: h.kort }
              : h.type === "VELG"
                ? { type: "VELG", spiller: sete, trumf: h.trumf, etterlyst: h.etterlyst }
                : { type: "SPILL", spiller: sete, kort: h.kort };
      } else delvalg = res.delvalg;
    }
    t = utfør(t, handling!).state;
  }
  assert.equal(t.fase, "SPILL", "kom ikke til spillfasen");

  const sete = lovligeHandlinger(t).spiller!;
  const jukser = (st: GameState): Uint8Array => {
    const m = maske(spillerVisning(st, sete), givingFor(st), TOMT_DELVALG);
    const annen = st.hender.findIndex((_, p) => p !== sete);
    const lekk = st.hender[annen]?.[0];
    if (lekk) m[kortKode(lekk)] = 1; // ÉN bit fra en skjult hånd
    return m;
  };

  const fasit = jukser(t);
  const rng = lagRng(7);
  let tatt = false;
  for (const hender of trekkVerdener(t, sete, 6, rng)) {
    const m = jukser(medVerden(t, hender, sete));
    for (let i = 0; i < HANDLING_LENGDE; i++) {
      if (m[i] !== fasit[i]) tatt = true;
    }
  }
  assert.ok(tatt, "jukseren slapp gjennom — K2-prøven måler ingenting");
});

test("MLB-handling: ulovlige valg blir avvist i stedet for stilltiende rettet", () => {
  const s = opprettSpill({ antallSpillere: 4 }, 6_200_001);
  const lovlig = lovligeHandlinger(s);
  assert.equal(lovlig.fase, "BUDRUNDE");
  const visning = spillerVisning(s, lovlig.spiller);
  const giving = givingFor(s);

  const m = maske(visning, giving, TOMT_DELVALG);
  const stengt = [...m].findIndex((x) => x !== 1);
  assert.ok(stengt >= 0, "fant ingen stengt plass å prøve");

  assert.throws(
    () => ta(visning, giving, TOMT_DELVALG, stengt),
    /Ulovlig handling/,
    "en stengt plass skal kaste, ikke bli rettet",
  );
});

test("MLB-handling: en tom maske betyr at fasen ikke har noe valg", () => {
  const s = opprettSpill({ antallSpillere: 4 }, 6_200_002);
  const visning = spillerVisning(s, 0);
  // Et sete som ikke er i tur i budrunden har fortsatt en budmaske — men en
  // fase uten valg (RUNDE_SLUTT/FERDIG) skal gi tom maske.
  const tom = maske({ ...visning, fase: "FERDIG" }, GIVING, TOMT_DELVALG);
  assert.equal([...tom].reduce((a, b) => a + b, 0), 0, "FERDIG skal gi tom maske");
});
