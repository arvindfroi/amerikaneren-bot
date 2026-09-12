/**
 * SANS C — AUKSJONENS REKKEFØLGE (12. sep). Seks ting må holde, og ingen av dem krasjer når
 * de svikter: de gir bare et nett som spiller litt dårligere, eller en måling av ingenting.
 *
 *   1. MOTOREN BOKFØRER RIKTIG. `Budrunde.rekke` er meldingene i den rekkefølgen de falt,
 *      bare denne rundens, og aggregatene (`passet`, `høyeste`, `sisteBud`) er URØRT — hver
 *      leser fra før skal se nøyaktig de samme tallene.
 *   2. BLOKKEN SIER DET NAVNET SIER, på håndspilte auksjoner der vi vet svaret.
 *   3. DEN BÆRER NOE AGGREGATENE IKKE HAR. To auksjoner med IDENTISKE aggregater og ulik
 *      rekkefølge må gi bit-identiske 996-trekk og ULIKE 1040-trekk. Er de like, er blokken
 *      en dyr omskriving av noe nettet alt leser.
 *   4. K2. Auksjonen er offentlig, men blokken skal ikke røre noe annet: bytte av alle
 *      skjulte hender, talongen og vraket gir bit-identiske trekk. FELLE: en variant som
 *      leser en skjult hånd MÅ bli tatt.
 *   5. GJENSKAPTE STILLINGER BÆRER REKKA. `visningTilState` og `medVerden` bygger nye
 *      `GameState` fra en visning/verden; mister de rekka, scorer den gjenskapte stillingen
 *      ANNERLEDES enn den ekte uten at noe feiler. FELLE: en gjenskaping med tømt rekke må
 *      bli tatt av nøyaktig denne prøven.
 *   6. NULLPUNKTET. Et 996-trohode og et 287/323-BudQ-nett utvidet med nuller bakerst gir
 *      NØYAKTIG samme tro og samme bud — og én koblet kolonne i den nye blokken endrer svaret.
 */
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { spillerVisning, type SpillerVisning } from "../src/motor.ts";
import { lagRng, type Kort } from "../src/kort.ts";
import { AMERIKANER, PASS, SOLO, type Bud } from "../src/regler.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { medVerden } from "../src/moe2/sdkort.ts";
// `kortTilInt` bor i solveren, ikke i sdkort — sdkort importerer den derfra selv.
import { kortTilInt } from "../src/solver/dds.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import { visningTilState } from "../src/mlb/trekk.ts";
import { AUKSJONINNGANG as AU, MLB_AUKSJON, auksjonsrekkeTrekk } from "../src/mlb/auksjonsrekke.ts";
import {
  MLB_TRO_BREDDER,
  MLB_TRO_INN_HS2,
  MLB_TRO_INN_HS2A,
  troKolonnekart,
  troTrekkForBredde,
} from "../src/mlb/trotrekk.ts";
import { MlbTronett, utvidTronett } from "../src/mlb/tronett.ts";
import { BUDQ_INN_H, BUDQ_INN_HS2, BUDQ_INN_HS3, BUDQ_UT, BudQagent, budqTrekk } from "../src/moe2/budq.ts";
import { nettFraBytes, type NevroNett } from "../src/nevro/nett.ts";

const ROT = fileURLToPath(new URL("..", import.meta.url));
const fil = (navn: string): string => fileURLToPath(new URL(`../e1-modell/${navn}`, import.meta.url));
/** Relativ til ROT og ignorert av git (`/_*`). Per prosess, så parallelle kjøringer ikke deler fil. */
const MAPPE = `_test-auksjon-${process.pid}`;
before(() => mkdirSync(`${ROT}/${MAPPE}`, { recursive: true }));
after(() => rmSync(`${ROT}/${MAPPE}`, { recursive: true, force: true }));

/** Spiller en GITT budrekke fra en fersk giv. Returnerer tilstanden etter siste melding. */
function auksjon(frø: number, meldinger: readonly (number | typeof PASS | typeof AMERIKANER | typeof SOLO)[]): GameState {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  for (const bud of meldinger) {
    if (s.fase !== "BUDRUNDE" || s.iTur === null) break;
    s = utfør(s, { type: "BUD", spiller: s.iTur, bud }).state;
  }
  return s;
}

