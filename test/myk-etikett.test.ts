/**
 * MYKE TROETIKETTER — prøver for `examples/myk-etikett.ts`, `examples/mlb-trodata.ts --myk` og de nye
 * veiene i `verktoy/mlb-tro-tren.py` (versjon 2, myk kryssentropi, rollevekt). 12. sep, agent R.
 *
 * Hver prøve har en felle som MÅ bli tatt:
 *
 *   1. K2. Alle kort setet ikke kan se byttes (hender i hver post, talong, vrak og VRAK-handlingen for en
 *      ikke-budvinner), en ikke-avslørt makker og frøet — den myke etiketten er bit-identisk, og porten
 *      (kontrollen) endrer den ikke. FELLE: én-hot-etiketten (`troFasit`) i de samme stillingene endrer seg.
 *   2. KLASSENE. Kolonnesummene er nøyaktig håndstørrelsene per relativt sete (og talongen for en
 *      ikke-budvinner, 0 for budvinneren), og der etiketten er sikker, er den sanne klassen den sikre.
 *      FELLE: kolonnene rotert bryter kolonnesummene der håndstørrelsene er ulike.
 *   3. FILA. `--myk` skriver versjon 2; rollefeltet er rollen i trekkene (184 budvinner / 280 makker) i
 *      hver rad; myke rader summerer til 1 nøyaktig på de usette kortene og har masse på den sanne
 *      klassen; ingen uforenlige med speken. FELLE: en rolle avledet bare av budvinneren (makker =
 *      motspiller) er uenig med feltet.
 *   4. TRENEREN (python med torch; ellers hoppet over med grunn, sett `AMB_PY`). Tapet på fila er det TS
 *      regner med samme nett: myk kryssentropi der etiketten er myk, én-hot ellers, rolle- og myk-vekt
 *      ganget inn per rad; `--etikett hard` er én-hot overalt. FELLE: myk og hard referanse skiller seg
 *      med mye mer enn toleransen, så en trener som ignorerte etiketten ville feilet.
 *
 * Små tall med vilje: CPU-en deles med treningsløkka. Første runde i prøve 1–2, så agentene har ingen
 * sessionstilstand; prøve 3 spiller én kamp med skyggeagenter.
 */

import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { lagRng, type Kort } from "../src/kort.ts";
import { intTilKort, kortTilInt } from "../src/solver/dds.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { troFasit } from "../src/mlb/fasit.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import { kanoniskAgent, type Loggpost } from "../examples/naabart-tro.ts";
import { MykEtiketter, rolleAv } from "../examples/myk-etikett.ts";

const ROT = fileURLToPath(new URL("..", import.meta.url));
const MAPPE = `_test-myk-etikett-${process.pid}`;
const SPEK = "okt:vr:e1-modell/vrak-3.bin:telrd:profil:budq:e1-modell/budq-3.bin:vakt:abmp:e1:e1-modell/kort-3.bin";
const ferske = () => [0, 1, 2, 3].map(() => kanoniskAgent(lagIndre(SPEK)));
const iTurFor = (s: GameState): number => (s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!);

before(() => mkdirSync(`${ROT}/${MAPPE}`, { recursive: true }));
after(() => rmSync(`${ROT}/${MAPPE}`, { recursive: true, force: true }));

/** Én runde spilt av speken (kanonisk): loggen med én post per handling. Som i `naabart-tro.test.ts`. */
function runde(frø: number): Loggpost[] {
  const ag = ferske();
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  const logg: Loggpost[] = [];
  while (s.fase !== "RUNDE_SLUTT" && s.fase !== "FERDIG") {
    const h = ag[iTurFor(s)]!.velgHandling(s);
    logg.push({ s, h });
    s = utfør(s, h).state;
    if (s.rundeNr !== logg[0]!.s.rundeNr) logg.length = 0;
  }
  return logg;
}

const RUNDER = [runde(7_720_001), runde(7_720_002), runde(7_720_003)];

