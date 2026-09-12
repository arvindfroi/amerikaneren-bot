/**
 * SANSER 2 (11. sep): STILLINGEN PER SETE (A, 36) og VALGT BORT, OFFENTLIG (B, 40), bakerst i
 * trohodet (920 → 996) og — bare A — i BudQ (287 → 323).
 *
 * Det som må holde, og som ingen krasj avslører:
 *
 *   1. SEMANTIKKEN: håndbygde stillinger der vi vet svaret. Uten dem kan en blokk være
 *      bit-stabil og likevel kode noe annet enn det navnet sier.
 *   2. K2 (eieren: «resten er juks»): vraket og talongen er budvinnerens alene. For HVER
 *      observatør som ikke er budvinner, i hver fase, gir bytte av alle skjulte hender OG
 *      vraket OG talongen bit-identiske nye blokker — og hele 996-vektoren.
 *   3. FELLENE: en blokk som leser vraket, talongen eller den ekte makkeren før avsløringen
 *      blir tatt av nøyaktig den prøven. Uten dem kunne (2) vært grønn fordi byttet aldri
 *      flyttet noe.
 *   4. A ER OFFENTLIG: samme blokk for alle fire observatører, bare rotert.
 *   5. NULLPUNKTET: 920-nett og 287-nett med nuller bakerst gir nøyaktig samme tro og samme
 *      bud — og én koblet kolonne i hver ny blokk endrer svaret.
 */
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { spillerVisning, stikkvinner, type SpillerVisning } from "../src/motor.ts";
import { lagRng, type Farge, type Kort } from "../src/kort.ts";
import { AMERIKANER, PASS, SOLO } from "../src/regler.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import { MLB_STILLING, STILLINGINNGANG as SA, stillingTrekk } from "../src/mlb/stillingtrekk.ts";
import { MLB_VALGT_BORT, VALGTBORTINNGANG as VB, valgtBortTrekk } from "../src/mlb/valgtbort.ts";
import {
  MLB_TRO_BREDDER,
  MLB_TRO_INN,
  MLB_TRO_INN_HS,
  MLB_TRO_INN_HS2,
  MLB_TRO_SANSER2,
  troKolonnekart,
  troTrekkForBredde,
} from "../src/mlb/trotrekk.ts";
import { MlbTronett, utvidTronett } from "../src/mlb/tronett.ts";
import { BUDQ_INN_H, BUDQ_INN_HS2, BUDQ_UT, BudQagent, budqTrekk } from "../src/moe2/budq.ts";
import { nettFraBytes, type NevroNett } from "../src/nevro/nett.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";

const fil = (navn: string): string => fileURLToPath(new URL(`../e1-modell/${navn}`, import.meta.url));

// ---------------------------------------------------------------------------
// Felles: kamper med NevroHjerne, og hver tilstand vist fram — alle faser
// ---------------------------------------------------------------------------

function kamper(frøer: readonly number[], maksRunder: number, besøk: (s: GameState, bok: Hukommelse) => void): void {
  for (const frø of frøer) {
    const drivere = [0, 1, 2, 3].map(() => lagIndre("nevro"));
    const bok = new Hukommelse();
    let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, frø);
    for (let vakt = 0; s.fase !== "FERDIG" && vakt < 20_000; vakt++) {
      bok.observer(s);
      besøk(s, bok);
      if (s.fase === "RUNDE_SLUTT") {
        if (s.rundeNr + 1 >= maksRunder) break;
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (sete === null || sete === undefined) break;
      s = utfør(s, drivere[sete]!.velgHandling(s)).state;
    }
  }
}

/** A | B for observatøren — det som faktisk legges bakerst i 996. */
function sanser(v: SpillerVisning, s: GameState): Float32Array {
  const ut = new Float32Array(MLB_TRO_SANSER2);
  ut.set(stillingTrekk(v, s.giving.antallStikk, s.regler.målPoeng), 0);
  ut.set(valgtBortTrekk(v), MLB_STILLING);
  return ut;
}

/**
 * ALT OBSERVATØREN IKKE SER, STOKKET: de andre hendene, talongen og — for en observatør som
 * ikke er budvinner — vraket, med størrelsene beholdt. Makkeren følger det kalte kortet, som
 * motoren gjør ved VELG, så en blokk som leste den ekte makkeren før avsløringen ser byttet.
 *
 * Verdenen blir ofte UMULIG (en som har vist renons får fargen tilbake). Det er med vilje:
 * blokkene leser bare visningen, og en umulig verden er en strengere prøve enn en forenlig.
 */
