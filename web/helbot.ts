/**
 * ============ ADAMS MAX I WORKEREN: ÉN KJEDE PER SETE, BYGD AV SPEKPARSEREN ============
 *
 * Arm B i A/B-demoen. Kjeden bygges av `lagIndre` — den samme funksjonen alle node-målinger
 * (K1, løkka, fart-k1) bruker — og ikke av en håndskrevet kopi. Vektfilene leses fra et
 * minnefilsystem som workeren fyller fra hovedtråden (`web/nettleser/fs.ts`, koblet inn som
 * `node:fs` av byggeskriptet). I Node leser den ekte disk, og da er den en referanse.
 *
 * ÉN AGENT PER SETE, som i `examples/duplikat-menneske.ts` (K1-driveren): hver agent får
 * `velgHandling` for sitt eget sete og `observer` ved hver `RUNDE_SLUTT`. Hukommelsene
 * (økta, profilen, søketroen, BudQ-boka, kortboka) er dermed setets egne, som i målingen.
 *
 * `okt:` PAKKES UT HER, bit for bit som i `lagIndre`: `okt:<rest>` er
 * `lagIndre(<rest>, { økt: new Økt(), bokfrø: null })` bak et objekt som ikke har `indre`.
 * Uten utpakkingen kunne ikke søkelaget nås, og nødbremsen (`fristMs`) ikke settes. At
 * utpakkingen er lik speken, er det fingeravtrykket i `examples/ab-avtrykk.ts` som beviser.
 */

import type { GameState, Handling } from "../src/motor.ts";
import { lagIndre, type Spekagent } from "../src/moe2/agentspek.ts";
import { Økt } from "../src/moe2/okt.ts";
import { Sikkerorakel } from "../src/moe2/sikkerorakel.ts";

export interface Helbotsete {
  readonly agent: Spekagent;
  /** Søkelaget, for tellerne og nødbremsen. `null` hvis speken ikke søker. */
  readonly sik: Sikkerorakel | null;
}

/** Følger `indre` til søkelaget (Vrakrangerer → EksaktSluttspill → Profilagent → Sikkerorakel). */
export function finnSøk(agent: unknown): Sikkerorakel | null {
  let x: unknown = agent;
  for (let d = 0; d < 16 && x !== null && typeof x === "object"; d++) {
    if (x instanceof Sikkerorakel) return x;
    x = (x as { indre?: unknown }).indre;
  }
  return null;
}

export function byggHelbotsete(spek: string, fristMs: number | null): Helbotsete {
  let agent: Spekagent;
  let kjerne: unknown;
  if (spek.startsWith("okt:") && !spek.startsWith("okt:profil=")) {
    const økt = new Økt();
    const inn = lagIndre(spek.slice(4), { økt, bokfrø: null });
    kjerne = inn;
    agent = {
      velgHandling: (s: GameState): Handling => inn.velgHandling(s),
      nyKamp: (): void => {
        økt.nyKamp();
        inn.nyKamp();
      },
      observer: (s: GameState): void => (inn as { observer?(x: GameState): void }).observer?.(s),
    } as unknown as Spekagent;
  } else {
    agent = lagIndre(spek);
    kjerne = agent;
  }
  const sik = finnSøk(kjerne);
  if (fristMs !== null) {
    if (sik === null) throw new Error("helbot: fant ikke søkelaget – nødbremsen kan ikke settes");
    if (!(fristMs > 0)) throw new Error(`helbot: fristMs må være > 0, fikk ${fristMs}`);
    // `private readonly` er en kompileringsregel. Feltet leses i hvert `velgHandling`.
    (sik as unknown as { fristMs: number | null }).fristMs = fristMs;
  }
  return { agent, sik };
}

/**
 * HUKOMMELSENS VAKT. `MlbSøketro` kaster hvis en runde aldri ble vist som `RUNDE_SLUTT`
 * (f.eks. fordi workeren var treg da runden sluttet). Da er en ny bok riktig: kortere
 * hukommelse, aldri gal — samme regel som K1-driveren. Returnerer `true` når boka ble nullet.
 */
export class Bokvakt {
  private første: number | null = null;
  private readonly sluttet = new Set<number>();

  nyKamp(): void {
    this.første = null;
    this.sluttet.clear();
  }

  /** Kalles med hver `RUNDE_SLUTT` som vises agentene. */
  slutt(s: GameState): void {
    if (this.første === null) this.første = s.rundeNr;
    this.sluttet.add(s.rundeNr);
  }

  /** Før et trekk: `true` = en runde mangler, og bøkene må nulles før trekket. */
  brudd(s: GameState): boolean {
    if (this.første === null) {
      this.første = s.rundeNr;
      return false;
    }
    if (s.rundeNr < this.første) return true;
    for (let r = this.første; r < s.rundeNr; r++) if (!this.sluttet.has(r)) return true;
    return false;
  }
}
