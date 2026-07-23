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

import { genomFraJson, utvidInnganger, ANTALL_INN, type Genom } from "../src/neat/index.ts";

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
  const g = genomFraJson(readFileSync(fil, "utf8"));
  if (g.antallInn > ANTALL_INN) {
    console.error(`${fil} har ${g.antallInn} innganger – nyere enn kodingen (${ANTALL_INN}); hopper over`);
    continue;
  }
  migrerte.push(g.antallInn === ANTALL_INN ? g : utvidInnganger(g, ANTALL_INN));
  console.log(`${fil}: ${g.antallInn} → ${ANTALL_INN} innganger`);
}

mkdirSync(dirname(utfil), { recursive: true });
writeFileSync(utfil, JSON.stringify(migrerte));
console.log(`Skrev ${migrerte.length} migrerte genomer til ${utfil}`);
