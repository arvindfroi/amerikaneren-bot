/**
 * MAKRO → MESO — kampstillingen inn i BUDET (K5 → K3).
 *
 * ARVIND: «amerikaneren er et spill med 3 nivåer […] alle 3 nivåer må forstås
 * for å danne et bilde over spillet og tilpasse atferd på en passelig måte.»
 *
 *     makro   sammenlagt ledelse og løpet mot 100   `race.ts`
 *     meso    kontrakten som spilles                `budmodell.ts`
 *     mikro   hvert enkelt stikk                    alpha-mu + vakten
 *
 * Hullet `AdamsMax.md` peker på er makro → meso. `racepress` har styrt hvor mye
 * risiko SØKET tar i et stikk siden K5-prøven, men `totalPoeng` har hatt **null
 * treff** i `budmodell.ts` og `budagent.ts`. En bot som ligger 30 poeng bak med
 * tre runder igjen har bydd nøyaktig som en som leder.
 *
 * ================= HVORFOR PRESSET GJENBRUKES OG IKKE REGNES PÅ NYTT =====
 *
 * `racepress` er den eneste definisjonen av «hvor langt er vi kommet, og
 * ligger vi over eller under». En ny her ville vært samme feilklasse som
 * `signal.ts` hadde: avsender og leser med hver sin kode for det samme, som
 * driver fra hverandre uten at noen test blir rød. Derfor importeres den, og
 * derfor har mikro og meso GARANTERT samme syn på kampstillingen.
 *
 * ================= FORMEN: EN KVANTIL AV LAGSTIKKFORDELINGEN =============
 *
 * Budmodellen gir en fordeling over lagstikk, `(μ, σ)`, og beslutningen leser
 * bare `P(lagstikk ≥ N)` ut av den. Da er det ETT sted kampstillingen hører
 * hjemme: hvilken del av den fordelingen budet skal verdsettes etter.
 *
 *     ligger BAK   →  en ØVRE kvantil — vi trenger halen for å ta igjen
 *     leder        →  en NEDRE        — vi trenger å ikke rote det bort
 *
 *     μ' = μ + clamp(λ · press, −1, +1) · σ
 *
 * Det er samme sak som `racescore` gjør på utfallsvektoren fra alpha-mu, med én
 * bevisst forskjell: **vi måler vippet i σ og ikke i sannsynlighetsnivå.**
 * `racescore` kan si «kvantil 0,95» fordi den har en EMPIRISK vektor der q → 1
 * bare gir det største observerte utfallet. Normalfordelingens kvantil
 * DIVERGERER når q → 1, så den bokstavelige oversettelsen ville blåst opp i
 * randen der `vekt = 1`. z-formen er den samme familien av øvre/nedre
 * kvantiler, bare parametrisert monotont om — og den er endelig overalt.
 * (Ved fullt vipp er `μ'` 84 %-kvantilen når vi ligger bak, 16 % når vi leder.)
 *
 * Retningen faller da ut av seg selv: høyere μ' løfter `P` for HVERT bud, så
 * `ev = p·2N(2P−1) + (1−p)·fv` vokser mot terskelen — vi byr oftere og høyere.
 * Lavere μ' gjør det motsatte. Terskelen røres ikke; å ha to knotter som
 * begge flytter samme beslutning ville gjort et sveip umulig å lese.
 *
 * ================= NULLPUNKTET =========================================
 *
 * Vedleggsregel 5: «en knott må ha et nullpunkt som er bit-identisk med av.»
 * `λ = 0` og `press = 0` returnerer begge `μ` UENDRET — ikke `μ + 0`, men
 * samme tall gjennom en tidlig retur, så ingen flyttallsaddisjon kan endre
 * siste bit. `test/makro-meso.test.ts` håndhever det på hele budgivningen.
 *
 * ================= FELLEN: DENNE MODULEN ER USYNLIG PÅ GATE 2 ===========
 *
 * **`examples/gate2.ts` starter hver giv på 0–0.** `racepress` returnerer da
 * eksakt 0 (`framdrift < 0.3`), `kampjustertMu` returnerer μ uendret, og
 * modulen er BIT-IDENTISK med av i hver eneste rad gate 2 skriver. Måler du
 * den der, måler du ingenting — og det er ikke en hypotese, det er strukturelt.
 *
 * Det har skjedd før: `r0.4` i ADAMS_V6 ble konkludert inert av NØYAKTIG denne
 * grunnen, og hadde da aldri fått lov til å fyre én eneste gang.
 *
 * **`examples/kamp.ts` (kampbenken) er den eneste benken som kan se dette**,
 * fordi den er den eneste som spiller kamper til `målPoeng` og dermed
 * produserer stillinger med `framdrift ≥ 0,3`. `verktoy/kampport.sh` finnes.
 */

import type { GameState } from "../motor.ts";
import { racepress } from "./race.ts";

/**
 * Vippet på lagstikkfordelingen, målt i standardavvik, i [−1, +1].
 *
 * Positivt = vi ligger bak og verdsetter budet etter en ØVRE kvantil.
 * Negativt = vi leder og verdsetter det etter en NEDRE.
 *
 * `λ` er knotten som skal sveipes. Den er 0 i standard, og 0 er den eneste
 * verdien som er målt — alt annet er en påstand til noen kjører kampbenken.
 */
export function kampvipp(press: number, lambda: number): number {
  if (lambda === 0 || press === 0) return 0;
  return Math.max(-1, Math.min(1, lambda * press));
}

/**
 * μ verdsatt etter kampstillingen.
 *
 * Returnerer `μ` UFORANDRET når knotten er av eller racet er jevnt/tidlig —
 * samme tall, ikke bare samme verdi.
 */
export function kampjustertMu(μ: number, σ: number, press: number, lambda: number): number {
  const vipp = kampvipp(press, lambda);
  if (vipp === 0) return μ;
  return μ + vipp * σ;
}

/**
 * Kampstillingen for et sete, slik BUDET skal se den — samme tall som søket
 * bruker i mikronivået. Egen funksjon bare for å ha ETT importsted, slik at
 * ingen fristes til å regne presset på nytt her.
 */
export function budpress(state: GameState, sete: number): number {
  return racepress(state, sete);
}
