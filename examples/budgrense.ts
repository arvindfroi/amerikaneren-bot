/**
 * BUDGRENSEN: lønner det seg å by der vi i dag passer?
 *
 *   node examples/budgrense.ts --froe 37000000 --kamper 500 --ut analyse/budgrense-runder-0.jsonl
 *   node examples/budgrense.ts --rapport analyse/budgrense-runder-*.jsonl \
 *       --tekst analyse/budgrense.txt --json analyse/budgrense.json
 *
 * SPØRSMÅLET. `analyse/mesterai-fasegap.txt`: budnettet vårt og MesterAIs er
 * det samme nettet, og det eneste de skiller på er PASS mot by. MesterAI byr
 * i 451 stillinger vi passer i, med SD-orakelet på 9,00 – den byr altså over
 * det hånden bærer, og innfrir likevel 72 %. Etter konvensjonsvakten innfrir
 * vi 75 % mot MesterAIs 73 %. Har vi da råd til budene vi passer på?
 *
 * HVORFOR EN EGEN MÅLING OG IKKE BARE `neat-evaluer.ts`. Poengsummen alene
 * kan ikke svare på HVOR gevinsten kommer fra, og `docs/moe2.md` («Rollebalanse»)
 * krever per-rolle-måling før promotering nettopp fordi et bud som gir flere
 * kontrakter flytter oss inn i spillefører-rollen oftere. Denne målingen deler
 * derfor differansen eksakt i fire bøtter som summerer til totalen.
 *
 * PARRINGEN, og hvorfor den er lovlig HELT NED PÅ RUNDENIVÅ. Kortene i runde
 * r er en ren funksjon av (frø, rundeNr) – `delUt` i `src/motor.ts` blander på
 * `frø + (rundeNr+1)*2654435761`. Stillingen totalPoeng påvirker ikke
 * givingen, bare når kampen stopper. To kandidater som spiller samme (frø,
 * sete) møter derfor NØYAKTIG samme kort i runde r, uansett hva som skjedde i
 * runde r−1. Differansen per (frø, rundeNr, sete) er dermed parret, og
 * summen av bøttene er den parrede totaldifferansen. Runder bare den ene
 * kandidaten rakk (kampen tok slutt tidligere) faller ut av parringen.
 *
 * BØTTENE, sett fra KANDIDATENS rolle:
 *   NY KONTRAKT   budvakten overstyrte et PASS i denne runden, og vi endte som
 *                 spillefører. Kontrakten finnes bare fordi vakten er på.
 *   GAMMEL KONTR. vi er spillefører uten at vakten rørte budrunden.
 *   MAKKER        vi er den etterlyste makkeren.
 *   FORSVAR       alt annet.
 *
 * ADVARSEL. Budvakten JUKSER: SD-orakelet ser alle fire hender (se
 * `src/moe2/budvakt.ts`). Tallene her er et TAK for hypotesen, ikke en
 * promoterbar kandidat.
 *
 * BENKEN MÅTTE BYTTES, OG DET ER ET FUNN I SEG SELV. Standardbenken i
 * `neat-evaluer.ts` er tre GRÅDIGE motstandere, og den kan ikke besvare noe
 * som helst om budgivning: grådig byr bare 5, og bare som åpner, så vårt sete
 * vinner budrunden i 100 % av rundene (målt: 196 av 196 runder, snittbud 5,60
 * mot SD 8,93, innfridd 99 %). Budvakten fyrer aldri, fordi den indre agenten
 * aldri passer seg bort fra en kontrakt. Alle vakt- og eks-målingene i
 * `docs/moe2.md` er tatt på den benken – de måler SPILLEFØRING, og
 * budgivningen er umålt der. Derfor er standardmotstanderen her SPEILET:
 * tre kopier av kontrollkandidaten, som byr med det samme nettet som
 * MesterAI gjør. Da er budrunden ekte, og differansen er ren budvakt.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek, type Innagent } from "../src/moe2/konvensjonsvakt.ts";
import { Budvakt, delBudspek } from "../src/moe2/budvakt.ts";
import { handNett } from "../src/moe2/handnett.ts";
import { analyserGiv } from "../src/neat/singledummy.ts";
import { grådigHandling } from "./graadig.ts";

// --- Argumenter -------------------------------------------------------------
const KONTROLL = "vakt:at:e1:e1-modell/d7alle.bin";
const STANDARD_KANDIDATER = [
  KONTROLL,
  // Orakelet – taket. Ser alle fire hender, kan ikke promoteres.
  `bud:1:${KONTROLL}`,
  `bud:0:${KONTROLL}`,
  `bud:-1:${KONTROLL}`,
  `bud:m-0.6:${KONTROLL}`,
  // Den blinde – lovlig spiller. Egen marginskala: snittet over 8 samplede
  // verdener har målt spredning 0,82 mot orakelets 1,61 (r = 0,31), så
  // heltallsmarginer ville vært mye strengere her enn der.
  `bud:b8-0.5:${KONTROLL}`,
  `bud:b8+0:${KONTROLL}`,
  `bud:b8+0.5:${KONTROLL}`,
  `bud:b8+1:${KONTROLL}`,
];

const rapportFiler: string[] = [];
const kandidatNavn: string[] = [];
let frøBase = 37_000_000;
let kamper = 500;
let frøFra: number | null = null;
let frøTil: number | null = null;
let runderPerKamp = 40;
/** Motstanderne i de tre andre setene. «grådig» eller en agentspesifikasjon. */
let motstander = KONTROLL;
let utFil: string | null = null;
let giverFil: string | null = null;
let tekstFil: string | null = null;
let jsonFil: string | null = null;
let merke = "";
/** Rapport: hvilken kandidat alt måles mot. Null = den uten budvakt. */
let grunnlinje: string | null = null;
let rapportModus = false;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--frofra") frøFra = Number(process.argv[++i]);
  else if (a === "--frotil") frøTil = Number(process.argv[++i]);
  else if (a === "--runder") runderPerKamp = Number(process.argv[++i]);
  else if (a === "--motstander") motstander = process.argv[++i] ?? KONTROLL;
  else if (a === "--ut") utFil = process.argv[++i] ?? null;
  else if (a === "--givere") giverFil = process.argv[++i] ?? null;
  else if (a === "--tekst") tekstFil = process.argv[++i] ?? null;
  else if (a === "--json") jsonFil = process.argv[++i] ?? null;
  else if (a === "--merk") merke = process.argv[++i] ?? "";
  else if (a === "--grunnlinje") grunnlinje = process.argv[++i] ?? null;
  else if (a === "--rapport") rapportModus = true;
  else if (rapportModus) rapportFiler.push(a);
  else kandidatNavn.push(a);
}
const kandidater = kandidatNavn.length > 0 ? kandidatNavn : STANDARD_KANDIDATER;

