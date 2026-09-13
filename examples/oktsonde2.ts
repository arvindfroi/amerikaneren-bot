/**
 * OKT-SONDEN — passeres porten paa 2 SE noensinne i EKTE spill?
 *
 *   node examples/oktsonde2.ts --del a --arm billig --runder 26 --kamper 3
 *
 * `examples/koblingssonde.ts` maalte at `okt:` er «stum her»: stilen er sikker i
 * 0 av 41 amu-valg, og maks |forskjell|/SE er 0,47 mot en port paa 2,0. Men den
 * maalte det i FIRE RUNDER med FIRE LIKE agenter — den stillingen der porten per
 * konstruksjon ikke KAN passeres. Og raden som skulle vise at den kan fyre
 * («mot tre som ikke drar trumf») ga ogsaa 0.
 *
 * Denne sonden svarer paa tre ting, og roerer ingen terskel:
 *
 *   DEL A  fordelingen av z = |forskjell|/SE over mange valg i ekte kamper —
 *          hvor ofte over 2,0, p90/p99, og hvor mange runder inn foer den KAN
 *          passeres. En port som aldri passeres er en av-bryter.
 *   DEL B  driver residualet mot 2,0 av en VANE, eller av at nullpunktet
 *          `BEFOLKNING_RESIDUAL` er maalt paa en annen stakk enn den som spiller?
 *          De to har helt ulik konsekvens: den foerste er K4 som virker, den
 *          andre er en falsk positiv som vokser med n.
 *   DEL C  finnes det en STILLING der hukommelsen endrer et valg? Enkleste
 *          foerst, og med den vanen detektoren er MAALT mot (`lagTrumftrekker`),
 *          ikke `vakt:abmpd`.
 *
 * ============================ K2 =========================================
 *
 * Sonden leser BARE oektens egen bokfoering (`bok.biasFor`, `bok.stil`) og
 * offentlige felt paa stillingen (`fase`, `iTur`, `rundeNr`). Den kaller aldri
 * `state.hender`, `state.vrak` eller `giving`. Bokfoeringen selv skjer i
 * `Profilbok.observer` paa `RUNDE_SLUTT` naar alle kort er avdekket — lovlig og
 * dokumentert i `profilagent.ts:188` og `stilbias.ts:170`. Ingen ny sti leser
 * skjulte kort.
 */

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør } from "../src/index.ts";
import type { GameState, Handling } from "../src/motor.ts";
import { ADAMS_MAALT, lagIndre, tall } from "../src/moe2/agentspek.ts";
import { Økt } from "../src/moe2/okt.ts";
import { BEFOLKNING_RESIDUAL, snitt, standardfeil } from "../src/moe2/stilbias.ts";
import { lagTrumftrekker, type Spekagent } from "./k6-vaner.ts";

// ===========================================================================
// Spekene
// ===========================================================================

const NETT = "vakt:abmpf:e1:e1-modell/d7alle.bin";
const VR = "vr:e1-modell/vrakrang.bin:telrd";
const BUD = "budm:e1-modell/bud-vant.json@-3.0/0.6/0/-3.0/0/sok12k8b0.5";
const AMU = (f: string) => `amu:foerer:${f}`;

/** Ordrett `koblingssjekk.ts:61` — den speken de 219 valgene ble maalt med. */
const FULL = `okt:${VR}:${AMU("12k16bgm1e0r1.5v0.5")}:profil:${BUD}:${NETT}`;
/** Samme stakk uten soek: samme bokfoering, brøkdelen av tiden. */
const USOKT = `okt:${VR}:profil:${BUD}:${NETT}`;
/** Loekkas egen konvensjonshale, `abmp` og ikke `abmpf`. */
const LOOP_HALE = "vakt:abmp:e1:e1-modell/kort-7.bin";
const LOOPNAER = `okt:${VR}:profil:${BUD}:${LOOP_HALE}`;

const ARMER: Record<string, string> = {
  full: FULL,
  usokt: USOKT,
  loopnaer: LOOPNAER,
};

/** Motstandere: hvem de tre andre setene er. */
const MOTSTANDERE: Record<string, { spek: string; vane: boolean }> = {
  // Fire like — koblingssjekkens egen stilling.
  like: { spek: "", vane: false },
  // Forrige gjennomgangs «vane»: `d` = ikkeDraTrumf, draTerskel 3.
  abmpd: { spek: "vakt:abmpd:e1:e1-modell/d7alle.bin", vane: false },
  // Den vanen detektoren ER maalt mot: +0,629 ± 0,036 = 17 SE.
  trumftrekker: { spek: ADAMS_MAALT, vane: true },
  noytral: { spek: ADAMS_MAALT, vane: false },
};