function byttSkjulte(s: GameState, obs: number, rng: () => number): GameState {
  const medVrak = s.budvinner !== obs;
  const pott: Kort[] = [];
  for (let p = 0; p < 4; p++) if (p !== obs) pott.push(...(s.hender[p] ?? []));
  pott.push(...s.talong);
  if (medVrak) pott.push(...s.vrak);
  for (let i = pott.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pott[i], pott[j]] = [pott[j]!, pott[i]!];
  }
  let o = 0;
  const ta = (n: number): Kort[] => pott.slice(o, (o += n));
  const hender = s.hender.map((h, p) => (p === obs ? h : ta(h.length)));
  const talong = ta(s.talong.length);
  const vrak = medVrak ? ta(s.vrak.length) : s.vrak;
  let makker = s.makker;
  if (s.makker !== null && !s.makkerAvslørt && s.etterlyst !== null) {
    const e = s.etterlyst;
    const holder = hender.findIndex((h) => h.some((k) => k.farge === e.farge && k.verdi === e.verdi));
    makker = holder >= 0 ? holder : null;
  }
  return { ...s, hender, talong, vrak, makker } as GameState;
}

const likKort = (a: readonly Kort[], b: readonly Kort[]): boolean =>
  a.length === b.length && a.every((k, i) => k.farge === b[i]!.farge && k.verdi === b[i]!.verdi);

type Bygger = (s: GameState, obs: number, bok: Hukommelse) => Float32Array;

interface K2Utfall {
  avvik: string[];
  faser: Record<string, number>;
  sammenlikninger: number;
  flyttet: number;
  vrakFlyttet: number;
  førAvsløring: number;
}

const K2_FRØ = [6_120_001, 6_120_002, 6_120_003];

/** Prøven: hver ikke-budvinner-observatør i hver tilstand, to bytter hver. */
function k2(bygg: Bygger, frøer: readonly number[] = K2_FRØ, maksRunder = 3): K2Utfall {
  const u: K2Utfall = { avvik: [], faser: {}, sammenlikninger: 0, flyttet: 0, vrakFlyttet: 0, førAvsløring: 0 };
  let nr = 0;
  kamper(frøer, maksRunder, (s, bok) => {
    for (let obs = 0; obs < 4; obs++) {
      if (s.budvinner === obs) continue;
      nr++;
      const fasit = bygg(s, obs, bok);
      u.faser[s.fase] = (u.faser[s.fase] ?? 0) + 1;
      if (s.fase === "SPILL" && s.makker !== null && !s.makkerAvslørt) u.førAvsløring++;
      for (let b = 0; b < 2; b++) {
        const s2 = byttSkjulte(s, obs, lagRng(90_000 + nr * 7 + b));
        u.sammenlikninger++;
        if (s2.hender.some((h, p) => !likKort(h, s.hender[p]!)) || !likKort(s2.talong, s.talong) || !likKort(s2.vrak, s.vrak)) u.flyttet++;
        if (!likKort(s2.vrak, s.vrak)) u.vrakFlyttet++;
        const annen = bygg(s2, obs, bok);
        const i = fasit.findIndex((x, j) => !Object.is(x, annen[j]));
        if (i >= 0) {
          u.avvik.push(`${s.fase} runde ${s.rundeNr} stikk ${s.stikkSpilt} obs ${obs}: trekk ${i} er ${fasit[i]} mot ${annen[i]}`);
        }
      }
    }
  });
  return u;
}

// ---------------------------------------------------------------------------
// 1. Breddene
// ---------------------------------------------------------------------------

test("breddene: 996 = 920 + 36 + 40, 323 = 287 + 36, og alle gamle bredder står", () => {
  assert.equal(MLB_STILLING, 36);
  assert.equal(MLB_VALGT_BORT, 40);
  assert.equal(MLB_TRO_INN_HS2, 996);
  assert.equal(BUDQ_INN_HS2, 323);
  assert.deepEqual([...MLB_TRO_BREDDER], [660, 804, 776, 920, 996, 1040]);
  assert.deepEqual(troKolonnekart(920, 996), [[0, 0, 660], [660, 660, 144], [804, 804, 116]]);
  assert.deepEqual(troKolonnekart(776, 920), [[0, 0, 660], [660, 804, 116]], "776 → 920 setter signalet på 804");
  assert.throws(() => troKolonnekart(776, 804), /signal.*finnes ikke/);
  assert.throws(() => new BudQagent(lagIndre("nevro"), tilfeldigNett(200, BUDQ_UT, 1)), /143 eller 287/);
});

