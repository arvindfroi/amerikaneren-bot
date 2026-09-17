/**
 * RASK OG BIT-IDENTISK KJERNE (17. sep) — utkast, se `D:\amb-grp\loop\fart.md`.
 */
import type { NevroLag, NevroNett } from "./nett.ts";

interface Kolonnelag {
  readonly inn: number;
  readonly ut: number;
  readonly kol: Float32Array;
  readonly bias: Float32Array;
}
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
let acc = new Float64Array(0);
let bufA = new Float32Array(0);
let bufB = new Float32Array(0);

export function foroverRask(nett: NevroNett, x: Float32Array): Float32Array {
  const siste = nett.lag.length - 1;
  let a: Float32Array = x;
  for (let i = 0; i <= siste; i++) {
    const l = kolonnelag(nett.lag[i]!);
    const ut = l.ut;
    const inn = l.inn;
    if (acc.length < ut) acc = new Float64Array(ut);
    const y = acc;
    const bias = l.bias;
    for (let r = 0; r < ut; r++) y[r] = bias[r]!;
    const kol = l.kol;
    for (let c = 0; c < inn; c++) {
      const v = a[c]!;
      if (v === 0) continue;
      const off = c * ut;
      if (v === 1) {
        for (let r = 0; r < ut; r++) y[r] = y[r]! + kol[off + r]!;
      } else {
        for (let r = 0; r < ut; r++) y[r] = y[r]! + kol[off + r]! * v;
      }
    }
    let z: Float32Array;
    if (i === siste) z = new Float32Array(ut);
    else if (a === bufA) {
      if (bufB.length < ut) bufB = new Float32Array(ut);
      z = bufB;
    } else {
      if (bufA.length < ut) bufA = new Float32Array(ut);
      z = bufA;
    }
    if (i < siste) for (let r = 0; r < ut; r++) { const s = y[r]!; z[r] = s < 0 ? 0 : s; }
    else for (let r = 0; r < ut; r++) z[r] = y[r]!;
    a = z;
  }
  return a;
}
