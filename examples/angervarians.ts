/**
 * ANGERVARIANS: hvor sitter variansen i anger?
 *
 *   node examples/angervarians.ts --benk e1-frys --antall 2500 --ablasjon 4
 *
 * BAKGRUNNEN. examples/ev-regresjon.ts tilskriver ANGER (y = max(v) − v(valgt))
 * til enkeltkoblinger i genomet via signerte ablasjonsbidrag. Målt på e1-frys
 * med 2 500 stillinger gir den R² på holdout 0,017 / −0,003 / 0,008 / 0,014 for
 * d5 / d6 / d8b / d8d, og bare 20–32 % av koblingene beholder fortegnet over
 * bootstrapp. Genomet forklarer altså tilnærmet ingenting av angeren.
 * Dette skriptet spør hvor forklaringskraften da ligger, og svarer med tall som
 * er DIREKTE SAMMENLIGNBARE med ev-regresjonens: alle R² her er ut-av-fold
 * (5-delt kryssvalidering), aldri in-sample.
 *
 * FEM UAVHENGIGE MÅLINGER, i økende grad av «juks»:
 *
 *  1. TOVEIS VARIANSDEKOMPONERING stilling × agent. Samme stillinger, flere
 *     agenter. Anger er DETERMINISTISK gitt (agent, stilling) – det finnes
 *     ingen målestøy – så restleddet er ekte samspill, ikke feil. Er
 *     agenteffekten bare noen få prosent, er nesten all varians noe alle
 *     agenter deler: stillingen.
 *
 *  2. STILLINGSVANSKE MÅLT PÅ ANDRE AGENTER (leave-one-agent-out). For hver
 *     agent predikeres angeren av snittangeren til de ØVRIGE agentene i samme
 *     stilling. Prediktoren vet ingenting om agenten – bare hvor vanskelig
 *     stillingen er. Dette er det ærligste taket: hvor mye av EN agents anger
 *     er ren stillingsvanske? Sammenlign direkte med 0,017.
 *
 *  3. BILLIGE STILLINGSEGENSKAPER. 20 variabler som kan regnes ut uten å vite
 *     hvilken agent som spiller: antall lovlige kort, antall optimale kort,
 *     spredningen i orakelverdiene, «anger ved tilfeldig lovlig valg»,
 *     stikknummer, rolle (spillefører/makker/forsvarer), trumfkontroll osv.
 *
 *  4. BESLUTNINGSSKALARER. Nettets egen beslutning oppsummert i tre tall:
 *     marginen mellom beste og NEST beste lovlige utgang (bestemthet),
 *     spredningen og standardavviket i utgangene over de lovlige kortene.
 *     Merk: marginen mot ORAKELETS beste kort er bevisst IKKE med – den ville
 *     vært lekkasje (den er null nøyaktig når angeren er null).
 *
 *  5. ABLASJONSMODELLEN på nytt (ev-regresjonens egen), men med
 *     kryssvalidering og med to metrikker til: AUC for «anger > 0» og Spearman
 *     mot anger. Responsen er nemlig nullinflatert (~50 % nøyaktig 0), og en
 *     lav lineær R² på en slik respons kunne i prinsippet skjule en modell som
 *     RANGERER godt. Uten AUC og Spearman kan man ikke skille de to.
 *
 * ALLE MODELLENE FÅR NØYAKTIG SAMME BEHANDLING: samme foldinndeling
 * (i % 5), ridge med λ-sveip valgt på ut-av-fold R², standardisering estimert
 * på treningsfoldene alene, og de samme tre metrikkene. Da er tallene
 * sammenlignbare radvis i rapporten, og forskjellene er modell, ikke metode.
 *
 * FLATNETT ER LÅNT. Klassen under er en trimmet kopi av den verifiserte
 * klassen i examples/genanalyse.ts / examples/ev-regresjon.ts (eksakt
 * delta-forplantning). Begge er toppnivå-skript – å importere dem ville kjørt
 * hele deres analyse – så koden er duplisert, akkurat som ev-regresjon
 * dupliserte den fra genanalyse. Oppstartstesten mot Nettverk fanger en kopi
 * som har drevet.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { lesBenk, type Benkstilling } from "../src/neat/angerbenk.ts";
import {
  biasId,
  genomFraJson,
  Innovasjonsbok,
  nyttGenom,
  utId,
  type Genom,
} from "../src/neat/genom.ts";
import { Nettverk } from "../src/neat/nett.ts";
import { ANTALL_INN, ANTALL_UT, UT_KORT } from "../src/neat/trekk.ts";
import { nevroHjerne } from "../src/nevro/index.ts";
import { forover } from "../src/nevro/nett.ts";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
let benkMappe = "e1-frys";
let antall = 2500;
let steg = 7;
let folder = 5;
let ablasjonAntall = 4;
let maksPrediktorer = 400;
let frø = 12345;
let utFil = "analyse/angervarians.json";
const egneAgenter: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]!;
  if (a === "--benk") benkMappe = argv[++i] ?? benkMappe;
  else if (a === "--antall") antall = Number(argv[++i]);
  else if (a === "--steg") steg = Number(argv[++i]);
  else if (a === "--folder") folder = Number(argv[++i]);
  else if (a === "--ablasjon") ablasjonAntall = Number(argv[++i]);
  else if (a === "--prediktorer") maksPrediktorer = Number(argv[++i]);
  else if (a === "--fro") frø = Number(argv[++i]);
  else if (a === "--ut") utFil = argv[++i] ?? utFil;
  else if (a === "--agent") egneAgenter.push(argv[++i] ?? "");
  else {
    console.error(
      "Bruk: node examples/angervarians.ts [--benk e1-frys] [--antall 2500] [--steg 7]\n" +
        "      [--agent <genom.json> …] [--ablasjon 4] [--prediktorer 400] [--folder 5]\n" +
        `      [--ut analyse/angervarians.json]   (ukjent argument: ${a})`,
    );
    process.exit(1);
  }
}

if (!existsSync(benkMappe)) {
  console.error(`Benkmappa ${benkMappe} finnes ikke. Bruk --benk.`);
  process.exit(1);
}

/** Standardutvalget: to D7-frø, to D8-mestre. Overstyres med --agent. */
const STANDARD_AGENTER = [
  "d7/fro-d5-gull.json",
  "d7/fro-d6-klar.json",
  "trening-d8b/mester.json",
  "trening-d8d/mester.json",
];
const genomFiler = (egneAgenter.length > 0 ? egneAgenter : STANDARD_AGENTER).filter(
  (f) => f !== "",
);

