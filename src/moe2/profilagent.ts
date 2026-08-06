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
const MAKS_UTSLAG = 2.0;

export interface Budjusterbar {
  settForsvarsjustering(f: ((state: GameState) => number) | null): void;
}

export class Profilbok {
  private readonly profiler = new Map<number, Profil>();
  /** Runden vi sist bokførte, per sete – så én runde ikke telles to ganger. */
  private sistBokfort = -1;

  profilFor(sete: number): Profil {
    let p = this.profiler.get(sete);
    if (p === undefined) {
      p = tomProfil(`sete${sete}`);
      this.profiler.set(sete, p);
    }
    return p;
  }

  /** Antall runder vi har sett fra dette setet. */
  runder(sete: number): number {
    return this.profilFor(sete).bud.n;
  }

  /**
   * Bokfører runden når den er over. Kalles på hver tilstand; gjør ingenting
   * før fasen faktisk er RUNDE_SLUTT, og bare én gang per runde.
   */
  observer(state: GameState): void {
    if (state.fase !== "RUNDE_SLUTT" || state.rundeNr === this.sistBokfort) return;
    this.sistBokfort = state.rundeNr;
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
   * første runde mot en ukjent. Ellers: avviket fra befolkningssnittet, vektet
   * med tiltroen og begrenset til `MAKS_UTSLAG`.
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
    const t = tiltro(p.klarte);
    if (t <= 0) return 0;
    // Avviket fra en gjennomsnittlig motstander, ikke absoluttverdien.
    const mot = evForsvarMot(p, høyestBud);
    const snitt = (1 - BEFOLKNING.klarte) * 2 * høyestBud / 3;
    const avvik = (mot - snitt) * t;
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

  velgHandling(state: GameState): Handling {
    this.bok.observer(state);
    return this.indre.velgHandling(state);
  }
}
