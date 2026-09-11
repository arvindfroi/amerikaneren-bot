/**
 * DET RETTFERDIGE TAKET FOR K8 — prøver for den EKSAKTE tellingen i `examples/naabart-tro.ts`
 * og dommen i `examples/k8-tak-dom.ts`.
 *
 * Hver prøve har en felle som MÅ bli tatt:
 *
 *   1. K2. Posterioren er en funksjon av det setet ser. ALLE skjulte kort byttes (de andres hender i
 *      hver post, talongen, vraket og VRAK-handlingen for en ikke-budvinner), en ikke-avslørt makker
 *      og frøet — den eksakte fordelingen skal være bit-identisk. FELLE: `felleKlarsyn` teller bare
 *      den ekte given (en «posterior» som leser hendene) og SKAL gi en annen fordeling.
 *   2. KONTROLLEN. Den sanne given er forenlig i hver stilling (replayet gjenskaper policyene), og en
 *      giv der to spilte kort har byttet sete er det IKKE.
 *   3. SISTE STIKK. Den faktoriserte tellingen er nøyaktig full omspilling av runden (budvinneren) og
 *      den naive tellingen med alle talonger (ikke-budvinner); med ett skjult kort igjen på hendene er
 *      den SIKKER (log-tap 0). FELLER: den policy-blinde tellingen skiller seg fra omspillingen, og
 *      sikkerheten scoret med setene rotert gir tap > 0.
 *   4. POLICYENE ER VERDT NOE. Posterioren som kjenner policyene taper ikke mot den policy-blinde
 *      (uniform over de regelforenlige givene) på de samme stillingene, og støtten er en delmengde.
 *      FELLE: en posterior med FEIL policyer (ADAMS_MAALT for bordet) taper mot den blinde.
 *   5. DOMMENE: andelene er de avtalte brøkene, udekkede stillinger er aldri med i snittene.
 *   6. PARVIS (agent R): før/etter på de samme stillingene gir forskjellen uten kampvariansen, og de
 *      udekkede radene er bare med i «d tap». FELLE: udekkede rader med tak flytter «d rettferdig».
 *
 * SMC-veien (partikler > 0) er EKSPERIMENTELL og har ingen prøve her: målt 12. sep kollapset den med
 * 8 partikler (kontrollen) og 60 partikler i stikk 10 (støtten); K2-prøven med 40 partikler i stikk
 * 3–6 gikk gjennom (12 s), men vaskingen den prøver er den samme som prøve 1 dekker.
 *
 * Små tall med vilje: CPU-en deles med treningen. Første runde, så agentene har ingen sessionstilstand.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { lagRng, type Kort } from "../src/kort.ts";
import { intTilKort, kortTilInt } from "../src/solver/dds.ts";
import { ADAMS_MAALT, lagIndre, type Spekagent } from "../src/moe2/agentspek.ts";
import { handlingNøkkel } from "../examples/naabart-handling.ts";
import { NaabartTro, kanoniskAgent, sannPlassering, takTap, type Loggpost, type NaabartTroOpts, type Troresultat } from "../examples/naabart-tro.ts";
import { domK8Tak, domParvis, domPerStikk, type K8TakRad } from "../examples/k8-tak-dom.ts";
import { LN3 } from "../examples/k8-maal.ts";

const SPEK = "okt:vr:e1-modell/vrak-3.bin:telrd:profil:budq:e1-modell/budq-3.bin:vakt:abmp:e1:e1-modell/kort-3.bin";
// KANONISKE agenter overalt (naabart-tro.ts): hånden sortert og frø 0, ellers bryter speken likhet etter skjult håndorden.
const ferske = (spek = SPEK) => [0, 1, 2, 3].map(() => kanoniskAgent(lagIndre(spek)));
const iTurFor = (s: GameState): number => (s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!);

/** Én runde spilt av speken: loggen med én post per handling (stillingen før, handlingen). */
function runde(frø: number): Loggpost[] {
  const ag = ferske();
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  const logg: Loggpost[] = [];
  while (s.fase !== "RUNDE_SLUTT" && s.fase !== "FERDIG") {
    const h = ag[iTurFor(s)]!.velgHandling(s);
    logg.push({ s, h });
    s = utfør(s, h).state;
    // Alle passet: ny giv i ny runde, loggen starter på nytt.
    if (s.rundeNr !== logg[0]!.s.rundeNr) logg.length = 0;
  }
  return logg;
}

