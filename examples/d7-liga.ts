/**
 * D7 – LIGA MED ELO SOM FITNESS.
 *
 *   node examples/d7-liga.ts --fra d7/fro-d5-klar.json --popp 96 --dir trening-d7
 *
 * Arvinds omlegging: bort fra cuprunder, over til liga, med Elo som fitness.
 * Begrunnelsen er målt gjennom natten – cupdybden er ETT knockout-utfall per
 * generasjon med stor kortflaks, mens en liga gir hvert genom mange bord mot
 * mange motstandere, og Elo vekter etter hvem man møtte.
 *
 * HVA SOM ER MED FRA NATTENS ARBEID:
 *  - normalisert NEAT: mutasjon OG kalibrering endrer retning, aldri skala,
 *    så nettet kan ikke mette seg (test: 3000 kalibreringssteg, ingen drift)
 *  - flerspiller-Elo med arvet rating, så nivået bæres på tvers av
 *    generasjoner i stedet for å nullstilles slik cupdybden gjorde
 *  - felles givere: alle bord i en generasjon spiller SAMME giver-frø
 *  - frøene er avmettet i beslutningshodene og verifisert lærbare
 *
 * HVA SOM IKKE ER MED ENDA, og som er neste steg:
 *  - to uavhengige populasjoner (budgivere og spillere) med rotert paring
 *  - DD-forankret budfasit i stedet for rollout mot egen spillestyrke
 *  - vekting av giv etter std(SD), så skjeve giv dømmes mildere
 * Dette er altså D7s FUNDAMENT: ligaen og ratingen. Resten bygges oppå.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { lagRng } from "../src/kort.ts";
import { Evolusjon, genomFraJson, genomTilJson, NeatAgent, type Genom } from "../src/neat/index.ts";
import { spillGruppekamp } from "../src/neat/turnering.ts";
import { dommenOverBarnet, STANDARD_RATER } from "../src/neat/genom.ts";
import { andelerFraPoeng, nyRating, oppdaterBord, type Rating } from "../src/neat/elo.ts";
import { NevroAgent } from "../src/nevro/index.ts";

let popp = 96;
let generasjoner = 100000;
let dir = "trening-d7";
let fraFil: string | null = null;
let bordPerGen = 3;
let evoFrø = 0xd7;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--popp") popp = Number(process.argv[++i]);
  else if (a === "--gen") generasjoner = Number(process.argv[++i]);
  else if (a === "--dir") dir = process.argv[++i]!;
  else if (a === "--fra") fraFil = process.argv[++i]!;
  else if (a === "--bord") bordPerGen = Number(process.argv[++i]);
  else if (a === "--fro") evoFrø = Number(process.argv[++i]);
}
mkdirSync(dir, { recursive: true });

let startGenom: Genom | undefined;
if (fraFil !== null) {
  const rå = JSON.parse(readFileSync(fraFil, "utf8")) as { genom?: unknown };
  startGenom = genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(fraFil, "utf8"));
}
/**
 * FASIT-LAERING PAA. Uten dette ville ligaen vaert et rent mutasjonssoek, og
 * hele metningsarbeidet - normaliseringen, bevarLengde, den funksjonelle
 * vakten - ville aldri blitt utoevd. Det var noeyaktig feilen i foerste
 * lansering: vi fikset at laeringen kan feste, og startet saa en linje uten
 * laering.
 *
 * Dosene er de D6 kjoerte med, som er de eneste vi har maalt: trumffasit ga
 * +20,4 +- 4,4, og dosesveipet viste at MER ikke er bedre (1500 runder
 * daarligere enn 600 paa samme rate).
 */
const KAMP = {
  maksRunder: 12,
  spillFasit: { sjanse: 0.35, rate: 0.05, dybde: 1 },
  budFasit: { sjanse: 0.5, rate: 0.05 },
  trumfFasit: { sjanse: 0.5, rate: 0.05 },
  etterlysFasit: { sjanse: 0.6, rate: 0.05 },
  vrakFasit: { sjanse: 0.6, rate: 0.05 },
  stikkFasit: { sjanse: 0.25, rate: 0.05 },
} as const;

const evo = new Evolusjon({
  populasjon: popp,
  frø: evoFrø,
  startGenom,
  // BEVIST MUTERING: barnet arver forelderens retning og gaar videre samme
  // vei; dommenOverBarnet snur den naar skrittet var galt.
  rater: { ...STANDARD_RATER, bevist: true },
});
const rng = lagRng(evoFrø ^ 0x11a6a);

/** Rating per plass i populasjonen. Mesteren staar alltid paa plass 0. */
let ratinger: Rating[] = Array.from({ length: popp }, () => nyRating());

const stokk = (n: number): number[] => {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = t;
  }
  return idx;
};

/**
 * EKSTERN BENK mot NevroHjerne, skrevet til `trening-<dir>.log` i repo-rota
 * i noeyaktig det formatet neat-graf.ts alt parser. Elo er intern og ikke
 * sammenlignbar mellom skaar - grafen trenger et absolutt tall.
 */
