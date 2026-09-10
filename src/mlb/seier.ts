/**
 * SEIERSMÅLET — kampseier som belønning, ikke poeng.
 *
 * ===================== HVORFOR (funnet 10. september) ======================
 *
 * MLB ble trent mot `G_t = sluttpoeng[sete] − poengFør`: POENG. Men K1 dømmes
 * i KAMPER til 100, og en kamp vinnes av den som først når målet — ikke av den
 * som samler flest poeng i snitt. Et poengmål er risikonøytralt: 10 poeng er
 * like mye verdt 5 poeng fra mål som 80 poeng fra mål, og en spiller langt bak
 * får ingen grunn til å ta større sjanser. Kravbatteriet målte nettopp det på
 * e12: bak tok nettet MINDRE risiko (V(bak) lavere i 129 av 360, K5 «nei").
 * `fasit.vinner` fantes hele tiden og ble aldri lest.
 *
 * ===================== FORMEN: GLOBAL REWARD PREDICTION ====================
 *
 * Suphx (Mahjong, 2020) sto overfor samme problem: mange runder, ett utfall.
 * Å gi bare kampslutt som belønning ville spredt krediten over ~680
 * beslutninger. Løsningen er en PREDIKTOR `P(seier | poengtavla, målet)`,
 * lært av ferdigspilte kamper, og belønningen per runde blir ENDRINGEN i den:
 *
 *     r_runde = SKALA · ( P(tavla etter runden) − P(tavla før runden) )
 *
 * Summen teleskoperer til `SKALA · (1[vant] − P(start))`, så målet er fortsatt
 * kampseier — men krediten havner i runden som flyttet sjansen, og en runde som
 * gir +10 poeng er verdt mer når den avgjør kampen enn når den ikke gjør det.
 *
 * ===================== HVORDAN DET KOBLES INN: ÉN AVBILDNING ===============
 *
 * Alle fire målfunksjonene i `selvspill.ts` (`tdFordel`, `gaeFordel`,
 * `diskontertRetur`, `delteRetur`) leser poeng på nøyaktig to steder:
 * `rad.poengFør` og `fasit.sluttpoeng`. `somSeiersmål` bytter ut de to med
 * vinnersjanse i prosentpoeng, og ALT annet — γ, λ, runde/hale-delingen og
 * identiteten `Gr + Gh = G` — er uendret og fortsatt håndhevet av de samme
 * testene. Ingen ny γ, ingen ny kode i målfunksjonene: to kopier av samme
 * regnestykke er feilklassen §123 punkt 1.
 *
 * Poeng faller bare ved rundeslutt, så `poengAlleFør` er konstant innenfor en
 * runde, og `P` er det også: `r = 0` inne i runden, akkurat som med poeng.
 *
 * K2: prediktoren leser bare poengtavla og målet — offentlig informasjon — og
 * den brukes bare til ETIKETTER i treningen, aldri som inngang i et valg.
 */

import { readFileSync } from "node:fs";
import { forover, nettFraBytes, type NevroNett } from "../nevro/nett.ts";
import type { Beslutningsrad, Kampfasit } from "./selvspill.ts";

/** Prediktoren er laget for fire seter, og det håndheves. */
export const SEIER_SETER = 4;
/** Innganger: avstand til mål ×4, andel av mål ×4, målet selv. */
export const SEIER_INN = 2 * SEIER_SETER + 1;
/** Utganger: én logit per sete, ROTERT så plass 0 er setet selv. */
export const SEIER_UT = SEIER_SETER;
/**
 * Belønningen i PROSENTPOENG vinnersjanse. Et rundeutfall i poeng har spredning
 * ~10–20; ΔP·100 havner i samme størrelsesorden, så verdihodenes tapsvekter og
 * `verdi_skala` i treneren trenger ikke skrus på.
 */
export const SEIER_SKALA = 100;

/**
 * INNGANGEN, sett fra `sete`. Samme formel står i `verktoy/seier-tren.py`
 * (`trekk`), og `examples/seier-paritet.ts` sammenliknet de to på fila treneren
 * skrev — en inngang som er regnet ulikt på to sider feiler ikke, den bare
 * spår feil.
 *
 * Rekkefølgen er ROTERT: plass j er setet `(sete + j) mod 4`, så nettet ser
 * alltid seg selv først og de andre i spillerekkefølge.
 */
