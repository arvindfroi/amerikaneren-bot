/**
 * ALPHA-MU SOM AGENT — `amu:<rolle>:<verdener>[k<kand>][s][aM<n>]:<indre>`
 *
 * Binder sammen de fire delene fra §79 som til nå har vært separate:
 *
 *   A1  verdenene vektes av SPILLET (`spillvekt.ts`)     — «s» i feltet
 *   A2  rolloutene bruker MOTSTANDERMODELLEN             — `motpartFor`
 *   A7  uleselig valg blant like gode kort               — `epsilon`
 *   A8  Pareto-søk over egne framtidige valg             — «aM<n>»
 *
 * Grunnen til at de hører sammen i én agent er ikke bekvemmelighet: de er
 * avhengige. alpha-mu er en beslutningsregel over et utvalg (A1 lager
 * utvalget), rolloutene definerer hva «utfall» betyr (A2), og uleseligheten
 * må komme SIST slik at den bare velger blant kort søket allerede har
 * godkjent (A7).
 *
 * KOSTNADEN ER REELL og derfor er `rolle` med, som i `sik:`: uten den
 * evalueres hver eneste beslutning, og en enkelt måling tar timer.
 */

import { lovligeKort, type GameState, type Handling } from "../motor.ts";
import { lagMål, standardMål, trekkVerdener, type Utspiller } from "./sdkort.ts";
import { alphaMu } from "./alphamu.ts";
import { lagVerdensvekt, type Vektkilde } from "./verdensvekt.ts";
import type { Atferdsmodell } from "./troverdighet.ts";
import { rolleFor, type Rolle } from "./rolleorakel.ts";
import { stillingsfrø, velgUleselig } from "./uleselig.ts";
import { lagRng } from "../kort.ts";
import { racepress, racescore } from "./race.ts";
import { forklarValg, type Forklaring } from "./forklar.ts";
import { erSignalrom, signalkort, harStyrkeI } from "./signal.ts";

