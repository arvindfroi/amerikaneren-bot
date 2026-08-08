/**
 * EKSAKT SLUTTSPILL – full enumerasjon av alle verdener som er forenlige med
 * det spilleren faktisk har sett.
 *
 * FORSKJELLEN FRA DE TO ANDRE METODENE, og hvorfor den er kvalitativ:
 *
 *   dobbelt dummy (DD)  løser ÉN verden der alle fire hender er åpne. Fasiten
 *                       forutsetter informasjon vi ikke har, og ble målt til
 *                       −0,609 korrigert korrelasjon mot poeng – feil fortegn.
 *   single dummy (SD)   sampler K verdener og spiller dem ut med en modell.
 *                       Riktig informasjonsbilde, men to feilkilder: hvilke
 *                       K verdener som ble trukket, og hvor god modellen er.
 *   EKSAKT (denne)      enumererer ALLE verdener som er forenlige med
 *                       informasjonen, og løser hver av dem eksakt. Ingen
 *                       samplingsstøy og ingen modellfeil i utspillingen.
 *
 * HVA «EKSAKT» IKKE BETYR – les dette før tallet tolkes som en garanti.
 * Full enumerasjon fjerner samplingsstøyen, ikke STRATEGIFUSJONEN. Å ta
 * snittet av DD-verdier over verdener er PIMC med komplett verdensliste: hver
 * verden løses som om ALLE parter – også vi selv, senere i samme runde – fikk
 * vite hvilken verden det var. Den virkelige optimale strategien må spille
 * samme kort i to verdener den ikke kan skille, og kan i prinsippet trenge å
 * randomisere. Enumerasjonen er derfor eksakt i ett presist henseende: den
 * regner ut den EKSAKTE PIMC-verdien (snittet over hele posterioren), og det
 * er strengt mer enn å sample den. Den er bevist optimal bare i stillinger der
 * ingen framtidig egen beslutning gjenstår – i praksis siste stikk, og de
 * stillingene der alle gjenstående kortvalg er tvungne.
 *
 * INFORMASJONSBILDET er nøyaktig det `sampler.ts` allerede beskriver:
 * egen hånd, alle spilte kort, håndstørrelser, renonse-inferens fra
 * fargesvikt, det etterlyste kortet hos en motspiller, og eget vrak når
 * observatøren er budvinner. Enumerasjonen er den fullstendige oppregningen av
 * det samme rommet `trekkVerden` trekker ETT punkt fra.
 *
 * EKVIVALENSKLASSER er det som gjør enumerasjonen overkommelig. To usette kort
 * i samme farge som er NABOER blant kortene som fortsatt er i behold (alt
 * imellom dem er spilt), er umulige å skille – verken reglene, motstanderne
 * eller løseren kan se forskjell. Verdener som bare bytter om på slike kort er
 * isomorfe og har identisk verdi. Vi enumererer derfor KONFIGURASJONER (hvor
 * mange fra hver klasse hver hånd får) og vekter hver med antallet verdener
 * den representerer. Summen av vektene ER antallet forenlige verdener, og det
 * sjekkes mot en uavhengig DP-telling i `tellVerdener` – kontrollen som skiller
 * full enumerasjon fra en sampling i forkledning.
 */

import { FARGER, type Kort } from "../kort.ts";
import type { GameState } from "../motor.ts";
import { kortTilInt, rotVerdier, intTilKort } from "./dds.ts";
import { byggDDOppsett, infererRenonce, type Verden } from "./sampler.ts";

/** En mottaker av usette kort: en motspiller, eller vraket (spiller = −1). */
export interface Bøtte {
  /** Spillerindeks, eller −1 for det døde vraket. */
  readonly spiller: number;
  readonly kapasitet: number;
  /** Fargeindekser spilleren er avslørt renonse i. */
  readonly forbud: ReadonlySet<number>;
}

/** Observatørens informasjonsbilde, klart til enumerasjon. */
export interface Informasjon {
  /** Kort-int som observatøren ikke har sett. */
  readonly usett: readonly number[];
  readonly bøtter: readonly Bøtte[];
  /** Observatørens egen hånd (kort-int). */
  readonly egen: readonly number[];
  /** Det etterlyste kortet, dersom det ennå er usett (må ligge hos en LEVENDE bøtte). */
  readonly etterlystUsett: number | null;
  /** Makkeren, når han er avslørt. Null = ukjent (solo, eller stikk 1). */
  readonly makker: number | null;
  readonly budvinner: number | null;
  readonly observator: number;
}

