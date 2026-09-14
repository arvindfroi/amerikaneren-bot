/**
 * FORVENTNINGSRETTHET, MANGFOLD OG VARIANS — uten en eneste utspilling.
 *
 *   node examples/pulje-forventning.ts --stillinger 12 --rep 120 --refpulje 16384
 *
 * ============ HVA SOM MÅ AVGJØRES, OG HVORFOR DET IKKE ER ET JA/NEI ========
 *
 * Oppdraget ber om at «felles pulje endrer utvalget, ikke fordelingen». Kodelesningen
 * sier at det IKKE kan stemme, og det er verdt å si før tallene kommer:
 *
 *   Dagens utvalg er SIR med M = `kandidater` (32). Med felles pulje er hver verden
 *   SIR med M = `verdener · kandidater` (1536). SIR er bare asymptotisk riktig, så
 *   den endelige-M-skjevheten mot FORSLAGSfordelingen krymper når M vokser.
 *   Fordelingen står altså ikke stille — den flytter seg mot målfordelingen p ∝ q·w.
 *
 * Det er ikke en feil i knotten; det er prisen for å gi risten en felles akse i det
 * hele tatt (aksen finnes bare fordi kandidatene nå konkurrerer på tvers av slottene).
 * `strata.md` §4c så dette og la veien til side av den grunn.
 *
 * Denne fila avgjør derfor ikke «flyttet den seg», men **HVILKEN VEI**:
 *
 *   1. REFERANSEN. Målfordelingen p ∝ q·w estimeres direkte, uten resampling, som den
 *      VEKTEDE marginalen over en stor pulje (`--refpulje`, standard 16384 kandidater):
 *          p̂[kort][sete] = Σ_i w_i · 1{kortet hos setet i verden i} / Σ_i w_i
 *      Det er samme estimator begge armene prøver å treffe, bare uten den endelige-M-
 *      skjevheten. Den er felles for begge armene, så MC-støyen i den treffer dem likt.
 *   2. `iid` mot p̂ og `felles` mot p̂. Er |skjevhet(felles)| < |skjevhet(iid)|, har
 *      fordelingen flyttet seg MOT målet — da er SIR-skjevhet fjernet, ikke innført.
 *      Er den større, er knotten ødelagt, og det skal sies rett ut.
 *   3. `blokk` mot `iid`, som skal være BIT-IDENTISK. Den beviser at den felles
 *      kodestien er en tro omskriving, så alt som skiller i (2) kommer fra utvelgelsen
 *      og ikke fra en utilsiktet endring på veien.
 *
 * ============ MANGFOLDET — DEN VIKTIGSTE KOLONNEN =========================
 *
 * `troledd.md` §4 målte vekten som skarp: ESS/K 0,179, maks p 0,547, log-spenn 19,13.
 * I dag beskytter de 48 UAVHENGIGE puljene mangfoldet — hver pulje har sin egen vinner,
 * så de 48 verdenene er 48 forskjellige «beste i sin pulje». Med én felles pulje får en
 * kandidat som holder mer enn 1/48 = 2,08 % av totalvekten FLERE slott.
 *
 * Et støygulv som faller fordi de 48 verdenene har kollapset til en håndfull distinkte
 * er ikke seieren oppdraget er ute etter — det er bare et mer deterministisk søk over
 * et smalere ensemble. Antall DISTINKTE verdener og STØRSTE MULTIPLISITET står derfor
 * i tabellen, ikke i en fotnote.
 *
 * ============ PARRINGEN, OG HVORFOR DEN ER EKSAKT =========================
 *
 * Modusene kjøres på SAMME stilling med SAMME frø i hver repetisjon. Grenen er
 * RNG-nøytral (`kandidater` trekk + ett `rng()` per slott i alle tre modusene), så
 * kandidatpuljene er BIT-IDENTISKE mellom modusene — bare utvelgelsen skiller. Riggen
 * sjekker det selv, med en teller rundt `rng`, og sier fra hvis det brytes.
 *
 * INGEN UTSPILLINGER. Verdenene trekkes, de spilles ikke ut, så R = 120 repetisjoner
 * per stilling er overkommelig der den samme presisjonen gjennom søket ville tatt timer.
 */

