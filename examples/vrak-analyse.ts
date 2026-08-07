/**
 * VRAKET: HVA ER DET FOR, OG KAN EN REGEL SLÅ NEVROS?
 *
 *   node examples/vrak-analyse.ts --givere 2000 --arbeidere 6
 *   node examples/vrak-analyse.ts --givere 2000 --froe 32000000 --vekter analyse/vrak-analyse.json
 *
 * BAKGRUNNEN. Vraket gjøres i dag av NevroHjerne i ALLE våre agenter – E1 og
 * konvensjonsvakten overstyrer bare kortspillet – så hvert tall vi har målt på
 * vrak er nevros oppførsel, identisk i alle kolonner. Atferdsprofilen mot
 * MesterAI (`analyse/mesterai-atferd2.txt`, 320 kontrakter) ga to hint: MesterAI
 * tømmer 0,95 farger med vraket mot nevros 0,89, og kaster ess/konge i 4 % av
 * kortene mot nevros 3 %. Den sterkere spilleren blir altså renons OFTERE og
 * kaster honnører OFTERE.
 *
 * Arvind sier hvorfor: man vraker for å bli kvitt en FARGE, ikke et kort, fordi
 * renons er retten til å trumfe. Og han presiserer at ess og konge ikke er
 * samme sak – kongen kan hives, esset nesten aldri.
 *
 * TRE MÅLINGER, i den rekkefølgen:
 *
 *  1. TREKK → UTFALL, med GIV-FASTE EFFEKTER. Hvert vrak av samme hånd spilles
 *     ut, og utfallet regresseres på trekkene ved hånden som blir igjen. De
 *     faste effektene er ikke pynt: uten dem måler «renonser» like mye at
 *     hender som TÅLER en renons er gode hender som at renonsen er verdt noe.
 *     I tillegg rapporteres regresjonen over BARE de tilfeldige vrakene, der
 *     trekkene er eksogene og koeffisienten er en ekte kausal effekt.
 *
 *  2. REGLENE, PARRET MOT NEVROS VRAK på nøyaktig samme giv, med dagens beste
 *     spiller (`vakt:at:e1:e1-modell/sd-r2.bin`) i budvinnersetet. Ess og konge
 *     har hver sin regel, aldri én felles «honnør»-regel.
 *
 *  3. NÅR LØNNER DET SEG Å HIVE KONGEN? Et parret ETT-KORTS BYTTE: samme hånd,
 *     samme tre andre kastekort, kongen inn eller ut. Delt på om essen i samme
 *     farge blir igjen, fargens lengde, og om kastet gjør fargen renons. Samme
 *     forsøk for essen, rapportert for seg.
 *
 *  4. HÅNDVERDI. Predikerer «lengde + hvor styrken sitter» SD-estimatet bedre
 *     enn ren lengde? Ren regresjon på `analyserGiv`, ingen spilling.
 *
 * MÅLEOPPSETTET. Budrunden spilles av NevroHjerne og skjer FØR vraket, så alle
 * policyer måles på nøyaktig de samme stillingene. Etter vraket spiller
 * `--spiller` budvinnersetet og NevroHjerne de tre andre. Poeng er
 * budvinnersetets differanse mot snittet av de tre andre, i den ene runden
 * vraket gjelder – samme poengreferanse som `moe2-port-vrak-sd.ts`, så tallene
 * kan settes mot hverandre.
 *
 * DEN ÆRLIGE INNVENDINGEN, som må stå: makkeren er en nevro-agent, og en regel
 * som gjør budvinnerhånden bedre kan i prinsippet gjøre den vanskeligere for
 * makkeren å samarbeide med. Tallet her er derfor «hva vraket er verdt i vårt
 * eget oppsett», ikke «hva vraket er verdt i et fire-E1-bord».
 */

import { fork } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { lagRng } from "../src/kort.ts";
import { kortIndeks } from "../src/neat/trekk.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek, type Innagent } from "../src/moe2/konvensjonsvakt.ts";
import { kortFraIndeks } from "../src/moe2/eksperter/vrak.ts";
import { analyserGiv, tømCache } from "../src/neat/singledummy.ts";
import {
  fargeAv,
  fargelengder,
  håndprofil,
  håndtrekk,
  valørAv,
  vrakKorteste,
  vrakKortesteBevarAK,
  vrakKortesteBevarEss,
  vrakLavesteEtter,
  vrakLavestValør,
  vrakRenonsUtenEss,
  vrakVeid,
  VEKTER_MÅLT,
  type Håndtrekk,
  type Vrakvekter,
} from "../src/moe2/vrakregler.ts";
import { ols, r2Ute, sentrerPerGruppe } from "../src/moe2/regresjon.ts";

// --- Argumenter -------------------------------------------------------------

let givere = 2000;
let arbeidere = 6;
let frøBase = 31_000_000;
let spillerSpek = "vakt:at:e1:e1-modell/d7alle.bin";
let vektfil = "";
let merke = "";
let arbeider = -1;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === "--givere") givere = Number(process.argv[++i]);
  else if (a === "--arbeidere") arbeidere = Number(process.argv[++i]);
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--spiller") spillerSpek = String(process.argv[++i]);
  else if (a === "--vekter") vektfil = String(process.argv[++i]);
  else if (a === "--merke") merke = String(process.argv[++i]);
  else if (a === "--arbeider") arbeider = Number(process.argv[++i]);
}

