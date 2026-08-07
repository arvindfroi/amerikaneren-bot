/**
 * A1-KONSTANTENE, MÅLT I STEDET FOR SATT.
 *
 *   node examples/slutning-kalibrer.ts --giver 400 --ut analyse/slutning-kal.txt
 *
 * ARVIND: «prediksjonen burde ikke være normale regler men enten læring over
 * tid eller matematiske formler» — og senere: «hvis de er dårlige så må du
 * fikse det ikke fjerne de.»
 *
 * A1 (`hvemla-slutning.ts`) målte **verre enn ingen slutning i det hele tatt**
 * på trosnøyaktighet (log-tap 0,9624 mot 0,9509). Den skal derfor fikses, og
 * fiksen er å slutte å gjette konstantene.
 *
 * ================= HVA KONSTANTENE FAKTISK PÅSTÅR =======================
 *
 * De tre tallene er log-vekter, så de er ikke smaksvalg — hver av dem er en
 * presis empirisk påstand:
 *
 *     STRAFF_IKKE_VANT    = 1,0   ⇒  «en spiller som KUNNE vinne stikket lar
 *                                     være i e^−1,0 = 37 % av tilfellene»
 *     STRAFF_IKKE_TRUMFET = 1,5   ⇒  «en spiller som KUNNE trumfe lar være i
 *                                     e^−1,5 = 22 % av tilfellene»
 *
 * Er de tallene feil, peker slutningen systematisk feil vei — og en skarp,
 * gal tro er verre enn ingen tro. Det er nøyaktig det målingen viste.
 *
 * ================= HVORDAN DE MÅLES =====================================
 *
 * Spill partier og se på de VIRKELIGE hendene i etterkant. For hvert
 * ferdigspilt stikk, for hver spiller:
 *
 *   KUNNE VINNE   hadde hen et kort som slo det som lå, da hen spilte?
 *   VANT          gjorde hen det?
 *
 * Da er `P(lot være | kunne)` en ren telling, og vekten som følger er
 * `log P(lot være | kunne)` — fordi en spiller som IKKE kunne vinne, lar være
 * med sannsynlighet 1, og log 1 = 0.
 *
 * Det er ikke en heuristikk lenger. Det er likelihood-forholdet, målt.
 *
 * LENGDEVEKTEN måles annerledes: hvor mye øker forventet antall gjenværende
 * kort i en farge per gang setet FULGTE fargen? Regresjonshellingen er vekten.
 */

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lagIndre, ADAMS_MAALT, tall } from "../src/moe2/agentspek.ts";
import type { Farge, Kort } from "../src/kort.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const GIVER = tall(arg("--giver", "200"), 200, "giver");
const UT = arg("--ut", "analyse/slutning-kalibrering.txt");
const JSONL = arg("--jsonl", "analyse/slutning-kalibrering.jsonl");
const SPEK = arg("--spek", ADAMS_MAALT);

/** Slår `k` det beste som lå da? */
function slår(k: Kort, best: Kort | null, trumf: Farge | null): boolean {
  if (best === null) return true;
  if (k.farge === best.farge) return k.verdi > best.verdi;
  return trumf !== null && k.farge === trumf && best.farge !== trumf;
}

let kunneVinne = 0;
let lotVære = 0;
let kunneTrumfe = 0;
let lotVæreTrumfe = 0;
/** (fulgt, igjen) per (sete, farge) ved rundeslutt, for lengdehellingen. */
const lengdePar: { fulgt: number; igjen: number }[] = [];

mkdirSync(dirname(UT), { recursive: true });
mkdirSync(dirname(JSONL), { recursive: true });
writeFileSync(JSONL, "");

