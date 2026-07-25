/**
 * KORRELERER ANGER MED GODT SPILL?
 *
 *   node examples/anger-mot-poeng.ts --antall 20 --givere 60
 *
 * D8 selekterer naa paa anger fordi anger er stoeyfri og poeng ikke er det.
 * Men et stoeyfritt tall er verdiloest om det maaler feil ting - det var
 * noeyaktig det som gjorde Elo-kurven i D7 til en artefakt. Foer anger faar
 * staa som kriterium maa den vises aa henge sammen med det vi faktisk vil ha.
 *
 * METODEN. Et utvalg genom spenner ut et bredt angerspenn. Hvert genom maales
 * paa BEGGE skalaene: anger paa holdout-halvdelen (deterministisk), og poeng
 * med SD-orakelet som budgiver over mange giver. Saa regnes Spearman.
 *
 * VIKTIG OM DEMPING. Poengmaalingen har en parret standardfeil paa ~3 ved 16
 * runder, og stoey i den ene variabelen DEMPER korrelasjonen mot null. Derfor
 * maales poeng to ganger paa ULIKE giversett: korrelasjonen mellom de to
 * halvdelene gir poengmaalingens egen paalitelighet, og med den kan den
 * observerte korrelasjonen dempingskorrigeres. Uten det ville en lav
 * korrelasjon vaere tvetydig - maaler anger feil, eller er poeng bare stoeyete?
 */

import { readFileSync, writeFileSync } from "node:fs";

import { Evolusjon, genomFraJson, NeatAgent, type Genom } from "../src/neat/index.ts";
import { STANDARD_RATER } from "../src/neat/genom.ts";
import { anger, gulv, lesAngerbenk, nevroAnger } from "../src/neat/angerfitness.ts";
import { målSDRunder } from "../src/neat/anker.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { grådigHandling } from "./graadig.ts";

let antall = 20;
let givere = 60;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--antall") antall = Number(process.argv[++i]);
  else if (a === "--givere") givere = Number(process.argv[++i]);
}

const benk = lesAngerbenk("e1-frys", 42000);
console.log(
  `holdout: ${benk.holdout.length} stillinger, gulv ${gulv(benk.holdout).toFixed(4)}, ` +
    `nevro ${nevroAnger(benk.holdout).toFixed(4)}`,
);

const les = (f: string): Genom => {
  const rå = JSON.parse(readFileSync(f, "utf8")) as { genom?: unknown };
  return genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(f, "utf8"));
};

// Bredt utvalg: ferske genom spenner mesteparten av spennet, og de trente
// legger til halen. Uten bredde blir korrelasjonen kunstig lav.
const kandidater: Genom[] = [];
const evo = new Evolusjon({ populasjon: 96, frø: 31337, rater: { ...STANDARD_RATER, bevist: true } });
for (const g of evo.genomer) kandidater.push(g);
for (const f of [
  "d7/fro-d5-gull.json",
  "d7/fro-d6-klar.json",
  "trening-d8b/mester.json",
  "trening-d8d/mester.json",
]) {
  try {
    kandidater.push(les(f));
  } catch {
    /* filen kan mangle */
  }
}
// Sorter paa anger og plukk jevnt utover spennet.
const medAnger = kandidater
  .map((g) => ({ g, a: anger(g, benk.holdout) }))
  .sort((x, y) => x.a - y.a);
const steg = Math.max(1, Math.floor(medAnger.length / antall));
const utvalg = medAnger.filter((_, i) => i % steg === 0).slice(0, antall);
console.log(
  `${utvalg.length} genom, angerspenn ${utvalg[0]!.a.toFixed(4)} - ` +
    `${utvalg[utvalg.length - 1]!.a.toFixed(4)}${String.fromCharCode(10)}`,
);

const nevro = new NevroAgent();
const motNevro = (s: Parameters<typeof grådigHandling>[0]): ReturnType<typeof grådigHandling> =>
  nevro.velgHandling(s);
