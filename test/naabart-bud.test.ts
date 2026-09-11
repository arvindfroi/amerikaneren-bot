/**
 * DET NÅBARE BUDTAKET — prøver for `examples/naabart-bud.ts` og `tak-kart.ts --naabart/--mot-spek`.
 *
 * Tre ting må holde, og hver har en felle som MÅ bli tatt:
 *
 *   1. K2. Taket er en funksjon av det setet ser: bytt de skjulte hendene (`trekkVerdener` +
 *      `medVerden`, som `k2-spek.ts`) eller det skjulte frøet, og VERDIENE står — ikke bare
 *      argmax. FELLE A: et «nåbart» tak som spiller ut i de EKTE hendene. FELLE B: et som lar
 *      frøet stå i verdenene og dermed ser neste giv når alle passer. Den siste ser K2-byttet
 *      av hender aldri; derfor egne stillinger der tre har passet.
 *   2. KRAFT. En budgiver som alltid passer har et nåbart gap > 2 SE, og budduellen (`--mot-spek`)
 *      ser at Adams slår den med > 2 SE. Ellers kan K3.1-porten ikke feile.
 *   3. PARING. W = 0 og `--mot-spek` lik `--spek` gir eksakt 0 på hver rad, og en rad der budet
 *      ikke ble byttet har eksakt 0 også når W > 0.
 *
 * Små tall med vilje: CPU-en deles med treningen. Rollouts med `ADAMS_MAALT` (ingen søk).
 */

import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { lovligeHandlinger, opprettSpill, utfør, type GameState } from "../src/index.ts";
import { PASS, type Bud } from "../src/regler.ts";
import { lagRng } from "../src/kort.ts";
import { kortTilInt } from "../src/solver/dds.ts";
import { ADAMS_MAALT, lagIndre } from "../src/moe2/agentspek.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { naabartBud, type NaabartOpts } from "../examples/naabart-bud.ts";
import { klyngeSnitt } from "../examples/klynge.ts";
import { medBudlag } from "../examples/spek-lag.ts";

