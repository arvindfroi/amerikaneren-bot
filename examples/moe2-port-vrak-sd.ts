/**
 * GODKJENNINGSPORTEN FOR SD-VRAKFASITEN.
 *
 *   node examples/moe2-port-vrak-sd.ts --givere 1400 [--verdener 64] [--filter 20]
 *                                      [--dybde 6] [--arbeidere 8] [--filtertest 24]
 *
 * SPØRSMÅLET. Fire fasiter er kjørt gjennom porten. Den ene som var single
 * dummy bestod (+0,925). Alle tre som var double dummy falt: trumf +0,234,
 * vrak +0,144, kortspill −0,609. Kortfasiten ble bygget om til SD og bestod
 * (+0,718) – fortegnet snudde i sju av åtte vinduer. Skillet går altså ikke
 * mellom beslutningstyper, men mellom fasiter som forutsetter informasjon du
 * HAR og informasjon du IKKE har.
 *
 * Dette skriptet prøver den påstanden på vraket. Alt annet er uendret fra
 * `moe2-port-vrak.ts`: samme metode, samme poengreferanse, samme utvalgsregel,
 * samme fire bevisst dårlige policyer. Eneste forskjell er hvordan et vrak
 * VURDERES – DD-oppslag byttet mot utspilling i K verdener.
 *
 * METODEN. Bare vraket varieres. Budrunden, trumfvalget, etterlysningen og
 * hele kortspillet i alle fire seter er NevroHjerne. Budrunden er
 * deterministisk og skjer FØR vraket, så alle policyer måles på nøyaktig de
 * samme stillingene. Poeng måles to ganger på uavhengige giversett, så
 * referansens egen pålitelighet er kjent FØR korrelasjonen tolkes.
 *
 * FORHÅNDSFILTERET, som er den ene ekte innrømmelsen. C(16,4) = 1 820
 * kandidater × K verdener × en hel utspilling er uoverkommelig. DD duger som
 * GROVSIL selv om den er målt ubrukelig som fasit, så SD rangerer de `filter`
 * DD-beste. Prisen for filteret er ikke antatt: `--filtertest` måler den
 * direkte ved å kjøre SD over de 100 DD-beste på et lite utvalg og se hvor ofte
 * (og hvor mye) den beste utenfor topp-20 slår den beste innenfor.
 *
 * DEN ÆRLIGE INNVENDINGEN, som må stå: SD-fasiten estimerer forventet
 * poengutfall mot NevroHjerne, og referansen MÅLER poengutfall mot
 * NevroHjerne. Med K → ∞ ville porten vært tautologisk. Det informative er
 * derfor ikke at SD består, men (a) at DD IKKE gjør det på nøyaktig samme
 * datagrunnlag – begge dommene regnes ut her, av de samme givene og de samme
 * policyene – og (b) at et gjennomførbart K holder.
 *
 * UTVALGSREGELEN ER SKREVET NED SAMMEN MED POLICYENE, FØR TALLENE FORELIGGER.
 * Det smale utvalget er «alle unntatt de som er konstruert for å være
 * dårlige», nøyaktig samme regel og nøyaktig samme fire navn som i DD-kjøringen.
 * Grunnen står i docs/moe2.md: et håndplukket smalt utvalg ga vrak +0,429
 * GODKJENT der en nedskrevet regel ga +0,144 AVVIST.
 */

import { fork } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lagRng } from "../src/kort.ts";
import { beskriv, mål } from "../src/moe2/maaling.ts";
import { kortIndeks } from "../src/neat/trekk.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { prøvPorten } from "../src/moe2/port.ts";
import { intTilKort } from "../src/solver/dds.ts";
import { besteIndeks, trekkVerdener, vurderVrakSD } from "../src/moe2/sdkort.ts";
import { kortFraIndeks, lagVrakstilling } from "../src/moe2/eksperter/vrak.ts";

