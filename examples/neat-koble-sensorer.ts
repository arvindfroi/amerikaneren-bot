/**
 * Kobler nye sensorer til de utgangene de er ment for.
 *
 *   node examples/neat-koble-sensorer.ts trening-d2/start.json trening-d3/start.json
 *
 * MÅLT PROBLEM: å legge til sensorer er ikke nok. D2 fikk 14 nye
 * håndvurderings-innganger og kjørte 160 generasjoner – og gullgenomet
 * hadde fortsatt NULL aktive koblinger fra dem (examples/neat-kobling.ts).
 * NEATs nyKobling-mutasjon trekker tilfeldig blant 311 innganger og 63
 * utganger; sannsynligheten for å treffe akkurat de 14 nye, og deretter
 * overleve seleksjonen lenge nok til å bli nyttig, er forsvinnende.
 * Sensorene lå der som informasjon nettet aldri kunne nå.
 *
 * Her kobles de eksplisitt, med SMÅ tilfeldige vekter: trumfestimatene til
 * trumfhodet, resten av håndvurderingen til bud-hodene (xT-median, kvantiler
 * og margin). Små vekter betyr at genomet spiller praktisk talt som før i
 * starten – vi tvinger ikke inn en ny strategi, vi åpner en dør evolusjonen
 * kan gå gjennom hvis den lønner seg.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

import { lagRng } from "../src/kort.ts";
import {
  ANTALL_INN,
  Innovasjonsbok,
  SENSORGRUPPER,
  utId,
  UT_KORT,
  UT_MARGIN,
  UT_TRUMF,
  UT_XT,
  UT_XT_HØY,
  UT_XT_LAV,
  type Genom,
} from "../src/neat/index.ts";

const innFil = process.argv[2] ?? "trening-d2/start.json";
const utFil = process.argv[3] ?? "trening-d3/start.json";
const styrke = Number(process.argv[4] ?? 0.3);

const genomer = JSON.parse(readFileSync(innFil, "utf8")) as Genom[];
if (!Array.isArray(genomer) || genomer.length === 0) throw new Error(`${innFil} er ikke en liste med genomer`);

const [fra, til] = SENSORGRUPPER.håndvurdering;
// 297–300 er estimerStikk per farge (S,H,R,K) – de hører til trumfvalget.
// Resten (beste estimat, argmax-farge, ess, konger, renons, singelton,
// lengste) er håndstyrke, som er det bud-hodene skal svare på.
const EST_STIKK = fra;
const budHoder = [UT_XT, UT_XT_LAV, UT_XT_HØY, UT_MARGIN].map((u) => utId(ANTALL_INN, u));
const trumfHoder = [0, 1, 2, 3].map((f) => utId(ANTALL_INN, UT_TRUMF + f));

const rng = lagRng(0x5e0501 >>> 0);
const bok = new Innovasjonsbok(ANTALL_INN, 63);
for (const g of genomer) bok.hoppOver(g);

let lagt = 0;
for (const g of genomer) {
  const finnes = new Set(g.koblinger.map((k) => `${k.inn}>${k.ut}`));
  const legg = (inn: number, ut: number): void => {
    if (finnes.has(`${inn}>${ut}`)) return;
    g.koblinger.push({
      inn,
      ut,
      // Små vekter: døren åpnes, strategien endres ikke over natten.
      vekt: (rng() * 2 - 1) * styrke,
      aktiv: true,
      innovasjon: bok.kobling(inn, ut),
    });
    finnes.add(`${inn}>${ut}`);
    lagt++;
  };
  // Trumfestimat f → trumfhode f (den direkte, meningsbærende koblingen),
  // og alle fire estimatene til alle fire hodene så nettet kan sammenlikne.
  for (let f = 0; f < 4; f++) for (const ut of trumfHoder) legg(EST_STIKK + f, ut);
  // Hele håndvurderingen til bud-hodene.
  for (let i = fra; i < til; i++) for (const ut of budHoder) legg(i, ut);
  // Sekvensene: til bud-hodene (håndstyrke) OG til korthodet, som styrer
  // vrakingen – der en serie er avgjørende for hvilke kort som beholdes.
  // Kortserien i farge f kobles til de 13 kortutgangene i SAMME farge, ikke
  // til alle 52: koblingen «serien min i spar er lang» → «behold spar»
  // er den meningsbærende, og 4×13 er langt billigere enn 7×52.
  for (const [sFra, sTil] of [SENSORGRUPPER.sekvenser]) {
    for (let i = sFra; i < sTil; i++) for (const ut of budHoder) legg(i, ut);
    for (let f = 0; f < 4; f++) {
      for (let v = 0; v < 13; v++) legg(sFra + f, utId(ANTALL_INN, UT_KORT + f * 13 + v));
    }
  }
}

mkdirSync(dirname(utFil), { recursive: true });
writeFileSync(utFil, JSON.stringify(genomer));
console.log(
  `Koblet håndvurderingen (inngang ${fra}–${til - 1}) til ${trumfHoder.length} trumfhoder og ` +
    `${budHoder.length} bud-hoder i ${genomer.length} genomer: ${lagt} nye koblinger ` +
    `(${(lagt / genomer.length).toFixed(0)} per genom, vekt ±${styrke}) → ${utFil}`,
);
