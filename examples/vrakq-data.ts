/**
 * VRAKQ-DATA — vrak og trumf merket mot SEIERSMÅLET, med dagens appbot som policy (11. sep).
 *
 *   node examples/vrakq-data.ts --kamper 1200 --skard 0/12 --verdener 12 --ut D:/amb-grp/vrakq/d0/s0.jsonl
 *     [--spek <policy>] [--sjanse 0.25] [--froe 23000000] [--maksrunder 60]
 *     [--seier e1-modell/seier-g0.bin] [--blanding 0.3]
 *
 * BudQ-oppskriften (examples/budq-data.ts) flyttet til vraket. Vrakrangereren som er ute i
 * dag (`vrakrang.bin`) ble merket 4. august med RUNDEPOENG, NevroHjernes kort og budmodellen
 * som utspillere, i enkeltrunder. Tre ting er annerledes her:
 *
 *   1. MÅLET er å vinne KAMPEN: 100·ΔP(seier) for budvinneren, lest av seiersprediktoren
 *      (fasiten 0/1 når runden avslutter kampen), blandet med λ·rundepoeng som i BudQ-s2 –
 *      rent seiersmål ga vågale valg der prediktoren ekstrapolerer.
 *   2. POLICYEN er appens kjede (BudQ, konvensjonsvakt, E1-kortnettet), og stillingene er de
 *      den havner i i kamper til 100 – ekspertiterasjon, ikke enkeltrunder.
 *   3. KANDIDATENE er NØYAKTIG settet `Vrakrangerer` velger mellom ved spilletid
 *      (`vrakkandidater` over fire trumffarger + NevroHjernes eget par), så et nett trent her
 *      rangerer det samme settet det skal brukes på.
 *
 * FORMATET er `verktoy/vrak-tren.py` sitt: én linje per stilling med alle kandidatene.
 * `v` er den blandede etiketten treneren leser; `vs` (seier) og `vp` (rundepoeng) står ved
 * siden av, så blandingen kan velges på nytt uten ny data. POLICYENS eget par merkes `nevro: 1`
 * – treneren kaller referansen «NevroHjernes anger», men her er det dagens vrakrangerer den
 * måles mot, og det er den et nytt nett må slå.
 *
 * INGEN FASIT I ETIKETTEN: verdenene trekkes fra budvinnerens visning (egen hånd + talong), og
 * alle kandidatene får de SAMME verdenene. Den virkelige given brukes bare til å spille kampen
 * videre. Utspillingene har egne agentinstanser – vrakrangereren husker trumfen mellom VRAK og
 * VELG, og det skal ikke lekke mellom kandidatene.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { FARGER, lagRng, type Farge, type Kort } from "../src/kort.ts";
import { lovligeEtterlys, opprettSpill, utfør, type GameState } from "../src/motor.ts";
import { lagIndre, tall } from "../src/moe2/agentspek.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { lesVrakflagg } from "../src/moe2/vrakpolicy.ts";
import { vrakkandidater } from "../src/moe2/vrakrang.ts";
import { vraktrekk } from "../src/moe2/vraktrekk.ts";
import { Seiersprediktor } from "../src/mlb/seier.ts";
import { NevroAgent } from "../src/nevro/index.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const KAMPER = tall(arg("--kamper", "1200"), 1200, "kamper");
const [SI, SN] = arg("--skard", "0/1").split("/").map(Number) as [number, number];
const K = tall(arg("--verdener", "12"), 12, "verdener");
const SJANSE = Number(arg("--sjanse", "0.25"));
const FRØ = tall(arg("--froe", "23000000"), 23_000_000, "froe");
const MAKSRUNDER = tall(arg("--maksrunder", "60"), 60, "maksrunder");
const SPEK = arg(
  "--spek",
  "vr:e1-modell/vrakrang.bin:telrd:budq:e1-modell/budq-s3.bin:vakt:abmp:e1:e1-modell/d7alle.bin",
);
const UT = arg("--ut", "D:/amb-grp/vrakq/d0/s0.jsonl");
const prediktor = Seiersprediktor.fraFil(arg("--seier", "e1-modell/seier-g0.bin"));
const BLANDING = Number(arg("--blanding", "0.3"));
const FLAGG = arg("--flagg", "telrd");
mkdirSync(dirname(UT), { recursive: true });

const kamp = [0, 1, 2, 3].map(() => lagIndre(SPEK));
const utspill = [0, 1, 2, 3].map(() => lagIndre(SPEK));
/** Egen instans for å lese POLICYENS par (vrak + trumfen den velger etter), uten å røre kampen. */
const policyRef = lagIndre(SPEK);
const nevroRef = new NevroAgent();
const pol = lesVrakflagg(FLAGG);
const nøkkel = (vrak: readonly Kort[], trumf: Farge): string =>
  `${trumf}|${vrak.map((k) => `${k.farge}${k.verdi}`).sort().join(",")}`;

