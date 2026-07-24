/**
 * Benchmark: alle botene i begge repoene på samme målestokk.
 *
 * Målemetoden er den samme som app-repoets egen harness (`harness styrke`):
 * hver kandidatbot spiller ÉN mot 3× Vanskelig (appens heuristikk-anker) i
 * hele kamper til 100 poeng. Kandidaten roterer gjennom alle fire seter, og
 * alle kandidatene møter de samme giverne (delte frø), så rangeringen er en
 * parvis sammenlikning med minst mulig kort- og posisjonsflaks.
 *
 * Botene:
 *   Denne motoren (TypeScript, avgjøres lokalt):
 *     pimc        PIMC-boten (determinisert dobbelt-dummy), tidsbudsjett
 *     pimc-rask   PIMC med få verdener/lav terskel (rask)
 *     gammel      heuristikk uten søk (referanse fra turnering.ts)
 *   Amerikaneren-App (Swift, via arena-adapteren):
 *     mester      MesterAI på President-nivå (søk + NevroHjerne)
 *     nevro       det rene nevrale nettet (bud/bytte/spill; heuristisk trumf)
 *     vanskelig   heuristikk «Vanskelig» – ANKERET
 *     middels     heuristikk «Middels»
 *     lett        heuristikk «Lett»
 *
 * Metrikk per bot: snittpoeng per kamp, vinnerandel (kandidaten når 100
 * først), og budtreff (andel vunne budrunder som ble innfridd). Anker-
 * kalibrering: «vanskelig» mot 3× vanskelig bør lande nær nøytralt.
 *
 * Kjøring (krever bygget adapter, se arena/README.md):
 *   node examples/benchmark.ts [--instant 40] [--sok 12] [--ms 50]
 *                              [--froe 90000] [--kun pimc,mester,...]
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { FARGER, type Farge, fraKortId, kortId, type Kort } from "../src/kort.ts";
import {
  type GameState,
  type Handling,
  type Hendelse,
  lovligeKort,
  opprettSpill,
  utfør,
} from "../src/motor.ts";
import { velgHandling, type BotOpts } from "../src/bot/bot.ts";

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

type BotType =
  | "pimc"
  | "pimc-rask"
  | "gammel"
  | "mester"
  | "nevro"
  | "vanskelig"
  | "middels"
  | "lett";

const NATIVE: ReadonlySet<BotType> = new Set(["pimc", "pimc-rask", "gammel"]);
const SØK: ReadonlySet<BotType> = new Set(["pimc", "pimc-rask", "mester"]);

const ANKER: BotType = "vanskelig";

interface BotInfo {
  readonly type: BotType;
  readonly navn: string;
  readonly kilde: "motor" | "app";
}

const ROSTER: BotInfo[] = [
  { type: "pimc", navn: "PIMC (denne motoren)", kilde: "motor" },
  { type: "pimc-rask", navn: "PIMC-rask", kilde: "motor" },
  { type: "gammel", navn: "Heuristikk uten søk", kilde: "motor" },
  { type: "mester", navn: "MesterAI (President)", kilde: "app" },
  { type: "nevro", navn: "NevroHjerne (nett)", kilde: "app" },
  { type: "vanskelig", navn: "Vanskelig (anker)", kilde: "app" },
  { type: "middels", navn: "Middels", kilde: "app" },
  { type: "lett", navn: "Lett", kilde: "app" },
];

// ---------------------------------------------------------------------------
// Kommandolinje
// ---------------------------------------------------------------------------

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

const instantSpill = flagg("instant", 40);
const søkSpill = flagg("sok", 12);
const tidMs = flagg("ms", 50);
const frøBase = flagg("froe", 90000);
const adapterSti = tekstFlagg("adapter", "arena/adapter/.build/release/adapter");
const kunArg = tekstFlagg("kun", "");
const kun = kunArg ? new Set(kunArg.split(",")) : null;

if (!existsSync(adapterSti)) {
  console.error(`Fant ikke adapteren på ${adapterSti}. Bygg den – se arena/README.md.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Adapterprosessen (samme protokoll som examples/arena.ts)
// ---------------------------------------------------------------------------

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
  private readonly kø: { løs: (s: AdapterSvar) => void; avvis: (e: Error) => void }[] = [];

  constructor(binær: string) {
    this.proc = spawn(binær, [], { stdio: ["pipe", "pipe", "inherit"] });
    const rl = createInterface({ input: this.proc.stdout });
    rl.on("line", (linje: string) => {
      const neste = this.kø.shift();
      if (!neste) return;
      try {
        neste.løs(JSON.parse(linje) as AdapterSvar);
      } catch (e) {
        neste.avvis(new Error(`Uleselig adaptersvar: ${linje} (${String(e)})`));
      }
    });
    this.proc.on("exit", (kode: number | null) => {
      for (const venter of this.kø.splice(0)) venter.avvis(new Error(`Adapteren avsluttet (kode ${kode})`));
    });
  }

  async send(melding: object): Promise<AdapterSvar> {
    const svar = await new Promise<AdapterSvar>((løs, avvis) => {
      this.kø.push({ løs, avvis });
      this.proc.stdin.write(`${JSON.stringify(melding)}\n`);
    });
    if (svar.type === "feil") throw new Error(`Adapterfeil: ${svar.melding}`);
    return svar;
  }

  stopp(): void {
    this.proc.stdin.write(`${JSON.stringify({ type: "avslutt" })}\n`);
    setTimeout(() => this.proc.kill(), 500).unref();
  }
}

// ---------------------------------------------------------------------------
// Handlinger over ledningen
// ---------------------------------------------------------------------------

function handlingTilJson(h: Handling): Record<string, unknown> {
  switch (h.type) {
    case "BUD":
      return { type: "BUD", spiller: h.spiller, bud: h.bud };
    case "VRAK":
      return { type: "VRAK", spiller: h.spiller, kort: h.kort.map(kortId) };
    case "VELG":
      return { type: "VELG", spiller: h.spiller, trumf: h.trumf, etterlyst: h.etterlyst ? kortId(h.etterlyst) : null };
    case "SPILL":
      return { type: "SPILL", spiller: h.spiller, kort: kortId(h.kort) };
    case "NESTE":
      throw new Error("NESTE sendes aldri til adapteren");
  }
}

function handlingFraJson(j: Record<string, unknown>): Handling {
  const spiller = j.spiller as number;
  switch (j.type as string) {
    case "BUD":
      return { type: "BUD", spiller, bud: j.bud as number | "PASS" | "AMERIKANER" | "SOLO" };
    case "VRAK":
      return { type: "VRAK", spiller, kort: (j.kort as string[]).map(fraKortId) };
    case "VELG":
      return {
        type: "VELG",
        spiller,
        trumf: j.trumf as Farge,
        etterlyst: j.etterlyst == null ? null : fraKortId(j.etterlyst as string),
      };
    case "SPILL":
      return { type: "SPILL", spiller, kort: fraKortId(j.kort as string) };
    default:
      throw new Error(`Ukjent handlingstype fra adapteren: ${String(j.type)}`);
  }
}

const FASE_PAR: Record<string, string[]> = {
  BUDRUNDE: ["budrunde"],
  VRAK: ["byttekort"],
  VELG: ["velgTrumf"],
  SPILL: ["spill"],
  RUNDE_SLUTT: ["rundeFerdig", "spillFerdig"],
  FERDIG: ["spillFerdig"],
};

function sjekkSynk(state: GameState, svar: AdapterSvar): void {
  if (!svar.fase || !(FASE_PAR[state.fase] ?? []).includes(svar.fase)) {
    throw new Error(`DESYNK: motoren i ${state.fase}, adapteren i ${svar.fase}`);
  }
  const poeng = svar.poeng ?? [];
  for (let s = 0; s < state.antallSpillere; s++) {
    if ((poeng[s] ?? 0) !== (state.totalPoeng[s] ?? 0)) {
      throw new Error(`DESYNK: poeng ${JSON.stringify(poeng)} vs ${JSON.stringify(state.totalPoeng)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Native (TS) heuristikk-bot – «gammel», identisk med turnering.ts
// ---------------------------------------------------------------------------

function fargeTelling(hånd: readonly Kort[]): Record<Farge, number> {
  const t: Record<Farge, number> = { S: 0, H: 0, R: 0, K: 0 };
  for (const k of hånd) t[k.farge]++;
  return t;
}
function verdiSort(k: Kort, trumf: Farge): number {
  return (k.farge === trumf ? 100 : 0) + k.verdi;
}
function slår(ny: Kort, best: Kort, trumf: Farge, led: Farge): boolean {
  const nT = ny.farge === trumf, bT = best.farge === trumf;
  if (nT && !bT) return true;
  if (!nT && bT) return false;
  if (nT && bT) return ny.verdi > best.verdi;
  if (ny.farge !== led) return false;
  if (best.farge !== led) return true;
  return ny.verdi > best.verdi;
}
function grådigKort(state: GameState, spiller: number): Kort {
  const lov = lovligeKort(state, spiller);
  if (lov.length === 1) return lov[0]!;
  const trumf = state.trumf!;
  if (state.bord.length === 0) {
    return lov.slice().sort((a, b) => verdiSort(b, trumf) - verdiSort(a, trumf))[0]!;
  }
  const ledFarge = state.bord[0]!.kort.farge;
  let best = state.bord[0]!.kort;
  for (const kp of state.bord) if (slår(kp.kort, best, trumf, ledFarge)) best = kp.kort;
  const vinnende = lov.filter((k) => slår(k, best, trumf, ledFarge));
  if (vinnende.length > 0) return vinnende.sort((a, b) => verdiSort(a, trumf) - verdiSort(b, trumf))[0]!;
  return lov.slice().sort((a, b) => verdiSort(a, trumf) - verdiSort(b, trumf))[0]!;
}
function gammelHandling(state: GameState, spiller: number): Handling {
  switch (state.fase) {
    case "BUDRUNDE": {
      const hånd = state.hender[spiller]!;
      const høye = hånd.filter((k) => k.verdi >= 12).length;
      const tel = fargeTelling(hånd);
      const lengst = Math.max(...Object.values(tel));
      const sterk = høye + lengst;
      const kanTall: number[] = [];
      for (let n = 5; n <= state.giving.antallStikk; n++) {
        if (state.budrunde.høyeste === null) kanTall.push(n);
      }
      if (state.budrunde.høyeste === null && kanTall.length && sterk >= 7) {
        return { type: "BUD", spiller, bud: Math.min(...kanTall) };
      }
      return { type: "BUD", spiller, bud: "PASS" };
    }
    case "VRAK": {
      const hånd = state.hender[spiller]!.slice().sort((a, b) => a.verdi - b.verdi);
      return { type: "VRAK", spiller, kort: hånd.slice(0, state.giving.talong) };
    }
    case "VELG": {
      const hånd = state.hender[spiller]!;
      const tel = fargeTelling(hånd);
      const trumf = FARGER.slice().sort((a, b) => tel[b] - tel[a])[0]!;
      const finnes = new Set(hånd.filter((k) => k.farge === trumf).map((k) => k.verdi));
      let et: Kort | null = null;
      for (let v = 14; v >= 2; v--) {
        if (!finnes.has(v as Kort["verdi"])) {
          et = { farge: trumf, verdi: v as Kort["verdi"] };
          break;
        }
      }
      return { type: "VELG", spiller, trumf, etterlyst: et };
    }
    case "SPILL":
      return { type: "SPILL", spiller, kort: grådigKort(state, spiller) };
    default:
      return { type: "NESTE" };
  }
}

function nativeHandling(type: BotType, state: GameState, spiller: number, frø: number): Handling {
  switch (type) {
    case "pimc":
      return velgHandling(state, { tidsbudsjettMs: tidMs, terskel: 7, frø });
    case "pimc-rask":
      return velgHandling(state, { verdener: 10, terskel: 6, frø });
    case "gammel":
      return gammelHandling(state, spiller);
    default:
      throw new Error(`${type} er ikke en native bot`);
  }
}

// ---------------------------------------------------------------------------
// Én kamp: kandidat på seteBot[i]-setene, resten anker
// ---------------------------------------------------------------------------

interface KampStat {
  readonly poeng: number[];
  readonly vinner: number;
  readonly budVunnet: number[];
  readonly budKlart: number[];
  readonly runder: number;
}

async function spillKamp(
  adapter: Adapter,
  frø: number,
  seteBot: BotType[],
): Promise<KampStat> {
  const adapterBots: Record<string, string> = {};
  for (let s = 0; s < 4; s++) if (!NATIVE.has(seteBot[s]!)) adapterBots[String(s)] = seteBot[s]!;

  await adapter.send({ type: "nyKamp", adapterBots });
  let state = opprettSpill({}, frø);
  await adapter.send(rundeStart(state));

  const budVunnet = [0, 0, 0, 0];
  const budKlart = [0, 0, 0, 0];
  let runder = 0;

  const håndter = async (hendelser: Hendelse[]): Promise<void> => {
    for (const h of hendelser) {
      if (h.type === "RUNDE_SLUTT") {
        runder++;
        budVunnet[h.resultat.budvinner]!++;
        if (h.resultat.klart) budKlart[h.resultat.budvinner]!++;
      }
      if (h.type === "NY_RUNDE") await adapter.send(rundeStart(state));
    }
  };

  let vakt = 0;
  while (state.fase !== "FERDIG") {
    if (vakt++ > 40000) throw new Error("kampen henger");
    if (state.fase === "RUNDE_SLUTT") {
      const res = utfør(state, { type: "NESTE" });
      state = res.state;
      await håndter(res.hendelser);
      continue;
    }
    const aktør = state.fase === "VRAK" || state.fase === "VELG" ? state.budvinner! : state.iTur!;
    const type = seteBot[aktør]!;

    let handling: Handling;
    if (NATIVE.has(type)) {
      const frøD = (frø * 131 + aktør * 17 + state.rundeNr * 7 + state.stikkSpilt * 3 + vakt) >>> 0;
      handling = nativeHandling(type, state, aktør, frøD);
    } else {
      const svar = await adapter.send({ type: "beslutt", sete: aktør });
      handling = handlingFraJson(svar.handling!);
    }

    const res = utfør(state, handling);
    state = res.state;
    const svar = await adapter.send({ type: "handling", handling: handlingTilJson(handling) });
    sjekkSynk(state, svar);
    await håndter(res.hendelser);
  }

  return {
    poeng: state.totalPoeng.slice(),
    vinner: state.vinner!,
    budVunnet,
    budKlart,
    runder,
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

// ---------------------------------------------------------------------------
// Benchmark: hver bot mot 3× anker, roterende sete, delte frø
// ---------------------------------------------------------------------------

interface Resultat {
  readonly info: BotInfo;
  spill: number;
  seire: number;
  poengSum: number;
  budVunnet: number;
  budKlart: number;
  sekunder: number;
}

async function benchmarkBot(adapter: Adapter, info: BotInfo, antallSpill: number): Promise<Resultat> {
  const r: Resultat = { info, spill: 0, seire: 0, poengSum: 0, budVunnet: 0, budKlart: 0, sekunder: 0 };
  for (let g = 0; g < antallSpill; g++) {
    const kandidatSete = g % 4;
    const seteBot: BotType[] = [ANKER, ANKER, ANKER, ANKER];
    seteBot[kandidatSete] = info.type;
    const frø = (frøBase + g) >>> 0;

    const start = Date.now();
    const stat = await spillKamp(adapter, frø, seteBot);
    r.sekunder += (Date.now() - start) / 1000;

    r.spill++;
    r.poengSum += stat.poeng[kandidatSete] ?? 0;
    if (stat.vinner === kandidatSete) r.seire++;
    r.budVunnet += stat.budVunnet[kandidatSete] ?? 0;
    r.budKlart += stat.budKlart[kandidatSete] ?? 0;
  }
  return r;
}

async function hoved(): Promise<void> {
  const adapter = new Adapter(adapterSti);
  await adapter.send({ type: "init", adapterBots: {}, tidsbudsjettMs: tidMs });

  const valgte = ROSTER.filter((b) => !kun || kun.has(b.type));
  console.log(
    `Benchmark: ${valgte.length} boter mot 3× ${ANKER}, roterende sete, delte frø (base ${frøBase}).\n` +
      `Spill per bot: ${instantSpill} (instant) / ${søkSpill} (søk), søkebudsjett ${tidMs} ms/kortvalg.\n`,
  );

  const resultater: Resultat[] = [];
  for (const info of valgte) {
    const antall = SØK.has(info.type) ? søkSpill : instantSpill;
    process.stdout.write(`  ${info.navn} … `);
    const r = await benchmarkBot(adapter, info, antall);
    resultater.push(r);
    console.log(
      `${(r.poengSum / r.spill).toFixed(1)} poeng/kamp, vant ${r.seire}/${r.spill} ` +
        `(${(r.sekunder / r.spill).toFixed(1)} s/kamp)`,
    );
  }

  resultater.sort((a, b) => b.poengSum / b.spill - a.poengSum / a.spill);

  const pad = (s: string, n: number): string => (s.length >= n ? s : s + " ".repeat(n - s.length));
  const padV = (s: string, n: number): string => (s.length >= n ? s : " ".repeat(n - s.length) + s);
  console.log("\n=== Rangering (mot 3× " + ANKER + ", høyest snittpoeng først) ===");
  console.log(
    `${pad("Bot", 22)} ${pad("Kilde", 6)} ${padV("Snittpoeng", 10)} ${padV("Vinn%", 6)} ${padV("Bud", 5)} ${padV("Treff%", 7)} ${padV("Spill", 6)}`,
  );
  for (const r of resultater) {
    const snitt = r.poengSum / r.spill;
    const vinn = (100 * r.seire) / r.spill;
    const treff = r.budVunnet > 0 ? (100 * r.budKlart) / r.budVunnet : 0;
    console.log(
      `${pad(r.info.navn, 22)} ${pad(r.info.kilde, 6)} ${padV(snitt.toFixed(1), 10)} ${padV(vinn.toFixed(0), 6)} ${padV(String(r.budVunnet), 5)} ${padV(treff.toFixed(0), 7)} ${padV(String(r.spill), 6)}`,
    );
  }
  console.log(
    `\nAnker-kalibrering: «${ANKER}» mot 3× ${ANKER} bør lande nær nøytralt ` +
      `(snittpoeng ≈ det en gjennomsnittsspiller får i dette feltet).`,
  );

  adapter.stopp();
}

hoved().catch((feil: unknown) => {
  console.error(feil);
  process.exit(1);
});
