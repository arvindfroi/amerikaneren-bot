/**
 * HUKOMMELSEN (MLB fase 0.2) — K2-GRENSEN FØRST, SÅ ÉN VANE PER STATISTIKK.
 *
 * Fila har to jobber, og den første er viktigere enn den andre:
 *
 *   1. K2      Hukommelsen ser BARE ferdigspilte runder. Valgene i runde `r`
 *              skal bare kunne se hukommelse fra runde `< r`. Brytes den, er
 *              hele MLB-planen ugyldig, og ingen av de andre tallene betyr noe.
 *
 *   2. VANENE  «En statistikk uten en test er en påstand.» For hver statistikk
 *              bygges en motstander med nøyaktig den vanen, og tallet må bevege
 *              seg riktig vei. En test som bare sjekker at feltet FINNES ville
 *              vært den femte døde modulen med grønn hake.
 *
 * Motstanderne er STILISERTE og deterministiske: «spill alltid det dyreste
 * lovlige kortet», «trumf alltid når du er renons», «vrak dine høyeste kort».
 * Det er den samme formen som `examples/k6-vaner.ts` bruker, og den er nettopp
 * det ligaen trenger for at det skal finnes en vane å lære.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { FARGER, type Farge, type Kort, likeKort } from "../src/kort.ts";
import {
  lovligeEtterlys,
  lovligeHandlinger,
  opprettSpill,
  utfør,
  type GameState,
  type Handling,
} from "../src/motor.ts";
import { type Bud, PASS } from "../src/regler.ts";
import {
  besteAnslag,
  HUKOMMELSE_LENGDE_4,
  Hukommelse,
  korrelasjon,
  kortIndeks,
  LEDD_NAVN,
  leggTilPar,
  LENGDE_PER_SETE,
  pris,
  slår,
  snitt,
  TOM_SAMVAR,
} from "../src/mlb/hukommelse.ts";

// ===========================================================================
// Riggen: fire stiliserte seter, én deterministisk kamp
// ===========================================================================

/** En vane er et sett overstyringer; alt som ikke settes følger standarden. */
interface Vane {
  readonly bud?: (s: GameState, sete: number, lov: readonly Bud[]) => Bud | null;
  readonly vrak?: (s: GameState, hånd: readonly Kort[], antall: number) => Kort[] | null;
  readonly velg?: (s: GameState, hånd: readonly Kort[]) => Farge | null;
  readonly kort?: (s: GameState, sete: number, lov: readonly Kort[]) => Kort | null;
}

const TOM_VANE: Vane = {};

/**
 * `pris` gir SAMME tall til to kort i ulike sidefarger med samme valør, så
 * «billigste» er ikke entydig uten et brudd. Riggen bruker nøyaktig samme
 * brudd som hukommelsen (`kortIndeks`), slik at «alltid billigst» virkelig
 * betyr rang 0 og residualet blir eksakt −0,5.
 */
const rangnøkkel = (k: Kort, trumf: Farge): number => pris(k, trumf) * 100 + kortIndeks(k);
const billigst = (kort: readonly Kort[], trumf: Farge): Kort =>
  kort.reduce((a, b) => (rangnøkkel(b, trumf) < rangnøkkel(a, trumf) ? b : a));
const dyrest = (kort: readonly Kort[], trumf: Farge): Kort =>
  kort.reduce((a, b) => (rangnøkkel(b, trumf) > rangnøkkel(a, trumf) ? b : a));

/** Minste TALLBUD som er lovlig nå, eller null. */
const minsteBud = (lov: readonly Bud[]): number | null => {
  let m: number | null = null;
  for (const b of lov) if (typeof b === "number" && (m === null || b < m)) m = b;
  return m;
};
const størsteBud = (lov: readonly Bud[]): number | null => {
  let m: number | null = null;
  for (const b of lov) if (typeof b === "number" && (m === null || b > m)) m = b;
  return m;
};

/**
 * Standardbudet: meld minste lovlige tallbud når hånden er brukbar.
 *
 * Terskelen er 3,2 og ikke 5, fordi `besteAnslag` teller EGNE stikk mens budet
 * gjelder LAGETS. Med en makker som tar et par stikk er ~3,2 egne stikk et
 * fornuftig femtrekksbud. Poenget her er bare at kontrakter faktisk blir
 * spilt: passer alle, deles det på nytt og runden bokføres aldri.
 */
const BUDTERSKEL = 3.2;

function standardBud(s: GameState, sete: number, lov: readonly Bud[]): Bud {
  const m = minsteBud(lov);
  if (m === null) return PASS;
  const anslag = besteAnslag(s.hender[sete] ?? []).stikk;
  return anslag >= BUDTERSKEL + (m - 5) ? m : PASS;
}

