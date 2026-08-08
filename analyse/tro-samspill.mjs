/**
 * K8-DOMMEN: slår troen gulv+, og gjør delene hverandre bedre?
 *
 *   node analyse/tro-samspill.mjs analyse/tro-g0.jsonl ... > analyse/tro-k8-dom.txt
 *
 * ================= HVORFOR KLYNGEBOOTSTRAP OG IKKE RÅ SE ================
 *
 * Radene er IKKE uavhengige. Fire rader deler samme giv (samme `frø`), og de
 * ser de samme kortene i de samme hendene — bare fra ulikt sete. En SE regnet
 * som om de 800 radene var uavhengige ville vært for LITEN, og en
 * superadditivitet ville sett skarpere ut enn den er.
 *
 * Derfor er givet klyngen: hver bootstrap-trekning trekker HELE giv med
 * tilbakelegging, og all korrelasjon innad i giv arves automatisk. Samme
 * begrunnelse som parring på giv i gate2.
 *
 * ================= VEKTENE ==============================================
 *
 * Hver rad er allerede et snitt over `kort` skjulte kort. Skal totalen bli
 * log-tap per KORT (som er måltallet), må radene vektes med `kort` — ellers
 * teller en stilling med 21 kort like mye som en med 24.
 *
 * ================= FORTEGNET, SAGT HØYT =================================
 *
 * Log-tap: LAVERE er bedre. Derfor er
 *
 *     gevinst(arm) = av − arm          positiv = armen hjelper
 *
 * og superadditiviteten oppgis i BEGGE former, fordi formelen fra oppgaven er
 * skrevet i tap:
 *
 *     S_tap = (bayes+g − av) − [(bayes − av) + (g − av)]  =  bg − b − g + av
 *
 * S_tap NEGATIV betyr at kombinasjonen er BEDRE enn summen av delene, altså
 * superadditiv. Det er lett å lese fortegnet feil, så begge står i utskriften.
 */

import { readFileSync } from "node:fs";

const filer = process.argv.slice(2);
if (filer.length === 0) {
  console.error("bruk: node analyse/tro-samspill.mjs <fil.jsonl> ...");
  process.exit(1);
}

const rader = [];
for (const f of filer) {
  for (const linje of readFileSync(f, "utf8").split("\n")) {
    if (linje.trim() === "") continue;
    rader.push(JSON.parse(linje));
  }
}

const ARMER = ["av", "regel", "bayes", "g", "bayes+g"];
const REFS = ["gulv", "gulvPluss"];
/**
 * Navnet på frø-feltet finnes ved UTELUKKELSE, ikke ved å skrive «frø».
 * Feltet heter `frø` i jsonl-en, og en æøå-streng skrevet i denne fila kan
 * bli en annen bytefølge enn den i datafila avhengig av hvordan begge ble
 * lagret. Alt annet i raden er kjent, så resten er frøet.
 */
const KJENT = new Set([
  "stikk", "sete", "verdener", "kort", ...REFS,
  ...ARMER, ...ARMER.map((a) => `${a}_treff`), ...ARMER.map((a) => `${a}_gulvbandt`),
]);
const FRØ = Object.keys(rader[0]).find((k) => !KJENT.has(k));
if (FRØ === undefined) throw new Error("fant ikke frø-feltet");

// ---- klyngene: én per giv --------------------------------------------------
const klynger = new Map();
for (const r of rader) {
  const nøkkel = String(r[FRØ]);
  if (!klynger.has(nøkkel)) klynger.set(nøkkel, []);
  klynger.get(nøkkel).push(r);
}
const KL = [...klynger.values()];

/**
 * Vektet snitt av en radfunksjon over et utvalg klynger.
 * Vekten er `kort`, så tallet er per SKJULT KORT, ikke per stilling.
 */
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