function vinnersjanse(s: GameState, sete: number): number {
  if (s.fase === "FERDIG") return s.vinner === sete ? 1 : 0;
  return prediktor.fordeling(s.totalPoeng, sete, s.regler.målPoeng)[0]!;
}

/** Et agentpar (vrak, så trumfen det velger på hånden som blir igjen). */
function parFra(agent: { velgHandling(s: GameState): ReturnType<(typeof kamp)[0]["velgHandling"]> }, s: GameState, sete: number): { trumf: Farge; vrak: Kort[] } | null {
  const h = agent.velgHandling(s);
  if (h.type !== "VRAK") return null;
  const etter = utfør(s, h).state;
  const v = agent.velgHandling(etter);
  if (v.type !== "VELG") return null;
  return { trumf: v.trumf, vrak: h.kort.slice() };
}

/** Tving paret, spill runden ferdig med utspillerne, og les av begge målene for budvinneren. */
function spillUt(start: GameState, sete: number, p: { trumf: Farge; vrak: Kort[] }): { vs: number; vp: number } {
  let s = utfør(start, { type: "VRAK", spiller: sete, kort: p.vrak }).state;
  const kand = lovligeEtterlys(s, p.trumf);
  s = utfør(s, { type: "VELG", spiller: sete, trumf: p.trumf, etterlyst: kand.length > 0 ? kand[kand.length - 1]! : null }).state;
  const runde = start.rundeNr;
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && s.rundeNr === runde && vakt++ < 400) {
    const i = s.iTur;
    if (i === null) break;
    s = utfør(s, utspill[i]!.velgHandling(s)).state;
  }
  const d = s.sisteRunde?.delta ?? [0, 0, 0, 0];
  const egne = d[sete] ?? 0;
  const vp = egne - (d.reduce((a, x) => a + x, 0) - egne) / (d.length - 1);
  return { vs: 100 * (vinnersjanse(s, sete) - vinnersjanse(start, sete)), vp };
}

const rund = (x: number, n = 1000): number => Math.round(x * n) / n;
const velg = lagRng(9_300_000 + SI);
let skrevet = 0;
const t0 = Date.now();
for (let g = 0; g < KAMPER; g++) {
  if (g % SN !== SI) continue;
  const frø = FRØ + g * 7717;
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, frø);
  for (const a of kamp) a.nyKamp();
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.rundeNr < MAKSRUNDER && vakt++ < 40_000) {
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (sete === null || sete === undefined) break;

    if (s.fase === "VRAK" && velg() < SJANSE) {
      const hånd = (s.hender[sete] ?? []).slice();
      const antall = s.giving.talong;
      const par: { trumf: Farge; vrak: Kort[] }[] = [];
      const sett = new Set<string>();
      const legg = (p: { trumf: Farge; vrak: Kort[] } | null): void => {
        if (p === null || p.vrak.length !== antall) return;
        const n = nøkkel(p.vrak, p.trumf);
        if (!sett.has(n)) {
          sett.add(n);
          par.push(p);
        }
      };
      for (const trumf of FARGER) for (const vrak of vrakkandidater(hånd, trumf, antall, pol)) legg({ trumf, vrak });
      legg(parFra(nevroRef, s, sete));
      const policyPar = parFra(policyRef, s, sete);
      legg(policyPar);
      const policyNøkkel = policyPar === null ? "" : nøkkel(policyPar.vrak, policyPar.trumf);

      if (par.length >= 2) {
        const verdener = trekkVerdener(s, sete, K, lagRng((frø * 31 + skrevet * 104_729 + sete) >>> 0), undefined, undefined, 32, undefined, true);
        if (verdener.length >= 4) {
          const kand = par.map((p) => {
            const u = verdener.map((hender) => spillUt(medVerden(s, hender, sete), sete, p));
            const vs = u.reduce((a, x) => a + x.vs, 0) / u.length;
            const vp = u.reduce((a, x) => a + x.vp, 0) / u.length;
            return {
              t: Array.from(vraktrekk(s, sete, hånd, p.vrak, p.trumf), (z) => rund(z, 10_000)),
              v: rund(vs + BLANDING * vp),
              vs: rund(vs),
              vp: rund(vp),
              ...(nøkkel(p.vrak, p.trumf) === policyNøkkel ? { nevro: 1 } : {}),
            };
          });
          appendFileSync(UT, JSON.stringify({ frø, runde: s.rundeNr, sete, n: verdener.length, blanding: BLANDING, kand }) + "\n");
          skrevet++;
        }
      }
    }
    s = utfør(s, kamp[sete]!.velgHandling(s)).state;
  }
  process.stdout.write(`\r  skard ${SI}/${SN}: kamp ${g}, ${skrevet} vrakstillinger, ${((Date.now() - t0) / 1000).toFixed(0)} s   `);
}
console.log(`\nSkard ${SI}/${SN} ferdig: ${skrevet} vrakstillinger → ${UT}`);