const RUNDER = [runde(7_710_001), runde(7_710_002), runde(7_710_003)];

/** Stillingene i SPILL: indeks i loggen, sete i tur, og om setet er budvinner. */
function stillinger(logg: readonly Loggpost[], fra: number, til: number) {
  return logg.flatMap((p, i) => (p.s.fase === "SPILL" && p.s.stikkSpilt >= fra && p.s.stikkSpilt <= til ? [{ i, sete: p.s.iTur!, bv: p.s.iTur === p.s.budvinner }] : []));
}

const eksakt = (logg: readonly Loggpost[], i: number, sete: number, opts: Partial<NaabartTroOpts> = {}) =>
  new NaabartTro(sete, { partikler: 0, eksaktGrense: 1e6, agenter: ferske(), ...opts }).eksaktTro(logg.slice(0, i), logg[i]!.s);

/** Kortene på de andre setenes hender (det K8 scorer). */
const handkort = (s: GameState, o: number): number => s.hender.reduce((a, h, p) => a + (p === o ? 0 : h.length), 0);
const tapFor = (r: Troresultat, s: GameState, o: number): number => takTap(r.fordeling, s, o, handkort(s, o), 1e-12).tap;
const skjulteKort = (s: GameState, o: number): number[] => s.hender.flatMap((h, p) => (p === o ? [] : h.map(kortTilInt)));

/** Bytter alle kort `sete` ikke kan se i hele loggen med en fast permutasjon, og det skjulte ellers. */
function byttSkjult(logg: readonly Loggpost[], i: number, sete: number, frø: number): Loggpost[] {
  const nå = logg[i]!.s;
  const bv = nå.budvinner;
  const synlig = new Set<number>();
  for (const k of logg[0]!.s.hender[sete]!) synlig.add(kortTilInt(k));
  for (const st of nå.historikk) for (const kp of st.kort) synlig.add(kortTilInt(kp.kort));
  for (const kp of nå.bord) synlig.add(kortTilInt(kp.kort));
  if (bv === sete) {
    for (const k of logg[0]!.s.talong) synlig.add(kortTilInt(k));
    for (const k of nå.vrak) synlig.add(kortTilInt(k));
  }
  const H = [...Array(52).keys()].filter((c) => !synlig.has(c));
  const perm = H.slice();
  const rng = lagRng(frø);
  for (let j = perm.length - 1; j > 0; j--) {
    const r = Math.floor(rng() * (j + 1));
    [perm[j], perm[r]] = [perm[r]!, perm[j]!];
  }
  const σ = new Map(H.map((c, j) => [c, perm[j]!] as const));
  const k = (x: Kort): Kort => intTilKort(σ.get(kortTilInt(x)) ?? kortTilInt(x));
  const st = (s: GameState): GameState => ({
    ...s,
    frø: (s.frø ^ 0x5a5a5a5a) >>> 0,
    hender: s.hender.map((h, p) => (p === sete ? h : h.map(k))),
    talong: s.talong.map(k),
    vrak: bv === sete ? s.vrak : s.vrak.map(k),
    makker: s.makkerAvslørt || s.makker === null ? s.makker : (s.makker + 1) % 4,
  });
  const hd = (h: Handling): Handling => (h.type === "VRAK" && bv !== sete ? { ...h, kort: h.kort.map(k) } : h);
  return logg.map((p, j) => (j <= i ? { s: st(p.s), h: hd(p.h) } : p));
}

