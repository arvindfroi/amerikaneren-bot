/**
 * BUDVAKTEN – overstyrer PASS til BUD når SD-orakelet sier hånden bærer budet.
 *
 * HVORFOR. `analyse/mesterai-fasegap.txt` fant at budgivningen vår og
 * MesterAIs er DET SAMME NETTET: alle 7 721 stillingene der begge ga et
 * tallbud er bit-identiske. Det eneste de skiller på er PASS mot by – 811 av
 * 12 615 beslutninger – og der byr MesterAI i 451 stillinger vi passer i.
 * SD-orakelet sier 9,00 i akkurat de stillingene; MesterAI byr 9,59 og
 * innfrir likevel 72 %. Den byr altså OVER det hånden bærer, og slipper unna
 * med det.
 *
 * Hypotesen som prøves her: budpolicyen ble laget da kortspillet vårt var
 * svakere. Etter konvensjonsvakten innfrir vi 75 % mot MesterAIs 73 %
 * (`docs/moe2.md`, «Konvensjonsvaktene mot MesterAI»), mens tallet var 60 %
 * mot 80 % da kostnadskurven for overbud ble målt. Koster overbud oss
 * fortsatt 5,2 poeng der det koster MesterAI 0,1, eller har vi nå råd til
 * budene vi passer på?
 *
 * REGELEN. Byr den indre agenten PASS, ser vakten hva SD-orakelet sier for
 * DETTE setet og sammenligner med det laveste tallbudet som fortsatt er
 * lovlig (`b`). Er `SD − b ≥ margin`, byr vakten `b`. Ellers står passet.
 * Vakten hever aldri et tallbud og senker aldri noe – den gjør bare om PASS
 * til det minste lovlige budet, som er nøyaktig den ene aksen fasegapet fant
 * uenighet på.
 *
 * ================= TO ESTIMATORER: ETT TAK OG ÉN LOVLIG SPILLER ============
 *
 * ORAKELET (`bud:0:…`) bruker `analyserGiv`, som spiller giva ut fra den
 * FAKTISKE stillingen, altså med alle fire hender kjent. Ingen av rolloutets
 * spillere ser skjulte kort – det er derfor «single dummy» – men SELVE TALLET
 * avhenger av hvor motstandernes kort ligger, og det kan ikke en budgiver
 * vite. Konvensjonsvakten i `konvensjonsvakt.ts` er en lovlig SPILLER;
 * orakelvarianten her er det IKKE. Den er en TAKMÅLING: «hvis du visste
 * perfekt hva hånden bar, ville det lønt seg å by mer?» Slår ikke taket
 * kontrollen, er hypotesen død.
 *
 * DEN BLINDE (`bud:b8+0.5:…`) sampler K utdelinger av de 40 kortene setet
 * ikke har, kjører nøyaktig samme rollout på hver, og bruker snittet. Den ser
 * bare egen hånd og er en lovlig spiller. Den er den eneste av de to som kan
 * promoteres – og fordi et snitt over samplede verdener har en helt annen
 * fordeling enn ett tall fra fasiten, må marginen tunes på sin egen skala,
 * ikke arves fra orakelet.
 *
 * SPESIFIKASJON: «bud:<flagg>:<indre kandidat>», f.eks.
 *   bud:0:e1:e1-modell/sd-r2.bin           orakel: by når SD ≥ det lovlige budet
 *   bud:1:vakt:at:e1:e1-modell/sd-r2.bin   orakel, konservativ: SD ≥ budet + 1
 *   bud:-1:vakt:at:e1:e1-modell/sd-r2.bin  orakel, aggressiv: SD ≥ budet − 1
 *   bud:m-0.6:vakt:at:e1:e1-modell/sd-r2.bin
 *       «m» = snittet over de fire setene i stedet for setets eget tall.
 *       Setets eget SD-tall er et HELTALL (lagstikk fra ett rollout), så
 *       brøkmarginer er meningsløse på det; snittet er kontinuerlig og gir
 *       terskler mellom heltallene. −0,6 speiler MesterAI, som byr 9,59 der
 *       orakelet sier 9,00.
 *   bud:b8+0.5:vakt:at:e1:e1-modell/sd-r2.bin
 *       den LOVLIGE: 8 samplede verdener, by når snittet ≥ budet + 0,5.
 *   bud:h@e1-modell/hand-a.bin@+0.5:vakt:at:e1:e1-modell/sd-r2.bin
 *       den LÆRTE, også lovlig: håndvurderingsnettet i stedet for rollouts.
 *       Se `src/moe2/handnett.ts`. Separatoren er «@» og ikke «:» fordi
 *       kandidatspesifikasjonen deles på kolon, og ikke «+/−» alene fordi
 *       filstier inneholder bindestrek.
 */

