/**
 * HVOR METTET ER BUDMODELLEN? – anger delt i det den KAN vite og det den ikke kan.
 *
 *   node examples/budmetning.ts --data bud-data --modell e1-modell/bud-gbt.json
 *
 * ===================== ARVINDS PRESISERING, SOM ER HELE POENGET ============
 *
 * «den burde ikke angre på stikk som den vet at den fikk fra makker eller fra
 * inbytten btw, men den bør erkjenne det.»
 *
 * Modellen byr på egen hånd alene. Makkerens kort og talongen er usynlige i
 * budøyeblikket, og variasjonen de bidrar med er UREDUSERBAR – å trekke den
 * fra modellens score er å måle terningkast og kalle det feil. Men den er
 * ikke uforutsigbar i FORVENTNING: vi har målt at makkerbidraget faller
 * 3,06 → 2,44 når trumflengden går 4 → 7, og talongtrumfen 0,90 → 0,58. Det
 * er systematisk, og en kalibrert modell skal ha det inne.
 *
 * Derfor tre nivåer, ikke ett:
 *
 *   KONSTANT      beste faste bud for alle hender. Gulvet.
 *   KALIBRERT     beste bud per μ-BØTTE, valgt ut-av-utvalg. Dette er taket
 *                 en modell med nøyaktig samme informasjon kan nå: den vet
 *                 fordelingen av lagstikk gitt hånden, men ikke trekningen.
 *   FASIT         beste bud per HÅND, i etterpåklokskap. Uoppnåelig – den
 *                 forutsetter at man vet hva makkeren og talongen ga.
 *
 *   metning = (budm − KONSTANT) / (KALIBRERT − KONSTANT)
 *
 * og avstanden KALIBRERT → FASIT er nøyaktig den ureduserbare delen Arvind
 * sier modellen ikke skal klandres for.
 *
 * ====================== HVORFOR UT-AV-UTVALG ER OBLIGATORISK ===============
 *
 * `ev[N]` er et snitt over 24 trekninger, altså et STØYETE estimat. Tar man
 * argmax over det per hånd, får man vinnerens forbannelse – prosjektet har
 * målt vippepunktet til K ≈ 48, og 24 er godt under. FASIT-raden er derfor
 * oppblåst med vilje og skal leses som en øvre grense, ikke som et mål.
 *
 * KALIBRERT unngår fellen ved å velge budet på den ene halvdelen av hendene
 * og lese av på den andre. Valget bygger da på hundrevis av hender per bøtte,
 * ikke på 24 trekninger av én.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { opprettSpill, type GameState } from "../src/index.ts";
import { budTrekk } from "../src/moe2/budtrekk.ts";
import { lesBudmodell } from "../src/moe2/budagent.ts";

let datakat = "bud-data";
let modellFil = "e1-modell/bud-gbt.json";
let ut = "analyse/budmetning.txt";
let bøtter = 12;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--data") datakat = process.argv[++i]!;
  else if (a === "--modell") modellFil = process.argv[++i]!;
  else if (a === "--ut") ut = process.argv[++i]!;
  else if (a === "--boetter") bøtter = Number(process.argv[++i]);
}

interface Rad {
  ev: Record<string, number>;
  frø: number;
  sete: number;
}

const rader: Rad[] = [];
for (const f of readdirSync(datakat).filter((x) => x.endsWith(".jsonl")).sort()) {
  for (const l of readFileSync(join(datakat, f), "utf8").split("\n")) {
    if (l.trim() === "") continue;
    try {
      const r = JSON.parse(l) as Rad;
      if (r.ev && Number.isFinite(r.frø)) rader.push(r);
    } catch {
      continue;
    }
  }
}
if (rader.length === 0) {
  console.error(`Fant ingen rader i ${datakat}`);
  process.exit(1);
}

const modell = lesBudmodell(modellFil);
const forutsi = (n: { blad: boolean; verdi?: number; kol?: number; terskel?: number; v?: unknown; h?: unknown }, x: Float32Array): number =>
  n.blad ? n.verdi! : forutsi((x[n.kol!]! <= n.terskel! ? n.v : n.h) as typeof n, x);
const anslå = (s: { basis: number; trær: unknown[] }, x: Float32Array): number =>
  s.basis + modell.rate * s.trær.reduce((a: number, t) => a + forutsi(t as Parameters<typeof forutsi>[0], x), 0);

/** Budene som finnes i datasettet. 0 = PASS. */
const BUD = [...new Set(rader.flatMap((r) => Object.keys(r.ev)))].map(Number).sort((a, b) => a - b);