// ---------------------------------------------------------------------------
// 2. Semantikken, på håndbygde stillinger
// ---------------------------------------------------------------------------

const k = (t: string): Kort => ({ farge: t[0] as Farge, verdi: Number(t.slice(1)) as Kort["verdi"] });

const BASIS: SpillerVisning = {
  fase: "SPILL",
  iTur: null,
  deg: 0,
  dinHånd: [],
  antallKort: [12, 12, 12, 12],
  totalPoeng: [0, 0, 0, 0],
  rundeNr: 1,
  giver: 3,
  budrunde: {
    passet: [false, true, true, true],
    høyeste: { spiller: 0, bud: 8 },
    sisteBud: [8, null, null, null],
    // Rekka som gir nøyaktig aggregatene over: sete 0 bød 8, de tre andre passet.
    rekke: [{ sete: 0, bud: 8 }, { sete: 1, bud: PASS }, { sete: 2, bud: PASS }, { sete: 3, bud: PASS }],
  },
  budvinner: 0,
  melding: { type: "tall", bud: 8 },
  trumf: "S",
  etterlyst: k("S13"),
  makker: null,
  bord: [],
  stikkVunnet: [0, 0, 0, 0],
  stikkSpilt: 0,
  forrigeStikk: null,
  historikk: [],
  dittVrak: [],
  sisteRunde: null,
  vinner: null,
  lovligeKort: [],
};

function medStikk(v: SpillerVisning, stikk: readonly (readonly [number, string])[][], bord: readonly (readonly [number, string])[] = []): SpillerVisning {
  const historikk = stikk.map((st) => {
    const kort = st.map(([spiller, t]) => ({ spiller, kort: k(t) }));
    return { kort, vinner: stikkvinner(kort, v.trumf!) };
  });
  return { ...v, historikk, stikkSpilt: historikk.length, bord: bord.map(([spiller, t]) => ({ spiller, kort: k(t) })) };
}

/** Cellen for absolutt sete `p` sett fra `deg`, som et vanlig tallarray. */
const celle = (blokk: Float32Array, deg: number, p: number, per: number): number[] =>
  [...blokk.subarray(((p - deg + 4) % 4) * per, (((p - deg + 4) % 4) + 1) * per)];

test("B, kjente lag: kastet mot, dukket (og bevist), budlagets sideutspill med trumf ute, ikke retur", () => {
  // Budvinner 0, trumf spar, kalt S13 hos sete 2 (avslørt på sekvensindeks 2).
  const v = medStikk(
    { ...BASIS, deg: 3, dinHånd: [k("S5"), k("H5"), k("R7")], makker: 2 },
    [
      [[0, "S2"], [1, "S3"], [2, "S13"], [3, "S4"]], //  0– 3: trumf av plikt, makkeren avslørt
      [[2, "H14"], [3, "H2"], [0, "H3"], [1, "R5"]], //  4– 7: sete 1 renons, kaster på motpartens ess
      [[2, "K12"], [3, "K2"], [0, "K3"], [1, "K4"]], //  8–11: sete 1 sist, legger under — og har K14
      [[2, "K5"], [3, "K6"], [0, "K8"], [1, "K14"]], // 12–15: ... som kommer her
    ],
  );
  const b = valgtBortTrekk(v);
  const P = VB.PER_SETE;
  const tom = new Array<number>(P).fill(0);
  const sete1 = tom.slice();
  sete1[VB.KASTET_MOT] = 0.25;
  sete1[VB.SIST_SJANSE] = 0.5; // stikk 2 (la under) og stikk 3 (tok over)
  sete1[VB.DUKKET] = 0.25;
  sete1[VB.DUKKET_BEVIST] = 0.25;
  assert.deepEqual(celle(b, 3, 1, P), sete1);
  const sete2 = tom.slice();
  sete2[VB.BUDLAG_UTSPILL] = 0.75; // stikk 1, 2, 3 — ikke stikk 0, der trumf er plikt
  sete2[VB.BUDLAG_SIDEUTSPILL] = 0.75;
  sete2[VB.IKKE_RETUR] = 0.75; // budvinneren åpnet i spar, makkeren kom aldri tilbake
  assert.deepEqual(celle(b, 3, 2, P), sete2);
  assert.deepEqual(celle(b, 3, 0, P), tom, "budvinneren fulgte under sin egen makker — ikke et valg bort");
  // Meg (sete 3) sist i stikk 0 under makkerens S13: S14 er ikke på MIN hånd, og jeg vet det — ingen sjanse.
  assert.deepEqual(celle(b, 3, 3, P), tom, "observatøren kjenner sin egen hånd: uten S14 var det ikke noe å dukke med");
});

