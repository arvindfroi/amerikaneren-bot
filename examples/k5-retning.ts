/**
 * K5 RETNING FOR EN VILKÅRLIG SPEK — «bak ⇒ mer risiko», målt på budet (11. sep).
 *
 *   node examples/k5-retning.ts --spek "<hele boten>" --giver 40 --ut analyse/k5-retning
 *
 * `examples/mlb-k5.ts` måler retningen på MLB-POLICYEN: forventet budnivå under
 * softmaks bak minus foran. En vilkårlig spek har ingen policyfordeling å lese — den
 * gir ett bud. Måltallet er derfor det samme med policyen byttet mot VALGET:
 *
 *   BUDGAP   budnivå(bak) − budnivå(foran), pass 0, tallbud = stikk, amerikaner 14,
 *            solo 15 — samme ordinalskala som `budnivå` i mlb-k5.ts
 *   PASSGAP  pass(bak) − pass(foran): risikoen som «by eller la være»
 *   HØYERE   stillinger der bak byr høyere, mot LAVERE — tegntesten
 *
 * Med en deterministisk agent er de fleste parene likt bud (gap 0); det er riktig og
 * ikke en svakhet ved prøven, men det betyr at kraften kommer fra antall giv.
 *
 * ============ SAMME STILLING, ULIK KAMPSTILLING ==========================
 *
 * Riggen er `mlb-k5.ts` sin (`medStilling`, `motstandersete`): BAK 70–90 mot FORAN
 * 90–70 av 100, bare `totalPoeng` endres, motstanderen sitter på det andre laget. Fersk
 * agent per side, så ingen RNG-posisjon eller hukommelse skiller dem.
 *
 * ============ ARMENE =====================================================
 *
 *   KONTROLL        begge sider får BAK. Budgap og endret-andel MÅ bli eksakt 0.
 *   spek            måltallet.
 *   PLANTET+BUD     byr ett steg over speken når den ligger bak (`racepress > 0`). MÅ gi
 *                   bak høyere, signifikant.
 *   PLANTET-BUD     passer når den ligger bak. MÅ gi bak lavere.
 *   PLANTET-SPILL   bytter kort når den ligger bak (over speken uten søk). MÅ gi endret
 *                   kortvalg > 0,5 — kontrollen for K5.1-andelen i spillet.
 *
 * SE er klyngebootstrap over giv: budstillingene i én giv deler kort og auksjon.
 */

import { pathToFileURL } from "node:url";

