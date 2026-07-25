/**
 * GODKJENNINGSPORTEN FOR SD-TRUMFFASITEN.
 *
 *   node examples/moe2-port-trumf-sd.ts --givere 2000 [--verdener 32] [--dybde 6]
 *                                       [--arbeidere 8]
 *
 * SPØRSMÅLET. Fire fasiter er kjørt gjennom porten. Den ene som var single
 * dummy bestod (+0,925); alle tre som var double dummy falt (trumf +0,234,
 * vrak +0,144, kortspill −0,609). Kortfasiten ble bygget om til SD og bestod
 * (+0,718). Skillet går ikke mellom beslutningstyper, men mellom fasiter som
 * forutsetter informasjon du HAR og informasjon du IKKE har.
 *
 * OG TRUMFEN ER STEDET DER MEKANISMEN ER MEST SYNLIG. Etterlysningen bestemmer
 * hvem makkeren blir. DD-fasiten kaller på valør 4,3 i snitt fordi den SER hvem
 * som sitter med toeren; nevro og «lengste farge» kaller på 12,9 og scorer et
 * helt poeng bedre. Å beholde DD-fasitens fargevalg og bare bytte til høyeste
 * lovlige etterlysning er verdt +0,72 poeng. Hvis SD-ombyggingen virker noe
 * sted, skal den virke her: i en samplet verden ligger det etterlyste kortet
 * der det tilfeldigvis ligger, og en lav valør blir det sjansespillet den er.
 *
 * METODEN, uendret fra `moe2-port-trumf.ts`. Bare trumffarge og etterlysning
 * varieres. Budrunden, vraket og hele kortspillet i alle fire seter er
 * NevroHjerne; budrunden og vraket er deterministiske og skjer FØR valget, så
 * alle policyer måles på nøyaktig de samme stillingene. Poeng måles to ganger
 * på uavhengige giversett.
 *
 * INGEN FORHÅNDSFILTER HER. Søkerommet er ~40 par (farge, valør), så hele
 * tabellen enumereres og SD-verdien regnes for hver. Det er forskjellen fra
 * vraket, der C(16,4) = 1 820 tvinger fram en grovsil.
 *
 * DEN ÆRLIGE INNVENDINGEN, samme som for vraket: SD-fasiten estimerer forventet
 * poengutfall mot NevroHjerne, og referansen MÅLER poengutfall mot
 * NevroHjerne. Med K → ∞ ville porten vært tautologisk. Det informative er at
 * DD-fasiten IKKE består på nøyaktig samme datagrunnlag – begge dommene regnes
 * ut her, av de samme givene og de samme policyene – og at et gjennomførbart K
 * holder.
 *
 * UTVALGSREGELEN ER SKREVET NED SAMMEN MED POLICYENE, FØR TALLENE FORELIGGER:
 * det smale utvalget er «alle unntatt de som er konstruert for å være dårlige»,
 * samme regel og samme antall som i DD-kjøringen.
 *
 * AVGRENSNING, arvet fra eksperten: bare tallbud-kontrakter. Ved solo er
 * etterlysningen valgfri og betyr noe helt annet.
 */

import { fork } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

import { FARGER, opprettSpill, utfør, type GameState, type Verdi } from "../src/index.ts";
import { lagRng } from "../src/kort.ts";
import { beskriv, mål } from "../src/moe2/maaling.ts";
import { kortIndeks } from "../src/neat/trekk.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { prøvPorten } from "../src/moe2/port.ts";
import { vurderTrumfSD } from "../src/moe2/sdkort.ts";
import { lagTrumfstilling, type Trumfhandling } from "../src/moe2/eksperter/trumf.ts";

let givere = 2000;
let dybde = 6;
let verdener = 32;
let arbeidere = 8;
let arbeider = -1;
/** Suffiks på utdatafilene, så en tilleggskjøring ikke overskriver hovedkjøringen. */
let merke = "";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === "--givere") givere = Number(process.argv[++i]);
  if (a === "--dybde") dybde = Number(process.argv[++i]);
  if (a === "--verdener") verdener = Number(process.argv[++i]);
  if (a === "--arbeidere") arbeidere = Number(process.argv[++i]);
  if (a === "--arbeider") arbeider = Number(process.argv[++i]);
  if (a === "--merke") merke = String(process.argv[++i]);
}

