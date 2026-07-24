/**
 * Evolusjonsløkka: NEAT-populasjon → turnering → fitness → nytt kull.
 *
 * Hver generasjon:
 *  1. Hele populasjonen spiller cupturneringen (grupper på 4, duplikat-
 *     kamper med seterotasjon – flakskontrollert).
 *  2. Fitness settes fra cupdybden. FØRSTE turnering: absolutt dybde.
 *     SENERE: dybde relativt til den regjerende mesteren, som alltid står
 *     i populasjonen som en uendret kopi (plass 0) og må forsvare tittelen
 *     i samme cup. Duplikatpoeng skiller på lik dybde, og snittanger per
 *     kontrakt trekkes fra (læring på regret).
 *  3. Artsdeling (speciation) på kompatibilitetsavstand med eksplisitt
 *     fitness-deling, slik nye topologier får tid til å modnes.
 *  4. De dårlige spillerne lukes: bare toppandelen i hver art får formere
 *     seg, stagnerte arter dør, og avkom lages med NEAT-kryssing +
 *     mutasjon (nye vekter, koblinger og noder).
 */

import { lagRng } from "../kort.ts";
import {
  avstand,
  Innovasjonsbok,
  klonGenom,
  kryss,
  muter,
  nyttGenom,
  STANDARD_RATER,
  type Genom,
  type KildeBias,
  type MutasjonsRater,
} from "./genom.ts";
import { NeatAgent, STD_LÆRINGSRATE } from "./agent.ts";
import { utId } from "./genom.ts";
import { GruppePool } from "./pool.ts";
import { erPimc, PimcPortvakt, STD_PORTVAKT, type Deltaker } from "./portvakt.ts";
import {
  ANTALL_INN,
  ANTALL_UT,
  SENSORGRUPPER,
  UT_KORT,
  UT_MAKKER,
  UT_MARGIN,
  UT_XT,
  UT_XT_HØY,
  UT_XT_LAV,
} from "./trekk.ts";
import {
  beregnFitness,
  kjørTurnering,
  kjørTurneringMed,
  type KampOpts,
  type TurneringsResultat,
} from "./turnering.ts";

export interface EvolusjonsOpts {
  /** Populasjonsstørrelse – minst 8 og delelig med 4. Standard 32. */
  readonly populasjon?: number;
  /** Frø for hele kjøringen (turneringer, mutasjoner). */
  readonly frø?: number;
  /** Startkoblinger per utgang i generasjon 0. */
  readonly koblingerPerUt?: number;
  readonly rater?: MutasjonsRater;
  /** Vekt på anger-fradraget i fitness. */
  readonly lambdaRegret?: number;
  readonly kampOpts?: KampOpts;
  /** Ønsket antall arter (terskelen justeres dit). Standard pop/8. */
  readonly målArter?: number;
  /** Andel av hver art som får bli foreldre. Standard 0,4. */
  readonly andelForeldre?: number;
  /** Generasjoner uten framgang før en art dør. Standard 12. */
  readonly stagnasjonsGrense?: number;
  /** Andel avkom som lages med kryssing (resten klon + mutasjon). */
  readonly krysningsAndel?: number;
  /**
   * Gjenoppta trening: populasjonen startes som dette genomet pluss
   * mutanter av det (i stedet for ferske minimalgenomer).
   */
  readonly startGenom?: Genom;
  /**
   * Hall of fame: så mange TIDLIGERE mestere stiller i cupen som ekstra
   * deltakere (uten å formere seg). Motvirker selvspill-sykling – å slå
   * dagens felt holder ikke om man har «glemt» hvordan man slår gårsdagens
   * mestere. 0 (standard) = av. Generalisering av regelen om at forrige
   * mester stiller igjen. Deltar først når minst 4 er samlet (grupper à 4).
   */
  readonly hallOfFame?: number;
  /**
   * Start populasjonen fra FLERE genomer (f.eks. beste fra to treningslinjer).
   * Genomenes innovasjonsnumre re-nummereres kanonisk etter struktur
   * (fra→til), så genomer fra ulike historikker kan linjeres opp, krysses
   * og artsdeles korrekt. NB: genomer fra ULIKE familier må ha adskilte
   * skjulte node-id-rom først (se examples/neat-kombiner.ts). Har forrang
   * foran `startGenom`.
   */
  readonly startPopulasjon?: Genom[];
  /** Gjenopprett hall of fame fra en tidligere økt (kanoniseres). */
  readonly startHall?: Genom[];
  /** Gjenopprett artsterskelen (ellers starter den på 3,0 og må jakte). */
  readonly startTerskel?: number;
  /**
   * Antall arbeidstråder for gruppekampene. 1 (standard) = alt i
   * hovedtråden. Flere tråder spiller rundens grupper parallelt – bit-
   * identisk resultat, men langt raskere på flerkjernede maskiner.
   */
  readonly tråder?: number;
  /**
   * PIMC-portvakter (C6): så mange billige PIMC-solvere stiller i cupen
   * som ekstra, ikke-reproduserende deltakere (rundes ned til et multiplum
   * av 4). Seleksjonstrykket peker da direkte mot «slå solveren» – ikke
   * bare søsknene – og selvspill-sykling får enda mindre rom. 0 = av.
   */
  readonly pimcPortvakter?: number;
  /** Innstillinger for portvaktene (verdener/terskel/maksEval). */
  readonly pimcOpts?: { verdener?: number; terskel?: number; maksEval?: number };
  /**
   * Stagnasjonsspark: forsvarer mesteren tittelen så mange generasjoner PÅ
   * RAD, dobles strukturmutasjonene (nyKobling/nyNode) og vektstyrken for
   * avkommet til tittelen ryker – stillstand besvares med utforskning.
   * 0 = av. Standard 15.
   */
  readonly sparkEtter?: number;
}

