import { test } from "node:test";
import assert from "node:assert/strict";
import type { Farge, Kort } from "../src/kort.ts";
import { kortId, likeKort } from "../src/kort.ts";
import {
  type GameState,
  type Handling,
  type KortPåBord,
  lovligeHandlinger,
  lovligeKort,
  opprettSpill,
  spillerVisning,
  stikkvinner,
  utfør,
} from "../src/motor.ts";

function overstyr(base: GameState, patch: Partial<GameState>): GameState {
  return { ...base, ...patch };
}

// --- Oppsett / kortgiving ---------------------------------------------------

test("opprettSpill deler ut riktig antall kort og talong", () => {
  const s = opprettSpill({ antallSpillere: 4 }, 1);
  assert.equal(s.hender.length, 4);
  for (const h of s.hender) assert.equal(h.length, 12);
  assert.equal(s.talong.length, 4);
  assert.equal(s.fase, "BUDRUNDE");
  assert.equal(s.iTur, 1); // venstre for giver (0)
  // Ingen kort er delt ut to ganger.
  const alle = [...s.hender.flat(), ...s.talong].map(kortId);
  assert.equal(new Set(alle).size, 52);
});

test("klassiske regler gir 13 kort og ingen byttefase", () => {
  const s = opprettSpill({ medByttekort: false }, 1);
  for (const h of s.hender) assert.equal(h.length, 13);
  assert.equal(s.talong.length, 0);
});

// --- Budrunde ---------------------------------------------------------------

test("alle passer -> ny giver og ny kortgiving", () => {
  let s = opprettSpill({ antallSpillere: 4 }, 5);
  const giver0 = s.giver;
  for (let i = 0; i < 4; i++) {
    const spiller = s.iTur!;
    s = utfør(s, { type: "BUD", spiller, bud: "PASS" }).state;
  }
  assert.equal(s.fase, "BUDRUNDE");
  assert.equal(s.rundeNr, 1);
  assert.equal(s.giver, (giver0 + 1) % 4);
});

test("solo avslutter budrunden umiddelbart", () => {
  let s = opprettSpill({ antallSpillere: 4 }, 5);
  const spiller = s.iTur!;
  const { state, hendelser } = utfør(s, { type: "BUD", spiller, bud: "SOLO" });
  assert.ok(hendelser.some((e) => e.type === "BUDVINNER" && e.spiller === spiller));
  assert.equal(state.budvinner, spiller);
  assert.equal(state.fase, "VRAK"); // talong > 0 => byttefase
  assert.equal(state.melding?.type, "solo");
});