let givere = 1400;
let dybde = 6;
let verdener = 64;
let filter = 20;
let arbeidere = 8;
let filtertest = 24;
let filterBredt = 100;
let arbeider = -1;
/** Suffiks på utdatafilene, så en tilleggskjøring ikke overskriver hovedkjøringen. */
let merke = "";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === "--givere") givere = Number(process.argv[++i]);
  if (a === "--dybde") dybde = Number(process.argv[++i]);
  if (a === "--verdener") verdener = Number(process.argv[++i]);
  if (a === "--filter") filter = Number(process.argv[++i]);
  if (a === "--filterbredt") filterBredt = Number(process.argv[++i]);
  if (a === "--arbeidere") arbeidere = Number(process.argv[++i]);
  if (a === "--filtertest") filtertest = Number(process.argv[++i]);
  if (a === "--arbeider") arbeider = Number(process.argv[++i]);
  if (a === "--merke") merke = String(process.argv[++i]);
}

const nevro = new NevroAgent();
const valørAv = (i: number): number => (i % 13) + 2;
const fargeAv = (i: number): number => Math.floor(i / 13);

/** Én vrakstilling med hele DD-tabellen ferdig løst. */
interface Stilling {
  readonly bv: number;
  /** Tilstanden som står i VRAK – felles utgangspunkt for alle policyene. */
  readonly state: GameState;
  readonly handlinger: readonly (readonly number[])[];
  readonly ddVerdi: readonly number[];
  /** Handlingsindekser sortert etter fallende DD-verdi. */
  readonly rangert: readonly number[];
  readonly nevroIdx: number;
  readonly hånd: readonly number[];
  readonly indeks: ReadonlyMap<string, number>;
  readonly antall: number;
  readonly fargeLengde: readonly number[];
}

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
    bv,
    state: s,
    handlinger: rå.handlinger,
    ddVerdi: rå.verdi,
    rangert,
    nevroIdx: rå.takValg,
    hånd,
    indeks,
    antall: rå.handlinger[0]!.length,
    fargeLengde,
  };
}

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

/** Rang r i DD-tabellen (0 = beste), klippet til tabellens lengde. */
function ddRang(st: Stilling, r: number): number {
  return st.rangert[Math.min(r, st.rangert.length - 1)]!;
}

/**
 * POLICYENE. Fem familier, med vilje – kravet i docs/moe2.md er at porten
 * kjøres på tvers av familier, for det var mangelen på det som lot både
 * kortfasiten og det håndplukkede vrakutvalget passere.
 *
 *   - SD-fasiten og nær-varianter (nr. 2 og nr. 5 i SD-rangeringen av det
 *     forhåndsfiltrerte settet). Dette er familien fasiten selv tilhører.
 *   - DD-fasiten og nær-varianter (nr. 26, nr. 101 av 1 820). En HELT annen
 *     familie, og den som allerede er avvist – tas med nettopp derfor.
 *   - NevroHjerne, referansen på poeng, som ikke automatisk er et tak.
 *   - Håndfaste heuristikker (lavest valør, korteste farge).
 *   - Bevisst dårlige (DD median, DD verste, høyest valør, tilfeldig), for at
 *     den brede porten skal ha spenn nok til å måle noe.
 *
 * DET SMALE UTVALGET, definert her og ikke etterpå: alle unntatt de fire
 * bevisst dårlige. Identisk regel og identiske navn som i DD-kjøringen, så
 * +0,144 og tallet herfra kan settes rett mot hverandre.
 */
type Policy =
  | { readonly navn: string; readonly slag: "sd"; readonly rang: number }
  | {
      readonly navn: string;
      readonly slag: "annen";
      readonly velg: (st: Stilling, rng: () => number) => number;
    };

