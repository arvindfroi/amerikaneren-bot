/**
 * ØKTEN — motstandermodellen som overlever mellom kamper, men ALDRI lagres.
 *
 * ARVIND: «den ska bare lære per økt for nå. men det skal være sykt godt
 * gjennomført.»
 *
 * ================= HVORFOR DENNE FILA IKKE RØRER DISK ====================
 *
 * `Profilagent.nyKamp()` nullstilte profilen, og begrunnelsen sto i koden: å
 * bære den mellom kamper ville vært «den databasen Arvind uttrykkelig ikke
 * ville ha».
 *
 * Skillet som løser det er MELLOM ØKT OG HISTORIE:
 *
 *   én økt   = så lenge prosessen lever. Familien spiller flere kamper etter
 *              hverandre på samme kveld, og boten husker DEN kvelden.
 *   historie = noe som overlever at appen lukkes. Det er databasen.
 *
 * Derfor har denne modulen **ingen import fra `node:fs`**, ingen
 * `localStorage`, ingen nettverkskall. Det er ikke en konvensjon — det er
 * håndhevet av `test/okt.test.ts`, som leser kilden og feiler på ethvert spor
 * av lagring. En kommentar kan ryke; en test kan ikke.
 *
 * ================= OG DEN MÅ FAKTISK BRUKES ==============================
 *
 * En profil som bare overlever er verdiløs. `Profilagent` påvirker i dag bare
 * `forsvarsverdi` i budgivningen, og den koblingen målte **−1,25 pp** (§75) —
 * Arvind sa det selv 6. august: «det er ikke bare budet den skal tilpasse seg,
 * men også i spillet».
 *
 * Økten kobler den derfor til A2: `motpartFor(sete)` gir søket én policy PER
 * MOTSTANDER i stedet for å anta at alle spiller som oss. Det er der en
 * motstandermodell hører hjemme — i prediksjonen, ikke i én konstant.
 */

import type { GameState, Handling } from "../motor.ts";
import { Profilbok } from "./profilagent.ts";
import { tiltro } from "./profil.ts";
import { finnTilt, rangOgPolicy } from "./stilbias.ts";

import { kortIndeks } from "../nevro/trekk.ts";
import type { Atferdsmodell } from "./troverdighet.ts";
import type { Utspiller } from "./sdkort.ts";

/**
 * Hvor hardt en observert stil får lov å vri rollout-policyen.
 *
 * Lavt med vilje: en motstandermodell bygget på få runder er et ANSLAG, og et
 * anslag som vrir søket hardt gjør skade når det tar feil. Skal sveipes.
 */
export const MAKS_VRI = 0.35;

/** Minste antall runder før vi tror på noe som helst om et sete. */
export const MIN_RUNDER = 4;

export class Økt {
  readonly bok = new Profilbok();
  /** Kamper spilt i denne økten. Bare for logging og tester. */
  private kamper = 0;

  nyKamp(): void {
    // BOKA STÅR. Det er hele forskjellen fra `Profilagent.nyKamp()`.
    this.kamper++;
  }

  antallKamper(): number {
    return this.kamper;
  }

