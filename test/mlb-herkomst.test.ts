/**
 * HERKOMSTREGELEN — håndhevet, ikke lovet.
 *
 * `docs/mlb.md`, AVGJØRELSE 1b: «Ingen gradient og ingen INNGANG skal avhenge
 * av `sd-orakel`, dobbeltdummy eller `d7alle`. MÅLINGER kan.»
 *
 * Revisjonen fant at forbudet lakk fem steder da det bare sto i prosa: en
 * orakeletikett som INNGANG er strengere enn E1-initialisering, fordi den aldri
 * kan trenes bort. Derfor denne testen, som følger importgrafen fra `src/mlb/`
 * og sier fra hvis den noen gang når en forbudt modul.
 *
 * ================= HVA SOM ER FORBUDT, OG HVORFOR =======================
 *
 *   src/solver/       dobbeltdummy — ser alle fire hender
 *   *orakel*          `sd-orakel`, `sikkerorakel`, `rolleorakel`, `e1/orakel`
 *   sdagent/sdkort/…  SD-søkets valg som fasit («policy = søkets valg»)
 *   alphamu/amuagent  søket som lærer
 *   juksagent         måleverktøy med klarsyn
 *   vrakrang          `vrakorakel.ts` lagret som fil, 60 verdener per kandidat
 *
 * ================= OG HVA SOM ER LOV ====================================
 *
 * `src/neat/trekk.ts` og `src/nevro/trekk.ts` er kodinger av lovlig
 * informasjon. `estimerStikk` i `src/nevro/agent.ts` er en HÅNDLAGD formel med
 * faste konstanter — ingen vekter leses, ingen fasit konsulteres. Den
 * transitive importen av `nevro/nett.ts` bærer appens destillerte vekter, men
 * `troTrekk` kaller aldri `forover`. Testen bokfører derfor hele lukningen i
 * feilmeldingen, slik at et nytt navn i lista blir SETT og ikke antatt.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROT = resolve(import.meta.dirname, "..");
const MLB = resolve(ROT, "src/mlb");

/** Løs relativ import til en fil som finnes. */
function løs(fra: string, spek: string): string | null {
  if (!spek.startsWith(".")) return null; // ingen pakker i dette prosjektet
  const p = resolve(dirname(fra), spek);
  for (const kand of [p, `${p}.ts`, resolve(p, "index.ts")]) {
    if (existsSync(kand) && kand.endsWith(".ts")) return kand;
  }
  return null;
}

/** Transitiv importlukning fra en mengde startfiler. */
function lukning(start: string[]): Set<string> {
  const sett = new Set<string>();
  const kø = [...start];
  while (kø.length > 0) {
    const f = kø.pop()!;
    if (sett.has(f)) continue;
    sett.add(f);
    const kilde = readFileSync(f, "utf8");
    for (const m of kilde.matchAll(/(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g)) {
      const t = løs(f, m[1]!);
      if (t !== null) kø.push(t);
    }
    for (const m of kilde.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
      const t = løs(f, m[1]!);
      if (t !== null) kø.push(t);
    }
  }
  return sett;
}

const FORBUDT: readonly [RegExp, string][] = [
  [/[\\/]src[\\/]solver[\\/]/, "dobbeltdummy — ser alle fire hender"],
  [/orakel/i, "et orakel merket stillingen"],
  [/[\\/]sd(agent|kort|vrak|par)\.ts$/, "SD-søkets valg som fasit"],
  [/[\\/](alphamu|amuagent)\.ts$/, "søket som lærer"],
  [/juksagent/, "klarsyn"],
  [/vrakrang/, "vrakorakel lagret som fil"],
  [/mesterklone/, "en mester"],
];

/** Strenger som avslører en orakelavhengighet selv uten import. */
const FORBUDTE_STRENGER = ["d7alle", "sd-orakel", "vrakrang", "dobbeltdummy"];

test("MLB-herkomst: src/mlb importerer aldri et orakel, dobbeltdummy eller d7alle", () => {
  const start = readdirSync(MLB)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => resolve(MLB, f));
  assert.ok(start.length > 0, "src/mlb er tom — testen ville vært grønn på ingenting");

  const alle = lukning(start);
  const brudd: string[] = [];
  for (const f of alle) {
    for (const [re, hvorfor] of FORBUDT) {
      if (re.test(f)) brudd.push(`${f.slice(ROT.length + 1)} — ${hvorfor}`);
    }
  }
  assert.deepEqual(
    brudd,
    [],
    `HERKOMSTBRUDD: src/mlb når en forbudt modul.\n\n${brudd.join("\n")}\n\n` +
      `Hele importlukningen (${alle.size} filer):\n` +
      [...alle].map((f) => `  ${f.slice(ROT.length + 1)}`).sort().join("\n"),
  );
});

test("MLB-herkomst: ingen fil under src/mlb nevner en orakelkilde ved navn", () => {
  const brudd: string[] = [];
  for (const f of readdirSync(MLB).filter((x) => x.endsWith(".ts"))) {
    const kilde = readFileSync(resolve(MLB, f), "utf8");
    // Kommentarer kan gjerne FORKLARE hvorfor noe er forbudt; det er koden som
    // ikke skal peke dit. Derfor strippes blokk- og linjekommentarer først.
    const kode = kilde.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const s of FORBUDTE_STRENGER) {
      if (kode.includes(s)) brudd.push(`src/mlb/${f} nevner «${s}» i KODE, ikke bare i kommentar`);
    }
  }
  assert.deepEqual(brudd, [], brudd.join("\n"));
});

test("MLB-herkomst: prøven kan FEILE — en konstruert forbudt sti skal tas", () => {
  /**
   * En prøve som aldri kan feile er ikke en prøve. Her mates lukningsregelen med
   * en sti som ER forbudt, og den må svare ja.
   */
  const påfunn = resolve(ROT, "src/solver/dds.ts");
  const tatt = FORBUDT.some(([re]) => re.test(påfunn));
  assert.ok(tatt, "regelsettet fanger ikke engang src/solver/ — da beviser den grønne testen ingenting");
});
