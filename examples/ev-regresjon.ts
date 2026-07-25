/**
 * EV-regresjon: hvilke KOBLINGER driver anger? Ridge-regresjon i stedet for
 * den marginale god-minus-dårlig-heuristikken i examples/genanalyse.ts.
 *
 *   node examples/ev-regresjon.ts d7/fro-d5.json --benk e1-frys --antall 3000 \
 *        --lambda 1.0 --prediktorer 400 --ut d7/ev-regresjon-d5.json
 *
 * HVORFOR EN REGRESJON. genanalyse.ts scorer hvert gen med
 * `goodMargin − badMargin`: gjennomsnittlig marginbidrag i stillinger der
 * genomet traff orakelet, minus det samme i stillingene der det bommet med
 * ≥ 1 poeng. Det er en MARGINAL heuristikk – hvert gen vurderes for seg, som
 * om de andre 1 991 ikke fantes. Men koblingene er ikke uavhengige: de deler
 * målnoder, og på d5 går 40 % av alle kanter inn i de samme ~20 skjulte
 * nodene. Et gen som alltid opptrer sammen med et skadelig gen arver hele
 * skylden i den marginale scoren, selv om det i seg selv er nøytralt.
 * Ridge-regresjonen tilskriver derimot anger til genene SAMTIDIG, med L2 som
 * håndterer at kolonnene er sterkt korrelerte (uten straff ville en OLS med
 * ~2 000 prediktorer og ~3 000 stillinger vært nær singulær).
 *
 * MODELLEN.
 *   y_i  = ANGER i stilling i = max(v) − v(kortet genomet valgte).
 *          LAVERE ER BEDRE. 0 = genomet traff orakelets beste kort.
 *          y2_i = v(valgt) lagres også, og en parallell tilpasning på y2
 *          rapporteres som KONTRAST – ikke som kontroll. Man kunne tro at y2
 *          bare er y speilvendt (y = max(v) − y2), men det stemmer ikke:
 *          målt på e1-frys er sd(max(v)) = 8,3 egenpoeng mot en snittanger på
 *          0,96. y2 domineres altså av hvor mye stillingen er VERDT, ikke av
 *          hvor godt den ble spilt. Målt rangkorrelasjon mellom de to
 *          koeffisientvektorene: ρ ≈ +0,13 på d5 – de måler nesten
 *          ortogonale ting. Det er nettopp derfor ANGER er responsen: den
 *          trekker ut stillingsverdien og lar bare beslutningen stå igjen.
 *   X_ij = det signerte ABLASJONSBIDRAGET fra kobling j til det VALGTE
 *          kortets utgang i stilling i:  ut(valgt) − ut(valgt | j nullet).
 *          X_ij > 0  ⇒ kobling j LØFTET kortet som faktisk ble spilt.
 *          X_ij < 0  ⇒ kortet vant på tross av kobling j.
 *
 * FORTEGNSKONVENSJONEN – dette er lett å få bakvendt, så det står to steder:
 *   β_j > 0  ⇒ jo hardere gen j dyttet for det valgte kortet, jo HØYERE anger
 *              ⇒ genet styrer mot dårlige kort ⇒ SKADELIG.
 *   β_j < 0  ⇒ NYTTIG.
 * genanalyse bruker MOTSATT fortegn (`score` positiv = nyttig). Er de to
 * enige, skal rangkorrelasjonen mellom β og scoreNorm derfor være NEGATIV.
 * Den sammenligningen er hele poenget med dette verktøyet og rapporteres
 * eksplisitt nederst.
 *
 * ABLASJONEN ER LÅNT, IKKE OPPFUNNET PÅ NYTT. FlatNett under er en kopi av
 * den verifiserte klassen i examples/genanalyse.ts (eksakt delta-forplantning,
 * målt mot full reaktivering til 5,6e-17; 2,8 M ablasjoner på 14 s).
 * genanalyse.ts er et toppnivå-skript – å importere det ville kjørt hele
 * analysen – så koden er duplisert. `--sjekk` verifiserer kopien mot full
 * reaktivering, og oppstartstesten mot Nettverk fanger en kopi som har drevet.
 * Forskjellen fra genanalyse er at bidraget her BEHOLDES PER STILLING i stedet
 * for å summeres opp i god- og dårlig-bøtter; det er nettopp den summeringen
 * som gjør heuristikken marginal.
 *
 * BENKEN SKAL VÆRE FROSSEN. Standard er `e1-frys`, en frossen kopi av
 * e1-data3. e1-data3 skrives fortsatt av orakelgeneratoren og driver ~1
 * prosentpoeng mellom kjøringer – nok til å ugyldiggjøre en sammenligning
 * mellom to genomer kjørt minutter fra hverandre. Verktøyet advarer hvis
 * benkmappa ble skrevet til under kjøringen.
 */

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";

import { lesBenk, type Benkstilling } from "../src/neat/angerbenk.ts";
import { biasId, genomFraJson, utId, type Genom } from "../src/neat/genom.ts";
import { Nettverk } from "../src/neat/nett.ts";
import { UT_KORT } from "../src/neat/trekk.ts";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const posisjonelle: string[] = [];
let benkMappe = "e1-frys";
let antall = 3000;
let lambda = 1.0;
let maksPrediktorer = 400;
let utFil = "";
let steg = 7;
let genanalyseFil = "";
let bootstrapp = 5;
let frø = 12345;
let sjekk = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]!;
  if (a === "--benk") benkMappe = argv[++i] ?? benkMappe;
  else if (a === "--antall") antall = Number(argv[++i]);
  else if (a === "--lambda") lambda = Number(argv[++i]);
  else if (a === "--prediktorer") maksPrediktorer = Number(argv[++i]);
  else if (a === "--ut") utFil = argv[++i] ?? "";
  else if (a === "--steg") steg = Number(argv[++i]);
  else if (a === "--genanalyse") genanalyseFil = argv[++i] ?? "";
  else if (a === "--bootstrapp") bootstrapp = Number(argv[++i]);
  else if (a === "--fro") frø = Number(argv[++i]);
  else if (a === "--sjekk") sjekk = true;
  else posisjonelle.push(a);
}
const genomFil = posisjonelle[0];
if (genomFil === undefined) {
  console.error(
    "Bruk: node examples/ev-regresjon.ts <genom.json> [--benk e1-frys] [--antall 3000] " +
      "[--lambda 1.0] [--prediktorer 400] [--ut fil.json]",
  );
  process.exit(1);
}
// «fro-d5» → «d5», slik at standardnavnet blir d7/ev-regresjon-d5.json.
const kortNavn = genomFil.split(/[\\/]/).pop()!.replace(/\.json$/, "").replace(/^fro-/, "");
if (utFil === "") utFil = `d7/ev-regresjon-${kortNavn}.json`;
if (genanalyseFil === "") genanalyseFil = `d7/genanalyse-${kortNavn}.json`;

