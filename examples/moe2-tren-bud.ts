/**
 * TRENING AV BUDEKSPERTEN – den ENESTE fasiten som har bestått porten.
 *
 *   node examples/moe2-tren-bud.ts --givere 400 --generasjoner 20
 *
 * HVORFOR BARE DENNE. Fire fasiter er prøvd i godkjenningsporten. Budet
 * (single dummy) består med korrigert korrelasjon +0,925 og pålitelighet
 * 0,947 på det smale utvalget. Vrak, trumf og kortspill (alle double dummy)
 * er avvist – trumf +0,234, vrak +0,144, kortspill −0,609. Å trene på en
 * avvist fasit er å bruke CPU på å bli målbart dårligere; det ble gjort med
 * 218 CPU-timer samme dag, og skal ikke gjentas.
 *
 * TO TING SOM ER MÅLT OG SOM STYRER OPPSETTET:
 *
 * 1. TAPET ER ASYMMETRISK. Ett stikk for høyt koster 14,75 poeng/runde, ett
 *    for lavt 1,51 (`analyse/moe2-port-bud.txt`). Fasiten i `bud.ts` er derfor
 *    `−budKostnad(påstand − SD)` i POENG, ikke −|avvik| i stikk, og læringen
 *    kjører med `budLærevekt` slik at gradienten blir den til et asymmetrisk
 *    tap. Kontrollarmen «symmetrisk» finnes for å vise at forskjellen er ekte
 *    og ikke en fortelling.
 *
 * 2. NEVRO DUGER IKKE SOM TAK. Målt: nevro bommer 2,6090 stikk fra SD, et
 *    uniformt lovlig bud 2,2229 – taket lå under gulvet, og framdriften ble
 *    mer negativ jo bedre eksperten var. Taket er derfor SD-orakelet selv, og
 *    nevro rapporteres som en egen linje på nøyaktig samme stillinger.
 *
 * HOLDOUT DELES PÅ GIV, ikke på stilling. To budstillinger fra samme giv deler
 * alle fire hendene; en tidligere deling på stilling ga et «holdout»-tall på
 * 1,54 der gulvet var 2,46. Skriptet SJEKKER delingen før det trener, og
 * stopper hvis en giv har havnet i to deler.
 *
 * Sluttmålet er ikke fasitavviket, men POENG. Det måles i
 * `examples/moe2-poeng-bud.ts` på et giversett dette skriptet aldri ser.
 */

import { mkdirSync, writeFileSync } from "node:fs";

import { genomTilJson, klonGenom, type Genom } from "../src/neat/genom.ts";
import { tømCache } from "../src/neat/singledummy.ts";
import { beskriv, framdrift, mål, type Maaling } from "../src/moe2/maaling.ts";
import {
  budEkspert,
  budLærevekt,
  lagBudstillinger,
  type Budhandling,
} from "../src/moe2/eksperter/bud.ts";
import {
  anger,
  delUtvalg,
  gulvFor,
  målEkspert,
  Populasjon,
  type Stilling,
  type Utvalg,
} from "../src/moe2/eksperter/felles.ts";
import { Nettverk } from "../src/neat/nett.ts";

interface Argumenter {
  givere: number;
  frø: number;
  pop: number;
  generasjoner: number;
  epoker: number;
  rate: number;
  popFrø: number;
  koblinger: number;
  ut: string;
}

