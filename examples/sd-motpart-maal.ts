/**
 * HVA ER MOTSTANDERMODELLEN I SD VERDT? – parret poengmåling der MILJØET kan
 * velges.
 *
 *   node examples/sd-motpart-maal.ts \
 *     --kandidat sd:nevro --kandidat sd:klone:e1-modell/mklon.bin \
 *     --kandidat nevro \
 *     --miljo klone:e1-modell/mklon.bin \
 *     --froe 200000000 --frofra 0 --frotil 250 \
 *     --ut analyse/sd-motpart-klonemiljo-0.jsonl
 *
 * SPØRSMÅLET. `src/moe2/sdkort.ts` spiller kandidatkortet ut mot en
 * MOTSTANDERMODELL, og den har alltid vært NevroHjerne. Men vi spiller mot
 * MesterAI, som er målt 1,07 poeng/runde/sete sterkere og spiller annerledes.
 * SD optimerer altså mot feil motstander. Hjelper det å bytte?
 *
 * DEN FELLEN SOM MÅ UNNGÅS, og som er hele grunnen til at `--miljo` finnes:
 * måler man to motstandermodeller i et miljø av NevroHjerne, vinner
 * nevro-modellen fordi den er KORREKT SPESIFISERT der – ikke fordi den er
 * bedre. Målingen ville vært rigget. Derfor skilles de to tingene:
 *
 *   `--kandidat sd:X`  – modellen SD FORESTILLER seg at motstanderne bruker
 *   `--miljo Y`        – hvem som faktisk sitter i de tre andre setene
 *
 * og den interessante cellen er X = klone, Y = klone mot X = nevro, Y = klone.
 * Miljøet er en KLONE av MesterAI, ikke MesterAI selv – MesterAI er for treg
 * til tusenvis av runder. Skjermen her er billig og skarp; bekreftelsen mot
 * ekte MesterAI er `examples/mesterai-h2h.ts --kandidat sd:<motpart>`, som er
 * dyr og butt. De to svarer ikke på det samme, og begge trengs.
 *
 * PROTOKOLLEN er godkjenningsportens (`examples/moe2-port-spill-sd.ts`): ÉN
 * runde per (giver, sete), poeng = egne minus snittet av de tre andre. Alle
 * kandidatene spiller NØYAKTIG de samme giverne, og differansen regnes parret
 * per giver – kortflaksen forsvinner da ut av sammenligningen.
 *
 * Utfila har formatet `{kandidat, frø, diff}`, altså nøyaktig det
 * `examples/sd-parret-rapport.ts` leser. Ingen ny statistikkode.
 *
 * | Flagg | Standard | Betydning |
 * |---|---|---|
 * | `--kandidat` | (kan gjentas) | `nevro`, `e1:<fil>`, `klone:<fil>`, `sd:<motpart>` |
 * | `--miljo` | nevro | hvem som sitter i de tre andre setene (samme spek-former) |
 * | `--froe` | 200000000 | frøbase, disjunkt fra alle andre bånd |
 * | `--frofra`/`--frotil` | 0/200 | skard: bare giverne [fra, til) |
 * | `--runder` | 1 | runder per kamp (1 = portens protokoll) |
 * | `--verdener` | 12 | verdener SD-kandidatene sampler per kortvalg |
 * | `--ut` | analyse/sd-motpart.jsonl | varig logg, én linje per (kandidat, giver) |
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { delSDSpek, lagMotpart, SDAgent } from "../src/moe2/sdagent.ts";

// --- Argumenter -------------------------------------------------------------

const kandidatSpek: string[] = [];
let miljøSpek = "nevro";
let frøBase = 200_000_000;
let frøFra = 0;
let frøTil = 200;
let runder = 1;
let verdener = 12;
let utSti = "analyse/sd-motpart.jsonl";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--kandidat") kandidatSpek.push(process.argv[++i]!);
  else if (a === "--miljo") miljøSpek = process.argv[++i] ?? miljøSpek;
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--frofra") frøFra = Number(process.argv[++i]);
  else if (a === "--frotil") frøTil = Number(process.argv[++i]);
  else if (a === "--runder") runder = Number(process.argv[++i]);
  else if (a === "--verdener") verdener = Number(process.argv[++i]);
  else if (a === "--ut") utSti = process.argv[++i] ?? utSti;
}
if (kandidatSpek.length === 0) {
  console.error("Bruk: node examples/sd-motpart-maal.ts --kandidat <spek> [--kandidat ...] [flagg]");
  process.exit(1);
}

// --- Agentene ---------------------------------------------------------------

interface Spiller {
  nyKamp(frø: number): void;
  velgHandling(state: GameState): Handling;
}

/**
 * Vektfilene leses ÉN gang, ved oppstart: `lagSpiller` kalles per kandidat, og
 * SD-agenten som bygges på nytt per kamp får den ferdiglastede modellen inn.
 * Leses en modell på nytt per kamp, blir innlesingen dyrere enn evalueringen.
 *
 * `sd:<motpart>` og de rene spillerne deler `lagMotpart`, så en spek som
 * `klone:<fil>` betyr det samme uansett hvor den står.
 */
