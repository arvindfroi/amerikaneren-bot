/**
 * DRIVERNE MÅ VISE AGENTENE RUNDESLUTTEN (11. sep).
 *
 * En spek med hukommelsestro — `sik:…~mlbu=<804/920-trohode>`, `src/moe2/soketro.ts` —
 * får boka fylt bare gjennom `observer(state)` ved RUNDE_SLUTT. En løkke som utfører
 * NESTE selv spør aldri en agent i den fasen, og da KASTER søketroen i runde 2. Det er
 * med vilje: den tause varianten sto en gang med tom hukommelse uten at noe merket det.
 *
 * `examples/mlb-k8.ts --kamp` og armene uten tikk i `examples/k6-vaner.ts` var slike
 * løkker. Prøvene her:
 *
 *   FELLA        en løkke uten tikk kaster fortsatt — ellers beviser de grønne under
 *                ingenting om tikket.
 *   mlb-k8       `--kamp` med et 804-trohode (mlb-tro.bin utvidet med nullkolonner) i
 *                driverne kjører gjennom runde 2 og skriver rader.
 *   k6-vaner     `uten-okt` og `okt-utikk` spiller den samme stakken uten å kaste.
 *   STANDARDEN   `ADAMS_MAALT` og `K6_ADAMS` har ingen hukommelsestro, og et tikk endrer
 *                ikke ett eneste trekk i `ADAMS_MAALT` — det er derfor eksisterende rader
 *                fra `mlb-k8 --kamp` og `k6-vaner` er uendret.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lagIndre, ADAMS_MAALT } from "../src/moe2/agentspek.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import { MLB_TRO_HUKOMMELSE, MLB_TRO_INN_H } from "../src/mlb/trotrekk.ts";
import { ARMER, K6_ADAMS, spillKamp, stakkLeserHukommelse, type Arm } from "../examples/k6-vaner.ts";

const ROT = fileURLToPath(new URL("..", import.meta.url));
/**
 * RELATIV sti uten kolon: `sik:`-speken deler på «:», så «D:/…» ville blitt kuttet.
 * Under ROT og ignorert av git (`/_*`), per prosess.
 */
const MAPPE = `_test-observer-${process.pid}`;
const TRO804 = `${MAPPE}/tro-804.bin`;

/** Billigste søk som når troen: bare føreren, to verdener. */
const SPEK_804 = `sik:foerer:0:2~mlbu=${TRO804}:${ADAMS_MAALT}`;
const SPEK_660 = `sik:foerer:0:2~mlbu=e1-modell/mlb-tro.bin:${ADAMS_MAALT}`;

/**
 * Nullpunktet K6 → K8: inngangen utvidet med nullkolonner BAKERST, alt annet urørt. Samme
 * appformat som `verktoy/mlb-tro-tren.py` skriver: deler, lag, og per lag inn, ut, vekter
 * (ut × inn, rad for rad) og bias.
 */
function utvidTronett(fra: string, til: string, ekstra: number): void {
  const b = readFileSync(fra);
  let p = 0;
  const int = (): number => {
    const v = b.readInt32LE(p);
    p += 4;
    return v;
  };
  const hode = (a: number, c: number): Buffer => {
    const h = Buffer.alloc(8);
    h.writeInt32LE(a, 0);
    h.writeInt32LE(c, 4);
    return h;
  };
  const deler = int();
  const lag = int();
  assert.equal(deler, 1, "trohodet er ett nett");
  const biter: Buffer[] = [hode(deler, lag)];
  for (let l = 0; l < lag; l++) {
    const inn = int();
    const ut = int();
    const w = b.subarray(p, p + inn * ut * 4);
    p += inn * ut * 4;
    const bias = b.subarray(p, p + ut * 4);
    p += ut * 4;
    if (l === 0) {
      const ny = inn + ekstra;
      const nw = Buffer.alloc(ny * ut * 4);
      for (let r = 0; r < ut; r++) w.copy(nw, r * ny * 4, r * inn * 4, (r + 1) * inn * 4);
      biter.push(hode(ny, ut), nw, Buffer.from(bias));
    } else {
      biter.push(hode(inn, ut), Buffer.from(w), Buffer.from(bias));
    }
  }
  assert.equal(p, b.length, "det sto igjen byte etter siste lag");
  writeFileSync(til, Buffer.concat(biter));
}

