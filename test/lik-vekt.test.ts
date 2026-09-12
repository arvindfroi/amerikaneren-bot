/**
 * LIKELIHOOD-VEKTEN I SØKET (`src/moe2/likvekt.ts`, `~lik=` i speken) — 12. sep.
 *
 * Fem ting må holde, og de er ikke de samme:
 *
 *   1. K2. Vekten leser bare offentlige felt og VERDENENS hender. Bytt de skjulte kortene
 *      (hender, vrak) eller fyll `state.talong` med søppel, og det vektede verdenssettet
 *      skal være BIT-IDENTISK for samme frø.
 *   2. FELLA. En vekt som titter på de ekte hendene MÅ bli tatt av den samme prøven. Uten
 *      den vet vi ikke om den grønne testen over betyr «blind» eller «måler ingenting».
 *   3. KRAFTEN. Mot et bord som faktisk spiller den antatte speken, skal den vektede
 *      mengden plassere kortene BEDRE enn den uvektede. En vekt som ikke kan vinne der,
 *      kan ikke vinne noe sted.
 *   4. ROBUSTHETEN. Med FEIL antatt policy skal den ikke være katastrofalt verre. Tallet
 *      rapporteres, og porten er løs med vilje: dette er en advarsel, ikke en teori.
 *   5. STANDARDSTIEN. Uten `~lik=` er `likFor` null og speken bygger som før; med den er
 *      den koblet hele veien inn i σ.
 *
 * Små tall med vilje: CPU-en deles med treningen.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør } from "../src/index.ts";
import { lovligeKort, type GameState } from "../src/motor.ts";
import { lagRng } from "../src/kort.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { intTilKort, kortTilInt } from "../src/solver/dds.ts";
import { ADAMS, lagIndre, utenSøk } from "../src/moe2/agentspek.ts";
import { trekkVerdener } from "../src/moe2/sdkort.ts";
import { lagLikvekt, logLikelihood } from "../src/moe2/likvekt.ts";
import { kanoniskAgent } from "../src/moe2/kanonisk.ts";
import { Sikkerorakel } from "../src/moe2/sikkerorakel.ts";
import { trekkVerden, type Verden } from "../src/solver/sampler.ts";
import { søketro, utenMinne } from "../examples/spek-lag.ts";

type Indre = ConstructorParameters<typeof Sikkerorakel>[0];

/** Bordets policy i prøvene. Én spek, så «den sanne motstanderen» er entydig. */
const BORD = ADAMS;
const policy = lagIndre(BORD);

/** Kortvalg med minst to lovlige kort, fra noen giv spilt av `BORD`. */
interface Stilling {
  readonly s: GameState;
  readonly sete: number;
}
function samle(frøene: readonly number[], kanoniser: boolean): Stilling[] {
  const ut: Stilling[] = [];
  const agenter = [0, 1, 2, 3].map(() => (kanoniser ? kanoniskAgent(lagIndre(BORD)) : lagIndre(BORD)));
  for (const frø of frøene) {
    let s = opprettSpill({ antallSpillere: 4 }, frø);
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
      const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (sete === null || sete === undefined) break;
      // Fra stikk 1: vinduet trenger ETT fullført stikk eller kort på bordet å score på.
      if (s.fase === "SPILL" && s.iTur !== null && s.stikkSpilt >= 1 && lovligeKort(s, s.iTur).length >= 2) {
        ut.push({ s, sete: s.iTur });
      }
      s = utfør(s, agenter[sete]!.velgHandling(s)).state;
    }
  }
  return ut;
}

/** Bordet slik det FAKTISK spiller: hendene i utdelingsorden. */
const STILLINGER: Stilling[] = samle([7_310_901, 7_310_902, 7_310_903, 7_310_904], false);
/** Bordet i kanonisk form — der policyen er en funksjon av det setet kan vite. */
const KANONISKE: Stilling[] = samle([7_310_911, 7_310_912, 7_310_913], true);

