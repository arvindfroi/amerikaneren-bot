/**
 * DØMMER MENNESKEKLONEN — treffer den menneskets valg bedre enn botene gjør? (12. sep)
 *
 *   node examples/menneske-klondom.ts --band holdout \
 *     --agenter "klon=menn:e1-modell/menneske-bud.bin@…|adams=<ADAMS>|v5=<V5_KJEDE>"
 *     [--data D:/amb-grp/menneske/hendelser.jsonl] [--skard 0/1] [--ut analyse/klon/dom.jsonl]
 *
 * ===================== HVA SOM MÅLES, OG HVORFOR ========================
 *
 * En klone er bare verdt noe hvis den ER mennesket i den forstand som betyr noe for et race:
 * at den VELGER som ham. Målet er derfor topp-1-enighet med menneskets faktiske handling, per
 * beslutningstype, på KAMPER KLONEN ALDRI SÅ (`--band holdout`, hver fjerde kamp, avsatt på
 * kamp-id før første rad i `menneske-logg.ts`).
 *
 * GRUNNLINJENE ER DE EKSISTERENDE BOTENE. Spørsmålet er ikke «treffer klonen ofte», men
 * «treffer den OFTERE ENN BOTEN». NevroHjerne er allerede enig med et menneske i mer enn to av
 * tre kortvalg (`mesterklone.ts` målte 68,5 % mot MesterAI) — en klone som lander under det, er
 * en dårligere menneskemodell enn den boten vi allerede har, og da skal racetallet ikke brukes.
 * Det er den ærlige nullhypotesen, og den skal kunne vinne.
 *
 * ===================== STILLINGENE ER MENNESKETS EGNE ====================
 *
 * Hver runde gjenskapes av `menneske-logg.ts` — samme kontrollerte gjenskaping som K1 og K8
 * bruker — og agentene spørres i NØYAKTIG de tilstandene mennesket sto i. Ingen agent får
 * spille videre på sitt eget valg; sporet følger alltid mennesket. To agenter kan derfor ikke
 * bli målt i ulike stillinger.
 *
 * Alle agentene får `observer` på HVER tilstand, også `RUNDE_SLUTT`, så bøker og økter er i takt
 * — uten det kaster en søketro i runde 2, og en profilbok står tom.
 *
 * ===================== DE FIRE TYPENE ====================================
 *
 *   bud     `BUDRUNDE`, mennesket i tur, ≥ 2 lovlige bud. Sammenliknet på budet.
 *   vrak    `VRAK`, mennesket er budvinner. Sammenliknet på KORTMENGDEN som kastes.
 *   trumf   `VELG` i den EKTE tilstanden (menneskets vrak alt utført). Sammenliknet på fargen.
 *   kall    samme tilstand, sammenliknet på det etterlyste kortet.
 *
 * FORBEHOLD PÅ TRUMF OG KALL, sagt høyt: `Vrakrangerer` (og klonen) velger trumf SAMMEN MED
 * vraket, og bærer den fram til VELG. Når agenten så spørres i den EKTE VELG-tilstanden, er
 * trumfen den den paret med SITT eget vrak, mens hånden er den menneskets vrak ga. Det er ikke
 * en ren sammenlikning — men det er NØYAKTIG samme behandling for klonen og for hver grunnlinje,
 * og alternativet (å la hver agent spille videre på sitt eget vrak) ville målt dem i ulike
 * stillinger, som er verre.
 *
 * TAKET PÅ VRAK er målt i `menneske-klondata.ts`: 35 % av menneskets faktiske par finnes ikke i
 * kandidatsettet `Vrakrangerer` velger mellom (mest fordi mennesket kaster kort `telrd` aldri
 * ville kastet). Ingen vekt kan treffe dem. Enigheten på vrak må leses mot ~65 %, ikke mot 100 %.
 *
 * ===================== USIKKERHET =======================================
 *
 * SE er klyngebootstrap over KAMP (`klyngeSnitt`): beslutninger i samme kamp deler spiller,
 * dagsform og motstand, så de er ikke uavhengige.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { lovligeHandlinger, lovligeKort, type GameState } from "../src/motor.ts";
import type { Kort } from "../src/kort.ts";
import { ADAMS, lagIndre, type Spekagent } from "../src/moe2/agentspek.ts";
import { klyngeSnitt } from "./klynge.ts";
import {
  kamprunder,
  lesMenneskelogg,
  MENNESKE,
  MENNESKE_FRA,
  menneskeBånd,
  nyTeller,
  skardAv,
  tellerTekst,
  V5_KJEDE,
} from "./menneske-logg.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};

const BAND = arg("--band", "holdout");
if (BAND !== "trening" && BAND !== "holdout") throw new Error(`Ukjent bånd «${BAND}» (trening|holdout)`);
const DATA = arg("--data", "D:/amb-grp/menneske/hendelser.jsonl");
const UT = arg("--ut", "analyse/klon/dom.jsonl");
const [SI, SN] = arg("--skard", "0/1").split("/").map(Number) as [number, number];
const AGENTER = arg("--agenter", `adams=${ADAMS}|v5=${V5_KJEDE}`);

const nøkkel = (k: Kort): string => `${k.farge}${k.verdi}`;
const mengde = (ks: readonly Kort[]): string => ks.map(nøkkel).sort().join(",");

const spek = new Map<string, string>();
for (const del of AGENTER.split("|").filter((x) => x !== "")) {
  const i = del.indexOf("=");
  if (i < 0) throw new Error(`Ugyldig --agenter-ledd «${del}» – forventet navn=spek`);
  spek.set(del.slice(0, i), del.slice(i + 1));
}
if (spek.size === 0) throw new Error("--agenter er tom");

type Type = "bud" | "vrak" | "trumf" | "kall" | "kort";
const TYPER: readonly Type[] = ["bud", "vrak", "trumf", "kall", "kort"];

interface Rad {
  readonly kamp: string;
  readonly runde: number;
  readonly type: Type;
  readonly agent: string;
  readonly enig: 0 | 1;
}
const rader: Rad[] = [];

const spill = lesMenneskelogg(DATA);
const teller = nyTeller();
let kamper = 0;
const t0 = Date.now();

for (const [id, kamp] of spill) {
  if (kamp.start === null) continue;
  if (skardAv(id, SN) !== SI) continue;
  if (menneskeBånd(id) !== BAND) continue;
  if (!kamp.runder.some((r) => r.tid >= MENNESKE_FRA)) continue;
  kamper++;

  const budgivere = [0, 1, 2, 3].map(() => lagIndre(V5_KJEDE));
  /** Én fersk instans per kamp per agent: bøker og økter er kampens, aldri korpusets. */
  const agenter = new Map<string, Spekagent>();
  for (const [navn, sp] of spek) {
    const a = lagIndre(sp);
    a.nyKamp();
    agenter.set(navn, a);
  }

  const legg = (runde: number, type: Type, agent: string, enig: boolean): void => {
    rader.push({ kamp: id, runde, type, agent, enig: enig ? 1 : 0 });
  };

  for (const steg of kamprunder(kamp, budgivere, teller)) {
    if (steg.runde === null) continue;
    const ts = steg.runde.tilstander;
    const iBånd = steg.hendelse.tid >= MENNESKE_FRA;

    for (let i = 0; i + 1 < ts.length; i++) {
      const s = ts[i]!;
      const neste = ts[i + 1]!;
      // Bøkene får HVER tilstand, uansett om noen måles her.
      for (const a of agenter.values()) a.observer?.(s);
      if (!iBånd) continue;

      if (s.fase === "BUDRUNDE" && s.iTur === MENNESKE) {
        const lov = lovligeHandlinger(s);
        if (lov.fase !== "BUDRUNDE" || lov.bud.length < 2) continue;
        const passet = neste.budrunde.passet[MENNESKE] === true && s.budrunde.passet[MENNESKE] !== true;
        const b = neste.budrunde.sisteBud[MENNESKE];
        const fasit = passet ? "PASS" : b !== null && b !== undefined && b !== s.budrunde.sisteBud[MENNESKE] ? String(b) : null;
        if (fasit === null) continue;
        for (const [navn, a] of agenter) {
          const h = a.velgHandling(s);
          legg(s.rundeNr, "bud", navn, h.type === "BUD" && String(h.bud) === fasit);
        }
        continue;
      }

      if (s.fase === "VRAK" && s.budvinner === MENNESKE) {
        const fasit = mengde(neste.vrak);
        for (const [navn, a] of agenter) {
          const h = a.velgHandling(s);
          legg(s.rundeNr, "vrak", navn, h.type === "VRAK" && mengde(h.kort) === fasit);
        }
        continue;
      }

      if (s.fase === "VELG" && s.budvinner === MENNESKE) {
        const trumf = neste.trumf;
        const kalt = neste.etterlyst;
        for (const [navn, a] of agenter) {
          const h = a.velgHandling(s);
          if (h.type !== "VELG") {
            legg(s.rundeNr, "trumf", navn, false);
            if (kalt !== null) legg(s.rundeNr, "kall", navn, false);
            continue;
          }
          legg(s.rundeNr, "trumf", navn, trumf !== null && h.trumf === trumf);
          if (kalt !== null) {
            legg(s.rundeNr, "kall", navn, h.etterlyst !== null && nøkkel(h.etterlyst) === nøkkel(kalt));
          }
        }
        continue;
      }

      if (s.fase === "SPILL" && s.iTur === MENNESKE) {
        // Ett lovlig kort er REGLENE, ikke atferd — det ville gitt alle agentene gratis treff.
        if (lovligeKort(s, MENNESKE).length < 2) continue;
        let fasit: string | null = null;
        if (neste.bord.length > s.bord.length) fasit = nøkkel(neste.bord[neste.bord.length - 1]!.kort);
        else for (const kp of neste.forrigeStikk?.kort ?? []) if (kp.spiller === MENNESKE) fasit = nøkkel(kp.kort);
        if (fasit === null) continue;
        for (const [navn, a] of agenter) {
          const h = a.velgHandling(s);
          legg(s.rundeNr, "kort", navn, h.type === "SPILL" && nøkkel(h.kort) === fasit);
        }
      }
    }
    for (const a of agenter.values()) a.observer?.(ts[ts.length - 1]!);
  }
  process.stdout.write(`\r  skard ${SI}/${SN} (${BAND}): ${kamper} kamper, ${rader.length} rader, ${((Date.now() - t0) / 1000).toFixed(0)} s   `);
}

