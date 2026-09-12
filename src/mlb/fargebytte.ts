/**
 * FARGEBYTTE — spillets eksakte fargesymmetri, gjort eksplisitt.
 *
 * Eieren: «modellene burde ikke ta stilling til ruter knekt, men tenke trumf og
 * de tre andre — det sparer plass og gjør oss mer effektive.»
 *
 * ===================== SYMMETRIEN, PRESIST ==============================
 *
 * Amerikaneren nevner ingen farge ved navn. Bytter man om på fargene KONSEKVENT
 * — i hver hånd, i talongen, i vraket, i historikken, på bordet, i trumfvalget
 * og i det etterlyste kortet — er spillet det samme spillet, og fasiten «hvor
 * lå kortet» følger med. VALØRENE er ikke symmetriske: ess slår konge uansett.
 *
 * To farger er likevel MERKET av spillet selv, og et bytte må la dem stå:
 *
 *   TRUMF        slår alt annet. Bytter man trumf med en sidefarge, er det en
 *                annen stilling, ikke den samme sett med andre øyne.
 *   ETTERLYST    det kalte kortets farge. Makkeren er den som holder NØYAKTIG
 *                det kortet, og «kløver ess» er ikke «spar ess».
 *
 * Gruppen er derfor liten, men EKSAKT:
 *
 *   etterlyst i en sidefarge   2 farger står, 2 kan bytte  →  |G| = 2
 *   etterlyst i trumf (eller
 *   ingen etterlysning/solo)   1 farge står, 3 kan bytte   →  |G| = 3! = 6
 *
 * I dag må nettene lære dette av data. `FARGE_INDEKS[farge] * 13 + verdi − 2`
 * gir spar ess og kløver ess to helt urelaterte innganger, og trohodets 52 × 4
 * utganger er like absolutte.
 *
 * ===================== K2: BARE OFFENTLIG INFORMASJON ===================
 *
 * `lovligeBytter` leser `trumf` og `etterlyst` — begge offentlige fra VELG av.
 * `kanoniskBytte` leser i tillegg hvilke kort som er SPILT ÅPENT (historikk +
 * bord). Ingen av dem rører `dinHånd`, `dittVrak`, andres hender eller talongen.
 *
 * Det er ikke en høflighet: bytter man om på de skjulte hendene skal den
 * transformerte trekkvektoren være BIT-IDENTISK, ellers har vi bygd en kanal
 * som lekker fasiten inn i inngangen. `test/agX-fargesymmetri.test.ts` bytter
 * hendene og har en felle som leser en skjult hånd og MÅ bli tatt.
 *
 * `byttTilstand` er unntaket som beviser regelen: den tar en `GameState` og
 * bytter ALT, også det skjulte. Den er til MÅLING (vi lager en ny, like gyldig
 * verden), aldri til å bygge en inngang med.
 *
 * ===================== TO VEIER, SAMME PERMUTASJON ======================
 *
 * 1. `byttVisning`  — bytt stillingen, bygg trekkene på nytt. Sannheten.
 * 2. `troInnKilde`  — bytt KOLONNENE i en ferdig trekkvektor. 20 000 ganger
 *                     billigere, og det eneste som gjør augmentering av et
 *                     ferdig korpus mulig uten å spille kampene om igjen.
 *
 * De to MÅ gi samme vektor. Gjør de det ikke, er indekskartet feil — og et
 * feil kart gir ikke krasj, det gir en stille dårligere modell. Prøven krever
 * bit-identitet mellom dem, og har en felle med ett forskjøvet kort.
 */

import { FARGER, type Farge, type Kort } from "../kort.ts";
import type { GameState, KortPåBord, SpillerVisning, Stikk } from "../motor.ts";
import { kortIndeks } from "../nevro/trekk.ts";
import { ANTALL_INN as NEAT_INN, INNGANG } from "../neat/trekk.ts";
import { MLB_STILLING } from "./stillingtrekk.ts";
import { MLB_TRO_SIGNAL, SIGNALINNGANG } from "./signaltrekk.ts";
import {
  MLB_TRO_HUKOMMELSE,
  MLB_TRO_INN,
  MLB_TRO_INN_H,
  MLB_TRO_INN_HS,
  MLB_TRO_INN_HS2,
  MLB_TRO_INN_S,
  MLB_TRO_KLASSER,
  MLB_TRO_KORT,
  MLB_TRO_UT,
  TROINNGANG,
} from "./trotrekk.ts";

