/**
 * Rapporten til `examples/mesterai-fasegap.ts`: hvor i runden vinner MesterAI?
 *
 *   node examples/mesterai-fasegap-rapport.ts analyse/fasegap-*.jsonl \
 *        --ut analyse/mesterai-fasegap
 *
 * Leser rundeloggene (én linje per runde, flere skard kan oppgis) og skriver
 * `<ut>.txt` og `<ut>.json`.
 *
 * TRE SPØRSMÅL, TRE SEKSJONER
 *
 * 1) ROLLEDEKOMPONERING. Hver sete-runde har nøyaktig én rolle – spillefører,
 *    makker eller forsvarer – og motorens `delta` gir poengene per sete. Summen
 *    av rollebøttene ER derfor poengsummen, og oppdelingen av totalgapet er
 *    eksakt, ikke en tilnærming. Gapet i hver rolle splittes videre i
 *
 *      frekvenseffekt  (n_vår − n_mester) × mesters snitt
 *      kvalitetseffekt n_vår × (vårt snitt − mesters snitt)
 *
 *    Den første fanger «vi havner sjeldnere i rollen», den andre «vi gjør det
 *    dårligere når vi er der». Uten den splitten kan en rolle se dyr ut bare
 *    fordi den er sjelden.
 *
 * 2) BUDET MOT SD-ORAKELET. Ved hver budbeslutning har vi BÅDE MesterAIs og
 *    kandidatens svar på den identiske stillingen, pluss SD-orakelets bud for
 *    setet. Avviket splittes i over- og underbud, for det er sterkt
 *    asymmetrisk: målt tidligere koster ett stikk overbud 14,75 poeng, første
 *    stikk underbud 1,51 og videre underbud 2,10. En |avvik|-kolonne alene
 *    setter det forholdet til 1,0 og lyver.
 *
 * 3) FALTE KONTRAKTER, DELT I TO. Falt fordi budet var høyere enn hånden bar
 *    (bud > SD), eller fordi kortspillet ikke hentet hjem det hånden bar
 *    (bud ≤ SD)? De to krever motsatt fiks: den første er budgivning, den
 *    andre er spilleføring.
 *
 * DET AVGJØRENDE ENKELTTALLET står i seksjon 1B: `lagstikk − SD`. SD-orakelet
 * sier hva giva bærer for det setet. Differansen er dermed spilleføringens
 * bidrag med hånden holdt fast, og den kan sammenliknes direkte mellom sidene.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// --- Innlesing --------------------------------------------------------------

type Budverdi = number | "PASS" | "AMERIKANER" | "SOLO";

interface Budlogg {
  sete: number;
  side: "vaar" | "mester";
  faktisk: Budverdi;
  mester: Budverdi | null;
  kandidat: Budverdi | null;
  sd: number;
  nr: number;
}

interface Runde {
  kandidat: string;
  par: number;
  side: number;
  froe: number;
  mesterSeter: number[];
  ms: number | null;
  verdener: number | null;
  cpuLast: number;
  kjerner: number;
  rundeNr: number;
  budvinner: number;
  makker: number | null;
  budType: "tall" | "amerikaner" | "solo";
  bud: number | null;
  lagStikk: number;
  klart: boolean;
  delta: number[];
  stikkVunnet: number[];
  sd: number[];
  sdRaa: number[];
  sdStd: number;
  budlogg: Budlogg[];
  sekunder: number;
}

const filer: string[] = [];
let utBase = "analyse/mesterai-fasegap";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--ut") utBase = process.argv[++i] ?? utBase;
  else filer.push(a);
}
if (filer.length === 0) {
  console.error("Bruk: node examples/mesterai-fasegap-rapport.ts <fil.jsonl> [...] [--ut base]");
  process.exit(1);
}

const runder: Runde[] = [];
for (const f of filer) {
  for (const linje of readFileSync(f, "utf8").split("\n")) {
    if (linje.trim().length === 0) continue;
    runder.push(JSON.parse(linje) as Runde);
  }
}
if (runder.length === 0) {
  console.error("Ingen runder i inndataene.");
  process.exit(1);
}

// --- Småverktøy -------------------------------------------------------------

/** Grensen for når en rad har for få observasjoner til å bety noe. */
const TYNN_N = 50;

const sum = (x: readonly number[]): number => x.reduce((a, b) => a + b, 0);
const snitt = (x: readonly number[]): number => (x.length === 0 ? NaN : sum(x) / x.length);
function se(x: readonly number[]): number {
  if (x.length < 2) return NaN;
  const m = snitt(x);
  return Math.sqrt(sum(x.map((v) => (v - m) * (v - m))) / (x.length - 1) / x.length);
}
const p2 = (x: number): string => (Number.isFinite(x) ? (x >= 0 ? "+" : "") + x.toFixed(2) : "–");
const t2 = (x: number): string => (Number.isFinite(x) ? x.toFixed(2) : "–");
const pst = (a: number, b: number): string => (b === 0 ? "–" : `${Math.round((100 * a) / b)} %`);
const nMerke = (n: number): string => `${n}${n < TYNN_N ? "*" : ""}`;

/** De MÅLTE poengkostnadene ved å bomme på SD-budet. Sterkt asymmetriske. */
const KOST_OVER = 14.75;
const KOST_UNDER_1 = 1.51;
const KOST_UNDER_VIDERE = 2.1;
function budkostnad(avvik: number): number {
  if (avvik > 0) return KOST_OVER * avvik;
  if (avvik < 0) return KOST_UNDER_1 + KOST_UNDER_VIDERE * (-avvik - 1);
  return 0;
}

type Rolle = "spillefører" | "makker" | "forsvarer";
const ROLLER: readonly Rolle[] = ["spillefører", "makker", "forsvarer"];
type Side = "vaar" | "mester";
const SIDER: readonly Side[] = ["vaar", "mester"];

