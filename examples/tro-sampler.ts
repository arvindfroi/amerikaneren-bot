/**
 * GJØR TROEN VERDENSTREKKEREN BEDRE?
 *
 *   node examples/tro-sampler.ts --spek "<agentspek>" --giver 300 --kand 12 \
 *     --ut analyse/trosampler.jsonl
 *
 * Verdenstrekkeren vekter i dag verdener bare etter BUDET (`budForenlighet`) –
 * en håndstyrkeformel mot budet spilleren avga. Ingenting av hvordan de har
 * SPILT teller. Trosnettet treffer 46,6 % mot tellingens 31,5 %, så spørsmålet
 * er om den treffsikkerheten kan gjøres om til bedre verdener.
 *
 * ============================== MÅLTALLET =================================
 *
 * Andel SKJULTE kort som havner hos riktig spiller i de trukne verdenene.
 * Bare kortene vi ikke ser telles – de vi ser er ikke gjetning, og å ta dem
 * med ville løftet begge armene like mye og skjult forskjellen.
 *
 * Det er et direkte mål på verdenskvalitet, og det kommer FØR spørsmålet om
 * poeng. Er verdenene ikke bedre, er det ingen vits i å måle noe nedstrøms.
 *
 * ========================= HVORFOR IMPORTANCE SAMPLING ====================
 *
 * Vi bygger ikke verdener fra troen direkte. Å plassere kort etter en
 * sannsynlighetsfordeling OG samtidig respektere håndstørrelser, renonser og
 * det etterlyste kortet er et skranke-problem som lett gir skjeve utfall der
 * skrankene biter.
 *
 * I stedet trekkes N lovlige kandidatverdener med den eksisterende trekkeren –
 * som allerede håndterer alle skrankene – og troen brukes til å VELGE blant
 * dem. Da kan resultatet aldri bli ulovlig, og forskjellen måler nøyaktig det
 * troen bidrar med.
 *
 * FORBEHOLDET SOM FØLGER: importance sampling kan bare velge blant verdener
 * som faktisk ble trukket. Er den ekte verdenen aldri blant kandidatene, kan
 * ingen vekting finne den. Derfor rapporteres også hva DEN BESTE kandidaten
 * ville gitt – taket for metoden med det antall kandidater.
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { e1SpillTrekk, E1_SPILL_DIM_V8 } from "../src/e1/trekk.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { Budagent, lesBudmodell } from "../src/moe2/budagent.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { Vrakrangerer } from "../src/moe2/vrakrang.ts";
import { nettFraBytes } from "../src/nevro/nett.ts";
import { Trosnett, TRO_INN } from "../src/moe2/trosnett.ts";
import { trekkVerden, type Verden } from "../src/solver/sampler.ts";
import { intTilKort } from "../src/solver/dds.ts";

let givere = 300;
let frøBase = 610_000_000;
let skardI = 0;
let skardN = 1;
let spek = "nevro";
let kand = 12;
let trofil = "e1-modell/tro.bin";
let ut = "analyse/trosampler.jsonl";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--giver") givere = Number(process.argv[++i]);
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--spek") spek = process.argv[++i]!;
  else if (a === "--kand") kand = Number(process.argv[++i]);
  else if (a === "--tro") trofil = process.argv[++i]!;
  else if (a === "--ut") ut = process.argv[++i]!;
  else if (a === "--skard") {
    const [x, y] = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(x);
    skardN = Number(y);
  }
}

type Agent = { velgHandling(s: GameState): Handling; nyKamp(): void };
function lag(s: string): Agent {
  if (s === "nevro") return new NevroAgent();
  if (s.startsWith("vakt:")) {
    const v = delVaktspek(s);
    if (v === null) throw new Error(`Ugyldig vaktspek «${s}»`);
    return new Konvensjonsvakt(lag(v.indre), v.valg);
  }
  if (s.startsWith("vr:")) {
    const r = s.slice(3);
    const i = r.indexOf(":");
    const j = r.indexOf(":", i + 1);
    if (i < 0 || j < 0) throw new Error(`Ugyldig vr-spek «${s}»`);
    const n = nettFraBytes(new Uint8Array(readFileSync(r.slice(0, i))))[0];
    if (n === undefined) throw new Error("tomme vekter");
    return new Vrakrangerer(lag(r.slice(j + 1)), n, r.slice(i + 1, j));
  }
  if (s.startsWith("budm:")) {
    const r = s.slice(5);
    const k = r.indexOf(":");
    if (k < 0) throw new Error(`Ugyldig budm-spek «${s}»`);
    const hode = r.slice(0, k);
    const at = hode.lastIndexOf("@");
    const fil = at < 0 ? hode : hode.slice(0, at);
    const ev = at < 0 ? 2.5 : Number(hode.slice(at + 1));
    return new Budagent(lag(r.slice(k + 1)), lesBudmodell(fil), ev);
  }
  if (s.startsWith("e1:")) return E1Agent.fraFil(s.slice(3));
  throw new Error(`Ukjent spek «${s}»`);
}

const relSete = (sete: number, annet: number): number => (annet - sete + 4) % 4;

/** Hvilke kort er skjult for `sete`, og hvor ligger de EGENTLIG. */
function fasit(s: GameState, sete: number): Map<number, number> {
  const synlig = new Set<number>();
  for (const k of s.hender[sete] ?? []) synlig.add(kortIndeks(k));
  for (const stikk of s.historikk) for (const kp of stikk.kort) synlig.add(kortIndeks(kp.kort));
  for (const kp of s.bord) synlig.add(kortIndeks(kp.kort));
  if (s.budvinner === sete) for (const k of s.vrak) synlig.add(kortIndeks(k));

  const m = new Map<number, number>();
  for (let p = 0; p < s.antallSpillere; p++) {
    if (p === sete) continue;
    for (const k of s.hender[p] ?? []) {
      const i = kortIndeks(k);
      if (!synlig.has(i)) m.set(i, relSete(sete, p));
    }
  }
  if (s.budvinner !== sete) {
    for (const k of s.vrak) {
      const i = kortIndeks(k);
      if (!synlig.has(i)) m.set(i, 4);
    }
  }
  return m;
}