  /**
   * Hvor aggressivt et sete spiller, i [−1, 1].
   *
   *   +1  spiller høyt: tar stikk tidlig, leder trumf, byr ofte
   *   −1  spiller lavt: sparer, dukker, passer
   *    0  ukjent, eller for få runder til å si noe
   *
   * `null` når vi ikke vet nok. Å gjette 0 og å VITE at det er 0 er to ulike
   * ting, og kalleren skal kunne skille dem.
   */
  aggressivitet(sete: number): number | null {
    const runder = this.bok.runder(sete);
    if (runder < MIN_RUNDER) return null;
    const p = this.bok.profilFor(sete) as unknown as {
      trumfutspill?: { sum: number; n: number };
      ledetTrumf?: { sum: number; n: number };
    };
    const t = p.trumfutspill ?? p.ledetTrumf;
    if (t === undefined || t.n === 0) return null;

    /**
     * ============ DEN ANDRE TERSKELEN VAR EN FLASKEHALS =================
     *
     * Her sto `if (t.n < MIN_RUNDER) return null` - en HARD terskel paa
     * `trumfutspill`, som bare oeker naar setet FORSVARER og LEDER et stikk.
     *
     * Maalt: `bydde.n` vokser hver runde (1,2,3,...,9), mens `trumfutspill.n`
     * vokser til **1 og stopper**. Terskelen kunne dermed aldri naas, og
     * `aggressivitet` returnerte null i det uendelige - selv med boka full.
     *
     * Det er noeyaktig samme feilklasse som `runder()` som telte BUD i stedet
     * for runder: en terskel som skal si «vi har sett nok» lagt paa en teller
     * som teller noe langt sjeldnere. To slike i samme funksjon, og begge
     * gjorde hele K6 umaalbar.
     *
     * KRYMPING I STEDET FOR EN HARD DOER. `tiltro(t) = n/(n+k)` er allerede
     * mekanismen prosjektet bruker for «hvor mye skal vi tro paa dette» - se
     * `profil.ts`. Med den vokser utslaget GRADVIS med observasjonene i stedet
     * for aa hoppe fra null til fullt.
     *
     * Og forsiktigheten er bevart, ikke kastet: `motpartFor` krever fortsatt
     * |a| >= 0,2 foer den vrir noe, saa en stil avlest av én runde gir et
     * krympet tall som ikke naar terskelen uansett. Forskjellen er at den KAN
     * naa den etter hvert.
     */
    const rate = t.sum / t.n;
    const rå = Math.max(-1, Math.min(1, (rate - 0.5) * 2));
    return rå * tiltro(t);
  }

  /**
   * ============ VRIEN, NÅ FRA RESIDUALET ==============================
   *
   * ARVIND: «hvis det du prøvde på ikke funket så må du bygge noe nytt som
   * funker.»
   *
   * `aggressivitet` målte RÅ ATFERD, og §108 målte at den ikke kunne virke:
   * fire identiske Adams spredte seg fra −0,45 til +0,17, et helt normalt sete
   * fyrte som «passiv», og en stilisert trumftrekker lå under terskelen.
   *
   * `Profilbok.stil` måler i stedet residualet mot nettets egen prediksjon, og
   * de tre egenskapene som manglet er nå målt og testet:
   *
   *     nullpunktet er null      fire identiske: 0 av 4 flagget
   *     vanen blir funnet        trumftrekkeren: +0,629 ± 0,036 = 17 SE
   *     beviset er stort         ~110 observasjoner per sete per 16 runder
   *
   * `null` når forskjellen ikke slår 2 SE. Da er `basis` uendret, og søket
   * oppfører seg nøyaktig som uten økt — som er riktig standard når vi ikke vet
   * noe: å vri på en stil vi ikke har sett er verre enn å la være.
   */
  stilvri(sete: number): number | null {
    const d = this.bok.stil(sete);
    if (!d.sikker || !Number.isFinite(d.se)) return null;

    /**
     * ============ MYK TERSKEL, IKKE EN HARD DØR ========================
     *
     * Her sto `forskjell` kappet på `MAKS_VRI = 0,35`. To ting var galt, og
     * K6-testens nullarm fant det andre med én gang.
     *
     * TAKET var en levning fra da anslaget var støy. Trumftrekkerens MÅLTE
     * residual er +0,629; å bruke 0,35 kastet 45 % av signalet.
     *
     * MEN Å FJERNE TAKET ALENE ER FARLIG. En port på 2 SE slipper gjennom
     * omtrent én av tjue ved ren tilfeldighet. Med det gamle myntkastet merket
     * man knapt en falsk positiv; med en full fordelingsvridning skiller
     * armene lag for godt ved første treff. Testen «armene skilte lag mot en
     * motstander UTEN vane» er nettopp den.
     *
     * MYK TERSKEL løser begge: trekk 2 SE fra utslagets STØRRELSE og gulvet
     * på null. Da gir et grensetilfelle på 2,1 SE nesten ingen vridning, mens
     * trumftrekkeren på 0,629 ± 0,036 beholder 0,557 — nesten alt.
     *
     * Det er samme form som `tiltro` bruker ellers i prosjektet: la beviset
     * bestemme størrelsen, i stedet for å slippe alt eller ingenting gjennom
     * en dør.
     */
    const tegn = d.forskjell >= 0 ? 1 : -1;
    const krympet = Math.max(0, Math.abs(d.forskjell) - 2 * d.se);
    if (krympet === 0) return null;
    return tegn * krympet;
  }

