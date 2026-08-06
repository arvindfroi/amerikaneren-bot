/**
 * PREDIKSJON SOM LIKELIHOOD — ikke som håndskrevne regler.
 *
 * ARVIND: «når det gjelder prediksjonen så burde det ikke være normale regler
 * men enten læring over tid eller matematiske formler som vi vet kommer til å
 * gi best resultater.»
 *
 * Innvendingen er riktig. `hvemla-slutning.ts` har fire regler med HÅNDSATTE
 * konstanter (−1,0, −1,5, +0,15). Det er nøyaktig den klassen prosjektet er
 * blitt tatt av før: `evForsvar` sto på 2,5 kalibrert mot et kortnett som ikke
 * fantes lenger, og `μSkift` var et seleksjonsartefakt. En konstant som ingen
 * har målt er en gjetning med desimaler.
 *
 * ================= DEN RIKTIGE FORMELEN ==================================
 *
 * Bayes, uten pynt:
 *
 *     P(verden | observasjoner) ∝ P(observasjoner | verden) · P(verden)
 *
 * `P(verden)` er allerede riktig: trekningen er uniform over de fordelingene
 * som er FORENLIGE med renonser og spilte kort, altså den kombinatoriske
 * prioren.
 *
 * Det som manglet er likelihooden, og den har en eksakt form:
 *
 *     P(observasjoner | verden) = ∏ P(spiller p la kort c | p sin hånd i
 *                                     verden w, stillingen den gang)
 *
 * Ingen konstanter. Ingen regler. Bare: **hvor sannsynlig var det de faktisk
 * gjorde, hvis verden er slik?**
 *
 * ================= ATFERDSMODELLEN ER POLICYEN VI ALLEREDE HAR ===========
 *
 * `P(kort | hånd, stilling)` krever en modell av hvordan folk spiller. Vi har
 * en: kortnettet gir logits over 52 kort, og en softmax over de LOVLIGE
 * kortene er en gyldig sannsynlighetsfordeling.
 *
 * Det er også hvorfor dette subsumerer alle fire reglene. «Fulgte farge og
 * vant ikke» får lav sannsynlighet automatisk hvis policyen ville tatt stikket
 * — vi trenger ikke skrive regelen, den faller ut. Og «kastet av uten å
 * trumfe» likeså.
 *
 * ================= TEMPERATUREN ER DET ENE VALGET SOM STÅR IGJEN =========
 *
 * `tau` styrer hvor skarpt vi tror motstanderen følger policyen:
 *
 *   tau → 0    de spiller ALLTID policyens beste kort (for skarpt: ett avvik
 *              gjør verdenen umulig)
 *   tau = 1    de følger policyen slik nettet uttrykker den
 *   tau → ∞    de spiller tilfeldig (likelihooden blir flat og verdiløs)
 *
 * Den er én parameter mot fire, den har en tolkning, og den skal SVEIPES —
 * ikke settes.
 *
 * ================= KOSTNADEN, OG HVORFOR VINDUET FINNES ==================
 *
 * Å regne likelihooden eksakt krever ett nettpass per observerte kort per
 * kandidatverden. Med 32 kandidater og 44 spilte kort blir det 1 400 pass per
 * beslutning — omtrent en dobling av søkets kostnad.
 *
 * `vindu` begrenser til de SISTE k stikkene. De nyeste observasjonene bærer
 * mest informasjon om hva som er igjen på hånden, og de eldste er allerede
 * fanget av renonseforbudet. Vinduet er en kostnadsgrense og gjør beregningen
 * approksimativ — det står her, ikke i en fotnote.
 */

import { lovligeKort, utfør, type GameState } from "../motor.ts";
import type { Kort } from "../kort.ts";
import { kortIndeks } from "../nevro/trekk.ts";
import { intTilKort } from "../solver/dds.ts";

/** Modellen som sier hvor sannsynlig hvert kort er. */
export interface Atferdsmodell {
  /** Logits over alle 52 kort, sett fra `sete` i `state`. */
  logits(state: GameState, sete: number): Float32Array | number[];
}

export interface TroverdighetOpts {
  /** Skarphet. 1 = følg policyen som den er. Skal sveipes, ikke settes. */
  readonly tau?: number;
  /** Antall siste STIKK som telles. Kostnadsgrense, gjør formelen approksimativ. */
  readonly vindu?: number;
}

/**
 * log P(observasjoner | verden), summert over de andres kort i vinduet.
 *
 * Verdenen gis som hender i kort-int-form, slik trekningen leverer dem.
 * Observatøren utelates: vi trenger ingen slutning om vår egen hånd.
 */
