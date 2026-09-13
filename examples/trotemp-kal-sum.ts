/**
 * DOMMEN OVER TROENS KALIBRERING, og temperatursveipet (13. sep).
 *
 *   node examples/trotemp-kal-sum.ts analyse/trokal-w*.jsonl
 *
 * Leser råstoffet fra `trotemp-kalibrering.ts` og svarer på fire ting:
 *
 *   1  ER TROEN OVERKONFIDENT? Kalibreringskurven: predikert sannsynlighet mot faktisk
 *      frekvens, både marginalt (per skjulte kort) og felles (over kandidatverdenene).
 *   2  HVILKEN T RETTER DET? Den som minimerer log-tapet på fasiten — på marginalene og
 *      på den sanne verdenen. De to trenger IKKE være like, og forskjellen er et funn:
 *      log-vekten er en sum av marginaler som behandles som uavhengige, og den
 *      produktantakelsen er en egen kilde til overkonfidens.
 *   3  HVA GJØR T MED SPREDNINGEN? ESS/K over de 32 kandidatene, samme måltall som
 *      `troledd-vektspredning.ts` rapporterte til 0,179.
 *   4  Hvor ofte er den sanne verdenen den høyest vektede — mot hvor ofte troen sier
 *      den skulle vært det. Det er kalibreringsspørsmålet i sin mest direkte form.
 *
 * ALLE TALL PÅ SAMME RADER. Sveipet koster ingenting: log-vektene er lagret, så en ny T
 * er en ny normalisering, ikke en ny måling. Det er også hele grunnen til at proben lagrer
 * `lw` og ikke bare et sammendrag.
 */

import { readFileSync } from "node:fs";

const filer = process.argv.slice(2).filter((a) => a.endsWith(".jsonl"));
if (filer.length === 0) {
  console.error("Bruk: node examples/trotemp-kal-sum.ts <fil.jsonl> [...]");
  process.exit(1);
}

const GRID = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 30, 50];
const KLASSER = 4;

interface Rad {
  rolle: string;
  stikk: number;
  igjen: number;
  nSkjult: number;
  lw: number[];
  lwS: number;
  /** KONTROLLARMEN: samme fordeling med seteklassene rotert ett hakk. Kan mangle i gamle filer. */
  lwR?: number[];
  lwRS?: number;
  nSann: number;
  nDist: number;
  mp: number[];
  mt: number[];
}

const rader: Rad[] = [];
for (const f of filer) {
  for (const linje of readFileSync(f, "utf8").split("\n")) {
    if (linje.trim() !== "") rader.push(JSON.parse(linje) as Rad);
  }
}
if (rader.length === 0) {
  console.error("ingen rader");
  process.exit(1);
}

const snitt = (x: readonly number[]): number => x.reduce((a, b) => a + b, 0) / x.length;
const se = (x: readonly number[]): number => {
  if (x.length < 2) return Number.NaN;
  const m = snitt(x);
  return Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / (x.length - 1) / x.length);
};
const pst = (x: number): string => `${(100 * x).toFixed(1)}%`;

// ===========================================================================
// MARGINALT: temperaturskalering av trohodets kategoriske utgang
// ===========================================================================

/** −log q(sann klasse) etter temperaturskalering, per skjult kort i raden. */
function margTap(r: Rad, T: number): number[] {
  const ut: number[] = [];
  for (let i = 0; i < r.mt.length; i++) {
    const base = i * KLASSER;
    let sum = 0;
    const q: number[] = [];
    for (let c = 0; c < KLASSER; c++) {
      // Gulvet er trohodets eget (1e-4 i `troprior.ts`), så log aldri blir −∞.
      const v = Math.pow(Math.max(1e-4, r.mp[base + c] ?? 0), 1 / T);
      q.push(v);
      sum += v;
    }
    ut.push(-Math.log(Math.max(1e-300, q[r.mt[i]!]! / sum)));
  }
  return ut;
}

/** Rader → ett tap per skjult kort, over hele korpuset. */
const margTapAlle = (T: number): number[] => rader.flatMap((r) => margTap(r, T));

// ===========================================================================
// FELLES: settet søket faktisk velger i — 32 kandidater pluss den sanne verdenen
// ===========================================================================

interface Sett {
  /** Sannsynlighet per oppføring, normalisert. */
  readonly p: number[];
  /** true for oppføringene som ER den sanne verdenen. */
  readonly sann: boolean[];
  /** Samlet sannsynlighet på den sanne verdenen. */
  readonly pSann: number;
  /** Er den høyest vektede oppføringen den sanne? */
  readonly toppSann: boolean;
  /** Troens egen påstand om nettopp det: massen på favoritten. */
  readonly maksP: number;
}