/**
 * Bytter alle kort `sete` ikke kan se, i hele loggen fram til `i`, med en fast permutasjon. Samme bytte som
 * `byttSkjult` i `naabart-tro.test.ts` (skrevet av igjen: en prøve importerer ikke en annen prøve).
 */
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

/** Stillinger i SPILL i stikkene [fra, til]. */
function stillinger(logg: readonly Loggpost[], fra: number, til: number) {
  return logg.flatMap((p, i) => (p.s.fase === "SPILL" && p.s.stikkSpilt >= fra && p.s.stikkSpilt <= til ? [{ i, sete: p.s.iTur!, bv: p.s.iTur === p.s.budvinner }] : []));
}

const etikett = (logg: readonly Loggpost[], i: number, sete: number, kontroll = true) =>
  new MykEtiketter(ferske(), 1e6, kontroll).etikett(logg.slice(0, i), logg[i]!.s, sete, troFasit(logg[i]!.s, sete));

test("K2: alle skjulte kort, makker og frø byttet — den myke etiketten er bit-identisk; én-hot-fella blir tatt", () => {
  let prøvd = 0;
  let bvPrøvd = 0;
  let usikre = 0;
  let fellaTatt = 0;
  for (const [r, logg] of RUNDER.entries()) {
    const valgt = stillinger(logg, 9, 10);
    for (const x of [valgt.find((y) => !y.bv), valgt.find((y) => y.bv)]) {
      if (x === undefined) continue;
      const fasit = etikett(logg, x.i, x.sete);
      assert.equal(fasit.utfall, "myk", `stikk ${logg[x.i]!.s.stikkSpilt}: ${fasit.utfall}`);
      // Porten endrer ikke etiketten.
      const utenPort = etikett(logg, x.i, x.sete, false);
      assert.deepEqual(utenPort.p, fasit.p, "kontrollen endret etiketten");
      if (fasit.p!.some((v) => v > 0 && v < 1)) usikre++;
      const byttet = byttSkjult(logg, x.i, x.sete, 91 + r);
      const annen = etikett(byttet, x.i, x.sete, false);
      assert.equal(annen.utfall, "myk");
      assert.deepEqual(annen.p, fasit.p, `K2: sete ${x.sete} (budvinner: ${x.bv}) fikk en annen myk etikett med andre skjulte kort`);
      // FELLE: én-hot-etiketten leser hendene og SKAL endre seg.
      if (JSON.stringify([...troFasit(logg[x.i]!.s, x.sete)]) !== JSON.stringify([...troFasit(byttet[x.i]!.s, x.sete)])) fellaTatt++;
      prøvd++;
      if (x.bv) bvPrøvd++;
    }
  }
  assert.ok(bvPrøvd >= 1 && prøvd - bvPrøvd >= 1, `for få stillinger: ${prøvd} (budvinner ${bvPrøvd})`);
  assert.ok(usikre > 0, "alle etikettene var sikre — da kan ingen lekkasje synes");
  assert.equal(fellaTatt, prøvd, "én-hot-etiketten var lik med byttede kort — K2-prøven kan ikke feile");
});

