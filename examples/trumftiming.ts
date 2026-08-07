/**
 * NÅR SPILLES TRUMFENE? Menneskene mot boten, på de samme givene.
 *
 *   node examples/trumftiming.ts
 *
 * ARVINDS HYPOTESE: «det eneste jeg tenker på at vi gjør som den ikke gjør er
 * å spille ut/etablere kontroll over trumfen tidlig ... fordi vi vil utelukke
 * muligheten for trumfen til å bli brukt mot oss i en annen serie.»
 *
 * HVORFOR DEN IKKE ER MÅLT FØR. `menneske-atferd.ts` måler åpningsutspillet,
 * og der spiller BÅDE menneskene og boten trumf i 100 % av rundene – det er
 * konvensjonen, ikke et valg. Hypotesen handler om stikk 2 og utover, og det
 * målet finnes ikke.
 *
 * DET SOM MÅLES HER. For hver runde mennesket meldte selv kjenner vi de tolv
 * kortene det spilte MED STIKKNUMMER (`kort-budvinner.txt`) og trumfen. Da kan
 * vi regne ut nøyaktig når trumfene forlot hånden:
 *
 *   trumf spilt i stikk 1–4     andel av setets trumf
 *   snittstikk for trumf        når de i snitt ble spilt
 *   trumf igjen etter stikk 4   hvor mye kontroll som er igjen
 *
 * Og de samme tallene for boten, på NØYAKTIG de samme givene, med den samme
 * kontrakten. Da er forskjellen atferd og ikke kort.
 *
 * HVA MÅLINGEN IKKE KAN SI. Den ser hvilke kort som ble spilt, ikke hvem som
 * hadde utspillet. Et menneske som spiller trumf tidlig kan ha gjort det fordi
 * det LEDET ofte, ikke fordi det valgte å trekke trumf. Forskjellen i timing er
 * derfor en BESKRIVELSE av hva som skjedde, ikke et bevis på en strategi. Skal
 * hypotesen bli en regel, må den måles med utfallsmetoden – som alt annet.
 */

import { readFileSync, writeFileSync } from "node:fs";

import { lovligeHandlinger, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { kortId, type Farge, type Kort } from "../src/kort.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";

const DATA = "analyse/menneskedata";
const SPEK = "vakt:abmp:e1:e1-modell/d7alle.bin";
const vakt = delVaktspek(SPEK)!;
const nett = lesE1Nett(vakt.indre.slice(3));
const nevro = new NevroAgent();
const lagBot = (): { velgHandling(s: GameState): Handling; nyKamp(): void } =>
  new Konvensjonsvakt(new E1Agent(nett), vakt.valg);

const frøFor = new Map<string, number>();
for (const l of readFileSync(`${DATA}/partier.txt`, "utf8").trim().split("\n")) {
  const f = l.split("|");
  frøFor.set(f[0]!, Number(f[1]));
}

interface Runde { g: string; rn: number; bud: number; trumf: Farge }
const runder: Runde[] = [];
for (const fil of ["runder-1.txt", "runder-2.txt"]) {
  for (const l of readFileSync(`${DATA}/${fil}`, "utf8").trim().split("\n")) {
    const f = l.split("|");
    // Bare runder MENNESKET meldte selv: budvinner === 0 er menneskesetet.
    if (f[2] !== "0" || f[3] !== "tall" || (f[9] ?? "") === "") continue;
    runder.push({ g: f[0]!, rn: Number(f[1]), bud: Number(f[4]), trumf: f[9]![0] as Farge });
  }
}
/** Menneskets tolv kort MED stikknummer. */
const spilte = new Map<string, { st: number; k: Kort }[]>();
for (const l of readFileSync(`${DATA}/kort-budvinner.txt`, "utf8").trim().split("\n")) {
  const f = l.split("|");
  const par = f[3]!.split(",").map((s) => {
    const m = /^(\d+)([SHRK])(\d+)$/.exec(s)!;
    return { st: Number(m[1]), k: { farge: m[2] as Farge, verdi: Number(m[3]) as Kort["verdi"] } };
  });
  par.sort((a, b) => a.st - b.st);
  spilte.set(`${f[0]}|${f[1]}`, par);
}

const givFor = (frø: number, rn: number): GameState =>
  opprettSpill({ antallSpillere: 4 }, (frø + Math.imul(rn, 2654435761)) >>> 0);

interface Mål { tidlig: number; snitt: number; igjen: number; antall: number }
const menn: Mål[] = [];
const bot: Mål[] = [];
let hoppet = 0;

for (const r of runder) {
  const frø = frøFor.get(r.g);
  const par = spilte.get(`${r.g}|${r.rn}`);
  if (frø === undefined || par === undefined || par.length !== 12) {
    hoppet++;
    continue;
  }
  // MENNESKET: les timingen rett av de loggede kortene.
  const mTrumf = par.filter((p) => p.k.farge === r.trumf);
  if (mTrumf.length === 0) {
    hoppet++;
    continue;
  }
  menn.push({
    tidlig: mTrumf.filter((p) => p.st < 4).length / mTrumf.length,
    snitt: mTrumf.reduce((a, p) => a + p.st, 0) / mTrumf.length,
    igjen: mTrumf.filter((p) => p.st >= 4).length,
    antall: mTrumf.length,
  });

  // BOTEN paa NOEYAKTIG samme giv, tvunget til samme kontrakt.
  let s = givFor(frø, r.rn);
  let g = 0;
  let bydd = false;
  while (s.fase === "BUDRUNDE" && g++ < 40) {
    if (s.iTur === null) break;
    if (s.iTur === 0 && !bydd) {
      const lov = lovligeHandlinger(s);
      const tall = lov.fase === "BUDRUNDE" ? lov.bud.filter((b): b is number => typeof b === "number") : [];
      let v: number | null = null;
      for (const b of tall) if (b <= r.bud && (v === null || b > v)) v = b;
      if (v === null) break;
      bydd = true;
      s = utfør(s, { type: "BUD", spiller: 0, bud: v }).state;
    } else s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  if (s.fase === "BUDRUNDE" || s.budvinner !== 0) {
    hoppet++;
    continue;
  }
  const seter = [0, 1, 2, 3].map((p) => (p === 0 ? lagBot() : (nevro as never)));
  (seter[0] as { nyKamp(): void }).nyKamp();
  g = 0;
  const botSpilt: { st: number; k: Kort }[] = [];
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    const h = (seter[iTur] as { velgHandling(x: GameState): Handling }).velgHandling(s);
    if (iTur === 0 && h.type === "SPILL") botSpilt.push({ st: s.stikkSpilt, k: h.kort as Kort });
    s = utfør(s, h).state;
  }
  const bTrumf = botSpilt.filter((p) => p.k.farge === s.trumf);
  if (bTrumf.length === 0) {
    menn.pop();
    hoppet++;
    continue;
  }
  bot.push({
    tidlig: bTrumf.filter((p) => p.st < 4).length / bTrumf.length,
    snitt: bTrumf.reduce((a, p) => a + p.st, 0) / bTrumf.length,
    igjen: bTrumf.filter((p) => p.st >= 4).length,
    antall: bTrumf.length,
  });
}

const sn = (v: number[]): number => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0);
const se = (v: number[]): number => {
  if (v.length < 2) return NaN;
  const m = sn(v);
  let s = 0;
  for (const x of v) s += (x - m) * (x - m);
  return Math.sqrt(s / (v.length - 1) / v.length);
};
const par = (a: number[], b: number[]): string => {
  const d = a.map((x, i) => x - b[i]!);
  return `${sn(d) >= 0 ? "+" : ""}${sn(d).toFixed(3)} ± ${se(d).toFixed(3)}  (${(sn(d) / se(d)).toFixed(1)} SE)`;
};

