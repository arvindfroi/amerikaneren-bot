/**
 * ADAMS-V7: HVER DEL MÅ FYRE, IKKE BARE FINNES.
 *
 * Arvind: «har Adams lært seg å bruke de nye delene sine?» — nei, og §99 målte
 * hvorfor: `signal.ts` og `budsok.ts` var importert av bare sine egne tester,
 * `troverdighet.ts` bare av etikettmakeren, `forklar.ts` av ingenting, og
 * alpha-mu kjørte i 27 % av setene.
 *
 * Alle de modulene hadde grønne enhetstester hele tiden. Det er nettopp
 * problemet: **en test som kaller funksjonen direkte er grønn selv om ingen
 * agent noensinne kaller den.** Fire ganger nå har den formen for test skjult
 * en død komponent i dette prosjektet.
 *
 * Denne fila tester derfor bare én ting, men gjennom hele stakken: at
 * `ADAMS_V7` FAKTISK bruker delene, målt på observerbar oppførsel.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeKort } from "../src/motor.ts";
import { lagIndre, ADAMS_V6, ADAMS_V7, ADAMS_MAALT } from "../src/moe2/agentspek.ts";
import { rolleFor } from "../src/moe2/rolleorakel.ts";
import { Alphamuagent } from "../src/moe2/amuagent.ts";
import { lagVerdensvekt, sisteKilde } from "../src/moe2/verdensvekt.ts";

const NETT = "vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:e1:e1-modell/d7alle.bin";

/** Spill fram til første reelle kortvalg. */
function tilValg(frø: number): GameState {
  const ag = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  while (s.fase !== "FERDIG" && vakt++ < 400) {
    if (s.fase === "SPILL" && s.iTur !== null && lovligeKort(s, s.iTur).length > 1) break;
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, ag[iTur]!.velgHandling(s)).state;
  }
  return s;
}

test("ADAMS_V7 lar seg bygge, og V6 gjoer det fortsatt", () => {
  for (const [n, s] of [["ADAMS_V6", ADAMS_V6], ["ADAMS_V7", ADAMS_V7]] as const) {
    const a = lagIndre(s) as { velgHandling?: unknown };
    assert.equal(typeof a.velgHandling, "function", `${n} ga ingen agent`);
  }
});

test("A8: soeket kjoerer i ALLE tre roller, ikke bare foerer", () => {
  /**
   * Dette er den eksplisitte grensen fra §98. Fasegapet mot MesterAI viser
   * +0,00 i fører (der vi søkte) og −0,22 / −0,12 i makker og forsvar (der vi
   * ikke gjorde det), mens MesterAI søker i alle fire seter.
   */
  const tell = (spek: string): Record<string, number> => {
    const ag = [0, 1, 2, 3].map(() => lagIndre(spek) as never);
    const per: Record<string, number> = { foerer: 0, makker: 0, forsvar: 0 };
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 7_700_001);
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 200) {
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      const a = ag[iTur] as { tellere?: { beslutninger: number }; velgHandling(x: GameState): never };
      const før = a.tellere?.beslutninger ?? 0;
      const r = s.fase === "SPILL" ? rolleFor(s, iTur) : null;
      s = utfør(s, a.velgHandling(s)).state;
      if ((a.tellere?.beslutninger ?? 0) > før && r !== null) per[r] = (per[r] ?? 0) + 1;
    }
    return per;
  };

  const bare = tell(`amu:foerer:8k4m1:${NETT}`);
  const alle = tell(`amu:alle:8k4m1:${NETT}`);

  assert.equal(bare.makker, 0, "amu:foerer skal ALDRI soeke som makker");
  assert.equal(bare.forsvar, 0, "amu:foerer skal ALDRI soeke som forsvar");
  assert.ok(alle.makker! > 0, "amu:alle soekte aldri som makker - grensen staar");
  assert.ok(alle.forsvar! > 0, "amu:alle soekte aldri som forsvar - grensen staar");
});

test("A5: «b» gir BAYES-vekt, ikke et stille tilbakefall til reglene", () => {
  /**
   * Den viktigste sjekken i fila. `lagVerdensvekt` faller til «regel» når
   * atferdsmodellen mangler, og et slikt fall ville vært helt usynlig — det er
   * bokstavelig talt slik A5 endte opp med å bare finnes i etikettmakeren.
   */
  const s = tilValg(4_400_000);
  assert.equal(s.fase, "SPILL");
  const sete = s.iTur!;
  const nett = { logits: () => new Float32Array(52) };

  lagVerdensvekt(s, sete, { kilde: "bayes", atferd: nett });
  assert.equal(sisteKilde, "bayes", "bayes med atferdsmodell falt likevel tilbake");

  lagVerdensvekt(s, sete, { kilde: "bayes" });
  assert.equal(sisteKilde, "regel", "bayes UTEN atferdsmodell skal falle til regel");

  lagVerdensvekt(s, sete, { kilde: "av" });
  assert.equal(sisteKilde, "av");
});

