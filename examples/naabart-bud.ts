/**
 * NÅBART BUD — DET INFORMASJONSRETTFERDIGE BUDTAKET (K3.1, 11. sep).
 *
 * EIEREN: «hvorfor bruker vi ikke bare Adams sin budmodell og bygger på den — vi skal ikke
 * ligge bak; nok data skal gi en matematisk optimal budmodell.»
 *
 * `tak-kart.ts --fase bud` måler taket med KLARSYN: vårt sete forgreiner seg over alle
 * lovlige bud i DEN VIRKELIGE given og tar maksimum av hvordan hver linje faktisk endte.
 * Ingen budgiver kan ha den informasjonen (skjulte hender, talongen), så K3.1-porten
 * «|gap| ≤ 2 SE» kunne ALDRI lukkes: batteriet 11. sep målte hele boten +10,81 ± 2,22 og
 * ADAMS_MAALT +9,91 ± 2,17 i samme vindu, og det meste av det er informasjon, ikke feil.
 * `k3-budgap.ts` viste det samme for åpningsbudet alene.
 *
 * ============ TRE NIVÅER PÅ SAMME BESLUTNING =============================
 *
 *   POLICY    det boten byr.
 *   NÅBART    denne fila: for HVERT lovlige bud (pass, tall, amerikaner og solo når de er
 *             lovlige), snittet av rundepoengene for setet over W verdener trukket fra DET
 *             SETET SER, med runden spilt ferdig av policyene. Argmax. «Bayes-optimalt bud
 *             under denne informasjonen og disse fortsettelsene.»
 *   KLARSYN   `tak-kart.ts` sitt tak.
 *
 * POLICY → NÅBART er det en budmodell kan hente. NÅBART → KLARSYN finnes ikke ved bordet.
 *
 * ============ K2: VALGET ER EN FUNKSJON AV VISNINGEN =====================
 *
 *   1. VERDENENE er `trekkVerdener` (renonser, håndstørrelser, død talong-binge, budvekten
 *      på de andres bud) + `medVerden` (talongen er residualet, aldri den ekte).
 *   2. RNG-EN utledes av `visningsfrø(state, sete, frø)` — hashen av `spillerVisning`. To
 *      stillinger som bare skiller seg i skjulte kort gir samme verdener og samme valg.
 *   3. FRØET VASKES. `GameState.frø` står ikke i visningen, men bestemmer NESTE giv: passer
 *      alle, deler motoren ut `delUt(frø, rundeNr + 1)`. Ble det stående i verdenene, ville
 *      pass-linja blitt verdsatt med den EKTE neste given — klarsyn om framtiden, og en
 *      lekkasje K2-byttet av hender ALDRI ser. Hver verden får et frø utledet av visningen.
 *
 * `test/naabart-bud.test.ts` bytter både de skjulte hendene og frøet og krever identiske
 * verdier, og har to feller som MÅ bli tatt: et «nåbart» tak som leser de ekte hendene, og
 * ett som lar frøet stå.
 *
 * ============ HVA TALLET ER, OG HVA DET IKKE ER ==========================
 *
 *   ÉN-STEGS FORBEDRING. Hver beslutning velges med setets SENERE beslutninger spilt av
 *   policyen; i den ekte runden velges de senere på nytt, like rettferdig. Det er et
 *   policy-forbedringssteg, ikke optimum over alle budstrategier.
 *   VALG OG SCORE ER DISJUNKTE. Budet velges i W verdener uten den ekte; `tak-kart.ts`
 *   spiller det så i den ekte given. Argmax over støy kan da bare gjøre REGELEN dårligere,
 *   aldri tallet finere: med endelig W er gap_nåbart en NEDRE grense for det nåbare gapet
 *   (og kan være negativt for en god budgiver). Derfor rapporteres W, og W 8 → 32 måles.
 *   UAVGJORT BEHOLDER POLICYEN. Et bud må være STRENGT bedre i snitt for å bytte — ellers
 *   ville «alle linjer ender likt» (typisk når andre overbyr uansett) telt som bytte.
 *   FORTSETTELSEN er agentene kalleren gir. Standard i `tak-kart.ts` er rundens egne
 *   speker; batteriet gir speken UTEN søk (`--naabart-spek`), fordi hele boten koster
 *   ~2,7 s per runde og taket trenger hundrevis av utspillinger per giv. Det står i raden.
 */

import { lovligeHandlinger, utfør, type GameState } from "../src/index.ts";
import type { Bud } from "../src/regler.ts";
import { lagRng } from "../src/kort.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { visningsfrø } from "../src/moe2/sikkerorakel.ts";
import type { Spekagent } from "../src/moe2/agentspek.ts";