const linjer = [
  `\n=== Naar spilles trumfene? Menneskene mot boten, samme giver ===`,
  `${menn.length} runder mennesket meldte selv (${hoppet} hoppet over).`,
  `Boten er ${SPEK}, tvunget til samme kontrakt paa samme giv.`,
  ``,
  `                                menneske      bot        differanse`,
  `------------------------------------------------------------------------`,
  `andel trumf spilt i stikk 1-4   ${sn(menn.map((x) => x.tidlig)).toFixed(3)}       ${sn(bot.map((x) => x.tidlig)).toFixed(3)}     ${par(menn.map((x) => x.tidlig), bot.map((x) => x.tidlig))}`,
  `snittstikk for trumfspill       ${sn(menn.map((x) => x.snitt)).toFixed(3)}       ${sn(bot.map((x) => x.snitt)).toFixed(3)}     ${par(menn.map((x) => x.snitt), bot.map((x) => x.snitt))}`,
  `trumf igjen etter stikk 4       ${sn(menn.map((x) => x.igjen)).toFixed(3)}       ${sn(bot.map((x) => x.igjen)).toFixed(3)}     ${par(menn.map((x) => x.igjen), bot.map((x) => x.igjen))}`,
  `trumf paa haanden totalt        ${sn(menn.map((x) => x.antall)).toFixed(3)}       ${sn(bot.map((x) => x.antall)).toFixed(3)}     ${par(menn.map((x) => x.antall), bot.map((x) => x.antall))}`,
  `------------------------------------------------------------------------`,
  ``,
  `POSITIV differanse paa «andel i stikk 1-4» = mennesket trekker trumf`,
  `TIDLIGERE enn boten. Negativ «snittstikk» betyr det samme.`,
  ``,
  `FORBEHOLD. Maalingen ser hvilke kort som ble spilt, ikke hvem som hadde`,
  `utspillet. Et menneske som spiller trumf tidlig kan ha gjort det fordi det`,
  `LEDET ofte. Forskjellen er en beskrivelse av hva som skjedde, ikke et bevis`,
  `paa en strategi - og skal hypotesen bli en regel, maa den maales med`,
  `utfallsmetoden som alt annet.`,
  ``,
  `MERK OGSAA at boten her har NEVRO som motspillere, mens mennesket moette`,
  `nettsidens boter. Trumftimingen paavirkes av hvem som leder stikkene.`,
];
const tekst = linjer.join("\n");
console.log(tekst);
writeFileSync("analyse/trumftiming.txt", tekst + "\n");