const arg: Argumenter = {
  givere: 400,
  // TRENINGSFRØ. Poengmålingen bruker 8 000 000 og 8 500 000 (samme som
  // porten), altså disjunkte giver. Uten det ville sluttmålet vært målt på
  // giver treningen har sett.
  frø: 9_000_000,
  pop: 24,
  generasjoner: 20,
  epoker: 3,
  rate: 0.05,
  popFrø: 0x4d6f4532,
  /**
   * KOBLINGER INN TIL UTGANGEN ved fødsel – MÅLT, ikke resonnert fram.
   *
   * Hypotesen var at 5 av 87 sensorer er for lite: eksperten har ÉN utgang, og
   * med fem tilfeldig trukne innganger ser den 6 % av hånden sin. Full
   * tilkobling burde gitt en lineær avlesning delta-regelen kan fylle ut.
   *
   * MÅLT (600 givere, pop 24, 20 generasjoner, holdout n=916, anger i poeng):
   *     5 trekk    asym 5,037   sym 6,175
   *    87 trekk    asym 5,268   sym 7,424
   *   400 trekk    asym 5,380   sym 8,086
   * Hypotesen er FEIL, og monotont feil: jo tettere utgangen kobles, desto
   * verre blir den. Grunnen ligger i `bevarLengde` – kalibreringen får endre
   * retning, aldri skala – så L2-lengden 1,5 fordeles på flere koblinger og
   * hver enkelt sensor får mindre å si. Fem koblinger er ikke en begrensning
   * her, det er den konsentrasjonen læringen trenger.
   *
   * (Merk at tallet er et TREKKANTALL: `nyttGenom` trekker uniformt med
   * tilbakelegging og hopper over duplikater, så 87 trekk gir ~55 koblinger.)
   */
  koblinger: 5,
  ut: "analyse/moe2-budekspert.json",
};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  const tall = (): number => Number(process.argv[++i]);
  if (a === "--givere") arg.givere = tall();
  else if (a === "--frø") arg.frø = tall();
  else if (a === "--pop") arg.pop = tall();
  else if (a === "--generasjoner") arg.generasjoner = tall();
  else if (a === "--epoker") arg.epoker = tall();
  else if (a === "--rate") arg.rate = tall();
  else if (a === "--pop-frø") arg.popFrø = tall();
  else if (a === "--koblinger") arg.koblinger = tall();
  else if (a === "--ut") arg.ut = process.argv[++i] ?? arg.ut;
}

mkdirSync("analyse", { recursive: true });

/** VARIG LOGG: en måling som bare finnes i stdout er tapt om røret ryker. */
const LOGG = "analyse/moe2-tren-bud.txt";
const linjer: string[] = [];
function skriv(s: string): void {
  console.log(s);
  linjer.push(s);
  writeFileSync(LOGG, linjer.join("\n") + "\n");
}

const start = Date.now();
skriv(`Trening av budeksperten. ${new Date().toISOString()}`);
skriv(
  `givere ${arg.givere} (frø ${arg.frø}), pop ${arg.pop}, ${arg.generasjoner} generasjoner ` +
    `x ${arg.epoker} epoker, rate ${arg.rate}`,
);

tømCache();
const alle = lagBudstillinger({ giver: arg.givere, frø: arg.frø });
const utvalg: Utvalg<Budhandling> = delUtvalg("bud", alle);
skriv(
  `\nstillinger: ${utvalg.trening.length} trening / ${utvalg.utvikling.length} utvikling / ` +
    `${utvalg.holdout.length} holdout  (av ${alle.length})`,
);

/**
 * DELINGEN SKAL GÅ PÅ GIV. Sjekkes her, ikke antas: den forrige lekkasjen kom
 * av at to stillinger fra samme giv – som deler alle fire hender – havnet i
 * hver sin del.
 */
{
  const g = (a: readonly Stilling<Budhandling>[]): Set<string | number> =>
    new Set(a.map((s) => s.gruppe));
  const t = g(utvalg.trening);
  const u = g(utvalg.utvikling);
  const h = g(utvalg.holdout);
  for (const x of h) {
    if (t.has(x) || u.has(x)) throw new Error(`giva ${String(x)} ligger i holdout OG i seleksjonen`);
  }
  for (const x of u) if (t.has(x)) throw new Error(`giva ${String(x)} ligger i to seleksjonsdeler`);
  skriv(
    `giv-deling: ${t.size} / ${u.size} / ${h.size} givere, ingen giv i to deler ` +
      `(sjekket, ikke antatt)`,
  );
  if (h.size < 20) throw new Error("for få holdout-giver til et ærlig sluttall");
}

// ---------------------------------------------------------------------------
// Referanselinjer på HOLDOUT – samme stillinger, samme kall
// ---------------------------------------------------------------------------

/** En måling av en fast policy på holdout, med gulv og tak fra samme utvalg. */
function linje(navn: string, velg: (s: Stilling<Budhandling>) => number): Maaling {
  return mål({
    navn,
    stillinger: utvalg.holdout,
    holdout: true,
    retning: "lavereErBedre",
    kandidat: (s) => anger(s, velg(s)),
    gulv: gulvFor,
    tak: (s) => anger(s, s.takValg),
  });
}