const nevro = new NevroAgent();
const fargeAv = (i: number): number => Math.floor(i / 13);

interface Stilling {
  readonly bv: number;
  /** Tilstanden som står i VELG – felles utgangspunkt for alle policyene. */
  readonly state: GameState;
  readonly handlinger: readonly Trumfhandling[];
  readonly ddVerdi: readonly number[];
  /** Handlingsindekser sortert etter fallende DD-verdi. */
  readonly ddRangert: readonly number[];
  readonly nevroIdx: number;
  readonly fargeLengde: readonly number[];
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
  return {
    bv,
    state: s,
    handlinger: rå.handlinger,
    ddVerdi: rå.verdi,
    ddRangert: rå.verdi.map((_, i) => i).sort((a, b) => rå.verdi[b]! - rå.verdi[a]!),
    nevroIdx: rå.takValg,
    fargeLengde,
    toppserie,
  };
}

/** Rang r i en rangering (0 = beste), klippet til lengden. */
const rangI = (rekke: readonly number[], r: number): number => rekke[Math.min(r, rekke.length - 1)]!;

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

const eller = (i: number, reserve: number): number => (i >= 0 ? i : reserve);

/**
 * POLICYENE. Fem familier, med vilje – kravet i docs/moe2.md er at porten
 * kjøres på tvers av familier.
 *
 *   - SD-fasiten og nær-varianter (nr. 3, SD-fargen med høyeste og med laveste
 *     etterlysning). De to siste isolerer VALØRVALGET fra fargevalget: samme
 *     farge som fasiten, annen etterlysning. Det er nøyaktig aksen der DD
 *     feilet, så den skal kunne måles for seg.
 *   - DD-fasiten og DD-fargen med høyeste etterlysning. Egen familie, allerede
 *     avvist, tas med nettopp derfor.
 *   - NevroHjerne, og nevrofargen med laveste etterlysning.
 *   - Håndfaste heuristikker (lengste farge, lengde+serie).
 *   - Bevisst dårlige (SD median, SD verste, tilfeldig), for at den brede
 *     porten skal ha spenn nok til å måle noe.
 *
 * DET SMALE UTVALGET, definert her og ikke etterpå: alle unntatt de tre
 * bevisst dårlige. Samme regel og samme antall som i DD-kjøringen, der de tre
 * var DD median, DD verste og tilfeldig.
 */
type Policy =
  | { readonly navn: string; readonly slag: "sd"; readonly velg: (st: Stilling, sd: readonly number[]) => number }
  | {
      readonly navn: string;
      readonly slag: "annen";
      readonly velg: (st: Stilling, rng: () => number) => number;
    };

const policyer: Policy[] = [
  { navn: "SD (fasiten)", slag: "sd", velg: (_st, sd) => rangI(sd, 0) },
  { navn: "SD nr. 3", slag: "sd", velg: (_st, sd) => rangI(sd, 2) },
  {
    navn: "SD-farge, høyest",
    slag: "sd",
    velg: (st, sd) => eller(iFargen(st, st.handlinger[rangI(sd, 0)]!.farge, true), rangI(sd, 0)),
  },
  {
    navn: "SD-farge, lavest",
    slag: "sd",
    velg: (st, sd) => eller(iFargen(st, st.handlinger[rangI(sd, 0)]!.farge, false), rangI(sd, 0)),
  },
  { navn: "SD median", slag: "sd", velg: (_st, sd) => rangI(sd, Math.floor(sd.length / 2)) },
  { navn: "SD verste", slag: "sd", velg: (_st, sd) => rangI(sd, sd.length - 1) },
  { navn: "DD (fasiten)", slag: "annen", velg: (st) => rangI(st.ddRangert, 0) },
  {
    navn: "DD-farge, høyest",
    slag: "annen",
    velg: (st) =>
      eller(iFargen(st, st.handlinger[rangI(st.ddRangert, 0)]!.farge, true), rangI(st.ddRangert, 0)),
  },
  { navn: "nevro selv", slag: "annen", velg: (st) => st.nevroIdx },
  {
    navn: "nevrofarge, lavest",
    slag: "annen",
    velg: (st) => eller(iFargen(st, st.handlinger[st.nevroIdx]!.farge, false), st.nevroIdx),
  },
  {
    navn: "lengste farge",
    slag: "annen",
    velg: (st) => eller(iFargen(st, fargeEtter(st, (f) => st.fargeLengde[f]!), true), 0),
  },
  {
    // Lengde pluss toppserie: en lang farge med AKD er verdt mer enn en like
    // lang uten toppkort, og det er den avveiningen «beste serie» handler om.
    navn: "lengde+serie",
    slag: "annen",
    velg: (st) =>
      eller(iFargen(st, fargeEtter(st, (f) => st.fargeLengde[f]! + st.toppserie[f]!), true), 0),
  },
  { navn: "tilfeldig", slag: "annen", velg: (st, rng) => Math.floor(rng() * st.handlinger.length) },
];

