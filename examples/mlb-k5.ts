/**
 * K5 FOR SANDKASSEN — «forstå konteksten i spillet og tilpasse seg».
 *
 *   node examples/mlb-k5.ts --vekter e1-modell/mlb-beste.bin \
 *     --giver 20 --maalpoeng 100 --egne 70 --motstander 90 --ut analyse/mlb-k5
 *
 * `AdamsMax.md` sier prøven ord for ord: SAMME KORT, SAMME STIKK, ULIK
 * KAMPSTILLING — 20 poeng bak mot 20 foran ved 70–90 av 100. Adams må velge
 * ULIKT.
 *
 * ===================== HVA SOM ER GJENBRUKT, OG HVA SOM IKKE KUNNE ========
 *
 * Riggen er `examples/k5-kontekst.ts`, og den er gjenbrukt der den kan være
 * det: kampstillingen KONSTRUERES i stedet for å ventes på (`medStilling`),
 * kontrollarmen gir begge sider samme stilling, og motstandersetet velges på
 * det andre laget så «20 foran» betyr foran en motstander og ikke foran
 * makkeren.
 *
 * Det som IKKE kunne gjenbrukes er selve armene. `k5-kontekst.ts` bygger
 * `Alphamuagent` og leser `sisteForklaring.detaljer.spredning` for å avgjøre
 * RETNINGEN — mer risiko når man ligger bak. Sandkassen har ingen alpha-mu og
 * dermed ingen utfallsvektor per gren. Retningsdelen av kravet måles derfor på
 * en annen størrelse, og forskjellen står i rapporten i stedet for å gjemmes:
 *
 *   `k5-kontekst.ts`  spredningen i alpha-muens utfallsvektor
 *   her               VERDIHODET. Et nett som forstår stillingen skal verdsette
 *                     å ligge 20 under lavere enn å lede med 20 — samme kort,
 *                     samme stikk. Tegntest, ikke bare snitt.
 *
 * ===================== TRE MÅLTALL, IKKE ETT ============================
 *
 * «Endret valget seg?» er en grov terskel: policyen kan flytte seg mye uten at
 * argmaks vipper, og lite uten at noe skjer. Derfor tre tall på samme rad:
 *
 *   ANDEL ENDRET   argmaks over de lovlige kodene ble en annen
 *   TV-AVSTAND     halve L1-avstanden mellom de to policyfordelingene over de
 *                  LOVLIGE kodene. Kontinuerlig, og eksakt 0 når armene er like
 *   VERDIGAP       V(bak) − V(foran). Rapporteres, men DØMMER IKKE lenger —
 *                  under seiersmålet er den ≈ 0 per konstruksjon (se `plantetBud`)
 *   BUDGAP         forventet budnivå bak − foran. RETNINGEN, med tegntest (10. sep)
 *
 * ===================== NULLARMEN =========================================
 *
 * `--lik-stilling` gir BEGGE sidene BAK-stillingen. Alle tre måltallene MÅ da
 * bli eksakt 0. Blir de ikke det, måler prøven agentbygging eller RNG og ikke
 * kontekst — og ingen av de andre tallene kan leses.
 *
 * ===================== OG DEN MÅ KUNNE FEILE =============================
 *
 * `plantetNett(nett, "MAKRO")` snur policyen så snart makroblokka er ulik null.
 * MAKRO er de 23 trekkene som BÆRER kampstillingen, så den agenten reagerer per
 * konstruksjon på stillingen. Prøven må ta den.
 *
 * ===================== TO SKALAER, FORDI DET ER EN ÅPEN PÅSTAND ==========
 *
 * `src/mlb/trekk.ts` har `makro.målPoeng.per100` OG `makro.målPoeng.trettiDelt`
 * nettopp fordi presset er RELATIVT: 70–90 av 100 og 21–27 av 30 er samme
 * stilling. Nettet trenes på løp til 30 og kravet er formulert på 100, så
 * `--maalpoeng` finnes for å måle begge. Står de ulikt, er det et funn om
 * generaliseringen og ikke en feil i benken.
 */

