/**
 * FELLESDELENE FOR KRAVBATTERIET — spekbygging, statistikk og den PLANTEDE armen.
 *
 * `docs/krav-status.md` måler K2–K8 på dagens stakk. Sandkassen hadde ingen slik
 * måling i det hele tatt: vi kunne si om et MLB-nett slår `rask`, men ikke om
 * det innfrir et eneste krav. Denne fila er bunnen i apparatet som lukker det.
 *
 * Den inneholder BARE det som må være likt på tvers av prøvene. Alt som er
 * spesifikt for ett krav ligger i `mlb-k4.ts`, `mlb-k5.ts` og `mlb-k6.ts`, og
 * alt som allerede fantes gjenbrukes i stedet for å skrives om — se
 * `examples/mlb-krav.ts` for hvilke prøver som er gjenbrukt og hvilke som ikke
 * kunne bli det.
 *
 * ===================== DE TO ARMENE HVER PRØVE MÅ HA ======================
 *
 * `AdamsMax.md`, vedlegget: kontrollarmen må måle eksakt 0,0000 (gate 2) eller
 * 0,2500 (kampbenken), og en prøve som ikke kan feile måler ingenting. Begge
 * halvdelene er bygd inn her:
 *
 *   KONTROLL   to armer som er bit-identiske. Måltallet MÅ bli eksakt 0.
 *   PLANTET    `plantetNett` — et nett som beviselig lar én blokk i
 *              trekkvektoren styre valget. Prøven MÅ ta den.
 *
 * Uten den andre halvdelen betyr et lavt tall fra MLB-armen like gjerne «prøven
 * måler ingenting» som «nettet har ikke evnen». Det skillet er hele grunnen til
 * at fila finnes: fire ganger i dette prosjektet har en grønn prøve vist seg å
 * være stum, og én av dem var K6-detektoren som «bestod» på ren støy (§108).
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { Sandkassenett } from "../src/mlb/nett.ts";
import { BLOKK, HUKOMMELSE_LENGDE, MAKRO_LENGDE, TREKK_NAVN } from "../src/mlb/trekk.ts";
import type { Framover, NettLik } from "../src/mlb/selvspill.ts";

// ===========================================================================
// 1. Speken
// ===========================================================================

/**
 * Hvordan et MLB-nett navngis som `lagIndre`-lag.
 *
 * Rekkefølgen på delene er IKKE fri. `agentspek.ts` klipper `~<tro>` FØRST og
 * `h0` etterpå, så flagget må stå på vektstien og ikke på slutten av strengen.
 * Første utkast skrev `mlb:<vekt>~<tro>h0`, som `agentspek.ts` leser som en
 * trosti ved navn «...binh0» — en fil som ikke finnes. Den feilen ville krasjet
 * høylytt, men den samme formen uten `~` (`mlb:<vekt>h0`) er gyldig, så en
 * blandet kjøring kunne blitt halvveis riktig. Derfor én funksjon, ett sted.
 */
export interface Spekdeler {
  readonly vekt: string;
  readonly tro?: string | null;
  /** 0 i all måling. AVGJØRELSE 4 i `docs/mlb.md`: samplet i trening, argmaks i måling. */
  readonly temperatur?: number;
  /** Av gir en nullblokk på de 144 hukommelsestallene — nullarmen for K4 og K6. */
  readonly hukommelse?: boolean;
}

export function mlbSpek(d: Spekdeler): string {
  const temp = d.temperatur ?? 0;
  let s = d.vekt;
  if (temp > 0) s += `@${temp}`;
  if (d.hukommelse === false) s += "h0";
  if (d.tro !== undefined && d.tro !== null && d.tro !== "") s += `~${d.tro}`;
  return `mlb:${s}`;
}

// ===========================================================================
// 2. Den plantede armen
// ===========================================================================

/** Blokkene en prøve kan plante på. Navnene er `BLOKK`-nøkler. */
export type Plantefelt = "HUKOMMELSE" | "MAKRO";

const FELT: Record<Plantefelt, { start: number; lengde: number }> = {
  HUKOMMELSE: { start: BLOKK.HUKOMMELSE, lengde: HUKOMMELSE_LENGDE },
  MAKRO: { start: BLOKK.MAKRO, lengde: MAKRO_LENGDE },
};

/**
 * ET NETT SOM BEVISELIG LAR ÉN BLOKK STYRE VALGET.
 *
 * Formen er lånt fra jukserarmene i `test/mlb-k2-*.test.ts`, og den er lånt med
 * vilje: der er den den halvdelen som gjør den grønne testen til et bevis. Her
 * gjør den samme jobben motsatt vei. K2 planter en LEKKASJE og krever at prøven
 * tar den; kravbatteriet planter en EVNE og krever at prøven ser den.
 *
 * `terskel` er summen av absoluttverdiene i blokka. Er den over, snus policyen.
 * Det er den groveste tenkelige avhengigheten — og nettopp derfor: en prøve som
 * ikke tar DENNE, tar ingenting.
 *
 * Verdien og de andre hodene er urørt. Bare valget skal endre seg, ellers måler
 * en prøve som leser `verdi` noe annet enn den tror.
 */
export function plantetNett(indre: NettLik, felt: Plantefelt, terskel = 1e-9): NettLik {
  const { start, lengde } = FELT[felt];
  return {
    framover(trekk: Float32Array): Framover {
      const f = indre.framover(trekk);
      let sum = 0;
      for (let i = start; i < start + lengde; i++) sum += Math.abs(trekk[i] ?? 0);
      if (!(sum > terskel)) return f;
      const policy = new Float32Array(f.policy.length);
      for (let i = 0; i < policy.length; i++) policy[i] = -f.policy[i]!;
      return { ...f, policy };
    },
  };
}

