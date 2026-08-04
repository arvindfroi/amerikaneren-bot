/**
 * VRAKORAKELET: merker (trumf, vrak)-par offline, med mange verdener.
 *
 *   node examples/vrakorakel.ts --skard 0/10 --kamper 600 --verdener 60 \
 *     --ut vrak-data/skard-0.jsonl
 *
 * HVORFOR OFFLINE ER NOE HELT ANNET ENN SANNTID. `examples/vrakbenk.ts` målte
 * søket ved vrak til **−0,5119 ± 0,2501** mot NevroHjerne. Årsaken er ikke at
 * framoverblikket er verdiløst — den er at `argmax` over 28 kandidater à 24
 * trukne verdener plukker den som fikk de snilleste verdenene, og at
 * verdensrommet ved vrak er 3,8 × 10¹⁴.
 *
 * Men det er et SANNTIDSPROBLEM. Her har vi råd til 60+ verdener per kandidat,
 * og – viktigere – støyen som er igjen midles bort over tusenvis av rader når
 * en modell trenes på dem. Nøyaktig samme mekanisme som gjorde SD-orakelet til
 * en god LÆRER for forsvarsspillet (+0,187) selv om det er en dårlig SPILLER
 * der (−0,09).
 *
 * FELLES VERDENER PER STILLING. Alle kandidatene i én stilling evalueres i
 * NØYAKTIG de samme trukne hendene. Da er forskjellen mellom to kandidater
 * parret, og verden-effekten – «denne giva var snill mot alle» – kansellerer.
 * Trekkes nye verdener per kandidat, måler man hvilke hender som tilfeldigvis
 * ble trukket.
 *
 * FORMATET: én linje per STILLING, med alle kandidatene og verdiene deres.
 * Da kan treneren lære å RANGERE dem mot hverandre, ikke bare å gjette et
 * absolutt tall – og rangering er det valget faktisk krever.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { lagRng, FARGER, type Farge, type Kort } from "../src/kort.ts";
import { lovligeEtterlys, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { Budagent, lesBudmodell } from "../src/moe2/budagent.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { lesVrakflagg, type Vrakpolicy } from "../src/moe2/vrakvelg2.ts";
import { vraktrekk } from "../src/moe2/vraktrekk.ts";
import { BOTTABELL, Motstandermodell } from "../src/moe2/motstander.ts";

let utFil = "vrak-data/skard-0.jsonl";
let kamper = 600;
let frøBase = 60_000_000;
let skardI = 0;
let skardN = 1;
let verdener = 60;
let spek = "budm:e1-modell/bud-gbt.json:vakt:abmp:e1:e1-modell/d7alle.bin";
let flagg = "telrd";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--ut") utFil = process.argv[++i]!;
  else if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--skard") {
    const [x, y] = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(x);
    skardN = Number(y);
  } else if (a === "--verdener") verdener = Number(process.argv[++i]);
  else if (a === "--spek") spek = process.argv[++i]!;
  else if (a === "--flagg") flagg = process.argv[++i]!;
}

type Agent = { velgHandling(s: GameState): Handling; nyKamp(): void };
function lag(s: string): Agent {
  if (s === "nevro") return new NevroAgent();
  if (s.startsWith("vakt:")) {
    const v = delVaktspek(s);
    if (v === null) throw new Error(`Ugyldig vaktspek «${s}»`);
    return new Konvensjonsvakt(lag(v.indre), v.valg);
  }
  if (s.startsWith("budm:")) {
    const rest = s.slice(5);
    const i = rest.indexOf(":");
    return new Budagent(lag(rest.slice(i + 1)), lesBudmodell(rest.slice(0, i)));
  }
  if (s.startsWith("e1:")) return E1Agent.fraFil(s.slice(3));
  throw new Error(`Ukjent spek «${s}»`);
}

const pol: Vrakpolicy = lesVrakflagg(flagg);
const nøkkel = (k: Kort): string => `${k.farge}${k.verdi}`;

/** Samme kandidatgenerering som `Vrakvelger2` – policyene, ikke en heuristikk. */
function kandidater(hånd: readonly Kort[], trumf: Farge, antall: number): Kort[][] {
  const pool = hånd.filter(
    (k) =>
      !(pol.ikkeTrumf && k.farge === trumf) &&
      !(pol.ikkeEss && k.verdi === 14) &&
      !(pol.ikkeKonge && k.verdi === 13),
  );
  if (pool.length < antall) return [];
  const lavest = pool.slice().sort((a, b) => a.verdi - b.verdi);
  const ut: Kort[][] = [];
  const sett = new Set<string>();
  const legg = (v: Kort[]): void => {
    if (v.length !== antall) return;
    const n = v.map(nøkkel).sort().join(",");
    if (!sett.has(n)) {
      sett.add(n);
      ut.push(v);
    }
  };
  const perFarge = new Map<Farge, Kort[]>();
  for (const k of hånd) perFarge.set(k.farge, [...(perFarge.get(k.farge) ?? []), k]);
  if (pol.laveste) legg(lavest.slice(0, antall));
  const forbudt = (k: Kort): boolean =>
    (pol.ikkeEss && k.verdi === 14) || (pol.ikkeKonge && k.verdi === 13);
  const korte = [...perFarge.entries()]
    .filter(([f, ks]) => f !== trumf && ks.length <= antall && !ks.some(forbudt))
    .sort((a, b) => a[1].length - b[1].length);
  if (pol.renonse) for (const [f, ks] of korte) {
    legg([...ks, ...lavest.filter((k) => k.farge !== f).slice(0, antall - ks.length)]);
  }
  if (pol.dobbelRenonse) for (let i = 0; i < korte.length; i++) {
    for (let j = i + 1; j < korte.length; j++) {
      const a = korte[i]![1];
      const b = korte[j]![1];
      if (a.length + b.length > antall) continue;
      const brukt = new Set([...a, ...b].map(nøkkel));
      legg([...a, ...b, ...lavest.filter((k) => !brukt.has(nøkkel(k))).slice(0, antall - a.length - b.length)]);
    }
  }
  return ut;
}

