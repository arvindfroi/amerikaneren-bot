/**
 * REGELGRAVING: hvilke KJENNETEGN har de dyre kortvalgene våre?
 *
 *   node examples/regelgraving.ts analyse/mine-spillefoerer-0.jsonl,...
 *
 * Tapsfordelingen i `analyse/tap-*.txt` sier HVOR vi blør: 74–81 % av angeren
 * ligger i stikk 3–7, i alle tre rollene. Den sier ingenting om HVA vi gjør
 * galt der. Denne leter etter det.
 *
 * METODEN er å dele beslutningene i to på hvert kjennetegn og se om angeren
 * skiller seg. Et kjennetegn som deler dyrt fra billig er en KANDIDAT til en
 * konvensjonsvaktregel – ikke en regel, en kandidat.
 *
 * FORMEN EN REGEL MÅ HA, lært av at «k» døde og «a» levde (se
 * `src/moe2/konvensjonsvakt.ts` og commit 7636c54): den må forby en
 * STRUKTURELT GJENKJENNELIG BOMMERT som aldri kan være riktig. En regel som
 * bare flytter et snitt tar like ofte noe fra oss som den gir, og måler null.
 * Derfor rapporteres ikke bare snittangeren, men også hvor ofte kjennetegnet
 * opptrer SAMMEN med at det beste kortet hadde motsatt egenskap – det er den
 * målbare formen på «vi gjør systematisk feil her».
 *
 * ADVARSEL SOM MÅ LESES. Dette er leting i data vi allerede har sett, over
 * mange hypoteser samtidig. Det er nøyaktig oppskriften på å finne mønstre
 * som ikke finnes. INGEN kandidat herfra er et funn før den er implementert
 * som en regel og målt PARRET på et FRISKT frøbånd. To ganger tidligere i
 * dette prosjektet har et utvalgt tall falt sammen når det ble målt ordentlig
 * (`ab` mot `at`, og «vakten er verdt 5× treningen»).
 */

import { readFileSync, writeFileSync } from "node:fs";

interface Rad {
  stikk: number;
  valg: number;
  anger: number;
  pos: number;
  renons: boolean;
  vårTrumf: boolean;
  besteTrumf: boolean;
  vårHøyest: boolean;
  vårLavest: boolean;
  besteHøyest: boolean;
  besteLavest: boolean;
  egetLagLedet: boolean;
  makkerLedet: boolean;
  makkerAvslørt: boolean;
  trumfIgjenUte: number;
  harHøyesteTrumf: boolean;
  egneTrumf: number;
}

const filer = (process.argv[2] ?? "").split(",").filter((x) => x !== "");
if (filer.length === 0) {
  console.error("bruk: node examples/regelgraving.ts <fil1.jsonl,fil2.jsonl,...> [--ut fil.txt]");
  process.exit(1);
}
let utFil = "analyse/regelgraving.txt";
for (let i = 3; i < process.argv.length; i++) {
  if (process.argv[i] === "--ut") utFil = process.argv[++i] ?? utFil;
}

const rader: Rad[] = [];
for (const f of filer) {
  for (const l of readFileSync(f, "utf8").trim().split("\n")) {
    if (l.trim() === "") continue;
    rader.push(JSON.parse(l) as Rad);
  }
}

const snitt = (v: readonly number[]): number => (v.length === 0 ? 0 : v.reduce((a, x) => a + x, 0) / v.length);
function se(v: readonly number[]): number {
  if (v.length < 2) return NaN;
  const m = snitt(v);
  let s = 0;
  for (const x of v) s += (x - m) * (x - m);
  return Math.sqrt(s / (v.length - 1) / v.length);
}

/**
 * Kandidatene. Hver er «en situasjon vi kan kjenne igjen ved bordet», og
 * MERK at alle er uttrykt i informasjon setet lovlig har – ikke i hva
 * orakelet mente. Et kjennetegn som bruker `beste*` kan ikke bli en regel;
 * det kan bare vise at feilen finnes.
 */
