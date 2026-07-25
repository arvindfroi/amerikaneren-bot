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
 * (−|påstand − SD|) er definert for hver av dem. Uten den felles aksen kunne
 * gulvet ikke regnes eksakt, og et gulv som må samples er ikke et gulv.
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

export const budEkspert: Ekspert<Budhandling> = {
  navn: "bud",
  fase: "BUDRUNDE",
  rolle: null,
  sensorer: BUD_SENSORER,
  antallUt: 1,
  velg(ut, s) {
    // Nettet gir et ESTIMAT; budet er den lovlige påstanden som ligger
    // nærmest. Ved likhet velges den laveste – å runde oppover er å melde
    // seg selv opp i en kontrakt estimatet ikke bærer.
    const antallStikk = Math.max(...s.handlinger);
    const xt = ((ut[UT_LAGSTIKK]! + 1) / 2) * antallStikk;
    let beste = 0;
    let besteAvstand = Infinity;
    for (let i = 0; i < s.handlinger.length; i++) {
      const d = Math.abs(s.handlinger[i]! - xt);
      if (d < besteAvstand - 1e-12) {
        besteAvstand = d;
        beste = i;
      }
    }
    return beste;
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
      const takPåstand = påstand(nevrosBud, T);
      const takValg = handlinger.indexOf(takPåstand);
      const inn = projiser(
        lagInn(spillerVisning(s, sete), "BUD", T, målPoeng),
        BUD_SENSORER,
      );
      ut.push({
        // Alle stillingene fra samme budrunde deler de fire hendene.
        gruppe: `bud:${start.frø}:${start.rundeNr}`,
        inn,
        handlinger,
        // Høyere er bedre: 0 er et perfekt bud, −3 er tre stikk feil.
        verdi: handlinger.map((h) => -Math.abs(h - fasit)),
        takValg: takValg >= 0 ? takValg : 0,
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
