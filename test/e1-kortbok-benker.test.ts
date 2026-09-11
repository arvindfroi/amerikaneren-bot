/**
 * KORTNETTET MED MOTSTANDERBOK PÅ BENKENE (12. sep): bryteren `e1:<fil>h0`, K4/K6-nullarmen og
 * `observer` hele veien ned til kortlaget.
 *
 * `src/e1/kortbok.ts` kaster når en runde passerer uten å bli vist som `RUNDE_SLUTT`. Det gjør et
 * glemt kall HØYLYTT på benkene som spiller flere runder — men bare om kallet når fram gjennom hvert
 * lag, og bare om nullarmene faktisk skrur av boka. Ingenting her krasjer når det er feil: en nullarm
 * som bærer boka gir pene tall, og et nullutvidet nett spiller likt med og uten bok. Derfor bruker
 * prøvene FELLENETTET (én bokkolonne koblet til en skjult enhet, 0 i runde 0), som endrer valg så
 * snart boka er fylt:
 *
 *   H0          `e1:<493>h0` har bokblokken null i hver stilling og resten bit-lik nettet med full
 *               bok; trenger ingen `observer`; h0 på et 273-nett kaster. FELLE: fellenettet uten h0
 *               avviker etter runde 0 gjennom `vakt:abmp:`, med h0 aldri.
 *   UTENMINNE   helbotens nullarm får `e1:<fil>h0` bare for bokbredden; 273-strengen er den gamle.
 *   K4-NULLARM  `prøveA` (samme kode som batteriet) på nullarmen av en helbot med fellenettet: 0
 *               avvik. FELLE: samme avledning uten kortbryteren avviker.
 *   LAGENE      hvert lag over `vakt:abmp:e1:<493>` spiller runde 1 med `observer` på det ytterste
 *               objektet. FELLE: en kappe uten `observer` kaster.
 *   K6          `stakkLeserHukommelse` ser et bokbredt kortnett, og en arm uten tikk kaster ikke.
 *   SOK-VERDENER  `--kamp` med fellenettet i driverne: rader lik 273 i runde 0, ulike etter — boka
 *               når driverne. Nullutvidet: alle rader lik 273-radene.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeKort } from "../src/motor.ts";
import { ADAMS_MAALT, lagIndre, type Spekagent } from "../src/moe2/agentspek.ts";
import { LEDD_NAVN } from "../src/mlb/hukommelse.ts";
import { E1Agent } from "../src/e1/agent.ts";
import { E1_KORT_BOK_DIM, KORTBOK_FRA, STILLING_FRA } from "../src/e1/kortbok.ts";
import { nettFraBytes, type NevroNett } from "../src/nevro/nett.ts";
import { kortnettLeserMinne, utenMinne } from "../examples/spek-lag.ts";
import { prøveA } from "../examples/k4-hukommelse.ts";
import { ARMER, spillKamp, stakkLeserHukommelse } from "../examples/k6-vaner.ts";

const ROT = fileURLToPath(new URL("..", import.meta.url));
/** Relativ til ROT, uten kolon (speken deler på kolon), ignorert av git (`/_*`), per prosess. */
const MAPPE = `_test-kortbok-benker-${process.pid}`;
const KORT273 = "e1-modell/kort-3.bin";
const NULL493 = `${MAPPE}/null493.bin`;
const FELLE493 = `${MAPPE}/felle493.bin`;
const FILER = [KORT273, "e1-modell/vrak-3.bin", "e1-modell/budq-3.bin", "e1-modell/tro-3.bin", "e1-modell/bud-vant.json"];
const mangler = FILER.filter((f) => !existsSync(`${ROT}/${f}`));
const hopp = mangler.length > 0 ? `mangler ${mangler.join(", ")} (e1-modell er ikke sporet)` : false;

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

/** Første lag utvidet med nullkolonner BAKERST — det `sd-tren.py --vekter` gjør (som e1-kortbok.test.ts). */
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

before(() => {
  if (hopp !== false) return;
  mkdirSync(`${ROT}/${MAPPE}`, { recursive: true });
  const n273 = nettFraBytes(new Uint8Array(readFileSync(`${ROT}/${KORT273}`)))[0]!;
  writeFileSync(`${ROT}/${NULL493}`, tilBytes(nullutvid(n273, E1_KORT_BOK_DIM)));
  writeFileSync(`${ROT}/${FELLE493}`, tilBytes(fellenett(nullutvid(n273, E1_KORT_BOK_DIM))));
});
after(() => rmSync(`${ROT}/${MAPPE}`, { recursive: true, force: true }));

const iTurFor = (s: GameState): number | null | undefined => (s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur);

