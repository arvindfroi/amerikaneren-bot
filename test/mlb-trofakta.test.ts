/**
 * «VET» MOT «TROR» (K8, 11. sep) — `src/mlb/trofakta.ts`.
 *
 * Masken gjør troen skarpere BARE hvis faktaene er sanne. En regel som tar feil — et
 * klasseindeks forskjøvet ett sete, en renons som ikke er det — fjerner den riktige
 * plasseringen av og til, og da blir K8-tapet for det kortet enormt, eller bare litt verre
 * uten at noen ser hvorfor. Prøvene går etter nettopp det:
 *
 *   SANNHET   på ekte stillinger (Adams i alle seter, alle fire seter som observatør)
 *             overlever den SANNE klassen alltid, og hver regel har slått til minst én gang —
 *             ellers sier den grønne prøven ingenting om regelen. FELLE: klassene forskjøvet
 *             ett sete skal tas.
 *   REGLENE   konstruerte visninger for utspillsplikten og makkerplikten (som den gamle
 *             trekkeren ikke har), tom hånd og talongen, med motstykkene der regelen IKKE gjelder.
 *   K2        bytt de skjulte hendene med forenlige verdener: faktaene er identiske. FELLE: en
 *             maske som leser `state.hender` skal tas.
 *   TAPET     med `mlb-tro-signal.bin` (776): maskert tap ≤ umaskert per kort, lavere i snitt,
 *             null tilbakefall, fordelingen urørt. FELLE: den forskjøvne masken gjør tapet verre.
 *   SØKET     `sok.ts` med `fakta` legger aldri et kort på en umulig plass; uten valget er
 *             trekkingen som før, og DEN bryter faktaene (ellers beviser prøven ingenting).
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { spillerVisning, type KortPåBord, type SpillerVisning } from "../src/motor.ts";
import { lagIndre, ADAMS_MAALT } from "../src/moe2/agentspek.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { FARGER, lagRng, type Farge, type Kort } from "../src/kort.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { troFasit } from "../src/mlb/fasit.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import { MLB_TRO_INN_S } from "../src/mlb/trotrekk.ts";
import { maskerFordeling, TALONGKLASSE, trofakta, type Trofakta } from "../src/mlb/trofakta.ts";
import { trekkVerdener as trekkSøkeverdener } from "../src/mlb/sok.ts";

const ROT = fileURLToPath(new URL("..", import.meta.url));

/** Relativt sete, samme koding som trohodet og `troFasit`. */
const rel = (sete: number, p: number): number => (p - sete + 4) % 4;

interface Stilling {
  readonly s: GameState;
  readonly sete: number;
}

/** Ekte stillinger: Adams i alle seter, HVER spilletilstand, sett fra ALLE fire seter. */
function stillinger(giver: number, frøBase: number): Stilling[] {
  const ut: Stilling[] = [];
  for (let g = 0; g < giver; g++) {
    const drivere = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
    let s: GameState = opprettSpill({ antallSpillere: 4 }, frøBase + g * 4231);
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 200) {
      if (s.fase === "SPILL") for (let sete = 0; sete < 4; sete++) ut.push({ s, sete });
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      s = utfør(s, drivere[iTur]!.velgHandling(s)).state;
    }
  }
  return ut;
}

type Faktakilde = (v: SpillerVisning) => Trofakta;
const ærlig: Faktakilde = (v) => trofakta(v);

/** FELLA: de ærlige faktaene med seteklassene forskjøvet ett sete — `r` i stedet for `r − 1`. */
const forskjøvet: Faktakilde = (v) => {
  const f = trofakta(v);
  const umulig = new Uint8Array(f.umulig.length);
  for (let i = 0; i < 52; i++) {
    for (let c = 0; c < 3; c++) umulig[i * 4 + ((c + 1) % 3)] = f.umulig[i * 4 + c]!;
    umulig[i * 4 + 3] = f.umulig[i * 4 + 3]!;
  }
  return { ...f, umulig };
};

