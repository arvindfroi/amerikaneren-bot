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
 * ORAKELET VALIDERER BREDDEN SIN — sterkere enn den gamle testen.
 *
 * Før 5. august var bredden HARDKODET i `sd-orakel.ts`, og testen sjekket bare
 * at konstanten sto i listen. Det var akkurat den konstruksjonen som en gang
 * lot generatoren skrive 340 mens `trekk.ts` var på 356: timevis med data uten
 * den nye blokken, uten et eneste varsel.
 *
 * Nå er bredden et argument som valideres mot `LOVLIGE_BREDDER` FØR første rad
 * genereres. Testen håndhever at valideringen finnes — ikke at en konstant
 * tilfeldigvis er riktig.
 */
test("sd-orakel validerer bredden mot LOVLIGE_BREDDER foer generering", () => {
  const kilde = readFileSync(join(ROT, "examples", "sd-orakel.ts"), "utf8");
  assert.match(
    kilde,
    /LOVLIGE_BREDDER as readonly number\[\]\)\.includes\(bredde\)/,
    "sd-orakel validerer ikke bredden mot LOVLIGE_BREDDER",
  );
  // Standardbredden maa selv vaere lovlig – ellers feiler enhver kjoering uten
  // «--bredde», som er den vanligste maaten aa kjoere den paa.
  const m = /^let bredde = (E1_SPILL_DIM(?:_V\d+)?);/m.exec(kilde);
  assert.ok(m !== null, "fant ikke standardbredden i sd-orakel.ts");
  const verdier: Record<string, number> = {
    E1_SPILL_DIM, E1_SPILL_DIM_V2, E1_SPILL_DIM_V3, E1_SPILL_DIM_V4, E1_SPILL_DIM_V5,
    E1_SPILL_DIM_V6, E1_SPILL_DIM_V7, E1_SPILL_DIM_V8, E1_SPILL_DIM_V9, E1_SPILL_DIM_V10,
  };
  const bredde = verdier[m[1]!];
  assert.ok(bredde !== undefined, `ukjent konstant ${m[1]} som standardbredde`);
  assert.ok(
    LOVLIGE_BREDDER.includes(bredde as (typeof LOVLIGE_BREDDER)[number]),
    `standardbredden ${bredde} staar ikke i LOVLIGE_BREDDER`,
  );
});

/**
 * SANSEBLOKKEN KAN IKKE GENERERES TOM. Fra v9 og opp er 84 av 88 sansetrekk
 * null uten trosnettet, og et korpus med 84 doede kolonner ser helt normalt ut
 * — helt til nettet er ferdigtrent og «sansene virker ikke».
 */
test("sd-orakel nekter v9+ uten trosnett", () => {
  const kilde = readFileSync(join(ROT, "examples", "sd-orakel.ts"), "utf8");
  assert.match(kilde, /bredde >= E1_SPILL_DIM_V9 && trosnett === null/);
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

/**
 * PREFIKSET MÅ VÆRE BIT-EKSAKT — og nå henger et helt korpus i den tråden.
 *
 * `verktoy/sd-tren.py --klipp <bredde>` trener på en smal bredde ved å KLIPPE
 * bredere rader ned. Det er lovlig bare fordi kodingene er strengt
 * prefiks-utvidende: de første `smal` indeksene i en bred vektor skal være
 * BIT-IDENTISKE med den smale vektoren.
 *
 * Egenskapen var antatt, ikke håndhevet. Den ble verifisert 6. august over
 * 1 043 424 sammenlikninger, og den låser opp 2,41 millioner dyrt merkede
 * rader som `len(t) != TREKK_DIM` fram til da forkastet i stillhet.
 *
 * BRYTER NOEN DEN, blir klippingen stille feil: treningen ville lest kolonner
 * som betyr noe annet enn nettet tror, uten at noe feiler. Det er den dyreste
 * feilklassen vi har, og dette er den eneste vakten mot den.
 *
 * En ny blokk MÅ derfor legges til PÅ SLUTTEN og aldri endre en eksisterende
 * indeks.
 */
test("hver bredde er et BIT-EKSAKT prefiks av alle bredere", () => {
  const agenter = [0, 1, 2, 3].map(() => new NevroAgent());
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 8_100_000);
  let g = 0;
  let sammenliknet = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    if (s.fase === "SPILL" && s.iTur !== null) {
      const vekt = new Map<number, Float32Array>();
      for (const d of LOVLIGE_BREDDER) vekt.set(d, e1SpillTrekk(s, s.iTur, d));
      for (let i = 1; i < LOVLIGE_BREDDER.length; i++) {
        const smal = LOVLIGE_BREDDER[i - 1]!;
        const bred = LOVLIGE_BREDDER[i]!;
        const a = vekt.get(smal)!;
        const b = vekt.get(bred)!;
        for (let k = 0; k < smal; k++) {
          assert.equal(b[k], a[k], `bredde ${bred} avviker fra ${smal} i indeks ${k}`);
          sammenliknet++;
        }
      }
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, agenter[iTur]!.velgHandling(s)).state;
  }
  assert.ok(sammenliknet > 100_000, `for få sammenlikninger (${sammenliknet})`);
});

/**
 * OG PYTHON-SIDEN MÅ FAKTISK KLIPPE, ikke forkaste. Sperren mot blandede
 * bredder er riktig for PADDING (en smal rad opp til bred er en løgn: de
 * manglende blokkene ville stått som nuller uten at nettet fikk vite det),
 * men den skal ikke ramme klipping.
 */
test("sd-tren.py klipper bredere rader i stedet for aa forkaste dem", () => {
  const kilde = readFileSync(join(ROT, "verktoy", "sd-tren.py"), "utf8");
  assert.match(kilde, /--klipp/, "sd-tren.py har ikke --klipp");
  assert.match(kilde, /len\(t\) < TREKK_DIM/, "radloekka forkaster fortsatt paa ulik bredde");
  assert.match(kilde, /t\[:TREKK_DIM\]/, "sd-tren.py klipper ikke raden");
  assert.match(kilde, /Aa PADDE opp er en loegn/, "sperren mot padding er borte");
});
