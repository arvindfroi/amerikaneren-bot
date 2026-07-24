/**
 * Lokal langtidstrening: starter BEGGE linjer (C4 evolusjon-ren, D1
 * gradient-stack), holder dem i live, og publiserer fremgangsgrafen til
 * GitHub Pages hvert 2. minutt.
 *
 *   node examples/lokal-tren.ts                  # auto-kjerner, populasjon 128
 *   node examples/lokal-tren.ts 192              # populasjon 192
 *   POPP=160 TRAADER=10 node examples/lokal-tren.ts
 *   node examples/lokal-tren.ts --uten-graf      # tren, men ikke publiser
 *
 * Dette er kryssplattform-utgaven av lokal-tren.sh (som trenger nohup/pgrep
 * og derfor ikke virker på Windows). Tre lag med feilsikring:
 *   1. neat-tren.ts lagrer befolkningen hver 5. generasjon (atomisk).
 *   2. neat-vakt.ts starter treneren om ved krasj og heng.
 *   3. dette skriptet starter vakten om hvis den selv dør, og pusher grafen.
 *
 * Stopp: lag filen STOPP i repoet (`New-Item STOPP` / `touch STOPP`) eller
 * Ctrl-C. Begge deler avslutter linjene og skriptet.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, rmSync } from "node:fs";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..");
const STOPPFIL = `${REPO}/STOPP`;
const GRAF_INTERVALL_MS = 2 * 60_000;
const OMSTART_PAUSE_MS = 15_000;

const flagg = process.argv.slice(2);
const medGraf = !flagg.includes("--uten-graf");
const posisjonell = flagg.find((f) => !f.startsWith("--"));

const KJERNER = availableParallelism();
const POPP = Number(posisjonell ?? process.env.POPP ?? 128);
const GENERASJONER = Number(process.env.GENERASJONER ?? 40_000);
// To linjer deler maskinen. Fire kjerner holdes av til vaktene, grafen og
// resten av skrivebordet – full metning gjør maskinen ubrukelig uten å gi
// nevneverdig flere gruppekamper.
const STD_TRÅDER = Math.max(2, Math.floor((KJERNER - 4) / 2));
const TRÅDER = Number(process.env.TRAADER ?? STD_TRÅDER);

interface Linje {
  readonly navn: string;
  readonly dir: string;
  readonly logg: string;
  readonly frø: number;
  readonly ekstra: string[];
}

// --nevro på begge: målestokken i cupen er appens NevroHjerne (sterkere enn
// PIMC-portvakten og praktisk talt gratis), og gullstandarden avgjøres av
// nevro-benken på roterende givere med parret bekreftelse. Uten det ble
// gullet kåret på åtte faste givere mot en bot som aldri byr over 5.
const LINJER: Linje[] = [
  { navn: "C4", dir: "trening-c4", logg: "trening-c4.log", frø: 616161, ekstra: ["--nevro"] },
  {
    navn: "D1",
    dir: "trening-d1",
    logg: "trening-d1.log",
    frø: 717171,
    ekstra: ["--sluttsøk", "4", "--spillfasit", "--budfasit", "--nevro"],
  },
];

function tid(): string {
  return new Date().toLocaleTimeString("nb-NO");
}

function si(melding: string): void {
  console.log(`[${tid()}] ${melding}`);
}

let stopper = false;
const kjørende = new Map<string, ChildProcess>();

function start(linje: Linje): void {
  if (stopper) return;
  const argv = [
    "examples/neat-vakt.ts",
    String(GENERASJONER),
    String(POPP),
    String(linje.frø),
    "--hall",
    "16",
    "--dir",
    linje.dir,
    "--fra-flere",
    `${linje.dir}/start.json`,
    "--tråder",
    String(TRÅDER),
    "--kampfrø",
    "2",
    "--portvakter",
    "4",
    ...linje.ekstra,
  ];
  const barn = spawn(process.execPath, argv, { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] });
  // Loggen er linjens hukommelse: grafen leser benk-målingene herfra, så
  // den må appendes (aldri overskrives) og skrives fortløpende.
  const logg = createWriteStream(`${REPO}/${linje.logg}`, { flags: "a" });
  barn.stdout?.pipe(logg, { end: false });
  barn.stderr?.pipe(logg, { end: false });
  kjørende.set(linje.navn, barn);
  si(`${linje.navn} startet (pid ${barn.pid}, ${TRÅDER} tråder, populasjon ${POPP})`);

  barn.on("exit", (kode, signal) => {
    kjørende.delete(linje.navn);
    logg.end();
    if (stopper) return;
    si(`${linje.navn} avsluttet (kode ${kode ?? "-"}, signal ${signal ?? "-"}) – starter på nytt om ${OMSTART_PAUSE_MS / 1000}s`);
    setTimeout(() => start(linje), OMSTART_PAUSE_MS);
  });
  barn.on("error", (feil) => {
    si(`${linje.navn} klarte ikke starte: ${String(feil)}`);
  });
}

/** Publiserer grafen. Feiler den, prøver vi igjen om to minutter – aldri velte treningen. */
function publiserGraf(): void {
  const argv = ["examples/neat-graf.ts", ...(medGraf ? ["--pages"] : ["trening-graf"])];
  const barn = spawn(process.execPath, argv, { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] });
  let ut = "";
  barn.stdout?.on("data", (d: Buffer) => (ut += d.toString()));
  barn.stderr?.on("data", (d: Buffer) => (ut += d.toString()));
  barn.on("exit", (kode) => {
    const siste = ut.trim().split("\n").filter(Boolean).at(-1) ?? "(ingen utdata)";
    if (kode !== 0) si(`graf: feilet (kode ${kode}) – ${siste}`);
    else if (!siste.startsWith("Ingen endringer")) si(`graf: ${siste}`);
  });
}

function stopp(grunn: string): void {
  if (stopper) return;
  stopper = true;
  si(`Stopper (${grunn}) …`);
  for (const [navn, barn] of kjørende) {
    si(`  dreper ${navn} (pid ${barn.pid})`);
    barn.kill("SIGKILL"); // vakten lagrer fortløpende; siste ≤5 generasjoner kan gå tapt
  }
  if (existsSync(STOPPFIL)) rmSync(STOPPFIL, { force: true });
  setTimeout(() => process.exit(0), 1500);
}

// --- Start -------------------------------------------------------------------
if (existsSync(STOPPFIL)) rmSync(STOPPFIL, { force: true }); // gammel stoppfil skal ikke drepe en ny økt
si(`Maskin: ${KJERNER} kjerner → ${TRÅDER} tråder per linje, populasjon ${POPP}, mål ${GENERASJONER} generasjoner`);
si(`C4 (evolusjon-ren) + D1 (gradient: sluttsøk+spillfasit+budfasit)`);
si(medGraf ? "Grafen publiseres til gh-pages hvert 2. minutt" : "Grafen skrives lokalt (trening-graf/), ikke publisert");

for (const linje of LINJER) start(linje);

setInterval(publiserGraf, GRAF_INTERVALL_MS);
publiserGraf();

setInterval(() => {
  if (existsSync(STOPPFIL)) stopp("STOPP-fil");
}, 10_000);

process.on("SIGINT", () => stopp("Ctrl-C"));
process.on("SIGTERM", () => stopp("SIGTERM"));