const sn = (v: readonly number[]): number => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const se = (v: readonly number[]): number => {
  if (v.length < 2) return NaN;
  const m = sn(v);
  let s = 0;
  for (const x of v) s += (x - m) * (x - m);
  return Math.sqrt(s / (v.length - 1) / v.length);
};

// --- Modellens eget valg per hånd ------------------------------------------
interface Punkt {
  ev: Record<string, number>;
  μ: number;
  valgt: number;
  halv: number;
}
const punkter: Punkt[] = [];
let hoppet = 0;
for (const r of rader) {
  let s: GameState;
  try {
    s = opprettSpill({ antallSpillere: 4 }, r.frø >>> 0);
  } catch {
    hoppet++;
    continue;
  }
  if (s.fase !== "BUDRUNDE") {
    hoppet++;
    continue;
  }
  let x: Float32Array;
  try {
    x = budTrekk(s, r.sete);
  } catch {
    hoppet++;
    continue;
  }
  const μ = anslå(modell.mμ, x);
  const σ = Math.max(0.6, anslå(modell.mσ, x));
  // Samme utregning som Budagent: EV(N) = P(vinner budrunden)·2N(2P(N)−1)
  // + (1−P)·evForsvar. Se src/moe2/budagent.ts.
  const Φ = (z: number): number => {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
    const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return z >= 0 ? 1 - p : p;
  };
  let valgt = 0;
  let bv = 2.5;
  for (const N of BUD) {
    if (N === 0) continue;
    const P = 1 - Φ((N - 0.5 - μ) / σ);
    const p = modell.vant[String(N)] ?? (N >= 11 ? 1 : 0);
    const ev = p * (2 * N * (2 * P - 1)) + (1 - p) * 2.5;
    if (ev > bv) {
      bv = ev;
      valgt = N;
    }
  }
  punkter.push({ ev: r.ev, μ, valgt, halv: (r.frø >>> 0) % 2 });
}

const les = (p: Punkt, N: number): number => p.ev[String(N)] ?? NaN;

// --- Gulv: beste faste bud --------------------------------------------------
let konstBud = BUD[0]!;
let konstEV = -Infinity;
for (const N of BUD) {
  const v = punkter.map((p) => les(p, N)).filter(Number.isFinite);
  if (v.length < punkter.length * 0.5) continue;
  if (sn(v) > konstEV) {
    konstEV = sn(v);
    konstBud = N;
  }
}

// --- Tak: kalibrert per μ-bøtte, valgt UT-AV-UTVALG -------------------------
const sortert = [...punkter].sort((a, b) => a.μ - b.μ);
const grenser: number[] = [];
for (let i = 1; i < bøtter; i++) grenser.push(sortert[Math.floor((i * sortert.length) / bøtter)]!.μ);
const bøtte = (μ: number): number => {
  let i = 0;
  while (i < grenser.length && μ >= grenser[i]!) i++;
  return i;
};
/** Beste bud for bøtta, valgt på `treningshalv`. */
const valgIBøtte = new Map<string, number>();
for (const h of [0, 1]) {
  for (let b = 0; b < bøtter; b++) {
    const tren = punkter.filter((p) => p.halv !== h && bøtte(p.μ) === b);
    let best = konstBud;
    let bev = -Infinity;
    for (const N of BUD) {
      const v = tren.map((p) => les(p, N)).filter(Number.isFinite);
      if (v.length < 20) continue;
      if (sn(v) > bev) {
        bev = sn(v);
        best = N;
      }
    }
    valgIBøtte.set(`${h}|${b}`, best);
  }
}

const evBudm = punkter.map((p) => les(p, p.valgt)).filter(Number.isFinite);
const evKonst = punkter.map((p) => les(p, konstBud)).filter(Number.isFinite);
const evKal = punkter.map((p) => les(p, valgIBøtte.get(`${p.halv}|${bøtte(p.μ)}`) ?? konstBud)).filter(Number.isFinite);
const evFasit = punkter
  .map((p) => Math.max(...BUD.map((N) => les(p, N)).filter(Number.isFinite)))
  .filter(Number.isFinite);

