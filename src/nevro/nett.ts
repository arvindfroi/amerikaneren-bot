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

/**
 * ============ HVORFOR DENNE ER GLISSEN OG IKKE TETT ======================
 *
 * Profilen av alpha-mu-søket 8. august: **95 % av tiden er dette kallet.**
 * Verdenstrekningen var 0,1 %, motoren 0,4 %. Skal søket bli billigere, må det
 * skje her — og målt på `d7alle` er aktiveringene svært glisne:
 *
 *     lag 0  273x512   77,8 % nuller inn
 *     lag 1  512x384   83,3 %
 *     lag 2  384x256   88,9 %
 *     lag 3  256x52    83,4 %
 *     ------------------------------------
 *     448 000 MAC-er   ->  76 949  (17,2 %)
 *
 * Inngangen er nesten bare indikatortrekk, og ReLU nuller ut resten. Å gange
 * med null og legge til er arbeid vi kan hoppe over.
 *
 * ============ OG HVORFOR DEN LIKEVEL ER BIT-IDENTISK ====================
 *
 * Leddet vi hopper over er `vekt * 0`, altså `±0`, og `sum + ±0 === sum` for
 * enhver endelig `sum`. **Rekkefølgen bevares**: indeksene samles stigende, så
 * de gjenværende leddene legges sammen i nøyaktig samme orden som før. Det er
 * det avgjørende — en kolonnevis omskriving ville vært raskere, men da endres
 * summeringsrekkefølgen, og flyttall er ikke assosiative.
 *
 * To hjørner, sagt høyt fordi de ikke er null-risiko, bare uobserverbare:
 *
 *   1. `-0 + 0` er `+0`. En delsum som er nøyaktig `-0` kan altså skifte
 *      fortegn på nullen. Ingen leser skiller dem: ReLU-en tester `< 0` (usann
 *      for begge) og argmaks tester `>` (usann for begge).
 *   2. `±Infinity * 0` er `NaN`. Et nett med uendelige vekter ville altså gitt
 *      NaN før og et tall nå — men et slikt nett gir uansett bare NaN-logits
 *      og søppelvalg, så det er ikke en oppførsel noen kan ha ment å ha.
 *
 * `test/nett-glissen.test.ts` holder identiteten, og
 * `test/amu-bitidentisk.test.ts` holder den gjennom hele søket.
 */

/**
 * Skrivebuffere for MELLOMLAGENE, slik at et framoverkall ikke allokerer fire
 * Float32Array-er. Det SISTE laget får alltid en fersk array — den forlater
 * funksjonen, og en kaller som holder på logitsene over neste kall ville ellers
 * fått dem overskrevet under seg.
 *
 * Trygt uten låsing fordi `forover` ikke kaller noe som kan kalle `forover`
 * igjen, og fordi hver arbeidertråd har sin egen modulinstans.
 */
let bufA = new Float32Array(0);
let bufB = new Float32Array(0);
let ikkeNull = new Int32Array(0);

/** ReLU på alle lag unntatt det siste (logits) – som i appen. */
export function forover(nett: NevroNett, x: Float32Array): Float32Array {
  const sisteLag = nett.lag.length - 1;
  let a = x;
  for (let i = 0; i < nett.lag.length; i++) {
    const l = nett.lag[i]!;
    if (ikkeNull.length < l.inn) ikkeNull = new Int32Array(l.inn);
    // De ikke-null inngangene, STIGENDE. Rekkefølgen er hele bit-identiteten.
    let m = 0;
    for (let c = 0; c < l.inn; c++) if (a[c] !== 0) ikkeNull[m++] = c;

    let y: Float32Array;
    if (i === sisteLag) {
      y = new Float32Array(l.ut);
    } else {
      // Les fra den ene bufferen, skriv til den andre - aldri samme.
      if (a === bufA) {
        if (bufB.length < l.ut) bufB = new Float32Array(l.ut);
        y = bufB;
      } else {
        if (bufA.length < l.ut) bufA = new Float32Array(l.ut);
        y = bufA;
      }
    }

    for (let r = 0; r < l.ut; r++) {
      let sum = l.bias[r]!;
      const rad = r * l.inn;
      for (let k = 0; k < m; k++) {
        const c = ikkeNull[k]!;
        sum += l.vekter[rad + c]! * a[c]!;
      }
      y[r] = i < sisteLag && sum < 0 ? 0 : sum;
    }
    a = y;
  }
  /**
   * MELLOMBUFFEREN SKAL ALDRI SLIPPE UT. Et nett med ett lag treffer `i ===
   * sisteLag` med én gang og allokerer, så dette er bare en påminnelse om
   * hvorfor `y` er fersk der: `a` her er alltid den ferske arrayen.
   */
  return a;
}

function base64TilBytes(b64: string): Uint8Array {
  const rå = atob(b64);
  const ut = new Uint8Array(rå.length);
  for (let i = 0; i < rå.length; i++) ut[i] = rå.charCodeAt(i);
  return ut;
}

/**
 * Leser appens binærformat: antall nett, så per nett antall lag, så per lag
 * inn/ut/vekter/bias (Int32/Float32 little-endian). Formatet rommer et
 * vilkårlig antall nett – appen skriver tre (bud/bytt/spill), E1 skriver ett.
 */
export function nettFraBytes(bytes: Uint8Array): NevroNett[] {
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
  const nett: NevroNett[] = [];
  for (let n = 0; n < antallNett; n++) {
    const antallLag = lesInt();
    const lag: NevroLag[] = [];
    for (let l = 0; l < antallLag; l++) {
      const inn = lesInt();
      const ut = lesInt();
      lag.push({ inn, ut, vekter: lesFloats(inn * ut), bias: lesFloats(ut) });
    }
    nett.push({ lag });
  }
  // Et avvik her betyr at formatet er forskjøvet – da er vektene søppel, og
  // et nett som spiller søppel er verre enn et som nekter å starte.
  if (p !== bytes.length) throw new Error(`Vektfil: leste ${p} av ${bytes.length} byte`);
  return nett;
}

export function hjerneFraBase64(b64: string): NevroHjerne {
  const nett = nettFraBytes(base64TilBytes(b64));
  if (nett.length !== 3) throw new Error(`NevroHjerne: forventet 3 nett, fikk ${nett.length}`);
  return { bud: nett[0]!, bytt: nett[1]!, spill: nett[2]! };
}

let delt: NevroHjerne | null = null;
/** Den innebygde hjernen (dekodes én gang, ~400 kB vekter). */
export function nevroHjerne(): NevroHjerne {
  delt ??= hjerneFraBase64(NEVRO_VEKTER_B64);
  return delt;
}
