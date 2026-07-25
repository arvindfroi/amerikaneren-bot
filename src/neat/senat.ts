/**
 * Project Senate: fem eksperter, én rolle hver, én ruter som velger.
 *
 * Bakgrunnen er målt, ikke antatt. Fasedelingen viste at svakhetene er
 * FASEAVHENGIGE (trumfvalget alene var 32 av 42 poeng), og ett delt nett
 * gjør at ethvert tiltak sprer seg til faser det ikke var ment for – vi så
 * det da avmetning av utrente hoder kostet 85 poeng. Senatet skiller derfor
 * rollene fysisk: hver ekspert er sitt eget genom, trent på sitt eget
 * scenario, med sin egen fasit.
 *
 * SENATORENE
 *  - bud8 / bud9 / bud10: hver spesialisert på å FØRE nettopp den kontrakten
 *    hjem. Budrunden blir dermed et valg mellom eksperter («hvem av oss tror
 *    på seg selv her?») i stedet for et xT-regnestykke – og xT-hodet var
 *    målt ødelagt (utgang eksakt 0 → alltid bud 6).
 *  - makker: støtter kontrakten uten å overta. D5s sterkeste rolle (70 %).
 *  - forsvar: feller kontrakten. D5s svakeste rolle (17 %), altså mest å
 *    hente – og med motsatt belønningsfortegn av de andre, som er nettopp
 *    grunnen til at den ikke kan dele nett med dem.
 *
 * RUTINGEN er ren spilltilstand, ingen læring: er jeg budvinner, spiller
 * kontraktseksperten; er jeg makker, spiller makkereksperten; ellers
 * forsvareren. I budrunden spør vi kontraktsekspertene.
 *
 * Mangler en ekspert, faller vi tilbake på grunngenomet. Senatet kan derfor
 * bygges ut én rolle om gangen, og hver ny ekspert kan måles mot fallbacken.
 */

import type { GameState, Handling } from "../motor.ts";
import { lovligeHandlinger } from "../motor.ts";
import { NevroAgent } from "../nevro/agent.ts";
import { NeatAgent } from "./agent.ts";
import type { Genom } from "./genom.ts";

export type Rolle = "bud8" | "bud9" | "bud10" | "makker" | "forsvar";

export const ROLLER: readonly Rolle[] = ["bud8", "bud9", "bud10", "makker", "forsvar"];

/** Kontrakten en budekspert er spesialisert på (null for de andre rollene). */
export function kontraktFor(r: Rolle): number | null {
  return r === "bud8" ? 8 : r === "bud9" ? 9 : r === "bud10" ? 10 : null;
}

export interface SenatOpts {
  /** Brukes for roller uten egen ekspert. */
  readonly grunn: Genom;
  readonly eksperter: Partial<Record<Rolle, Genom>>;
  readonly læringsrate?: number;
  /**
   * BUDGIVNING OG TRUMFVALG fra NevroHjerne i stedet for egne nett.
   *
   * Arvinds forslag, og det er godt begrunnet: nevros budgivning er solid
   * (byr 9,3 i snitt, klarer 68 %) mens D-linjenes xT-hode er målt ødelagt
   * (utgang eksakt 0 → alltid bud 6). Fasedelingen ga trumfvalget 32 av 42
   * poeng i gapet. Å låne begge fjerner de to største feilkildene med det
   * samme, så senatorene kan trenes på det de faktisk skal bli gode på:
   * å FØRE kontrakten, støtte den, eller felle den.
   *
   * Senere kan dette erstattes av en ekspert som leser hver senators
   * tillit og velger ut fra konteksten (andre bud, poengstilling).
   */
  readonly nevroBud?: boolean;
}

export class SenatAgent {
  private readonly agenter = new Map<Rolle, NeatAgent>();
  private readonly grunnAgent: NeatAgent;
  /** Hvilken rolle som faktisk spilte sist – for måling og feilsøking. */
  sisteRolle: Rolle | "grunn" = "grunn";

  private readonly nevro: NevroAgent | null;