/**
 * Spiller runder med `seter` og viser `lyttere` hver virkelige tilstand (også RUNDE_SLUTT) når
 * `medObserver`. `besøk` ser hver tilstand før trekket.
 */
function spill(
  seter: readonly Spekagent[],
  frø: number,
  runder: number,
  medObserver: boolean,
  besøk: (s: GameState) => void = () => {},
): GameState {
  for (const a of seter) a.nyKamp();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, frø);
  for (let vakt = 0; s.fase !== "FERDIG" && s.rundeNr < runder && vakt < 20_000; vakt++) {
    if (medObserver) for (const a of new Set(seter)) a.observer?.(s);
    besøk(s);
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const i = iTurFor(s);
    if (i === null || i === undefined) break;
    s = utfør(s, seter[i]!.velgHandling(s)).state;
  }
  return s;
}

/** Fire likt bygde agenter per spek; A spiller kampen, B spørres i de samme stillingene. */
function spillMed(spekA: string, spekB: string, runder: number, frø: number): { likeKortvalg: number; ulike: number[] } {
  const a = [0, 1, 2, 3].map(() => lagIndre(spekA));
  const b = [0, 1, 2, 3].map(() => lagIndre(spekB));
  for (const x of [...a, ...b]) x.nyKamp();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, frø);
  const ulike: number[] = [];
  let likeKortvalg = 0;
  for (let vakt = 0; s.fase !== "FERDIG" && s.rundeNr < runder && vakt < 20_000; vakt++) {
    for (const x of [...a, ...b]) x.observer?.(s);
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const sete = iTurFor(s);
    if (sete === null || sete === undefined) break;
    const ha = a[sete]!.velgHandling(s);
    const hb = b[sete]!.velgHandling(s);
    if (JSON.stringify(ha) !== JSON.stringify(hb)) ulike.push(s.rundeNr);
    else if (s.fase === "SPILL" && lovligeKort(s, sete).length >= 2) likeKortvalg++;
    s = utfør(s, ha).state;
  }
  return { likeKortvalg, ulike };
}

// ---------------------------------------------------------------------------
// 1. Bryteren
// ---------------------------------------------------------------------------

test("h0: bokblokken er null i hver stilling og resten bit-lik nettet med full bok; ingen observer trengs; h0 på 273 kaster", { skip: hopp }, () => {
  const full = lagIndre(`e1:${NULL493}`) as unknown as E1Agent;
  const av = lagIndre(`e1:${NULL493}h0`) as unknown as E1Agent;
  assert.equal(full.leserHukommelse, true);
  assert.equal(av.leserHukommelse, false, "h0 skal ikke be driveren om observer");
  const nevro = [0, 1, 2, 3].map(() => lagIndre("nevro"));
  let n = 0;
  let medBok = 0;
  spill(nevro, 6_410_001, 4, false, (s) => {
    full.observer(s);
    if (s.fase !== "SPILL" || s.iTur === null) return;
    const vf = full.trekk(s, s.iTur);
    const va = av.trekk(s, s.iTur);
    if (vf.subarray(KORTBOK_FRA, STILLING_FRA).some((x) => x !== 0)) medBok++;
    assert.ok(va.subarray(KORTBOK_FRA, STILLING_FRA).every((x) => x === 0), `runde ${s.rundeNr}: h0 hadde noe i bokblokken`);
    assert.deepEqual([...va.subarray(0, KORTBOK_FRA)], [...vf.subarray(0, KORTBOK_FRA)]);
    assert.deepEqual([...va.subarray(STILLING_FRA)], [...vf.subarray(STILLING_FRA)], "h0 skal bare nulle boka, ikke sansene");
    n++;
  });
  assert.ok(n >= 100 && medBok >= 50, `oppsettet: ${n} kortvalg, ${medBok} med full bok — h0 er ikke prøvd mot en fylt bok`);

  // Uten observer i tre runder: nullarmen kan spilles av en hvilken som helst driver.
  const blind = [0, 1, 2, 3].map(() => lagIndre(`vakt:abmp:e1:${NULL493}h0`));
  assert.ok(spill(blind, 6_410_002, 3, false).rundeNr >= 2);
  // FELLA for linja over: uten h0 kaster den samme løkka (ellers beviste den ingenting).
  assert.throws(() => spill([0, 1, 2, 3].map(() => lagIndre(`vakt:abmp:e1:${NULL493}`)), 6_410_002, 3, false), /observer er ikke koblet/);

  assert.throws(() => lagIndre(`vakt:abmp:e1:${KORT273}h0`), /h0 skrur av/);
});

