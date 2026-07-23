/**
 * Budstatistikk for et NEAT-genom i selvspill (4 kopier, læring av):
 * snitt tallbud, snitt lagstikk, innfrielse – og «familie-målet»:
 * andelen kontrakter med bud ≥ 9 og innfrielsen på dem. Eierens familie
 * byr typisk 9–11 og klarer det som regel; det er nivået boten skal slå.
 *
 *   node examples/neat-budstat.ts [genomfil] [antallKamper] [--pimc]
 */

import { readFileSync } from "node:fs";

import {
  opprettSpill,
  utfør,
  velgHandling,
  type GameState,
  type Handling,
} from "../src/index.ts";
import { genomFraJson, NeatAgent } from "../src/neat/index.ts";

const posisjonelle: string[] = [];
let medPimc = false;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--pimc") medPimc = true;
  else posisjonelle.push(process.argv[i]!);
}
const genomFil = posisjonelle[0] ?? "trening/mester.json";
const antallKamper = Number(posisjonelle[1] ?? 40);

type Velger = (s: GameState) => Handling;

interface Stat {
  kontrakter: number;
  snittStikk: number;
  snittBud: number;
  innfridd: number;
  overskudd: number;
  høyeAndel: number; // andel tallbud ≥ 9 («familie-nivået»)
  høyeInnfridd: number; // innfrielse på bud ≥ 9
}

function spillOgSamle(velger: Velger, kamper: number, frøStart: number): Stat {
  let kontrakter = 0;
  let sumStikk = 0;
  let sumBud = 0;
  let klarte = 0;
  let tall = 0;
  let sumOver = 0;
  let høye = 0;
  let høyeKlarte = 0;
  for (let k = 0; k < kamper; k++) {
    let s = opprettSpill({ antallSpillere: 4 }, frøStart + k);
    let guard = 0;
    while (s.fase !== "FERDIG" && guard++ < 20000) {
      if (s.fase === "RUNDE_SLUTT") {
        if (s.rundeNr + 1 >= 25) break;
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      const res = utfør(s, velger(s));
      for (const h of res.hendelser) {
        if (h.type !== "RUNDE_SLUTT") continue;
        const r = h.resultat;
        kontrakter++;
        sumStikk += r.lagStikk;
        if (r.klart) klarte++;
        if (r.melding.type === "tall") {
          tall++;
          sumBud += r.melding.bud;
          sumOver += r.lagStikk - r.melding.bud;
          if (r.melding.bud >= 9) {
            høye++;
            if (r.klart) høyeKlarte++;
          }
        }
      }
      s = res.state;
    }
  }
  return {
    kontrakter,
    snittStikk: sumStikk / Math.max(1, kontrakter),
    snittBud: sumBud / Math.max(1, tall),
    innfridd: klarte / Math.max(1, kontrakter),
    overskudd: sumOver / Math.max(1, tall),
    høyeAndel: høye / Math.max(1, tall),
    høyeInnfridd: høye > 0 ? høyeKlarte / høye : 0,
  };
}

function skriv(navn: string, s: Stat): void {
  console.log(
    `${navn}: bud ${s.snittBud.toFixed(1)} i snitt, lagstikk ${s.snittStikk.toFixed(2)}/12, ` +
      `innfridd ${(100 * s.innfridd).toFixed(0)} %, overskudd ${s.overskudd >= 0 ? "+" : ""}${s.overskudd.toFixed(2)} stikk` +
      ` | familie-mål (bud ≥ 9): ${(100 * s.høyeAndel).toFixed(0)} % av budene, innfridd ${(100 * s.høyeInnfridd).toFixed(0)} %` +
      ` (${s.kontrakter} kontrakter)`,
  );
}

const genom = genomFraJson(readFileSync(genomFil, "utf8"));
const agenter = [0, 1, 2, 3].map(() => new NeatAgent(genom, { læringsrate: 0 }));
const neatVelger: Velger = (s) => {
  const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
  return agenter[sete]!.velgHandling(s);
};
skriv(`NEAT (${genomFil})`, spillOgSamle(neatVelger, antallKamper, 3000));

if (medPimc) {
  const pimcVelger: Velger = (s) => velgHandling(s, { verdener: 12, terskel: 6, frø: 7 });
  skriv("PIMC-referanse", spillOgSamle(pimcVelger, Math.max(4, Math.floor(antallKamper / 8)), 4000));
}