import { readFileSync } from "node:fs";

import { opprettSpill, utfør, lovligeKort, type GameState } from "../src/motor.ts";
import { lagRng } from "../src/kort.ts";
import { lagIndre, tall } from "../src/moe2/agentspek.ts";
import { trekkVerdener } from "../src/moe2/sdkort.ts";
import { visningsfrø } from "../src/moe2/sikkerorakel.ts";
import { MlbSøketro } from "../src/moe2/soketro.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import { trekkVerden, type Verden } from "../src/solver/sampler.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const STILLINGER = tall(arg("--stillinger", "12"), 12, "stillinger");
const REP = tall(arg("--rep", "120"), 120, "rep");
const BLOKKREP = tall(arg("--blokkrep", "20"), 20, "blokkrep");
const VERDENER = tall(arg("--verdener", "48"), 48, "verdener");
const KANDIDATER = tall(arg("--kandidater", "32"), 32, "kandidater");
const REFPULJE = tall(arg("--refpulje", "16384"), 16_384, "refpulje");
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

/** M[kort][sete] for ett ensemble: andelen verdener der kortet lå hos setet. */
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

/** Kanonisk tekst for én verden, til å telle DISTINKTE verdener med. */
function verdensnøkkel(hender: number[][]): string {
  return hender.map((h) => h.slice().sort((a, b) => a - b).join(",")).join("|");
}

