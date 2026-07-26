/**
 * Hode-mot-hode mot MesterAI: 2 mot 2 i hele kamper, speilede par.
 *
 * examples/arena.ts måler ÉN kandidat (PIMC) mot MesterAI. Dette skriptet
 * generaliserer den til vilkårlige kandidater – `nevro`, `e1:<vektfil>`,
 * `pimc`, `graadig` – slik at NevroHjerne (målestokken hele prosjektet har
 * brukt) og sd-r1 (vårt beste nett) kan måles mot den samme motstanderen.
 *
 * Hvorfor det trengs: NevroHjerne har vært stedfortreder for MesterAI i alle
 * målinger uten at gapet mellom dem noen gang er målt. Og sd-r1 er trent med
 * NevroHjerne som motstandermodell i single-dummy-rolloutene, så tallet mot
 * MesterAI er den eneste ærlige testen av om metoden overfører seg.
 *
 * OPPSETT
 *   MesterAI får to seter, kandidaten de to andre. Kamp 2p og 2p+1 deler frø
 *   (samme givere), men setene byttes: MesterAI på {0,2} i den ene og {1,3}
 *   i den andre. Kort- og posisjonsflaks nulles dermed ut PARVIS, og paret
 *   er uavhengighetsenheten i statistikken – ikke enkeltkampen.
 *
 *   Vår motor er dommer: den deler ut, validerer og fører poeng. Adapteren
 *   speiler hver handling og verifiseres etter hver eneste av dem.
 *
 * KJØRING (adapteren må være bygget – se arena/README.md)
 *   node examples/mesterai-h2h.ts --kandidat nevro --par 24 \
 *        --adapter wsl:/home/arvind/arena-adapter/.build/release/adapter \
 *        --ut analyse/h2h-nevro.jsonl
 *
 * | Flagg | Standard | Betydning |
 * |---|---|---|
 * | `--kandidat` | nevro | `nevro`, `e1:<fil>`, `sd:<motpart>`, `pimc` eller `graadig` |
 * | `--sdverdener` | 12 | verdener SD-kandidaten sampler per kortvalg |
 * | `--par` | 8 | antall speilede par (= 2 kamper hver) |
 * | `--froe` | 550000 | frøbase; par p bruker frø `froe + p` |
 * | `--parfra`/`--partil` | – | skard: kjør bare parene [fra, til) (parallelle prosesser) |
 * | `--ms` | 450 | tidsbudsjett per kortvalg for MesterAI (og for `pimc`) |
 * | `--verdener` | – | låser MesterAIs `minVerdener` OG `maksVerdener` til dette |
 * | `--adapter` | arena/adapter/.build/release/adapter | adapterbinær, `wsl:`-prefiks støttes |
 * | `--ut` | analyse/mesterai-h2h.jsonl | VARIG logg: én linje per ferdigspilt kamp |
 *
 * OM `--ms` OG EN OPPTATT MASKIN – les dette før du tolker et tall.
 * MesterAIs søk stopper når `verdener >= maksVerdener`, ELLER når
 * `verdener >= minVerdener` og tidsbudsjettet er brukt opp (MesterAI.swift).
 * Det andre vilkåret gjør styrken avhengig av hvor travel maskinen er: står
 * det seksten treningsjobber og spiser kjerner, rekker MesterAI færre verdener
 * på de samme 450 ms og spiller SVAKERE – uten at noe i utskriften røper det.
 * Et tall målt med `--ms` på en lastet maskin er derfor et NEDRE anslag på
 * MesterAIs styrke, ikke et nøytralt et.
 *
 * `--verdener N` setter minVerdener = maksVerdener = N. Da kan ikke fristen
 * kutte søket kort, arbeidsmengden per kortvalg er den samme uansett last, og
 * målingen er reproduserbar på tvers av maskiner. Bruk det når tallet skal
 * være en varig målestokk; bruk `--ms 450` når du vil måle MesterAI slik
 * appen faktisk er innstilt hos brukeren.
 *
 * Utfila skrives med appendFileSync ETTER hver kamp. En flertimers måling
 * som avbrytes mister derfor bare den kampen som var i gang – aldri alt.
 * Rapporten regnes av examples/mesterai-h2h-rapport.ts.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/motor.ts";
import { velgHandling as pimcVelg, type BotOpts } from "../src/bot/bot.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { delSDSpek, SDAgent } from "../src/moe2/sdagent.ts";
import { grådigHandling } from "./graadig.ts";
import {
  Adapter,
  handlingFraJson,
  handlingTilJson,
  løsAdapter,
  rundeStart,
  sjekkSynk,
  type AdapterKommando,
} from "../arena/adapterklient.ts";

// --- Argumenter -------------------------------------------------------------

function flagg(navn: string, standard: number): number {
  const i = process.argv.indexOf(`--${navn}`);
  if (i < 0 || process.argv[i + 1] === undefined) return standard;
  const v = Number(process.argv[i + 1]);
  if (!Number.isFinite(v)) throw new Error(`Ugyldig verdi for --${navn}`);
  return v;
}
function tekstFlagg(navn: string, standard: string): string {
  const i = process.argv.indexOf(`--${navn}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : standard;
}

const kandidatNavn = tekstFlagg("kandidat", "nevro");
const antallPar = flagg("par", 8);
const frøBase = flagg("froe", 550000);
const parFra = flagg("parfra", 0);
const parTil = flagg("partil", antallPar);
const tidMs = flagg("ms", 450);
/** 0 = ikke oppgitt: da styrer tidsbudsjettet alene, som i appen. */
const låsteVerdener = flagg("verdener", 0);
/** Verdener SD-kandidaten (`sd:<motpart>`) sampler per kortvalg. */
const sdVerdener = flagg("sdverdener", 12);
const adapterSti = tekstFlagg("adapter", "arena/adapter/.build/release/adapter");
const utSti = tekstFlagg("ut", "analyse/mesterai-h2h.jsonl");

