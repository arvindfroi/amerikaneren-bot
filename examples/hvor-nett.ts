/**
 * ER KORTNETTET SELV BLITT BEDRE? — og ville løkkas port sett det? (19. sep)
 *
 *   node examples/hvor-nett.ts --nett kort15=e1-modell/kort-15.bin,kort18=…,kort21=… \
 *        D:/amb-destill/analyse/destill-w*.jsonl [--ut fil.md]
 *
 * REN REANALYSE, ingen ny CPU. Destillasjonens del-1-rader bærer kortnettets 493-trekk `t`
 * (nettuavhengig — det er stillingen, ikke nettets svar) og 16 uavhengige 48-verdenssøk.
 * Hvert nett kjøres forover på de LAGREDE trekkene, og dets rå argmaks over lovlige kort måles:
 *
 *   SANNHETEN  bortfall mot en referanse nettet er uavhengig av (snittet av gruppe A og av
 *              gruppe B, snittet over de to retningene). Dette er «er nettet faktisk bedre».
 *   PORTEN     samme nett målt slik LØKKA måler det: anger mot en etikett av gitt renhet
 *              (L0 = 24 verdener, 1×48 = v13 i dag, 2×48, 4×48). Differansen mot sannheten
 *              er etikettstøyen porten dømmer på.
 *
 * Alle par-tall er parret per rad; SE er klyngebootstrap over kamp (B = 4000).
 *
 * FORBEHOLD som skal stå i rapporten: radene ble spilt av en bot med kort-16 (= kort-15) i det
 * indre laget, så stillingsfordelingen er den policyens. Begge nett måles på NØYAKTIG de samme
 * stillingene, så sammenlikningen er parret og rettferdig — men den er så vidt utenfor policy
 * for det nyeste nettet.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { forover, nettFraBytes, type NevroNett } from "../src/nevro/nett.ts";

interface Rad {
  kamp: string;
  stikk: number;
  kort: number[];
  nett: number | null;
  L0: number[];
  G: number[][];
  t?: number[];
}

const argv = process.argv.slice(2);
const verdi = (n: string): string | undefined => {
  const i = argv.indexOf(n);
  return i < 0 ? undefined : argv[i + 1];
};
const UT = verdi("--ut");
const B = Number(verdi("--B") ?? "4000");
const filer = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--nett" && argv[i - 1] !== "--ut" && argv[i - 1] !== "--B");
const nett: [string, NevroNett][] = (verdi("--nett") ?? "").split(",").map((x) => {
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

const am = (v: readonly number[]): number => {
  let b = 0;
  for (let i = 1; i < v.length; i++) if (v[i]! > v[b]!) b = i;
  return b;
};
const snitt = (vs: readonly (readonly number[])[]): number[] => vs[0]!.map((_, i) => vs.reduce((a, v) => a + v[i]!, 0) / vs.length);
const tap = (ref: readonly number[], i: number): number => Math.max(...ref) - ref[i]!;
/** Disjunkte delmengder av 0..7 med størrelse k (samme deling som hvor-etikett.mjs). */
const deler = (k: number): number[][] => {
  const ut: number[][] = [];
  for (let s = 0; s + k <= 8; s += k) ut.push(Array.from({ length: k }, (_, i) => s + i));
  return ut;
};
const KS = [1, 2, 4] as const;

interface A {
  kamp: string;
  stikk: number;
  /** bortfall mot uavhengig referanse, per nett — SANNHETEN */
  sann: number[];
  /** anger mot etikett av renhet k, per nett — det PORTEN ser */
  port: Record<string, number[]>;
  /** enighet med det reneste snittet (8×48 fra hver gruppe), per nett */
  enig: number[];
  /** de 16 rå 48-verdenssøkene, så porten kan regnes på ÉN trekning om gangen */
  raa?: number[][];
  /** nettets valgte indeks i `kort`, per nett */
  valg?: number[];
}

