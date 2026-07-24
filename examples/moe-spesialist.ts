/**
 * MoE-eksperiment: spesialister som er TVUNGET til et bestemt bud.
 *
 *   node examples/moe-spesialist.ts bidrag/d5-adoptert.json --bud 8,9,10 --gen 40
 *
 * Arvinds idé: lag flere boter fra samme grunnlag, tving hver av dem til å by
 * sitt eget tall (8, 9, 10), plasser dem i stillinger der de HAR vunnet
 * budet, og belønn dem for å klare kontrakten. Hvor gode blir de?
 *
 * Hvorfor det er interessant utover eksperimentet: dagens xT-hode skal
 * estimere «hvor mange stikk tar laget mitt» – en tallverdi som må være
 * riktig kalibrert før budet blir riktig, og som vi har målt er ødelagt
 * (utgang eksakt 0 → alltid bud 6). En MoE snur problemet: hver spesialist
 * lærer bare ÉN ting – «klarer jeg N?» – og budrunden blir et valg mellom
 * dem i stedet for et regnestykke. Ingen kalibrering, bare et argmax over
 * eksperter som kjenner sin egen kontrakt.
 *
 * TRENING: spesialisten spiller runder der den er budvinner med kontrakt N,
 * og korthodet kalibreres på UTFALLET – klarte den kontrakten, dyttes
 * kortene den faktisk spilte opp; falt den, dyttes de ned. Det er ren
 * forsterkning på et signal som er direkte knyttet til oppgaven, i motsetning
 * til kampfitness der ett kortvalg drukner blant 250.
 *
 * MÅLING: innfrielsesrate per kontrakt, mot samme genom uten spesialisering.
 * Stillingene er filtrert til hender der budet er PLAUSIBELT (håndvurderingen
 * må antyde minst N−1,5 stikk), ellers måler vi bare hvor ofte umulige
 * kontrakter faller.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

import { lagRng, type Kort } from "../src/kort.ts";
import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { genomFraJson, klonGenom, NeatAgent, type Genom } from "../src/neat/index.ts";
import { besteTrumf } from "../src/nevro/index.ts";

const filer: string[] = [];
let budliste = [8, 9, 10];
let generasjoner = 40;
let kamperPerGen = 60;
let målKamper = 200;
let utMappe = "moe";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--bud") budliste = process.argv[++i]!.split(",").map(Number);
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
 * Setter opp en runde der `sete` har vunnet budet med `bud`. Alle andre
 * passer, så kontrakten er agentens egen – det er stillingen den skal lære.
 * Returnerer null hvis hånden er for svak til at budet er plausibelt.
 */