function byggSett(r: Rad, T: number, kontroll = false): Sett {
  const kilde = kontroll ? r.lwR! : r.lw;
  const kildeS = kontroll ? r.lwRS! : r.lwS;
  const lw = kilde.slice();
  const sann: boolean[] = new Array(lw.length).fill(false);
  if (r.nSann > 0) {
    // Alle kopier av den sanne verdenen har per konstruksjon samme log-vekt.
    let igjen = r.nSann;
    for (let i = 0; i < lw.length && igjen > 0; i++) {
      if (lw[i] === kildeS) {
        sann[i] = true;
        igjen--;
      }
    }
  } else {
    lw.push(kildeS);
    sann.push(true);
  }
  const maks = Math.max(...lw.map((x) => x / T));
  const v = lw.map((x) => Math.exp(x / T - maks));
  const sum = v.reduce((a, b) => a + b, 0);
  const p = v.map((x) => x / sum);
  let pSann = 0;
  for (let i = 0; i < p.length; i++) if (sann[i]) pSann += p[i]!;
  let topp = 0;
  for (let i = 1; i < p.length; i++) if (p[i]! > p[topp]!) topp = i;
  return { p, sann, pSann, toppSann: sann[topp]!, maksP: p[topp]! };
}

/** ESS/K på de 32 RÅ kandidatene — uten den sanne verdenen, så tallet er `troledd`s eget. */
function essAndel(r: Rad, T: number): number {
  const maks = Math.max(...r.lw.map((x) => x / T));
  const v = r.lw.map((x) => Math.exp(x / T - maks));
  const sum = v.reduce((a, b) => a + b, 0);
  const p = v.map((x) => x / sum);
  return 1 / p.reduce((a, x) => a + x * x, 0) / p.length;
}

// ===========================================================================
// RAPPORT
// ===========================================================================

console.log(`\n=== TROENS KALIBRERING — ${rader.length} beslutninger fra ${filer.length} filer ===`);
console.log(
  `skjulte kort per beslutning: snitt ${snitt(rader.map((r) => r.nSkjult)).toFixed(1)}; ` +
    `distinkte verdener blant 32: snitt ${snitt(rader.map((r) => r.nDist)).toFixed(1)}; ` +
    `strømmen trakk selv den sanne verdenen i ${pst(rader.filter((r) => r.nSann > 0).length / rader.length)} av beslutningene\n`,
);

// ---------------------------------------------------------------- 1. kurvene
const BINS = [0, 0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.7, 1.0001];
const kurve = (par: readonly (readonly [number, boolean])[]): void => {
  console.log("  predikert p    |        n | predikert snitt | FAKTISK frekvens | avvik");
  console.log("  " + "-".repeat(78));
  for (let b = 0; b < BINS.length - 1; b++) {
    const i = par.filter(([p]) => p >= BINS[b]! && p < BINS[b + 1]!);
    if (i.length === 0) continue;
    const pred = snitt(i.map(([p]) => p));
    const fakt = i.filter(([, t]) => t).length / i.length;
    const s = Math.sqrt(Math.max(1e-12, (fakt * (1 - fakt)) / i.length));
    console.log(
      `  ${(BINS[b]! * 100).toFixed(0).padStart(3)}–${(Math.min(1, BINS[b + 1]!) * 100).toFixed(0).padEnd(3)} %     | ${String(i.length).padStart(8)} | ${pst(pred).padStart(15)} | ${(pst(fakt) + " ± " + (100 * s).toFixed(1)).padStart(16)} | ${((fakt - pred) * 100 >= 0 ? "+" : "") + ((fakt - pred) * 100).toFixed(1)} pp`,
    );
  }
};

console.log("1a. KALIBRERINGSKURVE, MARGINALT (per skjulte kort, T = 1)");
console.log("    «Troen sier at kortet ligger her med p. Ligger det der p av gangene?»\n");
{
  const par: [number, boolean][] = [];
  for (const r of rader) {
    for (let i = 0; i < r.mt.length; i++) {
      for (let c = 0; c < KLASSER; c++) par.push([r.mp[i * KLASSER + c] ?? 0, r.mt[i] === c]);
    }
  }
  kurve(par);
}

console.log("\n1b. KALIBRERINGSKURVE, FELLES (over kandidatverdenene, T = 1)");
console.log("    «Troen sier at DENNE verdenen gjelder med p. Gjelder den p av gangene?»\n");
{
  const par: [number, boolean][] = [];
  for (const r of rader) {
    const s = byggSett(r, 1);
    for (let i = 0; i < s.p.length; i++) par.push([s.p[i]!, s.sann[i]!]);
  }
  kurve(par);
}

