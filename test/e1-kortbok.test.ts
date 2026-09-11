/**
 * KORTNETTET MED MOTSTANDERBOKA OG SANSER 2 (`src/e1/kortbok.ts`, 11. sep): 493 = 273 | bok 144 |
 * stilling 36 | valgt bort 40, bakerst, valgt av bredden.
 *
 * Ingenting her krasjer når det er feil: en blokk som kikker gir like pene vektorer, en bok som aldri
 * ser `RUNDE_SLUTT` gir nuller som ser ut som første runde, og en varmstart som legger kolonnene skjevt
 * spiller like hele kamper. Hver prøve har derfor en felle som viser at sjekken KAN slå ut:
 *
 *   LAYOUTEN    grunnen er bit for bit `e1SpillTrekk(…, 273)`, boka `bok.vektor`, sansene på sin plass.
 *               Appens laster (`e1NettFraBytes`) avviser 493; bare `tillatBok` slipper den inn.
 *   K2          for hver observatør som ikke er budvinner, i hvert kortvalg: bytt de andre hendene,
 *               vraket og talongen (makkeren følger det kalte kortet) → bit-lik 493-vektor.
 *               FELLER: (c) den ekte makkeren før avsløringen, (e) en bok matet STILLINGEN selv.
 *   BOKA        flytter seg bare ved RUNDE_SLUTT: lik i hele runden, null i runde 0, og den endrer seg
 *               mellom runder. FELLE (d): en bok matet midt i runden (ved hvert stikk) fanges.
 *   NULLPUNKTET et 273-nett utvidet med nuller gir identiske logits og valg, også med full bok, gjennom
 *               speken `vakt:abmp:e1:<493>`. FELLE: én koblet bokkolonne endrer valg etter runde 0 og
 *               ingen før — og bare når `observer` når kortlaget gjennom vakten.
 *   VAKTEN      uten `observer` kaster kortlaget i runde 1 i stedet for å spille på en tom bok.
 *   KORT-DATA   `--bredde 493`: samme rader og etiketter som 273, de 273 første bit-like, bok null i
 *               runde 0 og fylt i runde 1. Et 493-nett i speken gir bredden av seg selv.
 *   TRENEREN    (WSL, `KORT_TREN_WSL=1`) `sd-tren.py --vekter kort-3 (273) --epoker 0` på 493-rader
 *               skriver 273-nettet NULLUTVIDET byte for byte, modell = policy totalt og per fase.
 *               FELLE: et 340-nett som start på 493-rader avvises (340 er ikke et prefiks av boka).
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeKort, spillerVisning } from "../src/motor.ts";
import { lagRng, type Kort } from "../src/kort.ts";
import { lagIndre, lesNett } from "../src/moe2/agentspek.ts";
import { Hukommelse, LEDD_NAVN } from "../src/mlb/hukommelse.ts";
import { stillingTrekk } from "../src/mlb/stillingtrekk.ts";
import { valgtBortTrekk, VALGTBORTINNGANG as VB } from "../src/mlb/valgtbort.ts";
import { E1Agent, e1NettFraBytes, LOVLIGE_BREDDER } from "../src/e1/agent.ts";
import { e1SpillTrekk, E1_SPILL_DIM, E1_SPILL_DIM_V9 } from "../src/e1/trekk.ts";
import {
  e1KortBokTrekk,
  E1_KORT_BOK_DIM,
  E1_KORT_LAYOUT,
  KORTBOK_FRA,
  STILLING_FRA,
  VALGT_BORT_FRA,
} from "../src/e1/kortbok.ts";
import { forover, nettFraBytes, type NevroNett } from "../src/nevro/nett.ts";
import { kortIndeks } from "../src/nevro/index.ts";
import { kortEtikett } from "../examples/kort-data.ts";
import type { ParResultat } from "../src/moe2/sdpar.ts";

const ROT = fileURLToPath(new URL("..", import.meta.url));
/** Relativ til ROT, uten kolon (speken deler på kolon), ignorert av git (`/_*`), per prosess. */
const MAPPE = `_test-kortbok-${process.pid}`;
before(() => mkdirSync(`${ROT}/${MAPPE}`, { recursive: true }));
after(() => rmSync(`${ROT}/${MAPPE}`, { recursive: true, force: true }));