const BEVISST_DÅRLIGE = new Set(["SD median", "SD verste", "tilfeldig"]);
const SD_FAMILIE = new Set(["SD (fasiten)", "SD nr. 3", "SD-farge, høyest", "SD-farge, lavest"]);
const DD_FAMILIE = new Set(["DD (fasiten)", "DD-farge, høyest"]);

/** Spiller runden ferdig med NevroHjerne på de EKTE hendene etter at trumfen er valgt. */
function spillUt(st: Stilling, h: Trumfhandling): number {
  const farge = FARGER[h.farge]!;
  let s = utfør(st.state, {
    type: "VELG",
    spiller: st.bv,
    trumf: farge,
    // `Trumfhandling.valør` er allerede en lovlig valør fra `lovligeEtterlys`;
    // typen der er `number`, så kastet er en innsnevring og ikke en antakelse.
    etterlyst: { farge, verdi: h.valør as Verdi },
  }).state;
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
    s = utfør(s, nevro.velgHandling(s)).state;
  }
  const egne = s.totalPoeng[st.bv] ?? 0;
  return egne - (s.totalPoeng.reduce((a, b) => a + b, 0) - egne) / 3;
}

interface Giv {
  readonly f: number;
  readonly poeng: number[];
  readonly sdAnger: number[];
  readonly ddAnger: number[];
  readonly lengde: number[];
  readonly valør: number[];
  readonly likFasit: number[];
  readonly likFarge: number[];
}

const frøAv = (f: number): number => (f < Math.floor(givere / 2) ? 28_000_000 : 28_500_000) + f;

function énGiv(f: number): Giv | null {
  const frø = frøAv(f);
  const st = byggStilling(frø);
  if (st === null) return null;
  const rngPolicy = lagRng(frø ^ 0x5f37_59df);
  const rngVerden = lagRng(frø ^ 0x9e37_79b9);

  // Hele tabellen SD-vurderes – ingen forhaandsfilter er noedvendig her.
  const vurdert = vurderTrumfSD(st.state, nevro, st.handlinger, { verdener, rng: rngVerden });
  if (vurdert.length !== st.handlinger.length) return null;
  const sdVerdi = vurdert.map((v) => v.verdi);
  const sdRangert = sdVerdi.map((_, i) => i).sort((a, b) => sdVerdi[b]! - sdVerdi[a]!);

  const valg = policyer.map((p) =>
    p.slag === "sd" ? p.velg(st, sdRangert) : p.velg(st, rngPolicy),
  );
  const sdBeste = sdVerdi[sdRangert[0]!]!;
  const ddBeste = st.ddVerdi[st.ddRangert[0]!]!;
  const fasitValg = valg[0]!;
  const fasitFarge = st.handlinger[fasitValg]!.farge;

  return {
    f,
    poeng: valg.map((v) => spillUt(st, st.handlinger[v]!)),
    sdAnger: valg.map((v) => sdBeste - sdVerdi[v]!),
    ddAnger: valg.map((v) => ddBeste - st.ddVerdi[v]!),
    lengde: valg.map((v) => st.fargeLengde[st.handlinger[v]!.farge]!),
    valør: valg.map((v) => st.handlinger[v]!.valør),
    likFasit: valg.map((v) => (v === fasitValg ? 1 : 0)),
    likFarge: valg.map((v) => (st.handlinger[v]!.farge === fasitFarge ? 1 : 0)),
  };
}

