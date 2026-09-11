/**
 * MLB FASE 0a — DATASETTET FOR TROHODET.
 *
 *   node examples/mlb-trodata.ts --giver 20000 --skard 0/20 --band trening \
 *     --ut mlb-tro-data/trening-0.bin
 *
 * For hver spillestilling: TREKKENE fra `spillerVisning(state, sete)` — aldri
 * fra `state` — og ETIKETTEN «hvilket sete holdt hvert usett kort», med en
 * FJERDE klasse for talongen.
 *
 * ===================== FASIT OM FORTIDEN, IKKE EN DOM ===================
 *
 * `docs/mlb.md` §0: «hvor kortene faktisk lå, kjent ved rundeslutt» står
 * uttrykkelig på lista over det som IKKE er et orakel. Ingen SD-evaluering,
 * ingen dobbeltdummy, ingen `d7alle`-etikett. Vi skriver bare ned hvor kortene
 * lå, og det vet vi fordi vi delte dem ut.
 *
 * ===================== DEN FJERDE KLASSEN ===============================
 *
 *   0   sett (egen hånd, alt spilt, eget vrak) — MASKERT BORT, ikke gjetning
 *   1–3 relativt sete
 *   4   TALONGEN (budvinnerens fire vrakede kort)
 *
 * Uten klasse 4 måtte modellen fordele talongens kort over tre hender som ikke
 * har dem. §117s forgjenger gjorde nettopp det ved å sammenlikne en marginal
 * fordeling mot et betinget gulv, og «viste» at Adams var verre enn uniform.
 * Det var målingen som var gal, ikke troen.
 *
 * BUDVINNEREN SER SITT EGET VRAK. For henne er de fire kortene ikke gjetning,
 * de får klasse 0, og talongklassen er umulig. `troTrekk` koder den
 * asymmetrien eksplisitt (`VRAK_KJENT`), slik at nettet slipper å gjette den.
 *
 * ===================== FRØBÅNDENE, AVSATT FØR FØRSTE RAD ================
 *
 * `docs/mlb.md` §5: «holdout-frøbånd avsatt før første kamp». Tre disjunkte
 * bånd, låst i koden her og aldri overlappende:
 *
 *   trening   41 000 000 + g·7717,  g < 100 000   → 41,0 M … 812,7 M
 *   holdout   1 100 000 000 + g·7717, g < 20 000  → 1,100 G … 1,254 G
 *   K8-prøven 12 000 000 + g·6151                 → `examples/tro-noyaktighet.ts`
 *
 * K8-båndet er `tro-noyaktighet.ts` sitt eget og ligger UNDER treningsbåndets
 * start. Nettet ser altså aldri en eneste giv fra prøven det skal dømmes på.
 *
 * ===================== FORMATET ========================================
 *
 * Rått binært, ikke JSONL. En rad er 660 flyttall; som JSON blir det ~6 kB og
 * en parsetid som dominerer treningen. Her: «MLBT», versjon, dim — og så faste
 * poster som numpy leser med én `fromfile`.
 */

import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { spillerVisning } from "../src/motor.ts";
import { lagIndre, ADAMS_MAALT } from "../src/moe2/agentspek.ts";
import { troFasit } from "../src/mlb/fasit.ts";
import { MLB_TRO_INN, MLB_TRO_INN_S, troTrekkForBredde } from "../src/mlb/trotrekk.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const tall = (s: string, f: number): number => (Number.isFinite(Number(s)) ? Number(s) : f);

/** Båndene. Endres de, blir alle tidligere datasett uforenlige — derfor låst her. */
export const BÅND: Record<string, { base: number; steg: number }> = {
  trening: { base: 41_000_000, steg: 7717 },
  holdout: { base: 1_100_000_000, steg: 7717 },
};