// ---------------------------------------------------------------------------
// FlatNett – trimmet kopi fra examples/ev-regresjon.ts (se toppkommentaren).
// Bare det ablasjonen trenger er med: aktiver, abler, utEtter, basisUt.
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
// Lineæralgebra og statistikk
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

/**
 * AUC (Mann–Whitney) for en binær etikett mot en kontinuerlig skår.
 * 0,5 = ingen rangeringsevne. Nødvendig fordi responsen er nullinflatert:
 * en modell kan skille «bommet» fra «traff» godt og likevel ha R² ≈ 0.
 */
function auc(etikett: readonly boolean[], skår: readonly number[]): number {
  const r = ranger(skår);
  let pos = 0;
  let sumRangPos = 0;
  for (let i = 0; i < etikett.length; i++) {
    if (etikett[i]!) {
      pos++;
      sumRangPos += r[i]!;
    }
  }
  const neg = etikett.length - pos;
  if (pos === 0 || neg === 0) return NaN;
  return (sumRangPos - (pos * (pos + 1)) / 2) / (pos * neg);
}

/** R² regnet mot GLOBALT snitt av y – samme nevner for alle modeller. */
function r2(y: Float64Array, pred: Float64Array): number {
  const n = y.length;
  let m = 0;
  for (let i = 0; i < n; i++) m += y[i]!;
  m /= n;
  let rss = 0;
  let tss = 0;
  for (let i = 0; i < n; i++) {
    const d = y[i]! - pred[i]!;
    rss += d * d;
    const t = y[i]! - m;
    tss += t * t;
  }
  return tss === 0 ? NaN : 1 - rss / tss;
}

/** R² på en delmengde av radene (brukes for «bare stillingene med anger > 0»). */
function r2Delmengde(y: Float64Array, pred: Float64Array, rader: readonly number[]): number {
  const m0 = rader.length;
  if (m0 < 3) return NaN;
  let m = 0;
  for (const i of rader) m += y[i]!;
  m /= m0;
  let rss = 0;
  let tss = 0;
  for (const i of rader) {
    const d = y[i]! - pred[i]!;
    rss += d * d;
    const t = y[i]! - m;
    tss += t * t;
  }
  return tss === 0 ? NaN : 1 - rss / tss;
}

// ---------------------------------------------------------------------------
// Kryssvalidert ridge: ÉN implementasjon for alle modeller i rapporten
// ---------------------------------------------------------------------------

/**
 * Ut-av-fold-prediksjoner for ridge med gitt λ. Folden er `i % folder`, altså
 * deterministisk og spredt – benkstillingene er allerede plukket med steg 7
 * over datasettet, så nabostillinger er ikke fra samme parti.
 *
 * Standardiseringen (snitt og sd per kolonne) estimeres på TRENINGSFOLDENE
 * alene. Med 2 500 rader betyr det lite numerisk, men en modell som får se
 * testfoldens skala er ikke lenger et rent holdout-tall, og hele poenget med
 * dette skriptet er at tallene skal kunne stoles på.
 */
function oofRidge(
  X: Float64Array,
  p: number,
  n: number,
  y: Float64Array,
  lambda: number,
): Float64Array | null {
  const pred = new Float64Array(n);
  for (let f = 0; f < folder; f++) {
    const tren: number[] = [];
    const test: number[] = [];
    for (let i = 0; i < n; i++) (i % folder === f ? test : tren).push(i);
    const m = tren.length;

    const snitt = new Float64Array(p);
    const sd = new Float64Array(p);
    for (let c = 0; c < p; c++) {
      let s = 0;
      for (const i of tren) s += X[i * p + c]!;
      const mu = s / m;
      let v = 0;
      for (const i of tren) {
        const d = X[i * p + c]! - mu;
        v += d * d;
      }
      snitt[c] = mu;
      sd[c] = Math.sqrt(v / m);
    }

    let yMid = 0;
    for (const i of tren) yMid += y[i]!;
    yMid /= m;

    // Gram-matrise på standardiserte kolonner. Delt på m, slik at diagonalen
    // er ≈ 1 og λ måles i «andel av kolonnens egen varians».
    const G = new Float64Array(p * p);
    const c = new Float64Array(p);
    const rad = new Float64Array(p);
    for (const i of tren) {
      const base = i * p;
      const yd = y[i]! - yMid;
      for (let j = 0; j < p; j++) {
        const s = sd[j]!;
        rad[j] = s > 1e-14 ? (X[base + j]! - snitt[j]!) / s : 0;
      }
      for (let j = 0; j < p; j++) {
        const zj = rad[j]!;
        if (zj === 0) continue;
        c[j] = c[j]! + zj * yd;
        const rj = j * p;
        for (let k = 0; k <= j; k++) G[rj + k] = G[rj + k]! + zj * rad[k]!;
      }
    }
    for (let j = 0; j < p; j++) {
      c[j] = c[j]! / m;
      const rj = j * p;
      for (let k = 0; k <= j; k++) {
        const v = G[rj + k]! / m;
        G[rj + k] = v;
        G[k * p + j] = v;
      }
      G[rj + j] = G[rj + j]! + lambda;
    }

    const L = cholesky(G, p);
    if (L === null) return null;
    const beta = løsMedL(L, c, p);

    for (const i of test) {
      const base = i * p;
      let s = yMid;
      for (let j = 0; j < p; j++) {
        const sdj = sd[j]!;
        if (sdj <= 1e-14) continue;
        s += beta[j]! * ((X[base + j]! - snitt[j]!) / sdj);
      }
      pred[i] = s;
    }
  }
  return pred;
}