/** Brudd på sannheten: en usett-markering som ikke er fasitens, eller en maske over den sanne klassen. */
function sannhetsbrudd(pos: readonly Stilling[], kilde: Faktakilde): string[] {
  const brudd: string[] = [];
  for (const { s, sete } of pos) {
    const fa = kilde(spillerVisning(s, sete));
    const fasit = troFasit(s, sete);
    for (let i = 0; i < 52 && brudd.length < 20; i++) {
      const klasse = fasit[i]!;
      const hvor = `frø ${s.frø} stikk ${s.stikkSpilt} sete ${sete} kort ${i}`;
      if ((klasse > 0 ? 1 : 0) !== fa.usett[i]) brudd.push(`${hvor}: usett=${fa.usett[i]}, fasitklasse ${klasse}`);
      if (klasse === 0) {
        if (fa.umulig.subarray(i * 4, i * 4 + 4).some((x) => x !== 0)) brudd.push(`${hvor}: et SETT kort har en maske`);
        continue;
      }
      const c = klasse === 4 ? TALONGKLASSE : klasse - 1;
      if (fa.umulig[i * 4 + c] === 1) brudd.push(`${hvor}: ligger i klasse ${c}, men masken sier umulig`);
    }
  }
  return brudd;
}

/** Hvor mange stillinger hver regel slo til i. */
function dekning(pos: readonly Stilling[]): Record<string, number> {
  const d = { renons: 0, tomHånd: 0, talong: 0, kaltBudvinner: 0, makkerplikt: 0 };
  for (const { s, sete } of pos) {
    const v = spillerVisning(s, sete);
    const fa = trofakta(v);
    if (fa.renons.some((r) => r.some(Boolean))) d.renons++;
    const kalt = v.etterlyst === null ? -1 : kortIndeks(v.etterlyst);
    let tom = false;
    let talong = false;
    for (let i = 0; i < 52; i++) {
      if (fa.usett[i] === 0) continue;
      for (let r = 1; r <= 3; r++) if (v.antallKort[(sete + r) % 4] === 0 && fa.umulig[i * 4 + r - 1] === 1) tom = true;
      if (i !== kalt && fa.umulig[i * 4 + 3] === 1) talong = true;
    }
    if (tom) d.tomHånd++;
    if (talong) d.talong++;
    if (fa.ikkeKalt.length > 0) d.kaltBudvinner++;
    if (fa.ikkeKalt.some((p) => p !== v.budvinner)) d.makkerplikt++;
  }
  return d;
}

test("sannhet: på ekte stillinger overlever den sanne plasseringen ALLTID masken — og hver regel slo til", () => {
  const pos = stillinger(6, 6_100_000);
  assert.ok(pos.length > 500, `bare ${pos.length} stillinger`);
  assert.deepEqual(sannhetsbrudd(pos, ærlig), [], "en SANN plassering ble merket umulig");
  const d = dekning(pos);
  for (const [regel, n] of Object.entries(d)) {
    assert.ok(n > 0, `regelen «${regel}» slo aldri til — den grønne prøven sier ingenting om den (${JSON.stringify(d)})`);
  }
});

test("sannhet: FELLA — klassene forskjøvet ett sete fjerner sanne plasseringer og blir tatt", () => {
  assert.ok(
    sannhetsbrudd(stillinger(2, 6_100_000), forskjøvet).length > 0,
    "en maske med feil seteklasse ble ikke tatt — da beviser sannhetsprøven over ingenting",
  );
});

// ---------------------------------------------------------------------------
// Reglene, én og én, på konstruerte visninger
// ---------------------------------------------------------------------------

const k = (farge: Farge, verdi: number): Kort => ({ farge, verdi: verdi as Kort["verdi"] });
const lagt = (spiller: number, kort: Kort): KortPåBord => ({ spiller, kort });
const H = FARGER.indexOf("H");
const S = FARGER.indexOf("S");
const R = FARGER.indexOf("R");

/** Observatør sete 0, budvinner sete 1, hjerter trumf, stikk 1 — og det testen overstyrer. */
function konstruert(over: Partial<SpillerVisning>): SpillerVisning {
  const grunn = spillerVisning(opprettSpill({ antallSpillere: 4 }, 1), 0);
  return {
    ...grunn,
    fase: "SPILL",
    iTur: 0,
    dinHånd: [],
    antallKort: [12, 12, 12, 12],
    budvinner: 1,
    trumf: "H",
    etterlyst: null,
    makker: null,
    bord: [],
    historikk: [],
    stikkSpilt: 0,
    dittVrak: [],
    lovligeKort: [],
    ...over,
  };
}

