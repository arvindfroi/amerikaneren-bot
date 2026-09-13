/**
 * HVOR DYR ER FASITEN? — kostnadskurven for den eksakte poengløseren.
 *
 * Forarbeid til `troledd.ts`. Punkt 1 i oppdraget krever at endrede kortvalg
 * dømmes mot FASIT, ikke mot søkets egen verdi. Fasiten her er
 * `poengRotVerdier` med `diff`-målet — samme størrelse som `standardMål`, altså
 * det søket selv rangerer på, men løst EKSAKT på den virkelige given.
 *
 * Spørsmålet denne fila svarer på er rent praktisk: fra hvor mange kort igjen
 * er den løsbar innenfor et budsjett? Uten det tallet vet jeg ikke om dommen
 * kan felles i hele runden eller bare i sluttspillet.
 *
 *   node examples/troledd-kostnad.ts --runder 3 --tak 9
 */

import { opprettSpill, utfør } from "../src/index.ts";
import type { GameState } from "../src/motor.ts";
import { FARGER } from "../src/kort.ts";
import { lagIndre, ADAMS_MAALT, tall } from "../src/moe2/agentspek.ts";
import { kortTilInt } from "../src/solver/dds.ts";
import { poengRotVerdier } from "../src/solver/poengdds.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const RUNDER = tall(arg("--runder", "3"), 3, "runder");
/** Største antall kort på hånd der fasiten i det hele tatt forsøkes. */
const TAK = tall(arg("--tak", "9"), 9, "tak");
/** Avbryt hele kjøringen om ett enkelt kall tar mer enn dette. */
const VEGG_MS = tall(arg("--vegg", "120000"), 120_000, "vegg");

const agenter = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
for (const a of agenter) a.nyKamp();

interface Rad {
  igjen: number;
  ms: number;
  noder: number;
  kandidater: number;
}
const rader: Rad[] = [];

let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, 13_000_777);
let vakt = 0;
let r = 0;
let avbrutt = false;

while (s.fase !== "FERDIG" && vakt++ < 40_000 && r < RUNDER && !avbrutt) {
  if (s.fase === "RUNDE_SLUTT") {
    for (const a of agenter) (a as { observer?(x: GameState): void }).observer?.(s);
    r++;
    s = utfør(s, { type: "NESTE" }).state;
    continue;
  }
  const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
  if (iTur === null || iTur === undefined) break;

  if (
    s.fase === "SPILL" &&
    s.iTur !== null &&
    s.trumf !== null &&
    s.budvinner !== null &&
    s.melding !== null
  ) {
    const igjen = s.hender[s.iTur]?.length ?? 0;
    const alleHar = s.hender.every((h) => h.length > 0);
    if (igjen > 0 && igjen <= TAK && alleHar) {
      const t0 = performance.now();
      const svar = poengRotVerdier({
        N: s.antallSpillere,
        trump: FARGER.indexOf(s.trumf),
        hender: s.hender.map((h) => h.map(kortTilInt)),
        iTur: s.iTur,
        bord: s.bord.map((kp) => ({ spiller: kp.spiller, kort: kortTilInt(kp.kort) })),
        stikkFør: s.stikkVunnet.slice(),
        ferdigeStikk: s.stikkSpilt,
        totalStikk: s.giving.antallStikk,
        budvinner: s.budvinner,
        makker: s.makker,
        melding: s.melding,
        målPoeng: s.regler.målPoeng,
        mål: "diff",
      });
      const ms = performance.now() - t0;
      rader.push({ igjen, ms, noder: svar.noder, kandidater: svar.verdier.length });
      if (ms > VEGG_MS) {
        console.log(`AVBRUTT: ett kall tok ${(ms / 1000).toFixed(1)} s ved ${igjen} kort igjen`);
        avbrutt = true;
      }
    }
  }

  s = utfør(s, agenter[iTur]!.velgHandling(s)).state;
}

// Oppsummering per «kort igjen».
const perIgjen = new Map<number, number[]>();
for (const rad of rader) {
  const l = perIgjen.get(rad.igjen) ?? [];
  l.push(rad.ms);
  perIgjen.set(rad.igjen, l);
}
console.log("kort igjen |    n |  median ms |     maks ms |   snitt noder");
console.log("-".repeat(64));
for (const igjen of [...perIgjen.keys()].sort((a, b) => a - b)) {
  const v = perIgjen.get(igjen)!.slice().sort((a, b) => a - b);
  const median = v[Math.floor(v.length / 2)]!;
  const maks = v[v.length - 1]!;
  const noder = rader.filter((x) => x.igjen === igjen).reduce((a, x) => a + x.noder, 0) / v.length;
  console.log(
    `${String(igjen).padStart(10)} | ${String(v.length).padStart(4)} | ${median.toFixed(1).padStart(10)} | ${maks.toFixed(1).padStart(11)} | ${noder.toFixed(0).padStart(13)}`,
  );
}
console.log(`\nTotalt ${rader.length} kall over ${r} runder.`);
