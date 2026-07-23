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
  type MutasjonsRater,
} from "./genom.ts";
import { NeatAgent } from "./agent.ts";
import { ANTALL_INN, ANTALL_UT } from "./trekk.ts";
import {
  beregnFitness,
  kjørTurnering,
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
}

interface Art {
  representant: Genom;
  medlemmer: number[];
  besteFitness: number;
  stagnasjon: number;
}

export class Evolusjon {
  readonly bok: Innovasjonsbok;
  genomer: Genom[];
  /** Regjerende mester (vinneren av forrige turnering). */
  mester: Genom | null = null;
  /** Hall of fame: tidligere mestere (nyeste først), stiller i cupen. */
  hall: Genom[] = [];
  generasjon = 0;

  private readonly opts: Required<
    Omit<EvolusjonsOpts, "kampOpts" | "rater" | "startGenom" | "startPopulasjon">
  > & { kampOpts: KampOpts; rater: MutasjonsRater };
  private readonly rng: () => number;
  private arter: Art[] = [];
  private terskel = 3.0;
  /** Plassen i populasjonen der mesterkopien står (null før første turnering). */
  private mesterIdx: number | null = null;

  constructor(opts: EvolusjonsOpts = {}) {
    const populasjon = opts.populasjon ?? 32;
    if (populasjon < 8 || populasjon % 4 !== 0) {
      throw new Error("populasjon må være minst 8 og delelig med 4");
    }
    this.opts = {
      populasjon,
      frø: opts.frø ?? 1,
      koblingerPerUt: opts.koblingerPerUt ?? 5,
      rater: opts.rater ?? STANDARD_RATER,
      lambdaRegret: opts.lambdaRegret ?? 0.5,
      kampOpts: opts.kampOpts ?? {},
      målArter: opts.målArter ?? Math.max(2, Math.round(populasjon / 8)),
      andelForeldre: opts.andelForeldre ?? 0.4,
      stagnasjonsGrense: opts.stagnasjonsGrense ?? 12,
      krysningsAndel: opts.krysningsAndel ?? 0.75,
      hallOfFame: opts.hallOfFame ?? 0,
    };
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
  }

  /** Antall hall of fame-medlemmer som stiller (holder feltet delelig med 4). */
  private antallHallDeltakere(): number {
    const tilgjengelig = Math.min(this.hall.length, this.opts.hallOfFame);
    return Math.floor(tilgjengelig / 4) * 4;
  }

  /**
   * Spiller turneringen for nåværende populasjon (pluss hall of fame som
   * ekstra deltakere) uten å avle nytt kull.
   */
  spillTurnering(): TurneringsResultat {
    const felt = [...this.genomer, ...this.hall.slice(0, this.antallHallDeltakere())];
    const agenter = felt.map((g) => new NeatAgent(g));
    const frø = (this.opts.frø + Math.imul(this.generasjon + 1, 0xc2b2ae35)) >>> 0;
    return kjørTurnering(agenter, frø, this.opts.kampOpts);
  }

  /** Kjører én hel generasjon: turnering, fitness, artsdeling, nytt kull. */
  kjørGenerasjon(): GenerasjonsStat {
    const res = this.spillTurnering();
    const alleFitness = beregnFitness(res, this.mesterIdx, {
      lambdaRegret: this.opts.lambdaRegret,
    });
    // Bare populasjonen formerer seg; hall of fame konkurrerer kun.
    const fitness = alleFitness.slice(0, this.genomer.length);

    const mesterForsvarte = this.mesterIdx !== null && res.mesterIdx === this.mesterIdx;
    const fraHall = res.mesterIdx >= this.genomer.length;
    const nyMester = klonGenom(
      fraHall ? this.hall[res.mesterIdx - this.genomer.length]! : this.genomer[res.mesterIdx]!,
    );

    // Vinner en hall of fame-veteran cupen, brukes beste populasjonsmedlem
    // som avls-anker (stagnasjonsvern og mutant-fyll).
    let avlsAnker = res.mesterIdx;
    if (fraHall) {
      avlsAnker = 0;
      for (let i = 1; i < fitness.length; i++) if (fitness[i]! > fitness[avlsAnker]!) avlsAnker = i;
    }

    this.artsdel(fitness);
    const nesteKull = this.avle(fitness, avlsAnker);

    // Mesteren står alltid uendret på plass 0 og må forsvare tittelen.
    // Den avgåtte mesteren går inn i hall of fame (nyeste først).
    if (this.opts.hallOfFame > 0 && this.mester !== null && !mesterForsvarte) {
      this.hall.unshift(klonGenom(this.mester));
      this.hall = this.hall.slice(0, this.opts.hallOfFame);
    }
    this.mester = nyMester;
    this.genomer = [klonGenom(nyMester), ...nesteKull];
    this.mesterIdx = 0;

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

    // Juster terskelen mot ønsket antall arter.
    if (this.arter.length > this.opts.målArter) this.terskel += 0.15;
    else if (this.arter.length < this.opts.målArter) this.terskel = Math.max(0.5, this.terskel - 0.15);
  }

  /** Avler neste kull (populasjon − 1 avkom; mesterkopien kommer i tillegg). */
  private avle(fitness: readonly number[], turneringsMester: number): Genom[] {
    const rng = this.rng;
    const antallAvkom = this.opts.populasjon - 1;

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
        const barn = this.lagBarn(foreldre, arter, a, fitness);
        muter(barn, this.bok, rng, this.opts.rater);
        avkom.push(barn);
      }
    }

    // Avrundingssvinn (f.eks. alle kvoter 0): fyll opp med mutanter av mesteren.
    while (avkom.length < antallAvkom) {
      const barn = klonGenom(this.genomer[turneringsMester]!);
      muter(barn, this.bok, rng, this.opts.rater);
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