const ferske = () => [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
const OPTS: NaabartOpts = { verdener: 3, kandidater: 4, agenter: ferske() };
/** Samme bot, men budlaget passer alltid: terskelen 99 kan ingen EV nå (se `Budagent`). */
const PASSER = medBudlag(ADAMS_MAALT, "budm:e1-modell/bud-vant.json@99");

function policy(s: GameState): Bud {
  const h = lagIndre(ADAMS_MAALT).velgHandling(s);
  assert.equal(h.type, "BUD");
  return (h as { bud: Bud }).bud;
}

/** Budstillinger med minst to lovlige bud, spilt fram av ADAMS_MAALT; høyst `perGiv` per giv. */
function budstillinger(giver: number, frøBase: number, perGiv: number): { s: GameState; sete: number }[] {
  const ut: { s: GameState; sete: number }[] = [];
  for (let g = 0; g < giver; g++) {
    const drivere = ferske();
    let s = opprettSpill({ antallSpillere: 4 }, frøBase + g * 4271);
    let tatt = 0;
    let vakt = 0;
    while (s.fase === "BUDRUNDE" && vakt++ < 40) {
      const sete = s.iTur!;
      const lov = lovligeHandlinger(s);
      if (tatt < perGiv && lov.fase === "BUDRUNDE" && lov.bud.length >= 2) {
        ut.push({ s, sete });
        tatt++;
      }
      s = utfør(s, drivere[sete]!.velgHandling(s)).state;
    }
  }
  return ut;
}

const STILLINGER = budstillinger(3, 6_610_000, 2);

test("naabartBud K2: bytt de skjulte hendene eller frøet — verdiene og budet står", () => {
  let sammenliknet = 0;
  let ulikeHender = 0;
  let skiller = 0;
  for (const [k, { s, sete }] of STILLINGER.entries()) {
    const pol = policy(s);
    const fasit = naabartBud(s, sete, pol, OPTS);
    assert.ok(fasit.n > 0, "ingen verden ble spilt ut");
    assert.deepEqual(naabartBud(s, sete, pol, { ...OPTS, agenter: ferske() }), fasit, "ferske agenter ga andre verdier — utspillingen er ikke en funksjon av stillingen");
    if (new Set(fasit.verdier.map((v) => v.snitt)).size > 1) skiller++;
    for (const hender of trekkVerdener(s, sete, 3, lagRng(4_400 + k), undefined, undefined, 4)) {
      const s2 = medVerden(s, hender, sete);
      if (JSON.stringify(s2.hender) !== JSON.stringify(s.hender)) ulikeHender++;
      sammenliknet++;
      assert.deepEqual(naabartBud(s2, sete, pol, OPTS), fasit, `K2: sete ${sete} i giv ${s.frø} fikk andre verdier med andre skjulte hender`);
    }
    assert.deepEqual(naabartBud({ ...s, frø: (s.frø ^ 0x5a5a5a5a) >>> 0 }, sete, pol, OPTS), fasit, "K2: det skjulte frøet endret verdiene");
  }
  assert.ok(STILLINGER.length >= 4, `bare ${STILLINGER.length} stillinger`);
  assert.ok(ulikeHender > 0 && sammenliknet > 0, "ingen verden byttet hendene — prøven er tom");
  assert.ok(skiller > 0, "alle bud fikk samme verdi overalt — da beviser invariansen ingenting");
});

test("FELLE A: et «nåbart» tak som spiller ut i de ekte hendene blir tatt av K2-byttet", () => {
  const klarsyn: NaabartOpts = { ...OPTS, verdenerFor: (st) => [st.hender.map((h) => h.map(kortTilInt))] };
  let avvik = 0;
  for (const [k, { s, sete }] of STILLINGER.entries()) {
    const pol = policy(s);
    const fasit = naabartBud(s, sete, pol, klarsyn);
    for (const hender of trekkVerdener(s, sete, 2, lagRng(5_500 + k), undefined, undefined, 4)) {
      if (JSON.stringify(naabartBud(medVerden(s, hender, sete), sete, pol, klarsyn)) !== JSON.stringify(fasit)) avvik++;
    }
  }
  assert.ok(avvik > 0, "klarsynstaket ga samme verdier i alle forenlige verdener — K2-prøven kan ikke feile");
});

test("FELLE B: et tak som lar frøet stå ser neste giv når alle passer — og det vaskede gjør ikke", () => {
  let fellaSer = 0;
  for (let i = 0; i < 3; i++) {
    let s = opprettSpill({ antallSpillere: 4 }, 6_620_000 + i * 4271);
    for (let p = 0; p < 3; p++) s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: PASS }).state;
    assert.equal(s.fase, "BUDRUNDE");
    const sete = s.iTur!;
    const pol = policy(s);
    const annet = { ...s, frø: (s.frø + 1_000_003) >>> 0 };
    assert.deepEqual(naabartBud(annet, sete, pol, OPTS), naabartBud(s, sete, pol, OPTS), "det vaskede taket leste frøet");
    const uvasket: NaabartOpts = { ...OPTS, vaskFrø: false };
    if (JSON.stringify(naabartBud(annet, sete, pol, uvasket)) !== JSON.stringify(naabartBud(s, sete, pol, uvasket))) fellaSer++;
  }
  assert.ok(fellaSer > 0, "et tak med det ekte frøet ga samme pass-verdi for ulike frø — fella tester ingenting");
});

// ===========================================================================
// tak-kart.ts
// ===========================================================================

const dir = mkdtempSync(join(tmpdir(), "naabart-"));

