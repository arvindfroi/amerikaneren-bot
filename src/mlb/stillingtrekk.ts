/**
 * MLB — SANS A: STILLINGEN PER SETE (11. sep). Bygd fra `SpillerVisning` alene.
 *
 * Eieren: «en som står på 95 byr og spiller annerledes enn en som står på 40, og da betyr
 * budet hans noe annet». `lagInn` har bare to tall om kampen (MINE_POENG og
 * BESTE_MOTSTANDER), BudQ tre (egne, beste motstanders, rundenummeret). Ingen av dem kan
 * uttrykke HVEM som ligger an til å gå ut, eller at venstre nabo kan vinne kampen på et
 * sjuerbud mens høyre må ha amerikaner. Det er en egenskap ved SETET, ikke ved observatøren,
 * og derfor kodes den per relativt sete.
 *
 * ===================== HELT OFFENTLIG, OG STRUKTURELT SÅ =================
 *
 * Bare `totalPoeng`, `budrunde.sisteBud`, `budvinner`, `melding`, `etterlyst`, `makker`
 * (som motoren gir null før avsløringen), `stikkVunnet`, `stikkSpilt` og `fase` leses. Ikke
 * egen hånd, ikke eget vrak — heller ikke der det ville vært lovlig. Blokken er dermed den
 * SAMME for alle fire observatører, bare rotert til relativt sete, og det holder
 * `test/mlb-sanser2.test.ts` (rotasjon + bytte av hender, vrak og talong).
 *
 * «Kan nå målet» er regnet av reglene i `REGLER.md` og ingenting annet: budvinneren får 2N
 * (amerikaner mål/2, solo mål), makkeren N (mål/4), de andre ett poeng per eget stikk.
 *
 * ===================== LAYOUT (4 relative seter × 9 = 36) ===============
 *
 *   0 POENG           totalPoeng / mål, klemt til [−2, 2]
 *   1 IGJEN           poeng igjen til målet / mål, klemt til [0, 3]
 *   2 RANG            antall seter med FLERE poeng / 3 (0 = leder, delt ledelse gir 0 til begge)
 *   3 AVSTAND         lederens poeng minus setets / mål, klemt til [0, 3]
 *   4 BUDBEHOV        minste tallbud som tar setet til målet som budvinner: ⌈igjen/2⌉ / antallStikk,
 *                     klemt til 1
 *   5 NÅR_TALLBUD     1 om et klart tallbud kan ta setet til målet (igjen ≤ 2·antallStikk)
 *   6 NÅR_AMERIKANER  1 om en klart amerikaner kan det (igjen ≤ mål/2)
 *   7 NÅR_EGET_BUD    1 om setets eget høyeste bud i auksjonen (`sisteBud`) tar det til målet
 *                     om det blir klart
 *   8 NÅR_I_RUNDEN    etter auksjonen (VRAK, VELG, SPILL): 1 om setet fortsatt kan nå målet i
 *                     DENNE runden i sin offentlige rolle — se `nårIRunden`. 0 ellers, også i
 *                     budrunden, der rollene ikke finnes ennå.
 *
 * Tallene 4–7 er terskler på IGJEN, men tersklene er regler (2·antallStikk, mål/2), ikke
 * konstanter nettet kan gjette seg til av én skalert inngang.
 */

import type { SpillerVisning } from "../motor.ts";
import { AMERIKANER, PASS, SOLO, type Bud } from "../regler.ts";

export const STILLING_PER_SETE = 9;
export const MLB_STILLING = 4 * STILLING_PER_SETE;

const POENG = 0;
const IGJEN = 1;
const RANG = 2;
const AVSTAND = 3;
const BUDBEHOV = 4;
const NÅR_TALLBUD = 5;
const NÅR_AMERIKANER = 6;
const NÅR_EGET_BUD = 7;
const NÅR_I_RUNDEN = 8;

/** Offsetene, relativt til blokkens start og til setets celle (`rel · STILLING_PER_SETE`). */
export const STILLINGINNGANG = {
  PER_SETE: STILLING_PER_SETE,
  POENG,
  IGJEN,
  RANG,
  AVSTAND,
  BUDBEHOV,
  NÅR_TALLBUD,
  NÅR_AMERIKANER,
  NÅR_EGET_BUD,
  NÅR_I_RUNDEN,
} as const;

const klemt = (x: number, lav: number, høy: number): number => (x < lav ? lav : x > høy ? høy : x);

/** Poengene budvinneren får om `bud` blir klart (`beregnPoeng`). */
function budvinnergevinst(bud: Exclude<Bud, typeof PASS>, mål: number): number {
  if (bud === AMERIKANER) return mål / 2;
  if (bud === SOLO) return mål;
  return 2 * bud;
}