/** Genom-trekk + resultat for ett individ (til forklaringsanalysen). */
export interface IndividData {
  readonly noder: number;
  readonly koblinger: number;
  readonly skjulte: number;
  readonly aktivAndel: number;
  readonly snittAbsVekt: number;
  readonly kortInn: number;
  readonly xtInn: number;
  readonly fraHistorikk: number;
  readonly fraRenons: number;
  readonly fraBossTelling: number;
  readonly fraTaktikk: number;
  readonly fraLagspill: number;
  readonly fraBudhist: number;
  readonly fraLagstikk: number;
  readonly fitness: number;
  readonly dybde: number;
  readonly regret: number;
}

export interface GenerasjonsStat {
  readonly generasjon: number;
  readonly antallArter: number;
  readonly besteFitness: number;
  readonly snittFitness: number;
  /** Cupdybden til generasjonens turneringsvinner. */
  readonly mesterDybde: number;
  /** Forsvarte den forrige mesteren tittelen? */
  readonly mesterForsvarte: boolean;
  /** Snittanger per kontrakt over hele feltet. */
  readonly snittRegret: number;
  readonly mesterNoder: number;
  readonly mesterKoblinger: number;
  readonly turneringsRunder: number;
  /** Trekk + resultat per populasjonsmedlem (for forklaringsanalysen). */
  readonly individer: IndividData[];
}

interface Art {
  representant: Genom;
  medlemmer: number[];
  besteFitness: number;
  stagnasjon: number;
}