test("regel: UTSPILLSPLIKTEN — budvinneren som åpner stikk 1 uten trumf er renons i trumf, ellers ikke", () => {
  const spar = trofakta(konstruert({ bord: [lagt(1, k("S", 5))], antallKort: [12, 11, 12, 12] }));
  assert.equal(spar.renons[1]![H], true);
  assert.equal(spar.umulig[kortIndeks(k("H", 9)) * 4 + 0], 1, "sete 1 er relativt sete 1 (klasse 0) for sete 0");
  assert.equal(spar.umulig[kortIndeks(k("S", 9)) * 4 + 0], 0);

  const viaHistorikk = trofakta(
    konstruert({
      stikkSpilt: 1,
      historikk: [{ kort: [lagt(1, k("S", 5)), lagt(2, k("S", 6)), lagt(3, k("S", 7)), lagt(0, k("S", 8))], vinner: 3 }],
      antallKort: [11, 11, 11, 11],
    }),
  );
  assert.equal(viaHistorikk.renons[1]![H], true, "plikten gjelder stikk 1 også når det ligger i historikken");

  const trumf = trofakta(konstruert({ bord: [lagt(1, k("H", 5))], antallKort: [12, 11, 12, 12] }));
  assert.equal(trumf.renons[1]![H], false);
  // Samme åpning i stikk 2 er ingen plikt, og sier ingenting.
  const stikk2 = trofakta(
    konstruert({
      stikkSpilt: 1,
      historikk: [{ kort: [lagt(1, k("H", 5)), lagt(2, k("H", 6)), lagt(3, k("H", 7)), lagt(0, k("H", 8))], vinner: 1 }],
      bord: [lagt(1, k("S", 5))],
      antallKort: [11, 10, 11, 11],
    }),
  );
  assert.equal(stikk2.renons[1]![H], false);
});

test("regel: DET KALTE KORTET — aldri hos budvinneren, aldri i talongen, og makkerplikten i stikk 1", () => {
  const kalt = k("H", 13);
  const ki = kortIndeks(kalt);
  const rad = (f: Trofakta): number[] => [...f.umulig.subarray(ki * 4, ki * 4 + 4)];

  // Utspill i kortets farge: sete 2 la en annen hjerter, altså har det ikke kortet.
  const a = trofakta(konstruert({ etterlyst: kalt, bord: [lagt(1, k("H", 2)), lagt(2, k("H", 3))], antallKort: [12, 11, 11, 12] }));
  assert.deepEqual(a.ikkeKalt, [1, 2]);
  assert.deepEqual(rad(a), [1, 1, 0, 1]);

  // Utspill i spar: sete 2 fulgte (plikten gjaldt ikke), sete 3 fulgte ikke (hele hånden var lovlig).
  const b = trofakta(
    konstruert({ etterlyst: kalt, bord: [lagt(1, k("S", 2)), lagt(2, k("S", 3)), lagt(3, k("R", 4))], antallKort: [12, 11, 11, 11] }),
  );
  assert.deepEqual(b.ikkeKalt, [1, 3]);
  assert.deepEqual(rad(b), [1, 0, 1, 1]);
  assert.equal(b.renons[3]![S], true);

  // Stikk 2: et sete som ikke følger NÅ, er ikke under makkerplikt lenger.
  const c = trofakta(
    konstruert({
      etterlyst: kalt,
      stikkSpilt: 1,
      historikk: [{ kort: [lagt(1, k("S", 2)), lagt(2, k("S", 3)), lagt(3, k("S", 4)), lagt(0, k("S", 5))], vinner: 0 }],
      bord: [lagt(0, k("R", 2)), lagt(1, k("R", 3)), lagt(2, k("S", 6))],
      antallKort: [10, 10, 10, 11],
    }),
  );
  assert.deepEqual(c.ikkeKalt, [1]);
  assert.equal(c.renons[2]![R], true);
  assert.deepEqual(rad(c), [1, 0, 0, 1]);

  // Kortet er spilt: sett, ingen gjetning, ingen maske.
  const d = trofakta(konstruert({ etterlyst: kalt, bord: [lagt(1, k("H", 2)), lagt(2, kalt)], antallKort: [12, 11, 11, 12] }));
  assert.deepEqual(d.ikkeKalt, []);
  assert.equal(d.usett[ki], 0);
  assert.deepEqual(rad(d), [0, 0, 0, 0]);
});

