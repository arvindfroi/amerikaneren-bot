/**
 * GODKJENNINGSPORTEN FOR TRUMFFASITEN.
 *
 *   node examples/moe2-port-trumf.ts --givere 1200 [--dybde 6]
 *
 * SPØRSMÅLET. `src/moe2/eksperter/trumf.ts` lar trumfeksperten selektere på
 * dobbelt-dummy-verdien av kontrakten under hvert lovlige par (trumffarge,
 * etterlyst valør). Fasedelingen målte at nettopp dette valget er 32,4 ± 3,0
 * av et samlet gap på 41,7 poeng – den dyreste enkeltbeslutningen i spillet.
 * Er fasiten feil, er det den dyreste feilen vi kan gjøre.
 *
 * Og fasiten er ikke uskyldig til det motsatte er vist. Kortfasiten er MÅLT
 * MOTBEVIST (E1-r2: 0,34 anger bedre enn NevroHjerne, 2,91 poeng dårligere),
 * og begge ganger var mekanismen den samme: orakelet ser alle hender, spilleren
 * gjør ikke det. Her er den mistanken helt konkret. Etterlysningen bestemmer
 * HVEM MAKKEREN BLIR. Dobbelt dummy vet hvem som sitter med kortet; budvinneren
 * gjør det ikke. En fasit som velger etterlysning med skjult kunnskap om hvor
 * kortet ligger, kan være riktig for orakelet og bare flaks for spilleren.
 *
 * METODEN, uendret fra `moe2-port-bud.ts`. Bare trumf + etterlysning varieres.
 * Budrunden, vraket og hele kortspillet i alle fire seter er NevroHjerne.
 * Budrunden og vraket er deterministiske og skjer FØR valget, så alle policyer
 * måles på nøyaktig de samme stillingene, og ingenting annet kan forklare
 * poengforskjellen.
 *
 * Poeng måles TO ganger på uavhengige giversett, så referansens egen
 * pålitelighet er kjent FØR korrelasjonen tolkes. Porten kjøres bredt (alle
 * policyer) og smalt (alle unntatt de tre som er KONSTRUERT for å være
 * dårlige). Det smale er det som teller, fordi det er de nærliggende valgene
 * seleksjonen faktisk må skille. Regelen for hva som er «smalt» står sammen med
 * policyene, skrevet før tallene forelå, og en sensitivitetstabell viser hvor
 * mye dommen avhenger av utvalget.
 *
 * AVGRENSNING, arvet fra eksperten: bare tallbud-kontrakter. Ved solo er
 * etterlysningen valgfri og betyr noe helt annet.
 */

import { writeFileSync } from "node:fs";

import { FARGER, lagRng, opprettSpill, utfør, type GameState, type Verdi } from "../src/index.ts";
import { kortIndeks } from "../src/neat/trekk.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { prøvPorten } from "../src/moe2/port.ts";
import { lagTrumfstilling, type Trumfhandling } from "../src/moe2/eksperter/trumf.ts";

let givere = 1200;
let dybde = 6;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--givere") givere = Number(process.argv[++i]);
  if (process.argv[i] === "--dybde") dybde = Number(process.argv[++i]);
}

const nevro = new NevroAgent();
const fargeAv = (i: number): number => Math.floor(i / 13);
const valørAv = (i: number): number => (i % 13) + 2;

/** Én trumfstilling med hele fasittabellen ferdig løst. */
interface Stilling {
  readonly frø: number;
  readonly bv: number;
  /** Tilstanden som står i VELG – felles utgangspunkt for alle policyene. */
  readonly state: GameState;
  readonly handlinger: readonly Trumfhandling[];
  readonly verdi: readonly number[];
  /** Handlingsindekser sortert etter fallende DD-verdi. */
  readonly rangert: readonly number[];
  readonly nevroIdx: number;
  /** Antall kort per farge på budvinnerens hånd (12 kort, etter vrak). */
  readonly fargeLengde: readonly number[];
  /** Lengste sammenhengende serie fra esset og nedover, per farge. */
  readonly toppserie: readonly number[];
}