/**
 * `p[f]` er den NYE fargeindeksen til gammel farge `f`. Altså: et kort i farge
 * `f` blir liggende i farge `FARGER[p[f]]` etter byttet.
 */
export type Fargebytte = readonly [number, number, number, number];

export const IDENTITET: Fargebytte = [0, 1, 2, 3];

export const erIdentitet = (p: Fargebytte): boolean =>
  p[0] === 0 && p[1] === 1 && p[2] === 2 && p[3] === 3;

/** Den motsatte veien — til å dekode en utgang tilbake til den ekte stillingen. */
export function invers(p: Fargebytte): Fargebytte {
  const u = [0, 0, 0, 0];
  for (let f = 0; f < 4; f++) u[p[f]!] = f;
  return u as unknown as Fargebytte;
}

const fargeIndeks = (f: Farge): number => FARGER.indexOf(f);

/**
 * Alle bytter som lar spillet være det samme spillet — identiteten først.
 *
 * ANKRENE er trumf og det etterlyste kortets farge. Er `etterlyst` null (solo,
 * eller ingen etterlysning) er bare trumf ankret; er trumf null (før VELG) er
 * ingen av dem det, og hele S4 er lovlig. Vi kaller aldri på den siste veien i
 * dag — trohodet og kortnettet lever begge i SPILL-fasen — men regelen er den
 * samme, og en spesialgren for et tilfelle vi ikke bruker er en felle i seg selv.
 */
export function lovligeBytter(trumf: Farge | null, etterlyst: Kort | null): Fargebytte[] {
  const ankret = new Set<number>();
  if (trumf !== null) ankret.add(fargeIndeks(trumf));
  if (etterlyst !== null) ankret.add(fargeIndeks(etterlyst.farge));
  const frie: number[] = [];
  for (let f = 0; f < 4; f++) if (!ankret.has(f)) frie.push(f);

  const ut: Fargebytte[] = [];
  const permuter = (rest: number[], valgt: number[]): void => {
    if (rest.length === 0) {
      const p = [0, 1, 2, 3];
      for (let i = 0; i < frie.length; i++) p[frie[i]!] = valgt[i]!;
      ut.push(p as unknown as Fargebytte);
      return;
    }
    for (let i = 0; i < rest.length; i++) {
      permuter([...rest.slice(0, i), ...rest.slice(i + 1)], [...valgt, rest[i]!]);
    }
  };
  permuter(frie, []);
  // Identiteten først, så en kaller kan ta `[0]` og få «ingen endring».
  ut.sort((a, b) => (erIdentitet(a) ? -1 : erIdentitet(b) ? 1 : 0));
  return ut;
}

// ---------------------------------------------------------------------------
// 1. Bytt stillingen
// ---------------------------------------------------------------------------

export const byttFarge = (f: Farge, p: Fargebytte): Farge => FARGER[p[fargeIndeks(f)]!]!;

export const byttKort = (k: Kort, p: Fargebytte): Kort => ({ farge: byttFarge(k.farge, p), verdi: k.verdi });

/** REKKEFØLGEN BEVARES. Historikk og bord er sekvenser; en sortering her ville byttet spillet, ikke fargene. */
const byttKort2 = (ks: readonly Kort[], p: Fargebytte): Kort[] => ks.map((k) => byttKort(k, p));
const byttBord = (b: readonly KortPåBord[], p: Fargebytte): KortPåBord[] =>
  b.map((kp) => ({ spiller: kp.spiller, kort: byttKort(kp.kort, p) }));
const byttStikk = (s: Stikk, p: Fargebytte): Stikk => ({ kort: byttBord(s.kort, p), vinner: s.vinner });

/**
 * Stillingen sett fra ETT sete, med fargene byttet om.
 *
 * Alt som bærer en farge byttes; setene, poengene, budrunden og stikktellingen
 * er urørt — de har ingen farge. `lovligeKort` byttes med resten: lovligheten
 * er «følg farge», og den følger med byttet.
 */
