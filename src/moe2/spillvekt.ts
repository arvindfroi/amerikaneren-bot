/**
 * A1 — VERDENSUTVALGET SKAL LESE SPILLET.
 *
 * `trekkVerdenBelief` vekter kandidatverdener etter budrunden alene
 * (`budForenlighet`). Renonser håndheves som HARDE forbud, så verdenene er
 * lovlige — men blant de lovlige er en verden der en spiller som la smått
 * sitter med alle essene, akkurat like sannsynlig som en der hen ikke gjør det.
 *
 * Det er fundamentet under alt annet: **alpha-mu er en bedre beslutningsregel
 * over et utvalg**, og kan ikke bli bedre enn verdenene den får. Å bygge M≥2
 * oppå et skjevt utvalg er å regne mer nøyaktig på feil tall.
 *
 * Trosnettet skulle løst dette og replikerte ikke (+0,34 / −0,12). Dette er
 * erstatningen: en EKSPLISITT regel, uten modell å trene, uten 4,6 MB å laste,
 * og uten et nett som kan drifte fra det den ble trent på.
 *
 * ================= SLUTNINGEN, OG HVORFOR NETTOPP DEN ====================
 *
 * Den sterkeste billige slutningen i et stikkspill er:
 *
 *   FULGTE DU FARGE OG LOT STIKKET GÅ, HAR DU IKKE NOE HØYERE I DEN FARGEN.
 *
 * Spilte en motstander ♠4 i et stikk som ble vunnet med ♠K, og verden gir dem
 * fortsatt ♠A — da valgte de å la et stikk gå de kunne tatt gratis. Det er
 * mulig (ducking finnes), men det er sjeldent, og en verden som krever det er
 * mindre sannsynlig enn en som ikke gjør det.
 *
 * REGELEN ER SVAK, IKKE HARD, og det er med vilje. Å utelukke slike verdener
 * helt ville gjort utvalget skjevt motsatt vei: en spiller som DUKKER for å
 * skjule et ess ville blitt umulig å modellere, og nettopp den linja er ekte i
 * spill mot mennesker. `STRAFF` er derfor en log-vekt og ikke et forbud.
 *
 * ================= HVA DEN IKKE GJØR =====================================
 *
 * Den leser bare STIKK SOM ER FERDIGSPILT, og bare der spilleren fulgte farge.
 * Utspill sier ingenting her (det finnes ingen vinner å sammenlikne mot), og
 * avkast er allerede dekket av renonseforbudet. Det er den delen av spillet
 * som lar seg lese uten en modell av hvordan folk spiller — resten hører til
 * A2 (motstandermodellen).
 */

import { type Farge, type Kort } from "../kort.ts";
import type { GameState } from "../motor.ts";
import { intTilKort } from "../solver/dds.ts";

/**
 * Log-straff per stikk der verdenen krever at spilleren lot et stikk gå de
 * kunne tatt.
 *
 * Størrelsen er en KALIBRERT ANTAKELSE, ikke en måling: den skal være stor nok
 * til å skille kandidatverdener, liten nok til at flere slike hendelser kan
 * summeres uten å bli et de facto forbud. Den skal sveipes som `evForsvar` og
 * `σGulv` ble det.
 */
export const STRAFF = 1.0;

/** Vinner-kortet i et ferdigspilt stikk, gitt trumf. */
function vinnerkort(kort: readonly { kort: Kort; spiller: number }[], trumf: Farge | null): Kort {
  let best = kort[0]!.kort;
  for (const kp of kort) {
    if (kp.kort.farge === best.farge) {
      if (kp.kort.verdi > best.verdi) best = kp.kort;
    } else if (trumf !== null && kp.kort.farge === trumf && best.farge !== trumf) {
      best = kp.kort;
    }
  }
  return best;
}

/**
 * Log-vekt for hvor godt verdenens skjulte hender stemmer med SPILLET.
 *
 * `hender` er kandidatverdenens fordeling. `observator` utelates — vi vet hva
 * vi selv har og trenger ingen slutning om det.
 */
export function spillForenlighet(
  state: GameState,
  hender: readonly (readonly Kort[])[],
  observator: number,
): number {
  const trumf = state.trumf;
  let logW = 0;

  for (const stikk of state.historikk) {
    if (stikk.kort.length < 2) continue;
    const led = stikk.kort[0]!.kort.farge;
    const vinner = vinnerkort(stikk.kort, trumf);

    for (const kp of stikk.kort) {
      const p = kp.spiller;
      if (p === observator) continue;
      // Bare FULGTE farge teller. Avkast og trumfing er dekket av renonse-
      // forbudet eller sier ingenting om styrke i den ledede fargen.
      if (kp.kort.farge !== led) continue;
      // Vant hen stikket, er det ingenting å slutte.
      if (kp.kort.farge === vinner.farge && kp.kort.verdi === vinner.verdi) continue;
      // Ville et kort hen FORTSATT har, vunnet stikket?
      const hand = hender[p] ?? [];
      for (const k of hand) {
        if (k.farge !== led) continue;
        const slår =
          vinner.farge === led ? k.verdi > vinner.verdi : false; // vunnet med trumf: farge slår ikke
        if (slår) {
          logW -= STRAFF;
          break; // én straff per stikk per spiller, ikke per kort
        }
      }
    }
  }
  return logW;
}

/** Klar til bruk som `ekstraVekt` i `trekkVerdenBelief`. */
export function lagSpillvekt(
  state: GameState,
  observator: number,
): (v: { hender: number[][] }) => number {
  return (v) => {
    // `intTilKort`, ikke en egen dekoding. Jeg skrev foerst
    // `FARGER[Math.floor(c/13)]` med `(c%13)+2` - som tilfeldigvis stemmer, men
    // som er en KOPI av motorens koding. Nettopp den driften er prosjektets
    // mest gjentatte feil; endres kodingen, ville denne fila lest kortene feil
    // uten at noe feilet.
    const kort: Kort[][] = v.hender.map((h) => h.map(intTilKort));
    return spillForenlighet(state, kort, observator);
  };
}
