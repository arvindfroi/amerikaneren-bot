/**
 * Parret poengrapport fra `examples/neat-evaluer.ts --ut`-loggene.
 *
 *   node examples/sd-parret-rapport.ts analyse/sd-r2-poeng-*.jsonl \
 *     --grunnlinje nevro --ut analyse/sd-r2-poeng.txt --json analyse/sd-r2-poeng.json \
 *     --sammendrag e1-maalinger.jsonl --merk "sd-r2 mot sd-r1 mot nevro"
 *
 * HVORFOR DEN FINNES. `neat-evaluer.ts` regner selv parrede differanser og
 * skriver sammendrag – men bare når hele målingen kjøres i ÉN prosess. 2000
 * givere × 6 kandidater tar ~37 minutter slik, mens maskinen har 16 ledige
 * kjerner. Sharding med `--frofra/--frotil` gir samme tall på en brøkdel av
 * tiden, men da ligger resultatet i N delfiler og ingen av dem kan bære
 * statistikken alene. Dette skriptet setter dem sammen.
 *
 * STATISTIKKEN.
 *
 * Uavhengighetsenheten er GIVEREN, ikke kampen: de fire setene i en giver
 * deler kortene, og `neat-evaluer.ts` har allerede snittet dem til ett tall
 * per (kandidat, giver). SE regnes derfor over givere.
 *
 * Differansene er PARRET: for hver giver trekkes grunnlinjens tall fra
 * kandidatens, og SE regnes på differansene. Det er hele poenget med å spille
 * de samme kortene – kortflaksen forsvinner ut av differansen, og SE faller
 * fra ~0,4 til ~0,03 på 2000 givere. En uparret sammenligning av to
 * kandidater med SE 0,03 hver ville ikke sett en forskjell på 0,1 poeng.
 *
 * Tegntesten står ved siden av fordi den ikke antar noe om halene: den teller
 * bare hvor mange givere som faller hver vei. Poengfordelingen i Amerikaneren
 * har ±50- og ±100-hendelser i seg, og et snitt med SE er sårbart for dem på
 * en måte en tellemetode ikke er. Er de to uenige, er det snittet som skal
 * mistros.
 *
 * KRAVET SOM KODEN HÅNDHEVER: en kandidat måles bare på givere DER ALLE
 * kandidatene har et tall. Ellers ville en shard som stoppet halvveis gitt én
 * kandidat et lettere giversett enn de andre, og differansen hadde målt
 * utvalget i stedet for spillestyrken.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

interface Giverlinje {
  readonly kandidat: string;
  readonly frø: number;
  readonly diff: number;
}

const filer: string[] = [];
let grunnlinje = "nevro";
let utSti: string | null = null;
let jsonSti: string | null = null;
let sammendragSti: string | null = null;
let merke = "";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--grunnlinje") grunnlinje = process.argv[++i] ?? grunnlinje;
  else if (a === "--ut") utSti = process.argv[++i] ?? null;
  else if (a === "--json") jsonSti = process.argv[++i] ?? null;
  else if (a === "--sammendrag") sammendragSti = process.argv[++i] ?? null;
  else if (a === "--merk") merke = process.argv[++i] ?? "";
  else filer.push(a);
}
if (filer.length === 0) {
  console.error("Bruk: node examples/sd-parret-rapport.ts <pergiver.jsonl> [flere ...] [flagg]");
  process.exit(1);
}

// --- Les inn ----------------------------------------------------------------
// Kart: kandidat → (frø → diff). Duplikater overskrives, ikke summeres: to
// shard-filer kan overlappe hvis en kjøring ble startet på nytt, og da er den
// samme (kandidat, frø) det SAMME deterministiske tallet – ikke to
// observasjoner.
const perKandidat = new Map<string, Map<number, number>>();
let lest = 0;
for (const fil of filer) {
  for (const linje of readFileSync(fil, "utf8").split("\n")) {
    if (linje.trim() === "") continue;
    let r: Giverlinje;
    try {
      r = JSON.parse(linje) as Giverlinje;
    } catch {
      continue; // siste linje kan være halvskrevet mens en shard kjører
    }
    if (typeof r.kandidat !== "string" || typeof r.frø !== "number" || typeof r.diff !== "number") continue;
    let m = perKandidat.get(r.kandidat);
    if (m === undefined) {
      m = new Map<number, number>();
      perKandidat.set(r.kandidat, m);
    }
    m.set(r.frø, r.diff);
    lest++;
  }
}
const navn = [...perKandidat.keys()];
if (navn.length === 0) {
  console.error("Ingen gyldige linjer funnet.");
  process.exit(1);
}

// Felles givere: snittet av frøene der ALLE kandidatene har et tall.
let felles: number[] = [...perKandidat.get(navn[0]!)!.keys()];
for (const n of navn.slice(1)) {
  const m = perKandidat.get(n)!;
  felles = felles.filter((f) => m.has(f));
}
felles.sort((a, b) => a - b);
if (felles.length < 2) {
  console.error(`Bare ${felles.length} felles givere – for lite til statistikk.`);
  process.exit(1);
}

// --- Statistikk -------------------------------------------------------------
function snitt(x: readonly number[]): number {
  return x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
}
/** SE over givere – uavhengighetsenheten. */
function se(x: readonly number[]): number {
  if (x.length < 2) return NaN;
  const m = snitt(x);
  return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1) / x.length);
}
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
/** Tegntest: hvor mange givere favoriserer A over B? (tosidig p, normaltilnærming) */
function tegntest(d: readonly number[]): { plus: number; n: number; p: number } {
  const ikkeNull = d.filter((x) => x !== 0);
  const plus = ikkeNull.filter((x) => x > 0).length;
  const n = ikkeNull.length;
  if (n === 0) return { plus: 0, n: 0, p: 1 };
  const z = Math.abs(plus - n / 2) / (Math.sqrt(n) / 2);
  return { plus, n, p: Math.min(1, Math.max(0, 2 * (1 - 0.5 * (1 + erf(z / Math.SQRT2))))) };
}

