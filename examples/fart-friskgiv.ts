/**
 * DUPLIKAT PÅ FRISKE GIV (18. sep): to armer i sete 0, samme giv, samme motstand.
 *
 *   node examples/fart-friskgiv.ts --a "<spek A>" --b "<spek B>" --motstander "<v5>" \
 *        --froe0 1777000000 --giv 10000 --skard 0/3 --ut D:/amb-grp/loop/arm1bekreft/s0.jsonl
 *
 * HVORFOR DEN FINNES. K1-duplikatet måler på menneskekorpuset, og alle tallene derfra deler støy
 * (samme 2 641 runder). Et arm-mot-arm-spørsmål trenger ikke mennesker: det holder å gi begge armene
 * NØYAKTIG samme giv og samme motstand, og se hvem som får mest ut av den. Da er givvariansen paret
 * bort, og tallet er uavhengig av alt som er målt på menneskekampene.
 *
 * OPPSETTET PER GIV: fersk kamp fra frøet (poengtavla 0–0–0–0), armen i sete 0, `--motstander` i de
 * tre andre. ÉN runde spilles (budrunde, vrak, trumf og tolv stikk), og så leses:
 *   poeng  sete 0 sine rundepoeng
 *   bP     100·(P(sete 0 vinner kampen | tavla etter) − P(… | 0–0–0–0)) med `seier-g0.bin`,
 *          NØYAKTIG samme mål som `duplikat-menneske.ts` bruker (der er «før» menneskets tavle).
 * Begge armene får sin egen agentinstans per giv, så hukommelse og økt aldri lekker mellom dem.
 *
 * FRØBÅND: `--froe0` skal ligge utenfor K1-korpuset (Val Town-frø fra appen) og utenfor trenings- og
 * benkebåndene. Båndet som brukes står i rapporten.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { Seiersprediktor } from "../src/mlb/seier.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const A = arg("--a", "");
const B = arg("--b", "");
const MOTSTANDER = arg("--motstander", "");
const FRØ0 = Number(arg("--froe0", "1777000000"));
const GIV = Number(arg("--giv", "100"));
const [SI, SN] = arg("--skard", "0/1").split("/").map(Number) as [number, number];
const UT = arg("--ut", "D:/amb-grp/loop/arm1bekreft/s0.jsonl");
const MÅL = Number(arg("--maalpoeng", "100"));
const prediktor = Seiersprediktor.fraFil(arg("--seier", "e1-modell/seier-g0.bin"));
if (A === "" || B === "" || MOTSTANDER === "") throw new Error("--a, --b og --motstander er påkrevd");
mkdirSync(dirname(UT), { recursive: true });

/** Motorens vinnerregel (`motor.ts`), ordrett som i `duplikat-menneske.ts`. */
function vinnerAv(total: readonly number[], budvinner: unknown, makker: unknown): number | null {
  const kand: number[] = [];
  for (let i = 0; i < total.length; i++) if ((total[i] ?? 0) >= MÅL) kand.push(i);
  if (kand.length === 0) return null;
  if (typeof budvinner === "number" && kand.includes(budvinner)) return budvinner;
  if (typeof makker === "number" && kand.includes(makker)) return makker;
  let best = kand[0]!;
  for (const k of kand) if ((total[k] ?? 0) > (total[best] ?? 0)) best = k;
  return best;
}
/** P(sete 0 vinner kampen) etter en poengtavle — samme definisjon som `duplikat-menneske.ts`. */
const sjanse = (total: readonly number[], budvinner: unknown, makker: unknown): number => {
  const v = vinnerAv(total, budvinner, makker);
  if (v !== null) return v === 0 ? 1 : 0;
  return prediktor.fordeling([...total], 0, MÅL)[0]!;
};
const P0 = 100 * sjanse([0, 0, 0, 0], null, null);

/** Spiller ÉN runde fra frøet med `spek` i sete 0 og motstanderen i de tre andre. */
function spillRunde(spek: string, frø: number): { poeng: number; bP: number; budvinner: number | null; rolle: string } {
  const seter = [lagIndre(spek), lagIndre(MOTSTANDER), lagIndre(MOTSTANDER), lagIndre(MOTSTANDER)];
  for (const a of seter) a.nyKamp();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: MÅL }, frø);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 4000) {
    for (const a of seter) a.observer?.(s);
    const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (sete === null || sete === undefined) break;
    s = utfør(s, seter[sete]!.velgHandling(s)).state;
  }
  for (const a of seter) a.observer?.(s);
  const bv = s.sisteRunde?.budvinner ?? s.budvinner;
  const mk = s.sisteRunde?.makker ?? s.makker;
  return {
    poeng: s.totalPoeng[0] ?? 0,
    bP: 100 * sjanse(s.totalPoeng, bv, mk) - P0,
    budvinner: bv ?? null,
    rolle: bv === 0 ? "fører" : mk === 0 ? "makker" : "forsvar",
  };
}

const t0 = Date.now();
let n = 0;
for (let i = 0; i < GIV; i++) {
  if (i % SN !== SI) continue;
  const frø = FRØ0 + i;
  // Rekkefølgen byttes annenhver giv, så ingen arm systematisk får varm cache.
  const [f1, f2] = i % 2 === 0 ? [A, B] : [B, A];
  const r1 = spillRunde(f1, frø);
  const r2 = spillRunde(f2, frø);
  const a = f1 === A ? r1 : r2;
  const b = f1 === A ? r2 : r1;
  appendFileSync(UT, JSON.stringify({ frø, a, b }) + "\n");
  n++;
  if (n % 25 === 0) {
    process.stdout.write(`\r  skard ${SI}/${SN}: ${n} giv, ${((Date.now() - t0) / 1000).toFixed(0)} s   `);
  }
}
console.log(`\nSkard ${SI}/${SN} ferdig: ${n} giv på ${((Date.now() - t0) / 1000).toFixed(0)} s → ${UT}`);
