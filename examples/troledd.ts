/**
 * TROLEDDET — endrer troen kortvalget, og blir valget BEDRE?
 *
 *   node examples/troledd.ts --runder 10 --fro 13000777 --ut analyse/troledd-s0.jsonl
 *
 * ============ HVA DENNE FILA MÅLER, OG HVORFOR DEN MÅTTE SKRIVES ==========
 *
 * Troen gjør VERDENENE målbart bedre (+5,88 ± 0,07 pp riktig plasserte kort).
 * Den gjør ikke K1 bedre (frosset trohode: +1,02 ± 0,20 mot +1,01 med trening).
 * Mellom de to tallene ligger et ledd ingen har målt: fra bedre verdener til
 * bedre KORTVALG. Denne fila måler nettopp det leddet.
 *
 * ============ PARRINGEN ER HELE POENGET ==================================
 *
 * Arm A og arm B evalueres på NØYAKTIG samme stilling med NØYAKTIG samme
 * RNG-strøm (`lagRng(visningsfrø(state, sete, FRØ))`, som `D` i speken gir).
 * Da trekker `trekkVerdenBelief` de SAMME kandidatverdenene i begge armene —
 * bare VEKTEN over dem er ulik. Det er den reneste formen av spørsmålet:
 * troen flytter sannsynlighetsmasse mellom verdener, og endrer det kortet?
 *
 *   A  «~mlbu= PÅ»   trovekt fra MLB-trohodet, budvekt AV (`mlbu` slår den av,
 *                    agentspek.ts:1280) — den utrullede boten
 *   B  «~mlbu= AV»   ingen trovekt, budvekt PÅ — speken uten troen
 *
 * Begge armene har `verdener 48`, `k32`, `e3` og lagmålet, som den utrullede
 * speken. `M` (hukommelsen per motstandersete) er UTELATT i begge: den krever
 * en økt som fylles av `Profilagent` under spill, og en halvfylt økt ville
 * gjort armene ulike i noe annet enn troen. Koblingssjekken har målt `okt:`
 * til å endre 0,4 % av valgene, så prisen er lav og parringen er verdt mer.
 *
 * ============ FASITEN ER IKKE SØKETS EGEN VERDI ===========================
 *
 * Søkets verdi er selve det mistenkte. Dommen felles derfor med
 * `poengRotVerdier` (`solver/poengdds.ts`) på DEN VIRKELIGE GIVEN: eksakt
 * bakoverinduksjon der hvert sete maksimerer egne poeng. Les løsningsbegrepet
 * i hodet på den fila — det er en delspillperfekt likevekt, ikke et minimax.
 *
 * KOSTNADEN SETTER VINDUET. Målt i `troledd-kostnad.ts` (median ms per kall):
 *
 *     5 kort igjen   0,4      7 kort igjen    111       9 kort igjen  15 900
 *     6 kort igjen  14,2      8 kort igjen  2 609      (maks 178 000)
 *
 * Fasiten felles derfor bare ved **≤ 7 kort igjen**. Det er ikke en
 * innskrenkning av spørsmålet: likelihood-gevinsten er målt til +3,83 pp
 * nettopp SENT i runden, så vinduet dekker der troen er skarpest. Andelen
 * ENDREDE kortvalg telles i hele runden, den er gratis.
 *
 * TO REGRET-MÅL FRA SAMME LØSNING. `poengRotVerdier` gir hele poengvektoren
 * per kandidat, så både `diff` (egne minus snittet av de tre andre —
 * `standardMål`, benkens mål) og LAGMÅLET (egen side mot den andre — det `L`
 * i speken faktisk optimerer) regnes ut av det samme kallet. Likevektslinja er
 * løst under `diff`; det står som forbehold, ikke som en detalj.
 *
 * ============ TO NIVÅER AV «VALGT KORT» ==================================
 *
 * Søkets argmax er ikke det boten spiller. Porten (σ ≥ 0,5) lar nettets valg
 * stå når marginen er utydelig, og `eks:3Lt2000` ligger UTENFOR `sik:` og kan
 * skrive om kortet i de tre siste stikkene. Begge nivåene telles:
 *
 *   argmax   `par.beste` — det søket mener er best
 *   spilt    porten anvendt: σ ≥ 0,5 ? argmax : nettets eget kort
 *
 * ============ KRITERIENE ER GRATIS =======================================
 *
 * `snitt`, `min`, `kvantil` og `flest` rangerer alle på `perVerden`, som
 * `vurderPar` ALLEREDE har regnet ut. Alle fire leses derfor ut av det samme
 * kallet, uten én ekstra utspilling. Det er punkt 2 i oppdraget til
 * kostnaden av punkt 1.
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
import { kortTilInt, intTilKort } from "../src/solver/dds.ts";
import { poengRotVerdier } from "../src/solver/poengdds.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const RUNDER = tall(arg("--runder", "10"), 10, "runder");
const FRO = tall(arg("--fro", "13000777"), 13_000_777, "fro");
const UT = arg("--ut", "");
/** Største antall kort på hånd der fasiten felles. Se kostnadstabellen i hodet. */
const FASITTAK = tall(arg("--fasittak", "7"), 7, "fasittak");

