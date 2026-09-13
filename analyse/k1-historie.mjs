/**
 * HISTORIEN REGNET OM: K1 på utvalg og holdout, iterasjon for iterasjon.
 * Leser BARE lagrede rundedata under D:/amb-grp/loop/iterN/.
 * Ingen K1-måling. Rapporten skrives av prosessen selv, aldri gjennom et rør.
 */
import { readFileSync, writeFileSync } from "node:fs";

// Standardstiene ligger ved SKRIPTET, ikke i en arbeidskopi med et bestemt navn: denne fila
// overlever en fletting og et nytt worktree, og skal gjøre det samme der.
const KAMPSETT = process.argv[2] ?? new URL("./k1-kampsett.tsv", import.meta.url);
const UT = process.argv[3] ?? new URL("./k1-holdout-historie.txt", import.meta.url);
const ITER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const sett = new Map();
for (const l of readFileSync(KAMPSETT, "utf8").split("\n")) {
  if (l.startsWith("#") || l.trim() === "" || l.startsWith("spill\t")) continue;
  const [id, s] = l.split("\t");
  sett.set(id, s.trim());
}

const les = (iter) => {
  const rader = [];
  for (let i = 0; i < 20; i++) {
    const f = `D:/amb-grp/loop/iter${iter}/krav-b0-k1-spek-s${i}.jsonl`;
    for (const l of readFileSync(f, "utf8").split("\n")) if (l.trim()) rader.push(JSON.parse(l));
  }
  return rader;
};

function klyngestat(rader, verdi, B = 20000, frø = 20260911) {
  const kl = new Map();
  for (const r of rader) {
    const k = kl.get(r.spill) ?? [];
    k.push(r);
    kl.set(r.spill, k);
  }
  const K = [...kl.values()];
  if (K.length < 2) return { n: rader.length, kamper: K.length, pt: NaN, se: NaN };
  const snitt = (u) => {
    let s = 0, n = 0;
    for (const k of u) for (const r of k) { const v = verdi(r); if (!Number.isFinite(v)) continue; s += v; n++; }
    return n === 0 ? NaN : s / n;
  };
  const pt = snitt(K);
  let rng = frø;
  const neste = () => { rng ^= rng << 13; rng >>>= 0; rng ^= rng >>> 17; rng ^= rng << 5; rng >>>= 0; return rng / 4294967296; };
  let s = 0, s2 = 0;
  for (let b = 0; b < B; b++) {
    const u = new Array(K.length);
    for (let i = 0; i < K.length; i++) u[i] = K[Math.floor(neste() * K.length)];
    const v = snitt(u);
    s += v; s2 += v * v;
  }
  const m = s / B;
  return { n: rader.length, kamper: K.length, pt, se: Math.sqrt(Math.max(0, s2 / B - m * m)) };
}

const dP = (r) => r.bP - r.mP;
const f2 = (x) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(2);
const f3 = (x) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(3);

const data = {};
for (const i of ITER) data[i] = les(i);

const del = (rader, s) => (s === "alle" ? rader : rader.filter((r) => sett.get(r.spill) === s));

/** Parret på nøyaktig samme (kamp, runde). Menneskesiden skal være identisk. */
function parret(a, b) {
  const mb = new Map(b.map((r) => [`${r.spill}|${r.runde}`, r]));
  const ut = [];
  let mangler = 0, ulikM = 0;
  for (const r of a) {
    const y = mb.get(`${r.spill}|${r.runde}`);
    if (y === undefined) { mangler++; continue; }
    if (y.mP !== r.mP || y.menneske !== r.menneske) ulikM++;
    ut.push({ spill: r.spill, d: dP(r) - dP(y) });
  }
  return { ut, mangler, ulikM };
}

const L = [];
const p = (s = "") => { L.push(s); };

p("K1 PÅ UTVALG OG HOLDOUT — HISTORIEN REGNET OM");
p("=".repeat(100));
p(`kampsett  ${String(KAMPSETT)}`);
p(`kilder    D:/amb-grp/loop/iter{${ITER.join(",")}}/krav-b0-k1-spek-s*.jsonl (lagrede runder, ingen ny måling)`);
p("SE        klyngebootstrap over kamp, B=20000, samme RNG som analyse/duplikat-dom.mjs");
p("");
const nU = new Set([...sett].filter(([, s]) => s === "utvalg").map(([k]) => k)).size;
const nH = new Set([...sett].filter(([, s]) => s === "holdout").map(([k]) => k)).size;
p(`delingen  ${nU} kamper i utvalg, ${nH} i holdout`);
p("");