const erMester = (r: Runde, sete: number): boolean => r.mesterSeter.includes(sete);
const sidenTil = (r: Runde, sete: number): Side => (erMester(r, sete) ? "mester" : "vaar");
function rollenTil(r: Runde, sete: number): Rolle {
  if (sete === r.budvinner) return "spillefører";
  if (sete === r.makker) return "makker";
  return "forsvarer";
}
/** Setene på en side i denne runden. */
function seterPå(r: Runde, side: Side): number[] {
  const alle = [0, 1, 2, 3];
  return alle.filter((s) => sidenTil(r, s) === side);
}
const sidepoeng = (r: Runde, side: Side): number =>
  sum(seterPå(r, side).map((s) => r.delta[s] ?? 0));

const linjer: string[] = [];
const skriv = (s = ""): void => linjer.push(s);

// --- Oppsettet --------------------------------------------------------------

const kandidatNavn = [...new Set(runder.map((r) => r.kandidat))].join(", ");
const kamper = new Set(runder.map((r) => `${r.kandidat}|${r.par}|${r.side}`)).size;
const par = new Set(runder.map((r) => `${r.kandidat}|${r.par}`)).size;
const cpu = runder.map((r) => r.cpuLast).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
const cpuMedian = cpu.length === 0 ? NaN : cpu[Math.floor(cpu.length / 2)]!;
const oppsett =
  runder[0]!.verdener !== null
    ? `${runder[0]!.verdener} verdener per kortvalg (låst)`
    : `${runder[0]!.ms} ms per kortvalg`;

skriv("=== HVOR VINNER MESTERAI POENGENE? Fasegap per rolle ===");
skriv();
skriv(`Kandidat(er):      ${kandidatNavn}`);
skriv(`Runder:            ${runder.length}  (${kamper} kamper, ${par} speilede par)`);
skriv(`MesterAI:          ${oppsett}`);
skriv(`Kjerner:           ${runder[0]!.kjerner}`);
skriv(
  `CPU-last:          median ${(100 * cpuMedian).toFixed(0)} %` +
    ` (min ${(100 * (cpu[0] ?? NaN)).toFixed(0)} %, maks ${(100 * (cpu[cpu.length - 1] ?? NaN)).toFixed(0)} %)`,
);
skriv(`Kilder:            ${filer.join(", ")}`);
skriv(`Skrevet:           ${new Date().toISOString()}`);
skriv();
skriv("MASKINLASTEN ER IKKE PYNT. MesterAIs søk stopper når minVerdener er nådd");
skriv("OG tidsbudsjettet er brukt opp. På en lastet maskin rekker den færre");
skriv("verdener på de samme millisekundene og spiller SVAKERE. Alle tall her er");
skriv("derfor et NEDRE anslag på MesterAIs styrke – gapet mot oss er om noe");
skriv("STØRRE enn det som står, ikke mindre.");
skriv();
skriv(`En n merket «*» er under ${TYNN_N} observasjoner og skal leses som USIKKER.`);
skriv();

// --- Totalgapet -------------------------------------------------------------

const vårTotal = sum(runder.map((r) => sidepoeng(r, "vaar")));
const mesterTotal = sum(runder.map((r) => sidepoeng(r, "mester")));
const totalGap = vårTotal - mesterTotal;
const gapPerRunde = totalGap / runder.length;

// Parret over speilede par: kort- og posisjonsflaks nulles ut, og paret er
// uavhengighetsenheten – ikke enkeltrunden.
const perPar = new Map<string, number>();
for (const r of runder) {
  const n = `${r.kandidat}|${r.par}`;
  perPar.set(n, (perPar.get(n) ?? 0) + sidepoeng(r, "vaar") - sidepoeng(r, "mester"));
}
const parVerdier = [...perPar.values()];

skriv("TOTALGAPET");
skriv("-".repeat(78));
skriv(
  `  Vår side:      ${vårTotal} poeng over ${runder.length} runder` +
    ` = ${p2(vårTotal / runder.length)} per runde`,
);
skriv(
  `  MesterAI:      ${mesterTotal} poeng over ${runder.length} runder` +
    ` = ${p2(mesterTotal / runder.length)} per runde`,
);
skriv(`  GAP:           ${p2(gapPerRunde)} poeng per runde  (${p2(totalGap)} totalt)`);
// docs/moe2.md oppgir h2h-gapet som «MesterAI − kandidat, poeng/runde/SETE».
// Hver side har to seter, så den enheten er halvparten av raden over. Den
// står her for at tallene skal kunne legges ved siden av hverandre.
skriv(
  `  Samme, MesterAI − oss per runde per SETE: ${p2(-gapPerRunde / 2)}` +
    `   (enheten docs/moe2.md bruker for h2h)`,
);
skriv(
  `  Parret per par: ${p2(snitt(parVerdier))} ± ${t2(se(parVerdier))} poeng per par` +
    ` (n = ${nMerke(parVerdier.length)} par)`,
);
skriv();

// --- 0) Per kandidat --------------------------------------------------------
//
// Hovedtabellene slår kandidatene sammen, for spørsmålet er «hvor i runden
// ligger gapet», ikke «hvilket nett er best». Men et funn som bare gjelder ett
// nett er ikke et funn om metoden vår, så hodetallene står også per kandidat.

interface Kandidatrad {
  kandidat: string;
  runder: number;
  gapPerRunde: number;
  gapPerRundePerSete: number;
  foererAndelAvGap: number;
  innfriddVaar: number;
  innfriddMester: number;
  lagStikkMinusSdVaar: number;
  lagStikkMinusSdMester: number;
  budMinusSdVaar: number;
  budMinusSdMester: number;
}

