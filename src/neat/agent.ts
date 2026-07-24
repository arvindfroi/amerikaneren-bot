/**
 * NeatAgent: spiller en hel Amerikaner-kamp drevet av ETT NEAT-nettverk.
 *
 * Samme nett tar alle beslutningene, skilt av et beslutnings-flagg i
 * inngangene og egne utgangs-hoder:
 *
 * - BUDRUNDE: xT-hodet (forventede stikk for egen side) pluss en lært
 *   margin bestemmer tallbudet – man byr det man regner med å ta, siden
 *   poengene følger BUDET (2n), ikke stikkene. Egne hoder for
 *   Amerikaner/solo melder når nettet både «vil» og xT er høy nok.
 * - VRAK: korthodet skårer alle 16 kortene; de 4 laveste vrakes.
 * - VELG: trumfhodet velger farge, korthodet velger etterlyst kort.
 * - SPILL: korthodet skårer de lovlige kortene; høyest spilles.
 *
 * Agenten ser KUN sin egen spillerVisning – ingen skjult informasjon.
 * xT-estimatet ved siste egne bud bokføres per runde slik at treningen kan
 * regne ANGER (regret): hvor feil var estimatet, og hva kostet feilbudet?
 */

import { FARGER, type Farge, type Kort } from "../kort.ts";
import { AMERIKANER, PASS, SOLO, type Bud } from "../regler.ts";
import {
  type GameState,
  type Handling,
  lovligeHandlinger,
  spillerVisning,
} from "../motor.ts";
import type { Genom } from "./genom.ts";
import { Nettverk } from "./nett.ts";
import {
  type Beslutning,
  kortIndeks,
  lagInn,
  UT_AMERIKANER,
  UT_KORT,
  UT_MAKKER,
  UT_MARGIN,
  UT_SOLO,
  UT_TRUMF,
  UT_XT,
  UT_XT_HØY,
  UT_XT_LAV,
} from "./trekk.ts";

/** Terskler for de spesielle meldingene (utgangene er tanh, dvs. (-1,1)). */
const AMERIKANER_TERSKEL = 0.6;
const SOLO_TERSKEL = 0.8;

export interface BudEstimat {
  /** Nettets xT da spilleren sist bød i runden. */
  readonly xt: number;
  /** Budet som ble lagt (tall, eller antallStikk for amerikaner/solo). */
  readonly bud: number;
  /** Inngangsvektoren ved budet (for regret-læring når fasit foreligger). */
  readonly inn: readonly number[];
  readonly antallStikk: number;
}

/** Standard læringsrate for regret-kalibreringen av xT-hodet. */
export const STD_LÆRINGSRATE = 0.05;

export class NeatAgent {
  readonly genom: Genom;
  private readonly nett: Nettverk;
  private readonly læringsrate: number;
  /** xT-estimat per rundeNr for regret-beregning (nullstilles per kamp). */
  private readonly estimater = new Map<number, BudEstimat>();

  /**
   * Valgfri forstyrrelse av inngangsvektoren FØR nettet aktiveres. Brukes
   * av blindsone-analysen (examples/d2-blindsoner.ts) til permutasjons-
   * ablasjon: en sensorgruppe får verdier fra en tilfeldig annen stilling,
   * slik at informasjonen ødelegges mens fordelingen beholdes. Er den ikke
   * satt, koster den ingenting.
   */
  private readonly forstyrr: ((inn: number[], beslutning: Beslutning) => number[]) | null;

  constructor(
    genom: Genom,
    opts: { læringsrate?: number; forstyrr?: (inn: number[], beslutning: Beslutning) => number[] } = {},
  ) {
    this.genom = genom;
    this.nett = new Nettverk(genom);
    this.læringsrate = opts.læringsrate ?? STD_LÆRINGSRATE;
    this.forstyrr = opts.forstyrr ?? null;
  }

