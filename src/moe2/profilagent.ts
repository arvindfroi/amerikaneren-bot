/**
 * MOTSTANDERMODELLEN, KOBLET INN.
 *
 * Arvind, 4. august: «jeg vil at john doe skal starte et spill mot botten og
 * etterhvert gjennom spillet så blir botten bedre og bedre til å slå han.
 * ingen data på forhånd.»
 *
 * `src/moe2/profil.ts` har vært bygget og testet siden da, men aldri koblet
 * til noe. Dette er koblingen.
 *
 * ============================ HVA DEN GJØR ================================
 *
 * Holder én profil per SETE, bygget utelukkende av det som skjer ved bordet i
 * kampen som spilles nå. Ingen data på forhånd, ingen database. Ved rundeslutt
 * er alle kort avdekket, og runden legges inn som observasjon.
 *
 * Den ene tingen den påvirker i dag er FORSVARSVERDIEN i budgivningen: hva det
 * er verdt å la den andre få kontrakten. Mot en som berger 92 % av kontraktene
 * sine er forsvar nesten verdiløst; mot en som berger 62 % er det verdt
 * omtrent dobbelt så mye.
 *
 * ===================== HVORFOR DEN FORSKYVER, IKKE ERSTATTER ===============
 *
 * `evForsvarMot` gir tall rundt +2 til +6. Den innstilte konstanten er −3,0,
 * og sveipen 5. august målte at den er et lokalt optimum i BEGGE retninger:
 * −5 ga −0,115, +1,5 ga −0,030. Å bytte konstanten mot modellen ville flyttet
 * boten langt ut av det målte optimumet.
 *
 * Derfor bidrar profilen med et AVVIK fra befolkningssnittet, ikke med en
 * absoluttverdi. Kjenner vi ingen, er avviket null og boten spiller nøyaktig
 * som før — det er en hard garanti, ikke en forhåpning.
 *
 * ============================== TILTROEN ==================================
 *
 * Avviket vektes med `tiltro = n/(n+k)`: null i første runde, 45 % etter ti,
 * 71 % etter tretti. Planen sier hvorfor krympingen er så treg: «sikkerhet på
 * to runder er verre enn ingen profil».
 */

import {
  leggTil,
  rundensResidualer,
  stilForskjell,
  TOMT_BIAS,
  type Biasanslag,
} from "./stilbias.ts";
import type { Atferdsmodell } from "./troverdighet.ts";
import type { GameState } from "../motor.ts";
import type { Handling } from "../motor.ts";
import {
  BEFOLKNING,
  evForsvarMot,
  oppdater,
  tiltro,
  tomProfil,
  type Profil,
  type Rundeobservasjon,
} from "./profil.ts";

/** Hvor mye avviket får slå ut når vi kjenner personen fullt ut. */
export const MAKS_UTSLAG = 2.0;

export interface Budjusterbar {
  settForsvarsjustering(f: ((state: GameState) => number) | null): void;
}

export class Profilbok {
  private readonly profiler = new Map<number, Profil>();
  /** Runden vi sist bokførte, per sete – så én runde ikke telles to ganger. */
  private sistBokfort = -1;

  /**
   * ============ STILBIAS: RESIDUALET, IKKE RÅ ATFERD ==================
   *
   * `Profil` måler HVA setet gjorde. Dette måler hvor mye det avvek fra det
   * nettet ventet i nøyaktig den stillingen — og det er forskjellen mellom en
   * detektor som virker og en som ikke gjør det (§108 mot `stilbias.ts`).
   *
   * `atferd` settes utenfra, av spekbyggeren, fordi boka ikke skal kjenne til
   * nettfiler. Uten den er alt her stumt og resten oppfører seg som før.
   */
  private readonly bias = new Map<number, Biasanslag>();
  private atferd: Atferdsmodell | null = null;
  /**
   * Totalpoengene FØR runden. De endres bare ved rundeslutt, så enhver
   * stilling vi ser mens runden pågår bærer dem. Uten dem koder nettet
   * poengandelene med rundens resultat alt lagt til — altså med fasit.
   */
  private poengFør: readonly number[] | null = null;

  settAtferd(a: Atferdsmodell): void {
    // FOERSTEMANN VINNER. Speken kan naevne flere nett (soekets motpart, troens
    // policy); residualet skal maales mot ÉN policy, ellers sammenlignes runder
    // med ulike malestokker.
    if (this.atferd === null) this.atferd = a;
  }

  harAtferd(): boolean {
    return this.atferd !== null;
  }

  biasFor(sete: number): Biasanslag {
    return this.bias.get(sete) ?? TOMT_BIAS;
  }

