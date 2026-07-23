/**
 * Optimalitetsporten: er NEAT-mesteren (målbart) optimal gitt informasjonen?
 *
 *   node examples/neat-optimal.ts [genomfil] [--hurtig] [--frø n]
 *
 * «Matematisk optimalt» operasjonaliseres så strengt som spillet tillater:
 *
 *  1. KORTSPILL-ANGER MOT EKSAKT LØSER: ved et utvalg spillbeslutninger fra
 *     selvspill samples verdener som er forenlige med spillerens lovlige
 *     informasjon (samme sampler som PIMC-boten). Hver kandidat løses med
 *     dobbelt-dummy-søkeren, og angeren = EV(beste kort) − EV(valgt kort)
 *     i egenpoeng, snittet over verdener. En informasjonsmessig optimal
 *     spiller har anger ≈ 0 på (nesten) hver beslutning.
 *  2. DUPLIKATKAMP MOT PIMC-BOTEN: mesteren mot tre solver-boter med
 *     seterotasjon på samme kortgiving (flakskontrollert). En optimal
 *     spiller taper ikke poeng mot solveren over mange kamper.
 *  3. BUDKALIBRERING: treningens snittanger per kontrakt (status.json).
 *
 * PORTEN BESTÅS (exit 0) bare når alle tre holder:
 *   snittanger kortspill < 0,02 poeng/beslutning OG ≥ 99 % beslutninger
 *   uten målbar anger; poengdiff mot PIMC ≥ 0; budanger < 0,05.
 * Ellers exit 1 (ikke optimal ennå). Exit 2 = feil under kjøring.
 */

import { existsSync, readFileSync } from "node:fs";

import {
  lagRng,
  likeKort,
  lovligeKort,
  opprettSpill,
  utfør,
  velgHandling,
  type GameState,
  type Handling,
  type Kort,
} from "../src/index.ts";
import { evaluerEtterTrekk, kortTilInt } from "../src/solver/dds.ts";
import { byggDDOppsett, trekkVerden, type Verden } from "../src/solver/sampler.ts";
import { genomFraJson, NeatAgent, type Genom } from "../src/neat/index.ts";

// --- Argumenter -------------------------------------------------------------
const posisjonelle: string[] = [];
let hurtig = false;
let frø = 20260723;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--hurtig") hurtig = true;
  else if (process.argv[i] === "--frø") frø = Number(process.argv[++i]);
  else posisjonelle.push(process.argv[i]!);
}
const genomFil = posisjonelle[0] ?? "trening/mester.json";

// Terskler for bestått port (dokumentert i filhodet).
const MAKS_SPILL_ANGER = 0.02; // egenpoeng per beslutning
const MIN_ANDEL_OPTIMAL = 0.99;
const MAKS_BUD_ANGER = 0.05;

// Budsjett: hurtigsjekk (billig screening) vs full port (eksaktere).
const KONF = hurtig
  ? { beslutninger: 40, verdener: 8, terskel: 9, nodeTak: 400_000, kampFrø: 2, pimcVerdener: 12, pimcTerskel: 6 }
  : { beslutninger: 120, verdener: 16, terskel: 13, nodeTak: 2_000_000, kampFrø: 6, pimcVerdener: 24, pimcTerskel: 7 };

if (!existsSync(genomFil)) {
  console.error(`Fant ikke genomfil: ${genomFil}`);
  process.exit(2);
}
const genom: Genom = genomFraJson(readFileSync(genomFil, "utf8"));
console.log(
  `Optimalitetsport (${hurtig ? "hurtig" : "FULL"}): ${genomFil} ` +
    `(${genom.noder.length} noder, ${genom.koblinger.length} koblinger)`,
);

// --- Egenpoeng gitt budlagets sluttstikk (samme modell som PIMC-boten) ------
interface PoengKtx {
  readonly observator: number;
  readonly budvinner: number;
  readonly meldingstype: "tall" | "amerikaner" | "solo";
  readonly bud: number;
  readonly totalStikk: number;
  readonly mål: number;
}

