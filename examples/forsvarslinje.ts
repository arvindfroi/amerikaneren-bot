/**
 * FORSVARSLINJA – fersk populasjon som ALDRI gjør annet enn å forsvare.
 *
 *   node examples/forsvarslinje.ts --popp 64 --gen 400 --dir trening-f1
 *
 * Arvinds forslag, og begrunnelsen er målt: et ferskt, utrent genom
 * forsvarer like godt som D5 etter 250 generasjoner i cupen (14 % mot 12 %).
 * Cupen har altså ikke bygget forsvarsspill i det hele tatt – den måler
 * budgivning, vraking, trumfvalg og tre roller på én gang, og forsvaret
 * drukner. Forrige forsøk gikk motsatt vei: en håndskrevet fasit per
 * kortvalg (lærForsvar) gjorde nettopp de atferdene den siktet på VERRE,
 * fordi den dyttet n−1 kort ned for hvert kort den dyttet opp.
 *
 * Her spesifiseres ingen kortvalg. Fitness er de to tingene Arvind ba om,
 * og ingenting mer:
 *
 *   1. FALT KONTRAKTEN?   – forsvarets faktiske oppgave
 *   2. EGNE STIKK         – hvert stikk er +1 poeng OG et stikk budlaget
 *                           ikke får, så det er ikke et sidemål
 *
 * Alt annet – hvilket kort, når man trumfer, hvordan man samspiller med
 * medforsvareren – overlates til seleksjonen. Hele sensorsettet er
 * tilgjengelig (ANTALL_INN), inkludert håndvurderings- og sekvenssensorene.
 *
 * FLAKSKONTROLL: alle genomer i en generasjon spiller NØYAKTIG de samme
 * giverne med samme tvungne kontrakt og samme forsvarssete. Giverne rullerer
 * mellom generasjoner, så linja ikke pugger et fast sett.
 *
 * FRØHYGIENE:
 *   trening       3 000 000+ (rullerer per generasjon)
 *   overvåkning   2 500 000+ (fast, kun for kurven)
 *   endelig dom   1 400 000+ via senat-maal.ts – RØRES ALDRI HER
 */

import { mkdirSync, writeFileSync } from "node:fs";

import { lagRng } from "../src/kort.ts";
import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { Evolusjon, genomTilJson, NeatAgent, type Genom } from "../src/neat/index.ts";
import { besteTrumf, NevroAgent } from "../src/nevro/index.ts";

let popp = 64;
let generasjoner = 400;
let dir = "trening-f1";
let giverePerGen = 24;
let stikkVekt = 1.0;
// Flere skaar med ULIKE froe kjoeres som egne prosesser. Det gir bade
// parallellitet uten traadkode OG uavhengige replikater - noedvendig i et
// domene der felle-raten svinger 10pp mellom froesett ved n=250.
let evoFrø = 0xf0f5;
/**
 * PAR: begge forsvarssetene spilles av SAMME genom.
 *
 * Arvind spurte hvem den egentlig spiller mot, og det avdekket at
 * medforsvareren ogsaa var NevroHjerne. Genomet laerte dermed aa tilpasse
 * seg nevros forsvarsstil, ikke aa samspille med sin egen sort. To
 * koordinerte forsvarere er et annet – og sterkere – spill enn én god
 * forsvarer ved siden av en fremmed.
 *
 * Referansen er allerede nevro i BEGGE forsvarssetene, saa med --par blir
 * sammenligningen genompar mot nevropar, som er den ærlige varianten.
 */
let par = false;
/** Hvor mange toppgenomer som bedoemmes paa nytt foer mesteren kaares. */
const FINALISTER = 8;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--popp") popp = Number(process.argv[++i]);
  else if (a === "--gen") generasjoner = Number(process.argv[++i]);
  else if (a === "--dir") dir = process.argv[++i]!;
  else if (a === "--givere") giverePerGen = Number(process.argv[++i]);
  else if (a === "--stikkvekt") stikkVekt = Number(process.argv[++i]);
  else if (a === "--fro") evoFrø = Number(process.argv[++i]);
  else if (a === "--par") par = true;
}
mkdirSync(dir, { recursive: true });