function kandidatrad(navn: string, rs: Runde[]): Kandidatrad {
  const v = sum(rs.map((r) => sidepoeng(r, "vaar")));
  const m = sum(rs.map((r) => sidepoeng(r, "mester")));
  const førerGap = sum(
    rs.map((r) => (sidenTil(r, r.budvinner) === "vaar" ? 1 : -1) * (r.delta[r.budvinner] ?? 0)),
  );
  const perSide = (s: Side): { klart: number; n: number; lms: number[]; bms: number[] } => {
    const egne = rs.filter((r) => sidenTil(r, r.budvinner) === s);
    const lms: number[] = [];
    const bms: number[] = [];
    let klart = 0;
    for (const r of egne) {
      const sd = r.sd[r.budvinner];
      if (sd === undefined) continue;
      lms.push(r.lagStikk - sd);
      if (r.bud !== null) bms.push(r.bud - sd);
      if (r.klart) klart++;
    }
    return { klart, n: egne.length, lms, bms };
  };
  const pv = perSide("vaar");
  const pm = perSide("mester");
  return {
    kandidat: navn,
    runder: rs.length,
    gapPerRunde: (v - m) / rs.length,
    gapPerRundePerSete: (m - v) / rs.length / 2,
    foererAndelAvGap: v - m === 0 ? NaN : førerGap / (v - m),
    innfriddVaar: pv.n === 0 ? NaN : pv.klart / pv.n,
    innfriddMester: pm.n === 0 ? NaN : pm.klart / pm.n,
    lagStikkMinusSdVaar: snitt(pv.lms),
    lagStikkMinusSdMester: snitt(pm.lms),
    budMinusSdVaar: snitt(pv.bms),
    budMinusSdMester: snitt(pm.bms),
  };
}

const kandidatnavn = [...new Set(runder.map((r) => r.kandidat))];
const kandidatrader = kandidatnavn.map((k) =>
  kandidatrad(k, runder.filter((r) => r.kandidat === k)),
);

if (kandidatnavn.length > 1) {
  skriv();
  skriv("0) HODETALLENE PER KANDIDAT – gjelder funnet alle tre nettene?");
  skriv("-".repeat(114));
  skriv(
    "kandidat".padEnd(26) +
      "runder".padStart(8) +
      "gap/runde".padStart(11) +
      "M−oss /sete".padStart(13) +
      "fører% av gap".padStart(15) +
      "innfridd v/m".padStart(14) +
      "lagstikk−SD v/m".padStart(18),
  );
  skriv("-".repeat(114));
  for (const k of kandidatrader) {
    skriv(
      k.kandidat.replace("e1:e1-modell/", "").padEnd(26) +
        nMerke(k.runder).padStart(8) +
        p2(k.gapPerRunde).padStart(11) +
        p2(k.gapPerRundePerSete).padStart(13) +
        `${Math.round(100 * k.foererAndelAvGap)} %`.padStart(15) +
        `${Math.round(100 * k.innfriddVaar)}/${Math.round(100 * k.innfriddMester)} %`.padStart(14) +
        `${p2(k.lagStikkMinusSdVaar)} / ${p2(k.lagStikkMinusSdMester)}`.padStart(18),
    );
  }
  skriv();
  skriv("«fører% av gap» er hvor stor del av totalgapet som ligger i");
  skriv("spillefører-setets egne poeng. «M−oss /sete» er enheten docs/moe2.md");
  skriv("bruker for h2h-tallene.");
  skriv();
}

// --- 1) Rolledekomponeringen ------------------------------------------------

interface Bøtte {
  n: number;
  poeng: number;
  bud: number[];
  lagStikk: number[];
  lagStikkMinusSd: number[];
  klart: number;
  kontrakter: number;
  egneStikk: number[];
}
const nyBøtte = (): Bøtte => ({
  n: 0, poeng: 0, bud: [], lagStikk: [], lagStikkMinusSd: [],
  klart: 0, kontrakter: 0, egneStikk: [],
});

const bøtter: Record<Side, Record<Rolle, Bøtte>> = {
  vaar: { spillefører: nyBøtte(), makker: nyBøtte(), forsvarer: nyBøtte() },
  mester: { spillefører: nyBøtte(), makker: nyBøtte(), forsvarer: nyBøtte() },
};

for (const r of runder) {
  for (let sete = 0; sete < 4; sete++) {
    const b = bøtter[sidenTil(r, sete)][rollenTil(r, sete)];
    b.n++;
    b.poeng += r.delta[sete] ?? 0;
    b.egneStikk.push(r.stikkVunnet[sete] ?? 0);
    if (sete === r.budvinner) {
      b.kontrakter++;
      if (r.klart) b.klart++;
      if (r.bud !== null) b.bud.push(r.bud);
      b.lagStikk.push(r.lagStikk);
      const sd = r.sd[sete];
      if (sd !== undefined) b.lagStikkMinusSd.push(r.lagStikk - sd);
    }
  }
}

// Alle sete-runder på vår side, til andelskolonnen.
const våreSeterunder = sum(ROLLER.map((rl) => bøtter.vaar[rl].n));

skriv();
skriv("1A) ROLLEDEKOMPONERING – hvor i runden går poengene tapt?");
skriv("-".repeat(118));
skriv(
  "Hver sete-runde har nøyaktig ÉN rolle, og motorens delta gir poengene per");
skriv("sete. Summen av bøttene ER poengsummen; oppdelingen er eksakt.");
skriv();
skriv(
  "rolle".padEnd(14) +
    "n vår".padStart(8) +
    "andel".padStart(8) +
    "vår p/rd".padStart(10) +
    "n mester".padStart(10) +
    "mester p/rd".padStart(13) +
    "diff".padStart(9) +
    "gap-bidrag".padStart(12) +
    "per runde".padStart(11) +
    "% av gap".padStart(10),
);
skriv("-".repeat(118));

interface Rollerad {
  rolle: Rolle;
  nVaar: number;
  nMester: number;
  vaarSnitt: number;
  mesterSnitt: number;
  diff: number;
  bidrag: number;
  bidragPerRunde: number;
  andelAvGap: number;
  frekvenseffekt: number;
  kvalitetseffekt: number;
  usikker: boolean;
}
const rollerader: Rollerad[] = [];

