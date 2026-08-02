/**
 * HVOR MYE ER IGJEN Å HENTE I BUDET? – splitt-halv, så tallet er ærlig.
 *
 *   node examples/budtak.ts --a bud-splitt/A --b bud-splitt/B
 *
 * ====================== SPØRSMÅLET ARVIND STILTE ==========================
 *
 * «hvor mye igjen har vi på bud forresten, jeg forsto ikke hvor optimal den er
 * nå. kan vi måle det?»
 *
 * `budmetning.ts` svarte at beslutningsREGELEN er ferdig: modellen tar 106,6 %
 * av rommet mellom «by alltid 9» og «beste bud per μ-bøtte». Men det svaret er
 * betinget av dagens håndvurdering. Spørsmålet som står igjen er hva et BEDRE
 * μ ville vært verdt, og det tallet kan ikke leses av samme datasett.
 *
 * ===================== HVORFOR ETT DATASETT IKKE HOLDER ====================
 *
 * `ev[N]` er et snitt over 24 verdenstrekninger – et STØYETE estimat av den
 * sanne EV(N | hånd). Tar man argmax over det per hånd og leser av på de
 * samme trekningene, måler man sin egen støy: argmax plukker systematisk de
 * budene som var heldige i akkurat de 24 verdenene.
 *
 * Prosjektet har gått i den fellen én gang. «+1,18 i budhodrom» var ren
 * argmax-støy; splitt-halv målte −0,825 ± 0,095. Og jeg gjorde en variant av
 * feilen i natt: jeg kalte gapet opp til fasitraden «ureduserbart, makker +
 * talong». Det er galt – `ev[N]` er ALLEREDE midlet over makkerens kort og
 * talongen, så den tilfeldigheten kan ikke dukke opp som et gap mellom to
 * EV-nivåer. Gapet var i hovedsak forbannelsen.
 *
 * ============================== DESIGNET ==================================
 *
 * To datasett på NØYAKTIG samme hender, med UAVHENGIGE trekninger
 * (`--trekkfroe` i buddata.ts). Da kan budet velges på A og leses av på B:
 *
 *   KONSTANT        beste faste bud. Gulvet.
 *   BUDMODELLEN     modellens valg, lest av på B.
 *   ORAKEL (A→B)    argmax på A, lest av på B. FORVENTNINGSRETT anslag på hva
 *                   en perfekt håndvurdering ville hentet. Litt konservativt:
 *                   A-argmax treffer ikke alltid det sanne beste budet.
 *   NAIVT (B→B)     argmax på B, lest av på B. Oppblåst – tas med for å VISE
 *                   hvor stor forbannelsen er, ikke som et mål.
 *
 * Rommet som gjenstår = ORAKEL − BUDMODELLEN. Det er svaret.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { opprettSpill, type GameState } from "../src/index.ts";
import { budTrekk } from "../src/moe2/budtrekk.ts";
import { lesBudmodell } from "../src/moe2/budagent.ts";

let katA = "bud-splitt";
let katB = "bud-splitt";
let mønA = "A-";
let mønB = "B-";
let modellFil = "e1-modell/bud-gbt.json";
let ut = "analyse/budtak.txt";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--kat") katA = katB = process.argv[++i]!;
  else if (a === "--modell") modellFil = process.argv[++i]!;
  else if (a === "--ut") ut = process.argv[++i]!;
}

interface Rad {
  ev: Record<string, number>;
  frø: number;
  sete: number;
}
const les = (kat: string, pre: string): Map<string, Rad> => {
  const m = new Map<string, Rad>();
  for (const f of readdirSync(kat).filter((x) => x.startsWith(pre) && x.endsWith(".jsonl"))) {
    for (const l of readFileSync(join(kat, f), "utf8").split("\n")) {
      if (l.trim() === "") continue;
      try {
        const r = JSON.parse(l) as Rad;
        if (r.ev && Number.isFinite(r.frø)) m.set(`${r.frø}|${r.sete}`, r);
      } catch {
        continue;
      }
    }
  }
  return m;
};
const A = les(katA, mønA);
const B = les(katB, mønB);

const modell = lesBudmodell(modellFil);
const forutsi = (n: { blad: boolean; verdi?: number; kol?: number; terskel?: number; v?: unknown; h?: unknown }, x: Float32Array): number =>
  n.blad ? n.verdi! : forutsi((x[n.kol!]! <= n.terskel! ? n.v : n.h) as typeof n, x);
const anslå = (s: { basis: number; trær: unknown[] }, x: Float32Array): number =>
  s.basis + modell.rate * s.trær.reduce((a: number, t) => a + forutsi(t as Parameters<typeof forutsi>[0], x), 0);
const Φ = (z: number): number => {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
};

const BUD = [...new Set([...A.values()].flatMap((r) => Object.keys(r.ev)))].map(Number).sort((a, b) => a - b);
const sn = (v: readonly number[]): number => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const se = (v: readonly number[]): number => {
  if (v.length < 2) return NaN;
  const m = sn(v);
  let s = 0;
  for (const x of v) s += (x - m) * (x - m);
  return Math.sqrt(s / (v.length - 1) / v.length);
};
const ev = (r: Rad, N: number): number => r.ev[String(N)] ?? NaN;
const argmax = (r: Rad): number => {
  let best = BUD[0]!;
  let bv = -Infinity;
  for (const N of BUD) {
    const v = ev(r, N);
    if (Number.isFinite(v) && v > bv) {
      bv = v;
      best = N;
    }
  }
  return best;
};

const felles = [...A.keys()].filter((k) => B.has(k));
const evKonst: number[] = [];
const evBudm: number[] = [];
const evOrakel: number[] = [];
const evNaiv: number[] = [];
let hoppet = 0;
for (const k of felles) {
  const a = A.get(k)!;
  const b = B.get(k)!;
  let s: GameState;
  try {
    s = opprettSpill({ antallSpillere: 4 }, a.frø >>> 0);
  } catch {
    hoppet++;
    continue;
  }
  if (s.fase !== "BUDRUNDE") {
    hoppet++;
    continue;
  }
  const x = budTrekk(s, a.sete);
  const μ = anslå(modell.mμ, x);
  const σ = Math.max(0.6, anslå(modell.mσ, x));
  let valgt = 0;
  let bv = 2.5;
  for (const N of BUD) {
    if (N === 0) continue;
    const P = 1 - Φ((N - 0.5 - μ) / σ);
    const p = modell.vant[String(N)] ?? (N >= 11 ? 1 : 0);
    const e = p * (2 * N * (2 * P - 1)) + (1 - p) * 2.5;
    if (e > bv) {
      bv = e;
      valgt = N;
    }
  }
  const vK = ev(b, 9);
  const vM = ev(b, valgt);
  const vO = ev(b, argmax(a)); // valgt paa A, lest paa B
  const vN = ev(b, argmax(b)); // valgt paa B, lest paa B
  if (![vK, vM, vO, vN].every(Number.isFinite)) {
    hoppet++;
    continue;
  }
  evKonst.push(vK);
  evBudm.push(vM);
  evOrakel.push(vO);
  evNaiv.push(vN);
}

const f = (x: number): string => (x >= 0 ? "+" : "") + x.toFixed(3);
/** Parret SE for differansen, ikke summen av to marginale SE-er. */
const parretSE = (u: number[], v: number[]): number => se(u.map((x, i) => x - v[i]!));
const rest = sn(evOrakel) - sn(evBudm);
const tatt = sn(evBudm) - sn(evKonst);