function lagSpiller(spek: string): Spiller {
  if (spek.startsWith("sd:")) {
    // Modellene bygges HER, én gang. `lagSDAgent` gjør både innlesing og
    // konstruksjon, så et kall per kamp ville lest vektfilene på nytt for hver
    // giver – innlesingen er dyrere enn selve evalueringen.
    const { motpart, egen } = delSDSpek(spek.slice(3));
    let a = new SDAgent(motpart, { verdener, egen });
    return {
      nyKamp: (frø) => {
        a = new SDAgent(motpart, { verdener, egen, frø });
      },
      velgHandling: (s) => a.velgHandling(s),
    };
  }
  const a = lagMotpart(spek);
  const medNyKamp = a as { nyKamp?: () => void };
  return { nyKamp: () => medNyKamp.nyKamp?.(), velgHandling: (s) => a.velgHandling(s) };
}

const kandidater = kandidatSpek.map((s) => ({ navn: s, spiller: lagSpiller(s) }));
// ETT miljø-objekt til alle tre setene. NevroAgent og E1Agent har
// kamphukommelse per objekt, ikke per sete, så dette er samme oppsett som
// `neat-evaluer.ts` bruker for motstanderne.
const miljø = lagSpiller(miljøSpek);

// --- Én kamp ----------------------------------------------------------------

function kamp(k: Spiller, frø: number, sete: number): number {
  // SAMME frø til alle kandidatene i samme giver: verdenstrekningen skal ikke
  // være en kilde til forskjell mellom to motstandermodeller.
  k.nyKamp(frø * 4 + sete);
  miljø.nyKamp(frø * 4 + sete);
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  while (s.fase !== "FERDIG" && vakt++ < 20_000) {
    if (s.fase === "RUNDE_SLUTT") {
      if (s.rundeNr + 1 >= runder) break;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
    s = utfør(s, iTur === sete ? k.velgHandling(s) : miljø.velgHandling(s)).state;
  }
  const egne = s.totalPoeng[sete] ?? 0;
  return egne - (s.totalPoeng.reduce((a, b) => a + b, 0) - egne) / 3;
}

// --- Kjør -------------------------------------------------------------------

mkdirSync(dirname(utSti), { recursive: true });
console.log(
  `sd-motpart-maal: ${kandidater.length} kandidater i miljø «${miljøSpek}», ` +
    `givere [${frøFra}, ${frøTil}) fra frø ${frøBase}, ${runder} runde(r) per kamp, ` +
    `${verdener} verdener\n→ ${utSti}\n`,
);

const t0 = performance.now();
for (let f = frøFra; f < frøTil; f++) {
  const frø = frøBase + f;
  for (const kandidat of kandidater) {
    let sum = 0;
    for (let sete = 0; sete < 4; sete++) sum += kamp(kandidat.spiller, frø, sete);
    appendFileSync(utSti, JSON.stringify({ kandidat: kandidat.navn, frø, diff: sum / 4 }) + "\n");
  }
  const gjort = f - frøFra + 1;
  const brukt = (performance.now() - t0) / 1000;
  console.log(
    `giver ${gjort}/${frøTil - frøFra} (frø ${frø}) – ${brukt.toFixed(0)}s brukt, ` +
      `~${((brukt / gjort) * (frøTil - frøFra - gjort)).toFixed(0)}s igjen`,
  );
}
console.log(`\nFerdig. Rapport: node examples/sd-parret-rapport.ts ${utSti} --grunnlinje nevro`);
