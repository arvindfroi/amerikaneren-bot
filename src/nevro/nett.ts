/**
 * NevroHjerne: appens ferdigtrente nett, kjørbart her.
 *
 * Amerikaneren-App har tre små MLP-er (bud, byttekort, kortspill) som er
 * destillert fra MesterAI og finpusset med selvspill. På appens egen stige
 * («én bot mot 3× Vanskelig») ligger nettet på 90,1 poeng – over vår
 * PIMC-rask (78,7) og under MesterAI (105,3), og det koster mikrosekunder
 * per trekk fordi det ikke søker.
 *
 * Her brukes det som (a) sterk, rask motstander i benk og cup – langt mer
 * krevende enn grådig-boten – og (b) lærer/prior for NEAT-linjene.
 *
 * Vektene leses uendret fra appens binærformat (Int32/Float32
 * little-endian): antall nett, så per nett antall lag, så per lag
 * inn/ut/vekter/bias. Ingen avhengigheter, ingen I/O – base64-strengen
 * ligger i vekter.ts, så modulen kjører også i nettleser.
 */

import { NEVRO_VEKTER_B64 } from "./vekter.ts";

export interface NevroLag {
  readonly inn: number;
  readonly ut: number;
  /** ut × inn, radvis. */
  readonly vekter: Float32Array;
  readonly bias: Float32Array;
}

export interface NevroNett {
  readonly lag: readonly NevroLag[];
}

export interface NevroHjerne {
  readonly bud: NevroNett;
  readonly bytt: NevroNett;
  readonly spill: NevroNett;
}

/** ReLU på alle lag unntatt det siste (logits) – som i appen. */
export function forover(nett: NevroNett, x: Float32Array): Float32Array {
  let a = x;
  for (let i = 0; i < nett.lag.length; i++) {
    const l = nett.lag[i]!;
    const y = new Float32Array(l.ut);
    for (let r = 0; r < l.ut; r++) {
      let sum = l.bias[r]!;
      const rad = r * l.inn;
      for (let c = 0; c < l.inn; c++) sum += l.vekter[rad + c]! * a[c]!;
      y[r] = sum;
    }
    if (i < nett.lag.length - 1) {
      for (let j = 0; j < y.length; j++) if (y[j]! < 0) y[j] = 0;
    }
    a = y;
  }
  return a;
}

function base64TilBytes(b64: string): Uint8Array {
  const rå = atob(b64);
  const ut = new Uint8Array(rå.length);
  for (let i = 0; i < rå.length; i++) ut[i] = rå.charCodeAt(i);
  return ut;
}

export function hjerneFraBase64(b64: string): NevroHjerne {
  const bytes = base64TilBytes(b64);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  const lesInt = (): number => {
    const v = dv.getInt32(p, true);
    p += 4;
    return v;
  };
  const lesFloats = (antall: number): Float32Array => {
    const ut = new Float32Array(antall);
    for (let i = 0; i < antall; i++) ut[i] = dv.getFloat32(p + i * 4, true);
    p += antall * 4;
    return ut;
  };
  const antallNett = lesInt();
  if (antallNett !== 3) throw new Error(`NevroHjerne: forventet 3 nett, fikk ${antallNett}`);
  const nett: NevroNett[] = [];
  for (let n = 0; n < 3; n++) {
    const antallLag = lesInt();
    const lag: NevroLag[] = [];
    for (let l = 0; l < antallLag; l++) {
      const inn = lesInt();
      const ut = lesInt();
      lag.push({ inn, ut, vekter: lesFloats(inn * ut), bias: lesFloats(ut) });
    }
    nett.push({ lag });
  }
  if (p !== bytes.length) throw new Error(`NevroHjerne: leste ${p} av ${bytes.length} byte`);
  return { bud: nett[0]!, bytt: nett[1]!, spill: nett[2]! };
}

let delt: NevroHjerne | null = null;
/** Den innebygde hjernen (dekodes én gang, ~400 kB vekter). */
export function nevroHjerne(): NevroHjerne {
  delt ??= hjerneFraBase64(NEVRO_VEKTER_B64);
  return delt;
}
