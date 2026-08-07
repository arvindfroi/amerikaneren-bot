/**
 * Å FORKLARE HVORFOR — den tredje menneskelige evnen, og den eneste av dem
 * som lot seg bygge.
 *
 * ARVIND: «alle egenskaper og evner en menneske og en maskin kan ha.»
 *
 * §69 målte at vi kan gjøre rede for **58 %** av Adams' kortvalg med én lesbar
 * setning. De resterende 42 % gjør den noe vi ikke kan formulere — og det var
 * en påstand om NETTET, som er en argmax over 273 tall uten indre struktur.
 *
 * ================= MEN ALPHA-MU HAR EN FORKLARING INNEBYGD ==============
 *
 * Søket gir en UTFALLSVEKTOR per kandidat: ett tall per verden. Det er ikke en
 * skår man må tolke — det ER regnskapet:
 *
 *     «spar 9 vinner i 9 av 12 verdener; spar 2 i 4. De tre verdenene der
 *      spar 2 er bedre, er de der Øst sitter med esset.»
 *
 * Ingen tolkning, ingen saliency-heuristikk, ingen ettermodell. Forklaringen
 * er det samme tallet beslutningen ble tatt på. Det er den eneste formen for
 * forklaring som ikke kan lyve om sin egen årsak.
 *
 * ================= OG DEN TJENER FEILSØKINGEN =========================
 *
 * Arvind: «si vi får et dårlig resultat så må vi kunne se hva som slår godt ut
 * og hvor vi har gjort feil.» En bot som kan gjøre rede for et valg er også en
 * bot der en implementasjonsfeil blir SYNLIG: en verdensfordeling som er helt
 * flat, eller et kriterium som alltid peker på samme kort, ser man umiddelbart
 * i en forklaring og aldri i et sluttall.
 */

import type { Kort } from "../kort.ts";
import type { GameState } from "../motor.ts";
import type { Gren } from "./alphamu.ts";
import { racepress } from "./race.ts";

const FARGENAVN: Record<string, string> = { S: "spar", H: "hjerter", R: "ruter", K: "kløver" };
const VERDINAVN: Record<number, string> = { 11: "knekt", 12: "dame", 13: "konge", 14: "ess" };
const kortNavn = (k: Kort): string =>
  `${FARGENAVN[k.farge] ?? k.farge} ${VERDINAVN[k.verdi] ?? k.verdi}`;

export interface Forklaring {
  readonly valgt: Kort;
  readonly tekst: string;
  /** Tallene forklaringen bygger på, for maskinell bruk. */
  readonly detaljer: {
    readonly verdener: number;
    readonly snitt: number;
    readonly bestI: number;
    readonly spredning: number;
    readonly nestBeste: string | null;
    readonly margin: number;
  };
}

const snitt = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);

function spredning(v: readonly number[]): number {
  if (v.length < 2) return 0;
  const m = snitt(v);
  return Math.sqrt(v.reduce((a, x) => a + (x - m) * (x - m), 0) / (v.length - 1));
}

/**
 * Gjør rede for et valg ut fra alpha-muens grener.
 *
 * `press` tas med når det faktisk påvirket valget — ellers er det støy i
 * forklaringen, og en forklaring som nevner ting som ikke gjaldt er verre enn
 * ingen.
 */
export function forklarValg(
  state: GameState,
  sete: number,
  grener: readonly Gren[],
  valgt: Kort,
  lambda = 0,
): Forklaring | null {
  if (grener.length === 0) return null;
  const min = grener.find((g) => g.kort.farge === valgt.farge && g.kort.verdi === valgt.verdi);
  if (min === undefined) return null;

  const n = min.vektor.length;
  const andre = grener.filter((g) => g !== min);

  // I hvor mange verdener er det valgte kortet best?
  let bestI = 0;
  for (let w = 0; w < n; w++) {
    let erBest = true;
    for (const g of andre) {
      if ((g.vektor[w] ?? -Infinity) > (min.vektor[w] ?? -Infinity) + 1e-9) {
        erBest = false;
        break;
      }
    }
    if (erBest) bestI++;
  }

  let nest: Gren | null = null;
  for (const g of andre) if (nest === null || snitt(g.vektor) > snitt(nest.vektor)) nest = g;
  const margin = nest === null ? 0 : snitt(min.vektor) - snitt(nest.vektor);
  const sp = spredning(min.vektor);
  const press = lambda === 0 ? 0 : racepress(state, sete);

  const deler: string[] = [];
  deler.push(`${kortNavn(valgt)}: best i ${bestI} av ${n} mulige kortfordelinger`);
  if (nest !== null) {
    deler.push(
      margin < 0.05
        ? `nesten likt med ${kortNavn(nest.kort)} (${margin.toFixed(2)})`
        : `${margin.toFixed(2)} bedre enn ${kortNavn(nest.kort)}`,
    );
  }
  /**
   * SPREDNINGEN ER EN ADVARSEL, ikke pynt. Er den stor, hviler valget på at vi
   * gjettet riktig om hvor kortene ligger - og da er forklaringen «jeg vet
   * ikke», ikke «dette er best».
   */
  if (sp > Math.abs(snitt(min.vektor)) && sp > 1) {
    deler.push(`men utfallet spriker (±${sp.toFixed(1)}) — valget hviler på hvor kortene ligger`);
  }
  if (press > 0.2) deler.push(`ligger under i racet, så varians er verdt noe`);
  else if (press < -0.2) deler.push(`leder racet, så trygt slår stort`);

  return {
    valgt,
    tekst: deler.join("; "),
    detaljer: {
      verdener: n,
      snitt: snitt(min.vektor),
      bestI,
      spredning: sp,
      nestBeste: nest === null ? null : kortNavn(nest.kort),
      margin,
    },
  };
}