/**
 * Vektene til den veide regelen. Er de ikke oppgitt, er regelen IKKE med –
 * å måle den på de samme givene som ga vektene ville vært å måle den på sitt
 * eget treningssett.
 */
let vekter: Vrakvekter | null = null;
if (vektfil !== "") {
  const rå = JSON.parse(readFileSync(vektfil, "utf8")) as { vekter?: Vrakvekter };
  vekter = rå.vekter ?? VEKTER_MÅLT;
}

// --- Spillerne --------------------------------------------------------------

const nevro = new NevroAgent();

/** Bygger budvinnerens spiller fra spesifikasjonen. Bare det vi trenger her. */
function lagSpiller(spec: string): Innagent {
  const vakt = delVaktspek(spec);
  if (vakt !== null) return new Konvensjonsvakt(lagSpiller(vakt.indre), vakt.valg);
  if (spec === "nevro") return new NevroAgent();
  if (spec.startsWith("e1:")) return E1Agent.fraFil(spec.slice(3));
  throw new Error(`Ukjent spiller «${spec}» (bruk nevro, e1:<fil> eller vakt:<flagg>:<indre>)`);
}
const spiller = lagSpiller(spillerSpek);

// --- Én giv -----------------------------------------------------------------

/** Utfallet av å spille én runde ferdig etter et gitt vrak. */
interface Utfall {
  readonly poeng: number;
  readonly lagStikk: number;
  readonly klart: number;
  readonly bud: number;
  /** Lengden på den FAKTISK valgte trumfen i hånden etter vrak. */
  readonly trumflengde: number;
}

/**
 * Spiller runden ferdig: `spiller` i budvinnersetet, NevroHjerne i de tre
 * andre. Agentene nullstilles først – de har kamphukommelse, og to policyer
 * skal ikke kunne påvirke hverandre gjennom den.
 */
function spillUt(st: GameState, bv: number, hånd: readonly number[], vrak: readonly number[]): Utfall {
  nevro.nyKamp();
  spiller.nyKamp?.();
  let s = utfør(st, { type: "VRAK", spiller: bv, kort: vrak.map(kortFraIndeks) }).state;
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
    const h: Handling = iTur === bv ? spiller.velgHandling(s) : nevro.velgHandling(s);
    s = utfør(s, h).state;
  }
  const egne = s.totalPoeng[bv] ?? 0;
  const poeng = egne - (s.totalPoeng.reduce((a, b) => a + b, 0) - egne) / 3;
  const res = s.sisteRunde;
  const ute = new Set(vrak);
  const igjen = hånd.filter((k) => !ute.has(k));
  const lengder = fargelengder(igjen);
  // Trumfen velges av spilleren i VELG-fasen, ETTER vraket. Fargeindeksen
  // hentes av den kanoniske `kortIndeks` og ikke av et eget oppslag – en egen
  // fargekoding her ville vært samme klasse feil som `i >> 4` mot `floor(c/13)`.
  const trumfIdx = s.trumf === null ? -1 : fargeAv(kortIndeks({ farge: s.trumf, verdi: 2 }));
  return {
    poeng,
    lagStikk: res?.lagStikk ?? 0,
    klart: res?.klart === true ? 1 : 0,
    bud: res?.melding.bud ?? 0,
    trumflengde: trumfIdx < 0 ? Math.max(...lengder) : lengder[trumfIdx]!,
  };
}

/** En navngitt vrakpolicy. */
interface Policy {
  readonly navn: string;
  /** Er valget tilfeldig? Bare de gir EKSOGEN variasjon i trekkene. */
  readonly tilfeldig: boolean;
  readonly velg: (hånd: readonly number[], antall: number, rng: () => number) => number[];
}

function tilfeldigVrak(hånd: readonly number[], antall: number, rng: () => number): number[] {
  const igjen = [...hånd];
  const valgt: number[] = [];
  for (let i = 0; i < antall; i++) valgt.push(...igjen.splice(Math.floor(rng() * igjen.length), 1));
  return valgt.sort((a, b) => a - b);
}

const policyer: Policy[] = [
  { navn: "nevro (dagens)", tilfeldig: false, velg: () => [] }, // fylles fra state
  { navn: "korteste, aldri ess", tilfeldig: false, velg: (h, n) => vrakKortesteBevarEss(h, n) },
  { navn: "korteste, aldri A/K", tilfeldig: false, velg: (h, n) => vrakKortesteBevarAK(h, n) },
  { navn: "korteste, fritt", tilfeldig: false, velg: (h, n) => vrakKorteste(h, n) },
  { navn: "renons uten ess", tilfeldig: false, velg: (h, n) => vrakRenonsUtenEss(h, n) },
  { navn: "lavest valør", tilfeldig: false, velg: (h, n) => vrakLavestValør(h, n) },
  { navn: "tilfeldig 1", tilfeldig: true, velg: tilfeldigVrak },
  { navn: "tilfeldig 2", tilfeldig: true, velg: tilfeldigVrak },
  { navn: "tilfeldig 3", tilfeldig: true, velg: tilfeldigVrak },
  { navn: "tilfeldig 4", tilfeldig: true, velg: tilfeldigVrak },
];
if (vekter !== null) {
  policyer.push({ navn: "veid (målte vekter)", tilfeldig: false, velg: (h, n) => vrakVeid(h, n, vekter!) });
}

