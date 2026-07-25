/**
 * Forsprang til forsvarslinja: destiller NevroHjernes FORSVARSVALG.
 *
 *   node examples/forsvar-distill.ts --runder 300 --ut senat/start-forsvar.json
 *   node examples/neat-avmett.ts senat/start-forsvar.json senat/start-avmettet.json
 *   node examples/forsvarslinje.ts --fra senat/start-avmettet.json --dir trening-f1
 *
 * Nettene kan ikke sammenlignes direkte: NevroHjerne er tre faste MLP-er med
 * egen koding, NEAT er evolvert topologi over 318 sensorer. Vektene har
 * ingen felles referanse. Det som KAN overføres er beslutningene – hvilket
 * kort spilles i denne stillingen – og det er også det eneste som betyr noe.
 *
 * ÉN POSITIV FASIT PER BESLUTNING, og ingenting annet. Det er hele lærdommen
 * fra lærForsvar, som mislyktes: den satte mål for HVERT lovlige kort, ett
 * opp og n−1 ned. Over mange beslutninger er et gitt kort «det beste» bare
 * ~1/n av gangene, så nettosignalet pekte nedover for alle kort og hodet
 * flatet ut – trumfing falt 30 % → 19 %. Her dyttes kun kortet NevroHjerne
 * faktisk valgte, opp. Ingen kort dyttes ned. Summen av dytt er dermed
 * alltid positiv og konsentrert, ikke spredt og negativ.
 *
 * FORSPRANG, IKKE TAK. Poenget er ikke å ende som en nevro-kopi – Arvind har
 * gjentatte ganger advart mot å konvergere mot en bot som selv er suboptimal.
 * Poenget er at forsvarslinja skal starte et sted der seleksjonen har noe å
 * jobbe med, i stedet for fra tilfeldige vekter. Derfor MÅ resultatet
 * avmettes (neat-avmett.ts) før det seedes: et mettet genom har derivert
 * ~0 i utgangene, og da fester verken kalibrering eller avl.
 */

import { writeFileSync } from "node:fs";

import { lagRng, type Kort } from "../src/kort.ts";
import { lovligeHandlinger, opprettSpill, utfør, type GameState } from "../src/index.ts";
import {
  genomTilJson,
  Innovasjonsbok,
  NeatAgent,
  Nettverk,
  nyttGenom,
  type Genom,
} from "../src/neat/index.ts";
import { ANTALL_INN, ANTALL_UT, lagInn, UT_KORT } from "../src/neat/trekk.ts";
import { spillerVisning } from "../src/motor.ts";
import { kortIndeks } from "../src/neat/trekk.ts";
import { besteTrumf, NevroAgent } from "../src/nevro/index.ts";

let runder = 300;
let rate = 0.08;
let ut = "senat/start-forsvar.json";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--runder") runder = Number(process.argv[++i]);
  else if (a === "--rate") rate = Number(process.argv[++i]);
  else if (a === "--ut") ut = process.argv[++i]!;
}

