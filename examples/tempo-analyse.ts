/**
 * TENKETIDEN: HVA LOGGEN FAKTISK BÆRER, OG HVA SOM SKAL TIL FOR Å MÅLE NOE (12. sep).
 *
 *   node examples/tempo-analyse.ts --logg <hendelser.jsonl> --ut <fil.json>
 *
 * Appen har logget tenketid siden v13 (11. sep). Dette skriptet svarer på tre ting, og
 * IKKE på et fjerde:
 *
 *   1. HVOR MYE FINNES     kamper, runder og beslutninger med tider, per fase.
 *   2. HVOR MYE TRENGS     SE skalerer som 1/√n. K8-menneskeraden i
 *                          `analyse/profil-2026-09-12.md` er ankeret: 14 471 stillinger.
 *                          Herfra regnes «N kamper til» for en gitt effektstørrelse.
 *   3. HENGER TIDEN SAMMEN korrelasjoner mot OFFENTLIGE størrelser: antall lovlige kort,
 *      MED NOE OFFENTLIG   stikknummer, og om budet ble klart.
 *
 * IKKE en effektmåling. Med 67 runder er hver korrelasjon under et par hundre beslutninger
 * fra ÉN spiller, og de er sterkt klynget: beslutningene i en runde deler humør, nettverk og
 * hvor sent på kvelden det er. Skriptet regner derfor BÅDE en naiv SE og en KLYNGET SE
 * (kamp som klynge), og den klyngede er den ærlige. Alt under er anekdoter.
 *
 * ===================== NAVN SKRIVES ALDRI UT =============================
 *
 * Loggen er pseudonymisert (`menneske-eksport.ts`). Skriptet skriver antall spillere, aldri
 * en id og aldri et navn. Utdatafila er tall.
 *
 * ===================== RESULTATET SKRIVES AV PROSESSEN SELV ==============
 *
 * `--ut` er en fil, ikke et rør. Et stdout-rør som ryker tar målingen med seg.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { lovligeKort, type GameState } from "../src/motor.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { tempoLog, type Tempofase, type Tempohendelse } from "../src/mlb/tempotrekk.ts";
import {
  kamprunder,
  lesMenneskelogg,
  MENNESKE,
  nyTeller,
  rundeTempo,
  V5_KJEDE,
  type Hendelse,
} from "./menneske-logg.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const LOGG = arg("--logg", "D:/amb-grp/menneske/hendelser.jsonl");
const UT = arg("--ut", "");

/** K8-menneskeankeret: `analyse/profil-2026-09-12.md`, tabellen «alle stillinger». */
const ANKER_N = 14_471;
/**
 * Eierens oppgitte SE for den raden. Fila selv oppgir ±0,74 pp for NIVÅET (klynget på kamp)
 * og ±0,02 pp for DIFFERANSEN profil − tom; 0,4 pp ligger mellom dem. Begge regnes ut, så
 * svaret ikke hviler på hvilket tall man mente.
 */
const ANKER_SE = [0.4, 0.74];

interface Beslutning {
  readonly fase: Tempofase;
  readonly kamp: string;
  readonly logMs: number;
  readonly ms: number;
  /** Antall lovlige kort i øyeblikket (bare `fase === "S"`). */
  readonly lovlige: number;
  readonly stikk: number;
  /** Ble budet klart? Bare for runder der MENNESKET var budvinner. */
  readonly klart: number | null;
}

/** Pearson r, med naiv SE og SE klynget på kamp (klynget bootstrap over kamper). */
function korrelasjon(par: readonly { x: number; y: number; kamp: string }[]): {
  n: number;
  r: number;
  seNaiv: number;
  seKlynget: number;
  klynger: number;
} {
  const n = par.length;
  const r = pearson(par);
  const seNaiv = n > 3 ? (1 - r * r) / Math.sqrt(n - 1) : Number.NaN;
  // Klynget: trekk kamper med tilbakelegging, 400 ganger. Med få kamper er dette selv usikkert,
  // og det er nettopp poenget — tallet skal SE ustabilt ut når det er ustabilt.
  const perKamp = new Map<string, { x: number; y: number; kamp: string }[]>();
  for (const p of par) perKamp.set(p.kamp, [...(perKamp.get(p.kamp) ?? []), p]);
  const kamper = [...perKamp.keys()];
  let rng = 12_345;
  const tilfeldig = (): number => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff), rng / 0x7fffffff);
  const rr: number[] = [];
  for (let b = 0; b < 400 && kamper.length > 1; b++) {
    const prøve: { x: number; y: number; kamp: string }[] = [];
    for (let i = 0; i < kamper.length; i++) prøve.push(...(perKamp.get(kamper[Math.floor(tilfeldig() * kamper.length)]!) ?? []));
    const x = pearson(prøve);
    if (Number.isFinite(x)) rr.push(x);
  }
  const snitt = rr.reduce((a, x) => a + x, 0) / Math.max(1, rr.length);
  const seKlynget = rr.length > 1 ? Math.sqrt(rr.reduce((a, x) => a + (x - snitt) ** 2, 0) / (rr.length - 1)) : Number.NaN;
  return { n, r, seNaiv, seKlynget, klynger: kamper.length };
}

