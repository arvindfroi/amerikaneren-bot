/**
 * KOSTER DET Å SPILLE TRUMF UT? – med forvekslingene kontrollert.
 *
 *   node examples/trumfutspill.ts analyse/mine-spillefoerer-0.jsonl,...
 *
 * Regelgravingen fant at «trumf ut med ≥3 trumf fortsatt ute» har 1,04 anger
 * mot 0,42 i grunnlinjen. Det tallet er IKKE til å stole på som det står, av
 * to grunner som begge trekker samme vei:
 *
 *   1. STIKKNUMMER. «≥3 trumf ute» skjer tidlig, og tidlige stikk har høyere
 *      anger uansett hva man spiller – 74–81 % av tapet ligger i stikk 3–7.
 *   2. ANTALL VALG. Å ha mange lovlige kort gir både flere måter å bomme på
 *      og rikere stillinger. «mange valg (≥5)» alene måler +0,40.
 *
 * Begge er egenskaper ved STILLINGEN, ikke ved valget. Sammenligner man
 * trumfutspill mot alt annet uten å kontrollere for dem, måler man at
 * trumfutspill skjer i vanskelige stillinger – ikke at det er feil.
 *
 * DENNE SAMMENLIGNER DERFOR BARE INNENFOR SAMME CELLE: samme stikknummer,
 * samme antall lovlige kort, og bare utspill (pos 0). Da er de to gruppene
 * stilt likt på alt vi vet skiller dem, og differansen som blir igjen er
 * knyttet til selve valget.
 *
 * Cellene vektes etter hvor mange trumfutspill de inneholder, så tallet
 * svarer på «hva koster et trumfutspill i de stillingene de faktisk
 * forekommer i» – ikke et urealistisk snitt over celler vi aldri møter.
 */

import { readFileSync, writeFileSync } from "node:fs";

interface Rad {
  stikk: number;
  valg: number;
  anger: number;
  pos: number;
  vårTrumf: boolean;
  besteTrumf: boolean;
  trumfIgjenUte: number;
  harHøyesteTrumf: boolean;
  egneTrumf: number;
}

const filer = (process.argv[2] ?? "").split(",").filter((x) => x !== "");
let utFil = "analyse/trumfutspill.txt";
let merke = "";
for (let i = 3; i < process.argv.length; i++) {
  if (process.argv[i] === "--ut") utFil = process.argv[++i] ?? utFil;
  else if (process.argv[i] === "--merke") merke = process.argv[++i] ?? "";
}
const rader: Rad[] = [];
for (const f of filer) {
  for (const l of readFileSync(f, "utf8").trim().split("\n")) {
    if (l.trim() !== "") rader.push(JSON.parse(l) as Rad);
  }
}

const snitt = (v: readonly number[]): number => (v.length === 0 ? 0 : v.reduce((a, x) => a + x, 0) / v.length);
function varians(v: readonly number[]): number {
  if (v.length < 2) return 0;
  const m = snitt(v);
  let s = 0;
  for (const x of v) s += (x - m) * (x - m);
  return s / (v.length - 1);
}

/** Stratifisert differanse: trumf ut mot annet ut, innen (stikk, antall valg). */
function stratifisert(utvalg: readonly Rad[], filter: (r: Rad) => boolean): {
  n: number;
  celler: number;
  d: number;
  se: number;
} {
  const celle = new Map<string, { a: number[]; b: number[] }>();
  for (const r of utvalg) {
    if (r.pos !== 0) continue;
    const k = `${r.stikk}|${Math.min(r.valg, 8)}`;
    const c = celle.get(k) ?? { a: [], b: [] };
    if (r.vårTrumf && filter(r)) c.a.push(r.anger);
    else if (!r.vårTrumf) c.b.push(r.anger);
    celle.set(k, c);
  }
  let vekt = 0;
  let sum = 0;
  let varSum = 0;
  let celler = 0;
  let n = 0;
  for (const c of celle.values()) {
    // En celle uten BEGGE gruppene sier ingenting om differansen.
    if (c.a.length === 0 || c.b.length === 0) continue;
    const w = c.a.length; // vekt = hvor ofte trumfutspillet faktisk skjer
    sum += w * (snitt(c.a) - snitt(c.b));
    varSum += w * w * (varians(c.a) / c.a.length + varians(c.b) / c.b.length);
    vekt += w;
    celler++;
    n += c.a.length;
  }
  return vekt === 0
    ? { n: 0, celler: 0, d: NaN, se: NaN }
    : { n, celler, d: sum / vekt, se: Math.sqrt(varSum) / vekt };
}

const rå = (f: (r: Rad) => boolean): { d: number; se: number; n: number } => {
  const a = rader.filter((r) => r.pos === 0 && r.vårTrumf && f(r)).map((r) => r.anger);
  const b = rader.filter((r) => r.pos === 0 && !r.vårTrumf).map((r) => r.anger);
  return {
    d: snitt(a) - snitt(b),
    se: Math.sqrt(varians(a) / Math.max(1, a.length) + varians(b) / Math.max(1, b.length)),
    n: a.length,
  };
};

const grupper: { navn: string; f: (r: Rad) => boolean }[] = [
  { navn: "alle trumfutspill", f: () => true },
  { navn: "≥3 trumf fortsatt ute", f: (r) => r.trumfIgjenUte >= 3 },
  { navn: "≤2 trumf ute", f: (r) => r.trumfIgjenUte <= 2 },
  { navn: "≥4 trumf ute", f: (r) => r.trumfIgjenUte >= 4 },
  { navn: "≥3 ute OG vi har høyeste", f: (r) => r.trumfIgjenUte >= 3 && r.harHøyesteTrumf },
  { navn: "≥3 ute OG vi har IKKE høyeste", f: (r) => r.trumfIgjenUte >= 3 && !r.harHøyesteTrumf },
];

const linjer: string[] = [
  `\n=== Koster det å spille trumf ut? ${merke} ===`,
  `${rader.length} beslutninger; bare UTSPILL (pos 0) sammenlignes.`,
  ``,
  `«rå» sammenligner trumfutspill mot alle andre utspill. «stratifisert»`,
  `sammenligner bare INNENFOR samme stikknummer og samme antall lovlige kort,`,
  `så de to gruppene er stilt likt på det vi vet ellers skiller dem.`,
  ``,
  `gruppe                          n     rå differanse     stratifisert     celler`,
  `--------------------------------------------------------------------------------`,
];
for (const g of grupper) {
  const r = rå(g.f);
  const s = stratifisert(rader, g.f);
  if (s.n < 20) continue;
  linjer.push(
    `${g.navn.padEnd(30)} ${String(s.n).padStart(4)}   ` +
      `${(r.d >= 0 ? "+" : "") + r.d.toFixed(3)} ±${r.se.toFixed(3)}   ` +
      `${(s.d >= 0 ? "+" : "") + s.d.toFixed(3)} ±${s.se.toFixed(3)}   ${String(s.celler).padStart(4)}`,
  );
}
linjer.push(
  `--------------------------------------------------------------------------------`,
  ``,
  `Positivt = trumfutspillet koster MER anger enn et annet utspill i samme`,
  `stilling. Faller det stratifiserte tallet sammen mens det rå står, var`,
  `signalet en egenskap ved stillingen og ikke ved valget.`,
  ``,
  `Dette er fortsatt leting i data vi alt har sett. En regel bygget herfra må`,
  `måles parret på et FRISKT frøbånd før den er noe.`,
);
const tekst = linjer.join("\n");
console.log(tekst);
writeFileSync(utFil, tekst + "\n");