test("klassene: kolonnesummene er håndstørrelsene (og talongen), sikre kort har den sanne klassen; rotert-fella blir tatt", () => {
  let sjekket = 0;
  let sikre = 0;
  let rotertTatt = 0;
  let uliketall = 0;
  for (const logg of RUNDER) {
    for (const x of stillinger(logg, 8, 11)) {
      const s = logg[x.i]!.s;
      const e = etikett(logg, x.i, x.sete);
      if (e.utfall !== "myk") continue;
      const p = e.p!;
      const f = troFasit(s, x.sete);
      const sum = (col: readonly number[], k: number): number => [...Array(52).keys()].reduce((a, c) => a + col[c * 4 + k]!, 0);
      const venter = [1, 2, 3].map((r) => s.hender[(x.sete + r) % 4]!.length);
      const død = x.bv ? 0 : s.vrak.length;
      const avvik = (col: readonly number[]): number => Math.max(...venter.map((v, k) => Math.abs(sum(col, k) - v)), Math.abs(sum(col, 3) - død));
      assert.ok(avvik([...p]) < 1e-4, `kolonnesummene ${[0, 1, 2, 3].map((k) => sum([...p], k).toFixed(3))} er ikke ${venter} | ${død}`);
      for (let c = 0; c < 52; c++) {
        for (let k = 0; k < 4; k++) {
          if (p[c * 4 + k] === 1) {
            assert.equal(f[c], k + 1, `kort ${c} er sikkert i klasse ${k + 1}, men lå i ${f[c]}`);
            sikre++;
          }
        }
      }
      // FELLE: kolonnene rotert (rel sete 1 → 2 → 3 → 1) skal bryte summene der håndstørrelsene er ulike.
      if (new Set(venter).size > 1) {
        uliketall++;
        const rotert = [...p];
        for (let c = 0; c < 52; c++) [rotert[c * 4 + 1], rotert[c * 4 + 2], rotert[c * 4]] = [p[c * 4]!, p[c * 4 + 1]!, p[c * 4 + 2]!];
        if (avvik(rotert) > 0.5) rotertTatt++;
      }
      sjekket++;
    }
  }
  assert.ok(sjekket >= 12 && sikre >= 1 && uliketall >= 3, `for få: ${sjekket} etiketter, ${sikre} sikre kort, ${uliketall} med ulike håndstørrelser`);
  assert.equal(rotertTatt, uliketall, "roterte kolonner ga samme kolonnesummer — klasseprøven kan ikke feile");
});

// ---------------------------------------------------------------------------
// FILA OG TRENEREN
// ---------------------------------------------------------------------------

interface Rad2 {
  t: Float32Array;
  f: Int8Array;
  stikk: number;
  sete: number;
  rolle: number;
  myk: number;
  p: Float32Array;
}

function lesV2(sti: string): { versjon: number; dim: number; rader: Rad2[] } {
  const b = readFileSync(sti);
  assert.equal(b.toString("ascii", 0, 4), "MLBT");
  const versjon = b.readInt32LE(4);
  const dim = b.readInt32LE(8);
  const post = dim * 4 + 52 + 8 + 2 + 208 * 4;
  assert.equal((b.length - 12) % post, 0, `fila er ikke et helt antall versjon 2-poster à ${post} byte`);
  const rader: Rad2[] = [];
  for (let o = 12; o < b.length; o += post) {
    const t = new Float32Array(dim);
    for (let i = 0; i < dim; i++) t[i] = b.readFloatLE(o + i * 4);
    const q = o + dim * 4;
    const f = new Int8Array(52);
    for (let i = 0; i < 52; i++) f[i] = b.readInt8(q + i);
    const p = new Float32Array(208);
    for (let i = 0; i < 208; i++) p[i] = b.readFloatLE(q + 62 + i * 4);
    rader.push({ t, f, stikk: b.readInt16LE(q + 56), sete: b.readInt16LE(q + 58), rolle: b.readInt8(q + 60), myk: b.readUInt8(q + 61), p });
  }
  return { versjon, dim, rader };
}

const FIL = `${ROT}/${MAPPE}/myk.bin`;
let generert: { status: number | null; tekst: string } | null = null;
function generer(): { status: number | null; tekst: string } {
  if (generert === null) {
    const r = spawnSync(
      process.execPath,
      ["examples/mlb-trodata.ts", "--kamp", "--hukommelse", "--signal", "--sanser2", "--myk", "--spek", SPEK, "--kamper", "1", "--maksrunder", "2", "--sjanse", "1", "--ut", `${MAPPE}/myk.bin`],
      { cwd: ROT, encoding: "utf8", timeout: 900_000 },
    );
    generert = { status: r.status, tekst: `${r.stdout}\n${r.stderr}` };
  }
  return generert;
}

