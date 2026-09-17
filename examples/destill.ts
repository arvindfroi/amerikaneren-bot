/**
 * DESTILL — hvor støyete er kortnettets etiketter, og hvor langt er nettet fra søket?
 *
 *   node examples/destill.ts --kamper 5 --runder 2 --fro 17090101 --merke w0 \
 *        --ut analyse/destill-w0.jsonl [--grupper 8] [--data]
 *
 * ============ HVA DENNE FILA GJØR ========================================
 *
 * Løkka merker kortvalgene med ÉN søkekjøring per beslutning (`examples/kort-data.ts`,
 * `HELK` = `sik:alle:0.5:24k32e3LMD~mlbu=…`). `troledd.md`/`bandit.md`/`pulje.md` målte at
 * argmaks i et 48-verdenssøk skifter i 43 % av beslutningene bare av et nytt verdenstrekk.
 * Denne fila skriver RÅVERDIENE per lovlig kort fra mange UAVHENGIGE søk i samme stilling,
 * så all analyse (etikettstøy, nettets avstand, anger mot fasit) gjøres av `destill-sum.ts`
 * på lagrede tall — ingen tolkning i løkka.
 *
 * Per beslutning (SPILL, ≥ 2 lovlige kort), i nøyaktig samme stilling og sete:
 *
 *   L0   løkkas egen etikett: det 24-verdenssøket DRIVEREN faktisk kjørte (instansfrøet,
 *        `D` → visningsfrø). Fanget med `settParlytter`, som `kort-data.ts` gjør.
 *   L1   samme søk, 24 verdener, annet instansfrø.
 *   G0…G(2K−1)  48-verdenssøk med 2K ulike instansfrø. G0…G(K−1) er gruppe 1, GK…G(2K−1)
 *        gruppe 2. G0 bruker sikkerorakelets standardfrø og GK `(frø ^ 0x5bf03635)`, altså
 *        NØYAKTIG de to frøene `troledd.ts`/`bandit.ts`/`pulje.ts` brukte — G0≠GK er det
 *        kjente støygulvet på 43 %, reprodusert eller ikke.
 *   nett kortet `sik:` sitt indre lag velger (budq + vakt + e1:kort-16) — «nettet alene».
 *
 * ALLE SØKENE BRUKER DRIVERENS EGET SIKKERORAKEL: samme motpart, samme `M`-økt
 * (`motpartFor`), samme tro (`tro.vektFor`), samme kandidattall, `e3`, `L`. Bare `verdener`
 * og frøet skiller. Det er løkkas etikett, ikke en rekonstruksjon av den.
 *
 * FORBEHOLD, SAGT FØR MÅLINGEN: G0 og L0 har samme frø, så de 24 første verdenene i G0 er
 * trolig L0 sine. Sammenlikninger med L0 bruker derfor gruppe 2; L1 har et frø utenfor
 * begge gruppene.
 *
 * FASIT: `poengRotVerdier` på den virkelige given når ≤ 7 kort er igjen (`troledd.md` §1),
 * lagret per lovlig kort (ekvivalensklasse slått opp). Flate stillinger filtreres i
 * analysen, ikke her.
 *
 * `--data`: skriv i tillegg kortnettets trekkvektor `t` (493, kortbok) i hver rad, så
 * radene kan brukes som treningskorpus (del 2). Uten flagget skrives ingen trekk.
 *
 * KLYNGEN: hver rad bærer `kamp` (merke + nummer). SE klynges der i analysen.
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, lovligeKort, type GameState } from "../src/motor.ts";
import { FARGER, lagRng, type Kort } from "../src/kort.ts";
import { lagIndre, tall } from "../src/moe2/agentspek.ts";
import { vurderPar, type ParResultat } from "../src/moe2/sdpar.ts";
import { settParlytter, visningsfrø, type Parhendelse, type Sikkerorakel } from "../src/moe2/sikkerorakel.ts";
import type { Utspiller } from "../src/moe2/sdkort.ts";
import { lagMål } from "../src/moe2/sdkort.ts";
import { rolleFor } from "../src/moe2/rolleorakel.ts";
import { kortTilInt } from "../src/solver/dds.ts";
import { poengRotVerdier } from "../src/solver/poengdds.ts";
import { e1KortBokTrekk } from "../src/e1/kortbok.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import { kortIndeks } from "../src/nevro/index.ts";
import { nettFraBytes } from "../src/nevro/nett.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const KAMPER = tall(arg("--kamper", "5"), 5, "kamper");
const RUNDER = tall(arg("--runder", "2"), 2, "runder");
const FRO = tall(arg("--fro", "17090101"), 17_090_101, "fro");
const UT = arg("--ut", "");
const MERKE = arg("--merke", "w0");
const K = tall(arg("--grupper", "8"), 8, "grupper");
const VERD_L = tall(arg("--verdenerL", "24"), 24, "verdenerL");
const VERD_G = tall(arg("--verdenerG", "48"), 48, "verdenerG");
const FASITTAK = tall(arg("--fasittak", "7"), 7, "fasittak");
const DATA = process.argv.includes("--data");
/** `--halv`: bare gruppe 1 (G0…G(K−1)) — korpusgenerering i del 2, der gruppe 2 ikke trengs. */
const HALV = process.argv.includes("--halv");
/** Sannsynlighet for å måle en gitt beslutning (strømmen er egen, så kampen er urørt). */
const SJANSE = Number(arg("--sjanse", "1"));
const ITER = arg("--iter", "16");

