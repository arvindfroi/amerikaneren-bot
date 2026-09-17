/**
 * DESTILL-KORPUS — `destill.ts --data`-rader → `kort-data.ts`-formatet sd-tren leser.
 *
 *   node examples/destill-korpus.ts --kilde S|L0|G0 --k 8 --ut D:/amb-grp/destill/korpus-S/s0.jsonl inn1.jsonl …
 *
 *   S    snittet av gruppe 1 (G0…G(K−1)), «K×48» — det støyfrie målet
 *   L0   løkkas egen etikett (ett 24-verdenssøk) — kontrollarmen
 *   G0   ett 48-verdenssøk
 *
 * Samme rader, samme `t`, samme `frø` (kampfrøet, så sd-trens holdout deler på kamp) og
 * samme `stikk` i alle armene: BARE `v` skiller. Radtallet skrives, og armene må ha likt tall.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const argv = process.argv.slice(2);
const verdi = (n: string): string => {
  const i = argv.indexOf(n);
  if (i < 0) throw new Error(`${n} mangler`);
  return argv[i + 1]!;
};
const KILDE = verdi("--kilde");
const UT = verdi("--ut");
const KG = Number(verdi("--k"));
const inn = argv.filter((a, i) => !a.startsWith("--") && !["--kilde", "--ut", "--k"].includes(argv[i - 1]!));
if (!["S", "L0", "G0"].includes(KILDE)) throw new Error(`ukjent --kilde ${KILDE}`);

const ut: string[] = [];
let hoppet = 0;
for (const f of inn)
  for (const l of readFileSync(f, "utf8").split("\n")) {
    if (l.trim() === "") continue;
    const r = JSON.parse(l) as {
      frø: number; stikk: number; rolle: string; kort: number[]; L0: number[]; G: (number[] | null)[]; t?: number[];
    };
    if (r.t === undefined || r.G.some((g) => g === null)) {
      hoppet++;
      continue;
    }
    const G = r.G as number[][];
    const K = KG; // gruppe 1 = G0…G(K−1), både i hele rader (2K) og --halv-rader (K)
    if (G.length < K) throw new Error(`rad har ${G.length} søk, --k ${K}`);
    let vek: number[];
    if (KILDE === "L0") vek = r.L0;
    else if (KILDE === "G0") vek = G[0]!;
    else vek = G[0]!.map((_, i) => G.slice(0, K).reduce((a, g) => a + g[i]!, 0) / K);
    const v: Record<string, number> = {};
    r.kort.forEach((k, i) => (v[String(k)] = Math.round(vek[i]! * 10_000) / 10_000));
    ut.push(JSON.stringify({ frø: r.frø, stikk: r.stikk, rolle: r.rolle, t: r.t, v }));
  }
mkdirSync(dirname(UT), { recursive: true });
writeFileSync(UT, ut.join("\n") + "\n");
console.log(`KORPUS ${KILDE}: ${ut.length} rader → ${UT} (hoppet over ${hoppet})`);