const rom = sn(evKal) - sn(evKonst);
const metning = rom > 1e-9 ? (sn(evBudm) - sn(evKonst)) / rom : NaN;
const f = (x: number): string => (x >= 0 ? "+" : "") + x.toFixed(3);

const L = [
  ``,
  `=== HVOR METTET ER BUDMODELLEN? ===`,
  `${punkter.length} hender fra ${datakat} (${hoppet} hoppet over), modell ${modellFil}.`,
  `ev[N] er snitt over 24 verdenstrekninger – altsaa forventet utbytte GITT`,
  `haanden, over makkerens kort og talongen.`,
  ``,
  `nivaa                          poeng/runde      hva det er`,
  `--------------------------------------------------------------------------`,
  `KONSTANT (bud ${konstBud})            ${f(sn(evKonst)).padStart(8)} ± ${se(evKonst).toFixed(3)}   gulvet: ett bud for alle`,
  `BUDMODELLEN                  ${f(sn(evBudm)).padStart(8)} ± ${se(evBudm).toFixed(3)}   det vi har`,
  `KALIBRERT (mu-boette)        ${f(sn(evKal)).padStart(8)} ± ${se(evKal).toFixed(3)}   taket med SAMME informasjon`,
  `FASIT (per haand)            ${f(sn(evFasit)).padStart(8)} ± ${se(evFasit).toFixed(3)}   uoppnaaelig, og oppblaast`,
  `--------------------------------------------------------------------------`,
  ``,
  `METNING = (budm − konstant) / (kalibrert − konstant) = ${(100 * metning).toFixed(1)} %`,
  ``,
  `Rommet som FINNES aa hente: ${f(rom)} poeng/runde.`,
  `Rommet budm har tatt:       ${f(sn(evBudm) - sn(evKonst))}.`,
  `Rommet som staar igjen:     ${f(sn(evKal) - sn(evBudm))}.`,
  ``,
  `UREDUSERBART (makker + talong): ${f(sn(evFasit) - sn(evKal))} poeng/runde.`,
  `Det er avstanden fra det beste en modell med vaar informasjon kan gjoere,`,
  `til det beste i etterpaaklokskap. Arvind: «den burde ikke angre paa stikk`,
  `som den vet at den fikk fra makker eller fra inbytten.» Dette tallet ER den`,
  `angeren, og den skal IKKE trekkes fra modellens score.`,
  ``,
  `FORBEHOLD: FASIT-raden er argmax over 24 stoeyete trekninger og lider av`,
  `vinnerens forbannelse (prosjektet maalte vippepunktet til K ~ 48). Den er`,
  `en OEVRE grense for det ureduserbare, ikke et estimat av det.`,
  ``,
  `PER MU-BOETTE  (hva modellen byr mot hva boetta burde bydd)`,
  `  boette   n     mu      budm-snitt   kalibrert bud   ev budm   ev kal`,
];
for (let b = 0; b < bøtter; b++) {
  const p = punkter.filter((x) => bøtte(x.μ) === b);
  if (p.length === 0) continue;
  const eb = p.map((x) => les(x, x.valgt)).filter(Number.isFinite);
  const ek = p.map((x) => les(x, valgIBøtte.get(`${x.halv}|${b}`) ?? konstBud)).filter(Number.isFinite);
  L.push(
    `  ${String(b).padStart(4)} ${String(p.length).padStart(6)} ${sn(p.map((x) => x.μ)).toFixed(2).padStart(7)} ` +
      `${sn(p.map((x) => x.valgt)).toFixed(2).padStart(11)} ${String(valgIBøtte.get(`0|${b}`) ?? konstBud).padStart(13)} ` +
      `${f(sn(eb)).padStart(9)} ${f(sn(ek)).padStart(8)}`,
  );
}
L.push(``);

const tekst = L.join("\n");
console.log(tekst);
mkdirSync(dirname(ut), { recursive: true });
writeFileSync(ut, tekst + "\n");
