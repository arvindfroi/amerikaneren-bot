/**
 * ER BUDMODELLENS (mu, sigma) KALIBRERT?
 *
 * Modellen anslaar mu = forventet lagstikk og sigma = usikkerheten, og bruker
 * dem til P(klarer N) = 1 - Phi((N - 0,5 - mu)/sigma). Hele budregelen hviler
 * paa at den fordelingen stemmer.
 *
 * MAALT: for hver runde, budvinnerens (mu, sigma) i budoeyeblikket mot det
 * laget FAKTISK tok. To spoersmaal:
 *
 *   TREFFER MU?      er snittet av faktiske lagstikk lik mu?
 *   TREFFER SIGMA?   er spredningen rundt mu lik sigma? For lav sigma gjoer
 *                    boten overmodig, for hoey gjoer den feig - og feig er
 *                    nettopp det som hindrer Amerikaner i aa bli meldt.
 */
import { readFileSync } from "node:fs";
import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { Budagent, lesBudmodell } from "../src/moe2/budagent.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { Vrakrangerer } from "../src/moe2/vrakrang.ts";
import { nettFraBytes } from "../src/nevro/nett.ts";
import { budTrekk } from "../src/moe2/budtrekk.ts";

let givere = 4000, frø = 377_000_000, modellfil = "e1-modell/bud-vant.json";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--giver") givere = Number(process.argv[++i]);
  else if (a === "--froe") frø = Number(process.argv[++i]);
  else if (a === "--modell") modellfil = process.argv[++i]!;
}
const m = lesBudmodell(modellfil);
type Node = { blad: boolean; verdi?: number; kol?: number; terskel?: number; v?: Node; h?: Node };
const forutsi = (n: Node, x: Float32Array): number =>
  n.blad ? n.verdi! : forutsi(x[n.kol!]! <= n.terskel! ? n.v! : n.h!, x);
const anslå = (s: { basis: number; trær: Node[] }, x: Float32Array, rate: number): number =>
  s.basis + rate * s.trær.reduce((a, t) => a + forutsi(t, x), 0);

const nett = nettFraBytes(new Uint8Array(readFileSync("e1-modell/vrakrang.bin")))[0]!;
const lag = () => new Vrakrangerer(
  new Budagent(new Konvensjonsvakt(E1Agent.fraFil("e1-modell/d7alle.bin"), delVaktspek("vakt:abmp:x")!.valg),
    m, -3.0), nett, "telrd");
const ag = [0, 1, 2, 3].map(lag);

const rader: { mu: number; sig: number; faktisk: number }[] = [];
for (let g = 0; g < givere; g++) {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø + g * 7717);
  for (const a of ag) a.nyKamp();
  const anslag = new Map<number, { mu: number; sig: number }>();
  let v = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && v++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    if (s.fase === "BUDRUNDE" && !anslag.has(iTur)) {
      const x = budTrekk(s, iTur, m.dim);
      anslag.set(iTur, { mu: anslå(m.mμ as never, x, m.rate), sig: Math.max(0.6, anslå(m.mσ as never, x, m.rate)) });
    }
    s = utfør(s, ag[iTur]!.velgHandling(s) as Handling).state;
  }
  const r = s.sisteRunde;
  if (r === null || r === undefined || s.budvinner === null) continue;
  const a = anslag.get(s.budvinner);
  if (a !== undefined) rader.push({ mu: a.mu, sig: a.sig, faktisk: r.lagStikk });
  if (g % 500 === 0) process.stdout.write(`  ${g}/${givere}\r`);
}
const n = rader.length;
const snitt = (f: (r: typeof rader[0]) => number) => rader.reduce((a, r) => a + f(r), 0) / n;
const mMu = snitt((r) => r.mu), mF = snitt((r) => r.faktisk);
const rest = rader.map((r) => r.faktisk - r.mu);
const mR = rest.reduce((a, b) => a + b, 0) / n;
const sdR = Math.sqrt(rest.reduce((a, b) => a + (b - mR) ** 2, 0) / (n - 1));
const mSig = snitt((r) => r.sig);
console.log(`\n${n} runder, budvinnerens anslag i budoeyeblikket`);
console.log(`  mu i snitt        ${mMu.toFixed(3)}`);
console.log(`  faktisk lagstikk  ${mF.toFixed(3)}     SKJEVHET ${(mF - mMu).toFixed(3)}`);
console.log(`  sigma modellen sier   ${mSig.toFixed(3)}`);
console.log(`  FAKTISK spredning     ${sdR.toFixed(3)}     forhold ${(sdR / mSig).toFixed(2)}x`);
console.log();
const b = new Map<number, number[]>();
for (const r of rader) { const k = Math.round(r.mu * 2) / 2; b.set(k, [...(b.get(k) ?? []), r.faktisk]); }
console.log("  mu-boette    n    faktisk snitt   P(>=12) faktisk   P(>=12) modell");
for (const k of [...b.keys()].sort((a, x) => a - x)) {
  const v = b.get(k)!; if (v.length < 30) continue;
  const sn = v.reduce((a, x) => a + x, 0) / v.length;
  const p12 = v.filter((x) => x >= 12).length / v.length;
  const z = (11.5 - k) / mSig;
  const pm = 0.5 * (1 - Math.sign(z) * Math.sqrt(1 - Math.exp(-2 * z * z / Math.PI)));
  console.log(`  ${k.toFixed(1).padStart(6)}  ${String(v.length).padStart(6)}   ${sn.toFixed(2).padStart(10)}   ${(100*p12).toFixed(1).padStart(12)} %   ${(100*pm).toFixed(1).padStart(12)} %`);
}
