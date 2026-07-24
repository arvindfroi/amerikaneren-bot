/**
 * Trener NEAT-populasjonen: cupturneringer generasjon for generasjon.
 *
 *   node examples/neat-tren.ts [generasjoner] [populasjon] [frø]
 *
 * Flagg:
 *   --fra <fil>        gjenoppta trening fra et lagret mestergenom
 *   --maks-timer <t>   stopp pent etter t timer (lagrer og avslutter med kode 0)
 *   --gen-start <n>    forskyv generasjonsnummereringen (brukes av vakten
 *                      ved omstart, så loggen teller videre der den slapp)
 *
 * Mesteren lagres fortløpende til trening/mester.json (og en kopi per
 * 10. generasjon), og måles jevnlig mot en grådig heuristisk bot i
 * flakskontrollerte duplikatkamper.
 *
 * Feilsikring: alle filer skrives atomisk (tmp + rename, aldri korrupt
 * mester ved krasj), og trening/status.json oppdateres som hjerteslag per
 * generasjon slik at vakten (neat-vakt.ts) kan oppdage heng og omstarte.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";

import {
  lovligeKort,
  lovligeHandlinger,
  opprettSpill,
  utfør,
  type Farge,
  type GameState,
  type Handling,
  type Kort,
} from "../src/index.ts";
import { Evolusjon, genomFraJson, genomTilJson, NeatAgent, type Genom } from "../src/neat/index.ts";
import { grådigHandling } from "./graadig.ts";

// --- Argumenter -------------------------------------------------------------
const posisjonelle: string[] = [];
let fraFil: string | null = null;
let fraFlereFil: string | null = null;
let maksTimer: number | null = null;
let genStart = 0;
let dir = "trening";
let hallOfFame = 0;
let tråder = 1;
let kampFrø = 1;
let portvakter = 0;
let sluttsøk = 0;
let spillFasit = false;
let budFasit = false;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--fra") fraFil = process.argv[++i] ?? null;
  else if (process.argv[i] === "--fra-flere") fraFlereFil = process.argv[++i] ?? null;
  else if (process.argv[i] === "--maks-timer") maksTimer = Number(process.argv[++i]);
  else if (process.argv[i] === "--gen-start") genStart = Number(process.argv[++i]);
  else if (process.argv[i] === "--dir") dir = process.argv[++i] ?? "trening";
  else if (process.argv[i] === "--hall") hallOfFame = Number(process.argv[++i]);
  else if (process.argv[i] === "--tråder") tråder = Number(process.argv[++i]);
  else if (process.argv[i] === "--kampfrø") kampFrø = Number(process.argv[++i]);
  else if (process.argv[i] === "--portvakter") portvakter = Number(process.argv[++i]);
  else if (process.argv[i] === "--sluttsøk") sluttsøk = Number(process.argv[++i]);
  else if (process.argv[i] === "--spillfasit") spillFasit = true;
  else if (process.argv[i] === "--budfasit") budFasit = true;
  else posisjonelle.push(process.argv[i]!);
}
const generasjoner = Number(posisjonelle[0] ?? 50);
const populasjon = Number(posisjonelle[1] ?? 32);
const frø = Number(posisjonelle[2] ?? 42);

/** Atomisk skriving: aldri halvskrevne/korrupte filer ved krasj. */
function lagreAtomisk(fil: string, innhold: string): void {
  const tmp = `${fil}.tmp`;
  writeFileSync(tmp, innhold);
  renameSync(tmp, fil);
}

let startGenom: Genom | undefined;
let startPopulasjon: Genom[] | undefined;
let startHall: Genom[] | undefined;
// HELE befolkningen (populasjon + hall) lagres periodisk og har forrang ved
// omstart: å gjenoppta fra kun mesteren kaster bort alt mangfold – hver
// container-omstart ble en flaskehals som satte linja tilbake.
let startTerskel: number | undefined;
if (existsSync(`${dir}/befolkning.json`)) {
  const b = JSON.parse(readFileSync(`${dir}/befolkning.json`, "utf8")) as {
    genomer: Genom[];
    hall: Genom[];
    terskel?: number;
  };
  startPopulasjon = b.genomer;
  startHall = b.hall;
  startTerskel = b.terskel;
  console.log(
    `Gjenopptar HEL befolkning: ${b.genomer.length} genomer + ${b.hall.length} i hallen` +
      (b.terskel !== undefined ? `, terskel ${b.terskel.toFixed(2)}` : ""),
  );
} else if (fraFil !== null) {
  startGenom = genomFraJson(readFileSync(fraFil, "utf8"));
  console.log(`Gjenopptar fra ${fraFil} (${startGenom.noder.length} noder, ${startGenom.koblinger.length} koblinger)`);
} else if (fraFlereFil !== null) {
  startPopulasjon = JSON.parse(readFileSync(fraFlereFil, "utf8")) as Genom[];
  console.log(`Starter fra ${startPopulasjon.length} kombinerte genomer i ${fraFlereFil}`);
}