if (!existsSync(benkMappe)) {
  console.error(`Benkmappa ${benkMappe} finnes ikke. Bruk --benk.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Genom (noen filer er pakket som { genom: … }, andre er rene genomer)
// ---------------------------------------------------------------------------

const råTekst = readFileSync(genomFil, "utf8");
const rå = JSON.parse(råTekst) as { genom?: unknown };
const genom: Genom = genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : råTekst);

// ---------------------------------------------------------------------------
// FlatNett – ordrett kopi fra examples/genanalyse.ts (se toppkommentaren)
// ---------------------------------------------------------------------------

/** «Ingen endring»-grense ved måling. Målt avvik mot full reaktivering ≤ 1,1e-16. */
const NULLGRENSE = 1e-12;

class FlatNett {
  readonly antallInn: number;
  readonly antallUt: number;
  readonly antallNoder: number;
  readonly pass: number;
  readonly utIdx: Int32Array;
  readonly kantFra: Int32Array;
  readonly kantTil: Int32Array;
  readonly kantVekt: Float64Array;
  readonly kantGen: Int32Array;
  readonly antallKanter: number;
  private readonly innStart: Int32Array;
  private readonly innKant: Int32Array;
  private readonly utStart: Int32Array;
  private readonly utKant: Int32Array;

  private readonly verdi: Float64Array[];
  private readonly sum: Float64Array[];

  private readonly dS: Float64Array;
  private readonly dSMerke: Int32Array;
  private readonly dSListe: Int32Array;
  private merkeA: Int32Array;
  private merkeB: Int32Array;
  private verdiA: Float64Array;
  private verdiB: Float64Array;
  private listeA: Int32Array;
  private listeB: Int32Array;
  private stempel = 0;
  private dStempel = 0;
  private sisteMerke: Int32Array;
  private sisteVerdi: Float64Array;
  private sisteStempel = -1;
  private readonly fullA: Float64Array;
  private readonly fullB: Float64Array;

  constructor(g: Genom, maksPass = 8) {
    this.antallInn = g.antallInn;
    this.antallUt = g.antallUt;

    const nodeIdx = new Map<number, number>();
    let idx = 0;
    for (let i = 0; i < g.antallInn; i++) nodeIdx.set(i, idx++);
    nodeIdx.set(biasId(g.antallInn), idx++);
    const øvrige = g.noder
      .filter((n) => n.type === "ut" || n.type === "skjult")
      .sort((x, y) => x.id - y.id);
    for (const n of øvrige) if (!nodeIdx.has(n.id)) nodeIdx.set(n.id, idx++);
    this.antallNoder = idx;

    const fra: number[] = [];
    const til: number[] = [];
    const vekt: number[] = [];
    const gen: number[] = [];
    for (let i = 0; i < g.koblinger.length; i++) {
      const k = g.koblinger[i]!;
      if (!k.aktiv) continue;
      const f = nodeIdx.get(k.inn);
      const t = nodeIdx.get(k.ut);
      if (f === undefined || t === undefined) continue;
      if (t < this.antallInn + 1) continue;
      fra.push(f);
      til.push(t);
      vekt.push(k.vekt);
      gen.push(i);
    }
    this.antallKanter = fra.length;
    this.kantFra = Int32Array.from(fra);
    this.kantTil = Int32Array.from(til);
    this.kantVekt = Float64Array.from(vekt);
    this.kantGen = Int32Array.from(gen);

    this.innStart = byggCsrStart(this.kantTil, this.antallNoder);
    this.innKant = byggCsrKanter(this.kantTil, this.innStart);
    this.utStart = byggCsrStart(this.kantFra, this.antallNoder);
    this.utKant = byggCsrKanter(this.kantFra, this.utStart);

    this.utIdx = new Int32Array(g.antallUt);
    for (let j = 0; j < g.antallUt; j++) this.utIdx[j] = nodeIdx.get(utId(g.antallInn, j))!;

    const skjulte = this.antallNoder - (this.antallInn + 1) - this.antallUt;
    this.pass = Math.min(maksPass, 2 + skjulte);

    this.verdi = Array.from({ length: this.pass + 1 }, () => new Float64Array(this.antallNoder));
    this.sum = Array.from({ length: this.pass + 1 }, () => new Float64Array(this.antallNoder));

    this.dS = new Float64Array(this.antallNoder);
    this.dSMerke = new Int32Array(this.antallNoder).fill(-1);
    this.dSListe = new Int32Array(this.antallNoder);
    this.merkeA = new Int32Array(this.antallNoder).fill(-1);
    this.merkeB = new Int32Array(this.antallNoder).fill(-1);
    this.verdiA = new Float64Array(this.antallNoder);
    this.verdiB = new Float64Array(this.antallNoder);
    this.listeA = new Int32Array(this.antallNoder);
    this.listeB = new Int32Array(this.antallNoder);
    this.sisteMerke = this.merkeA;
    this.sisteVerdi = this.verdiA;
    this.fullA = new Float64Array(this.antallNoder);
    this.fullB = new Float64Array(this.antallNoder);
  }

  aktiver(inn: readonly number[]): Float64Array {
    const v0 = this.verdi[0]!;
    v0.fill(0);
    for (let i = 0; i < this.antallInn; i++) v0[i] = inn[i]!;
    v0[this.antallInn] = 1;
    for (let p = 1; p <= this.pass; p++) {
      const les = this.verdi[p - 1]!;
      const skriv = this.verdi[p]!;
      const s = this.sum[p]!;
      for (let i = 0; i <= this.antallInn; i++) skriv[i] = v0[i]!;
      for (let n = this.antallInn + 1; n < this.antallNoder; n++) {
        let sum = 0;
        for (let e = this.innStart[n]!; e < this.innStart[n + 1]!; e++) {
          const k = this.innKant[e]!;
          sum += les[this.kantFra[k]!]! * this.kantVekt[k]!;
        }
        s[n] = sum;
        skriv[n] = Math.tanh(sum);
      }
    }
    const siste = this.verdi[this.pass]!;
    const ut = new Float64Array(this.antallUt);
    for (let j = 0; j < this.antallUt; j++) ut[j] = siste[this.utIdx[j]!]!;
    return ut;
  }

  basisUt(j: number): number {
    return this.verdi[this.pass]![this.utIdx[j]!]!;
  }

  abler(kant: number): void {
    const t = this.kantTil[kant]!;
    const s = this.kantFra[kant]!;
    const w = this.kantVekt[kant]!;

    let prevMerke = this.merkeA;
    let prevVerdi = this.verdiA;
    let prevListe = this.listeA;
    let curMerke = this.merkeB;
    let curVerdi = this.verdiB;
    let curListe = this.listeB;
    let prevAnt = 0;
    let prevStempel = ++this.stempel;

    for (let p = 1; p <= this.pass; p++) {
      const curStempel = ++this.stempel;
      const dStempel = ++this.dStempel;
      let curAnt = 0;
      let dAnt = 0;
      const forrige = this.verdi[p - 1]!;

      for (let i = 0; i < prevAnt; i++) {
        const n = prevListe[i]!;
        const d = prevVerdi[n]! - forrige[n]!;
        if (d === 0) continue;
        for (let e = this.utStart[n]!; e < this.utStart[n + 1]!; e++) {
          const kk = this.utKant[e]!;
          const m = this.kantTil[kk]!;
          if (this.dSMerke[m] !== dStempel) {
            this.dSMerke[m] = dStempel;
            this.dS[m] = 0;
            this.dSListe[dAnt++] = m;
          }
          this.dS[m] = this.dS[m]! + d * this.kantVekt[kk]!;
        }
      }

      const vs = prevMerke[s] === prevStempel ? prevVerdi[s]! : forrige[s]!;
      if (vs !== 0) {
        if (this.dSMerke[t] !== dStempel) {
          this.dSMerke[t] = dStempel;
          this.dS[t] = 0;
          this.dSListe[dAnt++] = t;
        }
        this.dS[t] = this.dS[t]! - vs * w;
      }

      const basis = this.verdi[p]!;
      const sp = this.sum[p]!;
      for (let i = 0; i < dAnt; i++) {
        const m = this.dSListe[i]!;
        const d = this.dS[m]!;
        if (d === 0) continue;
        const ny = Math.tanh(sp[m]! + d);
        if (ny === basis[m]!) continue;
        curMerke[m] = curStempel;
        curVerdi[m] = ny;
        curListe[curAnt++] = m;
      }

      const tm = prevMerke;
      prevMerke = curMerke;
      curMerke = tm;
      const tv = prevVerdi;
      prevVerdi = curVerdi;
      curVerdi = tv;
      const tl = prevListe;
      prevListe = curListe;
      curListe = tl;
      prevAnt = curAnt;
      prevStempel = curStempel;
      if (prevAnt === 0) break;
    }

    this.merkeA = prevMerke;
    this.verdiA = prevVerdi;
    this.listeA = prevListe;
    this.merkeB = curMerke;
    this.verdiB = curVerdi;
    this.listeB = curListe;
    this.sisteMerke = prevMerke;
    this.sisteVerdi = prevVerdi;
    this.sisteStempel = prevStempel;
  }

  utEtter(j: number): number {
    const n = this.utIdx[j]!;
    return this.sisteMerke[n] === this.sisteStempel
      ? this.sisteVerdi[n]!
      : this.verdi[this.pass]![n]!;
  }

  /** Full reaktivering uten kanten – referansen `--sjekk` måler mot. */
  aktiverUten(inn: readonly number[], kant: number, j: number): number {
    let les = this.fullA;
    let skriv = this.fullB;
    les.fill(0);
    skriv.fill(0);
    for (let i = 0; i < this.antallInn; i++) {
      les[i] = inn[i]!;
      skriv[i] = inn[i]!;
    }
    les[this.antallInn] = 1;
    skriv[this.antallInn] = 1;
    for (let p = 0; p < this.pass; p++) {
      for (let n = this.antallInn + 1; n < this.antallNoder; n++) {
        let sum = 0;
        for (let e = this.innStart[n]!; e < this.innStart[n + 1]!; e++) {
          const k = this.innKant[e]!;
          if (k === kant) continue;
          sum += les[this.kantFra[k]!]! * this.kantVekt[k]!;
        }
        skriv[n] = Math.tanh(sum);
      }
      const tmp = les;
      les = skriv;
      skriv = tmp;
    }
    return les[this.utIdx[j]!]!;
  }
}

function byggCsrStart(nøkkel: Int32Array, antallNoder: number): Int32Array {
  const start = new Int32Array(antallNoder + 1);
  for (let i = 0; i < nøkkel.length; i++) start[nøkkel[i]! + 1]!++;
  for (let n = 0; n < antallNoder; n++) start[n + 1] = start[n + 1]! + start[n]!;
  return start;
}

function byggCsrKanter(nøkkel: Int32Array, start: Int32Array): Int32Array {
  const teller = Int32Array.from(start.subarray(0, start.length - 1));
  const kanter = new Int32Array(nøkkel.length);
  for (let i = 0; i < nøkkel.length; i++) kanter[teller[nøkkel[i]!]!++] = i;
  return kanter;
}

// ---------------------------------------------------------------------------
// Lineæralgebra: Cholesky. Ridge-systemet er symmetrisk positivt definitt for
// λ > 0, så Cholesky holder – p³/6 ≈ 1,1e7 flops ved p = 400, altså under et
// sekund. DERFOR er kolonneutvalget (a) valgt framfor koordinatnedstigning
// (b): med p ≤ ~600 er det direkte oppslaget både raskere og eksakt, mens
// koordinatnedstigning på 2 000 sterkt korrelerte kolonner konvergerer tregt
// og innfører en toleranse vi må forsvare. Prisen er at kolonner må velges
// bort, og hvor mye signal som forsvinner med dem rapporteres eksplisitt.
// ---------------------------------------------------------------------------

/** Nedre Cholesky-faktor L (rad-major), eller null hvis matrisen ikke er PD. */
function cholesky(A: Float64Array, p: number): Float64Array | null {
  const L = new Float64Array(p * p);
  for (let i = 0; i < p; i++) {
    const ri = i * p;
    for (let j = 0; j <= i; j++) {
      const rj = j * p;
      let sum = A[ri + j]!;
      for (let k = 0; k < j; k++) sum -= L[ri + k]! * L[rj + k]!;
      if (i === j) {
        if (!(sum > 0)) return null;
        L[ri + j] = Math.sqrt(sum);
      } else {
        L[ri + j] = sum / L[rj + j]!;
      }
    }
  }
  return L;
}

function løsMedL(L: Float64Array, b: Float64Array, p: number): Float64Array {
  const y = new Float64Array(p);
  for (let i = 0; i < p; i++) {
    const ri = i * p;
    let s = b[i]!;
    for (let k = 0; k < i; k++) s -= L[ri + k]! * y[k]!;
    y[i] = s / L[ri + i]!;
  }
  const x = new Float64Array(p);
  for (let i = p - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let k = i + 1; k < p; k++) s -= L[k * p + i]! * x[k]!;
    x[i] = s / L[i * p + i]!;
  }
  return x;
}

/** Deterministisk RNG for bootstrapp – resultatene skal kunne reproduseres. */
function mulberry32(a: number): () => number {
  let t = a >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Oppstart: nett + benk
// ---------------------------------------------------------------------------

const flat = new FlatNett(genom);
const aktiveKoblinger = genom.koblinger.filter((k) => k.aktiv).length;
console.log(
  `Genom ${genomFil}: ${genom.noder.length} noder, ${genom.koblinger.length} koblinger ` +
    `(${aktiveKoblinger} aktive), ${flat.antallKanter} kanter i nettet, ${flat.pass} pass.`,
);

{
  const referanse = new Nettverk(genom);
  const prøve = Array.from({ length: genom.antallInn }, (_, i) => Math.sin(i * 1.7) * 0.5 + 0.5);
  const a = referanse.aktiver(prøve);
  const b = flat.aktiver(prøve);
  let maks = 0;
  for (let j = 0; j < a.length; j++) maks = Math.max(maks, Math.abs(a[j]! - b[j]!));
  if (maks > 1e-12) {
    console.error(`FlatNett avviker fra Nettverk (maks ${maks.toExponential(2)}) – avbryter.`);
    process.exit(1);
  }
  console.log(`FlatNett = Nettverk (maks avvik ${maks.toExponential(1)}).`);
}

const benk: Benkstilling[] = lesBenk(benkMappe, antall, steg);
if (benk.length === 0) {
  console.error(`Fant ingen stillinger i ${benkMappe}/*.jsonl`);
  process.exit(1);
}

const benkLevende = ((): boolean => {
  const nå = Date.now();
  try {
    return readdirSync(benkMappe)
      .filter((f) => f.endsWith(".jsonl"))
      .some((f) => nå - statSync(`${benkMappe}/${f}`).mtimeMs < 120_000);
  } catch {
    return false;
  }
})();

// ---------------------------------------------------------------------------
// Stillinger: valg, anger (y) og egenpoeng (y2)
// ---------------------------------------------------------------------------

interface Stilling {
  readonly nt: readonly number[];
  readonly lovlige: number[];
  readonly valgt: number;
  /** y: anger = max(v) − v(valgt). Lavere er bedre. */
  readonly anger: number;
  /** y2: v(valgt) – forventede egenpoeng for kortet som faktisk ble spilt. */
  readonly egenpoeng: number;
}

const stillinger: Stilling[] = [];
let uegnet = 0;
let forFåLovlige = 0;
/** Treff = anger < 1e-6. Dette er definisjonen i angerbenk.scoreBenk. */
let treffOrakel = 0;
/**
 * Treff etter genanalyse.ts sin definisjon: `valgt === fasit`, der fasit er
 * FØRSTE kort med maksverdi i Object.keys-rekkefølge.
 *
 * De to er ikke det samme, og forskjellen er stor. Målt på e1-frys har 53,8 %
 * av stillingene FLERE likeverdige beste kort (dobbelt-dummy gir ofte samme
 * verdi for kort i sekvens). Velger genomet et annet av de optimale kortene,
 * teller argmaks-definisjonen det som bom selv om angeren er null. Begge
 * rapporteres, slik at genanalyse-tallene kan sammenlignes uten å blande
 * definisjonsforskjell med ferdighetsforskjell.
 */
let treffArgmaks = 0;
let flereOptimale = 0;

for (const s of benk) {
  if (s.nt === undefined || s.nt.length !== genom.antallInn) {
    uegnet++;
    continue;
  }
  const lovlige = Object.keys(s.v).map(Number);
  if (lovlige.length < 2) {
    forFåLovlige++;
    continue;
  }
  let fasit = lovlige[0]!;
  for (const k of lovlige) if (s.v[String(k)]! > s.v[String(fasit)]!) fasit = k;
  const beste = s.v[String(fasit)]!;
  if (lovlige.filter((k) => beste - s.v[String(k)]! < 1e-6).length > 1) flereOptimale++;

  const ut = flat.aktiver(s.nt);
  let valgt = lovlige[0]!;
  for (const k of lovlige) if (ut[UT_KORT + k]! > ut[UT_KORT + valgt]!) valgt = k;

  const egenpoeng = s.v[String(valgt)]!;
  const anger = beste - egenpoeng;
  if (anger < 1e-6) treffOrakel++;
  if (valgt === fasit) treffArgmaks++;
  stillinger.push({ nt: s.nt, lovlige, valgt, anger, egenpoeng });
}

const n = stillinger.length;
if (n < 50) {
  console.error(`Bare ${n} brukbare stillinger – for lite til en regresjon. Avbryter.`);
  process.exit(1);
}
const pAlle = flat.antallKanter;
if (n * pAlle > 2e8) {
  console.error(
    `${n} stillinger × ${pAlle} kanter = ${(n * pAlle) / 1e6} M celler er for mye minne. ` +
      "Senk --antall.",
  );
  process.exit(1);
}

console.log(
  `\nBenk ${benkMappe}: ${benk.length} lest, ${n} brukbare ` +
    `(hoppet over ${uegnet} uten nt, ${forFåLovlige} med < 2 lovlige kort).`,
);
/** Spredningen i max(v) – målestokken y2-kontrasten under skal leses mot. */
const sdBeste = ((): number => {
  let s = 0;
  let s2 = 0;
  for (const st of stillinger) {
    const b = st.anger + st.egenpoeng;
    s += b;
    s2 += b * b;
  }
  const m = s / n;
  return Math.sqrt(Math.max(0, s2 / n - m * m));
})();

console.log(
  `Optimale valg (anger = 0) ${((100 * treffOrakel) / n).toFixed(1)} %, ` +
    `argmaks-treff ${((100 * treffArgmaks) / n).toFixed(1)} %, ` +
    `snittanger ${(stillinger.reduce((a, s) => a + s.anger, 0) / n).toFixed(4)}.`,
);

// ---------------------------------------------------------------------------
// Designmatrise: X[i][j] = ablasjonsbidrag fra kant j til valgt korts utgang
// ---------------------------------------------------------------------------

const X = new Float64Array(n * pAlle);
const y = new Float64Array(n);
const y2 = new Float64Array(n);
/** Σ_i |X_ij| – brukes til å måle hvor mye signal de forkastede kolonnene bar. */
const kolAbs = new Float64Array(pAlle);

let sjekkMaksAvvik = 0;
let sjekkAntall = 0;

const t0 = performance.now();
console.log(`\nAblerer ${pAlle} kanter × ${n} stillinger …`);
for (let i = 0; i < n; i++) {
  const st = stillinger[i]!;
  y[i] = st.anger;
  y2[i] = st.egenpoeng;
  flat.aktiver(st.nt);
  const j = UT_KORT + st.valgt;
  const basisValgt = flat.basisUt(j);
  const rad = i * pAlle;
  for (let e = 0; e < pAlle; e++) {
    flat.abler(e);
    const d = basisValgt - flat.utEtter(j);
    if (Math.abs(d) < NULLGRENSE) continue;
    X[rad + e] = d;
    kolAbs[e] = kolAbs[e]! + Math.abs(d);

    if (sjekk && sjekkAntall < 300) {
      const fasit = flat.aktiverUten(st.nt, e, j);
      sjekkMaksAvvik = Math.max(sjekkMaksAvvik, Math.abs(fasit - (basisValgt - d)));
      sjekkAntall++;
    }
  }
  if ((i + 1) % 250 === 0 || i + 1 === n) {
    const brukt = (performance.now() - t0) / 1000;
    console.log(
      `  ${i + 1}/${n} (${brukt.toFixed(0)}s, ~${((brukt / (i + 1)) * (n - i - 1)).toFixed(0)}s igjen)`,
    );
  }
}
const ablasjonstid = (performance.now() - t0) / 1000;
if (sjekk) {
  console.log(
    `--sjekk: delta-forplantning mot full reaktivering på ${sjekkAntall} ablasjoner, ` +
      `maks avvik ${sjekkMaksAvvik.toExponential(2)}.`,
  );
}

// ---------------------------------------------------------------------------
// Kolonneutvalg og standardisering
// ---------------------------------------------------------------------------

const snitt = new Float64Array(pAlle);
const sd = new Float64Array(pAlle);
for (let e = 0; e < pAlle; e++) {
  let s = 0;
  for (let i = 0; i < n; i++) s += X[i * pAlle + e]!;
  const m = s / n;
  let v = 0;
  for (let i = 0; i < n; i++) {
    const d = X[i * pAlle + e]! - m;
    v += d * d;
  }
  snitt[e] = m;
  sd[e] = Math.sqrt(v / n);
}

// Kolonner uten varians kan ikke standardiseres og bærer per definisjon ingen
// informasjon – de døde koblingene (46 % på d5) faller ut her uansett P.
const kandidater: number[] = [];
for (let e = 0; e < pAlle; e++) if (sd[e]! > 1e-14) kandidater.push(e);
kandidater.sort((a, b) => sd[b]! - sd[a]!);
const valgteKanter = kandidater.slice(0, Math.max(1, maksPrediktorer));
const p = valgteKanter.length;

const totalAbs = kolAbs.reduce((a, b) => a + b, 0);
const beholdtAbs = valgteKanter.reduce((a, e) => a + kolAbs[e]!, 0);
const døde = pAlle - kandidater.length;
const forkastet = pAlle - p;

console.log(
  `\nPrediktorer: ${p} brukt av ${pAlle} kanter. ${døde} var døde (null varians), ` +
    `${forkastet - døde} levende kolonner forkastet av variansfilteret.`,
);
console.log(
  `De brukte kolonnene bærer ${((100 * beholdtAbs) / Math.max(totalAbs, 1e-300)).toFixed(2)} % ` +
    `av samlet |bidrag| i hele designmatrisen.`,
);

// Z: standardisert designmatrise, rad-major n × p.
const Z = new Float64Array(n * p);
for (let c = 0; c < p; c++) {
  const e = valgteKanter[c]!;
  const m = snitt[e]!;
  const s = sd[e]!;
  for (let i = 0; i < n; i++) Z[i * p + c] = (X[i * pAlle + e]! - m) / s;
}

// ---------------------------------------------------------------------------
// Ridge
// ---------------------------------------------------------------------------

/**
 * Gram-matrise G = Z'Z/m og kryssprodukt c = Z'ỹ/m for et gitt radutvalg.
 * Delingen på m er ikke kosmetikk: den gjør diagonalen ≈ 1, slik at λ måles
 * i «andel av kolonnens egen varians» og λ = 1 betyr halvering av et rent
 * signal – uten den ville λ måttet skaleres med antall stillinger for å bety
 * det samme. ỹ er sentrert, så modellen trenger ikke konstantledd.
 */
function byggGram(rader: Int32Array, yv: Float64Array): { G: Float64Array; c: Float64Array; yMid: number } {
  const m = rader.length;
  let yMid = 0;
  for (let r = 0; r < m; r++) yMid += yv[rader[r]!]!;
  yMid /= m;
  const G = new Float64Array(p * p);
  const c = new Float64Array(p);
  for (let r = 0; r < m; r++) {
    const base = rader[r]! * p;
    const yd = yv[rader[r]!]! - yMid;
    for (let i = 0; i < p; i++) {
      const zi = Z[base + i]!;
      if (zi === 0) continue;
      c[i] = c[i]! + zi * yd;
      const ri = i * p;
      for (let j = 0; j <= i; j++) G[ri + j] = G[ri + j]! + zi * Z[base + j]!;
    }
  }
  for (let i = 0; i < p; i++) {
    c[i] = c[i]! / m;
    const ri = i * p;
    for (let j = 0; j <= i; j++) {
      const v = G[ri + j]! / m;
      G[ri + j] = v;
      G[j * p + i] = v;
    }
  }
  return { G, c, yMid };
}

function ridge(G: Float64Array, c: Float64Array, lam: number): Float64Array {
  const A = Float64Array.from(G);
  for (let i = 0; i < p; i++) A[i * p + i] = A[i * p + i]! + lam;
  const L = cholesky(A, p);
  if (L === null) {
    console.error(`Ridge-systemet er ikke positivt definitt ved λ = ${lam} – øk --lambda.`);
    process.exit(1);
  }
  return løsMedL(L, c, p);
}

/** R² for β på et radutvalg. Sentreringen bruker utvalgets eget snitt. */
function rKvadrat(beta: Float64Array, rader: Int32Array, yv: Float64Array): number {
  const m = rader.length;
  let yMid = 0;
  for (let r = 0; r < m; r++) yMid += yv[rader[r]!]!;
  yMid /= m;
  let rss = 0;
  let tss = 0;
  for (let r = 0; r < m; r++) {
    const i = rader[r]!;
    const base = i * p;
    let pred = 0;
    for (let j = 0; j < p; j++) pred += beta[j]! * Z[base + j]!;
    const d = yv[i]! - yMid - pred;
    rss += d * d;
    const t = yv[i]! - yMid;
    tss += t * t;
  }
  return tss === 0 ? NaN : 1 - rss / tss;
}

const alleRader = Int32Array.from({ length: n }, (_, i) => i);
// Hver 5. stilling holdes utenfor. Uttaket er deterministisk og spredt, ikke
// tilfeldig: benkstillingene er allerede plukket med steg 7 over datasettet,
// så nabostillinger er ikke fra samme parti.
const testRader = Int32Array.from(alleRader.filter((i) => i % 5 === 0));
const trenRader = Int32Array.from(alleRader.filter((i) => i % 5 !== 0));

console.log(`\nBygger Gram-matrise (${p}×${p}) …`);
const tG = performance.now();
const full = byggGram(alleRader, y);
const tren = byggGram(trenRader, y);
console.log(`  ${((performance.now() - tG) / 1000).toFixed(1)}s.`);

// Lambda-sveip. In-sample R² faller monotont med λ og kan ikke velge noe;
// derfor måles sveipet på holdout-settet, som faktisk skiller overtilpasning
// fra signal.
const sveipVerdier = [0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30, 100];
if (!sveipVerdier.includes(lambda)) sveipVerdier.push(lambda);
sveipVerdier.sort((a, b) => a - b);
interface SveipRad {
  lambda: number;
  rTren: number;
  rTest: number;
}
const sveip: SveipRad[] = [];
for (const lam of sveipVerdier) {
  const b = ridge(tren.G, tren.c, lam);
  sveip.push({ lambda: lam, rTren: rKvadrat(b, trenRader, y), rTest: rKvadrat(b, testRader, y) });
}
const besteSveip = sveip.reduce((a, b) => (b.rTest > a.rTest ? b : a));

// Den endelige modellen bruker λ fra CLI (ikke sveipets vinner – sveipet er
// rapportert, ikke automatisert, slik at valget er synlig i loggen).
const beta = ridge(full.G, full.c, lambda);
const r2InnSample = rKvadrat(beta, alleRader, y);
const betaTren = ridge(tren.G, tren.c, lambda);
const r2Holdout = rKvadrat(betaTren, testRader, y);

// Kontrolltilpasning på y2 = v(valgt). Samme Gram-matrise, bare nytt
// kryssprodukt – nesten gratis. y2 = beste − y, og siden «beste» varierer
// mellom stillinger er speilvendingen ikke perfekt; korrelasjonen mellom de to
// koeffisientvektorene rapporteres som en sanity-sjekk på fortegnsregningen.
const full2 = byggGram(alleRader, y2);
const beta2 = ridge(full2.G, full2.c, lambda);

// ---------------------------------------------------------------------------
// Bootstrapp: fortegnsstabilitet
// ---------------------------------------------------------------------------

/**
 * Fortegnet er det eneste ved en ridge-koeffisient som er tolkbart uten
 * usikkerhetsmål: «skadelig» eller «nyttig». Med sterkt korrelerte kolonner
 * kan L2 fordele den samme effekten vilkårlig mellom to samvarierende gener,
 * og da vipper fortegnet på støy. Fem resamplinger med tilbakelegging over
 * STILLINGENE (ikke over genene) sier hvor ofte fortegnet overlever.
 * Standardiseringen holdes fast fra fullutvalget – resamplingen skal måle
 * usikkerhet i tilpasningen, ikke i skaleringen.
 */
const rng = mulberry32(frø);
const fortegnEnig = new Int32Array(p);
const bootBeta: Float64Array[] = [];
console.log(`\nBootstrapp: ${bootstrapp} resamplinger …`);
for (let b = 0; b < bootstrapp; b++) {
  const rader = new Int32Array(n);
  for (let i = 0; i < n; i++) rader[i] = Math.floor(rng() * n);
  const g = byggGram(rader, y);
  const bb = ridge(g.G, g.c, lambda);
  bootBeta.push(bb);
  for (let j = 0; j < p; j++) if (Math.sign(bb[j]!) === Math.sign(beta[j]!)) fortegnEnig[j]!++;
  console.log(`  ${b + 1}/${bootstrapp}`);
}

// ---------------------------------------------------------------------------
// Rader per kobling
// ---------------------------------------------------------------------------

interface Rad {
  innovasjon: number;
  inn: number;
  ut: number;
  vekt: number;
  /** Koeffisient på RÅ bidragsskala: endring i anger per enhet ablasjonsbidrag. */
  koef: number;
  /** Standardisert koeffisient: endring i anger per 1 sd bidrag. RANGERINGEN. */
  koefStd: number;
  /** Samme, men mot y2 = v(valgt). Skal ha motsatt fortegn av koefStd. */
  koefStdEgenpoeng: number;
  /** Andel av bootstrapp-tilpasningene med samme fortegn som hovedmodellen. */
  fortegnStabilitet: number;
  /** Kolonnens standardavvik og Σ|bidrag| – hvor mye genet i det hele tatt rører. */
  sd: number;
  absBidrag: number;
  /** genanalyse.ts sin marginale score, hvis filen fantes (positiv = nyttig DER). */
  scoreNorm: number | null;
  scoreBidragNorm: number | null;
}

// genanalyse-sammenligningen: innovasjonsnummer → scoreNorm/scoreBidragNorm.
interface GenanalyseRad {
  innovasjon: number;
  scoreNorm: number;
  scoreBidragNorm: number;
}
const genanalyseKart = new Map<number, GenanalyseRad>();
let genanalyseLest = false;
let genanalyseBenk = "";
if (existsSync(genanalyseFil)) {
  try {
    const g = JSON.parse(readFileSync(genanalyseFil, "utf8")) as {
      koblinger?: GenanalyseRad[];
      benk?: string;
    };
    for (const r of g.koblinger ?? []) genanalyseKart.set(r.innovasjon, r);
    genanalyseLest = genanalyseKart.size > 0;
    genanalyseBenk = g.benk ?? "";
  } catch {
    genanalyseLest = false;
  }
}
/**
 * Er genanalysen kjørt på en ANNEN benk enn ridge-modellen, måler
 * sammenligningen dels metodeforskjell og dels benkdrift. Målt 2026-07-25 på
 * d5: ρ(koefStd, scoreNorm) = −0,20 når genanalysen kom fra e1-data3, men
 * −0,40 når den ble kjørt på nytt på e1-frys. Halve «uenigheten» var altså
 * bare drift i den levende benken. Derfor advares det høyt.
 */
const benkerSpriker = genanalyseLest && genanalyseBenk !== "" && genanalyseBenk !== benkMappe;

const rader: Rad[] = [];
for (let c = 0; c < p; c++) {
  const e = valgteKanter[c]!;
  const kobling = genom.koblinger[flat.kantGen[e]!]!;
  const ga = genanalyseKart.get(kobling.innovasjon);
  rader.push({
    innovasjon: kobling.innovasjon,
    inn: kobling.inn,
    ut: kobling.ut,
    vekt: kobling.vekt,
    koef: beta[c]! / sd[e]!,
    koefStd: beta[c]!,
    koefStdEgenpoeng: beta2[c]!,
    fortegnStabilitet: bootstrapp > 0 ? fortegnEnig[c]! / bootstrapp : NaN,
    sd: sd[e]!,
    absBidrag: kolAbs[e]!,
    scoreNorm: ga?.scoreNorm ?? null,
    scoreBidragNorm: ga?.scoreBidragNorm ?? null,
  });
}
// Synkende koefStd: mest SKADELIG først (positiv koeffisient = mer anger).
rader.sort((a, b) => b.koefStd - a.koefStd);

// ---------------------------------------------------------------------------
// Rangkorrelasjoner
// ---------------------------------------------------------------------------

function ranger(v: readonly number[]): number[] {
  const idx = v.map((_, i) => i).sort((a, b) => v[a]! - v[b]!);
  const r = new Array<number>(v.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && v[idx[j + 1]!]! === v[idx[i]!]!) j++;
    const snittRang = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k]!] = snittRang;
    i = j + 1;
  }
  return r;
}