export interface AmuOpts {
  readonly verdener: number;
  readonly verdenKandidater?: number;
  /** A1: vekt verdenene etter spillet, ikke bare budrunden. */
  readonly spillvekt?: boolean;
  /** A8: antall EGNE beslutninger å søke over. 1 = dagens dybde. */
  readonly M?: number;
  /** A7: randomiser blant kort innenfor ε av det beste. 0 = av. */
  readonly epsilon?: number;
  readonly roller?: readonly Rolle[];
  readonly frø?: number;
  /**
   * A2: MOTSTANDERMODELLEN. Gir policyen som skal spille et gitt sete i
   * rolloutene. Uten den brukes `indre` i alle seter — altså antakelsen om at
   * de andre spiller nøyaktig som oss, som er feil mot familien.
   */
  readonly motpartFor?: (sete: number) => Utspiller;
  /**
   * KAMPSTILLING: hvor hardt varians vektes av racepresset. 0 = av, og da er
   * scoren NØYAKTIG snittet — bit-identisk med før.
   *
   * Knotten er gratis: alpha-mu gir en utfallsvektor per kandidat, så snitt og
   * spredning faller rett ut. S5 etterlyste nettopp en slik knott og fant
   * ingen god; denne kom som biprodukt av A8.
   */
  readonly lambda?: number;
  /**
   * FORKLARING PÅ VALGET. Av som standard, og det er ikke pynt: `forklarValg`
   * regner et snitt og en spredning per gren, altså arbeid vi ikke skal gjøre
   * i en måling som spiller millioner av trekk.
   *
   * DEN VAR DØD FØR DETTE. `src/moe2/forklar.ts` ble bygd som «å forklare
   * hvorfor» — en av de menneskelige evnene — og forekom nøyaktig ÉN gang i
   * hele repoet: sin egen definisjon. Den var dokumentert, testfri og koblet
   * til ingenting, altså nøyaktig samme mønster som den døde sanseblokken
   * (§32): en komponent som ser levende ut fordi den finnes.
   *
   * Alpha-muen er dessuten det ENESTE stedet forklaringen kan være ærlig.
   * Utfallsvektoren ER regnskapet beslutningen ble tatt på, så forklaringen
   * kan ikke lyve om sin egen årsak slik en ettermodell kan.
   */
  readonly forklar?: boolean;
  /**
   * A5/A1: hvilken slutning som vekter kandidatverdenene.
   *
   * `spillvekt: true` er det gamle navnet på `"regel"` og beholdes så
   * eksisterende speker måler NØYAKTIG det samme som før. Settes begge, vinner
   * `vektkilde`.
   */
  readonly vektkilde?: Vektkilde;
  /**
   * A6, LESEREN: legg signalforenligheten til verdensvekten.
   *
   * «Makker la dame paa mitt lave — da er det mindre sjanse for at han har
   * konge og ess.» Det er Arvinds eget K8-eksempel nummer 5: aa LESE hvilket
   * av de likegyldige kortene noen valgte, som bevis om haanden deres.
   */
  readonly signal?: boolean;
  /**
   * ============ A6, AVSENDEREN — PARKERT PAA ARVINDS BESKJED =========
   *
   * ARVIND, 8. august: «jeg har jo sagt at signalisering og mind games er alt
   * for advansert å fokusere på for øyeblikket.»
   *
   * Han har rett, og de to halvdelene er ulike ting:
   *
   *   LESEREN     tolker hva andre valgte. Staar i K8s eksempelliste.
   *   AVSENDEREN  velger bevisst mellom likegyldige kort for aa KODE noe til
   *               makker. Det krever en avtalt konvensjon begge sider kjenner
   *               — altsaa signalisering, og det er ikke bedt om.
   *
   * Avsenderen ble bygd som del av alpha-mu-pakken (A1-A8), ikke fordi et krav
   * ba om den. Ablasjonen 8. august maalte hele «g» til **-0,1153** i selskap
   * med resten (ikke signifikant, men negativ).
   *
   * PARKERT, IKKE SLETTET. Koden staar med tallet i kommentaren, saa den som
   * vil ta den opp igjen finner maalingen foer de bygger.
   */
  readonly signalsender?: boolean;
  /**
   * Nettets policy, som A5 trenger for å regne P(observasjon | verden).
   *
   * UTEN DEN FALLER `bayes` TIL `regel`. Det er grunnen til at den er et
   * eksplisitt felt og ikke noe agenten graver ut av `indre`: en stille
   * degradering her ville vært usynlig, og det er nøyaktig slik A5 endte opp
   * med å bare finnes i etikettmakeren.
   */
  readonly atferd?: Atferdsmodell;
  /**
   * VAKTENS VETO: soeket overstyrer bare naar fordelen er stoerre enn dette.
   *
   * 0 = av, og da er oppfoerselen BIT-IDENTISK med foer. Se `velgHandling` for
   * hvorfor den finnes: §103 maalte soek i makker/forsvar til -0,2837 ± 0,0519
   * (z = -5,5), og den mest lovende forklaringen er at soeket bryter
   * partnerskapets kode for aa vinne stikket foran seg.
   */
  readonly vetoMargin?: number;
  /**
   * LAGMAALET i stedet for `standardMål`. Se `sdkort.ts` for hvorfor:
   * standardmaalet trekker fra MAKKERENS poeng, saa en makker undervurderer
   * aa hjelpe med en faktor tre og to forsvarere konkurrerer med hverandre.
   * Det er noeyaktig rollene der §103 maalte -0,33 og -0,40.
   *
   * Av som standard - dette er et ANNET maal, ikke en knott, og maa maales
   * mot det gamle foer noe byttes.
   */
  readonly lagmål?: boolean;
  /**
   * ============ SLUTTSPILLDYBDE: K7 GJORT MED RIKTIG ALGORITME ========
   *
   * ARVIND: «er det en mulighet å gjøre k7 på en måte som gjør at vi løser de
   * siste 4-5 stikkene?»
   *
   * Ja — og det krever ingen ny algoritme. `M` styrer hvor mange av VÅRE EGNE
   * framtidige beslutninger som søkes med anti-fusjonsbetingelsen («kortet må
   * være lovlig i ALLE verdener»). Med `M` ≥ gjenstående stikk er alpha-mu
   * EKSAKT for verdensutvalget: den finner den beste ENKELTSTRATEGIEN på tvers
   * av verdener i stedet for å midle beste trekk per verden.
   *
   * Cazenave & Ventos sier det slik: «α-μ addresses and if given enough time
   * solves the strategy fusion and the non-locality problems encountered by
   * PIMC.» «Enough time» er nettopp dette: nok M.
   *
   * ================= OG SLUTTSPILLET ER DER DET ER BILLIG =============
   *
   * Kostnaden er omtrent `forgrening^M × verdener × utspillingslengde`:
   *
   *     stikk 1          ~12 lovlige   M=12 håpløst   utspilling 12 stikk
   *     4 stikk igjen    ≤ 4 lovlige   M=4  = 256     utspilling 4 stikk
   *     3 stikk igjen    ≤ 3 lovlige   M=3  =  27     utspilling 3 stikk
   *
   * `M = 2` var dyrt fordi vi betalte det ved STIKK 1. Ved fire stikk igjen er
   * både treet OG utspillingene små — full dybde i sluttspillet koster mindre
   * enn M=2 gjør i åpningen.
   *
   * ================= HVORFOR DET ER RIKTIGERE ENN `eks:` ==============
   *
   * `eks:` løser hver verden eksakt og midler. Det er PIMC uten samplingstøy,
   * og §-målingen ga −0,017 / −0,289 / −0,778 ved 2/3/4 stikk — VERRE med
   * dybden. Enumerasjonen fjerner støyen, ikke skjevheten.
   *
   * Alpha-mu med full dybde fjerner SKJEVHETEN. (Tallene over ble målt med den
   * ødelagte DD-løseren, §116, så de skal måles på nytt uansett.)
   *
   * 0 = av, og da er `M` konstant som før — bit-identisk.
   *
   * ================= MÅLT, OG DEN ER PARKERT (§117) ===================
   *
   * Gate 2, full stakk i alle fire seter, 349 giver × 4 seter = 1 396 par,
   * frø 900 000. Kontrollarmen målte 0,0000 (§117):
   *
   *     d4   +0,0489 ± 0,0343  (1,4 SE)   4 opp / 0 ned   p = 0,125
   *     d5   −0,0236 ± 0,0725  (−0,3 SE)  10 opp / 10 ned p = 1,000
   *
   * Ingen av dem passerer porten (over 2 SE OG tegntesten). Og tallene er
   * tynnere enn de ser ut: `d4` endret UTFALLET i 4 av 1 396 par, `d5` i 20.
   * Fire hendelser er en anekdote, ikke en måling — retningen er hyggelig,
   * men den kan ikke leses.
   *
   * MAKKER OG FORSVAR MÅLTE EKSAKT 0,0000, som de skal: speken er
   * `amu:foerer:`, så sluttdybden kan bare bite i førersetet. At de to
   * rollene står på null er koblingssjekken innebygd i selve målingen.
   *
   * HVORFOR SÅ LITE: takkartet (§60) sier at de siste to stikkene bare rommer
   * +0,064 poeng per runde, og de siste fem +0,947 — men det taket er målt MED
   * KLARSYN, og to tredeler av potten ligger i 16 giver av 1 000. Det er
   * stillinger der man må gjette hvor et nøkkelkort sitter. Dypere EKSAKT søk
   * kjøper ikke informasjon, og det er informasjon som mangler.
   *
   * Flagget blir stående, av som standard. Det er riktig algoritme på et
   * problem som ikke er søkebegrenset.
   */
  readonly sluttdybde?: number;
  /**
   * SOEKEBREDDE UNDER ROTEN, styrt av nettets policy. 0 = alle grener, som foer.
   *
   * Arvind: «alpha mu boer ogsaa bruke hukommelsen og prediksjonen slik at vi
   * kan effektivisere soeket.» Prioren er nettets egen sannsynlighet over
   * VAARE trekk; med `bredde` beholdes bare de N beste under roten. Roten er
   * alltid full - der tas beslutningen, og der har vi raad.
   */
  readonly bredde?: number;
  /**
   * ============ KANAL 2: VRAKET SOM BEVIS ===========================
   *
   * ARVIND: «budvinner faar x antall ekstra verdi paa sin haand, og jeg vet at
   * den proever aa skape renonser og maksimerer sin haand i vrak.»
   *
   * Maalt over 720 runder (§111), budvinnerens sidefargerenonser per runde:
   *
   *     faktisk vraking           0,967
   *     om hun kastet billigst    0,169
   *     tilfeldig kasting         0,101
   *
   * Hun toemmer en farge nesten hver runde - 9,6x oftere enn tilfeldig.
   * Sampleren antok det tilfeldige, saa verdenene ga henne sidefargekort hun
   * sannsynligvis ikke har, og undervurderte hvor ofte hun kan trumfe.
   *
   * `alfa` er vekten per renons. 0 = av, bit-identisk.
   */
  readonly vrakalfa?: number;
}