const policyer: Policy[] = [
  { navn: "SD (fasiten)", slag: "sd", rang: 0 },
  { navn: "SD nr. 2", slag: "sd", rang: 1 },
  { navn: "SD nr. 5", slag: "sd", rang: 4 },
  { navn: "DD (fasiten)", slag: "annen", velg: (st) => ddRang(st, 0) },
  { navn: "DD nr. 26", slag: "annen", velg: (st) => ddRang(st, 25) },
  { navn: "DD nr. 101", slag: "annen", velg: (st) => ddRang(st, 100) },
  { navn: "nevro selv", slag: "annen", velg: (st) => st.nevroIdx },
  { navn: "lavest valør", slag: "annen", velg: (st) => lavesteEtter(st, valørAv) },
  {
    navn: "korteste farge",
    slag: "annen",
    velg: (st) => lavesteEtter(st, (k) => st.fargeLengde[fargeAv(k)]! * 100 + valørAv(k)),
  },
  { navn: "DD median", slag: "annen", velg: (st) => ddRang(st, Math.floor(st.rangert.length / 2)) },
  { navn: "DD verste", slag: "annen", velg: (st) => ddRang(st, st.rangert.length - 1) },
  { navn: "høyest valør", slag: "annen", velg: (st) => lavesteEtter(st, (k) => -valørAv(k)) },
  {
    navn: "tilfeldig",
    slag: "annen",
    velg: (st, rng) => {
      const igjen = [...st.hånd];
      const valgt: number[] = [];
      for (let i = 0; i < st.antall; i++) {
        valgt.push(...igjen.splice(Math.floor(rng() * igjen.length), 1));
      }
      return idxAv(st, valgt);
    },
  },
];

const BEVISST_DÅRLIGE = new Set(["DD median", "DD verste", "høyest valør", "tilfeldig"]);
const SD_FAMILIE = new Set(["SD (fasiten)", "SD nr. 2", "SD nr. 5"]);
const DD_FAMILIE = new Set(["DD (fasiten)", "DD nr. 26", "DD nr. 101"]);

/** Spiller runden ferdig med NevroHjerne på de EKTE hendene etter at `vrak` er lagt. */
function spillUt(st: Stilling, vrak: readonly number[]): number {
  let s = utfør(st.state, { type: "VRAK", spiller: st.bv, kort: vrak.map(kortFraIndeks) }).state;
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
    s = utfør(s, nevro.velgHandling(s)).state;
  }
  const egne = s.totalPoeng[st.bv] ?? 0;
  return egne - (s.totalPoeng.reduce((a, b) => a + b, 0) - egne) / 3;
}

const snittValør = (v: readonly number[]): number => v.reduce((a, b) => a + valørAv(b), 0) / v.length;
function antallRenons(st: Stilling, vrak: readonly number[]): number {
  const ute = new Set(vrak);
  const lengde = [0, 0, 0, 0];
  for (const k of st.hånd) if (!ute.has(k)) lengde[fargeAv(k)]!++;
  return lengde.filter((x) => x === 0).length;
}

/** Rådataene for én giv. Alt aggregeres i foreldreprosessen, av hensyn til sharding. */
interface Giv {
  readonly f: number;
  readonly poeng: number[];
  readonly sdAnger: number[];
  readonly ddAnger: number[];
  readonly valør: number[];
  readonly renons: number[];
  readonly likFasit: number[];
  /** SD-fasitens egen anger mot det bredeste settet som ble målt – filterets pris. */
  readonly filterkost: number;
}

/** Én rad fra filtertesten: slår den beste utenfor topp-N den beste innenfor? */
interface Filterrad {
  readonly likt: number;
  /** SD-verdien til de to valgene, målt i et UAVHENGIG verdenssett. */
  readonly sdSmalt: number;
  readonly sdBredt: number;
  readonly rangBredt: number;
}

const frøAv = (f: number): number => (f < Math.floor(givere / 2) ? 26_000_000 : 26_500_000) + f;

