/**
 * HVA KOSTER FEIL `vant`-TABELL — målt mot familiens EKTE auksjoner?
 *
 * Benkene kan ikke svare på dette. gate2 og kampbenken spiller Adams mot
 * Adams, og der ER selvspilltabellen riktig per konstruksjon. De ville rangert
 * `bud-menneske` som dårligere, og de ville hatt rett — om bordet var fire
 * bots. Appen sitter med ett menneske og to bots.
 *
 * MEN SPØRSMÅLET ER LIKEVEL MÅLBART, fordi `vant[N]` ikke er en
 * tuningparameter. Den er et FAKTUM om omgivelsene: hvor ofte bud N vinner
 * budrunden. Og det faktumet er observert i ekte familierunder:
 *
 *     bud 8   13 ganger,   0 vant  ->  0 %
 *     bud 9   34 ganger,  12 vant  ->  35,3 %
 *     bud 10  57 ganger,  57 vant  ->  100 %
 *
 * Da kan vi regne DIREKTE. Beslutningsregelen er
 *
 *     ev(N) = vant[N] · 2N(2P(N) − 1)
 *
 * der P(N) kommer fra modellens (μ, σ). Bytter vi `vant` mot den MÅLTE
 * tabellen, får vi den sanne verdien av hvert bud. Så:
 *
 *   1. la hver kandidattabell velge bud (argmax med SIN egen `vant`)
 *   2. verdsett valget med den MÅLTE tabellen
 *   3. differansen er hva tabellfeilen koster per runde
 *
 * FORBEHOLD SOM MÅ STÅ, OG SOM ER DET SVAKESTE LEDDET: `P(N)` kommer fortsatt
 * fra en modell trent på selvspill, og familien spiller ikke som Adams. Vi
 * korrigerer auksjonsleddet med ekte data, ikke stikkleddet. Tallet er derfor
 * en kostnad ved AUKSJONSFEILEN alene, ikke et fullstendig anslag.
 *
 * OG n = 34 FOR BUD 9. Det er ekte, men tynt. Derfor rapporteres også et
 * krympet alternativ, og fortegnet må tåle begge.
 */

import { appendFileSync } from "node:fs";

import { lovligeHandlinger, opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lagIndre, tall } from "../src/moe2/agentspek.ts";
import { lesBudmodell } from "../src/moe2/budagent.ts";
import { muSigma, pMinst, type Budmodell } from "../src/moe2/budmodell.ts";
import { budTrekk, BUD_DIM } from "../src/moe2/budtrekk.ts";

const arg = (n: string, s: string) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const FRØ = tall(arg("--froe", "900000"), 900000, "froe");
const GIVER = tall(arg("--giver", "600"), 600, "giver");
const UT = arg("--ut", "analyse/budtabell-kostnad.jsonl");

/**
 * DEN MÅLTE SANNHETEN fra familiens runder mot Adams-linja. Bud utenfor
 * 8–10 er ikke observert nok til å si noe; de arver nabotallet, og valg som
 * lander der rapporteres separat slik at de ikke kan bære konklusjonen.
 */
const SANT: Record<number, number> = { 7: 0.0, 8: 0.0, 9: 0.353, 10: 1.0, 11: 1.0, 12: 1.0 };
/** Krympet mot selvspill med K = 8, som `bud-menneske` selv er bygget. */
const SANT_KRYMPET: Record<number, number> = { 7: 0.0, 8: 0.05, 9: 0.304, 10: 0.97, 11: 1.0, 12: 1.0 };

const TABELLER = ["bud-vant", "bud-menneske", "bud-gbt"] as const;
const modeller = new Map<string, Budmodell>(
  TABELLER.map((t) => [t, lesBudmodell(`e1-modell/${t}.json`)]),
);

/** SIGMA-GULVET er kallerens ansvar, og ADAMS bruker 0,6. Uten det maaler vi
 *  en annen agent enn den som staar ute. */
const tilpass = (r: { μ: number; σ: number }) => ({ μ: r.μ, σ: Math.max(0.6, r.σ) });

