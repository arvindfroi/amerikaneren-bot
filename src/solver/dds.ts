/**
 * Dobbelt-dummy-løser (DDS) for stikkspillet – rask utgave.
 *
 * Når alle hender er kjent er stikkspillet et perfekt-informasjons
 * nullsumspill: budlaget (budvinner + evt. makker) vil ha flest mulig
 * stikk, motspillerne færrest mulig. Løseren regner ut det spillteoretisk
 * korrekte antallet stikk budlaget tar.
 *
 * Ytelse: hender lagres som bitmasker per farge (13 bits), trekk reduseres
 * til én representant per ekvivalensklasse, og en transposisjonstabell med
 * inkrementell Zobrist-hash gjenbruker delposisjoner. Da løses en full
 * 12-stikks giv på under et millisekund – raskt nok for tusenvis av
 * utspillinger i Monte Carlo-boten.
 *
 * Kort som heltall 0..51: `farge = kort/13`, `rang = kort%13`
 * (0 = to, 12 = ess). Fargeindeksen følger FARGER i kort.ts (S,H,R,K).
 */

import { FARGER, type Kort } from "../kort.ts";

export function kortTilInt(k: Kort): number {
  return FARGER.indexOf(k.farge) * 13 + (k.verdi - 2);
}

export function intTilKort(c: number): Kort {
  const farge = FARGER[Math.floor(c / 13)]!;
  const verdi = ((c % 13) + 2) as Kort["verdi"];
  return { farge, verdi };
}

const fargeAv = (c: number): number => Math.floor(c / 13);
const rangAv = (c: number): number => c % 13;

// --- Zobrist-tabeller (deterministiske) ------------------------------------

const MAKS_SPILLERE = 6;
const Z1: number[][] = [];
const Z2: number[][] = [];
const ZTUR1: number[] = [];
const ZTUR2: number[] = [];
(function initZobrist() {
  let a = 0x1234_5678 >>> 0;
  const neste = (): number => {
    // xorshift32
    a ^= a << 13;
    a >>>= 0;
    a ^= a >>> 17;
    a ^= a << 5;
    a >>>= 0;
    return a >>> 0;
  };
  for (let c = 0; c < 52; c++) {
    Z1[c] = [];
    Z2[c] = [];
    for (let p = 0; p < MAKS_SPILLERE; p++) {
      Z1[c]![p] = neste();
      Z2[c]![p] = neste();
    }
  }
  for (let p = 0; p < MAKS_SPILLERE; p++) {
    ZTUR1[p] = neste();
    ZTUR2[p] = neste();
  }
})();

// --- Posisjon ---------------------------------------------------------------

export interface DDPosisjon {
  N: number;
  trump: number;
  declLag: boolean[];
  /** hender[spiller][farge] = 13-bits maske over rang. */
  hender: number[][];
  iTur: number;
  ledFarge: number;
  /**
   * Stikkbufferne er indeksert `trickStart + i`, IKKE `i`.
   *
   * ============ HVORFOR, OG HVA SOM GIKK GALT UTEN ====================
   *
   * `angreTrekk` ruller tilbake `trickLen`, men skrev aldri tilbake KORTENE.
   * Skrev hvert stikk til indeks 0..N−1, overskrev stikk nr. 2 kortene til
   * stikk nr. 1, og etter tilbakerullingen leste `stikkvinnerPos` det neste
   * stikkets kort som om de lå i det forrige. Søket regnet da ut feil
   * stikkvinner for hvert eneste søskentrekk etter det første.
   *
   * Målt 8. august mot en råsøker uten avskjæring, ekvivalensklasser eller
   * transposisjonstabell: **86 av 400 tilfeldige 3–4-kortsgivinger ga feil
   * `løsDD`-verdi**, og 411 av rotkortene feil `rotVerdier`-verdi. Med 1 kort
   * på hånden (ingen andre stikk å overskrive med) var avviket eksakt 0 – det
   * er signaturen til nettopp denne feilen.
   *
   * Feilen var usynlig for hele testmappa fordi hver eneste DDS-test enten
   * hadde ett stikk, eller sjekket et tall som tilfeldigvis ble riktig.
   *
   * Rettelsen gir hvert stikk sin egen plass i bufferne. Det koster ingenting
   * (samme antall skrivinger, ingen kopiering) og gjør tilbakerullingen
   * triviell: `trickStart` går ned igjen, og kortene under står urørt.
   */
  trickStart: number;
  trickSpillere: number[];
  trickKort: number[];
  trickLen: number;
  declStikk: number;
  ferdigeStikk: number;
  totalStikk: number;
  hash1: number;
  hash2: number;
}