function handling(s: GameState, vaner: readonly Vane[]): Handling {
  const lov = lovligeHandlinger(s);
  switch (lov.fase) {
    case "BUDRUNDE": {
      const v = vaner[lov.spiller] ?? TOM_VANE;
      const b = v.bud?.(s, lov.spiller, lov.bud) ?? standardBud(s, lov.spiller, lov.bud);
      return { type: "BUD", spiller: lov.spiller, bud: b };
    }
    case "VRAK": {
      const v = vaner[lov.spiller] ?? TOM_VANE;
      const valgt =
        v.vrak?.(s, lov.hånd, lov.antall) ??
        [...lov.hånd].sort((a, b) => a.verdi - b.verdi).slice(0, lov.antall);
      return { type: "VRAK", spiller: lov.spiller, kort: valgt };
    }
    case "VELG": {
      const v = vaner[lov.spiller] ?? TOM_VANE;
      const hånd = s.hender[lov.spiller] ?? [];
      const trumf = v.velg?.(s, hånd) ?? lengsteFarge(hånd);
      let etterlyst: Kort | null = null;
      if (lov.måEtterlyse) {
        const kand = lovligeEtterlys({ ...s, trumf } as GameState, trumf);
        etterlyst = kand.length === 0 ? null : kand.reduce((a, b) => (b.verdi > a.verdi ? b : a));
      }
      return { type: "VELG", spiller: lov.spiller, trumf, etterlyst };
    }
    case "SPILL": {
      const v = vaner[lov.spiller] ?? TOM_VANE;
      const trumf = s.trumf!;
      const k = v.kort?.(s, lov.spiller, lov.kort) ?? billigst(lov.kort, trumf);
      return { type: "SPILL", spiller: lov.spiller, kort: k };
    }
    default:
      return { type: "NESTE" };
  }
}

function lengsteFarge(hånd: readonly Kort[]): Farge {
  let beste: Farge = "S";
  let best = -1;
  for (const f of FARGER) {
    const n = hånd.filter((k) => k.farge === f).length;
    if (n > best) {
      best = n;
      beste = f;
    }
  }
  return beste;
}

function korteste(hånd: readonly Kort[]): Farge {
  let beste: Farge = lengsteFarge(hånd);
  let best = Infinity;
  for (const f of FARGER) {
    const n = hånd.filter((k) => k.farge === f).length;
    if (n > 0 && n < best) {
      best = n;
      beste = f;
    }
  }
  return beste;
}

/**
 * Spiller `runder` runder deterministisk og mater boka med HVER tilstand,
 * nøyaktig slik en driver ville gjort.
 */
function spill(
  frø: number,
  runder: number,
  vaner: readonly Vane[],
  bok: Hukommelse | null,
  påTilstand?: (s: GameState) => void,
): GameState {
  // Målet settes uoppnåelig høyt: vi vil ha et fast antall runder, ikke en
  // kamp som stopper når noen runder 100.
  let s = opprettSpill({ målPoeng: 1_000_000 }, frø);
  for (let i = 0; i < 400_000; i++) {
    bok?.observer(s);
    påTilstand?.(s);
    if (s.fase === "FERDIG") break;
    if (s.rundeNr >= runder && s.fase === "BUDRUNDE") break;
    s = utfør(s, s.fase === "RUNDE_SLUTT" ? { type: "NESTE" } : handling(s, vaner)).state;
  }
  return s;
}

const fireLike = (v: Vane): Vane[] => [v, v, v, v];
const bare0 = (v: Vane): Vane[] => [v, TOM_VANE, TOM_VANE, TOM_VANE];

// ===========================================================================
// 1. K2 — DEN VIKTIGSTE TESTEN
// ===========================================================================

/**
 * ============ HUKOMMELSEN RØRER SEG IKKE MENS RUNDEN GÅR ==================
 *
 * Dette er hele K2-garantien for fase 0.2, formulert som et krav en kjørende
 * kamp kan bryte: fra det øyeblikket runde `r` deles ut til den er ferdig,
 * skal tallvektoren være BIT-IDENTISK. Ellers har et valg i runde `r` sett
 * noe fra runde `r`.
 */
test("K2: vektoren staar helt stille gjennom en paagaaende runde", () => {
  const bok = new Hukommelse();
  let forrige: Float64Array | null = null;
  let sisteRundeNr = -1;
  let sjekker = 0;

  spill(90_210, 6, fireLike(TOM_VANE), bok, (s) => {
    const v = bok.vektor(0);
    if (s.rundeNr !== sisteRundeNr) {
      // Ny runde: hukommelsen SKAL ha endret seg (forrige runde er bokført).
      sisteRundeNr = s.rundeNr;
      forrige = v;
      return;
    }
    if (s.fase === "RUNDE_SLUTT") {
      // Her, og bare her, er endring lov.
      forrige = v;
      return;
    }
    assert.deepEqual(
      [...v],
      [...forrige!],
      `hukommelsen endret seg MIDT i runde ${s.rundeNr} (fase ${s.fase}) - ` +
        `da har et valg i runden sett noe fra runden selv`,
    );
    sjekker += 1;
  });

  assert.ok(sjekker > 200, `bare ${sjekker} kontroller - proeven beviser ingenting`);
});

/**
 * ============ OG DEN ER BLIND FOR DE SKJULTE KORTENE ======================
 *
 * Samme grense, angrepet fra den andre siden: bytt ut de skjulte hendene i
 * den PÅGÅENDE runden og krev bit-identisk vektor. Leste `observer` hender
 * utenfor `RUNDE_SLUTT`, ville dette slått ut umiddelbart.
 */