test("B, før avsløringen: bare ROLLEN teller, selv om vi i dag vet hvem makkeren var; så retur og kastet mot", () => {
  const v = medStikk(
    { ...BASIS, deg: 2, dinHånd: [k("H5"), k("K2")], makker: 3 },
    [
      [[0, "H14"], [1, "R2"], [2, "H2"], [3, "S13"]], // 0–3: budvinneren uten trumf; sete 1 kaster på budvinneren FØR avsløringen
      [[3, "H3"], [0, "H6"], [1, "K9"], [2, "R9"]], //   4–7: makkeren (kjent) kommer tilbake i hjerter; 1 og 2 kaster mot budvinneren
      [[0, "R14"], [1, "R3"], [2, "R4"], [3, "S5"]], //  8–11: budvinneren i sidefarge, trumf ute, ikke tilbake i makkerens hjerter
    ],
  );
  const b = valgtBortTrekk(v);
  const P = VB.PER_SETE;
  const tom = new Array<number>(P).fill(0);
  const s1 = tom.slice();
  s1[VB.KASTET_ROLLE] = 0.25;
  s1[VB.KASTET_MOT] = 0.25;
  assert.deepEqual(celle(b, 2, 1, P), s1);
  const s2 = tom.slice();
  s2[VB.KASTET_MOT] = 0.25;
  assert.deepEqual(celle(b, 2, 2, P), s2);
  const s0 = tom.slice();
  s0[VB.BUDLAG_UTSPILL] = 0.25;
  s0[VB.BUDLAG_SIDEUTSPILL] = 0.25;
  s0[VB.IKKE_RETUR] = 0.25;
  assert.deepEqual(celle(b, 2, 0, P), s0);
  const s3 = tom.slice();
  s3[VB.BUDLAG_UTSPILL] = 0.25; // S5 spilt SENERE av sete 3 selv teller ikke som «ute»; S2 m.fl. gjør
  s3[VB.BUDLAG_SIDEUTSPILL] = 0.25;
  s3[VB.RETUR] = 0.25;
  assert.deepEqual(celle(b, 2, 3, P), s3);
});

test("B, solo: lagene kjent fra start, kastet under motpartens trumf, og bordet tas med", () => {
  const v = medStikk(
    {
      ...BASIS,
      deg: 1,
      budrunde: {
        passet: [false, true, true, true],
        høyeste: { spiller: 0, bud: SOLO },
        sisteBud: [SOLO, null, null, null],
        rekke: [{ sete: 1, bud: PASS }, { sete: 2, bud: PASS }, { sete: 3, bud: PASS }, { sete: 0, bud: SOLO }],
      },
      melding: { type: "solo", bud: 0 },
      etterlyst: null,
    },
    [
      [[0, "S2"], [1, "S3"], [2, "S4"], [3, "S14"]],
      [[3, "H14"], [0, "S5"], [1, "R2"], [2, "H2"]], // 4–7: budvinneren trumfer, sete 1 kaster under trumfen
    ],
    [[0, "K2"]], // 8: budvinneren i sidefarge med trumf ute, på bordet
  );
  const b = valgtBortTrekk(v);
  const P = VB.PER_SETE;
  const tom = new Array<number>(P).fill(0);
  const s1 = tom.slice();
  s1[VB.KASTET_UNDER_TRUMF_MOT] = 0.25;
  assert.deepEqual(celle(b, 1, 1, P), s1);
  const s0 = tom.slice();
  s0[VB.BUDLAG_UTSPILL] = 0.25;
  s0[VB.BUDLAG_SIDEUTSPILL] = 0.25;
  assert.deepEqual(celle(b, 1, 0, P), s0);
  assert.deepEqual(celle(b, 1, 2, P), tom, "sist med trumf på stikket er ingen dukk");
  assert.deepEqual(celle(b, 1, 3, P), tom, "solo: forsvarerne har ingen lagkamerat-utspill å returnere");
  assert.ok(valgtBortTrekk({ ...BASIS, budvinner: null, melding: null, trumf: null, fase: "BUDRUNDE" }).every((x) => x === 0));
});

