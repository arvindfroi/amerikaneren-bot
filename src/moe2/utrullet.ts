/**
 * DEN UTRULLEDE BOTEN, BYGD ETT STED — og derfor mulig å holde lik den målte.
 *
 * ARVIND: «alle deler skal fungere i samspill og gjøre hverandre bedre. ingen
 * bottlenecks.»
 *
 * ================= FLASKEHALSEN DENNE FILA FINNES FOR ====================
 *
 * `web/worker.ts` bygde Adams FOR HÅND, lag for lag, mens hver eneste måling
 * denne uka er kjørt gjennom `lagIndre(<spek>)`. De to hadde ingen felles kode
 * og ingen test som holdt dem sammen, og resultatet var målbart:
 *
 *   `okt:`      K4, hukommelsen over økten          IKKE i den utrullede boten
 *   `profil:`   K6, motstandernes vaner             IKKE i den utrullede boten
 *   `amu:`      K8/A5/A6/A7/A8, hele slutningen     IKKE i den utrullede boten
 *   `f`         stikk-1-billigst, målt +0,031       IKKE i den utrullede boten
 *   `tro`       trosnettet appen LASTER NED          sendt til workeren, og
 *                                                    aldri lest av den
 *
 * Den utrullede boten var `Sikkerorakel(bare fører) ∘ Vrakrangerer ∘ Budagent ∘
 * Konvensjonsvakt ∘ E1Agent`. Alt annet prosjektet har bygd og målt levde bare
 * på benken. Det er ikke en manglende utrulling — det er at det ikke fantes en
 * VEI fra det målte til det utrullede.
 *
 * ================= HVORFOR VEIEN IKKE FANTES =============================
 *
 * `agentspek.ts` importerer `node:fs` og laster modellene med `readFileSync`.
 * Nettleseren har ingen disk; den får vektene som base64 fra hovedtråden. Så
 * spekparseren KAN ikke kjøre der, og workeren hadde ikke noe annet valg enn å
 * duplisere kjeden.
 *
 * Alle søkemodulene er derimot nettleservennlige — `amuagent`, `okt`,
 * `profilagent`, `sdkort`, `signal`, `troverdighet`, `race` og `profil` rører
 * ingen av dem `node:fs`. Det er BARE parseren som er bundet til disken.
 * Derfor tar denne fila ferdig PARSEDE vekter og bygger den samme kjeden.
 *
 * ================= REKKEFØLGEN ER IKKE FRI ==============================
 *
 * Workeren la søket YTTERST, utenpå `Vrakrangerer`. Speken har `vr:` utenpå
 * `amu:`. Den slags forskjell er nøyaktig der «det målte og det utrullede var
 * ikke samme ting» bor — feilklassen som har tatt dette prosjektet tretten
 * ganger. Kjeden her følger speken:
 *
 *     Vrakrangerer ∘ Alphamuagent ∘ Profilagent ∘ Budagent ∘ Konvensjonsvakt ∘ E1
 *
 * og `test/utrullet-lik-spek.test.ts` spiller begge to gjennom de samme
 * stillingene og krever IDENTISKE handlinger. En kommentar kan ryke; en test
 * kan ikke.
 *
 * ================= STANDARDEN ER DAGENS BOT, BIT FOR BIT ================
 *
 * `soek: {type: "sik"}` og `okt: false` gir nøyaktig kjeden som er utrullet i
 * dag. Ingenting her endrer hva familien møter før noen bevisst ber om det —
 * og `amu:alle` er fortsatt UNDER MÅLING (§106: vetoen fjernet skaden, men
 * makker og forsvar ligger på null, ikke i pluss). Å slå den på nå ville vært
 * å adoptere på en hypotese.
 */

