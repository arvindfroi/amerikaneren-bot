/**
 * HELE BOTEN MOT K1–K8 — kravbatteriet for en VILKÅRLIG spek (11. sep).
 *
 *   node examples/mlb-krav.ts --spek "<hele boten>" --ut analyse/krav-helbot --kjerner 12 [--to-band]
 *   node examples/mlb-krav.ts --spek "<billig spek>" --kjapp --kjerner 4 --ut <katalog>/roeyk [--bare k2,k5]
 *
 * `mlb-krav.ts` uten `--spek` er uendret og måler MLB. Denne fila er `--spek`-modusen:
 * den EIER ingen måling, den orkestrerer prøvene som prosesser, leser deres varige
 * filer og skriver ÉN rapport (`<ut>.tsv` rad for rad, `<ut>.txt`, `<ut>.json`).
 *
 * ===================== RAD FOR RAD ======================================
 *
 *   K1   `duplikat-menneske.ts --spek S --motstander v5` + `analyse/duplikat-dom.mjs`.
 *        ΔP(seier) bot − menneske per runde fra 10. aug, klyngebootstrap over kamper.
 *        KONTROLL: menneskesiden (mP, rundepoeng) er identisk i begge armene.
 *        FELLE: `nevro` i menneskets sete MÅ ligge under mennesket (< −2 SE).
 *        JA: > 2 SE og positiv i begge halvdeler av kampene (dataene er faste, så
 *        «disjunkte bånd» er to halvdeler delt på kamp-id).
 *   K2   `k2-spek.ts`, tidlig (bud, vrak, velg, stikk 0–3) og sent (stikk 7+).
 *        KONTROLL: fersk agent to ganger gir samme svar. FELLE: juks:6 og den plantede
 *        jukseren tatt i hver fase. JA: 0 avvik.
 *   K3   `tak-kart.ts --gjenbruk --maks-noder` i tre vinduer: bud (K3.1), trumfvalg
 *        (K3.4), midtspill stikk 3–5 (K3.6). K7: stikk 7–11.
 *        KONTROLL: tomt vindu eksakt 0. FELLE: ADAMS_MAALT i samme vindu har gap > 2 SE
 *        (ellers har målingen ikke kraft). JA: |gap| ≤ 2 SE og treet ALDRI kappet — et
 *        kappet tre gir en nedre grense, så «nei» kan leses og «ja» ikke.
 *   K4   `k4-hukommelse.ts --spek`. KONTROLL: nullarmen (uten hukommelse) 0 avvik.
 *        FELLE: positivkontrollen snur valg. JA: minnearmen avviker.
 *   K5   `k5-retning.ts`. KONTROLL: lik stilling eksakt 0. FELLE: PLANTET±BUD tatt hver
 *        sin vei. JA: budgap > 2 SE (klynget på giv) og tegntest p < 0,05.
 *   K6   `k6-vaner.ts --adams`, TRE kjøringer: speken, nullspeken og nullspeken IGJEN.
 *        dd = g(spek) − g(null) per (frø, runde). KONTROLL: null mot null eksakt 0 på
 *        hver rad. FELLE: g(null) > 2 SE (vanen er utnyttbar i det hele tatt). JA:
 *        stigningen av dd mot rundenummer > 2 SE, klyngebootstrap over kamper.
 *        (k6-vaner sin «uten-okt»-arm tikker ikke, og søketroen med hukommelse KASTER
 *        da i runde 2 — derfor nullspeken med tikk i stedet.)
 *   K8   `mlb-k8.ts --nett <troen i speken>` (`~mlb=`/`~mlbu=`): andel av veien gulv → tak.
 *        KONTROLL: gulvkolonnen er ln 3. FELLE (kraft): slår gulv+. JA: andel − 2 SE ≥ 25 %
 *        (forslaget til K8.2). I tillegg `sok-verdener.ts` med søkets egne innstillinger mot
 *        appens (3 kandidater, budvekt): riktig plasserte kort, parvis per giv.
 *
 * ===================== REGLER FOR DOMMEN ================================
 *
 * «ja» krever ≥ 2 SE der raden er statistisk, og med `--to-band` samme dom i begge
 * frøbåndene (rapporten sier SPRIKER ellers). En rad der kontrollen bommet eller fella
 * slapp unna er STUM, og tallet skal ikke leses. Røykmodus (`--kjapp`) gir aldri en dom.
 *
 * ===================== KOSTNAD ==========================================
 *
 * Hver rad får `prosess-sekunder` (summen av barnas veggtid) i rapporten, så kostnaden
 * per rad er målt og ikke anslått. Skivene går i parallell på `--kjerner` prosesser.
 *
 * Røyk 11. sep (`--kjapp`, 6 kjerner, hele boten med 4 verdener, CPU delt med treningen),
 * prosess-sekunder: K1 5 · K2 26 · K3.1 190 · K3.4 82 · K3.6 179 · K4 28 · K5 11 · K6 44 ·
 * K7 76 · K8 4. Takradene var da kjørt med søk i alle fire seter; nå har de `--andre`.
 *
 * K3, K4 og K7: de tre andre setene spiller `--andre` (standard speken uten søk). Det er et
 * valg, og det står i rapporten: gapet og hukommelsen måles mot et bord som ikke søker.
 */

import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { ADAMS_MAALT, tall } from "../src/moe2/agentspek.ts";
import type { Kravrad } from "./mlb-krav.ts";
import { fmt, Radskriver } from "./mlb-krav-felles.ts";
import { klyngeSnitt, klyngeStigning } from "./klynge.ts";
import { dømK2, slåSammenK2, type K2Fase, type K2Rapport } from "./k2-spek.ts";
import { dømK5R, type K5RRad } from "./k5-retning.ts";
import { dømK4Spek, slåSammenK4, type K4SpekRapport } from "./k4-hukommelse.ts";
import { par, type Runderad } from "./k6-vaner.ts";
import { sikVerdener, søketro, troLeserMinne, utenMinne, utenSøkOveralt } from "./spek-lag.ts";

/** Kjeden mennesket møtte fra 10. aug (v5, `bud-menneske`). Motstanderne i K1-duplikatet. */
export const V5_KJEDE =
  "vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-menneske.json@-3.0:vakt:abmp:e1:e1-modell/d7alle.bin";
export const K1_FRA = "2026-08-10";
/** «Veldig høyt nivå» (K8.2, forslag 11. sep): minst 25 % av veien gulv → tak. */
export const K8_TERSKEL = 0.25;

export type Dom = Kravrad["innfridd"];

