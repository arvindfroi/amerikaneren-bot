/**
 * FORVENTNINGSRETTHET OG VARIANSREDUKSJON — uten en eneste utspilling.
 *
 *   node examples/strata-forventning.ts --stillinger 40 --rep 400
 *
 * ============ HVA SOM MÅ BEVISES, OG HVORFOR AKKURAT DETTE ================
 *
 * Kravet er todelt, og de to delene trekker i hver sin retning:
 *
 *   (a) FORDELINGEN SKAL STÅ STILLE. «Stratifisering endrer utvalget, ikke
 *       fordelingen.» Gjør den ikke det, er armen to endringer i én — den måler
 *       «andre verdener» i tillegg til «bedre fordelte verdener», og da kan et
 *       utslag ikke tilskrives noen av dem. (Det er fella `bandit.md` §3 gikk i:
 *       `~fordel=halv` løsnet σ-porten som bivirkning.)
 *   (b) UTVALGET SKAL BLI JEVNERE. Ellers er knotten en dyr null.
 *
 * MÅLESTØRRELSEN ER TROENS EGEN MARGINAL. En verden er en fordeling av kortene på
 * setene, så det troen «sier» om stillingen er nøyaktig matrisen
 *
 *     M[kort][sete] = P(kortet ligger hos setet)
 *
 * Er den lik under i.i.d. og strata, er troen fortsatt riktig representert — ikke
 * bare i ett sammendragstall, men i hver enkelt celle. Det er en langt hardere
 * prøve enn å sammenlikne ett skalarsnitt, og den koster ingen utspillinger:
 * verdenene TREKKES, de spilles ikke ut. Derfor er R = 400 repetisjoner per
 * stilling overkommelig, mens den samme presisjonen gjennom søket ville tatt timer.
 *
 * ============ PARRINGEN, OG HVORFOR DEN ER EKSAKT HER =====================
 *
 * De to modusene kjøres på SAMME stilling med SAMME frø i hver repetisjon. Grenen
 * er RNG-nøytral (ett `rng()`-kall til utvelgelsen i begge), så kandidatpoolene er
 * BIT-IDENTISKE mellom modusene — bare hvilken kandidat som plukkes ut av poolen
 * skiller. Differansen er dermed ikke to utvalg trukket fra hverandre, den er den
 * samme trekningen behandlet på to måter. Riggen sjekker RNG-nøytraliteten selv,
 * med en teller rundt `rng`, og sier fra hvis den brytes.
 *
 * ============ DE TO TALLENE =============================================
 *
 * For hver celle i M, over R repetisjoner:
 *
 *   SKJEVHET     |snitt_strata − snitt_iid|, mot MC-usikkerheten i differansen.
 *                Parret per repetisjon, så MC-støyen i den felles poolen kanselleres.
 *   VARIANS      SD over repetisjoner av celleanslaget, strata mot i.i.d.
 *                Forholdet er variansreduksjonen, og det er tallet knotten lever av.
 *
 * En celle med P nær 0 eller 1 har nesten ingen varians å redusere, så snittet
 * rapporteres både over ALLE celler og over de INFORMATIVE (0,02 < P < 0,98).
 */

import { readFileSync } from "node:fs";

import { opprettSpill, utfør, lovligeKort, type GameState } from "../src/motor.ts";
import { lagRng } from "../src/kort.ts";
import { lagIndre, tall } from "../src/moe2/agentspek.ts";
import { trekkVerdener } from "../src/moe2/sdkort.ts";
import { visningsfrø } from "../src/moe2/sikkerorakel.ts";
import { MlbSøketro } from "../src/moe2/soketro.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const STILLINGER = tall(arg("--stillinger", "40"), 40, "stillinger");
const REP = tall(arg("--rep", "400"), 400, "rep");
const VERDENER = tall(arg("--verdener", "48"), 48, "verdener");
const KANDIDATER = tall(arg("--kandidater", "32"), 32, "kandidater");
const FRO = tall(arg("--fro", "14000901"), 14_000_901, "fro");

const HELBOT =
  "okt:vr:e1-modell/vrak-8.bin@e1-modell/etterlyst-8.bin:telrd:eks:3Lt2000:profil:" +
  "sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-8.bin:budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin";
const SIK_FRØ = 20_260_804;

const tronett = MlbTronett.fraBytes(readFileSync("e1-modell/tro-8.bin"));
const tro = new MlbSøketro(tronett);
const drivere = [0, 1, 2, 3].map(() => lagIndre(HELBOT));
for (const a of drivere) a.nyKamp();
tro.nyKamp();

