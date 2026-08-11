/**
 * Broen: `Sandkasseagent` mot selvspillsløkka, og K2.
 *
 * Beslutningsløkka finnes to steder — inne i `spillKamp` (`selvspill.ts`) og i
 * `Sandkasseagent` (`spekagent.ts`). To implementasjoner av samme regel er
 * prosjektets nest verste feilklasse, og den ENESTE grunnen til at det er
 * forsvarlig her er denne fila: begge kjøres med samme nett og samme
 * stillinger, og valgene må være identiske.
 *
 * Ved temperatur 0 er `velgKode` ren argmaks, så likheten skal ikke avhenge av
 * rng i det hele tatt. Det er nettopp derfor prøven kjøres der.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { lovligeHandlinger, spillerVisning } from "../src/motor.ts";
import { lagRng } from "../src/kort.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { Sandkasseagent } from "../src/mlb/spekagent.ts";
import { Sandkassenett } from "../src/mlb/nett.ts";
import { spillKamp } from "../src/mlb/selvspill.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";

const nett = Sandkassenett.tilfeldig(7_310_001);

/** Spiller en kamp der ALLE fire seter er samme `Sandkasseagent`-oppsett. */
function spillMedAdapter(
  frø: number,
  målPoeng: number,
  hukommelse: boolean,
  koder?: number[],
): string[] {
  const agenter = [0, 1, 2, 3].map(
    () =>
      new Sandkasseagent(nett, {
        temperatur: 0,
        frø,
        hukommelse,
        påKode: koder === undefined ? undefined : (k) => koder.push(k),
      }),
  );
  for (const a of agenter) a.nyKamp();

  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng }, frø);
  const spor: string[] = [];

  // RUNDETAKET SPEILES NOEYAKTIG: `spillKamp` sjekker `rundeNr >= maksRunder`
  // OEVERST i loekka, foer bokfoeringen og foer RUNDE_SLUTT-grenen. Foerste
  // utkast her brukte `> 40` etterpaa, og da kjoerte adapteren 58 koder lenger
  // enn loekka paa ellers IDENTISKE valg. Prøven fant altsaa en forskjell i
  // stoppebetingelsen, ikke i en beslutning - men den ville sett like roed ut.
  for (let vakt = 0; vakt < 60_000 && s.fase !== "FERDIG"; vakt++) {
    if (s.rundeNr >= 40) break;
    const lovlig = lovligeHandlinger(s);
    if (lovlig.fase === "RUNDE_SLUTT") {
      for (const a of agenter) a.observerRunde(s);
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    if (lovlig.fase === "FERDIG") break;

    const h: Handling = agenter[lovlig.spiller]!.velgHandling(s);
    spor.push(nøkkel(h));
    s = utfør(s, h).state;
  }
  return spor;
}

const nøkkel = (h: Handling): string =>
  h.type === "BUD"
    ? `BUD:${h.spiller}:${String(h.bud)}`
    : h.type === "VRAK"
      ? `VRAK:${h.spiller}:${h.kort.map((k) => `${k.farge}${k.verdi}`).join("+")}`
      : h.type === "VELG"
        ? `VELG:${h.spiller}:${h.trumf}:${h.etterlyst ? `${h.etterlyst.farge}${h.etterlyst.verdi}` : "-"}`
        : h.type === "SPILL"
          ? `SPILL:${h.spiller}:${h.kort.farge}${h.kort.verdi}`
          : "NESTE";

// ===========================================================================
// 1. DE TO LØKKENE ER ENIGE
// ===========================================================================

test("MLB-bro: adapteren og selvspillsløkka velger identisk ved temperatur 0", () => {
  let sammenliknet = 0;

  for (const frø of [7_400_001, 7_400_002, 7_400_003]) {
    const erfaring = spillKamp({
      frø,
      målPoeng: 30,
      seter: [0, 1, 2, 3].map((i) => ({ navn: `n${i}`, nett, temperatur: 0 })),
      hukommelse: true,
      maksRunder: 40,
    });

    const fraLøkka = [...erfaring.logg.koder];
    assert.ok(
      fraLøkka.length > 20,
      `selvspillsloekka ga bare ${fraLøkka.length} koder — da sammenlikner proeven ingenting`,
    );

    const mine: number[] = [];
    spillMedAdapter(frø, 30, true, mine);
    assert.deepEqual(mine, fraLøkka, `froe ${frø}: de to beslutningsloekkene er uenige`);
    sammenliknet++;
  }

  assert.ok(sammenliknet > 0, "ingen kamper ble sammenliknet");
});

test("MLB-bro: adapteren er deterministisk — samme stilling gir samme valg", () => {
  const a = spillMedAdapter(7_500_001, 30, true);
  const b = spillMedAdapter(7_500_001, 30, true);
  assert.ok(a.length > 20, `for kort spor: ${a.length}`);
  assert.deepEqual(a, b, "to kjøringer av samme frø ga ulike valg");
});

test("MLB-bro: prøven kan FEILE — hukommelse av og på skal gi ulike spor", () => {
  const med = spillMedAdapter(7_500_002, 30, true);
  const uten = spillMedAdapter(7_500_002, 30, false);
  assert.notDeepEqual(
    med,
    uten,
    "hukommelsen endret ingenting — da måler likhetsprøvene over ingenting",
  );
});

// ===========================================================================
// 2. K2 — adapteren ser aldri de skjulte kortene
// ===========================================================================

