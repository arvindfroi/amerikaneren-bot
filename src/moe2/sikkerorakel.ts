/**
 * SIKKERORAKELET: overstyrer policyen BARE der framoverblikket er sikkert.
 *
 * Dette er forbedringsoperatoren selvspill-løkka skal hvile på, og den er en
 * direkte konsekvens av en måling: det rå SD-orakelet er DÅRLIGERE enn nettet
 * det lærte opp, i alle tre roller (`ork:`-benken, 3. august):
 *
 *     spillefører  −0,357     makker  −0,078     forsvar  −0,153
 *
 * En forbedringsoperator som gjør policyen verre kan ingen løkke redde. Men
 * feilen er ikke at framoverblikket er verdiløst – den er at `argmax` over K
 * støyete anslag plukker det kortet som fikk de snilleste verdenene. Med
 * verdiene beholdt per verden (`sdpar.ts`) kan operatoren i stedet spørre:
 *
 *     er beste kort bedre enn nest beste MED MARGIN, parvis over verdenene?
 *
 * Er svaret nei, står nettets valg. Operatoren sier «jeg vet ikke» i stedet
 * for å gjette, og det er hele forskjellen.
 *
 * TERSKELEN `sigma` ER EN AKSE SOM MÅ MÅLES, IKKE GJETTES. σ=0 er nøyaktig
 * dagens rå orakel (overstyr alltid) og skal måle det samme som `ork:` gjorde.
 * σ→∞ er ren champion (overstyr aldri) og skal måle nøyaktig 0. At de to
 * ytterpunktene reproduserer kjente tall er selve valideringen av oppsettet;
 * går det ikke opp, er det operatoren som er feil, ikke funnet.
 *
 * ============ TROEN OG FRISTEN (11. sep) ==================================
 *
 * Søket i den utrullede boten trakk verdener vektet etter BUDET alene, blant tre
 * kandidater. Det skarpeste trosnettet prosjektet har (MLB-trohodet) satt aldri i
 * søket. `trovektFor` kobler det inn; `budvekt: false` slår av budformelen når
 * trohodet selv leser budrunden.
 *
 * `fristMs` er appens tidsbudsjett. Uten den kunne ett tregt trekk fryse bordet;
 * med den kuttes hele verdener (se `vurderPar`), så σ regnes fortsatt parvis. All
 * MÅLING går uten frist — en frist gjør valget avhengig av maskinens fart.
 */

import { type GameState, type Handling } from "../motor.ts";
import { lagRng } from "../kort.ts";
import type { Verden } from "../solver/sampler.ts";
import { vurderPar } from "./sdpar.ts";
import type { Utspiller } from "./sdkort.ts";
import { rolleFor, type Rolle } from "./rolleorakel.ts";

export interface SikkerOpts {
  readonly verdener?: number;
  /** Minste parrede σ før nettets valg overstyres. */
  readonly sigma?: number;
  /** Roller operatoren får gripe inn i. Tom = alle. */
  readonly roller?: readonly Rolle[];
  readonly frø?: number;
  /** Kandidatverdener importance-samplingen velger mellom. Standard 3 var for lavt. */
  readonly verdenKandidater?: number;
  /**
   * ALPHA-MU-KRITERIET. `snitt` er PIMC og standard. De tre andre krever at
   * kortet er godt paa TVERS av verdenene i stedet for i snitt - se
   * `vurderSD` i sdkort.ts. Strategifusjon er maalt to ganger i dette
   * prosjektet (§56, §58), og dette er den ene formen som angriper den.
   */
  readonly verdenKombi?: "snitt" | "min" | "kvantil" | "flest";
  /** A1: vekt verdenene etter spillet, ikke bare budrunden. */
  readonly spillvekt?: boolean;
  /**
   * TROEN I VERDENENE. Kalles én gang per vurdert beslutning og gir vektfunksjonen
   * for stillingen, eller null når ingenting er skjult. Udefinert = som før.
   * Utelukker `spillvekt` (samme bevis to ganger).
   */
  readonly trovektFor?: (state: GameState, sete: number) => ((v: Verden) => number) | null;
  /** Budvekten på verdenene. Standard på. */
  readonly budvekt?: boolean;
  /** Tidsbudsjett per beslutning i millisekunder. Udefinert = ingen frist. */
  readonly fristMs?: number;
  /** Klokka fristen og `siste.ms` måles med. Standard `performance.now()`. */
  readonly klokke?: () => number;
}

/** Tellere, så en kjøring kan vise HVOR ofte operatoren faktisk grep inn. */
export interface SikkerTellere {
  beslutninger: number;
  vurdert: number;
  overstyrt: number;
  enig: number;
  /** Vurderinger med færre verdener enn bedt om — fristen, eller trekninger som feilet. */
  avkortet: number;
}

