/**
 * HÅNDVURDERINGEN: hånd → forventede lagstikk, trent på SD-fasiten.
 *
 *   # 1. datasettet (fasiten er gratis – analyserGiv skriver den)
 *   node examples/handvurdering.ts --data hand-data --froe 60000000 \
 *       --frofra 0 --frotil 50000 --skard 0
 *
 *   # 2. trening: verktoy/hand-tren.py (giv-delt holdout, samme maskineri
 *   #    som verktoy/sd-tren.py)
 *
 *   # 3. kalibrering mot orakelet på et FRISKT frøbånd, med den samplende
 *   #    estimatoren som referanse (r = 0,31 i analyse/budgrense.txt)
 *   node examples/handvurdering.ts --kalibrer e1-modell/hand-a.bin \
 *       --froe 61000000 --kamper 400 --json analyse/handvurdering-kalibrer.json
 *
 *   # 4. rapport: kalibreringen + den parrede spillmålingen i én varig fil
 *   node examples/handvurdering.ts --rapport \
 *       --kalibrering analyse/handvurdering-kalibrer.json \
 *       --spill analyse/handvurdering-spill.json \
 *       --tekst analyse/handvurdering.txt --json analyse/handvurdering.json
 *
 * SPØRSMÅLET, og hvorfor det er nettopp dette. `analyse/budgrense.txt` målte
 * taket: å by der vi passer, når hånden bærer budet, er verdt
 * +1,116 ± 0,058 poeng per sete-runde. Taket er satt av et orakel som ser alle
 * fire hender. Den lovlige estimatoren – 8 til 24 rollouts på samplede verdener
 * – henter +0,005 ± 0,026 av det, og korrelerer bare 0,31 med orakelet.
 * Dommen i `docs/moe2.md` var derfor: «neste steg er ikke en vakt, det er en
 * bedre håndvurdering».
 *
 * Dette skriptet lager den. Fasiten er `analyserGiv().sd[sete]` – lagstikkene
 * giva bærer når nettopp det setet får kontrakten – og inngangen er strengt
 * det setet ser i budøyeblikket (`src/moe2/handtrekk.ts`, med
 * permutasjonstesten i `test/moe2-handtrekk.test.ts`).
 *
 * MÅLESTOKKEN ER TODELT, og begge halvdeler må stå:
 *   FASIT   korrelasjonen mot orakelet på givere nettet aldri har sett.
 *           Referansen er 0,31 – slår nettet den, ser det mer enn 24 rollouts.
 *   SPILL   den parrede differansen på SPEILBENKEN mot kontrollen, med
 *           rollebalansen delt ut (`examples/budgrense.ts`). Et nett som
 *           korrelerer bedre uten å måle bedre er ikke promoterbart; vi har
 *           åtte tilfeller av nettopp det.
 *
 * FRØBÅNDENE HOLDES ATSKILT, og det er ikke en formalitet. Treningen ligger på
 * 60 000 000+, kalibreringen på 61 000 000+, og spillmålingen på 42 000 000+
 * (samme bånd som `analyse/budgrense.txt`, så tallene er direkte
 * sammenlignbare med taket). Ingen giv nettet har sett inngår i noen måling.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek, type Innagent } from "../src/moe2/konvensjonsvakt.ts";
import { blindSd, tømBlindCache } from "../src/moe2/budvakt.ts";
import { handNett, handSd } from "../src/moe2/handnett.ts";
import { handTrekk } from "../src/moe2/handtrekk.ts";
import { analyserGiv, tømCache } from "../src/neat/singledummy.ts";

// --- Argumenter -------------------------------------------------------------
/** Agenten som byr i datasettet – den samme som sitter i speilbenken. */
const KONTROLL = "vakt:at:e1:e1-modell/d7alle.bin";

let dataMappe: string | null = null;
let kalibrerNett: string | null = null;
let rapportModus = false;
let frøBase = 60_000_000;
let frøFra = 0;
let frøTil = 1000;
let kamper = 400;
let skard = 0;
let budAgent = KONTROLL;
/** Verdener i de samplende referanseestimatorene under kalibreringen. */
let blindK = [8, 24];
let tekstFil: string | null = null;
let jsonFil: string | null = null;
let kalibreringsFil: string | null = null;
let spillFil: string | null = null;
let merke = "";

