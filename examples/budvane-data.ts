/**
 * BUDVANE-DATA — ÉN RAD PER MENNESKEBUD, BYGD BARE AV LOGGEN (14. sep).
 *
 *   node examples/budvane-data.ts [--logg D:/amb-grp/menneske/hendelser.jsonl]
 *                                 [--ut D:/amb-grp/loop/budvane/bud.jsonl]
 *
 * Spørsmålet: er menneskers bud forutsigbare fra deres EGEN historikk? Denne fila lager
 * datasettet; `verktoy/budvane-analyse.py` svarer.
 *
 * ================= HVORFOR IKKE `kamprunder` / GJENSKAPINGEN ==============
 *
 * `menneske-logg.ts` sin `gjenskapRunde` spiller budrunden om med `V5_KJEDE` for å få ekte
 * tilstander. Den er RIKTIG for K1, men her er den både unødvendig og skadelig:
 *
 *   UNØDVENDIG  alt denne målingen trenger er menneskets EGEN hånd og eget bud. Hånden
 *               følger determinstisk av `frø` og `rundeNr` (`stillingFør`), og budet står
 *               i `valg-bud`. Ingen bot trenger å by for at raden skal finnes.
 *   SKADELIG    gjenskapingen forfaller (`amerikaneren-menneskedata`: 22 av 86 nye runder
 *               avvist etter BudQ-utrullingen). Å la den avgjøre hvilke bud som telles
 *               ville koblet datasettet til en kjede som ikke lenger er den utrullede.
 *
 * Prisen er sagt høyt: AUKSJONSTILSTANDEN da mennesket bød er IKKE med. Loggen har ikke
 * botenes mellombud (`budrunde`-feltet står i 1 av 4448 runder), så «hva var høyeste bud da
 * han meldte 10?» kan ikke besvares. Det begrenser hva §1 kan konkludere, og det står i
 * rapporten.
 *
 * ================= K2: HVA ER LOVLIG Å SE, OG NÅR =========================
 *
 * Dette er kravet som har felt tidligere forsøk, så skillet er BYGD INN i radene, ikke
 * overlatt til analysen:
 *
 *   `naa_*`   MOTSTANDERENS SKJULTE HÅND I DENNE RUNDEN. `naa_anslag` er styrken på hånden
 *             mennesket satt med da han bød. Ved bordet ser boten den ALDRI. Feltene er
 *             tatt med som REFERANSE — «hvor mye av budet forklares av det vi ikke kan se»
 *             — og er merket med prefikset `naa_` nettopp for at ingen modell skal kunne
 *             bruke dem ved et uhell. Enhver arm som leser `naa_*` er per definisjon
 *             uspillbar og skal rapporteres som et TAK, aldri som en kandidat.
 *
 *   alt annet OFFENTLIG FØR BUDET FALT: rundenummer, poengstillingen før runden (den endres
 *             først ved rundeslutt), og utfallet av FERDIGSPILTE runder. Ved rundeslutt er
 *             hver hånd avdekket, så `avvik` (bud − anslag) fra en TIDLIGERE runde er
 *             offentlig — det er nøyaktig grunnlaget `src/mlb/hukommelse.ts` bokfører sin
 *             MESO-`budavvik` på, og med samme målestokk (`besteAnslag`), hentet derfra og
 *             ikke skrevet opp igjen.
 *
 * Radene er sortert på (kamp, rundeNr), så analysen kan bygge en løpende bok av
 * FORUTGÅENDE runder uten å kunne se framover. `verktoy/budvane-analyse.py` gjør det, og
 * har fella: en bok som får lov å se runden selv skal slå alt, og blir tatt.
 *
 * ================= NAVN ==================================================
 *
 * `spiller` er alt et pseudonym (`menneske-eksport.ts`); det skrives til fila for å kunne
 * gruppere, og aldri til en rapport i full lengde.
 */

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { besteAnslag, budTall } from "../src/mlb/hukommelse.ts";
import { lesMenneskelogg, kampSpenn, spillerAv, stillingFør, MENNESKE, MENNESKE_FRA } from "./menneske-logg.ts";
import type { Bud } from "../src/regler.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const LOGG = arg("--logg", "D:/amb-grp/menneske/hendelser.jsonl");
const UT = arg("--ut", "D:/amb-grp/loop/budvane/bud.jsonl");