/** SE ved klyngebootstrap over giv. B trekninger, samme trekning for alt. */
const B = 20000;
function bootstrapSE(f, punkt) {
  let s = 0;
  let s2 = 0;
  let rng = 20250808;
  const neste = () => {
    // xorshift32, deterministisk så tallene kan reproduseres
    rng ^= rng << 13; rng >>>= 0;
    rng ^= rng >>> 17;
    rng ^= rng << 5; rng >>>= 0;
    return rng / 4294967296;
  };
  for (let b = 0; b < B; b++) {
    const utvalg = new Array(KL.length);
    for (let i = 0; i < KL.length; i++) utvalg[i] = KL[Math.floor(neste() * KL.length)];
    const v = f(utvalg);
    s += v;
    s2 += v * v;
  }
  const m = s / B;
  return Math.sqrt(Math.max(0, s2 / B - m * m));
}

const n3 = (x) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(4).replace(".", ",");
const n4 = (x) => x.toFixed(4).replace(".", ",");

const linjer = [];
const p = (s = "") => linjer.push(s);

p("K8 — TRONØYAKTIGHET, log-tap per skjult kort");
p("=".repeat(70));
p(`kilder      ${filer.join(" ")}`);
p(`stillinger  ${rader.length}   giv (klynger) ${KL.length}   skjulte kort ${rader.reduce((a, r) => a + r.kort, 0)}`);
p(`verdener    V=${rader[0].verdener}   fra stikk ${Math.min(...rader.map((r) => r.stikk))}`);
p(`SE          klyngebootstrap over giv, B=${B}`);
p();

// ---- nivåene ---------------------------------------------------------------
p("NIVÅ (lavere er bedre)");
p("  arm            log-tap      SE       treff@1");
const nivå = {};
for (const navn of [...REFS, ...ARMER]) {
  const f = (u) => vektet(u, (r) => r[navn]);
  const pt = vektet(KL, (r) => r[navn]);
  nivå[navn] = pt;
  const se = bootstrapSE(f, pt);
  const treff = ARMER.includes(navn) ? vektet(KL, (r) => r[`${navn}_treff`]) : NaN;
  const tstr = Number.isFinite(treff) ? (100 * treff).toFixed(2).replace(".", ",") + " %" : "—";
  p(`  ${navn.padEnd(12)}  ${n4(pt)}   ±${n4(se)}   ${tstr}`);
}
p(`  ${"klarsyn".padEnd(12)}  ${n4(0)}   (tak)`);
p();

// ---- parrede differanser ---------------------------------------------------
/** Parret differanse mellom to kolonner, med tegntest på GIV-nivå. */
function differanse(a, b) {
  const f = (u) => vektet(u, (r) => r[a] - r[b]);
  const pt = vektet(KL, (r) => r[a] - r[b]);
  const se = bootstrapSE(f, pt);
  let pos = 0;
  let tot = 0;
  for (const kl of KL) {
    let s = 0;
    let v = 0;
    for (const r of kl) { s += r.kort * (r[a] - r[b]); v += r.kort; }
    if (v === 0) continue;
    tot++;
    if (s / v < 0) pos++; // a BEDRE enn b (lavere tap)
  }
  return { pt, se, z: se > 0 ? pt / se : NaN, pos, tot };
}

p("MOT GULV+ (den ærlige grunnlinja: uniform over ikke-renons seter)");
p("  arm            forbedring    SE        z       giv der armen er best");
for (const navn of ARMER) {
  const d = differanse(navn, "gulvPluss");
  // forbedring = gulv+ − arm, positiv = bedre enn gulv+
  p(`  ${navn.padEnd(12)}  ${n3(-d.pt)}    ${n4(d.se)}   ${n3(-d.z).replace(",", ",")}  ${d.pos}/${d.tot} = ${((100 * d.pos) / d.tot).toFixed(1).replace(".", ",")} %`);
}
p();