export function byttVisning(visning: SpillerVisning, p: Fargebytte): SpillerVisning {
  if (erIdentitet(p)) return visning;
  return {
    ...visning,
    dinHånd: byttKort2(visning.dinHånd, p),
    trumf: visning.trumf === null ? null : byttFarge(visning.trumf, p),
    etterlyst: visning.etterlyst === null ? null : byttKort(visning.etterlyst, p),
    bord: byttBord(visning.bord, p),
    forrigeStikk: visning.forrigeStikk === null ? null : byttStikk(visning.forrigeStikk, p),
    historikk: visning.historikk.map((s) => byttStikk(s, p)),
    dittVrak: byttKort2(visning.dittVrak, p),
    lovligeKort: byttKort2(visning.lovligeKort, p),
  };
}

/**
 * HELE tilstanden, også det skjulte — en ny, like gyldig verden.
 *
 * SER SKJULT INFORMASJON MED VILJE, som `mlb/fasit.ts`. Den brukes til å måle
 * (bygg trekkene av `spillerVisning(byttTilstand(s, p), sete)`) og til å bytte
 * fasiten i takt med inngangen. Skal ALDRI stå i en sti som bygger en inngang
 * fra en `SpillerVisning` — da er `byttVisning` den eneste lovlige veien.
 */
export function byttTilstand(state: GameState, p: Fargebytte): GameState {
  if (erIdentitet(p)) return state;
  return {
    ...state,
    hender: state.hender.map((h) => byttKort2(h, p)),
    talong: byttKort2(state.talong, p),
    vrak: byttKort2(state.vrak, p),
    trumf: state.trumf === null ? null : byttFarge(state.trumf, p),
    etterlyst: state.etterlyst === null ? null : byttKort(state.etterlyst, p),
    bord: byttBord(state.bord, p),
    forrigeStikk: state.forrigeStikk === null ? null : byttStikk(state.forrigeStikk, p),
    historikk: state.historikk.map((s) => byttStikk(s, p)),
  };
}

// ---------------------------------------------------------------------------
// 2. Bytt kolonnene i en ferdig trekkvektor
// ---------------------------------------------------------------------------

/**
 * `kilde[i]` er indeksen i den GAMLE vektoren som skal stå på plass `i` i den
 * nye. Alt som ikke er nevnt under er identitet — og det er flertallet: seter,
 * poeng, budrunde, stikktall, hukommelsen og begge sanser-2-blokkene har ingen
 * farge i det hele tatt.
 */
function nyttKart(bredde: number): Int32Array {
  const kilde = new Int32Array(bredde);
  for (let i = 0; i < bredde; i++) kilde[i] = i;
  return kilde;
}

/** 52 kort på rad fra `base`: kort i farge `f` flytter til farge `p[f]`, valøren står. */
function kortblokk(kilde: Int32Array, base: number, p: Fargebytte, steg = 1, bredde = 1): void {
  for (let f = 0; f < 4; f++) {
    for (let r = 0; r < 13; r++) {
      const fra = base + (f * 13 + r) * steg;
      const til = base + (p[f]! * 13 + r) * steg;
      for (let j = 0; j < bredde; j++) kilde[til + j] = fra + j;
    }
  }
}

/** 4 farger på rad fra `base`, eventuelt gjentatt for `grupper` (seter) med `steg` per farge. */
function fargeblokk(kilde: Int32Array, base: number, p: Fargebytte, grupper = 1, steg = 1): void {
  for (let g = 0; g < grupper; g++) {
    for (let f = 0; f < 4; f++) {
      const fra = base + (g * 4 + f) * steg;
      const til = base + (g * 4 + p[f]!) * steg;
      for (let j = 0; j < steg; j++) kilde[til + j] = fra + j;
    }
  }
}

