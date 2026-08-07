/**
 * VERDENSVEKTEN — ett sted, tre kilder, og reglene for hvordan de kombineres.
 *
 * ARVIND: «vi har jo jobbet for at Adams skal ha tilgang til alt dette også
 * bruker vi det ikke. vær så snill å gjør det ordentlig nå.»
 *
 * Han har rett. `troverdighet.ts` (A5) og `signal.ts` (A6) ble bygd, testet og
 * dokumentert — og importert av **ingenting utenom sine egne tester**. A5 var
 * koblet ÉTT sted: `examples/sd-orakel.ts`, altså etikettmakeren. Adams hadde
 * den ikke når han spilte.
 *
 * Denne fila er kroken som mangler. Alle tre kildene svarer på samme spørsmål —
 * «hvor forenlig er denne verdenen med det vi har sett?» — og
 * `trekkVerdener(..., trovekt, ...)` tar nøyaktig én slik funksjon.
 *
 * ================= A1 OG A5 ER ALTERNATIVER, IKKE TILLEGG ================
 *
 * `sd-orakel.ts` sier det allerede, og det er en reell begrensning:
 *
 *     «Tre kilder, og de kan ikke stables: de er alternative modeller av det
 *      samme, ikke uavhengige signaler.»
 *
 * A1 (`hvemla-slutning`) leser «hen vant ikke da hen kunne» og «hen trumfet
 * ikke da hen kunne» som håndsatte regler. A5 (`troverdighet`) leser NØYAKTIG
 * de samme observasjonene, men som en likelihood under nettets egen policy. Å
 * legge dem sammen ville telt det samme beviset to ganger og gjort troen
 * kunstig skarp — verre enn å bruke bare én.
 *
 * Derfor er `kilde` et VALG, ikke et sett.
 *
 * ================= A6 ER ET TILLEGG, MED FORBEHOLD =======================
 *
 * `signal.ts` leser noe annet: hvilket kort makker valgte da valget var GRATIS
 * (§70 målte at 36,2 % av kortvalgene ikke endrer stikkets utfall). Det er
 * ledig båndbredde, ikke en gjentakelse av «vant du da du kunne».
 *
 * Overlappet er ikke null — begge ser på tapte stikk — men de svarer på ulike
 * ting: A1/A5 på «hva var mulig og ble ikke gjort», A6 på «hvilket av de
 * likegyldige kortene ble valgt». Derfor får A6 være additiv, og derfor er
 * `STYRKE` moderat (0,6) og ikke et krav.
 *
 * Det er en tilnærming, og den står her i stedet for å bli oppdaget som en
 * skjevhet senere.
 */

import type { GameState } from "../motor.ts";
import { intTilKort } from "../solver/dds.ts";
import { lagHvemLaVekt } from "./hvemla-slutning.ts";
import { lagTroverdighetsvekt, type Atferdsmodell } from "./troverdighet.ts";
import { signalForenlighet } from "./signal.ts";

/** Hvilken av de to alternative slutningene som brukes. */
export type Vektkilde = "av" | "regel" | "bayes";

export interface VerdensvektOpts {
  /** A1 «regel» eller A5 «bayes». Aldri begge – se hodet. */
  readonly kilde?: Vektkilde;
  /** A6: legg signalforenligheten til. Additiv. */
  readonly signal?: boolean;
  /** Kreves av «bayes». Uten den faller kilden tilbake til «regel». */
  readonly atferd?: Atferdsmodell;
  readonly tau?: number;
  readonly vindu?: number;
}

/** En vektfunksjon slik `trekkVerdener` vil ha den, eller `undefined` for «av». */
export type Verdensvekt = (v: { hender: number[][] }) => number;

/**
 * Sett sammen vekten for én beslutning.
 *
 * Returnerer `undefined` når ingen kilde er valgt — da skal `trekkVerdener`
 * få `undefined` og ikke en funksjon som alltid gir 0. Forskjellen er ikke
 * kosmetisk: en konstant vekt tvinger trekningen gjennom vektings-grenen med
 * full kandidatkostnad for et resultat som er uniformt uansett.
 */
export function lagVerdensvekt(
  state: GameState,
  sete: number,
  opts: VerdensvektOpts = {},
): Verdensvekt | undefined {
  const kilde = opts.kilde ?? "av";

  /**
   * BAYES KREVER EN ATFERDSMODELL. Mangler den, faller vi til «regel» i
   * stedet for å kaste — men det skal være et SYNLIG fall, ikke et stille.
   * Kalleren får vite det gjennom `sisteKilde`, som testene sjekker.
   */
  const effektiv: Vektkilde =
    kilde === "bayes" && opts.atferd === undefined ? "regel" : kilde;
  sisteKilde = effektiv;

  const basis: Verdensvekt | undefined =
    effektiv === "regel"
      ? lagHvemLaVekt(state, sete)
      : effektiv === "bayes"
        ? lagTroverdighetsvekt(state, sete, opts.atferd!, {
            tau: opts.tau,
            vindu: opts.vindu,
          })
        : undefined;

  if (opts.signal !== true) return basis;

  const medSignal: Verdensvekt = (v) => {
    const hender = v.hender.map((h) => h.map(intTilKort));
    return (basis === undefined ? 0 : basis(v)) + signalForenlighet(state, hender, sete);
  };
  return medSignal;
}

/**
 * Hvilken kilde forrige `lagVerdensvekt` FAKTISK brukte.
 *
 * Finnes fordi «bayes uten atferdsmodell» stille blir «regel», og en stille
 * degradering er nøyaktig feilen som gjorde at A5 aldri kom inn i Adams i det
 * hele tatt. Testene leser denne; produksjonskoden trenger den ikke.
 */
export let sisteKilde: Vektkilde = "av";