mkdirSync(dir, { recursive: true });

/**
 * Benkemåling: mesteren mot 3 grådige boter, duplikat (samme frø, mesteren
 * roterer gjennom alle 4 setene). Rapporterer snittpoeng per kamp for
 * mesteren mot snittet av de grådige.
 */
function målMotGrådig(genom: Genom, antallFrø: number): { mester: number; grådig: number; seire: number; kamper: number } {
  const agent = new NeatAgent(genom);
  let mesterPoeng = 0;
  let grådigPoeng = 0;
  let seire = 0;
  let kamper = 0;
  for (let f = 0; f < antallFrø; f++) {
    for (let sete = 0; sete < 4; sete++) {
      agent.nyKamp();
      let s = opprettSpill({ antallSpillere: 4 }, 777000 + f);
      let guard = 0;
      while (s.fase !== "FERDIG" && guard++ < 20000) {
        if (s.fase === "RUNDE_SLUTT" && s.rundeNr + 1 >= 40) break;
        const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
        let h: Handling;
        if (s.fase === "RUNDE_SLUTT") h = { type: "NESTE" };
        else if (iTur === sete) h = agent.velgHandling(s);
        else h = grådigHandling(s);
        s = utfør(s, h).state;
      }
      mesterPoeng += s.totalPoeng[sete] ?? 0;
      grådigPoeng += (s.totalPoeng.reduce((a, b) => a + b, 0) - (s.totalPoeng[sete] ?? 0)) / 3;
      if (s.vinner === sete) seire++;
      kamper++;
    }
  }
  return { mester: mesterPoeng / kamper, grådig: grådigPoeng / kamper, seire, kamper };
}

// --- Treningsløkka ----------------------------------------------------------
console.log(
  `NEAT-trening: ${generasjoner} generasjoner, populasjon ${populasjon}, frø ${frø}` +
    (genStart > 0 ? ` (fortsetter fra gen ${genStart})` : "") +
    (maksTimer !== null ? `, tidstak ${maksTimer} t` : ""),
);
const evo = new Evolusjon({
  populasjon,
  frø,
  startGenom,
  startPopulasjon,
  startHall,
  startTerskel,
  hallOfFame,
  tråder,
  kampOpts: {
    frøPerKamp: kampFrø,
    ...(sluttsøk > 0
      ? { sluttsøk: { terskel: sluttsøk, verdener: 3, nodeTak: 60_000, netPrior: 5 } }
      : {}),
    ...(spillFasit
      ? { spillFasit: { sjanse: 0.08, verdener: 3, dybde: 3, nodeTak: 60_000, rate: 0.02 } }
      : {}),
    ...(budFasit ? { budFasit: { sjanse: 0.05, rate: 0.02 } } : {}),
  },
  pimcPortvakter: portvakter,
});
if (portvakter > 0) console.log(`PIMC-portvakter i cupen: ${Math.floor(portvakter / 4) * 4}`);
if (sluttsøk > 0) console.log(`Sluttsøk i kampene: eksakt ved ≤${sluttsøk} stikk igjen`);
if (spillFasit) console.log(`Spillfasit på: solver-fasit for korthodet (8 % av kortvalg, rate 0.02)`);
if (budFasit) console.log(`Budfasit på: rollout-fasit for xT-hodene (5 % av budvalg, rate 0.02)`);

// Gullstandarden (ratchet): beste eksternt benkede genom, beskyttet i
// populasjonen og kun byttet når en cupvinner benker bedre. Lastes ved
// oppstart så restarts aldri mister linjens beste.
let gullDiff = -Infinity;
try {
  const gull = JSON.parse(readFileSync(`${dir}/gull.json`, "utf8")) as { diff: number; genom: Genom };
  evo.settGull(gull.genom);
  gullDiff = gull.diff;
  console.log(`Gullstandard lastet: benk-diff ${gullDiff.toFixed(1)}`);
} catch {
  /* ingen gullstandard ennå */
}
const t0 = performance.now();
let sisteBenk = "";

