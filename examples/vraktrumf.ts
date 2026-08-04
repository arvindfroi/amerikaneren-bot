/**
 * VRAKER VI TRUMF? Arvinds regel: «aldri hiv ut trumf, alltid ta det inn.»
 *
 *   node examples/vraktrumf.ts 6000000 2000 analyse/vraktrumf.json
 *
 * HVORFOR REGELEN KAN BRYTES AV EN BOT SOM SER FORNUFTIG UT. I Amerikaneren
 * VRAKES FØR TRUMFEN VELGES (`motor.ts`: avsluttBudrunde → fase VRAK → VELG).
 * Regelen «aldri hiv ut trumf» er derfor ikke en regel om ett valg, men et
 * KRAV OM KOBLING mellom to: vraket må gjøres med den trumfen man har tenkt å
 * velge, i tankene.
 *
 * Adams tar dem uavhengig:
 *   `NevroAgent.velgVrak`  – et nett scorer «behold» per kort. Inngangen
 *                            (`byttTrekk`) har ingen trumf, for den finnes
 *                            ikke ennå.
 *   `velgTrumfOgEtterlys`  – `besteTrumf` på hånden som BLE IGJEN.
 *
 * Nettet kan ha lært koblingen implisitt av hånden. Denne målingen sier om
 * det stemmer, og den er billig: den teller bare, den endrer ingenting.
 *
 * TRE TALL, og de svarer på ulike ting:
 *   1. Hvor ofte vrakes minst ett kort i fargen som SÅ blir trumf.
 *   2. Hvor mange slike kort per runde, og hvor høye de er.
 *   3. KONTRAFAKTISK: ville en annen trumffarge – blant dem vi faktisk hadde
 *      kort igjen i – gitt flere estimerte stikk om vi ikke hadde vraket der?
 *      Uten det siste er tall 1 og 2 tvetydige: å vrake to små i en farge man
 *      likevel velger kan være riktig, hvis fargen er lang nok.
 */

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { estimerStikk } from "../src/nevro/index.ts";
import { type Farge, type Kort } from "../src/kort.ts";
import { lagIndre, ADAMS, tall } from "../src/moe2/agentspek.ts";

const FRØ0 = tall(process.argv[2], 6_000_000, "argv[2]");
const RUNDER = tall(process.argv[3], 2000, "argv[3]");
const UT = process.argv[4] ?? "analyse/vraktrumf.json";
const SPEK = process.argv[5] ?? ADAMS;



type Rad = {
  frø: number;
  /** Kort vraket, som «farge verdi». */
  vraket: { farge: Farge; verdi: number }[];
  trumf: Farge;
  /** Vrakede kort i fargen som ble trumf. */
  vrakITrumf: number[];
  /** Estimerte stikk med valgt trumf, på hånden som ble igjen. */
  estValgt: number;
  /** Beste estimat om de vrakede trumfkortene hadde vært beholdt. */
  estMedVraket: number;
};

const agent = lagIndre(SPEK);
const rader: Rad[] = [];

for (let i = 0; i < RUNDER; i++) {
  const frø = FRØ0 + i * 7919;
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  agent.nyKamp();
  let vraket: Kort[] | null = null;
  let håndFørVrak: Kort[] | null = null;
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 600) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    if (s.fase === "VRAK" && vraket === null) håndFørVrak = (s.hender[iTur] ?? []).slice();
    const h = agent.velgHandling(s);
    if (h.type === "VRAK") vraket = h.kort.slice();
    if (h.type === "VELG") {
      const trumf = h.trumf;
      const igjen = (s.hender[iTur] ?? []).slice();
      if (vraket !== null && håndFørVrak !== null) {
        const iTrumf = vraket.filter((k) => k.farge === trumf).map((k) => k.verdi);
        // KONTRAFAKTISK: hånden slik den ville vært med trumfkortene beholdt.
        // De må erstatte noe, ellers sammenlignes ulike håndstørrelser - vi
        // bytter dem mot de laveste kortene i andre farger.
        const medTilbake = igjen.slice();
        const tilbake = vraket.filter((k) => k.farge === trumf);
        for (const k of tilbake) {
          const kandidater = medTilbake
            .map((x, idx) => ({ x, idx }))
            .filter((o) => o.x.farge !== trumf)
            .sort((a, b) => a.x.verdi - b.x.verdi);
          if (kandidater.length === 0) break;
          medTilbake.splice(kandidater[0]!.idx, 1);
          medTilbake.push(k);
        }
        rader.push({
          frø,
          vraket: vraket.map((k) => ({ farge: k.farge, verdi: k.verdi })),
          trumf,
          vrakITrumf: iTrumf,
          estValgt: estimerStikk(igjen, trumf),
          estMedVraket: estimerStikk(medTilbake, trumf),
        });
      }
      break; // resten av runden er irrelevant for denne målingen
    }
    s = utfør(s, h).state;
  }
}

const n = rader.length;
const medVrakITrumf = rader.filter((r) => r.vrakITrumf.length > 0);
const antallKort = rader.reduce((a, r) => a + r.vrakITrumf.length, 0);
const høye = rader.flatMap((r) => r.vrakITrumf).filter((v) => v >= 11);
const gevinst = medVrakITrumf.map((r) => r.estMedVraket - r.estValgt);
const snitt = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const se = (xs: number[]): number => {
  if (xs.length < 2) return NaN;
  const m = snitt(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1) / xs.length);
};

const rapport = {
  spek: SPEK,
  frø0: FRØ0,
  runder: n,
  medVrakITrumf: medVrakITrumf.length,
  andel: medVrakITrumf.length / Math.max(1, n),
  trumfkortVraketTotalt: antallKort,
  perRunde: antallKort / Math.max(1, n),
  hvorAvHonnoer: høye.length,
  estimertTaptStikk: { snitt: snitt(gevinst), se: se(gevinst), n: gevinst.length },
  fordelingAntall: [0, 1, 2, 3, 4].map((k) => ({
    antall: k,
    runder: rader.filter((r) => r.vrakITrumf.length === k).length,
  })),
};

mkdirSync(dirname(UT), { recursive: true });
writeFileSync(UT, JSON.stringify(rapport, null, 2), "utf-8");
appendFileSync(
  UT.replace(/\.json$/, ".jsonl"),
  rader.map((r) => JSON.stringify(r)).join("\n") + "\n",
  "utf-8",
);

console.log(`Spek: ${SPEK}`);
console.log(`Runder med vrak+trumfvalg: ${n}`);
console.log(
  `Runder der minst ETT vraket kort var i fargen som ble trumf: ${medVrakITrumf.length} ` +
    `(${(rapport.andel * 100).toFixed(1)} %)`,
);
console.log(`Trumfkort vraket totalt: ${antallKort} (${rapport.perRunde.toFixed(3)} per runde)`);
console.log(`  ...hvorav knekt eller hoeyere: ${høye.length}`);
for (const f of rapport.fordelingAntall) {
  if (f.runder > 0) console.log(`    ${f.antall} vraket i trumffargen: ${f.runder} runder`);
}
console.log(
  `\nEstimerte stikk om de var beholdt (bytte mot laveste andre): ` +
    `${snitt(gevinst) >= 0 ? "+" : ""}${snitt(gevinst).toFixed(4)} +/- ${se(gevinst).toFixed(4)} (n=${gevinst.length})`,
);
console.log(`\nSkrevet til ${UT}`);