/** Andel av de andres håndkort verdenen legger hos riktig spiller. Prøvens egen scorer. */
function treff(s: GameState, sete: number, hender: readonly (readonly number[])[]): number {
  let r = 0;
  let n = 0;
  for (let p = 0; p < s.antallSpillere; p++) {
    if (p === sete) continue;
    const ekte = new Set((s.hender[p] ?? []).map(kortIndeks));
    n += ekte.size;
    for (const c of hender[p] ?? []) if (ekte.has(kortIndeks(intTilKort(c)))) r++;
  }
  return n === 0 ? 1 : r / n;
}

const V = 6;
const KAND = 16;

/** Verdenssettet for én stilling, med `vekt` på kandidatene og fast frø. */
const settFor = (
  st: Stilling,
  vekt: ((v: Verden) => number) | undefined,
  frø: number,
): number[][][] => trekkVerdener(st.s, st.sete, V, lagRng(frø), undefined, vekt, KAND, undefined, true);

const likFor = (st: Stilling, s = st.s, temp = 0): ((v: Verden) => number) | null =>
  lagLikvekt(s, st.sete, () => policy, { temp });

test("stillingene finnes", () => {
  assert.ok(STILLINGER.length >= 20, `bare ${STILLINGER.length} stillinger`);
});

// ===========================================================================
// 1 og 2: K2 og fella
// ===========================================================================

/**
 * Stillingen med de SKJULTE kortene stokket om — det observatøren ser er uendret.
 *
 *   `hender`  to kort byttes mellom to andre seter
 *   `vrak`    et kort byttes mellom vraket og et annet sete (vraket er skjult for alle
 *             andre enn budvinneren, så dette er lovlig usett informasjon)
 *   `talong`  fylles med et kort som ikke finnes i stillingen. I SPILL er talongen tom, og
 *             en vekt som leser den i stedet for å regne residualet ville bommet. Den skal
 *             ikke kunne merke dette i det hele tatt.
 */
function byttSkjult(st: Stilling): GameState[] {
  const { s, sete } = st;
  const ut: GameState[] = [];
  const a = (sete + 1) % 4;
  const b = (sete + 2) % 4;
  if (s.hender[a]!.length > 0 && s.hender[b]!.length > 0) {
    const hender = s.hender.map((h) => [...h]);
    const x = hender[a]![0]!;
    hender[a]![0] = hender[b]![0]!;
    hender[b]![0] = x;
    ut.push({ ...s, hender });
  }
  if (s.vrak.length > 0 && sete !== s.budvinner && s.hender[a]!.length > 0) {
    const hender = s.hender.map((h) => [...h]);
    const vrak = [...s.vrak];
    const x = hender[a]![0]!;
    hender[a]![0] = vrak[0]!;
    vrak[0] = x;
    ut.push({ ...s, hender, vrak });
  }
  ut.push({ ...s, talong: [{ farge: "S", verdi: 14 }] });
  return ut;
}

test("K2: det vektede verdenssettet er bit-identisk når bare de skjulte kortene byttes", () => {
  let prøvd = 0;
  let ulikeVekter = 0;
  for (const st of STILLINGER) {
    const v1 = likFor(st);
    if (v1 === null) continue;
    const frø = 4_242 + prøvd;
    const fasit = settFor(st, v1, frø);
    // Kontroll: vekten skal SKILLE mellom verdener, ellers beviser likheten ingenting.
    const r = lagRng(frø);
    const verdier = new Set<number>();
    for (let i = 0; i < 8; i++) {
      const w = trekkVerden(st.s, st.sete, r);
      if (w !== null) verdier.add(v1(w));
    }
    if (verdier.size > 1) ulikeVekter++;

    for (const annen of byttSkjult(st)) {
      const v2 = likFor(st, annen);
      assert.ok(v2 !== null, "vekten forsvant da de skjulte kortene ble byttet");
      assert.deepEqual(
        settFor({ s: annen, sete: st.sete }, v2, frø),
        fasit,
        `JUKS: verdenssettet endret seg da bare de SKJULTE kortene ble byttet ` +
          `(stikk ${st.s.stikkSpilt}, sete ${st.sete}). Ett avvik er nok.`,
      );
    }
    prøvd++;
  }
  assert.ok(prøvd >= 15, `bare ${prøvd} stillinger prøvd — beviser ingenting`);
  assert.ok(ulikeVekter >= 5, `vekten var konstant i alle stillinger (${ulikeVekter} med spredning)`);
});