export interface DDOppsett {
  readonly N: number;
  readonly trump: number;
  readonly declLag: boolean[];
  readonly hender: number[][]; // hender[spiller] = kort-int[]
  readonly iTur: number;
  readonly bord?: { spiller: number; kort: number }[];
  readonly declStikkFør?: number;
  readonly ferdigeStikk?: number;
  readonly totalStikk: number;
}

export function lagPosisjon(o: DDOppsett): DDPosisjon {
  const hender: number[][] = [];
  let hash1 = 0;
  let hash2 = 0;
  for (let p = 0; p < o.N; p++) {
    const masker = [0, 0, 0, 0];
    for (const c of o.hender[p]!) {
      masker[fargeAv(c)]! |= 1 << rangAv(c);
      hash1 = (hash1 ^ Z1[c]![p]!) >>> 0;
      hash2 = (hash2 ^ Z2[c]![p]!) >>> 0;
    }
    hender.push(masker);
  }
  const trickSpillere: number[] = [];
  const trickKort: number[] = [];
  let ledFarge = -1;
  if (o.bord && o.bord.length > 0) {
    for (const b of o.bord) {
      trickSpillere.push(b.spiller);
      trickKort.push(b.kort);
    }
    ledFarge = fargeAv(o.bord[0]!.kort);
  }
  return {
    N: o.N,
    trump: o.trump,
    declLag: o.declLag.slice(),
    hender,
    iTur: o.iTur,
    ledFarge,
    trickStart: 0,
    trickSpillere,
    trickKort,
    trickLen: trickSpillere.length,
    declStikk: o.declStikkFør ?? 0,
    ferdigeStikk: o.ferdigeStikk ?? 0,
    totalStikk: o.totalStikk,
    hash1,
    hash2,
  };
}

function slår(ny: number, best: number, trump: number, led: number): boolean {
  const nyT = fargeAv(ny) === trump;
  const bestT = fargeAv(best) === trump;
  if (nyT && !bestT) return true;
  if (!nyT && bestT) return false;
  if (nyT && bestT) return rangAv(ny) > rangAv(best);
  if (fargeAv(ny) !== led) return false;
  if (fargeAv(best) !== led) return true;
  return rangAv(ny) > rangAv(best);
}

function stikkvinnerPos(pos: DDPosisjon): number {
  const s = pos.trickStart;
  let bestI = s;
  for (let i = s + 1; i < s + pos.trickLen; i++) {
    if (slår(pos.trickKort[i]!, pos.trickKort[bestI]!, pos.trump, pos.ledFarge)) bestI = i;
  }
  return pos.trickSpillere[bestI]!;
}

/**
 * Angreinformasjon for ett trekk. EKSPORTERT sammen med `gjørTrekk`,
 * `angreTrekk` og `genererOgOrdne` slik at `poengdds.ts` kan kjøre sin egen
 * bakoverinduksjon over NØYAKTIG samme stillingsmaskineri. Alternativet var en
 * kopi av bitmaske-, stikkvinner- og ekvivalensklasselogikken, og to utgaver av
 * spillereglene er samme feilform som GBT-kopien (§76): rettes den ene, måler
 * den andre noe annet uten at noe feiler.
 *
 * Eksportene er rent additive – ingen av dem endrer oppførselen til `løsDD`,
 * `rotVerdier` eller `evaluerHybrid`.
 */
export interface Undo {
  spiller: number;
  kort: number;
  ledFør: number;
  iTurFør: number;
  fullført: boolean;
  declØkning: number;
}

