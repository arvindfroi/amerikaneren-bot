/**
 * POENGLØSEREN — bakoverinduksjon på SPILLERNES POENG, ikke på budlagets stikk.
 *
 * ================= HVORFOR DENNE FILA FINNES =============================
 *
 * `dds.ts` løser stikkspillet som et TOPARTS NULLSUMSPILL: budlaget vil ha
 * flest mulig stikk, «motspillerne» færrest mulig, og `rotVerdier` returnerer
 * ÉN skalar per kort — budlagets sluttstikk (`lagStikk`, inkludert stikk som
 * allerede er vunnet).
 *
 * Men Amerikaneren er ikke et toparts nullsumspill. `regler.ts` betaler ut:
 *
 *     budvinner   ±2n        (fortegn etter om kontrakten gikk hjem)
 *     makker      ±n         (samme fortegn)
 *     forsvarere  +1 per EGET stikk
 *
 * Fire spillere, fire forskjellige poengfunksjoner. To ting brister derfor når
 * DD brukes som fasit:
 *
 *  1. FORSVARERNE MÅLES PÅ FEIL STØRRELSE. Å minimere budlagets stikk er ikke
 *     å maksimere sine egne: en forsvarer kan minimere føreren ved å gi
 *     stikket til den ANDRE forsvareren, og selv score null. DD-fasiten er
 *     likegyldig til hvem av de to som tar stikket; poengreglene er det ikke.
 *  2. BUDLAGET MÅLES PÅ FEIL FUNKSJON. Deres utbetaling er et TRINN i
 *     `lagStikk` (hjemme/bet), ikke en lineær funksjon av stikktallet.
 *     Overstikk gir null ekstra i seg selv — de betyr bare noe fordi de tar
 *     poeng fra forsvarerne.
 *
 * §114 målte følgene: `juks:6`, den klarsynte sonden som spiller DD-optimalt
 * fra seks kort igjen, vant **0,1100** av kampene mot grunnlinjas 0,2500. En
 * bot som SER kortene spilte dramatisk verre, fordi den optimerte feil mål i
 * tre av fire seter.
 *
 * ================= LØSNINGSBEGREPET, OG HVA DET IKKE ER =================
 *
 * Denne løseren gjør bakoverinduksjon der HVER SPILLER MAKSIMERER SIN EGEN
 * POENGSUM i hver node. Det er et *delspillperfekt likevektspunkt* (SPE) i det
 * fire-spiller generell-sum-spillet med perfekt informasjon. Vær ærlig om hva
 * det betyr:
 *
 *  • DET ER IKKE MINIMAX. Verdien er en VEKTOR, ikke en skalar, og det finnes
 *    ingen «motstanderside» som minimerer noe. Alfa-beta finnes derfor ikke
 *    her — ingen avskjæring er gyldig når fire mål skal føres samtidig.
 *  • DET ER IKKE ENTYDIG. Backwards induction i generell sum gir én SPE per
 *    valg av tie-break, og likevektene kan gi forskjellige utbetalinger.
 *    Særlig budlaget er ofte HELT likegyldig (trinnfunksjonen er flat så snart
 *    kontrakten er sikret eller tapt), og da avgjør konvensjonen alt.
 *    Konvensjonen her: **første trekk i genereringsrekkefølgen blant dem som
 *    maksimerer**, altså `dds.ts` sin heuristiske ordning (vinn billigst /
 *    kast billigst / ikke overtrumf makker). Den er deterministisk og
 *    dokumentert, ikke prinsipiell.
 *  • DET ER IKKE EN GARANTI MOT FAKTISKE MOTSTANDERE. En SPE forutsetter at
 *    alle tre andre spiller sin egen likevektslinje. Gjør de ikke det, er
 *    linja ikke lenger noe optimum. DD-minimax har i det minste en
 *    verstefalls-garanti mot ETHVERT motspill; det har ikke denne. Byttet er
 *    bevisst: en garanti mot feil målestokk er verdiløs.
 *  • DET ER FORTSATT KLARSYN. Alle fire hender er åpne. Modulen er en
 *    MÅLESTOKK og et tak, ikke en spiller — nøyaktig som `juksagent.ts`.
 *
 * ================= MÅLFORMEN ===========================================
 *
 * `egen` maksimerer rå egne rundepoeng. `diff` maksimerer egne minus snittet
 * av de andres — samme størrelse som benken og `standardMål` i
 * `moe2/sdkort.ts` bruker, og en konstant-sum-transformasjon (summen av alle
 * fires diff er identisk 0). `diff` er også det eneste av de to som gir
 * budlaget en grunn til å ta overstikk: under `egen` er føreren fullstendig
 * likegyldig så snart kontrakten er sikret, og gir da bort stikk gratis.
 *
 * ================= MEMOISERING, OG ANTAKELSEN DEN HVILER PÅ =============
 *
 * Transposisjonstabellen slår opp på (hender, spiller i tur, budlagets stikk
 * så langt), ikke på den fulle stikkvektoren. Det er gyldig fordi VALGENE i en
 * node er invariante for hvor mange stikk hver spiller allerede har:
 * forsvarernes poeng er lineære i egne stikk, så et allerede vunnet stikk er
 * et konstantledd som er likt for alle barn av noden; budlagets poeng er et
 * trinn i `lagStikk`, og trinnets plassering fanges nettopp av `declStikk` i
 * nøkkelen. `poengdds.test.ts` etterprøver antakelsen ved å kjøre løseren med
 * og uten memoisering på tilfeldige stillinger og kreve identiske vektorer.
 */

