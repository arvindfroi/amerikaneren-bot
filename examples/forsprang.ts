/**
 * HVA VET D5 SOM NEVROHJERNE IKKE VET?
 *
 *   node examples/forsprang.ts d7/fro-d5.json --benk e1-frys --antall 3000
 *
 * Arvind: «undersøk hva som aktiverte mer enn normalt når d5&6 sa seg enig
 * med orakel men nevro gjorde ikke. her kan vi muligens angripe et hull.»
 *
 * Bakgrunnen er målt: D5 treffer dobbel-dummy-optimum i 36,7 % av valgene
 * mot NevroHjernes 30,4 %. Kortspillet vårt er altså allerede bedre enn
 * benken – men vi vet ikke HVA det er bedre på. Stillingene der D5 har rett
 * og nevro tar feil er der forspranget bor.
 *
 * METODEN er enkel med vilje: for hver sensor og hver skjult node
 * sammenlignes snittaktiveringen i FORSPRANGS-stillingene mot snittet over
 * alle vurderte stillinger. Sensorer som fyrer systematisk sterkere der vi
 * vinner, er de som bærer forspranget.
 *
 * Kontrollen som gjør tallet lesbart: vi måler også SPEILET – stillinger der
 * nevro har rett og D5 tar feil. En sensor som er høy i BEGGE er bare en
 * sensor som er høy i vanskelige stillinger, ikke et forsprang. Differansen
 * mellom de to er signalet.
 */

import { readFileSync, writeFileSync } from "node:fs";

import { genomFraJson } from "../src/neat/index.ts";
import { forover, nevroHjerne } from "../src/nevro/nett.ts";
import { Nettverk } from "../src/neat/nett.ts";
import { lesBenk } from "../src/neat/angerbenk.ts";
import { ANTALL_INN, UT_KORT } from "../src/neat/trekk.ts";

let genomFil = "d7/fro-d5.json";
let benk = "e1-frys";
let antall = 3000;
let ut = "d7/forsprang.json";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--benk") benk = process.argv[++i]!;
  else if (a === "--antall") antall = Number(process.argv[++i]);
  else if (a === "--ut") ut = process.argv[++i]!;
  else if (!a.startsWith("--")) genomFil = a;
}

const rå = JSON.parse(readFileSync(genomFil, "utf8")) as { genom?: unknown };
const g = genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(genomFil, "utf8"));
const nett = new Nettverk(g);
// NevroHjernes spillenett tar APPENS 238-koding direkte, og benkens `t` ER
// den kodingen (de 238 foerste tallene). Vi trenger derfor ingen GameState -
// nevros valg kan regnes rett ut av samme stilling som vi selv leser.
const hjerne = nevroHjerne();
const SPILL_INN = 238;

const stillinger = lesBenk(benk, antall);
console.log(`${stillinger.length} stillinger fra ${benk}`);

/** Kortindeks med høyest verdi i fasiten = orakelets valg. */
function orakelValg(v: Readonly<Record<string, number>>): number {
  let best = -1;
  let bestV = -Infinity;
  for (const [k, x] of Object.entries(v)) {
    if (x > bestV) {
      bestV = x;
      best = Number(k);
    }
  }
  return best;
}

const sumAlle = new Float64Array(ANTALL_INN);
const sumForsprang = new Float64Array(ANTALL_INN);
const sumSpeil = new Float64Array(ANTALL_INN);
let nAlle = 0;
let nForsprang = 0;
let nSpeil = 0;
let utenNt = 0;

for (const s of stillinger) {
  const nt = s.nt;
  if (nt === undefined) {
    utenNt++;
    continue;
  }
  const lovlige = Object.keys(s.v).map(Number);
  if (lovlige.length < 2) continue;
  const fasit = orakelValg(s.v);

  const u = nett.aktiver([...nt]);
  let mitt = -1;
  let bestU = -Infinity;
  for (const k of lovlige) {
    const x = u[UT_KORT + k]!;
    if (x > bestU) {
      bestU = x;
      mitt = k;
    }
  }
  // NevroHjernes valg finnes ikke i benken; vi bruker orakelets NEST beste
  // som stedfortreder ville vært galt. I stedet leser vi nevros valg fra
  // feltet hvis det finnes, ellers hopper vi over sammenligningen.
  const x = new Float32Array(SPILL_INN);
  for (let i = 0; i < SPILL_INN; i++) x[i] = s.t[i] ?? 0;
  const logits = forover(hjerne.spill, x);
  let nevroValg = -1;
  let bestN = -Infinity;
  for (const k of lovlige) {
    const y = logits[k] ?? -Infinity;
    if (y > bestN) {
      bestN = y;
      nevroValg = k;
    }
  }

  nAlle++;
  for (let i = 0; i < ANTALL_INN; i++) sumAlle[i]! += nt[i]!;

  if (mitt === fasit && nevroValg !== fasit) {
    nForsprang++;
    for (let i = 0; i < ANTALL_INN; i++) sumForsprang[i]! += nt[i]!;
  } else if (mitt !== fasit && nevroValg === fasit) {
    nSpeil++;
    for (let i = 0; i < ANTALL_INN; i++) sumSpeil[i]! += nt[i]!;
  }
}

console.log(`vurdert ${nAlle}, uten nt ${utenNt}`);
console.log(`FORSPRANG (vi rett, nevro feil): ${nForsprang}`);
console.log(`SPEIL     (nevro rett, vi feil): ${nSpeil}`);
if (nForsprang === 0) {
  console.log(`\nBenken mangler NevroHjernes valg per stilling, så forspranget kan ikke skilles ut.`);
  console.log(`Legg feltet 'nevro' (kortindeks) inn i e1-orakel.ts og generer på nytt.`);
  writeFileSync(ut, JSON.stringify({ feil: "benken mangler nevro-valg", nAlle }, null, 2));
  process.exit(0);
}

interface Rad {
  sensor: number;
  forsprang: number;
  speil: number;
  alle: number;
  loeft: number;
}
const rader: Rad[] = [];
for (let i = 0; i < ANTALL_INN; i++) {
  const f = sumForsprang[i]! / nForsprang;
  const sp = nSpeil > 0 ? sumSpeil[i]! / nSpeil : 0;
  const a = sumAlle[i]! / nAlle;
  rader.push({ sensor: i, forsprang: f, speil: sp, alle: a, loeft: f - sp });
}
rader.sort((x, y) => y.loeft - x.loeft);
writeFileSync(ut, JSON.stringify({ nForsprang, nSpeil, nAlle, rader }, null, 2));

console.log(`\n20 sensorer som fyrer MEST i forsprangsstillingene (løft = forsprang − speil):`);
for (const r of rader.slice(0, 20)) {
  console.log(`  sensor ${String(r.sensor).padStart(3)}  forsprang ${r.forsprang.toFixed(3)}  speil ${r.speil.toFixed(3)}  løft ${r.loeft >= 0 ? "+" : ""}${r.loeft.toFixed(3)}`);
}
console.log(`-> ${ut}`);
