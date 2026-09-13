/**
 * ANGER MOT EKSAKT FASIT, PER TEMPERATUR (13. sep).
 *
 *   node examples/trotemp-anger.ts --runder 24 --fro 13000777 --temps 1,1.5,2,3,5,8 \
 *        --ut analyse/troanger-w0.jsonl
 *
 * ============ HVA DEN MÅLER ===============================================
 *
 * `troledd.ts` målte at troen endrer kortet i 2,7 ± 1,1 pp av tilfellene over støygulvet,
 * og at de endringene er en myntkast (bedre i 20, verre i 14). Hypotesen bak temperaturen
 * er at en overkonfident vekt satser hardt på én gjetning og taper når gjetningen er feil.
 * Da skal en temperert vekt tape MINDRE, og det er anger mot eksakt fasit som ser det.
 *
 * Armene er `troledd.ts`s arm A, én per temperatur, og de deler stilling OG RNG-strøm:
 * `lagRng(visningsfrø(state, sete, FRØ))` gir de SAMME 32 kandidatene i hver arm, så bare
 * VEKTENS SKARPHET skiller dem. Arm C er T = 1 med et annet instansfrø — det rene
 * støygulvet — og arm B er speken uten troen, så tallene henger sammen med `troledd.md`.
 *
 * ============ HVORFOR BARE I FASITVINDUET =================================
 *
 * `troledd-fasitspredning.ts` målte at 37 av 42 stillinger i vinduet har spredning 0:
 * kontrakten er avgjort, og hvert lovlig kort gir samme rundepoeng. En slik stilling kan
 * ikke skille en arm fra en annen. Med seks temperaturer koster hver beslutning seks ganger
 * det `troledd.ts` betalte, så armene evalueres BARE der fasiten finnes (≤ 7 kort igjen,
 * kostnadstaket fra `troledd-kostnad.ts`) OG faktisk skiller. Fasiten regnes FØRST, og er
 * den flat, spilles stillingen videre uten å betale for én eneste utspilling.
 *
 * Det er en innskrenkning av HVOR målingen ser, ikke av hva den svarer på: anger kan bare
 * måles der fasiten har en mening, og det er nøyaktig det vinduet `troledd.md` §2 slo fast.
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, lovligeKort, type GameState } from "../src/motor.ts";
import { FARGER, lagRng, likeKort, type Kort } from "../src/kort.ts";
import { lagIndre, tall } from "../src/moe2/agentspek.ts";
import { vurderPar, type ParKandidat, type ParResultat } from "../src/moe2/sdpar.ts";
import { visningsfrø } from "../src/moe2/sikkerorakel.ts";
import { MlbSøketro } from "../src/moe2/soketro.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import { lagMål, type Utspiller } from "../src/moe2/sdkort.ts";
import { rolleFor } from "../src/moe2/rolleorakel.ts";
import { kortTilInt } from "../src/solver/dds.ts";
import { poengRotVerdier } from "../src/solver/poengdds.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const RUNDER = tall(arg("--runder", "24"), 24, "runder");
const FRO = tall(arg("--fro", "13000777"), 13_000_777, "fro");
const UT = arg("--ut", "");
const FASITTAK = tall(arg("--fasittak", "7"), 7, "fasittak");
const VERDENER = tall(arg("--verdener", "48"), 48, "verdener");
const KANDIDATER = tall(arg("--kandidater", "32"), 32, "kandidater");
const TEMPS = arg("--temps", "1,1.5,2,3,5,8")
  .split(",")
  .map((x) => Number(x));
for (const T of TEMPS) {
  if (!Number.isFinite(T) || T <= 0) throw new Error(`ugyldig temperatur «${T}» i --temps`);
}

/** Den utrullede speken (iter-8-modellene), ordrett fra `troledd.ts`. */
const HELBOT =
  "okt:vr:e1-modell/vrak-8.bin@e1-modell/etterlyst-8.bin:telrd:eks:3Lt2000:profil:" +
  "sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-8.bin:budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin";
const INDRE = "budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin";
const SIK_FRØ = 20_260_804;
const EKSAKT_BLAD = 3;
const SIGMA_PORT = 0.5;

// ===========================================================================
// FASITEN — ordrett fra `troledd.ts`, samme løser og samme ekvivalensklasser
// ===========================================================================

interface Fasit {
  readonly diff: Map<number, number>;
  readonly lag: Map<number, number>;
  readonly bestDiff: number;
  readonly bestLag: number;
}

const sammeSide = (s: GameState, sete: number, p: number): boolean => {
  const bv = s.budvinner!;
  const mk = s.makker;
  const på = (x: number): boolean => x === bv || (mk !== null && x === mk);
  return på(p) === på(sete);
};

