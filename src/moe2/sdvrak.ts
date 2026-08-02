/**
 * SD-VRAKET SOM SPILLER – lovlig hele veien.
 *
 * HVORFOR DENNE MÅTTE SKRIVES, og hvorfor det ikke var «bare å koble til».
 *
 * `vurderVrakSD` i `sdkort.ts` er fasiten som bestod godkjenningsporten med
 * +0,848, det høyeste tallet vi har målt på noen fasit. Den evaluerer vraket
 * SAMMEN med trumfvalget som følger, som er riktig: verdien av et vrak er
 * verdien det får under den trumfen som faktisk blir valgt.
 *
 * Men den ble aldri en spiller, og grunnen ligger ikke i SD-delen. Den ligger
 * i KANDIDATLISTEN. `lagVrakstilling` sier det selv:
 *
 *     «Fasiten bruker de EKTE hendene til alle fire – det er lov, en fasit er
 *      et orakel og ikke en spiller.»
 *
 * Porten sender de 20 DD-beste av 1 820 inn til SD, og de 20 er plukket av en
 * løser som ser alle fire hender. SD-delen er lovlig; grovsilen foran den er
 * det ikke. Et rør med ett juksesteg i midten kan ikke settes ved bordet, og
 * +0,848 måler derfor fasitens kvalitet som TRENINGSMÅL – ikke styrken til en
 * spiller som ikke fantes.
 *
 * DET SOM MANGLET var en lovlig grovsil, og den er den samme koden på et annet
 * inndata: i stedet for de ekte hendene brukes SAMPLEDE hender, trukket med
 * `trekkVerdener` fra det budvinneren lovlig vet. Da er hvert ledd lovlig:
 *
 *   1. trekk W verdener som er forenlige med egen hånd og budrunden
 *   2. skår alle 1 820 vrak med den eksakte løseren PÅ DE SAMPLEDE HENDENE
 *   3. send de N beste videre til `vurderVrakSD`, som sampler på nytt
 *   4. velg det høyeste SD-tallet
 *
 * PRISEN, målt: steg 2 koster ~1,8 s per verden, steg 3 ~3 s med N=20 og
 * K=12. Rundt fem sekunder per vrak. Det er mye for en benk og lite for en
 * spiller – menneskene i loggen bruker 33,4 sekunder på nøyaktig den samme
 * beslutningen.
 *
 * FORVENT IKKE +0,848. Det tallet gjaldt en rangering innenfor en juksende
 * kandidatliste. Hvor mye den blinde silen taper mot den seende er UMÅLT, og
 * det er nettopp det som må måles før noe promoteres.
 */

import { lagRng } from "../kort.ts";
import type { GameState, Handling } from "../motor.ts";
import { kortIndeks } from "../nevro/trekk.ts";
import { evaluerHybrid } from "../solver/dds.ts";
import { alleVrak, fastTrumfvalg, kortFraIndeks } from "./eksperter/vrak.ts";
import { besteIndeks, trekkVerdener, vurderVrakSD, type Utspiller } from "./sdkort.ts";

/** Agenten SD-vraket legger seg utenpå. */
export interface Innagent {
  velgHandling(state: GameState): Handling;
  nyKamp(): void;
}

export interface SDVrakOpts {
  /** Verdener den BLINDE grovsilen midler over. 1 er standard – se prisen. */
  readonly silVerdener?: number;
  /** Kandidater som sendes videre til SD. Porten brukte 20. */
  readonly topp?: number;
  /** Verdener SD-evalueringen bruker. Porten brukte 64; 12 er benkenivået. */
  readonly verdener?: number;
  /** Søkedybde i den eksakte løseren under grovsilen. */
  readonly dybde?: number;
  /** Motstandermodellen som spiller verdenene ferdig inne i SD. */
  readonly motpart?: Utspiller;
  readonly frø?: number;
}

/**
 * Skårer ALLE vrakkandidater med den eksakte løseren, men på SAMPLEDE hender.
 *
 * Dette er `lagVrakstilling` med ett eneste bytte: `andre` kommer fra en
 * trukket verden i stedet fra `state.hender`. Nettopp det byttet er forskjellen
 * mellom et orakel og en spiller, og det er derfor det står alene her i stedet
 * for som et flagg på den andre funksjonen – et flagg ville før eller siden
 * blitt satt feil, og feilen ville vært stum.
 */