test("regel: TOM HÅND og TALONGEN — ingen kort igjen, ingen døde plasser", () => {
  const tom = trofakta(konstruert({ antallKort: [12, 0, 12, 12] }));
  for (let i = 0; i < 52; i++) assert.equal(tom.umulig[i * 4 + 0], 1, `kort ${i} hos et sete uten kort`);

  // Budvinneren (sete 0) ser sitt eget vrak: usett = 52 − 12 − 4 = 36 = Σ de andres kort.
  const hånd = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((v) => k("S", v));
  const bv = trofakta(konstruert({ budvinner: 0, dinHånd: hånd, dittVrak: [k("S", 14), k("H", 2), k("H", 3), k("H", 4)] }));
  let usett = 0;
  for (let i = 0; i < 52; i++) {
    if (bv.usett[i] === 0) continue;
    usett++;
    assert.equal(bv.umulig[i * 4 + TALONGKLASSE], 1, `kort ${i}: talongen er umulig for den som vraket`);
  }
  assert.equal(usett, 36);

  // En annen observatør: fire døde plasser, og talongen er mulig for hvert usett kort.
  const annen = trofakta(konstruert({ budvinner: 1, dinHånd: hånd }));
  for (let i = 0; i < 52; i++) if (annen.usett[i] === 1) assert.equal(annen.umulig[i * 4 + TALONGKLASSE], 0);
});

// ---------------------------------------------------------------------------
// K2
// ---------------------------------------------------------------------------

type Bygger = (s: GameState, sete: number) => string;
const tekst = (f: Trofakta, umulig: Uint8Array = f.umulig): string =>
  JSON.stringify([[...umulig], [...f.usett], f.renons, f.ikkeKalt]);
const ærligeFakta: Bygger = (s, sete) => tekst(trofakta(spillerVisning(s, sete)));

/** FELLA: de ærlige faktaene pluss «bare setet som FAKTISK har kortet er mulig» — klarsyn. */
const klarsyn: Bygger = (s, sete) => {
  const f = trofakta(spillerVisning(s, sete));
  const umulig = f.umulig.slice();
  for (let p = 0; p < 4; p++) {
    if (p === sete) continue;
    const har = new Set((s.hender[p] ?? []).map(kortIndeks));
    for (let i = 0; i < 52; i++) if (f.usett[i] === 1 && !har.has(i)) umulig[i * 4 + rel(sete, p) - 1] = 1;
  }
  return tekst(f, umulig);
};

function k2Prøve(bygg: Bygger, giver: number, fraStikk: number, maksPerGiv: number) {
  const avvik: string[] = [];
  let stillingerProvd = 0;
  let sammenlikninger = 0;
  let ikkeTrivielle = 0;
  for (let g = 0; g < giver; g++) {
    const frø = 5_600_000 + g * 4231;
    const drivere = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
    let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
    let vakt = 0;
    let iGiv = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 200) {
      if (s.fase === "SPILL" && s.iTur !== null && iGiv < maksPerGiv && s.stikkSpilt >= fraStikk) {
        // Observatøren er setet ETTER den i tur, så også seter som ikke skal velge prøves.
        const sete = (s.iTur + 1 + g) % 4;
        const verdener = trekkVerdener(s, sete, 3, lagRng(929_000 + g * 37 + s.stikkSpilt), undefined, undefined, 4);
        if (verdener.length >= 2) {
          iGiv++;
          stillingerProvd++;
          const fa = trofakta(spillerVisning(s, sete));
          if (fa.renons.some((r) => r.some(Boolean)) || fa.ikkeKalt.length > 0) ikkeTrivielle++;
          const fasit = bygg(s, sete);
          for (const hender of verdener) {
            const s2 = medVerden(s, hender, sete);
            assert.deepEqual(s2.hender[sete], s.hender[sete], "medVerden endret observatørens egen hånd");
            sammenlikninger++;
            if (bygg(s2, sete) !== fasit) {
              avvik.push(`frø ${frø} stikk ${s.stikkSpilt} sete ${sete}: faktaene endret seg da bare skjulte kort ble byttet`);
            }
          }
        }
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      s = utfør(s, drivere[iTur]!.velgHandling(s)).state;
    }
  }
  return { stillinger: stillingerProvd, sammenlikninger, ikkeTrivielle, avvik };
}

