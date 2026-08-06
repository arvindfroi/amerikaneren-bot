/**
 * BUDMODELLEN, bygget fra bunnen etter quant-oppskriften.
 *
 *   node examples/budmodell.ts --data bud-kvant --ut e1-modell/bud-gbt.json
 *
 * ARKITEKTUREN, og hvorfor den ikke forutsier budet direkte:
 *
 *     modell:   hånd → (μ, σ) for FORDELINGEN av lagstikk
 *     regning:  P(N) = 1 − Φ((N − 0,5 − μ)/σ)
 *               EV(N) = P(vinner budrunden med N) · 2N(2P(N)−1)
 *                     + (1 − P(vinner)) · EV(forsvar)
 *     valg:     argmax over N
 *
 * Å la modellen forutsi EV per bud direkte ville krevd 6–8 utganger som alle
 * må læres hver for seg, av etiketter som er støyete hver for seg. Å forutsi
 * fordelingen krever TO tall, og utbetalingen er kjent i lukket form. Det er
 * hele quant-poenget: modeller det som varierer, regn ut resten.
 *
 * MÅLT GEVINST AV DEN OMLEGGINGEN (`analyse/bud-kvant.txt`): den naive
 * argmax-estimatoren trengte K ≈ 50–60 trekninger for å slå en konstant;
 * fordeling + parametrisk hale + krymping klarte det på K = 24, og med én
 * kontrakt i stedet for åtte. Rundt 10× mindre regning.
 *
 * MODELLKLASSEN ER GRADIENT BOOSTED TREES, og det er et svar på Arvinds
 * kritikk av ridge: «vi må finne thresholds … samt ikke behandle det analogt.»
 * Trær gir terskler gratis, og dybde 3 gir samspill mellom tre trekk. En
 * lineær modell kan per definisjon ikke uttrykke at den syvende trumfen er
 * verdt mindre enn den femte, eller at A-K sammen slår to spredte honnører.
 *
 * TREKKENE gjenskapes fra frøet i stedet for å leses av datafila – da kan
 * `budtrekk.ts` utvides uten å generere 3 000 hender på nytt.
 *
 * HOLDOUTEN ER PÅ GIV, og evalueringen bruker MÅLEBLOKKEN (stikkB), som
 * modellen aldri har sett. Velgeblokken (stikkA) er det eneste som trener.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { opprettSpill } from "../src/index.ts";
import { budTrekk, BUD_DIM } from "../src/moe2/budtrekk.ts";
import { anslåSkog, trenSkog, type Skog } from "../src/moe2/gbt.ts";

let dataMappe = "bud-kvant";
let utFil = "e1-modell/bud-gbt.json";
let runder = 300;
let dybde = 3;
let rate = 0.06;
let holdoutAndel = 0.25;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--data") dataMappe = process.argv[++i]!;
  else if (a === "--ut") utFil = process.argv[++i]!;
  else if (a === "--runder") runder = Number(process.argv[++i]);
  else if (a === "--dybde") dybde = Number(process.argv[++i]);
  else if (a === "--rate") rate = Number(process.argv[++i]);
}

const BUD = [7, 8, 9, 10, 11, 12];

interface Rad {
  frø: number;
  stikkA: number[];
  stikkB: number[];
  passA: number[];
  passB: number[];
  vantMed: Record<string, number>;
}
const rå: Rad[] = [];
for (const f of readdirSync(dataMappe).filter((x) => x.endsWith(".jsonl"))) {
  for (const l of readFileSync(join(dataMappe, f), "utf8").split("\n")) {
    if (l.trim() === "") continue;
    try {
      const r = JSON.parse(l) as Rad;
      if (r.stikkA?.length >= 5 && r.stikkB?.length >= 5 && r.passA?.length >= 5) rå.push(r);
    } catch {
      continue;
    }
  }
}
if (rå.length < 200) {
  console.error(`for få hender (${rå.length})`);
  process.exit(1);
}

const sn = (v: readonly number[]): number => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0);
const sd = (v: readonly number[]): number => {
  if (v.length < 2) return 1;
  const m = sn(v);
  let s = 0;
  for (const x of v) s += (x - m) * (x - m);
  return Math.sqrt(s / (v.length - 1));
};
const seOf = (v: readonly number[]): number => sd(v) / Math.sqrt(Math.max(1, v.length));

// TREKKENE gjenskapes fra frøet. Førstebudgiveren er giver + 1, som i
// generatoren – står de ikke likt, måler vi en annen hånd enn den som ble
// spilt, og feilen ville vært stum.
interface Sak { x: Float32Array; μ: number; σ: number; r: Rad; hold: boolean }
const saker: Sak[] = [];
for (const r of rå) {
  const mal = opprettSpill({ antallSpillere: 4 }, r.frø);
  const sete = (mal.giver + 1) % mal.antallSpillere;
  if ((mal.hender[sete] ?? []).length === 0) continue;
  saker.push({
    x: budTrekk(mal, sete),
    μ: sn(r.stikkA),
    σ: Math.max(0.5, sd(r.stikkA)),
    r,
    hold: (Math.imul(r.frø, 2654435761) >>> 0) / 2 ** 32 < holdoutAndel,
  });
}
const tren = saker.filter((s) => !s.hold);
const hold = saker.filter((s) => s.hold);

// --- Gradient boosted regression trees --------------------------------------
//
// Koden laa inline her. Den er trukket ut til `src/moe2/gbt.ts` slik at
// `budmodell-v2.ts` bruker NOEYAKTIG samme regnestykke og ikke en kopi -
// prosjektets mest gjentatte feil er at det maalte og det utrullede ikke er
// samme ting, og to utgaver av samme modell er den formen.
//
// Uttrekket er verifisert bit-identisk: samme korpus gir samme md5.

const tren1 = (X: Float32Array[], y: number[]): Skog =>
  trenSkog(X, y, { runder, dybde, rate, bredde: BUD_DIM });
const anslå = (m: Skog, x: Float32Array): number => anslåSkog(m, x, rate);

const Xt = tren.map((s) => s.x);
const mμ = tren1(Xt, tren.map((s) => s.μ));
const mσ = tren1(Xt, tren.map((s) => s.σ));

// --- Beslutningen -----------------------------------------------------------
function Φ(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}
/** Budrunde-sannsynligheten er en populasjonsstørrelse, ikke en håndstørrelse. */
const vant: Record<number, number> = {};
for (const N of BUD) vant[N] = sn(saker.map((s) => s.r.vantMed[String(N)] ?? 0));

