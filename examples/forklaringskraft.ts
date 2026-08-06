/**
 * HVOR MYE AV ADAMS' VALG KAN VI GJØRE REDE FOR?
 *
 * ARVIND: «hvor mye forklaringskraft har modellen våres nå?»
 *
 * Ablasjonen (`examples/ablasjon.ts`) svarer på hvilke INNGANGER som betyr
 * noe. Den svarer ikke på om vi kan SI hvorfor et bestemt kort ble spilt.
 *
 * Dette måler det direkte: hvor ofte treffer en enkel, lesbar regel nøyaktig
 * det kortet nettet valgte? Treffer «legg lavest lovlige» 55 %, kan vi gjøre
 * rede for 55 % av valgene med én setning — og resten er, per i dag,
 * uforklart.
 *
 * REGLENE ER MED VILJE TRIVIELLE. Poenget er ikke å bygge en god spiller, men
 * å måle hvor stor del av policyen som er triviell. En regel som treffer ofte
 * forteller at nettet der ikke gjør noe vi ikke allerede kan formulere.
 *
 * NEVROHJERNE er tatt med som en LÆRT referanse: den er et annet nett, trent
 * på andre data. Treffer den høyt, er de to enige om det meste, og «hvorfor»
 * er da et spørsmål om hva de DELER, ikke om hva Adams gjør spesielt.
 *
 * TVUNGNE VALG ER UTE AV NEVNEREN, som i ablasjonen: der er nettet ikke
 * involvert, og å telle dem ville blåst hver regel opp mot 100 %.
 */

import { appendFileSync, readFileSync } from "node:fs";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeKort } from "../src/motor.ts";
import { FARGER, type Farge, type Kort } from "../src/kort.ts";
import { forover, nettFraBytes } from "../src/nevro/nett.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { e1SpillTrekk } from "../src/e1/trekk.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { lagIndre, ADAMS, tall } from "../src/moe2/agentspek.ts";

const arg = (n: string, s: string) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const GIVER = tall(arg("--giver", "300"), 300, "giver");
const FRØ = tall(arg("--froe", "900000"), 900000, "froe");
const NETTFIL = arg("--nett", "e1-modell/d7alle.bin");
const UT = arg("--ut", "analyse/forklaringskraft.jsonl");

const nett = nettFraBytes(new Uint8Array(readFileSync(NETTFIL)))[0]!;
const DIM = nett.lag[0]!.inn;
const nevro = new NevroAgent();

/** Hvem vinner stikket slik det ligger nå, gitt at `k` legges? */
function vinnerMed(bord: readonly { kort: Kort }[], k: Kort, trumf: Farge | null): boolean {
  if (bord.length === 0) return true;
  const led = bord[0]!.kort.farge;
  let best = bord[0]!.kort;
  for (const b of bord) {
    if (b.kort.farge === best.farge ? b.kort.verdi > best.verdi : trumf !== null && b.kort.farge === trumf)
      best = b.kort;
  }
  if (k.farge === best.farge) return k.verdi > best.verdi;
  return trumf !== null && k.farge === trumf && best.farge !== trumf;
}

const lav = (ks: readonly Kort[]) => ks.reduce((a, b) => (b.verdi < a.verdi ? b : a));
const høy = (ks: readonly Kort[]) => ks.reduce((a, b) => (b.verdi > a.verdi ? b : a));

