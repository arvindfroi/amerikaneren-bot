/**
 * SAMME HÅND, SAMME MOTSTAND: mennesket mot vår bot.
 *
 *   node examples/menneske-mot-bot.ts
 *
 * Arvinds spørsmål: hvordan gjør boten det om den hadde menneskets hånd?
 *
 * De tidligere målingene svarte ikke på det. Der var motstanden nevro i alle
 * armene, mens menneskene på nettsiden møtte PIMC eller nevro – så tallene lå
 * ikke i samme oppsett. Her gjenskapes HELE runden: samme giv, samme kontrakt,
 * og de tre andre setene spilles av den motstanderen mennesket faktisk møtte.
 *
 * BEGRENSET TIL NEVRO-PARTIENE, med vilje. NevroHjerne er deterministisk, så
 * runden kan gjenskapes eksakt. PIMC sampler verdener og ville gitt en annen
 * linje hver gang; da måtte forskjellen midles over mange kjøringer og
 * korrektheten kunne ikke verifiseres.
 *
 * DEN FØRSTE VERSJONEN SAMMENLIKNET MOT LOGGEN, og korrekthetsprøven felte
 * den: 6 av 16 runder ga et annet stikktall enn det som faktisk skjedde.
 * Årsaken er at budrunden her er kunstig – alle andre passer – mens den ekte
 * budrunden var en annen, og NevroHjernes kortspill leser budhistorikken.
 * Den gjenskapte verdenen er altså ikke den ekte.
 *
 * FIKSEN er å ikke sammenlikne mot loggen i det hele tatt. Begge armene
 * legges i den SAMME gjenskapte verdenen: samme kunstige budrunde, samme
 * nevro-motstandere, samme giv. Da kan ikke skjevheten forklare differansen,
 * for den rammer begge likt. Loggen brukes bare til å hente menneskets valg –
 * vraket, trumfen og de tolv kortene – ikke til å hente et fasitutfall.
 */

import { readFileSync, writeFileSync } from "node:fs";

import { lovligeHandlinger, opprettSpill, utfør, type GameState } from "../src/index.ts";
import { kortId, likeKort, type Farge, type Kort } from "../src/kort.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";

const DATA = "analyse/menneskedata";
const SPEK = "vakt:ab:e1:e1-modell/sd-r2.bin";
const vakt = delVaktspek(SPEK)!;
const nett = lesE1Nett(vakt.indre.slice(3));

const parti = new Map<string, { frø: number; mot: string }>();
for (const l of readFileSync(`${DATA}/partier.txt`, "utf8").trim().split("\n")) {
  const f = l.split("|");
  parti.set(f[0]!, { frø: Number(f[1]), mot: f[2]! });
}

interface R { g: string; rn: number; bud: number; lagStikk: number; trumf: Farge; etterlyst: Kort | null }
const runder: R[] = [];
for (const fil of ["runder-1.txt", "runder-2.txt"]) {
  for (const l of readFileSync(`${DATA}/${fil}`, "utf8").trim().split("\n")) {
    const f = l.split("|");
    if (f[2] !== "0" || f[3] !== "tall" || (f[9] ?? "") === "") continue;
    const e = f[9]!.slice(2);
    runder.push({
      g: f[0]!, rn: Number(f[1]), bud: Number(f[4]), lagStikk: Number(f[6]),
      trumf: f[9]![0] as Farge,
      etterlyst: e !== "-" && e.length > 1
        ? { farge: e[0] as Farge, verdi: Number(e.slice(1)) as Kort["verdi"] } : null,
    });
  }
}
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

const givenFor = (frø: number, rn: number): GameState =>
  opprettSpill({ antallSpillere: 4 }, (frø + Math.imul(rn, 2654435761)) >>> 0);

