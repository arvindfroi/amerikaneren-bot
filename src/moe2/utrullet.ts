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

import { EksaktSluttspill, STANDARD_TAK } from "./eksaktagent.ts";
import type { GameState, Handling } from "../motor.ts";
import type { NevroNett } from "../nevro/nett.ts";
import { forover } from "../nevro/nett.ts";
import { e1SpillTrekk } from "../e1/trekk.ts";
import { Alphamuagent } from "./amuagent.ts";
import { Konvensjonsvakt, lesVaktflagg } from "./konvensjonsvakt.ts";
import { Budagent } from "./budmodell.ts";
import { Vrakrangerer } from "./vrakrang.ts";
import { Sikkerorakel } from "./sikkerorakel.ts";
import { BudQagent } from "./budq.ts";
import type { Visningstro } from "./troprior.ts";
import { MlbSøketro } from "./soketro.ts";
import { Profilagent } from "./profilagent.ts";
import { Økt } from "./okt.ts";
// TYPE-ONLY. `rolleorakel.ts` drar inn mer enn nettleseren trenger, og et
// type-import forsvinner ved kompilering — så bundelen blir ikke tyngre.
import type { Rolle } from "./rolleorakel.ts";

/** Det minste en agent må kunne for å sitte i et sete. */
export interface Velger {
  velgHandling(s: GameState): Handling;
  nyKamp(): void;
  /** Bokfør en tilstand uten trekk (også RUNDE_SLUTT). Den som driver spillet kaller den for hver tilstand. */
  observer?(s: GameState): void;
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
       * MLB-trohodet i verdenene (11. sep). Udefinert/null = som før. Leser nettet
       * hukommelsen, MÅ kalleren vise agenten hver tilstand, også RUNDE_SLUTT, gjennom
       * `agent.observer` — ellers kaster søketroen i neste runde.
       */
      readonly tronett?: Visningstro | null;
      /** Budvekten på verdenene. Standard på. */
      readonly budvekt?: boolean;
      /** Tidsbudsjett per beslutning i ms. Udefinert = ingen frist (all måling). */
      readonly fristMs?: number;
      /** K7.2: utspillingene løses eksakt fra så mange stikk igjen. Udefinert = av. */
      readonly eksaktBlad?: number;
      /**
       * Rollene søket griper inn i (11. sep). Udefinert = `["foerer"]`, som utrullet;
       * TOM liste = alle roller, som `sik:alle` i speken.
       */
      readonly roller?: readonly Rolle[];
      /** `L`: lagmålet i utspillingene. Udefinert = av, som utrullet. */
      readonly lagmål?: boolean;
      /**
       * `M`: motstandersetene spiller utspillingene med økta sin policy. Krever
       * `UtrulletSpek.økt === true` — ellers kastes det, som i speken.
       */
      readonly brukØkt?: boolean;
      /** `D`: frøet per beslutning utledes av det setet ser. Udefinert = løpende strøm. */
      readonly visningsfrø?: boolean;
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
  /**
   * BUDQ (11. sep): budet som et laert valg i stedet for budmodellens regel, i
   * `BudQagent`-formatet (143 inn, 11 ut). Kan ikke kombineres med `bud`: to budlag i
   * samme kjede ville gitt et bud ingen maaling staar bak.
   */
  readonly budq?: NevroNett | null;
  readonly vraknett?: NevroNett | null;
  readonly vrakflagg?: string;
  readonly søk?: Søkspek | null;
  /**
   * K7.1 (11. sep): eksakt sluttspill, `eks:<terskel>[L][t<tak>]` i speken. Legges
   * UTENPÅ søket og under vrakrangereren: fra terskelen og ut bestemmer enumerasjonen
   * i ALLE roller, også der søket ville overstyrt. Udefinert/null = av, som før.
   */
  readonly eksakt?: {
    readonly terskel: number;
    /** Lagmålet (`L`): makkerens poeng teller med. */
    readonly lagmål?: boolean;
    /** Tak på klassekonfigurasjoner. Udefinert = `STANDARD_TAK`. */
    readonly tak?: number;
  } | null;
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
  /**
   * HVOR PROFILEN SITTER (11. sep). Standard (udefinert/false) er under søket, med
   * budagenten koblet til — som `…:sik:…:profil:budm:…` i speken.
   *
   * `true` er `…:profil:sik:…:budm:…`, formen den hele boten har: profilen rett over
   * søket (under `eks:` og `vr:`), og UTEN budjustering. Det er ikke et valg vi tar her,
   * det er det speken gjør — `profil:` kobler seg bare til et `settForsvarsjustering`
   * i laget RETT under, og søkelaget har ingen. Utspillingenes motpart blir da også uten
   * profillaget, som i speken. Uten søk sitter den på samme plass, fortsatt uten
   * budjustering, så hovedtråden og workeren beskriver samme bot.
   */
  readonly profilOverSøk?: boolean;
}

/**
 * Bygger kjeden. Rekkefølgen speiler speken, ikke den gamle workeren.
 *
 * Returnerer også `økt` når den er på, fordi kalleren må kunne kalle `nyKamp()`
 * på den mellom kamper — det er DEN som skiller «én økt» fra «historie», og
 * hele grunnen til at boka ikke rører disk.
 */
