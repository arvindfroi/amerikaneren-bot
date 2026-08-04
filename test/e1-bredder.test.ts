/**
 * BREDDENE MÅ VÆRE ENIGE — på tvers av fem steder og to språk.
 *
 * En ny trekkblokk må registreres i:
 *
 *   1. `src/e1/trekk.ts`          konstanten og utsendingen
 *   2. `src/e1/agent.ts`          `LOVLIGE_BREDDER`
 *   3. `verktoy/sd-tren.py`       `LOVLIGE_DIM`
 *   4. `examples/sd-orakel.ts`    hvilken bredde den SKRIVER
 *   5. `test/sd-orakel-format.test.ts`  hva formatet forventes å være
 *
 * DETTE HAR FEILET TO GANGER PÅ ÉN KVELD (4.–5. august): både `LOVLIGE_DIM` og
 * E1-agentens vakt kjente ikke 470 etter at v8 kom. Begge feilet HØYLYTT, som
 * de skal – men høylytt feiling koster fortsatt en runde med feilsøking, og
 * denne testen gjør runden overflødig.
 *
 * Den viktigste linja er den mot PYTHON. Det er den eneste koblingen ingen
 * typesjekk dekker, og derfor den som drifter uten at noe sier fra.
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { LOVLIGE_BREDDER } from "../src/e1/agent.ts";
import {
  e1SpillTrekk,
  E1_SPILL_DIM,
  E1_SPILL_DIM_V2,
  E1_SPILL_DIM_V3,
  E1_SPILL_DIM_V4,
  E1_SPILL_DIM_V5,
  E1_SPILL_DIM_V6,
  E1_SPILL_DIM_V7,
  E1_SPILL_DIM_V8,
  E1_SPILL_DIM_V9,
  E1_SPILL_DIM_V10,
} from "../src/e1/trekk.ts";
import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";

const ROT = join(import.meta.dirname, "..");

test("LOVLIGE_BREDDER inneholder nøyaktig konstantene i trekk.ts", () => {
  const ventet = [
    E1_SPILL_DIM,
    E1_SPILL_DIM_V2,
    E1_SPILL_DIM_V3,
    E1_SPILL_DIM_V4,
    E1_SPILL_DIM_V5,
    E1_SPILL_DIM_V6,
    E1_SPILL_DIM_V7,
    E1_SPILL_DIM_V8,
    E1_SPILL_DIM_V9,
    E1_SPILL_DIM_V10,
  ];
  assert.deepEqual([...LOVLIGE_BREDDER], ventet);
});

test("breddene er strengt voksende – hver blokk legger seg OPPÅ den forrige", () => {
  for (let i = 1; i < LOVLIGE_BREDDER.length; i++) {
    assert.ok(
      LOVLIGE_BREDDER[i]! > LOVLIGE_BREDDER[i - 1]!,
      `bredde ${i} (${LOVLIGE_BREDDER[i]}) er ikke større enn ${LOVLIGE_BREDDER[i - 1]}`,
    );
  }
});

/**
 * KRYSSER SPRÅKGRENSEN. `verktoy/sd-tren.py` har sin egen liste, og den er
 * det eneste stedet ingen typesjekk dekker. Den drifter derfor uten at noe
 * sier fra – helt til en treningskjøring hopper over hele korpuset i stillhet
 * eller feiler etter tjue minutters innlesing.
 */
test("sd-tren.py kjenner nøyaktig de samme breddene", () => {
  const kilde = readFileSync(join(ROT, "verktoy", "sd-tren.py"), "utf8");
  const m = /^LOVLIGE_DIM\s*=\s*\(([^)]*)\)/m.exec(kilde);
  assert.ok(m !== null, "fant ikke LOVLIGE_DIM i sd-tren.py");
  const fraPython = m[1]!
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .map(Number);
  assert.deepEqual(
    fraPython,
    [...LOVLIGE_BREDDER],
    "sd-tren.py og src/e1/agent.ts er ikke enige om lovlige bredder",
  );
});

/**
 * Orakelet skriver ÉN bredde, og den må være en vi kan trene på. Skriver den
 * en ukjent bredde, hopper treneren over hele korpuset – etter aa ha lest det.
 */
test("sd-orakel skriver en bredde som staar i listen", () => {
  const kilde = readFileSync(join(ROT, "examples", "sd-orakel.ts"), "utf8");
  const m = /e1SpillTrekk\(s,\s*sete,\s*(E1_SPILL_DIM(?:_V\d)?)\)/.exec(kilde);
  assert.ok(m !== null, "fant ikke e1SpillTrekk-kallet i sd-orakel.ts");
  const navn = m[1]!;
  const verdier: Record<string, number> = {
    E1_SPILL_DIM,
    E1_SPILL_DIM_V2,
    E1_SPILL_DIM_V3,
    E1_SPILL_DIM_V4,
    E1_SPILL_DIM_V5,
    E1_SPILL_DIM_V6,
    E1_SPILL_DIM_V7,
    E1_SPILL_DIM_V8,
    E1_SPILL_DIM_V9,
    E1_SPILL_DIM_V10,
  };
  const bredde = verdier[navn];
  assert.ok(bredde !== undefined, `ukjent konstant ${navn} i sd-orakel.ts`);
  assert.ok(
    LOVLIGE_BREDDER.includes(bredde as (typeof LOVLIGE_BREDDER)[number]),
    `orakelet skriver ${bredde} (${navn}), som ikke staar i LOVLIGE_BREDDER`,
  );
});

test("hver bredde gir en vektor av NØYAKTIG den lengden", () => {
  const agenter = [0, 1, 2, 3].map(() => new NevroAgent());
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 5_150_000);
  let g = 0;
  let sjekket = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    if (s.fase === "SPILL") {
      for (const d of LOVLIGE_BREDDER) {
        const v = e1SpillTrekk(s, s.iTur ?? 0, d);
        assert.equal(v.length, d, `bredde ${d} ga vektor av lengde ${v.length}`);
        sjekket++;
      }
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, agenter[iTur]!.velgHandling(s)).state;
  }
  assert.ok(sjekket > 50, `for få sjekker (${sjekket})`);
});
