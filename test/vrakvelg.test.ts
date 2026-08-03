/**
 * VRAKVELGEREN: doktrinen må være en INVARIANT, ikke et ønske.
 *
 * Arvind: «man hiver aldri ut der. Ikke en toer engang.» Regelen er absolutt,
 * og den håndheves i kandidatgenereringen – trumfkortene legges aldri i
 * utvalgspoolen. Denne testen sjekker at det faktisk holder i SPILL, ikke bare
 * i teorien: over mange runder skal antall vrakede trumfkort være NØYAKTIG
 * null.
 *
 * Til sammenlikning vraket NevroHjerne et kort i fargen som ble trumf i 36 av
 * 2 000 runder (`examples/vraktrumf.ts`). Det er ikke mye, men doktrinen er
 * absolutt, og en invariant som holder «nesten alltid» er ingen invariant.
 *
 * Den andre påstanden: vrakvelgeren må faktisk VELGE trumfen som paret ble
 * evaluert med. Glemmes koblingen mellom VRAK og VELG, er hele poenget borte –
 * og feilen ville vært usynlig, siden begge handlingene er lovlige hver for seg.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { Vrakvelger } from "../src/moe2/vrakvelg.ts";
import type { Farge, Kort } from "../src/kort.ts";

function kjør(runder: number, frø0: number): {
  runder: number;
  trumfVraket: number;
  paretHoldt: number;
  paretBrutt: number;
} {
  const nevro = new NevroAgent();
  const agent = new Vrakvelger(nevro, nevro, { verdener: 4, maksPar: 8, frø: 12345 });
  let n = 0;
  let trumfVraket = 0;
  let paretHoldt = 0;
  let paretBrutt = 0;

  for (let i = 0; i < runder; i++) {
    let s: GameState = opprettSpill({ antallSpillere: 4 }, frø0 + i * 2711);
    agent.nyKamp();
    let vraket: Kort[] | null = null;
    let g = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 600) {
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      const h: Handling = agent.velgHandling(s);
      if (h.type === "VRAK") vraket = h.kort.slice();
      if (h.type === "VELG") {
        const trumf: Farge = h.trumf;
        if (vraket !== null) {
          n++;
          const iTrumf = vraket.filter((k) => k.farge === trumf).length;
          trumfVraket += iTrumf;
          if (iTrumf === 0) paretHoldt++;
          else paretBrutt++;
        }
        break; // resten av runden er irrelevant her
      }
      s = utfør(s, h).state;
    }
  }
  return { runder: n, trumfVraket, paretHoldt, paretBrutt };
}

test("INVARIANT: vrakvelgeren vraker ALDRI et kort i fargen den velger som trumf", () => {
  const r = kjør(60, 3_300_000);
  assert.ok(r.runder >= 30, `for faa runder med vrak+velg (${r.runder})`);
  assert.equal(
    r.trumfVraket,
    0,
    `DOKTRINEN ER BRUTT: ${r.trumfVraket} trumfkort vraket over ${r.runder} runder ` +
      `(${r.paretBrutt} runder). Regelen er absolutt - ikke en toer engang.`,
  );
  assert.equal(r.paretHoldt, r.runder, "paret trumf/vrak holdt ikke i alle runder");
});

test("vrakvelgeren gjoer et faktisk valg, ikke bare nevros", () => {
  // Er alle valgene identiske med NevroHjernes, gjoer klassen ingenting - og
  // en gate 2 paa den ville maalt null uten at noen forsto hvorfor.
  const nevro = new NevroAgent();
  const agent = new Vrakvelger(new NevroAgent(), nevro, { verdener: 4, maksPar: 8, frø: 999 });
  let ulike = 0;
  let sett = 0;
  for (let i = 0; i < 40; i++) {
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 4_400_000 + i * 3301);
    agent.nyKamp();
    nevro.nyKamp();
    let g = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 600) {
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      if (s.fase === "VRAK") {
        const min = agent.velgHandling(s);
        const deres = nevro.velgHandling(s);
        if (min.type === "VRAK" && deres.type === "VRAK") {
          sett++;
          const a = min.kort.map((k) => `${k.farge}${k.verdi}`).sort().join(",");
          const b = deres.kort.map((k) => `${k.farge}${k.verdi}`).sort().join(",");
          if (a !== b) ulike++;
        }
        s = utfør(s, min).state;
        continue;
      }
      s = utfør(s, agent.velgHandling(s)).state;
    }
  }
  assert.ok(sett >= 20, `for faa vrakbeslutninger sett (${sett})`);
  assert.ok(ulike > 0, `vrakvelgeren valgte IDENTISK med nevro i alle ${sett} tilfeller`);
});
