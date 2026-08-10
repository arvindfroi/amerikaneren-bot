/**
 * SANDKASSENETTET — ETT FELLES UNDERLAG, SEKS HODER.
 *
 * `docs/sandkassen.md` §5 og `docs/mlb.md` fase 0.4: ett nett tar alle
 * beslutninger, med alt vi har bygd som INNGANGER. Utgangen er seks hoder over
 * den samme stammen:
 *
 *   policy        68  (`HANDLING_LENGDE`)  — utfallet, selvtrent
 *   verdi          1                       — rundens SKALAR (§125)
 *   tro          208  (52 kort × 4 seter)  — hvor kortene FAKTISK lå
 *   verdiHale      1                       — den diskonterte halen (§125)
 *   stikk         13  (0…12 stikk)         — hvor STIKKENE gikk (§127)
 *   verdiKvantil  32                       — rundens FORDELING (§127)
 *
 * `V(s)` er SUMMEN av verdileddene, og identiteten `A = G − V` er urørt:
 *
 *     V_runde = verdi(skalar) + snitt(verdiKvantil)
 *     V       = V_runde + V_hale
 *
 * Delingen runde/hale kom av en måling: rundens poeng er tre ganger så
 * forutsigbart som resten av kampen (+0,60 mot +0,19 i ridge R² på de samme
 * trekkene), og ett hode mot ett blandet mål lærer det uforutsigbare leddet
 * like hardt som det forutsigbare. Se `delteRetur` i `selvspill.ts` for hvorfor
 * hver del må ha SIN EGEN etikett.
 *
 * Verdi, tro og stikk har perfekte etiketter og ingen sirkularitet. Bare
 * policyen læres av hva som virket, og det er nettopp den delen som skal være
 * selvtrent.
 *
 * ===================== STIKKHODET (§127) ================================
 *
 * `docs/mlb-arkitektur.md` og §124: 99,68 % av fordelens varians ligger MELLOM
 * runder. Verdien spår POENG, som først faller ved rundeslutt. Men kontrakten
 * avgjøres av STIKK, og stikk faller hele tiden.
 *
 * Stikkhodet spår **hvor mange stikk laget mitt tar i RESTEN av runden**, med
 * fasit kjent ved rundeslutt — nøyaktig som troens. Formen er kategorisk over
 * 0…12 og ikke totalen, og det er MÅLT og ikke valgt: totalen er per
 * konstruksjon bit-identisk for hver beslutning i samme runde (0 % av variansen
 * innenfor runden), mens «resten» flytter seg for hvert stikk. Se
 * `stikkIgjenFasit` i `selvspill.ts` for målingen.
 *
 * ===================== FORDELINGSVERDIEN (§127) =========================
 *
 * Kontrakten holder eller ryker. Utfallet er TODELT, ikke klokkeformet, og et
 * hode som spår snittet sikter mellom klumpene. Ridge-taket på +0,19 ble målt
 * for GJENNOMSNITTET — det binder ikke en fordeling.
 *
 * `verdiKvantil` er 32 kvantiler over rundens gjenstående poeng, trent med
 * kvantil-Huber. Kvantiler og ikke et fast støttesett fordi rundepoengene
 * spenner ±100 med blandede løpslengder (solo er ±målPoeng) mens massen ligger
 * i ±24 — et fast rutenett måtte enten vært grovt der massen er eller
 * meningsløst bredt.
 *
 * **Og hodet er AV som standard, eksakt.** Med `W = 0, b = 0` er snittet av
 * kvantilene 0, og `V_runde` er da bit-identisk med skalaren alene. Ablasjonen
 * er derfor ikke «omtrent uendret» — den er den samme funksjonen.
 *
 * ===================== HVORFOR TROEN ER ET HODE OG IKKE ET NETT ==========
 *
 * I dag mater `trekk.ts` et FERDIG trohode inn som 209 av sine 1 032 trekk. Det
 * er to framoverpasseringer etter hverandre, og §120 målte prisen: 0,516 ms per
 * beslutning med troen koblet på mot 0,067 ms uten. Med troen som HODE blir det
 * én passering, og stammen TVINGES til å representere hvor kortene ligger — som
 * er nettopp det policyen trenger for å spille godt.
 *
 * ===================== MEN INGENTING ER FJERNET =========================
 *
 * `trekk.ts` har fortsatt sin `tronett`-inngang, og den virker uendret. Den er
 * AVSKRUBAR og står AV som standard (én passering). Da kan vi MÅLE om en ekstern
 * tro tilfører noe utover hodet i stedet for å anta svaret — og TRO-blokkens
 * `tro.tilgjengelig`-flagg skiller allerede «ingen tro koblet på» fra «troen er
 * flat», så inngangslengden er den samme uansett.
 *
 * ===================== VEKTFORMATET =====================================
 *
 * SAMME Int32/Float32-format som `src/nevro/nett.ts` leser, så hele
 * verktøykjeden virker uendret. Fila er SJU nett i rekkefølge:
 *
 *   0  stammen     1032 → … → S
 *   1  policy         S → 68
 *   2  verdi          S → 1
 *   3  tro            S → 208
 *   4  verdiHale      S → 1     (nytt i §125)
 *   5  stikk          S → 13    (nytt i §127)
 *   6  verdiKvantil   S → 32    (nytt i §127)
 *
 * Nye hoder legges ALLTID BAKERST, og leseren tar imot 4, 5, 6 eller 7 deler.
 * Et hode som mangler bygges med `W = 0, b = 0`, og da er hver eneste utgang
 * bit-identisk med det nettet fila ble skrevet av. Hadde et nytt hode stått
 * mellom to gamle, ville en gammel fil blitt lest FORSKJØVET — trohodets vekter
 * tolket som stikkhodets — og det er den stille varianten av feil som dette
 * prosjektet har brukt mest tid på.
 *
 * `forover` legger ReLU på alle lag unntatt det SISTE i hvert nett. Stammens
 * siste lag skal aktiveres — den mater alle hodene — så ReLU-en gjøres her, rett
 * etter kallet. Det er nøyaktig ekvivalent med en stamme som avsluttes med
 * ReLU, og `verktoy/mlb-tren.py` bygger den samme formen i PyTorch.
 *
 * ===================== K2 =================================================
 *
 * Nettet ser BARE `byggTrekk(spillerVisning(...))`. Det er ikke lovet her, det
 * er prøvd: `test/mlb-k2-nett.test.ts` bytter ut de skjulte hendene og krever
 * bit-identiske utganger OG bit-identisk valgt kode gjennom hele kjeden trekk →
 * nett → valg, med en kontrollarm som lekker én bit og blir tatt.
 */

