/**
 * GATTACA – håndredigert genom bygget på målt genattribusjon.
 *
 *   node examples/gattaca.ts d7/fro-d5.json d7/genanalyse-d5.json --ut d7/gattaca-d5.json
 *
 * Arvinds bestilling: gå gjennom genene for hånd, se hvilke som fører til
 * enighet med orakelet og hvilke som fører til uenighet, rediger
 * kortpreferansene, og vurder de døde koblingene individuelt.
 *
 * HVA MÅLINGEN FAKTISK VISTE (examples/genanalyse.ts, 2000 stillinger):
 *
 *  - D5 treffer dobbel-dummy-optimum i 35,1 % av valgene mot NevroHjernes
 *    30,4 %. Korthodet er altså allerede bedre enn benken vår, og skal
 *    bevares. Det er bud, vrak og trumf som taper kampene.
 *  - 9 av D5s 15 skadeligste koblinger går fra BIAS (node 318) til et
 *    kortutgang: en konstant preferanse for ett bestemt kort uansett
 *    stilling. Verstingen er innov 352 (bias → kløver ess, vekt 0,648).
 *  - De NYTTIGE går derimot fra ekte sensorer: 51→378 er «jeg holder dette
 *    kortet», 190→355 er andel stikk spilt, 163→354 er beslutningstypen.
 *  - 46 % (D5) og 60 % (D6) av koblingene flytter INGENTING.
 *
 * MEN – og dette er grunnen til at redigeringen ikke kan være en regel:
 * i D6 er flere bias→kort-koblinger blant de NYTTIGE (innov 10, 78, 84, 87).
 * En konstant preferanse er ikke feil i seg selv; den er feil når den peker
 * på feil kort. Derfor redigeres hver kobling etter sin MÅLTE score, ikke
 * etter hvilken type den er.
 *
 * TRE INNGREP:
 *
 *  1. DØDE KOBLINGER FJERNES. De flytter ingenting i noen stilling, men de
 *     opptar plass i søkerommet: hver mutasjon som treffer dem er bortkastet,
 *     og de teller i artsavstanden. Å luke dem er gratis presisjon.
 *
 *  2. SKADELIGE NULLES. Jeg begrunnet først det motsatte – at en kobling med
 *     negativ score fortsatt bidrar riktig i noen stillinger, så den burde
 *     bare dempes. Målingen overkjørte resonnementet. Sveip over
 *     dempingsfaktoren, 1200 stillinger, samme kjøringsvindu:
 *
 *       kun luking (ingen demping)   34,6 %
 *       demp 0,35                    35,0 %
 *       original, uredigert          35,2 %
 *       demp 0,7                     35,6 %
 *       demp 0 (nulles helt)         36,6 %   <- best
 *
 *     Merk også at luking ALENE er litt verre enn originalen. Det er altså
 *     ikke de døde koblingene som var problemet – det er de skadelige, og de
 *     skal bort helt.
 *
 *  3. NYTTIGE STÅR URØRT. Fristelsen er å forsterke dem, men ingenting i
 *     målingen sier at mer av en god kobling er bedre – bidraget er målt ved
 *     dagens vekt, ikke som en gradient. Å skru dem opp ville vært å gjette.
 *
 * Etter redigering gjenopprettes hver nodes OPPRINNELIGE vektlengde, slik at
 * inngrepene endrer RETNING og ikke skala.
 *
 * MÅLT, og det kostet en runde: første versjon kalte normaliserVekter(g, 1.5)
 * til slutt, altså satte ALLE noder til samme lengde. Det er riktig for et
 * FERSKT genom, men her skriver det om hele nettet og overdøver de selektive
 * endringene fullstendig – treffet mot orakelet falt 35,8 % → 33,8 %. Nå
 * måles hver nodes lengde FØR redigeringen og gjenopprettes etter, samme
 * prinsipp som bevarLengde bruker i kalibreringen.
 */

import { readFileSync, writeFileSync } from "node:fs";

import { genomFraJson, genomTilJson, klonGenom, type Genom } from "../src/neat/index.ts";

interface GenRad {
  innovasjon: number;
  inn: number;
  ut: number;
  vekt: number;
  /** Normalisert til [-1, 1] – det er DENNE genanalyse.ts rangerer paa. */
  scoreNorm: number;
  goodContribution: number;
  badContribution: number;
}