// --- Arbeidermodus ---------------------------------------------------------

const delfil = (i: number): string => `analyse/.moe2-port-trumf-sd${merke}-del-${i}.json`;

if (arbeider >= 0) {
  const giver: Giv[] = [];
  let hoppet = 0;
  for (let f = arbeider; f < givere; f += arbeidere) {
    const g = énGiv(f);
    if (g === null) hoppet++;
    else giver.push(g);
    if (process.send) process.send({ ferdig: 1 });
  }
  writeFileSync(delfil(arbeider), JSON.stringify({ giver, hoppet }));
  process.exit(0);
}

// --- Foreldreprosess -------------------------------------------------------

const t0 = Date.now();
let gjort = 0;

const kjørArbeidere = async (): Promise<{ giver: Giv[]; hoppet: number }> => {
  await Promise.all(
    Array.from({ length: arbeidere }, (_, i) => {
      return new Promise<void>((ferdig, feil) => {
        const barn = fork(process.argv[1]!, [...process.argv.slice(2), "--arbeider", String(i)]);
        barn.on("message", () => {
          gjort++;
          if (gjort % 20 === 0) {
            const sek = (Date.now() - t0) / 1000;
            process.stdout.write(
              `\r  ${gjort}/${givere}, ${(sek / gjort).toFixed(2)} s/giv, ` +
                `est. ${(((sek / gjort) * (givere - gjort)) / 60).toFixed(1)} min igjen   `,
            );
          }
        });
        barn.on("exit", (kode) => (kode === 0 ? ferdig() : feil(new Error(`arbeider ${i}: ${kode}`))));
      });
    }),
  );
  const giver: Giv[] = [];
  let hoppet = 0;
  for (let i = 0; i < arbeidere; i++) {
    const sti = delfil(i);
    if (!existsSync(sti)) throw new Error(`mangler ${sti}`);
    const del = JSON.parse(readFileSync(sti, "utf8")) as { giver: Giv[]; hoppet: number };
    giver.push(...del.giver);
    hoppet += del.hoppet;
  }
  for (let i = 0; i < arbeidere; i++) unlinkSync(delfil(i));
  giver.sort((a, b) => a.f - b.f);
  return { giver, hoppet };
};

const { giver, hoppet } = await kjørArbeidere();
process.stdout.write("\n");
if (giver.length === 0) throw new Error("ingen giver kom gjennom – ingenting å måle");

const halv = Math.floor(givere / 2);
const iA = giver.filter((g) => g.f < halv);
const iB = giver.filter((g) => g.f >= halv);
const snitt = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);

interface Rad {
  navn: string;
  sdAnger: number;
  ddAnger: number;
  poengA: number;
  poengB: number;
  poeng: number;
  lengde: number;
  valør: number;
  likFasit: number;
  likFarge: number;
}
const rader: Rad[] = policyer.map((p, i) => ({
  navn: p.navn,
  sdAnger: snitt(giver.map((g) => g.sdAnger[i]!)),
  ddAnger: snitt(giver.map((g) => g.ddAnger[i]!)),
  poengA: snitt(iA.map((g) => g.poeng[i]!)),
  poengB: snitt(iB.map((g) => g.poeng[i]!)),
  poeng: snitt(giver.map((g) => g.poeng[i]!)),
  lengde: snitt(giver.map((g) => g.lengde[i]!)),
  valør: snitt(giver.map((g) => g.valør[i]!)),
  likFasit: snitt(giver.map((g) => g.likFasit[i]!)),
  likFarge: snitt(giver.map((g) => g.likFarge[i]!)),
}));

