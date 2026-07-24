/**
 * EDA: regresjon over populasjonen → «genmodifisert» genom → tilbake i mengden.
 *
 *   node examples/neat-eda.ts trening-d3 trening-d3/gull.json ut.json
 *
 * Arvinds idé: lagre alle nevronene og fitnessverdiene, kjør regresjon, og
 * lag et genom som er dyttet i den retningen regresjonen peker – så settes
 * det inn i populasjonen og får konkurrere.
 *
 * HVORFOR DETTE ER GYLDIG SELV OM REGRESJONEN ER OBSERVASJONELL: jeg har
 * tidligere advart mot å tolke denne regresjonen kausalt – hvilke trekk et
 * genom har henger sammen med hvilken slekt det kommer fra, så en koeffisient
 * kan måle arv like gjerne som årsak. Men her brukes den ikke til å KONKLUDERE.
 * Den brukes til å GENERERE en kandidat, og cupen er testen: det modifiserte
 * genomet må vinne kamper som alle andre. Er regresjonen villedende, blir
 * kandidaten slått ut – det koster én plass i én generasjon. Det er
 * hypotesegenerering med innebygd falsifisering, og det er en helt annen
 * (og trygg) bruk av det samme tallet.
 *
 * Familien: dette er en enkel estimation-of-distribution-algoritme oppå NEAT –
 * i stedet for bare tilfeldig mutasjon lager vi mutanter der fordelingen av
 * trekk er skjøvet mot det populasjonen viser lønner seg.
 */

import { readFileSync, writeFileSync } from "node:fs";

import { lagRng } from "../src/kort.ts";
import {
  ANTALL_INN,
  genomFraJson,
  Innovasjonsbok,
  SENSORGRUPPER,
  utId,
  UT_KORT,
  UT_XT,
  type Genom,
} from "../src/neat/index.ts";

const dir = process.argv[2] ?? "trening-d3";
const genomFil = process.argv[3] ?? `${dir}/gull.json`;
const utFil = process.argv[4] ?? `${dir}/eda.json`;
const antallVarianter = Number(process.argv[5] ?? 4);

// --- Les analysedataene ------------------------------------------------------
interface Individ {
  readonly [felt: string]: number;
}
const rader: Individ[] = [];
for (const linje of readFileSync(`${dir}/analyse.jsonl`, "utf8").split("\n")) {
  if (linje.trim() === "") continue;
  try {
    const r = JSON.parse(linje) as { individer?: Individ[] };
    for (const i of r.individer ?? []) rader.push(i);
  } catch {
    /* halvskrevet siste linje mens treneren kjører */
  }
}
if (rader.length < 200) throw new Error(`For få rader i ${dir}/analyse.jsonl (${rader.length})`);

const TREKK = Object.keys(rader[0]!).filter((k) => k !== "fitness" && k !== "dybde" && k !== "regret");
const y = rader.map((r) => r.fitness ?? 0);

/** Standardiser: koeffisientene blir da sammenliknbare på tvers av skalaer. */
function standardiser(v: readonly number[]): { z: number[]; snitt: number; sd: number } {
  const snitt = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - snitt) ** 2, 0) / Math.max(1, v.length - 1)) || 1;
  return { z: v.map((x) => (x - snitt) / sd), snitt, sd };
}

const X = TREKK.map((t) => standardiser(rader.map((r) => r[t] ?? 0)));
const Y = standardiser(y);

// Multippel regresjon via normallikninger med ridge (trekkene er sterkt
// korrelerte – noder og koblinger følger hverandre – så uten ridge blir
// koeffisientene ustabile og meningsløse å styre etter).
const p = TREKK.length;
const XtX: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
const XtY = new Array<number>(p).fill(0);
for (let i = 0; i < rader.length; i++) {
  for (let a = 0; a < p; a++) {
    XtY[a]! += X[a]!.z[i]! * Y.z[i]!;
    for (let b = a; b < p; b++) XtX[a]![b]! += X[a]!.z[i]! * X[b]!.z[i]!;
  }
}
for (let a = 0; a < p; a++) {
  for (let b = 0; b < a; b++) XtX[a]![b] = XtX[b]![a]!;
  XtX[a]![a]! += rader.length * 0.05; // ridge
}
// Gauss-eliminasjon.
const M = XtX.map((rad, i) => [...rad, XtY[i]!]);
for (let k = 0; k < p; k++) {
  let piv = k;
  for (let i = k + 1; i < p; i++) if (Math.abs(M[i]![k]!) > Math.abs(M[piv]![k]!)) piv = i;
  [M[k], M[piv]] = [M[piv]!, M[k]!];
  const d = M[k]![k]!;
  if (Math.abs(d) < 1e-12) continue;
  for (let j = k; j <= p; j++) M[k]![j]! /= d;
  for (let i = 0; i < p; i++) {
    if (i === k) continue;
    const f = M[i]![k]!;
    for (let j = k; j <= p; j++) M[i]![j]! -= f * M[k]![j]!;
  }
}
const beta = M.map((rad) => rad[p]!);