import { pathToFileURL } from "node:url";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeKort, spillerVisning } from "../src/motor.ts";
import { lagIndre, tall } from "../src/moe2/agentspek.ts";
import { racepress } from "../src/moe2/race.ts";
import { Sandkasseagent } from "../src/mlb/spekagent.ts";
import {
  AMERIKANER_KODE,
  budFraKode,
  maske,
  PASS_KODE,
  SOLO_KODE,
  TOMT_DELVALG,
  type Giving,
} from "../src/mlb/handling.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import type { Framover, NettLik } from "../src/mlb/selvspill.ts";
import {
  fmt,
  lesSandkasse,
  mlbSpek,
  plantetPåTrekk,
  Radskriver,
  se,
  snitt,
  tegntest,
  trekkIndeks,
} from "./mlb-krav-felles.ts";
import { readFileSync } from "node:fs";

// ===========================================================================
// Riggen
// ===========================================================================

/** Samme stilling, ny kampstilling. Alt annet er urørt. Fra `k5-kontekst.ts`. */
export function medStilling(
  s: GameState,
  sete: number,
  mot: number,
  egne: number,
  motstander: number,
): GameState {
  const tp = new Array<number>(s.antallSpillere).fill(0);
  tp[sete] = egne;
  tp[mot] = motstander;
  return { ...s, totalPoeng: tp };
}

/**
 * Et sete på det ANDRE laget, så «20 foran» betyr foran en motstander og ikke
 * foran makkeren sin. Ordrett fra `k5-kontekst.ts`.
 */
export function motstandersete(s: GameState, sete: number): number {
  const eget = new Set<number>([sete]);
  const bv = s.budvinner;
  const mk = s.makker;
  if (bv !== null && mk !== null) {
    if (sete === bv) eget.add(mk);
    else if (sete === mk) eget.add(bv);
    else for (let p = 0; p < s.antallSpillere; p++) if (p !== bv && p !== mk) eget.add(p);
  }
  for (let p = 0; p < s.antallSpillere; p++) if (!eget.has(p)) return p;
  return (sete + 1) % s.antallSpillere;
}

/**
 * EN TAPP PÅ NETTET, IKKE EN KOPI AV BESLUTNINGSLØKKA.
 *
 * Prøven trenger policyen og verdien, ikke bare det valgte kortet. Å bygge
 * trekkvektoren her ville vært en ANNEN implementasjon av `Sandkasseagent`s
 * løkke — prosjektets nest verste feilklasse, og nøyaktig det
 * `test/mlb-spekagent.test.ts` finnes for å hindre. Derfor kjøres den EKTE
 * agenten, og nettet under den lytter.
 */
function tapp(indre: NettLik): { nett: NettLik; siste(): Framover | null } {
  let siste: Framover | null = null;
  return {
    nett: {
      framover(trekk: Float32Array): Framover {
        const f = indre.framover(trekk);
        siste = f;
        return f;
      },
    },
    siste: () => siste,
  };
}

/** Softmax over BARE de lovlige kodene. Ulovlige plasser bidrar ikke. */
function fordeling(policy: Float32Array, m: Uint8Array): { p: number[]; koder: number[] } {
  const koder: number[] = [];
  for (let i = 0; i < m.length; i++) if (m[i] === 1) koder.push(i);
  let maks = -Infinity;
  for (const i of koder) maks = Math.max(maks, policy[i] ?? -Infinity);
  const e = koder.map((i) => Math.exp((policy[i] ?? 0) - maks));
  const sum = e.reduce((a, b) => a + b, 0);
  return { p: e.map((x) => x / sum), koder };
}

/** Halve L1-avstanden. 0 når fordelingene er like, 1 når de er disjunkte. */
function tv(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return s / 2;
}

// ===========================================================================
// Armene
// ===========================================================================

/**
 * BUDNIVÅET til en kode: pass 0, tallbud = antall stikk, amerikaner 14, solo 15.
 * Skalaen er ordinal — den brukes bare til «byr høyere enn», aldri som poeng.
 */
export function budnivå(kode: number): number {
  if (kode === PASS_KODE) return 0;
  if (kode === AMERIKANER_KODE) return 14;
  if (kode === SOLO_KODE) return 15;
  return Number(budFraKode(kode));
}