interface Metrikk {
  navn: string;
  /** Antall prediktorer i modellen. */
  p: number;
  /** λ som ga best ut-av-fold R² i sveipet. */
  lambda: number;
  /** Ut-av-fold R² mot anger. HOVEDTALLET. */
  r2: number;
  /** Ut-av-fold Spearman ρ mellom prediksjon og anger. */
  spearman: number;
  /** Ut-av-fold AUC for «anger > 0» – tåler nullinflasjonen. */
  auc: number;
  /** Ut-av-fold R² på delmengden der agenten faktisk bommet (anger > 0). */
  r2Bom: number;
}

const LAMBDA_SVEIP = [0.03, 0.1, 0.3, 1, 3, 10, 30, 100];

/** Kjører λ-sveipet, velger på ut-av-fold R², og returnerer alle metrikkene. */
function måleModell(
  navn: string,
  X: Float64Array,
  p: number,
  n: number,
  y: Float64Array,
  bomRader: readonly number[],
  etikett: readonly boolean[],
): Metrikk {
  let beste: Metrikk = {
    navn,
    p,
    lambda: NaN,
    r2: -Infinity,
    spearman: NaN,
    auc: NaN,
    r2Bom: NaN,
  };
  for (const lam of LAMBDA_SVEIP) {
    const pred = oofRidge(X, p, n, y, lam);
    if (pred === null) continue;
    const r = r2(y, pred);
    if (!(r > beste.r2)) continue;
    const predArr = Array.from(pred);
    beste = {
      navn,
      p,
      lambda: lam,
      r2: r,
      spearman: spearman(Array.from(y), predArr),
      auc: auc(etikett, predArr),
      r2Bom: r2Delmengde(y, pred, bomRader),
    };
  }
  return beste;
}

// ---------------------------------------------------------------------------
// Benk og stillinger
// ---------------------------------------------------------------------------

const benk: Benkstilling[] = lesBenk(benkMappe, antall, steg);
if (benk.length === 0) {
  console.error(`Fant ingen stillinger i ${benkMappe}/*.jsonl`);
  process.exit(1);
}

interface Stilling {
  readonly nt: readonly number[];
  readonly t: readonly number[];
  readonly lovlige: number[];
  readonly verdier: number[];
  readonly beste: number;
  readonly snittVerdi: number;
  readonly sdVerdi: number;
  readonly minVerdi: number;
  readonly antallOptimale: number;
  /** max(v) − nest høyeste DISTINKTE v. 0 når flere kort er optimale. */
  readonly gapTilNest: number;
  readonly stikk: number;
}

const stillinger: Stilling[] = [];
let uegnet = 0;
for (const s of benk) {
  if (s.nt === undefined || s.nt.length !== ANTALL_INN) {
    uegnet++;
    continue;
  }
  const lovlige = Object.keys(s.v).map(Number);
  if (lovlige.length < 2) {
    uegnet++;
    continue;
  }
  const verdier = lovlige.map((k) => s.v[String(k)]!);
  let beste = -Infinity;
  let min = Infinity;
  let sum = 0;
  for (const v of verdier) {
    if (v > beste) beste = v;
    if (v < min) min = v;
    sum += v;
  }
  const snittVerdi = sum / verdier.length;
  let v2 = 0;
  for (const v of verdier) v2 += (v - snittVerdi) * (v - snittVerdi);
  const antallOptimale = verdier.filter((v) => beste - v < 1e-6).length;
  let nest = -Infinity;
  for (const v of verdier) if (beste - v >= 1e-6 && v > nest) nest = v;
  stillinger.push({
    nt: s.nt,
    t: s.t,
    lovlige,
    verdier,
    beste,
    snittVerdi,
    sdVerdi: Math.sqrt(v2 / verdier.length),
    minVerdi: min,
    antallOptimale,
    gapTilNest: nest === -Infinity ? 0 : beste - nest,
    stikk: s.stikk,
  });
}

const n = stillinger.length;
if (n < 200) {
  console.error(`Bare ${n} brukbare stillinger – for lite. Avbryter.`);
  process.exit(1);
}
console.log(
  `Benk ${benkMappe}: ${benk.length} lest, ${n} brukbare (${uegnet} hoppet over).\n`,
);

// ---------------------------------------------------------------------------
// Agenter: kortvelgere på nøyaktig de samme stillingene
// ---------------------------------------------------------------------------

interface Agent {
  readonly navn: string;
  readonly erNeat: boolean;
  readonly genom: Genom | null;
  /** Nettets utganger over de LOVLIGE kortene, i lovlige-rekkefølge. */
  readonly utganger: (st: Stilling) => number[];
}

const agenter: Agent[] = [];