/**
 * RENONSBYTTET – den direkte prisen på en renons, isolert til ETT kort.
 *
 * «Hva er en renons verdt?» kan ikke leses av en tabell over farger igjen: de
 * hendene som KAN bli renons er systematisk andre hender enn de som ikke kan.
 * Her stilles i stedet det faktiske valget: for å tømme den korteste fargen må
 * du kaste dens HØYESTE kort. Alternativet er å beholde det og kaste ett lavt
 * kort til fra en annen farge. De to vrakene er ellers identiske.
 *
 * Det er nettopp derfor toppkortets valør følger med: er det et ess, er dette
 * samtidig ess-spørsmålet, og de to skal ikke blandes sammen.
 */
interface Renonsrad {
  /** Poeng med RENONS minus poeng uten. Positivt = renonsen var verdt prisen. */
  readonly d: number;
  readonly dLagStikk: number;
  /** Valøren på toppkortet i den korte fargen – prisen som ble betalt. */
  readonly toppValør: number;
  /** Fargens lengde før vraket. */
  readonly lengde: number;
  /** Farger igjen i hånden i renons-varianten. */
  readonly fargerIgjen: number;
}

/** Radene ett-korts-byttet gir. Ess og konge holdes atskilt hele veien. */
interface Bytterad {
  /** 14 = ess, 13 = konge. */
  readonly valør: number;
  /** Poeng med honnøren KASTET minus poeng med den BEHOLDT. */
  readonly d: number;
  /** Beholder hånden essen i samme farge etter kastet? (Bare for konge-raden.) */
  readonly essIgjen: number;
  /** Fargens lengde i hånden FØR vraket. */
  readonly lengde: number;
  /** Gjør kastet fargen renons, uten at alternativet gjør det? */
  readonly girRenons: number;
  readonly dLagStikk: number;
}

interface Giv {
  readonly f: number;
  /** SD-estimatet for budvinnersetet – kontrollen for håndstyrke. */
  readonly sdSnitt: number;
  readonly sdSete: number;
  readonly bud: number;
  readonly poeng: number[];
  readonly lagStikk: number[];
  readonly klart: number[];
  readonly trekk: Håndtrekk[];
  readonly trumflengde: number[];
  /** Nøkkelen til hver policys vrak – for EKSAKT «= nevro»-andel. */
  readonly vrakNøkkel: string[];
  readonly bytter: Bytterad[];
  readonly renonsbytte: Renonsrad | null;
  /** Håndprofilene til alle fire seter, med SD-utfallet sitt. Til del 4. */
  readonly profiler: { readonly x: number[]; readonly y: number }[];
}

const HÅND = 12;

