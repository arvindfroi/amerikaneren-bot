import { strict as assert } from "node:assert";
import { test } from "node:test";

import { rotVerdier } from "../src/solver/dds.ts";
import {
  fasitpoeng,
  poengRotVerdier,
  poengRotVerdierUtenTT,
  rundepoeng,
  type PoengOppsett,
} from "../src/solver/poengdds.ts";

/**
 * ============ HVA DISSE TESTENE LÅSER =================================
 *
 * Poengløseren er ikke «DD med en annen knott», den er et annet spill: fire
 * poengfunksjoner ført samtidig gjennom bakoverinduksjonen. Tre påstander må
 * holde, og hver av dem kan brytes uten at noe krasjer:
 *
 *   1. POENGFUNKSJONEN ER SPILLETS. `poengdds.ts` har en rask kopi av
 *      `beregnPoeng` fordi den kalles i hver node. Kopien må si nøyaktig det
 *      samme som originalen – ellers optimerer løseren et fantasispill.
 *   2. TRANSPOSISJONSNØKKELEN ER GYLDIG. Den slår opp på (hender, spiller i
 *      tur, budlagets stikk), ikke på den fulle stikkvektoren. Gyldigheten
 *      hviler på et argument (se filhodet), og et argument er ikke en måling:
 *      med og uten memoisering må gi identiske vektorer.
 *   3. DEN LØSER FAKTISK ET ANNET PROBLEM ENN DD. Er den enig med DD overalt,
 *      har den ikke rettet noe.
 */

const T = (bud: number) => ({ type: "tall" as const, bud });

function grunn(over: Partial<PoengOppsett> = {}): PoengOppsett {
  return {
    N: 4,
    trump: 0,
    hender: [[51], [43, 39], [32], [31]],
    iTur: 1,
    stikkFør: [0, 0, 0, 0],
    ferdigeStikk: 0,
    totalStikk: 2,
    budvinner: 0,
    makker: 2,
    melding: T(1),
    målPoeng: 100,
    mål: "diff",
    ...over,
  };
}

test("POENGFUNKSJONEN: den raske kopien sier det samme som beregnPoeng", () => {
  // Kopien finnes bare for hastighet. Driver den fra originalen, optimerer
  // løseren noe annet enn spillet – uten at en eneste annen test merker det.
  let x = 77_003;
  const neste = (n: number): number => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return x % n;
  };
  let sjekket = 0;
  for (const melding of [T(5), T(6), T(9), { type: "amerikaner" as const, bud: 0 }, { type: "solo" as const, bud: 0 }]) {
    for (const makker of [2, null]) {
      for (let i = 0; i < 120; i++) {
        const total = 12;
        const stikk = [0, 0, 0, 0];
        for (let t = 0; t < total; t++) stikk[neste(4)]!++;
        const o = grunn({ melding, makker, totalStikk: total });
        assert.deepEqual(rundepoeng(o, stikk), fasitpoeng(o, stikk), JSON.stringify({ melding, makker, stikk }));
        sjekket++;
      }
    }
  }
  assert.equal(sjekket, 1200);
});

test("TRANSPOSISJONSNØKKELEN: memoisert og umemoisert gir identiske vektorer", () => {
  // Nøkkelen utelater den fulle stikkvektoren med vilje. Argumentet for at det
  // er lov står i filhodet; dette er målingen av det.
  let x = 5_150_321;
  const neste = (n: number): number => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return x % n;
  };
  let sjekket = 0;
  for (let g = 0; g < 40; g++) {
    const perHånd = 2 + (g % 3);
    const stokk: number[] = [];
    for (let c = 0; c < 52; c++) stokk.push(c);
    for (let i = 51; i > 0; i--) {
      const j = neste(i + 1);
      const t = stokk[i]!;
      stokk[i] = stokk[j]!;
      stokk[j] = t;
    }
    const hender: number[][] = [];
    for (let p = 0; p < 4; p++) hender.push(stokk.slice(p * perHånd, (p + 1) * perHånd));
    // Ulike allerede-vunne stikk: nettopp det nøkkelen IKKE inneholder.
    const stikkFør = [neste(3), neste(3), neste(3), neste(3)];
    const ferdige = stikkFør.reduce((a, b) => a + b, 0);
    for (const mål of ["diff", "egen"] as const) {
      const o = grunn({
        trump: neste(4),
        hender: hender.map((h) => h.slice()),
        iTur: neste(4),
        stikkFør,
        ferdigeStikk: ferdige,
        totalStikk: ferdige + perHånd,
        makker: g % 4 === 0 ? null : 2,
        melding: T(Math.max(1, ferdige)),
        mål,
      });
      const med = poengRotVerdier(o).verdier;
      const uten = poengRotVerdierUtenTT(o).verdier;
      assert.deepEqual(med, uten, `giving ${g}, mål ${mål}`);
      sjekket++;
    }
  }
  assert.equal(sjekket, 80);
});