  /**
   * Skiller `sete` seg fra de andre ved bordet, målt mot deres egen spredning?
   *
   * Referansen er medianspilleren, ikke snittet: med snittet drar én uteligger
   * nullpunktet og gjør alle de andre «særegne» — målt, se `stilbias.ts`.
   */
  stil(sete: number): { forskjell: number; se: number; sikker: boolean } {
    const andre: Biasanslag[] = [];
    for (let p = 0; p < 4; p++) if (p !== sete) andre.push(this.biasFor(p));
    return stilForskjell(this.biasFor(sete), andre);
  }

  profilFor(sete: number): Profil {
    let p = this.profiler.get(sete);
    if (p === undefined) {
      p = tomProfil(`sete${sete}`);
      this.profiler.set(sete, p);
    }
    return p;
  }

  /**
   * HVOR MANGE RUNDER HAR VI SETT DETTE SETET?
   *
   * Sto `this.profilFor(sete).bud.n`, og det var en stille, alvorlig feil:
   * `bud` legges bare til naar setet FAKTISK MELDTE (`o.bud === null` gir
   * ingen oppdatering av `bud`). Terskelen `MIN_RUNDER = 4` telte altsaa fire
   * BUD, ikke fire runder.
   *
   * Maalt av K6-proeven: med en typisk budandel paa ~0,33 inntreffer terskelen
   * rundt **runde tolv** - altsaa omtrent naar en kamp til 100 poeng er
   * ferdig. OEktminnet aktiverte seg i praksis aldri i en normal kamp, og K6
   * («laere andre spilleres vaner ila spillet») var derfor eksakt null i den
   * utrullede Adams uansett hvor godt resten virket.
   *
   * `bydde` teller HVER observert runde - den dokumenterer seg selv som
   * «andel budrunder hun gikk inn i i det hele tatt», og `oppdater` legger til
   * 0 eller 1 for hver runde. Det er telleren terskelen alltid mente.
   */
  runder(sete: number): number {
    return this.profilFor(sete).bydde.n;
  }

  /**
   * Bokfører runden når den er over. Kalles på hver tilstand; gjør ingenting
   * før fasen faktisk er RUNDE_SLUTT, og bare én gang per runde.
   */
  observer(state: GameState): void {
    // Fanges MENS runden går: ved rundeslutt er poengene allerede delt ut.
    if (state.fase === "SPILL") this.poengFør = state.totalPoeng;
    if (state.fase !== "RUNDE_SLUTT" || state.rundeNr === this.sistBokfort) return;
    this.sistBokfort = state.rundeNr;

    /**
     * RESIDUALENE FOR RUNDEN — her, og bare her.
     *
     * De krever hendene, som er skjult mens runden spilles og kjent når den er
     * over. Valgene i runde `r` ser derfor bare residualer fra runde `< r`, og
     * K2-prøven ser fortsatt invarians under skjult informasjon.
     */
    if (this.atferd !== null) {
      const res = rundensResidualer(state, this.atferd, this.poengFør ?? undefined);
      for (const [sete, liste] of res) {
        let a = this.biasFor(sete);
        for (const x of liste) a = leggTil(a, x);
        this.bias.set(sete, a);
      }
    }
    this.poengFør = null;
    const bv = state.budvinner;
    if (bv === null || bv === undefined) return;
    const kontrakt = typeof state.budrunde.sisteBud[bv] === "number"
      ? (state.budrunde.sisteBud[bv] as number)
      : null;

    for (let sete = 0; sete < state.antallSpillere; sete++) {
      const bud = state.budrunde.sisteBud[sete];
      // ALLE KORT ER AVDEKKET nå. Det er ikke lekkasje – det er slik mennesker
      // leser hverandre mellom runder.
      const hand = [
        ...state.historikk.flatMap((t) => t.kort.filter((kp) => kp.spiller === sete).map((kp) => kp.kort)),
      ];
      const trumf = state.trumf;
      const trumflengde = trumf === null ? undefined : hand.filter((k) => k.farge === trumf).length;
      const honnorer = hand.length === 0 ? undefined : hand.filter((k) => k.verdi >= 11).length;
      const erVinner = sete === bv;
      // LEDET HUN TRUMF I FORSVAR? Stilmålet: en som leder trumf spiller
      // aktivt, en som aldri gjør det spiller passivt. Uten dette feltet
      // hadde profilen ingen anelse om hvordan folk SPILLER — bare hvordan de
      // byr, som er den enkle halvparten.
      let ledetTrumf: boolean | undefined;
      if (!erVinner && trumf !== null) {
        const ledet = state.historikk.filter((t) => t.kort[0]?.spiller === sete);
        if (ledet.length > 0) ledetTrumf = ledet.some((t) => t.kort[0]!.kort.farge === trumf);
      }
      const lagStikk = erVinner && state.makker !== null
        ? (state.stikkVunnet[sete] ?? 0) + (state.stikkVunnet[state.makker] ?? 0)
        : (state.stikkVunnet[sete] ?? 0);

      const o: Rundeobservasjon = {
        id: `sete${sete}`,
        bud: typeof bud === "number" ? bud : null,
        varBudvinner: erVinner,
        poeng: state.totalPoeng[sete] ?? 0,
        ...(erVinner && kontrakt !== null ? { klarte: lagStikk >= kontrakt, lagStikk } : {}),
        ...(trumflengde === undefined ? {} : { trumflengde }),
        ...(honnorer === undefined ? {} : { honnorer }),
        ...(ledetTrumf === undefined ? {} : { ledetTrumf }),
      };
      this.profiler.set(sete, oppdater(this.profilFor(sete), o));
    }
  }