export function logTroverdighet(
  state: GameState,
  observator: number,
  verdenHender: readonly number[][],
  modell: Atferdsmodell,
  opts: TroverdighetOpts = {},
): number {
  const tau = Math.max(1e-3, opts.tau ?? 1);
  const vindu = Math.max(1, opts.vindu ?? 2);

  const alle = state.historikk;
  const fra = Math.max(0, alle.length - vindu);
  if (fra >= alle.length) return 0;

  /**
   * REKONSTRUKSJONEN — BARE VINDUET, og det er to rettelser i én.
   *
   * FØRSTE FORSØK spilte om HELE runden fra stikk 0 med `medVerden`. Begge
   * deler var feil, og motoren sa det høyt («Ulovlig kort: K7»):
   *
   *   `medVerden` BEHOLDER observatørens NÅVÆRENDE hånd med vilje — vi vet jo
   *   hva vi har. Men replayen trenger hånden slik den var FØR vi spilte, så
   *   den forsøkte å legge kort vi allerede hadde lagt.
   *
   *   Og fra stikk 0 gjelder MAKKERPLIKTEN: den som har det etterlyste kortet
   *   MÅ legge det. I en kandidatverden kan det kortet ligge et annet sted, og
   *   da er den observerte historikken ulovlig i den verdenen — uten at det
   *   sier noe om hvor sannsynlig verdenen er.
   *
   * Løsningen er å rekonstruere fra starten av VINDUET: hendene der er
   * verdenens hender pluss kortene som er spilt i vinduet. Ingen makkerplikt,
   * ingen observatørkonflikt, og en tredel av kostnaden.
   */
  const hender: Kort[][] = verdenHender.map((h) => h.map(intTilKort));
  for (const kp of state.bord) (hender[kp.spiller] ??= []).push(kp.kort);
  for (let i = alle.length - 1; i >= fra; i--) {
    for (const kp of alle[i]!.kort) (hender[kp.spiller] ??= []).push(kp.kort);
  }

  // Stikk vunnet FØR vinduet – trengs ikke for lovlighet, men holder
  // tilstanden sann slik at nettet ser riktige trekk.
  const vunnet = new Array<number>(state.antallSpillere).fill(0);
  for (let i = 0; i < fra; i++) {
    const v = alle[i]!.vinner;
    if (typeof v === "number") vunnet[v] = (vunnet[v] ?? 0) + 1;
  }

  let s = {
    ...state,
    hender,
    historikk: alle.slice(0, fra),
    bord: [],
    stikkSpilt: fra,
    stikkVunnet: vunnet,
    iTur: alle[fra]!.kort[0]!.spiller,
    etterlyst: null,
  } as unknown as GameState;

  let logP = 0;
  let spilt = 0;
  for (let i = fra; i < alle.length; i++) {
    for (const kp of alle[i]!.kort) {
      if (s.fase !== "SPILL" || s.iTur !== kp.spiller) return Number.NEGATIVE_INFINITY;
      if (kp.spiller !== observator) {
        const lov = lovligeKort(s, kp.spiller);
        // Er kortet ikke lovlig her, er verdenen uforenlig med historikken.
        if (!lov.some((k) => k.farge === kp.kort.farge && k.verdi === kp.kort.verdi)) {
          return Number.NEGATIVE_INFINITY;
        }
        if (lov.length > 1) {
          const g = modell.logits(s, kp.spiller);
          let maks = -Infinity;
          for (const k of lov) maks = Math.max(maks, (g[kortIndeks(k)] ?? 0) / tau);
          let sum = 0;
          for (const k of lov) sum += Math.exp((g[kortIndeks(k)] ?? 0) / tau - maks);
          logP += (g[kortIndeks(kp.kort)] ?? 0) / tau - maks - Math.log(sum);
          spilt++;
        }
      }
      s = utfør(s, { type: "SPILL", spiller: kp.spiller, kort: kp.kort }).state;
    }
  }
  // Normaliser på antall observasjoner, ellers straffes lange runder mer enn
  // korte og vekten blir uforenlig mellom stillinger.
  return spilt === 0 ? 0 : logP / spilt;
}

/** Klar til bruk som `ekstraVekt` i `trekkVerdenBelief`. */
export function lagTroverdighetsvekt(
  state: GameState,
  observator: number,
  modell: Atferdsmodell,
  opts: TroverdighetOpts = {},
): (v: { hender: number[][] }) => number {
  return (v) => {
    const x = logTroverdighet(state, observator, v.hender, modell, opts);
    // −∞ ville gjort exp() til 0 og verdenen umulig. Den ER umulig, men vi
    // returnerer et stort negativt tall i stedet, slik at trekningen alltid
    // har noe å velge mellom om ALLE kandidatene er uforenlige.
    return Number.isFinite(x) ? x : -50;
  };
}
