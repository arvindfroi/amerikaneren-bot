/**
 * K1-DUPLIKATET MED HUKOMMELSE — rundeslutten som aldri ble vist (11. sep).
 *
 * Batteriet 11. sep: 10 av 20 K1-skard med hele boten krasjet med «Søketro: runde N ble
 * aldri vist som RUNDE_SLUTT», og K1 ble målt på 197 av 273 kamper. Menneskedataene har
 * ingen hull (0 av 273 kamper fra 10. aug). Feilen satt i duplikatet: når BOTENS runde
 * løfter noen over målet, går motoren til FERDIG — mennesket spilte videre, og neste runde
 * gjenskapes fra hans tavle. Bøkene bokfører bare RUNDE_SLUTT, så runden var borte.
 *
 *   1. Vakta i søketroen fyrer fortsatt når observer VIRKELIG ikke er koblet.
 *   2. Mekanismen: en FERDIG-tilstand bokfører ikke (kast i neste runde); samme tilstand
 *      vist som RUNDE_SLUTT gjør det.
 *   3. Skriptet ende til ende på en syntetisk logg med kampslutt i duplikatet OG et hull i
 *      rundefølgen. Krasjet før fiksen; nå går det, alle radene skrives, og tellerne viser
 *      at begge fellene faktisk ble spilt (en grønn prøve som aldri møtte fella beviser ingenting).
 */

import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/motor.ts";
import { lagIndre, type Spekagent } from "../src/moe2/agentspek.ts";

/** Billig spek med ALLE tre bøkene: økt, profil og en søketro som leser hukommelsen. */
const MINNE = "okt:profil:sik:alle:0.5:2k2LMD~mlbu=e1-modell/tro-1.bin:e1:e1-modell/d7alle.bin";
const V5 = "vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-menneske.json@-3.0:vakt:abmp:e1:e1-modell/d7alle.bin";
const FILER = ["tro-1.bin", "d7alle.bin", "vrakrang.bin", "bud-menneske.json", "seier-g0.bin"].map((f) => `e1-modell/${f}`);
const mangler = FILER.filter((f) => !existsSync(f));
const skip = mangler.length > 0 ? `mangler ${mangler.join(", ")} (e1-modell er ikke sporet)` : false;

/** Samme gjenskaping som duplikat-menneske.ts: runde 0 fra frøet, ellers RUNDE_SLUTT → NESTE. */
function stilling(frø: number, rundeNr: number, før: number[]): GameState {
  const grunn = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, frø);
  return rundeNr === 0
    ? { ...grunn, totalPoeng: før }
    : utfør({ ...grunn, fase: "RUNDE_SLUTT", iTur: null, rundeNr: rundeNr - 1, giver: (rundeNr - 1) % 4, totalPoeng: før }, { type: "NESTE" }).state;
}

function spill(st: GameState, agenter: readonly Spekagent[]): GameState {
  let vakt = 0;
  while (st.fase !== "RUNDE_SLUTT" && st.fase !== "FERDIG" && vakt++ < 2_000) {
    const i = st.fase === "VRAK" || st.fase === "VELG" ? st.budvinner : st.iTur;
    if (i === null || i === undefined) break;
    st = utfør(st, agenter[i]!.velgHandling(st)).state;
  }
  return st;
}

const bord = (sete0: Spekagent): Spekagent[] => [sete0, lagIndre(V5), lagIndre(V5), lagIndre(V5)];

test("søketroen: vakta fyrer fortsatt når observer ALDRI kalles ved rundeslutt", { skip }, () => {
  const ag = bord(lagIndre(MINNE));
  const r0 = spill(stilling(8_800_001, 0, [0, 0, 0, 0]), ag);
  assert.equal(r0.fase, "RUNDE_SLUTT");
  // Ingen observer her — slik Sandkasseagent sto med tom hukommelse.
  assert.throws(() => spill(stilling(8_800_001, 1, [...r0.totalPoeng]), ag), /runde 0 ble aldri vist som RUNDE_SLUTT/);
});