function velg(x: Float32Array, evPass: number): number {
  const μ = anslå(mμ, x);
  const σ = Math.max(0.6, anslå(mσ, x));
  let beste = 0;
  let bv = evPass;
  for (const N of BUD) {
    const P = 1 - Φ((N - 0.5 - μ) / σ);
    const p = vant[N] ?? 0;
    const ev = p * (2 * N * (2 * P - 1)) + (1 - p) * evPass;
    if (ev > bv) {
      bv = ev;
      beste = N;
    }
  }
  return beste;
}

/** Verdien av å by N, lest av på MÅLEBLOKKEN. Aldri brukt til å velge. */
const fasit = (s: Sak, N: number): number => {
  const evPass = sn(s.r.passB);
  if (N === 0) return evPass;
  const P = s.r.stikkB.filter((x) => x >= N).length / s.r.stikkB.length;
  const p = vant[N] ?? 0;
  return p * (2 * N * (2 * P - 1)) + (1 - p) * evPass;
};

let fast = 0;
let fv = -Infinity;
for (const N of [0, ...BUD]) {
  const v = sn(hold.map((s) => fasit(s, N)));
  if (v > fv) {
    fv = v;
    fast = N;
  }
}
const dModell = hold.map((s) => fasit(s, velg(s.x, sn(s.r.passA))) - fasit(s, fast));
const dTren = tren.map((s) => fasit(s, velg(s.x, sn(s.r.passA))) - fasit(s, fast));
// Referanse: den EMPIRISKE regneren paa velgeblokken - altsaa aa bruke de 40
// utspillingene direkte i stedet for en modell. Den koster 40 runder per bud;
// modellen koster ingenting.
const dRegner = hold.map((s) => {
  const μ = s.μ;
  const σ = Math.max(0.6, s.σ);
  let b = 0;
  let bv = sn(s.r.passA);
  for (const N of BUD) {
    const P = 1 - Φ((N - 0.5 - μ) / σ);
    const p = vant[N] ?? 0;
    const ev = p * (2 * N * (2 * P - 1)) + (1 - p) * sn(s.r.passA);
    if (ev > bv) {
      bv = ev;
      b = N;
    }
  }
  return fasit(s, b) - fasit(s, fast);
});

