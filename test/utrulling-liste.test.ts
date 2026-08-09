/**
 * Utrullingssjekkens LISTE må utledes av appen, ikke skrives ned.
 *
 * `verktoy/sjekk-utrulling.ts` leser filnavnene ut av `web/app.ts`. Denne
 * prøven holder den utledningen ærlig: en håndskrevet liste ville drevet fra
 * appen ved neste endring, og en sjekk som sjekker FEIL liste er nøyaktig den
 * feilklassen den er satt til å fange.
 *
 * Nettverket røres ikke her — prøven gjelder utledningen, ikke endepunktet.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";

/** Samme utledning som verktøyet. Endres den ene, skal denne bli rød. */
function utled(app: string): Set<string> {
  const navn = new Set<string>(["worker.js", "app.js"]);
  for (const m of app.matchAll(/"([a-z0-9-]+\.(?:json|b64|bin|js))"/g)) navn.add(m[1]!);
  return navn;
}

test("utrullingssjekken utleder filnavnene fra web/app.ts", () => {
  const app = readFileSync("web/app.ts", "utf8");
  const navn = utled(app);

  // De som faktisk sviktet 6.–10. august. Faller en av dem ut av utledningen,
  // slutter sjekken å se på nettopp det som gikk galt sist.
  for (const kritisk of ["worker.js", "app.js", "bud-vant.json", "adams-kort.b64"]) {
    assert.ok(navn.has(kritisk), `utledningen mistet «${kritisk}»`);
  }
  assert.ok(navn.size >= 6, `fant bare ${navn.size} filer — utledningen er for smal`);
});

test("utledningen kan FEILE — en app uten vektfiler skal gi en tom liste", () => {
  const navn = utled('const DATA_URL = "https://eksempel/";\nconsole.log("hei");');
  assert.equal(navn.size, 2, `fant ${navn.size}, ventet bare worker.js og app.js`);
});

test("DATA_URL står ett sted, og lar seg lese ut", () => {
  const app = readFileSync("web/app.ts", "utf8");
  const treff = [...app.matchAll(/const DATA_URL = "([^"]+)"/g)];
  assert.equal(treff.length, 1, `DATA_URL står ${treff.length} steder — verktøyet leser den første`);
  assert.ok(treff[0]![1]!.endsWith("/"), "DATA_URL må slutte på «/», ellers blir stiene feil");
});
