/**
 * DET NÅBARE TAKET I TRUMFVALGET OG KORTSPILLET — prøver for `examples/naabart-handling.ts` og
 * `tak-kart.ts --naabart/--felle` i `--fase vrak|spill` (K3.4, K3.6, K7).
 *
 * Tre ting må holde, og hver har en felle som MÅ bli tatt:
 *
 *   1. K2. Valget og VERDIENE er en funksjon av det setet ser. For en forsvarer/makker etter
 *      vraket byttes de skjulte hendene, budvinnerens vrak og talongen på én gang (`medVerden`
 *      gjør alle tre, K2-fiksen 381df73), og for budvinneren i VELG de andres hender. FELLE A:
 *      et «nåbart» tak som spiller ut i de EKTE hendene.
 *   2. FELLENE I VINDUET er deterministiske og K2-trygge (`tilfeldig` trekker fra visningen),
 *      ellers ville ren-runden og den nåbare runden spilt ulike kort før taket rørte noe.
 *   3. PARING. W = 0 gir eksakt 0 og ingen byttet handling; et vindu i kortspillet bytter ALDRI
 *      et bud (feilen røyken 11. sep fant: `naabartEndret` > antall vurderte beslutninger).
 *
 * Små tall med vilje: CPU-en deles med treningen. Utspillinger med `ADAMS_MAALT` (ingen søk).
 */

import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { lovligeHandlinger, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { lagRng } from "../src/kort.ts";
import { kortTilInt } from "../src/solver/dds.ts";
import { ADAMS_MAALT, lagIndre } from "../src/moe2/agentspek.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import {
  felleHandling,
  handlingNøkkel,
  iTurFor,
  kandidaterFor,
  naabartHandling,
  type NaabartHandlingOpts,
} from "../examples/naabart-handling.ts";

