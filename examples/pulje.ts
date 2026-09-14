/**
 * PULJE — faller STØYGULVET av å velge verdenene fra ÉN FELLES kandidatpulje?
 *
 *   node examples/pulje.ts --kamper 4 --runder 3 --fro 14000901 --merke w0 \
 *        --ut analyse/pulje-w0.jsonl
 *
 * ============ HVA DENNE FILA MÅLER, OG HVORFOR IKKE K1 ====================
 *
 * `troledd.md` §3a målte at søkets valgte kort skifter i **43,8 %** av beslutningene
 * BARE av å trekke nye verdener med samme tro; `bandit.md` reproduserte 43,0 % på andre
 * giv. I stikk 0–3 er tallet 60,5 % — mest støy nøyaktig der `dekomp.md` plasserer
 * +0,49 av K1s +1,24, det eneste leddet med rom igjen.
 *
 * FIRE UAVHENGIGE GREP HAR MÅLT NULL: flere verdener (12→192, gulvet 44,6 → 37,1 %),
 * σ-porten (K1 −0,060 og −0,155), adaptiv fordeling (−0,8 ± 1,1 pp) og stratifisering
 * (+1,2 ± 1,5 pp). Det siste er det viktige: strata-agenten fant HVORFOR risten ikke
 * bet — `trekkVerdener` gir hver av de 48 verdenene sin EGEN uavhengige kandidatpulje,
 * så «rangering 0,9 i pulje A» og «rangering 0,9 i pulje B» er urelaterte verdener.
 * Risten hadde ingen felles akse å virke langs, og variansreduksjonen ble 0,997.
 *
 * **Denne fila slår de 48 puljene sammen til ÉN på 48·32 = 1536** — nøyaktig like mange
 * kandidater som i dag — og legger risten over den FELLES kumulative vekten.
 *
 * ============ PARRINGEN, PÅ TRE NIVÅER ====================================
 *
 * 1. SAMME STILLING. Alle fire armene vurderer nøyaktig samme `state` og sete.
 * 2. SAMME TO VERDENSFRØ. `I1`/`P1` deler instansfrø, `I2`/`P2` det andre. Støygulvet
 *    måles over de SAMME to trekningene i begge modusene, så en «heldig» stilling
 *    teller likt for begge. Frøene er de `troledd.ts` brukte til arm A og C, så tallet
 *    er direkte sammenliknbart med de 43,8 %.
 * 3. SAMME TRO OG SAMME BUDVEKT (`~mlbu=`: trovekt på, budvekt av), som den utrullede.
 *
 * OG PARRINGEN ER SKARP: grenen er RNG-nøytral — `kandidater` trekk og så ett `rng()`
 * per slott, i samme rekkefølge som i.i.d. — så `I1` og `P1` bygger BIT-IDENTISKE
 * kandidatpuljer. Bare hvilke kandidater som plukkes ut skiller dem.
 *
 *   I1  i.i.d. (dagens PIMC),   verdensfrø 1
 *   I2  i.i.d.,                 verdensfrø 2   → STØYGULV(i.i.d.) = I1 ≠ I2
 *   P1  felles pulje,           verdensfrø 1
 *   P2  felles pulje,           verdensfrø 2   → STØYGULV(pulje)  = P1 ≠ P2
 *
 * HYPOTESEN, FORHÅNDSREGISTRERT (se `D:\amb-grp\loop\pulje-spaadom.txt`, skrevet til
 * disk FØR målingen startet): **STØYGULV(pulje) < STØYGULV(i.i.d.)**, raden ALLE.
 * Alt annet her er sekundært, og ingen sekundær rad skal forfremmes til funn uten en
 * egen forhåndsregistrert prøve av akkurat den armen.
 *
 * ============ MANGFOLDET MÅLES I HVER RAD, OG DET ER IKKE PYNT ============
 *
 * `troledd.md` §4: vekten er skarp (ESS/K 0,179, maks p 0,547, log-spenn 19,13). I dag
 * beskytter de 48 UAVHENGIGE puljene mangfoldet — hver pulje har sin egen vinner. Med én
 * felles pulje får en kandidat som holder mer enn 1/48 = 2,08 % av totalvekten FLERE
 * slott, og ensemblet kan kollapse til en håndfull distinkte verdener.
 *
 * **Et støygulv som faller fordi de 48 verdenene er blitt 5 er ikke en seier** — det er
 * et mer deterministisk søk over et smalere ensemble. `distI`/`distP` teller derfor
 * distinkte verdener i hver rad, og tallet står i sammendraget ved siden av gulvet.
 * Tellingen bruker sin EGEN rng-strøm og ligger utenfor `ms`, så den forstyrrer verken
 * armene eller kostnadsmålingen.
 *
 * ============ KOSTNADEN ===================================================
 *
 * `vurderPar` spiller ut verden-for-verden × kandidat-for-kandidat, så utspillingene er
 * EKSAKT `n × lovlige`. Begge tallene skrives per arm i hver rad, så «samme antall
 * utspillinger» kan etterprøves rad for rad i stedet for å hvile på en kommentar.
 * Trekningen koster like mange `trekkVerden`-kall som før; det nye er én sortering av
 * 1536 elementer og et binærsøk per verden. `ms` skrives, så prisen måles i stedet for
 * å rundes bort.
 *
 * ============ FASITEN, OG HVOR DEN IKKE GJELDER ==========================
 *
 * Anger felles med `poengRotVerdier` på den virkelige given, og BARE der fasiten faktisk
 * skiller: 88 % av sluttspillstillingene er flate (`troledd.md` §2), og å telle dem ville
 * fortynnet alt mot null. Kostnaden setter vinduet til ≤ 7 kort på hånd (`troledd.md` §1).
 *
 * ============ KLYNGEN =====================================================
 *
 * Hver rad bærer `kamp`. Beslutninger i samme kamp er ikke uavhengige, så SE-en i
 * `pulje-sum.ts` er klynget der. Kjør derfor FLERE kamper per arbeider.
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
import { lagMål, trekkVerdener, type Utspiller } from "../src/moe2/sdkort.ts";
import { rolleFor } from "../src/moe2/rolleorakel.ts";
import { kortTilInt } from "../src/solver/dds.ts";
import { poengRotVerdier } from "../src/solver/poengdds.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const KAMPER = tall(arg("--kamper", "4"), 4, "kamper");
const RUNDER = tall(arg("--runder", "3"), 3, "runder");
const FRO = tall(arg("--fro", "14000901"), 14_000_901, "fro");
const UT = arg("--ut", "");
const MERKE = arg("--merke", "w0");
/** Største antall kort på hånd der fasiten felles. Se kostnadstabellen i `troledd.md` §1. */
const FASITTAK = tall(arg("--fasittak", "7"), 7, "fasittak");

