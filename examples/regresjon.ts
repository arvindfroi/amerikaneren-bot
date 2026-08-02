/**
 * REGRESJONEN: agenteffekter med fast effekt per giv, og atferd som mediator.
 *
 *   node examples/regresjon.ts regr-data --ut analyse/regresjon.txt
 *
 * MODELLEN
 *
 *     poengdiff_{giv,sete,agent} = α_giv + β_agent + (kontroller) + ε
 *
 * `α_giv` er en fast effekt per giv. Den absorberer ALT som er felles for den
 * giva – hvor gode kortene var, hvor lett kontrakten satt, hvor mye poeng som
 * i det hele tatt sto på spill. Det er den som gjør at agenter som aldri har
 * møtt hverandre kan sammenliknes: β identifiseres av variasjon INNENFOR samme
 * giv, ikke på tvers.
 *
 * TEKNIKKEN er innen-transformasjon: trekk fra givens gjennomsnitt på både
 * venstre og høyre side. Det gir nøyaktig samme β som å legge inn tusenvis av
 * giv-dummyer, men uten å invertere en matrise med tusenvis av kolonner.
 * Frihetsgradene justeres for de absorberte effektene.
 *
 * STANDARDFEIL KLYNGET PÅ GIV. De fire setene i samme giv deler kortene, så
 * feilleddene deres er korrelerte. Vanlige SE ville vært altfor små. Her
 * brukes klynge-robust (Liang–Zeger) med giva som klynge.
 *
 * TO MODELLER, OG FORSKJELLEN MELLOM DEM ER POENGET
 *
 *   M1  bare agent-dummyer      → hvor mye bedre er agenten?
 *   M2  agent + ATFERD          → hvor mye av det forklares av det vi måler?
 *
 * Krymper β fra M1 til M2, er kanten MEDIERT av den målte atferden – da vet vi
 * HVA som skal endres, ikke bare hvem som er best. Krymper den ikke, virker
 * agenten gjennom noe vi ikke har målt, og da er det den neste tingen å finne.
 *
 * ROLLE ER IKKE EN KONTROLL. Hvilken rolle et sete får avhenger av budrunden,
 * som agenten selv påvirker. Å betinge på rolle ville skjult en agent som er
 * bedre nettopp fordi den oftere havner i den lønnsomme rollen. Rollemodellen
 * kjøres derfor SEPARAT og merkes som betinget.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Rad {
  giv: number;
  agent: string;
  rolle: string;
  posisjon: number;
  bud: number;
  poengdiff: number;
  lagStikk: number;
  klart: number;
  trumfUt: number;
  honnørUt: number;
  tokStikk: number;
  trumfetInn: number;
}

const mappe = process.argv[2] ?? "regr-data";
let utFil = "analyse/regresjon.txt";
let målKol = "poengdiff";
for (let i = 3; i < process.argv.length; i++) {
  if (process.argv[i] === "--ut") utFil = process.argv[++i] ?? utFil;
  else if (process.argv[i] === "--mal") målKol = process.argv[++i] ?? målKol;
}

const rader: Rad[] = [];
for (const f of readdirSync(mappe).filter((x) => x.endsWith(".jsonl"))) {
  for (const l of readFileSync(join(mappe, f), "utf8").split("\n")) {
    if (l.trim() === "") continue;
    try {
      rader.push(JSON.parse(l) as Rad);
    } catch {
      continue;
    }
  }
}
if (rader.length < 100) {
  console.error(`for få rader (${rader.length})`);
  process.exit(1);
}

const agenter = [...new Set(rader.map((r) => r.agent))].sort();
/** Basiskategorien. Alle koeffisienter leses MOT denne. */
const basis = agenter.includes("nevro") ? "nevro" : agenter[0]!;
const andre = agenter.filter((a) => a !== basis);