function pearson(a: readonly number[], b: readonly number[]): number {
  const m = a.length;
  if (m < 3) return NaN;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < m; i++) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= m;
  mb /= m;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < m; i++) {
    const da = a[i]! - ma;
    const db = b[i]! - mb;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  return saa === 0 || sbb === 0 ? NaN : sab / Math.sqrt(saa * sbb);
}

function spearman(a: readonly number[], b: readonly number[]): number {
  return pearson(ranger(a), ranger(b));
}

const medGenanalyse = rader.filter((r) => r.scoreNorm !== null);
const rhoMargin = genanalyseLest
  ? spearman(
      medGenanalyse.map((r) => r.koefStd),
      medGenanalyse.map((r) => r.scoreNorm!),
    )
  : NaN;
const rhoBidrag = genanalyseLest
  ? spearman(
      medGenanalyse.map((r) => r.koefStd),
      medGenanalyse.map((r) => r.scoreBidragNorm!),
    )
  : NaN;
const rhoEgenpoeng = spearman(
  rader.map((r) => r.koefStd),
  rader.map((r) => r.koefStdEgenpoeng),
);

// Topplisteoverlapp: er de 20 verste de samme genene i de to metodene?
const ridgeVerst = new Set(rader.slice(0, 20).map((r) => r.innovasjon));
const ridgeBest = new Set(rader.slice(-20).map((r) => r.innovasjon));
const genanalyseSortert = [...medGenanalyse].sort((a, b) => a.scoreNorm! - b.scoreNorm!);
const gaVerst = new Set(genanalyseSortert.slice(0, 20).map((r) => r.innovasjon));
const gaBest = new Set(genanalyseSortert.slice(-20).map((r) => r.innovasjon));
const overlappVerst = [...ridgeVerst].filter((i) => gaVerst.has(i)).length;
const overlappBest = [...ridgeBest].filter((i) => gaBest.has(i)).length;

