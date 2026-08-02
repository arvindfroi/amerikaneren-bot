/**
 * HVA STÅR DET EGENTLIG I TRENINGSDATAENE?
 *
 *   node examples/dataprofil.ts sd-spredt sd-dagger sd-dagger2 \
 *     --ut analyse/dataprofil.txt
 *
 * ==================== SPØRSMÅLET SOM FAKTISK BETYR NOE =====================
 *
 * Radtallet er ikke datamengden. En stilling der alle lovlige kort er verdt
 * det samme er ikke en beslutning – den lærer nettet ingenting om hva som er
 * riktig, den lærer det bare å gjenta gjennomsnittet. Er halvparten av
 * radene slike, har vi halvparten så mye data som telleren viser, og
 * «300 000 stillinger» er et tall om diskplass.
 *
 * SPENNET er derfor måltallet: største minus minste orakelverdi blant de
 * lovlige kortene i stillingen. Spenn 0 = tvungent trekk eller likegyldig
 * valg. Stort spenn = stillingen der en feil faktisk koster stikk, og det er
 * de radene som bærer læringen.
 *
 * Fordelingen over `stikk` er med av samme grunn som rollevekten i planen:
 * blir sluttspillet overrepresentert, lærer nettet åpningen dårlig, og
 * åpningen er der kontrakten avgjøres.
 *
 * Skriver til fil, ikke bare stdout – lange kjøringer i dette prosjektet har
 * mistet resultater i rør før.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const mapper: string[] = [];
let ut = "analyse/dataprofil.txt";
let maks = 0;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--ut") ut = process.argv[++i]!;
  else if (a === "--maks") maks = Number(process.argv[++i]);
  else mapper.push(a);
}
if (mapper.length === 0) {
  console.error("Bruk: node examples/dataprofil.ts <mappe> [mappe...] [--ut fil] [--maks n]");
  process.exit(1);
}

interface Rad {
  t: number[];
  v: Record<string, number>;
  stikk: number;
  frø: number;
  n?: number;
}

const spenn: number[] = [];
const perStikk = new Map<number, { n: number; spenn: number; null: number }>();
const perValg = new Map<number, number>();
const perMappe = new Map<string, { n: number; null: number; spenn: number }>();
const givere = new Set<number>();
let rader = 0;
let bredde = 0;

for (const m of mapper) {
  let filer: string[];
  try {
    filer = readdirSync(m).filter((f) => f.endsWith(".jsonl")).sort();
  } catch {
    console.error(`  hopper over ${m} (finnes ikke)`);
    continue;
  }
  const mm = { n: 0, null: 0, spenn: 0 };
  for (const f of filer) {
    for (const linje of readFileSync(join(m, f), "utf8").split("\n")) {
      if (linje.trim() === "") continue;
      let r: Rad;
      try {
        r = JSON.parse(linje) as Rad;
      } catch {
        continue; // siste linje kan være halvskrevet mens skardene kjører
      }
      if (!r.v || !r.t) continue;
      const verdier = Object.values(r.v);
      if (verdier.length < 2) continue; // tvungent trekk – ikke en beslutning
      bredde = r.t.length;
      const s = Math.max(...verdier) - Math.min(...verdier);
      spenn.push(s);
      rader++;
      givere.add(r.frø);
      mm.n++;
      mm.spenn += s;
      if (s < 1e-9) mm.null++;
      const st = r.stikk ?? -1;
      const e = perStikk.get(st) ?? { n: 0, spenn: 0, null: 0 };
      e.n++;
      e.spenn += s;
      if (s < 1e-9) e.null++;
      perStikk.set(st, e);
      perValg.set(verdier.length, (perValg.get(verdier.length) ?? 0) + 1);
      if (maks > 0 && rader >= maks) break;
    }
    if (maks > 0 && rader >= maks) break;
  }
  perMappe.set(m, mm);
  if (maks > 0 && rader >= maks) break;
}

spenn.sort((a, b) => a - b);
const kvant = (p: number): number => (spenn.length ? spenn[Math.min(spenn.length - 1, Math.floor(p * spenn.length))]! : NaN);
const snitt = spenn.length ? spenn.reduce((a, x) => a + x, 0) / spenn.length : NaN;
const nullSpenn = spenn.filter((x) => x < 1e-9).length;
const smaa = spenn.filter((x) => x < 0.25).length;

const L: string[] = [
  ``,
  `=== PROFIL AV TRENINGSDATAENE ===`,
  `${mapper.join(" + ")} – ${rader.toLocaleString("nb-NO")} rader med >= 2 lovlige kort, ${givere.size} givere, ${bredde} trekk`,
  ``,
  `SPENN = beste minus daarligste orakelverdi blant lovlige kort.`,
  `Det er stillingens innsats: spenn 0 betyr at valget ikke kan tas feil.`,
  ``,
  `  snitt            ${snitt.toFixed(3)}`,
  `  median           ${kvant(0.5).toFixed(3)}`,
  `  10 % / 25 %      ${kvant(0.1).toFixed(3)} / ${kvant(0.25).toFixed(3)}`,
  `  75 % / 90 %      ${kvant(0.75).toFixed(3)} / ${kvant(0.9).toFixed(3)}`,
  `  99 %             ${kvant(0.99).toFixed(3)}`,
  ``,
  `  spenn = 0        ${nullSpenn.toLocaleString("nb-NO")} (${((100 * nullSpenn) / rader).toFixed(1)} %)  <- laerer ingenting`,
  `  spenn < 0,25     ${smaa.toLocaleString("nb-NO")} (${((100 * smaa) / rader).toFixed(1)} %)  <- naesten ingenting`,
  ``,
  `PER MAPPE`,
  `  mappe             rader    spenn=0   snittspenn`,
  ...[...perMappe].map(
    ([m, e]) =>
      `  ${m.padEnd(14)} ${e.n.toString().padStart(8)} ${`${((100 * e.null) / Math.max(1, e.n)).toFixed(1)} %`.padStart(10)} ${(e.spenn / Math.max(1, e.n)).toFixed(3).padStart(12)}`,
  ),
  ``,
  `PER STIKK  (fordelingen avgjoer hvilken del av spillet nettet laerer)`,
  `  stikk    rader   andel   snittspenn   spenn=0`,
  ...[...perStikk]
    .sort((a, b) => a[0] - b[0])
    .map(
      ([st, e]) =>
        `  ${String(st).padStart(5)} ${e.n.toString().padStart(8)} ${`${((100 * e.n) / rader).toFixed(1)} %`.padStart(7)} ` +
        `${(e.spenn / e.n).toFixed(3).padStart(12)} ${`${((100 * e.null) / e.n).toFixed(1)} %`.padStart(9)}`,
    ),
  ``,
  `ANTALL LOVLIGE KORT`,
  ...[...perValg]
    .sort((a, b) => a[0] - b[0])
    .map(([k, n]) => `  ${String(k).padStart(2)} kort: ${n.toString().padStart(8)} (${((100 * n) / rader).toFixed(1)} %)`),
  ``,
];

const tekst = L.join("\n");
console.log(tekst);
mkdirSync(dirname(ut), { recursive: true });
writeFileSync(ut, tekst + "\n");
console.log(`Skrevet til ${ut}`);