test("K2: alle skjulte kort, makker og frø byttet — den eksakte posterioren er bit-identisk; klarsynsfella blir tatt", () => {
  let prøvd = 0;
  let bvPrøvd = 0;
  let fellaTatt = 0;
  let ulikeHender = 0;
  let usikre = 0;
  for (const [r, logg] of RUNDER.entries()) {
    const valgt = stillinger(logg, 10, 10);
    for (const x of [valgt.find((y) => !y.bv), valgt.find((y) => y.bv)]) {
      if (x === undefined) continue;
      const fasit = eksakt(logg, x.i, x.sete);
      assert.ok(fasit.r !== undefined && fasit.r !== null, "ingen eksakt posterior i stikk 10");
      if (fasit.r.fordeling.some((rad) => rad.some((p) => p > 0 && p < 1))) usikre++;
      const byttet = byttSkjult(logg, x.i, x.sete, 91 + r);
      if (JSON.stringify(byttet.map((p) => p.s.hender)) !== JSON.stringify(logg.map((p) => p.s.hender))) ulikeHender++;
      assert.deepEqual(eksakt(byttet, x.i, x.sete), fasit, `K2: sete ${x.sete} (budvinner: ${x.bv}) fikk en annen posterior med andre skjulte kort`);
      const felle = eksakt(logg, x.i, x.sete, { felleKlarsyn: true });
      const felleByttet = eksakt(byttet, x.i, x.sete, { felleKlarsyn: true });
      if (JSON.stringify(felle) !== JSON.stringify(felleByttet)) fellaTatt++;
      prøvd++;
      if (x.bv) bvPrøvd++;
    }
  }
  assert.ok(bvPrøvd >= 1 && prøvd - bvPrøvd >= 1, `for få stillinger: ${prøvd} (budvinner ${bvPrøvd})`);
  assert.ok(ulikeHender > 0, "byttet endret ingen hender — prøven er tom");
  assert.ok(usikre > 0, "alle posteriorene var sikre — da kan ingen lekkasje synes");
  assert.equal(fellaTatt, prøvd, "klarsynsfella ga samme fordeling med byttede kort — K2-prøven kan ikke feile");
});

test("kontrollen: den sanne given er forenlig i hver stilling; to spilte kort i byttede seter er det ikke", () => {
  let sanne = 0;
  let falske = 0;
  for (const logg of RUNDER) {
    for (const x of stillinger(logg, 2, 10).filter((_, j) => j % 5 === 0)) {
      // Grense 0: bare oppsettet, ingen telling.
      const fl = new NaabartTro(x.sete, { partikler: 0, eksaktGrense: 0, agenter: ferske() });
      assert.equal(fl.eksaktTro(logg.slice(0, x.i), logg[x.i]!.s).r, undefined);
      const nå = logg[x.i]!.s;
      const sann = sannPlassering(logg[0]!.s, x.sete, nå.budvinner);
      assert.ok(fl.forenlig(sann), `den sanne given er ikke forenlig (stikk ${nå.stikkSpilt}, sete ${x.sete}) — replayet gjenskaper ikke policyene`);
      sanne++;
      // To kort spilt av to ulike andre seter bytter plass i given: festingen MÅ ta det.
      const andre = nå.historikk.flatMap((st) => st.kort).filter((kp) => kp.spiller !== x.sete && kp.spiller !== nå.budvinner);
      const a = andre[0];
      const d = andre.find((kp) => kp.spiller !== a?.spiller);
      if (a === undefined || d === undefined) continue;
      const feil = sann.slice();
      feil[kortTilInt(a.kort)] = d.spiller;
      feil[kortTilInt(d.kort)] = a.spiller;
      assert.equal(fl.forenlig(feil), false, "en giv med to spilte kort i feil sete ble godtatt");
      falske++;
    }
  }
  assert.ok(sanne >= 6 && falske >= 3, `for få: ${sanne} sanne, ${falske} falske`);
});

/**
 * PRØVENS EGEN POSTERIOR, uavhengig av tellingen: hver plassering av de skjulte kortene gir en hel
 * giv; runden spilles om igjen fra start med FERSKE agenter og de loggede handlingene, og given
 * teller hvis hvert annet sete gjør det loggen sier. Bare for budvinneren (talong og vrak kjent).
 */
