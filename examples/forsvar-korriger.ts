/**
 * Manuell korreksjon av forsvarsnettet mot tre MÅLTE defekter.
 *
 *   node examples/forsvar-korriger.ts trening-d5/gull.json --runder 400 --ut senat/v3
 *   node examples/forsvar-korriger.ts --fersk --runder 400 --ut senat/v3
 *
 * Bakgrunn (examples/forsvarsprofil.ts, kontrakt 9, nevro som spillefører):
 *
 *   renons + har trumf -> trumfet inn      D5 30 %   nevro 71 %
 *   budlaget leder og vi kunne ta -> tok   D5 71 %   nevro 85 %
 *   medforsvarer leder -> kastet honnør    D5  5 %   nevro  1 %
 *
 * Forsterkning på rundeutfall klarte ikke dette: ETT bitt («falt
 * kontrakten?») fordelt på ~12 kortvalg, med 12 % basisrate, er for tynt.
 * lærForsvar gir i stedet en fasit PER BESLUTNING, utledet av stillingen
 * selv – samme form som trumffasit, som målte +20,4 ± 4,4.
 *
 * FRØHYGIENE, som dette prosjektet har blitt brent av før:
 *   trening        2 000 000+
 *   overvåkning    2 500 000+   (brukes til å se kurven, ikke til å velge)
 *   endelig dom    1 400 000+   via senat-maal.ts – RØRES IKKE HER
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { lagRng } from "../src/kort.ts";
import { lovligeHandlinger, opprettSpill, utfør, type GameState } from "../src/index.ts";
import {
  genomFraJson,
  genomTilJson,
  Innovasjonsbok,
  klonGenom,
  NeatAgent,
  nyttGenom,
  type Genom,
} from "../src/neat/index.ts";
import { ANTALL_INN, ANTALL_UT } from "../src/neat/trekk.ts";
import { besteTrumf, NevroAgent } from "../src/nevro/index.ts";

const filer: string[] = [];
let runder = 400;
let rate = 0.12;
let kontrakt = 9;
let utMappe = "senat/v3";
let fersk = false;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--runder") runder = Number(process.argv[++i]);
  else if (a === "--rate") rate = Number(process.argv[++i]);
  else if (a === "--kontrakt") kontrakt = Number(process.argv[++i]);
  else if (a === "--ut") utMappe = process.argv[++i]!;
  else if (a === "--fersk") fersk = true;
  else filer.push(a);
}
mkdirSync(utMappe, { recursive: true });

const grunnFil = filer[0] ?? "trening-d5/gull.json";
let grunn: Genom;
if (fersk) {
  grunn = nyttGenom(ANTALL_INN, ANTALL_UT, new Innovasjonsbok(ANTALL_INN, ANTALL_UT), lagRng(0xfe25));
} else {
  const rå = JSON.parse(readFileSync(grunnFil, "utf8")) as { genom?: unknown };
  grunn = genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(grunnFil, "utf8"));
}

function oppsett(frø: number, budsete: number): GameState | null {
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  let g = 0;
  while (s.fase === "BUDRUNDE" && s.iTur !== budsete && g++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  if (s.fase !== "BUDRUNDE" || s.iTur !== budsete) return null;
  if (besteTrumf(s.hender[budsete] ?? []).estimat < kontrakt - 3.5) return null;
  try {
    s = utfør(s, { type: "BUD", spiller: budsete, bud: kontrakt }).state;
  } catch {
    return null;
  }
  g = 0;
  while (s.fase === "BUDRUNDE" && g++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  return s.fase === "BUDRUNDE" ? null : s;
}

/** Spiller én tvungen kontrakt med agenten som forsvarer. `lær` = kalibrer. */
function énRunde(genom: Genom | null, frø: number, lær: number): boolean | null {
  const budsete = frø % 4;
  let s = oppsett(frø, budsete);
  if (s === null) return null;
  const nevro = new NevroAgent();
  let g = 0;
  while ((s.fase === "VRAK" || s.fase === "VELG") && g++ < 20) s = utfør(s, nevro.velgHandling(s)).state;
  if (s.fase !== "SPILL") return null;

  const forsvarere = [0, 1, 2, 3].filter((x) => x !== budsete && x !== s!.makker);
  if (forsvarere.length === 0) return null;
  const sete = forsvarere[frø % forsvarere.length]!;

  // genom === null betyr NevroHjerne i forsvarssetet – referansen MÅ måles
  // på de samme giverne, ellers sammenligner vi mot et tall fra et annet
  // frøsett og vet ingenting.
  const agent = genom === null ? new NevroAgent() : new NeatAgent(genom, { læringsrate: 0 });
  agent.nyKamp();
  g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = s.iTur!;
    if (iTur !== sete) {
      s = utfør(s, nevro.velgHandling(s)).state;
      continue;
    }
    if (lær > 0 && agent instanceof NeatAgent) {
      const lov = lovligeHandlinger(s);
      if (lov.fase === "SPILL") agent.lærForsvar(s, sete, lov.kort, lær);
    }
    s = utfør(s, agent.velgHandling(s)).state;
  }
  const res = s.sisteRunde;
  if (res === null) return null;
  return res.lagStikk < kontrakt; // forsvaret lyktes = kontrakten falt
}