for (const rl of ROLLER) {
  const v = bøtter.vaar[rl];
  const m = bøtter.mester[rl];
  const vs = v.n === 0 ? NaN : v.poeng / v.n;
  const ms = m.n === 0 ? NaN : m.poeng / m.n;
  const bidrag = v.poeng - m.poeng;
  const rad: Rollerad = {
    rolle: rl,
    nVaar: v.n,
    nMester: m.n,
    vaarSnitt: vs,
    mesterSnitt: ms,
    diff: vs - ms,
    bidrag,
    bidragPerRunde: bidrag / runder.length,
    andelAvGap: totalGap === 0 ? NaN : bidrag / totalGap,
    frekvenseffekt: (v.n - m.n) * ms,
    kvalitetseffekt: v.n * (vs - ms),
    usikker: Math.min(v.n, m.n) < TYNN_N,
  };
  rollerader.push(rad);
  skriv(
    (rl + (rad.usikker ? " *" : "")).padEnd(14) +
      String(v.n).padStart(8) +
      pst(v.n, våreSeterunder).padStart(8) +
      p2(vs).padStart(10) +
      String(m.n).padStart(10) +
      p2(ms).padStart(13) +
      p2(rad.diff).padStart(9) +
      p2(bidrag).padStart(12) +
      p2(rad.bidragPerRunde).padStart(11) +
      `${Math.round(100 * rad.andelAvGap)} %`.padStart(10),
  );
}
skriv("-".repeat(118));
skriv(
  "SUM".padEnd(14) +
    String(våreSeterunder).padStart(8) +
    "100 %".padStart(8) +
    p2(vårTotal / våreSeterunder).padStart(10) +
    String(sum(ROLLER.map((rl) => bøtter.mester[rl].n))).padStart(10) +
    p2(mesterTotal / sum(ROLLER.map((rl) => bøtter.mester[rl].n))).padStart(13) +
    "".padStart(9) +
    p2(totalGap).padStart(12) +
    p2(gapPerRunde).padStart(11) +
    "100 %".padStart(10),
);
skriv();
skriv("«gap-bidrag» er poeng, ikke snitt: vår sum minus mesters sum i rollen.");
skriv("«per runde» deler det på antall runder, så kolonnen summerer til totalgapet.");
skriv();
skriv("Frekvens eller kvalitet? Havner vi sjeldnere i rollen, eller gjør vi det");
skriv("dårligere når vi er der?");
skriv();
skriv(
  "rolle".padEnd(14) +
    "n vår − n mester".padStart(18) +
    "frekvenseffekt".padStart(16) +
    "kvalitetseffekt".padStart(17) +
    "sum".padStart(10),
);
skriv("-".repeat(75));
for (const rad of rollerader) {
  skriv(
    rad.rolle.padEnd(14) +
      String(rad.nVaar - rad.nMester).padStart(18) +
      p2(rad.frekvenseffekt).padStart(16) +
      p2(rad.kvalitetseffekt).padStart(17) +
      p2(rad.frekvenseffekt + rad.kvalitetseffekt).padStart(10),
  );
}
skriv();

// --- 1B) Spilleføreren i detalj ---------------------------------------------

skriv();
skriv("1B) SOM SPILLEFØRER – budet, stikkene, og hva hånden BAR");
skriv("-".repeat(104));
skriv("«lagstikk − SD» er det avgjørende tallet: SD-orakelet sier hva giva bærer");
skriv("for akkurat det setet, så differansen er spilleføringens bidrag med hånden");
skriv("holdt fast. Den kan sammenliknes rett mellom sidene.");
skriv();
skriv(
  "side".padEnd(12) +
    "kontrakter".padStart(12) +
    "innfridd".padStart(10) +
    "snittbud".padStart(10) +
    "SD-bud".padStart(9) +
    "bud − SD".padStart(10) +
    "lagstikk".padStart(10) +
    "lagstikk − SD".padStart(15) +
    "poeng/kontrakt".padStart(16),
);
skriv("-".repeat(104));

interface Førerrad {
  side: Side;
  kontrakter: number;
  innfridd: number;
  snittbud: number;
  sdBud: number;
  budMinusSd: number;
  lagStikk: number;
  lagStikkMinusSd: number;
  poengPerKontrakt: number;
}
const førerrader: Førerrad[] = [];
for (const s of SIDER) {
  const b = bøtter[s].spillefører;
  const sdBudene = runder
    .filter((r) => sidenTil(r, r.budvinner) === s)
    .map((r) => r.sd[r.budvinner])
    .filter((x): x is number => x !== undefined);
  const rad: Førerrad = {
    side: s,
    kontrakter: b.kontrakter,
    innfridd: b.klart,
    snittbud: snitt(b.bud),
    sdBud: snitt(sdBudene),
    budMinusSd: snitt(b.bud) - snitt(sdBudene),
    lagStikk: snitt(b.lagStikk),
    lagStikkMinusSd: snitt(b.lagStikkMinusSd),
    poengPerKontrakt: b.n === 0 ? NaN : b.poeng / b.n,
  };
  førerrader.push(rad);
  skriv(
    (s === "vaar" ? "vår side" : "MesterAI").padEnd(12) +
      nMerke(b.kontrakter).padStart(12) +
      pst(b.klart, b.kontrakter).padStart(10) +
      t2(rad.snittbud).padStart(10) +
      t2(rad.sdBud).padStart(9) +
      p2(rad.budMinusSd).padStart(10) +
      t2(rad.lagStikk).padStart(10) +
      p2(rad.lagStikkMinusSd).padStart(15) +
      p2(rad.poengPerKontrakt).padStart(16),
  );
}
const fv = førerrader.find((x) => x.side === "vaar");
const fm = førerrader.find((x) => x.side === "mester");
skriv("-".repeat(104));
if (fv !== undefined && fm !== undefined) {
  skriv(
    "differanse".padEnd(12) +
      "".padStart(12) +
      `${Math.round(100 * (fv.innfridd / Math.max(1, fv.kontrakter) - fm.innfridd / Math.max(1, fm.kontrakter)))} pp`.padStart(10) +
      p2(fv.snittbud - fm.snittbud).padStart(10) +
      p2(fv.sdBud - fm.sdBud).padStart(9) +
      p2(fv.budMinusSd - fm.budMinusSd).padStart(10) +
      p2(fv.lagStikk - fm.lagStikk).padStart(10) +
      p2(fv.lagStikkMinusSd - fm.lagStikkMinusSd).padStart(15) +
      p2(fv.poengPerKontrakt - fm.poengPerKontrakt).padStart(16),
  );
}
skriv();

