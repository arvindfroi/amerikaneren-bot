/**
 * Kombinerer to treningslinjer til én startpopulasjon.
 *
 *   node examples/neat-kombiner.ts <dirA> <dirB> <utfil>
 *   node examples/neat-kombiner.ts trening trening-b trening-c/start.json
 *
 * Henter de beste genomene fra hver linje (mester.json, alle
 * beste-benk-*.json og siste mester-gen*.json), og gjør dem KOMBINERBARE:
 *
 *  - Linjene har hver sin innovasjonshistorikk, så skjulte node-id-er
 *    kolliderer på tvers (node 400 i A er en annen node enn 400 i B).
 *    Hver families skjulte noder forskyves derfor til sitt eget id-rom.
 *    Inn-, bias- og utnoder er felles definisjon og beholdes.
 *  - Innovasjonsnumrene re-nummereres kanonisk etter struktur (fra→til)
 *    når Evolusjon laster populasjonen (`startPopulasjon`), slik at
 *    kryssing og artsavstand blir riktig på tvers av familiene.
 *
 * Resultatet er en JSON-liste av genomer som gis til
 *   node examples/neat-tren.ts ... --fra-flere <utfil>
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { genomFraJson, førsteSkjulteId, ANTALL_INN, ANTALL_UT, type Genom } from "../src/neat/index.ts";

const dirA = process.argv[2] ?? "trening";
const dirB = process.argv[3] ?? "trening-b";
const utfil = process.argv[4] ?? "trening-c/start.json";

/** Familiens beste genomer: mester + arkiverte benk-toppe + siste snapshot. */
function lesFamilie(dir: string): Genom[] {
  const filer = new Set<string>();
  if (existsSync(`${dir}/mester.json`)) filer.add(`${dir}/mester.json`);
  const alle = existsSync(dir) ? readdirSync(dir) : [];
  for (const f of alle) if (f.startsWith("beste-benk-")) filer.add(`${dir}/${f}`);
  const snapshots = alle
    .filter((f) => /^mester-gen\d+\.json$/.test(f))
    .sort((a, b) => Number(b.match(/\d+/)![0]) - Number(a.match(/\d+/)![0]));
  if (snapshots[0]) filer.add(`${dir}/${snapshots[0]}`);
  return [...filer].map((f) => genomFraJson(readFileSync(f, "utf8")));
}

/** Forskyver familiens skjulte node-id-er til et eget id-rom. */
function forskyvFamilie(genomer: Genom[], familieNr: number): Genom[] {
  const S = førsteSkjulteId(ANTALL_INN, ANTALL_UT);
  const AVSTAND = 1_000_000;
  const nyId = (id: number): number => (id < S ? id : S + familieNr * AVSTAND + (id - S));
  return genomer.map((g) => ({
    antallInn: g.antallInn,
    antallUt: g.antallUt,
    noder: g.noder.map((n) => ({ id: nyId(n.id), type: n.type })),
    koblinger: g.koblinger.map((k) => ({ ...k, inn: nyId(k.inn), ut: nyId(k.ut) })),
  }));
}

const famA = lesFamilie(dirA);
const famB = lesFamilie(dirB);
if (famA.length + famB.length === 0) {
  console.error(`Fant ingen genomer i ${dirA} eller ${dirB}`);
  process.exit(1);
}
const kombinert = [...forskyvFamilie(famA, 0), ...forskyvFamilie(famB, 1)];

mkdirSync(dirname(utfil), { recursive: true });
writeFileSync(utfil, JSON.stringify(kombinert));
console.log(
  `Kombinerte ${famA.length} genomer fra ${dirA} + ${famB.length} fra ${dirB} → ${utfil}\n` +
    `Start treningen med: node examples/neat-tren.ts <gen> <pop> <frø> --dir ${dirname(utfil)} --fra-flere ${utfil}`,
);