/** Den utrullede speken (iter-8-modellene). */
const HELBOT =
  "okt:vr:e1-modell/vrak-8.bin@e1-modell/etterlyst-8.bin:telrd:eks:3Lt2000:profil:" +
  "sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-8.bin:budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin";
/** Laget INNE i `sik:` — rollout-motpart og policyen porten lar stå. */
const INDRE = "budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin";

/** Sikkerorakelets standardfrø (`sikkerorakel.ts:275`), så `D` gir samme strøm som i boten. */
const SIK_FRØ = 20_260_804;
/**
 * VERDENER SOM AKSE (13. sep). Støygulvet — hvor ofte argmaks skifter kort når BARE
 * verdenstrekket endres — er hele funnet i denne fila, og det gulvet er en funksjon av
 * hvor mange verdener som midles. Derfor er tallet en knott og ikke en konstant: uten
 * den kan ingen si om flere verdener gjør troen synlig i kortet.
 */
const VERDENER = tall(arg("--verdener", "48"), 48, "verdener");
const KANDIDATER = tall(arg("--kandidater", "32"), 32, "kandidater");
const EKSAKT_BLAD = 3;
const SIGMA_PORT = 0.5;

type Krit = "snitt" | "min" | "kvantil" | "flest";
const KRITERIER: readonly Krit[] = ["snitt", "min", "kvantil", "flest"];

/**
 * Rangeringen fra `sdpar.ts:335-355`, ordrett. Ligger her og ikke importert fordi
 * `vurderPar` bare returnerer den ferdige `beste` for ETT kriterium — vi trenger
 * alle fire ut av det samme kallet.
 */
function velgEtter(par: ParResultat, krit: Krit): ParKandidat {
  const kand = par.kandidater;
  const rang = new Map<ParKandidat, number>();
  if (krit === "flest") {
    for (const k of kand) rang.set(k, 0);
    for (let w = 0; w < par.n; w++) {
      let best = -Infinity;
      for (const k of kand) if (k.perVerden[w]! > best) best = k.perVerden[w]!;
      const vinnere = kand.filter((k) => k.perVerden[w]! >= best - 1e-9);
      for (const k of vinnere) rang.set(k, rang.get(k)! + 1 / vinnere.length);
    }
  } else {
    for (const k of kand) {
      if (krit === "snitt") {
        rang.set(k, k.snitt);
        continue;
      }
      const v = [...k.perVerden].sort((a, b) => a - b);
      rang.set(k, krit === "min" ? v[0]! : v[Math.floor(0.25 * (v.length - 1))]!);
    }
  }
  return kand.slice().sort((a, b) => rang.get(b)! - rang.get(a)!)[0]!;
}

// ===========================================================================
// FASITEN
// ===========================================================================

