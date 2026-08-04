/**
 * FORDELINGSSKIFTET BUDMODELLEN LAGER — og som kortnettet aldri har sett.
 *
 *   node examples/kontraktskift.ts 13000000 3000 analyse/kontraktskift.json
 *
 * FUNNET SOM UTLØSTE DEN. Adams spiller med `budm:bud-gbt.json`, men
 *
 *   treningsdata (sd-v4):  --motpart vakt:abmp:e1:ftf1.bin   INGEN budmodell
 *   gate 2-benken:         vakt:abmp:e1:<nett>               INGEN budmodell
 *
 * Kortnettet er altså trent og målt under nevro-byding, og satt ut under
 * budmodellens. Og budmodellens gevinst (+2,138 mot nevro-byding) kommer
 * ifølge planen av at den tar kontrakter nevro PASSER PÅ — altså marginale
 * hender. Er den forskjellen stor, spiller Adams kontrakter den aldri er
 * trent på, og gate 2 måler den i et miljø den ikke lever i.
 *
 * Skriptet måler bare fordelingen. Det avgjør ikke om det koster poeng —
 * det krever en gate 2 der miljøet HAR budmodellen — men det sier om
 * spørsmålet er verdt å stille.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lagIndre, tall } from "../src/moe2/agentspek.ts";

const FRØ0 = tall(process.argv[2], 13_000_000, "argv[2]");
const RUNDER = tall(process.argv[3], 3000, "argv[3]");
const UT = process.argv[4] ?? "analyse/kontraktskift.json";



type Oppsummering = {
  runder: number;
  perBud: Record<number, number>;
  snittBud: number;
  klartAndel: number;
  snittLagStikk: number;
};

/** Spiller RUNDER runder der ALLE fire seter bruker `spek`. */
function kjør(spek: string): Oppsummering {
  const agent = lagIndre(spek);
  const perBud: Record<number, number> = {};
  let n = 0;
  let sumBud = 0;
  let klart = 0;
  let sumLagStikk = 0;

  for (let i = 0; i < RUNDER; i++) {
    let s: GameState = opprettSpill({ antallSpillere: 4 }, FRØ0 + i * 4517);
    agent.nyKamp();
    let g = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 600) {
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      s = utfør(s, agent.velgHandling(s)).state;
    }
    const r = s.sisteRunde;
    if (r === null || r === undefined || r.melding.type !== "tall") continue;
    n++;
    const bud = r.melding.bud;
    perBud[bud] = (perBud[bud] ?? 0) + 1;
    sumBud += bud;
    if (r.klart) klart++;
    sumLagStikk += r.lagStikk;
  }
  return {
    runder: n,
    perBud,
    snittBud: sumBud / Math.max(1, n),
    klartAndel: klart / Math.max(1, n),
    snittLagStikk: sumLagStikk / Math.max(1, n),
  };
}

const uten = kjør("vakt:abmp:e1:e1-modell/ftf1.bin");
const med = kjør("budm:e1-modell/bud-gbt.json:vakt:abmp:e1:e1-modell/ftf1.bin");

const rapport = { frø0: FRØ0, uten, med };
mkdirSync(dirname(UT), { recursive: true });
writeFileSync(UT, JSON.stringify(rapport, null, 2), "utf-8");

const budene = [...new Set([...Object.keys(uten.perBud), ...Object.keys(med.perBud)])]
  .map(Number)
  .sort((a, b) => a - b);

console.log("KONTRAKTSFORDELING - alle fire seter med samme spek\n");
console.log(`${"bud".padEnd(6)}${"uten budmodell".padStart(18)}${"med budmodell".padStart(18)}`);
for (const b of budene) {
  const u = uten.perBud[b] ?? 0;
  const m = med.perBud[b] ?? 0;
  console.log(
    `${String(b).padEnd(6)}` +
      `${`${u} (${((100 * u) / Math.max(1, uten.runder)).toFixed(1)} %)`.padStart(18)}` +
      `${`${m} (${((100 * m) / Math.max(1, med.runder)).toFixed(1)} %)`.padStart(18)}`,
  );
}
console.log(
  `\n${"snittbud".padEnd(6)}${uten.snittBud.toFixed(3).padStart(18)}${med.snittBud.toFixed(3).padStart(18)}`,
);
console.log(
  `${"klart".padEnd(6)}${`${(100 * uten.klartAndel).toFixed(1)} %`.padStart(18)}${`${(100 * med.klartAndel).toFixed(1)} %`.padStart(18)}`,
);
console.log(
  `${"lagstikk".padEnd(6)}${uten.snittLagStikk.toFixed(3).padStart(18)}${med.snittLagStikk.toFixed(3).padStart(18)}`,
);
console.log(`\nSkrevet til ${UT}`);