import { kortId, lagRng, nyStokk, stokk, type Kort } from "../kort.ts";
import { PASS, type Bud } from "../regler.ts";
import { lovligeHandlinger, type GameState, type Handling } from "../motor.ts";
import { analyserGiv, sdForSete, type Rollout } from "../neat/singledummy.ts";
import type { NevroNett } from "../nevro/nett.ts";
import { handSd } from "./handnett.ts";
import type { Innagent } from "./konvensjonsvakt.ts";

export interface Budvalg {
  /** By når SD-estimatet ligger minst så mye over det budet vi må gi. */
  readonly margin: number;
  /**
   * Bruk snittet over de fire setene i stedet for setets eget SD-tall.
   * Setets eget tall er et heltall; snittet er kontinuerlig.
   * Gjelder bare orakelvarianten.
   */
  readonly brukSnitt: boolean;
  /**
   * Antall SAMPLEDE verdener i den LOVLIGE estimatoren. 0 = bruk orakelet,
   * som ser alle fire hender og derfor jukser.
   */
  readonly verdener: number;
  /**
   * Sti til håndvurderingsnettet, eller null. Er den satt, kommer estimatet
   * fra nettet og hverken fra orakelet eller fra rollouts.
   */
  readonly nettFil: string | null;
}

/**
 * Leser flaggstrengen.
 *
 *   «0», «1», «-1»      orakelet, setets eget SD-tall, med den marginen
 *   «m-0.6», «m0.5»     orakelet, snittet over de fire setene
 *   «b8+0.5», «b12-1»   LOVLIG estimator: 8 (12) samplede verdener, margin
 *                       +0,5 (−1). Fortegnet er obligatorisk her, ellers
 *                       kan ikke verdenstallet skilles fra marginen.
 *   «h@<sti>@<margin>»  LOVLIG estimator: håndvurderingsnettet i `<sti>`.
 */
export function lesBudflagg(flagg: string): Budvalg {
  if (flagg.startsWith("h@")) {
    const delt = flagg.split("@");
    if (delt.length !== 3 || delt[1] === "" || delt[2] === "") {
      throw new Error(`Ukjent håndnettflagg «${flagg}» (ventet «h@<sti>@<margin>»)`);
    }
    const margin = Number(delt[2]);
    if (!Number.isFinite(margin)) {
      throw new Error(`Ukjent margin «${delt[2]}» i «${flagg}»`);
    }
    return { margin, brukSnitt: false, verdener: 0, nettFil: delt[1]! };
  }
  if (flagg.startsWith("b")) {
    const brudd = flagg.search(/[+-]/);
    if (brudd < 0) {
      throw new Error(`Blind budmargin «${flagg}» mangler fortegn: skriv f.eks. «b8+0.5» eller «b8-1»`);
    }
    const verdener = Number(flagg.slice(1, brudd));
    const margin = Number(flagg.slice(brudd));
    if (!Number.isInteger(verdener) || verdener < 1 || !Number.isFinite(margin)) {
      throw new Error(`Ukjent blind budmargin «${flagg}» (ventet «b<verdener><±margin>»)`);
    }
    return { margin, brukSnitt: false, verdener, nettFil: null };
  }
  const brukSnitt = flagg.startsWith("m");
  const tall = Number(brukSnitt ? flagg.slice(1) : flagg);
  if (!Number.isFinite(tall)) {
    throw new Error(`Ukjent budmargin «${flagg}» (ventet et tall, evt. med «m»-, «b»- eller «h@»-prefiks)`);
  }
  return { margin: tall, brukSnitt, verdener: 0, nettFil: null };
}

/** Deler «bud:<margin>:<resten>» i margin og indre kandidatspesifikasjon. */
export function delBudspek(spec: string): { valg: Budvalg; flagg: string; indre: string } | null {
  if (!spec.startsWith("bud:")) return null;
  const rest = spec.slice(4);
  const skille = rest.indexOf(":");
  if (skille <= 0) throw new Error(`Budspesifikasjonen mangler indre kandidat: «${spec}»`);
  const flagg = rest.slice(0, skille);
  return { valg: lesBudflagg(flagg), flagg, indre: rest.slice(skille + 1) };
}

/**
 * Det laveste TALLBUDET som fortsatt er lovlig, eller null når ingen er det
 * (alle tallbud er overbudt av en Amerikaner/Solo, eller stillingen er ikke
 * en budrunde). Amerikaner og Solo er bevisst utelatt: fasegapet fant
 * uenighet bare på tallbudene, og et Solo-bud er en helt annen beslutning.
 */
export function lovligMinstebud(s: GameState): number | null {
  if (s.fase !== "BUDRUNDE") return null;
  const lov = lovligeHandlinger(s);
  if (lov.fase !== "BUDRUNDE") return null;
  let minste: number | null = null;
  for (const b of lov.bud) {
    if (typeof b === "number" && (minste === null || b < minste)) minste = b;
  }
  return minste;
}

// --- Den LOVLIGE estimatoren -------------------------------------------------