const KORT273 = "e1-modell/kort-3.bin";

// ---------------------------------------------------------------------------
// Felles: kamper med NevroHjerne, hver tilstand vist fram — også RUNDE_SLUTT
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

/**
 * ALT OBSERVATØREN IKKE SER, STOKKET (som `test/mlb-sanser2.test.ts`): de andre hendene, talongen og
 * — for en observatør som ikke er budvinner — vraket. Makkeren følger det kalte kortet, som motoren
 * gjør ved VELG, så en blokk som leste den ekte makkeren før avsløringen ser byttet. Verdenen kan bli
 * umulig; blokkene leser bare visningen, så det er en strengere prøve enn en forenlig verden.
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
const ærlig: Bygger = (s, obs, bok) => e1KortBokTrekk(s, obs, bok.vektor(obs, 4));
const harBok = (v: Float32Array): boolean => v.subarray(KORTBOK_FRA, STILLING_FRA).some((x) => x !== 0);

interface K2Utfall {
  avvik: string[];
  sammenlikninger: number;
  flyttet: number;
  vrakFlyttet: number;
  førAvsløring: number;
  medBok: number;
}

/** Hver ikke-budvinner i hvert kortvalg (SPILL), to bytter hver. */
function k2(bygg: Bygger, frøer: readonly number[], maksRunder: number): K2Utfall {
  const u: K2Utfall = { avvik: [], sammenlikninger: 0, flyttet: 0, vrakFlyttet: 0, førAvsløring: 0, medBok: 0 };
  let nr = 0;
  kamper(frøer, maksRunder, (s, bok) => {
    if (s.fase !== "SPILL") return;
    for (let obs = 0; obs < 4; obs++) {
      if (s.budvinner === obs) continue;
      nr++;
      const fasit = bygg(s, obs, bok);
      if (harBok(fasit)) u.medBok++;
      if (s.makker !== null && !s.makkerAvslørt) u.førAvsløring++;
      for (let b = 0; b < 2; b++) {
        const s2 = byttSkjulte(s, obs, lagRng(70_000 + nr * 7 + b));
        u.sammenlikninger++;
        if (s2.hender.some((h, p) => !likKort(h, s.hender[p]!)) || !likKort(s2.talong, s.talong) || !likKort(s2.vrak, s.vrak)) u.flyttet++;
        if (!likKort(s2.vrak, s.vrak)) u.vrakFlyttet++;
        const annen = bygg(s2, obs, bok);
        const i = fasit.findIndex((x, j) => !Object.is(x, annen[j]));
        if (i >= 0) u.avvik.push(`runde ${s.rundeNr} stikk ${s.stikkSpilt} obs ${obs}: trekk ${i} er ${fasit[i]} mot ${annen[i]}`);
      }
    }
  });
  return u;
}

// ---------------------------------------------------------------------------
// 1. Layouten
// ---------------------------------------------------------------------------

