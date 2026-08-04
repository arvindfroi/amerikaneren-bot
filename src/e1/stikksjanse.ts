/**
 * STIKKSJANSEN (v9, indeks 470–521): vinner dette kortet stikket?
 *
 * ARVINDS KJEDE, 4. august:
 *
 *   «hvis jeg hiver ut en hjerter nå så kan john doe kanskje ta stikket og vi
 *    feller kontrakten.»
 *
 * Det er det mest beslutningsrelevante tallet som finnes i kortspill, og
 * vektoren har det ikke. Den har MESTERKORT – et binært flagg for høyeste
 * gjenværende i fargen – men ikke sannsynligheten for at akkurat dette kortet
 * tar stikket NÅ, gitt hvem som sitter med hva.
 *
 * ===================== HVORFOR DETTE FORTJENER HÅNDBYGGING ================
 *
 * Blokkene som målte null natt til 5. august var OPPSUMMERINGER: tellinger,
 * renonser, grenser. Ting nettet i prinsippet kunne regnet ut selv av de rå
 * trekkene, og som det derfor bare fikk servert litt tidligere.
 *
 * Dette er noe annet. Det integrerer en LÆRT FORDELING over reglenes
 * lovlighetslogikk: hvem må følge farge, hvem kan trumfe, og hva ville de i så
 * fall lagt. Det er ikke en oppsummering et nett kan finne på egen hånd – det
 * er en beregning som krever både troen og reglene.
 *
 * ============================== METODEN ===================================
 *
 * For hvert kort på hånden: sannsynligheten for at INGEN av de gjenværende
 * spillerne legger noe som slår det.
 *
 *     P(vinner) = Π  P(spiller p kan ikke slå kortet)
 *                 p
 *
 * `P(p kan ikke slå)` leses av trosnettet: for hvert kort som VILLE slått,
 * hvor sannsynlig er det at p sitter med det – og er det i det hele tatt
 * lovlig for p å legge det.
 *
 * ========================= TRE FORBEHOLD, ALLE EKTE =======================
 *
 * UAVHENGIGHET. Troen gir P(kort → sete) per kort. Å gange dem sammen antar at
 * kortene ligger uavhengig, og det gjør de ikke – håndstørrelsene er faste, så
 * har p ett av kortene er han litt mindre sannsynlig å ha de andre. Produktet
 * UNDERVURDERER derfor litt hvor ofte kortet holder.
 *
 * ALLE SLÅR HVIS DE KAN. Vi antar at en spiller som KAN slå, GJØR det. Det er
 * usant i praksis – en forsvarer sparer ofte et høyt kort.
 *
 * JEG SKREV FØRST at de to forbeholdene til sammen gjorde tallet til en NEDRE
 * grense. MÅLINGEN SA NEI. På 19 200 trekk er anslagene litt OPTIMISTISKE i
 * midtsjiktet – ved anslag 0,5–0,6 vinner kortet 45,9 % av gangene, ikke 55 %.
 * Uavhengighetsantakelsen trekker altså sterkere enn «alle slår».
 *
 * Kalibreringen er likevel god: monoton over hele spennet, og innenfor 5–9
 * prosentpoeng i hver bøtte. Tallet er brukbart – det er RETNINGEN på feilen
 * jeg tok feil om, ikke om det er informativt.
 *
 * DE SOM ALT HAR SPILT teller ikke. Er kortet allerede slått av det som ligger
 * på bordet, er svaret 0 og ingen tro trengs.
 */

import { FARGER, type Farge, type Kort } from "../kort.ts";
import type { GameState } from "../motor.ts";
import { fargeIndeks, kortIndeks } from "../nevro/trekk.ts";

/** v8-bredden denne blokken legger seg oppå. */
export const STIKK_FRA = 470;
/** Én sannsynlighet per kort i kortstokken; 0 for kort man ikke har. */
export const STIKK_ANTALL = 52;

const relSete = (sete: number, annet: number): number => (annet - sete + 4) % 4;

/** Slår `ny` det beste kortet på bordet? Samme regel som `motor.ts`. */
function slår(ny: Kort, best: Kort, trumf: Farge, ledFarge: Farge): boolean {
  const nyT = ny.farge === trumf;
  const bT = best.farge === trumf;
  if (nyT && !bT) return true;
  if (!nyT && bT) return false;
  if (nyT && bT) return ny.verdi > best.verdi;
  if (ny.farge !== ledFarge) return false;
  if (best.farge !== ledFarge) return true;
  return ny.verdi > best.verdi;
}