function pearson(par: readonly { x: number; y: number }[]): number {
  const n = par.length;
  if (n < 3) return Number.NaN;
  let sx = 0;
  let sy = 0;
  for (const p of par) {
    sx += p.x;
    sy += p.y;
  }
  const mx = sx / n;
  const my = sy / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of par) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : Number.NaN;
}

/**
 * BESLUTNINGENE MENNESKET TOK I RUNDEN, i rekkefølge, hektet på tilstanden de ble tatt i.
 *
 * Tempolista har én post per menneskebeslutning, i rekkefølge, men uten sete eller
 * tilstand. Gjenskapingen gir tilstandene. De hektes sammen PER FASE og i rekkefølge — og
 * bare når antallet stemmer nøyaktig. Stemmer det ikke, er lista og runden ikke den samme
 * hendelsesrekka, og da er et gjettet par verre enn ingen.
 */
function hekt(tilstander: readonly GameState[], tempo: readonly Tempohendelse[]): { h: Tempohendelse; s: GameState }[] {
  const mine: { fase: Tempofase; s: GameState }[] = [];
  for (const s of tilstander) {
    const aktør = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (aktør !== MENNESKE) continue;
    const f: Tempofase | null = s.fase === "BUDRUNDE" ? "B" : s.fase === "VRAK" ? "V" : s.fase === "VELG" ? "T" : s.fase === "SPILL" ? "S" : null;
    if (f !== null) mine.push({ fase: f, s });
  }
  const ut: { h: Tempohendelse; s: GameState }[] = [];
  for (const f of ["B", "V", "T", "S"] as const) {
    const a = mine.filter((x) => x.fase === f);
    const b = tempo.filter((x) => x.fase === f);
    if (a.length !== b.length) continue;
    for (let i = 0; i < a.length; i++) ut.push({ h: b[i]!, s: a[i]!.s });
  }
  return ut;
}

const budgivere = [0, 1, 2, 3].map(() => lagIndre(V5_KJEDE));
const teller = nyTeller();
const beslutninger: Beslutning[] = [];
const perFase: Record<string, number> = {};
let kamperMedTempo = 0;
let runderMedTempo = 0;
let runderTot = 0;
let ikkeHektet = 0;
const spillere = new Set<string>();

for (const [id, kamp] of lesMenneskelogg(LOGG)) {
  if (kamp.start === null) continue;
  let harTempo = false;
  for (const steg of kamprunder(kamp, budgivere, teller)) {
    runderTot++;
    const rå = rundeTempo(steg.hendelse);
    if (rå === null || rå.length === 0) continue;
    runderMedTempo++;
    harTempo = true;
    for (const h of rå) perFase[h.fase] = (perFase[h.fase] ?? 0) + 1;
    if (steg.runde === null) {
      // Runden bar tider, men lot seg ikke gjenskape: tellingen får den, analysen ikke.
      ikkeHektet += rå.length;
      continue;
    }
    const klart = (steg.hendelse as Hendelse).data["klart"];
    const bv = Number((steg.hendelse as Hendelse).data["budvinner"]);
    const par = hekt(steg.runde.tilstander, rå);
    if (par.length !== rå.length) ikkeHektet += rå.length - par.length;
    for (const { h, s } of par) {
      beslutninger.push({
        fase: h.fase,
        kamp: id,
        logMs: tempoLog(h.ms),
        ms: h.ms,
        lovlige: h.fase === "S" && s.iTur !== null ? lovligeKort(s, s.iTur).length : 0,
        stikk: s.stikkSpilt,
        klart: bv === MENNESKE && typeof klart === "boolean" ? (klart ? 1 : 0) : null,
      });
    }
  }
  if (harTempo) {
    kamperMedTempo++;
    spillere.add(kamp.start.spiller);
  }
}