for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--data") dataMappe = process.argv[++i] ?? null;
  else if (a === "--kalibrer") kalibrerNett = process.argv[++i] ?? null;
  else if (a === "--rapport") rapportModus = true;
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--frofra") frøFra = Number(process.argv[++i]);
  else if (a === "--frotil") frøTil = Number(process.argv[++i]);
  else if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--skard") skard = Number(process.argv[++i]);
  else if (a === "--budagent") budAgent = process.argv[++i] ?? KONTROLL;
  else if (a === "--blind") blindK = (process.argv[++i] ?? "8,24").split(",").map(Number).filter((x) => x > 0);
  else if (a === "--tekst") tekstFil = process.argv[++i] ?? null;
  else if (a === "--json") jsonFil = process.argv[++i] ?? null;
  else if (a === "--kalibrering") kalibreringsFil = process.argv[++i] ?? null;
  else if (a === "--spill") spillFil = process.argv[++i] ?? null;
  else if (a === "--merk") merke = process.argv[++i] ?? "";
}

// --- Agentbygging (samme spesifikasjonsspråk som budgrense.ts) ---------------
const orakel = new NevroAgent();
const e1Bufret = new Map<string, E1Agent>();
function e1Agent(fil: string): E1Agent {
  let a = e1Bufret.get(fil);
  if (a === undefined) {
    a = E1Agent.fraFil(fil);
    e1Bufret.set(fil, a);
  }
  return a;
}
function lagAgent(spec: string): Innagent {
  const kv = delVaktspek(spec);
  if (kv !== null) return new Konvensjonsvakt(lagAgent(kv.indre), kv.valg);
  if (spec === "nevro") return new NevroAgent();
  if (spec.startsWith("e1:")) return e1Agent(spec.slice(3));
  throw new Error(`Ukjent budagent «${spec}» – handvurdering.ts støtter nevro, e1:, vakt:`);
}

// --- 1. Datasettet ----------------------------------------------------------

/**
 * Én rad: trekkvektoren setet så, og lagstikkene giva bar for det setet.
 *
 * `frø` er med fordi holdouten deles på GIV og ikke på stilling – de fire til
 * seks radene fra samme giv deler alle fire hender, og en stillingsdeling
 * ville lekket giv-nivå informasjon inn i «holdout». Det er nøyaktig samme
 * grunn som i `verktoy/sd-tren.py`, og prosjektet har allerede betalt for den
 * forskjellen én gang.
 */
interface Rad {
  readonly t: number[];
  readonly y: number;
  readonly frø: number;
  readonly s: number;
}

/**
 * Spiller BUDRUNDEN (og bare den) med `budAgent` i alle fire seter, og skriver
 * én rad per budbeslutning.
 *
 * Kortspillet spilles ikke: fasiten kommer fra `analyserGiv`, som setter opp
 * sin egen friske budrunde uansett, og budrundens gang avhenger ikke av hva
 * som skjer etterpå. Én giv koster derfor fire rollouts og en håndfull
 * nettevalueringer.
 *
 * FORBEHOLDET som må stå: budrunden kjøres på runde 0 med stillingen 0–0–0–0.
 * NevroHjernes budtrekk inneholder poengstillingen, så budhistorikken i
 * datasettet er den som oppstår ved likt spill. I en ekte kamp forskyves den
 * litt utover i kampen. Det er en distribusjonsforskjell i INNGANGEN, ikke i
 * fasiten – SD-tallet avhenger ikke av stillingen.
 */
function givRader(frø: number, ut: Rad[]): void {
  const start = opprettSpill({ antallSpillere: 4 }, frø);
  const sd = analyserGiv(start, orakel).sd;
  const agenter: Innagent[] = [];
  for (let i = 0; i < 4; i++) {
    const a = lagAgent(budAgent);
    a.nyKamp?.();
    agenter.push(a);
  }
  let s = start;
  let vakt = 0;
  while (s.fase === "BUDRUNDE" && vakt++ < 40) {
    const sete = s.iTur!;
    const y = sd[sete];
    if (y !== undefined) {
      ut.push({ t: Array.from(handTrekk(s, sete), (x) => Math.round(x * 1e5) / 1e5), y, frø, s: sete });
    }
    const h: Handling = agenter[sete]!.velgHandling(s);
    s = utfør(s, h).state;
  }
}