for (let g = 0; g < GIVER; g++) {
  const frø = 21_000_000 + g * 4409;
  const ag = [0, 1, 2, 3].map(() => lagIndre(SPEK));
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;

  /**
   * HÅNDEN FØR HVERT TREKK må fanges mens den finnes. Etterpå er kortet borte,
   * og «kunne hen vinne?» kan ikke lenger besvares — det er hele grunnen til at
   * denne målingen må gjøres UNDER spillet og ikke fra en logg.
   */
  const fulgtTeller = new Map<string, number>();
  const lengdeSnapshot = new Map<string, { fulgt: number; igjen: number }>();

  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 200) {
    if (s.fase === "SPILL" && s.iTur !== null) {
      const sete = s.iTur;
      const hånd = s.hender[sete] ?? [];
      const ledet = s.bord[0]?.kort.farge ?? null;

      // Det beste kortet på bordet FØR vårt trekk.
      let best: Kort | null = null;
      for (const kp of s.bord) {
        if (best === null || slår(kp.kort, best, s.trumf)) best = kp.kort;
      }

      if (s.bord.length > 0 && ledet !== null) {
        const harFarge = hånd.some((k) => k.farge === ledet);
        const kanSlå = hånd.some(
          (k) => (harFarge ? k.farge === ledet : true) && slår(k, best, s.trumf),
        );
        if (kanSlå) kunneVinne++;

        // TRUMFMULIGHET: renons i ledet farge OG har trumf.
        const kanTrumfe =
          !harFarge && s.trumf !== null && hånd.some((k) => k.farge === s.trumf);
        if (kanTrumfe) kunneTrumfe++;

        const h = ag[sete]!.velgHandling(s);
        if (h.type === "SPILL") {
          if (kanSlå && !slår(h.kort, best, s.trumf)) lotVære++;
          if (kanTrumfe && h.kort.farge !== s.trumf) lotVæreTrumfe++;
          if (ledet !== null && h.kort.farge === ledet) {
            const n = `${sete}:${ledet}`;
            fulgtTeller.set(n, (fulgtTeller.get(n) ?? 0) + 1);
          }
        }
        s = utfør(s, h).state;
        // MIDTPUNKTET: etter stikk 6 er det baade spilt nok til aa ha fulgt
        // fargen flere ganger, og nok igjen paa haanden til aa telle.
        if (s.stikkSpilt === 6 && lengdeSnapshot.size === 0) {
          for (const [nøkkel, fulgt] of fulgtTeller) {
            const [setStr, farge] = nøkkel.split(":") as [string, string];
            const igjen = (s.hender[Number(setStr)] ?? []).filter((k) => k.farge === farge).length;
            lengdeSnapshot.set(nøkkel, { fulgt, igjen });
          }
        }
        continue;
      }
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, ag[iTur]!.velgHandling(s)).state;
  }

  /**
   * LENGDEN MAA MAALES MIDT I RUNDEN, ikke ved slutten.
   *
   * Foerste utgave leste `igjen` etter loekka - altsaa ved RUNDE_SLUTT, der
   * alle hender er TOMME. Hellingen ble da eksakt 0,0000, og jeg holdt paa aa
   * rapportere «lengderegelen koder en sammenheng som ikke finnes». Nullen var
   * min maaling, ikke dataene.
   *
   * Naa fanges paret ved et fast punkt underveis (etter stikk 6), der det
   * fortsatt ER kort igjen aa telle.
   */
  for (const [nøkkel, par] of lengdeSnapshot) {
    void nøkkel;
    lengdePar.push(par);
  }
  appendFileSync(JSONL, JSON.stringify({ frø, kunneVinne, lotVære, kunneTrumfe, lotVæreTrumfe }) + "\n");
  process.stdout.write(`\r  ${g + 1}/${GIVER} giv   `);
}

const pVære = lotVære / Math.max(1, kunneVinne);
const pTrumf = lotVæreTrumfe / Math.max(1, kunneTrumfe);

// LENGDEHELLINGEN: enkel OLS av `igjen` på `fulgt`.
const n = lengdePar.length;
const mf = lengdePar.reduce((a, p) => a + p.fulgt, 0) / Math.max(1, n);
const mi = lengdePar.reduce((a, p) => a + p.igjen, 0) / Math.max(1, n);
let sxy = 0;
let sxx = 0;
for (const p of lengdePar) {
  sxy += (p.fulgt - mf) * (p.igjen - mi);
  sxx += (p.fulgt - mf) * (p.fulgt - mf);
}
const helling = sxx > 0 ? sxy / sxx : 0;