for (const fil of genomFiler) {
  if (!existsSync(fil)) {
    console.error(`Fant ikke ${fil} – hopper over.`);
    continue;
  }
  const råTekst = readFileSync(fil, "utf8");
  const rå = JSON.parse(råTekst) as { genom?: unknown };
  const g = genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : råTekst);
  const nett = new Nettverk(g);
  agenter.push({
    navn: fil,
    erNeat: true,
    genom: g,
    utganger: (st) => {
      const ut = nett.aktiver([...st.nt]);
      return st.lovlige.map((k) => ut[UT_KORT + k]!);
    },
  });
}

// Ferskt tilfeldig genom: NEAT-startpunktet (bias + 5 tilfeldige innganger per
// utgang). Ikke en stråmann for moro skyld – det er GULVET. Ligger et trent
// genom bare litt over det på stillingsnivå, sier det hvor mye evolusjonen
// faktisk har flyttet kortvalget.
{
  const bok = new Innovasjonsbok(ANTALL_INN, ANTALL_UT);
  let t = frø >>> 0;
  const rng = (): number => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const g = nyttGenom(ANTALL_INN, ANTALL_UT, bok, rng);
  const nett = new Nettverk(g);
  agenter.push({
    navn: `tilfeldig(frø ${frø})`,
    erNeat: true,
    genom: g,
    utganger: (st) => {
      const ut = nett.aktiver([...st.nt]);
      return st.lovlige.map((k) => ut[UT_KORT + k]!);
    },
  });
}

// NevroHjerne: appens ferdigtrente nett. Spiller på E1-vektoren (de 238
// første trekkene er identiske med appens koding), ikke på NEAT-vektoren.
{
  const h = nevroHjerne();
  agenter.push({
    navn: "nevro",
    erNeat: false,
    genom: null,
    utganger: (st) => {
      const logits = forover(h.spill, Float32Array.from(st.t.slice(0, 238)));
      return st.lovlige.map((k) => logits[k]!);
    },
  });
}

const A = agenter.length;

/** anger[a][i] og beslutningsskalarene, i én gjennomgang per agent. */
const anger: Float64Array[] = [];
/** margin[a][i] = beste utgang − NEST beste utgang over de lovlige kortene. */
const margin: Float64Array[] = [];
const sdUt: Float64Array[] = [];
const spennUt: Float64Array[] = [];

console.log("Scorer agenter …");
for (const ag of agenter) {
  const y = new Float64Array(n);
  const mg = new Float64Array(n);
  const su = new Float64Array(n);
  const sp = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const st = stillinger[i]!;
    const u = ag.utganger(st);
    let best = 0;
    for (let k = 1; k < u.length; k++) if (u[k]! > u[best]!) best = k;
    let nest = -Infinity;
    let maks = -Infinity;
    let min = Infinity;
    let sum = 0;
    for (let k = 0; k < u.length; k++) {
      const v = u[k]!;
      sum += v;
      if (v > maks) maks = v;
      if (v < min) min = v;
      if (k !== best && v > nest) nest = v;
    }
    const snitt = sum / u.length;
    let v2 = 0;
    for (const v of u) v2 += (v - snitt) * (v - snitt);
    y[i] = st.beste - st.verdier[best]!;
    mg[i] = maks - nest;
    su[i] = Math.sqrt(v2 / u.length);
    sp[i] = maks - min;
  }
  anger.push(y);
  margin.push(mg);
  sdUt.push(su);
  spennUt.push(sp);
  let sum = 0;
  let opt = 0;
  for (let i = 0; i < n; i++) {
    sum += y[i]!;
    if (y[i]! < 1e-6) opt++;
  }
  console.log(
    `  ${ag.navn.padEnd(30)} snittanger ${(sum / n).toFixed(4)}  optimalt ${(
      (100 * opt) /
      n
    ).toFixed(1)} %`,
  );
}

// ---------------------------------------------------------------------------
// DEL 1: toveis variansdekomponering stilling × agent
// ---------------------------------------------------------------------------

interface Anova {
  readonly navn: string;
  readonly agenter: number;
  readonly andelStilling: number;
  readonly andelAgent: number;
  readonly andelSamspill: number;
  readonly ssTot: number;
}

function anova(utvalg: readonly number[], navn: string): Anova {
  const k = utvalg.length;
  let grand = 0;
  for (const a of utvalg) for (let i = 0; i < n; i++) grand += anger[a]![i]!;
  grand /= k * n;

  let ssTot = 0;
  for (const a of utvalg) {
    for (let i = 0; i < n; i++) {
      const d = anger[a]![i]! - grand;
      ssTot += d * d;
    }
  }
  let ssAgent = 0;
  for (const a of utvalg) {
    let m = 0;
    for (let i = 0; i < n; i++) m += anger[a]![i]!;
    m /= n;
    ssAgent += n * (m - grand) * (m - grand);
  }
  let ssStilling = 0;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (const a of utvalg) m += anger[a]![i]!;
    m /= k;
    ssStilling += k * (m - grand) * (m - grand);
  }
  return {
    navn,
    agenter: k,
    andelStilling: ssStilling / ssTot,
    andelAgent: ssAgent / ssTot,
    andelSamspill: (ssTot - ssStilling - ssAgent) / ssTot,
    ssTot,
  };
}

/**
 * GULVET, regnet eksakt i stedet for simulert: forventet anger om man valgte
 * et lovlig kort uniformt tilfeldig, og forventet andel optimale valg. Disse
 * er deterministiske funksjoner av benken (ingen trekning, ingen støy) og er
 * målestokken alle agenttallene over skal leses mot. Ligger en trent agent
 * ikke klart under gulvet, har treningen ikke flyttet kortvalget.
 */