p("MOT «av» (ingen slutning utover renonser og budrunden)");
p("  arm            gevinst       SE        z       giv der armen er best");
for (const navn of ARMER.filter((a) => a !== "av")) {
  const d = differanse(navn, "av");
  p(`  ${navn.padEnd(12)}  ${n3(-d.pt)}    ${n4(d.se)}   ${n3(-d.z)}  ${d.pos}/${d.tot} = ${((100 * d.pos) / d.tot).toFixed(1).replace(".", ",")} %`);
}
p();

// ---- superadditiviteten ----------------------------------------------------
/**
 * S_tap = bg − b − g + av, regnet PER RAD og så vektet — ikke som differanse
 * mellom fire aggregerte tall. Det er samme sak i punktestimatet, men bare den
 * parvise formen kan bootstrappes med korrelasjonen intakt.
 */
const sRad = (r) => r["bayes+g"] - r["bayes"] - r["g"] + r["av"];
const S = vektet(KL, sRad);
const S_se = bootstrapSE((u) => vektet(u, sRad), S);
let sPos = 0;
let sTot = 0;
for (const kl of KL) {
  let s = 0;
  let v = 0;
  for (const r of kl) { s += r.kort * sRad(r); v += r.kort; }
  if (v === 0) continue;
  sTot++;
  if (s / v < 0) sPos++;
}

p("SAMSPILLET — gjør A5 og A6 hverandre bedre?");
p("-".repeat(70));
p(`  gevinst(bayes)     = av − bayes      ${n3(nivå["av"] - nivå["bayes"])}`);
p(`  gevinst(g)         = av − g          ${n3(nivå["av"] - nivå["g"])}`);
p(`  sum av delene                        ${n3(2 * nivå["av"] - nivå["bayes"] - nivå["g"])}`);
p(`  gevinst(bayes+g)   = av − bayes+g    ${n3(nivå["av"] - nivå["bayes+g"])}`);
p();
p(`  S_tap = (bayes+g − av) − [(bayes − av) + (g − av)]`);
p(`        = ${n3(S)} ± ${n4(S_se)}   (z = ${n3(S / S_se)})`);
p(`  i gevinstform: superadditivitet = ${n3(-S)} ± ${n4(S_se)}`);
p(`  giv der kombinasjonen slår summen av delene: ${sPos}/${sTot} = ${((100 * sPos) / sTot).toFixed(1).replace(".", ",")} %`);
p();
p(`  LES FORTEGNET: S_tap NEGATIV = superadditiv (kombinasjonen bedre enn`);
p(`  summen av delene). S_tap POSITIV = delene konkurrerer om samme bevis.`);
p();

// ---- hvor kommer kunnskapen fra? -------------------------------------------
/**
 * HELE VEIEN FRA UVITENHET TIL BESTE ARM, DELT I TRE.
 *
 * Dette er tallet K8 faktisk står og faller på, og det forsvinner hvis man
 * bare leser armtabellen: nesten alt som skiller Adams fra ren uvitenhet er
 * RENONSER, som er en hard begrensning i trekningen og ikke en slutning i det
 * hele tatt. Å slå det naive gulvet beviser derfor ingenting — det var hele
 * grunnen til at gulv+ ble innført.
 */
const beste = ARMER.reduce((a, b) => (nivå[a] <= nivå[b] ? a : b));
const trinn = [
  ["renonser         (gulv → gulv+)", "gulv", "gulvPluss"],
  ["sampler+budrunde (gulv+ → av)", "gulvPluss", "av"],
  [`A1+A5+A6         (av → ${beste})`, "av", beste],
];
p("HVOR KOMMER TROENS KUNNSKAP FRA?");
p("  trinn                              vinning       SE       andel");
const totalt = nivå["gulv"] - nivå[beste];
for (const [navn, fra, til] of trinn) {
  const d = differanse(til, fra);
  p(`  ${navn.padEnd(33)} ${n3(-d.pt)}    ${n4(d.se)}   ${((100 * -d.pt) / totalt).toFixed(1).replace(".", ",")} %`);
}
p(`  ${"SUM (gulv → beste arm)".padEnd(33)} ${n3(totalt)}`);
p();

