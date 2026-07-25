/**
 * KONTRAKTSLINJA – spillefører som MÅ by 9 eller 10, og aldri passer.
 *
 *   node examples/kontraktslinje.ts --kontrakt 9 --popp 96 --dir trening-k9
 *
 * Arvinds bestilling: et nett som fokuserer på å klare bud på 9 og 10, uten
 * mulighet til å passe eller by lavere. Den har dermed ingen vei utenom å bli
 * god til å SPILLE – budet kan ikke redde den, og et lavt bud finnes ikke.
 * De tre andre setene er NevroHjerne.
 *
 * Dette er budgiver-senatorene i Project Senate. I motsetning til
 * forsvarslinja eier denne agenten HELE spillefører-jobben: den vraker fra
 * talongen, velger trumffarge, etterlyser makkerkortet og spiller ut
 * kontrakten. Det er også der de største målte gapene ligger – fasedelingen
 * ga trumfvalget alene 32 av 42 poeng, og kontraktobduksjonen fant D6 med
 * 2,98 korts trumf mot NevroHjernes 5,76.
 *
 * FITNESS, to ledd som i forsvarslinja:
 *   1. KLARTE DEN KONTRAKTEN?  – hovedsaken
 *   2. LAGETS STIKK            – Arvind: «den skal prøve slik at laget får
 *      alle stikkene». Uten dette ledd ville et nett som akkurat klarer 9
 *      rangert likt med ett som tar alle 12, og hvert ekstra stikk er ett
 *      motstanderne ikke får.
 *
 * Ingen kortvalg spesifiseres. Alt – hvilken trumf, hva som vrakes, hvilket
 * kort som spilles – overlates til seleksjonen.
 *
 * SENSORER: KONTRAKTSENSORER (300 av 318). Budrundens mekanikk er fjernet
 * siden kontrakten er tvungen, men HELE håndvurderingen er beholdt – i
 * motsetning til forsvaret velger denne agenten trumf selv.
 *
 * Samme støykontroll som forsvarslinja: felles givere for alle genomer i en
 * generasjon, bekreftelseskåring av de 8 beste mot vinnerens forbannelse,
 * rullerende givere, og metningsvakt som kjører den FUNKSJONELLE testen
 * (fester kalibreringen?) og ikke bare et snitt.
 *
 * FRØHYGIENE: trening 5 000 000+, bekreftelse 5 900 000+, overvåkning
 * 4 500 000+. Holdt unna både forsvarslinjas og senat-maal.ts sine sett.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { lagRng } from "../src/kort.ts";
import { lovligeHandlinger, opprettSpill, utfør, type GameState } from "../src/index.ts";
import { Evolusjon, genomFraJson, genomTilJson, NeatAgent, Nettverk, type Genom } from "../src/neat/index.ts";
import { KONTRAKTSENSORER, lagInn, UT_KORT } from "../src/neat/trekk.ts";
import { klonGenom, STANDARD_RATER } from "../src/neat/genom.ts";
import { spillerVisning } from "../src/motor.ts";
import { besteTrumf, NevroAgent } from "../src/nevro/index.ts";

let popp = 64;
let generasjoner = 400;
let dir = "trening-k9";
let giverePerGen = 24;
let stikkVekt = 1.0;
let kontrakt = 9;
// Flere skaar med ULIKE froe kjoeres som egne prosesser. Det gir bade
// parallellitet uten traadkode OG uavhengige replikater - noedvendig i et
// domene der felle-raten svinger 10pp mellom froesett ved n=250.
let evoFrø = 0xf0f5;
// Spillefoereren har bare ETT sete - det som vant budet - saa duplikat over
// seter finnes ikke her. Stoeykontrollen ligger i felles givere, rullering
// og bekreftelseskaaring i stedet.
/** Forsprangsgenom aa seede populasjonen med (--fra). */
let fraFil: string | null = null;
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
  else if (a === "--fra") fraFil = process.argv[++i]!;
  else if (a === "--kontrakt") kontrakt = Number(process.argv[++i]);
}
mkdirSync(dir, { recursive: true });

/** En ferdig oppsatt kontraktsstilling: hvem spiller den, og paa hvilket bud. */
interface Stilling {
  readonly start: GameState;
  readonly sete: number;
  /** Ubrukt for spillefoereren; beholdt for felles form med forsvarslinja. */
  readonly medsete: number | null;
  readonly kontrakt: number;
}

/** Tvinger kontrakt `k` hos `budsete`. VRAK/VELG staar IGJEN til genomet. */
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
  // Spillefoereren er selve setet vi trener. Vrak og trumfvalg gjoeres av
  // GENOMET, ikke av nevro - derfor stoppes oppsettet foer VRAK/VELG.
  return { start: s, sete: budsete, medsete: null, kontrakt: k };
}

