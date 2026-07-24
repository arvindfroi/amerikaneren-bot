/**
 * Blindsoner: hvilke sensorer BRUKER genomet egentlig?
 *
 *   node examples/d2-blindsoner.ts trening-d2/gull.json --kamper 40
 *
 * Metoden er PERMUTASJONS-ABLASJON, ikke regresjon. Regresjon over
 * populasjonen er observasjonell: hvilke sensorer et genom har koblet på
 * henger sammen med hvilken slekt det kommer fra, og en koeffisient kan
 * like gjerne måle arv som bruk. Her gripes det i stedet inn: én
 * sensorgruppe om gangen får verdiene sine fra en TILFELDIG ANNEN stilling.
 * Informasjonen ødelegges, men fordelingen beholdes – nettet ser fortsatt
 * plausible tall, bare feil tall. Faller styrken, brukte genomet sensoren.
 * Faller den ikke, er gruppen en blindsone: informasjonen ligger der,
 * gratis, og genomet ignorerer den.
 *
 * KONTROLL FOR KORTFLAKS – tre lag, samme som i de andre målingene:
 *  1. Duplikat: hver giver spilles fire ganger, agenten roterer gjennom
 *     alle setene, så god og dårlig hånd rammer alle armene likt.
 *  2. Parret: ALLE armene spiller nøyaktig de samme giverne. Differansen
 *     mellom to armer er dermed målt på identisk kortmateriale.
 *  3. SE regnes over GIVERE, ikke over kamper – de fire setene deler jo
 *     kortene og er ikke uavhengige. Tegntest ved siden av snittet, siden
 *     utbetalingsfordelingen har tunge haler (±50 ved amerikaner).
 *
 * To kontrollarmer holder metoden ærlig:
 *  - «hånd» skal koste mye. Gjør den ikke det, er verktøyet i stykker.
 *  - «ingen» (ablasjon av ingenting) skal koste 0 ± støy. Gjør den ikke
 *    det, lekker det tilfeldighet inn et sted den ikke skal.
 */

import { readFileSync } from "node:fs";

import { lagRng } from "../src/kort.ts";
import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { genomFraJson, NeatAgent, SENSORGRUPPER, type Beslutning, type Genom } from "../src/neat/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { grådigHandling } from "./graadig.ts";

const filer: string[] = [];
let kamper = 40;
let motstander: "grådig" | "nevro" = "nevro";
let reservoarKamper = 6;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--motstander") motstander = process.argv[++i] === "grådig" ? "grådig" : "nevro";
  else if (a === "--reservoar") reservoarKamper = Number(process.argv[++i]);
  else filer.push(a);
}
const genomFil = filer[0] ?? "trening-d2/gull.json";
const rå = JSON.parse(readFileSync(genomFil, "utf8")) as { genom?: unknown };
const genom: Genom = genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(genomFil, "utf8"));

/** Armene: én per sensorgruppe, pluss to kontroller. */
const ARMER: { navn: string; fra: number; til: number }[] = [
  { navn: "ingen (kontroll)", fra: -1, til: -1 },
  ...Object.entries(SENSORGRUPPER).map(([navn, [fra, til]]) => ({ navn, fra, til })),
];