// ---- fyrer slutningene i det hele tatt? ------------------------------------
/**
 * VEDLEGGSREGEL 6: en test skal måle at noe FYRER, ikke at det finnes.
 *
 * En arm som måler null mot «av» kan være null av to helt ulike grunner:
 *
 *   DØD      slutningen endrer aldri troen — da er tallet et ikke-funn
 *   AKTIV    slutningen flytter troen mye, men i tilfeldig retning — da er
 *            tallet et FUNN, og et hardere et: kilden er støy, ikke bevis
 *
 * Kolonnene under skiller de to. `≠ av` teller stillinger der armen ga et
 * annet tap enn «av» i det hele tatt; kvartilene viser hvor langt den flyttet
 * troen når den flyttet den.
 */
p("FYRER SLUTNINGENE? (differanse mot «av», per stilling)");
p("  arm            ≠ av        q25       median      q75      |median|-flytt");
for (const navn of ARMER.filter((a) => a !== "av")) {
  const d = rader.map((r) => r[navn] - r["av"]).sort((a, b) => a - b);
  const ulik = d.filter((x) => Math.abs(x) > 1e-9).length;
  const abs = d.map(Math.abs).sort((a, b) => a - b);
  const q = (f) => d[Math.floor(d.length * f)];
  p(`  ${navn.padEnd(12)}  ${String(ulik).padStart(3)}/${d.length}   ${n3(q(0.25)).padStart(9)} ${n3(q(0.5)).padStart(9)} ${n3(q(0.75)).padStart(9)}   ${n4(abs[Math.floor(abs.length / 2)])}`);
}
p();

// ---- replikasjon i disjunkte givbånd ---------------------------------------
/**
 * VEDLEGGSREGEL 1: aldri adoptere på støy — replikert i disjunkte bånd.
 * Givene sorteres på frø og deles i to halvdeler som ikke deler en eneste giv.
 * Et funn som bare finnes i den ene halvdelen er ikke et funn.
 */
const sortert = [...KL].sort((a, b) => Number(a[0][FRØ]) - Number(b[0][FRØ]));
const halv = [sortert.filter((_, i) => i % 2 === 0), sortert.filter((_, i) => i % 2 === 1)];

function iBånd(bånd, f) { return vektet(bånd, f); }

p("REPLIKASJON I DISJUNKTE GIVBÅND (100 giv hver, ingen overlapp)");
p("  kontrast                    bånd A      bånd B      samlet");
const kontraster = [
  ["bayes+g − gulv+", (r) => r["bayes+g"] - r["gulvPluss"]],
  ["regel − av (A1)", (r) => r["regel"] - r["av"]],
  ["bayes − av (A5)", (r) => r["bayes"] - r["av"]],
  ["g − av (A6)", (r) => r["g"] - r["av"]],
  ["bayes+g − av", (r) => r["bayes+g"] - r["av"]],
  ["S_tap (samspill)", sRad],
];
for (const [navn, f] of kontraster) {
  p(`  ${navn.padEnd(26)} ${n3(iBånd(halv[0], f)).padStart(9)}   ${n3(iBånd(halv[1], f)).padStart(9)}   ${n3(vektet(KL, f)).padStart(9)}`);
}
p();

// ---- effektiv sannsynlighet ------------------------------------------------
/**
 * exp(−log-tap) er den GEOMETRISKE snittsannsynligheten armen ga det riktige
 * setet. Det er den samme informasjonen som log-tapet, men i en enhet som kan
 * leses direkte mot 1/3 = 0,3333.
 */
p("EFFEKTIV SANNSYNLIGHET på riktig sete, exp(−log-tap)");
for (const navn of [...REFS, ...ARMER]) {
  const e = Math.exp(-nivå[navn]);
  const t = ARMER.includes(navn) ? vektet(KL, (r) => r[`${navn}_treff`]) : NaN;
  p(`  ${navn.padEnd(12)}  ${n4(e)}${Number.isFinite(t) ? `   (topp-1 traff ${(100 * t).toFixed(2).replace(".", ",")} %)` : ""}`);
}
p();

