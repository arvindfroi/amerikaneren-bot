/**
 * BORDPROFIL: hvordan ser spillet ut når fire av VÅR beste bot møter seg selv?
 *
 *   node examples/bordprofil.ts --kamper 400 --skard 0/8
 *
 * ARVINDS SPØRSMÅL: «kan du måle våres best i dag og se hvordan den gjør det
 * på et bord mot seg selv.»
 *
 * HVA SELVSPILL KAN OG IKKE KAN SVARE PÅ. Det kan ikke rangere boten – med
 * fire like agenter er forventet poeng per sete likt av ren symmetri, og et
 * «resultat» ville bare målt hvem giveren favoriserer. Det selvspill KAN gjøre
 * er å beskrive spillet boten faktisk produserer: hvor ofte kontrakter går
 * inn, på hvilket nivå den melder, hvor poengene havner mellom rollene, og
 * hvor stor slakk den spiller med.
 *
 * DE TALLENE ER SAMMENLIGNBARE MED MENNESKENE. Fra 812 loggede familierunder
 * (`analyse/menneskedata-2026-08-01.md`): kontrakten går inn i 83,2 % av
 * rundene mennesket melder selv, snittbudet er 8,95, og slakken er +0,75
 * stikk. MesterAI innfrir 73 % (`docs/moe2.md`). Bordprofilen setter boten på
 * nøyaktig den samme skalaen.
 *
 * SYMMETRIKONTROLLEN er ikke pynt. Med fire like agenter SKAL poengene fordele
 * seg likt over de fire setene når man midler over nok givere. Gjør de ikke
 * det, er det enten en posisjonsfordel i reglene – som i så fall er verdt å
 * kjenne – eller en feil i benken. Uten kontrollen vet vi ikke hvilken.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";

let kamper = 400;
let skardI = 0;
let skardN = 1;
let frøBase = 20_000_000;
let kandidatSpek = "vakt:abmp:e1:e1-modell/sd-r2.bin";
let ut = "analyse/bordprofil-0.jsonl";
let rapport: string | null = null;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--kandidat") kandidatSpek = process.argv[++i]!;
  else if (a === "--ut") ut = process.argv[++i]!;
  else if (a === "--rapport") rapport = process.argv[++i]!;
  else if (a === "--skard") {
    const [x, y] = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(x);
    skardN = Number(y);
  }
}

interface Runde {
  frø: number;
  rundeNr: number;
  /** Budtallet, eller 0 for amerikaner/solo (se `melding`). */
  bud: number;
  melding: string;
  budvinner: number;
  makker: number | null;
  lagStikk: number;
  klart: number;
  /** Poeng denne runden, per sete. */
  delta: number[];
  /** Setet som ÅPNET budrunden – for symmetrikontrollen. */
  førsteBudgiver: number;
}

