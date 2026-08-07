/**
 * HVOR STORT ER BELIEFROMMET EGENTLIG? – talt, ikke anslått.
 *
 *   node examples/beliefrom.ts --giver 300
 *
 * Arvind: «er ikke PBS mye mindre enn det hvis vi tenker oss om?»
 *
 * Han har rett i at mitt tall var misvisende. C(36,12) ≈ 1,25 mrd. gjelder
 * ved RUNDENS START. Kombinatorisk krymper rommet slik når k kort gjenstår
 * per spiller — (3k)!/(k!)³:
 *
 *   k=6 → 17 153 136     k=4 → 34 650     k=3 → 1 680     k=2 → 90
 *
 * Men de tallene er ØVRE GRENSER som ignorerer alt vi har sett. Renonser,
 * det etterlyste kortet og talongkapasiteten kutter dem kraftig, og hvor
 * mye er et empirisk spørsmål. `tellVerdener` i solver/eksakt.ts regner det
 * eksakt fra det observatøren faktisk vet.
 *
 * HVA SVARET AVGJØR. En Public-Belief-State-løsning må representere hele
 * posterioren. Er den under noen tusen, er den håndterbar; er den i
 * millionklassen, er den ikke det. Kurven over stikk sier hvor i runden en
 * slik løsning i det hele tatt kan begynne.
 *
 * OG DET ANDRE TALLET SOM MÅ MED. PBS' fortrinn over eksakt PIMC er at den
 * ikke lider av STRATEGIFUSJON – den kan ikke spille ulikt i verdener den
 * ikke kan skille. Er rommet lite nok, men fusjonen koster null, kjøper PBS
 * ingenting. Derfor rapporteres også hvor mange stillinger som har mer enn
 * ett eget kortvalg igjen: det er der fusjon i det hele tatt KAN oppstå.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, lovligeKort, type GameState, type Handling } from "../src/index.ts";
import { lesInformasjon, tellVerdener, råAntall } from "../src/solver/eksakt.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";

let giver = 300;
let frøBase = 8_800_000;
let spek = "vakt:abmp:e1:e1-modell/d7alle.bin";
let ut = "analyse/beliefrom.txt";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--giver") giver = Number(process.argv[++i]);
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--ut") ut = process.argv[++i]!;
}

const vakt = delVaktspek(spek)!;
const nett = lesE1Nett(vakt.indre.slice(3));
type Velger = { velgHandling(s: GameState): Handling; nyKamp(): void };
const lag = (): Velger => new Konvensjonsvakt(new E1Agent(nett), vakt.valg);

interface Bøtte {
  n: number;
  verdener: number[];
  rå: number[];
  flervalg: number;
}
const perStikk = new Map<number, Bøtte>();

for (let f = 0; f < giver; f++) {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, (frøBase + f) >>> 0);
  const v = [0, 1, 2, 3].map(() => lag());
  for (const b of v) b.nyKamp();
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    if (s.fase === "SPILL" && s.iTur !== null) {
      const sete = s.iTur;
      const st = s.stikkSpilt;
      const e = perStikk.get(st) ?? { n: 0, verdener: [], rå: [], flervalg: 0 };
      e.n++;
      if (lovligeKort(s, sete).length > 1) e.flervalg++;
      try {
        const info = lesInformasjon(s, sete);
        const antall = tellVerdener(info);
        if (Number.isFinite(antall) && antall > 0) {
          e.verdener.push(antall);
          e.rå.push(råAntall(info));
        }
      } catch {
        // Stillinger enumeratoren ikke kan lese hoppes over, ikke gjettes paa.
      }
      perStikk.set(st, e);
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    s = utfør(s, v[iTur]!.velgHandling(s)).state;
  }
}

const median = (v: number[]): number => {
  if (v.length === 0) return NaN;
  const w = [...v].sort((a, b) => a - b);
  return w[Math.floor(w.length / 2)]!;
};
const kvant = (v: number[], p: number): number => {
  if (v.length === 0) return NaN;
  const w = [...v].sort((a, b) => a - b);
  return w[Math.min(w.length - 1, Math.floor(p * w.length))]!;
};
const kort = (x: number): string =>
  !Number.isFinite(x) ? "-" : x >= 1e6 ? `${(x / 1e6).toFixed(1)} mill.` : x >= 1000 ? `${(x / 1000).toFixed(1)}k` : x.toFixed(0);

const L = [
  ``,
  `=== HVOR STORT ER BELIEFROMMET? ===`,
  `${giver} giver, ${spek}. Talt med tellVerdener() i solver/eksakt.ts,`,
  `altsaa antall verdener som er FORENLIGE med det setet faktisk har sett.`,
  ``,
  `stikk    n     median      75 %       90 %    | uten renonser  | flervalg`,
  `------------------------------------------------------------------------`,
];
for (const st of [...perStikk.keys()].sort((a, b) => a - b)) {
  const e = perStikk.get(st)!;
  if (e.verdener.length === 0) continue;
  L.push(
    `${String(st).padStart(5)} ${String(e.n).padStart(6)} ${kort(median(e.verdener)).padStart(10)} ` +
      `${kort(kvant(e.verdener, 0.75)).padStart(9)} ${kort(kvant(e.verdener, 0.9)).padStart(10)} | ` +
      `${kort(median(e.rå)).padStart(12)} | ${((100 * e.flervalg) / e.n).toFixed(0).padStart(6)} %`,
  );
}
L.push(
  `------------------------------------------------------------------------`,
  ``,
  `«uten renonser» er raa-antallet foer det observerte spillet trekkes fra.`,
  `Avstanden mellom de to kolonnene ER trosoppdateringen, malt i verdener.`,
  ``,
  `«flervalg» er andelen stillinger med mer enn ett lovlig kort. Bare der kan`,
  `STRATEGIFUSJON oppstaa - og fusjon er hele PBS' fortrinn over eksakt PIMC.`,
  `Prosjektet har allerede maalt hva fusjonen koster: +0,14 +/- 0,19 (n=2665),`,
  `altsaa ikke til aa skille fra null.`,
  ``,
  `LESEVEILEDNING. En PBS-loesning maa representere HELE posterioren. Der`,
  `medianen er under noen tusen er det haandterbart; i millionklassen er det`,
  `ikke det. Kurven sier derfor hvor i runden en slik loesning kan begynne -`,
  `og fusjonstallet sier om den ville vaert verdt noe naar den kunne.`,
  ``,
);
const tekst = L.join("\n");
console.log(tekst);
mkdirSync(dirname(ut), { recursive: true });
writeFileSync(ut, tekst + "\n");
