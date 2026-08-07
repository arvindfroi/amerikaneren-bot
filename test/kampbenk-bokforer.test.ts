/**
 * KAMPBENKEN MÅ FYLLE PROFILBOKA — ellers er K6 umålbar der den hører hjemme.
 *
 * `Profilbok.observer` bokfører bare på `RUNDE_SLUTT`, og den ble bare kalt
 * fra `Profilagent.velgHandling`. `examples/kamp.ts` håndterer den fasen selv
 * med `utfør(s, NESTE)` og spør aldri en agent om et trekk der.
 *
 * **Målt: 25/24/24/27 bokførte runder med tikk, 0/0/0/0 uten.**
 *
 * Konsekvensen var strukturell, ikke gradvis: K6 — «lære andre spilleres vaner
 * ila spillet og utnytte de» — var umålbar på den ENESTE benken som spiller
 * kamper lange nok til at noen kunne lært noe. Gate 2 gir én runde med friske
 * agenter; kampbenken gir mange runder, men fylte ikke boka.
 *
 * `test/profilagent.test.ts` hadde krykken (`a.velgHandling(s)` med
 * kommentaren «la profilen bokføre runden»). At en test trenger en krykke for
 * å få en komponent til å virke, er selve varselet.
 *
 * ================= HVA DENNE TESTEN VOKTER =============================
 *
 * At kroken NÅR FRAM gjennom hele stakken. `Profilagent` ligger under `okt:`,
 * `vr:` og `amu:` i ADAMS_V6/V7, så `observer` må videresendes av hvert lag.
 * Glemmer ett av dem det, er boka tom igjen — og ingenting feiler.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lagIndre, ADAMS_MAALT } from "../src/moe2/agentspek.ts";

/** Stakken kampbenken faktisk måler med, i miniatyr. */
const MED_PROFIL = `okt:vr:e1-modell/vrakrang.bin:telrd:profil:${ADAMS_MAALT}`;

/**
 * Spill en kamp slik `examples/kamp.ts` gjør, og tell hvor mange runder
 * agentene fikk se ferdigspilt.
 */
function bokførteRunder(spek: string, tikk: boolean, runder: number): number {
  const agenter = [0, 1, 2, 3].map(() => lagIndre(spek));
  for (const a of agenter) a.nyKamp();
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 4_100_000);
  let vakt = 0;
  let sett = 0;
  while (s.fase !== "FERDIG" && vakt++ < 20_000 && s.rundeNr < runder) {
    if (s.fase === "RUNDE_SLUTT") {
      if (tikk) {
        for (const a of agenter) {
          if (typeof a.observer === "function") {
            a.observer(s);
            sett++;
          }
        }
      }
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, agenter[iTur]!.velgHandling(s)).state;
  }
  return sett;
}

test("kroken NAAR FREM gjennom okt:, vr: og profil:", () => {
  const a = lagIndre(MED_PROFIL);
  assert.equal(
    typeof a.observer,
    "function",
    "ytterste lag har ingen `observer` - da kan ingen driver bokfoere, og " +
      "profilboka er tom paa kampbenken uansett hva den indre koden gjoer",
  );
});

test("kampbenkens loekke bokfoerer runder naar tikket er paa", () => {
  const med = bokførteRunder(MED_PROFIL, true, 8);
  assert.ok(
    med > 0,
    `0 bokfoerte runder med tikket PAA. Da naar ikke kroken gjennom stakken, ` +
      `og K6 er umaalbar paa kampbenken.`,
  );
});

test("uten tikket blir boka staaende tom - det var feilen", () => {
  // Falsifiseringen: samme kodevei, samme froe, bare uten kallet. Er dette
  // tallet ogsaa positivt, maaler testen over ingenting.
  const uten = bokførteRunder(MED_PROFIL, false, 8);
  assert.equal(
    uten,
    0,
    `${uten} bokfoerte runder UTEN tikket. Da bokfoerer noe annet ogsaa, og ` +
      `testen over beviser ikke at kroken er det som virker.`,
  );
});

test("en stakk UTEN profil: har ingenting aa bokfoere, og skal ikke kaste", () => {
  // `observer` er valgfri. Et lag uten den skal ikke velte en driver som
  // kaller den - derfor `?.` overalt, og derfor denne testen.
  const uten = lagIndre(ADAMS_MAALT);
  assert.doesNotThrow(() => {
    const s = opprettSpill({ antallSpillere: 4 }, 4_100_000);
    (uten as { observer?(x: GameState): void }).observer?.(s);
  }, "en stakk uten profil: kastet paa observer - da kan ingen driver kalle den trygt");
});
