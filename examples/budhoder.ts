/**
 * Lever budhodene? Måler SPREDNINGEN i xT-hodene over ekte budstillinger.
 *
 *   node examples/budhoder.ts trening-d5/gull.json trening-d6/beste.json
 *
 * velgBud er EV-maksimerende over en lært fordeling (lav/median/høy kvantil
 * av lagstikk). Er hodene døde – konstant utgang uansett hånd – kollapser
 * fordelingen til ett punkt, og budet blir det samme hver eneste gang
 * uansett hva agenten sitter med. Da er det ikke budREGELEN som er feil,
 * men at nettet aldri lærte å skille en god hånd fra en dårlig.
 *
 * Standardavvik ~0 = dødt hode. Vi måler også korrelasjonen mot en enkel
 * håndstyrke (antall kort i lengste farge + ess/konger), for et dødt hode
 * kan ikke korrelere med NOE.
 */

import { readFileSync } from "node:fs";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { genomFraJson, NeatAgent } from "../src/neat/index.ts";
import { spillerVisning } from "../src/motor.ts";
import { lagInn, UT_XT, UT_XT_LAV, UT_XT_HØY, UT_MARGIN } from "../src/neat/trekk.ts";
import { grådigHandling } from "./graadig.ts";

const filer: string[] = [];
let kamper = 30;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--kamper") kamper = Number(process.argv[++i]);
  else filer.push(a);
}

interface Prøve {
  xt: number;
  lav: number;
  høy: number;
  margin: number;
  styrke: number;
}

/** Samler budstillinger fra ekte spill (grådige motstandere, alle seter). */
function samleStillinger(antall: number): { s: GameState; sete: number }[] {
  const ut: { s: GameState; sete: number }[] = [];
  for (let f = 0; f < antall && ut.length < 4000; f++) {
    let s = opprettSpill({ antallSpillere: 4 }, 880_000 + f);
    let guard = 0;
    while (s.fase !== "FERDIG" && guard++ < 20_000) {
      if (s.fase === "RUNDE_SLUTT") {
        if (s.rundeNr + 1 >= 25) break;
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      if (s.fase === "BUDRUNDE") ut.push({ s, sete: s.iTur! });
      s = utfør(s, grådigHandling(s) as Handling).state;
    }
  }
  return ut;
}

/** Grov håndstyrke: lengste farge + antall ess/konger. Bare en referanse. */
function håndstyrke(s: GameState, sete: number): number {
  const hånd = s.hender[sete] ?? [];
  const l: Record<string, number> = {};
  let honnør = 0;
  for (const k of hånd) {
    l[k.farge] = (l[k.farge] ?? 0) + 1;
    if (k.verdi >= 13) honnør++;
  }
  return Math.max(0, ...Object.values(l)) + honnør;
}

const std = (x: readonly number[]): number => {
  const m = x.reduce((a, b) => a + b, 0) / x.length;
  return Math.sqrt(x.reduce((a, b) => a + (b - m) * (b - m), 0) / x.length);
};
const snitt = (x: readonly number[]): number => x.reduce((a, b) => a + b, 0) / x.length;
const korr = (a: readonly number[], b: readonly number[]): number => {
  const ma = snitt(a);
  const mb = snitt(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]! - ma;
    const y = b[i]! - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
};

const stillinger = samleStillinger(kamper);
console.log(`\n=== Budhoder over ${stillinger.length} ekte budstillinger ===\n`);
console.log("genom".padEnd(24) + ["std(xT)", "std(lav)", "std(høy)", "std(marg)", "snitt xT", "r(xT,styrke)"].map((h) => h.padStart(13)).join(""));
console.log("-".repeat(24 + 13 * 6));

for (const f of filer) {
  const rå = JSON.parse(readFileSync(f, "utf8")) as { genom?: unknown };
  const g = genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(f, "utf8"));
  const agent = new NeatAgent(g, { læringsrate: 0 });
  const p: Prøve[] = [];
  for (const { s, sete } of stillinger) {
    const inn = lagInn(spillerVisning(s, sete), "BUD", s.giving.antallStikk, s.regler.målPoeng);
    const ut = (agent as unknown as { nett: { aktiver(i: number[]): number[] } }).nett.aktiver(inn);
    const T = s.giving.antallStikk;
    const tilStikk = (v: number): number => ((v + 1) / 2) * T;
    p.push({
      xt: tilStikk(ut[UT_XT]!),
      lav: tilStikk(ut[UT_XT_LAV]!),
      høy: tilStikk(ut[UT_XT_HØY]!),
      margin: ut[UT_MARGIN]!,
      styrke: håndstyrke(s, sete),
    });
  }
  const navn = f.split(/[\\/]/).pop()!.slice(0, 22);
  console.log(
    navn.padEnd(24) +
      [
        std(p.map((x) => x.xt)).toFixed(4),
        std(p.map((x) => x.lav)).toFixed(4),
        std(p.map((x) => x.høy)).toFixed(4),
        std(p.map((x) => x.margin)).toFixed(4),
        snitt(p.map((x) => x.xt)).toFixed(2),
        korr(p.map((x) => x.xt), p.map((x) => x.styrke)).toFixed(3),
      ]
        .map((v) => v.padStart(13))
        .join(""),
  );
}
console.log("\nstd ~ 0 = dødt hode: samme bud uansett hånd.\n");