/** Teller genom-trekk som forklaringsanalysen regresserer mot fitness. */
function lagIndividData(g: Genom, fitness: number, dybde: number, regret: number): IndividData {
  const iOmråde = (id: number, [fra, til]: readonly [number, number]): boolean =>
    id >= fra && id < til;
  const kortIder: [number, number] = [utId(ANTALL_INN, UT_KORT), utId(ANTALL_INN, UT_KORT) + 52];
  const xtIder = new Set(
    [UT_XT, UT_XT_LAV, UT_XT_HØY].map((u) => utId(ANTALL_INN, u)),
  );
  let aktive = 0;
  let sumVekt = 0;
  let kortInn = 0;
  let xtInn = 0;
  let fraHistorikk = 0;
  let fraRenons = 0;
  let fraBossTelling = 0;
  let fraTaktikk = 0;
  let fraLagspill = 0;
  let fraBudhist = 0;
  let fraLagstikk = 0;
  for (const k of g.koblinger) {
    if (!k.aktiv) continue;
    aktive++;
    sumVekt += Math.abs(k.vekt);
    if (iOmråde(k.ut, kortIder)) kortInn++;
    if (xtIder.has(k.ut)) xtInn++;
    if (iOmråde(k.inn, SENSORGRUPPER.historikk)) fraHistorikk++;
    if (iOmråde(k.inn, SENSORGRUPPER.renons)) fraRenons++;
    if (iOmråde(k.inn, SENSORGRUPPER.bossTelling)) fraBossTelling++;
    if (iOmråde(k.inn, SENSORGRUPPER.taktikk)) fraTaktikk++;
    if (iOmråde(k.inn, SENSORGRUPPER.lagspill)) fraLagspill++;
    if (iOmråde(k.inn, SENSORGRUPPER.budhistorikk)) fraBudhist++;
    if (iOmråde(k.inn, SENSORGRUPPER.lagstikk)) fraLagstikk++;
  }
  return {
    noder: g.noder.length,
    koblinger: g.koblinger.length,
    skjulte: g.noder.filter((n) => n.type === "skjult").length,
    aktivAndel: g.koblinger.length > 0 ? aktive / g.koblinger.length : 0,
    snittAbsVekt: aktive > 0 ? sumVekt / aktive : 0,
    kortInn,
    xtInn,
    fraHistorikk,
    fraRenons,
    fraBossTelling,
    fraTaktikk,
    fraLagspill,
    fraBudhist,
    fraLagstikk,
    fitness,
    dybde,
    regret,
  };
}

export class Evolusjon {
  readonly bok: Innovasjonsbok;
  genomer: Genom[];
  /** Regjerende mester (vinneren av forrige turnering). */
  mester: Genom | null = null;
  /** Hall of fame: tidligere mestere (nyeste først), stiller i cupen. */
  hall: Genom[] = [];
  /**
   * Gullstandarden: det beste EKSTERNT målte genomet (benk mot grådig).
   * Cupen er for støyete til alene å identifisere det sterkeste genomet –
   * gullstandarden står derfor beskyttet på plass 1 hver generasjon
   * (gjenopprettes fra ankeret, upåvirket av kamplaering og avl), og byttes
   * kun når treneren måler en cupvinner som benker BEDRE. En ratchet:
   * linja kan utforske fritt, men aldri miste sitt beste kjente genom.
   */
  gull: Genom | null = null;
  generasjon = 0;

  private readonly opts: Required<
    Omit<
      EvolusjonsOpts,
      "kampOpts" | "rater" | "startGenom" | "startPopulasjon" | "startHall" | "startTerskel" | "pimcOpts"
    >
  > & {
    kampOpts: KampOpts;
    rater: MutasjonsRater;
    pimcOpts: { verdener: number; terskel: number; maksEval: number };
  };
  private readonly rng: () => number;
  private arter: Art[] = [];
  terskel = 3.0;
  private pool: GruppePool | null = null;
  /** Plassen i populasjonen der mesterkopien står (null før første turnering). */
  private mesterIdx: number | null = null;
  /** Antall generasjoner PÅ RAD mesteren har forsvart tittelen. */
  private forsvarsrekke = 0;
  /**
   * Anger-inversjon: EMA-glattet korrelasjon (per sensorgruppe) mellom
   * antall koblinger fra gruppen og fitness i populasjonen. Styrer
   * mutasjonene MOTSATT av de negative trekkene (se MutasjonsRater.kildeBias).
   */
  private gruppeKorr = new Map<string, number>();