import { lovligeHandlinger, lovligeKort, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { AMERIKANER, PASS, SOLO, type Bud } from "../src/regler.ts";
import { racepress } from "../src/moe2/race.ts";
import { ADAMS_MAALT, lagIndre, tall, type Spekagent } from "../src/moe2/agentspek.ts";
import { medStilling, motstandersete } from "./mlb-k5.ts";
import { fmt, Radskriver, tegntest } from "./mlb-krav-felles.ts";
import { klyngeSnitt } from "./klynge.ts";
import { avtrykk } from "./k2-spek.ts";
import { utenSøkOveralt } from "./spek-lag.ts";

/** Samme ordinalskala som `budnivå` i mlb-k5.ts, på motorens `Bud`. */
export function budNivå(b: Bud): number {
  if (b === PASS) return 0;
  if (b === AMERIKANER) return 14;
  if (b === SOLO) return 15;
  return b;
}

/** Byr ett lovlig steg over (retning 1) eller passer (retning −1) når setet ligger bak. */
export function plantetBudretning(indre: Spekagent, retning: 1 | -1): Spekagent {
  return {
    nyKamp: () => indre.nyKamp(),
    observer: (s: GameState) => indre.observer?.(s),
    velgHandling: (s: GameState): Handling => {
      const h = indre.velgHandling(s);
      if (h.type !== "BUD" || s.fase !== "BUDRUNDE" || s.iTur === null) return h;
      if (!(racepress(s, s.iTur) > 0)) return h;
      const lov = lovligeHandlinger(s);
      if (lov.fase !== "BUDRUNDE") return h;
      if (retning < 0) return { type: "BUD", spiller: h.spiller, bud: PASS };
      const i = lov.bud.indexOf(h.bud);
      return { type: "BUD", spiller: h.spiller, bud: lov.bud[Math.min(lov.bud.length - 1, i + 1)]! };
    },
  };
}

/** Velger et annet lovlig kort når setet ligger bak. Kontrollen for K5.1 i spillet. */
export function plantetKortbytte(indre: Spekagent): Spekagent {
  return {
    nyKamp: () => indre.nyKamp(),
    observer: (s: GameState) => indre.observer?.(s),
    velgHandling: (s: GameState): Handling => {
      const h = indre.velgHandling(s);
      if (h.type !== "SPILL" || !(racepress(s, h.spiller) > 0)) return h;
      const annet = lovligeKort(s, h.spiller).find((k) => k.farge !== h.kort.farge || k.verdi !== h.kort.verdi);
      return annet === undefined ? h : { type: "SPILL", spiller: h.spiller, kort: annet };
    },
  };
}

export interface K5ROpts {
  readonly spek: string;
  readonly giver: number;
  readonly frøBase?: number;
  readonly målPoeng?: number;
  readonly egne?: number;
  readonly motstander?: number;
  readonly budPerGiv?: number;
  /** Kortstillinger per giv (K5.1). 0 = bare budet, og runden avbrytes etter budrunden. */
  readonly spillPerGiv?: number;
  readonly fraStikk?: number;
  readonly tilStikk?: number;
  /**
   * Hvem som spiller fram stillingene. Standard er speken UTEN søk: søkelagene griper
   * ikke inn i budrunden, så auksjonene er de samme, og et bord med fire søkere ville
   * betalt for kortspill prøven ikke ser på.
   */
  readonly drivere?: string;
  readonly skard?: readonly [number, number];
}

export interface K5RRad {
  readonly arm: string;
  readonly fase: "BUD" | "SPILL";
  readonly frø: number;
  readonly sete: number;
  readonly stikk: number;
  readonly bak: string;
  readonly foran: string;
  readonly ulikt: 0 | 1;
  readonly budBak?: number;
  readonly budForan?: number;
  readonly budgap?: number;
  readonly passgap?: number;
  readonly pressBak: number;
  readonly pressForan: number;
}

interface Arm {
  readonly navn: string;
  readonly bygg: () => Spekagent;
  readonly likStilling: boolean;
  readonly bud: boolean;
  readonly spill: boolean;
}

export const K5R_ARMER = ["KONTROLL", "spek", "PLANTET+BUD", "PLANTET-BUD", "PLANTET-SPILL"] as const;

export function målK5R(o: K5ROpts, skriv?: (r: K5RRad) => void): K5RRad[] {
  const frøBase = o.frøBase ?? 5_100_000;
  const målPoeng = o.målPoeng ?? 100;
  const egne = o.egne ?? 70;
  const motstander = o.motstander ?? 90;
  const budPerGiv = o.budPerGiv ?? 4;
  const spillPerGiv = o.spillPerGiv ?? 0;
  const fraStikk = o.fraStikk ?? 2;
  const tilStikk = o.tilStikk ?? 7;
  const base = utenSøkOveralt(o.spek);
  const driverSpek = o.drivere ?? base;
  const armer: Arm[] = [
    { navn: "KONTROLL", bygg: () => lagIndre(o.spek), likStilling: true, bud: true, spill: true },
    { navn: "spek", bygg: () => lagIndre(o.spek), likStilling: false, bud: true, spill: true },
    { navn: "PLANTET+BUD", bygg: () => plantetBudretning(lagIndre(o.spek), 1), likStilling: false, bud: true, spill: false },
    { navn: "PLANTET-BUD", bygg: () => plantetBudretning(lagIndre(o.spek), -1), likStilling: false, bud: true, spill: false },
    { navn: "PLANTET-SPILL", bygg: () => plantetKortbytte(lagIndre(base)), likStilling: false, bud: false, spill: true },
  ];
  const rader: K5RRad[] = [];
  const legg = (r: K5RRad): void => {
    rader.push(r);
    skriv?.(r);
  };
  /** Fersk agent per side — samme grunn som i mlb-k5 og k2-spek. */
  const velg = (arm: Arm, s: GameState): Handling => {
    const a = arm.bygg();
    a.nyKamp();
    return a.velgHandling(s);
  };

  for (let g = 0; g < o.giver; g++) {
    if (o.skard !== undefined && g % o.skard[1] !== o.skard[0]) continue;
    const frø = frøBase + g * 4409;
    const drivere = [0, 1, 2, 3].map(() => lagIndre(driverSpek));
    for (const d of drivere) d.nyKamp();
    let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng }, frø);
    let iBud = 0;
    let iSpill = 0;
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
      if (s.fase !== "BUDRUNDE" && spillPerGiv === 0) break;
      if (s.fase === "SPILL" && (iSpill >= spillPerGiv || s.stikkSpilt > tilStikk)) break;
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;

      if (s.fase === "BUDRUNDE" && iBud < budPerGiv) {
        const lov = lovligeHandlinger(s);
        if (lov.fase === "BUDRUNDE" && lov.bud.length >= 2) {
          const mot = motstandersete(s, iTur);
          const bak = medStilling(s, iTur, mot, egne, motstander);
          const foran = medStilling(s, iTur, mot, motstander, egne);
          for (const arm of armer) {
            if (!arm.bud) continue;
            const sideB = arm.likStilling ? bak : foran;
            const hB = velg(arm, bak);
            const hF = velg(arm, sideB);
            if (hB.type !== "BUD" || hF.type !== "BUD") continue;
            const nB = budNivå(hB.bud);
            const nF = budNivå(hF.bud);
            legg({
              arm: arm.navn,
              fase: "BUD",
              frø,
              sete: iTur,
              stikk: 0,
              bak: avtrykk(hB),
              foran: avtrykk(hF),
              ulikt: nB === nF && avtrykk(hB) === avtrykk(hF) ? 0 : 1,
              budBak: nB,
              budForan: nF,
              budgap: nB - nF,
              passgap: (hB.bud === PASS ? 1 : 0) - (hF.bud === PASS ? 1 : 0),
              pressBak: racepress(bak, iTur),
              pressForan: racepress(sideB, iTur),
            });
          }
          iBud++;
        }
      }
      if (
        s.fase === "SPILL" &&
        iSpill < spillPerGiv &&
        s.stikkSpilt >= fraStikk &&
        lovligeKort(s, iTur).length >= 2
      ) {
        const mot = motstandersete(s, iTur);
        const bak = medStilling(s, iTur, mot, egne, motstander);
        const foran = medStilling(s, iTur, mot, motstander, egne);
        for (const arm of armer) {
          if (!arm.spill) continue;
          const sideB = arm.likStilling ? bak : foran;
          const a = avtrykk(velg(arm, bak));
          const b = avtrykk(velg(arm, sideB));
          legg({
            arm: arm.navn,
            fase: "SPILL",
            frø,
            sete: iTur,
            stikk: s.stikkSpilt,
            bak: a,
            foran: b,
            ulikt: a === b ? 0 : 1,
            pressBak: racepress(bak, iTur),
            pressForan: racepress(sideB, iTur),
          });
        }
        iSpill++;
      }
      s = utfør(s, drivere[iTur]!.velgHandling(s)).state;
    }
  }
  return rader;
}

