/**
 * KNOTTRIGGEN (17. sep): hver fartsknott mot referansen på NØYAKTIG samme stilling.
 *
 *   node examples/fart-knott.ts --kamper 6 --runder 3 --froe 17090001 --ut D:/amb-grp/loop/fart/knott-w0.jsonl
 *        [--armer REF,STOY,EKV,TOPP05,FLAT8,E5,V24]
 *
 * Mønsteret er `troledd.ts` (gren `troledd-2026-09-13`): fire helbotseter spiller partiet, og ved hver
 * kortbeslutning med ≥ 2 lovlige kort kjøres `vurderPar` for hver arm på den samme stillingen, med den
 * SAMME verdensstrømmen (`visningsfrø`), så armene skiller seg bare i knotten. Rekkefølgen på armene
 * roteres per stilling, og tiden per arm er derfor PARRET.
 *
 * For hver arm skrives: ms, antall verdener og kandidater, σ, søkets argmaks og det SPILTE kortet
 * (porten anvendt: σ ≥ 0,5 og søkets beste utenfor nettets klasse → søkets kort, ellers nettets).
 * Ved ≤ 7 kort igjen felles fasit med `poengRotVerdier` på den virkelige given, og anger regnes
 * bare der fasiten SKILLER kortene (troledd §2).
 *
 * `M` (økta per motstandersete) er utelatt i alle armer, som i troledd: den krever en økt som
 * fylles under spill. Den rører ikke det knottene endrer.
 *
 * KLYNGER: hver `kamp` har eget frø (`--froe` + kampnummer) og er klyngen standardfeilene
 * regnes på (`fart-knott-analyse.mjs`).
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, lovligeKort, type GameState } from "../src/motor.ts";
import { FARGER, lagRng, likeKort, type Kort } from "../src/kort.ts";
import { lagIndre, priorFra } from "../src/moe2/agentspek.ts";
import { kortklasser, vurderPar, type ParOpts, type ParResultat } from "../src/moe2/sdpar.ts";
import { toppKandidater, visningsfrø } from "../src/moe2/sikkerorakel.ts";
import { lagMål, type Utspiller } from "../src/moe2/sdkort.ts";
import { rolleFor } from "../src/moe2/rolleorakel.ts";
import { MlbSøketro } from "../src/moe2/soketro.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import { kortTilInt } from "../src/solver/dds.ts";
import { poengRotVerdier } from "../src/solver/poengdds.ts";
import { readFileSync } from "node:fs";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const KAMPER = Number(arg("--kamper", "6"));
const RUNDER = Number(arg("--runder", "3"));
const FRØ0 = Number(arg("--froe", "17090001"));
const UT = arg("--ut", "D:/amb-grp/loop/fart/knott.jsonl");
const FASITTAK = Number(arg("--fasittak", "7"));
const ARMER = arg("--armer", "REF,STOY,EKV,TOPP05,FLAT8").split(",");
const HELBOT_SPEK = arg(
  "--driver",
  "okt:vr:e1-modell/vrak-8.bin@e1-modell/etterlyst-8.bin:telrd:eks:3Lt2000:profil:" +
    "sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-8.bin:budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin",
);
const INDRE = "budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin";
const SIK_FRØ = 20_260_804;
const SIGMA_PORT = 0.5;

/** En arm: endringer i `ParOpts` og hvordan kandidatene velges. */
interface ArmDef {
  readonly verdener?: number;
  readonly eksaktBlad?: number;
  readonly ekvivalens?: boolean;
  readonly flatStopp?: number;
  readonly toppP?: number;
  /** Annet instansfrø: STØYGULVET. */
  readonly støy?: boolean;
  /** σ-porten for denne armen (standard 0,5). */
  readonly sigma?: number;
}
/** Navnet leses som en liten spek: REF, STOY, EKV, TOPP<p·100>, FLAT<n0>, E<T>, V<V>, S<σ·100>, + for å stable. */
function lesArm(navn: string): ArmDef {
  const d: Record<string, unknown> = {};
  for (const bit of navn.split("+")) {
    let m: RegExpMatchArray | null;
    if (bit === "REF") continue;
    else if (bit === "STOY") d.støy = true;
    else if (bit === "EKV") d.ekvivalens = true;
    else if ((m = bit.match(/^TOPP(\d+)$/))) d.toppP = Number(m[1]) / 100;
    else if ((m = bit.match(/^FLAT(\d+)$/))) d.flatStopp = Number(m[1]);
    else if ((m = bit.match(/^E(\d+)$/))) d.eksaktBlad = Number(m[1]);
    else if ((m = bit.match(/^V(\d+)$/))) d.verdener = Number(m[1]);
    else if ((m = bit.match(/^S(\d+)$/))) d.sigma = Number(m[1]) / 100;
    else throw new Error(`Ukjent armledd «${bit}» i «${navn}»`);
  }
  return d as ArmDef;
}
const armDef = new Map(ARMER.map((a) => [a, lesArm(a)]));