/** De lesbare reglene. Hver tar stillingen og gir ett kort. */
const REGLER: { navn: string; velg: (s: GameState, sete: number, lov: Kort[]) => Kort }[] = [
  { navn: "legg LAVEST lovlige", velg: (_s, _p, l) => lav(l) },
  { navn: "legg HØYEST lovlige", velg: (_s, _p, l) => høy(l) },
  {
    navn: "vinn billigst, ellers kast lavest",
    velg: (s, _p, l) => {
      const vinner = l.filter((k) => vinnerMed(s.bord, k, s.trumf));
      return vinner.length > 0 ? lav(vinner) : lav(l);
    },
  },
  {
    navn: "vinn billigst, men ALDRI over makker",
    velg: (s, sete, l) => {
      const makkerLeder =
        s.makker !== null &&
        s.bord.length > 0 &&
        (() => {
          let best = s.bord[0]!;
          for (const b of s.bord)
            if (b.kort.farge === best.kort.farge ? b.kort.verdi > best.kort.verdi : s.trumf !== null && b.kort.farge === s.trumf)
              best = b;
          const lag = sete === s.budvinner || sete === s.makker;
          const bestLag = best.spiller === s.budvinner || best.spiller === s.makker;
          return lag === bestLag;
        })();
      if (makkerLeder) return lav(l);
      const vinner = l.filter((k) => vinnerMed(s.bord, k, s.trumf));
      return vinner.length > 0 ? lav(vinner) : lav(l);
    },
  },
  {
    navn: "lengste farge, lavest i den",
    velg: (s, sete, l) => {
      const hånd = s.hender[sete] ?? [];
      const tell: Record<string, number> = {};
      for (const k of hånd) tell[k.farge] = (tell[k.farge] ?? 0) + 1;
      const beste = (FARGER as readonly Farge[]).reduce((a, b) => ((tell[b] ?? 0) > (tell[a] ?? 0) ? b : a));
      const i = l.filter((k) => k.farge === beste);
      return i.length > 0 ? lav(i) : lav(l);
    },
  },
  { navn: "NevroHjerne (annet nett)", velg: (s, sete) => {
      const h = nevro.velgHandling(s);
      return h.type === "SPILL" ? h.kort : lav(lovligeKort(s, sete));
    } },
];

const treff = new Array(REGLER.length).fill(0);
let frie = 0;
let tvungne = 0;
/** Enighet mellom REGLENE innbyrdes, som referanse for hvor lett stillingen er. */
let enigeAlle = 0;

for (let g = 0; g < GIVER; g++) {
  const ag = [0, 1, 2, 3].map(() => lagIndre(ADAMS));
  let s: GameState = opprettSpill({ antallSpillere: 4 }, FRØ + g * 7717);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
    if (s.fase === "SPILL" && s.iTur !== null) {
      const sete = s.iTur;
      const lov = lovligeKort(s, sete);
      if (lov.length === 1) tvungne++;
      else {
        frie++;
        const logits = forover(nett, e1SpillTrekk(s, sete, DIM));
        let beste = lov[0]!;
        for (const k of lov) if (logits[kortIndeks(k)]! > logits[kortIndeks(beste)]!) beste = k;
        const valgt = kortIndeks(beste);
        const svar: number[] = [];
        for (let i = 0; i < REGLER.length; i++) {
          const k = kortIndeks(REGLER[i]!.velg(s, sete, lov));
          svar.push(k);
          if (k === valgt) treff[i]!++;
        }
        if (new Set(svar).size === 1) enigeAlle++;
      }
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, ag[iTur]!.velgHandling(s)).state;
  }
}

console.log(`# FORKLARINGSKRAFT for ${NETTFIL}, ${GIVER} giver`);
console.log(`# ${frie + tvungne} beslutninger: ${frie} frie, ${tvungne} tvungne (${((100 * tvungne) / (frie + tvungne)).toFixed(1)} %)`);
console.log(`# alle regler enige i ${((100 * enigeAlle) / frie).toFixed(1)} % av de frie – der er stillingen triviell\n`);
console.log(`${"regel".padEnd(36)} ${"treff".padStart(7)} ${"andel".padStart(8)}`);
const ut: Record<string, number> = {};
for (let i = 0; i < REGLER.length; i++) {
  const a = treff[i]! / frie;
  ut[REGLER[i]!.navn] = a;
  console.log(`${REGLER[i]!.navn.padEnd(36)} ${String(treff[i]).padStart(7)} ${(100 * a).toFixed(1).padStart(7)}%`);
}
appendFileSync(UT, JSON.stringify({ nett: NETTFIL, giver: GIVER, frie, tvungne, enigeAlle, regler: ut }) + "\n");