// ===========================================================================
// Kampdriveren — én oekt vi selv eier, saa den kan LESES underveis
// ===========================================================================

interface Punkt {
  readonly kamp: number;
  readonly runde: number;
  readonly valg: number;
  readonly sete: number;
  readonly n: number;
  readonly middel: number;
  readonly forskjell: number;
  readonly se: number;
  readonly z: number;
  readonly sikker: boolean;
  /** `max(0, |forskjell| − 2·SE)` — det `stilvri` faktisk returnerer. */
  readonly krympet: number;
}

interface Kjøring {
  readonly punkter: Punkt[];
  readonly runder: number;
  readonly harAtferd: boolean;
}

/**
 * Spiller `kamper` kamper i ÉN oekt (boka staar mellom kamper — det er hele
 * poenget med `Økt`) og logger z for hvert sete ved hvert eneste kortvalg.
 */
function spill(
  armSpek: string,
  motstander: keyof typeof MOTSTANDERE,
  runder: number,
  kamper: number,
  frøBase: number,
): Kjøring {
  const økt = new Økt();
  const kjerne = armSpek.startsWith("okt:") ? armSpek.slice(4) : armSpek;
  const m = MOTSTANDERE[motstander]!;

  // Alle fire setene er armen selv naar motstanderen er «like» — da deler de
  // oekten, noeyaktig som `koblingssjekk.ts` gjoer.
  const seter: Spekagent[] = [];
  for (let i = 0; i < 4; i++) {
    if (m.spek === "") seter.push(lagIndre(kjerne, { økt }) as unknown as Spekagent);
    else if (i === 0) seter.push(lagIndre(kjerne, { økt }) as unknown as Spekagent);
    else seter.push(m.vane ? lagTrumftrekker(m.spek) : (lagIndre(m.spek) as unknown as Spekagent));
  }

  const punkter: Punkt[] = [];
  let rTotal = 0;
  for (let k = 0; k < kamper; k++) {
    økt.nyKamp();
    for (const a of seter) a.nyKamp();
    let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 9999 }, frøBase + k * 7717);
    let vakt = 0;
    let r = 0;
    let valg = 0;
    while (s.fase !== "FERDIG" && vakt++ < 200_000 && r < runder) {
      if (s.fase === "RUNDE_SLUTT") {
        // BOKFOERINGEN GAAR GJENNOM STAKKEN, som i `kamp.ts` og `k6-vaner.ts`.
        for (const a of seter) a.observer?.(s);
        r++;
        rTotal++;
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      if (s.fase === "SPILL") {
        valg++;
        for (let sete = 0; sete < 4; sete++) {
          const b = økt.bok.biasFor(sete);
          const d = økt.bok.stil(sete);
          const z = Number.isFinite(d.se) && d.se > 0 ? Math.abs(d.forskjell) / d.se : 0;
          punkter.push({
            kamp: k,
            runde: r,
            valg,
            sete,
            n: b.n,
            middel: snitt(b),
            forskjell: d.forskjell,
            se: standardfeil(b),
            z,
            sikker: d.sikker,
            krympet: d.sikker && Number.isFinite(d.se) ? Math.max(0, Math.abs(d.forskjell) - 2 * d.se) : 0,
          });
        }
      }
      s = utfør(s, seter[iTur]!.velgHandling(s)).state;
    }
  }
  return { punkter, runder: rTotal, harAtferd: økt.bok.harAtferd() };
}

// ===========================================================================
// Rapportering
// ===========================================================================

/** Snittet av en TALLISTE. `snitt` fra `stilbias.ts` tar et `Biasanslag`. */
const middelAv = (x: readonly number[]): number =>
  x.length === 0 ? NaN : x.reduce((a, b) => a + b, 0) / x.length;

const pst = (x: readonly number[], p: number): number => {
  if (x.length === 0) return NaN;
  const s = [...x].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor((p / 100) * s.length)))]!;
};

let LOGG = "";
const ut: string[] = [];
const skriv = (l: string): void => {
  ut.push(l);
  process.stdout.write(l + "\n");
  if (LOGG !== "") appendFileSync(LOGG, l + "\n");
};