// ---------------------------------------------------------------- 2. sveipet
console.log("\n\n2. TEMPERATURSVEIPET — log-tap på fasiten, ESS/K, og treffraten på toppen\n");
console.log(
  "    T | marg. log-tap    | felles log-tap   |  ESS/K | troen sier topp | FAKTISK topp     | p(sann)",
);
console.log("  " + "-".repeat(108));
for (const T of GRID) {
  const m = margTapAlle(T);
  const sett = rader.map((r) => byggSett(r, T));
  const f = sett.map((x) => -Math.log(Math.max(1e-300, x.pSann)));
  const ess = rader.map((r) => essAndel(r, T));
  const maksP = sett.map((x) => x.maksP);
  const topp = sett.filter((x) => x.toppSann).length / sett.length;
  const sTopp = Math.sqrt(Math.max(1e-12, (topp * (1 - topp)) / sett.length));
  console.log(
    `  ${String(T).padStart(3)} | ${snitt(m).toFixed(4)} ± ${se(m).toFixed(4)} | ${snitt(f).toFixed(4)} ± ${se(f).toFixed(4)} | ${snitt(ess).toFixed(3).padStart(6)} | ${pst(snitt(maksP)).padStart(15)} | ${(pst(topp) + " ± " + (100 * sTopp).toFixed(1)).padStart(16)} | ${pst(snitt(sett.map((x) => x.pSann)))}`,
  );
}
{
  const M = snitt(rader.map((r) => (r.nSann > 0 ? r.lw.length : r.lw.length + 1)));
  console.log(
    `\n  Gulv (uniformt over settet): felles log-tap ln ${M.toFixed(1)} = ${Math.log(M).toFixed(4)}, ` +
      `topp-p = ${pst(1 / M)}.  Marginalt gulv: ln 4 = ${Math.log(4).toFixed(4)} (ln 3 = ${Math.log(3).toFixed(4)} der vraket er utelukket).`,
  );
}

// -------------------------------------------------------------- 3. optimal T
const finn = (tap: (T: number) => number): { T: number; v: number } => {
  let best = { T: 1, v: tap(1) };
  for (let T = 0.5; T <= 40.0001; T += 0.05) {
    const v = tap(T);
    if (v < best.v) best = { T: Math.round(T * 100) / 100, v };
  }
  return best;
};
const optM = finn((T) => snitt(margTapAlle(T)));
const optF = finn((T) => snitt(rader.map((r) => -Math.log(Math.max(1e-300, byggSett(r, T).pSann)))));
console.log("\n\n3. DEN OPTIMALE TEMPERATUREN — den som minimerer log-tapet på fasiten\n");
console.log(
  `  MARGINALT (per skjulte kort):   T* = ${optM.T.toFixed(2)}   log-tap ${optM.v.toFixed(4)} ` +
    `(mot ${snitt(margTapAlle(1)).toFixed(4)} ved T = 1, altså ${(snitt(margTapAlle(1)) - optM.v).toFixed(4)} nat spart)`,
);
console.log(
  `  FELLES (over verdenene):        T* = ${optF.T.toFixed(2)}   log-tap ${optF.v.toFixed(4)} ` +
    `(mot ${snitt(rader.map((r) => -Math.log(Math.max(1e-300, byggSett(r, 1).pSann)))).toFixed(4)} ved T = 1)`,
);
console.log(
  `\n  Forholdet T*_felles / T*_marginalt = ${(optF.T / optM.T).toFixed(2)}. Er det stort, ligger\n` +
    `  overkonfidensen i PRODUKTANTAKELSEN (kortene summeres som uavhengige), ikke i trohodet.`,
);

// ----------------------------------------------------------- 4. kurven ved T*
console.log(`\n\n4. KALIBRERINGSKURVEN FELLES VED T* = ${optF.T.toFixed(2)} — er den rettet?\n`);
{
  const par: [number, boolean][] = [];
  for (const r of rader) {
    const s = byggSett(r, optF.T);
    for (let i = 0; i < s.p.length; i++) par.push([s.p[i]!, s.sann[i]!]);
  }
  kurve(par);
}

