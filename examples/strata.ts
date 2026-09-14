/**
 * STRATA — faller STØYGULVET av å TREKKE verdenene stratifisert i stedet for i.i.d.?
 *
 *   node examples/strata.ts --kamper 4 --runder 4 --fro 14000901 --merke w0 \
 *        --ut analyse/strata-w0.jsonl
 *
 * ============ HVA DENNE FILA MÅLER, OG HVORFOR IKKE K1 ====================
 *
 * `troledd.md` §3a målte at søkets valgte kort skifter i **43,8 %** av beslutningene
 * BARE av å trekke nye verdener med samme tro; `bandit.md` reproduserte 43,0 % på
 * andre giv. I stikk 0–3 er tallet 60,5 % — altså mest støy nøyaktig der `dekomp.md`
 * plasserer +0,49 av K1s +1,24, det eneste leddet med rom igjen.
 *
 * TRE GREP HAR ALLEREDE MÅLT NULL, OG DE HAR ÉN TING FELLES:
 *   flere verdener (12→192: gulvet 44,6 → 37,1 %), σ-porten (1,5 og 2,5), og
 *   adaptiv fordeling / sekvensiell halvering (−0,8 ± 1,1 pp).
 * Alle tre endret HVORDAN BUDSJETTET BRUKES. Ingen rørte hvordan verdenene TREKKES.
 * Det er leddet denne fila angriper: samme budsjett, samme antall verdener, samme
 * antall utspillinger — bare et jevnere utvalg fra nøyaktig samme fordeling.
 *
 * ============ PARRINGEN, PÅ TRE NIVÅER ====================================
 *
 * 1. SAMME STILLING. Alle fire armene vurderer nøyaktig samme `state` og sete.
 * 2. SAMME TO VERDENSFRØ. `I1` og `S1` deler instansfrø, `I2` og `S2` det andre.
 *    Støygulvet måles over de SAMME to trekningene i begge modusene, så en «heldig»
 *    stilling teller likt for begge.
 * 3. SAMME TRO OG SAMME BUDVEKT. `~mlbu=`-stien: trovekt på, budvekt av, som den
 *    utrullede boten.
 *
 *   I1  i.i.d. (dagens PIMC),   verdensfrø 1
 *   I2  i.i.d.,                 verdensfrø 2   → STØYGULV(i.i.d.) = I1 ≠ I2
 *   S1  stratifisert,           verdensfrø 1
 *   S2  stratifisert,           verdensfrø 2   → STØYGULV(strata) = S1 ≠ S2
 *
 * OG HER ER PARRINGEN SKARPERE ENN I `bandit.ts`: grenen er RNG-nøytral (ett
 * `rng()`-kall til utvelgelsen i begge modusene), så `I1` og `S1` bygger BIT-
 * IDENTISKE kandidatpooler. Bare hvilken kandidat som plukkes ut skiller dem.
 *
 * HYPOTESEN, FORHÅNDSREGISTRERT: **STØYGULV(strata) < STØYGULV(i.i.d.)**, målt over
 * ALLE beslutninger. Alt annet i denne fila er sekundært, og ingen sekundær rad skal
 * forfremmes til funn uten en egen forhåndsregistrert prøve av akkurat den armen.
 * Den ene undergruppa som er nevnt på forhånd — og bare nevnt, ikke lovet — er
 * stikk 0–3, fordi `dekomp.md` plasserer rommet der.
 *
 * ============ KOSTNADEN ER STRUKTURELT LÅST, OG MÅLES LIKEVEL =============
 *
 * `vurderPar` spiller ut verden-for-verden × kandidat-for-kandidat, så antall
 * utspillinger er EKSAKT `n × lovlige`. Begge tallene skrives per arm i hver rad, så
 * påstanden «samme antall utspillinger» kan etterprøves rad for rad i stedet for å
 * hvile på en kommentar. `ms` skrives også: stratifiseringen legger til én sortering
 * av 32 elementer per verden, og det er den eneste posten som ikke er gratis.
 *
 * ============ FASITEN, OG HVOR DEN IKKE GJELDER ==========================
 *
 * Regret felles med `poengRotVerdier` på den virkelige given, og BARE der fasiten
 * faktisk skiller: 88 % av sluttspillstillingene er flate (`troledd.md` §2), og å
 * telle dem ville fortynnet alt mot null. Kostnaden setter vinduet til ≤ 7 kort på
 * hånd (`troledd.md` §1: 8 kort er 2,6 s per kall, 9 kort er 16 s).
 *
 * ============ KLYNGEN =====================================================
 *
 * Hver rad bærer `kamp`. Beslutninger i samme kamp er ikke uavhengige, så SE-en i
 * `strata-sum.ts` er klynget der. Kjør derfor FLERE kamper per arbeider.
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, lovligeKort, type GameState } from "../src/motor.ts";
import { FARGER, lagRng, likeKort, type Kort } from "../src/kort.ts";
import { lagIndre, tall } from "../src/moe2/agentspek.ts";
import { vurderPar, type ParResultat } from "../src/moe2/sdpar.ts";
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
const KAMPER = tall(arg("--kamper", "4"), 4, "kamper");
const RUNDER = tall(arg("--runder", "4"), 4, "runder");
const FRO = tall(arg("--fro", "14000901"), 14_000_901, "fro");
const UT = arg("--ut", "");
const MERKE = arg("--merke", "w0");
/** Største antall kort på hånd der fasiten felles. Se kostnadstabellen i hodet. */
const FASITTAK = tall(arg("--fasittak", "7"), 7, "fasittak");