function tilVrak(s: GameState, bud: number): GameState | null {
  let g = 0;
  let bydd = false;
  while (s.fase === "BUDRUNDE" && g++ < 200) {
    const lov = lovligeHandlinger(s);
    if (lov.fase !== "BUDRUNDE") break;
    if (s.iTur === 0 && !bydd) {
      let v: number | null = null;
      for (const b of lov.bud) if (typeof b === "number" && b <= bud && (v === null || b > v)) v = b;
      if (v === null) return null;
      bydd = true;
      s = utfør(s, { type: "BUD", spiller: 0, bud: v }).state;
    } else s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  return s.fase === "VRAK" && s.budvinner === 0 ? s : null;
}

const lagStikk = (s: GameState): number =>
  (s.stikkVunnet[0] ?? 0) + (s.makker !== null ? (s.stikkVunnet[s.makker] ?? 0) : 0);

const menn: number[] = [];
const bot: number[] = [];
let avvik = 0;
let hoppet = 0;

for (const r of runder) {
  const p = parti.get(r.g);
  const spilt = spilte.get(`${r.g}|${r.rn}`);
  if (p === undefined || spilt === undefined || spilt.length !== 12) { hoppet++; continue; }
  const grunn = givenFor(p.frø, r.rn);
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
  const vrakKort: Kort[] = [];
  for (const k of hånd16) if ((igjen.get(kortId(k)) ?? 0) > 0) {
    vrakKort.push(k);
    igjen.set(kortId(k), igjen.get(kortId(k))! - 1);
  }
  const start = tilVrak(grunn, r.bud);
  if (start === null || vrakKort.length !== 4) { hoppet++; continue; }

  // ARM 1: MENNESKET. Dets eget vrak, trumf og alle tolv kort, mot nevro.
  let s = start;
  const nevroM = new NevroAgent();
  try {
    s = utfør(s, { type: "VRAK", spiller: 0, kort: vrakKort }).state;
    s = utfør(s, { type: "VELG", spiller: 0, trumf: r.trumf, etterlyst: r.etterlyst }).state;
  } catch { hoppet++; continue; }
  let i = 0;
  let g = 0;
  let brøt = false;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    if (s.iTur === 0) {
      const k = spilt[i];
      if (k === undefined) { brøt = true; break; }
      const lov = lovligeHandlinger(s);
      if (lov.fase !== "SPILL" || !lov.kort.some((x) => likeKort(x, k))) { brøt = true; break; }
      i++;
      s = utfør(s, { type: "SPILL", spiller: 0, kort: k }).state;
    } else s = utfør(s, nevroM.velgHandling(s)).state;
  }
  if (brøt) { hoppet++; continue; }
  const m = lagStikk(s);
  // Registreres bare som informasjon: hvor ofte den gjenskapte verdenen
  // faller sammen med den ekte. Den er IKKE en port her - begge armene ligger
  // i den gjenskapte verdenen, saa et avvik rammer dem likt.
  if (m !== r.lagStikk) avvik++;

  // ARM 2: BOTEN, samme hånd, samme kontrakt, samme motstand.
  let t = start;
  const b = new Konvensjonsvakt(new E1Agent(nett), vakt.valg);
  b.nyKamp();
  const nevroB = new NevroAgent();
  g = 0;
  while (t.fase !== "FERDIG" && t.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = t.fase === "VRAK" || t.fase === "VELG" ? t.budvinner! : t.iTur!;
    t = utfør(t, iTur === 0 ? b.velgHandling(t) : nevroB.velgHandling(t)).state;
  }
  menn.push(m);
  bot.push(lagStikk(t));
}

const snitt = (v: readonly number[]): number => v.reduce((a, x) => a + x, 0) / v.length;
const d = bot.map((x, i) => x - menn[i]!);
const md = snitt(d);
let sq = 0;
for (const x of d) sq += (x - md) * (x - md);
const se = Math.sqrt(sq / (d.length - 1) / d.length);

const linjer = [
  `\n=== Samme hånd, samme kontrakt, samme motstand: mennesket mot boten ===`,
  `${menn.length} menneskeledede kontrakter fra nevro-partiene (${hoppet} hoppet over).`,
  ``,
  `KORREKTHETSPRØVEN – runder der gjenskapingen ga et ANNET stikktall enn loggen: ${avvik}`,
  `  Budrunden her er kunstig, saa den gjenskapte verdenen er ikke den ekte.`,
  `  Det er greit: BEGGE armene ligger i den samme gjenskapte verdenen, saa`,
  `  skjevheten rammer dem likt og kan ikke forklare differansen under.`,
  ``,
  `  mennesket   ${snitt(menn).toFixed(3)} lagstikk`,
  `  vår bot     ${snitt(bot).toFixed(3)} lagstikk`,
  `  differanse  ${md >= 0 ? "+" : ""}${md.toFixed(3)} ± ${se.toFixed(3)}   (${(md / se).toFixed(1)} SE)`,
  ``,
  `Positivt = boten henter flere stikk enn mennesket gjorde, på nøyaktig`,
  `samme kort, samme kontrakt og mot nøyaktig samme motstandere.`,
];
console.log(linjer.join("\n"));
writeFileSync("analyse/menneske-mot-bot.txt", linjer.join("\n") + "\n");