function énGiv(f: number): Giv | null {
  const frø = frøAv(f);
  const st = byggStilling(frø);
  if (st === null) return null;
  const rngPolicy = lagRng(frø ^ 0x5f37_59df);
  const rngVerden = lagRng(frø ^ 0x9e37_79b9);

  // 1. Alle ikke-SD-policyer velger først. De ser ikke SD-tabellen, så
  //    rekkefølgen kan ikke smitte.
  const valg = new Array<number>(policyer.length).fill(-1);
  for (let i = 0; i < policyer.length; i++) {
    const p = policyer[i]!;
    if (p.slag === "annen") valg[i] = p.velg(st, rngPolicy);
  }

  // 2. Kandidatsettet SD faktisk måler: de `filter` DD-beste (fasitens egen,
  //    nedskrevne kandidatregel) PLUSS alle andre policyers valg, slik at
  //    hver policy får en SD-verdi og angeren er sammenlignbar på tvers.
  const topp = st.rangert.slice(0, Math.min(filter, st.rangert.length));
  const sett = new Set<number>(topp);
  for (const v of valg) if (v >= 0) sett.add(v);
  const evaluert = [...sett];

  const vurdert = vurderVrakSD(
    st.state,
    nevro,
    evaluert.map((i) => st.handlinger[i]!),
    { verdener, rng: rngVerden },
  );
  if (vurdert.length === 0) return null;
  const sdVerdi = new Map<number, number>();
  vurdert.forEach((v) => sdVerdi.set(evaluert[v.indeks]!, v.verdi));

  // 3. SD-policyene rangerer BARE innenfor forhåndsfilteret. Å la dem plukke
  //    fra hele `evaluert` ville gitt fasiten gratis innsyn i hva de andre
  //    policyene valgte, og det er ikke en fasit man kan bygge en ekspert av.
  const sdRangert = [...topp].sort((a, b) => sdVerdi.get(b)! - sdVerdi.get(a)!);
  for (let i = 0; i < policyer.length; i++) {
    const p = policyer[i]!;
    if (p.slag === "sd") valg[i] = sdRangert[Math.min(p.rang, sdRangert.length - 1)]!;
  }

  // 4. Anger på begge fasiter, målt på nøyaktig de samme valgene.
  const sdBeste = Math.max(...evaluert.map((i) => sdVerdi.get(i)!));
  const ddBeste = st.ddVerdi[st.rangert[0]!]!;
  const fasitValg = valg[0]!;

  const poeng = valg.map((v) => spillUt(st, st.handlinger[v]!));
  return {
    f,
    poeng,
    sdAnger: valg.map((v) => sdBeste - sdVerdi.get(v)!),
    ddAnger: valg.map((v) => ddBeste - st.ddVerdi[v]!),
    valør: valg.map((v) => snittValør(st.handlinger[v]!)),
    renons: valg.map((v) => antallRenons(st, st.handlinger[v]!)),
    likFasit: valg.map((v) => (v === fasitValg ? 1 : 0)),
    filterkost: sdBeste - sdVerdi.get(fasitValg)!,
  };
}

/**
 * FILTERTESTEN. Hva koster det å rangere bare de `filter` DD-beste?
 *
 * TO VERDENSSETT, og det er ikke pynt. Velger man både innenfor topp-`filter`
 * og innenfor topp-`filterBredt` med de SAMME estimatene, vinner det brede
 * settet automatisk: maks over 100 støyete tall er større enn maks over 20 selv
 * når alle 100 har nøyaktig samme sanne verdi. Det er vinnerforbannelsen, og
 * den ville målt filteret til å koste noe det ikke koster.
 *
 * Derfor: VELG i sett A, MÅL i sett B. Da er sammenligningen forventningsrett.
 */
