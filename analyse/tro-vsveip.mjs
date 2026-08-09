/**
 * V-SVEIPEN: er avstanden til gulv+ en DÅRLIG TRO, eller bare et ESTIMAT?
 *
 *   node analyse/tro-vsveip.mjs analyse/tro-v16.jsonl analyse/tro-v64.jsonl \
 *     analyse/tro-v256.jsonl > analyse/tro-vsveip.txt
 *
 * ================= HVORFOR DEN MÅTTE FINNES =============================
 *
 * K8-prøven måler troen mot to ANALYTISKE referanser: gulv (uniform over tre)
 * og gulv+ (uniform over ikke-renons seter). De har ingen V. Adams' tro har
 * det: `monteTro` teller hvor ofte hvert kort havner hos hvert sete i V
 * trukne verdener, så hver sannsynlighet er et estimat med varians
 * ~p(1−p)/V — kvantisert til multipler av 1/V.
 *
 * Og log-tap straffer den variansen SYSTEMATISK, ikke tilfeldig. Jensen:
 *
 *     E[−log p̂]  ≥  −log E[p̂]
 *
 * En FORVENTNINGSRETT estimator taper altså mot den glatte fordelingen den
 * estimerer. Straffen vokser når p nærmer seg 0 eller 1 — altså sent i runden,
 * der troen skulle vært skarpest.
 *
 * Det er den samme fella som §102 kalte «Monte-Carlo-oppløsning», men i en
 * form gulvet-på-p ikke fanger: `gulvbandt` kan være 0,0 % på hver eneste arm
 * og straffen likevel være der. Den gamle sjekken svarte på «binder gulvet?»,
 * ikke på «koster oppløsningen?».
 *
 * ================= DIAGNOSEN ============================================
 *
 * Kjør NØYAKTIG de samme stillingene på flere V. Gulvene er de samme tallene i
 * hver kjøring — det er selvsjekken, og den skal komme ut som 0,000000.
 * Armene er det ikke.
 *
 *   krymper (arm − gulv+) mot 0 når V vokser  →  avstanden var oppløsning
 *   står stille                               →  troen er faktisk dårligere
 *
 * Bare det andre svaret er en dom over K8.
 */

import { readFileSync } from "node:fs";

const filer = process.argv.slice(2);
if (filer.length === 0) {
  console.error("bruk: node analyse/tro-vsveip.mjs <fil.jsonl> ...");
  process.exit(1);
}

const rader = [];
for (const f of filer) {
  for (const linje of readFileSync(f, "utf8").split("\n")) {
    if (linje.trim() === "") continue;
    rader.push(JSON.parse(linje));
  }
}

const ARMER = Object.keys(rader[0])
  .filter((k) => k.endsWith("_treff"))
  .map((k) => k.slice(0, -"_treff".length));
const KJENT = new Set([
  "stikk", "sete", "verdener", "kort", "erBv", "gulv", "gulvPluss",
  ...ARMER, ...ARMER.map((a) => `${a}_treff`), ...ARMER.map((a) => `${a}_gulvbandt`),
]);
const FRØ = Object.keys(rader[0]).find((k) => !KJENT.has(k));
if (FRØ === undefined) throw new Error("fant ikke frø-feltet");

/**
 * NØKKELEN ER STILLINGEN, IKKE RADEN.
 *
 * De tre V-kjøringene ser samme giv, samme stikk og samme sete fordi frøene er
 * de samme. Uten den parringen ville sveipen sammenliknet ULIKE stillinger, og
 * da måler man hvilke giv som tilfeldigvis havnet hvor — ikke V.
 */
const nøkkel = (r) => `${r[FRØ]}|${r.stikk}|${r.sete}`;
const perV = new Map();
for (const r of rader) {
  if (!perV.has(r.verdener)) perV.set(r.verdener, new Map());
  perV.get(r.verdener).set(nøkkel(r), r);
}
const Ver = [...perV.keys()].sort((a, b) => a - b);
if (Ver.length < 2) console.error("ADVARSEL: færre enn to V-nivåer — sveipen kan ikke svare");

// Snittet skal stå på NØYAKTIG samme stillinger i hver kolonne.
let felles = [...perV.get(Ver[0]).keys()];
for (const V of Ver.slice(1)) felles = felles.filter((k) => perV.get(V).has(k));

const klynger = new Map();
for (const k of felles) {
  const g = k.split("|")[0];
  if (!klynger.has(g)) klynger.set(g, []);
  klynger.get(g).push(k);
}
const KL = [...klynger.values()];

/** Vektet snitt over klynger, vekt = antall skjulte kort i stillingen. */
function vektet(utvalg, f) {
  let sum = 0;
  let vekt = 0;
  for (const kl of utvalg) {
    for (const k of kl) {
      const v = f(k);
      if (!Number.isFinite(v)) continue;
      const w = perV.get(Ver[0]).get(k).kort;
      sum += w * v;
      vekt += w;
    }
  }
  return vekt === 0 ? NaN : sum / vekt;
}

const B = 20000;
function bootstrapSE(f) {
  let s = 0;
  let s2 = 0;
  let rng = 20260809;
  const neste = () => {
    rng ^= rng << 13; rng >>>= 0;
    rng ^= rng >>> 17;
    rng ^= rng << 5; rng >>>= 0;
    return rng / 4294967296;
  };
  for (let b = 0; b < B; b++) {
    const u = new Array(KL.length);
    for (let i = 0; i < KL.length; i++) u[i] = KL[Math.floor(neste() * KL.length)];
    const v = f(u);
    s += v; s2 += v * v;
  }
  const m = s / B;
  return Math.sqrt(Math.max(0, s2 / B - m * m));
}

