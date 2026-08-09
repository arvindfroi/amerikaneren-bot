/**
 * MLB FASE 0.3 — DATASETTET FOR DE TO HODENE SOM HAR PERFEKTE ETIKETTER.
 *
 *   node examples/mlb-data.ts --giver 400 --skard 0/12 --band trening \
 *     --ut mlb-data/trening-0.bin
 *
 * Fasen skal IKKE trene på selvspill — det er fase 0.4. Her trenes bare de to
 * hodene som har fasit og ingen sirkularitet:
 *
 *   verdi   rundens faktiske poeng for setet som sto for tur
 *   tro     hvor hvert usett kort FAKTISK lå
 *
 * Formålet er en fornuftssjekk på at rørgata virker ende til ende. Det er
 * ingen kvalitetsmåling, og tallene som faller ut er ikke en dom over noe.
 *
 * ===================== HVORFOR TILFELDIG SPILL ==========================
 *
 * `docs/mlb.md` §0 forbyr enhver orakelherkomst i en INNGANG eller en gradient.
 * En tilfeldig, LOVLIG driver har ingen herkomst i det hele tatt: den leser
 * `handling.maske` og trekker uniformt blant de åpne plassene. Da kan ingen
 * seinere lure på om etikettene arvet noe fra en sterkere spiller.
 *
 * Og den gjør en jobb til: driveren spiller hele kampen GJENNOM handlingsrommet
 * — `maske` → `velgKode` → `ta` → `utfør`, i alle fire faser og alle fem
 * delsteg. Går en kamp igjennom uten at motoren protesterer, er det den
 * fornuftssjekken `docs/mlb.md` fase 1 ber om, ikke en påstand om den.
 *
 * ===================== ETIKETTEN KOMMER FØRST VED RUNDESLUTT ============
 *
 * Rundens poeng finnes ikke når valget tas. Radene bufres derfor per runde og
 * skrives først når `RUNDE_SLUTT` har gitt `resultat.delta`. Det er samme
 * grense hukommelsen respekterer, og den er ikke en ulempe: det er nettopp det
 * som gjør etiketten til fasit om fortiden i stedet for en spådom.
 *
 * ===================== FRØBÅNDENE, AVSATT FØR FØRSTE RAD ================
 *
 * Disjunkte fra `examples/mlb-trodata.ts` sine bånd (41,0 M … 1,254 G) og fra
 * K8-prøvens (12 M …). Ingen overlapp, og det er sjekket ved konstruksjon:
 *
 *   trening   2 000 000 000 + g·7717,  g < 100 000  → 2,000 G … 2,772 G
 *   holdout   3 000 000 000 + g·7717,  g <  20 000  → 3,000 G … 3,154 G
 */

import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, spillerVisning, utfør, type GameState } from "../src/index.ts";
import { lagRng } from "../src/kort.ts";
import { troFasit } from "../src/mlb/fasit.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import { maske, ta, TOMT_DELVALG, type Delvalg } from "../src/mlb/handling.ts";
import { velgKode } from "../src/mlb/nett.ts";
import { byggTrekk, TREKK_LENGDE } from "../src/mlb/trekk.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const tall = (s: string, f: number): number => (Number.isFinite(Number(s)) ? Number(s) : f);

export const BÅND: Record<string, { base: number; steg: number; maks: number }> = {
  trening: { base: 2_000_000_000, steg: 7717, maks: 100_000 },
  holdout: { base: 3_000_000_000, steg: 7717, maks: 20_000 },
};

const BAND = arg("--band", "trening");
const bånd = BÅND[BAND];
if (bånd === undefined) throw new Error(`Ukjent bånd «${BAND}» (trening|holdout)`);
const GIVER = tall(arg("--giver", "200"), 200);
if (GIVER > bånd.maks) throw new Error(`båndet «${BAND}» er avsatt til ${bånd.maks} kamper`);
const MÅL = tall(arg("--mål", "30"), 30);
/** Andel beslutninger som skrives. 1 gir sterkt korrelerte naborader. */
const SJANSE = tall(arg("--sjanse", "0.35"), 0.35);
const UT = arg("--ut", `mlb-data/${BAND}-0.bin`);
const [SI, SN] = (arg("--skard", "0/1").split("/") as [string, string]).map(Number) as [
  number,
  number,
];

const FASEKODE: Record<string, number> = { BUDRUNDE: 0, VRAK: 1, VELG: 2, SPILL: 3 };

mkdirSync(dirname(UT), { recursive: true });
const fd = openSync(UT, "w");
{
  const hode = Buffer.alloc(12);
  hode.write("MLBS", 0, "ascii");
  hode.writeInt32LE(1, 4);
  hode.writeInt32LE(TREKK_LENGDE, 8);
  writeSync(fd, hode);
}
/** trekk | trofasit(52) | poeng(f32) | sete | stikk | fase | kode | frø */
const POST = TREKK_LENGDE * 4 + 52 + 4 + 2 + 2 + 2 + 2 + 4;
const KLUMP = 256;
const buf = Buffer.alloc(POST * KLUMP);
let iKlump = 0;
const tøm = (): void => {
  if (iKlump > 0) writeSync(fd, buf, 0, POST * iKlump);
  iKlump = 0;
};

interface Rad {
  readonly trekk: Float32Array;
  readonly fasit: Int8Array;
  readonly sete: number;
  readonly stikk: number;
  readonly fase: number;
  readonly kode: number;
  readonly frø: number;
}