/** Budet tabellen velger, eller 0 for pass. */
function velg(m: Budmodell, v: Float32Array, vant: Record<number, number>, lovlige: number[]): number {
  const { μ, σ } = tilpass(muSigma(m, v));
  let beste = 0;
  let bestEv = -3.0; // samme terskel som ADAMS
  // BARE LOVLIGE BUD. Foerste utgave loop-et fra MINSTE_TALLBUD og oppover
  // uansett hva de andre hadde bydd, og «bydde» derfor 9 etter at noen hadde
  // sagt 10. Fordelingen avsloerte det: null pass i 3 258 stillinger, mens
  // boten i virkeligheten passer i omtrent halvparten.
  for (const N of lovlige) {
    const P = pMinst(μ, σ, N);
    const ev = (vant[N] ?? 0) * 2 * N * (2 * P - 1);
    if (ev > bestEv) {
      bestEv = ev;
      beste = N;
    }
  }
  return beste;
}

/** Verdien av et bud under den MÅLTE tabellen. */
function sannVerdi(m: Budmodell, v: Float32Array, N: number, sant: Record<number, number>): number {
  if (N === 0) return 0;
  const { μ, σ } = tilpass(muSigma(m, v));
  return (sant[N] ?? 0) * 2 * N * (2 * pMinst(μ, σ, N) - 1);
}

const sum: Record<string, number> = {};
const sumK: Record<string, number> = {};
const fordeling: Record<string, Record<number, number>> = {};
let n = 0;

for (let g = 0; g < GIVER; g++) {
  const ag = [0, 1, 2, 3].map(() => lagIndre("vr:e1-modell/vrakrang.bin:telrd:vakt:abmp:e1:e1-modell/d7alle.bin"));
  let s: GameState = opprettSpill({ antallSpillere: 4 }, FRØ + g * 7717);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
    if (s.fase === "BUDRUNDE" && s.iTur !== null) {
      const sete = s.iTur;
      const v = budTrekk(s, sete, BUD_DIM);
      const l = lovligeHandlinger(s);
      const lovlige = l.fase === "BUDRUNDE" ? l.bud.filter((b): b is number => typeof b === "number") : [];
      n++;
      for (const t of TABELLER) {
        const m = modeller.get(t)!;
        const N = velg(m, v, tabellVant(m), lovlige);
        sum[t] = (sum[t] ?? 0) + sannVerdi(m, v, N, SANT);
        sumK[t] = (sumK[t] ?? 0) + sannVerdi(m, v, N, SANT_KRYMPET);
        (fordeling[t] ??= {})[N] = ((fordeling[t] ?? {})[N] ?? 0) + 1;
      }
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, ag[iTur]!.velgHandling(s)).state;
  }
}

/** `vant`-tabellen modellen selv bærer. */
function tabellVant(m: Budmodell): Record<number, number> {
  const v = (m as unknown as { vant?: Record<number, number> | number[] }).vant;
  if (Array.isArray(v)) {
    const ut: Record<number, number> = {};
    v.forEach((x, i) => (ut[i] = x));
    return ut;
  }
  return (v as Record<number, number>) ?? {};
}

console.log(`# BUDTABELLENS KOSTNAD, verdsatt med familiens MAALTE auksjon`);
console.log(`# ${n} budstillinger over ${GIVER} giver\n`);
console.log(`${"tabell".padEnd(14)} ${"sann EV".padStart(9)} ${"krympet".padStart(9)}   fordeling`);
for (const t of TABELLER) {
  const f = Object.entries(fordeling[t] ?? {})
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([k, c]) => `${k === "0" ? "pass" : k}:${c}`)
    .join(" ");
  console.log(
    `${t.padEnd(14)} ${((sum[t] ?? 0) / n).toFixed(4).padStart(9)} ${((sumK[t] ?? 0) / n).toFixed(4).padStart(9)}   ${f}`,
  );
}
appendFileSync(UT, `${JSON.stringify({ n, sum, sumK, fordeling })}\n`);
