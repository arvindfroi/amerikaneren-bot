/**
 * Selvspill: fire enkle heuristikk-boter spiller en hel kamp mot hverandre.
 *
 * Dette er både et brukseksempel på API-et og en integrasjonstest av at en
 * komplett kamp kan drives fra start til kampvinner. Kjør med:
 *   node examples/selvspill.ts            (tilfeldig seed)
 *   node examples/selvspill.ts 12345      (fast seed – reproduserbart)
 */

import {
  type Farge,
  FARGER,
  type GameState,
  type Kort,
  kortId,
  lagRng,
  lovligeEtterlys,
  lovligeHandlinger,
  opprettSpill,
  utfør,
  type Verdi,
} from "../src/index.ts";

const seedArg = process.argv[2];
const seed = seedArg ? Number(seedArg) : Math.floor(Math.random() * 0xffffffff);
const rng = lagRng((seed ^ 0x9e3779b9) >>> 0);

function velg<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

/** Antall kort budvinner har i hver farge – brukes til trumfvalg. */
function fargeTelling(hånd: readonly Kort[]): Record<Farge, number> {
  const t: Record<Farge, number> = { S: 0, H: 0, R: 0, K: 0 };
  for (const k of hånd) t[k.farge]++;
  return t;
}

/** Enkel bot: velger en handling for spilleren i tur. */
function botHandling(state: GameState) {
  const lov = lovligeHandlinger(state);
  switch (lov.fase) {
    case "BUDRUNDE": {
      // Åpne på 5 hvis ingen har budt (unngår evig pass), ellers stort sett pass.
      const kanTall = lov.bud.filter((b): b is number => typeof b === "number");
      const ingenBud = state.budrunde.høyeste === null;
      if (ingenBud && kanTall.length > 0 && rng() < 0.5) {
        return { type: "BUD" as const, spiller: lov.spiller, bud: Math.min(...kanTall) };
      }
      // Iblant et lite overbud for å gjøre spillet interessant.
      if (!ingenBud && kanTall.length > 0 && rng() < 0.15) {
        return { type: "BUD" as const, spiller: lov.spiller, bud: Math.min(...kanTall) };
      }
      return { type: "BUD" as const, spiller: lov.spiller, bud: "PASS" as const };
    }
    case "VRAK": {
      // Vrak de laveste kortene.
      const sortert = lov.hånd.slice().sort((a, b) => a.verdi - b.verdi);
      return { type: "VRAK" as const, spiller: lov.spiller, kort: sortert.slice(0, lov.antall) };
    }
    case "VELG": {
      const hånd = state.hender[lov.spiller]!;
      const tel = fargeTelling(hånd);
      const trumf = FARGER.slice().sort((a, b) => tel[b] - tel[a])[0]!;
      let etterlyst: Kort | null = null;
      if (lov.måEtterlyse) {
        const kandidater = lovligeEtterlys(state, trumf);
        // Etterlys høyeste manglende trumf (typisk ess/konge).
        etterlyst = kandidater.sort((a, b) => b.verdi - a.verdi)[0] ?? null;
        if (etterlyst === null) {
          // Ekstremt sjelden: ingen kandidat i valgt trumf, prøv en annen farge.
          for (const f of FARGER) {
            const k = lovligeEtterlys(state, f).sort((a, b) => b.verdi - a.verdi)[0];
            if (k) return { type: "VELG" as const, spiller: lov.spiller, trumf: f, etterlyst: k };
          }
        }
      }
      return { type: "VELG" as const, spiller: lov.spiller, trumf, etterlyst };
    }
    case "SPILL":
      return { type: "SPILL" as const, spiller: lov.spiller, kort: velg(lov.kort) };
    case "RUNDE_SLUTT":
      return { type: "NESTE" as const };
    case "FERDIG":
      return null;
  }
}

function kortStr(k: Kort): string {
  return kortId(k);
}

// Undertrykk kjent-advarsel for ubrukt import (dokumentasjonsformål).
const _verdiEksempel: Verdi = 14;
void _verdiEksempel;

let state = opprettSpill({ antallSpillere: 4 }, seed);
console.log(`Amerikaner – selvspill (seed=${seed})\n`);

let handlinger = 0;
const MAKS = 100_000;
while (state.fase !== "FERDIG" && handlinger < MAKS) {
  const h = botHandling(state);
  if (h === null) break;
  const { state: neste, hendelser } = utfør(state, h);
  state = neste;
  handlinger++;
  for (const e of hendelser) {
    if (e.type === "BUDVINNER") {
      console.log(`Runde ${state.rundeNr + 1}: spiller ${e.spiller} vant budet med ${e.bud}`);
    } else if (e.type === "TRUMF_VALGT") {
      const et = e.etterlyst ? `, etterlyser ${kortStr(e.etterlyst)}` : "";
      console.log(`  Trumf: ${e.trumf}${et}`);
    } else if (e.type === "MAKKER_AVSLØRT") {
      console.log(`  Makker avslørt: spiller ${e.spiller}`);
    } else if (e.type === "RUNDE_SLUTT") {
      const r = e.resultat;
      const klart = r.klart ? "KLART" : "feilet";
      console.log(
        `  Resultat: ${r.melding.type}${r.melding.type === "tall" ? " " + r.melding.bud : ""} ${klart}` +
          ` – lagstikk ${r.lagStikk}. Poeng nå: [${e.totalPoeng.join(", ")}]\n`,
      );
    } else if (e.type === "KAMP_SLUTT") {
      console.log(`KAMP SLUTT – spiller ${e.vinner} vant! Sluttstilling: [${state.totalPoeng.join(", ")}]`);
    }
  }
}

if (handlinger >= MAKS) {
  console.error("Avbrutt: for mange handlinger (mulig løkke).");
  process.exit(1);
}