test("rotårsaken: FERDIG bokføres ikke og kaster i neste runde; samme tilstand som RUNDE_SLUTT går", { skip }, () => {
  const før = [99, 99, 99, 99];
  const kjør = (vis: (s: GameState) => GameState): (() => void) => {
    const ag = bord(lagIndre(MINNE));
    const slutt = spill(stilling(8_800_002, 0, før), ag);
    // Forutsetningen for fella: botens runde avsluttet kampen.
    assert.equal(slutt.fase, "FERDIG", "runden nådde ikke målet — fella er ikke spilt");
    for (const a of ag) a.observer?.(vis(slutt));
    return () => void spill(stilling(8_800_002, 1, [40, 40, 40, 40]), ag);
  };
  assert.throws(kjør((s) => s), /runde 0 ble aldri vist som RUNDE_SLUTT/);
  assert.doesNotThrow(kjør((s) => ({ ...s, fase: "RUNDE_SLUTT", vinner: null })));
});

test("duplikat-menneske.ts: kampslutt i duplikatet og hull i loggen krasjer ikke, og radene skrives", { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), "duplikat-"));
  const data = join(dir, "hendelser.jsonl");
  const ut = join(dir, "s0.jsonl");
  const linjer: string[] = [];
  let id = 0;
  /** Mennesket spilles av V5 på samme giv; loggen får historikk i Val Town-formatet. */
  const kamp = (spillId: string, frø: number, runder: [number, number[]][]): void => {
    linjer.push(JSON.stringify({ id: id++, tid: "2026-09-01T00:00:00Z", spillId, spiller: "t", type: "start", data: { frø, målPoeng: 100 } }));
    for (const [rundeNr, før] of runder) {
      const s = spill(stilling(frø, rundeNr, før), [lagIndre(V5), lagIndre(V5), lagIndre(V5), lagIndre(V5)]);
      const delta = s.sisteRunde!.delta;
      linjer.push(
        JSON.stringify({
          id: id++,
          tid: `2026-09-01T00:0${rundeNr}:00Z`,
          spillId,
          spiller: "t",
          type: "runde",
          data: {
            rundeNr,
            delta,
            totalPoeng: før.map((p, i) => p + (delta[i] ?? 0)),
            historikk: s.historikk.map((t) => t.kort.map((kp) => [kp.spiller, kp.kort.farge, kp.kort.verdi])),
            budvinner: s.budvinner,
            makker: s.makker,
          },
        }),
      );
    }
  };
  // Runde 1 starter på 99: botens runde avslutter kampen, mennesket spiller runde 2.
  kamp("k-ferdig", 8_800_003, [[0, [0, 0, 0, 0]], [1, [99, 99, 99, 99]], [2, [40, 40, 40, 40]]]);
  // Runde 1 mangler i loggen.
  kamp("k-hull", 8_800_004, [[0, [0, 0, 0, 0]], [2, [20, 20, 20, 20]]]);
  writeFileSync(data, `${linjer.join("\n")}\n`);

  const r = spawnSync(
    process.execPath,
    ["examples/duplikat-menneske.ts", "--spek", MINNE, "--motstander", V5, "--data", data, "--skard", "0/1", "--ut", ut],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  assert.equal(r.status, 0, `duplikatet krasjet:\n${r.stderr}`);
  const rader = readFileSync(ut, "utf8").split("\n").filter((l) => l !== "");
  assert.equal(rader.length, 5, "hver runde skal bli en rad — givkontrollen og hukommelsen skal ikke kaste noen");
  const kampslutt = Number(/(\d+) kampslutt i duplikatet/.exec(r.stdout)?.[1]);
  const brudd = Number(/(\d+) brudd i rundefølgen/.exec(r.stdout)?.[1]);
  assert.ok(kampslutt >= 1, `kampslutt-fella ble ikke spilt (${kampslutt}):\n${r.stdout}`);
  assert.equal(brudd, 1, `hullet ble ikke sett:\n${r.stdout}`);
});