interface Fasit {
  /** kort-int → utfall for setet i tur, begge mål. */
  readonly diff: Map<number, number>;
  readonly lag: Map<number, number>;
  readonly bestDiff: number;
  readonly bestLag: number;
}

/** Er `p` på samme side som `sete`? Budvinner + makker mot de to andre. */
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
    // LAGMÅLET fra samme poengvektor: egen sides snitt minus den andres.
    const mine: number[] = [];
    const deres: number[] = [];
    for (let p = 0; p < s.antallSpillere; p++) {
      (sammeSide(s, sete, p) ? mine : deres).push(v.poeng[p] ?? 0);
    }
    const snitt = (x: number[]): number => (x.length === 0 ? 0 : x.reduce((a, b) => a + b, 0) / x.length);
    lag.set(v.kort, snitt(mine) - snitt(deres));
  }
  return {
    diff,
    lag,
    bestDiff: Math.max(...diff.values()),
    bestLag: Math.max(...lag.values()),
  };
}

/**
 * EKVIVALENSKLASSER. `poengRotVerdier` gir én representant per klasse — den
 * HØYESTE i en sammenhengende rekke av egne kort blant kortene som ennå er i
 * spill (`dds.ts:296`). Et valgt kort som ikke selv er representant hører til
 * klassen med den nærmeste representanten OVER seg i samme farge.
 */
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

// ===========================================================================
// OPPSETT
// ===========================================================================

const tronett = MlbTronett.fraBytes(readFileSync("e1-modell/tro-8.bin"));
const tro = new MlbSøketro(tronett);

const drivere = [0, 1, 2, 3].map(() => lagIndre(HELBOT));
/** Rollout-motpart OG policyen porten lar stå — samme objekt, som i `sik:`. */
const indre = [0, 1, 2, 3].map(() => lagIndre(INDRE));
for (const a of [...drivere, ...indre]) a.nyKamp();
tro.nyKamp();

const alleSer = (s: GameState): void => {
  for (const a of [...drivere, ...indre]) (a as { observer?(x: GameState): void }).observer?.(s);
  tro.observer(s);
};

if (UT !== "") mkdirSync(dirname(UT), { recursive: true });

// ===========================================================================
// TELLERE
// ===========================================================================

interface Boks {
  n: number;
  ulikArgmax: number;
  ulikSpilt: number;
  /** STØYGULVET: A mot C — samme tro, bare et annet verdenstrekk. */
  ulikAC: number;
  /** Stillinger i fasitvinduet der ALLE lovlige kort har samme eksakte verdi. */
  flate: number;
  /** Sum av regret (fasit) per kriterium og arm, over rader med fasit. */
  sumRegret: Map<string, number>;
  sumRegretLag: Map<string, number>;
  nFasit: number;
  /** Blant radene der A og B er ULIKE på argmax: sum regret for hver. */
  nUlikFasit: number;
  sumUlikA: number;
  sumUlikB: number;
  sumUlikALag: number;
  sumUlikBLag: number;
  /** Kvadratsummer for SE på den parrede differansen A−B. */
  sumDiffAB: number;
  sumDiffAB2: number;
  nDiffAB: number;
}
const nyBoks = (): Boks => ({
  n: 0,
  ulikArgmax: 0,
  ulikSpilt: 0,
  ulikAC: 0,
  flate: 0,
  sumRegret: new Map(),
  sumRegretLag: new Map(),
  nFasit: 0,
  nUlikFasit: 0,
  sumUlikA: 0,
  sumUlikB: 0,
  sumUlikALag: 0,
  sumUlikBLag: 0,
  sumDiffAB: 0,
  sumDiffAB2: 0,
  nDiffAB: 0,
});
const total = nyBoks();
const perRolle = new Map<string, Boks>();
const perStikk = new Map<number, Boks>();
const bokser = (rolle: string, stikk: number): Boks[] => {
  if (!perRolle.has(rolle)) perRolle.set(rolle, nyBoks());
  if (!perStikk.has(stikk)) perStikk.set(stikk, nyBoks());
  return [total, perRolle.get(rolle)!, perStikk.get(stikk)!];
};
const legg = (m: Map<string, number>, k: string, v: number): void => m.set(k, (m.get(k) ?? 0) + v);

