/**
 * SØKEVINDUET I STIKK (`~stikk=<fra>-<til>`, `src/moe2/sikkerorakel.ts`) — 14. sep.
 *
 * ================= HVORFOR KNOTTEN FINNES ================================
 *
 * Dekomponeringen av K1-forspranget (`D:\amb-grp\loop\dekomp.md`, 2640 runder) fordeler
 * +1,24 pp slik: budet +0,62 (på taket), vrak/trumf/etterlyst +0,08 (på taket),
 * **kortspill stikk 1–4 +0,49 pp på 1496 beslutninger (56,7 %)**, stikk 5–8 +0,06, og
 * **stikk 9–12 +0,00 pp på 17 beslutninger**. Samtidig er nettene UTEN søk par med
 * mennesket (+0,21 ± 0,18, ns): hele det rettferdige forspranget er søkets.
 *
 * Søket er altså det eneste virksomme verktøyet, og det brukes jevnt utover — også i
 * sluttspillet, som bærer null. Denne knotten flytter budsjettet dit tabellen sier.
 *
 * ================= HVA PRØVEN MÅ HOLDE FAST =============================
 *
 *   1. AV ER AV, STRUKTURELT. Uten feltet er `stikkvindu` null — ikke `[1, 12]`. Og et
 *      vindu som dekker HELE runden må velge bit-identisk med ingen knott: da vet vi at
 *      porten ikke rører tilfeldighetsstrømmen, og at «av» er gratis.
 *   2. VINDUET BITER. `~stikk=1-4` må velge ANDERLEDES enn ingen knott — ellers er dette
 *      en knott som ser levende ut fordi den står i strengen (samme feilklasse som
 *      «12k16d4», som slo hele søket av i stillhet).
 *   3. PORTEN STÅR PÅ RIKTIG STIKK. Telleren `beslutninger` skal røre seg PRESIS i
 *      stikkene i vinduet, 1-basert og inklusive i begge ender.
 *   4. INGEN KOLLISJON. `48k32e3LMD~stikk=1-4` må gi V=48, K=32, e=3, L, D OG vinduet —
 *      feltet plukkes før bokstavparsingen, så ingen av dem får se «stikk».
 *   5. `utenSøk` ER URØRT. Rollout-motparten må strippes bit for bit som før.
 *
 * Vektstiene kommer fra `ADAMS` og ikke fra tastaturet: `test/spek-en-kilde.test.ts`
 * (SKRALLE) krever at nye filer importerer speken i stedet for å skrive vektnavnene.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeKort } from "../src/motor.ts";
import { ADAMS, lagIndre, utenSøk } from "../src/moe2/agentspek.ts";
import type { Sikkerorakel } from "../src/moe2/sikkerorakel.ts";
import { NevroAgent } from "../src/nevro/index.ts";

/** `sik:alle:<sigma>:<verdensfelt>:<ADAMS>`, bygget og lest som et orakel. */
const bygg = (vFelt: string, sigma = 0): Sikkerorakel =>
  lagIndre(`sik:alle:${sigma}:${vFelt}:${ADAMS}`) as unknown as Sikkerorakel;

test("AV ER AV: uten «~stikk=» er vinduet null, ikke [1, 12]", () => {
  assert.equal(bygg("4k4").stikkvindu, null, "ingen knott skal gi ingen port");
  // Og med knotten er det NØYAKTIG det som står i strengen, 1-basert.
  assert.deepEqual(bygg("4k4~stikk=1-4").stikkvindu, [1, 4]);
  assert.deepEqual(bygg("4k4~stikk=5-12").stikkvindu, [5, 12]);
  assert.deepEqual(bygg("4k4~stikk=3-3").stikkvindu, [3, 3], "ett enkelt stikk er lovlig");
});

