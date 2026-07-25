/**
 * Atferdsprofil: HVA gjør boten i hver fase – ikke bare hvor mange poeng.
 *
 *   node examples/spillprofil.ts bidrag/d5-adoptert.json --kamper 40
 *
 * Poengsummen sier at noe er galt; den sier ikke hva. Denne måler
 * beslutningene direkte og stiller dem side om side med NevroHjerne, så
 * avviket kan leses av: byr den for lavt, vraker den feil kort, velger den
 * feil trumf, etterlyser den feil valør – og hvor mange stikk tar den
 * faktisk?
 *
 * Alle kandidatene spiller de SAMME giverne (parret), og hver giver spilles
 * fire ganger med kandidaten i hvert sete, så kortflaksen er kontrollert.
 */

import { appendFileSync, readFileSync } from "node:fs";

import { FARGER, type Farge, type Kort } from "../src/kort.ts";
import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { genomFraJson, NeatAgent } from "../src/neat/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { grådigHandling } from "./graadig.ts";

const filer: string[] = [];
let kamper = 40;
/**
 * Varig atferdslogg. Tabellen paa skjermen er et OEYEBLIKKSBILDE; det vi
 * trenger er ENDRINGEN over tid - byr den hoeyere enn foer, vraker den
 * fortsatt ess, kryper trumflengden oppover mot nevros. Med --jsonl legges
 * én linje per kandidat per kjoering til en fil, saa serien overlever
 * oekten og kan leses av en graf senere.
 */
let jsonlFil: string | null = null;
/** Merkelapp paa linja, typisk generasjonsnummeret. */
let merke = "";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--jsonl") jsonlFil = process.argv[++i]!;
  else if (a === "--merke") merke = process.argv[++i]!;
  else filer.push(a);
}

interface Profil {
  bud: number[];
  pass: number;
  budAnledninger: number;
  // Vrak
  vrakVerdi: number[];
  vrakTrumfFarge: number; // vraket kort i fargen som SENERE ble trumf
  vrakEssKonge: number;
  vrakAntall: number;
  // Trumf
  trumfLengde: number[]; // antall kort i valgt trumffarge (etter bytte)
  trumfVarLengst: number; // valgte den den lengste fargen?
  trumfSerie: number[]; // lengste sammenhengende serie i valgt trumf
  trumfValg: number;
  // Etterlysning
  etterlysVerdi: number[];
  etterlysVarHøyest: number; // etterlyste den høyeste lovlige?
  etterlysAntall: number;
  // Utfall
  lagStikk: number[];
  budTall: number[];
  klart: number;
  kontrakter: number;
}

function nyProfil(): Profil {
  return {
    bud: [], pass: 0, budAnledninger: 0,
    vrakVerdi: [], vrakTrumfFarge: 0, vrakEssKonge: 0, vrakAntall: 0,
    trumfLengde: [], trumfVarLengst: 0, trumfSerie: [], trumfValg: 0,
    etterlysVerdi: [], etterlysVarHøyest: 0, etterlysAntall: 0,
    lagStikk: [], budTall: [], klart: 0, kontrakter: 0,
  };
}

const lengder = (h: readonly Kort[]): Record<Farge, number> => {
  const t: Record<Farge, number> = { S: 0, H: 0, R: 0, K: 0 };
  for (const k of h) t[k.farge]++;
  return t;
};

/** Lengste sammenhengende serie i en farge. */
function serie(hånd: readonly Kort[], farge: Farge): number {
  const v = hånd.filter((k) => k.farge === farge).map((k) => k.verdi).sort((a, b) => b - a);
  if (v.length === 0) return 0;
  let beste = 1, løpende = 1;
  for (let i = 1; i < v.length; i++) {
    løpende = v[i]! === v[i - 1]! - 1 ? løpende + 1 : 1;
    if (løpende > beste) beste = løpende;
  }
  return beste;
}

type Velger = { nyKamp(): void; velgHandling(s: GameState): Handling };

