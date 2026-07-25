/**
 * Kontraktobduksjon: HVORFOR faller en kontrakt?
 *
 *   node examples/kontraktobduksjon.ts trening-d5/beste.json --kamper 60
 *
 * Arvind stilte spørsmålet slik: «hvordan klarer den å felle kontrakten sin
 * hvis den byr 6? den burde ikke gå an.» Med 12 stikk og en makker skal et
 * bud på 5–6 være nesten gratis – med mindre laget aldri BLIR et lag.
 *
 * Derfor deles hver kontrakt på om makkeren faktisk ble funnet. Etterlyser
 * budvinneren et kort som ligger i talongen (eller som den selv sitter med),
 * står den ALENE mot tre – og da er 5 av 12 stikk plutselig en hard kontrakt,
 * ikke en gratis en. Måles per budnivå, med trumflengde ved siden av.
 */

import { readFileSync } from "node:fs";

import type { Farge } from "../src/kort.ts";
import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { genomFraJson, NeatAgent } from "../src/neat/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { grådigHandling } from "./graadig.ts";

const filer: string[] = [];
let kamper = 60;
let motstander: "graadig" | "nevro" = "graadig";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--mot") motstander = process.argv[++i] as typeof motstander;
  else filer.push(a);
}

interface Kontrakt {
  bud: number;
  lagStikk: number;
  egneStikk: number;
  klart: boolean;
  makkerFunnet: boolean;
  trumfLengde: number;
}

type Velger = { nyKamp(): void; velgHandling(s: GameState): Handling };

function lengder(hånd: readonly { farge: Farge }[]): Record<string, number> {
  const l: Record<string, number> = {};
  for (const k of hånd) l[k.farge] = (l[k.farge] ?? 0) + 1;
  return l;
}

function spill(lag: () => Velger, ut: Kontrakt[], frø: number, sete: number): void {
  const agent = lag();
  agent.nyKamp();
  const mot = motstander === "nevro" ? [new NevroAgent(), new NevroAgent(), new NevroAgent()] : null;
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  let trumfLengde = 0;
  let guard = 0;
  while (s.fase !== "FERDIG" && guard++ < 60_000) {
    if (s.fase === "RUNDE_SLUTT") {
      if (s.rundeNr + 1 >= 25) break;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
    const min = iTur === sete;
    const h = min
      ? agent.velgHandling(s)
      : mot !== null
        ? mot[(iTur! + 3) % 3]!.velgHandling(s)
        : grådigHandling(s);

    if (min && h.type === "VELG") {
      const hånd = s.hender[sete] ?? [];
      trumfLengde = lengder(hånd)[h.trumf] ?? 0;
    }
    const res = utfør(s, h);
    for (const e of res.hendelser) {
      if (e.type !== "RUNDE_SLUTT") continue;
      const r = e.resultat;
      if (r.budvinner !== sete || r.melding.type !== "tall") continue;
      ut.push({
        bud: r.melding.bud,
        lagStikk: r.lagStikk,
        egneStikk: r.stikkVunnet[sete] ?? 0,
        klart: r.klart,
        makkerFunnet: r.makker !== null && r.makker !== sete,
        trumfLengde,
      });
    }
    s = res.state;
  }
}

const kandidater: { navn: string; lag: () => Velger }[] = [];
for (const f of filer) {
  const rå = JSON.parse(readFileSync(f, "utf8")) as { genom?: unknown };
  const g = genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(f, "utf8"));
  kandidater.push({ navn: f.split(/[\\/]/).pop()!.slice(0, 20), lag: () => new NeatAgent(g, { læringsrate: 0 }) });
}
kandidater.push({ navn: "NevroHjerne", lag: () => new NevroAgent() });

const snitt = (x: readonly number[]): string =>
  x.length === 0 ? "–" : (x.reduce((a, b) => a + b, 0) / x.length).toFixed(2);
const pst = (a: number, b: number): string => (b === 0 ? "–" : `${Math.round((100 * a) / b)} %`);

console.log(`\n=== Kontraktobduksjon, ${kamper} givere x 4 seter mot ${motstander} ===\n`);

for (const k of kandidater) {
  const kontrakter: Kontrakt[] = [];
  for (let f = 0; f < kamper; f++)
    for (let sete = 0; sete < 4; sete++) spill(k.lag, kontrakter, 970_000 + f, sete);

  console.log(`--- ${k.navn} (${kontrakter.length} kontrakter) ---`);
  const medMakker = kontrakter.filter((c) => c.makkerFunnet);
  const alene = kontrakter.filter((c) => !c.makkerFunnet);
  console.log(
    `  makker funnet: ${pst(medMakker.length, kontrakter.length)}` +
      `   klart MED makker: ${pst(medMakker.filter((c) => c.klart).length, medMakker.length)}` +
      `   klart ALENE: ${pst(alene.filter((c) => c.klart).length, alene.length)}`,
  );
  console.log(`  bud | n | klart | lagstikk | egne | trumflengde | makker funnet`);
  for (let b = 5; b <= 12; b++) {
    const c = kontrakter.filter((x) => x.bud === b);
    if (c.length === 0) continue;
    console.log(
      `   ${String(b).padStart(2)} | ${String(c.length).padStart(4)} | ${pst(c.filter((x) => x.klart).length, c.length).padStart(5)} | ` +
        `${snitt(c.map((x) => x.lagStikk)).padStart(8)} | ${snitt(c.map((x) => x.egneStikk)).padStart(4)} | ` +
        `${snitt(c.map((x) => x.trumfLengde)).padStart(11)} | ${pst(c.filter((x) => x.makkerFunnet).length, c.length).padStart(6)}`,
    );
  }
  // HVA BURDE DEN BUDT? Reglene gir budvinner +2n klart, -2n falt, altsaa
  // EV(n) = 2n*(2*P(lagStikk >= n) - 1). Break-even er 50 % klaring. Regnet
  // ut av den EMPIRISKE stikkfordelingen svarer dette direkte paa om et
  // hoeyere bud faktisk hadde loennet seg, eller om lavt bud er korrekt.
  const stikk = kontrakter.map((c) => c.lagStikk);
  if (stikk.length > 0) {
    const ev: string[] = [];
    let bestN = 0;
    let bestEV = -Infinity;
    for (let n = 5; n <= 12; n++) {
      const p = stikk.filter((x) => x >= n).length / stikk.length;
      const e = 2 * n * (2 * p - 1);
      if (e > bestEV) { bestEV = e; bestN = n; }
      ev.push(`${n}:${e.toFixed(1)}`);
    }
    console.log(`  EV per bud (2n(2p-1)): ${ev.join("  ")}`);
    console.log(`  -> poeng-optimalt bud = ${bestN} (EV ${bestEV.toFixed(1)}), faktisk bud = ${snitt(kontrakter.map((c) => c.bud))}`);
  }

  // Hvor mange stikk mangler de som faller?
  const falt = kontrakter.filter((c) => !c.klart);
  console.log(
    `  FALT: ${falt.length} (${pst(falt.length, kontrakter.length)}), manglet i snitt ` +
      `${snitt(falt.map((c) => c.bud - c.lagStikk))} stikk, makker funnet i ${pst(falt.filter((c) => c.makkerFunnet).length, falt.length)}\n`,
  );
}
