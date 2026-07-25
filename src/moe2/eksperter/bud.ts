/**
 * BUD-EKSPERTEN – forventet lagstikk, én skalar.
 *
 * FASIT: SD-orakelet (`src/neat/singledummy.ts`). Giva spilles ut fra hvert
 * sete med NevroHjerne på alle fire hender, og lagstikkene setet faktisk
 * henter hjem ER fasiten. Det er single dummy i ordets egentlige forstand –
 * ingen ser skjulte kort.
 *
 * HVORFOR IKKE NEVROS EGET BUDNETT SOM FASIT: budnettet byr 5,66 i snitt og
 * henter hjem 8,92 (målt, 12 giver × 4 seter). Det underbyr systematisk med
 * over tre stikk, og en ekspert trent på det ville lært å melde kontrakter
 * som er altfor lette. SD-orakelet byr det hånden faktisk bærer: 8,78 i snitt
 * med spredning 5–12.
 *
 * HANDLINGSROMMET er tallet på stikk laget påtar seg, ikke budet som symbol:
 *   PASS       → 4  («jeg påtar meg mindre enn minste tallbud»)
 *   tallbud n  → n
 *   AMERIKANER → alle stikk
 *   SOLO       → alle stikk
 * Da kan pass, tallbud og amerikaner sammenlignes på ÉN akse, og fasiten
 * er definert for hver av dem. Uten den felles aksen kunne gulvet ikke regnes
 * eksakt, og et gulv som må samples er ikke et gulv.
 *
 * TAPET ER ASYMMETRISK, og det er MÅLT – se `budKostnad` under.
 */

import { type GameState, lovligeHandlinger, spillerVisning, utfør } from "../../motor.ts";
import { NevroAgent } from "../../nevro/agent.ts";
import { analyserGiv, sdBud } from "../../neat/singledummy.ts";
import { lagInn } from "../../neat/trekk.ts";
import { AMERIKANER, MINSTE_TALLBUD, PASS, SOLO, type Bud } from "../../regler.ts";
import { opprettSpill } from "../../index.ts";
import { type Ekspert, type Råstilling } from "./felles.ts";
import { BUD_SENSORER, projiser } from "./sensorer.ts";

/** Handlingen er antall stikk laget påtar seg. 4 = pass. */
export type Budhandling = number;

/** Utgang 0: forventet lagstikk, i tanh-rommet (−1 = 0 stikk, +1 = alle). */
export const UT_LAGSTIKK = 0;

/** Bud → stikkpåstand på den felles aksen. */
export function påstand(bud: Bud, antallStikk: number): number {
  if (bud === PASS) return MINSTE_TALLBUD - 1;
  if (bud === AMERIKANER || bud === SOLO) return antallStikk;
  return bud;
}

// ---------------------------------------------------------------------------
// TAPSFUNKSJONEN – asymmetrisk, og hvert tall er målt
// ---------------------------------------------------------------------------

/**
 * HVA ETT STIKKS BUDFEIL KOSTER, I POENG PER RUNDE.
 *
 * MÅLT 2026-07-25 på 240 givere × 4 seter (`examples/moe2-port-bud.ts`,
 * `analyse/moe2-port-bud.txt`). Bare budet varieres; vrak, trumfvalg,
 * etterlysning og hele kortspillet i alle fire seter er NevroHjerne, så
 * ingenting annet kan forklare forskjellen:
 *
 *   policy   snittbud  poeng/runde   tap mot SD   tap per stikk
 *   SD + 1      9,92       −10,86        14,75         14,75
 *   SD           9,10        +3,89            –             –
 *   SD − 1       8,32        +2,38         1,51          1,51
 *   SD − 2       7,60        −0,18         4,07          2,56  (marginalt)
 *   SD − 3       6,96        −1,81         5,70          1,63  (marginalt)
 *
 * ETT STIKK FOR MYE KOSTER 9,8 GANGER SÅ MYE SOM ETT FOR LITE. Mekanismen er
 * i reglene: et bud man ikke innfrir gir minuspoeng for hele kontrakten, mens
 * et bud man overgår bare lar noen stikk ligge igjen på bordet. En kvadratisk
 * eller absolutt straff på |feil| behandler de to retningene likt og er derfor
 * feil uansett hvor godt nettet lærer – den ber eksperten balansere en risiko
 * som ikke er balansert.
 *
 * FORMEN: konveks, stykkevis lineær, tilpasset punktene over.
 *   - overbud: 14,75 per stikk (ett målepunkt, lineær ekstrapolasjon)
 *   - underbud: 1,51 for det første stikket, deretter 2,10 per stikk
 * De 2,10 er de to marginale underbudskostnadene 2,56 og 1,63 slått sammen
 * til ett snitt. Rå gir de en IKKE-konveks kurve (marginalen synker fra 2,56
 * til 1,63), og en ikke-konveks kostnad gjør «velg billigste lovlige bud» til
 * et sprangvis valg der små estimatendringer kan hoppe over flere stikk.
 * Sammenslåingen er den konvekse innhyllingen av de målte marginalene, ikke
 * en glatting valgt for å se pen ut: den bevarer summen (1,51 + 2,56 + 1,63 =
 * 5,70 = 1,51 + 2,10 + 2,10) og endrer derfor bare fordelingen mellom −2 og
 * −3, ikke nivået.
 *
 * ENHETEN ER POENG. Angeren for budeksperten er dermed «forventet poengtap per
 * runde ved dette budet i stedet for SD-orakelets», ikke et abstrakt
 * stikkavvik. Det er også grunnen til at tallene i `mål()` ikke kan
 * sammenlignes med den første målingen i `analyse/moe2-forste-maaling.txt`,
 * som brukte |avvik| i stikk.
 */
