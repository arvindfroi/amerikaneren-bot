/**
 * ROLLENAVNENE MÅ VÆRE ENIGE — på tvers av to språk og to skrivemåter.
 *
 * DETTE HAR ALLEREDE KOSTET. `examples/gate2.ts` skriver rollen som «foerer»
 * (ASCII), mens `verktoy/gate2-les.py` leste «fører» (med ø). De matchet aldri,
 * og FØRERRADEN VAR USYNLIG i hver eneste rapport — ikke feilet, bare utelatt.
 * Det skjulte at spilletids-søket er fire ganger sterkere enn det rapporterte
 * tallet, og at sansene bidrar til spillefører like mye som til forsvaret.
 *
 * ROTÅRSAKEN er at kodebasen har TO uforenlige `Rolle`-typer:
 *
 *   src/moe2/eksperter/felles.ts    «fører»  | makker | forsvar
 *   src/moe2/rolleorakel.ts         «foerer» | makker | forsvar
 *
 * De er separate deklarasjoner i separate moduler, så typesjekken kan ikke se
 * at de beskriver det samme. Denne testen dekker koblingen som faktisk brister:
 * den mellom det gate2 SKRIVER og det leseren FORSTÅR.
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROT = join(import.meta.dirname, "..");

/** Rollestrengene en fil nevner i anførselstegn. */
function rollenavn(kilde: string): Set<string> {
  const ut = new Set<string>();
  for (const m of kilde.matchAll(/["']((?:f[øo]e?rer|makker|forsvar))["']/g)) ut.add(m[1]!);
  return ut;
}

test("gate2-les.py forstår hver rolle gate2.ts skriver", () => {
  const skriver = rollenavn(readFileSync(join(ROT, "examples", "gate2.ts"), "utf8"));
  const leser = rollenavn(readFileSync(join(ROT, "verktoy", "gate2-les.py"), "utf8"));
  assert.ok(skriver.size > 0, "fant ingen rollestrenger i gate2.ts");
  const mangler = [...skriver].filter((r) => !leser.has(r));
  assert.deepEqual(
    mangler,
    [],
    `gate2.ts skriver rollene ${mangler.join(", ")} som leseren ikke kjenner – ` +
      `de radene blir STILLE utelatt fra hver rapport`,
  );
});

/**
 * Og fra den andre siden: leseren skal ikke lete etter noe som aldri skrives.
 * En slik rad ville alltid vært tom, og en tom rad ser ut som «ingen data»
 * i stedet for «feil nøkkel».
 */
test("leseren leter ikke etter roller som aldri skrives", () => {
  const skriver = rollenavn(readFileSync(join(ROT, "examples", "gate2.ts"), "utf8"));
  const leser = rollenavn(readFileSync(join(ROT, "verktoy", "gate2-les.py"), "utf8"));
  const ubrukt = [...leser].filter((r) => !skriver.has(r));
  // «fører» med ø er tillatt som HISTORISK form: gamle jsonl-filer i analyse/
  // har den, og leseren må kunne lese dem. Alt annet er en feil.
  const uventet = ubrukt.filter((r) => r !== "fører");
  assert.deepEqual(uventet, [], `leseren leter etter ${uventet.join(", ")} som ingen skriver`);
});

test("kamp-les.py og kamp.ts er enige om feltnavnene", () => {
  const skriver = readFileSync(join(ROT, "examples", "kamp.ts"), "utf8");
  const leser = readFileSync(join(ROT, "verktoy", "kamp-les.py"), "utf8");
  // Feltene kamp.ts legger i hver rad, og som leseren MÅ kjenne.
  for (const felt of ["kandVant", "miljøVant", "kandMargin", "miljøMargin", "kandRunder"]) {
    assert.ok(skriver.includes(felt), `kamp.ts skriver ikke «${felt}» lenger`);
    assert.ok(leser.includes(felt), `kamp-les.py kjenner ikke feltet «${felt}»`);
  }
});