function eksaktVedOmspilling(logg: readonly Loggpost[], i: number, o: number): { n: number; fordeling: number[][] } {
  const nå = logg[i]!.s;
  const skjulte: { c: number; sete: number }[] = [];
  for (let p = 0; p < 4; p++) if (p !== o) for (const k of nå.hender[p]!) skjulte.push({ c: kortTilInt(k), sete: p });
  const plasser = skjulte.map((x) => x.sete);
  const f = Array.from({ length: 52 }, () => [0, 0, 0, 0]);
  let n = 0;
  const perm = (a: number[], k: number, ut: number[][]): void => {
    if (k === a.length) return void ut.push(a.slice());
    for (let j = k; j < a.length; j++) {
      [a[k], a[j]] = [a[j]!, a[k]!];
      perm(a, k + 1, ut);
      [a[k], a[j]] = [a[j]!, a[k]!];
    }
  };
  const alle: number[][] = [];
  perm(plasser.slice(), 0, alle);
  const sett = new Set(alle.map((x) => x.join(",")));
  for (const nøkkel of sett) {
    const tildelt = nøkkel.split(",").map(Number);
    // Opprinnelige hender: det spilt fram til nå, pluss det tildelte.
    const start = logg[0]!.s;
    const hender: Kort[][] = start.hender.map((h, p) => (p === o ? h.slice() : []));
    for (const st of nå.historikk) for (const kp of st.kort) if (kp.spiller !== o) hender[kp.spiller]!.push(kp.kort);
    for (const kp of nå.bord) if (kp.spiller !== o) hender[kp.spiller]!.push(kp.kort);
    skjulte.forEach((x, j) => hender[tildelt[j]!]!.push(intTilKort(x.c)));
    const ag = ferske();
    let s: GameState = { ...start, hender };
    let ok = true;
    for (let j = 0; j < i && ok; j++) {
      const { h } = logg[j]!;
      const aktør = iTurFor(s);
      if (aktør !== o && h.type !== "NESTE") ok = handlingNøkkel(ag[aktør]!.velgHandling(s)) === handlingNøkkel(h);
      if (ok) s = utfør(s, h).state;
    }
    if (!ok) continue;
    n++;
    skjulte.forEach((x, j) => f[x.c]![(tildelt[j]! - o + 4) % 4 - 1]!++);
  }
  return { n, fordeling: f.map((r) => r.map((x) => (n === 0 ? 0 : x / n))) };
}

