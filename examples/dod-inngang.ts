/**
 * DØD KAPASITET I E1-NETTET: hvilke innganger bryr nettet seg om?
 *
 * To uavhengige mål, og de svarer paa ULIKE spoersmaal:
 *   VARIANS   baerer inngangen informasjon i det hele tatt? Er den konstant
 *             over ekte stillinger, er blokken doed UANSETT hva nettet gjoer.
 *   VEKT-L1   BRUKER nettet den? Foerstelagets vektsum inn i indeksen. Er den
 *             nesten null mens variansen er hoey, har nettet LAERT aa ignorere
 *             en blokk som faktisk baerer noe - det dyreste utfallet.
 */
import { readFileSync } from "node:fs";
import { nettFraBytes } from "../src/nevro/nett.ts";
import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { e1SpillTrekk } from "../src/e1/trekk.ts";

// «--bredde <n>» maaler VARIANS alene, uten et nett. Det svarer paa om en
// blokk baerer informasjon i ekte stillinger - noe man maa vite FOER man
// bruker treningstid paa en bredde man ikke har et nett for enda.
const bareBredde = process.argv[2] === "--bredde" ? Number(process.argv[3]) : 0;
const fil = bareBredde ? "" : (process.argv[2] ?? "e1-modell/d7alle.bin");
const nett = bareBredde
  ? { lag: [{ inn: bareBredde, ut: 1, vekter: new Float32Array(bareBredde) }] }
  : nettFraBytes(new Uint8Array(readFileSync(fil)))[0]!;
const L = nett.lag[0]! as unknown as { inn: number; ut: number; vekter: ArrayLike<number> };
const inn = L.inn;
console.log(`nett ${fil}: inn=${inn}, foerste lag ${L.ut} noder`);

// Vektene ligger FLATT, rad-hovedorden [ut][inn].
const l1 = new Float64Array(inn);
for (let j = 0; j < L.ut; j++) for (let i = 0; i < inn; i++) l1[i]! += Math.abs(L.vekter[j * inn + i]!);

// Varians over ekte stillinger.
const sum = new Float64Array(inn), sum2 = new Float64Array(inn);
let n = 0;
for (let d = 0; d < 120; d++) {
  const ag = [0,1,2,3].map(() => new NevroAgent());
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 4_100_000 + d * 7717);
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    if (s.fase === "SPILL" && s.iTur !== null) {
      const v = e1SpillTrekk(s, s.iTur, inn);
      for (let i = 0; i < inn; i++) { sum[i]! += v[i]!; sum2[i]! += v[i]! * v[i]!; }
      n++;
    }
    const iT = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iT === null || iT === undefined) break;
    s = utfør(s, ag[iT]!.velgHandling(s)).state;
  }
}
const blokker: [string, number, number][] = [
  ["kjerne 0-272", 0, 273], ["v2 273-339", 273, 340], ["v3 340-355", 340, 356],
  ["v4 356-363", 356, 364], ["plan 364-375", 364, 376], ["tro 376-427", 376, 428],
  ["verdi 428-457", 428, 458], ["doede 458-469", 458, 470],
  ["sanser 470-557", 470, 558], ["hvemla 558-713", 558, 714],
];
console.log(`\n${n} stillinger\n`);
console.log("blokk               indekser  DOEDE(var=0)   snitt-var   snitt-|w|   |w| per index");
for (const [navn, a, b] of blokker) {
  if (a >= inn) continue;
  const til = Math.min(b, inn);
  let dode = 0, sv = 0, sw = 0;
  for (let i = a; i < til; i++) {
    const m = sum[i]! / n, va = sum2[i]! / n - m * m;
    if (va < 1e-12) dode++;
    sv += va; sw += l1[i]!;
  }
  const k = til - a;
  console.log(
    `${navn.padEnd(20)} ${String(k).padStart(4)}   ${String(dode).padStart(4)} (${((dode/k)*100).toFixed(0).padStart(3)}%)` +
    `   ${(sv/k).toExponential(2)}   ${(sw/k).toFixed(3).padStart(8)}   ${(sw/k).toFixed(4)}`,
  );
}

// DE DØDE INDEKSENE, navngitt. En konstant inngang er enten en ekte bug eller
// en stilling som aldri oppstår i selvspill – og de to krever ulik kur.
const dode: number[] = [];
for (let i = 0; i < inn; i++) {
  const m = sum[i]! / n;
  if (sum2[i]! / n - m * m < 1e-12) dode.push(i);
}
console.log(`\n${dode.length} KONSTANTE innganger (verdi i parentes):`);
const linjer: string[] = [];
for (const i of dode) linjer.push(`${i}=${(sum[i]! / n).toFixed(2)}`);
for (let i = 0; i < linjer.length; i += 12) console.log("  " + linjer.slice(i, i + 12).join("  "));
