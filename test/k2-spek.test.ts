/**
 * K2 FOR EN VILKÅRLIG SPEK — prøver for `examples/k2-spek.ts` og `examples/spek-lag.ts`.
 *
 * Tre ting må holde, og de er ikke de samme:
 *
 *   1. Verktøyet VIRKER: en søkende spek prøves i alle fire faser uten avvik.
 *   2. Verktøyet KAN FEILE: juks:6 og den plantede jukseren blir tatt, og en agent
 *      som ikke er en funksjon av tilstanden gir STUM, ikke grønn.
 *   3. Strengoperasjonene bygger den boten de sier: «uten søk» søker ikke, også når
 *      søket står midt i kjeden — der `utenSøk` fra agentspek.ts ikke rører det.
 *
 * Små tall med vilje: CPU-en deles med treningen.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { ADAMS_MAALT, ADAMS_V7, lagIndre, utenSøk } from "../src/moe2/agentspek.ts";
import {
  dømK2,
  lagJukser,
  prøvInvarians,
  slåSammenK2,
  tomtFunn,
  velgBeslutning,
  type K2Opts,
  type K2Rapport,
} from "../examples/k2-spek.ts";
import { delLag, harSøk, settSammen, søketro, utenMinne, utenSøkOveralt } from "../examples/spek-lag.ts";

const HELBOT =
  "okt:vr:e1-modell/vrakrang.bin:telrd:eks:3Lt2000:profil:sik:alle:0.5:24k32e3L~mlbu=e1-modell/mlb-tro-signal.bin:" +
  "budq:e1-modell/budq-s4a.bin:vakt:abmp:e1:e1-modell/d7alle.bin";

const SØKER = `sik:alle:0.5:3:${ADAMS_MAALT}`;

const OPTS: K2Opts = {
  giver: 3,
  verdener: 2,
  fraStikk: 0,
  tilStikk: 99,
  faser: ["bud", "vrak", "velg", "spill"],
  perGiv: 1,
  frøBase: 6_600_000,
  drivere: ADAMS_MAALT,
};

// ===========================================================================
// spek-lag
// ===========================================================================

test("spek-lag: delLag og settSammen er hverandres omvendte, og ukjente lag KASTER", () => {
  for (const s of [HELBOT, ADAMS_MAALT, ADAMS_V7, SØKER, "nevro", "mlb:tilfeldig7h0~t.bin"]) {
    assert.equal(settSammen(delLag(s)), s, `rundturen endret «${s}»`);
  }
  assert.throws(() => delLag("nytt:lag:e1:x.bin"), /Ukjent lag/, "et ukjent lag må kaste, ellers står det igjen i nullarmen");
});

test("spek-lag: «uten søk» fjerner søket MIDT i kjeden — der agentspek sin utenSøk ikke gjør det", () => {
  assert.equal(
    utenSøk(HELBOT),
    HELBOT,
    "utenSøk stripper bare ytterst; blir dette ulikt, kan kommentaren i spek-lag.ts skrives om",
  );
  const base = utenSøkOveralt(HELBOT);
  assert.equal(
    base,
    "okt:vr:e1-modell/vrakrang.bin:telrd:profil:budq:e1-modell/budq-s4a.bin:vakt:abmp:e1:e1-modell/d7alle.bin",
  );
  assert.equal(harSøk(HELBOT), true);
  assert.equal(harSøk(base), false);
  // Budsøket i budm er et søk; kampfeltet bak det skal stå.
  assert.equal(
    utenSøkOveralt("budm:e1-modell/bud-vant.json@-3.0/0.6/0/-3.0/0/sok12k8b0.5/kamp1.5:vakt:abmpf:e1:e1-modell/d7alle.bin"),
    "budm:e1-modell/bud-vant.json@-3.0/0.6/0/-3.0/0//kamp1.5:vakt:abmpf:e1:e1-modell/d7alle.bin",
  );
  assert.equal(utenSøkOveralt("e1s:e1-modell/d7alle.bin"), "e1:e1-modell/d7alle.bin");
  // Og det som kommer ut, bygger.
  for (const s of [base, utenSøkOveralt(ADAMS_V7)]) assert.equal(typeof lagIndre(s).velgHandling, "function");
});

test("spek-lag: «uten minne» tar økt, profil, h0 og en søketro som LESER boka — og bare den", () => {
  assert.equal(
    utenMinne(HELBOT, () => true),
    "vr:e1-modell/vrakrang.bin:telrd:eks:3Lt2000:sik:alle:0.5:24k32e3L:budq:e1-modell/budq-s4a.bin:vakt:abmp:e1:e1-modell/d7alle.bin",
  );
  assert.equal(
    utenMinne(HELBOT, () => false),
    "vr:e1-modell/vrakrang.bin:telrd:eks:3Lt2000:sik:alle:0.5:24k32e3L~mlbu=e1-modell/mlb-tro-signal.bin:budq:e1-modell/budq-s4a.bin:vakt:abmp:e1:e1-modell/d7alle.bin",
  );
  assert.equal(utenMinne("mlb:tilfeldig7~t.bin", () => false), "mlb:tilfeldig7h0~t.bin", "h0 må stå FØR tilden");
  assert.deepEqual(søketro(HELBOT), { art: "mlbu", sti: "e1-modell/mlb-tro-signal.bin", verdener: 24, kandidater: 32 });
});

// ===========================================================================
// Verktøyet virker
// ===========================================================================

test("K2-spek: en SØKENDE spek prøves i alle fire faser, deterministisk og uten avvik", () => {
  const r = prøvInvarians(OPTS, () => lagIndre(SØKER));
  for (const f of OPTS.faser) {
    assert.ok(r[f].prøvd > 0, `${f}: aldri prøvd — et grønt tall på null stillinger beviser ingenting`);
    assert.ok(r[f].sammenliknet > 0, `${f}: ingen verdenssammenlikninger`);
    assert.equal(r[f].ikkeDeterministisk, 0, `${f}: fersk agent med fast frø skal gi samme svar to ganger`);
    assert.deepEqual(r[f].eksempler, [], `${f}: JUKS eller lekkasje:\n${r[f].eksempler.join("\n")}`);
  }
});

// ===========================================================================
// Verktøyet kan feile
// ===========================================================================

test("K2-spek KAN FEILE: juks:6 tas i sent spill", () => {
  const juks = prøvInvarians(
    { ...OPTS, giver: 4, verdener: 3, perGiv: 3, faser: ["spill"], fraStikk: 7 },
    () => lagIndre(`juks:6:${ADAMS_MAALT}`),
  ).spill;
  assert.ok(juks.prøvd >= 4, `juks:6 fikk bare ${juks.prøvd} stillinger`);
  assert.ok(juks.avvik > 0, "en agent som SER alle hender ble ikke tatt — prøven måler ingenting i sent spill");
});

test("K2-spek KAN FEILE: den plantede jukseren tas i HVER fase", () => {
  const r = prøvInvarians({ ...OPTS, giver: 6, verdener: 4, perGiv: 3 }, () => lagJukser(lagIndre(ADAMS_MAALT)));
  for (const f of OPTS.faser) {
    assert.ok(r[f].avvik > 0, `${f}: en agent som leser naboens hånd ble IKKE tatt (${r[f].prøvd} stillinger)`);
  }
});

test("K2-spek: en agent som IKKE er en funksjon av tilstanden gir stum, aldri grønn", () => {
  /**
   * DEN FELLA PRØVEN ER BYGD FOR Å UNNGÅ: én vedvarende søkeagent i stedet for en fersk.
   * RNG-en går framover mellom kallene, og uten determinismesjekken ville støyen blitt
   * talt som «juks» — eller, verre, et heldig utvalg som «ærlig».
   */
  const delt = lagIndre(`sik:alle:0:2:${ADAMS_MAALT}`);
  const r = prøvInvarians({ ...OPTS, faser: ["spill"], perGiv: 4, giver: 2 }, () => delt);
  assert.ok(r.spill.ikkeDeterministisk > 0, "en delt søkeagent ga samme svar hver gang — sjekken fyrer ikke");
  const rapport: K2Rapport = {
    spek: "delt",
    base: ADAMS_MAALT,
    drivere: ADAMS_MAALT,
    opts: { giver: 2, verdener: 2, fraStikk: 0, tilStikk: 99, faser: ["spill"], perGiv: 4, frøBase: 0, skard: "0/1" },
    faser: { bud: tomtFunn(), vrak: tomtFunn(), velg: tomtFunn(), spill: { ...r.spill, avvik: 0, eksempler: [] } },
    kontroll: { juks6: { ...tomtFunn(), avvik: 1 }, plantet: { bud: tomtFunn(), vrak: tomtFunn(), velg: tomtFunn(), spill: { ...tomtFunn(), avvik: 1 } } },
    sekunder: 0,
  };
  assert.equal(dømK2(rapport).dom, "stum");
});