// --- Reservoar: ekte inngangsvektorer å hente forstyrrede verdier fra ------
// Verdiene må komme fra SAMME beslutningstype, ellers bytter vi ikke bare
// informasjon men også kontekst (en SPILL-vektor i en BUD-stilling ville
// vært en helt annen forstyrrelse enn den vi vil måle).
const reservoar = new Map<Beslutning, number[][]>();
{
  const samler = new NeatAgent(genom, {
    læringsrate: 0,
    forstyrr: (inn, beslutning) => {
      let pool = reservoar.get(beslutning);
      if (pool === undefined) {
        pool = [];
        reservoar.set(beslutning, pool);
      }
      if (pool.length < 4000) pool.push(inn.slice());
      return inn;
    },
  });
  for (let k = 0; k < reservoarKamper; k++) {
    let s = opprettSpill({ antallSpillere: 4 }, 111_000 + k);
    let guard = 0;
    while (s.fase !== "FERDIG" && guard++ < 20_000) {
      if (s.fase === "RUNDE_SLUTT") {
        if (s.rundeNr + 1 >= 20) break;
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      s = utfør(s, samler.velgHandling(s)).state;
    }
  }
  console.log(
    `Reservoar: ${[...reservoar].map(([b, p]) => `${b} ${p.length}`).join(", ")} vektorer\n`,
  );
}

function kamp(arm: { fra: number; til: number }, frø: number, sete: number): number {
  const rng = lagRng((frø * 7919 + sete * 31 + arm.fra + 2) >>> 0);
  const agent = new NeatAgent(genom, {
    læringsrate: 0,
    forstyrr:
      arm.fra < 0
        ? undefined
        : (inn, beslutning) => {
            const pool = reservoar.get(beslutning);
            if (pool === undefined || pool.length === 0) return inn;
            const annen = pool[Math.floor(rng() * pool.length)]!;
            const ut = inn.slice();
            for (let i = arm.fra; i < arm.til; i++) ut[i] = annen[i]!;
            return ut;
          },
  });
  const motpart = new NevroAgent();
  agent.nyKamp();
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  let guard = 0;
  while (s.fase !== "FERDIG" && guard++ < 20_000) {
    if (s.fase === "RUNDE_SLUTT" && s.rundeNr + 1 >= 40) break;
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
    let h: Handling;
    if (s.fase === "RUNDE_SLUTT") h = { type: "NESTE" };
    else if (iTur === sete) h = agent.velgHandling(s);
    else h = motstander === "nevro" ? motpart.velgHandling(s) : grådigHandling(s as GameState);
    s = utfør(s, h).state;
  }
  const egne = s.totalPoeng[sete] ?? 0;
  return egne - (s.totalPoeng.reduce((a, b) => a + b, 0) - egne) / 3;
}

const perGiver: number[][] = ARMER.map(() => []);
const t0 = performance.now();
for (let f = 0; f < kamper; f++) {
  const frø = 990_000 + f;
  for (let i = 0; i < ARMER.length; i++) {
    let sum = 0;
    for (let sete = 0; sete < 4; sete++) sum += kamp(ARMER[i]!, frø, sete);
    perGiver[i]!.push(sum / 4);
  }
  if ((f + 1) % 5 === 0) console.log(`  ${f + 1}/${kamper} givere (${((performance.now() - t0) / 1000).toFixed(0)}s)`);
}

const snitt = (x: readonly number[]): number => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
const se = (x: readonly number[]): number => {
  const m = snitt(x);
  return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, x.length - 1) / Math.max(1, x.length));
};
const tegn = (d: readonly number[]): string => {
  const nz = d.filter((x) => x !== 0);
  return `${nz.filter((x) => x < 0).length}/${nz.length}`;
};

console.log(`\n=== Blindsoner: ${genomFil}, ${kamper} givere × 4 seter mot 3× ${motstander} ===`);
console.log(`Kostnad = hvor mye styrke som forsvinner når gruppen forstyrres. ~0 = ubrukt.\n`);
console.log("sensorgruppe".padEnd(20), "poeng/kamp".padStart(15), "kostnad".padStart(18), "verre i".padStart(9));
const basis = perGiver[0]!;
for (let i = 0; i < ARMER.length; i++) {
  const d = perGiver[i]!;
  const diff = d.map((v, j) => v - basis[j]!);
  console.log(
    ARMER[i]!.navn.padEnd(20),
    (snitt(d).toFixed(1) + " ± " + se(d).toFixed(1)).padStart(15),
    i === 0 ? "–".padStart(18) : ((snitt(diff) <= 0 ? "" : "+") + snitt(diff).toFixed(2) + " ± " + se(diff).toFixed(2)).padStart(18),
    i === 0 ? "".padStart(9) : tegn(diff).padStart(9),
  );
}
