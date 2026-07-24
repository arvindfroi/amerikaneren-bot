/**
 * Vakt (watchdog) for lange NEAT-treninger: kjører neat-tren.ts som
 * barneprosess og sørger for at treningen overlever krasj og heng.
 *
 *   node examples/neat-vakt.ts [generasjoner] [populasjon] [frø] [--maks-timer t]
 *
 * Feilsikringer:
 *  - KRASJ: dør barnet med feilkode, startes det om fra siste lagrede
 *    mester (trening/mester.json) med gjenstående generasjoner. Frøet
 *    forskyves per omstart, slik at et deterministisk krasj ikke
 *    reproduseres i evighet. Eksponentiell pause mellom omstarter,
 *    maks 100 omstarter.
 *  - HENG: neat-tren.ts skriver hjerteslag (trening/status.json) hver
 *    generasjon. Står hjerteslaget stille i 10 minutter, drepes barnet
 *    (SIGKILL) og startes om fra siste mester.
 *  - TIDSTAK: --maks-timer gjelder hele vaktøkten; gjenstående tid sendes
 *    videre til barnet, som avslutter pent (lagrer alt, kode 0).
 *
 * Generasjonsnummereringen løper videre over omstarter (--gen-start), så
 * loggen forblir én sammenhengende tidslinje.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const posisjonelle: string[] = [];
let maksTimer: number | null = null;
let dir = "trening";
let hall = 0;
let fraFlere: string | null = null;
let tråder = 1;
let kampFrø = 1;
let portvakter = 0;
let sluttsøk = 0;
let spillFasit = false;
let budFasit = false;
let medNevro = false;
let nevroFasit = 0;
let trumfFasit = 0;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--maks-timer") maksTimer = Number(process.argv[++i]);
  else if (process.argv[i] === "--dir") dir = process.argv[++i] ?? "trening";
  else if (process.argv[i] === "--hall") hall = Number(process.argv[++i]);
  else if (process.argv[i] === "--fra-flere") fraFlere = process.argv[++i] ?? null;
  else if (process.argv[i] === "--tråder") tråder = Number(process.argv[++i]);
  else if (process.argv[i] === "--kampfrø") kampFrø = Number(process.argv[++i]);
  else if (process.argv[i] === "--portvakter") portvakter = Number(process.argv[++i]);
  else if (process.argv[i] === "--sluttsøk") sluttsøk = Number(process.argv[++i]);
  else if (process.argv[i] === "--spillfasit") spillFasit = true;
  else if (process.argv[i] === "--budfasit") budFasit = true;
  else if (process.argv[i] === "--nevro") medNevro = true;
  else if (process.argv[i] === "--nevrofasit") nevroFasit = Number(process.argv[++i]);
  else if (process.argv[i] === "--trumffasit") trumfFasit = Number(process.argv[++i]);
  else posisjonelle.push(process.argv[i]!);
}
const generasjoner = Number(posisjonelle[0] ?? 8000);
const populasjon = Number(posisjonelle[1] ?? 64);
const frø = Number(posisjonelle[2] ?? 42);

const MAKS_OMSTARTER = 100;
const HJERTESLAG_FRIST_MS = 10 * 60_000;
const SJEKK_INTERVALL_MS = 60_000;

interface Status {
  readonly generasjon: number;
  readonly tidsstempel: number;
}

function lesStatus(): Status | null {
  try {
    const s = JSON.parse(readFileSync(`${dir}/status.json`, "utf8")) as Status;
    return typeof s.generasjon === "number" && typeof s.tidsstempel === "number" ? s : null;
  } catch {
    return null;
  }
}

function vent(ms: number): Promise<void> {
  return new Promise((løs) => setTimeout(løs, ms));
}

/** Kjører barnet én gang; løser med exit-kode (null = drept for heng). */
function kjørBarn(argv: string[]): Promise<number | null> {
  return new Promise((løs) => {
    const starttid = Date.now();
    const barn = spawn(process.execPath, argv, { stdio: ["ignore", "inherit", "inherit"] });
    let drept = false;
    const vaktTimer = setInterval(() => {
      // Et hjerteslag teller bare hvis det er NYERE enn barnets start –
      // en stanset forrige kjøring skal ikke få et ferskt barn drept.
      const status = lesStatus();
      const sist = Math.max(status?.tidsstempel ?? 0, starttid);
      if (Date.now() - sist > HJERTESLAG_FRIST_MS) {
        console.error(`[vakt] Ingen hjerteslag på ${Math.round((Date.now() - sist) / 60000)} min – dreper barnet (heng).`);
        drept = true;
        barn.kill("SIGKILL");
      }
    }, SJEKK_INTERVALL_MS);
    barn.on("exit", (kode) => {
      clearInterval(vaktTimer);
      løs(drept ? null : (kode ?? 1));
    });
    barn.on("error", (feil) => {
      clearInterval(vaktTimer);
      console.error(`[vakt] Klarte ikke starte barnet: ${String(feil)}`);
      løs(1);
    });
  });
}

