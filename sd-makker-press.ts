/**
 * MAKKERENS HOEYE TRUMFUTSPILL - den ekte mekanismen.
 *
 * Foerste maaling telte ANTALL trumf motstanderne la (1,13 uansett hoeyde) og
 * konkluderte at hoeyden ikke gjoer noe. Det var feil metrikk. Arvinds argument
 * er ikke at flere trumf kommer ut, men at hoeyt utspill tvinger forsvaret til
 * et VALG som koster dem uansett:
 *
 *   1. de maa legge trumf (fargefoelgeplikt)
 *   2. de maa velge: proeve aa ta stikket, eller la makkeren ta det
 *   3. legger de over, er det implisitt at budvinner tar det med en topp
 *   4. lar de det gaa, kan budvinner legge sin LAVESTE trumf og spare toppene
 *
 * Maalt her, med hoeyt mot lavt utspill i SAMME stilling:
 *   - hvilken VALOER forsvaret tvinges til aa legge
 *   - om budvinner slipper unna med et lavt kort
 *   - hvor mange topptrumf (>=13) budlaget har igjen etter stikket
 */
import { opprettSpill, utfør, lovligeKort, type Kort } from "./src/index.ts";
import { NevroAgent } from "./src/nevro/index.ts";
const nevro = new NevroAgent();
type R = { forsvarValoer: number[]; foererValoer: number[]; toppIgjen: number[]; foererTok: number };
const lag = (): R => ({ forsvarValoer: [], foererValoer: [], toppIgjen: [], foererTok: 0 });
const hoyR = lag(), lavR = lag();
let n = 0;

for (let f = 0; f < 2500 && n < 120; f++) {
  let s = opprettSpill({ antallSpillere: 4 }, 7_300_000 + f);
  let v = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && v++ < 3000) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
    if (s.fase === "SPILL" && s.stikkSpilt === 1 && s.bord.length === 0
        && s.makker !== null && iTur === s.makker && s.trumf !== null) {
      const trumf = lovligeKort(s, iTur).filter((k) => k.farge === s.trumf);
      if (trumf.length >= 2) {
        const t = [...trumf].sort((a, b) => a.verdi - b.verdi);
        const motst = [0,1,2,3].filter((p) => p !== s.budvinner && p !== s.makker);
        for (const [kort, R] of [[t[t.length-1]!, hoyR], [t[0]!, lavR]] as const) {
          let x = utfør(s, { type: "SPILL", spiller: iTur, kort }).state;
          let g = 0;
          while (x.bord.length > 0 && x.bord.length < 4 && g++ < 10) x = utfør(x, nevro.velgHandling(x)).state;
          const st = x.forrigeStikk !== null ? x.forrigeStikk.kort : x.bord;
          for (const b of st as any[]) {
            if (b.kort.farge !== s.trumf) continue;
            if (motst.includes(b.spiller)) R.forsvarValoer.push(b.kort.verdi);
            if (b.spiller === s.budvinner) R.foererValoer.push(b.kort.verdi);
          }
          if (x.forrigeStikk !== null && (x.forrigeStikk.vinner === s.budvinner)) R.foererTok++;
          // Topptrumf budlaget har igjen etter stikket.
          const igjen = [s.budvinner!, s.makker!].reduce((a, p) =>
            a + (x.hender[p] ?? []).filter((k: Kort) => k.farge === s.trumf && k.verdi >= 13).length, 0);
          R.toppIgjen.push(igjen);
        }
        n++;
      }
    }
    s = utfør(s, nevro.velgHandling(s)).state;
  }
}
const sn = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
console.log(`\n=== Hoeyt mot lavt trumfutspill fra makkeren, stikk 2. n=${n} stillinger ===\n`);
console.log("".padEnd(38) + "HOEYT ut".padStart(10) + "LAVT ut".padStart(10));
console.log("-".repeat(58));
console.log("forsvarets snittvaloer i trumf".padEnd(38) + sn(hoyR.forsvarValoer).toFixed(2).padStart(10) + sn(lavR.forsvarValoer).toFixed(2).padStart(10));
console.log("budvinnerens snittvaloer i trumf".padEnd(38) + sn(hoyR.foererValoer).toFixed(2).padStart(10) + sn(lavR.foererValoer).toFixed(2).padStart(10));
console.log("budlagets topptrumf igjen etter".padEnd(38) + sn(hoyR.toppIgjen).toFixed(2).padStart(10) + sn(lavR.toppIgjen).toFixed(2).padStart(10));
console.log("budvinner tok stikket".padEnd(38) + `${Math.round(100*hoyR.foererTok/n)} %`.padStart(10) + `${Math.round(100*lavR.foererTok/n)} %`.padStart(10));