export interface K5RDom {
  readonly arm: string;
  readonly budN: number;
  readonly budGap: number;
  readonly budSe: number;
  readonly høyere: number;
  readonly lavere: number;
  readonly p: number;
  readonly passGap: number;
  readonly passSe: number;
  readonly spillN: number;
  readonly endret: number;
  readonly andel: number;
  readonly giver: number;
}

export function dømArm(rader: readonly K5RRad[], arm: string): K5RDom {
  const b = rader.filter((r) => r.arm === arm && r.fase === "BUD");
  const sp = rader.filter((r) => r.arm === arm && r.fase === "SPILL");
  const gap = klyngeSnitt(b, (r) => r.frø, (r) => r.budgap ?? 0);
  const pass = klyngeSnitt(b, (r) => r.frø, (r) => r.passgap ?? 0);
  const høyere = b.filter((r) => (r.budgap ?? 0) > 0).length;
  const lavere = b.filter((r) => (r.budgap ?? 0) < 0).length;
  const endret = sp.reduce((a, r) => a + r.ulikt, 0);
  return {
    arm,
    budN: b.length,
    budGap: gap.snitt,
    budSe: gap.se,
    høyere,
    lavere,
    p: tegntest(høyere, høyere + lavere),
    passGap: pass.snitt,
    passSe: pass.se,
    spillN: sp.length,
    endret,
    andel: sp.length === 0 ? NaN : endret / sp.length,
    giver: gap.klynger,
  };
}