const tronett = MlbTronett.fraBytes(readFileSync("e1-modell/tro-8.bin"));
const kortStr = (k: Kort | null): string | null => (k === null ? null : `${k.farge}${k.verdi}`);

/** Fasitverdi (lag- og diff-mål) per kort-int for setet i tur, eller null. Fra troledd.ts. */
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
  const bv = s.budvinner;
  const mk = s.makker;
  const på = (x: number): boolean => x === bv || (mk !== null && x === mk);
  const diff = new Map<number, number>();
  const lag = new Map<number, number>();
  for (const v of svar.verdier) {
    diff.set(v.kort, v.verdi);
    const mine: number[] = [];
    const deres: number[] = [];
    for (let p = 0; p < s.antallSpillere; p++) (på(p) === på(sete) ? mine : deres).push(v.poeng[p] ?? 0);
    const snitt = (x: number[]): number => (x.length === 0 ? 0 : x.reduce((a, b) => a + b, 0) / x.length);
    lag.set(v.kort, snitt(mine) - snitt(deres));
  }
  return { diff, lag };
}
/** Løserens representant er den HØYESTE i en sekvens; et annet kort slås opp mot nærmeste over. */
function slåOpp(m: Map<number, number>, kort: Kort): number | null {
  const c = kortTilInt(kort);
  const d = m.get(c);
  if (d !== undefined) return d;
  const farge = Math.floor(c / 13);
  let beste: number | null = null;
  let r0 = Infinity;
  for (const k of m.keys()) {
    if (Math.floor(k / 13) !== farge) continue;
    const r = k % 13;
    if (r >= c % 13 && r < r0) {
      r0 = r;
      beste = k;
    }
  }
  return beste === null ? null : m.get(beste)!;
}

mkdirSync(dirname(UT), { recursive: true });
const tStart = performance.now();
let rader = 0;

