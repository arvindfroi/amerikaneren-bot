/**
 * GRADIENT BOOSTED REGRESSION TREES — delt mellom budmodell-trenerne.
 *
 * Koden lå inline i `examples/budmodell.ts`. Da `examples/budmodell-v2.ts`
 * (samme modell, men med budrunden i trekkene) skulle bygges, var valget
 * mellom å kopiere ~80 linjer eller å trekke dem ut.
 *
 * KOPI VAR IKKE ET ALTERNATIV. Prosjektets mest gjentatte feil er at det målte
 * og det utrullede ikke er samme ting, og to utgaver av samme regnestykke er
 * nøyaktig den formen: en terskeljustering i den ene ville gjort v1- og
 * v2-modellene usammenliknbare uten at noe feilet.
 *
 * MODELLKLASSEN, og hvorfor den ikke er lineær: Arvind — «vi må finne
 * thresholds på verdien av serier (valør, lengde, sammenheng) samt ikke
 * behandle det analogt.» Trær gir terskler gratis, og dybde 3 gir samspill
 * mellom tre trekk. En lineær modell kan per definisjon ikke uttrykke at den
 * syvende trumfen er verdt mindre enn den femte.
 *
 * EKSTRAKSJONEN ER VERIFISERT: `examples/budmodell.ts` produserer en
 * BIT-IDENTISK modell før og etter (md5 på samme korpus).
 */

export interface Node {
  blad: boolean;
  verdi?: number;
  kol?: number;
  terskel?: number;
  v?: Node;
  h?: Node;
}

export interface Skog {
  basis: number;
  trær: Node[];
}

const sn = (v: readonly number[]): number => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0);

/**
 * Bygger ett regresjonstre på residualene. Splittkriteriet er reduksjon i
 * kvadratsum — det er terskelen, og det er nettopp den formen en additiv
 * modell mangler.
 *
 * `bredde` er antall kolonner å vurdere. Den var hardkodet til `BUD_DIM`;
 * v2-modellen har 140, så den må inn som argument. Sto den fast, ville
 * v2-blokken (indeks 128–139) ALDRI blitt vurdert som splitt — modellen ville
 * lest tolv nye trekk og aldri brukt dem, og målingen ville sagt «budrunden
 * gir ingenting» på et oppsett som ikke kunne gitt noe annet.
 */
export function byggTre(
  idx: number[],
  X: Float32Array[],
  g: number[],
  d: number,
  minBlad: number,
  bredde: number,
): Node {
  const verdi = sn(idx.map((i) => g[i]!));
  if (d === 0 || idx.length < 2 * minBlad) return { blad: true, verdi };
  let besteKol = -1;
  let besteTerskel = 0;
  let besteGevinst = 1e-9;
  const sum0 = idx.reduce((a, i) => a + g[i]!, 0);
  const n0 = idx.length;
  for (let k = 0; k < bredde; k++) {
    // Kandidatterskler: kvartilene. Nok til å finne et knekkpunkt, billig nok
    // til å kunne gjøre for alle kolonnene i hvert eneste tre.
    const vals = idx.map((i) => X[i]![k]!);
    const sortert = [...vals].sort((a, b) => a - b);
    for (const q of [0.25, 0.5, 0.75]) {
      const t = sortert[Math.floor(q * (sortert.length - 1))]!;
      let sv = 0;
      let nv = 0;
      for (let j = 0; j < idx.length; j++) {
        if (vals[j]! <= t) {
          sv += g[idx[j]!]!;
          nv++;
        }
      }
      if (nv < minBlad || n0 - nv < minBlad) continue;
      // Gevinst = SS_venstre + SS_hoeyre - SS_total, paa middelverdiform.
      const gev = (sv * sv) / nv + ((sum0 - sv) * (sum0 - sv)) / (n0 - nv) - (sum0 * sum0) / n0;
      if (gev > besteGevinst) {
        besteGevinst = gev;
        besteKol = k;
        besteTerskel = t;
      }
    }
  }
  if (besteKol < 0) return { blad: true, verdi };
  const v: number[] = [];
  const h: number[] = [];
  for (const i of idx) (X[i]![besteKol]! <= besteTerskel ? v : h).push(i);
  if (v.length < minBlad || h.length < minBlad) return { blad: true, verdi };
  return {
    blad: false,
    kol: besteKol,
    terskel: besteTerskel,
    v: byggTre(v, X, g, d - 1, minBlad, bredde),
    h: byggTre(h, X, g, d - 1, minBlad, bredde),
  };
}

export const forutsi = (n: Node, x: Float32Array): number =>
  n.blad ? n.verdi! : forutsi(x[n.kol!]! <= n.terskel! ? n.v! : n.h!, x);

/** Trener én skog på `y`. Samme rekkefølge og aritmetikk som før uttrekket. */
export function trenSkog(
  X: Float32Array[],
  y: number[],
  opts: { runder: number; dybde: number; rate: number; bredde: number },
): Skog {
  const basis = sn(y);
  const trær: Node[] = [];
  const pred = new Array<number>(y.length).fill(basis);
  const idx = y.map((_, i) => i);
  const minBlad = Math.max(20, Math.floor(y.length / 60));
  for (let r = 0; r < opts.runder; r++) {
    const g = y.map((v, i) => v - pred[i]!);
    const tre = byggTre(idx, X, g, opts.dybde, minBlad, opts.bredde);
    for (let i = 0; i < y.length; i++) pred[i]! += opts.rate * forutsi(tre, X[i]!);
    trær.push(tre);
  }
  return { basis, trær };
}

export const anslåSkog = (m: Skog, x: Float32Array, rate: number): number =>
  m.basis + rate * m.trær.reduce((a, t) => a + forutsi(t, x), 0);