export interface K5RSamlet {
  readonly armer: Record<string, K5RDom>;
  readonly kontrollOk: boolean;
  readonly felleOk: boolean;
  /** Bak byr høyere: gap > 2 SE OG tegntest p < 0,05. */
  readonly retning: boolean;
  readonly dom: "ja" | "nei" | "stum";
  readonly grunn: string;
}

/**
 * DOMMEN. «Ja» krever at retningen er riktig og signifikant på BÅDE snitt (2 SE, klynget
 * på giv) og tegn (p < 0,05) — `krav-delkrav` K5.2 dømte i2 «nei» på p = 0,061.
 * Kontrollen må være eksakt 0 og begge budfellene tatt hver sin vei, ellers «stum».
 */
export function dømK5R(rader: readonly K5RRad[]): K5RSamlet {
  const armer: Record<string, K5RDom> = {};
  for (const a of K5R_ARMER) armer[a] = dømArm(rader, a);
  const k = armer["KONTROLL"]!;
  const kontrollRader = rader.filter((r) => r.arm === "KONTROLL");
  const kontrollOk = k.budN > 0 && kontrollRader.every((r) => r.ulikt === 0 && (r.budgap ?? 0) === 0);
  const pl = armer["PLANTET+BUD"]!;
  const mi = armer["PLANTET-BUD"]!;
  const ps = armer["PLANTET-SPILL"]!;
  const felleBud = pl.høyere > pl.lavere && pl.p < 0.05 && mi.lavere > mi.høyere && mi.p < 0.05;
  const felleSpill = ps.spillN === 0 || ps.andel > 0.5;
  const felleOk = felleBud && felleSpill;
  const sp = armer["spek"]!;
  const retning = sp.budGap > 2 * sp.budSe && sp.høyere > sp.lavere && sp.p < 0.05;
  const dom = !kontrollOk || !felleOk ? "stum" : retning ? "ja" : "nei";
  const grunn = !kontrollOk
    ? "kontrollarmen (lik stilling) er ikke eksakt 0 — agenten er ikke deterministisk eller riggen lekker"
    : !felleBud
      ? "budfellene ble ikke tatt begge veier — prøven kan ikke se retningen med dette utvalget"
      : !felleSpill
        ? "PLANTET-SPILL ble ikke tatt — endret-andelen i spillet kan ikke leses"
        : retning
          ? `bak byr høyere: ${fmt(sp.budGap)} ± ${sp.budSe.toFixed(4)}, ${sp.høyere}/${sp.høyere + sp.lavere}, p=${sp.p.toFixed(3)}`
          : `retningen ikke vist: ${fmt(sp.budGap)} ± ${sp.budSe.toFixed(4)}, ${sp.høyere} høyere / ${sp.lavere} lavere, p=${sp.p.toFixed(3)}`;
  return { armer, kontrollOk, felleOk, retning, dom, grunn };
}

