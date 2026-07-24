/**
 * NevroAgent: appens nettspiller, kjørbar her.
 *
 * Speiler `NevroSpiller` i Amerikaneren-App: bud, byttekort og kortspill
 * avgjøres med ett nettoppslag hver (argmax over LOVLIGE handlinger).
 * Trumf- og etterlysningsvalget gjør ikke nettet i appen heller – der
 * ligger det i `AIPlayer.velgTrumfOgMakker` (håndvurderingen
 * `estimerStikk`), og den heuristikken er portert med appens egne
 * standardvekter.
 *
 * Bruksområder her: sterk og rask motstander (mikrosekunder per trekk,
 * 90,1 poeng på appens stige mot vår PIMC-rask på 78,7), referansemåler
 * på ferske givere, og lærer/prior for NEAT-linjene.
 */

import { FARGER, type Farge, type Kort, type Verdi } from "../kort.ts";
import { lovligeEtterlys, lovligeHandlinger, lovligeKort, type GameState, type Handling } from "../motor.ts";
import { AMERIKANER, PASS, SOLO, type Bud } from "../regler.ts";
import { forover, nevroHjerne, type NevroHjerne } from "./nett.ts";
import { BUD_HANDLINGER, budTrekk, byttTrekk, kortIndeks, spillTrekk } from "./trekk.ts";

/**
 * Håndvurderingen bak trumfvalget – appens `MesterVekter`-standardverdier.
 * Endres de i appen, må de endres her (de er håndsatte, ikke lærte).
 */
export interface HåndVekter {
  readonly trumfPerKort: number;
  readonly trumfLengdeBonus: number;
  readonly essTrumf: number;
  readonly essSide: number;
  readonly kongeStøttet: number;
  readonly kongeSingel: number;
  readonly dameStøttet: number;
  readonly dameSingel: number;
  readonly renonsFaktor: number;
  readonly singeltonBonus: number;
}

export const HÅND_VEKTER: HåndVekter = {
  trumfPerKort: 0.55,
  trumfLengdeBonus: 0.4,
  essTrumf: 1.0,
  essSide: 0.9,
  kongeStøttet: 0.65,
  kongeSingel: 0.3,
  dameStøttet: 0.35,
  dameSingel: 0.15,
  renonsFaktor: 0.45,
  singeltonBonus: 0.3,
};

/** Estimerte stikk med `trumf` som trumffarge (appens `estimerStikk`). */
export function estimerStikk(hånd: readonly Kort[], trumf: Farge, v: HåndVekter = HÅND_VEKTER): number {
  let estimat = 0;
  const trumfKort = hånd.filter((k) => k.farge === trumf);
  estimat += trumfKort.length * v.trumfPerKort;
  if (trumfKort.length > 3) estimat += (trumfKort.length - 3) * v.trumfLengdeBonus;
  for (const kort of hånd) {
    const iFarge = hånd.filter((k) => k.farge === kort.farge).length;
    if (kort.verdi === 14) estimat += kort.farge === trumf ? v.essTrumf : v.essSide;
    else if (kort.verdi === 13) estimat += iFarge >= 2 ? v.kongeStøttet : v.kongeSingel;
    else if (kort.verdi === 12) estimat += iFarge >= 3 ? v.dameStøttet : v.dameSingel;
  }
  for (const farge of FARGER) {
    if (farge === trumf) continue;
    const antall = hånd.filter((k) => k.farge === farge).length;
    if (antall === 0) estimat += Math.min(2, trumfKort.length) * v.renonsFaktor;
    if (antall === 1) estimat += v.singeltonBonus;
  }
  return estimat;
}

export function besteTrumf(hånd: readonly Kort[], v: HåndVekter = HÅND_VEKTER): { trumf: Farge; estimat: number } {
  let beste: { trumf: Farge; estimat: number } = { trumf: "S", estimat: -1 };
  for (const farge of FARGER) {
    const e = estimerStikk(hånd, farge, v);
    if (e > beste.estimat) beste = { trumf: farge, estimat: e };
  }
  return beste;
}

export class NevroAgent {
  private readonly hjerne: NevroHjerne;

  constructor(hjerne: NevroHjerne = nevroHjerne()) {
    this.hjerne = hjerne;
  }

  /** For grensesnitt-likhet med NeatAgent – nettet har ingen kamphukommelse. */
  nyKamp(): void {}