function énFilterGiv(frø: number): Filterrad | null {
  const st = byggStilling(frø);
  if (st === null) return null;
  const bredt = st.rangert.slice(0, Math.min(filterBredt, st.rangert.length));
  if (bredt.length <= filter) return null;
  const rngA = lagRng(frø ^ 0x9e37_79b9);
  const rngB = lagRng(frø ^ 0x2545_f491);
  const settA = trekkVerdener(st.state, st.bv, verdener, rngA);
  const settB = trekkVerdener(st.state, st.bv, verdener, rngB);
  if (settA.length === 0 || settB.length === 0) return null;

  const iA = vurderVrakSD(
    st.state,
    nevro,
    bredt.map((i) => st.handlinger[i]!),
    { verdener, rng: rngA, verdenerHender: settA },
  );
  if (iA.length === 0) return null;
  const smaltIdx = besteIndeks(iA.slice(0, filter));
  const bredtIdx = besteIndeks(iA);

  const iB = vurderVrakSD(
    st.state,
    nevro,
    [st.handlinger[bredt[smaltIdx]!]!, st.handlinger[bredt[bredtIdx]!]!],
    { verdener, rng: rngB, verdenerHender: settB },
  );
  if (iB.length < 2) return null;
  return {
    likt: smaltIdx === bredtIdx ? 1 : 0,
    sdSmalt: iB[0]!.verdi,
    sdBredt: iB[1]!.verdi,
    rangBredt: bredtIdx,
  };
}

// --- Arbeidermodus ---------------------------------------------------------

const delfil = (i: number): string => `analyse/.moe2-port-vrak-sd${merke}-del-${i}.json`;

if (arbeider >= 0) {
  const giver: Giv[] = [];
  let hoppet = 0;
  for (let f = arbeider; f < givere; f += arbeidere) {
    const g = énGiv(f);
    if (g === null) hoppet++;
    else giver.push(g);
    if (process.send) process.send({ ferdig: 1 });
  }
  const filterrader: Filterrad[] = [];
  for (let g = arbeider; g < filtertest; g += arbeidere) {
    const r = énFilterGiv(27_000_000 + g);
    if (r !== null) filterrader.push(r);
    if (process.send) process.send({ ferdig: 1 });
  }
  writeFileSync(delfil(arbeider), JSON.stringify({ giver, hoppet, filterrader }));
  process.exit(0);
}

// --- Foreldreprosess -------------------------------------------------------

const totaltArbeid = givere + filtertest;
const t0 = Date.now();
let gjort = 0;

const kjørArbeidere = async (): Promise<{
  giver: Giv[];
  hoppet: number;
  filterrader: Filterrad[];
}> => {
  await Promise.all(
    Array.from({ length: arbeidere }, (_, i) => {
      return new Promise<void>((ferdig, feil) => {
        const barn = fork(process.argv[1]!, [...process.argv.slice(2), "--arbeider", String(i)]);
        barn.on("message", () => {
          gjort++;
          if (gjort % 10 === 0) {
            const sek = (Date.now() - t0) / 1000;
            process.stdout.write(
              `\r  ${gjort}/${totaltArbeid}, ${(sek / gjort).toFixed(2)} s/enhet, ` +
                `est. ${(((sek / gjort) * (totaltArbeid - gjort)) / 60).toFixed(1)} min igjen   `,
            );
          }
        });
        barn.on("exit", (kode) => (kode === 0 ? ferdig() : feil(new Error(`arbeider ${i}: ${kode}`))));
      });
    }),
  );
  const giver: Giv[] = [];
  const filterrader: Filterrad[] = [];
  let hoppet = 0;
  for (let i = 0; i < arbeidere; i++) {
    const sti = delfil(i);
    if (!existsSync(sti)) throw new Error(`mangler ${sti}`);
    const del = JSON.parse(readFileSync(sti, "utf8")) as {
      giver: Giv[];
      hoppet: number;
      filterrader: Filterrad[];
    };
    giver.push(...del.giver);
    filterrader.push(...del.filterrader);
    hoppet += del.hoppet;
  }
  for (let i = 0; i < arbeidere; i++) unlinkSync(delfil(i));
  giver.sort((a, b) => a.f - b.f);
  return { giver, hoppet, filterrader };
};

