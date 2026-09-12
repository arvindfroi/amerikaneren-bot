/**
 * SYNTETISKE MENNESKELOGGER — hjelperen for prøvene av `examples/menneske-logg.ts`,
 * `examples/menneske-tro.ts` og `examples/mlb-trodata.ts --menneske` (11. sep).
 *
 * Hver runde spilles fra `stillingFør(frø, målPoeng, rundeNr, før)` med fire agenter av
 * budspeken — nøyaktig den stillingen gjenskapingen bygger — og skrives i Val Town-formatet:
 * `start`, `valg-bud` for sete 0, `budvinner` og `runde` med historikk, vrak, trumf, kalt kort,
 * `delta` og `totalPoeng`. `før` kan settes per runde (99-99-99-99 gir kampslutt, og en neste
 * runde fra en annen tavle er da «mennesket spilte videre»).
 *
 * TILSTANDENE beholdes som FASIT. Gjenskapingen fra loggen skal gi nøyaktig dem, så en prøve
 * kan bygge sine egne referanserader av fasiten og sammenlikne bit for bit med det skriptene
 * FAKTISK skrev. En giv der alle passer (motoren deler ut på nytt) kaster her: da ville loggen
 * fått et hull, og prøven skal velge et annet frø i stedet for å teste noe annet enn den tror.
 *
 * Ingen fil her heter `.test.ts`, så `node --test test/*.test.ts` kjører den ikke alene.
 */

import { utfør, type GameState, type Handling } from "../src/motor.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { MENNESKE, stillingFør, V5_KJEDE } from "../examples/menneske-logg.ts";

export interface SyntetiskRunde {
  readonly rundeNr: number;
  /** Tavla før runden. Standard: forrige rundes `totalPoeng` (0-0-0-0 i første). */
  readonly før?: readonly number[];
  /**
   * `tempo`-lista på `runde`-raden, som appen skriver den fra v13 (`web/tempo.ts`).
   * Utelatt = runden er FØR v13 og har ingen tider — det er tilfellet for de aller
   * fleste loggede rundene, og prøvene skal kunne treffe begge.
   */
  readonly tempo?: readonly Record<string, unknown>[];
}

export interface SyntetiskKamp {
  readonly spillId: string;
  readonly frø: number;
  /** Pseudonymet i loggen (aldri et navn). */
  readonly spiller: string;
  readonly målPoeng: number;
  readonly runder: readonly SyntetiskRunde[];
  readonly tid?: string;
}

export interface Fasitrunde {
  readonly rundeNr: number;
  readonly tilstander: GameState[];
}

export interface Fasitkamp {
  readonly spillId: string;
  readonly frø: number;
  readonly runder: Fasitrunde[];
}

/** Det generatoren trenger av en agent. */
export interface Spiller {
  velgHandling(s: GameState): Handling;
  nyKamp?(): void;
}

/**
 * `lagAgenter` (valgfri) gir bordet for hver kamp; standard er fire agenter av `spek`. Brukes til
 * å plante et botbud som AVVIKER fra speken — det gjenskapingen skal finne med nøyaktig ett avvik.
 */
export function syntetiskLogg(
  kamper: readonly SyntetiskKamp[],
  spek = V5_KJEDE,
  lagAgenter: (k: SyntetiskKamp) => Spiller[] = () => [0, 1, 2, 3].map(() => lagIndre(spek)),
): { linjer: string[]; fasit: Fasitkamp[] } {
  const linjer: string[] = [];
  let id = 1;
  const hendelse = (k: SyntetiskKamp, type: string, data: Record<string, unknown>): void => {
    linjer.push(JSON.stringify({ id: id++, tid: k.tid ?? "2026-09-01T00:00:00.000Z", spillId: k.spillId, spiller: k.spiller, bot: "test", type, data }));
  };
  const fasit: Fasitkamp[] = [];
  for (const k of kamper) {
    const agenter = lagAgenter(k);
    for (const a of agenter) a.nyKamp?.();
    hendelse(k, "start", { frø: k.frø, målPoeng: k.målPoeng, motstander: "test" });
    let total: number[] = [0, 0, 0, 0];
    const runder: Fasitrunde[] = [];
    for (const r of k.runder) {
      let s: GameState = stillingFør(k.frø, k.målPoeng, r.rundeNr, [...(r.før ?? total)]);
      const tilstander: GameState[] = [s];
      let vakt = 0;
      while (s.fase !== "RUNDE_SLUTT" && s.fase !== "FERDIG" && vakt++ < 2_000) {
        const i = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
        if (i === null || i === undefined) throw new Error(`ingen i tur i runde ${r.rundeNr}`);
        const h = agenter[i]!.velgHandling(s);
        if (h.type === "BUD" && h.spiller === MENNESKE) hendelse(k, "valg-bud", { rundeNr: r.rundeNr, bud: h.bud, ms: 1 });
        const neste = utfør(s, h).state;
        if (neste.rundeNr !== r.rundeNr) throw new Error(`alle passet i runde ${r.rundeNr} (frø ${k.frø}) — velg et annet frø`);
        if (s.fase === "BUDRUNDE" && neste.fase !== "BUDRUNDE") {
          hendelse(k, "budvinner", { spiller: neste.budvinner, bud: neste.budrunde.høyeste!.bud, rundeNr: r.rundeNr });
        }
        s = neste;
        tilstander.push(s);
      }
      const res = s.sisteRunde!;
      hendelse(k, "runde", {
        ...(r.tempo === undefined ? {} : { tempo: r.tempo }),
        rundeNr: r.rundeNr,
        budvinner: s.budvinner,
        melding: s.melding,
        klart: res.klart,
        lagStikk: res.lagStikk,
        stikkVunnet: res.stikkVunnet,
        delta: res.delta,
        totalPoeng: s.totalPoeng,
        historikk: s.historikk.map((t) => t.kort.map((kp) => [kp.spiller, kp.kort.farge, kp.kort.verdi])),
        vrak: s.vrak.map((x) => [x.farge, x.verdi]),
        trumf: s.trumf,
        etterlyst: s.etterlyst === null ? null : [s.etterlyst.farge, s.etterlyst.verdi],
        makker: s.makker,
      });
      total = [...s.totalPoeng];
      runder.push({ rundeNr: r.rundeNr, tilstander });
    }
    fasit.push({ spillId: k.spillId, frø: k.frø, runder });
  }
  return { linjer, fasit };
}
