/**
 * BUDET SOM ET KVANTITATIVT PROBLEM: estimer FORDELINGEN, ikke seks snitt.
 *
 *   node examples/budkvant.ts --hender 2000 --skard 0/10
 *
 * ARVIND: «den må jo bli sykt god til å by ... de kan ikke kjøre den avanserte
 * matematikken og den optimale risikovurderingen. det er derfor jeg har troen
 * på quant-løsninger.»
 *
 * HAN HAR RETT, OG ESTIMATOREN MIN HAR VÆRT DÅRLIG. `buddata`/`budregner`
 * spiller ut hvert bud for seg og tar argmax over seks–åtte støyete
 * gjennomsnitt. Det er den mest støyutsatte formen som finnes, og den ble målt
 * deretter: en regner med 12 trekninger er −0,53 mot en konstant, og først
 * rundt K = 48–60 tjener den noe.
 *
 * =================== HVA EN KVANTITATIV LØSNING GJØR I STEDET =============
 *
 * 1. ÉN FORDELING, ALLE BUD. Utbetalingen er kjent i lukket form:
 *
 *        EV(bud N) = 2N · (2·P(lagstikk ≥ N) − 1)
 *
 *    Det trengs altså ikke seks estimater – det trengs ÉN: fordelingen av
 *    lagstikk. Fra de SAMME K utspillingene regnes P(N) for hver eneste N.
 *    Åtte ganger billigere, og – viktigere – estimatene for ulike N er nå
 *    perfekt korrelerte fordi de deler utvalg. Differansen mellom to bud, som
 *    er alt argmax bryr seg om, blir nesten støyfri.
 *
 * 2. PARAMETRISK HALE. Med 12 trekninger er empirisk P(≥11) enten 0/12 eller
 *    1/12. Det er ikke et anslag, det er en mynt. En tilpasset normal­fordeling
 *    med kontinuitetskorreksjon gir et glatt haleanslag av samme data.
 *
 * 3. KRYMPING. Hver hånds (μ, σ) trekkes mot populasjonen i forhold til hvor
 *    støyete den er – James–Stein. Det angriper vinnerens forbannelse direkte
 *    i stedet for å håpe at flere trekninger overdøver den.
 *
 * ================= HVORFOR ÉN FORDELING ER LOV HER ========================
 *
 * Innvendingen mot å bruke ÉN kontrakt til å anslå alle er at spilleføringen
 * avhenger av kontrakten: en som har meldt 11 tar sjanser en som har meldt 8
 * ikke tar. Da ville P(N) målt under kontrakt 9 vært feil for N = 11.
 *
 * MEN VI HAR MÅLT AT BOTEN ER KONTRAKTBLIND. `analyse/budflaks.txt`: lagstikk
 * er 9,21 / 9,23 / 9,21 / 9,23 / 9,24 for bud 7 / 8 / 9 / 10 / 11. Den spiller
 * likt uansett hva den har meldt. Det er en DEFEKT i kortspillet – og nettopp
 * derfor er antakelsen her gyldig. Blir kortspillet kontraktbevisst (fase 0 i
 * `docs/budplan.md`), må denne antakelsen måles på nytt. Det står som en
 * eksplisitt betingelse, ikke som en forutsetning vi har glemt.
 *
 * ================= BUDRUNDEN LEVER I ET EGET LEDD =========================
 *
 * Et bud som ikke vinner budrunden er verdt det samme som å passe – `bud 7`
 * vinner kontrakten 0 % av gangene (`analyse/budhandling.txt`). Derfor:
 *
 *     EV(bud N) = P(vinner budrunden med N) · 2N·(2P(N)−1)
 *               + (1 − P(vinner med N)) · EV(forsvar)
 *
 * `P(vinner med N)` avhenger nesten bare av hva de ANDRE har, ikke av vår egen
 * hånd, så den estimeres én gang over populasjonen i stedet for per hånd.
 * EV(forsvar) måles med en egen liten arm.
 *
 * Denne fila SAMLER dataene som trengs: per hånd én sky av lagstikk fra
 * utspillinger, og en passarm. Estimatoren selv er ren regning og ligger i
 * rapportmodus, så den kan endres uten å generere data på nytt.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { lovligeHandlinger, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { lagRng, nyStokk, stokk, kortId, type Kort } from "../src/kort.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { handTrekk, HAND_DIM } from "../src/moe2/handtrekk.ts";

let hender = 2000;
let skardI = 0;
let skardN = 1;
let frøBase = 180_000_000;
let kandidatSpek = "vakt:abmp:e1:e1-modell/d7alle.bin";
/** Kontrakten stikkfordelingen samples under. Se «kontraktblind» over. */
let referanse = 9;
/** Trekninger til stikkfordelingen, og til passarmen. */
let trekninger = 40;
let ut: string | null = null;
let rapport: string | null = null;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--hender") hender = Number(process.argv[++i]);
  else if (a === "--trekninger") trekninger = Number(process.argv[++i]);
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--referanse") referanse = Number(process.argv[++i]);
  else if (a === "--kandidat") kandidatSpek = process.argv[++i]!;
  else if (a === "--ut") ut = process.argv[++i] ?? null;
  else if (a === "--rapport") rapport = process.argv[++i]!;
  else if (a === "--skard") {
    const [x, y] = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(x);
    skardN = Number(y);
  }
}

