/**
 * HAR TROVEKTEN I DET HELE TATT NOE Å VELGE MELLOM?
 *
 *   node examples/troledd-vektspredning.ts --runder 6
 *
 * ============ HVORFOR DENNE MÅLINGEN ER BILLIG OG LIKEVEL AVGJØRENDE ======
 *
 * `troledd.ts` koster utspillinger. Denne koster INGEN: den stopper der troen
 * faktisk virker — på vekten over de 32 kandidatverdenene — og ser aldri på
 * hva som skjer etterpå. Den svarer på hypotesen oppdraget stiller direkte:
 *
 *   «kandidatutvalget: `k32` trekker 32 kandidatverdener og vekter; hvis
 *    vekten er nesten flat, hjelper ikke bedre tro»
 *
 * ============ MÅLTALLET: EFFEKTIVT UTVALG =================================
 *
 * `trekkVerdenBelief` (`sampler.ts:462-492`) trekker K kandidater, gir hver en
 * log-vekt, og trekker ÉN av dem med sannsynlighet proporsjonal med exp(logW).
 * Den fordelingen har et effektivt utvalg:
 *
 *     ESS = 1 / Σ pᵢ²        (p = normaliserte vekter)
 *
 *   ESS ≈ K   vekten er FLAT. Utvalget er i praksis uniformt, og et skarpere
 *             trohode kan ikke endre hvilken verden som velges.
 *   ESS ≈ 1   vekten er så spiss at én kandidat alltid vinner. Da er alle 48
 *             verdener nær-duplikater av den samme, og spredningen søket
 *             trenger for å skille kort forsvinner.
 *
 * Begge ytterpunktene er måter troen kan bli verdiløs på, og de krever motsatt
 * kur. Derfor rapporteres hele fordelingen, ikke bare snittet.
 *
 * DRIVEREN ER DEN BILLIGE (`ADAMS_MAALT`) med vilje: vekten er en funksjon av
 * STILLINGEN, og denne fila skal kunne dekke mange stillinger uten å betale for
 * 48 utspillinger per beslutning. Stillingene er ikke helbotens egne, og det
 * står som forbehold på tallet.
 */

import { readFileSync } from "node:fs";

import { opprettSpill, utfør, lovligeKort, type GameState } from "../src/motor.ts";
import { lagRng } from "../src/kort.ts";
import { lagIndre, ADAMS_MAALT, tall } from "../src/moe2/agentspek.ts";
import { visningsfrø } from "../src/moe2/sikkerorakel.ts";
import { MlbSøketro } from "../src/moe2/soketro.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import { rolleFor } from "../src/moe2/rolleorakel.ts";
import { trekkVerden, type Verden } from "../src/solver/sampler.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const RUNDER = tall(arg("--runder", "6"), 6, "runder");
const FRO = tall(arg("--fro", "13000777"), 13_000_777, "fro");
const VERDENER = tall(arg("--verdener", "48"), 48, "verdener");
const KAND = tall(arg("--kandidater", "32"), 32, "kandidater");
const SIK_FRØ = 20_260_804;

const tro = new MlbSøketro(MlbTronett.fraBytes(readFileSync("e1-modell/tro-8.bin")));
const agenter = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
for (const a of agenter) a.nyKamp();
tro.nyKamp();

interface Boks {
  n: number;
  sumEss: number;
  sumMaks: number;
  sumSpenn: number;
  /** Hvor ofte den valgte verdenen er en ANNEN enn den uniforme trekningen ville gitt. */
  sumUnike: number;
}
const nyBoks = (): Boks => ({ n: 0, sumEss: 0, sumMaks: 0, sumSpenn: 0, sumUnike: 0 });
const total = nyBoks();
const perRolle = new Map<string, Boks>();
const perStikk = new Map<number, Boks>();

let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, FRO);
let vakt = 0;
let r = 0;
let utenTro = 0;

