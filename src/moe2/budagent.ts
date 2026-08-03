/**
 * BUDAGENTEN: budmodellen satt inn som en spiller.
 *
 * Legger seg utenpå en vilkårlig agent og overtar BARE budrunden. Kortspill,
 * vrak og trumfvalg går urørt videre til den indre agenten – samme
 * forsøksdesign som `Konvensjonsvakt`, og av samme grunn: en målt forskjell
 * kan da bare komme fra budet.
 *
 * BESLUTNINGEN er ikke en klassifisering av «hvilket bud», men en utregning:
 *
 *     modellen gir  (μ, σ) for fordelingen av lagstikk
 *     P(N)        = 1 − Φ((N − 0,5 − μ)/σ)
 *     EV(N)       = P(vinner budrunden med N) · 2N(2P(N)−1)
 *                 + (1 − P(vinner)) · EV(forsvar)
 *     valg        = argmax over lovlige N, mot PASS
 *
 * Modellen lærer altså det som varierer mellom hender, og utbetalingstabellen
 * – som er kjent eksakt – regnes ut i stedet for å læres. Se
 * `examples/budmodell.ts` for hvorfor: å lære 6–8 EV-utganger hver for seg er
 * å lære den samme støyen åtte ganger.
 *
 * ================== EN AVHENGIGHET SOM MÅ STÅ HER =========================
 *
 * Modellen kan anbefale bud 8 eller 11. Kortnettet er trent på data der 92 %
 * av kontraktene er bud 9–10 (`analyse/budhandling.txt`), så det spiller en
 * åtter som om den var en nier. En budmodell er derfor ikke uavhengig av
 * fase 0 i `docs/budplan.md` – blir denne målt negativt FØR kortnettet er
 * trent på spredte kontrakter, er det ikke budmodellen som er motbevist.
 *
 * BUDRUNDE-SANNSYNLIGHETEN er lagret i modellfila som en populasjonsstørrelse.
 * Den avhenger nesten bare av hva de ANDRE har, ikke av vår egen hånd, og er
 * derfor estimert én gang over datasettet i stedet for per hånd. Det er en
 * forenkling: mot en motstander som byr annerledes enn NevroHjerne er kurven
 * en annen, og da må modellen måles på nytt.
 */

import { readFileSync } from "node:fs";

import { tolkBudmodell, type Budmodell } from "./budmodell.ts";

/**
 * HVOR KODEN FAKTISK LIGGER. Selve regnestykket og `Budagent` er flyttet til
 * `budmodell.ts`, uten `node:fs`. Grunnen er nettsiden: esbuild med
 * nettleserplattform stopper paa en toppniva-import av `node:fs`, og Adams
 * skal kjoere i nettleseren med den SAMME klassen som benken bruker - ikke en
 * kopi som kan komme i utakt. Denne fila legger bare fillesingen oppaa og
 * re-eksporterer resten, saa alle eksisterende importer herfra virker uendret.
 */
export { Budagent, tolkBudmodell, type Budmodell, type Innagent } from "./budmodell.ts";

export function lesBudmodell(fil: string): Budmodell {
  return tolkBudmodell(JSON.parse(readFileSync(fil, "utf8")));
}