  /**
   * MOTSTANDERNES SPILLESTIL, som et vaktflagg søket kan rulle ut med.
   *
   * Søket forestiller seg i dag at de andre spiller som en generisk Adams.
   * Vet vi at de aldri drar trumf, skal utspillingen modellere DET — ellers
   * evaluerer vi linjer mot en motstander som ikke sitter der.
   *
   * `trumfutspill` er andelen utspill som var trumf i forsvar. Befolkningen
   * ligger på 0,14. Ligger bordet MARKERT under, spiller de passivt, og
   * `abmpd` (drar ikke trumf, målt −0,237 mot abmp i selvspill) er en bedre
   * modell av dem enn baselinjen.
   *
   * `null` betyr «vet ikke nok» — da skal søket bruke sin vanlige motpart.
   * Terskelen på 0,4 tiltro er med vilje høy: en stil avlest av to runder er
   * verre enn ingen stil.
   */
  spillestil(): string | null {
    let sum = 0;
    let n = 0;
    let t = 0;
    for (const [, p] of this.profiler) {
      sum += p.trumfutspill.sum;
      n += p.trumfutspill.n;
      t = Math.max(t, tiltro(p.trumfutspill));
    }
    if (n < 6 || t < 0.4) return null;
    const rate = sum / n;
    if (rate < BEFOLKNING.trumfutspill * 0.5) return "abmpd";
    return null;
  }

  /**
   * Forskyvningen av forsvarsverdien i DENNE budstillingen.
   *
   * Null når ingen har bydd (da er det ingen å forsvare seg mot) og null i
   * første runde mot en ukjent. Ellers: avviket fra befolkningssnittet,
   * begrenset til `MAKS_UTSLAG`.
   *
   * ==================== TILTROEN STO TO GANGER =========================
   *
   * Her sto det `const avvik = (mot - snitt) * t` med `t = tiltro(p.klarte)`,
   * og det var å telle den samme forsiktigheten to ganger. Regn det ut:
   *
   *     mot − snitt = (2B/3) · (pop − krymp(klarte))
   *     krymp(a, pop, k) − pop = tiltro · (snitt(a) − pop)      per definisjon
   *   ⇒ mot − snitt = (2B/3) · tiltro · (pop − snitt_klarte)
   *   ⇒ (mot − snitt) · t = (2B/3) · tiltro² · (pop − snitt_klarte)
   *
   * `krymp` FINNES for å veie individet mot befolkningen etter hvor mye vi har
   * sett — det er hele jobben dens. Å gange resultatet med `tiltro` én gang til
   * gjorde ikke kanalen forsiktig, den gjorde den kvadratisk forsiktig.
   *
   * MÅLT, ikke resonnert (`analyse/k4-budkanal.txt`, 53 ekte budbeslutninger
   * etter to forkamper): tiltroen der kanalen fyrte var i snitt 0,433, og
   * dobbelttellingen kostet nøyaktig den faktoren — snitt |justering| 0,244 mot
   * 0,530, maks 0,80 mot 1,39. K4-prøven målte samtidig at kanalen var «2,0×
   * for svak». Det er samme tall fra to kanter.
   *
   * NULLPUNKTET STÅR: med null observasjoner returnerer `krymp` befolkningen
   * uendret, så `mot − snitt` er eksakt 0 — samme uttrykk, samme rekkefølge,
   * bit-identisk med at profilen er av. Vakten under gjør det uavhengig av
   * flyttallsdetaljer.
   *
   * DET SOM IKKE ER RETTET, sagt høyt: `MAKS_UTSLAG = 2,0` klippet 0 av 53
   * stillinger både før og etter, så den er ikke bindende og er ikke rørt.
   * `evForsvarMot` deler på 3 («vi er én av tre forsvarere») selv om budlaget
   * har en makker og forsvaret dermed er to — men det tallet er et
   * KALIBRERINGSVALG som skal måles i styrke, ikke justeres her fordi det ville
   * gitt K4 et penere tall.
   */
  justering(state: GameState): number {
    if (state.fase !== "BUDRUNDE") return 0;
    // Hvem ville fått kontrakten om vi passer? Den som ligger høyest nå.
    let høyest: number | null = null;
    let høyestBud = 0;
    for (let s = 0; s < state.antallSpillere; s++) {
      if (s === state.iTur) continue;
      const b = state.budrunde.sisteBud[s];
      if (typeof b === "number" && b > høyestBud) {
        høyestBud = b;
        høyest = s;
      }
    }
    if (høyest === null) return 0;
    const p = this.profilFor(høyest);
    // NULLPUNKTET: har vi aldri sett henne vinne et bud, vet vi ingenting om
    // «klarte», og boten skal spille bit-identisk med at profilen er av.
    if (p.klarte.n <= 0) return 0;
    // Avviket fra en gjennomsnittlig motstander, ikke absoluttverdien.
    // `krymp` inne i `evForsvarMot` HAR allerede vektet det med tiltroen.
    const mot = evForsvarMot(p, høyestBud);
    const snitt = (1 - BEFOLKNING.klarte) * 2 * høyestBud / 3;
    const avvik = mot - snitt;
    return Math.max(-MAKS_UTSLAG, Math.min(MAKS_UTSLAG, avvik));
  }
}

