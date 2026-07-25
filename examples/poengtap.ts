/**
 * HVOR mister botten poeng? Eksakt parret dekomponering mot NevroHjerne.
 *
 *   node examples/poengtap.ts trening-d5/gull.json d7/fro-d6-klar.json --givere 60
 *
 * METODEN. Én RUNDE av gangen, ikke en hel kamp. Hver runde er selvstendig
 * (giv -> bud -> vrak -> trumf -> spill -> poeng), saa den kan spilles to
 * ganger fra noeyaktig samme utgangspunkt:
 *
 *   A) kandidaten i sete S, NevroHjerne i de tre andre
 *   B) NevroHjerne i sete S ogsaa - altsaa fire nevro
 *
 * Differansen i setets poeng er da kandidatens tap MOT nevro i akkurat den
 * situasjonen, med kortene holdt helt faste. Spiller vi hele kamper i stedet
 * divergerer de to loepene etter foerste avvik, og da kan ingen enkeltrunde
 * tilskrives noe som helst.
 *
 * Rundene grupperes etter hvilken ROLLE kandidaten hadde, siden det er der
 * forklaringen ligger: som spillefoerer taper man paa aa by feil eller spille
 * kontrakten daarlig, som forsvarer paa aa slippe kontrakter gjennom.
 * Rollen leses fra KANDIDATENS eget loep - det er hans beslutninger som
 * skal forklares.
 */

import { readFileSync } from "node:fs";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { genomFraJson, NeatAgent } from "../src/neat/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";

const filer: string[] = [];
let givere = 60;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--givere") givere = Number(process.argv[++i]);
  else filer.push(a);
}

type Velger = { nyKamp(): void; velgHandling(s: GameState): Handling };

interface Runde {
  poeng: number;
  rolle: "spillefører" | "makker" | "forsvarer";
  bud: number | null;
  lagStikk: number;
  klart: boolean;
  egneStikk: number;
}

/** Spiller ÉN runde med `agent` i sete `sete` og nevro i resten. */
function énRunde(agent: Velger, sete: number, frø: number): Runde | null {
  agent.nyKamp();
  const nevro = new NevroAgent();
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
    s = utfør(s, iTur === sete ? agent.velgHandling(s) : nevro.velgHandling(s)).state;
  }
  const r = s.sisteRunde;
  if (r === null || r === undefined) return null;
  const rolle: Runde["rolle"] =
    r.budvinner === sete ? "spillefører" : r.makker === sete ? "makker" : "forsvarer";
  return {
    poeng: s.totalPoeng[sete] ?? 0,
    rolle,
    bud: r.melding.type === "tall" ? r.melding.bud : null,
    lagStikk: r.lagStikk,
    klart: r.klart,
    egneStikk: r.stikkVunnet[sete] ?? 0,
  };
}

interface Bøtte {
  runder: number;
  tap: number;
  budSum: number;
  budN: number;
  stikkSum: number;
  klart: number;
  nevroKlart: number;
}
const nyBøtte = (): Bøtte => ({
  runder: 0, tap: 0, budSum: 0, budN: 0, stikkSum: 0, klart: 0, nevroKlart: 0,
});

const kandidater = filer.map((f) => {
  const rå = JSON.parse(readFileSync(f, "utf8")) as { genom?: unknown };
  const g = genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(f, "utf8"));
  return { navn: f.split(/[\\/]/).pop()!.replace(".json", ""), lag: (): Velger => new NeatAgent(g, { læringsrate: 0 }) };
});

for (const k of kandidater) {
  const bøtter: Record<string, Bøtte> = {
    spillefører: nyBøtte(),
    makker: nyBøtte(),
    forsvarer: nyBøtte(),
  };
  // Undergrupper for spillefoereren: der ligger som regel hovedtapet.
  const klartB = nyBøtte();
  const faltB = nyBøtte();
  let totalTap = 0;
  let n = 0;

  for (let f = 0; f < givere; f++) {
    for (let sete = 0; sete < 4; sete++) {
      const frø = 4_100_000 + f;
      const a = énRunde(k.lag(), sete, frø);
      const b = énRunde(new NevroAgent(), sete, frø);
      if (a === null || b === null) continue;
      const tap = a.poeng - b.poeng;
      totalTap += tap;
      n++;
      const bt = bøtter[a.rolle]!;
      bt.runder++;
      bt.tap += tap;
      bt.stikkSum += a.egneStikk;
      if (a.bud !== null) {
        bt.budSum += a.bud;
        bt.budN++;
      }
      if (a.klart) bt.klart++;
      if (b.klart) bt.nevroKlart++;
      if (a.rolle === "spillefører") {
        const u = a.klart ? klartB : faltB;
        u.runder++;
        u.tap += tap;
        if (a.bud !== null) {
          u.budSum += a.bud;
          u.budN++;
        }
        u.stikkSum += a.lagStikk;
      }
    }
  }

  const p = (x: number): string => (x >= 0 ? "+" : "") + x.toFixed(2);
  console.log(`\n=== ${k.navn} – poengtap mot NevroHjerne, ${givere} givere × 4 seter ===`);
  console.log(`Totalt tap: ${p(totalTap / n)} poeng per runde over ${n} runder\n`);
  console.log(
    "rolle".padEnd(14) + "runder".padStart(8) + "andel".padStart(8) +
      "tap/runde".padStart(11) + "av totaltap".padStart(13) + "snittbud".padStart(10) + "egne stikk".padStart(12),
  );
  console.log("-".repeat(76));
  for (const [navn, b] of Object.entries(bøtter)) {
    if (b.runder === 0) continue;
    console.log(
      navn.padEnd(14) +
        String(b.runder).padStart(8) +
        `${Math.round((100 * b.runder) / n)} %`.padStart(8) +
        p(b.tap / b.runder).padStart(11) +
        `${Math.round((100 * b.tap) / totalTap)} %`.padStart(13) +
        (b.budN > 0 ? (b.budSum / b.budN).toFixed(2) : "–").padStart(10) +
        (b.stikkSum / b.runder).toFixed(2).padStart(12),
    );
  }
  const sf = bøtter.spillefører!;
  if (sf.runder > 0) {
    console.log(
      `\nSom spillefører: innfridd ${Math.round((100 * sf.klart) / sf.runder)} %` +
        ` mot nevros ${Math.round((100 * sf.nevroKlart) / sf.runder)} % paa DE SAMME givene`,
    );
    for (const [navn, b] of [["  klarte kontrakten", klartB], ["  falt", faltB]] as const) {
      if (b.runder === 0) continue;
      console.log(
        navn.padEnd(22) +
          `${b.runder} runder`.padStart(12) +
          p(b.tap / b.runder).padStart(11) + " per runde" +
          `   bud ${b.budN > 0 ? (b.budSum / b.budN).toFixed(2) : "–"}` +
          `, lagstikk ${(b.stikkSum / b.runder).toFixed(2)}`,
      );
    }
  }
}
