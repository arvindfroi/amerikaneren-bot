/**
 * Trener NEAT-populasjonen: cupturneringer generasjon for generasjon.
 *
 *   node examples/neat-tren.ts [generasjoner] [populasjon] [frø]
 *
 * Flagg:
 *   --fra <fil>   gjenoppta trening fra et lagret mestergenom
 *
 * Mesteren lagres fortløpende til trening/mester.json (og en tidsstemplet
 * kopi per 10. generasjon), og måles jevnlig mot en grådig heuristisk bot
 * i flakskontrollerte duplikatkamper.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  lovligeKort,
  lovligeHandlinger,
  opprettSpill,
  utfør,
  type Farge,
  type GameState,
  type Handling,
  type Kort,
} from "../src/index.ts";
import { Evolusjon, genomFraJson, genomTilJson, NeatAgent, type Genom } from "../src/neat/index.ts";

// --- Argumenter -------------------------------------------------------------
const posisjonelle: string[] = [];
let fraFil: string | null = null;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--fra") fraFil = process.argv[++i] ?? null;
  else posisjonelle.push(process.argv[i]!);
}
const generasjoner = Number(posisjonelle[0] ?? 50);
const populasjon = Number(posisjonelle[1] ?? 32);
const frø = Number(posisjonelle[2] ?? 42);

let startGenom: Genom | undefined;
if (fraFil !== null) {
  startGenom = genomFraJson(readFileSync(fraFil, "utf8"));
  console.log(`Gjenopptar fra ${fraFil} (${startGenom.noder.length} noder, ${startGenom.koblinger.length} koblinger)`);
}

mkdirSync("trening", { recursive: true });

// --- Grådig heuristisk motstander (samme som «GAMMEL» i turnering.ts) ------
function fargeTelling(hånd: readonly Kort[]): Record<Farge, number> {
  const t: Record<Farge, number> = { S: 0, H: 0, R: 0, K: 0 };
  for (const k of hånd) t[k.farge]++;
  return t;
}

function grådigHandling(state: GameState): Handling {
  const lov = lovligeHandlinger(state);
  switch (lov.fase) {
    case "BUDRUNDE": {
      const hånd = state.hender[lov.spiller]!;
      const høye = hånd.filter((k) => k.verdi >= 12).length;
      const lengst = Math.max(...Object.values(fargeTelling(hånd)));
      const kanTall = lov.bud.filter((b): b is number => typeof b === "number");
      if (state.budrunde.høyeste === null && kanTall.length && høye + lengst >= 7) {
        return { type: "BUD", spiller: lov.spiller, bud: Math.min(...kanTall) };
      }
      return { type: "BUD", spiller: lov.spiller, bud: "PASS" };
    }
    case "VRAK": {
      const srt = lov.hånd.slice().sort((a, b) => a.verdi - b.verdi);
      return { type: "VRAK", spiller: lov.spiller, kort: srt.slice(0, lov.antall) };
    }
    case "VELG": {
      const hånd = state.hender[lov.spiller]!;
      const tel = fargeTelling(hånd);
      const trumf = (["S", "H", "R", "K"] as Farge[]).sort((a, b) => tel[b] - tel[a])[0]!;
      const finnes = new Set(hånd.filter((k) => k.farge === trumf).map((k) => k.verdi));
      const vraket = new Set(state.vrak.filter((k) => k.farge === trumf).map((k) => k.verdi));
      let et: Kort | null = null;
      for (let v = 14; v >= 2; v--) {
        if (!finnes.has(v as never) && !vraket.has(v as never)) {
          et = { farge: trumf, verdi: v as never };
          break;
        }
      }
      return { type: "VELG", spiller: lov.spiller, trumf, etterlyst: et };
    }
    case "SPILL": {
      const kort = grådigKort(state, lov.spiller);
      return { type: "SPILL", spiller: lov.spiller, kort };
    }
    default:
      return { type: "NESTE" };
  }
}

function grådigKort(state: GameState, spiller: number): Kort {
  const lov = lovligeKort(state, spiller);
  if (lov.length === 1) return lov[0]!;
  const trumf = state.trumf!;
  const vekt = (k: Kort): number => (k.farge === trumf ? 100 : 0) + k.verdi;
  if (state.bord.length === 0) {
    return lov.slice().sort((a, b) => vekt(b) - vekt(a))[0]!;
  }
  const led = state.bord[0]!.kort.farge;
  let best = state.bord[0]!.kort;
  for (const kp of state.bord) if (slår(kp.kort, best, trumf, led)) best = kp.kort;
  const vinnende = lov.filter((k) => slår(k, best, trumf, led));
  if (vinnende.length > 0) return vinnende.sort((a, b) => vekt(a) - vekt(b))[0]!;
  return lov.slice().sort((a, b) => vekt(a) - vekt(b))[0]!;
}

function slår(ny: Kort, best: Kort, trumf: Farge, led: Farge): boolean {
  const nT = ny.farge === trumf;
  const bT = best.farge === trumf;
  if (nT !== bT) return nT;
  if (nT) return ny.verdi > best.verdi;
  if (ny.farge !== led) return false;
  if (best.farge !== led) return true;
  return ny.verdi > best.verdi;
}

/**
 * Benkemåling: mesteren mot 3 grådige boter, duplikat (samme frø, mesteren
 * roterer gjennom alle 4 setene). Rapporterer snittpoeng per kamp for
 * mesteren mot snittet av de grådige.
 */