test("h0 gjennom speken: fellenettet med h0 spiller som 273 hele veien; FELLE: uten h0 avviker det etter runde 0", { skip: hopp }, () => {
  const med = spillMed(`vakt:abmp:e1:${FELLE493}h0`, `vakt:abmp:e1:${KORT273}`, 4, 6_420_001);
  assert.ok(med.likeKortvalg >= 60, `oppsettet: ${med.likeKortvalg} kortvalg`);
  assert.deepEqual(med.ulike, [], "fellenettet med h0 valgte annerledes enn 273 — boka var ikke skrudd av");
  const uten = spillMed(`vakt:abmp:e1:${FELLE493}`, `vakt:abmp:e1:${KORT273}`, 4, 6_420_001);
  assert.equal(uten.ulike.filter((r) => r === 0).length, 0, "fellenettet avvek i runde 0 — boka var ikke tom");
  assert.ok(uten.ulike.length > 0, "fellenettet uten h0 avvek aldri — prøven over kan ikke se en bok");
});

// ---------------------------------------------------------------------------
// 2. Nullarmen
// ---------------------------------------------------------------------------

const hel = (kort: string): string =>
  `okt:vr:e1-modell/vrak-3.bin:telrd:eks:3Lt2000:profil:sik:alle:0.5:24k32e3LMD~mlbu=e1-modell/tro-3.bin:budq:e1-modell/budq-3.bin:vakt:abmp:e1:${kort}`;

test("utenMinne: kortnettet får h0 bare på bokbredden; 273-helboten gir strengen fra før; idempotent; leseren alene avgjør", { skip: hopp }, () => {
  const gammel = "vr:e1-modell/vrak-3.bin:telrd:eks:3Lt2000:sik:alle:0.5:24k32e3LD:budq:e1-modell/budq-3.binh0:vakt:abmp:e1:";
  assert.equal(utenMinne(hel(KORT273)), `${gammel}${KORT273}`, "273-nullarmen er ikke lenger den gamle strengen");
  assert.equal(utenMinne(hel(NULL493)), `${gammel}${NULL493}h0`);
  assert.equal(utenMinne(utenMinne(hel(NULL493))), utenMinne(hel(NULL493)), "h0h0");
  // FELLA: en leser som sier «ingen bok» lar kortlaget stå — h0 kommer fra bredden og ingenting annet.
  assert.equal(utenMinne(hel(NULL493), undefined, undefined, () => false), `${gammel}${NULL493}`);
  assert.equal(kortnettLeserMinne(KORT273), false);
  assert.equal(kortnettLeserMinne(NULL493), true);
  assert.equal(kortnettLeserMinne(`${NULL493}h0`), true);
  // Sanseblokken (`@<tro>`) har ingen bokvariant og røres ikke.
  assert.equal(utenMinne(`vakt:abmp:e1:${NULL493}@x.bin`, () => false, () => false, () => true), `vakt:abmp:e1:${NULL493}@x.bin`);
  assert.doesNotThrow(() => lagIndre(utenMinne(hel(NULL493))));
});

test("K4-nullarmen: prøveA på nullarmen av en helbot med fellenettet gir 0 avvik; FELLE: uten kortbryteren avviker den", { skip: hopp }, () => {
  // Helboten uten søk (samme lag som løkkas POL): prøveA er deterministisk da, så et avvik er hukommelse.
  const spek = `okt:vr:e1-modell/vrak-3.bin:telrd:profil:budq:e1-modell/budq-3.bin:vakt:abmp:e1:${FELLE493}`;
  const nul = utenMinne(spek);
  const utenBryter = utenMinne(spek, undefined, undefined, () => false);
  assert.equal(nul, `vr:e1-modell/vrak-3.bin:telrd:budq:e1-modell/budq-3.binh0:vakt:abmp:e1:${FELLE493}h0`);
  const felles = { medØkt: false, giv: 2, frøBase: 4_430_000, målRunde: 2, tikk: true, observerTikk: true } as const;
  const m = prøveA({ ...felles, spek: nul });
  assert.ok(m.n >= 20, `oppsettet: bare ${m.n} beslutninger i målrunden`);
  assert.equal(m.avvik, 0, `nullarmen med h0 avvek: ${m.eksempler.join("; ")}`);
  const f = prøveA({ ...felles, spek: utenBryter });
  assert.equal(f.n, m.n);
  assert.ok(f.avvik > 0, "nullarmen UTEN kortbryteren avvek ikke — K4-kontrollen kan ikke se kortboka");
});

// ---------------------------------------------------------------------------
// 3. observer hele veien ned
// ---------------------------------------------------------------------------

