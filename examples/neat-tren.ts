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
import { NevroAgent } from "../src/nevro/index.ts";
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
/**
 * --nevro slår på hele NevroHjerne-pakken: appens ferdigtrente nett blir
 * målestokk i cupen (sterkere OG mange hundre ganger raskere enn den
 * billige PIMC-portvakten), benken som avgjør gullstandarden går mot det
 * samme nettet på roterende givere, og gullbytter krever en parret
 * bekreftelsesmåling. Uten flagget oppfører treningen seg som før.
 */
let medNevro = false;
/** Andel kortvalg der NevroHjerne brukes som lærer (0 = av). */
let nevroFasit = 0;
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
  else if (process.argv[i] === "--nevro") medNevro = true;
  else if (process.argv[i] === "--nevrofasit") nevroFasit = Number(process.argv[++i]);
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
 * Benkemåling: kandidaten mot 3 like motstandere, duplikat (samme frø,
 * kandidaten roterer gjennom alle 4 setene). Rapporterer snittpoeng per
 * kamp for kandidaten mot snittet av motstanderne.
 *
 * `frøBase` gjør at benken kan ROTERE mellom generasjoner. Det er ikke
 * kosmetikk: med ett fast frøsett maksimerer gull-skrallen ytelsen på de
 * samme åtte giverne om og om igjen, og et genom som var heldig der blir
 * stående som «beste noensinne». Målt: gullet lå 4–5 poeng høyere på
 * treningsbenken enn på ferske givere.
 */
function målMot(
  genom: Genom,
  motstander: "grådig" | "nevro",
  antallFrø: number,
  frøBase: number,
): { mester: number; motstander: number; seire: number; kamper: number } {
  const agent = new NeatAgent(genom);
  const nevro = motstander === "nevro" ? new NevroAgent() : null;
  let mesterPoeng = 0;
  let andresPoeng = 0;
  let seire = 0;
  let kamper = 0;
  for (let f = 0; f < antallFrø; f++) {
    for (let sete = 0; sete < 4; sete++) {
      agent.nyKamp();
      let s = opprettSpill({ antallSpillere: 4 }, frøBase + f);
      let guard = 0;
      while (s.fase !== "FERDIG" && guard++ < 20000) {
        if (s.fase === "RUNDE_SLUTT" && s.rundeNr + 1 >= 40) break;
        const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
        let h: Handling;
        if (s.fase === "RUNDE_SLUTT") h = { type: "NESTE" };
        else if (iTur === sete) h = agent.velgHandling(s);
        else h = nevro !== null ? nevro.velgHandling(s) : grådigHandling(s);
        s = utfør(s, h).state;
      }
      mesterPoeng += s.totalPoeng[sete] ?? 0;
      andresPoeng += (s.totalPoeng.reduce((a, b) => a + b, 0) - (s.totalPoeng[sete] ?? 0)) / 3;
      if (s.vinner === sete) seire++;
      kamper++;
    }
  }
  return { mester: mesterPoeng / kamper, motstander: andresPoeng / kamper, seire, kamper };
}

/**
 * Bekreftelsesmåling før gullet byttes: utfordrer og sittende gull spilles
 * PARRET på et større, ferskt frøsett, og differansen må være positiv.
 * Uten dette adopteres støy – benken har SE ≈ 3,5 poeng ved 8 givere, så
 * «beste noensinne» over hundrevis av målinger er systematisk for høy.
 */
function bekrefterBedre(
  utfordrer: Genom,
  sittende: Genom,
  motstander: "grådig" | "nevro",
  antallFrø: number,
  frøBase: number,
): { bedre: boolean; diff: number } {
  let sum = 0;
  for (let f = 0; f < antallFrø; f++) {
    const a = målMot(utfordrer, motstander, 1, frøBase + f);
    const b = målMot(sittende, motstander, 1, frøBase + f);
    sum += a.mester - a.motstander - (b.mester - b.motstander);
  }
  const diff = sum / antallFrø;
  return { bedre: diff > 0, diff };
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
    ...(nevroFasit > 0 ? { nevroFasit: { sjanse: nevroFasit, rate: 0.02 } } : {}),
  },
  pimcPortvakter: portvakter,
  målestokkType: medNevro ? "nevro" : "pimc",
});
const gullMotstander: "grådig" | "nevro" = medNevro ? "nevro" : "grådig";
if (portvakter > 0)
  console.log(
    `Målestokk i cupen: ${medNevro ? "NevroHjerne (appens nett)" : "PIMC-solver"} ` +
      `i hver førsterundegruppe (${Math.floor(portvakter / 4) * 4} plasser avsatt)`,
  );