  /**
   * A2: policyen søket skal tro at `sete` spiller med.
   *
   * Vrir `basis` mot høyere eller lavere kort etter observert stil. Vrien er
   * BEGRENSET og slår bare inn når vi har sett nok runder — ellers returneres
   * `basis` uendret, og søket oppfører seg nøyaktig som før.
   */
  motpartFor(basis: Utspiller, sete: number): Utspiller {
    const skift = this.stilvri(sete);
    if (skift === null) return basis;
    const atferd = this.bok.atferdModell();
    if (atferd === null) return basis;

    return {
      velgHandling: (s: GameState): Handling => {
        const h = basis.velgHandling(s);
        // Bare KORTVALG vris. Bud og vrak er andre beslutninger med egne
        // modeller, og å vri dem her ville blandet to ting.
        if (h.type !== "SPILL" || s.iTur !== sete || s.trumf === null) return h;
        const rp = rangOgPolicy(s, sete, atferd);
        if (rp === null) return h;

        /**
         * ============ SKYV BASIS' EGET VALG, DETERMINISTISK =============
         *
         * Koblingssjekken 8. august maalte at hukommelsen endrer **2 av 548
         * valg** — 0,4 % — selv mot tre trumftrekkere. Da KAN den ikke gi en
         * maalbar poenggevinst, og det forklarer K6-maalingens 0,007 ± 0,494
         * bedre enn «kanalen betaler seg ikke». Kanalen var nesten stum.
         *
         * To grunner, begge i formen:
         *
         *   FORTYNNING  vridningen ble brukt med sannsynlighet `min(1,|skift|)`.
         *               Med skift 0,557 spilte motstanderen SOM FOER i 44 % av
         *               rolloutene, saa halve signalet forsvant.
         *   UTJEVNING   en trekning fra en vridd fordeling, midlet over 12
         *               verdener, flytter alle kandidatene omtrent likt. Da
         *               flipper soekets argmax nesten aldri.
         *
         * NAA SKYVES BASIS' EGET VALG langs den samme rangaksen residualet ble
         * maalt paa:
         *
         *     mål = h(basis sitt kort) + skift        (klemt til [0, 1])
         *     velg det lovlige kortet med rang naermest `mål`
         *
         * Deterministisk, saa hele det maalte skiftet brukes. Og nullpunktet
         * er EKSAKT: `skift = 0` gir `mål = h(basis)`, og naermeste rang er
         * basis' eget kort — bit-identisk, uten en eneste flyttallsavrunding
         * som kan vippe.
         *
         * Den vridde FORDELINGEN staar fortsatt i `atferdFor`, der troen skal
         * vekte observasjoner. Der er en fordeling riktig; her er det ett valg
         * som skal tas.
         */
        let hBasis = 0;
        for (let i = 0; i < rp.lov.length; i++) {
          if (rp.lov[i]!.farge === h.kort.farge && rp.lov[i]!.verdi === h.kort.verdi) {
            hBasis = rp.h[i]!;
            break;
          }
        }
        const mål = Math.max(0, Math.min(1, hBasis + skift));
        let beste = 0;
        let bestAvstand = Infinity;
        for (let i = 0; i < rp.lov.length; i++) {
          const d = Math.abs(rp.h[i]! - mål);
          if (d < bestAvstand) {
            bestAvstand = d;
            beste = i;
          }
        }
        return { type: "SPILL", spiller: sete, kort: rp.lov[beste]! };
      },
    };
  }

