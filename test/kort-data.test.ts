/**
 * KORT-DATA — kortnettets etiketter fra søket i den hele boten (`examples/kort-data.ts`, 11. sep).
 *
 * Ingenting her krasjer når det er feil: en etikett som kikker skriver like pene rader, en lytter som
 * flytter et valg spiller like hele kamper, og en trener som laster vektene skjevt skriver en like pen
 * fil. Hver prøve har derfor en felle som viser at sjekken KAN slå ut:
 *
 *   K2         et sete som ikke er budvinner: bytt skjulte hender (via en forenlig verden), vraket og
 *              talongen. Trekkene skal være bit-like og søkets verdier per kort identiske (`D` gir
 *              frøet fra visningen). Visningen må være lik og byttet må faktisk ha skjedd.
 *              FELLE: en etikett som leser nabosetets virkelige hånd fanges av samme sjekk.
 *   LYTTEREN   samme valg i en helbotrunde med og uten `settParlytter`. FELLE: lytteren må ha fått
 *              hendelser, ellers er likheten gratis.
 *   GENERATOREN  bare `@`-setene merkes, radene har nettets bredde og verdier for ≥ 2 kort, `b` er
 *              søkets beste. FELLE: kandidaten flyttet til de andre setene gir de andre setene.
 *   TRENEREN   (WSL, `KORT_TREN_WSL=1`) `sd-tren.py --vekter d7alle --epoker 0` skriver d7alle byte for
 *              byte, og MODELL-ANGER = POLICY-ANGER. FELLE: ett endret flyttall i startnettet gir en
 *              annen fil — sammenlikningen er ikke blind.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { opprettSpill, utfør } from "../src/index.ts";
import { lovligeKort, type GameState, type Handling } from "../src/motor.ts";
import { lagRng } from "../src/kort.ts";
import { ADAMS_MAALT, lagIndre } from "../src/moe2/agentspek.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import type { ParResultat } from "../src/moe2/sdpar.ts";
import { kanoniskVisning, settParlytter, type Parhendelse } from "../src/moe2/sikkerorakel.ts";
import { intTilKort, kortTilInt } from "../src/solver/dds.ts";
import { alleKortInt } from "../src/solver/sampler.ts";
import { e1SpillTrekkMedTro } from "../src/e1/trekk.ts";
import { kortIndeks } from "../src/nevro/index.ts";
import { kortEtikett } from "../examples/kort-data.ts";

const ROT = fileURLToPath(new URL("..", import.meta.url));
/** Relativ til ROT, uten kolon, ignorert av git (`/_*`), per prosess. */
const MAPPE = `_test-kort-${process.pid}`;
before(() => mkdirSync(`${ROT}/${MAPPE}`, { recursive: true }));
after(() => {
  settParlytter(null);
  rmSync(`${ROT}/${MAPPE}`, { recursive: true, force: true });
});

/** Den hele boten fra løkka, med 3 verdener (4 kandidater) i stedet for 24k32 — samme lag, samme bokstaver. */
const HEL =
  "okt:vr:e1-modell/vrak-1.bin:telrd:eks:3Lt2000:profil:sik:alle:0.5:3k4e3LMD~mlbu=e1-modell/tro-1.bin:" +
  "budq:e1-modell/budq-1.bin:vakt:abmp:e1:e1-modell/d7alle.bin";
const DIM = 273;

/** Kortvalg i runde 0 for seter som IKKE er budvinner, med vrak og minst to lovlige kort. Spilt uten søk. */
const STILLINGER: { s: GameState; sete: number }[] = (() => {
  const ut: { s: GameState; sete: number }[] = [];
  for (let g = 0; g < 8 && ut.length < 12; g++) {
    const agenter = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
    let s = opprettSpill({ antallSpillere: 4 }, 5_100_000 + g * 3571);
    let vakt = 0;
    let iGiv = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
      const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (sete === null || sete === undefined) break;
      if (
        s.fase === "SPILL" &&
        sete !== s.budvinner &&
        s.vrak.length > 0 &&
        s.stikkSpilt % 3 === 1 &&
        iGiv < 2 &&
        lovligeKort(s, sete).length >= 2
      ) {
        ut.push({ s, sete });
        iGiv++;
      }
      s = utfør(s, agenter[sete]!.velgHandling(s)).state;
    }
  }
  return ut;
})();

