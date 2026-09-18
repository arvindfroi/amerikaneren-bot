/**
 * HVOR I RUNDEN kom gevinsten? (19. sep)
 *
 *   node examples/hvor-dekomp.mjs --navnA ny --probeA <probe.jsonl> --friA <fri.jsonl> \
 *                                 --navnB gml --probeB … --friB … [--kampsett alle|utvalg|holdout] [--ut fil.md]
 *
 * Metoden er `dekomp.md` §4: sonden (`dekomp-probe.ts`) går menneskets EGEN gjenskapte runde
 * steg for steg under lærertvang og finner rundens SKILLEPUNKT — første stilling bot og menneske
 * er uenige i. Hele rundens ΔP tilskrives det leddet («første avvik»-attribusjon). Bøttene er en
 * partisjon av rundene, så bidragene summerer eksakt til armens totale ΔP mot mennesket.
 *
 * NYTT HER: vi dekomponerer ikke én arm, men DIFFERANSEN mellom to armer.
 *   bidrag_X(bøtte) = (1/N) · Σ_{runder der X sitt skillepunkt er bøtta} ΔP_X
 *   gevinst(bøtte)  = bidrag_A(bøtte) − bidrag_B(bøtte)
 * Summen over bøttene er eksakt A − B. Merk at en runde kan ligge i ULIK bøtte i de to armene
 * (andelen skrives ut) — det er ikke en feil, det er nettopp det som skjer når budet endrer seg.
 *
 * SE: klyngebootstrap over kamp (B = 20 000), parret per runde før bootstrap — hele
 * menneskeleddet er identisk i begge armer og faller bort i differansen.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const v = (n, d) => {
  const i = argv.indexOf(n);
  return i < 0 ? d : argv[i + 1];
};
const UT = v("--ut", null);
const SETT = v("--kampsett", "alle");
const B = Number(v("--B", "20000"));

const les = (f) => {
  const ut = [];
  for (const l of readFileSync(f, "utf8").split(/\r?\n/)) if (l.trim()) ut.push(JSON.parse(l));
  return ut;
};
const nøkkel = (r) => `${r.spill}#${r.runde}`;

/** Kampsettdelingen, som batteriet. En kamp som mangler i lista er en stopp, ikke en stille utelatelse. */
const settAv = new Map();
for (const l of readFileSync("analyse/k1-kampsett.tsv", "utf8").split(/\r?\n/)) {
  if (!l.trim() || l.startsWith("#") || l.startsWith("spill\t")) continue;
  const [id, s] = l.split("\t");
  if (id && s) settAv.set(id.trim(), s.trim());
}

const armer = ["A", "B"].map((x) => ({
  navn: v(`--navn${x}`, x),
  probe: new Map(les(v(`--probe${x}`)).map((r) => [nøkkel(r), r])),
  fri: new Map(les(v(`--fri${x}`)).map((r) => [nøkkel(r), r])),
}));
const [A, Ar] = [armer[0], armer[1]];

/** Bare runder som finnes i ALLE fire filene, og i det valgte kampsettet. */
let felles = [...A.fri.keys()].filter(
  (k) => Ar.fri.has(k) && A.probe.has(k) && Ar.probe.has(k) && (SETT === "alle" || settAv.get(k.split("#")[0]) === SETT),
);
const manglerSett = [...new Set(felles.map((k) => k.split("#")[0]))].filter((id) => !settAv.has(id));
if (manglerSett.length > 0) throw new Error(`${manglerSett.length} kamp(er) mangler i analyse/k1-kampsett.tsv`);
const kampAv = (k) => k.split("#")[0];

function klynge(par) {
  const N = par.length;
  const m = par.reduce((a, p) => a + p.d, 0) / N;
  const kl = new Map();
  for (const p of par) {
    const x = kl.get(p.k) ?? { s: 0, n: 0 };
    x.s += p.d;
    x.n++;
    kl.set(p.k, x);
  }
  const liste = [...kl.values()];
  const Kn = liste.length;
  let rng = 20260919;
  const r = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const bs = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    let s = 0;
    for (let i = 0; i < Kn; i++) s += liste[Math.floor(r() * Kn)].s;
    bs[b] = s / N; // bidrag: teller delt på FAST N, så bøttene summerer til totalen
  }
  const mb = bs.reduce((a, x) => a + x, 0) / B;
  return { m, se: Math.sqrt(bs.reduce((a, x) => a + (x - mb) ** 2, 0) / (B - 1)), N, K: Kn };
}
/**
 * Bidraget til totalen: summen over bøttas runder delt på ALLE runder (fast nevner, så bøttene
 * summerer eksakt til totalen). `perKamp` er kampens bidrag til telleren — det er den som
 * resamples. Nevneren er ALLTID `felles.length`, aldri antall klynger: gjør man den feilen,
 * blåses SE-en opp med ~√(runder/kamper) ≈ 10×.
 */