const linjer = [
  `\n=== Budmodellen: fordeling inn, bud ut ===`,
  `${saker.length} hender (${tren.length} trening, ${hold.length} holdout, delt paa giv).`,
  `${BUD_DIM} trekk, GBT dybde ${dybde}, ${runder} runder, rate ${rate}.`,
  `Referanse: den beste FASTE handlingen (${fast === 0 ? "PASS" : "bud " + fast}).`,
  ``,
  `                            mot «${fast === 0 ? "PASS" : "bud " + fast}»            koster`,
  `--------------------------------------------------------------------`,
  `MODELLEN, holdout        ${(sn(dModell) >= 0 ? "+" : "") + sn(dModell).toFixed(3)} ± ${seOf(dModell).toFixed(3)}  (${(sn(dModell) / seOf(dModell)).toFixed(1)} SE)   ingenting`,
  `MODELLEN, trening        ${(sn(dTren) >= 0 ? "+" : "") + sn(dTren).toFixed(3)} ± ${seOf(dTren).toFixed(3)}`,
  `REGNEREN (40 utspill)    ${(sn(dRegner) >= 0 ? "+" : "") + sn(dRegner).toFixed(3)} ± ${seOf(dRegner).toFixed(3)}  (${(sn(dRegner) / seOf(dRegner)).toFixed(1)} SE)   240 runder/bud`,
  `--------------------------------------------------------------------`,
  ``,
  `MODELLENS TREFF paa fordelingen (holdout):`,
  `  korrelasjon mu       ${(() => {
    const a = hold.map((s) => anslå(mμ, s.x));
    const b = hold.map((s) => sn(s.r.stikkB));
    const ma = sn(a);
    const mb = sn(b);
    let sab = 0;
    let sa = 0;
    let sb2 = 0;
    for (let i = 0; i < a.length; i++) {
      sab += (a[i]! - ma) * (b[i]! - mb);
      sa += (a[i]! - ma) ** 2;
      sb2 += (b[i]! - mb) ** 2;
    }
    return (sab / Math.sqrt(sa * sb2)).toFixed(3);
  })()}`,
  ``,
  `LESEVEILEDNING. «Modellen, holdout» mot «modellen, trening» viser`,
  `overtilpasning. Modellen mot REGNEREN viser om destillasjonen henter det`,
  `regnestykket klarer - regneren bruker 40 utspillinger per haand, modellen`,
  `bruker null.`,
  ``,
  `DETTE ER IKKE ET POENGTALL FOR BOTEN. Det er maalt paa simulerte etiketter`,
  `fra den samme generatoren. Den ekte proeven er en parret maaling i spill,`,
  `mot dagens bot, paa et FRISKT froebaand.`,
];
console.log(linjer.join("\n"));
mkdirSync(dirname(utFil), { recursive: true });
writeFileSync(utFil, JSON.stringify({ dim: BUD_DIM, bud: BUD, rate, vant, mμ, mσ }));
writeFileSync(utFil.replace(/\.json$/, ".txt"), linjer.join("\n") + "\n");
