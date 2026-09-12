/**
 * MLB — SANS: TENKETIDEN VED BORDET (12. sep). Bygd fra `SpillerVisning` og den
 * OFFENTLIGE tempologgen alene.
 *
 * Appen har logget menneskets tenketid siden v13 (`web/tempo.ts`, 11. sep): for hver
 * menneskebeslutning `{fase, stikk?, ms, skjultMs?, ufokusMs?, angre?}`. Det er en sans
 * ingen blokk i trohodet har i dag, og den er ekte informasjon: hvor lenge en spiller
 * NØLER er noe alle ved bordet ser, like offentlig som hvilket kort hun til slutt la.
 *
 * ===================== HVA SOM ER OFFENTLIG, OG HVA SOM IKKE ER DET ======
 *
 * Det ALLE ved bordet kan observere, er hvor lenge de ANDRE setene brukte. Ditt eget
 * nøl er ikke en observasjon du gjør om bordet — det er deg selv, og en «sans» som
 * leser den, lærer å lese sitt eget humør i stedet for motstanderens.
 *
 * Blokken dekker derfor RELATIVT SETE 1, 2 og 3. Sete 0 (meg) finnes ikke i layouten.
 * Det er ikke en regel som håndheves i en test alene — det er ikke en PLASS å skrive
 * min egen tid til. `test/mlb-tempo.test.ts` endrer i tillegg det observerende setets
 * EGNE tider og krever bit-identisk blokk, med en felle som leser dem og blir tatt.
 *
 * ===================== BOTENES EGEN REGNETID HØRER IKKE HJEMME HER =======
 *
 * Botene bruker også tid, og den står i `bottrekk`-raden. Den er en egenskap ved
 * MASKINEN som kjørte kampen — søkedybde, last, om `soek` fikk en kjerne — ikke ved
 * spilleren. Blandes de to, lærer nettet at «det setet som tenker lenge, er det setet
 * som fikk minst CPU». `Tempobok` tar bare `Tempohendelse`, som `rundeTempo` bygger av
 * `tempo`-feltet og ALDRI av `bottrekk`; `test/mlb-tempo.test.ts` har fella.
 *
 * ===================== HVORFOR LOG-MS, OG AVVIK FRA EGET SNITT ===========
 *
 * Rå millisekunder er ubrukelig som inngang: målt på de 67 loggede rundene er medianen
 * 2 046 ms, men halen går til 222 715 ms (noen forlot fanen). Log demper halen og gjør
 * «dobbelt så lenge» til et konstant steg. TAK er 60 s; alt over er «lenge» uansett.
 *
 * Det som BETYR noe er sjelden nivået — noen er trege, noen er raske — men AVVIKET fra
 * spillerens eget vanlige tempo, og det per FASE: et bud og et tvunget kort har ikke
 * samme skala. Snittet er kampens eget, løpende, og bare av beslutninger som ligger FØR
 * den blokken beskriver (K2 i tid: `Tempobok` ser en beslutning når den er gjort).
 *
 * ===================== DEKNINGEN STÅR I BLOKKEN =========================
 *
 * De aller fleste runder i loggen har INGEN tempo — feltet kom 11. sep, og alt før det
 * er stumt. En nullblokk som betyr «rask» og en nullblokk som betyr «vi vet ikke» er
 * ikke det samme, og det er nøyaktig den forvekslingen som ville gjort sansen til støy.
 * `SETT` per sete og `DEKNING` globalt sier hvor mye loggen faktisk bar, så nettet kan
 * lære å ignorere blokken der den er tom i stedet for å tro at bordet spilte lynraskt.
 *
 * ===================== LAYOUT (3 relative seter × 10 + 2 = 32) ==========
 *
 *   Per relativt sete r ∈ {1, 2, 3}, celle (r − 1) · 10:
 *     0 SETT          1 om setet har minst én måling i kampen
 *     1 SISTE_LOG     log1p(ms) / log1p(TAK) for setets siste beslutning, klemt [0, 1]
 *     2 SISTE_AVVIK   SISTE_LOG minus setets snitt i SAMME fase før den, klemt [−1, 1]
 *     3 SNITT_LOG     snittet av log over alle setets målinger i kampen
 *     4 SNITT_FASE    snittet for setets målinger i den fasen blokken bygges i
 *     5 SETT_FASE     1 om setet har minst én måling i den fasen
 *     6 N_OBS         min(n, TAK_N) / TAK_N — hvor mye snittene hviler på
 *     7 SISTE_SKJULT  skjultMs / ms for siste beslutning (fanen var skjult)
 *     8 SISTE_UFOKUS  ufokusMs / ms (synlig, men uten fokus)
 *     9 SISTE_ANGRE   min(angre, TAK_ANGRE) / TAK_ANGRE — tilbaketrekk inne i beslutningen
 *   Globalt:
 *     30 DEKNING      andel av kampens bokførte RUNDER som bar tider i det hele tatt
 *     31 NOEN         1 om noen tid i det hele tatt er observert i kampen
 */