import type { GameState, Handling } from "../motor.ts";
import type { NevroNett } from "../nevro/nett.ts";
import { forover } from "../nevro/nett.ts";
import { e1SpillTrekk } from "../e1/trekk.ts";
import { Alphamuagent } from "./amuagent.ts";
import { Konvensjonsvakt, lesVaktflagg } from "./konvensjonsvakt.ts";
import { Budagent } from "./budmodell.ts";
import { Vrakrangerer } from "./vrakrang.ts";
import { Sikkerorakel } from "./sikkerorakel.ts";
import { lagTrovektFraVisning, type Visningstro } from "./troprior.ts";
import { Profilagent } from "./profilagent.ts";
import { Økt } from "./okt.ts";
// TYPE-ONLY. `rolleorakel.ts` drar inn mer enn nettleseren trenger, og et
// type-import forsvinner ved kompilering — så bundelen blir ikke tyngre.
import type { Rolle } from "./rolleorakel.ts";

/** Det minste en agent må kunne for å sitte i et sete. */
export interface Velger {
  velgHandling(s: GameState): Handling;
  nyKamp(): void;
}

/** Søket, eller fraværet av det. `null` = rent nett, som er billigst. */
export type Søkspek =
  | {
      readonly type: "sik";
      /** Kandidatverdener. 0 slår søket helt av. */
      readonly verdener: number;
      /** Konfidensporten. Overstyr nettet bare der marginen slår sin egen SE. */
      readonly sigma: number;
      /** Verdener importance-samplingen velger mellom. Udefinert = 3, som utrullet. */
      readonly verdenKandidater?: number;
      /**
       * MLB-trohodet i verdenene (11. sep). Udefinert/null = som før. Et nett som
       * leser hukommelsen avvises: søket fører ingen bok ennå.
       */
      readonly tronett?: Visningstro | null;
      /** Budvekten på verdenene. Standard på. */
      readonly budvekt?: boolean;
      /** Tidsbudsjett per beslutning i ms. Udefinert = ingen frist (all måling). */
      readonly fristMs?: number;
    }
  | {
      readonly type: "amu";
      readonly verdener: number;
      readonly verdenKandidater: number;
      readonly M: number;
      readonly epsilon: number;
      readonly lambda: number;
      /** Vaktens veto. §106 målte v0.5 til +0,4809 ± 0,1332 samlet. */
      readonly vetoMargin: number;
      /** Tom liste = alle roller. */
      readonly roller: readonly Rolle[];
      readonly vektkilde: "av" | "regel" | "bayes";
      readonly signal: boolean;
      readonly lagmål: boolean;
    };

export interface UtrulletSpek {
  /** E1-kortnettet, ferdig parset. */
  readonly kortnett: NevroNett;
  /** Samme vekter som `kortnett`, som E1-agent. To parsere, én fil — som i speken. */
  readonly kort: Velger;
  readonly vaktflagg: string;
  /** Budmodellen, allerede tolket. `null` = NevroHjernes budgivning, som før. */
  readonly bud?: ConstructorParameters<typeof Budagent>[1] | null;
  readonly budterskel?: number;
  readonly vraknett?: NevroNett | null;
  readonly vrakflagg?: string;
  readonly søk?: Søkspek | null;
  /**
   * K4 + K6: økthukommelsen og motstandermodellen.
   *
   * De henger sammen og skrus derfor av og på SAMMEN: `Profilagent` fyller
   * boka, `Økt` leser den, og alpha-mu bruker den i både rollouten
   * (`motpartFor`) og troen (`atferdFor`). Å slå på den ene alene ville gitt en
   * profil ingen leser, eller en leser uten profil — begge deler har prosjektet
   * hatt før, og begge målte null.
   */
  readonly økt?: boolean;
}

/**
 * Bygger kjeden. Rekkefølgen speiler speken, ikke den gamle workeren.
 *
 * Returnerer også `økt` når den er på, fordi kalleren må kunne kalle `nyKamp()`
 * på den mellom kamper — det er DEN som skiller «én økt» fra «historie», og
 * hele grunnen til at boka ikke rører disk.
 */
