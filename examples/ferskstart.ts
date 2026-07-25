/**
 * HVA SKJER OM VI STARTER KOBLINGENE HELT PAA NYTT?
 *
 *   node examples/ferskstart.ts --gen 60 --popp 48
 *
 * BAKGRUNNEN. Maalt paa orakelbenken velger alle trente NEAT-genom kort
 * daarligere enn uniformt tilfeldig (anger 1,069-1,146 mot gulvet 1,035),
 * mens et FERSKT utrent genom ligger paa 1,040 - bedre enn dem alle. Det
 * tyder paa at treningen har oedelagt noe, ikke bygget noe. Da er det verdt
 * aa vite hva et ferskt genom gjoer naar det faar riktig konfigurasjon.
 *
 * TRE ARMER, alle fra samme ferske startpopulasjon, alle maalt med samme
 * angerbenk, saa forskjellen er ren konfigurasjon:
 *
 *   A  bare seleksjon      - evolusjon uten laerer
 *   B  bare laerer         - solverfasit, INGEN evolusjon i det hele tatt
 *   C  begge deler         - det D8 kjoerer naa
 *
 * Spoersmaalet armene svarer paa er ikke «blir den bedre», men HVEM som gjoer
 * jobben. Er B like god som C, gjoer seleksjonen ingenting. Er A daarligere
 * enn utgangspunktet, gjoer seleksjonen aktiv skade - og det er i saa fall
 * forklaringen paa hele D-familiens historie.
 */

import { writeFileSync } from "node:fs";

import { lagRng } from "../src/kort.ts";
import { Evolusjon, genomTilJson, NeatAgent, type Genom } from "../src/neat/index.ts";
import { Innovasjonsbok, nyttGenom, STANDARD_RATER, dommenOverBarnet } from "../src/neat/genom.ts";
import { målSDRunder } from "../src/neat/anker.ts";
import { ANTALL_INN, ANTALL_UT } from "../src/neat/trekk.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { grådigHandling } from "./graadig.ts";
import { lesBenk } from "../src/neat/angerbenk.ts";
import { Nettverk } from "../src/neat/nett.ts";
import { UT_KORT } from "../src/neat/trekk.ts";

let generasjoner = 60;
let popp = 48;
let givere = 8;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--gen") generasjoner = Number(process.argv[++i]);
  else if (a === "--popp") popp = Number(process.argv[++i]);
  else if (a === "--givere") givere = Number(process.argv[++i]);
}

// ANGERBENKEN lastes via den etablerte leseren. Vektorvalget er lett aa faa
// bakvendt, og jeg har gjort det to ganger i dag: `t` er E1-vektoren (273),
// `nt` er NEAT-vektoren (318), og verdiene ligger i `v`. NEAT skal ha `nt`.
const benk = lesBenk("e1-frys", 2000, 1).filter((b) => b.nt !== undefined);
console.log(`angerbenk: ${benk.length} stillinger med NEAT-vektor`);

function anger(g: Genom): number {
  const nett = new Nettverk(g);
  let sum = 0;
  for (const b of benk) {
    const ut = nett.aktiver([...b.nt!]);
    let beste = -Infinity;
    let valgt = -1;
    for (const k of Object.keys(b.v)) {
      const o = ut[UT_KORT + Number(k)]!;
      if (o > beste) {
        beste = o;
        valgt = Number(k);
      }
    }
    const verdier = Object.values(b.v);
    sum += Math.max(...verdier) - (b.v[String(valgt)] ?? 0);
  }
  return sum / benk.length;
}

const nevro = new NevroAgent();
const motNevro = (s: Parameters<typeof grådigHandling>[0]): ReturnType<typeof grådigHandling> =>
  nevro.velgHandling(s);

/** Samme ferske startgenom i alle tre armer – ellers maaler vi startflaks. */
const bok = new Innovasjonsbok(ANTALL_INN, ANTALL_UT);
const startGenom = nyttGenom(ANTALL_INN, ANTALL_UT, bok, lagRng(20260725));
console.log(
  `ferskt startgenom: ${startGenom.koblinger.length} koblinger, anger ${anger(startGenom).toFixed(4)}`,
);
console.log(`gulv (tilfeldig lovlig kort) 1.0354   nevro 0.9431\n`);

interface Arm {
  navn: string;
  medLærer: boolean;
  medSeleksjon: boolean;
}
const armer: Arm[] = [
  { navn: "A bare seleksjon", medLærer: false, medSeleksjon: true },
  { navn: "B bare laerer", medLærer: true, medSeleksjon: false },
  { navn: "C begge", medLærer: true, medSeleksjon: true },
];

for (const arm of armer) {
  const fasitRng = lagRng(777);
  const teller = { treff: 0 };
  const fasit = arm.medLærer
    ? { sjanse: 0.15, rate: 0.05, verdener: 3, dybde: 3, nodeTak: 60_000, rng: fasitRng, teller }
    : undefined;

  const evo = new Evolusjon({
    // Minste lovlige populasjon er 8 (og delelig med 4). Uten seleksjon
    // brukes den minste, og bare genom 0 laeres opp - resten roeres ikke.
    populasjon: arm.medSeleksjon ? popp : 8,
    frø: 4242,
    startGenom,
    rater: { ...STANDARD_RATER, bevist: true },
  });

  const mål = (g: Genom, frø: number): number =>
    målSDRunder(
      () => new NeatAgent(g, { læringsrate: 0 }),
      grådigHandling,
      motNevro,
      nevro,
      givere,
      frø,
      1,
      fasit,
    ).diff;

  const spor: { gen: number; anger: number; best: number; median: number }[] = [];
  for (let g = 0; g < generasjoner; g++) {
    const frøBase = 3_000_000 + (g % 400) * 64;
    const fitness = arm.medSeleksjon
      ? evo.genomer.map((x) => mål(x, frøBase))
      : [mål(evo.genomer[0]!, frøBase), ...evo.genomer.slice(1).map(() => 0)];
    if (arm.medSeleksjon) {
      const snitt = fitness.reduce((a, b) => a + b, 0) / fitness.length;
      for (let i = 0; i < evo.genomer.length; i++) {
        dommenOverBarnet(evo.genomer[i]!, fitness[i]! - snitt);
      }
      evo.nesteGenerasjonMed(fitness);
    }
    if ((g + 1) % 10 === 0 || g === 0) {
      const beste = fitness.indexOf(Math.max(...fitness));
      // HELE populasjonens anger, ikke bare fitness-vinnerens. Det er her
      // svaret ligger: finnes det gode genom som seleksjonen lar gaa?
      const alle = evo.genomer.map(anger).sort((a, b) => a - b);
      spor.push({
        gen: g + 1,
        anger: anger(evo.genomer[beste]!),
        best: alle[0]!,
        median: alle[Math.floor(alle.length / 2)]!,
      });
    }
  }
  const siste = spor[spor.length - 1]!;
  console.log(
    `${arm.navn.padEnd(18)} fitnessvinner ${spor.map((p) => p.anger.toFixed(3)).join(" ")}` +
      `${String.fromCharCode(10)}${" ".repeat(18)} BESTE i pop   ${spor.map((p) => p.best.toFixed(3)).join(" ")}` +
      `${String.fromCharCode(10)}${" ".repeat(18)} median        ${spor.map((p) => p.median.toFixed(3)).join(" ")}` +
      `   (${teller.treff} fasittreff)`,
  );
  writeFileSync(
    `analyse/ferskstart-${arm.navn.split(" ")[0]}.json`,
    JSON.stringify({ arm: arm.navn, spor, fasittreff: teller.treff }, null, 2),
  );
  void siste;
}
