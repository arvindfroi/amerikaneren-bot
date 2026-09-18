/**
 * DEKOMPONERINGSSONDEN — HVOR SKILLER BOTEN OG MENNESKET LAG? (14. sep)
 *
 *   node examples/dekomp-probe.ts --spek <bot> --ut D:/.../probe.jsonl
 *
 * K1 sier at boten henter +1,24 ± 0,21 pp mer ut av menneskets kort. Den sier ikke HVOR.
 * Denne sonda svarer på det ved å gå menneskets EGEN gjenskapte runde steg for steg
 * (`kamprunder` fra `menneske-logg.ts`) og spørre boten hva DEN ville gjort i hver stilling
 * der mennesket handlet. Første stilling der de er uenige er rundens SKILLEPUNKT.
 *
 * HVORFOR LÆRERTVANG OG IKKE FRILØP: i friløpet (duplikatet) skiller banene lag ved første
 * avvik, og alt etterpå er en annen runde — da kan man ikke lenger si hvilket ledd som
 * gjorde det. På menneskets egen bane er hver sammenlikning i NØYAKTIG samme stilling, og
 * skillepunktet er veldefinert. Skillepunktet fra lærertvang er det samme som i friløpet,
 * fordi banene er identiske fram til det.
 *
 * HVA RADEN IKKE ER: den sier hvor de skiller lag, ikke hvem som hadde rett. Verdien av
 * skillet leses ved å slå raden sammen med friløpets ΔP for samme runde (`--fri`), som er
 * kjørt med samme spek. Attribusjonen er «første avvik», altså standard årsaksrekkefølge:
 * hele rundens ΔP tilskrives det leddet der banene først skilte lag.
 *
 * EKSPONERING: vrak og trumfvalg finnes bare i runder der SETET er budvinner. Radene bærer
 * derfor `eksp*`-flagg, så en andel kan regnes mot de rundene leddet fantes i.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { GameState, Handling } from "../src/motor.ts";
import type { Kort } from "../src/kort.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { kamprunder, lesMenneskelogg, MENNESKE, nyTeller, skardAv as skardAvN, tellerTekst, V5_KJEDE } from "./menneske-logg.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const SPEK = arg("--spek", V5_KJEDE);
const DATA = arg("--data", "D:/amb-grp/menneske/hendelser.jsonl");
const UT = arg("--ut", "D:/amb-grp/loop/dekomp/probe.jsonl");
const ETTER = arg("--etter", "2026-08-10");
const [SI, SN] = arg("--skard", "0/1").split("/").map(Number) as [number, number];

mkdirSync(dirname(UT), { recursive: true });

const kort = (k: Kort): string => `${k.farge}${k.verdi}`;
const kortliste = (ks: readonly Kort[]): string => ks.map(kort).sort().join(",");

/** Kortet som forsvant fra hånden i steget — det setet spilte. */
function spiltKort(før: readonly Kort[], etter: readonly Kort[]): string | null {
  const igjen = etter.map(kort);
  for (const k of før) {
    const i = igjen.indexOf(kort(k));
    if (i < 0) return kort(k);
    igjen.splice(i, 1);
  }
  return null;
}

/** Menneskets handling i steget s1 → s2, lest av tilstandene. */
function handlingen(s1: GameState, s2: GameState): { fase: string; sete: number; verdi: string } | null {
  if (s1.fase === "BUDRUNDE") {
    const p = s1.iTur;
    if (p === null) return null;
    const passetNå = s2.budrunde.passet[p] === true && s1.budrunde.passet[p] !== true;
    return { fase: "BUD", sete: p, verdi: passetNå ? "PASS" : String(s2.budrunde.sisteBud[p]) };
  }
  if (s1.fase === "VRAK") {
    const bv = s1.budvinner;
    if (bv === null) return null;
    return { fase: "VRAK", sete: bv, verdi: kortliste(s2.vrak) };
  }
  if (s1.fase === "VELG") {
    const bv = s1.budvinner;
    if (bv === null) return null;
    return { fase: "VELG", sete: bv, verdi: `${s2.trumf}|${s2.etterlyst === null ? "-" : kort(s2.etterlyst)}` };
  }
  if (s1.fase === "SPILL") {
    const p = s1.iTur;
    if (p === null) return null;
    const k = spiltKort(s1.hender[p] ?? [], s2.hender[p] ?? []);
    return k === null ? null : { fase: "SPILL", sete: p, verdi: k };
  }
  return null;
}