function spill(lagAgent: () => Velger, p: Profil, frø: number, sete: number): void {
  const agent = lagAgent();
  agent.nyKamp();
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  let guard = 0;
  // Håndsnapshot ved vrak, så vi kan se hva som ble kastet og hva som ble trumf.
  let vrakSnapshot: { hånd: Kort[]; kastet: Kort[] } | null = null;
  while (s.fase !== "FERDIG" && guard++ < 20_000) {
    if (s.fase === "RUNDE_SLUTT") {
      if (s.rundeNr + 1 >= 25) break;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
    const min = iTur === sete;
    const h = min ? agent.velgHandling(s) : grådigHandling(s);

    if (min && h.type === "BUD") {
      p.budAnledninger++;
      if (h.bud === "PASS") p.pass++;
      else if (typeof h.bud === "number") p.bud.push(h.bud);
    }
    if (min && h.type === "VRAK") {
      const hånd = s.hender[sete] ?? [];
      vrakSnapshot = { hånd: [...hånd], kastet: [...h.kort] };
      p.vrakAntall += h.kort.length;
      for (const k of h.kort) {
        p.vrakVerdi.push(k.verdi);
        if (k.verdi >= 13) p.vrakEssKonge++;
      }
    }
    if (min && h.type === "VELG") {
      const hånd = s.hender[sete] ?? [];
      const len = lengder(hånd);
      p.trumfValg++;
      p.trumfLengde.push(len[h.trumf]);
      p.trumfSerie.push(serie(hånd, h.trumf));
      if (len[h.trumf] === Math.max(...FARGER.map((f) => len[f]))) p.trumfVarLengst++;
      // Vraket den kort i fargen som nå ble trumf?
      if (vrakSnapshot !== null) {
        for (const k of vrakSnapshot.kastet) if (k.farge === h.trumf) p.vrakTrumfFarge++;
        vrakSnapshot = null;
      }
      if (h.etterlyst !== null) {
        p.etterlysAntall++;
        p.etterlysVerdi.push(h.etterlyst.verdi);
        // Høyeste valør i trumf som ikke er på egen hånd og ikke vraket.
        const egne = new Set(hånd.filter((k) => k.farge === h.trumf).map((k) => k.verdi));
        const vraket = new Set(s.vrak.filter((k) => k.farge === h.trumf).map((k) => k.verdi));
        let høyest = 0;
        for (let v = 14; v >= 2; v--) if (!egne.has(v as never) && !vraket.has(v as never)) { høyest = v; break; }
        if (h.etterlyst.verdi === høyest) p.etterlysVarHøyest++;
      }
    }
    const res = utfør(s, h);
    for (const e of res.hendelser) {
      if (e.type === "RUNDE_SLUTT" && e.resultat.budvinner === sete) {
        p.kontrakter++;
        p.lagStikk.push(e.resultat.lagStikk);
        if (e.resultat.melding.type === "tall") p.budTall.push(e.resultat.melding.bud);
        if (e.resultat.klart) p.klart++;
      }
    }
    s = res.state;
  }
}

const snitt = (x: readonly number[]): number => (x.length === 0 ? NaN : x.reduce((a, b) => a + b, 0) / x.length);
const pst = (a: number, b: number): string => (b === 0 ? "–" : `${Math.round((100 * a) / b)} %`);

const kandidater: { navn: string; lag: () => Velger }[] = [];
for (const f of filer) {
  const rå = JSON.parse(readFileSync(f, "utf8")) as { genom?: unknown };
  const g = genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(f, "utf8"));
  kandidater.push({ navn: f.split(/[\\/]/).pop()!, lag: () => new NeatAgent(g, { læringsrate: 0 }) });
}
kandidater.push({ navn: "NevroHjerne", lag: () => new NevroAgent() });

const profiler = kandidater.map(() => nyProfil());
for (let f = 0; f < kamper; f++) {
  for (let i = 0; i < kandidater.length; i++) {
    for (let sete = 0; sete < 4; sete++) spill(kandidater[i]!.lag, profiler[i]!, 970_000 + f, sete);
  }
}

