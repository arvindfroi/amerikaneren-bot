/**
 * TRENER BUDMODELLEN: hånd → forventet poengdifferanse per handling.
 *
 *   node examples/budtren.ts --data bud-data --ut e1-modell/bud-a.json
 *
 * MODELLEN ER RIDGE-REGRESJON, ikke et nevralt nett, og det er et valg og
 * ikke latskap:
 *
 *   - Inngangen er 105 trekk som allerede er håndlaget for nettopp dette
 *     (`src/moe2/handtrekk.ts`, med permutasjonstest). Det er ikke rå piksler
 *     der et nett må finne strukturen selv.
 *   - Etikettene er STØYETE. Hver er et snitt over 24 utspilte runder, og
 *     poeng svinger ±18. Med den støyen er kapasitet en ulempe, ikke en
 *     fordel – et stort nett pugger støyen.
 *   - Løsningen er lukket form. Ingen GPU, ingen WSL, ingen læringsrate som
 *     kan settes feil, og resultatet er BIT-IDENTISK hver gang. Det gjør en
 *     negativ måling til et svar i stedet for et spørsmål om hyperparametre.
 *
 * Blir dette målt positivt, er det tidsnok å prøve et nett og se om det
 * henter mer. Blir det målt negativt, har vi spart natta.
 *
 * MÅLET ER DIFFERANSEN, ikke egne poeng. Arvind: «det er ikke bare poengene
 * dine som teller, men også at du straffer motstanderne.» `diff` er egne
 * poeng minus snittet av de tre andre – samme størrelse som `standardMål` i
 * sdkort.ts, som resten av prosjektet måler med.
 *
 * HOLDOUTEN DELES PÅ GIV, ikke på rad. Hver rad er én hånd, så det er samme
 * ting her – men delingen skrives eksplisitt slik at den ikke blir feil den
 * dagen flere rader deler giv.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { HAND_DIM } from "../src/moe2/handtrekk.ts";

let dataMappe = "bud-data";
let utFil = "e1-modell/bud-a.json";
let lambda = 3;
let holdoutAndel = 0.2;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--data") dataMappe = process.argv[++i]!;
  else if (a === "--ut") utFil = process.argv[++i]!;
  else if (a === "--lambda") lambda = Number(process.argv[++i]);
  else if (a === "--holdout") holdoutAndel = Number(process.argv[++i]);
}

/** Handlingene, i fast rekkefølge. 0 = PASS. */
const HANDLINGER = [0, 7, 8, 9, 10, 11];

interface Rad {
  t: number[];
  diff: Record<string, number>;
  frø: number;
}
const rader: Rad[] = [];
for (const f of readdirSync(dataMappe).filter((x) => x.endsWith(".jsonl"))) {
  for (const l of readFileSync(join(dataMappe, f), "utf8").split("\n")) {
    if (l.trim() === "") continue;
    let r: Rad;
    try {
      r = JSON.parse(l) as Rad;
    } catch {
      continue; // siste linje kan være halvskrevet mens generatoren kjører
    }
    if (r.t?.length !== HAND_DIM || r.diff === undefined) continue;
    if (HANDLINGER.some((h) => r.diff[String(h)] === undefined)) continue;
    rader.push(r);
  }
}
if (rader.length < 200) {
  console.error(`for få rader (${rader.length}) – vent til generatoren har kommet lenger`);
  process.exit(1);
}

// Del på giv. Frøet er givens identitet, så hashen på det er delingen.
const erHoldout = (frø: number): boolean => (Math.imul(frø, 2654435761) >>> 0) / 2 ** 32 < holdoutAndel;
const tren = rader.filter((r) => !erHoldout(r.frø));
const hold = rader.filter((r) => erHoldout(r.frø));

const D = HAND_DIM + 1; // +1 for konstantleddet

