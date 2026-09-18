/**
 * BILLIG GREP 6a — hva kjøper 2×48 og 4×48 som kortetikett? (19. sep)
 *
 *   node examples/hvor-etikett.mjs D:/amb-destill/analyse/destill-w*.jsonl --ut <fil.txt>
 *
 * REN REANALYSE, ingen ny CPU. Destillasjonens del-1-rader bærer alt som trengs: per
 * kortbeslutning ligger løkkas egen 24-verdeners etikett `L0`, og 16 UAVHENGIGE 48-verdenssøk
 * `G[0..15]`. Gruppe A = G0…G7, gruppe B = G8…G15 (destillasjonens egen deling).
 *
 * MÅLET er destillasjonens (a2): «hva koster det å spille etikettens beste kort, målt med en
 * UAVHENGIG referanse» — bortfall = max(ref) − ref[etikettens argmaks], i poeng per beslutning.
 * Referansen må være uavhengig av etiketten, ellers kan støyen jukse seg til et pent tall.
 *
 * SYMMETRI: hver rad brukes begge veier (etikett fra A mot referanse B, og fra B mot A) og de to
 * snittes. Det er gyldig fordi A og B er disjunkte, og det halverer variansen mot å bare bruke
 * én retning. For hver k snittes det dessuten over ALLE disjunkte delmengder av gruppa
 * (k=1: 8 stk, k=2: 4, k=4: 2, k=8: 1), slik destillasjonen gjorde for «snitt over 8 par».
 *
 * SE: klyngebootstrap over kamp (B = 4000), parret per rad før bootstrap — samme rutine som
 * destill-sum.ts. Alle par-tall er parret på rad.
 */
import { readFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const iUt = argv.indexOf("--ut");
const UT = iUt < 0 ? null : argv[iUt + 1];
const FILER = argv.filter((a, i) => !a.startsWith("--") && (iUt < 0 || i !== iUt + 1));

const rader = [];
for (const f of FILER) {
  for (const l of readFileSync(f, "utf8").split(/\r?\n/)) if (l.trim()) rader.push(JSON.parse(l));
}
if (rader.length === 0) throw new Error("ingen rader");

const snitt = (arrs) => {
  const n = arrs[0].length;
  const ut = new Array(n).fill(0);
  for (const a of arrs) for (let i = 0; i < n; i++) ut[i] += a[i];
  for (let i = 0; i < n; i++) ut[i] /= arrs.length;
  return ut;
};
const argmaks = (v) => {
  let b = 0;
  for (let i = 1; i < v.length; i++) if (v[i] > v[b]) b = i;
  return b;
};
/** Bortfall: hva den uavhengige referansen sier det koster å spille kortet `i`. */
const bortfall = (ref, i) => ref[argmaks(ref)] - ref[i];
/** Total variasjonsavstand mellom softmax(v) av to mål — formen `sd-tren` faktisk ser (τ = 1). */
const softmaks = (v) => {
  const m = Math.max(...v);
  const e = v.map((x) => Math.exp(x - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
};
const tv = (p, q) => 0.5 * p.reduce((a, _, i) => a + Math.abs(p[i] - q[i]), 0);

/** Disjunkte delmengder av 0..7 med størrelse k. */
const deler = (k) => {
  const ut = [];
  for (let s = 0; s + k <= 8; s += k) ut.push(Array.from({ length: k }, (_, i) => s + i));
  return ut;
};

const KS = [1, 2, 4, 8];
/**
 * Per rad regnes, for hver etikettype, snittet av bortfallet over de disjunkte delmengdene, og
 * snittet av de to retningene (A→B og B→A). Radene er den parrede enheten.
 */
const per = rader.map((r) => {
  const A = r.G.slice(0, 8);
  const B = r.G.slice(8, 16);
  const refB = snitt(B);
  const refA = snitt(A);
  const ut = { kamp: r.kamp };
  for (const k of KS) {
    let sum = 0;
    let n = 0;
    for (const [grp, ref] of [
      [A, refB],
      [B, refA],
    ]) {
      for (const d of deler(k)) {
        // k = 8 er hele gruppa; da ER etiketten referansens motpart, og delmengden er unik.
        sum += bortfall(ref, argmaks(snitt(d.map((i) => grp[i]))));
        n++;
      }
    }
    ut[`k${k}`] = sum / n;
  }
  // Løkkas egen 24-verdeners etikett, mot begge referanser (den er uavhengig av begge).
  ut.L0 = (bortfall(refB, argmaks(r.L0)) + bortfall(refA, argmaks(r.L0))) / 2;
  // Kortnettets eget valg, samme referanser — «hvor langt er nettet fra det rene søket».
  const iNett = r.kort.indexOf(r.nett);
  ut.nett = iNett < 0 ? null : (bortfall(refB, iNett) + bortfall(refA, iNett)) / 2;
  /**
   * PORTEN: løkkas holdout-anger måler nettet mot ETIKETTEN, ikke mot sannheten. Her er samme
   * tall for hver etikettype — differansen mot den uavhengige referansen ER etikettstøyen i porten.
   */
  if (iNett >= 0) {
    ut.portL0 = r.L0[argmaks(r.L0)] - r.L0[iNett];
    for (const k of KS) {
      let sum = 0;
      let n = 0;
      for (const grp of [A, B]) {
        for (const d of deler(k)) {
          const e = snitt(d.map((i) => grp[i]));
          sum += e[argmaks(e)] - e[iNett];
          n++;
        }
      }
      ut[`port${k}`] = sum / n;
    }
    ut.portSann = ut.nett;
  }
  // TV-avstand mellom to UAVHENGIGE trekninger av samme etikettype (støyen slik nettet ser den).
  for (const k of KS) {
    if (k > 4) continue; // k = 8 har bare én trekning per gruppe; de to gruppene er trekningene
    const dA = deler(k);
    let sum = 0;
    let n = 0;
    for (const grp of [A, B]) {
      for (let i = 0; i + 1 < dA.length; i += 2) {
        sum += tv(softmaks(snitt(dA[i].map((j) => grp[j]))), softmaks(snitt(dA[i + 1].map((j) => grp[j]))));
        n++;
      }
    }
    if (n > 0) ut[`tv${k}`] = sum / n;
  }
  ut.tv8 = tv(softmaks(refA), softmaks(refB));
  ut.tvL0 = tv(softmaks(r.L0), softmaks(r.L1));
  ut.stikk = r.stikk;
  return ut;
});

/** Klyngebootstrap over kamp, B = 4000. `f` henter verdien som skal snittes fra en rad. */
function klynge(rows, f, B = 4000, frø = 20260919) {
  const bruk = rows.filter((r) => Number.isFinite(f(r)));
  const N = bruk.length;
  if (N === 0) return { m: NaN, se: NaN, N: 0, K: 0 };
  const kl = new Map();
  for (const r of bruk) {
    const x = kl.get(r.kamp) ?? { s: 0, n: 0 };
    x.s += f(r);
    x.n++;
    kl.set(r.kamp, x);
  }
  const liste = [...kl.values()];
  const Kn = liste.length;
  const m = bruk.reduce((a, r) => a + f(r), 0) / N;
  let rng = frø;
  const rnd = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const bs = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    let s = 0;
    let n = 0;
    for (let i = 0; i < Kn; i++) {
      const x = liste[Math.floor(rnd() * Kn)];
      s += x.s;
      n += x.n;
    }
    bs[b] = s / n;
  }
  const mb = bs.reduce((a, v) => a + v, 0) / B;
  const se = Math.sqrt(bs.reduce((a, v) => a + (v - mb) ** 2, 0) / (B - 1));
  return { m, se, N, K: Kn };
}

const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3).replace(".", ",") : "–");
const sign = (x) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(3).replace(".", ",");

let T = "";
const p = (s = "") => (T += s + "\n");

p(`# Billig grep 6a: hva kjøper 2×48 og 4×48 som kortetikett?`);
p();
p(`Ren reanalyse av ${rader.length} kortbeslutninger i ${new Set(rader.map((r) => r.kamp)).size} kamper`);
p(`(${FILER.length} filer). Ingen ny CPU. SE = klyngebootstrap over kamp, B = 4000, parret per rad.`);
p();

