import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lagRng } from "../src/kort.ts";
import { opprettSpill, spillerVisning, utfør, type GameState } from "../src/motor.ts";
import { Innovasjonsbok, nyttGenom } from "../src/neat/genom.ts";
import { NeatAgent } from "../src/neat/agent.ts";
import { ANTALL_INN, ANTALL_UT, kortIndeks, lagInn, UT_MARGIN } from "../src/neat/trekk.ts";
import { Nettverk } from "../src/neat/nett.ts";

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

test("regret-læring: xT kalibreres mot faktiske stikk og arves i genomet", () => {
  const agent = nyAgent(31);
  // Finn en giv der agenten byr, og bokfør estimatet.
  for (let frø = 0; frø < 40; frø++) {
    agent.nyKamp();
    let s = opprettSpill({ antallSpillere: 4 }, 2000 + frø);
    let guard = 0;
    let bydd = false;
    while (s.fase === "BUDRUNDE" && guard++ < 100 && !bydd) {
      const h = agent.velgHandling(s);
      if (h.type === "BUD" && h.bud !== "PASS") bydd = true;
      else s = utfør(s, h).state;
    }
    if (!bydd) continue;
    const rundeNr = s.rundeNr;
    const før = agent.estimatFor(rundeNr)!;
    // Fasit langt fra estimatet → læringen skal dra xT den veien.
    const fasit = før.xt > 6 ? 2 : 11;
    const vektFør = JSON.stringify(agent.genom.koblinger.map((k) => k.vekt));
    agent.lærAvKontrakt(rundeNr, fasit);
    assert.notEqual(JSON.stringify(agent.genom.koblinger.map((k) => k.vekt)), vektFør, "genomvekter endret");
    return;
  }
  assert.fail("agenten bød aldri");
});

test("nye sensorer: renons, boss og kan-slå beregnes riktig fra en konstruert visning", () => {
  const { ANTALL_INN: AI } = { ANTALL_INN };
  // Konstruert stilling: trumf S. Spiller 1 viste renons i H i første stikk.
  // Jeg (spiller 0) har SA (boss i spar) og H5. På bordet leder spiller 3 med HK.
  const visning = {
    fase: "SPILL", iTur: 0, deg: 0,
    dinHånd: [{ farge: "S", verdi: 14 }, { farge: "H", verdi: 5 }],
    antallKort: [2, 2, 2, 2], totalPoeng: [0, 0, 0, 0], rundeNr: 0, giver: 0,
    budrunde: { passet: [false, false, false, false], høyeste: { spiller: 0, bud: 5 }, sisteBud: [5, null, null, null] },
    budvinner: 0, melding: { type: "tall", bud: 5 }, trumf: "S", etterlyst: null,
    makker: null,
    bord: [{ spiller: 3, kort: { farge: "H", verdi: 13 } }],
    stikkVunnet: [0, 0, 0, 0], stikkSpilt: 1, forrigeStikk: null,
    historikk: [{ kort: [
      { spiller: 0, kort: { farge: "H", verdi: 10 } },
      { spiller: 1, kort: { farge: "K", verdi: 2 } }, // fulgte ikke H → renons i H
      { spiller: 2, kort: { farge: "H", verdi: 12 } },
      { spiller: 3, kort: { farge: "H", verdi: 14 } },
    ], vinner: 3 }],
    dittVrak: [], sisteRunde: null, vinner: null,
    lovligeKort: [{ farge: "H", verdi: 5 }],
  } as never;
  const inn = lagInn(visning, "SPILL", 12, 100);
  assert.equal(inn.length, AI);
  // Renons: spiller 1 (rel. sete 1) i hjerter (indeks 1) → RENONS-blokka starter på 253.
  assert.equal(inn[253 + 0 * 4 + 1], 1, "renons hos rel. sete 1 i hjerter");
  // Boss i spar (SA på hånd): BOSS-blokka starter på 269, spar er indeks 0.
  assert.equal(inn[269 + 0], 1, "SA er boss i spar");
  assert.equal(inn[269 + 1], 0, "H5 er ikke boss i hjerter");
  // Bordet ledes av HK (ikke trumf); jeg MÅ følge hjerter med H5 – kan ikke slå.
  assert.equal(inn[274], 0, "beste på bordet er ikke trumf");
  assert.equal(inn[275], 0, "H5 slår ikke HK");
  // Stikkleder: spiller 3 = rel. sete 3 (blokka starter på 276).
  assert.equal(inn[276 + 3], 1);
  // Budhistorikk (286+): jeg (rel. sete 0) meldte 5 av 12 stikk.
  assert.equal(inn[286 + 0], 5 / 12, "mitt høyeste bud");
  assert.equal(inn[286 + 1], 0, "sete 1 meldte aldri");
  // Lag i stikket: etterlyst=null → solo uten makker → alle andre er kjente
  // fiender for budvinneren; spiller 3 leder stikket.
  assert.equal(inn[291], 0, "ingen lagkamerat leder");
  assert.equal(inn[292], 1, "kjent motstander leder stikket");
});

test("retningsstyrt regret: underbud dytter margin-hodet OPP", () => {
  const agent = nyAgent(37);
  for (let frø = 0; frø < 40; frø++) {
    agent.nyKamp();
    let s = opprettSpill({ antallSpillere: 4 }, 3000 + frø);
    let guard = 0;
    let bydd = false;
    while (s.fase === "BUDRUNDE" && guard++ < 100 && !bydd) {
      const h = agent.velgHandling(s);
      if (h.type === "BUD" && h.bud !== "PASS") bydd = true;
      else s = utfør(s, h).state;
    }
    if (!bydd) continue;
    const est = agent.estimatFor(s.rundeNr)!;
    // Simuler grovt underbud: laget tok 4 stikk mer enn budet.
    const før = new Nettverk(agent.genom).aktiver(est.inn as number[])[UT_MARGIN]!;
    agent.lærAvKontrakt(s.rundeNr, Math.min(12, est.bud + 4));
    const etter = new Nettverk(agent.genom).aktiver(est.inn as number[])[UT_MARGIN]!;
    assert.ok(etter > før, `margin økte (${før} → ${etter})`);
    return;
  }
  assert.fail("agenten bød aldri");
});
