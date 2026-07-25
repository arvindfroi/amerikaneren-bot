/**
 * E1 på den FROSNE benken: anger målt med gulv og tak fra samme utvalg.
 *
 *   node examples/e1-frysmaal.ts e1:e1-modell/e1-r1.bin --merk r1
 *   node examples/e1-frysmaal.ts e1:e1-modell/e1-r2.bin bidrag/d5-adoptert.json
 *
 * Hvorfor enda et målescript når `examples/neat-anger.ts` finnes: neat-anger
 * skriver bare kandidatens råtall. Råtallet er meningsløst alene – NevroHjerne
 * måler 0,9431 på de første 2000 stillingene i e1-frys og 0,8179 på
 * holdout-halvdelen. Her går alle tre tallene gjennom `mål()` i
 * src/moe2/maaling.ts, som ikke KAN konstrueres uten at kandidat, gulv og tak
 * beregnes over nøyaktig samme stillinger i samme kall.
 *
 * Utvalget er `lesAngerbenk`s holdout-halvdel (annenhver stilling), altså
 * NØYAKTIG det utvalget D8-ankeret rapporterer NEAT-genomene på. Da er E1 og
 * NEAT-linjene direkte sammenlignbare uten at noen må huske en konvensjon.
 *
 * ADVARSEL OM LEKKASJE: e1-frys er de første ~4 200 linjene av hvert skard i
 * e1-data3, som de ti orakelprosessene fortsatt skriver til. Et E1-nett trent
 * på e1-data3 uten filtrering har altså SETT benken. `verktoy/e1-tren.py
 * --utelat e1-frys` finnes nettopp derfor, og feltet `holdout` i utfilen sier
 * hva som gjelder for hver måling.
 */

import { appendFileSync, readFileSync } from "node:fs";

import { lesAngerbenk } from "../src/neat/angerfitness.ts";
import type { Benkstilling } from "../src/neat/angerbenk.ts";
import { genomFraJson } from "../src/neat/index.ts";
import { Nettverk } from "../src/neat/nett.ts";
import { UT_KORT } from "../src/neat/trekk.ts";
import { beskriv, framdrift, mål, overGulvet, slaarTaket } from "../src/moe2/maaling.ts";
import { forover, nettFraBytes } from "../src/nevro/nett.ts";
import { nevroHjerne } from "../src/nevro/index.ts";

const filer: string[] = [];
let mappe = "e1-frys";
let antall = 1_000_000;
let del: "holdout" | "trening" | "alle" = "holdout";
let utFil: string | null = "e1-frysmaal.jsonl";
let merke = "";
/** Settes når kandidaten kan ha sett benken – da er tallet IKKE et holdout-tall. */
let lekket = false;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--mappe") mappe = process.argv[++i] ?? mappe;
  else if (a === "--antall") antall = Number(process.argv[++i]);
  else if (a === "--del") del = (process.argv[++i] ?? "holdout") as typeof del;
  else if (a === "--ut") utFil = process.argv[++i] ?? null;
  else if (a === "--merk") merke = process.argv[++i] ?? "";
  else if (a === "--lekket") lekket = true;
  else filer.push(a);
}
if (filer.length === 0) {
  console.error("Bruk: node examples/e1-frysmaal.ts e1:<vektfil> | <genom.json> | nevro ...");
  process.exit(1);
}

const benk = lesAngerbenk(mappe, antall);
const sett: readonly Benkstilling[] =
  del === "holdout" ? benk.holdout : del === "trening" ? benk.trening : [...benk.trening, ...benk.holdout];
if (sett.length === 0) {
  console.error(`Fant ingen stillinger i ${mappe}`);
  process.exit(1);
}

/** Beste orakelverdi i stillingen – alle tre tallene måles som avstand ned fra den. */
function maks(s: Benkstilling): number {
  let m = -Infinity;
  for (const v of Object.values(s.v)) if (v > m) m = v;
  return m;
}
/** Anger ved å velge kortindeks `k`. */
function angerAv(s: Benkstilling, k: number): number {
  return maks(s) - (s.v[String(k)] ?? Math.min(...Object.values(s.v)));
}
/** Gulvet: forventet anger ved uniformt lovlig valg. Eksakt, ikke samplet. */
function gulvAv(s: Benkstilling): number {
  const v = Object.values(s.v);
  return maks(s) - v.reduce((a, b) => a + b, 0) / v.length;
}