function tvungenKontrakt(frø: number, sete: number, bud: number): GameState | null {
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  // Alle før agenten passer.
  let guard = 0;
  while (s.fase === "BUDRUNDE" && s.iTur !== sete && guard++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  if (s.fase !== "BUDRUNDE" || s.iTur !== sete) return null;
  // Plausibilitetsfilter: håndvurderingen må antyde at budet er innen rekkevidde.
  // Filteret må ta høyde for at budvinneren FÅR 4 byttekort og en makker.
  // estimerStikk på de 12 delte kortene undervurderer derfor laget med
  // flere stikk – med terskel bud−1,5 fikk bud 10 null stillinger i det
  // hele tatt. Terskelen er kalibrert slik at ~15–25 % av giverne slipper
  // gjennom: nok til å måle, strengt nok til at budet ikke er absurd.
  const { estimat } = besteTrumf(s.hender[sete] ?? []);
  if (estimat < bud - 3.5) return null;
  try {
    s = utfør(s, { type: "BUD", spiller: sete, bud }).state;
  } catch {
    return null; // budet var ikke lovlig i stillingen
  }
  guard = 0;
  while (s.fase === "BUDRUNDE" && guard++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  return s.fase === "BUDRUNDE" ? null : s;
}

/** Spiller runden ut med agenten i `sete` og de andre som kopier. Klarte den? */
function spillKontrakt(
  genom: Genom,
  frø: number,
  sete: number,
  bud: number,
  lær: number,
): { klart: boolean; lagStikk: number } | null {
  const start = tvungenKontrakt(frø, sete, bud);
  if (start === null) return null;
  const agent = new NeatAgent(genom, { læringsrate: 0 });
  const andre = [0, 1, 2, 3].map(() => new NeatAgent(genom, { læringsrate: 0 }));
  agent.nyKamp();
  // Kortene agenten faktisk spilte – de kalibreres på utfallet.
  const spilte: { state: GameState; kort: Kort }[] = [];
  let s = start;
  let guard = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && guard++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    const h = iTur === sete ? agent.velgHandling(s) : andre[iTur]!.velgHandling(s);
    if (iTur === sete && h.type === "SPILL") spilte.push({ state: s, kort: h.kort });
    s = utfør(s, h).state;
  }
  const res = s.sisteRunde;
  if (res === null) return null;
  const klart = res.lagStikk >= bud;

  void lær;
  void spilte;
  return { klart, lagStikk: res.lagStikk };
}

/** Måler innfrielsesraten for et genom på en fast kontrakt. */
function mål(genom: Genom, bud: number, antall: number, frøBase: number): { klart: number; n: number; snittStikk: number } {
  let klart = 0;
  let n = 0;
  let sumStikk = 0;
  for (let f = 0; f < antall * 4 && n < antall; f++) {
    const r = spillKontrakt(genom, frøBase + f, f % 4, bud, 0);
    if (r === null) continue;
    if (r.klart) klart++;
    sumStikk += r.lagStikk;
    n++;
  }
  return { klart, n, snittStikk: n === 0 ? NaN : sumStikk / n };
}

console.log(`MoE-spesialister fra ${grunnFil}\n`);
console.log("Utgangspunkt (uspesialisert), innfrielse per tvungen kontrakt:");
const før = new Map<number, { klart: number; n: number; snittStikk: number }>();
for (const bud of budliste) {
  const m = mål(grunn, bud, målKamper, 810_000);
  før.set(bud, m);
  console.log(
    `  bud ${bud}: klarte ${m.n === 0 ? "–" : `${Math.round((100 * m.klart) / m.n)} %`} ` +
      `(${m.klart}/${m.n}), snitt lagstikk ${m.snittStikk.toFixed(2)}`,
  );
}

// --- Tren én spesialist per bud ---------------------------------------------
console.log(`\nTrener ${budliste.length} spesialister, ${generasjoner} runder à ${kamperPerGen} kontrakter …`);
for (const bud of budliste) {
  let spesialist = klonGenom(grunn);
  const rng = lagRng((0x5e0 + bud) >>> 0);
  for (let g = 0; g < generasjoner; g++) {
    // Kalibreringen skjer i agenten og skrives tilbake i genomet (lamarckisk),
    // så vi holder ett genom og lar det forbedre seg på oppgaven sin.
    let klarte = 0;
    let n = 0;
    for (let k = 0; k < kamperPerGen; k++) {
      const frø = 830_000 + g * kamperPerGen + k;
      const r = spillKontraktMedLæring(spesialist, frø, Math.floor(rng() * 4), bud);
      if (r === null) continue;
      if (r.klart) klarte++;
      n++;
    }
    if ((g + 1) % 10 === 0) {
      console.log(`  bud ${bud}, runde ${g + 1}: ${n === 0 ? "–" : `${Math.round((100 * klarte) / n)} %`} (${klarte}/${n})`);
    }
  }
  writeFileSync(`${utMappe}/spesialist-${bud}.json`, JSON.stringify(spesialist));
  const m = mål(spesialist, bud, målKamper, 810_000);
  const f = før.get(bud)!;
  console.log(
    `  → bud ${bud} ETTER trening: ${m.n === 0 ? "–" : `${Math.round((100 * m.klart) / m.n)} %`} ` +
      `(${m.klart}/${m.n}), snitt lagstikk ${m.snittStikk.toFixed(2)} ` +
      `(før: ${f.n === 0 ? "–" : `${Math.round((100 * f.klart) / f.n)} %`}, ${f.snittStikk.toFixed(2)})`,
  );
}

/**
 * Som spillKontrakt, men kalibrerer korthodet på utfallet underveis.
 * Skilt ut for lesbarhet – lærer på AGENTENS EGNE trekk (on-policy).
 */
function spillKontraktMedLæring(
  genom: Genom,
  frø: number,
  sete: number,
  bud: number,
): { klart: boolean } | null {
  const start = tvungenKontrakt(frø, sete, bud);
  if (start === null) return null;
  const agent = new NeatAgent(genom, { læringsrate: 0 });
  const andre = [0, 1, 2, 3].map(() => new NeatAgent(genom, { læringsrate: 0 }));
  agent.nyKamp();
  const spilte: { state: GameState; kort: Kort }[] = [];
  let s = start;
  let guard = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && guard++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    const h = iTur === sete ? agent.velgHandling(s) : andre[iTur]!.velgHandling(s);
    if (iTur === sete && h.type === "SPILL") spilte.push({ state: s, kort: h.kort });
    s = utfør(s, h).state;
  }
  const res = s.sisteRunde;
  if (res === null) return null;
  const klart = res.lagStikk >= bud;
  // GRADERT forsterkning. Første versjon lærte bare av vellykkede kontrakter,
  // og siden de nesten aldri inntraff, skjedde det ingen læring i det hele
  // tatt (identisk resultat før og etter). Nå skalerer raten med hvor nær
  // kontrakten kom: å ta 8 av 9 er nesten riktig spill og fortjener nesten
  // full forsterkning, mens 3 av 9 ikke gjør det.
  const nærhet = Math.max(0, Math.min(1, (res.lagStikk - (bud - 4)) / 4));
  const rate = 0.03 * (klart ? 1 : nærhet * 0.6);
  if (rate > 1e-4) {
    for (const { state, kort } of spilte) agent.lærSpill(state, sete, kort, rate);
  }
  return { klart };
}
