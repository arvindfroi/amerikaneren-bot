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
import { foroverKolonne } from "../nevro/nett-kolonne.ts";
import type { SpillerVisning } from "../motor.ts";
import type { Tempobok } from "./tempotrekk.ts";
import {
  MLB_TRO_BREDDER,
  MLB_TRO_INN,
  MLB_TRO_INN_H,
  MLB_TRO_INN_HS,
  MLB_TRO_INN_HS2,
  MLB_TRO_INN_HS2T,
  MLB_TRO_INN_S,
  MLB_TRO_KLASSER,
  MLB_TRO_KORT,
  MLB_TRO_UT,
  troKolonnekart,
  troTrekkForBredde,
} from "./trotrekk.ts";

/**
 * VARMSTARTEN I TS (11. sep): første lag utvidet fra `nett` sin bredde til `til` etter
 * `troKolonnekart`, nuller i alle nye kolonner, resten av nettet delt. Det samme som
 * `verktoy/mlb-tro-tren.py --vekter` gjør; `test/mlb-sanser2-utvid.test.ts` krever at de
 * to gir byte-identiske filer. Brukt av prøvene og røykprøven, aldri i spill.
 */
export function utvidTronett(nett: NevroNett, til: number): NevroNett {
  const [første, ...resten] = nett.lag;
  if (første === undefined) throw new Error("MLB-trohodet: tomt nett");
  const vekter = new Float32Array(første.ut * til);
  for (const [fra, mål, lengde] of troKolonnekart(første.inn, til)) {
    for (let r = 0; r < første.ut; r++) {
      vekter.set(første.vekter.subarray(r * første.inn + fra, r * første.inn + fra + lengde), r * til + mål);
    }
  }
  return { lag: [{ inn: til, ut: første.ut, vekter, bias: første.bias.slice() }, ...resten] };
}
import { maskerFordeling, type MaskertFordeling } from "./trofakta.ts";

export class MlbTronett {
  private readonly nett: NevroNett;
  /** Se `brukKolonnekjerne`. Av som standard, og av i all måling. */
  private kolonne = false;
  /**
   * `MLB_TRO_INN` (660), `MLB_TRO_INN_H` (804, hukommelse K6 → K8), eller de samme
   * med signalblokken bakerst (776 / 920, K8 kanal 5 og 2).
   */
  readonly innBredde: number;

  constructor(nett: NevroNett) {
    const første = nett.lag[0];
    const siste = nett.lag[nett.lag.length - 1];
    if (første === undefined || siste === undefined) throw new Error("MLB-trohodet: tomt nett");
    if (!MLB_TRO_BREDDER.includes(første.inn)) {
      throw new Error(
        `MLB-trohodet tar ${MLB_TRO_INN} (uten hukommelse), ${MLB_TRO_INN_H} (med), ` +
          `${MLB_TRO_INN_S} eller ${MLB_TRO_INN_HS} (med signalblokk) eller ${MLB_TRO_INN_HS2} (sanser 2) trekk, ` +
          `nettet har ${første.inn}`,
      );
    }
    this.innBredde = første.inn;
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

  /**
   * KOLONNEKJERNEN (`src/nevro/nett-kolonne.ts`): 2,67× raskere på trohodet,
   * men IKKE bit-identisk. Bare for treningsdata (`--rask-kjerne` i
   * `mlb-spill.ts` og `mlb-erfaring.ts`); måling bruker standardstien.
   * Returnerer instansen, så den kan kjedes rett etter `fraBytes`.
   */
  brukKolonnekjerne(): this {
    this.kolonne = true;
    return this;
  }

  /** Leser dette nettet hukommelsen (K6 → K8)? Avgjøres av bredden, ikke av et flagg. */
  get brukerHukommelse(): boolean {
    return (
      this.innBredde === MLB_TRO_INN_H ||
      this.innBredde === MLB_TRO_INN_HS ||
      this.innBredde === MLB_TRO_INN_HS2 ||
      this.innBredde === MLB_TRO_INN_HS2T
    );
  }

  /** Leser dette nettet signalblokken (K8 kanal 5 og 2)? Også avgjort av bredden. */
  get brukerSignal(): boolean {
    return (
      this.innBredde === MLB_TRO_INN_S ||
      this.innBredde === MLB_TRO_INN_HS ||
      this.innBredde === MLB_TRO_INN_HS2 ||
      this.innBredde === MLB_TRO_INN_HS2T
    );
  }

  /** Leser dette nettet sanser 2 (stillingen per sete, valgt bort)? 996 og 1028. */
  get brukerSanser2(): boolean {
    return this.innBredde === MLB_TRO_INN_HS2 || this.innBredde === MLB_TRO_INN_HS2T;
  }

  /** Leser dette nettet tempoblokken (tenketiden til de andre setene)? Bare 1028. */
  get brukerTempo(): boolean {
    return this.innBredde === MLB_TRO_INN_HS2T;
  }

  /**
   * TREKKENE FOR NETTOPP DETTE NETTET, etter bredden: 660 og 804 bit-identisk med før,
   * 776 og 920 med signalblokken bakerst. Alle som bygger trotrekk skal gå gjennom
   * denne, så en ny bredde ikke må huskes på hvert kallsted.
   */
  trekkFor(
    visning: SpillerVisning,
    antallStikk: number,
    målPoeng: number,
    hukommelse: Float64Array | null,
    tempo: Tempobok | null = null,
  ): Float32Array {
    return troTrekkForBredde(this.innBredde, visning, antallStikk, målPoeng, hukommelse, tempo);
  }

  /** Hvilken kjerne som FAKTISK regner — for rapportene, så ingen må gjette. */
  get kjerne(): "rad" | "kolonne" {
    return this.kolonne ? "kolonne" : "rad";
  }

  /** → `p[kort][klasse]`, normalisert per kort over de fire klassene. */
  fordeling(trekk: Float32Array): number[][] {
    if (trekk.length !== this.innBredde) {
      throw new Error(`MLB-trohodet ventet ${this.innBredde} trekk, fikk ${trekk.length}`);
    }
    const rå = this.kolonne ? foroverKolonne(this.nett, trekk) : forover(this.nett, trekk);
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

  /**
   * «VET» OVER «TROR» (K8, 11. sep): `fordeling`, med plasseringene setet VET er umulige
   * nullet og hver usett rad renormalisert (`trofakta.ts`). Opt-in: `fordeling` over er
   * uendret og bit-identisk med før, og det er den treningen og alle gamle rader bruker.
   *
   * `visning` MÅ være den samme som trekkene er bygd av. Faktaene leser bare den, så K2
   * holder av samme grunn som for trekkene: signaturen slipper ikke `GameState` inn.
   */
  fordelingMedFakta(trekk: Float32Array, visning: SpillerVisning): MaskertFordeling {
    return maskerFordeling(this.fordeling(trekk), visning);
  }
}