test("K2: bytter vi ut de skjulte hendene midt i runden, roerer ikke vektoren seg", () => {
  const bok = new Hukommelse();
  let byttet = 0;

  spill(90_211, 6, fireLike(TOM_VANE), bok, (s) => {
    if (s.fase !== "SPILL" || s.stikkSpilt === 0) return;
    const før = [...bok.vektor(0)];
    // Roter de tre andres hender. Alt boten lovlig ser er uendret.
    const hender = s.hender.map((h) => [...h]);
    const rotert = [hender[0]!, hender[3]!, hender[1]!, hender[2]!];
    bok.observer({ ...s, hender: rotert } as GameState);
    assert.deepEqual(
      [...bok.vektor(0)],
      før,
      "hukommelsen endret seg da de SKJULTE kortene ble byttet - den leser hender for tidlig",
    );
    byttet += 1;
  });

  assert.ok(byttet > 100, `bare ${byttet} bytter - proeven beviser ingenting`);
});

/** Samme runde bokført to ganger ville doblet all statistikk. */
test("K2: samme RUNDE_SLUTT bokfoeres bare en gang", () => {
  const bok = new Hukommelse();
  let doble = 0;
  spill(90_212, 5, fireLike(TOM_VANE), bok, (s) => {
    if (s.fase !== "RUNDE_SLUTT") return;
    const før = [...bok.vektor(0)];
    bok.observer(s);
    bok.observer(s);
    assert.deepEqual([...bok.vektor(0)], før, "runden ble bokfoert flere ganger");
    doble += 1;
  });
  assert.ok(doble >= 3, `bare ${doble} rundeslutt - proeven beviser ingenting`);
});

// ===========================================================================
// 2. Layouten
// ===========================================================================

test("layouten er 48 tall per sete, 144 ved fire spillere", () => {
  assert.equal(LENGDE_PER_SETE, 48);
  assert.equal(LEDD_NAVN.length, 48);
  assert.equal(HUKOMMELSE_LENGDE_4, 144);
  assert.equal(new Set(LEDD_NAVN).size, 48, "et navn er brukt to ganger");

  /**
   * LÅSEN. `docs/mlb.md`: «trekklayout — antall og rekkefølge. Ett trekk lagt
   * til senere gjør hele erfaringsbufferet ubrukelig.» Flytter noen på et av
   * disse, skal denne bli rød og trekkbyggeren oppdateres i samme slengen.
   */
  assert.equal(LEDD_NAVN[0], "mikro.residual.snitt");
  assert.equal(LEDD_NAVN[2], "mikro.residual.z");
  assert.equal(LEDD_NAVN[10], "mikro.avkasthøyde.tiltro");
  assert.equal(LEDD_NAVN[11], "meso.budavvik.verdi");
  assert.equal(LEDD_NAVN[28], "meso.trumflengde.tiltro");
  assert.equal(LEDD_NAVN[29], "makro.budavvikMotStilling.korr");
  assert.equal(LEDD_NAVN[43], "makro.residualdrift");
  assert.equal(LEDD_NAVN[47], "makro.runder.tiltro");

  const tom = new Hukommelse();
  const v = tom.vektor(0, 4);
  assert.equal(v.length, 144);
  assert.ok([...v].every((x) => x === 0), "en tom bok skal gi bare nuller");
});

test("alle tall er endelige og innenfor [-1, 1] etter en full kamp", () => {
  const bok = new Hukommelse();
  spill(90_213, 14, fireLike(TOM_VANE), bok);
  for (let sete = 0; sete < 4; sete++) {
    const v = bok.vektor(sete);
    for (let i = 0; i < v.length; i++) {
      const x = v[i]!;
      assert.ok(Number.isFinite(x), `${LEDD_NAVN[i % 48]} er ${x}`);
      assert.ok(x >= -1 && x <= 1, `${LEDD_NAVN[i % 48]} = ${x} er utenfor [-1, 1]`);
    }
  }
});

/** Blokk `d` skal handle om sete `(eget + d + 1) % N`, ikke om oss selv. */
test("vektoren er rotert riktig: blokk 0 er neste sete", () => {
  const bok = new Hukommelse();
  spill(90_214, 10, bare0({ kort: (_s, _p, lov) => dyrest(lov, _s.trumf!) }), bok);

  // Sete 0 er den som spiller dyrest. Sett fra sete 3 er det blokk 0.
  const fra3 = bok.vektor(3);
  assert.ok(fra3[0]! > 0.2, `blokk 0 sett fra sete 3 skulle vaert hoeyspilleren, fikk ${fra3[0]}`);
  // Sett fra sete 1 er sete 0 den SISTE blokka (d = 3).
  const fra1 = bok.vektor(1);
  assert.ok(
    fra1[2 * LENGDE_PER_SETE]! > 0.2,
    `siste blokk sett fra sete 1 skulle vaert hoeyspilleren, fikk ${fra1[2 * LENGDE_PER_SETE]}`,
  );
});

// ===========================================================================
// 3. MIKRO — én vane per statistikk
// ===========================================================================

