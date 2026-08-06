/**
 * HVILKEN TRUMF SKAL FØREREN SPILLE UT I STIKK 1?
 *
 * Takkartet per enkeltstikk (§70) ga det høyeste enkelttallet i hele
 * kortspillet: førersetets valg i stikk 0 måler **+5,296 per runde** ved taket,
 * og treffer i 13,2 % av førerstillingene — da med +40,1, altså kontraktvipp.
 *
 * Samtidig er stikket tvunget i UTFALL: makkeren vinner 100 % av 400 giver,
 * fordi det etterlyste kortet er den høyeste utestående trumfen og
 * makkerplikten tvinger den fram.
 *
 * De to fakta sammen er merkelige. Hvis stikket uansett går til makkeren,
 * hvorfor betyr det +5,296 hvilken trumf føreren kaster på det?
 *
 * Denne filen svarer på det ved å sammenlikne TRE ting i samme stilling:
 *
 *   BOTEN      hva Adams faktisk spiller
 *   BILLIGST   den laveste trumfen — «kast minst mulig på et tapt stikk»
 *   TAKET      det kortet som faktisk gir flest poeng, funnet ved å spille
 *              hver mulighet ut mot de EKTE motstanderne
 *
 * Stemmer TAKET med BILLIGST, er svaret en regel og ikke en modell.
 * Stemmer det ikke, er det noe annet på ferde, og da vil fordelingen si hva.
 */

import { appendFileSync } from "node:fs";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { lovligeKort } from "../src/motor.ts";
import type { Kort } from "../src/kort.ts";
import { lagIndre, ADAMS, tall } from "../src/moe2/agentspek.ts";

const arg = (n: string, s: string) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const GIVER = tall(arg("--giver", "300"), 300, "giver");
const FRØ = tall(arg("--froe", "900000"), 900000, "froe");
const UT = arg("--ut", "analyse/utspill-stikk1.jsonl");

const nyeAgenter = () => [0, 1, 2, 3].map(() => lagIndre(ADAMS));

function poengFor(s: GameState, sete: number): number {
  return s.sisteRunde?.delta?.[sete] ?? 0;
}

/** Spiller runden ut med policy i alle seter. */
function spillUt(start: GameState): GameState {
  const ag = nyeAgenter();
  let s = start;
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, ag[iTur]!.velgHandling(s)).state;
  }
  return s;
}

let n = 0;
let botLavest = 0;
let takLavest = 0;
let botLikTak = 0;
let sumTak = 0;
let sumBot = 0;
/** Hvor i trumfrekka taket velger: 0 = lavest, 1 = nest lavest, ... */
const takRang: Record<number, number> = {};
const botRang: Record<number, number> = {};

for (let g = 0; g < GIVER; g++) {
  const ag = nyeAgenter();
  let s: GameState = opprettSpill({ antallSpillere: 4 }, FRØ + g * 7717);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
    if (s.fase === "SPILL" && s.stikkSpilt === 0 && s.bord.length === 0 && s.iTur === s.budvinner) {
      const sete = s.iTur!;
      const lov = lovligeKort(s, sete);
      if (lov.length > 1) {
        const sortert = lov.slice().sort((a, b) => a.verdi - b.verdi);
        const rangAv = (k: Kort) => sortert.findIndex((x) => x.farge === k.farge && x.verdi === k.verdi);

        // Hva boten gjør.
        const bot = ag[sete]!.velgHandling(s);
        const botKort = bot.type === "SPILL" ? bot.kort : sortert[0]!;

        // Hva TAKET gjør: spill hver mulighet ut mot de ekte motstanderne.
        let besteP = -Infinity;
        let besteK = sortert[0]!;
        let botP = 0;
        for (const k of sortert) {
          const etter = utfør(s, { type: "SPILL", spiller: sete, kort: k } as Handling).state;
          const p = poengFor(spillUt(etter), sete);
          if (p > besteP) {
            besteP = p;
            besteK = k;
          }
          if (k.farge === botKort.farge && k.verdi === botKort.verdi) botP = p;
        }

        n++;
        sumTak += besteP;
        sumBot += botP;
        const rb = rangAv(botKort);
        const rt = rangAv(besteK);
        botRang[rb] = (botRang[rb] ?? 0) + 1;
        takRang[rt] = (takRang[rt] ?? 0) + 1;
        if (rb === 0) botLavest++;
        if (rt === 0) takLavest++;
        if (rb === rt) botLikTak++;

        appendFileSync(
          UT,
          JSON.stringify({
            frø: FRØ + g * 7717, sete, antallTrumf: lov.length,
            botRang: rb, takRang: rt, botPoeng: botP, takPoeng: besteP,
          }) + "\n",
        );
      }
      break; // ett datapunkt per giv
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, ag[iTur]!.velgHandling(s)).state;
  }
}

const p = (x: number) => ((100 * x) / n).toFixed(1) + " %";
console.log(`# FOERERENS UTSPILL I STIKK 1 — ${n} stillinger med et faktisk valg\n`);
console.log(`boten spiller LAVESTE trumf:   ${p(botLavest)}`);
console.log(`TAKET velger laveste trumf:    ${p(takLavest)}`);
console.log(`boten traff takets valg:       ${p(botLikTak)}`);
console.log(`\npoeng: bot ${(sumBot / n).toFixed(3)}   tak ${(sumTak / n).toFixed(3)}   gap ${((sumTak - sumBot) / n).toFixed(3)}`);
console.log(`\nrang i trumfrekka (0 = lavest):`);
const maks = Math.max(...Object.keys(takRang).map(Number), ...Object.keys(botRang).map(Number));
for (let r = 0; r <= maks; r++) {
  console.log(`  ${r}:  bot ${(((botRang[r] ?? 0) * 100) / n).toFixed(1).padStart(5)} %   tak ${(((takRang[r] ?? 0) * 100) / n).toFixed(1).padStart(5)} %`);
}