function egenPoeng(lagStikk: number, verden: Verden, k: PoengKtx): number {
  const { observator, budvinner, totalStikk: T, mål } = k;
  const påLag = verden.declLag[observator] === true;
  const lagStørrelse = verden.declLag.filter(Boolean).length;
  const antallForsvar = verden.declLag.length - lagStørrelse;
  if (!påLag) return (T - lagStikk) / Math.max(1, antallForsvar);
  if (k.meldingstype === "tall") {
    const klart = lagStikk >= k.bud;
    const sats = observator === budvinner ? 2 * k.bud : k.bud;
    return klart ? sats : -sats;
  }
  if (k.meldingstype === "amerikaner") {
    const klart = lagStikk === T;
    const sats = observator === budvinner ? mål / 2 : mål / 4;
    return klart ? sats : -sats;
  }
  return lagStikk === T ? mål : -mål;
}

// --- 1) Kortspill-anger mot eksakt løser ------------------------------------
interface AngerResultat {
  readonly antall: number;
  readonly snittAnger: number;
  readonly andelOptimal: number;
  readonly verste: number;
}

function målSpillAnger(): AngerResultat {
  const agenter = [0, 1, 2, 3].map(() => new NeatAgent(genom));
  const rng = lagRng(frø ^ 0x5bd1e995);
  let sumAnger = 0;
  let optimale = 0;
  let verste = 0;
  let antall = 0;

  for (let spillFrø = 0; antall < KONF.beslutninger && spillFrø < 200; spillFrø++) {
    for (const a of agenter) a.nyKamp();
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 555_000 + frø + spillFrø);
    let guard = 0;
    while (s.fase !== "FERDIG" && guard++ < 20000 && antall < KONF.beslutninger) {
      if (s.fase === "RUNDE_SLUTT") {
        if (s.rundeNr + 1 >= 12) break;
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
      const handling = agenter[sete]!.velgHandling(s);

      if (s.fase === "SPILL" && handling.type === "SPILL") {
        const lovlige = lovligeKort(s, sete);
        // Revider et utvalg av reelle valg (minst to alternativer).
        if (lovlige.length >= 2 && rng() < 0.4) {
          const anger = beslutningsAnger(s, sete, lovlige, handling.kort, rng);
          if (anger !== null) {
            sumAnger += anger;
            verste = Math.max(verste, anger);
            if (anger < 1e-9) optimale++;
            antall++;
          }
        }
      }
      s = utfør(s, handling).state;
    }
  }
  return {
    antall,
    snittAnger: antall > 0 ? sumAnger / antall : Infinity,
    andelOptimal: antall > 0 ? optimale / antall : 0,
    verste,
  };
}

/** EV-tap for valgt kort mot beste kort, snittet over samplede verdener. */
function beslutningsAnger(
  s: GameState,
  sete: number,
  lovlige: readonly Kort[],
  valgt: Kort,
  rng: () => number,
): number | null {
  const kortInt = lovlige.map(kortTilInt);
  const ktx: PoengKtx = {
    observator: sete,
    budvinner: s.budvinner!,
    meldingstype: s.melding!.type,
    bud: s.melding!.bud,
    totalStikk: s.giving.antallStikk,
    mål: s.regler.målPoeng,
  };
  const sum = new Array<number>(lovlige.length).fill(0);
  let verdener = 0;
  let tomme = 0;
  while (verdener < KONF.verdener && tomme < 60) {
    const verden = trekkVerden(s, sete, rng);
    if (!verden) {
      tomme++;
      continue;
    }
    tomme = 0;
    const oppsett = byggDDOppsett(s, verden);
    for (let i = 0; i < lovlige.length; i++) {
      const lag = evaluerEtterTrekk(oppsett, kortInt[i]!, KONF.terskel, KONF.nodeTak);
      sum[i]! += egenPoeng(lag, verden, ktx);
    }
    verdener++;
  }
  if (verdener === 0) return null;
  let besteEV = -Infinity;
  for (const v of sum) besteEV = Math.max(besteEV, v);
  const valgtIdx = lovlige.findIndex((k) => likeKort(k, valgt));
  return (besteEV - sum[valgtIdx]!) / verdener;
}

