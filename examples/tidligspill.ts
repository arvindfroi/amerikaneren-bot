/**
 * Er åpningsspillet virkelig svakt? Test ved å LÅNE SØK i et stikkvindu.
 *
 *   node examples/tidligspill.ts [--kamper 40] [--bot nevro|d1] [--verdener 12]
 *
 * Botene spiller som vanlig, men i de N første stikkene overtar et eksakt
 * søk (samme sampler + dobbelt-dummy som PIMC-boten). Løftet er prisen på
 * åpningsspillet – akkurat som fasedelingen målte prisen på trumfvalget.
 *
 * Hvorfor denne veien og ikke en fasit-måling: en fasit for stikk 0 krever
 * eksakt løsning av 12 stikk per verden. Målt her: ~30 sekunder CPU og over
 * en gigabyte på ÉN slik stilling. Orakelet vårt spiller derfor grådig fram
 * til de siste stikkene – og da vil en fasit-måling systematisk UNDERVURDERE
 * feil i åpningen, siden «beste kort» selv er regnet ut under grådig
 * fortsettelse. Et A/B med søk lider ikke av den skjevheten: her spilles
 * partiet faktisk ferdig, og poengene er poeng.
 */

import { lagRng } from "../src/kort.ts";
import { lovligeKort, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { solverBesteKort } from "../src/neat/hybrid.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { grådigHandling } from "./graadig.ts";

let kamper = 40;
let verdener = 12;
let dybde = 6;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--verdener") verdener = Number(process.argv[++i]);
  else if (a === "--dybde") dybde = Number(process.argv[++i]);
}

/** Vinduene som testes: hvilke stikk søket overtar. */
const VINDUER: { navn: string; fra: number; til: number }[] = [
  { navn: "ingen søk (basis)", fra: -1, til: -1 },
  { navn: "søk i stikk 0", fra: 0, til: 0 },
  { navn: "søk i stikk 0–1", fra: 0, til: 1 },
  { navn: "søk i stikk 0–2", fra: 0, til: 2 },
  { navn: "søk i stikk 6–11 (kontroll)", fra: 6, til: 11 },
  { navn: "søk i alle stikk", fra: 0, til: 11 },
];

function kamp(v: { fra: number; til: number }, frø: number, sete: number): number {
  const agent = new NevroAgent();
  const rng = lagRng((frø * 31 + sete) >>> 0);
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  let guard = 0;
  while (s.fase !== "FERDIG" && guard++ < 20_000) {
    if (s.fase === "RUNDE_SLUTT" && s.rundeNr + 1 >= 40) break;
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
    let h: Handling;
    if (s.fase === "RUNDE_SLUTT") h = { type: "NESTE" };
    else if (iTur === sete) {
      const iVindu = s.fase === "SPILL" && s.stikkSpilt >= v.fra && s.stikkSpilt <= v.til;
      if (iVindu && lovligeKort(s, sete).length >= 2) {
        const kort = solverBesteKort(s, sete, {
          verdener,
          // Dybden er stikk igjen, klippet – eksakt sluttspill, grådig fram dit.
          dybde: Math.min(dybde, s.giving.antallStikk - s.stikkSpilt),
          nodeTak: 400_000,
          rng,
        });
        h = kort !== null ? { type: "SPILL", spiller: sete, kort } : agent.velgHandling(s);
      } else h = agent.velgHandling(s);
    } else h = grådigHandling(s as GameState);
    s = utfør(s, h).state;
  }
  const egne = s.totalPoeng[sete] ?? 0;
  return egne - (s.totalPoeng.reduce((a, b) => a + b, 0) - egne) / 3;
}

const perGiver: number[][] = VINDUER.map(() => []);
const t0 = performance.now();
for (let f = 0; f < kamper; f++) {
  const frø = 960_000 + f;
  for (let i = 0; i < VINDUER.length; i++) {
    let sum = 0;
    for (let sete = 0; sete < 4; sete++) sum += kamp(VINDUER[i]!, frø, sete);
    perGiver[i]!.push(sum / 4);
  }
  console.log(`  ${f + 1}/${kamper} givere (${((performance.now() - t0) / 1000).toFixed(0)}s)`);
}

const snitt = (x: readonly number[]): number => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
const se = (x: readonly number[]): number => {
  const m = snitt(x);
  return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, x.length - 1) / Math.max(1, x.length));
};
const tegn = (d: readonly number[]): string => {
  const nz = d.filter((x) => x !== 0);
  return `${nz.filter((x) => x > 0).length}/${nz.length}`;
};

console.log(`\n=== NevroHjerne med lånt søk i et stikkvindu, ${kamper} givere × 4 seter mot 3× grådig ===\n`);
console.log("vindu".padEnd(30), "poeng/kamp".padStart(15), "løft".padStart(20), "tegntest".padStart(10));
for (let i = 0; i < VINDUER.length; i++) {
  const d = perGiver[i]!;
  const løft = i === 0 ? null : d.map((v, j) => v - perGiver[0]![j]!);
  console.log(
    VINDUER[i]!.navn.padEnd(30),
    (snitt(d).toFixed(1) + " ± " + se(d).toFixed(1)).padStart(15),
    løft === null ? "–".padStart(20) : ((snitt(løft) >= 0 ? "+" : "") + snitt(løft).toFixed(2) + " ± " + se(løft).toFixed(2)).padStart(20),
    løft === null ? "".padStart(10) : tegn(løft).padStart(10),
  );
}
