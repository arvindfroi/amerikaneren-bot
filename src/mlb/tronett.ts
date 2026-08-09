/**
 * MLB-TROHODET som kjørbart nett.
 *
 * 52 × 4 utganger: relativt sete 1, 2, 3 — og TALONGEN. Softmax gjøres her og
 * ikke i nettet, av samme grunn som i `moe2/trosnett.ts`: rå logits er lettere
 * å feilsøke, og normaliseringen hører til der den brukes.
 *
 * BREDDEN HÅNDHEVES. Et nett med feil form ville gitt tause søppelvekter i
 * stedet for en feilmelding, og en skjev fordeling er nesten usynlig i
 * statistikken — den ser bare ut som at troen er litt dårligere.
 *
 * ===================== HVA SOM SKILLER DEN FRA DAGENS TRO ===============
 *
 * Dagens tro (`monteTro`) er et MONTE-CARLO-ESTIMAT: den trekker V verdener og
 * teller. Log-tap straffer den variansen systematisk (Jensen), og §117 målte at
 * underskuddet mot `gulv+` kollapser med V: −0,0840 ved V=16, −0,0191 ved V=64,
 * −0,0053 ved V=256.
 *
 * Et nett har ingen slik straff. Det gir ÉN glatt fordeling per stilling, og
 * kvantiseringen til multipler av 1/V finnes ikke. Det er hele hypotesen i
 * fase 0a.
 */

import { forover, nettFraBytes, type NevroNett } from "../nevro/nett.ts";
import { MLB_TRO_INN, MLB_TRO_KLASSER, MLB_TRO_KORT, MLB_TRO_UT } from "./trotrekk.ts";

export class MlbTronett {
  private readonly nett: NevroNett;

  constructor(nett: NevroNett) {
    const første = nett.lag[0];
    const siste = nett.lag[nett.lag.length - 1];
    if (første === undefined || siste === undefined) throw new Error("MLB-trohodet: tomt nett");
    if (første.inn !== MLB_TRO_INN) {
      throw new Error(`MLB-trohodet tar ${MLB_TRO_INN} trekk, nettet har ${første.inn}`);
    }
    if (siste.ut !== MLB_TRO_UT) {
      throw new Error(`MLB-trohodet må ha ${MLB_TRO_UT} utganger, nettet har ${siste.ut}`);
    }
    this.nett = nett;
  }

  static fraBytes(bytes: Uint8Array): MlbTronett {
    const nett = nettFraBytes(bytes)[0];
    if (nett === undefined) throw new Error("Tomme vekter i MLB-trohodet");
    return new MlbTronett(nett);
  }

  /** → `p[kort][klasse]`, normalisert per kort over de fire klassene. */
  fordeling(trekk: Float32Array): number[][] {
    if (trekk.length !== MLB_TRO_INN) {
      throw new Error(`MLB-trohodet ventet ${MLB_TRO_INN} trekk, fikk ${trekk.length}`);
    }
    const rå = forover(this.nett, trekk);
    const ut: number[][] = [];
    for (let k = 0; k < MLB_TRO_KORT; k++) {
      const b = k * MLB_TRO_KLASSER;
      let maks = -Infinity;
      for (let c = 0; c < MLB_TRO_KLASSER; c++) maks = Math.max(maks, rå[b + c] ?? 0);
      let sum = 0;
      const rad = new Array<number>(MLB_TRO_KLASSER);
      for (let c = 0; c < MLB_TRO_KLASSER; c++) {
        const e = Math.exp((rå[b + c] ?? 0) - maks);
        rad[c] = e;
        sum += e;
      }
      for (let c = 0; c < MLB_TRO_KLASSER; c++) rad[c]! /= sum;
      ut.push(rad);
    }
    return ut;
  }
}