  /**
   * REGRET-LÆRING: kalles når kontrakten agenten bød på er avgjort.
   * RETNINGSSTYRT – angeren peker ut hvilken vei vektene skal:
   *  - xT-hodet kalibreres mot de FAKTISKE lagstikkene (delta-regel på
   *    aktiveringene fra budøyeblikket).
   *  - margin-hodet (budaggressiviteten) dyttes i budfeilens retning:
   *    underbud (stikk > bud) → høyere margin, overbud → lavere.
   * Justerte vekter skrives rett i genomet (lamarckisk): arv bevarer og
   * blander, men det er læringen som gjør genomene BEDRE – og avkommet
   * arver forbedringen. Utfyller fitness-fradraget: der lukes dårlige
   * budgivere bort, her blir de gjenværende faktisk bedre.
   */
  lærAvKontrakt(rundeNr: number, lagStikk: number, makkerStikk = 0): void {
    if (this.læringsrate <= 0) return;
    const est = this.estimater.get(rundeNr);
    if (est === undefined) return;
    // Gjenskap nettets tilstand fra budøyeblikket, kalibrer mot fasit.
    this.nett.aktiver(est.inn);
    const y = (2 * lagStikk) / est.antallStikk - 1; // stikk → tanh-rom
    this.nett.kalibrerUtgang(UT_XT, y, this.læringsrate);
    // Kvantilene lærer med asymmetrisk rate (pinball-prinsippet): 20 %-
    // kvantilen dras hardt ned når fasit er under den, forsiktig opp ellers
    // – og speilvendt for 80 %. Slik lærer nettet FORDELINGEN av lagstikk,
    // ikke bare snittet (talong + ukjent makker gir ekte spredning).
    const q20 = this.nett.lesUtgang(UT_XT_LAV);
    this.nett.kalibrerUtgang(UT_XT_LAV, y, this.læringsrate * (y < q20 ? 0.8 : 0.2));
    const q80 = this.nett.lesUtgang(UT_XT_HØY);
    this.nett.kalibrerUtgang(UT_XT_HØY, y, this.læringsrate * (y > q80 ? 0.8 : 0.2));
    // Makker-hodet lærer makkerens faktiske bidrag (egen fasit).
    this.nett.kalibrerUtgang(UT_MAKKER, (2 * makkerStikk) / est.antallStikk - 1, this.læringsrate);
    // Margin = EV-terskelskyver → dyttes i budfeilens retning.
    const m = this.nett.lesUtgang(UT_MARGIN);
    const målM = Math.max(-1, Math.min(1, m + (lagStikk - est.bud) / 2));
    this.nett.kalibrerUtgang(UT_MARGIN, målM, this.læringsrate);
  }

  /** Nullstiller kamp-tilstand (regret-bokføring). */
  nyKamp(): void {
    this.estimater.clear();
  }

  /** xT-estimatet spilleren la til grunn da den bød i runde `rundeNr`. */
  estimatFor(rundeNr: number): BudEstimat | undefined {
    return this.estimater.get(rundeNr);
  }

  /** Velger handling for spilleren som er i tur (eller budvinner i VRAK/VELG). */
  velgHandling(state: GameState): Handling {
    const lov = lovligeHandlinger(state);
    switch (lov.fase) {
      case "BUDRUNDE":
        return this.velgBud(state, lov.spiller, lov.bud);
      case "VRAK":
        return this.velgVrak(state, lov.spiller, lov.antall);
      case "VELG":
        return this.velgTrumf(state, lov.spiller, lov.måEtterlyse);
      case "SPILL":
        return this.velgKort(state, lov.spiller, lov.kort);
      case "RUNDE_SLUTT":
        return { type: "NESTE" };
      case "FERDIG":
        throw new Error("Kampen er ferdig");
    }
  }

  private evaluer(state: GameState, spiller: number, beslutning: Beslutning): number[] {
    const visning = spillerVisning(state, spiller);
    const rå = lagInn(visning, beslutning, state.giving.antallStikk, state.regler.målPoeng);
    return this.nett.aktiver(this.forstyrr !== null ? this.forstyrr(rå, beslutning) : rå);
  }