/**
 * FALSIFISERINGSARMENE FOR RETNINGEN (10. september).
 *
 * K5-raden dømte retningen på VERDIHODET (V(bak) < V(foran)). Under seiersmålet
 * spår V endringen i vinnersjanse FRA tavla, som allerede har priset inn
 * stillingen — den er ≈ 0 både bak og foran, og retningen kunne ikke lenger ses
 * (i2: 150 av 360, nær tilfeldig; `analyse/krav-samspill-2026-09-10.md` §3A).
 *
 * Retningen måles derfor på POLICYEN I BUDET: ligger man bak, skal man by
 * høyere. To plantede nett gjør prøven i stand til å feile begge veier: +1 byr
 * høyest mulig når vi ligger bak, −1 passer. Begge reagerer bare når
 * `makro.racepress` er positiv — nøyaktig forskjellen prøven konstruerer.
 */
export function plantetBud(indre: NettLik, indeks: number, retning: 1 | -1): NettLik {
  return {
    framover(trekk: Float32Array): Framover {
      const f = indre.framover(trekk);
      if (!((trekk[indeks] ?? 0) > 0)) return f;
      const policy = Float32Array.from(f.policy);
      for (let k = PASS_KODE; k <= SOLO_KODE; k++) {
        if (retning > 0) policy[k] = policy[k]! + 4 * budnivå(k);
        else if (k === PASS_KODE) policy[k] = policy[k]! + 60;
      }
      return { ...f, policy };
    },
  };
}

export interface K5Opts {
  readonly vekt: string;
  readonly tro?: string | null;
  readonly giver?: number;
  readonly frøBase?: number;
  readonly målPoeng?: number;
  readonly egne?: number;
  readonly motstander?: number;
  readonly maksPerGiv?: number;
  readonly fraStikk?: number;
  readonly tilStikk?: number;
  /** Budstillinger per giv (første budvalg rundt bordet). */
  readonly maksBudPerGiv?: number;
}

export interface K5Rad {
  readonly arm: string;
  readonly frø: number;
  readonly stikk: number;
  readonly sete: number;
  readonly kortBak: number;
  readonly kortForan: number;
  readonly ulikt: 0 | 1;
  readonly tv: number;
  readonly verdiBak: number;
  readonly verdiForan: number;
  readonly verdigap: number;
  readonly pressBak: number;
  readonly pressForan: number;
  /** "SPILL" (kortvalg, stikk 2–7) eller "BUD". Rader skrevet før 10. sep mangler feltet = SPILL. */
  readonly fase?: "SPILL" | "BUD";
  /** Budradene: forventet budnivå under policyen bak og foran, og differansen. */
  readonly budBak?: number;
  readonly budForan?: number;
  readonly budgap?: number;
  readonly passBak?: number;
  readonly passForan?: number;
}

interface Arm {
  readonly navn: string;
  readonly bygg: () => { agent: Sandkasseagent; siste(): Framover | null };
  /** Gir begge sidene BAK-stillingen. Kontrollarmen. */
  readonly likStilling: boolean;
}

function lagArmer(o: K5Opts): Arm[] {
  const rå = lesSandkasse(o.vekt);
  const tronett =
    o.tro === undefined || o.tro === null || o.tro === ""
      ? null
      : MlbTronett.fraBytes(readFileSync(o.tro));

  const bygger = (nett: NettLik) => () => {
    const t = tapp(nett);
    return {
      agent: new Sandkasseagent(t.nett, { temperatur: 0, hukommelse: true, tronett }),
      siste: t.siste,
    };
  };

  return [
    { navn: "KONTROLL", bygg: bygger(rå), likStilling: true },
    { navn: "mlb", bygg: bygger(rå), likStilling: false },
    /**
     * FALSIFISERINGSARMEN, plantet på FORTEGNET av `makro.racepress`.
     *
     * Første utkast plantet på hele MAKRO-blokka («snu når blokka er ulik
     * null»). Den var stum: makroblokka er ulik null i BEGGE armene, så
     * snuingen skjedde likt på hver side og differansen var upåvirket. Målt ga
     * den plantede armen nøyaktig samme andel som de ekte vektene — en
     * falsifiseringsarm som ikke falsifiserte noe. Nå snur den bare når vi
     * ligger BAK, altså på nøyaktig den forskjellen prøven konstruerer.
     */
    {
      navn: "PLANTET",
      bygg: bygger(plantetPåTrekk(rå, trekkIndeks("makro.racepress"), 0)),
      likStilling: false,
    },
    { navn: "PLANTET+BUD", bygg: bygger(plantetBud(rå, trekkIndeks("makro.racepress"), 1)), likStilling: false },
    { navn: "PLANTET-BUD", bygg: bygger(plantetBud(rå, trekkIndeks("makro.racepress"), -1)), likStilling: false },
  ];
}