import { readFileSync } from "node:fs";

import { lagRng } from "../kort.ts";
import { forover, nettFraBytes, type NevroLag, type NevroNett } from "../nevro/nett.ts";
import { HANDLING_LENGDE } from "./handling.ts";
import { TREKK_LENGDE } from "./trekk.ts";
import { MLB_TRO_KLASSER, MLB_TRO_KORT } from "./trotrekk.ts";

// ===========================================================================
// Formen, som ÉN kilde til sannhet
// ===========================================================================

/** Policyhodets bredde. Er per definisjon handlingsrommet, ikke et eget tall. */
export const POLICY_UT = HANDLING_LENGDE; // 68
/** Trohodets bredde: 52 kort × 4 seter (rel 1–3 + talongen). */
export const TRO_UT = MLB_TRO_KORT * MLB_TRO_KLASSER; // 208
/** Verdihodet er ett tall: rundens poeng for setet som står for tur. */
export const VERDI_UT = 1;
/**
 * STIKKHODETS BREDDE: 0…12 stikk, altså 13 klasser (§127).
 *
 * Tallet er `antallStikk + 1` ved fire spillere, og det HÅNDHEVES mot motorens
 * egen kortgiving i `test/mlb-nett.test.ts`. En hardkodet 13 som stille ble feil
 * ved et annet spillerantall ville gitt et hode som trenes mot en etikett det
 * ikke har en plass til.
 */
export const STIKK_UT = 13;
/**
 * KVANTILHODETS BREDDE (§127). 32 kvantiler, τ_i = (i + ½)/32.
 *
 * Midtpunktsplasseringen er ikke pynt: med τ_i = i/K er den første kvantilen
 * τ = 0, og kvantil-Huber-tapet for τ = 0 er en ren nedoverpress uten
 * motvekt — hodet ville jaget minimumet i stedet for å beskrive fordelingen.
 */