const alleSer = (s: GameState): void => {
  for (const a of drivere) (a as { observer?(x: GameState): void }).observer?.(s);
  tro.observer(s);
};

/** Teller `rng`-kall, så RNG-nøytraliteten kan PÅVISES og ikke bare påstås. */
function tellende(rng: () => number): { f: () => number; n: () => number } {
  let k = 0;
  return {
    f: (): number => {
      k++;
      return rng();
    },
    n: (): number => k,
  };
}

/** M[kort][sete] for ett ensemble av verdener: andelen verdener der kortet lå hos setet. */
function marginal(verdener: number[][][], seter: number): Float64Array {
  const m = new Float64Array(52 * seter);
  if (verdener.length === 0) return m;
  for (const hender of verdener) {
    for (let p = 0; p < seter && p < hender.length; p++) {
      for (const c of hender[p]!) m[c * seter + p] = m[c * seter + p]! + 1;
    }
  }
  for (let i = 0; i < m.length; i++) m[i] = m[i]! / verdener.length;
  return m;
}

interface Celle {
  /** Snitt over repetisjoner av celleanslaget, per modus. */
  snittI: number;
  snittS: number;
  /** Sum og sumkvadrat av den PARREDE differansen, til SE-en på skjevheten. */
  dSum: number;
  dKvad: number;
  /** Sumkvadrat rundt eget snitt, til variansen per modus. */
  varI: number;
  varS: number;
}

let stillinger = 0;
let rngAvvik = 0;
let nAvvik = 0;
// Aggregert over alle stillinger og celler.
const alle: { skjev: number[]; seD: number[]; sdI: number[]; sdS: number[]; p: number[] } = {
  skjev: [],
  seD: [],
  sdI: [],
  sdS: [],
  p: [],
};

let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, FRO);
let vakt = 0;
const tStart = performance.now();

while (s.fase !== "FERDIG" && vakt++ < 40_000 && stillinger < STILLINGER) {
  if (s.fase === "RUNDE_SLUTT") {
    alleSer(s);
    s = utfør(s, { type: "NESTE" }).state;
    continue;
  }
  alleSer(s);
  const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
  if (iTur === null || iTur === undefined) break;

  if (s.fase === "SPILL" && s.iTur !== null && lovligeKort(s, s.iTur).length >= 2) {
    const sete = s.iTur;
    const seter = s.antallSpillere;
    const trovekt = tro.vektFor(s, sete) ?? undefined;
    const celler = new Map<number, Celle>();
    const iRep: Map<number, number[]> = new Map();
    const sRep: Map<number, number[]> = new Map();

    for (let r = 0; r < REP; r++) {
      // SAMME FRØ i begge modusene: poolene blir bit-identiske, bare utvelgelsen skiller.
      const frø = (visningsfrø(s, sete, SIK_FRØ) + r * 2_654_435_761) >>> 0;
      const tI = tellende(lagRng(frø));
      const tS = tellende(lagRng(frø));
      const vI = trekkVerdener(s, sete, VERDENER, tI.f, undefined, trovekt, KANDIDATER, undefined, false);
      const vS = trekkVerdener(
        s, sete, VERDENER, tS.f, undefined, trovekt, KANDIDATER, undefined, false, "strata",
      );
      if (tI.n() !== tS.n()) rngAvvik++;
      if (vI.length !== vS.length) nAvvik++;
      const mI = marginal(vI, seter);
      const mS = marginal(vS, seter);
      for (let i = 0; i < mI.length; i++) {
        const a = mI[i]!;
        const b = mS[i]!;
        // Bare celler som overhodet kan variere er interessante; en celle som er
        // konstant 0 i alle repetisjoner (kortet er synlig et annet sted) bærer ingenting.
        if (a === 0 && b === 0) continue;
        if (!celler.has(i)) celler.set(i, { snittI: 0, snittS: 0, dSum: 0, dKvad: 0, varI: 0, varS: 0 });
        let li = iRep.get(i);
        if (li === undefined) {
          li = [];
          iRep.set(i, li);
        }
        let ls = sRep.get(i);
        if (ls === undefined) {
          ls = [];
          sRep.set(i, ls);
        }
        li.push(a);
        ls.push(b);
      }
    }

    for (const [i] of celler) {
      const a = iRep.get(i)!;
      const b = sRep.get(i)!;
      if (a.length < 2) continue;
      const snitt = (x: number[]): number => x.reduce((p, q) => p + q, 0) / x.length;
      const mA = snitt(a);
      const mB = snitt(b);
      const sd = (x: number[], m: number): number =>
        Math.sqrt(x.reduce((p, q) => p + (q - m) ** 2, 0) / (x.length - 1));
      // Parret differanse per repetisjon — den felles poolens MC-støy kanselleres.
      const d = a.map((x, k) => b[k]! - x);
      const mD = snitt(d);
      const seD = sd(d, mD) / Math.sqrt(d.length);
      alle.skjev.push(mD);
      alle.seD.push(seD);
      alle.sdI.push(sd(a, mA));
      alle.sdS.push(sd(b, mB));
      alle.p.push((mA + mB) / 2);
    }
    stillinger++;
    if (stillinger % 10 === 0) {
      console.log(
        `  ${stillinger}/${STILLINGER} stillinger, ${alle.skjev.length} celler, ` +
          `${((performance.now() - tStart) / 1000).toFixed(0)} s`,
      );
    }
  }
  s = utfør(s, drivere[iTur]!.velgHandling(s)).state;
}