function énGiv(f: number): Giv | null {
  const frø = frøBase + f;
  const start: GameState = opprettSpill({ antallSpillere: 4 }, frø);

  // SD-kontrollen FØRST, mens stillingen fortsatt står i budrunden. Cachen
  // tømmes per giv, ellers vokser den til alle givene i minnet.
  tømCache();
  const analyse = analyserGiv(start, nevro);

  const profiler = start.hender.map((h, p) => {
    const pr = håndprofil(h.slice(0, HÅND).map(kortIndeks));
    return {
      x: [
        pr.lengste,
        pr.nestLengste,
        pr.fargerBrukt,
        pr.honnør,
        pr.trumfHonnør,
        pr.trumfSerie,
        pr.sideAK,
        pr.korteSterke,
        pr.ess,
        pr.konger,
        pr.korteAK,
      ],
      y: analyse.sd[p] ?? analyse.snitt,
    };
  });

  let s = start;
  let vakt = 0;
  while (s.fase === "BUDRUNDE" && vakt++ < 40) s = utfør(s, nevro.velgHandling(s)).state;
  if (s.fase !== "VRAK" || s.budvinner === null) return null;
  const bv = s.budvinner;
  const antall = s.giving.talong;
  if (antall <= 0) return null;
  const håndKort = s.hender[bv] ?? [];
  const hånd = håndKort.map(kortIndeks).sort((a, b) => a - b);
  const rng = lagRng(frø ^ 0x5f37_59df);

  const nevrosVrak = nevro
    .velgVrak(s, bv, håndKort, antall)
    .map(kortIndeks)
    .sort((a, b) => a - b);

  const valg = policyer.map((p) => (p.navn === "nevro (dagens)" ? nevrosVrak : p.velg(hånd, antall, rng)));
  const utfall = valg.map((v) => spillUt(s, bv, hånd, v));

  // --- Ett-korts-byttet: honnøren inn eller ut, alt annet likt --------------
  const lengder = fargelengder(hånd);
  const nøkkel = (k: number): number => lengder[fargeAv(k)]! * 100 + valørAv(k);
  const bytter: Bytterad[] = [];
  for (const mål of [14, 13]) {
    // Honnøren i den KORTESTE fargen – den man faktisk vurderer å hive.
    const kandidater = hånd.filter((k) => valørAv(k) === mål);
    if (kandidater.length === 0) continue;
    let h = kandidater[0]!;
    for (const k of kandidater) if (nøkkel(k) < nøkkel(h)) h = k;

    const uten = vrakLavesteEtter(hånd.filter((k) => k !== h), antall, nøkkel);
    const med = [h, ...uten.slice(0, antall - 1)].sort((a, b) => a - b);
    if (med.length !== antall) continue;
    const uMed = spillUt(s, bv, hånd, med);
    const uUten = spillUt(s, bv, hånd, uten);

    const igjenMed = new Set(hånd.filter((k) => !med.includes(k)));
    const farge = fargeAv(h);
    const renonsMed = [...igjenMed].every((k) => fargeAv(k) !== farge);
    const renonsUten = hånd.filter((k) => !uten.includes(k)).every((k) => fargeAv(k) !== farge);
    bytter.push({
      valør: mål,
      d: uMed.poeng - uUten.poeng,
      dLagStikk: uMed.lagStikk - uUten.lagStikk,
      essIgjen: [...igjenMed].some((k) => fargeAv(k) === farge && valørAv(k) === 14) ? 1 : 0,
      lengde: lengder[farge]!,
      girRenons: renonsMed && !renonsUten ? 1 : 0,
    });
  }

  // --- Renonsbyttet: toppkortet i den korteste fargen ut, eller ett lavt til --
  let renonsbytte: Renonsrad | null = null;
  const korteste = lengder
    .map((l, f) => ({ l, f }))
    .filter((x) => x.l > 0 && x.l <= antall)
    .sort((a, b) => a.l - b.l)[0];
  if (korteste !== undefined) {
    const iFargen = hånd.filter((k) => fargeAv(k) === korteste.f).sort((a, b) => valørAv(a) - valørAv(b));
    const resten = hånd.filter((k) => fargeAv(k) !== korteste.f);
    const topp = iFargen[iFargen.length - 1]!;
    if (resten.length >= antall - korteste.l + 1) {
      const medRenons = [...iFargen, ...vrakLavesteEtter(resten, antall - korteste.l, nøkkel)].sort((a, b) => a - b);
      const utenRenons = [
        ...iFargen.slice(0, korteste.l - 1),
        ...vrakLavesteEtter(resten, antall - korteste.l + 1, nøkkel),
      ].sort((a, b) => a - b);
      const uMed = spillUt(s, bv, hånd, medRenons);
      const uUten = spillUt(s, bv, hånd, utenRenons);
      renonsbytte = {
        d: uMed.poeng - uUten.poeng,
        dLagStikk: uMed.lagStikk - uUten.lagStikk,
        toppValør: valørAv(topp),
        lengde: korteste.l,
        fargerIgjen: håndtrekk(hånd, medRenons).fargerIgjen,
      };
    }
  }

  return {
    f,
    sdSnitt: analyse.snitt,
    sdSete: analyse.sd[bv] ?? analyse.snitt,
    bud: utfall[0]!.bud,
    poeng: utfall.map((u) => u.poeng),
    lagStikk: utfall.map((u) => u.lagStikk),
    klart: utfall.map((u) => u.klart),
    trekk: valg.map((v) => håndtrekk(hånd, v)),
    trumflengde: utfall.map((u) => u.trumflengde),
    vrakNøkkel: valg.map((v) => [...v].sort((a, b) => a - b).join(",")),
    bytter,
    renonsbytte,
    profiler,
  };
}

// --- Arbeidermodus ----------------------------------------------------------

const delfil = (i: number): string => `analyse/.vrak-analyse${merke}-del-${i}.json`;

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

// --- Foreldreprosess --------------------------------------------------------

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

const snitt = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
const se = (v: readonly number[]): number => {
  if (v.length < 2) return NaN;
  const m = snitt(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1) / v.length);
};
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
/** Tosidig p for at snittet av `d` er null, normaltilnærming på SE. */
const pVerdi = (d: readonly number[]): number => {
  const s = se(d);
  if (!Number.isFinite(s) || s === 0) return 1;
  const z = Math.abs(snitt(d) / s);
  return Math.min(1, Math.max(0, 2 * (1 - 0.5 * (1 + erf(z / Math.SQRT2)))));
};

// --- Del 1: trekk → utfall --------------------------------------------------

const TREKKNAVN = ["renonser", "trumflengde", "korte sterke (A/K i ≤3)", "vraket valør", "vraket ESS", "vraket KONGE"];
const trekkrad = (g: Giv, i: number): number[] => {
  const t = g.trekk[i]!;
  return [t.renonser, g.trumflengde[i]!, t.korteSterke, t.vraketValør, t.vraketEss, t.vraketKonge];
};