test("K2 KAN FEILE: en vekt som ser de EKTE hendene blir tatt", () => {
  let tatt = 0;
  let prøvd = 0;
  for (const st of STILLINGER.slice(0, 12)) {
    const { s, sete } = st;
    const a = (sete + 1) % 4;
    /** Den minste tenkelige lekkasjen: «legger verdenen kort nr. 0 der det FAKTISK ligger?» */
    const jukser = (t: GameState) => (v: Verden): number =>
      (t.hender[a]![0] !== undefined && (v.hender[a] ?? []).some((c) => kortIndeks(intTilKort(c)) === kortIndeks(t.hender[a]![0]!))
        ? 0
        : -5);
    const frø = 9_100 + prøvd;
    const fasit = settFor(st, jukser(s), frø);
    for (const annen of byttSkjult(st)) {
      prøvd++;
      try {
        assert.deepEqual(settFor({ s: annen, sete }, jukser(annen), frø), fasit);
      } catch {
        tatt++;
      }
    }
  }
  assert.ok(
    tatt > 0,
    `en vekt som leser en ekte hånd ble IKKE tatt i ${prøvd} sammenlikninger — da måler K2-prøven over ingenting`,
  );
});

// ===========================================================================
// 3 og 4: kraften og robustheten
// ===========================================================================

/** Snitt av (vektet − uvektet) treff over stillingene, parvis på samme frø. */
function plasseringsgevinst(antatt: ReturnType<typeof lagIndre>): { n: number; snitt: number; se: number } {
  const d: number[] = [];
  for (const [i, st] of STILLINGER.entries()) {
    const v = lagLikvekt(st.s, st.sete, () => antatt, { temp: 0 });
    if (v === null) continue;
    const frø = 5_050 + i;
    const uten = settFor(st, undefined, frø);
    const med = settFor(st, v, frø);
    if (uten.length === 0 || med.length === 0) continue;
    const sc = (ws: number[][][]): number => ws.reduce((x, w) => x + treff(st.s, st.sete, w), 0) / ws.length;
    d.push(sc(med) - sc(uten));
  }
  const n = d.length;
  const snitt = d.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const varians = n > 1 ? d.reduce((a, x) => a + (x - snitt) ** 2, 0) / (n - 1) : 0;
  return { n, snitt, se: Math.sqrt(varians / Math.max(1, n)) };
}

test("KRAFTEN: med motstandernes SANNE spek plasserer den vektede mengden kortene bedre", () => {
  const g = plasseringsgevinst(policy);
  console.log(`  lik=<sann spek>: ${(100 * g.snitt).toFixed(2)} ± ${(100 * g.se).toFixed(2)} pp (n=${g.n})`);
  assert.ok(g.n >= 15, `bare ${g.n} stillinger`);
  assert.ok(
    g.snitt > 0,
    `likelihood-vekten med motstandernes EGEN spek ga ${(100 * g.snitt).toFixed(2)} pp — ` +
      `kan den ikke vinne her, kan den ikke vinne noe sted`,
  );
});

test("ROBUSTHETEN: FEIL antatt policy er ikke katastrofal", () => {
  const g = plasseringsgevinst(lagIndre("nevro"));
  console.log(`  lik=<feil spek (nevro)>: ${(100 * g.snitt).toFixed(2)} ± ${(100 * g.se).toFixed(2)} pp (n=${g.n})`);
  assert.ok(g.n >= 15, `bare ${g.n} stillinger`);
  // LØS PORT MED VILJE: tallet skal RAPPORTERES. Faller den under, er det et funn, ikke en bug.
  assert.ok(
    g.snitt > -0.05,
    `feil policy kostet ${(100 * g.snitt).toFixed(2)} pp riktig plasserte kort — katastrofalt, og det ` +
      `skal stå i rapporten`,
  );
});