function benk(g: Genom, kamper = 24): { egne: number; nevro: number; seire: number } {
  let egne = 0;
  let nevro = 0;
  let seire = 0;
  for (let k = 0; k < kamper; k++) {
    const agenter = [
      new NeatAgent(g, { læringsrate: 0 }),
      new NevroAgent(),
      new NevroAgent(),
      new NevroAgent(),
    ];
    const res = spillGruppekamp(agenter, 8_000_000 + k, { maksRunder: 12 });
    egne += res.poeng[0] ?? 0;
    const andre = ((res.poeng[1] ?? 0) + (res.poeng[2] ?? 0) + (res.poeng[3] ?? 0)) / 3;
    nevro += andre;
    if ((res.poeng[0] ?? 0) > andre) seire++;
  }
  return { egne: egne / kamper, nevro: nevro / kamper, seire };
}

const NL = String.fromCharCode(10);
const logg: string[] = [];
const si = (s: string): void => {
  console.log(s);
  logg.push(s);
  if (logg.length % 5 === 0) writeFileSync(`${dir}/liga.log`, logg.join("\n") + "\n");
};

si(`D7-liga: populasjon ${popp}, ${bordPerGen} bordrunder/generasjon, fra ${fraFil ?? "ferskt"}`);

for (let g = 0; g < generasjoner; g++) {
  // Hver bordrunde: stokk hele feltet, del i bord à 4, spill SAMME giver-froe
  // ved alle bord (flakskontroll), og oppdater Elo fra poengdifferansen.
  for (let r = 0; r < bordPerGen; r++) {
    const rekke = stokk(evo.genomer.length);
    const giverFrø = Math.floor(rng() * 1_000_000);
    for (let b = 0; b + 3 < rekke.length; b += 4) {
      const idx = [rekke[b]!, rekke[b + 1]!, rekke[b + 2]!, rekke[b + 3]!];
      const agenter = idx.map((i) => new NeatAgent(evo.genomer[i]!, { læringsrate: 0 }));
      const res = spillGruppekamp(agenter, giverFrø, KAMP);
      oppdaterBord(
        idx.map((i) => ratinger[i]!),
        andelerFraPoeng(res.poeng),
      );
    }
  }

  const fitness = ratinger.map((r) => r.rating);
  // DOMMEN OVER BARNET: skrittlengden vokser naar ratingen steg, krymper og
  // snur retningen naar den falt. Det er andre halvdel av bevist mutering -
  // uten dette kallet er muterRettet bare tilfeldig gange med momentum.
  for (let i = 0; i < evo.genomer.length; i++) dommenOverBarnet(evo.genomer[i]!, fitness[i]!);
  const beste = fitness.indexOf(Math.max(...fitness));
  const mesterRating = ratinger[beste]!.rating;

  if ((g + 1) % 10 === 0) {
    const snitt = fitness.reduce((a, b) => a + b, 0) / fitness.length;
    const spredning = Math.sqrt(
      fitness.reduce((a, b) => a + (b - snitt) * (b - snitt), 0) / fitness.length,
    );
    si(
      `gen ${String(g + 1).padStart(5)}: beste ${mesterRating.toFixed(0)}, snitt ${snitt.toFixed(0)}, ` +
        `spredning ${spredning.toFixed(0)}, koblinger ${evo.genomer[beste]!.koblinger.length}`,
    );
    writeFileSync(`${dir}/mester.json`, genomTilJson(evo.genomer[beste]!));
    writeFileSync(
      `${dir}/status.json`,
      // `tidsstempel` er IKKE pynt: grafen regner hjerteslaget fra det, og en
      // linje uten hjerteslag faller ut av «levende» og graes ut som pensjonert.
      JSON.stringify({
        generasjon: g + 1,
        tidsstempel: Date.now(),
        rating: mesterRating,
        populasjon: popp,
        koblinger: evo.genomer[beste]!.koblinger.length,
      }),
    );
  }

  // Ekstern benk med jevne mellomrom: grafen leser denne, og den er det
  // eneste tallet som er sammenlignbart paa tvers av skaar.
  if (g + 1 === 10 || (g + 1) % 25 === 0) {
    const b = benk(evo.genomer[beste]!);
    // FORMATET ER IKKE FRITT. neat-graf.ts leser generasjonen fra en EGEN
    // linje som starter med «gen N:», og knytter den neste benk-linja til
    // den. Skrev vi «[gen N] benk vs nevro: ...» paa én linje – slik det
    // stod foer – matchet generasjonsregexen aldri, og hvert eneste D7-punkt
    // ble stille forkastet av grafen.
    const linjer =
      `gen ${g + 1}: rating ${mesterRating.toFixed(0)} pop ${popp}` +
      NL +
      `benk vs nevro: mester ${b.egne.toFixed(1)} poeng/kamp, ` +
      `nevro ${b.nevro.toFixed(1)}, seire ${b.seire}/24`;
    si(linjer);
    appendFileSync(`${dir}.log`, linjer + NL);
  }

  evo.nesteGenerasjonMed(fitness);

  // Rating arves: mesteren beholder sin, barna starter paa feltets SNITT med
  // null kamper (hoey K). Uten arv ville ratingen nullstilles hver generasjon
  // og baere like lite informasjon som cupdybden gjorde.
  const snitt = fitness.reduce((a, b) => a + b, 0) / fitness.length;
  const forrigeMester: Rating = { rating: mesterRating, kamper: ratinger[beste]!.kamper };
  ratinger = evo.genomer.map((_, i) =>
    i === 0 ? forrigeMester : nyRating({ rating: snitt, kamper: 0 }),
  );
}