// ---- per stikk -------------------------------------------------------------
p("PER STIKK (log-tap per kort)");
const stikk = [...new Set(rader.map((r) => r.stikk))].sort((a, b) => a - b);
p("  stikk   n   " + [...REFS, ...ARMER].map((a) => a.padStart(9)).join(""));
for (const st of stikk) {
  const u = KL.map((kl) => kl.filter((r) => r.stikk === st)).filter((kl) => kl.length > 0);
  const nn = u.reduce((a, kl) => a + kl.length, 0);
  const celler = [...REFS, ...ARMER].map((a) => n4(vektet(u, (r) => r[a])).padStart(9)).join("");
  p(`  ${String(st).padStart(5)} ${String(nn).padStart(4)}   ${celler}`);
}
p();

// ---- dommen ----------------------------------------------------------------
/**
 * DOMMEN SOM ET REGNESTYKKE, IKKE EN VURDERING.
 *
 * AdamsMax K8: «"Veldig høyt nivå" må bli et tall mellom GULV+ og TAK.» En
 * arm som er nominelt bedre enn gulv+ men innenfor to SE er ikke et tall
 * mellom gulv+ og taket — den er gulv+ med støy på. Terskelen her er derfor
 * z ≥ 2 mot gulv+, OG samme fortegn i begge disjunkte givbånd.
 */
const dBeste = differanse(beste, "gulvPluss");
const bandA = iBånd(halv[0], (r) => r[beste] - r["gulvPluss"]);
const bandB = iBånd(halv[1], (r) => r[beste] - r["gulvPluss"]);
const replikerer = bandA < 0 && bandB < 0;
const signifikant = -dBeste.z >= 2;

p("DOMMEN");
p("=".repeat(70));
p(`  beste arm                      ${beste}  (log-tap ${n4(nivå[beste])})`);
p(`  slår gulv+ med                 ${n3(-dBeste.pt)} ± ${n4(dBeste.se)}  (z = ${n3(-dBeste.z)})`);
p(`  krav: z ≥ 2                    ${signifikant ? "JA" : "NEI"}`);
p(`  krav: samme fortegn i A og B   ${replikerer ? "JA" : "NEI"}  (A ${n3(bandA)}, B ${n3(bandB)})`);
p(`  K8 INNFRIDD?                   ${signifikant && replikerer ? "JA" : "NEI"}`);
p();
p(`  superadditivitet A5×A6         S_tap ${n3(S)} ± ${n4(S_se)}  (z = ${n3(S / S_se)})`);
p(`  |z| ≥ 2?                       ${Math.abs(S / S_se) >= 2 ? "JA" : "NEI — innenfor støyen, verken forsterkning eller konkurranse er vist"}`);
p();
p("  DEKNING — les dette før tallene brukes:");
const stikkTell = new Map();
for (const r of rader) stikkTell.set(r.stikk, (stikkTell.get(r.stikk) ?? 0) + 1);
p(`    stikk i utvalget: ${[...stikkTell.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join("  ")}`);
p("    Dommen gjelder bare de stikkene som står over. Troen skal bli skarpere");
p("    utover i runden, så en måling som ligger i ett stikk måler ett stikk.");
if (rader[0][`${ARMER[0]}_gulvbandt`] !== undefined) {
  p(`    gulvet på p bandt: ${ARMER.map((a) => `${a} ${(100 * vektet(KL, (r) => r[`${a}_gulvbandt`])).toFixed(1).replace(".", ",")} %`).join("   ")}`);
  p("    Binder gulvet ofte, måler vi Monte-Carlo-oppløsning og ikke tro.");
} else {
  p("    gulvet på p: IKKE BOKFØRT — feltet kom til etter denne kjøringen.");
}
p();

console.log(linjer.join("\n"));
