/**
 * GODKJENNINGSPORTEN FOR VRAKFASITEN.
 *
 *   node examples/moe2-port-vrak.ts --givere 600 [--dybde 6]
 *
 * SPØRSMÅLET. `src/moe2/eksperter/vrak.ts` lar vrakeksperten selektere på
 * dobbelt-dummy-verdien av hånden etter vraket: alle C(16,4) = 1 820 lovlige
 * vrak enumereres, hvert løses med `evaluerHybrid`, og fasiten er tabellen.
 * Den fasiten er ALDRI testet mot poeng. To fasiter er allerede felt av
 * nettopp den testen – kortfasiten (E1-r2: 0,34 anger bedre enn nevro, 2,91
 * poeng dårligere) og, i motsatt retning, budfasiten som overlevde den. Ingen
 * DD-avledet fasit er gyldig før porten har sagt det.
 *
 * METODEN, uendret fra `moe2-port-bud.ts`. Bare VRAKET varieres. Budrunden,
 * trumfvalget, etterlysningen og hele kortspillet i alle fire seter er
 * NevroHjerne. Siden budrunden er deterministisk og skjer FØR vraket, er
 * budvinneren den samme i alle policyer på samme giv, og hver policy måles på
 * nøyaktig det samme utvalget stillinger. Da er det ingenting annet enn de
 * fire kortene som kan forklare poengforskjellen.
 *
 * Poeng måles TO ganger på uavhengige giversett, slik at referansens egen
 * pålitelighet er kjent FØR korrelasjonen tolkes.
 *
 * DET SMALE UTVALGET ER DET SOM TELLER. Å skille fasiten fra «vrak de fire
 * høyeste kortene» er ingen kunst; en pålitelighet på 1,000 mot vanvittige
 * policyer sier bare at poeng klarer å rangere fornuftig mot tåpelig. Porten
 * kjøres derfor to ganger: bredt (alle policyer) og smalt (alle unntatt de fire
 * som er KONSTRUERT for å være dårlige). Den regelen er skrevet ned sammen med
 * policyene, før tallene forelå, og en sensitivitetstabell viser hvor mye
 * dommen faktisk avhenger av utvalget.
 *
 * KJENT GRENSE, som ikke skal skjules: fasiten holder trumfen fast etter
 * `fastTrumfvalg` mens det ekte spillet lar NevroHjerne velge trumf etter
 * vraket, og DD-en er hybrid (grådig ned til `dybde` stikk, eksakt derfra).
 * Det er fasiten slik den er DEFINERT – det er den som skal prøves, ikke en
 * penere versjon av den.
 */

import { writeFileSync } from "node:fs";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lagRng } from "../src/kort.ts";
import { kortIndeks } from "../src/neat/trekk.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { prøvPorten } from "../src/moe2/port.ts";
import { kortFraIndeks, lagVrakstilling } from "../src/moe2/eksperter/vrak.ts";

let givere = 600;
let dybde = 6;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--givere") givere = Number(process.argv[++i]);
  if (process.argv[i] === "--dybde") dybde = Number(process.argv[++i]);
}

const nevro = new NevroAgent();

/** Valøren til en kortindeks (2..14) og fargen (0..3), samme koding som `kortIndeks`. */
const valørAv = (i: number): number => (i % 13) + 2;
const fargeAv = (i: number): number => Math.floor(i / 13);

/** Én vrakstilling med hele fasittabellen ferdig løst. */
interface Stilling {
  readonly frø: number;
  readonly bv: number;
  /** Tilstanden som står i VRAK – felles utgangspunkt for alle policyene. */
  readonly state: GameState;
  readonly handlinger: readonly (readonly number[])[];
  readonly verdi: readonly number[];
  /** Handlingsindekser sortert etter fallende DD-verdi. */
  readonly rangert: readonly number[];
  /** Indeksen NevroHjerne velger. */
  readonly nevroIdx: number;
  readonly hånd: readonly number[];
  readonly indeks: ReadonlyMap<string, number>;
  readonly antall: number;
  /** Antall kort per farge på hånden før vrak. */
  readonly fargeLengde: readonly number[];
}

