/**
 * Arena: denne motorens PIMC-bot mot appens MesterAI («President»-nivået i
 * Amerikaneren-App), hode mot hode i hele kamper til målPoeng.
 *
 * Denne motoren er autoritet: den deler ut kortene, validerer hver handling
 * og fører poeng. En Swift-adapter (arena/adapter) holder appens GameEngine
 * i perfekt synk og svarer med MesterAI-beslutninger for sine seter – med
 * nøyaktig samme informasjon som i appen (aldri andres kort).
 *
 * Rettferdighet: kampene spilles i speilede par – samme frø (samme givere),
 * men setene byttes mellom botene – slik at posisjons- og kortflaks nulles ut.
 *
 * Kjøring (krever at adapteren er bygget, se arena/README.md):
 *   node examples/arena.ts [--kamper 2] [--ms 450] [--froe 20260724]
 *                          [--adapter arena/adapter/.build/release/adapter]
 *
 * --ms er tidsbudsjettet per kortvalg for BEGGE botene (MesterAIs
 * MesterKonfig.tidsbudsjett og vår tidsbudsjettMs).
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { fraKortId, kortId, type Kort } from "../src/kort.ts";
import {
  type GameState,
  type Handling,
  type Hendelse,
  opprettSpill,
  utfør,
} from "../src/motor.ts";
import { velgHandling, type BotOpts } from "../src/bot/bot.ts";

// --- Kommandolinje ---------------------------------------------------------

function flagg(navn: string, standard: number): number {
  const i = process.argv.indexOf(`--${navn}`);
  if (i < 0 || i + 1 >= process.argv.length) return standard;
  const v = Number(process.argv[i + 1]);
  if (!Number.isFinite(v)) throw new Error(`Ugyldig verdi for --${navn}`);
  return v;
}

function tekstFlagg(navn: string, standard: string): string {
  const i = process.argv.indexOf(`--${navn}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1]! : standard;
}

const antallKamper = flagg("kamper", 2);
const tidMs = flagg("ms", 450);
const frøBase = flagg("froe", 20260724);
const adapterSti = tekstFlagg("adapter", "arena/adapter/.build/release/adapter");

if (!existsSync(adapterSti)) {
  console.error(
    `Fant ikke adapteren på ${adapterSti}.\n` +
      "Bygg den først – se arena/README.md – eller pek på den med --adapter.",
  );
  process.exit(1);
}

// --- Adapterprosessen ------------------------------------------------------

interface AdapterSvar {
  readonly type: string;
  readonly fase?: string;
  readonly poeng?: number[];
  readonly iTur?: number;
  readonly handling?: Record<string, unknown>;
  readonly melding?: string;
}

class Adapter {
  private readonly proc: ChildProcessWithoutNullStreams;
  private readonly kø: {
    løs: (svar: AdapterSvar) => void;
    avvis: (feil: Error) => void;
  }[] = [];

  constructor(binær: string) {
    this.proc = spawn(binær, [], { stdio: ["pipe", "pipe", "inherit"] });
    const rl = createInterface({ input: this.proc.stdout });
    rl.on("line", (linje) => {
      const neste = this.kø.shift();
      if (!neste) return;
      try {
        neste.løs(JSON.parse(linje) as AdapterSvar);
      } catch (e) {
        neste.avvis(new Error(`Uleselig adaptersvar: ${linje} (${String(e)})`));
      }
    });
    this.proc.on("exit", (kode) => {
      for (const venter of this.kø.splice(0)) {
        venter.avvis(new Error(`Adapteren avsluttet (kode ${kode})`));
      }
    });
  }

  async send(melding: object): Promise<AdapterSvar> {
    const svar = await new Promise<AdapterSvar>((løs, avvis) => {
      this.kø.push({ løs, avvis });
      this.proc.stdin.write(`${JSON.stringify(melding)}\n`);
    });
    if (svar.type === "feil") {
      throw new Error(`Adapterfeil: ${svar.melding}`);
    }
    return svar;
  }

  stopp(): void {
    this.proc.stdin.write(`${JSON.stringify({ type: "avslutt" })}\n`);
    setTimeout(() => this.proc.kill(), 500).unref();
  }
}

// --- Handlinger over ledningen ---------------------------------------------

function handlingTilJson(h: Handling): Record<string, unknown> {
  switch (h.type) {
    case "BUD":
      return { type: "BUD", spiller: h.spiller, bud: h.bud };
    case "VRAK":
      return { type: "VRAK", spiller: h.spiller, kort: h.kort.map(kortId) };
    case "VELG":
      return {
        type: "VELG",
        spiller: h.spiller,
        trumf: h.trumf,
        etterlyst: h.etterlyst ? kortId(h.etterlyst) : null,
      };
    case "SPILL":
      return { type: "SPILL", spiller: h.spiller, kort: kortId(h.kort) };
    case "NESTE":
      throw new Error("NESTE sendes aldri til adapteren");
  }
}

function handlingFraJson(j: Record<string, unknown>): Handling {
  const type = j.type as string;
  const spiller = j.spiller as number;
  switch (type) {
    case "BUD":
      return { type: "BUD", spiller, bud: j.bud as number | "PASS" | "AMERIKANER" | "SOLO" };
    case "VRAK":
      return { type: "VRAK", spiller, kort: (j.kort as string[]).map(fraKortId) };
    case "VELG":
      return {
        type: "VELG",
        spiller,
        trumf: j.trumf as "S" | "H" | "R" | "K",
        etterlyst: j.etterlyst == null ? null : fraKortId(j.etterlyst as string),
      };
    case "SPILL":
      return { type: "SPILL", spiller, kort: fraKortId(j.kort as string) };
    default:
      throw new Error(`Ukjent handlingstype fra adapteren: ${type}`);
  }
}

// --- Synkkontroll ----------------------------------------------------------

const FASE_PAR: Record<string, string[]> = {
  BUDRUNDE: ["budrunde"],
  VRAK: ["byttekort"],
  VELG: ["velgTrumf"],
  SPILL: ["spill"],
  RUNDE_SLUTT: ["rundeFerdig", "spillFerdig"],
  FERDIG: ["spillFerdig"],
};

function sjekkSynk(state: GameState, svar: AdapterSvar, kontekst: string): void {
  const lovlige = FASE_PAR[state.fase] ?? [];
  if (!svar.fase || !lovlige.includes(svar.fase)) {
    throw new Error(
      `DESYNK (${kontekst}): motoren er i ${state.fase}, adapteren i ${svar.fase}`,
    );
  }
  const poeng = svar.poeng ?? [];
  for (let s = 0; s < state.antallSpillere; s++) {
    if ((poeng[s] ?? 0) !== (state.totalPoeng[s] ?? 0)) {
      throw new Error(
        `DESYNK (${kontekst}): poeng ${JSON.stringify(poeng)} vs ${JSON.stringify(state.totalPoeng)}`,
      );
    }
  }
}

// --- Én kamp ---------------------------------------------------------------

interface KampResultat {
  readonly vinnerSete: number;
  readonly vinnerType: "mester" | "pimc";
  readonly poeng: number[];
  readonly runder: number;
  readonly budrunder: { mester: number; pimc: number };
  readonly klarte: { mester: number; pimc: number };
}

async function spillKamp(
  adapter: Adapter,
  frø: number,
  mesterSeter: number[],
  botOpts: BotOpts,
): Promise<KampResultat> {
  const erMester = (sete: number): boolean => mesterSeter.includes(sete);

  await adapter.send({ type: "nyKamp", mesterSeter });
  let state = opprettSpill({}, frø);
  await adapter.send(rundeStart(state));

  let runder = 0;
  const budrunder = { mester: 0, pimc: 0 };
  const klarte = { mester: 0, pimc: 0 };

  const håndterHendelser = async (hendelser: Hendelse[]): Promise<void> => {
    for (const h of hendelser) {
      if (h.type === "RUNDE_SLUTT") {
        runder++;
        const type = erMester(h.resultat.budvinner) ? "mester" : "pimc";
        budrunder[type]++;
        if (h.resultat.klart) klarte[type]++;
      }
      if (h.type === "NY_RUNDE") {
        await adapter.send(rundeStart(state));
      }
    }
  };

  while (state.fase !== "FERDIG") {
    if (state.fase === "RUNDE_SLUTT") {
      const res = utfør(state, { type: "NESTE" });
      state = res.state;
      await håndterHendelser(res.hendelser);
      continue;
    }

    const aktør =
      state.fase === "VRAK" || state.fase === "VELG" ? state.budvinner! : state.iTur!;

    let handling: Handling;
    if (erMester(aktør)) {
      const svar = await adapter.send({ type: "beslutt", sete: aktør });
      handling = handlingFraJson(svar.handling!);
    } else {
      handling = velgHandling(state, botOpts);
    }

    const res = utfør(state, handling);
    state = res.state;
    const svar = await adapter.send({
      type: "handling",
      handling: handlingTilJson(handling),
    });
    sjekkSynk(state, svar, `runde ${state.rundeNr}, ${handling.type} fra sete ${aktør}`);
    await håndterHendelser(res.hendelser);
  }

  const vinnerSete = state.vinner!;
  return {
    vinnerSete,
    vinnerType: erMester(vinnerSete) ? "mester" : "pimc",
    poeng: state.totalPoeng.slice(),
    runder,
    budrunder,
    klarte,
  };
}

function rundeStart(state: GameState): object {
  return {
    type: "rundeStart",
    hender: state.hender.map((h) => h.map(kortId)),
    talong: state.talong.map(kortId),
    foersteBudgiver: state.iTur,
  };
}

// --- Turnering: speilede par -----------------------------------------------

async function hoved(): Promise<void> {
  const adapter = new Adapter(adapterSti);
  await adapter.send({ type: "init", mesterSeter: [], tidsbudsjettMs: tidMs });

  const botOpts: BotOpts = { tidsbudsjettMs: tidMs, terskel: 7 };

  console.log(
    `Arena: MesterAI (app) mot PIMC-bot (denne motoren) – ${antallKamper} kamper,` +
      ` ${tidMs} ms per kortvalg, frø ${frøBase}\n`,
  );

  let mesterSeire = 0;
  let pimcSeire = 0;
  let mesterPoengSum = 0;
  let pimcPoengSum = 0;
  const budrunder = { mester: 0, pimc: 0 };
  const klarte = { mester: 0, pimc: 0 };

  for (let kamp = 0; kamp < antallKamper; kamp++) {
    // Speilede par: samme frø (samme givere) i partall/oddetall-kampene,
    // men setene byttes – MesterAI på {0,2} i den ene, {1,3} i den andre.
    const frø = frøBase + Math.floor(kamp / 2);
    const mesterSeter = kamp % 2 === 0 ? [0, 2] : [1, 3];
    const opts: BotOpts = { ...botOpts, frø: frø * 4 + (kamp % 2) };

    const start = Date.now();
    const res = await spillKamp(adapter, frø, mesterSeter, opts);
    const sekunder = ((Date.now() - start) / 1000).toFixed(0);

    if (res.vinnerType === "mester") mesterSeire++;
    else pimcSeire++;
    const mesterPoeng = mesterSeter.reduce((sum, s) => sum + (res.poeng[s] ?? 0), 0);
    const pimcPoeng = res.poeng.reduce((sum, p) => sum + p, 0) - mesterPoeng;
    mesterPoengSum += mesterPoeng;
    pimcPoengSum += pimcPoeng;
    budrunder.mester += res.budrunder.mester;
    budrunder.pimc += res.budrunder.pimc;
    klarte.mester += res.klarte.mester;
    klarte.pimc += res.klarte.pimc;

    console.log(
      `Kamp ${kamp + 1}/${antallKamper} (frø ${frø}, MesterAI på ${mesterSeter.join("+")}): ` +
        `${res.vinnerType === "mester" ? "MesterAI" : "PIMC"} vant på sete ${res.vinnerSete} ` +
        `etter ${res.runder} runder [${res.poeng.join(", ")}] (${sekunder} s)`,
    );
  }

  const andel = (a: number, b: number): string =>
    b === 0 ? "–" : `${((100 * a) / b).toFixed(0)} %`;

  console.log("\n=== Resultat ===");
  console.log(`Kampseire:      MesterAI ${mesterSeire} – ${pimcSeire} PIMC`);
  console.log(
    `Snittpoeng/kamp (2 seter): MesterAI ${(mesterPoengSum / antallKamper).toFixed(1)}, ` +
      `PIMC ${(pimcPoengSum / antallKamper).toFixed(1)}`,
  );
  console.log(
    `Budrunder vunnet: MesterAI ${budrunder.mester} (klarte ${andel(klarte.mester, budrunder.mester)}), ` +
      `PIMC ${budrunder.pimc} (klarte ${andel(klarte.pimc, budrunder.pimc)})`,
  );

  adapter.stopp();
}

hoved().catch((feil: unknown) => {
  console.error(feil);
  process.exit(1);
});