if (medNevro) console.log(`Gullstandard avgjøres av nevro-benken på roterende givere + parret bekreftelse`);
if (sluttsøk > 0) console.log(`Sluttsøk i kampene: eksakt ved ≤${sluttsøk} stikk igjen`);
if (spillFasit) console.log(`Spillfasit på: solver-fasit for korthodet (8 % av kortvalg, rate 0.02)`);
if (budFasit) console.log(`Budfasit på: rollout-fasit for xT-hodene (5 % av budvalg, rate 0.02)`);
if (nevroFasit > 0)
  console.log(`Nevrofasit på: NevroHjerne som lærer for korthodet (${Math.round(nevroFasit * 100)} % av kortvalg, rate 0.02)`);

// Gullstandarden (ratchet): beste eksternt benkede genom, beskyttet i
// populasjonen og kun byttet når en cupvinner benker bedre. Lastes ved
// oppstart så restarts aldri mister linjens beste.
let gullDiff = -Infinity;
try {
  const gull = JSON.parse(readFileSync(`${dir}/gull.json`, "utf8")) as {
    diff: number;
    motstander?: "grådig" | "nevro";
    genom: Genom;
  };
  evo.settGull(gull.genom);
  gullDiff = gull.diff;
  const lagretMot = gull.motstander ?? "grådig";
  if (lagretMot !== gullMotstander) {
    // Ny målestokk: den lagrede differansen er på en annen skala og kan
    // ikke sammenliknes. Mål det sittende gullet om, ellers ville skrallen
    // stått låst (eller åpen) på et tall som ikke betyr noe her.
    const om = målMot(gull.genom, gullMotstander, 12, 810000);
    gullDiff = om.mester - om.motstander;
    console.log(
      `Gullstandard lastet (var målt mot ${lagretMot}: ${gull.diff.toFixed(1)}) – ` +
        `målt om mot ${gullMotstander}: ${gullDiff.toFixed(1)}`,
    );
  } else {
    console.log(`Gullstandard lastet: benk-diff ${gullDiff.toFixed(1)} (mot ${lagretMot})`);
  }
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
      // Grådig-benken beholdes uendret (faste frø) som historisk kurve i
      // fremgangsgrafen – men den AVGJØR ingenting når --nevro er på.
      const benk = målMot(mester, "grådig", 8, 777000);
      sisteBenk = `mester ${benk.mester.toFixed(1)} poeng/kamp, grådig ${benk.motstander.toFixed(1)}, seire ${benk.seire}/${benk.kamper}`;
      console.log(`  benk vs grådig bot: ${sisteBenk}`);

      // Den avgjørende benken: mot NevroHjerne, på givere som ROTERER med
      // generasjonen, så ingen genom kan bli «beste noensinne» ved å være
      // heldig på ett fast frøsett.
      let diff = benk.mester - benk.motstander;
      if (medNevro) {
        const nBenk = målMot(mester, "nevro", 8, 800000 + (gen % 50) * 8);
        diff = nBenk.mester - nBenk.motstander;
        console.log(
          `  benk vs nevro: mester ${nBenk.mester.toFixed(1)} poeng/kamp, nevro ${nBenk.motstander.toFixed(1)}, ` +
            `seire ${nBenk.seire}/${nBenk.kamper}`,
        );
      }

      // Ratchet med bekreftelse: den billige benken er bare en PORT. Består
      // utfordreren den, måles den parret mot sittende gull på et større,
      // ferskt frøsett – og bare en positiv differanse der bytter gullet.
      if (diff > gullDiff) {
        const sittende = evo.gull;
        const bekreft =
          medNevro && sittende !== null
            ? bekrefterBedre(mester, sittende, "nevro", 24, 860000 + (gen % 97) * 24)
            : { bedre: true, diff };
        if (bekreft.bedre) {
          gullDiff = diff;
          evo.settGull(mester);
          lagreAtomisk(
            `${dir}/gull.json`,
            JSON.stringify({ diff, gen, motstander: gullMotstander, genom: JSON.parse(genomTilJson(mester)) }),
          );
          console.log(
            `  NY GULLSTANDARD: benk-diff ${diff.toFixed(1)} (gen ${gen})` +
              (medNevro && sittende !== null ? `, bekreftet +${bekreft.diff.toFixed(1)} på 24 ferske givere` : ""),
          );
        } else {
          console.log(
            `  utfordrer avvist: benk-diff ${diff.toFixed(1)} > gull ${gullDiff.toFixed(1)}, ` +
              `men bekreftelsen ga ${bekreft.diff.toFixed(1)} på 24 ferske givere`,
          );
        }
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
