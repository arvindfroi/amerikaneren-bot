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
import { estimerStikk } from "../nevro/agent.ts";
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
  /**
   * TRUMFFASIT: kalibrerer trumfhodet mot håndvurderingens rangering av de
   * fire fargene. Rettet direkte mot den MÅLTE blindsonen – fasedelingen
   * viste at trumfvalget er 32 av 42 poeng i gapet mot NevroHjerne, og
   * nevros trumfvalg ER denne formelen (estimerStikk). NEAT bruker hundrevis
   * av generasjoner på å oppdage de nye sensorene selv; dette viser den
   * fasiten direkte.
   *
   * Rører KUN trumfhodet (4 utganger). Det er ikke tilfeldig: imitasjon inn
   * i korthodet er målt skadelig (delta-regelen deler nett med bud-/
   * trumfhodene), men trumfhodet er en egen, smal oppgave med egen fasit –
   * samme trygge form som lærBudFasit for xT-hodet.
   *
   * Målet er min–max-normalisert rangering, ikke bare argmax: nettet lærer
   * at nest beste farge også slår den verste, ikke bare hvem som vant.
   */
  lærTrumf(state: GameState, spiller: number, rate: number): void {
    if (rate <= 0) return;
    const hånd = state.hender[spiller] ?? [];
    if (hånd.length === 0) return;
    const est = FARGER.map((farge) => estimerStikk(hånd, farge));
    const min = Math.min(...est);
    const spenn = Math.max(...est) - min;
    if (spenn < 1e-6) return; // alle farger like – ingenting å lære
    this.evaluer(state, spiller, "VELG");
    for (let f = 0; f < 4; f++) {
      const y = -0.8 + 1.6 * ((est[f]! - min) / spenn); // beste +0,8, verste −0,8
      this.nett.kalibrerUtgang(UT_TRUMF + f, y, rate);
    }
  }

  /**
   * ETTERLYSFASIT: kalibrerer korthodet mot det HØYESTE lovlige
   * etterlysningskortet i den trumffargen agenten faktisk valgte.
   *
   * Målt blindsone (spillprofil): D5 ber om valør 10,0 i snitt der
   * NevroHjerne ber om 13,2, og treffer høyeste lovlige i bare 59 % av
   * rundene. Etterlysningen henter makkerens beste kort inn i laget – å be
   * om et middels kort gir bort et stikk før spillet har begynt.
   *
   * Dette er en LÆRT fasit, ikke en regel: nettet dyttes mot det høyeste
   * kortet og fri til å avvike der det lønner seg (ved solo skal man f.eks.
   * be om noe man selv kan stikke over).
   */
  lærEtterlys(state: GameState, spiller: number, kandidater: readonly Kort[], rate: number): void {
    if (rate <= 0 || kandidater.length === 0) return;
    this.evaluer(state, spiller, "VELG");
    let høyest = kandidater[0]!;
    for (const k of kandidater) if (k.verdi > høyest.verdi) høyest = k;
    for (const k of kandidater) {
      // Rangeringsmål: høyeste kort dras opp, resten ned i takt med hvor
      // langt under toppen de ligger.
      const y = k.verdi === høyest.verdi ? 0.8 : -0.2 - 0.5 * ((høyest.verdi - k.verdi) / 12);
      this.nett.kalibrerUtgang(UT_KORT + kortIndeks(k), y, rate);
    }
  }

  /**
   * VRAKFASIT: kalibrerer korthodet mot å BEHOLDE kort i den fargen
   * håndvurderingen peker ut som beste trumf.
   *
   * Målt blindsone: D5 vraker 22 % av kortene sine i fargen som blir trumf –
   * NevroHjerne gjør det aldri (0 %). Vraking skjer FØR trumfvalget, så
   * nettet må forutse hva det kommer til å velge. Det gjør det ikke, og
   * ender med 3,21 trumf mot nevros 5,75.
   *
   * Fasiten er ikke «vrak nøyaktig disse fire», men en retning: kort i den
   * antatt beste trumffargen (og høye kort generelt) skal opp, lave kort i
   * sidefarger ned. Nettet lærer prioriteringen, ikke et fasitsvar.
   */
  lærVrak(state: GameState, spiller: number, rate: number): void {
    if (rate <= 0) return;
    const hånd = state.hender[spiller] ?? [];
    if (hånd.length === 0) return;
    let besteFarge: Farge = FARGER[0]!;
    let beste = -Infinity;
    for (const f of FARGER) {
      const e = estimerStikk(hånd, f);
      if (e > beste) {
        beste = e;
        besteFarge = f;
      }
    }
    this.evaluer(state, spiller, "VRAK");
    for (const k of hånd) {
      // Behold: trumffargen, og ess/konge uansett farge. Vrak: lavt i sidefarge.
      const iTrumf = k.farge === besteFarge;
      const høyt = k.verdi >= 13;
      const y = iTrumf ? 0.7 : høyt ? 0.5 : -0.6 + 0.5 * ((k.verdi - 2) / 12);
      this.nett.kalibrerUtgang(UT_KORT + kortIndeks(k), y, rate);
    }
  }

  /**
   * STIKKFASIT: taktisk kalibrering av korthodet i stikkspillet, delt på
   * rolle. Rettet mot fire MÅLTE hull (lagprofil, D5 mot NevroHjerne):
   *
   *   avkast: la lavest når tapt   31 %  mot  55 %
   *   trumfet inn når mulig        19 %  mot  68 %
   *   reddet stikk makker tapte    53 %  mot  78 %
   *   trumf ut med kontroll        19 %  mot  51 %
   *
   * Dette er ikke en regel som overstyrer valget – agenten spiller fortsatt
   * sitt eget kort (on-policy). Det er en RETNING: kortene som er taktisk
   * riktige i stillingen dras opp, de gale ned, og nettet lærer mønsteret
   * selv. Samme form som trumffasit, som ga +20,4 ± 4,4.
   *
   * Målene er bevisst myke (±0,6 heller enn ±1) fordi taktikken har unntak:
   * å holde igjen et stikk kan være riktig, og å trumfe inn er ikke alltid
   * det. Nettet skal kunne avvike der det lønner seg.
   */
  lærStikk(state: GameState, spiller: number, lovlige: readonly Kort[], rate: number): void {
    if (rate <= 0 || lovlige.length < 2 || state.trumf === null) return;
    const påBudlag = spiller === state.budvinner || spiller === state.makker;
    const kjentLag = state.makkerAvslørt || state.makker === spiller;
    const trumf = state.trumf;

    // Hvem vinner stikket nå?
    const slår = (ny: Kort, best: Kort, led: Farge): boolean => {
      const nT = ny.farge === trumf, bT = best.farge === trumf;
      if (nT !== bT) return nT;
      if (nT) return ny.verdi > best.verdi;
      if (ny.farge !== led) return false;
      if (best.farge !== led) return true;
      return ny.verdi > best.verdi;
    };
    const led = state.bord[0]?.kort.farge ?? null;
    let leder: { spiller: number; kort: Kort } | null = null;
    if (led !== null) {
      leder = state.bord[0]!;
      for (const kp of state.bord) if (slår(kp.kort, leder.kort, led)) leder = kp;
    }

    const mål = new Map<number, number>();
    const sett = (k: Kort, y: number): void => {
      mål.set(kortIndeks(k), y);
    };

    if (leder === null) {
      // UTSPILL. På budlaget med trumfkontroll (≥2 trumf) skal trumfen ut –
      // det trekker motstandernes trumf og sikrer kontrakten.
      const egneTrumf = lovlige.filter((k) => k.farge === trumf);
      if (påBudlag && egneTrumf.length >= 2) {
        for (const k of lovlige) sett(k, k.farge === trumf ? 0.6 : -0.3);
      } else return;
    } else {
      const vinnende = lovlige.filter((k) => slår(k, leder!.kort, led!));
      const makkerLeder =
        kjentLag &&
        ((spiller === state.budvinner && leder.spiller === state.makker) ||
          (spiller === state.makker && leder.spiller === state.budvinner));

      if (makkerLeder) {
        // Makkeren vinner allerede: spar kortene, legg lavest.
        const lavest = lovlige.reduce((a, b) => (a.verdi <= b.verdi ? a : b));
        for (const k of lovlige) sett(k, k.verdi === lavest.verdi ? 0.5 : -0.3);
      } else if (vinnende.length > 0) {
        // Motstander leder og vi KAN ta stikket: ta det – med det billigste
        // kortet som holder, ikke det høyeste (spar toppkortene).
        const billigst = vinnende.reduce((a, b) => {
          const v = (k: Kort): number => (k.farge === trumf ? 100 : 0) + k.verdi;
          return v(a) <= v(b) ? a : b;
        });
        for (const k of lovlige) {
          sett(k, kortIndeks(k) === kortIndeks(billigst) ? 0.6 : slår(k, leder.kort, led!) ? 0.0 : -0.4);
        }
      } else {
        // Stikket er tapt: kast det laveste, og aldri trumf (den er verdt mer senere).
        const kastbare = lovlige.filter((k) => k.farge !== trumf);
        const pool = kastbare.length > 0 ? kastbare : lovlige;
        const lavest = pool.reduce((a, b) => (a.verdi <= b.verdi ? a : b));
        for (const k of lovlige) {
          sett(k, kortIndeks(k) === kortIndeks(lavest) ? 0.6 : k.farge === trumf ? -0.5 : -0.2);
        }
      }
    }
    if (mål.size === 0) return;
    this.evaluer(state, spiller, "SPILL");
    for (const [idx, y] of mål) this.nett.kalibrerUtgang(UT_KORT + idx, y, rate);
  }

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