export class Alphamuagent {
  private readonly indre: { velgHandling(s: GameState): Handling; nyKamp(): void };
  private readonly motpart: Utspiller;
  private readonly o: AmuOpts;
  private readonly rng: () => number;
  readonly tellere = { beslutninger: 0, vurdert: 0, overstyrt: 0, uleselig: 0, racejustert: 0, signalerte: 0, vetoet: 0 };
  /**
   * Forklaringen på SISTE alpha-mu-valg, eller `null` om `forklar` er av eller
   * søket ikke kjørte for dette trekket (renons, ett lovlig kort, feil rolle).
   */
  sisteForklaring: Forklaring | null = null;

  constructor(
    indre: { velgHandling(s: GameState): Handling; nyKamp(): void },
    motpart: Utspiller,
    opts: AmuOpts,
  ) {
    this.indre = indre;
    this.motpart = motpart;
    this.o = opts;
    this.rng = lagRng(opts.frø ?? 20260806);
  }

  nyKamp(): void {
    this.indre.nyKamp();
  }

  /**
   * Videresender bokfoeringskroken. Uten den naar `observer` aldri
   * `Profilagent`, som ligger LENGER NED i stakken enn dette laget - og da er
   * profilen tom paa kampbenken (maalt 0 bokfoerte runder mot 25 med tikk).
   */
  observer(state: GameState): void {
    (this.indre as { observer?(s: GameState): void }).observer?.(state);
  }

