/**
 * ATFERDSPROFIL FOR MENNESKENE – samme mål som examples/mesterai-atferd.ts,
 * men kandidaten er de ekte spillerne fra nettsiden.
 *
 *   node examples/menneske-atferd.ts            (bare nevro som referanse)
 *   node examples/menneske-atferd.ts --sd 12    (òg SD-orakelet, 12 verdener)
 *
 * DATAGRUNNLAGET. Val Town-valen `arvindfroi/amerikaneren-data` logger hvert
 * menneskevalg fra nettsiden. Loggen inneholder IKKE hendene – men den
 * inneholder `frø`, og motoren deler ut med `delUt(frø, rundeNr)`, som er rent
 * deterministisk. Givene kan derfor gjenskapes eksakt.
 *
 * TRIKSET som gjør hele stillingen tilgjengelig gjennom det offentlige API-et:
 *
 *     blandeSeed(frø, rn) = frø + (rn+1)·2654435761   (motor.ts:154)
 *
 * så `opprettSpill(regler, frø + rn·2654435761)` gir runde `rn`s giv som en
 * fersk runde-0-tilstand. Ingen intern funksjon trengs, og ingen kopi av
 * utdelingslogikken kan komme i utakt med motoren.
 *
 * DEN ANDRE REKONSTRUKSJONEN – vraket. Loggen sier bare HVOR MANGE kort som
 * ble vraket, ikke hvilke. Men den logger hvert eneste kort mennesket spilte,
 * og ved rundeslutt er hånden tom. De 12 spilte kortene ER altså hånden etter
 * vrak, og
 *
 *     vrak = (utdelt hånd + talong) − spilte kort
 *
 * gir de fire vrakede kortene eksakt. Det åpner VRAK, TRUMF og UTSPILL for
 * måling – de tre beslutningene loggen ellers ikke ville kunne svare på.
 *
 * PARRINGEN. For hver runde der mennesket var budvinner bygges stillingen opp
 * igjen med utfør(): budrunden drives til sete 0 vinner med det budet loggen
 * har, menneskets faktiske vrak utføres, menneskets faktiske trumf og
 * etterlysning utføres. Da står stillingen nøyaktig der mennesket skulle
 * spille ut, og NevroHjerne og SD spørres om NØYAKTIG den stillingen.
 * Ingen rad sammenlikner tall fra ulike stillinger.
 *
 * KORREKTHETSPORTEN. Rekonstruksjonen er bare gyldig hvis de 12 spilte kortene
 * ligger inne i de 16 kortene mennesket hadde. Det sjekkes for HVER runde, og
 * antallet som feiler skrives ut. Er det tallet ikke ~0, er frø-koblingen feil
 * og resten av tabellen er verdiløs – da skal den ikke leses.
 *
 * TRE TING SOM IKKE ER PARRET, OG SOM ER MERKET DERETTER
 *   - BUD: SD-budet regnes på menneskets hånd, men budrunden mennesket satt i
 *     er ikke gjenskapt (botenes bud logges ikke). Raden måler håndstyrke mot
 *     bud, ikke valg i samme budstilling.
 *   - Budrunden i den gjenskapte stillingen er kunstig (alle andre passer).
 *     Kortspillet påvirkes bare hvis nettets inputvektor leser budhistorikken.
 *   - Giveren roterer med rundeNr i den ekte kampen, men er 0 her. Det flytter
 *     ikke kortene, bare hvem som byr først.
 */

import { readFileSync } from "node:fs";
import { writeFileSync } from "node:fs";

import {
  lovligeEtterlys,
  lovligeHandlinger,
  opprettSpill,
  utfør,
  type Farge,
  type GameState,
  type Handling,
} from "../src/index.ts";
import { FARGER, kortId, lagRng, type Kort } from "../src/kort.ts";
import { analyserGiv, sdBud, tømCache } from "../src/neat/singledummy.ts";
import { besteKortSD } from "../src/moe2/sdkort.ts";
import { NevroAgent } from "../src/nevro/index.ts";

const DATA = "analyse/menneskedata";
let sdVerdener = 0;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--sd") sdVerdener = Number(process.argv[++i]);
}

