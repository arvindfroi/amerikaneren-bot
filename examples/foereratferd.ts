/**
 * HVA GJØR ORAKELET SOM VI IKKE GJØR — i spillefører­setet.
 *
 *   node examples/foereratferd.ts 17000000 400 analyse/foereratferd.json
 *
 * BAKGRUNN. Med korrekt rollout-policy slår SD-orakelet nettet med
 * +0,896 ± 0,418 i førersetet (`ork:`-benken, 3. august), mens det er nøytralt
 * som makker og negativt som forsvarer. Operatoren griper BARE inn i
 * `fase === "SPILL"` — bud, vrak og trumfvalg er urørt i begge armer — så hele
 * forskjellen ligger i kortvalgene til spillefører.
 *
 * DENNE MÅLINGEN SIER HVOR. For hver førerbeslutning med reelt valg regnes
 * orakelets kort og nettets kort i NØYAKTIG samme stilling, og uenighetene
 * karakteriseres langs aksene som kan handles på:
 *
 *   NÅR   stikknummer, posisjon i stikket, har jeg utspillet
 *   HVA   høyere eller lavere kort, trumf eller ikke, vinner stikket eller ikke
 *
 * VEKTET PÅ MARGIN. En uenighet der orakelet er marginalt bedre betyr lite;
 * en der det er sikkert betyr mye. `sdpar.ts` gir den parrede marginen og
 * dens SE, så uenighetene kan skilles i «sikre» (σ ≥ 2) og resten. Uten det
 * ville tabellen vært dominert av valg der begge har rett.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { lagRng, type Farge, type Kort } from "../src/kort.ts";
import { lovligeKort, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { vurderPar } from "../src/moe2/sdpar.ts";
import { lagIndre, ADAMS, tall } from "../src/moe2/agentspek.ts";

const FRØ0 = tall(process.argv[2], 17_000_000, "argv[2]");
const RUNDER = tall(process.argv[3], 400, "argv[3]");
const UT = process.argv[4] ?? "analyse/foereratferd.json";
const VERDENER = tall(process.argv[5], 12, "argv[5]");
// HARDKODET til ftf1.bin fram til 5. august – et helt annet nett enn det
// utrullede. Nå den kanoniske stakken, og overstyrbar fra kommandolinja.
const SPEK = process.argv[4] ?? ADAMS;



function slår(a: Kort, b: Kort, ledet: Farge, trumf: Farge | null): boolean {
  const aT = trumf !== null && a.farge === trumf;
  const bT = trumf !== null && b.farge === trumf;
  if (aT !== bT) return aT;
  if (aT && bT) return a.verdi > b.verdi;
  if ((a.farge === ledet) !== (b.farge === ledet)) return a.farge === ledet;
  if (a.farge !== ledet) return false;
  return a.verdi > b.verdi;
}

type Uenighet = {
  stikk: number;
  posisjon: number;
  utspill: boolean;
  sigma: number;
  margin: number;
  /** Orakelets kort minus nettets, i rang. */
  rangDiff: number;
  orakelTrumf: boolean;
  nettTrumf: boolean;
  orakelVinner: boolean;
  nettVinner: boolean;
};

const agent = lagIndre(SPEK);
// Rollout-policyen MÅ være den samme sterke boten som sitter ved bordet.
// Med NevroHjerne her måler man et feilspesifisert orakel – det var nettopp
// feilen som ga −0,357 i stedet for +0,896.
const motpart = lagIndre(SPEK);
const rng = lagRng(20_260_805);

let beslutninger = 0;
let vurdert = 0;
let enige = 0;
const uenige: Uenighet[] = [];

for (let i = 0; i < RUNDER; i++) {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, FRØ0 + i * 3931);
  agent.nyKamp();
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 600) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    const h = agent.velgHandling(s);

    if (s.fase === "SPILL" && s.iTur !== null && s.iTur === s.budvinner) {
      const sete = s.iTur;
      const lovlige = lovligeKort(s, sete);
      if (lovlige.length >= 2) {
        beslutninger++;
        const par = vurderPar(s, sete, motpart, { verdener: VERDENER, rng });
        if (par !== null) {
          vurdert++;
          const nettKort = (h as Handling & { kort: Kort }).kort;
          const ork = par.beste.kort;
          const lik = ork.farge === nettKort.farge && ork.verdi === nettKort.verdi;
          if (lik) enige++;
          else {
            const ledet = s.bord[0]?.kort.farge ?? ork.farge;
            const leder = s.bord.reduce<{ spiller: number; kort: Kort } | null>(
              (b, kp) => (b === null || slår(kp.kort, b.kort, ledet, s.trumf) ? kp : b),
              null,
            );
            const vinner = (k: Kort): boolean =>
              leder === null ? true : slår(k, leder.kort, ledet, s.trumf);
            uenige.push({
              stikk: s.stikkSpilt,
              posisjon: s.bord.length,
              utspill: s.bord.length === 0,
              sigma: par.sigma,
              margin: par.margin,
              rangDiff: ork.verdi - nettKort.verdi,
              orakelTrumf: s.trumf !== null && ork.farge === s.trumf,
              nettTrumf: s.trumf !== null && nettKort.farge === s.trumf,
              orakelVinner: vinner(ork),
              nettVinner: vinner(nettKort),
            });
          }
        }
      }
    }
    s = utfør(s, h).state;
  }
}