test("INGEN KOLLISJON: «48k32e3LMD»-feltet leses likt med og uten vinduet bakpå", () => {
  // «M» krever en økt, og den finnes ikke her — resten av kjeden er grunnlinjas.
  const uten = bygg("48k32e3LD");
  const med = bygg("48k32e3LD~stikk=1-4");
  for (const felt of ["eksaktBlad", "lagmål", "visningsfrø"] as const) {
    assert.deepEqual(med[felt], uten[felt], `«${felt}» endret seg av at vinduet ble lagt på`);
  }
  assert.equal(med.eksaktBlad, 3, "e3 skal fortsatt bli lest som eksaktBlad 3");
  assert.equal(med.lagmål, true);
  assert.equal(med.visningsfrø, true);
  assert.deepEqual(med.stikkvindu, [1, 4]);
  // Og trofeltet skal fortsatt kunne stå ved siden av, i begge rekkefølger.
  assert.deepEqual(bygg("4k4~lik=selv~stikk=2-5").stikkvindu, [2, 5]);
  assert.ok(bygg("4k4~stikk=2-5~lik=selv").likFor !== null, "«~lik=» overlevde at vinduet kom først");
});

test("en ugyldig «~stikk=» KASTER, den blir ikke stille av", () => {
  for (const dårlig of ["", "1", "4-1", "0-4", "-4", "1-", "a-b", "1-4-7", "1.5-4", "1--4"]) {
    assert.throws(
      () => bygg(`4k4~stikk=${dårlig}`),
      /~stikk=/,
      `«~stikk=${dårlig}» skulle kastet, ikke blitt tolket`,
    );
  }
  // Ukjent art kaster fortsatt, og meldingen nevner nå den nye formen.
  assert.throws(() => bygg("4k4~stikker=1-4"), /Ukjent ~-felt/);
});

test("«utenSøk» er urørt: rollout-motparten strippes bit for bit som før", () => {
  assert.equal(utenSøk(`sik:alle:0.5:48k32e3LMD~stikk=1-4:${ADAMS}`), ADAMS);
  assert.equal(utenSøk(`sik:alle:0.5:48k32e3LMD~mlbu=x.bin~stikk=1-4:${ADAMS}`), ADAMS);
  // Feltantallet er det som bærer strippingen, og «~stikk=» har ingen kolon.
  assert.equal(
    `sik:alle:0.5:48k32e3LMD~stikk=1-4:${ADAMS}`.split(":").length,
    `sik:alle:0.5:48k32e3LMD:${ADAMS}`.split(":").length,
    "vinduet la til et felt — da ville utenSøk strippet feil sted",
  );
});

/**
 * Spiller fram til `stillinger` kortvalg med mer enn ett lovlig kort, og gir for hvert av
 * dem kortet som ble valgt og hvilket STIKK (1-basert) det ble valgt i, sammen med om
 * søkeporten slapp beslutningen inn (`beslutninger` rørte seg).
 *
 * Spillet drives av faste `NevroAgent`-er og ikke av boten selv, som i
 * `test/amu-bitidentisk.test.ts`: da avhenger stillingene bare av frøet, så to armer
 * møter nøyaktig de samme stillingene og kan sammenliknes kort for kort.
 */
function spill(
  vFelt: string,
  stillinger: number,
  frø: number,
): { kort: string[]; stikk: number[]; slapp: boolean[] } {
  const sik = bygg(vFelt);
  const bot = sik as unknown as { velgHandling(s: GameState): { type: string; kort?: { farge: string; verdi: number } } };
  const ref = [0, 1, 2, 3].map(() => new NevroAgent());
  const kort: string[] = [];
  const stikk: number[] = [];
  const slapp: boolean[] = [];
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  while (kort.length < stillinger && s.fase !== "FERDIG" && vakt++ < 20_000) {
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iT = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iT === null || iT === undefined) break;
    if (s.fase === "SPILL" && lovligeKort(s, iT).length > 1) {
      const før = sik.tellere.beslutninger;
      const h = bot.velgHandling(s);
      kort.push(h.type === "SPILL" && h.kort !== undefined ? `${h.kort.farge}${h.kort.verdi}` : h.type);
      stikk.push(s.stikkSpilt + 1);
      slapp.push(sik.tellere.beslutninger > før);
    }
    s = utfør(s, ref[iT]!.velgHandling(s)).state;
  }
  return { kort, stikk, slapp };
}

const FRØ = 61_400_001;
const N = 120;

