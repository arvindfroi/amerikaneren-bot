/**
 * PERFEKSJONSVERDIEN PER STIKK – hvor i runden er et bedre kortvalg verdt noe?
 *
 *   node examples/perfeksjon-per-stikk.ts --kamper 400
 *
 * SPØRSMÅLET. Vi vet at spilleføringen vår henter +0,39 stikk mer enn
 * SD-estimatet, at MesterAI og menneskene henter +0,30, og at nevro henter
 * +0,00. Vi vet IKKE hvor mye som er igjen, eller hvor i runden det ligger.
 *
 * METODEN er substitusjon: spill runden helt normalt, men på ETT bestemt
 * stikk erstattes spilleførerens valg med et orakels. Resten spilles normalt
 * videre, så tallet fanger hele nedstrømseffekten av den ene bedre
 * beslutningen – ikke bare stikket den ble tatt i. Differansen mot samme giv
 * uten substitusjon er perfeksjonsverdien til akkurat det stikket.
 *
 * TO ORAKLER, og forskjellen mellom dem er hele poenget:
 *
 *   LOVLIG (SD): ser bare det setet selv kan se, og sampler verdener som er
 *   konsistente med det. Avstanden opp hit er FERDIGHET – den kan hentes.
 *
 *   JUKSENDE (DD): ser alle fire hendene. Avstanden fra det lovlige orakelet
 *   opp til dette er INFORMASJON vi aldri kan ha, uansett hvor god boten blir.
 *
 * Arvind spurte om dobbelt-dummy ikke er juks. Som SPILLER er den det, og
 * prosjektet har alt målt at den er en dårlig lærer (fasiten fikk −0,609
 * gjennom godkjenningsporten, altså feil fortegn). Som MÅLESTOKK er den ikke
 * juks – den er et tak vi aldri kan nå, og den er bare nyttig sammen med det
 * lovlige orakelet, fordi det er differansen som deler gapet i to.
 *
 * DETERMINISME. Både kandidaten og NevroHjerne er deterministiske, så samme
 * giv gir samme linje hver gang. Uten det ville differansen mellom
 * substitusjon og grunnlinje inneholdt ren replay-støy.
 *
 * | Flagg | Standard | Betydning |
 * |---|---|---|
 * | `--kamper` | 400 | antall givere |
 * | `--kontrakt` | 9 | tvungen kontrakt |
 * | `--kandidat` | vakt:ab:e1:e1-modell/sd-r2.bin | hvem som fører |
 * | `--verdener` | 12 | verdener det LOVLIGE orakelet sampler |
 * | `--ut` | analyse/perfeksjon.txt | varig utdata |
 */

import { writeFileSync } from "node:fs";

import { lovligeKort, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { lagRng } from "../src/kort.ts";
import { NevroAgent, besteTrumf } from "../src/nevro/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { besteKortSD } from "../src/moe2/sdkort.ts";
import { solverBesteKort } from "../src/neat/hybrid.ts";

let kamper = 400;
let kontrakt = 9;
let kandidatSpek = "vakt:ab:e1:e1-modell/d7alle.bin";
let verdener = 12;
let utFil = "analyse/perfeksjon.txt";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--kontrakt") kontrakt = Number(process.argv[++i]);
  else if (a === "--kandidat") kandidatSpek = process.argv[++i]!;
  else if (a === "--verdener") verdener = Number(process.argv[++i]);
  else if (a === "--ut") utFil = process.argv[++i]!;
}

type Velger = { nyKamp(): void; velgHandling(s: GameState): Handling };
function lagKandidat(spec: string): { navn: string; lag: () => Velger } {
  const vakt = delVaktspek(spec);
  if (vakt !== null) {
    const indre = lagKandidat(vakt.indre);
    return { navn: `v${vakt.flagg}:${indre.navn}`, lag: () => new Konvensjonsvakt(indre.lag(), vakt.valg) };
  }
  if (spec === "nevro") return { navn: "NevroHjerne", lag: () => new NevroAgent() };
  if (spec.startsWith("e1:")) {
    const nett = lesE1Nett(spec.slice(3));
    return { navn: spec.slice(3), lag: () => new E1Agent(nett) };
  }
  throw new Error(`Ukjent kandidat «${spec}»`);
}
const kandidat = lagKandidat(kandidatSpek);