const BUD = [7, 8, 9, 10, 11, 12];

interface Rad {
  frø: number;
  /** Håndtrekkene, så en modell kan trenes på det samme datasettet. */
  t: number[];
  /** Lagstikk i hver utspilling under referansekontrakten. VELGEBLOKK. */
  stikkA: number[];
  /** Samme, uavhengige trekninger. MÅLEBLOKK – aldri brukt til å velge. */
  stikkB: number[];
  /** Poengdifferanse når setet PASSER. Velge- og måleblokk. */
  passA: number[];
  passB: number[];
  /** Vant setet budrunden med bud N? Andel over måleblokken. */
  vantMed: Record<string, number>;
}

// --- Rapport: selve estimatoren --------------------------------------------
if (rapport !== null) {
  const R: Rad[] = [];
  for (const f of rapport.split(",")) {
    for (const l of readFileSync(f, "utf8").split("\n")) {
      if (l.trim() === "") continue;
      try {
        const r = JSON.parse(l) as Rad;
        if (r.stikkA?.length > 1 && r.stikkB?.length > 1) R.push(r);
      } catch {
        continue;
      }
    }
  }
  const snitt = (v: readonly number[]): number => (v.length === 0 ? 0 : v.reduce((a, x) => a + x, 0) / v.length);
  const sd = (v: readonly number[]): number => {
    if (v.length < 2) return 1;
    const m = snitt(v);
    let s = 0;
    for (const x of v) s += (x - m) * (x - m);
    return Math.sqrt(s / (v.length - 1));
  };
  const seOf = (v: readonly number[]): number => sd(v) / Math.sqrt(Math.max(1, v.length));

  /** Normalfordelingens halesannsynlighet, Abramowitz–Stegun 7.1.26. */
  function Φ(z: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
    const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return z >= 0 ? 1 - p : p;
  }

  // POPULASJONEN, til krymping og til budrunde-sannsynligheten.
  const alleμ = R.map((r) => snitt(r.stikkA));
  const μ0 = snitt(alleμ);
  const σ0 = sd(alleμ); // spredning MELLOM hender = det ekte signalet
  const σStøy = snitt(R.map((r) => seOf(r.stikkA))); // støy i hvert anslag
  // James–Stein-vekt: hvor mye av avviket fra populasjonen vi tror på.
  const κ = (σ0 * σ0) / (σ0 * σ0 + σStøy * σStøy);
  const σInnen = snitt(R.map((r) => sd(r.stikkA)));
  const vant: Record<number, number> = {};
  for (const N of BUD) vant[N] = snitt(R.map((r) => r.vantMed[String(N)] ?? 0));

  /** Kvant-estimatoren. Ser BARE velgeblokken. */
  function velg(r: Rad, K: number, medKrymping: boolean, medParametrisk: boolean): number {
    const s = r.stikkA.slice(0, K);
    if (s.length === 0) return 0;
    const rå = snitt(s);
    const μ = medKrymping ? μ0 + κ * (rå - μ0) : rå;
    const σ = medParametrisk ? Math.max(0.5, σInnen) : Math.max(0.5, sd(s));
    const evPass = snitt(r.passA.slice(0, K));
    let beste = 0;
    let bv = evPass;
    for (const N of BUD) {
      const P = medParametrisk
        ? 1 - Φ((N - 0.5 - μ) / σ) // kontinuitetskorreksjon
        : s.filter((x) => x >= N).length / s.length;
      const evKontrakt = 2 * N * (2 * P - 1);
      const p = vant[N] ?? 0;
      const ev = p * evKontrakt + (1 - p) * evPass;
      if (ev > bv) {
        bv = ev;
        beste = N;
      }
    }
    return beste;
  }

  /** Verdien av å by N, lest av på MÅLEBLOKKEN. Aldri brukt til å velge. */
  function fasit(r: Rad, N: number): number {
    if (N === 0) return snitt(r.passB);
    const P = r.stikkB.filter((x) => x >= N).length / r.stikkB.length;
    const p = vant[N] ?? 0;
    return p * (2 * N * (2 * P - 1)) + (1 - p) * snitt(r.passB);
  }

  let fast = 0;
  let fv = -Infinity;
  for (const N of [0, ...BUD]) {
    const v = snitt(R.map((r) => fasit(r, N)));
    if (v > fv) {
      fv = v;
      fast = N;
    }
  }

  const linjer = [
    `\n=== Budet som kvantitativt problem ===`,
    `${R.length} hender. Kandidat: ${kandidatSpek}, referansekontrakt ${referanse}.`,
    `${trekninger} trekninger i velgeblokken, ${trekninger} HELT ANDRE i maaleblokken.`,
    ``,
    `POPULASJONEN`,
    `  snitt lagstikk over hender     ${μ0.toFixed(2)}`,
    `  spredning MELLOM hender        ${σ0.toFixed(3)}   <- det ekte signalet`,
    `  spredning INNEN en haand       ${σInnen.toFixed(3)}   <- flaksen`,
    `  stoey i ett haandanslag        ${σStøy.toFixed(3)}`,
    `  krympefaktor kappa             ${κ.toFixed(3)}   (1 = tro anslaget helt)`,
    ``,
    `  Budrunden vinnes med bud N i:  ` +
      BUD.map((N) => `${N}:${(100 * (vant[N] ?? 0)).toFixed(0)}%`).join("  "),
    ``,
    `ESTIMATORER, alle valgt paa velgeblokken og lest av paa maaleblokken.`,
    `Referanse: den beste FASTE handlingen (${fast === 0 ? "PASS" : "bud " + fast}).`,
    ``,
    `   K   naiv argmax        + parametrisk hale    + krymping`,
    `------------------------------------------------------------------------`,
  ];
  for (const K of [6, 12, 24, 40]) {
    if (K > trekninger) continue;
    const kol = ([false, true, true] as boolean[]).map((_, i) => {
      const par = i === 0 ? [false, false] : i === 1 ? [false, true] : [true, true];
      const d = R.map((r) => fasit(r, velg(r, K, par[0]!, par[1]!)) - fasit(r, fast));
      const m = snitt(d);
      return `${(m >= 0 ? "+" : "") + m.toFixed(3)} ± ${seOf(d).toFixed(3)}`;
    });
    linjer.push(`${String(K).padStart(4)}   ${kol[0]!.padEnd(20)}${kol[1]!.padEnd(21)}${kol[2]!}`);
  }
  const tak = snitt(
    R.map((r) => {
      let b = 0;
      for (const N of [0, ...BUD]) if (fasit(r, N) > fasit(r, b)) b = N;
      return fasit(r, b) - fasit(r, fast);
    }),
  );
  linjer.push(
    `------------------------------------------------------------------------`,
    `  tak med etterpaaklokskap paa maaleblokken: +${tak.toFixed(3)}  <- ikke oppnaaelig`,
    ``,
    `LESEVEILEDNING. Kolonnene legger paa ett grep om gangen, saa hvert grep`,
    `kan tilskrives sin egen effekt. «Naiv argmax» er det jeg har gjort hittil,`,
    `bare med den ene forskjellen at alle bud deler utvalg - allerede det er en`,
    `stor variansreduksjon mot budregner.ts, som spilte hvert bud for seg.`,
    ``,
    `Krympefaktoren kappa er tallet som avgjoer alt: er den lav, er stoeyen i`,
    `haandanslaget stoerre enn den ekte forskjellen mellom hender, og da SKAL`,
    `en god estimator by nesten likt hver gang.`,
  );
  const tekst = linjer.join("\n");
  console.log(tekst);
  writeFileSync(rapport.split(",")[0]!.replace(/-\d+\.jsonl$/, ".txt"), tekst + "\n");
  process.exit(0);
}

