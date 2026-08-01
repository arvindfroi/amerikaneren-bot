/**
 * ER MENNESKENE BEDRE ENN OSS PÅ VRAK OG TRUMFVALG?
 *
 *   node examples/menneske-vrak.ts
 *
 * De to beslutningene menneskeklokka sier er vanskeligst – 33,4 s per vrak og
 * 27,0 s per trumfvalg, mot 4,1 s per kortvalg – er også de to der vi ikke har
 * noen målt vinner. Vrakfasiten har aldri bestått en port, og trumfvalget er
 * en håndlagd formel.
 *
 * Nå kan de måles mot ekte menneskevalg. Rekonstruksjonen fra nettsidedataene
 * er verifisert (0 av 813 runder forkastet), så for hver menneskeledede
 * kontrakt kjenner vi de 16 kortene, de 4 vrakede og trumfen med etterlysning.
 *
 * DESIGNET er tre armer på NØYAKTIG samme giv, med identisk kortspill etterpå:
 *
 *   A  botens vrak    + botens trumf     (rent bot)
 *   B  MENNESKETS vrak + botens trumf    (isolerer vraket)
 *   C  MENNESKETS vrak + MENNESKETS trumf (hele menneskebeslutningen)
 *
 * B − A er verdien av menneskets vrak. C − B er verdien av trumfvalget.
 * Kortspillet fra stikk 1 gjøres av VÅR bot i alle tre armene, så forskjellen
 * kan ikke komme fra spilleføringen.
 *
 * FORBEHOLD: menneskets vrak ble valgt med menneskets EGEN plan i tankene, og
 * spilles her ut av boten vår. Et vrak som er riktig for en menneskelig plan
 * kan være feil for botens. Målingen svarer derfor på «er menneskets vrak
 * bedre for OSS», ikke «er mennesket bedre til å vrake».
 */

import { readFileSync, writeFileSync } from "node:fs";

