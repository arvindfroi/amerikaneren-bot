/**
 * Klargjør et D5-/D6-genom som frø for D7.
 *
 *   node examples/d7-fro.ts trening-d5/mester.json d7/fro-d5.json
 *
 * Arvind: «bud, vrak, og trumf valg skal starte helt umettet, og de skal
 * ikke skape en frykt for å by høyt».
 *
 * TO INNGREP, begge målrettet – vi rører IKKE korthodet, som bærer det
 * spillet linjene faktisk har lært, og som er det vi vil arve.
 *
 * 1. AVMETTING AV BESLUTNINGSHODENE. xT-kvantilene, marginen og trumfhodet
 *    skaleres ned til de er responsive igjen. Kriteriet er den FUNKSJONELLE
 *    testen, ikke snittderiverten: D6s mester målte 0,82 i snitt og bare 1 %
 *    mettede utganger, men kalibreringen festet likevel IKKE. Snittet lyver,
 *    og det har det gjort to ganger i denne kodebasen.
 *
 *    Skaleringen er multiplikativ og rører kun koblinger INN til disse
 *    hodene, så rangeringen mellom dem er bevart mens gradienten kommer
 *    tilbake – samme inngrep som neat-avmett.ts gjør for korthodet.
 *
 * 2. NØYTRALISERING AV BUDFRYKTEN. Marginhodet skyver EV-terskelen i
 *    velgBud: negativ margin = forsiktig, positiv = dristig. Et genom avlet
 *    under den gamle ambisjonsstraffen – der å bomme på 9 kostet 0,42 mer
 *    fitness enn å bomme på 6 – har lært å legge seg lavt, og den lærdommen
 *    sitter i biasen inn til marginhodet. Den nullstilles, så D7 starter
 *    uten arvet frykt og må finne sitt eget nivå under en belønning som
 *    ikke lenger straffer ambisjon.
 *
 *    Merk at dette IKKE gjør den dristig – det fjerner bare et lært
 *    fortegn. Hva som er riktig budnivå avgjør EV-regnestykket og
 *    seleksjonen, som de skal.
 *
 *    MÅLT, og det motsier antakelsen bak inngrepet: begge linjene hadde en
 *    svakt POSITIV marginbias (D5 +0,126, D6 +0,109), altså mildt dristig,
 *    ikke fryktsom. Den arvede forsiktigheten sitter derfor IKKE her – den
 *    sitter i xT-estimatet selv, som EV-regelen leser. Nullstillingen er
 *    fortsatt riktig som et nøytralt utgangspunkt, men den løser ikke
 *    budfrykten alene, og det er avmettingen av xT-kvantilene over som er
 *    det virksomme inngrepet.
 */

import { readFileSync, writeFileSync } from "node:fs";

import { genomFraJson, genomTilJson, klonGenom, type Genom } from "../src/neat/index.ts";
import { biasId, utId } from "../src/neat/genom.ts";
import { Nettverk } from "../src/neat/nett.ts";
import { ANTALL_INN, UT_MARGIN, UT_TRUMF, UT_XT, UT_XT_HØY, UT_XT_LAV } from "../src/neat/trekk.ts";
import { lagRng } from "../src/kort.ts";

const inn = process.argv[2] ?? "trening-d5/mester.json";
const ut = process.argv[3] ?? "d7/fro.json";

const rå = JSON.parse(readFileSync(inn, "utf8")) as { genom?: unknown };
const basis: Genom = genomFraJson(
  rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(inn, "utf8"),
);

/** Utgangene vi skal avmette: xT-kvantilene, marginen og de fire trumfene. */
const HODER = [UT_XT, UT_XT_LAV, UT_XT_HØY, UT_MARGIN, UT_TRUMF, UT_TRUMF + 1, UT_TRUMF + 2, UT_TRUMF + 3];
const hodeIder = new Set(HODER.map((u) => utId(ANTALL_INN, u)));

/** Snitt tanh-derivert over nettopp disse hodene, på tilfeldige innsignal. */
function derivert(g: Genom): number {
  const nett = new Nettverk(g);
  const rng = lagRng(0xd7);
  let sum = 0;
  let n = 0;
  for (let p = 0; p < 200; p++) {
    const v = Array.from({ length: ANTALL_INN }, () => (rng() < 0.15 ? 1 : 0));
    const u = nett.aktiver(v);
    for (const h of HODER) {
      const x = u[h]!;
      sum += 1 - x * x;
      n++;
    }
  }
  return sum / n;
}

function skaler(g: Genom, s: number): Genom {
  const k = klonGenom(g);
  for (const kob of k.koblinger) if (hodeIder.has(kob.ut)) kob.vekt *= s;
  return k;
}

console.log(`D7-frø fra ${inn}`);
console.log(`Beslutningshoder FØR: snitt tanh-derivert ${derivert(basis).toFixed(4)}`);

// Velg den mildeste skaleringen som gir en klart responsiv gradient. Vi tar
// den FØRSTE som passerer 0,9 – å skalere hardere enn nødvendig ville
// kastet bort mer av det linja faktisk har lært.
let beste = 1;
for (const s of [1, 0.7, 0.5, 0.35, 0.25, 0.18, 0.12, 0.08]) {
  const d = derivert(skaler(basis, s));
  console.log(`  faktor ${s}: derivert ${d.toFixed(4)}`);
  beste = s;
  if (d > 0.9) break;
}
const avmettet = skaler(basis, beste);

// Budfrykten: biasen inn til marginhodet nullstilles.
const marginId = utId(ANTALL_INN, UT_MARGIN);
const bias = biasId(ANTALL_INN);
let nullstilt = 0;
for (const k of avmettet.koblinger) {
  if (k.ut === marginId && k.inn === bias) {
    console.log(`  marginbias ${k.vekt.toFixed(3)} -> 0 (arvet budfrykt fjernet)`);
    k.vekt = 0;
    nullstilt++;
  }
}
if (nullstilt === 0) console.log("  fant ingen marginbias – hodet har ingen biaskobling");

console.log(`Beslutningshoder ETTER: snitt tanh-derivert ${derivert(avmettet).toFixed(4)} (faktor ${beste})`);
writeFileSync(ut, genomTilJson(avmettet));
console.log(`-> ${ut}`);
console.log(`\nKorthodet er URØRT: det bærer spillet linja faktisk har lært, og er hele grunnen til å arve i det hele tatt.`);
