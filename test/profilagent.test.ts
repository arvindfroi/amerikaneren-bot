/**
 * MOTSTANDERMODELLEN, KOBLET INN — og garantien som gjør den trygg.
 *
 * `src/moe2/profil.ts` har vært bygget og testet siden 4. august uten å være
 * koblet til noe. Denne testen dekker koblingen, og den viktigste egenskapen
 * er den FØRSTE: uten kunnskap skal boten spille NØYAKTIG som før.
 *
 * Uten den garantien er en motstandermodell en risiko i hver eneste runde den
 * ikke har rukket å lære noe.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { Profilbok } from "../src/moe2/profilagent.ts";
import { NevroAgent } from "../src/nevro/index.ts";

const BASE = "budm:e1-modell/bud-vant.json@-3.0:vakt:abmp:e1:e1-modell/d7alle.bin";

/** Spiller en kamp og returnerer hvert bud kandidaten avga. */
function budene(spek: string, frø: number, runder: number): string[] {
  const a = lagIndre(spek);
  const miljø = [0, 1, 2, 3].map(() => new NevroAgent());
  const ut: string[] = [];
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.rundeNr < runder && vakt++ < 8000) {
    if (s.fase === "RUNDE_SLUTT") {
      a.velgHandling(s); // la profilen bokføre runden
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    const h = iTur === 0 ? a.velgHandling(s) : miljø[iTur]!.velgHandling(s);
    if (iTur === 0 && s.fase === "BUDRUNDE") ut.push(h.type === "BUD" ? String(h.bud) : h.type);
    s = utfør(s, h).state;
  }
  return ut;
}

test("UTEN kunnskap spiller boten NØYAKTIG som før – hard garanti", () => {
  for (const frø of [3_100_000, 4_200_000, 5_300_000]) {
    // Én runde: profilen har ikke rukket å lære noe som helst.
    assert.deepEqual(budene(`profil:${BASE}`, frø, 1), budene(BASE, frø, 1));
  }
});

test("tom profil gir NØYAKTIG null justering", () => {
  const bok = new Profilbok();
  const ag = [0, 1, 2, 3].map(() => new NevroAgent());
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 7_100_000);
  let vakt = 0;
  let sett = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
    if (s.fase === "BUDRUNDE") {
      assert.equal(bok.justering(s), 0, "ukjent motpart ga ikke-null justering");
      sett++;
    }
    const iT = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iT === null || iT === undefined) break;
    s = utfør(s, ag[iT]!.velgHandling(s)).state;
  }
  assert.ok(sett > 2, `for få budstillinger (${sett})`);
});

test("profilen LÆRER: den bokfører runder og bygger tiltro", () => {
  const bok = new Profilbok();
  const ag = [0, 1, 2, 3].map(() => new NevroAgent());
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 8_200_000);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.rundeNr < 6 && vakt++ < 8000) {
    bok.observer(s);
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iT = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iT === null || iT === undefined) break;
    s = utfør(s, ag[iT]!.velgHandling(s)).state;
  }
  // Fem-seks runder skal ha gitt observasjoner i hvert sete.
  for (let sete = 0; sete < 4; sete++) {
    assert.ok(bok.runder(sete) >= 4, `sete ${sete} har bare ${bok.runder(sete)} runder`);
  }
});

/**
 * NY KAMP, NY PROFIL. Å bære kunnskap mellom kamper ville vært den databasen
 * Arvind uttrykkelig ikke ville ha: «ingen data på forhånd».
 */
test("nyKamp nullstiller profilen", () => {
  const a = lagIndre(`profil:${BASE}`) as unknown as { bok: Profilbok; nyKamp(): void };
  const ag = [0, 1, 2, 3].map(() => new NevroAgent());
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 9_300_000);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.rundeNr < 4 && vakt++ < 8000) {
    a.bok.observer(s);
    if (s.fase === "RUNDE_SLUTT") { s = utfør(s, { type: "NESTE" }).state; continue; }
    const iT = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iT === null || iT === undefined) break;
    s = utfør(s, ag[iT]!.velgHandling(s)).state;
  }
  assert.ok(a.bok.runder(1) > 0, "lærte ingenting i det hele tatt");
  a.nyKamp();
  assert.equal(a.bok.runder(1), 0, "profilen overlevde nyKamp");
});

/**
 * SPILLETILPASNING. Budtilpasning er den enkle halvparten; det meste ligger i
 * å modellere hvordan folk SPILLER. Profilen leser trumfutspill som stilmål og
 * gir søket et vaktflagg å rulle ut med.
 */
test("stilen er null til vi vet nok – to runder er verre enn ingen stil", () => {
  const bok = new Profilbok();
  assert.equal(bok.spillestil(), null, "tom profil ga en stil");
  const ag = [0, 1, 2, 3].map(() => new NevroAgent());
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 5_500_000);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.rundeNr < 2 && vakt++ < 8000) {
    bok.observer(s);
    if (s.fase === "RUNDE_SLUTT") { s = utfør(s, { type: "NESTE" }).state; continue; }
    const iT = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iT === null || iT === undefined) break;
    s = utfør(s, ag[iT]!.velgHandling(s)).state;
  }
  assert.equal(bok.spillestil(), null, "to runder ga allerede en stil");
});

test("trumfutspill BLIR faktisk registrert – ellers er stilen tom uansett", () => {
  const bok = new Profilbok();
  const ag = [0, 1, 2, 3].map(() => new NevroAgent());
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 6_600_000);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.rundeNr < 10 && vakt++ < 20000) {
    bok.observer(s);
    if (s.fase === "RUNDE_SLUTT") { s = utfør(s, { type: "NESTE" }).state; continue; }
    const iT = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iT === null || iT === undefined) break;
    s = utfør(s, ag[iT]!.velgHandling(s)).state;
  }
  let n = 0;
  for (let sete = 0; sete < 4; sete++) n += bok.profilFor(sete).trumfutspill.n;
  assert.ok(n > 0, "ingen trumfutspill registrert på ti runder – feltet fylles ikke");
});