test("høyeste bud vinner etter at de andre passer", () => {
  let s = opprettSpill({ antallSpillere: 4 }, 9);
  const p1 = s.iTur!;
  s = utfør(s, { type: "BUD", spiller: p1, bud: 6 }).state;
  // resten passer
  while (s.fase === "BUDRUNDE") {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  assert.equal(s.budvinner, p1);
  assert.equal(s.melding?.bud, 6);
});

test("ulovlig bud kastes", () => {
  const s = opprettSpill({ antallSpillere: 4 }, 3);
  assert.throws(() => utfør(s, { type: "BUD", spiller: s.iTur!, bud: 4 })); // under minste
  assert.throws(() => utfør(s, { type: "BUD", spiller: (s.iTur! + 1) % 4, bud: 5 })); // feil tur
});

// --- lovligeKort: utspillsplikt og makkerplikt ------------------------------

function spillTilstand(patch: Partial<GameState>): GameState {
  const base = opprettSpill({ antallSpillere: 4 }, 1);
  return overstyr(base, { fase: "SPILL", ...patch });
}

test("utspillsplikt: budvinner må åpne i trumf i første stikk", () => {
  const hånd: Kort[] = [
    { farge: "S", verdi: 14 },
    { farge: "S", verdi: 7 },
    { farge: "H", verdi: 13 },
    { farge: "R", verdi: 3 },
  ];
  const s = spillTilstand({
    hender: [hånd, [], [], []],
    trumf: "S",
    budvinner: 0,
    iTur: 0,
    stikkSpilt: 0,
    bord: [],
  });
  const lov = lovligeKort(s, 0).map(kortId).sort();
  assert.deepEqual(lov, ["SA", "S7"].sort());
});

test("makkerplikt: makker må legge det etterlyste kortet i første stikk", () => {
  const budvinnerHånd: Kort[] = [{ farge: "S", verdi: 13 }];
  const makkerHånd: Kort[] = [
    { farge: "S", verdi: 14 }, // det etterlyste
    { farge: "S", verdi: 5 },
    { farge: "H", verdi: 9 },
  ];
  const bord: KortPåBord[] = [{ spiller: 0, kort: { farge: "S", verdi: 13 } }];
  const s = spillTilstand({
    hender: [budvinnerHånd, [], makkerHånd, []],
    trumf: "S",
    etterlyst: { farge: "S", verdi: 14 },
    makker: 2,
    budvinner: 0,
    iTur: 2,
    stikkSpilt: 0,
    bord,
  });
  const lov = lovligeKort(s, 2);
  assert.equal(lov.length, 1);
  assert.ok(likeKort(lov[0]!, { farge: "S", verdi: 14 }));
});

test("følge farge håndheves; ellers fritt", () => {
  const hånd: Kort[] = [
    { farge: "H", verdi: 10 },
    { farge: "H", verdi: 4 },
    { farge: "S", verdi: 8 },
  ];
  const bord: KortPåBord[] = [{ spiller: 0, kort: { farge: "H", verdi: 12 } }];
  const s = spillTilstand({
    hender: [[], hånd, [], []],
    trumf: "K",
    iTur: 1,
    stikkSpilt: 2,
    bord,
    budvinner: 0,
  });
  const lov = lovligeKort(s, 1).map(kortId).sort();
  assert.deepEqual(lov, ["H10", "H4"].sort()); // må følge hjerter
});

// --- stikkvinner ------------------------------------------------------------

test("stikkvinner: høyeste trumf vinner, ellers høyeste i utspillsfargen", () => {
  const trumf: Farge = "K";
  // Ingen trumf: høyeste hjerter (lederfargen) vinner, spar ignoreres.
  const utenTrumf: KortPåBord[] = [
    { spiller: 0, kort: { farge: "H", verdi: 9 } },
    { spiller: 1, kort: { farge: "H", verdi: 14 } },
    { spiller: 2, kort: { farge: "S", verdi: 14 } },
    { spiller: 3, kort: { farge: "H", verdi: 2 } },
  ];
  assert.equal(stikkvinner(utenTrumf, trumf), 1);

  // Med trumf: laveste trumf slår høyeste sidefarge.
  const medTrumf: KortPåBord[] = [
    { spiller: 0, kort: { farge: "H", verdi: 14 } },
    { spiller: 1, kort: { farge: "K", verdi: 2 } },
    { spiller: 2, kort: { farge: "H", verdi: 13 } },
    { spiller: 3, kort: { farge: "K", verdi: 5 } },
  ];
  assert.equal(stikkvinner(medTrumf, trumf), 3); // K5 er høyeste trumf
});

// --- Full runde (integrasjon) ----------------------------------------------

function deterministiskHandling(s: GameState): Handling {
  const lov = lovligeHandlinger(s);
  switch (lov.fase) {
    case "BUDRUNDE": {
      const åpner = s.iTur === (s.giver + 1) % s.antallSpillere;
      if (åpner && s.budrunde.høyeste === null) {
        return { type: "BUD", spiller: lov.spiller, bud: 5 };
      }
      return { type: "BUD", spiller: lov.spiller, bud: "PASS" };
    }
    case "VRAK": {
      const sortert = lov.hånd.slice().sort((a, b) => a.verdi - b.verdi);
      return { type: "VRAK", spiller: lov.spiller, kort: sortert.slice(0, lov.antall) };
    }
    case "VELG": {
      const hånd = s.hender[lov.spiller]!;
      const tel: Record<Farge, number> = { S: 0, H: 0, R: 0, K: 0 };
      for (const k of hånd) tel[k.farge]++;
      const trumf = (["S", "H", "R", "K"] as Farge[]).sort((a, b) => tel[b] - tel[a])[0]!;
      // Etterlys høyeste manglende trumf.
      const finnes = new Set(hånd.filter((k) => k.farge === trumf).map((k) => k.verdi));
      let etterlyst: Kort | null = null;
      for (let v = 14; v >= 2; v--) {
        if (!finnes.has(v as Kort["verdi"])) {
          etterlyst = { farge: trumf, verdi: v as Kort["verdi"] };
          break;
        }
      }
      return { type: "VELG", spiller: lov.spiller, trumf, etterlyst };
    }
    case "SPILL":
      return { type: "SPILL", spiller: lov.spiller, kort: lov.kort[0]! };
    case "RUNDE_SLUTT":
      return { type: "NESTE" };
    case "FERDIG":
      throw new Error("ferdig");
  }
}

test("en full runde: 12 stikk fordeles, makker avsløres, poeng gis", () => {
  let s = opprettSpill({ antallSpillere: 4 }, 777);
  // Kjør til første runde er ferdigspilt.
  while (s.fase !== "RUNDE_SLUTT" && s.fase !== "FERDIG") {
    s = utfør(s, deterministiskHandling(s)).state;
    if (s.rundeNr > 0) break; // sikkerhet: ikke gå videre til neste runde
  }
  assert.equal(s.stikkSpilt, 12);
  assert.equal(
    s.stikkVunnet.reduce((a, b) => a + b, 0),
    12,
  );
  assert.ok(s.sisteRunde !== null);
  assert.equal(s.makkerAvslørt, true);
  // Poengsummen er ikke lenger bare nuller.
  assert.ok(s.totalPoeng.some((p) => p !== 0));
});

test("hele kampen når en vinner uansett seed", () => {
  for (const seed of [1, 2, 3, 100, 5555]) {
    let s = opprettSpill({ antallSpillere: 4 }, seed);
    let n = 0;
    while (s.fase !== "FERDIG" && n < 100_000) {
      s = utfør(s, deterministiskHandling(s)).state;
      n++;
    }
    assert.equal(s.fase, "FERDIG", `seed ${seed} nådde ikke FERDIG`);
    assert.ok(s.vinner !== null);
    assert.ok((s.totalPoeng[s.vinner!] ?? 0) >= s.regler.målPoeng);
  }
});

// --- Visning ----------------------------------------------------------------

test("spillerVisning skjuler andres hender og makker før avsløring", () => {
  let s = opprettSpill({ antallSpillere: 4 }, 22);
  // Frem til spillefasen via deterministisk driving.
  while (s.fase !== "SPILL") s = utfør(s, deterministiskHandling(s)).state;
  const seer = (s.budvinner! + 1) % 4;
  const v = spillerVisning(s, seer);
  assert.equal(v.dinHånd.length, s.hender[seer]!.length);
  assert.deepEqual(v.antallKort, s.hender.map((h) => h.length));
  // Makker ikke avslørt ennå.
  assert.equal(v.makker, null);
  // Kun budvinner ser eget vrak.
  assert.deepEqual(spillerVisning(s, seer).dittVrak, []);
  assert.equal(spillerVisning(s, s.budvinner!).dittVrak.length, s.giving.talong);
  // Etterlyst kort er offentlig annonsert.
  assert.deepEqual(v.etterlyst, s.etterlyst);
});
