import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { E1_SPILL_DIM, E1_SPILL_DIM_V2 } from "../src/e1/trekk.ts";
import { ANTALL_INN } from "../src/neat/trekk.ts";

/**
 * LÅSER FORMATET til `examples/sd-orakel.ts` mot `examples/e1-orakel.ts`.
 *
 * Hele poenget med SD-generatoren er at `verktoy/e1-tren.py` skal virke
 * UENDRET, og at SD-data skal kunne sammenlignes direkte mot DD-data på samme
 * trener. Da må linjene ha samme nøkler og samme dimensjoner.
 *
 * Den konkrete feilen testen er skrevet mot: `t` (273) og `nt` (318) er lette
 * å forveksle, og gjorde det tre ganger 25. juli 2026. En ombytting er stille
 * – JSON har ingen typer – og oppdages først som en trening som ikke lærer.
 */

const TREKK_T = 273; // v1: kodingen sd-r2.bin og eldre nett ble trent med
const TREKK_T2 = 340; // v2: v1 + minneblokken (eget vrak, korrigert «ute»)
const TREKK_NT = 318;

/** Nøklene e1-orakel skriver, uten den fasitspesifikke (`dybde`/`sdVerdener`). */
const FELLESNØKLER = ["t", "nt", "v", "n", "frø", "stikk"] as const;

test("konstantene er de forventede, så resten av testen betyr noe", () => {
  assert.equal(E1_SPILL_DIM, TREKK_T);
  assert.equal(E1_SPILL_DIM_V2, TREKK_T2);
  assert.equal(ANTALL_INN, TREKK_NT);
  assert.notEqual(TREKK_T, TREKK_NT, "hele forvekslingsfaren avhenger av at de er ulike");
});

test("sd-orakel skriver e1-formatet", () => {
  const mappe = mkdtempSync(join(tmpdir(), "sd-orakel-"));
  const fil = join(mappe, "skard-0.jsonl");
  // Små tall: testen skal låse FORMATET, ikke måle SD-evalueringen.
  execFileSync(
    process.execPath,
    ["examples/sd-orakel.ts", "--ut", fil, "--kamper", "2", "--verdener", "2", "--sjanse", "1", "--maks", "3"],
    { cwd: join(import.meta.dirname, ".."), stdio: "ignore" },
  );
  const linjer = readFileSync(fil, "utf8").trim().split("\n");
  assert.ok(linjer.length >= 1, "generatoren skrev ingen linjer");

  for (const linje of linjer) {
    const r = JSON.parse(linje) as Record<string, unknown>;
    assert.deepEqual(
      Object.keys(r).sort(),
      [...FELLESNØKLER, "sdVerdener"].sort(),
      "nøkkelsettet har endret seg; e1-tren.py og sammenligningen mot DD-data avhenger av det",
    );

    const t = r["t"] as number[];
    const nt = r["nt"] as number[];
    assert.equal(t.length, TREKK_T2, "t skal være E1-vektoren i v2 (340), ikke NEAT-vektoren");
    assert.equal(nt.length, TREKK_NT, "nt skal være NEAT-vektoren (318), ikke E1-vektoren");
    assert.ok(t.every((x) => Number.isFinite(x)));
    assert.ok(nt.every((x) => Number.isFinite(x)));

    // `v` er kortindeks → verdi, ikke en liste i lovligeKort-rekkefølge.
    const v = r["v"] as Record<string, number>;
    const indekser = Object.keys(v).map(Number);
    assert.ok(indekser.length >= 2, "stillinger med under to lovlige kort skal ikke merkes");
    for (const i of indekser) {
      assert.ok(Number.isInteger(i) && i >= 0 && i < 52, `kortindeks ${i} utenfor 0–51`);
      assert.ok(Number.isFinite(v[String(i)]));
    }

    assert.equal(r["sdVerdener"], 2, "verdenstallet skal skrives, ellers kan innstillinger blandes");
    assert.ok(Number.isInteger(r["stikk"]) && (r["stikk"] as number) >= 0);
    assert.ok(Number.isInteger(r["frø"]));
  }
});

/**
 * Fasiten er ikke en påstand i denne filen, men en ekte e1-orakel-linje på
 * disk. Finnes ingen, hoppes sjekken over – men da har den heller ikke noe å
 * si om, og påstandene over står alene.
 */
test("nøklene stemmer med ekte e1-orakel-data på disk", (t) => {
  const mapper = ["e1-data3", "e1-d5data", "e1-data2", "e1-data"];
  for (const m of mapper) {
    if (!existsSync(m)) continue;
    const f = readdirSync(m).find((x) => x.endsWith(".jsonl"));
    if (f === undefined) continue;
    const linje = readFileSync(join(m, f), "utf8").split("\n")[0];
    if (linje === undefined || linje.trim() === "") continue;
    const r = JSON.parse(linje) as Record<string, unknown>;
    if (r["nt"] === undefined) continue; // eldre kjøringer skrev bare `t`
    for (const n of FELLESNØKLER) {
      assert.ok(n in r, `e1-orakel-linjen i ${m} mangler «${n}» – formatene har glidd fra hverandre`);
    }
    // Dataene på disk kan være fra før minneblokken fantes. Begge bredder er
    // lovlige – de 273 første indeksene betyr det samme i v1 og v2, og det er
    // nettopp derfor de to settene kan blandes i én trening. Alt ANNET enn de
    // to er formatglidning, og det er det denne påstanden vokter.
    const bredde = (r["t"] as number[]).length;
    assert.ok(
      bredde === TREKK_T || bredde === TREKK_T2,
      `e1-orakel-linjen i ${m} har ${bredde} trekk, forventet ${TREKK_T} (v1) eller ${TREKK_T2} (v2)`,
    );
    assert.equal((r["nt"] as number[]).length, TREKK_NT);
    return;
  }
  t.skip("fant ingen e1-orakel-data med nt på disk");
});