test("--myk: versjon 2, rollefeltet er trekkenes rolle, myke rader er fordelinger på de usette kortene; rollefella blir tatt", () => {
  const g = generer();
  assert.equal(g.status, 0, g.tekst);
  const { versjon, dim, rader } = lesV2(FIL);
  assert.equal(versjon, 2);
  assert.equal(dim, 996);
  const trekkRolle = (t: Float32Array): number => (t[184] === 1 ? 0 : t[280] === 1 ? 1 : 2);
  for (const [i, r] of rader.entries()) assert.equal(r.rolle, trekkRolle(r.t), `rad ${i}: rollefeltet ${r.rolle}, trekkene sier ${trekkRolle(r.t)}`);
  assert.ok([0, 1, 2].every((x) => rader.some((r) => r.rolle === x)), `ikke alle roller finnes: ${[0, 1, 2].map((x) => rader.filter((r) => r.rolle === x).length)}`);
  // FELLE: rollen avledet av budvinneren alene kaller makkeren motspiller.
  assert.ok(rader.some((r) => (r.t[184] === 1 ? 0 : 2) !== r.rolle), "en rolle uten makker var enig med feltet — rolleprøven kan ikke feile");

  const myke = rader.filter((r) => r.myk === 1);
  assert.ok(myke.length >= 8, `bare ${myke.length} myke rader`);
  assert.ok(myke.every((r) => r.stikk >= 7), "en myk rad før stikk 7 — grensen 1e6 skulle ikke nådd dit");
  let usikre = 0;
  for (const r of rader) {
    for (let c = 0; c < 52; c++) {
      const s = r.p[c * 4]! + r.p[c * 4 + 1]! + r.p[c * 4 + 2]! + r.p[c * 4 + 3]!;
      if (r.myk === 0) assert.equal(s, 0, "en rad uten myk etikett har masse");
      else if (r.f[c]! > 0) {
        assert.ok(Math.abs(s - 1) < 1e-5, `usett kort ${c} summerer til ${s}`);
        assert.ok(r.p[c * 4 + r.f[c]! - 1]! > 0, "den sanne klassen har ingen masse");
        if (r.p[c * 4 + r.f[c]! - 1]! < 1) usikre++;
      } else assert.equal(s, 0, `sett kort ${c} har masse`);
    }
  }
  assert.ok(usikre > 0, "alle myke etiketter var sikre");
  const dekning = JSON.parse(readFileSync(`${FIL}.myk.json`, "utf8")) as { myk: number; uforenlig: number; tom: number; rader: number };
  assert.equal(dekning.myk, myke.length, "dekningsfila og fila er uenige om antall myke rader");
  assert.equal(dekning.rader, rader.length);
  assert.equal(dekning.uforenlig + dekning.tom, 0, "den sanne given var uforenlig med den kanoniske speken");
});

function finnPython(): string | null {
  const kandidater = [process.env.AMB_PY, "python", "python3"].filter((x): x is string => typeof x === "string" && x !== "");
  for (const k of kandidater) {
    const r = spawnSync(k, ["-c", "import torch, numpy"], { encoding: "utf8", timeout: 180_000 });
    if (r.status === 0) return k;
  }
  return null;
}
const PY = finnPython();
const UTEN_PY = PY === null ? "fant ingen python med torch og numpy (sett AMB_PY)" : existsSync(`${ROT}/e1-modell/tro-3.bin`) ? false : "e1-modell/tro-3.bin mangler";

