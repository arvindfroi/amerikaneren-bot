/**
 * TAR JUKSEREN FLERE STIKK ELLER FÆRRE?
 *
 * `juks:5` måler −4,11 poeng i førersetet — en agent som SER alle fire hendene
 * spiller dårligere enn nettet. Det er enten en feil hos meg, eller et funn.
 * Dette skiller de to, og det gjør det med ett tall.
 *
 *   FLERE STIKK, FÆRRE POENG → målfunksjonen er feil. Budlagets poeng er
 *   binære på `lagStikk >= bud`; overstikk er verdiløse. Da kan flere stikk
 *   likevel ikke skade, så dette utfallet ville pekt på noe annet.
 *
 *   FÆRRE STIKK → dobbeltdummy-linja TAPER mot en ekte makker. Løsningen
 *   forutsetter at makkeren også ser alle hendene og samarbeider perfekt.
 *   Vår makker ser sin egen hånd og spiller nettet.
 *
 * Parret på giv: nøyaktig samme kort, bare førersetets policy skiller.
 * Referansen er `lagStikk` — budvinner pluss makker.
 */

import { appendFileSync } from "node:fs";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lagIndre, ADAMS, tall } from "../src/moe2/agentspek.ts";

const arg = (n: string, s: string) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const FRØ = tall(arg("--froe", "900000"), 900000, "froe");
const GIVER = tall(arg("--giver", "400"), 400, "giver");
const TERSKEL = tall(arg("--terskel", "5"), 5, "terskel");
const UT = arg("--ut", "analyse/juks-stikk.jsonl");

/** Spiller én runde og gir budlagets stikk, poengendring og budet. */
function runde(frø: number, juksSete: number | null) {
  const ag = [0, 1, 2, 3].map((p) =>
    p === juksSete ? lagIndre(`juks:${TERSKEL}:${ADAMS}`) : lagIndre(ADAMS),
  );
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, ag[iTur]!.velgHandling(s)).state;
  }
  const bv = s.budvinner;
  if (bv === null) return null;
  const mk = s.makker;
  const lagStikk = (s.stikkVunnet[bv] ?? 0) + (mk !== null && mk !== bv ? (s.stikkVunnet[mk] ?? 0) : 0);
  const bud = s.budrunde.sisteBud[bv];
  return { bv, lagStikk, bud: typeof bud === "number" ? bud : 0, klart: s.sisteRunde?.klart ?? null };
}

let n = 0;
let sumRein = 0;
let sumJuks = 0;
let klartRein = 0;
let klartJuks = 0;
let flere = 0;
let færre = 0;

for (let g = 0; g < GIVER; g++) {
  const frø = FRØ + g * 7717;
  // Finn hvem som ble budvinner i den REINE runden, og la nøyaktig det setet
  // jukse i den andre. Ellers måler vi jukseren i seter der den aldri fører.
  const a = runde(frø, null);
  if (a === null || a.bud === 0) continue;
  const b = runde(frø, a.bv);
  if (b === null || b.bv !== a.bv) continue; // budrunden skal være identisk

  n++;
  sumRein += a.lagStikk;
  sumJuks += b.lagStikk;
  if (a.klart === true) klartRein++;
  if (b.klart === true) klartJuks++;
  if (b.lagStikk > a.lagStikk) flere++;
  if (b.lagStikk < a.lagStikk) færre++;

  appendFileSync(
    UT,
    `${JSON.stringify({ frø, sete: a.bv, bud: a.bud, reinStikk: a.lagStikk, juksStikk: b.lagStikk, reinKlart: a.klart, juksKlart: b.klart })}\n`,
  );
}

const p = (x: number) => (x / n).toFixed(4);
console.log(`# juks:${TERSKEL} i FOERERSETET, parret paa giv, n=${n}`);
console.log(`lagStikk  rein ${p(sumRein)}   juks ${p(sumJuks)}   diff ${((sumJuks - sumRein) / n).toFixed(4)}`);
console.log(`kontrakt klart  rein ${p(klartRein)}   juks ${p(klartJuks)}`);
console.log(`giver med FLERE stikk: ${flere}   FAERRE: ${færre}   likt: ${n - flere - færre}`);
