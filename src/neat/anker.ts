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

import {
  lovligeHandlinger,
  opprettSpill,
  utfør,
  type Bud,
  type GameState,
  type Handling,
} from "../index.ts";
import { analyserGiv, flaksVekt, sdBud, type Rollout } from "./singledummy.ts";
import { solverBesteKort } from "./hybrid.ts";
import type { Kort } from "../kort.ts";

/** Det målingen trenger av en kandidat. NeatAgent oppfyller det. */
export interface MålbarAgent {
  nyKamp(): void;
  velgHandling(state: GameState): Handling;
  /** Valgfri lamarckisk kalibrering av korthodet mot en fasit. */
  lærSpill?(state: GameState, spiller: number, solverKort: Kort, rate: number, mål?: number): void;
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
/**
 * BUDFOERER: overtar BUDRUNDE, VRAK og VELG i kandidatens eget sete.
 *
 * HVORFOR DETTE MAA FINNES. Maalt paa 80 giver x 4 seter er D5 spillefoerer i
 * 6 % av rundene, D6 i 2 % og D8b i 0,3 % - én runde av 320. De har ikke
 * blitt bedre, de har sluttet aa by. Naar det aa vinne budrunden koster
 * poeng, er det aa passe alltid den billigste utveien, og seleksjonen finner
 * den hver gang. Tapet flytter seg bare over i forsvaret (49 % -> 71 % ->
 * 90 % av totaltapet).
 *
 * Med en fast budfoerer kan ikke kandidaten velge bort rollen. Den blir
 * spillefoerer like ofte som budfoereren bestemmer, og maa faktisk spille
 * kontraktene hjem. Da maaler fitness spilleevne i stedet for unnvikelse.
 *
 * De tre fasene hoerer sammen: budet, vraket og etterlysningen er én
 * beslutningskjede om hva kontrakten skal vaere. Lot vi kandidaten vrake
 * ville den kunne sabotere en kontrakt den ikke ville ha.
 */
export function målAnkret(
  lagAgent: () => MålbarAgent,
  motstander: MotstanderTrekk,
  antallFrø: number,
  frøBase: number,
  maksRunder = 8,
  budfører?: MotstanderTrekk,
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
        else if (iTur !== sete) h = motstander(s);
        else if (
          budfører !== undefined &&
          (s.fase === "BUDRUNDE" || s.fase === "VRAK" || s.fase === "VELG")
        ) {
          // Budfoereren eier kontraktvalget i kandidatens sete; kandidaten
          // eier bare kortspillet. Se kommentaren over målAnkret.
          h = budfører(s);
        } else h = agent.velgHandling(s);
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

// ---------------------------------------------------------------------------
// SD-ANKRET RUNDEMAALING
// ---------------------------------------------------------------------------

/**
 * Én RUNDE av gangen, med single-dummy-orakelet som budgiver.
 *
 * ROLLEFORDELINGEN, som er hele poenget:
 *   BUDRUNDE  – SD-orakelet. Budet er det haanden faktisk baerer, ikke det
 *               nevros budnett toer aa si (det underbyr med over tre stikk).
 *   VRAK/VELG – NevroHjerne. Kontraktvalget skal vaere kompetent, men det er
 *               ikke det vi trener.
 *   SPILL     – kandidaten. Det ENESTE den eier, og det eneste som maales.
 *
 * FLAKSVEKTEN. Hver runde teller `flaksVekt(std)`, der std er spredningen i
 * SD-rolloutene over de fire setene. Laa kortene skjevt, slaar det mindre ut
 * baade i ros og ris: «det gikk ikke, men giva var et lotteri». Uten dette
 * straffes agenten like hardt for en umulig giv som for en den bommet paa.
 *
 * MAKSRUNDER ER 1 MED VILJE: vekten gjelder ÉN giv, og en kamp over flere
 * runder ville blandet giv med hver sin spredning til ett poengtall som ikke
 * kan vektes per giv.
 */
export interface SpillFasit {
  /** Sannsynlighet per kortvalg for at solveren konsulteres. */
  readonly sjanse: number;
  readonly rate: number;
  readonly verdener: number;
  readonly dybde: number;
  readonly nodeTak: number;
  readonly rng: () => number;
  /** Teller opp hvor mange ganger fasiten faktisk fyrte. */
  readonly teller?: { treff: number };
}

export function målSDRunder(
  lagAgent: () => MålbarAgent,
  motstander: MotstanderTrekk,
  kontraktfører: MotstanderTrekk,
  orakel: Rollout,
  antallFrø: number,
  frøBase: number,
  alfa = 1,
  fasit?: SpillFasit,
): Måling {
  const agent = lagAgent();
  let mesterPoeng = 0;
  let andresPoeng = 0;
  let seire = 0;
  let vektSum = 0;
  let kamper = 0;
  const differ: number[] = [];
  for (let f = 0; f < antallFrø; f++) {
    for (let sete = 0; sete < 4; sete++) {
      agent.nyKamp();
      let s = opprettSpill({ antallSpillere: 4 }, frøBase + f);
      // Analysen gjoeres paa den ferske budrunden og caches paa (froe,
      // rundeNr), saa hele populasjonen deler kostnaden.
      const analyse = analyserGiv(s, orakel);
      const vekt = flaksVekt(analyse.std, alfa);
      let vakt = 0;
      while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
        const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
        let h: Handling;
        if (iTur !== sete) h = motstander(s);
        else if (s.fase === "BUDRUNDE") {
          // Estimatet maa gjennom LOVLIGHETSFILTERET. Har noen alt bydd
          // hoeyere enn haanden baerer, er det riktige svaret PASS - ikke et
          // ulovlig bud, og heller ikke et overbud orakelet ikke staar inne
          // for. Vi tar det hoeyeste lovlige budet som ikke overstiger
          // estimatet.
          const lov = lovligeHandlinger(s);
          const mål = sdBud(analyse, sete, s.giving.antallStikk);
          let valgt: Bud = "PASS";
          if (lov.fase === "BUDRUNDE") {
            for (const b of lov.bud) {
              if (typeof b === "number" && b <= mål && (valgt === "PASS" || b > valgt)) valgt = b;
            }
          }
          h = { type: "BUD", spiller: sete, bud: valgt };
        } else if (s.fase === "VRAK" || s.fase === "VELG") h = kontraktfører(s);
        else {
          // SPILLFASIT. Maalt paa orakelbenken velger alle fire trente genom
          // kort DAARLIGERE enn et uniformt tilfeldig lovlig kort (anger
          // 1,05-1,11 mot gulvet 1,04), og et FERSKT utrent genom er bedre
          // enn dem alle. Seleksjon har altsaa ikke bare latt vaere aa finne
          // kortferdighet - den har spist opp det lille som var der. Grunnen
          // ser man i variansdekomponeringen: agenten forklarer 0,1 % av
          // angervariansen, stillingen 68 %. Det er ikke noe signal for
          // seleksjonen aa gripe tak i.
          //
          // Derfor faar korthodet en LAERER i stedet. Agentens eget valg
          // spilles fortsatt (on-policy - DAgger-laerdommen); solveren
          // brukes bare som fasit til kalibreringen.
          if (fasit !== undefined && agent.lærSpill !== undefined && fasit.rng() < fasit.sjanse) {
            const kort = solverBesteKort(s, sete, {
              verdener: fasit.verdener,
              dybde: fasit.dybde,
              nodeTak: fasit.nodeTak,
              rng: fasit.rng,
            });
            if (kort !== null) {
              agent.lærSpill(s, sete, kort, fasit.rate);
              if (fasit.teller !== undefined) fasit.teller.treff++;
            }
          }
          h = agent.velgHandling(s);
        }
        s = utfør(s, h).state;
      }
      const egne = s.totalPoeng[sete] ?? 0;
      const andre = (s.totalPoeng.reduce((a, b) => a + b, 0) - egne) / 3;
      mesterPoeng += egne * vekt;
      andresPoeng += andre * vekt;
      differ.push((egne - andre) * vekt);
      vektSum += vekt;
      if (egne > andre) seire++;
      kamper++;
    }
  }
  const v = vektSum || 1;
  const snittDiff = mesterPoeng / v - andresPoeng / v;
  let sq = 0;
  for (const d of differ) sq += (d - snittDiff) * (d - snittDiff);
  const se = kamper > 1 ? Math.sqrt(sq / (kamper - 1) / kamper) : 0;
  return { mester: mesterPoeng / v, motstander: andresPoeng / v, diff: snittDiff, seire, kamper, se };
}