/**
 * Leser ut informasjonsbildet. Samme kilder som `trekkVerden` i sampler.ts –
 * de to MÅ beskrive det samme rommet, ellers måler enumerasjonen noe annet enn
 * samplingen den skal erstatte.
 */
export function lesInformasjon(state: GameState, observator: number): Informasjon {
  const N = state.antallSpillere;
  const brukt = new Set<number>();
  for (const s of state.historikk) for (const kp of s.kort) brukt.add(kortTilInt(kp.kort));
  for (const kp of state.bord) brukt.add(kortTilInt(kp.kort));
  const egen = state.hender[observator]!.map(kortTilInt);
  for (const c of egen) brukt.add(c);
  const observatorErBudvinner = observator === state.budvinner;
  if (observatorErBudvinner) for (const k of state.vrak) brukt.add(kortTilInt(k));

  const usett: number[] = [];
  for (let c = 0; c < 52; c++) if (!brukt.has(c)) usett.push(c);

  const voids = infererRenonce(state);
  const bøtter: Bøtte[] = [];
  for (let p = 0; p < N; p++) {
    if (p === observator) continue;
    bøtter.push({ spiller: p, kapasitet: state.hender[p]!.length, forbud: voids[p]! });
  }
  const dødKapasitet = observatorErBudvinner ? 0 : state.giving.talong;
  if (dødKapasitet > 0) {
    bøtter.push({ spiller: -1, kapasitet: dødKapasitet, forbud: new Set() });
  }

  const etterlystInt = state.etterlyst ? kortTilInt(state.etterlyst) : null;
  const etterlystUsett =
    etterlystInt !== null && !brukt.has(etterlystInt) && usett.includes(etterlystInt)
      ? etterlystInt
      : null;

  return {
    usett,
    bøtter,
    egen,
    etterlystUsett,
    makker: state.makker,
    budvinner: state.budvinner,
    observator,
  };
}

// --- Telling ----------------------------------------------------------------

/** Fakultet opp til 20 – nok for 3×12 + 4 usette kort. */
const FAK: number[] = [1];
for (let i = 1; i <= 40; i++) FAK[i] = FAK[i - 1]! * i;

/**
 * Binomialkoeffisient regnet multiplikativt, med delingen gjort underveis.
 * `FAK[n]` for n over 18 er ikke lenger et eksakt flyttall, så en multinomial
 * skrevet som fakultetsbrøk gir avrundingsfeil i det som skal være en EKSAKT
 * telling. Produktet av binomialer holder seg eksakt så lenge selve svaret er
 * under 2^53 – og over det er tallet uansett langt utenfor rekkevidde.
 */
function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const m = Math.min(k, n - k);
  let ut = 1;
  for (let i = 1; i <= m; i++) ut = (ut * (n - m + i)) / i;
  return Math.round(ut);
}

/**
 * Antall fordelinger UTEN renonse-inferens: den rene multinomialen. Brukes som
 * kontrollnevner – hvor mye informasjonen faktisk har krympet rommet.
 */
export function råAntall(info: Informasjon): number {
  let n = 0;
  for (const b of info.bøtter) n += b.kapasitet;
  let ut = 1;
  let igjen = n;
  for (const b of info.bøtter) {
    ut *= binom(igjen, b.kapasitet);
    igjen -= b.kapasitet;
  }
  return ut;
}

/**
 * EKSAKT antall verdener forenlige med informasjonen, talt med dynamisk
 * programmering kort for kort (tilstand = gjenstående kapasitet per bøtte).
 *
 * Dette er den UAVHENGIGE kontrollen mot enumerasjonen: teller de to ikke likt,
 * er enten enumerasjonen ufullstendig eller vektene gale, og da er «eksakt»
 * bare en sampling i forkledning.
 */
export function tellVerdener(info: Informasjon): number {
  const B = info.bøtter.length;
  const kort = info.usett;
  const kaps = info.bøtter.map((b) => b.kapasitet);
  const memo = new Map<string, number>();

  const rek = (i: number, caps: number[]): number => {
    if (i === kort.length) {
      for (const c of caps) if (c !== 0) return 0;
      return 1;
    }
    const nøkkel = `${i}|${caps.join(",")}`;
    const truffet = memo.get(nøkkel);
    if (truffet !== undefined) return truffet;
    const c = kort[i]!;
    const f = Math.floor(c / 13);
    const måLeve = c === info.etterlystUsett;
    let sum = 0;
    for (let b = 0; b < B; b++) {
      if (caps[b]! === 0) continue;
      const bøtte = info.bøtter[b]!;
      if (bøtte.forbud.has(f)) continue;
      if (måLeve && bøtte.spiller === -1) continue;
      caps[b]!--;
      sum += rek(i + 1, caps);
      caps[b]!++;
    }
    memo.set(nøkkel, sum);
    return sum;
  };

  return rek(0, kaps);
}

