/**
 * FANG EKTE INNGANGER TIL KORTNETTET fra helbotens søk (17. sep), og tell framoverkall.
 * Krever den midlertidige kroken `globalThis.__fang` i `nevro/nett.ts` (ikke committet).
 *   node examples/fart-fang.ts --ut <fil.bin> --maks 20000 --runder 1
 */
import { writeFileSync } from "node:fs";
import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { ADAMS_MAALT, lagIndre } from "../src/moe2/agentspek.ts";
const arg = (n: string, s: string): string => { const i = process.argv.indexOf(n); return i < 0 ? s : (process.argv[i + 1] ?? s); };
const SPEK = arg("--spek", "");
const UT = arg("--ut", "fang.bin");
const MAKS = Number(arg("--maks", "20000"));
const RUNDER = Number(arg("--runder", "1"));
const STEG = Number(arg("--steg", "37"));
const g = { n: 0, maks: 1e9, inn: 493, x: [] as Float32Array[], kall: 0 };
(globalThis as any).__fang = g;
const seter = [lagIndre(SPEK), lagIndre(SPEK), lagIndre(SPEK), lagIndre(ADAMS_MAALT)];
let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, Number(arg("--froe", "1250000000")));
for (const a of seter) a.nyKamp();
const perStikk: number[][] = Array.from({ length: 12 }, () => []);
let vakt = 0;
while (s.fase !== "FERDIG" && s.rundeNr < RUNDER && vakt++ < 40000) {
  for (const a of seter) a.observer?.(s);
  if (s.fase === "RUNDE_SLUTT") { s = utfør(s, { type: "NESTE" }).state; continue; }
  const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
  if (sete === null || sete === undefined) break;
  const k0 = g.kall;
  const h = seter[sete]!.velgHandling(s);
  if (sete < 3 && s.fase === "SPILL") perStikk[s.stikkSpilt]!.push(g.kall - k0);
  s = utfør(s, h).state;
}
// Tynn ut til MAKS jevnt fordelt.
const valgt: Float32Array[] = [];
for (let i = 0; i < g.x.length && valgt.length < MAKS; i += STEG) valgt.push(g.x[i]!);
const buf = new Float32Array(valgt.length * 493);
valgt.forEach((v, i) => buf.set(v, i * 493));
writeFileSync(UT, Buffer.from(buf.buffer));
console.log(`fanget ${g.x.length} kall (493-nett), totalt ${g.kall} forover-kall, skrev ${valgt.length}`);
perStikk.forEach((a, i) => console.log(`stikk ${i + 1}: kall per kortvalg ${a.join(" ")}`));