function oppsett(frø: number, k: number): { s: GameState; sete: number } | null {
  const budsete = frø % 4;
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  let g = 0;
  while (s.fase === "BUDRUNDE" && s.iTur !== budsete && g++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  if (s.fase !== "BUDRUNDE" || s.iTur !== budsete) return null;
  if (besteTrumf(s.hender[budsete] ?? []).estimat < k - 3.5) return null;
  try {
    s = utfør(s, { type: "BUD", spiller: budsete, bud: k }).state;
  } catch {
    return null;
  }
  g = 0;
  while (s.fase === "BUDRUNDE" && g++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  if (s.fase === "BUDRUNDE") return null;
  const nevro = new NevroAgent();
  g = 0;
  while ((s.fase === "VRAK" || s.fase === "VELG") && g++ < 20) s = utfør(s, nevro.velgHandling(s)).state;
  if (s.fase !== "SPILL") return null;
  const f = [0, 1, 2, 3].filter((x) => x !== budsete && x !== s.makker);
  if (f.length === 0) return null;
  return { s, sete: f[frø % f.length]! };
}

/**
 * Spiller én forsvarsrunde. `lær > 0` destillerer; ellers måles bare hvor
 * ofte agenten er ENIG med NevroHjerne i forsvarsstillinger.
 */
function énRunde(genom: Genom, frø: number, k: number, lær: number): { enig: number; n: number } {
  const o = oppsett(frø, k);
  if (o === null) return { enig: 0, n: 0 };
  let s = o.s;
  const agent = new NeatAgent(genom, { læringsrate: 0 });
  agent.nyKamp();
  const nevro = new NevroAgent();
  let enig = 0;
  let n = 0;
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    if (s.iTur! !== o.sete) {
      s = utfør(s, nevro.velgHandling(s)).state;
      continue;
    }
    const lov = lovligeHandlinger(s);
    const fasit = nevro.velgHandling(s);
    const eget = agent.velgHandling(s);
    if (lov.fase === "SPILL" && fasit.type === "SPILL" && eget.type === "SPILL") {
      n++;
      if (kortIndeks(fasit.kort) === kortIndeks(eget.kort)) enig++;
      if (lær > 0 && lov.kort.length > 1) {
        // KUN det ene kortet nevro valgte, og bare oppover.
        agent.lærSpill(s, o.sete, fasit.kort, lær);
      }
    }
    // Spill nevros valg videre under destillering, så stillingene som
    // besøkes er de NevroHjerne faktisk havner i (fasitens fordeling).
    s = utfør(s, lær > 0 ? fasit : eget).state;
  }
  return { enig, n };
}

/** Snitt |tanh'| over kortutgangene – 0 betyr mettet, gradienten dør. */
function derivert(genom: Genom, prøver = 300): number {
  const nett = new Nettverk(genom);
  const rng = lagRng(0xabc);
  let sum = 0;
  let n = 0;
  for (let f = 0; f < prøver * 6 && n < prøver; f++) {
    const o = oppsett(4_000_000 + f, 9);
    if (o === null) continue;
    const inn = lagInn(spillerVisning(o.s, o.sete), "SPILL", o.s.giving.antallStikk, o.s.regler.målPoeng);
    const u = nett.aktiver(inn);
    for (let i = 0; i < 52; i++) {
      const v = u[UT_KORT + i]!;
      sum += 1 - v * v;
    }
    n++;
    if (rng() < 0) break;
  }
  return n === 0 ? NaN : sum / (n * 52);
}

function måling(genom: Genom, fraFrø: number, antall: number): number {
  let enig = 0;
  let n = 0;
  for (let f = 0; f < antall; f++) {
    const r = énRunde(genom, fraFrø + f, 8 + (f % 3), 0);
    enig += r.enig;
    n += r.n;
  }
  return n === 0 ? NaN : enig / n;
}

const genom = nyttGenom(ANTALL_INN, ANTALL_UT, new Innovasjonsbok(ANTALL_INN, ANTALL_UT), lagRng(0x0de5));
const rng = lagRng(0xd15111);

console.log(`Destillerer NevroHjernes forsvarsvalg, ${runder} runder, rate ${rate}`);
console.log(`HOLDOUT-enighet foer: ${(måling(genom, 2_500_000, 150) * 100).toFixed(1)} %`);
console.log(`Snitt |tanh'| i kortutgangene foer: ${derivert(genom).toFixed(4)}\n`);

for (let g = 0; g < runder; g++) {
  for (let i = 0; i < 12; i++) {
    énRunde(genom, 3_000_000 + Math.floor(rng() * 900_000), 8 + (i % 3), rate);
  }
  if ((g + 1) % 50 === 0) {
    console.log(
      `  runde ${g + 1}: holdout-enighet ${(måling(genom, 2_500_000, 100) * 100).toFixed(1)} %, ` +
        `|tanh'| ${derivert(genom, 120).toFixed(4)}`,
    );
  }
}

const enighet = måling(genom, 2_500_000, 150);
const d = derivert(genom);
writeFileSync(ut, genomTilJson(genom));
console.log(`\nHOLDOUT-enighet etter: ${(enighet * 100).toFixed(1)} %`);
console.log(`Snitt |tanh'| etter: ${d.toFixed(4)}${d < 0.05 ? "  <-- METTET, MAA avmettes" : ""}`);
console.log(`-> ${ut}`);
console.log(`\nNESTE, i denne rekkefoelgen:\n  node examples/neat-avmett.ts ${ut} senat/start-avmettet.json\n  node examples/forsvarslinje.ts --fra senat/start-avmettet.json --dir trening-f1`);