function byggStilling(frø: number): Stilling | null {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  while ((s.fase === "BUDRUNDE" || s.fase === "VRAK") && vakt++ < 50) {
    s = utfør(s, nevro.velgHandling(s)).state;
  }
  if (s.fase !== "VELG" || s.budvinner === null) return null;
  const rå = lagTrumfstilling(s, { dybde });
  if (rå === null) return null;
  const bv = s.budvinner;
  const hånd = (s.hender[bv] ?? []).map(kortIndeks);
  const fargeLengde = [0, 0, 0, 0];
  for (const k of hånd) fargeLengde[fargeAv(k)]!++;
  const eier = new Set(hånd);
  const toppserie = [0, 1, 2, 3].map((f) => {
    let n = 0;
    for (let v = 14; v >= 2; v--) {
      if (!eier.has(f * 13 + (v - 2))) break;
      n++;
    }
    return n;
  });
  const rangert = rå.verdi.map((_, i) => i).sort((a, b) => rå.verdi[b]! - rå.verdi[a]!);
  return {
    frø,
    bv,
    state: s,
    handlinger: rå.handlinger,
    verdi: rå.verdi,
    rangert,
    nevroIdx: rå.takValg,
    fargeLengde,
    toppserie,
  };
}

/** Rang r i fasittabellen (0 = beste), klippet til tabellens lengde. */
function rang(st: Stilling, r: number): number {
  return st.rangert[Math.min(r, st.rangert.length - 1)]!;
}

/** Høyeste (eller laveste) lovlige etterlysning i `farge`. −1 om fargen ikke er lovlig. */
function iFargen(st: Stilling, farge: number, høyest: boolean): number {
  let beste = -1;
  for (let i = 0; i < st.handlinger.length; i++) {
    const h = st.handlinger[i]!;
    if (h.farge !== farge) continue;
    if (beste < 0) {
      beste = i;
      continue;
    }
    const b = st.handlinger[beste]!;
    if (høyest ? h.valør > b.valør : h.valør < b.valør) beste = i;
  }
  return beste;
}

/** Fargen `poeng` rangerer høyest, blant dem som HAR en lovlig etterlysning. */
function fargeEtter(st: Stilling, poeng: (f: number) => number): number {
  let beste = -1;
  let bestePoeng = -Infinity;
  for (const h of st.handlinger) {
    const p = poeng(h.farge);
    if (p > bestePoeng) {
      bestePoeng = p;
      beste = h.farge;
    }
  }
  return beste;
}

/** Faller tilbake på DD-beste hvis fargevalget ikke ga en lovlig handling. */
const eller = (i: number, st: Stilling): number => (i >= 0 ? i : rang(st, 0));

interface Policy {
  readonly navn: string;
  readonly velg: (st: Stilling, rng: () => number) => number;
}

/**
 * Policyene, med vilje fra ULIKE familier – det er kravet i rettelsen i
 * docs/moe2.md, og det var mangelen på det som lot kortfasiten passere.
 *
 *   - DD-fasiten og nær-varianter av den (rang 3, DD-fargen med høyeste/laveste
 *     etterlysning). De to siste isolerer VALØRVALGET fra fargevalget: samme
 *     farge som fasiten, annen etterlysning.
 *   - NevroHjerne, som vinner på poeng – men som IKKE automatisk er et tak.
 *     Nevro velger trumf med håndvurderingen `estimerStikk` og etterlyser
 *     alltid det høyeste kortet den ikke har selv.
 *   - Håndfaste heuristikker (lengste farge, lengste farge med beste toppserie)
 *     fra en annen familie enn både DD og nevro.
 *   - Bevisst dårlige (DD median, DD verste, tilfeldig) for å gjøre spennet
 *     stort nok til at den brede porten har noe å måle.
 */
const policyer: Policy[] = [
  { navn: "DD (fasiten)", velg: (st) => rang(st, 0) },
  { navn: "DD nr. 3", velg: (st) => rang(st, 2) },
  {
    navn: "DD-farge, høyest",
    velg: (st) => eller(iFargen(st, st.handlinger[rang(st, 0)]!.farge, true), st),
  },
  {
    navn: "DD-farge, lavest",
    velg: (st) => eller(iFargen(st, st.handlinger[rang(st, 0)]!.farge, false), st),
  },
  { navn: "DD median", velg: (st) => rang(st, Math.floor(st.rangert.length / 2)) },
  { navn: "DD verste", velg: (st) => rang(st, st.rangert.length - 1) },
  { navn: "nevro selv", velg: (st) => st.nevroIdx },
  {
    navn: "nevrofarge, høyest",
    velg: (st) => eller(iFargen(st, st.handlinger[st.nevroIdx]!.farge, true), st),
  },
  {
    navn: "nevrofarge, lavest",
    velg: (st) => eller(iFargen(st, st.handlinger[st.nevroIdx]!.farge, false), st),
  },
  {
    navn: "lengste farge",
    velg: (st) => eller(iFargen(st, fargeEtter(st, (f) => st.fargeLengde[f]!), true), st),
  },
  {
    // Lengde pluss toppserie: en lang farge med AKD er verdt mer enn en like
    // lang uten toppkort, og det er den avveiningen «beste serie» handler om.
    navn: "lengde+serie",
    velg: (st) =>
      eller(iFargen(st, fargeEtter(st, (f) => st.fargeLengde[f]! + st.toppserie[f]!), true), st),
  },
  { navn: "tilfeldig", velg: (st, rng) => Math.floor(rng() * st.handlinger.length) },
];