const avl: A[] = rader.map((r) => {
  const x = Float32Array.from(r.t!);
  const valg = nett.map(([, n]) => {
    const ut = forover(n, x);
    return am(r.kort.map((k) => ut[k]!));
  });
  const A8 = r.G.slice(0, 8);
  const B8 = r.G.slice(8, 16);
  const refA = snitt(A8);
  const refB = snitt(B8);
  const sann = valg.map((i) => (tap(refA, i) + tap(refB, i)) / 2);
  const enig = valg.map((i) => ((i === am(refA) ? 1 : 0) + (i === am(refB) ? 1 : 0)) / 2);
  const port: Record<string, number[]> = {};
  port.L0 = valg.map((i) => tap(r.L0, i));
  for (const k of KS) {
    port[`k${k}`] = valg.map((i) => {
      let s = 0;
      let n = 0;
      for (const grp of [A8, B8])
        for (const d of deler(k)) {
          s += tap(snitt(d.map((j) => grp[j]!)), i);
          n++;
        }
      return s / n;
    });
  }
  return { kamp: r.kamp, stikk: r.stikk, sann, port, enig, raa: r.G, valg };
});

function est(u: A[], f: (a: A) => number | null): { m: number; se: number; n: number; nk: number } {
  const pk = new Map<string, { s: number; n: number }>();
  let n = 0;
  for (const a of u) {
    const v = f(a);
    if (v === null || !Number.isFinite(v)) continue;
    const k = pk.get(a.kamp) ?? { s: 0, n: 0 };
    k.s += v;
    k.n++;
    pk.set(a.kamp, k);
    n++;
  }
  const kl = [...pk.values()];
  if (kl.length === 0) return { m: NaN, se: NaN, n: 0, nk: 0 };
  const m = kl.reduce((a, k) => a + k.s, 0) / kl.reduce((a, k) => a + k.n, 0);
  let rng = 20260919;
  const rnd = (): number => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const bs: number[] = [];
  for (let b = 0; b < B; b++) {
    let s = 0;
    let c = 0;
    for (let i = 0; i < kl.length; i++) {
      const k = kl[Math.floor(rnd() * kl.length)]!;
      s += k.s;
      c += k.n;
    }
    bs.push(s / c);
  }
  const mb = bs.reduce((a, v) => a + v, 0) / B;
  return { m, se: Math.sqrt(bs.reduce((a, v) => a + (v - mb) ** 2, 0) / (B - 1)), n, nk: kl.length };
}

const f3 = (x: number): string => (Number.isFinite(x) ? x.toFixed(4).replace(".", ",") : "–");
const sg = (x: number): string => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(4).replace(".", ",");

