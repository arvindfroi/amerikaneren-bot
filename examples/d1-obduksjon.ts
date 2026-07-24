/**
 * Obduksjon av kortspillet: hvor mye taper hver bot mot fasiten, og HVOR?
 *
 *   node examples/d1-obduksjon.ts --kamper 25 --verdener 24 --dybde 7
 *
 * Ved et utvalg kortvalg regner orakelet ut forventet egenpoeng for HVERT
 * lovlig kort (eksakt dobbelt-dummy over samplede verdener). Så spør vi
 * hver kandidat hva DEN ville spilt i nøyaktig samme stilling, og bokfører
 * **angeren**: fasitens beste verdi minus verdien av kortet kandidaten
 * valgte. Anger 0 = optimalt valg gitt informasjonen.
 *
 * Det er den eneste målingen som sier hvor tapet ligger, ikke bare at det
 * finnes: den brytes ned på stikknummer, på rolle (budlag mot forsvar) og
 * på hvor mye som sto på spill i stillingen. To boter kan tape like mye
 * per kamp av helt ulike grunner.
 *
 * Stillingene genereres av NevroHjerne med utforskning – samme fordeling
 * som E1s treningsdata, så tallene er sammenliknbare med den.
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { lagRng } from "../src/kort.ts";
import { lovligeKort, opprettSpill, utfør, velgHandling, type GameState, type Handling } from "../src/index.ts";
import { orakelVerdier } from "../src/e1/orakel.ts";
import { genomFraJson, NeatAgent, type Genom } from "../src/neat/index.ts";
import { kortIndeks, NevroAgent } from "../src/nevro/index.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { grådigHandling } from "./graadig.ts";

let kamper = 25;
let verdener = 24;
let dybde = 7;
let sjanse = 0.4;
let frøBase = 600_000;
/** Bare stikk <= denne merkes (-1 = alle). Aapningsspillet krever eget budsjett. */
let baresStikk = -1;
let nodeTak = 400_000;
let utFil = "obduksjon/anger.jsonl";
const genomFiler: string[] = [];
let e1Fil: string | null = null;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--verdener") verdener = Number(process.argv[++i]);
  else if (a === "--dybde") dybde = Number(process.argv[++i]);
  else if (a === "--sjanse") sjanse = Number(process.argv[++i]);
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--barestikk") baresStikk = Number(process.argv[++i]);
  else if (a === "--nodetak") nodeTak = Number(process.argv[++i]);
  else if (a === "--ut") utFil = process.argv[++i] ?? utFil;
  else if (a === "--e1") e1Fil = process.argv[++i] ?? null;
  else genomFiler.push(a);
}
mkdirSync(dirname(utFil), { recursive: true });

function lesGenom(fil: string): Genom {
  const tekst = readFileSync(fil, "utf8");
  const rå = JSON.parse(tekst) as { genom?: unknown };
  return genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : tekst);
}

/** Kandidatene som skal obduseres – alle svarer på «hvilket kort her?». */
interface Kandidat {
  navn: string;
  kort: (s: GameState, sete: number) => number;
}
const nevro = new NevroAgent();
const kandidater: Kandidat[] = [
  { navn: "nevro", kort: (s, sete) => kortIndeks(nevro.velgKort(s, sete)) },
  {
    navn: "pimc",
    kort: (s, sete) => {
      const h = velgHandling(s, { verdener: 12, terskel: 6, frø: (sete * 7919 + s.stikkSpilt) >>> 0 });
      return h.type === "SPILL" ? kortIndeks(h.kort) : -1;
    },
  },
  {
    navn: "grådig",
    kort: (s) => {
      const h = grådigHandling(s);
      return h.type === "SPILL" ? kortIndeks(h.kort) : -1;
    },
  },
];
for (const fil of genomFiler) {
  const agent = new NeatAgent(lesGenom(fil), { læringsrate: 0 });
  kandidater.push({
    navn: fil,
    kort: (s, sete) => {
      const h = agent.velgHandling(s);
      return h.type === "SPILL" ? kortIndeks(h.kort) : -1;
    },
  });
}
if (e1Fil !== null) {
  const e1 = E1Agent.fraFil(e1Fil);
  kandidater.push({ navn: `e1:${e1Fil}`, kort: (s, sete) => kortIndeks(e1.velgKort(s, sete)) });
}

const rng = lagRng(frøBase >>> 0);
let merket = 0;
const t0 = performance.now();

for (let k = 0; k < kamper; k++) {
  const frø = frøBase + k;
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  let guard = 0;
  while (s.fase !== "FERDIG" && guard++ < 20_000) {
    if (s.fase === "RUNDE_SLUTT") {
      if (s.rundeNr + 1 >= 30) break;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    let h: Handling;
    if (s.fase === "SPILL" && s.iTur !== null) {
      const sete = s.iTur;
      const lovlige = lovligeKort(s, sete);
      const iVindu = baresStikk < 0 || s.stikkSpilt <= baresStikk;
      if (lovlige.length >= 2 && iVindu && rng() < sjanse) {
        const svar = orakelVerdier(s, sete, {
          verdener,
          dybde: Math.min(dybde, s.giving.antallStikk - s.stikkSpilt),
          nodeTak,
          frø: (frø * 31 + guard) >>> 0,
        });
        if (svar !== null) {
          const verdi = new Map<number, number>();
          svar.kort.forEach((kort, i) => verdi.set(kortIndeks(kort), svar.verdi[i]!));
          const beste = Math.max(...svar.verdi);
          const verst = Math.min(...svar.verdi);
          const anger: Record<string, number> = {};
          for (const kand of kandidater) {
            const valgt = kand.kort(s, sete);
            const v = verdi.get(valgt);
            // Et valg utenfor de lovlige ville vært en feil i kandidaten,
            // ikke i målingen – da hopper vi over den i stedet for å lyve.
            anger[kand.navn] = v === undefined ? NaN : Math.round((beste - v) * 1000) / 1000;
          }
          const påLag = sete === s.budvinner || sete === s.makker;
          appendFileSync(
            utFil,
            JSON.stringify({
              stikk: s.stikkSpilt,
              lovlige: lovlige.length,
              spenn: Math.round((beste - verst) * 1000) / 1000,
              påLag,
              anger,
            }) + "\n",
          );
          merket++;
        }
      }
      h = nevro.velgHandling(s);
      if (rng() < 0.15) h = { type: "SPILL", spiller: sete, kort: lovlige[Math.floor(rng() * lovlige.length)]! };
    } else {
      h = nevro.velgHandling(s);
    }
    s = utfør(s, h).state;
  }
  console.log(`parti ${k + 1}/${kamper} – ${merket} obduserte stillinger, ${((performance.now() - t0) / 1000).toFixed(0)}s`);
}
console.log(`Ferdig: ${merket} stillinger → ${utFil}`);
