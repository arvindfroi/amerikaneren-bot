/**
 * K8 — HVOR GODT PREDIKERER ADAMS MOTSTANDERNES KORT?
 *
 *   node examples/tro-noyaktighet.ts --giver 200 --verdener 24 --skard 0/8 \
 *     --ut analyse/tro-0.jsonl
 *
 * ARVIND: «kunne predikere motstandere sine kort på et veldig høyt nivå (uten
 * å jukse)».
 *
 * Kravet var uetterprøvbart før dette. `analyse/beliefrom.txt` måler
 * STØRRELSEN på beliefrommet — hvor mange verdener som er forenlige — og det
 * er et helt annet spørsmål enn om vi TREFFER. Et lite rom kan man bomme i.
 *
 * ================= MÅLTALLET ============================================
 *
 * For hvert skjult kort: hvilken sannsynlighet gir troen det setet kortet
 * FAKTISK ligger på? Summert som log-tap, som er den eneste skåren der det å
 * være sikker og ta feil straffes hardere enn å være usikker.
 *
 * Tre referanser, fordi et tall alene ikke kan leses:
 *
 *   GULV       uniformt over de tre motstanderne (ingen kunnskap)
 *   GULV+      uniformt over de setene som ikke er KJENT renons i fargen.
 *              Dette er den ærlige grunnlinja: renonser er harde forbud i
 *              trekningen, så å slå det naive gulvet beviser ingenting.
 *   TAK        klarsyn, log-tap 0
 *
 * «Veldig høyt nivå» må bli et tall mellom GULV+ og TAK. Uten den rammen er
 * kravet en mening.
 *
 * ================= OG DEN MÅLER SAMSPILLET ==============================
 *
 * Arvind: «alle deler skal fungere i samspill og gjøre hverandre bedre.»
 *
 * A1 (regler), A5 (Bayes) og A6 (signaler) er alle slutninger om HVOR kortene
 * ligger. Til nå har ingen av dem vært målt på det de faktisk gjør — bare på
 * poeng, gjennom flere lag med støy. Her måles de på sin egen jobb, og armene
 * kjøres på NØYAKTIG samme stillinger og samme kort:
 *
 *   av      ingen slutning utover renonser og budrunden
 *   regel   A1
 *   bayes   A5
 *   bayes+g A5 + A6
 *
 * Er `bayes` ikke bedre enn `av`, er A5 pynt uansett hva poengene sier.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeKort } from "../src/motor.ts";
import { lagIndre, ADAMS_MAALT, lesNett, tall } from "../src/moe2/agentspek.ts";
import { monteTro } from "../src/moe2/montetro.ts";
import { lagVerdensvekt, type Vektkilde } from "../src/moe2/verdensvekt.ts";
import type { Vrakvekt } from "../src/solver/sampler.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { forover } from "../src/nevro/nett.ts";
import { e1SpillTrekk } from "../src/e1/trekk.ts";
import { lagRng } from "../src/kort.ts";
import { STANDARDNETT } from "../src/moe2/agentspek.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const GIVER = tall(arg("--giver", "60"), 60, "giver");
const VERDENER = tall(arg("--verdener", "24"), 24, "verdener");
const KAND = tall(arg("--kandidater", "8"), 8, "kandidater");
const FRAstikk = tall(arg("--frastikk", "2"), 2, "frastikk");
/**
 * SPREDNINGEN OVER STIKK — og hvorfor den mangler i g-kjøringen.
 *
 * Med `--pergiv 4` og ett stikk om gangen tas de fire første LOVLIGE
 * stillingene i giv, og et stikk har nøyaktig fire seter. Resultatet er at
 * hele målingen ligger i ETT stikk: 688 av 800 rader i `tro-g*.jsonl` er
 * stikk 4, resten stikk 5.
 *
 * Det er den dyreste blindsonen i prøven, for troen skal jo bli SKARPERE
 * utover i runden — flere kort er sett, flere renonser er avslørt, og A6 har
 * rukket å sende noe. En K8-dom lest av stikk 4 alene sier ingenting om stikk
 * 9.
 *
 * `--perstikk` begrenser derfor hvor mange seter som måles i samme stikk, slik
 * at `--pergiv` tvinges til å fordele seg utover runden. Standarden er 4, som
 * er bit-identisk med den gamle oppførselen (vedleggsregel 5: en knott må ha
 * et nullpunkt som er identisk med «av»).
 */