const undergrupper = [
  ["ALLE", () => true],
  ["stikk 0–3", (r) => r.stikk <= 3],
  ["stikk 4–7", (r) => r.stikk >= 4 && r.stikk <= 7],
  ["stikk 8+", (r) => r.stikk >= 8],
];

p(`## (a) Bortfall mot UAVHENGIG referanse — poeng per beslutning`);
p();
p(`| etikett | ${undergrupper.map(([n]) => n).join(" | ")} |`);
p(`|---|${undergrupper.map(() => "---").join("|")}|`);
const etiketter = [
  ["L0 — løkkas gamle, 24 verdener", "L0"],
  ["1×48 (løkka i dag, v13)", "k1"],
  ["**2×48**", "k2"],
  ["**4×48**", "k4"],
  ["8×48 (destillasjonens S)", "k8"],
  ["kortnettet selv", "nett"],
];
for (const [navn, n] of etiketter) {
  const celler = undergrupper.map(([, filt]) => {
    const o = klynge(per.filter(filt), (r) => r[n]);
    return `${f3(o.m)} ± ${f3(o.se)}`;
  });
  p(`| ${navn} | ${celler.join(" | ")} |`);
}
p();
p(`### Parrede differanser (det som avgjør regelen)`);
p();
p(`| sammenlikning | ALLE | z | stikk 0–3 |`);
p(`|---|---|---|---|`);
const par = [
  ["2×48 − 1×48", "k2", "k1"],
  ["4×48 − 1×48", "k4", "k1"],
  ["4×48 − 2×48", "k4", "k2"],
  ["8×48 − 4×48", "k8", "k4"],
  ["8×48 − 1×48", "k8", "k1"],
  ["1×48 − L0 (v13-byttet)", "k1", "L0"],
];
for (const [navn, a, b] of par) {
  const o = klynge(per, (r) => r[a] - r[b]);
  const o3 = klynge(
    per.filter((r) => r.stikk <= 3),
    (r) => r[a] - r[b],
  );
  p(`| ${navn} | **${sign(o.m)} ± ${f3(o.se)}** | ${(o.m / o.se).toFixed(1)} | ${sign(o3.m)} ± ${f3(o3.se)} |`);
}
p();

p(`## (b) PORTEN: hvor mye av kortnettets holdout-anger er etikettstøy?`);
p();
p(`Løkkas kortport dømmer nettet mot etiketten. Den sanne angeren er mot en uavhengig referanse.`);
p(`Differansen er ren støy som porten likevel dømmer på.`);
p();
p(`| porten dømmer mot | målt anger | støydel (målt − sann) |`);
p(`|---|---|---|`);
const sann = klynge(per, (r) => r.portSann);
for (const [navn, n] of [
  ["L0 (24 verdener — før v13)", "portL0"],
  ["1×48 (løkka i dag)", "port1"],
  ["2×48", "port2"],
  ["4×48", "port4"],
  ["8×48", "port8"],
]) {
  const o = klynge(per, (r) => r[n]);
  const d = klynge(per, (r) => r[n] - r.portSann);
  p(`| ${navn} | ${f3(o.m)} ± ${f3(o.se)} | **${sign(d.m)} ± ${f3(d.se)}** |`);
}
p(`| *sann anger (uavhengig referanse)* | **${f3(sann.m)} ± ${f3(sann.se)}** | – |`);
p();

p(`## (c) Støyen i den formen sd-tren ser den (TV-avstand mellom to uavhengige trekninger)`);
p();
p(`| etikett | TV, ALLE | TV, stikk 0–3 |`);
p(`|---|---|---|`);
for (const [navn, n] of [
  ["L0 mot L1 (24 verdener)", "tvL0"],
  ["1×48", "tv1"],
  ["2×48", "tv2"],
  ["4×48", "tv4"],
  ["8×48", "tv8"],
]) {
  const o = klynge(per, (r) => r[n]);
  const o3 = klynge(
    per.filter((r) => r.stikk <= 3),
    (r) => r[n],
  );
  p(`| ${navn} | ${f3(o.m)} ± ${f3(o.se)} | ${f3(o3.m)} ± ${f3(o3.se)} |`);
}
p();

console.log(T);
if (UT) writeFileSync(UT, T);
