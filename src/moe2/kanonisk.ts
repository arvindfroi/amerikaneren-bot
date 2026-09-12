/**
 * KANONISK STILLING — POLICYEN SOM EN FUNKSJON AV DET SETET KAN VITE.
 *
 * FLYTTET HIT 12. sep fra `examples/naabart-tro.ts`, ordrett. Grunnen er at den nå har to
 * kallere på hver sin side av `src`/`examples`-skillet: det eksakte taket (naabart-tro) og
 * LIKELIHOOD-VEKTEN i søket (`likvekt.ts`), som er produksjonskode. En kopi i `src` ville
 * vært nøyaktig kopiklassen dette prosjektet er blitt tatt av før (GBT-kopien §76, tre
 * utgaver av utfallsmålet): to definisjoner av «kanonisk» og en likelihood som måler en
 * annen policy enn taket. `naabart-tro.ts` re-eksporterer herfra, så alle gamle importer
 * står.
 *
 * ============ HVORFOR DEN FINNES ==========================================
 *
 * MÅLT (naabart-tro.ts): i 5 av 24 kamper var den SANNE given uforenlig med bordets egne
 * handlinger. Årsaken var tre kortvalg der speken bryter likhet etter HVOR i hånden kortene
 * ligger (f.eks. ruter 3 med hånden i utdelingsorden, hjerter 3 med samme hånd sortert).
 * Utdelingsordenen er skjult, så en slik policy er IKKE en deterministisk funksjon av det
 * observatøren kan vite — og en likelihood bygget på den er en blanding over ordener, med
 * korrelasjon mellom beslutninger på kjøpet. `frø` leses også av enkelte lag (`budvakt`,
 * `uleselig`) og er like skjult.
 *
 * Kanonisk form er kuren: hender, talong og vrak sortert, frø 0. Da er policyen en funksjon
 * av kortMENGDEN, som er det en verden faktisk bestemmer.
 */

import type { GameState, Handling } from "../motor.ts";
import type { Kort } from "../kort.ts";
import { kortTilInt } from "../solver/dds.ts";

/**
 * Det en agent må kunne for å kanoniseres. STRUKTURELL med vilje, ikke `Spekagent`:
 * `agentspek.ts` importerer denne fila (for `~lik=`), og en typeimport tilbake ville laget
 * en syklus. Samme grep som `Visningstro` i `troprior.ts` («strukturell type, så `moe2`
 * ikke eier nettet»).
 */
export interface Kanoniserbar {
  velgHandling(s: GameState): Handling;
  nyKamp(): void;
  observer?(s: GameState): void;
}

const etterKort = (a: Kort, b: Kort): number => kortTilInt(a) - kortTilInt(b);

/** Stillingen med hender, talong og vrak sortert og frøet nullet. */
export function kanonisk(s: GameState): GameState {
  return {
    ...s,
    frø: 0,
    hender: s.hender.map((h) => h.slice().sort(etterKort)),
    talong: s.talong.slice().sort(etterKort),
    vrak: s.vrak.slice().sort(etterKort),
  };
}

/**
 * Samme agent, men den ser bare kanoniske stillinger.
 *
 * `observer` får den EKTE stillingen: bøkene bokfører bare offentlige ting, og en kanonisert
 * stilling ville ikke endret dem — men den ville skjult at det er den ekte kampen som føres.
 */
export function kanoniskAgent<A extends Kanoniserbar>(a: A): Kanoniserbar {
  return {
    velgHandling: (s: GameState) => a.velgHandling(kanonisk(s)),
    nyKamp: () => a.nyKamp(),
    ...(a.observer === undefined ? {} : { observer: (s: GameState) => a.observer!(s) }),
  };
}