function bidragAv(perKamp) {
  const N = felles.length;
  const liste = [...perKamp.values()];
  const Kn = liste.length;
  const m = liste.reduce((a, x) => a + x, 0) / N;
  let rng = 20260919;
  const r = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const bs = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    let s = 0;
    for (let i = 0; i < Kn; i++) s += liste[Math.floor(r() * Kn)];
    bs[b] = (s * (Kn / Kn)) / N;
  }
  const mb = bs.reduce((a, x) => a + x, 0) / B;
  return { m, se: Math.sqrt(bs.reduce((a, x) => a + (x - mb) ** 2, 0) / (B - 1)) };
}
/** Bøttebidraget for én arm. */
function bidrag(nøkler, verdi) {
  const kl = new Map();
  for (const k of felles) kl.set(kampAv(k), 0);
  for (const k of nøkler) kl.set(kampAv(k), kl.get(kampAv(k)) + verdi(k));
  return bidragAv(kl);
}

const BØTTER = ["BUD", "VRAK", "VELG", "STIKK1_4", "STIKK5_8", "STIKK9_12", "INGEN"];
const NAVN = {
  BUD: "budet",
  VRAK: "vraket",
  VELG: "trumf + etterlyst",
  STIKK1_4: "**kortspill stikk 1–4**",
  STIKK5_8: "kortspill stikk 5–8",
  STIKK9_12: "kortspill stikk 9–12 (sluttspill)",
  INGEN: "ingen uenighet i runden",
};
const dP = (arm, k) => arm.fri.get(k).bP - arm.fri.get(k).mP;
const f = (x, d = 3) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d).replace(".", ",");

let T = "";
const p = (s = "") => (T += s + "\n");
p(`# Hvor i runden kom gevinsten? — ${A.navn} mot ${Ar.navn}`);
p();
p(`Kampsett **${SETT}**: ${felles.length} parrede runder i ${new Set(felles.map(kampAv)).size} kamper.`);
p(`Skillepunkt fra \`dekomp-probe.ts\` (lærertvang på menneskets egen runde), ΔP fra duplikatet på`);
p(`batteriets bord. SE = klyngebootstrap over kamp, B = ${B}. Bøttene er en partisjon, så kolonnene summerer.`);
p();
const ulikBøtte = felles.filter((k) => A.probe.get(k).første !== Ar.probe.get(k).første).length;
p(`Skillepunktet ligger i ULIK bøtte i de to armene i **${((100 * ulikBøtte) / felles.length).toFixed(1)} %** av rundene.`);
p();
const totA = klynge(felles.map((k) => ({ k: kampAv(k), d: dP(A, k) })));
const totB = klynge(felles.map((k) => ({ k: kampAv(k), d: dP(Ar, k) })));
const totD = klynge(felles.map((k) => ({ k: kampAv(k), d: dP(A, k) - dP(Ar, k) })));
p(`| ledd de først skilte lag | runder ${A.navn} | bidrag ${A.navn} | runder ${Ar.navn} | bidrag ${Ar.navn} | **gevinst (${A.navn} − ${Ar.navn})** |`);
p(`|---|---|---|---|---|---|`);
let sum = 0;
for (const b of BØTTER) {
  const kA = felles.filter((k) => A.probe.get(k).første === b);
  const kB = felles.filter((k) => Ar.probe.get(k).første === b);
  if (kA.length === 0 && kB.length === 0) continue;
  const bA = bidrag(kA, (k) => dP(A, k));
  const bB = bidrag(kB, (k) => dP(Ar, k));
  // Gevinsten per bøtte er en differanse av to bidrag; bootstrappes samlet så SE-en er parret.
  const kl = new Map();
  for (const k of felles) kl.set(kampAv(k), 0);
  for (const k of kA) kl.set(kampAv(k), kl.get(kampAv(k)) + dP(A, k));
  for (const k of kB) kl.set(kampAv(k), kl.get(kampAv(k)) - dP(Ar, k));
  const g = bidragAv(kl);
  const gm = bA.m - bB.m;
  sum += gm;
  p(
    `| ${NAVN[b]} | ${kA.length} | ${f(bA.m)} ± ${f(bA.se).slice(1)} | ${kB.length} | ${f(bB.m)} ± ${f(bB.se).slice(1)} | **${f(gm)} ± ${f(g.se).slice(1)}** |`,
  );
}
p(`| **SUM** | ${felles.length} | **${f(totA.m)} ± ${f(totA.se).slice(1)}** | ${felles.length} | **${f(totB.m)} ± ${f(totB.se).slice(1)}** | **${f(sum)}** (parret: ${f(totD.m)} ± ${f(totD.se).slice(1)}, z ${(totD.m / totD.se).toFixed(2)}) |`);
p();

console.log(T);
if (UT) writeFileSync(UT, T);
if (!existsSync("analyse/k1-kampsett.tsv")) throw new Error("kampsettfila mangler");