const poeng = (g: Genom, frø: number, n: number): number =>
  målSDRunder(
    () => new NeatAgent(g, { læringsrate: 0 }),
    grådigHandling,
    motNevro,
    nevro,
    n,
    frø,
    1,
  ).diff;

function spearman(a: readonly number[], b: readonly number[]): number {
  const rang = (v: readonly number[]): number[] => {
    const idx = v.map((x, i) => ({ x, i })).sort((p, q) => p.x - q.x);
    const r = new Array<number>(v.length);
    idx.forEach((p, k) => (r[p.i] = k));
    return r;
  };
  const ra = rang(a);
  const rb = rang(b);
  let d2 = 0;
  for (let i = 0; i < a.length; i++) d2 += (ra[i]! - rb[i]!) ** 2;
  return 1 - (6 * d2) / (a.length * (a.length * a.length - 1));
}

const halv = Math.floor(givere / 2);
const rader = utvalg.map((k, i) => {
  // To UAVHENGIGE giversett, saa poengmaalingens egen paalitelighet kan maales.
  const p1 = poeng(k.g, 6_000_000, halv);
  const p2 = poeng(k.g, 6_500_000, halv);
  process.stdout.write(`\r  maaler ${i + 1}/${utvalg.length}   `);
  return { anger: k.a, p1, p2, poeng: (p1 + p2) / 2 };
});
console.log();

const angre = rader.map((r) => r.anger);
const rSplitt = spearman(rader.map((r) => r.p1), rader.map((r) => r.p2));
// Spearman-Brown: paalitelighet for SNITTET av de to halvdelene.
const pålitelighet = (2 * rSplitt) / (1 + rSplitt);
const rObs = spearman(angre, rader.map((r) => -r.poeng)); // -poeng: lav anger skal gi HOEY poeng
const rKorr = pålitelighet > 0 ? rObs / Math.sqrt(pålitelighet) : NaN;

console.log(`Poengmaalingens paalitelighet (${halv} givere x2):`);
console.log(`  splittkorrelasjon mellom de to settene   ${rSplitt.toFixed(3)}`);
console.log(`  paalitelighet for snittet (Spearman-Brown) ${pålitelighet.toFixed(3)}`);
console.log();
console.log(`KORRELASJON anger mot poeng (fortegn snudd, saa positivt = enige):`);
console.log(`  observert                ${rObs.toFixed(3)}`);
console.log(`  dempingskorrigert        ${rKorr.toFixed(3)}`);
console.log();
// REKKEFOELGEN ER VIKTIG. Foerste versjon testet `Math.abs(rKorr) < 0.3`
// foerst, og med NaN er den testen usann - da falt den til «henger sammen» og
// trykket en positiv konklusjon paa et resultat som ikke fantes. Paaliteligheten
// maa avgjoeres FOER korrelasjonen tolkes.
if (!(pålitelighet > 0.3)) {
  console.log(
    `POENGMAALINGEN KAN IKKE BRUKES SOM FASIT HER. Splittkorrelasjonen er ` +
      `${rSplitt.toFixed(3)}, altsaa paalitelighet ${pålitelighet.toFixed(3)}. ` +
      `Da sier korrelasjonen mot anger ingenting - hverken positivt eller negativt.`,
  );
} else if (Math.abs(rKorr) < 0.3) {
  console.log(
    `ANGER OG POENG HENGER IKKE SAMMEN (korrigert ${rKorr.toFixed(3)}). Aa selektere ` +
      `paa anger er da ikke bedre begrunnet enn Elo var - stoeyfritt, men feil akse.`,
  );
} else {
  console.log(
    `Anger og poeng henger sammen (korrigert ${rKorr.toFixed(3)}). Anger maaler samme ` +
      `underliggende ferdighet som poeng, bare uten giverstoeyen.`,
  );
}
writeFileSync(
  "analyse/anger-mot-poeng.json",
  JSON.stringify({ rader, rSplitt, pålitelighet, rObs, rKorr }, null, 2),
);