export const KVANTIL_UT = 32;

/** τ-verdiene, én gang, delt av TS-siden og av `verktoy/mlb-tren.py`. */
export const KVANTIL_TAU: readonly number[] = Array.from(
  { length: KVANTIL_UT },
  (_, i) => (i + 0.5) / KVANTIL_UT,
);

/**
 * Delene i vektfila, i den rekkefølgen de står. Trenerens speil av denne.
 *
 * ===================== NYE HODER LEGGES BAKERST, ALLTID =================
 *
 * §125 delte verdimålet i to (`delteRetur` i `selvspill.ts`), §127 la til
 * stikkhodet og kvantilhodet. Hver gang er hodet lagt BAKERST og ikke ved siden
 * av det det hører sammen med, med vilje.
 *
 * Leseren tar imot 4, 5, 6 eller 7 deler. Et hode som mangler bygges med
 * **W = 0 og b = 0**, og da er hver eneste utgang bit-identisk med det nettet
 * fila ble skrevet av: `V_hale ≡ 0` og `snitt(kvantiler) ≡ 0`. Ti epokers
 * vekter kan altså leses videre uten at noe flytter seg.
 *
 * Hadde et hode stått mellom `verdi` og `tro`, ville en gammel fil blitt lest
 * FORSKJØVET — trohodets vekter tolket som halehodets — og det er den stille
 * varianten av feil som dette prosjektet har brukt mest tid på.
 */
export const DELER = [
  "stamme",
  "policy",
  "verdi",
  "tro",
  "verdiHale",
  "stikk",
  "verdiKvantil",
] as const;

/** Den ELDSTE filen som fortsatt kan leses: stamme + policy + verdi + tro. */
const MINSTE_DELER = 4;

/** Standardformen på stammen. Trenerens `--skjult` overstyrer den. */
export const STANDARD_SKJULT: readonly number[] = [1024, 768, 512];

// ===========================================================================
// Kontrakten
// ===========================================================================

export interface Framover {
  /** 68 tall, RÅ logits — ikke normalisert. Maskeringen hører til i `velgKode`. */
  readonly policy: Float32Array;
  /**
   * `V(s) = V_runde(s) + V_hale(s)`. SUMMEN er grunnlinjen fordelen trekker
   * fra, og den er det eneste `selvspill.ts` bruker — delingen er en sak
   * mellom hodene og etikettene deres, ikke mellom nettet og kalleren.
   */
  readonly verdi: number;
  /**
   * Delene bak `verdi`, for DIAGNOSTIKK — `V_runde` og den ferdig diskonterte
   * `V_hale` (§125).
   *
   * De er VALGFRIE fordi `NettLik` også oppfylles av stillaser som ikke har to
   * verdihoder: `tilfeldigNett` og K2-prøvenes forsterker. Å kreve dem der
   * ville tvunget et stillas til å late som det har en deling det ikke har, og
   * `selvspill.ts` bruker uansett bare summen — delingen er en sak mellom
   * hodene og etikettene deres.
   */
  readonly verdiRunde?: number;
  readonly verdiHale?: number;
  /** 208 tall, RÅ logits. Softmax per kort over de fire klassene gjøres av leseren. */
  readonly tro: Float32Array;
  /**
   * STIKKHODET (§127): 13 RÅ logits over «hvor mange stikk tar laget mitt i
   * RESTEN av denne runden», 0…12. Softmax gjøres av leseren.
   *
   * VALGFRITT av samme grunn som `verdiRunde`: `NettLik` oppfylles også av
   * stillaser uten hodet (`tilfeldigNett`, K2-prøvenes forsterker), og
   * `selvspill.ts` leser det ikke i beslutningen — det er en hjelpeoppgave som
   * former stammen, ikke en inngang til valget.
   */
  readonly stikk?: Float32Array;
  /**
   * KVANTILHODET (§127): 32 tall i POENG, ikke normalisert. `snitt` av dem er
   * fordelingens forventning, og det er nøyaktig det leddet `verdi` bærer.
   */
  readonly verdiKvantil?: Float32Array;
}

// ===========================================================================
// Nettet
// ===========================================================================

const antallVekter = (nett: NevroNett): number =>
  nett.lag.reduce((a, l) => a + l.inn * l.ut + l.ut, 0);