function rapporter(navn: string, k: Kjøring): void {
  const z = k.punkter.map((p) => p.z).filter((x) => Number.isFinite(x));
  const over = k.punkter.filter((p) => p.sikker).length;
  skriv("");
  skriv(`=== ${navn} ===`);
  skriv(`  runder spilt              ${k.runder}`);
  skriv(`  atferdsmodell satt        ${k.harAtferd ? "JA" : "*** NEI - da er stil() aldri sikker ***"}`);
  skriv(`  (sete, valg)-punkter      ${k.punkter.length}`);
  skriv(
    `  sikker (z >= 2,0)         ${over} (${((100 * over) / Math.max(1, k.punkter.length)).toFixed(1)} %)` +
      (over === 0 ? "   *** PORTEN ALDRI PASSERT ***" : ""),
  );
  skriv(`  z: p50 ${pst(z, 50).toFixed(2)}   p90 ${pst(z, 90).toFixed(2)}   p99 ${pst(z, 99).toFixed(2)}   maks ${Math.max(0, ...z).toFixed(2)}`);

  // Naar KAN den passeres? Foerste runde der et sete er sikkert.
  const først = k.punkter.filter((p) => p.sikker).map((p) => p.runde);
  skriv(`  foerste sikre runde       ${først.length === 0 ? "aldri" : String(Math.min(...først))}`);

  // z per runde: den viktigste kurven — vokser den med n, er porten en
  // TIDSFORSINKELSE og ikke en av-bryter.
  const maksRunde = Math.max(0, ...k.punkter.map((p) => p.runde));
  skriv("  runde   n/sete   maks z   snitt z   sikre");
  for (let r = 0; r <= maksRunde; r++) {
    const pr = k.punkter.filter((p) => p.runde === r);
    if (pr.length === 0) continue;
    const zr = pr.map((p) => p.z);
    skriv(
      `  ${String(r).padStart(5)}   ${String(Math.round(snitt(pr.map((p) => p.n)))).padStart(6)}   ` +
        `${Math.max(0, ...zr).toFixed(2).padStart(6)}   ${snitt(zr).toFixed(2).padStart(7)}   ` +
        `${String(pr.filter((p) => p.sikker).length).padStart(5)}`,
    );
  }

  // DEL B: hvor ligger hvert setes RESIDUAL i forhold til nullpunktet?
  skriv(`  nullpunkt BEFOLKNING_RESIDUAL = ${BEFOLKNING_RESIDUAL}`);
  skriv("  sete    n   middel   forskjell      SE       z   sikker  krympet");
  for (let sete = 0; sete < 4; sete++) {
    const siste = [...k.punkter].reverse().find((p) => p.sete === sete);
    if (siste === undefined) continue;
    skriv(
      `  ${String(sete).padStart(4)} ${String(siste.n).padStart(4)}  ${siste.middel.toFixed(4).padStart(7)}   ` +
        `${siste.forskjell.toFixed(4).padStart(9)}  ${siste.se.toFixed(4).padStart(6)}  ${siste.z.toFixed(2).padStart(6)}   ` +
        `${siste.sikker ? "JA " : "nei"}    ${siste.krympet.toFixed(4)}`,
    );
  }
}

// ===========================================================================
// DEL C — endrer hukommelsen et VALG?
// ===========================================================================

/**
 * Som `koblingssjekk.ts:ulikeMot`, men med den vanen detektoren er MAALT mot,
 * og med oekten LEST ut underveis saa en null kan skilles fra en stum port.
 *
 * Sete 0 er armen. De tre andre deles av begge armene, saa forskjellen som
 * telles er armens egen.
 */
