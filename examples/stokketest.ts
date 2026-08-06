/**
 * ER KORTENE STOKKET SLIK DE VILLE VÆRT I VIRKELIGHETEN?
 *
 * ARVIND: «kan du sjekka at kortene blir stokket på en realistisk måte …
 * det har vært mistanke om at det ikke er slik.»
 *
 * En mistanke om utdelingen er en integritetssak, og den skal måles og ikke
 * bedømmes. Testene her er de fire en ekte kortstokk må bestå, og de er valgt
 * fordi de fanger ULIKE feil:
 *
 *   1. KORT -> SETE      hvert kort like ofte til hvert sete og til talongen.
 *                        Fanger skjevhet i selve stokkingen.
 *   2. KORT -> PLASS     hvert kort like ofte på hver av de 52 plassene.
 *                        Fanger en Fisher-Yates med feil grense, som gir en
 *                        karakteristisk skjevhet i ENDENE av stokken.
 *   3. FARGEFORDELING    lengdene i en hånd mot den hypergeometriske fasiten.
 *                        Fanger «for jevne» hender - den vanligste grunnen til
 *                        at en stokk FØLES gal uten å være det.
 *   4. RUNDE-KORRELASJON overlapp mellom samme setes hånd i runde N og N+1.
 *                        Fanger at rundefrøene deler tallstrøm. Skal være
 *                        hypergeometrisk med snitt 12x12/52 = 2,77.
 *
 * SPILLET DELES SOM APPEN GJØR DET: ett tilfeldig frø per KAMP, og hver runde
 * avledet av `frø + (rundeNr+1)*2654435761`. Å teste `stokk()` direkte ville
 * bommet på nettopp det leddet - og det er der en slik feil pleier å sitte.
 */

import { kortId, type Kort } from "../src/kort.ts";
import { lovligeHandlinger, opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeEtterlys } from "../src/motor.ts";
import { tall } from "../src/moe2/agentspek.ts";

const arg = (n: string, s: string) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const KAMPER = tall(arg("--kamper", "4000"), 4000, "kamper");
const RUNDER = tall(arg("--runder", "8"), 8, "runder");

/** khi-kvadrat -> omtrentlig p-verdi via Wilson-Hilferty. */
function pVerdi(khi: number, df: number): number {
  const x = Math.pow(khi / df, 1 / 3);
  const m = 1 - 2 / (9 * df);
  const s = Math.sqrt(2 / (9 * df));
  const z = (x - m) / s;
  return 0.5 * erfc(z / Math.SQRT2);
}
function erfc(x: number): number {
  const t = 1 / (1 + 0.5 * Math.abs(x));
  const y =
    t *
    Math.exp(
      -x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
        t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
        t * (-0.82215223 + t * 0.17087277))))))))
    );
  return x >= 0 ? y : 2 - y;
}

const kortSete = Array.from({ length: 52 }, () => new Array(5).fill(0)); // 4 seter + talong
const kortPlass = Array.from({ length: 52 }, () => new Array(52).fill(0));
const fargeLengde = new Array(13).fill(0);
const overlapp = new Array(13).fill(0);
let givTotalt = 0;
let overlappN = 0;

const idx = (k: Kort) => kortId(k);
const nr = new Map<string, number>();
{
  let i = 0;
  for (const f of ["S", "H", "R", "K"]) for (let v = 2; v <= 14; v++) nr.set(`${f}${v}`, i++);
}
const kNr = (k: Kort) => nr.get(`${k.farge}${k.verdi}`)!;