test("layouten: 493 = 273 | 144 | 36 | 40, utenfor kjeden, og hver blokk er det den heter", () => {
  assert.equal(E1_KORT_BOK_DIM, 493);
  assert.deepEqual(E1_KORT_LAYOUT.map(([, l]) => l), [273, 144, 36, 40]);
  assert.deepEqual([KORTBOK_FRA, STILLING_FRA, VALGT_BORT_FRA], [273, 417, 453]);
  assert.ok(!(LOVLIGE_BREDDER as readonly number[]).includes(E1_KORT_BOK_DIM) && E1_KORT_BOK_DIM < E1_SPILL_DIM_V9);
  let n = 0;
  let fylt = 0;
  kamper([6_310_001], 3, (s, bok) => {
    if (s.fase !== "SPILL" || s.iTur === null) return;
    const sete = s.iTur;
    const v = e1KortBokTrekk(s, sete, bok.vektor(sete, 4));
    assert.equal(v.length, 493);
    assert.deepEqual([...v.subarray(0, 273)], [...e1SpillTrekk(s, sete, E1_SPILL_DIM)], "grunnen er ikke 273-vektoren");
    assert.deepEqual([...v.subarray(273, 417)], [...Float32Array.from(bok.vektor(sete, 4))]);
    const vis = spillerVisning(s, sete);
    assert.deepEqual([...v.subarray(417, 453)], [...stillingTrekk(vis, s.giving.antallStikk, s.regler.målPoeng)]);
    assert.deepEqual([...v.subarray(453, 493)], [...valgtBortTrekk(vis)]);
    // Uten bok: nullblokk, alt annet likt.
    const uten = e1KortBokTrekk(s, sete, null);
    assert.ok(uten.subarray(273, 417).every((x) => x === 0));
    assert.deepEqual([...uten.subarray(417)], [...v.subarray(417)]);
    if (harBok(v)) fylt++;
    n++;
  });
  assert.ok(n >= 100 && fylt >= 30, `oppsettet: ${n} kortvalg, ${fylt} med bok`);
});

// ---------------------------------------------------------------------------
// 2. K2
// ---------------------------------------------------------------------------

test("K2: bytt skjulte hender, vraket og talongen — hele 493-vektoren bit-lik for hver ikke-budvinner", () => {
  const u = k2(ærlig, [6_320_001, 6_320_002], 4);
  assert.ok(u.sammenlikninger >= 1000, `bare ${u.sammenlikninger} sammenlikninger`);
  assert.ok(u.flyttet >= u.sammenlikninger * 0.9, `byttet flyttet noe i bare ${u.flyttet} av ${u.sammenlikninger}`);
  assert.ok(u.vrakFlyttet >= 200, `vraket ble flyttet i bare ${u.vrakFlyttet}`);
  assert.ok(u.førAvsløring >= 20, `for få stillinger før makkeren er avslørt (${u.førAvsløring})`);
  assert.ok(u.medBok >= 200, `boka var fylt i bare ${u.medBok} stillinger — K2 for boka er ikke prøvd`);
  assert.deepEqual(u.avvik.slice(0, 8), [], `JUKS: 493-vektoren avhenger av skjulte kort (${u.avvik.length} avvik)`);
});

test("FELLE (c): en blokk som bruker den EKTE makkeren før avsløringen blir tatt", () => {
  const u = k2((s, obs, bok) => {
    const v = ærlig(s, obs, bok);
    if (s.makker !== null && !s.makkerAvslørt) v[VALGT_BORT_FRA + ((s.makker - obs + 4) % 4) * VB.PER_SETE + VB.KASTET_MOT] += 1;
    return v;
  }, [6_320_001], 2);
  assert.ok(u.førAvsløring > 0);
  assert.ok(u.avvik.length > 0, "en blokk som kjenner makkeren før avsløringen slapp gjennom — K2-prøven er blind");
});

test("FELLE (e): en bok matet STILLINGEN selv (som om runden var ferdig) blir tatt", () => {
  const u = k2((s, obs) => {
    const lekk = new Hukommelse();
    lekk.observer({ ...s, fase: "RUNDE_SLUTT" } as GameState);
    return e1KortBokTrekk(s, obs, lekk.vektor(obs, 4));
  }, [6_320_001], 2);
  assert.ok(u.avvik.length > 0, "en bok som bokførte den løpende runden slapp gjennom — K2-prøven ser ikke boka");
});

// ---------------------------------------------------------------------------
// 3. Boka flytter seg bare ved RUNDE_SLUTT
// ---------------------------------------------------------------------------