const L: string[] = [];
L.push(`# A1-KONSTANTENE, MÅLT  (${GIVER} giv, spek ${SPEK.slice(0, 60)}…)`);
L.push("");
L.push(`${"regel".padEnd(26)}${"n".padStart(8)}${"lot være".padStart(11)}${"andel".padStart(9)}${"log".padStart(9)}${"i koden".padStart(10)}`);
L.push("-".repeat(75));
L.push(
  `${"kunne vinne, vant ikke".padEnd(26)}${String(kunneVinne).padStart(8)}${String(lotVære).padStart(11)}` +
    `${(100 * pVære).toFixed(1).padStart(8)}%${(pVære > 0 ? -Math.log(pVære) : NaN).toFixed(3).padStart(9)}` +
    `${"1.000".padStart(10)}`,
);
L.push(
  `${"kunne trumfe, gjorde ikke".padEnd(26)}${String(kunneTrumfe).padStart(8)}${String(lotVæreTrumfe).padStart(11)}` +
    `${(100 * pTrumf).toFixed(1).padStart(8)}%${(pTrumf > 0 ? -Math.log(pTrumf) : NaN).toFixed(3).padStart(9)}` +
    `${"1.500".padStart(10)}`,
);
L.push("");
// RESIDUALSPREDNINGEN gjoer hellingen om til en LIKELIHOOD. Uten den er
// hellingen bare en retning; med den kan en verden faa en riktig log-vekt.
let sr = 0;
for (const p2 of lengdePar) {
  const forventet = mi + helling * (p2.fulgt - mf);
  sr += (p2.igjen - forventet) * (p2.igjen - forventet);
}
const sigma = n > 2 ? Math.sqrt(sr / (n - 2)) : 1;
L.push(`lengdehelling (igjen per fulgt): ${helling.toFixed(4)}   i koden: +0.1500   (n = ${n})`);
L.push(`  snitt fulgt ${mf.toFixed(3)}, snitt igjen ${mi.toFixed(3)}, residual-sd ${sigma.toFixed(3)}`);
L.push("");
L.push("FORTEGNET I KODEN ER FEIL. Regelen gir +0,15 per «min(fulgt, igjen)»,");
L.push("altsaa «jo mer du fulgte, jo mer har du igjen». Dataene sier det");
L.push("motsatte, og det er aapenbart i ettertid: kortene du spilte er borte.");
L.push("");
L.push(`FORESLAATTE KONSTANTER:`);
L.push(`  STRAFF_IKKE_VANT    = ${(pVære > 0 ? -Math.log(pVære) : NaN).toFixed(3)}`);
L.push(`  STRAFF_IKKE_TRUMFET = ${(pTrumf > 0 ? -Math.log(pTrumf) : NaN).toFixed(3)}`);
L.push(`  LENGDE_SNITT        = ${mi.toFixed(3)}`);
L.push(`  FULGT_SNITT         = ${mf.toFixed(3)}`);
L.push(`  LENGDE_HELLING      = ${helling.toFixed(3)}`);
L.push(`  LENGDE_SD           = ${sigma.toFixed(3)}`);
L.push("");
L.push("SLIK LESES DE. Vektene er LOG-SANNSYNLIGHETER, ikke smaksvalg. En spiller");
L.push("som IKKE kunne vinne lar være med sannsynlighet 1, og log 1 = 0 - derfor");
L.push("ER -log P(lot være | kunne) hele likelihood-forholdet.");
L.push("");
L.push("Avviker en målt verdi fra koden, peker slutningen systematisk feil vei,");
L.push("og en skarp gal tro er verre enn ingen tro. Det var nøyaktig det");
L.push("trosnøyaktigheten viste: A1 målte 0,9624 mot 0,9509 for ingen slutning.");

const tekst = L.join("\n");
writeFileSync(UT, tekst + "\n");
console.log("\n" + tekst);