test("SISTE STIKK: faktorisert = full omspilling = naiv telling, og sikker med ett kort igjen; fellene blir tatt", () => {
  let omspilt = 0;
  let naivt = 0;
  let sikre = 0;
  let blindAvvik = 0;
  let rotertTatt = 0;
  for (const logg of RUNDER) {
    const a = logg.findIndex((p) => p.s.fase === "SPILL" && p.s.stikkSpilt === 10 && p.s.iTur === p.s.budvinner && p.s.bord.length <= 1);
    if (a >= 0) {
      const s = logg[a]!.s;
      const o = s.budvinner!;
      const fasit = eksaktVedOmspilling(logg, a, o);
      assert.ok(fasit.n >= 1, "den sanne given ble ikke gjenskapt av omspillingen");
      const r = eksakt(logg, a, o).r;
      assert.ok(r !== undefined && r !== null && r.eksakt, "stillingen ble ikke talt eksakt");
      assert.equal(r.n, fasit.n, "ulikt antall forenlige giver");
      for (const c of skjulteKort(s, o)) assert.deepEqual(r.fordeling[c], fasit.fordeling[c], "den eksakte fordelingen avviker fra omspillingen");
      // FELLE: den policy-blinde tellingen er en annen posterior, og likhetsprøven skal se det.
      const blind = eksakt(logg, a, o, { regel: true }).r!;
      if (blind.n !== fasit.n || skjulteKort(s, o).some((c) => JSON.stringify(blind.fordeling[c]) !== JSON.stringify(fasit.fordeling[c]))) blindAvvik++;
      omspilt++;
    }
    const b = logg.findIndex((p) => p.s.fase === "SPILL" && p.s.stikkSpilt === 11 && p.s.iTur !== p.s.budvinner && p.s.bord.length >= 1);
    if (b >= 0) {
      const o = logg[b]!.s.iTur!;
      const f = eksakt(logg, b, o).r;
      const nv = eksakt(logg, b, o, { telling: "naiv" }).r;
      assert.ok(f && nv, "ingen eksakt posterior i stikk 11");
      assert.equal(f.n, nv.n, "faktorisert og naiv telling fant ulikt antall giver (talongene inkludert)");
      assert.deepEqual(f.fordeling, nv.fordeling, "faktorisert og naiv telling ga ulik fordeling");
      naivt++;
    }
    const c = logg.findIndex((p) => p.s.fase === "SPILL" && p.s.stikkSpilt === 11 && p.s.bord.length === 2);
    if (c >= 0) {
      const s = logg[c]!.s;
      const o = s.iTur!;
      const r = eksakt(logg, c, o).r;
      assert.ok(r, "ingen eksakt posterior med ett kort igjen");
      assert.equal(handkort(s, o), 1);
      assert.equal(tapFor(r, s, o), 0, "ett skjult kort igjen på hendene skal gi log-tap 0");
      // FELLE: samme sikkerhet med setene rotert skal koste — scoringen kan se feil sete.
      const rotert: Troresultat = { ...r, fordeling: r.fordeling.map(([x, y, z, d]) => [z!, x!, y!, d!]) };
      if (tapFor(rotert, s, o) > 1) rotertTatt++;
      sikre++;
    }
  }
  assert.ok(omspilt >= 2 && naivt >= 2 && sikre >= 2, `for få: omspilt ${omspilt}, naivt ${naivt}, sikre ${sikre}`);
  assert.ok(blindAvvik >= 1, "den policy-blinde posterioren var lik omspillingen overalt — likhetsprøven kan ikke skille");
  assert.equal(rotertTatt, sikre, "rotert sikkerhet ga ikke tap — sikkerhetsprøven kan ikke feile");
});

test("policyene er verdt noe: den policy-bevisste posterioren taper ikke mot den policy-blinde; feil policyer blir tatt", () => {
  const pos = RUNDER.flatMap((logg) =>
    [8, 9, 10].flatMap((stikk) => {
      const i = logg.findIndex((p) => p.s.fase === "SPILL" && p.s.stikkSpilt === stikk && p.s.iTur === p.s.budvinner);
      return i < 0 ? [] : [{ logg, i, s: logg[i]!.s, o: logg[i]!.s.iTur! }];
    }),
  );
  assert.ok(pos.length >= 6, `for få budvinnerstillinger: ${pos.length}`);
  const blind = pos.map((x) => {
    const r = eksakt(x.logg, x.i, x.o, { regel: true }).r;
    assert.ok(r, "den policy-blinde tellingen fant ingen giv");
    return r;
  });
  const tapBlind = pos.reduce((a, x, j) => a + tapFor(blind[j]!, x.s, x.o) * handkort(x.s, x.o), 0);
  /** Samlet tap (per kort, summert over stillingene) med agentene `lag` for bordet; ingen giv = gulvet 1e-12. */
  const vurder = (lag: () => Spekagent[], sjekkSann: boolean) => {
    let tap = 0;
    let færre = 0;
    pos.forEach((x, j) => {
      const fl = new NaabartTro(x.o, { partikler: 0, eksaktGrense: 1e6, agenter: lag() });
      const r = fl.eksaktTro(x.logg.slice(0, x.i), x.s).r;
      assert.notEqual(r, undefined);
      if (sjekkSann) assert.ok(fl.forenlig(sannPlassering(x.logg[0]!.s, x.o, x.s.budvinner)), "den sanne given er uforenlig");
      if (r === null || r === undefined) {
        tap += -Math.log(1e-12) * handkort(x.s, x.o);
        return;
      }
      // Policyer velger bare lovlige handlinger: støtten er en delmengde av den regelforenlige.
      assert.ok(r.n <= blind[j]!.n, "flere policyforenlige enn regelforenlige giver");
      for (const c of skjulteKort(x.s, x.o)) for (let k = 0; k < 3; k++) if (r.fordeling[c]![k]! > 0) assert.ok(blind[j]!.fordeling[c]![k]! > 0, "masse utenfor den regelforenlige støtten");
      if (r.n < blind[j]!.n) færre++;
      tap += tapFor(r, x.s, x.o) * handkort(x.s, x.o);
    });
    return { tap, færre };
  };
  const riktig = vurder(() => ferske(), true);
  assert.ok(riktig.tap <= tapBlind, `den policy-bevisste posterioren tapte mot den blinde: ${riktig.tap.toFixed(3)} > ${tapBlind.toFixed(3)}`);
  assert.ok(riktig.færre >= 1, "policyene utelukket ingen giv noe sted — sammenlikningen er tom");
  // FELLE: feil policyer for bordet (ADAMS_MAALT) skal gi en posterior som taper mot den blinde.
  const feil = vurder(() => ferske(ADAMS_MAALT), false);
  assert.ok(feil.tap > tapBlind, `fella slapp unna: feil policyer ${feil.tap.toFixed(3)} ≤ blind ${tapBlind.toFixed(3)}`);
});