  constructor(opts: EvolusjonsOpts = {}) {
    const populasjon = opts.populasjon ?? 32;
    if (populasjon < 8 || populasjon % 4 !== 0) {
      throw new Error("populasjon må være minst 8 og delelig med 4");
    }
    this.opts = {
      populasjon,
      frø: opts.frø ?? 1,
      koblingerPerUt: opts.koblingerPerUt ?? 5,
      // xT- og margin-hodene vernes mot mutasjonsstøy som standard:
      // regret-læringen kalibrerer dem i løpet av livet, og kalibreringen
      // skal arves – ikke viskes ut.
      rater: opts.rater ?? {
        ...STANDARD_RATER,
        dempedeMål: new Set(
          [UT_XT, UT_MARGIN, UT_XT_LAV, UT_XT_HØY, UT_MAKKER].map((u) => utId(ANTALL_INN, u)),
        ),
        dempFaktor: 0.3,
      },
      lambdaRegret: opts.lambdaRegret ?? 0.5,
      kampOpts: opts.kampOpts ?? {},
      målArter: opts.målArter ?? Math.max(2, Math.round(populasjon / 8)),
      andelForeldre: opts.andelForeldre ?? 0.4,
      stagnasjonsGrense: opts.stagnasjonsGrense ?? 12,
      krysningsAndel: opts.krysningsAndel ?? 0.75,
      hallOfFame: opts.hallOfFame ?? 0,
      tråder: opts.tråder ?? 1,
      pimcPortvakter: Math.floor((opts.pimcPortvakter ?? 0) / 4) * 4,
      pimcOpts: { ...STD_PORTVAKT, ...opts.pimcOpts },
      sparkEtter: opts.sparkEtter ?? 15,
    };
    if (this.opts.tråder > 1) this.pool = new GruppePool(this.opts.tråder);
    this.rng = lagRng(this.opts.frø);
    this.bok = new Innovasjonsbok(ANTALL_INN, ANTALL_UT);
    if (opts.startPopulasjon !== undefined && opts.startPopulasjon.length > 0) {
      const basis = opts.startPopulasjon.map((g) => this.kanoniser(g));
      for (const g of basis) this.bok.hoppOver(g);
      this.genomer = basis.slice(0, populasjon).map(klonGenom);
      let i = 0;
      while (this.genomer.length < populasjon) {
        const mutant = klonGenom(basis[i++ % basis.length]!);
        muter(mutant, this.bok, this.rng, this.opts.rater);
        this.genomer.push(mutant);
      }
    } else if (opts.startGenom !== undefined) {
      if (opts.startGenom.antallInn !== ANTALL_INN || opts.startGenom.antallUt !== ANTALL_UT) {
        throw new Error("startGenom har feil antall inn-/utganger for denne kodingen");
      }
      this.bok.hoppOver(opts.startGenom);
      this.genomer = [klonGenom(opts.startGenom)];
      while (this.genomer.length < populasjon) {
        const mutant = klonGenom(opts.startGenom);
        muter(mutant, this.bok, this.rng, this.opts.rater);
        this.genomer.push(mutant);
      }
    } else {
      this.genomer = Array.from({ length: populasjon }, () =>
        nyttGenom(ANTALL_INN, ANTALL_UT, this.bok, this.rng, this.opts.koblingerPerUt),
      );
    }
    if (opts.startHall !== undefined && opts.startHall.length > 0) {
      this.hall = opts.startHall.map((g) => this.kanoniser(g));
      for (const g of this.hall) this.bok.hoppOver(g);
    }
    if (opts.startTerskel !== undefined && opts.startTerskel > 0) {
      this.terskel = opts.startTerskel;
    }
  }

  /** Setter/erstatter gullstandarden (kanoniseres og klones). */
  settGull(genom: Genom): void {
    this.gull = this.kanoniser(klonGenom(genom));
    this.bok.hoppOver(this.gull);
    if (this.genomer.length > 1) this.genomer[1] = klonGenom(this.gull);
  }

  /** Antall hall of fame-medlemmer som stiller (holder feltet delelig med 4). */
  private antallHallDeltakere(): number {
    const tilgjengelig = Math.min(this.hall.length, this.opts.hallOfFame);
    return Math.floor(tilgjengelig / 4) * 4;
  }

