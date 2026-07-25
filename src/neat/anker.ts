/**
 * ANKRET MÅLING – én definisjon, brukt både som fitness og som benk.
 *
 * BAKGRUNNEN, fordi den kostet et helt døgn: D7-ligaen ga hvert genom en
 * Elo-rating fra tre kamper mot NABOENE i populasjonen. To ting gikk galt.
 *
 * 1. Ratingen var RELATIV og manglet anker. Alle fire seter kom fra samme
 *    populasjon, så tallet kunne bare rangere innad – ikke si om feltet som
 *    helhet ble bedre. Målt: snittratingen stod ikke stille slik en lukket
 *    Elo-liga krever, men steg fra 1520 til 4119 på 1500 generasjoner, mens
 *    spredningen lå fast på ~40. Mekanismen var arven: mesteren beholdt
 *    feltets MAKS mens de 95 barna ble reseedet på feltets SNITT, så
 *    nytt snitt = gammelt snitt + (maks − snitt)/96 ≈ +1,98 per generasjon.
 *    Observert drift var +1,73. Hele stigningen var den pumpa, null var spill.
 *
 * 2. Tre kamper per genom per generasjon er giverflaks, ikke måling. Etter
 *    525–1525 generasjoner var ALLE fire skår dårligere enn sitt eget
 *    utgangspunkt (−4,4 til −24,6 poeng/kamp, tegntest p=0,000).
 *
 * Kuren er begge deler samtidig: mål mot en FROSSEN motstander (absolutt
 * skala, sammenlignbar på tvers av generasjoner) på DUPLIKATE givere som
 * hele populasjonen deler (giverflaksen faller ut av differansen mellom to
 * genomer, slik neat-evaluer alltid har gjort det).
 *
 * Konvensjonen er `målMot` i examples/neat-tren.ts, med vilje: det er den
 * fremgangsgrafen plotter. `mester` og `motstander` er RÅPOENG fra samme
 * bord – ikke differanser. D7 skrev differanser i samme tekstformat, og da
 * ble kurven på siden uforenlig med D5/D6 uten at noe så galt ut.
 */

import { opprettSpill, utfør, type GameState, type Handling } from "../index.ts";

/** Det målingen trenger av en kandidat. NeatAgent oppfyller det. */
export interface MålbarAgent {
  nyKamp(): void;
  velgHandling(state: GameState): Handling;
}

/**
 * Motstanderen injiseres, den importeres ikke. Grunnen er praktisk: den
 * grådige referansebotten bor i examples/graadig.ts, og src/ skal ikke peke
 * inn i examples/. Kalleren sender inn `grådigHandling` eller en frossen
 * NevroAgents `velgHandling`.
 */
export type MotstanderTrekk = (state: GameState) => Handling;

export interface Måling {
  /** Kandidatens råpoeng per kamp. */
  readonly mester: number;
  /** Motstandernes snittpoeng per kamp, samme bord. */
  readonly motstander: number;
  /** Differansen – det ENE tallet som betyr noe. */
  readonly diff: number;
  readonly seire: number;
  readonly kamper: number;
  /** Standardfeil på diff, over de (giver × sete)-kampene som inngikk. */
  readonly se: number;
}

/**
 * Spiller `antallFrø` givere i ALLE FIRE seter mot tre frosne motstandere.
 *
 * Å spille hver giver fra alle fire seter er ikke pynt: det fjerner
 * setefordelen fra tallet, og det gjør at to kandidater målt på samme
 * frøbase har sett nøyaktig de samme kortene fra de samme plassene.
 *
 * `maksRunder` bounder både kostnad og varians. `målMot` i neat-tren spiller
 * til FERDIG (opptil 40 runder); for fitness er det for dyrt og for spredt.
 */
export function målAnkret(
  lagAgent: () => MålbarAgent,
  motstander: MotstanderTrekk,
  antallFrø: number,
  frøBase: number,
  maksRunder = 8,
): Måling {
  const agent = lagAgent();
  let mesterPoeng = 0;
  let andresPoeng = 0;
  let seire = 0;
  let kamper = 0;
  // Differansene tas vare på enkeltvis: uten dem kan vi ikke oppgi SE, og
  // uten SE er «bedre enn forrige generasjon» bare en påstand.
  const differ: number[] = [];
  for (let f = 0; f < antallFrø; f++) {
    for (let sete = 0; sete < 4; sete++) {
      agent.nyKamp();
      let s = opprettSpill({ antallSpillere: 4 }, frøBase + f);
      let vakt = 0;
      while (s.fase !== "FERDIG" && vakt++ < 20000) {
        if (s.fase === "RUNDE_SLUTT" && s.rundeNr + 1 >= maksRunder) break;
        const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
        let h: Handling;
        if (s.fase === "RUNDE_SLUTT") h = { type: "NESTE" };
        else if (iTur === sete) h = agent.velgHandling(s);
        else h = motstander(s);
        s = utfør(s, h).state;
      }
      const egne = s.totalPoeng[sete] ?? 0;
      const andre = (s.totalPoeng.reduce((a, b) => a + b, 0) - egne) / 3;
      mesterPoeng += egne;
      andresPoeng += andre;
      differ.push(egne - andre);
      if (s.vinner === sete) seire++;
      kamper++;
    }
  }
  const snittDiff = mesterPoeng / kamper - andresPoeng / kamper;
  let sq = 0;
  for (const d of differ) sq += (d - snittDiff) * (d - snittDiff);
  const se = kamper > 1 ? Math.sqrt(sq / (kamper - 1) / kamper) : 0;
  return {
    mester: mesterPoeng / kamper,
    motstander: andresPoeng / kamper,
    diff: snittDiff,
    seire,
    kamper,
    se,
  };
}

/**
 * Benkelinjer i NØYAKTIG det formatet neat-graf.ts parser: generasjonen på
 * en egen linje først, så benken. Skrives det på én linje matcher
 * generasjonsregexen aldri, og hvert punkt forkastes stille – det var
 * grunnen til at D7 aldri dukket opp på siden uansett hvor lenge den kjørte.
 */
export function benkelinjer(gen: number, mot: "grådig" | "nevro", m: Måling): string {
  const navn = mot === "nevro" ? "nevro" : "grådig bot";
  return (
    `gen ${gen}: diff ${m.diff.toFixed(1)} +- ${m.se.toFixed(1)}` +
    String.fromCharCode(10) +
    `benk vs ${navn}: mester ${m.mester.toFixed(1)} poeng/kamp, ` +
    `${mot} ${m.motstander.toFixed(1)}, seire ${m.seire}/${m.kamper}`
  );
}
