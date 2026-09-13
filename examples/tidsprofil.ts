/**
 * TIDSPROFIL PER BESLUTNING — hvor går tiden i en spek? (13. sep, midlertidig verktøy)
 *
 *   node examples/tidsprofil.ts --merke helbot --spek "<spek>" --runder 2 --ut D:/amb-grp/loop/tidsprofil.jsonl
 *
 * Målet er ETT tall som kan sammenlignes med appens 107 s per løp: veggtid per KORTVALG
 * i botsetene, delt på fase, på rolle (fører / ikke fører) og på stikkbånd (0–3 / 4–6 / 7+).
 * Rolle- og stikkoppdelingen er der fordi det er nøyaktig der knottene sitter: `sik:foerer`
 * mot `sik:alle`, og `eks:`/`~lik=f7` som bare slår til sent.
 *
 * BORDET ER APPENS BORD: tre botseter med `--spek`, ett sete med en billig motpart
 * (mennesket/klonen). Bare botsetene telles. Da er «ms per kortvalg × 36 × 26,6 runder»
 * direkte sammenlignbart med de 107 sekundene prod-boten bruker på et løp til 100.
 *
 * Hver agent får sin EGEN instans, som i de andre driverne: `okt:` lager én økt per agent,
 * og `observer` kalles på hver virkelige tilstand (også RUNDE_SLUTT) slik `kort-data.ts` gjør.
 * Uten det ville `M` (motstandermodellen fra økten) og trohodets bok stått tomme, og
 * profilen ville målt en billigere bot enn den vi vurderer å rulle ut.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState } from "../src/motor.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};

const MERKE = arg("--merke", "uten-navn");
const SPEK = arg("--spek", "vakt:abmp:e1:e1-modell/d7alle.bin");
const MOTPART = arg("--motpart", "vakt:abmp:e1:e1-modell/d7alle.bin");
const RUNDER = Number(arg("--runder", "2"));
const FRØ = Number(arg("--froe", "1250000000"));
const UT = arg("--ut", "D:/amb-grp/loop/tidsprofil.jsonl");

/** Runder per løp til 100, målt av agent S over 200 løp. Brukes bare til framskrivingen. */
const RUNDER_PER_LOP = 26.6;

type Bøtte = { ms: number; n: number };
const nyBøtte = (): Bøtte => ({ ms: 0, n: 0 });
const bøtter: Record<string, Bøtte> = {
  alt: nyBøtte(),
  BUD: nyBøtte(),
  VRAK: nyBøtte(),
  VELG: nyBøtte(),
  SPILL: nyBøtte(),
  "SPILL/foerer": nyBøtte(),
  "SPILL/annen": nyBøtte(),
  "SPILL/stikk0-3": nyBøtte(),
  "SPILL/stikk4-6": nyBøtte(),
  "SPILL/stikk7+": nyBøtte(),
};
const før = (navn: string, ms: number): void => {
  const b = bøtter[navn];
  if (b !== undefined) {
    b.ms += ms;
    b.n += 1;
  }
};

const t0 = Date.now();
// Tre botseter (0,1,2) med speken, sete 3 er den billige motparten. Hver sin instans.
const seter = [lagIndre(SPEK), lagIndre(SPEK), lagIndre(SPEK), lagIndre(MOTPART)];
const erBot = [true, true, true, false];
const msBygg = Date.now() - t0;

const t1 = Date.now();
let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, FRØ);
for (const a of seter) a.nyKamp();
let sist: GameState | null = null;
let vakt = 0;
let rundeSkrevet = -1;

while (s.fase !== "FERDIG" && s.rundeNr < RUNDER && vakt++ < 40_000) {
  for (const a of seter) a.observer?.(s);
  sist = s;
  if (s.fase === "RUNDE_SLUTT") {
    s = utfør(s, { type: "NESTE" }).state;
    continue;
  }
  const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
  if (sete === null || sete === undefined) break;

  const fase = s.fase;
  const erFører = sete === s.budvinner;
  const stikk = s.stikkSpilt;

  const t = performance.now();
  const h = seter[sete]!.velgHandling(s);
  const ms = performance.now() - t;

  if (erBot[sete] === true) {
    før("alt", ms);
    før(fase, ms);
    if (fase === "SPILL") {
      før(erFører ? "SPILL/foerer" : "SPILL/annen", ms);
      før(stikk <= 3 ? "SPILL/stikk0-3" : stikk <= 6 ? "SPILL/stikk4-6" : "SPILL/stikk7+", ms);
    }
  }
  s = utfør(s, h).state;

  // Skriv underveis: en avbrutt kjøring skal ikke være bortkastet.
  if (s.rundeNr !== rundeSkrevet && bøtter.SPILL!.n > 0) {
    rundeSkrevet = s.rundeNr;
    process.stdout.write(
      `\r  ${MERKE}: runde ${s.rundeNr}/${RUNDER}, ${bøtter.SPILL!.n} kortvalg, ` +
        `${(bøtter.SPILL!.ms / bøtter.SPILL!.n).toFixed(0)} ms/kortvalg, ${((Date.now() - t1) / 1000).toFixed(0)} s   `,
    );
  }
}
if (sist !== s) for (const a of seter) a.observer?.(s);

const msTotalt = Date.now() - t1;
const runder = Math.max(1, s.rundeNr);
const kortvalg = bøtter.SPILL!.n;
const msPerKortvalg = kortvalg > 0 ? bøtter.SPILL!.ms / kortvalg : 0;
const kortvalgPerRunde = kortvalg / runder;
// Framskrivingen: botsetenes ARBEID per runde × runder per løp. Motpartens tid er ikke med,
// og det er riktig: i appen er det menneskets betenkningstid.
const msBotPerRunde = bøtter.alt!.ms / runder;
const sekPerLop = (msBotPerRunde * RUNDER_PER_LOP) / 1000;

const rad = {
  merke: MERKE,
  spek: SPEK,
  runder,
  msBygg,
  msTotalt,
  kortvalg,
  kortvalgPerRunde: Number(kortvalgPerRunde.toFixed(1)),
  msPerKortvalg: Number(msPerKortvalg.toFixed(1)),
  msBotPerRunde: Number(msBotPerRunde.toFixed(0)),
  sekPerLop: Number(sekPerLop.toFixed(1)),
  bøtter: Object.fromEntries(
    Object.entries(bøtter).map(([k, b]) => [k, { n: b.n, ms: Math.round(b.ms), snitt: b.n > 0 ? Number((b.ms / b.n).toFixed(1)) : null }]),
  ),
};
mkdirSync(dirname(UT), { recursive: true });
appendFileSync(UT, JSON.stringify(rad) + "\n");

console.log(
  `\n${MERKE}: ${kortvalg} kortvalg i ${runder} runder | ${msPerKortvalg.toFixed(0)} ms per kortvalg | ` +
    `${(msBotPerRunde / 1000).toFixed(1)} s botarbeid per runde | FRAMSKREVET ${sekPerLop.toFixed(0)} s per løp til 100`,
);
for (const [k, b] of Object.entries(bøtter)) {
  if (b.n > 0) console.log(`  ${k.padEnd(16)} n=${String(b.n).padStart(4)}  snitt ${(b.ms / b.n).toFixed(1)} ms  sum ${(b.ms / 1000).toFixed(1)} s`);
}
