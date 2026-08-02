/**
 * HVOR OFTE ER AVKASTET ET EKTE VALG?
 *
 *   node examples/avkastrom.ts --giver 400
 *
 * Bakgrunnen: `n` (kast det du har minst bruk for) og `k` (kast billigste)
 * målte NØYAKTIG likt over 11 200 giv – samme snitt til fjerde desimal, samme
 * 741/1520. To regler som velger ulikt kan ikke gi identiske tall, så enten
 * er `n` ikke koblet inn, eller så velger den samme kort som `k` hver gang.
 *
 * DENNE MÅLINGEN SKILLER DE TO. Den teller, i stillingene der vakt 4 fyrer:
 *
 *   hvor mange FARGER utvalget spenner over. Følgeplikten – som Arvind
 *   påpekte, og som `lovligeKort` håndhever – låser utvalget til den ledede
 *   fargen når man kan følge. Da finnes det ikke noe «hvilken farge skal jeg
 *   kaste fra»-valg i det hele tatt, og «minst bruk for» kollapser til
 *   «lavest valør».
 *
 *   hvor ofte de to funksjonene faktisk VELGER ULIKT. Er det tallet null mens
 *   utvalget spenner flere farger, er det en koblingsfeil.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, lovligeKort, stikkvinner, type GameState, type Handling } from "../src/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { billigste } from "../src/moe2/synlig.ts";
import { minstBrukFor } from "../src/moe2/nytte.ts";
import { kortId } from "../src/kort.ts";

let giver = 400;
let frøBase = 5_000_000;
let spek = "vakt:abmp:e1:e1-modell/sd-r2.bin";
let ut = "analyse/avkastrom.txt";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--giver") giver = Number(process.argv[++i]);
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--spek") spek = process.argv[++i]!;
  else if (a === "--ut") ut = process.argv[++i]!;
}

const vakt = delVaktspek(spek)!;
const nett = lesE1Nett(vakt.indre.slice(3));
type Velger = { velgHandling(s: GameState): Handling; nyKamp(): void };
const lag = (): Velger => new Konvensjonsvakt(new E1Agent(nett), vakt.valg);

let fyringer = 0;
let énFarge = 0;
let ulikt = 0;
let kortvalg = 0;
const eksempler: string[] = [];
const fargefordeling = new Map<number, number>();

for (let f = 0; f < giver; f++) {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, (frøBase + f) >>> 0);
  const v = [0, 1, 2, 3].map(() => lag());
  for (const b of v) b.nyKamp();
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    if (s.fase === "SPILL" && s.iTur !== null && s.trumf !== null) {
      const sete = s.iTur;
      const lovlige = lovligeKort(s, sete);
      kortvalg++;
      // Vakt 4s betingelse: det ligger kort på bordet og ingen av mine
      // lovlige kort vinner stikket slik det står.
      if (
        lovlige.length > 1 &&
        s.bord.length > 0 &&
        !lovlige.some((k) => stikkvinner([...s.bord, { spiller: sete, kort: k }], s.trumf!) === sete)
      ) {
        fyringer++;
        const farger = new Set(lovlige.map((k) => k.farge));
        fargefordeling.set(farger.size, (fargefordeling.get(farger.size) ?? 0) + 1);
        if (farger.size === 1) énFarge++;
        const a = billigste(lovlige, s.trumf);
        const b = minstBrukFor(lovlige, s.hender[sete] ?? lovlige, s.trumf);
        if (kortId(a) !== kortId(b)) {
          ulikt++;
          if (eksempler.length < 8) {
            eksempler.push(
              `    hånd ${(s.hender[sete] ?? []).map(kortId).join(" ")} | trumf ${s.trumf} | ` +
                `lovlige ${lovlige.map(kortId).join(" ")} → billigste ${kortId(a)}, minstBrukFor ${kortId(b)}`,
            );
          }
        }
      }
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    s = utfør(s, v[iTur]!.velgHandling(s)).state;
  }
}

const pst = (a: number, b: number): string => `${((100 * a) / Math.max(1, b)).toFixed(1)} %`;
const L = [
  ``,
  `=== ER AVKASTET ET EKTE VALG? ===`,
  `${giver} giver, ${kortvalg} kortvalg totalt.`,
  ``,
  `Vakt 4 fyrer i ${fyringer} stillinger (${pst(fyringer, kortvalg)} av alle kortvalg).`,
  ``,
  `FARGER UTVALGET SPENNER OVER:`,
  ...[...fargefordeling]
    .sort((a, b) => a[0] - b[0])
    .map(([n, c]) => `  ${n} farge${n > 1 ? "r" : " "}: ${String(c).padStart(6)}  (${pst(c, fyringer)})`),
  ``,
  `  bare ÉN farge: ${énFarge} av ${fyringer} (${pst(énFarge, fyringer)})`,
  ``,
  `billigste og minstBrukFor velger ULIKT i ${ulikt} av ${fyringer} (${pst(ulikt, fyringer)})`,
  ...(eksempler.length > 0 ? [``, `EKSEMPLER:`, ...eksempler] : []),
  ``,
  `TOLKNING. Er «én farge»-andelen høy, er det FØLGEPLIKTEN som gjør at`,
  `«hvilket kort har jeg minst bruk for» sjelden er et valg: er man i den`,
  `ledede fargen, ligger alle lovlige kort i den, og da er minst nyttig lik`,
  `lavest valør. Regelen er ikke feil - den har bare lite å arbeide med.`,
  `Er derimot «ulikt» null mens flere farger forekommer, er det en`,
  `koblingsfeil og ikke en egenskap ved spillet.`,
  ``,
];
const tekst = L.join("\n");
console.log(tekst);
mkdirSync(dirname(ut), { recursive: true });
writeFileSync(ut, tekst + "\n");
