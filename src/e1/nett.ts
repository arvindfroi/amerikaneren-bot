/**
 * E1-spilleren: kortspillet avgjøres av det GPU-trente nettet, resten av
 * spillet av NevroHjerne.
 *
 * Det er et bevisst forsøksdesign, ikke en snarvei: budrunde, vraking og
 * trumfvalg holdes IDENTISKE med NevroHjerne, så en målt forskjell mellom
 * E1 og NevroHjerne kan bare komme fra kortspillet. Budnettet er neste
 * byggetrinn, og skal måles på samme måte.
 *
 * NB: denne modulen leser vektfilen fra disk og er derfor Node-only –
 * i motsetning til src/nevro/, som er ren og kjører i nettleser også.
 */

import { readFileSync } from "node:fs";

import type { Kort } from "../kort.ts";
import { lovligeKort, type GameState, type Handling } from "../motor.ts";
import { velgHandling as pimcVelg } from "../bot/bot.ts";
import { forover, nettFraBytes, type NevroNett } from "../nevro/nett.ts";
import { kortIndeks, NevroAgent } from "../nevro/index.ts";
import { e1SpillTrekk, E1_SPILL_DIM } from "./trekk.ts";

export function lesE1Nett(fil: string): NevroNett {
  const bytes = new Uint8Array(readFileSync(fil));
  const nett = nettFraBytes(bytes);
  if (nett.length !== 1) throw new Error(`E1: forventet ett nett i ${fil}, fikk ${nett.length}`);
  const første = nett[0]!.lag[0]!;
  if (første.inn !== E1_SPILL_DIM) {
    throw new Error(`E1: nettet tar ${første.inn} trekk, men trekkuttrekket gir ${E1_SPILL_DIM}`);
  }
  const siste = nett[0]!.lag[nett[0]!.lag.length - 1]!;
  if (siste.ut !== 52) throw new Error(`E1: siste lag har ${siste.ut} utganger, forventet 52`);
  return nett[0]!;
}

/** Faser E1 kan sette bort til PIMC-søket i stedet for NevroHjerne. */
export type SøkeFase = "VRAK" | "VELG";

export interface E1Opts {
  /**
   * Faser der PIMC-søket overtar. NevroHjernes trumfvalg er en HÅNDLAGD
   * formel (estimerStikk), ikke et nett og ikke et søk – og fasedelingen på
   * D1 viste at trumfvalget er den dyreste enkeltbeslutningen i spillet
   * (32,4 ± 3,0 poeng/kamp). Da er det verdt å måle om søk slår formelen.
   */
  readonly søkFaser?: readonly SøkeFase[];
  /** Verdener PIMC får per beslutning i de lånte fasene. */
  readonly søkVerdener?: number;
}

export class E1Agent {
  private readonly nett: NevroNett;
  private readonly nevro: NevroAgent;
  private readonly søkFaser: readonly SøkeFase[];
  private readonly søkVerdener: number;
  private teller = 0;

  constructor(nett: NevroNett, nevro: NevroAgent = new NevroAgent(), opts: E1Opts = {}) {
    this.nett = nett;
    this.nevro = nevro;
    this.søkFaser = opts.søkFaser ?? [];
    this.søkVerdener = opts.søkVerdener ?? 12;
  }

  static fraFil(fil: string, opts: E1Opts = {}): E1Agent {
    return new E1Agent(lesE1Nett(fil), new NevroAgent(), opts);
  }

  nyKamp(): void {
    this.nevro.nyKamp();
    this.teller = 0;
  }

  velgHandling(state: GameState): Handling {
    if (state.fase === "SPILL" && state.iTur !== null) {
      return { type: "SPILL", spiller: state.iTur, kort: this.velgKort(state, state.iTur) };
    }
    if ((state.fase === "VRAK" || state.fase === "VELG") && this.søkFaser.includes(state.fase)) {
      return pimcVelg(state, {
        verdener: this.søkVerdener,
        terskel: 6,
        frø: (0x9e37 + Math.imul(this.teller++, 0x9e3779b1)) >>> 0,
      });
    }
    return this.nevro.velgHandling(state);
  }

  /** Argmax over LOVLIGE kort – reglene håndheves av motoren, ikke av nettet. */
  velgKort(state: GameState, sete: number): Kort {
    const lovlige = lovligeKort(state, sete);
    if (lovlige.length === 1) return lovlige[0]!;
    const logits = forover(this.nett, e1SpillTrekk(state, sete));
    let beste = lovlige[0]!;
    for (const k of lovlige) if (logits[kortIndeks(k)]! > logits[kortIndeks(beste)]!) beste = k;
    return beste;
  }

  /** Kortene rangert best først – prior til søket (HybridAgent-mønsteret). */
  rangerKort(state: GameState, sete: number, lovlige: readonly Kort[]): Kort[] {
    const logits = forover(this.nett, e1SpillTrekk(state, sete));
    return lovlige.slice().sort((a, b) => logits[kortIndeks(b)]! - logits[kortIndeks(a)]!);
  }
}