import { beregnPoeng, type Meldingsinfo } from "../regler.ts";
import {
  lagPosisjon,
  gjørTrekk,
  angreTrekk,
  genererOgOrdne,
  type DDPosisjon,
} from "./dds.ts";

/** Hvilket utfallsmål hvert sete maksimerer. Samme navn som i `eksakt.ts`. */
export type Poengmål = "egen" | "diff";

export interface PoengOppsett {
  readonly N: number;
  readonly trump: number;
  /** hender[spiller] = kort-int[]. Alle fire må være kjent – dette er klarsyn. */
  readonly hender: number[][];
  readonly iTur: number;
  readonly bord?: { spiller: number; kort: number }[];
  /** Stikk allerede vunnet, per spiller. */
  readonly stikkFør: readonly number[];
  readonly ferdigeStikk?: number;
  readonly totalStikk: number;
  readonly budvinner: number;
  /** Hemmelig makker, eller null (solo, eller ingen fant kortet). */
  readonly makker: number | null;
  readonly melding: Meldingsinfo;
  /** `regler.målPoeng` – amerikaner- og solosatsene skaleres med den. */
  readonly målPoeng: number;
  readonly mål: Poengmål;
}

/** Rotverdien for ett kort: hele poengvektoren likevekten ender i. */
export interface Poengverdi {
  readonly kort: number;
  /** Rundepoeng per spiller ved likevektsspill etter dette kortet. */
  readonly poeng: readonly number[];
  /** Utfallsmålet (`mål`) sett fra setet som er i tur. */
  readonly verdi: number;
}

// --- Poengfunksjonen --------------------------------------------------------

/**
 * Rundepoeng per spiller gitt sluttstikk per spiller.
 *
 * Dette er en RASK utgave av `beregnPoeng` i `regler.ts` – den kalles i hver
 * eneste node og har ikke råd til å bygge `PoengInput`-objekter. At den sier
 * nøyaktig det samme som originalen er derfor ikke noe å ta for gitt, og
 * `test/poengdds.test.ts` sammenligner de to på tilfeldige stikkvektorer for
 * alle tre meldingstyper. Den testen er den eneste grunnen til at kopien er
 * forsvarlig.
 */
function poengInn(o: PoengOppsett, stikk: readonly number[], ut: number[]): void {
  const bv = o.budvinner;
  const mk = o.makker;
  for (let p = 0; p < o.N; p++) {
    ut[p] = p === bv || p === mk ? 0 : (stikk[p] ?? 0);
  }
  const bvStikk = stikk[bv] ?? 0;
  const lagStikk = bvStikk + (mk === null ? 0 : (stikk[mk] ?? 0));

  if (o.melding.type === "tall") {
    const n = o.melding.bud;
    const fortegn = lagStikk >= n ? 1 : -1;
    ut[bv]! += fortegn * 2 * n;
    if (mk !== null) ut[mk]! += fortegn * n;
    return;
  }
  if (o.melding.type === "amerikaner") {
    const fortegn = lagStikk === o.totalStikk ? 1 : -1;
    ut[bv]! += fortegn * (o.målPoeng / 2);
    if (mk !== null) ut[mk]! += fortegn * (o.målPoeng / 4);
    return;
  }
  ut[bv]! += bvStikk === o.totalStikk ? o.målPoeng : -o.målPoeng;
}

