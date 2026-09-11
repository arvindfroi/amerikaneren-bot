/**
 * K8-MÅLTALLET — ÉN DEFINISJON, TO PRØVER (11. sep).
 *
 * `examples/mlb-k8.ts` regner log-tapet for et trohode per stilling, renormalisert over de tre
 * setene (resten er talongen), mot gulvene `gulv` (ln 3 per kort) og `gulv+` (setene som ikke er
 * KJENT renons). `krav-helbot.ts` gjør det om til «% av veien gulv → tak». `menneske-tro.ts`
 * skal måle NØYAKTIG det samme på menneskekamper. Funksjonene er derfor flyttet hit ordrett og
 * importeres av begge, i stedet for å bli skrevet av en gang til.
 *
 * `mål` er det eneste nye: hvilke HENDER kortene som telles ligger på (standard: alle andre
 * seter). «Botene gjetter menneskets kort» er da samme tall på en delmengde. Uten `mål` er
 * løkkene de gamle, og mlb-k8-radene er byte-identiske med før flyttingen (sha1 av to små
 * kjøringer, én med `--fakta`, én med `--kamp --nett2 --fakta`).
 */

import type { GameState } from "../src/motor.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";

/** Relativt sete, samme koding som `fyllSanser` og `monteTro`. */
export const rel = (sete: number, p: number, n: number): number => (p - sete + n) % n;

const alle = (): boolean => true;

/** Gulvet: uniform over tre seter. Taket er klarsyn (log-tap 0). */
export const LN3 = Math.log(3);

/** Andelen av veien gulv → tak for et log-tap per kort, slik §119 og `domK8` regner den. */
export const andelGulvTak = (tap: number): number => (LN3 - tap) / LN3;

/**
 * Log-tap og treff@1 for en nettfordeling over kortene på hendene i `mål`. `kort` er antallet
 * kort det deles på. Ordrett løkka i `nett`-armen i mlb-k8.ts.
 */
export function nettTap(
  f: readonly (readonly number[])[],
  s: GameState,
  sete: number,
  kort: number,
  mål: (p: number) => boolean = alle,
): { tap: number; treff: number } {
  let tap = 0;
  let treff = 0;
  for (let p = 0; p < s.antallSpillere; p++) {
    if (p === sete || !mål(p)) continue;
    const r = rel(sete, p, s.antallSpillere);
    if (r < 1 || r > 3) continue;
    for (const k of s.hender[p] ?? []) {
      const rader = f[kortIndeks(k)]!;
      const sum = (rader[0] ?? 0) + (rader[1] ?? 0) + (rader[2] ?? 0);
      const pr = sum > 1e-12 ? (rader[r - 1] ?? 0) / sum : 1 / 3;
      tap += -Math.log(Math.max(1e-12, pr));
      let best = 0;
      for (let i = 1; i < 3; i++) if ((rader[i] ?? 0) > (rader[best] ?? 0)) best = i;
      if (best === r - 1) treff++;
    }
  }
  return { tap: Number((tap / kort).toFixed(5)), treff: Number((treff / kort).toFixed(5)) };
}

/** Gulv+: setene som ikke er KJENT renons i fargen. Ordrett fra tro-noyaktighet. */
export function muligeSeter(state: GameState, sete: number, farge: string): number[] {
  const ut: number[] = [];
  for (let p = 0; p < state.antallSpillere; p++) {
    if (p === sete) continue;
    let renons = false;
    for (const stikk of state.historikk) {
      const ledet = stikk.kort[0];
      if (ledet === undefined || ledet.kort.farge !== farge) continue;
      const eget = stikk.kort.find((kp) => kp.spiller === p);
      if (eget !== undefined && eget.kort.farge !== farge) renons = true;
    }
    if (!renons) ut.push(p);
  }
  return ut;
}

/**
 * GULVENE for kortene på hendene i `mål`: antall kort, `gulv` og `gulv+` per kort, avrundet som
 * i mlb-k8.ts. Samme løkke som der; `kort = 0` gir NaN-gulv og skal ikke bli en rad.
 */
export function gulvene(s: GameState, sete: number, mål: (p: number) => boolean = alle): { kort: number; gulv: number; gulvPluss: number } {
  let gulvTap = 0;
  let gulvPlussTap = 0;
  let kort = 0;
  for (let p = 0; p < s.antallSpillere; p++) {
    if (p === sete || !mål(p)) continue;
    for (const k of s.hender[p] ?? []) {
      kort++;
      gulvTap += -Math.log(1 / 3);
      const mulige = muligeSeter(s, sete, k.farge);
      const m = Math.max(1, mulige.includes(p) ? mulige.length : 3);
      gulvPlussTap += -Math.log(1 / m);
    }
  }
  return { kort, gulv: Number((gulvTap / kort).toFixed(5)), gulvPluss: Number((gulvPlussTap / kort).toFixed(5)) };
}