/** Overvåkning – EGET frøsett, brukes bare til å se kurven. */
const OVERVAAK_FRO = Number(process.env.OVERVAAK_FRO ?? 2_500_000);
function overvåk(genom: Genom | null, antall: number): { ok: number; n: number } {
  let ok = 0;
  let n = 0;
  for (let f = 0; f < antall * 5 && n < antall; f++) {
    const r = énRunde(genom, OVERVAAK_FRO + f, 0);
    if (r === null) continue;
    n++;
    if (r) ok++;
  }
  return { ok, n };
}

const pst = (a: number, b: number): string => (b === 0 ? "–" : `${Math.round((100 * a) / b)} %`);

console.log(`Forsvarskorreksjon: ${fersk ? "FERSKT genom" : grunnFil}, kontrakt ${kontrakt}, rate ${rate}`);
// Referansen MAA maales paa de samme giverne. Et nevro-tall fra et annet
// froesett sier ingenting om hvor hoeyt lista ligger akkurat her.
const referanse = overvåk(null, 250);
const før = overvåk(grunn, 250);
console.log(`NevroHjerne i samme sete, SAMME givere: feller ${pst(referanse.ok, referanse.n)} (${referanse.ok}/${referanse.n})`);
console.log(`Før: feller kontrakten ${pst(før.ok, før.n)} (${før.ok}/${før.n})`);

const ekspert = klonGenom(grunn);
const rng = lagRng(0xf0f5);
for (let g = 0; g < runder; g++) {
  for (let k = 0; k < 40; k++) énRunde(ekspert, 2_000_000 + Math.floor(rng() * 400_000), rate);
  if ((g + 1) % 50 === 0) {
    const m = overvåk(ekspert, 150);
    console.log(`  runde ${g + 1}: feller ${pst(m.ok, m.n)} (${m.ok}/${m.n})`);
  }
}

const fil = `${utMappe}/ekspert-forsvar.json`;
writeFileSync(fil, genomTilJson(ekspert));
const etter = overvåk(ekspert, 250);
console.log(`\nEtter: feller ${pst(etter.ok, etter.n)} (${etter.ok}/${etter.n}) → ${fil}`);
console.log(`Endring: ${(((etter.ok / etter.n) - (før.ok / før.n)) * 100).toFixed(1)} prosentpoeng` +
  `   (NevroHjerne ${pst(referanse.ok, referanse.n)} paa samme givere)`);
console.log(`\nEndelig dom kjøres separat på URØRTE frø:\n  node examples/senat-maal.ts trening-d5/gull.json --eksperter ${utMappe} --kamper 700 --kontrakter 9`);