/**
 * NEAT-prefikset (318). Kilde: `src/neat/trekk.ts`, offsetene der.
 *
 * IKKE EKSAKT EKVIVARIANT: `EST_ARGMAX` (302–305) er argmax over de fire
 * fargeestimatene, og `estimerStikk` brytes uavgjort på FARGEREKKEFØLGEN
 * (`e > beste`). Er to farger like gode, peker one-hoten på den laveste
 * fargeindeksen — og etter et bytte kan det bli en annen farge. Blokken
 * permuteres her som om den var ekvivariant; prøven måler hvor ofte det slår
 * feil (og det er nettopp et av stedene den absolutte kodingen koster).
 */
function neatKart(kilde: Int32Array, p: Fargebytte): void {
  kortblokk(kilde, INNGANG.HÅND, p);
  kortblokk(kilde, INNGANG.SETT, p);
  kortblokk(kilde, INNGANG.BORD, p);
  kortblokk(kilde, INNGANG.ETTERLYST, p);
  fargeblokk(kilde, INNGANG.TRUMF, p);
  fargeblokk(kilde, INNGANG.FARGELENGDER, p);
  fargeblokk(kilde, INNGANG.RENONS, p, 3); // rel. sete 1–3 × farge
  fargeblokk(kilde, INNGANG.SKJULTE_I_FARGE, p);
  fargeblokk(kilde, INNGANG.BOSS, p);
  fargeblokk(kilde, INNGANG.EST_STIKK, p);
  fargeblokk(kilde, INNGANG.EST_ARGMAX, p);
  fargeblokk(kilde, INNGANG.SEKVENS, p);
}

/**
 * Trohodets trekkvektor, alle fem bredder.
 *
 *   0–317      NEAT-prefikset
 *   318–659    troblokken (HVEM_LA er 52 kort × 4 KLASSER — kortet permuteres,
 *              klassen står; den er et SETE, ikke en farge)
 *   660–803    hukommelsen: 48 rene skalarer per motstander, ingen av dem har
 *              en farge («valgte hun sin lengste farge som trumf» er et
 *              fargenavn-uavhengig 1/0). Identitet, og det er grunnen til at
 *              symmetrien gjelder også MIDT i en kamp med full bok.
 *   804–919    signalblokken
 *   920–995    stilling (36) og valgt bort (40): rene setetall. Identitet.
 */
export function troInnKilde(bredde: number, p: Fargebytte): Int32Array {
  if (![MLB_TRO_INN, MLB_TRO_INN_H, MLB_TRO_INN_S, MLB_TRO_INN_HS, MLB_TRO_INN_HS2].includes(bredde)) {
    throw new Error(`Fargebytte: ingen trolayout for bredde ${bredde}`);
  }
  const kilde = nyttKart(bredde);
  if (erIdentitet(p)) return kilde;
  neatKart(kilde, p);

  kortblokk(kilde, TROINNGANG.HVEM_LA, p, MLB_TRO_KLASSER, MLB_TRO_KLASSER);
  fargeblokk(kilde, TROINNGANG.SPILT_FARGE, p, 4); // 4 rel. seter × farge
  kortblokk(kilde, TROINNGANG.MITT_VRAK, p);
  kortblokk(kilde, TROINNGANG.USETT, p);
  fargeblokk(kilde, TROINNGANG.USETT_FARGE, p);

  const harSignal = bredde === MLB_TRO_INN_S || bredde === MLB_TRO_INN_HS || bredde === MLB_TRO_INN_HS2;
  if (harSignal) {
    const s = bredde === MLB_TRO_INN_S ? MLB_TRO_INN : MLB_TRO_INN_H;
    // 4 rel. seter × 4 farger × 6 felt; TRUMFET (4 seter) står.
    fargeblokk(kilde, s, p, 4, SIGNALINNGANG.PER_CELLE);
    // Budvinnerblokken: 4 farger × 4 felt.
    fargeblokk(kilde, s + SIGNALINNGANG.BUDVINNER, p, 1, 4);
    if (bredde === MLB_TRO_INN_HS2) {
      const bak = MLB_TRO_INN_HS + MLB_STILLING;
      if (bak + 40 !== MLB_TRO_INN_HS2) throw new Error("Fargebytte: sanser-2-layouten er endret");
    }
  }
  return kilde;
}