for (let kamp = 0; kamp < KAMPER; kamp++) {
  const frø = FRØ0 + kamp;
  const drivere = [0, 1, 2, 3].map(() => lagIndre(HELBOT_SPEK));
  const indre = [0, 1, 2, 3].map(() => lagIndre(INDRE));
  const prior = indre.map((a) => priorFra(a, INDRE));
  const tro = new MlbSøketro(tronett);
  for (const a of [...drivere, ...indre]) a.nyKamp();
  tro.nyKamp();
  const alleSer = (s: GameState): void => {
    for (const a of [...drivere, ...indre]) (a as { observer?(x: GameState): void }).observer?.(s);
    tro.observer(s);
  };
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, frø);
  let r = 0;
  let vakt = 0;
  let posNr = 0;
  while (s.fase !== "FERDIG" && r < RUNDER && vakt++ < 40_000) {
    alleSer(s);
    if (s.fase === "RUNDE_SLUTT") {
      r++;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;

    if (s.fase === "SPILL" && s.iTur !== null && lovligeKort(s, s.iTur).length >= 2) {
      const sete = s.iTur;
      const lovlige = lovligeKort(s, sete);
      const motpart = indre[sete]! as unknown as Utspiller;
      const nettH = indre[sete]!.velgHandling(s);
      const nett = nettH.type === "SPILL" ? nettH.kort : null;
      const trovekt = tro.vektFor(s, sete) ?? undefined;
      const klasser = kortklasser(s, lovlige);
      const klasseId = (k: Kort | null): number =>
        k === null ? -1 : klasser.findIndex((kl) => kl.some((m) => likeKort(m, k)));

      const ut: Record<string, unknown> = {};
      const rekke = [...ARMER];
      const rot = posNr++ % rekke.length;
      const ordnet = [...rekke.slice(rot), ...rekke.slice(0, rot)];
      for (const navn of ordnet) {
        const d = armDef.get(navn)!;
        const t0 = performance.now();
        let kandidater: Kort[] | undefined;
        if (d.toppP !== undefined) kandidater = toppKandidater(lovlige, prior[sete]!(s, sete), d.toppP, nett);
        const opts: ParOpts = {
          verdener: d.verdener ?? 48,
          verdenKandidater: 32,
          verdenKombi: "snitt",
          eksaktBlad: d.eksaktBlad ?? 3,
          mål: lagMål,
          trovekt,
          budvekt: false,
          rng: lagRng(visningsfrø(s, sete, d.støy === true ? (SIK_FRØ ^ 0x5bf0_3635) >>> 0 : SIK_FRØ)),
          ...(d.ekvivalens === true ? { ekvivalens: true } : {}),
          ...(d.flatStopp !== undefined ? { flatStopp: d.flatStopp } : {}),
          ...(kandidater !== undefined ? { kandidater } : {}),
        };
        const par: ParResultat | null = vurderPar(s, sete, motpart, opts);
        const ms = performance.now() - t0;
        let spilt = nett;
        if (par !== null && par.sigma >= (d.sigma ?? SIGMA_PORT) && nett !== null) {
          const iBeste = (par.beste.medlemmer ?? [par.beste.kort]).some((m) => likeKort(m, nett));
          spilt = iBeste ? nett : par.beste.kort;
        }
        ut[navn] = {
          ms: Math.round(ms * 100) / 100,
          n: par?.n ?? 0,
          kand: par?.kandidater.length ?? 0,
          sig: par === null ? null : Math.round(par.sigma * 1000) / 1000,
          arg: kortStr(par?.beste.kort ?? null),
          spilt: kortStr(spilt),
          kl: klasseId(spilt),
        };
      }

      const igjen = s.hender[sete]?.length ?? 0;
      const rad: Record<string, unknown> = {
        kamp: frø,
        r,
        sete,
        rolle: rolleFor(s, sete) ?? "ukjent",
        stikk: s.stikkSpilt + 1,
        igjen,
        lovlige: lovlige.length,
        klasser: klasser.length,
        nett: kortStr(nett),
        armer: ut,
      };
      if (igjen > 0 && igjen <= FASITTAK) {
        const f = lagFasit(s, sete);
        if (f !== null) {
          const verdier = [...f.lag.values()];
          const spred = Math.max(...verdier) - Math.min(...verdier);
          const sprD = Math.max(...f.diff.values()) - Math.min(...f.diff.values());
          rad.spredLag = Math.round(spred * 1000) / 1000;
          rad.spredDiff = Math.round(sprD * 1000) / 1000;
          const bestL = Math.max(...verdier);
          const bestD = Math.max(...f.diff.values());
          for (const navn of ARMER) {
            const a = ut[navn] as { spilt: string | null; regL?: number | null; regD?: number | null };
            const kort = a.spilt === null ? null : lovlige.find((k) => kortStr(k) === a.spilt)!;
            const vL = kort === null ? null : slåOpp(f.lag, kort);
            const vD = kort === null ? null : slåOpp(f.diff, kort);
            a.regL = vL === null ? null : Math.round((bestL - vL) * 1000) / 1000;
            a.regD = vD === null ? null : Math.round((bestD - vD) * 1000) / 1000;
          }
        }
      }
      appendFileSync(UT, JSON.stringify(rad) + "\n");
      rader++;
    }
    s = utfør(s, drivere[iTur]!.velgHandling(s)).state;
  }
  console.log(`kamp ${kamp + 1}/${KAMPER} (frø ${frø}): ${rader} rader, ${((performance.now() - tStart) / 1000).toFixed(0)} s`);
}