/** Cellen for relativt sete `r`. */
const celle = (v: Float32Array, r: number): number[] => [...v.subarray(r * AU.PER_SETE, (r + 1) * AU.PER_SETE)];

// ---------------------------------------------------------------------------
// 1. Motoren bokfører rekka — og rører ikke aggregatene
// ---------------------------------------------------------------------------

test("motoren: rekka er meldingene i rekkefølge, og aggregatene er nøyaktig som før", () => {
  const s = auksjon(4_400_001, [5, PASS, 7, PASS]);
  const åpner = (s.giver + 1) % 4;
  assert.deepEqual(
    s.budrunde.rekke.map((x) => [x.sete, x.bud]),
    [
      [åpner, 5],
      [(åpner + 1) % 4, PASS],
      [(åpner + 2) % 4, 7],
      [(åpner + 3) % 4, PASS],
    ],
  );
  // AGGREGATENE URØRT: nøyaktig det enhver leser fra før ville sett.
  assert.equal(s.budrunde.høyeste?.bud, 7);
  assert.equal(s.budrunde.høyeste?.spiller, (åpner + 2) % 4);
  assert.equal(s.budrunde.sisteBud[åpner], 5);
  assert.equal(s.budrunde.sisteBud[(åpner + 2) % 4], 7);
  assert.deepEqual(s.budrunde.passet[(åpner + 1) % 4], true);
});

test("motoren: en melding som AVSLUTTER budrunden står også i rekka, og ny giv tømmer den", () => {
  // Solo avslutter umiddelbart (`utførBud` returnerer rett etter `avsluttBudrunde`).
  const solo = auksjon(4_400_002, [SOLO]);
  assert.notEqual(solo.fase, "BUDRUNDE");
  assert.equal(solo.budrunde.rekke.length, 1);
  assert.equal(solo.budrunde.rekke[0]!.bud, SOLO);

  // Alle passer → ny giv, og rekka skal være tom (som resten av rundedataene).
  const alle = auksjon(4_400_003, [PASS, PASS, PASS, PASS]);
  assert.equal(alle.fase, "BUDRUNDE");
  assert.equal(alle.rundeNr, 1);
  assert.deepEqual([...alle.budrunde.rekke], []);
});

test("motoren: rekka går uredigert med i spillerVisning — auksjonen er offentlig", () => {
  const s = auksjon(4_400_004, [6, PASS, 8]);
  for (let sete = 0; sete < 4; sete++) {
    assert.deepEqual(
      spillerVisning(s, sete).budrunde.rekke.map((x) => [x.sete, x.bud]),
      s.budrunde.rekke.map((x) => [x.sete, x.bud]),
      `sete ${sete} ser en annen auksjon enn den som ble spilt`,
    );
  }
});

// ---------------------------------------------------------------------------
// 2. Semantikken
// ---------------------------------------------------------------------------