/**
 * Den største gevinsten `sete` fortsatt KAN få i denne runden, av offentlig informasjon.
 *
 * KONTRAKTEN LEVER så lenge stikkene som SIKKERT er forsvarets ikke har felt den. Før
 * makkeren er avslørt vet bordet bare at makkeren er én av de tre andre (eller ingen, ved
 * solo eller uten etterlysning), så «sikre forsvarsstikk» er de tre andres stikk minus det
 * største av dem — det ene som kan være makkerens. Aldri den ekte makkeren før avsløringen:
 * `visning.makker` er null da, og `test/mlb-sanser2.test.ts` har en felle som leser den ekte.
 *
 *   budvinneren          budvinnergevinsten, om kontrakten lever
 *   avslørt makker       N (amerikaner mål/4), om kontrakten lever
 *   kjent forsvarer      egne stikk + stikkene som gjenstår
 *   ukjent rolle         det største av de to over (setet KAN være makkeren)
 */
function størsteGevinst(visning: SpillerVisning, sete: number, antallStikk: number, mål: number): number {
  const m = visning.melding!;
  const bv = visning.budvinner!;
  const n = visning.antallKort.length;
  const stikk = (p: number): number => visning.stikkVunnet[p] ?? 0;
  const utenMakker = m.type === "solo" || visning.etterlyst === null;
  const makker = utenMakker ? null : visning.makker;
  const lagKjent = utenMakker || makker !== null;

  let andre = 0;
  let størsteAndre = 0;
  let forsvar = 0;
  for (let p = 0; p < n; p++) {
    if (p === bv) continue;
    andre += stikk(p);
    størsteAndre = Math.max(størsteAndre, stikk(p));
    if (p !== makker) forsvar += stikk(p);
  }
  const sikreForsvar = lagKjent ? forsvar : andre - størsteAndre;
  const lever =
    m.type === "tall" ? sikreForsvar <= antallStikk - m.bud : m.type === "amerikaner" ? sikreForsvar === 0 : andre === 0;

  const budlagBudvinner = m.type === "tall" ? 2 * m.bud : m.type === "amerikaner" ? mål / 2 : mål;
  const budlagMakker = m.type === "tall" ? m.bud : m.type === "amerikaner" ? mål / 4 : 0;
  const forsvarMaks = stikk(sete) + Math.max(0, antallStikk - visning.stikkSpilt);

  if (sete === bv) return lever ? budlagBudvinner : -Infinity;
  if (lagKjent) {
    if (sete === makker) return lever ? budlagMakker : -Infinity;
    return forsvarMaks;
  }
  return Math.max(forsvarMaks, lever && !utenMakker ? budlagMakker : -Infinity);
}

export function stillingTrekk(visning: SpillerVisning, antallStikk: number, målPoeng: number): Float32Array {
  const n = visning.antallKort.length;
  if (n !== 4) throw new Error(`Stillingsblokken er bygd for fire spillere, fikk ${n}`);
  const v = new Float32Array(MLB_STILLING);
  const meg = visning.deg;
  const mål = målPoeng;
  const rel = (sete: number): number => (((sete - meg) % n) + n) % n;
  const poeng = (p: number): number => visning.totalPoeng[p] ?? 0;

  let leder = -Infinity;
  for (let p = 0; p < n; p++) leder = Math.max(leder, poeng(p));
  const rollene =
    (visning.fase === "VRAK" || visning.fase === "VELG" || visning.fase === "SPILL") &&
    visning.melding !== null &&
    visning.budvinner !== null;

  for (let p = 0; p < n; p++) {
    const pp = poeng(p);
    const igjen = Math.max(0, mål - pp);
    let foran = 0;
    for (let q = 0; q < n; q++) if (poeng(q) > pp) foran++;
    const b = rel(p) * STILLING_PER_SETE;
    v[b + POENG] = klemt(pp / mål, -2, 2);
    v[b + IGJEN] = klemt(igjen / mål, 0, 3);
    v[b + RANG] = foran / (n - 1);
    v[b + AVSTAND] = klemt((leder - pp) / mål, 0, 3);
    v[b + BUDBEHOV] = klemt(Math.ceil(igjen / 2) / antallStikk, 0, 1);
    v[b + NÅR_TALLBUD] = igjen <= 2 * antallStikk ? 1 : 0;
    v[b + NÅR_AMERIKANER] = igjen <= mål / 2 ? 1 : 0;
    const eget = visning.budrunde.sisteBud[p];
    if (eget !== null && eget !== undefined && eget !== PASS) {
      v[b + NÅR_EGET_BUD] = budvinnergevinst(eget, mål) >= igjen ? 1 : 0;
    }
    if (rollene) v[b + NÅR_I_RUNDEN] = størsteGevinst(visning, p, antallStikk, mål) >= igjen ? 1 : 0;
  }
  return v;
}
