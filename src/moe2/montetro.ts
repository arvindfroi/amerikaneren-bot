/**
 * TROEN FRA DE VEKTEDE VERDENENE — ikke fra et nett.
 *
 * ARVIND: «men ser den de 400 trekkene som mangler nå i selvtreningen?? fanger
 * vi også a5??»
 *
 * Svaret var nei, og han fanget en ekte glipp: generatoren ble kjørt med
 * `--bredde 273`. Selvtreningen ville altså laget BEDRE ETIKETTER TIL DE SAMME
 * TREKKENE, uten å røre de 441 som mangler.
 *
 * ================= HVA SOM BLOKKERTE DEN BREDE ===========================
 *
 * `sd-orakel` nekter bredde ≥ 558 uten `--tro`, og med god grunn: 84 av 88
 * sansetrekk ville vært konstant null i HELE korpuset. Sanseblokken krever en
 * FORDELING over hvor kortene sitter — `fyllSanser(v, state, sete, tro)` der
 * `tro[kortIndeks][relativt sete]` er en sannsynlighet.
 *
 * Den fordelingen kom fra `Trosnett` (`e1-modell/tro.bin`, 3,4 MB). Og
 * trosnettet REPLIKERTE IKKE: +0,34 i ett frøbånd, −0,12 i det disjunkte.
 *
 * Sirkelen var altså: A5 trenger en tro, troen er et nett som ikke virker.
 *
 * ================= OG NÅ HAR VI EN BEDRE KILDE ===========================
 *
 * Verdenstrekningen produserer allerede fordelinger som er forenlige med alt
 * vi vet — renonser som harde forbud, budrunden og (etter A1/§84) SPILLET som
 * likelihood. Trekker vi N verdener og teller hvor ofte hvert kort havner hos
 * hvert sete, ER det en posterior:
 *
 *     P(kort k hos sete r | alt vi har sett) ≈ (antall verdener der k er hos r) / N
 *
 * Ingen modell å trene. Ingen 3,4 MB å laste. Og den arver automatisk hver
 * forbedring i trekningen — når likelihooden blir bedre, blir troen bedre.
 *
 * ================= HVA DEN IKKE ER =======================================
 *
 * Den er en MONTE-CARLO-ESTIMATOR, ikke en eksakt posterior. Med N verdener er
 * standardfeilen på hver sannsynlighet ~√(p(1−p)/N) — ved N = 24 er det ±0,10
 * på en 50/50. Den er altså grov, og det skal stå her: sanseblokken vil bære
 * støy, og hvor mye det koster er et empirisk spørsmål ingen har målt.
 */

import type { GameState } from "../motor.ts";
import type { Kort } from "../kort.ts";
import { intTilKort } from "../solver/dds.ts";
import { kortIndeks } from "../nevro/trekk.ts";
import { trekkVerdener } from "./sdkort.ts";

/** Relativt sete: 1 = neste i tur, 2, 3. Samme koding som `fyllSanser` bruker. */
const rel = (sete: number, p: number, n: number): number => (p - sete + n) % n;

/**
 * Fordelingen `fyllSanser` forventer: `[52][3]`, sannsynlighet for at kort k
 * ligger hos relativt sete r+1.
 *
 * Egne kort og allerede spilte kort får 0 i alle rader — de er ikke hos noen
 * av de tre andre, og det er en KJENT sannhet, ikke et anslag.
 */
export function monteTro(
  state: GameState,
  sete: number,
  antall: number,
  rng: () => number,
  ekstraVekt?: (v: { hender: number[][] }) => number,
  kandidater = 3,
): number[][] | null {
  const verdener = trekkVerdener(state, sete, antall, rng, undefined, ekstraVekt, kandidater);
  if (verdener.length === 0) return null;

  const n = state.antallSpillere;
  const tro: number[][] = Array.from({ length: 52 }, () => [0, 0, 0]);
  for (const hender of verdener) {
    for (let p = 0; p < n; p++) {
      if (p === sete) continue;
      const r = rel(sete, p, n);
      if (r < 1 || r > 3) continue;
      for (const c of hender[p] ?? []) {
        const k: Kort = intTilKort(c);
        tro[kortIndeks(k)]![r - 1]! += 1;
      }
    }
  }
  const d = verdener.length;
  for (const rad of tro) for (let i = 0; i < 3; i++) rad[i]! /= d;
  return tro;
}