import { lovligeHandlinger, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { kortId, type Farge, type Kort } from "../src/kort.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";

const DATA = "analyse/menneskedata";
const SPEK = "vakt:ab:e1:e1-modell/sd-r2.bin";
const vakt = delVaktspek(SPEK)!;
const nett = lesE1Nett(vakt.indre.slice(3));
const nevro = new NevroAgent();
const lagBot = (): Konvensjonsvakt => new Konvensjonsvakt(new E1Agent(nett), vakt.valg);

const frøFor = new Map<string, number>();
for (const l of readFileSync(`${DATA}/partier.txt`, "utf8").trim().split("\n")) {
  const f = l.split("|");
  frøFor.set(f[0]!, Number(f[1]));
}

interface Runde { g: string; rn: number; mbud: number; trumf: Farge; etterlyst: Kort | null }
const runder: Runde[] = [];
for (const fil of ["runder-1.txt", "runder-2.txt"]) {
  for (const l of readFileSync(`${DATA}/${fil}`, "utf8").trim().split("\n")) {
    const f = l.split("|");
    if (f[2] !== "0" || f[3] !== "tall" || (f[9] ?? "") === "") continue;
    const tr = f[9]!;
    const e = tr.slice(2);
    runder.push({
      g: f[0]!, rn: Number(f[1]), mbud: Number(f[4]), trumf: tr[0] as Farge,
      etterlyst: e !== "-" && e.length > 1
        ? { farge: e[0] as Farge, verdi: Number(e.slice(1)) as Kort["verdi"] } : null,
    });
  }
}

const spilte = new Map<string, Kort[]>();
for (const l of readFileSync(`${DATA}/kort-budvinner.txt`, "utf8").trim().split("\n")) {
  const f = l.split("|");
  spilte.set(`${f[0]}|${f[1]}`, f[3]!.split(",").map((s) => {
    const m = /^(\d+)([SHRK])(\d+)$/.exec(s)!;
    return { farge: m[2] as Farge, verdi: Number(m[3]) as Kort["verdi"] };
  }));
}

const givenFor = (frø: number, rn: number): GameState =>
  opprettSpill({ antallSpillere: 4 }, (frø + Math.imul(rn, 2654435761)) >>> 0);

/** Driver budrunden til sete 0 vinner med `bud`. */
function tilVrak(s: GameState, bud: number): GameState | null {
  let g = 0;
  let bydd = false;
  while (s.fase === "BUDRUNDE" && g++ < 200) {
    const lov = lovligeHandlinger(s);
    if (lov.fase !== "BUDRUNDE") break;
    if (s.iTur === 0 && !bydd) {
      let valgt: number | null = null;
      for (const b of lov.bud) if (typeof b === "number" && b <= bud && (valgt === null || b > valgt)) valgt = b;
      if (valgt === null) return null;
      bydd = true;
      s = utfør(s, { type: "BUD", spiller: 0, bud: valgt }).state;
    } else s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  return s.fase === "VRAK" && s.budvinner === 0 ? s : null;
}

/** Spiller ut fra VRAK-fasen med gitte valg, og returnerer lagstikk. */
function spillUt(s: GameState, vrak: Kort[] | null, trumf: { t: Farge; e: Kort | null } | null): number | null {
  const bot = lagBot();
  bot.nyKamp();
  try {
    s = utfør(s, vrak !== null ? { type: "VRAK", spiller: 0, kort: vrak } : bot.velgHandling(s)).state;
    if (s.fase !== "VELG") return null;
    s = utfør(s, trumf !== null
      ? { type: "VELG", spiller: 0, trumf: trumf.t, etterlyst: trumf.e }
      : bot.velgHandling(s)).state;
  } catch { return null; }
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    s = utfør(s, s.iTur === 0 ? bot.velgHandling(s) : nevro.velgHandling(s)).state;
  }
  const st = s.stikkVunnet;
  return (st[0] ?? 0) + (s.makker !== null ? (st[s.makker] ?? 0) : 0);
}

const A: number[] = [];
const B: number[] = [];
const C: number[] = [];
let hoppet = 0;
for (const r of runder) {
  const frø = frøFor.get(r.g);
  const spilt = spilte.get(`${r.g}|${r.rn}`);
  if (frø === undefined || spilt === undefined || spilt.length !== 12) { hoppet++; continue; }
  const grunn = givenFor(frø, r.rn);
  const hånd16 = [...(grunn.hender[0] ?? []), ...grunn.talong];
  const igjen = new Map<string, number>();
  for (const k of hånd16) igjen.set(kortId(k), (igjen.get(kortId(k)) ?? 0) + 1);
  let ok = true;
  for (const k of spilt) {
    const n = igjen.get(kortId(k)) ?? 0;
    if (n === 0) { ok = false; break; }
    igjen.set(kortId(k), n - 1);
  }
  if (!ok) { hoppet++; continue; }
  const menneskeVrak: Kort[] = [];
  for (const k of hånd16) if ((igjen.get(kortId(k)) ?? 0) > 0) {
    menneskeVrak.push(k);
    igjen.set(kortId(k), igjen.get(kortId(k))! - 1);
  }
  if (menneskeVrak.length !== 4) { hoppet++; continue; }

  const start = tilVrak(grunn, r.mbud);
  if (start === null) { hoppet++; continue; }
  const a = spillUt(start, null, null);
  const b = spillUt(start, menneskeVrak, null);
  const c = spillUt(start, menneskeVrak, { t: r.trumf, e: r.etterlyst });
  if (a === null || b === null || c === null) { hoppet++; continue; }
  A.push(a); B.push(b); C.push(c);
}

const snitt = (v: readonly number[]): number => v.reduce((x, y) => x + y, 0) / v.length;
const parret = (x: readonly number[], y: readonly number[]): string => {
  const d = x.map((v, i) => v - y[i]!);
  const m = snitt(d);
  let sq = 0;
  for (const v of d) sq += (v - m) * (v - m);
  return `${m >= 0 ? "+" : ""}${m.toFixed(3)} ± ${Math.sqrt(sq / (d.length - 1) / d.length).toFixed(3)}`;
};

const linjer = [
  `\n=== Menneskets vrak og trumfvalg mot botens, ${A.length} kontrakter ===`,
  `(${hoppet} runder hoppet over: manglende kortlogg eller budrunde som ikke lot seg gjenskape)`,
  `Kortspillet fra stikk 1 gjøres av ${SPEK} i ALLE armene, nevro i de andre setene.\n`,
  `A  botens vrak    + botens trumf      ${snitt(A).toFixed(3)} lagstikk`,
  `B  MENNESKETS vrak + botens trumf     ${snitt(B).toFixed(3)}`,
  `C  MENNESKETS vrak + MENNESKETS trumf ${snitt(C).toFixed(3)}`,
  ``,
  `  verdien av menneskets VRAK    (B − A)  ${parret(B, A)}`,
  `  verdien av menneskets TRUMF   (C − B)  ${parret(C, B)}`,
  `  hele menneskebeslutningen     (C − A)  ${parret(C, A)}`,
  ``,
  `Positivt = menneskets valg gir FLERE lagstikk enn botens, på samme giv.`,
  ``,
  `FORBEHOLD: menneskets vrak ble valgt med menneskets egen plan i tankene og`,
  `spilles her ut av boten vår. Målingen svarer på «er menneskets valg bedre`,
  `FOR OSS», ikke «er mennesket bedre til å vrake».`,
];
console.log(linjer.join("\n"));
writeFileSync("analyse/menneske-vrak.txt", linjer.join("\n") + "\n");
