/**
 * E1 fase 1: lager treningsdata ved å spille partier og la det eksakte
 * orakelet dømme kortvalgene.
 *
 *   node examples/e1-orakel.ts --ut e1-data/skard-0.jsonl --kamper 50 --skard 0/16
 *
 * | Flagg | Standard | Betydning |
 * |---|---|---|
 * | `--ut` | e1-data/orakel.jsonl | varig logg, én linje per merket stilling |
 * | `--kamper` | 50 | antall partier denne prosessen spiller |
 * | `--froe` | 300000 | frøbase (skard-nummeret legges til, så skardene er disjunkte) |
 * | `--skard` | 0/1 | «i/n» – i-te av n prosesser; deler frørommet |
 * | `--verdener` | 24 | verdener orakelet sampler per beslutning |
 * | `--dybde` | 7 | stikk som løses eksakt per verden |
 * | `--nodetak` | 400000 | tak per eksaktsøk |
 * | `--sjanse` | 0.35 | andel kortvalg som merkes (resten spilles bare) |
 * | `--utforsk` | 0.15 | andel trekk der spilleren velger tilfeldig, for spredning i stillingene |
 *
 * Partiene spilles av NevroHjerne (appens nett) med litt utforskning. Det
 * gir stillinger som ligner dem en STERK spiller havner i – ikke tilfeldig
 * rot – samtidig som utforskningen hindrer at datasettet blir en smal
 * korridor rundt én policy.
 *
 * Skrivingen skjer linje for linje til fil (append + flush). Kjøringer som
 * varer i timer må aldri ha resultatene sine i et rør: et avbrudd skal
 * koste den siste linjen, ikke alt.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { lagRng } from "../src/kort.ts";
import { lovligeKort, opprettSpill, utfør, type Handling } from "../src/index.ts";
import { e1SpillTrekk, E1_SPILL_DIM } from "../src/e1/trekk.ts";
import { orakelBudsjett, orakelVerdier } from "../src/e1/orakel.ts";
import { kortIndeks, NevroAgent } from "../src/nevro/index.ts";
import { spillerVisning } from "../src/motor.ts";
import { lagInn } from "../src/neat/trekk.ts";

let utFil = "e1-data/orakel.jsonl";
let kamper = 50;
let frøBase = 300_000;
let skardI = 0;
let skardN = 1;
let verdener = 24;
let dybde = 7;
let nodeTak = 400_000;
let sjanse = 0.35;
let utforsk = 0.15;
let flatt = false;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--ut") utFil = process.argv[++i] ?? utFil;
  else if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--skard") {
    const [i2, n2] = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(i2);
    skardN = Number(n2);
  } else if (a === "--verdener") verdener = Number(process.argv[++i]);
  else if (a === "--dybde") dybde = Number(process.argv[++i]);
  else if (a === "--nodetak") nodeTak = Number(process.argv[++i]);
  else if (a === "--sjanse") sjanse = Number(process.argv[++i]);
  else if (a === "--utforsk") utforsk = Number(process.argv[++i]);
  else if (a === "--flatt") flatt = true;
}

mkdirSync(dirname(utFil), { recursive: true });

const agent = new NevroAgent();
const rng = lagRng((frøBase + skardI * 7919) >>> 0);
let merket = 0;
let beslutninger = 0;
const t0 = performance.now();

for (let k = 0; k < kamper; k++) {
  // Skardene deler frørommet, så to prosesser aldri spiller samme parti.
  const frø = frøBase + skardI * 1_000_000 + k;
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  let guard = 0;
  while (s.fase !== "FERDIG" && guard++ < 20_000) {
    if (s.fase === "RUNDE_SLUTT") {
      if (s.rundeNr + 1 >= 30) break;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    let h: Handling;
    if (s.fase === "SPILL" && s.iTur !== null) {
      const sete = s.iTur;
      const lovlige = lovligeKort(s, sete);
      beslutninger++;
      if (lovlige.length >= 2 && rng() < sjanse) {
        // Budsjettet skaleres med stikk igjen: aapningen er rundens dyreste
        // valg med mest skjult informasjon, sluttspillet er nesten gratis.
        // --flatt beholder det gamle, like budsjettet (for sammenlikning).
        const stikkIgjen = s.giving.antallStikk - s.stikkSpilt;
        const b = flatt
          ? { verdener, dybde: Math.min(dybde, stikkIgjen), nodeTak, kandidater: 3 }
          : orakelBudsjett(stikkIgjen, nodeTak);
        const svar = orakelVerdier(s, sete, { ...b, frø: (frø * 31 + guard) >>> 0 });
        if (svar !== null) {
          // Verdiene lagres per KORTINDEKS (0–51), så treneren slipper å
          // kjenne rekkefølgen lovligeKort tilfeldigvis hadde.
          const verdi: Record<number, number> = {};
          svar.kort.forEach((kort, i) => {
            verdi[kortIndeks(kort)] = Math.round(svar.verdi[i]! * 1000) / 1000;
          });
          appendFileSync(
            utFil,
            JSON.stringify({
              t: Array.from(e1SpillTrekk(s, sete), (x) => Math.round(x * 10_000) / 10_000),
              // NEAT-trekkvektoren ved siden av E1-vektoren. De to kodingene
              // er ulike (E1 arver appens 238 + 35 egne; NEAT har sine 318),
              // og uten begge kan ikke NEAT-genomer scores på angerbenken –
              // som er hele poenget med å måle beslutninger i stedet for
              // kamputfall. Koster ~1,3 kB per linje, verdt det.
              // Feltnavnet er «nt», ikke «n»: «n» var allerede tatt av
              // antall verdener, og JSON beholder bare det siste feltet med
              // samme navn – den første versjonen ble stille overskrevet.
              nt: lagInn(spillerVisning(s, sete), "SPILL", s.giving.antallStikk, s.regler.målPoeng).map(
                (x) => Math.round(x * 10_000) / 10_000,
              ),
              v: verdi,
              n: svar.verdener,
              dybde: b.dybde,
              frø,
              stikk: s.stikkSpilt,
            }) + "\n",
          );
          merket++;
        }
      }
      // Utforskning gir bredere stillinger enn ren nett-policy ville gitt.
      h =
        rng() < utforsk
          ? { type: "SPILL", spiller: sete, kort: lovlige[Math.floor(rng() * lovlige.length)]! }
          : agent.velgHandling(s);
    } else {
      h = agent.velgHandling(s);
    }
    s = utfør(s, h).state;
  }
  const brukt = (performance.now() - t0) / 1000;
  console.log(
    `parti ${k + 1}/${kamper} (skard ${skardI}/${skardN}) – ${merket} merkede stillinger av ${beslutninger} kortvalg, ` +
      `${brukt.toFixed(0)}s, ${(merket / Math.max(1, brukt)).toFixed(1)}/s`,
  );
}

console.log(`Ferdig: ${merket} stillinger à ${E1_SPILL_DIM} trekk → ${utFil}`);
