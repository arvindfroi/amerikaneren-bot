/**
 * SINGLE-DUMMY-ORAKEL FOR BUDET.
 *
 * Hva KAN laget ta med denne haanden, naar man ikke ser motstandernes kort?
 * Svaret hentes ved aa spille giva ut: setet tvinges til aa vinne budrunden
 * paa minste tallbud, NevroHjerne vraker, velger trumf og spiller alle fire
 * seter, og lagstikkene som kommer ut ER estimatet. Det er single dummy i
 * ordets egentlige forstand - ingen ser skjulte kort, i motsetning til den
 * dobbelte dummyen som loeser giva med alle haender aapne.
 *
 * HVORFOR DETTE OG IKKE NEVROS EGET BUDNETT. Budnettet byr 5,66 i snitt og
 * henter hjem 8,92 (maalt paa 12 giver x 4 seter) - det underbyr systematisk
 * med over tre stikk. Lot vi det bestemme kontrakten ville spilleagenten
 * trent paa kontrakter som er altfor lette, og aldri laert aa spille en
 * ambisioes kontrakt hjem. SD-orakelet byr det haanden faktisk baerer.
 *
 * STANDARDAVVIKET FOELGER MED, og det er ikke pynt. NevroHjerne er helt
 * deterministisk, saa den eneste variasjonen i en fast giv - og den eneste
 * som er UKJENT i budoeyeblikket - er hvem som ender med kontrakten, og
 * dermed hvilken trumf og hvilken skjult makker giva faar. Rollout k er
 * derfor sete k, og spredningen over de fire forteller hvor mye giva
 * avgjoeres av flaks. Giv med hoey spredning skal telle mindre naar agenten
 * doemmes: «det gikk ikke, men kortene laa skjevt, saa jeg er ikke like
 * streng».
 *
 * Analysen caches paa (froe, rundeNr) slik at hele populasjonen deler
 * kostnaden i stedet for aa betale den per genom.
 */

import { utfør, type GameState, type Handling } from "../index.ts";
import { MINSTE_TALLBUD } from "../regler.ts";

/** Det orakelet trenger av en utspiller – NevroAgent oppfyller det. */
export interface Rollout {
  velgHandling(state: GameState): Handling;
}

export interface GivAnalyse {
  /** Lagstikk per sete naar det setet fikk kontrakten. */
  readonly sd: number[];
  /** Snittet over setene – SD-estimatet for giva. */
  readonly snitt: number;
  /** Spredningen over setene: hvor mye giva avgjoeres av hvem som byr. */
  readonly std: number;
}

const cache = new Map<string, GivAnalyse>();

/** Nullstiller cachen. Bare for tester og for maalinger som bytter frøsett. */
export function tømCache(): void {
  cache.clear();
}

/**
 * Rykker stillingen tilbake til en frisk budrunde med `sete` i tur.
 * Kortene staar; alt som er bestemt etter givingen nullstilles.
 */
function friskBudrunde(s: GameState, sete: number): GameState {
  const N = s.antallSpillere;
  return {
    ...s,
    fase: "BUDRUNDE",
    iTur: sete,
    totalPoeng: new Array<number>(N).fill(0),
    vinner: null,
    budrunde: {
      passet: new Array<boolean>(N).fill(false),
      høyeste: null,
      sisteBud: new Array<null>(N).fill(null),
    },
    budvinner: null,
    melding: null,
    vrak: [],
    trumf: null,
    etterlyst: null,
    makker: null,
    makkerAvslørt: false,
    utspiller: null,
    bord: [],
    stikkVunnet: new Array<number>(N).fill(0),
    stikkSpilt: 0,
    forrigeStikk: null,
    historikk: [],
    sisteRunde: null,
  };
}

/**
 * Spiller giva ut fra hvert sete og returnerer lagstikkene.
 *
 * `budState` maa staa i BUDRUNDE – det er der budet skal avgjoeres.
 */
export function analyserGiv(budState: GameState, spiller: Rollout): GivAnalyse {
  const nøkkel = `${budState.frø}:${budState.rundeNr}`;
  const truffet = cache.get(nøkkel);
  if (truffet !== undefined) return truffet;

  const N = budState.antallSpillere;
  const sd: number[] = [];
  for (let sete = 0; sete < N; sete++) {
    let s = friskBudrunde(budState, sete);
    s = utfør(s, { type: "BUD", spiller: sete, bud: MINSTE_TALLBUD }).state;
    let vakt = 0;
    while (s.fase === "BUDRUNDE" && vakt++ < 8) {
      s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
    }
    vakt = 0;
    while ((s.fase === "VRAK" || s.fase === "VELG") && vakt++ < 10) {
      s = utfør(s, spiller.velgHandling(s)).state;
    }
    vakt = 0;
    while (s.fase === "SPILL" && vakt++ < 250) s = utfør(s, spiller.velgHandling(s)).state;
    const res = s.sisteRunde;
    if (res !== null && res !== undefined) sd.push(res.lagStikk);
  }
  const n = sd.length || 1;
  const snitt = sd.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(sd.reduce((a, b) => a + (b - snitt) * (b - snitt), 0) / n);
  const analyse: GivAnalyse = { sd, snitt, std };
  cache.set(nøkkel, analyse);
  return analyse;
}

/**
 * SD-orakelets bud for `sete`: det setet faktisk henter hjem i rolloutet,
 * klippet til lovlig budomraade.
 *
 * Det er BEVISST at estimatet er setets eget tall og ikke snittet over
 * setene: budet skal svare paa «hva baerer MIN haand herfra», og hvilket sete
 * som byr avgjoer baade trumfvalg og hvem makkeren blir.
 */
export function sdBud(analyse: GivAnalyse, sete: number, antallStikk: number): number {
  const rå = analyse.sd[sete] ?? Math.round(analyse.snitt);
  return Math.max(MINSTE_TALLBUD, Math.min(antallStikk, Math.round(rå)));
}

/**
 * Hvor STRENGT runden skal telle, gitt hvor mye giva avgjoeres av flaks.
 *
 * Vekten er normalisert rundt medianspredningen, ikke raa 1/(1+std): en raa
 * invers gir snittvekt godt under 1 og er da bare en uniform senking av
 * laeringsraten, ikke en vekting. Klippet [0,3, 2,0] hindrer at én enkelt
 * ekstremgiv dominerer en hel generasjon.
 *
 * RISIKOEN, som maa staa: aa nedvekte giv med hoey spredning flytter
 * seleksjonstrykket mot de LETTE givene. Tas det for langt blir populasjonen
 * MAALT bedre uten aa vaere det. Derfor er `alfa` en parameter og ikke en
 * konstant, og medianen er maalt, ikke gjettet.
 */
// MAALT paa 40 giver x 4 seter (froe 5 000 000+): median 1,12, p10 0,71,
// p90 2,49. Med denne medianen blir snittvekten 1,08 - altsaa en ekte
// vekting rundt 1, ikke en skjult senking av laeringsraten.
export const MEDIAN_STD = 1.12;
export function flaksVekt(std: number, alfa = 1): number {
  const v = (1 + MEDIAN_STD / alfa) / (1 + std / alfa);
  return Math.max(0.3, Math.min(2, v));
}