const M = (f: string): string => `e1-modell/${f}-${ITER}.bin`;
/** Løkkas HELK (adams-max-loop-v12.sh linje 69), med iter-16-settet. */
const HELK =
  `okt:vr:${M("vrak")}@${M("etterlyst")}:telrd:eks:3Lt2000:profil:` +
  `sik:alle:0.5:${VERD_L}k32e3LMD~mlbu=${M("tro")}:budq:${M("budq")}:vakt:abmp:e1:${M("kort")}`;

const SIK_FRØ = 20_260_804;
const SIK_FRØ_2 = (SIK_FRØ ^ 0x5bf0_3635) >>> 0;
/** Instansfrø j: G0 = standard, GK = troledd sitt andre frø, resten spredt. */
const gFrø = (j: number): number =>
  j === 0 ? SIK_FRØ : j === K ? SIK_FRØ_2 : (Math.imul(SIK_FRØ ^ 0x9e37_79b9, j + 1) ^ (j * 0x85eb_ca6b)) >>> 0;
const L1_FRØ = (SIK_FRØ ^ 0x2545_f491) >>> 0;

// ---------------------------------------------------------------- fasit (fra pulje.ts)

const sammeSide = (s: GameState, sete: number, p: number): boolean => {
  const bv = s.budvinner!;
  const mk = s.makker;
  const på = (x: number): boolean => x === bv || (mk !== null && x === mk);
  return på(p) === på(sete);
};

function lagFasit(s: GameState, sete: number): { diff: Map<number, number>; lag: Map<number, number> } | null {
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
    const snitt = (x: number[]): number => (x.length === 0 ? 0 : x.reduce((a, b) => a + b, 0) / x.length);
    lag.set(v.kort, snitt(mine) - snitt(deres));
  }
  return { diff, lag };
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

// ---------------------------------------------------------------- oppsett

/** Det vi leser ut av driverens sikkerorakel. Private felt — kun lesing. */
interface SikInnside {
  motpart: Utspiller;
  motpartFor: ((sete: number) => Utspiller) | null;
  tro: { vektFor(s: GameState, sete: number): unknown } | null;
  verdenKandidater: number;
  eksaktBlad: number | null;
  lagmål: boolean;
  budvekt: boolean;
  indre: { velgHandling(s: GameState): { type: string; kort?: Kort } };
}

const r4 = (x: number): number => Math.round(x * 10_000) / 10_000;
const kortBredde = nettFraBytes(new Uint8Array(readFileSync(M("kort"))))[0]!.lag[0]!.inn;
if (DATA && kortBredde !== 493) throw new Error(`--data forutsetter et 493-kortnett, ${M("kort")} er ${kortBredde}`);

const drivere = [0, 1, 2, 3].map(() => lagIndre(HELK));
const fangst: { lytt: boolean; h: Parhendelse | null; antall: number } = { lytt: false, h: null, antall: 0 };
settParlytter((h) => {
  if (!fangst.lytt) return;
  fangst.h = h;
  fangst.antall++;
});
const velg = lagRng(7_700_000 + (FRO % 1000));

if (UT !== "") mkdirSync(dirname(UT), { recursive: true });
const buf: string[] = [];
const skriv = (o: unknown): void => {
  if (UT === "") return;
  buf.push(JSON.stringify(o));
  if (buf.length >= 10) {
    appendFileSync(UT, buf.join("\n") + "\n");
    buf.length = 0;
  }
};

let rader = 0;
let uten = 0;
let ulikG = 0;
const t0 = performance.now();