let skrevet = 0;
const skriv = (r: Rad, poeng: number): void => {
  let o = iKlump * POST;
  for (let i = 0; i < TREKK_LENGDE; i++) {
    buf.writeFloatLE(r.trekk[i]!, o);
    o += 4;
  }
  for (let i = 0; i < 52; i++) buf.writeInt8(r.fasit[i]!, o + i);
  o += 52;
  buf.writeFloatLE(poeng, o);
  buf.writeInt16LE(r.sete, o + 4);
  buf.writeInt16LE(r.stikk, o + 6);
  buf.writeInt16LE(r.fase, o + 8);
  buf.writeInt16LE(r.kode, o + 10);
  buf.writeInt32LE(r.frø | 0, o + 12);
  if (++iKlump === KLUMP) tøm();
  skrevet++;
};

const iTur = (s: GameState): number | null =>
  s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;

let kamper = 0;
let runder = 0;
let ulovlige = 0;
let poengSum = 0;
let poengKvad = 0;
let poengMin = Infinity;
let poengMaks = -Infinity;
const t0 = Date.now();

for (let g = SI; g < GIVER; g += SN) {
  const frø = bånd.base + g * bånd.steg;
  const rng = lagRng((frø ^ 0x5bf03635) >>> 0);
  const huk = new Hukommelse();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: MÅL }, frø);
  /** Radene fra INNEVÆRENDE runde. Etiketten deres finnes ikke ennå. */
  let iRunde: Rad[] = [];
  let vakt = 0;

  /**
   * ETIKETTEN SETTES AV HENDELSENE, IKKE AV FASEN.
   *
   * To ting ville falt på gulvet med en fasetest. `RUNDE_SLUTT`-FASEN hoppes
   * over når kampen er vunnet — motoren går rett til `FERDIG` — så den siste
   * rundens rader ville forsvunnet. Og passer alle fire, kastes givet uten
   * poeng i det hele tatt, og `sisteRunde` står igjen med FORRIGE rundes tall.
   * En rad merket med naborundens poeng er verre enn ingen rad.
   */
  const bokfør = (delta: readonly number[] | null): void => {
    for (const r of iRunde) {
      const p = delta?.[r.sete] ?? 0;
      poengSum += p;
      poengKvad += p * p;
      if (p < poengMin) poengMin = p;
      if (p > poengMaks) poengMaks = p;
      skriv(r, p);
    }
    iRunde = [];
    runder++;
  };

  while (s.fase !== "FERDIG" && vakt++ < 20_000) {
    huk.observer(s);
    const sete = iTur(s);
    if (sete === null) {
      if (s.fase === "RUNDE_SLUTT") {
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      break;
    }

    /**
     * ETT FULLT VALG, som kan bestå av flere delsteg (vrak og trumf/etterlyst).
     * Hvert delsteg får sin egen trekkvektor, sin egen maske og sin egen rad —
     * det er nøyaktig slik nettet vil se dem under selvspill.
     */
    let delvalg: Delvalg = TOMT_DELVALG;
    const hukVektor = huk.vektor(sete, 4);
    for (let steg = 0; steg < 20; steg++) {
      const visning = spillerVisning(s, sete);
      const m = maske(visning, s.giving, delvalg);
      const trekk = byggTrekk(visning, {
        regler: s.regler,
        giving: s.giving,
        delvalg,
        hukommelse: hukVektor,
        // AV som standard: troen er et HODE nå, ikke en ekstra passering.
        tronett: null,
      });
      // Uniformt blant de lovlige: like logits gjør softmaxen uniform, og
      // valget går gjennom NØYAKTIG den funksjonen nettet vil bruke.
      const kode = velgKode(new Float32Array(m.length), m, 1, rng);
      if (m[kode] !== 1) ulovlige++;

      if (rng() < SJANSE) {
        iRunde.push({
          trekk,
          fasit: troFasit(s, sete),
          sete,
          stikk: s.stikkSpilt,
          fase: FASEKODE[s.fase] ?? -1,
          kode,
          frø,
        });
      }

      const steget = ta(visning, s.giving, delvalg, kode);
      if (steget.ferdig) {
        const r = utfør(s, { ...steget.handling, spiller: sete });
        s = r.state;
        for (const h of r.hendelser) {
          if (h.type === "RUNDE_SLUTT") bokfør(h.resultat.delta);
          else if (h.type === "ALLE_PASSET") bokfør(null);
        }
        break;
      }
      delvalg = steget.delvalg;
    }
  }
  // Et giv som stoppet på vaktgrensen etterlater rader uten etikett. De skal
  // ikke skrives med et gjettet null — de skal ikke skrives.
  iRunde = [];
  kamper++;
  if (g % 20 === SI % 20) {
    const sek = (Date.now() - t0) / 1000;
    process.stdout.write(
      `  skard ${SI}: ${kamper} kamper, ${skrevet} rader, ` +
        `${(skrevet / Math.max(1, sek)).toFixed(0)}/s\r`,
    );
  }
}

tøm();
closeSync(fd);
const snitt = poengSum / Math.max(1, skrevet);
const sd = Math.sqrt(Math.max(0, poengKvad / Math.max(1, skrevet) - snitt * snitt));
console.log(
  `\nSkard ${SI}: ${kamper} kamper, ${runder} runder, ${skrevet} rader ` +
    `(${TREKK_LENGDE} trekk) -> ${UT}\n` +
    `  rundepoeng: snitt ${snitt.toFixed(3)}, SD ${sd.toFixed(3)}, ` +
    `spenn [${poengMin}, ${poengMaks}]\n` +
    `  ULOVLIGE VALG: ${ulovlige} (skal være 0 — velgKode er den harde skranken)`,
);
if (ulovlige > 0) process.exitCode = 1;