const { giver, hoppet, filterrader } = await kjørArbeidere();
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
  valør: number;
  renons: number;
  likFasit: number;
}
const rader: Rad[] = policyer.map((p, i) => ({
  navn: p.navn,
  sdAnger: snitt(giver.map((g) => g.sdAnger[i]!)),
  ddAnger: snitt(giver.map((g) => g.ddAnger[i]!)),
  poengA: snitt(iA.map((g) => g.poeng[i]!)),
  poengB: snitt(iB.map((g) => g.poeng[i]!)),
  poeng: snitt(giver.map((g) => g.poeng[i]!)),
  valør: snitt(giver.map((g) => g.valør[i]!)),
  renons: snitt(giver.map((g) => g.renons[i]!)),
  likFasit: snitt(giver.map((g) => g.likFasit[i]!)),
}));

interface Utvalg {
  readonly navn: string;
  readonly med: (r: Rad) => boolean;
}
const utvalg: Utvalg[] = [
  { navn: "bredt – alle policyer", med: () => true },
  { navn: "SMALT – uten de bevisst dårlige", med: (r) => !BEVISST_DÅRLIGE.has(r.navn) },
  { navn: "bare SD-rangfamilien", med: (r) => SD_FAMILIE.has(r.navn) },
  { navn: "SD-familien + nevro", med: (r) => SD_FAMILIE.has(r.navn) || r.navn === "nevro selv" },
  { navn: "bare ikke-SD", med: (r) => !SD_FAMILIE.has(r.navn) },
  { navn: "SD- + DD-familien", med: (r) => SD_FAMILIE.has(r.navn) || DD_FAMILIE.has(r.navn) },
];