before(() => {
  mkdirSync(`${ROT}/${MAPPE}`, { recursive: true });
  utvidTronett(`${ROT}/e1-modell/mlb-tro.bin`, `${ROT}/${TRO804}`, MLB_TRO_HUKOMMELSE);
  const nett = MlbTronett.fraBytes(new Uint8Array(readFileSync(`${ROT}/${TRO804}`)));
  assert.equal(nett.innBredde, MLB_TRO_INN_H);
  assert.equal(nett.brukerHukommelse, true);
});
after(() => rmSync(`${ROT}/${MAPPE}`, { recursive: true, force: true }));

const arm = (navn: string): Arm => {
  const a = ARMER.find((x) => x.navn === navn);
  if (a === undefined) throw new Error(`Ukjent arm «${navn}»`);
  return a;
};

/** Kamp.ts-løkka for `runder` runder, med eller uten tikk. Gir alle handlingene. */
function spill(spek: string, frø: number, runder: number, tikk: boolean): string[] {
  const agenter = [0, 1, 2, 3].map(() => lagIndre(spek));
  for (const a of agenter) a.nyKamp();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 9999 }, frø);
  const logg: string[] = [];
  let vakt = 0;
  while (s.fase !== "FERDIG" && vakt++ < 50_000) {
    if (tikk) for (const a of agenter) a.observer?.(s);
    if (s.fase === "RUNDE_SLUTT") {
      if (s.rundeNr + 1 >= runder) break;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    const h = agenter[iTur]!.velgHandling(s);
    logg.push(JSON.stringify(h));
    s = utfør(s, h).state;
  }
  return logg;
}

test("stakkLeserHukommelse: bredden i fila avgjør, og standardspekene har ingen", () => {
  assert.equal(stakkLeserHukommelse(SPEK_804), true);
  assert.equal(stakkLeserHukommelse(`okt:${SPEK_804}`), true);
  assert.equal(stakkLeserHukommelse(SPEK_660), false, "et 660-trohode leser ingen bok og trenger ingen tikk");
  assert.equal(stakkLeserHukommelse(ADAMS_MAALT), false);
  assert.equal(stakkLeserHukommelse(K6_ADAMS), false);
});

test("standarden: et tikk på hver tilstand endrer ikke ett trekk i ADAMS_MAALT", () => {
  // Grunnen til at `mlb-k8 --kamp`, `k6-vaner` og `mlb-trodata --kamp` er uendret for den.
  assert.deepEqual(spill(ADAMS_MAALT, 7_700_101, 3, true), spill(ADAMS_MAALT, 7_700_101, 3, false));
});

test("fella: en løkke som aldri viser RUNDE_SLUTT, kaster med hukommelsestro i driverne", () => {
  assert.throws(() => spill(SPEK_804, 7_700_202, 3, false), /aldri vist som RUNDE_SLUTT/);
});

test("mlb-k8 --kamp: drivere med et 804-trohode kjører gjennom runde 2 og skriver rader", () => {
  const ut = `${MAPPE}/k8.jsonl`;
  const r = spawnSync(
    process.execPath,
    [
      "examples/mlb-k8.ts", "--kamp", "--giver", "1", "--armer", "ingen", "--pergiv", "1",
      "--maksrunder", "3", "--drivere", SPEK_804, "--ut", ut,
    ],
    { cwd: ROT, encoding: "utf8" },
  );
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.doesNotMatch(r.stderr, /Søketro/);
  const rader = readFileSync(`${ROT}/${ut}`, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { runde: number });
  // `--fra-runde 1` og én stilling per runde: runde 1 og 2.
  assert.deepEqual(rader.map((x) => x.runde), [1, 2]);
});

test("k6-vaner: armene uten tikk spiller en stakk med hukommelsestro uten å kaste", () => {
  for (const [navn, adams] of [["uten-okt", SPEK_804], ["okt-utikk", `okt:${SPEK_804}`]] as const) {
    assert.equal(arm(navn).tikk, false, "prøven gjelder armene som ikke tikker");
    const rader = spillKamp(arm(navn), "noytral", 810_000_901, 0, {
      målPoeng: 9999,
      maksRunder: 3,
      adams,
      basis: ADAMS_MAALT,
    });
    assert.deepEqual(rader.map((x) => x.rundeNr), [0, 1, 2], `arm ${navn}`);
  }
});
