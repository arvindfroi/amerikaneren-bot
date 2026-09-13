/**
 * KOSTNADEN PER RUNDE, DELT PÅ STIKK — hva koster søket, og hvor? (14. sep)
 *
 *   node examples/sokfokus-kostnad.ts --merke A --spek "<spek>" --runder 2
 *
 * Søsteren til eierens `examples/tidsprofil.ts` (som er en UCOMMITTET fil i en annen
 * arbeidskopi, se 	d31df7a — derfor et eget navn her i stedet for en kollisjon).
 * Forskjellen som betyr noe: bøttene her er **1-BASERTE PER STIKK**, samme akse som
 * `~stikk=<fra>-<til>` og samme akse som radene i `D:\amb-grp\loop\dekomp.md`. Da kan
 * kostnaden for et vindu leses rett av mot bidraget vinduet dekker, uten omregning.
 *
 * SPØRSMÅLET VERKTØYET SVARER PÅ: `~stikk=1-4` frigjør tiden søket i dag bruker i stikk
 * 5–12 (der dekomponeringen måler +0,06 og +0,00 pp). Hvor mye er det, og hvor mange
 * flere verdener kan stikk 1–4 få for den samme totale kostnaden per runde?
 *
 * BORDET ER APPENS BORD: tre botseter med `--spek`, ett sete med en billig motpart. Bare
 * botsetene telles, og hver agent får sin EGEN instans — `okt:` lager én økt per agent, og
 * `observer` kalles på hver virkelige tilstand (også RUNDE_SLUTT) slik `kort-data.ts` gjør.
 * Uten det ville `M` og trohodets bok stått tomme, og profilen målt en billigere bot enn
 * den vi vurderer å måle.
 *
 * Vektstiene kommer fra `ADAMS_MAALT` og ikke fra tastaturet: `test/spek-en-kilde.test.ts`
 * (SKRALLE) krever at nye filer importerer speken i stedet for å skrive vektnavnene.
 *
 * Resultatet skrives til FIL fra prosessen selv, ikke bare til stdout: en flertimers
 * måling som bare finnes i et rør er tapt om røret ryker.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { ADAMS_MAALT, lagIndre } from "../src/moe2/agentspek.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};

const MERKE = arg("--merke", "uten-navn");
const SPEK = arg("--spek", ADAMS_MAALT);
/** Billig og SØKFRI motpart: `ADAMS_MAALT` har ingen søkelag, så den er begge deler. */
const MOTPART = arg("--motpart", ADAMS_MAALT);
const RUNDER = Number(arg("--runder", "2"));
const FRØ = Number(arg("--froe", "1250000000"));
const UT = arg("--ut", "D:/amb-grp/loop/sokfokus-kostnad.jsonl");

/** Runder per løp til 100, målt av agent S over 200 løp. Brukes bare til framskrivingen. */
const RUNDER_PER_LOP = 26.6;
const STIKK_I_RUNDEN = 12;

type Bøtte = { ms: number; n: number };
const nyBøtte = (): Bøtte => ({ ms: 0, n: 0 });

const bøtter = new Map<string, Bøtte>();
const før = (navn: string, ms: number): void => {
  let b = bøtter.get(navn);
  if (b === undefined) {
    b = nyBøtte();
    bøtter.set(navn, b);
  }
  b.ms += ms;
  b.n += 1;
};
// Fast rekkefølge, så to kjøringer kan legges ved siden av hverandre.
for (const k of ["alt", "BUD", "VRAK", "VELG", "SPILL"]) bøtter.set(k, nyBøtte());
for (let i = 1; i <= STIKK_I_RUNDEN; i++) bøtter.set(`stikk${String(i).padStart(2, "0")}`, nyBøtte());
for (const k of ["vindu1-4", "vindu5-8", "vindu9-12", "SPILL/foerer", "SPILL/annen"]) bøtter.set(k, nyBøtte());

const t0 = Date.now();
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
  // 1-BASERT: `stikkSpilt` er antall FULLFØRTE stikk, så stikket som spilles nå er +1.
  const stikkNå = s.stikkSpilt + 1;

  const t = performance.now();
  const h = seter[sete]!.velgHandling(s);
  const ms = performance.now() - t;

  if (erBot[sete] === true) {
    før("alt", ms);
    før(fase, ms);
    if (fase === "SPILL") {
      før(erFører ? "SPILL/foerer" : "SPILL/annen", ms);
      if (stikkNå >= 1 && stikkNå <= STIKK_I_RUNDEN) før(`stikk${String(stikkNå).padStart(2, "0")}`, ms);
      før(stikkNå <= 4 ? "vindu1-4" : stikkNå <= 8 ? "vindu5-8" : "vindu9-12", ms);
    }
  }
  s = utfør(s, h).state;

  // Skriv underveis: en avbrutt kjøring skal ikke være bortkastet.
  const sp = bøtter.get("SPILL")!;
  if (s.rundeNr !== rundeSkrevet && sp.n > 0) {
    rundeSkrevet = s.rundeNr;
    process.stdout.write(
      `\r  ${MERKE}: runde ${s.rundeNr}/${RUNDER}, ${sp.n} kortvalg, ` +
        `${(sp.ms / sp.n).toFixed(0)} ms/kortvalg, ${((Date.now() - t1) / 1000).toFixed(0)} s   `,
    );
  }
}
if (sist !== s) for (const a of seter) a.observer?.(s);

const msTotalt = Date.now() - t1;
const runder = Math.max(1, s.rundeNr);
const spill = bøtter.get("SPILL")!;
const alt = bøtter.get("alt")!;
const msPerKortvalg = spill.n > 0 ? spill.ms / spill.n : 0;
/** DET SENTRALE TALLET: botsetenes arbeid per runde. Armene rangeres på dette. */
const msBotPerRunde = alt.ms / runder;
const sekPerLop = (msBotPerRunde * RUNDER_PER_LOP) / 1000;

const rad = {
  merke: MERKE,
  spek: SPEK,
  runder,
  msBygg,
  msTotalt,
  kortvalg: spill.n,
  kortvalgPerRunde: Number((spill.n / runder).toFixed(1)),
  msPerKortvalg: Number(msPerKortvalg.toFixed(1)),
  msBotPerRunde: Number(msBotPerRunde.toFixed(0)),
  sekPerLop: Number(sekPerLop.toFixed(1)),
  bøtter: Object.fromEntries(
    [...bøtter].map(([k, b]) => [
      k,
      { n: b.n, ms: Math.round(b.ms), snitt: b.n > 0 ? Number((b.ms / b.n).toFixed(1)) : null },
    ]),
  ),
};
mkdirSync(dirname(UT), { recursive: true });
appendFileSync(UT, JSON.stringify(rad) + "\n");

console.log(
  `\n${MERKE}: ${spill.n} kortvalg i ${runder} runder | ${msPerKortvalg.toFixed(0)} ms per kortvalg | ` +
    `${(msBotPerRunde / 1000).toFixed(1)} s botarbeid per runde | FRAMSKREVET ${sekPerLop.toFixed(0)} s per løp til 100`,
);
for (const [k, b] of bøtter) {
  if (b.n > 0) {
    console.log(
      `  ${k.padEnd(14)} n=${String(b.n).padStart(4)}  snitt ${(b.ms / b.n).toFixed(1)} ms  ` +
        `sum ${(b.ms / 1000).toFixed(1)} s  (${((100 * b.ms) / Math.max(1, alt.ms)).toFixed(1)} % av botarbeidet)`,
    );
  }
}
