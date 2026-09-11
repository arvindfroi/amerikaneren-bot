/**
 * SØKETS VERDENER — blir de bedre med MLB-trohodet? (11. sep)
 *
 *   node examples/sok-verdener.ts --giver 400 --skard 0/8 --ut D:/amb-grp/sokv/s0.jsonl
 *   node examples/sok-verdener.ts --les "D:/amb-grp/sokv/s*.jsonl"
 *
 * Søket i den utrullede boten (`sik:foerer:0.5:24`) trekker verdener vektet etter BUDET,
 * blant tre kandidater. MLB-trohodet er langt skarpere enn noe annet trosnett her
 * (K8-tap ~0,95 mot ~1,05), men satt aldri i søket. Denne målingen kommer FØR
 * spørsmålet om poeng: blir verdenene ikke bedre, er det ingen vits i å måle nedstrøms.
 *
 * ============================== MÅLTALLET =================================
 *
 * Andel av motstandernes SKJULTE håndkort som ligger hos riktig spiller, i snitt over de
 * V trukne verdenene. Samme mål som `tro-sampler.ts`, men gjennom PRODUKSJONSVEIEN
 * (`trekkVerdener` med de samme argumentene `vurderPar` gir), ikke en egen kopi.
 *
 * Alle armene får samme frø per stilling, så forskjellene er parvise mot `app`. SE er
 * gruppert per giv (per kamp i `--kamp`). Tiden er for trekningen alene — utspillingen
 * er lik for alle armene.
 *
 * ============================== HUKOMMELSEN (--kamp) ======================
 *
 * Run-time-tilpasning: et trohode som leser hukommelsen (804 inn) ser hva motstanderne
 * har gjort i de FERDIGE rundene av DENNE kampen. Det kan bare synes fra runde 2, så
 * `--kamp` spiller hele kamper til 100 og tar stillinger fra `--fra-runde` (standard 2).
 * Boka føres av `Hukommelse` på hver tilstand, også `RUNDE_SLUTT` — nøyaktig det en
 * agent ser. Armer gis som `navn|kandidater|budvekt(0/1)|fil` (fil `-` = uten tro):
 *
 *   --armer "app|3|1|-,uten|32|0|D:/amb-grp/r2roeyk/tro-uten.bin,huk|32|0|D:/amb-grp/r2roeyk/tro-huk.bin"
 */

import { appendFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lagRng } from "../src/kort.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { intTilKort } from "../src/solver/dds.ts";
import { lagIndre, ADAMS } from "../src/moe2/agentspek.ts";
import { trekkVerdener } from "../src/moe2/sdkort.ts";
import { lagTrovektFraVisning } from "../src/moe2/troprior.ts";
import { rolleFor } from "../src/moe2/rolleorakel.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";

const arg = (navn: string, standard: string): string => {
  const i = process.argv.indexOf(navn);
  return i < 0 ? standard : process.argv[i + 1]!;
};

const FASTE = new Set(["giv", "runde", "stikk", "rolle"]);