/**
 * Begge fasitene dømmes på NØYAKTIG samme datagrunnlag: samme giver, samme
 * policyer, samme poengmåling. Da er forskjellen mellom dommene fasiten, og
 * ikke utvalget – som er den ene tingen docs/moe2.md sier har snudd en dom før.
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
  valørHøyere: nyRetning(),
  valørLavere: nyRetning(),
  renonsFlere: nyRetning(),
  renonsFærre: nyRetning(),
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
    const dValør = g.valør[i]! - g.valør[0]!;
    if (dValør > 0) tell(asym.valørHøyere, anger, dPoeng);
    else if (dValør < 0) tell(asym.valørLavere, anger, dPoeng);
    const dRenons = g.renons[i]! - g.renons[0]!;
    if (dRenons > 0) tell(asym.renonsFlere, anger, dPoeng);
    else if (dRenons < 0) tell(asym.renonsFærre, anger, dPoeng);
  }
}

// --- Målekontrakten: gulv og tak fra SAMME giver ---------------------------

const iNavn = (navn: string): number => policyer.findIndex((p) => p.navn === navn);
const iSD = iNavn("SD (fasiten)");
const iDD = iNavn("DD (fasiten)");
const iNevro = iNavn("nevro selv");
const iTilf = iNavn("tilfeldig");
const målingSD = mål({
  navn: "SD-vrak",
  stillinger: giver,
  holdout: true,
  retning: "hoeyereErBedre",
  kandidat: (g) => g.poeng[iSD]!,
  gulv: (g) => g.poeng[iTilf]!,
  tak: (g) => g.poeng[iNevro]!,
});
const målingDD = mål({
  navn: "DD-vrak",
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
  `=== SD-vrakpolicyer, ${giver.length} giver (${hoppet} hoppet over), ` +
    `${verdener} verdener, forhaandsfilter topp-${filter} av DD (dybde ${dybde}) ===`,
);
si(`Bare vraket varieres. Bud, trumf, etterlysning og hele kortspillet i alle`);
si(`fire seter er NevroHjerne. Poeng er budvinnersetets differanse mot snittet`);
si(`av de tre andre, i den ene runden vraket gjelder.`);
si("");
si(
  "policy".padEnd(16) +
    "SD-anger".padStart(10) +
    "DD-anger".padStart(10) +
    "snittvaloer".padStart(13) +
    "renons".padStart(8) +
    "= fasit".padStart(9) +
    "poeng/runde".padStart(13),
);
si("-".repeat(79));
for (const r of [...rader].sort((a, b) => b.poeng - a.poeng)) {
  si(
    r.navn.padEnd(16) +
      r.sdAnger.toFixed(3).padStart(10) +
      r.ddAnger.toFixed(3).padStart(10) +
      r.valør.toFixed(2).padStart(13) +
      r.renons.toFixed(2).padStart(8) +
      `${Math.round(100 * r.likFasit)} %`.padStart(9) +
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
  "retning".padEnd(24) +
    "n".padStart(7) +
    "snitt anger".padStart(13) +
    "d poeng".padStart(10) +
    "poeng per anger".padStart(17),
);
si("-".repeat(71));
for (const a of [
  { navn: "kastet HOEYERE enn fasit", r: asym.valørHøyere },
  { navn: "kastet LAVERE enn fasit", r: asym.valørLavere },
  { navn: "toemte FLERE farger", r: asym.renonsFlere },
  { navn: "toemte FAERRE farger", r: asym.renonsFærre },
]) {
  const n = Math.max(1, a.r.n);
  si(
    a.navn.padEnd(24) +
      String(a.r.n).padStart(7) +
      (a.r.anger / n).toFixed(3).padStart(13) +
      (a.r.dPoeng / n).toFixed(2).padStart(10) +
      (a.r.anger === 0 ? "–" : (a.r.dPoeng / a.r.anger).toFixed(2)).padStart(17),
  );
}

si("");
si(`=== HVA FORHAANDSFILTERET KOSTER (topp-${filter} mot topp-${filterBredt}) ===`);
si(`Fasitens egen SD-anger mot alt som ble maalt i portkjoeringen (OEVRE grense:`);
si(`tallet inneholder ogsaa vinnerforbannelsen, siden maks tas over flere estimater):`);
si(`  ${snitt(giver.map((g) => g.filterkost)).toFixed(3)} poeng over ${giver.length} giver`);
if (filterrader.length > 0) {
  const likt = snitt(filterrader.map((r) => r.likt));
  const tap = snitt(filterrader.map((r) => r.sdBredt - r.sdSmalt));
  si(`Egen filtertest, ${filterrader.length} giver, VALGT i sett A og MAALT i sett B:`);
  si(`  samme vrak valgt         ${(100 * likt).toFixed(0)} %`);
  si(`  gevinst ved topp-${filterBredt}      ${tap >= 0 ? "+" : ""}${tap.toFixed(3)} poeng`);
  si(
    `  DD-rang til den SD-beste i det brede settet, snitt ` +
      `${snitt(filterrader.map((r) => r.rangBredt)).toFixed(1)} av ${filterBredt}`,
  );
} else {
  si(`Filtertesten ble ikke kjoert (--filtertest 0).`);
}

writeFileSync(
  `analyse/moe2-port-vrak-sd${merke}.json`,
  JSON.stringify(
    {
      givere,
      brukte: giver.length,
      hoppet,
      dybde,
      verdener,
      filter,
      filterBredt,
      rader,
      dommerSD,
      dommerDD,
      asym,
      målingSD,
      målingDD,
      filterkost: snitt(giver.map((g) => g.filterkost)),
      filterrader,
    },
    null,
    2,
  ),
);
writeFileSync(`analyse/moe2-port-vrak-sd${merke}.txt`, `${linjer.join("\n")}\n`);
console.log(`\nSkrev analyse/moe2-port-vrak-sd${merke}.{txt,json}`);
