/**
 * KRYSSTABELLER OVER LEKKASJEMÅLINGEN – uten å kjøre MesterAI på nytt.
 *
 * `examples/mesterai-lekkasjer.ts` skriver hver PRISEDE stilling som en egen
 * post i `<ut>.json`, med situasjon, rolle, stikknummer, valøren som ble lagt,
 * valøren alternativet ville lagt, forgreningsgraden og selve Δ-en. Timene som
 * gikk med til å skaffe de postene er dyre; enhver ny oppdeling skal derfor
 * kunne regnes ut i ettertid, og det er det dette skriptet gjør.
 *
 * Det svarer på tre spørsmål den flate rangeringen ikke kan svare på:
 *
 *   1. KLUMPER LEKKASJENE SEG I BESTEMTE STIKK? MesterAI er tidsbudsjettert.
 *      Rekker søket ikke fram, skal tapet ligge der stillingen er tyngst.
 *   2. KLUMPER DE SEG I BESTEMTE KORTHØYDER? Er det honnørene den kaster bort,
 *      eller småkortene den ikke tør bruke?
 *   3. FORSVINNER DE MED MER SØK? To kjøringer sammenliknes side om side:
 *      tidsbudsjettert (`--ms`) mot låst verdensantall (`--verdener`). Krymper
 *      en lekkasje når søket blir større, er den et budsjettproblem og ikke en
 *      policyfeil – og da er den ikke verdt å bygge mot.
 *
 * KJØRING
 *   node examples/mesterai-lekkasjer-rapport.ts \
 *        --a analyse/mesterai-lekkasjer.json \
 *        --b analyse/mesterai-lekkasjer-laast.json \
 *        --ut analyse/mesterai-lekkasjer-kryss.txt
 *
 * `--b` er valgfri. Uten den skrives bare krysstabellene for `--a`.
 */

import { readFileSync, writeFileSync } from "node:fs";

interface Post {
  situasjon: string;
  utløst: boolean;
  rolle: string;
  stikk: number;
  runde: number;
  dPoeng: number;
  dStikk: number;
  nVerdener: number;
  valør: number;
  altValør: number;
  lovlige: number;
  merknad?: string;
}

interface Fil {
  runder: number;
  tidMs: number;
  låsteVerdener: number;
  sdVerdener: number;
  merke: string;
  anledninger: Record<string, number>;
  utløsninger: Record<string, number>;
  poster: Post[];
}