  constructor(opts: SenatOpts) {
    const lr = opts.læringsrate ?? 0;
    this.nevro = opts.nevroBud === true ? new NevroAgent() : null;
    this.grunnAgent = new NeatAgent(opts.grunn, { læringsrate: lr });
    for (const r of ROLLER) {
      const g = opts.eksperter[r];
      if (g !== undefined) this.agenter.set(r, new NeatAgent(g, { læringsrate: lr }));
    }
  }

  nyKamp(): void {
    this.grunnAgent.nyKamp();
    for (const a of this.agenter.values()) a.nyKamp();
  }

  estimatFor(rundeNr: number): ReturnType<NeatAgent["estimatFor"]> {
    // Bokføringen ligger hos den som faktisk bød.
    const a = this.agenter.get(this.sisteRolle as Rolle) ?? this.grunnAgent;
    return a.estimatFor(rundeNr);
  }

  /**
   * Hvilken senator har ansvaret i denne stillingen? Ren funksjon av
   * spilltilstanden – ingen læring, ingen skjult informasjon.
   */
  rolleFor(state: GameState, spiller: number): Rolle | "grunn" {
    if (state.fase === "BUDRUNDE") {
      // I budrunden er det ingen kontrakt ennå: den mest offensive eksperten
      // som fortsatt har et lovlig bud får ordet. Å velge blant dem er
      // budstrategien – se velgBudSenat.
      return "bud9";
    }
    const påBudlag = spiller === state.budvinner;
    const erMakker = state.makker === spiller;
    if (påBudlag) {
      const m = state.melding;
      const bud = m !== null && m.type === "tall" ? m.bud : 12;
      const r: Rolle = bud <= 8 ? "bud8" : bud === 9 ? "bud9" : "bud10";
      return this.agenter.has(r) ? r : "grunn";
    }
    if (erMakker) return this.agenter.has("makker") ? "makker" : "grunn";
    return this.agenter.has("forsvar") ? "forsvar" : "grunn";
  }

  velgHandling(state: GameState): Handling {
    const lov = lovligeHandlinger(state);
    const spiller =
      state.fase === "VRAK" || state.fase === "VELG" ? (state.budvinner ?? 0) : (state.iTur ?? 0);

    // Budrunde, vraking og trumfvalg: NevroHjerne når den er lånt inn.
    // Senatorene overtar fra første kortvalg – det er der rollene skiller
    // seg, og det er der de er trent.
    if (this.nevro !== null && state.fase !== "SPILL") {
      this.sisteRolle = "grunn";
      return this.nevro.velgHandling(state);
    }
    if (state.fase === "BUDRUNDE") {
      this.sisteRolle = "grunn";
      return this.velgBudSenat(state, lov);
    }
    const r = this.rolleFor(state, spiller);
    this.sisteRolle = r;
    const agent = r === "grunn" ? this.grunnAgent : this.agenter.get(r)!;
    return agent.velgHandling(state);
  }

  /**
   * BUDVALGET er senatets kjerneidé: i stedet for å estimere xT spør vi hver
   * kontraktsekspert hva DEN ville bydd, og tar det høyeste budet noen
   * ekspert står inne for. Eksperten som «tør» mest og samtidig er trent på
   * å føre nettopp den kontrakten, bestemmer.
   *
   * Foreløpig enkel: høyeste bud blant ekspertenes egne forslag. Neste steg
   * er en eksplisitt tillitsverdi per ekspert (se planen i docs).
   */
  private velgBudSenat(state: GameState, lov: ReturnType<typeof lovligeHandlinger>): Handling {
    if (lov.fase !== "BUDRUNDE") return this.grunnAgent.velgHandling(state);
    let beste: Handling | null = null;
    let besteTall = -1;
    for (const r of ["bud10", "bud9", "bud8"] as Rolle[]) {
      const a = this.agenter.get(r);
      if (a === undefined) continue;
      const h = a.velgHandling(state);
      if (h.type !== "BUD") continue;
      const tall = typeof h.bud === "number" ? h.bud : 13;
      if (h.bud !== "PASS" && tall > besteTall) {
        besteTall = tall;
        beste = h;
        this.sisteRolle = r;
      }
    }
    return beste ?? this.grunnAgent.velgHandling(state);
  }
}