test("MIKRO residual: hoeyspilleren over null, lavspilleren under", () => {
  const bok = new Hukommelse();
  spill(
    91_000,
    10,
    [
      { kort: (s, _p, lov) => dyrest(lov, s.trumf!) },
      TOM_VANE,
      TOM_VANE,
      TOM_VANE,
    ],
    bok,
  );
  const høy = bok.bok(0);
  const lav = bok.bok(1);
  assert.ok(høy.residual.n > 50 && lav.residual.n > 50, "for faa observasjoner");
  assert.ok(snitt(høy.residual) > 0.3, `hoeyspilleren fikk ${snitt(høy.residual)}`);
  assert.ok(snitt(lav.residual) < -0.3, `lavspilleren fikk ${snitt(lav.residual)}`);
  // Og standardfeilen skal gjøre forskjellen entydig (z-leddet i vektoren).
  const v = bok.vektor(3);
  assert.ok(v[2]! > 0.9, `z-leddet for hoeyspilleren var bare ${v[2]}`);
});

test("MIKRO overtar: den graadige tar stikkene, den duckende lar dem gaa", () => {
  const graadig: Vane = {
    kort: (s, _p, lov) => {
      const t = s.trumf!;
      if (s.bord.length === 0) return billigst(lov, t);
      const leder = ledende(s, t);
      const tar = lov.filter((k) => slår(k, leder, t));
      return tar.length > 0 ? billigst(tar, t) : billigst(lov, t);
    },
  };
  const duck: Vane = {
    kort: (s, _p, lov) => {
      const t = s.trumf!;
      if (s.bord.length === 0) return billigst(lov, t);
      const leder = ledende(s, t);
      const lar = lov.filter((k) => !slår(k, leder, t));
      return lar.length > 0 ? billigst(lar, t) : billigst(lov, t);
    },
  };
  const bok = new Hukommelse();
  spill(91_001, 12, [graadig, duck, TOM_VANE, TOM_VANE], bok);
  const g = bok.bok(0);
  const d = bok.bok(1);
  assert.ok(g.overtar.n > 10 && d.overtar.n > 10, `n = ${g.overtar.n}/${d.overtar.n}`);
  assert.equal(snitt(g.overtar), 1, "den graadige lot et stikk gaa");
  assert.equal(snitt(d.overtar), 0, "den duckende tok et stikk den kunne latt gaa");
});

test("MIKRO honnoersen: spareren spiller honnoerene sine senere enn sloeseren", () => {
  const sparer: Vane = {
    kort: (s, _p, lov) => {
      const t = s.trumf!;
      const smaa = lov.filter((k) => k.verdi < 11);
      return billigst(smaa.length > 0 ? smaa : lov, t);
    },
  };
  const sløser: Vane = {
    kort: (s, _p, lov) => {
      const t = s.trumf!;
      const høye = lov.filter((k) => k.verdi >= 11);
      return billigst(høye.length > 0 ? høye : lov, t);
    },
  };
  const bok = new Hukommelse();
  spill(91_002, 12, [sparer, sløser, TOM_VANE, TOM_VANE], bok);
  const a = bok.bok(0);
  const b = bok.bok(1);
  assert.ok(a.honnørsen.n > 8 && b.honnørsen.n > 8, `n = ${a.honnørsen.n}/${b.honnørsen.n}`);
  assert.ok(
    snitt(a.honnørsen) > snitt(b.honnørsen) + 0.2,
    `spareren ${snitt(a.honnørsen)} mot sloeseren ${snitt(b.honnørsen)}`,
  );
});

test("MIKRO renonstrumf: den ene trumfer alltid, den andre kaster alltid av", () => {
  const trumfer: Vane = {
    kort: (s, sete, lov) => {
      const t = s.trumf!;
      if (s.bord.length === 0) return billigst(lov, t);
      const led = s.bord[0]!.kort.farge;
      const egen = s.hender[sete] ?? [];
      if (egen.some((k) => k.farge === led)) return billigst(lov, t);
      const tr = lov.filter((k) => k.farge === t);
      return tr.length > 0 ? billigst(tr, t) : billigst(lov, t);
    },
  };
  const kaster: Vane = {
    kort: (s, sete, lov) => {
      const t = s.trumf!;
      if (s.bord.length === 0) return billigst(lov, t);
      const led = s.bord[0]!.kort.farge;
      const egen = s.hender[sete] ?? [];
      if (egen.some((k) => k.farge === led)) return billigst(lov, t);
      const av = lov.filter((k) => k.farge !== t);
      // Kaster HØYT, slik at `avkasthoeyde` har noe å måle samtidig.
      return av.length > 0 ? dyrest(av, t) : billigst(lov, t);
    },
  };
  const bok = new Hukommelse();
  // Trumferen brenner trumfene sine, så anledningene (renons OG trumf igjen
  // OG et sidekort igjen) blir færre for hver runde. Derfor mange runder.
  spill(91_003, 30, [trumfer, kaster, TOM_VANE, TOM_VANE], bok);
  const a = bok.bok(0);
  const b = bok.bok(1);
  assert.ok(a.renonstrumf.n > 5 && b.renonstrumf.n > 5, `n = ${a.renonstrumf.n}/${b.renonstrumf.n}`);
  assert.equal(snitt(a.renonstrumf), 1, "trumferen kastet av");
  assert.equal(snitt(b.renonstrumf), 0, "kasteren trumfet");
  assert.ok(b.avkasthøyde.n > 5, `avkasthoeyde n = ${b.avkasthøyde.n}`);
  assert.equal(snitt(b.avkasthøyde), 1, `kasteren kaster hoeyest, fikk ${snitt(b.avkasthøyde)}`);
});