test("temperaturen er koblet: mykere temp gir vekter nærmere uniform", () => {
  let prøvd = 0;
  for (const st of STILLINGER.slice(0, 10)) {
    const hard = likFor(st, st.s, 0);
    const myk = lagLikvekt(st.s, st.sete, () => policy, { temp: 5 });
    if (hard === null || myk === null) continue;
    const r = lagRng(3_300 + prøvd);
    for (let i = 0; i < 6; i++) {
      const w = trekkVerden(st.s, st.sete, r);
      if (w === null) continue;
      assert.ok(
        Math.abs(myk(w)) <= Math.abs(hard(w)) + 1e-12,
        `temp 5 ga en STØRRE straff (${myk(w)}) enn temp 0 (${hard(w)})`,
      );
      if (hard(w) < 0) prøvd++;
    }
  }
  assert.ok(prøvd > 0, "ingen verden fikk straff i det hele tatt — temperaturen er ikke prøvd");
});

test("vinduet er en kostnadsgrense, ikke en bryter: v0 gir ingen vekt", () => {
  const st = STILLINGER.find((x) => x.s.bord.length === 0)!;
  assert.ok(st !== undefined, "ingen stilling med tomt bord");
  assert.equal(lagLikvekt(st.s, st.sete, () => policy, { vindu: 0 }), null);
});

/** Andel av stillingene der den EKTE given får straff av bordets egen policy. */
function fasitbom(rader: readonly Stilling[]): { prøvd: number; bom: number } {
  let prøvd = 0;
  let bom = 0;
  for (const st of rader) {
    // `kortTilInt` og IKKE `kortIndeks`: verdenene er i samplerens koding, og de to er ikke
    // samme tall. Nøyaktig duplikatklassen `sdkort.ts` advarer mot i importkommentaren sin.
    const ekte = st.s.hender.map((h) => h.map((k) => kortTilInt(k)));
    prøvd++;
    if (logLikelihood(st.s, st.sete, ekte, () => policy, { temp: 0 }) < -1e-9) bom++;
  }
  return { prøvd, bom };
}

test("FASIT: mot et KANONISK bord får den sanne given aldri straff", () => {
  /**
   * Er bordet kanonisk, er policyen en funksjon av kortMENGDEN, og den sanne given gjenskaper
   * per definisjon hver observasjon. Ett avvik her betyr at vekten måler noe annet enn den
   * sier — enten fordi omspillingen bygger feil stilling, eller fordi kanoniseringen ikke
   * når fram. Det er den samme kontrollen som `sann_ok` i `k8-tak.ts`.
   */
  const { prøvd, bom } = fasitbom(KANONISKE);
  assert.ok(prøvd >= 20, `bare ${prøvd} stillinger`);
  assert.equal(bom, 0, `${bom} av ${prøvd} sanne giver fikk straff av bordets EGEN kanoniske policy`);
});