/** Den utrullede speken (iter-8-modellene), som i `troledd.ts` og `bandit.ts`. */
const HELBOT =
  "okt:vr:e1-modell/vrak-8.bin@e1-modell/etterlyst-8.bin:telrd:eks:3Lt2000:profil:" +
  "sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-8.bin:budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin";
/** Laget INNE i `sik:` — rollout-motpart og policyen porten lar stå. */
const INDRE = "budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin";

/** Sikkerorakelets standardfrø (`sikkerorakel.ts`), så `D` gir samme strøm som i boten. */
const SIK_FRØ = 20_260_804;
/** Det andre instansfrøet — samme tall `troledd.ts` brukte til arm C og `bandit.ts` til J2/H2. */
const SIK_FRØ_2 = (SIK_FRØ ^ 0x5bf0_3635) >>> 0;
const VERDENER = tall(arg("--verdener", "48"), 48, "verdener");
const KANDIDATER = tall(arg("--kandidater", "32"), 32, "kandidater");
const EKSAKT_BLAD = 3;
const SIGMA_PORT = 0.5;

// ===========================================================================
// FASITEN  (ordrett fra `examples/bandit.ts` / `troledd.ts` — samme rigg)
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
    for (let p = 0; p < s.antallSpillere; p++) {
      (sammeSide(s, sete, p) ? mine : deres).push(v.poeng[p] ?? 0);
    }
    const snitt = (x: number[]): number => (x.length === 0 ? 0 : x.reduce((a, b) => a + b, 0) / x.length);
    lag.set(v.kort, snitt(mine) - snitt(deres));
  }
  return { diff, lag, bestDiff: Math.max(...diff.values()), bestLag: Math.max(...lag.values()) };
}

/** Ekvivalensklasser: `poengRotVerdier` gir én representant per klasse. */
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
const indre = [0, 1, 2, 3].map(() => lagIndre(INDRE));

const alleSer = (s: GameState): void => {
  for (const a of [...drivere, ...indre]) (a as { observer?(x: GameState): void }).observer?.(s);
  tro.observer(s);
};

if (UT !== "") mkdirSync(dirname(UT), { recursive: true });
const rader: string[] = [];
const skriv = (o: unknown): void => {
  if (UT === "") return;
  rader.push(JSON.stringify(o));
  // TIL DISK UNDERVEIS: en flertimers måling som bare finnes i stdout er ingen måling.
  if (rader.length >= 50) {
    appendFileSync(UT, rader.join("\n") + "\n");
    rader.length = 0;
  }
};

const navn = (k: Kort): string => `${k.farge}${k.verdi}`;

// ===========================================================================
// LØKKA
// ===========================================================================

let radNr = 0;
let ulikI = 0;
let ulikS = 0;
const tStart = performance.now();