const nevro = new NevroAgent();
const rng = lagRng(4711);

// --- Innlesing --------------------------------------------------------------

interface Parti {
  readonly frø: number;
  readonly mot: string;
  readonly navn: string;
}
const partier = new Map<string, Parti>();
for (const l of readFileSync(`${DATA}/partier.txt`, "utf8").trim().split("\n")) {
  const [g, frø, mot, , navn] = l.split("|");
  partier.set(g!, { frø: Number(frø), mot: mot!, navn: navn ?? "" });
}

interface Runde {
  readonly g: string;
  readonly rn: number;
  readonly bv: number;
  readonly mtype: string;
  readonly mbud: number;
  readonly klart: boolean;
  readonly lagStikk: number;
  readonly stikk0: number;
  /** Menneskets budhandlinger i runden, i loggrekkefølge. */
  readonly bud: readonly string[];
  readonly trumf: Farge | null;
  readonly etterlyst: Kort | null;
}
const runder: Runde[] = [];
for (const fil of ["runder-1.txt", "runder-2.txt"]) {
  for (const l of readFileSync(`${DATA}/${fil}`, "utf8").trim().split("\n")) {
    const f = l.split("|");
    const tr = f[9] ?? "";
    let trumf: Farge | null = null;
    let etterlyst: Kort | null = null;
    if (tr.length > 0) {
      trumf = tr[0] as Farge;
      const e = tr.slice(2);
      if (e !== "-" && e.length > 1) {
        etterlyst = { farge: e[0] as Farge, verdi: Number(e.slice(1)) as Kort["verdi"] };
      }
    }
    runder.push({
      g: f[0]!, rn: Number(f[1]), bv: Number(f[2]), mtype: f[3]!, mbud: Number(f[4]),
      klart: f[5] === "1", lagStikk: Number(f[6]), stikk0: Number(f[7]!.split(",")[0]),
      bud: (f[8] ?? "").length > 0 ? f[8]!.split(",") : [],
      trumf, etterlyst,
    });
  }
}

/** Menneskets spilte kort per runde, i stikkrekkefølge. Bare budvinnerrunder. */
const spilte = new Map<string, Kort[]>();
for (const l of readFileSync(`${DATA}/kort-budvinner.txt`, "utf8").trim().split("\n")) {
  const f = l.split("|");
  const par = f[3]!.split(",").map((s) => {
    const m = /^(\d+)([SHRK])(\d+)$/.exec(s)!;
    return { st: Number(m[1]), k: { farge: m[2] as Farge, verdi: Number(m[3]) as Kort["verdi"] } };
  });
  par.sort((a, b) => a.st - b.st);
  spilte.set(`${f[0]}|${f[1]}`, par.map((p) => p.k));
}

// --- Gjenskaping ------------------------------------------------------------

/** Runde `rn`s giv som en fersk runde-0-tilstand. Se hodekommentaren. */
function givenFor(frø: number, rn: number): GameState {
  return opprettSpill({ antallSpillere: 4 }, (frø + Math.imul(rn, 2654435761)) >>> 0);
}

const tell = (h: readonly Kort[], f: Farge): number => h.filter((k) => k.farge === f).length;
const sum = (h: readonly Kort[], f: Farge): number =>
  h.filter((k) => k.farge === f).reduce((a, k) => a + k.verdi, 0);

function lengsteFarge(h: readonly Kort[]): Farge {
  let beste: Farge = "S";
  let bn = -1;
  let bs = -1;
  for (const f of FARGER) {
    const n = tell(h, f);
    const s = sum(h, f);
    if (n > bn || (n === bn && s > bs)) { beste = f; bn = n; bs = s; }
  }
  return beste;
}

/** «Sterkest» = flest kort, men honnører teller ekstra. Arvinds hypotese. */
function sterksteFarge(h: readonly Kort[]): Farge {
  let beste: Farge = "S";
  let bp = -Infinity;
  for (const f of FARGER) {
    const kort = h.filter((k) => k.farge === f);
    const p = kort.length + kort.filter((k) => k.verdi >= 12).length * 0.75;
    if (p > bp) { beste = f; bp = p; }
  }
  return beste;
}

