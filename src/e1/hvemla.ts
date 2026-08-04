/**
 * HVEM LA HVA (v10, indeks 558–713): spillhistorikken, ikke et sammendrag.
 *
 * Arvind, 5. august: *«men har den tilgang til hvem som har hevet hva gjennom
 * spillet? det er jo slik man bygger en slik estimering.»*
 *
 * NEI, DEN HADDE IKKE. Og det er den mest grunnleggende mangelen som er funnet
 * i denne kodingen.
 *
 * ============================ HVA SOM MANGLET =============================
 *
 * `spillTrekk` skriver alle spilte kort i én blokk uten spillertilordning:
 *
 *     settKort(v, 52, stikk.kort.map((k) => k.kort));
 *
 * `.map(k => k.kort)` kaster `spiller`. Blokk 52–103 sier bare «disse kortene
 * er ute».
 *
 * Alt nettet visste om HVEM var avledet og tapsbehefta:
 *
 *   246–261   renons per sete × farge – binært
 *   340–355   ANTALL av hver farge hvert sete har lagt
 *   376–427   HØYESTE og LAVESTE rang per sete × farge
 *
 * La sete 2 hjerter K, 7 og 3, ser nettet: antall 3, høyeste K, laveste 3. Det
 * kan ikke skilles fra K, 9, 3 – og de to innebærer ulike gjenværende hender.
 *
 * ========================= HVORFOR DET RAMMER TROEN ======================
 *
 * Trosnettet skal gjette hvor hvert usett kort ligger. Grunnlaget for en slik
 * slutning ER hvem som la hva: at noen kastet en høy ruter mens ruter ble
 * spilt sier noe helt annet enn at de kastet en lav. Modellen har til nå
 * jobbet fra et sammendrag av nettopp den informasjonen den trenger.
 *
 * =============================== KODINGEN =================================
 *
 * 52 kort × 3 RELATIVE MOTSTANDERSETER. Ett tall er 1 når det setet la det
 * kortet, ellers 0. Kort jeg selv har lagt står på null i hele blokken – de er
 * alt kjent gjennom egen hånd og historikk, og en fjerde rad ville doblet
 * bredden for informasjon som allerede finnes.
 *
 * MEMORERINGSFELLEN, og hvorfor denne ikke er en. Minneblokkens 52 én-av-
 * kolonner over EGET VRAK kostet spillefører −1,475: C(52,4) = 270 725
 * kombinasjoner mot ~30 000 førerrader ga nær unik signatur per giv, og bare
 * ett sete så dem.
 *
 * Denne blokken er annerledes på tre måter som hver for seg holder:
 *   – ALLE seter ser den, så den kan ikke bli et rolle-spesifikt fingeravtrykk
 *   – den vokser gjennom runden i stedet for å være satt fra start
 *   – den er OFFENTLIG informasjon, ikke noe bare én spiller kjenner
 *
 * Og den er det trosnettet trenger mest: en fullstendig, tapsfri beskrivelse
 * av hvem som la hva.
 */

import type { GameState } from "../motor.ts";
import { kortIndeks } from "../nevro/trekk.ts";

/** v9-bredden denne blokken legger seg oppå. */
export const HVEMLA_FRA = 558;
/** 52 kort × 3 relative motstanderseter. */
export const HVEMLA_ANTALL = 52 * 3;

const relSete = (sete: number, annet: number): number => (annet - sete + 4) % 4;

/**
 * Fyller indeks 558–713.
 *
 * Leser bare `state.historikk` og `state.bord`, som er offentlig for alle ved
 * bordet. Ingen tilgang til skjulte hender, ingen tilgang til vraket.
 */
export function fyllHvemLa(v: Float32Array, state: GameState, sete: number): void {
  const legg = (spiller: number, kort: { farge: string; verdi: number }): void => {
    const r = relSete(sete, spiller);
    if (r === 0) return; // egne kort er alt kjent
    v[HVEMLA_FRA + (r - 1) * 52 + kortIndeks(kort as never)] = 1;
  };
  for (const stikk of state.historikk) for (const kp of stikk.kort) legg(kp.spiller, kp.kort);
  for (const kp of state.bord) legg(kp.spiller, kp.kort);
}