const genomFil = process.argv[2] ?? "d7/fro-d5.json";
const analyseFil = process.argv[3] ?? "d7/genanalyse-d5.json";
let ut = "d7/gattaca.json";
let dempFaktor = 0;
let doedGrense = 1e-9;
for (let i = 4; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--ut") ut = process.argv[++i]!;
  else if (a === "--demp") dempFaktor = Number(process.argv[++i]);
  else if (a === "--doedgrense") doedGrense = Number(process.argv[++i]);
}

const rå = JSON.parse(readFileSync(genomFil, "utf8")) as { genom?: unknown };
const basis: Genom = genomFraJson(
  rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(genomFil, "utf8"),
);
const analyse = JSON.parse(readFileSync(analyseFil, "utf8")) as
  | { koblinger?: GenRad[] }
  | GenRad[];
const rader: GenRad[] = Array.isArray(analyse) ? analyse : (analyse.koblinger ?? []);
if (rader.length === 0) throw new Error(`fant ingen koblingsrader i ${analyseFil}`);

const perInnov = new Map<number, GenRad>();
for (const r of rader) perInnov.set(r.innovasjon, r);

const g = klonGenom(basis);
// Lengden per node MÅLES FØR redigeringen, og gjenopprettes etterpå.
const lengdeFør = new Map<number, number>();
for (const k of g.koblinger) {
  if (!k.aktiv) continue;
  lengdeFør.set(k.ut, (lengdeFør.get(k.ut) ?? 0) + k.vekt * k.vekt);
}
for (const [n, kvadrat] of lengdeFør) lengdeFør.set(n, Math.sqrt(kvadrat));
let fjernet = 0;
let dempet = 0;
let urørt = 0;
let ukjent = 0;
const beholdt: typeof g.koblinger = [];

for (const k of g.koblinger) {
  const r = perInnov.get(k.innovasjon);
  if (r === undefined) {
    // Ikke analysert (f.eks. kobling som bare fyrer i BUD/VRAK/VELG, ikke i
    // kortspillet). Røres ikke – vi har ingen måling å begrunne noe med.
    ukjent++;
    beholdt.push(k);
    continue;
  }
  const død =
    Math.abs(r.goodContribution) < doedGrense && Math.abs(r.badContribution) < doedGrense;
  if (død) {
    fjernet++;
    continue;
  }
  if (r.scoreNorm < 0) {
    // Skala fra 0 (score 0) til full demping (score −1).
    const styrke = Math.min(1, -r.scoreNorm);
    k.vekt *= 1 - styrke * (1 - dempFaktor);
    dempet++;
  } else {
    urørt++;
  }
  beholdt.push(k);
}
g.koblinger = beholdt;

// Noder som mistet ALLE innkommende koblinger ville blitt konstante nuller.
// Fjerningen er derfor bare trygg fordi normaliseringen hopper over noder
// uten kobling – men vi teller dem, for det er verdt å vite om.
const harInn = new Set(g.koblinger.filter((k) => k.aktiv).map((k) => k.ut));
const foreldreløse = g.noder.filter((n) => n.type !== "inn" && n.type !== "bias" && !harInn.has(n.id));

// Gjenopprett hver nodes opprinnelige lengde: redigeringen skal flytte
// RETNING, ikke skala. Noder som mistet koblinger får da resten skalert opp
// til samme totale styrke, i stedet for at noden blir svakere som helhet.
const kvadratNå = new Map<number, number>();
for (const k of g.koblinger) {
  if (!k.aktiv) continue;
  kvadratNå.set(k.ut, (kvadratNå.get(k.ut) ?? 0) + k.vekt * k.vekt);
}
for (const k of g.koblinger) {
  if (!k.aktiv) continue;
  const før = lengdeFør.get(k.ut);
  const nå = kvadratNå.get(k.ut);
  if (før === undefined || nå === undefined || nå <= 1e-12) continue;
  k.vekt *= før / Math.sqrt(nå);
}

console.log(`GATTACA fra ${genomFil}`);
console.log(`  analyse:            ${analyseFil} (${rader.length} rader)`);
console.log(`  koblinger før:      ${basis.koblinger.length}`);
console.log(`  døde fjernet:       ${fjernet}`);
console.log(`  skadelige dempet:   ${dempet} (faktor ned til ${dempFaktor})`);
console.log(`  nyttige urørt:      ${urørt}`);
console.log(`  uanalysert urørt:   ${ukjent}  (fyrer ikke i kortspillet)`);
console.log(`  koblinger etter:    ${g.koblinger.length}`);
console.log(`  noder uten innkommende: ${foreldreløse.length}`);
writeFileSync(ut, genomTilJson(g));
console.log(`-> ${ut}`);