test("treneren: tapet er myk kryssentropi der etiketten er myk, én-hot ellers, med rolle- og myk-vekt; hard-fella blir tatt", { skip: UTEN_PY }, () => {
  const g = generer();
  assert.equal(g.status, 0, g.tekst);
  const { rader } = lesV2(FIL);
  const nett = MlbTronett.fraBytes(new Uint8Array(readFileSync(`${ROT}/e1-modell/tro-3.bin`)));
  const q = rader.map((r) => nett.fordeling(r.t));
  const referanse = (myk: boolean, mykVekt: number, rolleVekt: readonly number[]): number => {
    let sum = 0;
    let vekt = 0;
    rader.forEach((r, i) => {
      const brukMyk = myk && r.myk === 1;
      const w = rolleVekt[r.rolle]! * (brukMyk ? mykVekt : 1);
      for (let c = 0; c < 52; c++) {
        const k = r.f[c]!;
        if (k <= 0) continue;
        const qc = q[i]![c]!;
        const tap = brukMyk ? -[0, 1, 2, 3].reduce((a, j) => a + (r.p[c * 4 + j]! > 0 ? r.p[c * 4 + j]! * Math.log(qc[j]!) : 0), 0) : -Math.log(qc[k - 1]!);
        sum += w * tap;
        vekt += w;
      }
    });
    return sum / vekt;
  };
  const python = (ekstra: readonly string[]): number => {
    const r = spawnSync(PY!, ["verktoy/mlb-tro-tren.py", "--tren", FIL, "--vekter", "e1-modell/tro-3.bin", "--bare-tap", ...ekstra], { cwd: ROT, encoding: "utf8", timeout: 600_000 });
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    const m = /^TRO-TAP ([\d.]+)$/m.exec(r.stdout);
    assert.ok(m !== null, r.stdout);
    return Number(m[1]);
  };
  // Trekkene lagres som fp16 i treneren: toleransen er for avrundingen, fellene under er mange ganger større.
  // MYK-VEKT 25: over alle radene skilte myk og hard bare 0,0012 (de myke radene er sene stikk med få usette
  // kort); med vekten dominerer de myke radene snittet, og `--etikett hard` skal da IGNORERE vekten.
  const TOL = 2e-4;
  const myk = referanse(true, 25, [1, 1, 1]);
  const hard = referanse(false, 1, [1, 1, 1]);
  const vektet = referanse(true, 25, [3, 1, 0.5]);
  assert.ok(Math.abs(myk - hard) > 10 * TOL, `FELLE: myk ${myk} og hard ${hard} referanse er for like — prøven kan ikke skille etikettene`);
  assert.ok(Math.abs(vektet - myk) > 10 * TOL, `FELLE: vektet ${vektet} og uvektet ${myk} er for like — prøven kan ikke se rollevekten`);
  const pMyk = python(["--myk-vekt", "25"]);
  const pHard = python(["--etikett", "hard", "--myk-vekt", "25"]);
  const pVektet = python(["--myk-vekt", "25", "--rolle-vekt", "3,1,0.5"]);
  assert.ok(Math.abs(pMyk - myk) < TOL, `myk: python ${pMyk}, TS ${myk} (hard ville vært ${hard})`);
  assert.ok(Math.abs(pHard - hard) < TOL, `--etikett hard: python ${pHard}, TS ${hard}`);
  assert.ok(Math.abs(pVektet - vektet) < TOL, `vektet: python ${pVektet}, TS ${vektet}`);
});

test("rolleAv: budvinner 0, makker 1, ellers 2 — og makkeren er den som holder det etterlyste kortet", () => {
  let makkere = 0;
  for (const logg of RUNDER) {
    const s = logg.find((p) => p.s.fase === "SPILL")!.s;
    for (let sete = 0; sete < 4; sete++) {
      const r = rolleAv(s, sete);
      if (sete === s.budvinner) assert.equal(r, 0);
      else if (s.etterlyst !== null && s.melding?.type !== "solo" && s.hender[sete]!.some((k) => k.farge === s.etterlyst!.farge && k.verdi === s.etterlyst!.verdi)) {
        assert.equal(r, 1, `sete ${sete} holder det etterlyste kortet`);
        makkere++;
      } else assert.equal(r, 2);
    }
  }
  assert.ok(makkere >= 1, "ingen makker i prøverundene — prøven prøver ikke makkerrollen");
});