const hjerne = nevroHjerne();
/** Taket: NevroHjernes anger. Måles i samme løkke som kandidaten, aldri lånt. */
function takAv(s: Benkstilling): number {
  const logits = forover(hjerne.spill, Float32Array.from(s.t.slice(0, 238)));
  const lovlige = Object.keys(s.v).map(Number);
  let beste = lovlige[0]!;
  for (const k of lovlige) if (logits[k]! > logits[beste]!) beste = k;
  return angerAv(s, beste);
}

type Velger = (s: Benkstilling) => number;
const kandidater: { navn: string; velg: Velger }[] = [];
for (const f of filer) {
  if (f === "nevro") {
    kandidater.push({ navn: "nevro", velg: takAv });
    continue;
  }
  if (f.startsWith("e1:")) {
    const nett = nettFraBytes(new Uint8Array(readFileSync(f.slice(3))))[0]!;
    kandidater.push({
      navn: f,
      velg: (s) => {
        const logits = forover(nett, Float32Array.from(s.t));
        const lovlige = Object.keys(s.v).map(Number);
        let beste = lovlige[0]!;
        for (const k of lovlige) if (logits[k]! > logits[beste]!) beste = k;
        return angerAv(s, beste);
      },
    });
    continue;
  }
  // NEAT-genom: scores på NEAT-vektoren (318), som e1-frys har for alle rader.
  const rå = JSON.parse(readFileSync(f, "utf8")) as { genom?: unknown };
  const nett = new Nettverk(genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(f, "utf8")));
  kandidater.push({
    // Hele stien, ikke bare filnavnet: fem linjer som alle heter «gull.json»
    // er en ubrukelig logg.
    navn: f.replace(/\\/g, "/"),
    velg: (s) => {
      const ut = nett.aktiver([...s.nt!]);
      const lovlige = Object.keys(s.v).map(Number);
      let beste = lovlige[0]!;
      for (const k of lovlige) if (ut[UT_KORT + k]! > ut[UT_KORT + beste]!) beste = k;
      return angerAv(s, beste);
    },
  });
}

/**
 * Parret standardfeil for kandidat minus tak, over stillinger.
 *
 * Stillingene er ikke uavhengige (flere per giver), så dette er et OPTIMISTISK
 * anslag – men den parrede differansen er uansett langt skarpere enn to
 * separate snitt, og fortegnet er det vi bruker den til.
 */
function parretSe(d: readonly number[]): number {
  if (d.length < 2) return NaN;
  const m = d.reduce((a, b) => a + b, 0) / d.length;
  return Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / (d.length - 1) / d.length);
}

console.log(`Benk ${mappe}, del «${del}»: ${sett.length} stillinger\n`);
for (const k of kandidater) {
  const diff: number[] = [];
  const m = mål({
    navn: k.navn,
    stillinger: sett,
    holdout: del === "holdout" && !lekket,
    retning: "lavereErBedre",
    kandidat: (s) => {
      const a = k.velg(s);
      diff.push(a - takAv(s));
      return a;
    },
    gulv: gulvAv,
    tak: takAv,
  });
  const se = parretSe(diff);
  const snittDiff = diff.reduce((a, b) => a + b, 0) / diff.length;
  console.log(beskriv(m));
  console.log(
    `  mot nevro: ${snittDiff >= 0 ? "+" : ""}${snittDiff.toFixed(4)} ± ${se.toFixed(4)} anger ` +
      `(negativt = bedre enn nevro)`,
  );
  if (utFil !== null) {
    appendFileSync(
      utFil,
      JSON.stringify({
        tid: new Date().toISOString(),
        kandidat: m.navn,
        benk: mappe,
        del,
        n: m.n,
        anger: Math.round(m.verdi * 1e4) / 1e4,
        gulv: Math.round(m.gulv * 1e4) / 1e4,
        tak: Math.round(m.tak * 1e4) / 1e4,
        framdrift: Math.round(1e3 * framdrift(m)) / 1e3,
        motNevro: Math.round(snittDiff * 1e4) / 1e4,
        motNevroSe: Math.round(se * 1e4) / 1e4,
        overGulvet: overGulvet(m),
        slaarNevro: slaarTaket(m),
        holdout: m.holdout,
        merke,
      }) + "\n",
    );
  }
}
if (utFil !== null) console.log(`\nSkrevet til ${utFil}`);