export const OVERBUD_POENG = 14.75;
export const UNDERBUD_POENG_FØRSTE = 1.51;
export const UNDERBUD_POENG_VIDERE = 2.1;

/** Poengtapet ved å by `avvik` stikk fra SD-orakelet. Positivt = overbud. */
export function budKostnad(avvik: number): number {
  if (avvik >= 0) return OVERBUD_POENG * avvik;
  const under = -avvik;
  if (under <= 1) return UNDERBUD_POENG_FØRSTE * under;
  return UNDERBUD_POENG_FØRSTE + UNDERBUD_POENG_VIDERE * (under - 1);
}

/**
 * Vektene læringen skal bruke på hver side av fasiten, normalisert til snitt 1.
 *
 * Delta-regelen i `kalibrerUtgang` er gradienten til et KVADRATISK tap. Ganges
 * raten med disse blir den gradienten til et asymmetrisk kvadratisk tap
 * (en ekspektil), og fikspunktet flytter seg fra betinget forventning til
 * τ-ekspektilen med τ = 1,51/(1,51+14,75) = 0,093 – altså godt under midten,
 * som er nøyaktig det tallene sier at et bud skal ligge.
 *
 * Marginalkostnaden ved ±1 stikk brukes, ikke hele kurven: det er der valget
 * faktisk avgjøres, siden budene ligger ett stikk fra hverandre.
 */
const SUM_KOST = OVERBUD_POENG + UNDERBUD_POENG_FØRSTE;
export const LÆREVEKT_OVER = (2 * OVERBUD_POENG) / SUM_KOST;
export const LÆREVEKT_UNDER = (2 * UNDERBUD_POENG_FØRSTE) / SUM_KOST;

/**
 * Læringsvekten gitt feilen (fasit − nettets utgang), i tanh-rommet.
 *
 * `feil < 0` betyr at nettet ligger OVER fasiten – overbudssiden, den dyre.
 */
export function budLærevekt(feil: number): number {
  return feil < 0 ? LÆREVEKT_OVER : LÆREVEKT_UNDER;
}

/** Nettets tanh-utgang oversatt til forventet lagstikk. */
export function estimatFraUt(ut: readonly number[], antallStikk: number): number {
  return ((ut[UT_LAGSTIKK]! + 1) / 2) * antallStikk;
}

/**
 * Indeksen til den lovlige påstanden som er BILLIGST under `budKostnad` hvis
 * estimatet stemmer.
 *
 * Det er ikke det samme som den nærmeste: med 14,75 mot 1,51 lønner det seg å
 * runde oppover bare når estimatet ligger nærmere enn 0,093 stikk under budet
 * over. I praksis er regelen «rund ned», og det er en MÅLT regel, ikke en
 * forsiktighetsvane.
 */
export function billigsteBud(handlinger: readonly number[], estimat: number): number {
  let beste = 0;
  let besteKost = Infinity;
  for (let i = 0; i < handlinger.length; i++) {
    const k = budKostnad(handlinger[i]! - estimat);
    if (k < besteKost - 1e-12) {
      besteKost = k;
      beste = i;
    }
  }
  return beste;
}

export const budEkspert: Ekspert<Budhandling> = {
  navn: "bud",
  fase: "BUDRUNDE",
  rolle: null,
  sensorer: BUD_SENSORER,
  antallUt: 1,
  velg(ut, s) {
    // Ingen del av `s.verdi` leses her – det ville vært å se fasiten. Bare
    // `s.handlinger` og nettets eget estimat inngår, nøyaktig som når
    // eksperten sitter i en ekte budrunde og skal si et tall.
    return billigsteBud(s.handlinger, estimatFraUt(ut, Math.max(...s.handlinger)));
  },
};