interface Utvalg {
  readonly navn: string;
  readonly med: (r: Rad) => boolean;
}
const utvalg: Utvalg[] = [
  { navn: "bredt – alle policyer", med: () => true },
  { navn: "SMALT – uten de bevisst dårlige", med: (r) => !BEVISST_DÅRLIGE.has(r.navn) },
  { navn: "bare SD-familien", med: (r) => SD_FAMILIE.has(r.navn) },
  { navn: "SD-familien + nevro", med: (r) => SD_FAMILIE.has(r.navn) || r.navn === "nevro selv" },
  { navn: "bare ikke-SD", med: (r) => !r.navn.startsWith("SD") },
  { navn: "SD- + DD-familien", med: (r) => SD_FAMILIE.has(r.navn) || DD_FAMILIE.has(r.navn) },
];

/**
 * Begge fasitene dømmes på NØYAKTIG samme datagrunnlag: samme giver, samme
 * policyer, samme poengmåling. Da er forskjellen mellom dommene fasiten, og
 * ikke utvalget.
 */
const døm = (fasit: (r: Rad) => number) =>
  utvalg.map((u) => {
    const r = rader.filter(u.med);
    return {
      navn: u.navn,
      policyer: r.map((x) => x.navn),
      ...prøvPorten({
        fasit: r.map(fasit),
        referanseA: r.map((x) => x.poengA),
        referanseB: r.map((x) => x.poengB),
        sammeRetning: false,
      }),
    };
  });
const dommerSD = døm((r) => r.sdAnger);
const dommerDD = døm((r) => r.ddAnger);

// --- Asymmetri, paret mot SD-fasitens eget valg på samme giv ---------------

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
const tell = (r: Retning, anger: number, dPoeng: number): void => {
  r.n++;
  r.anger += anger;
  r.dPoeng += dPoeng;
};
for (const g of giver) {
  for (let i = 1; i < policyer.length; i++) {
    const dPoeng = g.poeng[i]! - g.poeng[0]!;
    const anger = g.sdAnger[i]!;
    const dLengde = g.lengde[i]! - g.lengde[0]!;
    if (dLengde > 0) tell(asym.fargeLengre, anger, dPoeng);
    else if (dLengde < 0) tell(asym.fargeKortere, anger, dPoeng);
    // Valoeraksen maales BARE innen samme farge - ellers er det fargefeilen
    // som blir talt opp under et etterlysningsnavn.
    if (g.likFarge[i] === 1) {
      if (g.valør[i]! > g.valør[0]!) tell(asym.valørHøyere, anger, dPoeng);
      else if (g.valør[i]! < g.valør[0]!) tell(asym.valørLavere, anger, dPoeng);
    }
  }
}

// --- Målekontrakten: gulv og tak fra SAMME giver ---------------------------

const iNavn = (navn: string): number => policyer.findIndex((p) => p.navn === navn);
const iSD = iNavn("SD (fasiten)");
const iDD = iNavn("DD (fasiten)");
const iNevro = iNavn("nevro selv");
const iTilf = iNavn("tilfeldig");
const målingSD = mål({
  navn: "SD-trumf",
  stillinger: giver,
  holdout: true,
  retning: "hoeyereErBedre",
  kandidat: (g) => g.poeng[iSD]!,
  gulv: (g) => g.poeng[iTilf]!,
  tak: (g) => g.poeng[iNevro]!,
});
const målingDD = mål({
  navn: "DD-trumf",
  stillinger: giver,
  holdout: true,
  retning: "hoeyereErBedre",
  kandidat: (g) => g.poeng[iDD]!,
  gulv: (g) => g.poeng[iTilf]!,
  tak: (g) => g.poeng[iNevro]!,
});

// --- Rapport ---------------------------------------------------------------

const linjer: string[] = [];
const si = (s: string): void => {
  console.log(s);
  linjer.push(s);
};