interface Sett {
  readonly navn: string;
  readonly gruppe: number[];
  readonly X: number[][];
  readonly y: number[];
}
function byggSett(navn: string, med: (p: Policy) => boolean): Sett {
  const gruppe: number[] = [];
  const X: number[][] = [];
  const y: number[] = [];
  for (const g of giver) {
    for (let i = 0; i < policyer.length; i++) {
      if (!med(policyer[i]!)) continue;
      gruppe.push(g.f);
      X.push(trekkrad(g, i));
      y.push(g.poeng[i]!);
    }
  }
  return { navn, gruppe, X, y };
}
const settAlle = byggSett("alle policyer", () => true);
const settTilf = byggSett("BARE tilfeldige vrak (eksogent)", (p) => p.tilfeldig);

function fastEffekt(s: Sett) {
  const sentrert = sentrerPerGruppe(s.gruppe, s.X, s.y);
  return ols(sentrert.X, sentrert.y, { medKonstant: false, lambda: 1e-6 });
}
const feAlle = fastEffekt(settAlle);
const feTilf = fastEffekt(settTilf);

/** Samme regresjon UTEN faste effekter, men med SD-estimatet som kontroll. */
function medSdKontroll(s: Sett, sd: (f: number) => number) {
  const X = s.X.map((r, i) => [...r, sd(s.gruppe[i]!)]);
  return ols(X, s.y, { medKonstant: true });
}
const sdPerGiv = new Map(giver.map((g) => [g.f, g.sdSete]));
const kontrollAlle = medSdKontroll(settAlle, (f) => sdPerGiv.get(f) ?? 0);

/** Hva er en renons verdt? Snitt per antall farger igjen, rått og giv-sentrert. */
interface Fargerad {
  fargerIgjen: number;
  n: number;
  poeng: number;
  poengSentrert: number;
  lagStikk: number;
  klart: number;
  sd: number;
}
function fargetabell(med: (p: Policy) => boolean): Fargerad[] {
  const bøtte = new Map<number, { n: number; p: number; ps: number; l: number; k: number; sd: number }>();
  for (const g of giver) {
    const brukt: number[] = [];
    for (let i = 0; i < policyer.length; i++) if (med(policyer[i]!)) brukt.push(i);
    const mid = snitt(brukt.map((i) => g.poeng[i]!));
    for (const i of brukt) {
      const nøkkel = g.trekk[i]!.fargerIgjen;
      let b = bøtte.get(nøkkel);
      if (b === undefined) {
        b = { n: 0, p: 0, ps: 0, l: 0, k: 0, sd: 0 };
        bøtte.set(nøkkel, b);
      }
      b.n++;
      b.p += g.poeng[i]!;
      b.ps += g.poeng[i]! - mid;
      b.l += g.lagStikk[i]!;
      b.k += g.klart[i]!;
      b.sd += g.sdSete;
    }
  }
  return [...bøtte.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([fargerIgjen, b]) => ({
      fargerIgjen,
      n: b.n,
      poeng: b.p / b.n,
      poengSentrert: b.ps / b.n,
      lagStikk: b.l / b.n,
      klart: b.k / b.n,
      sd: b.sd / b.n,
    }));
}
const fargerAlle = fargetabell(() => true);
const fargerTilf = fargetabell((p) => p.tilfeldig);

// --- Del 2: reglene parret mot nevro ---------------------------------------

const iNevro = policyer.findIndex((p) => p.navn === "nevro (dagens)");
interface Regelrad {
  navn: string;
  poeng: number;
  poengSe: number;
  motNevro: number;
  motNevroSe: number;
  p: number;
  lagStikk: number;
  klart: number;
  renons: number;
  fargerIgjen: number;
  trumflengde: number;
  vraketEss: number;
  vraketKonge: number;
  likNevro: number;
}
const regelrader: Regelrad[] = policyer.map((p, i) => {
  const egne = giver.map((g) => g.poeng[i]!);
  const d = giver.map((g) => g.poeng[i]! - g.poeng[iNevro]!);
  return {
    navn: p.navn,
    poeng: snitt(egne),
    poengSe: se(egne),
    motNevro: snitt(d),
    motNevroSe: se(d),
    p: pVerdi(d),
    lagStikk: snitt(giver.map((g) => g.lagStikk[i]!)),
    klart: snitt(giver.map((g) => g.klart[i]!)),
    renons: snitt(giver.map((g) => g.trekk[i]!.renonser)),
    fargerIgjen: snitt(giver.map((g) => g.trekk[i]!.fargerIgjen)),
    trumflengde: snitt(giver.map((g) => g.trumflengde[i]!)),
    vraketEss: snitt(giver.map((g) => g.trekk[i]!.vraketEss)),
    vraketKonge: snitt(giver.map((g) => g.trekk[i]!.vraketKonge)),
    likNevro: snitt(giver.map((g) => (g.vrakNøkkel[i] === g.vrakNøkkel[iNevro] ? 1 : 0))),
  };
});

// --- Del 3: honnørbyttet ----------------------------------------------------

