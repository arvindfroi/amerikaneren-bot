/**
 * PARITETSTEST: sjekker at TS-porten av appens nevronett (src/nevro) tar
 * NØYAKTIG samme beslutninger som appens egen Swift-kode.
 *
 * Vi spiller vanlige kamper i motoren her, og for hver eneste beslutning et
 * nevro-sete skal ta, spør vi BEGGE implementasjonene:
 *   - TS-porten (src/nevro/spiller.ts)
 *   - arena-adapterens «nevro»-bot (appens NevroSpiller + NevroVekter, i Swift)
 * Avvik rapporteres med fase, sete og hva hver av dem ville gjort.
 * Adapterens svar er det som faktisk utføres, så begge motorene holder synk
 * selv om porten skulle være uenig – da får vi tellingen for HELE kampen.
 *
 * Krever den bygde adapteren (se arena/README.md):
 *   bash arena/hent-appkode.sh /sti/til/Amerikaneren-App
 *   cd arena/adapter && swift build -c release
 *   node examples/nevro-paritet.ts [antallFrø=3] [--adapter <sti>]
 */

import { existsSync, readFileSync } from "node:fs";

import { kortId } from "../src/kort.ts";
import { opprettSpill, utfør, type Handling } from "../src/motor.ts";
import { hjerneFraBase64 } from "../src/nevro/nett.ts";
import { NevroSpiller } from "../src/nevro/spiller.ts";
import { grådigHandling } from "./graadig.ts";
import { Adapter, handlingFraJson, handlingTilJson, rundeStart, sjekkSynk } from "../arena/adapterklient.ts";

function tekstFlagg(navn: string, standard: string): string {
  const i = process.argv.indexOf(`--${navn}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : standard;
}
const posisjonelle = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const antallFrø = Number(posisjonelle[0] ?? 3);
const adapterSti = tekstFlagg("adapter", "arena/adapter/.build/release/adapter");
const VEKTER = "web/nevro-vekter.b64.txt";

if (!existsSync(adapterSti)) {
  console.error(`Fant ikke adapteren på ${adapterSti} – se arena/README.md.`);
  process.exit(1);
}
const hjerne = hjerneFraBase64(readFileSync(VEKTER, "utf8"));

/** Kanonisk tekst for en handling, slik to handlinger kan sammenliknes. */
function tekst(h: Handling): string {
  switch (h.type) {
    case "BUD":
      return `BUD ${String(h.bud)}`;
    case "VRAK":
      return `VRAK ${h.kort.map(kortId).slice().sort().join(",")}`;
    case "VELG":
      return `VELG trumf=${h.trumf} etterlyst=${h.etterlyst ? kortId(h.etterlyst) : "-"}`;
    case "SPILL":
      return `SPILL ${kortId(h.kort)}`;
    default:
      return h.type;
  }
}

interface Avvik {
  frø: number;
  runde: number;
  fase: string;
  sete: number;
  swift: string;
  port: string;
}

const avvik: Avvik[] = [];
let sammenlikninger = 0;
const perFase = new Map<string, { like: number; ulike: number }>();

function bokfør(fase: string, like: boolean): void {
  const t = perFase.get(fase) ?? { like: 0, ulike: 0 };
  if (like) t.like++;
  else t.ulike++;
  perFase.set(fase, t);
}

/** Spiller én kamp med nevro i `sete` og grådig i de tre andre. */
async function spillKamp(adapter: Adapter, frø: number, sete: number): Promise<void> {
  await adapter.send({ type: "nyKamp", adapterBots: { [String(sete)]: "nevro" } });
  const port = new NevroSpiller(sete, hjerne);
  let state = opprettSpill({ antallSpillere: 4 }, frø);
  await adapter.send(rundeStart(state));

  let guard = 0;
  while (state.fase !== "FERDIG" && guard++ < 20000) {
    if (state.fase === "RUNDE_SLUTT") {
      if (state.rundeNr + 1 >= 12) break; // 12 runder er nok for paritet
      const res = utfør(state, { type: "NESTE" });
      state = res.state;
      for (const h of res.hendelser) if (h.type === "NY_RUNDE") await adapter.send(rundeStart(state));
      continue;
    }
    const aktør = state.fase === "VRAK" || state.fase === "VELG" ? state.budvinner! : state.iTur!;
    let handling: Handling;
    if (aktør === sete) {
      // Begge sider beslutter på samme stilling.
      const svar = await adapter.send({ type: "beslutt", sete: aktør });
      const fraSwift = handlingFraJson(svar.handling!);
      const fraPort = port.velgHandling(state);
      sammenlikninger++;
      const like = tekst(fraSwift) === tekst(fraPort);
      bokfør(state.fase, like);
      if (!like) {
        avvik.push({
          frø,
          runde: state.rundeNr,
          fase: state.fase,
          sete,
          swift: tekst(fraSwift),
          port: tekst(fraPort),
        });
      }
      handling = fraSwift; // Swift er fasit – begge motorene følger den
    } else {
      handling = grådigHandling(state);
    }
    const res = utfør(state, handling);
    state = res.state;
    const svar = await adapter.send({ type: "handling", handling: handlingTilJson(handling) });
    sjekkSynk(state, svar, `frø ${frø}, runde ${state.rundeNr}, ${handling.type} fra sete ${aktør}`);
    for (const h of res.hendelser) if (h.type === "NY_RUNDE") await adapter.send(rundeStart(state));
  }
}

async function hoved(): Promise<void> {
  const adapter = new Adapter(adapterSti);
  await adapter.send({ type: "init" });
  console.log(`Paritetstest: ${antallFrø} frø × 4 seter, TS-port mot appens Swift-nett\n`);
  for (let f = 0; f < antallFrø; f++) {
    for (let sete = 0; sete < 4; sete++) {
      await spillKamp(adapter, 555000 + f, sete);
    }
    console.log(`frø ${f + 1}/${antallFrø} ferdig – ${sammenlikninger} beslutninger, ${avvik.length} avvik`);
  }
  adapter.stopp();

  console.log("\nPer fase:");
  for (const [fase, t] of [...perFase].sort()) {
    console.log(`  ${fase.padEnd(9)} ${t.like} like, ${t.ulike} ulike`);
  }
  if (avvik.length > 0) {
    console.log(`\nFørste avvik (av ${avvik.length}):`);
    for (const a of avvik.slice(0, 20)) {
      console.log(`  frø ${a.frø} runde ${a.runde} ${a.fase} sete ${a.sete}: swift=${a.swift} port=${a.port}`);
    }
  }
  const prosent = sammenlikninger === 0 ? 0 : ((sammenlikninger - avvik.length) / sammenlikninger) * 100;
  console.log(
    `\n${sammenlikninger - avvik.length}/${sammenlikninger} identiske (${prosent.toFixed(2)} %)` +
      (avvik.length === 0 ? " – PORTEN ER IDENTISK MED APPEN ✓" : " – AVVIK!"),
  );
  process.exit(avvik.length === 0 ? 0 : 1);
}

hoved().catch((feil: unknown) => {
  console.error(feil);
  process.exit(1);
});