// --- 2) Budet mot SD-orakelet ------------------------------------------------

interface Budstat {
  navn: string;
  n: number;
  pass: number;
  spesial: number;
  tall: number;
  avvik: number[];
  eksakt: number;
  over: number[];
  under: number[];
  kostnad: number;
}
const nyBudstat = (navn: string): Budstat => ({
  navn, n: 0, pass: 0, spesial: 0, tall: 0, avvik: [], eksakt: 0, over: [], under: [], kostnad: 0,
});

function tell(b: Budstat, v: Budverdi | null, sd: number): void {
  if (v === null) return;
  b.n++;
  if (v === "PASS") {
    b.pass++;
    return;
  }
  if (v === "AMERIKANER" || v === "SOLO") {
    b.spesial++;
    return;
  }
  b.tall++;
  const d = v - sd;
  b.avvik.push(d);
  if (d === 0) b.eksakt++;
  else if (d > 0) b.over.push(d);
  else b.under.push(-d);
  b.kostnad += budkostnad(d);
}

const alleBud = runder.flatMap((r) => r.budlogg ?? []);
const mesterSkygge = nyBudstat("MesterAI (skygge, alle stillinger)");
const kandSkygge = nyBudstat("kandidat (skygge, alle stillinger)");
const faktiskVaar = nyBudstat("vårt UTFØRTE bud");
const faktiskMester = nyBudstat("MesterAIs UTFØRTE bud");
for (const b of alleBud) {
  tell(mesterSkygge, b.mester, b.sd);
  tell(kandSkygge, b.kandidat, b.sd);
  if (b.side === "vaar") tell(faktiskVaar, b.faktisk, b.sd);
  else tell(faktiskMester, b.faktisk, b.sd);
}

skriv();
skriv("2A) BUDET MOT SD-ORAKELET");
skriv("-".repeat(122));
skriv("De to første radene er PARRET: begge svarte på nøyaktig de samme");
skriv("stillingene, én av dem ble utført. De to siste er budene som faktisk ble");
skriv("gitt, altså hver side i sine egne seter.");
skriv();
skriv("Avviket er sterkt asymmetrisk – målt tidligere koster ett stikk overbud");
skriv(`${t2(KOST_OVER)} poeng, første stikk underbud ${t2(KOST_UNDER_1)} og videre ${t2(KOST_UNDER_VIDERE)}.`);
skriv("«kostnad» bruker de tallene og er derfor i poeng, ikke i stikk.");
skriv();
skriv(
  "policy".padEnd(36) +
    "n tall".padStart(9) +
    "pass".padStart(8) +
    "avvik".padStart(9) +
    "eksakt".padStart(9) +
    "over n".padStart(9) +
    "over snitt".padStart(12) +
    "under n".padStart(9) +
    "under snitt".padStart(13) +
    "kostnad".padStart(10),
);
skriv("-".repeat(122));
const budstater = [mesterSkygge, kandSkygge, faktiskMester, faktiskVaar];
for (const b of budstater) {
  skriv(
    b.navn.padEnd(36) +
      nMerke(b.tall).padStart(9) +
      pst(b.pass, b.n).padStart(8) +
      p2(snitt(b.avvik)).padStart(9) +
      pst(b.eksakt, b.tall).padStart(9) +
      pst(b.over.length, b.tall).padStart(9) +
      t2(snitt(b.over)).padStart(12) +
      pst(b.under.length, b.tall).padStart(9) +
      t2(snitt(b.under)).padStart(13) +
      t2(b.tall === 0 ? NaN : b.kostnad / b.tall).padStart(10),
  );
}
skriv();
skriv("«avvik» er snitt(bud − SD): negativt = underbyr, positivt = overbyr.");
skriv("«over n»/«under n» er andelen av tallbudene, «snitt» er størrelsen i stikk.");
skriv();

// --- 2B) Uenigheten ---------------------------------------------------------

let beggeSvar = 0;
let beggeTall = 0;
let beggeTallLike = 0;
let beggeTallUlike = 0;
let vårNærmest = 0;
let mesterNærmest = 0;
let likeNær = 0;
const uenigVårAvvik: number[] = [];
const uenigMesterAvvik: number[] = [];
let vårPassMesterByr = 0;
let mesterPassVårByr = 0;
/** SD-nivået i de stillingene der bare den ene ville bydd. */
const sdVårPass: number[] = [];
const sdMesterPass: number[] = [];

for (const b of alleBud) {
  if (b.mester === null || b.kandidat === null) continue;
  beggeSvar++;
  const mn = typeof b.mester === "number";
  const kn = typeof b.kandidat === "number";
  if (mn && kn) {
    beggeTall++;
    if (b.mester === b.kandidat) {
      beggeTallLike++;
      continue;
    }
    beggeTallUlike++;
    const dv = (b.kandidat as number) - b.sd;
    const dm = (b.mester as number) - b.sd;
    uenigVårAvvik.push(dv);
    uenigMesterAvvik.push(dm);
    if (Math.abs(dv) < Math.abs(dm)) vårNærmest++;
    else if (Math.abs(dm) < Math.abs(dv)) mesterNærmest++;
    else likeNær++;
  } else if (mn && !kn) {
    vårPassMesterByr++;
    sdVårPass.push(b.sd);
  } else if (kn && !mn) {
    mesterPassVårByr++;
    sdMesterPass.push(b.sd);
  }
}

