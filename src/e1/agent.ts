/**
 * E1-spilleren – NETTLESERTRYGG del.
 *
 * Kortspillet avgjøres av det GPU-trente nettet, resten av spillet av
 * NevroHjerne. Det er et bevisst forsøksdesign, ikke en snarvei: budrunde,
 * vraking og trumfvalg holdes IDENTISKE med NevroHjerne, så en målt forskjell
 * mellom E1 og NevroHjerne kan bare komme fra kortspillet.
 *
 * HVORFOR DENNE FILA FINNES. `nett.ts` leser vektfila med `node:fs` og kan
 * derfor ikke bunles til nettleseren. Nettsiden skal spille NØYAKTIG den
 * agenten vi har målt – ikke en kopi av logikken som kan komme i utakt – så
 * klassen bor her, uten en eneste Node-avhengighet, og `nett.ts` er blitt et
 * tynt filskall rundt den.
 *
 * `E1Agent.fraFil` virker fortsatt som før for alle Node-kallerne: `nett.ts`
 * registrerer filleseren når den importeres. Importerer man BARE denne fila
 * (som nettleseren gjør), kaster `fraFil` i stedet for å dra inn `node:fs`.
 */

import type { Kort } from "../kort.ts";
import { lovligeKort, type GameState, type Handling } from "../motor.ts";
import { velgHandling as pimcVelg } from "../bot/bot.ts";
import { forover, nettFraBytes, type NevroNett } from "../nevro/nett.ts";
import { kortIndeks, NevroAgent } from "../nevro/index.ts";
import { fyllSanser } from "./sanser.ts";
import { e1SpillTrekk, e1SpillTrekkMedTro, E1_SPILL_DIM, E1_SPILL_DIM_V2, E1_SPILL_DIM_V3, E1_SPILL_DIM_V4, E1_SPILL_DIM_V5, E1_SPILL_DIM_V6, E1_SPILL_DIM_V7, E1_SPILL_DIM_V8, E1_SPILL_DIM_V9, E1_SPILL_DIM_V10 } from "./trekk.ts";

/**
 * Leser et E1-nett fra rå bytes og verifiserer at formen stemmer med
 * trekkuttrekket. Sjekkene er hele grunnen til at dette er en funksjon og
 * ikke en linje: et nett med feil inngangsbredde ville ellers gitt tause
 * søppelvalg i stedet for en feilmelding.
 */
/**
 * Alle bredder trekkuttrekket kan gi, i versjonsrekkefølge.
 *
 * EKSPORTERT fordi `test/e1-bredder.test.ts` sjekker at den stemmer med
 * `trekk.ts`, med `verktoy/sd-tren.py` og med det orakelet faktisk skriver.
 * Uten den testen må fem steder holdes i takt for hånd, og det har feilet
 * gjentatte ganger.
 */
export const LOVLIGE_BREDDER = [
  E1_SPILL_DIM,
  E1_SPILL_DIM_V2,
  E1_SPILL_DIM_V3,
  E1_SPILL_DIM_V4,
  E1_SPILL_DIM_V5,
  E1_SPILL_DIM_V6,
  E1_SPILL_DIM_V7,
  E1_SPILL_DIM_V8,
  E1_SPILL_DIM_V9,
  E1_SPILL_DIM_V10,
] as const;