export class Sandkassenett {
  private readonly stamme: NevroNett;
  private readonly policyHode: NevroNett;
  private readonly verdiHode: NevroNett;
  private readonly troHode: NevroNett;
  private readonly haleHode: NevroNett;
  private readonly stikkHode: NevroNett;
  private readonly kvantilHode: NevroNett;
  /** Hvor mange deler fila FAKTISK hadde — for rapportering, ikke for logikk. */
  readonly lesteDeler: number;

  /** Antall trekk nettet tar inn. Er `TREKK_LENGDE`, og det håndheves. */
  readonly inngangsLengde: number;
  /** Stammens bredde ut — den delte representasjonen alle tre hodene leser. */
  readonly stammeBredde: number;

  constructor(deler: readonly NevroNett[]) {
    /**
     * FIRE TIL SJU DELER, og ingenting utenfor.
     *
     * Fire er formatet før §125, fem før §127, sju etter. Manglende haledeler
     * bygges med W = 0 og b = 0, og da er hver utgang bit-identisk med det
     * nettet fila ble skrevet av. Tre — eller åtte — er en forskjøvet eller
     * fremmed fil, og den skal bli en feilmelding og ikke stille søppel.
     */
    if (deler.length < MINSTE_DELER || deler.length > DELER.length) {
      throw new Error(
        `Sandkassenettet er ${MINSTE_DELER}–${DELER.length} nett ` +
          `(${DELER.join(", ")}). Fila har ${deler.length}.`,
      );
    }
    const [stamme, policy, verdi, tro] = deler as [NevroNett, NevroNett, NevroNett, NevroNett];

    /**
     * BREDDENE HÅNDHEVES, alle sammen.
     *
     * Et nett med feil form ville gitt tause søppelvekter i stedet for en
     * feilmelding, og en forskjøvet policy er nesten usynlig: alt kjører, alt er
     * lovlig (masken redder oss), og valgene er bare litt rare. Samme grunn som
     * i `tronett.ts` — men her gjelder det fire nett som må passe sammen.
     */
    const først = (n: NevroNett, navn: string): NevroLag => {
      const l = n.lag[0];
      if (l === undefined) throw new Error(`Sandkassenettet: ${navn} er tomt`);
      return l;
    };
    const sist = (n: NevroNett, navn: string): NevroLag => {
      const l = n.lag[n.lag.length - 1];
      if (l === undefined) throw new Error(`Sandkassenettet: ${navn} er tomt`);
      return l;
    };

    const inn = først(stamme, "stammen").inn;
    if (inn !== TREKK_LENGDE) {
      throw new Error(`Sandkassenettet tar ${TREKK_LENGDE} trekk, stammen har ${inn}`);
    }
    const bredde = sist(stamme, "stammen").ut;

    /**
     * ET HODE SOM IKKE STO I FILA: W = 0, b = 0.
     *
     * For halen betyr det `V_hale ≡ 0`, for kvantilene `snitt ≡ 0`, og for
     * stikkhodet en uniform fordeling som ingen leser. Alle tre er den
     * NØYTRALE verdien for sitt ledd, og det er ikke et sammentreff — et hode
     * som ikke kan være nøytralt hører ikke hjemme bakerst i denne fila.
     */
    const nullhode = (ut: number): NevroNett => ({
      lag: [
        {
          inn: bredde,
          ut,
          vekter: new Float32Array(bredde * ut),
          bias: new Float32Array(ut),
        },
      ],
    });

    const hale: NevroNett = deler[4] ?? nullhode(VERDI_UT);
    const stikk: NevroNett = deler[5] ?? nullhode(STIKK_UT);
    const kvantil: NevroNett = deler[6] ?? nullhode(KVANTIL_UT);

    const krav: readonly [NevroNett, string, number][] = [
      [policy, "policy", POLICY_UT],
      [verdi, "verdi", VERDI_UT],
      [tro, "tro", TRO_UT],
      [hale, "verdiHale", VERDI_UT],
      [stikk, "stikk", STIKK_UT],
      [kvantil, "verdiKvantil", KVANTIL_UT],
    ];
    for (const [n, navn, ut] of krav) {
      if (først(n, navn).inn !== bredde) {
        throw new Error(
          `Hodet «${navn}» tar ${først(n, navn).inn} inn, men stammen gir ${bredde} ut`,
        );
      }
      if (sist(n, navn).ut !== ut) {
        throw new Error(`Hodet «${navn}» må ha ${ut} utganger, det har ${sist(n, navn).ut}`);
      }
    }

    this.stamme = stamme;
    this.policyHode = policy;
    this.verdiHode = verdi;
    this.troHode = tro;
    this.haleHode = hale;
    this.stikkHode = stikk;
    this.kvantilHode = kvantil;
    this.inngangsLengde = inn;
    this.stammeBredde = bredde;
    this.lesteDeler = deler.length;
  }