// ===========================================================================
// Målingen
// ===========================================================================

export function målK5(o: K5Opts, skriv?: (r: K5Rad) => void): K5Rad[] {
  const giver = o.giver ?? 20;
  const frøBase = o.frøBase ?? 5_100_000;
  const målPoeng = o.målPoeng ?? 100;
  const egne = o.egne ?? 70;
  const motstander = o.motstander ?? 90;
  const maksPerGiv = o.maksPerGiv ?? 3;
  const fraStikk = o.fraStikk ?? 2;
  const tilStikk = o.tilStikk ?? 7;
  const maksBudPerGiv = o.maksBudPerGiv ?? 4;

  /**
   * DRIVERNE ER MLB SELV, ikke `ADAMS_MAALT`. Stillingsfordelingen arver
   * spilleren, og en sandkassemåling som spilles fram av den gamle stakken
   * ville spurt «tilpasser MLB seg i stillinger Adams havner i?». Det er et
   * annet spørsmål. Driverspeken skrives i rapporten så det ikke kan glemmes.
   */
  const driverSpek = mlbSpek({ vekt: o.vekt, tro: o.tro });
  const armer = lagArmer(o);
  const rader: K5Rad[] = [];

  for (const arm of armer) {
    for (let g = 0; g < giver; g++) {
      const frø = frøBase + g * 4409;
      const drivere = [0, 1, 2, 3].map(() => lagIndre(driverSpek));
      let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng }, frø);
      let vakt = 0;
      let iGiv = 0;
      let iBud = 0;

      while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
        /**
         * BUDSTILLINGENE (10. sep): samme stilling, samme kort, ulik kampstilling —
         * og nå også i BUDET, der retningen «bak ⇒ mer risiko» er tydeligst.
         */
        if (s.fase === "BUDRUNDE" && s.iTur !== null && iBud < maksBudPerGiv) {
          const sete = s.iTur;
          const mot = motstandersete(s, sete);
          const bak = medStilling(s, sete, mot, egne, motstander);
          const foran = arm.likStilling ? bak : medStilling(s, sete, mot, motstander, egne);
          const giving: Giving = { antallStikk: s.giving.antallStikk, talong: s.giving.talong };
          const m = maske(spillerVisning(bak, sete), giving, TOMT_DELVALG);
          let lovlige = 0;
          for (let i = 0; i < m.length; i++) if (m[i] === 1) lovlige++;
          if (lovlige >= 2) {
            const a1 = arm.bygg();
            a1.agent.nyKamp();
            const hBak = a1.agent.velgHandling(bak);
            const fBak = a1.siste();
            const a2 = arm.bygg();
            a2.agent.nyKamp();
            const hForan = a2.agent.velgHandling(foran);
            const fForan = a2.siste();
            if (fBak !== null && fForan !== null && hBak.type === "BUD" && hForan.type === "BUD") {
              const dBak = fordeling(fBak.policy, m);
              const dForan = fordeling(fForan.policy, m);
              let argBak = 0;
              let argForan = 0;
              let budBak = 0;
              let budForan = 0;
              let passBak = 0;
              let passForan = 0;
              for (let i = 0; i < dBak.p.length; i++) {
                const kode = dBak.koder[i]!;
                budBak += dBak.p[i]! * budnivå(kode);
                budForan += dForan.p[i]! * budnivå(kode);
                if (kode === PASS_KODE) {
                  passBak = dBak.p[i]!;
                  passForan = dForan.p[i]!;
                }
                if (dBak.p[i]! > dBak.p[argBak]!) argBak = i;
                if (dForan.p[i]! > dForan.p[argForan]!) argForan = i;
              }
              const rad: K5Rad = {
                arm: arm.navn,
                fase: "BUD",
                frø,
                stikk: 0,
                sete,
                kortBak: dBak.koder[argBak] ?? -1,
                kortForan: dForan.koder[argForan] ?? -1,
                ulikt: argBak === argForan ? 0 : 1,
                tv: tv(dBak.p, dForan.p),
                verdiBak: fBak.verdi,
                verdiForan: fForan.verdi,
                verdigap: fBak.verdi - fForan.verdi,
                pressBak: racepress(bak, sete),
                pressForan: racepress(foran, sete),
                budBak,
                budForan,
                budgap: budBak - budForan,
                passBak,
                passForan,
              };
              rader.push(rad);
              skriv?.(rad);
              iBud++;
            }
          }
        }
        if (
          s.fase === "SPILL" &&
          s.iTur !== null &&
          iGiv < maksPerGiv &&
          s.stikkSpilt >= fraStikk &&
          s.stikkSpilt <= tilStikk &&
          lovligeKort(s, s.iTur).length >= 2
        ) {
          const sete = s.iTur;
          const mot = motstandersete(s, sete);
          const bak = medStilling(s, sete, mot, egne, motstander);
          const foran = arm.likStilling
            ? bak
            : medStilling(s, sete, mot, motstander, egne);

          /**
           * FERSK AGENT PER SIDE. `Sandkasseagent` har en beslutningsteller og
           * en hukommelse som begge flyttes av et kall. To kall på samme
           * instans ville målt tellerstand og ikke kampstilling — samme grunn
           * som `k5-kontekst.ts` bygger `Alphamuagent` på nytt hver gang.
           */
          const a1 = arm.bygg();
          a1.agent.nyKamp();
          const hBak = a1.agent.velgHandling(bak);
          const fBak = a1.siste();

          const a2 = arm.bygg();
          a2.agent.nyKamp();
          const hForan = a2.agent.velgHandling(foran);
          const fForan = a2.siste();

          if (fBak !== null && fForan !== null && hBak.type === "SPILL" && hForan.type === "SPILL") {
            const giving: Giving = { antallStikk: s.giving.antallStikk, talong: s.giving.talong };
            const m = maske(spillerVisning(bak, sete), giving, TOMT_DELVALG);
            const dBak = fordeling(fBak.policy, m);
            const dForan = fordeling(fForan.policy, m);
            let argBak = 0;
            let argForan = 0;
            for (let i = 1; i < dBak.p.length; i++) {
              if (dBak.p[i]! > dBak.p[argBak]!) argBak = i;
              if (dForan.p[i]! > dForan.p[argForan]!) argForan = i;
            }
            const rad: K5Rad = {
              arm: arm.navn,
              fase: "SPILL",
              frø,
              stikk: s.stikkSpilt,
              sete,
              kortBak: dBak.koder[argBak] ?? -1,
              kortForan: dForan.koder[argForan] ?? -1,
              ulikt: argBak === argForan ? 0 : 1,
              tv: tv(dBak.p, dForan.p),
              verdiBak: fBak.verdi,
              verdiForan: fForan.verdi,
              verdigap: fBak.verdi - fForan.verdi,
              pressBak: racepress(bak, sete),
              pressForan: racepress(foran, sete),
            };
            rader.push(rad);
            skriv?.(rad);
            iGiv++;
          }
        }
        const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
        if (iTur === null || iTur === undefined) break;
        s = utfør(s, drivere[iTur]!.velgHandling(s)).state;
      }
    }
  }
  return rader;
}

