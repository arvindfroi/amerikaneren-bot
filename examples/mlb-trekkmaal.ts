/**
 * HVA KOSTER TREKKVEKTOREN? Målt, ikke anslått.
 *
 * `docs/mlb.md` §5b budsjetterer ~0,5 ms per beslutning for et rent nett, og
 * AVGJØRELSE 5 kastet ut `amu` som trekk nettopp fordi 138 ms per beslutning
 * gjorde én epoke til 268 kjernetimer. Trekkbyggeren er det som står igjen på
 * inngangssiden, og da må den ha et tall.
 *
 * KONVENSJONSBLOKKEN ER DEN MISTENKTE. Den kaller `vaktKort` én gang per regel
 * per lovlig kort — opptil 17 × 12 = 204 oppslag per beslutning, og flere av
 * reglene bygger en hel stokk (`ukjenteKort`) hver gang. Derfor måles den for
 * seg, ikke bare totalen.
 *
 * RADENE SKRIVES LØPENDE, én om gangen, med `appendFileSync`. En flertimers
 * måling som bare finnes i et stdout-rør er ingen måling — den er borte i det
 * skallet lukkes.
 *
 *   node examples/mlb-trekkmaal.ts --giver 40 --ut analyse/mlb-trekk-maal.txt
 */

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

import { opprettSpill, spillerVisning, utfør, type GameState } from "../src/index.ts";
import { lagIndre, ADAMS_MAALT } from "../src/moe2/agentspek.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import { likeKort } from "../src/kort.ts";
import { vaktKort } from "../src/moe2/konvensjonsvakt.ts";
import {
  byggTrekk,
  KONVENSJON_LENGDE,
  KONVENSJONSREGLER,
  MIKRO_LENGDE,
  mikroTrekk,
  TREKK_LENGDE,
  visningTilState,
  type Beslutning,
} from "../src/mlb/trekk.ts";

const arg = (navn: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${navn}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};

const giver = Number(arg("giver", "20"));
const målPoeng = Number(arg("mål", "30"));
const ut = arg("ut", "analyse/mlb-trekk-maal.txt");
/**
 * Med `--tro <fil>` måles den ÆRLIGE kostnaden: TRO-blokken er en foroverkjøring
 * gjennom et nett på ~1,96 M vekter (§119), og den er det dyreste enkeltleddet i
 * vektoren. Uten flagget står blokken på null og tallet er et gulv, ikke en pris.
 */
const trofil = arg("tro", "");

const fasenavn = (s: GameState): Beslutning =>
  s.fase === "BUDRUNDE" ? "BUD" : s.fase === "VRAK" ? "VRAK" : s.fase === "VELG" ? "VELG" : "SPILL";
const iTur = (s: GameState): number | null =>
  s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;

const tronett = trofil === "" ? null : MlbTronett.fraBytes(readFileSync(trofil));

writeFileSync(
  ut,
  `# MLB trekkbygger — kostnad per beslutning\n` +
    `# ${new Date().toISOString()}  giver=${giver} målPoeng=${målPoeng} tro=${trofil || "AV"}\n` +
    `# TREKK_LENGDE=${TREKK_LENGDE} MIKRO=${MIKRO_LENGDE} KONVENSJON=${KONVENSJON_LENGDE} ` +
    `regler=${KONVENSJONSREGLER.length}\n` +
    `# kamp\tfase\tlovlige\tms_total\tms_mikro\tms_konvensjon\n`,
  "utf8",
);

const sum: Record<string, { n: number; ms: number; mikro: number; konv: number }> = {};
let n = 0;
let msTotal = 0;
let msMikro = 0;
let msKonv = 0;

for (let g = 0; g < giver; g++) {
  const drivere = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
  const huk = new Hukommelse();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng }, 9_100_000 + g * 2741);
  let vakt = 0;
  while (s.fase !== "FERDIG" && vakt++ < 6000) {
    huk.observer(s);
    const sete = iTur(s);
    if (sete === null) {
      if (s.fase === "RUNDE_SLUTT") {
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      break;
    }
    const fase = fasenavn(s);
    const visning = spillerVisning(s, sete);
    const kontekst = {
      regler: s.regler,
      giving: s.giving,
      hukommelse: huk.vektor(sete, 4),
      tronett,
    };

    const t0 = performance.now();
    byggTrekk(visning, kontekst);
    const t1 = performance.now();
    mikroTrekk(visning, kontekst);
    const t2 = performance.now();
    /**
     * Konvensjonssveipen for seg — SAMME funksjoner og samme løkkeform som i
     * `byggTrekk`, ikke en etterlikning. Er den dyr, skal tallet stå her og
     * ikke i en antakelse.
     */
    if (visning.fase === "SPILL" && visning.lovligeKort.length >= 2) {
      const red = visningTilState(visning, s.regler, s.giving);
      for (const regel of KONVENSJONSREGLER) {
        for (const kandidat of visning.lovligeKort) {
          if (likeKort(vaktKort(red, sete, kandidat, regel.valg), kandidat)) continue;
        }
      }
    }
    const t3 = performance.now();

    const a = t1 - t0;
    const b = t2 - t1;
    const c = t3 - t2;
    n++;
    msTotal += a;
    msMikro += b;
    msKonv += c;
    const bøtte = (sum[fase] ??= { n: 0, ms: 0, mikro: 0, konv: 0 });
    bøtte.n++;
    bøtte.ms += a;
    bøtte.mikro += b;
    bøtte.konv += c;

    appendFileSync(
      ut,
      `${g}\t${fase}\t${visning.lovligeKort.length}\t${a.toFixed(4)}\t${b.toFixed(4)}` +
        `\t${c.toFixed(4)}\n`,
      "utf8",
    );
    s = utfør(s, drivere[sete]!.velgHandling(s)).state;
  }
}

const linjer = [
  "",
  `# ---- OPPSUMMERING (${n} beslutninger) ----`,
  `# hele vektoren : ${(msTotal / n).toFixed(4)} ms/beslutning`,
  `# bare MIKRO    : ${(msMikro / n).toFixed(4)} ms/beslutning`,
  `# konvensjonene : ${(msKonv / n).toFixed(4)} ms/beslutning`,
  `# resten        : ${((msTotal - msMikro - msKonv) / n).toFixed(4)} ms/beslutning`,
];
for (const [fase, b] of Object.entries(sum)) {
  linjer.push(`# ${fase.padEnd(6)} n=${String(b.n).padStart(6)}  ${(b.ms / b.n).toFixed(4)} ms`);
}
linjer.push(
  `# En kamp til ${målPoeng} har ~${Math.round(n / giver)} beslutninger, altså ` +
    `~${((msTotal / giver) / 1000).toFixed(3)} s trekkbygging per kamp.`,
);
appendFileSync(ut, linjer.join("\n") + "\n", "utf8");
console.log(linjer.join("\n"));