import type { Fase } from "../regler.ts";
import type { SpillerVisning } from "../motor.ts";

/** Fasen en beslutning ble tatt i. Samme koding som `web/tempo.ts` logger. */
export type Tempofase = "B" | "V" | "T" | "S";
export const TEMPOFASER: readonly Tempofase[] = ["B", "V", "T", "S"];

/**
 * Motorens fase → tempologgens bokstav. `VELG` er trumf- og etterlysningsvalget, som
 * appen logger som «T». Faser uten en menneskebeslutning (RUNDE_SLUTT, FERDIG) gir null;
 * kalleren velger da selv, og blokken er uansett den samme for alle faser bortsett fra
 * FASESNITTET.
 */
export function tempofaseAv(fase: Fase): Tempofase | null {
  if (fase === "BUDRUNDE") return "B";
  if (fase === "VRAK") return "V";
  if (fase === "VELG") return "T";
  if (fase === "SPILL") return "S";
  return null;
}

/** Én loggført beslutning med tid. `sete` er ABSOLUTT sete ved bordet. */
export interface Tempohendelse {
  readonly sete: number;
  readonly fase: Tempofase;
  /** Stikknummeret for `fase === "S"`, ellers null. Bæres for sporing, ikke som trekk. */
  readonly stikk: number | null;
  readonly ms: number;
  readonly skjultMs: number;
  readonly ufokusMs: number;
  readonly angre: number;
}

export const MLB_TEMPO_PER_SETE = 10;
/** Bare relativt sete 1, 2, 3 — se toppen. Sete 0 har ingen plass her. */
export const MLB_TEMPO_SETER = 3;
export const MLB_TEMPO = MLB_TEMPO_SETER * MLB_TEMPO_PER_SETE + 2;

const SETT = 0;
const SISTE_LOG = 1;
const SISTE_AVVIK = 2;
const SNITT_LOG = 3;
const SNITT_FASE = 4;
const SETT_FASE = 5;
const N_OBS = 6;
const SISTE_SKJULT = 7;
const SISTE_UFOKUS = 8;
const SISTE_ANGRE = 9;
const DEKNING = MLB_TEMPO_SETER * MLB_TEMPO_PER_SETE;
const NOEN = DEKNING + 1;

/** Alt over dette er «lenge» uansett. 60 s; medianen i loggen er ~2 s. */
export const TEMPO_TAK_MS = 60_000;
/** Snittene hviler på så mange målinger før `N_OBS` er full. */
export const TEMPO_TAK_N = 40;
/** Flere tilbaketrekk enn dette skiller ikke lenger noe. */
export const TEMPO_TAK_ANGRE = 3;

/** Offsetene, relativt til blokkens start og til setets celle (`(rel − 1) · PER_SETE`). */
export const TEMPOINNGANG = {
  PER_SETE: MLB_TEMPO_PER_SETE,
  SETT,
  SISTE_LOG,
  SISTE_AVVIK,
  SNITT_LOG,
  SNITT_FASE,
  SETT_FASE,
  N_OBS,
  SISTE_SKJULT,
  SISTE_UFOKUS,
  SISTE_ANGRE,
  DEKNING,
  NOEN,
} as const;

const NEVNER = Math.log1p(TEMPO_TAK_MS);
const klemt = (x: number, lav: number, høy: number): number => (x < lav ? lav : x > høy ? høy : x);

/** Log-skalert tenketid i [0, 1]. Negative og ikke-endelige tall blir 0 — loggen kan bære hva som helst. */
export const tempoLog = (ms: number): number =>
  Number.isFinite(ms) && ms > 0 ? klemt(Math.log1p(Math.min(ms, TEMPO_TAK_MS)) / NEVNER, 0, 1) : 0;

interface Setetall {
  n: number;
  sumLog: number;
  perFaseN: Map<Tempofase, number>;
  perFaseSum: Map<Tempofase, number>;
  siste: { log: number; avvik: number; skjult: number; ufokus: number; angre: number } | null;
}

const nyttSete = (): Setetall => ({ n: 0, sumLog: 0, perFaseN: new Map(), perFaseSum: new Map(), siste: null });