/** Hvor verdenen PÅSTÅR hvert skjult kort ligger. 0 = ikke plassert. */
function plassering(v: Verden, sete: number, N: number): number[] {
  const ut = new Array<number>(52).fill(0);
  for (let p = 0; p < N; p++) {
    if (p === sete) continue;
    for (const c of v.hender[p] ?? []) ut[kortIndeks(intTilKort(c))] = relSete(sete, p);
  }
  return ut;
}

/** Andel av fasitens skjulte kort som verdenen plasserer riktig. */
function treff(pl: readonly number[], f: Map<number, number>): number {
  if (f.size === 0) return 1;
  let r = 0;
  for (const [kort, ekte] of f) if (pl[kort] === ekte) r++;
  return r / f.size;
}

const trosnett = new Trosnett(nettFraBytes(new Uint8Array(readFileSync(trofil)))[0]!);
mkdirSync(dirname(ut), { recursive: true });
const agenter = [0, 1, 2, 3].map(() => lag(spek));
let rng = 987654 + skardI * 6151;
const tilf = (): number => {
  rng = (rng * 1103515245 + 12345) & 0x7fffffff;
  return rng / 0x7fffffff;
};

let skrevet = 0;
for (let g = skardI; g < givere; g += skardN) {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frøBase + g * 7717);
  for (const a of agenter) a.nyKamp();
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    if (s.fase === "SPILL" && s.trumf !== null && tilf() < 0.35) {
      const f = fasit(s, iTur);
      if (f.size > 0) {
        // Trekk kandidatverdener EN gang; begge armene ser de samme.
        // Uten det ville forskjellen delvis vaert ulike trekninger.
        const verdener: Verden[] = [];
        for (let i = 0; i < kand; i++) {
          const w = trekkVerden(s, iTur, tilf);
          if (w !== null) verdener.push(w);
        }
        if (verdener.length >= 2) {
          const x = new Float32Array(TRO_INN);
          x.set(e1SpillTrekk(s, iTur, E1_SPILL_DIM_V8));
          const ford = trosnett.fordeling(x);
          const pl = verdener.map((w) => plassering(w, iTur, s.antallSpillere));
          const tr = pl.map((p) => treff(p, f));
          const vekt = pl.map((p) => trosnett.logVekt(ford, p));
          // NAAVAERENDE: uniformt valg blant kandidatene (det trekkeren gjoer
          // naar budinformasjon mangler). TRO: velg den troen liker best.
          const snitt = tr.reduce((a, b) => a + b, 0) / tr.length;
          let best = 0;
          for (let i = 1; i < vekt.length; i++) if (vekt[i]! > vekt[best]!) best = i;
          const tak = Math.max(...tr);
          appendFileSync(
            ut,
            JSON.stringify({
              frø: s.frø,
              stikk: s.stikkSpilt,
              skjult: f.size,
              n: verdener.length,
              uniform: Math.round(snitt * 10000) / 10000,
              tro: Math.round(tr[best]! * 10000) / 10000,
              tak: Math.round(tak * 10000) / 10000,
            }) + "\n",
          );
          skrevet++;
        }
      }
    }
    s = utfør(s, agenter[iTur]!.velgHandling(s)).state;
  }
  if (skrevet % 500 === 0 && skrevet > 0) process.stdout.write(`  skard ${skardI}: ${skrevet}\r`);
}
console.log(`\nSkard ${skardI} ferdig: ${skrevet} stillinger -> ${ut}`);