export function gjørTrekk(pos: DDPosisjon, kort: number): Undo {
  const spiller = pos.iTur;
  const f = fargeAv(kort);
  pos.hender[spiller]![f]! &= ~(1 << rangAv(kort));
  pos.hash1 = (pos.hash1 ^ Z1[kort]![spiller]!) >>> 0;
  pos.hash2 = (pos.hash2 ^ Z2[kort]![spiller]!) >>> 0;

  const undo: Undo = {
    spiller,
    kort,
    ledFør: pos.ledFarge,
    iTurFør: pos.iTur,
    fullført: false,
    declØkning: 0,
  };

  pos.trickSpillere[pos.trickStart + pos.trickLen] = spiller;
  pos.trickKort[pos.trickStart + pos.trickLen] = kort;
  pos.trickLen++;
  if (pos.trickLen === 1) pos.ledFarge = f;

  if (pos.trickLen === pos.N) {
    const vinner = stikkvinnerPos(pos);
    undo.fullført = true;
    if (pos.declLag[vinner]) {
      pos.declStikk++;
      undo.declØkning = 1;
    }
    pos.ferdigeStikk++;
    // Neste stikk får sin EGEN plass i bufferne – se DDPosisjon.trickStart.
    pos.trickStart += pos.N;
    pos.trickLen = 0;
    pos.ledFarge = -1;
    pos.iTur = vinner;
  } else {
    pos.iTur = (spiller + 1) % pos.N;
  }
  return undo;
}

export function angreTrekk(pos: DDPosisjon, undo: Undo): void {
  if (undo.fullført) {
    pos.ferdigeStikk--;
    if (undo.declØkning) pos.declStikk--;
    pos.trickStart -= pos.N;
    pos.trickLen = pos.N - 1;
  } else {
    pos.trickLen--;
  }
  pos.ledFarge = undo.ledFør;
  pos.iTur = undo.iTurFør;
  const f = fargeAv(undo.kort);
  pos.hender[undo.spiller]![f]! |= 1 << rangAv(undo.kort);
  pos.hash1 = (pos.hash1 ^ Z1[undo.kort]![undo.spiller]!) >>> 0;
  pos.hash2 = (pos.hash2 ^ Z2[undo.kort]![undo.spiller]!) >>> 0;
}

/**
 * I-spill-maske for en farge: alle kort som fortsatt kan påvirke utfallet.
 *
 * ============ KORTENE PÅ BORDET TELLER MED ==========================
 *
 * Masken brukes til å avgjøre hvilke av egne kort som er UMULIGE Å SKILLE:
 * to kort uten noe annet i-spill-kort imellom seg er samme trekk. Kort fra
 * TIDLIGERE stikk er ute av spillet og skiller ingenting.
 *
 * Men kortene i DET PÅGÅENDE stikket gjør det. Ligger K5 på bordet og du har
 * K6 og K2, er de to alt annet enn like: K6 tar stikket, K2 taper det. Uten
 * bordet i masken ble de slått sammen til én ekvivalensklasse, og det ene av
 * de to trekkene forsvant fra søket.
 *
 * Målt 8. august mot en råsøker: dette alene ga 2 av 300 feil `løsDD`-verdier
 * i 3-kortsgivinger. Det er sjeldnere enn `trickStart`-feilen (se der), men
 * like ekte, og de to sammen forklarte hvert eneste avvik – etter begge
 * rettelsene er avviket EKSAKT 0 over de samme givingene.
 */
function iSpillMaske(pos: DDPosisjon, farge: number): number {
  let m = 0;
  for (let p = 0; p < pos.N; p++) m |= pos.hender[p]![farge]!;
  const s = pos.trickStart;
  for (let i = s; i < s + pos.trickLen; i++) {
    const c = pos.trickKort[i]!;
    if (fargeAv(c) === farge) m |= 1 << rangAv(c);
  }
  return m;
}

/**
 * Ekvivalensklasser for spiller i tur i én farge: én representant (høyeste)
 * per sammenhengende (i i-spill-rekkefølge) rekke av egne kort.
 */