// --- Ekvivalensklasser ------------------------------------------------------

/** En klasse av innbyrdes uskillelige usette kort i samme farge. */
export interface Klasse {
  readonly farge: number;
  /** Kortene i klassen (kort-int), høyeste først. */
  readonly kort: readonly number[];
  /** Må ligge hos en LEVENDE bøtte (det etterlyste kortet). */
  readonly måLeve: boolean;
}

/**
 * Deler de usette kortene i ekvivalensklasser.
 *
 * En klasse er en maksimal rekke av usette kort som er NABOER blant kortene
 * som fortsatt er i behold (observatørens hånd + de usette). Et kort på
 * observatørens egen hånd bryter rekka: han kan skille kortene over og under
 * det. Et SPILT kort bryter den ikke – det er ute av spillet for godt.
 *
 * Det etterlyste kortet, når det ennå er usett, får sin egen klasse: det er
 * bundet til en levende hånd og er dermed skillbart fra naboene.
 */
export function klasser(info: Informasjon): Klasse[] {
  const usettSett = new Set(info.usett);
  const egenSett = new Set(info.egen);
  const ut: Klasse[] = [];
  for (let f = 0; f < 4; f++) {
    let gjeldende: number[] | null = null;
    for (let r = 12; r >= 0; r--) {
      const c = f * 13 + r;
      if (egenSett.has(c)) {
        gjeldende = null; // eget kort bryter rekka
        continue;
      }
      if (!usettSett.has(c)) continue; // spilt: ute av spillet, bryter ingenting
      if (c === info.etterlystUsett) {
        ut.push({ farge: f, kort: [c], måLeve: true });
        gjeldende = null;
        continue;
      }
      if (gjeldende === null) {
        gjeldende = [c];
        ut.push({ farge: f, kort: gjeldende, måLeve: false });
      } else {
        gjeldende.push(c);
      }
    }
  }
  return ut;
}

// --- Enumerasjon ------------------------------------------------------------

export interface Enumerasjon {
  /** Antall konfigurasjoner (klassefordelinger) som ble besøkt. */
  readonly konfigurasjoner: number;
  /** Sum av vektene = antall FORENLIGE VERDENER dekket. */
  readonly verdener: number;
  /** Ble hele rommet dekket, eller stoppet taket enumerasjonen? */
  readonly full: boolean;
}

/**
 * Enumererer alle klassekonfigurasjoner og kaller `besøk` med de ferdige
 * hendene og vekten (antall verdener konfigurasjonen står for).
 *
 * `maksKonfigurasjoner` er et tak: nås det, stopper enumerasjonen og `full`
 * blir false. Kalleren SKAL rapportere det – en avkortet enumerasjon er en
 * skjev sampling, ikke en fasit.
 */