const ustabile = rader.filter((r) => r.fortegnStabilitet < 1).length;
const svaertUstabile = rader.filter((r) => r.fortegnStabilitet <= 0.6).length;

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------

const linjer: string[] = [];
const si = (s: string): void => {
  console.log(s);
  linjer.push(s);
};

si("");
si("=".repeat(96));
si(`EV-REGRESJON (ridge)  ${genomFil}   benk ${benkMappe}`);
si("=".repeat(96));
si(`Stillinger i regresjonen     ${n}  (${benk.length} lest, ${uegnet} uten nt, ${forFåLovlige} med < 2 kort)`);
si(`Optimale valg (anger = 0)    ${((100 * treffOrakel) / n).toFixed(1)} % (${treffOrakel}/${n})`);
si(`  samme, argmaks-definisjon  ${((100 * treffArgmaks) / n).toFixed(1)} % (${treffArgmaks}/${n})  ← genanalyse.ts sin`);
si(`  stillinger m/ flere optima ${((100 * flereOptimale) / n).toFixed(1)} %  ← hele forskjellen mellom de to`);
si(`Snittanger (respons y)       ${(stillinger.reduce((a, s) => a + s.anger, 0) / n).toFixed(4)} egenpoeng`);
si(`Snitt v(valgt) (y2)          ${(stillinger.reduce((a, s) => a + s.egenpoeng, 0) / n).toFixed(4)} egenpoeng`);
si(`Kanter i nettet              ${pAlle}`);
si(`  døde (null varians)        ${døde}`);
si(`  forkastet av variansfilter ${forkastet - døde}`);
si(`Prediktorer BRUKT            ${p} (--prediktorer ${maksPrediktorer})`);
si(`  bærer andel av Σ|bidrag|   ${((100 * beholdtAbs) / Math.max(totalAbs, 1e-300)).toFixed(2)} %`);
si(`  forkastede kolonner bar    ${((100 * (totalAbs - beholdtAbs)) / Math.max(totalAbs, 1e-300)).toFixed(2)} %`);
si(`Lambda (brukt)               ${lambda}`);
si(`R² in-sample                 ${r2InnSample.toFixed(4)}`);
si(`R² holdout (hver 5. stilling)${r2Holdout.toFixed(4).padStart(8)}`);
si(`Ablasjonstid                 ${ablasjonstid.toFixed(0)} s`);
si("");
si("LAMBDA-SVEIP (tilpasset på 4/5, målt på holdout):");
for (const s of sveip) {
  si(
    `  λ ${String(s.lambda).padStart(6)}   R²tren ${s.rTren.toFixed(4).padStart(8)}` +
      `   R²holdout ${s.rTest.toFixed(4).padStart(8)}` +
      (s.lambda === besteSveip.lambda ? "   ← best holdout" : "") +
      (s.lambda === lambda ? "   ← brukt" : ""),
  );
}
si("");
si("FORTEGNSKONVENSJON: y = ANGER (max(v) − v(valgt)), lavere er bedre.");
si("  koefStd > 0  ⇒ genet øker angeren når det dytter for det valgte kortet ⇒ SKADELIG");
si("  koefStd < 0  ⇒ NYTTIG");
si("  (genanalyse.ts sin `scoreNorm` har MOTSATT fortegn: positiv = nyttig der.)");
si("");