/** Løser (X'X + λI)w = X'y ved gausseliminasjon med delvis pivotering. */
function løs(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((rad, i) => [...rad, b[i]!]);
  for (let k = 0; k < n; k++) {
    let piv = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i]![k]!) > Math.abs(M[piv]![k]!)) piv = i;
    [M[k], M[piv]] = [M[piv]!, M[k]!];
    const d = M[k]![k]!;
    if (Math.abs(d) < 1e-12) continue;
    for (let j = k; j <= n; j++) M[k]![j]! /= d;
    for (let i = 0; i < n; i++) {
      if (i === k) continue;
      const f = M[i]![k]!;
      if (f === 0) continue;
      for (let j = k; j <= n; j++) M[i]![j]! -= f * M[k]![j]!;
    }
  }
  return M.map((rad) => rad[n]!);
}

/** X'X bygges én gang og gjenbrukes for alle seks utgangene. */
const XtX: number[][] = Array.from({ length: D }, () => new Array<number>(D).fill(0));
for (const r of tren) {
  const x = [...r.t, 1];
  for (let i = 0; i < D; i++) {
    const xi = x[i]!;
    if (xi === 0) continue;
    const rad = XtX[i]!;
    for (let j = i; j < D; j++) rad[j]! += xi * x[j]!;
  }
}
for (let i = 0; i < D; i++) for (let j = 0; j < i; j++) XtX[i]![j] = XtX[j]![i]!;
// Konstantleddet regulariseres ikke – ellers trekkes hele nivået mot null.
for (let i = 0; i < D - 1; i++) XtX[i]![i]! += lambda;

/**
 * MÅLET SENTRERES PER HÅND, og det er ikke kosmetikk.
 *
 * `diff[h]` for de seks handlingene på samme hånd deler en stor felles del:
 * hvor god hånden er i det hele tatt. Den delen er både den mest varierende
 * og den som IKKE påvirker valget – argmax er uendret om man trekker fra en
 * konstant per hånd. Regner modellen på nivåene, bruker den all kapasiteten
 * sin på å forutsi håndstyrke og nesten ingen på det som avgjør budet.
 *
 * Etter sentreringen er målet «hvor mye bedre er handling h enn snittet av
 * handlingene på DENNE hånden», som er nøyaktig det argmax trenger. Støyen
 * faller også: de seks etikettene er målt på de SAMME 24 trekningene, så den
 * felles trekningsstøyen forsvinner med gjennomsnittet.
 */
const senter = new Map<number, number>();
for (const r of rader) {
  let s2 = 0;
  for (const h of HANDLINGER) s2 += r.diff[String(h)]!;
  senter.set(r.frø, s2 / HANDLINGER.length);
}

const vekter: Record<number, number[]> = {};
for (const h of HANDLINGER) {
  const Xty = new Array<number>(D).fill(0);
  for (const r of tren) {
    const y = r.diff[String(h)]! - senter.get(r.frø)!;
    const x = [...r.t, 1];
    for (let i = 0; i < D; i++) if (x[i] !== 0) Xty[i]! += x[i]! * y;
  }
  vekter[h] = løs(XtX.map((rad) => [...rad]), Xty);
}

const anslå = (t: readonly number[], h: number): number => {
  const w = vekter[h]!;
  let s = w[D - 1]!;
  for (let i = 0; i < HAND_DIM; i++) s += w[i]! * t[i]!;
  return s;
};

const snitt = (v: readonly number[]): number => (v.length === 0 ? 0 : v.reduce((a, x) => a + x, 0) / v.length);

/**
 * MÅLESTOKKEN SOM BETYR NOE er ikke R², men POLICY-ANGER: hvor mye
 * poengdifferanse taper vi ved å følge modellens valg i stedet for det som
 * i ettertid viste seg best? En modell kan ha elendig R² og likevel velge
 * riktig, og motsatt.
 */
function evaluer(sett: readonly Rad[], velg: (r: Rad) => number): { ev: number; anger: number; treff: number } {
  const ev: number[] = [];
  const anger: number[] = [];
  let treff = 0;
  for (const r of sett) {
    const valgt = velg(r);
    let beste = HANDLINGER[0]!;
    for (const h of HANDLINGER) if (r.diff[String(h)]! > r.diff[String(beste)]!) beste = h;
    ev.push(r.diff[String(valgt)]!);
    anger.push(r.diff[String(beste)]! - r.diff[String(valgt)]!);
    if (valgt === beste) treff++;
  }
  return { ev: snitt(ev), anger: snitt(anger), treff: treff / sett.length };
}