test("K2-spek: VELG må prøves med VRAK først — ellers måles en annen beslutning", () => {
  /**
   * `Vrakrangerer` lagrer trumfen i VRAK. En fersk agent spurt rett i VELG faller
   * gjennom til det indre laget. Finner denne prøven INGEN forskjell, er forspillet
   * ikke nødvendig lenger og kommentaren i k2-spek.ts skal skrives om.
   */
  let ulike = 0;
  let sett = 0;
  // Målt: 9 av 80 VRAK-stillinger gir en annen VELG uten forspillet, den første i giv 13.
  for (let g = 0; g < 40 && ulike === 0; g++) {
    const drivere = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 6_600_000 + g * 4271);
    let vakt = 0;
    while (s.fase !== "RUNDE_SLUTT" && s.fase !== "FERDIG" && s.fase !== "SPILL" && vakt++ < 100) {
      const h = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
      if (s.fase === "VRAK") {
        sett++;
        if (velgBeslutning(() => lagIndre(ADAMS_MAALT), s, true) !== velgBeslutning(() => lagIndre(ADAMS_MAALT), s, false)) ulike++;
      }
      s = utfør(s, drivere[h]!.velgHandling(s)).state;
    }
  }
  assert.ok(sett > 0, "ingen VRAK-stillinger funnet");
  assert.ok(ulike > 0, `forspillet endret aldri VELG i ${sett} stillinger`);
});