const les = arg("--les", "");
if (les !== "") {
  // Ikke `fs.globSync`: med en absolutt Windows-sti fant den ingenting og rapporten sa
  // «0 stillinger» uten å feile. Katalog + `*` i filnavnet er alt som trengs.
  const mønster = new RegExp(`^${basename(les).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
  const filer = readdirSync(dirname(les)).filter((f) => mønster.test(f)).map((f) => join(dirname(les), f));
  if (filer.length === 0) throw new Error(`Ingen filer for «${les}»`);
  const rader: Record<string, number | string>[] = [];
  for (const f of filer) {
    for (const l of readFileSync(f, "utf8").split("\n")) if (l.trim() !== "") rader.push(JSON.parse(l));
  }
  const armer = Object.keys(rader[0] ?? {}).filter((k) => !FASTE.has(k) && !k.endsWith("_ms"));
  const grunn = armer.includes("app") ? "app" : armer[0]!;
  const oppsummer = (filter: (r: Record<string, number | string>) => boolean, merke: string): void => {
    const utvalg = rader.filter(filter);
    console.log(`\n${merke}: ${utvalg.length} stillinger`);
    if (utvalg.length === 0) return;
    for (const a of armer) {
      const snitt = utvalg.reduce((s, r) => s + (r[a] as number), 0) / utvalg.length;
      const ms = utvalg.reduce((s, r) => s + (r[`${a}_ms`] as number), 0) / utvalg.length;
      // Parvis mot grunnarmen, gruppert per giv/kamp.
      const g = new Map<string, [number, number]>();
      for (const r of utvalg) {
        const k = String(r.giv);
        const [s0, n0] = g.get(k) ?? [0, 0];
        g.set(k, [s0 + (r[a] as number) - (r[grunn] as number), n0 + 1]);
      }
      const par = [...g.values()];
      const N = par.reduce((x, [, n]) => x + n, 0);
      const m = par.reduce((x, [s]) => x + s, 0) / N;
      const G = par.length;
      const se = Math.sqrt((G / Math.max(1, G - 1)) * par.reduce((acc, [s, n]) => acc + (s - m * n) ** 2, 0)) / N;
      console.log(
        `  ${a.padEnd(8)} treff ${(snitt * 100).toFixed(2)} %   mot ${grunn} ${m >= 0 ? "+" : ""}${(m * 100).toFixed(2)} ± ${(se * 100).toFixed(2)} pp   trekning ${ms.toFixed(1)} ms`,
      );
    }
  };
  oppsummer(() => true, "ALLE ROLLER");
  for (const rolle of ["foerer", "makker", "forsvar"]) oppsummer((r) => r.rolle === rolle, rolle.toUpperCase());
  // `rundeNr` er 0-basert (motor.ts `opprettSpill`): 0 er første runde, uten hukommelse.
  if (rader.some((r) => (r.runde as number) > 0)) {
    oppsummer((r) => (r.runde as number) === 0, "RUNDE 1 (rundeNr 0)");
    oppsummer((r) => (r.runde as number) >= 1 && (r.runde as number) <= 3, "RUNDE 2-4 (rundeNr 1-3)");
    oppsummer((r) => (r.runde as number) >= 4, "RUNDE 5+ (rundeNr 4+)");
  }
  process.exit(0);
}

interface Arm {
  readonly navn: string;
  readonly kand: number;
  readonly budvekt: boolean;
  readonly nett: MlbTronett | null;
}

const nettbuf = new Map<string, MlbTronett>();
const lesNett = (fil: string): MlbTronett => {
  let n = nettbuf.get(fil);
  if (n === undefined) {
    n = MlbTronett.fraBytes(readFileSync(fil));
    nettbuf.set(fil, n);
  }
  return n;
};

const mlbFil = arg("--mlbtro", "e1-modell/mlb-tro.bin");
const armspek = arg(
  "--armer",
  `app|3|1|-,bud32|32|1|-,mlb32|32|1|${mlbFil},mlbu32|32|0|${mlbFil},mlbu8|8|0|${mlbFil}`,
);
const ARMER: Arm[] = armspek.split(",").map((del) => {
  const [navn, kand, bud, fil] = del.split("|");
  if (navn === undefined || kand === undefined || bud === undefined || fil === undefined || FASTE.has(navn)) {
    throw new Error(`Ugyldig arm «${del}» — forventet navn|kandidater|budvekt|fil`);
  }
  return { navn, kand: Number(kand), budvekt: bud === "1", nett: fil === "-" ? null : lesNett(fil) };
});

const kampmodus = process.argv.includes("--kamp");
const givere = Number(arg("--giver", "400"));
const [skardI, skardN] = arg("--skard", "0/1").split("/").map(Number) as [number, number];
const V = Number(arg("--verdener", "24"));
// `rundeNr` er 0-basert: 1 er andre runde, den første med noe i boka. (Første måling
// 11. sep kjørte med 2, altså fra tredje runde.)
const fraRunde = Number(arg("--fra-runde", kampmodus ? "1" : "0"));
const sjanse = Number(arg("--sjanse", kampmodus ? "0.1" : "0.3"));
const ut = arg("--ut", "D:/amb-grp/sokv/s0.jsonl");
mkdirSync(dirname(ut), { recursive: true });

/** Andel av motstandernes håndkort verdenen legger hos riktig spiller. */
function treff(s: GameState, sete: number, hender: readonly (readonly number[])[]): number {
  let r = 0;
  let n = 0;
  for (let p = 0; p < s.antallSpillere; p++) {
    if (p === sete) continue;
    const ekte = new Set((s.hender[p] ?? []).map(kortIndeks));
    n += ekte.size;
    for (const c of hender[p] ?? []) if (ekte.has(kortIndeks(intTilKort(c)))) r++;
  }
  return n === 0 ? 1 : r / n;
}

// `--drivere "a|b|c|d"`: hvert sete sin spek. Et bord der motstanderne spiller ULIKT er
// der hukommelsen har noe å lære; fire like Adams gir den nesten ingenting (+0,12 pp).
const drivere = arg("--drivere", ADAMS).split("|");
const agenter = [0, 1, 2, 3].map((i) => lagIndre(drivere[i % drivere.length]!));
const velg = lagRng(4_411_000 + skardI);
let skrevet = 0;
for (let g = skardI; g < givere; g += skardN) {
  let s: GameState = opprettSpill(
    kampmodus ? { antallSpillere: 4, målPoeng: 100 } : { antallSpillere: 4 },
    620_000_000 + g * 7717,
  );
  for (const a of agenter) a.nyKamp();
  // Én bok for bordet: den bokfører hvert sete, og `vektor(sete)` roterer.
  const bok = new Hukommelse();
  let vakt = 0;
  while (s.fase !== "FERDIG" && vakt++ < 20_000) {
    bok.observer(s);
    /**
     * DRIVERNE SER HVER TILSTAND OGSÅ (12. sep), ikke bare bordets bok. Løkka utfører NESTE selv, og
     * i `--kamp` fikk ingen driver se en runde slutte: kravbatteriets K8 kjører denne fila med
     * helbotens drivere, og et kortnett med motstanderbok (`e1:<493>`, `Kortbok`) kastet i runde 1.
     * BudQ 287/323 og `profil:` i driverne kastet ikke — de spilte STILLE på tomme bøker, så
     * `--kamp`-radene for slike drivere endres av denne linja (feilen rettet). Drivere uten bok
     * (`ADAMS`, standard) er uendret: kallet er en no-op for dem.
     */
    for (const a of agenter) a.observer?.(s);
    if (s.fase === "RUNDE_SLUTT") {
      if (!kampmodus) break;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (sete === null || sete === undefined) break;
    if (s.fase === "SPILL" && s.trumf !== null && s.rundeNr >= fraRunde && s.hender[sete]!.length >= 2 && velg() < sjanse) {
      const rad: Record<string, unknown> = { giv: g, runde: s.rundeNr, stikk: s.stikkSpilt, rolle: rolleFor(s, sete) };
      const frø = (g * 1_000_003 + s.rundeNr * 7919 + s.stikkSpilt * 97 + sete) >>> 0;
      const huk = bok.vektor(sete, s.antallSpillere);
      for (const a of ARMER) {
        const t0 = performance.now();
        const vekt =
          a.nett === null
            ? undefined
            : (lagTrovektFraVisning(a.nett, s, sete, a.nett.brukerHukommelse ? huk : null) ?? undefined);
        const verdener = trekkVerdener(s, sete, V, lagRng(frø), undefined, vekt, a.kand, undefined, a.budvekt);
        rad[`${a.navn}_ms`] = Number((performance.now() - t0).toFixed(2));
        rad[a.navn] =
          verdener.length === 0 ? 0 : Number((verdener.reduce((x, w) => x + treff(s, sete, w), 0) / verdener.length).toFixed(5));
      }
      appendFileSync(ut, JSON.stringify(rad) + "\n");
      skrevet++;
    }
    s = utfør(s, agenter[sete]!.velgHandling(s)).state;
  }
}
console.log(`Skard ${skardI}/${skardN} ferdig: ${skrevet} stillinger -> ${ut}`);