export function byggUtrullet(spek: UtrulletSpek): { agent: Velger; økt: Økt | null; sik: Sikkerorakel | null } {
  const økt = spek.økt === true ? new Økt() : null;
  // Søkeleddet selv, så appen kan logge `sik.siste` (hvem bestemte, verdener, σ, ms).
  let sik: Sikkerorakel | null = null;

  const vakt: Velger = new Konvensjonsvakt(spek.kort, lesVaktflagg(spek.vaktflagg));

  let kjede: Velger = vakt;
  let budagent: Budagent | null = null;
  if (spek.bud !== null && spek.bud !== undefined) {
    budagent = new Budagent(vakt, spek.bud, spek.budterskel ?? 0);
    kjede = budagent;
  }

  // PROFILEN LIGGER UNDER SØKET og over budgivningen, som i speken: den skal
  // se hver handling for å fylle boka, og den justerer budet gjennom
  // `settForsvarsjustering`.
  if (økt !== null) {
    kjede = new Profilagent(kjede, budagent, økt.bok) as unknown as Velger;
  }

  const søk = spek.søk;
  if (søk !== undefined && søk !== null && søk.verdener > 0) {
    // MOTPARTEN ER KJEDEN UTEN SØK. Gis søkeagenten seg selv, starter hver
    // rollout et nytt søk — eksponentielt. Her er `kjede` allerede søkfri, så
    // den ER motparten; ingen `utenSøk()`-strengkirurgi trengs.
    const motpart = kjede as unknown as ConstructorParameters<typeof Alphamuagent>[1];
    if (søk.type === "sik") {
      const tronett = søk.tronett ?? null;
      if (tronett !== null && tronett.brukerHukommelse === true) {
        throw new Error("byggUtrullet: trohodet leser hukommelsen, og søket fører ingen bok ennå");
      }
      sik = new Sikkerorakel(kjede, motpart as never, {
        verdener: søk.verdener,
        sigma: søk.sigma,
        roller: ["foerer"],
        verdenKandidater: søk.verdenKandidater,
        trovektFor: tronett === null ? undefined : (st, sete) => lagTrovektFraVisning(tronett, st, sete, null),
        budvekt: søk.budvekt,
        fristMs: søk.fristMs,
      });
      kjede = sik as unknown as Velger;
    } else {
      /**
       * A5s ATFERDSMODELL, fra nettet som FAKTISK spiller.
       *
       * `troverdighet` regner P(observasjon | verden) under en policy, og den
       * policyen må være boten vi modellerer. Samme vekter som `kort`, akkurat
       * som speken plukker `e1:<fil>` ut av den indre speken.
       *
       * Og når økten finnes, vris den av `atferdFor` — K4 mater K8. Uten den
       * delingen ruller søket ut én motstander og troen vekter etter en annen,
       * som er nøyaktig feilen A6 hadde da avsender og leser hadde hver sin kode.
       */
      const grunn = {
        logits: (st: GameState, s2: number): Float32Array | number[] =>
          forover(spek.kortnett, e1SpillTrekk(st, s2, spek.kortnett.lag[0]!.inn)),
      };
      const atferd =
        søk.vektkilde === "bayes"
          ? økt === null
            ? grunn
            : {
                logits: (st: GameState, s2: number): Float32Array | number[] =>
                  økt.atferdFor(grunn, s2).logits(st, s2),
              }
          : undefined;
      kjede = new Alphamuagent(kjede, motpart, {
        verdener: søk.verdener,
        verdenKandidater: søk.verdenKandidater,
        spillvekt: søk.vektkilde === "regel",
        vektkilde: søk.vektkilde,
        signal: søk.signal,
        lagmål: søk.lagmål,
        atferd,
        M: søk.M,
        epsilon: søk.epsilon,
        lambda: søk.lambda,
        vetoMargin: søk.vetoMargin,
        motpartFor: økt === null ? undefined : (sete: number) => økt.motpartFor(motpart, sete),
        roller: søk.roller,
      }) as unknown as Velger;
    }
  }

  // VRAKRANGEREN YTTERST, som `vr:` i speken. Vraket og trumfvalget er en annen
  // beslutning med sin egen modell, og den skal ikke gjennom søket.
  if (spek.vraknett !== null && spek.vraknett !== undefined) {
    kjede = new Vrakrangerer(kjede, spek.vraknett, spek.vrakflagg ?? "telrd") as unknown as Velger;
  }

  return { agent: kjede, økt, sik };
}