/** Bygger stillingen for én giv, eller null om giva ikke når VRAK. */
function byggStilling(frø: number): Stilling | null {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  while (s.fase === "BUDRUNDE" && vakt++ < 40) s = utfør(s, nevro.velgHandling(s)).state;
  if (s.fase !== "VRAK" || s.budvinner === null) return null;
  const rå = lagVrakstilling(s, { dybde });
  if (rå === null) return null;
  const bv = s.budvinner;
  const hånd = (s.hender[bv] ?? []).map(kortIndeks).sort((a, b) => a - b);
  const indeks = new Map<string, number>();
  rå.handlinger.forEach((h, i) => indeks.set(h.join(","), i));
  const rangert = rå.verdi.map((_, i) => i).sort((a, b) => rå.verdi[b]! - rå.verdi[a]!);
  const fargeLengde = [0, 0, 0, 0];
  for (const k of hånd) fargeLengde[fargeAv(k)]!++;
  return {
    frø,
    bv,
    state: s,
    handlinger: rå.handlinger,
    verdi: rå.verdi,
    rangert,
    nevroIdx: rå.takValg,
    hånd,
    indeks,
    antall: rå.handlinger[0]!.length,
    fargeLengde,
  };
}

/** Slår opp handlingsindeksen til et konkret vrak. Kaster hvis det ikke er lovlig. */
function idxAv(st: Stilling, vrak: readonly number[]): number {
  const i = st.indeks.get([...vrak].sort((a, b) => a - b).join(","));
  if (i === undefined) throw new Error(`vrak utenfor fasittabellen: ${vrak.join(",")}`);
  return i;
}

/** Vraker de `antall` kortene med lavest `nøkkel`. Stabilt ved likhet. */
function lavesteEtter(st: Stilling, nøkkel: (k: number) => number): number {
  const sortert = [...st.hånd].sort((a, b) => {
    const d = nøkkel(a) - nøkkel(b);
    return d !== 0 ? d : a - b;
  });
  return idxAv(st, sortert.slice(0, st.antall));
}

/** Rang r i fasittabellen (0 = beste), klippet til tabellens lengde. */
function rang(st: Stilling, r: number): number {
  return st.rangert[Math.min(r, st.rangert.length - 1)]!;
}

interface Policy {
  readonly navn: string;
  readonly velg: (st: Stilling, rng: () => number) => number;
}

/**
 * Policyene. Fire familier med vilje:
 *   - DD-fasiten selv og NÆR-VARIANTER av den (rang 6, 26, 101 av 1 820). De
 *     er det smale utvalget: hvis poeng ikke kan skille dem, kan heller ikke
 *     seleksjonen bruke fasiten til noe.
 *   - NevroHjerne, som er referansen på poeng – men IKKE automatisk et tak.
 *     På budfasiten lå nevro under det tilfeldige gulvet.
 *   - Håndfaste heuristikker (lavest valør, korteste farge) fra en helt annen
 *     familie enn DD, slik rettelsen i docs/moe2.md krever.
 *   - Bevisst dårlige (DD median, DD verste, høyest valør) for å gjøre spennet
 *     stort nok til at den brede porten i det hele tatt har noe å måle.
 */
const policyer: Policy[] = [
  { navn: "DD (fasiten)", velg: (st) => rang(st, 0) },
  { navn: "DD nr. 6", velg: (st) => rang(st, 5) },
  { navn: "DD nr. 26", velg: (st) => rang(st, 25) },
  { navn: "DD nr. 101", velg: (st) => rang(st, 100) },
  { navn: "DD median", velg: (st) => rang(st, Math.floor(st.rangert.length / 2)) },
  { navn: "DD verste", velg: (st) => rang(st, st.rangert.length - 1) },
  { navn: "nevro selv", velg: (st) => st.nevroIdx },
  { navn: "lavest valør", velg: (st) => lavesteEtter(st, valørAv) },
  {
    // Tøm de korteste fargene først, lavest kort først innen fargen.
    navn: "korteste farge",
    velg: (st) => lavesteEtter(st, (k) => st.fargeLengde[fargeAv(k)]! * 100 + valørAv(k)),
  },
  { navn: "høyest valør", velg: (st) => lavesteEtter(st, (k) => -valørAv(k)) },
  {
    navn: "tilfeldig",
    velg: (st, rng) => {
      const igjen = [...st.hånd];
      const valgt: number[] = [];
      for (let i = 0; i < st.antall; i++) valgt.push(...igjen.splice(Math.floor(rng() * igjen.length), 1));
      return idxAv(st, valgt);
    },
  },
];