test("et vindu over HELE runden velger BIT-IDENTISK med ingen knott", () => {
  /**
   * Dette er selve «av er av»-beviset. Porten leser bare `stikkSpilt` og rører ikke
   * tilfeldighetsstrømmen, så et vindu som slipper alt gjennom må gi nøyaktig samme kort
   * som ingen port i det hele tatt. Feiler denne, koster knotten noe selv når den er av.
   */
  const uten = spill("4k4", N, FRØ);
  const alt = spill("4k4~stikk=1-12", N, FRØ);
  assert.ok(uten.kort.length >= 60, `for få stillinger (${uten.kort.length}) – prøven beviser lite`);
  assert.deepEqual(alt.kort, uten.kort, "et vindu over hele runden endret et kortvalg");
  assert.deepEqual(alt.slapp, uten.slapp, "porten endret hvilke beslutninger søket så");
});

test("VINDUET BITER: «~stikk=1-4» velger annerledes enn ingen knott", () => {
  const uten = spill("4k4", N, FRØ);
  const tidlig = spill("4k4~stikk=1-4", N, FRØ);
  assert.equal(tidlig.kort.length, uten.kort.length, "armene møtte ulike stillinger");
  const avvik = tidlig.kort.filter((k, i) => k !== uten.kort[i]).length;
  assert.ok(
    avvik > 0,
    `«~stikk=1-4» valgte likt med ingen knott i ALLE ${uten.kort.length} stillingene – ` +
      `knotten står i strengen uten å gjøre noe (samme feilklasse som «12k16d4»)`,
  );
});

test("PORTEN STÅR PÅ RIKTIG STIKK: 1-basert og inklusive i begge ender", () => {
  for (const [fra, til] of [
    [1, 4],
    [5, 8],
    [9, 12],
    [3, 3],
  ] as const) {
    const r = spill(`4k4~stikk=${fra}-${til}`, N, FRØ);
    for (let i = 0; i < r.kort.length; i++) {
      const iVinduet = r.stikk[i]! >= fra && r.stikk[i]! <= til;
      assert.equal(
        r.slapp[i],
        iVinduet,
        `stikk ${r.stikk[i]} med vindu ${fra}-${til}: søket ${r.slapp[i] ? "kjørte" : "hoppet over"} ` +
          `der det ${iVinduet ? "skulle kjørt" : "ikke skulle kjørt"}`,
      );
    }
    // Og vinduet må faktisk ha vært innom begge tilstander i utvalget.
    assert.ok(r.slapp.includes(true), `vindu ${fra}-${til} slapp aldri en eneste beslutning inn`);
  }
});

test("utenfor vinduet rører ingen teller seg, og «siste» blir stående null", () => {
  /**
   * Utenfor vinduet skal beslutningen se ut NØYAKTIG som en beslutning i feil rolle:
   * `lesUtfall` leser tellerne, og «ikke-rolle» er allerede den verdien som betyr «søket
   * gjelder ikke her». En fjerde utfallsverdi ville krevd at hver leser ble oppdatert.
   */
  const sik = bygg("4k4~stikk=1-2");
  const bot = sik as unknown as { velgHandling(s: GameState): unknown };
  const ref = [0, 1, 2, 3].map(() => new NevroAgent());
  let s: GameState = opprettSpill({ antallSpillere: 4 }, FRØ);
  let sett = 0;
  for (let vakt = 0; vakt < 20_000 && s.fase !== "FERDIG" && sett < 40; vakt++) {
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iT = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iT === null || iT === undefined) break;
    if (s.fase === "SPILL" && s.stikkSpilt + 1 > 2 && lovligeKort(s, iT).length > 1) {
      const før = { ...sik.tellere };
      bot.velgHandling(s);
      assert.deepEqual(sik.tellere, før, `en teller rørte seg i stikk ${s.stikkSpilt + 1}, utenfor vinduet`);
      assert.equal(sik.siste, null, `«siste» ble satt i stikk ${s.stikkSpilt + 1}, utenfor vinduet`);
      sett++;
    }
    s = utfør(s, ref[iT]!.velgHandling(s)).state;
  }
  assert.ok(sett > 10, `for få beslutninger utenfor vinduet (${sett}) – prøven beviser lite`);
});