test("lagene: hvert lag over vakt:abmp:e1:<493> når kortlaget med observer i runde 1; FELLE: en kappe uten observer kaster", { skip: hopp }, () => {
  const kjerne = `vakt:abmp:e1:${NULL493}`;
  const lag = [
    "okt:",
    "vr:e1-modell/vrak-3.bin:telrd:",
    "eks:3Lt2000:",
    "profil:",
    "sik:alle:0.5:2k2:",
    "budq:e1-modell/budq-3.bin:",
    "budm:e1-modell/bud-vant.json@-3.0:",
    "etl:1:",
    "juks:6:",
    "vv:2:",
    // Tre felt (spek-lag.ts FELT): verdener, flagg og et tredje parseren hopper over.
    "vv2:2:telrd:0:",
    "ork:foerer:2:",
  ];
  const nevro = (): Spekagent[] => [1, 2, 3].map(() => lagIndre("nevro"));
  for (const l of lag) {
    const s = spill([lagIndre(`${l}${kjerne}`), ...nevro()], 6_430_001, 2, true);
    assert.ok(s.rundeNr >= 1, `«${l}»: nådde bare runde ${s.rundeNr}`);
  }
  // Helbotens form, alle lag på en gang (søket billig).
  assert.ok(spill([lagIndre(`okt:vr:e1-modell/vrak-3.bin:telrd:eks:3Lt2000:profil:sik:alle:0.5:2k2:budq:e1-modell/budq-3.bin:${kjerne}`), ...nevro()], 6_430_002, 2, true).rundeNr >= 1);
  // FELLA: en kappe som bare har velgHandling/nyKamp (som `vaneSete` i k4-hukommelse) — kortlaget ser aldri runden slutte.
  const indre = lagIndre(kjerne);
  const kappe: Spekagent = { nyKamp: () => indre.nyKamp(), velgHandling: (x) => indre.velgHandling(x) };
  assert.throws(() => spill([kappe, ...nevro()], 6_430_001, 2, true), /observer er ikke koblet/);
});

test("K6: stakkLeserHukommelse ser et bokbredt kortnett (ikke h0, ikke 273), og armen uten tikk spiller det gjennom runder", { skip: hopp }, () => {
  assert.equal(stakkLeserHukommelse(`vakt:abmp:e1:${NULL493}`), true);
  assert.equal(stakkLeserHukommelse(`okt:vr:e1-modell/vrak-3.bin:telrd:profil:vakt:abmp:e1:${NULL493}`), true);
  assert.equal(stakkLeserHukommelse(`vakt:abmp:e1:${NULL493}h0`), false);
  assert.equal(stakkLeserHukommelse(`vakt:abmp:e1:${KORT273}`), false);
  assert.equal(stakkLeserHukommelse(ADAMS_MAALT), false);
  const utenTikk = ARMER.find((a) => !a.tikk && !a.medØkt)!;
  const rader = spillKamp(utenTikk, "noytral", 6_440_001, 0, { målPoeng: 100, maksRunder: 3, adams: `vakt:abmp:e1:${NULL493}`, basis: ADAMS_MAALT });
  assert.ok(rader.length >= 2, `bare ${rader.length} runder`);
});

test("sok-verdener --kamp: nullutvidet 493 i driverne gir 273-radene; FELLE: fellenettet endrer radene bare etter runde 0", { skip: hopp }, () => {
  const kjør = (kort: string): Record<string, unknown>[] => {
    const ut = `${MAPPE}/sokv-${kort.replace(/[^a-z0-9]/gi, "_")}.jsonl`;
    const r = spawnSync(
      process.execPath,
      [
        "examples/sok-verdener.ts", "--kamp", "--giver", "1", "--verdener", "2", "--sjanse", "1", "--fra-runde", "0",
        "--armer", "app|3|1|-", "--drivere", `vakt:abmp:e1:${kort}`, "--ut", ut,
      ],
      { cwd: ROT, encoding: "utf8" },
    );
    assert.equal(r.status, 0, `sok-verdener med ${kort}\n${r.stdout}\n${r.stderr}`);
    return readFileSync(`${ROT}/${ut}`, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .map((x) => Object.fromEntries(Object.entries(x).filter(([k]) => !k.endsWith("_ms"))));
  };
  const a = kjør(KORT273);
  const b = kjør(NULL493);
  const c = kjør(FELLE493);
  assert.ok(a.some((x) => (x.runde as number) >= 2) && a.length >= 40, `oppsettet: ${a.length} rader`);
  assert.deepEqual(b, a, "et nullutvidet kortnett i driverne ga andre rader enn 273");
  const runde0 = (x: Record<string, unknown>[]) => x.filter((y) => y.runde === 0);
  assert.deepEqual(runde0(c), runde0(a), "fellenettet endret runde 0 — boka var ikke tom");
  assert.notDeepEqual(c, a, "fellenettet endret ingen rad — boka når ikke driverne (observer mangler)");
});
