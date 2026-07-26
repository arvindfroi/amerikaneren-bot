/**
 * Rapport for hode-mot-hode-målingene mot MesterAI (examples/mesterai-h2h.ts).
 *
 *   node examples/mesterai-h2h-rapport.ts analyse/h2h-nevro.jsonl analyse/h2h-sdr1.jsonl
 *   node examples/mesterai-h2h-rapport.ts analyse/h2h-*.jsonl --ut analyse/mesterai-maaling.txt
 *
 * STATISTIKKEN – hvorfor paret er enheten og ikke kampen.
 *
 * Hvert par er to kamper på SAMME giving, der MesterAI sitter på {0,2} i den
 * ene og {1,3} i den andre. Kortflaksen i den givingen treffer derfor begge
 * botene like mye, og først når de to kampene legges sammen er den nullet ut.
 * De to kampene i et par er altså ikke uavhengige observasjoner – paret er én.
 * Å regne SE over kamper ville halvert den kunstig.
 *
 * TO MÅLESTOKKER, og de svarer på ulike spørsmål:
 *
 *   poeng per runde   Poengraten. Robust mot at kamplengden varierer voldsomt
 *                     (15 til 35 runder i pilotene) – en kamp til 100 stopper
 *                     når noen KOMMER dit, så sluttpoengene måler like mye
 *                     kamplengde som spillestyrke.
 *   poeng per kamp    Arena-konvensjonen (to seter summert), tatt med for
 *                     kontinuitet med arena/README.md. Støyende av grunnen
 *                     over – les den som en grovmåling.
 *
 * Begge er MesterAI MINUS kandidaten: positivt = MesterAI er best.
 * Når to kandidater er målt på de samme parene, regnes også den PARREDE
 * differansen mellom dem – det er tallet som viser overføringstapet.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

interface Kamplinje {
  readonly kandidat: string;
  readonly par: number;
  readonly side: number;
  readonly froe: number;
  /** Nøyaktig én av dem er satt: tidsbudsjett eller låst verdenstall. */
  readonly ms: number | null;
  readonly verdener?: number | null;
  readonly mesterPoeng: number;
  readonly kandidatPoeng: number;
  readonly runder: number;
  readonly mesterVant: boolean;
  readonly budrunder: { mester: number; kandidat: number };
  readonly klarte: { mester: number; kandidat: number };
}

const filer: string[] = [];
let utSti: string | null = null;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--ut") utSti = process.argv[++i] ?? null;
  else filer.push(a);
}
if (filer.length === 0) {
  console.error("Bruk: node examples/mesterai-h2h-rapport.ts <h2h.jsonl> [flere ...] [--ut fil]");
  process.exit(1);
}

const linjer: Kamplinje[] = [];
for (const f of filer) {
  for (const l of readFileSync(f, "utf8").split("\n")) {
    if (l.trim() !== "") linjer.push(JSON.parse(l) as Kamplinje);
  }
}

// --- Parvis sammenslåing ----------------------------------------------------

interface Par {
  readonly par: number;
  /** Givingen paret ble spilt på. Det er DENNE som identifiserer paret. */
  readonly froe: number;
  /** MesterAI minus kandidaten, poeng per runde, over begge kampene i paret. */
  readonly perRunde: number;
  /** MesterAI minus kandidaten, poeng per kamp (to seter summert). */
  readonly perKamp: number;
  readonly runder: number;
  readonly mesterSeire: number;
}

/**
 * Bare KOMPLETTE par teller: en halv speiling er en skjev måling, ikke en måling.
 *
 * Paret identifiseres av FRØET, ikke av par-indeksen. To kjøringer med ulik
 * `--froe` bruker de samme indeksene 0, 1, 2 … på helt forskjellige givere;
 * grupperte man på indeks, ville en side fra det ene frøbåndet og en side fra
 * det andre enten smelte sammen til et falskt par eller (med fire linjer på
 * samme indeks) forsvinne som «ikke komplett». Begge deler har skjedd.
 */
function parVis(rader: readonly Kamplinje[]): Par[] {
  const etter = new Map<number, Kamplinje[]>();
  for (const r of rader) {
    if (!etter.has(r.froe)) etter.set(r.froe, []);
    etter.get(r.froe)!.push(r);
  }
  const ut: Par[] = [];
  for (const [froe, kamper] of [...etter].sort((a, b) => a[0] - b[0])) {
    if (kamper.length !== 2 || new Set(kamper.map((k) => k.side)).size !== 2) continue;
    const runder = kamper.reduce((s, k) => s + k.runder, 0);
    const diff = kamper.reduce((s, k) => s + (k.mesterPoeng - k.kandidatPoeng), 0);
    ut.push({
      par: kamper[0]!.par,
      froe,
      // Per sete: hver side har to seter, så divisjonen gir poeng per sete per runde.
      perRunde: diff / runder / 2,
      perKamp: diff / 2,
      runder,
      mesterSeire: kamper.filter((k) => k.mesterVant).length,
    });
  }
  return ut;
}

