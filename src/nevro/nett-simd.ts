/**
 * ============ SIMD-KJERNEN (17. sep): `forover`, BIT FOR BIT, i WebAssembly ============
 *
 * HVORFOR. Profilen av helbotens søk: **75 % av all tid er `forover`** på kortnettet i
 * utspillingene (`D:\amb-grp\loop\fart.md` §1). Søket kan ikke kuttes (−0,35 pp), så det må bli
 * billigere, og det første stedet å hente fart uten å røre ett eneste kortvalg er her.
 *
 * HVORFOR DEN ER BIT-IDENTISK MED `forover` — og hvorfor det ikke er flaks:
 *
 *   1. SAMME LEDD, SAMME REKKEFØLGE PER UTGANG. `forover` regner for utgang r
 *      `bias[r] + W[r,c1]·a[c1] + W[r,c2]·a[c2] + …` med c stigende og hopper over a[c] = 0.
 *      Her går den ytre løkka over c stigende og legger `W[·,c]·a[c]` til ALLE utgangene.
 *      For hver enkelt r er leddene og rekkefølgen de samme. (`nett-kolonne.ts` hevder det
 *      motsatte; avviket den målte kom av at mellomlagene ble holdt i Float64.)
 *   2. SAMME PRESISJON. `forover` summerer i en JS-`number` (Float64) og skriver til en
 *      Float32Array ved lagslutt. Her summeres i f64x2 og rundes med
 *      `f32x4.demote_f64x2_zero` → `f64x2.promote_low_f32x4`, som er nøyaktig `Math.fround`
 *      (IEEE round-to-nearest-even i begge).
 *   3. WASM HAR INGEN KONTRAKSJON. Spesifikasjonen forbyr å slå `mul` og `add` sammen til en
 *      FMA, og f64x2-banene er uavhengige IEEE-operasjoner. `relaxed_madd` brukes IKKE.
 *   4. ReLU er `f64x2.pmax(s, 0)` = `s < 0 ? 0 : s`, som er `forover` sitt uttrykk ordrett
 *      (også for −0: `−0 < 0` er usant, så −0 står i begge).
 *
 * Vektene lagres KOLONNEVIS og forfremmet til Float64 én gang (eksakt). Minnet er 8 byte per
 * vekt, altså ~4,5 MB for `kort-8`.
 *
 * FALLBACK. Uten SIMD-støtte (eldre nettleser) eller med et odde antall utganger i noe lag
 * brukes `foroverRask` (ren JS, samme bit-identitet). Prøven `test/fart-kjerne.test.ts` holder
 * begge mot `forover`.
 */

import type { NevroNett } from "./nett.ts";

// ---------------------------------------------------------------- en liten assembler

const leb = (n: number): number[] => {
  const ut: number[] = [];
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n !== 0) b |= 0x80;
    ut.push(b);
  } while (n !== 0);
  return ut;
};
const sleb = (n: number): number[] => {
  const ut: number[] = [];
  for (;;) {
    const b = n & 0x7f;
    n >>= 7;
    if ((n === 0 && (b & 0x40) === 0) || (n === -1 && (b & 0x40) !== 0)) {
      ut.push(b);
      return ut;
    }
    ut.push(b | 0x80);
  }
};
const vek = (deler: number[][]): number[] => [...leb(deler.length), ...deler.flat()];
const seksjon = (id: number, innhold: number[]): number[] => [id, ...leb(innhold.length), ...innhold];
const navn = (s: string): number[] => [...leb(s.length), ...[...s].map((c) => c.charCodeAt(0))];

// Instruksjoner
const lget = (i: number): number[] => [0x20, i];
const lset = (i: number): number[] => [0x21, i];
const i32c = (n: number): number[] => [0x41, ...sleb(n)];
const I32_ADD = [0x6a];
const I32_MUL = [0x6c];
const I32_LTU = [0x49];
const I32_GEU = [0x4f];
const F64_EQ = [0x61];
const F64_NE = [0x62];
const f64load = [0x2b, 3, 0];
const f64c = (x: number): number[] => {
  const b = new Uint8Array(new Float64Array([x]).buffer);
  return [0x44, ...b];
};
const BLOCK = [0x02, 0x40];
const LOOP = [0x03, 0x40];
const IF = [0x04, 0x40];
const ELSE = [0x05];
const END = [0x0b];
const br = (d: number): number[] => [0x0c, d];
const brIf = (d: number): number[] => [0x0d, d];
const simd = (op: number, ...rest: number[]): number[] => [0xfd, ...leb(op), ...rest];
const V_LOAD = simd(0x00, 0, 0);
const V_STORE = simd(0x0b, 0, 0);
const F64X2_SPLAT = simd(0x14);
const F32X4_DEMOTE = simd(0x5e);
const F64X2_PROMOTE = simd(0x5f);
const F64X2_ADD = simd(0xf0);
const F64X2_MUL = simd(0xf2);
const F64X2_PMAX = simd(0xf7);
const V128_NULL = simd(0x0c, ...new Array<number>(16).fill(0));