function lagFasit(s: GameState, sete: number): Fasit | null {
  if (s.fase !== "SPILL" || s.iTur === null || s.trumf === null) return null;
  if (s.budvinner === null || s.melding === null) return null;
  if (s.hender.some((h) => h.length === 0)) return null;
  const svar = poengRotVerdier({
    N: s.antallSpillere,
    trump: FARGER.indexOf(s.trumf),
    hender: s.hender.map((h) => h.map(kortTilInt)),
    iTur: sete,
    bord: s.bord.map((kp) => ({ spiller: kp.spiller, kort: kortTilInt(kp.kort) })),
    stikkFør: s.stikkVunnet.slice(),
    ferdigeStikk: s.stikkSpilt,
    totalStikk: s.giving.antallStikk,
    budvinner: s.budvinner,
    makker: s.makker,
    melding: s.melding,
    målPoeng: s.regler.målPoeng,
    mål: "diff",
  });
  if (svar.verdier.length === 0) return null;
  const diff = new Map<number, number>();
  const lag = new Map<number, number>();
  for (const v of svar.verdier) {
    diff.set(v.kort, v.verdi);
    const mine: number[] = [];
    const deres: number[] = [];
    for (let p = 0; p < s.antallSpillere; p++) (sammeSide(s, sete, p) ? mine : deres).push(v.poeng[p] ?? 0);
    const sn = (x: number[]): number => (x.length === 0 ? 0 : x.reduce((a, b) => a + b, 0) / x.length);
    lag.set(v.kort, sn(mine) - sn(deres));
  }
  return { diff, lag, bestDiff: Math.max(...diff.values()), bestLag: Math.max(...lag.values()) };
}

function slåOpp(m: Map<number, number>, kort: Kort): number | null {
  const c = kortTilInt(kort);
  const direkte = m.get(c);
  if (direkte !== undefined) return direkte;
  const farge = Math.floor(c / 13);
  let beste: number | null = null;
  let besteRang = Infinity;
  for (const k of m.keys()) {
    if (Math.floor(k / 13) !== farge) continue;
    const r = k % 13;
    if (r >= c % 13 && r < besteRang) {
      besteRang = r;
      beste = k;
    }
  }
  return beste === null ? null : m.get(beste)!;
}

const bestEtterSnitt = (par: ParResultat): ParKandidat =>
  par.kandidater.slice().sort((a, b) => b.snitt - a.snitt)[0]!;

// ===========================================================================
// OPPSETT
// ===========================================================================

const tro = new MlbSøketro(MlbTronett.fraBytes(readFileSync("e1-modell/tro-8.bin")));
const drivere = [0, 1, 2, 3].map(() => lagIndre(HELBOT));
const indre = [0, 1, 2, 3].map(() => lagIndre(INDRE));
for (const a of [...drivere, ...indre]) a.nyKamp();
tro.nyKamp();
const alleSer = (s: GameState): void => {
  for (const a of [...drivere, ...indre]) (a as { observer?(x: GameState): void }).observer?.(s);
  tro.observer(s);
};

if (UT !== "") mkdirSync(dirname(UT), { recursive: true });
const rader: string[] = [];
const skriv = (o: unknown): void => {
  if (UT === "") return;
  rader.push(JSON.stringify(o));
  if (rader.length >= 50) {
    appendFileSync(UT, rader.join("\n") + "\n");
    rader.length = 0;
  }
};

// ===========================================================================
// LØKKA
// ===========================================================================

let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, FRO);
let vakt = 0;
let r = 0;
let flate = 0;
let n = 0;
let uoppslåtte = 0;
const tStart = performance.now();