export function enumerer(
  info: Informasjon,
  besøk: (hender: number[][], vekt: number) => void,
  maksKonfigurasjoner = Infinity,
): Enumerasjon {
  const kl = klasser(info);
  const B = info.bøtter.length;
  const caps = info.bøtter.map((b) => b.kapasitet);
  /** tildelt[k][b] = antall kort fra klasse k til bøtte b. */
  const tildelt: number[][] = kl.map(() => new Array<number>(B).fill(0));

  let konfigurasjoner = 0;
  let verdener = 0;
  let full = true;

  /**
   * Setter sammen hendene for gjeldende klassekonfigurasjon. Vraket (bøtte
   * −1) faller ut: kortene der er døde og skal ikke på noen hånd.
   *
   * Hvilke KONKRETE kort bøtte `b` får fra klasse `k` er likegyldig – hele
   * poenget med en ekvivalensklasse er at medlemmene ikke lar seg skille – så
   * vi deler dem ut i rekkefølge og lar vekten telle de øvrige tildelingene.
   */
  const byggHender = (): number[][] => {
    const hender: number[][] = [];
    // Bygg per spillerindeks. Antall spillere = observatør + levende bøtter.
    let maksSpiller = info.observator;
    for (const b of info.bøtter) if (b.spiller > maksSpiller) maksSpiller = b.spiller;
    for (let p = 0; p <= maksSpiller; p++) hender.push(p === info.observator ? [...info.egen] : []);
    for (let b = 0; b < B; b++) {
      const bøtte = info.bøtter[b]!;
      if (bøtte.spiller === -1) continue;
      const h = hender[bøtte.spiller]!;
      for (let k = 0; k < kl.length; k++) {
        const n = tildelt[k]![b]!;
        if (n === 0) continue;
        const kort = kl[k]!.kort;
        let brukt = 0;
        for (let j = 0; j < b; j++) brukt += tildelt[k]![j]!;
        for (let j = 0; j < n; j++) h.push(kort[brukt + j]!);
      }
    }
    return hender;
  };

  /** Fordeler klasse `k` over bøttene, deretter neste klasse. */
  const overKlasse = (k: number, vekt: number): void => {
    if (!full) return;
    if (k === kl.length) {
      konfigurasjoner++;
      verdener += vekt;
      besøk(byggHender(), vekt);
      if (konfigurasjoner >= maksKonfigurasjoner) full = false;
      return;
    }
    const klasse = kl[k]!;
    const m = klasse.kort.length;
    const rad = tildelt[k]!;

    const overBøtte = (b: number, igjen: number, delvekt: number): void => {
      if (!full) return;
      if (b === B) {
        if (igjen === 0) overKlasse(k + 1, vekt * delvekt);
        return;
      }
      const bøtte = info.bøtter[b]!;
      const lovlig =
        !bøtte.forbud.has(klasse.farge) && !(klasse.måLeve && bøtte.spiller === -1);
      const maks = lovlig ? Math.min(igjen, caps[b]!) : 0;
      for (let n = 0; n <= maks; n++) {
        rad[b] = n;
        caps[b]! -= n;
        // Multinomialfaktoren: hvilke n av de `igjen` gjenstående i klassen.
        const faktor = FAK[igjen]! / (FAK[n]! * FAK[igjen - n]!);
        overBøtte(b + 1, igjen - n, delvekt * faktor);
        caps[b]! += n;
        rad[b] = 0;
      }
    };
    overBøtte(0, m, 1);
  };

  overKlasse(0, 1);
  return { konfigurasjoner, verdener, full };
}

/**
 * Teller konfigurasjoner og verdener uten å bygge hender – billig forhåndssjekk
 * som lar kalleren avgjøre om full enumerasjon er innenfor tidsbudsjettet.
 */
export function tellKonfigurasjoner(info: Informasjon, maks = Infinity): Enumerasjon {
  return enumerer(info, () => {}, maks);
}

// --- Verdi ------------------------------------------------------------------

/** Hvilket utfallsmål kandidatkortene rangeres etter. */
export type Målform = "diff" | "egen";

export interface EksaktOpts {
  /** Tak på antall konfigurasjoner; over det er enumerasjonen ikke full. */
  readonly maksKonfigurasjoner?: number;
  readonly mål?: Målform;
}

export interface EksaktVurdering {
  readonly kort: Kort;
  /** Vektet snitt av utfallsmålet over alle forenlige verdener. */
  readonly verdi: number;
}

export interface EksaktSvar {
  readonly vurderinger: EksaktVurdering[];
  readonly enumerasjon: Enumerasjon;
  /** Uavhengig DP-telling av forenlige verdener – skal være lik `enumerasjon.verdener`. */
  readonly fasitAntall: number;
}

/**
 * Rundepoeng for hvert sete gitt budlagets sluttstikk.
 *
 * Forsvarernes stikk deles LIKT mellom dem. Det er en tilnærming: dobbelt
 * dummy gir lagets total, ikke fordelingen innad i forsvaret, og +1 per eget
 * stikk er den eneste posten som avhenger av fordelingen. Samme tilnærming som
 * `egenPoeng` i neat/hybrid.ts bruker.
 */
function rundepoeng(lagStikk: number, declLag: readonly boolean[], s: GameState): number[] {
  const T = s.giving.antallStikk;
  const mål = s.regler.målPoeng;
  const melding = s.melding!;
  const N = s.antallSpillere;
  const delta = new Array<number>(N).fill(0);
  const forsvarere: number[] = [];
  for (let p = 0; p < N; p++) if (!declLag[p]) forsvarere.push(p);
  const perForsvarer = forsvarere.length > 0 ? (T - lagStikk) / forsvarere.length : 0;
  for (const p of forsvarere) delta[p] = perForsvarer;

  const bv = s.budvinner!;
  let makker: number | null = null;
  for (let p = 0; p < N; p++) if (declLag[p] && p !== bv) makker = p;

  if (melding.type === "tall") {
    const fortegn = lagStikk >= melding.bud ? 1 : -1;
    delta[bv]! += fortegn * 2 * melding.bud;
    if (makker !== null) delta[makker]! += fortegn * melding.bud;
    return delta;
  }
  if (melding.type === "amerikaner") {
    const fortegn = lagStikk === T ? 1 : -1;
    delta[bv]! += fortegn * (mål / 2);
    if (makker !== null) delta[makker]! += fortegn * (mål / 4);
    return delta;
  }
  delta[bv]! += lagStikk === T ? mål : -mål;
  return delta;
}