for (let g = 0; g < KAMPER; g++) {
  // Samme frøkilde som `web/app.ts` bruker ved «nytt spill».
  const frø = (Date.now() ^ (Math.random() * 1e9) ^ (g * 2246822519)) >>> 0;
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let forrige: Set<string>[] = [];

  for (let r = 0; r < RUNDER; r++) {
    givTotalt++;
    const hender = s.hender.map((h) => h.slice());
    const talong = s.talong.slice();

    // 1 + 2: hvor havnet hvert kort?
    let plass = 0;
    for (let sete = 0; sete < 4; sete++) {
      for (const k of hender[sete]!) {
        kortSete[kNr(k)]![sete]!++;
        kortPlass[kNr(k)]![plass++]!++;
      }
    }
    for (const k of talong) {
      kortSete[kNr(k)]![4]!++;
      kortPlass[kNr(k)]![plass++]!++;
    }

    // 3: fargefordeling i hver hånd
    for (let sete = 0; sete < 4; sete++) {
      const tel: Record<string, number> = { S: 0, H: 0, R: 0, K: 0 };
      for (const k of hender[sete]!) tel[k.farge]!++;
      for (const f of ["S", "H", "R", "K"]) fargeLengde[tel[f]!]!++;
    }

    // 4: overlapp mot forrige runde, samme sete
    if (forrige.length === 4) {
      for (let sete = 0; sete < 4; sete++) {
        let n = 0;
        for (const k of hender[sete]!) if (forrige[sete]!.has(idx(k))) n++;
        overlapp[n]!++;
        overlappN++;
      }
    }
    forrige = hender.map((h) => new Set(h.map(idx)));

    // Neste runde: spol fram til RUNDE_SLUTT og trykk NESTE, som appen.
    let vakt = 0;
    while (s.fase !== "RUNDE_SLUTT" && s.fase !== "FERDIG" && vakt++ < 400) {
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      const lov = lovligeHandlinger(s);
      if (lov.fase === "BUDRUNDE") {
        // FOERSTE SETE BYR, resten passer. Passet ALLE, kom ingen kontrakt i
        // stand, runden gikk aldri til RUNDE_SLUTT og loekka broet ut etter
        // foerste giv - da ble test 4 (runde-korrelasjon) NaN, som er nettopp
        // den testen mistanken handler om.
        const tallbud = lov.bud.filter((b): b is number => typeof b === "number");
        const byr = lov.spiller === 1 && tallbud.length > 0;
        s = utfør(s, { type: "BUD", spiller: lov.spiller, bud: byr ? tallbud[0]! : "PASS" }).state;
      }
      else if (lov.fase === "VRAK") s = utfør(s, { type: "VRAK", spiller: lov.spiller, kort: lov.hånd.slice(0, lov.antall) }).state;
      else if (lov.fase === "VELG") {
        const trumf = lov.trumf[0]!;
        const kand = lovligeEtterlys(s, trumf);
        s = utfør(s, {
          type: "VELG", spiller: lov.spiller, trumf,
          etterlyst: lov.måEtterlyse ? (kand[0] ?? null) : null,
        }).state;
      }
      else if (lov.fase === "SPILL") s = utfør(s, { type: "SPILL", spiller: lov.spiller, kort: lov.kort[0]! }).state;
      else break;
    }
    if (s.fase !== "RUNDE_SLUTT") break;
    s = utfør(s, { type: "NESTE" }).state;
    if (s.fase === "FERDIG") break;
  }
}

console.log(`# STOKKETEST — ${givTotalt.toLocaleString()} giver fra ${KAMPER} kamper\n`);

// --- 1. kort -> sete -------------------------------------------------------
{
  let khi = 0;
  const vent = [12, 12, 12, 12, 4].map((n) => (givTotalt * n) / 52);
  for (let k = 0; k < 52; k++)
    for (let s = 0; s < 5; s++) {
      const d = kortSete[k]![s]! - vent[s]!;
      khi += (d * d) / vent[s]!;
    }
  const df = 51 * 4;
  console.log(`1. KORT -> SETE      khi2 = ${khi.toFixed(1)} (df ${df})   p = ${pVerdi(khi, df).toFixed(3)}`);
}

// --- 2. kort -> plass ------------------------------------------------------
{
  let khi = 0;
  const vent = givTotalt / 52;
  for (let k = 0; k < 52; k++)
    for (let p = 0; p < 52; p++) {
      const d = kortPlass[k]![p]! - vent;
      khi += (d * d) / vent;
    }
  const df = 51 * 51;
  console.log(`2. KORT -> PLASS     khi2 = ${khi.toFixed(1)} (df ${df})   p = ${pVerdi(khi, df).toFixed(3)}`);
}

// --- 3. fargelengde mot hypergeometrisk ------------------------------------
{
  const komb = (n: number, k: number): number => {
    if (k < 0 || k > n) return 0;
    let r = 1;
    for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
    return r;
  };
  const total = fargeLengde.reduce((a, b) => a + b, 0);
  let khi = 0;
  let df = 0;
  const rader: string[] = [];
  for (let L = 0; L <= 12; L++) {
    const p = (komb(13, L) * komb(39, 12 - L)) / komb(52, 12);
    const vent = p * total;
    if (vent < 5) continue;
    const d = fargeLengde[L]! - vent;
    khi += (d * d) / vent;
    df++;
    rader.push(`${L}:${(100 * fargeLengde[L]! / total).toFixed(2)}%/${(100 * p).toFixed(2)}%`);
  }
  console.log(`3. FARGELENGDE       khi2 = ${khi.toFixed(1)} (df ${df - 1})   p = ${pVerdi(khi, df - 1).toFixed(3)}`);
  console.log(`   maalt/fasit: ${rader.join("  ")}`);
}

// --- 4. overlapp mellom paafoelgende runder --------------------------------
{
  const komb = (n: number, k: number): number => {
    if (k < 0 || k > n) return 0;
    let r = 1;
    for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
    return r;
  };
  let khi = 0;
  let df = 0;
  let snitt = 0;
  for (let L = 0; L <= 12; L++) snitt += (L * overlapp[L]!) / overlappN;
  for (let L = 0; L <= 12; L++) {
    const p = (komb(12, L) * komb(40, 12 - L)) / komb(52, 12);
    const vent = p * overlappN;
    if (vent < 5) continue;
    const d = overlapp[L]! - vent;
    khi += (d * d) / vent;
    df++;
  }
  console.log(`4. RUNDE-KORRELASJON khi2 = ${khi.toFixed(1)} (df ${df - 1})   p = ${pVerdi(khi, df - 1).toFixed(3)}`);
  console.log(`   overlapp mot forrige runde: ${snitt.toFixed(3)} kort (fasit 2,769)`);
}

console.log(`\nEn p-verdi under 0,01 i noen av dem betyr at stokken IKKE er tilfeldig.`);
