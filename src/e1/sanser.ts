/**
 * SANSEBLOKKEN (v9, indeks 470–557): det troen gjør mulig å REGNE UT.
 *
 * Arvind, 5. august: *«la oss gi nettet en sykt god hjerne.»*
 *
 * Alle fire delene er UTLEDET AV TROSNETTET, ikke oppsummeringer av
 * spillhistorikken. Skillet er hele grunnen til at denne blokken kan lykkes
 * der v8 målte null:
 *
 *   OPPSUMMERING   telling, renonsflagg, øvre grenser. Et nett med nok data
 *                  kunne regnet dem selv av de rå trekkene; blokken sparer
 *                  det bare for bryet.
 *   BEREGNING      integrerer en LÆRT FORDELING over reglenes
 *                  lovlighetslogikk. Det finnes ingen vei dit fra de rå
 *                  trekkene alene – nettet ville måttet lære troen på nytt,
 *                  inni seg selv, av langt mindre data enn troen fikk.
 *
 * ============================== DE FIRE DELENE ============================
 *
 *   470–521  STIKKSJANSE per kort på hånden. «Vinner dette kortet stikket?»
 *            Se `stikksjanse.ts`. Kalibrert på 19 200 trekk.
 *   522–537  FORVENTET FARGELENGDE per relativt sete × farge. Troblokken (v6)
 *            gir kombinatoriske GRENSER; dette er en lært forventning.
 *   538–553  P(SETET ER RENONS) per sete × farge. Renonsflagget i 246–261 er
 *            binært og bakoverskuende: det sier at noen ALLEREDE har vist
 *            renons. Dette sier hvor sannsynlig det er at de er tomme nå.
 *   554–557  POSISJON I STIKKET. Fjerdemann vet alt, andremann nesten
 *            ingenting. Utledbart av hvem som leder, men aldri eksplisitt.
 *
 * ======================== HVORFOR RENONS-ANSLAGET BITER ===================
 *
 * Det er svaret på Arvinds spørsmål «hvilken farge er trygg å lede». Føreren
 * vraket fire kort fra sine svakeste farger, så han er kortere der enn en
 * tilfeldig hånd – men det binære renonsflagget vet ingenting før han faktisk
 * har vist det. Troen er trent på fasit og har sett mønsteret tusenvis av
 * ganger.
 *
 * =============================== KARDINALITET =============================
 *
 * 88 tall, alle i [0, 1]. Ingen én-av-blokk over enkeltkort utenom
 * stikksjansen, som er indeksert på EGEN hånd og derfor ikke kan bli en
 * runde-ID – den er null for alle kort man ikke har.
 */

import { FARGER, type Farge, type Kort } from "../kort.ts";
import type { GameState } from "../motor.ts";
import { fargeIndeks, kortIndeks } from "../nevro/trekk.ts";
import { fyllStikksjanse, STIKK_FRA, STIKK_ANTALL } from "./stikksjanse.ts";

/** v8-bredden denne blokken legger seg oppå. */
export const SANS_FRA = STIKK_FRA;
/** 52 stikksjanse + 16 fargelengde + 16 renonsanslag + 4 posisjon. */
export const SANS_ANTALL = STIKK_ANTALL + 16 + 16 + 4;

const LENGDE = STIKK_FRA + STIKK_ANTALL;
const RENONS = LENGDE + 16;
const POSISJON = RENONS + 16;

/**
 * Fyller indeks 470–557.
 *
 * `tro` er trosnettets fordeling, `tro[kort][klasse]` med klasse 0–2 for
 * relativt sete 1–3 og 3 for dødt. Er den `null`, står blokken på null – da
 * vet vi ingenting, og null er den ærlige verdien.
 */
export function fyllSanser(
  v: Float32Array,
  state: GameState,
  sete: number,
  tro: readonly (readonly number[])[] | null,
): void {
  // POSISJON I STIKKET settes uansett – den krever ingen tro.
  if (state.fase === "SPILL") {
    const p = Math.min(3, state.bord.length);
    v[POSISJON + p] = 1;
  }
  if (tro === null) return;

  fyllStikksjanse(v, state, sete, tro);

  // Hvilke kort er fortsatt usett? Bare de bærer informasjon.
  const sett = new Set<number>();
  for (const k of state.hender[sete] ?? []) sett.add(kortIndeks(k));
  for (const stikk of state.historikk) for (const kp of stikk.kort) sett.add(kortIndeks(kp.kort));
  for (const kp of state.bord) sett.add(kortIndeks(kp.kort));
  // Budvinneren ser sitt eget vrak; for ham er de kortene ikke gjetning.
  if (state.budvinner === sete) for (const k of state.vrak) sett.add(kortIndeks(k));

  for (let r = 1; r <= 3; r++) {
    for (let f = 0; f < 4; f++) {
      const farge = FARGER[f] as Farge;
      let forventet = 0;
      // P(renons) = P(ingen av fargens usette kort ligger hos setet).
      let ingen = 1;
      for (let verdi = 2; verdi <= 14; verdi++) {
        const ki = kortIndeks({ farge, verdi } as Kort);
        if (sett.has(ki)) continue;
        const p = tro[ki]?.[r - 1] ?? 0;
        forventet += p;
        ingen *= 1 - p;
      }
      // Egen rad (r = 0) settes til det man FAKTISK har – der er det ingen
      // usikkerhet, og å la troen gjette på egen hånd ville vært støy.
      v[LENGDE + (r - 1) * 4 + f] = Math.min(1, forventet / 13);
      v[RENONS + (r - 1) * 4 + f] = Math.max(0, Math.min(1, ingen));
    }
  }
  // Egen fargefordeling i de fire siste plassene av lengdeblokken.
  const egen = state.hender[sete] ?? [];
  for (let f = 0; f < 4; f++) {
    const n = egen.filter((k) => fargeIndeks(k.farge) === f).length;
    v[LENGDE + 12 + f] = n / 13;
    v[RENONS + 12 + f] = n === 0 ? 1 : 0;
  }
}