// --- Innsamling -------------------------------------------------------------

interface Boks { n: number; sum: number; kvad: number }
const nyBoks = (): Boks => ({ n: 0, sum: 0, kvad: 0 });
const legg = (b: Boks, x: number): void => { b.n++; b.sum += x; b.kvad += x * x; };
const snitt = (b: Boks): number => (b.n === 0 ? NaN : b.sum / b.n);
const se = (b: Boks): number => {
  if (b.n < 2) return NaN;
  const m = snitt(b);
  return Math.sqrt(Math.max(0, b.kvad / b.n - m * m) / (b.n - 1));
};

const M: Record<string, Boks> = {};
const boks = (navn: string): Boks => (M[navn] ??= nyBoks());

let avvistHånd = 0;
let brukteRunder = 0;
let paretteStillinger = 0;

// --- 1. BUD: menneskets hånd mot SD-orakelet --------------------------------

for (const r of runder) {
  const p = partier.get(r.g);
  if (p === undefined) continue;
  const s = givenFor(p.frø, r.rn);
  const hånd = s.hender[0] ?? [];
  if (hånd.length !== 12) { avvistHånd++; continue; }
  brukteRunder++;

  // Menneskets høyeste tallbud i runden; PASS hvis det aldri bød tall.
  let mitt = -1;
  let harTall = false;
  for (const b of r.bud) {
    const n = Number(b);
    if (Number.isFinite(n)) { harTall = true; if (n > mitt) mitt = n; }
  }
  const sd = sdBud(analyserGiv(s, nevro), 0, s.giving.antallStikk);
  legg(boks("BUD sd-estimat for hånden"), sd);
  legg(boks("BUD passandel (aldri tallbud)"), harTall ? 0 : 1);
  if (harTall) {
    legg(boks("BUD menneskets høyeste bud"), mitt);
    legg(boks("BUD avvik menneske − SD"), mitt - sd);
    legg(boks("BUD andel bud ≥ 9"), mitt >= 9 ? 1 : 0);
    legg(boks("BUD andel bud ≥ 7"), mitt >= 7 ? 1 : 0);
  }
  if (r.bv === 0 && r.mtype === "tall") {
    legg(boks("BUD/kontrakt SD sa"), sd);
    legg(boks("BUD/kontrakt mennesket meldte"), r.mbud);
    legg(boks("BUD/kontrakt laget tok"), r.lagStikk);
    legg(boks("BUD/kontrakt bom menneske |bud−fasit|"), Math.abs(r.mbud - r.lagStikk));
    legg(boks("BUD/kontrakt bom SD |sd−fasit|"), Math.abs(sd - r.lagStikk));
  }
  tømCache();
}

// --- 2-4. VRAK, TRUMF og UTSPILL – parret mot nevro (og SD) -----------------

