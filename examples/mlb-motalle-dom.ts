/**
 * DOMMEN over `mlb-motalle`s RÅRADER, uten å spille om igjen.
 *
 *   node examples/mlb-motalle-dom.ts --raa "analyse/motalle-del1/*.jsonl" \
 *     --ut analyse/mlb-motalle-del1.tsv
 *
 * ====================== HVORFOR DEN ER SKILT UT =========================
 *
 * Målingen ble stoppet før alle motstanderne var ferdige: nett-mot-nett koster
 * fire framoverpass per beslutning og kamper som går til rundetaket, og de fire
 * siste epokene ville tatt to og en halv time til. Rådene som ER skrevet er
 * fullstendige for de tolv første motstanderne — men de lå bare i `-raa-*`,
 * fordi dommen ble felt til slutt.
 *
 * Det er den samme lærdommen som `docs/plan.md` om langkjøringer: **en måling
 * som først kan LESES når hele kjøringen er ferdig, er en måling som kan gå
 * tapt.** Dommen er derfor et eget ledd som kan felles når som helst, over det
 * som finnes.
 *
 * Motstandere med færre rader enn `--minst` utelates, med navn, så en halv
 * måling aldri kan forveksles med en hel.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";
import { dirname } from "node:path";

let råMønster = "analyse/mlb-motalle-raa-*.jsonl";
let ut = "analyse/mlb-motalle.tsv";
let navn = "mlb-e10";
let minst = 100;

for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  const v = process.argv[i + 1];
  if (a === "--raa") råMønster = v ?? råMønster;
  else if (a === "--ut") ut = v ?? ut;
  else if (a === "--navn") navn = v ?? navn;
  else if (a === "--minst") minst = Number(v);
}

interface Rad {
  mot: string;
  bånd: number;
  kandidat: number;
  referanse: number;
  kontroll: number;
  kSeier: number;
  kAvbrutt: number;
}

const alle: Rad[] = [];
for (const m of råMønster.split(",")) {
  for (const fil of globSync(m)) {
    for (const l of readFileSync(fil, "utf8").split("\n")) {
      if (l.trim() !== "") alle.push(JSON.parse(l) as Rad);
    }
  }
}
if (alle.length === 0) throw new Error(`Ingen rader for «${råMønster}»`);

function døm(d: readonly number[]): { n: number; snitt: number; se: number; z: number; pos: number; neg: number } {
  const n = d.length;
  if (n === 0) return { n: 0, snitt: NaN, se: NaN, z: NaN, pos: 0, neg: 0 };
  const snitt = d.reduce((a, b) => a + b, 0) / n;
  const varians = n > 1 ? d.reduce((a, x) => a + (x - snitt) ** 2, 0) / (n - 1) : 0;
  const se = Math.sqrt(varians / n);
  return {
    n,
    snitt,
    se,
    z: se > 0 ? snitt / se : NaN,
    pos: d.filter((x) => x > 0).length,
    neg: d.filter((x) => x < 0).length,
  };
}

mkdirSync(dirname(ut), { recursive: true });
writeFileSync(
  ut,
  "kandidat\tmotstander\tn\tsnitt\tse\tz\tpos\tneg\tseier%\tavbrutt%\tbaand0\tbaand1\tkontroll\n",
  "utf8",
);

const motstandere = [...new Set(alle.map((r) => r.mot))];
for (const mot of motstandere) {
  const rader = alle.filter((r) => r.mot === mot);
  if (rader.length < minst) {
    process.stderr.write(`UTELATT ${mot}: bare ${rader.length} rader (krever ${minst})\n`);
    continue;
  }
  const dom = døm(rader.map((r) => r.kandidat - r.referanse));
  const kdom = døm(rader.map((r) => r.kontroll - r.referanse));
  const båndSnitt = (b: number): number => {
    const v = rader.filter((r) => r.bånd === b).map((r) => r.kandidat - r.referanse);
    return v.length === 0 ? NaN : v.reduce((a, x) => a + x, 0) / v.length;
  };
  const linje = [
    navn,
    mot,
    dom.n,
    dom.snitt.toFixed(4),
    dom.se.toFixed(4),
    dom.z.toFixed(2),
    dom.pos,
    dom.neg,
    ((rader.reduce((a, r) => a + r.kSeier, 0) / rader.length) * 100).toFixed(1),
    ((rader.reduce((a, r) => a + r.kAvbrutt, 0) / rader.length) * 100).toFixed(1),
    båndSnitt(0).toFixed(3),
    båndSnitt(1).toFixed(3),
    kdom.n === 0 || Math.abs(kdom.snitt) < 1e-9 ? "0.0000 OK" : `${kdom.snitt.toFixed(4)} SKJEV`,
  ].join("\t");
  appendFileSync(ut, linje + "\n", "utf8");
  process.stderr.write(linje + "\n");
}
process.stderr.write(`\n-> ${ut}\n`);