/** Bygger `antall` stillinger fra og med `fraFrø`, med varierende kontrakt. */
function byggSett(fraFrø: number, antall: number): Stilling[] {
  const ut: Stilling[] = [];
  for (let f = 0; ut.length < antall && f < antall * 40; f++) {
    const k = kontrakt; // fast: dette ER spesialisten for nettopp dette budet
    const st = byggStilling(fraFrø + f, k);
    if (st !== null) ut.push(st);
  }
  return ut;
}

/** Spiller ut én ferdig stilling. Returnerer spillefoererens to maaltall. */
function spillUt(genom: Genom | null, st: Stilling, sete: number): { falt: boolean; egneStikk: number } {
  const agent = genom === null ? new NevroAgent() : new NeatAgent(genom, { læringsrate: 0 });
  agent.nyKamp();
  const nevro = new NevroAgent();
  let s = st.start;
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    // VRAK og VELG eies av budvinneren - altsaa av genomet.
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    s = utfør(s, iTur === sete ? agent.velgHandling(s) : nevro.velgHandling(s)).state;
  }
  const res = s.sisteRunde;
  if (res === null) return { falt: false, egneStikk: 0 };
  // «falt» betyr her KLART - vi snur fortegnet for spillefoereren.
  return { falt: res.lagStikk >= st.kontrakt, egneStikk: res.lagStikk };
}

/**
 * FITNESS – nøyaktig to ledd, som bestilt.
 *
 * Klart-andelen er hovedsaken; lagstikk er normalisert med antall stikk i
 * runden. Uten stikkleddet ville et nett som saavidt klarer 9 rangert likt
 * med ett som tar alle 12 – og Arvind var tydelig: den skal proeve slik at
 * laget faar ALLE stikkene. Hvert ekstra stikk er dessuten ett motstanderne
 * ikke faar.
 */
function fitnessFor(genom: Genom | null, sett: readonly Stilling[]): { fit: number; falt: number; stikk: number } {
  let falt = 0;
  let stikk = 0;
  let n = 0;
  for (const st of sett) {
    const seter = [st.sete];
    for (const sete of seter) {
      const r = spillUt(genom, st, sete);
      if (r.falt) falt++;
      stikk += r.egneStikk;
      n++;
    }
  }
  n = n || 1;
  const faltAndel = falt / n;
  const stikkAndel = stikk / n / 12;
  return { fit: faltAndel + stikkVekt * stikkAndel, falt: faltAndel, stikk: stikk / n };
}

/**
 * METNINGSVAKT. Arvind: «pass paa at avl fungerer og at det ikke gaar an aa
 * mette genomet.» Et mettet nett har kortutganger paa ±1, der tanh-deriverte
 * 1-v^2 er ~0 - da fester verken kalibrering eller vektmutasjon, og linja
 * ser levende ut mens den staar helt stille. Det var rotaarsaken bak at D5
 * ikke kunne laere.
 *
 * MEN SNITT-DERIVERTEN ER EN SVAK INDIKATOR, og det er MAALT: det
 * destillerte forsprangsgenomet hadde snittderivert 0,55 og bare 1 % av
 * utgangene under 0,05 - og likevel FESTET IKKE kalibreringen i det hele
 * tatt (neat-avmett.ts, kalibreringFester). En terskel paa snittet ville
 * aldri utloest. Derfor kjoeres i tillegg den FUNKSJONELLE testen under:
 * klarer 50 kalibreringssteg aa flytte kortvalget til et annet lovlig kort?
 * Svarer den NEI, er genomet ulaerbart uansett hva snittet sier.
 */
function kalibreringFester(genom: Genom, st: Stilling): boolean {
  const g1 = klonGenom(genom);
  const a1 = new NeatAgent(g1, { læringsrate: 0 });
  a1.nyKamp();
  const lov = lovligeHandlinger(st.start);
  if (lov.fase !== "SPILL" || lov.kort.length < 2) return true;
  const før = a1.velgHandling(st.start);
  if (før.type !== "SPILL") return true;
  const mål = lov.kort.find((k) => k.farge !== før.kort.farge || k.verdi !== før.kort.verdi);
  if (mål === undefined) return true;
  for (let i = 0; i < 50; i++) a1.lærSpill(st.start, st.sete, mål, 0.1);
  const etter = a1.velgHandling(st.start);
  return etter.type === "SPILL" && etter.kort.farge === mål.farge && etter.kort.verdi === mål.verdi;
}

