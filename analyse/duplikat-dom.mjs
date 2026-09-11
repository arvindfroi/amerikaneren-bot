/**
 * DOMMEN OVER K1 SOM DUPLIKAT: henter boten mer ut av menneskets kort enn mennesket?
 *
 *   node analyse/duplikat-dom.mjs --ut <rapport.txt> <fil.jsonl> ...
 *
 * Radene kommer fra `examples/duplikat-menneske.ts`: én per runde et menneske spilte, med
 * menneskets faktiske rundepoeng i sete 0 og botens på NØYAKTIG samme kort og poengtavle.
 *
 * SE er klyngebootstrap over KAMPER (runder i samme kamp deler spiller, bord og stilling),
 * B = 20 000. Rapporten skrives av prosessen selv, aldri gjennom et rør. Ingen navn: spillere
 * står som pseudonymer fra eksporten.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const argv = process.argv.slice(2);
const iUt = argv.indexOf("--ut");
if (iUt < 0) throw new Error("bruk: --ut <rapport.txt> <fil.jsonl> ...");
const UT = argv[iUt + 1];
const filer = argv.filter((_, i) => i !== iUt && i !== iUt + 1);

const rader = [];
for (const f of filer) for (const l of readFileSync(f, "utf8").split("\n")) if (l.trim()) rader.push(JSON.parse(l));
if (rader.length === 0) throw new Error("ingen rader");

const B = 20000;
function klyngestat(utvalg, felt = "diff") {
  const kl = new Map();
  for (const r of utvalg) {
    const k = kl.get(r.spill) ?? [];
    k.push(r);
    kl.set(r.spill, k);
  }
  const K = [...kl.values()];
  const snitt = (u) => {
    let s = 0;
    let n = 0;
    for (const k of u) for (const r of k) { const v = r[felt]; if (!Number.isFinite(v)) continue; s += v; n++; }
    return n === 0 ? NaN : s / n;
  };
  const pt = snitt(K);
  let rng = 20260911;
  const neste = () => { rng ^= rng << 13; rng >>>= 0; rng ^= rng >>> 17; rng ^= rng << 5; rng >>>= 0; return rng / 4294967296; };
  let s = 0;
  let s2 = 0;
  for (let b = 0; b < B; b++) {
    const u = new Array(K.length);
    for (let i = 0; i < K.length; i++) u[i] = K[Math.floor(neste() * K.length)];
    const v = snitt(u);
    s += v;
    s2 += v * v;
  }
  const m = s / B;
  const se = Math.sqrt(Math.max(0, s2 / B - m * m));
  return { n: utvalg.length, kamper: K.length, pt, se, z: se > 0 ? pt / se : NaN };
}

const f = (x, d = 2) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d).replace(".", ",");
const linjer = [];
const p = (s = "") => linjer.push(s);
let FELT = "diff";
const rad = (navn, u) => {
  if (u.length === 0) return;
  const st = klyngestat(u, FELT);
  const [fm, fb] = FELT === "diff" ? ["menneske", "bot"] : ["mP", "bP"];
  const m = u.reduce((a, r) => a + (r[fm] ?? 0), 0) / u.length;
  const b = u.reduce((a, r) => a + (r[fb] ?? 0), 0) / u.length;
  p(`  ${navn.padEnd(30)} ${String(st.n).padStart(5)} ${String(st.kamper).padStart(5)}   ${f(m).padStart(7)}  ${f(b).padStart(7)}   ${f(st.pt).padStart(7)} ± ${st.se.toFixed(2).replace(".", ",")}  z ${f(st.z, 1)}`);
};

p("K1 SOM DUPLIKAT — boten i menneskets sete, samme kort og samme poengtavle");
p("=".repeat(96));
p(`kilder   ${filer.join(" ")}`);
p("SE: klyngebootstrap over kamper, B=20000");
for (const r of rader) r.dP = Number.isFinite(r.bP) && Number.isFinite(r.mP) ? r.bP - r.mP : NaN;
for (const [felt, tittel] of [
  ["dP", "VINNERSJANSE: 100·ΔP(seier) per runde for sete 0 – det K1 handler om"],
  ["diff", "RUNDEPOENG per runde for sete 0"],
]) {
if (felt === "dP" && !rader.some((r) => Number.isFinite(r.dP))) continue;
FELT = felt;
p();
p(tittel + "; positiv = boten henter mer ut av de samme kortene");
p("  utvalg                          runder kamper   menneske     bot      bot − menneske");
rad("alle", rader);
rad("fra 10. aug (Adams-v5)", rader.filter((r) => r.tid >= "2026-08-10"));
rad("før 10. aug", rader.filter((r) => r.tid < "2026-08-10"));
p();
p("  etter menneskets rolle");
for (const ro of ["fører", "makker", "forsvar", "ingen"]) rad(`  mennesket ${ro}`, rader.filter((r) => r.mRolle === ro));
p();
p("  etter spiller (pseudonym), minst 50 runder");
const perSpiller = new Map();
for (const r of rader) perSpiller.set(r.spiller, [...(perSpiller.get(r.spiller) ?? []), r]);
for (const [sp, u] of [...perSpiller].sort((a, b) => b[1].length - a[1].length)) if (u.length >= 50) rad(`  ${sp}`, u);
}
p();
const harP = rader.some((r) => Number.isFinite(r.dP));
const alle = klyngestat(rader, harP ? "dP" : "diff");
p("DOMMEN");
p("=".repeat(96));
p(`  ${harP ? "ΔP(seier)" : "rundepoeng"} ${f(alle.pt)} ± ${alle.se.toFixed(2).replace(".", ",")} ${harP ? "prosentpoeng" : "poeng"} per runde (z ${f(alle.z, 1)}, ${alle.n} runder i ${alle.kamper} kamper)`);
p(`  ${alle.z >= 2 ? "Boten henter signifikant MER ut av de samme kortene enn mennesket." : alle.z <= -2 ? "Mennesket henter signifikant mer ut av kortene enn boten." : "Ingen signifikant forskjell: PAR."}`);
p("  Forbehold: motstanderne i menneskets runde var botene som var ute DA; i duplikatet er alle fire --spek.");

mkdirSync(dirname(UT), { recursive: true });
writeFileSync(UT, linjer.join("\n") + "\n", "utf8");
console.log(linjer.join("\n"));