export interface K5Dom {
  readonly arm: string;
  readonly stillinger: number;
  readonly ulike: number;
  readonly andel: number;
  readonly tvSnitt: number;
  readonly tvSe: number;
  readonly verdigap: number;
  readonly verdigapSe: number;
  /** Stillinger der BAK ble verdsatt lavere enn FORAN — retningen kravet ber om. */
  readonly bakLavere: number;
  readonly bakHøyere: number;
  readonly p: number;
  readonly pressBak: number;
  readonly pressForan: number;
  readonly budStillinger: number;
  readonly budGap: number;
  readonly budGapSe: number;
  /** Budstillinger der BAK byr HØYERE enn FORAN — retningen kravet ber om. */
  readonly budHøyere: number;
  readonly budLavere: number;
  readonly budP: number;
  readonly passGap: number;
}

export function døm(rader: readonly K5Rad[], arm: string): K5Dom {
  const alle = rader.filter((x) => x.arm === arm);
  const r = alle.filter((x) => x.fase !== "BUD");
  const b = alle.filter((x) => x.fase === "BUD");
  const budgap = b.map((x) => x.budgap ?? 0);
  const budHøyere = budgap.filter((g) => g > 1e-12).length;
  const budLavere = budgap.filter((g) => g < -1e-12).length;
  const tvs = r.map((x) => x.tv);
  const gap = r.map((x) => x.verdigap);
  const lavere = r.filter((x) => x.verdigap < -1e-12).length;
  const høyere = r.filter((x) => x.verdigap > 1e-12).length;
  return {
    arm,
    stillinger: r.length,
    ulike: r.reduce((a, x) => a + x.ulikt, 0),
    andel: r.length === 0 ? NaN : r.reduce((a, x) => a + x.ulikt, 0) / r.length,
    tvSnitt: snitt(tvs),
    tvSe: se(tvs),
    verdigap: snitt(gap),
    verdigapSe: se(gap),
    bakLavere: lavere,
    bakHøyere: høyere,
    p: tegntest(lavere, lavere + høyere),
    pressBak: r[0]?.pressBak ?? 0,
    pressForan: r[0]?.pressForan ?? 0,
    budStillinger: b.length,
    budGap: snitt(budgap),
    budGapSe: se(budgap),
    budHøyere,
    budLavere,
    budP: tegntest(budHøyere, budHøyere + budLavere),
    passGap: snitt(b.map((x) => (x.passBak ?? 0) - (x.passForan ?? 0))),
  };
}