/**
 * Utfallsmålet: egne rundepoeng minus snittet av de andres – samme differanse
 * som benken og SD-fasiten bruker (`standardMål` i moe2/sdkort.ts). `egen`
 * gir råpoeng i stedet, som `egenPoeng` i neat/hybrid.ts.
 */
function måltall(
  lagStikk: number,
  declLag: readonly boolean[],
  s: GameState,
  observator: number,
  form: Målform,
): number {
  const delta = rundepoeng(lagStikk, declLag, s);
  const egne = delta[observator] ?? 0;
  if (form === "egen") return egne;
  const N = s.antallSpillere;
  const sum = delta.reduce((a, b) => a + b, 0);
  return egne - (sum - egne) / Math.max(1, N - 1);
}

/**
 * DEN EKSAKTE VURDERINGEN: hvert lovlige kort får sitt vektede snitt over ALLE
 * verdener forenlige med spillerens informasjon, der hver verden er løst
 * eksakt med dobbelt dummy.
 *
 * Returnerer null når spillet ikke er i gang eller ingen verden er forenlig
 * (skal ikke kunne skje – informasjonsbildet er per konstruksjon konsistent
 * med den virkelige givingen).
 */
export function eksaktKortverdier(
  state: GameState,
  spiller: number,
  opts: EksaktOpts = {},
): EksaktSvar | null {
  if (state.fase !== "SPILL" || state.budvinner === null || state.melding === null) return null;
  const info = lesInformasjon(state, spiller);
  const form = opts.mål ?? "diff";

  const sum = new Map<number, number>();
  let vektSum = 0;

  const enumerasjon = enumerer(
    info,
    (hender, vekt) => {
      const declLag = lagDeclLag(state, info, hender);
      const verden: Verden = { hender, declLag, makkerVerden: null, vrakVerden: [] };
      const oppsett = byggDDOppsett(state, verden);
      for (const rv of rotVerdier(oppsett)) {
        const v = måltall(rv.lagStikk, declLag, state, spiller, form);
        sum.set(rv.kort, (sum.get(rv.kort) ?? 0) + vekt * v);
      }
      vektSum += vekt;
    },
    opts.maksKonfigurasjoner ?? Infinity,
  );

  if (vektSum === 0) return null;
  const vurderinger: EksaktVurdering[] = [];
  for (const [kort, s] of sum) vurderinger.push({ kort: intTilKort(kort), verdi: s / vektSum });
  vurderinger.sort((a, b) => b.verdi - a.verdi);
  return { vurderinger, enumerasjon, fasitAntall: tellVerdener(info) };
}

/** Budlaget i en gitt verden: budvinner + den som sitter med det etterlyste kortet. */
function lagDeclLag(state: GameState, info: Informasjon, hender: readonly number[][]): boolean[] {
  const N = state.antallSpillere;
  const declLag = new Array<boolean>(N).fill(false);
  if (info.budvinner !== null) declLag[info.budvinner] = true;
  if (info.makker !== null) {
    declLag[info.makker] = true;
    return declLag;
  }
  if (info.etterlystUsett !== null) {
    for (let p = 0; p < N; p++) if (hender[p]?.includes(info.etterlystUsett)) declLag[p] = true;
  }
  return declLag;
}

/** Det beste kortet etter eksakt enumerasjon, eller null. */
export function eksaktBesteKort(
  state: GameState,
  spiller: number,
  opts: EksaktOpts = {},
): { kort: Kort; svar: EksaktSvar } | null {
  const svar = eksaktKortverdier(state, spiller, opts);
  if (svar === null || svar.vurderinger.length === 0) return null;
  return { kort: svar.vurderinger[0]!.kort, svar };
}

/** Fargenavn for feilsøking. */
export function beskrivKort(c: number): string {
  return `${FARGER[Math.floor(c / 13)]}${(c % 13) + 2}`;
}