/** Spiller runden ferdig med NevroHjerne etter at trumfen er valgt. */
function spillUt(st: Stilling, h: Trumfhandling): number {
  let s = utfør(st.state, {
    type: "VELG",
    spiller: st.bv,
    trumf: FARGER[h.farge]!,
    // `Trumfhandling.valør` er allerede en lovlig valør fra `lovligeEtterlys`;
    // typen der er `number`, så kastet er en innsnevring og ikke en antakelse.
    etterlyst: { farge: FARGER[h.farge]!, verdi: h.valør as Verdi },
  }).state;
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
    s = utfør(s, nevro.velgHandling(s)).state;
  }
  const egne = s.totalPoeng[st.bv] ?? 0;
  const andre = (s.totalPoeng.reduce((a, b) => a + b, 0) - egne) / 3;
  return egne - andre;
}

interface Akk {
  anger: number;
  ddVerdi: number;
  poengA: number;
  poengB: number;
  nA: number;
  nB: number;
  lengde: number;
  valør: number;
  likFasit: number;
  likFarge: number;
  n: number;
}
const akk: Akk[] = policyer.map(() => ({
  anger: 0,
  ddVerdi: 0,
  poengA: 0,
  poengB: 0,
  nA: 0,
  nB: 0,
  lengde: 0,
  valør: 0,
  likFasit: 0,
  likFarge: 0,
  n: 0,
}));

/**
 * ASYMMETRIEN. Budfasiten viste at feilen er sterkt retningsbestemt: ett bud
 * for mye koster 14,75 poeng, ett for lite 1,51. Her måles to akser, begge
 * paret mot DD-fasitens eget valg på SAMME giv:
 *   - farge: kortere eller lengre trumffarge enn fasiten?
 *   - etterlysning: høyere eller lavere valør enn fasiten, MÅLT BARE når
 *     fargen er den samme – ellers blandes de to feilene i ett tall.
 */
interface Retning {
  n: number;
  anger: number;
  dPoeng: number;
}
const nyRetning = (): Retning => ({ n: 0, anger: 0, dPoeng: 0 });
const asym = {
  fargeKortere: nyRetning(),
  fargeLengre: nyRetning(),
  valørHøyere: nyRetning(),
  valørLavere: nyRetning(),
};
function tell(r: Retning, anger: number, dPoeng: number): void {
  r.n++;
  r.anger += anger;
  r.dPoeng += dPoeng;
}

const halv = Math.floor(givere / 2);
const fasitIdx = policyer.findIndex((p) => p.navn === "DD (fasiten)");
const t0 = Date.now();
let brukte = 0;
let hoppet = 0;