// ===========================================================================
// Kjøringen
// ===========================================================================

function kjør(): void {
  let vekt = "e1-modell/mlb-beste.bin";
  let tro: string | null = "e1-modell/mlb-tro.bin";
  let utBase = "analyse/mlb-k5";
  const o: Record<string, number> = {
    giver: 20,
    froe: 5_100_000,
    maalpoeng: 100,
    egne: 70,
    motstander: 90,
    pergiv: 3,
    frastikk: 2,
    tilstikk: 7,
  };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]!;
    const v = process.argv[i + 1];
    if (a === "--vekter") vekt = v ?? vekt;
    else if (a === "--tro") tro = v ?? tro;
    else if (a === "--uten-tro") tro = null;
    else if (a === "--ut") utBase = v ?? utBase;
    else if (a.startsWith("--")) {
      const n = a.slice(2);
      if (n in o) o[n] = tall(v, o[n]!, a);
    }
  }

  const jsonl = new Radskriver(`${utBase}.jsonl`);
  const t0 = Date.now();
  const rader = målK5(
    {
      vekt,
      tro,
      giver: o["giver"]!,
      frøBase: o["froe"]!,
      målPoeng: o["maalpoeng"]!,
      egne: o["egne"]!,
      motstander: o["motstander"]!,
      maksPerGiv: o["pergiv"]!,
      fraStikk: o["frastikk"]!,
      tilStikk: o["tilstikk"]!,
    },
    (r) => jsonl.rad(r),
  );

  const L: string[] = [];
  L.push("K5 — FORSTÅ KONTEKSTEN OG TILPASSE SEG (sandkassen)");
  L.push("");
  L.push(`Vekter:     ${vekt}`);
  L.push(`Tro:        ${tro ?? "AV"}`);
  L.push(`Drivere:    ${mlbSpek({ vekt, tro })} i alle fire seter`);
  L.push(`Stilling:   BAK ${o["egne"]}–${o["motstander"]} mot FORAN ${o["motstander"]}–${o["egne"]}, løp til ${o["maalpoeng"]}`);
  L.push(`Giv:        ${o["giver"]}, frøbånd ${o["froe"]} + g·4409, stikk ${o["frastikk"]}–${o["tilstikk"]}`);
  L.push(`Kjøretid:   ${Math.round((Date.now() - t0) / 1000)} s`);
  L.push("");
  L.push("arm         stillinger  endret   andel      TV-avstand          verdigap (bak−foran)   bak lavere/høyere  p");
  L.push("-".repeat(112));
  for (const arm of ["KONTROLL", "mlb", "PLANTET", "PLANTET+BUD", "PLANTET-BUD"]) {
    const d = døm(rader, arm);
    L.push(
      `${d.arm.padEnd(11)} ${String(d.stillinger).padStart(10)} ${String(d.ulike).padStart(7)} ` +
        `${fmt(d.andel).padStart(9)}   ${fmt(d.tvSnitt).padStart(8)} ± ${d.tvSe.toFixed(4)}   ` +
        `${fmt(d.verdigap).padStart(9)} ± ${d.verdigapSe.toFixed(4)}   ` +
        `${String(d.bakLavere).padStart(6)}/${String(d.bakHøyere).padEnd(6)} ${d.p.toFixed(3)}`,
    );
  }
  L.push("-".repeat(112));
  L.push("");
  L.push("BUDET (retningen): forventet budnivå under policyen, bak minus foran. Pass 0, tallbud = stikk, amerikaner 14, solo 15.");
  L.push("arm           budstillinger   budgap (bak−foran)    bak høyere/lavere   p       passgap");
  L.push("-".repeat(100));
  for (const arm of ["KONTROLL", "mlb", "PLANTET", "PLANTET+BUD", "PLANTET-BUD"]) {
    const d = døm(rader, arm);
    L.push(
      `${d.arm.padEnd(13)} ${String(d.budStillinger).padStart(13)}   ${fmt(d.budGap).padStart(9)} ± ${d.budGapSe.toFixed(4)}   ` +
        `${String(d.budHøyere).padStart(8)}/${String(d.budLavere).padEnd(8)}   ${d.budP.toFixed(3)}   ${fmt(d.passGap)}`,
    );
  }
  L.push("-".repeat(100));
  const k = døm(rader, "mlb");
  L.push("");
  L.push(`racepress: BAK ${k.pressBak.toFixed(4)}, FORAN ${k.pressForan.toFixed(4)}.`);
  L.push("Er begge eksakt 0, kan ingen del av makroblokka bite, og et nulltall her");
  L.push("sier ingenting om nettet — det sier at stillingen aldri ble konstruert.");
  L.push("");
  L.push("KONTROLL må være +0,0000 på ALLE TRE måltallene. Den gir begge sidene");
  L.push("BAK-stillingen, så armene er bit-identiske.");
  L.push("PLANTET må være klart over null: den reagerer på makroblokka per");
  L.push("konstruksjon, og en prøve som ikke tar den måler ingenting.");
  L.push("");
  L.push("RETNINGEN. Kravet sier ikke bare «ulikt», det sier hvilken vei: å ligge");
  L.push("under skal gi mer risiko. Den måles på POLICYEN I BUDET (fra 10. sep):");
  L.push("bak skal by høyere enn foran. PLANTET+BUD må gi bak høyere, PLANTET-BUD");
  L.push("bak lavere — ellers kan prøven ikke se retningen.");
  L.push("Verdigapet står i tabellen, men DØMMER IKKE: under seiersmålet spår V");
  L.push("endringen i vinnersjanse fra tavla, og den er ≈ 0 både bak og foran");
  L.push("(analyse/krav-samspill-2026-09-10.md §3A).");

  const tekst = L.join("\n");
  new Radskriver(`${utBase}.txt`).rad(tekst);
  process.stderr.write(tekst + `\n\nSkrevet: ${utBase}.jsonl og ${utBase}.txt\n`);
}

const inngang = process.argv[1];
if (inngang !== undefined && import.meta.url === pathToFileURL(inngang).href) kjør();