/** Antall distinkte verdener og største multiplisitet i ett ensemble. */
function mangfold(verdener: number[][][]): { distinkte: number; maksMult: number } {
  const m = new Map<string, number>();
  for (const h of verdener) {
    const k = verdensnøkkel(h);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return { distinkte: m.size, maksMult: m.size === 0 ? 0 : Math.max(...m.values()) };
}

/**
 * REFERANSEN: målfordelingen p ∝ q·w, estimert UTEN resampling som den vektede
 * marginalen over en stor pulje. Ingen SIR-skjevhet — det er den begge armene
 * forsøker å treffe.
 */
function referanse(
  s: GameState,
  sete: number,
  trovekt: ((v: Verden) => number) | undefined,
  n: number,
  rng: () => number,
  seter: number,
): { p: Float64Array; ess: number } {
  const m = new Float64Array(52 * seter);
  const logs: number[] = [];
  const hender: number[][][] = [];
  for (let i = 0; i < n; i++) {
    const v = trekkVerden(s, sete, rng);
    if (v === null) continue;
    logs.push(trovekt === undefined ? 0 : trovekt(v));
    hender.push(v.hender);
  }
  if (logs.length === 0) return { p: m, ess: 0 };
  const maks = Math.max(...logs);
  const w = logs.map((x) => Math.exp(x - maks));
  const sum = w.reduce((a, b) => a + b, 0);
  const sum2 = w.reduce((a, b) => a + b * b, 0);
  for (let i = 0; i < hender.length; i++) {
    const andel = w[i]! / sum;
    for (let p = 0; p < seter && p < hender[i]!.length; p++) {
      for (const c of hender[i]![p]!) m[c * seter + p] = m[c * seter + p]! + andel;
    }
  }
  // Kish' effektive utvalg — sier hvor mye referansen egentlig er verdt.
  return { p: m, ess: (sum * sum) / sum2 };
}

interface Post {
  /** |snitt_arm − p̂| per celle. */
  skjevI: number[];
  skjevF: number[];
  /** SD over repetisjoner, per celle. */
  sdI: number[];
  sdF: number[];
  p: number[];
}
const alle: Post = { skjevI: [], skjevF: [], sdI: [], sdF: [], p: [] };

let stillinger = 0;
let rngAvvik = 0;
let nAvvik = 0;
let blokkAvvik = 0;
let blokkSjekket = 0;
const mangfoldI: number[] = [];
const mangfoldF: number[] = [];
const maksMultF: number[] = [];
let essSum = 0;
let essN = 0;

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

    // ---- 1. REFERANSEN, én gang per stilling -----------------------------
    const ref = referanse(
      s, sete, trovekt, REFPULJE, lagRng((visningsfrø(s, sete, SIK_FRØ) ^ 0x9e37_79b9) >>> 0), seter,
    );
    essSum += ref.ess;
    essN++;

    const iRep: number[][] = [];
    const fRep: number[][] = [];

    for (let r = 0; r < REP; r++) {
      // SAMME FRØ i alle modusene: puljene blir bit-identiske, bare utvelgelsen skiller.
      const frø = (visningsfrø(s, sete, SIK_FRØ) + r * 2_654_435_761) >>> 0;
      const tI = tellende(lagRng(frø));
      const tF = tellende(lagRng(frø));
      const vI = trekkVerdener(s, sete, VERDENER, tI.f, undefined, trovekt, KANDIDATER, undefined, false);
      const vF = trekkVerdener(
        s, sete, VERDENER, tF.f, undefined, trovekt, KANDIDATER, undefined, false, "felles",
      );
      if (tI.n() !== tF.n()) rngAvvik++;
      if (vI.length !== vF.length) nAvvik++;

      // ---- «blokk» skal være BIT-IDENTISK med i.i.d. ---------------------
      if (r < BLOKKREP) {
        const vB = trekkVerdener(
          s, sete, VERDENER, lagRng(frø), undefined, trovekt, KANDIDATER, undefined, false, "blokk",
        );
        blokkSjekket++;
        const a = vI.map(verdensnøkkel).join(";");
        const b = vB.map(verdensnøkkel).join(";");
        if (a !== b) blokkAvvik++;
      }

      const mfI = mangfold(vI);
      const mfF = mangfold(vF);
      mangfoldI.push(mfI.distinkte);
      mangfoldF.push(mfF.distinkte);
      maksMultF.push(mfF.maksMult);

      iRep.push(Array.from(marginal(vI, seter)));
      fRep.push(Array.from(marginal(vF, seter)));
    }
    if (iRep.length < 2) {
      s = utfør(s, drivere[iTur]!.velgHandling(s)).state;
      continue;
    }

    const snitt = (x: number[]): number => x.reduce((a, b) => a + b, 0) / x.length;
    const sd = (x: number[], m: number): number =>
      Math.sqrt(x.reduce((p, q) => p + (q - m) ** 2, 0) / (x.length - 1));
    for (let c = 0; c < 52 * seter; c++) {
      const a = iRep.map((m) => m[c]!);
      const b = fRep.map((m) => m[c]!);
      const mA = snitt(a);
      const mB = snitt(b);
      const pRef = ref.p[c]!;
      // Celler som er konstant 0 overalt (kortet ligger synlig et annet sted) bærer ingenting.
      if (mA === 0 && mB === 0 && pRef === 0) continue;
      alle.skjevI.push(mA - pRef);
      alle.skjevF.push(mB - pRef);
      alle.sdI.push(sd(a, mA));
      alle.sdF.push(sd(b, mB));
      alle.p.push(pRef);
    }
    stillinger++;
    console.log(
      `  ${stillinger}/${STILLINGER} stillinger, ${alle.p.length} celler, ` +
        `ref-ESS ${ref.ess.toFixed(0)}/${REFPULJE}, ${((performance.now() - tStart) / 1000).toFixed(0)} s`,
    );
  }
  s = utfør(s, drivere[iTur]!.velgHandling(s)).state;
}

// ===========================================================================
// DOMMEN
// ===========================================================================