export function e1NettFraBytes(bytes: Uint8Array, kilde = "vektene"): NevroNett {
  const nett = nettFraBytes(bytes);
  if (nett.length !== 1) throw new Error(`E1: forventet ett nett i ${kilde}, fikk ${nett.length}`);
  const første = nett[0]!.lag[0]!;
  // ÉN LISTE, ikke en kjede av &&-ledd.
  //
  // Den forrige formen var åtte `første.inn !== X &&` på rad, og den ble glemt
  // da v8 kom: E1-agenten kjente ikke 470 selv om trekkuttrekket gjorde det.
  // Feilen var ikke farlig – vakten ropte høylytt – men den kostet tid, og den
  // samme glemselen traff `LOVLIGE_DIM` i sd-tren.py samme kveld.
  //
  // En LISTE kan sjekkes av en test. En kjede kan den ikke, og det er hele
  // forskjellen: `test/e1-bredder.test.ts` holder nå alle stedene i takt.
  if (!LOVLIGE_BREDDER.includes(første.inn as (typeof LOVLIGE_BREDDER)[number])) {
    throw new Error(
      `E1: nettet tar ${første.inn} trekk, men trekkuttrekket gir ` +
        LOVLIGE_BREDDER.map((d, i) => `${d} (v${i + 1})`).join(", "),
    );
  }
  const siste = nett[0]!.lag[nett[0]!.lag.length - 1]!;
  if (siste.ut !== 52) throw new Error(`E1: siste lag har ${siste.ut} utganger, forventet 52`);
  return nett[0]!;
}

/** Faser E1 kan sette bort til PIMC-søket i stedet for NevroHjerne. */
export type SøkeFase = "VRAK" | "VELG";

export interface E1Opts {
  /**
   * Faser der PIMC-søket overtar. NevroHjernes trumfvalg er en HÅNDLAGD
   * formel (estimerStikk), ikke et nett og ikke et søk – og fasedelingen på
   * D1 viste at trumfvalget er den dyreste enkeltbeslutningen i spillet
   * (32,4 ± 3,0 poeng/kamp). Da er det verdt å måle om søk slår formelen.
   */
  readonly søkFaser?: readonly SøkeFase[];
  /** Verdener PIMC får per beslutning i de lånte fasene. */
  readonly søkVerdener?: number;
  /**
   * TROSNETTET, som fyller sanseblokken.
   *
   * Uten den er 84 av de 88 sansetrekkene konstant null – stikksjansen,
   * forventet fargelengde og renonssannsynligheten regnes ut FRA troen, og
   * `fyllSanser` returnerer tomhendt når den mangler. Et v9-nett uten dette
   * satt spiller altså på 88 nuller uten at noe feiler.
   *
   * Valgfri fordi nettene under v9-bredde ikke har blokken i det hele tatt,
   * og for dem er den et rent overheng.
   */
  readonly trosnett?: { fordeling(trekk: Float32Array): number[][] } | null;
  /**
   * TRO FRA STILLINGEN, ikke fra et nett.
   *
   * Et 714-nett kan ikke SPILLE uten en tro — sanseblokken må fylles ved
   * spilletid akkurat som under treningen, ellers ser nettet 88 nuller det
   * aldri ble trent på. Vakten under fanget nettopp det da `b714gammel`
   * skulle måles, og den fangsten avdekket at hele 714-linja var ubrukelig i
   * spill: korpuset ble laget med `montetro`, men agenten kunne bare ta et
   * `Trosnett`.
   *
   * Denne kroken tar en hvilken som helst kilde. `montetro` teller hvor ofte
   * hvert kort havner hos hvert sete over de VEKTEDE verdenene — samme
   * fordeling, uten et nett som ikke replikerte (+0,34 / −0,12).
   *
   * KOSTNADEN ER REELL: den krever en verdenstrekning per beslutning. For en
   * agent som ALT søker er den nesten gratis; for et rent nett er den ikke det.
   */
  readonly tro?: ((state: GameState, sete: number) => number[][] | null) | null;
}

/** Filleseren `nett.ts` registrerer. Null i nettleseren. */
let filleser: ((fil: string) => NevroNett) | null = null;
export function settE1Filleser(f: (fil: string) => NevroNett): void {
  filleser = f;
}

export class E1Agent {
  private readonly nett: NevroNett;
  /** Bredden NETTET ble trent med – ikke nødvendigvis den nyeste kodingen. */
  private readonly dim: number;
  private readonly nevro: NevroAgent;
  private readonly søkFaser: readonly SøkeFase[];
  private readonly søkVerdener: number;
  private readonly trosnett: { fordeling(trekk: Float32Array): number[][] } | null;
  private readonly tro: ((state: GameState, sete: number) => number[][] | null) | null;
  private teller = 0;