  /**
   * Spiller turneringen for nåværende populasjon (pluss hall of fame som
   * ekstra deltakere) uten å avle nytt kull. Med `tråder > 1` avvikles
   * rundens grupper parallelt i arbeidstråder (samme resultat, raskere);
   * regret-læringen skrives tilbake i genomene i begge tilfeller.
   */
  async spillTurnering(): Promise<TurneringsResultat> {
    const frø = (this.opts.frø + Math.imul(this.generasjon + 1, 0xc2b2ae35)) >>> 0;
    // Målestokken: ÉN PIMC-solver som stilles i hver førsterunde-gruppe
    // (3 konkurrenter + solver), aldri i cupen som konkurrent. Samme
    // markør kan stå i alle gruppene – hver kamp lager sin egen agent.
    const brukMålestokk = this.opts.pimcPortvakter > 0;
    const felt: Deltaker[] = [
      ...this.genomer,
      ...this.hall.slice(0, this.antallHallDeltakere()),
    ];
    let målestokk: number | null = null;
    if (brukMålestokk) {
      målestokk = felt.length;
      felt.push({ pimc: true, frøBase: frø, ...this.opts.pimcOpts });
    }
    if (this.pool !== null) {
      return kjørTurneringMed(
        felt.length,
        (medlemmer, gruppeFrø) =>
          this.pool!.spill(
            medlemmer.map((i) => felt[i]!),
            gruppeFrø,
            this.opts.kampOpts,
            STD_LÆRINGSRATE,
          ),
        frø,
        målestokk,
      );
    }
    const agenter = felt.map((d) => (erPimc(d) ? new PimcPortvakt(d) : new NeatAgent(d)));
    return kjørTurnering(agenter, frø, this.opts.kampOpts, målestokk);
  }

  /** Avslutter eventuelle arbeidstråder (kall ved endt trening). */
  async avslutt(): Promise<void> {
    await this.pool?.lukk();
    this.pool = null;
  }

  /** Kjører én hel generasjon: turnering, fitness, artsdeling, nytt kull. */
  async kjørGenerasjon(): Promise<GenerasjonsStat> {
    const res = await this.spillTurnering();
    // Målestokken (siste felt-plass når portvakter er på) holdes utenfor
    // fitness-normaliseringen – dens poengsum er ikke en konkurrent.
    const målestokkIdx =
      this.opts.pimcPortvakter > 0
        ? this.genomer.length + this.antallHallDeltakere()
        : null;
    const alleFitness = beregnFitness(
      res,
      this.mesterIdx,
      { lambdaRegret: this.opts.lambdaRegret },
      målestokkIdx,
    );
    // Bare populasjonen formerer seg; hall of fame konkurrerer kun.
    const fitness = alleFitness.slice(0, this.genomer.length);

    const mesterForsvarte = this.mesterIdx !== null && res.mesterIdx === this.mesterIdx;
    const hallAntall = this.antallHallDeltakere();
    const fraHall =
      res.mesterIdx >= this.genomer.length && res.mesterIdx < this.genomer.length + hallAntall;
    // Vinner en PIMC-portvakt hele cupen, finnes ikke noe vinnergenom –
    // beste populasjonsmedlem (etter fitness) blir mester og avls-anker,
    // akkurat som når en hall of fame-veteran vinner.
    const fraPortvakt = res.mesterIdx >= this.genomer.length + hallAntall;

    let avlsAnker = res.mesterIdx;
    if (fraHall || fraPortvakt) {
      avlsAnker = 0;
      for (let i = 1; i < fitness.length; i++) if (fitness[i]! > fitness[avlsAnker]!) avlsAnker = i;
    }
    const nyMester = klonGenom(
      fraHall
        ? this.hall[res.mesterIdx - this.genomer.length]!
        : this.genomer[fraPortvakt ? avlsAnker : res.mesterIdx]!,
    );

    // Stagnasjonsspark-telleren: sammenhengende tittelforsvar.
    this.forsvarsrekke = mesterForsvarte ? this.forsvarsrekke + 1 : 0;

    this.oppdaterGruppeKorr(fitness);
    this.artsdel(fitness);
    const nesteKull = this.avle(fitness, avlsAnker, res.regretSnitt.slice(0, this.genomer.length));

    // Mesteren står alltid uendret på plass 0 og må forsvare tittelen.
    // Den avgåtte mesteren går inn i hall of fame (nyeste først).
    if (this.opts.hallOfFame > 0 && this.mester !== null && !mesterForsvarte) {
      this.hall.unshift(klonGenom(this.mester));
      this.hall = this.hall.slice(0, this.opts.hallOfFame);
    }
    this.mester = nyMester;
    this.genomer = [klonGenom(nyMester), ...nesteKull];
    this.mesterIdx = 0;
    // Gullstandarden gjenopprettes fra ankeret hver generasjon – verken
    // kamplaering eller avl får erodere det beste kjente genomet.
    if (this.gull !== null && this.genomer.length > 1) {
      this.genomer[1] = klonGenom(this.gull);
    }

    const individer = this.genomer.map((g, i) =>
      lagIndividData(g, fitness[i]!, res.dybde[i]!, res.regretSnitt[i]!),
    );

    const stat: GenerasjonsStat = {
      generasjon: this.generasjon,
      antallArter: this.arter.length,
      besteFitness: Math.max(...fitness),
      snittFitness: fitness.reduce((a, b) => a + b, 0) / fitness.length,
      mesterDybde: res.dybde[res.mesterIdx]!,
      mesterForsvarte,
      snittRegret:
        res.regretSnitt.reduce((a, b) => a + b, 0) / Math.max(1, res.regretSnitt.length),
      mesterNoder: nyMester.noder.length,
      mesterKoblinger: nyMester.koblinger.length,
      turneringsRunder: res.runder,
      individer,
    };
    this.generasjon++;
    return stat;
  }