const ferske = () => [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
const OPTS: NaabartHandlingOpts = { verdener: 3, kandidater: 4, agenter: ferske() };

interface Stilling {
  readonly s: GameState;
  readonly sete: number;
  /** Det driveren faktisk gjorde — i VELG kan en fersk `Vrakrangerer` ikke spørres (trumfen lagres i VRAK). */
  readonly pol: Handling;
}

/** Spilt fram av ADAMS_MAALT: ikke-budvinnere i stikk 3–6 med ≥ 2 lovlige kort (≤ 2 per giv), og budvinneren i VELG. */
function stillinger(giver: number, frøBase: number): { spill: Stilling[]; velg: Stilling[] } {
  const spill: Stilling[] = [];
  const velg: Stilling[] = [];
  for (let g = 0; g < giver; g++) {
    const drivere = ferske();
    let s = opprettSpill({ antallSpillere: 4 }, frøBase + g * 4271);
    let tatt = 0;
    let vakt = 0;
    while (s.fase !== "RUNDE_SLUTT" && s.fase !== "FERDIG" && vakt++ < 400) {
      const sete = iTurFor(s)!;
      const h = drivere[sete]!.velgHandling(s);
      const lov = lovligeHandlinger(s);
      if (s.fase === "VELG") velg.push({ s, sete, pol: h });
      if (s.fase === "SPILL" && s.stikkSpilt >= 3 && s.stikkSpilt <= 6 && sete !== s.budvinner && tatt < 2 && lov.fase === "SPILL" && lov.kort.length >= 2) {
        spill.push({ s, sete, pol: h });
        tatt++;
      }
      s = utfør(s, h).state;
    }
  }
  return { spill, velg };
}

const ST = stillinger(3, 6_630_000);

test("naabartHandling K2 (forsvarer etter vraket): bytt skjulte hender, vraket og talongen — verdiene og valget står", () => {
  let ulikeHender = 0;
  let ulikVrak = 0;
  let skiller = 0;
  assert.ok(ST.spill.length >= 4, `bare ${ST.spill.length} kortstillinger`);
  for (const [k, { s, sete, pol }] of ST.spill.entries()) {
    assert.ok(s.vrak.length > 0 && sete !== s.budvinner, "stillingen er ikke etter vraket for en ikke-budvinner");
    const fasit = naabartHandling(s, sete, pol, OPTS);
    assert.ok(fasit.n > 0, "ingen verden ble spilt ut");
    assert.deepEqual(naabartHandling(s, sete, pol, { ...OPTS, agenter: ferske() }), fasit, "ferske agenter ga andre verdier");
    if (new Set(fasit.verdier.map((v) => v.snitt)).size > 1) skiller++;
    for (const hender of trekkVerdener(s, sete, 3, lagRng(7_700 + k), undefined, undefined, 4)) {
      const s2 = medVerden(s, hender, sete);
      if (JSON.stringify(s2.hender) !== JSON.stringify(s.hender)) ulikeHender++;
      if (JSON.stringify(s2.vrak.map(kortTilInt).sort()) !== JSON.stringify(s.vrak.map(kortTilInt).sort())) ulikVrak++;
      assert.deepEqual(naabartHandling(s2, sete, pol, OPTS), fasit, `K2: sete ${sete} i giv ${s.frø} fikk andre verdier med andre skjulte kort`);
      assert.equal(handlingNøkkel(felleHandling("tilfeldig", s2, sete)), handlingNøkkel(felleHandling("tilfeldig", s, sete)), "den tilfeldige fella leste skjulte kort");
    }
    assert.deepEqual(naabartHandling({ ...s, frø: (s.frø ^ 0x5a5a5a5a) >>> 0 }, sete, pol, OPTS), fasit, "K2: det skjulte frøet endret verdiene");
  }
  assert.ok(ulikeHender > 0, "ingen verden byttet hendene — prøven er tom");
  assert.ok(ulikVrak > 0, "ingen verden byttet vraket — K2-fiksen i medVerden er ikke prøvd");
  assert.ok(skiller > 0, "alle kort fikk samme verdi overalt — da beviser invariansen ingenting");
});

test("naabartHandling K2 (budvinneren i VELG): de andres hender byttet — verdiene står; kandidatene er trumffargene", () => {
  assert.ok(ST.velg.length >= 2, `bare ${ST.velg.length} trumfstillinger`);
  let skiller = 0;
  for (const [k, { s, sete, pol }] of ST.velg.entries()) {
    assert.ok(kandidaterFor(s, sete).every((h) => h.type === "VELG"));
    const fasit = naabartHandling(s, sete, pol, OPTS);
    assert.ok(fasit.n > 0);
    if (new Set(fasit.verdier.map((v) => v.snitt)).size > 1) skiller++;
    for (const hender of trekkVerdener(s, sete, 2, lagRng(8_800 + k), undefined, undefined, 4)) {
      const s2 = medVerden(s, hender, sete);
      assert.deepEqual(s2.vrak, s.vrak, "budvinneren ser sitt eget vrak — det skal stå");
      assert.deepEqual(naabartHandling(s2, sete, pol, OPTS), fasit, "K2: budvinnerens trumfverdier flyttet seg med de andres hender");
    }
  }
  assert.ok(skiller > 0, "alle trumffarger fikk samme verdi");
});

test("FELLE A: et «nåbart» tak som spiller ut i de ekte hendene blir tatt av K2-byttet", () => {
  const klarsyn: NaabartHandlingOpts = { ...OPTS, verdenerFor: (st) => [st.hender.map((h) => h.map(kortTilInt))] };
  let avvik = 0;
  for (const [k, { s, sete, pol }] of ST.spill.entries()) {
    const fasit = JSON.stringify(naabartHandling(s, sete, pol, klarsyn));
    for (const hender of trekkVerdener(s, sete, 2, lagRng(9_900 + k), undefined, undefined, 4)) {
      if (JSON.stringify(naabartHandling(medVerden(s, hender, sete), sete, pol, klarsyn)) !== fasit) avvik++;
    }
  }
  assert.ok(avvik > 0, "klarsynstaket ga samme verdier i alle forenlige verdener — K2-prøven kan ikke feile");
});

test("fellene: lav er laveste lovlige kort, kortest er trumf i korteste farge, og feil fase kaster", () => {
  for (const { s, sete } of ST.spill) {
    const lav = felleHandling("lav", s, sete);
    assert.equal(lav.type, "SPILL");
    const lov = lovligeHandlinger(s);
    assert.ok(lov.fase === "SPILL");
    assert.equal((lav as { kort: { verdi: number } }).kort.verdi, Math.min(...lov.kort.map((x) => x.verdi)));
    assert.throws(() => felleHandling("kortest", s, sete), /VELG/);
  }
  for (const { s, sete } of ST.velg) {
    const h = felleHandling("kortest", s, sete) as { trumf: string };
    const antall = (f: string): number => s.hender[sete]!.filter((x) => x.farge === f).length;
    const min = Math.min(...kandidaterFor(s, sete).map((x) => antall((x as { trumf: string }).trumf)));
    assert.equal(antall(h.trumf), min);
    assert.throws(() => felleHandling("lav", s, sete), /SPILL/);
  }
});

test("de grove fellene: hoy er høyeste lovlige kort; verst trenger utspillingene, er K2-trygg og deterministisk", () => {
  let ulikTaket = 0;
  for (const [k, { s, sete, pol }] of ST.spill.entries()) {
    const lov = lovligeHandlinger(s);
    assert.ok(lov.fase === "SPILL");
    const hoy = felleHandling("hoy", s, sete) as { kort: { verdi: number } };
    assert.equal(hoy.kort.verdi, Math.max(...lov.kort.map((x) => x.verdi)));
    assert.throws(() => felleHandling("verst", s, sete), /utspillingsagentene/);
    const verst = felleHandling("verst", s, sete, OPTS);
    assert.ok(kandidaterFor(s, sete).some((h) => handlingNøkkel(h) === handlingNøkkel(verst)), "verst ga et ulovlig kort");
    assert.equal(handlingNøkkel(felleHandling("verst", s, sete, { ...OPTS, agenter: ferske() })), handlingNøkkel(verst), "verst er ikke en funksjon av stillingen");
    for (const hender of trekkVerdener(s, sete, 2, lagRng(6_600 + k), undefined, undefined, 4)) {
      assert.equal(handlingNøkkel(felleHandling("verst", medVerden(s, hender, sete), sete, OPTS)), handlingNøkkel(verst), "K2: verst leste skjulte kort");
    }
    if (handlingNøkkel(naabartHandling(s, sete, pol, OPTS).handling) !== handlingNøkkel(verst)) ulikTaket++;
  }
  // Fella og taket skal kunne skille lag: en «verst» som alltid valgte det taket valgte ville ikke vært en felle.
  assert.ok(ulikTaket > 0, "verst valgte det samme som taket i hver stilling");
});

// ===========================================================================
// tak-kart.ts
// ===========================================================================

const dir = mkdtempSync(join(tmpdir(), "naabart-handling-"));

function kart(navn: string, args: readonly string[]): { status: number | null; stderr: string; rader: Record<string, unknown>[] } {
  const ut = join(dir, `${navn}.jsonl`);
  const r = spawnSync(process.execPath, ["examples/tak-kart.ts", "--uten-tak", "--gjenbruk", "--spek", ADAMS_MAALT, "--ut", ut, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let tekst = "";
  try {
    tekst = readFileSync(ut, "utf8");
  } catch {
    /* ingen rader */
  }
  return { status: r.status, stderr: r.stderr, rader: tekst.split("\n").filter((l) => l !== "").map((l) => JSON.parse(l) as Record<string, unknown>) };
}

test("tak-kart: W = 0 i kortspillet gir eksakt 0 og ingen bytte, men beslutningene telles", () => {
  const k = kart("null", ["--fase", "spill", "--fra", "9", "--til", "11", "--giver", "2", "--naabart", "0"]);
  assert.equal(k.status, 0, k.stderr);
  assert.ok(k.rader.length > 0);
  for (const r of k.rader) {
    assert.equal(r["diffNaabart"], 0);
    assert.equal(r["naabartEndret"], 0);
  }
  assert.ok(k.rader.every((r) => (r["naabartBeslutninger"] as number) > 0), "ingen beslutning i vinduet ble vurdert — prøven er tom");
});

test("tak-kart: et vindu i vrak/spill bytter aldri et bud, og uendret handling gir eksakt 0", () => {
  for (const [navn, args] of [
    ["spill", ["--fase", "spill", "--fra", "9", "--til", "11", "--giver", "2", "--naabart", "3", "--naabart-kand", "4"]],
    ["vrak", ["--fase", "vrak", "--giver", "3", "--naabart", "3", "--naabart-kand", "4", "--felle", "kortest"]],
  ] as const) {
    const k = kart(navn, args);
    assert.equal(k.status, 0, k.stderr);
    assert.ok(k.rader.length > 0);
    for (const r of k.rader) {
      assert.ok((r["naabartEndret"] as number) <= (r["naabartBeslutninger"] as number), `${navn}: flere byttede handlinger enn vurderte beslutninger — et bud ble byttet: ${JSON.stringify(r)}`);
      if (r["naabartEndret"] === 0) assert.equal(r["diffNaabart"], 0, `${navn}: uendret handling med ulikt utfall — paringen holder ikke`);
    }
    if (navn === "vrak") {
      // Bare budvinneren har et trumfvalg; paringen FØR vinduet gjør henne til den samme i begge runder.
      assert.ok(k.rader.filter((r) => r["rolle"] !== "foerer").every((r) => r["naabartBeslutninger"] === 0), "en ikke-budvinner fikk trumfvalget");
      assert.ok(k.rader.some((r) => (r["naabartEndret"] as number) > 0), "taket byttet aldri fellas trumf — da er det ikke prøvd");
    }
  }
});
