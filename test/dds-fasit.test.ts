import { strict as assert } from "node:assert";
import { test } from "node:test";

import { løsDD, rotVerdier } from "../src/solver/dds.ts";

/**
 * ============ DDS MOT EN RÅSØKER: FASITEN SOM MANGLET ==================
 *
 * `dds.ts` er full av ting som gjør den rask: bitmasker, ekvivalensklasser,
 * transposisjonstabell, null-vindu-søk, inkrementell gjør/angre. Hver av dem
 * kan ta feil UTEN å krasje – de gir bare et litt annet tall, og et litt annet
 * tall fra en «eksakt» løser er ikke en unøyaktighet, det er en løgn.
 *
 * Testmappa hadde ingen kontroll av den typen. `dds.test.ts` sjekker
 * håndlagde stillinger med ETT stikk og noen få med tre, og de tallene var
 * riktige. Under dem lå to feil som først dukker opp når søket BACKTRACKER
 * over et fullført stikk:
 *
 *   1. `angreTrekk` rullet tilbake `trickLen`, men ikke kortene. Neste stikk
 *      skrev over det forrige stikkets plasser, og etter tilbakerullingen
 *      leste `stikkvinnerPos` feil kort. **86 av 400 tilfeldige 3–4-korts
 *      givinger fikk feil `løsDD`-verdi.**
 *   2. `iSpillMaske` regnet ikke kortene på BORDET som skilletegn, så to egne
 *      kort med et bordkort imellom ble slått sammen til én ekvivalensklasse
 *      og det ene trekket forsvant. 2 av 300 til.
 *
 * Denne fila er kontrollen som ville ha fanget begge fra dag én: en RÅSØKER
 * uten en eneste av optimaliseringene, som deler ingen kode med `dds.ts`. Er
 * de to uenige om ett eneste tall, er ikke `dds.ts` eksakt.
 */

interface Råstilling {
  N: number;
  trump: number;
  declLag: boolean[];
  hender: number[][];
  iTur: number;
  stikk: { spiller: number; kort: number }[];
  declStikk: number;
  ferdige: number;
  total: number;
}

const fargeAv = (c: number): number => Math.floor(c / 13);
const rangAv = (c: number): number => c % 13;

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

function lovlige(s: Råstilling): number[] {
  const h = s.hender[s.iTur]!;
  if (s.stikk.length === 0) return h.slice();
  const led = fargeAv(s.stikk[0]!.kort);
  const følger = h.filter((c) => fargeAv(c) === led);
  return følger.length > 0 ? følger : h.slice();
}

/**
 * Ren minimax uten avskjæring, uten memoisering, uten trekkreduksjon, med
 * kopifri gjør/angre skrevet så enkelt at den er til å lese. Treg, og det er
 * hele poenget: den har ingenting å ta feil av.
 */
function råLøs(s: Råstilling): number {
  if (s.ferdige === s.total) return s.declStikk;
  const maksimerer = s.declLag[s.iTur]!;
  let best = maksimerer ? -1 : s.total + 1;
  for (const kort of lovlige(s)) {
    const h = s.hender[s.iTur]!;
    const i = h.indexOf(kort);
    h.splice(i, 1);
    s.stikk.push({ spiller: s.iTur, kort });
    const iTurFør = s.iTur;
    let v: number;
    if (s.stikk.length === s.N) {
      const led = fargeAv(s.stikk[0]!.kort);
      let bi = 0;
      for (let j = 1; j < s.stikk.length; j++) {
        if (slår(s.stikk[j]!.kort, s.stikk[bi]!.kort, s.trump, led)) bi = j;
      }
      const vinner = s.stikk[bi]!.spiller;
      const stikkFør = s.stikk;
      s.stikk = [];
      s.ferdige++;
      const økning = s.declLag[vinner] ? 1 : 0;
      s.declStikk += økning;
      s.iTur = vinner;
      v = råLøs(s);
      s.iTur = iTurFør;
      s.declStikk -= økning;
      s.ferdige--;
      s.stikk = stikkFør;
    } else {
      s.iTur = (s.iTur + 1) % s.N;
      v = råLøs(s);
      s.iTur = iTurFør;
    }
    s.stikk.pop();
    h.splice(i, 0, kort);
    if (maksimerer ? v > best : v < best) best = v;
  }
  return best;
}