/** Instansfrøet. Frøbånd i målingen kommer fra givene, ikke herfra. */
export const NAABART_FRØ = 20_260_911;

export interface NaabartOpts {
  /** W: verdener per budbeslutning. 0 = ingen bevis, policyen står (kontrollarmen). */
  readonly verdener: number;
  /** Kandidatverdener budvekten velger mellom (`trekkVerdenBelief`). Standard 32, som `budq-data.ts`. */
  readonly kandidater?: number;
  readonly frø?: number;
  /** Fire seteagenter som spiller runden ferdig i verdenene. `nyKamp()` før hver utspilling. */
  readonly agenter: readonly Spekagent[];
  /**
   * FELLE-KROK for prøvene: hvor verdenene kommer fra. Standard `trekkVerdener` fra setets
   * visning. En krok som returnerer de EKTE hendene er klarsyn og skal bli tatt av K2.
   */
  readonly verdenerFor?: (s: GameState, sete: number, rng: () => number) => readonly (readonly number[][])[];
  /** FELLE-KROK: `false` lar det ekte frøet stå i verdenene. Standard vasket. */
  readonly vaskFrø?: boolean;
}

export interface NaabartValg {
  readonly bud: Bud;
  /** Snittpoeng for setet per lovlig bud, i `lovligeHandlinger`-rekkefølge. Tom når ingenting ble vurdert. */
  readonly verdier: readonly { readonly bud: Bud; readonly snitt: number }[];
  /** Verdener som faktisk ble spilt ut. */
  readonly n: number;
}

/** Tving `bud` for `sete`, spill runden ferdig med `agenter`, les av setets rundepoeng (som `tak-kart.ts`). */
export function spillBudUt(start: GameState, sete: number, bud: Bud, agenter: readonly Spekagent[]): number {
  for (const a of agenter) a.nyKamp();
  let s = utfør(start, { type: "BUD", spiller: sete, bud }).state;
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
    const i = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (i === null || i === undefined) break;
    s = utfør(s, agenter[i]!.velgHandling(s)).state;
  }
  return s.sisteRunde?.delta?.[sete] ?? 0;
}

/**
 * Det nåbare budet for `sete` i `s`. `policy` er budet boten selv ga i samme stilling; det
 * er utgangspunktet for argmax, og det står når ingen verden lot seg trekke, W = 0 eller
 * bare ett bud er lovlig.
 */
export function naabartBud(s: GameState, sete: number, policy: Bud, o: NaabartOpts): NaabartValg {
  const lov = lovligeHandlinger(s);
  if (s.fase !== "BUDRUNDE" || s.iTur !== sete || lov.fase !== "BUDRUNDE") {
    throw new Error(`naabartBud: sete ${sete} er ikke i tur i budrunden (fase ${s.fase}, i tur ${s.iTur})`);
  }
  if (!lov.bud.includes(policy)) throw new Error(`naabartBud: policybudet ${String(policy)} er ikke lovlig`);
  const kand = lov.bud;
  if (o.verdener <= 0 || kand.length < 2) return { bud: policy, verdier: [], n: 0 };
  const vf = visningsfrø(s, sete, o.frø ?? NAABART_FRØ);
  const rng = lagRng(vf);
  const hender =
    o.verdenerFor === undefined
      ? trekkVerdener(s, sete, o.verdener, rng, undefined, undefined, o.kandidater ?? 32)
      : o.verdenerFor(s, sete, rng);
  if (hender.length === 0) return { bud: policy, verdier: [], n: 0 };

  // Samme verdener for alle bud: forskjellene mellom budene er parvise.
  const sum = new Array<number>(kand.length).fill(0);
  for (let w = 0; w < hender.length; w++) {
    const v = medVerden(s, hender[w]! as number[][], sete);
    const verden: GameState = o.vaskFrø === false ? v : { ...v, frø: (vf + Math.imul(w + 1, 0x9e3779b1)) >>> 0 };
    for (let i = 0; i < kand.length; i++) sum[i]! += spillBudUt(verden, sete, kand[i]!, o.agenter);
  }
  const verdier = kand.map((bud, i) => ({ bud, snitt: sum[i]! / hender.length }));
  let beste = policy;
  let bv = verdier.find((x) => x.bud === policy)!.snitt;
  for (const x of verdier) {
    if (x.snitt > bv) {
      bv = x.snitt;
      beste = x.bud;
    }
  }
  return { bud: beste, verdier, n: hender.length };
}
