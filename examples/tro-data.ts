/**
 * TRODATA: hvor lå hvert kort egentlig?
 *
 *   node examples/tro-data.ts --spek "<agentspek>" --giver 20000 --skard 0/20 \
 *     --ut tro-data/skard-0.jsonl
 *
 * Arvind, 4. august:
 *
 *   «jeg vet at john doe ikke har noen rutere igjen fordi i runde 3 så hev han
 *    på en spar, og jeg tipper budvinneren hiv de lave kortene i vrak fordi det
 *    egnet han best og det hadde ikke vært bra for han å hive en ess. dermed
 *    tror jeg john doe har hjerter ess.»
 *
 * ====================== HVA VI HAR, OG HVA SOM MANGLER ====================
 *
 * Troblokken (v6) sier «John kan ha HØYST tre hjerter». Kjeden over trenger
 * «John har hjerter ess med sannsynlighet 0,7». Det er forskjellen på å telle
 * og å vite, og det er hele hullet.
 *
 * Særlig ledd to: budvinneren vraket fire kort, og han vraket dem ikke
 * tilfeldig – han kastet lavt og han kastet ikke ess. Et usett ess ligger
 * derfor nesten sikkert på en HÅND, mens en usett toer godt kan være død. Den
 * slutningen finnes ingen steder i kodingen i dag, og den flytter troen om
 * nettopp de kortene som avgjør stikk.
 *
 * ===================== HVORFOR DETTE ER BILLIG Å LÆRE =====================
 *
 * Fasiten er GRATIS. Ved rundeslutt vet vi nøyaktig hvor hvert kort lå – vi
 * har hele giva. Ingen SD-evaluering, ingen verdener, ingen rollouts. Å lage
 * treningsdata er bare å spille partier og skrive ned, altså hundrevis av
 * ganger billigere per rad enn `sd-orakel.ts`.
 *
 * De to konkurrerer heller ikke: SD-korpuset er bundet av rollouts, dette av
 * ren spilling.
 *
 * ============================== ETIKETTEN ================================
 *
 * For hvert av de 52 kortene, én klasse:
 *
 *   0   sett (min hånd, eller alt spilt) – MASKERT BORT, den er ikke gjetning
 *   1   relativt sete 1        2   relativt sete 2       3   relativt sete 3
 *   4   dødt (i vraket)
 *
 * Relativt sete, som resten av kodingen, så modellen lærer «neste i tur» og
 * ikke «spiller 2». Uten det ville den måttet lære det samme fire ganger.
 *
 * MASKEN ER IKKE PYNT. Uten den ville tapet domineres av de kortene vi alt
 * ser, og modellen ville brukt kapasiteten sin på å gjenta det den vet.
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { e1SpillTrekk, E1_SPILL_DIM_V8 } from "../src/e1/trekk.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { Budagent, lesBudmodell } from "../src/moe2/budagent.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { Vrakrangerer } from "../src/moe2/vrakrang.ts";
import { nettFraBytes } from "../src/nevro/nett.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";

let givere = 5000;
let frøBase = 700_000_000;
let skardI = 0;
let skardN = 1;
let spek = "nevro";
/** Andel spillestillinger som skrives. 1 gir sterkt korrelerte naborader. */
let sjanse = 0.5;
let ut = "tro-data/skard-0.jsonl";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--giver") givere = Number(process.argv[++i]);
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--spek") spek = process.argv[++i]!;
  else if (a === "--sjanse") sjanse = Number(process.argv[++i]);
  else if (a === "--ut") ut = process.argv[++i]!;
  else if (a === "--skard") {
    const [x, y] = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(x);
    skardN = Number(y);
  }
}

type Agent = { velgHandling(s: GameState): Handling; nyKamp(): void };


const relSete = (sete: number, annet: number): number => (annet - sete + 4) % 4;

/**
 * Fasiten sett fra `sete`: klasse per kort, 0 for det som alt er synlig.
 *
 * VRAKET ER KJENT FOR BUDVINNEREN. Han kastet kortene selv, så for ham er de
 * ikke gjetning – de får klasse 0 sammen med resten han ser. Uten det ville
 * modellen blitt bedt om å gjette noe han vet, og lært å tvile på seg selv.
 */
function fasit(s: GameState, sete: number): number[] {
  const ut = new Array<number>(52).fill(0);
  const erBudvinner = s.budvinner === sete;

  const synlig = new Set<number>();
  for (const k of s.hender[sete] ?? []) synlig.add(kortIndeks(k));
  for (const stikk of s.historikk) for (const kp of stikk.kort) synlig.add(kortIndeks(kp.kort));
  for (const kp of s.bord) synlig.add(kortIndeks(kp.kort));
  if (erBudvinner) for (const k of s.vrak) synlig.add(kortIndeks(k));

  for (let p = 0; p < s.antallSpillere; p++) {
    if (p === sete) continue;
    for (const k of s.hender[p] ?? []) {
      const i = kortIndeks(k);
      if (!synlig.has(i)) ut[i] = relSete(sete, p);
    }
  }
  if (!erBudvinner) {
    for (const k of s.vrak) {
      const i = kortIndeks(k);
      if (!synlig.has(i)) ut[i] = 4;
    }
  }
  return ut;
}

mkdirSync(dirname(ut), { recursive: true });
const agenter = [0, 1, 2, 3].map(() => lagIndre(spek));
let rng = 1234567 + skardI * 7919;
const tilfeldig = (): number => {
  rng = (rng * 1103515245 + 12345) & 0x7fffffff;
  return rng / 0x7fffffff;
};

let skrevet = 0;
const t0 = Date.now();
for (let g = skardI; g < givere; g += skardN) {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frøBase + g * 7717);
  for (const a of agenter) a.nyKamp();
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    if (s.fase === "SPILL" && tilfeldig() < sjanse) {
      const f = fasit(s, iTur);
      // Ingen ukjente igjen betyr ingenting å lære av.
      if (f.some((x) => x > 0)) {
        const t = e1SpillTrekk(s, iTur, E1_SPILL_DIM_V8);
        appendFileSync(
          ut,
          JSON.stringify({
            t: Array.from(t, (x) => Math.round(x * 10_000) / 10_000),
            f,
            frø: s.frø,
            stikk: s.stikkSpilt,
          }) + "\n",
        );
        skrevet++;
      }
    }
    s = utfør(s, agenter[iTur]!.velgHandling(s)).state;
  }
  if (skrevet % 2000 === 0 && skrevet > 0) {
    const sek = (Date.now() - t0) / 1000;
    process.stdout.write(`  skard ${skardI}: ${skrevet} rader, ${(skrevet / sek).toFixed(0)}/s\r`);
  }
}
console.log(`\nSkard ${skardI} ferdig: ${skrevet} rader -> ${ut}`);
