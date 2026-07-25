/**
 * GODKJENNINGSPORTEN FOR SD-KORTFASITEN
 *
 *   node examples/moe2-port-spill.ts --givere 200
 *
 * BAKGRUNNEN. Kortfasiten er den eneste som er MÅLT MOTBEVIST: E1-r2 er 0,34
 * anger bedre enn NevroHjerne – 2,4 ganger hele gulv-til-tak-spennet – og
 * taper likevel 2,91 ± 0,06 poeng per kamp, tegntest 9 av 599. Per stikk
 * ligger E1s forsprang helt og holdent i stikk 5–9, der dobbelt-dummy løser
 * eksakt, mens den er dårligere enn nevro i stikk 1–4.
 *
 * Hypotesen som skal testes: orakelet er skarpt der det betyr minst. Tidlig i
 * runden er informasjonen tynn og solveren sampler verdener som ikke ligner
 * virkeligheten; sent er den nesten eksakt, men da er utfallet ofte avgjort.
 *
 * METODEN er den samme som ga budfasiten dom: bare ÉN ting varieres. Her er
 * det hvilke stikk kandidaten følger solveren i. Alt annet – bud, vrak,
 * trumfvalg og alle andre seter – er NevroHjerne. Poeng måles to ganger på
 * uavhengige giversett, så referansens pålitelighet er kjent før korrelasjonen
 * tolkes.
 *
 * Svaret bestemmer hvordan de tre spillekspertene skal trenes: er orakelet
 * bare verdt å følge sent, skal fasiten vektes deretter – eller sløyfes tidlig.
 */

import { writeFileSync } from "node:fs";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { besteKortSD } from "../src/moe2/sdkort.ts";
import { lagRng } from "../src/kort.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { prøvPorten } from "../src/moe2/port.ts";

let givere = 200;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--givere") givere = Number(process.argv[++i]);
}

const nevro = new NevroAgent();
const rng = lagRng(90210);

/** Hvilke stikk kandidaten følger solveren i. `null` = aldri. */
interface Vindu {
  readonly navn: string;
  readonly fra: number;
  readonly til: number;
}
const vinduer: Vindu[] = [
  { navn: "aldri (nevro)", fra: 99, til: 99 },
  { navn: "stikk 0-2", fra: 0, til: 2 },
  { navn: "stikk 3-5", fra: 3, til: 5 },
  { navn: "stikk 6-8", fra: 6, til: 8 },
  { navn: "stikk 9+", fra: 9, til: 99 },
  { navn: "stikk 0-5", fra: 0, til: 5 },
  { navn: "stikk 6+", fra: 6, til: 99 },
  { navn: "alltid", fra: 0, til: 99 },
];

function énRunde(v: Vindu, sete: number, frø: number): { poeng: number; orakelvalg: number } {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  let orakelvalg = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
    let h: Handling;
    if (iTur === sete && s.fase === "SPILL" && s.stikkSpilt >= v.fra && s.stikkSpilt <= v.til) {
      // SINGLE DUMMY: fire verdener forenlige med agentens egen informasjon,
      // og NevroHjerne spiller resten ut i alle seter. Ingen ser skjulte kort.
      const kort = besteKortSD(s, sete, nevro, { verdener: 4, rng });
      if (kort !== null) {
        orakelvalg++;
        h = { type: "SPILL", spiller: sete, kort };
      } else h = nevro.velgHandling(s);
    } else {
      h = nevro.velgHandling(s);
    }
    s = utfør(s, h).state;
  }
  const egne = s.totalPoeng[sete] ?? 0;
  const andre = (s.totalPoeng.reduce((a, b) => a + b, 0) - egne) / 3;
  return { poeng: egne - andre, orakelvalg };
}

interface Rad {
  navn: string;
  /** Hvor mange kortvalg som ble tatt av solveren – «dosen». */
  orakelvalg: number;
  poengA: number;
  poengB: number;
  poeng: number;
}

const halv = Math.floor(givere / 2);
const rader: Rad[] = [];
for (const v of vinduer) {
  let pa = 0;
  let pb = 0;
  let valg = 0;
  let n = 0;
  for (let f = 0; f < givere; f++) {
    const frø = (f < halv ? 8_100_000 : 8_600_000) + f;
    for (let sete = 0; sete < 4; sete++) {
      const r = énRunde(v, sete, frø);
      valg += r.orakelvalg;
      if (f < halv) pa += r.poeng;
      else pb += r.poeng;
      n++;
    }
  }
  const halvN = n / 2;
  rader.push({
    navn: v.navn,
    orakelvalg: valg / n,
    poengA: pa / halvN,
    poengB: pb / halvN,
    poeng: (pa + pb) / n,
  });
  process.stdout.write(`\r  ${rader.length}/${vinduer.length} maalt   `);
}
console.log();

const grunn = rader.find((r) => r.navn === "aldri (nevro)")!.poeng;
console.log(`\n=== Aa foelge SD-evalueringen i ulike stikk, ${givere} givere x 4 seter ===`);
console.log(`Alt annet er NevroHjerne. Baseline «aldri» = ${grunn.toFixed(2)} poeng/runde.\n`);
console.log(
  "vindu".padEnd(16) + "orakelvalg/runde".padStart(18) + "poeng/runde".padStart(13) +
    "mot baseline".padStart(14),
);
console.log("-".repeat(61));
for (const r of [...rader].sort((a, b) => b.poeng - a.poeng)) {
  const d = r.poeng - grunn;
  console.log(
    r.navn.padEnd(16) +
      r.orakelvalg.toFixed(2).padStart(18) +
      r.poeng.toFixed(2).padStart(13) +
      `${d >= 0 ? "+" : ""}${d.toFixed(2)}`.padStart(14),
  );
}

// PORTEN: hjelper det aa foelge orakelet MER? Fasiten er «antall orakelvalg»
// (mer = naermere fasiten), referansen er poeng. Samme retning.
const dom = prøvPorten({
  fasit: rader.map((r) => r.orakelvalg),
  referanseA: rader.map((r) => r.poengA),
  referanseB: rader.map((r) => r.poengB),
  sammeRetning: true,
});
console.log(`\n=== GODKJENNINGSPORTEN ===`);
console.log(`  paalitelighet ${dom.paalitelighet.toFixed(3)} (splitt ${dom.splitt.toFixed(3)})`);
console.log(`  observert ${dom.observert.toFixed(3)}, korrigert ${dom.korrigert.toFixed(3)}`);
console.log(`  DOM: ${dom.dom.toUpperCase()}`);
console.log(`  ${dom.begrunnelse}`);

writeFileSync("analyse/moe2-port-spill-sd.json", JSON.stringify({ givere, rader, dom }, null, 2));
console.log(`\nSkrev analyse/moe2-port-spill-sd.json`);