/**
 * PLANTET PÅ ETT NAVNGITT TREKK — og hvorfor `plantetNett` ikke holdt overalt.
 *
 * Blokkvarianten over snur policyen når blokka er ULIK NULL. Det er riktig for
 * K4, der de to armene er «hukommelsen fylt» mot «hukommelsen tom» og blokka
 * derfor er null på den ene siden. Det er FEIL for K5: der er makroblokka ulik
 * null i BEGGE armene, så snuingen skjer likt på begge sider og differansen
 * mellom dem er upåvirket. Målt: den plantede armen ga nøyaktig samme andel som
 * de ekte vektene, og det så ut som om prøven virket.
 *
 * Denne varianten snur når ETT bestemt trekk er over en terskel. Med
 * `makro.racepress` og terskel 0 reagerer agenten på FORTEGNET av
 * kampstillingen — altså på nøyaktig den forskjellen K5 konstruerer.
 */
export function plantetPåTrekk(indre: NettLik, indeks: number, terskel = 0): NettLik {
  if (indeks < 0) throw new Error("plantetPåTrekk: ukjent trekkindeks");
  return {
    framover(trekk: Float32Array): Framover {
      const f = indre.framover(trekk);
      if (!((trekk[indeks] ?? 0) > terskel)) return f;
      const policy = new Float32Array(f.policy.length);
      for (let i = 0; i < policy.length; i++) policy[i] = -f.policy[i]!;
      return { ...f, policy };
    },
  };
}

/** Indeksen til et navngitt trekk i `TREKK_NAVN`. Kaster om navnet ikke finnes. */
export function trekkIndeks(navn: string): number {
  const i = TREKK_NAVN.indexOf(navn);
  if (i < 0) throw new Error(`Ukjent trekk «${navn}» — layouten er endret`);
  return i;
}

/** Leser et sandkassenett fra fil, eller bygger et tilfeldig (`tilfeldig<frø>`). */
export function lesSandkasse(kilde: string): Sandkassenett {
  return kilde.startsWith("tilfeldig")
    ? Sandkassenett.tilfeldig(Number(kilde.slice(9)) || 0)
    : Sandkassenett.fraFil(kilde);
}

// ===========================================================================
// 3. Statistikk — én implementasjon, brukt av alle prøvene
// ===========================================================================

export function snitt(x: readonly number[]): number {
  return x.length === 0 ? NaN : x.reduce((a, b) => a + b, 0) / x.length;
}

export function se(x: readonly number[]): number {
  if (x.length < 2) return NaN;
  const m = snitt(x);
  let s = 0;
  for (const v of x) s += (v - m) * (v - m);
  return Math.sqrt(s / (x.length - 1) / x.length);
}

/**
 * TEGNTESTEN, som skal stå VED SIDEN AV snittet og ikke i stedet for det.
 * Rundepoengene har ±50 og ±100 i halene, så et snitt kan bæres av én giv.
 */
export function tegntest(opp: number, n: number): number {
  if (n === 0) return NaN;
  const lf: number[] = [0];
  for (let i = 1; i <= n; i++) lf[i] = lf[i - 1]! + Math.log(i);
  const m = Math.min(opp, n - opp);
  let s = 0;
  for (let i = 0; i <= m; i++) s += Math.exp(lf[n]! - lf[i]! - lf[n - i]! - n * Math.LN2);
  return Math.min(1, 2 * s);
}

/** OLS-stigningstall for `y` mot `x`, med sitt eget standardavvik. */
export function stigning(x: readonly number[], y: readonly number[]): { b: number; se: number } {
  const n = x.length;
  if (n < 3) return { b: NaN, se: NaN };
  const xm = snitt(x);
  const ym = snitt(y);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i]! - xm) * (y[i]! - ym);
    sxx += (x[i]! - xm) * (x[i]! - xm);
  }
  if (sxx === 0) return { b: NaN, se: NaN };
  const b = sxy / sxx;
  const a = ym - b * xm;
  let rss = 0;
  for (let i = 0; i < n; i++) {
    const e = y[i]! - (a + b * x[i]!);
    rss += e * e;
  }
  return { b, se: Math.sqrt(rss / (n - 2) / sxx) };
}

// ===========================================================================
// 4. Varige filer — skrevet PER RAD, aldri gjennom et stdout-rør
// ===========================================================================

/**
 * `docs/plan.md` og minnenotatet «Langkjøringer trenger varig logg»: aldri stol
 * på et stdout-rør for en flertimers måling. Prosessen skriver selv, rad for
 * rad, og hodet skrives før den første raden. En kjøring som dør etter halve
 * tiden skal etterlate halve datasettet, ikke ingenting.
 */
export class Radskriver {
  private readonly sti: string;

  constructor(sti: string, hode: string | null = null) {
    this.sti = sti;
    mkdirSync(dirname(sti), { recursive: true });
    if (hode === null) {
      writeFileSync(sti, "");
    } else if (!existsSync(sti)) {
      writeFileSync(sti, hode.endsWith("\n") ? hode : hode + "\n", "utf8");
    }
  }

  rad(x: unknown): void {
    appendFileSync(this.sti, (typeof x === "string" ? x : JSON.stringify(x)) + "\n", "utf8");
  }

  get fil(): string {
    return this.sti;
  }
}

/** `+0,123` / `-0,123` — fortegnet skal alltid være der i en tabell. */
export function fmt(x: number, d = 4): string {
  if (!Number.isFinite(x)) return "n/a";
  return (x >= 0 ? "+" : "") + x.toFixed(d);
}
