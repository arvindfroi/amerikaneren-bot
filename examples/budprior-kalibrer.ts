/**
 * K4, BUDKANALEN: HENGER BUDLYST SAMMEN MED Å KLARE KONTRAKTEN?
 *
 *   node examples/budprior-kalibrer.ts --giver 400 --ut analyse/budprior.txt
 *
 * ARVIND: «ha hukommelse over hele spill … lære seg andre spillere sine vaner
 * ila spillet og tilpasse seg og utnytte de.»
 *
 * K4-prøven målte at hukommelsen **ikke påvirker budgivningen i det hele
 * tatt**: 0 av 87 bud endret seg. Justeringen ber om maks 0,649 budpoeng (etter
 * at tellerne ble rettet), og det trengs 1,0 for å snu ett eneste valg.
 *
 * ================= HVORFOR DEN ER SVAK, MÅLT ============================
 *
 * `evForsvarMot` bruker ÉN kilde: `krymp(p.klarte, BEFOLKNING.klarte)`. Og
 * `klarte` observeres bare når setet VANT budrunden:
 *
 *     runde  3   bydde.n= 4   klarte.n=0   tiltro = 0,000
 *     runde  7   bydde.n= 8   klarte.n=1   tiltro = 0,077
 *     runde 15   bydde.n=16   klarte.n=3   tiltro = 0,200
 *
 * Etter en HEL kamp er anslaget fortsatt 80 % krympet mot befolkningen.
 *
 * **Men krympingen er ærlig her**, til forskjell fra `bud.n` og
 * `trumfutspill.n`: `klarte.n` ER riktig utvalgsstørrelse for «klarer hun
 * kontraktene sine». Man kan ikke observere det uten at hun vinner en.
 *
 * ================= DEN RIKTIGE BEVEGELSEN ==============================
 *
 * Ikke en større multiplikator — MER BEVIS. `bydde` observeres HVER runde
 * (16 mot 3 etter 15 runder), og hvis budlyst henger sammen med å ryke, kan
 * det tette signalet informere prioren for det sparsomme:
 *
 *     forventetKlarte(bydde)  =  BEFOLKNING.klarte + β·(bydderate − snitt)
 *
 * Det er den vanlige bayesianske bevegelsen: bruk det du ser ofte til å sette
 * forventningen for det du sjelden ser.
 *
 * **β SKAL MÅLES.** Denne fila måler den. Er den ikke skilt fra null, finnes
 * ikke sammenhengen, og da skal ingen legge den inn — å sette en koeffisient
 * fordi den er plausibel er nøyaktig det §84 kritiserte.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lagIndre, ADAMS_MAALT, tall } from "../src/moe2/agentspek.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const GIVER = tall(arg("--giver", "300"), 300, "giver");
const UT = arg("--ut", "analyse/budprior.txt");
const SPEK = arg("--spek", ADAMS_MAALT);

/** Én observasjon per (kamp, sete): hvor ofte bød de, hvor ofte klarte de. */
interface Sete {
  runder: number;
  bydde: number;
  vant: number;
  klarte: number;
}

const seter: Sete[] = [];

for (let g = 0; g < GIVER; g++) {
  const frø = 33_000_000 + g * 5849;
  const ag = [0, 1, 2, 3].map(() => lagIndre(SPEK));
  for (const a of ag) a.nyKamp();
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  const st: Sete[] = [0, 1, 2, 3].map(() => ({ runder: 0, bydde: 0, vant: 0, klarte: 0 }));

  while (s.fase !== "FERDIG" && vakt++ < 20_000 && s.rundeNr < 12) {
    if (s.fase === "RUNDE_SLUTT") {
      const bv = s.budvinner;
      for (let p = 0; p < 4; p++) {
        const rad = st[p]!;
        rad.runder++;
        const b = s.budrunde.sisteBud[p];
        if (typeof b === "number") rad.bydde++;
        if (p === bv && typeof b === "number") {
          rad.vant++;
          const mk = s.makker;
          const lag =
            (s.stikkVunnet[p] ?? 0) + (mk !== null && mk !== p ? (s.stikkVunnet[mk] ?? 0) : 0);
          if (lag >= b) rad.klarte++;
        }
      }
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, ag[iTur]!.velgHandling(s)).state;
  }
  // BARE SETER MED NOK Å MÅLE PÅ. Uten vunne budrunder finnes ingen
  // klarterate, og et par (x, NaN) ville forurenset regresjonen.
  for (const rad of st) if (rad.runder >= 8 && rad.vant >= 2) seter.push(rad);
  process.stdout.write(`\r  ${g + 1}/${GIVER} kamper, ${seter.length} seter   `);
}