  /**
   * ============ K4 MØTER K8 =============================================
   *
   * ARVIND: «k4 og k8 henger også sammen og komplementerer hverandre. skjønner
   * du hvorfor vi må alltid ta høyde for alle kravene.»
   *
   * Ja — og dette var hullet. A5 (K8) regner
   *
   *     P(observasjon | verden) = ∏ P(p la kort c | p sin hånd i w)
   *
   * og `P` kom ALLTID fra VÅRT EGET nett. Økten (K4) kan ha lært at dette
   * setet spiller aggressivt, og likelihooden leste observasjonene som om hun
   * spilte som oss likevel. Da vektes verdenene med feil modell, og det er en
   * del av hvorfor §105 målte at alle tre slutningene til sammen bidrar
   * **1,3 %** mens renonser alene bidrar 92,7 %.
   *
   * De to kravene er samme informasjonsproblem på to tidsskalaer: K4 lærer
   * PÅ TVERS av runder, K8 slutter INNENFOR en runde. Uten denne koblingen
   * snakket de ikke sammen.
   *
   * ================= ÉN DEFINISJON, IKKE TO =============================
   *
   * `motpartFor` og denne deler `vri` og valget av dyreste/billigste. To
   * definisjoner ville drevet fra hverandre — søket ville rullet ut én
   * motstander og troen vektet etter en annen. Det er nøyaktig feilen A6
   * hadde: avsender og mottaker med hver sin kode.
   *
   * ================= OG FORMEN ER EN BLANDING, IKKE EN OVERSTYRING ======
   *
   * `motpartFor` bruker en deterministisk «mynt» fra stillingen: den spiller
   * ytterkortet i omtrent `|vri|` av stillingene. Sett over stillinger ER det
   * en blanding, og det er den blandingen likelihooden skal bruke:
   *
   *     P_vridd(c) = (1 − |vri|)·softmax(nettet)(c) + |vri|·1[c = ytterkortet]
   *
   * Mynten kan ikke brukes her: troen spør «hvor sannsynlig var dette kortet»,
   * ikke «hvilket kort ville hun valgt i akkurat denne stillingen».
   */
  atferdFor(basis: Atferdsmodell, sete: number): Atferdsmodell {
    const skift = this.stilvri(sete);
    if (skift === null) return basis;
    return {
      logits: (s: GameState, spiller: number): Float32Array | number[] => {
        const g = basis.logits(s, spiller);
        if (spiller !== sete || s.fase !== "SPILL" || s.trumf === null) return g;
        const rp = rangOgPolicy(s, spiller, basis);
        if (rp === null) return g;

        /**
         * SAMME VRIDNING SOM ROLLOUTEN, fra samme funksjon.
         *
         * Det er ikke pynt. Ruller søket ut én motstander mens troen vekter
         * observasjonene etter en annen, måler de to lagene ulike spillere —
         * nøyaktig feilen A6 hadde da avsender og leser hadde hver sin kode.
         * `rangOgPolicy` og `finnTilt` er den ene definisjonen.
         */
        const beta = finnTilt(rp.p, rp.h, skift);
        const ut = Array.from(g) as number[];
        for (let i = 0; i < rp.lov.length; i++) {
          const idx = kortIndeks(rp.lov[i]!);
          // GULV: log(0) ville gjort hele verdenen umulig på grunn av ett kort.
          ut[idx] = Math.log(Math.max(1e-12, rp.p[i]!)) + beta * rp.h[i]!;
        }
        return ut;
      },
    };
  }

}