for (let kamp = 0; kamp < KAMPER; kamp++) {
  // EGEN KAMP = EGEN KLYNGE. Nytt giv-frø og ny bok i alle lagene.
  const kampFrø = (FRO + kamp * 1_000_003) >>> 0;
  for (const a of [...drivere, ...indre]) a.nyKamp();
  tro.nyKamp();

  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, kampFrø);
  let vakt = 0;
  let r = 0;

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
      const antLovlige = lovligeKort(s, sete).length;
      const motpart = indre[sete]! as unknown as Utspiller;
      const trovekt = tro.vektFor(s, sete) ?? undefined;
      const felles = {
        verdener: VERDENER,
        verdenKandidater: KANDIDATER,
        verdenKombi: "snitt" as const,
        eksaktBlad: EKSAKT_BLAD,
        mål: lagMål,
        trovekt,
        budvekt: false,
      };
      /** Fersk strøm hver gang: `rng` forbrukes, så de fire armene må ha hvert sitt objekt. */
      const strøm = (frø: number): (() => number) => lagRng(visningsfrø(s, sete, frø));
      const mål4 = (o: Parameters<typeof vurderPar>[3]): [ParResultat | null, number] => {
        const t0 = performance.now();
        const p = vurderPar(s, sete, motpart, o);
        return [p, performance.now() - t0];
      };

      const [I1, msI1] = mål4({ ...felles, rng: strøm(SIK_FRØ) });
      const [I2, msI2] = mål4({ ...felles, rng: strøm(SIK_FRØ_2) });
      const [S1, msS1] = mål4({ ...felles, rng: strøm(SIK_FRØ), trekk: "strata" });
      const [S2, msS2] = mål4({ ...felles, rng: strøm(SIK_FRØ_2), trekk: "strata" });

      if (I1 !== null && I2 !== null && S1 !== null && S2 !== null) {
        const nettKort = ((): Kort | null => {
          const h = indre[sete]!.velgHandling(s);
          return h.type === "SPILL" ? h.kort : null;
        })();
        const igjen = s.hender[sete]?.length ?? 0;
        const rolle = rolleFor(s, sete) ?? "ukjent";
        const stikk = s.historikk.length;
        const fasit = igjen > 0 && igjen <= FASITTAK ? lagFasit(s, sete) : null;

        // Porten: σ ≥ 0,5 lar søket overstyre, ellers står nettets kort.
        const spilt = (p: ParResultat): Kort =>
          p.sigma >= SIGMA_PORT ? p.beste.kort : (nettKort ?? p.beste.kort);

        const uI = !likeKort(I1.beste.kort, I2.beste.kort);
        const uS = !likeKort(S1.beste.kort, S2.beste.kort);
        if (uI) ulikI++;
        if (uS) ulikS++;

        const spredning = fasit === null ? null : fasit.bestDiff - Math.min(...fasit.diff.values());
        const skiller = spredning !== null && spredning > 1e-9;

        const rad: Record<string, unknown> = {
          kamp: `${MERKE}-${kamp}`,
          r,
          sete,
          rolle,
          stikk,
          igjen,
          lovlige: antLovlige,
          // STØYGULVET, ett tall per modus, målt over de SAMME to verdensfrøene.
          ulikI: uI,
          ulikS: uS,
          ulikSpiltI: !likeKort(spilt(I1), spilt(I2)),
          ulikSpiltS: !likeKort(spilt(S1), spilt(S2)),
          // BUDSJETTET. `vurderPar` spiller ut n × lovlige, så utspillingene er
          // EKSAKT dette produktet — påstanden er etterprøvbar rad for rad.
          nI1: I1.n,
          nI2: I2.n,
          nS1: S1.n,
          nS2: S2.n,
          utspI: (I1.n + I2.n) * antLovlige,
          utspS: (S1.n + S2.n) * antLovlige,
          msI: msI1 + msI2,
          msS: msS1 + msS2,
          sigI1: Math.round(I1.sigma * 1000) / 1000,
          sigS1: Math.round(S1.sigma * 1000) / 1000,
          kortI1: navn(I1.beste.kort),
          kortI2: navn(I2.beste.kort),
          kortS1: navn(S1.beste.kort),
          kortS2: navn(S2.beste.kort),
          // Biter knotten i det hele tatt? Samme frø, ulik modus.
          ulikModus: !likeKort(I1.beste.kort, S1.beste.kort),
          spredning: spredning === null ? null : Math.round(spredning * 1000) / 1000,
        };

        if (fasit !== null && skiller) {
          const regret = (kort: Kort, lagmål: boolean): number | null => {
            const m = lagmål ? fasit.lag : fasit.diff;
            const v = slåOpp(m, kort);
            if (v === null) return null;
            return (lagmål ? fasit.bestLag : fasit.bestDiff) - v;
          };
          for (const [merke, p] of [
            ["I1", I1],
            ["I2", I2],
            ["S1", S1],
            ["S2", S2],
          ] as const) {
            const rd = regret(p.beste.kort, false);
            const rl = regret(p.beste.kort, true);
            if (rd !== null) rad[`reg_${merke}`] = Math.round(rd * 1000) / 1000;
            if (rl !== null) rad[`regl_${merke}`] = Math.round(rl * 1000) / 1000;
          }
        }
        skriv(rad);
        radNr++;
        if (radNr % 25 === 0) {
          const sek = (performance.now() - tStart) / 1000;
          console.log(
            `[${MERKE}] kamp ${kamp} runde ${r}: ${radNr} beslutninger, ${sek.toFixed(0)} s, ` +
              `gulv iid ${((100 * ulikI) / radNr).toFixed(1)} % mot strata ${((100 * ulikS) / radNr).toFixed(1)} %`,
          );
        }
      }
    }

    s = utfør(s, drivere[iTur]!.velgHandling(s)).state;
  }
}

if (UT !== "" && rader.length > 0) appendFileSync(UT, rader.join("\n") + "\n");

const sek = (performance.now() - tStart) / 1000;
console.log(
  `\n[${MERKE}] FERDIG: ${radNr} beslutninger, ${KAMPER} kamper à ${RUNDER} runder, ${sek.toFixed(0)} s.\n` +
    `  STØYGULV iid ${((100 * ulikI) / Math.max(1, radNr)).toFixed(1)} %  ` +
    `strata ${((100 * ulikS) / Math.max(1, radNr)).toFixed(1)} %  (rå tall — dommen felles i strata-sum.ts)`,
);