  private velgBud(state: GameState, spiller: number, lovlige: Bud[]): Handling {
    const visning = spillerVisning(state, spiller);
    const råInn = lagInn(visning, "BUD", state.giving.antallStikk, state.regler.målPoeng);
    const inn = this.forstyrr !== null ? this.forstyrr(råInn, "BUD") : råInn;
    const ut = this.nett.aktiver(inn);
    const T = state.giving.antallStikk;
    const mål = state.regler.målPoeng;

    // Nettets FORDELING av lagstikk: 20 %-kvantil, median, 80 %-kvantil
    // (sortert – kvantilene kan krysse tidlig i treningen). Hånden alene
    // avgjør ikke stikkene (talong + makker), så budet velges EV-
    // maksimerende over fordelingen, ikke fra ett punktestimat.
    const tilStikk = (v: number): number => ((v + 1) / 2) * T;
    const [lav, med, høy] = [
      tilStikk(ut[UT_XT_LAV]!),
      tilStikk(ut[UT_XT]!),
      tilStikk(ut[UT_XT_HØY]!),
    ].sort((a, b) => a - b) as [number, number, number];
    const margin = ut[UT_MARGIN]!; // lært aggressivitet: skyver EV-terskelen

    // P(lagstikk ≥ n): stykkevis lineær gjennom (lav, 0,8), (med, 0,5), (høy, 0,2).
    const pMinst = (n: number): number => {
      let p: number;
      if (n <= lav) p = 0.8 + (lav - n) * 0.05;
      else if (n <= med) p = med === lav ? 0.65 : 0.8 - (0.3 * (n - lav)) / (med - lav);
      else if (n <= høy) p = høy === med ? 0.35 : 0.5 - (0.3 * (n - med)) / (høy - med);
      else p = 0.2 - (n - høy) * 0.1;
      return Math.max(0, Math.min(1, p));
    };

    const bud = (b: Bud): Handling => {
      if (b !== PASS) {
        const tall = typeof b === "number" ? b : T;
        this.estimater.set(state.rundeNr, { xt: med, bud: tall, inn, antallStikk: T });
      }
      return { type: "BUD", spiller, bud: b };
    };

    // EV per melding (budvinner-satser); margin·2 poeng i lært dristighet.
    let besteBud: Bud = PASS;
    let besteEV = 0;
    for (const b of lovlige) {
      if (typeof b !== "number") continue;
      const ev = 2 * b * (2 * pMinst(b) - 1) + margin * 2;
      if (ev > besteEV) {
        besteEV = ev;
        besteBud = b;
      }
    }
    const pAlle = pMinst(T);
    if (lovlige.includes(AMERIKANER) && ut[UT_AMERIKANER]! > AMERIKANER_TERSKEL && høy >= T - 1) {
      const ev = (mål / 2) * (2 * pAlle - 1);
      if (ev > besteEV) {
        besteEV = ev;
        besteBud = AMERIKANER;
      }
    }
    if (lovlige.includes(SOLO) && ut[UT_SOLO]! > SOLO_TERSKEL && lav >= T - 0.5) {
      const ev = mål * (2 * pAlle - 1);
      if (ev > besteEV) {
        besteEV = ev;
        besteBud = SOLO;
      }
    }
    return bud(besteBud);
  }

  private velgVrak(state: GameState, spiller: number, antall: number): Handling {
    const ut = this.evaluer(state, spiller, "VRAK");
    const hånd = state.hender[spiller]!;
    const sortert = hånd
      .slice()
      .sort((a, b) => ut[UT_KORT + kortIndeks(a)]! - ut[UT_KORT + kortIndeks(b)]!);
    return { type: "VRAK", spiller, kort: sortert.slice(0, antall) };
  }

  private velgTrumf(state: GameState, spiller: number, måEtterlyse: boolean): Handling {
    const ut = this.evaluer(state, spiller, "VELG");
    const hånd = state.hender[spiller]!;
    const vrak = state.vrak;

    // Kandidater til etterlysning per farge: kort i fargen som verken er på
    // egen hånd eller i eget vrak (samme krav som motoren håndhever).
    const kandidaterFor = (farge: Farge): Kort[] => {
      const utelukket = new Set<number>();
      for (const k of hånd) if (k.farge === farge) utelukket.add(k.verdi);
      for (const k of vrak) if (k.farge === farge) utelukket.add(k.verdi);
      const res: Kort[] = [];
      for (let v = 14; v >= 2; v--) {
        if (!utelukket.has(v)) res.push({ farge, verdi: v as Kort["verdi"] });
      }
      return res;
    };

    // Velg farge etter trumfhodet, men en farge uten lovlig etterlysning kan
    // ikke velges når etterlysning er påkrevd (ellers låser motoren seg).
    const rangerte = FARGER.map((farge, i) => ({ farge, score: ut[UT_TRUMF + i]! }))
      .sort((a, b) => b.score - a.score);
    let trumf = rangerte[0]!.farge;
    if (måEtterlyse) {
      for (const r of rangerte) {
        if (kandidaterFor(r.farge).length > 0) {
          trumf = r.farge;
          break;
        }
      }
    }

    const kandidater = kandidaterFor(trumf);
    let etterlyst: Kort | null = null;
    if (kandidater.length > 0) {
      let best = kandidater[0]!;
      let bestScore = -Infinity;
      for (const k of kandidater) {
        const s = ut[UT_KORT + kortIndeks(k)]!;
        if (s > bestScore) {
          bestScore = s;
          best = k;
        }
      }
      // Ved solo er etterlysning valgfri – bare gjør det når nettet ser verdi i det.
      etterlyst = måEtterlyse || bestScore > 0 ? best : null;
    }
    return { type: "VELG", spiller, trumf, etterlyst };
  }