  // -------------------------------------------------------------------------

  /**
   * Kanonisk re-nummerering: hver koblings innovasjonsnummer settes til
   * bokas nummer for (fra→til)-paret. Samme struktur får dermed samme
   * nummer uansett hvilken historikk genomet kommer fra – og fremtidige
   * mutasjoner av samme par gjenbruker nummeret (bokas vanlige garanti).
   */
  private kanoniser(g: Genom): Genom {
    if (g.antallInn !== ANTALL_INN || g.antallUt !== ANTALL_UT) {
      throw new Error("Genom har feil antall inn-/utganger for denne kodingen");
    }
    return {
      antallInn: g.antallInn,
      antallUt: g.antallUt,
      noder: g.noder.map((n) => ({ ...n })),
      koblinger: g.koblinger.map((k) => ({
        ...k,
        innovasjon: this.bok.kobling(k.inn, k.ut),
      })),
    };
  }

  /**
   * Måler korrelasjonen mellom «koblinger fra sensorgruppe X» og fitness i
   * populasjonen, og glatter den med EMA (α = 0,1) – enkeltgenerasjoner er
   * for støyete til å styre mutasjoner alene.
   */
  private oppdaterGruppeKorr(fitness: readonly number[]): void {
    const n = this.genomer.length;
    if (n < 8) return;
    const fSnitt = fitness.reduce((a, b) => a + b, 0) / n;
    const fStd = Math.sqrt(fitness.reduce((a, f) => a + (f - fSnitt) ** 2, 0) / n) || 1;
    for (const [navn, [fra, til]] of Object.entries(SENSORGRUPPER)) {
      const teller = this.genomer.map((g) => {
        let c = 0;
        for (const k of g.koblinger) if (k.aktiv && k.inn >= fra && k.inn < til) c++;
        return c;
      });
      const tSnitt = teller.reduce((a, b) => a + b, 0) / n;
      const tStd = Math.sqrt(teller.reduce((a, t) => a + (t - tSnitt) ** 2, 0) / n) || 1;
      let korr = 0;
      for (let i = 0; i < n; i++) {
        korr += ((teller[i]! - tSnitt) / tStd) * ((fitness[i]! - fSnitt) / fStd);
      }
      korr /= n;
      const gammel = this.gruppeKorr.get(navn) ?? 0;
      this.gruppeKorr.set(navn, gammel * 0.9 + korr * 0.1);
    }
  }