// --- Innsamling -------------------------------------------------------------
const utFil = ut ?? `bud-kvant/skard-${skardI}.jsonl`;
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
  const h2 = mal.hender.map((h, i) => (i === sete ? hånd.slice() : h.slice()));
  let j = 0;
  for (let p = 0; p < mal.antallSpillere; p++) {
    if (p === sete) continue;
    h2[p] = resten.slice(j, j + (mal.hender[p] ?? []).length);
    j += (mal.hender[p] ?? []).length;
  }
  return { ...mal, hender: h2, talong: resten.slice(j, j + mal.giving.talong) };
}

/** Driver budrunden. Returnerer null hvis ingen kontrakt kom i stand. */
function budrunde(giv: GameState, sete: number, mittBud: number | null): GameState | null {
  let s = giv;
  let bydd = false;
  let g = 0;
  while (s.fase === "BUDRUNDE" && g++ < 40) {
    if (s.iTur === null) break;
    if (s.iTur === sete) {
      const lov = lovligeHandlinger(s);
      const kan = !bydd && mittBud !== null && lov.fase === "BUDRUNDE" && lov.bud.some((b) => b === mittBud);
      if (kan) {
        bydd = true;
        s = utfør(s, { type: "BUD", spiller: sete, bud: mittBud }).state;
      } else s = utfør(s, { type: "BUD", spiller: sete, bud: "PASS" }).state;
    } else s = utfør(s, nevro.velgHandling(s)).state;
  }
  return s.fase === "BUDRUNDE" || s.budvinner === null ? null : s;
}