test("A: poeng, rang, avstand, budbehov og hvem som kan gå ut på hva — i budrunden og i spillet", () => {
  const nær = (a: number, b: number, hva: string): void => assert.ok(Math.abs(a - b) < 1e-6, `${hva}: ${a} mot ${b}`);
  const P = SA.PER_SETE;
  const bud: SpillerVisning = {
    ...BASIS,
    fase: "BUDRUNDE",
    deg: 1,
    totalPoeng: [95, 40, 60, 40],
    budvinner: null,
    melding: null,
    trumf: null,
    etterlyst: null,
    budrunde: {
      passet: [false, false, false, false],
      høyeste: { spiller: 2, bud: AMERIKANER },
      sisteBud: [null, 7, AMERIKANER, 12],
      rekke: [{ sete: 1, bud: 7 }, { sete: 3, bud: 12 }, { sete: 2, bud: AMERIKANER }],
    },
  };
  const a = stillingTrekk(bud, 12, 100);
  const s0 = celle(a, 1, 0, P);
  nær(s0[SA.POENG]!, 0.95, "sete 0 poeng");
  nær(s0[SA.IGJEN]!, 0.05, "sete 0 igjen");
  assert.equal(s0[SA.RANG], 0);
  assert.equal(s0[SA.AVSTAND], 0);
  nær(s0[SA.BUDBEHOV]!, 3 / 12, "sete 0 trenger et klart tallbud på 3 (i praksis 5)");
  assert.deepEqual([s0[SA.NÅR_TALLBUD], s0[SA.NÅR_AMERIKANER], s0[SA.NÅR_EGET_BUD], s0[SA.NÅR_I_RUNDEN]], [1, 1, 0, 0]);
  const s1 = celle(a, 1, 1, P);
  nær(s1[SA.RANG]!, 2 / 3, "sete 1 har to foran");
  nær(s1[SA.AVSTAND]!, 0.55, "sete 1 avstand");
  assert.deepEqual([s1[SA.BUDBEHOV], s1[SA.NÅR_TALLBUD], s1[SA.NÅR_AMERIKANER], s1[SA.NÅR_EGET_BUD]], [1, 0, 0, 0]);
  const s2 = celle(a, 1, 2, P);
  assert.deepEqual([s2[SA.NÅR_TALLBUD], s2[SA.NÅR_AMERIKANER], s2[SA.NÅR_EGET_BUD]], [0, 1, 1], "60 + amerikaner = 110");
  const s3 = celle(a, 1, 3, P);
  assert.equal(s3[SA.RANG], s1[SA.RANG], "delt plass gir samme rang");
  assert.equal(s3[SA.NÅR_EGET_BUD], 0, "40 + 24 når ikke 100");

  // SPILLET: tall 8, makkeren IKKE avslørt, 6 stikk spilt.
  const spill: SpillerVisning = { ...BASIS, deg: 2, totalPoeng: [90, 93, 60, 40], stikkVunnet: [3, 2, 1, 0], stikkSpilt: 6 };
  const b = stillingTrekk(spill, 12, 100);
  assert.equal(celle(b, 2, 0, P)[SA.NÅR_I_RUNDEN], 1, "budvinneren på 90 klarer 8: +16");
  assert.equal(celle(b, 2, 1, P)[SA.NÅR_I_RUNDEN], 1, "sete 1 på 93: 2 stikk + 6 igjen = 8 ≥ 7");
  assert.equal(celle(b, 2, 2, P)[SA.NÅR_I_RUNDEN], 0, "sete 2 på 60: høyst 8 (makker) eller 7 (forsvar)");
  // Kontrakten er FELT offentlig: 9 stikk spilt, de tre andre har 3 hver — minst 6 er sikkert forsvarets.
  const felt = stillingTrekk({ ...spill, stikkVunnet: [0, 3, 3, 3], stikkSpilt: 9 }, 12, 100);
  assert.equal(celle(felt, 2, 0, P)[SA.NÅR_I_RUNDEN], 0, "felt kontrakt: budvinneren kan ikke nå målet");
  // Budrunden har ingen roller: NÅR_I_RUNDEN er null for alle.
  for (let p = 0; p < 4; p++) assert.equal(celle(a, 1, p, P)[SA.NÅR_I_RUNDEN], 0);
});

// ---------------------------------------------------------------------------
// 3. K2: bytt hender, vrak og talong — og fellene
// ---------------------------------------------------------------------------

const ærligeSanser: Bygger = (s, obs) => sanser(spillerVisning(s, obs), s);