const skriv = (r: Rad): string =>
  `  innov ${String(r.innovasjon).padStart(6)}  ${String(r.inn).padStart(4)}→${String(r.ut).padStart(7)}` +
  `  vekt ${r.vekt.toFixed(3).padStart(7)}` +
  `  koefStd ${r.koefStd.toExponential(3).padStart(11)}` +
  `  koef ${r.koef.toExponential(2).padStart(10)}` +
  `  fortegn ${(r.fortegnStabilitet * 100).toFixed(0).padStart(3)} %` +
  `  scoreNorm ${r.scoreNorm === null ? "     –" : r.scoreNorm.toFixed(4).padStart(8)}`;

si("20 MEST SKADELIGE koblinger (størst positiv koeffisient på anger):");
for (const r of rader.slice(0, 20)) si(skriv(r));
si("");
si("20 MEST NYTTIGE koblinger (størst negativ koeffisient på anger):");
for (const r of rader.slice(-20).reverse()) si(skriv(r));
si("");

si("FORTEGNSSTABILITET (5 bootstrapp-resamplinger av STILLINGENE):");
si(
  `  ${p - ustabile} av ${p} koblinger (${((100 * (p - ustabile)) / p).toFixed(0)} %) ` +
    "beholdt fortegnet i ALLE resamplingene.",
);
si(
  `  ${svaertUstabile} koblinger (${((100 * svaertUstabile) / p).toFixed(0)} %) hadde ` +
    "≤ 60 % fortegnsenighet – de er STØY, ikke funn.",
);
si("  En kobling med fortegnsstabilitet < 100 % skal IKKE brukes som grunnlag for");
si("  selektiv arv: ridge fordeler samme effekt vilkårlig mellom samvarierende gener,");
si("  og da er «skadelig» eller «nyttig» avgjort av hvilke stillinger som kom med.");
const stabileSkadelige = rader.slice(0, 20).filter((r) => r.fortegnStabilitet === 1).length;
const stabileNyttige = rader.slice(-20).filter((r) => r.fortegnStabilitet === 1).length;
si(
  `  Av topp 20 skadelige er ${stabileSkadelige} helt stabile; av topp 20 nyttige ${stabileNyttige}.`,
);
si("");

