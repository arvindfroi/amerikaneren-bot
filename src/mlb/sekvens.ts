/**
 * MLB — DEN ORDNEDE HANDLINGSREKKA (sonde B, 12. sep). Bygd fra `SpillerVisning` alene.
 *
 * ===================== HVORFOR DEN FINNES ================================
 *
 * Trohodets 996 trekk er GJENNOMGÅENDE AGGREGATER. `HVEM_LA` sier hvem som la hvert kort,
 * men ikke NÅR; `SPILT_FARGE` teller kort per farge og sete; signalblokken teller «fulgte
 * under» og «kastet» per farge. Ingen av dem bærer REKKEFØLGEN. To runder der de samme fire
 * setene la de samme kortene i motsatt orden gir bit-identiske trekk — og de to rundene er
 * ikke det samme spillet.
 *
 * Spørsmålet sonden skal svare på er derfor målbart, ikke retorisk: bærer rekkefølgen noe
 * ut over aggregatene? Denne fila lager inngangen som gjør det mulig å spørre, og INGENTING
 * annet. Den er ikke en ny sans i boten før en måling sier at den skal bli det.
 *
 * ===================== BUDSEKVENSEN FINNES IKKE ==========================
 *
 * Og det er verdt å skrive ned, for det er ikke et valg tatt her: `Budrunde` er
 * `{ passet, høyeste, sisteBud }`. Den har HØYESTE BUD PER SETE, ikke rekka av meldinger.
 * Rekkefølgen i auksjonen — hvem åpnet, hvem hoppet over hvem, på hvilket nivå hun passet —
 * står ikke i `SpillerVisning`, og heller ikke i `GameState`: den lever bare i
 * hendelsesstrømmen fra `utfør`, som ingen bokfører. `valgtbort.ts` noterte det samme da den
 * droppet «passet etter å ha budt»: «NIVÅET hun passet på finnes ikke i `SpillerVisning`».
 *
 * Rekka her er derfor KORTREKKA. At budrekka mangler, er et funn sonden rapporterer, ikke et
 * hull den fyller — å dikte den opp av `sisteBud` ville vært å måle en sans som ikke finnes.
 *
 * ===================== ALT ER OFFENTLIG ==================================
 *
 * Bare `historikk`, `bord` og `deg` leses. Ikke egen hånd, ikke eget vrak, ikke `makker`.
 * Setene roteres til RELATIVT sete som overalt ellers, så rekka er den samme for alle som så
 * de samme stikkene, bortsett fra rotasjonen. `test/mlb-sekvens.test.ts` bytter de skjulte
 * hendene, talongen og vraket og krever bit-identitet, med en felle som MÅ bli tatt.
 *
 * ===================== FORMATET ==========================================
 *
 * Fast lengde, fordi mottakeren er en `numpy.fromfile`: 48 steg (12 stikk × 4 kort er alt en
 * runde kan ha) à 4 felt. Ubrukte steg er −1 hele veien, aldri 0 — 0 er et LOVLIG relativt
 * sete og en lovlig kortindeks, og en modell som leser padding som «sete 0 la spar to» lærer
 * støy den ikke kan skille fra spill.
 *
 *   0 REL_SETE   hvem la kortet, relativt (0 = meg)
 *   1 KORT       kortindeks 0–51 (`kortIndeks`: farge × 13 + verdi − 2)
 *   2 STIKK      hvilket stikk kortet lå i (0-basert)
 *   3 POSISJON   plassen i stikket (0 = utspill)
 *
 * STIKK og POSISJON er utledbare av rekkefølgen alene, og ligger der likevel: en modell som
 * maskerer padding trenger dem for å vite hvor runden står uten å telle seg fram.
 */

import type { SpillerVisning } from "../motor.ts";
import { kortIndeks } from "../nevro/trekk.ts";

/** 12 stikk × 4 kort — alt en runde med fire spillere kan inneholde. */
export const SEKV_MAKS = 48;
/** REL_SETE, KORT, STIKK, POSISJON. */
export const SEKV_FELT = 4;
export const SEKV_LENGDE = SEKV_MAKS * SEKV_FELT;
/** Fyllverdien. Ikke 0: 0 er et lovlig sete OG en lovlig kortindeks. */
export const SEKV_TOM = -1;

export const SEKVENSFELT = { REL_SETE: 0, KORT: 1, STIKK: 2, POSISJON: 3 } as const;

/**
 * Den ordnede rekka av offentlige kortlegg denne runden, sett fra `visning.deg`.
 *
 * `n` er hvor mange steg som er fylt; resten av vektoren er `SEKV_TOM`. Kaster om runden har
 * flere kort enn `SEKV_MAKS` — stille avkorting ville gjort en modell blind for slutten av
 * lange runder uten at noe feilet.
 */
export function sekvensTrekk(visning: SpillerVisning): { n: number; v: Int16Array } {
  const v = new Int16Array(SEKV_LENGDE).fill(SEKV_TOM);
  const antall = visning.antallKort.length;
  const meg = visning.deg;
  const rel = (sete: number): number => (((sete - meg) % antall) + antall) % antall;

  let n = 0;
  const leggInn = (spiller: number, kort: number, stikk: number, posisjon: number): void => {
    if (n >= SEKV_MAKS) throw new Error(`Runden har mer enn ${SEKV_MAKS} kortlegg (stikk ${stikk})`);
    const o = n * SEKV_FELT;
    v[o + SEKVENSFELT.REL_SETE] = rel(spiller);
    v[o + SEKVENSFELT.KORT] = kort;
    v[o + SEKVENSFELT.STIKK] = stikk;
    v[o + SEKVENSFELT.POSISJON] = posisjon;
    n++;
  };

  for (let i = 0; i < visning.historikk.length; i++) {
    const stikk = visning.historikk[i]!;
    for (let j = 0; j < stikk.kort.length; j++) {
      const kp = stikk.kort[j]!;
      leggInn(kp.spiller, kortIndeks(kp.kort), i, j);
    }
  }
  // Det pågående stikket ligger sist, i den rekkefølgen kortene ble lagt.
  for (let j = 0; j < visning.bord.length; j++) {
    const kp = visning.bord[j]!;
    leggInn(kp.spiller, kortIndeks(kp.kort), visning.historikk.length, j);
  }
  return { n, v };
}