// --- Rapport ----------------------------------------------------------------
if (rapport !== null) {
  const r: Runde[] = [];
  for (const f of rapport.split(",")) {
    for (const l of readFileSync(f, "utf8").split("\n")) {
      if (l.trim() === "") continue;
      try {
        r.push(JSON.parse(l) as Runde);
      } catch {
        continue;
      }
    }
  }
  const snitt = (v: readonly number[]): number => (v.length === 0 ? 0 : v.reduce((a, x) => a + x, 0) / v.length);
  const se = (v: readonly number[]): number => {
    if (v.length < 2) return NaN;
    const m = snitt(v);
    let s = 0;
    for (const x of v) s += (x - m) * (x - m);
    return Math.sqrt(s / (v.length - 1) / v.length);
  };
  const tall = r.filter((x) => x.melding === "tall");

  // Poeng per rolle. En runde gir ett tall per sete, sortert etter rolle.
  const bv: number[] = [];
  const mk: number[] = [];
  const fo: number[] = [];
  for (const x of tall) {
    bv.push(x.delta[x.budvinner] ?? 0);
    if (x.makker !== null && x.makker !== x.budvinner) mk.push(x.delta[x.makker] ?? 0);
    for (let p = 0; p < 4; p++) if (p !== x.budvinner && p !== x.makker) fo.push(x.delta[p] ?? 0);
  }

  // Symmetrikontroll: poeng per SETE, og per POSISJON relativt til foerste budgiver.
  const perSete = [0, 1, 2, 3].map((p) => snitt(tall.map((x) => x.delta[p] ?? 0)));
  const perPos = [0, 1, 2, 3].map((d) =>
    snitt(tall.map((x) => x.delta[(x.førsteBudgiver + d) % 4] ?? 0)),
  );

  const budTell = new Map<number, number>();
  for (const x of tall) budTell.set(x.bud, (budTell.get(x.bud) ?? 0) + 1);

  const linjer = [
    `\n=== Bordprofil: fire ${kandidatSpek} mot hverandre ===`,
    `${r.length} runder (${tall.length} med tallmelding).`,
    ``,
    `KONTRAKTEN`,
    `  snittbud                       ${snitt(tall.map((x) => x.bud)).toFixed(2)}`,
    `  kontraktprosent                ${(100 * snitt(tall.map((x) => x.klart))).toFixed(1)} %`,
    `  lagstikk                       ${snitt(tall.map((x) => x.lagStikk)).toFixed(2)}`,
    `  slakk (lagstikk − bud)         ${snitt(tall.map((x) => x.lagStikk - x.bud)).toFixed(2)}`,
    `  amerikaner/solo                ${(100 * (r.length - tall.length)) / Math.max(1, r.length)} %`,
    ``,
    `  TIL SAMMENLIKNING: menneskene innfrir 83,2 % paa snittbud 8,95 med`,
    `  slakk +0,75 (812 loggede runder). MesterAI innfrir 73 %.`,
    ``,
    `POENG PER RUNDE, ETTER ROLLE`,
    `  budvinner                      ${snitt(bv) >= 0 ? "+" : ""}${snitt(bv).toFixed(2)} ± ${se(bv).toFixed(2)}   (n=${bv.length})`,
    `  makker                         ${snitt(mk) >= 0 ? "+" : ""}${snitt(mk).toFixed(2)} ± ${se(mk).toFixed(2)}   (n=${mk.length})`,
    `  forsvarer                      ${snitt(fo) >= 0 ? "+" : ""}${snitt(fo).toFixed(2)} ± ${se(fo).toFixed(2)}   (n=${fo.length})`,
    `  sum over alle fire setene      ${(snitt(bv) + snitt(mk) + 2 * snitt(fo)).toFixed(2)} per runde`,
    ``,
    `BUDFORDELING`,
    ...[...budTell.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([k, n]) => `  bud ${String(k).padStart(2)}                       ${((100 * n) / tall.length).toFixed(1).padStart(5)} %`),
    ``,
    `SYMMETRIKONTROLLEN – med fire like agenter SKAL disse vaere like`,
    `  poeng per sete    ${perSete.map((x) => x.toFixed(2).padStart(7)).join("")}`,
    `  per POSISJON      ${perPos.map((x) => x.toFixed(2).padStart(7)).join("")}   (0 = foerste budgiver)`,
    ``,
    `  Spriker «per sete», er det benken som er skjev. Spriker «per posisjon»`,
    `  mens setene er like, er det en EKTE posisjonsfordel i reglene – og da er`,
    `  det verdt aa vite hvilken plass ved bordet som loenner seg.`,
  ];
  const tekst = linjer.join("\n");
  console.log(tekst);
  writeFileSync(rapport.split(",")[0]!.replace(/-\d+\.jsonl$/, ".txt"), tekst + "\n");
  process.exit(0);
}

// --- Innsamling -------------------------------------------------------------
mkdirSync(dirname(ut), { recursive: true });
const vakt = delVaktspek(kandidatSpek);
const nett = vakt !== null ? lesE1Nett(vakt.indre.slice(3)) : null;
const lagBot = (): { velgHandling(s: GameState): Handling; nyKamp(): void } =>
  vakt !== null && nett !== null ? new Konvensjonsvakt(new E1Agent(nett), vakt.valg) : new NevroAgent();

let n = 0;
for (let f = 0; f < kamper; f++) {
  if (f % skardN !== skardI) continue;
  const frø = frøBase + f;
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  const seter = [0, 1, 2, 3].map(() => lagBot());
  for (const b of seter) b.nyKamp();

  let g = 0;
  let førPoeng = s.totalPoeng.slice();
  let rundeNr = s.rundeNr;
  let førsteBudgiver = (s.giver + 1) % 4;
  while (s.fase !== "FERDIG" && g++ < 40_000) {
    if (s.fase === "RUNDE_SLUTT") {
      // Runden er over: les av hva den ga, og skriv linjen.
      const delta = s.totalPoeng.map((p, i) => p - (førPoeng[i] ?? 0));
      const stikk = s.stikkVunnet;
      const lagStikk =
        s.budvinner === null ? 0 : (stikk[s.budvinner] ?? 0) + (s.makker !== null ? (stikk[s.makker] ?? 0) : 0);
      const bud = s.melding?.type === "tall" ? s.melding.bud : 0;
      if (s.budvinner !== null) {
        appendFileSync(
          ut,
          JSON.stringify({
            frø,
            rundeNr,
            bud,
            melding: s.melding?.type ?? "ingen",
            budvinner: s.budvinner,
            makker: s.makker,
            lagStikk,
            klart: s.melding?.type === "tall" ? (lagStikk >= bud ? 1 : 0) : 0,
            delta,
            førsteBudgiver,
          } satisfies Runde) + "\n",
        );
        n++;
      }
      s = utfør(s, { type: "NESTE" }).state;
      førPoeng = s.totalPoeng.slice();
      rundeNr = s.rundeNr;
      førsteBudgiver = (s.giver + 1) % 4;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    s = utfør(s, seter[iTur]!.velgHandling(s)).state;
  }
  process.stdout.write(`\r  skard ${skardI}: ${n} runder   `);
}
console.log(`\nSkard ${skardI} ferdig: ${n} runder → ${ut}`);
