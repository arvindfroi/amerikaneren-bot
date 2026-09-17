/**
 * DESTILL-NETT — mål kortnett (rå argmaks over lovlige kort, fra de lagrede 493-trekkene)
 * på `destill.ts`-rader skrevet med `--data`.
 *
 *   node examples/destill-nett.ts --nett a=e1-modell/kort-16.bin,b=… [--B 4000] rader1.jsonl rader2.jsonl …
 *
 * Per nett: enighet med det støyfrie snittet (S1/S2/S16), bortfall mot uavhengig referanse
 * (snittet av S1- og S2-bortfall; nettet er uavhengig av begge), og anger mot eksakt fasit
 * der fasiten skiller. Parrede differanser for hvert nett mot det FØRSTE. SE klynget på kamp.
 *
 * `nett (spek)` i `destill-sum.ts` er kortet det indre laget (budq + vakt + e1) valgte; her
 * er det nettets egen argmaks. Andelen der de to er like skrives, så vaktens bidrag er synlig.
 */

import { readFileSync } from "node:fs";

import { lagRng } from "../src/kort.ts";
import { forover, nettFraBytes, type NevroNett } from "../src/nevro/nett.ts";

interface Rad {
  kamp: string;
  stikk: number;
  kort: number[];
  nett: number | null;
  G: number[][];
  fd: (number | null)[] | null;
  fl: (number | null)[] | null;
  t?: number[];
}

const argv = process.argv.slice(2);
const verdi = (n: string): string | undefined => {
  const i = argv.indexOf(n);
  return i < 0 ? undefined : argv[i + 1];
};
const B = Number(verdi("--B") ?? "4000");
const nettArg = verdi("--nett") ?? "";
const filer = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--B" && argv[i - 1] !== "--nett");
const nett: [string, NevroNett][] = nettArg.split(",").map((x) => {
  const [navn, sti] = x.split("=") as [string, string];
  return [navn, nettFraBytes(new Uint8Array(readFileSync(sti)))[0]!];
});

const rader: Rad[] = [];
for (const f of filer)
  for (const l of readFileSync(f, "utf8").split("\n")) {
    if (l.trim() === "") continue;
    const r = JSON.parse(l) as Rad;
    if (r.t !== undefined && r.G.every((g) => g !== null)) rader.push(r);
  }
const K = rader[0]!.G.length / 2;

const am = (v: readonly number[]): number => {
  let b = 0;
  for (let i = 1; i < v.length; i++) if (v[i]! > v[b]!) b = i;
  return b;
};
const snitt = (vs: readonly (readonly number[])[]): number[] =>
  vs[0]!.map((_, i) => vs.reduce((a, v) => a + v[i]!, 0) / vs.length);
const tap = (ref: readonly number[], i: number): number => Math.max(...ref) - ref[i]!;

interface A {
  r: Rad;
  S1: number[];
  S2: number[];
  S16: number[];
  valg: number[]; // indeks i r.kort per nett
  skiller: boolean;
}
const avl: A[] = rader.map((r) => {
  const x = Float32Array.from(r.t!);
  const valg = nett.map(([, n]) => {
    const ut = forover(n, x);
    return am(r.kort.map((k) => ut[k]!));
  });
  let skiller = false;
  if (r.fd !== null && r.fd.every((v) => v !== null) && r.fl!.every((v) => v !== null)) {
    const fd = r.fd as number[];
    skiller = Math.max(...fd) - Math.min(...fd) > 1e-9;
  }
  return { r, S1: snitt(r.G.slice(0, K)), S2: snitt(r.G.slice(K)), S16: snitt(r.G), valg, skiller };
});

function estimer(u: A[], f: (a: A) => number | null): { m: number; se: number; n: number; nk: number } {
  const pk = new Map<string, { s: number; n: number }>();
  let n = 0;
  for (const a of u) {
    const x = f(a);
    if (x === null) continue;
    const k = pk.get(a.r.kamp) ?? { s: 0, n: 0 };
    k.s += x;
    k.n++;
    pk.set(a.r.kamp, k);
    n++;
  }
  const kl = [...pk.values()];
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
    bs.push(s / c);
  }
  const mb = bs.reduce((a, b) => a + b, 0) / bs.length;
  return { m, se: Math.sqrt(bs.reduce((a, x) => a + (x - mb) ** 2, 0) / (bs.length - 1)), n, nk: kl.length };
}
const f3 = (e: { m: number; se: number }, skala = 1, d = 3): string =>
  `${e.m * skala >= 0 ? "+" : ""}${(e.m * skala).toFixed(d)} ± ${(e.se * skala).toFixed(d)}`;
const zz = (e: { m: number; se: number }): string => `z ${(e.m / e.se).toFixed(2)}`;

const enig = (a: A, i: number): number => 0.5 * ((i === am(a.S1) ? 1 : 0) + (i === am(a.S2) ? 1 : 0));
const bort = (a: A, i: number): number => 0.5 * (tap(a.S1, i) + tap(a.S2, i));
const angL = (a: A, i: number): number => tap(a.r.fl as number[], i);
const angD = (a: A, i: number): number => tap(a.r.fd as number[], i);

const grupper: [string, (a: A) => boolean][] = [
  ["ALLE", () => true],
  ["stikk 0–3", (a) => a.r.stikk <= 3],
  ["stikk 4–7", (a) => a.r.stikk >= 4 && a.r.stikk <= 7],
  ["stikk 8+", (a) => a.r.stikk >= 8],
];
console.log(`RADER ${avl.length}, kamper ${new Set(avl.map((a) => a.r.kamp)).size}, skillende fasit ${avl.filter((a) => a.skiller).length}`);
{
  const e = estimer(avl, (a) => (a.r.nett === null ? null : a.r.kort[a.valg[0]!] === a.r.nett ? 1 : 0));
  console.log(`kontroll: nett «${nett[0]![0]}» rå argmaks = spekens indre lag i ${f3(e, 100, 1)} % av radene`);
}
for (const [gn, p] of grupper) {
  const u = avl.filter(p);
  const us = u.filter((a) => a.skiller);
  console.log(`\n== ${gn}: n ${u.length}, skillende ${us.length}`);
  console.log("nett | enig S (%) | bortfall mot S | anger lag | anger diff || Δenig (pp) | Δbortfall | Δanger lag | Δanger diff  (mot første)");
  nett.forEach(([navn], j) => {
    const e1 = estimer(u, (a) => enig(a, a.valg[j]!));
    const e2 = estimer(u, (a) => bort(a, a.valg[j]!));
    const e3 = estimer(us, (a) => angL(a, a.valg[j]!));
    const e4 = estimer(us, (a) => angD(a, a.valg[j]!));
    let d = "";
    if (j > 0) {
      const d1 = estimer(u, (a) => enig(a, a.valg[j]!) - enig(a, a.valg[0]!));
      const d2 = estimer(u, (a) => bort(a, a.valg[j]!) - bort(a, a.valg[0]!));
      const d3 = estimer(us, (a) => angL(a, a.valg[j]!) - angL(a, a.valg[0]!));
      const d4 = estimer(us, (a) => angD(a, a.valg[j]!) - angD(a, a.valg[0]!));
      d = ` || ${f3(d1, 100, 1)} (${zz(d1)}) | ${f3(d2)} (${zz(d2)}) | ${f3(d3)} (${zz(d3)}) | ${f3(d4)} (${zz(d4)})`;
    }
    console.log(`${navn} | ${f3(e1, 100, 1)} | ${f3(e2)} | ${f3(e3)} | ${f3(e4)}${d}`);
  });
}