function tekstFlagg(navn: string, standard: string): string {
  const i = process.argv.indexOf(`--${navn}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : standard;
}

const stiA = tekstFlagg("a", "analyse/mesterai-lekkasjer.json");
const stiB = tekstFlagg("b", "");
const utSti = tekstFlagg("ut", "analyse/mesterai-lekkasjer-kryss.txt");

const les = (sti: string): Fil => JSON.parse(readFileSync(sti, "utf8")) as Fil;

const snitt = (v: readonly number[]): number => (v.length === 0 ? 0 : v.reduce((a, b) => a + b, 0) / v.length);
function standardfeil(v: readonly number[]): number {
  if (v.length < 2) return 0;
  const m = snitt(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1) / v.length);
}
const f = (x: number, d = 3): string => (Number.isFinite(x) ? x.toFixed(d) : "–");

const L: string[] = [];

// --- Krysstabellene ---------------------------------------------------------

/**
 * Én oppdeling av én situasjon. `bøtte` gir null for poster som ikke hører
 * hjemme i tabellen i det hele tatt (f.eks. valør −1 for bud og trumfvalg).
 */
function kryss(
  fil: Fil,
  situasjon: string,
  tittel: string,
  bøtte: (p: Post) => string | null,
  rekkefølge?: readonly string[],
): void {
  const rel = fil.poster.filter((p) => p.situasjon === situasjon && p.utløst);
  if (rel.length === 0) return;
  // EV per runde må hvile på den EKTE raten, ikke på hvor mange stillinger som
  // tilfeldigvis ble priset: `anger` teller hver kortbeslutning som en hendelse
  // og priser bare et utvalg. Andelen av de prisede postene i en bøtte er et
  // forventningsrett anslag på andelen av hendelsene, så:
  //     EV(bøtte) = hendelser/runde × bøttens andel × snitt-Δ i bøtta
  const hendelser = fil.utløsninger[situasjon] ?? rel.length;
  const evFaktor = (n: number): number => (hendelser / fil.runder) * (n / rel.length);
  const bøtter = new Map<string, Post[]>();
  for (const p of rel) {
    const b = bøtte(p);
    if (b === null) continue;
    bøtter.set(b, (bøtter.get(b) ?? []).concat(p));
  }
  if (bøtter.size === 0) return;
  const nøkler = rekkefølge
    ? rekkefølge.filter((k) => bøtter.has(k))
    : Array.from(bøtter.keys()).sort();

  L.push(`${situasjon} – ${tittel}`);
  L.push("-".repeat(96));
  L.push(
    "  bøtte".padEnd(24) +
      "n".padStart(7) +
      "andel".padStart(8) +
      "Δpoeng".padStart(11) +
      "±".padStart(9) +
      "Δstikk".padStart(10) +
      "±".padStart(9) +
      "EVpoeng/rd".padStart(12),
  );
  for (const k of nøkler) {
    const v = bøtter.get(k)!;
    const dP = v.map((p) => p.dPoeng);
    const dS = v.map((p) => p.dStikk);
    L.push(
      `  ${k}`.padEnd(24) +
        String(v.length).padStart(7) +
        `${((100 * v.length) / rel.length).toFixed(0)} %`.padStart(8) +
        f(snitt(dP)).padStart(11) +
        f(standardfeil(dP)).padStart(9) +
        f(snitt(dS)).padStart(10) +
        f(standardfeil(dS)).padStart(9) +
        f(evFaktor(v.length) * snitt(dP)).padStart(12) +
        (v.length < 50 ? "  ← USIKKER" : ""),
    );
  }
  L.push("");
}

const stikkBøtte = (p: Post): string | null =>
  p.stikk < 0 ? null : p.stikk <= 2 ? "stikk 1-3" : p.stikk <= 5 ? "stikk 4-6" : p.stikk <= 8 ? "stikk 7-9" : "stikk 10-12";
const STIKKREKKE = ["stikk 1-3", "stikk 4-6", "stikk 7-9", "stikk 10-12"];

const valørBøtte = (p: Post): string | null =>
  p.valør < 2 || p.valør > 14
    ? null
    : p.valør >= 13
      ? "honnør (K,A)"
      : p.valør >= 11
        ? "høy (J,D)"
        : p.valør >= 8
          ? "midt (8-10)"
          : "lav (2-7)";
const VALØRREKKE = ["lav (2-7)", "midt (8-10)", "høy (J,D)", "honnør (K,A)"];

const greinBøtte = (p: Post): string | null =>
  p.lovlige < 2 ? null : p.lovlige <= 3 ? "2-3 lovlige" : p.lovlige <= 6 ? "4-6 lovlige" : "7+ lovlige";
const GREINREKKE = ["2-3 lovlige", "4-6 lovlige", "7+ lovlige"];

const rolleBøtte = (p: Post): string | null => (p.rolle === "-" ? null : p.rolle);

// --- Side om side: tidsbudsjettert mot låst ---------------------------------

function sideOmSide(a: Fil, b: Fil): void {
  const navnA = a.låsteVerdener > 0 ? `${a.låsteVerdener} verdener` : `${a.tidMs} ms`;
  const navnB = b.låsteVerdener > 0 ? `${b.låsteVerdener} verdener` : `${b.tidMs} ms`;
  L.push("FORSVINNER LEKKASJEN MED MER SØK?");
  L.push("");
  L.push(`  A = ${navnA} (${a.runder} runder)   B = ${navnB} (${b.runder} runder)`);
  L.push("");
  L.push(
    "  Krymper både ANDELEN (hvor ofte den avviker) og Δ (hva avviket koster)");
  L.push("  når søket vokser, er lekkasjen et budsjettproblem. Står de stille, er");
  L.push("  det policyen, og da er den verdt å bygge mot.");
  L.push("");
  L.push("-".repeat(104));
  L.push(
    "  situasjon".padEnd(30) +
      "andel A".padStart(9) +
      "andel B".padStart(9) +
      "ΔpoengA".padStart(11) +
      "nA".padStart(6) +
      "ΔpoengB".padStart(11) +
      "nB".padStart(6) +
      "EVa/rd".padStart(10) +
      "EVb/rd".padStart(10),
  );
  const nøkler = Array.from(
    new Set([...Object.keys(a.utløsninger), ...Object.keys(b.utløsninger)]),
  ).sort();
  for (const k of nøkler) {
    const pa = a.poster.filter((p) => p.situasjon === k && p.utløst);
    const pb = b.poster.filter((p) => p.situasjon === k && p.utløst);
    if (pa.length === 0 && pb.length === 0) continue;
    const anlA = a.anledninger[k] ?? 0;
    const anlB = b.anledninger[k] ?? 0;
    const utlA = a.utløsninger[k] ?? 0;
    const utlB = b.utløsninger[k] ?? 0;
    const andel = (u: number, n: number): string => (n > 0 ? `${((100 * u) / n).toFixed(0)} %` : "–");
    L.push(
      `  ${k}`.padEnd(30) +
        andel(utlA, anlA).padStart(9) +
        andel(utlB, anlB).padStart(9) +
        f(snitt(pa.map((p) => p.dPoeng))).padStart(11) +
        String(pa.length).padStart(6) +
        f(snitt(pb.map((p) => p.dPoeng))).padStart(11) +
        String(pb.length).padStart(6) +
        f((utlA / a.runder) * snitt(pa.map((p) => p.dPoeng))).padStart(10) +
        f((utlB / b.runder) * snitt(pb.map((p) => p.dPoeng))).padStart(10) +
        (Math.min(pa.length, pb.length) < 50 ? "  ← USIKKER" : ""),
    );
  }
  L.push("");
}

// --- Hoved ------------------------------------------------------------------

const a = les(stiA);
L.push("=== KRYSSTABELLER OVER MESTERAIS LEKKASJER ===");
L.push("");
L.push(`Kilde A:  ${stiA}  (${a.runder} runder, ${a.låsteVerdener > 0 ? `${a.låsteVerdener} verdener låst` : `${a.tidMs} ms`})`);
if (a.merke) L.push(`Merke A:  ${a.merke}`);
if (stiB) {
  const bb = les(stiB);
  L.push(`Kilde B:  ${stiB}  (${bb.runder} runder, ${bb.låsteVerdener > 0 ? `${bb.låsteVerdener} verdener låst` : `${bb.tidMs} ms`})`);
  if (bb.merke) L.push(`Merke B:  ${bb.merke}`);
}
L.push(`Skrevet:  ${new Date().toISOString()}`);
L.push("");
L.push("Δ = SD-verdi(alternativ) − SD-verdi(MesterAIs valg). Positivt = tap.");
L.push("Bøtter med n < 50 er merket USIKKER.");
L.push("");

for (const sit of ["garantert-dyrt", "ikke-tatt-stikk", "renons-ikke-trumfet", "anger"]) {
  kryss(a, sit, "etter stikk", stikkBøtte, STIKKREKKE);
  kryss(a, sit, "etter valøren MesterAI la", valørBøtte, VALØRREKKE);
  kryss(a, sit, "etter forgreningsgrad (kompleksitet)", greinBøtte, GREINREKKE);
  kryss(a, sit, "etter rolle", rolleBøtte);
}

if (stiB) sideOmSide(a, les(stiB));

writeFileSync(utSti, L.join("\n") + "\n");
console.log(`→ ${utSti}`);