for (let f = 0; f < givere; f++) {
  // Ferskt giversett for hver halvdel, saa paaliteligheten kan maales.
  const frø = (f < halv ? 24_000_000 : 24_500_000) + f;
  const st = byggStilling(frø);
  if (st === null) {
    hoppet++;
    continue;
  }
  brukte++;
  const rng = lagRng(frø ^ 0x5f37_59df);
  const beste = st.verdi[st.rangert[0]!]!;

  const valg = policyer.map((p) => p.velg(st, rng));
  const poeng = valg.map((v) => spillUt(st, st.handlinger[v]!));

  const fasitValg = valg[fasitIdx]!;
  const fasitH = st.handlinger[fasitValg]!;
  const fasitPoeng = poeng[fasitIdx]!;

  for (let i = 0; i < policyer.length; i++) {
    const v = valg[i]!;
    const h = st.handlinger[v]!;
    const a = akk[i]!;
    const anger = beste - st.verdi[v]!;
    a.anger += anger;
    a.ddVerdi += st.verdi[v]!;
    a.lengde += st.fargeLengde[h.farge]!;
    a.valør += h.valør;
    if (v === fasitValg) a.likFasit++;
    if (h.farge === fasitH.farge) a.likFarge++;
    a.n++;
    if (f < halv) {
      a.poengA += poeng[i]!;
      a.nA++;
    } else {
      a.poengB += poeng[i]!;
      a.nB++;
    }
    if (i === fasitIdx) continue;
    const dPoeng = poeng[i]! - fasitPoeng;
    const dLengde = st.fargeLengde[h.farge]! - st.fargeLengde[fasitH.farge]!;
    if (dLengde > 0) tell(asym.fargeLengre, anger, dPoeng);
    else if (dLengde < 0) tell(asym.fargeKortere, anger, dPoeng);
    // Valøraksen maales BARE innen samme farge - ellers er det fargefeilen
    // som blir talt opp under et etterlysningsnavn.
    if (h.farge === fasitH.farge) {
      if (h.valør > fasitH.valør) tell(asym.valørHøyere, anger, dPoeng);
      else if (h.valør < fasitH.valør) tell(asym.valørLavere, anger, dPoeng);
    }
  }

  if (brukte % 100 === 0) {
    const sek = (Date.now() - t0) / 1000;
    process.stdout.write(
      `\r  ${brukte} giver, ${(sek / brukte).toFixed(2)} s/giv, ` +
        `est. ${(((sek / brukte) * (givere - f - 1)) / 60).toFixed(1)} min igjen   `,
    );
  }
}
process.stdout.write("\n");

interface Rad {
  navn: string;
  anger: number;
  ddVerdi: number;
  poengA: number;
  poengB: number;
  poeng: number;
  lengde: number;
  valør: number;
  likFasit: number;
  likFarge: number;
}
const rader: Rad[] = policyer.map((p, i) => {
  const a = akk[i]!;
  return {
    navn: p.navn,
    anger: a.anger / Math.max(1, a.n),
    ddVerdi: a.ddVerdi / Math.max(1, a.n),
    poengA: a.poengA / Math.max(1, a.nA),
    poengB: a.poengB / Math.max(1, a.nB),
    poeng: (a.poengA + a.poengB) / Math.max(1, a.n),
    lengde: a.lengde / Math.max(1, a.n),
    valør: a.valør / Math.max(1, a.n),
    likFasit: a.likFasit / Math.max(1, a.n),
    likFarge: a.likFarge / Math.max(1, a.n),
  };
});

/**
 * PORTEN. Fasiten er DD-anger (lavere er bedre), referansen er poeng (høyere
 * er bedre) – altså motsatt retning.
 *
 * DET SMALE UTVALGET ER DEFINERT AV EN REGEL, IKKE AV UTFALLET: alle policyer
 * unntatt de tre som er konstruert for å være dårlige. Dommen flytter seg med
 * utvalget – sensitivitetstabellen under viser hvordan – og et utvalg plukket
 * etter at tallene forelå er ikke en test, det er en illustrasjon.
 */
const BEVISST_DÅRLIGE = new Set(["DD median", "DD verste", "tilfeldig"]);
const DD_FAMILIE = new Set(["DD (fasiten)", "DD nr. 3", "DD-farge, høyest", "DD-farge, lavest"]);

interface Utvalg {
  readonly navn: string;
  readonly med: (r: Rad) => boolean;
}
const utvalg: Utvalg[] = [
  { navn: "bredt – alle policyer", med: () => true },
  { navn: "SMALT – uten de bevisst dårlige", med: (r) => !BEVISST_DÅRLIGE.has(r.navn) },
  { navn: "bare DD-familien", med: (r) => DD_FAMILIE.has(r.navn) },
  { navn: "DD-familien + nevro", med: (r) => DD_FAMILIE.has(r.navn) || r.navn === "nevro selv" },
  { navn: "bare ikke-DD", med: (r) => !r.navn.startsWith("DD") },
];

const dommer = utvalg.map((u) => {
  const r = rader.filter(u.med);
  return {
    navn: u.navn,
    // `n` kommer fra Portresultat og er det samme tallet – ikke dupliser det.
    policyer: r.map((x) => x.navn),
    ...prøvPorten({
      fasit: r.map((x) => x.anger),
      referanseA: r.map((x) => x.poengA),
      referanseB: r.map((x) => x.poengB),
      sammeRetning: false,
    }),
  };
});
const dom = dommer[0]!;
const domSmal = dommer[1]!;

const linjer: string[] = [];
const si = (s: string): void => {
  console.log(s);
  linjer.push(s);
};

