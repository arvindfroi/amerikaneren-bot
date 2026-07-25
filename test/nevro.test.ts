import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { kortId } from "../src/kort.ts";
import { lovligeHandlinger, lovligeKort, opprettSpill, utfør } from "../src/motor.ts";
import { forover, hjerneFraBase64, type NevroHjerne } from "../src/nevro/nett.ts";
import {
  BUD_DIM,
  BUD_HANDLINGER,
  budRang,
  budTrekk,
  BYTT_DIM,
  byttTrekk,
  kortIndeks,
  SPILL_DIM,
  spillTrekk,
} from "../src/nevro/trekk.ts";
import { besteTrumf, kortSomKanØnskes, NevroSpiller } from "../src/nevro/spiller.ts";

const VEKTER = "web/nevro-vekter.b64.txt";

/** Vektene er en generert fil; hentes med arena/hent-nevrovekter.ts. */
function hjerne(): NevroHjerne {
  return hjerneFraBase64(readFileSync(VEKTER, "utf8"));
}

test("kortIndeks følger appens Kortmaske: fargeindeks × 13 + (verdi − 2)", () => {
  assert.equal(kortIndeks({ farge: "S", verdi: 2 }), 0);
  assert.equal(kortIndeks({ farge: "S", verdi: 14 }), 12);
  assert.equal(kortIndeks({ farge: "H", verdi: 2 }), 13);
  assert.equal(kortIndeks({ farge: "R", verdi: 2 }), 26);
  assert.equal(kortIndeks({ farge: "K", verdi: 14 }), 51);
  // Alle 52 kort må få en unik indeks i 0–51.
  const sett = new Set<number>();
  for (const farge of ["S", "H", "R", "K"] as const) {
    for (let v = 2; v <= 14; v++) sett.add(kortIndeks({ farge, verdi: v as 2 }));
  }
  assert.equal(sett.size, 52);
  assert.equal(Math.min(...sett), 0);
  assert.equal(Math.max(...sett), 51);
});

test("budRang og utgangsrekkefølgen svarer til appens BidAction", () => {
  assert.equal(budRang("PASS"), -1);
  assert.equal(budRang(7), 7);
  assert.equal(budRang("AMERIKANER"), 1000);
  assert.equal(budRang("SOLO"), 2000);
  // 12 utganger: pass, 5–13, amerikaner, solo.
  assert.equal(BUD_HANDLINGER.length, 12);
  assert.equal(BUD_HANDLINGER[0], "PASS");
  assert.equal(BUD_HANDLINGER[1], 5);
  assert.equal(BUD_HANDLINGER[9], 13);
  assert.equal(BUD_HANDLINGER[10], "AMERIKANER");
  assert.equal(BUD_HANDLINGER[11], "SOLO");
});

test("vektfilen leses som appens tre nett med forventet arkitektur", () => {
  assert.ok(existsSync(VEKTER), `${VEKTER} mangler – kjør arena/hent-nevrovekter.ts`);
  const h = hjerne();
  const form = (n: { lag: readonly { inn: number; ut: number }[] }): string =>
    n.lag.map((l) => `${l.inn}→${l.ut}`).join(",");
  assert.equal(form(h.bud), "64→64,64→48,48→12");
  assert.equal(form(h.bytt), "59→96,96→64,64→52");
  assert.equal(form(h.spill), "238→192,192→128,128→52");
  // Utgangene svarer til handlingsrommene: 12 bud, 52 kort, 52 kort.
  assert.equal(h.bud.lag.at(-1)!.ut, BUD_HANDLINGER.length);
  assert.equal(h.bytt.lag.at(-1)!.ut, 52);
  assert.equal(h.spill.lag.at(-1)!.ut, 52);
});

test("forover gir endelige logits av riktig lengde, og er deterministisk", () => {
  const h = hjerne();
  const x = new Float32Array(SPILL_DIM);
  for (let i = 0; i < SPILL_DIM; i++) x[i] = ((i * 37) % 13) / 13;
  const a = forover(h.spill, x);
  const b = forover(h.spill, x);
  assert.equal(a.length, 52);
  assert.deepEqual([...a], [...b]);
  for (const v of a) assert.ok(Number.isFinite(v), "logits må være endelige");
});

