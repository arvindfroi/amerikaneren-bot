/**
 * Ærlig evaluering av NEAT-genomer: parret duplikatmåling med SE, på
 * VALGFRITT frøsett – slik at man kan skille «god på treningsbenken» fra
 * «god på ferske givere».
 *
 *   node examples/neat-evaluer.ts trening-c4/gull.json trening-d1/gull.json
 *   node examples/neat-evaluer.ts A.json B.json --froe 777000 --frofra 0 --frotil 8
 *   node examples/neat-evaluer.ts A.json --hybrid --terskel 5 --kamper 40
 *   node examples/neat-evaluer.ts A.json --motstander pimc --kamper 12
 *
 * | Flagg | Standard | Betydning |
 * |---|---|---|
 * | `--froe` | 900000 | frøbase. Treningsbenken bruker 777000 – bruk noe ANNET for å måle generalisering |
 * | `--kamper` | 40 | antall givere (hver giver spilles 4 ganger, én per sete) |
 * | `--frofra`/`--frotil` | – | shard: kjør bare giverne [fra, til) (for parallelle prosesser) |
 * | `--hybrid` | av | bruk HybridAgent (nett + eksakt sluttspill) i stedet for rent nett |
 * | `--terskel` | 5 | hybrid: stikk igjen når eksakt søk overtar |
 * | `--verdener` | 12 | hybrid: samplede verdener per sluttspillbeslutning |
 * | `--midt` | 0 | hybrid: antall kandidater nettet nominerer i midtspillet (0 = av) |
 * | `--laering` | 0.05 | lamarckisk xT-kalibrering underveis i kampen (0 = av) |
 * | `--motstander` | grådig | `grådig` eller `pimc` |
 * | `--ut` | – | JSONL-fil: én linje per (kandidat, giver) – varig logg, tåler avbrudd |
 *
 * Statistikken er parret: HVER giver spilles av ALLE kandidatene med samme
 * kort, så differansen mellom to kandidater måles på identisk materiale.
 * Uavhengighetsenheten er GIVEREN (ikke enkeltkampen – de fire setene deler
 * kortene), så SE regnes over givere. Det er den eneste ærlige SE-en her.
 */

import { appendFileSync, readFileSync } from "node:fs";

import { opprettSpill, utfør, velgHandling, type GameState, type Handling } from "../src/index.ts";
import { genomFraJson, HybridAgent, NeatAgent, type Genom } from "../src/neat/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { grådigHandling } from "./graadig.ts";

// --- Argumenter -------------------------------------------------------------
const filer: string[] = [];
let frøBase = 900_000;
let kamper = 40;
let frøFra: number | null = null;
let frøTil: number | null = null;
let hybrid = false;
let terskel = 5;
let verdener = 12;
let midt = 0;
let læringsrate = 0.05;
let motstander: "grådig" | "pimc" = "grådig";
let utFil: string | null = null;
/** Én oppsummeringslinje per kandidat – grunnlaget for E1-kurven på fremgangssiden. */
let sammendragFil: string | null = null;
let merke = "";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--frofra") frøFra = Number(process.argv[++i]);
  else if (a === "--frotil") frøTil = Number(process.argv[++i]);
  else if (a === "--hybrid") hybrid = true;
  else if (a === "--terskel") terskel = Number(process.argv[++i]);
  else if (a === "--verdener") verdener = Number(process.argv[++i]);
  else if (a === "--midt") midt = Number(process.argv[++i]);
  else if (a === "--laering") læringsrate = Number(process.argv[++i]);
  else if (a === "--motstander") motstander = process.argv[++i] === "pimc" ? "pimc" : "grådig";
  else if (a === "--ut") utFil = process.argv[++i] ?? null;
  else if (a === "--sammendrag") sammendragFil = process.argv[++i] ?? null;
  else if (a === "--merk") merke = process.argv[++i] ?? "";
  else filer.push(a);
}
if (filer.length === 0) {
  console.error("Bruk: node examples/neat-evaluer.ts <genom.json> [flere.json ...] [flagg]");
  process.exit(1);
}
const fra = frøFra ?? 0;
const til = frøTil ?? kamper;