const rad = (navn: string, verdier: string[]): void =>
  console.log(navn.padEnd(30) + verdier.map((v) => v.padStart(15)).join(""));

console.log(`\n=== Atferdsprofil, ${kamper} givere × 4 seter mot 3× grådig ===\n`);
rad("", kandidater.map((k) => k.navn.slice(0, 14)));
console.log("-".repeat(30 + 15 * kandidater.length));
rad("BUD snitt", profiler.map((p) => snitt(p.bud).toFixed(2)));
rad("  passandel", profiler.map((p) => pst(p.pass, p.budAnledninger)));
rad("  andel bud ≥ 9", profiler.map((p) => pst(p.bud.filter((b) => b >= 9).length, p.bud.length)));
rad("VRAK snitt valør", profiler.map((p) => snitt(p.vrakVerdi).toFixed(2)));
rad("  vraket ess/konge", profiler.map((p) => pst(p.vrakEssKonge, p.vrakAntall)));
rad("  vraket i egen trumf", profiler.map((p) => pst(p.vrakTrumfFarge, p.vrakAntall)));
rad("TRUMF lengde", profiler.map((p) => snitt(p.trumfLengde).toFixed(2)));
rad("  valgte lengste farge", profiler.map((p) => pst(p.trumfVarLengst, p.trumfValg)));
rad("  serie i trumf", profiler.map((p) => snitt(p.trumfSerie).toFixed(2)));
rad("ETTERLYS valør", profiler.map((p) => snitt(p.etterlysVerdi).toFixed(2)));
rad("  tok høyeste lovlige", profiler.map((p) => pst(p.etterlysVarHøyest, p.etterlysAntall)));
rad("STIKK som budvinner", profiler.map((p) => snitt(p.lagStikk).toFixed(2)));
rad("  budet var", profiler.map((p) => snitt(p.budTall).toFixed(2)));
rad("  overskudd", profiler.map((p) => (snitt(p.lagStikk) - snitt(p.budTall)).toFixed(2)));
rad("  innfridd", profiler.map((p) => pst(p.klart, p.kontrakter)));
rad("  kontrakter", profiler.map((p) => String(p.kontrakter)));

// --- Varig atferdslogg -----------------------------------------------------
// Én linje per kandidat per kjoering. Feltnavnene er de samme som radene
// over, saa tabellen og serien aldri kan komme i utakt.
if (jsonlFil !== null) {
  const andel = (a: number, b: number): number | null => (b === 0 ? null : a / b);
  for (let i = 0; i < kandidater.length; i++) {
    const p = profiler[i]!;
    appendFileSync(
      jsonlFil,
      JSON.stringify({
        tid: new Date().toISOString(),
        merke,
        kandidat: kandidater[i]!.navn,
        givere: kamper,
        budSnitt: snitt(p.bud),
        passandel: andel(p.pass, p.budAnledninger),
        budMinst9: andel(p.bud.filter((b) => b >= 9).length, p.bud.length),
        vrakValoer: snitt(p.vrakVerdi),
        vrakEssKonge: andel(p.vrakEssKonge, p.vrakAntall),
        vrakEgenTrumf: andel(p.vrakTrumfFarge, p.vrakAntall),
        trumfLengde: snitt(p.trumfLengde),
        trumfLengste: andel(p.trumfVarLengst, p.trumfValg),
        trumfSerie: snitt(p.trumfSerie),
        etterlysValoer: snitt(p.etterlysVerdi),
        etterlysHoeyest: andel(p.etterlysVarHøyest, p.etterlysAntall),
        lagStikk: snitt(p.lagStikk),
        budTall: snitt(p.budTall),
        overskudd: snitt(p.lagStikk) - snitt(p.budTall),
        innfridd: andel(p.klart, p.kontrakter),
        kontrakter: p.kontrakter,
      }) + String.fromCharCode(10),
    );
  }
  console.log(`
Skrev ${kandidater.length} atferdslinjer til ${jsonlFil}`);
}