const sortert = TREKK.map((t, i) => ({ trekk: t, b: beta[i]! })).sort((a, b) => Math.abs(b.b) - Math.abs(a.b));
console.log(`EDA over ${rader.length} individer fra ${dir}/analyse.jsonl\n`);
console.log("Standardiserte koeffisienter mot fitness (topp 10):");
for (const { trekk, b } of sortert.slice(0, 10)) {
  console.log(`  ${trekk.padEnd(18)} ${(b >= 0 ? "+" : "") + b.toFixed(4)}`);
}

// --- Bygg genmodifiserte varianter ------------------------------------------
// Koeffisientene oversettes til STRUKTURELLE grep. Bare trekk vi faktisk kan
// styre er med; resten (noder, aktivAndel …) er utfall, ikke rattet.
const styrbare: Record<string, [number, number] | null> = {
  fraHistorikk: SENSORGRUPPER.historikk as unknown as [number, number],
  fraRenons: SENSORGRUPPER.renons as unknown as [number, number],
  fraBossTelling: SENSORGRUPPER.bossTelling as unknown as [number, number],
  fraTaktikk: SENSORGRUPPER.taktikk as unknown as [number, number],
  fraLagspill: SENSORGRUPPER.lagspill as unknown as [number, number],
  fraBudhist: SENSORGRUPPER.budhistorikk as unknown as [number, number],
  fraLagstikk: SENSORGRUPPER.lagstikk as unknown as [number, number],
  fraTrumf: SENSORGRUPPER.trumfkontroll as unknown as [number, number],
};

const rå = JSON.parse(readFileSync(genomFil, "utf8")) as { genom?: unknown };
const basis = genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(genomFil, "utf8"));
const bok = new Innovasjonsbok(ANTALL_INN, basis.antallUt);
bok.hoppOver(basis);

const kortHoder = Array.from({ length: 52 }, (_, i) => utId(ANTALL_INN, UT_KORT + i));
const xtHode = utId(ANTALL_INN, UT_XT);
const varianter: Genom[] = [];
for (let v = 0; v < antallVarianter; v++) {
  const rng = lagRng((0xed_a0 + v * 7919) >>> 0);
  const g: Genom = JSON.parse(JSON.stringify(basis)) as Genom;
  const finnes = new Set(g.koblinger.map((k) => `${k.inn}>${k.ut}`));
  let lagt = 0;
  for (const [trekk, spenn] of Object.entries(styrbare)) {
    if (spenn === null) continue;
    const b = beta[TREKK.indexOf(trekk)] ?? 0;
    if (b <= 0.002) continue; // bare grupper regresjonen faktisk favoriserer
    // Antall nye koblinger skaleres med koeffisienten og variantnummeret, så
    // vi får en spredning av dristighet i stedet for én enkelt gjetning.
    const antall = Math.round(b * 400 * (0.5 + v));
    for (let n = 0; n < antall; n++) {
      const inn = spenn[0] + Math.floor(rng() * (spenn[1] - spenn[0]));
      const ut = rng() < 0.75 ? kortHoder[Math.floor(rng() * 52)]! : xtHode;
      if (finnes.has(`${inn}>${ut}`)) continue;
      g.koblinger.push({ inn, ut, vekt: (rng() * 2 - 1) * 0.25, aktiv: true, innovasjon: bok.kobling(inn, ut) });
      finnes.add(`${inn}>${ut}`);
      lagt++;
    }
  }
  varianter.push(g);
  console.log(`variant ${v}: +${lagt} koblinger (${g.koblinger.length} totalt)`);
}

writeFileSync(utFil, JSON.stringify(varianter));
console.log(
  `\nSkrev ${varianter.length} genmodifiserte varianter → ${utFil}\n` +
    `Sett dem i mengden med --fra-flere; cupen avgjør om regresjonen hadde rett.`,
);