const n4 = (x) => x.toFixed(4).replace(".", ",");
const n3 = (x) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(4).replace(".", ",");
const linjer = [];
const p = (s = "") => linjer.push(s);

p("V-SVEIPEN — koster Monte-Carlo-oppløsningen avstanden til gulv+?");
p("=".repeat(70));
p(`kilder      ${filer.join(" ")}`);
p(`V-nivåer    ${Ver.join(", ")}`);
p(`felles stillinger ${felles.length}   giv ${KL.length}   armer ${ARMER.join(", ")}`);
p();

// ---- selvsjekken: gulvene er analytiske og MÅ være identiske ---------------
p("SELVSJEKK — gulvene har ingen V og skal være bit-like i hver kolonne");
for (const ref of ["gulv", "gulvPluss"]) {
  const verdier = Ver.map((V) => vektet(KL, (k) => perV.get(V).get(k)[ref]));
  const spredning = Math.max(...verdier) - Math.min(...verdier);
  p(`  ${ref.padEnd(10)} ${verdier.map((v) => n4(v).padStart(9)).join("")}   spredning ${spredning.toExponential(1)}`);
  if (spredning > 1e-9) p(`  *** ${ref} SPRIKER MELLOM V — stillingene er IKKE de samme, sveipen er ugyldig`);
}
p();

// ---- nivåene per V ---------------------------------------------------------
p("LOG-TAP PER V (lavere er bedre)");
p("  arm         " + Ver.map((V) => `V=${V}`.padStart(9)).join(""));
for (const ref of ["gulv", "gulvPluss"]) {
  p(`  ${ref.padEnd(11)} ` + Ver.map((V) => n4(vektet(KL, (k) => perV.get(V).get(k)[ref])).padStart(9)).join(""));
}
for (const a of ARMER) {
  p(`  ${a.padEnd(11)} ` + Ver.map((V) => n4(vektet(KL, (k) => perV.get(V).get(k)[a])).padStart(9)).join(""));
}
p();

// ---- selve diagnosen -------------------------------------------------------
/**
 * TALLET SOM AVGJØR. Positiv = armen er BEDRE enn gulv+ (lavere tap).
 * Krymper serien mot 0 og videre oppover når V vokser, var underskuddet
 * oppløsning og ikke tro.
 */
p("ARM MOT GULV+ , PER V   (positiv = armen slår gulv+)");
p("  arm            V" + Ver.map((V) => "").join("") + "   forbedring      SE        z");
for (const a of ARMER) {
  for (const V of Ver) {
    const f = (u) => vektet(u, (k) => perV.get(V).get(k)["gulvPluss"] - perV.get(V).get(k)[a]);
    const pt = f(KL);
    const se = bootstrapSE(f);
    p(`  ${a.padEnd(11)} ${String(V).padStart(4)}      ${n3(pt)}    ${n4(se)}   ${n3(se > 0 ? pt / se : NaN)}`);
  }
}
p();

// ---- hvor mye av forskjellen mellom V er ren oppløsning? -------------------
p("PARRET SKRITT I V (samme stilling, samme arm, ulik V)");
p("  arm          skritt          vinning      SE        z");
for (const a of ARMER) {
  for (let i = 1; i < Ver.length; i++) {
    const lav = Ver[i - 1];
    const høy = Ver[i];
    const f = (u) => vektet(u, (k) => perV.get(lav).get(k)[a] - perV.get(høy).get(k)[a]);
    const pt = f(KL);
    const se = bootstrapSE(f);
    p(`  ${a.padEnd(11)}  ${String(lav).padStart(4)} → ${String(høy).padEnd(5)}   ${n3(pt)}    ${n4(se)}   ${n3(se > 0 ? pt / se : NaN)}`);
  }
}
p();

// ---- og gjelder det mest sent i runden, som Jensen forutsier? --------------
p("PER STIKK: arm − gulv+ (negativ = armen taper mot gulv+)");
const stikk = [...new Set(felles.map((k) => Number(k.split("|")[1])))].sort((a, b) => a - b);
for (const a of ARMER) {
  p(`  ${a}`);
  p("    stikk  n   " + Ver.map((V) => `V=${V}`.padStart(10)).join(""));
  for (const st of stikk) {
    const u = KL.map((kl) => kl.filter((k) => Number(k.split("|")[1]) === st)).filter((kl) => kl.length > 0);
    const nn = u.reduce((s, kl) => s + kl.length, 0);
    const celler = Ver.map((V) => n3(vektet(u, (k) => perV.get(V).get(k)[a] - perV.get(V).get(k)["gulvPluss"])).padStart(10)).join("");
    p(`    ${String(st).padStart(5)} ${String(nn).padStart(3)}   ${celler}`);
  }
}
p();

// ---- bandt gulvet på p? ----------------------------------------------------
if (rader[0][`${ARMER[0]}_gulvbandt`] !== undefined) {
  p("GULVET PÅ p BANDT (andel skjulte kort)");
  p("  arm         " + Ver.map((V) => `V=${V}`.padStart(9)).join(""));
  for (const a of ARMER) {
    p(`  ${a.padEnd(11)} ` + Ver.map((V) => (100 * vektet(KL, (k) => perV.get(V).get(k)[`${a}_gulvbandt`])).toFixed(2).replace(".", ",").padStart(8) + "%").join(""));
  }
  p("  MERK: 0 % her utelukker IKKE oppløsningsstraffen. Gulvet fanger bare");
  p("  log(0); Jensen-straffen rammer hver eneste p som ikke er 0 eller 1.");
  p();
}

console.log(linjer.join("\n"));
