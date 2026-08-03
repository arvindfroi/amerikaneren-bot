/**
 * HVOR i runden vinner MesterAI poengene sine? Rolledekomponering + budorakel.
 *
 * BAKGRUNNEN, fra h2h-loggene (analyse/h2h-*.jsonl, ~110 kamper hver):
 *   - Begge sider vinner omtrent halvparten av budrundene (1145 mot 1106 for
 *     nevro, 1127 mot 1111 for sd-r1). MesterAI byr oss altså IKKE ut.
 *   - Men MesterAI innfrir 73–74 % av kontraktene sine mot våre 64–65 %.
 *   - Atferdsprofilen viser at vi byr likt i samme stilling: 7,23 mot 7,20.
 * Hypotesen som følger: gapet ligger i SPILLEFØRING, ikke i budgivning.
 * Dette skriptet skaffer tallene som bekrefter eller avkrefter den.
 *
 * METODEN – hele kamper, men logget PER RUNDE
 *   Oppsettet er nøyaktig `examples/mesterai-h2h.ts`: MesterAI får to seter,
 *   kandidaten de to andre, og kamp 2p/2p+1 deler frø med byttede seter så
 *   kort- og posisjonsflaks nulles ut parvis. Forskjellen er at vi ikke bare
 *   logger sluttsummen, men hver enkelt runde:
 *
 *     - hvem som var spillefører, budet, lagstikk, innfridd
 *     - `delta` – poengene HVERT SETE fikk den runden (motorens egen tabell)
 *     - SD-orakelets bud for alle fire seter, regnet på den samme giva
 *     - hver eneste budbeslutning, med BÅDE MesterAIs og kandidatens svar
 *
 *   Rapporten (examples/mesterai-fasegap-rapport.ts) deler så totalgapet på
 *   ROLLE. Det er eksakt: hver sete-runde har nøyaktig én rolle, så summen av
 *   rollebøttene ER poengsummen. Nøyaktig denne oppdelingen viste mot nevro at
 *   spillefører var 6 % av rundene men 36 % av tapet.
 *
 * HVORFOR BUDENE KAN SAMMENLIKNES PARRET
 *   Adapteren har `{"type":"beslutt","sete":n}`: den spør MesterAI hva den
 *   ville gjort UTEN å utføre det. Ved hver eneste budbeslutning spør vi
 *   derfor BÅDE MesterAI OG kandidaten, uansett hvem som eier setet, og
 *   utfører bare seteeierens svar. Begge har sett den identiske stillingen.
 *   For at det skal virke registreres MesterAI-bots på ALLE FIRE setene
 *   (`nyKamp` med `mesterSeter: [0,1,2,3]`) – adapteren nekter å beslutte for
 *   et sete den ikke har en bot på. Det endrer ingenting om hvem som SPILLER:
 *   linja drives utelukkende av `handling`-meldingene fra vår motor.
 *
 *   Merk likevel: skyggespørsmålene forbruker MesterAIs egen verdenstrekning,
 *   så kampen blir ikke bit-identisk med en ren h2h-kjøring på samme frø. Den
 *   er like gyldig – bare ikke den samme.
 *
 * SD-ORAKELET er `analyserGiv` + `sdBud` fra src/neat/singledummy.ts: giva
 * spilles ut fra hvert sete med NevroHjerne i alle fire, og lagstikkene som
 * kommer ut ER estimatet. Det er den ENE budfasiten som har bestått porten
 * (korrigert korrelasjon 0,925), og SD-budpolicyen er målt til +3,89
 * poeng/runde over nevros bud. Analysen caches på (frø, rundeNr), så begge
 * kampene i et par deler kostnaden.
 *
 * KJØRING (adapteren må være bygget – se arena/README.md)
 *   node examples/mesterai-fasegap.ts --kandidat e1:e1-modell/sd-r2.bin \
 *        --par 8 --adapter wsl:/home/arvind/arena-adapter/.build/release/adapter \
 *        --ut analyse/fasegap-sdr2.jsonl
 *
 * | Flagg | Standard | Betydning |
 * |---|---|---|
 * | `--kandidat` | nevro | `nevro`, `e1:<fil>`, `pimc` eller `graadig` |
 * | `--par` | 8 | antall speilede par (= 2 kamper hver) |
 * | `--froe` | 770000 | frøbase; par p bruker frø `froe + p` |
 * | `--parfra`/`--partil` | – | skard: kjør bare parene [fra, til) |
 * | `--maksRunder` | 0 | > 0: stopp kampen etter så mange runder (0 = til 100 poeng) |
 * | `--ms` | 450 | tidsbudsjett per kortvalg for MesterAI |
 * | `--verdener` | – | låser MesterAIs min/maksVerdener; gjør målingen lastuavhengig |
 * | `--adapter` | arena/adapter/.build/release/adapter | adapterbinær, `wsl:`-prefiks |
 * | `--ut` | analyse/mesterai-fasegap.jsonl | VARIG logg: én linje per RUNDE |
 *
 * MASKINLAST – les dette før du tolker et tall. MesterAIs søk stopper når
 * `verdener >= maksVerdener`, ELLER når `verdener >= minVerdener` og
 * tidsbudsjettet er brukt opp. Står det treningsjobber og spiser kjerner
 * rekker MesterAI færre verdener på de samme 450 ms og spiller SVAKERE. Et
 * tall målt med `--ms` på en lastet maskin er derfor et NEDRE anslag på
 * MesterAIs styrke. Derfor måles CPU-lasten her og skrives i HVER linje
 * (`cpuLast`, andel av alle kjerner opptatt siden kjøringen startet), slik at
 * ingen kan lese tallet uten å se hva maskinen holdt på med.
 *
 * Utfila skrives med appendFileSync ETTER hver runde. En flertimers måling som
 * avbrytes mister derfor bare den runden som var i gang – aldri alt.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { cpus } from "node:os";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/motor.ts";
import { velgHandling as pimcVelg, type BotOpts } from "../src/bot/bot.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { analyserGiv, sdBud } from "../src/neat/singledummy.ts";
import { grådigHandling } from "./graadig.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { Budagent, lesBudmodell } from "../src/moe2/budagent.ts";
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
const frøBase = flagg("froe", 770000);
const parFra = flagg("parfra", 0);
const parTil = flagg("partil", antallPar);
const maksRunder = flagg("maksRunder", 0);
const tidMs = flagg("ms", 450);
/** 0 = ikke oppgitt: da styrer tidsbudsjettet alene, som i appen. */
const låsteVerdener = flagg("verdener", 0);
const adapterSti = tekstFlagg("adapter", "arena/adapter/.build/release/adapter");
const utSti = tekstFlagg("ut", "analyse/mesterai-fasegap.jsonl");

