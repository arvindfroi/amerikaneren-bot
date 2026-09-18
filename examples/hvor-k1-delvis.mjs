/**
 * DELVIS AVLESNING av ablasjonen — samme regnestykke som driveren, men på de skardene som er
 * ferdige akkurat nå (19. sep).
 *
 *   node examples/hvor-k1-delvis.mjs [--dir D:/amb-grp/loop/hvor-k1] [--kampsett alle|utvalg|holdout]
 *
 * Driveren (`hvor-k1.mjs`) feller ingen dom før ALLE armer har alle åtte skard, og det er riktig:
 * en halvferdig arm har ikke samme nøkkelmengde som de andre. Denne leseren gjør det lovlige
 * mellomsteget i stedet — den skjærer ned til rundene som finnes i ALLE armer, og regner det
 * parrede tallet på akkurat de rundene. Tallet er dermed alltid gyldig, bare med mindre n.
 *
 * Alt annet er som i driveren: arm − ref i `bP` (100·ΔP(seier) for sete 0), menneskeleddet er
 * likt i alle armer og faller bort; SE er klyngebootstrap over kamp (B = 20 000).
 */
import { existsSync, readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const v = (n, d) => {
  const i = argv.indexOf(n);
  return i < 0 ? d : argv[i + 1];
};
const DIR = v("--dir", "D:/amb-grp/loop/hvor-k1");
const SETT = v("--kampsett", "alle");
const B = Number(v("--B", "20000"));
const KONF = JSON.parse(readFileSync("analyse/hvor-k1-konfig.json", "utf8"));
const ARMER = Object.keys(KONF.armer);
const REF = KONF.ref;

const settAv = new Map();
for (const l of readFileSync("analyse/k1-kampsett.tsv", "utf8").split(/\r?\n/)) {
  if (!l.trim() || l.startsWith("#") || l.startsWith("spill\t")) continue;
  const [id, s] = l.split("\t");
  if (id && s) settAv.set(id.trim(), s.trim());
}

const data = {};
const ferdig = {};
for (const a of ARMER) {
  const rader = [];
  let n = 0;
  for (let s = 0; s < 8; s++) {
    const f = `${DIR}/${a}-s${s}.jsonl`;
    if (!existsSync(`${f}.ferdig`)) continue; // bare FERDIGE skard – en halvskrevet fil er ikke data
    n++;
    for (const l of readFileSync(f, "utf8").split(/\r?\n/)) if (l.trim()) rader.push(JSON.parse(l));
  }
  ferdig[a] = n;
  data[a] = new Map(rader.map((r) => [`${r.spill}#${r.runde}`, r]));
}
console.log(`Ferdige skard per arm: ${ARMER.map((a) => `${a} ${ferdig[a]}/8`).join(", ")}`);
if (ARMER.some((a) => data[a].size === 0)) {
  console.log("Minst én arm har ingen ferdige skard ennå — ingen avlesning.");
  process.exit(0);
}

let felles = [...data[REF].keys()].filter(
  (k) => ARMER.every((a) => data[a].has(k)) && (SETT === "alle" || settAv.get(k.split("#")[0]) === SETT),
);
const kamp = (k) => k.split("#")[0];

function klynge(par) {
  const N = par.length;
  const m = par.reduce((a, p) => a + p.d, 0) / N;
  const kl = new Map();
  for (const p of par) {
    const x = kl.get(p.k) ?? { s: 0, n: 0 };
    x.s += p.d;
    x.n++;
    kl.set(p.k, x);
  }
  const liste = [...kl.values()];
  const Kn = liste.length;
  let rng = 20260919;
  const r = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const bs = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    let s = 0;
    let n = 0;
    for (let i = 0; i < Kn; i++) {
      const x = liste[Math.floor(r() * Kn)];
      s += x.s;
      n += x.n;
    }
    bs[b] = s / n;
  }
  const mb = bs.reduce((a, x) => a + x, 0) / B;
  return { m, se: Math.sqrt(bs.reduce((a, x) => a + (x - mb) ** 2, 0) / (B - 1)), N, K: Kn };
}
const f = (x, d = 3) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d).replace(".", ",");

console.log(`\nKampsett ${SETT}: ${felles.length} parrede runder i ${new Set(felles.map(kamp)).size} kamper (snittet av ferdige skard).\n`);
console.log(`| arm | arm − menneske | arm − ${REF} | z |`);
console.log(`|---|---|---|---|`);
for (const a of ARMER) {
  const mot = klynge(felles.map((k) => ({ k: kamp(k), d: data[a].get(k).bP - data[a].get(k).mP })));
  if (a === REF) {
    console.log(`| ${a} | ${f(mot.m)} ± ${f(mot.se).slice(1)} | – (referanse) | – |`);
    continue;
  }
  const d = klynge(felles.map((k) => ({ k: kamp(k), d: data[a].get(k).bP - data[REF].get(k).bP })));
  console.log(`| ${a} | ${f(mot.m)} ± ${f(mot.se).slice(1)} | **${f(d.m)} ± ${f(d.se).slice(1)}** | ${(d.m / d.se).toFixed(2)} |`);
}
