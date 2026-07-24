/**
 * Migrerer lagrede genomer til gjeldende inngangskoding.
 *
 *   node examples/neat-migrer.ts <fraDir> <utfil>
 *   node examples/neat-migrer.ts trening-c2 trening-c3/start.json
 *
 * Når kodingen får NYE sensorer (innganger legges alltid til på slutten),
 * blir gamle genomer inkompatible i dimensjon. Migreringen beholder hele
 * den evolverte strukturen: gamle innganger beholder id, bias/utganger/
 * skjulte noder forskyves, alle koblinger beholder vektene. De nye
 * sensorene starter ukoblet – nettet regner som før til evolusjonen
 * kobler dem på der de hjelper. Resultatfila gis til --fra-flere.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  genomFraJson,
  utvidInnganger,
  utvidUtganger,
  ANTALL_INN,
  ANTALL_UT,
  type Genom,
} from "../src/neat/index.ts";

const fraDir = process.argv[2] ?? "trening-c2";
const utfil = process.argv[3] ?? "trening-c3/start.json";

const filer = new Set<string>();
if (existsSync(`${fraDir}/mester.json`)) filer.add(`${fraDir}/mester.json`);
const alle = existsSync(fraDir) ? readdirSync(fraDir) : [];
for (const f of alle) if (f.startsWith("beste-benk-")) filer.add(`${fraDir}/${f}`);
const snapshots = alle
  .filter((f) => /^mester-gen\d+\.json$/.test(f))
  .sort((a, b) => Number(b.match(/\d+/)![0]) - Number(a.match(/\d+/)![0]));
if (snapshots[0]) filer.add(`${fraDir}/${snapshots[0]}`);

// HELE befolkningen og gullstandarden tas med. Uten dem starter den nye
// linja fra en håndfull genomer, og mangfoldet tusen generasjoner har bygd
// opp – som er selve kapitalen i en NEAT-populasjon – er kastet bort.
const ekstra: Genom[] = [];
if (existsSync(`${fraDir}/gull.json`)) {
  const g = JSON.parse(readFileSync(`${fraDir}/gull.json`, "utf8")) as { genom?: Genom };
  if (g.genom !== undefined) ekstra.push(genomFraJson(JSON.stringify(g.genom)));
}
if (existsSync(`${fraDir}/befolkning.json`)) {
  const b = JSON.parse(readFileSync(`${fraDir}/befolkning.json`, "utf8")) as {
    genomer?: Genom[];
    hall?: Genom[];
  };
  for (const g of [...(b.genomer ?? []), ...(b.hall ?? [])]) ekstra.push(g);
  console.log(`befolkning.json: ${b.genomer?.length ?? 0} genomer + ${b.hall?.length ?? 0} i hallen`);
}

if (filer.size === 0 && ekstra.length === 0) {
  console.error(`Fant ingen genomer i ${fraDir}`);
  process.exit(1);
}

const migrerte: Genom[] = [];
for (const fil of [...filer, ...ekstra]) {
  let g = typeof fil === "string" ? genomFraJson(readFileSync(fil, "utf8")) : fil;
  if (g.antallInn > ANTALL_INN || g.antallUt > ANTALL_UT) {
    console.error(`${fil} har ${g.antallInn}/${g.antallUt} inn/ut – nyere enn kodingen; hopper over`);
    continue;
  }
  const før = `${g.antallInn}/${g.antallUt}`;
  if (g.antallUt < ANTALL_UT) g = utvidUtganger(g, ANTALL_UT);
  if (g.antallInn < ANTALL_INN) g = utvidInnganger(g, ANTALL_INN);
  migrerte.push(g);
  if (typeof fil === "string") console.log(`${fil}: ${før} → ${ANTALL_INN}/${ANTALL_UT} inn/ut`);
}

mkdirSync(dirname(utfil), { recursive: true });
writeFileSync(utfil, JSON.stringify(migrerte));
console.log(`Skrev ${migrerte.length} migrerte genomer til ${utfil}`);