const PERSTIKK = tall(arg("--perstikk", "4"), 4, "perstikk");
const PERGIV = tall(arg("--pergiv", "4"), 4, "pergiv");
/**
 * SPEKKEN SOM SPILLER RUNDEN.
 *
 * Den er et FLAGG fordi A6 ikke kan maales uten den. Signalering er en
 * konvensjon: leseren finner bare et signal hvis noen SENDTE et. Med drivere
 * uten sendersiden leser `signalForenlighet` vilkaarlige kortvalg som
 * meldinger - stoey som bevis - og det var noeyaktig hvorfor A6 maalte
 * DAARLIGERE enn ingenting i foerste kjoering.
 */
const DRIVER = arg("--drivere", ADAMS_MAALT);
/**
 * KANAL 2 SOM EGEN ARM — «bayes+W».
 *
 * 0 = armen finnes ikke, og da er hele fila bit-identisk med foer
 * (vedleggsregel 5). Med `--vrakalfa 2` legges armen til bakerst.
 *
 * OG HER ER FELLA DEN ER BYGD FOR AA UNNGAA. Kanal 2 vekter verdener etter hvor
 * mange sidefargerenonser budvinneren har - et bevis om HENNES haand, lest av
 * de fire kortene hun kastet. Er observatoeren SELV budvinneren, kjenner hun
 * baade sin egen haand og sitt eget vrak: `trekkVerden` setter da
 * `doedKapasitet = 0`, `vrakVerden` blir tom, og `vrakLogVekt` returnerer 0.
 * Kanalen er stum der - ikke svak, stum.
 *
 * Maalt utenfor denne fila: 22 avvikende valg med `amu:alle`, 0 med
 * `amu:foerer`. En maaling som bare ser paa budvinnerens eget sete ville
 * konkludert «kanal 2 gjoer ingenting» naar sannheten er «kanal 2 KAN ikke
 * gjoere noe der». Derfor bokfoeres `erBv` per rad, og rapporten skiller de to
 * setene.
 */
const VRAKALFA = Number(arg("--vrakalfa", "0"));
const UT = arg("--ut", "analyse/tro-noyaktighet-0.jsonl");
const [SI, SN] = (arg("--skard", "0/1").split("/") as [string, string]).map(Number) as [number, number];

/** Relativt sete, samme koding som `fyllSanser` og `monteTro`. */
const rel = (sete: number, p: number, n: number): number => (p - sete + n) % n;

const nett = lesNett(STANDARDNETT);
const atferd = {
  logits: (st: GameState, s2: number) => forover(nett, e1SpillTrekk(st, s2, nett.lag[0]!.inn)),
};

interface Arm {
  navn: string;
  kilde: Vektkilde;
  signal: boolean;
  /** KANAL 2. Udefinert = av, og da gaar `monteTro` den gamle veien. */
  vrakvekt?: Vrakvekt;
}
/**
 * ARMENE, OG HVORFOR «g» MAA MAALES ALENE.
 *
 * Arvind: «alle deler skal fungere i samspill og gjoere hverandre bedre.»
 *
 * Med bare `bayes` og `bayes+g` kan man se OM signalet hjelper oppaa Bayes,
 * men ikke om de to FORSTERKER hverandre. Til det trengs A6 alene:
 *
 *     superadditivitet = (bayes+g - av) - [(bayes - av) + (g - av)]
 *
 * Er den positiv, gjoer delene hverandre bedre. Er den negativ, leser de det
 * samme beviset to ganger - og det er ikke hypotetisk her: `sd-orakel` skrev
 * ned fra foerst av at A1 og A5 IKKE kan stables av noeyaktig den grunnen.
 * A6 ble antatt aa vaere uavhengig. Denne armen proever antakelsen.
 */
const ARMER: Arm[] = [
  { navn: "av", kilde: "av", signal: false },
  { navn: "regel", kilde: "regel", signal: false },
  { navn: "bayes", kilde: "bayes", signal: false },
  { navn: "g", kilde: "av", signal: true },
  { navn: "bayes+g", kilde: "bayes", signal: true },
];
/**
 * BETA = 0, ikke fordi null er riktig, men fordi det er det `amuagent` bruker:
 * `(vrakalfa ?? 0) > 0 ? { alfa, beta: 0 }`. Maaler vi noe annet enn det boten
 * ville kjoert, maaler vi ikke boten.
 */