let uoppslåtte = 0;
let radNr = 0;
const rader: string[] = [];
const skriv = (o: unknown): void => {
  if (UT === "") return;
  rader.push(JSON.stringify(o));
  if (rader.length >= 200) {
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
    const motpart = indre[sete]! as unknown as Utspiller;
    const felles = {
      verdener: VERDENER,
      verdenKandidater: KANDIDATER,
      verdenKombi: "snitt" as const,
      eksaktBlad: EKSAKT_BLAD,
      mål: lagMål,
    };
    // SAMME frø i begge armene: kandidatverdenene er identiske, bare vekten skiller.
    const frøFor = (): (() => number) => lagRng(visningsfrø(s, sete, SIK_FRØ));
    const trovekt = tro.vektFor(s, sete) ?? undefined;

    const A = vurderPar(s, sete, motpart, { ...felles, rng: frøFor(), trovekt, budvekt: false });
    const B = vurderPar(s, sete, motpart, { ...felles, rng: frøFor(), budvekt: true });
    /**
     * STØYGULVET (arm C). Uten det kan ikke tallet i punkt 1 leses.
     *
     * C er arm A i ETT og alt — samme tro, samme budvekt, samme kriterium — bortsett
     * fra at verdenene trekkes fra et ANNET instansfrø. Andelen der A og C er uenige
     * om beste kort er derfor ren samplingsstøy: det er hvor ofte søket skifter mening
     * uten at noe informasjonsbærende er endret.
     *
     * `sd-stoy.ts` målte nøyaktig denne størrelsen til 92,5 % ved 12 verdener
     * (signal/støy 0,27). Er A-mot-B av samme størrelsesorden som A-mot-C, måler
     * «troen endret kortet» ingenting annet enn at argmax over 48 støyete anslag er
     * ustabil — og da kan en bedre verdensfordeling ikke nå fram til kortet.
     */
    const C = vurderPar(s, sete, motpart, {
      ...felles,
      rng: lagRng(visningsfrø(s, sete, (SIK_FRØ ^ 0x5bf0_3635) >>> 0)),
      trovekt,
      budvekt: false,
    });

    if (A !== null && B !== null && C !== null) {
      const nettKort = (() => {
        const h = indre[sete]!.velgHandling(s);
        return h.type === "SPILL" ? h.kort : null;
      })();
      const igjen = s.hender[sete]?.length ?? 0;
      const rolle = rolleFor(s, sete) ?? "ukjent";
      const stikk = s.historikk.length;
      const fasit = igjen > 0 && igjen <= FASITTAK ? lagFasit(s, sete) : null;

      const valg: Record<string, Kort> = {};
      for (const k of KRITERIER) {
        valg[`A_${k}`] = velgEtter(A, k).kort;
        valg[`B_${k}`] = velgEtter(B, k).kort;
      }
      // Porten: σ ≥ 0,5 lar søket overstyre, ellers står nettets kort.
      const spiltA = A.sigma >= SIGMA_PORT ? valg.A_snitt! : (nettKort ?? valg.A_snitt!);
      const spiltB = B.sigma >= SIGMA_PORT ? valg.B_snitt! : (nettKort ?? valg.B_snitt!);

      const cSnitt = velgEtter(C, "snitt").kort;
      const ulikArgmax = !likeKort(valg.A_snitt!, valg.B_snitt!);
      const ulikSpilt = !likeKort(spiltA, spiltB);
      /** Støygulvet: samme tro, annet verdenstrekk. */
      const ulikAC = !likeKort(valg.A_snitt!, cSnitt);

      /**
       * ER FASITEN I DET HELE TATT UENIG MED SEG SELV HER?
       *
       * Målt i `troledd-fasitspredning.ts`: 37 av 42 stillinger i vinduet har
       * spredning 0 — kontrakten er alt avgjort, og hvert lovlig kort gir samme
       * rundepoeng. En slik stilling kan ikke skille en god arm fra en dårlig, og
       * å telle den som «begge traff» ville fortynnet tallet mot null uansett hva
       * armene gjorde. Regret regnes derfor BARE der fasiten har en mening, og
       * antallet flate rapporteres ved siden av.
       */
      const spredning =
        fasit === null ? null : fasit.bestDiff - Math.min(...fasit.diff.values());
      const skiller = spredning !== null && spredning > 1e-9;

      for (const b of bokser(rolle, stikk)) {
        b.n++;
        if (ulikArgmax) b.ulikArgmax++;
        if (ulikSpilt) b.ulikSpilt++;
        if (ulikAC) b.ulikAC++;
        if (fasit !== null && !skiller) b.flate++;
      }

      const rad: Record<string, unknown> = {
        r,
        sete,
        rolle,
        stikk,
        igjen,
        nA: A.n,
        nB: B.n,
        sigA: Math.round(A.sigma * 1000) / 1000,
        sigB: Math.round(B.sigma * 1000) / 1000,
        ulikArgmax,
        ulikSpilt,
        ulikAC,
        C_snitt: `${cSnitt.farge}${cSnitt.verdi}`,
        spredning: spredning === null ? null : Math.round(spredning * 1000) / 1000,
        lovlige: lovligeKort(s, sete).length,
      };
      for (const [k, v] of Object.entries(valg)) rad[k] = `${v.farge}${v.verdi}`;

      if (fasit !== null && skiller) {
        const regret = (kort: Kort, lagmål: boolean): number | null => {
          const m = lagmål ? fasit.lag : fasit.diff;
          const v = slåOpp(m, kort);
          if (v === null) return null;
          return (lagmål ? fasit.bestLag : fasit.bestDiff) - v;
        };
        for (const b of bokser(rolle, stikk)) b.nFasit++;
        for (const k of KRITERIER) {
          for (const arm of ["A", "B"] as const) {
            const rd = regret(valg[`${arm}_${k}`]!, false);
            const rl = regret(valg[`${arm}_${k}`]!, true);
            if (rd === null || rl === null) {
              uoppslåtte++;
              continue;
            }
            rad[`reg_${arm}_${k}`] = Math.round(rd * 1000) / 1000;
            for (const b of bokser(rolle, stikk)) {
              legg(b.sumRegret, `${arm}_${k}`, rd);
              legg(b.sumRegretLag, `${arm}_${k}`, rl);
            }
          }
        }
        // Den parrede differansen A−B på SNITT-kriteriet: hovedtallet.
        const ra = regret(valg.A_snitt!, false);
        const rb = regret(valg.B_snitt!, false);
        if (ra !== null && rb !== null) {
          const d = rb - ra; // positiv = A (troen) er BEDRE
          for (const b of bokser(rolle, stikk)) {
            b.sumDiffAB += d;
            b.sumDiffAB2 += d * d;
            b.nDiffAB++;
          }
          if (ulikArgmax) {
            const la = regret(valg.A_snitt!, true)!;
            const lb = regret(valg.B_snitt!, true)!;
            for (const b of bokser(rolle, stikk)) {
              b.nUlikFasit++;
              b.sumUlikA += ra;
              b.sumUlikB += rb;
              b.sumUlikALag += la;
              b.sumUlikBLag += lb;
            }
          }
        }
      }
      skriv(rad);
      radNr++;
    }
  }

  s = utfør(s, drivere[iTur]!.velgHandling(s)).state;
}