/**
 * Tynn kappe: mater profilboka med hver tilstand og lar det indre laget spille.
 * Fester seg på budagenten om den finnes, ellers samler den bare kunnskap.
 */
export class Profilagent {
  private readonly indre: { velgHandling(s: GameState): Handling; nyKamp(): void };
  readonly bok: Profilbok;

  /**
   * `oektBok` er ØKTENS bok. Gis den, overlever profilen mellom kamper -
   * men den lagres aldri (se `okt.ts`). Uten den nullstilles den som foer,
   * saa alle eksisterende maalinger er uendret.
   */
  private readonly oektBok: Profilbok | null;

  constructor(
    indre: { velgHandling(s: GameState): Handling; nyKamp(): void },
    budagent: Budjusterbar | null,
    oektBok: Profilbok | null = null,
  ) {
    this.indre = indre;
    this.oektBok = oektBok;
    this.bok = oektBok ?? new Profilbok();
    if (budagent !== null) budagent.settForsvarsjustering((s) => this.bok.justering(s));
  }

  nyKamp(): void {
    /**
     * NY KAMP, NY PROFIL — MED MINDRE VI ER I EN ØKT.
     *
     * Uten økt nullstilles den som før: modellen bygges av det som skjer ved
     * DETTE bordet, og bæres ikke videre.
     *
     * MED økt står boka. Skillet er mellom ØKT (så lenge prosessen lever —
     * familien spiller flere kamper samme kveld) og HISTORIE (noe som
     * overlever at appen lukkes). Det siste er databasen Arvind ikke ville ha,
     * og `okt.ts` rører ikke disk i det hele tatt.
     */
    if (this.oektBok === null) (this as { bok: Profilbok }).bok = new Profilbok();
    this.indre.nyKamp();
  }

  /**
   * BOKFØR EN RUNDE UTEN Å SPØRRE OM ET TREKK.
   *
   * `Profilbok.observer` bokfører bare på `RUNDE_SLUTT`, og den ble bare kalt
   * fra `velgHandling`. Det virket i testene og IKKE på kampbenken:
   * `examples/kamp.ts` håndterer `RUNDE_SLUTT` selv med `utfør(s, NESTE)` og
   * spør aldri en agent om et trekk i den fasen.
   *
   * **Målt: 25/24/24/27 bokførte runder med tikk, 0/0/0/0 uten.** Profilen —
   * og dermed hele K6, «lære andre spilleres vaner ila spillet» — var altså
   * strukturelt tom i den ENESTE benken som spiller lange nok kamper til at
   * den kunne lært noe.
   *
   * `test/profilagent.test.ts` hadde krykken (`a.velgHandling(s)` med
   * kommentaren «la profilen bokføre runden»). At en test trenger en krykke
   * for å få en komponent til å virke, er selve varselet.
   *
   * Denne kroken finnes for at en driver skal kunne bokføre EKSPLISITT, uten
   * å måtte late som den vil ha et trekk i en fase der det ikke finnes noe å
   * spille. Drivere som allerede går via `velgHandling` merker ingenting.
   */
  observer(state: GameState): void {
    this.bok.observer(state);
    // Videre nedover: flere profillag i samme stakk skal alle få se runden.
    (this.indre as { observer?(s: GameState): void }).observer?.(state);
  }

  velgHandling(state: GameState): Handling {
    this.bok.observer(state);
    return this.indre.velgHandling(state);
  }
}