/**
 * BYTT DET SETET IKKE SER: hendene fra en verden forenlig med visningen (`medVerden` flytter makkeren
 * med det etterlyste kortet), vraket blir de kortene som da er til overs, og talongen settes til `talong`
 * — tom, som i SPILL, eller et påfunn, fordi ingen visning viser den.
 */
function byttSkjult(s: GameState, sete: number, hender: number[][], talongPåfunn: boolean): GameState {
  const m = medVerden(s, hender, sete);
  const brukt = new Set<number>();
  for (const h of m.hender) for (const k of h) brukt.add(kortTilInt(k));
  for (const st of s.historikk) for (const kp of st.kort) brukt.add(kortTilInt(kp.kort));
  for (const kp of s.bord) brukt.add(kortTilInt(kp.kort));
  const vrak = alleKortInt().filter((c) => !brukt.has(c)).map(intTilKort);
  assert.equal(vrak.length, s.vrak.length, "de døde kortene går ikke opp – byttet er ikke en lovlig verden");
  return { ...m, vrak, talong: talongPåfunn ? vrak.slice().reverse() : [] };
}

const sortert = (k: readonly { farge: string; verdi: number }[]): string =>
  JSON.stringify(k.map((x) => kortTilInt(x as never)).sort((a, b) => a - b));

interface Sammenlikning {
  s: GameState;
  s2: GameState;
  sete: number;
  par: ParResultat;
  par2: ParResultat;
}

/** Avvikene mellom den ekte og den byttede stillingen for en etikettfunksjon. Tom = K2 holder. */
function k2Avvik(etikett: typeof kortEtikett, rader: readonly Sammenlikning[]): string[] {
  const ut: string[] = [];
  for (const [i, x] of rader.entries()) {
    const a = etikett(x.s, x.sete, x.par, DIM);
    const b = etikett(x.s2, x.sete, x.par2, DIM);
    const ulikeT = a.t.findIndex((z, j) => !Object.is(z, b.t[j]));
    if (ulikeT >= 0 || a.t.length !== b.t.length) ut.push(`#${i} sete ${x.sete}: trekk ${ulikeT} skiller (${a.t[ulikeT]} / ${b.t[ulikeT]})`);
    if (JSON.stringify(a.v) !== JSON.stringify(b.v)) ut.push(`#${i} sete ${x.sete}: verdiene ${JSON.stringify(a.v)} / ${JSON.stringify(b.v)}`);
  }
  return ut;
}

/** FELLEN: kortEtikett, men nabosetets VIRKELIGE hånd teller med i ett trekk og i verdiene. */
const kikkEtikett: typeof kortEtikett = (state, sete, par, dim) => {
  const e = kortEtikett(state, sete, par, dim);
  const nabo = (state.hender[(sete + 1) % 4] ?? []).reduce((a, k) => a + kortTilInt(k), 0);
  e.t[0] = e.t[0]! + nabo;
  for (const k of Object.keys(e.v)) e.v[k] = e.v[k]! + nabo / 1000;
  return e;
};

test("stillingene finnes, og de har et vrak å skjule", () => {
  assert.ok(STILLINGER.length >= 8, `bare ${STILLINGER.length} stillinger`);
});