function snitt(x: readonly number[]): number {
  return x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
}
function se(x: readonly number[]): number {
  if (x.length < 2) return NaN;
  const m = snitt(x);
  return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1) / x.length);
}
function fortegn(v: number, d = 3): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(d)}`;
}

const kandidater = [...new Set(linjer.map((l) => l.kandidat))];
const parPerKandidat = new Map<string, Par[]>();
for (const k of kandidater) parPerKandidat.set(k, parVis(linjer.filter((l) => l.kandidat === k)));

const ut: string[] = [];
const skriv = (s = ""): void => {
  ut.push(s);
  console.log(s);
};

skriv("=== MesterAI hode mot hode: 2 mot 2, speilede par ===");
skriv(`Kilder: ${filer.join(", ")}`);
const innstilling = [
  ...new Set(linjer.map((l) => (l.verdener ? `${l.verdener} verdener (låst)` : `${l.ms} ms`))),
].join(" / ");
skriv(`MesterAI-innstilling: ${innstilling} per kortvalg`);
skriv("Positivt tall = MesterAI er BEDRE enn kandidaten.");
skriv();

for (const k of kandidater) {
  const par = parPerKandidat.get(k)!;
  if (par.length === 0) {
    skriv(`${k}: ingen komplette par ennå`);
    continue;
  }
  const pr = par.map((p) => p.perRunde);
  const pk = par.map((p) => p.perKamp);
  const seire = par.reduce((s, p) => s + p.mesterSeire, 0);
  const rader = linjer.filter((l) => l.kandidat === k);
  const budM = rader.reduce((s, r) => s + r.budrunder.mester, 0);
  const budK = rader.reduce((s, r) => s + r.budrunder.kandidat, 0);
  const klartM = rader.reduce((s, r) => s + r.klarte.mester, 0);
  const klartK = rader.reduce((s, r) => s + r.klarte.kandidat, 0);
  const pst = (a: number, b: number): string => (b === 0 ? "–" : `${((100 * a) / b).toFixed(0)} %`);

  skriv(`--- MesterAI mot ${k} ---`);
  skriv(`  par ${par.length} (${par.length * 2} kamper, ${par.reduce((s, p) => s + p.runder, 0)} runder)`);
  skriv(`  poeng per runde per sete: ${fortegn(snitt(pr))} ± ${se(pr).toFixed(3)}`);
  skriv(`  poeng per kamp (2 seter): ${fortegn(snitt(pk), 1)} ± ${se(pk).toFixed(1)}`);
  skriv(`  kampseire MesterAI: ${seire}/${par.length * 2}`);
  skriv(`  budrunder vunnet: MesterAI ${budM} (klarte ${pst(klartM, budM)}), ${k} ${budK} (klarte ${pst(klartK, budK)})`);
  skriv();
}

// --- Parrede sammenlikninger mellom kandidatene -----------------------------
// Har to kandidater spilt de SAMME parene (samme givere), kan differansen
// mellom dem regnes par for par. Det er den eneste måten å måle f.eks.
// overføringstapet til sd-r1 uten at kortflaksen forurenser tallet.
if (kandidater.length > 1) {
  skriv("=== Parrede sammenlikninger mellom kandidatene (samme givere) ===");
  skriv("Positivt = FØRSTE kandidat taper mer mot MesterAI enn den andre.");
  skriv();
  for (let i = 0; i < kandidater.length; i++) {
    for (let j = i + 1; j < kandidater.length; j++) {
      const a = parPerKandidat.get(kandidater[i]!)!;
      const b = parPerKandidat.get(kandidater[j]!)!;
      // Felles par = felles GIVING, altså samme frø – ikke samme par-indeks.
      const bKart = new Map(b.map((p) => [p.froe, p]));
      const felles = a.filter((p) => bKart.has(p.froe));
      if (felles.length < 2) continue;
      const dR = felles.map((p) => p.perRunde - bKart.get(p.froe)!.perRunde);
      const dK = felles.map((p) => p.perKamp - bKart.get(p.froe)!.perKamp);
      skriv(`${kandidater[i]} minus ${kandidater[j]} (${felles.length} felles par):`);
      skriv(`  poeng per runde per sete: ${fortegn(snitt(dR))} ± ${se(dR).toFixed(3)}`);
      skriv(`  poeng per kamp (2 seter): ${fortegn(snitt(dK), 1)} ± ${se(dK).toFixed(1)}`);
      skriv();
    }
  }
}

if (utSti !== null) {
  mkdirSync(dirname(utSti), { recursive: true });
  writeFileSync(utSti, ut.join("\n") + "\n");
  console.log(`→ ${utSti}`);
}