test("trekkuttrekket har appens dimensjoner, bias-innganger og håndkoding", () => {
  const s = opprettSpill({ antallSpillere: 4 }, 4242);
  const lov = lovligeHandlinger(s);
  assert.equal(lov.fase, "BUDRUNDE");
  const sete = lov.fase === "BUDRUNDE" ? lov.spiller : 0;

  const bud = budTrekk(s, sete, lov.fase === "BUDRUNDE" ? lov.bud : []);
  assert.equal(bud.length, BUD_DIM);
  assert.equal(bud[63], 1, "bud-vektoren har bias-inngang på 63");
  // Hånden ligger som one-hot i 0–51, ett bit per kort.
  const hånd = s.hender[sete]!;
  assert.equal(hånd.length, 12);
  let satt = 0;
  for (let i = 0; i < 52; i++) if (bud[i] === 1) satt++;
  assert.equal(satt, hånd.length);
  for (const k of hånd) assert.equal(bud[kortIndeks(k)], 1, `${kortId(k)} mangler i vektoren`);
  assert.equal(bud[61], 1, "byttekort-varianten er på");
  // Vektorene er Float32Array, så tallene er float32-avrundet (som i appen).
  assert.equal(bud[62], Math.fround(12 / 13));

  const bytt = byttTrekk(s, sete);
  assert.equal(bytt.length, BYTT_DIM);
  assert.equal(bytt[57], 1, "bytt-vektoren har bias-inngang på 57");

  const spill = spillTrekk(s, sete);
  assert.equal(spill.length, SPILL_DIM);
  // Ingen trumf valgt ennå → «ingen trumf»-flagget på 224.
  assert.equal(spill[224], 1);
  for (let i = 220; i < 224; i++) assert.equal(spill[i], 0);
});

test("kortSomKanØnskes utelater egne og vrakede trumfkort, høyeste først", () => {
  let s = opprettSpill({ antallSpillere: 4 }, 909);
  // Kjør fram til VRAK er unnagjort, så vrak-listen er fylt.
  let guard = 0;
  while (s.fase === "BUDRUNDE" && guard++ < 100) {
    const lov = lovligeHandlinger(s);
    if (lov.fase !== "BUDRUNDE") break;
    const tall = lov.bud.filter((b): b is number => typeof b === "number");
    const bud = s.budrunde.høyeste === null && tall.length > 0 ? Math.min(...tall) : "PASS";
    s = utfør(s, { type: "BUD", spiller: lov.spiller, bud }).state;
  }
  assert.equal(s.fase, "VRAK");
  const budvinner = s.budvinner!;
  const lov = lovligeHandlinger(s);
  const vrak = lov.fase === "VRAK" ? lov.hånd.slice(0, lov.antall) : [];
  s = utfør(s, { type: "VRAK", spiller: budvinner, kort: vrak }).state;

  for (const trumf of ["S", "H", "R", "K"] as const) {
    const kandidater = kortSomKanØnskes(s, trumf);
    const egne = new Set((s.hender[budvinner] ?? []).filter((k) => k.farge === trumf).map((k) => k.verdi));
    const vraket = new Set(s.vrak.filter((k) => k.farge === trumf).map((k) => k.verdi));
    for (const k of kandidater) {
      assert.equal(k.farge, trumf);
      assert.ok(!egne.has(k.verdi), "kan ikke etterlyse et kort man har selv");
      assert.ok(!vraket.has(k.verdi), "kan ikke etterlyse et vraket kort");
    }
    // Sortert høyeste først.
    for (let i = 1; i < kandidater.length; i++) {
      assert.ok(kandidater[i - 1]!.verdi > kandidater[i]!.verdi);
    }
    assert.equal(kandidater.length, 13 - egne.size - vraket.size);
  }
});

