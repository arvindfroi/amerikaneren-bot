/**
 * HVOR MYE AV SD-ETIKETTEN ER STØY? — og er 12 verdener nok?
 *
 *   node examples/sd-stoy.ts --stillinger 60
 *
 * PyData Berlin 2018 (lorserker, BEN): flaskehalsen i bridgeprogrammer er ikke
 * søkedybden, men ANTALL UTVALG. Eksakt løsning er så dyr at man ikke kommer
 * over ~100 samples per beslutning, og da blir variansen så stor at valget av
 * beste kort blir upålitelig.
 *
 * Vi bruker TOLV. Denne målingen sier om det er nok.
 *
 * METODEN: samme stilling vurderes to ganger med UAVHENGIGE verdenstrekk. Er
 * etiketten et signal, skal de to være nesten like. Er den støy, spriker de.
 *
 * DET AVGJØRENDE TALLET er hvor ofte de to trekkene er uenige om HVILKET KORT
 * som er best. Etiketten brukes til å rangere kort; er rangeringen en
 * myntkast, lærer nettet støy uansett hvor godt det lærer.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { readFileSync } from "node:fs";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { vurderKortSD, trekkVerdener } from "../src/moe2/sdkort.ts";
import { Trosnett } from "../src/moe2/trosnett.ts";
import { lagTrovekt } from "../src/moe2/troprior.ts";
import { nettFraBytes } from "../src/nevro/nett.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { lagIndre, ADAMS, tall } from "../src/moe2/agentspek.ts";
import { NevroAgent } from "../src/nevro/index.ts";

let stillinger = 60;
let ut = "analyse/sd-stoy.txt";
let troFil: string | null = null;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--stillinger") stillinger = tall(process.argv[i + 1], stillinger, "--stillinger");
  else if (process.argv[i] === "--ut") ut = process.argv[i + 1] ?? ut;
  else if (process.argv[i] === "--tro") troFil = process.argv[i + 1] ?? null;
}
const trosnett =
  troFil === null ? null : new Trosnett(nettFraBytes(new Uint8Array(readFileSync(troFil)))[0]!);

const lagRng = (frø: number) => {
  let x = frø >>> 0;
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
};

const bot = lagIndre(ADAMS);
const motpart = { navn: "adams", velgHandling: (s: GameState) => bot.velgHandling(s) };

/** Plukker spillstillinger fra Adams' egen giv-fordeling. */
function hentStillinger(antall: number): { s: GameState; sete: number }[] {
  const ut: { s: GameState; sete: number }[] = [];
  const ag = [0, 1, 2, 3].map(() => new NevroAgent());
  for (let d = 0; ut.length < antall && d < antall * 4; d++) {
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 2_200_000 + d * 7717);
    let g = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
      if (s.fase === "SPILL" && s.iTur !== null && s.stikkSpilt >= 1 && s.stikkSpilt <= 8) {
        ut.push({ s, sete: s.iTur });
        break;
      }
      const iT = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iT === null || iT === undefined) break;
      s = utfør(s, ag[iT]!.velgHandling(s)).state;
    }
  }
  return ut;
}

const pos = hentStillinger(stillinger);
const linjer: string[] = [];
linjer.push(`${pos.length} stillinger, Adams som rollout-motpart`);
linjer.push("");
linjer.push(`trosnett: ${troFil ?? "AV"}`);
linjer.push("");

/**
 * VERDENSKVALITET: andel SKJULTE kort som havner hos RIKTIG spiller. Bare de
 * skjulte telles – de synlige er ikke gjetning, og aa ta dem med ville loeftet
 * begge armene like mye og skjult forskjellen.
 */
