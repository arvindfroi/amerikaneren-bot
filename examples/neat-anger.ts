/**
 * Scorer boter på angerbenken: beslutningskvalitet mot det eksakte orakelet.
 *
 *   node examples/neat-anger.ts bidrag/d5-adoptert.json nevro pimc --antall 3000
 *
 * Null varians mellom kandidatene – alle møter nøyaktig samme stillinger, så
 * differansen er ren ferdighet. Til sammenlikning har kampmålingen ±2–4
 * poeng SE og en løpsdrift på titalls poeng.
 *
 * Fasiten er eksakt dobbelt-dummy (src/e1/orakel.ts), ikke NevroHjerne.
 * Stillingene kommer derimot fra nevros spilling, så tallet måler kvalitet i
 * DE situasjonene – se skjevhetsnotatet i src/neat/angerbenk.ts.
 */

import { readFileSync } from "node:fs";

import { FARGER, type Kort } from "../src/kort.ts";
import { lesBenk, scoreBenk, type Benkstilling } from "../src/neat/angerbenk.ts";
import { genomFraJson } from "../src/neat/index.ts";
import { Nettverk } from "../src/neat/nett.ts";
import { UT_KORT } from "../src/neat/trekk.ts";
import { forover, nettFraBytes } from "../src/nevro/nett.ts";
import { nevroHjerne } from "../src/nevro/index.ts";

const filer: string[] = [];
let antall = 3000;
let mappe = "e1-data";
/** Plukk hver n-te linje. 1 = alle (nyttig paa smaa/ferske datasett). */
let steg = 7;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--antall") antall = Number(process.argv[++i]);
  else if (a === "--mappe") mappe = process.argv[++i] ?? mappe;
  else if (a === "--steg") steg = Number(process.argv[++i]);
  else filer.push(a);
}

const benk: Benkstilling[] = lesBenk(mappe, antall, steg);
if (benk.length === 0) {
  console.error(`Fant ingen stillinger i ${mappe}/*.jsonl`);
  process.exit(1);
}
const perStikk = new Map<number, number>();
for (const s of benk) perStikk.set(s.stikk, (perStikk.get(s.stikk) ?? 0) + 1);
console.log(
  `Angerbenk: ${benk.length} stillinger fra ${mappe} ` +
    `(stikk ${[...perStikk.keys()].sort((a, b) => a - b).join(",")})\n`,
);

/** Trekkvektoren er E1-formatet (273); NEAT-nettet vil ha sitt eget (318). */
const kortFraIndeks = (i: number): Kort =>
  ({ farge: FARGER[Math.floor(i / 13)]!, verdi: ((i % 13) + 2) as Kort["verdi"] });

type Velger = (t: readonly number[], lovlige: readonly number[]) => number;

const kandidater: { navn: string; velg: Velger }[] = [];
/** NEAT-genomer scores på `n`-vektoren, ikke E1-vektoren. */
const neatKandidater: { navn: string; velg: Velger }[] = [];
for (const f of filer) {
  if (f === "nevro") {
    const h = nevroHjerne();
    kandidater.push({
      navn: "nevro",
      velg: (t, lovlige) => {
        // NevroHjernes spillnett tar de 238 første trekkene – E1-vektoren er
        // konstruert slik at de er identiske med appens koding.
        const logits = forover(h.spill, Float32Array.from(t.slice(0, 238)));
        let beste = lovlige[0]!;
        for (const k of lovlige) if (logits[k]! > logits[beste]!) beste = k;
        return beste;
      },
    });
    continue;
  }
  if (f.startsWith("e1:")) {
    const nett = nettFraBytes(new Uint8Array(readFileSync(f.slice(3))))[0]!;
    kandidater.push({
      navn: f,
      velg: (t, lovlige) => {
        const logits = forover(nett, Float32Array.from(t));
        let beste = lovlige[0]!;
        for (const k of lovlige) if (logits[k]! > logits[beste]!) beste = k;
        return beste;
      },
    });
    continue;
  }
  // NEAT-genom: krever NEAT-trekkvektoren (feltet `n`), som orakelet skriver
  // fra 2026-07-25. Eldre datasett har den ikke – da hoppes stillingene over
  // og n blir 0, i stedet for at vi later som tallet er gyldig.
  const rå = JSON.parse(readFileSync(f, "utf8")) as { genom?: unknown };
  const g = genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(f, "utf8"));
  const nett = new Nettverk(g);
  void kortFraIndeks;
  neatKandidater.push({
    navn: f.split(/[\/]/).pop()!,
    velg: (t, lovlige) => {
      const ut = nett.aktiver([...t]);
      let beste = lovlige[0]!;
      for (const k of lovlige) if (ut[UT_KORT + k]! > ut[UT_KORT + beste]!) beste = k;
      return beste;
    },
  });
}

if (kandidater.length === 0 && neatKandidater.length === 0) {
  console.error("Ingen scorbare kandidater.");
  process.exit(1);
}
const medNeat = benk.filter((b) => b.nt !== undefined).length;
if (neatKandidater.length > 0) {
  console.log(`NEAT-vektor finnes i ${medNeat} av ${benk.length} stillinger.
`);
}

console.log("bot".padEnd(34) + "snittanger".padStart(14) + "optimalt".padStart(12) + "n".padStart(8));
console.log("-".repeat(68));
for (const k of [...kandidater, ...neatKandidater]) {
  const erNeat = neatKandidater.includes(k);
  const s = scoreBenk(benk, k.velg, erNeat ? "neat" : "e1");
  console.log(
    k.navn.padEnd(34) +
      s.anger.toFixed(4).padStart(14) +
      `${(100 * s.optimalt).toFixed(1)} %`.padStart(12) +
      String(s.n).padStart(8),
  );
}

// MERKNAD: for å score NEAT-genomer må benken lagre NEAT-trekkvektorer ved
// siden av E1-vektorene. Det krever at orakelgeneratoren skriver begge – en
// liten utvidelse av examples/e1-orakel.ts. Verdt det: da kan D-linjene
// seleksjoneres på anger i stedet for kamputfall, som er hele poenget.
