/**
 * HVOR OFTE ER DE TO FASITENE UENIGE — OG I HVILKET SETE?
 *
 * §114 påsto at DD-fasiten måler feil størrelse i TRE AV FIRE SETER: forsvaret
 * scorer sine egne stikk, mens `rotVerdier` bare kjenner budlagets. Påstanden
 * er riktig som regneark, men den sier ingenting om hvor ofte det gjør en
 * forskjell i praksis — og det er den forskjellen kampbenken måler.
 *
 * Dette verktøyet teller uenigheten direkte: for hver ekte sluttspillstilling,
 * for hvert sete, velger `fasitKort` (dobbelt dummy) og `poengfasitKort`
 * (poengløseren) samme kort eller ikke? Delt opp på ROLLE, fordi hele
 * hypotesen er at forskjellen sitter i forsvaret.
 *
 * Kjøres med: node examples/juks-mal-avvik.ts [antall givinger]
 * Skriver til `analyse/juks-mal-avvik.tsv` – fra prosessen selv, aldri
 * gjennom et rør (§ «langkjøringer trenger varig logg»).
 */

import { mkdirSync, writeFileSync } from "node:fs";

import { likeKort } from "../src/kort.ts";
import { opprettSpill, utfør, type GameState } from "../src/motor.ts";
import { NevroAgent } from "../src/nevro/agent.ts";
import { fasitKort, poengfasitKort } from "../src/moe2/juksagent.ts";

const ANTALL = Number(process.argv[2] ?? 60);
const nevro = new NevroAgent();

type Rolle = "fører" | "makker" | "forsvar";

interface Rad {
  igjen: number;
  rolle: Rolle;
  n: number;
  ulikeDiff: number;
  ulikeEgen: number;
}

const tabell = new Map<string, Rad>();
const før = (igjen: number, rolle: Rolle): Rad => {
  const nøkkel = `${igjen}|${rolle}`;
  let r = tabell.get(nøkkel);
  if (r === undefined) {
    r = { igjen, rolle, n: 0, ulikeDiff: 0, ulikeEgen: 0 };
    tabell.set(nøkkel, r);
  }
  return r;
};

for (let f = 0; f < ANTALL; f++) {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 6_200_000 + f);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
    const igjen = s.giving.antallStikk - s.stikkSpilt;
    if (
      s.fase === "SPILL" &&
      s.iTur !== null &&
      s.trumf !== null &&
      s.budvinner !== null &&
      s.melding !== null &&
      igjen >= 1 &&
      igjen <= 5 &&
      s.bord.length === 0
    ) {
      for (let sete = 0; sete < s.antallSpillere; sete++) {
        if ((s.hender[sete]?.length ?? 0) === 0) continue;
        const rolle: Rolle =
          sete === s.budvinner ? "fører" : sete === s.makker ? "makker" : "forsvar";
        const dd = fasitKort(s, sete);
        if (dd === null) continue;
        const diff = poengfasitKort(s, sete, "diff");
        const egen = poengfasitKort(s, sete, "egen");
        const r = før(igjen, rolle);
        r.n++;
        if (diff !== null && !likeKort(dd, diff)) r.ulikeDiff++;
        if (egen !== null && !likeKort(dd, egen)) r.ulikeEgen++;
      }
    }
    s = utfør(s, nevro.velgHandling(s)).state;
  }
}

const rader = [...tabell.values()].sort((a, b) => a.igjen - b.igjen || a.rolle.localeCompare(b.rolle));
const linjer = ["igjen\trolle\tn\tulike_diff\tandel_diff\tulike_egen\tandel_egen"];
for (const r of rader) {
  linjer.push(
    [
      r.igjen,
      r.rolle,
      r.n,
      r.ulikeDiff,
      (r.ulikeDiff / Math.max(1, r.n)).toFixed(4),
      r.ulikeEgen,
      (r.ulikeEgen / Math.max(1, r.n)).toFixed(4),
    ].join("\t"),
  );
}
const sum = rader.reduce(
  (a, r) => ({ n: a.n + r.n, d: a.d + r.ulikeDiff, e: a.e + r.ulikeEgen }),
  { n: 0, d: 0, e: 0 },
);
linjer.push(
  ["ALLE", "-", sum.n, sum.d, (sum.d / Math.max(1, sum.n)).toFixed(4), sum.e, (sum.e / Math.max(1, sum.n)).toFixed(4)].join("\t"),
);

mkdirSync("analyse", { recursive: true });
writeFileSync("analyse/juks-mal-avvik.tsv", linjer.join("\n") + "\n", "utf8");
console.log(linjer.join("\n"));