  /** Delene i filrekkefølge — én kilde til sannhet for skriving og rapportering. */
  private nett(): readonly NevroNett[] {
    return [
      this.stamme,
      this.policyHode,
      this.verdiHode,
      this.troHode,
      this.haleHode,
      this.stikkHode,
      this.kvantilHode,
    ];
  }

  static fraBytes(b: Uint8Array): Sandkassenett {
    return new Sandkassenett(nettFraBytes(b));
  }

  static fraFil(sti: string): Sandkassenett {
    return Sandkassenett.fraBytes(readFileSync(sti));
  }

  /**
   * ET TILFELDIG INITIERT NETT, deterministisk av frøet.
   *
   * `docs/mlb.md` AVGJØRELSE 1: MLB starter fra tilfeldige vekter, og fase 1 er
   * «et TILFELDIG nett spiller lovlig i 1000 kamper uten å krasje». Da må et
   * slikt nett kunne lages uten at en Python-kjøring har vært innom først —
   * ellers kan hverken prøvene eller fornuftssjekken kjøre alene.
   *
   * He-initialisering (`sqrt(2/inn)`), som er det PyTorch-siden bruker for et
   * ReLU-nett. Fordelingen er ikke bit-lik PyTorchs — det er heller ikke
   * poenget: dette nettet skal aldri sammenliknes mot et Python-nett, det skal
   * bare være tilfeldig, lovlig og reproduserbart.
   */
  static tilfeldig(frø: number, skjult: readonly number[] = STANDARD_SKJULT): Sandkassenett {
    const rng = lagRng(frø);
    // Box–Muller, så vektene er normalfordelte og ikke uniforme.
    const normal = (): number => {
      const u = Math.max(1e-12, rng());
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
    };
    const lag = (inn: number, ut: number): NevroLag => {
      const s = Math.sqrt(2 / inn);
      const vekter = new Float32Array(inn * ut);
      for (let i = 0; i < vekter.length; i++) vekter[i] = normal() * s;
      return { inn, ut, vekter, bias: new Float32Array(ut) };
    };
    const dims = [TREKK_LENGDE, ...skjult];
    const stamme: NevroLag[] = [];
    for (let i = 0; i + 1 < dims.length; i++) stamme.push(lag(dims[i]!, dims[i + 1]!));
    const bredde = dims[dims.length - 1]!;
    // NULLHODENE STARTER PÅ NULL, også i et tilfeldig nett — nøyaktig som når en
    // fil fra før §125/§127 leses. Da er «tilfeldig nett» det SAMME nettet før
    // og etter, og fase 1s fornuftssjekk måler fortsatt det den målte.
    const null0 = (ut: number): NevroNett => ({
      lag: [
        { inn: bredde, ut, vekter: new Float32Array(bredde * ut), bias: new Float32Array(ut) },
      ],
    });
    return new Sandkassenett([
      { lag: stamme },
      { lag: [lag(bredde, POLICY_UT)] },
      { lag: [lag(bredde, VERDI_UT)] },
      { lag: [lag(bredde, TRO_UT)] },
      null0(VERDI_UT),
      null0(STIKK_UT),
      null0(KVANTIL_UT),
    ]);
  }