/** Bokblokken sett fra sete 0 i hvert kortvalg, gruppert per runde. `mat` bestemmer hva boka får se. */
function bokPerRunde(mat: (bok: Hukommelse, s: GameState) => void): { avvik: string[]; runder: Map<number, string>; endringer: number } {
  const avvik: string[] = [];
  const runder = new Map<number, string>();
  const drivere = [0, 1, 2, 3].map(() => lagIndre("nevro"));
  const bok = new Hukommelse();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, 6_330_001);
  for (let vakt = 0; s.fase !== "FERDIG" && s.rundeNr < 5 && vakt < 20_000; vakt++) {
    mat(bok, s);
    if (s.fase === "SPILL") {
      const blokk = JSON.stringify([...e1KortBokTrekk(s, 0, bok.vektor(0, 4)).subarray(KORTBOK_FRA, STILLING_FRA)]);
      const før = runder.get(s.rundeNr);
      if (før === undefined) runder.set(s.rundeNr, blokk);
      else if (før !== blokk) avvik.push(`runde ${s.rundeNr} stikk ${s.stikkSpilt}: boka flyttet seg midt i runden`);
    }
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (sete === null || sete === undefined) break;
    s = utfør(s, drivere[sete]!.velgHandling(s)).state;
  }
  let endringer = 0;
  for (let r = 1; runder.has(r); r++) if (runder.get(r) !== runder.get(r - 1)) endringer++;
  return { avvik, runder, endringer };
}

test("boka flytter seg bare ved RUNDE_SLUTT: lik i hele runden, null i runde 0, ny etter hver runde", () => {
  const u = bokPerRunde((bok, s) => bok.observer(s));
  assert.ok(u.runder.size >= 4, `bare ${u.runder.size} runder`);
  assert.ok(JSON.parse(u.runder.get(0)!).every((x: number) => x === 0), "boka hadde noe i runde 0");
  assert.ok(u.endringer >= 3, `boka endret seg bare ${u.endringer} ganger mellom runder`);
  assert.deepEqual(u.avvik, []);
});

test("FELLE (d): en bok matet midt i runden (hvert ferdige stikk som RUNDE_SLUTT) blir tatt", () => {
  const u = bokPerRunde((bok, s) => {
    const midt = s.fase === "SPILL" && s.bord.length === 0 && s.stikkSpilt > 0;
    bok.observer(midt ? ({ ...s, fase: "RUNDE_SLUTT" } as GameState) : s);
  });
  assert.ok(u.avvik.length > 0, "en bok som bokførte midt i runden slapp gjennom — prøven ser ikke tidspunktet");
});

// ---------------------------------------------------------------------------
// 4. Nullpunktet, speken og vakten
// ---------------------------------------------------------------------------

/** Appformatet `src/nevro/nett.ts` leser. */
const tilBytes = (n: NevroNett): Buffer => {
  const deler: Buffer[] = [];
  const i32 = (x: number): void => {
    const b = Buffer.alloc(4);
    b.writeInt32LE(x);
    deler.push(b);
  };
  i32(1);
  i32(n.lag.length);
  for (const l of n.lag) {
    i32(l.inn);
    i32(l.ut);
    deler.push(Buffer.from(new Float32Array(l.vekter).buffer));
    deler.push(Buffer.from(new Float32Array(l.bias).buffer));
  }
  return Buffer.concat(deler);
};

/** Første lag utvidet med nullkolonner BAKERST — det `sd-tren.py --vekter` gjør. */
function nullutvid(n: NevroNett, til: number): NevroNett {
  const [l0, ...resten] = n.lag;
  const v = new Float32Array(l0!.ut * til);
  for (let r = 0; r < l0!.ut; r++) v.set(l0!.vekter.subarray(r * l0!.inn, (r + 1) * l0!.inn), r * til);
  return { lag: [{ inn: til, ut: l0!.ut, vekter: v, bias: Float32Array.from(l0!.bias) }, ...resten] };
}

/** FELLA: skjult enhet 0 får +300 fra «budandel.tiltro» for første motstander — 0 i runde 0, ≥ 1/9 etter. */
function fellenett(n493: NevroNett): NevroNett {
  const [l0, ...resten] = n493.lag;
  const v = Float32Array.from(l0!.vekter);
  v[0 * E1_KORT_BOK_DIM + KORTBOK_FRA + LEDD_NAVN.indexOf("meso.budandel.tiltro")] = 300;
  return { lag: [{ ...l0!, vekter: v }, ...resten] };
}