function ledende(s: GameState, trumf: Farge): Kort {
  let best = s.bord[0]!.kort;
  for (let i = 1; i < s.bord.length; i++) {
    const k = s.bord[i]!.kort;
    if (slår(k, best, trumf)) best = k;
  }
  return best;
}

// ===========================================================================
// 4. MESO
// ===========================================================================

test("MESO budavvik: overbyderen ligger over underbyderen, og klarer sjeldnere", () => {
  const over: Vane = { bud: (_s, _p, lov) => størsteBud(lov) ?? PASS };
  const under: Vane = { bud: (_s, _p, lov) => minsteBud(lov) ?? PASS };

  const bokO = new Hukommelse();
  spill(91_100, 12, bare0(over), bokO);
  const bokU = new Hukommelse();
  spill(91_100, 12, bare0(under), bokU);

  const o = bokO.bok(0);
  const u = bokU.bok(0);
  assert.ok(o.budavvik.n >= 8 && u.budavvik.n >= 8, `n = ${o.budavvik.n}/${u.budavvik.n}`);
  assert.ok(
    snitt(o.budavvik) > snitt(u.budavvik) + 2,
    `overbyder ${snitt(o.budavvik)} mot underbyder ${snitt(u.budavvik)}`,
  );
  assert.ok(snitt(o.budavvik) > 0, `overbyderen skulle ligget over null, fikk ${snitt(o.budavvik)}`);

  assert.ok(o.klarte.n >= 5 && u.klarte.n >= 5, `klarte n = ${o.klarte.n}/${u.klarte.n}`);
  assert.ok(
    snitt(o.klarte) < snitt(u.klarte),
    `overbyderen klarte ${snitt(o.klarte)}, underbyderen ${snitt(u.klarte)}`,
  );
});

test("MESO passtyrke: den som alltid passer viser hvor sterk haanden hun kastet var", () => {
  const bok = new Hukommelse();
  spill(91_101, 12, bare0({ bud: () => PASS }), bok);
  const p = bok.bok(0);
  assert.equal(snitt(p.budandel), 0, "passeren bydde likevel");
  assert.ok(p.passtyrke.n >= 8, `n = ${p.passtyrke.n}`);
  assert.ok(snitt(p.passtyrke) > 1, `passtyrken var ${snitt(p.passtyrke)} - regner den i det hele tatt?`);
  assert.equal(p.budavvik.n, 0, "en som aldri byr skal ikke ha budavvik");
});

test("MESO vraket: den som vraker hoeyt maales hoeyt, honnoerene faalger med", () => {
  const høyt: Vane = {
    vrak: (_s, hånd, antall) => [...hånd].sort((a, b) => b.verdi - a.verdi).slice(0, antall),
    bud: (_s, _p, lov) => minsteBud(lov) ?? PASS,
  };
  const lavt: Vane = {
    vrak: (_s, hånd, antall) => [...hånd].sort((a, b) => a.verdi - b.verdi).slice(0, antall),
    bud: (_s, _p, lov) => minsteBud(lov) ?? PASS,
  };
  const bokH = new Hukommelse();
  spill(91_102, 12, bare0(høyt), bokH);
  const bokL = new Hukommelse();
  spill(91_102, 12, bare0(lavt), bokL);

  const h = bokH.bok(0);
  const l = bokL.bok(0);
  assert.ok(h.vrakhøyde.n >= 16 && l.vrakhøyde.n >= 16, `n = ${h.vrakhøyde.n}/${l.vrakhøyde.n}`);
  assert.ok(snitt(h.vrakhøyde) > 0.85, `hoeyvrakeren fikk ${snitt(h.vrakhøyde)}`);
  assert.ok(snitt(l.vrakhøyde) < 0.15, `lavvrakeren fikk ${snitt(l.vrakhøyde)}`);
  assert.ok(
    snitt(h.vrakhonnør) > snitt(l.vrakhonnør) + 0.5,
    `honnoerandel ${snitt(h.vrakhonnør)} mot ${snitt(l.vrakhonnør)}`,
  );
});

