/**
 * Delt klient for arena-adapteren (arena/adapter): snakker NDJSON-protokollen
 * mot Swift-prosessen som driver appens MesterAI. Trukket ut av examples/arena.ts
 * så både referanse-harnessen (examples/mesterai-referanse.ts) og nett-broen
 * (arena/mesterai-bro.ts) kan gjenbruke nøyaktig samme, testede kode.
 *
 * Protokoll (én JSON-linje inn, én ut):
 *   {"type":"init","mesterSeter":[],"tidsbudsjettMs":450}
 *   {"type":"nyKamp","mesterSeter":[0,2]}
 *   {"type":"rundeStart","hender":[[...]],"talong":[...],"foersteBudgiver":n}
 *   {"type":"handling","handling":{...}}   → speiler en utført handling
 *   {"type":"beslutt","sete":n}            → {"type":"handling","handling":{...}}
 *   {"type":"avslutt"}
 */

import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { fraKortId, kortId } from "../src/kort.ts";
import type { GameState, Handling } from "../src/motor.ts";

/** Kommandolinje for adapterprosessen – enten en lokal binær eller WSL-varianten. */
export interface AdapterKommando {
  readonly kommando: string;
  readonly args: string[];
  /** Beskrivelse til feilmeldinger. */
  readonly beskrivelse: string;
}

/**
 * Løser `--adapter`-verdien til noe som kan spawnes, og verifiserer at binæren
 * finnes. To former:
 *
 *   `arena/adapter/.build/release/adapter`  – vanlig sti (Linux/macOS)
 *   `wsl:/home/deg/arena-adapter/.build/release/adapter`
 *       – binæren ligger i WSL. Windows har ingen Swift-toolchain, så
 *         adapteren bygges der og kjøres gjennom `wsl.exe`; NDJSON-protokollen
 *         går like fint over rørene til wsl.exe som til en lokal prosess.
 */
export function løsAdapter(sti: string): AdapterKommando {
  if (sti.startsWith("wsl:")) {
    const wslSti = sti.slice(4);
    // Swift-runtime og de manuelt utpakkede systembibliotekene ligger utenfor
    // standardsøkestien i WSL-oppsettet; sett den før binæren startes.
    const skall =
      `export LD_LIBRARY_PATH="$HOME/.local/syslibs/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH"; ` +
      `exec "${wslSti}"`;
    const finnes = spawnSync("wsl.exe", ["-e", "test", "-x", wslSti]);
    if (finnes.status !== 0) {
      throw new Error(
        `Fant ikke adapteren i WSL på ${wslSti}.\n` +
          "Bygg den der først – se arena/README.md (Bygging i WSL).",
      );
    }
    return { kommando: "wsl.exe", args: ["-e", "bash", "-lc", skall], beskrivelse: `WSL: ${wslSti}` };
  }
  if (!existsSync(sti)) {
    throw new Error(
      `Fant ikke adapteren på ${sti}.\n` +
        "Bygg den først – se arena/README.md – eller pek på den med --adapter " +
        "(på Windows: --adapter wsl:/home/<bruker>/arena-adapter/.build/release/adapter).",
    );
  }
  return { kommando: sti, args: [], beskrivelse: sti };
}

export interface AdapterSvar {
  readonly type: string;
  readonly fase?: string;
  readonly poeng?: number[];
  readonly iTur?: number;
  readonly handling?: Record<string, unknown>;
  readonly melding?: string;
}

/** Én adapterprosess. Serialiserer forespørsler: én ventende om gangen. */
export class Adapter {
  private readonly proc: ChildProcessWithoutNullStreams;
  private readonly kø: {
    løs: (svar: AdapterSvar) => void;
    avvis: (feil: Error) => void;
  }[] = [];

  constructor(binær: string | AdapterKommando) {
    const kmd = typeof binær === "string" ? løsAdapter(binær) : binær;
    this.proc = spawn(kmd.kommando, kmd.args, { stdio: ["pipe", "pipe", "inherit"] });
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
    if (svar.type === "feil") throw new Error(`Adapterfeil: ${svar.melding}`);
    return svar;
  }

  stopp(): void {
    this.proc.stdin.write(`${JSON.stringify({ type: "avslutt" })}\n`);
    setTimeout(() => this.proc.kill(), 500).unref();
  }
}

/** Motorens handling → adapterens JSON-format. */
export function handlingTilJson(h: Handling): Record<string, unknown> {
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

/** Adapterens JSON → motorens handling (MesterAIs beslutning). */
export function handlingFraJson(j: Record<string, unknown>): Handling {
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

/** rundeStart-melding: gir adapteren hele givingen så motoren speiles eksakt. */
export function rundeStart(state: GameState): object {
  return {
    type: "rundeStart",
    hender: state.hender.map((h) => h.map(kortId)),
    talong: state.talong.map(kortId),
    foersteBudgiver: state.iTur,
  };
}

const FASE_PAR: Record<string, string[]> = {
  BUDRUNDE: ["budrunde"],
  VRAK: ["byttekort"],
  VELG: ["velgTrumf"],
  SPILL: ["spill"],
  RUNDE_SLUTT: ["rundeFerdig", "spillFerdig"],
  FERDIG: ["spillFerdig"],
};

/** Kaster hvis motoren og adapteren har kommet ut av synk. */
export function sjekkSynk(state: GameState, svar: AdapterSvar, kontekst: string): void {
  const lovlige = FASE_PAR[state.fase] ?? [];
  if (!svar.fase || !lovlige.includes(svar.fase)) {
    throw new Error(`DESYNK (${kontekst}): motoren er i ${state.fase}, adapteren i ${svar.fase}`);
  }
}