/** Botens handling i samme stilling, på samme form. */
function botVerdi(h: Handling, s: GameState): string | null {
  if (h.type === "BUD") return String(h.bud);
  if (h.type === "VRAK") return kortliste(h.kort);
  if (h.type === "VELG") return `${h.trumf}|${h.etterlyst === null || h.etterlyst === undefined ? "-" : kort(h.etterlyst)}`;
  if (h.type === "SPILL") return kort(h.kort);
  void s;
  return null;
}

/** Stikkbøtta: 1–4, 5–8, 9–12. */
const stikkbøtte = (stikkSpilt: number): string => {
  const n = stikkSpilt + 1;
  return n <= 4 ? "STIKK1_4" : n <= 8 ? "STIKK5_8" : "STIKK9_12";
};

const spill = lesMenneskelogg(DATA);
const budgivere = [0, 1, 2, 3].map(() => lagIndre(V5_KJEDE));
const kandidat = lagIndre(SPEK);

const teller = nyTeller();
let skrevet = 0;
let utenfor = 0;
const t0 = Date.now();

for (const [id, kamp] of spill) {
  if (skardAvN(id, SN) !== SI || kamp.start === null) continue;
  if (!kamp.runder.some((r) => r.tid >= ETTER)) continue;
  kandidat.nyKamp();
  for (const steg of kamprunder(kamp, budgivere, teller)) {
    if (steg.nyBok) kandidat.nyKamp();
    if (steg.runde === null) continue;
    const t = steg.runde.tilstander;
    const sisteTilstand = t[t.length - 1]!;

    if (steg.hendelse.tid < ETTER) {
      // Spilles for hukommelsens skyld, men blir ikke en rad – som i duplikatet.
      (kandidat as { observer?(s: GameState): void }).observer?.(sisteTilstand);
      utenfor++;
      continue;
    }

    /** Første uenighet, og en teller per ledd. */
    let første: string | null = null;
    const valg: Record<string, number> = {};
    const uenig: Record<string, number> = {};
    let ekspVrak = 0;
    let ekspVelg = 0;

    for (let i = 0; i + 1 < t.length; i++) {
      const s1 = t[i]!;
      const s2 = t[i + 1]!;
      const h = handlingen(s1, s2);
      if (h === null || h.sete !== MENNESKE) continue;
      const bøtte = h.fase === "SPILL" ? stikkbøtte(s1.stikkSpilt) : h.fase;
      if (bøtte === "VRAK") ekspVrak = 1;
      if (bøtte === "VELG") ekspVelg = 1;
      valg[bøtte] = (valg[bøtte] ?? 0) + 1;
      let bot: string | null = null;
      try {
        bot = botVerdi(kandidat.velgHandling(s1), s1);
      } catch {
        bot = null;
      }
      if (bot !== null && bot !== h.verdi) {
        uenig[bøtte] = (uenig[bøtte] ?? 0) + 1;
        if (første === null) første = bøtte;
      }
    }

    (kandidat as { observer?(s: GameState): void }).observer?.(sisteTilstand);

    appendFileSync(
      UT,
      JSON.stringify({
        spill: id,
        runde: steg.rundeNr,
        tid: steg.hendelse.tid,
        mRolle: t[0]!.budvinner === MENNESKE ? "fører" : "",
        budvinner: sisteTilstand.sisteRunde?.budvinner ?? null,
        mFører: ekspVelg,
        ekspVrak,
        ekspVelg,
        første: første ?? "INGEN",
        valg,
        uenig,
        budavvik: steg.runde.budavvik,
      }) + "\n",
    );
    skrevet++;
  }
  process.stdout.write(`\r  skard ${SI}/${SN}: ${skrevet} rader, ${((Date.now() - t0) / 1000).toFixed(0)} s   `);
}
console.log(`\nSkard ${SI}/${SN}: ${skrevet} rader (${utenfor} før ${ETTER}), ${tellerTekst(teller)} → ${UT}`);
