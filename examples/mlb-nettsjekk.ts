/**
 * LASTER TYPESCRIPT-SIDEN DE SAMME VEKTENE, OG FÅR DEN DE SAMME TALLENE?
 *
 *   node examples/mlb-nettsjekk.ts --vekter e1-modell/mlb-init.bin \
 *     --ref e1-modell/mlb-init-ref.bin --ut analyse/mlb-nettsjekk.txt
 *
 * `verktoy/mlb-tren.py --referanse` skriver to filer: vektene i appens format,
 * og en referansefil med INNGANGENE (float32, nøyaktig slik de ble matet) og
 * PyTorchs egne utganger for hvert av de tre hodene. Her lastes vektene i TS,
 * de samme inngangene kjøres gjennom `Sandkassenett.framover`, og avviket måles.
 *
 * ===================== HVORFOR INNGANGENE LIGGER I REFERANSEFILA =========
 *
 * Leste TS-siden dem fra datafila i stedet, ville vi målt to ting samtidig —
 * lasteren og aritmetikken — og et avvik kunne kommet fra begge. Nå er
 * inngangene bit-identiske per konstruksjon, og alt som står igjen er
 * regnestykket.
 *
 * ===================== BIT-LIKHET ER IKKE MULIG, OG HVORFOR =============
 *
 * `nevro/nett.ts` akkumulerer i JavaScripts `number`, altså float64, og hopper
 * over ledd der inngangen er nøyaktig null. PyTorch akkumulerer i float32 og
 * bruker cuBLAS/MKL med en annen — og kjøretidsbestemt — summeringsrekkefølge,
 * gjerne med FMA. Flyttall er ikke assosiative, så to ulike rekkefølger gir
 * ulike siste bit uansett hvor riktig begge er.
 *
 * Kravet er derfor en TOLERANSE, og den skal STÅ i rapporten som et tall og
 * ikke som et «ser bra ut». Terskelen er satt på det relative avviket målt mot
 * lagets egen skala, ikke på det absolutte: en logit på 30 og en på 0,003 kan
 * ikke dele terskel.
 */

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

import { Sandkassenett, POLICY_UT, TRO_UT } from "../src/mlb/nett.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(`--${n}`);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};

const vektfil = arg("vekter", "e1-modell/mlb-init.bin");
const reffil = arg("ref", "e1-modell/mlb-init-ref.bin");
const ut = arg("ut", "analyse/mlb-nettsjekk.txt");
/** Terskelen for det relative avviket. Overskrides den, er noe GALT, ikke unøyaktig. */
const terskel = Number(arg("terskel", "1e-4"));

const nett = Sandkassenett.fraFil(vektfil);

// ---- Referansefila: "MLBR", versjon, dim, n --------------------------------
const rå = readFileSync(reffil);
if (rå.subarray(0, 4).toString("ascii") !== "MLBR") throw new Error(`${reffil}: ikke en MLBR-fil`);
const versjon = rå.readInt32LE(4);
const dim = rå.readInt32LE(8);
const n = rå.readInt32LE(12);
if (versjon !== 1) throw new Error(`${reffil}: ukjent versjon ${versjon}`);
if (dim !== nett.inngangsLengde) {
  throw new Error(`referansen har ${dim} trekk, nettet tar ${nett.inngangsLengde}`);
}

const HODE = 16;
const lesFloats = (fra: number, antall: number): Float32Array => {
  const a = new Float32Array(antall);
  for (let i = 0; i < antall; i++) a[i] = rå.readFloatLE(fra + i * 4);
  return a;
};
const OFF_X = HODE;
const OFF_P = OFF_X + n * dim * 4;
const OFF_V = OFF_P + n * POLICY_UT * 4;
const OFF_T = OFF_V + n * 4;
const SLUTT = OFF_T + n * TRO_UT * 4;
if (rå.length !== SLUTT) {
  throw new Error(`${reffil}: ${rå.length} byte, formatet sier ${SLUTT} — filen er forskjøvet`);
}