/**
 * BLINDT SD-ESTIMAT: samme rollout som orakelet, men på verdener som er
 * SAMPLET fra det setet selv kan se.
 *
 * I budøyeblikket vet setet nøyaktig én ting om de skjulte kortene: at det er
 * de 40 som ikke ligger på egen hånd. Talongen er ikke snudd, ingen kort er
 * spilt, og budene som er gitt er ikke tolket her (det ville vært en
 * budkonvensjon, ikke et korttall). Estimatet er derfor snittet over `K`
 * uniforme utdelinger av de 40 – ekte single dummy, uten juks.
 *
 * DETERMINISME. Frøet er en ren funksjon av (giv, runde, sete), så alle
 * kandidater i alle prosesser får samme tall på samme stilling, og
 * differansen mellom to marginer er ikke samplingstøy. Av samme grunn er
 * cachen nøklet på (giv, runde, sete, verdener) – estimatet avhenger ikke av
 * budrundens gang, bare av hånden.
 */
const blindCache = new Map<string, number>();

/** Nullstiller det blinde estimatets cache. Bare for tester. */
export function tømBlindCache(): void {
  blindCache.clear();
}

export function blindSd(s: GameState, sete: number, verdener: number, spiller: Rollout): number {
  const nøkkel = `${s.frø}:${s.rundeNr}:${sete}:${verdener}`;
  const truffet = blindCache.get(nøkkel);
  if (truffet !== undefined) return truffet;

  const egen = s.hender[sete] ?? [];
  const mine = new Set(egen.map(kortId));
  const skjult = nyStokk().filter((k) => !mine.has(kortId(k)));
  const rng = lagRng((s.frø + Math.imul(s.rundeNr + 1, 40503) + Math.imul(sete + 1, 2654435761)) >>> 0);
  const perHånd = egen.length;
  const N = s.antallSpillere;

  let sum = 0;
  let n = 0;
  for (let w = 0; w < verdener; w++) {
    const blandet = stokk(skjult, rng);
    const hender: Kort[][] = [];
    let i = 0;
    for (let p = 0; p < N; p++) {
      if (p === sete) hender.push(egen.slice());
      else {
        hender.push(blandet.slice(i, i + perHånd));
        i += perHånd;
      }
    }
    const verden: GameState = { ...s, hender, talong: blandet.slice(i, i + s.giving.talong) };
    const stikk = sdForSete(verden, sete, spiller);
    if (stikk !== null) {
      sum += stikk;
      n++;
    }
  }
  const svar = n === 0 ? 0 : sum / n;
  blindCache.set(nøkkel, svar);
  return svar;
}

/**
 * Hva vakten ville gjort med `bud` i denne stillingen. Ren funksjon, testbar.
 *
 * `nett` må være satt når `valg.nettFil` er det – kallstedet laster filen, så
 * denne funksjonen kan holdes fri for I/O. Mangler nettet, er det en feil og
 * ikke en stille tilbakefall til orakelet: da hadde vi målt juks og trodd det
 * var en lovlig spiller.
 */
export function budvaktBud(
  s: GameState,
  sete: number,
  bud: Bud,
  valg: Budvalg,
  orakel: Rollout,
  nett: NevroNett | null = null,
): Bud {
  if (bud !== PASS) return bud;
  const b = lovligMinstebud(s);
  if (b === null) return bud;
  let sd: number;
  if (valg.nettFil !== null) {
    if (nett === null) throw new Error(`Budvakten mangler håndnettet «${valg.nettFil}»`);
    sd = handSd(nett, s, sete);
  } else if (valg.verdener > 0) {
    sd = blindSd(s, sete, valg.verdener, orakel);
  } else {
    const analyse = analyserGiv(s, orakel);
    sd = valg.brukSnitt ? analyse.snitt : (analyse.sd[sete] ?? analyse.snitt);
  }
  return sd - b >= valg.margin ? b : bud;
}

/** Legger budregelen utenpå en vilkårlig agent uten å røre kortspillet. */
export class Budvakt implements Innagent {
  private readonly indre: Innagent;
  private readonly valg: Budvalg;
  private readonly orakel: Rollout;
  private readonly nett: NevroNett | null;
  /** Hvor mange PASS vakten har gjort om til bud – kontroll på at den virker. */
  overstyrt = 0;
  /** Hvor mange PASS den indre agenten ga i det hele tatt. */
  passTotalt = 0;

  constructor(indre: Innagent, valg: Budvalg, orakel: Rollout, nett: NevroNett | null = null) {
    this.indre = indre;
    this.valg = valg;
    this.orakel = orakel;
    this.nett = nett;
  }

  nyKamp(): void {
    this.indre.nyKamp?.();
  }

  velgHandling(state: GameState): Handling {
    const h = this.indre.velgHandling(state);
    if (h.type !== "BUD" || h.bud !== PASS) return h;
    this.passTotalt++;
    const bud = budvaktBud(state, h.spiller, h.bud, this.valg, this.orakel, this.nett);
    if (bud === h.bud) return h;
    this.overstyrt++;
    return { type: "BUD", spiller: h.spiller, bud };
  }
}
