/**
 * AUGMENTERING PÅ FARGESYMMETRIEN — utvid et ferdig MLBT-korpus uten å spille om.
 *
 *   node examples/agX-augmenter.ts --inn mlb-tro-data/trening-0.bin \
 *     --ut mlb-tro-data/aug-trening-0.bin --ganger 1 --froe 90012
 *
 * Spillet er invariant under enhver ombytting av fargene som lar TRUMF stå
 * (`src/mlb/fargebytte.ts`). Hver rad i korpuset har derfor fem tvillinger som er
 * like ekte som raden selv — samme stilling, andre fargenavn — og ETIKETTEN følger
 * med, fordi et fargebytte ikke flytter et eneste kort mellom hender.
 *
 * ===================== HVORFOR KOLONNEBYTTE, IKKE OMSPILL ===============
 *
 * Å spille kampene om igjen med byttede farger ville kostet det samme som å lage
 * korpuset på nytt. Å bytte KOLONNENE i en ferdig trekkvektor koster en
 * minnekopi. `test/agX-fargesymmetri.test.ts` krever at de to veiene gir
 * BIT-IDENTISKE vektorer, så det er ingen forskjell på dem annet enn prisen.
 *
 * ===================== ETTERLYST LIGGER ALLTID I TRUMF ==================
 *
 * `src/motor.ts` krever `etterlyst.farge === trumf` (linje 497). Det etterlyste
 * kortets farge er derfor ALDRI et eget anker: gruppen er 3! = 6 i enhver stilling
 * som kan oppstå, ikke 2. Vi ankrer likevel gjennom `lovligeBytter`, som tar begge
 * — en regel som stemmer med spillet er bedre enn en som stemmer med i dag.
 *
 * ===================== K2: BARE OFFENTLIG INFORMASJON ===================
 *
 * Verktøyet leser TRUMF-one-hoten (156–159) ut av radens egen trekkvektor, og
 * ingenting annet. Trumf er offentlig fra VELG. Det leser ALDRI etiketten for å
 * velge byttet — etiketten permuteres, den bestemmer ikke. Gjorde den det, ville
 * fasiten styrt inngangen, og hvert K8-tall etterpå vært verdiløst.
 *
 * `--ganger 0` skriver fila om igjen uten en eneste tvilling: da skal utfila være
 * BYTE-IDENTISK med innfila. Det er selvprøven på at lese- og skrivesiden er enige
 * om formatet, og `test/agX-augmenter.test.ts` krever den sha1-likheten.
 */

import { closeSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import { dirname } from "node:path";

import { FARGER, lagRng, type Farge } from "../src/kort.ts";
import { MLB_TRO_BREDDER } from "../src/mlb/trotrekk.ts";
import {
  erIdentitet,
  lovligeBytter,
  permuter,
  troInnKilde,
  type Fargebytte,
} from "../src/mlb/fargebytte.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const tall = (s: string, f: number): number => (Number.isFinite(Number(s)) ? Number(s) : f);

const INN = arg("--inn", "mlb-tro-data/trening-0.bin");
const UT = arg("--ut", "mlb-tro-data/aug-trening-0.bin");
/** Tvillinger PER RAD, 0–5. 1 gir dobbelt korpus, 5 gir hele banen (6×). */
const GANGER = tall(arg("--ganger", "1"), 1);
const FRØ = tall(arg("--froe", "90012"), 90012);
if (!(GANGER >= 0 && GANGER <= 5 && Number.isInteger(GANGER))) {
  throw new Error(`--ganger må være et helt tall 0–5, fikk ${GANGER}`);
}

/** NEAT-prefiksets trumf-one-hot. Samme tall som `INNGANG.TRUMF` i src/neat/trekk.ts. */
const TRUMF = 156;

const rå = readFileSync(INN);
if (rå.length < 12 || rå.toString("ascii", 0, 4) !== "MLBT") throw new Error(`${INN}: ikke en MLBT-fil`);
const VERSJON = rå.readInt32LE(4);
const DIM = rå.readInt32LE(8);
if (VERSJON !== 1) {
  // Versjon 2 har 208 f32 posteriormarginaler per rad som MÅ permuteres i takt med
  // etiketten. Det er gjørbart, men uprøvd — og en stille feil der ville vært en
  // myk etikett som peker på feil kort. Vi stopper heller.
  throw new Error(`${INN}: versjon ${VERSJON}; augmentering er bare prøvd for versjon 1`);
}
if (!MLB_TRO_BREDDER.includes(DIM)) throw new Error(`${INN}: ukjent trobredde ${DIM}`);

/** Én post: DIM × f32, 52 × i8 etikett, frø i32, stikk i16, sete i16. */
const POST = DIM * 4 + 52 + 4 + 2 + 2;
const kropp = rå.length - 12;
if (kropp % POST !== 0) throw new Error(`${INN}: ${kropp} byte kropp er ikke et helt antall poster à ${POST}`);
const RADER = kropp / POST;

mkdirSync(dirname(UT), { recursive: true });
const fd = openSync(UT, "w");
{
  const hode = Buffer.alloc(12);
  hode.write("MLBT", 0, "ascii");
  hode.writeInt32LE(VERSJON, 4);
  hode.writeInt32LE(DIM, 8);
  writeSync(fd, hode);
}

/** Kartene er bare seks; de regnes én gang, ikke én gang per rad. */
const kartBuffer = new Map<string, Int32Array>();
const kartFor = (p: Fargebytte): Int32Array => {
  const n = p.join(",");
  let k = kartBuffer.get(n);
  if (k === undefined) {
    k = troInnKilde(DIM, p);
    kartBuffer.set(n, k);
  }
  return k;
};

/** Trumf ut av radens EGEN trekkvektor — offentlig, og det eneste vi trenger for å ankre. */
function trumfFor(x: Float32Array, rad: number): Farge {
  let funnet = -1;
  for (let f = 0; f < 4; f++) {
    if (x[TRUMF + f]! === 1) {
      if (funnet >= 0) throw new Error(`rad ${rad}: to trumffarger i one-hoten (${funnet} og ${f})`);
      funnet = f;
    }
  }
  // Ingen trumf betyr en rad fra før VELG. Korpuset skal bare ha SPILL-rader, så
  // det er en formatfeil, ikke et tilfelle å håndtere pent.
  if (funnet < 0) throw new Error(`rad ${rad}: ingen trumf i one-hoten (156–159) — er dette et SPILL-korpus?`);
  return FARGER[funnet]!;
}

const KLUMP = 512;
const utBuf = Buffer.alloc(POST * KLUMP);
let iKlump = 0;
const tøm = (): void => {
  if (iKlump > 0) writeSync(fd, utBuf, 0, POST * iKlump);
  iKlump = 0;
};

/** Skriv én post: trekkvektor, etikett, og de tre skalarene uendret. */
function skriv(x: Float32Array, f: Int8Array, frø: number, stikk: number, sete: number): void {
  let o = iKlump * POST;
  for (let i = 0; i < DIM; i++) {
    utBuf.writeFloatLE(x[i]!, o);
    o += 4;
  }
  for (let i = 0; i < 52; i++) utBuf.writeInt8(f[i]!, o + i);
  o += 52;
  utBuf.writeInt32LE(frø | 0, o);
  utBuf.writeInt16LE(stikk, o + 4);
  utBuf.writeInt16LE(sete, o + 6);
  if (++iKlump === KLUMP) tøm();
}

const rng = lagRng(FRØ);
/** Fisher–Yates på de fem tvillingene, så utvalget ikke favoriserer én permutasjon. */
function velg(alle: Fargebytte[], n: number): Fargebytte[] {
  const a = [...alle];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, n);
}

let skrevet = 0;
let tvillinger = 0;
const t0 = Date.now();
for (let r = 0; r < RADER; r++) {
  const o = 12 + r * POST;
  const x = new Float32Array(DIM);
  for (let i = 0; i < DIM; i++) x[i] = rå.readFloatLE(o + i * 4);
  const f = new Int8Array(52);
  for (let i = 0; i < 52; i++) f[i] = rå.readInt8(o + DIM * 4 + i);
  const frø = rå.readInt32LE(o + DIM * 4 + 52);
  const stikk = rå.readInt16LE(o + DIM * 4 + 56);
  const sete = rå.readInt16LE(o + DIM * 4 + 58);

  skriv(x, f, frø, stikk, sete);
  skrevet++;
  if (GANGER === 0) continue;

  const bytter = lovligeBytter(trumfFor(x, r), null).filter((p) => !erIdentitet(p));
  for (const p of velg(bytter, GANGER)) {
    const x2 = permuter(x, kartFor(p));
    const f2 = new Int8Array(52);
    // Kortet i indeks `i` ligger etter byttet i `p[farge]·13 + valør`. KLASSEN står:
    // den er et relativt SETE (eller talongen), og et fargebytte flytter ingen kort.
    for (let i = 0; i < 52; i++) f2[p[Math.floor(i / 13)]! * 13 + (i % 13)] = f[i]!;
    skriv(x2, f2, frø, stikk, sete);
    skrevet++;
    tvillinger++;
  }
  if (r % 20_000 === 0) {
    process.stdout.write(`\r  rad ${r}/${RADER}, ${skrevet} skrevet, ${((Date.now() - t0) / 1000).toFixed(0)} s   `);
  }
}
tøm();
closeSync(fd);

console.log(
  `\n${INN}: ${RADER} rader (dim ${DIM}) → ${UT}: ${skrevet} rader ` +
    `(${tvillinger} tvillinger, ${GANGER} per rad) på ${((Date.now() - t0) / 1000).toFixed(0)} s`,
);
