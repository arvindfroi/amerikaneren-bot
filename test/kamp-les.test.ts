/**
 * `verktoy/kamp-les.py` SKAL LESE ALLE FILENE DEN FÅR — funnet 10. september.
 *
 * `verktoy/kampport.sh` sendte globben UKVOTERT (`analyse/kp-X s*.jsonl`), så bash
 * ekspanderte den til ett filnavn per skard, og leseren tok bare `sys.argv[1]`.
 * Hver kampport med 16 skard ble dømt på skard 0 alene: i1b ble lest som
 * «0,190, −1,44 SE» på 25 frø, og var 0,204, −5,19 SE på alle 400. Alle seks
 * committede kampport-rapportene i `analyse/` hadde samme feil (1/6 eller 1/4
 * av dataene), og én av dem snudde fortegn.
 *
 * Prøven gir leseren to filer på begge måtene den kan få dem — som separate
 * argumenter (det bash gjør med en ukvotert glob) og som ett kvotert mønster —
 * og krever at begge teller alle frøene. Den gamle leseren gir 2 av 4.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROT = fileURLToPath(new URL("..", import.meta.url));
const LESER = join(ROT, "verktoy", "kamp-les.py");

const KANDIDATER: readonly (readonly string[])[] = [["py", "-3"], ["python3"], ["python"]];
const python = KANDIDATER.find(
  ([cmd, ...a]) => spawnSync(cmd!, [...a, "--version"], { encoding: "utf8" }).status === 0,
);

const kjør = (args: readonly string[]): string => {
  const [cmd, ...pre] = python!;
  const r = spawnSync(cmd!, [...pre, LESER, ...args], { encoding: "utf8" });
  assert.equal(r.status, 0, `kamp-les.py feilet:\n${r.stderr}`);
  return r.stdout;
};

test(
  "kamp-les.py leser ALLE skard — både som separate argumenter og som kvotert glob",
  { skip: python === undefined ? "ingen python på maskinen" : false },
  () => {
    const dir = mkdtempSync(join(tmpdir(), "kamp-les-"));
    const filer: string[] = [];
    for (let skard = 0; skard < 2; skard++) {
      const rader: string[] = [];
      for (let k = 0; k < 2; k++) {
        const frø = 700_000_000 + skard * 10 + k;
        for (let sete = 0; sete < 4; sete++) {
          rader.push(
            JSON.stringify({
              frø,
              sete,
              kandVant: (sete + k + skard) % 3 === 0 ? 1 : 0,
              miljøVant: sete === k ? 1 : 0,
              kandMargin: sete - 1,
              miljøMargin: 0,
              kandRunder: 10,
            }),
          );
        }
      }
      const f = join(dir, `kp-tests${skard}.jsonl`);
      writeFileSync(f, rader.join("\n") + "\n", "utf8");
      filer.push(f);
    }

    const separat = kjør(filer);
    assert.match(separat, /^4 froe, 16 rader/, `separate argumenter:\n${separat}`);
    const glob = kjør([join(dir, "kp-tests*.jsonl")]);
    assert.match(glob, /^4 froe, 16 rader/, `kvotert glob:\n${glob}`);
    // Kontrollarmen: kontrollkampen har nøyaktig én vinner per frø.
    assert.match(glob, /MILJOETS vinnerandel\s+0\.2500/);
  },
);