/** Offentlig utgave – brukt av testen som sammenligner mot `beregnPoeng`. */
export function rundepoeng(o: PoengOppsett, stikk: readonly number[]): number[] {
  const ut = new Array<number>(o.N).fill(0);
  poengInn(o, stikk, ut);
  return ut;
}

/** Utfallsmålet for ett sete, gitt hele poengvektoren. */
function måltall(poeng: readonly number[], spiller: number, N: number, mål: Poengmål): number {
  const egne = poeng[spiller] ?? 0;
  if (mål === "egen") return egne;
  let sum = 0;
  for (let p = 0; p < N; p++) sum += poeng[p] ?? 0;
  return egne - (sum - egne) / Math.max(1, N - 1);
}

// --- Bakoverinduksjonen -----------------------------------------------------

const MAKS_PLY = 60;

interface Kontekst {
  readonly o: PoengOppsett;
  readonly pos: DDPosisjon;
  /** Stikk budlaget MÅ ha for at kontrakten står. */
  readonly krav: number;
  /** Stikk vunnet per spiller så langt på stien (stikkFør + underveis). */
  readonly akk: number[];
  /** ytre nøkkel -> hash2 -> gjenstående stikk per spiller. */
  readonly tt: Map<number, Map<number, number[]>> | null;
  readonly buf: Int32Array[];
  readonly nøkkel: Int32Array[];
  /** Skrapevektor per ply for poengberegningen – unngår allokering per barn. */
  readonly skrapPoeng: number[][];
  /** Kandidat- og bestevektor per ply – unngår `slice()` per barn. */
  readonly skrapKand: number[][];
  readonly skrapBest: number[][];
  noder: number;
}

/**
 * Gjenstående stikk per spiller fra denne noden, under likevektsspill.
 *
 * Vektoren som returneres er en GJENBRUKT buffer (eller den memoiserte). Den
 * er gyldig fram til neste kall på samme eller dypere ply, så kalleren MÅ
 * kopiere den før den gjør noe annet. Alternativet var en `slice()` per node,
 * og det var målbart i en løser uten alfa-beta.
 */