/**
 * Trohodets 52 × 4 utganger. Kortet permuteres, KLASSEN står: klassene er
 * relativt sete 1–3 og talongen, og et fargebytte flytter ingen kort mellom
 * hender. Samme kart dekoder svaret tilbake (med `invers`).
 */
export function troUtKilde(p: Fargebytte): Int32Array {
  const kilde = nyttKart(MLB_TRO_UT);
  if (erIdentitet(p)) return kilde;
  kortblokk(kilde, 0, p, MLB_TRO_KLASSER, MLB_TRO_KLASSER);
  return kilde;
}

/**
 * Kortnettets v1-vektor (273) — `src/nevro/trekk.ts` 0–237 pluss E1s 238–272.
 * Layouten står i de to filene; her er bare fargeleddene.
 */
export const KORT_INN = 273;
export function kortInnKilde(bredde: number, p: Fargebytte): Int32Array {
  if (bredde !== KORT_INN) throw new Error(`Fargebytte: kortkartet er bygd for ${KORT_INN}, fikk ${bredde}`);
  const kilde = nyttKart(bredde);
  if (erIdentitet(p)) return kilde;
  kortblokk(kilde, 0, p); //     0–51    egen hånd
  kortblokk(kilde, 52, p); //   52–103   spilte kort
  kortblokk(kilde, 104, p); // 104–155   bordet
  kortblokk(kilde, 156, p); // 156–207   det etterlyste kortet
  fargeblokk(kilde, 220, p); // 220–223  trumf one-hot (224 = ingen trumf, står)
  fargeblokk(kilde, 238, p); // 238–241  egen fargefordeling
  fargeblokk(kilde, 242, p); // 242–245  spilte kort per farge
  fargeblokk(kilde, 246, p, 4); // 246–261  renons rel. sete × farge
  fargeblokk(kilde, 262, p); // 262–265  høyeste kort ute per farge
  fargeblokk(kilde, 266, p); // 266–269  antall ute per farge
  return kilde;
}

/** Kortnettets 52 utganger. */
export function kortUtKilde(p: Fargebytte): Int32Array {
  const kilde = nyttKart(52);
  if (erIdentitet(p)) return kilde;
  kortblokk(kilde, 0, p);
  return kilde;
}

/** `ut[i] = inn[kilde[i]]`. */
export function permuter(inn: Float32Array, kilde: Int32Array): Float32Array {
  if (inn.length !== kilde.length) {
    throw new Error(`Fargebytte: vektoren har ${inn.length} tall, kartet ${kilde.length}`);
  }
  const ut = new Float32Array(kilde.length);
  for (let i = 0; i < kilde.length; i++) ut[i] = inn[kilde[i]!]!;
  return ut;
}

// ---------------------------------------------------------------------------
// 3. Kanonisering: gi fargene navn av det bordet har SETT
// ---------------------------------------------------------------------------

/**
 * KAN NØKKELEN REGNES AV `SpillerVisning` ALENE? JA — og det er verdt å si rett ut,
 * for det var det åpne spørsmålet i oppdraget.
 *
 * Rekkefølgen er:
 *
 *   1. TRUMF               offentlig fra VELG (`visning.trumf`)
 *   2. ETTERLYST FARGE     offentlig fra VELG (`visning.etterlyst`), når den ikke er trumf
 *   3. RESTEN, etter en offentlig nøkkel, synkende:
 *        a. antall kort spilt ÅPENT i fargen (historikk + bord)
 *        b. høyeste valør spilt åpent i fargen
 *        c. bitmasken over hvilke valører som er spilt åpent
 *      og til slutt d. den faste fargerekkefølgen S, H, R, K.
 *
 * (a)–(c) leser BARE `historikk` og `bord` — det alle ved bordet så. Ikke egen
 * hånd (som ville vært lovlig, men gjort navnet observatøravhengig), ikke eget
 * vrak, aldri talongen.
 *
 * ===================== HVOR DET IKKE STREKKER TIL =======================
 *
 * Faller (a), (b) og (c) alle likt for to farger, har de to fargene NØYAKTIG
 * samme offentlige spillhistorikk — typisk i stikk 0, der ingenting er spilt og
 * alle tre sidefargene er like. Da finnes det ingen offentlig grunn til å skille
 * dem, og (d) er absolutt: der er kanoniseringen tilbake til «ruter knekt».
 *
 * Det er ikke en svakhet ved akkurat denne nøkkelen, det er en egenskap ved
 * stillingen: to publikt identiske farger ER utbyttbare, og en kanonisering kan
 * ikke gjøre annet enn å velge. Gevinsten er at valget da ikke betyr noe for
 * det offentlige — bare for egen hånd, og den kunne brutt uavgjort om vi ville
 * gi slipp på at navnet er likt for alle fire setene.
 * `examples/agX-fargesymmetri.ts` måler hvor stor andel av stillingene som
 * fortsatt har uavgjort etter (a)–(c).
 */
