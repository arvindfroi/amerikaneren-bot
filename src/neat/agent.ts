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
  UT_MARGIN,
  UT_SOLO,
  UT_TRUMF,
  UT_XT,
} from "./trekk.ts";

/** Terskler for de spesielle meldingene (utgangene er tanh, dvs. (-1,1)). */
const AMERIKANER_TERSKEL = 0.6;
const SOLO_TERSKEL = 0.8;

export interface BudEstimat {
  /** Nettets xT da spilleren sist bød i runden. */
  readonly xt: number;
  /** Budet som ble lagt (tall, eller antallStikk for amerikaner/solo). */
  readonly bud: number;
}

export class NeatAgent {
  readonly genom: Genom;
  private readonly nett: Nettverk;
  /** xT-estimat per rundeNr for regret-beregning (nullstilles per kamp). */
  private readonly estimater = new Map<number, BudEstimat>();

  constructor(genom: Genom) {
    this.genom = genom;
    this.nett = new Nettverk(genom);
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
    const inn = lagInn(visning, beslutning, state.giving.antallStikk, state.regler.målPoeng);
    return this.nett.aktiver(inn);
  }

  private velgBud(state: GameState, spiller: number, lovlige: Bud[]): Handling {
    const ut = this.evaluer(state, spiller, "BUD");
    const antallStikk = state.giving.antallStikk;

    // xT: tanh (-1,1) → (0, antallStikk). Margin: lært justering ±2 stikk.
    const xt = ((ut[UT_XT]! + 1) / 2) * antallStikk;
    const margin = ut[UT_MARGIN]! * 2;
    const mål = xt + margin;

    const bud = (b: Bud): Handling => {
      if (b !== PASS) {
        const tall = typeof b === "number" ? b : antallStikk;
        this.estimater.set(state.rundeNr, { xt, bud: tall });
      }
      return { type: "BUD", spiller, bud: b };
    };

    // Solo/Amerikaner: nettet må både ønske det og tro på (nesten) alle stikk.
    if (lovlige.includes(SOLO) && ut[UT_SOLO]! > SOLO_TERSKEL && mål >= antallStikk - 0.5) {
      return bud(SOLO);
    }
    if (
      lovlige.includes(AMERIKANER) &&
      ut[UT_AMERIKANER]! > AMERIKANER_TERSKEL &&
      mål >= antallStikk - 1.5
    ) {
      return bud(AMERIKANER);
    }

    // Tallbud: by det man regner med å ta (poengene følger budet), men aldri
    // over målestimatet og aldri lavere enn minste lovlige forhøyelse.
    const tallbud = lovlige.filter((b): b is number => typeof b === "number");
    if (tallbud.length > 0) {
      const ønsket = Math.min(antallStikk, Math.floor(mål));
      const kandidater = tallbud.filter((b) => b <= ønsket);
      if (kandidater.length > 0) {
        return bud(Math.max(...kandidater));
      }
    }
    return bud(PASS);
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