test("MÅLT, ikke antatt: mot et bord som IKKE er kanonisk finnes et bomgulv", () => {
  /**
   * ============ GRENSEN FOR `~lik=selv` I SPILL =============================
   *
   * Ved et EKTE bord ligger hendene i utdelingsorden, og speken bryter likhet etter hvor i
   * hånden kortene ligger (`kanonisk.ts`). Likelihooden må kanonisere for å være en funksjon
   * av det setet kan vite — og da bommer den på de valgene der ordenen avgjorde, selv når
   * verdenen er HELT riktig. Det er et gulv vekten ikke kan komme under, og det er grunnen
   * til at straffen er myk-i-kanten (`HARD` og andelsnormalisering) og ikke ren 0/1: med 0/1
   * ville en slik bom slått ut den sanne verdenen fullstendig.
   *
   * Tallet skal RAPPORTERES, ikke skjules. Porten er løs: den fanger en regresjon der
   * kanoniseringen faller ut helt (da bommer nesten alt), ikke gulvet i seg selv.
   */
  const { prøvd, bom } = fasitbom(STILLINGER);
  console.log(`  bomgulv mot ikke-kanonisk bord: ${bom} av ${prøvd} (${((100 * bom) / prøvd).toFixed(1)} %)`);
  assert.ok(prøvd >= 20, `bare ${prøvd} stillinger`);
  assert.ok(
    bom / prøvd < 0.25,
    `${bom} av ${prøvd} sanne giver fikk straff — så høyt at kanoniseringen neppe virker`,
  );
});

// ===========================================================================
// 5: speken
// ===========================================================================

test("speken: «~lik=» bygger, kobles til σ, og standardstien er urørt", () => {
  const uten = `sik:alle:0:4k8:${ADAMS}`;
  const med = `sik:alle:0:4k8~lik=selv:${ADAMS}`;
  assert.equal(utenSøk(med), ADAMS, "utenSøk må strippe som før — feltantallet er uendret");

  const a = lagIndre(uten) as unknown as Sikkerorakel;
  const b = lagIndre(med) as unknown as Sikkerorakel;
  assert.equal(a.likFor, null, "standardstien har fått en likelihood-vekt den ikke ba om");
  assert.ok(b.likFor !== null, "«~lik=selv» ga ingen vekt");

  let ulik = 0;
  for (const st of STILLINGER.slice(0, 8)) {
    a.velgHandling(st.s);
    b.velgHandling(st.s);
    assert.equal(a.siste?.n, b.siste?.n, "armene brukte ulikt antall verdener");
    if (a.siste?.sigma !== b.siste?.sigma) ulik++;
  }
  assert.ok(ulik > 0, "«~lik=selv» ga nøyaktig samme σ i alle stillinger — vekten når ikke søket");
});

test("speken: knottene og feilene", () => {
  const bygg = (f: string): Sikkerorakel => lagIndre(`sik:alle:0:4k8${f}:${ADAMS}`) as unknown as Sikkerorakel;
  assert.ok(bygg("~lik=selv,t0.5").likFor !== null);
  assert.ok(bygg("~lik=selv,t0.5,v2").likFor !== null);
  assert.throws(() => bygg("~lik="), /lik/);
  assert.throws(() => bygg("~lik=selv,q3"), /Ukjent knott/);
  assert.throws(() => bygg("~lik=annet"), /selv/);
  // Den gamle feilmeldingen skal fortsatt nevne trokilden (test/sik-tro.test.ts leser den).
  assert.throws(() => bygg("~abc=x.bin"), /trokilde/);
});

test("speken: «~mlbu=» og «~lik=» sammen — stien til trohodet skal ikke få «~lik» på seg", () => {
  const spek =
    `okt:vr:e1-modell/vrakrang.bin:telrd:sik:alle:0.5:24k32e3L~mlbu=e1-modell/mlb-tro.bin~lik=selv:` +
    `vakt:abmp:e1:e1-modell/d7alle.bin`;
  assert.deepEqual(søketro(spek), {
    art: "mlbu",
    sti: "e1-modell/mlb-tro.bin",
    verdener: 24,
    kandidater: 32,
  });
  // K4-nullarmen tar troen med bok, men ALDRI likelihooden: den krysser verken runder eller kamper.
  assert.ok(
    utenMinne(spek, () => true).includes("~lik=selv"),
    "«~lik=» ble tatt ut av nullarmen uten hukommelse — da måler K4/K6 to ting på én gang",
  );
  assert.ok(!utenMinne(spek, () => true).includes("mlbu="), "trohodet med bok skal ut av nullarmen");
  assert.ok(utenMinne(spek, () => false).includes("~mlbu=e1-modell/mlb-tro.bin~lik=selv"));
});
