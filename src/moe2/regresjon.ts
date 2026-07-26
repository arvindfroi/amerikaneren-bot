/**
 * MINSTE KVADRATERS METODE – den minste som trengs, og den er testet.
 *
 * HVORFOR EGEN MODUL OG IKKE TI LINJER I SKRIPTET. Vektene i `vrakregler.ts`
 * kommer HERFRA. En regresjon som løser normalligningene feil gir tall som ser
 * helt rimelige ut – riktig fortegn, riktig størrelsesorden – og det finnes
 * ingen måte å oppdage det på ved å lese rapporten. Derfor står den i en modul
 * med en test som sjekker den mot en eksakt kjent løsning.
 *
 * NORMALLIGNINGENE, ikke QR. X'X er 6×6 her, og prediktorene er tellinger med
 * lav korrelasjon, så kondisjonstallet er ikke i nærheten av å være et problem.
 * Ridge-leddet `lambda` står likevel med, fordi giv-faste effekter kan gjøre en
 * kolonne konstant null innenfor en giv (f.eks. «vraket ess» når ingen policy
 * kastet et ess i den giva), og da er X'X singulær uten det.
 */

/** Resultatet av én tilpasning. */
export interface Tilpasning {
  /** Koeffisientene, i samme rekkefølge som kolonnene i X. */
  readonly beta: number[];
  /** Konstantleddet. 0 når `medKonstant` er av. */
  readonly konstant: number;
  /** Andelen forklart varians i TILPASNINGSSETTET. */
  readonly r2: number;
  readonly n: number;
}

/**
 * Løser A·x = b ved gausseliminasjon med delvis pivotering.
 * Returnerer null når matrisen er (numerisk) singulær.
 */
export function løsLikninger(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = A.map((rad, i) => [...rad, b[i]!]);
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(m[i]![k]!) > Math.abs(m[pivot]![k]!)) pivot = i;
    if (Math.abs(m[pivot]![k]!) < 1e-12) return null;
    [m[k], m[pivot]] = [m[pivot]!, m[k]!];
    for (let i = k + 1; i < n; i++) {
      const f = m[i]![k]! / m[k]![k]!;
      if (f === 0) continue;
      for (let j = k; j <= n; j++) m[i]![j]! -= f * m[k]![j]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = m[i]![n]!;
    for (let j = i + 1; j < n; j++) sum -= m[i]![j]! * x[j]!;
    x[i] = sum / m[i]![i]!;
  }
  return x;
}

export interface OlsOpts {
  /** Ta med konstantledd. Av når dataene alt er sentrert (giv-faste effekter). */
  readonly medKonstant?: boolean;
  /** Ridge-demping. Liten og fast; står bare for å tåle konstante kolonner. */
  readonly lambda?: number;
}

/** Tilpasser y på kolonnene i X. `X[i]` er rad i. */
export function ols(X: readonly (readonly number[])[], y: readonly number[], opts: OlsOpts = {}): Tilpasning | null {
  const medKonstant = opts.medKonstant ?? true;
  const lambda = opts.lambda ?? 1e-8;
  const n = y.length;
  if (n === 0 || X.length !== n) return null;
  const p = X[0]!.length;
  const k = p + (medKonstant ? 1 : 0);
  const rad = (i: number): number[] => (medKonstant ? [...X[i]!, 1] : [...X[i]!]);

  const A: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b = new Array<number>(k).fill(0);
  for (let i = 0; i < n; i++) {
    const r = rad(i);
    for (let a = 0; a < k; a++) {
      b[a]! += r[a]! * y[i]!;
      for (let c = a; c < k; c++) A[a]![c]! += r[a]! * r[c]!;
    }
  }
  for (let a = 0; a < k; a++) {
    // Konstantleddet skal ikke dempes – ellers trekkes snittet mot null.
    if (!(medKonstant && a === k - 1)) A[a]![a]! += lambda;
    for (let c = 0; c < a; c++) A[a]![c] = A[c]![a]!;
  }
  const løsning = løsLikninger(A, b);
  if (løsning === null) return null;

  const ȳ = y.reduce((s, v) => s + v, 0) / n;
  let sse = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    const r = rad(i);
    let pred = 0;
    for (let a = 0; a < k; a++) pred += løsning[a]! * r[a]!;
    sse += (y[i]! - pred) ** 2;
    // Uten konstantledd er referansen null, ikke snittet: modellen har ikke
    // lov til å bruke et snitt den ikke estimerer.
    sst += medKonstant ? (y[i]! - ȳ) ** 2 : y[i]! ** 2;
  }
  return {
    beta: løsning.slice(0, p),
    konstant: medKonstant ? løsning[k - 1]! : 0,
    r2: sst > 0 ? 1 - sse / sst : 0,
    n,
  };
}

/** Predikerer y for én rad med en ferdig tilpasning. */
export function forutsi(t: Tilpasning, x: readonly number[]): number {
  let sum = t.konstant;
  for (let i = 0; i < t.beta.length; i++) sum += t.beta[i]! * x[i]!;
  return sum;
}

/**
 * R² UTENFOR TILPASNINGSSETTET – tallet som faktisk avgjør om en modell er
 * bedre enn en annen. R² innenfor settet vokser alltid når man legger til en
 * kolonne, så en sammenligning av «lengde alene» mot «lengde + styrke» på
 * tilpasningssettet er ingen sammenligning i det hele tatt.
 */
export function r2Ute(
  t: Tilpasning,
  X: readonly (readonly number[])[],
  y: readonly number[],
): number {
  if (y.length === 0) return NaN;
  const ȳ = y.reduce((s, v) => s + v, 0) / y.length;
  let sse = 0;
  let sst = 0;
  for (let i = 0; i < y.length; i++) {
    sse += (y[i]! - forutsi(t, X[i]!)) ** 2;
    sst += (y[i]! - ȳ) ** 2;
  }
  return sst > 0 ? 1 - sse / sst : NaN;
}

/**
 * SENTRERER hver kolonne og y innenfor GRUPPEN sin – giv-faste effekter.
 *
 * Det er dette som gjør regresjonen til en sammenligning av ULIKE VRAK AV
 * SAMME HÅND. Uten det måler koeffisienten på «renonser» like mye at hender
 * som TÅLER en renons er gode hender, som at renonsen i seg selv er verdt noe,
 * og hele analysen ville bare gjentatt at gode hender gir gode resultater.
 */
export function sentrerPerGruppe(
  gruppe: readonly number[],
  X: readonly (readonly number[])[],
  y: readonly number[],
): { X: number[][]; y: number[] } {
  const p = X[0]?.length ?? 0;
  const sum = new Map<number, { x: number[]; y: number; n: number }>();
  for (let i = 0; i < y.length; i++) {
    let s = sum.get(gruppe[i]!);
    if (s === undefined) {
      s = { x: new Array<number>(p).fill(0), y: 0, n: 0 };
      sum.set(gruppe[i]!, s);
    }
    for (let j = 0; j < p; j++) s.x[j]! += X[i]![j]!;
    s.y += y[i]!;
    s.n++;
  }
  const uX: number[][] = [];
  const uY: number[] = [];
  for (let i = 0; i < y.length; i++) {
    const s = sum.get(gruppe[i]!)!;
    uX.push(X[i]!.map((v, j) => v - s.x[j]! / s.n));
    uY.push(y[i]! - s.y / s.n);
  }
  return { X: uX, y: uY };
}