/** Spiller runden ferdig med NevroHjerne etter at `vrak` er lagt, og gir setets poengdifferanse. */
function spillUt(st: Stilling, vrak: readonly number[]): number {
  let s = utfør(st.state, { type: "VRAK", spiller: st.bv, kort: vrak.map(kortFraIndeks) }).state;
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
  valør: number;
  likFasit: number;
  n: number;
}
const akk: Akk[] = policyer.map(() => ({
  anger: 0,
  ddVerdi: 0,
  poengA: 0,
  poengB: 0,
  nA: 0,
  nB: 0,
  valør: 0,
  likFasit: 0,
  n: 0,
}));

/**
 * ASYMMETRIEN. Budfasiten viste at feilen er sterkt retningsbestemt: ett bud
 * for mye koster 14,75 poeng, ett for lite 1,51. Finnes det noe tilsvarende
 * her, bestemmer det tapsfunksjonen vrakeksperten skal trenes med.
 *
 * To akser måles, begge mot DD-fasitens eget vrak på SAMME giv (paret, så
 * givas egen kvalitet faller ut):
 *   - valør: kastet policyen HØYERE eller LAVERE kort enn fasiten?
 *   - renons: tømte den FLERE eller FÆRRE farger enn fasiten?
 */
interface Retning {
  n: number;
  anger: number;
  dPoeng: number;
}
const nyRetning = (): Retning => ({ n: 0, anger: 0, dPoeng: 0 });
const asym = {
  valørHøyere: nyRetning(),
  valørLavere: nyRetning(),
  renonsFlere: nyRetning(),
  renonsFærre: nyRetning(),
};

const snittValør = (v: readonly number[]): number => v.reduce((a, b) => a + valørAv(b), 0) / v.length;
function antallRenons(st: Stilling, vrak: readonly number[]): number {
  const ute = new Set(vrak);
  const lengde = [0, 0, 0, 0];
  for (const k of st.hånd) if (!ute.has(k)) lengde[fargeAv(k)]!++;
  return lengde.filter((x) => x === 0).length;
}

const halv = Math.floor(givere / 2);
const fasitIdx = policyer.findIndex((p) => p.navn === "DD (fasiten)");
const t0 = Date.now();
let brukte = 0;
let hoppet = 0;

for (let f = 0; f < givere; f++) {
  // Ferskt giversett for hver halvdel, saa paaliteligheten kan maales.
  const frø = (f < halv ? 21_000_000 : 21_500_000) + f;
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
  const fasitPoeng = poeng[fasitIdx]!;
  const fasitValør = snittValør(st.handlinger[fasitValg]!);
  const fasitRenons = antallRenons(st, st.handlinger[fasitValg]!);

  for (let i = 0; i < policyer.length; i++) {
    const v = valg[i]!;
    const h = st.handlinger[v]!;
    const a = akk[i]!;
    const anger = beste - st.verdi[v]!;
    a.anger += anger;
    a.ddVerdi += st.verdi[v]!;
    a.valør += snittValør(h);
    if (v === fasitValg) a.likFasit++;
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
    const dValør = snittValør(h) - fasitValør;
    const mål = dValør > 0 ? asym.valørHøyere : dValør < 0 ? asym.valørLavere : null;
    if (mål !== null) {
      mål.n++;
      mål.anger += anger;
      mål.dPoeng += dPoeng;
    }
    const dRenons = antallRenons(st, h) - fasitRenons;
    const mål2 = dRenons > 0 ? asym.renonsFlere : dRenons < 0 ? asym.renonsFærre : null;
    if (mål2 !== null) {
      mål2.n++;
      mål2.anger += anger;
      mål2.dPoeng += dPoeng;
    }
  }

  if (brukte % 25 === 0) {
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
  valørSnitt: number;
  likFasit: number;
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
    valørSnitt: a.valør / Math.max(1, a.n),
    likFasit: a.likFasit / Math.max(1, a.n),
  };
});

