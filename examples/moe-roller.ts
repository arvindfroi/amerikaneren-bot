/**
 * Rolle-eksperter: én spesialist per ROLLE, med sterke medspillere.
 *
 *   node examples/moe-roller.ts bidrag/d5-adoptert.json --rolle budvinner --bud 9 --gen 200
 *   node examples/moe-roller.ts bidrag/d5-adoptert.json --rolle makker --gen 200
 *   node examples/moe-roller.ts bidrag/d5-adoptert.json --rolle forsvar --gen 200
 *
 * Forrige forsøk (moe-spesialist.ts) ga nesten ingenting, og målingen viste
 * hvorfor: snitt lagstikk var 7,2 uansett om kontrakten var 8, 9 eller 10.
 * To grunner, begge adressert her:
 *
 *  1. MEDSPILLERNE VAR KOPIER av det samme svake genomet. En spillefører
 *     kan ikke lære å føre en kontrakt hjem når makkeren kaster den bort.
 *     Her er de tre andre setene NevroHjerne – som bare ser lovlig
 *     informasjon (ingen kikking i kortene), men spiller ~1,6 stikk bedre.
 *     Da er det spesialistens EGNE valg som avgjør utfallet, og læresignalet
 *     peker på dem.
 *  2. FOR LITE TRENING. 30 runder à 50 kontrakter er ~1500 hender; kurvene
 *     viste at spesialistene lærte på treningsdataene men ikke generaliserte.
 *     Standard her er 200 runder, og målingen skjer på et FAST, adskilt
 *     frøsett som aldri brukes til trening.
 *
 * ROLLENE, hver med sitt eget belønningssignal:
 *  - budvinner: agenten har kontrakten. Belønnes for å klare den.
 *  - makker:    agenten holder det etterlyste kortet. Samme mål (kontrakten
 *               skal hjem), men fra en helt annen posisjon – makkeren skal
 *               støtte, ikke føre.
 *  - forsvar:   agenten forsvarer. Belønnes for at kontrakten FALLER.
 *               Motsatt fortegn av de to andre, og derfor en egen ekspert.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { lagRng, type Kort } from "../src/kort.ts";
import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { genomFraJson, klonGenom, NeatAgent, type Genom } from "../src/neat/index.ts";
import { besteTrumf, NevroAgent } from "../src/nevro/index.ts";

type Rolle = "budvinner" | "makker" | "forsvar";

const filer: string[] = [];
let rolle: Rolle = "budvinner";
let bud = 9;
let generasjoner = 200;
let kamperPerGen = 40;
let målKamper = 250;
let utMappe = "moe";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--rolle") rolle = process.argv[++i] as Rolle;
  else if (a === "--bud") bud = Number(process.argv[++i]);
  else if (a === "--gen") generasjoner = Number(process.argv[++i]);
  else if (a === "--kamper") kamperPerGen = Number(process.argv[++i]);
  else if (a === "--maal") målKamper = Number(process.argv[++i]);
  else if (a === "--ut") utMappe = process.argv[++i] ?? utMappe;
  else filer.push(a);
}
const grunnFil = filer[0] ?? "bidrag/d5-adoptert.json";
const rå = JSON.parse(readFileSync(grunnFil, "utf8")) as { genom?: unknown };
const grunn: Genom = genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(grunnFil, "utf8"));
mkdirSync(utMappe, { recursive: true });

/**
 * Bygger en runde med tvungen kontrakt `bud` hos `budsete`. Returnerer null
 * hvis hånden er for svak eller budet ulovlig i stillingen.
 */