console.log(`\n${kamper} kamper i bånd ${BAND}. ${tellerTekst(teller)}\n`);
console.log(`TOPP-1-ENIGHET MED MENNESKET (holdout-kamper, SE = klyngebootstrap over kamp)\n`);
const navn = [...spek.keys()];
console.log(`  ${"type".padEnd(8)}${"n".padStart(7)}   ${navn.map((n) => n.padStart(16)).join("")}`);
for (const type of TYPER) {
  const per = navn.map((n) => {
    const r = rader.filter((x) => x.type === type && x.agent === n);
    return { n: r.length, k: klyngeSnitt(r, (x) => x.kamp, (x) => x.enig) };
  });
  const n0 = per[0]?.n ?? 0;
  if (n0 === 0) continue;
  const celler = per.map((p) =>
    `${(100 * p.k.snitt).toFixed(1)} ± ${(100 * p.k.se).toFixed(1)}`.padStart(16),
  );
  console.log(`  ${type.padEnd(8)}${String(n0).padStart(7)}   ${celler.join("")}`);
}

console.log(`\nVRAK LESES MOT ~65 %: 35 % av menneskets par finnes ikke i kandidatsettet (se menneske-klondata.ts).`);
mkdirSync(dirname(UT), { recursive: true });
appendFileSync(UT, rader.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(`${rader.length} rader → ${UT}`);
// Maskinlesbart, bakerst.
for (const type of TYPER) {
  for (const n of navn) {
    const r = rader.filter((x) => x.type === type && x.agent === n);
    if (r.length === 0) continue;
    const k = klyngeSnitt(r, (x) => x.kamp, (x) => x.enig);
    console.log(`ENIGHET ${type} ${n} ${k.snitt.toFixed(5)} ${k.se.toFixed(5)} ${r.length}`);
  }
}
