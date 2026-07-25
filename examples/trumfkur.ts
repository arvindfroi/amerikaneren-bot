/**
 * Virker vrak-/trumflæreren i det hele tatt?
 *
 *   node examples/trumfkur.ts trening-d6/beste.json --runder 400 --rate 0.15
 *
 * Bakgrunn: kontraktobduksjonen viste at D6 velger en trumffarge den har
 * 2,98 kort i (NevroHjerne: 5,76), tar 1,5 stikk selv og feller halvparten
 * av kontraktene sine. Makkeren blir alltid funnet, så det er ikke der
 * feilen ligger – det er trumfen.
 *
 * Informasjonen er tilgjengelig: håndvurderingssensorene ligger i
 * inngangsvektoren for ALLE faser, også VRAK. Nettet KAN altså se hvilken
 * farge som er best trumf før det vraker. Spørsmålet er om læreren klarer å
 * dytte det dit – Arvind var tydelig på at dette skal læres, ikke kodes som
 * heuristikk.
 *
 * Denne kjører kalibreringen offline på ekte stillinger og måler FØR/ETTER
 * på et HOLDOUT-sett med andre givere enn de den trente på. Beveger tallene
 * seg ikke, er det læreren som er ødelagt og ikke dosen.
 */

import { readFileSync, writeFileSync } from "node:fs";

import type { Farge } from "../src/kort.ts";
import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { genomFraJson, genomTilJson, NeatAgent } from "../src/neat/index.ts";
import { grådigHandling } from "./graadig.ts";

let fil = "";
let runder = 400;
let rate = 0.15;
let ut: string | null = null;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--runder") runder = Number(process.argv[++i]);
  else if (a === "--rate") rate = Number(process.argv[++i]);
  else if (a === "--ut") ut = process.argv[++i]!;
  else fil = a;
}

function lengder(hånd: readonly { farge: Farge }[]): Record<string, number> {
  const l: Record<string, number> = {};
  for (const k of hånd) l[k.farge] = (l[k.farge] ?? 0) + 1;
  return l;
}

interface Mål {
  trumfLengde: number[];
  /** Andel vrakede kort som lå i fargen agenten SELV valgte som trumf etterpå. */
  vrakITrumf: number;
  vrakTotalt: number;
  lagStikk: number[];
  klart: number;
  kontrakter: number;
}

const nyMål = (): Mål => ({
  trumfLengde: [], vrakITrumf: 0, vrakTotalt: 0, lagStikk: [], klart: 0, kontrakter: 0,
});

/**
 * Spiller `antall` givere. `lær` slår på kalibreringen; når den er av
 * brukes samme kode til ren måling, så før/etter er sammenlignbart.
 */
function kjør(agent: NeatAgent, frøBase: number, antall: number, lær: boolean, m: Mål | null): void {
  for (let f = 0; f < antall; f++) {
    for (let sete = 0; sete < 4; sete++) {
      agent.nyKamp();
      let s = opprettSpill({ antallSpillere: 4 }, frøBase + f);
      let kastet: { farge: Farge }[] = [];
      let guard = 0;
      while (s.fase !== "FERDIG" && guard++ < 20_000) {
        if (s.fase === "RUNDE_SLUTT") {
          if (s.rundeNr + 1 >= 25) break;
          s = utfør(s, { type: "NESTE" }).state;
          continue;
        }
        const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
        const min = iTur === sete;

        if (min && lær && s.fase === "VRAK") agent.lærVrak(s, sete, rate);
        if (min && lær && s.fase === "VELG") agent.lærTrumf(s, sete, rate);

        const h: Handling = min ? agent.velgHandling(s) : grådigHandling(s);

        if (min && m !== null && h.type === "VRAK") kastet = [...h.kort];
        if (min && m !== null && h.type === "VELG") {
          m.trumfLengde.push(lengder(s.hender[sete] ?? [])[h.trumf] ?? 0);
          for (const k of kastet) {
            m.vrakTotalt++;
            if (k.farge === h.trumf) m.vrakITrumf++;
          }
          kastet = [];
        }
        const res = utfør(s, h);
        if (m !== null) {
          for (const e of res.hendelser) {
            if (e.type !== "RUNDE_SLUTT") continue;
            if (e.resultat.budvinner !== sete || e.resultat.melding.type !== "tall") continue;
            m.kontrakter++;
            m.lagStikk.push(e.resultat.lagStikk);
            if (e.resultat.klart) m.klart++;
          }
        }
        s = res.state;
      }
    }
  }
}

const snitt = (x: readonly number[]): string =>
  x.length === 0 ? "–" : (x.reduce((a, b) => a + b, 0) / x.length).toFixed(2);
const pst = (a: number, b: number): string => (b === 0 ? "–" : `${Math.round((100 * a) / b)} %`);

const rå = JSON.parse(readFileSync(fil, "utf8")) as { genom?: unknown };
const g = genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(fil, "utf8"));
const agent = new NeatAgent(g, { læringsrate: 0 });

// HOLDOUT: måles alltid på 40 givere nettet ALDRI trener på (frø 990 000+),
// mens treningen skjer på frø 100 000+. Uten det skillet måler vi bare at
// nettet har pugget de samme giverne.
const HOLDOUT = 40;
const før = nyMål();
kjør(agent, 990_000, HOLDOUT, false, før);

kjør(agent, 100_000, runder, true, null);

const etter = nyMål();
kjør(agent, 990_000, HOLDOUT, false, etter);

const rad = (navn: string, a: string, b: string): void =>
  console.log(navn.padEnd(28) + a.padStart(12) + b.padStart(12));

console.log(`\n=== Vrak-/trumfkur: ${fil}, ${runder} givere trening, rate ${rate} ===`);
console.log(`(holdout: 40 givere x 4 seter som IKKE inngikk i treningen)\n`);
rad("", "FØR", "ETTER");
console.log("-".repeat(52));
rad("trumflengde", snitt(før.trumfLengde), snitt(etter.trumfLengde));
rad("vraket i EGEN trumf", pst(før.vrakITrumf, før.vrakTotalt), pst(etter.vrakITrumf, etter.vrakTotalt));
rad("lagstikk som budvinner", snitt(før.lagStikk), snitt(etter.lagStikk));
rad("klart", pst(før.klart, før.kontrakter), pst(etter.klart, etter.kontrakter));
rad("kontrakter (n)", String(før.kontrakter), String(etter.kontrakter));
console.log("\nNevroHjerne til sammenligning: trumflengde 5.76, vrak i trumf 0 %, lagstikk 8.75, klart 97 %\n");

if (ut !== null) {
  writeFileSync(ut, genomTilJson(g));
  console.log(`skrev kalibrert genom til ${ut}`);
}
