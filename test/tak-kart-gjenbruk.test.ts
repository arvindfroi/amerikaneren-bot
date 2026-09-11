/**
 * TAKKARTET MED GJENBRUK — samme tall, lavere pris (11. sep).
 *
 * `--gjenbruk` bytter `lagIndre` per node mot `nyKamp()` på fire agenter, og spiller
 * ren-runden én gang per giv. For en DETERMINISTISK spek skal radene være byte-identiske
 * med standardstien; det er hele begrunnelsen for at knotten kan brukes i kravbatteriet.
 *
 * Identitet på bare nuller beviser ingenting (to stumme kart er også like), så budvinduet
 * prøves med et tak som gir et ekte gap. Og taket selv må kunne bite: `--maks-noder 0`
 * kapper alt, og da SKAL taket falle sammen med policyen.
 */

import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { ADAMS_MAALT } from "../src/moe2/agentspek.ts";

const dir = mkdtempSync(join(tmpdir(), "tak-kart-"));

function kart(navn: string, args: readonly string[]): { tekst: string; rader: Record<string, unknown>[] } {
  const ut = join(dir, `${navn}.jsonl`);
  const r = spawnSync(process.execPath, ["examples/tak-kart.ts", "--spek", ADAMS_MAALT, "--ut", ut, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(r.status, 0, `tak-kart feilet:\n${r.stderr}`);
  const tekst = readFileSync(ut, "utf8");
  return { tekst, rader: tekst.split("\n").filter((l) => l !== "").map((l) => JSON.parse(l) as Record<string, unknown>) };
}

test("tak-kart: --gjenbruk gir byte-identiske rader i sluttspillvinduet, og standardradene har de gamle feltene", () => {
  const a = kart("spill-std", ["--giver", "1", "--fase", "spill", "--fra", "8", "--til", "10"]);
  const b = kart("spill-gjen", ["--giver", "1", "--fase", "spill", "--fra", "8", "--til", "10", "--gjenbruk"]);
  assert.ok(a.rader.length > 0, "kartet skrev ingen rader");
  assert.equal(b.tekst, a.tekst, "gjenbruk endret radene for en deterministisk spek");
  assert.deepEqual(
    Object.keys(a.rader[0]!),
    ["merke", "frø", "sete", "rolle", "rein", "tak", "diff"],
    "standardstien fikk nye felt — arkivene kan ikke lenger sammenliknes rad for rad",
  );
});

test("tak-kart: --gjenbruk er identisk også der gapet er EKTE (budvinduet med tak)", () => {
  const a = kart("bud-std", ["--giver", "1", "--fase", "bud", "--maks-noder", "4"]);
  const b = kart("bud-gjen", ["--giver", "1", "--fase", "bud", "--maks-noder", "4", "--gjenbruk"]);
  assert.equal(b.tekst, a.tekst, "gjenbruk endret budvinduet");
  assert.ok(
    a.rader.some((r) => r["diff"] !== 0),
    "alle gap var 0 — da beviser identiteten ingenting; velg et annet frø",
  );
  assert.ok(a.rader.every((r) => typeof r["noder"] === "number" && typeof r["kappet"] === "boolean"));
});

test("tak-kart: --maks-noder 0 kapper hele treet — taket faller sammen med policyen", () => {
  const k = kart("bud-null", ["--giver", "1", "--fase", "bud", "--maks-noder", "0", "--gjenbruk"]);
  assert.ok(k.rader.length > 0);
  assert.ok(k.rader.every((r) => r["diff"] === 0), "et tre uten noder kan ikke finne et bedre bud enn policyen");
  assert.ok(k.rader.some((r) => r["kappet"] === true), "taket bet aldri — da er det ikke prøvd");
});

test("tak-kart: --andre med samme spek er identisk med standard — også med ett gjenbrukssett per sete", () => {
  const a = kart("vrak-std", ["--giver", "1", "--fase", "vrak"]);
  const b = kart("vrak-andre", ["--giver", "1", "--fase", "vrak", "--andre", ADAMS_MAALT, "--gjenbruk"]);
  assert.ok(a.rader.length > 0);
  assert.equal(b.tekst, a.tekst, "--andre endret radene selv om bordet er det samme");
});

test("tak-kart: --skard i/N tar bare sine giv", () => {
  const k = kart("skard", ["--giver", "2", "--fase", "vrak", "--skard", "1/2", "--gjenbruk"]);
  assert.ok(k.rader.length > 0);
  assert.ok(k.rader.every((r) => r["frø"] === 900000 + 7717), "skard 1/2 skal bare ha giv 1");
});