while (s.fase !== "FERDIG" && vakt++ < 40_000 && r < RUNDER) {
  if (s.fase === "RUNDE_SLUTT") {
    alleSer(s);
    r++;
    s = utfør(s, { type: "NESTE" }).state;
    continue;
  }
  alleSer(s);
  const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
  if (iTur === null || iTur === undefined) break;

  if (s.fase === "SPILL" && s.iTur !== null && lovligeKort(s, s.iTur).length >= 2) {
    const sete = s.iTur;
    const igjen = s.hender[sete]?.length ?? 0;
    // FASITEN FØRST, og armene bare hvis den skiller. Se hodet: 88 % er flate.
    const fasit = igjen > 0 && igjen <= FASITTAK ? lagFasit(s, sete) : null;
    const spredning = fasit === null ? null : fasit.bestDiff - Math.min(...fasit.diff.values());
    const skiller = fasit !== null && spredning !== null && spredning > 1e-9;
    if (fasit !== null && !skiller) flate++;

    if (skiller) {
      const motpart = indre[sete]! as unknown as Utspiller;
      const felles = {
        verdener: VERDENER,
        verdenKandidater: KANDIDATER,
        verdenKombi: "snitt" as const,
        eksaktBlad: EKSAKT_BLAD,
        mål: lagMål,
      };
      const frøFor = (): (() => number) => lagRng(visningsfrø(s, sete, SIK_FRØ));
      const trovekt = tro.vektFor(s, sete) ?? undefined;

      const armer = new Map<string, ParResultat>();
      for (const T of TEMPS) {
        const p = vurderPar(s, sete, motpart, {
          ...felles,
          rng: frøFor(),
          trovekt,
          budvekt: false,
          // T = 1: nøkkelen er BORTE, så armen er bit-identisk med `troledd.ts` arm A.
          ...(T === 1 ? {} : { trotemp: T }),
        });
        if (p !== null) armer.set(`T${T}`, p);
      }
      // Støygulvet: T = 1, samme tro, annet instansfrø.
      const C = vurderPar(s, sete, motpart, {
        ...felles,
        rng: lagRng(visningsfrø(s, sete, (SIK_FRØ ^ 0x5bf0_3635) >>> 0)),
        trovekt,
        budvekt: false,
      });
      // Speken uten troen, så tallene henger sammen med `troledd.md`.
      const B = vurderPar(s, sete, motpart, { ...felles, rng: frøFor(), budvekt: true });

      if (armer.size === TEMPS.length && C !== null && B !== null) {
        const nettKort = (() => {
          const h = indre[sete]!.velgHandling(s);
          return h.type === "SPILL" ? h.kort : null;
        })();
        const regret = (kort: Kort, lagmål: boolean): number | null => {
          const m = lagmål ? fasit.lag : fasit.diff;
          const v = slåOpp(m, kort);
          return v === null ? null : (lagmål ? fasit.bestLag : fasit.bestDiff) - v;
        };
        const rad: Record<string, unknown> = {
          r,
          sete,
          rolle: rolleFor(s, sete) ?? "ukjent",
          stikk: s.historikk.length,
          igjen,
          lovlige: lovligeKort(s, sete).length,
          spredning: Math.round(spredning! * 1000) / 1000,
        };
        const kortFor = new Map<string, Kort>();
        for (const [navn, par] of armer) {
          const k = bestEtterSnitt(par).kort;
          kortFor.set(navn, k);
          rad[`kort_${navn}`] = `${k.farge}${k.verdi}`;
          rad[`sig_${navn}`] = Math.round(par.sigma * 1000) / 1000;
          const rd = regret(k, false);
          const rl = regret(k, true);
          if (rd === null || rl === null) uoppslåtte++;
          else {
            rad[`reg_${navn}`] = Math.round(rd * 1000) / 1000;
            rad[`regL_${navn}`] = Math.round(rl * 1000) / 1000;
          }
          // Porten anvendt, som i `troledd.ts`: σ ≥ 0,5 lar søket overstyre.
          const spilt = par.sigma >= SIGMA_PORT ? k : (nettKort ?? k);
          const rs = regret(spilt, false);
          if (rs !== null) rad[`regSpilt_${navn}`] = Math.round(rs * 1000) / 1000;
        }
        for (const [navn, par] of [["C", C], ["B", B]] as const) {
          const k = bestEtterSnitt(par).kort;
          kortFor.set(navn, k);
          rad[`kort_${navn}`] = `${k.farge}${k.verdi}`;
          rad[`sig_${navn}`] = Math.round(par.sigma * 1000) / 1000;
          const rd = regret(k, false);
          const rl = regret(k, true);
          if (rd !== null) rad[`reg_${navn}`] = Math.round(rd * 1000) / 1000;
          if (rl !== null) rad[`regL_${navn}`] = Math.round(rl * 1000) / 1000;
        }
        // Skifter kortet mot støygulvet? Referansearmen er T = 1.
        const base = kortFor.get(`T${TEMPS[0]}`)!;
        rad.ulikAC = !likeKort(base, kortFor.get("C")!);
        for (const T of TEMPS.slice(1)) rad[`ulik_T${T}`] = !likeKort(base, kortFor.get(`T${T}`)!);
        skriv(rad);
        n++;
      }
    }
  }
  s = utfør(s, drivere[iTur]!.velgHandling(s)).state;
}

if (UT !== "" && rader.length > 0) appendFileSync(UT, rader.join("\n") + "\n");
console.log(
  `trotemp-anger: frø ${FRO}, ${r} runder, ${n} skillende stillinger (${flate} flate forkastet), ` +
    `uoppslåtte ${uoppslåtte}, ${((performance.now() - tStart) / 1000).toFixed(0)} s → ${UT === "" ? "(ingen fil)" : UT}`,
);
