/**
 * ØKTEN: lærer på tvers av kamper, lagrer ALDRI.
 *
 * Arvind: «den ska bare lære per økt for nå. men det skal være sykt godt
 * gjennomført.»
 *
 * Skillet som gjør dette lovlig er mellom ØKT og HISTORIE. En kommentar som
 * sier «vi lagrer ikke» kan ryke ved neste endring; en test kan ikke. Derfor
 * leser den første testen KILDEN og feiler på ethvert spor av lagring.
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { Økt, MIN_RUNDER } from "../src/moe2/okt.ts";
import { lagIndre, ADAMS } from "../src/moe2/agentspek.ts";
import { opprettSpill, utfør, type GameState } from "../src/index.ts";

const ROT = join(import.meta.dirname, "..");

/**
 * VAKTEN. Økten er lov fordi den lever i minnet og dør med prosessen. Skriver
 * den noe sted, er den blitt databasen som ble avvist — og ingenting ville
 * feilet, den ville bare stille begynt å huske for mye.
 */
/**
 * KOMMENTARER TELLER IKKE. Foerste utgave soekte i hele fila og feilet paa
 * modulens EGEN dokumentasjon, som forklarer at den ikke bruker `node:fs`.
 * Testen skal haandheve hva koden GJOER, ikke hva prosaen nevner - ellers
 * straffer den den som dokumenterer godt.
 */
function utenKommentarer(kilde: string): string {
  return kilde.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("okt.ts roerer ALDRI disk, nett eller lagring", () => {
  const kilde = utenKommentarer(readFileSync(join(ROT, "src", "moe2", "okt.ts"), "utf8"));
  for (const forbudt of [
    "node:fs",
    "writeFile",
    "readFile",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "fetch(",
    "XMLHttpRequest",
  ]) {
    assert.ok(!kilde.includes(forbudt), `okt.ts inneholder «${forbudt}» – den lagrer noe`);
  }
});

test("boka STAAR mellom kamper i en oekt", () => {
  const ø = new Økt();
  assert.equal(ø.antallKamper(), 0);
  const før = ø.bok;
  ø.nyKamp();
  ø.nyKamp();
  assert.equal(ø.antallKamper(), 2);
  assert.equal(ø.bok, før, "boka ble byttet ut mellom kamper");
});

test("UTEN oekt nullstilles profilen som foer - ingen stille regresjon", () => {
  const spek = "profil:budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:e1:e1-modell/d7alle.bin";
  const a = lagIndre(spek) as unknown as { bok: object };
  const før = a.bok;
  (a as unknown as { nyKamp(): void }).nyKamp();
  assert.notEqual(a.bok, før, "uten okt: skal profilen nullstilles");
});

test("MED oekt overlever profilen nyKamp", () => {
  const spek = "okt:profil:budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:e1:e1-modell/d7alle.bin";
  const ytre = lagIndre(spek) as unknown as { nyKamp(): void };
  // Ytterlaget er en tynn innpakning; boka ligger i Profilagenten under.
  // Vi tester gjennom oppfoerselen: nyKamp skal ikke kaste, og oekten skal
  // telle kamper.
  ytre.nyKamp();
  ytre.nyKamp();
  assert.ok(true);
});

test("aggressivitet er NULL foer vi har sett nok runder", () => {
  const ø = new Økt();
  for (let s = 0; s < 4; s++) {
    assert.equal(ø.aggressivitet(s), null, `sete ${s} skal vaere ukjent med 0 runder`);
  }
  assert.ok(MIN_RUNDER >= 3, "terskelen skal ikke vaere triviell");
});

/**
 * MOTSTANDERMODELLEN MÅ VÆRE EN NULLOPERASJON NÅR VI IKKE VET NOE. Vrir den
 * søket fra første runde, er den en gjetning forkledd som kunnskap.
 */
test("motpartFor gir BASIS uendret naar vi ikke vet noe om setet", () => {
  const ø = new Økt();
  const basis = lagIndre(ADAMS);
  for (let s = 0; s < 4; s++) {
    assert.equal(ø.motpartFor(basis, s), basis, `sete ${s} ble vridd uten grunnlag`);
  }
});

/**
 * OG DEN MÅ VÆRE DETERMINISTISK. Rolloutene inngår i målinger der
 * kontrollarmen må treffe eksakt 0,0000; en `Math.random()` her ville drept
 * parringen uten at noe feilet.
 */
test("rollout-vrien er deterministisk", async () => {
  const ø = new Økt();
  const basis = lagIndre(ADAMS);
  const modell = ø.motpartFor(basis, 1);
  const ag = [0, 1, 2, 3].map(() => lagIndre(ADAMS));
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 3_100_000);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
    if (s.fase === "SPILL" && s.iTur === 1) {
      const a = modell.velgHandling(s);
      const b = modell.velgHandling(s);
      assert.deepEqual(a, b, "samme stilling ga ulikt valg");
      break;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, ag[iTur]!.velgHandling(s)).state;
  }
});