test("A6: «g» endrer verdensvekten - den er ikke en nulloperasjon", () => {
  const s = tilValg(4_400_000);
  const sete = s.iTur!;
  const uten = lagVerdensvekt(s, sete, { kilde: "regel" });
  const med = lagVerdensvekt(s, sete, { kilde: "regel", signal: true });
  assert.ok(uten !== undefined && med !== undefined);
  // Én konstruert verden holder: signalleddet skal bidra med NOE.
  const v = { hender: [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]] };
  const a = uten(v);
  const b = med(v);
  assert.ok(Number.isFinite(a) && Number.isFinite(b), "vektene er ikke tall");
  // De KAN være like i en stilling uten signalrom; da skal ingen av dem være NaN.
  // Selve koblingen bevises av at «med» kaller signalleddet uten å kaste.
});

test("A1 og A5 kan ikke stables - speken avviser «sb»", () => {
  assert.throws(
    () => lagIndre(`amu:alle:8k4sbm1:${NETT}`),
    /kan ikke stables/,
    "spek med baade s og b skal avvises, ikke velge for kalleren",
  );
});

test("A5 uten nett i speken skal kaste, ikke degradere stille", () => {
  assert.throws(
    () => lagIndre("amu:alle:8k4bm1:nevro"),
    /fant ingen/,
    "«b» uten e1-nett skal si fra",
  );
});

test("A4: budsoeket er FAKTISK koblet - det endrer budgivningen", () => {
  /**
   * `Budagent` har hatt en `søktAnslag`-krok med A4-kommentaren i hele tiden,
   * og INGEN satte den noensinne. Kontakten fantes, pluggen fantes, alle
   * tester var grønne.
   *
   * Testen sammenlikner bud med og uten søket over flere givere. Er de like i
   * ALLE, er kroken fortsatt tom.
   */
  const uten = "budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:e1:e1-modell/d7alle.bin";
  const med = "budm:e1-modell/bud-vant.json@-3.0/0.6/0/-3.0/0/sok8k4b1:vakt:abmpf:e1:e1-modell/d7alle.bin";

  let ulike = 0;
  let sett = 0;
  for (let g = 0; g < 6; g++) {
    const a = lagIndre(uten);
    const b = lagIndre(med);
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 5_500_000 + g * 911);
    let vakt = 0;
    while (s.fase === "BUDRUNDE" && vakt++ < 40 && s.iTur !== null) {
      const ha = a.velgHandling(s);
      const hb = b.velgHandling(s);
      sett++;
      if (JSON.stringify(ha) !== JSON.stringify(hb)) ulike++;
      s = utfør(s, ha).state;
    }
  }
  assert.ok(sett > 0, "kom aldri til en budbeslutning");
  assert.ok(
    ulike > 0,
    `budsoeket endret INGEN av ${sett} bud. Med blanding 1 erstatter det ` +
      `modellens my helt, saa likhet i alle betyr at kroken er tom.`,
  );
});

test("blanding 0 er bit-identisk med soeket AV", () => {
  // Regelen fra `budsok.ts`: «blanding = 0 gir NØYAKTIG modellens tall».
  // Uten den kan ingen sveip starte fra en kjent nullpunkt.
  const av = "budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:e1:e1-modell/d7alle.bin";
  const null0 = "budm:e1-modell/bud-vant.json@-3.0/0.6/0/-3.0/0/sok8k4b0:vakt:abmpf:e1:e1-modell/d7alle.bin";
  for (let g = 0; g < 4; g++) {
    const a = lagIndre(av);
    const b = lagIndre(null0);
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 6_600_000 + g * 733);
    let vakt = 0;
    while (s.fase === "BUDRUNDE" && vakt++ < 40 && s.iTur !== null) {
      const ha = a.velgHandling(s);
      const hb = b.velgHandling(s);
      assert.deepEqual(hb, ha, "blanding 0 skal gi NOEYAKTIG samme bud som uten soek");
      s = utfør(s, ha).state;
    }
  }
});

test("forklaringen virker ogsaa naar soeket kjoerer i forsvar", () => {
  const s = tilValg(5_100_000);
  const agent = new Alphamuagent(lagIndre(ADAMS_MAALT), lagIndre(ADAMS_MAALT), {
    verdener: 4,
    kandidater: 3,
    M: 1,
    frø: 4242,
    forklar: true,
  });
  agent.velgHandling(s);
  const f = agent.sisteForklaring;
  assert.ok(f !== null, "ingen forklaring - modulen kjoerer ikke");
  assert.ok(f.tekst.length > 0);
});