  velgHandling(state: GameState): Handling {
    if (state.fase !== "SPILL" || state.iTur === null) return this.indre.velgHandling(state);
    const sete = state.iTur;
    const roller = this.o.roller ?? [];
    if (roller.length > 0) {
      const r = rolleFor(state, sete);
      if (r === null || !roller.includes(r)) return this.indre.velgHandling(state);
    }
    if (lovligeKort(state, sete).length <= 1) return this.indre.velgHandling(state);
    this.tellere.beslutninger++;

    const verdener = trekkVerdener(
      state,
      sete,
      this.o.verdener,
      this.rng,
      undefined,
      lagVerdensvekt(state, sete, {
        kilde: this.o.vektkilde ?? (this.o.spillvekt === true ? "regel" : "av"),
        signal: this.o.signal,
        atferd: this.o.atferd,
      }),
      this.o.verdenKandidater ?? 3,
      // KANAL 2. Udefinert naar alfa er 0 - da er hele leddet bit-identisk.
      (this.o.vrakalfa ?? 0) > 0 ? { alfa: this.o.vrakalfa!, beta: 0 } : undefined,
    );
    if (verdener.length === 0) return this.indre.velgHandling(state);
    this.tellere.vurdert++;

    /**
     * A2: hvert sete kan få sin egen policy i rolloutene. `alphaMu` tar én
     * `Utspiller`, så modellen pakkes som en ruter som slår opp på hvem som
     * er i tur — da trenger ikke søket å vite at det finnes flere modeller.
     */
    const motpartFor = this.o.motpartFor;
    const ruter: Utspiller =
      motpartFor === undefined
        ? this.motpart
        : {
            velgHandling: (s: GameState) => {
              const p = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
              /**
               * ============ ALDRI VÅRT EGET SETE =========================
               *
               * Her sto `motpartFor(p)` for ALLE seter, også vårt eget. Men vi
               * KJENNER vår egen policy — den er `this.motpart`. Å slutte den
               * fra observerte residualer og så vri den er ren støyinjeksjon:
               * modellen kan bare bli dårligere enn originalen den forsøker å
               * gjenskape.
               *
               * Det bet i K6-testens nullarm. Kandidaten er en annen spek enn
               * miljøet, så detektoren flagget KORREKT at sete 0 spiller
               * annerledes enn de tre andre — og vridde deretter oss selv.
               * Armene skilte lag mot en motstander uten vane, og det så ut
               * som en falsk positiv i detektoren. Det var det ikke: det var
               * en sann deteksjon brukt på feil sete.
               *
               * En motstandermodell modellerer MOTSTANDERE. Navnet sa det.
               */
              if (p === null || p === undefined || p === sete) return this.motpart.velgHandling(s);
              return motpartFor(p).velgHandling(s);
            },
          };

    /**
     * ADAPTIV DYBDE. Gjenstår få stikk, søkes de ALLE — da er alpha-mu eksakt
     * for verdensutvalget. Ellers står `M` som før.
     *
     * `stikkIgjen` regnes av EGEN hånd, ikke av `antallStikk - stikkSpilt`:
     * det er antallet beslutninger VI har igjen, og det er det `M` teller.
     */
    const stikkIgjen = state.hender[sete]?.length ?? 0;
    const terskel = this.o.sluttdybde ?? 0;
    const M =
      terskel > 0 && stikkIgjen > 0 && stikkIgjen <= terskel
        ? Math.max(this.o.M ?? 1, stikkIgjen)
        : Math.max(1, this.o.M ?? 1);

    const grener = alphaMu(state, sete, verdener, {
      M,
      // PREDIKSJONEN INN I SOEKET. `atferd` er nettets policy - den samme som
      // A5 bruker til aa vekte verdener. Her styrer den hvilke av VAARE trekk
      // som utdypes, saa dybde kan kjoepes for bredde.
      ...(this.o.atferd === undefined
        ? {}
        : { prior: (s2: GameState, p2: number) => this.o.atferd!.logits(s2, p2) }),
      ...(this.o.bredde === undefined ? {} : { bredde: this.o.bredde }),
      mål: this.o.lagmål === true ? lagMål : standardMål,
      motpart: ruter,
    });
    if (grener.length === 0) return this.indre.velgHandling(state);

    /**
     * SCOREN. Med `lambda` = 0 er dette nøyaktig snittet over verdenene, og
     * hele racejusteringen er en nulloperasjon — bit-identisk med før.
     */
    const lambda = this.o.lambda ?? 0;
    const press = lambda === 0 ? 0 : racepress(state, sete);
    const score = (g: { vektor: number[] }): number => racescore(g.vektor, press, lambda);
    if (press !== 0) this.tellere.racejustert++;

    const eps = this.o.epsilon ?? 0;
    let valgt = grener[0]!;

    /**
     * ============ A6 SENDERSIDEN, og hvorfor den MÅTTE komme ============
     *
     * Arvind: «hvis de er dårlige så må du fikse det ikke fjerne de.»
     *
     * A6 gjorde troen MÅLBART verre (log-tap 0,9418 → 0,9810). Årsaken var
     * ikke konvensjonen, men at bare LESEREN var koblet: `signalForenlighet`
     * ble brukt, mens `erSignalrom`, `signalkort` og `erStyrkesignal` ble brukt
     * av ingenting.
     *
     * Adams leste altså signaler som ingen sendte. Med fire Adams ved bordet
     * var hvert «signal» et vilkårlig kortvalg, og leseren behandlet støy som
     * bevis. En konvensjon der bare den ene siden deltar er ikke en svak
     * konvensjon — den er en feilkilde.
     *
     * ============ OG DEN KOLLIDERER MED A7 ==============================
     *
     * Uleseligheten (A7) og signaleringen (A6) bruker NØYAKTIG samme ressurs:
     * de kortvalgene som ikke endrer stikkets utfall (§70: 36,2 %). A7 vil ha
     * dem tilfeldige, A6 vil ha dem lesbare. Kjøres begge, ødelegger A7 koden
     * A6 nettopp la inn.
     *
     * Derfor: **i et signalrom vinner signalet, ellers randomiserer A7.**
     * Båndbredden deles etter hvem som kan bruke den, ikke etter rekkefølge i
     * koden. Utenfor signalrom er valget uansett en stikkbeslutning, og der
     * skal ingen av dem røre noe.
     */
    let signalerte = false;
    // AVSENDEREN er parkert som standard - se `signalsender`. Leseren («signal»)
    // staar, for den er K8s eksempel 5.
    if (this.o.signalsender === true) {
      const lovlige = grener.map((g) => g.kort);
      if (erSignalrom(state, lovlige)) {
        // Bare blant kort søket har godkjent som omtrent likeverdige - å
        // signalisere med et kort som taper stikk er å betale for båndbredde.
        const beste = grener.reduce((a, b) => (score(b) > score(a) ? b : a));
        const nær = grener.filter((g) => score(beste) - score(g) <= Math.max(eps, 1e-9));
        if (nær.length >= 2) {
          const { styrke, svakhet } = signalkort(nær.map((g) => g.kort));
          // Konvensjonen: høyt = styrke i fargen. «Styrke» leses av samme
          // funksjon mottakeren bruker, så de to kan ikke drifte fra hverandre.
          const mål = harStyrkeI(state.hender[sete] ?? [], styrke.farge) ? styrke : svakhet;
          const g2 = nær.find((g) => g.kort.farge === mål.farge && g.kort.verdi === mål.verdi);
          if (g2 !== undefined) {
            valgt = g2;
            signalerte = true;
            this.tellere.signalerte++;
          }
        }
      }
    }

    if (!signalerte && eps > 0) {
      // A7 SIST: uleseligheten velger bare blant kort soeket alt har godkjent
      // som omtrent likeverdige. Aa randomisere foer soeket ville kastet poeng.
      const før = valgt;
      valgt = velgUleselig(grener, score, eps, stillingsfrø(state, sete));
      if (valgt !== før) this.tellere.uleselig++;
    } else if (!signalerte) {
      for (const g of grener) if (score(g) > score(valgt)) valgt = g;
    }

    if (this.o.forklar === true) {
      this.sisteForklaring = forklarValg(state, sete, grener, valgt.kort, lambda);
    }

    const eget = this.indre.velgHandling(state);
    if (eget.type === "SPILL" && eget.kort.farge === valgt.kort.farge && eget.kort.verdi === valgt.kort.verdi) {
      return eget;
    }

    /**
     * ============ VAKTENS VETO ==========================================
     *
     * §103 målte at søk i makker og forsvar er SKADELIG: −0,2837 ± 0,0519
     * (z = −5,5) over 16 000 par, med makker −0,3342 og forsvar −0,4003.
     * Hypotesen i §98 — at `ork:`-nullen skyldtes strategifusjon og at
     * alpha-mu ville fikse den — ble motbevist.
     *
     * Den mest lovende forklaringen som står igjen: **søket overstyrer
     * konvensjonsvakten.** `vakt:abmpf` er partnerskapets KODE, og i forsvar
     * er koordinering mer verdt enn rå EV på det enkelte stikket. Søket bryter
     * koden for å vinne stikket foran seg.
     *
     * Det er tredje gang samme mønster dukker opp: A6 mot A7 om de frie
     * kortvalgene, senderen mot leseren om signalkoden, og nå søket mot
     * vakten. **Et lokalt optimum som ødelegger en avtale.**
     *
     * Vetoet lar vakten beholde sitt kort når søkets fordel er MINDRE enn
     * `vetoMargin`. Søket får fortsatt overstyre når det virkelig har noe å
     * hente — det er ikke en avskrudd knott, det er en terskel.
     *
     * `vetoMargin = 0` er BIT-IDENTISK med å ikke ha vetoet. Uten det
     * nullpunktet kunne ingen sveip startet fra noe kjent.
     */
    const vetoMargin = this.o.vetoMargin ?? 0;
    if (vetoMargin > 0 && eget.type === "SPILL") {
      const egenGren = grener.find(
        (g) => g.kort.farge === eget.kort.farge && g.kort.verdi === eget.kort.verdi,
      );
      // Fant vi ikke vaktens kort blant grenene, var det ikke et lovlig
      // alternativ soeket vurderte - da er det ingenting aa sammenlikne.
      if (egenGren !== undefined && score(valgt) - score(egenGren) < vetoMargin) {
        this.tellere.vetoet++;
        return eget;
      }
    }

    this.tellere.overstyrt++;
    return { type: "SPILL", spiller: sete, kort: valgt.kort };
  }
}
