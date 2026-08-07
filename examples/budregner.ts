/**
 * LØNNER DET SEG Å REGNE PÅ BUDET – og hvor mye regning trengs?
 *
 *   node examples/budregner.ts --hender 600 --skard 0/10
 *
 * ARVINDS SPØRSMÅL: «hvordan ser det ut hvis den regner da? er ikke det
 * bedre?»
 *
 * Å REGNE betyr her det opplagte: hold dine 12 kort fast, del ut de 40 andre
 * på nytt K ganger, spill ut hvert kandidatbud i hver trekning, og by det som
 * ga mest. Ingen destillert policy, ingen håndlagde regler – ren utregning.
 *
 * HVORFOR DET IKKE ER OPPLAGT AT DET ER BEDRE. Med endelig K er hvert anslag
 * støyete, og argmax over seks støyete tall plukker den heldigste MÅLINGEN
 * like mye som det beste BUDET. Halvdelstesten i `buddata.ts` målte nettopp
 * det: en regner med 12 trekninger er −0,825 mot «by alltid 9». Regnestykket
 * er altså ikke gratis – det må ha nok trekninger til å overdøve sin egen
 * støy før det er verdt noe.
 *
 * DESIGNET, og hele poenget er at valg og måling ikke deler trekninger:
 *
 *   240 trekninger per hånd, delt i to blokker med vanntett skott
 *     VELGEBLOKKEN   de første 120: regneren får bruke K av dem
 *     MÅLEBLOKKEN    de siste 120: ALLE policyer leses av på nøyaktig disse
 *
 * Da er støyen regneren valgte på uavhengig av støyen den måles med, og
 * vinnerens forbannelse kan ikke smitte inn. Kurven over K svarer så direkte
 * på «hvor mye regning trengs».
 *
 * REFERANSEN er «by alltid 9» – den beste FASTE handlingen. En regner som
 * ikke slår en konstant har ikke betalt for regnestykket sitt.
 *
 * KOSTNADEN SKAL LESES SAMMEN MED GEVINSTEN. K trekninger betyr 6·K fulle
 * runder spilt ut per budbeslutning. Ved K = 96 er det 576 runder for ETT bud.
 * En gevinst som først kommer ved K = 96 er ikke gratis selv om den er ekte.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { lovligeHandlinger, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { AMERIKANER, SOLO, type Bud } from "../src/regler.ts";
import { lagRng, nyStokk, stokk, kortId, type Kort } from "../src/kort.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";

let hender = 600;
let skardI = 0;
let skardN = 1;
let frøBase = 160_000_000;
let kandidatSpek = "vakt:abm:e1:e1-modell/d7alle.bin";
let ut: string | null = null;
let rapport: string | null = null;
/** Trekninger i velgeblokken og i måleblokken. Like store, vanntett skott. */
const VELG = 120;
const MÅL = 120;
const BUD = [7, 8, 9, 10, 11];
/**
 * AMERIKANER og SOLO kodes som -1 og -2, siden 0 er PASS og 7-11 er tallbud.
 *
 * ARVIND: «ikke slik at den aldri byr amerikaneren og solo amerikaneren».
 * Atferdsprofilen bekrefter at boten melder dem i 0 % av 1 409 beslutninger.
 * Innsatsene er store nok til at det maa maales og ikke antas:
 *
 *   amerikaner   budvinner +/-50, makker +/-25   krever ALLE 12 stikk
 *   solo         budvinner +/-100                krever alle 12 ALENE
 *
 * mot et vanlig bud 9 sine +/-18. En amerikaner som gaar inn er verdt nesten
 * tre bud 9. Spoersmaalet er hvor ofte den gaar inn.
 */
const AMK = -1;
const SOL = -2;
const HANDLINGER = [0, ...BUD, AMK, SOL];
/** K-verdiene kurven måles på. Må alle være ≤ VELG. */
const K_ER = [3, 6, 12, 24, 48, 120];

for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--hender") hender = Number(process.argv[++i]);
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--kandidat") kandidatSpek = process.argv[++i]!;
  else if (a === "--ut") ut = process.argv[++i] ?? null;
  else if (a === "--rapport") rapport = process.argv[++i]!;
  else if (a === "--skard") {
    const [x, y] = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(x);
    skardN = Number(y);
  }
}

interface Rad {
  frø: number;
  /** Handling → verdier i VELGEBLOKKEN (VELG tall) og MÅLEBLOKKEN (snitt). */
  velg: Record<string, number[]>;
  mål: Record<string, number>;
}

