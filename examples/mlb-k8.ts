/**
 * MLB FASE 0a — K8-PRØVEN MED TROHODET SOM EN ARM VED SIDEN AV.
 *
 *   node examples/mlb-k8.ts --giver 400 --verdener 64 --vrakalfa 2 \
 *     --nett e1-modell/mlb-tro.bin --skard 0/8 --ut analyse/mlb-k8-0.jsonl
 *
 * Stillingsutvalget, driverne, frøene og renormaliseringen er tatt ORDRETT fra
 * `examples/tro-noyaktighet.ts`. Det er hele poenget: skal nettet sammenliknes
 * med tallene i §117, må det måles på de samme stillingene med det samme
 * måltallet — ellers sammenlikner vi to prøver og ikke to armer.
 *
 * ===================== HYPOTESEN SOM PRØVES =============================
 *
 * §117: dagens tro er et MONTE-CARLO-ESTIMAT. Log-tap straffer variansen
 * systematisk (Jensen: `E[−log p̂] ≥ −log E[p̂]`), og underskuddet mot `gulv+`
 * kollapser med V: −0,0840 (V=16), −0,0191 (V=64), −0,0053 (V=256).
 *
 * Et nett har ingen slik straff. Det gir én glatt fordeling per stilling.
 * Hypotesen er derfor at et trohode trent veiledet på fasit om fortiden slår
 * både dagens tro og `gulv+` — uten noe søk i det hele tatt.
 *
 * ===================== HVA SOM ER RETTFERDIG, OG HVA SOM IKKE ER =========
 *
 * Monte-Carlo-armene får et GULV på sannsynligheten (1/(2V)) som hindrer
 * log(0). Det er en HJELP: uten det ville en enkelt bomtrekning gjort tapet
 * uendelig. Nettet får ikke noe slikt gulv — softmax er aldri null, så det
 * trenger ingen. Skjevheten går altså i dagens tros favør, og det er med vilje.
 *
 * RENORMALISERINGEN er den samme for alle: troens rader summerer ikke til 1
 * over de tre setene, resten er TALONGEN. Gulvene betinger på at kortet er på
 * en hånd, så alle armer deles på summen over de tre setene. Uten dette steget
 * «viste» prøven én gang at Adams var verre enn uniform, og det var målingen
 * som var gal.
 *
 * ===================== HERKOMST =========================================
 *
 * Nettet er trent på `spillerVisning`-trekk og på etiketten «hvor kortene
 * faktisk lå». Ingen `sd-orakel`, ingen dobbeltdummy, ingen `d7alle` i
 * inngangen eller gradienten. Driverne som SPILLER stillingene er `ADAMS_MAALT`
 * — det er en måling, ikke en gradient, og `docs/mlb.md` §0 tillater det
 * uttrykkelig. Fordelingen av stillinger arver likevel spilleren, og det står i
 * rapporten.
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeKort, spillerVisning } from "../src/motor.ts";
import { lagIndre, ADAMS_MAALT, lesNett, tall } from "../src/moe2/agentspek.ts";
import { monteTro } from "../src/moe2/montetro.ts";
import { lagVerdensvekt, type Vektkilde } from "../src/moe2/verdensvekt.ts";
import type { Vrakvekt } from "../src/solver/sampler.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { forover } from "../src/nevro/nett.ts";
import { e1SpillTrekk } from "../src/e1/trekk.ts";
import { lagRng } from "../src/kort.ts";
import { STANDARDNETT } from "../src/moe2/agentspek.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import { troTrekk } from "../src/mlb/trotrekk.ts";
import { byggTrekk } from "../src/mlb/trekk.ts";
import { TOMT_DELVALG } from "../src/mlb/handling.ts";
import { lesSandkasse } from "./mlb-krav-felles.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const GIVER = tall(arg("--giver", "60"), 60, "giver");
const VERDENER = tall(arg("--verdener", "64"), 64, "verdener");
const KAND = tall(arg("--kandidater", "8"), 8, "kandidater");
const FRAstikk = tall(arg("--frastikk", "2"), 2, "frastikk");
const PERSTIKK = tall(arg("--perstikk", "1"), 1, "perstikk");
const PERGIV = tall(arg("--pergiv", "8"), 8, "pergiv");
const DRIVER = arg("--drivere", ADAMS_MAALT);
const VRAKALFA = Number(arg("--vrakalfa", "2"));
const NETTFIL = arg("--nett", "e1-modell/mlb-tro.bin");
const UT = arg("--ut", "analyse/mlb-k8-0.jsonl");
const [SI, SN] = (arg("--skard", "0/1").split("/") as [string, string]).map(Number) as [number, number];
/**
 * FRØBÅNDET, som flagg og ikke som konstant.
 *
 * Sto hardkodet på 12 000 000. Da kan prøven ikke REPLIKERES i et disjunkt
 * bånd, og vedlegget i `AdamsMax.md` krever nettopp det: «parret på giv,
 * replikert i disjunkte frøbånd». Standardverdien er den gamle konstanten, så
 * hver eksisterende rad i `analyse/` er bit-identisk med før.
 */
