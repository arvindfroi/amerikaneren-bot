/**
 * DESTILL-SUM — analysen av `examples/destill.ts`-radene.
 *
 *   node examples/destill-sum.ts analyse/destill-w0.jsonl analyse/destill-w1.jsonl … [--B 4000]
 *
 * Alle tall er forholdsestimater (sum/antall over rader) med SE fra en klyngebootstrap over
 * KAMPER (`kamp`), B trekk. SE er bootstrapfordelingens standardavvik — ikke delt på √n igjen.
 * Parrede differanser regnes per rad før bootstrap.
 *
 * Estimatorer per rad (verdivektor over lovlige kort):
 *   L0, L1       24 verdener (L0 = løkkas faktiske etikett)
 *   G0…G(2K−1)   48 verdener; gruppe 1 = 0…K−1, gruppe 2 = K…2K−1
 *   S1, S2       snitt over gruppe 1 / gruppe 2  («8×48»)
 *   S16          snitt over alle 2K
 *   nett         kortet kortnettets lag velger (ingen verdivektor)
 */

import { readFileSync } from "node:fs";

import { lagRng } from "../src/kort.ts";

interface Rad {
  kamp: string;
  stikk: number;
  rolle: string;
  igjen: number;
  kort: number[];
  spilt: number | null;
  nett: number | null;
  L0: number[];
  L1: number[] | null;
  G: number[][];
  fd: (number | null)[] | null;
  fl: (number | null)[] | null;
}

const filer = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--B");
const B = process.argv.includes("--B") ? Number(process.argv[process.argv.indexOf("--B") + 1]) : 4000;
const alle: Rad[] = [];
for (const f of filer) {
  for (const l of readFileSync(f, "utf8").split("\n")) if (l.trim() !== "") alle.push(JSON.parse(l) as Rad);
}
const nøkler = new Set<string>();
let dupl = 0;
for (const r of alle) {
  const k = `${r.kamp}|${r.stikk}|${r.kort.join(",")}|${r.L0.join(",")}`;
  if (nøkler.has(k)) dupl++;
  nøkler.add(k);
}
const rader = alle.filter((r) => r.L1 !== null && r.G.every((g) => g !== null));
const K = rader[0]!.G.length / 2;
console.log(
  `RADER ${alle.length} (brukbare ${rader.length}, duplikater ${dupl}) fra ${filer.length} filer, ` +
    `${new Set(rader.map((r) => r.kamp)).size} kamper, K = ${K}`,
);

// ------------------------------------------------------------ hjelpere

const am = (v: readonly number[]): number => {
  let b = 0;
  for (let i = 1; i < v.length; i++) if (v[i]! > v[b]!) b = i;
  return b;
};
const snitt = (vs: readonly (readonly number[])[]): number[] =>
  vs[0]!.map((_, i) => vs.reduce((a, v) => a + v[i]!, 0) / vs.length);