si("SAMMENLIGNING MED DEN MARGINALE HEURISTIKKEN (genanalyse):");
if (!genanalyseLest) {
  si(`  ${genanalyseFil} finnes ikke eller kunne ikke leses – ingen sammenligning.`);
} else {
  si(`  Kilde: ${genanalyseFil} (${medGenanalyse.length} felles koblinger)`);
  if (benkerSpriker) {
    si(`  ADVARSEL: den filen ble kjørt på benk «${genanalyseBenk}», ikke «${benkMappe}».`);
    si("  Tallene under blander da metodeforskjell med benkdrift. Målt på d5 flyttet");
    si("  ρ(koefStd, scoreNorm) seg fra −0,20 til −0,40 bare ved å kjøre genanalysen på");
    si(`  nytt på samme benk. Kjør: node examples/genanalyse.ts ${genomFil} --benk ${benkMappe} --antall ${antall}`);
  }
  si("  Er metodene enige, skal rangkorrelasjonen være NEGATIV (motsatte fortegnskonvensjoner).");
  si(`  Spearman ρ(koefStd, scoreNorm)         ${rhoMargin.toFixed(4)}   (margin-scoren, genanalyses rangering)`);
  si(`  Spearman ρ(koefStd, scoreBidragNorm)   ${rhoBidrag.toFixed(4)}   (bidrag-scoren, samme størrelse som X)`);
  si(`  Topp-20 SKADELIGE felles med genanalyse:  ${overlappVerst}/20`);
  si(`  Topp-20 NYTTIGE  felles med genanalyse:  ${overlappBest}/20`);
}
si("");
si("KONTRAST MOT y2 = v(valgt):");
si(`  Spearman ρ(koefStd på anger, koefStd på v(valgt)) = ${rhoEgenpoeng.toFixed(4)}`);
si(`  sd(max(v)) over stillingene = ${sdBeste.toFixed(3)} egenpoeng, mot snittanger ${(stillinger.reduce((a, s) => a + s.anger, 0) / n).toFixed(3)}.`);
si("  y2 er IKKE y speilvendt, selv om y = max(v) − y2: stillingsverdien varierer");
si("  langt mer enn beslutningskvaliteten, så en regresjon på y2 lærer hvilke gener");
si("  som fyrer i verdifulle stillinger – ikke hvilke som velger riktig kort.");
si("  Det er hele grunnen til at ANGER er responsen her.");

