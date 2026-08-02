/**
 * PARRET SAMMENLIKNING AV TO H2H-KJØRINGER MOT MESTERAI.
 *
 *   node examples/h2h-parret.ts --a "analyse/h2h-abmp-*.jsonl" \
 *                               --b "analyse/h2h-budm-*.jsonl" \
 *                               --ut analyse/h2h-parret-budm.txt
 *
 * ============================ HVORFOR PARRET ===============================
 *
 * `mesterai-h2h.ts` gir hver kandidat sitt eget tall mot MesterAI, og den
 * naive sammenlikningen er å trekke de to marginalene fra hverandre. Det
 * kaster bort informasjon: begge kjøringene bruker SAMME frøbase, så par 37
 * side 1 er den samme kortgiva og den samme MesterAI-motstanderen i begge.
 * Variansen mellom giver er stor – noen giver er rett og slett gode – og den
 * varianasen forsvinner helt når differansen tas innenfor par.
 *
 * Marginalt: SE ≈ 0,32 på n=49. Parret: SE ≈ 0,34 på n=21, men på et tall som
 * er ~0,6 større. Det er ikke gratis – parringen kaster alle par som bare den
 * ene armen har kjørt – men det er riktig estimator, og forskjellen er ikke
 * kosmetisk: den marginale differansen blander inn givvarians som ikke har noe
 * med kandidatene å gjøre.
 *
 * ========================== HVA SOM MÅLES ==================================
 *
 * Poengdifferanse PER RUNDE, ikke per kamp. Kampene har ulik lengde (spilles
 * til 100 poeng), og en kamp som varer 20 runder ville ellers telt dobbelt av
 * en som varer 10.
 *
 *     d = (kandidatPoeng − mesterPoeng) / runder
 *
 * TEGNTESTEN over par er med fordi den ikke antar normalfordeling, og fordi
 * poengdifferanser i dette spillet har tunge haler: en enkelt amerikaner
 * (±50) eller solo (±100) kan bære et snitt alene. Er tallet ekte, skal det
 * være positivt i klart over halvparten av parene – ikke bare i snitt.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, basename, join } from "node:path";

interface Rad {
  par: number;
  side: number;
  froe: number;
  mesterPoeng: number;
  kandidatPoeng: number;
  runder: number;
  budrunder?: { mester: number; kandidat: number };
  klarte?: { mester: number; kandidat: number };
  kandidat?: string;
}

let møn: Record<"a" | "b", string> = { a: "", b: "" };
let navn: Record<"a" | "b", string> = { a: "A", b: "B" };
let ut = "analyse/h2h-parret.txt";
for (let i = 2; i < process.argv.length; i++) {
  const x = process.argv[i]!;
  if (x === "--a") møn.a = process.argv[++i]!;
  else if (x === "--b") møn.b = process.argv[++i]!;
  else if (x === "--navna") navn.a = process.argv[++i]!;
  else if (x === "--navnb") navn.b = process.argv[++i]!;
  else if (x === "--ut") ut = process.argv[++i]!;
}
if (møn.a === "" || møn.b === "") {
  console.error("Bruk: --a <glob> --b <glob> [--navna X --navnb Y] [--ut fil]");
  process.exit(1);
}

/** Minimal glob: bare `*` i filnavnet, som er alt skardmønstrene trenger. */
function utvid(m: string): string[] {
  const kat = dirname(m);
  const fnavn = basename(m);
  if (!fnavn.includes("*")) return [m];
  const re = new RegExp("^" + fnavn.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
  return readdirSync(kat)
    .filter((f) => re.test(f))
    .map((f) => join(kat, f));
}

function les(m: string): Rad[] {
  const R: Rad[] = [];
  for (const f of utvid(m)) {
    for (const l of readFileSync(f, "utf8").split("\n")) {
      if (l.trim() === "") continue;
      try {
        const r = JSON.parse(l) as Rad;
        if (Number.isFinite(r.runder) && r.runder > 0) R.push(r);
      } catch {
        continue;
      }
    }
  }
  return R;
}

const sn = (v: readonly number[]): number => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const se = (v: readonly number[]): number => {
  if (v.length < 2) return NaN;
  const m = sn(v);
  let s = 0;
  for (const x of v) s += (x - m) * (x - m);
  return Math.sqrt(s / (v.length - 1) / v.length);
};
/**
 * Poeng per runde PER SETE for én kamp.
 *
 * Delingen på 2 er ikke kosmetikk. `kandidatPoeng` er summen over BEGGE
 * kandidatsetene, så et udelt tall er på dobbelt skala av alt annet i dette
 * prosjektet – inkludert de 0,273 som er gapet til MesterAI, og de ±1,4 fra
 * menneskeloggene. Uten den ville en parret gevinst sett dobbelt så stor ut
 * som porten den skal passere.
 */
const dpr = (r: Rad): number => (r.kandidatPoeng - r.mesterPoeng) / r.runder / 2;

const A = les(møn.a);
const B = les(møn.b);

/**
 * Nøkkelen er (par, side) OG frø. Frøet er med fordi to kjøringer med ulik
 * --froe ville fått samme (par, side) uten å være samme giv i det hele tatt,
 * og da hadde parringen vært ren støy uten at noe klaget.
 */
const nøkkel = (r: Rad): string => `${r.froe}|${r.par}|${r.side}`;
const kartA = new Map<string, Rad>();
for (const r of A) kartA.set(nøkkel(r), r);

/**
 * BEGGE SIDER AVDUPLISERES PÅ NØKKEL. Skardene deles på par-intervaller, og
 * intervallene kan overlappe når de startes om – da ville den samme giva talt
 * flere ganger og n blitt kunstig høy uten at noe så galt ut. Kampen er
 * deterministisk gitt (frø, par, side), så duplikatene er identiske; det er
 * tellingen som er problemet, ikke innholdet.
 */
const settB = new Set<string>();
let dublett = 0;
const par: { k: string; a: number; b: number; d: number }[] = [];
for (const r of B) {
  const k = nøkkel(r);
  const a = kartA.get(k);
  if (a === undefined) continue;
  if (settB.has(k)) {
    dublett++;
    continue;
  }
  settB.add(k);
  par.push({ k, a: dpr(a), b: dpr(r), d: dpr(r) - dpr(a) });
}
par.sort((x, y) => x.k.localeCompare(y.k));

const d = par.map((p) => p.d);
const pos = d.filter((x) => x > 0).length;
const neg = d.filter((x) => x < 0).length;

/** Snittet etter at `andel` av verdiene er kuttet i HVER ende. */
function trimmet(v: readonly number[], andel: number): number {
  if (v.length === 0) return NaN;
  const w = [...v].sort((a, b) => a - b);
  const k = Math.floor(w.length * andel);
  const midt = w.slice(k, w.length - k);
  return midt.length ? midt.reduce((a, x) => a + x, 0) / midt.length : NaN;
}

function median(v: readonly number[]): number {
  if (v.length === 0) return NaN;
  const w = [...v].sort((a, b) => a - b);
  const m = w.length >> 1;
  return w.length % 2 ? w[m]! : (w[m - 1]! + w[m]!) / 2;
}

/** Tosidig tegntest, eksakt binomial med p=0,5. */
function tegntest(k: number, n: number): number {
  if (n === 0) return NaN;
  const lnFak: number[] = [0];
  for (let i = 1; i <= n; i++) lnFak[i] = lnFak[i - 1]! + Math.log(i);
  const pk = (i: number): number => Math.exp(lnFak[n]! - lnFak[i]! - lnFak[n - i]! - n * Math.LN2);
  const m = Math.min(k, n - k);
  let s = 0;
  for (let i = 0; i <= m; i++) s += pk(i);
  return Math.min(1, 2 * s);
}

const linjer: string[] = [
  ``,
  `=== PARRET SAMMENLIKNING MOT MESTERAI ===`,
  ``,
  `A = ${navn.a}   ${møn.a}   (${A.length} kamper)`,
  `B = ${navn.b}   ${møn.b}   (${B.length} kamper)`,
  ``,
  `MARGINALT (hver arm mot MesterAI, alle kamper den har):`,
  `  ${navn.a.padEnd(10)} ${fmt(sn(A.map(dpr)))} ± ${se(A.map(dpr)).toFixed(3)}   n=${A.length}`,
  `  ${navn.b.padEnd(10)} ${fmt(sn(B.map(dpr)))} ± ${se(B.map(dpr)).toFixed(3)}   n=${B.length}`,
  ``,
];

if (par.length < 2) {
  linjer.push(
    `PARRET: bare ${par.length} felles (frø, par, side). For faa til aa regne paa.`,
    `Armene deler ikke nok giver – sjekk at --froe er den samme i begge kjoeringene.`,
  );
} else {
  const m = sn(d);
  const s = se(d);
  linjer.push(
    `PARRET paa (froe, par, side) – samme giv, samme MesterAI-motstander:`,
    `  ${navn.b} − ${navn.a} = ${fmt(m)} ± ${s.toFixed(4)}   (${(m / s).toFixed(1)} SE), n=${par.length}`,
    `  positiv i ${pos} av ${par.length} par (${neg} negative, ${par.length - pos - neg} like)` +
      (dublett > 0 ? `   [${dublett} dupliserte B-kamper hoppet over]` : ""),
    // TRIMMET SNITT NAAR SNITT OG TEGNTEST ER UENIGE.
    //
    // Prosjektets egen regel: «Er de to uenige, er det snittet som skal
    // mistros» - fordi poengfordelingen har +/-50 (amerikaner) og +/-100
    // (solo) i halene, og et snitt kan baeres av noen faa slike. ISMCTS ble
    // felt paa nettopp dette: snitt +0,898, trimmet +0,030.
    //
    // Holder det trimmede snittet, er ikke tallet baaret av utliggere, og da
    // er tegntesten bare svak - ikke uenig. Kollapser det, biter regelen.
    `  trimmet snitt (10 % hver side): ${fmt(trimmet(d, 0.1))}   median: ${fmt(median(d))}`,
    `  tegntest, tosidig: p = ${tegntest(pos, pos + neg).toFixed(3)}`,
    ``,
    `PORTEN: n >= 200 par. Naa: ${par.length}. ${par.length >= 200 ? "NAADD." : `Mangler ${200 - par.length}.`}`,
    ``,
    `Gapet til MesterAI for dagens beste bot er 0,273 poeng per runde. Holder`,
    `dette tallet, gaar Adams forbi Washington med ${fmt(m - 0.273)}.`,
  );
  // Budatferden er med fordi den forklarer et eventuelt utslag: hele poenget
  // med budmodellen er at den tar kontrakter motparten lar ligge. Endrer den
  // ikke budatferden, kan et positivt tall ikke komme fra budet.
  const bA = par.map((p) => kartA.get(p.k)!).filter((r) => r.budrunder !== undefined);
  const bB = B.filter((r) => kartA.has(nøkkel(r)) && r.budrunder !== undefined);
  if (bA.length > 0 && bB.length > 0) {
    const andel = (R: Rad[], f: (r: Rad) => number): number => sn(R.map(f));
    linjer.push(
      ``,
      `BUDATFERD paa de parrede kampene (per kamp):`,
      `  arm        budrunder vunnet   kontrakter klart   klarrate`,
      ...[
        [navn.a, bA] as const,
        [navn.b, bB] as const,
      ].map(([n, R]) => {
        const v = andel(R, (r) => r.budrunder!.kandidat);
        const k = andel(R, (r) => r.klarte?.kandidat ?? NaN);
        return `  ${n.padEnd(10)} ${v.toFixed(2).padStart(14)} ${k.toFixed(2).padStart(18)} ${(100 * (k / v)).toFixed(1).padStart(10)} %`;
      }),
    );
  }
}

function fmt(x: number): string {
  return (x >= 0 ? "+" : "") + x.toFixed(4);
}

const tekst = linjer.join("\n");
console.log(tekst);
mkdirSync(dirname(ut), { recursive: true });
writeFileSync(ut, tekst + "\n");
console.log(`\nSkrevet til ${ut}`);
