/**
 * ER ALPHA-MU EN ANNEN LÆRER ENN SD? — premisset for hele selvtreningen.
 *
 * ARVIND: «test at alt funker før vi commiter til en natt med trening.»
 *
 * Selvtreningen hviler på ÉN antakelse: at søket er en sterkere lærer enn
 * etikettene nettet allerede har uttømt. `d7klipp` viste at mer data fra SAMME
 * lærer gir eksakt null (−0,003 med 29,7 % avgjorte, §77), så en ny lærer er
 * hele poenget.
 *
 * Men hvis `--orakel amu` gir omtrent SAMME etiketter som rå SD, har vi betalt
 * ~400× for ingenting — og ingenting ville feilet. Det er nøyaktig samme
 * feilklasse som den døde sanseblokken (§32) og den døde v2-budblokken: en dyr
 * komponent som ser levende ut fordi den kjører.
 *
 * Denne filen måler tre ting i SAMME stillinger, med SAMME verdener:
 *
 *   ENIGHET     hvor ofte peker de på samme kort? 100 % = alpha-mu er pynt.
 *   SPREDNING   hvor mye skiller beste og verste kort seg, per lærer?
 *   RANGERING   Spearman-liknende: er rekkefølgen den samme?
 *
 * VERDENENE TREKKES ÉN GANG og deles av begge. Uten det ville forskjellen vært
 * dominert av hvilke hender som tilfeldigvis ble trukket — samme prinsipp som
 * duplikatgiverne på benken.
 */

import { appendFileSync } from "node:fs";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeKort } from "../src/motor.ts";
import { lagRng } from "../src/kort.ts";
import { lagIndre, ADAMS, tall } from "../src/moe2/agentspek.ts";
import { standardMål, trekkVerdener, vurderKortSD } from "../src/moe2/sdkort.ts";
import { alphaMu } from "../src/moe2/alphamu.ts";
import { lagHvemLaVekt } from "../src/moe2/hvemla-slutning.ts";

const arg = (n: string, s: string) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const GIVER = tall(arg("--giver", "40"), 40, "giver");
const VERDENER = tall(arg("--verdener", "8"), 8, "verdener");
const M = tall(arg("--amum", "2"), 2, "amum");
const SPREDNING = tall(arg("--spredning", "0.5"), 0.5, "spredning");
const UT = arg("--ut", "analyse/laerer-sammenlikning.jsonl");

const snitt = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);

let n = 0;
let enige = 0;
let sumSpredSD = 0;
let sumSpredAMU = 0;
let rangLike = 0;
let sumRang = 0;

for (let g = 0; g < GIVER; g++) {
  const ag = [0, 1, 2, 3].map(() => lagIndre(ADAMS));
  const motpart = lagIndre(ADAMS);
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 1_400_000 + g * 7717);
  const rng = lagRng(500_000 + g);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
    if (s.fase === "SPILL" && s.iTur !== null) {
      const sete = s.iTur;
      const lovlige = lovligeKort(s, sete);
      if (lovlige.length >= 2 && s.stikkSpilt >= 2) {
        // ÉN trekning, delt av begge lærerne.
        const verdener = trekkVerdener(s, sete, VERDENER, rng, undefined, lagHvemLaVekt(s, sete), 16);
        if (verdener.length > 0) {
          const sd = vurderKortSD(s, sete, motpart, {
            verdener: VERDENER,
            rng,
            verdenerHender: verdener,
          } as never);
          const amu = alphaMu(s, sete, verdener, { M, mål: standardMål, motpart });

          if (sd.length >= 2 && amu.length >= 2) {
            const sdVerdi = new Map(sd.map((v) => [`${v.kort.farge}${v.kort.verdi}`, v.verdi]));
            const amuVerdi = new Map(amu.map((g2) => [`${g2.kort.farge}${g2.kort.verdi}`, snitt(g2.vektor)]));
            const felles = [...sdVerdi.keys()].filter((k) => amuVerdi.has(k));
            if (felles.length >= 2) {
              const best = (m: Map<string, number>): string =>
                felles.reduce((a, b) => (m.get(b)! > m.get(a)! ? b : a));
              const bSD = best(sdVerdi);
              const bAMU = best(amuVerdi);
              n++;
              if (bSD === bAMU) enige++;

              const sv = felles.map((k) => sdVerdi.get(k)!);
              const av = felles.map((k) => amuVerdi.get(k)!);
              sumSpredSD += Math.max(...sv) - Math.min(...sv);
              sumSpredAMU += Math.max(...av) - Math.min(...av);

              // Andel PAR som rangeres likt – en enkel rangkorrelasjon.
              let par = 0;
              let like = 0;
              for (let i = 0; i < felles.length; i++) {
                for (let j = i + 1; j < felles.length; j++) {
                  par++;
                  const a1 = sdVerdi.get(felles[i]!)! - sdVerdi.get(felles[j]!)!;
                  const a2 = amuVerdi.get(felles[i]!)! - amuVerdi.get(felles[j]!)!;
                  if (Math.sign(a1) === Math.sign(a2)) like++;
                }
              }
              if (par > 0) {
                sumRang += like / par;
                if (like === par) rangLike++;
              }

              appendFileSync(
                UT,
                JSON.stringify({
                  frø: 1_400_000 + g * 7717, stikk: s.stikkSpilt, sete,
                  enig: bSD === bAMU ? 1 : 0,
                  spredSD: Math.max(...sv) - Math.min(...sv),
                  spredAMU: Math.max(...av) - Math.min(...av),
                  rang: par > 0 ? like / par : 1,
                }) + "\n",
              );
            }
          }
        }
      }
      if (n >= 200) break;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, ag[iTur]!.velgHandling(s)).state;
  }
  if (n >= 200) break;
}

const p = (x: number) => ((100 * x) / Math.max(1, n)).toFixed(1) + " %";
console.log(`# LAERER-SAMMENLIKNING: alpha-mu (M=${M}) mot raa SD, ${n} stillinger`);
console.log(`# samme stillinger, SAMME trukne verdener\n`);
console.log(`enige om beste kort:      ${p(enige)}`);
console.log(`identisk RANGERING:       ${p(rangLike)}`);
console.log(`andel par rangert likt:   ${(sumRang / Math.max(1, n)).toFixed(3)}`);
console.log(`\nspredning beste-verste:   SD ${(sumSpredSD / Math.max(1, n)).toFixed(3)}   alpha-mu ${(sumSpredAMU / Math.max(1, n)).toFixed(3)}`);
console.log(
  `\nVURDERING: ${
    enige / Math.max(1, n) > 0.95
      ? "alpha-mu er nesten PYNT - den peker samme vei nesten alltid"
      : "alpha-mu er en ANNEN laerer, og selvtreningen har et premiss"
  }`,
);
console.log(`\nMerk: stillinger med spredning under ${SPREDNING} ville uansett vaert utelatt av porten.`);