// --- Rapport ----------------------------------------------------------------
if (rapport !== null) {
  const rader: Rad[] = [];
  for (const f of rapport.split(",")) {
    for (const l of readFileSync(f, "utf8").split("\n")) {
      if (l.trim() === "") continue;
      try {
        rader.push(JSON.parse(l) as Rad);
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
  // Fast referanse: den handlingen som er best i snitt over MAALEBLOKKEN.
  let fast = HANDLINGER[0]!;
  let fv = -Infinity;
  for (const h of HANDLINGER) {
    const v = snitt(rader.map((r) => r.mål[String(h)] ?? 0));
    if (v > fv) {
      fv = v;
      fast = h;
    }
  }
  const navn = (k: number): string =>
    k === 0 ? "PASS" : k === AMK ? "AMERIKANER" : k === SOL ? "SOLO" : `bud ${k}`;
  const linjer = [
    `\n=== Loenner det seg aa REGNE paa budet? ===`,
    `${rader.length} hender. Kandidat i eget sete: ${kandidatSpek}.`,
    `${VELG} trekninger aa velge paa, ${MÅL} HELT ANDRE aa maale paa.`,
    `Referanse: den beste FASTE handlingen (${navn(fast)}).`,
    ``,
    `HVER HANDLING FOR SEG, snitt over maaleblokken. Dette svarer paa Arvinds`,
    `spoersmaal om hvorfor boten aldri melder amerikaner eller solo.`,
    ``,
    `handling        forventet poengdiff   beste paa saa mange hender`,
    `-----------------------------------------------------------------`,
    ...HANDLINGER.map((h) => {
      const v = rader.map((r) => r.mål[String(h)] ?? NaN).filter(Number.isFinite);
      const beste = rader.filter((r) => {
        let b = HANDLINGER[0]!;
        for (const g of HANDLINGER) if ((r.mål[String(g)] ?? -1e9) > (r.mål[String(b)] ?? -1e9)) b = g;
        return b === h;
      }).length;
      return `${navn(h).padEnd(14)} ${snitt(v).toFixed(3).padStart(14)}        ` +
        `${((100 * beste) / Math.max(1, rader.length)).toFixed(1).padStart(6)} %`;
    }),
    `-----------------------------------------------------------------`,
    ``,
    `K = trekninger regneren faar bruke. Kostnad = ${HANDLINGER.length}·K fulle runder per bud.`,
    ``,
    `   K   runder/bud   mot «${navn(fast)}»              velger ${navn(fast)} i`,
    `--------------------------------------------------------------------`,
  ];
  for (const K of K_ER) {
    const d: number[] = [];
    let sammeSomFast = 0;
    for (const r of rader) {
      let beste = HANDLINGER[0]!;
      let bv = -Infinity;
      for (const h of HANDLINGER) {
        const v = snitt((r.velg[String(h)] ?? []).slice(0, K));
        if (v > bv) {
          bv = v;
          beste = h;
        }
      }
      if (beste === fast) sammeSomFast++;
      d.push((r.mål[String(beste)] ?? 0) - (r.mål[String(fast)] ?? 0));
    }
    const m = snitt(d);
    linjer.push(
      `${String(K).padStart(4)}   ${String(HANDLINGER.length * K).padStart(10)}   ` +
        `${(m >= 0 ? "+" : "") + m.toFixed(3)} ± ${se(d).toFixed(3)}  (${(m / se(d)).toFixed(1)} SE)   ` +
        `${((100 * sammeSomFast) / rader.length).toFixed(0).padStart(6)} %`,
    );
  }
  // Taket: velg med MAALEBLOKKEN selv. Etterpaaklokskap - og skal leses som det.
  const tak: number[] = [];
  for (const r of rader) {
    let b = HANDLINGER[0]!;
    for (const h of HANDLINGER) if ((r.mål[String(h)] ?? 0) > (r.mål[String(b)] ?? 0)) b = h;
    tak.push((r.mål[String(b)] ?? 0) - (r.mål[String(fast)] ?? 0));
  }
  linjer.push(
    `--------------------------------------------------------------------`,
    `  ∞   (etterpaaklokskap paa maaleblokken)  +${snitt(tak).toFixed(3)}  <- IKKE oppnaaelig`,
    ``,
    `LESEVEILEDNING. Raden nederst er argmax paa de SAMME tallene den leses av`,
    `paa, altsaa vinnerens forbannelse i ren form. Den er tatt med som en`,
    `paaminnelse om hvor stor forskjellen er paa «tak» og «oppnaaelig», ikke`,
    `som et maal aa sikte mot.`,
    ``,
    `En K-rad som er negativ betyr at regneren med saa mange trekninger er`,
    `DAARLIGERE enn aa by det samme hver gang. Da koster stoeyen i regnestykket`,
    `mer enn informasjonen det henter.`,
  );
  const tekst = linjer.join("\n");
  console.log(tekst);
  writeFileSync(rapport.split(",")[0]!.replace(/-\d+\.jsonl$/, ".txt"), tekst + "\n");
  process.exit(0);
}

// --- Innsamling -------------------------------------------------------------
const utFil = ut ?? `bud-regner/skard-${skardI}.jsonl`;
mkdirSync(dirname(utFil), { recursive: true });
const nevro = new NevroAgent();
type Velger = { nyKamp(): void; velgHandling(s: GameState): Handling };
function lagKandidat(spec: string): () => Velger {
  const vakt = delVaktspek(spec);
  if (vakt !== null) {
    const indre = lagKandidat(vakt.indre);
    return () => new Konvensjonsvakt(indre(), vakt.valg);
  }
  if (spec === "nevro") return () => new NevroAgent();
  if (spec.startsWith("e1:")) {
    const nett = lesE1Nett(spec.slice(3));
    return () => new E1Agent(nett);
  }
  throw new Error("ukjent agentspesifikasjon: " + spec);
}
const lagBot = lagKandidat(kandidatSpek);

function omtrekk(mal: GameState, sete: number, hånd: readonly Kort[], rng: () => number): GameState {
  const mine = new Set(hånd.map(kortId));
  const resten = stokk(
    nyStokk().filter((k) => !mine.has(kortId(k))),
    rng,
  );
  const hender2 = mal.hender.map((h, i) => (i === sete ? hånd.slice() : h.slice()));
  let j = 0;
  for (let p = 0; p < mal.antallSpillere; p++) {
    if (p === sete) continue;
    hender2[p] = resten.slice(j, j + (mal.hender[p] ?? []).length);
    j += (mal.hender[p] ?? []).length;
  }
  return { ...mal, hender: hender2, talong: resten.slice(j, j + mal.giving.talong) };
}

/** Poengdifferansen for `sete` etter aa ha bydd `mittBud` (null = pass). */
/** Handlingskoden til det budet motoren forstaar. */
function budAv(handling: number): Bud | null {
  if (handling === 0) return null;
  if (handling === AMK) return AMERIKANER;
  if (handling === SOL) return SOLO;
  return handling;
}

function spill(giv: GameState, sete: number, mittBud: Bud | null): number | null {
  let s = giv;
  let harBydd = false;
  let g = 0;
  while (s.fase === "BUDRUNDE" && g++ < 40) {
    if (s.iTur === null) break;
    if (s.iTur === sete) {
      const lov = lovligeHandlinger(s);
      const kan =
        !harBydd && mittBud !== null && lov.fase === "BUDRUNDE" && lov.bud.some((b) => b === mittBud);
      if (kan) {
        harBydd = true;
        s = utfør(s, { type: "BUD", spiller: sete, bud: mittBud }).state;
      } else s = utfør(s, { type: "BUD", spiller: sete, bud: "PASS" }).state;
    } else s = utfør(s, nevro.velgHandling(s)).state;
  }
  if (s.fase === "BUDRUNDE" || s.budvinner === null) return null;
  const seter = [0, 1, 2, 3].map(() => lagBot());
  for (const b of seter) b.nyKamp();
  g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    s = utfør(s, seter[iTur]!.velgHandling(s)).state;
  }
  const p = s.totalPoeng;
  const egne = p[sete] ?? 0;
  return egne - (p.reduce((a, x) => a + x, 0) - egne) / 3;
}

const rng = lagRng((frøBase + skardI * 7919) >>> 0);
let n = 0;
for (let h = 0; h < hender; h++) {
  if (h % skardN !== skardI) continue;
  const mal = opprettSpill({ antallSpillere: 4 }, (frøBase + h) >>> 0);
  const sete = (mal.giver + 1) % mal.antallSpillere;
  const hånd = mal.hender[sete] ?? [];
  if (hånd.length === 0 || mal.fase !== "BUDRUNDE") continue;

  // SAMME trekninger for alle handlingene – ellers domineres forskjellen
  // mellom to bud av hvilke gir som tilfeldigvis ble trukket til hvert.
  const giver: GameState[] = [];
  for (let k = 0; k < VELG + MÅL; k++) giver.push(omtrekk(mal, sete, hånd, rng));

  const velg: Record<string, number[]> = {};
  const mål: Record<string, number> = {};
  let ok = true;
  for (const handling of HANDLINGER) {
    const v: number[] = [];
    const m: number[] = [];
    for (let k = 0; k < giver.length; k++) {
      const r = spill(giver[k]!, sete, budAv(handling));
      if (r === null) continue;
      if (k < VELG) v.push(Math.round(r * 1000) / 1000);
      else m.push(r);
    }
    if (v.length < VELG / 2 || m.length < MÅL / 2) {
      ok = false;
      break;
    }
    velg[String(handling)] = v;
    mål[String(handling)] = Math.round((m.reduce((a, x) => a + x, 0) / m.length) * 1000) / 1000;
  }
  if (!ok) continue;

  appendFileSync(utFil, JSON.stringify({ frø: (frøBase + h) >>> 0, velg, mål } satisfies Rad) + "\n");
  n++;
  process.stdout.write(`\r  skard ${skardI}: ${n} hender   `);
}
console.log(`\nSkard ${skardI} ferdig: ${n} hender → ${utFil}`);