/** Nærmeste lovlige påstand til et fast tall – «alltid omtrent ni stikk». */
function nærmest(s: Stilling<Budhandling>, tall: number): number {
  let beste = 0;
  for (let i = 1; i < s.handlinger.length; i++) {
    if (Math.abs(s.handlinger[i]! - tall) < Math.abs(s.handlinger[beste]! - tall)) beste = i;
  }
  return beste;
}

// ---------------------------------------------------------------------------
// Treningen – to armer, samme frø, samme stillinger
// ---------------------------------------------------------------------------

interface Arm {
  readonly navn: string;
  readonly vekt: ((feil: number) => number) | undefined;
}

/**
 * DET ENESTE SOM SKILLER ARMENE ER GRADIENTVEKTEN.
 *
 * Fasiten (`−budKostnad`), angeren, gulvet, taket, seleksjonen og selve
 * budvalget (`billigsteBud`) er asymmetriske i BEGGE armer – asymmetrien er
 * målt, og den hører hjemme i tapsfunksjonen uansett hvordan nettet trenes.
 * «symmetrisk» betyr her bare at delta-regelen retter like hardt opp som ned,
 * altså at estimatet sikter mot betinget forventning i stedet for mot
 * τ-ekspektilen. Navnene er korte fordi de skal stå i en tabell; forskjellen
 * er denne ene.
 */
const armer: Arm[] = [
  { navn: "asymmetrisk", vekt: budLærevekt },
  { navn: "symmetrisk", vekt: undefined },
];

interface Resultat {
  navn: string;
  fersk: Maaling;
  lært: Maaling;
  tren: Maaling;
  genom: Genom;
  budSnitt: number;
  sdSnitt: number;
  andelOver: number;
  andelUnder: number;
  kurve: { gen: number; beste: number; median: number }[];
}

/** Snittbud, og hvor ofte eksperten legger seg over/under orakelets bud. */
function budprofil(
  genom: Genom,
  stillinger: readonly Stilling<Budhandling>[],
): { budSnitt: number; sdSnitt: number; andelOver: number; andelUnder: number } {
  const nett = new Nettverk(genom);
  let bud = 0;
  let sd = 0;
  let over = 0;
  let under = 0;
  for (const s of stillinger) {
    const i = budEkspert.velg(nett.aktiver(s.inn), s);
    const b = s.handlinger[i]!;
    // Taket er SD-orakelets beste LOVLIGE bud – den samme aksen kandidaten
    // velger på, så differansen er meningsfull.
    const f = s.handlinger[s.takValg]!;
    bud += b;
    sd += f;
    if (b > f) over++;
    else if (b < f) under++;
  }
  const n = stillinger.length;
  return { budSnitt: bud / n, sdSnitt: sd / n, andelOver: over / n, andelUnder: under / n };
}

const resultater: Resultat[] = [];
for (const arm of armer) {
  skriv(`\n=== ARM: ${arm.navn} ===`);
  const pop = new Populasjon(budEkspert, {
    antall: arg.pop,
    frø: arg.popFrø,
    koblingerPerUt: arg.koblinger,
  });
  const beste = (): Genom => pop.rangér(utvalg.utvikling)[0]!.genom;
  const fersk = målEkspert(budEkspert, beste(), utvalg, "holdout", `${arm.navn} fersk`);
  skriv("  " + beskriv(fersk));

  // Beste-på-UTVIKLING beholdes underveis. Seleksjonen ser aldri holdout.
  let mester = klonGenom(beste());
  let mesterAnger = pop.rangér(utvalg.utvikling)[0]!.anger;
  const kurve: { gen: number; beste: number; median: number }[] = [];
  for (let g = 0; g < arg.generasjoner; g++) {
    for (let e = 0; e < arg.epoker; e++) pop.lærEpoke(utvalg.trening, arg.rate, arm.vekt);
    const rangert = pop.rangér(utvalg.utvikling);
    if (rangert[0]!.anger < mesterAnger) {
      mesterAnger = rangert[0]!.anger;
      mester = klonGenom(rangert[0]!.genom);
    }
    const res = pop.nyGenerasjon(utvalg.utvikling);
    kurve.push({ gen: g, beste: res.beste, median: res.median });
    if (g % 5 === 0 || g === arg.generasjoner - 1) {
      skriv(
        `  gen ${String(g).padStart(3)}  utvikling beste ${res.beste.toFixed(4)}  ` +
          `median ${res.median.toFixed(4)}  mester ${mesterAnger.toFixed(4)}`,
      );
    }
  }

  const lært = målEkspert(budEkspert, mester, utvalg, "holdout", `${arm.navn} lært`);
  const tren = målEkspert(budEkspert, mester, utvalg, "trening", `${arm.navn} tren`);
  skriv("  " + beskriv(lært));
  skriv("  " + beskriv(tren));
  const profil = budprofil(mester, utvalg.holdout);
  skriv(
    `  snittbud ${profil.budSnitt.toFixed(2)} mot orakelets ${profil.sdSnitt.toFixed(2)}  ` +
      `over ${(100 * profil.andelOver).toFixed(0)} % / under ${(100 * profil.andelUnder).toFixed(0)} %`,
  );
  resultater.push({ navn: arm.navn, fersk, lært, tren, genom: mester, ...profil, kurve });
}