function derivert(genom: Genom, sett: readonly Stilling[], prøver = 80): number {
  const nett = new Nettverk(genom);
  let sum = 0;
  let n = 0;
  for (const st of sett.slice(0, prøver)) {
    const inn = lagInn(
      spillerVisning(st.start, st.sete),
      st.start.fase === "SPILL" ? "SPILL" : st.start.fase === "VRAK" ? "VRAK" : "VELG",
      st.start.giving.antallStikk,
      st.start.regler.målPoeng,
    );
    const u = nett.aktiver(inn);
    for (let i = 0; i < 52; i++) {
      const v = u[UT_KORT + i]!;
      sum += 1 - v * v;
    }
    n++;
  }
  return n === 0 ? NaN : sum / (n * 52);
}

let startGenom: Genom | undefined;
if (fraFil !== null) {
  const rå = JSON.parse(readFileSync(fraFil, "utf8")) as { genom?: unknown };
  startGenom = genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(fraFil, "utf8"));
}
// startGenom gir én klon + (popp-1) MUTERTE kopier, saa forspranget koster
// ikke variasjon i populasjonen - avlen har fortsatt noe aa jobbe med.
// KUN FORSVARSSENSORER. Forsvareren byr aldri og velger aldri trumf, saa
// budrunde- og haandvurderingssensorene er ren stoey den maa bruke
// koblinger paa. Restriksjonen gjelder ogsaa nye koblinger i alle senere
// generasjoner - ellers siver de irrelevante inn igjen over tid.
const evo = new Evolusjon({
  populasjon: popp,
  frø: evoFrø,
  startGenom,
  // MAA spres fra STANDARD_RATER: evolusjon.ts:339 gjoer `opts.rater ?? {...}`,
  // saa en delvis rate-blokk ERSTATTER alle standardene i stedet for aa slaa
  // seg sammen med dem. Uten spredningen ville alle mutasjonsratene blitt
  // undefined og linja staatt bom stille uten aa klage.
  //
  // dempedeMaal utelates med vilje: den demper bud- og xT-hodene, som denne
  // linja uansett ikke bruker.
  rater: { ...STANDARD_RATER, tillatteKilder: new Set(KONTRAKTSENSORER) },
});
const OVERVAAK = byggSett(4_500_000, 200);
const rng = lagRng(evoFrø ^ 0xd1e5);

const nevroRef = fitnessFor(null, OVERVAAK);
console.log(`Kontraktslinja: ${fraFil !== null ? `fra ${fraFil}` : "fersk"}, populasjon ${popp}, ${giverePerGen} givere/gen, kontrakt ${kontrakt}, spillefoerer`);
console.log(
  `NevroHjerne paa overvaakningssettet (n=${OVERVAAK.length}): ` +
    `klarer ${(nevroRef.falt * 100).toFixed(1)} %, lagstikk ${nevroRef.stikk.toFixed(2)}\n`,
);

let beste: Genom | null = null;
let besteFalt = -1;
for (let g = 0; g < generasjoner; g++) {
  // Nye givere hver generasjon – men de SAMME for alle genomer i den.
  const sett = byggSett(5_000_000 + Math.floor(rng() * 900_000), giverePerGen);
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
  const bekreft = byggSett(5_900_000 + Math.floor(rng() * 900_000), giverePerGen * 2);
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
      writeFileSync(`${dir}/ekspert-budvinner-${kontrakt}.json`, genomTilJson(evo.mester!));
    }
    const d = derivert(evo.mester!, OVERVAAK);
    // Den funksjonelle testen er fasit; snittet er bare et hint.
    const fester = OVERVAAK.some((st) => kalibreringFester(evo.mester!, st));
    console.log(
      `gen ${String(g + 1).padStart(4)}: klarer ${(m.falt * 100).toFixed(1)} % ` +
        `(nevro ${(nevroRef.falt * 100).toFixed(1)} %), lagstikk ${m.stikk.toFixed(2)} ` +
        `(nevro ${nevroRef.stikk.toFixed(2)}), |tanh'| ${d.toFixed(3)}` +
        `${fester ? "" : "  KALIBRERING FESTER IKKE - METTET!"}${merke}`,
    );
  }
}

if (beste !== null) {
  console.log(`\nBeste paa overvaakningssettet: feller ${(besteFalt * 100).toFixed(1)} % -> ${dir}/ekspert-budvinner-${kontrakt}.json`);
  console.log(`Endelig dom paa UROERTE froe:\n  node examples/senat-maal.ts trening-d5/gull.json --eksperter ${dir} --kamper 700 --kontrakter 9`);
}