const situasjoner: { navn: string; test: (r: Rad) => boolean; lovlig: boolean }[] = [
  { navn: "vi spilte trumf", test: (r) => r.vårTrumf, lovlig: true },
  { navn: "vi var renons i utspilt farge", test: (r) => r.renons, lovlig: true },
  { navn: "vi trumfet inn ved renons", test: (r) => r.renons && r.vårTrumf, lovlig: true },
  { navn: "vi spilte HØYEST av de lovlige", test: (r) => r.vårHøyest, lovlig: true },
  { navn: "vi spilte LAVEST av de lovlige", test: (r) => r.vårLavest, lovlig: true },
  { navn: "vårt eget lag ledet stikket alt", test: (r) => r.egetLagLedet, lovlig: true },
  { navn: "MAKKEREN ledet stikket", test: (r) => r.makkerLedet, lovlig: true },
  { navn: "makker ledet OG vi spilte høyest", test: (r) => r.makkerLedet && r.vårHøyest, lovlig: true },
  { navn: "makker ledet OG vi trumfet", test: (r) => r.makkerLedet && r.vårTrumf, lovlig: true },
  { navn: "vi spilte ut (pos 0)", test: (r) => r.pos === 0, lovlig: true },
  { navn: "vi var sist i stikket (pos 3)", test: (r) => r.pos === 3, lovlig: true },
  { navn: "makkeren var avslørt", test: (r) => r.makkerAvslørt, lovlig: true },
  { navn: "mange valg (≥5 lovlige)", test: (r) => r.valg >= 5, lovlig: true },
  // TRUMFBILDET. Overtrumfing bar 61 % av spillefoererens tap i foerste
  // runde, saa dette er der den strukturelle formen maa ligge om den finnes.
  { navn: "trumf ut UTEN aa ha hoeyeste", test: (r) => r.vårTrumf && r.pos === 0 && !r.harHøyesteTrumf, lovlig: true },
  { navn: "trumf ut MED hoeyeste", test: (r) => r.vårTrumf && r.pos === 0 && r.harHøyesteTrumf, lovlig: true },
  { navn: "vi har hoeyeste trumf ute", test: (r) => r.harHøyesteTrumf, lovlig: true },
  { navn: "trumf ut, >=3 trumf fortsatt ute", test: (r) => r.vårTrumf && r.pos === 0 && r.trumfIgjenUte >= 3, lovlig: true },
  { navn: "trumf ut, <=2 trumf ute", test: (r) => r.vårTrumf && r.pos === 0 && r.trumfIgjenUte <= 2, lovlig: true },
  { navn: "vi spilte trumf ut (pos 0)", test: (r) => r.vårTrumf && r.pos === 0, lovlig: true },
  // Disse kan IKKE bli regler – de ser fasiten. De er diagnose.
  { navn: "· vi trumfet, beste var IKKE trumf", test: (r) => r.vårTrumf && !r.besteTrumf, lovlig: false },
  { navn: "· vi trumfet IKKE, beste var trumf", test: (r) => !r.vårTrumf && r.besteTrumf, lovlig: false },
  { navn: "· vi høyest, beste var lavest", test: (r) => r.vårHøyest && r.besteLavest, lovlig: false },
  { navn: "· vi lavest, beste var høyest", test: (r) => r.vårLavest && r.besteHøyest, lovlig: false },
  { navn: "· trumf ut u/hoeyeste, beste ikke trumf", test: (r) => r.vårTrumf && r.pos === 0 && !r.harHøyesteTrumf && !r.besteTrumf, lovlig: false },
  { navn: "· trumf ut m/hoeyeste, beste ikke trumf", test: (r) => r.vårTrumf && r.pos === 0 && r.harHøyesteTrumf && !r.besteTrumf, lovlig: false },
];

const alle = rader.map((r) => r.anger);
const linjer: string[] = [
  `\n=== Regelgraving: hva kjennetegner de dyre kortvalgene? ===`,
  `${rader.length} beslutninger fra ${filer.length} fil(er).`,
  `Grunnlinje: ${snitt(alle).toFixed(4)} anger per beslutning.`,
  ``,
  `Rader med «·» ser FASITEN og kan aldri bli en regel – de viser bare at`,
  `feilen finnes. De øvrige er uttrykt i det setet lovlig vet.`,
  ``,
  `situasjon                              n      anger    mot resten   andel av tapet`,
  `--------------------------------------------------------------------------------------`,
];
const totalt = alle.reduce((a, x) => a + x, 0);
type Rangert = { navn: string; n: number; m: number; d: number; dSE: number; andel: number; lovlig: boolean };
const ut: Rangert[] = [];
for (const s of situasjoner) {
  const inne = rader.filter(s.test).map((r) => r.anger);
  const ute = rader.filter((r) => !s.test(r)).map((r) => r.anger);
  if (inne.length < 30) continue;
  const d = snitt(inne) - snitt(ute);
  // Standardfeilen til differansen mellom to uavhengige grupper.
  const dSE = Math.sqrt(se(inne) ** 2 + se(ute) ** 2);
  ut.push({
    navn: s.navn,
    n: inne.length,
    m: snitt(inne),
    d,
    dSE,
    andel: inne.reduce((a, x) => a + x, 0) / Math.max(1e-9, totalt),
    lovlig: s.lovlig,
  });
}
ut.sort((a, b) => b.d / b.dSE - a.d / a.dSE);
for (const r of ut) {
  linjer.push(
    `${r.navn.padEnd(36)} ${String(r.n).padStart(6)}   ${r.m.toFixed(4).padStart(8)}   ` +
      `${(r.d >= 0 ? "+" : "") + r.d.toFixed(4)} ±${r.dSE.toFixed(4)}  ` +
      `${(100 * r.andel).toFixed(1).padStart(6)} %`,
  );
}
linjer.push(
  `--------------------------------------------------------------------------------------`,
  ``,
  `Sortert etter hvor mange standardfeil differansen er fra null.`,
  ``,
  `INGEN AV DISSE ER ET FUNN. Dette er leting over mange hypoteser i data vi`,
  `allerede har sett, som er oppskriften på å finne mønstre som ikke finnes.`,
  `En kandidat blir et funn først når den er implementert som regel og målt`,
  `PARRET på et FRISKT frøbånd. To ganger før har et utvalgt tall falt sammen`,
  `når det ble målt ordentlig.`,
);
const tekst = linjer.join("\n");
console.log(tekst);
writeFileSync(utFil, tekst + "\n");