function oppsett(frø: number, budsete: number): GameState | null {
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  let g = 0;
  while (s.fase === "BUDRUNDE" && s.iTur !== budsete && g++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  if (s.fase !== "BUDRUNDE" || s.iTur !== budsete) return null;
  if (besteTrumf(s.hender[budsete] ?? []).estimat < kontrakt - 3.5) return null;
  try {
    s = utfør(s, { type: "BUD", spiller: budsete, bud: kontrakt }).state;
  } catch {
    return null;
  }
  g = 0;
  while (s.fase === "BUDRUNDE" && g++ < 8) s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  return s.fase === "BUDRUNDE" ? null : s;
}

/** Hvilket orakel som overtar, og i hvilket stikk. `null` = ingen. */
type Orakel = "lovlig" | "juks";

/**
 * Spiller giva ut. Er `bytt` satt, erstattes spilleførerens kortvalg i
 * NØYAKTIG det stikket av orakelet; alt annet er uendret.
 */
function spill(frø: number, bytt: { stikk: number; orakel: Orakel } | null, rng: () => number): number | null {
  const budsete = frø % 4;
  let s = oppsett(frø, budsete);
  if (s === null) return null;
  const fører = kandidat.lag();
  fører.nyKamp();
  const nevro = new NevroAgent();

  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    if (iTur !== budsete) {
      s = utfør(s, nevro.velgHandling(s)).state;
      continue;
    }
    if (bytt !== null && s.fase === "SPILL" && s.stikkSpilt === bytt.stikk && lovligeKort(s, budsete).length > 1) {
      const kort = bytt.orakel === "juks"
        ? solverBesteKort(s, budsete, { verdener: 3, dybde: 3, nodeTak: 60_000, rng })
        : besteKortSD(s, budsete, nevro, { verdener, rng });
      if (kort !== null) {
        s = utfør(s, { type: "SPILL", spiller: budsete, kort }).state;
        continue;
      }
    }
    s = utfør(s, fører.velgHandling(s)).state;
  }
  const stikk = s.stikkVunnet;
  return (stikk[budsete] ?? 0) + (s.makker !== null ? (stikk[s.makker] ?? 0) : 0);
}

const STIKK = 12;
const lovlig: number[][] = Array.from({ length: STIKK }, () => []);
const juks: number[][] = Array.from({ length: STIKK }, () => []);
const grunnlinje: number[] = [];

const rng = lagRng(31337);
let brukt = 0;
for (let f = 0; f < kamper; f++) {
  const frø = 2_100_000 + f;
  const basis = spill(frø, null, rng);
  if (basis === null) continue;
  // KONTROLL: uten substitusjon må giva gi nøyaktig samme tall hver gang.
  // Slår dette til, er kandidaten eller motparten ikke deterministisk, og hele
  // differansemålingen under er da støy og ikke effekt.
  // Sjekkes bare på de første givene: den koster en full gjennomspilling hver
  // gang, og determinisme er en egenskap ved agentene, ikke ved giva.
  if (brukt < 10 && spill(frø, null, rng) !== basis) {
    throw new Error(`Giv ${frø} er ikke reproduserbar – differansene ville vært støy`);
  }
  grunnlinje.push(basis);
  brukt++;
  for (let t = 0; t < STIKK; t++) {
    const l = spill(frø, { stikk: t, orakel: "lovlig" }, rng);
    const j = spill(frø, { stikk: t, orakel: "juks" }, rng);
    if (l !== null) lovlig[t]!.push(l - basis);
    if (j !== null) juks[t]!.push(j - basis);
  }
  if (brukt % 25 === 0) process.stdout.write(`\r  ${brukt} givere   `);
}
console.log();

const snitt = (v: readonly number[]): number => (v.length === 0 ? NaN : v.reduce((a, b) => a + b, 0) / v.length);
const se = (v: readonly number[]): number => {
  if (v.length < 2) return NaN;
  const m = snitt(v);
  let sq = 0;
  for (const x of v) sq += (x - m) * (x - m);
  return Math.sqrt(sq / (v.length - 1) / v.length);
};

const linjer: string[] = [];
const ut = (s: string): void => { linjer.push(s); console.log(s); };
const tall = (x: number): string => (x >= 0 ? "+" : "") + x.toFixed(3);

ut(`\n=== Perfeksjonsverdi per stikk, kontrakt ${kontrakt}, ${brukt} givere ===`);
ut(`Spillefører: ${kandidat.navn}. De tre andre setene er NevroHjerne.`);
ut(`Grunnlinje: ${snitt(grunnlinje).toFixed(3)} lagstikk.\n`);
ut(`Tallene er stikk vunnet ved å la orakelet ta ETT kortvalg, mot samme giv`);
ut(`uten substitusjon. Nedstrømseffekten er med – runden spilles normalt videre.\n`);
ut("stikk".padEnd(8) + "LOVLIG orakel (SD)".padStart(24) + "JUKSENDE orakel (DD)".padStart(24));
ut("-".repeat(56));
for (let t = 0; t < STIKK; t++) {
  ut(
    `${t + 1}`.padEnd(8) +
      `${tall(snitt(lovlig[t]!))} ± ${se(lovlig[t]!).toFixed(3)}`.padStart(24) +
      `${tall(snitt(juks[t]!))} ± ${se(juks[t]!).toFixed(3)}`.padStart(24),
  );
}
const sumL = lovlig.reduce((a, v) => a + snitt(v), 0);
const sumJ = juks.reduce((a, v) => a + snitt(v), 0);
ut("-".repeat(56));
ut("SUM".padEnd(8) + tall(sumL).padStart(24) + tall(sumJ).padStart(24));
ut(`
LESEVEILEDNING. Summen er IKKE hva vi ville vunnet ved å spille perfekt hele
runden – hvert tall er målt med resten av runden spilt som før, og
gevinstene overlapper. Den er et anslag på hvor mye som ligger igjen, og
fordelingen over stikk sier HVOR det ligger.

Kolonnen «lovlig» er ferdighet vi kan hente: orakelet ser bare det setet selv
ser. Differansen mellom de to kolonnene er informasjon vi aldri kan ha,
uansett hvor god boten blir. Er de like store, er det ikke informasjon som
skiller oss fra taket – da er det spilleferdighet, og den kan trenes.`);

writeFileSync(utFil, linjer.join("\n") + "\n");
console.log(`\nSkrev ${utFil}`);