/** En ferdig oppsatt forsvarsstilling: hvem forsvarer, mot hvilken kontrakt. */
interface Stilling {
  readonly start: GameState;
  readonly sete: number;
  /** Det ANDRE forsvarssetet – spilles av samme genom naar --par er paa. */
  readonly medsete: number | null;
  readonly kontrakt: number;
}

/** Tvinger kontrakt `k` hos `budsete` og spiller vrak/trumfvalg med nevro. */
function byggStilling(frø: number, k: number): Stilling | null {
  const budsete = frø % 4;
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  let g = 0;
  while (s.fase === "BUDRUNDE" && s.iTur !== budsete && g++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  if (s.fase !== "BUDRUNDE" || s.iTur !== budsete) return null;
  if (besteTrumf(s.hender[budsete] ?? []).estimat < k - 3.5) return null;
  try {
    s = utfør(s, { type: "BUD", spiller: budsete, bud: k }).state;
  } catch {
    return null;
  }
  g = 0;
  while (s.fase === "BUDRUNDE" && g++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  if (s.fase === "BUDRUNDE") return null;
  const nevro = new NevroAgent();
  g = 0;
  while ((s.fase === "VRAK" || s.fase === "VELG") && g++ < 20) s = utfør(s, nevro.velgHandling(s)).state;
  if (s.fase !== "SPILL") return null;
  const forsvarere = [0, 1, 2, 3].filter((x) => x !== budsete && x !== s.makker);
  if (forsvarere.length === 0) return null;
  const sete = forsvarere[frø % forsvarere.length]!;
  const medsete = forsvarere.find((x) => x !== sete) ?? null;
  return { start: s, sete, medsete, kontrakt: k };
}

/** Bygger `antall` stillinger fra og med `fraFrø`, med varierende kontrakt. */
function byggSett(fraFrø: number, antall: number): Stilling[] {
  const ut: Stilling[] = [];
  for (let f = 0; ut.length < antall && f < antall * 40; f++) {
    // Kontraktene varierer så linja ikke blir en 9-spesialist.
    const k = 8 + ((fraFrø + f) % 3);
    const st = byggStilling(fraFrø + f, k);
    if (st !== null) ut.push(st);
  }
  return ut;
}

/** Spiller ut én ferdig stilling. Returnerer forsvarets to måltall. */
function spillUt(genom: Genom | null, st: Stilling): { falt: boolean; egneStikk: number } {
  const agent = genom === null ? new NevroAgent() : new NeatAgent(genom, { læringsrate: 0 });
  agent.nyKamp();
  const nevro = new NevroAgent();
  // Med --par sitter samme genom i BEGGE forsvarssetene, som to egne
  // instanser (ingen delt hukommelse – de ser bare hverandres kort paa
  // bordet, akkurat som to spillere ville gjort).
  const medagent =
    par && st.medsete !== null
      ? genom === null
        ? new NevroAgent()
        : new NeatAgent(genom, { læringsrate: 0 })
      : null;
  medagent?.nyKamp();

  let s = st.start;
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const i = s.iTur!;
    const velger = i === st.sete ? agent : i === st.medsete && medagent !== null ? medagent : nevro;
    s = utfør(s, velger.velgHandling(s)).state;
  }
  const res = s.sisteRunde;
  if (res === null) return { falt: false, egneStikk: 0 };
  // Med par teller LAGETS stikk, ikke bare det ene setets – det er lagets
  // prestasjon som selekteres.
  const egne =
    (res.stikkVunnet[st.sete] ?? 0) +
    (medagent !== null && st.medsete !== null ? (res.stikkVunnet[st.medsete] ?? 0) : 0);
  return { falt: res.lagStikk < st.kontrakt, egneStikk: egne };
}

/**
 * FITNESS – nøyaktig to ledd, som bestilt.
 *
 * Falt-andelen er hovedsaken; egne stikk er normalisert med antall stikk i
 * runden så de to leddene er i samme størrelsesorden (falt ~0,2, stikk
 * ~2/12 ≈ 0,17). Uten stikkleddet ville et forsvar som feller kontrakten
 * uten selv å ta noe rangert likt med ett som feller den OG scorer – og
 * hvert eget stikk er både +1 til oss og ett budlaget ikke får.
 */
function fitnessFor(genom: Genom | null, sett: readonly Stilling[]): { fit: number; falt: number; stikk: number } {
  let falt = 0;
  let stikk = 0;
  for (const st of sett) {
    const r = spillUt(genom, st);
    if (r.falt) falt++;
    stikk += r.egneStikk;
  }
  const n = sett.length || 1;
  const faltAndel = falt / n;
  const stikkAndel = stikk / n / 12;
  return { fit: faltAndel + stikkVekt * stikkAndel, falt: faltAndel, stikk: stikk / n };
}

const evo = new Evolusjon({ populasjon: popp, frø: evoFrø });
const OVERVAAK = byggSett(2_500_000, 200);
const rng = lagRng(evoFrø ^ 0xd1e5);

const nevroRef = fitnessFor(null, OVERVAAK);
console.log(`Forsvarslinja: populasjon ${popp}, ${giverePerGen} givere/gen, kontrakt 8-10, ${par ? "PAR (begge forsvarssetene)" : "ett sete"}`);
console.log(
  `NevroHjerne paa overvaakningssettet (n=${OVERVAAK.length}): ` +
    `feller ${(nevroRef.falt * 100).toFixed(1)} %, egne stikk ${nevroRef.stikk.toFixed(2)}\n`,
);

let beste: Genom | null = null;
let besteFalt = -1;
for (let g = 0; g < generasjoner; g++) {
  // Nye givere hver generasjon – men de SAMME for alle genomer i den.
  const sett = byggSett(3_000_000 + Math.floor(rng() * 900_000), giverePerGen);
  const fitness = evo.genomer.map((gen) => fitnessFor(gen, sett).fit);

  // VINNERENS FORBANNELSE, målt: med 96 genomer bedømt på 40 givere er
  // argmax det genomet som var HELDIG, ikke det beste – felle-raten er ~0,2,
  // så standardfeilen per genom er ~6pp mens forskjellene vi leter etter er
  // mindre. Første kjøring viste akkurat dette: mesterens overvåkede
  // felle-rate falt 17,0 % -> 12,0 % fra generasjon 10 til 20.
  //
  // De TOPP `FINALISTER` genomene bedømmes derfor på nytt på et eget,
  // ferskt sett før mesteren kåres. Kombinert estimat over ~3x så mange
  // givere gjør kroningen langt mindre tilfeldig, og koster bare
  // FINALISTER x bekreftelsesgivere ekstra utspill.
  const rangert = fitness.map((f, i) => ({ f, i })).sort((a, b) => b.f - a.f);
  const bekreft = byggSett(3_900_000 + Math.floor(rng() * 900_000), giverePerGen * 2);
  for (const { i } of rangert.slice(0, FINALISTER)) {
    const b = fitnessFor(evo.genomer[i]!, bekreft);
    // Vektet snitt over begge sett – flere givere teller mer.
    fitness[i] = (fitness[i]! * sett.length + b.fit * bekreft.length) / (sett.length + bekreft.length);
  }

  evo.nesteGenerasjonMed(fitness);

  if ((g + 1) % 10 === 0) {
    const m = fitnessFor(evo.mester!, OVERVAAK);
    const merke = m.falt > besteFalt ? " *" : "";
    if (m.falt > besteFalt) {
      besteFalt = m.falt;
      beste = evo.mester;
      writeFileSync(`${dir}/ekspert-forsvar.json`, genomTilJson(evo.mester!));
    }
    console.log(
      `gen ${String(g + 1).padStart(4)}: feller ${(m.falt * 100).toFixed(1)} % ` +
        `(nevro ${(nevroRef.falt * 100).toFixed(1)} %), egne stikk ${m.stikk.toFixed(2)} ` +
        `(nevro ${nevroRef.stikk.toFixed(2)})${merke}`,
    );
  }
}

if (beste !== null) {
  console.log(`\nBeste paa overvaakningssettet: feller ${(besteFalt * 100).toFixed(1)} % -> ${dir}/ekspert-forsvar.json`);
  console.log(`Endelig dom paa UROERTE froe:\n  node examples/senat-maal.ts trening-d5/gull.json --eksperter ${dir} --kamper 700 --kontrakter 9`);
}