test("K2: bytt skjulte hender, vrak og talong – trekkene bit-like og søkets verdier identiske; en kikkende etikett fanges", () => {
  const agent = lagIndre(HEL);
  agent.nyKamp();
  let siste: Parhendelse | null = null;
  settParlytter((h) => {
    siste = h;
  });
  const søk = (s: GameState, sete: number): ParResultat => {
    siste = null;
    agent.velgHandling(s);
    const h = siste as Parhendelse | null;
    assert.ok(h !== null && h.sete === sete, "søket vurderte ikke stillingen – ingen etikett å sammenlikne");
    return h.par;
  };
  const rader: Sammenlikning[] = [];
  let byttetHender = 0;
  let byttetVrak = 0;
  let påfunn = 0;
  let spredning = 0;
  try {
    for (const [g, { s, sete }] of STILLINGER.entries()) {
      const par = søk(s, sete);
      const verdier = par.kandidater.map((k) => k.snitt);
      if (Math.max(...verdier) - Math.min(...verdier) > 1e-9) spredning++;
      const verdener = trekkVerdener(s, sete, 2, lagRng(6_600_000 + g * 13), undefined, undefined, 4);
      for (const [w, hender] of verdener.entries()) {
        const s2 = byttSkjult(s, sete, hender, w % 2 === 1);
        assert.equal(kanoniskVisning(s2, sete), kanoniskVisning(s, sete), "byttet endret det setet SER");
        if (sortert(s2.hender.flat()) !== sortert(s.hender.flat()) || JSON.stringify(s2.hender) !== JSON.stringify(s.hender)) byttetHender++;
        if (sortert(s2.vrak) !== sortert(s.vrak)) byttetVrak++;
        if (s2.talong.length > 0) påfunn++;
        rader.push({ s, s2, sete, par, par2: søk(s2, sete) });
      }
      // Samme stilling igjen til slutt: boka eller troen skal ikke ha flyttet seg av byttene.
      const igjen = søk(s, sete);
      assert.deepEqual(igjen.kandidater.map((k) => k.perVerden), par.kandidater.map((k) => k.perVerden), "samme stilling ga nye verdier");
    }
  } finally {
    settParlytter(null);
  }
  assert.ok(rader.length >= 16, `bare ${rader.length} sammenlikninger`);
  assert.ok(byttetHender > 0, "ingen verden byttet skjulte hender – likheten beviser ingenting");
  assert.ok(byttetVrak > 0, "vraket ble aldri byttet – en vraklekkasje ville gått fri");
  assert.ok(påfunn > 0, "talongen ble aldri fylt – en talonglekkasje ville gått fri");
  assert.ok(spredning > 0, "søket ga alle kort samme verdi overalt – verdiene er ingen etikett");

  // Hele ParResultat, uavrundet: verdien i hver verden, n og σ.
  for (const x of rader) {
    const fp = (p: ParResultat): unknown => [p.n, p.sigma, p.kandidater.map((k) => [kortIndeks(k.kort), k.perVerden])];
    assert.deepEqual(fp(x.par2), fp(x.par), `sete ${x.sete}, stikk ${x.s.stikkSpilt}: søket så de skjulte kortene`);
  }
  assert.deepEqual(k2Avvik(kortEtikett, rader), [], "JUKS: kortEtikett avhenger av skjulte kort");
  // FELLEN.
  const fanget = k2Avvik(kikkEtikett, rader);
  assert.ok(fanget.length > 0, "en etikett som leser nabosetets virkelige hånd slapp gjennom – sjekken er blind");
  // Og trekkene er vektoren E1Agent gir nettet, bit for bit.
  const { s, sete } = STILLINGER[0]!;
  assert.deepEqual(kortEtikett(s, sete, rader[0]!.par, DIM).t, Array.from(e1SpillTrekkMedTro(s, sete, DIM, null)));
});