for (let kamp = 0; kamp < KAMPER; kamp++) {
  const kampFrø = (FRO + kamp * 1_000_003) >>> 0;
  for (const a of drivere) a.nyKamp();
  const bok = DATA ? new Hukommelse() : null;
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, kampFrø);
  let vakt = 0;
  let r = 0;
  while (s.fase !== "FERDIG" && vakt++ < 40_000 && r < RUNDER) {
    for (const a of drivere) (a as { observer?(x: GameState): void }).observer?.(s);
    bok?.observer(s);
    if (s.fase === "RUNDE_SLUTT") {
      r++;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    const lovlige = s.fase === "SPILL" ? lovligeKort(s, iTur) : [];
    const merk = s.fase === "SPILL" && lovlige.length >= 2 && velg() < SJANSE;

    fangst.h = null;
    fangst.antall = 0;
    fangst.lytt = merk;
    const h = drivere[iTur]!.velgHandling(s);
    fangst.lytt = false;

    if (merk) {
      const f = fangst.h as Parhendelse | null;
      if (f === null || f.sete !== iTur || fangst.antall !== 1) {
        uten++;
      } else {
        const sete = iTur;
        const sik = f.sik as unknown as SikInnside;
        const trovekt = (sik.tro?.vektFor(s, sete) ?? undefined) as Parameters<typeof vurderPar>[3]["trovekt"];
        const søk = (verdener: number, frø: number): { p: ParResultat | null; ms: number } => {
          const ta = performance.now();
          const p = vurderPar(s, sete, sik.motpart, {
            verdenKandidater: sik.verdenKandidater,
            verdenKombi: "snitt",
            spillvekt: false,
            trovekt,
            budvekt: sik.budvekt,
            mål: sik.lagmål ? lagMål : undefined,
            ...(sik.eksaktBlad === null ? {} : { eksaktBlad: sik.eksaktBlad }),
            ...(sik.motpartFor === null ? {} : { motpartFor: sik.motpartFor }),
            verdener,
            rng: lagRng(visningsfrø(s, sete, frø)),
          });
          return { p, ms: performance.now() - ta };
        };
        // Kortrekkefølgen er L0 sin; alle andre verdier stilles opp etter den.
        const kort = f.par.kandidater.map((k) => k.kort);
        const idx = kort.map((k) => kortIndeks(k));
        const rekke = (p: ParResultat | null): number[] | null => {
          if (p === null) return null;
          const m = new Map(p.kandidater.map((k) => [kortIndeks(k.kort), k.snitt]));
          const ut = idx.map((i) => m.get(i));
          return ut.some((x) => x === undefined) ? null : (ut as number[]).map(r4);
        };
        const L0 = rekke(f.par);
        const l1 = søk(VERD_L, L1_FRØ);
        const G: (number[] | null)[] = [];
        const nG: number[] = [];
        let msG = 0;
        for (let j = 0; j < (HALV ? K : 2 * K); j++) {
          const g = søk(VERD_G, gFrø(j));
          G.push(rekke(g.p));
          nG.push(g.p?.n ?? 0);
          msG += g.ms;
        }
        const nh = sik.indre.velgHandling(s);
        const nettKort = nh.type === "SPILL" && nh.kort !== undefined ? kortIndeks(nh.kort) : null;
        const igjen = s.hender[sete]?.length ?? 0;
        const fasit = igjen > 0 && igjen <= FASITTAK ? lagFasit(s, sete) : null;
        const fd = fasit === null ? null : kort.map((k) => slåOpp(fasit.diff, k));
        const fl = fasit === null ? null : kort.map((k) => slåOpp(fasit.lag, k));
        if (G.every((x) => x !== null) && L0 !== null) {
          const am = (v: number[]): number => v.indexOf(Math.max(...v));
          if (!HALV && am(G[0]!) !== am(G[K]!)) ulikG++;
          const rad: Record<string, unknown> = {
            kamp: `${MERKE}-${kamp}`,
            frø: kampFrø,
            r,
            sete,
            rolle: rolleFor(s, sete) ?? "ukjent",
            stikk: s.stikkSpilt,
            igjen,
            kort: idx,
            spilt: h.type === "SPILL" ? kortIndeks(h.kort) : null,
            nett: nettKort,
            sigL0: r4(f.par.sigma),
            nL0: f.par.n,
            nL1: l1.p?.n ?? 0,
            nG,
            msL1: Math.round(l1.ms),
            msG: Math.round(msG),
            L0,
            L1: rekke(l1.p),
            G,
            fd: fd === null ? null : fd.map((x) => (x === null ? null : r4(x))),
            fl: fl === null ? null : fl.map((x) => (x === null ? null : r4(x))),
          };
          if (DATA) rad.t = Array.from(e1KortBokTrekk(s, sete, bok!.vektor(sete, s.antallSpillere)));
          skriv(rad);
          rader++;
          if (rader % 10 === 0) {
            const sek = (performance.now() - t0) / 1000;
            console.log(
              `[${MERKE}] kamp ${kamp} runde ${r}: ${rader} rader, ${sek.toFixed(0)} s ` +
                `(${(sek / rader).toFixed(1)} s/rad), G0≠G${K} ${((100 * ulikG) / rader).toFixed(1)} %, uten ${uten}`,
            );
          }
        } else {
          uten++;
        }
      }
    }
    s = utfør(s, h).state;
  }
}
settParlytter(null);
if (UT !== "" && buf.length > 0) appendFileSync(UT, buf.join("\n") + "\n");
const sek = (performance.now() - t0) / 1000;
console.log(`\n[${MERKE}] FERDIG: ${rader} rader (uten par ${uten}), ${sek.toFixed(0)} s.`);