const FRØ = tall(arg("--froe", "12000000"), 12_000_000, "froe");

/** Relativt sete, samme koding som `fyllSanser` og `monteTro`. */
const rel = (sete: number, p: number, n: number): number => (p - sete + n) % n;

const nett = lesNett(STANDARDNETT);
const atferd = {
  logits: (st: GameState, s2: number) => forover(nett, e1SpillTrekk(st, s2, nett.lag[0]!.inn)),
};
const trohode = MlbTronett.fraBytes(new Uint8Array(readFileSync(NETTFIL)));

/**
 * NETTETS EGET TROHODE (`--sandkasse <vekter>`, 10. sep). Kravbatteriet målte
 * bare trosnettFILA over, og den er fast under RL-trening: K8-raden sto dermed
 * stille uansett hva en epoke gjorde. Hodet inne i sandkassenettet trenes hver
 * epoke og måles her på de SAMME stillingene og de SAMME kortene, med samme
 * renormalisering over de tre setene.
 *
 * Trekkene er sandkassens egne (`byggTrekk` av `spillerVisning`), med trosnettet
 * som inngang slik agenten spiller, og hukommelsen tom — stillingene er alle fra
 * første runde, der den per konstruksjon er tom.
 */
const SANDKASSE = arg("--sandkasse", "");
const sandkasse = SANDKASSE === "" ? null : lesSandkasse(SANDKASSE);

interface Arm {
  navn: string;
  kilde: Vektkilde;
  signal: boolean;
  vrakvekt?: Vrakvekt;
}
const ARMER: Arm[] = [
  { navn: "av", kilde: "av", signal: false },
  { navn: "bayes", kilde: "bayes", signal: false },
];
if (VRAKALFA > 0) {
  ARMER.push({ navn: "bayes+W", kilde: "bayes", signal: false, vrakvekt: { alfa: VRAKALFA, beta: 0 } });
}
const ARMVALG = arg("--armer", "");
const VALGTE: Arm[] =
  ARMVALG === "" ? ARMER : ARMER.filter((a) => ARMVALG.split(",").includes(a.navn));

/** Gulv+: setene som ikke er KJENT renons i fargen. Ordrett fra tro-noyaktighet. */
function muligeSeter(state: GameState, sete: number, farge: string): number[] {
  const ut: number[] = [];
  for (let p = 0; p < state.antallSpillere; p++) {
    if (p === sete) continue;
    let renons = false;
    for (const stikk of state.historikk) {
      const ledet = stikk.kort[0];
      if (ledet === undefined || ledet.kort.farge !== farge) continue;
      const eget = stikk.kort.find((kp) => kp.spiller === p);
      if (eget !== undefined && eget.kort.farge !== farge) renons = true;
    }
    if (!renons) ut.push(p);
  }
  return ut;
}

mkdirSync(dirname(UT), { recursive: true });
let n = 0;