for (const r of runder) {
  if (r.bv !== 0 || r.trumf === null) continue;
  const p = partier.get(r.g);
  const spilt = spilte.get(`${r.g}|${r.rn}`);
  if (p === undefined || spilt === undefined || spilt.length !== 12) continue;

  let s = givenFor(p.frø, r.rn);
  const hånd16 = [...(s.hender[0] ?? []), ...s.talong];
  // KORREKTHETSPORTEN: de spilte kortene må ligge inne i de 16.
  const igjen = new Map<string, number>();
  for (const k of hånd16) igjen.set(kortId(k), (igjen.get(kortId(k)) ?? 0) + 1);
  let ok = true;
  for (const k of spilt) {
    const n = igjen.get(kortId(k)) ?? 0;
    if (n === 0) { ok = false; break; }
    igjen.set(kortId(k), n - 1);
  }
  if (!ok) { avvistHånd++; continue; }
  const vrak: Kort[] = [];
  for (const k of hånd16) if ((igjen.get(kortId(k)) ?? 0) > 0) {
    vrak.push(k);
    igjen.set(kortId(k), igjen.get(kortId(k))! - 1);
  }
  if (vrak.length !== 4) { avvistHånd++; continue; }

  // Driv budrunden til sete 0 vinner med menneskets bud.
  let vakt = 0;
  let bydd = false;
  while (s.fase === "BUDRUNDE" && vakt++ < 200) {
    const lov = lovligeHandlinger(s);
    if (lov.fase !== "BUDRUNDE") break;
    if (s.iTur === 0 && !bydd) {
      const mål = r.mtype === "tall" ? r.mbud : 12;
      let valgt: number | "PASS" = "PASS";
      for (const b of lov.bud) if (typeof b === "number" && b <= mål) {
        if (valgt === "PASS" || b > valgt) valgt = b;
      }
      if (valgt === "PASS") break;
      bydd = true;
      s = utfør(s, { type: "BUD", spiller: 0, bud: valgt }).state;
    } else {
      s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
    }
  }
  if (s.fase !== "VRAK" || s.budvinner !== 0) continue;

  // --- VRAK: hva ville nevro vraket i samme stilling? ---
  const nevroVrak = nevro.velgHandling(s);
  if (nevroVrak.type === "VRAK") {
    legg(boks("VRAK nevro: snittvalør"), nevroVrak.kort.reduce((a, k) => a + k.verdi, 0) / nevroVrak.kort.length);
    legg(boks("VRAK nevro: ess/konge"), nevroVrak.kort.filter((k) => k.verdi >= 13).length / nevroVrak.kort.length);
    legg(boks("VRAK nevro: i senere trumf"), nevroVrak.kort.filter((k) => k.farge === r.trumf).length / nevroVrak.kort.length);
    const likt = nevroVrak.kort.filter((k) => vrak.some((v) => kortId(v) === kortId(k))).length;
    legg(boks("VRAK ENIGHET (kort av 4)"), likt / 4);
  }
  legg(boks("VRAK menneske: snittvalør"), vrak.reduce((a, k) => a + k.verdi, 0) / 4);
  legg(boks("VRAK menneske: ess/konge"), vrak.filter((k) => k.verdi >= 13).length / 4);
  legg(boks("VRAK menneske: i senere trumf"), vrak.filter((k) => k.farge === r.trumf).length / 4);
  let tømt = 0;
  for (const f of FARGER) if (tell(hånd16, f) > 0 && tell(spilt, f) === 0) tømt++;
  legg(boks("VRAK menneske: farger tømt"), tømt);

  s = utfør(s, { type: "VRAK", spiller: 0, kort: vrak }).state;
  if (s.fase !== "VELG") continue;

  // --- TRUMF: menneskets valg mot nevros, i samme stilling ---
  const hånd12 = s.hender[0] ?? [];
  legg(boks("TRUMF menneske: trumflengde"), tell(hånd12, r.trumf));
  legg(boks("TRUMF menneske: valgte lengste"), r.trumf === lengsteFarge(hånd12) ? 1 : 0);
  legg(boks("TRUMF menneske: valgte «sterkeste»"), r.trumf === sterksteFarge(hånd12) ? 1 : 0);
  const nevroVelg = nevro.velgHandling(s);
  if (nevroVelg.type === "VELG") {
    legg(boks("TRUMF nevro: trumflengde"), tell(hånd12, nevroVelg.trumf));
    legg(boks("TRUMF nevro: valgte lengste"), nevroVelg.trumf === lengsteFarge(hånd12) ? 1 : 0);
    legg(boks("TRUMF nevro: valgte «sterkeste»"), nevroVelg.trumf === sterksteFarge(hånd12) ? 1 : 0);
    legg(boks("TRUMF ENIGHET om farge"), nevroVelg.trumf === r.trumf ? 1 : 0);
    if (nevroVelg.etterlyst !== null) legg(boks("TRUMF nevro: etterlyst valør"), nevroVelg.etterlyst.verdi);
  }
  if (r.etterlyst !== null) {
    legg(boks("TRUMF menneske: etterlyst valør"), r.etterlyst.verdi);
    const lovlige = lovligeEtterlys(s, r.trumf);
    let høyest = -1;
    for (const k of lovlige) if (k.verdi > høyest) høyest = k.verdi;
    if (høyest > 0) legg(boks("TRUMF menneske: etterlyste høyeste lovlige"), r.etterlyst.verdi === høyest ? 1 : 0);
  }

  s = utfør(s, { type: "VELG", spiller: 0, trumf: r.trumf, etterlyst: r.etterlyst }).state;
  if (s.fase !== "SPILL" || s.iTur !== 0) continue;
  paretteStillinger++;

  // --- UTSPILL i stikk 1: menneske mot nevro mot SD, samme stilling ---
  const trumfPåHånd = hånd12.filter((k) => k.farge === r.trumf);
  const høyesteEgen = Math.max(...trumfPåHånd.map((k) => k.verdi));
  const lavesteEgen = Math.min(...trumfPåHånd.map((k) => k.verdi));
  const kandidater: { navn: string; kort: Kort | null }[] = [
    { navn: "menneske", kort: spilt[0]! },
    { navn: "nevro", kort: (() => { const h = nevro.velgHandling(s); return h.type === "SPILL" ? h.kort : null; })() },
  ];
  if (sdVerdener > 0) {
    kandidater.push({ navn: "SD", kort: besteKortSD(s, 0, nevro, { verdener: sdVerdener, rng }) });
  }
  for (const kand of kandidater) {
    const k = kand.kort;
    if (k === null) continue;
    const g = `UTSPILL ${kand.navn}`;
    legg(boks(`${g}: trumf ut`), k.farge === r.trumf ? 1 : 0);
    legg(boks(`${g}: valør på utspillet`), k.verdi);
    legg(boks(`${g}: lavt kort (≤7)`), k.verdi <= 7 ? 1 : 0);
    legg(boks(`${g}: LAV TRUMF ut (≤7)`), k.farge === r.trumf && k.verdi <= 7 ? 1 : 0);
    if (k.farge === r.trumf) {
      legg(boks(`${g}: høyeste trumf på hånd`), k.verdi === høyesteEgen ? 1 : 0);
      legg(boks(`${g}: laveste trumf på hånd`), k.verdi === lavesteEgen ? 1 : 0);
    }
  }
  tømCache();
}

