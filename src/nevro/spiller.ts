/**
 * NevroSpiller: spiller en hel Amerikaner-kamp med appens innebygde
 * nevronett – portert fra `NevroSpiller` i `Amerikaneren/AI/NevroNett.swift`.
 *
 * Nettet har tre hoder: bud, vrak og kortspill. Trumf- og etterlysningsvalget
 * har nettet ingen utgang for; der bruker appen håndvurderings-heuristikken i
 * `AIPlayer.velgTrumfOgMakker`, og den er portert her sammen med nettet slik at
 * spilleren tar nøyaktig de samme beslutningene som i appen.
 *
 * Agenten ser bare det setet lovlig kjenner – egen hånd, lagte kort,
 * meldinger, avslørt makker og poengstillingen.
 */

import { FARGER, type Farge, type Kort } from "../kort.ts";
import { lovligeHandlinger, type GameState, type Handling } from "../motor.ts";
import { type Bud } from "../regler.ts";
import { forover, type NevroHjerne } from "./nett.ts";
import { budTrekk, budUtgang, byttTrekk, kortIndeks, spillTrekk } from "./trekk.ts";

// --- Håndvurdering (AIPlayer.estimerStikk / besteTrumf) ---------------------

/** Estimerer antall stikk med gitt farge som trumf. */
export function estimerStikk(hånd: readonly Kort[], trumf: Farge): number {
  let estimat = 0;
  const trumfKort = hånd.filter((k) => k.farge === trumf);
  // Trumflengde er konge: hvert trumfkort over 3 er nesten et stikk.
  estimat += trumfKort.length * 0.55;
  if (trumfKort.length > 3) estimat += (trumfKort.length - 3) * 0.4;

  for (const kort of hånd) {
    const iFarge = hånd.filter((k) => k.farge === kort.farge).length;
    if (kort.verdi === 14) estimat += kort.farge === trumf ? 1.0 : 0.9;
    else if (kort.verdi === 13) estimat += iFarge >= 2 ? 0.65 : 0.3;
    else if (kort.verdi === 12) estimat += iFarge >= 3 ? 0.35 : 0.15;
  }
  // Renons og singelton gir stjålne stikk med trumf på hånden.
  for (const farge of FARGER) {
    if (farge === trumf) continue;
    const antall = hånd.filter((k) => k.farge === farge).length;
    if (antall === 0) estimat += Math.min(2.0, trumfKort.length) * 0.45;
    if (antall === 1) estimat += 0.3;
  }
  return estimat;
}

/** Fargen som gir høyest stikkestimat (første ved likhet, som i appen). */
export function besteTrumf(hånd: readonly Kort[]): { farge: Farge; estimat: number } {
  let beste: { farge: Farge; estimat: number } = { farge: "S", estimat: -1 };
  for (const farge of FARGER) {
    const e = estimerStikk(hånd, farge);
    if (e > beste.estimat) beste = { farge, estimat: e };
  }
  return beste;
}

/**
 * Kort budvinneren kan etterlyse: trumfkort de verken har selv eller har
 * vraket, høyeste først (appens `GameEngine.kortSomKanØnskes`).
 */
export function kortSomKanØnskes(s: GameState, trumf: Farge): Kort[] {
  const utilgjengelige = new Set<number>();
  for (const k of s.hender[s.budvinner!] ?? []) {
    if (k.farge === trumf) utilgjengelige.add(k.verdi);
  }
  for (const k of s.vrak) {
    if (k.farge === trumf) utilgjengelige.add(k.verdi);
  }
  const ut: Kort[] = [];
  for (let v = 14; v >= 2; v--) {
    if (!utilgjengelige.has(v)) ut.push({ farge: trumf, verdi: v as Kort["verdi"] });
  }
  return ut;
}

// --- Nettspilleren ----------------------------------------------------------

export class NevroSpiller {
  readonly sete: number;
  private readonly hjerne: NevroHjerne;

  constructor(sete: number, hjerne: NevroHjerne) {
    this.sete = sete;
    this.hjerne = hjerne;
  }

  /** Kompatibelt med NeatAgent: én kamp er statusløs for dette nettet. */
  nyKamp(): void {
    /* nettet har ingen tilstand mellom runder */
  }