/**
 * Innebygde referanser i stedet for en genomfil: «pimc», «nevro», og
 * «e1:<vektfil>» for et GPU-trent E1-nett.
 */
type Referanse = "pimc" | "nevro" | "e1";
interface Kandidat {
  readonly navn: string;
  readonly genom: Genom | null;
  readonly referanse: Referanse | null;
  /** Vektfil for e1-kandidater. */
  readonly fil?: string;
}
/** Godtar både et rent genom (mester.json) og gull-innpakningen {diff, gen, genom}. */
function lesGenom(fil: string): Genom {
  const tekst = readFileSync(fil, "utf8");
  const rå = JSON.parse(tekst) as { genom?: unknown };
  return genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : tekst);
}
const kandidater: Kandidat[] = filer.map((f) => {
  if (f === "pimc" || f === "nevro") return { navn: f, genom: null, referanse: f };
  if (f.startsWith("e1:")) return { navn: f, genom: null, referanse: "e1" as const, fil: f.slice(3) };
  return { navn: f, genom: lesGenom(f), referanse: null };
});

// Vektfilen er et par MB – les den én gang, ikke per kamp.
const e1Bufret = new Map<string, E1Agent>();
function e1Agent(fil: string): E1Agent {
  let a = e1Bufret.get(fil);
  if (a === undefined) {
    a = E1Agent.fraFil(fil);
    e1Bufret.set(fil, a);
  }
  return a;
}

/** Én hel kamp: kandidaten i `sete`, tre motstandere. Returnerer poengdifferansen. */
function kamp(k: Kandidat, frø: number, sete: number): number {
  const agent =
    k.referanse === "e1"
      ? e1Agent(k.fil!)
      : k.referanse === "nevro"
      ? new NevroAgent()
      : k.genom === null
        ? null
        : hybrid
          ? new HybridAgent(k.genom, { stikkTerskel: terskel, verdener, midtKandidater: midt, frø })
          : new NeatAgent(k.genom, { læringsrate });
  agent?.nyKamp();
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  let guard = 0;
  while (s.fase !== "FERDIG" && guard++ < 20000) {
    if (s.fase === "RUNDE_SLUTT" && s.rundeNr + 1 >= 40) break;
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
    let h: Handling;
    if (s.fase === "RUNDE_SLUTT") h = { type: "NESTE" };
    else if (iTur === sete)
      h =
        agent !== null
          ? agent.velgHandling(s)
          : // PIMC-referansen: samme innstilling som neat-pimc-referanse.ts bruker.
            velgHandling(s, { verdener: 12, terskel: 6, frø: (frø * 131 + sete * 17 + guard) >>> 0 });
    else if (motstander === "pimc")
      h = velgHandling(s, { verdener: 12, terskel: 6, frø: (frø * 131 + (iTur ?? 0) * 17 + guard) >>> 0 });
    else h = grådigHandling(s as GameState);
    s = utfør(s, h).state;
  }
  const egne = s.totalPoeng[sete] ?? 0;
  const andres = (s.totalPoeng.reduce((a, b) => a + b, 0) - egne) / 3;
  return egne - andres;
}