while (s.fase !== "FERDIG" && vakt++ < 40_000 && r < RUNDER) {
  if (s.fase === "RUNDE_SLUTT") {
    for (const a of agenter) (a as { observer?(x: GameState): void }).observer?.(s);
    tro.observer(s);
    r++;
    s = utfør(s, { type: "NESTE" }).state;
    continue;
  }
  for (const a of agenter) (a as { observer?(x: GameState): void }).observer?.(s);
  tro.observer(s);
  const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
  if (iTur === null || iTur === undefined) break;

  if (s.fase === "SPILL" && s.iTur !== null && lovligeKort(s, s.iTur).length >= 2) {
    const sete = s.iTur;
    const trovekt = tro.vektFor(s, sete);
    if (trovekt === null) {
      utenTro++;
    } else {
      const rng = lagRng(visningsfrø(s, sete, SIK_FRØ));
      const rolle = rolleFor(s, sete) ?? "ukjent";
      const stikk = s.historikk.length;
      if (!perRolle.has(rolle)) perRolle.set(rolle, nyBoks());
      if (!perStikk.has(stikk)) perStikk.set(stikk, nyBoks());
      const mål = [total, perRolle.get(rolle)!, perStikk.get(stikk)!];

      for (let w = 0; w < VERDENER; w++) {
        // NØYAKTIG som `trekkVerdenBelief`: K kandidater, log-vekt, så ett valg.
        const logW: number[] = [];
        const verdener: Verden[] = [];
        for (let i = 0; i < KAND; i++) {
          const v = trekkVerden(s, sete, rng);
          if (v) {
            verdener.push(v);
            logW.push(trovekt(v));
          }
        }
        if (logW.length === 0) continue;
        const maks = Math.max(...logW);
        const min = Math.min(...logW);
        const vekter = logW.map((x) => Math.exp(x - maks));
        const sum = vekter.reduce((a, b) => a + b, 0);
        const p = vekter.map((x) => x / sum);
        const ess = 1 / p.reduce((a, x) => a + x * x, 0);
        // Konsumer valget, så rng-strømmen følger den ekte.
        let rest = rng() * sum;
        let valgt = p.length - 1;
        for (let i = 0; i < vekter.length; i++) {
          rest -= vekter[i]!;
          if (rest < 0) {
            valgt = i;
            break;
          }
        }
        for (const b of mål) {
          b.n++;
          b.sumEss += ess / logW.length;
          b.sumMaks += Math.max(...p);
          b.sumSpenn += maks - min;
          // Ville en UNIFORM trekning valgt en annen? p for den valgte mot 1/K.
          b.sumUnike += p[valgt]! > 1 / logW.length ? 1 : 0;
        }
      }
    }
  }
  s = utfør(s, agenter[iTur]!.velgHandling(s)).state;
}

console.log(`\n=== TROVEKTENS SPREDNING over ${KAND} kandidatverdener ===`);
console.log(`${r} runder, ${total.n} trekninger. Stillinger uten skjulte kort (tro=null): ${utenTro}\n`);
console.log("ESS/K = 1,00 betyr HELT FLAT vekt (troen velger ikke). Lav ESS = spiss vekt.\n");
console.log("gruppe          | trekninger |  ESS/K | maks p | log-spenn | valgt over uniform");
console.log("-".repeat(84));
const vis = (navn: string, b: Boks): void => {
  if (b.n === 0) return;
  console.log(
    `${navn.padEnd(15)} | ${String(b.n).padStart(10)} | ${(b.sumEss / b.n).toFixed(3).padStart(6)} | ${(b.sumMaks / b.n).toFixed(3).padStart(6)} | ${(b.sumSpenn / b.n).toFixed(2).padStart(9)} | ${((100 * b.sumUnike) / b.n).toFixed(1)}%`,
  );
};
vis("ALLE", total);
for (const [k, b] of [...perRolle.entries()].sort()) vis(`  ${k}`, b);
for (const [k, b] of [...perStikk.entries()].sort((a, c) => a[0] - c[0])) vis(`  stikk ${k}`, b);