test("besteTrumf velger fargen med høyest stikkestimat", () => {
  // Sju spar med ess/konge slår tre små ruter.
  const hånd = [
    { farge: "S", verdi: 14 }, { farge: "S", verdi: 13 }, { farge: "S", verdi: 10 },
    { farge: "S", verdi: 9 }, { farge: "S", verdi: 6 }, { farge: "S", verdi: 4 },
    { farge: "S", verdi: 3 }, { farge: "R", verdi: 5 }, { farge: "R", verdi: 4 },
    { farge: "R", verdi: 2 }, { farge: "H", verdi: 7 }, { farge: "K", verdi: 8 },
  ] as const;
  assert.equal(besteTrumf(hånd).farge, "S");
});

test("nevronettet spiller en hel kamp med bare lovlige handlinger", () => {
  const h = hjerne();
  const agenter = [0, 1, 2, 3].map((sete) => new NevroSpiller(sete, h));
  for (const a of agenter) a.nyKamp();
  let s = opprettSpill({ antallSpillere: 4 }, 31337);
  let guard = 0;
  let trekk = 0;
  while (s.fase !== "FERDIG" && guard++ < 20000) {
    if (s.fase === "RUNDE_SLUTT") {
      if (s.rundeNr + 1 >= 8) break;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const aktør = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    const handling = agenter[aktør]!.velgHandling(s);
    assert.equal(
      handling.type === "BUD" || handling.type === "VRAK" || handling.type === "VELG" || handling.type === "SPILL",
      true,
    );
    if (handling.type === "SPILL") {
      const lov = lovligeKort(s, handling.spiller);
      assert.ok(
        lov.some((k) => k.farge === handling.kort.farge && k.verdi === handling.kort.verdi),
        `ulovlig kort ${kortId(handling.kort)}`,
      );
    }
    // utfør kaster ved ulovlig handling – den er kontrollen for de andre fasene.
    s = utfør(s, handling).state;
    trekk++;
  }
  assert.ok(trekk > 100, `forventet mange trekk, fikk ${trekk}`);
  assert.ok(s.fase === "RUNDE_SLUTT" || s.fase === "FERDIG");
});

test("nettet er sterkere enn tilfeldig spill mot samme grådige motstand", () => {
  // Rask røyktest av at trekkuttrekket faktisk gir nettet mening: over noen
  // få kamper skal nevronettet ende med langt bedre poeng enn tilfeldig spill.
  const h = hjerne();
  const spillKamp = (frø: number, sete: number, nevro: boolean): number[] => {
    const agent = new NevroSpiller(sete, h);
    let s = opprettSpill({ antallSpillere: 4 }, frø);
    let guard = 0;
    while (s.fase !== "FERDIG" && guard++ < 20000) {
      if (s.fase === "RUNDE_SLUTT") {
        if (s.rundeNr + 1 >= 6) break;
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      const aktør = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
      // Alle setene bruker nettet, unntatt «sete» ved tilfeldig spill.
      const tilfeldigTur = !nevro && aktør === sete;
      let handling = new NevroSpiller(aktør, h).velgHandling(s);
      if (tilfeldigTur) {
        const lov = lovligeHandlinger(s);
        if (lov.fase === "SPILL") {
          handling = { type: "SPILL", spiller: aktør, kort: lov.kort[(guard * 7) % lov.kort.length]! };
        } else if (lov.fase === "BUDRUNDE") {
          handling = { type: "BUD", spiller: aktør, bud: lov.bud[(guard * 5) % lov.bud.length]! };
        }
      }
      s = utfør(s, handling).state;
      if (agent.sete < 0) break; // aldri – holder agent «brukt» for lesbarhet
    }
    return s.totalPoeng.slice();
  };
  let medNett = 0;
  let medTilfeldig = 0;
  for (const frø of [111, 222, 333]) {
    medNett += spillKamp(frø, 0, true)[0] ?? 0;
    medTilfeldig += spillKamp(frø, 0, false)[0] ?? 0;
  }
  assert.ok(
    medNett > medTilfeldig,
    `nettet (${medNett}) må slå tilfeldig spill (${medTilfeldig}) på samme sete`,
  );
});