test("MLB-bro: valget er identisk når BARE de skjulte hendene byttes", () => {
  let sjekket = 0;
  let avvik = 0;

  for (let frø = 7_600_000; frø < 7_600_010; frø++) {
    let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
    const agent = new Sandkasseagent(nett, { temperatur: 0, frø });
    const rng = lagRng(frø ^ 0x51de);

    for (let vakt = 0; vakt < 400 && s.fase !== "FERDIG"; vakt++) {
      const lovlig = lovligeHandlinger(s);
      if (lovlig.fase === "RUNDE_SLUTT") {
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      if (lovlig.fase === "FERDIG") break;

      if (lovlig.fase === "SPILL" && s.stikkSpilt >= 2) {
        // Fersk agent per arm: hukommelsen skal ikke bære over mellom dem.
        const fasit = nøkkel(
          new Sandkasseagent(nett, { temperatur: 0, frø }).velgHandling(s),
        );
        for (const hender of trekkVerdener(s, lovlig.spiller, 4, rng)) {
          const annen = medVerden(s, hender, lovlig.spiller);
          const valg = nøkkel(
            new Sandkasseagent(nett, { temperatur: 0, frø }).velgHandling(annen),
          );
          sjekket++;
          if (valg !== fasit) avvik++;
        }
        break;
      }
      s = utfør(s, agent.velgHandling(s)).state;
    }
  }

  assert.ok(sjekket > 20, `for få verdener sjekket: ${sjekket}`);
  assert.equal(avvik, 0, `${avvik} av ${sjekket} valg endret seg av SKJULTE kort`);
});

test("MLB-bro: K2-prøven kan FEILE — en agent som ser en skjult hånd blir tatt", () => {
  const s0 = opprettSpill({ antallSpillere: 4 }, 7_600_000);
  let s: GameState = s0;
  const agent = new Sandkasseagent(nett, { temperatur: 0, frø: 1 });
  for (let vakt = 0; vakt < 400 && s.fase !== "SPILL"; vakt++) {
    const lovlig = lovligeHandlinger(s);
    if (lovlig.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    if (lovlig.fase === "FERDIG") break;
    s = utfør(s, agent.velgHandling(s)).state;
  }
  assert.equal(s.fase, "SPILL", "kom ikke til spillfasen");

  const sete = lovligeHandlinger(s).spiller!;
  // Jukseren: leser ETT kort fra en annens hånd inn i sitt eget svar.
  const jukser = (st: GameState): string => {
    const rent = new Sandkasseagent(nett, { temperatur: 0, frø: 1 }).velgHandling(st);
    const annen = st.hender.findIndex((_, p) => p !== sete);
    const lekk = st.hender[annen]?.[0];
    return `${nøkkel(rent)}|${lekk ? `${lekk.farge}${lekk.verdi}` : "-"}`;
  };

  const fasit = jukser(s);
  const rng = lagRng(3);
  let tatt = false;
  for (const hender of trekkVerdener(s, sete, 6, rng)) {
    if (jukser(medVerden(s, hender, sete)) !== fasit) tatt = true;
  }
  assert.ok(tatt, "jukseren slapp gjennom — K2-prøven måler ingenting");
});

// ===========================================================================
// 3. Adapteren spiller bare lovlig
// ===========================================================================

test("MLB-bro: adapteren velger aldri ulovlig, i noen fase", () => {
  let valg = 0;
  for (let frø = 7_700_000; frø < 7_700_006; frø++) {
    const agenter = [0, 1, 2, 3].map(
      () => new Sandkasseagent(nett, { temperatur: 0.7, frø }),
    );
    for (const a of agenter) a.nyKamp();
    let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 30 }, frø);

    for (let vakt = 0; vakt < 20_000 && s.fase !== "FERDIG"; vakt++) {
      const lovlig = lovligeHandlinger(s);
      if (lovlig.fase === "RUNDE_SLUTT") {
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      if (lovlig.fase === "FERDIG") break;
      if (s.rundeNr > 40) break;
      // `utfør` er dommeren: den kaster på en ulovlig handling.
      s = utfør(s, agenter[lovlig.spiller]!.velgHandling(s)).state;
      valg++;
    }
  }
  assert.ok(valg > 500, `for få valg prøvd: ${valg}`);
});

// ===========================================================================
// 4. «mlb:»-laget — broen skal kunne bygges av den KANONISKE parseren
// ===========================================================================

test("MLB-bro: «mlb:»-speken bygger, alene og nestet under et annet lag", () => {
  for (const spek of [
    "mlb:tilfeldig7310001",
    "mlb:tilfeldig7310001@0.7",
    "mlb:tilfeldig7310001h0",
    "vakt:abmp:mlb:tilfeldig7310001",
  ]) {
    const a = lagIndre(spek);
    assert.ok(a !== null && typeof a.velgHandling === "function", `«${spek}» bygde ikke`);
  }
});

test("MLB-bro: «mlb:» feiler HØYLYTT på en ugyldig spek", () => {
  for (const spek of ["mlb:", "mlb:tilfeldig7310001@abc", "mlb:tilfeldigxyz"]) {
    assert.throws(() => lagIndre(spek), `«${spek}» skulle kastet`);
  }
});

test("MLB-bro: temperaturen er 0 som standard — en benk skal ikke sample", () => {
  // AVGJØRELSE 4: samplet i trening, argmaks i måling. Står den ikke i speken,
  // MÅ den være 0 — ellers måler gate 2 sin egen støy og nullarmen bommer.
  const s = opprettSpill({ antallSpillere: 4 }, 7_900_001);
  const a = lagIndre("mlb:tilfeldig7310001");
  const b = lagIndre("mlb:tilfeldig7310001");
  assert.equal(nøkkel(a.velgHandling(s)), nøkkel(b.velgHandling(s)));
});
