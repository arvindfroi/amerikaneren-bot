/**
 * SANDKASSENETTET — ETT FELLES UNDERLAG, TRE HODER.
 *
 * `docs/sandkassen.md` §5 og `docs/mlb.md` fase 0.4: ett nett tar alle
 * beslutninger, med alt vi har bygd som INNGANGER. Utgangen er tre hoder over
 * den samme stammen:
 *
 *   policy   68  (`HANDLING_LENGDE`)  — utfallet, selvtrent
 *   verdi     1                       — rundens faktiske poeng
 *   tro     208  (52 kort × 4 seter)  — hvor kortene FAKTISK lå
 *
 * Verdi og tro har perfekte etiketter og ingen sirkularitet. Bare policyen
 * læres av hva som virket, og det er nettopp den delen som skal være selvtrent.
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
 * verktøykjeden virker uendret. Fila er FIRE nett i rekkefølge:
 *
 *   0  stammen   1032 → … → S
 *   1  policy       S → 68
 *   2  verdi        S → 1
 *   3  tro          S → 208
 *
 * `forover` legger ReLU på alle lag unntatt det SISTE i hvert nett. Stammens
 * siste lag skal aktiveres — den mater tre hoder — så ReLU-en gjøres her, rett
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

/** Delene i vektfila, i den rekkefølgen de står. Trenerens speil av denne. */
export const DELER = ["stamme", "policy", "verdi", "tro"] as const;

/** Standardformen på stammen. Trenerens `--skjult` overstyrer den. */
export const STANDARD_SKJULT: readonly number[] = [1024, 768, 512];

// ===========================================================================
// Kontrakten
// ===========================================================================

export interface Framover {
  /** 68 tall, RÅ logits — ikke normalisert. Maskeringen hører til i `velgKode`. */
  readonly policy: Float32Array;
  readonly verdi: number;
  /** 208 tall, RÅ logits. Softmax per kort over de fire klassene gjøres av leseren. */
  readonly tro: Float32Array;
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

  /** Antall trekk nettet tar inn. Er `TREKK_LENGDE`, og det håndheves. */
  readonly inngangsLengde: number;
  /** Stammens bredde ut — den delte representasjonen alle tre hodene leser. */
  readonly stammeBredde: number;

  constructor(deler: readonly NevroNett[]) {
    if (deler.length !== DELER.length) {
      throw new Error(
        `Sandkassenettet er ${DELER.length} nett (${DELER.join(", ")}), fila har ${deler.length}`,
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

    const krav: readonly [NevroNett, string, number][] = [
      [policy, "policy", POLICY_UT],
      [verdi, "verdi", VERDI_UT],
      [tro, "tro", TRO_UT],
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
    this.inngangsLengde = inn;
    this.stammeBredde = bredde;
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
    return new Sandkassenett([
      { lag: stamme },
      { lag: [lag(bredde, POLICY_UT)] },
      { lag: [lag(bredde, VERDI_UT)] },
      { lag: [lag(bredde, TRO_UT)] },
    ]);
  }

  /** Antall parametre, per del og totalt — for rapportering, ikke for pynt. */
  parametre(): { readonly stamme: number; readonly policy: number; readonly verdi: number; readonly tro: number; readonly sum: number } {
    const s = antallVekter(this.stamme);
    const p = antallVekter(this.policyHode);
    const v = antallVekter(this.verdiHode);
    const t = antallVekter(this.troHode);
    return { stamme: s, policy: p, verdi: v, tro: t, sum: s + p + v + t };
  }

  /** Lagformen, `[inn, ut]` per lag per del — for rapportering. */
  form(): Record<string, readonly (readonly [number, number])[]> {
    const nett = [this.stamme, this.policyHode, this.verdiHode, this.troHode];
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
    const verdi = forover(this.verdiHode, h);
    return {
      policy: forover(this.policyHode, h),
      verdi: verdi[0] ?? 0,
      tro: forover(this.troHode, h),
    };
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
