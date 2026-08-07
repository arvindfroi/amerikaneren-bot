/**
 * A6 — SIGNALERING. Én konvensjon, brukt av begge sider.
 *
 * Det farligste ved en signalkonvensjon er ikke at den er svak, men at den
 * KOSTER STIKK. Et signal som overstyrer en stikkbeslutning betaler for
 * båndbredde med poeng, og det ville ikke feilet noe sted — bare målt dårlig
 * uten at noen visste hvorfor.
 *
 * Derfor er den viktigste testen her at signalrommet er STENGT når et av
 * kortene kan vinne.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  erSignalrom,
  erStyrkesignal,
  signalkort,
  signalForenlighet,
  signalløfter,
  STYRKE,
} from "../src/moe2/signal.ts";
import type { Kort } from "../src/kort.ts";
import type { GameState } from "../src/motor.ts";

const k = (farge: string, verdi: number): Kort => ({ farge, verdi }) as Kort;

const medBord = (bord: { kort: Kort; spiller: number }[], trumf: string | null): GameState =>
  ({ fase: "SPILL", bord, trumf, historikk: [] }) as unknown as GameState;

test("signalrommet er STENGT naar et lovlig kort kan vinne stikket", () => {
  // Spar 5 ligger. Vi har spar 9 – den vinner, altsaa er valget en
  // stikkbeslutning og ikke et signal.
  const s = medBord([{ kort: k("S", 5), spiller: 0 }], "H");
  assert.equal(erSignalrom(s, [k("S", 9), k("S", 2)]), false);
});

test("signalrommet er AAPENT naar ingen av kortene kan vinne", () => {
  const s = medBord([{ kort: k("S", 13), spiller: 0 }], "H");
  assert.equal(erSignalrom(s, [k("S", 9), k("S", 2)]), true);
});

test("signalrommet er stengt paa UTSPILL - der finnes ingen ledende aa tape mot", () => {
  const s = medBord([], "H");
  assert.equal(erSignalrom(s, [k("S", 9), k("S", 2)]), false);
});

test("trumf teller: et avkast som kan trumfe er en stikkbeslutning", () => {
  const s = medBord([{ kort: k("S", 13), spiller: 0 }], "H");
  // Vi er renons i spar, men har hjerter (trumf) - den vinner.
  assert.equal(erSignalrom(s, [k("H", 2), k("R", 9)]), false);
});

test("konvensjonen: hoeyeste = styrke, laveste = svakhet", () => {
  const { styrke, svakhet } = signalkort([k("S", 2), k("S", 9), k("S", 12)]);
  assert.equal(styrke.verdi, 12);
  assert.equal(svakhet.verdi, 2);
  assert.equal(erStyrkesignal(k("S", 12), [k("S", 2), k("S", 9), k("S", 12)]), true);
  assert.equal(erStyrkesignal(k("S", 2), [k("S", 2), k("S", 9), k("S", 12)]), false);
});

test("ETT kort er aldri et signal - da fantes det ikke noe valg", () => {
  assert.equal(erStyrkesignal(k("S", 12), [k("S", 12)]), false);
});

/**
 * AVSENDER OG MOTTAKER MAA DELE KODEN. Leser mottakeren et hoeyt kort som
 * svakhet, er konvensjonen en misforstaaelse - og den ville gjort troen
 * SYSTEMATISK gal i stedet for bare upresis.
 */
test("mottakeren leser det avsenderen sendte", () => {
  const s = {
    trumf: "H",
    bord: [],
    historikk: [
      {
        kort: [
          { kort: k("S", 14), spiller: 0 }, // vinner stikket
          { kort: k("S", 13), spiller: 1 }, // hoeyt paa et tapt stikk = styrke
        ],
        vinner: 0,
      },
    ],
  } as unknown as GameState;

  const løfter = signalløfter(s, 1);
  assert.ok((løfter.get("S" as never) ?? 0) > 0, "hoeyt kort ble ikke lest som styrke");

  // Verden der sete 1 fortsatt har styrke i spar skal vektes OPP mot en der
  // de er tomme.
  const sterk = signalForenlighet(s, [[], [k("S", 12), k("S", 11)], [], []], 0);
  const svak = signalForenlighet(s, [[], [k("R", 2)], [], []], 0);
  assert.ok(sterk > svak, `signalet ble ikke lest (${sterk} mot ${svak})`);
  assert.equal(sterk - svak, 2 * STYRKE);
});

test("den som VANT stikket signaliserte ikke - det var en stikkbeslutning", () => {
  const s = {
    trumf: "H",
    bord: [],
    historikk: [
      { kort: [{ kort: k("S", 14), spiller: 1 }, { kort: k("S", 2), spiller: 0 }], vinner: 1 },
    ],
  } as unknown as GameState;
  assert.equal(signalløfter(s, 1).size, 0, "vinneren skal ikke tolkes som signalgiver");
});