const N273 = (): NevroNett => nettFraBytes(new Uint8Array(readFileSync(`${ROT}/${KORT273}`)))[0]!;

/** Én kamp med fire likt bygde agenter i speken; hver handling og hvert kortvalg sammenliknes. */
function spillMed(
  spekA: string,
  spekB: string,
  runder: number,
  frø: number,
): { likeKortvalg: number; ulike: { runde: number }[]; handlinger: number } {
  const a = [0, 1, 2, 3].map(() => lagIndre(spekA));
  const b = [0, 1, 2, 3].map(() => lagIndre(spekB));
  for (const x of [...a, ...b]) x.nyKamp();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, frø);
  const ulike: { runde: number }[] = [];
  let likeKortvalg = 0;
  let handlinger = 0;
  for (let vakt = 0; s.fase !== "FERDIG" && s.rundeNr < runder && vakt < 20_000; vakt++) {
    for (const x of [...a, ...b]) x.observer?.(s);
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (sete === null || sete === undefined) break;
    const ha = a[sete]!.velgHandling(s);
    const hb = b[sete]!.velgHandling(s);
    handlinger++;
    if (JSON.stringify(ha) !== JSON.stringify(hb)) ulike.push({ runde: s.rundeNr });
    else if (s.fase === "SPILL" && lovligeKort(s, sete).length >= 2) likeKortvalg++;
    // A spiller kampen videre: begge ser samme stillinger.
    s = utfør(s, ha).state;
  }
  return { likeKortvalg, ulike, handlinger };
}

test("nullpunktet: 273-nettet utvidet til 493 med nuller gir identiske logits og valg, også med full bok", () => {
  const n273 = N273();
  const n493 = nullutvid(n273, E1_KORT_BOK_DIM);
  const a = new E1Agent(n273);
  const b = new E1Agent(n493);
  assert.equal(a.leserHukommelse, false);
  assert.equal(b.leserHukommelse, true);
  let n = 0;
  let medBok = 0;
  kamper([6_340_001], 4, (s) => {
    a.observer(s);
    b.observer(s);
    if (s.fase !== "SPILL" || s.iTur === null) return;
    const sete = s.iTur;
    if (harBok(b.trekk(s, sete))) medBok++;
    const la = a.logits(s, sete);
    const lb = b.logits(s, sete);
    for (let i = 0; i < 52; i++) assert.ok(la[i] === lb[i], `logit ${i}: ${la[i]} mot ${lb[i]}`);
    assert.deepEqual(b.velgKort(s, sete), a.velgKort(s, sete));
    n++;
  });
  assert.ok(n >= 100 && medBok >= 50, `oppsettet: ${n} kortvalg, ${medBok} med bok — nullkolonnene er ikke prøvd mot en full bok`);
});

test("speken: vakt:abmp:e1:<493 nullutvidet> spiller som 273 i hele kampen; fellenettet endrer valg bare etter runde 0", () => {
  const n273 = N273();
  const null493 = `${MAPPE}/null493.bin`;
  const felle493 = `${MAPPE}/felle493.bin`;
  writeFileSync(`${ROT}/${null493}`, tilBytes(nullutvid(n273, E1_KORT_BOK_DIM)));
  writeFileSync(`${ROT}/${felle493}`, tilBytes(fellenett(nullutvid(n273, E1_KORT_BOK_DIM))));

  const lik = spillMed(`vakt:abmp:e1:${null493}`, `vakt:abmp:e1:${KORT273}`, 4, 6_350_001);
  assert.ok(lik.likeKortvalg >= 60, `oppsettet: ${lik.likeKortvalg} kortvalg`);
  assert.deepEqual(lik.ulike, [], "det nullutvidede nettet valgte annerledes enn 273-nettet");

  // FELLA gjennom speken: boka må nå kortlaget gjennom vakten, ellers er valgene de samme.
  const felle = spillMed(`vakt:abmp:e1:${felle493}`, `vakt:abmp:e1:${KORT273}`, 4, 6_350_001);
  assert.equal(felle.ulike.filter((x) => x.runde === 0).length, 0, "fellenettet avvek i runde 0 — boka var ikke tom");
  assert.ok(felle.ulike.length > 0, "fellenettet avvek aldri — observer når ikke kortlaget gjennom vakt:, eller boka leses ikke");
});