test("MESO vrakrenons: den som vraker seg renons maales hoeyere enn den som vraker lavt", () => {
  /** Tøm den korteste fargen først — den klassiske «vrak deg renons». */
  const renons: Vane = {
    bud: (_s, _p, lov) => minsteBud(lov) ?? PASS,
    vrak: (_s, hånd, antall) => {
      const igjen = [...hånd];
      const ut: Kort[] = [];
      while (ut.length < antall) {
        // Korteste farge som fortsatt har kort OG som får plass i vraket.
        let beste: Farge | null = null;
        let best = Infinity;
        for (const f of FARGER) {
          const n = igjen.filter((k) => k.farge === f).length;
          if (n > 0 && n <= antall - ut.length && n < best) {
            best = n;
            beste = f;
          }
        }
        if (beste === null) {
          const rest = [...igjen].sort((a, b) => a.verdi - b.verdi);
          for (const k of rest) {
            if (ut.length >= antall) break;
            ut.push(k);
            igjen.splice(igjen.findIndex((x) => likeKort(x, k)), 1);
          }
          break;
        }
        for (const k of igjen.filter((k) => k.farge === beste)) {
          ut.push(k);
          igjen.splice(igjen.findIndex((x) => likeKort(x, k)), 1);
        }
      }
      return ut.slice(0, antall);
    },
  };
  const spredt: Vane = {
    bud: (_s, _p, lov) => minsteBud(lov) ?? PASS,
    vrak: (_s, hånd, antall) => [...hånd].sort((a, b) => a.verdi - b.verdi).slice(0, antall),
  };
  const bokR = new Hukommelse();
  spill(91_103, 14, bare0(renons), bokR);
  const bokS = new Hukommelse();
  spill(91_103, 14, bare0(spredt), bokS);
  const r = bokR.bok(0);
  const s = bokS.bok(0);
  assert.ok(r.vrakrenons.n >= 5 && s.vrakrenons.n >= 5, `n = ${r.vrakrenons.n}/${s.vrakrenons.n}`);
  assert.ok(
    snitt(r.vrakrenons) > snitt(s.vrakrenons),
    `renonsvrakeren ${snitt(r.vrakrenons)} mot den spredte ${snitt(s.vrakrenons)}`,
  );
});

test("MESO trumfvalget: lengst mot kortest", () => {
  const lengst: Vane = { bud: (_s, _p, lov) => minsteBud(lov) ?? PASS, velg: (_s, h) => lengsteFarge(h) };
  const kortest: Vane = { bud: (_s, _p, lov) => minsteBud(lov) ?? PASS, velg: (_s, h) => korteste(h) };
  const bokL = new Hukommelse();
  spill(91_104, 12, bare0(lengst), bokL);
  const bokK = new Hukommelse();
  spill(91_104, 12, bare0(kortest), bokK);
  const l = bokL.bok(0);
  const k = bokK.bok(0);
  assert.ok(l.trumflengst.n >= 6 && k.trumflengst.n >= 6, `n = ${l.trumflengst.n}/${k.trumflengst.n}`);
  assert.equal(snitt(l.trumflengst), 1, "lengst-velgeren valgte ikke lengste farge");
  assert.ok(snitt(k.trumflengst) < 0.4, `kortest-velgeren fikk ${snitt(k.trumflengst)}`);
  assert.ok(
    snitt(l.trumflengde) > snitt(k.trumflengde) + 1,
    `trumflengde ${snitt(l.trumflengde)} mot ${snitt(k.trumflengde)}`,
  );
});

// ===========================================================================
// 5. MAKRO — nivået ingen har rørt
// ===========================================================================

/** Rene tall inn, kjent svar ut: maskineriet bak korrelasjonene. */
test("MAKRO korrelasjonen regner riktig, og er 0 uten variasjon", () => {
  let c = TOM_SAMVAR;
  for (let i = 0; i < 10; i++) c = leggTilPar(c, i, -2 * i + 5);
  assert.ok(Math.abs(korrelasjon(c) + 1) < 1e-9, `perfekt fallende gav ${korrelasjon(c)}`);

  let flat = TOM_SAMVAR;
  for (let i = 0; i < 10; i++) flat = leggTilPar(flat, i, 7);
  assert.equal(korrelasjon(flat), 0, "konstant y skal gi 0, ikke NaN");

  let tynn = TOM_SAMVAR;
  tynn = leggTilPar(tynn, 0, 0);
  tynn = leggTilPar(tynn, 1, 1);
  assert.equal(korrelasjon(tynn), 0, "to punkter er alltid +-1 - altsaa stoey");
});

test("MAKRO drift: den som skifter stil midtveis blir tatt av bade tidsleddet og ferskleddet", () => {
  const SKIFTE = 7;
  const skifter: Vane = {
    kort: (s, _p, lov) => (s.rundeNr < SKIFTE ? billigst(lov, s.trumf!) : dyrest(lov, s.trumf!)),
  };
  const bok = new Hukommelse();
  spill(91_200, 14, bare0(skifter), bok);
  const b = bok.bok(0);

  assert.ok(b.residualMotTid.n >= 12, `n = ${b.residualMotTid.n}`);
  assert.ok(
    korrelasjon(b.residualMotTid) > 0.8,
    `stilskiftet gav bare korr ${korrelasjon(b.residualMotTid)}`,
  );
  // Ferskleddet skal ligge OVER alltid-snittet: hun spiller høyt NÅ.
  const v = bok.vektor(3);
  assert.ok(v[43]! > 0.2, `residualdriften var bare ${v[43]}`);

  // Kontroll: en som IKKE skifter stil skal ha en drift nær null.
  const bok2 = new Hukommelse();
  spill(91_200, 14, bare0({ kort: (s, _p, lov) => dyrest(lov, s.trumf!) }), bok2);
  const v2 = bok2.vektor(3);
  assert.ok(
    Math.abs(v2[43]!) < 0.1,
    `en stabil spiller fikk drift ${v2[43]} - da maaler leddet stoey`,
  );
  assert.ok(
    Math.abs(korrelasjon(bok2.bok(0).residualMotTid)) < 0.6,
    `en stabil spiller fikk tidskorr ${korrelasjon(bok2.bok(0).residualMotTid)}`,
  );
});