  /** Bygger kildeBias fra de glattede korrelasjonene (skalert, klippet). */
  private lagKildeBias(): KildeBias[] {
    const bias: KildeBias[] = [];
    for (const [navn, [fra, til]] of Object.entries(SENSORGRUPPER)) {
      const korr = this.gruppeKorr.get(navn) ?? 0;
      const score = Math.max(-0.5, Math.min(0.5, korr * 3));
      if (Math.abs(score) > 0.02) bias.push({ fra, til, score });
    }
    return bias;
  }

  /** Deler populasjonen i arter etter kompatibilitetsavstand. */
  private artsdel(fitness: readonly number[]): void {
    for (const art of this.arter) art.medlemmer = [];

    for (let i = 0; i < this.genomer.length; i++) {
      const g = this.genomer[i]!;
      let plassert = false;
      for (const art of this.arter) {
        if (avstand(g, art.representant) < this.terskel) {
          art.medlemmer.push(i);
          plassert = true;
          break;
        }
      }
      if (!plassert) {
        this.arter.push({
          representant: klonGenom(g),
          medlemmer: [i],
          besteFitness: -Infinity,
          stagnasjon: 0,
        });
      }
    }

    this.arter = this.arter.filter((a) => a.medlemmer.length > 0);
    for (const art of this.arter) {
      const beste = Math.max(...art.medlemmer.map((i) => fitness[i]!));
      if (beste > art.besteFitness) {
        art.besteFitness = beste;
        art.stagnasjon = 0;
      } else {
        art.stagnasjon++;
      }
      // Ny representant: tilfeldig medlem (holder arten «der den er»).
      const rep = art.medlemmer[Math.floor(this.rng() * art.medlemmer.length)]!;
      art.representant = klonGenom(this.genomer[rep]!);
    }

    // Juster terskelen mot ønsket antall arter – med DØDSONE og ADAPTIVE
    // steg. Store steg fikk antallet til å flakse (2↔29 annenhver
    // generasjon på bimodale avstandsfordelinger), men rene småsteg gjør
    // veien fra startterskelen for lang (arter=1 i titalls generasjoner).
    // Derfor: grove steg langt fra målet, fine steg nær, ro i dødsonen.
    const mål = this.opts.målArter;
    if (this.arter.length > mål * 1.25) {
      this.terskel += this.arter.length > mål * 2 ? 0.15 : 0.05;
    } else if (this.arter.length < mål * 0.75) {
      const steg = this.arter.length < mål / 4 ? 0.15 : 0.05;
      this.terskel = Math.max(0.5, this.terskel - steg);
    }
  }

