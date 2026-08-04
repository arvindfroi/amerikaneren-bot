/**
 * TROSNETTET: hvor ligger hvert usette kort?
 *
 * Tar de 470 offentlige trekkene og gir, for hvert av de 52 kortene, en
 * fordeling over fire plasseringer: relativt sete 1, 2, 3, eller dødt (i
 * vraket). Trent av `verktoy/tro-tren.py` på fasit som er GRATIS – ved
 * rundeslutt vet vi hvor hvert kort lå.
 *
 * MÅLT på 1,6 millioner rader, holdout delt på giv:
 *
 *   kapasitetsreferansen   31,5 %      (alt en perfekt teller kan få til)
 *   trosnettet             46,6 %
 *   trosnettet, honnører   50,2 %
 *
 * Over halvparten på honnørene: modellen er oftere rett enn gal om hvor et ess
 * ligger. Det er dét som avgjør stikk.
 *
 * ========================== HVA DEN SKAL BRUKES TIL =======================
 *
 * IKKE til søk ved spilletid. Adams er et rent framoverkoblet nett og skal
 * fortsatt svare umiddelbart.
 *
 * Den skal inn i SD-ORAKELETS verdenstrekker. Orakelet vekter i dag verdener
 * bare etter BUDET (`budForenlighet`) og ikke etter hvordan folk har spilt.
 * Er verdenene urepresentative, er ETIKETTENE skjeve – og da hjelper ingen
 * mengde trening nedstrøms. Bedre tro gir bedre verdener gir bedre etiketter,
 * uten et eneste millisekund ekstra ved spilletid.
 *
 * =========================== BREDDEN HÅNDHEVES ============================
 *
 * 470 inn og 208 ut. Et nett med feil form ville gitt tause søppelvekter i
 * stedet for en feilmelding, og en skjev verdensfordeling er nesten usynlig i
 * statistikken – den ser bare ut som at orakelet er litt dårligere.
 */

import { forover, type NevroNett } from "../nevro/nett.ts";

export const TRO_INN = 470;
export const TRO_KORT = 52;
/** rel sete 1, 2, 3, dødt. */
export const TRO_KLASSER = 4;
export const TRO_UT = TRO_KORT * TRO_KLASSER;

export class Trosnett {
  private readonly nett: NevroNett;

  constructor(nett: NevroNett) {
    const første = nett.lag[0]!;
    const siste = nett.lag[nett.lag.length - 1]!;
    if (første.inn !== TRO_INN) {
      throw new Error(`Trosnettet tar ${TRO_INN} trekk, nettet har ${første.inn}`);
    }
    if (siste.ut !== TRO_UT) {
      throw new Error(`Trosnettet må ha ${TRO_UT} utganger, nettet har ${siste.ut}`);
    }
    this.nett = nett;
  }

  /**
   * → `p[kort][klasse]`, normalisert per kort.
   *
   * Softmax gjøres her og ikke i nettet, av samme grunn som ellers i dette
   * prosjektet: rå logits er lettere å feilsøke, og normaliseringen hører til
   * der den brukes.
   */
  fordeling(trekk: Float32Array): number[][] {
    if (trekk.length !== TRO_INN) {
      throw new Error(`Trosnettet ventet ${TRO_INN} trekk, fikk ${trekk.length}`);
    }
    const rå = forover(this.nett, trekk);
    const ut: number[][] = [];
    for (let k = 0; k < TRO_KORT; k++) {
      const b = k * TRO_KLASSER;
      let maks = -Infinity;
      for (let c = 0; c < TRO_KLASSER; c++) maks = Math.max(maks, rå[b + c] ?? 0);
      let sum = 0;
      const rad = new Array<number>(TRO_KLASSER);
      for (let c = 0; c < TRO_KLASSER; c++) {
        const e = Math.exp((rå[b + c] ?? 0) - maks);
        rad[c] = e;
        sum += e;
      }
      for (let c = 0; c < TRO_KLASSER; c++) rad[c]! /= sum;
      ut.push(rad);
    }
    return ut;
  }

  /**
   * Log-sannsynligheten for at en verden er den ekte, under troen.
   *
   * `plassering[kort]` er 1–3 for relativt sete, 4 for dødt, 0 for «sett».
   * Sette kort hoppes over: de er ikke gjetning, og å ta dem med ville gjort
   * alle verdener like mye mer sannsynlige uten å skille dem.
   */
  logVekt(fordeling: number[][], plassering: readonly number[]): number {
    let s = 0;
    for (let k = 0; k < TRO_KORT; k++) {
      const p = plassering[k] ?? 0;
      if (p <= 0) continue;
      s += Math.log(Math.max(1e-9, fordeling[k]![p - 1]!));
    }
    return s;
  }
}