// ===========================================================================
// DOMMEN
// ===========================================================================

const snitt = (x: number[]): number => (x.length === 0 ? 0 : x.reduce((a, b) => a + b, 0) / x.length);
const informativ = alle.p.map((p) => p > 0.02 && p < 0.98);

console.log(`\n=== FORVENTNINGSRETTHET OG VARIANS: ${stillinger} stillinger, R=${REP}, K=${VERDENER} ===\n`);

console.log("0. RNG-NØYTRALITET (grunnlaget for at parringen er eksakt)");
console.log(`   repetisjoner der modusene brukte ULIKT antall rng()-kall: ${rngAvvik} (skal være 0)`);
console.log(`   repetisjoner der modusene ga ULIKT antall verdener:      ${nAvvik} (skal være 0)\n`);

const visSett = (navn: string, maske: boolean[]): void => {
  const idx = alle.skjev.map((_, i) => i).filter((i) => maske[i]);
  if (idx.length === 0) {
    console.log(`${navn}: ingen celler`);
    return;
  }
  const skjev = idx.map((i) => alle.skjev[i]!);
  const seD = idx.map((i) => alle.seD[i]!);
  const sdI = idx.map((i) => alle.sdI[i]!);
  const sdS = idx.map((i) => alle.sdS[i]!);
  // |z| per celle: hvor mange MC-SE-er skjevheten er unna null.
  const z = idx.map((i) => (alle.seD[i]! > 0 ? Math.abs(alle.skjev[i]!) / alle.seD[i]! : 0));
  const over2 = z.filter((x) => x > 2).length;
  const over3 = z.filter((x) => x > 3).length;
  const varRed = idx
    .map((i) => (alle.sdI[i]! > 0 ? (alle.sdS[i]! / alle.sdI[i]!) ** 2 : 1))
    .filter((x) => Number.isFinite(x));
  console.log(`${navn}  (${idx.length} celler)`);
  console.log(
    `   SKJEVHET  snitt ${snitt(skjev).toFixed(6)}   snitt |skjev| ${snitt(skjev.map(Math.abs)).toFixed(6)}   ` +
      `snitt MC-SE ${snitt(seD).toFixed(6)}`,
  );
  console.log(
    `             celler med |z| > 2: ${over2} (${((100 * over2) / idx.length).toFixed(1)} %, ventet ~4,6 %)   ` +
      `|z| > 3: ${over3} (${((100 * over3) / idx.length).toFixed(1)} %, ventet ~0,3 %)`,
  );
  console.log(
    `   VARIANS   SD i.i.d. ${snitt(sdI).toFixed(5)}   SD strata ${snitt(sdS).toFixed(5)}   ` +
      `variansforhold ${snitt(varRed).toFixed(4)}  (< 1 = strata er strammere)`,
  );
};

console.log("1. TROEN SKAL VÆRE UENDRET, UTVALGET STRAMMERE");
console.log("   M[kort][sete] = P(kortet ligger hos setet), parret per repetisjon.\n");
visSett("   ALLE CELLER      ", alle.p.map(() => true));
console.log("");
visSett("   INFORMATIVE      ", informativ);

console.log(
  `\n   Tolkning: SKJEVHET skal ligge på MC-SE-nivå og andelen |z| > 2 skal ligge rundt 4,6 %,\n` +
    `   som er hva rene tilfeldigheter gir. Er den mye høyere, er fordelingen FLYTTET og armen\n` +
    `   måler to ting. VARIANSFORHOLDET er variansreduksjonen: det er den knotten lever av.\n` +
    `   Kostnaden er null utspillinger og null ekstra trekninger — nøyaktig samme budsjett.`,
);
