import assert from "node:assert/strict";
import { test } from "node:test";

import { lovligeEtterlys, lovligeHandlinger, lovligeKort, opprettSpill, utfør } from "../src/index.ts";
import {
  besteTrumf,
  BUD_DIM,
  budTrekk,
  BYTT_DIM,
  byttTrekk,
  estimerStikk,
  forover,
  kortIndeks,
  nevroHjerne,
  NevroAgent,
  SPILL_DIM,
  spillTrekk,
} from "../src/nevro/index.ts";

test("vektene dekoder til appens tre nett med riktige dimensjoner", () => {
  const h = nevroHjerne();
  assert.deepEqual(
    h.bud.lag.map((l) => [l.inn, l.ut]),
    [
      [64, 64],
      [64, 48],
      [48, 12],
    ],
  );
  assert.deepEqual(
    h.bytt.lag.map((l) => [l.inn, l.ut]),
    [
      [59, 96],
      [96, 64],
      [64, 52],
    ],
  );
  assert.deepEqual(
    h.spill.lag.map((l) => [l.inn, l.ut]),
    [
      [238, 192],
      [192, 128],
      [128, 52],
    ],
  );
  // Bias/vekt-arrayene må ha eksakt lengde inn×ut / ut, ellers er lesingen forskjøvet.
  for (const nett of [h.bud, h.bytt, h.spill]) {
    for (const l of nett.lag) {
      assert.equal(l.vekter.length, l.inn * l.ut);
      assert.equal(l.bias.length, l.ut);
    }
  }
});

test("kortindeks følger appens formel farge × 13 + (verdi − 2)", () => {
  assert.equal(kortIndeks({ farge: "S", verdi: 2 }), 0);
  assert.equal(kortIndeks({ farge: "S", verdi: 14 }), 12);
  assert.equal(kortIndeks({ farge: "H", verdi: 2 }), 13);
  assert.equal(kortIndeks({ farge: "K", verdi: 14 }), 51);
});

test("estimerStikk og besteTrumf gir appens håndvurdering", () => {
  // 5 spar med ess + renons i kløver: trumflengde + ess + renonsbonus.
  const hånd = [
    { farge: "S", verdi: 14 },
    { farge: "S", verdi: 10 },
    { farge: "S", verdi: 7 },
    { farge: "S", verdi: 5 },
    { farge: "S", verdi: 3 },
    { farge: "H", verdi: 13 },
    { farge: "H", verdi: 4 },
    { farge: "R", verdi: 9 },
  ] as const;
  // 5×0,55 (trumf) + 2×0,4 (lengde over tre) + 1,0 (ess i trumf)
  //   + 0,65 (støttet konge i hjerter) + 0,3 (singelton ruter)
  //   + 0,45×min(2,5) (renons kløver) = 6,40
  assert.equal(Math.round(estimerStikk(hånd, "S") * 100) / 100, 6.4);
  assert.equal(besteTrumf(hånd).trumf, "S");
});

test("trekkvektorene har appens lengder og setter egen hånd", () => {
  const s = opprettSpill({ antallSpillere: 4 }, 4242);
  const bud = budTrekk(s, 0);
  assert.equal(bud.length, BUD_DIM);
  assert.equal(bud[63], 1, "bias-inngangen skal være 1");
  for (const k of s.hender[0]!) assert.equal(bud[kortIndeks(k)], 1);
  assert.equal(byttTrekk(s, 0).length, BYTT_DIM);
  assert.equal(spillTrekk(s, 0).length, SPILL_DIM);
});

test("nettet gir endelige logits av riktig lengde", () => {
  const s = opprettSpill({ antallSpillere: 4 }, 99);
  const ut = forover(nevroHjerne().bud, budTrekk(s, 0));
  assert.equal(ut.length, 12);
  for (const v of ut) assert.ok(Number.isFinite(v), `logit må være endelig, fikk ${v}`);
});

test("NevroAgent spiller en hel kamp med bare lovlige handlinger", () => {
  const agent = new NevroAgent();
  let s = opprettSpill({ antallSpillere: 4 }, 31337);
  let trekk = 0;
  while (s.fase !== "FERDIG" && trekk++ < 20000) {
    if (s.fase === "RUNDE_SLUTT") {
      if (s.rundeNr + 1 >= 30) break;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const lov = lovligeHandlinger(s);
    const h = agent.velgHandling(s);
    // Lovligheten sjekkes eksplisitt her – utfør() ville også kastet, men da
    // uten å si HVILKEN fase som gikk galt.
    if (lov.fase === "BUDRUNDE") {
      assert.equal(h.type, "BUD");
      assert.ok(lov.bud.includes(h.type === "BUD" ? h.bud : 0), `ulovlig bud i fase BUDRUNDE`);
    } else if (lov.fase === "VRAK") {
      assert.equal(h.type, "VRAK");
      assert.equal(h.type === "VRAK" ? h.kort.length : -1, lov.antall);
    } else if (lov.fase === "VELG") {
      assert.equal(h.type, "VELG");
      if (h.type === "VELG") {
        if (lov.måEtterlyse) {
          assert.ok(h.etterlyst !== null, "tallbud/amerikaner krever etterlysning");
          assert.ok(
            lovligeEtterlys(s, h.trumf).some((k) => k.farge === h.etterlyst!.farge && k.verdi === h.etterlyst!.verdi),
            "etterlyst kort må være lovlig",
          );
        }
      }
    } else if (lov.fase === "SPILL") {
      assert.equal(h.type, "SPILL");
      if (h.type === "SPILL") {
        assert.ok(
          lovligeKort(s, lov.spiller).some((k) => k.farge === h.kort.farge && k.verdi === h.kort.verdi),
          "spilt kort må være lovlig",
        );
      }
    }
    s = utfør(s, h).state;
  }
  assert.ok(trekk > 50, "kampen skal ha kommet i gang");
});

test("NevroAgent byr som appens nett: hovedsakelig 9–11, ikke minstebud", () => {
  // Nettet i appen er dokumentert til å by på familienivå (9–11) og klare
  // det som regel. Går denne i stå på 5, er budtrekkene forskjøvet.
  const agent = new NevroAgent();
  const bud: number[] = [];
  for (let k = 0; k < 6; k++) {
    let s = opprettSpill({ antallSpillere: 4 }, 7000 + k);
    let trekk = 0;
    while (s.fase !== "FERDIG" && trekk++ < 4000) {
      if (s.fase === "RUNDE_SLUTT") {
        if (s.rundeNr + 1 >= 6) break;
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      const res = utfør(s, agent.velgHandling(s));
      for (const h of res.hendelser) {
        if (h.type === "RUNDE_SLUTT" && h.resultat.melding.type === "tall") bud.push(h.resultat.melding.bud);
      }
      s = res.state;
    }
  }
  assert.ok(bud.length >= 5, `forventet flere kontrakter, fikk ${bud.length}`);
  const snitt = bud.reduce((a, b) => a + b, 0) / bud.length;
  assert.ok(snitt >= 8, `snittbudet skal ligge på familienivå, fikk ${snitt.toFixed(2)}`);
});