test("K2: for hver observatør som ikke er budvinner, i hver fase, er A | B bit-identisk når hender, vrak og talong byttes", () => {
  const u = k2(ærligeSanser);
  for (const fase of ["BUDRUNDE", "VRAK", "VELG", "SPILL", "RUNDE_SLUTT"]) {
    assert.ok((u.faser[fase] ?? 0) >= 6, `for få stillinger i ${fase}: ${JSON.stringify(u.faser)}`);
  }
  assert.ok((u.faser.SPILL ?? 0) >= 300, `for få spillestillinger: ${u.faser.SPILL}`);
  assert.ok(u.førAvsløring >= 20, `for få stillinger før makkeren er avslørt (${u.førAvsløring})`);
  assert.ok(u.flyttet >= u.sammenlikninger * 0.9, `byttet flyttet noe i bare ${u.flyttet} av ${u.sammenlikninger}`);
  assert.ok(u.vrakFlyttet >= 200, `vraket ble flyttet i bare ${u.vrakFlyttet} sammenlikninger`);
  assert.deepEqual(u.avvik.slice(0, 8), [], `JUKS: de nye blokkene avhenger av skjulte kort (${u.avvik.length} avvik)`);
});

test("K2: hele 996-vektoren (med bok) og BudQ 323 er også bit-identiske under det samme byttet", () => {
  const tro = k2(
    (s, obs, bok) =>
      troTrekkForBredde(MLB_TRO_INN_HS2, spillerVisning(s, obs), s.giving.antallStikk, s.regler.målPoeng, bok.vektor(obs, 4)),
    [6_120_004],
    3,
  );
  assert.ok((tro.faser.SPILL ?? 0) >= 100);
  assert.deepEqual(tro.avvik.slice(0, 8), [], `996-vektoren avhenger av skjulte kort (${tro.avvik.length})`);
  const budq = k2((s, obs, bok) => (s.fase === "BUDRUNDE" ? budqTrekk(s, obs, bok, true) : new Float32Array(1)), [6_120_005], 4);
  assert.ok((budq.faser.BUDRUNDE ?? 0) >= 20);
  assert.deepEqual(budq.avvik.slice(0, 8), [], `BudQ 323 avhenger av skjulte kort (${budq.avvik.length})`);
});

test("K2: også budvinneren — hendene og talongen byttet, eget vrak beholdt — gir samme blokker", () => {
  let n = 0;
  const avvik: string[] = [];
  kamper([6_120_006], 3, (s) => {
    const bv = s.budvinner;
    if (bv === null || (s.fase !== "SPILL" && s.fase !== "VELG")) return;
    const fasit = ærligeSanser(s, bv, null as unknown as Hukommelse);
    const s2 = byttSkjulte(s, bv, lagRng(4_000 + n++));
    assert.ok(likKort(s2.vrak, s.vrak), "budvinnerens eget vrak skal ikke byttes");
    const annen = ærligeSanser(s2, bv, null as unknown as Hukommelse);
    const i = fasit.findIndex((x, j) => !Object.is(x, annen[j]));
    if (i >= 0) avvik.push(`runde ${s.rundeNr} stikk ${s.stikkSpilt}: trekk ${i}`);
  });
  assert.ok(n >= 30, `for få budvinnerstillinger (${n})`);
  assert.deepEqual(avvik, []);
});

test("FELLE (b): en sans som leser VRAKET blir tatt — også via budvinnerens egen visning", () => {
  const direkte: Bygger = (s, obs, bok) => {
    const v = ærligeSanser(s, obs, bok);
    v[MLB_STILLING + VB.BUDLAG_UTSPILL] += s.vrak.reduce((a, x) => a + kortIndeks(x), 0) / 1000;
    return v;
  };
  const viaBudvinner: Bygger = (s, obs, bok) => {
    const v = ærligeSanser(s, obs, bok);
    if (s.budvinner !== null) v[SA.POENG] += spillerVisning(s, s.budvinner).dittVrak.filter((x) => x.farge === s.trumf).length / 13 + spillerVisning(s, s.budvinner).dittVrak.reduce((a, x) => a + kortIndeks(x), 0) / 1000;
    return v;
  };
  for (const [navn, bygg] of [["direkte", direkte], ["via budvinnerens visning", viaBudvinner]] as const) {
    const u = k2(bygg, [6_120_001], 2);
    assert.ok(u.avvik.length > 0, `en sans som leser vraket (${navn}) ble ikke tatt — K2-prøven beviser da ingenting`);
  }
});