function målMotGrådig(genom: Genom, antallFrø: number): { mester: number; grådig: number; seire: number; kamper: number } {
  const agent = new NeatAgent(genom);
  let mesterPoeng = 0;
  let grådigPoeng = 0;
  let seire = 0;
  let kamper = 0;
  for (let f = 0; f < antallFrø; f++) {
    for (let sete = 0; sete < 4; sete++) {
      agent.nyKamp();
      let s = opprettSpill({ antallSpillere: 4 }, 777000 + f);
      let guard = 0;
      while (s.fase !== "FERDIG" && guard++ < 20000) {
        if (s.fase === "RUNDE_SLUTT" && s.rundeNr + 1 >= 40) break;
        const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
        let h: Handling;
        if (s.fase === "RUNDE_SLUTT") h = { type: "NESTE" };
        else if (iTur === sete) h = agent.velgHandling(s);
        else h = grådigHandling(s);
        s = utfør(s, h).state;
      }
      mesterPoeng += s.totalPoeng[sete] ?? 0;
      grådigPoeng += (s.totalPoeng.reduce((a, b) => a + b, 0) - (s.totalPoeng[sete] ?? 0)) / 3;
      if (s.vinner === sete) seire++;
      kamper++;
    }
  }
  return { mester: mesterPoeng / kamper, grådig: grådigPoeng / kamper, seire, kamper };
}

// --- Treningsløkka ----------------------------------------------------------
console.log(`NEAT-trening: ${generasjoner} generasjoner, populasjon ${populasjon}, frø ${frø}`);
const evo = new Evolusjon({ populasjon, frø, startGenom });
const t0 = performance.now();

for (let g = 0; g < generasjoner; g++) {
  const stat = evo.kjørGenerasjon();
  const mester = evo.mester!;
  writeFileSync("trening/mester.json", genomTilJson(mester));

  console.log(
    `gen ${String(stat.generasjon).padStart(3)}: ` +
      `arter=${stat.antallArter} ` +
      `fitness=${stat.besteFitness.toFixed(2)} (snitt ${stat.snittFitness.toFixed(2)}) ` +
      `dybde=${stat.mesterDybde}/${stat.turneringsRunder} ` +
      `${stat.mesterForsvarte ? "tittel forsvart" : "ny mester"} ` +
      `anger=${stat.snittRegret.toFixed(3)} ` +
      `nett=${stat.mesterNoder}n/${stat.mesterKoblinger}k`,
  );

  if ((stat.generasjon + 1) % 10 === 0 || g === generasjoner - 1) {
    writeFileSync(`trening/mester-gen${stat.generasjon}.json`, genomTilJson(mester));
    const benk = målMotGrådig(mester, 3);
    console.log(
      `  benk vs grådig bot: mester ${benk.mester.toFixed(1)} poeng/kamp, ` +
        `grådig ${benk.grådig.toFixed(1)}, seire ${benk.seire}/${benk.kamper}`,
    );
  }
}

console.log(`Ferdig på ${((performance.now() - t0) / 1000).toFixed(0)}s. Mester: trening/mester.json`);
