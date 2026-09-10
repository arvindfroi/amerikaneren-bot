/**
 * KOLONNEKJERNEN — samme matematikk som `forover`, i en annen summeringsrekkefølge.
 *
 * ================= HVORFOR DEN FINNES ===================================
 *
 * Profilen av MLB-selvspillet 10. september (10 kamper, én kjerne): ~93 % av
 * spilletiden er framoverpasseringer — 56 % sandkassenettet, 41 % trohodet.
 * Motor, trekkbygging og hukommelse er under 3 %. Spillsteget er ~60 % av en
 * epoke, så det er DETTE kallet som setter hvor fort MLB kan trenes.
 *
 * `forover` summerer RADVIS over de ikke-null inngangene: for hver utgang
 * `r`, gå gjennom kolonnene. Vektene ligger radvis i minnet, så hvert ledd
 * hopper `inn` plasser fram. Her snus løkkene: for hver ikke-null inngang `c`,
 * legg `W[·,c]·a[c]` til ALLE utgangene — og vektene ligger kolonnevis, så den
 * indre løkka leser sammenhengende minne.
 *
 * Målt på 4 000 ekte innganger fra selvspill (e12 + mlb-tro.bin):
 *
 *     sandkassenettet   2,44 ms → 1,47 ms   1,66×
 *     trohodet          1,51 ms → 0,57 ms   2,67×
 *     per beslutning    3,95 ms → 2,04 ms   1,94×
 *
 * ================= HVORFOR DEN IKKE ER STANDARD =========================
 *
 * Flyttall er ikke assosiative. En annen rekkefølge gir andre biter: målt
 * maks |Δ| 4·10⁻⁷ på policy-logitene og 2·10⁻⁶ på trohodet, og samme argmaks
 * i 1 000 av 1 000 stillinger. Det er numerisk støy — men `forover` er
 * BIT-IDENTISK med vilje (`nett.ts`, `test/nett-glissen.test.ts`,
 * `test/amu-bitidentisk.test.ts`), fordi en optimalisering som endrer ett
 * kortvalg er en ny bot, og da måler ingen lenger det de tror de måler.
 *
 * Derfor er regelen:
 *
 *   TRENINGSDATA   (`mlb-spill.ts`, `mlb-erfaring.ts`)  kan bruke denne, med
 *                  `--rask-kjerne`, og det står i rapporten.
 *   ALL MÅLING     (stigen, porten, kravbatteriet, spekagent, utrullet bot)
 *                  bruker `forover`. Alltid.
 *
 * Bryteren er `brukKolonnekjerne()` på `Sandkassenett` og `MlbTronett`, ikke
 * en miljøvariabel: en innstilling man ikke ser i kommandolinja er en
 * innstilling noen kommer til å lese feil.
 */

import type { NevroLag, NevroNett } from "./nett.ts";

interface Kolonnelag {
  readonly inn: number;
  readonly ut: number;
  /** `kol[c * ut + r] === vekter[r * inn + c]` */
  readonly kol: Float32Array;
  readonly bias: Float32Array;
}

/**
 * Kolonnevis kopi per lag, bygd første gang laget brukes. `WeakMap` fordi et
 * nett som slippes skal kunne ryddes, og fordi kopien hører til laget og ikke
 * til den som kaller.
 */
const kolonner = new WeakMap<NevroLag, Kolonnelag>();

function kolonnelag(l: NevroLag): Kolonnelag {
  let k = kolonner.get(l);
  if (k === undefined) {
    const kol = new Float32Array(l.ut * l.inn);
    for (let r = 0; r < l.ut; r++) {
      const rad = r * l.inn;
      for (let c = 0; c < l.inn; c++) kol[c * l.ut + r] = l.vekter[rad + c]!;
    }
    k = { inn: l.inn, ut: l.ut, kol, bias: l.bias };
    kolonner.set(l, k);
  }
  return k;
}

/**
 * Mellomlagene summeres i Float64, som `forover` gjør med sin `let sum`, og
 * skrives til Float32 først på slutten. Trygt uten låsing av samme grunn som i
 * `nett.ts`: kallet kaller ikke seg selv, og hver tråd har sin egen modul.
 */
let bufA = new Float64Array(0);
let bufB = new Float64Array(0);

/** Samme kontrakt som `forover`: ReLU på alle lag unntatt det siste, fersk utgang. */
export function foroverKolonne(nett: NevroNett, x: Float32Array): Float32Array {
  const siste = nett.lag.length - 1;
  let a: Float32Array | Float64Array = x;
  for (let i = 0; i <= siste; i++) {
    const l = kolonnelag(nett.lag[i]!);
    let y: Float64Array;
    if (a === bufA) {
      if (bufB.length < l.ut) bufB = new Float64Array(l.ut);
      y = bufB;
    } else {
      if (bufA.length < l.ut) bufA = new Float64Array(l.ut);
      y = bufA;
    }
    for (let r = 0; r < l.ut; r++) y[r] = l.bias[r]!;
    for (let c = 0; c < l.inn; c++) {
      const v = a[c]!;
      if (v === 0) continue;
      const off = c * l.ut;
      for (let r = 0; r < l.ut; r++) y[r] = y[r]! + l.kol[off + r]! * v;
    }
    if (i < siste) for (let r = 0; r < l.ut; r++) if (y[r]! < 0) y[r] = 0;
    a = y;
  }
  // Utgangen forlater funksjonen og skal aldri være en buffer (se `forover`).
  const ut = new Float32Array(nett.lag[siste]!.ut);
  for (let r = 0; r < ut.length; r++) ut[r] = a[r]!;
  return ut;
}