function klasserIFarge(pos: DDPosisjon, farge: number): { rep: number; medlemmer: number[] }[] {
  const min = pos.hender[pos.iTur]![farge]!;
  if (min === 0) return [];
  const g = iSpillMaske(pos, farge);
  const klasser: { rep: number; medlemmer: number[] }[] = [];
  let gjeldende: number[] | null = null;
  for (let r = 12; r >= 0; r--) {
    const bit = 1 << r;
    if (!(g & bit)) continue; // ikke i spill
    if (min & bit) {
      const kort = farge * 13 + r;
      if (gjeldende === null) {
        gjeldende = [kort];
        klasser.push({ rep: kort, medlemmer: gjeldende });
      } else {
        gjeldende.push(kort); // samme klasse (ingen motstanderkort mellom)
      }
    } else {
      gjeldende = null; // motstanderkort bryter rekka
    }
  }
  return klasser;
}

/** Lovlige trekk med klassemedlemmer (for rot-evaluering). */
function lovligeKlasser(pos: DDPosisjon): { rep: number; medlemmer: number[] }[] {
  if (pos.trickLen > 0 && pos.hender[pos.iTur]![pos.ledFarge]! !== 0) {
    return klasserIFarge(pos, pos.ledFarge);
  }
  const ut: { rep: number; medlemmer: number[] }[] = [];
  for (let f = 0; f < 4; f++) for (const k of klasserIFarge(pos, f)) ut.push(k);
  return ut;
}

// Forhåndsallokerte skrapebuffere per ply – unngår allokering per node.
const MAKS_PLY = 60;
const skrapTrekk: Int32Array[] = [];
const skrapNøkkel: Int32Array[] = [];
for (let i = 0; i < MAKS_PLY; i++) {
  skrapTrekk.push(new Int32Array(16));
  skrapNøkkel.push(new Int32Array(16));
}

/**
 * Genererer lovlige trekk-representanter (allokeringsfritt) og ordner dem for
 * effektiv avskjæring: vinn så billig som mulig, ellers kast billigst – men
 * ikke overtrumf din egen makker. Skriver til buf, returnerer antall.
 */
export function genererOgOrdne(pos: DDPosisjon, buf: Int32Array, nøkkel: Int32Array): number {
  const iTur = pos.iTur;
  const følger = pos.trickLen > 0 && pos.hender[iTur]![pos.ledFarge]! !== 0;
  const fStart = følger ? pos.ledFarge : 0;
  const fEnd = følger ? pos.ledFarge : 3;

  let n = 0;
  for (let f = fStart; f <= fEnd; f++) {
    const m = pos.hender[iTur]![f]!;
    if (m === 0) continue;
    const g = iSpillMaske(pos, f);
    let forrigeMin = false;
    for (let r = 12; r >= 0; r--) {
      const bit = 1 << r;
      if (!(g & bit)) continue;
      if (m & bit) {
        if (!forrigeMin) buf[n++] = f * 13 + r; // topp av en ekvivalensrekke
        forrigeMin = true;
      } else {
        forrigeMin = false;
      }
    }
  }

  // Ordningsnøkler
  if (pos.trickLen === 0) {
    for (let i = 0; i < n; i++) nøkkel[i] = 12 - rangAv(buf[i]!); // høyt kort først
  } else {
    const s = pos.trickStart;
    let bestI = s;
    for (let i = s + 1; i < s + pos.trickLen; i++) {
      if (slår(pos.trickKort[i]!, pos.trickKort[bestI]!, pos.trump, pos.ledFarge)) bestI = i;
    }
    const bestKort = pos.trickKort[bestI]!;
    const makkerVinner = pos.declLag[pos.trickSpillere[bestI]!] === pos.declLag[iTur];
    for (let i = 0; i < n; i++) {
      const c = buf[i]!;
      const vinner = slår(c, bestKort, pos.trump, pos.ledFarge);
      // Hvis makkeren allerede vinner: unngå å vinne. Ellers: vinn billigst.
      const vil = makkerVinner ? !vinner : vinner;
      nøkkel[i] = (vil ? 0 : 100) + rangAv(c);
    }
  }

  // Innstikk-sortering (n er lite)
  for (let i = 1; i < n; i++) {
    const k = nøkkel[i]!;
    const v = buf[i]!;
    let j = i - 1;
    while (j >= 0 && nøkkel[j]! > k) {
      nøkkel[j + 1] = nøkkel[j]!;
      buf[j + 1] = buf[j]!;
      j--;
    }
    nøkkel[j + 1] = k;
    buf[j + 1] = v;
  }
  return n;
}