const par = nett.parametre();
const form = nett.form();
writeFileSync(
  ut,
  `# MLB 0.3 — TypeScript mot PyTorch, samme vekter, samme innganger\n` +
    `# ${new Date().toISOString()}\n` +
    `# vekter=${vektfil} ref=${reffil} rader=${n} dim=${dim}\n` +
    `# form: ${JSON.stringify(form)}\n` +
    `# parametre: stamme=${par.stamme} policy=${par.policy} verdi=${par.verdi} ` +
    `tro=${par.tro} SUM=${par.sum}\n` +
    `# rad\thode\tmaksAbs\tmaksRel\tskala\n`,
  "utf8",
);

interface Verst {
  abs: number;
  rel: number;
  rad: number;
  i: number;
  ts: number;
  py: number;
}
const verst: Record<string, Verst> = {
  policy: { abs: 0, rel: 0, rad: -1, i: -1, ts: 0, py: 0 },
  verdi: { abs: 0, rel: 0, rad: -1, i: -1, ts: 0, py: 0 },
  tro: { abs: 0, rel: 0, rad: -1, i: -1, ts: 0, py: 0 },
};

for (let r = 0; r < n; r++) {
  const x = lesFloats(OFF_X + r * dim * 4, dim);
  const f = nett.framover(x);
  const par2: readonly [string, Float32Array, Float32Array][] = [
    ["policy", f.policy, lesFloats(OFF_P + r * POLICY_UT * 4, POLICY_UT)],
    ["verdi", new Float32Array([f.verdi]), lesFloats(OFF_V + r * 4, 1)],
    ["tro", f.tro, lesFloats(OFF_T + r * TRO_UT * 4, TRO_UT)],
  ];
  for (const [navn, ts, py] of par2) {
    // Skalaen er lagets EGEN største verdi denne raden. Et relativt avvik mot
    // hvert enkelt tall ville eksplodert der PyTorch tilfeldigvis traff null.
    let skala = 0;
    for (let i = 0; i < py.length; i++) skala = Math.max(skala, Math.abs(py[i]!));
    skala = Math.max(skala, 1e-6);
    let mAbs = 0;
    let mI = 0;
    for (let i = 0; i < py.length; i++) {
      const d = Math.abs(ts[i]! - py[i]!);
      if (d > mAbs) {
        mAbs = d;
        mI = i;
      }
    }
    const mRel = mAbs / skala;
    const v = verst[navn]!;
    if (mRel > v.rel) {
      v.rel = mRel;
      v.abs = mAbs;
      v.rad = r;
      v.i = mI;
      v.ts = ts[mI]!;
      v.py = py[mI]!;
    }
    appendFileSync(
      ut,
      `${r}\t${navn}\t${mAbs.toExponential(3)}\t${mRel.toExponential(3)}\t${skala.toFixed(4)}\n`,
      "utf8",
    );
  }
}

const linjer = ["", `# ---- OPPSUMMERING (${n} rader) ----`];
let verstRel = 0;
for (const [navn, v] of Object.entries(verst)) {
  verstRel = Math.max(verstRel, v.rel);
  linjer.push(
    `# ${navn.padEnd(7)} maks abs ${v.abs.toExponential(3)}  maks rel ${v.rel.toExponential(3)}` +
      `  (rad ${v.rad}, plass ${v.i}: TS ${v.ts.toPrecision(9)} mot PyTorch ${v.py.toPrecision(9)})`,
  );
}
linjer.push(`# TERSKEL ${terskel.toExponential(1)} relativt — verst målt ${verstRel.toExponential(3)}`);
linjer.push(
  verstRel <= terskel
    ? `# LIKE innenfor toleransen. Avviket er summeringsrekkefølge (float64 med ` +
      `nulldropp i TS mot float32 + FMA i PyTorch), ikke ulike vekter.`
    : `# AVVIKET ER FOR STORT. Det er ikke avrunding — det er to ulike nett.`,
);
appendFileSync(ut, linjer.join("\n") + "\n", "utf8");
console.log(linjer.join("\n"));
if (verstRel > terskel) process.exitCode = 1;
