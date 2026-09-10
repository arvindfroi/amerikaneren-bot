/**
 * MAKKERENS UTSPILL I STIKK 2 - Arvinds konvensjon.
 *
 * «Etter stikket der det etterlyste kortet ble spilt er det som regel makkeren
 * som spiller ut. Det vi pleier aa gjoere er aa spille vaar hoeyeste trumf for
 * aa presse trumf ut av bordet - vi antar at budgiver har kontroll, og at det
 * gir mer kontroll senere.»
 *
 * Maales to ting, ikke bare én:
 *   1) UTFALLET: hva sier SD-fasiten om hoeyeste trumf mot laveste trumf og
 *      mot beste ikke-trumf, i noeyaktig disse stillingene.
 *   2) MEKANISMEN: presses trumfen faktisk ut? Antall trumf motstanderne
 *      kvitter seg med i stikket, uavhengig av sluttresultatet.
 *
 * FORBEHOLD: SD-rolloutet lar NevroHjerne spille resten. Konvensjonens verdi
 * avhenger av at spillefoerer UTNYTTER kontrollen etterpaa. Gjoer ikke nevro
 * det, undervurderer fasiten trumfutspillet - da maaler vi nevros evne til aa
 * bruke kontroll, ikke om konvensjonen er riktig.
 */
import { opprettSpill, utfør, lovligeKort, type Kort } from "./src/index.ts";
import { vurderKortSD } from "./src/moe2/sdkort.ts";
import { NevroAgent } from "./src/nevro/index.ts";
import { lagRng } from "./src/kort.ts";

const nevro = new NevroAgent();
const rng = lagRng(4711);
let n = 0, hoyBest = 0;
const dLav: number[] = [], dIkke: number[] = [];
let trumfUtHoy = 0, trumfUtLav = 0, mekN = 0;

for (let f = 0; f < 1600 && n < 40; f++) {
  let s = opprettSpill({ antallSpillere: 4 }, 6_900_000 + f);
  let v = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && v++ < 3000) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
    if (s.fase === "SPILL" && s.stikkSpilt === 1 && s.bord.length === 0
        && s.makker !== null && iTur === s.makker && s.trumf !== null) {
      const lov = lovligeKort(s, iTur);
      const trumf = lov.filter((k) => k.farge === s.trumf);
      const annet = lov.filter((k) => k.farge !== s.trumf);
      if (trumf.length >= 2) {
        const vurdert = vurderKortSD(s, iTur, nevro, { verdener: 32, rng });
        const val = (k: Kort) => vurdert.find((x) => x.kort.farge === k.farge && x.kort.verdi === k.verdi)?.verdi ?? NaN;
        const t = [...trumf].sort((a, b) => a.verdi - b.verdi);
        const hoyK = t[t.length - 1]!, lavK = t[0]!;
        const hoy = val(hoyK), lav = val(lavK);
        const beste = Math.max(...lov.map(val).filter((x) => !Number.isNaN(x)));
        if (Number.isFinite(hoy) && Number.isFinite(lav)) {
          n++; dLav.push(hoy - lav);
          if (annet.length > 0) {
            const bi = Math.max(...annet.map(val).filter((x) => !Number.isNaN(x)));
            if (Number.isFinite(bi)) dIkke.push(hoy - bi);
          }
          if (Math.abs(hoy - beste) < 1e-9) hoyBest++;
          // MEKANISMEN: spill stikket ut med hvert av de to kortene og tell
          // hvor mange trumf MOTSTANDERNE (ikke budlaget) legger i stikket.
          const motstandere = [0,1,2,3].filter(p => p !== s.budvinner && p !== s.makker);
          for (const [kort, teller] of [[hoyK, "hoy"], [lavK, "lav"]] as const) {
            let t2 = utfør(s, { type: "SPILL", spiller: iTur, kort }).state;
            let g = 0;
            while (t2.bord.length > 0 && t2.bord.length < 4 && g++ < 10) {
              t2 = utfør(t2, nevro.velgHandling(t2)).state;
            }
            // forrigeStikk er { kort, vinner } - ikke en liste.
            const spilte = t2.forrigeStikk !== null ? t2.forrigeStikk.kort : t2.bord;
            const lagt = spilte.filter(
              (b: any) => motstandere.includes(b.spiller) && b.kort.farge === s.trumf,
            ).length;
            if (teller === "hoy") trumfUtHoy += lagt; else trumfUtLav += lagt;
          }
          mekN++;
        }
      }
    }
    s = utfør(s, nevro.velgHandling(s)).state;
  }
}
if (n < 5) { console.log(`bare ${n} stillinger - for lite til aa konkludere`); process.exit(0); }
const st = (a: number[]) => { const m = a.reduce((x, y) => x + y, 0) / a.length; const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); return [m, sd / Math.sqrt(a.length)] as const; };
const [m1, e1] = st(dLav);
console.log(`\n=== STIKK 2, makkeren leder: ${n} stillinger ===\n`);
console.log(`UTFALL (SD-fasiten):`);
console.log(`  hoyeste trumf var beste lovlige kort:   ${hoyBest}/${n} (${Math.round(100*hoyBest/n)} %)`);
console.log(`  hoyeste minus laveste trumf:            ${m1>=0?"+":""}${m1.toFixed(3)} +- ${e1.toFixed(3)}  (${(m1/e1).toFixed(1)} SE)`);
if (dIkke.length > 2) { const [m2,e2]=st(dIkke); console.log(`  hoyeste trumf minus beste ikke-trumf:   ${m2>=0?"+":""}${m2.toFixed(3)} +- ${e2.toFixed(3)}  (n=${dIkke.length})`); }
console.log(`\nMEKANISME (presses trumfen ut?), ${mekN} stillinger:`);
console.log(`  trumf fra motstanderne, hoyeste ut:     ${(trumfUtHoy/mekN).toFixed(2)} per stikk`);
console.log(`  trumf fra motstanderne, laveste ut:     ${(trumfUtLav/mekN).toFixed(2)} per stikk`);
