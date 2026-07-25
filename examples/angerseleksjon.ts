/**
 * HOLDER «BESTE I POPULASJONEN» PAA FERSKE STILLINGER?
 *
 *   node examples/angerseleksjon.ts --popp 48
 *
 * Ferskstart-forsoeket viste at den beste av 48 ferske genom har anger
 * 0,87-0,94 - bedre enn NevroHjernes 0,9431 - mens poengfitnessen plukker
 * omtrent tilfeldig blant dem. Det ser ut som en ren konfigurasjonsfeil: raa-
 * materialet finnes, kriteriet ser det ikke.
 *
 * MEN aa ta minimum av 48 maalinger paa ÉN benk overvurderer systematisk,
 * ogsaa naar hver enkelt maaling er stoeyfri. Genomet kan passe akkurat de
 * stillingene. Derfor deles benken i to: valget gjoeres paa HALVDEL A, og
 * tallet rapporteres paa HALVDEL B, som genomet ikke ble valgt paa.
 *
 * Er B-tallet like godt, er funnet ekte og anger duger som seleksjonskriterium.
 * Spretter det tilbake mot gulvet, var «beste i pop» en illusjon - og da er
 * det verdt like mye som Elo-kurven i D7.
 */

import { writeFileSync } from "node:fs";

import { lagRng } from "../src/kort.ts";
import { Evolusjon, type Genom } from "../src/neat/index.ts";
import { STANDARD_RATER } from "../src/neat/genom.ts";
import { lesBenk } from "../src/neat/angerbenk.ts";
import { Nettverk } from "../src/neat/nett.ts";
import { UT_KORT } from "../src/neat/trekk.ts";
import { forover } from "../src/nevro/nett.ts";
import { nevroHjerne } from "../src/nevro/index.ts";

let popp = 48;
let runder = 8;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--popp") popp = Number(process.argv[++i]);
  else if (a === "--runder") runder = Number(process.argv[++i]);
}

const alle = lesBenk("e1-frys", 4000, 1).filter((b) => b.nt !== undefined);
// Annenhver stilling, ikke foerste/siste halvdel: benken er sortert paa stikk,
// saa et rett snitt ville gitt to halvdeler med ulik vanskegrad.
const halvA = alle.filter((_, i) => i % 2 === 0);
const halvB = alle.filter((_, i) => i % 2 === 1);
console.log(`benk: ${halvA.length} stillinger i A (valg), ${halvB.length} i B (rapport)`);

function anger(g: Genom, sett: typeof alle): number {
  const nett = new Nettverk(g);
  let sum = 0;
  for (const b of sett) {
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
    sum += Math.max(...Object.values(b.v)) - (b.v[String(valgt)] ?? 0);
  }
  return sum / sett.length;
}

/**
 * NEVRO OG GULVET MAA MAALES PAA DE SAMME HALVDELENE.
 *
 * Benken er IKKE homogen: nevro maaler 0,9431 paa de foerste 2000
 * stillingene, 0,8848 paa annenhver og 0,8615 over 4000. Aa sammenligne et
 * genom maalt paa halvdel B med et nevrotall fra et annet utvalg er samme
 * feil som gjorde D7-kurven verdiloes - riktig tall, feil akse.
 */
const hjerne = nevroHjerne();
function nevroAnger(sett: typeof alle): number {
  let sum = 0;
  for (const b of sett) {
    // Nevros spillnett tar de 238 foerste trekkene i E1-vektoren `t`.
    const logits = forover(hjerne.spill, Float32Array.from(b.t.slice(0, 238)));
    const lovlige = Object.keys(b.v).map(Number);
    let beste = lovlige[0]!;
    for (const k of lovlige) if (logits[k]! > logits[beste]!) beste = k;
    sum += Math.max(...Object.values(b.v)) - (b.v[String(beste)] ?? 0);
  }
  return sum / sett.length;
}
/** Eksakt forventning ved uniformt lovlig valg – gulvet, per halvdel. */
function gulv(sett: typeof alle): number {
  let sum = 0;
  for (const b of sett) {
    const v = Object.values(b.v);
    sum += Math.max(...v) - v.reduce((x, y) => x + y, 0) / v.length;
  }
  return sum / sett.length;
}
const nevroA = nevroAnger(halvA);
const nevroB = nevroAnger(halvB);
console.log(`gulv:  A ${gulv(halvA).toFixed(4)}   B ${gulv(halvB).toFixed(4)}`);
console.log(`nevro: A ${nevroA.toFixed(4)}   B ${nevroB.toFixed(4)}${String.fromCharCode(10)}`);
console.log(
  "runde".padStart(6) + "valgt paa A".padStart(14) + "samme genom paa B".padStart(20) +
    "median A".padStart(11) + "median B".padStart(11),
);
console.log("-".repeat(62));

const rader: { runde: number; a: number; b: number; medA: number; medB: number }[] = [];
for (let r = 0; r < runder; r++) {
  // Fersk populasjon hver runde: uavhengige trekninger, ikke én evolusjon.
  const evo = new Evolusjon({
    populasjon: popp,
    frø: 90_000 + r * 137,
    rater: { ...STANDARD_RATER, bevist: true },
  });
  const påA = evo.genomer.map((g) => anger(g, halvA));
  const vinner = påA.indexOf(Math.min(...påA));
  const påB = evo.genomer.map((g) => anger(g, halvB));
  const sortA = [...påA].sort((x, y) => x - y);
  const sortB = [...påB].sort((x, y) => x - y);
  const rad = {
    runde: r + 1,
    a: påA[vinner]!,
    b: påB[vinner]!,
    medA: sortA[Math.floor(sortA.length / 2)]!,
    medB: sortB[Math.floor(sortB.length / 2)]!,
  };
  rader.push(rad);
  console.log(
    String(rad.runde).padStart(6) +
      rad.a.toFixed(4).padStart(14) +
      rad.b.toFixed(4).padStart(20) +
      rad.medA.toFixed(4).padStart(11) +
      rad.medB.toFixed(4).padStart(11),
  );
}

const sn = (x: number[]): number => x.reduce((a, b) => a + b, 0) / x.length;
const a = sn(rader.map((r) => r.a));
const b = sn(rader.map((r) => r.b));
const medB = sn(rader.map((r) => r.medB));
console.log("-".repeat(62));
console.log(`snitt`.padStart(6) + a.toFixed(4).padStart(14) + b.toFixed(4).padStart(20));
console.log(
  `${String.fromCharCode(10)}Optimismen ved aa velge paa A: ${(b - a).toFixed(4)} anger.`,
);
console.log(
  `Paa ferske stillinger (B) er den valgte ${(medB - b).toFixed(4)} bedre enn medianen ` +
    `- det er den EKTE gevinsten ved aa selektere paa anger.`,
);
console.log(
  b < nevroB
    ? `Den valgte SLAAR NevroHjerne paa halvdel B (${b.toFixed(4)} mot ${nevroB.toFixed(4)}).`
    : `Den valgte slaar IKKE NevroHjerne paa halvdel B (${b.toFixed(4)} mot ${nevroB.toFixed(4)}).`,
);
writeFileSync("analyse/angerseleksjon.json", JSON.stringify({ rader, snittA: a, snittB: b }, null, 2));