test("semantikk: krypern og hopperen skilles — antall hevninger, største hopp, og passet-etter-bud", () => {
  // a KRYPER 5 → 7 og passer så; b HOPPER 6 → 11. c og d er ute med én gang.
  // Meldingene må følge turen (`utfør` krever det, og krevde det da denne prøven først ble
  // skrevet feil), så planen ligger per sete og turen bestemmer hvem som melder når.
  let t: GameState = opprettSpill({ antallSpillere: 4 }, 4_400_006);
  const a = t.iTur!;
  const b = (a + 1) % 4;
  const plan = new Map<number, Bud[]>([
    [a, [5, 7, PASS]],
    [b, [6, 11]],
    [(a + 2) % 4, [PASS]],
    [(a + 3) % 4, [PASS]],
  ]);
  for (let vakt = 0; t.fase === "BUDRUNDE" && t.iTur !== null && vakt < 20; vakt++) {
    const bud = plan.get(t.iTur)?.shift();
    if (bud === undefined) break;
    t = utfør(t, { type: "BUD", spiller: t.iTur, bud }).state;
  }
  // 5, 6, pass, pass, 7, 11, pass — sju meldinger, FIRE bud, og b står igjen alene.
  assert.deepEqual(
    t.budrunde.rekke.map((x) => x.bud),
    [5, 6, PASS, PASS, 7, 11, PASS],
  );
  const v = auksjonsrekkeTrekk(spillerVisning(t, a));
  const meg = celle(v, 0); // rel 0 = a selv
  const nabo = celle(v, ((b - a) + 4) % 4);

  assert.equal(meg[AU.DELTOK], 1);
  assert.equal(meg[AU.BØD], 1);
  assert.equal(meg[AU.ANTALL_BUD], 0.5, "a hevet to ganger av maks fire");
  assert.equal(meg[AU.PASSET_ETTER_BUD], 1, "a passet ETTER å ha budt");
  assert.equal(nabo[AU.PASSET_ETTER_BUD], 0);
  assert.equal(nabo[AU.ANTALL_BUD], 0.5);
  // Hopperen har det STØRSTE spranget (7 → 11 = fire nivåer), krypern bare ett om gangen.
  // Tallene er nivåskalaen (`HOPPSKALA` = 11, fra 4 til Solo på 15), ikke `budRang`: med rangen
  // ville de vært 0,002 og 0,0005 — under støygulvet ved siden av trekk som ligger på 1, og da
  // måler prøven at kolonnen er der, ikke at den er brukbar.
  assert.equal(meg[AU.STØRSTE_HOPP], Math.fround(1 / 11), "krypern hever ett nivå om gangen");
  assert.equal(nabo[AU.STØRSTE_HOPP], Math.fround(4 / 11), "hopperen tar fire nivåer i ett byks");
  assert.equal(meg[AU.FØRSTE_HOPP], Math.fround(1 / 11), "a åpnet på 5, ett nivå over bunnen");
  assert.equal(nabo[AU.FØRSTE_HOPP], Math.fround(1 / 11), "b åpnet forsiktig, på 6");
  // a åpnet auksjonen, altså FØR lederen (b, som holder 11).
  assert.equal(meg[AU.FØR_LEDEREN], 1);
  assert.equal(meg[AU.ETTER_LEDEREN], 0);
  assert.deepEqual([nabo[AU.FØR_LEDEREN], nabo[AU.ETTER_LEDEREN]], [0, 0], "lederen selv har 0 i begge");
  assert.equal(v[AU.FELLES + AU.LENGDE], Math.fround(7 / 12));
  assert.equal(v[AU.FELLES + AU.BUDANDEL], Math.fround(4 / 7), "fire av sju meldinger var bud");
});

test("semantikk: «bød aldri» er skillbart fra «bød på plass 0» — ellers koder vi to ting likt", () => {
  const s = auksjon(4_400_007, [5, PASS]);
  const åpner = (s.giver + 1) % 4;
  const v = auksjonsrekkeTrekk(spillerVisning(s, åpner));
  const passeren = celle(v, 1);
  const stille = celle(v, 2); // har ikke meldt i det hele tatt ennå
  assert.deepEqual([celle(v, 0)[AU.BØD], celle(v, 0)[AU.FØRSTE_POS]], [1, 0], "åpneren bød på plass 0");
  assert.deepEqual([passeren[AU.BØD], passeren[AU.DELTOK]], [0, 1], "passeren deltok, men bød ikke");
  assert.deepEqual([stille[AU.BØD], stille[AU.DELTOK]], [0, 0], "det stille setet har ikke meldt");
});

test("semantikk: tom rekke gir en ren nullvektor", () => {
  const s = opprettSpill({ antallSpillere: 4 }, 4_400_008);
  assert.deepEqual([...auksjonsrekkeTrekk(spillerVisning(s, 0))], new Array<number>(MLB_AUKSJON).fill(0));
});

// ---------------------------------------------------------------------------
// 3. Bærer den noe aggregatene IKKE har?
// ---------------------------------------------------------------------------

/** Samme visning, men med meldingene i en annen rekkefølge. Aggregatene er bevisst urørt. */
const medRekke = (v: SpillerVisning, rekke: SpillerVisning["budrunde"]["rekke"]): SpillerVisning => ({
  ...v,
  budrunde: { ...v.budrunde, rekke },
});