function kart(navn: string, args: readonly string[]): { status: number | null; stderr: string; rader: Record<string, unknown>[] } {
  const ut = join(dir, `${navn}.jsonl`);
  // `arg` i tak-kart.ts tar FØRSTE forekomst: et eget `--fase` må derfor ikke få et «bud» foran seg.
  const fase = args.includes("--fase") ? [] : ["--fase", "bud"];
  const r = spawnSync(process.execPath, ["examples/tak-kart.ts", ...fase, "--uten-tak", "--ut", ut, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let tekst = "";
  try {
    tekst = readFileSync(ut, "utf8");
  } catch {
    /* ingen rader */
  }
  return { status: r.status, stderr: r.stderr, rader: tekst.split("\n").filter((l) => l !== "").map((l) => JSON.parse(l) as Record<string, unknown>) };
}

test("tak-kart: W = 0 og --mot-spek lik --spek gir eksakt 0 på hver rad; --naabart utenfor budvinduet kaster", () => {
  const k = kart("null", ["--giver", "2", "--spek", ADAMS_MAALT, "--naabart", "0", "--mot-spek", ADAMS_MAALT]);
  assert.equal(k.status, 0, k.stderr);
  assert.ok(k.rader.length > 0);
  for (const r of k.rader) {
    assert.equal(r["tak"], null);
    assert.equal(r["diffNaabart"], 0, "W = 0 byttet et bud eller brøt paringen");
    assert.equal(r["naabartEndret"], 0);
    assert.equal(r["diffMot"], 0, "samme spek i duellen ga et annet utfall — paringen holder ikke");
    assert.equal(r["motLik"], true);
  }
  assert.notEqual(kart("vrak", ["--giver", "1", "--spek", ADAMS_MAALT, "--naabart", "2", "--fase", "vrak"]).status, 0);
});

/**
 * FELLA PÅ BOTEN UTEN SØK, IKKE PÅ ADAMS_MAALT — målt 11. sep. Ved et ADAMS_MAALT-bord var
 * passeren IKKE signifikant dårligere, verken mot det nåbare taket (+0,08 ± 1,15, W = 4) eller
 * mot Adams-budet (+0,83 ± 1,22), 16 giv: Adams byr ofte kontrakter som ryker, og da er pass
 * ikke dyrt. Mot helbotens base (budq-1) ved dens eget bord: +3,31 ± 0,66 og +3,38 ± 0,85 på
 * 12 giv, W = 16. Det er batteriets passefelle, og den er valgt her.
 */
const BASE = "okt:vr:e1-modell/vrak-1.bin:telrd:profil:budq:e1-modell/budq-1.bin:vakt:abmp:e1:e1-modell/d7alle.bin";

test("FELLE C: en budgiver som alltid passer har nåbart gap > 2 SE, og boten slår den i duellen > 2 SE", () => {
  const k = kart("passer", [
    "--giver", "12", "--froe", "7700000", "--spek", medBudlag(BASE, "budm:e1-modell/bud-vant.json@99"), "--andre", BASE,
    "--naabart", "16", "--naabart-spek", BASE, "--mot-spek", BASE,
  ]);
  assert.equal(k.status, 0, k.stderr);
  const gap = klyngeSnitt(k.rader, (r) => String(r["frø"]), (r) => r["diffNaabart"] as number);
  const duell = klyngeSnitt(k.rader, (r) => String(r["frø"]), (r) => r["diffMot"] as number);
  assert.ok(gap.snitt > 2 * gap.se, `passeren: nåbart gap ${gap.snitt} ± ${gap.se} — taket har ikke kraft mot en dårlig budgiver`);
  assert.ok(duell.snitt > 2 * duell.se, `bot − passer ${duell.snitt} ± ${duell.se} — duellen ser ikke en dårlig budgiver`);
  const uendret = k.rader.filter((r) => r["naabartEndret"] === 0);
  assert.ok(uendret.length > 0 && uendret.length < k.rader.length, "enten byttet taket alt eller ingenting");
  assert.ok(uendret.every((r) => r["diffNaabart"] === 0), "et uendret bud ga ulikt utfall — paringen holder ikke");
  assert.ok(k.rader.filter((r) => r["motLik"] === true).every((r) => r["diffMot"] === 0), "samme budfølge ga ulikt utfall i duellen");
});

test("medBudlag: bytter budlaget på sin plass, og kaster uten nøyaktig ett", () => {
  const hel =
    "okt:vr:e1-modell/vrak-1.bin:telrd:eks:3Lt2000:profil:sik:alle:0.5:24k32e3LMD~mlbu=e1-modell/tro-1.bin:budq:e1-modell/budq-1.bin:vakt:abmp:e1:e1-modell/d7alle.bin";
  assert.equal(
    medBudlag(hel, "budm:e1-modell/bud-vant.json@-3.0"),
    "okt:vr:e1-modell/vrak-1.bin:telrd:eks:3Lt2000:profil:sik:alle:0.5:24k32e3LMD~mlbu=e1-modell/tro-1.bin:budm:e1-modell/bud-vant.json@-3.0:vakt:abmp:e1:e1-modell/d7alle.bin",
  );
  assert.equal(medBudlag(PASSER, "budm:e1-modell/bud-vant.json@-3.0"), ADAMS_MAALT, "rundturen endret speken");
  assert.throws(() => medBudlag("vakt:abmp:e1:e1-modell/d7alle.bin", "budq:x.bin"), /budlag/);
  assert.throws(() => medBudlag(ADAMS_MAALT, "vakt:abmp"), /ikke ett budlag/);
});
