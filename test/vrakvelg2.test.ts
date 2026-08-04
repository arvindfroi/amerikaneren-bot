/**
 * VRAKVELGER 2: skrankene må være INVARIANTER, ikke preferanser.
 *
 * Arvind: «den skal alltid ta inn trumf og ess hvis mulig, og den skal aldri
 * vrake trumf og ess. Den skal også vurdere om mulig renons gir fordel.»
 *
 * Alle fire påstandene svikter stille om de brytes — de gir bare litt dårligere
 * spill, ikke en feilmelding. Derfor telles de over mange runder og kreves
 * eksakt:
 *
 *   1. ALDRI trumf i vraket. Null, ikke «nesten null».
 *   2. ALDRI ess i vraket. Samme.
 *   3. TRUMFEN SENDES VIDERE: den som ble valgt ved VRAK må være den som
 *      meldes ved VELG. Uten koblingen vurderes vraket under én trumf og
 *      spilles under en annen — nøyaktig feilen NevroHjerne gjør.
 *   4. RENONSE MÅ VURDERES: kandidatgeneratoren skal faktisk produsere vrak
 *      som tømmer en farge, ellers er «vurder renonse» tomme ord.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { Vrakvelger2 } from "../src/moe2/vrakvelg2.ts";
import type { Farge, Kort } from "../src/kort.ts";

interface Utfall {
  runder: number;
  trumfVraket: number;
  essVraket: number;
  paretHoldt: number;
  medRenonse: number;
}

function kjør(runder: number, frø0: number): Utfall {
  const nevro = new NevroAgent();
  const agent = new Vrakvelger2(nevro, nevro, { verdener: 4, frø: 4242 });
  const u: Utfall = { runder: 0, trumfVraket: 0, essVraket: 0, paretHoldt: 0, medRenonse: 0 };

  for (let i = 0; i < runder; i++) {
    let s: GameState = opprettSpill({ antallSpillere: 4 }, frø0 + i * 2903);
    agent.nyKamp();
    let vraket: Kort[] | null = null;
    let hånd: Kort[] | null = null;
    let g = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 600) {
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      if (s.fase === "VRAK") hånd = (s.hender[iTur] ?? []).slice();
      const h: Handling = agent.velgHandling(s);
      if (h.type === "VRAK") vraket = h.kort.slice();
      if (h.type === "VELG") {
        const trumf: Farge = h.trumf;
        if (vraket !== null && hånd !== null) {
          u.runder++;
          u.trumfVraket += vraket.filter((k) => k.farge === trumf).length;
          u.essVraket += vraket.filter((k) => k.verdi === 14).length;
          if (vraket.filter((k) => k.farge === trumf).length === 0) u.paretHoldt++;
          // Ble en sidefarge TOM av vraket?
          const igjen = new Map<Farge, number>();
          for (const k of hånd) igjen.set(k.farge, (igjen.get(k.farge) ?? 0) + 1);
          for (const k of vraket) igjen.set(k.farge, (igjen.get(k.farge) ?? 0) - 1);
          for (const [f, n] of igjen) if (f !== trumf && n === 0) u.medRenonse++;
        }
        break;
      }
      s = utfør(s, h).state;
    }
  }
  return u;
}

test("INVARIANT: aldri trumf og aldri ess i vraket", () => {
  const u = kjør(50, 5_500_000);
  assert.ok(u.runder >= 25, `for faa runder med vrak+velg (${u.runder})`);
  assert.equal(
    u.trumfVraket,
    0,
    `TRUMF VRAKET ${u.trumfVraket} ganger over ${u.runder} runder. Skranken er absolutt.`,
  );
  assert.equal(
    u.essVraket,
    0,
    `ESS VRAKET ${u.essVraket} ganger over ${u.runder} runder. Skranken er absolutt.`,
  );
});

test("TRUMFEN SENDES VIDERE: paret som ble valgt er paret som spilles", () => {
  const u = kjør(50, 6_600_000);
  assert.equal(u.paretHoldt, u.runder, "trumfen ved VELG er ikke den vraket ble valgt for");
});

test("RENONSE VURDERES: generatoren produserer vrak som toemmer en farge", () => {
  const u = kjør(60, 7_700_000);
  assert.ok(
    u.medRenonse > 0,
    `ingen av ${u.runder} runder ga renonse - da er «vurder renonse» tomme ord`,
  );
});

test("velgeren tar et FAKTISK valg, ikke bare nevros", () => {
  const nevro = new NevroAgent();
  const agent = new Vrakvelger2(new NevroAgent(), nevro, { verdener: 4, frø: 77 });
  let ulike = 0;
  let sett = 0;
  for (let i = 0; i < 40; i++) {
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 8_800_000 + i * 3301);
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
          const n = (k: readonly Kort[]): string =>
            k.map((x) => `${x.farge}${x.verdi}`).sort().join(",");
          if (n(min.kort) !== n(deres.kort)) ulike++;
        }
        s = utfør(s, min).state;
        continue;
      }
      s = utfør(s, agent.velgHandling(s)).state;
    }
  }
  assert.ok(sett >= 20, `for faa vrakbeslutninger (${sett})`);
  assert.ok(ulike > 0, `valgte IDENTISK med nevro i alle ${sett} tilfeller`);
});