test("rekkefølgen bærer noe nytt: identiske aggregater gir IDENTISKE 996-trekk og ULIKE 1040-trekk", () => {
  // En ekte spillestilling, så alt annet enn rekka er virkelig.
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 4_400_009);
  const drivere = [0, 1, 2, 3].map(() => lagIndre("nevro"));
  for (let vakt = 0; s.fase !== "SPILL" && vakt < 200; vakt++) {
    const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    s = utfør(s, drivere[sete]!.velgHandling(s)).state;
  }
  const sete = s.iTur!;
  const ekte = spillerVisning(s, sete);
  assert.ok(ekte.budrunde.rekke.length >= 2, "for kort auksjon til å permutere");

  // SAMME aggregater, MOTSATT rekkefølge. `passet`, `høyeste` og `sisteBud` er ikke rørt.
  const snudd = medRekke(ekte, [...ekte.budrunde.rekke].reverse());
  assert.deepEqual(snudd.budrunde.sisteBud, ekte.budrunde.sisteBud);
  assert.deepEqual(snudd.budrunde.passet, ekte.budrunde.passet);

  const bok = new Hukommelse().vektor(sete, 4);
  const t996a = troTrekkForBredde(MLB_TRO_INN_HS2, ekte, s.giving.antallStikk, 100, bok);
  const t996b = troTrekkForBredde(MLB_TRO_INN_HS2, snudd, s.giving.antallStikk, 100, bok);
  assert.deepEqual([...t996b], [...t996a], "996 SKAL være blind for rekkefølgen — det er hele poenget");

  const t1040a = troTrekkForBredde(MLB_TRO_INN_HS2A, ekte, s.giving.antallStikk, 100, bok);
  const t1040b = troTrekkForBredde(MLB_TRO_INN_HS2A, snudd, s.giving.antallStikk, 100, bok);
  assert.deepEqual([...t1040a.subarray(0, MLB_TRO_INN_HS2)], [...t996a], "de 996 første må stå urørt i 1040");
  assert.notDeepEqual([...t1040b], [...t1040a], "1040 skiller ikke to ulike auksjoner — blokken bærer ingenting");
});

test("breddene: 1040 = 996 + 44, og kolonnekartet legger auksjonen BAKERST", () => {
  assert.equal(MLB_AUKSJON, 44);
  assert.equal(MLB_TRO_INN_HS2A, 1040);
  assert.equal(BUDQ_INN_HS3, 367);
  assert.deepEqual([...MLB_TRO_BREDDER], [660, 804, 776, 920, 996, 1028, 1040, 1072]);
  assert.deepEqual(troKolonnekart(996, 1040), [[0, 0, 660], [660, 660, 144], [804, 804, 116], [920, 920, 36], [956, 956, 40]]);
  assert.throws(() => troKolonnekart(1040, 996), /auksjon.*finnes ikke/);
});

// ---------------------------------------------------------------------------
// 4. K2
// ---------------------------------------------------------------------------

/** Alt observatøren ikke ser, stokket — samme regel som `test/mlb-sanser2.test.ts`. */
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
  return { ...s, hender, talong, vrak };
}