export interface Helrad extends Kravrad {
  /** Summen av barneprosessenes veggtid — kostnaden per rad. */
  readonly prosessSekunder: number;
  readonly jobber: number;
}

// ===========================================================================
// 1. Prosesskøen
// ===========================================================================

/**
 * Høyst `n` barneprosesser om gangen. Hvert barn skriver sine egne rader til fil og
 * sin logg til `<fil>.logg` — ingenting leses fra et rør.
 */
export class Kø {
  private readonly n: number;
  private aktive = 0;
  private readonly venter: (() => void)[] = [];

  constructor(n: number) {
    this.n = Math.max(1, n);
  }

  async kjør(args: readonly string[], logg: string): Promise<{ ok: boolean; sekunder: number }> {
    while (this.aktive >= this.n) await new Promise<void>((r) => this.venter.push(r));
    this.aktive++;
    const t0 = Date.now();
    mkdirSync(dirname(logg), { recursive: true });
    const fd = openSync(logg, "w");
    try {
      const kode = await new Promise<number>((res) => {
        const p = spawn(process.execPath, [...args], { stdio: ["ignore", fd, fd] });
        p.on("close", (c) => res(c ?? 1));
        p.on("error", () => res(1));
      });
      return { ok: kode === 0, sekunder: (Date.now() - t0) / 1000 };
    } finally {
      closeSync(fd);
      this.aktive--;
      this.venter.shift()?.();
    }
  }
}

/** Kostnaden for én rad: summen av jobbene den startet. */
class Regnskap {
  sek = 0;
  jobber = 0;
  feilet: string[] = [];
  async kjør(kø: Kø, args: readonly string[], logg: string): Promise<boolean> {
    const r = await kø.kjør(args, logg);
    this.sek += r.sekunder;
    this.jobber++;
    if (!r.ok) this.feilet.push(logg);
    return r.ok;
  }
  merknad(): string {
    return this.feilet.length === 0 ? "" : ` FEILEDE JOBBER (se loggene): ${this.feilet.join(", ")}.`;
  }
}

function nyFil(sti: string): string {
  mkdirSync(dirname(sti), { recursive: true });
  writeFileSync(sti, "");
  return sti;
}

export function lesJsonl<T>(sti: string): T[] {
  if (!existsSync(sti)) return [];
  const ut: T[] = [];
  for (const l of readFileSync(sti, "utf8").split("\n")) {
    if (l.trim() === "") continue;
    try {
      ut.push(JSON.parse(l) as T);
    } catch {
      /* en halv siste linje fra en avbrutt skive teller ikke */
    }
  }
  return ut;
}