interface Byttegruppe {
  navn: string;
  n: number;
  d: number;
  se: number;
  p: number;
  dLagStikk: number;
}
function bytteGruppe(navn: string, valør: number, med: (b: Bytterad) => boolean): Byttegruppe {
  const rader = giver.flatMap((g) => g.bytter.filter((b) => b.valør === valør && med(b)));
  const d = rader.map((b) => b.d);
  return {
    navn,
    n: rader.length,
    d: snitt(d),
    se: se(d),
    p: pVerdi(d),
    dLagStikk: snitt(rader.map((b) => b.dLagStikk)),
  };
}
const byttegrupper = (valør: number): Byttegruppe[] => [
  bytteGruppe("alle", valør, () => true),
  bytteGruppe("kastet gir RENONS", valør, (b) => b.girRenons === 1),
  bytteGruppe("kastet gir ikke renons", valør, (b) => b.girRenons === 0),
  bytteGruppe("essen blir igjen i fargen", valør, (b) => b.essIgjen === 1),
  bytteGruppe("essen blir IKKE igjen", valør, (b) => b.essIgjen === 0),
  bytteGruppe("fargen har 1–2 kort", valør, (b) => b.lengde <= 2),
  bytteGruppe("fargen har 3 kort", valør, (b) => b.lengde === 3),
  bytteGruppe("fargen har 4+ kort", valør, (b) => b.lengde >= 4),
];
const kongeGrupper = byttegrupper(13);
const essGrupper = byttegrupper(14);

/** Renonsbyttet, gruppert på prisen man måtte betale for renonsen. */
function renonsGruppe(navn: string, med: (r: Renonsrad) => boolean): Byttegruppe {
  const rader = giver.map((g) => g.renonsbytte).filter((r): r is Renonsrad => r !== null && med(r));
  const d = rader.map((r) => r.d);
  return { navn, n: rader.length, d: snitt(d), se: se(d), p: pVerdi(d), dLagStikk: snitt(rader.map((r) => r.dLagStikk)) };
}
const renonsGrupper: Byttegruppe[] = [
  renonsGruppe("alle", () => true),
  renonsGruppe("toppkortet er et ESS", (r) => r.toppValør === 14),
  renonsGruppe("toppkortet er en KONGE", (r) => r.toppValør === 13),
  renonsGruppe("toppkortet er dame/knekt", (r) => r.toppValør === 12 || r.toppValør === 11),
  renonsGruppe("toppkortet er 10 eller lavere", (r) => r.toppValør <= 10),
  renonsGruppe("fargen har 1 kort", (r) => r.lengde === 1),
  renonsGruppe("fargen har 2 kort", (r) => r.lengde === 2),
  renonsGruppe("fargen har 3 kort", (r) => r.lengde === 3),
  renonsGruppe("fargen har 4 kort", (r) => r.lengde === 4),
  renonsGruppe("ender med 2 farger", (r) => r.fargerIgjen === 2),
  renonsGruppe("ender med 3 farger", (r) => r.fargerIgjen === 3),
];

// --- Del 4: håndverdi -------------------------------------------------------

const PROFILNAVN = [
  "lengste",
  "nest lengste",
  "farger brukt",
  "honnørpoeng",
  "honnør i lengste",
  "serie fra ess i lengste",
  "side-A/K",
  "korte sterke sidefarger",
  "ess i hånden",
  "konger i hånden",
  "korte A-K-farger (≤3)",
];
const alleProfiler = giver.flatMap((g) => g.profiler);
const halv = Math.floor(alleProfiler.length / 2);
const tren = alleProfiler.slice(0, halv);
const test = alleProfiler.slice(halv);

