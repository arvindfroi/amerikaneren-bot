/**
 * DEN PARREDE DIFFERANSEN MELLOM TO K1-ARMER — kanal 2 av mot paa.
 *
 *   node analyse/kanal2-parret.mjs --ut <rapport.txt> --uten <base>-k1-spek-s --med <base>-k1-spek-s
 *
 * ============ HVORFOR DEN MAA FINNES ====================================
 *
 * `duplikat-dom.mjs` doemmer EN arm mot mennesket. Den kan ikke svare paa
 * «hjalp kanal 2?», for til det trengs differansen MELLOM to armer, og hver
 * arms SE (~0,20 pp) er fem ganger stoerre enn bevegelsen vi ser etter (0,04).
 *
 * Men armene er PARRET: samme froebaand, samme menneskedata, samme kort, samme
 * poengtavler, rad for rad. Menneskesiden er BIT-IDENTISK. Da kansellerer hele
 * giv-effekten — «denne runden var lett for alle» — i differansen
 *
 *     d = bP(med) - bP(uten)     per runde
 *
 * og SE-en paa d er langt mindre enn SE-en paa hver arm. Det er noeyaktig samme
 * argument som `sdpar.ts` hviler paa: parrede differanser, ikke to uavhengige
 * snitt trukket fra hverandre. Aa lese «+1,03 mot +0,99» som en forbedring uten
 * denne regningen er aa sammenlikne to tall med hver sin stoerre stoey.
 *
 * SE: klyngebootstrap over KAMPER (`spill`), B = 20 000 — samme estimator og
 * samme B som `duplikat-dom.mjs`, saa tallene er sammenliknbare.
 *
 * Rapporten skrives av prosessen selv, aldri gjennom et roer.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { globSync } from "node:fs";

const argv = process.argv.slice(2);
const arg = (n) => {
  const i = argv.indexOf(n);
  if (i < 0) throw new Error(`mangler ${n}`);
  return argv[i + 1];
};
const UT = arg("--ut");

const les = (moenster) => {
  const rader = [];
  for (const f of globSync(moenster)) {
    for (const l of readFileSync(f, "utf8").split("\n")) if (l.trim()) rader.push(JSON.parse(l));
  }
  return rader;
};

const uten = les(arg("--uten"));
const med = les(arg("--med"));
if (uten.length === 0 || med.length === 0) throw new Error("tomme armer");

const noekkel = (r) => `${r.spill}|${r.spiller}|${r.runde}`;
const kartUten = new Map(uten.map((r) => [noekkel(r), r]));

/**
 * KONTROLLEN FOERST, OG DEN ER IKKE PYNT. Er menneskesiden ulik mellom armene,
 * er radene ikke parret, og hele regningen under er meningsloes. Da skal
 * rapporten si STUM, ikke gi et tall.
 */
let parret = 0;
let menneskeAvvik = 0;
let botAvvik = 0;
const d = [];
for (const m of med) {
  const u = kartUten.get(noekkel(m));
  if (u === undefined) continue;
  parret++;
  if (u.mP !== m.mP || u.menneske !== m.menneske) menneskeAvvik++;
  if (u.bP !== m.bP || u.bot !== m.bot) botAvvik++;
  d.push({
    spill: m.spill,
    dP: Number.isFinite(m.bP) && Number.isFinite(u.bP) ? m.bP - u.bP : NaN,
    poeng: m.bot - u.bot,
  });
}

const B = 20000;
function klyngestat(utvalg, felt) {
  const kl = new Map();
  for (const r of utvalg) kl.set(r.spill, [...(kl.get(r.spill) ?? []), r]);
  const K = [...kl.values()];
  const snitt = (u) => {
    let s = 0;
    let n = 0;
    for (const k of u) for (const r of k) { const v = r[felt]; if (!Number.isFinite(v)) continue; s += v; n++; }
    return n === 0 ? NaN : s / n;
  };
  const pt = snitt(K);
  let rng = 20260913;
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

const f = (x, k = 3) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(k).replace(".", ",");
const L = [];
const p = (s = "") => L.push(s);

p("KANAL 2 PAA MOT AV — PARRET DIFFERANSE PER RUNDE");
p("=".repeat(88));
p(`uten  ${arg("--uten")}`);
p(`med   ${arg("--med")}`);
p(`parrede rader ${parret} (uten ${uten.length}, med ${med.length})`);
p("SE: klyngebootstrap over kamper, B=20000 — samme estimator som duplikat-dom.mjs");
p();
p("KONTROLL");
p(`  menneskesiden identisk i de to armene: ${menneskeAvvik} avvik av ${parret}  [${menneskeAvvik === 0 ? "OK" : "IKKE PARRET - TALLET UNDER ER STUMT"}]`);
p(`  runder der BOTEN spilte ulikt:         ${botAvvik} av ${parret} (${((100 * botAvvik) / parret).toFixed(1).replace(".", ",")} %)`);
if (botAvvik === 0) {
  p("  BOTEN SPILTE IDENTISK I ALLE RUNDER — kanal 2 naadde ikke fram i denne maalingen.");
}
p();

const dP = klyngestat(d, "dP");
const poeng = klyngestat(d, "poeng");
p("DIFFERANSEN (positiv = kanal 2 hjelper)");
p(`  ΔP(seier)   ${f(dP.pt)} ± ${dP.se.toFixed(3).replace(".", ",")} pp per runde   z ${f(dP.z, 2)}   (${dP.n} runder i ${dP.kamper} kamper)`);
p(`  rundepoeng  ${f(poeng.pt)} ± ${poeng.se.toFixed(3).replace(".", ",")} per runde   z ${f(poeng.z, 2)}`);
p();

/** Bare rundene der boten faktisk spilte ulikt — der kanal 2 KAN ha virket. */
const ulike = d.filter((r) => r.dP !== 0);
if (ulike.length > 0) {
  const dPu = klyngestat(ulike, "dP");
  p("BARE RUNDER DER BOTEN SPILTE ULIKT (der kanal 2 kan ha virket)");
  p(`  ΔP(seier)   ${f(dPu.pt)} ± ${dPu.se.toFixed(3).replace(".", ",")} pp   z ${f(dPu.z, 2)}   (${dPu.n} runder i ${dPu.kamper} kamper)`);
  p();
}

p("DOMMEN");
p("=".repeat(88));
if (menneskeAvvik > 0) p("  STUM: armene er ikke parret.");
else if (Math.abs(dP.z) >= 2) p(`  ${dP.pt > 0 ? "Kanal 2 hjelper" : "Kanal 2 skader"} signifikant paa den parrede differansen (|z| >= 2).`);
else p("  INGEN MAALBAR EFFEKT paa K1: den parrede differansen er innenfor 2 SE av null.");
p("  Merk: dommen «ja/nei» i hver arm er en TERSKEL mot +1,0 pp. Ligger grunnlinjen");
p("  like under, snur den paa en bevegelse som er langt mindre enn sin egen stoey.");
p("  Det er denne parrede raden som skal leses, ikke om terskelen flippet.");

mkdirSync(dirname(UT), { recursive: true });
writeFileSync(UT, L.join("\n") + "\n", "utf8");
console.log(L.join("\n"));