test("LYTTEREN: samme valg med og uten lytter i en helbotrunde – og lytteren fikk hendelser", () => {
  const spill = (lytt: boolean): { handlinger: string[]; hendelser: number; feil: string[] } => {
    const agenter = [0, 1, 2, 3].map(() => lagIndre(HEL));
    for (const a of agenter) a.nyKamp();
    let hendelser = 0;
    const feil: string[] = [];
    if (lytt) {
      settParlytter((h) => {
        hendelser++;
        const lov = lovligeKort(h.state, h.sete).map(kortIndeks).sort((a, b) => a - b);
        const kand = h.par.kandidater.map((k) => kortIndeks(k.kort)).sort((a, b) => a - b);
        if (JSON.stringify(lov) !== JSON.stringify(kand)) feil.push(`sete ${h.sete}: ${kand} er ikke de lovlige ${lov}`);
      });
    }
    let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, 7_300_001);
    const handlinger: string[] = [];
    let vakt = 0;
    try {
      while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
        for (const a of agenter) a.observer?.(s);
        const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
        if (sete === null || sete === undefined) break;
        const h: Handling = agenter[sete]!.velgHandling(s);
        handlinger.push(JSON.stringify(h));
        s = utfør(s, h).state;
      }
    } finally {
      settParlytter(null);
    }
    return { handlinger, hendelser, feil };
  };
  const uten = spill(false);
  const med = spill(true);
  assert.equal(uten.hendelser, 0);
  assert.ok(med.hendelser >= 8, `bare ${med.hendelser} hendelser – lytteren ble ikke kalt, og likheten under er gratis`);
  assert.deepEqual(med.feil, []);
  assert.ok(uten.handlinger.length > 30, "runden ble ikke spilt");
  assert.deepEqual(med.handlinger, uten.handlinger, "lytteren flyttet et valg");
});