  /**
   * VEKTENE UT IGJEN, i samme format `nettFraBytes` leser.
   *
   * Finnes fordi epoke 0 må kunne LAGES uten at en Python-kjøring har vært
   * innom først. `verktoy/mlb-tren.py --referanse` kan også skrive et tilfeldig
   * nett, men den krever et datasett å hente referanserader fra, og da er
   * «start ligaen fra tilfeldige vekter» (AVGJØRELSE 1) plutselig avhengig av
   * at det finnes data. Det er en kobling som ikke skal finnes.
   *
   * `test/mlb-nett.test.ts` krever at `fraBytes(tilBytes(n))` gir bit-like
   * vekter — en skriver uten en leser rundt seg er en fil ingen kan bruke.
   */
  tilBytes(): Uint8Array {
    const nett = this.nett();
    let bytes = 4;
    for (const n of nett) {
      bytes += 4;
      for (const l of n.lag) bytes += 8 + l.inn * l.ut * 4 + l.ut * 4;
    }
    const ut = new Uint8Array(bytes);
    const dv = new DataView(ut.buffer);
    let p = 0;
    const skrivInt = (v: number): void => {
      dv.setInt32(p, v, true);
      p += 4;
    };
    skrivInt(nett.length);
    for (const n of nett) {
      skrivInt(n.lag.length);
      for (const l of n.lag) {
        skrivInt(l.inn);
        skrivInt(l.ut);
        for (let i = 0; i < l.vekter.length; i++) dv.setFloat32(p + i * 4, l.vekter[i]!, true);
        p += l.vekter.length * 4;
        for (let i = 0; i < l.bias.length; i++) dv.setFloat32(p + i * 4, l.bias[i]!, true);
        p += l.bias.length * 4;
      }
    }
    return ut;
  }

  /** Antall parametre, per del og totalt — for rapportering, ikke for pynt. */
  parametre(): {
    readonly stamme: number;
    readonly policy: number;
    readonly verdi: number;
    readonly tro: number;
    readonly verdiHale: number;
    readonly stikk: number;
    readonly verdiKvantil: number;
    readonly sum: number;
  } {
    const s = antallVekter(this.stamme);
    const p = antallVekter(this.policyHode);
    const v = antallVekter(this.verdiHode);
    const t = antallVekter(this.troHode);
    const h = antallVekter(this.haleHode);
    const k = antallVekter(this.stikkHode);
    const q = antallVekter(this.kvantilHode);
    return {
      stamme: s,
      policy: p,
      verdi: v,
      tro: t,
      verdiHale: h,
      stikk: k,
      verdiKvantil: q,
      sum: s + p + v + t + h + k + q,
    };
  }

  /** Lagformen, `[inn, ut]` per lag per del — for rapportering. */
  form(): Record<string, readonly (readonly [number, number])[]> {
    const nett = this.nett();
    const ut: Record<string, readonly (readonly [number, number])[]> = {};
    for (let i = 0; i < DELER.length; i++) {
      ut[DELER[i]!] = nett[i]!.lag.map((l) => [l.inn, l.ut] as const);
    }
    return ut;
  }

  /**
   * ÉN framoverpassering: stammen én gang, tre hoder på den samme
   * representasjonen.
   *
   * ReLU-en på stammens siste lag gjøres HER. `forover` hopper over den på det
   * siste laget i hvert nett, fordi det normalt er logits — men stammens siste
   * lag er ikke logits, det er en skjult representasjon.
   */
  framover(trekk: Float32Array): Framover {
    if (trekk.length !== this.inngangsLengde) {
      throw new Error(`Sandkassenettet ventet ${this.inngangsLengde} trekk, fikk ${trekk.length}`);
    }
    const h = forover(this.stamme, trekk);
    for (let i = 0; i < h.length; i++) if (h[i]! < 0) h[i] = 0;
    const kvantil = forover(this.kvantilHode, h);
    /**
     * FORVENTNINGEN ER SNITTET AV KVANTILENE, og det er ikke en tilnærming: med
     * τ_i = (i + ½)/K er `(1/K)·Σ θ_i` midtpunktsregelen for `∫₀¹ F⁻¹(τ) dτ`,
     * som ER forventningen. Er hodet null (fil før §127, eller ablasjonen),
     * blir leddet eksakt 0 og `V_runde` er skalaren alene.
     */
    let kvantilSnitt = 0;
    for (let i = 0; i < kvantil.length; i++) kvantilSnitt += kvantil[i]!;
    kvantilSnitt /= Math.max(1, kvantil.length);

    const runde = (forover(this.verdiHode, h)[0] ?? 0) + kvantilSnitt;
    const hale = forover(this.haleHode, h)[0] ?? 0;
    return {
      policy: forover(this.policyHode, h),
      verdi: runde + hale,
      verdiRunde: runde,
      verdiHale: hale,
      tro: forover(this.troHode, h),
      stikk: forover(this.stikkHode, h),
      verdiKvantil: kvantil,
    };
  }