test("K2: faktaene er identiske når BARE de skjulte hendene byttes — og klarsyn blir tatt", () => {
  const tidlig = k2Prøve(ærligeFakta, 5, 0, 3);
  const sent = k2Prøve(ærligeFakta, 5, 6, 3);
  assert.ok(tidlig.stillinger + sent.stillinger >= 12, "for få stillinger — beviser ingenting");
  assert.ok(tidlig.sammenlikninger + sent.sammenlikninger >= 24);
  assert.ok(tidlig.ikkeTrivielle + sent.ikkeTrivielle >= 4, "faktaene var tomme nesten overalt — prøven prøver ingenting");
  assert.deepEqual([...tidlig.avvik, ...sent.avvik], [], "JUKS: faktaene avhenger av skjulte kort");
  assert.ok(
    k2Prøve(klarsyn, 3, 4, 3).avvik.length > 0,
    "en maske som leser state.hender ble ikke tatt — K2-prøven over måler ingenting",
  );
});

// ---------------------------------------------------------------------------
// Tapet med et ekte trohode
// ---------------------------------------------------------------------------

/** Tap per kort i K8-formen: kortene på de andre hendene, renormalisert over de tre setene. */
function tap3(f: readonly (readonly number[])[], s: GameState, sete: number): number[] {
  const ut: number[] = [];
  for (let p = 0; p < 4; p++) {
    if (p === sete) continue;
    const r = rel(sete, p);
    for (const kort of s.hender[p] ?? []) {
      const rad = f[kortIndeks(kort)]!;
      const sum = rad[0]! + rad[1]! + rad[2]!;
      ut.push(-Math.log(Math.max(1e-12, sum > 1e-12 ? rad[r - 1]! / sum : 1 / 3)));
    }
  }
  return ut;
}

/** Tap per usett kort over alle fire klasser, mot fasiten (talongen med). */
function tap4(f: readonly (readonly number[])[], s: GameState, sete: number): number[] {
  const fasit = troFasit(s, sete);
  const ut: number[] = [];
  for (let i = 0; i < 52; i++) {
    const klasse = fasit[i]!;
    if (klasse === 0) continue;
    ut.push(-Math.log(Math.max(1e-300, f[i]![klasse === 4 ? TALONGKLASSE : klasse - 1]!)));
  }
  return ut;
}

function tapProve(nett: MlbTronett, pos: readonly Stilling[], kilde: Faktakilde) {
  let umaskert3 = 0;
  let maskert3 = 0;
  let umaskert4 = 0;
  let maskert4 = 0;
  let verre = 0;
  let tilbakefall = 0;
  for (const { s, sete } of pos) {
    const v = spillerVisning(s, sete);
    const trekk = nett.trekkFor(v, s.giving.antallStikk, s.regler.målPoeng, null);
    const f = nett.fordeling(trekk);
    const før = JSON.stringify(f);
    const m = maskerFordeling(f, v, kilde(v));
    assert.equal(JSON.stringify(f), før, "maskerFordeling endret fordelingen på plass");
    tilbakefall += m.tilbakefall;
    for (const [u, mm, bytt] of [
      [tap3(f, s, sete), tap3(m.fordeling, s, sete), 3],
      [tap4(f, s, sete), tap4(m.fordeling, s, sete), 4],
    ] as const) {
      for (let j = 0; j < u.length; j++) {
        if (mm[j]! > u[j]! + 1e-9) verre++;
        if (bytt === 3) {
          umaskert3 += u[j]!;
          maskert3 += mm[j]!;
        } else {
          umaskert4 += u[j]!;
          maskert4 += mm[j]!;
        }
      }
    }
  }
  return { umaskert3, maskert3, umaskert4, maskert4, verre, tilbakefall };
}