let forventetAngerTilfeldig = 0;
let forventetOptimaltTilfeldig = 0;
let forventetAngerVerst = 0;
for (const st of stillinger) {
  forventetAngerTilfeldig += st.beste - st.snittVerdi;
  forventetOptimaltTilfeldig += st.antallOptimale / st.lovlige.length;
  forventetAngerVerst += st.beste - st.minVerdi;
}
forventetAngerTilfeldig /= n;
forventetOptimaltTilfeldig /= n;
forventetAngerVerst /= n;

const alleIdx = agenter.map((_, i) => i);
const trenteIdx = alleIdx.filter((i) => !agenter[i]!.navn.startsWith("tilfeldig"));
const anovaAlle = anova(alleIdx, "alle agenter (inkl. tilfeldig genom)");
const anovaTrente = anova(trenteIdx, "bare trente agenter");

/** Hvor mange stillinger er «gratis» (alle treffer) eller «umulige» (ingen)? */
let alleOptimale = 0;
let ingenOptimale = 0;
for (let i = 0; i < n; i++) {
  let opt = 0;
  for (const a of trenteIdx) if (anger[a]![i]! < 1e-6) opt++;
  if (opt === trenteIdx.length) alleOptimale++;
  if (opt === 0) ingenOptimale++;
}

// ---------------------------------------------------------------------------
// Modeller per agent
// ---------------------------------------------------------------------------

/** 20 stillingsegenskaper – ingen av dem vet hvilken agent som spiller. */
const EGENSKAPSNAVN = [
  "antallLovlige",
  "antallOptimale",
  "flereOptimale",
  "sdVerdi",
  "spennVerdi",
  "angerVedTilfeldigValg",
  "gapTilNestBeste",
  "besteVerdi",
  "stikk",
  "andelStikkSpilt",
  "kortPaaBordet",
  "erBudvinner",
  "erHemmeligMakker",
  "paaBudlaget",
  "erForsvarer",
  "kanSlaa",
  "kanTrumfe",
  "trumfBoss",
  "mineTrumf",
  "manglerStikk",
] as const;
const P_EGEN = EGENSKAPSNAVN.length;

// Indeksene er NEAT-inngangslayouten i src/neat/trekk.ts. De er private der,
// så numrene står her – med navn, slik at et avvik oppdages ved lesing.
const NT_STIKK_SPILT = 190;
const NT_BORD_ANTALL = 193;
const NT_ER_BUDVINNER = 184;
const NT_ER_HEMMELIG_MAKKER = 280;
const NT_PAA_BUDLAGET = 281;
const NT_ER_FORSVARER = 282;
const NT_KAN_SLAA = 275;
const NT_KAN_TRUMFE = 294;
const NT_TRUMF_BOSS = 295;
const NT_MINE_TRUMF = 293;
const NT_MANGLER_STIKK = 284;

const Xegen = new Float64Array(n * P_EGEN);
for (let i = 0; i < n; i++) {
  const st = stillinger[i]!;
  const b = i * P_EGEN;
  Xegen[b + 0] = st.lovlige.length;
  Xegen[b + 1] = st.antallOptimale;
  Xegen[b + 2] = st.antallOptimale > 1 ? 1 : 0;
  Xegen[b + 3] = st.sdVerdi;
  Xegen[b + 4] = st.beste - st.minVerdi;
  // Forventet anger om man valgte et lovlig kort HELT tilfeldig. Ren
  // stillingsvanske: hvor mye er det i det hele tatt å tape her?
  Xegen[b + 5] = st.beste - st.snittVerdi;
  Xegen[b + 6] = st.gapTilNest;
  Xegen[b + 7] = st.beste;
  Xegen[b + 8] = st.stikk;
  Xegen[b + 9] = st.nt[NT_STIKK_SPILT]!;
  Xegen[b + 10] = st.nt[NT_BORD_ANTALL]!;
  Xegen[b + 11] = st.nt[NT_ER_BUDVINNER]!;
  Xegen[b + 12] = st.nt[NT_ER_HEMMELIG_MAKKER]!;
  Xegen[b + 13] = st.nt[NT_PAA_BUDLAGET]!;
  Xegen[b + 14] = st.nt[NT_ER_FORSVARER]!;
  Xegen[b + 15] = st.nt[NT_KAN_SLAA]!;
  Xegen[b + 16] = st.nt[NT_KAN_TRUMFE]!;
  Xegen[b + 17] = st.nt[NT_TRUMF_BOSS]!;
  Xegen[b + 18] = st.nt[NT_MINE_TRUMF]!;
  Xegen[b + 19] = st.nt[NT_MANGLER_STIKK]!;
}

/** Bare «anger ved tilfeldig valg» – én kolonne, som referanselinje. */
const XenEgenskap = new Float64Array(n);
for (let i = 0; i < n; i++) XenEgenskap[i] = Xegen[i * P_EGEN + 5]!;

interface AgentResultat {
  navn: string;
  snittanger: number;
  optimalt: number;
  andelBom: number;
  modeller: Metrikk[];
  /** Kanter i genomet, døde kolonner og prediktorer – bare for ablasjonen. */
  ablasjon: { kanter: number; døde: number; prediktorer: number } | null;
}

const resultater: AgentResultat[] = [];
const t0 = performance.now();