function kjørData(): void {
  const mappe = dataMappe!;
  mkdirSync(mappe, { recursive: true });
  const fil = `${mappe}/skard-${skard}.jsonl`;
  const t0 = performance.now();
  let skrevet = 0;
  const buffer: string[] = [];
  for (let f = frøFra; f < frøTil; f++) {
    const rader: Rad[] = [];
    givRader(frøBase + f, rader);
    for (const r of rader) buffer.push(JSON.stringify(r));
    skrevet += rader.length;
    // Cachene i singledummy.ts og budvakt.ts vokser med én oppføring per giv;
    // over hundretusener av giver er det gigabyte. Ingen giv besøkes to ganger
    // her, så cachen gir null gevinst og skal tømmes.
    tømCache();
    tømBlindCache();
    if (buffer.length >= 2000 || f + 1 === frøTil) {
      appendFileSync(fil, buffer.join("\n") + "\n");
      buffer.length = 0;
    }
    const gjort = f - frøFra + 1;
    if (gjort % 2000 === 0 || f + 1 === frøTil) {
      const brukt = (performance.now() - t0) / 1000;
      console.log(
        `giv ${gjort}/${frøTil - frøFra} – ${skrevet} rader, ${brukt.toFixed(0)}s brukt, ` +
          `~${((brukt / gjort) * (frøTil - frøFra - gjort)).toFixed(0)}s igjen`,
      );
    }
  }
  console.log(`Skrev ${skrevet} rader til ${fil}`);
}

// --- 2. Kalibreringen mot orakelet ------------------------------------------

function snitt(x: readonly number[]): number {
  return x.length === 0 ? 0 : x.reduce((a, b) => a + b, 0) / x.length;
}
function std(x: readonly number[]): number {
  if (x.length < 2) return 0;
  const m = snitt(x);
  return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1));
}
/** Pearson. Null spredning på én av sidene gir 0, ikke NaN. */
function korr(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = snitt(a);
  const mb = snitt(b);
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i]! - ma;
    const db = b[i]! - mb;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  return saa === 0 || sbb === 0 ? 0 : sab / Math.sqrt(saa * sbb);
}

interface Kalibrering {
  readonly navn: string;
  readonly n: number;
  readonly snitt: number;
  readonly std: number;
  readonly r: number;
  /** Rot av middelkvadratfeil mot orakelet. */
  readonly rmse: number;
  /** Skjevhet: estimat − orakel. */
  readonly avvik: number;
}

function kjørKalibrer(): void {
  const nett = handNett(kalibrerNett!);
  const fasit: number[] = [];
  const estimat = new Map<string, number[]>();
  estimat.set("nett", []);
  for (const k of blindK) estimat.set(`blind${k}`, []);
  const t0 = performance.now();
  for (let f = 0; f < kamper; f++) {
    const frø = frøBase + f;
    const s = opprettSpill({ antallSpillere: 4 }, frø);
    const sd = analyserGiv(s, orakel).sd;
    for (let sete = 0; sete < 4; sete++) {
      const y = sd[sete];
      if (y === undefined) continue;
      fasit.push(y);
      estimat.get("nett")!.push(handSd(nett, s, sete));
      for (const k of blindK) estimat.get(`blind${k}`)!.push(blindSd(s, sete, k, orakel));
    }
    tømCache();
    tømBlindCache();
    if ((f + 1) % 25 === 0 || f + 1 === kamper) {
      const brukt = (performance.now() - t0) / 1000;
      console.log(
        `giv ${f + 1}/${kamper} – ${brukt.toFixed(0)}s brukt, ` +
          `~${((brukt / (f + 1)) * (kamper - f - 1)).toFixed(0)}s igjen`,
      );
    }
  }
  const rader: Kalibrering[] = [];
  const legg = (navn: string, x: number[]): void => {
    const d = x.map((v, i) => v - fasit[i]!);
    rader.push({
      navn,
      n: x.length,
      snitt: snitt(x),
      std: std(x),
      r: korr(x, fasit),
      rmse: Math.sqrt(snitt(d.map((v) => v * v))),
      avvik: snitt(d),
    });
  };
  legg("orakel (fasit)", fasit.slice());
  legg(`nett ${kalibrerNett}`, estimat.get("nett")!);
  for (const k of blindK) legg(`blind K=${k}`, estimat.get(`blind${k}`)!);

  const ut = {
    tid: new Date().toISOString(),
    nett: kalibrerNett,
    frøbånd: [frøBase, frøBase + kamper - 1],
    givere: kamper,
    n: fasit.length,
    rader,
  };
  console.log(JSON.stringify(ut, null, 2));
  if (jsonFil !== null) {
    mkdirSync(dirname(jsonFil), { recursive: true });
    writeFileSync(jsonFil, JSON.stringify(ut, null, 2));
    console.log(`Skrevet ${jsonFil}`);
  }
}

