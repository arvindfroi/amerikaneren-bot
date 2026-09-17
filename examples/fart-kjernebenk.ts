/**
 * KJERNEBENKEN (17. sep): `forover` mot kandidatkjerner på EKTE innganger fanget fra helbotens søk.
 * Sjekker bit-identitet på hver eneste utgang, og tar tiden PARRET (armene vekselvis, flere omganger).
 *   node examples/fart-kjernebenk.ts <fang.bin> [omganger]
 */
import { readFileSync } from "node:fs";
import { foroverRef as forover, nettFraBytes } from "../src/nevro/nett.ts";
import { foroverKolonne } from "../src/nevro/nett-kolonne.ts";
import { foroverRask } from "../src/nevro/nett-rask.ts";
import { foroverSimd, simdTilgjengelig } from "../src/nevro/nett-simd.ts";
console.log("simd:", simdTilgjengelig());

const fil = process.argv[2]!;
const omganger = Number(process.argv[3] ?? "5");
const nett = nettFraBytes(new Uint8Array(readFileSync("e1-modell/kort-8.bin")))[0]!;
const rå = readFileSync(fil);
const alle = new Float32Array(rå.buffer, rå.byteOffset, rå.byteLength / 4);
const N = alle.length / 493;
const xs: Float32Array[] = [];
for (let i = 0; i < N; i++) xs.push(alle.slice(i * 493, (i + 1) * 493));

const armer: Record<string, (x: Float32Array) => Float32Array> = {
  forover: (x) => forover(nett, x),
  kolonne64: (x) => foroverKolonne(nett, x),
  rask: (x) => foroverRask(nett, x),
  simd: (x) => foroverSimd(nett, x)!,
};
// Bit-identitet
const ref = xs.map((x) => forover(nett, x).slice());
for (const [navn, f] of Object.entries(armer)) {
  let avvik = 0, argmaksAvvik = 0;
  for (let i = 0; i < N; i++) {
    const y = f(xs[i]!);
    const r = ref[i]!;
    let lik = y.length === r.length;
    for (let j = 0; lik && j < r.length; j++) if (!Object.is(y[j], r[j])) lik = false;
    if (!lik) avvik++;
    let a = 0, b = 0;
    for (let j = 1; j < r.length; j++) { if (r[j]! > r[a]!) a = j; if (y[j]! > y[b]!) b = j; }
    if (a !== b) argmaksAvvik++;
  }
  console.log(`${navn.padEnd(10)} bit-avvik ${avvik}/${N}  argmaks-avvik ${argmaksAvvik}/${N}`);
}
// Tid, parret: hver omgang kjører alle armene etter hverandre.
const tid: Record<string, number[]> = {};
for (let o = 0; o < omganger; o++) {
  const rekke = Object.keys(armer);
  if (o % 2 === 1) rekke.reverse();
  for (const navn of rekke) {
    const f = armer[navn]!;
    let sjekk = 0;
    const t = performance.now();
    for (let i = 0; i < N; i++) sjekk += f(xs[i]!)[0]!;
    const us = ((performance.now() - t) * 1000) / N;
    (tid[navn] ??= []).push(us);
    void sjekk;
  }
}
for (const [navn, t] of Object.entries(tid)) {
  const kvot = t.map((v, i) => tid.forover![i]! / v);
  console.log(`${navn.padEnd(10)} µs/kall ${t.map((v) => v.toFixed(1)).join(" ")}  fart mot forover (per omgang) ${kvot.map((v) => v.toFixed(2)).join(" ")}`);
}