const serie = new Map<string, number[]>();
for (const n of navn) {
  const m = perKandidat.get(n)!;
  serie.set(
    n,
    felles.map((f) => m.get(f)!),
  );
}

interface Par {
  readonly a: string;
  readonly b: string;
  readonly diff: number;
  readonly se: number;
  readonly tegn: string;
  readonly p: number;
  readonly sigma: number;
}
const grunn = serie.get(grunnlinje);
const par: Par[] = [];
for (const n of navn) {
  if (n === grunnlinje || grunn === undefined) continue;
  const d = serie.get(n)!.map((v, i) => v - grunn[i]!);
  const t = tegntest(d);
  const s = se(d);
  par.push({
    a: n,
    b: grunnlinje,
    diff: snitt(d),
    se: s,
    tegn: `${t.plus}/${t.n}`,
    p: t.p,
    sigma: s > 0 ? snitt(d) / s : NaN,
  });
}
// Alle kandidatpar innbyrdes – det er slik sd-r2 måles mot sd-r1, ikke bare
// mot grunnlinjen.
const innbyrdes: Par[] = [];
for (let i = 0; i < navn.length; i++) {
  for (let j = 0; j < navn.length; j++) {
    if (i >= j) continue;
    const d = serie.get(navn[j]!)!.map((v, k) => v - serie.get(navn[i]!)![k]!);
    const t = tegntest(d);
    const s = se(d);
    innbyrdes.push({
      a: navn[j]!,
      b: navn[i]!,
      diff: snitt(d),
      se: s,
      tegn: `${t.plus}/${t.n}`,
      p: t.p,
      sigma: s > 0 ? snitt(d) / s : NaN,
    });
  }
}

// --- Utskrift ---------------------------------------------------------------
function fmt(x: number, d = 4): string {
  return (x >= 0 ? "+" : "") + x.toFixed(d);
}
const rader: string[] = [];
rader.push("PARRET POENGRAPPORT");
rader.push("===================");
rader.push(`Kilder: ${filer.join(", ")}`);
rader.push(`Leste ${lest} linjer, ${navn.length} kandidater, ${felles.length} FELLES givere`);
rader.push(`Frøbånd: ${felles[0]}–${felles[felles.length - 1]}`);
if (merke !== "") rader.push(`Merke: ${merke}`);
rader.push("");
rader.push("Rå score mot benkemotstanderen (poeng/kamp, snitt over de 4 setene):");
for (const n of navn) {
  const d = serie.get(n)!;
  rader.push(`  ${n.padEnd(32)} ${fmt(snitt(d), 3)} ± ${se(d).toFixed(3)}`);
}
if (grunn !== undefined) {
  rader.push("");
  rader.push(`Parret mot ${grunnlinje} (samme givere):`);
  for (const q of par) {
    rader.push(
      `  ${q.a.padEnd(32)} ${fmt(q.diff)} ± ${q.se.toFixed(4)}   ` +
        `${q.sigma.toFixed(1)} SE   tegntest ${q.tegn}   p=${q.p < 1e-6 ? "<1e-6" : q.p.toFixed(4)}`,
    );
  }
}
rader.push("");
rader.push("Alle par innbyrdes (B − A, positivt = B best):");
for (const q of innbyrdes) {
  rader.push(
    `  ${q.a.padEnd(28)} − ${q.b.padEnd(28)} ${fmt(q.diff)} ± ${q.se.toFixed(4)}   ` +
      `tegntest ${q.tegn}   p=${q.p < 1e-6 ? "<1e-6" : q.p.toFixed(4)}`,
  );
}
const tekst = rader.join("\n") + "\n";
console.log(tekst);
if (utSti !== null) {
  mkdirSync(dirname(utSti), { recursive: true });
  writeFileSync(utSti, tekst, "utf8");
  console.log(`Skrev ${utSti}`);
}
if (jsonSti !== null) {
  mkdirSync(dirname(jsonSti), { recursive: true });
  writeFileSync(
    jsonSti,
    JSON.stringify(
      {
        tid: new Date().toISOString(),
        merke,
        kilder: filer,
        givere: felles.length,
        frøFra: felles[0],
        frøTil: felles[felles.length - 1],
        grunnlinje,
        raa: navn.map((n) => ({ kandidat: n, diff: snitt(serie.get(n)!), se: se(serie.get(n)!) })),
        motGrunnlinje: par,
        innbyrdes,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`Skrev ${jsonSti}`);
}
// Samme format som `neat-evaluer.ts --sammendrag` skriver, så e1-maalinger.jsonl
// forblir én tidsserie med én konvensjon.
if (sammendragSti !== null) {
  for (const n of navn) {
    const d = serie.get(n)!;
    const p = par.find((q) => q.a === n);
    appendFileSync(
      sammendragSti,
      JSON.stringify({
        tid: new Date().toISOString(),
        kandidat: n,
        mot: "grådig",
        diff: Math.round(snitt(d) * 100) / 100,
        se: Math.round(se(d) * 100) / 100,
        ...(p !== undefined
          ? {
              motNevro: Math.round(p.diff * 1000) / 1000,
              motNevroSe: Math.round(p.se * 1000) / 1000,
              motNevroTegn: p.tegn,
            }
          : {}),
        givere: d.length,
        hybrid: false,
        merke,
      }) + "\n",
    );
  }
  console.log(`Sammendrag lagt til ${sammendragSti}`);
}