function oppsett(frø: number, budsete: number, kontrakt: number): GameState | null {
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  let guard = 0;
  while (s.fase === "BUDRUNDE" && s.iTur !== budsete && guard++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  if (s.fase !== "BUDRUNDE" || s.iTur !== budsete) return null;
  const { estimat } = besteTrumf(s.hender[budsete] ?? []);
  if (estimat < kontrakt - 3.5) return null;
  try {
    s = utfør(s, { type: "BUD", spiller: budsete, bud: kontrakt }).state;
  } catch {
    return null;
  }
  guard = 0;
  while (s.fase === "BUDRUNDE" && guard++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  return s.fase === "BUDRUNDE" ? null : s;
}

/**
 * Spiller en runde der agenten har `rolle`. De tre andre setene er
 * NevroHjerne – sterke medspillere OG motstandere som kun ser lovlig
 * informasjon. Returnerer utfallet sett fra agentens rolle.
 */
function spill(
  genom: Genom,
  frø: number,
  kontrakt: number,
  lærRate: number,
): { suksess: boolean; lagStikk: number } | null {
  const budsete = frø % 4;
  const start = oppsett(frø, budsete, kontrakt);
  if (start === null) return null;

  // Hvor sitter agenten? Makkeren er den som holder det etterlyste kortet,
  // og den er kjent i tilstanden (state.makker) etter VELG – men vi må vite
  // det FØR spillet. Derfor spilles VRAK/VELG først av nevro, så plasseres
  // agenten. For budvinner og forsvar er setet kjent med en gang.
  const nevro = new NevroAgent();
  let s = start;
  let guard = 0;
  while ((s.fase === "VRAK" || s.fase === "VELG") && guard++ < 20) {
    s = utfør(s, nevro.velgHandling(s)).state;
  }
  if (s.fase !== "SPILL") return null;

  let agentSete: number;
  if (rolle === "budvinner") agentSete = budsete;
  else if (rolle === "makker") {
    if (s.makker === null || s.makker === budsete) return null;
    agentSete = s.makker;
  } else {
    // Forsvarer: et sete som verken er budvinner eller makker.
    const kandidater = [0, 1, 2, 3].filter((p) => p !== budsete && p !== s.makker);
    if (kandidater.length === 0) return null;
    agentSete = kandidater[frø % kandidater.length]!;
  }

  const agent = new NeatAgent(genom, { læringsrate: 0 });
  agent.nyKamp();
  const spilte: { state: GameState; kort: Kort }[] = [];
  guard = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && guard++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    const h = iTur === agentSete ? agent.velgHandling(s) : nevro.velgHandling(s);
    if (iTur === agentSete && h.type === "SPILL") spilte.push({ state: s, kort: h.kort });
    s = utfør(s, h).state;
  }
  const res = s.sisteRunde;
  if (res === null) return null;
  const klart = res.lagStikk >= kontrakt;
  // Forsvareren lykkes når kontrakten FALLER – motsatt fortegn.
  const suksess = rolle === "forsvar" ? !klart : klart;

  if (lærRate > 0 && spilte.length > 0) {
    // Gradert forsterkning: hvor nær kom vi målet? For budlaget er det
    // stikkene mot kontrakten; for forsvaret er det hvor mye vi holdt dem
    // UNDER den. Nær-treff fortjener nesten full forsterkning – ellers
    // lærer vi bare av de sjeldne fulltrefferne (målt: da skjedde ingenting).
    const avstand = rolle === "forsvar" ? kontrakt - res.lagStikk : res.lagStikk - kontrakt;
    const nærhet = Math.max(0, Math.min(1, (avstand + 4) / 4));
    const rate = lærRate * (suksess ? 1 : nærhet * 0.5);
    if (rate > 1e-4) for (const { state, kort } of spilte) agent.lærSpill(state, agentSete, kort, rate);
  }
  return { suksess, lagStikk: res.lagStikk };
}

/** Måler på et FAST frøsett som aldri brukes i trening. */
function mål(genom: Genom, antall: number): { suksess: number; n: number; snittStikk: number } {
  let suksess = 0;
  let n = 0;
  let sumStikk = 0;
  for (let f = 0; f < antall * 5 && n < antall; f++) {
    const r = spill(genom, 880_000 + f, bud, 0);
    if (r === null) continue;
    if (r.suksess) suksess++;
    sumStikk += r.lagStikk;
    n++;
  }
  return { suksess, n, snittStikk: n === 0 ? NaN : sumStikk / n };
}

console.log(`Rolle-ekspert: ${rolle}, kontrakt ${bud}, grunnlag ${grunnFil}`);
console.log(`Medspillere/motstandere: NevroHjerne (kun lovlig informasjon)\n`);

const før = mål(grunn, målKamper);
console.log(
  `Før trening: ${før.n === 0 ? "–" : `${Math.round((100 * før.suksess) / før.n)} %`} ` +
    `(${før.suksess}/${før.n}), snitt lagstikk ${før.snittStikk.toFixed(2)}`,
);

const ekspert = klonGenom(grunn);
const rng = lagRng((0xe0 + bud + rolle.length) >>> 0);
console.log(`\nTrener ${generasjoner} runder à ${kamperPerGen} hender …`);
for (let g = 0; g < generasjoner; g++) {
  let ok = 0;
  let n = 0;
  for (let k = 0; k < kamperPerGen; k++) {
    const frø = 900_000 + Math.floor(rng() * 400_000);
    const r = spill(ekspert, frø, bud, 0.03);
    if (r === null) continue;
    if (r.suksess) ok++;
    n++;
  }
  if ((g + 1) % 40 === 0) {
    const m = mål(ekspert, 120);
    console.log(
      `  runde ${g + 1}: trening ${n === 0 ? "–" : `${Math.round((100 * ok) / n)} %`}, ` +
        `MÅLT ${m.n === 0 ? "–" : `${Math.round((100 * m.suksess) / m.n)} %`} (${m.suksess}/${m.n}), ` +
        `stikk ${m.snittStikk.toFixed(2)}`,
    );
  }
}

const fil = `${utMappe}/ekspert-${rolle}${rolle === "budvinner" ? `-${bud}` : ""}.json`;
writeFileSync(fil, JSON.stringify(ekspert));
const etter = mål(ekspert, målKamper);
console.log(
  `\nEtter trening: ${etter.n === 0 ? "–" : `${Math.round((100 * etter.suksess) / etter.n)} %`} ` +
    `(${etter.suksess}/${etter.n}), snitt lagstikk ${etter.snittStikk.toFixed(2)} → ${fil}`,
);
console.log(
  `Endring: ${(((100 * etter.suksess) / Math.max(1, etter.n) - (100 * før.suksess) / Math.max(1, før.n))).toFixed(1)} ` +
    `prosentpoeng, ${(etter.snittStikk - før.snittStikk).toFixed(2)} stikk`,
);