const snitt = (x: number[]): number => (x.length === 0 ? 0 : x.reduce((a, b) => a + b, 0) / x.length);
const rms = (x: number[]): number => (x.length === 0 ? 0 : Math.sqrt(snitt(x.map((v) => v * v))));

console.log(
  `\n=== FELLES PULJE: ${stillinger} stillinger, R=${REP}, K=${VERDENER}, k=${KANDIDATER} ===\n`,
);

console.log("0. STRUKTUR — grunnlaget for at parringen er eksakt");
console.log(`   repetisjoner der modusene brukte ULIKT antall rng()-kall: ${rngAvvik} (skal være 0)`);
console.log(`   repetisjoner der modusene ga ULIKT antall verdener:      ${nAvvik} (skal være 0)`);
console.log(
  `   «blokk» ULIK i.i.d. (skal være 0 — beviser at den felles stien er en tro omskriving): ` +
    `${blokkAvvik} av ${blokkSjekket}\n`,
);

console.log("1. MANGFOLDET — kollapser ensemblet?");
console.log(
  `   distinkte verdener av ${VERDENER}:   i.i.d. ${snitt(mangfoldI).toFixed(1)}   ` +
    `felles ${snitt(mangfoldF).toFixed(1)}`,
);
console.log(`   største multiplisitet (felles): ${snitt(maksMultF).toFixed(1)} i snitt`);
console.log(
  `   Faller «distinkte» mye, vurderes kortene i færre ULIKE verdener, og et lavere\n` +
    `   støygulv er delvis bare et smalere ensemble. Dette tallet hører sammen med gulvet.\n`,
);

const informativ = alle.p.map((p) => p > 0.02 && p < 0.98);
const visSett = (navn: string, maske: boolean[]): void => {
  const idx = alle.p.map((_, i) => i).filter((i) => maske[i]);
  if (idx.length === 0) {
    console.log(`${navn}: ingen celler`);
    return;
  }
  const sI = idx.map((i) => alle.skjevI[i]!);
  const sF = idx.map((i) => alle.skjevF[i]!);
  console.log(`${navn}  (${idx.length} celler)`);
  console.log(
    `   MOT MÅLET p   RMS skjevhet  i.i.d. ${rms(sI).toFixed(5)}   felles ${rms(sF).toFixed(5)}   ` +
      `(lavere = nærmere p)`,
  );
  console.log(
    `                 snitt |skjev| i.i.d. ${snitt(sI.map(Math.abs)).toFixed(5)}   ` +
      `felles ${snitt(sF.map(Math.abs)).toFixed(5)}`,
  );
  console.log(
    `   SPREDNING     SD over rep  i.i.d. ${snitt(idx.map((i) => alle.sdI[i]!)).toFixed(5)}   ` +
      `felles ${snitt(idx.map((i) => alle.sdF[i]!)).toFixed(5)}`,
  );
};

console.log("2. HVILKEN VEI FLYTTET FORDELINGEN SEG?");
console.log(`   Referanse p̂: vektet marginal over ${REFPULJE} kandidater, snitt ESS ` +
  `${(essN === 0 ? 0 : essSum / essN).toFixed(0)}.\n`);
visSett("   ALLE CELLER      ", alle.p.map(() => true));
console.log("");
visSett("   INFORMATIVE      ", informativ);

console.log(
  `\n   TOLKNING. Er RMS(felles) < RMS(i.i.d.), har fordelingen flyttet seg MOT målet:\n` +
    `   SIR-skjevhet er FJERNET (M gikk fra ${KANDIDATER} til ${VERDENER * KANDIDATER}), ikke innført.\n` +
    `   Det er ikke det samme som «fordelingen står stille» — den gjør den ikke, og den KAN\n` +
    `   ikke gjøre det når risten skal ha en felles akse. Referansen har selv MC-støy, og\n` +
    `   den treffer begge armene likt, så SAMMENLIKNINGEN er skarpere enn hvert enkelt tall.`,
);