export function kanoniskNøkkel(visning: SpillerVisning): { antall: number[]; høyeste: number[]; maske: number[] } {
  const antall = [0, 0, 0, 0];
  const høyeste = [0, 0, 0, 0];
  const maske = [0, 0, 0, 0];
  const legg = (k: Kort): void => {
    const f = fargeIndeks(k.farge);
    antall[f]!++;
    if (k.verdi > høyeste[f]!) høyeste[f] = k.verdi;
    maske[f]! |= 1 << (k.verdi - 2);
  };
  for (const stikk of visning.historikk) for (const kp of stikk.kort) legg(kp.kort);
  for (const kp of visning.bord) legg(kp.kort);
  return { antall, høyeste, maske };
}

/**
 * Byttet som fører stillingen til sin kanoniske form: trumf blir farge 0, det
 * etterlyste kortets farge 1, resten etter nøkkelen over.
 *
 * Er trumf ikke valgt ennå, er hele ordningen nøkkelens — det er den ærlige
 * kanoniseringen når ingen farge er merket av spillet.
 */
export function kanoniskBytte(visning: SpillerVisning): Fargebytte {
  const { antall, høyeste, maske } = kanoniskNøkkel(visning);
  const t = visning.trumf === null ? -1 : fargeIndeks(visning.trumf);
  const e = visning.etterlyst === null ? -1 : fargeIndeks(visning.etterlyst.farge);
  const rang = (f: number): number => (f === t ? 0 : f === e ? 1 : 2);
  const orden = [0, 1, 2, 3].sort((a, b) => {
    if (rang(a) !== rang(b)) return rang(a) - rang(b);
    if (antall[a] !== antall[b]) return antall[b]! - antall[a]!;
    if (høyeste[a] !== høyeste[b]) return høyeste[b]! - høyeste[a]!;
    if (maske[a] !== maske[b]) return maske[b]! - maske[a]!;
    return a - b; // (d) den faste rekkefølgen — se hodet
  });
  const p = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) p[orden[i]!] = i;
  return p as unknown as Fargebytte;
}

/** Er de to fargene fortsatt uskillelige etter (a)–(c)? Til målingen av restasymmetrien. */
export function uavgjorteFarger(visning: SpillerVisning): number {
  const { antall, høyeste, maske } = kanoniskNøkkel(visning);
  const t = visning.trumf === null ? -1 : fargeIndeks(visning.trumf);
  const e = visning.etterlyst === null ? -1 : fargeIndeks(visning.etterlyst.farge);
  const frie = [0, 1, 2, 3].filter((f) => f !== t && f !== e);
  let par = 0;
  for (let i = 0; i < frie.length; i++) {
    for (let j = i + 1; j < frie.length; j++) {
      const a = frie[i]!;
      const b = frie[j]!;
      if (antall[a] === antall[b] && høyeste[a] === høyeste[b] && maske[a] === maske[b]) par++;
    }
  }
  return par;
}

/** Bredden hukommelsen har i 804/920/996 — eksportert så prøven kan slå fast at den er fargeløs. */
export const HUKOMMELSE_ER_FARGELØS = MLB_TRO_HUKOMMELSE;
/** Antall kort i trohodets utgang, for kallere som ikke vil importere `trotrekk.ts`. */
export const TRO_KORT = MLB_TRO_KORT;
export const NEAT_BREDDE = NEAT_INN;
export const SIGNAL_BREDDE = MLB_TRO_SIGNAL;