test("FORSVAREREN: DD er likegyldig til hvem av de to som tar stikket, poeng er det ikke", () => {
  /**
   * Stillingen §114 handler om, i minste form. Kløver 3-4-5 ligger på bordet,
   * forsvarer 1 har K6 og K2, og begge veier gir budlaget nøyaktig ETT stikk:
   *
   *   K6 → sete 1 tar stikket selv, budlaget tar det siste  → 1 til sete 1
   *   K2 → sete 3 tar stikket, budlaget tar det siste       → 1 til sete 3
   *
   * Dobbelt dummy ser to trekk med samme `lagStikk` og har ingenting å velge
   * mellom. Poengløseren ser at sete 1 scorer 1 mot 0.
   */
  const o = grunn({
    bord: [
      { spiller: 0, kort: 3 * 13 + 1 },
      { spiller: 2, kort: 3 * 13 + 2 },
      { spiller: 3, kort: 3 * 13 + 3 },
    ],
    stikkFør: [3, 0, 2, 0],
    ferdigeStikk: 5,
    totalStikk: 7,
    melding: T(6),
  });

  const dd = rotVerdier({
    N: 4,
    trump: o.trump,
    declLag: [true, false, true, false],
    hender: o.hender,
    iTur: o.iTur,
    bord: o.bord,
    declStikkFør: 5,
    ferdigeStikk: 5,
    totalStikk: 7,
  });
  assert.equal(dd.length, 2);
  assert.equal(dd[0]!.lagStikk, dd[1]!.lagStikk, "DD må være likegyldig her – det er hele poenget");

  for (const mål of ["diff", "egen"] as const) {
    const v = poengRotVerdier({ ...o, mål }).verdier;
    const beste = v.reduce((a, b) => (b.verdi > a.verdi ? b : a));
    assert.equal(beste.kort, 3 * 13 + 4, `mål ${mål}: forsvareren må ta stikket SELV (K6)`);
    assert.equal(beste.poeng[1], 1, "sete 1 scorer sitt eget stikk");
    assert.equal(beste.poeng[3], 0);
    // Kontrakten går hjem uansett vei: budlaget er upåvirket av valget.
    for (const kandidat of v) assert.equal(kandidat.poeng[0], 12);
  }
});

test("BUDLAGET: `egen` gjør føreren likegyldig til overstikk, `diff` gjør det ikke", () => {
  /**
   * Kontrakten er alt sikret (budlaget har 6 stikk og meldte 6). Fører (sete
   * 0) kan trekke sete 3s siste trumf med spar ess og deretter la makkeren ta
   * det siste stikket – budlaget 2 – eller spille hjerter først og la sete 3
   * trumfe – budlaget 1.
   *
   * `2n` er den samme uansett, så under `egen` er de to linjene NØYAKTIG like
   * gode, og løseren velger da etter en konvensjon, ikke etter spillestyrke.
   * Under `diff` koster det bortgitte stikket, fordi det blir til et poeng hos
   * forsvaret. Dette er grunnen til at `diff` er målformen sonden kjøres med,
   * og det står her så det ikke kan gå tapt.
   */
  const S = (verdi: number): number => 0 * 13 + (verdi - 2);
  const H = (verdi: number): number => 1 * 13 + (verdi - 2);
  const R = (verdi: number): number => 2 * 13 + (verdi - 2);
  const o = grunn({
    trump: 0,
    hender: [[S(14), H(2)], [H(3), H(4)], [H(5), H(6)], [S(2), R(7)]],
    iTur: 0,
    stikkFør: [5, 0, 1, 0],
    ferdigeStikk: 6,
    totalStikk: 8,
    melding: T(6),
    bord: undefined,
  });

  const egen = poengRotVerdier({ ...o, mål: "egen" }).verdier;
  assert.ok(
    egen.every((v) => v.verdi === egen[0]!.verdi),
    "under `egen` er føreren likegyldig – alle kort gir samme tall",
  );

  const diff = poengRotVerdier({ ...o, mål: "diff" }).verdier;
  const beste = diff.reduce((a, b) => (b.verdi > a.verdi ? b : a));
  assert.equal(beste.kort, S(14), "under `diff` skal føreren trumfe og nekte forsvaret stikket");
  assert.ok(
    diff.some((v) => v.verdi < beste.verdi),
    "under `diff` må minst ett kort være strengt dårligere",
  );
});