  /** Beslutningen for fasen setet er i tur i. */
  velgHandling(s: GameState): Handling {
    const lov = lovligeHandlinger(s);
    switch (lov.fase) {
      case "BUDRUNDE":
        return { type: "BUD", spiller: lov.spiller, bud: this.velgBud(s, lov.bud) };
      case "VRAK":
        return { type: "VRAK", spiller: lov.spiller, kort: this.velgVrak(s, lov.hånd, lov.antall) };
      case "VELG":
        return this.velgTrumfOgMakker(s, lov.spiller, lov.måEtterlyse);
      case "SPILL":
        return { type: "SPILL", spiller: lov.spiller, kort: this.velgKort(s, lov.kort) };
      default:
        throw new Error(`NevroSpiller kan ikke handle i fasen ${lov.fase}`);
    }
  }

  /** Argmax over de LOVLIGE budene (maskerte logits), som i appen. */
  velgBud(s: GameState, lovlige: readonly Bud[]): Bud {
    if (lovlige.length === 0) return "PASS";
    const logits = forover(this.hjerne.bud, budTrekk(s, this.sete, lovlige));
    let beste: Bud = "PASS";
    let besteLogit = -Infinity;
    // Appen går gjennom budHandlinger i rekkefølge og bytter bare ved strengt
    // høyere logit – likhet gir altså det første (laveste) budet.
    for (const bud of lovlige.slice().sort((a, b) => budUtgang(a) - budUtgang(b))) {
      const i = budUtgang(bud);
      if (i < 0) continue;
      if (logits[i]! > besteLogit) {
        besteLogit = logits[i]!;
        beste = bud;
      }
    }
    return beste;
  }

  /** Vraker de `antall` kortene nettet gir lavest «behold»-skår. */
  velgVrak(s: GameState, hånd: readonly Kort[], antall: number): Kort[] {
    if (antall <= 0 || hånd.length <= antall) return [];
    const behold = forover(this.hjerne.bytt, byttTrekk(s, this.sete));
    return hånd
      .map((kort, i) => ({ kort, i, skår: behold[kortIndeks(kort)]! }))
      .sort((a, b) => (a.skår === b.skår ? a.i - b.i : a.skår - b.skår))
      .slice(0, antall)
      .map((x) => x.kort);
  }

  /**
   * Trumf + etterlysning. Nettet har ingen utgang for dette, så vi bruker
   * appens heuristikk: beste trumffarge etter håndvurderingen, og be om det
   * høyeste trumfkortet man ikke har selv (ved solo: et kort man kan slå).
   */
  velgTrumfOgMakker(s: GameState, spiller: number, måEtterlyse: boolean): Handling {
    const hånd = s.hender[spiller] ?? [];
    const { farge } = besteTrumf(hånd);

    if (!måEtterlyse) {
      // Solo: etterlys bare en trumf vi kan stikke over med vårt eget toppkort.
      const minTopp = hånd.filter((k) => k.farge === farge).reduce((m, k) => Math.max(m, k.verdi), 0);
      const uttrekk = kortSomKanØnskes(s, farge).find((k) => k.verdi < minTopp) ?? null;
      return { type: "VELG", spiller, trumf: farge, etterlyst: uttrekk };
    }

    // Be om høyeste trumf man ikke har selv – da får laget beste kort.
    const kandidater = kortSomKanØnskes(s, farge);
    if (kandidater.length > 0) {
      return { type: "VELG", spiller, trumf: farge, etterlyst: kandidater[0]! };
    }
    // Har alle tilgjengelige trumfene: prøv nest beste farge.
    for (const annen of FARGER) {
      if (annen === farge) continue;
      const alternativ = kortSomKanØnskes(s, annen)[0];
      if (alternativ !== undefined) {
        return { type: "VELG", spiller, trumf: annen, etterlyst: alternativ };
      }
    }
    // Kan ikke skje med 12 kort på hånden, men motoren krever et kort.
    throw new Error("fant ingen kort å etterlyse");
  }

  /** Argmax over de lovlige kortene (første ved likhet, som Swifts max(by:)). */
  velgKort(s: GameState, lovlige: readonly Kort[]): Kort {
    if (lovlige.length === 1) return lovlige[0]!;
    const logits = forover(this.hjerne.spill, spillTrekk(s, this.sete));
    let beste = lovlige[0]!;
    let besteLogit = logits[kortIndeks(beste)]!;
    for (const kort of lovlige.slice(1)) {
      const l = logits[kortIndeks(kort)]!;
      if (l > besteLogit) {
        besteLogit = l;
        beste = kort;
      }
    }
    return beste;
  }
}