let T = "";
const p = (s = ""): void => {
  T += s + "\n";
};
const navn = nett.map(([n]) => n);
p(`# Er kortnettet selv blitt bedre — og ville løkkas port sett det?`);
p();
p(`${avl.length} kortbeslutninger i ${new Set(avl.map((a) => a.kamp)).size} kamper, rå argmaks fra lagrede 493-trekk.`);
p(`SE = klyngebootstrap over kamp (B = ${B}), parret per rad.`);
p();
p(`## (a) SANNHETEN — bortfall mot en referanse nettet er uavhengig av`);
p();
p(`| nett | bortfall (ALLE) | enig med rent snitt | stikk 0–3 | stikk 4–7 | stikk 8+ |`);
p(`|---|---|---|---|---|---|`);
for (let i = 0; i < nett.length; i++) {
  const a = est(avl, (x) => x.sann[i]!);
  const e = est(avl, (x) => x.enig[i]!);
  const s1 = est(avl.filter((x) => x.stikk <= 3), (x) => x.sann[i]!);
  const s2 = est(avl.filter((x) => x.stikk >= 4 && x.stikk <= 7), (x) => x.sann[i]!);
  const s3 = est(avl.filter((x) => x.stikk >= 8), (x) => x.sann[i]!);
  p(`| ${navn[i]} | ${f3(a.m)} ± ${f3(a.se)} | ${(100 * e.m).toFixed(1)} % | ${f3(s1.m)} ± ${f3(s1.se)} | ${f3(s2.m)} ± ${f3(s2.se)} | ${f3(s3.m)} ± ${f3(s3.se)} |`);
}
p();
p(`### Parret mot ${navn[0]} (negativt = bedre)`);
p();
p(`| nett | Δ bortfall (sannhet) | z | Δ enighet (pp) | andel rader med ulikt valg |`);
p(`|---|---|---|---|---|`);
for (let i = 1; i < nett.length; i++) {
  const d = est(avl, (x) => x.sann[i]! - x.sann[0]!);
  const e = est(avl, (x) => 100 * (x.enig[i]! - x.enig[0]!));
  const u = est(avl, (x) => (x.sann[i] !== x.sann[0] ? 1 : 0));
  p(`| ${navn[i]} | **${sg(d.m)} ± ${f3(d.se)}** | ${(d.m / d.se).toFixed(2)} | ${sg(e.m)} ± ${f3(e.se)} | ${(100 * u.m).toFixed(1)} % |`);
}
p();
p(`## (b) NIVÅET porten leser av (snitt over mange trekninger — bare til orientering)`);
p();
p(`| etikett porten dømmer mot | ${navn.map((n) => `anger ${n}`).join(" | ")} | støydel over sannheten |`);
p(`|---|${navn.map(() => "---").join("|")}|---|`);
for (const [etikett, n] of [
  ["L0 (24 verdener, før v13)", "L0"],
  ["**1×48 (løkka i dag)**", "k1"],
  ["2×48", "k2"],
  ["4×48", "k4"],
] as const) {
  const kol = navn.map((_, i) => est(avl, (x) => x.port[n]![i]!).m);
  const sannM = navn.map((_, i) => est(avl, (x) => x.sann[i]!).m);
  p(`| ${etikett} | ${kol.map(f3).join(" | ")} | ${sg(kol[0]! - sannM[0]!)} |`);
}
p(`| *SANNHET (uavhengig referanse)* | ${navn.map((_, i) => f3(est(avl, (x) => x.sann[i]!).m)).join(" | ")} | – |`);
p();
p(`## (c) DET PORTEN FAKTISK GJØR: ÉN trekning, ikke et snitt`);
p();
p(`Løkka merker hver rad med **ett** søk, ikke med snittet av åtte. Tabellen over undervurderer`);
p(`derfor støyen grovt. Her er den parrede differansen regnet på nytt for hver ENKELTE trekning`);
p(`etiketten kunne ha vært (16/k disjunkte trekninger per renhet), slik løkka ville sett den.`);
p(`Spredningen er porten sin myntkast-komponent; sannheten står nederst.`);
p();
for (let i = 1; i < nett.length; i++) {
  p(`**${navn[i]} − ${navn[0]}** (sannhet: ${sg(est(avl, (x) => x.sann[i]! - x.sann[0]!).m)})`);
  p();
  p(`| etikettrenhet | trekninger | snitt Δ | SD mellom trekninger | spenn | trekninger med FEIL fortegn |`);
  p(`|---|---|---|---|---|---|`);
  for (const k of KS) {
    const ds: number[] = [];
    for (const grp of [0, 8])
      for (const d of deler(k)) {
        const idx = d.map((j) => j + grp);
        ds.push(
          est(avl, (x) => {
            const e = snitt(idx.map((j) => x.raa![j]!));
            return tap(e, x.valg![i]!) - tap(e, x.valg![0]!);
          }).m,
        );
      }
    const m = ds.reduce((a, b) => a + b, 0) / ds.length;
    const sd = Math.sqrt(ds.reduce((a, b) => a + (b - m) ** 2, 0) / (ds.length - 1));
    const feil = ds.filter((d) => d > 0).length;
    p(
      `| ${k}×48${k === 1 ? " (i dag)" : ""} | ${ds.length} | ${sg(m)} | ${f3(sd)} | ${sg(Math.min(...ds))} … ${sg(Math.max(...ds))} | **${feil} av ${ds.length}** |`,
    );
  }
  p();
}

console.log(T);
if (UT !== undefined) writeFileSync(UT, T);
