/**
 * FORKLARINGEN VAR DØD, OG INGENTING SA FRA.
 *
 * `src/moe2/forklar.ts` ble bygd som «å forklare hvorfor» — en av de
 * menneskelige evnene Adams skulle ha — og forekom **nøyaktig én gang i hele
 * repoet: sin egen definisjon.** 137 linjer, grundig dokumentert, uten én
 * kaller og uten én test.
 *
 * Det er samme mønster som den døde sanseblokken (§32) og den døde
 * v2-budblokken: en komponent som ser levende ut fordi den finnes og er
 * beskrevet. Ingen typesjekk fanger det, og ingen måling feiler — den bare
 * bidrar ikke med noe.
 *
 * Arvind: «det virker som mye kode som gjenbrukes blir utdatert.» Dette er den
 * verste varianten av det: kode som aldri ble brukt i det hele tatt.
 *
 * ================= HVA DENNE TESTEN FAKTISK VOKTER ======================
 *
 * At forklaringen KJØRER gjennom agenten, ikke bare at funksjonen finnes. En
 * test som kalte `forklarValg` direkte ville vært grønn selv om ingen agent
 * noensinne kalte den — altså nøyaktig den tilstanden vi kom fra.
 *
 * Derfor går den gjennom `Alphamuagent` med `forklar: true`, og krever at
 * `sisteForklaring` faktisk fylles av et ekte trekk i et ekte parti.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeKort } from "../src/motor.ts";
import { lagIndre, ADAMS } from "../src/moe2/agentspek.ts";
import { Alphamuagent } from "../src/moe2/amuagent.ts";

/** Spill fram til første stilling der noen har et reelt kortvalg. */
function førsteValg(frø: number): { s: GameState; sete: number } {
  const ag = [0, 1, 2, 3].map(() => lagIndre(ADAMS));
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  while (s.fase !== "FERDIG" && vakt++ < 400) {
    if (s.fase === "SPILL" && s.iTur !== null && lovligeKort(s, s.iTur).length > 1) break;
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, ag[iTur]!.velgHandling(s)).state;
  }
  assert.equal(s.fase, "SPILL", "kom aldri til en spillestilling");
  return { s, sete: s.iTur! };
}

test("alpha-mu-agenten fyller sisteForklaring naar forklar er paa", () => {
  const { s, sete } = førsteValg(4_400_000);
  const agent = new Alphamuagent(lagIndre(ADAMS), lagIndre(ADAMS), {
    verdener: 4,
    kandidater: 3,
    M: 1,
    frø: 12345,
    forklar: true,
    // Ingen rollebegrensning: testen skal treffe uansett hvilken rolle setet
    // tilfeldigvis har i denne given.
  });
  const h = agent.velgHandling(s);
  assert.equal(h.type, "SPILL");

  const f = agent.sisteForklaring;
  assert.ok(f !== null, "forklar: true, men sisteForklaring er null - modulen kjoerer ikke");
  assert.ok(f.tekst.length > 0, "forklaringen er tom");
  assert.ok(
    f.detaljer.verdener > 0,
    "forklaringen paastaar null verdener, altsaa er utfallsvektoren tom",
  );
  // Forklaringen MAA gjelde kortet som faktisk ble spilt. Gjoer den ikke det,
  // forklarer den et annet valg enn det som ble tatt - verre enn ingen
  // forklaring, fordi den ser troverdig ut.
  assert.equal(f.valgt.farge, h.kort.farge);
  assert.equal(f.valgt.verdi, h.kort.verdi);
  assert.ok(
    f.detaljer.bestI >= 0 && f.detaljer.bestI <= f.detaljer.verdener,
    `bestI ${f.detaljer.bestI} er utenfor 0..${f.detaljer.verdener}`,
  );
  assert.ok(Number.isFinite(f.detaljer.snitt), "snittet er ikke et tall");
});

test("uten forklar-flagget koster det ingenting - sisteForklaring blir staaende null", () => {
  const { s } = førsteValg(4_400_000);
  const agent = new Alphamuagent(lagIndre(ADAMS), lagIndre(ADAMS), {
    verdener: 4,
    kandidater: 3,
    M: 1,
    frø: 12345,
  });
  agent.velgHandling(s);
  assert.equal(
    agent.sisteForklaring,
    null,
    "forklaringen ble regnet ut selv om flagget var av - det er arbeid i hver " +
      "eneste maaling som spiller millioner av trekk",
  );
});

test("forklaringen navngir et ANNET kort som nest best, eller ingen", () => {
  // Sier den «X er 0,00 bedre enn X», er sammenlikningen mot seg selv og
  // tallet betyr ingenting.
  const { s } = førsteValg(5_100_000);
  const agent = new Alphamuagent(lagIndre(ADAMS), lagIndre(ADAMS), {
    verdener: 4,
    kandidater: 3,
    M: 1,
    frø: 999,
    forklar: true,
  });
  agent.velgHandling(s);
  const f = agent.sisteForklaring;
  if (f === null || f.detaljer.nestBeste === null) return; // ett lovlig kort: ingenting aa kreve
  const valgtNavn = f.tekst.split(":")[0]!;
  assert.notEqual(
    f.detaljer.nestBeste,
    valgtNavn,
    "nest beste er samme kort som det valgte - forklaringen sammenlikner mot seg selv",
  );
});