export interface BudstillingOpts {
  /** Antall giver som spilles gjennom budrunden. */
  readonly giver: number;
  /** Første frø. Hver giv får frø + i. */
  readonly frø?: number;
  readonly målPoeng?: number;
}

/**
 * Bygger budstillinger fra ekte budrunder.
 *
 * Budrunden SPILLES av NevroHjerne, og hvert beslutningspunkt blir en
 * stilling. Alternativet – å la hvert sete melde først i en frisk budrunde –
 * ville gjort PASSET, BUD_HIST og BUD_HØYESTE identisk null i hver eneste
 * stilling, og da hadde de ikke vært sensorer, bare 12 innganger mutasjonen
 * kunne kaste bort koblinger på.
 *
 * Fasiten hentes fra SD-analysen av GIVA, som caches på (frø, rundeNr) – den
 * regnes altså én gang selv om giva gir opptil fire stillinger.
 */
export function lagBudstillinger(opts: BudstillingOpts): Råstilling<Budhandling>[] {
  const nevro = new NevroAgent();
  const målPoeng = opts.målPoeng ?? 100;
  const ut: Råstilling<Budhandling>[] = [];
  for (let i = 0; i < opts.giver; i++) {
    const start = opprettSpill({ målPoeng }, (opts.frø ?? 9_000_000) + i);
    const T = start.giving.antallStikk;
    const analyse = analyserGiv(start, nevro);
    let s: GameState = start;
    let vakt = 0;
    // `s.rundeNr === start.rundeNr`: passer alle, deler motoren nye kort og
    // blir stående i BUDRUNDE med en ANNEN giv. SD-analysen gjelder da ikke
    // lenger, og å fortsette ville paret en fasit med feil hånd.
    while (s.fase === "BUDRUNDE" && s.rundeNr === start.rundeNr && vakt++ < 24) {
      const lov = lovligeHandlinger(s);
      if (lov.fase !== "BUDRUNDE") break;
      const sete = lov.spiller;
      const fasit = sdBud(analyse, sete, T);
      const handlinger = lov.bud.map((b) => påstand(b, T));
      const nevrosBud = nevro.velgBud(s, sete, lov.bud);
      const nevroValg = handlinger.indexOf(påstand(nevrosBud, T));
      // Høyere er bedre: 0 er et perfekt bud, −14,75 er ett stikk for høyt.
      const verdi = handlinger.map((h) => -budKostnad(h - fasit));
      // TAKET ER SD-ORAKELET SELV, ikke NevroHjerne.
      //
      // MÅLT (analyse/moe2-forste-maaling.txt): nevro bommer 2,6090 stikk fra
      // SD der et uniformt lovlig bud bommer 2,2229. Taket lå altså UNDER
      // gulvet, og `framdrift()` – som deler på (gulv − tak) – ga −278 % for
      // et ferskt nett og −379 % for et lært, altså et tall som blir MER
      // negativt jo bedre eksperten er. Et tak som er dårligere enn tilfeldig
      // er ikke et tak; det er en tredje kandidat.
      //
      // SD duger derimot: fasiten er godkjent av porten (korrigert +0,925,
      // pålitelighet 0,947 på det smale utvalget) og gir +3,89 poeng/runde mot
      // nevros 0,00 i nøyaktig samme oppsett. Taket er dermed det BESTE
      // LOVLIGE budet under `budKostnad` – ofte selve SD-budet, men ikke når
      // budrunden alt har passert det. Anger mot taket er da null per
      // konstruksjon, og `framdrift` leses som «hvor langt fra tilfeldig mot
      // orakelet», i [0, 1]. NevroHjerne rapporteres fortsatt, som EGEN linje.
      let takValg = 0;
      for (let k = 1; k < verdi.length; k++) if (verdi[k]! > verdi[takValg]!) takValg = k;
      const inn = projiser(
        lagInn(spillerVisning(s, sete), "BUD", T, målPoeng),
        BUD_SENSORER,
      );
      ut.push({
        // Alle stillingene fra samme budrunde deler de fire hendene.
        gruppe: `bud:${start.frø}:${start.rundeNr}`,
        inn,
        handlinger,
        verdi,
        takValg,
        nevroValg: nevroValg >= 0 ? nevroValg : undefined,
        // Læremålet er fasiten selv, i tanh-rommet. Ett hode, ett mål, ingen
        // konkurrerende utganger å dytte ned – dette er den ene oppgaven der
        // kalibreringen ikke kan flate ut et delt hode.
        læremål: new Map([[UT_LAGSTIKK, Math.max(-1, Math.min(1, (2 * fasit) / T - 1))]]),
      });
      s = utfør(s, { type: "BUD", spiller: sete, bud: nevrosBud }).state;
    }
  }
  return ut;
}