test("SMC-dommen: andelene er brøkene, og et tak lik nettet er 100 % av veien", () => {
  const rader = (nett: number, tak: number): K8TakRad[] =>
    [0, 1, 2, 3, 4, 5].map((i) => ({ frø: i, gulv: LN3, nett: nett + (i % 2 ? 0.01 : -0.01), tak100: tak + (i % 2 ? 0.01 : -0.01), sann_ok: 1 }));
  const d = domK8Tak(rader(LN3 - 0.3, LN3 - 0.6), 100);
  assert.ok(Math.abs(d.andelRettferdig.snitt - 0.5) < 1e-9);
  assert.ok(Math.abs(d.andelPerfekt.snitt - 0.3 / LN3) < 1e-9);
  assert.ok(Math.abs(domK8Tak(rader(0.7, 0.7), 100).andelRettferdig.snitt - 1) < 1e-9, "tak = nett skal gi 100 %");
  assert.ok(domK8Tak(rader(0.7, 0.4), 100).andelRettferdig.snitt < domK8Tak(rader(0.7, 0.6), 100).andelRettferdig.snitt, "et strengere tak skal gi lavere andel");
  assert.equal(domK8Tak([...rader(0.7, 0.4), { frø: 9, gulv: LN3, nett: 0.7, sann_ok: 0, tak100: null }], 100).kollaps, 1);
});

test("dommen per stikk: udekkede stillinger telles, men er aldri i andelene; tak = nett er 100 %", () => {
  const skj = (f: number): number => (f % 2 ? 0.01 : -0.01);
  const rad = (frø: number, stikk: number, nett: number, eksakt: number | null): K8TakRad => ({ frø, stikk, gulv: LN3, nett, eksakt, erBv: frø % 2, sann_ok: 1 });
  const rader: K8TakRad[] = [
    ...[0, 1, 2, 3].map((f) => rad(f, 8, LN3 - 0.3 + skj(f), LN3 - 0.6 + skj(f))),
    // Udekket (over grensen): nettet ser mye bedre ut her, og skal ikke telle i andelene.
    ...[0, 1, 2, 3].map((f) => rad(f, 8, 0.1, null)),
    ...[0, 1].map((f) => rad(f, 9, 0.7, 0.7)),
    // Et tak der den sanne given var uforenlig: telles og flagges, men er aldri dekket.
    { ...rad(5, 9, 0.2, 0), sann_ok: 0 },
  ];
  const d = domPerStikk(rader);
  const s8 = d.find((x) => x.stikk === 8)!;
  const s9 = d.find((x) => x.stikk === 9)!;
  const alle = d.find((x) => x.stikk === null)!;
  assert.equal(s8.n, 8);
  assert.equal(s8.dekket, 4);
  assert.ok(Math.abs(s8.nettAlle - (4 * (LN3 - 0.3) + 0.4) / 8) < 1e-9, "nett(alle) skal ta med de udekkede");
  assert.ok(Math.abs(s8.rettferdig.snitt - 0.5) < 1e-9, "(ln 3 − nett) / (ln 3 − tak) over de dekkede");
  assert.ok(Math.abs(s8.perfekt.snitt - 0.3 / LN3) < 1e-9);
  assert.equal(s9.dekket, 2, "raden med uforenlig sann giv ble regnet som dekket");
  assert.equal(s9.sannBrudd, 1);
  assert.ok(Math.abs(s9.rettferdig.snitt - 1) < 1e-9, "tak = nett skal gi 100 % (og raden med sann_ok 0 er ikke med)");
  assert.equal(alle.n, 11);
  assert.equal(alle.dekket, 6);
  assert.equal(domPerStikk(rader, (r) => r["erBv"] === 1).find((x) => x.stikk === null)!.n, 6);
  // FELLE: hadde de udekkede radene fått et tak, ville andelen i stikk 8 flyttet seg.
  const lekk = domPerStikk(rader.map((r) => (r["eksakt"] === null ? { ...r, eksakt: 0.05 } : r))).find((x) => x.stikk === 8)!;
  assert.ok(Math.abs(lekk.rettferdig.snitt - 0.5) > 0.05, "fella: udekkede rader med tak ga samme andel — prøven ser ikke en lekkasje");
});

