/**
 * TROBLOKKEN (v6, indeks 376–427): hva HVER motstander kan ha på hånd.
 *
 * ARVINDS KRAV, og det er det mest ambisiøse i prosjektet:
 *
 *   «den må vite akkurat hvilke kort som er blitt spilt hos alle og når de er
 *    eller nærmer seg renons. jeg vil at min modell skal bli bedre enn alle
 *    andre til å tippe hva motstandere har på hånd ved å observere spillet.»
 *
 * HVA KODINGEN HAR I DAG, og hvorfor det ikke rekker:
 *
 *   52–103   alle åpent spilte kort, i ÉN blokk uten spillertilordning
 *   246–261  renonse per sete × farge – BINÆRT, bare endepunktet «helt tom»
 *   262–269  høyeste kort ute, og antall ute, per farge – summert over alle
 *   340–355  (v3) hvor mange kort av hver farge hvert sete har lagt
 *
 * Telleblokken ga ANTALL per sete og farge. Den sier ikke HVILKE. «Han har
 * lagt tre spar» og «han har lagt spar ess, konge, dame» er to helt ulike
 * verdener for en som skal plassere resten av hånden – i den første kan
 * esset fortsatt ligge der, i den andre er fargen tom for trusler.
 *
 * Og renonseflagget er binært. Et menneske ser at noen NÆRMER seg renonse
 * lenge før de er tomme: har han vist fire ruter og det bare finnes fem
 * usette, kan han høyst ha én igjen. Den slutningen finnes ikke i kodingen.
 *
 * FIRE TREKK PER SETE × FARGE, alle av offentlig informasjon:
 *
 *   HØYESTE spilt   hvilke trusler som er borte fra akkurat den hånden
 *   LAVESTE spilt   sammen med høyeste sier den om han la fra seg smått
 *                   eller måtte gi opp honnører
 *   ØVRE GRENSE     hvor mange av fargen han i det hele tatt KAN ha igjen –
 *                   min(usett i fargen, kort igjen på hånden), 0 ved renonse.
 *                   Dette er «nærmer seg renonse» som et tall i stedet for et
 *                   flagg, og det er selve slutningen Arvind beskriver.
 *   RENONSFARGER    hvor mange farger setet er helt tomt i (per sete)
 *
 * LOVLIGHET. Hvert stikk i historikken sier åpent hvem som la hvilket kort, og
 * kort igjen på hånden er antall stikk igjen. Ingenting her ser i skjulte
 * hender, talongen eller andres vrak – samme klasse som renonsflaggene som alt
 * finnes.
 *
 * KARDINALITET. Rangene er 0–13 og grensene 0–13. Ingen én-av-blokk over 52
 * kort, som var memoreringsfellen i minneblokken (den fungerte som en runde-ID
 * og kostet spillefører −1,475). Fire tall per sete og farge kan ikke peke ut
 * en enkelt giver.
 *
 * INDEKSERINGEN ER RELATIV til setet, som resten av kodingen: rad 0 er meg
 * selv. Egen rad bærer lite – jeg ser jo hånden min – men uniform indeksering
 * er mindre feilutsatt enn en hoppet rad, og indeksfeil i disse filene har
 * kostet dette prosjektet dyrt før.
 */

import { FARGER, type Farge, type Kort } from "../kort.ts";
import type { GameState } from "../motor.ts";
import { fargeIndeks, kortIndeks } from "../nevro/trekk.ts";

/** v5-bredden denne blokken legger seg oppå. */
export const TRO_FRA = 376;
/** 16 høyeste + 16 laveste + 16 øvre grenser + 4 renonstellinger. */
export const TRO_ANTALL = 52;

const relSete = (sete: number, annet: number): number => (annet - sete + 4) % 4;

/**
 * Fyller indeks 376–427. Krever `state`, ikke bare trekkvektoren – i motsetning
 * til planblokken kan ikke dette utledes av de foregående trekkene, fordi
 * spillertilordningen av de spilte kortene finnes bare i historikken.
 */
export function fyllTroblokk(v: Float32Array, state: GameState, sete: number): void {
  const HØY = TRO_FRA;
  const LAV = TRO_FRA + 16;
  const GRENSE = TRO_FRA + 32;
  const RENONS = TRO_FRA + 48;

  // høyeste/laveste rang hvert RELATIVT sete har spilt i hver farge.
  const høyest: number[][] = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
  const lavest: number[][] = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
  // Renonse utledes her på nytt i stedet for å leses av 246–261, fordi denne
  // fila skal kunne leses alene. Samme regel: fulgte ikke farge da den ble
  // etterspurt.
  const renons: boolean[][] = [0, 1, 2, 3].map(() => [false, false, false, false]);

  const stikkene = [
    ...state.historikk.map((s) => s.kort),
    ...(state.bord.length > 0 ? [state.bord] : []),
  ];
  for (const stikk of stikkene) {
    const led = stikk[0]?.kort.farge;
    for (const kp of stikk) {
      const r = relSete(sete, kp.spiller);
      const f = fargeIndeks(kp.kort.farge);
      if (høyest[r]![f]! === 0 || kp.kort.verdi > høyest[r]![f]!) høyest[r]![f] = kp.kort.verdi;
      if (lavest[r]![f]! === 0 || kp.kort.verdi < lavest[r]![f]!) lavest[r]![f] = kp.kort.verdi;
      if (led !== undefined && kp.kort.farge !== led) renons[r]![fargeIndeks(led)] = true;
    }
  }

  // Hvilke kort er SETT: egen hånd pluss alt som er spilt åpent.
  const sett = new Set<number>();
  for (const k of state.hender[sete] ?? []) sett.add(kortIndeks(k));
  for (const stikk of stikkene) for (const kp of stikk) sett.add(kortIndeks(kp.kort));

  // Usett per farge – kortene som fortsatt kan ligge i de tre skjulte hendene.
  const usett = [0, 0, 0, 0];
  for (let f = 0; f < 4; f++) {
    const farge = FARGER[f] as Farge;
    for (let verdi = 2; verdi <= 14; verdi++) {
      if (!sett.has(kortIndeks({ farge, verdi } as Kort))) usett[f]!++;
    }
  }

  // Kort igjen på hånden. Alle har like mange, og tallet er offentlig.
  const igjen = Math.max(0, state.giving.antallStikk - state.stikkSpilt);

  for (let r = 0; r < 4; r++) {
    let renonsAntall = 0;
    for (let f = 0; f < 4; f++) {
      v[HØY + r * 4 + f] = høyest[r]![f]! === 0 ? 0 : (høyest[r]![f]! - 1) / 13;
      v[LAV + r * 4 + f] = lavest[r]![f]! === 0 ? 0 : (lavest[r]![f]! - 1) / 13;
      // ØVRE GRENSE. Renonse gir 0; ellers kan setet høyst ha så mange av
      // fargen som er usett, og aldri flere enn kortene det har igjen.
      // Egen rad settes til det man FAKTISK har – der er det ingen usikkerhet.
      let grense: number;
      if (r === 0) {
        grense = (state.hender[sete] ?? []).filter((k) => fargeIndeks(k.farge) === f).length;
      } else if (renons[r]![f]!) {
        grense = 0;
      } else {
        grense = Math.min(usett[f]!, igjen);
      }
      v[GRENSE + r * 4 + f] = grense / 13;
      if (renons[r]![f]!) renonsAntall++;
    }
    v[RENONS + r] = renonsAntall / 4;
  }
}