function verdenskvalitet(p: { s: GameState; sete: number }, V: number, frø: number): number {
  const vekt = trosnett === null ? undefined : (lagTrovekt(trosnett, p.s, p.sete) ?? undefined);
  const w = trekkVerdener(p.s, p.sete, V, lagRng(frø), undefined, vekt);
  if (w.length === 0) return Number.NaN;
  // Fasit: hvem holder hvert skjulte kort faktisk.
  const fasit = new Map<number, number>();
  for (let sp = 0; sp < 4; sp++) {
    if (sp === p.sete) continue;
    for (const k of p.s.hender[sp] ?? []) fasit.set(kortIndeks(k), sp);
  }
  let treff = 0, av = 0;
  for (const hender of w) {
    for (let sp = 0; sp < hender.length; sp++) {
      for (const c of hender[sp]!) {
        const sant = fasit.get(c);
        if (sant === undefined) continue;
        av++;
        if (sant === sp) treff++;
      }
    }
  }
  return av === 0 ? Number.NaN : treff / av;
}

{
  let sum = 0, n = 0;
  for (const [i, p] of pos.entries()) {
    const q = verdenskvalitet(p, 12, 700 + i);
    if (Number.isFinite(q)) { sum += q; n++; }
  }
  linjer.push(`VERDENSKVALITET (12 verdener): ${((sum / n) * 100).toFixed(1)} % av skjulte kort hos riktig spiller`);
  linjer.push("");
}

linjer.push("verdener   uenig om beste kort   spredning best-nest   stoey (SD mellom trekk)   signal/stoey");

for (const V of [4, 12, 48]) {
  let uenig = 0, n = 0, sumSpenn = 0, sumAvvik = 0, m = 0;
  for (const [i, p] of pos.entries()) {
    const vekt = trosnett === null ? undefined : (lagTrovekt(trosnett, p.s, p.sete) ?? undefined);
    const a = vurderKortSD(p.s, p.sete, motpart, { verdener: V, rng: lagRng(1000 + i), trovekt: vekt });
    const b = vurderKortSD(p.s, p.sete, motpart, { verdener: V, rng: lagRng(90000 + i), trovekt: vekt });
    if (a.length < 2) continue;
    // Sammenlikn paa FARGE+VALOER, ikke objektidentitet: identitet ville vaert
    // en stille loegn hvis motoren noen gang lager nye kortobjekter.
    const best = (v: typeof a) => v.reduce((x, y) => (y.verdi > x.verdi ? y : x)).kort;
    const ba = best(a), bb = best(b);
    if (ba.farge !== bb.farge || ba.verdi !== bb.verdi) uenig++;
    n++;
    // Spredning beste mot nest beste: det etiketten faktisk skal skille.
    const sortert = [...a].sort((x, y) => y.verdi - x.verdi);
    sumSpenn += sortert[0]!.verdi - sortert[1]!.verdi;
    // Stoeyen: hvor mye samme kort flytter seg mellom to uavhengige trekk.
    for (const x of a) {
      const y = b.find((z) => z.kort.farge === x.kort.farge && z.kort.verdi === x.kort.verdi);
      if (y) { sumAvvik += (x.verdi - y.verdi) ** 2; m++; }
    }
  }
  const spenn = sumSpenn / n;
  // SD for ETT trekk = sqrt(halve den parvise variansen).
  const stoey = Math.sqrt(sumAvvik / m / 2);
  linjer.push(
    `${String(V).padStart(5)}      ${((uenig / n) * 100).toFixed(1).padStart(8)} %` +
      `        ${spenn.toFixed(3).padStart(10)}        ${stoey.toFixed(3).padStart(12)}` +
      `        ${(spenn / stoey).toFixed(2).padStart(8)}`,
  );
}
linjer.push("");
linjer.push("Er «uenig om beste kort» hoey, rangerer etiketten stoey og nettet laerer stoey.");
linjer.push("signal/stoey under 1 betyr at forskjellen mellom kortene druknar i utvalgsstoeyen.");
const tekst = linjer.join("\n");
console.log(tekst);
mkdirSync(dirname(ut), { recursive: true });
appendFileSync(ut, tekst + "\n");