test("parvis før/etter: forskjellen uten kampvariansen, udekkede rader bare i d tap; lekkasjefella blir tatt", () => {
  // Nivået varierer mye mellom kampene, forskjellen er fast: parvis SE skal være 0 der nivåets SE ikke er det.
  const rader: K8TakRad[] = [];
  for (let f = 0; f < 6; f++) {
    const før = LN3 - 0.1 - 0.05 * f;
    rader.push({ frø: f, stikk: 8, gulv: LN3, nett: før, nett_ny: før - 0.06, eksakt: LN3 - 0.6, erBv: 1, rolle: 0, sann_ok: 1 });
    // Udekket (over grensen): det nye nettet er VERRE her. Skal synes i d tap, aldri i d rettferdig.
    rader.push({ frø: f, stikk: 3, gulv: LN3, nett: 1.0, nett_ny: 1.3, eksakt: null, erBv: 1, rolle: 0, sann_ok: 1 });
  }
  // Uforenlig sann giv: aldri dekket.
  rader.push({ frø: 9, stikk: 8, gulv: LN3, nett: 0.5, nett_ny: 0.0, eksakt: 0.1, erBv: 1, rolle: 0, sann_ok: 0 });
  const alle = domParvis(rader, "nett", "nett_ny").find((d) => d.stikk === null)!;
  assert.equal(alle.dekket, 6);
  assert.ok(Math.abs(alle.dRettferdig.snitt - 0.1) < 1e-9, `d rettferdig ${alle.dRettferdig.snitt}, ventet 0,06 / 0,6`);
  assert.ok(alle.dRettferdig.se < 1e-9, `parvis SE ${alle.dRettferdig.se} med fast forskjell`);
  assert.ok(Math.abs(alle.dNettAlle.snitt - (6 * -0.06 + 6 * 0.3 - 0.5) / 13) < 1e-9, `d tap ${alle.dNettAlle.snitt}`);
  const nivå = domPerStikk(rader).find((d) => d.stikk === 8)!;
  assert.ok(nivå.rettferdig.se > 0.01, `nivåets SE ${nivå.rettferdig.se} — da viser prøven ikke at parvis betyr noe`);
  // FELLE: hadde de udekkede radene fått et tak, ville d rettferdig flyttet seg.
  const lekk = domParvis(rader.map((r) => (r["eksakt"] === null ? { ...r, eksakt: 0.2 } : r)), "nett", "nett_ny").find((d) => d.stikk === null)!;
  assert.ok(Math.abs(lekk.dRettferdig.snitt - 0.1) > 0.02, "fella: udekkede rader med tak ga samme d rettferdig — prøven ser ikke en lekkasje");
});