mkdirSync(dirname(UT), { recursive: true });
writeFileSync(UT, "");

const kamper = lesMenneskelogg(LOGG);
let skrevet = 0;
let hoppet = 0;
const grunner: Record<string, number> = {};
const hopp = (g: string): void => {
  grunner[g] = (grunner[g] ?? 0) + 1;
  hoppet++;
};

const linjer: string[] = [];
for (const [spillId, kamp] of kamper) {
  const spenn = kampSpenn(kamp);
  // HELE kampen må ligge etter overgangen; en kamp som spenner over den hører ingen steder
  // hjemme (samme regel som `tidsside` i menneske-logg.ts).
  if (spenn === null || spenn.fra < MENNESKE_FRA) continue;
  if (kamp.start === null) {
    hopp("ingen start");
    continue;
  }
  const frø = Number(kamp.start.data["frø"]);
  const målPoeng = Number(kamp.start.data["målPoeng"] ?? 100);
  if (!Number.isFinite(frø)) {
    hopp("ugyldig frø");
    continue;
  }
  const spiller = spillerAv(kamp);

  const runder = [...kamp.runder].sort((a, b) => Number(a.data["rundeNr"]) - Number(b.data["rundeNr"]));
  for (const r of runder) {
    const d = r.data;
    const rundeNr = Number(d["rundeNr"]);
    const delta = d["delta"];
    const total = d["totalPoeng"];
    if (!Number.isFinite(rundeNr) || !Array.isArray(delta) || delta.length !== 4 || !Array.isArray(total) || total.length !== 4) {
      hopp("ufullstendig runde");
      continue;
    }
    const mine = kamp.bud.get(rundeNr) ?? [];
    if (mine.length === 0) {
      hopp("ingen valg-bud");
      continue;
    }
    const før = (total as number[]).map((t, p) => t - ((delta as number[])[p] ?? 0));

    let s;
    try {
      s = stillingFør(frø, målPoeng, rundeNr, før);
    } catch (e) {
      hopp("stillingFør kastet");
      continue;
    }
    const hånd = s.hender[MENNESKE] ?? [];
    if (hånd.length === 0) {
      hopp("tom hånd");
      continue;
    }
    const antallStikk = s.giving.antallStikk;
    const anslag = besteAnslag(hånd);

    const første = mine[0]!;
    const budN = budTall(første, antallStikk);
    const vinner = kamp.budvinner.get(rundeNr) ?? null;

    linjer.push(
      JSON.stringify({
        kamp: spillId,
        spiller,
        rundeNr,
        tid: r.tid,
        // ---- MENNESKETS EGET BUD (målet) --------------------------------
        bud: String(første),
        budN, // null = PASS
        alleBud: mine.map((b: Bud) => String(b)),
        // ---- OFFENTLIG FØR BUDET FALT -----------------------------------
        foerPoeng: før,
        egne: før[MENNESKE] ?? 0,
        besteAndre: Math.max(...før.filter((_, i) => i !== MENNESKE)),
        maalPoeng: målPoeng,
        antallStikk,
        // ---- OFFENTLIG FØRST ETTER AT RUNDEN ER FERDIGSPILT -------------
        // (analysen bruker dem bare for FORUTGÅENDE runder — se filhodet)
        delta: delta as number[],
        budvinner: vinner === null ? null : vinner.spiller,
        vinnerbud: vinner === null ? null : String(vinner.bud),
        klart: d["klart"] === undefined ? null : Boolean(d["klart"]),
        // ---- SKJULT I DENNE RUNDEN: REFERANSE, ALDRI EN KANDIDATSANS ----
        naa_anslag: Math.round(anslag.stikk * 1000) / 1000,
        naa_anslagTrumf: anslag.trumf,
        naa_avvik: budN === null ? null : Math.round((budN - anslag.stikk) * 1000) / 1000,
      }),
    );
    skrevet++;
  }
}

appendFileSync(UT, linjer.join("\n") + "\n");
console.log(`${skrevet} budrader -> ${UT}`);
console.log(`hoppet over ${hoppet}: ${JSON.stringify(grunner)}`);