// ---------------------------------------------------------------------------
// Rapporten
// ---------------------------------------------------------------------------

const nevro = linje("nevros bud", (s) => s.nevroValg ?? s.takValg);
const konst9 = linje("konstant 9", (s) => nærmest(s, 9));
const konst8 = linje("konstant 8", (s) => nærmest(s, 8));
const sdSelv = linje("SD (taket)", (s) => s.takValg);

skriv(`\n=== HOLDOUT, n=${utvalg.holdout.length} – anger i POENG per runde ===`);
skriv(
  "policy".padEnd(20) +
    "anger".padStart(9) +
    "gulv".padStart(9) +
    "tak".padStart(8) +
    "framdrift".padStart(12),
);
skriv("-".repeat(58));
const tabell: Maaling[] = [
  sdSelv,
  ...resultater.map((r) => r.lært),
  ...resultater.map((r) => r.fersk),
  konst9,
  konst8,
  nevro,
];
for (const m of tabell) {
  skriv(
    m.navn.padEnd(20) +
      m.verdi.toFixed(3).padStart(9) +
      m.gulv.toFixed(3).padStart(9) +
      m.tak.toFixed(3).padStart(8) +
      `${(100 * framdrift(m)).toFixed(1)} %`.padStart(12),
  );
}
skriv(
  `\nNEVRO ER IKKE TAKET her: nevros bud gir anger ${nevro.verdi.toFixed(3)} mot gulvet ` +
    `${nevro.gulv.toFixed(3)} – ${nevro.verdi > nevro.gulv ? "DÅRLIGERE" : "bedre"} enn å velge ` +
    `uniformt blant de lovlige budene, på nøyaktig disse stillingene.`,
);

// BEGGE armene skrives, for poengmålingen skal se begge. Den symmetriske
// filen er ikke et biprodukt: uten den kan «asymmetrien hjalp» ikke etterprøves
// på poengbenken, og det er den benken som avgjør.
const best = resultater[0]!;
writeFileSync(arg.ut, genomTilJson(best.genom));
const symFil = arg.ut.replace(/\.json$/, "-symmetrisk.json");
writeFileSync(symFil, genomTilJson(resultater[1]!.genom));
skriv(`\nSkrev ${arg.ut} (armen «${best.navn}») og ${symFil}`);

writeFileSync(
  "analyse/moe2-tren-bud.json",
  JSON.stringify(
    {
      arg,
      stillinger: {
        trening: utvalg.trening.length,
        utvikling: utvalg.utvikling.length,
        holdout: utvalg.holdout.length,
      },
      armer: resultater.map((r) => ({
        navn: r.navn,
        fersk: r.fersk,
        lært: r.lært,
        tren: r.tren,
        budSnitt: r.budSnitt,
        sdSnitt: r.sdSnitt,
        andelOver: r.andelOver,
        andelUnder: r.andelUnder,
        kurve: r.kurve,
      })),
      referanser: { sdSelv, nevro, konst9, konst8 },
    },
    null,
    2,
  ),
);
skriv(`Skrev analyse/moe2-tren-bud.json`);
skriv(`\nTid: ${((Date.now() - start) / 1000).toFixed(0)} s`);
