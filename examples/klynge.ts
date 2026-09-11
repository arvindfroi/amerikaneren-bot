/**
 * KLYNGEBOOTSTRAP — SE når radene deler giv, kamp eller spiller.
 *
 * Kravprøvene skriver flere rader per giv: fire seter i takkartet, fire budstillinger
 * i K5, mange runder per kamp i K1 og K6. Radene er da IKKE uavhengige, og den vanlige
 * `se()` i `mlb-krav-felles.ts` undervurderer usikkerheten med en faktor som kan være
 * stor — fire seter på samme kort ser ut som fire målinger og er nærmere én.
 *
 * `analyse/duplikat-dom.mjs` gjør det samme for K1 (B = 20 000). Her er formen
 * generell, og frøet er fast, så en rapport skrevet to ganger av samme rader er
 * bit-identisk.
 */

/** xorshift32, samme generator som `duplikat-dom.mjs`. */
function xorshift(frø: number): () => number {
  let x = frø >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

export interface Klyngesnitt {
  readonly n: number;
  readonly klynger: number;
  readonly snitt: number;
  /** Standardavviket til bootstrapsnittene. NaN med under to klynger. */
  readonly se: number;
}

/**
 * Snittet over alle rader (ratioestimatoren: sum over klynger / antall rader), med SE
 * fra B trekninger av hele klynger med tilbakelegging. Ikke-endelige verdier telles ikke.
 */
export function klyngeSnitt<T>(
  rader: readonly T[],
  klynge: (r: T) => string | number,
  verdi: (r: T) => number,
  B = 2000,
  frø = 20_260_911,
): Klyngesnitt {
  const kl = new Map<string, { s: number; n: number }>();
  for (const r of rader) {
    const v = verdi(r);
    if (!Number.isFinite(v)) continue;
    const k = String(klynge(r));
    const c = kl.get(k) ?? { s: 0, n: 0 };
    c.s += v;
    c.n++;
    kl.set(k, c);
  }
  const K = [...kl.values()];
  const n = K.reduce((a, c) => a + c.n, 0);
  if (n === 0) return { n: 0, klynger: 0, snitt: NaN, se: NaN };
  const snitt = K.reduce((a, c) => a + c.s, 0) / n;
  if (K.length < 2) return { n, klynger: K.length, snitt, se: NaN };
  const rng = xorshift(frø);
  let m1 = 0;
  let m2 = 0;
  for (let b = 0; b < B; b++) {
    let s = 0;
    let nn = 0;
    for (let i = 0; i < K.length; i++) {
      const c = K[Math.floor(rng() * K.length)]!;
      s += c.s;
      nn += c.n;
    }
    const v = s / nn;
    m1 += v;
    m2 += v * v;
  }
  const m = m1 / B;
  return { n, klynger: K.length, snitt, se: Math.sqrt(Math.max(0, m2 / B - m * m)) };
}

export interface Klyngestigning {
  readonly n: number;
  readonly klynger: number;
  readonly b: number;
  readonly se: number;
}

/**
 * OLS-stigningen av y mot x, med SE fra klyngebootstrap. K6 måler om gevinsten VOKSER
 * med rundenummeret, og rundene i én kamp deler bord, motstander og stilling — den
 * vanlige OLS-SE-en behandler dem som uavhengige.
 */
export function klyngeStigning<T>(
  rader: readonly T[],
  klynge: (r: T) => string | number,
  x: (r: T) => number,
  y: (r: T) => number,
  B = 2000,
  frø = 20_260_912,
): Klyngestigning {
  type S = { n: number; sx: number; sy: number; sxx: number; sxy: number };
  const kl = new Map<string, S>();
  for (const r of rader) {
    const xv = x(r);
    const yv = y(r);
    if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
    const k = String(klynge(r));
    const c = kl.get(k) ?? { n: 0, sx: 0, sy: 0, sxx: 0, sxy: 0 };
    c.n++;
    c.sx += xv;
    c.sy += yv;
    c.sxx += xv * xv;
    c.sxy += xv * yv;
    kl.set(k, c);
  }
  const K = [...kl.values()];
  const stig = (u: readonly S[]): number => {
    let n = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (const c of u) {
      n += c.n;
      sx += c.sx;
      sy += c.sy;
      sxx += c.sxx;
      sxy += c.sxy;
    }
    const nevner = sxx - (sx * sx) / n;
    return n < 3 || !(nevner > 0) ? NaN : (sxy - (sx * sy) / n) / nevner;
  };
  const n = K.reduce((a, c) => a + c.n, 0);
  const b = stig(K);
  if (K.length < 2 || !Number.isFinite(b)) return { n, klynger: K.length, b, se: NaN };
  const rng = xorshift(frø);
  let m1 = 0;
  let m2 = 0;
  let gyldige = 0;
  const u = new Array<S>(K.length);
  for (let t = 0; t < B; t++) {
    for (let i = 0; i < K.length; i++) u[i] = K[Math.floor(rng() * K.length)]!;
    const v = stig(u);
    if (!Number.isFinite(v)) continue;
    m1 += v;
    m2 += v * v;
    gyldige++;
  }
  if (gyldige < 2) return { n, klynger: K.length, b, se: NaN };
  const m = m1 / gyldige;
  return { n, klynger: K.length, b, se: Math.sqrt(Math.max(0, m2 / gyldige - m * m)) };
}