/**
 * KAMPENS OFFENTLIGE TEMPOLOGG, bokført etter hvert som beslutningene blir tatt.
 *
 * Eieren er kalleren, nøyaktig som for `Hukommelse`: én bok per kamp, og den ser en
 * beslutning FØR neste stilling bygges. Da er avviket i blokken alltid regnet mot et
 * snitt av beslutninger som lå foran — aldri mot framtiden.
 *
 * `rundeSett` finnes fordi DEKNING skal være ærlig: en runde UTEN tider er ikke en runde
 * der ingen tenkte, den er en runde loggen ikke målte. Uten det tallet ville en tom blokk
 * fra før v13 vært umulig å skille fra et bord som spilte lynraskt.
 */
export class Tempobok {
  private readonly seter = new Map<number, Setetall>();
  private målinger = 0;
  private runder = 0;
  private runderMedTid = 0;

  /** En beslutning MED måling. */
  se(h: Tempohendelse): void {
    const s = this.seter.get(h.sete) ?? nyttSete();
    const log = tempoLog(h.ms);
    // Snittet for fasen SLIK DET VAR FØR denne målingen: avviket skal ikke sammenlikne
    // en måling med seg selv. Første måling i en fase har derfor avvik 0, ikke et tall.
    const fn = s.perFaseN.get(h.fase) ?? 0;
    const fs = s.perFaseSum.get(h.fase) ?? 0;
    const avvik = fn > 0 ? klemt(log - fs / fn, -1, 1) : 0;
    const ms = Math.max(1, h.ms);
    s.n++;
    s.sumLog += log;
    s.perFaseN.set(h.fase, fn + 1);
    s.perFaseSum.set(h.fase, fs + log);
    s.siste = {
      log,
      avvik,
      skjult: klemt(h.skjultMs / ms, 0, 1),
      ufokus: klemt(h.ufokusMs / ms, 0, 1),
      angre: klemt(h.angre, 0, TEMPO_TAK_ANGRE) / TEMPO_TAK_ANGRE,
    };
    this.seter.set(h.sete, s);
    this.målinger++;
  }

  /**
   * En FERDIG runde er bokført. `medTid` sier om loggen bar tider for den — falskt for
   * alt før v13, og for enhver runde der feltet mangler.
   */
  rundeSett(medTid: boolean): void {
    this.runder++;
    if (medTid) this.runderMedTid++;
  }

  /** Har boka sett noen måling i det hele tatt? */
  get tom(): boolean {
    return this.målinger === 0;
  }

  /** Andelen bokførte runder som bar tider. 0 når ingen runde er bokført. */
  get dekning(): number {
    return this.runder === 0 ? 0 : this.runderMedTid / this.runder;
  }

  /** Tallene for ett ABSOLUTT sete, eller null. Bare for prøvene og blokken. */
  sete(p: number): Setetall | null {
    return this.seter.get(p) ?? null;
  }
}

/**
 * TEMPOBLOKKEN for én observatør i én stilling.
 *
 * `fase` er fasen stillingen står i, og styrer bare hvilket FASESNITT som hentes fram;
 * ingen av tallene kommer fra stillingen selv. Blokken leser `visning.deg` og
 * `visning.antallKort.length` — rotasjonen til relativt sete — og ellers bare boka.
 * Ingen hånd, intet vrak, ingen talong: K2 er strukturell, som i `trotrekk.ts`.
 */
export function tempoTrekk(visning: SpillerVisning, bok: Tempobok | null, fase: Tempofase): Float32Array {
  const v = new Float32Array(MLB_TEMPO);
  if (bok === null) return v;
  const n = visning.antallKort.length;
  const meg = visning.deg;

  for (let p = 0; p < n; p++) {
    const rel = (((p - meg) % n) + n) % n;
    // SETE 0 ER MEG. Min egen tid er ikke en observasjon om bordet, og har ingen plass.
    if (rel < 1 || rel > MLB_TEMPO_SETER) continue;
    const s = bok.sete(p);
    if (s === null || s.n === 0) continue;
    const b = (rel - 1) * MLB_TEMPO_PER_SETE;
    v[b + SETT] = 1;
    v[b + SNITT_LOG] = s.sumLog / s.n;
    v[b + N_OBS] = Math.min(s.n, TEMPO_TAK_N) / TEMPO_TAK_N;
    const fn = s.perFaseN.get(fase) ?? 0;
    if (fn > 0) {
      v[b + SETT_FASE] = 1;
      v[b + SNITT_FASE] = (s.perFaseSum.get(fase) ?? 0) / fn;
    }
    if (s.siste !== null) {
      v[b + SISTE_LOG] = s.siste.log;
      v[b + SISTE_AVVIK] = s.siste.avvik;
      v[b + SISTE_SKJULT] = s.siste.skjult;
      v[b + SISTE_UFOKUS] = s.siste.ufokus;
      v[b + SISTE_ANGRE] = s.siste.angre;
    }
  }

  v[DEKNING] = bok.dekning;
  v[NOEN] = bok.tom ? 0 : 1;
  return v;
}