skriv();
skriv("2B) NÅR VI OG MESTERAI BYR ULIKT – hvem ligger nærmest SD?");
skriv("-".repeat(78));
skriv(`  Budbeslutninger der begge svarte:            ${beggeSvar}`);
skriv(`  … der BEGGE ga et tallbud:                   ${nMerke(beggeTall)}`);
skriv(`      derav samme tall:                        ${beggeTallLike}  (${pst(beggeTallLike, beggeTall)})`);
skriv(`      derav ULIKT tall:                        ${beggeTallUlike}  (${pst(beggeTallUlike, beggeTall)})`);
skriv(`  … der bare den ene ville bydd:               ${vårPassMesterByr + mesterPassVårByr}`);
skriv(`      vi passer, MesterAI byr:                 ${vårPassMesterByr}` +
  `   (SD i de stillingene: ${t2(snitt(sdVårPass))})`);
skriv(`      MesterAI passer, vi byr:                 ${mesterPassVårByr}` +
  `   (SD i de stillingene: ${t2(snitt(sdMesterPass))})`);
skriv();
if (beggeTallUlike === 0) {
  skriv("  DE NUMERISKE BUDENE ER IDENTISKE I HVER ENESTE STILLING.");
  skriv();
  skriv("  Det er ikke «nesten likt» – det er null avvik på alle");
  skriv(`  ${beggeTall} stillingene der begge ga et tall. Forklaringen er at`);
  skriv("  MesterAIs budgivning og vår er DET SAMME NETTET: appens mester-bot");
  skriv("  bruker NevroHjerne til budet, og både `nevro`, `sd-r1` og `sd-r2`");
  skriv("  (E1Agent) sender BUDRUNDE videre til den samme NevroAgent-en.");
  skriv("  Vi har altså trent kortspillet, ikke budet.");
  skriv();
  skriv("  KONSEKVENSEN FOR SPØRSMÅLET: budgivningen kan ikke forklare noe som");
  skriv("  helst av gapet. Det er ikke et statistisk «vi finner ingen forskjell»");
  skriv("  – det er en identitet. Alt som skiller sidene ligger et annet sted.");
  skriv();
  skriv("  Det ENESTE budet skiller på er når man passer i stedet for å by, og");
  skriv(`  der er utslaget lite: ${vårPassMesterByr} mot ${mesterPassVårByr} av ${beggeSvar}` +
    ` beslutninger, og`);
  skriv("  budrundene blir jevnt fordelt (se «n vår» mot «n mester» for");
  skriv("  spillefører i tabell 1A).");
} else {
  skriv(`  Vi nærmest SD:                    ${vårNærmest}  (${pst(vårNærmest, beggeTallUlike)})`);
  skriv(`  MesterAI nærmest SD:              ${mesterNærmest}  (${pst(mesterNærmest, beggeTallUlike)})`);
  skriv(`  Like nær (ulik retning):          ${likeNær}  (${pst(likeNær, beggeTallUlike)})`);
  skriv();
  skriv(`  Vårt avvik i uenighetene:         ${p2(snitt(uenigVårAvvik))} stikk` +
    `   (kostnad ${t2(snitt(uenigVårAvvik.map(budkostnad)))} poeng)`);
  skriv(`  MesterAIs avvik i de samme:       ${p2(snitt(uenigMesterAvvik))} stikk` +
    `   (kostnad ${t2(snitt(uenigMesterAvvik.map(budkostnad)))} poeng)`);
}
skriv();

// --- 2C) Tjener noen poeng på avviket? --------------------------------------

interface Avviksbøtte {
  navn: string;
  n: number;
  klart: number;
  lagStikk: number[];
  netto: number[];
}
const BØTTENAVN = ["≤ −2 (underbud)", "−1", "0 (treffer SD)", "+1", "≥ +2 (overbud)"];
function bøtteFor(d: number): number {
  if (d <= -2) return 0;
  if (d === -1) return 1;
  if (d === 0) return 2;
  if (d === 1) return 3;
  return 4;
}
const avviksbøtter: Record<Side, Avviksbøtte[]> = {
  vaar: BØTTENAVN.map((n) => ({ navn: n, n: 0, klart: 0, lagStikk: [], netto: [] })),
  mester: BØTTENAVN.map((n) => ({ navn: n, n: 0, klart: 0, lagStikk: [], netto: [] })),
};
for (const r of runder) {
  if (r.bud === null) continue;
  const sd = r.sd[r.budvinner];
  if (sd === undefined) continue;
  const s = sidenTil(r, r.budvinner);
  const b = avviksbøtter[s][bøtteFor(r.bud - sd)]!;
  b.n++;
  if (r.klart) b.klart++;
  b.lagStikk.push(r.lagStikk);
  // Nettopoeng for BUDVINNERENS side den runden – begge sider måles likt.
  b.netto.push(sidepoeng(r, s) - sidepoeng(r, s === "vaar" ? "mester" : "vaar"));
}

