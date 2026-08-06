/**
 * DET EKTE TAKET I SLUTTSPILLET — beste svar mot de FAKTISKE motstanderne.
 *
 * ARVIND: «får vi de 5 siste stikkene på plass så er vi i en god posisjon.»
 *
 * `juks:` svarte feil på det spørsmålet. Den spiller dobbeltdummy-optimalt,
 * og DD forutsetter at BÅDE makker OG forsvar ser alle hendene og spiller
 * perfekt. Vår makker gjør ikke det. Derfor tok den FÆRRE stikk (9,70 mot
 * 10,01) og klarte kontrakten sjeldnere (54,5 % mot 68,5 %) enn nettet.
 * Den er et tak på feil spill.
 *
 * DETTE ER TAKET SLIK DET SKAL MÅLES. Fra `terskel` gjenstående stikk:
 *
 *   – vårt sete forgrener seg over ALLE lovlige kort, hele veien ut
 *   – de tre andre spiller sin EKTE policy, ikke en tenkt perfekt en
 *   – bladet er RUNDENS POENG for vårt sete, ikke stikk
 *
 * Vi velger linja som maksimerer poeng. Det er per definisjon det beste noen
 * sluttspillstrategi kan oppnå mot dette bordet – med klarsyn attpåtil. Ingen
 * CFR-løsning, ingen tabellbase, ingen nett kan slå det.
 *
 * ER TALLET LITE, ER HELE RETNINGEN DØD uansett hvor godt vi løser den.
 *
 * KOSTNAD: forgreiningen er bare VÅR, så treet er ~3^terskel blader, ikke
 * hele spilltreet. Ved 5 stikk er det noen hundre utspillinger per beslutning.
 *
 * FORBEHOLD SOM MÅ STÅ. Motstanderagentene er tilstandsfulle (profilbøker,
 * tellinger). En utspilling i søket kan i prinsippet flytte den tilstanden.
 * Derfor bygges de tre andre PÅ NYTT for hver utspilling, og målingen er et
 * tak på spill mot en policy som ikke husker søket – som er den vi faktisk
 * spiller mot i appen.
 */

import { appendFileSync } from "node:fs";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { lovligeKort } from "../src/motor.ts";
import { lagIndre, ADAMS, tall } from "../src/moe2/agentspek.ts";
import type { Innagent } from "../src/moe2/agent.ts";

const arg = (n: string, s: string) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const FRØ = tall(arg("--froe", "900000"), 900000, "froe");
const GIVER = tall(arg("--giver", "150"), 150, "giver");
const TERSKEL = tall(arg("--terskel", "5"), 5, "terskel");
const UT = arg("--ut", "analyse/sluttspill-tak.jsonl");

const nyeAndre = () => [0, 1, 2, 3].map(() => lagIndre(ADAMS));

/**
 * Spiller stillingen til rundeslutt. `vårt` forgreiner seg over alle lovlige
 * kort; alle andre seter følger sin policy. Gir beste oppnåelige poeng for
 * `vårt`, og kortet som gir det fra ROTEN.
 */
function beste(state: GameState, vårt: number, dybde: number): { poeng: number; kort: Handling | null } {
  const andre = nyeAndre();
  let s = state;
  let vakt = 0;

  // Spill fram til det er VÅR tur, eller runden er slutt.
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 200) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    if (iTur === vårt && s.fase === "SPILL") break;
    s = utfør(s, andre[iTur]!.velgHandling(s)).state;
  }
  if (s.fase === "FERDIG" || s.fase === "RUNDE_SLUTT" || s.iTur !== vårt || s.fase !== "SPILL") {
    return { poeng: poengFor(s, vårt), kort: null };
  }

  const lovlige = lovligeKort(s, vårt);
  if (lovlige.length === 0 || dybde <= 0) return { poeng: poengFor(s, vårt), kort: null };

  let bestP = -Infinity;
  let bestK: Handling | null = null;
  for (const k of lovlige) {
    const h: Handling = { type: "SPILL", spiller: vårt, kort: k };
    const etter = utfør(s, h).state;
    const r = beste(etter, vårt, dybde - 1);
    if (r.poeng > bestP) {
      bestP = r.poeng;
      bestK = h;
    }
  }
  return { poeng: bestP, kort: bestK };
}

function poengFor(s: GameState, sete: number): number {
  const d = s.sisteRunde?.delta;
  if (d) return d[sete] ?? 0;
  return 0;
}

/** Spiller en runde der `vårt` sete bruker taklinja fra `terskel` stikk. */
function medTak(frø: number, vårt: number, bruk: boolean) {
  const ag = nyeAndre();
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    let h: Handling;
    if (bruk && iTur === vårt && s.fase === "SPILL" && (s.hender[vårt]?.length ?? 0) <= TERSKEL) {
      h = beste(s, vårt, TERSKEL).kort ?? ag[iTur]!.velgHandling(s);
    } else {
      h = ag[iTur]!.velgHandling(s);
    }
    s = utfør(s, h).state;
  }
  return { poeng: poengFor(s, vårt), bv: s.budvinner };
}

let n = 0;
let sum = 0;
let bedre = 0;
let dårligere = 0;
const perRolle: Record<string, { n: number; sum: number }> = {};

for (let g = 0; g < GIVER; g++) {
  const frø = FRØ + g * 7717;
  for (let sete = 0; sete < 4; sete++) {
    const a = medTak(frø, sete, false);
    const b = medTak(frø, sete, true);
    if (a.bv === null || b.bv !== a.bv) continue;
    const d = b.poeng - a.poeng;
    n++;
    sum += d;
    if (d > 0) bedre++;
    if (d < 0) dårligere++;
    const rolle = sete === a.bv ? "foerer" : "annet";
    const r = (perRolle[rolle] ??= { n: 0, sum: 0 });
    r.n++;
    r.sum += d;
    appendFileSync(UT, `${JSON.stringify({ frø, sete, rolle, rein: a.poeng, tak: b.poeng, diff: d })}\n`);
  }
}

console.log(`# EKTE TAK, beste svar mot faktiske motstandere, terskel=${TERSKEL}, n=${n}`);
console.log(`snitt poenggevinst per runde: ${(sum / n).toFixed(4)}`);
console.log(`bedre: ${bedre}   daarligere: ${dårligere}   likt: ${n - bedre - dårligere}`);
for (const [k, v] of Object.entries(perRolle)) {
  console.log(`  ${k.padEnd(8)} n=${String(v.n).padStart(5)}  ${(v.sum / v.n).toFixed(4)}`);
}