const t0 = Date.now();
let omstarter = 0;

console.log(
  `[vakt] Starter: ${generasjoner} generasjoner, populasjon ${populasjon}, frø ${frø}` +
    (maksTimer !== null ? `, tidstak ${maksTimer} t` : ""),
);

for (;;) {
  const status = lesStatus();
  const gjort = status !== null ? status.generasjon + 1 : 0;
  const igjen = generasjoner - gjort;
  if (igjen <= 0) {
    console.log(`[vakt] Alle ${generasjoner} generasjoner fullført.`);
    break;
  }

  const igjenTimer =
    maksTimer !== null ? maksTimer - (Date.now() - t0) / 3_600_000 : null;
  if (igjenTimer !== null && igjenTimer <= 0) {
    console.log(`[vakt] Tidstaket på ${maksTimer} t er brukt opp. Mester: ${dir}/mester.json`);
    break;
  }

  const argv = [
    "examples/neat-tren.ts",
    String(igjen),
    String(populasjon),
    String(frø + omstarter), // nytt frø per omstart – unngå deterministisk krasjsløyfe
    "--gen-start",
    String(gjort),
    "--dir",
    dir,
  ];
  if (hall > 0) argv.push("--hall", String(hall));
  if (tråder > 1) argv.push("--tråder", String(tråder));
  if (kampFrø > 1) argv.push("--kampfrø", String(kampFrø));
  if (portvakter > 0) argv.push("--portvakter", String(portvakter));
  if (sluttsøk > 0) argv.push("--sluttsøk", String(sluttsøk));
  if (spillFasit) argv.push("--spillfasit");
  if (budFasit) argv.push("--budfasit");
  if (medNevro) argv.push("--nevro");
  if (nevroFasit > 0) argv.push("--nevrofasit", String(nevroFasit));
  if (trumfFasit > 0) argv.push("--trumffasit", String(trumfFasit));
  // Gjenoppta fra linjens egen mester når den finnes; ellers eventuell
  // kombinert startpopulasjon (kun første start av en ny linje).
  if (existsSync(`${dir}/mester.json`)) argv.push("--fra", `${dir}/mester.json`);
  else if (fraFlere !== null) argv.push("--fra-flere", fraFlere);
  if (igjenTimer !== null) argv.push("--maks-timer", igjenTimer.toFixed(3));

  if (omstarter > 0 || gjort > 0) {
    console.log(`[vakt] ${omstarter > 0 ? `Omstart ${omstarter}` : "Start"} fra generasjon ${gjort} (${igjen} igjen).`);
  }

  const kode = await kjørBarn(argv);

  if (kode === 0) {
    // Pent avsluttet: enten ferdig eller tidsavbrudd – begge er sluttilstander.
    const etter = lesStatus();
    console.log(
      `[vakt] Treningen avsluttet pent ved generasjon ${etter?.generasjon ?? "ukjent"}. Mester: ${dir}/mester.json`,
    );
    break;
  }

  omstarter++;
  if (omstarter > MAKS_OMSTARTER) {
    console.error(`[vakt] Gir opp etter ${MAKS_OMSTARTER} omstarter.`);
    process.exit(1);
  }
  const pause = Math.min(5 * 60_000, 5_000 * 2 ** Math.min(omstarter - 1, 6));
  console.error(
    `[vakt] Barnet ${kode === null ? "hang og ble drept" : `krasjet (kode ${kode})`} – omstart ${omstarter}/${MAKS_OMSTARTER} om ${Math.round(pause / 1000)}s.`,
  );
  await vent(pause);
}
