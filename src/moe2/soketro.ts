/**
 * TROEN SØKET BRUKER — med hukommelsen (K6 → K8 → søket), 11. sep.
 *
 * `lagTrovektFraVisning` er en ren funksjon av stillingen. Et trohode som leser
 * hukommelsen trenger i tillegg BOKA for denne kampen: hva hver motstander har budt,
 * vraket og spilt i de ferdige rundene. Det er run-time-tilpasningen — troen om akkurat
 * disse motstanderne skjerpes mens kampen går, uten at noe skrives til disk.
 *
 * Målt før dette ble bygd (R1-kamper, 245 holdoutkamper): hukommelsen gir −0,0055 ±
 * 0,0007 i K8-tap (7,6 SE), og stokket hukommelse gir null.
 *
 * ============ DEN STILLE FEILEN DENNE KLASSEN KASTER PÅ ====================
 *
 * Boka fylles bare når noen viser den `RUNDE_SLUTT`. En agent blir aldri spurt om et
 * trekk der, så det må komme gjennom `observer` — og et valgfritt kall som aldri når
 * fram, feiler ikke: `Sandkasseagent` sto med tom hukommelse av nøyaktig den grunnen.
 * Derfor kaster `vektFor` når en runde er passert uten å bli bokført. Starter vi midt i
 * en kamp (appen lastet på nytt), regnes bare rundene etter den første vi så. Går
 * rundenummeret BAKOVER, er det en ny kamp, og boka nullstilles — hukommelsen er
 * kampens, aldri botens.
 */

import type { GameState } from "../motor.ts";
import type { Verden } from "../solver/sampler.ts";
import { Hukommelse } from "../mlb/hukommelse.ts";
import { lagTrovektFraVisning, type Visningstro } from "./troprior.ts";

/** Det søket trenger av en trokilde. */
export interface Søketro {
  vektFor(state: GameState, sete: number): ((v: Verden) => number) | null;
  observer?(state: GameState): void;
  nyKamp?(): void;
}

export class MlbSøketro implements Søketro {
  private readonly nett: Visningstro;
  private bok = new Hukommelse();
  private førsteRunde: number | null = null;
  private sisteRunde = -1;
  private readonly bokført = new Set<number>();

  constructor(nett: Visningstro) {
    this.nett = nett;
  }

  get brukerHukommelse(): boolean {
    return this.nett.brukerHukommelse === true;
  }

  /** Runder boka har bokført i denne kampen. */
  runder(): number {
    return this.bok.runder();
  }

  nyKamp(): void {
    this.bok = new Hukommelse();
    this.førsteRunde = null;
    this.sisteRunde = -1;
    this.bokført.clear();
  }

  observer(state: GameState): void {
    if (!this.brukerHukommelse) return;
    if (state.rundeNr < this.sisteRunde) this.nyKamp();
    this.sisteRunde = state.rundeNr;
    if (this.førsteRunde === null) this.førsteRunde = state.rundeNr;
    if (state.fase === "RUNDE_SLUTT") this.bokført.add(state.rundeNr);
    this.bok.observer(state);
  }

  vektFor(state: GameState, sete: number): ((v: Verden) => number) | null {
    if (!this.brukerHukommelse) return lagTrovektFraVisning(this.nett, state, sete, null);
    this.observer(state);
    const forrige = state.rundeNr - 1;
    if (this.førsteRunde !== null && forrige >= this.førsteRunde && !this.bokført.has(forrige)) {
      throw new Error(
        `Søketro: runde ${forrige} ble aldri vist som RUNDE_SLUTT — observer er ikke koblet, og hukommelsen ville stått tom`,
      );
    }
    return lagTrovektFraVisning(this.nett, state, sete, this.bok.vektor(sete, state.antallSpillere));
  }
}