/** Siste beslutning i en rolle søket dekker, for appens logg. `null` utenfor. */
export interface SikkerSiste {
  /** `søk` = overstyrt, `enig` = søket valgte det nettet valgte, `nett` = porten holdt. */
  readonly lag: "nett" | "søk" | "enig";
  /** Verdener som faktisk ble spilt ut. 0 = ingen vurdering (ett lovlig kort, eller fristen). */
  readonly n: number;
  readonly sigma: number;
  readonly ms: number;
}

export class Sikkerorakel {
  private readonly indre: { velgHandling(s: GameState): Handling; nyKamp(): void };
  private readonly motpart: Utspiller;
  private readonly verdener: number;
  private readonly sigma: number;
  private readonly roller: readonly Rolle[];
  private readonly rng: () => number;
  private readonly verdenKandidater: number;
  private readonly verdenKombi: "snitt" | "min" | "kvantil" | "flest";
  private readonly spillvekt: boolean;
  private readonly trovektFor: ((state: GameState, sete: number) => ((v: Verden) => number) | null) | null;
  private readonly budvekt: boolean;
  private readonly fristMs: number | null;
  private readonly klokke: () => number;
  readonly tellere: SikkerTellere = { beslutninger: 0, vurdert: 0, overstyrt: 0, enig: 0, avkortet: 0 };
  siste: SikkerSiste | null = null;

  constructor(
    indre: { velgHandling(s: GameState): Handling; nyKamp(): void },
    motpart: Utspiller,
    opts: SikkerOpts = {},
  ) {
    this.indre = indre;
    this.motpart = motpart;
    this.verdener = opts.verdener ?? 12;
    this.sigma = opts.sigma ?? 1.5;
    this.roller = opts.roller ?? [];
    this.rng = lagRng(opts.frø ?? 20_260_804);
    this.verdenKandidater = opts.verdenKandidater ?? 3;
    this.verdenKombi = opts.verdenKombi ?? "snitt";
    this.spillvekt = opts.spillvekt === true;
    this.trovektFor = opts.trovektFor ?? null;
    this.budvekt = opts.budvekt ?? true;
    this.fristMs = opts.fristMs ?? null;
    this.klokke = opts.klokke ?? ((): number => performance.now());
    // Feil ved bygging, ikke ved første trekk midt i en kamp.
    if (this.spillvekt && this.trovektFor !== null) {
      throw new Error("Sikkerorakel: spillvekt og trovekt leser det samme beviset - velg én");
    }
    if (this.fristMs !== null && !(this.fristMs > 0)) {
      throw new Error(`Sikkerorakel: fristMs må være > 0, fikk ${this.fristMs}`);
    }
  }

  nyKamp(): void {
    this.indre.nyKamp();
  }

  velgHandling(state: GameState): Handling {
    this.siste = null;
    if (state.fase !== "SPILL" || state.iTur === null) return this.indre.velgHandling(state);
    const sete = state.iTur;
    if (this.roller.length > 0) {
      const r = rolleFor(state, sete);
      if (r === null || !this.roller.includes(r)) return this.indre.velgHandling(state);
    }
    this.tellere.beslutninger++;
    const start = this.klokke();

    const par = vurderPar(state, sete, this.motpart, {
      verdenKandidater: this.verdenKandidater,
      verdenKombi: this.verdenKombi,
      spillvekt: this.spillvekt,
      trovekt: this.trovektFor === null ? undefined : (this.trovektFor(state, sete) ?? undefined),
      budvekt: this.budvekt,
      frist: this.fristMs === null ? undefined : start + this.fristMs,
      klokke: this.klokke,
      verdener: this.verdener,
      rng: this.rng,
    });
    // Ingen verden lot seg trekke, bare ett lovlig kort, eller fristen rakk ingen
    // verden: la policyen stå.
    if (par === null) {
      this.siste = { lag: "nett", n: 0, sigma: 0, ms: this.klokke() - start };
      return this.indre.velgHandling(state);
    }
    this.tellere.vurdert++;
    if (par.n < this.verdener) this.tellere.avkortet++;

    if (par.sigma < this.sigma) {
      this.siste = { lag: "nett", n: par.n, sigma: par.sigma, ms: this.klokke() - start };
      return this.indre.velgHandling(state);
    }

    const eget = this.indre.velgHandling(state);
    if (
      eget.type === "SPILL" &&
      eget.kort.farge === par.beste.kort.farge &&
      eget.kort.verdi === par.beste.kort.verdi
    ) {
      this.tellere.enig++;
      this.siste = { lag: "enig", n: par.n, sigma: par.sigma, ms: this.klokke() - start };
      return eget;
    }
    this.tellere.overstyrt++;
    this.siste = { lag: "søk", n: par.n, sigma: par.sigma, ms: this.klokke() - start };
    return { type: "SPILL", spiller: sete, kort: par.beste.kort };
  }
}
