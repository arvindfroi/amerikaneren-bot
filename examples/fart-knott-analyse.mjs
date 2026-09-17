/**
 * ANALYSEN AV KNOTTRIGGEN (17. sep).
 *
 *   node examples/fart-knott-analyse.mjs <fil.jsonl> [...] [--ref REF] [--gruppe stikk|rolle]
 *
 * Per arm mot referansen, alt PARRET på samme stilling og alt klynget på kamp:
 *   fart      Σms(REF) / Σms(arm), SE med deltametoden over kampklynger
 *   endret    andel stillinger der det SPILTE kortet er et annet enn REF sitt
 *   endretKl  det samme, men kort i samme ekvivalensklasse regnes som likt
 *   anger     snitt(anger arm − anger REF) på rader der fasiten SKILLER (lagmålet og diff-målet),
 *             SE fra kampklynger: sqrt(K/(K−1) · Σ_k (S_k − d̄·n_k)²) / N — delt på n én gang.
 * STØYGULVET er armen STOY (samme knott som REF, annet verdensfrø).
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const filer = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1]?.startsWith("--")));
const ref = args.includes("--ref") ? args[args.indexOf("--ref") + 1] : "REF";
const gruppe = args.includes("--gruppe") ? args[args.indexOf("--gruppe") + 1] : null;
/** `--skriv <fil>`: rapporten skrives av prosessen selv, i tillegg til konsollen. */
const skrivTil = args.includes("--skriv") ? args[args.indexOf("--skriv") + 1] : null;
if (skrivTil !== null) {
  const { writeFileSync, appendFileSync } = await import("node:fs");
  writeFileSync(skrivTil, "");
  const orig = console.log;
  console.log = (...x) => {
    orig(...x);
    appendFileSync(skrivTil, x.join(" ") + "\n");
  };
}

const rader = [];
for (const f of filer) {
  for (const l of readFileSync(f, "utf8").split("\n")) if (l.trim()) rader.push(JSON.parse(l));
}
const armer = [...new Set(rader.flatMap((r) => Object.keys(r.armer)))];

/** Klynget SE for et snitt av d over rader, klynge = kamp. */
function klyngeSnitt(par) {
  // par: [{k, d}]
  const N = par.length;
  if (N === 0) return { m: NaN, se: NaN, N: 0, K: 0 };
  const m = par.reduce((a, p) => a + p.d, 0) / N;
  const S = new Map();
  for (const p of par) {
    const x = S.get(p.k) ?? { s: 0, n: 0 };
    x.s += p.d;
    x.n += 1;
    S.set(p.k, x);
  }
  const K = S.size;
  let q = 0;
  for (const x of S.values()) q += (x.s - m * x.n) ** 2;
  const se = K > 1 ? Math.sqrt((K / (K - 1)) * q) / N : NaN;
  return { m, se, N, K };
}
/** Forholdet Σa/Σb med klynget deltametode-SE. */
function klyngeForhold(par) {
  const A = par.reduce((s, p) => s + p.a, 0);
  const B = par.reduce((s, p) => s + p.b, 0);
  const r = A / B;
  const S = new Map();
  for (const p of par) S.set(p.k, (S.get(p.k) ?? 0) + (p.a - r * p.b));
  const K = S.size;
  let q = 0;
  for (const v of S.values()) q += v * v;
  const se = K > 1 ? Math.sqrt((K / (K - 1)) * q) / B : NaN;
  return { r, se };
}

const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "–");
const pm = (o, d = 3, skala = 1) => `${o.m * skala >= 0 ? "+" : ""}${fmt(o.m * skala, d)} ± ${fmt(o.se * skala, d)}`;