test("tapet: med mlb-tro-signal.bin (776) er maskert tap ≤ umaskert per kort og lavere i snitt — og fella gjør det verre", () => {
  const nett = MlbTronett.fraBytes(new Uint8Array(readFileSync(`${ROT}/e1-modell/mlb-tro-signal.bin`)));
  assert.equal(nett.innBredde, MLB_TRO_INN_S);
  const pos = stillinger(3, 6_300_000).filter((x, i) => i % 9 === 0 && x.s.stikkSpilt >= 1);
  assert.ok(pos.length >= 12, `bare ${pos.length} stillinger`);

  // `fordelingMedFakta` er nøyaktig `maskerFordeling(fordeling)`, og `fordeling` er deterministisk.
  const { s, sete } = pos[pos.length - 1]!;
  const v = spillerVisning(s, sete);
  const trekk = nett.trekkFor(v, s.giving.antallStikk, s.regler.målPoeng, null);
  assert.deepEqual(nett.fordelingMedFakta(trekk, v), maskerFordeling(nett.fordeling(trekk), v));
  assert.deepEqual(nett.fordeling(trekk), nett.fordeling(trekk));

  const r = tapProve(nett, pos, ærlig);
  const melding = JSON.stringify(r);
  assert.equal(r.tilbakefall, 0, `tilbakefall med sanne fakta: ${melding}`);
  assert.equal(r.verre, 0, `masken gjorde et kort verre: ${melding}`);
  assert.ok(r.maskert3 < r.umaskert3, `K8-tapet ble ikke lavere: ${melding}`);
  assert.ok(r.maskert4 < r.umaskert4, `firklassetapet ble ikke lavere: ${melding}`);

  const felle = tapProve(nett, pos, forskjøvet);
  assert.ok(
    felle.verre > 0 || felle.tilbakefall > 0,
    `en maske som fjerner sanne klasser gjorde ikke tapet verre — da beviser «≤» over ingenting (${JSON.stringify(felle)})`,
  );
});

// ---------------------------------------------------------------------------
// Søkets trekker
// ---------------------------------------------------------------------------

test("søket: med fakta legges aldri et kort på en umulig plass; uten valget er trekkingen uendret og bryter dem", () => {
  const flat = Array.from({ length: 52 }, () => [0.25, 0.25, 0.25, 0.25]);
  const pos = stillinger(2, 7_700_000).filter((x, i) => x.s.stikkSpilt >= 4 && i % 5 === 0);
  let bruddUten = 0;
  let bruddMed = 0;
  let verdenerMed = 0;
  let ønsket = 0;
  const brudd = (f: Trofakta, w: { hender: readonly (readonly Kort[])[]; talong: readonly Kort[] }): number => {
    let n = 0;
    for (let r = 1; r <= 3; r++) for (const kort of w.hender[r] ?? []) n += f.umulig[kortIndeks(kort) * 4 + r - 1]!;
    for (const kort of w.talong) n += f.umulig[kortIndeks(kort) * 4 + TALONGKLASSE]!;
    return n;
  };
  for (const [i, { s, sete }] of pos.entries()) {
    const v = spillerVisning(s, sete);
    const f = trofakta(v);
    const uten = trekkSøkeverdener(v, flat, 4, lagRng(99 + i));
    assert.deepEqual(trekkSøkeverdener(v, flat, 4, lagRng(99 + i), {}), uten, "et tomt valg endret trekkingen");
    assert.deepEqual(trekkSøkeverdener(v, flat, 4, lagRng(99 + i), { fakta: false }), uten, "fakta: false endret trekkingen");
    for (const w of uten) bruddUten += brudd(f, w);
    const med = trekkSøkeverdener(v, flat, 4, lagRng(99 + i), { fakta: true });
    ønsket += 4;
    verdenerMed += med.length;
    for (const w of med) {
      bruddMed += brudd(f, w);
      for (let r = 1; r <= 3; r++) assert.equal(w.hender[r]!.length, v.antallKort[(sete + r) % 4], "kapasiteten brutt");
    }
  }
  assert.equal(bruddMed, 0, "en verden trukket MED fakta la et kort der setet vet det ikke kan ligge");
  assert.ok(bruddUten > 0, "trekkingen uten fakta brøt dem aldri — da viser prøven ikke at valget gjør noe");
  assert.ok(verdenerMed >= ønsket * 0.9, `med fakta ble bare ${verdenerMed} av ${ønsket} verdener trukket`);
});
