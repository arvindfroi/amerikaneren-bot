/**
 * Turnering: NY (PIMC-bot) mot GAMMEL (heuristisk bot uten søk) i hele
 * kamper til målPoeng. To plasser hver, byttet hver kamp for å nulle ut
 * posisjonsfordel. Rapporterer ±poeng per kamp og vinnerandel.
 *
 *   node examples/turnering.ts [antallKamper] [verdener] [terskel]
 *
 * GAMMEL = slik boten spilte før solveren: heuristisk bud/vraking/trumf og
 * grei-men-grådig kortlegging (vinn billigst, ellers kast lavt). NY bruker
 * PIMC (determinisert dobbelt-dummy).
 */

import {
  opprettSpill,
  lovligeHandlinger,
  lovligeKort,
  utfør,
  velgHandling,
  lagRng,
  type GameState,
  type Handling,
  type Farge,
  type Kort,
} from "../src/index.ts";

const antallKamper = Number(process.argv[2] ?? 20);
const verdener = Number(process.argv[3] ?? 16);
const terskel = Number(process.argv[4] ?? 6);
const rng = lagRng(20260722);

function fargeTelling(hånd: readonly Kort[]): Record<Farge, number> {
  const t: Record<Farge, number> = { S: 0, H: 0, R: 0, K: 0 };
  for (const k of hånd) t[k.farge]++;
  return t;
}

// --- GAMMEL: heuristisk bot (ingen søk) ------------------------------------
function gammelHandling(state: GameState): Handling {
  const lov = lovligeHandlinger(state);
  switch (lov.fase) {
    case "BUDRUNDE": {
      // Meld 5 med en «grei» hånd (mange høye/trumfemner), ellers pass.
      const hånd = state.hender[lov.spiller]!;
      const høye = hånd.filter((k) => k.verdi >= 12).length;
      const tel = fargeTelling(hånd);
      const lengst = Math.max(...Object.values(tel));
      const sterk = høye + lengst;
      const kanTall = lov.bud.filter((b): b is number => typeof b === "number");
      if (state.budrunde.høyeste === null && kanTall.length && sterk >= 7) {
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
      let et: Kort | null = null;
      for (let v = 14; v >= 2; v--) if (!finnes.has(v as never)) { et = { farge: trumf, verdi: v as never }; break; }
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

/** Grådig kortlegging: vinn stikket billigst mulig, ellers kast lavest. */
function grådigKort(state: GameState, spiller: number): Kort {
  const lov = lovligeKort(state, spiller);
  if (lov.length === 1) return lov[0]!;
  const trumf = state.trumf!;
  if (state.bord.length === 0) {
    // Utspill: spill høyeste kort (casual, aggressivt).
    return lov.slice().sort((a, b) => verdiSort(b, trumf) - verdiSort(a, trumf))[0]!;
  }
  const ledFarge = state.bord[0]!.kort.farge;
  const best = bestePåBord(state, trumf, ledFarge);
  const vinnende = lov.filter((k) => slår(k, best, trumf, ledFarge));
  if (vinnende.length > 0) {
    // Vinn med lavest mulige vinnerkort.
    return vinnende.sort((a, b) => verdiSort(a, trumf) - verdiSort(b, trumf))[0]!;
  }
  // Kan ikke vinne – kast lavest.
  return lov.slice().sort((a, b) => verdiSort(a, trumf) - verdiSort(b, trumf))[0]!;
}
function verdiSort(k: Kort, trumf: Farge): number {
  return (k.farge === trumf ? 100 : 0) + k.verdi;
}
function bestePåBord(state: GameState, trumf: Farge, led: Farge): Kort {
  let best = state.bord[0]!.kort;
  for (const kp of state.bord) if (slår(kp.kort, best, trumf, led)) best = kp.kort;
  return best;
}
function slår(ny: Kort, best: Kort, trumf: Farge, led: Farge): boolean {
  const nT = ny.farge === trumf, bT = best.farge === trumf;
  if (nT && !bT) return true;
  if (!nT && bT) return false;
  if (nT && bT) return ny.verdi > best.verdi;
  if (ny.farge !== led) return false;
  if (best.farge !== led) return true;
  return ny.verdi > best.verdi;
}

// --- Kjør kampene ----------------------------------------------------------
let nyVinn = 0;
let gammelVinn = 0;
let sumDiff = 0;
let sumNy = 0;
let sumGammel = 0;
const t0 = performance.now();

for (let kamp = 0; kamp < antallKamper; kamp++) {
  const nySeter = kamp % 2 === 0 ? new Set([0, 2]) : new Set([1, 3]);
  let s = opprettSpill({ antallSpillere: 4 }, 1000 + kamp);
  let guard = 0;
  while (s.fase !== "FERDIG" && guard++ < 20000) {
    const seat = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    let h: Handling;
    if (s.fase === "RUNDE_SLUTT") h = { type: "NESTE" };
    else if (nySeter.has(seat)) h = velgHandling(s, { verdener, terskel, frø: (kamp * 131 + seat * 17 + guard) >>> 0 });
    else h = gammelHandling(s);
    s = utfør(s, h).state;
  }
  const nyPoeng = [...nySeter].reduce((a, p) => a + (s.totalPoeng[p] ?? 0), 0);
  const gammelPoeng = s.totalPoeng.reduce((a, b) => a + b, 0) - nyPoeng;
  const nyVant = s.vinner !== null && nySeter.has(s.vinner);
  if (nyVant) nyVinn++;
  else gammelVinn++;
  sumDiff += nyPoeng - gammelPoeng;
  sumNy += nyPoeng;
  sumGammel += gammelPoeng;
  console.log(
    `Kamp ${kamp + 1}: NY=${nyPoeng} GAMMEL=${gammelPoeng} diff=${nyPoeng - gammelPoeng >= 0 ? "+" : ""}${nyPoeng - gammelPoeng} vinner=${nyVant ? "NY" : "GAMMEL"}`,
  );
}

console.log(`\n=== ${antallKamper} kamper (NY: verdener=${verdener}, terskel=${terskel}) ===`);
console.log(`Vinnerandel NY:   ${((100 * nyVinn) / antallKamper).toFixed(0)}%  (${nyVinn}–${gammelVinn})`);
console.log(`±poeng per kamp:  ${sumDiff / antallKamper >= 0 ? "+" : ""}${(sumDiff / antallKamper).toFixed(1)}  (NY ${(sumNy / antallKamper).toFixed(0)} vs GAMMEL ${(sumGammel / antallKamper).toFixed(0)} i snitt, summert over 2 plasser)`);
console.log(`Tid: ${((performance.now() - t0) / 1000).toFixed(0)}s`);