/** Én runde sett fra ETT sete, for ÉN kandidat. Uavhengighetsenheten i bøttene. */
interface Rundelinje {
  /** Kandidatnavn. */
  readonly k: string;
  readonly f: number;
  readonly r: number;
  readonly s: number;
  /** Poeng setet fikk i runden. */
  readonly p: number;
  /** «F» spillefører, «M» makker, «D» forsvar. */
  readonly rolle: "F" | "M" | "D";
  /** Overstyrte budvakten et PASS for dette setet i denne budrunden? */
  readonly v: boolean;
  /** Kontraktens tallbud (null for amerikaner/solo eller når laget ikke har den). */
  readonly bud: number | null;
  /** Lagstikk for setets lag. */
  readonly stikk: number | null;
  /** Innfridd? Bare når setet er på budvinnerens lag. */
  readonly klart: boolean | null;
  /** SD-orakelets tall for dette setet på denne giva. */
  readonly sd: number;
}

// --- Agentbygging -----------------------------------------------------------
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

/** Bygger agenten fra spesifikasjonen, og gir tilbake budvakten når den finnes. */
function lagAgent(spec: string): { agent: Innagent; budvakt: Budvakt | null } {
  const bv = delBudspek(spec);
  if (bv !== null) {
    const indre = lagAgent(bv.indre);
    const nett = bv.valg.nettFil === null ? null : handNett(bv.valg.nettFil);
    const vakt = new Budvakt(indre.agent, bv.valg, orakel, nett);
    return { agent: vakt, budvakt: vakt };
  }
  const kv = delVaktspek(spec);
  if (kv !== null) {
    const indre = lagAgent(kv.indre);
    return { agent: new Konvensjonsvakt(indre.agent, kv.valg), budvakt: indre.budvakt };
  }
  if (spec === "nevro") return { agent: new NevroAgent(), budvakt: null };
  if (spec.startsWith("e1:")) return { agent: e1Agent(spec.slice(3)), budvakt: null };
  throw new Error(`Ukjent kandidat «${spec}» – budgrense.ts støtter nevro, e1:, vakt:, bud:`);
}