skriv();
skriv("2C) TJENER NOEN POENG PÅ AVVIKET? Runder gruppert på budvinnerens bud − SD");
skriv("-".repeat(96));
skriv("«netto» er budvinnersidens poeng minus motpartens, den runden. Positivt");
skriv("betyr at siden tjente på runden.");
skriv();
skriv(
  "budvinner".padEnd(12) +
    "bud − SD".padEnd(18) +
    "runder".padStart(9) +
    "andel".padStart(8) +
    "innfridd".padStart(10) +
    "lagstikk".padStart(10) +
    "netto/runde".padStart(13),
);
skriv("-".repeat(96));
for (const s of SIDER) {
  const tot = sum(avviksbøtter[s].map((b) => b.n));
  for (const b of avviksbøtter[s]) {
    if (b.n === 0) continue;
    skriv(
      (s === "vaar" ? "vår side" : "MesterAI").padEnd(12) +
        b.navn.padEnd(18) +
        nMerke(b.n).padStart(9) +
        pst(b.n, tot).padStart(8) +
        pst(b.klart, b.n).padStart(10) +
        t2(snitt(b.lagStikk)).padStart(10) +
        p2(snitt(b.netto)).padStart(13),
    );
  }
  skriv();
}

// --- 3) Falte kontrakter, delt i to -----------------------------------------

interface Faltbøtte {
  falt: number;
  forHøytBud: number;
  ikkeHentetHjem: number;
  manglendeStikkOptimistisk: number[];
  manglendeStikkSpill: number[];
}
const nyFalt = (): Faltbøtte => ({
  falt: 0, forHøytBud: 0, ikkeHentetHjem: 0,
  manglendeStikkOptimistisk: [], manglendeStikkSpill: [],
});
const falt: Record<Side, Faltbøtte> = { vaar: nyFalt(), mester: nyFalt() };
const kontrakterPerSide: Record<Side, number> = { vaar: 0, mester: 0 };

for (const r of runder) {
  if (r.bud === null) continue;
  const sd = r.sd[r.budvinner];
  if (sd === undefined) continue;
  const s = sidenTil(r, r.budvinner);
  kontrakterPerSide[s]++;
  if (r.klart) continue;
  const f = falt[s];
  f.falt++;
  if (r.bud > sd) {
    f.forHøytBud++;
    f.manglendeStikkOptimistisk.push(r.bud - r.lagStikk);
  } else {
    f.ikkeHentetHjem++;
    f.manglendeStikkSpill.push(r.bud - r.lagStikk);
  }
}

skriv();
skriv("3) FALTE KONTRAKTER, DELT I TO");
skriv("-".repeat(104));
skriv("Falt fordi budet var HØYERE enn hånden bar (bud > SD), eller fordi");
skriv("kortspillet ikke hentet hjem det hånden BAR (bud ≤ SD)? De to krever");
skriv("motsatt fiks: den første er budgivning, den andre er spilleføring.");
skriv();
skriv(
  "side".padEnd(12) +
    "kontrakter".padStart(12) +
    "falt".padStart(8) +
    "fallrate".padStart(10) +
    "bud > SD".padStart(10) +
    "andel".padStart(8) +
    "bud ≤ SD".padStart(10) +
    "andel".padStart(8) +
    "mangler (spill)".padStart(17),
);
skriv("-".repeat(104));
for (const s of SIDER) {
  const f = falt[s];
  skriv(
    (s === "vaar" ? "vår side" : "MesterAI").padEnd(12) +
      nMerke(kontrakterPerSide[s]).padStart(12) +
      String(f.falt).padStart(8) +
      pst(f.falt, kontrakterPerSide[s]).padStart(10) +
      String(f.forHøytBud).padStart(10) +
      pst(f.forHøytBud, f.falt).padStart(8) +
      String(f.ikkeHentetHjem).padStart(10) +
      pst(f.ikkeHentetHjem, f.falt).padStart(8) +
      t2(snitt(f.manglendeStikkSpill)).padStart(17),
  );
}
skriv();
skriv("«mangler (spill)» er bud − lagstikk i de rundene der SD sa budet var");
skriv("innenfor rekkevidde, altså hvor mange stikk kortspillet kom til kort.");
skriv();
skriv("Uttrykt per RUNDE, så de to fallgrunnene kan veies mot hverandre:");
skriv();
skriv(
  "side".padEnd(12) +
    "falt/runde".padStart(12) +
    "  derav bud > SD".padStart(18) +
    "  derav bud ≤ SD".padStart(18),
);
for (const s of SIDER) {
  const f = falt[s];
  skriv(
    (s === "vaar" ? "vår side" : "MesterAI").padEnd(12) +
      t2(f.falt / runder.length).padStart(12) +
      t2(f.forHøytBud / runder.length).padStart(18) +
      t2(f.ikkeHentetHjem / runder.length).padStart(18),
  );
}
skriv();
// Det handlingsrettede tallet er ikke fallraten, men MERfallet: hvor mange
// flere kontrakter vi mister enn MesterAI, og hvilken av de to grunnene det
// ekstra fallet fordeler seg på.
const merFall = (falt.vaar.falt - falt.mester.falt) / runder.length;
const merBud = (falt.vaar.forHøytBud - falt.mester.forHøytBud) / runder.length;
const merSpill = (falt.vaar.ikkeHentetHjem - falt.mester.ikkeHentetHjem) / runder.length;
skriv("MERFALLET – der hele svaret ligger:");
skriv(
  `  Vi mister ${t2(merFall)} flere kontrakter per runde enn MesterAI.`,
);
skriv(
  `  Av det er ${t2(merBud)} for høyt bud (${pst(Math.round(1000 * merBud), Math.round(1000 * merFall))})` +
    ` og ${t2(merSpill)} kortspill (${pst(Math.round(1000 * merSpill), Math.round(1000 * merFall))}).`,
);
skriv(
  `  I rene tall: ${falt.vaar.forHøytBud} mot ${falt.mester.forHøytBud} fall på for høyt bud – nesten likt –` +
    ` mot ${falt.vaar.ikkeHentetHjem} mot ${falt.mester.ikkeHentetHjem} fall på kortspill.`,
);
skriv();

// --- Konklusjonen -----------------------------------------------------------

skriv();
skriv("=== SVARET, i tre tall ===");
skriv();
const verst = rollerader
  .filter((r) => Number.isFinite(r.bidragPerRunde))
  .sort((a, b) => a.bidragPerRunde - b.bidragPerRunde)[0];