if (benkLevende) {
  si("");
  si(`ADVARSEL: ${benkMappe} ble skrevet til under kjøringen – benken er ikke frossen.`);
  si("Sammenlign bare genomer fra SAMME kjøring.");
}

// ---------------------------------------------------------------------------
// Filer (aldri bare stdout – se LANGKJØRINGER-notatet)
// ---------------------------------------------------------------------------

const mappe = dirname(utFil);
if (mappe !== "" && mappe !== ".") mkdirSync(mappe, { recursive: true });

writeFileSync(
  utFil,
  JSON.stringify(
    {
      genom: genomFil,
      benk: benkMappe,
      antall,
      steg,
      lambda,
      maksPrediktorer,
      bootstrapp,
      fro: frø,
      stillingerLest: benk.length,
      stillingerBrukt: n,
      hoppetOverUtenNt: uegnet,
      hoppetOverForFaaLovlige: forFåLovlige,
      optimaleValg: treffOrakel / n,
      treffArgmaks: treffArgmaks / n,
      andelFlereOptimale: flereOptimale / n,
      snittanger: stillinger.reduce((a, s) => a + s.anger, 0) / n,
      snittEgenpoeng: stillinger.reduce((a, s) => a + s.egenpoeng, 0) / n,
      sdBesteVerdi: sdBeste,
      kanterTotalt: pAlle,
      kanterDode: døde,
      kanterForkastet: forkastet - døde,
      prediktorerBrukt: p,
      andelAbsBidragBeholdt: beholdtAbs / Math.max(totalAbs, 1e-300),
      r2InnSample,
      r2Holdout,
      lambdaSveip: sveip,
      besteHoldoutLambda: besteSveip.lambda,
      ablasjonstidSek: ablasjonstid,
      fortegnskonvensjon:
        "y = anger = max(v) - v(valgt). koefStd > 0 => genet oeker angeren => SKADELIG. " +
        "genanalyse.scoreNorm har motsatt fortegn (positiv = nyttig).",
      genanalyseKilde: genanalyseLest ? genanalyseFil : null,
      genanalyseBenk: genanalyseLest ? genanalyseBenk : null,
      genanalyseBenkSpriker: benkerSpriker,
      spearmanKoefStdMotScoreNorm: rhoMargin,
      spearmanKoefStdMotScoreBidragNorm: rhoBidrag,
      spearmanAngerMotEgenpoeng: rhoEgenpoeng,
      overlappTopp20Skadelige: overlappVerst,
      overlappTopp20Nyttige: overlappBest,
      koblinger: rader,
    },
    null,
    1,
  ),
);
const txtFil = utFil.replace(/\.json$/, "") + ".txt";
writeFileSync(txtFil, linjer.join("\n") + "\n");
console.log(`Skrev ${utFil} og ${txtFil}`);