test("vakten: et 493-kortlag uten observer kaster i runde 1; nyKamp tømmer boka", () => {
  const n493 = nullutvid(N273(), E1_KORT_BOK_DIM);
  const blind = new E1Agent(n493);
  const drivere = [0, 1, 2, 3].map(() => lagIndre("nevro"));
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, 6_360_001);
  let kastet: unknown = null;
  for (let vakt = 0; s.fase !== "FERDIG" && s.rundeNr < 3 && vakt < 20_000 && kastet === null; vakt++) {
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (sete === null || sete === undefined) break;
    if (s.fase === "SPILL") {
      try {
        blind.velgHandling(s);
      } catch (e) {
        kastet = e;
        assert.equal(s.rundeNr, 1, "kastet i feil runde");
      }
    }
    s = utfør(s, drivere[sete]!.velgHandling(s)).state;
  }
  assert.match(String(kastet), /observer er ikke koblet/, "et kortlag som aldri så RUNDE_SLUTT spilte videre på en tom bok");

  const sett = new E1Agent(n493);
  let siste: GameState | null = null;
  kamper([6_360_002], 3, (x) => {
    sett.observer(x);
    if (x.fase === "SPILL" && x.iTur !== null && harBok(sett.trekk(x, x.iTur))) siste = x;
  });
  assert.ok(siste !== null, "oppsettet: boka ble aldri fylt");
  sett.nyKamp();
  const x = siste as GameState;
  sett.observer({ ...x, rundeNr: 0 } as GameState);
  assert.equal(harBok(sett.trekk({ ...x, rundeNr: 0 } as GameState, x.iTur!)), false, "nyKamp tømte ikke boka");
});

test("lasterne: appen og de rå kortnettleserne avviser 493; bare e1: i speken tar den", () => {
  const bytes = new Uint8Array(tilBytes(nullutvid(N273(), E1_KORT_BOK_DIM)));
  assert.throws(() => e1NettFraBytes(bytes), /bokbredden/);
  assert.equal(e1NettFraBytes(bytes, "prøve", true).lag[0]!.inn, 493);
  const fil = `${MAPPE}/laster493.bin`;
  writeFileSync(`${ROT}/${fil}`, bytes);
  assert.throws(() => lesNett(fil), /bokbredden/, "lesNett (ens:, e1r:, amu-atferd) må ikke ta 493");
  assert.throws(() => lagIndre(`ens:snitt:${fil},${KORT273}`), /bokbredden/);
  assert.throws(() => lagIndre(`vakt:abmp:e1r:${fil}`), /bokbredden/);
  assert.ok(lagIndre(`vakt:abmp:e1:${fil}`) !== null);
});

// ---------------------------------------------------------------------------
// 5. kort-data --bredde 493
// ---------------------------------------------------------------------------