// --- 3. Rapporten -----------------------------------------------------------

/** Taket og gulvet fra `analyse/budgrense.txt` – det ærlige måltallet. */
const TAK = 1.1156;
const TAK_SE = 0.0584;
const GULV = 0.0047;
const BLIND_R = 0.31;

interface SpillTotal {
  kandidat: string;
  n: number;
  diff: number;
  se: number;
}
interface SpillRolle {
  kandidat: string;
  forsvar: number;
  forsvarSe: number;
  forsvarN: number;
  makker: number;
  makkerSe: number;
  makkerN: number;
}

function kjørRapport(): void {
  const p: string[] = [];
  const skriv = (t: string): void => {
    p.push(t);
  };
  const jsonUt: Record<string, unknown> = { tid: new Date().toISOString(), merke };

  skriv("HÅNDVURDERINGEN – kan en LOVLIG estimator hente noe av budtaket?");
  skriv("=".repeat(78));
  skriv(`Merke:       ${merke}`);
  skriv(`Kalibrering: ${kalibreringsFil ?? "(ingen)"}`);
  skriv(`Spillmåling: ${spillFil ?? "(ingen)"}`);
  skriv(`Skrevet:     ${new Date().toISOString()}`);
  skriv("");
  skriv("Taket (`analyse/budgrense.txt`, orakelet som ser alle fire hender):");
  skriv(`  bud:0   +${TAK.toFixed(4)} ± ${TAK_SE.toFixed(4)} poeng per sete-runde`);
  skriv(`Gulvet (den samplende, lovlige estimatoren, K=8, margin 0): +${GULV.toFixed(4)}`);
  skriv(`Referansekorrelasjonen mot orakelet for den samplende: r = ${BLIND_R.toFixed(2)}`);
  skriv("");

  if (kalibreringsFil !== null) {
    const k = JSON.parse(readFileSync(kalibreringsFil, "utf8")) as {
      nett: string;
      frøbånd: number[];
      givere: number;
      n: number;
      rader: Kalibrering[];
    };
    skriv("1) FASITEN – hvor godt treffer estimatoren orakelets tall?");
    skriv("-".repeat(78));
    skriv(`Friskt frøbånd ${k.frøbånd[0]}–${k.frøbånd[1]}, ${k.givere} givere × 4 seter = ${k.n} par.`);
    skriv("Ingen av disse givene er brukt i treningen.");
    skriv("");
    skriv(
      "estimator".padEnd(34) + "n".padStart(7) + "snitt".padStart(8) + "std".padStart(8) +
        "r".padStart(8) + "RMSE".padStart(8) + "avvik".padStart(8),
    );
    for (const r of k.rader) {
      skriv(
        r.navn.padEnd(34) +
          `${r.n}`.padStart(7) +
          r.snitt.toFixed(2).padStart(8) +
          r.std.toFixed(2).padStart(8) +
          r.r.toFixed(3).padStart(8) +
          r.rmse.toFixed(3).padStart(8) +
          `${r.avvik >= 0 ? "+" : ""}${r.avvik.toFixed(2)}`.padStart(8),
      );
    }
    const nettRad = k.rader.find((r) => r.navn.startsWith("nett"));
    skriv("");
    if (nettRad !== undefined) {
      skriv(
        `Nettet: r = ${nettRad.r.toFixed(3)} mot referansen ${BLIND_R.toFixed(2)} – ` +
          (nettRad.r > BLIND_R ? "BEDRE enn å sample." : "IKKE bedre enn å sample."),
      );
    }
    jsonUt["kalibrering"] = k;
    skriv("");
  }

  if (spillFil !== null) {
    const s = JSON.parse(readFileSync(spillFil, "utf8")) as {
      grunnlinje: string;
      totalt: SpillTotal[];
      rollediff: SpillRolle[];
      fyring: { kandidat: string; fyrte: number; vantBudrunden: number; runder: number }[];
    };
    skriv("2) SPILLET – parret differanse på speilbenken, mot kontrollen");
    skriv("-".repeat(78));
    skriv(`Grunnlinje: ${s.grunnlinje}`);
    skriv("«av taket» er diff delt på +1,1156 – det ærlige måltallet: en lovlig");
    skriv("estimator kan aldri nå orakelet, men 0,005 er gulvet og 1,116 er taket.");
    skriv("");
    skriv(
      "kandidat".padEnd(46) + "n".padStart(7) + "diff".padStart(9) + "SE".padStart(8) +
        "SE-er".padStart(7) + "fyrer".padStart(8) + "av taket".padStart(10),
    );
    const fyr = new Map(s.fyring.map((f) => [f.kandidat, f]));
    for (const t of s.totalt) {
      const f = fyr.get(t.kandidat);
      skriv(
        t.kandidat.padEnd(46) +
          `${t.n}`.padStart(7) +
          `${t.diff >= 0 ? "+" : ""}${t.diff.toFixed(4)}`.padStart(9) +
          t.se.toFixed(4).padStart(8) +
          (t.diff / t.se).toFixed(1).padStart(7) +
          (f === undefined ? "–" : `${((100 * f.fyrte) / Math.max(1, f.runder)).toFixed(1)} %`).padStart(8) +
          `${((100 * t.diff) / TAK).toFixed(1)} %`.padStart(10),
      );
    }
    skriv("");
    skriv("Rollebalansen (kravet i docs/moe2.md før promotering). En rolle kan bli");
    skriv("SJELDNERE uten å bli dårligere; det er den parrede rolledifferansen som");
    skriv("teller, målt bare der begge kandidatene står i samme rolle.");
    skriv("");
    skriv(
      "kandidat".padEnd(46) + "forsvar Δp/rd".padStart(16) + "SE".padStart(9) +
        "makker Δp/rd".padStart(16) + "SE".padStart(9),
    );
    for (const r of s.rollediff) {
      skriv(
        r.kandidat.padEnd(46) +
          `${r.forsvar >= 0 ? "+" : ""}${r.forsvar.toFixed(4)} (${r.forsvarN})`.padStart(16) +
          r.forsvarSe.toFixed(4).padStart(9) +
          `${r.makker >= 0 ? "+" : ""}${r.makker.toFixed(4)} (${r.makkerN})`.padStart(16) +
          r.makkerSe.toFixed(4).padStart(9),
      );
    }
    jsonUt["spill"] = s;
    skriv("");
  }

  const tekst = p.join("\n") + "\n";
  console.log(tekst);
  if (tekstFil !== null) {
    mkdirSync(dirname(tekstFil), { recursive: true });
    writeFileSync(tekstFil, tekst);
    console.log(`Skrevet ${tekstFil}`);
  }
  if (jsonFil !== null) {
    mkdirSync(dirname(jsonFil), { recursive: true });
    writeFileSync(jsonFil, JSON.stringify(jsonUt, null, 2));
    console.log(`Skrevet ${jsonFil}`);
  }
}

// --- Kjøremodus -------------------------------------------------------------
if (rapportModus) kjørRapport();
else if (kalibrerNett !== null) kjørKalibrer();
else if (dataMappe !== null) kjørData();
else throw new Error("Velg en modus: --data <mappe>, --kalibrer <nett> eller --rapport");