let adapterKmd: AdapterKommando;
try {
  adapterKmd = løsAdapter(adapterSti);
} catch (feil) {
  console.error(feil instanceof Error ? feil.message : String(feil));
  process.exit(1);
}

// --- Kandidaten -------------------------------------------------------------

/**
 * En kandidat er bare «velg en handling i denne stillingen», pluss en
 * `nyKamp` for de agentene som har kamphukommelse. Frøet gis per kamp så
 * PIMC-varianten er reproduserbar.
 */
interface Kandidat {
  readonly navn: string;
  nyKamp(frø: number): void;
  velg(state: GameState): Handling;
}

function lagKandidat(spec: string): Kandidat {
  // «vakt:<flagg>:<indre>» – konvensjonsvakten (src/moe2/konvensjonsvakt.ts)
  // lagt utenpå en hvilken som helst annen kandidat.
  const vakt = delVaktspek(spec);
  if (vakt !== null) {
    const indre = lagKandidat(vakt.indre);
    const pakket = new Konvensjonsvakt({ velgHandling: (s) => indre.velg(s) }, vakt.valg);
    return {
      navn: spec,
      nyKamp: (frø) => indre.nyKamp(frø),
      velg: (s) => pakket.velgHandling(s),
    };
  }
  if (spec === "pimc") {
    let opts: BotOpts = { tidsbudsjettMs: tidMs, terskel: 7 };
    return {
      navn: spec,
      nyKamp: (frø) => {
        opts = { tidsbudsjettMs: tidMs, terskel: 7, frø };
      },
      velg: (s) => pimcVelg(s, opts),
    };
  }
  if (spec === "graadig") {
    return { navn: spec, nyKamp: () => {}, velg: (s) => grådigHandling(s) };
  }
  if (spec === "nevro") {
    const agent = new NevroAgent();
    return { navn: spec, nyKamp: () => agent.nyKamp(), velg: (s) => agent.velgHandling(s) };
  }
  if (spec.startsWith("e1:")) {
    const agent = E1Agent.fraFil(spec.slice(3));
    return { navn: spec, nyKamp: () => agent.nyKamp(), velg: (s) => agent.velgHandling(s) };
  }
  // «sd:<motpart>» – SD-evalueringen SOM POLICY, med motstandermodellen oppgitt
  // eksplisitt: `sd:nevro` er dagens konfigurasjon, `sd:e1:<klonefil>` bytter
  // den ut med en klone av MesterAI. Dette er den eneste veien til å måle hva
  // motstandermodellen i SD er verdt uten å gå om en hel treningsrunde.
  if (spec.startsWith("sd:")) {
    const { motpart, egen } = delSDSpek(spec.slice(3));
    let agent = new SDAgent(motpart, { verdener: sdVerdener, egen });
    return {
      navn: spec,
      nyKamp: (frø) => {
        // Nytt frø per kamp, men SAMME frø for begge kandidatene i et par:
        // verdenstrekningen skal ikke være en kilde til forskjell mellom to
        // motstandermodeller som måles mot hverandre.
        agent = new SDAgent(motpart, { verdener: sdVerdener, egen, frø });
      },
      velg: (s) => agent.velgHandling(s),
    };
  }
  throw new Error(`Ukjent kandidat «${spec}» (bruk nevro, e1:<fil>, sd:<motpart>, pimc eller graadig)`);
}

const kandidat = lagKandidat(kandidatNavn);

// --- Én kamp ----------------------------------------------------------------

interface KampResultat {
  readonly poeng: number[];
  readonly runder: number;
  readonly vinnerSete: number;
  readonly budrunder: { mester: number; kandidat: number };
  readonly klarte: { mester: number; kandidat: number };
}

