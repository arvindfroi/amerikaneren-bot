/**
 * ROLLERUTEREN — ett kortnett per rolle (11. sep).
 *
 * `d7par1` (kortnettet finjustert på etiketter fra søket med MLB-trohodet) målte i gate 2
 * +0,065 ± 0,021 poeng per runde som MAKKER (+3,1 SE), men −0,082 i forsvar og −0,118 som
 * fører — samlet −0,054. Et nett som er bedre i én rolle og verre i to, skal ikke erstatte
 * standardnettet; det skal spille den rollen det er bedre i.
 *
 * `Rolleruter` sender hvert kortvalg (og hver `scorer`-forespørsel) til nettet for setets
 * rolle, og alt annet — bud, vrak, trumf, etterlysning — til standardnettet. Uten roller er
 * den nøyaktig standardagenten, og `test/rolleruter.test.ts` krever det bit for bit.
 *
 * K2: rollen er setets EGEN rolle. Makkeren vet at hun er makker (hun har det etterlyste
 * kortet); en forsvarer vet at hun ikke er det. Prøven bytter de andres hender og krever
 * samme valg.
 *
 * GRENSE: bare for kjeder der laget over leser `velgHandling` og `scorer` (vakt → e1). Nett
 * med sanseblokk (bredde ≥ 558) trenger en tro og avvises av speken.
 */

import type { GameState, Handling } from "../motor.ts";
import { rolleFor, type Rolle } from "./rolleorakel.ts";

/** Det ruteren trenger av et kortnett — `E1Agent` oppfyller det. */
export interface Kortagent {
  velgHandling(state: GameState): Handling;
  scorer(state: GameState, sete: number): Map<number, number>;
  nyKamp(): void;
}

export class Rolleruter {
  private readonly standard: Kortagent;
  private readonly perRolle: ReadonlyMap<Rolle, Kortagent>;

  constructor(standard: Kortagent, perRolle: ReadonlyMap<Rolle, Kortagent> = new Map()) {
    this.standard = standard;
    this.perRolle = perRolle;
  }

  /** Nettet for `sete` i denne stillingen. Ukjent rolle (før VELG) → standard. */
  private nettFor(state: GameState, sete: number): Kortagent {
    if (this.perRolle.size === 0) return this.standard;
    const r = rolleFor(state, sete);
    return (r === null ? undefined : this.perRolle.get(r)) ?? this.standard;
  }

  nyKamp(): void {
    this.standard.nyKamp();
    for (const a of new Set(this.perRolle.values())) if (a !== this.standard) a.nyKamp();
  }

  velgHandling(state: GameState): Handling {
    if (state.fase === "SPILL" && state.iTur !== null) return this.nettFor(state, state.iTur).velgHandling(state);
    return this.standard.velgHandling(state);
  }

  scorer(state: GameState, sete: number): Map<number, number> {
    return this.nettFor(state, sete).scorer(state, sete);
  }
}
