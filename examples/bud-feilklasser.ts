/**
 * HVA SLAGS BUDFEIL ER DE +8,06?
 *
 * Takkartet (§60) viser at budrunden er 41,8 % av alt som er å hente. Men «by
 * bedre» er ikke et tiltak. Denne filen deler potten i feilklasser, fordi de
 * krever helt ulike ting av oss:
 *
 *   PASSET, BURDE BUDT      boten er for forsiktig. Terskelen er feil, eller
 *                           μ undervurderer hånden.
 *   BUDTE, BURDE PASSET     boten er for dristig. Samme parametre, motsatt vei.
 *   BUDTE FEIL TALL         nivået er feil, ikke beslutningen om å by.
 *
 * De to første flyttes av ÉN konstant. Den tredje krever en bedre modell.
 *
 * MÅLEMÅTEN er den samme som takkartet: vårt sete forgreiner seg over alle
 * lovlige bud i alle sine budturer, de tre andre spiller sin ekte policy, og
 * bladet er rundens poeng. Vi noterer hva policyen VILLE bydd og hva taket
 * valgte i den FØRSTE budturen der de er uenige.
 *
 * KLARSYNSFORBEHOLDET GJELDER. Taket ser hvordan hver linje endte, så det kan
 * passe på nøyaktig de hendene som ville feilet. Tallene er en øvre grense per
 * klasse, ikke et løfte — men FORDELINGEN mellom klassene er informativ selv
 * om nivået er romslig.
 */

import { appendFileSync } from "node:fs";

import { lovligeHandlinger, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { lagIndre, ADAMS, tall } from "../src/moe2/agentspek.ts";

const arg = (n: string, s: string) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const FRØ = tall(arg("--froe", "900000"), 900000, "froe");
const GIVER = tall(arg("--giver", "250"), 250, "giver");
const UT = arg("--ut", "analyse/bud-feilklasser.jsonl");

const nyeAgenter = () => [0, 1, 2, 3].map(() => lagIndre(ADAMS));

/** «PASS» eller tallet/meldingen som streng. */
function budNavn(b: unknown): string {
  if (b === "PASS" || b === null || b === undefined) return "PASS";
  return String(b);
}

function poengFor(s: GameState, sete: number): number {
  return s.sisteRunde?.delta?.[sete] ?? 0;
}

/** Spiller runden ut med alle seter på policy. */
function spillUt(start: GameState): GameState {
  const ag = nyeAgenter();
  let s = start;
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, ag[iTur]!.velgHandling(s)).state;
  }
  return s;
}

/**
 * Maks poeng for `vårt` med `budsjett` egne budforgreninger igjen. Etter
 * budrunden spiller alle policy.
 */
function beste(state: GameState, vårt: number, budsjett: number): { poeng: number; valg: Handling | null } {
  const ag = nyeAgenter();
  let s = state;
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
    if (budsjett > 0 && s.fase === "BUDRUNDE" && s.iTur === vårt) break;
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, ag[iTur]!.velgHandling(s)).state;
  }
  if (s.fase !== "BUDRUNDE" || s.iTur !== vårt || budsjett <= 0) {
    return { poeng: poengFor(spillUt(s), vårt), valg: null };
  }
  const l = lovligeHandlinger(s);
  if (l.fase !== "BUDRUNDE") return { poeng: poengFor(spillUt(s), vårt), valg: null };

  let bestP = -Infinity;
  let bestH: Handling | null = null;
  for (const b of l.bud) {
    const h = { type: "BUD", spiller: vårt, bud: b } as Handling;
    const r = beste(utfør(s, h).state, vårt, budsjett - 1);
    if (r.poeng > bestP) {
      bestP = r.poeng;
      bestH = h;
    }
  }
  return { poeng: bestP, valg: bestH };
}

const klasser: Record<string, { n: number; sum: number }> = {};
let n = 0;
let sum = 0;

for (let g = 0; g < GIVER; g++) {
  const frø = FRØ + g * 7717;
  for (let sete = 0; sete < 4; sete++) {
    // Rein runde
    const reinS = spillUt(opprettSpill({ antallSpillere: 4 }, frø));
    const rein = poengFor(reinS, sete);

    // Takrunde: forgrein i egne budturer, noter FØRSTE uenighet.
    const ag = nyeAgenter();
    let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
    let brukt = 0;
    let vakt = 0;
    let klasse: string | null = null;
    let fra = "";
    let til = "";
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      let h: Handling | null = null;
      if (brukt < 4 && s.fase === "BUDRUNDE" && iTur === sete) {
        const v = beste(s, sete, 4 - brukt).valg;
        if (v !== null) {
          brukt++;
          const policy = ag[sete]!.velgHandling(s);
          if (klasse === null && policy.type === "BUD" && v.type === "BUD") {
            const a = budNavn(policy.bud);
            const b = budNavn(v.bud);
            if (a !== b) {
              fra = a;
              til = b;
              klasse =
                a === "PASS" ? "passet, burde budt" : b === "PASS" ? "budte, burde passet" : "feil tall";
            }
          }
          h = v;
        }
      }
      s = utfør(s, h ?? ag[iTur]!.velgHandling(s)).state;
    }
    const tak = poengFor(s, sete);
    const d = tak - rein;
    n++;
    sum += d;
    const k = klasse ?? "ingen endring";
    const c = (klasser[k] ??= { n: 0, sum: 0 });
    c.n++;
    c.sum += d;
    if (klasse !== null) {
      appendFileSync(UT, `${JSON.stringify({ frø, sete, klasse, fra, til, rein, tak, diff: d })}\n`);
    }
  }
}

console.log(`# BUDFEILKLASSER  n=${n}  samlet tak ${(sum / n).toFixed(3)} poeng per runde`);
console.log(`${"klasse".padEnd(22)} ${"giver".padStart(6)} ${"andel".padStart(7)} ${"sum".padStart(9)} ${"per runde".padStart(10)}`);
for (const [k, v] of Object.entries(klasser).sort((a, b) => b[1].sum - a[1].sum)) {
  console.log(
    `${k.padEnd(22)} ${String(v.n).padStart(6)} ${((100 * v.n) / n).toFixed(1).padStart(6)}% ${v.sum.toFixed(0).padStart(9)} ${(v.sum / n).toFixed(3).padStart(10)}`,
  );
}