si(`=== Trumfpolicyer, ${brukte} giver (${hoppet} hoppet over), DD-dybde ${dybde} ===`);
si(`Bare trumffarge og etterlysning varieres. Bud, vrak og hele kortspillet i`);
si(`alle fire seter er NevroHjerne. Poeng er budvinnersetets differanse mot`);
si(`snittet av de tre andre, i den ene runden valget gjelder.`);
si("");
si(
  "policy".padEnd(20) +
    "DD-anger".padStart(10) +
    "DD-verdi".padStart(10) +
    "lengde".padStart(8) +
    "valør".padStart(7) +
    "=farge".padStart(8) +
    "=fasit".padStart(8) +
    "poeng/runde".padStart(13),
);
si("-".repeat(84));
for (const r of [...rader].sort((a, b) => b.poeng - a.poeng)) {
  si(
    r.navn.padEnd(20) +
      r.anger.toFixed(3).padStart(10) +
      r.ddVerdi.toFixed(3).padStart(10) +
      r.lengde.toFixed(2).padStart(8) +
      r.valør.toFixed(1).padStart(7) +
      `${Math.round(100 * r.likFarge)} %`.padStart(8) +
      `${Math.round(100 * r.likFasit)} %`.padStart(8) +
      r.poeng.toFixed(2).padStart(13),
  );
}

const skrivDom = (tittel: string, d: typeof dom): void => {
  si("");
  si(`=== ${tittel} (n=${d.n}) ===`);
  si(`  splitt-halv paalitelighet   ${d.paalitelighet.toFixed(3)} (splitt ${d.splitt.toFixed(3)})`);
  si(`  observert korrelasjon       ${d.observert.toFixed(3)}`);
  si(`  dempingskorrigert           ${d.korrigert.toFixed(3)}`);
  si(`  DOM: ${d.dom.toUpperCase()}`);
  si(`  ${d.begrunnelse}`);
};
skrivDom("GODKJENNINGSPORTEN, bredt utvalg", dom);
skrivDom("SMAL PORT – den som teller", domSmal);

si("");
si("=== SENSITIVITET: dommen som funksjon av utvalget ===");
si("Utvalget er ikke en detalj. Faller dommen naar de bevisst daarlige tas ut,");
si("er det fordi fasiten bare klarer aa skille fornuftig fra vanvittig.");
si(
  "utvalg".padEnd(34) +
    "n".padStart(4) +
    "paalitelighet".padStart(15) +
    "korrigert".padStart(11) +
    "dom".padStart(11),
);
si("-".repeat(75));
for (const d of dommer) {
  si(
    d.navn.padEnd(34) +
      String(d.n).padStart(4) +
      d.paalitelighet.toFixed(3).padStart(15) +
      (Number.isNaN(d.korrigert) ? "–" : d.korrigert.toFixed(3)).padStart(11) +
      d.dom.padStart(11),
  );
}

si("");
si("=== ASYMMETRI I TAPSFUNKSJONEN (paret mot DD-fasiten paa samme giv) ===");
si(
  "retning".padEnd(26) +
    "n".padStart(7) +
    "snitt anger".padStart(13) +
    "d poeng".padStart(10) +
    "poeng per anger".padStart(17),
);
si("-".repeat(73));
const asymRader = [
  { navn: "KORTERE farge enn fasit", r: asym.fargeKortere },
  { navn: "LENGRE farge enn fasit", r: asym.fargeLengre },
  { navn: "HOEYERE valoer (samme farge)", r: asym.valørHøyere },
  { navn: "LAVERE valoer (samme farge)", r: asym.valørLavere },
];
for (const a of asymRader) {
  const n = Math.max(1, a.r.n);
  si(
    a.navn.padEnd(26) +
      String(a.r.n).padStart(7) +
      (a.r.anger / n).toFixed(3).padStart(13) +
      (a.r.dPoeng / n).toFixed(2).padStart(10) +
      (a.r.anger === 0 ? "–" : (a.r.dPoeng / a.r.anger).toFixed(2)).padStart(17),
  );
}

writeFileSync(
  "analyse/moe2-port-trumf.json",
  JSON.stringify({ givere, brukte, hoppet, dybde, rader, dommer, dom, domSmal, asym }, null, 2),
);
writeFileSync("analyse/moe2-port-trumf.txt", `${linjer.join("\n")}\n`);
console.log(`\nSkrev analyse/moe2-port-trumf.{txt,json}`);