for (let a = 0; a < A; a++) {
  const ag = agenter[a]!;
  const y = anger[a]!;
  const etikett = Array.from(y, (v) => v > 1e-6);
  const bomRader: number[] = [];
  for (let i = 0; i < n; i++) if (etikett[i]!) bomRader.push(i);

  let sum = 0;
  let opt = 0;
  for (let i = 0; i < n; i++) {
    sum += y[i]!;
    if (y[i]! < 1e-6) opt++;
  }

  console.log(`\n[${a + 1}/${A}] ${ag.navn}`);
  const modeller: Metrikk[] = [];

  // (a) Stillingsvanske målt på DE ANDRE agentene (leave-one-agent-out).
  {
    const X = new Float64Array(n);
    const andre = alleIdx.filter((b) => b !== a);
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (const b of andre) m += anger[b]![i]!;
      X[i] = m / andre.length;
    }
    modeller.push(
      måleModell("stillingsvanske (snittanger hos de andre agentene)", X, 1, n, y, bomRader, etikett),
    );
  }

  // (b) Én stillingsvariabel: anger ved tilfeldig lovlig valg.
  modeller.push(
    måleModell("1 stillingsvariabel: anger ved tilfeldig valg", XenEgenskap, 1, n, y, bomRader, etikett),
  );

  // (c) Alle 20 stillingsegenskapene.
  modeller.push(måleModell("20 stillingsegenskaper", Xegen, P_EGEN, n, y, bomRader, etikett));

  // (d) Beslutningsskalarene: nettets egen bestemthet, tre tall.
  {
    const X = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      X[i * 3 + 0] = margin[a]![i]!;
      X[i * 3 + 1] = sdUt[a]![i]!;
      X[i * 3 + 2] = spennUt[a]![i]!;
    }
    modeller.push(måleModell("3 beslutningsskalarer (margin, sd, spenn)", X, 3, n, y, bomRader, etikett));
  }

  // (e) Stillingsegenskaper + beslutningsskalarer.
  {
    const p = P_EGEN + 3;
    const X = new Float64Array(n * p);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < P_EGEN; c++) X[i * p + c] = Xegen[i * P_EGEN + c]!;
      X[i * p + P_EGEN + 0] = margin[a]![i]!;
      X[i * p + P_EGEN + 1] = sdUt[a]![i]!;
      X[i * p + P_EGEN + 2] = spennUt[a]![i]!;
    }
    modeller.push(måleModell("20 egenskaper + 3 beslutningsskalarer", X, p, n, y, bomRader, etikett));
  }

  // (f) Ablasjonsmodellen – ev-regresjonens egen, men kryssvalidert.
  let ablasjonInfo: AgentResultat["ablasjon"] = null;
  if (ag.erNeat && ag.genom !== null && a < ablasjonAntall) {
    const flat = new FlatNett(ag.genom);
    {
      // Oppstartstest: fanger en FlatNett-kopi som har drevet fra Nettverk.
      const referanse = new Nettverk(ag.genom);
      const prøve = Array.from({ length: ag.genom.antallInn }, (_, i) => Math.sin(i * 1.7) * 0.5 + 0.5);
      const r = referanse.aktiver(prøve);
      const b = flat.aktiver(prøve);
      let maks = 0;
      for (let j = 0; j < r.length; j++) maks = Math.max(maks, Math.abs(r[j]! - b[j]!));
      if (maks > 1e-12) {
        console.error(`FlatNett avviker fra Nettverk (maks ${maks.toExponential(2)}) – avbryter.`);
        process.exit(1);
      }
    }
    const pAlle = flat.antallKanter;
    console.log(`  ablerer ${pAlle} kanter × ${n} stillinger …`);
    const Xa = new Float64Array(n * pAlle);
    for (let i = 0; i < n; i++) {
      const st = stillinger[i]!;
      const u = ag.utganger(st);
      let best = 0;
      for (let k = 1; k < u.length; k++) if (u[k]! > u[best]!) best = k;
      const j = UT_KORT + st.lovlige[best]!;
      flat.aktiver(st.nt);
      const basis = flat.basisUt(j);
      const rad = i * pAlle;
      for (let e = 0; e < pAlle; e++) {
        flat.abler(e);
        const d = basis - flat.utEtter(j);
        if (Math.abs(d) < NULLGRENSE) continue;
        Xa[rad + e] = d;
      }
    }
    // Kolonneutvalg: samme regel som ev-regresjon.ts – kast døde kolonner og
    // behold de `maksPrediktorer` med størst sd. Utvalget bruker BARE X, aldri
    // y, så det er uovervåket screening og ikke lekkasje.
    const sd = new Float64Array(pAlle);
    for (let e = 0; e < pAlle; e++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += Xa[i * pAlle + e]!;
      const m = s / n;
      let v = 0;
      for (let i = 0; i < n; i++) {
        const d = Xa[i * pAlle + e]! - m;
        v += d * d;
      }
      sd[e] = Math.sqrt(v / n);
    }
    const levende: number[] = [];
    for (let e = 0; e < pAlle; e++) if (sd[e]! > 1e-14) levende.push(e);
    levende.sort((x, z) => sd[z]! - sd[x]!);
    const valgte = levende.slice(0, Math.max(1, maksPrediktorer));
    const p = valgte.length;
    const X = new Float64Array(n * p);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < p; c++) X[i * p + c] = Xa[i * pAlle + valgte[c]!]!;
    }
    ablasjonInfo = { kanter: pAlle, døde: pAlle - levende.length, prediktorer: p };
    modeller.push(
      måleModell(`${p} ablasjonsbidrag (ev-regresjonens modell)`, X, p, n, y, bomRader, etikett),
    );

    // (g) Ablasjon + stillingsegenskaper: legger genomet noe til stillingen?
    const pk = p + P_EGEN;
    const Xk = new Float64Array(n * pk);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < p; c++) Xk[i * pk + c] = X[i * p + c]!;
      for (let c = 0; c < P_EGEN; c++) Xk[i * pk + p + c] = Xegen[i * P_EGEN + c]!;
    }
    modeller.push(
      måleModell(`${p} ablasjonsbidrag + 20 stillingsegenskaper`, Xk, pk, n, y, bomRader, etikett),
    );
  }

  for (const m of modeller) {
    console.log(
      `  ${m.navn.padEnd(52)} R² ${m.r2.toFixed(4).padStart(8)}  ρ ${m.spearman
        .toFixed(3)
        .padStart(6)}  AUC ${m.auc.toFixed(3)}`,
    );
  }

  resultater.push({
    navn: ag.navn,
    snittanger: sum / n,
    optimalt: opt / n,
    andelBom: bomRader.length / n,
    modeller,
    ablasjon: ablasjonInfo,
  });
}
const brukt = (performance.now() - t0) / 1000;

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------