export function tekstK5R(o: K5ROpts, d: K5RSamlet, sekunder: number): string {
  const L: string[] = [];
  L.push("K5 RETNING — bak ⇒ høyere bud, for en vilkårlig spek");
  L.push("");
  L.push(`Spek:      ${o.spek}`);
  L.push(`Drivere:   ${o.drivere ?? utenSøkOveralt(o.spek)}`);
  L.push(`Stilling:  BAK ${o.egne ?? 70}–${o.motstander ?? 90} mot FORAN ${o.motstander ?? 90}–${o.egne ?? 70}, løp til ${o.målPoeng ?? 100}`);
  L.push(`Giv:       ${o.giver}, frøbånd ${o.frøBase ?? 5_100_000} + g·4409${o.skard ? `, skard ${o.skard[0]}/${o.skard[1]}` : ""}`);
  L.push(`Kjøretid:  ${sekunder} s`);
  L.push("");
  L.push("arm             budstillinger  budgap (bak−foran)    høyere/lavere  p       passgap             spill: endret/n");
  L.push("-".repeat(112));
  for (const a of K5R_ARMER) {
    const x = d.armer[a]!;
    L.push(
      `${a.padEnd(15)} ${String(x.budN).padStart(13)}  ${fmt(x.budGap).padStart(8)} ± ${x.budSe.toFixed(4)}   ` +
        `${String(x.høyere).padStart(6)}/${String(x.lavere).padEnd(6)}  ${Number.isFinite(x.p) ? x.p.toFixed(3) : "n/a  "}   ` +
        `${fmt(x.passGap).padStart(8)} ± ${x.passSe.toFixed(4)}   ${x.endret}/${x.spillN}`,
    );
  }
  L.push("-".repeat(112));
  L.push(`KONTROLL ${d.kontrollOk ? "OK (eksakt 0)" : "BOMMET"} · FELLER ${d.felleOk ? "TATT" : "SLAPP UNNA"} · DOM ${d.dom.toUpperCase()}: ${d.grunn}`);
  L.push("SE: klyngebootstrap over giv (budstillingene i én giv deler kort og auksjon).");
  return L.join("\n");
}

function kjør(): void {
  const arg = (n: string, s: string): string => {
    const i = process.argv.indexOf(n);
    return i < 0 ? s : (process.argv[i + 1] ?? s);
  };
  const ut = arg("--ut", "analyse/k5-retning");
  const drivere = arg("--drivere", "");
  const o: K5ROpts = {
    spek: arg("--spek", ADAMS_MAALT),
    giver: tall(arg("--giver", "40"), 40, "--giver"),
    frøBase: tall(arg("--froe", "5100000"), 5_100_000, "--froe"),
    målPoeng: tall(arg("--maalpoeng", "100"), 100, "--maalpoeng"),
    egne: tall(arg("--egne", "70"), 70, "--egne"),
    motstander: tall(arg("--motstander", "90"), 90, "--motstander"),
    budPerGiv: tall(arg("--bud-per-giv", "4"), 4, "--bud-per-giv"),
    spillPerGiv: tall(arg("--spill-per-giv", "0"), 0, "--spill-per-giv"),
    fraStikk: tall(arg("--fra-stikk", "2"), 2, "--fra-stikk"),
    tilStikk: tall(arg("--til-stikk", "7"), 7, "--til-stikk"),
    ...(drivere === "" ? {} : { drivere }),
    skard: arg("--skard", "0/1").split("/").map((x) => tall(x, 0, "--skard")) as [number, number],
  };
  const t0 = Date.now();
  const jsonl = new Radskriver(`${ut}.jsonl`);
  const rader = målK5R(o, (r) => jsonl.rad(r));
  const d = dømK5R(rader);
  const sek = Math.round((Date.now() - t0) / 1000);
  new Radskriver(`${ut}.json`).rad(JSON.stringify({ opts: o, ...d, sekunder: sek }));
  const tekst = tekstK5R(o, d, sek);
  new Radskriver(`${ut}.txt`).rad(tekst);
  process.stderr.write(`${tekst}\n\nSkrevet: ${ut}.jsonl, ${ut}.json og ${ut}.txt\n`);
}

const inngang = process.argv[1];
if (inngang !== undefined && import.meta.url === pathToFileURL(inngang).href) kjør();
