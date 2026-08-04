/**
 * ADAMS TOP-DOWN: hvem tar hvilken beslutning, og hvor ofte endrer laget noe?
 *
 *   node examples/adams-revisjon.ts 35000000 800 analyse/adams-revisjon.json
 *
 * Adams er `budm:bud-gbt.json : vakt:abmp : e1:<vekter>`, og hver runde har
 * FIRE beslutningstyper:
 *
 *   BUDRUNDE   Budagent (bud-gbt.json)
 *   VRAK       videresendt til NevroHjerne
 *   VELG       videresendt til NevroHjerne (trumf + etterlyst kort)
 *   SPILL      E1-nettet, pakket i Konvensjonsvakt
 *
 * TO AV FIRE TAS ALTSÅ AV DEN ELDSTE KOMPONENTEN i sammensetningen, i BEGGE
 * armer av hver måling prosjektet har gjort — så en forskjell mellom armene
 * kan aldri komme derfra, og hullet er aldri blitt målt.
 *
 * DENNE REVISJONEN TELLER, den vurderer ikke. For hvert lag: hvor mange
 * beslutninger det får, og i hvor mange av dem det ENDRER valget til laget
 * under. Et lag som aldri endrer noe er død vekt uansett hva en gate måler;
 * et lag som endrer ofte og likevel måler null, endrer feil ting.
 *
 * Det er den billigste helsesjekken som finnes på en sammensatt bot, og den
 * er aldri kjørt.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { lovligeKort, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { Budagent, lesBudmodell } from "../src/moe2/budagent.ts";
import type { Kort } from "../src/kort.ts";

const FRØ0 = Number(process.argv[2] ?? 35_000_000);
const RUNDER = Number(process.argv[3] ?? 800);
const UT = process.argv[4] ?? "analyse/adams-revisjon.json";
const NETT = process.argv[5] ?? "e1-modell/d7alle.bin";

const nevro = new NevroAgent();
const e1 = E1Agent.fraFil(NETT);
const vakt = new Konvensjonsvakt(E1Agent.fraFil(NETT), delVaktspek("vakt:abmp:x")!.valg);
const adams = new Budagent(
  new Konvensjonsvakt(E1Agent.fraFil(NETT), delVaktspek("vakt:abmp:x")!.valg),
  lesBudmodell("e1-modell/bud-gbt.json"),
);

const lik = (a: Handling, b: Handling): boolean => {
  if (a.type !== b.type) return false;
  if (a.type === "SPILL" && b.type === "SPILL") {
    return a.kort.farge === b.kort.farge && a.kort.verdi === b.kort.verdi;
  }
  if (a.type === "BUD" && b.type === "BUD") return a.bud === b.bud;
  if (a.type === "VELG" && b.type === "VELG") return a.trumf === b.trumf;
  if (a.type === "VRAK" && b.type === "VRAK") {
    const n = (k: readonly Kort[]): string => k.map((x) => `${x.farge}${x.verdi}`).sort().join(",");
    return n(a.kort) === n(b.kort);
  }
  return true;
};

const t = {
  bud: { n: 0, endret: 0 },
  vrak: { n: 0, fraNevro: 0 },
  velg: { n: 0, fraNevro: 0 },
  spill: { n: 0, medValg: 0, vaktEndret: 0, nettMotNevro: 0 },
};

for (let i = 0; i < RUNDER; i++) {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, FRØ0 + i * 3547);
  for (const a of [adams, nevro, e1, vakt]) a.nyKamp();
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 600) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;

    const hAdams = adams.velgHandling(s);

    if (s.fase === "BUDRUNDE") {
      t.bud.n++;
      if (!lik(hAdams, nevro.velgHandling(s))) t.bud.endret++;
    } else if (s.fase === "VRAK") {
      t.vrak.n++;
      // VRAK gaar til NevroHjerne gjennom hele stigen. Er de ALLTID like, er
      // det bekreftet at ingen av lagene roerer beslutningen.
      if (lik(hAdams, nevro.velgHandling(s))) t.vrak.fraNevro++;
    } else if (s.fase === "VELG") {
      t.velg.n++;
      if (lik(hAdams, nevro.velgHandling(s))) t.velg.fraNevro++;
    } else if (s.fase === "SPILL" && s.iTur !== null) {
      t.spill.n++;
      if (lovligeKort(s, s.iTur).length >= 2) {
        t.spill.medValg++;
        // VAKTEN: endrer den nettets valg?
        if (!lik(hAdams, e1.velgHandling(s))) t.spill.vaktEndret++;
        // NETTET mot NevroHjerne: hvor ofte er de i det hele tatt uenige?
        if (!lik(e1.velgHandling(s), nevro.velgHandling(s))) t.spill.nettMotNevro++;
      }
    }
    s = utfør(s, hAdams).state;
  }
}

const pst = (a: number, b: number): string => (b > 0 ? `${((100 * a) / b).toFixed(1)} %` : "—");
const rapport = { nett: NETT, runder: RUNDER, ...t };
mkdirSync(dirname(UT), { recursive: true });
writeFileSync(UT, JSON.stringify(rapport, null, 2), "utf-8");

console.log(`ADAMS-REVISJON — ${RUNDER} runder, nett ${NETT}\n`);
console.log(`BUDRUNDE   ${t.bud.n} beslutninger`);
console.log(`  budmodellen endret nevros valg i ${t.bud.endret} (${pst(t.bud.endret, t.bud.n)})`);
console.log(`\nVRAK       ${t.vrak.n} beslutninger`);
console.log(`  identisk med NevroHjerne i ${t.vrak.fraNevro} (${pst(t.vrak.fraNevro, t.vrak.n)})`);
console.log(`\nVELG       ${t.velg.n} beslutninger`);
console.log(`  identisk med NevroHjerne i ${t.velg.fraNevro} (${pst(t.velg.fraNevro, t.velg.n)})`);
console.log(`\nSPILL      ${t.spill.n} beslutninger, ${t.spill.medValg} med reelt valg`);
console.log(`  VAKTEN endret nettets kort i ${t.spill.vaktEndret} (${pst(t.spill.vaktEndret, t.spill.medValg)})`);
console.log(`  nettet uenig med NevroHjerne i ${t.spill.nettMotNevro} (${pst(t.spill.nettMotNevro, t.spill.medValg)})`);
console.log(`\nSkrevet til ${UT}`);
