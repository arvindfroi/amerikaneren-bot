/**
 * ØKTEN — motstandermodellen som overlever mellom kamper, men ALDRI lagres.
 *
 * ARVIND: «den ska bare lære per økt for nå. men det skal være sykt godt
 * gjennomført.»
 *
 * ================= HVORFOR DENNE FILA IKKE RØRER DISK ====================
 *
 * `Profilagent.nyKamp()` nullstilte profilen, og begrunnelsen sto i koden: å
 * bære den mellom kamper ville vært «den databasen Arvind uttrykkelig ikke
 * ville ha».
 *
 * Skillet som løser det er MELLOM ØKT OG HISTORIE:
 *
 *   én økt   = så lenge prosessen lever. Familien spiller flere kamper etter
 *              hverandre på samme kveld, og boten husker DEN kvelden.
 *   historie = noe som overlever at appen lukkes. Det er databasen.
 *
 * Derfor har denne modulen **ingen import fra `node:fs`**, ingen
 * `localStorage`, ingen nettverkskall. Det er ikke en konvensjon — det er
 * håndhevet av `test/okt.test.ts`, som leser kilden og feiler på ethvert spor
 * av lagring. En kommentar kan ryke; en test kan ikke.
 *
 * ================= OG DEN MÅ FAKTISK BRUKES ==============================
 *
 * En profil som bare overlever er verdiløs. `Profilagent` påvirker i dag bare
 * `forsvarsverdi` i budgivningen, og den koblingen målte **−1,25 pp** (§75) —
 * Arvind sa det selv 6. august: «det er ikke bare budet den skal tilpasse seg,
 * men også i spillet».
 *
 * Økten kobler den derfor til A2: `motpartFor(sete)` gir søket én policy PER
 * MOTSTANDER i stedet for å anta at alle spiller som oss. Det er der en
 * motstandermodell hører hjemme — i prediksjonen, ikke i én konstant.
 */

import type { GameState, Handling } from "../motor.ts";
import { lovligeKort } from "../motor.ts";
import { Profilbok } from "./profilagent.ts";
import { tiltro } from "./profil.ts";
import { billigste, dyreste } from "./synlig.ts";
import type { Utspiller } from "./sdkort.ts";

/**
 * Hvor hardt en observert stil får lov å vri rollout-policyen.
 *
 * Lavt med vilje: en motstandermodell bygget på få runder er et ANSLAG, og et
 * anslag som vrir søket hardt gjør skade når det tar feil. Skal sveipes.
 */
export const MAKS_VRI = 0.35;

/** Minste antall runder før vi tror på noe som helst om et sete. */
export const MIN_RUNDER = 4;

export class Økt {
  readonly bok = new Profilbok();
  /** Kamper spilt i denne økten. Bare for logging og tester. */
  private kamper = 0;

  nyKamp(): void {
    // BOKA STÅR. Det er hele forskjellen fra `Profilagent.nyKamp()`.
    this.kamper++;
  }

  antallKamper(): number {
    return this.kamper;
  }

  /**
   * Hvor aggressivt et sete spiller, i [−1, 1].
   *
   *   +1  spiller høyt: tar stikk tidlig, leder trumf, byr ofte
   *   −1  spiller lavt: sparer, dukker, passer
   *    0  ukjent, eller for få runder til å si noe
   *
   * `null` når vi ikke vet nok. Å gjette 0 og å VITE at det er 0 er to ulike
   * ting, og kalleren skal kunne skille dem.
   */
  aggressivitet(sete: number): number | null {
    const runder = this.bok.runder(sete);
    if (runder < MIN_RUNDER) return null;
    const p = this.bok.profilFor(sete) as unknown as {
      trumfutspill?: { sum: number; n: number };
      ledetTrumf?: { sum: number; n: number };
    };
    const t = p.trumfutspill ?? p.ledetTrumf;
    if (t === undefined || t.n === 0) return null;

    /**
     * ============ DEN ANDRE TERSKELEN VAR EN FLASKEHALS =================
     *
     * Her sto `if (t.n < MIN_RUNDER) return null` - en HARD terskel paa
     * `trumfutspill`, som bare oeker naar setet FORSVARER og LEDER et stikk.
     *
     * Maalt: `bydde.n` vokser hver runde (1,2,3,...,9), mens `trumfutspill.n`
     * vokser til **1 og stopper**. Terskelen kunne dermed aldri naas, og
     * `aggressivitet` returnerte null i det uendelige - selv med boka full.
     *
     * Det er noeyaktig samme feilklasse som `runder()` som telte BUD i stedet
     * for runder: en terskel som skal si «vi har sett nok» lagt paa en teller
     * som teller noe langt sjeldnere. To slike i samme funksjon, og begge
     * gjorde hele K6 umaalbar.
     *
     * KRYMPING I STEDET FOR EN HARD DOER. `tiltro(t) = n/(n+k)` er allerede
     * mekanismen prosjektet bruker for «hvor mye skal vi tro paa dette» - se
     * `profil.ts`. Med den vokser utslaget GRADVIS med observasjonene i stedet
     * for aa hoppe fra null til fullt.
     *
     * Og forsiktigheten er bevart, ikke kastet: `motpartFor` krever fortsatt
     * |a| >= 0,2 foer den vrir noe, saa en stil avlest av én runde gir et
     * krympet tall som ikke naar terskelen uansett. Forskjellen er at den KAN
     * naa den etter hvert.
     */
    const rate = t.sum / t.n;
    const rå = Math.max(-1, Math.min(1, (rate - 0.5) * 2));
    return rå * tiltro(t);
  }

  /**
   * A2: policyen søket skal tro at `sete` spiller med.
   *
   * Vrir `basis` mot høyere eller lavere kort etter observert stil. Vrien er
   * BEGRENSET og slår bare inn når vi har sett nok runder — ellers returneres
   * `basis` uendret, og søket oppfører seg nøyaktig som før.
   */
  motpartFor(basis: Utspiller, sete: number): Utspiller {
    const a = this.aggressivitet(sete);
    if (a === null || Math.abs(a) < 0.2) return basis;
    const vri = Math.max(-MAKS_VRI, Math.min(MAKS_VRI, a));
    return {
      velgHandling: (s: GameState): Handling => {
        const h = basis.velgHandling(s);
        // Bare KORTVALG vris. Bud og vrak er andre beslutninger med egne
        // modeller, og å vri dem her ville blandet to ting.
        if (h.type !== "SPILL" || s.iTur !== sete || s.trumf === null) return h;
        const lov = lovligeKort(s, sete);
        if (lov.length < 2) return h;
        /**
         * Vrien er en SANNSYNLIGHET, ikke en overstyring: `vri` = 0,35 betyr
         * at vi tror dette setet spiller dyrest i omtrent en tredel av
         * stillingene der basis ville spilt noe annet. Å overstyre alltid
         * ville gjort motstandermodellen til en karikatur.
         */
        const terskel = Math.abs(vri);
        // Deterministisk «mynt» fra stillingen, ikke Math.random: rolloutene
        // maa vaere reproduserbare, ellers doer parringen i maalingene.
        const mynt = ((s.stikkSpilt * 31 + s.bord.length * 7 + sete) % 100) / 100;
        if (mynt >= terskel) return h;
        const kort = vri > 0 ? dyreste(lov, s.trumf) : billigste(lov, s.trumf);
        return { type: "SPILL", spiller: sete, kort };
      },
    };
  }
}