function tabell(utvalg, tittel) {
  const K = new Set(utvalg.map((r) => r.kamp)).size;
  console.log(`\n=== ${tittel}: ${utvalg.length} stillinger, ${K} kamper ===`);
  const msRef = utvalg.reduce((s, r) => s + r.armer[ref].ms, 0) / utvalg.length;
  console.log(`REF: ${fmt(msRef, 1)} ms per vurdert kortvalg (i riggen, uten M)`);
  console.log(
    "arm".padEnd(26) +
      "ms".padStart(7) +
      "fart".padStart(14) +
      "endret%".padStart(15) +
      "endretKl%".padStart(15) +
      "  nF  anger lag (arm−REF)     anger diff (arm−REF)    angerREF lag" +
      "   nQ  dommeranger (arm−REF)" +
      "            EPIMC-dommer (arm−REF)   ms p50/p90   ep-endret",
  );
  for (const arm of armer) {
    const rs = utvalg.filter((r) => r.armer[arm] && r.armer[ref]);
    if (rs.length === 0) continue;
    const ms = rs.reduce((s, r) => s + r.armer[arm].ms, 0) / rs.length;
    const f = klyngeForhold(rs.map((r) => ({ k: r.kamp, a: r.armer[ref].ms, b: r.armer[arm].ms })));
    const endret = klyngeSnitt(rs.map((r) => ({ k: r.kamp, d: r.armer[arm].spilt !== r.armer[ref].spilt ? 1 : 0 })));
    const endretKl = klyngeSnitt(rs.map((r) => ({ k: r.kamp, d: r.armer[arm].kl !== r.armer[ref].kl ? 1 : 0 })));
    const skiller = rs.filter(
      (r) => r.spredLag > 1e-9 && r.armer[arm].regL != null && r.armer[ref].regL != null,
    );
    const aL = klyngeSnitt(skiller.map((r) => ({ k: r.kamp, d: r.armer[arm].regL - r.armer[ref].regL })));
    const skD = rs.filter((r) => r.spredDiff > 1e-9 && r.armer[arm].regD != null && r.armer[ref].regD != null);
    const aD = klyngeSnitt(skD.map((r) => ({ k: r.kamp, d: r.armer[arm].regD - r.armer[ref].regD })));
    const refL = klyngeSnitt(skiller.map((r) => ({ k: r.kamp, d: r.armer[ref].regL })));
    // Dommeren: rader der den ikke ble utløst har differanse 0 for alle armer utenom STOY (samme kort
    // som REF). For STOY regnes bare det utløste utvalget (merket *).
    const medDommer = rs.filter((r) => r.dommerUtløst !== undefined);
    let q;
    let qMerke = "";
    if (arm.endsWith("STOY")) {
      const u = medDommer.filter((r) => r.dommerUtløst && r.armer[arm].regQ != null && r.armer[ref].regQ != null);
      q = klyngeSnitt(u.map((r) => ({ k: r.kamp, d: r.armer[arm].regQ - r.armer[ref].regQ })));
      qMerke = "*";
    } else {
      const u = medDommer.filter((r) => !r.dommerUtløst || (r.armer[arm].regQ != null && r.armer[ref].regQ != null));
      q = klyngeSnitt(u.map((r) => ({ k: r.kamp, d: r.dommerUtløst ? r.armer[arm].regQ - r.armer[ref].regQ : 0 })));
    }
    // EPIMC-dommeren (18. sep): samme regel, felt `regE`.
    let qe = { m: NaN, se: NaN, N: 0 };
    if (medDommer.some((r) => r.dommerEMs !== undefined && r.dommerEMs > 0)) {
      const u = arm.endsWith("STOY")
        ? medDommer.filter((r) => r.dommerUtløst && r.armer[arm].regE != null && r.armer[ref].regE != null)
        : medDommer.filter((r) => !r.dommerUtløst || (r.armer[arm].regE != null && r.armer[ref].regE != null));
      qe = klyngeSnitt(u.map((r) => ({ k: r.kamp, d: r.dommerUtløst ? r.armer[arm].regE - r.armer[ref].regE : 0 })));
    }
    const msSort = rs.map((r) => r.armer[arm].ms).sort((a, b) => a - b);
    const pct = (p) => msSort[Math.min(msSort.length - 1, Math.floor(p * msSort.length))];
    const ep = rs.filter((r) => r.armer[arm].ep);
    const epTxt = ep.length === 0 ? "" : `${fmt(ep.reduce((a, r) => a + r.armer[arm].ep.endret, 0) / Math.max(1, ep.reduce((a, r) => a + r.armer[arm].ep.noder, 0)) * 100, 1)}% av noder`;
    // Skala: armens EGEN dommeranger på det utløste utvalget.
    const egen = klyngeSnitt(
      medDommer.filter((r) => r.dommerUtløst && r.armer[arm].regQ != null).map((r) => ({ k: r.kamp, d: r.armer[arm].regQ })),
    );
    console.log(
      arm.padEnd(26) +
        fmt(ms, 1).padStart(7) +
        `${fmt(f.r)}±${fmt(f.se)}`.padStart(14) +
        `${pm(endret, 1, 100)}`.padStart(15) +
        `${pm(endretKl, 1, 100)}`.padStart(15) +
        `  ${String(skiller.length).padStart(3)}  ${pm(aL, 3).padEnd(22)}  ${pm(aD, 3).padEnd(22)}  ${fmt(refL.m, 3).padStart(12)}` +
        `  ${String(q.N).padStart(5)}${qMerke.padEnd(1)} ${pm(q, 4).padEnd(20)} egen ${fmt(egen.m, 3)}` +
        `  ${pm(qe, 4).padEnd(22)}  ${fmt(pct(0.5), 0)}/${fmt(pct(0.9), 0)}  ${epTxt}`,
    );
  }
}

tabell(rader, "ALLE");
if (gruppe === "stikk") {
  // `stikk` i radene er 1-basert; overskriften viser også 0-basert (stikkSpilt): 0–3, 4–7, 8+.
  for (const [a, b] of [[1, 4], [5, 8], [9, 13]]) tabell(rader.filter((r) => r.stikk >= a && r.stikk <= b), `stikk ${a}-${b} (0-basert ${a - 1}-${b === 13 ? "" : b - 1}${b === 13 ? "+" : ""})`);
} else if (gruppe === "rolle") {
  for (const ro of [...new Set(rader.map((r) => r.rolle))]) tabell(rader.filter((r) => r.rolle === ro), `rolle ${ro}`);
}
