/**
 * ANGER SOM SELEKSJONSKRITERIUM.
 *
 * HVORFOR BYTTE FRA POENG. Poengfitnessen har en parret standardfeil paa 3,05
 * ved 16 runder, mens den typiske forskjellen mellom to genom er 1,37 - den
 * rangerer riktig i 67 % av tilfellene, saa vidt over myntkast. Maalt paa en
 * fersk populasjon paa 48 fantes det hele tiden genom med anger 0,87-0,94 mot
 * medianens 1,04, uten at fitnessen fant dem: fitness-vinnerens anger sprang
 * 0,919-1,089 uten retning.
 *
 * Anger maales derimot paa forhaandsloeste stillinger med kjent orakelverdi.
 * Den er DETERMINISTISK - samme genom gir samme tall hver gang - saa
 * giverstoeyen forsvinner helt. Holdout-testen: valg paa halvdel A ga 0,8777
 * paa halvdel B mot medianens 0,9282, altsaa en ekte gevinst paa 0,050 uten
 * optimisme.
 *
 * FAREN, OG DEN ER DEN SAMME SOM FOER. Et FAST stillingsutvalg gjoer «beste
 * noensinne» til «best tilpasset akkurat de stillingene». Derfor roterer
 * treningsvinduet hver generasjon, og en egen halvdel holdes HELT utenfor
 * seleksjonen og brukes bare til rapportering. Uten det ville vi gjentatt
 * feilen fra det faste froesettet i ny drakt.
 */

import { lesBenk, type Benkstilling } from "./angerbenk.ts";
import { Nettverk } from "./nett.ts";
import { UT_KORT } from "./trekk.ts";
import type { Genom } from "./genom.ts";
import { forover } from "../nevro/nett.ts";
import { nevroHjerne } from "../nevro/index.ts";

export interface Angerbenk {
  /** Stillinger seleksjonen faar bruke. */
  readonly trening: Benkstilling[];
  /** Stillinger seleksjonen ALDRI ser – bare rapportering. */
  readonly holdout: Benkstilling[];
}

/**
 * Leser benken og deler den i to. Delingen er annenhver stilling, ikke et
 * rett snitt: benken er sortert paa stikk, saa to sammenhengende halvdeler
 * ville hatt ulik vanskegrad. Maalt paa e1-frys ga et rett snitt median 1,03
 * mot 0,93 - det er stoerre enn hele effekten vi jakter.
 */
export function lesAngerbenk(mappe = "e1-frys", antall = 8000): Angerbenk {
  const alle = lesBenk(mappe, antall, 1).filter(
    (b) => b.nt !== undefined && Object.keys(b.v).length >= 2,
  );
  return {
    trening: alle.filter((_, i) => i % 2 === 0),
    holdout: alle.filter((_, i) => i % 2 === 1),
  };
}

/** Snittanger for ett genom over et stillingsutvalg. Lavere er bedre. */
export function anger(g: Genom, sett: readonly Benkstilling[]): number {
  const nett = new Nettverk(g);
  let sum = 0;
  for (const b of sett) {
    const ut = nett.aktiver([...b.nt!]);
    let beste = -Infinity;
    let valgt = -1;
    for (const k of Object.keys(b.v)) {
      const o = ut[UT_KORT + Number(k)]!;
      if (o > beste) {
        beste = o;
        valgt = Number(k);
      }
    }
    let maks = -Infinity;
    for (const v of Object.values(b.v)) if (v > maks) maks = v;
    sum += maks - (b.v[String(valgt)] ?? 0);
  }
  return sum / (sett.length || 1);
}

/**
 * Treningsvinduet for generasjon `gen`: et roterende utsnitt av
 * treningshalvdelen. Vinduet flyttes med halve bredden per generasjon, saa
 * paafoelgende generasjoner overlapper - da er forelder og barn nesten
 * sammenlignbare, mens et genom ikke kan leve paa ett fast utvalg over tid.
 */
export function vindu(
  benk: Angerbenk,
  gen: number,
  bredde: number,
): readonly Benkstilling[] {
  const n = benk.trening.length;
  if (bredde >= n) return benk.trening;
  const start = Math.floor((gen * bredde) / 2) % n;
  const ut: Benkstilling[] = [];
  for (let i = 0; i < bredde; i++) ut.push(benk.trening[(start + i) % n]!);
  return ut;
}

/** Gulvet: forventet anger ved uniformt lovlig valg. Referansen alt maales mot. */
export function gulv(sett: readonly Benkstilling[]): number {
  let sum = 0;
  for (const b of sett) {
    const v = Object.values(b.v);
    let maks = -Infinity;
    let s = 0;
    for (const x of v) {
      if (x > maks) maks = x;
      s += x;
    }
    sum += maks - s / v.length;
  }
  return sum / (sett.length || 1);
}

/**
 * NevroHjernes anger paa samme utvalg.
 *
 * Dette maa maales SAMMEN med genomets tall, aldri hentes fra en annen
 * kjoering. Benken er ikke homogen: nevro maaler 0,9431 paa de foerste 2000
 * stillingene, 0,8848 paa annenhver og 0,8615 over 4000. Aa laane et tall paa
 * tvers av utvalg er samme feil som gjorde D7-kurven verdiloes.
 */
export function nevroAnger(sett: readonly Benkstilling[]): number {
  const hjerne = nevroHjerne();
  let sum = 0;
  for (const b of sett) {
    // Nevros spillnett tar de 238 foerste trekkene i E1-vektoren `t`.
    const logits = forover(hjerne.spill, Float32Array.from(b.t.slice(0, 238)));
    const lovlige = Object.keys(b.v).map(Number);
    let beste = lovlige[0]!;
    for (const k of lovlige) if (logits[k]! > logits[beste]!) beste = k;
    let maks = -Infinity;
    for (const v of Object.values(b.v)) if (v > maks) maks = v;
    sum += maks - (b.v[String(beste)] ?? 0);
  }
  return sum / (sett.length || 1);
}
