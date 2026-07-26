/**
 * MESTERKLONEN: en rask stedfortreder for MesterAI, til bruk INNE i
 * SD-rolloutene.
 *
 * HVORFOR DEN ER BYGGET SOM ET PÅBYGG PÅ NEVROHJERNE, og ikke som et nett fra
 * bunnen. Da de første 7 000 stillingene var logget, ble nullpunktet målt:
 *
 *   GULV  uniformt lovlig valg      28,9 %
 *   NULL  NevroHjerne mot MesterAI  68,5 %
 *   TAK   MesterAI mot seg selv     78,0 %
 *
 * NevroHjerne er altså ALLEREDE enig med MesterAI i mer enn to av tre
 * kortvalg. En klone trent fra bunnen på atferdskloning må slå de 68,5 % før
 * den er verdt å bytte inn – og et ferskt nett på hundre tusen stillinger
 * kommer ikke dit. Da måler man ikke «riktig motstandermodell mot feil», man
 * måler «dårlig modell mot god», og et null-resultat blir uleselig.
 *
 * Kuren er å gi nettet NevroHjernes svar som en inngang. Modellen lærer da
 * KORREKSJONEN – hvor MesterAI avviker fra NevroHjerne – og har «kopier
 * NevroHjerne» tilgjengelig som en triviell løsning. Troskapen kan derfor i
 * prinsippet ikke havne under nullpunktet, og det som måles etterpå er
 * nøyaktig det spørsmålet oppdraget stiller.
 *
 * Trekkvektoren er `e1SpillTrekk` (273) etterfulgt av en 52-lang én-av-52 for
 * NevroHjernes valg = 325 trekk. Vektfilen har samme format som E1-nettene, og
 * `lesKloneNett` HÅNDHEVER inngangsbredden: en E1-fil (273) og en klonefil
 * (325) er ikke utbyttbare, og feilen skal ikke kunne skje i stillhet.
 *
 * KOSTNADEN er én ekstra NevroHjerne-utspørring per kortvalg i rolloutene.
 * NevroHjerne er selve modellen som brukes der i dag, så prisen er at
 * SD-evalueringen blir omtrent dobbelt så dyr per beslutning – ikke at den
 * bytter kostnadsklasse slik MesterAI selv (450 ms) ville gjort.
 */

import { readFileSync } from "node:fs";

import type { Kort } from "../kort.ts";
import { lovligeKort, type GameState, type Handling } from "../motor.ts";
import { e1SpillTrekk, E1_SPILL_DIM } from "../e1/trekk.ts";
import { forover, nettFraBytes, type NevroNett } from "../nevro/nett.ts";
import { kortIndeks, NevroAgent } from "../nevro/index.ts";

/** 273 E1-trekk + 52 for NevroHjernes valg. */
export const KLONE_DIM = E1_SPILL_DIM + 52;

/**
 * SNARVEIEN, og grunnen til at den er nødvendig.
 *
 * Å gi nettet NevroHjernes valg som INNGANG er ikke nok i praksis: for å bruke
 * den må et vanlig MLP lære en 52×52-identitet gjennom et skjult lag, og et
 * ferskt nett på hundre tusen stillinger gjør ikke det. Første forsøk (325 inn,
 * 64 skjulte, 7 000 stillinger) landet på 42 % – godt UNDER NevroHjernes egne
 * 68 %, altså en dårligere MesterAI-stedfortreder enn den den skulle erstatte.
 *
 * Derfor legges NevroHjernes valg også til RETT PÅ LOGITENE. Ved
 * initialisering er MLP-utgangen omtrent null, snarveien dominerer, og klonen
 * ER NevroHjerne – troskapen starter altså på nullpunktet i stedet for på
 * gulvet. Treningen lærer så bare AVVIKENE, som er nøyaktig det vi vil
 * modellere.
 *
 * Tallet må være IDENTISK her og i `verktoy/mester-tren.py`. Står de ulikt,
 * spiller klonen en annen policy enn den ble trent til, og ingenting feiler.
 * `test/moe2-mesterklone.test.ts` låser at et nullnett gir NevroHjernes kort.
 */
export const NEVRO_SNARVEI = 3;

export function lesKloneNett(fil: string): NevroNett {
  const nett = nettFraBytes(new Uint8Array(readFileSync(fil)));
  if (nett.length !== 1) throw new Error(`Klone: forventet ett nett i ${fil}, fikk ${nett.length}`);
  const første = nett[0]!.lag[0]!;
  if (første.inn !== KLONE_DIM) {
    throw new Error(
      `Klone: ${fil} tar ${første.inn} trekk, men klonevektoren er ${KLONE_DIM} ` +
        `(273 E1-trekk + 52 for NevroHjernes valg). En E1-fil kan ikke brukes her.`,
    );
  }
  const siste = nett[0]!.lag[nett[0]!.lag.length - 1]!;
  if (siste.ut !== 52) throw new Error(`Klone: siste lag har ${siste.ut} utganger, forventet 52`);
  return nett[0]!;
}

/**
 * Trekkvektoren. `nevroKort` er NevroHjernes valg i samme stilling – nøyaktig
 * det `mester-orakel.ts` logger som `kn`, så treneren og spilleren bygger
 * inngangen på samme måte.
 */
export function kloneTrekk(state: GameState, sete: number, nevroKort: Kort): Float32Array {
  const ut = new Float32Array(KLONE_DIM);
  ut.set(e1SpillTrekk(state, sete), 0);
  ut[E1_SPILL_DIM + kortIndeks(nevroKort)] = 1;
  return ut;
}

/**
 * Motstandermodellen. Kortspillet avgjøres av klonenettet; alt annet – bud,
 * vrak, trumfvalg – av NevroHjerne, som i E1Agent. Rolloutene i `vurderSD`
 * starter i SPILL-fasen og går til RUNDE_SLUTT, så det er kortspillet som
 * betyr noe her.
 */
export class MesterKlone {
  private readonly nett: NevroNett;
  private readonly nevro: NevroAgent;

  constructor(nett: NevroNett, nevro: NevroAgent = new NevroAgent()) {
    this.nett = nett;
    this.nevro = nevro;
  }

  static fraFil(fil: string): MesterKlone {
    return new MesterKlone(lesKloneNett(fil));
  }

  nyKamp(): void {
    this.nevro.nyKamp();
  }

  velgHandling(state: GameState): Handling {
    if (state.fase === "SPILL" && state.iTur !== null) {
      const sete = state.iTur;
      const lovlige = lovligeKort(state, sete);
      if (lovlige.length === 1) return { type: "SPILL", spiller: sete, kort: lovlige[0]! };
      // NevroHjernes svar hentes FØRST – det er en inngang til klonenettet,
      // ikke en reserve. Faller den ikke ut som et SPILL (skal ikke kunne skje
      // i denne fasen), spiller vi den rett ut i stedet for å gjette.
      const nevroH = this.nevro.velgHandling(state);
      if (nevroH.type !== "SPILL") return nevroH;
      const logits = forover(this.nett, kloneTrekk(state, sete, nevroH.kort));
      // Snarveien: samme addisjon som treneren gjør før tapet regnes.
      logits[kortIndeks(nevroH.kort)] += NEVRO_SNARVEI;
      let beste = lovlige[0]!;
      for (const k of lovlige) if (logits[kortIndeks(k)]! > logits[kortIndeks(beste)]!) beste = k;
      return { type: "SPILL", spiller: sete, kort: beste };
    }
    return this.nevro.velgHandling(state);
  }
}
