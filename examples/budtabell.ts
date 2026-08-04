/**
 * BUDTABELLEN FOR EN GITT SPILLER: hva hånden inneholdt da den bød slik.
 *
 *   node examples/budtabell.ts 33000000 3000 analyse/budtabell-bot.json
 *
 * HVORFOR DEN MÅ FINNES FOR BOTEN OG IKKE BARE FOR MENNESKENE.
 * `src/moe2/motstander.ts` har målte tall for familien (768 runder, hånden
 * rekonstruert fra kortene de spilte). Men brukes den tabellen til å vekte
 * verdener i SELVSPILL, er prioren feilspesifisert: der byr `bud-gbt.json`,
 * ikke et menneske, og de to byr målbart ulikt.
 *
 * Det er nøyaktig samme klasse feil som kostet oss et døgn: SD-orakelet rullet
 * ut med NevroHjerne mens bordet spilte som Adams, og førersetet målte −0,357
 * i stedet for +0,896. **En prior som beskriver feil motpart er verre enn
 * ingen prior**, fordi den skyver utvalget systematisk feil vei.
 *
 * Derfor: én tabell per budpolicy. Denne måler botens egen.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { håndtrekk } from "../src/moe2/motstander.ts";
import { lagIndre, ADAMS, tall } from "../src/moe2/agentspek.ts";

const FRØ0 = tall(process.argv[2], 33_000_000, "argv[2]");
const RUNDER = tall(process.argv[3], 3000, "argv[3]");
const UT = process.argv[4] ?? "analyse/budtabell-bot.json";
const SPEK = process.argv[5] ?? ADAMS;



const agent = lagIndre(SPEK);
/** bud (0 = passet uten tallbud) → observasjoner. */
const per = new Map<number, { lengste: number[]; honnør: number[] }>();

for (let i = 0; i < RUNDER; i++) {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, FRØ0 + i * 4211);
  agent.nyKamp();
  // Hendene slik de ble DELT UT, før talongen og vraket rører budvinnerens.
  const utdelt = [0, 1, 2, 3].map((p) => (s.hender[p] ?? []).slice());
  const høyeste = [0, 0, 0, 0];
  let g = 0;
  let sett = false;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 600) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    const h = agent.velgHandling(s);
    if (h.type === "BUD" && typeof h.bud === "number") {
      høyeste[h.spiller] = Math.max(høyeste[h.spiller] ?? 0, h.bud);
    }
    if (s.fase === "SPILL" && !sett) {
      sett = true;
      // BUDVINNEREN UTELATES: hun tok opp talongen og vraket fire, så den
      // utdelte hånden er ikke den hun spiller — og motstandermodellen skal
      // beskrive det ANDRE kan slutte fra budet, ikke fasiten.
      for (let p = 0; p < 4; p++) {
        if (p === s.budvinner) continue;
        const t = håndtrekk(utdelt[p]!);
        const bud = høyeste[p] ?? 0;
        const b = per.get(bud) ?? { lengste: [], honnør: [] };
        b.lengste.push(t.lengste);
        b.honnør.push(t.honnør);
        per.set(bud, b);
      }
      break;
    }
    s = utfør(s, h).state;
  }
}

const snitt = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sd = (xs: number[]): number => {
  const m = snitt(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1));
};

const rader = [...per.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([bud, o]) => ({
    bud,
    n: o.lengste.length,
    mLengste: Number(snitt(o.lengste).toFixed(3)),
    sdLengste: Number(sd(o.lengste).toFixed(3)),
    mHonnør: Number(snitt(o.honnør).toFixed(3)),
    sdHonnør: Number(sd(o.honnør).toFixed(3)),
  }));

mkdirSync(dirname(UT), { recursive: true });
writeFileSync(UT, JSON.stringify({ spek: SPEK, runder: RUNDER, rader }, null, 2), "utf-8");

console.log(`BUDTABELL for ${SPEK}\n(${RUNDER} runder, budvinneren utelatt)\n`);
console.log(`${"bud".padEnd(8)}${"n".padStart(7)}${"lengste".padStart(16)}${"honnoer".padStart(16)}`);
for (const r of rader) {
  const navn = r.bud === 0 ? "passet" : String(r.bud);
  console.log(
    `${navn.padEnd(8)}${String(r.n).padStart(7)}` +
      `${`${r.mLengste.toFixed(3)} ± ${r.sdLengste.toFixed(3)}`.padStart(16)}` +
      `${`${r.mHonnør.toFixed(3)} ± ${r.sdHonnør.toFixed(3)}`.padStart(16)}`,
  );
}
console.log(`\nSkrevet til ${UT}`);
