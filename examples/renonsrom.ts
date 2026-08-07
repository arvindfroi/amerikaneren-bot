/**
 * HVOR MYE RENONSKUNNSKAP FINNES DET Å GI NETTET?
 *
 *   node examples/renonsrom.ts --giver 300
 *
 * IDEEN, og hvorfor den er smalere enn «gi boten hukommelse». De 273 trekkene
 * koder allerede hvilke kort som er SPILT – rå historikk mangler ikke. Det som
 * mangler er den AVLEDEDE slutningen: «spiller 2 er bevist renons i hjerter».
 * Den finnes i `infererRenonce`, men den bor i sampleren, og den utplasserte
 * boten kaller aldri sampleren. Vi regner den ut og kaster den.
 *
 * Slutningen er EKSAKT, ikke sannsynlig: følgeplikten i `lovligeKort` gjør at
 * den som ikke fulgte farge, ikke HADDE fargen. 4 spillere × 4 farger = 16 bit.
 *
 * FØR NOE BYGGES: mål overflaten. Vakt `k` viste i går at en riktig idé kan ha
 * 0,1 % flate og dermed være verdiløs uansett hvor riktig den er. De to
 * tallene som avgjør:
 *
 *   HVOR OFTE finnes minst én bevist renons hos en motstander?
 *   HVOR OFTE ER DEN RELEVANT – altså: vet vi at en motstander er renons i
 *   fargen som ER i spill, eller i trumf? Et renonsflagg for en farge som
 *   ikke betyr noe i stillingen er informasjon uten anvendelse.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, lovligeKort, type GameState, type Handling } from "../src/index.ts";
import { infererRenonce } from "../src/solver/sampler.ts";
import { lagetSynlig } from "../src/moe2/synlig.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { FARGER } from "../src/kort.ts";

let giver = 300;
let frøBase = 9_900_000;
let spek = "vakt:abmp:e1:e1-modell/d7alle.bin";
let ut = "analyse/renonsrom.txt";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--giver") giver = Number(process.argv[++i]);
  else if (a === "--ut") ut = process.argv[++i]!;
}

const vakt = delVaktspek(spek)!;
const nett = lesE1Nett(vakt.indre.slice(3));
type Velger = { velgHandling(s: GameState): Handling; nyKamp(): void };
const lag = (): Velger => new Konvensjonsvakt(new E1Agent(nett), vakt.valg);

interface B {
  n: number;
  noen: number;
  motstander: number;
  ledetFarge: number;
  trumf: number;
  bit: number;
}
const perStikk = new Map<number, B>();

for (let f = 0; f < giver; f++) {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, (frøBase + f) >>> 0);
  const v = [0, 1, 2, 3].map(() => lag());
  for (const b of v) b.nyKamp();
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    if (s.fase === "SPILL" && s.iTur !== null && s.trumf !== null) {
      const sete = s.iTur;
      const st = s.stikkSpilt;
      const e = perStikk.get(st) ?? { n: 0, noen: 0, motstander: 0, ledetFarge: 0, trumf: 0, bit: 0 };
      e.n++;
      // Bare stillinger med et ekte valg teller – ellers er informasjon uansett
      // uten anvendelse.
      if (lovligeKort(s, sete).length > 1) {
        const voids = infererRenonce(s);
        const vårt = lagetSynlig(s, sete);
        let harNoen = false;
        let harMot = false;
        let bit = 0;
        for (let p = 0; p < s.antallSpillere; p++) {
          if (p === sete) continue;
          const sett = voids[p];
          if (!sett || sett.size === 0) continue;
          harNoen = true;
          bit += sett.size;
          // «Motstander» krever at vi VET hvem som er motstander. Vet vi det
          // ikke, teller den ikke – vakten leser aldri laget den ikke kan se.
          if (vårt !== null && !vårt.includes(p)) harMot = true;
          const ledet = s.bord.length > 0 ? s.bord[0]!.kort.farge : null;
          if (ledet !== null && sett.has(FARGER.indexOf(ledet))) e.ledetFarge++;
          if (sett.has(FARGER.indexOf(s.trumf))) e.trumf++;
        }
        if (harNoen) e.noen++;
        if (harMot) e.motstander++;
        e.bit += bit;
      }
      perStikk.set(st, e);
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    s = utfør(s, v[iTur]!.velgHandling(s)).state;
  }
}

const pst = (a: number, b: number): string => `${((100 * a) / Math.max(1, b)).toFixed(1)} %`;
const L = [
  ``,
  `=== HVOR MYE RENONSKUNNSKAP FINNES? ===`,
  `${giver} giver, ${spek}. Bare stillinger med mer enn ett lovlig kort.`,
  `Renonsene er EKSAKTE: foelgeplikten gjoer at den som ikke fulgte farge,`,
  `ikke hadde den.`,
  ``,
  `stikk      n   noen renons   hos MOTSTANDER   i trumf   snitt bit (av 12)`,
  `----------------------------------------------------------------------------`,
];
let tn = 0;
let tnoen = 0;
let tmot = 0;
for (const st of [...perStikk.keys()].sort((a, b) => a - b)) {
  const e = perStikk.get(st)!;
  if (e.n === 0) continue;
  tn += e.n;
  tnoen += e.noen;
  tmot += e.motstander;
  L.push(
    `${String(st).padStart(5)} ${String(e.n).padStart(6)} ${pst(e.noen, e.n).padStart(13)} ` +
      `${pst(e.motstander, e.n).padStart(16)} ${pst(e.trumf, e.n).padStart(9)} ${(e.bit / e.n).toFixed(2).padStart(18)}`,
  );
}
L.push(
  `----------------------------------------------------------------------------`,
  `TOTALT ${String(tn).padStart(6)} ${pst(tnoen, tn).padStart(13)} ${pst(tmot, tn).padStart(16)}`,
  ``,
  `TOLKNING. «snitt bit» er hvor mange av de 12 mulige (3 andre spillere × 4`,
  `farger) renonsflaggene som er PAA. Er tallet nær 0 tidlig og lite selv sent,`,
  `har feltet lite aa baere - og da er 16 nye trekk ikke verdt en omtrening.`,
  ``,
  `Sammenlikn med vakt k, som var en riktig idé med 0,1 % flate og derfor`,
  `verdiloes. Overflaten avgjoer foer korrektheten gjoer det.`,
  ``,
);
const tekst = L.join("\n");
console.log(tekst);
mkdirSync(dirname(ut), { recursive: true });
writeFileSync(ut, tekst + "\n");