function spillUt(s0: GameState): GameState {
  let s = s0;
  const seter = [0, 1, 2, 3].map(() => lagBot());
  for (const b of seter) b.nyKamp();
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    s = utfør(s, seter[iTur]!.velgHandling(s)).state;
  }
  return s;
}

const rng = lagRng((frøBase + skardI * 7919) >>> 0);
let n = 0;
for (let h = 0; h < hender; h++) {
  if (h % skardN !== skardI) continue;
  const mal = opprettSpill({ antallSpillere: 4 }, (frøBase + h) >>> 0);
  const sete = (mal.giver + 1) % mal.antallSpillere;
  const hånd = mal.hender[sete] ?? [];
  if (hånd.length === 0 || mal.fase !== "BUDRUNDE") continue;

  const stikkA: number[] = [];
  const stikkB: number[] = [];
  const passA: number[] = [];
  const passB: number[] = [];
  const vantTell: Record<number, number> = {};
  const vantN: Record<number, number> = {};

  for (let k = 0; k < 2 * trekninger; k++) {
    const giv = omtrekk(mal, sete, hånd, rng);
    // STIKKFORDELINGEN under referansekontrakten.
    const s1 = budrunde(giv, sete, referanse);
    if (s1 !== null && s1.budvinner === sete) {
      const f = spillUt(s1);
      const st = f.stikkVunnet;
      const lag = (st[sete] ?? 0) + (f.makker !== null ? (st[f.makker] ?? 0) : 0);
      (k < trekninger ? stikkA : stikkB).push(lag);
    }
    // PASSARMEN.
    const s2 = budrunde(giv, sete, null);
    if (s2 !== null) {
      const f = spillUt(s2);
      const p = f.totalPoeng;
      const egne = p[sete] ?? 0;
      const d = Math.round((egne - (p.reduce((a, x) => a + x, 0) - egne) / 3) * 1000) / 1000;
      (k < trekninger ? passA : passB).push(d);
    }
    // BUDRUNDE-SANNSYNLIGHETEN, bare paa maaleblokken og bare hvert 4. trekk
    // - den avhenger nesten bare av de ANDRES kort og trenger derfor lite n.
    if (k >= trekninger && k % 4 === 0) {
      for (const N of BUD) {
        const s3 = budrunde(giv, sete, N);
        vantN[N] = (vantN[N] ?? 0) + 1;
        if (s3 !== null && s3.budvinner === sete) vantTell[N] = (vantTell[N] ?? 0) + 1;
      }
    }
  }
  if (stikkA.length < 3 || stikkB.length < 3 || passA.length < 3) continue;

  const vantMed: Record<string, number> = {};
  for (const N of BUD) vantMed[String(N)] = (vantTell[N] ?? 0) / Math.max(1, vantN[N] ?? 1);

  appendFileSync(
    utFil,
    JSON.stringify({
      frø: (frøBase + h) >>> 0,
      t: Array.from(handTrekk(mal, sete), (x) => Math.round(x * 10_000) / 10_000),
      stikkA,
      stikkB,
      passA,
      passB,
      vantMed,
    } satisfies Rad) + "\n",
  );
  n++;
  process.stdout.write(`\r  skard ${skardI}: ${n} hender   `);
}
console.log(`\nSkard ${skardI} ferdig: ${n} hender à ${HAND_DIM} trekk → ${utFil}`);