test("FELLE (b'): en sans som leser TALONGEN i budrunden blir tatt", () => {
  const u = k2((s, obs, bok) => {
    const v = ærligeSanser(s, obs, bok);
    v[SA.IGJEN] += s.talong.reduce((a, x) => a + kortIndeks(x), 0) / 1000;
    return v;
  }, [6_120_001], 2);
  assert.ok(u.avvik.some((x) => x.startsWith("BUDRUNDE")), "en sans som leser talongen ble ikke tatt i budrunden");
});

test("FELLE (c): en sans som bruker den EKTE makkeren før avsløringen blir tatt", () => {
  const u = k2((s, obs, bok) => {
    const v = ærligeSanser(s, obs, bok);
    // Den «naturlige» feilen: lagene fra `state.makker`, som motoren kjenner fra VELG av.
    if (s.makker !== null && !s.makkerAvslørt) v[MLB_STILLING + ((s.makker - obs + 4) % 4) * VB.PER_SETE + VB.KASTET_MOT] += 1;
    return v;
  }, [6_120_001, 6_120_002], 3);
  assert.ok(u.førAvsløring > 0);
  assert.ok(u.avvik.length > 0, "en sans som kjenner makkeren før avsløringen ble ikke tatt");
});

// ---------------------------------------------------------------------------
// 4. A er offentlig: samme blokk for alle observatører, bare rotert
// ---------------------------------------------------------------------------

test("A er den samme for alle fire observatører, rotert til relativt sete (B er det ikke, og skal ikke være det)", () => {
  let n = 0;
  kamper([6_120_007], 4, (s) => {
    const rå = [0, 1, 2, 3].map((o) => stillingTrekk(spillerVisning(s, o), s.giving.antallStikk, s.regler.målPoeng));
    for (let o = 1; o < 4; o++) {
      for (let p = 0; p < 4; p++) {
        assert.deepEqual(celle(rå[o]!, o, p, SA.PER_SETE), celle(rå[0]!, 0, p, SA.PER_SETE), `${s.fase}: sete ${p} sett fra ${o}`);
      }
    }
    n++;
  });
  assert.ok(n >= 100);
});

// ---------------------------------------------------------------------------
// 5. Nullpunktet og fellene i nettet
// ---------------------------------------------------------------------------

function tilfeldigNett(inn: number, ut: number, frø: number, skjult = 24): NevroNett {
  const rng = lagRng(frø);
  const tall = (n: number, skala: number): Float32Array => Float32Array.from({ length: n }, () => (rng() - 0.5) * skala);
  return {
    lag: [
      { inn, ut: skjult, vekter: tall(inn * skjult, 0.4), bias: tall(skjult, 0.2) },
      { inn: skjult, ut, vekter: tall(skjult * ut, 0.6), bias: tall(ut, 1) },
    ],
  };
}

/** Nuller bakerst i første lag — BudQ-breddene er prefikser av hverandre. */
function nullerBakerst(n: NevroNett, til: number): NevroNett {
  const [l0, ...resten] = n.lag;
  const v = new Float32Array(l0!.ut * til);
  for (let r = 0; r < l0!.ut; r++) v.set(l0!.vekter.subarray(r * l0!.inn, (r + 1) * l0!.inn), r * til);
  return { lag: [{ inn: til, ut: l0!.ut, vekter: v, bias: Float32Array.from(l0!.bias) }, ...resten] };
}

/** Et 920-trohode: `tro-1.bin` om den finnes, ellers `mlb-tro.bin` med små tilfeldige hukommelses- og signalkolonner. */
function trohode920(): NevroNett {
  if (existsSync(fil("tro-1.bin"))) return nettFraBytes(readFileSync(fil("tro-1.bin")))[0]!;
  const u = utvidTronett(nettFraBytes(readFileSync(fil("mlb-tro.bin")))[0]!, MLB_TRO_INN_HS);
  const rng = lagRng(77);
  const l = u.lag[0]!;
  for (let r = 0; r < l.ut; r++) for (let c = MLB_TRO_INN; c < MLB_TRO_INN_HS; c++) l.vekter[r * l.inn + c] = (rng() - 0.5) * 0.05;
  return u;
}