/**
 * PORTEN. Fasiten er DD-anger (lavere er bedre), referansen er poeng (høyere
 * er bedre) – altså motsatt retning.
 *
 * DET SMALE UTVALGET ER DEFINERT AV EN REGEL, IKKE AV UTFALLET: alle policyer
 * unntatt de fire som er konstruert for å være dårlige. Det er ikke pedanteri.
 * Dommen flytter seg med utvalget – sensitivitetstabellen under viser hvordan –
 * og et utvalg plukket etter at tallene forelå er ikke en test, det er en
 * illustrasjon. Regelen står i policykommentaren over, skrevet før målingen.
 */
const BEVISST_DÅRLIGE = new Set(["DD median", "DD verste", "tilfeldig", "høyest valør"]);
const DD_FAMILIE = new Set(["DD (fasiten)", "DD nr. 6", "DD nr. 26", "DD nr. 101"]);

interface Utvalg {
  readonly navn: string;
  readonly med: (r: Rad) => boolean;
}
const utvalg: Utvalg[] = [
  { navn: "bredt – alle policyer", med: () => true },
  { navn: "SMALT – uten de bevisst dårlige", med: (r) => !BEVISST_DÅRLIGE.has(r.navn) },
  { navn: "bare DD-rangfamilien", med: (r) => DD_FAMILIE.has(r.navn) },
  { navn: "DD-familien + nevro", med: (r) => DD_FAMILIE.has(r.navn) || r.navn === "nevro selv" },
  { navn: "bare ikke-DD", med: (r) => !DD_FAMILIE.has(r.navn) && !r.navn.startsWith("DD") },
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

si(`=== Vrakpolicyer, ${brukte} giver (${hoppet} hoppet over), DD-dybde ${dybde} ===`);
si(`Bare vraket varieres. Bud, trumf, etterlysning og hele kortspillet i alle`);
si(`fire seter er NevroHjerne. Poeng er budvinnersetets differanse mot snittet`);
si(`av de tre andre, i den ene runden vraket gjelder.`);
si("");
si(
  "policy".padEnd(16) +
    "DD-anger".padStart(10) +
    "DD-verdi".padStart(10) +
    "snittvalør".padStart(12) +
    "= fasit".padStart(9) +
    "poeng/runde".padStart(13),
);
si("-".repeat(70));
for (const r of [...rader].sort((a, b) => b.poeng - a.poeng)) {
  si(
    r.navn.padEnd(16) +
      r.anger.toFixed(3).padStart(10) +
      r.ddVerdi.toFixed(3).padStart(10) +
      r.valørSnitt.toFixed(2).padStart(12) +
      `${Math.round(100 * r.likFasit)} %`.padStart(9) +
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
  "retning".padEnd(24) +
    "n".padStart(7) +
    "snitt anger".padStart(13) +
    "d poeng".padStart(10) +
    "poeng per anger".padStart(17),
);
si("-".repeat(71));
const asymRader = [
  { navn: "kastet HØYERE enn fasit", r: asym.valørHøyere },
  { navn: "kastet LAVERE enn fasit", r: asym.valørLavere },
  { navn: "toemte FLERE farger", r: asym.renonsFlere },
  { navn: "toemte FAERRE farger", r: asym.renonsFærre },
];
for (const a of asymRader) {
  const n = Math.max(1, a.r.n);
  si(
    a.navn.padEnd(24) +
      String(a.r.n).padStart(7) +
      (a.r.anger / n).toFixed(3).padStart(13) +
      (a.r.dPoeng / n).toFixed(2).padStart(10) +
      (a.r.anger === 0 ? "–" : (a.r.dPoeng / a.r.anger).toFixed(2)).padStart(17),
  );
}

writeFileSync(
  "analyse/moe2-port-vrak.json",
  JSON.stringify({ givere, brukte, hoppet, dybde, rader, dommer, dom, domSmal, asym }, null, 2),
);
writeFileSync("analyse/moe2-port-vrak.txt", `${linjer.join("\n")}\n`);
console.log(`\nSkrev analyse/moe2-port-vrak.{txt,json}`);