function kjør(skript: string, args: readonly string[]): string {
  const r = spawnSync(process.execPath, [skript, ...args], { cwd: ROT, encoding: "utf8" });
  assert.equal(r.status, 0, `${skript} ${args.join(" ")}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

interface Rad {
  runde: number;
  stikk: number;
  sete: number;
  p: number;
  b: number;
  t: number[];
  v: Record<string, number>;
}
const lesRader = (sti: string): Rad[] =>
  readFileSync(`${ROT}/${sti}`, "utf8")
    .split("\n")
    .filter((x) => x !== "")
    .map((x) => JSON.parse(x) as Rad);

test("kort-data --bredde 493: samme rader og etiketter som 273, bok null i runde 0 og fylt i runde 1; et 493-nett gir bredden selv", () => {
  // Billig søk (2 verdener), men søket og etikettveien er de samme som i løkka.
  const SPEK = `sik:alle:0.5:2k2:vakt:abmp:e1:${KORT273}`;
  const felles = ["--kamper", "1", "--maksrunder", "2", "--drivere", "@|nevro|@|nevro"];
  kjør("examples/kort-data.ts", ["--spek", SPEK, ...felles, "--ut", `${MAPPE}/k273.jsonl`]);
  kjør("examples/kort-data.ts", ["--spek", SPEK, ...felles, "--bredde", "493", "--ut", `${MAPPE}/k493.jsonl`]);
  const a = lesRader(`${MAPPE}/k273.jsonl`);
  const b = lesRader(`${MAPPE}/k493.jsonl`);
  assert.ok(a.length >= 20, `for få rader (${a.length})`);
  assert.equal(b.length, a.length);
  let runde1Bok = 0;
  for (const [i, r] of b.entries()) {
    assert.equal(r.t.length, 493);
    assert.deepEqual(r.t.slice(0, 273), a[i]!.t, `rad ${i}: de 273 første er ikke 273-raden`);
    assert.deepEqual([r.v, r.p, r.b, r.stikk, r.runde], [a[i]!.v, a[i]!.p, a[i]!.b, a[i]!.stikk, a[i]!.runde]);
    const bok = r.t.slice(273, 417);
    if (r.runde === 0) assert.ok(bok.every((x) => x === 0), `rad ${i}: bok i runde 0`);
    else if (bok.some((x) => x !== 0)) runde1Bok++;
    assert.ok(r.t.slice(417, 453).some((x) => x !== 0), `rad ${i}: stillingsblokken er tom`);
  }
  assert.ok(runde1Bok > 0, "ingen rad i runde 1 hadde bok — generatoren observerte ikke RUNDE_SLUTT");

  // Et 493-nett i speken: bredden kommer av nettet, og kortlaget spiller (observer gjennom vakten).
  const fil = `${MAPPE}/spek493.bin`;
  writeFileSync(`${ROT}/${fil}`, tilBytes(nullutvid(N273(), E1_KORT_BOK_DIM)));
  kjør("examples/kort-data.ts", ["--spek", `sik:alle:0.5:2k2:vakt:abmp:e1:${fil}`, ...felles, "--ut", `${MAPPE}/k493b.jsonl`]);
  const c = lesRader(`${MAPPE}/k493b.jsonl`);
  // Nullutvidet nett = samme spill = samme rader, byte for byte.
  assert.deepEqual(c, b, "et nullutvidet 493-nett i speken ga andre rader enn 273-nettet med --bredde 493");

  // Etiketten uten bok på bokbredden kaster i stedet for å skrive nuller.
  const par = { kandidater: [] } as unknown as ParResultat;
  const s = opprettSpill({ antallSpillere: 4 }, 1);
  assert.throws(() => kortEtikett(s, 0, par, 493, null), /ingen bok/);
});

// ---------------------------------------------------------------------------
// 6. Treneren, i WSL der torch bor (opt-in)
// ---------------------------------------------------------------------------

const WSL = process.env.KORT_TREN_WSL === "1";
const PY = "/home/arvind/Arvind-Lora/.venv/bin/python";

function sdTren(args: readonly string[], ventetStatus = 0): string {
  const r = spawnSync("wsl.exe", ["-d", "Ubuntu", "--cd", ROT.replace(/[\\/]$/, ""), "-e", PY, "verktoy/sd-tren.py", ...args], {
    encoding: "utf8",
    timeout: 600_000,
  });
  if (ventetStatus === 0) assert.equal(r.status, 0, `sd-tren.py ${args.join(" ")}\n${r.stdout}\n${r.stderr}`);
  else assert.notEqual(r.status, 0, `sd-tren.py skulle feilet: ${args.join(" ")}\n${r.stdout.slice(-1500)}`);
  return `${r.stdout}\n${r.stderr}`;
}
const linje = (ut: string, navn: string): number => {
  const m = [...ut.matchAll(new RegExp(`^${navn} (\\S+)$`, "gm"))].at(-1);
  assert.ok(m !== undefined, `fant ikke «${navn}» i\n${ut.slice(-2000)}`);
  return Number(m[1]);
};

test("TRENEREN: --vekter kort-3 (273) på 493-rader skriver det nullutvidede nettet, modell = policy per fase; 340-start avvises", { skip: WSL ? false : "sett KORT_TREN_WSL=1 (kjører sd-tren.py i WSL)" }, () => {
  const rng = lagRng(4343);
  const rader: string[] = [];
  let i = 0;
  kamper([6_370_001, 6_370_002], 3, (s, bok) => {
    if (s.fase !== "SPILL" || s.iTur === null || lovligeKort(s, s.iTur).length < 2) return;
    const v: Record<string, number> = {};
    for (const k of lovligeKort(s, s.iTur)) v[String(kortIndeks(k))] = Math.round((rng() * 10 - 5) * 1e4) / 1e4;
    rader.push(JSON.stringify({ frø: 1000 + (i++ % 40), stikk: s.stikkSpilt, t: Array.from(e1KortBokTrekk(s, s.iTur, bok.vektor(s.iTur, 4))), v }));
  });
  mkdirSync(`${ROT}/${MAPPE}/data`, { recursive: true });
  writeFileSync(`${ROT}/${MAPPE}/data/s0.jsonl`, rader.join("\n") + "\n");
  const felles = ["--data", `${MAPPE}/data`, "--epoker", "0", "--enhet", "cpu", "--ingenbuffer", "--minrader", "1", "--holdoutandel", "0.5", "--logg", `${MAPPE}/tren.jsonl`];

  const ut = sdTren([...felles, "--vekter", KORT273, "--ut", `${MAPPE}/kort-0.bin`]);
  const ventet = tilBytes(nullutvid(N273(), E1_KORT_BOK_DIM));
  assert.ok(readFileSync(`${ROT}/${MAPPE}/kort-0.bin`).equals(ventet), "epoke 0 skrev ikke 273-nettet nullutvidet byte for byte");
  assert.match(ut, /^Trekkbredde: 493 /m);
  assert.equal(linje(ut, "MODELL-ANGER-HOLDOUT"), linje(ut, "POLICY-ANGER-HOLDOUT"));
  for (const f of ["TIDLIG", "MIDT", "SENT"]) {
    assert.equal(linje(ut, `MODELL-ANGER-HOLDOUT-${f}`), linje(ut, `POLICY-ANGER-HOLDOUT-${f}`), f);
    assert.ok(Number.isFinite(linje(ut, `POLICY-ANGER-HOLDOUT-${f}`)), `${f} er ikke et tall`);
  }
  assert.ok(linje(ut, "START-AVVIK") < 1e-4, "torch-nettet regner ikke det samme som vektfila");
  // Løkka leser `grep ^MODELL-ANGER-HOLDOUT | tail -1`: totalen må stå SIST, ellers leser porten SENT.
  const siste = ut.trim().split("\n").filter((x) => /^(MODELL|POLICY)-ANGER-HOLDOUT/.test(x));
  assert.match(siste.at(-2)!, /^MODELL-ANGER-HOLDOUT \S+$/);
  assert.match(siste.at(-1)!, /^POLICY-ANGER-HOLDOUT \S+$/);

  // FELLEN: 340 er et kjedeprefiks, ikke et bokprefiks — varmstarten skal nekte.
  writeFileSync(`${ROT}/${MAPPE}/n340.bin`, tilBytes(nullutvid(N273(), 340)));
  const feil = sdTren([...felles, "--vekter", `${MAPPE}/n340.bin`, "--ut", `${MAPPE}/kort-340.bin`], 1);
  assert.match(feil, /prefiks/);
});