p("1. NIVÅ PER ITERASJON (ΔP(seier) pp per runde, bot − menneske)");
p("   iter    alle                 utvalg               holdout");
for (const i of ITER) {
  const rad = ["alle", "utvalg", "holdout"].map((s) => {
    const st = klyngestat(del(data[i], s), dP);
    return `${f2(st.pt)} ± ${st.se.toFixed(2)}`.padEnd(20);
  });
  p(`   ${String(i).padEnd(6)} ${rad.join(" ")}`);
}
p("");

p("2. PARRET MOT ITER1 (samme kamper, samme runder, samme menneskeside)");
p("   iter    alle                        utvalg                      holdout");
for (const i of ITER.filter((x) => x !== 1)) {
  const rad = ["alle", "utvalg", "holdout"].map((s) => {
    const { ut, mangler, ulikM } = parret(del(data[i], s), del(data[1], s));
    const st = klyngestat(ut, (r) => r.d);
    const z = st.pt / st.se;
    return `${f3(st.pt)} ± ${st.se.toFixed(3)} z ${z >= 0 ? "+" : "−"}${Math.abs(z).toFixed(1)}${mangler || ulikM ? " AVVIK!" : ""}`.padEnd(27);
  });
  p(`   ${String(i).padEnd(6)} ${rad.join(" ")}`);
}
p("");

p("3. PARRET MOT ITER7 (grunnlinja i spørsmålet «ble 1,01 → 1,24 reell?»)");
p("   iter    alle                        utvalg                      holdout");
for (const i of [8, 9, 10]) {
  const rad = ["alle", "utvalg", "holdout"].map((s) => {
    const { ut } = parret(del(data[i], s), del(data[7], s));
    const st = klyngestat(ut, (r) => r.d);
    const z = st.pt / st.se;
    return `${f3(st.pt)} ± ${st.se.toFixed(3)} z ${z >= 0 ? "+" : "−"}${Math.abs(z).toFixed(1)}`.padEnd(27);
  });
  p(`   ${String(i).padEnd(6)} ${rad.join(" ")}`);
}
p("");

p("4. KONTROLL: menneskesiden skal være IDENTISK i alle iterasjonene (duplikatoppsett)");
for (const i of ITER.filter((x) => x !== 1)) {
  const { ut, mangler, ulikM } = parret(data[i], data[1]);
  p(`   iter${String(i).padEnd(3)} parret ${ut.length}, manglende ${mangler}, ulik menneskeside ${ulikM}${mangler === 0 && ulikM === 0 ? "  OK" : "  AVVIK"}`);
}
p("");

p("5. HVOR MYE AVHENGER SVARET AV HVILKEN DELING? 200 tilfeldige 50/50-delinger,");
p("   parret iter10−iter7, fordeling av estimatet på den blindede halvdelen.");
const ider = [...new Set(data[10].map((r) => r.spill))].sort();
const est = [];
for (let s = 0; s < 200; s++) {
  let rng = 990000 + s * 7717;
  const neste = () => { rng ^= rng << 13; rng >>>= 0; rng ^= rng >>> 17; rng ^= rng << 5; rng >>>= 0; return rng / 4294967296; };
  const h = new Set(ider.filter(() => neste() < 0.5));
  const a = data[10].filter((r) => h.has(r.spill));
  const b = data[7].filter((r) => h.has(r.spill));
  const { ut } = parret(a, b);
  const st = klyngestat(ut, (r) => r.d, 1);
  if (Number.isFinite(st.pt)) est.push(st.pt);
}
est.sort((a, b) => a - b);
const kv = (q) => est[Math.floor(q * (est.length - 1))];
p(`   n=${est.length}  min ${f3(est[0])}  p10 ${f3(kv(0.1))}  median ${f3(kv(0.5))}  p90 ${f3(kv(0.9))}  maks ${f3(est[est.length - 1])}`);
p("   (Sprikkene mellom to halvdeler av DE SAMME kampene er selve grunnen til at");
p("    ett tall på ett sett ikke kan bære en beslutning.)");
p("");

writeFileSync(UT, `${L.join("\n")}\n`, "utf8");
console.log(L.join("\n"));
console.log(`\nSkrevet: ${UT}`);