/** Løser (X'X)b = X'y, og gir tilbake både b og (X'X)^{-1} til SE-en. */
function ols(X: number[][], y: number[]): { b: number[]; XtXinv: number[][] } | null {
  const k = X[0]!.length;
  const A: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const c = new Array<number>(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    const xi = X[i]!;
    for (let a = 0; a < k; a++) {
      if (xi[a] === 0) continue;
      c[a]! += xi[a]! * y[i]!;
      for (let b2 = 0; b2 < k; b2++) A[a]![b2]! += xi[a]! * xi[b2]!;
    }
  }
  // Gauss-Jordan med utvidet identitet gir b og invers i én operasjon.
  const M = A.map((rad, i) => [...rad, ...Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)), c[i]!]);
  for (let p = 0; p < k; p++) {
    let piv = p;
    for (let i = p + 1; i < k; i++) if (Math.abs(M[i]![p]!) > Math.abs(M[piv]![p]!)) piv = i;
    if (Math.abs(M[piv]![p]!) < 1e-10) return null;
    [M[p], M[piv]] = [M[piv]!, M[p]!];
    const d = M[p]![p]!;
    for (let j = p; j < 2 * k + 1; j++) M[p]![j]! /= d;
    for (let i = 0; i < k; i++) {
      if (i === p) continue;
      const fac = M[i]![p]!;
      if (fac === 0) continue;
      for (let j = p; j < 2 * k + 1; j++) M[i]![j]! -= fac * M[p]![j]!;
    }
  }
  return {
    b: M.map((rad) => rad[2 * k]!),
    XtXinv: M.map((rad) => rad.slice(k, 2 * k)),
  };
}

/**
 * Kjører modellen med giv-fast-effekt (innen-transformasjon) og
 * klyngerobuste standardfeil på giv.
 */
function kjør(
  bruk: readonly Rad[],
  navn: readonly string[],
  lagX: (r: Rad) => number[],
): { navn: string; b: number; se: number }[] | null {
  // Innen-transformasjon: trekk fra givens snitt paa y og hver kolonne.
  const perGiv = new Map<number, Rad[]>();
  for (const r of bruk) perGiv.set(r.giv, [...(perGiv.get(r.giv) ?? []), r]);
  const X: number[][] = [];
  const y: number[] = [];
  const givAv: number[] = [];
  for (const [g, rs] of perGiv) {
    if (rs.length < 2) continue; // en giv med én rad bidrar ingenting etter demeaning
    const Xs = rs.map(lagX);
    const ys = rs.map((r) => (målKol === "lagStikk" ? r.lagStikk : målKol === "klart" ? r.klart : r.poengdiff));
    const k = Xs[0]!.length;
    const mx = new Array<number>(k).fill(0);
    let my = 0;
    for (let i = 0; i < rs.length; i++) {
      my += ys[i]!;
      for (let a = 0; a < k; a++) mx[a]! += Xs[i]![a]!;
    }
    my /= rs.length;
    for (let a = 0; a < k; a++) mx[a]! /= rs.length;
    for (let i = 0; i < rs.length; i++) {
      X.push(Xs[i]!.map((v, a) => v - mx[a]!));
      y.push(ys[i]! - my);
      givAv.push(g);
    }
  }
  const res = ols(X, y);
  if (res === null) return null;
  const { b, XtXinv } = res;
  const k = b.length;

  // Klyngerobust «meat»: sum over klynger av (X_g' e_g)(X_g' e_g)'.
  const perKlynge = new Map<number, number[]>();
  for (let i = 0; i < X.length; i++) {
    let pred = 0;
    for (let a = 0; a < k; a++) pred += X[i]![a]! * b[a]!;
    const e = y[i]! - pred;
    const s = perKlynge.get(givAv[i]!) ?? new Array<number>(k).fill(0);
    for (let a = 0; a < k; a++) s[a]! += X[i]![a]! * e;
    perKlynge.set(givAv[i]!, s);
  }
  const meat: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (const s of perKlynge.values()) {
    for (let a = 0; a < k; a++) for (let c2 = 0; c2 < k; c2++) meat[a]![c2]! += s[a]! * s[c2]!;
  }
  const G = perKlynge.size;
  const skala = (G / Math.max(1, G - 1)) * ((X.length - 1) / Math.max(1, X.length - k));
  const V: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let a = 0; a < k; a++) {
    for (let c2 = 0; c2 < k; c2++) {
      let sum = 0;
      for (let m = 0; m < k; m++) for (let nn = 0; nn < k; nn++) sum += XtXinv[a]![m]! * meat[m]![nn]! * XtXinv[nn]![c2]!;
      V[a]![c2] = sum * skala;
    }
  }
  return navn.map((nv, a) => ({ navn: nv, b: b[a]!, se: Math.sqrt(Math.max(0, V[a]![a]!)) }));
}