function kjør(skript: string, args: readonly string[]): string {
  const r = spawnSync(process.execPath, [skript, ...args], { cwd: ROT, encoding: "utf8" });
  assert.equal(r.status, 0, `${skript} ${args.join(" ")}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

interface Rad {
  frø: number;
  sete: number;
  rolle: string | null;
  mål: string;
  n: number;
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

test("GENERATOREN: bare @-setene merkes, radene er treneren sine – og kandidaten flyttet gir de andre setene", () => {
  const felles = ["--spek", HEL, "--kamper", "1", "--maksrunder", "1"];
  const a = `${MAPPE}/gen-a.jsonl`;
  const b = `${MAPPE}/gen-b.jsonl`;
  const utA = kjør("examples/kort-data.ts", [...felles, "--drivere", "@|nevro|@|nevro", "--ut", a]);
  kjør("examples/kort-data.ts", [...felles, "--drivere", "nevro|@|nevro|@", "--ut", b]);
  assert.match(utA, /^MS-PER-MERKET \d+(\.\d+)?$/m);

  const ra = lesRader(a);
  const rb = lesRader(b);
  assert.ok(ra.length >= 6 && rb.length >= 6, `for få rader: ${ra.length} / ${rb.length}`);
  for (const r of ra) {
    assert.equal(r.t.length, DIM);
    assert.equal(r.frø, 500_000_000);
    assert.equal(r.mål, "lag");
    assert.ok(r.n >= 1);
    const nøkler = Object.keys(r.v).map(Number);
    assert.ok(nøkler.length >= 2, "en rad med ett kort har ingen rangering");
    assert.ok(nøkler.includes(r.p) && nøkler.includes(r.b), "spilt eller beste kort er ikke blant de merkede");
    assert.ok(r.v[String(r.b)]! >= Math.max(...Object.values(r.v)) - 1e-4, "b er ikke søkets beste");
  }
  const seter = (r: readonly Rad[]): number[] => [...new Set(r.map((x) => x.sete))].sort();
  assert.deepEqual(seter(ra), [0, 2]);
  // FELLEN: filteret leser faktisk --drivere.
  assert.deepEqual(seter(rb), [1, 3]);
});

/**
 * TRENEREN, i WSL der torch bor. Opt-in: WSL eies av løkka, og en prøve skal ikke starte den.
 * `KORT_TREN_WSL=1 node --test test/kort-data.test.ts` når løkka ikke trener.
 */
const WSL = process.env.KORT_TREN_WSL === "1";
const PY = "/home/arvind/Arvind-Lora/.venv/bin/python";

function sdTren(args: readonly string[]): string {
  const r = spawnSync("wsl.exe", ["-d", "Ubuntu", "--cd", ROT.replace(/[\\/]$/, ""), "-e", PY, "verktoy/sd-tren.py", ...args], {
    encoding: "utf8",
    timeout: 600_000,
  });
  assert.equal(r.status, 0, `sd-tren.py ${args.join(" ")}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}
const linje = (ut: string, navn: string): number => {
  const m = [...ut.matchAll(new RegExp(`^${navn} (\\S+)$`, "gm"))].at(-1);
  assert.ok(m !== undefined, `fant ikke «${navn}» i\n${ut.slice(-2000)}`);
  return Number(m[1]);
};

test("TRENEREN: --vekter d7alle --epoker 0 skriver d7alle byte for byte; ett endret flyttall gir en annen fil", { skip: WSL ? false : "sett KORT_TREN_WSL=1 (kjører sd-tren.py i WSL)" }, () => {
  // Syntetiske rader: ekte trekk, tilfeldige verdier, ett kampfrø per rad så holdouten ikke blir tom.
  const rng = lagRng(4242);
  const rader: string[] = [];
  for (let i = 0; i < 80; i++) {
    const { s, sete } = STILLINGER[i % STILLINGER.length]!;
    const v: Record<string, number> = {};
    for (const k of lovligeKort(s, sete)) v[String(kortIndeks(k))] = Math.round((rng() * 10 - 5) * 1e4) / 1e4;
    rader.push(JSON.stringify({ frø: 1000 + i, t: Array.from(e1SpillTrekkMedTro(s, sete, DIM, null)), v }));
  }
  mkdirSync(`${ROT}/${MAPPE}/data`, { recursive: true });
  writeFileSync(`${ROT}/${MAPPE}/data/s0.jsonl`, rader.join("\n") + "\n");
  const felles = ["--data", `${MAPPE}/data`, "--epoker", "0", "--enhet", "cpu", "--ingenbuffer", "--minrader", "1", "--holdoutandel", "0.5", "--logg", `${MAPPE}/tren.jsonl`];

  const ut = sdTren([...felles, "--vekter", "e1-modell/d7alle.bin", "--ut", `${MAPPE}/kort-0.bin`]);
  const d7 = readFileSync(`${ROT}/e1-modell/d7alle.bin`);
  assert.ok(readFileSync(`${ROT}/${MAPPE}/kort-0.bin`).equals(d7), "epoke 0 skrev ikke startnettet byte for byte");
  assert.equal(linje(ut, "MODELL-ANGER-HOLDOUT"), linje(ut, "POLICY-ANGER-HOLDOUT"));
  assert.ok(linje(ut, "START-AVVIK") < 1e-4, "torch-nettet regner ikke det samme som vektfila");

  // FELLEN: ett flyttall i en bias i første lag, +1.
  const skjev = Buffer.from(d7);
  const o = 8 + 8 + 273 * 512 * 4;
  skjev.writeFloatLE(skjev.readFloatLE(o) + 1, o);
  writeFileSync(`${ROT}/${MAPPE}/skjev.bin`, skjev);
  sdTren([...felles, "--vekter", `${MAPPE}/skjev.bin`, "--policy", "e1-modell/d7alle.bin", "--ut", `${MAPPE}/kort-skjev.bin`]);
  const ny = readFileSync(`${ROT}/${MAPPE}/kort-skjev.bin`);
  assert.ok(!ny.equals(d7), "et endret startnett ga d7alle – sammenlikningen er blind");
  assert.ok(ny.equals(skjev));
});
