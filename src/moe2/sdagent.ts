/**
 * SD-POLICYEN SOM AGENT: kortspillet avgjøres av `besteKortSD`, alt annet av
 * NevroHjerne.
 *
 * HVORFOR DEN FINNES. SD-evalueringen har hittil bare vært en FASIT-generator –
 * den kjøres i `examples/sd-orakel.ts`, verdiene destilleres til et nett, og
 * det er nettet som måles. Men da måles læreren aldri direkte, og spørsmålet
 * «hvilken motstandermodell bør SD bruke?» kan ikke besvares uten å gå veien om
 * en hel treningsrunde. Denne klassen gjør SD til en spiller, så to
 * motstandermodeller kan settes rett mot hverandre på en poengbenk.
 *
 * MOTSTANDERMODELLEN (`motpart`) er hele poenget. Den spiller ut verdenene inne
 * i evalueringen, i ALLE fire seter. Til nå har det alltid vært NevroHjerne –
 * fordi det var konfigurasjonen SD-fasiten ble validert med (+0,718 gjennom
 * godkjenningsporten). Men vi spiller mot MesterAI, ikke mot NevroHjerne, og
 * de to spiller målbart forskjellig. Se `examples/mester-orakel.ts`.
 *
 * MERK at `motpart` og MILJØET er to ulike ting. `motpart` er modellen SD
 * FORESTILLER seg at motstanderne bruker; miljøet er hvem som faktisk sitter
 * ved bordet. Er de like, er policyen korrekt spesifisert – og det er nettopp
 * derfor en måling der begge er NevroHjerne ikke kan avgjøre noe: den er rigget
 * i nevro-modellens favør.
 */

import { lagRng } from "../kort.ts";
import { lovligeKort, type GameState, type Handling } from "../motor.ts";
import { E1Agent } from "../e1/nett.ts";
import { NevroAgent } from "../nevro/index.ts";
import { MesterKlone } from "./mesterklone.ts";
import { besteKortSD, type Utspiller } from "./sdkort.ts";

export interface SDAgentOpts {
  /** Verdener per kortvalg. 12 er det målte nivået – se sd-orakel.ts. */
  readonly verdener?: number;
  /** Frø for verdenstrekningen, så en måling kan gjentas. */
  readonly frø?: number;
  /** Bruk SD først fra dette stikket; tidligere stikk spilles av NevroHjerne. */
  readonly fraStikk?: number;
}

/**
 * En motstandermodell fra en kommandolinjestreng.
 *
 *   `nevro`           – NevroHjerne, dagens standard
 *   `e1:<vektfil>`    – et E1-nett (273 trekk)
 *   `klone:<vektfil>` – MesterAI-klonen (325 trekk: E1 + NevroHjernes valg)
 */
export function lagMotpart(spek: string): Utspiller {
  if (spek === "nevro") return new NevroAgent();
  if (spek.startsWith("klone:")) return MesterKlone.fraFil(spek.slice(6));
  if (spek.startsWith("e1:")) return E1Agent.fraFil(spek.slice(3));
  throw new Error(
    `Ukjent motstandermodell «${spek}» (bruk nevro, e1:<vektfil> eller klone:<vektfil>)`,
  );
}

export class SDAgent {
  private readonly motpart: Utspiller;
  private readonly nevro = new NevroAgent();
  private readonly verdener: number;
  private readonly fraStikk: number;
  private rng: () => number;
  private readonly frø: number;

  constructor(motpart: Utspiller, opts: SDAgentOpts = {}) {
    this.motpart = motpart;
    this.verdener = opts.verdener ?? 12;
    this.fraStikk = opts.fraStikk ?? 0;
    this.frø = (opts.frø ?? 20260726) >>> 0;
    this.rng = lagRng(this.frø);
  }

  nyKamp(): void {
    this.nevro.nyKamp();
    // Frøet settes tilbake, så to kandidater som møter samme giver trekker de
    // samme verdenene. Uten det ville differansen mellom to motstandermodeller
    // vært dominert av hvilke hender som tilfeldigvis ble samplet.
    this.rng = lagRng(this.frø);
  }

  velgHandling(state: GameState): Handling {
    if (state.fase === "SPILL" && state.iTur !== null && state.stikkSpilt >= this.fraStikk) {
      const sete = state.iTur;
      // Ett lovlig kort: hopp over evalueringen. Tolv utspillinger for å
      // «velge» der det ikke finnes noe valg er ren bortkastet tid, og i en
      // arena mot MesterAI er tid det knappeste vi har.
      const lovlige = lovligeKort(state, sete);
      if (lovlige.length === 1) return { type: "SPILL", spiller: sete, kort: lovlige[0]! };
      const kort = besteKortSD(state, sete, this.motpart, { verdener: this.verdener, rng: this.rng });
      // null = ingen verden lot seg trekke. Da skal vi IKKE gjette: NevroHjerne
      // overtar, som i godkjenningsporten.
      if (kort !== null) return { type: "SPILL", spiller: sete, kort };
    }
    return this.nevro.velgHandling(state);
  }
}