function endrerValg(
  medSpek: string,
  utenSpek: string,
  motstander: keyof typeof MOTSTANDERE,
  runder: number,
  kamper: number,
  frøBase: number,
): { n: number; ulik: number; maksZ: number; sikreValg: number; førsteUlikRunde: number | null; bokN: number } {
  const økt = new Økt();
  const kjerneMed = medSpek.startsWith("okt:") ? medSpek.slice(4) : medSpek;
  const A0 = lagIndre(kjerneMed, { økt }) as unknown as Spekagent;
  const B0 = lagIndre(utenSpek) as unknown as Spekagent;
  const m = MOTSTANDERE[motstander]!;
  const mot = [1, 2, 3].map(() =>
    m.vane ? lagTrumftrekker(m.spek) : (lagIndre(m.spek) as unknown as Spekagent),
  );
  const alle = [A0, B0, ...mot];

  let n = 0;
  let ulik = 0;
  let maksZ = 0;
  let sikreValg = 0;
  let førsteUlik: number | null = null;
  for (let k = 0; k < kamper; k++) {
    økt.nyKamp();
    for (const x of alle) x.nyKamp();
    let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 9999 }, frøBase + k * 7717);
    let vakt = 0;
    let r = 0;
    while (s.fase !== "FERDIG" && vakt++ < 200_000 && r < runder) {
      if (s.fase === "RUNDE_SLUTT") {
        for (const x of alle) x.observer?.(s);
        r++;
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      if (iTur !== 0) {
        s = utfør(s, mot[iTur - 1]!.velgHandling(s)).state;
        continue;
      }
      // Er noen av de TRE ANDRE lest som saeregne akkurat naa? Det er dem
      // `motpartFor` vris for.
      let sikkerHer = false;
      for (const p of [1, 2, 3]) {
        const d = økt.bok.stil(p);
        if (Number.isFinite(d.se) && d.se > 0) maksZ = Math.max(maksZ, Math.abs(d.forskjell) / d.se);
        if (økt.stilvri(p) !== null) sikkerHer = true;
      }
      if (sikkerHer) sikreValg++;
      const ha = A0.velgHandling(s) as Handling;
      const hb = B0.velgHandling(s) as Handling;
      n++;
      if (JSON.stringify(ha) !== JSON.stringify(hb)) {
        ulik++;
        if (førsteUlik === null) førsteUlik = r;
      }
      s = utfør(s, ha).state;
    }
  }
  let bokN = 0;
  for (const p of [1, 2, 3]) bokN = Math.max(bokN, økt.bok.biasFor(p).n);
  return { n, ulik, maksZ, sikreValg, førsteUlikRunde: førsteUlik, bokN };
}

// ===========================================================================
// Kjoeringen
// ===========================================================================

function kjør(): void {
  let del = "a";
  let arm = "usokt";
  let motstander = "like";
  let runder = 26;
  let kamper = 1;
  let frø = 13_000_777;
  let utFil = "";

  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]!;
    const v = process.argv[i + 1];
    if (a === "--del") del = v ?? del;
    else if (a === "--arm") arm = v ?? arm;
    else if (a === "--mot") motstander = v ?? motstander;
    else if (a === "--runder") runder = tall(v, runder, "--runder");
    else if (a === "--kamper") kamper = tall(v, kamper, "--kamper");
    else if (a === "--froe") frø = tall(v, frø, "--froe");
    else if (a === "--ut") utFil = v ?? utFil;
  }

  const armSpek = ARMER[arm] ?? arm;
  if (MOTSTANDERE[motstander] === undefined) {
    throw new Error(`Ukjent motstander «${motstander}» (${Object.keys(MOTSTANDERE).join(", ")})`);
  }
  if (utFil !== "") {
    mkdirSync(dirname(utFil), { recursive: true });
    writeFileSync(utFil, "");
    LOGG = utFil;
  }

  const t0 = Date.now();
  skriv(`OKT-SONDEN  del ${del}  arm ${arm}  mot ${motstander}  ${runder} runder x ${kamper} kamper  froe ${frø}`);
  skriv(`spek: ${armSpek}`);
  if (MOTSTANDERE[motstander]!.spek !== "") {
    skriv(`mot:  ${MOTSTANDERE[motstander]!.spek}${MOTSTANDERE[motstander]!.vane ? "  (TRUMFTREKKER-kappe)" : ""}`);
  }

  if (del === "a") {
    rapporter(`${arm} mot ${motstander}`, spill(armSpek, motstander as never, runder, kamper, frø));
  } else if (del === "c") {
    const uten = armSpek.startsWith("okt:") ? armSpek.slice(4) : armSpek;
    const r = endrerValg(armSpek, uten, motstander as never, runder, kamper, frø);
    skriv("");
    skriv(`=== DEL C: endrer «okt:» et valg? (${arm} mot ${motstander}) ===`);
    skriv(`  valg sammenlignet         ${r.n}`);
    skriv(`  ULIKE                     ${r.ulik}   ${r.ulik > 0 ? "*** HUKOMMELSEN ENDRER ET VALG ***" : "ingen"}`);
    skriv(`  foerste ulike i runde     ${r.førsteUlikRunde ?? "—"}`);
    skriv(`  valg der stilvri != null  ${r.sikreValg} (porten passert for minst ett motsete)`);
    skriv(`  maks z over motsetene     ${r.maksZ.toFixed(2)} (porten er 2,0)`);
    skriv(`  observasjoner i boka      ${r.bokN}`);
  } else {
    throw new Error(`Ukjent del «${del}» (a, c)`);
  }
  skriv("");
  skriv(`kjoeretid ${Math.round((Date.now() - t0) / 1000)} s`);
}

kjør();
