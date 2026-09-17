/**
 * ============ FINGERAVTRYKKET: SAMME STILLINGER, SAMME FRØ, SAMME VALG ============
 *
 * DOM-fri driver som spiller helboten mot seg selv på alle fire seter og skriver ned hver
 * beslutning. Den brukes likt av nettleserbenken (`web/ab-benk.ts`, beslutningene tas i den
 * ekte workeren) og av node-referansen (`examples/ab-avtrykk.ts`, beslutningene tas av
 * `lagIndre(<speken>)` per sete, slik K1-driveren gjør). Samme driver, samme frø: er
 * avtrykkene like, velger nettleseren det samme som node på hver eneste beslutning.
 *
 * Som K1-driveren: `velg` for setet i tur, `slutt` til ALLE seter ved hver `RUNDE_SLUTT`.
 */

import { opprettSpill, utfør, type GameState, type Handling } from "../src/motor.ts";

export interface Beslutning {
  readonly kamp: number;
  readonly runde: number;
  readonly fase: string;
  readonly sete: number;
  readonly handling: Handling;
  /** Beslutningstid sett fra driveren (ms). Ikke en del av avtrykket. */
  readonly ms: number;
  /** Ekstra fra velgeren (verdener, nødbrems …). Ikke en del av avtrykket. */
  readonly info?: Record<string, unknown>;
}

export interface Driverkrok {
  nyKamp(): Promise<void> | void;
  velg(state: GameState, sete: number): Promise<{ handling: Handling; info?: Record<string, unknown> }>;
  slutt(state: GameState): Promise<void> | void;
  klokke(): number;
}

export async function spillAvtrykk(
  frø: readonly number[],
  runder: number,
  krok: Driverkrok,
  underveis?: (b: Beslutning) => void,
): Promise<Beslutning[]> {
  const ut: Beslutning[] = [];
  for (let k = 0; k < frø.length; k++) {
    await krok.nyKamp();
    let s: GameState = opprettSpill({ antallSpillere: 4 }, frø[k]!);
    for (let vakt = 0; vakt < 20_000 && s.fase !== "FERDIG" && s.rundeNr < runder; vakt++) {
      if (s.fase === "RUNDE_SLUTT") {
        await krok.slutt(s);
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (sete === null || sete === undefined) break;
      const t0 = krok.klokke();
      const v = await krok.velg(s, sete);
      const b: Beslutning = {
        kamp: k,
        runde: s.rundeNr,
        fase: s.fase,
        sete,
        handling: v.handling,
        ms: krok.klokke() - t0,
        ...(v.info === undefined ? {} : { info: v.info }),
      };
      ut.push(b);
      underveis?.(b);
      s = utfør(s, v.handling).state;
    }
  }
  return ut;
}

/** Kanonisk tekst for avtrykket: bare det som er valgt, i fast nøkkelrekkefølge. */
export function avtrykkstekst(b: readonly Beslutning[]): string {
  const h = (x: Handling): string => {
    switch (x.type) {
      case "BUD":
        return `B${String(x.bud)}`;
      case "VRAK":
        return `V${x.kort.map((k) => `${k.farge}${k.verdi}`).join(",")}`;
      case "VELG":
        return `T${x.trumf}/${x.etterlyst === null ? "-" : `${x.etterlyst.farge}${x.etterlyst.verdi}`}`;
      case "SPILL":
        return `S${x.kort.farge}${x.kort.verdi}`;
      case "NESTE":
        return "N";
    }
  };
  return b.map((x) => `${x.kamp}.${x.runde}.${x.sete}:${h(x.handling)}`).join("\n");
}

/** FNV-1a 32 bit, to ganger med ulike start — kort nok til å lese, sikkert nok til å sammenlikne. */
export function avtrykk(tekst: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193 + 2) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

/** Median, p90 og maks per fase — for fartsrapporten. */
export function tidstabell(b: readonly Beslutning[]): Record<string, { n: number; median: number; p90: number; maks: number }> {
  const per = new Map<string, number[]>();
  for (const x of b) {
    const l = per.get(x.fase) ?? [];
    l.push(x.ms);
    per.set(x.fase, l);
  }
  const ut: Record<string, { n: number; median: number; p90: number; maks: number }> = {};
  for (const [fase, l] of per) {
    l.sort((p, q) => p - q);
    const q = (f: number): number => Math.round(l[Math.min(l.length - 1, Math.floor(f * l.length))]!);
    ut[fase] = { n: l.length, median: q(0.5), p90: q(0.9), maks: Math.round(l[l.length - 1]!) };
  }
  return ut;
}
