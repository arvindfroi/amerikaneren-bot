/**
 * MLB FASE 0a — DOMMEN: slår trohodet dagens tro, og hvor langt opp mot taket?
 *
 *   node analyse/mlb-k8-dom.mjs --ut analyse/mlb-k8-dom.txt analyse/mlb-k8-*.jsonl
 *
 * ================= RAPPORTEN SKRIVES AV PROSESSEN SELV ==================
 *
 * Ikke gjennom et stdout-rør. En flertimers måling som bare finnes i et rør er
 * borte i det øyeblikket noe klipper strømmen, og det har skjedd i dette
 * prosjektet før. `--ut` er derfor obligatorisk, og fila skrives med
 * `writeFileSync` her inne.
 *
 * ================= KLYNGEBOOTSTRAP OVER GIV =============================
 *
 * Radene er IKKE uavhengige: åtte rader deler samme giv og ser de samme
 * kortene i de samme hendene, bare fra ulikt stikk og sete. En SE regnet som om
 * radene var uavhengige ville vært for LITEN. Givet er derfor klyngen, og hver
 * bootstrap-trekning trekker HELE giv med tilbakelegging.
 *
 * ================= VEKTENE ==============================================
 *
 * Hver rad er allerede et snitt over `kort` skjulte kort. Skal totalen bli
 * log-tap per KORT, må radene vektes med `kort` — ellers teller en stilling med
 * 21 kort like mye som en med 24.
 *
 * ================= FORTEGNET, SAGT HØYT =================================
 *
 * Log-tap: LAVERE er bedre. `forbedring(a mot b) = b − a`, positiv = a er best.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const argv = process.argv.slice(2);
const iUt = argv.indexOf("--ut");
if (iUt < 0) {
  console.error("bruk: node analyse/mlb-k8-dom.mjs --ut <rapport.txt> <fil.jsonl> ...");
  process.exit(1);
}
const UT = argv[iUt + 1];
const filer = argv.filter((_, i) => i !== iUt && i !== iUt + 1);
if (filer.length === 0) {
  console.error("ingen jsonl-filer oppgitt");
  process.exit(1);
}

const rader = [];
for (const f of filer) {
  for (const linje of readFileSync(f, "utf8").split("\n")) {
    if (linje.trim() === "") continue;
    const r = JSON.parse(linje);
    // En rad med NaN i en arm ville forgiftet snittet i stillhet.
    rader.push(r);
  }
}
if (rader.length === 0) {
  console.error("tomme filer");
  process.exit(1);
}

/** Armene leses UT AV DATA, ikke fra en liste her — en ny arm skal ikke bli stille ignorert. */
const ARMER = Object.keys(rader[0])
  .filter((k) => k.endsWith("_treff"))
  .map((k) => k.slice(0, -"_treff".length));
const REFS = ["gulv", "gulvPluss"];
/** Frø-feltet finnes ved UTELUKKELSE: «frø» skrevet her kan bli en annen bytefølge. */
const KJENT = new Set([
  "stikk", "sete", "verdener", "kort", "erBv", ...REFS,
  ...ARMER, ...ARMER.map((a) => `${a}_treff`), ...ARMER.map((a) => `${a}_gulvbandt`),
]);
const FRØ = Object.keys(rader[0]).find((k) => !KJENT.has(k));
if (FRØ === undefined) throw new Error("fant ikke frø-feltet");

const ugyldige = rader.filter((r) => ARMER.some((a) => !Number.isFinite(r[a]))).length;
const gyldige = rader.filter((r) => ARMER.every((a) => Number.isFinite(r[a])));

const klynger = new Map();
for (const r of gyldige) {
  const nøkkel = String(r[FRØ]);
  if (!klynger.has(nøkkel)) klynger.set(nøkkel, []);
  klynger.get(nøkkel).push(r);
}
const KL = [...klynger.values()];