  /** Stikkhodet lest som en fordeling over 0…12 stikk. Softmax, én gang. */
  stikkFordeling(trekk: Float32Array): number[] {
    return softmaks(this.framover(trekk).stikk ?? new Float32Array(STIKK_UT));
  }

  /**
   * Trohodet lest som en fordeling — `p[kort][klasse]`, softmax per kort. Samme
   * FORM som `MlbTronett.fordeling`, så de to kan måles mot hverandre.
   *
   * ============ MEN ET SANDKASSENETT ER IKKE EN `Trofordeler` =============
   *
   * Det ser ut som det burde være det, og et forsøk på å sette det inn i
   * `trekk.ts` sin `tronett`-inngang ble stoppet av bredden: `Trofordeler`
   * mates med `troTrekk(...)` på 660, mens denne tar hele sandkassevektoren på
   * 1 032. Å koble hodet inn der ville dessuten vært SIRKULÆRT — TRO-blokken er
   * en del av de 1 032.
   *
   * `Trofordeler` er altså en EKSTERN tro, og den forblir ekstern. Det er
   * nøyaktig den armen som skal måles mot hodet, og metoden heter derfor noe
   * annet enn `fordeling` med vilje: to funksjoner med samme navn og ulik
   * inngangsbredde er en feil som venter på å skje.
   */
  troFordeling(trekk: Float32Array): number[][] {
    return tilFordeling(this.framover(trekk).tro);
  }
}

/** Softmaks over en hel vektor. Maks trekkes fra — `exp(700)` er `Infinity`. */
export function softmaks(rå: Float32Array | readonly number[]): number[] {
  let maks = -Infinity;
  for (let i = 0; i < rå.length; i++) maks = Math.max(maks, rå[i] ?? 0);
  if (!Number.isFinite(maks)) return Array.from({ length: rå.length }, () => 1 / rå.length);
  let sum = 0;
  const ut = new Array<number>(rå.length);
  for (let i = 0; i < rå.length; i++) {
    const e = Math.exp((rå[i] ?? 0) - maks);
    ut[i] = e;
    sum += e;
  }
  for (let i = 0; i < ut.length; i++) ut[i]! /= sum;
  return ut;
}

/** 208 rå logits → `p[kort][klasse]`, normalisert per kort over de fire klassene. */
export function tilFordeling(rå: Float32Array): number[][] {
  if (rå.length !== TRO_UT) throw new Error(`Trohodet gir ${TRO_UT} tall, fikk ${rå.length}`);
  const ut: number[][] = [];
  for (let k = 0; k < MLB_TRO_KORT; k++) {
    const b = k * MLB_TRO_KLASSER;
    let maks = -Infinity;
    for (let c = 0; c < MLB_TRO_KLASSER; c++) maks = Math.max(maks, rå[b + c] ?? 0);
    let sum = 0;
    const rad = new Array<number>(MLB_TRO_KLASSER);
    for (let c = 0; c < MLB_TRO_KLASSER; c++) {
      const e = Math.exp((rå[b + c] ?? 0) - maks);
      rad[c] = e;
      sum += e;
    }
    for (let c = 0; c < MLB_TRO_KLASSER; c++) rad[c]! /= sum;
    ut.push(rad);
  }
  return ut;
}

// ===========================================================================
// Det maskerte valget
// ===========================================================================

/**
 * Skrivebuffere, som i `nevro/nett.ts`. Trygt uten låsing fordi `velgKode` ikke
 * kaller noe som kan kalle `velgKode` igjen, og fordi hver arbeidertråd har sin
 * egen modulinstans.
 */
let lovlige = new Int32Array(0);
let vekter = new Float64Array(0);