  /** Markerer at agenten kan overstyres av sluttsøk i turneringen (D1). */
  readonly søkbar = true;

  /**
   * Spillfasit (D1): smal, lamarckisk kalibrering av KORTHODET mot
   * solverens valg i samme stilling – kun det ene kortets utgang dyttes
   * opp (delta-regel), resten av nettet røres ikke. Lærdommen fra det
   * feilslåtte DAgger-forsøket: bred overskriving mot en annen spillers
   * valg skrambler evolverte hoder; en smal dytt med lav rate gjør ikke det.
   */
  lærSpill(state: GameState, spiller: number, solverKort: Kort, rate: number): void {
    if (rate <= 0) return;
    this.evaluer(state, spiller, "SPILL");
    // Dybde 2: korreksjonen forplantes også til de skjulte nodene bak
    // kortvalget – gradienten retter forståelsen, ikke bare valget.
    this.nett.kalibrerUtgang(UT_KORT + kortIndeks(solverKort), 0.9, rate, 2);
  }

  /**
   * Budfasit: kalibrerer xT-hodene mot lagstikkene fra en UTSPILT rollout
   * av samme giving med agentens EGEN spillestyrke på alle seter. Fasiten
   * er dermed «hva jeg faktisk klarer å spille hjem», ikke hva en perfekt
   * spiller kunne tatt – budene vokser i takt med spilleevnen. Gir også
   * signal på hender der agenten ellers ville passet (dekker skjevheten i
   * lærAvKontrakt, som bare fyrer når agenten VANT budrunden).
   */
  lærBudFasit(state: GameState, spiller: number, lagStikk: number, makkerStikk: number, rate: number): void {
    if (rate <= 0) return;
    this.evaluer(state, spiller, "BUD");
    const T = state.giving.antallStikk;
    const y = (2 * lagStikk) / T - 1;
    // Dybde 2: retter forståelsen bak estimatet, ikke bare utgangen.
    this.nett.kalibrerUtgang(UT_XT, y, rate, 2);
    const q20 = this.nett.lesUtgang(UT_XT_LAV);
    this.nett.kalibrerUtgang(UT_XT_LAV, y, rate * (y < q20 ? 0.8 : 0.2));
    const q80 = this.nett.lesUtgang(UT_XT_HØY);
    this.nett.kalibrerUtgang(UT_XT_HØY, y, rate * (y > q80 ? 0.8 : 0.2));
    this.nett.kalibrerUtgang(UT_MAKKER, (2 * makkerStikk) / T - 1, rate);
  }

  /**
   * Rangerer lovlige kort etter korthodets score (beste først). Brukes av
   * hybrid-/søkeagenter som kandidatliste: nettet foreslår, søket avgjør.
   */
  rangerKort(state: GameState, spiller: number, lovlige: readonly Kort[]): Kort[] {
    const ut = this.evaluer(state, spiller, "SPILL");
    return [...lovlige].sort(
      (a, b) => ut[UT_KORT + kortIndeks(b)]! - ut[UT_KORT + kortIndeks(a)]!,
    );
  }

  private velgKort(state: GameState, spiller: number, lovlige: Kort[]): Handling {
    if (lovlige.length === 1) {
      return { type: "SPILL", spiller, kort: lovlige[0]! };
    }
    const ut = this.evaluer(state, spiller, "SPILL");
    let best = lovlige[0]!;
    let bestScore = -Infinity;
    for (const k of lovlige) {
      const s = ut[UT_KORT + kortIndeks(k)]!;
      if (s > bestScore) {
        bestScore = s;
        best = k;
      }
    }
    return { type: "SPILL", spiller, kort: best };
  }
}
