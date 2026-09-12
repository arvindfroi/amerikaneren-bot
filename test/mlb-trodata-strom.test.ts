/**
 * `--ut -`: RADENE PÅ STDOUT ER DE SAMME BYTENE SOM FILA (13. sep).
 *
 * Strømmende trening (`verktoy/mlb-tro-tren.py --strom`) finnes for at et korpus på 3,5·10⁸
 * rader — 1,43 TB på disk, ~705 GB i RAM — aldri skal måtte lagres. Hele den ideen hviler på
 * at strømmen bærer NØYAKTIG det fila ville båret. Er den påstanden feil, trener løkka på noe
 * annet enn den tror, og ingenting krasjer: en forskjøvet MLBT-post er fortsatt lovlige
 * flyttall.
 *
 * Derfor: samme kommando to ganger, én til fil og én til stdout, og sha256 av de to.
 *
 * FELLA SOM PRØVES MED: en framdriftslinje på stdout ville forskjøvet strømmen. Prøven under
 * kjører derfor MED framdrift på (den skrives hver kamp) og krever at stdout likevel er ren.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROT = fileURLToPath(new URL("..", import.meta.url));
const MAPPE = `_test-trodata-strom-${process.pid}`;

before(() => mkdirSync(`${ROT}/${MAPPE}`, { recursive: true }));
after(() => rmSync(`${ROT}/${MAPPE}`, { recursive: true, force: true }));

const sha = (b: Buffer): string => createHash("sha256").update(b).digest("hex");

/** Felles argumenter: små, men mer enn én kamp, så framdriftslinja faktisk skrives flere ganger. */
const FELLES = ["--kamp", "--kamper", "3", "--maksrunder", "2", "--sjanse", "1"];

test("--ut - gir byte for byte det samme som --ut <fil>", () => {
  const fil = `${MAPPE}/til-fil.bin`;
  const a = spawnSync(process.execPath, ["examples/mlb-trodata.ts", ...FELLES, "--ut", fil], {
    cwd: ROT,
    encoding: "buffer",
    maxBuffer: 1 << 28,
  });
  assert.equal(a.status, 0, String(a.stderr));

  const b = spawnSync(process.execPath, ["examples/mlb-trodata.ts", ...FELLES, "--ut", "-"], {
    cwd: ROT,
    encoding: "buffer",
    maxBuffer: 1 << 28,
  });
  assert.equal(b.status, 0, String(b.stderr));

  const fraFil = readFileSync(`${ROT}/${fil}`);
  const fraRør = b.stdout;
  assert.ok(fraFil.length > 12, "fila er tom — prøven måler ingenting");
  assert.equal(fraRør.length, fraFil.length, "ulik lengde på stdout og fil");
  assert.equal(sha(fraRør), sha(fraFil), "stdout og fil er ikke byte-identiske");

  // Og stdout inneholder BARE poster: hodet, og et helt antall rader etter det.
  assert.equal(fraRør.toString("ascii", 0, 4), "MLBT");
  const dim = fraRør.readInt32LE(8);
  assert.equal((fraRør.length - 12) % (dim * 4 + 52 + 4 + 2 + 2), 0, "stdout er ikke et helt antall poster");

  // Framdriften SKAL ha vært der — ellers prøver testen ikke det den sier den prøver.
  assert.match(String(b.stderr), /skard 0:/, "ingen framdrift på stderr: fella er ikke armert");
});

test("--ut - avviser sidefil-flaggene i stedet for å skrive «-.sekv.bin»", () => {
  for (const flagg of ["--sekvens", "--bordmerke"]) {
    const r = spawnSync(process.execPath, ["examples/mlb-trodata.ts", ...FELLES, flagg, "--ut", "-"], {
      cwd: ROT,
      encoding: "utf8",
    });
    assert.notEqual(r.status, 0, `${flagg} med --ut - ble godtatt`);
    assert.match(`${r.stdout}\n${r.stderr}`, /sidefil/);
  }
});