test("MAKRO budet mot tiden: den som byr hoeyere utover i kampen blir tatt", () => {
  const SKIFTE = 7;
  const eskalerer: Vane = {
    bud: (s, _p, lov) => (s.rundeNr < SKIFTE ? (minsteBud(lov) ?? PASS) : (størsteBud(lov) ?? PASS)),
  };
  const bok = new Hukommelse();
  spill(91_201, 14, bare0(eskalerer), bok);
  const b = bok.bok(0);
  assert.ok(b.budavvikMotTid.n >= 10, `n = ${b.budavvikMotTid.n}`);
  assert.ok(
    korrelasjon(b.budavvikMotTid) > 0.7,
    `eskaleringen gav bare korr ${korrelasjon(b.budavvikMotTid)}`,
  );
  const v = bok.vektor(3);
  assert.ok(v[46]! > 0.05, `budavviksdriften var bare ${v[46]}`);
});

/**
 * ============ «BYR HUN MER NÅR HUN LIGGER UNDER?» =========================
 *
 * Vanen er eksakt den spørsmålet beskriver: meld når du ligger under den beste
 * andre, pass ellers. Da er `y = 1{x < 0}` og korrelasjonen MÅ være negativ —
 * så lenge stillingen faktisk svinger. Svinger den ikke, er tallet 0, og det
 * er også riktig svar.
 */
test("MAKRO stillingen: den som bare byr naar hun ligger under gir negativ korrelasjon", () => {
  const bakfra: Vane = {
    bud: (s, sete, lov) => {
      let beste = -Infinity;
      for (let p = 0; p < s.antallSpillere; p++) {
        if (p !== sete) beste = Math.max(beste, s.totalPoeng[p] ?? 0);
      }
      if ((s.totalPoeng[sete] ?? 0) >= beste) return PASS;
      return minsteBud(lov) ?? PASS;
    },
  };
  const bok = new Hukommelse();
  spill(91_202, 24, bare0(bakfra), bok);
  const b = bok.bok(0);
  assert.ok(b.budandelMotStilling.n >= 20, `n = ${b.budandelMotStilling.n}`);
  const r = korrelasjon(b.budandelMotStilling);
  assert.ok(r < -0.5, `vanen «byr bare bakfra» gav korr ${r} - forventet klart negativ`);

  // Kontroll: en som byr uansett stilling har ingen slik sammenheng.
  const bok2 = new Hukommelse();
  spill(91_202, 24, bare0({ bud: (_s, _p, lov) => minsteBud(lov) ?? PASS }), bok2);
  assert.equal(
    korrelasjon(bok2.bok(0).budandelMotStilling),
    0,
    "en som alltid byr skal gi eksakt 0 - ingen variasjon i y",
  );
});

/** Hvor langt bak ligger `sete` den beste andre? Negativt = under. */
function bak(s: GameState, sete: number): number {
  let beste = -Infinity;
  for (let p = 0; p < s.antallSpillere; p++) {
    if (p !== sete) beste = Math.max(beste, s.totalPoeng[p] ?? 0);
  }
  return (s.totalPoeng[sete] ?? 0) - beste;
}

/**
 * ============ BUDHØYDEN MOT STILLINGEN, OG EN LÆREPENGE ===================
 *
 * Første forsøk her var «meld maksbud når du ligger under, minstebud ellers»,
 * og det målte 0,0025. To ting var galt, og begge er verdt å skrive ned:
 *
 *   FORMELEN     `Var = Σx²/n − x̄²` kansellerte seg bort fordi `x` var en
 *                andel av et målpoeng på en million. Rettet i `Samvar`, som nå
 *                bruker Welford — det var en ekte feil i hukommelsen.
 *   RIGGEN       den stiliserte seten LEDET hele kampen. En «byr mer når hun
 *                ligger under»-vane som aldri ligger under er ikke en vane, og
 *                ingen statistikk kan finne den.
 *
 * Vanen her er derfor speilvendt og GLIDENDE: hun byr høyere jo større
 * ledelsen er. Det er samme akse, motsatt fortegn, og den er faktisk til
 * stede i dataene. Sammen med budandelstesten under dekker de begge retninger
 * av spørsmålet «endrer hun budstil med stillingen?».
 */