for (let g = 0; g < GIVER; g++) {
  if (g % SN !== SI) continue;
  const frø = FRØ + g * 6151;
  const ag = [0, 1, 2, 3].map(() => lagIndre(DRIVER));
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  let iGiv = 0;
  let iStikk = 0;
  let sisteStikk = -1;

  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 200) {
    if (s.fase === "SPILL" && s.stikkSpilt !== sisteStikk) {
      sisteStikk = s.stikkSpilt;
      iStikk = 0;
    }
    if (s.fase === "SPILL" && s.iTur !== null && iGiv < PERGIV && iStikk < PERSTIKK && s.stikkSpilt >= FRAstikk) {
      const sete = s.iTur;
      if (lovligeKort(s, sete).length >= 2) {
        iGiv++;
        iStikk++;
        const rad: Record<string, number | string> = {
          frø,
          stikk: s.stikkSpilt,
          sete,
          verdener: VERDENER,
        };

        // GULVENE, som er de samme for alle armene.
        let gulvTap = 0;
        let gulvPlussTap = 0;
        let kort = 0;
        for (let p = 0; p < s.antallSpillere; p++) {
          if (p === sete) continue;
          for (const k of s.hender[p] ?? []) {
            kort++;
            gulvTap += -Math.log(1 / 3);
            const mulige = muligeSeter(s, sete, k.farge);
            const m = Math.max(1, mulige.includes(p) ? mulige.length : 3);
            gulvPlussTap += -Math.log(1 / m);
          }
        }
        if (kort === 0) break;
        rad.kort = kort;
        rad.erBv = sete === s.budvinner ? 1 : 0;
        rad.gulv = Number((gulvTap / kort).toFixed(5));
        rad.gulvPluss = Number((gulvPlussTap / kort).toFixed(5));

        for (const arm of VALGTE) {
          const rng = lagRng(31_000_000 + g * 97 + s.stikkSpilt);
          const vekt = lagVerdensvekt(s, sete, { kilde: arm.kilde, signal: arm.signal, atferd });
          const tro = monteTro(s, sete, VERDENER, rng, vekt, KAND, arm.vrakvekt);
          if (tro === null) {
            rad[arm.navn] = NaN;
            continue;
          }
          let tap = 0;
          let treff = 0;
          let gulvBandt = 0;
          for (let p = 0; p < s.antallSpillere; p++) {
            if (p === sete) continue;
            const r = rel(sete, p, s.antallSpillere);
            if (r < 1 || r > 3) continue;
            for (const k of s.hender[p] ?? []) {
              const rader = tro[kortIndeks(k)]!;
              const sum = (rader[0] ?? 0) + (rader[1] ?? 0) + (rader[2] ?? 0);
              const rå = sum > 1e-9 ? (rader[r - 1] ?? 0) / sum : 0;
              const pr = Math.max(1 / (2 * VERDENER), rå);
              if (rå < 1 / (2 * VERDENER)) gulvBandt++;
              tap += -Math.log(pr);
              let best = 0;
              for (let i = 1; i < 3; i++) if ((rader[i] ?? 0) > (rader[best] ?? 0)) best = i;
              if (best === r - 1) treff++;
            }
          }
          rad[arm.navn] = Number((tap / kort).toFixed(5));
          rad[`${arm.navn}_treff`] = Number((treff / kort).toFixed(5));
          rad[`${arm.navn}_gulvbandt`] = Number((gulvBandt / kort).toFixed(5));
        }

        /**
         * NETTET — samme stilling, samme kort, samme renormalisering.
         *
         * Ingen RNG, ingen verdener, ingen gulv på sannsynligheten. Trekkene
         * bygges av `spillerVisning(s, sete)`, aldri av `s`, og
         * `test/mlb-k2-tro.test.ts` holder at det er en blind funksjon.
         */
        {
          const f = trohode.fordeling(troTrekk(spillerVisning(s, sete), s.giving.antallStikk, s.regler.målPoeng));
          let tap = 0;
          let treff = 0;
          for (let p = 0; p < s.antallSpillere; p++) {
            if (p === sete) continue;
            const r = rel(sete, p, s.antallSpillere);
            if (r < 1 || r > 3) continue;
            for (const k of s.hender[p] ?? []) {
              const rader = f[kortIndeks(k)]!;
              const sum = (rader[0] ?? 0) + (rader[1] ?? 0) + (rader[2] ?? 0);
              const pr = sum > 1e-12 ? (rader[r - 1] ?? 0) / sum : 1 / 3;
              tap += -Math.log(Math.max(1e-12, pr));
              let best = 0;
              for (let i = 1; i < 3; i++) if ((rader[i] ?? 0) > (rader[best] ?? 0)) best = i;
              if (best === r - 1) treff++;
            }
          }
          rad.nett = Number((tap / kort).toFixed(5));
          rad.nett_treff = Number((treff / kort).toFixed(5));
          // Nettet trenger aldri gulvet. Feltet skrives likevel, så rapporten
          // kan behandle armene likt i stedet for å ha et unntak.
          rad.nett_gulvbandt = 0;
        }

        if (sandkasse !== null) {
          const trekk = byggTrekk(spillerVisning(s, sete), {
            regler: s.regler,
            giving: s.giving,
            delvalg: TOMT_DELVALG,
            hukommelse: null,
            tronett: trohode,
          });
          const rå = sandkasse.framover(trekk).tro;
          let tap = 0;
          let treff = 0;
          for (let p = 0; p < s.antallSpillere; p++) {
            if (p === sete) continue;
            const r = rel(sete, p, s.antallSpillere);
            if (r < 1 || r > 3) continue;
            for (const k of s.hender[p] ?? []) {
              // Logitene står KORT × 4 (rel sete 1, 2, 3, talong), som trohodet og troFasit.
              const b = kortIndeks(k) * 4;
              let maks = -Infinity;
              for (let c = 0; c < 4; c++) maks = Math.max(maks, rå[b + c] ?? 0);
              const e = [0, 1, 2, 3].map((c) => Math.exp((rå[b + c] ?? 0) - maks));
              const sum = e[0]! + e[1]! + e[2]!;
              const pr = sum > 1e-12 ? e[r - 1]! / sum : 1 / 3;
              tap += -Math.log(Math.max(1e-12, pr));
              let best = 0;
              for (let i = 1; i < 3; i++) if (e[i]! > e[best]!) best = i;
              if (best === r - 1) treff++;
            }
          }
          rad.sandkasse = Number((tap / kort).toFixed(5));
          rad.sandkasse_treff = Number((treff / kort).toFixed(5));
        }

        appendFileSync(UT, JSON.stringify(rad) + "\n");
        n++;
      }
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, ag[iTur]!.velgHandling(s)).state;
  }
  process.stdout.write(`\r  skard ${SI}: ${n} stillinger   `);
}
console.log(`\nSkard ${SI} ferdig: ${n} stillinger → ${UT}`);