/** Deterministisk pseudotilfeldig giving – testen skal aldri flakke. */
function givinger(frø: number, antall: number, perHånd: number): {
  N: number;
  trump: number;
  declLag: boolean[];
  hender: number[][];
  iTur: number;
  totalStikk: number;
}[] {
  let x = frø;
  const neste = (): number => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return x / 0x7fffffff;
  };
  const ut = [];
  for (let g = 0; g < antall; g++) {
    const stokk: number[] = [];
    for (let c = 0; c < 52; c++) stokk.push(c);
    for (let i = 51; i > 0; i--) {
      const j = Math.floor(neste() * (i + 1));
      const t = stokk[i]!;
      stokk[i] = stokk[j]!;
      stokk[j] = t;
    }
    const hender: number[][] = [];
    for (let p = 0; p < 4; p++) {
      hender.push(stokk.slice(p * perHånd, (p + 1) * perHånd).sort((a, b) => a - b));
    }
    // Både makkerpar og solo, så begge lagformene blir prøvd.
    const solo = g % 3 === 0;
    ut.push({
      N: 4,
      trump: Math.floor(neste() * 4),
      declLag: solo ? [true, false, false, false] : [true, false, true, false],
      hender,
      iTur: Math.floor(neste() * 4),
      totalStikk: perHånd,
    });
  }
  return ut;
}

function rå(o: ReturnType<typeof givinger>[number], førsteKort: number | null): number {
  const s: Råstilling = {
    N: o.N,
    trump: o.trump,
    declLag: o.declLag.slice(),
    hender: o.hender.map((h) => h.slice()),
    iTur: o.iTur,
    stikk: [],
    declStikk: 0,
    ferdige: 0,
    total: o.totalStikk,
  };
  if (førsteKort !== null) {
    const h = s.hender[s.iTur]!;
    h.splice(h.indexOf(førsteKort), 1);
    s.stikk.push({ spiller: s.iTur, kort: førsteKort });
    s.iTur = (s.iTur + 1) % s.N;
  }
  return råLøs(s);
}

test("løsDD er EKSAKT: identisk med en råsøker over 300 tilfeldige givinger", () => {
  let sjekket = 0;
  for (const perHånd of [2, 3, 4]) {
    for (const o of givinger(20_260_808 + perHånd, 100, perHånd)) {
      const dds = løsDD({ ...o, hender: o.hender.map((h) => h.slice()) });
      assert.equal(dds, rå(o, null), `løsDD avviker: ${JSON.stringify(o)}`);
      sjekket++;
    }
  }
  assert.equal(sjekket, 300);
});

test("rotVerdier er EKSAKT for HVERT kort, ikke bare for det beste", () => {
  // Feilen fra 8. august traff nettopp søskentrekkene: det FØRSTE kortet fikk
  // riktig verdi, de neste ble regnet ut på en korrupt stilling. En test som
  // bare sjekket toppvalget ville sett grønt hele veien.
  let sjekket = 0;
  for (const perHånd of [2, 3]) {
    for (const o of givinger(31_415_926 + perHånd, 60, perHånd)) {
      for (const v of rotVerdier({ ...o, hender: o.hender.map((h) => h.slice()) })) {
        assert.equal(v.lagStikk, rå(o, v.kort), `rotVerdier avviker på kort ${v.kort}`);
        sjekket++;
      }
    }
  }
  assert.ok(sjekket > 200, `for få kort sjekket: ${sjekket}`);
});

test("EKVIVALENSKLASSER: kort med et BORDKORT imellom er ikke samme trekk", () => {
  // K5 ligger på bordet, og hånden har K6 og K2. Blant kortene som ennå er i
  // BEHOLD er de naboer, men K6 tar stikket og K2 taper det. Slås de sammen,
  // forsvinner det ene trekket fra søket.
  const K = (verdi: number): number => 3 * 13 + (verdi - 2);
  const R = (verdi: number): number => 2 * 13 + (verdi - 2);
  const verdier = rotVerdier({
    N: 4,
    trump: 0, // spar er trumf; ingen har spar
    declLag: [true, false, true, false],
    hender: [[K(14)], [K(6), K(2)], [R(8)], [R(7)]],
    iTur: 1,
    bord: [
      { spiller: 0, kort: K(3) },
      { spiller: 2, kort: K(4) },
      { spiller: 3, kort: K(5) },
    ],
    declStikkFør: 0,
    ferdigeStikk: 0,
    totalStikk: 2,
  });
  const kort = verdier.map((v) => v.kort).sort((a, b) => a - b);
  assert.deepEqual(kort, [K(2), K(6)], "begge kløverkortene må være egne trekk");
});