export function seierTrekk(poeng: readonly number[], sete: number, målPoeng: number): Float32Array {
  if (poeng.length !== SEIER_SETER) {
    throw new Error(`Seiersprediktoren er laget for ${SEIER_SETER} seter, tavla har ${poeng.length}`);
  }
  if (!(målPoeng > 0)) throw new Error(`målPoeng må være positivt, fikk ${målPoeng}`);
  const x = new Float32Array(SEIER_INN);
  for (let j = 0; j < SEIER_SETER; j++) {
    const p = poeng[(sete + j) % SEIER_SETER]!;
    x[j] = Math.min(3, Math.max(-1, (målPoeng - p) / 100));
    x[SEIER_SETER + j] = Math.min(1.5, Math.max(-3, p / målPoeng));
  }
  x[2 * SEIER_SETER] = målPoeng / 100;
  return x;
}

export class Seiersprediktor {
  private readonly nett: NevroNett;

  constructor(nett: NevroNett) {
    const første = nett.lag[0];
    const siste = nett.lag[nett.lag.length - 1];
    if (første === undefined || siste === undefined) throw new Error("Seiersprediktoren er tom");
    if (første.inn !== SEIER_INN) {
      throw new Error(`Seiersprediktoren tar ${SEIER_INN} inn, fila har ${første.inn}`);
    }
    if (siste.ut !== SEIER_UT) {
      throw new Error(`Seiersprediktoren gir ${SEIER_UT} ut, fila har ${siste.ut}`);
    }
    this.nett = nett;
  }

  static fraBytes(b: Uint8Array): Seiersprediktor {
    const deler = nettFraBytes(b);
    if (deler.length !== 1) throw new Error(`Seiersprediktoren er ÉN del, fila har ${deler.length}`);
    return new Seiersprediktor(deler[0]!);
  }

  static fraFil(sti: string): Seiersprediktor {
    return Seiersprediktor.fraBytes(readFileSync(sti));
  }

  /** Fordelingen over hvem som vinner, ROTERT fra `sete` (plass 0 = setet selv). */
  fordeling(poeng: readonly number[], sete: number, målPoeng: number): Float64Array {
    const z = forover(this.nett, seierTrekk(poeng, sete, målPoeng));
    let maks = -Infinity;
    for (let i = 0; i < z.length; i++) maks = Math.max(maks, z[i]!);
    const ut = new Float64Array(z.length);
    let sum = 0;
    for (let i = 0; i < z.length; i++) {
      ut[i] = Math.exp(z[i]! - maks);
      sum += ut[i]!;
    }
    for (let i = 0; i < ut.length; i++) ut[i]! /= sum;
    return ut;
  }

  /** `P(sete vinner kampen)` gitt tavla før neste runde. */
  sjanse(poeng: readonly number[], sete: number, målPoeng: number): number {
    return this.fordeling(poeng, sete, målPoeng)[0]!;
  }
}

/** Det avbildningen trenger — et grensesnitt, så testene kan plante en kjent funksjon. */
export type Sjanse = (poeng: readonly number[], sete: number, målPoeng: number) => number;

/**
 * BYTT POENG MOT VINNERSJANSE i radene og fasiten — se filhodet.
 *
 *     poengFør'           = SKALA · P(poengAlleFør, sete, målPoeng)
 *     sluttpoeng'[sete]   = SKALA · 1[sete = vinner]
 *
 * Returnerer NYE objekter; radene inn er urørt (`trekk`/`maske`/`troFasit`
 * deles, de er ikke poeng). `nesteISete` er indekser og gjelder uendret.
 *
 * En AVBRUTT kamp har en vinner per definisjon (lederen, `kjørKamp`), så den
 * får samme behandling som en ferdigspilt.
 */
export function somSeiersmål(
  rader: readonly Beslutningsrad[],
  fasit: Kampfasit,
  sjanse: Sjanse,
): { readonly rader: Beslutningsrad[]; readonly fasit: Kampfasit } {
  const hurtig = new Map<number, number>();
  const ut: Beslutningsrad[] = new Array(rader.length);
  for (let i = 0; i < rader.length; i++) {
    const rad = rader[i]!;
    if (rad.poengAlleFør[rad.sete] !== rad.poengFør) {
      throw new Error(
        `Rad ${i}: poengAlleFør[${rad.sete}] = ${String(rad.poengAlleFør[rad.sete])} ` +
          `men poengFør = ${rad.poengFør} — tavla og setet er uenige`,
      );
    }
    // Tavla er konstant innenfor en runde, så (runde, sete) er nøkkelen.
    const nøkkel = rad.rundeNr * 16 + rad.sete;
    let p = hurtig.get(nøkkel);
    if (p === undefined) {
      p = SEIER_SKALA * sjanse(rad.poengAlleFør, rad.sete, fasit.målPoeng);
      hurtig.set(nøkkel, p);
    }
    ut[i] = { ...rad, poengFør: p };
  }
  const sluttpoeng = fasit.sluttpoeng.map((_, s) => (s === fasit.vinner ? SEIER_SKALA : 0));
  return { rader: ut, fasit: { ...fasit, sluttpoeng } };
}
