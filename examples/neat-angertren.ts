/**
 * Anger-trening av en hel populasjon: avmetning + fasit per beslutning.
 *
 *   node examples/neat-angertren.ts trening-d5/start.json trening-d6/start.json
 *
 * Dette er de to tingene som MÅLT gjør et NEAT-genom lærbart, og de må
 * begge være på plass:
 *
 *  1. AVMETNING. Utgangshodene står i metning (kortutganger 0,93–1,00), og
 *     delta-regelen ganger feilen med tanh-deriverte (1 − ut²) ≈ 0. Uten
 *     dette flytter 200 kalibreringer én av 593 koblinger. Vektene inn til
 *     utgangsnodene skaleres derfor ned først.
 *  2. FASIT PER BESLUTNING. «Klarte kontrakten» sier ikke hvilket kort som
 *     var feil – samme kredittilordningsproblem som kampfitness, bare på
 *     rundenivå. Orakelet gir forventet egenpoeng for HVERT lovlig kort, og
 *     det er det signalet som fester.
 *
 * MOT OVERTILPASNING: settet deles i trening og validering, og vi stopper
 * når valideringsangeren slutter å bli bedre (tålmodighet `--taal`). Målt
 * flater hold-out-kurven ut etter ~3 epoker mens treningssettet fortsetter
 * ned – uten stopp ville vi bare lært treningsdataene utenat.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { genomFraJson, klonGenom, utId, type Genom } from "../src/neat/index.ts";
import { Nettverk } from "../src/neat/nett.ts";
import { lesBenk, scoreBenk, type Benkstilling } from "../src/neat/angerbenk.ts";
import { UT_KORT } from "../src/neat/trekk.ts";

const innFil = process.argv[2] ?? "trening-d5/start.json";
const utFil = process.argv[3] ?? "trening-d6/start.json";
const arg = (navn: string, std: number): number =>
  process.argv.includes(navn) ? Number(process.argv[process.argv.indexOf(navn) + 1]) : std;
const mappe = process.argv.includes("--mappe") ? process.argv[process.argv.indexOf("--mappe") + 1]! : "e1-data3";
const maksEpoker = arg("--epoker", 12);
const tålmod = arg("--taal", 2);
const rate = arg("--rate", 0.05);
const skalering = arg("--skalering", 0.05);
const maksGenomer = arg("--genomer", 40);

const alle: Benkstilling[] = lesBenk(mappe, 20_000, 1).filter((b) => b.nt !== undefined);
if (alle.length < 400) throw new Error(`For lite data i ${mappe}: ${alle.length} stillinger med NEAT-vektor`);
const del = Math.floor(alle.length * 0.7);
const tren = alle.slice(0, del);
const val = alle.slice(del);
console.log(`Angerbenk: ${tren.length} trening + ${val.length} validering (disjunkte)\n`);

/** Orakelets beste kort per stilling – regnes én gang. */
const fasit = tren.map((b) => {
  const lov = Object.keys(b.v).map(Number);
  let best = lov[0]!;
  for (const k of lov) if (b.v[String(k)]! > b.v[String(best)]!) best = k;
  return best;
});

function score(g: Genom, sett: readonly Benkstilling[]): { anger: number; optimalt: number } {
  const n = new Nettverk(g);
  return scoreBenk(
    sett,
    (t, lovlige) => {
      const u = n.aktiver([...t]);
      let b = lovlige[0]!;
      for (const k of lovlige) if (u[UT_KORT + k]! > u[UT_KORT + b]!) b = k;
      return b;
    },
    "neat",
  );
}

/**
 * Avmetter BARE korthodet – ikke bud-, trumf- eller marginhodene.
 *
 * MÅLT FEIL (og hvorfor dette er viktig): første versjon skalerte ALLE
 * utgangshodene. Resultatet var 23 % lavere anger (bedre kortvalg) og
 * −85,4 ± 4,8 poeng/kamp i spill (tegntest 1/50). Forklaringen er at
 * skaleringen endrer bud-, trumf- og vrakhodene også, men bare korthodet
 * får trening til å kompensere. Nettet ender med gode kortvalg og ødelagt
 * budgivning – nøyaktig samme mønster som det døde xT-hodet.
 *
 * Regelen som følger: rør kun de hodene du faktisk trener.
 */
function avmett(g: Genom, s: number): Genom {
  const ut = klonGenom(g);
  const kortIder = new Set(Array.from({ length: 52 }, (_, i) => utId(g.antallInn, UT_KORT + i)));
  for (const k of ut.koblinger) if (kortIder.has(k.ut)) k.vekt *= s;
  return ut;
}

/** Trener ett genom med tidlig stopp på valideringssettet. */
function tren1(start: Genom): { genom: Genom; før: number; etter: number; epoker: number } {
  const g = avmett(start, skalering);
  const før = score(g, val).anger;
  let beste = klonGenom(g);
  let besteAnger = før;
  let siden = 0;
  const nett = new Nettverk(g);
  for (let e = 0; e < maksEpoker; e++) {
    for (let i = 0; i < tren.length; i++) {
      nett.aktiver([...tren[i]!.nt!]);
      nett.kalibrerUtgang(UT_KORT + fasit[i]!, 0.9, rate, 2);
    }
    const v = score(g, val).anger;
    if (v < besteAnger - 1e-4) {
      besteAnger = v;
      beste = klonGenom(g);
      siden = 0;
    } else if (++siden >= tålmod) break;
  }
  return { genom: beste, før, etter: besteAnger, epoker: maksEpoker };
}

const populasjon = JSON.parse(readFileSync(innFil, "utf8")) as Genom[];
const liste = Array.isArray(populasjon) ? populasjon : [populasjon];
console.log(`${innFil}: ${liste.length} genomer, trener de ${Math.min(maksGenomer, liste.length)} første\n`);

const ut: Genom[] = [];
let sumFør = 0;
let sumEtter = 0;
for (let i = 0; i < liste.length; i++) {
  if (i >= maksGenomer) {
    // Resten tas med UAVMETTET: populasjonen skal beholde mangfoldet sitt,
    // og et avmettet genom uten trening er bare et svakere genom.
    ut.push(liste[i]!);
    continue;
  }
  const r = tren1(liste[i]!);
  ut.push(r.genom);
  sumFør += r.før;
  sumEtter += r.etter;
  if ((i + 1) % 10 === 0 || i === 0) {
    console.log(`  genom ${i + 1}: val-anger ${r.før.toFixed(4)} → ${r.etter.toFixed(4)}`);
  }
}

const n = Math.min(maksGenomer, liste.length);
console.log(
  `\nSnitt val-anger: ${(sumFør / n).toFixed(4)} → ${(sumEtter / n).toFixed(4)} ` +
    `(${(100 * (1 - sumEtter / sumFør)).toFixed(1)} % lavere)`,
);
mkdirSync(dirname(utFil), { recursive: true });
writeFileSync(utFil, JSON.stringify(ut));
console.log(`Skrev ${ut.length} genomer → ${utFil}`);
