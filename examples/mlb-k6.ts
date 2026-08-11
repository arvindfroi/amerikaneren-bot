/**
 * K6 FOR SANDKASSEN — «lære seg andre spillere sine vaner ila spillet og
 * tilpasse seg og utnytte de».
 *
 *   node examples/mlb-k6.ts --vekter e1-modell/mlb-beste.bin \
 *     --kamper 6 --maalpoeng 300 --maksrunder 40 --ut analyse/mlb-k6
 *
 * ===================== HVA SOM ER GJENBRUKT ==============================
 *
 * MÅLTALLET er `examples/k6-vaner.ts` sitt, ordrett, fordi det er der prøvens
 * kraft ligger:
 *
 *   kant(k, r)  = fokussetets rundepoeng − snittet av de tre andres
 *   dd(k, r)    = kant(hukommelsen PÅ) − kant(hukommelsen AV), parret på giv
 *   K6.2        = stigningen i dd mot rundenummeret
 *
 * Parringen er den samme og like sterk: `delUt(regler, giving, frø, rundeNr)`
 * avhenger BARE av frø og rundenummer, så runde r har nøyaktig samme kort i
 * begge armene. Givstøyen — den store variansen — trekkes bort på begge sider.
 *
 * ===================== HVA SOM IKKE KUNNE GJENBRUKES =====================
 *
 * ARMENE og MOTSTANDEREN. `k6-vaner.ts` skrur på `okt:`-laget og bruker
 * trumftrekkeren som stilisert motpart. Sandkassen har verken `okt:` eller
 * `Profilbok` — hukommelsen er 144 INNGANGER i trekkvektoren, og den skrus av
 * med `hukommelse: false` i `spillKamp`. Nullarmen er altså en bryter i
 * benken, ikke et lag som fjernes.
 *
 * BENKEN er `spillKamp` fra `src/mlb/selvspill.ts` og ikke `examples/kamp.ts`.
 * Grunnen er en defekt, og den er verdt å skrive ned: `Sandkasseagent`
 * eksponerer bokføringskroken som `observerRunde`, mens `kamp.ts`, `okt:`,
 * `vr:` og `amu:` alle kaller `observer`. Navnene møtes aldri, så et
 * `mlb:`-lag på kampbenken får ALDRI bokført en eneste runde — hukommelsen er
 * eksakt null hele kampen. Det er brudd nummer 2 fra §K6 om igjen, ett hus
 * lenger bort. `spillKamp` kaller `bok.observer(s)` i sin egen løkke og er
 * uberørt, og det er derfor prøven står der.
 *
 * ===================== TESTSETTET, ALDRI TRENINGSSETTET ==================
 *
 * Motstanderne er `VANER_TEST` (`src/mlb/liga.ts`). De er per konstruksjon
 * ALDRI i treningsligaen, og det er hele forskjellen mellom «K6 måler læring i
 * løpet» og «K6 måler gjenkjenning i vektene». §125 balanserte dessuten
 * splitten (+9,0 mot +7,4 i innbyrdes styrke, mot +15,4 mot +1,0 før), så
 * testsettet er ikke lenger den svake halvparten.
 *
 * ===================== LØPET MÅ VÆRE LANGT ==============================
 *
 * `målPoeng = 30` gir kamper på 5,68 runder, og da ser hukommelsen fire–fem
 * ferdigspilte runder. En stigning mot rundenummeret målt på fem punkter er
 * ikke en måling. Standard er derfor `--maalpoeng 300 --maksrunder 40`.
 *
 * ===================== DE TO KONTROLLENE =================================
 *
 *   KONTROLL   dd mellom TO KJØRINGER av den samme armen (hukommelsen av i
 *              begge). Kampene er deterministiske ved temperatur 0, så hver
 *              eneste rad MÅ være eksakt 0,0000.
 *   SPEIL      fire like MLB-seter. Fokussetets seierandel MÅ ligge på 0,2500
 *              innenfor støyen — kampbenkens egen nullarm. Ligger den ikke der,
 *              er det seteskjevhet, og ingen kant kan leses.
 *
 * ===================== OG DEN MÅ KUNNE FEILE =============================
 *
 * `plantetNett(nett, "HUKOMMELSE")` snur policyen så snart hukommelsesblokka er
 * ulik null. Den armen HAR en hukommelseseffekt per konstruksjon, og dd for
 * den må være stor. Er den null, er det benken som er stum — ikke nettet.
 */