/**
 * Én hel kamp: kandidaten i `sete`, `--motstander` i de tre andre. Skriver én
 * rundelinje per runde og returnerer poengdifferansen for kampen (samme
 * definisjon som `neat-evaluer.ts`: egne − snitt(andres)).
 *
 * Med speilet som motstander er det tallet identisk 0 for kontrollen: alle
 * fire setene spiller da likt, og snittet over de fire setene av
 * «egne − snitt(andres)» er null uansett hvordan kortene lå. Det er en gratis
 * kontroll på at benken er symmetrisk – og det gjør kandidatens råtall til
 * differansen mot kontrollen direkte.
 */
function kamp(spec: string, frø: number, sete: number, ut: Rundelinje[]): number {
  const { agent, budvakt } = lagAgent(spec);
  agent.nyKamp?.();
  // Motstanderne. Én instans hver, så en agent med intern tilstand ikke deler
  // den på tvers av seter. «grådig» er en ren funksjon og trenger ingen.
  const motparter: (Innagent | null)[] = [];
  for (let i = 0; i < 4; i++) {
    if (i === sete || motstander === "grådig") motparter.push(null);
    else {
      const m = lagAgent(motstander).agent;
      m.nyKamp?.();
      motparter.push(m);
    }
  }
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  let forrigePoeng = 0;
  let vaktFør = budvakt?.overstyrt ?? 0;
  /** Budrundens stilling, tatt vare på så SD kan regnes ut etterpå. */
  let budStilling: GameState = s;
  let guard = 0;
  while (s.fase !== "FERDIG" && guard++ < 20000) {
    if (s.fase === "RUNDE_SLUTT") {
      const res = s.sisteRunde;
      if (res !== null && res !== undefined) {
        const poeng = (s.totalPoeng[sete] ?? 0) - forrigePoeng;
        forrigePoeng = s.totalPoeng[sete] ?? 0;
        const påLaget = res.budvinner === sete || res.makker === sete;
        ut.push({
          k: spec,
          f: frø,
          r: s.rundeNr,
          s: sete,
          p: poeng,
          rolle: res.budvinner === sete ? "F" : res.makker === sete ? "M" : "D",
          v: (budvakt?.overstyrt ?? 0) > vaktFør,
          bud: res.melding.type === "tall" ? res.melding.bud : null,
          stikk: påLaget ? res.lagStikk : null,
          klart: påLaget ? res.klart : null,
          sd: analyserGiv(budStilling, orakel).sd[sete] ?? NaN,
        });
      }
      vaktFør = budvakt?.overstyrt ?? 0;
      if (s.rundeNr + 1 >= runderPerKamp) break;
      s = utfør(s, { type: "NESTE" }).state;
      budStilling = s;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
    const motpart = iTur === null ? null : motparter[iTur];
    const h: Handling =
      iTur === sete
        ? agent.velgHandling(s)
        : motpart != null
          ? motpart.velgHandling(s)
          : grådigHandling(s as GameState);
    s = utfør(s, h).state;
  }
  const egne = s.totalPoeng[sete] ?? 0;
  const andres = (s.totalPoeng.reduce((a, b) => a + b, 0) - egne) / 3;
  return egne - andres;
}

// --- Kjøremodus -------------------------------------------------------------
function kjør(): void {
  const fra = frøFra ?? 0;
  const til = frøTil ?? kamper;
  const t0 = performance.now();
  for (let f = fra; f < til; f++) {
    const frø = frøBase + f;
    for (const spec of kandidater) {
      const linjer: Rundelinje[] = [];
      let sum = 0;
      for (let sete = 0; sete < 4; sete++) sum += kamp(spec, frø, sete, linjer);
      if (utFil !== null) {
        appendFileSync(utFil, linjer.map((l) => JSON.stringify(l)).join("\n") + "\n");
      }
      if (giverFil !== null) {
        appendFileSync(giverFil, JSON.stringify({ kandidat: spec, frø, diff: sum / 4 }) + "\n");
      }
    }
    const gjort = f - fra + 1;
    const brukt = (performance.now() - t0) / 1000;
    console.log(
      `giver ${gjort}/${til - fra} (frø ${frø}) – ${brukt.toFixed(0)}s brukt, ` +
        `~${((brukt / gjort) * (til - fra - gjort)).toFixed(0)}s igjen`,
    );
  }
}

// --- Rapport ----------------------------------------------------------------
function snitt(x: readonly number[]): number {
  return x.length === 0 ? 0 : x.reduce((a, b) => a + b, 0) / x.length;
}
function se(x: readonly number[]): number {
  if (x.length < 2) return NaN;
  const m = snitt(x);
  return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1) / x.length);
}
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
function tegntest(d: readonly number[]): { plus: number; n: number; p: number } {
  const ikkeNull = d.filter((x) => x !== 0);
  const plus = ikkeNull.filter((x) => x > 0).length;
  const n = ikkeNull.length;
  if (n === 0) return { plus: 0, n: 0, p: 1 };
  const z = Math.abs(plus - n / 2) / (Math.sqrt(n) / 2);
  return { plus, n, p: Math.min(1, Math.max(0, 2 * (1 - 0.5 * (1 + erf(z / Math.SQRT2))))) };
}
function pStr(p: number): string {
  return p < 1e-6 ? "<1e-6" : p.toFixed(4);
}