/**
 * Fyller indeks 470–521.
 *
 * `tro[kort][klasse]` er trosnettets fordeling: klasse 0–2 er relativt sete
 * 1–3, klasse 3 er dødt. Er den `null`, fylles blokken med nuller – da vet vi
 * ingenting, og null er den ærlige verdien.
 */
export function fyllStikksjanse(
  v: Float32Array,
  state: GameState,
  sete: number,
  tro: readonly (readonly number[])[] | null,
): void {
  if (tro === null || state.trumf === null || state.fase !== "SPILL") return;
  const trumf = state.trumf;
  const hånd = state.hender[sete] ?? [];
  if (hånd.length === 0) return;

  // Hvem har ikke spilt ennå i dette stikket, og hva er ledfargen?
  const bord = state.bord;
  const N = state.antallSpillere;
  const ledFarge: Farge | null = bord.length > 0 ? bord[0]!.kort.farge : null;
  const igjen: number[] = [];
  for (let i = bord.length + 1; i < N; i++) {
    // Spillerne etter meg i turrekkefølgen fra dette stikkets utspiller.
    const utspiller = bord.length > 0 ? bord[0]!.spiller : sete;
    igjen.push((utspiller + i) % N);
  }

  // Beste kort på bordet nå.
  let best: Kort | null = null;
  for (const kp of bord) {
    if (best === null || slår(kp.kort, best, trumf, ledFarge ?? kp.kort.farge)) best = kp.kort;
  }

  // Hvilke kort er fortsatt usett? Bare de kan ligge hos noen.
  const sett = new Set<number>();
  for (const k of hånd) sett.add(kortIndeks(k));
  for (const stikk of state.historikk) for (const kp of stikk.kort) sett.add(kortIndeks(kp.kort));
  for (const kp of bord) sett.add(kortIndeks(kp.kort));

  for (const mitt of hånd) {
    const led = ledFarge ?? mitt.farge;
    // Slår kortet i det hele tatt det som alt ligger? Hvis ikke er svaret 0.
    if (best !== null && !slår(mitt, best, trumf, led)) {
      v[STIKK_FRA + kortIndeks(mitt)] = 0;
      continue;
    }
    // Etter mitt trekk er dette kortet å slå.
    let p = 1;
    for (const annen of igjen) {
      const r = relSete(sete, annen);
      // Kan `annen` følge fargen? Det avgjør hva som er lovlig for ham.
      // Sannsynligheten for at han har MINST ett kort i ledfargen.
      let harIkkeLed = 1;
      const ledIdx = fargeIndeks(led);
      for (let verdi = 2; verdi <= 14; verdi++) {
        const ki = kortIndeks({ farge: FARGER[ledIdx] as Farge, verdi } as Kort);
        if (sett.has(ki)) continue;
        harIkkeLed *= 1 - (tro[ki]?.[r - 1] ?? 0);
      }
      const harLed = 1 - harIkkeLed;

      // SLÅR MED LEDFARGE: må ha et høyere kort i fargen.
      let ikkeSlårIFarge = 1;
      for (let verdi = 2; verdi <= 14; verdi++) {
        const kort = { farge: FARGER[ledIdx] as Farge, verdi } as Kort;
        const ki = kortIndeks(kort);
        if (sett.has(ki)) continue;
        if (slår(kort, mitt, trumf, led)) ikkeSlårIFarge *= 1 - (tro[ki]?.[r - 1] ?? 0);
      }

      // SLÅR MED TRUMF: bare lovlig hvis han er renons i ledfargen.
      let ikkeSlårMedTrumf = 1;
      if (led !== trumf) {
        const tIdx = fargeIndeks(trumf);
        for (let verdi = 2; verdi <= 14; verdi++) {
          const kort = { farge: FARGER[tIdx] as Farge, verdi } as Kort;
          const ki = kortIndeks(kort);
          if (sett.has(ki)) continue;
          if (slår(kort, mitt, trumf, led)) ikkeSlårMedTrumf *= 1 - (tro[ki]?.[r - 1] ?? 0);
        }
      }

      // Har han ledfargen MÅ han følge; ellers kan han trumfe.
      const slårIkke = harLed * ikkeSlårIFarge + harIkkeLed * ikkeSlårMedTrumf;
      p *= Math.max(0, Math.min(1, slårIkke));
    }
    v[STIKK_FRA + kortIndeks(mitt)] = p;
  }
}