// --- Kjør: hver giver spilles av alle kandidatene (parret) ------------------
const perGiver: number[][] = kandidater.map(() => []);
const t0 = performance.now();
for (let f = fra; f < til; f++) {
  const frø = frøBase + f;
  for (let i = 0; i < kandidater.length; i++) {
    let sum = 0;
    for (let sete = 0; sete < 4; sete++) sum += kamp(kandidater[i]!, frø, sete);
    const snitt = sum / 4;
    perGiver[i]!.push(snitt);
    if (utFil !== null) {
      appendFileSync(utFil, JSON.stringify({ kandidat: kandidater[i]!.navn, frø, diff: snitt }) + "\n");
    }
  }
  const gjort = f - fra + 1;
  const brukt = (performance.now() - t0) / 1000;
  console.log(
    `giver ${gjort}/${til - fra} (frø ${frø}) – ${brukt.toFixed(0)}s brukt, ` +
      `~${((brukt / gjort) * (til - fra - gjort)).toFixed(0)}s igjen`,
  );
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
/** Tegntest: hvor mange givere favoriserer A over B? (tosidig p, normaltilnærming) */
function tegntest(d: readonly number[]): { plus: number; n: number; p: number } {
  const ikkeNull = d.filter((x) => x !== 0);
  const plus = ikkeNull.filter((x) => x > 0).length;
  const n = ikkeNull.length;
  if (n === 0) return { plus: 0, n: 0, p: 1 };
  const z = Math.abs(plus - n / 2) / (Math.sqrt(n) / 2);
  const p = 2 * (1 - 0.5 * (1 + erf(z / Math.SQRT2)));
  return { plus, n, p: Math.min(1, Math.max(0, p)) };
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

const oppsett =
  `${hybrid ? `hybrid(terskel ${terskel}, ${verdener} verdener${midt > 0 ? `, midt ${midt}` : ""})` : `rent nett (læring ${læringsrate})`}` +
  ` mot 3× ${motstander}, frø ${frøBase}+[${fra},${til})`;
console.log(`\n=== ${oppsett} ===`);
console.log(`${til - fra} givere × 4 seter = ${(til - fra) * 4} kamper per kandidat\n`);
for (let i = 0; i < kandidater.length; i++) {
  const d = perGiver[i]!;
  console.log(`${kandidater[i]!.navn}: ${snitt(d) >= 0 ? "+" : ""}${snitt(d).toFixed(2)} ± ${se(d).toFixed(2)} poeng/kamp`);
}
if (kandidater.length > 1) {
  console.log("\nParrede differanser (samme givere):");
  for (let i = 1; i < kandidater.length; i++) {
    const d = perGiver[i]!.map((v, j) => v - perGiver[0]![j]!);
    const t = tegntest(d);
    console.log(
      `  ${kandidater[i]!.navn} − ${kandidater[0]!.navn}: ` +
        `${snitt(d) >= 0 ? "+" : ""}${snitt(d).toFixed(2)} ± ${se(d).toFixed(2)}` +
        `  (tegntest ${t.plus}/${t.n}, p=${t.p.toFixed(3)})`,
    );
  }
}
// Ett sammendrag per kandidat til varig fil. Motstanderen skrives med, for
// tallene fra to ulike benker må aldri havne i samme kurve.
if (sammendragFil !== null) {
  // Er «nevro» med som kandidat, er den PARREDE differansen mot den det
  // interessante tallet – ikke kandidatens egen score mot benkemotstanderen.
  const nevroIdx = kandidater.findIndex((k) => k.referanse === "nevro");
  for (let i = 0; i < kandidater.length; i++) {
    const d = perGiver[i]!;
    const parret =
      nevroIdx >= 0 && nevroIdx !== i ? d.map((v, j) => v - perGiver[nevroIdx]![j]!) : null;
    appendFileSync(
      sammendragFil,
      JSON.stringify({
        tid: new Date().toISOString(),
        kandidat: kandidater[i]!.navn,
        mot: motstander,
        diff: Math.round(snitt(d) * 100) / 100,
        se: Math.round(se(d) * 100) / 100,
        ...(parret !== null
          ? {
              motNevro: Math.round(snitt(parret) * 100) / 100,
              motNevroSe: Math.round(se(parret) * 100) / 100,
              motNevroTegn: tegntest(parret).plus + "/" + tegntest(parret).n,
            }
          : {}),
        givere: d.length,
        hybrid,
        merke,
      }) + "\n",
    );
  }
  console.log(`Sammendrag lagt til ${sammendragFil}`);
}

console.log(`\nTid: ${((performance.now() - t0) / 1000).toFixed(0)}s`);