const modell = (r: Rad): number => {
  let beste = HANDLINGER[0]!;
  let bv = -Infinity;
  for (const h of HANDLINGER) {
    const v = anslå(r.t, h);
    if (v > bv) {
      bv = v;
      beste = h;
    }
  }
  return beste;
};
/** Referansen: den beste FASTE handlingen på treningssettet. */
let fastBeste = HANDLINGER[0]!;
let fbv = -Infinity;
for (const h of HANDLINGER) {
  const v = snitt(tren.map((r) => r.diff[String(h)]!));
  if (v > fbv) {
    fbv = v;
    fastBeste = h;
  }
}

const mT = evaluer(tren, modell);
const mH = evaluer(hold, modell);
const fH = evaluer(hold, () => fastBeste);
const oH = evaluer(hold, (r) => {
  let b = HANDLINGER[0]!;
  for (const h of HANDLINGER) if (r.diff[String(h)]! > r.diff[String(b)]!) b = h;
  return b;
});

const linjer = [
  `\n=== Budmodell trent, ridge λ=${lambda} ===`,
  `${rader.length} hender: ${tren.length} trening, ${hold.length} holdout (delt på giv).`,
  `Mål: poengDIFFERANSE (egne − snittet av de tre andre).`,
  ``,
  `policy                          forventet diff   anger   treffer beste`,
  `---------------------------------------------------------------------`,
  `beste FASTE handling (${fastBeste === 0 ? "PASS" : "bud " + fastBeste})       ${fH.ev.toFixed(3).padStart(8)}   ${fH.anger.toFixed(3).padStart(5)}   ${(100 * fH.treff).toFixed(0).padStart(6)} %`,
  `MODELLEN, holdout               ${mH.ev.toFixed(3).padStart(8)}   ${mH.anger.toFixed(3).padStart(5)}   ${(100 * mH.treff).toFixed(0).padStart(6)} %`,
  `MODELLEN, trening               ${mT.ev.toFixed(3).padStart(8)}   ${mT.anger.toFixed(3).padStart(5)}   ${(100 * mT.treff).toFixed(0).padStart(6)} %`,
  `fasit (velger med etterpåklokskap)${oH.ev.toFixed(3).padStart(6)}   ${oH.anger.toFixed(3).padStart(5)}   ${(100 * oH.treff).toFixed(0).padStart(6)} %`,
  `---------------------------------------------------------------------`,
  ``,
  `MODELLEN − BESTE FASTE, på holdout: ${(mH.ev - fH.ev >= 0 ? "+" : "") + (mH.ev - fH.ev).toFixed(3)} poeng per budgiverrunde`,
  `Taket (fasit − beste faste):        ${(oH.ev - fH.ev).toFixed(3)}`,
  ``,
  `LESEVEILEDNING. «Beste faste» er referansen som betyr noe: en modell som`,
  `ikke slår «by alltid det samme» har ikke lært å skille hender, uansett hvor`,
  `pen R² den har. Sprik mellom trening og holdout er overtilpasning.`,
  ``,
  `Og dette er FORTSATT ikke et poengtall for boten. Det er målt på`,
  `simulerte etiketter fra den samme generatoren. Den ekte prøven er en`,
  `parret måling i spill, mot dagens bot, på et friskt frøbånd.`,
];
console.log(linjer.join("\n"));

mkdirSync(dirname(utFil), { recursive: true });
writeFileSync(
  utFil,
  JSON.stringify({ dim: HAND_DIM, handlinger: HANDLINGER, lambda, n: tren.length, vekter }, null, 1),
);
writeFileSync(utFil.replace(/\.json$/, ".txt"), linjer.join("\n") + "\n");
console.log(`\nSkrev ${utFil}`);