if (UT !== "" && rader.length > 0) appendFileSync(UT, rader.join("\n") + "\n");

// ===========================================================================
// RAPPORT
// ===========================================================================

const pct = (a: number, b: number): string => (b === 0 ? "  –  " : `${((100 * a) / b).toFixed(2)}%`);
console.log(`\n=== TROLEDDET — frø ${FRO}, ${r} runder, ${radNr} beslutninger ===`);
console.log(`(${((performance.now() - tStart) / 1000).toFixed(0)} s, uoppslåtte kort: ${uoppslåtte})\n`);

console.log("1. ENDRER TROEN KORTVALGET?  (STOEYGULV = samme tro, annet verdenstrekk)");
console.log("gruppe          |     n | ulik argmax | ulik spilt | STOEYGULV A-C");
console.log("-".repeat(72));
const visUlik = (navn: string, b: Boks): void =>
  console.log(
    `${navn.padEnd(15)} | ${String(b.n).padStart(5)} | ${pct(b.ulikArgmax, b.n).padStart(11)} | ${pct(b.ulikSpilt, b.n).padStart(10)} | ${pct(b.ulikAC, b.n).padStart(13)}`,
  );
visUlik("ALLE", total);
for (const [rolle, b] of [...perRolle.entries()].sort()) visUlik(`  ${rolle}`, b);
for (const [stikk, b] of [...perStikk.entries()].sort((a, c) => a[0] - c[0])) visUlik(`  stikk ${stikk}`, b);