export function byggUtrullet(spek: UtrulletSpek): {
  agent: Velger;
  økt: Økt | null;
  sik: Sikkerorakel | null;
  /** K7.1-laget, for tellerne. `null` når det er av. */
  eksakt: EksaktSluttspill | null;
} {
  const økt = spek.økt === true ? new Økt() : null;
  if (økt !== null) {
    /**
     * ============ ØKTA MÅ HA POLICYEN, ELLERS ER DEN STUM ===================
     *
     * `Profilbok` måler stilen som RESIDUALET mot nettets prediksjon, og uten en
     * atferdsmodell er `stil()` aldri sikker og `motpartFor` identiteten for evig.
     * Speken setter den i `e1:`-grenen; byggeren gjorde det ALDRI. Paritetsprøvene for
     * `amu:` merket det ikke, fordi de verken når `MIN_RUNDER` eller viser agentene
     * `RUNDE_SLUTT` — boka var tom på begge sider. Samme nett, samme trekk som speken.
     */
    const n = spek.kortnett;
    økt.bok.settAtferd({
      logits: (st: GameState, s2: number): Float32Array | number[] => forover(n, e1SpillTrekk(st, s2, n.lag[0]!.inn)),
    });
  }
  const profilOverSøk = økt !== null && spek.profilOverSøk === true;
  // Søkeleddet selv, så appen kan logge `sik.siste` (hvem bestemte, verdener, σ, ms).
  let sik: Sikkerorakel | null = null;

  const vakt: Velger = new Konvensjonsvakt(spek.kort, lesVaktflagg(spek.vaktflagg));

  let kjede: Velger = vakt;
  let budagent: Budagent | null = null;
  const budq = spek.budq ?? null;
  if (budq !== null && spek.bud !== null && spek.bud !== undefined) {
    throw new Error("byggUtrullet: baade bud og budq er satt - velg ett budlag");
  }
  if (budq !== null) {
    // Samme plass i kjeden som `budm:` / `budq:` i speken: over vakten, under soeket.
    kjede = new BudQagent(vakt, budq) as unknown as Velger;
  } else if (spek.bud !== null && spek.bud !== undefined) {
    budagent = new Budagent(vakt, spek.bud, spek.budterskel ?? 0);
    kjede = budagent;
  }

  // PROFILEN LIGGER UNDER SØKET og over budgivningen, som i speken: den skal
  // se hver handling for å fylle boka, og den justerer budet gjennom
  // `settForsvarsjustering`.
  if (økt !== null && !profilOverSøk) {
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
      if (søk.brukØkt === true && økt === null) {
        throw new Error("byggUtrullet: søk.brukØkt krever økt: true – uten økt ville hukommelsen stille vært av");
      }
      sik = new Sikkerorakel(kjede, motpart as never, {
        verdener: søk.verdener,
        sigma: søk.sigma,
        // Udefinert = førersetet, som utrullet. En tom liste er `sik:alle`.
        roller: søk.roller ?? ["foerer"],
        verdenKandidater: søk.verdenKandidater,
        tro: tronett === null ? null : new MlbSøketro(tronett),
        budvekt: søk.budvekt,
        fristMs: søk.fristMs,
        ...(søk.eksaktBlad === undefined ? {} : { eksaktBlad: søk.eksaktBlad }),
        ...(søk.lagmål === true ? { lagmål: true } : {}),
        // Samme kobling som `M` i speken: rollout-motparten, vridd per motstandersete.
        ...(søk.brukØkt === true && økt !== null
          ? { motpartFor: (sete: number) => økt.motpartFor(motpart as never, sete) }
          : {}),
        ...(søk.visningsfrø === true ? { visningsfrø: true } : {}),
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

  // `profil:sik:…`: profilen rett over søket, uten budjustering — se `profilOverSøk`.
  if (økt !== null && profilOverSøk) {
    kjede = new Profilagent(kjede, null, økt.bok) as unknown as Velger;
  }

  // K7.1: EKSAKT SLUTTSPILL UTENPÅ SØKET, som `eks:` mellom `vr:` og `sik:` i speken.
  // Fra terskelen og ut bestemmer enumerasjonen i alle roller; blir rommet større enn
  // taket, avstår den og søket/nettet under bestemmer som før.
  let eksakt: EksaktSluttspill | null = null;
  if (spek.eksakt !== undefined && spek.eksakt !== null) {
    eksakt = new EksaktSluttspill(kjede as never, {
      terskel: spek.eksakt.terskel,
      maksKonfigurasjoner: spek.eksakt.tak ?? STANDARD_TAK,
      ...(spek.eksakt.lagmål === true ? { mål: "lag" as const } : {}),
    });
    kjede = eksakt as unknown as Velger;
  }

  // VRAKRANGEREN YTTERST, som `vr:` i speken. Vraket og trumfvalget er en annen
  // beslutning med sin egen modell, og den skal ikke gjennom søket.
  if (spek.vraknett !== null && spek.vraknett !== undefined) {
    kjede = new Vrakrangerer(kjede, spek.vraknett, spek.vrakflagg ?? "telrd") as unknown as Velger;
  }

  return { agent: kjede, økt, sik, eksakt };
}