async function spillKamp(
  adapter: Adapter,
  frø: number,
  mesterSeter: readonly number[],
  kampFrø: number,
): Promise<KampResultat> {
  const erMester = (sete: number): boolean => mesterSeter.includes(sete);
  kandidat.nyKamp(kampFrø);

  await adapter.send({ type: "nyKamp", mesterSeter: [...mesterSeter] });
  let state = opprettSpill({}, frø);
  await adapter.send(rundeStart(state));

  let runder = 0;
  const budrunder = { mester: 0, kandidat: 0 };
  const klarte = { mester: 0, kandidat: 0 };

  // Guard mot en uendelig løkke om motoren skulle stå stille; 20000 handlinger
  // er langt over en full kamp til 100 poeng.
  let guard = 0;
  while (state.fase !== "FERDIG" && guard++ < 20_000) {
    if (state.fase === "RUNDE_SLUTT") {
      const res = utfør(state, { type: "NESTE" });
      state = res.state;
      for (const h of res.hendelser) {
        if (h.type === "NY_RUNDE") await adapter.send(rundeStart(state));
      }
      continue;
    }

    const aktør = state.fase === "VRAK" || state.fase === "VELG" ? state.budvinner! : state.iTur!;

    let handling: Handling;
    if (erMester(aktør)) {
      const svar = await adapter.send({ type: "beslutt", sete: aktør });
      handling = handlingFraJson(svar.handling!);
    } else {
      handling = kandidat.velg(state);
    }

    const res = utfør(state, handling);
    state = res.state;
    const svar = await adapter.send({ type: "handling", handling: handlingTilJson(handling) });
    // Stopper kjøringen ved avvik i stedet for å levere et ugyldig resultat.
    sjekkSynk(state, svar, `runde ${state.rundeNr}, ${handling.type} fra sete ${aktør}`);

    for (const h of res.hendelser) {
      if (h.type === "RUNDE_SLUTT") {
        runder++;
        const side = erMester(h.resultat.budvinner) ? "mester" : "kandidat";
        budrunder[side]++;
        if (h.resultat.klart) klarte[side]++;
      }
      if (h.type === "NY_RUNDE") await adapter.send(rundeStart(state));
    }
  }

  return {
    poeng: state.totalPoeng.slice(),
    runder,
    vinnerSete: state.vinner ?? -1,
    budrunder,
    klarte,
  };
}

// --- Turneringen ------------------------------------------------------------

async function hoved(): Promise<void> {
  const adapter = new Adapter(adapterKmd);
  // Med --verdener sendes minVerdener = maksVerdener, og tidsfristen settes så
  // høyt at den aldri kan kutte søket kort. Da er arbeidsmengden per kortvalg
  // uavhengig av maskinlasten (se hodekommentaren).
  await adapter.send({
    type: "init",
    mesterSeter: [],
    tidsbudsjettMs: låsteVerdener > 0 ? 3_600_000 : tidMs,
    ...(låsteVerdener > 0
      ? { minVerdener: låsteVerdener, maksVerdener: låsteVerdener }
      : {}),
  });

  mkdirSync(dirname(utSti), { recursive: true });
  console.log(
    `MesterAI-h2h: ${kandidat.navn} mot MesterAI, par [${parFra}, ${parTil}), ` +
      `frøbase ${frøBase}, ` +
      (låsteVerdener > 0 ? `${låsteVerdener} verdener per kortvalg (låst)` : `${tidMs} ms per kortvalg`) +
      `\n→ ${utSti}\n`,
  );

  for (let p = parFra; p < parTil; p++) {
    const frø = frøBase + p;
    for (let side = 0; side < 2; side++) {
      const mesterSeter = side === 0 ? [0, 2] : [1, 3];
      const start = Date.now();
      const res = await spillKamp(adapter, frø, mesterSeter, frø * 4 + side);
      const sekunder = (Date.now() - start) / 1000;

      const mesterPoeng = mesterSeter.reduce((sum, s) => sum + (res.poeng[s] ?? 0), 0);
      const kandidatPoeng = res.poeng.reduce((a, b) => a + b, 0) - mesterPoeng;

      appendFileSync(
        utSti,
        JSON.stringify({
          tid: new Date().toISOString(),
          kandidat: kandidat.navn,
          par: p,
          side,
          froe: frø,
          mesterSeter,
          // Begge feltene logges så en linje alene sier hvilken MesterAI som spilte.
          ms: låsteVerdener > 0 ? null : tidMs,
          verdener: låsteVerdener > 0 ? låsteVerdener : null,
          poeng: res.poeng,
          mesterPoeng,
          kandidatPoeng,
          runder: res.runder,
          vinnerSete: res.vinnerSete,
          mesterVant: mesterSeter.includes(res.vinnerSete),
          budrunder: res.budrunder,
          klarte: res.klarte,
          sekunder: Math.round(sekunder * 10) / 10,
        }) + "\n",
      );

      console.log(
        `par ${p} side ${side} (frø ${frø}, MesterAI på ${mesterSeter.join("+")}): ` +
          `mester ${mesterPoeng} – ${kandidatPoeng} ${kandidat.navn}, ` +
          `${res.runder} runder, ${sekunder.toFixed(0)} s`,
      );
    }
  }

  adapter.stopp();
  console.log(`\nFerdig. Rapport: node examples/mesterai-h2h-rapport.ts ${utSti}`);
}

hoved().catch((feil: unknown) => {
  console.error(feil);
  process.exit(1);
});