/** Den utrullede speken (iter-8-modellene), som i `troledd.ts`, `bandit.ts` og `strata.ts`. */
const HELBOT =
  "okt:vr:e1-modell/vrak-8.bin@e1-modell/etterlyst-8.bin:telrd:eks:3Lt2000:profil:" +
  "sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-8.bin:budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin";
/** Laget INNE i `sik:` — rollout-motpart og policyen porten lar stå. */
const INDRE = "budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin";

/** Sikkerorakelets standardfrø (`sikkerorakel.ts`), så `D` gir samme strøm som i boten. */
const SIK_FRØ = 20_260_804;
/** Det andre instansfrøet — samme tall `troledd.ts` brukte til arm C, `bandit.ts` og `strata.ts`. */
const SIK_FRØ_2 = (SIK_FRØ ^ 0x5bf0_3635) >>> 0;
const VERDENER = tall(arg("--verdener", "48"), 48, "verdener");
const KANDIDATER = tall(arg("--kandidater", "32"), 32, "kandidater");
const EKSAKT_BLAD = 3;
const SIGMA_PORT = 0.5;

// ===========================================================================
// FASITEN  (ordrett fra `examples/strata.ts` / `bandit.ts` — samme rigg)
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

/** Antall DISTINKTE verdener i et ensemble — kollapser mangfoldet? */
function distinkte(verdener: number[][][]): number {
  const sett = new Set<string>();
  for (const h of verdener) sett.add(h.map((x) => x.slice().sort((a, b) => a - b).join(",")).join("|"));
  return sett.size;
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
let ulikP = 0;
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
      const [P1, msP1] = mål4({ ...felles, rng: strøm(SIK_FRØ), pulje: "felles" });
      const [P2, msP2] = mål4({ ...felles, rng: strøm(SIK_FRØ_2), pulje: "felles" });

      if (I1 !== null && I2 !== null && P1 !== null && P2 !== null) {
        const nettKort = ((): Kort | null => {
          const h = indre[sete]!.velgHandling(s);
          return h.type === "SPILL" ? h.kort : null;
        })();
        const igjen = s.hender[sete]?.length ?? 0;
        const rolle = rolleFor(s, sete) ?? "ukjent";
        const stikk = s.historikk.length;
        const fasit = igjen > 0 && igjen <= FASITTAK ? lagFasit(s, sete) : null;

        /**
         * MANGFOLDET. Egen rng-strøm og UTENFOR `ms`: tellingen skal verken forstyrre
         * armene eller belaste kostnadsmålingen. Samme frø som `I1`/`P1`, så det er
         * nøyaktig de ensemblene de to armene faktisk brukte.
         */
        const vI = trekkVerdener(
          s, sete, VERDENER, strøm(SIK_FRØ), undefined, trovekt, KANDIDATER, undefined, false,
        );
        const vP = trekkVerdener(
          s, sete, VERDENER, strøm(SIK_FRØ), undefined, trovekt, KANDIDATER, undefined, false, "felles",
        );

        // Porten: σ ≥ 0,5 lar søket overstyre, ellers står nettets kort.
        const spilt = (p: ParResultat): Kort =>
          p.sigma >= SIGMA_PORT ? p.beste.kort : (nettKort ?? p.beste.kort);

        const uI = !likeKort(I1.beste.kort, I2.beste.kort);
        const uP = !likeKort(P1.beste.kort, P2.beste.kort);
        if (uI) ulikI++;
        if (uP) ulikP++;

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
          ulikP: uP,
          ulikSpiltI: !likeKort(spilt(I1), spilt(I2)),
          ulikSpiltP: !likeKort(spilt(P1), spilt(P2)),
          // MANGFOLDET — hører sammen med gulvet, ikke i en fotnote.
          distI: distinkte(vI),
          distP: distinkte(vP),
          // BUDSJETTET. `vurderPar` spiller ut n × lovlige, så utspillingene er EKSAKT
          // dette produktet — påstanden er etterprøvbar rad for rad.
          nI1: I1.n,
          nI2: I2.n,
          nP1: P1.n,
          nP2: P2.n,
          utspI: (I1.n + I2.n) * antLovlige,
          utspP: (P1.n + P2.n) * antLovlige,
          msI: msI1 + msI2,
          msP: msP1 + msP2,
          sigI1: Math.round(I1.sigma * 1000) / 1000,
          sigP1: Math.round(P1.sigma * 1000) / 1000,
          kortI1: navn(I1.beste.kort),
          kortI2: navn(I2.beste.kort),
          kortP1: navn(P1.beste.kort),
          kortP2: navn(P2.beste.kort),
          // Biter knotten i det hele tatt? Samme frø, ulik modus.
          ulikModus: !likeKort(I1.beste.kort, P1.beste.kort),
          spredning: spredning === null ? null : Math.round(spredning * 1000) / 1000,
        };

        if (fasit !== null && skiller) {
          const anger = (kort: Kort, lagmål: boolean): number | null => {
            const m = lagmål ? fasit.lag : fasit.diff;
            const v = slåOpp(m, kort);
            if (v === null) return null;
            return (lagmål ? fasit.bestLag : fasit.bestDiff) - v;
          };
          for (const [merke, p] of [
            ["I1", I1],
            ["I2", I2],
            ["P1", P1],
            ["P2", P2],
          ] as const) {
            const rd = anger(p.beste.kort, false);
            const rl = anger(p.beste.kort, true);
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
              `gulv iid ${((100 * ulikI) / radNr).toFixed(1)} % mot pulje ${((100 * ulikP) / radNr).toFixed(1)} %`,
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
    `pulje ${((100 * ulikP) / Math.max(1, radNr)).toFixed(1)} %  (rå tall — dommen felles i pulje-sum.ts)`,
);