/**
 * MASKERT VALG. `temperatur = 0` gir argmaks.
 *
 * ===================== DEN HARDE SKRANKEN ===============================
 *
 * Returverdien er ALLTID en kode der `maske[kode] === 1`. Ikke «nesten alltid»,
 * ikke «når logitsene er fornuftige». Nettet skal aldri kunne velge ulovlig, og
 * `handling.ta` kaster på en ulovlig kode — en agent som kastet én gang i
 * timen ville stoppet en flertimers liga midt i.
 *
 * Derfor er hvert eneste degenererte tilfelle håndtert EKSPLISITT, og
 * `test/mlb-nett.test.ts` prøver dem med tilfeldige logits og masker, inkludert
 * masker med bare én åpen plass og logits med `-Infinity` og `NaN`:
 *
 *   `NaN`          hoppes over i både argmaks og vekting. Et NaN-logit er en
 *                  feil et annet sted, men det skal ikke bli et ULOVLIG TREKK.
 *   `-Infinity`    får vekt `exp(-Infinity) = 0`, altså aldri valgt — med
 *                  mindre ALLE er det, og da trekkes det uniformt.
 *   alle like ille (bare `NaN`/`-Infinity`) → uniformt over de lovlige.
 *   `+Infinity`    gir `Infinity - Infinity = NaN` i skaleringen, så en
 *                  ikke-endelig maksimum faller også til det uniforme valget.
 *   `rng()` ≥ 1, `NaN`, eller en avrundingsrest → siste plass med vekt.
 *   temperatur ≤ 0 eller `NaN` → argmaks. (`!(t > 0)` fanger NaN, `t <= 0` ikke.)
 *
 * Masken er den samme `handling.maske` som er prøvd mot motorens egen
 * `lovligeHandlinger`. Det finnes bare ÉN lovlighetsregel i dette systemet.
 */
export function velgKode(
  logits: Float32Array,
  maske: Uint8Array,
  temperatur: number,
  rng: () => number,
): number {
  if (logits.length !== maske.length) {
    throw new Error(`velgKode: ${logits.length} logits mot ${maske.length} maskeplasser`);
  }
  const n = maske.length;
  if (lovlige.length < n) lovlige = new Int32Array(n);
  if (vekter.length < n) vekter = new Float64Array(n);

  let m = 0;
  for (let i = 0; i < n; i++) if (maske[i] === 1) lovlige[m++] = i;
  if (m === 0) {
    throw new Error(
      "velgKode: masken er TOM. Det er ikke et valg som kan reddes — det betyr at " +
        "kalleren spør om en handling i en stilling der ingen finnes.",
    );
  }
  // Én åpen plass: svaret er gitt, og ingen aritmetikk kan gjøre det galt.
  if (m === 1) return lovlige[0]!;

  if (!(temperatur > 0)) {
    let best = lovlige[0]!;
    let bestVerdi = -Infinity;
    for (let k = 0; k < m; k++) {
      const i = lovlige[k]!;
      const x = logits[i]!;
      if (Number.isNaN(x)) continue;
      if (x > bestVerdi) {
        bestVerdi = x;
        best = i;
      }
    }
    return best;
  }

  let maks = -Infinity;
  for (let k = 0; k < m; k++) {
    const x = logits[lovlige[k]!]!;
    if (!Number.isNaN(x) && x > maks) maks = x;
  }

  let sum = 0;
  if (Number.isFinite(maks)) {
    for (let k = 0; k < m; k++) {
      const i = lovlige[k]!;
      const x = logits[i]!;
      const w = Number.isNaN(x) ? 0 : Math.exp((x - maks) / temperatur);
      vekter[k] = w;
      sum += w;
    }
  }
  if (!(sum > 0) || !Number.isFinite(sum)) {
    // Ingen brukbar fordeling: uniformt over de lovlige. Fortsatt et LOVLIG valg.
    const u = rng();
    let j = Number.isFinite(u) ? Math.floor(u * m) : 0;
    if (!(j >= 0)) j = 0;
    if (j >= m) j = m - 1;
    return lovlige[j]!;
  }

  const t = rng() * sum;
  let akk = 0;
  let sisteMedVekt = -1;
  for (let k = 0; k < m; k++) {
    const w = vekter[k]!;
    if (w <= 0) continue;
    sisteMedVekt = lovlige[k]!;
    akk += w;
    if (t < akk) return lovlige[k]!;
  }
  // `rng()` ga 1, NaN, eller avrundingen kom til kort. Den siste med vekt er
  // både lovlig og den fordelingen faktisk pekte på.
  return sisteMedVekt >= 0 ? sisteMedVekt : lovlige[m - 1]!;
}