const BAND = arg("--band", "trening");
const bånd = BÅND[BAND];
if (bånd === undefined) throw new Error(`Ukjent bånd «${BAND}» (trening|holdout)`);
const GIVER = tall(arg("--giver", "2000"), 2000);
/** Første giv-nummer. Finnes for å UTVIDE et datasett uten å lage det om igjen. */
const FRA = tall(arg("--fra", "0"), 0);
if (BAND === "trening" && GIVER > 100_000) throw new Error("treningsbåndet er avsatt til 100 000 giv");
if (BAND === "holdout" && GIVER > 20_000) throw new Error("holdout-båndet er avsatt til 20 000 giv");
/** Andel spillestillinger som skrives. 1 gir sterkt korrelerte naborader. */
const SJANSE = tall(arg("--sjanse", "0.5"), 0.5);
const SPEK = arg("--spek", ADAMS_MAALT);
const UT = arg("--ut", `mlb-tro-data/${BAND}-0.bin`);
const [SI, SN] = (arg("--skard", "0/1").split("/") as [string, string]).map(Number) as [number, number];
/**
 * `--signal` (11. sep, K8 kanal 5 og 2): signalblokken bakerst, 660 → 776 trekk. Uten
 * flagget er radene byte-identiske med før. Frøbåndene og utvalget er de samme, så et
 * 776-korpus inneholder nøyaktig de samme stillingene som 660-korpuset.
 */
const SIGNAL = process.argv.includes("--signal");
const DIM = SIGNAL ? MLB_TRO_INN_S : MLB_TRO_INN;

mkdirSync(dirname(UT), { recursive: true });
const fd = openSync(UT, "w");
{
  const hode = Buffer.alloc(12);
  hode.write("MLBT", 0, "ascii");
  hode.writeInt32LE(1, 4);
  hode.writeInt32LE(DIM, 8);
  writeSync(fd, hode);
}
const POST = DIM * 4 + 52 + 4 + 2 + 2;
/** Skriv i klumper: én `writeSync` per rad ga 3× lengre kjøretid enn spillingen. */
const KLUMP = 512;
const buf = Buffer.alloc(POST * KLUMP);
let iKlump = 0;
const tøm = (): void => {
  if (iKlump > 0) writeSync(fd, buf, 0, POST * iKlump);
  iKlump = 0;
};

type Agent = { velgHandling(s: GameState): Handling; nyKamp(): void };
const agenter: Agent[] = [0, 1, 2, 3].map(() => lagIndre(SPEK));

let rng = 8_675_309 + SI * 7919;
const tilfeldig = (): number => {
  rng = (rng * 1103515245 + 12345) & 0x7fffffff;
  return rng / 0x7fffffff;
};

let skrevet = 0;
const t0 = Date.now();
for (let g = FRA + SI; g < GIVER; g += SN) {
  const frø = bånd.base + g * bånd.steg;
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  for (const a of agenter) a.nyKamp();
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
    if (s.fase === "SPILL" && s.iTur !== null && tilfeldig() < SJANSE) {
      const sete = s.iTur;
      const f = troFasit(s, sete);
      // Ingen ukjente igjen betyr ingenting å lære av.
      let noe = false;
      for (let i = 0; i < 52; i++) if (f[i]! > 0) noe = true;
      if (noe) {
        const t = troTrekkForBredde(DIM, spillerVisning(s, sete), s.giving.antallStikk, s.regler.målPoeng, null);
        let o = iKlump * POST;
        for (let i = 0; i < DIM; i++) {
          buf.writeFloatLE(t[i]!, o);
          o += 4;
        }
        for (let i = 0; i < 52; i++) buf.writeInt8(f[i]!, o + i);
        o += 52;
        buf.writeInt32LE(frø | 0, o);
        buf.writeInt16LE(s.stikkSpilt, o + 4);
        buf.writeInt16LE(sete, o + 6);
        if (++iKlump === KLUMP) tøm();
        skrevet++;
      }
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, agenter[iTur]!.velgHandling(s)).state;
  }
  if (g % 200 === SI % 200) {
    const sek = (Date.now() - t0) / 1000;
    process.stdout.write(`  skard ${SI}: ${skrevet} rader, ${(skrevet / Math.max(1, sek)).toFixed(0)}/s\r`);
  }
}
tøm();
closeSync(fd);
console.log(`\nSkard ${SI} ferdig: ${skrevet} rader (${DIM} trekk${SIGNAL ? ", med signalblokk" : ""}) -> ${UT}`);
