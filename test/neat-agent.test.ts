import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lagRng } from "../src/kort.ts";
import { opprettSpill, spillerVisning, utfør, type GameState } from "../src/motor.ts";
import { Innovasjonsbok, nyttGenom } from "../src/neat/genom.ts";
import { NeatAgent } from "../src/neat/agent.ts";
import { ANTALL_INN, ANTALL_UT, kortIndeks, lagInn } from "../src/neat/trekk.ts";

function nyAgent(frø: number): NeatAgent {
  const bok = new Innovasjonsbok(ANTALL_INN, ANTALL_UT);
  return new NeatAgent(nyttGenom(ANTALL_INN, ANTALL_UT, bok, lagRng(frø)));
}

test("lagInn koder hånden og holder seg i [0,1] med riktig lengde", () => {
  const state = opprettSpill({ antallSpillere: 4 }, 123);
  const visning = spillerVisning(state, state.iTur!);
  const inn = lagInn(visning, "BUD", state.giving.antallStikk, state.regler.målPoeng);
  assert.equal(inn.length, ANTALL_INN);
  for (const v of inn) assert.ok(v >= 0 && v <= 1, `verdi ${v} utenfor [0,1]`);
  const håndBiter = visning.dinHånd.map((k) => inn[kortIndeks(k)]);
  assert.deepEqual(håndBiter, new Array(visning.dinHånd.length).fill(1));
  assert.equal(inn.reduce((a, b) => a + (b === 1 ? 1 : 0), 0) >= 12, true);
});

test("NeatAgent spiller en hel kamp med bare lovlige handlinger", () => {
  const agenter = [nyAgent(1), nyAgent(2), nyAgent(3), nyAgent(4)];
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 42);
  let handlinger = 0;
  while (s.fase !== "FERDIG" && handlinger++ < 20000) {
    if (s.fase === "RUNDE_SLUTT" && s.rundeNr + 1 >= 40) break;
    const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : (s.iTur ?? 0);
    const h = s.fase === "RUNDE_SLUTT" ? ({ type: "NESTE" } as const) : agenter[sete]!.velgHandling(s);
    // Motoren kaster ved ulovlige handlinger – testen feiler da automatisk.
    s = utfør(s, h).state;
  }
  assert.ok(handlinger < 20000, "kampen terminerte");
  assert.ok(
    s.fase === "FERDIG" || s.fase === "RUNDE_SLUTT",
    "kampen endte i en sluttfase",
  );
});

test("agenten bokfører xT-estimat når den byr", () => {
  const agent = nyAgent(5);
  agent.nyKamp();
  // Kjør budrunder til agenten (i alle seter) har lagt minst ett bud.
  let funnet = false;
  for (let frø = 0; frø < 30 && !funnet; frø++) {
    agent.nyKamp();
    let s = opprettSpill({ antallSpillere: 4 }, frø);
    let guard = 0;
    while (s.fase === "BUDRUNDE" && guard++ < 100) {
      const h = agent.velgHandling(s);
      if (h.type === "BUD" && h.bud !== "PASS") {
        const est = agent.estimatFor(s.rundeNr);
        assert.ok(est !== undefined, "estimat bokført ved bud");
        assert.ok(est.xt >= 0 && est.xt <= s.giving.antallStikk);
        assert.ok(est.bud >= 5 && est.bud <= s.giving.antallStikk);
        funnet = true;
        break;
      }
      s = utfør(s, h).state;
    }
  }
  assert.ok(funnet, "agenten la minst ett bud i løpet av 30 giver");
});

test("agenten bruker aldri skjult informasjon (kun spillerVisning)", () => {
  // Strukturelt vern: to tilstander som er identiske sett fra spilleren, men
  // med ulike skjulte hender hos motstanderne, må gi samme handling.
  const agent = nyAgent(8);
  const a = opprettSpill({ antallSpillere: 4 }, 1001);
  const spiller = a.iTur!;
  const p1 = (spiller + 1) % 4;
  const p2 = (spiller + 2) % 4;
  // Bytt et kort mellom to motstandere – usynlig for spilleren i tur.
  const hender = a.hender.map((h) => h.slice());
  const t = hender[p1]![0]!;
  hender[p1]![0] = hender[p2]![0]!;
  hender[p2]![0] = t;
  const b: GameState = { ...a, hender };
  agent.nyKamp();
  const ha = agent.velgHandling(a);
  agent.nyKamp();
  const hb = agent.velgHandling(b);
  assert.deepEqual(ha, hb);
});