if (VRAKALFA > 0) {
  ARMER.push({ navn: "bayes+W", kilde: "bayes", signal: false, vrakvekt: { alfa: VRAKALFA, beta: 0 } });
}

/**
 * Hvilke seter kan holde et kort i fargen, gitt KJENT renons?
 *
 * Dette er gulv+: den kunnskapen som allerede ligger i reglene, ikke i noen
 * slutning. Å slå det naive gulvet beviser ingenting, siden trekningen
 * håndhever renonser uansett.
 */
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
  const frø = 12_000_000 + g * 6151;
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
        /**
         * SETET SOM AVGJOER OM KANAL 2 KAN FYRE I DET HELE TATT.
         *
         * Skrives bare naar armen finnes, slik at nullpunktet (`--vrakalfa 0`)
         * er bit-identisk med kjoeringene foer denne. Uten feltet maatte
         * rapporten gjette, og en gjetning er ikke en maaling.
         */
        if (VRAKALFA > 0) rad.erBv = sete === s.budvinner ? 1 : 0;
        rad.gulv = Number((gulvTap / kort).toFixed(5));
        rad.gulvPluss = Number((gulvPlussTap / kort).toFixed(5));

        for (const arm of ARMER) {
          /**
           * SAMME FRØ PER ARM. Uten det skiller armene seg på hvilke verdener
           * som tilfeldigvis ble trukket, ikke på slutningen — samme prinsipp
           * som duplikatgiverne på benken.
           */
          const rng = lagRng(31_000_000 + g * 97 + s.stikkSpilt);
          const vekt = lagVerdensvekt(s, sete, {
            kilde: arm.kilde,
            signal: arm.signal,
            atferd,
          });
          const tro = monteTro(s, sete, VERDENER, rng, vekt, KAND, arm.vrakvekt);
          if (tro === null) {
            rad[arm.navn] = NaN;
            continue;
          }
          let tap = 0;
          let treff = 0;
          /**
           * HVOR OFTE BINDER GULVET PAA SANNSYNLIGHETEN?
           *
           * Gulvet 1/(2V) finnes bare for aa hindre log(0). Men binder det
           * OFTE, maaler vi Monte-Carlo-opploesningen igjen - noeyaktig feilen
           * som gjorde V=12 ubrukelig - og alle armene presses mot samme tak
           * uansett hvor gode de er. Da ville en null mellom armene vaere en
           * artefakt, ikke et funn. Derfor bokfoeres andelen, saa dommen kan
           * avvises hvis den er hoey.
           */
          let gulvBandt = 0;
          for (let p = 0; p < s.antallSpillere; p++) {
            if (p === sete) continue;
            const r = rel(sete, p, s.antallSpillere);
            if (r < 1 || r > 3) continue;
            for (const k of s.hender[p] ?? []) {
              const rader = tro[kortIndeks(k)]!;
              /**
               * RENORMALISERING — og uten den var hele maalingen feil.
               *
               * `monteTro` gir P(kort k hos sete r), og de tre radene summerer
               * IKKE til 1: resten er sannsynligheten for at kortet ligger i
               * TALONGEN. Maalt: 0,531-0,953 for skjulte kort, aldri 1,0.
               *
               * Gulvet vaart betinger derimot paa at kortet ER paa en haand -
               * vi teller jo faktiske hender. Aa sammenlikne en marginal mot en
               * betinget fordeling gjorde troen kunstig daarlig, og foerste
               * kjoering «viste» at Adams var verre enn uniform. Det var min
               * maaling som var gal, ikke troen.
               *
               * Her deles derfor paa summen, som gir P(sete r | kortet er paa
               * en haand) - samme betingelse som gulvet.
               */
              const sum = (rader[0] ?? 0) + (rader[1] ?? 0) + (rader[2] ?? 0);
              const rå = sum > 1e-9 ? (rader[r - 1] ?? 0) / sum : 0;
              // GULV PAA SANNSYNLIGHETEN: med N verdener kan det sanne setet
              // faa eksakt 0 fordi ingen trukket verden la kortet der, og
              // log(0) ville gjort snittet uendelig. Gulvet er
              // Monte-Carlo-opploesningen, ikke en tro.
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