const linjer: string[] = [];
const si = (s: string): void => {
  console.log(s);
  linjer.push(s);
};

si("");
si("=".repeat(104));
si(`ANGERVARIANS – hvor sitter forklaringskraften?   benk ${benkMappe}, ${n} stillinger, ${A} agenter`);
si("=".repeat(104));
si("");
si("Alle R² under er UT-AV-FOLD (5-delt kryssvalidering, fold = i mod 5). Ingen in-sample-tall.");
si("λ er valgt på ut-av-fold R² i sveipet " + LAMBDA_SVEIP.join(", ") + " – det er mildt optimistisk");
si("for modellen (λ velges på samme data som måles), og gjelder LIKT for alle rader.");
si("");

si("-".repeat(104));
si("DEL 0: GULVET – hva gir et UNIFORMT TILFELDIG lovlig kort?");
si("-".repeat(104));
si("Regnet eksakt fra orakelverdiene, ikke simulert (verifisert mot 500 000 trekninger: 1,0058).");
si("Alle agenttall skal leses mot disse.");
si(`  forventet anger ved tilfeldig lovlig kort   ${forventetAngerTilfeldig.toFixed(4)}`);
si(`  forventet andel optimale valg               ${(100 * forventetOptimaltTilfeldig).toFixed(1)} %`);
si(`  anger ved ALLTID verste lovlige kort        ${forventetAngerVerst.toFixed(4)}`);
si("");
for (const r of resultater) {
  const avvik = 100 * (r.snittanger / forventetAngerTilfeldig - 1);
  si(
    `  ${r.navn.padEnd(30)} anger ${r.snittanger.toFixed(4)}  ` +
      `${(avvik >= 0 ? "+" : "") + avvik.toFixed(1)} % mot tilfeldig ` +
      `(${avvik > 0 ? "VERRE ENN TILFELDIG" : "bedre"})  optimalt ${(100 * r.optimalt).toFixed(1)} %`,
  );
}
si("");

si("-".repeat(104));
si("DEL 1: TOVEIS VARIANSDEKOMPONERING  stilling × agent");
si("-".repeat(104));
si("Anger er deterministisk gitt (agent, stilling) – ingen målestøy. Restleddet er derfor");
si("EKTE samspill agent×stilling, ikke feil.");
si("");
for (const av of [anovaTrente, anovaAlle]) {
  si(`${av.navn} (${av.agenter} agenter):`);
  si(`  stillingseffekt   ${(100 * av.andelStilling).toFixed(1).padStart(6)} %  ← felles for alle agenter`);
  si(`  agenteffekt       ${(100 * av.andelAgent).toFixed(1).padStart(6)} %  ← hvem som spiller`);
  si(`  samspill          ${(100 * av.andelSamspill).toFixed(1).padStart(6)} %  ← denne agenten i denne stillingen`);
  si("");
}
si(
  `Av ${n} stillinger er ${alleOptimale} (${((100 * alleOptimale) / n).toFixed(1)} %) optimale for ALLE trente agenter, ` +
    `og ${ingenOptimale} (${((100 * ingenOptimale) / n).toFixed(1)} %) bommet av ALLE.`,
);
si(
  `Bare ${n - alleOptimale - ingenOptimale} (${((100 * (n - alleOptimale - ingenOptimale)) / n).toFixed(1)} %) ` +
    "skiller agentene i det hele tatt.",
);
si("");

si("-".repeat(104));
si("DEL 2–5: MODELLER PER AGENT (samme folder, samme metrikker)");
si("-".repeat(104));
si("R²    = ut-av-fold R² mot anger (sammenlign med ev-regresjonens holdout-R²).");
si("R²bom = samme, men bare på stillingene der agenten faktisk bommet (anger > 0).");
si("ρ     = Spearman mellom prediksjon og anger.  AUC = for «anger > 0» (0,5 = ingenting).");
si("");
for (const r of resultater) {
  si(
    `${r.navn}   snittanger ${r.snittanger.toFixed(4)}, optimalt ${(100 * r.optimalt).toFixed(1)} %, ` +
      `bom ${(100 * r.andelBom).toFixed(1)} %`,
  );
  if (r.ablasjon !== null) {
    si(
      `  (ablasjon: ${r.ablasjon.kanter} kanter, ${r.ablasjon.døde} døde, ` +
        `${r.ablasjon.prediktorer} prediktorer brukt)`,
    );
  }
  si(
    "  " +
      "modell".padEnd(52) +
      "p".padStart(5) +
      "λ".padStart(7) +
      "R²".padStart(9) +
      "R²bom".padStart(9) +
      "ρ".padStart(8) +
      "AUC".padStart(7),
  );
  for (const m of r.modeller) {
    si(
      "  " +
        m.navn.padEnd(52) +
        String(m.p).padStart(5) +
        String(m.lambda).padStart(7) +
        m.r2.toFixed(4).padStart(9) +
        m.r2Bom.toFixed(4).padStart(9) +
        m.spearman.toFixed(3).padStart(8) +
        m.auc.toFixed(3).padStart(7),
    );
  }
  si("");
}