function løsRest(k: Kontekst, ply: number): number[] {
  const pos = k.pos;
  const N = pos.N;
  const gjenstår = pos.totalStikk - pos.ferdigeStikk;
  const bestBuf = k.skrapBest[ply]!;
  if (gjenstår === 0) {
    for (let p = 0; p < N; p++) bestBuf[p] = 0;
    return bestBuf;
  }

  /**
   * ============ NØKKELEN TELLER AVSTAND TIL KONTRAKTEN, IKKE STIKK ======
   *
   * Budlagets poeng er et TRINN: hjemme eller bet. To stillinger med samme
   * hender og samme spiller i tur, men forskjellig `declStikk`, har derfor
   * samme likevekt så lenge trinnet ligger like langt unna – og HELT samme
   * likevekt når trinnet er passert (kontrakten sikret) eller uoppnåelig
   * (kontrakten død), for da er budlagets utbetaling en konstant uansett hva
   * som skjer videre.
   *
   * Nøkkelen bruker derfor `mangler`, klemt til [0, gjenstår+1]: 0 = sikret,
   * gjenstår+1 = død, og alt imellom er den ekte avstanden. Det slår sammen
   * stillinger som `declStikk` ville holdt fra hverandre uten grunn.
   *
   * Bare stillinger MELLOM stikk memoiseres. En halvspilt stilling er nesten
   * alltid unik – kortene på bordet er med på å bestemme den – så en tabell
   * over dem koster mer i oppslag og kartallokering enn den sparer. Målt
   * 8. august: memoisering også midt i stikket gjorde løseren 3,5x TREGERE
   * ved seks gjenstående stikk.
   */
  let ytre: Map<number, number[]> | undefined;
  if (k.tt !== null && pos.trickLen === 0) {
    const rå = k.krav - pos.declStikk;
    const mangler = rå <= 0 ? 0 : rå > gjenstår ? gjenstår + 1 : rå;
    const ytreNøkkel = pos.hash1 * 256 + pos.iTur * 32 + mangler;
    ytre = k.tt.get(ytreNøkkel);
    const truffet = ytre?.get(pos.hash2);
    if (truffet !== undefined) return truffet;
    if (ytre === undefined) {
      ytre = new Map();
      k.tt.set(ytreNøkkel, ytre);
    }
  }

  k.noder++;
  const spiller = pos.iTur;
  const buf = k.buf[ply]!;
  const n = genererOgOrdne(pos, buf, k.nøkkel[ply]!);
  const poengBuf = k.skrapPoeng[ply]!;
  const kandidat = k.skrapKand[ply]!;

  /**
   * TAKET FOR SETET I TUR – grunnlaget for den ENESTE avskjæringen som er
   * gyldig her. Alfa-beta finnes ikke i generell sum, men max^n tillater
   * «grunn avskjæring»: når et barn allerede gir spilleren det aller beste hun
   * kan oppnå fra stillingen, kan ingen søskengren slå det, og resten kan
   * stå. Taket regnes som «hun tar ALLE gjenstående stikk», som samtidig
   * maksimerer hennes egne poeng og minimerer de andres – altså best for både
   * `egen` og `diff`.
   */
  const takBuf = k.skrapPoeng[MAKS_PLY + 1]!;
  const takStikk = k.skrapPoeng[MAKS_PLY + 2]!;
  for (let p = 0; p < N; p++) takStikk[p] = k.akk[p]!;
  takStikk[spiller]! += gjenstår;
  poengInn(k.o, takStikk, takBuf);
  const tak = måltall(takBuf, spiller, N, k.o.mål);

  let bestVerdi = -Infinity;
  for (let p = 0; p < N; p++) bestBuf[p] = 0;

  for (let i = 0; i < n; i++) {
    const undo = gjørTrekk(pos, buf[i]!);
    // `gjørTrekk` setter iTur til stikkvinneren når stikket ble fullført.
    const vinner = undo.fullført ? pos.iTur : -1;
    if (vinner >= 0) k.akk[vinner]!++;
    const rest = løsRest(k, ply + 1);
    // Kandidatens gjenstående stikk sett fra DENNE noden = barnets rest,
    // pluss stikket som eventuelt ble avgjort av trekket selv. Kopieres med
    // det samme: `rest` er en buffer som neste barn skriver over.
    for (let p = 0; p < N; p++) kandidat[p] = rest[p]!;
    if (vinner >= 0) k.akk[vinner]!--;
    angreTrekk(pos, undo);
    if (vinner >= 0) kandidat[vinner]!++;

    // Sluttstikk = det som er vunnet så langt på stien + det som gjenstår.
    for (let p = 0; p < N; p++) kandidat[p]! += k.akk[p]!;
    poengInn(k.o, kandidat, poengBuf);
    const verdi = måltall(poengBuf, spiller, N, k.o.mål);

    // Tie-break: STRENGT større kreves, så første trekk i
    // genereringsrekkefølgen vinner uavgjort. Se filhodet.
    if (verdi > bestVerdi) {
      bestVerdi = verdi;
      for (let p = 0; p < N; p++) bestBuf[p] = kandidat[p]! - k.akk[p]!;
    }
    // Grunn max^n-avskjæring: taket er nådd, ingen søsken kan slå det.
    // Avskjæringen er verdibevarende for setet i tur, men den kan velge et
    // ANNET av flere like gode trekk enn en full gjennomgang ville gjort –
    // og i generell sum kan det gi de ANDRE setene andre utbetalinger. Den er
    // derfor en del av tie-break-konvensjonen, ikke en ren hastighetsknott,
    // og står oppført som det i filhodet.
    if (verdi >= tak - 1e-9) break;
  }

  if (ytre !== undefined) {
    const lagret = bestBuf.slice();
    ytre.set(pos.hash2, lagret);
    return lagret;
  }
  return bestBuf;
}