let adapterKmd: AdapterKommando;
try {
  adapterKmd = løsAdapter(adapterSti);
} catch (feil) {
  console.error(feil instanceof Error ? feil.message : String(feil));
  process.exit(1);
}

// --- Maskinlast -------------------------------------------------------------
//
// Ikke pynt: MesterAI er tidsbudsjettert, så et tall målt på en lastet maskin
// er et nedre anslag på styrken dens. Andelen opptatte kjerner siden start
// legges derfor på hver eneste linje.

function cpuØyeblikk(): { tomgang: number; total: number } {
  let tomgang = 0;
  let total = 0;
  for (const c of cpus()) {
    const t = c.times;
    tomgang += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { tomgang, total };
}
const cpuStart = cpuØyeblikk();
const antallKjerner = cpus().length;

/** Andel av alle kjerner som har vært opptatt siden kjøringen startet. */
function cpuLast(): number {
  const nå = cpuØyeblikk();
  const dt = nå.total - cpuStart.total;
  if (dt <= 0) return NaN;
  return Math.round(1000 * (1 - (nå.tomgang - cpuStart.tomgang) / dt)) / 1000;
}

// --- Kandidaten -------------------------------------------------------------

interface Kandidat {
  readonly navn: string;
  nyKamp(frø: number): void;
  velg(state: GameState): Handling;
}

function lagKandidat(spec: string): Kandidat {
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
  /**
   * `vakt:<flagg>:<indre>` og `budm:<modellfil>:<indre>`, nøstet.
   *
   * HVORFOR DETTE MÅ INN. Da denne analysen ble kjørt 2026-08-01 var
   * kandidaten det RÅ nettet, og seksjon 2B konkluderte med at «budgivningen
   * kan ikke forklare noe som helst av gapet» – fordi begge sider brukte
   * NevroHjerne til budet, og de 3 223 tallbudene var IDENTISKE.
   *
   * Nøyaktig den identiteten er brutt siden. Budmodellen måler +0,618 ± 0,166
   * mot MesterAI, og dagens Adams er `budm:...:vakt:abmp:e1:sd-r2.bin`. Uten
   * disse to formene kan verktøyet ikke se boten vi faktisk har, og
   * rolledekomponeringen ville beskrevet en bot vi ikke lenger spiller.
   */
  if (spec.startsWith("vakt:")) {
    const v = delVaktspek(spec);
    if (v === null) throw new Error(`Ugyldig vaktspek «${spec}»`);
    const indre = lagKandidat(v.indre);
    const vakt = new Konvensjonsvakt(
      { velgHandling: (s) => indre.velg(s), nyKamp: () => indre.nyKamp(0) },
      v.valg,
    );
    return { navn: spec, nyKamp: (frø) => indre.nyKamp(frø), velg: (s) => vakt.velgHandling(s) };
  }
  if (spec.startsWith("budm:")) {
    const rest = spec.slice(5);
    const skille = rest.indexOf(":");
    if (skille < 0) throw new Error(`Ugyldig budm-spek «${spec}» – forventet budm:<modellfil>:<indre>`);
    const indre = lagKandidat(rest.slice(skille + 1));
    const bud = new Budagent(
      { velgHandling: (s) => indre.velg(s), nyKamp: () => indre.nyKamp(0) },
      lesBudmodell(rest.slice(0, skille)),
    );
    return { navn: spec, nyKamp: (frø) => indre.nyKamp(frø), velg: (s) => bud.velgHandling(s) };
  }
  throw new Error(
    `Ukjent kandidat «${spec}» (bruk nevro, e1:<fil>, pimc, graadig, vakt:<flagg>:<indre> eller budm:<fil>:<indre>)`,
  );
}

const kandidat = lagKandidat(kandidatNavn);

/** Utspilleren SD-orakelet bruker i alle fire seter. Deterministisk og tilstandsløs. */
const nevroOrakel = new NevroAgent();

// --- Én budbeslutning -------------------------------------------------------

type Budverdi = number | "PASS" | "AMERIKANER" | "SOLO";

interface Budlogg {
  /** Setet som var i tur. */
  readonly sete: number;
  /** Eide vi setet, eller MesterAI? */
  readonly side: "vaar" | "mester";
  /** Budet som faktisk ble utført (seteeierens). */
  readonly faktisk: Budverdi;
  /** Hva MesterAI ville bydd i denne stillingen. */
  readonly mester: Budverdi | null;
  /** Hva kandidaten ville bydd i den SAMME stillingen. */
  readonly kandidat: Budverdi | null;
  /** SD-orakelets bud for dette setet på denne giva. */
  readonly sd: number;
  /** Nummeret på beslutningen i runden (0 = første). */
  readonly nr: number;
}

// --- Én kamp ----------------------------------------------------------------

interface Rundelogg {
  readonly rundeNr: number;
  readonly budvinner: number;
  readonly makker: number | null;
  readonly budType: "tall" | "amerikaner" | "solo";
  readonly bud: number | null;
  readonly lagStikk: number;
  readonly klart: boolean;
  readonly delta: number[];
  readonly stikkVunnet: number[];
  readonly sd: number[];
  readonly sdRaa: number[];
  readonly sdStd: number;
  readonly budlogg: Budlogg[];
  readonly sekunder: number;
}

/** Alt vi trenger å vite om giva før noen har bydd. */
interface Givanalyse {
  readonly rundeNr: number;
  readonly sd: number[];
  readonly raa: number[];
  readonly std: number;
}

function analyserRunde(state: GameState): Givanalyse {
  const a = analyserGiv(state, nevroOrakel);
  const T = state.giving.antallStikk;
  const sd: number[] = [];
  for (let sete = 0; sete < state.antallSpillere; sete++) sd.push(sdBud(a, sete, T));
  return { rundeNr: state.rundeNr, sd, raa: a.sd.slice(), std: a.std };
}

function budetI(h: Handling | null): Budverdi | null {
  return h !== null && h.type === "BUD" ? h.bud : null;
}

async function spillKamp(
  adapter: Adapter,
  frø: number,
  mesterSeter: readonly number[],
  kampFrø: number,
  skriv: (r: Rundelogg) => void,
): Promise<{ poeng: number[]; runder: number; vinnerSete: number }> {
  const erMester = (sete: number): boolean => mesterSeter.includes(sete);
  kandidat.nyKamp(kampFrø);

  // ALLE fire seter får en MesterAI-bot registrert. Det er ikke det samme som
  // at MesterAI spiller dem – linja drives av `handling`-meldingene – men uten
  // det nekter adapteren å svare på `beslutt` for våre seter, og da faller den
  // parrede budsammenlikningen bort. Se hodekommentaren.
  await adapter.send({ type: "nyKamp", mesterSeter: [0, 1, 2, 3] });
  let state = opprettSpill({}, frø);
  await adapter.send(rundeStart(state));

  let runder = 0;
  let giv: Givanalyse | null = null;
  let budlogg: Budlogg[] = [];
  let rundeStartTid = Date.now();

  let guard = 0;
  while (state.fase !== "FERDIG" && guard++ < 20_000) {
    if (maksRunder > 0 && runder >= maksRunder) break;

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

    if (state.fase === "BUDRUNDE") {
      // Ny runde? Da regnes SD-orakelet for giva én gang, før noen har bydd.
      if (giv === null || giv.rundeNr !== state.rundeNr) {
        giv = analyserRunde(state);
        budlogg = [];
        rundeStartTid = Date.now();
      }

      // Begge svarer på den identiske stillingen; bare seteeierens svar utføres.
      let mesterH: Handling | null = null;
      try {
        const svar = await adapter.send({ type: "beslutt", sete: aktør });
        mesterH = handlingFraJson(svar.handling!);
      } catch {
        mesterH = null;
      }
      let kandH: Handling | null = null;
      try {
        kandH = kandidat.velg(state);
      } catch {
        kandH = null;
      }

      const eier = erMester(aktør) ? mesterH : kandH;
      if (eier === null) throw new Error(`Ingen budbeslutning for sete ${aktør}`);
      handling = eier;

      budlogg.push({
        sete: aktør,
        side: erMester(aktør) ? "mester" : "vaar",
        faktisk: budetI(handling)!,
        mester: budetI(mesterH),
        kandidat: budetI(kandH),
        sd: giv.sd[aktør]!,
        nr: budlogg.length,
      });
    } else if (erMester(aktør)) {
      const svar = await adapter.send({ type: "beslutt", sete: aktør });
      handling = handlingFraJson(svar.handling!);
    } else {
      handling = kandidat.velg(state);
    }

    const res = utfør(state, handling);
    state = res.state;
    const svar = await adapter.send({ type: "handling", handling: handlingTilJson(handling) });
    sjekkSynk(state, svar, `runde ${state.rundeNr}, ${handling.type} fra sete ${aktør}`);

    for (const h of res.hendelser) {
      if (h.type === "RUNDE_SLUTT") {
        runder++;
        const r = h.resultat;
        const g = giv;
        skriv({
          rundeNr: state.rundeNr,
          budvinner: r.budvinner,
          makker: r.makker,
          budType: r.melding.type,
          bud: r.melding.type === "tall" ? r.melding.bud : null,
          lagStikk: r.lagStikk,
          klart: r.klart,
          delta: r.delta.slice(),
          stikkVunnet: r.stikkVunnet.slice(),
          sd: g === null ? [] : g.sd,
          sdRaa: g === null ? [] : g.raa,
          sdStd: g === null ? NaN : g.std,
          budlogg,
          sekunder: Math.round((Date.now() - rundeStartTid) / 100) / 10,
        });
        giv = null;
      }
      if (h.type === "NY_RUNDE") await adapter.send(rundeStart(state));
    }
  }

  return { poeng: state.totalPoeng.slice(), runder, vinnerSete: state.vinner ?? -1 };
}

// --- Turneringen ------------------------------------------------------------

async function hoved(): Promise<void> {
  const adapter = new Adapter(adapterKmd);
  await adapter.send({
    type: "init",
    mesterSeter: [],
    tidsbudsjettMs: låsteVerdener > 0 ? 3_600_000 : tidMs,
    ...(låsteVerdener > 0 ? { minVerdener: låsteVerdener, maksVerdener: låsteVerdener } : {}),
  });

  mkdirSync(dirname(utSti), { recursive: true });
  console.log(
    `Fasegap: ${kandidat.navn} mot MesterAI, par [${parFra}, ${parTil}), frøbase ${frøBase}, ` +
      (låsteVerdener > 0 ? `${låsteVerdener} verdener per kortvalg (låst)` : `${tidMs} ms per kortvalg`) +
      `\n${antallKjerner} logiske kjerner; CPU-lasten skrives i hver linje` +
      `\n→ ${utSti}\n`,
  );

  const start = Date.now();
  let totaltRunder = 0;

  for (let p = parFra; p < parTil; p++) {
    const frø = frøBase + p;
    for (let side = 0; side < 2; side++) {
      const mesterSeter = side === 0 ? [0, 2] : [1, 3];
      const kampStart = Date.now();

      const res = await spillKamp(adapter, frø, mesterSeter, frø * 4 + side, (r) => {
        totaltRunder++;
        appendFileSync(
          utSti,
          JSON.stringify({
            tid: new Date().toISOString(),
            kandidat: kandidat.navn,
            par: p,
            side,
            froe: frø,
            mesterSeter,
            ms: låsteVerdener > 0 ? null : tidMs,
            verdener: låsteVerdener > 0 ? låsteVerdener : null,
            cpuLast: cpuLast(),
            kjerner: antallKjerner,
            ...r,
          }) + "\n",
        );
      });

      const mesterPoeng = mesterSeter.reduce((sum, s) => sum + (res.poeng[s] ?? 0), 0);
      const kandidatPoeng = res.poeng.reduce((a, b) => a + b, 0) - mesterPoeng;
      console.log(
        `par ${p} side ${side} (frø ${frø}, MesterAI på ${mesterSeter.join("+")}): ` +
          `mester ${mesterPoeng} – ${kandidatPoeng} ${kandidat.navn}, ${res.runder} runder, ` +
          `${((Date.now() - kampStart) / 1000).toFixed(0)} s, CPU ${(100 * cpuLast()).toFixed(0)} %, ` +
          `${totaltRunder} runder logget, ${((Date.now() - start) / 60000).toFixed(1)} min brukt`,
      );
    }
  }

  adapter.stopp();
  console.log(
    `\nFerdig: ${totaltRunder} runder på ${((Date.now() - start) / 60000).toFixed(1)} min.` +
      `\nRapport: node examples/mesterai-fasegap-rapport.ts ${utSti}`,
  );
}

hoved().catch((feil: unknown) => {
  console.error(feil);
  process.exit(1);
});
