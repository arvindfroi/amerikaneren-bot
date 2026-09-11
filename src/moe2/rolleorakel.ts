/**
 * ORAKELET SOM SPILLER, MEN BARE I ÉN ROLLE.
 *
 * HVORFOR DEN FINNES. Makkerens atferd ble målt mot SD-orakelet og avvek
 * kraftig: honnør spilt i 7,5 % av stillingene mot orakelets 23,1 % (~19 SE),
 * og stikket forbigått i 6,0 % mot orakelets 16,1 % (~5,4 SE). Konklusjonen
 * «makkeren spiller feil» hviler helt på at ORAKELET HAR RETT der.
 *
 * DET ER IKKE GITT, og planen har alt et motbevis for én annen rolle:
 * `lagstikk − SD` = **+0,26 som spillefører** – nettet er allerede bedre enn
 * læreren sin der. SD-fasiten ble godkjent på en AGGREGERT korrelasjon mot
 * poeng (+0,718), aldri per rolle. Makkerstillinger har dessuten det minste
 * spennet mellom beste og verste kort (gulv 0,336 mot spillefører 2,010), så
 * de er nettopp der 12 samplede verdener har dårligst oppløsning: forskjellen
 * mellom kandidatene kan være mindre enn samplingsstøyen.
 *
 * Å diskutere det er bortkastet. Denne agenten gjør det til en måling: følg
 * orakelet BARE i den valgte rollen, la alt annet stå, og se på poengene.
 *
 *   `wred`-nettet i alle roller            = referansen
 *   samme, men orakelet i makkerrollen     = kandidaten
 *
 * Er kandidaten bedre, er avviket en ekte feil og verdt å trene bort. Er den
 * lik eller verre, måler de 19 SE-ene bare at vi er ulike orakelet – og da er
 * hele makkerdiagnosen bygget på sand.
 *
 * KOSTNADEN er reell: SD med N verdener per beslutning i den valgte rollen.
 * Derfor er rollen et valg og ikke «alle».
 *
 * ROLLOUT-POLICYEN ER EN EGEN AKSE, OG DEN VAR FEIL I FOERSTE MAALING.
 * Foerste kjoering brukte NevroHjerne som `motpart` - men treningsdataen i
 * sd-v4 ble generert med `--motpart vakt:abmp:e1:ftf1.bin`, altsaa vaar sterke
 * bot. Jeg maalte derfor et SVAKERE orakel enn det som faktisk lager fasiten,
 * og konklusjonen «orakelet er uttoemt» kunne vaere et artefakt av nettopp det.
 *
 * `motpart` er modellen orakelet FORESTILLER seg at de andre bruker. Er den
 * svakere enn bordet, undervurderer evalueringen systematisk linjer som krever
 * god oppfoelging - og da maaler man modellfeilen, ikke orakelets tak.
 */

import { lagRng } from "../kort.ts";
import { lovligeKort, type GameState, type Handling } from "../motor.ts";
import { lagTrovekt } from "./troprior.ts";
import { besteKortSD, type Utspiller } from "./sdkort.ts";

export type Rolle = "foerer" | "makker" | "forsvar";

export interface RolleorakelOpts {
  /** Verdener SD sampler per beslutning. 12 er det målte nivået. */
  readonly verdener?: number;
  readonly frø?: number;
  /**
   * TROSNETTET. Uten det vektes kandidatverdenene bare etter budet, og
   * ingenting av hvordan de andre har SPILT teller. Målt 5. august: +2,62 pp
   * bedre verdenskvalitet ved 32 kandidater (men bare +0,68 ved 3, fordi
   * importance sampling kun kan velge blant det som faktisk ble trukket).
   */
  readonly trosnett?: { fordeling(trekk: Float32Array): number[][] } | null;
  /** Kandidatverdener troen får velge mellom. Uten troen uten mening. */
  readonly verdenKandidater?: number;
  /**
   * FLERE FORTSETTELSER (Brown & Sandholm). Med én rollout-policy antar
   * evalueringen at de andre spiller nøyaktig slik — skjevt og utnyttbart.
   * Tom liste = bruk `motpart` alene, altså den gamle formen.
   */
  readonly fortsettelser?: readonly Utspiller[];
  readonly fortsKombi?: "min" | "snitt" | "cfr";
}

/** Setets rolle i den gjeldende runden, eller null hvis den ikke er avgjort. */
export function rolleFor(state: GameState, sete: number): Rolle | null {
  if (state.budvinner === null) return null;
  if (sete === state.budvinner) return "foerer";
  if (state.makker === sete) return "makker";
  return "forsvar";
}

export class Rolleorakel {
  private readonly indre: { velgHandling(s: GameState): Handling; nyKamp(): void };
  private readonly motpart: Utspiller;
  private readonly rolle: Rolle;
  private readonly verdener: number;
  private readonly rng: () => number;
  private readonly trosnett: { fordeling(trekk: Float32Array): number[][] } | null;
  private readonly verdenKandidater: number;
  private readonly fortsettelser: readonly Utspiller[];
  private readonly fortsKombi: "min" | "snitt" | "cfr";

  constructor(
    indre: { velgHandling(s: GameState): Handling; nyKamp(): void },
    motpart: Utspiller,
    rolle: Rolle,
    opts: RolleorakelOpts = {},
  ) {
    this.indre = indre;
    this.motpart = motpart;
    this.rolle = rolle;
    this.verdener = opts.verdener ?? 12;
    this.trosnett = opts.trosnett ?? null;
    this.verdenKandidater = opts.verdenKandidater ?? (opts.trosnett ? 32 : 3);
    this.fortsettelser = opts.fortsettelser ?? [];
    this.fortsKombi = opts.fortsKombi ?? "cfr";
    // SEEDET. Uten det er to kjøringer av samme måling ikke sammenlignbare,
    // og en parret benk mister nettopp det parringen er til for.
    this.rng = lagRng(opts.frø ?? 20_260_803);
  }

  nyKamp(): void {
    this.indre.nyKamp();
  }

  /** Videresender bokføringskroken (12. sep) — se `Budagent.observer`. */
  observer(state: GameState): void {
    (this.indre as { observer?(s: GameState): void }).observer?.(state);
  }

  velgHandling(state: GameState): Handling {
    if (state.fase === "SPILL" && state.iTur !== null) {
      const sete = state.iTur;
      if (rolleFor(state, sete) === this.rolle && lovligeKort(state, sete).length >= 2) {
        const kort = besteKortSD(
          state,
          sete,
          this.fortsettelser.length > 0 ? this.fortsettelser : this.motpart,
          {
            verdener: this.verdener,
            rng: this.rng,
            trovekt:
              this.trosnett === null ? undefined : (lagTrovekt(this.trosnett, state, sete) ?? undefined),
            verdenKandidater: this.verdenKandidater,
            fortsKombi: this.fortsKombi,
          },
        );
        // `besteKortSD` gir null om ingen verden lot seg trekke. Da skal det
        // indre valget stå – ikke et vilkårlig kort, som ville blandet
        // orakelets vurdering med en tilfeldighet og gjort målingen uleselig.
        if (kort !== null) return { type: "SPILL", spiller: sete, kort };
      }
    }
    return this.indre.velgHandling(state);
  }
}