  velgHandling(state: GameState): Handling {
    const lov = lovligeHandlinger(state);
    switch (lov.fase) {
      case "BUDRUNDE":
        return { type: "BUD", spiller: lov.spiller, bud: this.velgBud(state, lov.spiller, lov.bud) };
      case "VRAK":
        return { type: "VRAK", spiller: lov.spiller, kort: this.velgVrak(state, lov.spiller, lov.hånd, lov.antall) };
      case "VELG": {
        const { trumf, etterlyst } = this.velgTrumfOgEtterlys(state, lov.spiller, lov.måEtterlyse);
        return { type: "VELG", spiller: lov.spiller, trumf, etterlyst };
      }
      case "SPILL":
        return { type: "SPILL", spiller: lov.spiller, kort: this.velgKort(state, lov.spiller) };
      default:
        return { type: "NESTE" };
    }
  }

  /** Argmax over de lovlige budene – nettets 12 utganger i appens rekkefølge. */
  velgBud(state: GameState, sete: number, lovlige: readonly Bud[]): Bud {
    if (lovlige.length === 0) return PASS;
    const logits = forover(this.hjerne.bud, budTrekk(state, sete));
    let beste: Bud = PASS;
    let besteLogit = -Infinity;
    for (let i = 0; i < BUD_HANDLINGER.length; i++) {
      const handling = BUD_HANDLINGER[i]! as Bud;
      if (!lovlige.some((b) => b === handling)) continue;
      if (logits[i]! > besteLogit) {
        besteLogit = logits[i]!;
        beste = handling;
      }
    }
    return beste;
  }

  /** Vraker de `antall` kortene nettet gir lavest behold-score. */
  velgVrak(state: GameState, sete: number, hånd: readonly Kort[], antall: number): Kort[] {
    if (antall <= 0 || hånd.length <= antall) return [];
    const behold = forover(this.hjerne.bytt, byttTrekk(state, sete));
    return hånd
      .slice()
      .sort((a, b) => behold[kortIndeks(a)]! - behold[kortIndeks(b)]!)
      .slice(0, antall);
  }

  /** Argmax over lovlige kort. */
  velgKort(state: GameState, sete: number): Kort {
    const lovlige = lovligeKort(state, sete);
    if (lovlige.length === 1) return lovlige[0]!;
    const logits = forover(this.hjerne.spill, spillTrekk(state, sete));
    let beste = lovlige[0]!;
    for (const k of lovlige) if (logits[kortIndeks(k)]! > logits[kortIndeks(beste)]!) beste = k;
    return beste;
  }

  /**
   * Trumf + etterlysning. Nettet har ingen utgang for dette; appen bruker
   * håndvurderingen: lengste/beste farge som trumf, og etterlys det høyeste
   * trumfkortet man ikke har selv (ved solo: et kort man kan stikke over).
   */
  velgTrumfOgEtterlys(state: GameState, sete: number, måEtterlyse: boolean): { trumf: Farge; etterlyst: Kort | null } {
    const hånd = state.hender[sete] ?? [];
    const { trumf } = besteTrumf(hånd);
    // lovligeEtterlys gir kandidatene stigende; appen tar den HØYESTE.
    const høyest = (kort: readonly Kort[]): Kort | null => (kort.length > 0 ? kort[kort.length - 1]! : null);

    if (!måEtterlyse) {
      // Solo: etterlys bare et trumfkort vårt eget toppkort slår.
      const minTopp = hånd.filter((k) => k.farge === trumf).reduce<Verdi | null>((m, k) => (m === null || k.verdi > m ? k.verdi : m), null);
      if (minTopp === null) return { trumf, etterlyst: null };
      const uttrekk = lovligeEtterlys(state, trumf).filter((k) => k.verdi < minTopp);
      return { trumf, etterlyst: høyest(uttrekk) };
    }

    const kandidater = lovligeEtterlys(state, trumf);
    const ønsket = høyest(kandidater);
    if (ønsket !== null) return { trumf, etterlyst: ønsket };
    // Har alle tilgjengelige trumfene selv: prøv nest beste farge.
    for (const annen of FARGER) {
      if (annen === trumf) continue;
      const alt = høyest(lovligeEtterlys(state, annen));
      if (alt !== null) return { trumf: annen, etterlyst: alt };
    }
    return { trumf, etterlyst: null };
  }
}

/** Praktisk innpakning: velger for spilleren i tur, som `grådigHandling`. */
export function nevroHandling(state: GameState, agent: NevroAgent = new NevroAgent()): Handling {
  return agent.velgHandling(state);
}

export { AMERIKANER, SOLO };