type TTInner = Map<number, { lav: number; høy: number; trekk: number }>;
type TT = Map<number, TTInner>;

/**
 * Finner nøyaktig verdi fra posisjonen via null-vindu-søk (MTD): binærsøk
 * på svaret med bredde-0-vinduer og gjenbruk av transposisjonstabellen.
 * Hvert delsøk gir maksimal avskjæring.
 */
function løsFra(pos: DDPosisjon, tt: TT): number {
  const gjenstår = pos.totalStikk - pos.ferdigeStikk;
  let lo = pos.declStikk;
  let hi = pos.declStikk + gjenstår;
  while (lo < hi) {
    const gamma = (lo + hi + 1) >> 1;
    const v = søk(pos, gamma - 1, gamma, tt);
    if (v >= gamma) lo = gamma;
    else hi = gamma - 1;
  }
  return lo;
}

/** Budlagets totale stikk (inkl. allerede vunne) ved optimalt spill. */
export function løsDD(o: DDOppsett): number {
  return løsFra(lagPosisjon(o), new Map());
}

/** Verdi (budlagets sluttstikk) for hvert lovlig kort fra rotposisjonen. */
export function rotVerdier(o: DDOppsett): { kort: number; lagStikk: number }[] {
  const pos = lagPosisjon(o);
  const tt: TT = new Map();
  const klasser = lovligeKlasser(pos);
  const ut: { kort: number; lagStikk: number }[] = [];
  for (const kl of klasser) {
    const undo = gjørTrekk(pos, kl.rep);
    const v = løsFra(pos, tt);
    angreTrekk(pos, undo);
    for (const m of kl.medlemmer) ut.push({ kort: m, lagStikk: v });
  }
  return ut;
}

// --- Hybrid: grådig utspilling for tidlig fase, eksakt sluttspill ----------
//
// Eksakt dobbelt-dummy fra 12 stikk er for tungt i ren JS. Løsningen:
// spill de første stikkene med en grei grådig policy (samme ordning som
// søket bruker – vinn billig / kast billig / ikke overtrumf makker), og løs
// deretter de siste `terskel` stikkene eksakt. Presisjonen der den teller
// mest (sluttspillet) beholdes, mens totalkostnaden holdes lav.

const grådigBuf = new Int32Array(16);
const grådigNøkkel = new Int32Array(16);

function grådigOgLøs(pos: DDPosisjon, terskel: number, tt: TT): number {
  while (pos.totalStikk - pos.ferdigeStikk > terskel) {
    const n = genererOgOrdne(pos, grådigBuf, grådigNøkkel);
    if (n === 0) break;
    gjørTrekk(pos, grådigBuf[0]!); // spill grådig-beste, forkast angre
  }
  return løsFra(pos, tt);
}

/** Rent grådig spill helt til slutt – brukt som fallback ved nodetak. */
function grådigTilSlutt(pos: DDPosisjon): number {
  while (pos.totalStikk - pos.ferdigeStikk > 0) {
    const n = genererOgOrdne(pos, grådigBuf, grådigNøkkel);
    if (n === 0) break;
    gjørTrekk(pos, grådigBuf[0]!);
  }
  return pos.declStikk;
}

// Nodetak: bounder ett enkelt søk. 0 = ingen grense (eksakt, f.eks. løsDD).
const AVBRUTT = Symbol("dds-avbrutt");
let _nodeTak = 0;
let _noder = 0;

/** Team-stikk fra posisjonen: grådig til `terskel` stikk gjenstår, så eksakt. */
export function evaluerHybrid(o: DDOppsett, terskel: number, nodeTak = 0): number {
  return medNodetak(o, null, terskel, nodeTak);
}

/** Som evaluerHybrid, men etter at spiller i tur har spilt `kort`. */
export function evaluerEtterTrekk(o: DDOppsett, kort: number, terskel: number, nodeTak = 0): number {
  return medNodetak(o, kort, terskel, nodeTak);
}