const agent = lag(spek);
const motpart = lag(spek);
/** Egen NevroHjerne, brukt bare til å hente DENS (trumf, vrak) som kandidat. */
const nevroRef = new NevroAgent();

/** NevroHjernes eget par: dens vrak, og trumfen den ville valgt etterpå. */
function nevroValg(
  s: GameState,
  sete: number,
  hånd: readonly Kort[],
  antall: number,
): { trumf: Farge; vrak: Kort[] } | null {
  const h = nevroRef.velgHandling(s);
  if (h.type !== "VRAK") return null;
  const vrak = h.kort.slice();
  // Trumfen NevroHjerne ville valgt: den regner den av hånden som BLIR IGJEN,
  // så den må simuleres for å bli riktig.
  const etter = utfør(s, { type: "VRAK", spiller: sete, kort: vrak }).state;
  const v = nevroRef.velgHandling(etter);
  if (v.type !== "VELG") return null;
  return { trumf: v.trumf, vrak };
}
const prior = new Motstandermodell(BOTTABELL);
const rng = lagRng((frøBase + skardI * 7919) >>> 0);
mkdirSync(dirname(utFil), { recursive: true });

let merket = 0;
const t0 = performance.now();
for (let i = skardI; i < kamper; i += skardN) {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frøBase + i * 6151);
  agent.nyKamp();
  motpart.nyKamp();
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 600) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;

    if (s.fase === "VRAK" && s.budvinner !== null) {
      const sete = s.budvinner;
      const hånd = (s.hender[sete] ?? []).slice();
      const antall = s.giving.talong;
      const par: { trumf: Farge; vrak: Kort[]; nevro?: boolean }[] = [];
      for (const trumf of FARGER) {
        for (const vrak of kandidater(hånd, trumf, antall)) par.push({ trumf, vrak });
      }
      // DET INDRE LAGETS EGET VALG ER ALLTID EN KANDIDAT.
      //
      // MAALT 4. august: policyen «tel» - bare de fire laveste - overstyrte
      // NevroHjerne 897 ganger av 3 000 og maalte -0,5396 +/- 0,1815. Feilen
      // var ikke stoey, den var at KANDIDATENE VAR DAARLIGERE enn det de
      // skulle slaa: NevroHjernes vrak er et NETT som scorer hvert kort,
      // «de fire laveste» er en grov regel.
      //
      // Med dens eget valg i settet laerer modellen aa rangere alternativene
      // MOT den, i stedet for aa late som den ikke finnes. En modell som ikke
      // kan velge det bestaaende kan bare gjoere det verre.
      {
        const eget = nevroValg(s, sete, hånd, antall);
        if (eget !== null) {
          const n = eget.vrak.map(nøkkel).sort().join(",");
          const alt = par.find(
            (p) => p.trumf === eget.trumf && p.vrak.map(nøkkel).sort().join(",") === n,
          );
          // MERKES uansett om den var der fra før. Uten merket finnes ingen
          // referanse: modellens anger må måles MOT NevroHjernes egen, ellers
          // vet vi ikke om den er bedre enn det som alt spiller.
          if (alt !== undefined) alt.nevro = true;
          else par.push({ ...eget, nevro: true });
        }
      }
      if (par.length >= 2) {
        // FELLES verdener for alle kandidatene i denne stillingen.
        const verd = trekkVerdener(s, sete, verdener, rng, {
          logVekt: (sp, bud, h) => prior.logVekt(sp, bud, h),
        });
        if (verd.length >= 4) {
          const rader = par.map((p) => {
            let sum = 0;
            for (const hender of verd) {
              let x = utfør(medVerden(s, hender, sete), {
                type: "VRAK",
                spiller: sete,
                kort: p.vrak,
              }).state;
              const kand = lovligeEtterlys(x, p.trumf);
              x = utfør(x, {
                type: "VELG",
                spiller: sete,
                trumf: p.trumf,
                etterlyst: kand.length > 0 ? kand[kand.length - 1]! : null,
              }).state;
              let vakt = 0;
              while (x.fase !== "FERDIG" && x.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
                x = utfør(x, motpart.velgHandling(x)).state;
              }
              const egne = x.totalPoeng[sete] ?? 0;
              sum += egne - (x.totalPoeng.reduce((a, b) => a + b, 0) - egne) / 3;
            }
            return {
              t: Array.from(vraktrekk(s, sete, hånd, p.vrak, p.trumf), (z) =>
                Math.round(z * 10_000) / 10_000,
              ),
              v: Math.round((sum / verd.length) * 1000) / 1000,
              ...(p.nevro === true ? { nevro: 1 } : {}),
            };
          });
          appendFileSync(
            utFil,
            JSON.stringify({ frø: frøBase + i * 6151, n: verd.length, kand: rader }) + "\n",
            "utf-8",
          );
          merket++;
        }
      }
    }
    s = utfør(s, agent.velgHandling(s)).state;
  }
  if (merket % 25 === 0 && merket > 0) {
    process.stdout.write(`\r  skard ${skardI}: ${merket} stillinger   `);
  }
}
console.log(
  `\nFerdig: ${merket} stillinger, ${verdener} verdener per kandidat, ` +
    `${((performance.now() - t0) / 1000).toFixed(0)}s → ${utFil}`,
);
