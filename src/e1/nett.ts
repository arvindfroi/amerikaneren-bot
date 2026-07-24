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

export class E1Agent {
  private readonly nett: NevroNett;
  private readonly nevro: NevroAgent;

  constructor(nett: NevroNett, nevro: NevroAgent = new NevroAgent()) {
    this.nett = nett;
    this.nevro = nevro;
  }

  static fraFil(fil: string): E1Agent {
    return new E1Agent(lesE1Nett(fil));
  }

  nyKamp(): void {
    this.nevro.nyKamp();
  }

  velgHandling(state: GameState): Handling {
    if (state.fase === "SPILL" && state.iTur !== null) {
      return { type: "SPILL", spiller: state.iTur, kort: this.velgKort(state, state.iTur) };
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