interface Bøtte {
  n: number;
  diff: number[];
}
function nyBøtte(): Bøtte {
  return { n: 0, diff: [] };
}

interface Profil {
  kontrakter: number;
  innfridd: number;
  budSum: number;
  sdSum: number;
  stikkSum: number;
  poeng: number;
  runder: number;
}
function nyProfil(): Profil {
  return { kontrakter: 0, innfridd: 0, budSum: 0, sdSum: 0, stikkSum: 0, poeng: 0, runder: 0 };
}

function rapport(): void {
  const linjer: Rundelinje[] = [];
  for (const fil of rapportFiler) {
    for (const l of readFileSync(fil, "utf8").split("\n")) {
      if (l.trim() !== "") linjer.push(JSON.parse(l) as Rundelinje);
    }
  }
  if (linjer.length === 0) throw new Error("Rapporten fikk null linjer – ingenting å regne på");

  const navn = [...new Set(linjer.map((l) => l.k))];
  // Grunnlinjen er den kandidaten som IKKE har en budvakt, ellers første.
  const grunn = grunnlinje ?? navn.find((n) => !n.startsWith("bud:")) ?? navn[0]!;
  if (!navn.includes(grunn)) {
    throw new Error(`Grunnlinjen «${grunn}» finnes ikke i loggene: ${navn.join(", ")}`);
  }
  const andre = navn.filter((n) => n !== grunn);

  /** nøkkel (frø, runde, sete) → poeng, per kandidat. */
  const perRunde = new Map<string, Map<string, Rundelinje>>();
  for (const l of linjer) {
    const n = `${l.f}:${l.r}:${l.s}`;
    let m = perRunde.get(n);
    if (m === undefined) {
      m = new Map();
      perRunde.set(n, m);
    }
    m.set(l.k, l);
  }
  /**
   * Runder der BÅDE kandidaten og grunnlinjen har et tall. Parringen er per
   * kandidat, ikke global: kandidatene måles i flere puljer på det samme
   * frøbåndet, og et globalt krav ville strøket hele pulje 1 fordi pulje 2
   * ikke finnes på de rundene. Hver kandidat får dermed sitt eget utvalg,
   * men ALLTID mot grunnlinjen på nøyaktig de samme kortene – som er det
   * `src/moe2/maaling.ts` krever.
   */
  function fellesFor(k: string): Map<string, Rundelinje>[] {
    const ut: Map<string, Rundelinje>[] = [];
    for (const m of perRunde.values()) if (m.has(k) && m.has(grunn)) ut.push(m);
    return ut;
  }
  const fellesBuffer = new Map<string, Map<string, Rundelinje>[]>();
  function felles(k: string): Map<string, Rundelinje>[] {
    let f = fellesBuffer.get(k);
    if (f === undefined) {
      f = fellesFor(k);
      fellesBuffer.set(k, f);
    }
    return f;
  }

  const ut: string[] = [];
  const p = (t: string): void => {
    ut.push(t);
  };
  p("BUDGRENSEN – lønner det seg å by der vi passer?");
  p("=".repeat(78));
  p(`Kilder:      ${rapportFiler.join(", ")}`);
  p(`Grunnlinje:  ${grunn}`);
  p(`Runder:      ${perRunde.size} loggede (frø × runde × sete); parret per kandidat, se n under`);
  p(`Givere:      ${new Set(linjer.map((l) => l.f)).size}`);
  p(`Merke:       ${merke}`);
  p(`Skrevet:     ${new Date().toISOString()}`);
  p("");
  p("ADVARSEL: budvakten ser alle fire hender via SD-orakelet. Tallene er et");
  p("TAK for hypotesen «vi har råd til å by mer», ikke en promoterbar spiller.");
  p("");

  // --- 1. Totalen, parret per runde ---
  p("1) PARRET TOTALDIFFERANSE, poeng per sete-runde");
  p("-".repeat(78));
  p(
    "kandidat".padEnd(34) +
      "n".padStart(7) +
      "diff".padStart(9) +
      "SE".padStart(8) +
      "  SE-er" +
      "  tegntest".padStart(14) +
      "        p",
  );
  const jsonUt: Record<string, unknown> = { tid: new Date().toISOString(), merke, grunnlinje: grunn };
  const totaler: Record<string, unknown>[] = [];
  for (const k of andre) {
    const d = felles(k).map((m) => m.get(k)!.p - m.get(grunn)!.p);
    const t = tegntest(d);
    const m = snitt(d);
    const s = se(d);
    p(
      k.padEnd(34) +
        `${d.length}`.padStart(7) +
        `${m >= 0 ? "+" : ""}${m.toFixed(4)}`.padStart(9) +
        s.toFixed(4).padStart(8) +
        `${(m / s).toFixed(1)}`.padStart(7) +
        `${t.plus}/${t.n}`.padStart(14) +
        pStr(t.p).padStart(9),
    );
    totaler.push({ kandidat: k, n: d.length, diff: m, se: s, tegnPluss: t.plus, tegnN: t.n, p: t.p });
  }
  jsonUt["totalt"] = totaler;
  p("");
  p("Hvor ofte slår vakten inn? (runder der den gjorde et PASS om til bud)");
  const fyring: Record<string, unknown>[] = [];
  for (const k of andre) {
    const f = felles(k);
    const n = f.filter((m) => m.get(k)!.v).length;
    const vant = f.filter((m) => m.get(k)!.v && m.get(k)!.rolle === "F").length;
    p(
      `  ${k.padEnd(32)} ${n} av ${f.length} runder (${((100 * n) / Math.max(1, f.length)).toFixed(1)} %)` +
        `, vant budrunden i ${vant} av dem`,
    );
    fyring.push({ kandidat: k, fyrte: n, vantBudrunden: vant, runder: f.length });
  }
  jsonUt["fyring"] = fyring;
  p("");

  // --- 2. Bøttene ---
  p("2) HVOR KOMMER DIFFERANSEN FRA? Bøttene summerer eksakt til totalen");
  p("-".repeat(78));
  p("Bøtten bestemmes av KANDIDATENS rolle i runden. «ny kontrakt» = budvakten");
  p("overstyrte et PASS i denne budrunden og kandidaten endte som spillefører.");
  p("«sum/runde» er bøttens bidrag delt på ALLE felles runder, så kolonnen");
  p("summerer til totaldifferansen over.");
  p("");
  const bøtteNavn = ["ny kontrakt", "gammel kontrakt", "makker", "forsvar"] as const;
  type BøtteNavn = (typeof bøtteNavn)[number];
  function bøtteAv(l: Rundelinje): BøtteNavn {
    if (l.rolle === "F") return l.v ? "ny kontrakt" : "gammel kontrakt";
    if (l.rolle === "M") return "makker";
    return "forsvar";
  }
  const bøtterJson: Record<string, unknown>[] = [];
  for (const k of andre) {
    p(`${k}`);
    p(
      "  bøtte".padEnd(20) +
        "n".padStart(7) +
        "andel".padStart(8) +
        "diff i bøtta".padStart(14) +
        "sum".padStart(10) +
        "sum/runde".padStart(11) +
        "% av total".padStart(12),
    );
    const b: Record<string, Bøtte> = {};
    for (const n of bøtteNavn) b[n] = nyBøtte();
    const f = felles(k);
    for (const m of f) {
      const l = m.get(k)!;
      const g = m.get(grunn)!;
      const bb = b[bøtteAv(l)]!;
      bb.n++;
      bb.diff.push(l.p - g.p);
    }
    const total = f.reduce((a, m) => a + (m.get(k)!.p - m.get(grunn)!.p), 0);
    for (const n of bøtteNavn) {
      const bb = b[n]!;
      const sum = bb.diff.reduce((a, x) => a + x, 0);
      p(
        `  ${n}`.padEnd(20) +
          `${bb.n}`.padStart(7) +
          `${((100 * bb.n) / Math.max(1, f.length)).toFixed(1)} %`.padStart(8) +
          `${snitt(bb.diff) >= 0 ? "+" : ""}${snitt(bb.diff).toFixed(3)}`.padStart(14) +
          `${sum >= 0 ? "+" : ""}${sum.toFixed(0)}`.padStart(10) +
          `${sum / Math.max(1, f.length) >= 0 ? "+" : ""}${(sum / Math.max(1, f.length)).toFixed(4)}`.padStart(11) +
          `${total === 0 ? "–" : ((100 * sum) / total).toFixed(0) + " %"}`.padStart(12),
      );
      bøtterJson.push({ kandidat: k, bøtte: n, n: bb.n, sum, perRunde: sum / Math.max(1, f.length) });
    }
    p("");
  }
  jsonUt["boetter"] = bøtterJson;

  // --- 3. Sammensetningen ---
  p("3) SAMMENSETNINGEN – hva slags kontrakter blir det?");
  p("-".repeat(78));
  p(
    "kandidat".padEnd(34) +
      "kontr.".padStart(8) +
      "andel".padStart(8) +
      "innfr.".padStart(8) +
      "bud".padStart(7) +
      "SD".padStart(7) +
      "bud−SD".padStart(8) +
      "stikk".padStart(7) +
      "p/kontr".padStart(9),
  );
  const profilerJson: Record<string, unknown>[] = [];
  function skrivProfil(etikett: string, pr: Profil): void {
    p(
      etikett.padEnd(34) +
        `${pr.kontrakter}`.padStart(8) +
        `${((100 * pr.kontrakter) / Math.max(1, pr.runder)).toFixed(1)} %`.padStart(8) +
        `${((100 * pr.innfridd) / Math.max(1, pr.kontrakter)).toFixed(0)} %`.padStart(8) +
        (pr.budSum / Math.max(1, pr.kontrakter)).toFixed(2).padStart(7) +
        (pr.sdSum / Math.max(1, pr.kontrakter)).toFixed(2).padStart(7) +
        `${(pr.budSum - pr.sdSum) / Math.max(1, pr.kontrakter) >= 0 ? "+" : ""}${((pr.budSum - pr.sdSum) / Math.max(1, pr.kontrakter)).toFixed(2)}`.padStart(8) +
        (pr.stikkSum / Math.max(1, pr.kontrakter)).toFixed(2).padStart(7) +
        `${pr.poeng / Math.max(1, pr.kontrakter) >= 0 ? "+" : ""}${(pr.poeng / Math.max(1, pr.kontrakter)).toFixed(2)}`.padStart(9),
    );
  }
  for (const k of navn) {
    const alle = nyProfil();
    const nye = nyProfil();
    const gamle = nyProfil();
    for (const m of felles(k)) {
      const l = m.get(k)!;
      for (const pr of [alle, l.v ? nye : gamle]) pr.runder++;
      if (l.rolle !== "F" || l.bud === null) continue;
      for (const pr of [alle, l.v ? nye : gamle]) {
        pr.kontrakter++;
        if (l.klart === true) pr.innfridd++;
        pr.budSum += l.bud;
        pr.sdSum += l.sd;
        pr.stikkSum += l.stikk ?? 0;
        pr.poeng += l.p;
      }
    }
    skrivProfil(k, alle);
    if (nye.kontrakter > 0) {
      skrivProfil("    derav NYE (vakten byd)", nye);
      skrivProfil("    derav gamle", gamle);
    }
    profilerJson.push({ kandidat: k, alle, nye, gamle });
  }
  jsonUt["sammensetning"] = profilerJson;
  p("");

  // --- 4. Rollebalansen ---
  p("4) ROLLEBALANSEN – kravet i docs/moe2.md før promotering");
  p("-".repeat(78));
  p("Frekvens (hvor ofte havner vi i rollen) og kvalitet (poeng per runde der).");
  p("");
  p(
    "kandidat".padEnd(34) +
      "fører n".padStart(9) +
      "p/rd".padStart(8) +
      "makker n".padStart(10) +
      "p/rd".padStart(8) +
      "forsvar n".padStart(11) +
      "p/rd".padStart(8),
  );
  const rollerJson: Record<string, unknown>[] = [];
  for (const k of navn) {
    const tell: Record<string, { n: number; p: number }> = {
      F: { n: 0, p: 0 },
      M: { n: 0, p: 0 },
      D: { n: 0, p: 0 },
    };
    for (const m of felles(k)) {
      const l = m.get(k)!;
      tell[l.rolle]!.n++;
      tell[l.rolle]!.p += l.p;
    }
    p(
      k.padEnd(34) +
        `${tell["F"]!.n}`.padStart(9) +
        `${tell["F"]!.p / Math.max(1, tell["F"]!.n) >= 0 ? "+" : ""}${(tell["F"]!.p / Math.max(1, tell["F"]!.n)).toFixed(2)}`.padStart(8) +
        `${tell["M"]!.n}`.padStart(10) +
        `${tell["M"]!.p / Math.max(1, tell["M"]!.n) >= 0 ? "+" : ""}${(tell["M"]!.p / Math.max(1, tell["M"]!.n)).toFixed(2)}`.padStart(8) +
        `${tell["D"]!.n}`.padStart(11) +
        `${tell["D"]!.p / Math.max(1, tell["D"]!.n) >= 0 ? "+" : ""}${(tell["D"]!.p / Math.max(1, tell["D"]!.n)).toFixed(2)}`.padStart(8),
    );
    rollerJson.push({ kandidat: k, ...tell });
  }
  jsonUt["roller"] = rollerJson;
  p("");
  p("Den parrede rolledifferansen er det som teller – en rolle kan bli sjeldnere");
  p("UTEN at den blir dårligere. Parret på runde, mot grunnlinjen:");
  p("");
  p(
    "kandidat".padEnd(34) +
      "forsvar Δp/rd".padStart(15) +
      "SE".padStart(8) +
      "makker Δp/rd".padStart(14) +
      "SE".padStart(8),
  );
  const rolleDiffJson: Record<string, unknown>[] = [];
  for (const k of andre) {
    // Runder der BEGGE er i samme rolle – da er sammenligningen ekte parret.
    const forsvar: number[] = [];
    const makker: number[] = [];
    for (const m of felles(k)) {
      const l = m.get(k)!;
      const g = m.get(grunn)!;
      if (l.rolle === "D" && g.rolle === "D") forsvar.push(l.p - g.p);
      if (l.rolle === "M" && g.rolle === "M") makker.push(l.p - g.p);
    }
    p(
      k.padEnd(34) +
        `${snitt(forsvar) >= 0 ? "+" : ""}${snitt(forsvar).toFixed(4)} (${forsvar.length})`.padStart(15) +
        se(forsvar).toFixed(4).padStart(8) +
        `${snitt(makker) >= 0 ? "+" : ""}${snitt(makker).toFixed(4)} (${makker.length})`.padStart(14) +
        se(makker).toFixed(4).padStart(8),
    );
    rolleDiffJson.push({
      kandidat: k,
      forsvar: snitt(forsvar),
      forsvarSe: se(forsvar),
      forsvarN: forsvar.length,
      makker: snitt(makker),
      makkerSe: se(makker),
      makkerN: makker.length,
    });
  }
  jsonUt["rollediff"] = rolleDiffJson;
  p("");

  // --- 5. Kostnadskurven for bud − SD, målt på nytt ---
  p("5) HVA KOSTER ET OVERBUD NÅ? Kontrakter gruppert på bud − SD");
  p("-".repeat(78));
  p("Samme oppdeling som `analyse/mesterai-fasegap.txt` tabell 2C, men på");
  p("spillefører-setets EGNE poeng, ikke netto mot motparten – bare de er");
  p("tilgjengelige her. Tallet som skal leses er hvordan kurven HELLER: er");
  p("overbud fortsatt en klippe, eller har spilleføringen flatet den ut?");
  p("");
  const bånd = ["≤ −2", "−1", "0", "+1", "≥ +2"] as const;
  function båndAv(d: number): (typeof bånd)[number] {
    if (d <= -2) return "≤ −2";
    if (d <= -1) return "−1";
    if (d < 1) return "0";
    if (d < 2) return "+1";
    return "≥ +2";
  }
  const kurveJson: Record<string, unknown>[] = [];
  for (const k of navn) {
    const tell: Record<string, { n: number; klart: number; stikk: number; p: number }> = {};
    for (const b of bånd) tell[b] = { n: 0, klart: 0, stikk: 0, p: 0 };
    for (const m of felles(k)) {
      const l = m.get(k)!;
      if (l.rolle !== "F" || l.bud === null) continue;
      const t = tell[båndAv(Math.round(l.bud - l.sd))]!;
      t.n++;
      if (l.klart === true) t.klart++;
      t.stikk += l.stikk ?? 0;
      t.p += l.p;
    }
    const sum = bånd.reduce((a, b) => a + tell[b]!.n, 0);
    p(`${k}  (${sum} kontrakter)`);
    p("  bud − SD".padEnd(14) + "n".padStart(7) + "andel".padStart(8) + "innfridd".padStart(10) + "lagstikk".padStart(10) + "poeng/kontrakt".padStart(16));
    for (const b of bånd) {
      const t = tell[b]!;
      p(
        `  ${b}`.padEnd(14) +
          `${t.n}`.padStart(7) +
          `${((100 * t.n) / Math.max(1, sum)).toFixed(0)} %`.padStart(8) +
          `${((100 * t.klart) / Math.max(1, t.n)).toFixed(0)} %`.padStart(10) +
          (t.stikk / Math.max(1, t.n)).toFixed(2).padStart(10) +
          `${t.p / Math.max(1, t.n) >= 0 ? "+" : ""}${(t.p / Math.max(1, t.n)).toFixed(2)}`.padStart(16),
      );
      kurveJson.push({ kandidat: k, bånd: b, n: t.n, innfridd: t.klart / Math.max(1, t.n), poeng: t.p / Math.max(1, t.n) });
    }
    p("");
  }
  jsonUt["kostnadskurve"] = kurveJson;

  const tekst = ut.join("\n") + "\n";
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

if (rapportModus) rapport();
else kjør();