import { pathToFileURL } from "node:url";

import { tall } from "../src/moe2/agentspek.ts";
import { lagVane, VANER_TEST } from "../src/mlb/liga.ts";
import { spillKamp, type Beslutningsrad, type NettLik, type Sete } from "../src/mlb/selvspill.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import type { Trofordeler } from "../src/mlb/trekk.ts";
import { readFileSync } from "node:fs";
import {
  fmt,
  lesSandkasse,
  plantetNett,
  Radskriver,
  se,
  snitt,
  stigning,
  tegntest,
} from "./mlb-krav-felles.ts";

// ===========================================================================
// Rundepoeng ut av erfaringen
// ===========================================================================

/**
 * KANT PER RUNDE, utledet av `poengFør` og sluttpoengene.
 *
 * `Beslutningsrad.poengFør` er setets akkumulerte kamppoeng FØR beslutningen,
 * så det første tallet i runde `r` er stillingen ved rundens start. Rundens
 * delta er differansen mot neste runde, og siste runde lukkes av
 * `fasit.sluttpoeng`. Ingen ny bokføring, ingen ny løkke — bare en avlesning av
 * det benken alt skriver.
 */
export function kantPerRunde(
  rader: readonly Beslutningsrad[],
  sluttpoeng: readonly number[],
  fokus: number,
  antallSeter: number,
): { rundeNr: number; kant: number }[] {
  const start = new Map<string, number>();
  let maksRunde = -1;
  for (const r of rader) {
    const n = `${r.sete}|${r.rundeNr}`;
    if (!start.has(n)) start.set(n, r.poengFør);
    if (r.rundeNr > maksRunde) maksRunde = r.rundeNr;
  }
  const poeng = (sete: number, runde: number): number | null => {
    if (runde > maksRunde) return sluttpoeng[sete] ?? null;
    const v = start.get(`${sete}|${runde}`);
    return v === undefined ? null : v;
  };

  const ut: { rundeNr: number; kant: number }[] = [];
  for (let r = 0; r <= maksRunde; r++) {
    const deltaer: (number | null)[] = [];
    for (let s = 0; s < antallSeter; s++) {
      const a = poeng(s, r);
      const b = poeng(s, r + 1);
      deltaer.push(a === null || b === null ? null : b - a);
    }
    if (deltaer.some((x) => x === null)) continue;
    const d = deltaer as number[];
    let andre = 0;
    for (let s = 0; s < antallSeter; s++) if (s !== fokus) andre += d[s]!;
    ut.push({ rundeNr: r, kant: d[fokus]! - andre / (antallSeter - 1) });
  }
  return ut;
}

// ===========================================================================
// Armene
// ===========================================================================

export interface K6Opts {
  readonly vekt: string;
  readonly tro?: string | null;
  readonly kamper?: number;
  readonly frøBase?: number;
  readonly målPoeng?: number;
  readonly maksRunder?: number;
  /** Navnene fra `VANER_TEST`. Tom liste = alle fire. */
  readonly vaner?: readonly string[];
  readonly fokus?: number;
  /** Rundenummeret som skiller «tidlig» fra «sent». */
  readonly delerunde?: number;
}

export interface K6Rad {
  readonly arm: string;
  readonly vane: string;
  readonly frø: number;
  readonly rundeNr: number;
  /** Hukommelsen på. */
  readonly kantPå: number;
  /** Hukommelsen av — nullarmen for nøyaktig samme giv. */
  readonly kantAv: number;
  readonly dd: number;
  readonly seierPå: 0 | 1;
}

