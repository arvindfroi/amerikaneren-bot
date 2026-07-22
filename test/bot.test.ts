import { test } from "node:test";
import assert from "node:assert/strict";
import {
  opprettSpill,
  lovligeHandlinger,
  lovligeKort,
  utfør,
  type GameState,
  type Handling,
} from "../src/motor.ts";
import { velgHandling, BotAgent } from "../src/bot/bot.ts";
import { lagRng } from "../src/kort.ts";

const RASKT = { verdener: 5, terskel: 4 } as const;

test("velgHandling gir en lovlig handling i hver fase, og runden fullføres", () => {
  let s = opprettSpill({ antallSpillere: 4 }, 424242);
  let guard = 0;
  while (s.fase !== "RUNDE_SLUTT" && s.fase !== "FERDIG" && guard++ < 3000) {
    const h = velgHandling(s, { ...RASKT, frø: 1000 + guard });
    // Lovlighet av kort-trekk sjekkes eksplisitt.
    if (h.type === "SPILL") {
      const lov = lovligeKort(s, h.spiller);
      assert.ok(lov.some((k) => k.farge === h.kort.farge && k.verdi === h.kort.verdi), "botens kort må være lovlig");
    }
    s = utfør(s, h).state; // utfør kaster ved ulovlig handling
  }
  assert.ok(s.fase === "RUNDE_SLUTT" || s.fase === "FERDIG");
  if (s.sisteRunde) {
    const sum = s.sisteRunde.stikkVunnet.reduce((a, b) => a + b, 0);
    assert.equal(sum, s.giving.antallStikk);
  }
});

// Bygger en SPILL-stilling med budvinner 0, makker 2, tallbud 7.
function byggSpillStart(seed: number): GameState | null {
  const base = opprettSpill({ antallSpillere: 4 }, seed);
  const p2 = base.hender[2]!;
  const tel: Record<string, number> = { S: 0, H: 0, R: 0, K: 0 };
  for (const k of base.hender[0]!) tel[k.farge]!++;
  for (const k of p2) tel[k.farge]!++;
  const trumf = (["S", "H", "R", "K"] as const)
    .filter((f) => p2.some((k) => k.farge === f))
    .sort((a, b) => tel[b]! - tel[a]!)[0];
  if (!trumf) return null;
  const et = p2.filter((k) => k.farge === trumf).sort((a, b) => b.verdi - a.verdi)[0]!;
  return {
    ...base,
    fase: "SPILL",
    budvinner: 0,
    melding: { type: "tall", bud: 7 },
    trumf,
    etterlyst: et,
    makker: 2,
    makkerAvslørt: false,
    utspiller: 0,
    iTur: 0,
    bord: [],
    stikkVunnet: [0, 0, 0, 0],
    stikkSpilt: 0,
    historikk: [],
    forrigeStikk: null,
    vrak: base.talong,
    talong: [],
  };
}

function spillUt(start: GameState, pimcSeter: Set<number>, rng: () => number): number {
  let s = start;
  let g = 0;
  while (s.fase === "SPILL" && g++ < 200) {
    const seat = s.iTur!;
    let h: Handling;
    if (pimcSeter.has(seat)) {
      h = velgHandling(s, { ...RASKT, frø: 500 + seat * 31 + g });
    } else {
      const lov = lovligeHandlinger(s);
      h =
        lov.fase === "SPILL"
          ? { type: "SPILL", spiller: lov.spiller, kort: lov.kort[Math.floor(rng() * lov.kort.length)]! }
          : { type: "NESTE" };
    }
    s = utfør(s, h).state;
  }
  const sv = s.sisteRunde ? s.sisteRunde.stikkVunnet : s.stikkVunnet;
  return (sv[0] ?? 0) + (sv[2] ?? 0);
}

test("BotAgent holder hardt tidstak og akkumulerer ved pondering", () => {
  // Kjør til åpningsutspillet (det tyngste kortvalget).
  let s = opprettSpill({ antallSpillere: 4 }, 321);
  let guard = 0;
  while (s.fase !== "SPILL" && guard++ < 500) {
    const h = velgHandling(s, RASKT);
    s = utfør(s, h).state;
  }
  assert.equal(s.fase, "SPILL");
  const plass = s.iTur!;

  // Hardt tak: beslutt(maksMs) skal aldri blokkere vesentlig over taket.
  const maks = 400;
  const agent = new BotAgent(plass, { terskel: 7, frø: 3 });
  const t0 = Date.now();
  const h = agent.beslutt(s, maks);
  const brukt = Date.now() - t0;
  assert.equal(h.type, "SPILL");
  assert.ok(brukt < maks + 700, `blokkerte ${brukt}ms, taket var ${maks}ms`);

  // Pondering banker verdener uten å blokkere på selve turen.
  const p = new BotAgent(plass, { terskel: 7, frø: 4 });
  p.pondre(s, 300);
  p.pondre(s, 300);
  assert.ok(p.ponderetVerdener(s) >= 1, "pondering skal ha akkumulert verdener");
});

test("PIMC-boten tar flere stikk enn tilfeldig spill (samme givere)", () => {
  const rng = lagRng(31);
  let sumPimc = 0;
  let sumRand = 0;
  let n = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const start = byggSpillStart(seed * 17 + 5);
    if (!start) continue;
    sumPimc += spillUt(start, new Set([0, 2]), rng); // budlaget spilt av PIMC
    sumRand += spillUt(start, new Set<number>(), rng); // alt tilfeldig
    n++;
  }
  assert.ok(n >= 6, "nok givere");
  // Med ~0.8 stikk fordel per giv skal PIMC-summen ligge klart over.
  assert.ok(sumPimc > sumRand, `PIMC ${sumPimc} skal slå tilfeldig ${sumRand}`);
});