export function blindVrakskår(
  state: GameState,
  verdener: readonly (readonly number[][])[],
  dybde = 6,
  nodeTak = 400_000,
): { handlinger: number[][]; verdi: number[] } | null {
  if (state.fase !== "VRAK" || state.budvinner === null) return null;
  const bv = state.budvinner;
  const T = state.giving.antallStikk;
  const antall = state.giving.talong;
  if (antall <= 0 || verdener.length === 0) return null;
  const hånd = (state.hender[bv] ?? []).map(kortIndeks).sort((a, b) => a - b);
  if (hånd.length !== T + antall) return null;

  const handlinger = alleVrak(hånd, antall);
  const verdi: number[] = [];
  for (const vrak of handlinger) {
    const ute = new Set(vrak);
    const igjen = hånd.filter((k) => !ute.has(k));
    const valg = fastTrumfvalg(igjen, vrak);
    if (valg === null) {
      verdi.push(0);
      continue;
    }
    let sum = 0;
    for (const verden of verdener) {
      const hender: number[][] = [];
      for (let p = 0; p < state.antallSpillere; p++) hender.push(p === bv ? igjen : [...(verden[p] ?? [])]);
      const declLag = hender.map((h, p) => p === bv || h.includes(valg.etterlyst));
      sum += evaluerHybrid(
        { N: state.antallSpillere, trump: valg.trumf, declLag, hender, iTur: bv, totalStikk: T },
        dybde,
        nodeTak,
      );
    }
    verdi.push(sum / verdener.length);
  }
  return { handlinger, verdi };
}

/**
 * Overtar VRAK-fasen; alt annet går til den indre agenten uendret.
 *
 * At bare VRAK overtas er med vilje. Trumfvalget ligger allerede inne i
 * evalueringen – `vurderVrakSD` lar `motpart` velge trumf etter vraket – så
 * å overta VELG i tillegg ville byttet ut to ting samtidig, og en måling som
 * endrer to ting kan ikke tilskrive utfallet til noen av dem.
 */
export class SDVrak implements Innagent {
  private readonly indre: Innagent;
  private readonly opts: Required<Omit<SDVrakOpts, "motpart">> & { motpart: Utspiller | null };
  private teller = 0;

  constructor(indre: Innagent, opts: SDVrakOpts = {}) {
    this.indre = indre;
    this.opts = {
      silVerdener: opts.silVerdener ?? 1,
      topp: opts.topp ?? 20,
      verdener: opts.verdener ?? 12,
      dybde: opts.dybde ?? 6,
      frø: opts.frø ?? 0x5eed,
      motpart: opts.motpart ?? null,
    };
  }

  nyKamp(): void {
    this.indre.nyKamp();
    this.teller = 0;
  }

  velgHandling(state: GameState): Handling {
    if (state.fase !== "VRAK" || state.budvinner === null) return this.indre.velgHandling(state);
    const bv = state.budvinner;
    const motpart = this.opts.motpart ?? (this.indre as unknown as Utspiller);
    const rng = lagRng((this.opts.frø + Math.imul(this.teller++, 0x9e3779b1)) >>> 0);

    const silVerdener = trekkVerdener(state, bv, this.opts.silVerdener, rng);
    const skår = silVerdener.length === 0 ? null : blindVrakskår(state, silVerdener, this.opts.dybde);
    // Ingen verden lot seg trekke, eller stillingen er ikke skårbar. Da skal
    // det IKKE gjettes: den indre agenten er en fullgod spiller, og en
    // tilfeldig kandidat ville vært strengt verre enn den.
    if (skår === null) return this.indre.velgHandling(state);

    const rangert = skår.verdi
      .map((_, i) => i)
      .sort((a, b) => skår.verdi[b]! - skår.verdi[a]!)
      .slice(0, Math.min(this.opts.topp, skår.handlinger.length));

    const vurdert = vurderVrakSD(
      state,
      motpart,
      rangert.map((i) => skår.handlinger[i]!),
      { verdener: this.opts.verdener, rng },
    );
    if (vurdert.length === 0) return this.indre.velgHandling(state);
    const beste = besteIndeks(vurdert);
    if (beste < 0) return this.indre.velgHandling(state);
    const valgt = skår.handlinger[rangert[beste]!]!;
    return { type: "VRAK", spiller: bv, kort: valgt.map(kortFraIndeks) };
  }
}