const agentNavn = andre.map((a) => `agent=${a}`);
const agentX = (r: Rad): number[] => andre.map((a) => (r.agent === a ? 1 : 0));
const atferdNavn = ["trumf ut", "honnoer ut", "tok stikket", "trumfet inn"];
const atferdX = (r: Rad): number[] => [
  r.trumfUt < 0 ? 0 : r.trumfUt,
  r.honnørUt < 0 ? 0 : r.honnørUt,
  r.tokStikk < 0 ? 0 : r.tokStikk,
  r.trumfetInn < 0 ? 0 : r.trumfetInn,
];

const M1 = kjør(rader, agentNavn, agentX);
const M2 = kjør(rader, [...agentNavn, ...atferdNavn], (r) => [...agentX(r), ...atferdX(r)]);

const linje = (x: { navn: string; b: number; se: number }): string =>
  `  ${x.navn.padEnd(24)} ${(x.b >= 0 ? "+" : "") + x.b.toFixed(4).padStart(8)} ± ${x.se.toFixed(4)}   ` +
  `${(x.b / x.se).toFixed(1).padStart(6)} SE`;

const ut: string[] = [
  `\n=== Regresjon med fast effekt per giv ===`,
  `${rader.length} rader, ${new Set(rader.map((r) => r.giv)).size} giver, ${agenter.length} agenter.`,
  `Utfall: ${målKol}. Basiskategori: ${basis} (alle koeffisienter leses MOT den).`,
  `Standardfeil klynget paa giv – de fire setene deler kort.`,
  ``,
  `M1: BARE AGENT-DUMMYER`,
  ...(M1 ?? []).map(linje),
  ``,
  `M2: AGENT + ATFERD (atferden som mediator)`,
  ...(M2 === null ? ["  (utgaar - ingen atferdskolonner)"] : M2.map(linje)),
  ``,
  `MEDIASJON – hvor mye av agentkanten forklarer atferden?`,
  ``,
  `  agent                     M1        M2      forklart`,
  `  ------------------------------------------------------`,
];
if (M2 === null) {
  // Datasett uten atferdskolonner – broradene for MesterAI og menneskene har
  // ingen, siden vi ikke kan observere HVORDAN de spilte, bare hva det ga.
  // Da er atferdskolonnene konstant null, matrisen blir singulær, og `ols`
  // returnerer riktig null. Mediasjonen finnes bare ikke her.
  ut.push(`  (ingen atferdskolonner i dette datasettet – mediasjonen utgaar)`);
} else {
  for (let i = 0; i < (M1 ?? []).length; i++) {
    const a = M1![i]!;
    const b = M2[i]!;
    const andel = a.b === 0 ? NaN : (100 * (a.b - b.b)) / a.b;
    ut.push(
      `  ${a.navn.replace("agent=", "").padEnd(24)} ${a.b.toFixed(3).padStart(7)}  ${b.b.toFixed(3).padStart(7)}   ` +
        `${Number.isNaN(andel) ? "     –" : andel.toFixed(0).padStart(5) + " %"}`,
    );
  }
}
ut.push(
  `  ------------------------------------------------------`,
  ``,
  `  Hoey «forklart» = kanten gaar GJENNOM den maalte atferden, og da vet vi`,
  `  hva som skal endres. Lav = agenten virker gjennom noe vi IKKE har maalt,`,
  `  og da er det neste sted aa lete.`,
  ``,
  `FORBEHOLD. Atferdsmaalene er utfall av de samme valgene som gir poengene,`,
  `ikke uavhengige aarsaker. M2 skal derfor leses som en DEKOMPONERING av hvor`,
  `kanten viser seg, ikke som et kausalt anslag paa hva som ville skjedd om man`,
  `endret atferden alene.`,
);
const tekst = ut.join("\n");
console.log(tekst);
writeFileSync(utFil, tekst + "\n");
