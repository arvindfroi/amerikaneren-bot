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
import { MIN_RUNDER, Økt } from "../src/moe2/okt.ts";
import {
  BEFOLKNING_RESIDUAL,
  NULLFORM,
  snitt,
  standardfeil,
  stilForskjellForm,
  type Nullform,
} from "../src/moe2/stilbias.ts";
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

/** Loekkas hale med kort-8 — iterasjon 9s eget nett. */
const LOOP_HALE8 = "vakt:abmp:e1:e1-modell/kort-8.bin";
const LOOPNAER8 = `okt:${VR}:profil:${BUD}:${LOOP_HALE8}`;
/** Loekkas ORDRETTE spek (`adams-max-loop-v9.sh:161`). Dyr — 8 runder tar ~215 s. */
const LOOPSPEK =
  "okt:vr:e1-modell/vrak-8.bin@e1-modell/etterlyst-8.bin:telrd:eks:3Lt2000:profil:" +
  "sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-8.bin:budq:e1-modell/budq-8.bin:" +
  "vakt:abmp:e1:e1-modell/kort-8.bin";

const ARMER: Record<string, string> = {
  full: FULL,
  usokt: USOKT,
  loopnaer: LOOPNAER,
  loopnaer8: LOOPNAER8,
  loopspek: LOOPSPEK,
};

/**
 * Motstandere: hvem de tre andre setene er.
 *
 * `bare` gir vanen til NØYAKTIG ETT sete; de øvrige er kloner av armen. Det er
 * stillingen der en bordrelativ referanse betaler sin pris: den ene som avviker
 * drar referansen til de tre andre, så tilskuerne leses som avvikende motsatt
 * vei. Målt, ikke antatt — se `--del d`.
 */
