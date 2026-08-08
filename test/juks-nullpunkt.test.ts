import { strict as assert } from "node:assert";
import { test } from "node:test";

import { likeKort } from "../src/kort.ts";
import { opprettSpill, utfør, type GameState } from "../src/motor.ts";
import { NevroAgent } from "../src/nevro/agent.ts";
import { intTilKort, kortTilInt, rotVerdier } from "../src/solver/dds.ts";
import { Juksagent, fasitKort, poengfasitKort } from "../src/moe2/juksagent.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";

/**
 * ============ NULLPUNKTET SKAL VÆRE BIT-IDENTISK =======================
 *
 * Poengløseren kom inn som en BRYTER i `juksagent.ts`, ikke som en erstatning.
 * Da er den eneste måten å vite at den ikke har flyttet på noe annet, å måle
 * at bryteren AV gir nøyaktig den gamle oppførselen – kort for kort, ikke
 * «omtrent like ofte».
 *
 * Den gamle oppførselen er skrevet ut på nytt her, direkte fra `rotVerdier`,
 * så testen ikke bare sammenligner `juksagent.ts` med seg selv. Regelen den
 * håndhever er den som sto i kommentaren fra dag én: budlaget MAKSIMERER
 * `lagStikk`, forsvaret MINIMERER det, og ved uavgjort vinner det første
 * kortet `rotVerdier` returnerte.
 *
 * MERK: dette låser bare at nullpunktet ikke har flyttet seg. Det sier
 * ingenting om at nullpunktet er RIKTIG – §114 målte at det ikke er det.
 */

const nevro = new NevroAgent();

/** Ekte SPILL-stillinger med `igjen` stikk igjen, fra ulike givinger. */
function stillinger(igjen: number, antall: number): GameState[] {
  const ut: GameState[] = [];
  for (let f = 0; ut.length < antall && f < antall * 8; f++) {
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 4_400_000 + f);
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
      if (s.fase === "SPILL" && s.iTur !== null && s.giving.antallStikk - s.stikkSpilt === igjen) {
        if (s.trumf !== null && s.budvinner !== null && s.melding !== null) ut.push(s);
        break;
      }
      s = utfør(s, nevro.velgHandling(s)).state;
    }
  }
  return ut;
}

/**
 * DD-fasiten skrevet ut på nytt, uavhengig av `juksagent.ts`: budlaget vil ha
 * flest mulig `lagStikk`, forsvaret færrest, første treff vinner uavgjort.
 */
function gammelFasit(state: GameState, sete: number): number | null {
  const N = state.antallSpillere;
  const hender: number[][] = [];
  for (let p = 0; p < N; p++) {
    const hånd = state.hender[p];
    if (!hånd || hånd.length === 0) return null;
    hender.push(hånd.map(kortTilInt));
  }
  const declLag = new Array<boolean>(N).fill(false);
  declLag[state.budvinner!] = true;
  if (state.makker !== null && state.makker !== state.budvinner) declLag[state.makker] = true;
  let declStikkFør = 0;
  for (let p = 0; p < N; p++) if (declLag[p]) declStikkFør += state.stikkVunnet[p] ?? 0;

  const FARGER = ["S", "H", "R", "K"];
  const verdier = rotVerdier({
    N,
    trump: FARGER.indexOf(state.trumf as string),
    declLag,
    hender,
    iTur: sete,
    bord: state.bord.map((b) => ({ spiller: b.spiller, kort: kortTilInt(b.kort) })),
    declStikkFør,
    ferdigeStikk: state.stikkSpilt,
    totalStikk: state.giving.antallStikk,
  });
  if (verdier.length === 0) return null;
  const vilHa = declLag[sete] === true;
  let best = verdier[0]!;
  for (const v of verdier) {
    if (vilHa ? v.lagStikk > best.lagStikk : v.lagStikk < best.lagStikk) best = v;
  }
  return best.kort;
}

test("NULLPUNKTET: `dd` er kort-for-kort identisk med den gamle DD-regelen", () => {
  let sjekket = 0;
  for (const igjen of [1, 2, 3, 4]) {
    for (const s of stillinger(igjen, 8)) {
      for (let sete = 0; sete < s.antallSpillere; sete++) {
        if ((s.hender[sete]?.length ?? 0) === 0) continue;
        const forventet = gammelFasit(s, sete);
        const fikk = fasitKort(s, sete);
        if (forventet === null) {
          assert.equal(fikk, null);
          continue;
        }
        assert.ok(fikk !== null, "fasiten skal finne et kort");
        assert.ok(
          likeKort(fikk, intTilKort(forventet)),
          `avvik i sete ${sete}, ${igjen} stikk igjen: ${JSON.stringify(fikk)} mot ${JSON.stringify(intTilKort(forventet))}`,
        );
        sjekket++;
      }
    }
  }
  assert.ok(sjekket > 60, `for få stillinger sjekket: ${sjekket}`);
});

test("BRYTEREN: `juks:6` er standard `dd`, `juks:6p`/`juks:6e` er det ikke", () => {
  // Speken må ikke kunne velge poengløseren ved et uhell, og må kunne velge
  // den med vilje. Begge halvdelene måles.
  const indre = "nevro";
  const av = lagIndre(`juks:6:${indre}`);
  const på = lagIndre(`juks:6p:${indre}`);
  const egen = lagIndre(`juks:6e:${indre}`);
  assert.ok(av instanceof Juksagent);
  assert.ok(på instanceof Juksagent);
  assert.ok(egen instanceof Juksagent);

  // Konstruktøren uten mål = `dd`. Håndhevet på oppførsel, ikke på et felt.
  let ulike = 0;
  let sjekket = 0;
  for (const igjen of [2, 3, 4]) {
    for (const s of stillinger(igjen, 8)) {
      for (let sete = 0; sete < s.antallSpillere; sete++) {
        if ((s.hender[sete]?.length ?? 0) === 0) continue;
        const dd = fasitKort(s, sete);
        const poeng = poengfasitKort(s, sete, "diff");
        if (dd === null || poeng === null) continue;
        sjekket++;
        if (!likeKort(dd, poeng)) ulike++;
      }
    }
  }
  assert.ok(sjekket > 40, `for få stillinger: ${sjekket}`);
  assert.ok(
    ulike > 0,
    "poengløseren må velge et ANNET kort et sted – ellers har den ikke rettet noe",
  );
});