export interface PoengSvar {
  readonly verdier: Poengverdi[];
  /** Besøkte noder – for kostnadsmåling. */
  readonly noder: number;
}

/**
 * Rotverdier: for hvert lovlig kort, poengvektoren likevekten ender i.
 *
 * Kortene som deler ekvivalensklasse (naboer blant kortene som er i spill)
 * representeres av det høyeste, nøyaktig som i `rotVerdier` – der utvides
 * klassen til alle medlemmene, her holder representanten, siden kalleren bare
 * skal ha ETT kort å spille.
 */
export function poengRotVerdier(o: PoengOppsett): PoengSvar {
  return rot(o, true);
}

/**
 * Samme, men uten memoisering – ren bakoverinduksjon. Finnes utelukkende som
 * KONTROLL for testen som etterprøver at transposisjonsnøkkelen er gyldig.
 * Bruk den aldri i måling: den er langt dyrere.
 */
export function poengRotVerdierUtenTT(o: PoengOppsett): PoengSvar {
  return rot(o, false);
}

function rot(o: PoengOppsett, memoiser: boolean): PoengSvar {
  const declLag = new Array<boolean>(o.N).fill(false);
  declLag[o.budvinner] = true;
  if (o.makker !== null && o.makker !== o.budvinner) declLag[o.makker] = true;

  let declStikkFør = 0;
  for (let p = 0; p < o.N; p++) if (declLag[p]) declStikkFør += o.stikkFør[p] ?? 0;

  const pos = lagPosisjon({
    N: o.N,
    trump: o.trump,
    declLag,
    hender: o.hender,
    iTur: o.iTur,
    bord: o.bord,
    declStikkFør,
    ferdigeStikk: o.ferdigeStikk,
    totalStikk: o.totalStikk,
  });

  const k: Kontekst = {
    o,
    pos,
    krav: o.melding.type === "tall" ? o.melding.bud : o.totalStikk,
    akk: o.stikkFør.slice(),
    tt: memoiser ? new Map() : null,
    buf: [],
    nøkkel: [],
    skrapPoeng: [],
    skrapKand: [],
    skrapBest: [],
    noder: 0,
  };
  for (let i = 0; i <= MAKS_PLY + 2; i++) {
    k.buf.push(new Int32Array(16));
    k.nøkkel.push(new Int32Array(16));
    k.skrapPoeng.push(new Array<number>(o.N).fill(0));
    k.skrapKand.push(new Array<number>(o.N).fill(0));
    k.skrapBest.push(new Array<number>(o.N).fill(0));
  }

  const spiller = pos.iTur;
  const rotBuf = new Int32Array(16);
  const antall = genererOgOrdne(pos, rotBuf, new Int32Array(16));
  const verdier: Poengverdi[] = [];

  for (let i = 0; i < antall; i++) {
    const kort = rotBuf[i]!;
    const undo = gjørTrekk(pos, kort);
    // `gjørTrekk` setter iTur til stikkvinneren når stikket ble fullført.
    const vinner = undo.fullført ? pos.iTur : -1;
    if (vinner >= 0) k.akk[vinner]!++;
    const rest = løsRest(k, 1);
    if (vinner >= 0) k.akk[vinner]!--;
    angreTrekk(pos, undo);

    const slutt = rest.slice();
    if (vinner >= 0) slutt[vinner]!++;
    for (let p = 0; p < o.N; p++) slutt[p]! += k.akk[p]!;
    const poeng = rundepoeng(o, slutt);
    verdier.push({ kort, poeng, verdi: måltall(poeng, spiller, o.N, o.mål) });
  }

  return { verdier, noder: k.noder };
}

/** Kontroll: `rundepoeng` mot `beregnPoeng` i regler.ts. Brukt av testen. */
export function fasitpoeng(o: PoengOppsett, stikk: readonly number[]): number[] {
  return beregnPoeng({
    regler: {
      antallSpillere: o.N,
      medByttekort: true,
      målPoeng: o.målPoeng,
    },
    melding: o.melding,
    antallStikk: o.totalStikk,
    antallSpillere: o.N,
    budvinner: o.budvinner,
    makker: o.makker,
    stikkPerSpiller: stikk,
  }).delta;
}