interface Arm {
  readonly navn: string;
  readonly nett: NettLik;
  /**
   * Hukommelsen i den FØRSTE halvdelen av dobbeltdifferansen. `false` gir
   * kontrollarmen: begge halvdelene har den av, og dd må bli eksakt 0.
   */
  readonly hukommelse: boolean;
}

// ===========================================================================
// Målingen
// ===========================================================================

export function målK6(o: K6Opts, skriv?: (r: K6Rad) => void): K6Rad[] {
  const kamper = o.kamper ?? 6;
  const frøBase = o.frøBase ?? 6_600_000;
  const målPoeng = o.målPoeng ?? 300;
  const maksRunder = o.maksRunder ?? 40;
  const fokus = o.fokus ?? 0;
  const valgte =
    o.vaner === undefined || o.vaner.length === 0
      ? VANER_TEST
      : VANER_TEST.filter((v) => o.vaner!.includes(v.navn));
  if (valgte.length === 0) {
    throw new Error(`Ingen kjente testvaner i «${(o.vaner ?? []).join(",")}»`);
  }

  const rå = lesSandkasse(o.vekt);
  const tronett: Trofordeler | null =
    o.tro === undefined || o.tro === null || o.tro === ""
      ? null
      : MlbTronett.fraBytes(readFileSync(o.tro));

  const armer: Arm[] = [
    { navn: "KONTROLL", nett: rå, hukommelse: false },
    { navn: "mlb", nett: rå, hukommelse: true },
    { navn: "PLANTET", nett: plantetNett(rå, "HUKOMMELSE"), hukommelse: true },
  ];

  const bord = (nett: NettLik, vane: (typeof VANER_TEST)[number]): Sete[] =>
    [0, 1, 2, 3].map((i) =>
      i === fokus
        ? { navn: "mlb", nett, temperatur: 0 }
        : { navn: vane.navn, nett: null, temperatur: 0, egen: lagVane(vane.spek) },
    );

  const rader: K6Rad[] = [];
  for (const arm of armer) {
    for (const vane of valgte) {
      for (let k = 0; k < kamper; k++) {
        const frø = frøBase + k * 7717;
        const felles = { frø, målPoeng, maksRunder, samleTrekk: false, tronett };
        const på = spillKamp({ ...felles, seter: bord(arm.nett, vane), hukommelse: arm.hukommelse });
        const av = spillKamp({ ...felles, seter: bord(arm.nett, vane), hukommelse: false });
        const kPå = kantPerRunde(på.rader, på.fasit.sluttpoeng, fokus, 4);
        const kAv = new Map(
          kantPerRunde(av.rader, av.fasit.sluttpoeng, fokus, 4).map((x) => [x.rundeNr, x.kant]),
        );
        for (const x of kPå) {
          const b = kAv.get(x.rundeNr);
          if (b === undefined) continue;
          const rad: K6Rad = {
            arm: arm.navn,
            vane: vane.navn,
            frø,
            rundeNr: x.rundeNr,
            kantPå: x.kant,
            kantAv: b,
            dd: x.kant - b,
            seierPå: på.fasit.vinner === fokus ? 1 : 0,
          };
          rader.push(rad);
          skriv?.(rad);
        }
      }
    }
  }
  return rader;
}

/**
 * SPEILARMEN — kampbenkens egen 0,2500.
 *
 * Fire like MLB-seter. Fokussetets seierandel skal ligge på 0,2500 innenfor
 * støyen. Den er STATISTISK og ikke eksakt, i motsetning til dd-kontrollen, og
 * de to må ikke forveksles: dd-kontrollen sier at armene er bit-like,
 * speilarmen sier at setene er likeverdige.
 */