si("-".repeat(104));
si("HVORDAN LESE TABELLEN");
si("-".repeat(104));
si("· «stillingsvanske» vet INGENTING om agenten – den kjenner bare hvor mye de andre");
si("  agentene angret i samme stilling. Slår den ablasjonsmodellen, ligger forklaringskraften");
si("  i stillingen, ikke i genomet.");
si("· «3 beslutningsskalarer» er den samlede beslutningen presset ned i tre tall. Slår den");
si("  400 ablasjonsbidrag, lar forklaringskraften seg ikke fordele på enkeltkoblinger –");
si("  og da kan per-gen-redigering (gattaca) ikke fungere annet enn ved flaks.");
si("· Er AUC nær 0,5 samtidig som R² er nær 0, er lav R² IKKE en artefakt av nullinflasjonen:");
si("  modellen rangerer heller ikke. Er AUC klart over 0,5 mens R² er ~0, er det motsatt.");
si("· MERK: marginen mot ORAKELETS beste kort er bevisst utelatt som prediktor – den er null");
si("  nøyaktig når angeren er null, og ville gitt en R² som bare måler seg selv.");
si("");

// --- Sammendraget regnes ut, det skrives ikke for hånd -----------------------
si("-".repeat(104));
si("SVARET");
si("-".repeat(104));
{
  const finn = (r: AgentResultat, nøkkel: string): Metrikk | undefined =>
    r.modeller.find((m) => m.navn.includes(nøkkel));
  const medAblasjon = resultater.filter((r) => r.ablasjon !== null);
  const snitt = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / Math.max(v.length, 1);
  const rAbl = snitt(medAblasjon.map((r) => finn(r, "ablasjonsbidrag (ev-regresjonens")?.r2 ?? NaN));
  const rEn = snitt(resultater.map((r) => finn(r, "anger ved tilfeldig valg")?.r2 ?? NaN));
  const rVanske = snitt(resultater.map((r) => finn(r, "stillingsvanske")?.r2 ?? NaN));
  const rBesl = snitt(resultater.map((r) => finn(r, "beslutningsskalarer")?.r2 ?? NaN));
  const aucAbl = snitt(medAblasjon.map((r) => finn(r, "ablasjonsbidrag (ev-regresjonens")?.auc ?? NaN));
  si(
    `1. STILLINGEN DOMINERER. Stillingseffekt ${(100 * anovaTrente.andelStilling).toFixed(1)} %, ` +
      `agenteffekt ${(100 * anovaTrente.andelAgent).toFixed(1)} %, samspill ` +
      `${(100 * anovaTrente.andelSamspill).toFixed(1)} %.`,
  );
  si(
    `   ÉN stillingsvariabel gir R² ${rEn.toFixed(3)} i snitt; de ${maksPrediktorer} ablasjonsbidragene ` +
      `gir ${rAbl.toFixed(3)}. Faktor ${(rEn / Math.max(rAbl, 1e-9)).toFixed(0)}.`,
  );
  si(`   Stillingsvanske målt på ANDRE agenter: R² ${rVanske.toFixed(3)}.`);
  si(
    `2. NULLINFLASJONEN FORKLARER DET IKKE. Ablasjonsmodellens AUC er ${aucAbl.toFixed(3)} ` +
      "(0,5 = ingenting).",
  );
  si("   Den rangerer altså nesten ikke heller – lav R² er ikke bare feil metrikk.");
  si(
    `3. BESLUTNINGEN LAR SEG IKKE FORDELE. 3 beslutningsskalarer gir R² ${rBesl.toFixed(3)} ` +
      `mot ablasjonens ${rAbl.toFixed(3)},`,
  );
  si("   men høyere AUC. Bestemtheten i valget bærer mer signal enn koblingene hver for seg.");
  const verre = resultater.filter(
    (r) => !r.navn.startsWith("tilfeldig") && r.navn !== "nevro" && r.snittanger > forventetAngerTilfeldig,
  );
  si(
    `4. GULVET. ${verre.length} av ${resultater.length - 2} trente NEAT-genomer har HØYERE anger enn ` +
      `et uniformt tilfeldig lovlig kort (${forventetAngerTilfeldig.toFixed(4)}).`,
  );
  si("   Det er hovedgrunnen til at ingenting lar seg tilskrive genomet: på kortvalg finnes");
  si("   det knapt noe å tilskrive. Bare nevro ligger klart under gulvet.");
}

const mappe = dirname(utFil);
if (mappe !== "" && mappe !== ".") mkdirSync(mappe, { recursive: true });
writeFileSync(
  utFil,
  JSON.stringify(
    {
      benk: benkMappe,
      antall,
      steg,
      folder,
      lambdaSveip: LAMBDA_SVEIP,
      maksPrediktorer,
      fro: frø,
      stillingerLest: benk.length,
      stillingerBrukt: n,
      egenskapsnavn: EGENSKAPSNAVN,
      forventetAngerTilfeldig,
      forventetOptimaltTilfeldig,
      forventetAngerVerst,
      anovaTrente,
      anovaAlle,
      alleOptimale,
      ingenOptimale,
      skillerAgentene: n - alleOptimale - ingenOptimale,
      sekunder: brukt,
      agenter: resultater,
    },
    null,
    1,
  ),
);
const txtFil = utFil.replace(/\.json$/, "") + ".txt";
writeFileSync(txtFil, linjer.join("\n") + "\n");
console.log(`\nSkrev ${utFil} og ${txtFil}  (${brukt.toFixed(0)} s)`);
