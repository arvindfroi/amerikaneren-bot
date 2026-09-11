import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { spillKamp, type Kampagent } from "../examples/vrakq-data.ts";
import { opprettSpill, type GameState, type Handling } from "../src/motor.ts";
import { ETTERLYST_DIM, ETTERLYST_MAKS, VRAK_DIM } from "../src/moe2/vraktrekk.ts";
import { NevroAgent } from "../src/nevro/index.ts";

/**
 * `examples/vrakq-data.ts` (11. sep, K3.5/K3.8):
 *
 *   1. OBSERVER PÅ HVER TILSTAND. Løkka håndterer RUNDE_SLUTT selv og kalte aldri `observer` –
 *      samme feil som ga 0 bokførte runder i `examples/kamp.ts`. Lag med hukommelse inne i
 *      policyspeken så dermed kamper uten rundeslutt.
 *   2. `--etterlyst` skriver KALLGRUPPER (`"type":"etterlyst"`) ved siden av vrakgruppene, og
 *      vrakgruppene er de samme som uten flagget.
 */

const ROT = fileURLToPath(new URL("..", import.meta.url));

class Spion implements Kampagent {
  readonly sett = new Set<GameState>();
  readonly faser: string[] = [];
  uobservert = 0;
  private readonly nevro = new NevroAgent();
  observer(s: GameState): void {
    this.sett.add(s);
    this.faser.push(s.fase);
  }
  velgHandling(s: GameState): Handling {
    if (!this.sett.has(s)) this.uobservert++;
    return this.nevro.velgHandling(s);
  }
  nyKamp(): void {
    this.nevro.nyKamp();
  }
}

test("spillKamp gir observer til ALLE lyttere på hver tilstand, også RUNDE_SLUTT og slutten", () => {
  const kamp = [0, 1, 2, 3].map(() => new Spion());
  const tilskuer = new Spion(); // sitter ikke i kampen, men skal se alt likt
  const vrakSett: GameState[] = [];
  const slutt = spillKamp(opprettSpill({ antallSpillere: 4, målPoeng: 100 }, 4_400_001), kamp, [...kamp, tilskuer], 3, (s) =>
    vrakSett.push(s),
  );
  for (const a of kamp) assert.equal(a.uobservert, 0, "en agent ble spurt om en tilstand den ikke hadde sett");
  // Fella: den gamle løkka ga ALDRI en rundeslutt til noen.
  assert.ok(tilskuer.faser.filter((f) => f === "RUNDE_SLUTT").length >= 2, `rundeslutter sett: ${tilskuer.faser.filter((f) => f === "RUNDE_SLUTT").length}`);
  assert.ok(tilskuer.sett.has(slutt), "sluttilstanden ble ikke observert");
  for (const a of kamp) assert.deepEqual(a.faser, tilskuer.faser);
  assert.ok(vrakSett.length > 0 && vrakSett.every((s) => s.fase === "VRAK" && tilskuer.sett.has(s)));
});

interface Linje {
  type?: string;
  frø: number;
  n: number;
  policypar?: number;
  trumf?: string;
  vrak?: string[];
  kand: { t: number[]; v: number; vs: number; vp: number; k?: string; nevro?: number }[];
}

function kjørData(ekstra: readonly string[]): Linje[] {
  const ut = join(mkdtempSync(join(tmpdir(), "vrakq-etterlyst-")), "s0.jsonl");
  const r = spawnSync(
    process.execPath,
    [
      "examples/vrakq-data.ts",
      ...["--kamper", "1", "--skard", "0/1", "--maksrunder", "3", "--verdener", "4", "--sjanse", "1"],
      ...["--spek", "vr:e1-modell/vrakrang.bin:telrd:vakt:abmp:e1:e1-modell/d7alle.bin"],
      ...ekstra,
      ...["--ut", ut],
    ],
    { cwd: ROT, encoding: "utf8" },
  );
  assert.equal(r.status, 0, `vrakq-data feilet:\n${r.stderr}`);
  return readFileSync(ut, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as Linje);
}

test("--etterlyst skriver begge gruppetypene, og vrakgruppene er de samme som uten flagget", () => {
  const med = kjørData(["--etterlyst"]);
  const uten = kjørData([]);
  const vrak = med.filter((l) => l.type === undefined);
  const kall = med.filter((l) => l.type === "etterlyst");
  assert.ok(vrak.length >= 1, "ingen vrakgrupper");
  assert.ok(kall.length >= 1, "ingen kallgrupper");
  assert.ok(uten.every((l) => l.type === undefined), "uten flagget skal det ikke finnes kallgrupper");
  assert.deepEqual(vrak, uten, "kallmerkingen endret vrakdataene");

  for (const l of vrak) for (const k of l.kand) assert.equal(k.t.length, VRAK_DIM);
  for (const l of kall) {
    assert.equal(l.policypar, 1);
    assert.ok(l.kand.length >= 2 && l.kand.length <= ETTERLYST_MAKS, `${l.kand.length} kandidater`);
    assert.equal(l.kand.filter((k) => k.nevro === 1).length, 1, "nøyaktig én referanse");
    // Policyen er regelen, så referansen er høyeste lovlige – den første kandidaten.
    assert.equal(l.kand[0]!.nevro, 1);
    assert.equal(new Set(l.kand.map((k) => k.k)).size, l.kand.length);
    for (const k of l.kand) {
      assert.equal(k.t.length, ETTERLYST_DIM);
      assert.ok(k.k!.startsWith(l.trumf!), "kallet er ikke i trumf");
      assert.ok(Number.isFinite(k.v));
    }
    // Paret er policyens: det finnes som referanse i vrakgruppen fra samme stilling.
    assert.ok(vrak.some((v) => v.frø === l.frø && v.kand.some((k) => k.nevro === 1)));
  }
});