const kort = beslutninger.filter((b) => b.fase === "S");
const bud = beslutninger.filter((b) => b.fase === "B" && b.klart !== null);
const tvunget = kort.filter((b) => b.lovlige === 1);
const fritt = kort.filter((b) => b.lovlige > 1);
const snitt = (xs: readonly number[]): number => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);

const korrelasjoner = {
  /** Flere lovlige kort = mer å velge mellom. Er tiden i det hele tatt en DELIBERASJON? */
  logMs_mot_antallLovlige: korrelasjon(kort.map((b) => ({ x: b.lovlige, y: b.logMs, kamp: b.kamp }))),
  /** Senere i runden er stillingen enklere og kortene færre. */
  logMs_mot_stikknummer: korrelasjon(kort.map((b) => ({ x: b.stikk, y: b.logMs, kamp: b.kamp }))),
  /** Nølte han lenge på budet han siden ikke klarte? */
  budLogMs_mot_klart: korrelasjon(bud.map((b) => ({ x: b.klart!, y: b.logMs, kamp: b.kamp }))),
};

/** Hvor mange stillinger (og kamper) som trengs for å oppløse en effekt på `d` pp ved z = 2. */
const behov = (d: number, se0: number): number => Math.ceil(ANKER_N * (se0 / (d / 2)) ** 2);

const stillingerPerRunde = 36.8; // målt: 97 178 stillinger / 2 641 runder (`menneske-tro.ts`, 11. sep)
const andelMedBlokk = 0.75; // mennesket er rel sete 1–3 for tre av fire observatører
const runderPerKamp = runderMedTempo / Math.max(1, kamperMedTempo);

const rapport = {
  tid: new Date().toISOString(),
  logg: LOGG,
  finnes: {
    kamperMedTempo,
    runderMedTempo,
    runderTotIListen: runderTot,
    beslutningerMedTid: beslutninger.length + ikkeHektet,
    hektetTilEnTilstand: beslutninger.length,
    ikkeHektet,
    perFase,
    spillere: spillere.size,
    runderPerKamp: Number(runderPerKamp.toFixed(2)),
    gjenskaping: teller,
  },
  fordeling: {
    medianMs: [...beslutninger.map((b) => b.ms)].sort((a, b) => a - b)[beslutninger.length >> 1] ?? null,
    snittLogMs: Number(snitt(beslutninger.map((b) => b.logMs)).toFixed(4)),
    tvungneKort: { n: tvunget.length, snittLogMs: Number(snitt(tvunget.map((b) => b.logMs)).toFixed(4)) },
    frieKort: { n: fritt.length, snittLogMs: Number(snitt(fritt.map((b) => b.logMs)).toFixed(4)) },
  },
  korrelasjoner,
  hvaSomSkalTil: {
    anker: { n: ANKER_N, seVarianter: ANKER_SE, kilde: "analyse/profil-2026-09-12.md, «alle stillinger»" },
    stillingerPerRunde,
    andelRaderMedUtfyltBlokk: andelMedBlokk,
    perEffekt: [1.0, 0.5, 0.25].map((d) => ({
      effektPp: d,
      ...Object.fromEntries(
        ANKER_SE.map((se) => {
          const n = behov(d, se);
          const runder = Math.ceil(n / (stillingerPerRunde * andelMedBlokk));
          return [`se${String(se).replace(".", "_")}`, { stillinger: n, runder, kamper: Math.ceil(runder / Math.max(1, runderPerKamp)) }];
        }),
      ),
    })),
  },
  forbehold:
    "Anekdoter. Én spiller, få kamper, sterkt klynget. Den klyngede SE-en er den ærlige, og der " +
    "korrelasjonen ikke er minst 2 klyngede SE fra null, er den ikke skilt fra null.",
};

const tekst = JSON.stringify(rapport, null, 1);
if (UT !== "") {
  mkdirSync(dirname(UT), { recursive: true });
  writeFileSync(UT, tekst);
}
console.log(tekst);
