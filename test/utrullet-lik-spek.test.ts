/**
 * DET UTRULLEDE OG DET MÅLTE ER SAMME BOT — håndhevet, ikke lovet.
 *
 * ARVIND: «vi skal IKKE rulle ut adams max før alle krav i adamsmax er
 * innfridd. vi har en mvp å nå. jeg setter veldig høye forventinger og skal
 * ikke rulle ut en halvbakt versjon.»
 *
 * Da må det finnes en måte å VITE at det som rulles ut er det som ble målt.
 * Prosjektets mest gjentatte feil — tretten ganger nå — er nøyaktig at de to
 * ikke var samme ting: budmodellen som pekte på `bud-gbt` i appen og
 * `bud-vant` på benken, vaktflagget som manglet `f`, trosnettet appen laster
 * ned og workeren aldri leser.
 *
 * Hver av dem ville blitt fanget av denne fila.
 *
 * ================= HVA DEN GJØR ========================================
 *
 * `byggUtrullet` (nettleservennlig, ferdig parsede vekter) og `lagIndre`
 * (spekstrengen målingene bruker) får de SAMME stillingene i den SAMME
 * rekkefølgen, og må velge IDENTISK. To ulike veier til samme bot.
 *
 * Begge spørres på hvert eneste beslutningspunkt, så de tilstandsfulle lagene —
 * `Profilagent` som fyller boka og `Økt` som leser den — ser like mange
 * observasjoner. Ellers ville de drevet fra hverandre av testen selv.
 *
 * ================= OG DEN SVARER PÅ ET ÅPENT SPØRSMÅL ===================
 *
 * Workeren la søket YTTERST, utenpå `Vrakrangerer`. Speken har `vr:` utenpå
 * søket. Den forskjellen var udokumentert og umålt. Siste test her avgjør om
 * den betyr noe i praksis — i stedet for at jeg antar at den ikke gjør det.
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { opprettSpill, utfør } from "../src/index.ts";
import type { GameState, Handling } from "../src/motor.ts";
import { nettFraBytes } from "../src/nevro/nett.ts";
import { E1Agent } from "../src/e1/agent.ts";
import { tolkBudmodell } from "../src/moe2/budmodell.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { byggUtrullet, type Søkspek, type Velger } from "../src/moe2/utrullet.ts";

const KORTFIL = "e1-modell/d7alle.bin";
const VRAKFIL = "e1-modell/vrakrang.bin";
const BUDFIL = "e1-modell/bud-vant.json";

const kortBytes = new Uint8Array(readFileSync(KORTFIL));
const vrakBytes = new Uint8Array(readFileSync(VRAKFIL));
const budJson: unknown = JSON.parse(readFileSync(BUDFIL, "utf8"));

const lagFraByggeren = (søk: Søkspek | null, økt: boolean, vaktflagg: string): Velger =>
  byggUtrullet({
    kortnett: nettFraBytes(kortBytes)[0]!,
    kort: E1Agent.fraBytes(kortBytes),
    vaktflagg,
    bud: tolkBudmodell(budJson),
    budterskel: -3.0,
    vraknett: nettFraBytes(vrakBytes)[0]!,
    vrakflagg: "telrd",
    søk,
    økt,
  }).agent;

/**
 * Spiller ETT spill og spør begge agentene på hvert beslutningspunkt.
 *
 * Spillet drives av `a` sine valg. `b` får samme stilling og må svare likt;
 * ville den valgt noe annet, hadde de to botene divergert etter første trekk og
 * resten av sammenligningen vært meningsløs.
 */
const sammenlign = (a: Velger[], b: Velger[], frø: number, runder: number): number => {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let valg = 0;
  let vakt = 0;
  while (s.fase !== "FERDIG" && vakt++ < 20_000 && s.rundeNr < runder) {
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    const ha: Handling = a[iTur]!.velgHandling(s);
    const hb: Handling = b[iTur]!.velgHandling(s);
    assert.deepEqual(
      hb,
      ha,
      `divergens i runde ${s.rundeNr}, fase ${s.fase}, sete ${iTur} etter ${valg} valg`,
    );
    valg++;
    s = utfør(s, ha).state;
  }
  return valg;
};

test("dagens utrullede bot: byggeren og speken velger identisk", () => {
  // Nøyaktig det `web/worker.ts` bygger i dag — `abmp`, konfidensport i
  // førersetet, ingen oekt og ingen profil.
  const SPEK =
    "vr:e1-modell/vrakrang.bin:telrd:sik:foerer:0.5:8:" +
    "budm:e1-modell/bud-vant.json@-3.0:vakt:abmp:e1:e1-modell/d7alle.bin";
  const spek = [0, 1, 2, 3].map(() => lagIndre(SPEK) as unknown as Velger);
  const bygd = [0, 1, 2, 3].map(() =>
    lagFraByggeren({ type: "sik", verdener: 8, sigma: 0.5 }, false, "abmp"),
  );
  const n = sammenlign(spek, bygd, 61_000_001, 3);
  assert.ok(n > 40, `for få valg sammenlignet (${n}) - testen beviser ingenting`);
});

test("Adams Max-kjeden: byggeren og speken velger identisk", () => {
  // Hele stakken: oekt (K4), profil (K6), alpha-mu med Bayes-vekt (A5),
  // signaler (A6), Pareto (A8), veto (§106) og `abmpf`.
  const SPEK =
    "okt:vr:e1-modell/vrakrang.bin:telrd:" +
    "amu:alle:6k4bgm1e0.25r1.5v0.5:" +
    "profil:budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:e1:e1-modell/d7alle.bin";
  const spek = [0, 1, 2, 3].map(() => lagIndre(SPEK) as unknown as Velger);
  const bygd = [0, 1, 2, 3].map(() =>
    lagFraByggeren(
      {
        type: "amu",
        verdener: 6,
        verdenKandidater: 4,
        M: 1,
        epsilon: 0.25,
        lambda: 1.5,
        vetoMargin: 0.5,
        roller: [],
        vektkilde: "bayes",
        signal: true,
        lagmål: false,
      },
      true,
      "abmpf",
    ),
  );
  const n = sammenlign(spek, bygd, 61_000_002, 2);
  assert.ok(n > 25, `for få valg sammenlignet (${n})`);
});

test("lagmaalet naar helt fram gjennom byggeren", () => {
  // At «L» virker i speken er testet i lagmaal.test.ts. Dette er den ANDRE
  // veien - den som faktisk ville blitt rullet ut - og uten denne kunne
  // lagmaalet vaert maalt paa benken og manglet i appen. Det er feilklassen.
  const SPEK =
    "okt:vr:e1-modell/vrakrang.bin:telrd:" +
    "amu:alle:6k4bgm1e0.25r1.5v0.5L:" +
    "profil:budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:e1:e1-modell/d7alle.bin";
  const spek = [0, 1, 2, 3].map(() => lagIndre(SPEK) as unknown as Velger);
  const bygd = [0, 1, 2, 3].map(() =>
    lagFraByggeren(
      {
        type: "amu", verdener: 6, verdenKandidater: 4, M: 1, epsilon: 0.25,
        lambda: 1.5, vetoMargin: 0.5, roller: [], vektkilde: "bayes",
        signal: true, lagmål: true,
      },
      true,
      "abmpf",
    ),
  );
  const n = sammenlign(spek, bygd, 61_000_003, 2);
  assert.ok(n > 25, `for få valg sammenlignet (${n})`);
});