/**
 * lag(inn, ut, kol, bias, x, y, z, relu)
 *   x: inn f64 (inngangen), y: ut f64 (akkumulator), kol: inn·ut f64 kolonnevis, bias: ut f64.
 *   relu≠0: z får ut f64 = fround(max-uttrykket).   relu=0: z får ut f32 = fround(y).
 * Alle områder er polstret med minst 16 byte, og `ut` er et partall.
 */
function byggModul(): Uint8Array {
  const [INN, UT, KOL, BIAS, X, Y, Z, RELU] = [0, 1, 2, 3, 4, 5, 6, 7];
  const [R, C, END_, OFF] = [8, 9, 10, 11]; // i32-lokale
  const V = 12; // f64
  const VV = 13; // v128
  const kropp: number[] = [
    // end_ = ut * 8
    ...lget(UT), ...i32c(8), ...I32_MUL, ...lset(END_),
    // bias → y
    ...i32c(0), ...lset(R),
    ...LOOP,
      ...lget(Y), ...lget(R), ...I32_ADD,
      ...lget(BIAS), ...lget(R), ...I32_ADD, ...V_LOAD,
      ...V_STORE,
      ...lget(R), ...i32c(16), ...I32_ADD, ...lset(R),
      ...lget(R), ...lget(END_), ...I32_LTU, ...brIf(0),
    ...END,
    // for c in 0..inn
    ...i32c(0), ...lset(C),
    ...BLOCK,
      ...LOOP,
        ...lget(C), ...lget(INN), ...I32_GEU, ...brIf(1),
        ...lget(X), ...lget(C), ...i32c(8), ...I32_MUL, ...I32_ADD, ...f64load, ...lset(V),
        ...lget(V), ...f64c(0), ...F64_NE,
        ...IF,
          // off = kol + c * end_
          ...lget(KOL), ...lget(C), ...lget(END_), ...I32_MUL, ...I32_ADD, ...lset(OFF),
          ...i32c(0), ...lset(R),
          ...lget(V), ...f64c(1), ...F64_EQ,
          ...IF,
            ...LOOP,
              ...lget(Y), ...lget(R), ...I32_ADD,
              ...lget(Y), ...lget(R), ...I32_ADD, ...V_LOAD,
              ...lget(OFF), ...lget(R), ...I32_ADD, ...V_LOAD,
              ...F64X2_ADD,
              ...V_STORE,
              ...lget(R), ...i32c(16), ...I32_ADD, ...lset(R),
              ...lget(R), ...lget(END_), ...I32_LTU, ...brIf(0),
            ...END,
          ...ELSE,
            ...lget(V), ...F64X2_SPLAT, ...lset(VV),
            ...LOOP,
              ...lget(Y), ...lget(R), ...I32_ADD,
              ...lget(Y), ...lget(R), ...I32_ADD, ...V_LOAD,
              ...lget(OFF), ...lget(R), ...I32_ADD, ...V_LOAD,
              ...lget(VV), ...F64X2_MUL,
              ...F64X2_ADD,
              ...V_STORE,
              ...lget(R), ...i32c(16), ...I32_ADD, ...lset(R),
              ...lget(R), ...lget(END_), ...I32_LTU, ...brIf(0),
            ...END,
          ...END,
        ...END,
        ...lget(C), ...i32c(1), ...I32_ADD, ...lset(C),
        ...br(0),
      ...END,
    ...END,
    // utgangen
    ...i32c(0), ...lset(R),
    ...lget(RELU),
    ...IF,
      ...LOOP,
        ...lget(Z), ...lget(R), ...I32_ADD,
        ...lget(Y), ...lget(R), ...I32_ADD, ...V_LOAD,
        ...V128_NULL, ...F64X2_PMAX,
        ...F32X4_DEMOTE, ...F64X2_PROMOTE,
        ...V_STORE,
        ...lget(R), ...i32c(16), ...I32_ADD, ...lset(R),
        ...lget(R), ...lget(END_), ...I32_LTU, ...brIf(0),
      ...END,
    ...ELSE,
      // f32-utgang: 2 verdier (8 byte) per steg; de 8 nullbytene bak overskrives av neste steg.
      ...LOOP,
        ...lget(Z), ...lget(R), ...i32c(1), ...[0x76], ...I32_ADD, // z + r/2 (r >> 1)
        ...lget(Y), ...lget(R), ...I32_ADD, ...V_LOAD,
        ...F32X4_DEMOTE,
        ...V_STORE,
        ...lget(R), ...i32c(16), ...I32_ADD, ...lset(R),
        ...lget(R), ...lget(END_), ...I32_LTU, ...brIf(0),
      ...END,
    ...END,
    ...END,
  ];
  const lokale = vek([
    [4, 0x7f],
    [1, 0x7c],
    [1, 0x7b],
  ]);
  const funk = [...lokale, ...kropp];
  const bytes = [
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...seksjon(1, vek([[0x60, ...vek(new Array(8).fill([0x7f])), 0x00]])),
    ...seksjon(2, vek([[...navn("e"), ...navn("m"), 0x02, 0x00, 0x00]])),
    ...seksjon(3, vek([[0x00]])),
    ...seksjon(7, vek([[...navn("lag"), 0x00, 0x00]])),
    ...seksjon(10, vek([[...leb(funk.length), ...funk]])),
  ];
  return new Uint8Array(bytes);
}