function medNodetak(o: DDOppsett, kort: number | null, terskel: number, nodeTak: number): number {
  const forrige = _nodeTak;
  _nodeTak = nodeTak;
  _noder = 0;
  try {
    const pos = lagPosisjon(o);
    if (kort !== null) gjørTrekk(pos, kort);
    if (pos.totalStikk - pos.ferdigeStikk <= terskel) return løsFra(pos, new Map());
    return grådigOgLøs(pos, terskel, new Map());
  } catch (e) {
    if (e === AVBRUTT) {
      // Søket ble for tungt: fall tilbake til rent grådig spill (rask, robust).
      const pos = lagPosisjon(o);
      if (kort !== null) gjørTrekk(pos, kort);
      return grådigTilSlutt(pos);
    }
    throw e;
  } finally {
    _nodeTak = forrige;
  }
}

function søk(pos: DDPosisjon, alpha: number, beta: number, tt: TT): number {
  if (_nodeTak !== 0 && ++_noder > _nodeTak) throw AVBRUTT;
  const gjenstår = pos.totalStikk - pos.ferdigeStikk;
  if (gjenstår === 0) return pos.declStikk;
  const base = pos.declStikk;
  if (base >= beta) return base;
  if (base + gjenstår <= alpha) return base + gjenstår;

  const brukTT = pos.trickLen === 0;
  const a0 = alpha;
  const b0 = beta;
  let k1 = 0;
  let k2 = 0;
  let inner: TTInner | undefined;
  let ttTrekk = -1;
  if (brukTT) {
    k1 = (pos.hash1 ^ ZTUR1[pos.iTur]!) >>> 0;
    k2 = (pos.hash2 ^ ZTUR2[pos.iTur]!) >>> 0;
    inner = tt.get(k1);
    const t = inner?.get(k2);
    if (t) {
      const lavAbs = base + t.lav;
      const høyAbs = base + t.høy;
      if (lavAbs >= beta) return lavAbs;
      if (høyAbs <= alpha) return høyAbs;
      if (t.lav === t.høy) return lavAbs;
      if (lavAbs > alpha) alpha = lavAbs;
      if (høyAbs < beta) beta = høyAbs;
      ttTrekk = t.trekk;
    }
  }

  const ply = pos.ferdigeStikk * pos.N + pos.trickLen;
  const buf = skrapTrekk[ply]!;
  const nøkkel = skrapNøkkel[ply]!;
  const n = genererOgOrdne(pos, buf, nøkkel);
  // TT-trekk først (beste kjente trekk gir raskest avskjæring).
  if (ttTrekk >= 0) {
    for (let i = 1; i < n; i++) {
      if (buf[i] === ttTrekk) {
        for (let j = i; j > 0; j--) buf[j] = buf[j - 1]!;
        buf[0] = ttTrekk;
        break;
      }
    }
  }
  const maksimerer = pos.declLag[pos.iTur]!;

  let best: number;
  let bestTrekk = buf[0]!;
  if (maksimerer) {
    best = -1;
    for (let i = 0; i < n; i++) {
      const undo = gjørTrekk(pos, buf[i]!);
      const v = søk(pos, alpha, beta, tt);
      angreTrekk(pos, undo);
      if (v > best) {
        best = v;
        bestTrekk = buf[i]!;
      }
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
  } else {
    best = pos.totalStikk + 1;
    for (let i = 0; i < n; i++) {
      const undo = gjørTrekk(pos, buf[i]!);
      const v = søk(pos, alpha, beta, tt);
      angreTrekk(pos, undo);
      if (v < best) {
        best = v;
        bestTrekk = buf[i]!;
      }
      if (best < beta) beta = best;
      if (alpha >= beta) break;
    }
  }

  if (brukTT) {
    const rel = best - base;
    let lav = 0;
    let høy = gjenstår;
    if (best <= a0) høy = rel;
    else if (best >= b0) lav = rel;
    else {
      lav = rel;
      høy = rel;
    }
    if (!inner) {
      inner = new Map();
      tt.set(k1, inner);
    }
    inner.set(k2, { lav, høy, trekk: bestTrekk });
  }
  return best;
}