console.log("\n2. ER ENDRINGENE BEDRE? (fasit: poengdds paa den virkelige given)");
console.log("Regret = fasitens beste minus valgt. LAVERE er bedre.\n");
console.log("kriterium |  arm | snitt regret (diff) | snitt regret (lag)");
console.log("-".repeat(62));
for (const k of KRITERIER) {
  for (const arm of ["A", "B"] as const) {
    const sd = total.sumRegret.get(`${arm}_${k}`) ?? 0;
    const sl = total.sumRegretLag.get(`${arm}_${k}`) ?? 0;
    const merke = arm === "A" ? "tro" : "uten";
    console.log(
      `${k.padEnd(9)} | ${merke.padEnd(4)} | ${(sd / Math.max(1, total.nFasit)).toFixed(4).padStart(19)} | ${(sl / Math.max(1, total.nFasit)).toFixed(4).padStart(18)}`,
    );
  }
}
console.log(
  `\n(n med SKILLENDE fasit = ${total.nFasit}; flate stillinger forkastet = ${total.flate})`,
);

console.log("\n3. DEN PARREDE DIFFERANSEN A-B (snitt-kriteriet, diff-maalet)");
console.log("Positiv = troen velger et BEDRE kort.\n");
const visDiff = (navn: string, b: Boks): void => {
  if (b.nDiffAB < 2) return;
  const m = b.sumDiffAB / b.nDiffAB;
  const varians = (b.sumDiffAB2 - b.nDiffAB * m * m) / (b.nDiffAB - 1);
  const se = Math.sqrt(Math.max(0, varians) / b.nDiffAB);
  console.log(
    `${navn.padEnd(15)} | n=${String(b.nDiffAB).padStart(5)} | ${m >= 0 ? "+" : ""}${m.toFixed(4)} +/- ${se.toFixed(4)}  (z=${(m / (se || 1)).toFixed(2)})`,
  );
};
visDiff("ALLE", total);
for (const [rolle, b] of [...perRolle.entries()].sort()) visDiff(`  ${rolle}`, b);

console.log("\n4. BARE DER ARMENE VALGTE ULIKT KORT");
const visUlikFasit = (navn: string, b: Boks): void => {
  if (b.nUlikFasit === 0) return;
  console.log(
    `${navn.padEnd(15)} | n=${String(b.nUlikFasit).padStart(4)} | tro ${(b.sumUlikA / b.nUlikFasit).toFixed(4)} mot uten ${(b.sumUlikB / b.nUlikFasit).toFixed(4)} (diff) | ` +
      `tro ${(b.sumUlikALag / b.nUlikFasit).toFixed(4)} mot uten ${(b.sumUlikBLag / b.nUlikFasit).toFixed(4)} (lag)`,
  );
};
visUlikFasit("ALLE", total);
for (const [rolle, b] of [...perRolle.entries()].sort()) visUlikFasit(`  ${rolle}`, b);