const L = [
  ``,
  `=== HVOR MYE ER IGJEN AA HENTE I BUDET? ===`,
  `${evBudm.length} hender i BEGGE settene (${hoppet} hoppet over).`,
  `Samme hender, UAVHENGIGE verdenstrekninger. Alt lest av paa sett B.`,
  ``,
  `nivaa                         poeng/runde`,
  `--------------------------------------------------------------`,
  `KONSTANT (bud 9)             ${f(sn(evKonst)).padStart(8)} ± ${se(evKonst).toFixed(3)}`,
  `BUDMODELLEN                  ${f(sn(evBudm)).padStart(8)} ± ${se(evBudm).toFixed(3)}`,
  `PER HAAND, K=24 (valgt A)    ${f(sn(evOrakel)).padStart(8)} ± ${se(evOrakel).toFixed(3)}   <- en POLICY, ikke et tak`,
  `NAIVT   (valgt paa B)        ${f(sn(evNaiv)).padStart(8)} ± ${se(evNaiv).toFixed(3)}   <- oppblaast`,
  `--------------------------------------------------------------`,
  ``,
  `MODELLEN HAR TATT:   ${f(tatt)} ± ${parretSE(evBudm, evKonst).toFixed(3)} over «by alltid 9»`,
  `MOT PER-HAAND K=24:  ${f(rest)} ± ${parretSE(evOrakel, evBudm).toFixed(3)}`,
  ``,
  `ADVARSEL OM TOLKNING, og den er en RETTELSE av dette skriptets egen`,
  `foerste utgave. «Valgt paa A, lest paa B» fjerner forbannelsen fra`,
  `AVLESNINGEN, men ikke fra VALGET: aa plukke bud per haand ut fra 24`,
  `trekninger er i seg selv en stoeyete policy. Prosjektet har maalt at argmax`,
  `over per-haand-estimater taper mot en KONSTANT under K ~ 48, og 24 er godt`,
  `under. Raden er derfor IKKE et tak - den er en konkurrent, og den taper.`,
  ``,
  `Er tallet negativt, betyr det at ingen av de tre alternativene vi kan`,
  `konstruere - fast bud, mu-boettetabell, per-haand-argmax - slaar modellen.`,
  `Det er ikke det samme som at taket er naadd. Det er at vi ikke kan SE taket`,
  `herfra, og at aa finne det krever flere verdener per haand, ikke smartere`,
  `statistikk paa de 24 vi har.`,
  ``,
  `VINNERENS FORBANNELSE: ${f(sn(evNaiv) - sn(evOrakel))} poeng/runde.`,
  `Det er hva argmax over 24 stoeyete trekninger later som den henter, og som`,
  `forsvinner naar budet velges paa ett sett og leses av paa et annet. Et tall`,
  `regnet paa ETT datasett ville vaert saa mye for hoeyt.`,
  ``,
  `HVA «IGJEN AA HENTE» ER, og hva det IKKE er. ev[N] er allerede snittet over`,
  `makkerens kort og talongen, saa den tilfeldigheten er midlet BORT foer`,
  `sammenlikningen - den kan ikke dukke opp som et gap mellom to EV-nivaaer.`,
  `Resten er derfor ren HAANDVURDERING: hva en perfekt mu ville hentet med`,
  `noeyaktig den informasjonen budgiveren allerede sitter med.`,
  ``,
  `Tallet er litt KONSERVATIVT: A-argmax treffer ikke alltid det sant beste`,
  `budet, saa orakelraden er en nedre grense for det ekte taket.`,
  ``,
];
const tekst = L.join("\n");
console.log(tekst);
mkdirSync(dirname(ut), { recursive: true });
writeFileSync(ut, tekst + "\n");
