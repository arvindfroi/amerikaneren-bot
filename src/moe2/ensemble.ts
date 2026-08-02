/**
 * ENSEMBLE: flere E1-nett som stemmer over kortvalget.
 *
 * Arvinds hypotese: «jeg tror at noen av de må jobbe sammen for å funke.»
 * Den er testbar, og den er ikke opplagt sann. Et snitt hjelper bare hvis
 * nettene gjør ULIKE feil. Er de trent på overlappende data med samme
 * fasit – og det er de fleste av våre – korrelerer feilene, og snittet blir
 * omtrent like godt som gjennomsnittsnettet i stedet for bedre enn det beste.
 *
 * ==================== TRE MÅTER Å SLÅ DEM SAMMEN PÅ ========================
 *
 * `snitt`  Sentrert middel av logitene. Hvert nett trekkes fra sitt eget
 *          snitt over de LOVLIGE kortene før summering. Sentreringen er
 *          nødvendig fordi nettene er trent i ulike kjøringer og har hver
 *          sin nullpunktsforskyvning; uten den ville et nett med høye
 *          logiter dominert uten å ha rett.
 *
 * `rang`   Borda: hvert nett rangerer de lovlige kortene, rangtallene
 *          summeres. Skalauavhengig, og immun mot et enkelt nett som er
 *          skråsikkert og feil. Prisen er at «3 poeng bedre» og «0,1 poeng
 *          bedre» teller likt.
 *
 * `flertall` Hvert nett stemmer på sitt argmax. Grovest av de tre, men den
 *          eneste som ikke kan overstyres av magnituden til ett nett. Tas
 *          med som kontroll: slår den de to andre, er det magnituden som er
 *          upålitelig, ikke rangeringen.
 *
 * Alle tre måles, for hvilken som er riktig er et empirisk spørsmål og ikke
 * et smakspørsmål.
 *
 * BREDDENE KAN VÆRE ULIKE. Hvert nett får sin egen trekkvektor etter sin
 * egen inngangsbredde (273 eller 340), så v1- og v2-nett kan blandes.
 */

import type { Kort } from "../kort.ts";
import { lovligeKort, type GameState, type Handling } from "../motor.ts";
import { forover, type NevroNett } from "../nevro/nett.ts";
import { kortIndeks, NevroAgent } from "../nevro/index.ts";
import { e1SpillTrekk } from "../e1/trekk.ts";

export type EnsembleModus = "snitt" | "rang" | "flertall";

export class Ensemble {
  private readonly nett: readonly NevroNett[];
  private readonly dim: readonly number[];
  private readonly modus: EnsembleModus;
  private readonly nevro: NevroAgent;

  constructor(nett: readonly NevroNett[], modus: EnsembleModus = "snitt") {
    if (nett.length === 0) throw new Error("Ensemble uten nett");
    this.nett = nett;
    this.dim = nett.map((n) => n.lag[0]!.inn);
    this.modus = modus;
    this.nevro = new NevroAgent();
  }

  nyKamp(): void {
    this.nevro.nyKamp();
  }

  velgHandling(state: GameState): Handling {
    if (state.fase === "SPILL" && state.iTur !== null) {
      return { type: "SPILL", spiller: state.iTur, kort: this.velgKort(state, state.iTur) };
    }
    // Bud, vrak og trumfvalg går urørt til NevroHjerne – nøyaktig som E1Agent.
    // Ensemblen skal måles på kortspillet alene, ellers vet vi ikke hva som
    // flyttet tallet.
    return this.nevro.velgHandling(state);
  }

  velgKort(state: GameState, sete: number): Kort {
    const lovlige = lovligeKort(state, sete);
    if (lovlige.length === 1) return lovlige[0]!;

    const poeng = new Map<number, number>();
    for (const k of lovlige) poeng.set(kortIndeks(k), 0);

    for (let i = 0; i < this.nett.length; i++) {
      const logits = forover(this.nett[i]!, e1SpillTrekk(state, sete, this.dim[i]!));
      if (this.modus === "snitt") {
        let sum = 0;
        for (const k of lovlige) sum += logits[kortIndeks(k)]!;
        const midt = sum / lovlige.length;
        for (const k of lovlige) {
          const ix = kortIndeks(k);
          poeng.set(ix, poeng.get(ix)! + (logits[ix]! - midt));
        }
      } else if (this.modus === "rang") {
        const sortert = lovlige.slice().sort((a, b) => logits[kortIndeks(b)]! - logits[kortIndeks(a)]!);
        // Beste kort får høyest tall, så argmax under er felles for alle modi.
        for (let r = 0; r < sortert.length; r++) {
          const ix = kortIndeks(sortert[r]!);
          poeng.set(ix, poeng.get(ix)! + (sortert.length - 1 - r));
        }
      } else {
        let beste = lovlige[0]!;
        for (const k of lovlige) if (logits[kortIndeks(k)]! > logits[kortIndeks(beste)]!) beste = k;
        poeng.set(kortIndeks(beste), poeng.get(kortIndeks(beste))! + 1);
      }
    }

    // Uavgjort brytes av rekkefølgen i `lovlige`, som er deterministisk.
    // Det gjør hele ensemblen deterministisk, som målingene forutsetter.
    let beste = lovlige[0]!;
    for (const k of lovlige) if (poeng.get(kortIndeks(k))! > poeng.get(kortIndeks(beste))!) beste = k;
    return beste;
  }

  rangerKort(state: GameState, sete: number, lovlige: readonly Kort[]): Kort[] {
    const sum = new Map<number, number>();
    for (const k of lovlige) sum.set(kortIndeks(k), 0);
    for (let i = 0; i < this.nett.length; i++) {
      const logits = forover(this.nett[i]!, e1SpillTrekk(state, sete, this.dim[i]!));
      for (const k of lovlige) {
        const ix = kortIndeks(k);
        sum.set(ix, sum.get(ix)! + logits[ix]!);
      }
    }
    return lovlige.slice().sort((a, b) => sum.get(kortIndeks(b))! - sum.get(kortIndeks(a))!);
  }
}
