/**
 * Kort, kortstokk og en deterministisk (seedbar) stokkeruttine.
 *
 * Alt her er ren logikk uten sideeffekter, og alle datatyper er
 * JSON-serialiserbare slik at motoren kan drives fra en hvilken som
 * helst klient eller server.
 */

/** De fire fargene. S=spar, H=hjerter, R=ruter, K=kløver. */
export type Farge = "S" | "H" | "R" | "K";

export const FARGER: readonly Farge[] = ["S", "H", "R", "K"] as const;

/**
 * Kortverdi. 2–10 er tallverdien, 11=knekt, 12=dame, 13=konge, 14=ess.
 * Ess er høyest og to er lavest, jf. reglene.
 */
export type Verdi = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export const VERDIER: readonly Verdi[] = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
] as const;

export interface Kort {
  readonly farge: Farge;
  readonly verdi: Verdi;
}

/** Kompakt, stabil streng-id for et kort, f.eks. "SA", "H10", "K2". */
export function kortId(k: Kort): string {
  return `${k.farge}${verdiTegn(k.verdi)}`;
}

const TEGN_FOR_VERDI: Record<number, string> = {
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

const VERDI_FOR_TEGN: Record<string, Verdi> = {
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export function verdiTegn(v: Verdi): string {
  return TEGN_FOR_VERDI[v] ?? String(v);
}

/** Parser en kort-id ("SA", "H10") tilbake til et Kort. */
export function fraKortId(id: string): Kort {
  const farge = id[0] as Farge;
  if (!FARGER.includes(farge)) {
    throw new Error(`Ugyldig farge i kort-id: ${id}`);
  }
  const rest = id.slice(1);
  const verdi = VERDI_FOR_TEGN[rest] ?? (Number(rest) as Verdi);
  if (!VERDIER.includes(verdi)) {
    throw new Error(`Ugyldig verdi i kort-id: ${id}`);
  }
  return { farge, verdi };
}

export function likeKort(a: Kort, b: Kort): boolean {
  return a.farge === b.farge && a.verdi === b.verdi;
}

/** En full stokk på 52 kort, sortert (ess høyest). */
export function nyStokk(): Kort[] {
  const stokk: Kort[] = [];
  for (const farge of FARGER) {
    for (const verdi of VERDIER) {
      stokk.push({ farge, verdi });
    }
  }
  return stokk;
}

/**
 * Deterministisk PRNG (mulberry32). Gir reproduserbar stokking når man
 * oppgir seed – nyttig for testing, replays og server-autoritative spill.
 */
export function lagRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stokker en kopi av kortene med Fisher–Yates og gitt tilfeldighetskilde. */
export function stokk(kort: readonly Kort[], rng: () => number): Kort[] {
  const ut = kort.slice();
  for (let i = ut.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = ut[i]!;
    const b = ut[j]!;
    ut[i] = b;
    ut[j] = a;
  }
  return ut;
}
