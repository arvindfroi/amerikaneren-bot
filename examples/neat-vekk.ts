/**
 * Sensor-vekking: kobler PÅ blinde sensorer og døve hoder i lagrede genomer.
 *
 *   node examples/neat-vekk.ts <dir=trening-c4> <utfil=dir/start.json>
 *
 * Målt problem: nye innganger/utganger fra migreringene forble ukoblede –
 * mesteren hadde 0/9 boss-sensorer, 0/6 taktikk-sensorer og 2/12
 * renons-sensorer i bruk, og kvantil-/makker-hodene hadde KUN
 * bias-ankeret (konstant utgang). Sjansen for at tilfeldige mutasjoner
 * treffer riktig sensor→hode-par er ørliten, så strukturen gis eksplisitt:
 *
 *  - Hver ukoblet sensorinngang får små koblinger til 2 tilfeldige
 *    «nav» (skjulte noder med høy utgrad mot korthodet) + 1 kortutgang.
 *  - xT-lav/xT-høy/makker-hodene arver xT-hodets kilder (skalerte vekter)
 *    – kvantilene skal se det medianen ser; kalibreringen justerer resten.
 *
 * Vektene er små (~N(0, 0,25)) – strukturen tilbys, seleksjonen og
 * regret-læringen avgjør verdien. Alle innovasjonsnumre kanoniseres ved
 * lasting. Skriver vekkede utgaver av mester + arkiverte topper til en
 * startfil for --fra-flere. Reverserbart: originalfilene røres ikke.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { lagRng } from "../src/kort.ts";
import {
  ANTALL_INN,
  ANTALL_UT,
  genomFraJson,
  utId,
  UT_KORT,
  UT_MAKKER,
  UT_XT,
  UT_XT_HØY,
  UT_XT_LAV,
  type Genom,
  type KoblingGen,
} from "../src/neat/index.ts";

const dir = process.argv[2] ?? "trening-c4";
const utfil = process.argv[3] ?? `${dir}/start.json`;

const rng = lagRng(0x5eed);

function gaussisk(): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()) * 0.25;
}

function vekk(g: Genom): { genom: Genom; nyeSensor: number; nyeHode: number } {
  const koblinger: KoblingGen[] = g.koblinger.map((k) => ({ ...k }));
  const aktive = koblinger.filter((k) => k.aktiv);
  const harUt = new Set(aktive.map((k) => k.inn));
  let nesteInnov = -1000; // plassholdere; kanoniseres ved lasting
  const finnes = new Set(koblinger.map((k) => `${k.inn}>${k.ut}`));
  const leggTil = (inn: number, ut: number, vekt: number): boolean => {
    if (finnes.has(`${inn}>${ut}`)) return false;
    finnes.add(`${inn}>${ut}`);
    koblinger.push({ inn, ut, vekt, aktiv: true, innovasjon: nesteInnov-- });
    return true;
  };

  // «Nav»: skjulte noder med flest aktive koblinger inn til korthodet.
  const kortFra = utId(ANTALL_INN, UT_KORT);
  const kortTil = kortFra + 52;
  const utgrad = new Map<number, number>();
  for (const k of aktive) {
    if (k.ut >= kortFra && k.ut < kortTil) utgrad.set(k.inn, (utgrad.get(k.inn) ?? 0) + 1);
  }
  const nav = [...utgrad.entries()]
    .filter(([id]) => g.noder.some((n) => n.id === id && n.type === "skjult"))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([id]) => id);

  // 1) Ukoblede sensorinnganger (253..279) → 2 nav + 1 kortutgang.
  let nyeSensor = 0;
  for (let inn = 253; inn < ANTALL_INN; inn++) {
    if (harUt.has(inn)) continue;
    for (let t = 0; t < 2 && nav.length > 0; t++) {
      if (leggTil(inn, nav[Math.floor(rng() * nav.length)]!, gaussisk())) nyeSensor++;
    }
    if (leggTil(inn, kortFra + Math.floor(rng() * 52), gaussisk())) nyeSensor++;
  }

  // 2) Døve hoder arver xT-hodets kilder med skalerte vekter.
  const xtKilder = aktive.filter((k) => k.ut === utId(ANTALL_INN, UT_XT));
  let nyeHode = 0;
  for (const [hode, skala] of [
    [UT_XT_LAV, 0.8],
    [UT_XT_HØY, 0.8],
    [UT_MAKKER, 0.5],
  ] as const) {
    const mål = utId(ANTALL_INN, hode);
    for (const kilde of xtKilder) {
      if (leggTil(kilde.inn, mål, kilde.vekt * skala + gaussisk() * 0.2)) nyeHode++;
    }
  }

  return { genom: { ...g, koblinger }, nyeSensor, nyeHode };
}

const filer = new Set<string>();
if (existsSync(`${dir}/mester.json`)) filer.add(`${dir}/mester.json`);
for (const f of readdirSync(dir)) if (f.startsWith("beste-benk-")) filer.add(`${dir}/${f}`);

const vekkede: Genom[] = [];
for (const fil of filer) {
  const g = genomFraJson(readFileSync(fil, "utf8"));
  if (g.antallInn !== ANTALL_INN || g.antallUt !== ANTALL_UT) {
    console.error(`${fil}: feil dimensjoner – hopper over`);
    continue;
  }
  const { genom, nyeSensor, nyeHode } = vekk(g);
  vekkede.push(genom);
  console.log(`${fil}: +${nyeSensor} sensorkoblinger, +${nyeHode} hodekoblinger`);
}

mkdirSync(dirname(utfil), { recursive: true });
writeFileSync(utfil, JSON.stringify(vekkede));
console.log(`Skrev ${vekkede.length} vekkede genomer til ${utfil}`);