function kamper(frøer: readonly number[], maksRunder: number, besøk: (s: GameState) => void): void {
  for (const frø of frøer) {
    const drivere = [0, 1, 2, 3].map(() => lagIndre("nevro"));
    let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, frø);
    for (let vakt = 0; s.fase !== "FERDIG" && vakt < 20_000; vakt++) {
      besøk(s);
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

type Bygger = (s: GameState, obs: number) => Float32Array;

function k2(bygg: Bygger): { avvik: string[]; n: number; faser: Record<string, number> } {
  const u = { avvik: [] as string[], n: 0, faser: {} as Record<string, number> };
  let nr = 0;
  kamper([4_410_001, 4_410_002], 3, (s) => {
    for (let obs = 0; obs < 4; obs++) {
      if (s.budvinner === obs) continue;
      nr++;
      const fasit = bygg(s, obs);
      u.faser[s.fase] = (u.faser[s.fase] ?? 0) + 1;
      for (let b = 0; b < 2; b++) {
        const s2 = byttSkjulte(s, obs, lagRng(31_000 + nr * 7 + b));
        u.n++;
        const annen = bygg(s2, obs);
        const i = fasit.findIndex((x, j) => !Object.is(x, annen[j]));
        if (i >= 0) u.avvik.push(`${s.fase} runde ${s.rundeNr}: trekk ${i}`);
      }
    }
  });
  return u;
}

const ærlig: Bygger = (s, obs) => auksjonsrekkeTrekk(spillerVisning(s, obs));

test("K2: auksjonsblokken er bit-identisk når hender, talong og vrak byttes — i alle faser", () => {
  const u = k2(ærlig);
  assert.ok(u.n >= 200, `for få sammenlikninger (${u.n})`);
  assert.ok((u.faser.BUDRUNDE ?? 0) >= 10, `for få budrundestillinger: ${JSON.stringify(u.faser)}`);
  assert.ok((u.faser.SPILL ?? 0) >= 100, `for få spillestillinger: ${JSON.stringify(u.faser)}`);
  assert.deepEqual(u.avvik.slice(0, 5), [], `JUKS: auksjonsblokken avhenger av skjulte kort (${u.avvik.length} avvik)`);
});

test("FELLE: en auksjonsblokk som leser en SKJULT HÅND blir tatt av den samme prøven", () => {
  const u = k2((s, obs) => {
    const v = ærlig(s, obs);
    // Den minste tenkelige lekkasjen: ett bit om naboens hånd.
    const nabo = (obs + 1) % 4;
    v[AU.FELLES + AU.LENGDE] += (s.hender[nabo] ?? []).reduce((a, k) => a + kortTilInt(k), 0) / 100_000;
    return v;
  });
  assert.ok(u.avvik.length > 0, "en blokk som leser en skjult hånd ble ikke tatt — K2-prøven beviser da ingenting");
});

test("K2: blokken er den SAMME for alle fire observatørene, bare rotert (auksjonen er offentlig)", () => {
  let n = 0;
  kamper([4_410_003], 3, (s) => {
    if (s.budrunde.rekke.length === 0) return;
    const rå = [0, 1, 2, 3].map((o) => auksjonsrekkeTrekk(spillerVisning(s, o)));
    for (let o = 1; o < 4; o++) {
      for (let p = 0; p < 4; p++) {
        assert.deepEqual(celle(rå[o]!, (p - o + 4) % 4), celle(rå[0]!, (p - 0 + 4) % 4), `${s.fase}: sete ${p} sett fra ${o}`);
      }
    }
    n++;
  });
  assert.ok(n >= 50, `for få stillinger (${n})`);
});

// ---------------------------------------------------------------------------
// 5. Gjenskapte stillinger må bære rekka
// ---------------------------------------------------------------------------

test("gjenskaping: visningTilState og medVerden bærer rekka — og en tømt rekke blir TATT", () => {
  let n = 0;
  let tomTatt = 0;
  kamper([4_410_004], 3, (s) => {
    if (s.fase !== "SPILL" || s.iTur === null) return;
    const sete = s.iTur;
    const vis = spillerVisning(s, sete);
    if (vis.budrunde.rekke.length === 0) return;
    const fasit = auksjonsrekkeTrekk(vis);

    // (a) visningTilState → ny GameState → ny visning. Rekka skal overleve rundturen.
    const gjenskapt = visningTilState(vis, s.regler, s.giving);
    assert.deepEqual(
      [...auksjonsrekkeTrekk(spillerVisning(gjenskapt, sete))],
      [...fasit],
      "visningTilState mistet auksjonsrekka",
    );

    // (b) medVerden: en trukket verden skal ikke røre auksjonen (den er offentlig).
    const hender = s.hender.map((h) => h.map((k) => kortTilInt(k)));
    const verden = medVerden(s, hender, sete);
    assert.deepEqual([...auksjonsrekkeTrekk(spillerVisning(verden, sete))], [...fasit], "medVerden mistet auksjonsrekka");

    // FELLA: en gjenskaping som TØMMER rekka må gi en annen blokk. Uten dette kunne (a) og (b)
    // vært grønne fordi blokken var tom i begge ender.
    const tømt: GameState = { ...s, budrunde: { ...s.budrunde, rekke: [] } };
    if (JSON.stringify([...auksjonsrekkeTrekk(spillerVisning(tømt, sete))]) !== JSON.stringify([...fasit])) tomTatt++;
    n++;
  });
  assert.ok(n >= 20, `for få stillinger (${n})`);
  assert.equal(tomTatt, n, "en gjenskaping med TØMT rekke ga samme blokk — prøven kan ikke feile");
});

// ---------------------------------------------------------------------------
// 6. Nullpunktet
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

test("nullpunktet: et 996-trohode utvidet til 1040 gir NØYAKTIG samme tro; en koblet kolonne endrer den", () => {
  const kilde = fil("tro-7.bin");
  if (!existsSync(kilde)) return; // uten nett fra løkka er det ingenting å utvide
  const rå = nettFraBytes(readFileSync(kilde))[0]!;
  if (rå.lag[0]!.inn !== MLB_TRO_INN_HS2) return;
  const gammel = new MlbTronett(rå);
  const ny = new MlbTronett(utvidTronett(rå, MLB_TRO_INN_HS2A));
  assert.equal(ny.innBredde, 1040);

  const stillinger: { v: SpillerVisning; s: GameState }[] = [];
  kamper([4_410_005], 3, (s) => {
    if (s.fase === "SPILL" && s.iTur !== null && s.bord.length === 1) stillinger.push({ s, v: spillerVisning(s, s.iTur) });
  });
  assert.ok(stillinger.length >= 6, `for få stillinger (${stillinger.length})`);
  const bok = new Hukommelse().vektor(0, 4);
  let ikkeTom = 0;
  for (const { s, v } of stillinger) {
    const t = ny.trekkFor(v, s.giving.antallStikk, 100, bok);
    assert.equal(t.length, 1040);
    if (t.subarray(MLB_TRO_INN_HS2).some((x) => x !== 0)) ikkeTom++;
    assert.deepEqual(ny.fordeling(t), gammel.fordeling(gammel.trekkFor(v, s.giving.antallStikk, 100, bok)));
  }
  assert.ok(ikkeTom > 0, "auksjonsblokken var tom i hver stilling — nullpunktet prøver ingenting");

  // FELLA: én koblet kolonne. LENGDE er aldri null etter en spilt auksjon.
  const plantet = utvidTronett(rå, MLB_TRO_INN_HS2A);
  const l = plantet.lag[0]!;
  for (let r = 0; r < l.ut; r++) l.vekter[r * l.inn + MLB_TRO_INN_HS2 + AU.FELLES + AU.LENGDE] = 3;
  const felle = new MlbTronett(plantet);
  let endret = 0;
  for (const { s, v } of stillinger) {
    const pf = felle.fordeling(felle.trekkFor(v, s.giving.antallStikk, 100, bok));
    const pg = gammel.fordeling(gammel.trekkFor(v, s.giving.antallStikk, 100, bok));
    if (JSON.stringify(pf) !== JSON.stringify(pg)) endret++;
  }
  assert.ok(endret > 0, "en koblet kolonne i auksjonsblokken endret ingen tro — blokken når ikke fram");
});

test("nullpunktet: BudQ 323 med nuller bakerst gir bit-identiske Q og bud; en koblet auksjonskolonne endrer Q", () => {
  const n323 = tilfeldigNett(BUDQ_INN_HS2, BUDQ_UT, 4_420_001);
  const a = new BudQagent(lagIndre("nevro"), n323);
  const b = new BudQagent(lagIndre("nevro"), nullerBakerst(n323, BUDQ_INN_HS3));
  const plantet = nullerBakerst(n323, BUDQ_INN_HS3);
  const l0 = plantet.lag[0]!;
  for (let r = 0; r < l0.ut; r++) l0.vekter[r * l0.inn + BUDQ_INN_HS2 + AU.FELLES + AU.LENGDE] = 5;
  const c = new BudQagent(lagIndre("nevro"), plantet);
  let n = 0;
  let endret = 0;
  kamper([4_420_002, 4_420_003], 4, (s) => {
    a.observer(s);
    b.observer(s);
    c.observer(s);
    if (s.fase !== "BUDRUNDE" || s.iTur === null) return;
    const sete = s.iTur;
    const xb = b.trekk(s, sete);
    assert.equal(xb.length, BUDQ_INN_HS3);
    assert.deepEqual([...xb.subarray(0, BUDQ_INN_HS2)], [...a.trekk(s, sete)], "de 323 første må stå urørt i 367");
    assert.deepEqual([...b.q(s, sete)], [...a.q(s, sete)]);
    assert.deepEqual(b.velgHandling(s), a.velgHandling(s));
    if (JSON.stringify([...c.q(s, sete)]) !== JSON.stringify([...a.q(s, sete)])) endret++;
    n++;
  });
  assert.ok(n >= 20, `for få budbeslutninger (${n})`);
  assert.ok(endret > 0, "en koblet auksjonskolonne endret ingen Q — blokken når ikke fram");
});

test("budqTrekk: auksjonsrekka krever sanser 2 (den ligger bak stillingsblokken)", () => {
  const s = auksjon(4_420_004, [5]);
  assert.throws(() => budqTrekk(s, s.iTur!, new Hukommelse(), false, true), /krever sanser 2/);
  const x = budqTrekk(s, s.iTur!, new Hukommelse(), true, true);
  assert.equal(x.length, BUDQ_INN_HS3);
  assert.deepEqual([...x.subarray(0, BUDQ_INN_H)], [...budqTrekk(s, s.iTur!, new Hukommelse(), false, false).subarray(0, BUDQ_INN_H)]);
});

// ---------------------------------------------------------------------------
// 7. Generatorene: standardutdata byte-identiske
// ---------------------------------------------------------------------------

const sha1 = (sti: string): string => createHash("sha1").update(readFileSync(sti)).digest("hex");

function kjør(args: readonly string[]): { status: number | null; tekst: string } {
  const r = spawnSync(process.execPath, args, { cwd: ROT, encoding: "utf8", timeout: 600_000 });
  return { status: r.status, tekst: `${r.stdout}\n${r.stderr}` };
}

test("budq-data: uten --auksjon er utdataene byte-identiske, og med flagget er de det ikke", { timeout: 900_000 }, () => {
  const felles = ["examples/budq-data.ts", "--kamper", "2", "--verdener", "2", "--sjanse", "1", "--maksrunder", "3", "--hukommelse", "--sanser2"];
  const uten = `${ROT}/${MAPPE}/budq-uten.jsonl`;
  const igjen = `${ROT}/${MAPPE}/budq-igjen.jsonl`;
  const med = `${ROT}/${MAPPE}/budq-med.jsonl`;
  for (const [ut, ekstra] of [[uten, []], [igjen, []], [med, ["--auksjon"]]] as const) {
    const r = kjør([...felles, ...ekstra, "--ut", ut]);
    assert.equal(r.status, 0, r.tekst);
  }
  assert.equal(sha1(igjen), sha1(uten), "budq-data er ikke deterministisk — sha1-prøven måler ingenting");
  assert.notEqual(sha1(med), sha1(uten), "--auksjon endret ingenting — flagget er dødt");
  // FELLA: sha1-sammenlikningen må KUNNE slå ut. Et annet frø gir et annet korpus.
  // IKKE et nytt `--kamper`: `arg()` i budq-data tar FØRSTE forekomst, og `felles` har det alt —
  // et flagg nummer to er dødt, og nettopp derfor var denne fella blind første gang.
  const annen = `${ROT}/${MAPPE}/budq-annen.jsonl`;
  assert.equal(kjør([...felles, "--froe", "15000777", "--ut", annen]).status, 0);
  assert.notEqual(sha1(annen), sha1(uten), "sha1 skiller ikke to ulike korpus — prøven er blind");
});

/**
 * MLBT versjon 1 (`verktoy/mlb-tro-tren.py`, `les_mlbt`): "MLBT" + i32 versjon + i32 dim, så
 * pakkede poster à `dim` f32 trekk + 52 i8 fasit + i32 frø + i16 stikk + i16 sete.
 */
const HALE = 52 + 4 + 2 + 2;
function lesMlbt(sti: string): { dim: number; post: number; antall: number; data: Buffer } {
  const b = readFileSync(sti);
  assert.equal(b.subarray(0, 4).toString("latin1"), "MLBT", `${sti} er ikke en MLBT-fil`);
  assert.equal(b.readInt32LE(4), 1, "MLBT-versjonen er ikke 1");
  const dim = b.readInt32LE(8);
  const post = dim * 4 + HALE;
  const data = b.subarray(12);
  assert.equal(data.length % post, 0, "fila er ikke et helt antall poster");
  return { dim, post, antall: data.length / post, data };
}

/**
 * DEN DYRESTE FEILEN I HELE DENNE JOBBEN, og den eneste prøven som kunne tatt den.
 *
 * `--auksjon` skal legge 44 trekk BAKERST og ikke røre noe annet. Enhetsprøven over
 * («de 996 første må stå urørt i 1040») går på ÉN visning og var grønn hele tiden — men
 * generatoren valgte hukommelsen på bredden (`medBok`, `mlb-trodata.ts`), og 1040 sto ikke i
 * lista. Et 1040-korpus fikk da NULLER i hukommelsesblokken: 144 av de 996 «urørte» trekkene
 * var borte, ingenting feilet, og målingen ville sammenliknet auksjonsrekka mot en tapt bok.
 * Første avvik lå i post 27 — ikke i post 0, så selv en øyekontroll av starten hadde bestått.
 */
test("mlb-trodata: et 1040-korpus er BYTE-IDENTISK med et 996-korpus i de 996 første trekkene", { timeout: 900_000 }, () => {
  const felles = ["examples/mlb-trodata.ts", "--kamp", "--kamper", "3", "--maksrunder", "5", "--hukommelse", "--signal", "--sanser2"];
  const u996 = `${ROT}/${MAPPE}/tro996.bin`;
  const u1040 = `${ROT}/${MAPPE}/tro1040.bin`;
  const uAnnen = `${ROT}/${MAPPE}/tro1040-annen.bin`;
  assert.equal(kjør([...felles, "--ut", u996]).status, 0);
  assert.equal(kjør([...felles, "--auksjon", "--ut", u1040]).status, 0);
  // FELLA: et korpus fra ANDRE kamper må IKKE bestå den samme sammenlikningen.
  assert.equal(kjør([...felles, "--auksjon", "--fra", "1", "--ut", uAnnen]).status, 0);

  const a = lesMlbt(u996);
  const b = lesMlbt(u1040);
  assert.equal(a.dim, MLB_TRO_INN_HS2);
  assert.equal(b.dim, MLB_TRO_INN_HS2A);
  assert.equal(a.antall, b.antall, "ulikt antall rader — da er det ikke de samme stillingene");
  assert.ok(a.antall >= 50, `for få rader (${a.antall})`);

  const lik = (x: typeof a, y: typeof b): number => {
    let avvik = 0;
    for (let i = 0; i < Math.min(x.antall, y.antall); i++) {
      const px = x.data.subarray(i * x.post, (i + 1) * x.post);
      const py = y.data.subarray(i * y.post, (i + 1) * y.post);
      if (!px.subarray(0, x.dim * 4).equals(py.subarray(0, x.dim * 4))) avvik++;
      else if (!px.subarray(x.dim * 4).equals(py.subarray(y.dim * 4))) avvik++;
    }
    return avvik;
  };
  assert.equal(lik(a, b), 0, "--auksjon endret noe i de 996 første trekkene eller i fasiten");

  // Og den nye blokken må faktisk ha innhold, ellers beviser likheten ingenting.
  let ikkeTom = 0;
  for (let i = 0; i < b.antall; i++) {
    const ny = b.data.subarray(i * b.post + a.dim * 4, (i + 1) * b.post - HALE);
    if (ny.some((x) => x !== 0)) ikkeTom++;
  }
  assert.ok(ikkeTom > b.antall / 2, `auksjonsblokken er tom i ${b.antall - ikkeTom} av ${b.antall} rader`);

  const annen = lesMlbt(uAnnen);
  assert.ok(lik(a, annen) > 0, "prøven ser ikke forskjell på to ULIKE korpus — den kan ikke feile");
});