if (verst !== undefined) {
  skriv(
    `1) Rollen som koster mest: ${verst.rolle.toUpperCase()} – ${p2(verst.bidragPerRunde)} poeng` +
      ` per runde, ${Math.round(100 * verst.andelAvGap)} % av totalgapet,` +
      ` på ${pst(verst.nVaar, våreSeterunder)} av sete-rundene.` +
      (verst.usikker ? "  ← USIKKER (n < 50)" : ""),
  );
  skriv(
    `   Av det er ${p2(verst.kvalitetseffekt)} kvalitet og ${p2(verst.frekvenseffekt)} frekvens.`,
  );
}
skriv();
skriv(
  `2) Budet: vi avviker ${p2(snitt(kandSkygge.avvik))} stikk fra SD, MesterAI ` +
    `${p2(snitt(mesterSkygge.avvik))} – på de SAMME stillingene.` +
    ` Vi treffer eksakt ${pst(kandSkygge.eksakt, kandSkygge.tall)}, MesterAI ` +
    `${pst(mesterSkygge.eksakt, mesterSkygge.tall)}.`,
);
if (beggeTallUlike === 0) {
  skriv(
    `   Sterkere enn som så: alle ${beggeTall} numeriske bud er IDENTISKE. Budet` +
      ` kan ikke forklare gapet – det er samme nett på begge sider.`,
  );
} else {
  skriv(
    `   I uenighetene ligger vi nærmest SD i ${pst(vårNærmest, beggeTallUlike)} av tilfellene,` +
      ` MesterAI i ${pst(mesterNærmest, beggeTallUlike)}.`,
  );
}
skriv();
if (fv !== undefined && fm !== undefined) {
  skriv(
    `3) Spilleføringen: som spillefører henter vi ${p2(fv.lagStikkMinusSd)} stikk mot SD,` +
      ` MesterAI ${p2(fm.lagStikkMinusSd)} – en forskjell på ` +
      `${p2(fv.lagStikkMinusSd - fm.lagStikkMinusSd)} stikk på samme orakelgrunnlag.`,
  );
  skriv(
    `   Innfridd: ${pst(fv.innfridd, fv.kontrakter)} mot ${pst(fm.innfridd, fm.kontrakter)}.`,
  );
}
skriv();

// --- Skriving ---------------------------------------------------------------

const txt = linjer.join("\n") + "\n";
mkdirSync(dirname(utBase), { recursive: true });
writeFileSync(`${utBase}.txt`, txt);
writeFileSync(
  `${utBase}.json`,
  JSON.stringify(
    {
      tid: new Date().toISOString(),
      kilder: filer,
      kandidat: kandidatNavn,
      runder: runder.length,
      kamper,
      par,
      mesterOppsett: runder[0]!.verdener !== null ? { verdener: runder[0]!.verdener } : { ms: runder[0]!.ms },
      maskinlast: {
        kjerner: runder[0]!.kjerner,
        cpuMedian,
        cpuMin: cpu[0] ?? null,
        cpuMaks: cpu[cpu.length - 1] ?? null,
        merknad:
          "MesterAI er tidsbudsjettert; høy last gir færre verdener per kortvalg " +
          "og dermed et NEDRE anslag på MesterAIs styrke.",
      },
      tynnN: TYNN_N,
      total: {
        vaarPoeng: vårTotal,
        mesterPoeng: mesterTotal,
        gap: totalGap,
        gapPerRunde,
        parretSnitt: snitt(parVerdier),
        parretSe: se(parVerdier),
        antallPar: parVerdier.length,
      },
      perKandidat: kandidatrader,
      roller: rollerader,
      spillefoerer: førerrader,
      bud: budstater.map((b) => ({
        navn: b.navn,
        n: b.n,
        tall: b.tall,
        passandel: b.n === 0 ? null : b.pass / b.n,
        snittavvik: snitt(b.avvik),
        eksaktandel: b.tall === 0 ? null : b.eksakt / b.tall,
        overandel: b.tall === 0 ? null : b.over.length / b.tall,
        overSnitt: snitt(b.over),
        underandel: b.tall === 0 ? null : b.under.length / b.tall,
        underSnitt: snitt(b.under),
        kostnadPerBud: b.tall === 0 ? null : b.kostnad / b.tall,
      })),
      uenighet: {
        beggeSvar,
        beggeTall,
        beggeTallLike,
        beggeTallUlike,
        vaarNaermest: vårNærmest,
        mesterNaermest: mesterNærmest,
        likeNaer: likeNær,
        vaarAvvik: snitt(uenigVårAvvik),
        mesterAvvik: snitt(uenigMesterAvvik),
        vaarKostnad: snitt(uenigVårAvvik.map(budkostnad)),
        mesterKostnad: snitt(uenigMesterAvvik.map(budkostnad)),
        vaarPassMesterByr: vårPassMesterByr,
        mesterPassVaarByr: mesterPassVårByr,
      },
      avviksboetter: SIDER.map((s) => ({
        side: s,
        boetter: avviksbøtter[s].map((b) => ({
          navn: b.navn,
          n: b.n,
          innfriddAndel: b.n === 0 ? null : b.klart / b.n,
          lagStikk: snitt(b.lagStikk),
          nettoPerRunde: snitt(b.netto),
        })),
      })),
      falteKontrakter: SIDER.map((s) => ({
        side: s,
        kontrakter: kontrakterPerSide[s],
        falt: falt[s].falt,
        forHoeytBud: falt[s].forHøytBud,
        ikkeHentetHjem: falt[s].ikkeHentetHjem,
        manglendeStikkSpill: snitt(falt[s].manglendeStikkSpill),
        manglendeStikkOptimistisk: snitt(falt[s].manglendeStikkOptimistisk),
      })),
    },
    null,
    2,
  ) + "\n",
);

console.log(txt);
console.log(`→ ${utBase}.txt / ${utBase}.json`);