// --- Rapporten --------------------------------------------------------------

const linjer: string[] = [];
const ut = (s: string): void => { linjer.push(s); console.log(s); };

ut(`=== ATFERDSPROFIL: MENNESKENE fra nettsiden ===`);
ut(`Kilde: Val Town-valen arvindfroi/amerikaneren-data, ${runder.length} runder, ${partier.size} partier.`);
ut(`Runder med gjenskapt hånd: ${brukteRunder}. Parrede utspillsstillinger: ${paretteStillinger}.`);
ut(`KORREKTHETSPORTEN – runder forkastet fordi kortene ikke stemte: ${avvistHånd}`);
ut(avvistHånd > 5
  ? `  ADVARSEL: for mange avvik. Frø-koblingen er feil – IKKE les tabellen under.`
  : `  Rekonstruksjonen holder.`);
ut(``);
ut("mål".padEnd(42) + "verdi".padStart(9) + "SE".padStart(8) + "n".padStart(7));
ut("-".repeat(66));
let forrige = "";
for (const navn of Object.keys(M)) {
  const gruppe = navn.split(" ")[0]!;
  if (gruppe !== forrige) { ut(""); forrige = gruppe; }
  const b = M[navn]!;
  ut(navn.padEnd(42) + snitt(b).toFixed(3).padStart(9) + se(b).toFixed(3).padStart(8) +
    `${b.n}${b.n < 50 ? " *" : ""}`.padStart(7));
}
ut(``);
ut(`* = under 50 observasjoner, for tynt til å lese som funn.`);

writeFileSync("analyse/menneske-atferd.txt", linjer.join("\n") + "\n");
writeFileSync("analyse/menneske-atferd.json", JSON.stringify(
  { brukteRunder, paretteStillinger, avvistHånd,
    mål: Object.fromEntries(Object.entries(M).map(([k, b]) => [k, { snitt: snitt(b), se: se(b), n: b.n }])) },
  null, 2));
console.log(`\nSkrev analyse/menneske-atferd.txt og .json`);