for (let g = 0; g < generasjoner; g++) {
  const stat = await evo.kjørGenerasjon();
  const gen = stat.generasjon + genStart;
  const mester = evo.mester!;
  lagreAtomisk(`${dir}/mester.json`, genomTilJson(mester));

  console.log(
    `gen ${String(gen).padStart(3)}: ` +
      `arter=${stat.antallArter} ` +
      `fitness=${stat.besteFitness.toFixed(2)} (snitt ${stat.snittFitness.toFixed(2)}) ` +
      `dybde=${stat.mesterDybde}/${stat.turneringsRunder} ` +
      `${stat.mesterForsvarte ? "tittel forsvart" : "ny mester"} ` +
      `anger=${stat.snittRegret.toFixed(3)} ` +
      `nett=${stat.mesterNoder}n/${stat.mesterKoblinger}k`,
  );

  const tidBrukt = performance.now() - t0;
  const tidsavbrudd = maksTimer !== null && tidBrukt > maksTimer * 3_600_000;

  // Hele befolkningen persisteres hver 5. generasjon (halvparten av benk-
  // intervallet): container-omstarter er utenfor vår kontroll, så det eneste
  // vi kan styre er hvor lite arbeid en omstart koster (≤ 5 generasjoner).
  if ((gen + 1) % 5 === 0 || g === generasjoner - 1 || tidsavbrudd) {
    try {
      lagreAtomisk(
        `${dir}/befolkning.json`,
        JSON.stringify({ genomer: evo.genomer, hall: evo.hall, terskel: evo.terskel }),
      );
    } catch {
      /* aldri velte treningen */
    }
  }

  if ((gen + 1) % 10 === 0 || g === generasjoner - 1 || tidsavbrudd) {
    // Benk/kopi må aldri velte selve treningen – fang og fortsett.
    try {
      lagreAtomisk(`${dir}/mester-gen${gen}.json`, genomTilJson(mester));
      // 8 frø × 4 seter = 32 kamper – tilfeldighetene kontrolleres bedre
      // (±støyen krymper ~40 % mot gamle 12).
      const benk = målMotGrådig(mester, 8);
      sisteBenk = `mester ${benk.mester.toFixed(1)} poeng/kamp, grådig ${benk.grådig.toFixed(1)}, seire ${benk.seire}/${benk.kamper}`;
      console.log(`  benk vs grådig bot: ${sisteBenk}`);
      // Ratchet: benker cupvinneren bedre enn gullstandarden, tar den over.
      const diff = benk.mester - benk.grådig;
      if (diff > gullDiff) {
        gullDiff = diff;
        evo.settGull(mester);
        lagreAtomisk(`${dir}/gull.json`, JSON.stringify({ diff, gen, genom: JSON.parse(genomTilJson(mester)) }));
        console.log(`  NY GULLSTANDARD: benk-diff ${diff.toFixed(1)} (gen ${gen})`);
      }
    } catch (feil) {
      console.error(`  (benk/kopi feilet: ${String(feil)})`);
    }
  }

  // Genom-trekk + fitness per individ → forklaringsanalysen (neat-forklar.ts).
  try {
    appendFileSync(`${dir}/analyse.jsonl`, JSON.stringify({ gen, individer: stat.individer }) + "\n");
  } catch {
    /* analyse er ikke kritisk */
  }

  // Hjerteslag for vakten (neat-vakt.ts): siste fullførte generasjon + tid.
  lagreAtomisk(
    `${dir}/status.json`,
    JSON.stringify({
      generasjon: gen,
      tidsstempel: Date.now(),
      fitness: stat.besteFitness,
      anger: stat.snittRegret,
      noder: stat.mesterNoder,
      koblinger: stat.mesterKoblinger,
      sisteBenk,
    }),
  );

  if (tidsavbrudd) {
    console.log(`Tidsavbrudd etter ${(tidBrukt / 3_600_000).toFixed(2)} t – lagret og avslutter pent.`);
    break;
  }
}

await evo.avslutt();
console.log(`Ferdig på ${((performance.now() - t0) / 1000).toFixed(0)}s. Mester: ${dir}/mester.json`);