  /**
   * Avler neste kull (populasjon − 1 avkom; mesterkopien kommer i tillegg).
   * Angeren styrer mutasjonsTRYKKET per avkom: foreldre med høy anger gir
   * utforskende mutasjoner (de trenger endring), foreldre med lav anger gir
   * finjustering (de er nær målet) – regret dytter mutasjonene i riktig
   * retning i styrke, slik læringen alt gjør i fortegn.
   */
  private avle(
    fitness: readonly number[],
    turneringsMester: number,
    regretSnitt: readonly number[],
  ): Genom[] {
    const rng = this.rng;
    const antallAvkom = this.opts.populasjon - 1;

    // Stagnasjonsspark: sitter mesteren for lenge, dobles strukturmutasjonene
    // og vektstyrken for avkommet – stillstand besvares med utforskning.
    const spark =
      this.opts.sparkEtter > 0 && this.forsvarsrekke >= this.opts.sparkEtter ? 2 : 1;
    // Anger-inversjon: mutasjonene dyttes motsatt av trekkene som predikerer
    // dårlig spill (og mot dem som predikerer godt).
    const kildeBias = this.lagKildeBias();
    const kullRater: MutasjonsRater = {
      ...this.opts.rater,
      ...(kildeBias.length > 0 ? { kildeBias } : {}),
      ...(spark > 1
        ? {
            nyKobling: Math.min(0.95, this.opts.rater.nyKobling * spark),
            nyNode: Math.min(0.6, this.opts.rater.nyNode * spark),
          }
        : {}),
    };

    // Stagnerte arter dør – med mindre turneringsvinneren bor der.
    const levende = this.arter.filter(
      (a) =>
        a.stagnasjon < this.opts.stagnasjonsGrense ||
        a.medlemmer.includes(turneringsMester),
    );
    const arter = levende.length > 0 ? levende : this.arter;

    // Fitness-deling: artens sum av (fitness / artsstørrelse) gir kvoten.
    const delt = arter.map((a) =>
      a.medlemmer.reduce((sum, i) => sum + fitness[i]! / a.medlemmer.length, 0),
    );
    const totalDelt = delt.reduce((a, b) => a + b, 0) || 1;

    // Kvoter med største-rest-metoden.
    const rå = delt.map((d) => (d / totalDelt) * antallAvkom);
    const kvoter = rå.map(Math.floor);
    let rest = antallAvkom - kvoter.reduce((a, b) => a + b, 0);
    const restRekkefølge = rå
      .map((r, i) => ({ i, rest: r - Math.floor(r) }))
      .sort((a, b) => b.rest - a.rest);
    for (let k = 0; rest > 0; k = (k + 1) % restRekkefølge.length, rest--) {
      kvoter[restRekkefølge[k]!.i]!++;
    }

    const avkom: Genom[] = [];
    for (let a = 0; a < arter.length; a++) {
      const art = arter[a]!;
      let kvote = kvoter[a]!;
      if (kvote === 0) continue;

      // Luk bort de dårlige: bare toppandelen får bli foreldre.
      const sortert = art.medlemmer.slice().sort((x, y) => fitness[y]! - fitness[x]!);
      const antallForeldre = Math.max(1, Math.ceil(sortert.length * this.opts.andelForeldre));
      const foreldre = sortert.slice(0, antallForeldre);

      // Elitisme: artens beste kopieres uendret når arten er stor nok.
      if (art.medlemmer.length >= 3 && kvote > 0) {
        avkom.push(klonGenom(this.genomer[sortert[0]!]!));
        kvote--;
      }

      for (let k = 0; k < kvote; k++) {
        const forelder = foreldre[Math.floor(rng() * foreldre.length)]!;
        const barn = this.lagBarn(foreldre, arter, a, fitness);
        // Regret-styrt trykk: skaler perturbasjonen med forelderens anger
        // (typisk ~0,3 på poengskalaen → faktor 1; klippet til [0,5, 2]).
        const trykk = Math.max(0.5, Math.min(2, (regretSnitt[forelder] ?? 0.3) / 0.3));
        muter(barn, this.bok, rng, { ...kullRater, styrke: kullRater.styrke * trykk * spark });
        avkom.push(barn);
      }
    }

    // Avrundingssvinn (f.eks. alle kvoter 0): fyll opp med mutanter av mesteren.
    while (avkom.length < antallAvkom) {
      const barn = klonGenom(this.genomer[turneringsMester]!);
      muter(barn, this.bok, rng, kullRater);
      avkom.push(barn);
    }
    return avkom.slice(0, antallAvkom);
  }

  private lagBarn(
    foreldre: readonly number[],
    arter: readonly Art[],
    artIdx: number,
    fitness: readonly number[],
  ): Genom {
    const rng = this.rng;
    const velg = (liste: readonly number[]): number =>
      liste[Math.floor(rng() * liste.length)]!;

    if (foreldre.length >= 2 && rng() < this.opts.krysningsAndel) {
      let mor = velg(foreldre);
      let far = velg(foreldre);
      // 1 % sjanse for kryssing på tvers av arter (friskt blod).
      if (arter.length > 1 && rng() < 0.01) {
        const andre = arter.filter((_, i) => i !== artIdx);
        const annenArt = andre[Math.floor(rng() * andre.length)]!;
        far = velg(annenArt.medlemmer);
      }
      if (fitness[far]! > fitness[mor]!) {
        const t = mor;
        mor = far;
        far = t;
      }
      return kryss(this.genomer[mor]!, this.genomer[far]!, rng);
    }
    return klonGenom(this.genomer[velg(foreldre)]!);
  }
}
