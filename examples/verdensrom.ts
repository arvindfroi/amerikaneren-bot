/**
 * HVOR STORT ER VERDENSROMMET — og fra hvilket stikk kan vi slutte å sample?
 *
 *   node examples/verdensrom.ts 18000000 300 analyse/verdensrom.json
 *
 * HVORFOR SPØRSMÅLET ER DET RIKTIGE NÅ. Arvind: «hva deler av spillet kan vi
 * matematisk optimalisere 100 % først?»
 *
 * Alt vi har målt i dag er samplingsbegrenset. `ork:foerer` med 12 verdener ga
 * +0,233; med 24 ga den +0,414. Å doble utvalget nesten doblet gevinsten, og
 * atferdsmålingen viste hvorfor: med 12 verdener var orakelet SIKKERT i bare
 * 1,3 % av uenighetene. Resten var gjetning på støy.
 *
 * Grensen den trenden peker mot er å slutte å sample: enumerere ALLE verdener
 * som er forenlige med den offentlige informasjonen. Da er det ingen
 * samplingsstøy igjen – bare den eksakte forventningen over posterioren.
 *
 * MASKINERIET FINNES ALT (`src/solver/eksakt.ts`), og det er brukt før – men
 * med DOBBELT-DUMMY inne i hver verden, altså «alle spiller perfekt med full
 * informasjon». Det er målt til korrelasjon −0,609 mot poeng og forkastet.
 * Kombinasjonen som ALDRI er prøvd er uttømmende enumerasjon med VÅR EGEN
 * POLICY som utspiller – eksakt posterior, riktig motstandermodell.
 *
 * DENNE MÅLINGEN AVGJØR OM DET ER RÅD. For hver stilling telles antallet
 * forenlige verdener, og vi leser av fra hvilket stikk det faller under
 * budsjettet. Enumerasjonen krymper fort, fordi hvert spilt kort og hver
 * renonse skjærer bort muligheter – og troblokken (v6) er nettopp et mål på
 * den innskrenkingen.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lesInformasjon, tellKonfigurasjoner } from "../src/solver/eksakt.ts";
import { lagIndre, ADAMS, tall } from "../src/moe2/agentspek.ts";

const FRØ0 = tall(process.argv[2], 18_000_000, "argv[2]");
const RUNDER = tall(process.argv[3], 300, "argv[3]");
const UT = process.argv[4] ?? "analyse/verdensrom.json";
/** Tak: over dette gir tellingen opp, og stillingen regnes som «for stor». */
const TAK = tall(process.argv[5], 2_000_000, "argv[5]");
// HARDKODET til ftf1.bin fram til 5. august – et helt annet nett enn det
// utrullede. Nå den kanoniske stakken, og overstyrbar fra kommandolinja.
const SPEK = process.argv[4] ?? ADAMS;



const agent = lagIndre(SPEK);
/** stikk → liste av verdenstall. */
const perStikk = new Map<number, number[]>();

for (let i = 0; i < RUNDER; i++) {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, FRØ0 + i * 5077);
  agent.nyKamp();
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 600) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    if (s.fase === "SPILL" && s.iTur !== null) {
      const info = lesInformasjon(s, s.iTur);
      const e = tellKonfigurasjoner(info, TAK);
      const liste = perStikk.get(s.stikkSpilt) ?? [];
      // Full = hele rommet ble dekket. Ellers er tallet en NEDRE grense, og
      // det skal ikke blandes inn i en median som om det var eksakt.
      liste.push(e.full ? e.verdener : Number.POSITIVE_INFINITY);
      perStikk.set(s.stikkSpilt, liste);
    }
    s = utfør(s, agent.velgHandling(s)).state;
  }
}

function kvantil(xs: number[], q: number): number {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? Number.NaN;
}

const rader = [...perStikk.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([stikk, xs]) => {
    const endelige = xs.filter((x) => Number.isFinite(x));
    const andelUnder = (grense: number): number =>
      xs.filter((x) => x <= grense).length / xs.length;
    return {
      stikk,
      n: xs.length,
      andelFull: endelige.length / xs.length,
      median: kvantil(endelige, 0.5),
      p90: kvantil(endelige, 0.9),
      under1k: andelUnder(1_000),
      under10k: andelUnder(10_000),
      under100k: andelUnder(100_000),
    };
  });

mkdirSync(dirname(UT), { recursive: true });
writeFileSync(UT, JSON.stringify({ frø0: FRØ0, runder: RUNDER, tak: TAK, rader }, null, 2), "utf-8");

console.log(`FORENLIGE VERDENER PER STIKK (${RUNDER} runder, tak ${TAK.toLocaleString("nb-NO")})\n`);
console.log(
  `${"stikk".padEnd(7)}${"n".padStart(6)}${"median".padStart(14)}${"p90".padStart(14)}` +
    `${"<1k".padStart(8)}${"<10k".padStart(8)}${"<100k".padStart(8)}`,
);
for (const r of rader) {
  // Kort form: tallene naar 10^14 i stikk 0, og full gruppering sprengte
  // kolonnebredden saa tabellen ble uleselig.
  const f = (x: number): string => {
    if (!Number.isFinite(x)) return "—";
    if (x >= 1e6) return `${(x / 1e6).toPrecision(3)}M`;
    if (x >= 1e3) return `${(x / 1e3).toPrecision(3)}k`;
    return String(Math.round(x));
  };
  console.log(
    `${String(r.stikk).padEnd(7)}${String(r.n).padStart(6)}${f(r.median).padStart(14)}${f(r.p90).padStart(14)}` +
      `${`${(r.under1k * 100).toFixed(0)} %`.padStart(8)}${`${(r.under10k * 100).toFixed(0)} %`.padStart(8)}` +
      `${`${(r.under100k * 100).toFixed(0)} %`.padStart(8)}`,
  );
}
console.log(`\nSkrevet til ${UT}`);
