/**
 * SØKETS VERDENER — blir de bedre med MLB-trohodet? (11. sep)
 *
 *   node examples/sok-verdener.ts --giver 400 --skard 0/8 --ut analyse/sok-verdener/s0.jsonl
 *   node examples/sok-verdener.ts --les "analyse/sok-verdener/s*.jsonl"
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
 * Alle armene får samme frø per stilling, så forskjellene er parvise. SE er gruppert per
 * giv. Tiden er for trekningen alene — utspillingen er lik for alle armene.
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lagRng } from "../src/kort.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { intTilKort } from "../src/solver/dds.ts";
import { lagIndre, ADAMS } from "../src/moe2/agentspek.ts";
import { trekkVerdener } from "../src/moe2/sdkort.ts";
import { lagTrovekt, lagTrovektFraVisning } from "../src/moe2/troprior.ts";
import { rolleFor } from "../src/moe2/rolleorakel.ts";
import { Trosnett } from "../src/moe2/trosnett.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import { nettFraBytes } from "../src/nevro/nett.ts";

const arg = (navn: string, standard: string): string => {
  const i = process.argv.indexOf(navn);
  return i < 0 ? standard : process.argv[i + 1]!;
};

interface Arm {
  readonly navn: string;
  readonly kand: number;
  readonly budvekt: boolean;
  readonly tro: "ingen" | "mlb" | "e1";
}

const ARMER: Arm[] = [
  { navn: "app", kand: 3, budvekt: true, tro: "ingen" },
  { navn: "bud32", kand: 32, budvekt: true, tro: "ingen" },
  { navn: "mlb32", kand: 32, budvekt: true, tro: "mlb" },
  { navn: "mlbu32", kand: 32, budvekt: false, tro: "mlb" },
  { navn: "mlbu8", kand: 8, budvekt: false, tro: "mlb" },
];

const les = arg("--les", "");
if (les !== "") {
  // Ikke `fs.globSync`: med en absolutt Windows-sti fant den ingenting og rapporten sa
  // «0 stillinger» uten å feile. Katalog + `*` i filnavnet er alt som trengs.
  const { readdirSync } = await import("node:fs");
  const { basename, join } = await import("node:path");
  const mønster = new RegExp(`^${basename(les).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
  const filer = readdirSync(dirname(les)).filter((f) => mønster.test(f)).map((f) => join(dirname(les), f));
  if (filer.length === 0) throw new Error(`Ingen filer for «${les}»`);
  const rader: Record<string, unknown>[] = [];
  for (const f of filer) {
    for (const l of readFileSync(f, "utf8").split("\n")) if (l.trim() !== "") rader.push(JSON.parse(l));
  }
  const gruppe = (r: Record<string, unknown>): string => String(r.giv);
  const oppsummer = (filter: (r: Record<string, unknown>) => boolean, merke: string): void => {
    const utvalg = rader.filter(filter);
    console.log(`\n${merke}: ${utvalg.length} stillinger`);
    for (const a of ARMER.filter((x) => utvalg.length > 0 && x.navn in utvalg[0]!)) {
      const snitt = utvalg.reduce((s, r) => s + (r[a.navn] as number), 0) / utvalg.length;
      const ms = utvalg.reduce((s, r) => s + (r[`${a.navn}_ms`] as number), 0) / utvalg.length;
      // Parvis mot app, gruppert per giv.
      const g = new Map<string, number[]>();
      for (const r of utvalg) {
        const d = (r[a.navn] as number) - (r.app as number);
        const k = gruppe(r);
        g.set(k, [...(g.get(k) ?? []), d]);
      }
      const sum = [...g.values()].map((v) => v.reduce((x, y) => x + y, 0));
      const ant = [...g.values()].map((v) => v.length);
      const N = ant.reduce((x, y) => x + y, 0);
      const m = sum.reduce((x, y) => x + y, 0) / N;
      const G = sum.length;
      const se = Math.sqrt((G / Math.max(1, G - 1)) * sum.reduce((acc, s, i) => acc + (s - m * ant[i]!) ** 2, 0)) / N;
      console.log(
        `  ${a.navn.padEnd(8)} treff ${(snitt * 100).toFixed(2)} %   mot app ${(m * 100 >= 0 ? "+" : "")}${(m * 100).toFixed(2)} ± ${(se * 100).toFixed(2)} pp   trekning ${ms.toFixed(1)} ms`,
      );
    }
  };
  oppsummer(() => true, "ALLE ROLLER");
  for (const rolle of ["foerer", "makker", "forsvar"]) oppsummer((r) => r.rolle === rolle, rolle.toUpperCase());
  process.exit(0);
}

const givere = Number(arg("--giver", "400"));
const [skardI, skardN] = arg("--skard", "0/1").split("/").map(Number) as [number, number];
const V = Number(arg("--verdener", "24"));
const ut = arg("--ut", "analyse/sok-verdener/s0.jsonl");
const mlbTro = MlbTronett.fraBytes(readFileSync(arg("--mlbtro", "e1-modell/mlb-tro.bin")));
// Det gamle trosnettet (e1-trekk) ligger ikke i repoet; armen er med bare når fila gis.
const e1Sti = arg("--e1tro", "");
const e1Tro = e1Sti === "" ? null : new Trosnett(nettFraBytes(new Uint8Array(readFileSync(e1Sti)))[0]!);
if (e1Tro !== null) ARMER.push({ navn: "e1tro32", kand: 32, budvekt: true, tro: "e1" });
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

const agenter = [0, 1, 2, 3].map(() => lagIndre(ADAMS));
const velg = lagRng(4_411_000 + skardI);
let skrevet = 0;
for (let g = skardI; g < givere; g += skardN) {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 620_000_000 + g * 7717);
  for (const a of agenter) a.nyKamp();
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
    const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (sete === null || sete === undefined) break;
    if (s.fase === "SPILL" && s.trumf !== null && s.hender[sete]!.length >= 2 && velg() < 0.3) {
      const rad: Record<string, unknown> = { giv: g, stikk: s.stikkSpilt, rolle: rolleFor(s, sete) };
      const frø = (g * 1_000_003 + s.stikkSpilt * 97 + sete) >>> 0;
      for (const a of ARMER) {
        const t0 = performance.now();
        const vekt =
          a.tro === "mlb"
            ? (lagTrovektFraVisning(mlbTro, s, sete, null) ?? undefined)
            : a.tro === "e1"
              ? (lagTrovekt(e1Tro!, s, sete) ?? undefined)
              : undefined;
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