// ---------------------------------------------------------------- oppsett per nett

type LagFn = (inn: number, ut: number, kol: number, bias: number, x: number, y: number, z: number, relu: number) => void;

interface SimdNett {
  readonly lag: LagFn;
  readonly f64: Float64Array;
  readonly f32: Float32Array;
  readonly lagInfo: readonly { inn: number; ut: number; kol: number; bias: number }[];
  readonly bufA: number;
  readonly bufB: number;
  readonly akk: number;
}

let modul: WebAssembly.Module | null | undefined;
function hentModul(): WebAssembly.Module | null {
  if (modul !== undefined) return modul;
  try {
    const b = byggModul();
    modul = WebAssembly.validate(b) ? new WebAssembly.Module(b) : null;
  } catch {
    modul = null;
  }
  return modul;
}

const nettene = new WeakMap<NevroNett, SimdNett | null>();
const pad = (n: number): number => (Math.ceil(n / 8) + 2) * 8; // minst 16 byte ekstra, 8-justert

function byggNett(nett: NevroNett): SimdNett | null {
  const m = hentModul();
  if (m === null) return null;
  if (nett.lag.some((l) => l.ut % 2 !== 0)) return null;
  let p = 16;
  const lagInfo: { inn: number; ut: number; kol: number; bias: number }[] = [];
  let maks = 0;
  for (const l of nett.lag) {
    const kol = p;
    p += pad(l.inn * l.ut * 8);
    const bias = p;
    p += pad(l.ut * 8);
    lagInfo.push({ inn: l.inn, ut: l.ut, kol, bias });
    maks = Math.max(maks, l.inn, l.ut);
  }
  const bufA = p;
  p += pad(maks * 8);
  const bufB = p;
  p += pad(maks * 8);
  const akk = p;
  p += pad(maks * 8);
  const sider = Math.ceil(p / 65536) + 1;
  const minne = new WebAssembly.Memory({ initial: sider });
  const inst = new WebAssembly.Instance(m, { e: { m: minne } });
  const f64 = new Float64Array(minne.buffer);
  const f32 = new Float32Array(minne.buffer);
  nett.lag.forEach((l, i) => {
    const info = lagInfo[i]!;
    const k0 = info.kol / 8;
    for (let r = 0; r < l.ut; r++) {
      const rad = r * l.inn;
      for (let c = 0; c < l.inn; c++) f64[k0 + c * l.ut + r] = l.vekter[rad + c]!;
    }
    f64.set(l.bias, info.bias / 8);
  });
  return { lag: inst.exports.lag as LagFn, f64, f32, lagInfo, bufA, bufB, akk };
}

/** Er SIMD-kjernen tilgjengelig i denne kjøretiden? */
export function simdTilgjengelig(): boolean {
  return hentModul() !== null;
}

/**
 * `forover` i SIMD, eller `null` når kjernen ikke kan brukes for dette nettet (kalleren faller da
 * tilbake). Samme kontrakt: ReLU på alle lag unntatt det siste, fersk Float32Array ut.
 */
export function foroverSimd(nett: NevroNett, x: Float32Array): Float32Array | null {
  let s = nettene.get(nett);
  if (s === undefined) {
    s = byggNett(nett);
    nettene.set(nett, s);
  }
  if (s === null) return null;
  const siste = s.lagInfo.length - 1;
  const inn0 = s.lagInfo[0]!.inn;
  if (x.length < inn0) return null;
  // Inngangen til Float64: `set` fra Float32Array forfremmer eksakt.
  s.f64.set(x.length === inn0 ? x : x.subarray(0, inn0), s.bufA / 8);
  let fra = s.bufA;
  let til = s.bufB;
  for (let i = 0; i <= siste; i++) {
    const l = s.lagInfo[i]!;
    s.lag(l.inn, l.ut, l.kol, l.bias, fra, s.akk, til, i < siste ? 1 : 0);
    const t = fra;
    fra = til;
    til = t;
  }
  const ut = s.lagInfo[siste]!.ut;
  return s.f32.slice(fra / 4, fra / 4 + ut);
}
