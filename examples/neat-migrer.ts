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

if (filer.size === 0) {
  console.error(`Fant ingen genomer i ${fraDir}`);
  process.exit(1);
}

const migrerte: Genom[] = [];
for (const fil of filer) {
  let g = genomFraJson(readFileSync(fil, "utf8"));
  if (g.antallInn > ANTALL_INN || g.antallUt > ANTALL_UT) {
    console.error(`${fil} har ${g.antallInn}/${g.antallUt} inn/ut – nyere enn kodingen; hopper over`);
    continue;
  }
  const før = `${g.antallInn}/${g.antallUt}`;
  if (g.antallUt < ANTALL_UT) g = utvidUtganger(g, ANTALL_UT);
  if (g.antallInn < ANTALL_INN) g = utvidInnganger(g, ANTALL_INN);
  migrerte.push(g);
  console.log(`${fil}: ${før} → ${ANTALL_INN}/${ANTALL_UT} inn/ut`);
}

mkdirSync(dirname(utfil), { recursive: true });
writeFileSync(utfil, JSON.stringify(migrerte));
console.log(`Skrev ${migrerte.length} migrerte genomer til ${utfil}`);
