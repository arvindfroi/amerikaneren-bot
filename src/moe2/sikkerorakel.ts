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
 */

import { type GameState, type Handling } from "../motor.ts";
import { lagRng } from "../kort.ts";
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
}

/** Tellere, så en kjøring kan vise HVOR ofte operatoren faktisk grep inn. */
export interface SikkerTellere {
  beslutninger: number;
  vurdert: number;
  overstyrt: number;
  enig: number;
}

export class Sikkerorakel {
  private readonly indre: { velgHandling(s: GameState): Handling; nyKamp(): void };
  private readonly motpart: Utspiller;
  private readonly verdener: number;
  private readonly sigma: number;
  private readonly roller: readonly Rolle[];
  private readonly rng: () => number;
  readonly tellere: SikkerTellere = { beslutninger: 0, vurdert: 0, overstyrt: 0, enig: 0 };

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
  }

  nyKamp(): void {
    this.indre.nyKamp();
  }

  velgHandling(state: GameState): Handling {
    if (state.fase !== "SPILL" || state.iTur === null) return this.indre.velgHandling(state);
    const sete = state.iTur;
    if (this.roller.length > 0) {
      const r = rolleFor(state, sete);
      if (r === null || !this.roller.includes(r)) return this.indre.velgHandling(state);
    }
    this.tellere.beslutninger++;

    const par = vurderPar(state, sete, this.motpart, {
      verdener: this.verdener,
      rng: this.rng,
    });
    // Ingen verden lot seg trekke, eller bare ett lovlig kort: la policyen stå.
    if (par === null) return this.indre.velgHandling(state);
    this.tellere.vurdert++;

    if (par.sigma < this.sigma) return this.indre.velgHandling(state);

    const eget = this.indre.velgHandling(state);
    if (
      eget.type === "SPILL" &&
      eget.kort.farge === par.beste.kort.farge &&
      eget.kort.verdi === par.beste.kort.verdi
    ) {
      this.tellere.enig++;
      return eget;
    }
    this.tellere.overstyrt++;
    return { type: "SPILL", spiller: sete, kort: par.beste.kort };
  }
}
