/**
 * Grådig heuristisk bot – delt referansemotstander for benkemålinger
 * (samme logikk som «GAMMEL» i turnering.ts): meld 5 med grei hånd,
 * vrak lavt, lengste farge som trumf, vinn stikk billigst mulig.
 */

import {
  lovligeKort,
  lovligeHandlinger,
  type Farge,
  type GameState,
  type Handling,
  type Kort,
} from "../src/index.ts";

function fargeTelling(hånd: readonly Kort[]): Record<Farge, number> {
  const t: Record<Farge, number> = { S: 0, H: 0, R: 0, K: 0 };
  for (const k of hånd) t[k.farge]++;
  return t;
}

export function grådigHandling(state: GameState): Handling {
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