// ===========================================================================
// Dommen
// ===========================================================================

test("dømK2: ett avvik er nei, en uprøvd fase er stum, kontrollarmer som slapp unna er stum", () => {
  const funn = (avvik: number, prøvd = 2) => ({ ...tomtFunn(), prøvd, sammenliknet: prøvd * 2, avvik });
  const grunn: K2Rapport = {
    spek: "x",
    base: "x",
    drivere: "x",
    opts: { giver: 1, verdener: 2, fraStikk: 0, tilStikk: 99, faser: ["bud", "spill"], perGiv: 1, frøBase: 0, skard: "0/1" },
    faser: { bud: funn(0), vrak: tomtFunn(), velg: tomtFunn(), spill: funn(0) },
    kontroll: { juks6: funn(3), plantet: { bud: funn(1), vrak: tomtFunn(), velg: tomtFunn(), spill: funn(2) } },
    sekunder: 0,
  };
  assert.equal(dømK2(grunn).dom, "ja");
  assert.equal(dømK2({ ...grunn, faser: { ...grunn.faser, spill: funn(1) } }).dom, "nei");
  assert.equal(dømK2({ ...grunn, faser: { ...grunn.faser, bud: funn(0, 0) } }).dom, "stum");
  assert.equal(dømK2({ ...grunn, kontroll: { ...grunn.kontroll!, juks6: funn(0) } }).dom, "stum");
  assert.equal(dømK2({ ...grunn, kontroll: null }).dom, "stum");
  // Skivene summeres, og fasene er unionen.
  const sent: K2Rapport = { ...grunn, opts: { ...grunn.opts, faser: ["spill"] }, kontroll: null };
  const s = slåSammenK2([grunn, sent]);
  assert.equal(s.faser.spill.prøvd, 4);
  assert.deepEqual([...s.opts.faser], ["bud", "spill"]);
});