export function speil(o: K6Opts): { kamper: number; seire: number; andel: number; se: number } {
  const kamper = o.kamper ?? 6;
  const frøBase = (o.frøBase ?? 6_600_000) + 1;
  const målPoeng = o.målPoeng ?? 300;
  const maksRunder = o.maksRunder ?? 40;
  const nett = lesSandkasse(o.vekt);
  const utfall: number[] = [];
  for (let k = 0; k < kamper * 4; k++) {
    const fokus = k % 4;
    const e = spillKamp({
      frø: frøBase + k * 7717,
      målPoeng,
      maksRunder,
      samleTrekk: false,
      seter: [0, 1, 2, 3].map(() => ({ navn: "mlb", nett, temperatur: 0 })),
    });
    utfall.push(e.fasit.vinner === fokus ? 1 : 0);
  }
  const seire = utfall.reduce((a, b) => a + b, 0);
  return { kamper: utfall.length, seire, andel: snitt(utfall), se: se(utfall) };
}

export interface K6Dom {
  readonly arm: string;
  readonly n: number;
  readonly kantPå: number;
  readonly kantPåSe: number;
  readonly dd: number;
  readonly ddSe: number;
  readonly stigning: number;
  readonly stigningSe: number;
  readonly tidlig: number;
  readonly sen: number;
  readonly vekst: number;
  readonly vekstSe: number;
  readonly opp: number;
  readonly ned: number;
  readonly p: number;
  readonly maksRunde: number;
}

export function døm(rader: readonly K6Rad[], arm: string, delerunde: number): K6Dom {
  const r = rader.filter((x) => x.arm === arm);
  const dd = r.map((x) => x.dd);
  const st = stigning(r.map((x) => x.rundeNr), dd);
  const tidlig = r.filter((x) => x.rundeNr < delerunde).map((x) => x.dd);
  const sen = r.filter((x) => x.rundeNr >= delerunde).map((x) => x.dd);
  const vekst = snitt(sen) - snitt(tidlig);
  const opp = dd.filter((x) => x > 0).length;
  const ned = dd.filter((x) => x < 0).length;
  return {
    arm,
    n: r.length,
    kantPå: snitt(r.map((x) => x.kantPå)),
    kantPåSe: se(r.map((x) => x.kantPå)),
    dd: snitt(dd),
    ddSe: se(dd),
    stigning: st.b,
    stigningSe: st.se,
    tidlig: snitt(tidlig),
    sen: snitt(sen),
    vekst,
    vekstSe: Math.sqrt(se(sen) ** 2 + se(tidlig) ** 2),
    opp,
    ned,
    p: tegntest(opp, opp + ned),
    maksRunde: r.reduce((a, x) => Math.max(a, x.rundeNr), 0),
  };
}

// ===========================================================================
// Kjøringen
// ===========================================================================