// -------------------------------------------------------------- 5. per gruppe
console.log("\n\n5. PER ROLLE OG FASE — hvor overkonfident er den hvor?\n");
console.log("gruppe          |     n | ESS/K (T=1) | felles tap T=1 | T* felles | topp: sier / faktisk");
console.log("-".repeat(100));
const grupper: [string, (r: Rad) => boolean][] = [
  ["ALLE", () => true],
  ["  foerer", (r) => r.rolle === "foerer"],
  ["  makker", (r) => r.rolle === "makker"],
  ["  forsvar", (r) => r.rolle === "forsvar"],
  ["  stikk 0-3", (r) => r.stikk <= 3],
  ["  stikk 4-7", (r) => r.stikk >= 4 && r.stikk <= 7],
  ["  stikk 8+", (r) => r.stikk >= 8],
];
for (const [navn, filter] of grupper) {
  const g = rader.filter(filter);
  if (g.length === 0) continue;
  const sett1 = g.map((r) => byggSett(r, 1));
  const tapT = (T: number): number => snitt(g.map((r) => -Math.log(Math.max(1e-300, byggSett(r, T).pSann))));
  let best = { T: 1, v: tapT(1) };
  for (let T = 0.5; T <= 40.0001; T += 0.1) {
    const v = tapT(T);
    if (v < best.v) best = { T: Math.round(T * 10) / 10, v };
  }
  const topp = sett1.filter((x) => x.toppSann).length / sett1.length;
  console.log(
    `${navn.padEnd(15)} | ${String(g.length).padStart(5)} | ${snitt(g.map((r) => essAndel(r, 1))).toFixed(3).padStart(11)} | ${tapT(1).toFixed(4).padStart(14)} | ${best.T.toFixed(1).padStart(9)} | ${pst(snitt(sett1.map((x) => x.maksP)))} / ${pst(topp)}`,
  );
}

// ------------------------------------------------------------ 5b. kontrollarmen
{
  const med = rader.filter((r) => Array.isArray(r.lwR) && typeof r.lwRS === "number");
  if (med.length > 0) {
    const ekte = med.map((r) => byggSett(r, 1));
    const rot = med.map((r) => byggSett(r, 1, true));
    const tap = (x: readonly Sett[]): number => snitt(x.map((s) => -Math.log(Math.max(1e-300, s.pSann))));
    const topp = (x: readonly Sett[]): number => x.filter((s) => s.toppSann).length / x.length;
    const M = snitt(med.map((r) => (r.nSann > 0 ? r.lw.length : r.lw.length + 1)));
    console.log(
      `\n\n5b. KONTROLLARMEN — samme fordeling, seteklassene ROTERT ett hakk (n = ${med.length}).\n` +
        `    Peker troen feil vei, skal den sanne verdenen ikke lenger finnes igjen på toppen.\n`,
    );
    console.log("  arm                 | log-tap | troen sier topp | FAKTISK topp | p(sann)");
    console.log("  " + "-".repeat(74));
    console.log(
      `  EKTE tro            | ${tap(ekte).toFixed(4).padStart(7)} | ${pst(snitt(ekte.map((s) => s.maksP))).padStart(15)} | ${pst(topp(ekte)).padStart(12)} | ${pst(snitt(ekte.map((s) => s.pSann)))}`,
    );
    console.log(
      `  ROTERT (kontroll)   | ${tap(rot).toFixed(4).padStart(7)} | ${pst(snitt(rot.map((s) => s.maksP))).padStart(15)} | ${pst(topp(rot)).padStart(12)} | ${pst(snitt(rot.map((s) => s.pSann)))}`,
    );
    console.log(
      `  uniformt gulv       | ${Math.log(M).toFixed(4).padStart(7)} | ${pst(1 / M).padStart(15)} | ${pst(1 / M).padStart(12)} | ${pst(1 / M)}`,
    );
  }
}

// -------------------------------------------------- 6. delmengden uten duplikat
const rene = rader.filter((r) => r.nSann === 0);
if (rene.length > 0 && rene.length < rader.length) {
  const p1 = snitt(rene.map((r) => byggSett(r, 1).pSann));
  const t1 = rene.filter((r) => byggSett(r, 1).toppSann).length / rene.length;
  const m1 = snitt(rene.map((r) => byggSett(r, 1).maksP));
  console.log(
    `\n\n6. FORBEHOLDET PRØVD: delmengden der strømmen IKKE selv trakk den sanne verdenen (n = ${rene.length}).\n` +
      `   Her er den sanne verdenen entydig én av ${(snitt(rene.map((r) => r.lw.length)) + 1).toFixed(1)} oppføringer.\n` +
      `   troen sier topp ${pst(m1)}, faktisk topp ${pst(t1)}, p(sann) ${pst(p1)}.`,
  );
}
