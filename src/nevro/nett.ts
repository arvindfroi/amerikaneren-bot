/**
 * NevroHjerne: appens innebygde nevronett, portert fra Swift
 * (`Amerikaneren/AI/NevroNett.swift`) til TypeScript.
 *
 * Nettet er et helt vanlig flerlags perseptron – tette lag med ReLU på alle
 * lag unntatt det siste (logits). Vektene er trent offline (destillering fra
 * MesterAI + selvspill-forsterkningslæring) og ligger som Float32 i samme
 * binærformat som appen skiper: Int32/Float32, little-endian.
 *
 * Regnestykket gjøres i float32 (`Math.fround` på hver multiplikasjon og hver
 * akkumulering), presis slik Swift-koden gjør det. Da får nettleseren og
 * appen bit-identiske logits, og dermed samme trekk.
 */

const fr = Math.fround;

export interface NevroLag {
  readonly inn: number;
  readonly ut: number;
  /** ut × inn, radvis. */
  readonly vekter: Float32Array;
  readonly bias: Float32Array;
}

/** Ett lag forover. `relu` klipper negative verdier til 0. */
export function lagForover(l: NevroLag, x: Float32Array, relu: boolean): Float32Array {
  const y = new Float32Array(l.ut);
  for (let r = 0; r < l.ut; r++) {
    const rad = r * l.inn;
    // Swift starter fra biasen og legger til produktene ett for ett.
    let sum = l.bias[r]!;
    for (let c = 0; c < l.inn; c++) {
      sum = fr(sum + fr(l.vekter[rad + c]! * x[c]!));
    }
    y[r] = relu && sum < 0 ? 0 : sum;
  }
  return y;
}

export interface NevroNett {
  readonly lag: readonly NevroLag[];
}

/** Hele nettet forover: ReLU på alle lag unntatt det siste. */
export function forover(n: NevroNett, x: Float32Array): Float32Array {
  let a = x;
  for (let i = 0; i < n.lag.length; i++) {
    a = lagForover(n.lag[i]!, a, i < n.lag.length - 1);
  }
  return a;
}

/** De tre nettene: bud, byttekort-vrak og kortspill. */
export interface NevroHjerne {
  readonly bud: NevroNett;
  readonly bytt: NevroNett;
  readonly spill: NevroNett;
}

/**
 * Leser appens vektformat: antall nett (3), så per nett antall lag, og per
 * lag `inn`, `ut`, vektene (ut × inn) og biasene (ut) – alt little-endian.
 */
export function hjerneFraBinær(bytes: Uint8Array): NevroHjerne {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  const lesInt = (): number => {
    if (pos + 4 > bytes.byteLength) throw new Error("nevrovekter: uventet slutt");
    const v = dv.getInt32(pos, true);
    pos += 4;
    return v;
  };
  const lesFloats = (antall: number): Float32Array => {
    if (pos + antall * 4 > bytes.byteLength) throw new Error("nevrovekter: uventet slutt");
    const ut = new Float32Array(antall);
    for (let i = 0; i < antall; i++) ut[i] = dv.getFloat32(pos + i * 4, true);
    pos += antall * 4;
    return ut;
  };

  const antallNett = lesInt();
  if (antallNett !== 3) throw new Error(`nevrovekter: forventet 3 nett, fikk ${antallNett}`);
  const nett: NevroNett[] = [];
  for (let n = 0; n < 3; n++) {
    const antallLag = lesInt();
    const lag: NevroLag[] = [];
    for (let l = 0; l < antallLag; l++) {
      const inn = lesInt();
      const ut = lesInt();
      const vekter = lesFloats(inn * ut);
      const bias = lesFloats(ut);
      lag.push({ inn, ut, vekter, bias });
    }
    nett.push({ lag });
  }
  if (pos !== bytes.byteLength) {
    throw new Error(`nevrovekter: ${bytes.byteLength - pos} byte til overs`);
  }
  return { bud: nett[0]!, bytt: nett[1]!, spill: nett[2]! };
}

/** Samme, men fra base64 (formatet vektene distribueres i). */
export function hjerneFraBase64(b64: string): NevroHjerne {
  return hjerneFraBinær(base64TilBytes(b64));
}

/** Base64 → bytes, både i nettleser (atob) og Node (Buffer). */
export function base64TilBytes(b64: string): Uint8Array {
  const ren = b64.replace(/\s+/g, "");
  const atobFn = (globalThis as { atob?: (s: string) => string }).atob;
  if (atobFn !== undefined) {
    const rå = atobFn(ren);
    const ut = new Uint8Array(rå.length);
    for (let i = 0; i < rå.length; i++) ut[i] = rå.charCodeAt(i);
    return ut;
  }
  const B = (globalThis as { Buffer?: { from(s: string, enc: string): Uint8Array } }).Buffer;
  if (B !== undefined) {
    const b = B.from(ren, "base64");
    return new Uint8Array(b.buffer as ArrayBuffer, (b as unknown as { byteOffset: number }).byteOffset, b.length).slice();
  }
  throw new Error("ingen base64-dekoder tilgjengelig");
}
