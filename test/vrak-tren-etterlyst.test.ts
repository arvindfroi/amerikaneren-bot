/**
 * `verktoy/vrak-tren.py --type etterlyst` TRENER KALLNETTET (K3.5/K3.8, 11. sep).
 *
 * Kallgruppene ligger i SAMME filer som vrakgruppene. Prøven gir treneren en blanding og krever
 * at den tar nøyaktig kallgruppene, skriver et 25-nett, og skriver de maskinlesbare linjene
 * ETTER treningen (linjer før første epoke har forsvunnet i WSL-røret før). Fella: feil bredde
 * for typen skal stoppe, ikke gi null rader og en tom modell.
 *
 * Krever torch – enten en python på maskinen eller WSL-venven prosjektet trener i. Uten hoppes
 * prøven over.
 */
import { strict as assert } from "node:assert";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROT = fileURLToPath(new URL("..", import.meta.url));
const TRENER = join(ROT, "verktoy", "vrak-tren.py");
const VENV = "/home/arvind/Arvind-Lora/.venv/bin/python";

const wslSti = (p: string): string => p.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, d: string) => `/mnt/${d.toLowerCase()}`);

type Kjører = (args: readonly string[]) => SpawnSyncReturns<string>;
const kjørere: [string, Kjører][] = [
  ...[["py", "-3"], ["python3"], ["python"]].map(
    ([cmd, ...pre]): [string, Kjører] => [cmd!, (a) => spawnSync(cmd!, [...pre, ...a], { encoding: "utf8" })],
  ),
  [
    "wsl",
    (a) =>
      spawnSync("wsl.exe", ["-d", "Ubuntu", "-e", VENV, ...a.map((x) => (/^[A-Za-z]:[\\/]/.test(x) ? wslSti(x) : x))], {
        encoding: "utf8",
      }),
  ],
];
const python = kjørere.find(([, k]) => {
  try {
    return k(["-c", "import torch"]).status === 0;
  } catch {
    return false;
  }
});

test(
  "vrak-tren.py --type etterlyst trener på kallgruppene alene og skriver angerlinjene til slutt",
  { skip: python === undefined ? "ingen python med torch" : false, timeout: 300_000 },
  () => {
    const [, kjør] = python!;
    const mappe = mkdtempSync(join(tmpdir(), "vrak-tren-etterlyst-"));
    const rader: string[] = [];
    const rng = ((x: number) => () => ((x = (x * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648))(7);
    for (let i = 0; i < 40; i++) {
      // Kallgruppe: fire kandidater, nivå i trekk 0–4; det nest høyeste er best når «renonse» (16) er på.
      const renonse = i % 2;
      const kand = [0, 1, 2, 3].map((nivå) => {
        const t = new Array<number>(25).fill(0);
        t[nivå] = 1;
        t[4] = nivå / 12;
        t[16] = renonse;
        t[24] = 1;
        const v = (renonse === 1 ? -Math.abs(nivå - 1) : -nivå) * 3 + rng();
        return { k: `S${14 - nivå}`, t, v, vs: v, vp: 0, ...(nivå === 0 ? { nevro: 1 } : {}) };
      });
      rader.push(JSON.stringify({ type: "etterlyst", frø: 1000 + i, runde: 0, sete: 0, n: 4, kand }));
      // Vrakgruppe i samme fil (24 bred, uten type): skal IKKE telles.
      const vk = [0, 1].map((j) => ({ t: new Array<number>(24).fill(j), v: j, vs: j, vp: 0, ...(j === 0 ? { nevro: 1 } : {}) }));
      rader.push(JSON.stringify({ frø: 1000 + i, runde: 0, sete: 0, n: 4, kand: vk }));
    }
    writeFileSync(join(mappe, "s0.jsonl"), rader.join("\n") + "\n");
    const ut = join(mappe, "etterlyst.bin");
    const felles = ["--data", mappe, "--epoker", "4", "--skjult", "16", "--holdoutandel", "0.25", "--logg", join(mappe, "logg.jsonl")];

    const r = kjør([TRENER, ...felles, "--type", "etterlyst", "--ut", ut]);
    assert.equal(r.status, 0, `treneren feilet:\n${r.stderr}\n${r.stdout}`);
    const linjer = r.stdout.trim().split("\n").map((l) => l.trim());
    const modell = linjer.findIndex((l) => l.startsWith("MODELL-ANGER-HOLDOUT "));
    const policy = linjer.findLastIndex((l) => l.startsWith("POLICY-ANGER-HOLDOUT "));
    assert.ok(modell >= 0 && policy > modell, `mangler angerlinjene etter treningen:\n${r.stdout}`);
    assert.ok(Number.isFinite(Number(linjer[modell]!.split(" ")[1])));
    assert.ok(Number.isFinite(Number(linjer[policy]!.split(" ")[1])));
    assert.ok(linjer.some((l) => l === "GRUPPER etterlyst dim 25: 40 stillinger, 160 kandidater"), r.stdout);

    // Nettet er i appformatet med 25 innganger og én utgang.
    assert.ok(existsSync(ut), "ingen vekter skrevet");
    // Små filer ligger i Nodes delte bufferpool: `.buffer` alene starter på feil sted.
    const bytes = readFileSync(ut);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    assert.equal(dv.getInt32(0, true), 1);
    assert.equal(dv.getInt32(8, true), 25);

    // Fella: kalltypen med vrakbredde stopper med en forklaring.
    const feil = kjør([TRENER, ...felles, "--type", "etterlyst", "--dim", "24", "--ut", join(mappe, "feil.bin")]);
    assert.notEqual(feil.status, 0);
    assert.match(feil.stderr + feil.stdout, /passer ikke/);
  },
);