function kjør(): void {
  let vekt = "e1-modell/mlb-beste.bin";
  let tro: string | null = "e1-modell/mlb-tro.bin";
  let utBase = "analyse/mlb-k6";
  let vaner: string[] = [];
  let medSpeil = true;
  const o: Record<string, number> = {
    kamper: 6,
    froe: 6_600_000,
    maalpoeng: 300,
    maksrunder: 40,
    delerunde: 6,
  };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]!;
    const v = process.argv[i + 1];
    if (a === "--vekter") vekt = v ?? vekt;
    else if (a === "--tro") tro = v ?? tro;
    else if (a === "--uten-tro") tro = null;
    else if (a === "--ut") utBase = v ?? utBase;
    else if (a === "--vaner") vaner = (v ?? "").split(",").filter((x) => x !== "");
    else if (a === "--uten-speil") medSpeil = false;
    else if (a.startsWith("--")) {
      const n = a.slice(2);
      if (n in o) o[n] = tall(v, o[n]!, a);
    }
  }

  const jsonl = new Radskriver(`${utBase}.jsonl`);
  const t0 = Date.now();
  const opts: K6Opts = {
    vekt,
    tro,
    kamper: o["kamper"]!,
    frøBase: o["froe"]!,
    målPoeng: o["maalpoeng"]!,
    maksRunder: o["maksrunder"]!,
    vaner,
  };
  const rader = målK6(opts, (r) => jsonl.rad(r));
  const sp = medSpeil ? speil({ ...opts, kamper: Math.max(2, Math.round(o["kamper"]! / 2)) }) : null;

  const delerunde = o["delerunde"]!;
  const L: string[] = [];
  L.push("K6 — LÆRE MOTSTANDERNES VANER OG UTNYTTE DEM (sandkassen)");
  L.push("");
  L.push(`Vekter:      ${vekt}`);
  L.push(`Tro:         ${tro ?? "AV"}`);
  L.push(`Motstandere: ${(vaner.length === 0 ? VANER_TEST.map((v) => v.navn) : vaner).join(", ")} — TESTSETTET, aldri treningssettet`);
  L.push(`Kamper:      ${o["kamper"]} per vane per arm, til ${o["maalpoeng"]} poeng, maks ${o["maksrunder"]} runder`);
  L.push(`Frøbånd:     ${o["froe"]} + k·7717`);
  L.push(`Kjøretid:    ${Math.round((Date.now() - t0) / 1000)} s`);
  L.push("");
  L.push("dd(k,r) = kant med hukommelsen PÅ − kant med den AV, parret på identisk giv.");
  L.push("Kant    = fokussetets rundepoeng − snittet av de tre andres.");
  L.push(`Skille:   runde < ${delerunde} er TIDLIG, runde ≥ ${delerunde} er SENT.`);
  L.push("");
  L.push("arm         n     kant(på)          dd                 stigning/runde      tidlig    sent    vekst              opp/ned   p      maks r");
  L.push("-".repeat(140));
  for (const arm of ["KONTROLL", "mlb", "PLANTET"]) {
    const d = døm(rader, arm, delerunde);
    L.push(
      `${d.arm.padEnd(11)} ${String(d.n).padStart(5)} ` +
        `${fmt(d.kantPå, 3).padStart(8)} ± ${d.kantPåSe.toFixed(3)}  ` +
        `${fmt(d.dd, 3).padStart(8)} ± ${d.ddSe.toFixed(3)}   ` +
        `${fmt(d.stigning, 4).padStart(8)} ± ${d.stigningSe.toFixed(4)}  ` +
        `${fmt(d.tidlig, 2).padStart(7)} ${fmt(d.sen, 2).padStart(7)} ` +
        `${fmt(d.vekst, 3).padStart(8)} ± ${d.vekstSe.toFixed(3)}  ` +
        `${String(d.opp).padStart(4)}/${String(d.ned).padEnd(4)} ${d.p.toFixed(3)}  ${String(d.maksRunde).padStart(3)}`,
    );
  }
  L.push("-".repeat(140));
  L.push("");
  if (sp !== null) {
    L.push(
      `SPEIL (fire like MLB-seter): fokussetet vant ${sp.seire} av ${sp.kamper} = ` +
        `${sp.andel.toFixed(4)} ± ${sp.se.toFixed(4)}. Kampbenkens nullarm er 0,2500.`,
    );
    L.push("");
  }
  L.push("KONTROLL må være dd = +0,000 på HVER RAD: begge halvdelene har");
  L.push("hukommelsen av, så kampene er bit-identiske. Er den ikke null, lekker");
  L.push("noe annet enn hukommelsen mellom armene.");
  L.push("PLANTET må ha stor |dd|: den armen HAR en hukommelseseffekt per");
  L.push("konstruksjon. Er den null, er det benken som er stum.");
  L.push("");
  L.push("K6 ER INNFRIDD når STIGNINGEN er positiv med margin — ikke når `dd` er");
  L.push("det. Et positivt nivå betyr bare at hukommelsen hjelper; kravet er at");
  L.push("gevinsten VOKSER med rundenummeret, som er signaturen på læring i løpet.");

  const tekst = L.join("\n");
  new Radskriver(`${utBase}.txt`).rad(tekst);
  process.stderr.write(tekst + `\n\nSkrevet: ${utBase}.jsonl og ${utBase}.txt\n`);
}

const inngang = process.argv[1];
if (inngang !== undefined && import.meta.url === pathToFileURL(inngang).href) kjør();