function vektet(utvalg, f) {
  let sum = 0;
  let vekt = 0;
  for (const kl of utvalg) {
    for (const r of kl) {
      const v = f(r);
      if (!Number.isFinite(v)) continue;
      sum += r.kort * v;
      vekt += r.kort;
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
    s += v;
    s2 += v * v;
  }
  const m = s / B;
  return Math.sqrt(Math.max(0, s2 / B - m * m));
}

const n3 = (x) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(4).replace(".", ",");
const n4 = (x) => x.toFixed(4).replace(".", ",");
const pst = (x) => x.toFixed(2).replace(".", ",");

const linjer = [];
const p = (s = "") => linjer.push(s);

const nivå = {};
for (const navn of [...REFS, ...ARMER]) nivå[navn] = vektet(KL, (r) => r[navn]);
const GULV = nivå["gulv"];
/** Andelen av veien gulv → tak (taket er klarsyn, log-tap 0). Formen §117 bruker. */
const andel = (v) => (100 * (GULV - v)) / GULV;

p("MLB FASE 0a — K8 MED TROHODET SOM EGEN ARM");
p("=".repeat(74));
p(`kilder        ${filer.join(" ")}`);
p(`stillinger    ${gyldige.length}   giv (klynger) ${KL.length}   skjulte kort ${gyldige.reduce((a, r) => a + r.kort, 0)}`);
p(`forkastet     ${ugyldige} rader med NaN i en arm`);
p(`verdener      V=${rader[0].verdener} for Monte-Carlo-armene; nettet har ingen V`);
p(`stikk         ${Math.min(...gyldige.map((r) => r.stikk))}–${Math.max(...gyldige.map((r) => r.stikk))}`);
p(`SE            klyngebootstrap over giv, B=${B}`);
p();

p("NIVÅ (log-tap per skjult kort; LAVERE er bedre)");
p("  arm             log-tap      SE        treff@1     % av veien gulv → tak");
for (const navn of [...REFS, ...ARMER]) {
  const se = bootstrapSE((u) => vektet(u, (r) => r[navn]));
  const treff = ARMER.includes(navn) ? vektet(KL, (r) => r[`${navn}_treff`]) : NaN;
  const tstr = Number.isFinite(treff) ? `${pst(100 * treff)} %` : "—";
  p(`  ${navn.padEnd(13)}  ${n4(nivå[navn])}   ±${n4(se)}   ${tstr.padStart(8)}      ${pst(andel(nivå[navn])).padStart(6)} %`);
}
p(`  ${"klarsyn".padEnd(13)}  ${n4(0)}   (tak)                     100,00 %`);
p();

function differanse(a, b) {
  const f = (u) => vektet(u, (r) => r[a] - r[b]);
  const pt = vektet(KL, (r) => r[a] - r[b]);
  const se = bootstrapSE(f);
  let bedre = 0;
  let tot = 0;
  for (const kl of KL) {
    let s = 0;
    let v = 0;
    for (const r of kl) { s += r.kort * (r[a] - r[b]); v += r.kort; }
    if (v === 0) continue;
    tot++;
    if (s / v < 0) bedre++;
  }
  return { pt, se, z: se > 0 ? pt / se : NaN, bedre, tot };
}

p("PARRET, SAMME STILLINGER (forbedring positiv = raden er BEST)");
p("  kontrast                     forbedring    SE        z        giv der best");
const mcArmer = ARMER.filter((a) => a !== "nett");
const kontraster = [];
for (const a of mcArmer) kontraster.push([`nett mot ${a}`, "nett", a]);
kontraster.push(["nett mot gulv+", "nett", "gulvPluss"]);
kontraster.push(["nett mot gulv", "nett", "gulv"]);
for (const a of mcArmer) kontraster.push([`${a} mot gulv+`, a, "gulvPluss"]);
for (const [navn, a, b] of kontraster) {
  const d = differanse(a, b);
  p(
    `  ${navn.padEnd(27)}  ${n3(-d.pt)}     ${n4(d.se)}   ${n3(-d.z).padStart(8)}   ` +
      `${d.bedre}/${d.tot} = ${pst((100 * d.bedre) / d.tot)} %`,
  );
}
p();

/**
 * REPLIKASJON I DISJUNKTE FRØBÅND. Vedleggsregel 1: aldri adoptere på støy.
 * Givene sorteres på frø og deles annenhver, så båndene deler ikke en eneste giv.
 */
const sortert = [...KL].sort((a, b) => Number(a[0][FRØ]) - Number(b[0][FRØ]));
const bånd = [sortert.filter((_, i) => i % 2 === 0), sortert.filter((_, i) => i % 2 === 1)];
p(`REPLIKASJON I DISJUNKTE FRØBÅND (${bånd[0].length} og ${bånd[1].length} giv, ingen overlapp)`);
p("  kontrast                     bånd A       bånd B       samlet");
for (const [navn, a, b] of kontraster) {
  const f = (r) => r[b] - r[a];
  p(
    `  ${navn.padEnd(27)}  ${n3(vektet(bånd[0], f)).padStart(9)}   ` +
      `${n3(vektet(bånd[1], f)).padStart(9)}   ${n3(vektet(KL, f)).padStart(9)}`,
  );
}
p();

p("PER STIKK (log-tap per kort)");
const stikk = [...new Set(gyldige.map((r) => r.stikk))].sort((a, b) => a - b);
p("  stikk    n   " + [...REFS, ...ARMER].map((a) => a.padStart(10)).join(""));
for (const st of stikk) {
  const u = KL.map((kl) => kl.filter((r) => r.stikk === st)).filter((kl) => kl.length > 0);
  const nn = u.reduce((a, kl) => a + kl.length, 0);
  const celler = [...REFS, ...ARMER].map((a) => n4(vektet(u, (r) => r[a])).padStart(10)).join("");
  p(`  ${String(st).padStart(5)} ${String(nn).padStart(5)}   ${celler}`);
}
p();

/**
 * BUDVINNERENS SETE FOR SEG. §117: kanal 2 er STRUKTURELT STUM der observatøren
 * selv er budvinner, fordi hun kjenner sitt eget vrak. Trohodet har ingen slik
 * stumhet — det får `VRAK_KJENT` som trekk — så de to setene skal skilles her
 * også, ellers fortynnes eller forsterkes en effekt uten at noen ser hvorfor.
 */
if (gyldige[0].erBv !== undefined) {
  p("SETE FOR SETE (budvinneren kjenner sitt eget vrak; kanal 2 er stum der)");
  p("  utvalg                        rader   " + [...REFS, ...ARMER].map((a) => a.padStart(10)).join(""));
  for (const [navn, f] of [
    ["observatør ≠ budvinner", (r) => r.erBv === 0],
    ["observatør = budvinner", (r) => r.erBv === 1],
  ]) {
    const u = KL.map((kl) => kl.filter(f)).filter((kl) => kl.length > 0);
    const nn = u.reduce((a, kl) => a + kl.length, 0);
    const celler = [...REFS, ...ARMER].map((a) => n4(vektet(u, (r) => r[a])).padStart(10)).join("");
    p(`  ${navn.padEnd(28)} ${String(nn).padStart(5)}   ${celler}`);
  }
  p();
}

p("EFFEKTIV SANNSYNLIGHET på riktig sete, exp(−log-tap)  (uvitenhet = 0,3333)");
for (const navn of [...REFS, ...ARMER]) p(`  ${navn.padEnd(13)}  ${n4(Math.exp(-nivå[navn]))}`);
p();

// ---- dommen ---------------------------------------------------------------
const besteMC = mcArmer.reduce((a, b) => (nivå[a] <= nivå[b] ? a : b));
const dMC = differanse("nett", besteMC);
const dGP = differanse("nett", "gulvPluss");
const repMC = [0, 1].map((i) => vektet(bånd[i], (r) => r[besteMC] - r["nett"]));
const repGP = [0, 1].map((i) => vektet(bånd[i], (r) => r["gulvPluss"] - r["nett"]));
const slårMC = -dMC.z >= 2 && repMC[0] > 0 && repMC[1] > 0;
const slårGP = -dGP.z >= 2 && repGP[0] > 0 && repGP[1] > 0;

p("DOMMEN");
p("=".repeat(74));
p(`  dagens beste Monte-Carlo-arm   ${besteMC}  (log-tap ${n4(nivå[besteMC])}, ${pst(andel(nivå[besteMC]))} % av veien)`);
p(`  gulv+ (bare renonser)          ${n4(nivå["gulvPluss"])}  (${pst(andel(nivå["gulvPluss"]))} % av veien)`);
p(`  MLB-trohodet                   ${n4(nivå["nett"])}  (${pst(andel(nivå["nett"]))} % av veien)`);
p();
p(`  nett slår ${besteMC.padEnd(20)} ${n3(-dMC.pt)} ± ${n4(dMC.se)}  (z = ${n3(-dMC.z)})`);
p(`    z ≥ 2 og samme fortegn i A og B?  ${slårMC ? "JA" : "NEI"}  (A ${n3(repMC[0])}, B ${n3(repMC[1])})`);
p(`  nett slår gulv+                ${n3(-dGP.pt)} ± ${n4(dGP.se)}  (z = ${n3(-dGP.z)})`);
p(`    z ≥ 2 og samme fortegn i A og B?  ${slårGP ? "JA" : "NEI"}  (A ${n3(repGP[0])}, B ${n3(repGP[1])})`);
p();
p(`  HYPOTESEN (docs/mlb.md fase 0a): et trohode trent veiledet på perfekte`);
p(`  etiketter slår dagens tro, og kanskje gulv+, uten noe søk.`);
p(`  SVAR: ${slårMC && slårGP ? "JA — begge" : slårMC ? "DELVIS — slår dagens tro, men ikke gulv+" : "NEI"}`);
p();
p("  LES DETTE FØR TALLENE BRUKES:");
p("   · Monte-Carlo-armene har et gulv på p (1/(2V)) som hindrer log(0). Det er");
p("     en HJELP de får og nettet ikke får. Skjevheten går i dagens tros favør.");
p("   · Stillingene er spilt av ADAMS_MAALT i alle fire seter. Fordelingen av");
p("     stillinger arver spilleren, og det gjør troens vanskelighetsgrad også.");
p("   · Dommen gjelder de stikkene som står i tabellen over, ikke runden i sin");
p("     helhet. Troen skal bli skarpere utover i runden.");

mkdirSync(dirname(UT), { recursive: true });
writeFileSync(UT, linjer.join("\n") + "\n", "utf8");
console.log(`Rapport skrevet: ${UT}  (${linjer.length} linjer)`);