if (seter.length < 20) {
  throw new Error(`bare ${seter.length} seter med nok data - kjoer flere giv`);
}

const x = seter.map((r) => r.bydde / r.runder);
const y = seter.map((r) => r.klarte / r.vant);
const n = x.length;
const mx = x.reduce((a, b) => a + b, 0) / n;
const my = y.reduce((a, b) => a + b, 0) / n;
let sxy = 0;
let sxx = 0;
for (let i = 0; i < n; i++) {
  sxy += (x[i]! - mx) * (y[i]! - my);
  sxx += (x[i]! - mx) * (x[i]! - mx);
}
const beta = sxx > 0 ? sxy / sxx : 0;
// SE paa hellingen, saa «ikke skilt fra null» kan avgjoeres og ikke antas.
let sr = 0;
for (let i = 0; i < n; i++) {
  const f = my + beta * (x[i]! - mx);
  sr += (y[i]! - f) * (y[i]! - f);
}
const s2 = n > 2 ? sr / (n - 2) : 0;
const seBeta = sxx > 0 ? Math.sqrt(s2 / sxx) : Infinity;
const z = seBeta > 0 ? beta / seBeta : 0;

const L: string[] = [];
L.push(`# HENGER BUDLYST SAMMEN MED AA KLARE KONTRAKTEN?  (${GIVER} kamper)`);
L.push("");
L.push(`seter med nok data:      ${n}`);
L.push(`snitt budandel:          ${mx.toFixed(4)}`);
L.push(`snitt klarterate:        ${my.toFixed(4)}`);
L.push("");
L.push(`HELLING beta:            ${beta.toFixed(4)} ± ${seBeta.toFixed(4)}   (z = ${z.toFixed(2)})`);
L.push("");
if (Math.abs(z) < 2) {
  L.push("IKKE SKILT FRA NULL. Sammenhengen finnes ikke i disse dataene, og da");
  L.push("skal ingen koeffisient legges inn. Aa sette en fordi den er plausibel");
  L.push("er noeyaktig det §84 kritiserte - og §65s auksjonskorreksjon er");
  L.push("advarselen: den saa ekte ut og replikerte ikke (z = 0,71 og 0,54).");
} else if (beta < 0) {
  L.push("NEGATIV OG SIGNIFIKANT: de som byr ofte, ryker oftere. Da kan `bydde`");
  L.push("- som observeres HVER runde - informere prioren for `klarte`, som");
  L.push("bare observeres naar setet vinner budrunden (3 mot 16 etter 15 runder).");
  L.push("");
  L.push("Det er mer BEVIS, ikke en stoerre multiplikator. Forskjellen er at det");
  L.push("foerste kan maales og det andre bare kan settes.");
} else {
  L.push("POSITIV: de som byr ofte klarer det OFTERE. Uventet, og verdt aa");
  L.push("replikere i et disjunkt froebaand foer noe bygges paa det.");
}
L.push("");
L.push("REPLIKERING KREVES UANSETT FORTEGN. Ett baand er ikke et funn her -");
L.push("auksjonskorreksjonen (§65) hadde z = 0,71 i ett og 0,54 i det neste.");

const tekst = L.join("\n");
mkdirSync(dirname(UT), { recursive: true });
writeFileSync(UT, tekst + "\n");
console.log("\n" + tekst);