test("MAKRO stillingen: den som byr hoeyere jo mer hun leder gir positiv korrelasjon", () => {
  const presserILedelse: Vane = {
    bud: (s, sete, lov) => {
      const m = minsteBud(lov);
      const maks = størsteBud(lov);
      if (m === null || maks === null) return PASS;
      const løft = Math.max(0, Math.min(4, Math.floor(bak(s, sete) / 20)));
      return Math.min(maks, m + løft);
    },
  };
  const bok = new Hukommelse();
  spill(91_203, 14, bare0(presserILedelse), bok);
  const b = bok.bok(0);
  assert.ok(b.budavvikMotStilling.n >= 10, `n = ${b.budavvikMotStilling.n}`);
  const r = korrelasjon(b.budavvikMotStilling);
  assert.ok(r > 0.4, `vanen «presser i ledelse» gav korr ${r}`);

  /**
   * ============ KONTROLLEN, OG HVA DEN AVSLØRTE ==========================
   *
   * En stillingsBLIND byder gir IKKE null her — den målte +0,50. Det er ikke
   * en feil i tellingen, det er en identifikasjonssvakhet vi må si høyt:
   *
   *   I en kamp der ett sete drar fra, VOKSER stillingen monotont med
   *   RUNDENUMMERET. `budavvikMotStilling` og `budavvikMotTid` ser da på den
   *   samme aksen, og alt som driver med tiden ser ut som en stillingsvane.
   *
   * Vi krymper det ikke bort og vi terskler det ikke bort — begge deler er
   * §108-feilen. Nettet får begge leddene, med hver sin `n`, og kan lære å
   * skille dem i kamper der de IKKE er kollineære. Testen krever derfor at
   * vanen løfter korrelasjonen KLART over kontrollen, ikke at kontrollen er 0.
   */
  const bok2 = new Hukommelse();
  spill(91_203, 14, bare0({ bud: (_s, _p, lov) => minsteBud(lov) ?? PASS }), bok2);
  const r2 = korrelasjon(bok2.bok(0).budavvikMotStilling);
  assert.ok(
    r > r2 + 0.25,
    `vanen gav ${r}, den stillingsblinde kontrollen ${r2} - for liten forskjell`,
  );
});

test("MAKRO stillingen: den som blir FORSIKTIG naar hun leder gir negativ residualMotStilling", () => {
  /** Ligger hun foran, spiller hun lavt; ligger hun under, spiller hun høyt. */
  const forsiktigILedelse: Vane = {
    kort: (s, sete, lov) =>
      bak(s, sete) >= 0 ? billigst(lov, s.trumf!) : dyrest(lov, s.trumf!),
  };
  const bok = new Hukommelse();
  spill(91_204, 24, bare0(forsiktigILedelse), bok);
  const b = bok.bok(0);
  assert.ok(b.residualMotStilling.n >= 12, `n = ${b.residualMotStilling.n}`);
  const r = korrelasjon(b.residualMotStilling);
  assert.ok(r < -0.7, `vanen «forsiktig i ledelse» gav korr ${r}`);

  // Kontroll: en som spiller likt uansett stilling gir ingen sammenheng.
  const bok2 = new Hukommelse();
  spill(91_204, 24, bare0({ kort: (s, _p, lov) => dyrest(lov, s.trumf!) }), bok2);
  assert.equal(
    korrelasjon(bok2.bok(0).residualMotStilling),
    0,
    "en som alltid spiller dyrest har null spredning i y - skal gi eksakt 0",
  );
});

test("MAKRO budandelen mot tiden: den som vaakner sent blir tatt", () => {
  const SKIFTE = 8;
  const våknerSent: Vane = {
    bud: (s, _p, lov) => (s.rundeNr < SKIFTE ? PASS : (minsteBud(lov) ?? PASS)),
  };
  const bok = new Hukommelse();
  spill(91_205, 18, bare0(våknerSent), bok);
  const b = bok.bok(0);
  assert.ok(b.budandelMotTid.n >= 14, `n = ${b.budandelMotTid.n}`);
  assert.ok(
    korrelasjon(b.budandelMotTid) > 0.7,
    `den som vaakner sent gav korr ${korrelasjon(b.budandelMotTid)}`,
  );
});

// ===========================================================================
// 6. Policyen residualet måles mot
// ===========================================================================

test("residualet maales mot den JEVNE policyen, og den er ren regelkunnskap", () => {
  // Under jevn policy er E[h] = 0,5 uansett hånd, så residualet for det
  // dyreste lovlige kortet er nøyaktig +0,5 og for det billigste −0,5.
  const bok = new Hukommelse();
  spill(
    91_300,
    8,
    [
      { kort: (s, _p, lov) => dyrest(lov, s.trumf!) },
      { kort: (s, _p, lov) => billigst(lov, s.trumf!) },
      TOM_VANE,
      TOM_VANE,
    ],
    bok,
  );
  assert.ok(Math.abs(snitt(bok.bok(0).residual) - 0.5) < 1e-9, snitt(bok.bok(0).residual).toString());
  assert.ok(Math.abs(snitt(bok.bok(1).residual) + 0.5) < 1e-9, snitt(bok.bok(1).residual).toString());
});

test("en annen policy gir et annet nullpunkt - policyen ER en parameter", () => {
  // En policy som selv alltid tror på det dyreste: da er residualet for en
  // høyspiller ~0, mens den jevne policyen ga +0,5.
  const alltidDyrest = {
    fordeling(s: GameState, sete: number, lov: readonly Kort[]): number[] {
      void s;
      void sete;
      let best = 0;
      for (let i = 1; i < lov.length; i++) {
        if (pris(lov[i]!, s.trumf!) > pris(lov[best]!, s.trumf!)) best = i;
      }
      return lov.map((_, i) => (i === best ? 1 : 0));
    },
  };
  const bok = new Hukommelse(alltidDyrest);
  spill(91_301, 8, bare0({ kort: (s, _p, lov) => dyrest(lov, s.trumf!) }), bok);
  assert.ok(
    Math.abs(snitt(bok.bok(0).residual)) < 1e-9,
    `mot sin egen policy skal hoeyspilleren ha residual 0, fikk ${snitt(bok.bok(0).residual)}`,
  );
});
