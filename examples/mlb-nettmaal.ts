/**
 * HVA KOSTER ÉN BESLUTNING MED SANDKASSENETTET? Målt, ikke anslått.
 *
 *   node examples/mlb-nettmaal.ts --beslutninger 4000 \
 *     --vekter e1-modell/mlb-sandkasse.bin --tro e1-modell/mlb-tro.bin \
 *     --ut analyse/mlb-nett-maal.txt
 *
 * §120 målte trekkbyggeren alene: **0,067 ms** uten trohodet og **0,516 ms**
 * med. Det var argumentet for å gjøre troen til et HODE i stedet for en ekstern
 * inngang — to framoverpasseringer etter hverandre mot én.
 *
 * Her måles begge armene ved siden av hverandre, på de samme stillingene:
 *
 *   ÉN PASSERING     byggTrekk(tro AV) + Sandkassenett.framover + velgKode
 *   TO PASSERINGER   byggTrekk(tro PÅ) + Sandkassenett.framover + velgKode
 *
 * Den andre armen krever `--tro <fil>`. Uten den står TRO-blokken på null og
 * armen måles ikke — og det står i rapporten, så ingen leser et gulv som en
 * pris.
 *
 * ===================== HVORFOR BEGGE ARMENE FINNES =======================
 *
 * Troen som hode er valgt, men ikke bevist bedre. `trekk.ts` beholder derfor
 * `tronett`-inngangen som AVSKRUBAR, standard AV, slik at spørsmålet «tilfører
 * en ekstern tro noe utover hodet?» kan MÅLES i stedet for antas. Denne fila
 * er prislappen på den målingen; kvaliteten måles et annet sted.
 *
 * RADENE SKRIVES LØPENDE med `appendFileSync`. En måling som bare finnes i et
 * stdout-rør er ingen måling.
 */

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

import { opprettSpill, spillerVisning, utfør, type GameState } from "../src/index.ts";
import { lagRng } from "../src/kort.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import { maske, ta, TOMT_DELVALG, type Delvalg } from "../src/mlb/handling.ts";
import { Sandkassenett, velgKode } from "../src/mlb/nett.ts";
import { byggTrekk, TREKK_LENGDE } from "../src/mlb/trekk.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(`--${n}`);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};

const maks = Number(arg("beslutninger", "3000"));
const mål = Number(arg("mål", "30"));
const vektfil = arg("vekter", "");
const trofil = arg("tro", "");
const ut = arg("ut", "analyse/mlb-nett-maal.txt");
const temperatur = Number(arg("temp", "1"));

const nett = vektfil === "" ? Sandkassenett.tilfeldig(20260809) : Sandkassenett.fraFil(vektfil);

const iTur = (s: GameState): number | null =>
  s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;

const par = nett.parametre();
writeFileSync(
  ut,
  `# MLB 0.3 — kostnad per beslutning, sandkassenettet\n` +
    `# ${new Date().toISOString()}  maks=${maks} målPoeng=${mål} temp=${temperatur}\n` +
    `# vekter=${vektfil || "TILFELDIGE"}  ekstern tro=${trofil || "AV (ikke målt)"}\n` +
    `# TREKK_LENGDE=${TREKK_LENGDE} form=${JSON.stringify(nett.form())}\n` +
    `# parametre: stamme=${par.stamme} policy=${par.policy} verdi=${par.verdi} ` +
    `tro=${par.tro} SUM=${par.sum}\n` +
    `# n\tfase\tms_trekk_av\tms_trekk_paa\tms_framover\tms_velg\n`,
  "utf8",
);

let n = 0;
let msTrekkAv = 0;
let msTrekkPå = 0;
let msFram = 0;
let msVelg = 0;
let ulovlige = 0;
const perFase: Record<string, { n: number; ms: number }> = {};

for (let g = 0; n < maks; g++) {
  const frø = 5_500_000_000 + g * 7717;
  const rng = lagRng((frø ^ 0x1f2e3d4c) >>> 0);
  const huk = new Hukommelse();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: mål }, frø);
  let vakt = 0;
  while (s.fase !== "FERDIG" && vakt++ < 20_000 && n < maks) {
    huk.observer(s);
    const sete = iTur(s);
    if (sete === null) {
      if (s.fase === "RUNDE_SLUTT") {
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      break;
    }
    const hukVektor = huk.vektor(sete, 4);
    let delvalg: Delvalg = TOMT_DELVALG;
    for (let steg = 0; steg < 20; steg++) {
      const visning = spillerVisning(s, sete);
      const grunn = { regler: s.regler, giving: s.giving, delvalg, hukommelse: hukVektor };

      const t0 = performance.now();
      const trekk = byggTrekk(visning, grunn);
      const t1 = performance.now();
      // §126: den eksterne troen er fjernet som inngang, saa det finnes ikke
      // lenger en «to passeringer»-arm aa maale. Tallet under er null, og det
      // staar i rapporten som null i stedet for aa forsvinne i stillhet.
      const t2 = t1;
      const framover = nett.framover(trekk);
      const t3 = performance.now();
      const m = maske(visning, s.giving, delvalg);
      const kode = velgKode(framover.policy, m, temperatur, rng);
      const t4 = performance.now();
      if (m[kode] !== 1) ulovlige++;

      n++;
      msTrekkAv += t1 - t0;
      msTrekkPå += t2 - t1;
      msFram += t3 - t2;
      msVelg += t4 - t3;
      const b = (perFase[s.fase] ??= { n: 0, ms: 0 });
      b.n++;
      b.ms += t1 - t0 + (t3 - t2) + (t4 - t3);
      appendFileSync(
        ut,
        `${n}\t${s.fase}\t${(t1 - t0).toFixed(4)}\t${(t2 - t1).toFixed(4)}` +
          `\t${(t3 - t2).toFixed(4)}\t${(t4 - t3).toFixed(4)}\n`,
        "utf8",
      );

      const steget = ta(visning, s.giving, delvalg, kode);
      if (steget.ferdig) {
        s = utfør(s, { ...steget.handling, spiller: sete }).state;
        break;
      }
      delvalg = steget.delvalg;
    }
  }
}

const enPass = (msTrekkAv + msFram + msVelg) / n;
const toPass = (msTrekkAv + msTrekkPå + msFram + msVelg) / n;
const linjer = [
  "",
  `# ---- OPPSUMMERING (${n} beslutninger) ----`,
  `# byggTrekk, ekstern tro AV : ${(msTrekkAv / n).toFixed(4)} ms   (§120 målte 0,067)`,
  `# byggTrekk, ekstern tro PÅ : FJERNET i §126 (§120 målte 0,516)`,
  `# Sandkassenett.framover    : ${(msFram / n).toFixed(4)} ms`,
  `# velgKode                  : ${(msVelg / n).toFixed(4)} ms`,
  `# ÉN PASSERING   (tro = hode)      : ${enPass.toFixed(4)} ms/beslutning`,
  `# TO PASSERINGER (tro som inngang) : finnes ikke lenger (§126)`,
];
for (const [fase, b] of Object.entries(perFase)) {
  linjer.push(`# ${fase.padEnd(9)} n=${String(b.n).padStart(6)}  ${(b.ms / b.n).toFixed(4)} ms`);
}
linjer.push(`# ULOVLIGE VALG: ${ulovlige} (skal være 0)`);
appendFileSync(ut, linjer.join("\n") + "\n", "utf8");
console.log(linjer.join("\n"));
if (ulovlige > 0) process.exitCode = 1;