const MOTSTANDERE: Record<string, { spek: string; vane: boolean; bare?: number }> = {
  // Fire like — koblingssjekkens egen stilling.
  like: { spek: "", vane: false },
  // Forrige gjennomgangs «vane»: `d` = ikkeDraTrumf, draTerskel 3.
  abmpd: { spek: "vakt:abmpd:e1:e1-modell/d7alle.bin", vane: false },
  // Den vanen detektoren ER maalt mot: +0,629 ± 0,036 = 17 SE.
  trumftrekker: { spek: ADAMS_MAALT, vane: true },
  noytral: { spek: ADAMS_MAALT, vane: false },
  // ÉN trumftrekker (sete 1), to kloner. Prisen paa en bordrelativ referanse.
  envane: { spek: ADAMS_MAALT, vane: true, bare: 1 },
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
  /**
   * SAMME PUNKT, MÅLT MED BORDET SOM NULLPUNKT.
   *
   * Regnet i samme gjennomløp, på nøyaktig samme bokføring, så de to formene
   * ikke kan skille lag på annet enn formelen. Å kjøre dem i hver sin kjøring
   * ville blandet inn ulike kortstokker.
   */
  readonly zB: number;
  readonly sikkerB: boolean;
  readonly krympetB: number;
  readonly forskjellB: number;
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
    // `bare`: alle andre enn det ene setet er kloner av armen, ikke motstandere.
    else if (m.bare !== undefined && i !== m.bare) {
      seter.push(lagIndre(kjerne, { økt }) as unknown as Spekagent);
    } else {
      seter.push(m.vane ? lagTrumftrekker(m.spek) : (lagIndre(m.spek) as unknown as Spekagent));
    }
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
          const andre = [0, 1, 2, 3].filter((p) => p !== sete).map((p) => økt.bok.biasFor(p));
          /**
           * BEGGE FORMER KALLES EKSPLISITT, ikke via `bok.stil`.
           *
           * Sto `const d = økt.bok.stil(sete)` for den globale kolonnen. Den
           * går gjennom `NULLFORM`, så i det øyeblikket produksjonen byttet
           * form, målte BEGGE kolonnene det samme — og tabellen så ut som om
           * de to formene var identiske. Sammenligningen må være uavhengig av
           * hva produksjonen tilfeldigvis er koblet til.
           */
          const d = stilForskjellForm(b, andre, "global");
          const z = Number.isFinite(d.se) && d.se > 0 ? Math.abs(d.forskjell) / d.se : 0;
          const dB = stilForskjellForm(b, andre, "bord");
          const zB = Number.isFinite(dB.se) && dB.se > 0 ? Math.abs(dB.forskjell) / dB.se : 0;
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
            zB,
            sikkerB: dB.sikker,
            krympetB: dB.sikker && Number.isFinite(dB.se) ? Math.max(0, Math.abs(dB.forskjell) - 2 * dB.se) : 0,
            forskjellB: dB.forskjell,
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
      `  ${String(r).padStart(5)}   ${String(Math.round(middelAv(pr.map((p) => p.n)))).padStart(6)}   ` +
        `${Math.max(0, ...zr).toFixed(2).padStart(6)}   ${middelAv(zr).toFixed(2).padStart(7)}   ` +
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
// DEL D — KALIBRERINGEN: hvilken form lyver minst mot fire IDENTISKE agenter?
// ===========================================================================

/**
 * De to formene, lest ut av det SAMME punktet. Begge er regnet i samme
 * gjennomløp på samme bokføring, så en forskjell mellom dem kan bare komme fra
 * formelen — ikke fra ulike kortstokker, ulike runder eller ulik `n`.
 */
interface Form {
  readonly navn: string;
  readonly z: (p: Punkt) => number;
  readonly sikker: (p: Punkt) => boolean;
  readonly krympet: (p: Punkt) => number;
}

const FORMER: readonly Form[] = [
  { navn: "global", z: (p) => p.z, sikker: (p) => p.sikker, krympet: (p) => p.krympet },
  { navn: "bord", z: (p) => p.zB, sikker: (p) => p.sikkerB, krympet: (p) => p.krympetB },
];

/**
 * KLONPRØVEN, over flere frø.
 *
 * Ett frø sier ingenting om en detektor som skal være stille: en form kan være
 * heldig i én kortstokk. Kravet er at fire IDENTISKE agenter ikke flagges i
 * NOEN av dem — og det tallet er bare meningsfullt over et knippe frø.
 */
function kalibrer(
  navn: string,
  armSpek: string,
  motstander: keyof typeof MOTSTANDERE,
  runder: number,
  kamper: number,
  frøBase: number,
  frøer: number,
): void {
  const kjøringer: { frø: number; k: Kjøring }[] = [];
  for (let i = 0; i < frøer; i++) {
    const frø = frøBase + i * 1_000_003;
    kjøringer.push({ frø, k: spill(armSpek, motstander, runder, kamper, frø) });
  }
  const alle = kjøringer.flatMap((x) => x.k.punkter);

  skriv("");
  skriv(`=== DEL D: kalibrering — ${navn} ===`);
  skriv(`  ${frøer} froe x ${kamper} kamper x ${runder} runder`);
  skriv(`  runder spilt totalt       ${kjøringer.reduce((a, x) => a + x.k.runder, 0)}`);
  skriv(`  atferdsmodell satt        ${kjøringer.every((x) => x.k.harAtferd) ? "JA" : "*** NEI ***"}`);

  skriv("");
  skriv("  form     gulv   punkter   over porten          p99 z    maks z   maks krympet");
  for (const f of FORMER) {
    for (const gulv of [false, true]) {
      const pk = gulv ? alle.filter((p) => p.runde >= MIN_RUNDER) : alle;
      const z = pk.map(f.z).filter((x) => Number.isFinite(x));
      const over = pk.filter(f.sikker).length;
      skriv(
        `  ${f.navn.padEnd(7)} ${(gulv ? `r>=${MIN_RUNDER}` : "nei").padStart(5)}   ` +
          `${String(pk.length).padStart(7)}   ` +
          `${`${over} (${((100 * over) / Math.max(1, pk.length)).toFixed(1)} %)`.padEnd(18)}` +
          `${pst(z, 99).toFixed(2).padStart(6)}    ${Math.max(0, ...z).toFixed(2).padStart(6)}   ` +
          `${Math.max(0, ...pk.map(f.krympet)).toFixed(4).padStart(12)}`,
      );
    }
  }

  /**
   * SELVE PRØVEN. To lesninger, fordi de svarer på ulike ting:
   *
   *   SLUTT      flagget noen ved siste avlesning? Det er tilstanden en lang
   *              kamp ender i, og der den feilkalibrerte formen er verst.
   *   NOENSINNE  passerte noen porten på noe tidspunkt? Strengere, og det er
   *              den som svarer «kan vrien ha fyrt i denne kampen».
   */
  skriv("");
  skriv(`  KLONPROEVEN — seter over porten (av 4). Kravet er 0.`);
  skriv("  froe            global slutt   global noensinne   bord slutt   bord noensinne");
  const sum = { gs: 0, gn: 0, bs: 0, bn: 0 };
  for (const { frø, k } of kjøringer) {
    const gulvet = k.punkter.filter((p) => p.runde >= MIN_RUNDER);
    let gs = 0;
    let gn = 0;
    let bs = 0;
    let bn = 0;
    for (let sete = 0; sete < 4; sete++) {
      const mine = gulvet.filter((p) => p.sete === sete);
      const siste = mine[mine.length - 1];
      if (siste === undefined) continue;
      if (siste.sikker) gs++;
      if (siste.sikkerB) bs++;
      if (mine.some((p) => p.sikker)) gn++;
      if (mine.some((p) => p.sikkerB)) bn++;
    }
    sum.gs += gs;
    sum.gn += gn;
    sum.bs += bs;
    sum.bn += bn;
    skriv(
      `  ${String(frø).padEnd(14)}  ${String(gs).padStart(11)}   ${String(gn).padStart(16)}   ` +
        `${String(bs).padStart(10)}   ${String(bn).padStart(14)}`,
    );
  }
  const N = 4 * frøer;
  skriv(
    `  SUM (av ${String(N).padEnd(6)}) ${String(sum.gs).padStart(11)}   ${String(sum.gn).padStart(16)}   ` +
      `${String(sum.bs).padStart(10)}   ${String(sum.bn).padStart(14)}`,
  );

  /**
   * PER SETE: hvor stor vri fikk hvert sete, som det STØRSTE over frøene?
   *
   * Det er her prisen på en bordrelativ referanse blir synlig. Sitter det én
   * avviker ved bordet, drar hun referansen til de tre andre, og tilskuerne får
   * et utslag de ikke har fortjent. Tallet som betyr noe er FORHOLDET mellom
   * vanens utslag og den største tilskuerens — det er det som avgjør om
   * vridningen treffer den særegne eller alle.
   */
  skriv("");
  skriv("  PER SETE — stoerste utslag (krympet) over froe, etter rundegulvet");
  skriv("  sete   global   bord");
  for (let sete = 0; sete < 4; sete++) {
    const mine = alle.filter((p) => p.sete === sete && p.runde >= MIN_RUNDER);
    if (mine.length === 0) continue;
    skriv(
      `  ${String(sete).padStart(4)}   ${Math.max(0, ...mine.map((p) => p.krympet)).toFixed(4).padStart(6)}   ` +
        `${Math.max(0, ...mine.map((p) => p.krympetB)).toFixed(4).padStart(6)}`,
    );
  }

  /**
   * VOKSER z MED n? Det er signaturen på et feil nullpunkt: et systematisk
   * avvik krymper ikke med flere observasjoner, mens SE gjør, så z ~ avvik·√n.
   * En riktig kalibrert form ligger flatt uansett hvor lenge de spiller.
   */
  skriv("");
  skriv("  z-VEKST — snitt z per runde over alle froe (flat = kalibrert, stigende = feil nullpunkt)");
  skriv("  runde    n/sete   global   bord");
  const maksRunde = Math.max(0, ...alle.map((p) => p.runde));
  for (let r = 0; r <= maksRunde; r++) {
    const pr = alle.filter((p) => p.runde === r);
    if (pr.length === 0) continue;
    if (r % 5 !== 0 && r !== maksRunde) continue;
    skriv(
      `  ${String(r).padStart(5)}   ${String(Math.round(middelAv(pr.map((p) => p.n)))).padStart(7)}   ` +
        `${middelAv(pr.map((p) => p.z)).toFixed(2).padStart(6)}   ${middelAv(pr.map((p) => p.zB)).toFixed(2).padStart(4)}`,
    );
  }
}

// ===========================================================================
// DEL E — AV ER AV: uten «okt:» skal alt vaere bit-identisk
// ===========================================================================

/**
 * En FNV-1a-hash over hele handlingsrekken i et oppsett.
 *
 * Hvorfor en hash og ikke «endret den et valg»: en endring i nullpunktet kan
 * flytte ETT kort i runde 19 og ellers ingenting. En teller som ser på siste
 * stilling ville sagt «likt». Hashen fanger hvert eneste bud, vrak og kort i
 * rekkefølge, så den kan ikke gå glipp av noe — og den er ett tall å sammenligne.
 */
function trajektorie(spek: string, runder: number, kamper: number, frøBase: number): {
  hash: string;
  n: number;
} {
  const seter = [0, 1, 2, 3].map(() => lagIndre(spek) as unknown as Spekagent);
  let h = 2_166_136_261 >>> 0;
  let n = 0;
  for (let k = 0; k < kamper; k++) {
    for (const a of seter) a.nyKamp();
    let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 9999 }, frøBase + k * 7717);
    let vakt = 0;
    let r = 0;
    while (s.fase !== "FERDIG" && vakt++ < 200_000 && r < runder) {
      if (s.fase === "RUNDE_SLUTT") {
        for (const a of seter) a.observer?.(s);
        r++;
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      const hd = seter[iTur]!.velgHandling(s);
      const str = JSON.stringify(hd);
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16_777_619) >>> 0;
      }
      n++;
      s = utfør(s, hd).state;
    }
  }
  return { hash: h.toString(16).padStart(8, "0"), n };
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
  let frøer = 1;
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
    else if (a === "--froeer") frøer = tall(v, frøer, "--froeer");
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
  } else if (del === "d") {
    kalibrer(`${arm} mot ${motstander}`, armSpek, motstander as never, runder, kamper, frø, frøer);
  } else if (del === "e") {
    const uten = armSpek.startsWith("okt:") ? armSpek.slice(4) : armSpek;
    const med = trajektorie(armSpek, runder, kamper, frø);
    const u = trajektorie(uten, runder, kamper, frø);
    skriv("");
    skriv(`=== DEL E: AV ER AV (${runder} runder x ${kamper} kamper) ===`);
    skriv(`  NULLFORM i bruk           ${NULLFORM}`);
    skriv(`  med «okt:»   ${med.hash}   (${med.n} handlinger)`);
    skriv(`  uten «okt:»  ${u.hash}   (${u.n} handlinger)`);
    skriv("");
    skriv(`  Hashene skal sammenlignes MELLOM formene, ikke mot hverandre:`);
    skriv(`  «uten okt:» maa vaere IDENTISK foer og etter at nullpunktet byttes.`);
  } else {
    throw new Error(`Ukjent del «${del}» (a, c, d)`);
  }
  skriv("");
  skriv(`kjoeretid ${Math.round((Date.now() - t0) / 1000)} s`);
}

kjør();
