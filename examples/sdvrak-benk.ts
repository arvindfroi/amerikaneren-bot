/**
 * ER SD-VRAKET BEDRE ENN DET VI VRAKER I DAG?
 *
 *   node examples/sdvrak-benk.ts --givere 300 --skard 0/4
 *
 * PARRET PÅ GIV. Begge armene får NØYAKTIG samme giv, samme kontrakt og samme
 * kortspill; det eneste som skiller dem er hvilke fire kort budvinneren
 * legger ned. Da kan ikke differansen komme fra noe annet.
 *
 *   A  dagens bot            (nevros vrak, som i dag)
 *   B  dagens bot + SDVrak   (blind grovsil + SD-evaluering)
 *
 * Måltallet er LAGSTIKK, ikke poeng. Vraket bestemmer hvor mange stikk
 * kontrakten bærer; om det blir poeng av dem avhenger av budet, og budet er
 * likt i begge armene. Lagstikk er derfor det følsomme målet.
 *
 * VENT IKKE +0,848. Det tallet gjaldt fasitens rangering innenfor en
 * kandidatliste plukket av en løser som så alle fire hender. Her er hvert
 * ledd lovlig, og hvor mye den blinde silen taper mot den seende er nettopp
 * det denne benken finnes for å finne ut.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { SDVrak } from "../src/moe2/sdvrak.ts";

let givere = 300;
let skardI = 0;
let skardN = 1;
let kandidatSpek = "vakt:ab:e1:e1-modell/sd-r2.bin";
let toppN = 20;
let verdener = 12;
let ut = "analyse/sdvrak-0.jsonl";
let medSeende = false;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--givere") givere = Number(process.argv[++i]);
  else if (a === "--kandidat") kandidatSpek = process.argv[++i]!;
  else if (a === "--topp") toppN = Number(process.argv[++i]);
  else if (a === "--verdener") verdener = Number(process.argv[++i]);
  else if (a === "--seende") medSeende = true;
  else if (a === "--ut") ut = process.argv[++i]!;
  else if (a === "--skard") {
    const [x, y] = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(x);
    skardN = Number(y);
  }
}
mkdirSync(dirname(ut), { recursive: true });

const vakt = delVaktspek(kandidatSpek)!;
const nett = lesE1Nett(vakt.indre.slice(3));
const nevro = new NevroAgent();
type Velger = { velgHandling(s: GameState): Handling; nyKamp(): void };
const lagBot = (): Velger => new Konvensjonsvakt(new E1Agent(nett), vakt.valg);

/** Kjører runden ferdig fra VRAK. `sdvrak` bytter ut BARE vrakvalget. */
function spill(start: GameState, sdvrak: boolean, seende = false): number | null {
  const seter: Velger[] = [0, 1, 2, 3].map(() => lagBot());
  for (const b of seter) b.nyKamp();
  const vrakvelger = sdvrak
    ? new SDVrak(seter[start.budvinner!]!, { topp: toppN, verdener, motpart: nevro, frø: start.frø, seende })
    : null;
  let s = start;
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    const velger = s.fase === "VRAK" && vrakvelger !== null ? vrakvelger : seter[iTur]!;
    try {
      s = utfør(s, velger.velgHandling(s)).state;
    } catch {
      return null;
    }
  }
  const st = s.stikkVunnet;
  return (st[s.budvinner!] ?? 0) + (s.makker !== null ? (st[s.makker] ?? 0) : 0);
}

let n = 0;
for (let f = 0; f < givere; f++) {
  if (f % skardN !== skardI) continue;
  const frø = 9_900_000 + f;
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let g = 0;
  while (s.fase === "BUDRUNDE" && g++ < 40) s = utfør(s, nevro.velgHandling(s)).state;
  if (s.fase !== "VRAK" || s.budvinner === null) continue;

  const a = spill(s, false);
  const b = spill(s, true);
  if (a === null || b === null) continue;
  appendFileSync(ut, JSON.stringify({ frø, budvinner: s.budvinner, dagens: a, sdvrak: b }) + "\n");
  n++;
  process.stdout.write(`\r  skard ${skardI}: ${n} givere   `);
}
console.log(`\nSkard ${skardI} ferdig: ${n} givere → ${ut}`);