function lesJson<T>(sti: string): T | null {
  if (!existsSync(sti)) return null;
  try {
    return JSON.parse(readFileSync(sti, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Sammenhengende biter av [0, total) i `n` deler, for verktøy som tar `--froe` + antall. */
export function biter(total: number, n: number): { start: number; len: number }[] {
  const k = Math.max(1, Math.min(n, total));
  const ut: { start: number; len: number }[] = [];
  let start = 0;
  for (let i = 0; i < k; i++) {
    const len = Math.floor(total / k) + (i < total % k ? 1 : 0);
    if (len > 0) ut.push({ start, len });
    start += len;
  }
  return ut;
}

const fnv = (s: string): number => {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619) >>> 0;
  return x;
};

// ===========================================================================
// 2. Størrelsene og riggen
// ===========================================================================

export interface Størrelser {
  /** Antall K1-skard; `k1Bare` = kjør bare ett av dem (røyk). */
  readonly k1Skard: number;
  readonly k1Bare: number | null;
  readonly k2Giver: number;
  readonly k2Verdener: number;
  readonly k2PerGiv: number;
  readonly budGiver: number;
  readonly vrakGiver: number;
  readonly midtGiver: number;
  readonly takGiver: number;
  readonly maksNoder: number;
  readonly k4Giv: number;
  readonly k4MålRunde: number;
  readonly k4Forkamper: number;
  readonly k5Giver: number;
  readonly k6Kamper: number;
  readonly k6Maal: number;
  readonly k6MaksRunder: number;
  readonly k8Giver: number;
}

/** RØYKMODUS: viser at apparatet virker. Tallene er IKKE en kravdom. */
export const KJAPP: Størrelser = {
  k1Skard: 256,
  k1Bare: 0,
  k2Giver: 4,
  k2Verdener: 2,
  k2PerGiv: 3,
  budGiver: 1,
  vrakGiver: 1,
  midtGiver: 1,
  takGiver: 1,
  maksNoder: 1,
  k4Giv: 1,
  k4MålRunde: 2,
  k4Forkamper: 0,
  k5Giver: 4,
  k6Kamper: 1,
  k6Maal: 60,
  k6MaksRunder: 4,
  k8Giver: 2,
};

export function fullStørrelser(kjerner: number): Størrelser {
  return {
    k1Skard: Math.max(1, kjerner),
    k1Bare: null,
    k2Giver: 24,
    k2Verdener: 4,
    k2PerGiv: 2,
    // Takkartet er den dyreste delen: hvert blad er en runde. Tallene er satt etter røyken
    // 11. sep (se KOSTNAD i filhodet), med de andre setene uten søk.
    budGiver: 8,
    vrakGiver: 30,
    midtGiver: 12,
    takGiver: 40,
    maksNoder: 12,
    k4Giv: 12,
    k4MålRunde: 7,
    k4Forkamper: 0,
    k5Giver: 200,
    k6Kamper: 24,
    k6Maal: 100,
    k6MaksRunder: 12,
    k8Giver: 120,
  };
}

interface Rigg {
  readonly spek: string;
  /** Speken uten søk: drivere, K2-kontrollarmens base. */
  readonly base: string;
  /** Speken uten hukommelse: K4- og K6-nullarmen. */
  readonly nullSpek: string;
  readonly motstander: string;
  readonly data: string;
  readonly basis: string;
  readonly drivere: string;
  readonly andre: string;
  readonly utBase: string;
  readonly bånd: number;
  readonly frø: number;
  readonly kjerner: number;
  readonly st: Størrelser;
  readonly kø: Kø;
}

const skardtall = (r: Rigg, total: number): number => Math.max(1, Math.min(r.kjerner, total));

// ===========================================================================
// 3. Dommene — rene funksjoner, prøvd i test/mlb-krav-spek.test.ts
// ===========================================================================

export interface D1 {
  readonly spill: string;
  readonly tid: string;
  readonly runde: number;
  readonly menneske: number;
  readonly bot: number;
  readonly diff: number;
  readonly mP: number;
  readonly bP: number;
}

export function domK1(spek: readonly D1[], felle: readonly D1[], B = 20_000) {
  const s = spek.filter((x) => x.tid >= K1_FRA);
  const f = felle.filter((x) => x.tid >= K1_FRA);
  const dP = (x: D1): number => x.bP - x.mP;
  const ks = klyngeSnitt(s, (x) => x.spill, dP, B);
  const kf = klyngeSnitt(f, (x) => x.spill, dP, B);
  const kd = klyngeSnitt(s, (x) => x.spill, (x) => x.diff, B);
  const fm = new Map(f.map((x) => [`${x.spill}|${x.runde}`, x] as const));
  let parret = 0;
  let ulik = 0;
  for (const x of s) {
    const y = fm.get(`${x.spill}|${x.runde}`);
    if (y === undefined) continue;
    parret++;
    if (y.mP !== x.mP || y.menneske !== x.menneske) ulik++;
  }
  const kontrollOk = s.length > 0 && parret === s.length && f.length === s.length && ulik === 0;
  const felleOk = Number.isFinite(kf.se) && kf.snitt < -2 * kf.se;
  const halv = [0, 1].map((b) => klyngeSnitt(s.filter((x) => fnv(x.spill) % 2 === b), (x) => x.spill, dP, B));
  const beggeHalvdeler = halv.every((h) => h.snitt > 0);
  const signifikant = Number.isFinite(ks.se) && ks.snitt > 2 * ks.se;
  const innfridd: Dom = !kontrollOk || !felleOk ? "stum" : signifikant && beggeHalvdeler ? "ja" : "nei";
  return { ks, kf, kd, halv, parret, ulik, kontrollOk, felleOk, innfridd };
}

export interface Takrad {
  readonly frø: number;
  readonly diff: number;
  readonly kappet?: boolean;
}

export function domTak(spek: readonly Takrad[], stakk: readonly Takrad[], tom: readonly Takrad[]) {
  const gap = klyngeSnitt(spek, (x) => x.frø, (x) => x.diff);
  const st = klyngeSnitt(stakk, (x) => x.frø, (x) => x.diff);
  const kappet = spek.filter((x) => x.kappet === true).length;
  const kontrollOk = tom.length > 0 && tom.every((x) => x.diff === 0);
  const felleOk = Number.isFinite(st.se) && st.snitt > 2 * st.se;
  let innfridd: Dom;
  if (!kontrollOk || !felleOk || gap.n === 0 || !Number.isFinite(gap.se)) innfridd = "stum";
  else if (gap.snitt > 2 * gap.se) innfridd = "nei";
  // Et «tak» under policyen er ikke et tak — målingen er i stykker, ikke boten god.
  else if (gap.snitt < -2 * gap.se) innfridd = "stum";
  // Et kappet tre er en NEDRE grense: «gapet er null» kan ikke leses fra det.
  else innfridd = kappet > 0 ? "stum" : "ja";
  return { gap, stakk: st, kappet, kontrollOk, felleOk, innfridd };
}

export interface K8Rad {
  readonly frø: number;
  readonly nett: number;
  readonly gulv: number;
  readonly gulvPluss: number;
}

export function domK8(rader: readonly K8Rad[]) {
  const ln3 = Math.log(3);
  const andel = klyngeSnitt(rader, (x) => x.frø, (x) => (ln3 - x.nett) / ln3);
  const m = (f: (x: K8Rad) => number): number => (rader.length === 0 ? NaN : rader.reduce((a, x) => a + f(x), 0) / rader.length);
  const nett = m((x) => x.nett);
  const gulv = m((x) => x.gulv);
  const gulvPluss = m((x) => x.gulvPluss);
  const kontrollOk = rader.length > 0 && Math.abs(gulv - ln3) < 1e-4;
  const felleOk = Number.isFinite(nett) && nett < gulvPluss;
  const innfridd: Dom =
    rader.length === 0 || !kontrollOk ? "stum" : !felleOk ? "nei" : andel.snitt - 2 * andel.se >= K8_TERSKEL ? "ja" : "nei";
  return { andel, nett, gulv, gulvPluss, kontrollOk, felleOk, innfridd };
}

export function domK6(minne: readonly Runderad[], nul: readonly Runderad[], nul2: readonly Runderad[]) {
  const gm = par(minne);
  const gn = par(nul);
  const gn2 = par(nul2);
  const nøkkel = (p: { frø: number; rundeNr: number }): string => `${p.frø}|${p.rundeNr}`;
  const mn = new Map(gn.map((p) => [nøkkel(p), p.g] as const));
  const dd = gm.flatMap((p) => {
    const b = mn.get(nøkkel(p));
    return b === undefined ? [] : [{ frø: p.frø, rundeNr: p.rundeNr, g: p.g - b }];
  });
  const mn2 = new Map(gn2.map((p) => [nøkkel(p), p.g] as const));
  let kN = 0;
  let kUlik = 0;
  for (const p of gn) {
    const b = mn2.get(nøkkel(p));
    if (b === undefined) continue;
    kN++;
    if (p.g !== b) kUlik++;
  }
  const kontrollOk = kN > 0 && kUlik === 0 && gn.length === gn2.length;
  const nivåNull = klyngeSnitt(gn, (p) => p.frø, (p) => p.g);
  const felleOk = Number.isFinite(nivåNull.se) && nivåNull.snitt > 2 * nivåNull.se;
  const stig = klyngeStigning(dd, (p) => p.frø, (p) => p.rundeNr, (p) => p.g);
  const nivå = klyngeSnitt(dd, (p) => p.frø, (p) => p.g);
  const innfridd: Dom =
    !kontrollOk || !felleOk ? "stum" : Number.isFinite(stig.se) && stig.b > 2 * stig.se ? "ja" : "nei";
  return { dd, stig, nivå, nivåNull, kN, kUlik, kontrollOk, felleOk, innfridd };
}

/** Krav som får ulik dom i ulike frøbånd. «Ja» i bare ett bånd er ikke innfridd. */
export function sprikende(rader: readonly Kravrad[]): string[] {
  const perKrav = new Map<string, Set<string>>();
  for (const r of rader) perKrav.set(r.krav, (perKrav.get(r.krav) ?? new Set()).add(r.innfridd));
  return [...perKrav].filter(([, v]) => v.size > 1).map(([k]) => k);
}

// ===========================================================================
// 4. Radene
// ===========================================================================

async function k1(r: Rigg): Promise<Helrad[]> {
  const reg = new Regnskap();
  const N = r.st.k1Skard;
  const skard = r.st.k1Bare === null ? [...Array(N).keys()] : [r.st.k1Bare];
  const filer: Record<"spek" | "felle", string[]> = { spek: [], felle: [] };
  const jobber: Promise<boolean>[] = [];
  for (const [arm, sp] of [
    ["spek", r.spek],
    ["felle", "nevro"],
  ] as const) {
    for (const i of skard) {
      const fil = nyFil(`${r.utBase}-k1-${arm}-s${i}.jsonl`);
      filer[arm].push(fil);
      jobber.push(
        reg.kjør(
          r.kø,
          // `--etter K1_FRA`: bare rundene fra 10. aug blir rader (og kamper helt før spilles ikke) –
          // uten den spilte batteriet alle 4 448 rundene for et utvalg domsraden uansett kaster.
          ["examples/duplikat-menneske.ts", "--spek", sp, "--motstander", r.motstander, "--data", r.data, "--etter", K1_FRA, "--skard", `${i}/${N}`, "--ut", fil],
          `${fil}.logg`,
        ),
      );
    }
  }
  await Promise.all(jobber);
  await reg.kjør(r.kø, ["analyse/duplikat-dom.mjs", "--ut", `${r.utBase}-k1-dom.txt`, ...filer.spek], `${r.utBase}-k1-dom.logg`);
  const d = domK1(
    filer.spek.flatMap((f) => lesJsonl<D1>(f)),
    filer.felle.flatMap((f) => lesJsonl<D1>(f)),
  );
  return [
    {
      krav: "K1",
      bånd: r.bånd,
      navn: "henter mer ut av menneskets kort enn mennesket (duplikat)",
      målt:
        `ΔP(seier) bot − menneske ${fmt(d.ks.snitt, 2)} ± ${d.ks.se.toFixed(2)} pp per runde ` +
        `(${d.ks.n} runder i ${d.ks.klynger} kamper fra ${K1_FRA}); halvdeler ${fmt(d.halv[0]!.snitt, 2)} / ${fmt(d.halv[1]!.snitt, 2)}; ` +
        `rundepoeng ${fmt(d.kd.snitt, 2)} ± ${d.kd.se.toFixed(2)}`,
      kontroll: `menneskesiden identisk i begge armene: ${d.parret} parret, ${d.ulik} ulike (må være 0)`,
      kontrollOk: d.kontrollOk,
      felle: `nevro i menneskets sete: ΔP ${fmt(d.kf.snitt, 2)} ± ${d.kf.se.toFixed(2)} (må være < −2 SE)`,
      felleOk: d.felleOk,
      innfridd: d.innfridd,
      kilde: `examples/duplikat-menneske.ts --motstander v5-kjeden; ${r.utBase}-k1-dom.txt`,
      merknad:
        "K1.1 (< 5 % seire) avgjøres ikke her: duplikatet spør om boten henter mer ut av NØYAKTIG de samme " +
        "kortene og poengtavlene. Motstanderne i duplikatet er v5-kjeden mennesket møtte; SE er klynget på kamp." +
        (r.st.k1Bare === null ? "" : ` RØYK: bare skard ${r.st.k1Bare}/${N}.`) +
        reg.merknad(),
      prosessSekunder: Math.round(reg.sek),
      jobber: reg.jobber,
    },
  ];
}

async function k2(r: Rigg): Promise<Helrad[]> {
  const reg = new Regnskap();
  const N = skardtall(r, r.st.k2Giver);
  const filer: string[] = [];
  const felles = (fil: string): string[] => [
    "examples/k2-spek.ts",
    "--spek", r.spek,
    "--giver", String(r.st.k2Giver),
    "--verdener", String(r.st.k2Verdener),
    "--per-giv", String(r.st.k2PerGiv),
    "--froe", String(r.frø),
    "--drivere", r.drivere,
    "--ut", fil,
  ];
  const jobber: Promise<boolean>[] = [];
  for (let i = 0; i < N; i++) {
    const tidlig = `${r.utBase}-k2-tidlig-s${i}.json`;
    const sent = `${r.utBase}-k2-sent-s${i}.json`;
    filer.push(nyFil(tidlig), nyFil(sent));
    jobber.push(
      reg.kjør(r.kø, [...felles(tidlig), "--faser", "bud,vrak,velg,spill", "--fra-stikk", "0", "--til-stikk", "3", "--skard", `${i}/${N}`], `${tidlig}.logg`),
      reg.kjør(r.kø, [...felles(sent), "--faser", "spill", "--fra-stikk", "7", "--til-stikk", "99", "--uten-kontroll", "--skard", `${i}/${N}`], `${sent}.logg`),
    );
  }
  await Promise.all(jobber);
  const rapporter = filer.map((f) => lesJson<K2Rapport>(f)).filter((x): x is K2Rapport => x !== null);
  if (rapporter.length === 0) return [feilrad("K2", r, "ingen K2-rapporter ble skrevet", reg)];
  const s = slåSammenK2(rapporter);
  const d = dømK2(s);
  const fase = (f: K2Fase): string =>
    `${f} ${s.faser[f].avvik}/${s.faser[f].sammenliknet} (${s.faser[f].prøvd} st.)`;
  const faser = s.opts.faser;
  const ikkeDet = faser.reduce((a, f) => a + s.faser[f].ikkeDeterministisk, 0);
  return [
    {
      krav: "K2",
      bånd: r.bånd,
      navn: "aldri jukse (alle faser)",
      målt: `avvik/sammenlikninger: ${faser.map(fase).join(", ")}`,
      kontroll: `fersk agent to ganger på samme stilling: ${ikkeDet} ulike (må være 0)`,
      kontrollOk: ikkeDet === 0 && faser.every((f) => s.faser[f].prøvd > 0),
      felle:
        s.kontroll === null
          ? "ikke kjørt"
          : `juks:6 ${s.kontroll.juks6.avvik}/${s.kontroll.juks6.sammenliknet}; plantet ${faser.map((f) => `${f} ${s.kontroll!.plantet[f].avvik}`).join(", ")} (alle > 0)`,
      felleOk: s.kontroll !== null && s.kontroll.juks6.avvik > 0 && faser.every((f) => s.kontroll!.plantet[f].avvik > 0),
      innfridd: d.dom,
      kilde: `examples/k2-spek.ts (${filer.length} skiver)`,
      merknad:
        `${d.grunn}. Spill = stikk 0–3 og 7+. Verdener fra setets synsvinkel, fersk agent per kall (fast frø). ` +
        "Hukommelse fra TIDLIGERE runder prøves ikke (fersk agent)." +
        reg.merknad(),
      prosessSekunder: Math.round(reg.sek),
      jobber: reg.jobber,
    },
  ];
}

async function takvindu(
  r: Rigg,
  krav: string,
  merke: string,
  navn: string,
  vindu: readonly string[],
  giver: number,
): Promise<Helrad> {
  const reg = new Regnskap();
  const N = skardtall(r, giver);
  /**
   * DE TRE ANDRE SETENE SPILLER `r.andre` (standard: speken uten søk) — i spekarmen og i
   * kontrollen, aldri i fella. Fire søkende seter kostet 190 prosess-sekunder for ÉN giv i
   * budvinduet (røyk, 4 verdener). Fella er ADAMS_MAALT ved sitt eget bord, som før.
   */
  const bord = r.andre === r.spek ? [] : ["--andre", r.andre];
  const armer = [
    { arm: "spek", spek: r.spek, v: [...vindu, ...bord] },
    { arm: "stakk", spek: ADAMS_MAALT, v: vindu },
    { arm: "tomtvindu", spek: r.spek, v: ["--fase", "spill", "--fra", "99", "--til", "99", ...bord] },
  ];
  const filer: Record<string, string[]> = { spek: [], stakk: [], tomtvindu: [] };
  const jobber: Promise<boolean>[] = [];
  for (const a of armer) {
    for (let i = 0; i < N; i++) {
      const fil = nyFil(`${r.utBase}-${merke}-${a.arm}-s${i}.jsonl`);
      filer[a.arm]!.push(fil);
      jobber.push(
        reg.kjør(
          r.kø,
          [
            "examples/tak-kart.ts",
            "--giver", String(giver),
            "--froe", String(r.frø),
            "--spek", a.spek,
            "--merke", a.arm,
            "--ut", fil,
            "--gjenbruk",
            "--maks-noder", String(r.st.maksNoder),
            "--skard", `${i}/${N}`,
            ...a.v,
          ],
          `${fil}.logg`,
        ),
      );
    }
  }
  await Promise.all(jobber);
  const les = (arm: string): Takrad[] => filer[arm]!.flatMap((f) => lesJsonl<Takrad>(f));
  const d = domTak(les("spek"), les("stakk"), les("tomtvindu"));
  return {
    krav,
    bånd: r.bånd,
    navn,
    målt: `${fmt(d.gap.snitt)} ± ${d.gap.se.toFixed(4)} poeng/runde igjen til taket (n=${d.gap.n} i ${d.gap.klynger} giv, ${d.kappet} kappet)`,
    kontroll: `tomt vindu: alle ${les("tomtvindu").length} rader eksakt 0?`,
    kontrollOk: d.kontrollOk,
    felle: `ADAMS_MAALT i samme vindu og giv: ${fmt(d.stakk.snitt)} ± ${d.stakk.se.toFixed(4)} (må være > 2 SE)`,
    felleOk: d.felleOk,
    innfridd: d.innfridd,
    kilde: `examples/tak-kart.ts ${vindu.join(" ")} --gjenbruk --maks-noder ${r.st.maksNoder}`,
    merknad:
      "Ja = |gap| ≤ 2 SE (klynget på giv) OG ingen kappede trær; et kappet tre er en nedre grense. " +
      "Med søk i speken trekker treet en annen RNG-strøm enn policyrunden (se tak-kart.ts), til agent A sitt frø finnes." +
      reg.merknad(),
    prosessSekunder: Math.round(reg.sek),
    jobber: reg.jobber,
  };
}

async function k3(r: Rigg): Promise<Helrad[]> {
  return Promise.all([
    takvindu(r, "K3.1", "k3bud", "budrunden nær taket", ["--fase", "bud"], r.st.budGiver),
    takvindu(r, "K3.4", "k3vrak", "trumfvalget nær taket", ["--fase", "vrak"], r.st.vrakGiver),
    takvindu(r, "K3.6", "k3midt", "midtspillet (stikk 3–5) nær taket", ["--fase", "spill", "--fra", "3", "--til", "5"], r.st.midtGiver),
  ]);
}

async function k7(r: Rigg): Promise<Helrad[]> {
  return [
    await takvindu(r, "K7", "k7", "sluttspillet (siste fem stikk) nær taket", ["--fase", "spill", "--fra", "7", "--til", "11"], r.st.takGiver),
  ];
}

async function k4(r: Rigg): Promise<Helrad[]> {
  const reg = new Regnskap();
  const filer: string[] = [];
  const felles = (json: string): string[] => [
    "examples/k4-hukommelse.ts",
    "--spek", r.spek,
    "--null-spek", r.nullSpek,
    "--andre", r.andre,
    "--maalrunde", String(r.st.k4MålRunde),
    "--forkamper", String(r.st.k4Forkamper),
    "--json", json,
    "--ut", json.replace(/\.json$/, ".txt"),
  ];
  const jobber: Promise<boolean>[] = [];
  for (const [i, b] of biter(r.st.k4Giv, r.kjerner).entries()) {
    const json = nyFil(`${r.utBase}-k4-s${i}.json`);
    filer.push(json);
    jobber.push(
      reg.kjør(r.kø, [...felles(json), "--giv", String(b.len), "--froe", String(r.frø + b.start * 7717), "--del", "null,minne"], `${json}.logg`),
    );
  }
  const kjson = nyFil(`${r.utBase}-k4-kontroll.json`);
  filer.push(kjson);
  jobber.push(reg.kjør(r.kø, [...felles(kjson), "--giv", String(r.st.k4Giv), "--froe", String(r.frø), "--del", "kontroll"], `${kjson}.logg`));
  await Promise.all(jobber);
  const rs = filer.map((f) => lesJson<K4SpekRapport>(f)).filter((x): x is K4SpekRapport => x !== null);
  if (rs.length === 0) return [feilrad("K4", r, "ingen K4-rapporter ble skrevet", reg)];
  const s = slåSammenK4(rs);
  const d = dømK4Spek(s);
  const nul = s.armer.find((a) => a.navn === "NULL");
  const min = s.armer.find((a) => a.navn === "MINNE");
  const det = s.determinisme;
  return [
    {
      krav: "K4",
      bånd: r.bånd,
      navn: "hukommelse over hele spillet (prøve A)",
      målt: `${fmt(d.andel)} av valgene endres av hukommelsen (${min?.avvik ?? 0}/${min?.n ?? 0}, runde ${r.st.k4MålRunde + 1})`,
      kontroll: `nullarm uten hukommelse: ${nul?.avvik ?? "?"}/${nul?.n ?? "?"} (må være 0)` +
        (det === null ? "" : `; dobbeltkall ulike ${det.ulike}/${det.kall}${det.søkelag ? ", SØKELAG" : ""}`),
      kontrollOk: d.kontrollOk,
      felle: `positivkontroll: ${(s.positivkontroll ?? []).map((p) => `${p.forsterk} → ${p.avvik}/${p.n}`).join(", ")} (minst ett > 0)`,
      felleOk: d.felleOk,
      innfridd: d.dom,
      kilde: `examples/k4-hukommelse.ts --spek (${filer.length} skiver)`,
      merknad:
        `${d.grunn}. Nullarm: ${r.nullSpek}. De tre andre setene: ${r.andre}. K4.2 (gevinst) og K4.3 (framoverblikk) er ikke med.` +
        (s.struktur === null ? "" : ` Økten når gjennom speken: ${s.struktur} bokførte runder.`) +
        reg.merknad(),
      prosessSekunder: Math.round(reg.sek),
      jobber: reg.jobber,
    },
  ];
}

async function k5(r: Rigg): Promise<Helrad[]> {
  const reg = new Regnskap();
  const N = skardtall(r, r.st.k5Giver);
  const baser: string[] = [];
  const jobber: Promise<boolean>[] = [];
  for (let i = 0; i < N; i++) {
    const b = `${r.utBase}-k5-s${i}`;
    nyFil(`${b}.jsonl`);
    baser.push(b);
    jobber.push(
      reg.kjør(
        r.kø,
        [
          "examples/k5-retning.ts",
          "--spek", r.spek,
          "--giver", String(r.st.k5Giver),
          "--froe", String(r.frø),
          "--spill-per-giv", "1",
          "--drivere", r.drivere,
          "--skard", `${i}/${N}`,
          "--ut", b,
        ],
        `${b}.logg`,
      ),
    );
  }
  await Promise.all(jobber);
  const rader = baser.flatMap((b) => lesJsonl<K5RRad>(`${b}.jsonl`));
  const d = dømK5R(rader);
  const sp = d.armer["spek"]!;
  const pl = d.armer["PLANTET+BUD"]!;
  const mi = d.armer["PLANTET-BUD"]!;
  return [
    {
      krav: "K5",
      bånd: r.bånd,
      navn: "bak ⇒ høyere bud (retning)",
      målt:
        `budgap bak − foran ${fmt(sp.budGap)} ± ${sp.budSe.toFixed(4)} (n=${sp.budN} i ${sp.giver} giv), ` +
        `høyere/lavere ${sp.høyere}/${sp.lavere}, p=${Number.isFinite(sp.p) ? sp.p.toFixed(3) : "n/a"}; ` +
        `passgap ${fmt(sp.passGap)}; kortvalg endret ${sp.endret}/${sp.spillN}`,
      kontroll: `lik stilling: budgap ${fmt(d.armer["KONTROLL"]!.budGap)}, endret ${d.armer["KONTROLL"]!.endret} (eksakt 0)`,
      kontrollOk: d.kontrollOk,
      felle: `PLANTET+BUD ${pl.høyere}/${pl.lavere} (p=${pl.p.toFixed(3)}), PLANTET-BUD ${mi.høyere}/${mi.lavere} (p=${Number.isFinite(mi.p) ? mi.p.toFixed(3) : "n/a"})`,
      felleOk: d.felleOk,
      innfridd: d.dom,
      kilde: `examples/k5-retning.ts (${N} skiver)`,
      merknad: `${d.grunn}. BAK 70–90 mot FORAN 90–70 av 100, bare totalPoeng endret, fersk agent per side.` + reg.merknad(),
      prosessSekunder: Math.round(reg.sek),
      jobber: reg.jobber,
    },
  ];
}

async function k6(r: Rigg): Promise<Helrad[]> {
  const reg = new Regnskap();
  const armer = [
    { arm: "minne", spek: r.spek },
    { arm: "null", spek: r.nullSpek },
    { arm: "null2", spek: r.nullSpek },
  ];
  const filer: Record<string, string[]> = { minne: [], null: [], null2: [] };
  const jobber: Promise<boolean>[] = [];
  for (const a of armer) {
    for (const [i, b] of biter(r.st.k6Kamper, r.kjerner).entries()) {
      const base = `${r.utBase}-k6-${a.arm}-s${i}`;
      nyFil(`${base}.jsonl`);
      filer[a.arm]!.push(`${base}.jsonl`);
      jobber.push(
        reg.kjør(
          r.kø,
          [
            "examples/k6-vaner.ts",
            "--adams", a.spek,
            "--basis", r.basis,
            "--armer", "okt",
            "--kamper", String(b.len),
            "--froe", String(r.frø + b.start * 7717),
            "--maal", String(r.st.k6Maal),
            "--maksrunder", String(r.st.k6MaksRunder),
            "--ut", base,
          ],
          `${base}.logg`,
        ),
      );
    }
  }
  await Promise.all(jobber);
  const les = (arm: string): Runderad[] => filer[arm]!.flatMap((f) => lesJsonl<Runderad>(f));
  const d = domK6(les("minne"), les("null"), les("null2"));
  return [
    {
      krav: "K6",
      bånd: r.bånd,
      navn: "lære vaner og utnytte dem",
      målt:
        `stigning dd ${fmt(d.stig.b)} ± ${d.stig.se.toFixed(4)} per runde (z = ${(d.stig.b / d.stig.se).toFixed(2)}), ` +
        `nivå dd ${fmt(d.nivå.snitt, 3)} ± ${d.nivå.se.toFixed(3)}, n=${d.dd.length} i ${d.stig.klynger} kamper`,
      kontroll: `nullspeken to ganger: ${d.kUlik} ulike av ${d.kN} runder (eksakt 0)`,
      kontrollOk: d.kontrollOk,
      felle: `vanen er utnyttbar: g(null) ${fmt(d.nivåNull.snitt, 3)} ± ${d.nivåNull.se.toFixed(3)} (må være > 2 SE)`,
      felleOk: d.felleOk,
      innfridd: d.innfridd,
      kilde: `examples/k6-vaner.ts --adams <spek|nullspek> --armer okt`,
      merknad:
        `dd = g(spek) − g(nullspek), g = kant mot trumftrekkeren − kant mot nøytral, parret på giv. Nullspek: ${r.nullSpek}. ` +
        `Basis: ${r.basis}. Porten er STIGNINGEN (klynget på kamp).` +
        reg.merknad(),
      prosessSekunder: Math.round(reg.sek),
      jobber: reg.jobber,
    },
  ];
}

async function k8(r: Rigg): Promise<Helrad[]> {
  const reg = new Regnskap();
  const tro = søketro(r.spek);
  const sv = sikVerdener(r.spek);
  const minne = tro !== null && troLeserMinne(tro.sti);
  const N = skardtall(r, r.st.k8Giver);
  const nettFiler: string[] = [];
  const verdenFiler: string[] = [];
  const jobber: Promise<boolean>[] = [];
  for (let i = 0; i < N; i++) {
    if (tro !== null) {
      const fil = nyFil(`${r.utBase}-k8-s${i}.jsonl`);
      nettFiler.push(fil);
      jobber.push(
        reg.kjør(
          r.kø,
          [
            "examples/mlb-k8.ts",
            "--nett", tro.sti,
            "--armer", "ingen",
            "--drivere", r.drivere,
            "--giver", String(r.st.k8Giver),
            "--froe", String(r.frø),
            "--skard", `${i}/${N}`,
            "--ut", fil,
            ...(minne ? ["--kamp"] : []),
          ],
          `${fil}.logg`,
        ),
      );
    }
    if (sv !== null) {
      const fil = nyFil(`${r.utBase}-k8v-s${i}.jsonl`);
      verdenFiler.push(fil);
      const arm = `spek|${sv.kandidater}|${tro?.art === "mlbu" ? 0 : 1}|${tro?.sti ?? "-"}`;
      jobber.push(
        reg.kjør(
          r.kø,
          [
            "examples/sok-verdener.ts",
            "--armer", `app|3|1|-,${arm}`,
            "--verdener", String(sv.verdener),
            "--drivere", r.drivere,
            "--giver", String(r.st.k8Giver),
            "--skard", `${i}/${N}`,
            "--ut", fil,
            ...(minne ? ["--kamp"] : []),
          ],
          `${fil}.logg`,
        ),
      );
    }
  }
  await Promise.all(jobber);
  const vr = verdenFiler.flatMap((f) => lesJsonl<{ giv: number; app: number; spek: number }>(f));
  const v = klyngeSnitt(vr, (x) => x.giv, (x) => x.spek - x.app);
  const verdener =
    sv === null
      ? "ingen sik: i speken — søkets verdener ikke målt"
      : `søkets verdener mot appens: ${fmt(100 * v.snitt, 2)} ± ${(100 * v.se).toFixed(2)} pp riktig plasserte kort (n=${v.n})`;
  if (tro === null) {
    return [
      {
        krav: "K8",
        bånd: r.bånd,
        navn: "predikere motstandernes kort",
        målt: verdener,
        kontroll: "—",
        kontrollOk: false,
        felle: "—",
        felleOk: false,
        innfridd: "ikke målbar",
        kilde: "examples/sok-verdener.ts",
        merknad: "Speken har ingen `~mlb=`/`~mlbu=`-tro i søket, så det finnes ikke noe trohode å måle andelen på." + reg.merknad(),
        prosessSekunder: Math.round(reg.sek),
        jobber: reg.jobber,
      },
    ];
  }
  const d = domK8(nettFiler.flatMap((f) => lesJsonl<K8Rad>(f)));
  return [
    {
      krav: "K8",
      bånd: r.bånd,
      navn: "predikere motstandernes kort",
      målt:
        `${(100 * d.andel.snitt).toFixed(2)} ± ${(100 * d.andel.se).toFixed(2)} % av veien gulv → tak ` +
        `(log-tap ${d.nett.toFixed(4)}, n=${d.andel.n} i ${d.andel.klynger} giv${minne ? ", kamper med hukommelse" : ""}); ${verdener}`,
      kontroll: `gulvkolonnen ${d.gulv.toFixed(5)} mot ln 3 = ${Math.log(3).toFixed(5)}`,
      kontrollOk: d.kontrollOk,
      felle: `slår gulv+ (${d.gulvPluss.toFixed(4)})? ${d.felleOk ? "ja" : "NEI"}`,
      felleOk: d.felleOk,
      innfridd: d.innfridd,
      kilde: `examples/mlb-k8.ts --nett ${tro.sti}; examples/sok-verdener.ts`,
      merknad:
        `Ja = andel − 2 SE ≥ ${100 * K8_TERSKEL} % (K8.2-forslaget). Stillingene spilles av ${r.drivere}. ` +
        "sok-verdener har faste frø (620 000 000 + g·7717), så den delen er ikke frøbåndsdelt." +
        reg.merknad(),
      prosessSekunder: Math.round(reg.sek),
      jobber: reg.jobber,
    },
  ];
}

function feilrad(krav: string, r: Rigg, grunn: string, reg?: Regnskap): Helrad {
  return {
    krav,
    bånd: r.bånd,
    navn: "(feilet)",
    målt: grunn,
    kontroll: "—",
    kontrollOk: false,
    felle: "—",
    felleOk: false,
    innfridd: "stum",
    kilde: "—",
    merknad: `Raden kunne ikke regnes: ${grunn}.${reg?.merknad() ?? ""}`,
    prosessSekunder: Math.round(reg?.sek ?? 0),
    jobber: reg?.jobber ?? 0,
  };
}

const ALLE: Record<string, (r: Rigg) => Promise<Helrad[]>> = { k1, k2, k3, k4, k5, k6, k7, k8 };

// ===========================================================================
// 5. Kjøringen
// ===========================================================================

export async function kjørHelbot(argv: readonly string[]): Promise<void> {
  const arg = (n: string, s: string): string => {
    const i = argv.indexOf(n);
    return i < 0 ? s : (argv[i + 1] ?? s);
  };
  const spek = arg("--spek", "");
  if (spek === "") throw new Error("--spek mangler verdi");
  const kjapp = argv.includes("--kjapp");
  const kjerner = tall(arg("--kjerner", "4"), 4, "--kjerner");
  const utBase = arg("--ut", "analyse/krav-helbot");
  const bare = arg("--bare", "")
    .split(",")
    .filter((x) => x !== "")
    .map((x) => x.toLowerCase());
  let bånd = [7_700_000];
  if (argv.includes("--to-band")) bånd = [7_700_000, 57_700_000];
  const bandArg = arg("--band", "");
  if (bandArg !== "") bånd = bandArg.split(",").map((x) => tall(x, 0, "--band"));

  const st0 = kjapp ? KJAPP : fullStørrelser(kjerner);
  const over = (flagg: string, v: number): number => tall(arg(flagg, String(v)), v, flagg);
  const st: Størrelser = {
    ...st0,
    k2Giver: over("--k2-giver", st0.k2Giver),
    budGiver: over("--budgiver", st0.budGiver),
    vrakGiver: over("--vrakgiver", st0.vrakGiver),
    midtGiver: over("--midtgiver", st0.midtGiver),
    takGiver: over("--takgiver", st0.takGiver),
    maksNoder: over("--maks-noder", st0.maksNoder),
    k4Giv: over("--k4-giv", st0.k4Giv),
    k5Giver: over("--k5-giver", st0.k5Giver),
    k6Kamper: over("--kamper", st0.k6Kamper),
    k8Giver: over("--k8-giver", st0.k8Giver),
  };
  const base = utenSøkOveralt(spek);
  const felles = {
    spek,
    base,
    nullSpek: arg("--null-spek", "") || utenMinne(spek),
    motstander: arg("--motstander", V5_KJEDE),
    data: arg("--data", "D:/amb-grp/menneske/hendelser.jsonl"),
    basis: arg("--basis", ADAMS_MAALT),
    drivere: arg("--drivere", base),
    andre: arg("--andre", base),
  };
  const navn = bare.length === 0 ? Object.keys(ALLE) : bare.filter((k) => k in ALLE);
  if (navn.length === 0) throw new Error(`Ingen kjente krav i «${bare.join(",")}». Finnes: ${Object.keys(ALLE).join(", ")}`);

  const kø = new Kø(kjerner);
  const tsv = new Radskriver(`${utBase}.tsv`);
  tsv.rad("krav\tband\tnavn\tmaalt\tkontroll\tkontroll_ok\tfelle\tfelle_ok\tinnfridd\tprosess_s\tjobber\tkilde");
  const t0 = Date.now();

  const oppgaver: Promise<Helrad[]>[] = [];
  for (let b = 0; b < bånd.length; b++) {
    for (const n of navn) {
      // Menneskedataene er faste: K1 har ingen frøbånd, bare halvdelene i dommen.
      if (n === "k1" && b > 0) continue;
      const rigg: Rigg = {
        ...felles,
        utBase: bånd.length === 1 ? utBase : `${utBase}-b${b}`,
        bånd: b,
        frø: bånd[b]!,
        kjerner,
        st,
        kø,
      };
      oppgaver.push(
        ALLE[n]!(rigg)
          .catch((e: unknown) => [feilrad(n.toUpperCase(), rigg, e instanceof Error ? e.message : String(e))])
          .then((rs) => {
            for (const rad of rs) {
              tsv.rad(
                [
                  rad.krav, rad.bånd, rad.navn, rad.målt, rad.kontroll, rad.kontrollOk ? "OK" : "BOMMET",
                  rad.felle, rad.felleOk ? "TATT" : "SLAPP UNNA", rad.innfridd, rad.prosessSekunder, rad.jobber, rad.kilde,
                ].join("\t"),
              );
              process.stderr.write(`  ${rad.krav} b${rad.bånd}: ${rad.målt}  [${rad.innfridd}] (${rad.prosessSekunder} prosess-s)\n`);
            }
            return rs;
          }),
      );
    }
  }
  const rader = (await Promise.all(oppgaver))
    .flat()
    .sort((a, b) => a.krav.localeCompare(b.krav, "nb") || a.bånd - b.bånd);

  const L: string[] = [];
  L.push("HELE BOTEN MOT KRAVENE K1–K8");
  L.push("");
  if (kjapp) {
    L.push("RØYKMODUS (--kjapp): tallene viser at apparatet virker. De er IKKE en kravdom.");
    L.push("");
  }
  L.push(`Spek:         ${spek}`);
  L.push(`Uten søk:     ${base}`);
  L.push(`Uten minne:   ${felles.nullSpek}`);
  L.push(`K1-motstander ${felles.motstander}`);
  L.push(`K6-basis:     ${felles.basis}`);
  L.push(`Drivere:      ${felles.drivere}   (K2, K5, K8)`);
  L.push(`K4 andre:     ${felles.andre}`);
  L.push(`Størrelser:   ${JSON.stringify(st)}`);
  L.push(`Frøbånd:      ${bånd.join(", ")}${bånd.length === 1 ? "  — ETT BÅND (--to-band for replikasjon)" : "  — disjunkte"}`);
  L.push(`Kjerner:      ${kjerner}`);
  L.push(`Kjøretid:     ${Math.round((Date.now() - t0) / 1000)} s vegg, ${rader.reduce((a, x) => a + x.prosessSekunder, 0)} prosess-sekunder`);
  L.push("");
  for (const r of rader) {
    L.push(`--- ${r.krav} — ${r.navn}${bånd.length > 1 ? ` (bånd ${r.bånd}, frø ${bånd[r.bånd]})` : ""} ---`);
    L.push(`  MÅLT       ${r.målt}`);
    L.push(`  KONTROLL   ${r.kontroll}   [${r.kontrollOk ? "OK" : "BOMMET"}]`);
    L.push(`  FELLE      ${r.felle}   [${r.felleOk ? "TATT" : "SLAPP UNNA"}]`);
    L.push(`  INNFRIDD   ${kjapp ? `(røyk) ${r.innfridd.toUpperCase()}` : r.innfridd.toUpperCase()}`);
    L.push(`  KOSTNAD    ${r.prosessSekunder} prosess-sekunder i ${r.jobber} jobber`);
    L.push(`  Kilde      ${r.kilde}`);
    L.push(`  Merknad    ${r.merknad}`);
    L.push("");
  }
  const innfridde = rader.filter((r) => r.innfridd === "ja").length;
  const stumme = rader.filter((r) => r.innfridd === "stum").length;
  L.push(`${innfridde} av ${rader.length} rader lukket porten sin.`);
  if (bånd.length > 1) {
    const s = sprikende(rader.filter((r) => r.krav !== "K1"));
    L.push(s.length === 0 ? "Alle krav gir samme dom i begge bånd." : `SPRIKER MELLOM BÅNDENE: ${s.join(", ")}. Et krav som bare innfris i ETT bånd er IKKE innfridd.`);
  }
  if (stumme > 0) {
    L.push(`${stumme} rad(er) er STUMME: kontrollen bommet, fella slapp unna eller treet ble kappet. De tallene skal ikke leses som dom.`);
  }
  const tekst = L.join("\n");
  new Radskriver(`${utBase}.txt`).rad(tekst);
  new Radskriver(`${utBase}.json`).rad(JSON.stringify({ spek, felles, størrelser: st, bånd, kjapp, rader }, null, 1));
  process.stderr.write(`\n${tekst}\n\nSkrevet: ${utBase}.tsv, ${utBase}.txt og ${utBase}.json\n`);
}