si(
  `=== SD-trumfpolicyer, ${giver.length} giver (${hoppet} hoppet over), ` +
    `${verdener} verdener, DD-dybde ${dybde} ===`,
);
si(`Bare trumffarge og etterlysning varieres. Bud, vrak og hele kortspillet i`);
si(`alle fire seter er NevroHjerne. Poeng er budvinnersetets differanse mot`);
si(`snittet av de tre andre, i den ene runden valget gjelder.`);
si("");
si(
  "policy".padEnd(20) +
    "SD-anger".padStart(10) +
    "DD-anger".padStart(10) +
    "lengde".padStart(8) +
    "valoer".padStart(8) +
    "=farge".padStart(8) +
    "=fasit".padStart(8) +
    "poeng/runde".padStart(13),
);
si("-".repeat(85));
for (const r of [...rader].sort((a, b) => b.poeng - a.poeng)) {
  si(
    r.navn.padEnd(20) +
      r.sdAnger.toFixed(3).padStart(10) +
      r.ddAnger.toFixed(3).padStart(10) +
      r.lengde.toFixed(2).padStart(8) +
      r.valør.toFixed(1).padStart(8) +
      `${Math.round(100 * r.likFarge)} %`.padStart(8) +
      `${Math.round(100 * r.likFasit)} %`.padStart(8) +
      r.poeng.toFixed(2).padStart(13),
  );
}

si("");
si("=== MAALEKONTRAKTEN: gulv og tak fra samme giver ===");
si(`  ${beskriv(målingSD)}`);
si(`  ${beskriv(målingDD)}`);

const skrivDom = (tittel: string, d: (typeof dommerSD)[number]): void => {
  si("");
  si(`=== ${tittel} (n=${d.n}) ===`);
  si(`  splitt-halv paalitelighet   ${d.paalitelighet.toFixed(3)} (splitt ${d.splitt.toFixed(3)})`);
  si(`  observert korrelasjon       ${d.observert.toFixed(3)}`);
  si(`  dempingskorrigert           ${d.korrigert.toFixed(3)}`);
  si(`  DOM: ${d.dom.toUpperCase()}`);
  si(`  ${d.begrunnelse}`);
};
skrivDom("SD-FASITEN, bredt utvalg", dommerSD[0]!);
skrivDom("SD-FASITEN, SMALT – den som teller", dommerSD[1]!);

si("");
si("=== SENSITIVITET: dommen som funksjon av utvalget, SD mot DD ===");
si("Begge fasitene er regnet ut av de SAMME givene og de SAMME policyene, saa");
si("forskjellen mellom kolonnene er fasiten og ingenting annet.");
si(
  "utvalg".padEnd(34) +
    "n".padStart(4) +
    "paalitelig".padStart(12) +
    "SD korr".padStart(9) +
    "SD dom".padStart(11) +
    "DD korr".padStart(9) +
    "DD dom".padStart(11),
);
si("-".repeat(90));
for (let i = 0; i < utvalg.length; i++) {
  const s = dommerSD[i]!;
  const d = dommerDD[i]!;
  si(
    s.navn.padEnd(34) +
      String(s.n).padStart(4) +
      s.paalitelighet.toFixed(3).padStart(12) +
      (Number.isNaN(s.korrigert) ? "–" : s.korrigert.toFixed(3)).padStart(9) +
      s.dom.padStart(11) +
      (Number.isNaN(d.korrigert) ? "–" : d.korrigert.toFixed(3)).padStart(9) +
      d.dom.padStart(11),
  );
}

si("");
si("=== ASYMMETRI I TAPSFUNKSJONEN (paret mot SD-fasiten paa samme giv) ===");
si(
  "retning".padEnd(26) +
    "n".padStart(7) +
    "snitt anger".padStart(13) +
    "d poeng".padStart(10) +
    "poeng per anger".padStart(17),
);
si("-".repeat(73));
for (const a of [
  { navn: "KORTERE farge enn fasit", r: asym.fargeKortere },
  { navn: "LENGRE farge enn fasit", r: asym.fargeLengre },
  { navn: "HOEYERE valoer (samme farge)", r: asym.valørHøyere },
  { navn: "LAVERE valoer (samme farge)", r: asym.valørLavere },
]) {
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
  `analyse/moe2-port-trumf-sd${merke}.json`,
  JSON.stringify(
    {
      givere,
      brukte: giver.length,
      hoppet,
      dybde,
      verdener,
      rader,
      dommerSD,
      dommerDD,
      asym,
      målingSD,
      målingDD,
    },
    null,
    2,
  ),
);
writeFileSync(`analyse/moe2-port-trumf-sd${merke}.txt`, `${linjer.join("\n")}\n`);
console.log(`\nSkrev analyse/moe2-port-trumf-sd${merke}.{txt,json}`);
