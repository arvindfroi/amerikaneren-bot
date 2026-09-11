/**
 * ETTERLYSNINGEN: hvilket trumfkort budvinneren kaller på.
 *
 * DEN SISTE HELT UUNDERSØKTE BESLUTNINGEN I ADAMS. Revisjonen 4. august
 * (`examples/adams-revisjon.ts`, 400 runder) viste:
 *
 *   BUDRUNDE   budmodellen endrer nevros valg i 29,0 %
 *   VRAK       identisk med NevroHjerne i 100,0 %
 *   VELG       identisk med NevroHjerne i 100,0 %
 *   SPILL      nettet uenig med nevro i 56,9 %, vakten endrer 8,7 %
 *
 * To av fire beslutningstyper tas altså fullstendig av den eldste komponenten,
 * i BEGGE armer av hver måling prosjektet har gjort — så et hull der kan aldri
 * ha vist seg.
 *
 * REGELEN I DAG: `velgTrumfOgEtterlys` kaller på det HØYESTE lovlige
 * trumfkortet budvinneren ikke har selv. `lovligeEtterlys` begrenser
 * kandidatene til trumffargen, så valget er bare hvilken VALØR.
 *
 * AVVEININGEN, og den er ekte:
 *
 *   HØYESTE   makkeren holder den sterkeste trumfen vi mangler. Samlet
 *             trumfstyrke blir størst.
 *   LAVERE    det kalte kortet er en vinner når det er høyt, så makkeren
 *             spiller det tidlig og AVSLØRER PARTNERSKAPET med en gang.
 *             Et lavere kort holder makkeren skjult lenger, og forsvarerne
 *             vet da ikke hvem de skal angripe.
 *
 * Hemmeligholdet er ikke gratis: en lavere etterlysning kan gi en svakere
 * makker. Hva som veier tyngst er et empirisk spørsmål, og dette er klassen
 * som lar det måles med ÉN variabel endret.
 *
 * `nivå` er indeks fra toppen: 0 = høyeste (dagens regel), 1 = nest høyeste,
 * og så videre. Finnes ikke så mange kandidater, brukes den laveste.
 */

import { lovligeEtterlys, type GameState, type Handling } from "../motor.ts";

export class Etterlysvelger {
  private readonly indre: { velgHandling(s: GameState): Handling; nyKamp(): void };
  private readonly nivå: number;

  constructor(indre: { velgHandling(s: GameState): Handling; nyKamp(): void }, nivå: number) {
    this.indre = indre;
    this.nivå = Math.max(0, Math.floor(nivå));
  }

  nyKamp(): void {
    this.indre.nyKamp();
  }

  /** Videresender bokføringskroken (12. sep) — se `Budagent.observer`. */
  observer(state: GameState): void {
    (this.indre as { observer?(s: GameState): void }).observer?.(state);
  }

  velgHandling(state: GameState): Handling {
    const h = this.indre.velgHandling(state);
    // BARE etterlysningen endres. Trumfen kommer fra det indre laget, så en
    // målt forskjell kan ikke komme fra trumfvalget — én variabel om gangen.
    if (h.type !== "VELG" || this.nivå === 0) return h;
    const kand = lovligeEtterlys(state, h.trumf);
    if (kand.length === 0) return h;
    // `lovligeEtterlys` gir stigende, så toppen er sist.
    const i = Math.max(0, kand.length - 1 - this.nivå);
    return { ...h, etterlyst: kand[i]! };
  }
}