interface Håndmodell {
  navn: string;
  kolonner: number[];
  r2Inne: number;
  r2Ute: number;
  beta: { navn: string; verdi: number }[];
}
function håndmodell(navn: string, kolonner: number[]): Håndmodell | null {
  const X = (rader: typeof tren) => rader.map((r) => kolonner.map((c) => r.x[c]!));
  const t = ols(X(tren), tren.map((r) => r.y));
  if (t === null) return null;
  return {
    navn,
    kolonner,
    r2Inne: t.r2,
    r2Ute: r2Ute(t, X(test), test.map((r) => r.y)),
    beta: kolonner.map((c, i) => ({ navn: PROFILNAVN[c]!, verdi: t.beta[i]! })),
  };
}
const håndmodeller = [
  håndmodell("A: bare lengste farge", [0]),
  håndmodell("B: ren form (lengder)", [0, 1, 2]),
  håndmodell("C: form + honnørpoeng", [0, 1, 2, 3]),
  håndmodell("D: form + ess og konger ATSKILT", [0, 1, 2, 8, 9]),
  håndmodell("E: form + HVOR styrken sitter", [0, 1, 2, 3, 4, 5, 6, 7]),
  håndmodell("F: alt, ess/konge/A-K atskilt", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
].filter((m): m is Håndmodell => m !== null);

// --- Rapport ----------------------------------------------------------------

const linjer: string[] = [];
const si = (s: string): void => {
  console.log(s);
  linjer.push(s);
};
const tall = (x: number, d = 3): string => (Number.isFinite(x) ? x.toFixed(d) : "–");
const fortegn = (x: number, d = 3): string => (x >= 0 ? "+" : "") + tall(x, d);

si(`=== VRAKET: TREKK, REGLER OG HAANDVERDI, ${giver.length} giver (${hoppet} hoppet over) ===`);
si(`Froebase ${frøBase}. Budrunden er NevroHjerne og skjer FOER vraket, saa alle`);
si(`policyer maales paa noeyaktig samme stillinger. Etter vraket spiller`);
si(`«${spillerSpek}» budvinnersetet og NevroHjerne de tre andre.`);
si(`Poeng = budvinnersetets differanse mot snittet av de tre andre, i den ene runden.`);
si(`Skrevet: ${new Date().toISOString()}`);
si("");

si("=== 1a. TREKK -> POENG, GIV-FASTE EFFEKTER ===");
si("Bare variasjonen mellom ULIKE VRAK AV SAMME HAAND teller. Kolonnen «eksogen»");
si("bruker bare de fire TILFELDIGE vrakene, der trekkene ikke er valgt av noen");
si("policy - der er koeffisienten en ekte kausal effekt og ikke et seleksjonsspor.");
si("");
si("trekk".padEnd(26) + "alle policyer".padStart(15) + "eksogen".padStart(15));
si("-".repeat(56));
for (let i = 0; i < TREKKNAVN.length; i++) {
  si(
    TREKKNAVN[i]!.padEnd(26) +
      fortegn(feAlle?.beta[i] ?? NaN).padStart(15) +
      fortegn(feTilf?.beta[i] ?? NaN).padStart(15),
  );
}
si("R^2 (innenfor giv)".padEnd(26) + tall(feAlle?.r2 ?? NaN).padStart(15) + tall(feTilf?.r2 ?? NaN).padStart(15));
si("n".padEnd(26) + String(feAlle?.n ?? 0).padStart(15) + String(feTilf?.n ?? 0).padStart(15));

si("");
si("=== 1b. SAMME TREKK, MEN KONTROLLERT MED SD-ESTIMATET I STEDET ===");
si("Kryssgiv-regresjon med `analyserGiv`-estimatet for budvinnersetet som");
si("haandstyrkekontroll. Staar her fordi det var det oppdraget ba om; de");
si("giv-faste effektene over er STRENGERE, og der de er uenige gjelder de faste.");
si("");
for (let i = 0; i < TREKKNAVN.length; i++) {
  si(`  ${TREKKNAVN[i]!.padEnd(26)}${fortegn(kontrollAlle?.beta[i] ?? NaN).padStart(12)}`);
}
si(`  ${"SD-estimat (kontroll)".padEnd(26)}${fortegn(kontrollAlle?.beta[TREKKNAVN.length] ?? NaN).padStart(12)}`);
si(`  R^2 ${tall(kontrollAlle?.r2 ?? NaN)}, n ${kontrollAlle?.n ?? 0}`);

const skrivFarger = (navn: string, rader: Fargerad[]): void => {
  si("");
  si(`=== 1c. HVA ER EN RENONS VERDT? (${navn}) ===`);
  si(
    "farger igjen".padEnd(14) +
      "n".padStart(8) +
      "poeng".padStart(10) +
      "poeng, giv-sentrert".padStart(21) +
      "lagstikk".padStart(10) +
      "innfridd".padStart(10),
  );
  si("-".repeat(73));
  for (const r of rader) {
    si(
      String(r.fargerIgjen).padEnd(14) +
        String(r.n).padStart(8) +
        tall(r.poeng, 2).padStart(10) +
        fortegn(r.poengSentrert, 2).padStart(21) +
        tall(r.lagStikk, 2).padStart(10) +
        `${Math.round(100 * r.klart)} %`.padStart(10),
    );
  }
};
skrivFarger("alle policyer", fargerAlle);
skrivFarger("bare tilfeldige vrak", fargerTilf);

si("");
si("=== 1d. RENONSBYTTET: PRISEN FOR AA TOEMME DEN KORTESTE FARGEN ===");
si("Parret ETT-KORTS bytte: kast toppkortet i den korteste fargen og bli RENONS,");
si("mot aa beholde det og kaste ett lavt kort til fra en annen farge. Alt annet");
si("i vraket er likt. Positivt d = renonsen var verdt prisen.");
si("Dette er tabellen 1c ikke kan gi: de haendene som KAN bli renons er");
si("systematisk andre haender enn de som ikke kan.");
si("");
si("gruppe".padEnd(30) + "n".padStart(7) + "d poeng".padStart(11) + "SE".padStart(8) + "p".padStart(8) + "d lagstikk".padStart(12));
si("-".repeat(76));
for (const g of renonsGrupper) {
  si(
    g.navn.padEnd(30) +
      String(g.n).padStart(7) +
      fortegn(g.d, 2).padStart(11) +
      tall(g.se, 2).padStart(8) +
      tall(g.p, 3).padStart(8) +
      fortegn(g.dLagStikk, 3).padStart(12),
  );
}

si("");
si("=== 2. REGLENE, PARRET MOT NEVROS VRAK PAA SAMME GIV ===");
si("«mot nevro» er den parrede differansen. Ess og konge staar i hver sin");
si("kolonne - de skal aldri slaas sammen til «honnoer».");
si("");
si(
  "policy".padEnd(22) +
    "poeng".padStart(9) +
    "mot nevro".padStart(12) +
    "SE".padStart(7) +
    "p".padStart(8) +
    "lagstikk".padStart(10) +
    "innfr.".padStart(8) +
    "renons".padStart(8) +
    "trumfl.".padStart(9) +
    "ESS".padStart(7) +
    "KONGE".padStart(8) +
    "= nevro".padStart(9),
);
si("-".repeat(117));
for (const r of [...regelrader].sort((a, b) => b.motNevro - a.motNevro)) {
  si(
    r.navn.padEnd(22) +
      tall(r.poeng, 2).padStart(9) +
      fortegn(r.motNevro, 3).padStart(12) +
      tall(r.motNevroSe, 3).padStart(7) +
      tall(r.p, 3).padStart(8) +
      tall(r.lagStikk, 2).padStart(10) +
      `${Math.round(100 * r.klart)} %`.padStart(8) +
      tall(r.renons, 2).padStart(8) +
      tall(r.trumflengde, 2).padStart(9) +
      tall(r.vraketEss, 3).padStart(7) +
      tall(r.vraketKonge, 3).padStart(8) +
      `${Math.round(100 * r.likNevro)} %`.padStart(9),
  );
}

const skrivBytte = (tittel: string, grupper: Byttegruppe[]): void => {
  si("");
  si(`=== 3. ${tittel} ===`);
  si("Parret ETT-KORTS bytte paa samme haand: honnoeren inn i vraket mot det");
  si("nest laveste kortet inn i stedet. Positivt d = det LOENNER seg aa hive den.");
  si("");
  si("gruppe".padEnd(30) + "n".padStart(7) + "d poeng".padStart(11) + "SE".padStart(8) + "p".padStart(8) + "d lagstikk".padStart(12));
  si("-".repeat(76));
  for (const g of grupper) {
    si(
      g.navn.padEnd(30) +
        String(g.n).padStart(7) +
        fortegn(g.d, 2).padStart(11) +
        tall(g.se, 2).padStart(8) +
        tall(g.p, 3).padStart(8) +
        fortegn(g.dLagStikk, 3).padStart(12),
    );
  }
};
skrivBytte("NAAR LOENNER DET SEG AA HIVE KONGEN?", kongeGrupper);
skrivBytte("SAMME FORSOEK MED ESSET - rapportert for seg", essGrupper);

si("");
si("=== 4. HAANDVERDI: SLAAR «HVOR STYRKEN SITTER» REN LENGDE? ===");
si("Maal: SD-estimatet (lagstikk setet henter hjem naar det faar kontrakten),");
si(`fra analyserGiv. n = ${alleProfiler.length} (4 seter x ${giver.length} giver), delt paa midten.`);
si("R^2 UTE er det som teller - R^2 inne vokser alltid av en kolonne til.");
si("");
si("modell".padEnd(34) + "R^2 inne".padStart(11) + "R^2 ute".padStart(11));
si("-".repeat(56));
for (const m of håndmodeller) {
  si(m.navn.padEnd(34) + tall(m.r2Inne).padStart(11) + tall(m.r2Ute).padStart(11));
}
si("");
si("Koeffisientene i den fulle modellen (stikk per enhet):");
for (const b of håndmodeller[håndmodeller.length - 1]!.beta) {
  si(`  ${b.navn.padEnd(28)}${fortegn(b.verdi).padStart(10)}`);
}

// --- Vektene til den veide regelen ------------------------------------------

const nyeVekter: Vrakvekter = {
  renons: feTilf?.beta[0] ?? 0,
  lengsteFarge: feTilf?.beta[1] ?? 0,
  korteSterke: feTilf?.beta[2] ?? 0,
  vraketValør: feTilf?.beta[3] ?? 0,
  vraketEss: feTilf?.beta[4] ?? 0,
  vraketKonge: feTilf?.beta[5] ?? 0,
};
si("");
si("=== VEKTER TIL DEN VEIDE REGELEN (fra den EKSOGENE regresjonen) ===");
si(JSON.stringify(nyeVekter, null, 2));

writeFileSync(
  `analyse/vrak-analyse${merke}.json`,
  JSON.stringify(
    {
      givere,
      brukte: giver.length,
      hoppet,
      frøBase,
      spiller: spillerSpek,
      vekterBrukt: vekter,
      vekter: nyeVekter,
      trekknavn: TREKKNAVN,
      fasteEffekter: { alle: feAlle, eksogen: feTilf },
      sdKontroll: kontrollAlle,
      farger: { alle: fargerAlle, tilfeldige: fargerTilf },
      renonsbytte: renonsGrupper,
      regelrader,
      konge: kongeGrupper,
      ess: essGrupper,
      håndmodeller,
      skrevet: new Date().toISOString(),
    },
    null,
    2,
  ),
);
writeFileSync(`analyse/vrak-analyse${merke}.txt`, `${linjer.join("\n")}\n`);
console.log(`\nSkrev analyse/vrak-analyse${merke}.{txt,json}`);