const snittTall = (x: readonly number[]): number => x.reduce((a, b) => a + b, 0) / x.length;
const softmax = (v: readonly number[]): number[] => {
  const m = Math.max(...v);
  const e = v.map((x) => Math.exp(x - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
};
const tv = (a: readonly number[], b: readonly number[]): number => {
  const p = softmax(a);
  const q = softmax(b);
  return 0.5 * p.reduce((s, x, i) => s + Math.abs(x - q[i]!), 0);
};
/** Bortfall av valget `i` målt med referansen `ref` (uavhengig av valget). */
const tap = (ref: readonly number[], i: number): number => Math.max(...ref) - ref[i]!;

interface Avledet {
  r: Rad;
  S1: number[];
  S2: number[];
  S16: number[];
  nettI: number | null;
  spiltI: number | null;
  skiller: boolean;
}
const avl: Avledet[] = rader.map((r) => {
  const S1 = snitt(r.G.slice(0, K));
  const S2 = snitt(r.G.slice(K));
  const S16 = snitt(r.G);
  const nettI = r.nett === null ? null : r.kort.indexOf(r.nett);
  const spiltI = r.spilt === null ? null : r.kort.indexOf(r.spilt);
  let skiller = false;
  if (r.fd !== null && r.fd.every((x) => x !== null)) {
    const fd = r.fd as number[];
    skiller = Math.max(...fd) - Math.min(...fd) > 1e-9;
  }
  return { r, S1, S2, S16, nettI: nettI !== null && nettI >= 0 ? nettI : null, spiltI: spiltI !== null && spiltI >= 0 ? spiltI : null, skiller };
});

// ------------------------------------------------------------ bootstrap

type Mål = (a: Avledet) => number | null;
function estimer(utvalg: Avledet[], f: Mål): { m: number; se: number; n: number; nk: number } {
  const perKamp = new Map<string, { s: number; n: number }>();
  let n = 0;
  for (const a of utvalg) {
    const x = f(a);
    if (x === null || !Number.isFinite(x)) continue;
    const k = perKamp.get(a.r.kamp) ?? { s: 0, n: 0 };
    k.s += x;
    k.n++;
    perKamp.set(a.r.kamp, k);
    n++;
  }
  const kl = [...perKamp.values()];
  if (kl.length === 0) return { m: NaN, se: NaN, n: 0, nk: 0 };
  const m = kl.reduce((a, k) => a + k.s, 0) / kl.reduce((a, k) => a + k.n, 0);
  const rng = lagRng(4242);
  const bs: number[] = [];
  for (let b = 0; b < B; b++) {
    let s = 0;
    let c = 0;
    for (let i = 0; i < kl.length; i++) {
      const k = kl[Math.floor(rng() * kl.length)]!;
      s += k.s;
      c += k.n;
    }
    if (c > 0) bs.push(s / c);
  }
  const mb = snittTall(bs);
  const se = Math.sqrt(bs.reduce((a, x) => a + (x - mb) ** 2, 0) / (bs.length - 1));
  return { m, se, n, nk: kl.length };
}

const pst = (e: { m: number; se: number }): string => `${(100 * e.m).toFixed(1)} % ± ${(100 * e.se).toFixed(1)}`;
const tl = (e: { m: number; se: number }, d = 3): string => `${e.m >= 0 ? "+" : ""}${e.m.toFixed(d)} ± ${e.se.toFixed(d)}`;
const z = (e: { m: number; se: number }): string => `z ${(e.m / e.se).toFixed(2)}`;

const grupper: [string, (a: Avledet) => boolean][] = [
  ["ALLE", () => true],
  ["stikk 0–3 (forhåndsnevnt)", (a) => a.r.stikk <= 3],
  ["stikk 4–7", (a) => a.r.stikk >= 4 && a.r.stikk <= 7],
  ["stikk 8+", (a) => a.r.stikk >= 8],
  ["fører", (a) => a.r.rolle === "foerer"],
  ["makker", (a) => a.r.rolle === "makker"],
  ["forsvar", (a) => a.r.rolle === "forsvar"],
];

const ulik = (x: number, y: number): number => (x === y ? 0 : 1);
/** Snitt over de K parene (Gj, G(K+j)) — samme forventning som G0≠GK, lavere varians. */
const ulikGG = (a: Avledet): number => snittTall(a.r.G.slice(0, K).map((g, j) => ulik(am(g), am(a.r.G[K + j]!))));

// ============================================================ (a) etikettstøy
console.log("\n(a) ARGMAKS-STØYGULV — ulikt beste kort mellom to uavhengige trekk");
console.log("gruppe | n | L0≠L1 (24) | G0≠GK (48) | Gj≠G(K+j) snitt | S1≠S2 (8×48) | parret S−G | L0≠S2 (etikett mot rent)");
for (const [navn, p] of grupper) {
  const u = avl.filter(p);
  const a24 = estimer(u, (a) => ulik(am(a.r.L0), am(a.r.L1!)));
  const g0 = estimer(u, (a) => ulik(am(a.r.G[0]!), am(a.r.G[K]!)));
  const gg = estimer(u, ulikGG);
  const ss = estimer(u, (a) => ulik(am(a.S1), am(a.S2)));
  const d = estimer(u, (a) => ulik(am(a.S1), am(a.S2)) - ulikGG(a));
  const ls = estimer(u, (a) => ulik(am(a.r.L0), am(a.S2)));
  console.log(
    `${navn} | ${gg.n} (${gg.nk} k) | ${pst(a24)} | ${pst(g0)} | ${pst(gg)} | ${pst(ss)} | ${(100 * d.m).toFixed(1)} ± ${(100 * d.se).toFixed(1)} pp | ${pst(ls)}`,
  );
}

console.log("\n(a2) VERDIVEKTET: bortfall mot en UAVHENGIG referanse (poeng, lagmålet). Ref = S2 for gruppe-1-estimatorer, S1 for gruppe 2, snittet av begge der begge er uavhengige.");
console.log("gruppe | L0 (ref S2) | L1 | ett 48 | S (8×48) | nett | parret S − ett48 | parret L0 − ett48 | parret nett − S");
const bortSingle = (a: Avledet): number =>
  snittTall([
    ...a.r.G.slice(0, K).map((g) => tap(a.S2, am(g))),
    ...a.r.G.slice(K).map((g) => tap(a.S1, am(g))),
  ]);
const bortS = (a: Avledet): number => 0.5 * (tap(a.S2, am(a.S1)) + tap(a.S1, am(a.S2)));
const bortRef = (a: Avledet, i: number): number => 0.5 * (tap(a.S1, i) + tap(a.S2, i));
for (const [navn, p] of grupper) {
  const u = avl.filter(p);
  const l0 = estimer(u, (a) => tap(a.S2, am(a.r.L0)));
  const l1 = estimer(u, (a) => bortRef(a, am(a.r.L1!)));
  const g = estimer(u, bortSingle);
  const s = estimer(u, bortS);
  const nt = estimer(u, (a) => (a.nettI === null ? null : bortRef(a, a.nettI)));
  const d1 = estimer(u, (a) => bortS(a) - bortSingle(a));
  const d2 = estimer(u, (a) => tap(a.S2, am(a.r.L0)) - snittTall(a.r.G.slice(0, K).map((gg) => tap(a.S2, am(gg)))));
  const d3 = estimer(u, (a) => (a.nettI === null ? null : bortRef(a, a.nettI) - bortS(a)));
  console.log(
    `${navn} | ${tl(l0)} | ${tl(l1)} | ${tl(g)} | ${tl(s)} | ${tl(nt)} | ${tl(d1)} (${z(d1)}) | ${tl(d2)} (${z(d2)}) | ${tl(d3)} (${z(d3)})`,
  );
}

console.log("\n(a3) MYKT MÅL (sd-tren, τ = 1): TV-avstand mellom softmax-målene to uavhengige trekk gir");
console.log("gruppe | L0↔L1 | G0↔GK | S1↔S2 | L0↔S16");
for (const [navn, p] of grupper) {
  const u = avl.filter(p);
  const x = estimer(u, (a) => tv(a.r.L0, a.r.L1!));
  const y = estimer(u, (a) => snittTall(a.r.G.slice(0, K).map((g, j) => tv(g, a.r.G[K + j]!))));
  const w = estimer(u, (a) => tv(a.S1, a.S2));
  const v = estimer(u, (a) => tv(a.r.L0, a.S16));
  console.log(`${navn} | ${tl(x)} | ${tl(y)} | ${tl(w)} | ${tl(v)}`);
}

// ============================================================ (b) nettets avstand
console.log("\n(b) NETTETS ENIGHET MED SØKET (andel beslutninger der kortnettets lag velger søkets beste kort)");
console.log("gruppe | nett=L0 | nett=ett 48 | nett=S (8×48) | nett=S16 | til sammenlikning: ett48=ett48 | S=S | ett48=S(andre gruppe)");
for (const [navn, p] of grupper) {
  const u = avl.filter(p);
  const e = (f: (a: Avledet, n: number) => number): ReturnType<typeof estimer> =>
    estimer(u, (a) => (a.nettI === null ? null : f(a, a.nettI)));
  const nl = e((a, n) => 1 - ulik(n, am(a.r.L0)));
  const ng = e((a, n) => snittTall(a.r.G.map((g) => 1 - ulik(n, am(g)))));
  const ns = e((a, n) => 0.5 * (2 - ulik(n, am(a.S1)) - ulik(n, am(a.S2))));
  const n16 = e((a, n) => 1 - ulik(n, am(a.S16)));
  const gg = estimer(u, (a) => 1 - ulikGG(a));
  const ss = estimer(u, (a) => 1 - ulik(am(a.S1), am(a.S2)));
  const gs = estimer(u, (a) =>
    snittTall([...a.r.G.slice(0, K).map((g) => 1 - ulik(am(g), am(a.S2))), ...a.r.G.slice(K).map((g) => 1 - ulik(am(g), am(a.S1)))]),
  );
  console.log(`${navn} | ${pst(nl)} | ${pst(ng)} | ${pst(ns)} | ${pst(n16)} | ${pst(gg)} | ${pst(ss)} | ${pst(gs)}`);
}
{
  const u = avl;
  const d = estimer(u, (a) =>
    a.nettI === null ? null : 0.5 * (2 - ulik(a.nettI, am(a.S1)) - ulik(a.nettI, am(a.S2))) - (1 - ulikGG(a)),
  );
  const d2 = estimer(u, (a) =>
    a.nettI === null
      ? null
      : 0.5 * (2 - ulik(a.nettI, am(a.S1)) - ulik(a.nettI, am(a.S2))) -
        snittTall([...a.r.G.slice(0, K).map((g) => 1 - ulik(am(g), am(a.S2))), ...a.r.G.slice(K).map((g) => 1 - ulik(am(g), am(a.S1)))]),
  );
  console.log(`PARRET (nett=S) − (ett48=ett48): ${(100 * d.m).toFixed(1)} ± ${(100 * d.se).toFixed(1)} pp (${z(d)})`);
  console.log(`PARRET (nett=S) − (ett48=S):     ${(100 * d2.m).toFixed(1)} ± ${(100 * d2.se).toFixed(1)} pp (${z(d2)})`);
}

// ============================================================ (c) anger mot fasit
console.log("\n(c) ANGER MOT EKSAKT FASIT — bare der fasiten skiller (diff-spredning > 0), ≤ 7 kort");
const medFasit = avl.filter((a) => a.r.fd !== null && a.r.fd.every((x) => x !== null) && a.r.fl!.every((x) => x !== null));
const flate = medFasit.filter((a) => !a.skiller).length;
console.log(`fasit regnet i ${medFasit.length} rader; FLATE (forkastet) ${flate}; SKILLENDE ${medFasit.length - flate}; uten fasit ${avl.length - medFasit.length}`);
for (const [målNavn, felt] of [
  ["lag", "fl"],
  ["diff", "fd"],
] as const) {
  console.log(`\nmål: ${målNavn}`);
  console.log("gruppe | n | nett | spilt (driver) | L0 (24) | L1 | ett 48 | S (8×48) | S16 | S − ett48 | nett − ett48 | L0 − ett48");
  for (const [navn, p] of grupper) {
    const u = medFasit.filter((a) => a.skiller && p(a));
    const F = (a: Avledet): number[] => a.r[felt] as number[];
    const ang = (a: Avledet, i: number): number => tap(F(a), i);
    const eN = estimer(u, (a) => (a.nettI === null ? null : ang(a, a.nettI)));
    const eP = estimer(u, (a) => (a.spiltI === null ? null : ang(a, a.spiltI)));
    const e0 = estimer(u, (a) => ang(a, am(a.r.L0)));
    const e1 = estimer(u, (a) => ang(a, am(a.r.L1!)));
    const g = (a: Avledet): number => snittTall(a.r.G.map((x) => ang(a, am(x))));
    const s = (a: Avledet): number => 0.5 * (ang(a, am(a.S1)) + ang(a, am(a.S2)));
    const eG = estimer(u, g);
    const eS = estimer(u, s);
    const e16 = estimer(u, (a) => ang(a, am(a.S16)));
    const dS = estimer(u, (a) => s(a) - g(a));
    const dN = estimer(u, (a) => (a.nettI === null ? null : ang(a, a.nettI) - g(a)));
    const dL = estimer(u, (a) => ang(a, am(a.r.L0)) - g(a));
    console.log(
      `${navn} | ${eG.n} (${eG.nk} k) | ${tl(eN)} | ${tl(eP)} | ${tl(e0)} | ${tl(e1)} | ${tl(eG)} | ${tl(eS)} | ${tl(e16)} | ${tl(dS)} (${z(dS)}) | ${tl(dN)} (${z(dN)}) | ${tl(dL)} (${z(dL)})`,
    );
  }
}
