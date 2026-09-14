/**
 * BANDITTEN — faller STØYGULVET av å fordele budsjettet adaptivt?
 *
 *   node examples/bandit.ts --kamper 4 --runder 4 --fro 14000901 --merke w0 \
 *        --ut analyse/bandit-w0.jsonl
 *
 * ============ HVA DENNE FILA MÅLER, OG HVORFOR IKKE K1 ====================
 *
 * `D:\amb-grp\loop\troledd.md` §3a målte at søkets valgte kort skifter i **43,8 %**
 * av beslutningene BARE av å trekke nye verdener med samme tro. Troens egen netto
 * virkning er +2,7 pp over det gulvet — under 6 % av endringene bærer informasjon.
 * Syv forsøk på å fikse det med bedre INFORMASJON har alle målt null, og 16× flere
 * verdener kjøper bare 7,5 pp lavere gulv til 4× søketid.
 *
 * Det er et VARIANSPROBLEM i argmaks. Denne fila måler om sekvensiell halvering
 * (`fordeling: "halv"`) senker nøyaktig det gulvet — på minutter i stedet for de
 * 2,5 timene per arm en K1-måling koster.
 *
 * ============ PARRINGEN, PÅ TRE NIVÅER ====================================
 *
 * 1. SAMME STILLING. Alle fire armene vurderer nøyaktig samme `state` og sete.
 * 2. SAMME TO VERDENSFRØ. `J1` og `H1` deler instansfrø, `J2` og `H2` deler det
 *    andre. Støygulvet er da målt over de SAMME to trekningene i begge fordelingene,
 *    så en «heldig» stilling teller likt for begge.
 * 3. SAMME TRO OG SAMME BUDVEKT. `~mlbu=`-stien: trovekt på, budvekt av, som den
 *    utrullede boten.
 *
 *   J1  jevn fordeling (dagens PIMC), verdensfrø 1
 *   J2  jevn fordeling,               verdensfrø 2   → STØYGULV(jevn)  = J1 ≠ J2
 *   H1  sekvensiell halvering,        verdensfrø 1
 *   H2  sekvensiell halvering,        verdensfrø 2   → STØYGULV(halv)  = H1 ≠ H2
 *
 * HYPOTESEN, FORHÅNDSREGISTRERT: STØYGULV(halv) < STØYGULV(jevn). Alt annet er
 * sekundært, og ingen av de sekundære tallene skal forfremmes til funn uten en
 * egen forhåndsregistrert prøve av akkurat den armen.
 *
 * ============ KOSTNADEN MÅLES, DEN ANTAS IKKE ============================
 *
 * `ParResultat.utspillinger` skrives ut per arm i hver rad. Påstanden «samme antall
 * utspillinger» er dermed etterprøvbar rad for rad i stedet for hevdet i en
 * kommentar. `ms` per arm skrives også: utspillingene er like mange, men halveringen
 * trekker FLERE verdener (finalistene ender på ~2K), og trekning er ikke gratis.
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
 * `bandit-sum.ts` er klynget der. Kjør derfor FLERE kamper per arbeider — én kamp
 * per arbeider gir like mange klynger som arbeidere, og det er for få.
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

/** Den utrullede speken (iter-8-modellene), som i `troledd.ts`. */
const HELBOT =
  "okt:vr:e1-modell/vrak-8.bin@e1-modell/etterlyst-8.bin:telrd:eks:3Lt2000:profil:" +
  "sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-8.bin:budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin";
/** Laget INNE i `sik:` — rollout-motpart og policyen porten lar stå. */
const INDRE = "budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin";

/** Sikkerorakelets standardfrø (`sikkerorakel.ts`), så `D` gir samme strøm som i boten. */
const SIK_FRØ = 20_260_804;
/** Det andre instansfrøet — samme tall som `troledd.ts` brukte til arm C. */
const SIK_FRØ_2 = (SIK_FRØ ^ 0x5bf0_3635) >>> 0;
const VERDENER = tall(arg("--verdener", "48"), 48, "verdener");
const KANDIDATER = tall(arg("--kandidater", "32"), 32, "kandidater");
const EKSAKT_BLAD = 3;
const SIGMA_PORT = 0.5;

// ===========================================================================
// FASITEN  (ordrett fra `examples/troledd.ts` — samme rigg, som oppdraget ba om)
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
let ulikJ = 0;
let ulikH = 0;
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

      const [J1, msJ1] = mål4({ ...felles, rng: strøm(SIK_FRØ) });
      const [J2, msJ2] = mål4({ ...felles, rng: strøm(SIK_FRØ_2) });
      const [H1, msH1] = mål4({ ...felles, rng: strøm(SIK_FRØ), fordeling: "halv" });
      const [H2, msH2] = mål4({ ...felles, rng: strøm(SIK_FRØ_2), fordeling: "halv" });

      if (J1 !== null && J2 !== null && H1 !== null && H2 !== null) {
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

        const uJ = !likeKort(J1.beste.kort, J2.beste.kort);
        const uH = !likeKort(H1.beste.kort, H2.beste.kort);
        if (uJ) ulikJ++;
        if (uH) ulikH++;

        const spredning = fasit === null ? null : fasit.bestDiff - Math.min(...fasit.diff.values());
        const skiller = spredning !== null && spredning > 1e-9;

        const rad: Record<string, unknown> = {
          kamp: `${MERKE}-${kamp}`,
          r,
          sete,
          rolle,
          stikk,
          igjen,
          lovlige: lovligeKort(s, sete).length,
          // STØYGULVET, ett tall per fordeling, målt over de SAMME to verdensfrøene.
          ulikJ: uJ,
          ulikH: uH,
          ulikSpiltJ: !likeKort(spilt(J1), spilt(J2)),
          ulikSpiltH: !likeKort(spilt(H1), spilt(H2)),
          // BUDSJETTET: påstanden «samme antall utspillinger» skal kunne etterprøves.
          utspJ1: J1.utspillinger,
          utspJ2: J2.utspillinger,
          utspH1: H1.utspillinger,
          utspH2: H2.utspillinger,
          nJ1: J1.n,
          nH1: H1.n,
          msJ: msJ1 + msJ2,
          msH: msH1 + msH2,
          sigJ1: Math.round(J1.sigma * 1000) / 1000,
          sigH1: Math.round(H1.sigma * 1000) / 1000,
          kortJ1: navn(J1.beste.kort),
          kortJ2: navn(J2.beste.kort),
          kortH1: navn(H1.beste.kort),
          kortH2: navn(H2.beste.kort),
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
            ["J1", J1],
            ["J2", J2],
            ["H1", H1],
            ["H2", H2],
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
              `gulv jevn ${((100 * ulikJ) / radNr).toFixed(1)} % mot halv ${((100 * ulikH) / radNr).toFixed(1)} %`,
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
    `  STØYGULV jevn ${((100 * ulikJ) / Math.max(1, radNr)).toFixed(1)} %  ` +
    `halv ${((100 * ulikH) / Math.max(1, radNr)).toFixed(1)} %  (rå tall — dommen felles i bandit-sum.ts)`,
);