test("nullpunktet: et 920-trohode med nuller bakerst gir NØYAKTIG samme tro, med bok; én koblet kolonne i A og i B endrer den", () => {
  const rå = trohode920();
  assert.equal(rå.lag[0]!.inn, MLB_TRO_INN_HS);
  const gammel = new MlbTronett(rå);
  const ny = new MlbTronett(utvidTronett(rå, MLB_TRO_INN_HS2));
  assert.equal(ny.innBredde, 996);
  assert.deepEqual([ny.brukerHukommelse, ny.brukerSignal, ny.brukerSanser2], [true, true, true]);
  assert.equal(gammel.brukerSanser2, false);

  const stillinger: { v: SpillerVisning; huk: Float64Array; s: GameState }[] = [];
  kamper([6_120_008], 3, (s, bok) => {
    if (s.fase === "SPILL" && s.iTur !== null && s.rundeNr >= 1 && s.stikkSpilt % 3 === 1 && s.bord.length === 1) {
      stillinger.push({ s, v: spillerVisning(s, s.iTur), huk: bok.vektor(s.iTur, 4) });
    }
  });
  assert.ok(stillinger.length >= 6, `for få stillinger (${stillinger.length})`);
  for (const { s, v, huk } of stillinger) {
    const t = ny.trekkFor(v, s.giving.antallStikk, 100, huk);
    assert.equal(t.length, 996);
    assert.ok(t.subarray(MLB_TRO_INN_HS).some((x) => x !== 0), "sanseblokkene er tomme — nullpunktet prøver ingenting");
    assert.deepEqual(ny.fordeling(t), gammel.fordeling(gammel.trekkFor(v, s.giving.antallStikk, 100, huk)));
  }

  // FELLENE: én koblet kolonne per blokk. IGJEN for meg er aldri null i spillet; BUDLAG_UTSPILL
  // for alle fire seter er det fra stikk 2.
  const kolonner = {
    A: [MLB_TRO_INN_HS + SA.IGJEN],
    B: [0, 1, 2, 3].map((r) => MLB_TRO_INN_HS + MLB_STILLING + r * VB.PER_SETE + VB.BUDLAG_UTSPILL),
  };
  for (const [blokk, kol] of Object.entries(kolonner)) {
    const plantet = utvidTronett(rå, MLB_TRO_INN_HS2);
    const l = plantet.lag[0]!;
    for (let r = 0; r < l.ut; r++) for (const c of kol) l.vekter[r * l.inn + c] = 3;
    const felle = new MlbTronett(plantet);
    let endret = 0;
    for (const { s, v, huk } of stillinger) {
      const pf = felle.fordeling(felle.trekkFor(v, s.giving.antallStikk, 100, huk));
      const pg = gammel.fordeling(gammel.trekkFor(v, s.giving.antallStikk, 100, huk));
      if (JSON.stringify(pf) !== JSON.stringify(pg)) endret++;
    }
    assert.ok(endret > 0, `en koblet kolonne i blokk ${blokk} endret ingen tro — blokken når ikke fram`);
  }
});

test("nullpunktet: BudQ 287 med nuller bakerst gir bit-identiske Q og bud gjennom kampen; en koblet stillingskolonne endrer Q", () => {
  const n287 = existsSync(fil("budq-1.bin")) ? nettFraBytes(readFileSync(fil("budq-1.bin")))[0]! : tilfeldigNett(BUDQ_INN_H, BUDQ_UT, 21);
  assert.equal(n287.lag[0]!.inn, BUDQ_INN_H);
  const a = new BudQagent(lagIndre("nevro"), n287);
  const b = new BudQagent(lagIndre("nevro"), nullerBakerst(n287, BUDQ_INN_HS2));
  const plantet = nullerBakerst(n287, BUDQ_INN_HS2);
  const l0 = plantet.lag[0]!;
  for (let r = 0; r < l0.ut; r++) l0.vekter[r * l0.inn + BUDQ_INN_H + SA.POENG] = 5;
  const c = new BudQagent(lagIndre("nevro"), plantet);
  let n = 0;
  let endret = 0;
  kamper([6_120_009, 6_120_010], 5, (s) => {
    a.observer(s);
    b.observer(s);
    c.observer(s);
    if (s.fase !== "BUDRUNDE" || s.iTur === null) return;
    const sete = s.iTur;
    const xb = b.trekk(s, sete);
    assert.equal(xb.length, BUDQ_INN_HS2);
    assert.deepEqual([...xb.subarray(0, BUDQ_INN_H)], [...a.trekk(s, sete)]);
    assert.deepEqual([...b.q(s, sete)], [...a.q(s, sete)]);
    assert.deepEqual(b.velgHandling(s), a.velgHandling(s));
    if (JSON.stringify([...c.q(s, sete)]) !== JSON.stringify([...a.q(s, sete)])) endret++;
    n++;
  });
  assert.ok(n >= 20, `for få budbeslutninger (${n})`);
  assert.ok(endret > 0, "en koblet stillingskolonne endret ingen Q — blokken når ikke fram");
});