const sikre = uenige.filter((u) => u.sigma >= 2);
const andel = (a: number, b: number): number => (b > 0 ? a / b : Number.NaN);
const snitt = (xs: number[]): number =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.NaN;

function profil(u: Uenighet[]): Record<string, number> {
  return {
    n: u.length,
    snittRangDiff: snitt(u.map((x) => x.rangDiff)),
    andelHoyere: andel(u.filter((x) => x.rangDiff > 0).length, u.length),
    orakelTrumfOftere: andel(u.filter((x) => x.orakelTrumf && !x.nettTrumf).length, u.length),
    nettTrumfOftere: andel(u.filter((x) => x.nettTrumf && !x.orakelTrumf).length, u.length),
    orakelVinnerOftere: andel(u.filter((x) => x.orakelVinner && !x.nettVinner).length, u.length),
    nettVinnerOftere: andel(u.filter((x) => x.nettVinner && !x.orakelVinner).length, u.length),
    andelUtspill: andel(u.filter((x) => x.utspill).length, u.length),
    snittMargin: snitt(u.map((x) => x.margin)),
  };
}

const perStikk: Record<number, { n: number; sikre: number; totalt: number }> = {};
for (const u of uenige) {
  perStikk[u.stikk] ??= { n: 0, sikre: 0, totalt: 0 };
  perStikk[u.stikk]!.n++;
  if (u.sigma >= 2) perStikk[u.stikk]!.sikre++;
}

const rapport = {
  spek: SPEK,
  verdener: VERDENER,
  runder: RUNDER,
  beslutninger,
  vurdert,
  enige,
  enighetsandel: andel(enige, vurdert),
  alle: profil(uenige),
  sikre: profil(sikre),
  perStikk,
};

mkdirSync(dirname(UT), { recursive: true });
writeFileSync(UT, JSON.stringify(rapport, null, 2), "utf-8");

console.log(`Foererbeslutninger med valg: ${beslutninger}, vurdert: ${vurdert}`);
console.log(`Enige: ${enige} (${(rapport.enighetsandel * 100).toFixed(1)} %)`);
console.log(`Uenige: ${uenige.length}, hvorav sikre (sigma>=2): ${sikre.length}\n`);
for (const [navn, p] of [
  ["ALLE UENIGHETER", rapport.alle],
  ["SIKRE UENIGHETER", rapport.sikre],
] as const) {
  console.log(`${navn} (n=${p.n})`);
  console.log(`  orakelets kort er hoeyere i          ${(p.andelHoyere * 100).toFixed(1)} % (snitt rangdiff ${p.snittRangDiff.toFixed(2)})`);
  console.log(`  orakelet spiller TRUMF, nettet ikke  ${(p.orakelTrumfOftere * 100).toFixed(1)} %`);
  console.log(`  nettet spiller TRUMF, orakelet ikke  ${(p.nettTrumfOftere * 100).toFixed(1)} %`);
  console.log(`  orakelet VINNER stikket, nettet ikke ${(p.orakelVinnerOftere * 100).toFixed(1)} %`);
  console.log(`  nettet VINNER stikket, orakelet ikke ${(p.nettVinnerOftere * 100).toFixed(1)} %`);
  console.log(`  andel i utspillsposisjon             ${(p.andelUtspill * 100).toFixed(1)} %`);
  console.log(`  snittmargin                          ${p.snittMargin.toFixed(3)}\n`);
}
console.log("UENIGHETER PER STIKK");
for (const k of Object.keys(perStikk).map(Number).sort((a, b) => a - b)) {
  const v = perStikk[k]!;
  console.log(`  stikk ${String(k).padStart(2)}: ${String(v.n).padStart(4)} uenige, ${String(v.sikre).padStart(3)} sikre`);
}
console.log(`\nSkrevet til ${UT}`);
