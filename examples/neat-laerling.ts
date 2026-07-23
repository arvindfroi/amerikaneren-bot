/**
 * Lærlingfasen: PIMC-solveren som LÆRER for NEAT-nettet (imitasjonslæring
 * rett inn i genomet, DAgger-stil).
 *
 *   node examples/neat-laerling.ts [genomfil] [minutter=45] [utfil]
 *
 * Fire kopier av genomet spiller selvspill. Ved hver kortbeslutning (og
 * vraking/trumfvalg) spør vi solveren hva DEN ville gjort, og dytter
 * netthodene mot lærerens valg med delta-regelen – på nettets EGNE
 * feilfordelte tilstander (agentens trekk utføres, lærerens brukes som
 * fasit: DAgger). Vektene skrives rett i genomet; resultatet såes så inn
 * i treningspopulasjonen – «studer under mesteren, overgå ham etterpå».
 *
 * Enighetsprosenten (hvor ofte nettet allerede velger lærerens kort) er
 * fremdriftsmålet – den skal stige utover økta.
 */

import { readFileSync, renameSync, writeFileSync } from "node:fs";

import {
  lovligeKort,
  opprettSpill,
  spillerVisning,
  utfør,
  velgHandling,
  type Handling,
} from "../src/index.ts";
import {
  genomFraJson,
  genomTilJson,
  kortIndeks,
  lagInn,
  NeatAgent,
  Nettverk,
  UT_KORT,
  UT_TRUMF,
} from "../src/neat/index.ts";
import { FARGER } from "../src/kort.ts";

const genomFil = process.argv[2] ?? "trening-c4/mester.json";
const minutter = Number(process.argv[3] ?? 45);
const utfil = process.argv[4] ?? "trening-c4/laerling.json";

const RATE = 0.1; // sterkere enn regret-læringen – dette er fasitmerket data
const LÆRER = { verdener: 10, terskel: 6 };

const genom = genomFraJson(readFileSync(genomFil, "utf8"));
console.log(`Lærling: ${genomFil} (${genom.koblinger.length} koblinger), ${minutter} min med solver-lærer`);

// Lærernettet deler koblingsGENENE med agentene – kalibrering her er
// umiddelbart synlig i agentenes nett (samme genomobjekter).
const lærerNett = new Nettverk(genom);
const agenter = [0, 1, 2, 3].map(() => new NeatAgent(genom));

let beslutninger = 0;
let enige = 0;
const frist = Date.now() + minutter * 60_000;
let spillFrø = 424_000;
let kamper = 0;

while (Date.now() < frist) {
  for (const a of agenter) a.nyKamp();
  let s = opprettSpill({ antallSpillere: 4 }, spillFrø++);
  let guard = 0;
  let kampEnige = 0;
  let kampBesl = 0;

  while (s.fase !== "FERDIG" && guard++ < 20000 && Date.now() < frist) {
    if (s.fase === "RUNDE_SLUTT") {
      if (s.rundeNr + 1 >= 8) break; // korte kamper – flere ulike giver
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    const handling = agenter[sete]!.velgHandling(s);
    const lærerFrø = (spillFrø * 131 + guard * 17) >>> 0;

    if (s.fase === "SPILL" && handling.type === "SPILL" && lovligeKort(s, sete).length >= 2) {
      const lærer = velgHandling(s, { ...LÆRER, frø: lærerFrø });
      if (lærer.type === "SPILL") {
        const visning = spillerVisning(s, sete);
        const inn = lagInn(visning, "SPILL", s.giving.antallStikk, s.regler.målPoeng);
        lærerNett.aktiver(inn);
        const lIdx = kortIndeks(lærer.kort);
        const aIdx = kortIndeks(handling.kort);
        lærerNett.kalibrerUtgang(UT_KORT + lIdx, 0.8, RATE);
        if (aIdx !== lIdx) {
          lærerNett.kalibrerUtgang(UT_KORT + aIdx, -0.5, RATE * 0.6);
        } else {
          enige++;
          kampEnige++;
        }
        beslutninger++;
        kampBesl++;
      }
    } else if (s.fase === "VRAK" && handling.type === "VRAK") {
      const lærer = velgHandling(s, { ...LÆRER, frø: lærerFrø });
      if (lærer.type === "VRAK") {
        const visning = spillerVisning(s, sete);
        const inn = lagInn(visning, "VRAK", s.giving.antallStikk, s.regler.målPoeng);
        lærerNett.aktiver(inn);
        const vrakes = new Set(lærer.kort.map(kortIndeks));
        for (const k of s.hender[sete]!) {
          const idx = kortIndeks(k);
          lærerNett.kalibrerUtgang(UT_KORT + idx, vrakes.has(idx) ? -0.6 : 0.3, RATE * 0.3);
        }
      }
    } else if (s.fase === "VELG" && handling.type === "VELG") {
      const lærer = velgHandling(s, { ...LÆRER, frø: lærerFrø });
      if (lærer.type === "VELG") {
        const visning = spillerVisning(s, sete);
        const inn = lagInn(visning, "VELG", s.giving.antallStikk, s.regler.målPoeng);
        lærerNett.aktiver(inn);
        for (let f = 0; f < 4; f++) {
          lærerNett.kalibrerUtgang(UT_TRUMF + f, FARGER[f] === lærer.trumf ? 0.8 : -0.3, RATE * 0.5);
        }
      }
    }

    // DAgger: AGENTENS trekk utføres – lærdommen hentes fra nettets egne
    // tilstander, ikke lærerens idealtrajektorie.
    s = utfør(s, handling).state;
  }

  kamper++;
  console.log(
    `kamp ${kamper}: enighet ${kampBesl > 0 ? ((100 * kampEnige) / kampBesl).toFixed(0) : "-"} % ` +
      `(totalt ${((100 * enige) / Math.max(1, beslutninger)).toFixed(1)} % av ${beslutninger})`,
  );
  // Lagre underveis – en container-restart skal ikke koste økta.
  writeFileSync(`${utfil}.tmp`, genomTilJson(genom));
  renameSync(`${utfil}.tmp`, utfil);
}

writeFileSync(`${utfil}.tmp`, genomTilJson(genom));
renameSync(`${utfil}.tmp`, utfil);
console.log(
  `Lærling ferdig: ${beslutninger} fasitmerkede kortvalg over ${kamper} kamper, ` +
    `sluttenighet ${((100 * enige) / Math.max(1, beslutninger)).toFixed(1)} % → ${utfil}`,
);