// --- 2) Duplikatkamp mot PIMC-boten -----------------------------------------
interface KampResultat {
  readonly mester: number;
  readonly pimc: number;
  readonly seire: number;
  readonly kamper: number;
}

function målMotPimc(): KampResultat {
  const agent = new NeatAgent(genom);
  let mesterPoeng = 0;
  let pimcPoeng = 0;
  let seire = 0;
  let kamper = 0;
  for (let f = 0; f < KONF.kampFrø; f++) {
    for (let sete = 0; sete < 4; sete++) {
      agent.nyKamp();
      let s = opprettSpill({ antallSpillere: 4 }, 888_000 + frø + f);
      let guard = 0;
      while (s.fase !== "FERDIG" && guard++ < 20000) {
        if (s.fase === "RUNDE_SLUTT" && s.rundeNr + 1 >= 40) break;
        const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
        let h: Handling;
        if (s.fase === "RUNDE_SLUTT") h = { type: "NESTE" };
        else if (iTur === sete) h = agent.velgHandling(s);
        else
          h = velgHandling(s, {
            verdener: KONF.pimcVerdener,
            terskel: KONF.pimcTerskel,
            frø: (frø + f * 131 + (iTur ?? 0) * 17 + guard) >>> 0,
          });
        s = utfør(s, h).state;
      }
      mesterPoeng += s.totalPoeng[sete] ?? 0;
      pimcPoeng += (s.totalPoeng.reduce((a, b) => a + b, 0) - (s.totalPoeng[sete] ?? 0)) / 3;
      if (s.vinner === sete) seire++;
      kamper++;
    }
  }
  return { mester: mesterPoeng / kamper, pimc: pimcPoeng / kamper, seire, kamper };
}

// --- 3) Budkalibrering fra treningens hjerteslag ----------------------------
function lesBudAnger(): number | null {
  try {
    const s = JSON.parse(readFileSync("trening/status.json", "utf8")) as { anger?: number };
    return typeof s.anger === "number" ? s.anger : null;
  } catch {
    return null;
  }
}

// --- Kjør porten ------------------------------------------------------------
const t0 = performance.now();

const anger = målSpillAnger();
console.log(
  `1) Kortspill vs eksakt løser: snittanger ${anger.snittAnger.toFixed(4)} poeng/beslutning, ` +
    `${(100 * anger.andelOptimal).toFixed(1)} % optimale valg, verste ${anger.verste.toFixed(3)} ` +
    `(${anger.antall} beslutninger à ${KONF.verdener} verdener, terskel ${KONF.terskel})`,
);

const kamp = målMotPimc();
console.log(
  `2) Duplikat vs PIMC-bot: mester ${kamp.mester.toFixed(1)} poeng/kamp, ` +
    `PIMC ${kamp.pimc.toFixed(1)}, diff ${(kamp.mester - kamp.pimc).toFixed(1)}, ` +
    `seire ${kamp.seire}/${kamp.kamper}`,
);

const budAnger = lesBudAnger();
console.log(`3) Budanger (trening): ${budAnger === null ? "ukjent" : budAnger.toFixed(3)}`);

const bestått =
  anger.antall >= KONF.beslutninger * 0.8 &&
  anger.snittAnger < MAKS_SPILL_ANGER &&
  anger.andelOptimal >= MIN_ANDEL_OPTIMAL &&
  kamp.mester - kamp.pimc >= 0 &&
  budAnger !== null &&
  budAnger < MAKS_BUD_ANGER;

console.log(
  `\nVERDIKT: ${bestått ? "OPTIMAL (innenfor målenøyaktighet) – porten BESTÅTT" : "IKKE optimal ennå"} ` +
    `(${((performance.now() - t0) / 1000).toFixed(0)}s)`,
);
process.exit(bestått ? 0 : 1);
