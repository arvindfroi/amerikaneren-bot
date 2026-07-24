/**
 * Lagspill-migrering: utvider alle lagrede genomer i en treningskatalog til
 * den nye kodingen (286 innganger: + 6 lagspill-sensorer) og kobler de nye
 * sensorene eksplisitt – som i sensor-vekkingen (neat-vekk.ts) får hver ny
 * inngang små koblinger til 2 nav-noder (skjulte med høyest utgrad mot
 * korthodet), 1 kortutgang og xT-hodet (lagspill påvirker både spill og bud).
 *
 *   node examples/neat-lagspill.ts <dir>
 *
 * Migrerer på plass: befolkning.json, gull.json, mester.json, start.json
 * (+ beste-benk-*). Originaler sikkerhetskopieres med -foer-lagspill-suffiks.
 */

import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

import { lagRng } from "../src/kort.ts";
import {
  ANTALL_INN,
  genomFraJson,
  utId,
  UT_KORT,
  UT_XT,
  utvidInnganger,
  type Genom,
  type KoblingGen,
} from "../src/neat/index.ts";

const dir = process.argv[2] ?? "trening-c4";
const GAMMEL_INN = 280;
const rng = lagRng(0x1a95);

function gauss(): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()) * 0.25;
}

function migrer(g: Genom): Genom {
  if (g.antallInn === ANTALL_INN) return g;
  if (g.antallInn !== GAMMEL_INN) throw new Error(`Uventet antallInn ${g.antallInn}`);
  const ny = utvidInnganger(g, ANTALL_INN);
  const koblinger: KoblingGen[] = ny.koblinger;
  const finnes = new Set(koblinger.map((k) => `${k.inn}>${k.ut}`));
  let nesteInnov = -2000; // plassholdere; kanoniseres ved lasting
  const leggTil = (inn: number, ut: number, vekt: number): void => {
    if (finnes.has(`${inn}>${ut}`)) return;
    finnes.add(`${inn}>${ut}`);
    koblinger.push({ inn, ut, vekt, aktiv: true, innovasjon: nesteInnov-- });
  };
  // Nav: skjulte noder med flest aktive koblinger inn til korthodet.
  const kortFra = utId(ANTALL_INN, UT_KORT);
  const utgrad = new Map<number, number>();
  for (const k of koblinger) {
    if (k.aktiv && k.ut >= kortFra && k.ut < kortFra + 52) {
      utgrad.set(k.inn, (utgrad.get(k.inn) ?? 0) + 1);
    }
  }
  const nav = [...utgrad.entries()]
    .filter(([id]) => ny.noder.some((n) => n.id === id && n.type === "skjult"))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([id]) => id);
  for (let inn = GAMMEL_INN; inn < ANTALL_INN; inn++) {
    for (let t = 0; t < 2 && nav.length > 0; t++) {
      leggTil(inn, nav[Math.floor(rng() * nav.length)]!, gauss());
    }
    leggTil(inn, kortFra + Math.floor(rng() * 52), gauss());
    leggTil(inn, utId(ANTALL_INN, UT_XT), gauss() * 0.5);
  }
  return ny;
}

function medBackup(fil: string, jobb: () => void): void {
  copyFileSync(fil, fil.replace(/\.json$/, "-foer-lagspill.json"));
  jobb();
  console.log(`migrerte ${fil}`);
}

// befolkning.json: {genomer, hall, terskel}
const befFil = `${dir}/befolkning.json`;
if (existsSync(befFil)) {
  medBackup(befFil, () => {
    const b = JSON.parse(readFileSync(befFil, "utf8")) as { genomer: Genom[]; hall: Genom[]; terskel?: number };
    writeFileSync(befFil, JSON.stringify({ ...b, genomer: b.genomer.map(migrer), hall: b.hall.map(migrer) }));
  });
}
// gull.json: {diff, gen, genom}
const gullFil = `${dir}/gull.json`;
if (existsSync(gullFil)) {
  medBackup(gullFil, () => {
    const gl = JSON.parse(readFileSync(gullFil, "utf8")) as { diff: number; gen: number; genom: Genom };
    writeFileSync(gullFil, JSON.stringify({ ...gl, genom: migrer(gl.genom) }));
  });
}
// Enkeltgenom-filer
for (const fil of ["mester.json", ...readdirSync(dir).filter((f) => f.startsWith("beste-benk-"))]) {
  const sti = `${dir}/${fil}`;
  if (!existsSync(sti)) continue;
  medBackup(sti, () => {
    writeFileSync(sti, JSON.stringify(migrer(genomFraJson(readFileSync(sti, "utf8")))));
  });
}
// start.json: array av genomer
const startFil = `${dir}/start.json`;
if (existsSync(startFil)) {
  medBackup(startFil, () => {
    const liste = JSON.parse(readFileSync(startFil, "utf8")) as Genom[];
    writeFileSync(startFil, JSON.stringify(liste.map(migrer)));
  });
}
console.log(`Ferdig: ${dir} migrert til ${ANTALL_INN} innganger`);