  constructor(nett: NevroNett, nevro: NevroAgent = new NevroAgent(), opts: E1Opts = {}) {
    this.nett = nett;
    this.dim = nett.lag[0]!.inn;
    this.nevro = nevro;
    this.søkFaser = opts.søkFaser ?? [];
    this.søkVerdener = opts.søkVerdener ?? 12;
    this.trosnett = opts.trosnett ?? null;
    this.tro = opts.tro ?? null;
    // FAIL-FAST. Et v9-nett uten NOEN trokilde spiller på 88 nuller, og
    // INGENTING ville sagt fra – nøyaktig hvordan blokken kunne ligge død i
    // utgangspunktet. Nå godtas begge kilder: et trosnett, eller en funksjon
    // som gir fordelingen fra stillingen (f.eks. `montetro`).
    if (this.dim >= E1_SPILL_DIM_V9 && this.trosnett === null && this.tro === null) {
      throw new Error(
        `Nettet er ${this.dim} bredt og har sanseblokken, men verken opts.trosnett ` +
          `eller opts.tro er gitt. Da ville 84 av 88 sansetrekk vært konstant null.`,
      );
    }
  }

  static fraFil(fil: string, opts: E1Opts = {}): E1Agent {
    if (filleser === null) {
      throw new Error("E1Agent.fraFil krever src/e1/nett.ts (Node). I nettleseren: bruk fraBytes.");
    }
    return new E1Agent(filleser(fil), new NevroAgent(), opts);
  }

  static fraBytes(bytes: Uint8Array, opts: E1Opts = {}, kilde = "vektene"): E1Agent {
    return new E1Agent(e1NettFraBytes(bytes, kilde), new NevroAgent(), opts);
  }

  nyKamp(): void {
    this.nevro.nyKamp();
    this.teller = 0;
  }

  velgHandling(state: GameState): Handling {
    if (state.fase === "SPILL" && state.iTur !== null) {
      return { type: "SPILL", spiller: state.iTur, kort: this.velgKort(state, state.iTur) };
    }
    if ((state.fase === "VRAK" || state.fase === "VELG") && this.søkFaser.includes(state.fase)) {
      return pimcVelg(state, {
        verdener: this.søkVerdener,
        terskel: 6,
        frø: (0x9e37 + Math.imul(this.teller++, 0x9e3779b1)) >>> 0,
      });
    }
    return this.nevro.velgHandling(state);
  }

  /**
   * Trekkvektoren, med sanseblokken fylt fra den kilden som finnes.
   *
   * `trosnett` foerst (bakoverkompatibelt), saa `tro` fra stillingen. Er begge
   * null er bredden under v9, og da finnes blokken ikke.
   */
  private trekkvektor(state: GameState, sete: number): Float32Array {
    if (this.trosnett !== null || this.dim < E1_SPILL_DIM_V9) {
      return e1SpillTrekkMedTro(state, sete, this.dim, this.trosnett);
    }
    const v = e1SpillTrekk(state, sete, this.dim);
    const t = this.tro === null ? null : this.tro(state, sete);
    if (t !== null) fyllSanser(v, state, sete, t);
    return v;
  }

  /** Argmax over LOVLIGE kort – reglene håndheves av motoren, ikke av nettet. */
  velgKort(state: GameState, sete: number): Kort {
    const lovlige = lovligeKort(state, sete);
    if (lovlige.length === 1) return lovlige[0]!;
    const logits = forover(this.nett, this.trekkvektor(state, sete));
    let beste = lovlige[0]!;
    for (const k of lovlige) if (logits[kortIndeks(k)]! > logits[kortIndeks(beste)]!) beste = k;
    return beste;
  }

  /** Kortene rangert best først – prior til søket (HybridAgent-mønsteret). */
  rangerKort(state: GameState, sete: number, lovlige: readonly Kort[]): Kort[] {
    const logits = forover(this.nett, this.trekkvektor(state, sete));
    return lovlige.slice().sort((a, b) => logits[kortIndeks(b)]! - logits[kortIndeks(a)]!);
  }
}
