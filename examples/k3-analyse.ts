/**
 * K3 — ANALYSEN AV `k3-kkurve.ts`: K-KURVEN, PASS-BØTTA, DESTILLERBARHET.
 *
 * Regner bare; spiller ingenting. All utspilling ligger i `k3-kkurve.ts`, og
 * delingen er med vilje — kjøringen der er timer lang, og en feil i en
 * tabell skal ikke koste den om igjen.
 *
 * ================= SPOR 1: K-KURVEN ====================================
 *
 * Vinnerens forbannelse: argmax over K støyete snitt plukker den heldigste
 * MÅLINGEN like mye som det beste BUDET. To uavhengige målinger sier at
 * vippepunktet ligger rundt K = 48–60. Kurven her er PARRET — hver K bruker
 * de samme givene og et PREFIKS av de samme verdenene, så forskjellen mellom
 * to K-punkter er ikke to uavhengige kjøringer med hver sin støy.
 *
 * Nivået måles i den VIRKELIGE verdenen, som aldri er blant de K. Å ta argmax
 * over støy kan da bare gjøre valget dårligere, aldri tallet finere.
 *
 * ================= SPOR 2: PASS-BØTTA ==================================
 *
 * Adams passer aldri som åpner (0 av 200). Klarsynet ville passet i 15 %, og
 * den bøtta er verdt +3,625 per runde — den STØRSTE i klarsynstaket.
 *
 * Spørsmålet er ikke om bøtta finnes, men om den kan NÅS. En passregel er en
 * RANGERING av hendene pluss en grense. Fire rangeringer måles:
 *
 *   μ (GBT)      modellens eget anslag på lagstikk. Lovlig ved bordet.
 *   søk (K)      verdenssøkets anslag på PASS minus policybudet. Lovlig,
 *                men dyrt.
 *   klarsyn      den virkelige (vPASS − vPolicy). TAKET, ikke et tiltak.
 *   tilfeldig    kontrollarmen. Må måle rundt null ved alle grenser.
 *
 * FALLGRUVA ER SEG SELV: å velge grensen på de samme dataene man scorer på,
 * er å måle en tilpasning. Derfor rapporteres HVER grense i BEGGE bånd, og i
 * tillegg en ærlig kryssvalidering: grensen som er best i bånd A, verdsatt i
 * bånd B, og omvendt. Det tallet er det eneste som kan siteres.
 *
 * BRUK:
 *   node examples/k3-analyse.ts --kkurve analyse/k3-kkurve-b1.jsonl,analyse/k3-kkurve-b2.jsonl \
 *        --pass analyse/k3-pass-b1.jsonl,analyse/k3-pass-b2.jsonl \
 *        --ut analyse/k3-kkurve-rapport.txt
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { lovligeHandlinger, opprettSpill, type Bud } from "../src/index.ts";

const arg = (n: string, s: string) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const KKURVE = arg("--kkurve", "analyse/k3-kkurve-b1.jsonl,analyse/k3-kkurve-b2.jsonl").split(",");
const PASSF = arg("--pass", "analyse/k3-pass-b1.jsonl,analyse/k3-pass-b2.jsonl").split(",");
const GAMMEL = arg("--gammel", "analyse/k3-budgap-b1.jsonl,analyse/k3-budgap-b2.jsonl").split(",");
const UT = arg("--ut", "analyse/k3-kkurve-rapport.txt");

interface Giv {
  frø: number;
  sete: number;
  bPolicy: string;
  vPolicy: number;
  μ: number | null;
  σ: number | null;
  vFaktisk: Record<string, number>;
  anslag: Record<string, number[]>;
  budvinner: number | null;
  bud: number | null;
  lagstikk: number;
  /** Fylles alltid av `rekkefølge` under — se kommentaren der. */
  kandidater: string[];
}

const budNavn = (b: Bud | null | undefined): string =>
  b === "PASS" || b === null || b === undefined ? "PASS" : String(b);

/**
 * KANDIDATREKKEFØLGEN HENTES FRA MOTOREN, IKKE FRA JSON-NØKLENE.
 *
 * Dette er ikke pedanteri, det var en ekte feil: `JSON.parse` gir et objekt
 * der HELTALLSLIKNENDE nøkler kommer først, i stigende numerisk orden, og
 * resten i innsettingsorden. `{"PASS":…,"5":…,"9":…}` leses altså tilbake som
 * `5, 9, …, PASS`. Argmax bruker STRENG `>`, så den FØRSTE av flere like
 * vinner — og med snudd rekkefølge blir uavgjorte valg brutt motsatt vei.
 *
 * Målt på pilotdataene: 1 av 3 giv fikk et ANNET K=12-valg enn `k3-budgap.ts`,
 * uten at noe var galt med tallene. Reproduksjonskontrollen fanget det. Med
 * rekkefølgen hentet fra `lovligeHandlinger` er de to bit-identiske.
 */
function rekkefølge(frø: number): string[] {
  const s0 = opprettSpill({ antallSpillere: 4 }, frø);
  const lov = lovligeHandlinger(s0);
  if (lov.fase !== "BUDRUNDE") throw new Error(`frø ${frø} ga ikke budrunde`);
  return lov.bud.map(budNavn);
}

/**
 * En AVKUTTET SISTE LINJE er lovlig og skal hoppes over — ikke krasje.
 *
 * To av kjøringene ble stoppet med vilje underveis (se rapportens fotnote om
 * maskinbudsjettet). En giv er ~1 MB JSON, som er langt over det `appendFile`
 * skriver atomisk, så den siste linja i en avbrutt fil er halv. Den er ikke
 * data og skal ikke gjettes på; den forkastes, og antallet forkastede linjer
 * rapporteres, slik at «filen var tom» ikke kan forveksles med «filen var
 * ødelagt».
 */
let avkuttede = 0;
const les = (f: string): Giv[] => {
  if (!existsSync(f)) return [];
  const ut: Giv[] = [];
  for (const l of readFileSync(f, "utf8").split("\n")) {
    if (l.trim() === "") continue;
    let g: Giv;
    try {
      g = JSON.parse(l) as Giv;
    } catch {
      avkuttede++;
      continue;
    }
    g.kandidater = rekkefølge(g.frø);
    ut.push(g);
  }
  return ut;
};

// ---------------------------------------------------------------------------
// Statistikk
// ---------------------------------------------------------------------------

const snitt = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, x) => a + x, 0) / xs.length);
const se = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = snitt(xs);
  const v = xs.reduce((a, x) => a + (x - m) * (x - m), 0) / (xs.length - 1);
  return Math.sqrt(v / xs.length);
};
/** Tegntest: (opp − ned)/sqrt(opp + ned). Uendrede giv teller ikke. */
const tegn = (xs: number[]) => {
  const p = xs.filter((x) => x > 0).length;
  const m = xs.filter((x) => x < 0).length;
  return p + m === 0 ? 0 : (p - m) / Math.sqrt(p + m);
};
const andel = (xs: number[]) => (xs.length === 0 ? 0 : (100 * xs.filter((x) => x !== 0).length) / xs.length);
const rad = (navn: string, xs: number[]) =>
  `${navn.padEnd(24)} ${snitt(xs).toFixed(3).padStart(9)} ${se(xs).toFixed(3).padStart(8)} ` +
  `${tegn(xs).toFixed(2).padStart(9)} ${andel(xs).toFixed(1).padStart(7)}%   n=${xs.length}`;

const linjer: string[] = [];
const si = (s = "") => {
  linjer.push(s);
  console.log(s);
};

// ---------------------------------------------------------------------------
// Valgreglene
// ---------------------------------------------------------------------------

const middel = (xs: number[], fra: number, til: number) => {
  let s = 0;
  let n = 0;
  for (let i = fra; i < til && i < xs.length; i++) {
    s += xs[i]!;
    n++;
  }
  return n === 0 ? 0 : s / n;
};

/**
 * Argmax over verdener [fra, til), med POLICYEN som utgangspunkt: et
 * kandidatbud må være STRENGT bedre for å bytte. Identisk semantikk med
 * `k3-budgap.ts`, slik at K = 12-punktet er en reproduksjonskontroll.
 */
function argmaks(g: Giv, fra: number, til: number): string {
  let best = g.bPolicy;
  let bestV = middel(g.anslag[g.bPolicy] ?? [], fra, til);
  for (const b of g.kandidater) {
    const v = middel(g.anslag[b] ?? [], fra, til);
    if (v > bestV) {
      bestV = v;
      best = b;
    }
  }
  return best;
}

/**
 * KONSERVATIV: bytter bare når forbedringen slår standardfeilen til den
 * PARREDE differansen (samme verdener for begge bud). Det er den samme
 * regelen benken bruker på seg selv, og den er hele poenget med kurven: om
 * vinnerens forbannelse er problemet, skal denne ligge over argmax ved lav K
 * og de to skal møtes når K blir stor nok.
 */
function konservativ(g: Giv, fra: number, til: number): string {
  const basis = (g.anslag[g.bPolicy] ?? []).slice(fra, til);
  let best = g.bPolicy;
  let bestMargin = 0;
  for (const b of g.kandidater) {
    if (b === g.bPolicy) continue;
    const xs = (g.anslag[b] ?? []).slice(fra, til);
    if (xs.length < 2) continue;
    const d = xs.map((x, i) => x - basis[i]!);
    const m = snitt(d);
    const v = d.reduce((s, x) => s + (x - m) * (x - m), 0) / (d.length - 1);
    const s = Math.sqrt(v / d.length);
    if (m > s && m - s > bestMargin) {
      bestMargin = m - s;
      best = b;
    }
  }
  return best;
}

const klarsyn = (g: Giv): string => {
  let best = g.bPolicy;
  let bestV = g.vPolicy;
  for (const b of g.kandidater) {
    const v = g.vFaktisk[b]!;
    if (v > bestV) {
      bestV = v;
      best = b;
    }
  }
  return best;
};

const verdi = (g: Giv, b: string) => (g.vFaktisk[b] ?? g.vPolicy) - g.vPolicy;

// ---------------------------------------------------------------------------
// SPOR 1 — K-kurven
// ---------------------------------------------------------------------------

/**
 * ET BÅND KAN BESTÅ AV FLERE FILER, skilt med «+».
 *
 * Kjøringen ble avbrutt av maskinen og gjenopptatt med en frøforskyvning inne
 * i SAMME bånd. Filene er da biter av ett bånd, ikke to bånd — og å telle dem
 * som to ville vært å påstå en replikasjon som ikke finnes. Delingen i to
 * DISJUNKTE bånd går fortsatt mellom «,», og bare der.
 */
const bånd = KKURVE.map((spec) => ({
  fil: spec,
  giv: spec.split("+").flatMap((f) => les(f)),
})).filter((b) => b.giv.length > 0);

si("=== K3 — K-KURVEN, PASS-BØTTA OG DESTILLERBARHET =======================");
si(`kilder K-kurve: ${bånd.map((b) => `${b.fil} (n=${b.giv.length})`).join("   ") || "ingen"}`);
si(`avkuttede siste linjer forkastet: ${avkuttede}  (én per kjøring som ble stoppet)`);

if (bånd.length > 0) {
  const Kmax = Math.min(...bånd.map((b) => Math.min(...b.giv.map((g) => (g.anslag[g.bPolicy] ?? []).length))));
  const punkter = [6, 12, 24, 48, 60, 120, 180, 240].filter((k) => k <= Kmax);
  si(`Kmax i data: ${Kmax}   punkter: ${punkter.join(", ")}`);
  si("");
  si("--- SPOR 1: K-KURVEN --------------------------------------------------");
  si("Per runde for åpnersetet, parret mot policyen på samme giv.");
  si("Alle K bruker SAMME giv og et PREFIKS av de SAMME verdenene.");
  si("");

  const alle = bånd.flatMap((b) => b.giv);
  const visBånd = (navn: string, giv: Giv[]) => {
    si(`  ${navn}  (n = ${giv.length})`);
    si(`  ${"regel".padEnd(24)} ${"per runde".padStart(9)} ${"± se".padStart(8)} ${"tegntest".padStart(9)} ${"endret".padStart(8)}`);
    si(`  ${rad("POLICY (nullpunkt)", giv.map(() => 0))}`);
    for (const K of punkter) {
      si(`  ${rad(`argmax K=${K}`, giv.map((g) => verdi(g, argmaks(g, 0, K))))}`);
    }
    for (const K of punkter) {
      si(`  ${rad(`konservativ K=${K}`, giv.map((g) => verdi(g, konservativ(g, 0, K))))}`);
    }
    si(`  ${rad("KLARSYN (taket)", giv.map((g) => verdi(g, klarsyn(g))))}`);
    si("");
  };

  bånd.forEach((b, i) => visBånd(`BÅND ${i + 1} — ${b.fil}`, b.giv));
  visBånd("BEGGE BÅND SLÅTT SAMMEN", alle);

  // --- PARRET K MOT K ------------------------------------------------------
  //
  // NIVÅET er støyete fordi v selv spenner ±100 poeng per giv. HELLINGEN er
  // det ikke: to K-verdier velger samme bud på de fleste giv, og differansen
  // er da eksakt null. Denne tabellen måler altså «hjelper det å søke mer?»
  // med langt mindre støy enn å sammenlikne to nivåer hver for seg.
  //
  // Det er også det spørsmålet som avgjør saken: er hellingen null, finnes
  // det ikke noe å hente ved å skru opp K, uansett hvor nivået ligger.
  si("--- PARRET: argmax ved K mot argmax ved 12 ----------------------------");
  si("Null der de to velger samme bud. Bare uenighetene teller.");
  si("");
  const parvis = (giv: Giv[], navn: string) => {
    si(`  ${navn} (n = ${giv.length})`);
    for (const K of punkter.filter((k) => k > 12)) {
      const d = giv.map((g) => verdi(g, argmaks(g, 0, K)) - verdi(g, argmaks(g, 0, 12)));
      si(`  ${rad(`K=${K} − K=12`, d)}`);
    }
    const dk = giv.map((g) => verdi(g, konservativ(g, 0, Kmax)) - verdi(g, argmaks(g, 0, Kmax)));
    si(`  ${rad(`konservativ − argmax (K=${Kmax})`, dk)}`);
    si("");
  };
  bånd.forEach((b, i) => parvis(b.giv, `BÅND ${i + 1}`));
  parvis(alle, "BEGGE BÅND");

  // --- DISJUNKTE VERDENSBLOKKER --------------------------------------------
  //
  // Fire blokker à 60 verdener fra de samme 240. Samme giv, ULIKE verdener.
  // Spriket mellom dem er støyen i SELVE VALGREGELEN, isolert fra støyen i
  // givutvalget — og det er tallet som sier om K = 60 er et punkt eller et
  // lotteri.
  if (Kmax >= 240) {
    si("--- STØYEN I VALGREGELEN ALENE ---------------------------------------");
    si("Fire DISJUNKTE blokker à 60 verdener, samme giv. Sprik = valgstøy.");
    si("");
    for (const [navn, K] of [
      ["60", 60],
      ["120", 120],
    ] as [string, number][]) {
      const blokker = [];
      for (let i = 0; i + K <= Kmax; i += K) {
        blokker.push(snitt(alle.map((g) => verdi(g, argmaks(g, i, i + K)))));
      }
      si(`  argmax K=${navn}, disjunkte blokker: ${blokker.map((x) => x.toFixed(3)).join("  ")}`);
    }
    si("");
  }

  // --- REPRODUKSJONSKONTROLL MOT k3-budgap.ts ------------------------------
  si("--- KONTROLL: K=12 mot den forrige kjøringen -------------------------");
  const gamle = GAMMEL.map(les).flat();
  if (gamle.length === 0) {
    si("  (fant ikke k3-budgap-jsonl — kontrollen ikke kjørt)");
  } else {
    const kart = new Map<number, { bNåbar: string; vNåbar: number; vPolicy: number }>();
    for (const g of gamle as unknown as { frø: number; bNåbar: string; vNåbar: number; vPolicy: number }[]) {
      kart.set(g.frø, { bNåbar: g.bNåbar, vNåbar: g.vNåbar, vPolicy: g.vPolicy });
    }
    let felles = 0;
    let ulikValg = 0;
    for (const g of alle) {
      const gl = kart.get(g.frø);
      if (gl === undefined) continue;
      felles++;
      if (argmaks(g, 0, 12) !== gl.bNåbar) ulikValg++;
    }
    si(`  felles giv ${felles}   ULIKT K=12-valg ${ulikValg}   (må være 0)`);
  }
  si("");
}

// ---------------------------------------------------------------------------
// SPOR 2 — PASS-bøtta
// ---------------------------------------------------------------------------

const passBånd = PASSF.map((f) => ({ fil: f, giv: les(f) })).filter((b) => b.giv.length > 0);

si("--- SPOR 2: PASS-BØTTA ------------------------------------------------");
si(`kilder: ${passBånd.map((b) => `${b.fil} (n=${b.giv.length})`).join("   ") || "ingen"}`);
si("");

if (passBånd.length > 0) {
  /** Verdien av å passe i stedet for policybudet, per giv. Null når policyen alt passer. */
  const dPass = (g: Giv) => (g.bPolicy === "PASS" ? 0 : (g.vFaktisk["PASS"] ?? g.vPolicy) - g.vPolicy);

  si("RÅTALLET: «pass ALLTID i åpningen», parret mot policyen");
  for (const b of passBånd) si(`  ${rad(b.fil.replace(/.*[\\/]/, ""), b.giv.map(dPass))}`);
  si(`  ${rad("begge bånd", passBånd.flatMap((b) => b.giv).map(dPass))}`);
  si("");
  si("HVOR OFTE PASS ER BEDRE ENN POLICYBUDET, og hva det er verdt når det er det:");
  for (const b of passBånd) {
    const d = b.giv.map(dPass);
    const gode = d.filter((x) => x > 0);
    const onde = d.filter((x) => x < 0);
    si(
      `  ${b.fil.replace(/.*[\\/]/, "").padEnd(24)} bedre ${((100 * gode.length) / d.length).toFixed(1)} % ` +
        `(snitt +${snitt(gode).toFixed(1)})   verre ${((100 * onde.length) / d.length).toFixed(1)} % ` +
        `(snitt ${snitt(onde).toFixed(1)})`,
    );
  }
  si("");

  /**
   * En passregel = EN RANGERING + EN GRENSE. Rangeringen er det eneste som
   * kan være informasjon; grensen er bare et kutt i den.
   *
   * `verdiVedKvantil` gir verdien av «pass på de svakeste X % etter denne
   * rangeringen», per runde over ALLE giv — også dem regelen ikke rører,
   * som er nettopp grunnen til at nevneren ikke kan velges på utfallet.
   */
  const kvantiler = [2, 5, 10, 15, 20, 25, 30, 40, 50];
  function kurve(giv: Giv[], rang: (g: Giv) => number): { x: number; verdi: number; xs: number[] }[] {
    const sortert = giv.map((g, i) => ({ i, r: rang(g) })).sort((a, b) => a.r - b.r);
    const dp = giv.map(dPass);
    return kvantiler.map((x) => {
      const antall = Math.round((x / 100) * giv.length);
      const passer = new Set(sortert.slice(0, antall).map((s) => s.i));
      const xs = giv.map((_, i) => (passer.has(i) ? dp[i]! : 0));
      return { x, verdi: snitt(xs), xs };
    });
  }

  /** Kontrollarm: en rangering uten informasjon. Må måle rundt null overalt. */
  const tilfeldigRang = (g: Giv) => {
    let h = (g.frø ^ 0x9e3779b9) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
    return h / 4294967296;
  };

  const rangeringer: [string, (g: Giv) => number][] = [
    ["μ (GBT, lovlig)", (g) => g.μ ?? 0],
    ["μ/σ (GBT, lovlig)", (g) => (g.μ ?? 0) / Math.max(0.6, g.σ ?? 1)],
    ["tilfeldig (kontroll)", tilfeldigRang],
    ["KLARSYN (taket)", (g) => -dPass(g)],
  ];

  for (const [navn, rang] of rangeringer) {
    si(`RANGERING: ${navn}`);
    si(`  ${"pass på svakeste".padEnd(20)} ${passBånd.map((_, i) => `bånd ${i + 1}`.padStart(20)).join(" ")} ${"begge".padStart(20)}`);
    const perBånd = passBånd.map((b) => kurve(b.giv, rang));
    const samlet = kurve(
      passBånd.flatMap((b) => b.giv),
      rang,
    );
    for (let j = 0; j < kvantiler.length; j++) {
      const celler = perBånd.map((k) => {
        const p = k[j]!;
        return `${p.verdi.toFixed(3)} ±${se(p.xs).toFixed(2)}`.padStart(20);
      });
      const s = samlet[j]!;
      si(
        `  ${`${kvantiler[j]} %`.padEnd(20)} ${celler.join(" ")} ` +
          `${`${s.verdi.toFixed(3)} ±${se(s.xs).toFixed(2)} z${tegn(s.xs).toFixed(1)}`.padStart(20)}`,
      );
    }
    si("");
  }

  /**
   * DEN ÆRLIGE VERSJONEN: grensen VELGES i ett bånd og VERDSETTES i det andre.
   * Alt over er in-sample og kan bare brukes til å se formen på kurven.
   */
  if (passBånd.length >= 2) {
    si("KRYSSVALIDERT — grensen valgt i ett bånd, verdsatt i det andre");
    si(`  ${"rangering".padEnd(24)} ${"valgt X".padStart(8)} ${"holdt ute".padStart(24)}`);
    for (const [navn, rang] of rangeringer) {
      const par: string[] = [];
      for (const [a, b] of [
        [0, 1],
        [1, 0],
      ]) {
        const kA = kurve(passBånd[a]!.giv, rang);
        const best = kA.reduce((x, y) => (y.verdi > x.verdi ? y : x));
        const kB = kurve(passBånd[b]!.giv, rang);
        const ut = kB.find((p) => p.x === best.x)!;
        par.push(`X=${best.x} % → ${ut.verdi.toFixed(3)} ± ${se(ut.xs).toFixed(3)} (z ${tegn(ut.xs).toFixed(2)})`);
      }
      si(`  ${navn.padEnd(24)} ${par.join("   |   ")}`);
    }
    si("");
  }

  /**
   * KAN SØKET FINNE PASS-BØTTA DER μ IKKE KAN?
   *
   * μ er en GBT på håndens struktur. Søket er noe annet: det spiller hånden
   * ut i K verdener og ser hva som faktisk skjer. Er pass-bøtta utilgjengelig
   * for μ fordi MODELLEN er for svak, skal søket finne den. Er den
   * utilgjengelig fordi INFORMASJONEN ikke finnes ved bordet, skal søket
   * heller ikke finne den — og da er svaret at budrunden er
   * informasjonsbegrenset, ikke modellbegrenset.
   *
   * Dette er den eneste rangeringen som skiller de to forklaringene.
   * Utvalget er K-kurvefilene, som er små, så tallene er svake — men
   * fortegnet og forholdet til klarsynet på SAMME giv er lesbart.
   */
  if (bånd.length > 0) {
    si("KAN SØKET FINNE PASS-BØTTA DER μ IKKE KAN?  (K-kurvefilene)");
    const Kmax = Math.min(...bånd.flatMap((b) => b.giv).map((g) => (g.anslag[g.bPolicy] ?? []).length));
    const søkRang = (g: Giv) =>
      middel(g.anslag["PASS"] ?? [], 0, Kmax) - middel(g.anslag[g.bPolicy] ?? [], 0, Kmax);
    const rs: [string, (g: Giv) => number][] = [
      [`søk K=${Kmax} (lovlig, dyrt)`, (g) => -søkRang(g)],
      ["μ (GBT, lovlig)", (g) => g.μ ?? 0],
      ["KLARSYN (taket)", (g) => -dPass(g)],
    ];
    si(`  ${"rangering".padEnd(26)} ${kvantiler.map((x) => `${x}%`.padStart(9)).join("")}`);
    for (const [navn, rang] of rs) {
      const k = kurve(
        bånd.flatMap((b) => b.giv),
        rang,
      );
      si(`  ${navn.padEnd(26)} ${k.map((p) => p.verdi.toFixed(2).padStart(9)).join("")}`);
      si(`  ${"± se".padEnd(26)} ${k.map((p) => se(p.xs).toFixed(2).padStart(9)).join("")}`);
    }
    si("");
    // Båndvis, så ingen leser det samlede tallet som replikert.
    for (const [navn, rang] of rs) {
      const celler = bånd.map((b, i) => {
        const k = kurve(b.giv, rang);
        const p = k.find((q) => q.x === 15)!;
        return `b${i + 1} ${p.verdi.toFixed(2)}±${se(p.xs).toFixed(2)}`;
      });
      si(`  X=15 % båndvis  ${navn.padEnd(26)} ${celler.join("   ")}`);
    }
    si("");
  }

  /**
   * NEDGRADERING, IKKE PASS.
   *
   * `k3-budgap.ts` fant at vinduet er ASYMMETRISK: bud 5–8 måler likt mot
   * policyen, fordi auksjonen kommer tilbake til oss og policyen retter et
   * for lavt åpningsbud. Bare PASS og for HØYE bud er irreversible.
   *
   * Da er PASS feil tiltak å prøve først. Den billige, reversible retningen er
   * å NEDGRADERE et strukket bud — og μ-kvintilene peker rett på hvor: kvintil
   * 4 er hender der policyen byr 10 mens modellen selv bare anslår 9,50.
   *
   * Regelen som måles: «byr policyen B, og er μ blant de svakeste X % av
   * B-hendene, by A i stedet». Rangeringen er μ, som er lovlig og gratis.
   * Nevneren er alle giv, ikke bare B-hendene.
   */
  const alleN = passBånd.flatMap((b) => b.giv);
  const nedKvant = [10, 25, 50, 75, 100];

  /**
   * `nedgrader` gir verdien per runde over ALLE giv av regelen «byr policyen
   * B, og er `rang` blant de svakeste x % av B-hendene, by A i stedet».
   *
   * X = 100 % er kontrollen som avgjør hva som gjør jobben: er tallet like
   * stort der, er det ikke rangeringen som virker, det er at B er overbudt
   * over hele linja. En rangering som ikke slår sin egen X = 100 % er ikke
   * informasjon.
   */
  /**
   * REGELEN ER EN TALLGRENSE PÅ μ, IKKE EN LISTE OVER GIV.
   *
   * Første utgave plukket ut de x % svakeste GIVENE i treningsbåndet og lette
   * etter dem igjen i testbåndet. De finnes ikke der — båndene er disjunkte —
   * så krysstallet ble eksakt null uansett hva regelen var. En kryssvalidering
   * som ikke kan gi annet enn null, måler ingenting.
   *
   * Det som skal krysse båndgrensen er GRENSEVERDIEN på μ. `grense` finner
   * den i ett bånd, `anvend` bruker den i et annet.
   */
  const grense = (univers: Giv[], B: string, A: string, x: number, rang: (g: Giv) => number): number => {
    const rs = univers
      .filter((g) => g.bPolicy === B && g.vFaktisk[A] !== undefined)
      .map(rang)
      .sort((a, b) => a - b);
    const i = Math.round((x / 100) * rs.length);
    if (i <= 0) return -Infinity;
    if (i >= rs.length) return Infinity;
    return rs[i - 1]!;
  };
  const anvend = (giv: Giv[], B: string, A: string, t: number, rang: (g: Giv) => number): number[] =>
    giv.map((g) =>
      g.bPolicy === B && g.vFaktisk[A] !== undefined && rang(g) <= t ? g.vFaktisk[A]! - g.vPolicy : 0,
    );
  const nedgrader = (giv: Giv[], B: string, A: string, x: number, rang: (g: Giv) => number, univers = alleN) =>
    anvend(giv, B, A, grense(univers, B, A, x, rang), rang);

  si("NEDGRADERING — «byr policyen B med svak μ, by A i stedet»");
  si("X = 100 % er kontrollen: der gjør rangeringen ingenting.");
  si(`  ${"regel".padEnd(24)} ${nedKvant.map((x) => `${x}%`.padStart(16)).join("")}`);
  for (const [B, A] of [
    ["10", "9"],
    ["10", "8"],
    ["10", "PASS"],
    ["9", "8"],
    ["9", "PASS"],
  ] as [string, string][]) {
    const n = alleN.filter((g) => g.bPolicy === B && g.vFaktisk[A] !== undefined).length;
    if (n === 0) continue;
    for (const [rnavn, rang] of [
      ["μ", (g: Giv) => g.μ ?? 0],
      ["tilfeldig", tilfeldigRang],
    ] as [string, (g: Giv) => number][]) {
      const celler = nedKvant.map((x) => {
        const xs = nedgrader(alleN, B, A, x, rang);
        return `${snitt(xs).toFixed(3)} ±${se(xs).toFixed(3)}`.padStart(16);
      });
      si(`  ${`${B} → ${A}  n=${n}  ${rnavn}`.padEnd(24)} ${celler.join("")}`);
    }
    // Båndvis ved 25 %, så ingen leser det samlede tallet som replikert.
    const bv = passBånd.map((b, i) => {
      const xs = nedgrader(b.giv, B, A, 25, (g) => g.μ ?? 0);
      return `b${i + 1} ${snitt(xs).toFixed(3)}±${se(xs).toFixed(3)} (z ${tegn(xs).toFixed(2)})`;
    });
    si(`  ${"  25 % μ, BÅNDVIS".padEnd(24)} ${bv.join("   ")}`);
    si("");
  }

  /**
   * KRYSSVALIDERT NEDGRADERING. Grensen VELGES i ett bånd — også hvilket
   * A-bud — og VERDSETTES i det andre. Alt over er in-sample; dette er det
   * eneste tallet som kan siteres.
   */
  if (passBånd.length >= 2) {
    si("KRYSSVALIDERT NEDGRADERING — regel valgt i ett bånd, verdsatt i det andre");
    for (const [a, b] of [
      [0, 1],
      [1, 0],
    ]) {
      let beste = { navn: "", verdi: -Infinity, B: "", A: "", x: 0 };
      for (const [B, A] of [
        ["10", "9"],
        ["10", "8"],
        ["10", "PASS"],
        ["9", "8"],
        ["9", "PASS"],
      ] as [string, string][]) {
        for (const x of [10, 25, 50, 75, 100]) {
          const v = snitt(nedgrader(passBånd[a]!.giv, B, A, x, (g) => g.μ ?? 0, passBånd[a]!.giv));
          if (v > beste.verdi) beste = { navn: `${B}→${A} ved ${x} %`, verdi: v, B, A, x };
        }
      }
      const t = grense(passBånd[a]!.giv, beste.B, beste.A, beste.x, (g) => g.μ ?? 0);
      const ut = anvend(passBånd[b]!.giv, beste.B, beste.A, t, (g) => g.μ ?? 0);
      si(
        `  valgt i bånd ${a + 1}: ${beste.navn.padEnd(18)} (in-sample ${beste.verdi.toFixed(3)})` +
          `  →  bånd ${b + 1}: ${snitt(ut).toFixed(3)} ± ${se(ut).toFixed(3)}  (z ${tegn(ut).toFixed(2)})`,
      );
    }
    si("");
  }

  // --- Er μ i det hele tatt en rangering som skiller? ----------------------
  si("SKILLER μ MELLOM HENDER DER PASS LØNNER SEG?");
  const alleP = passBånd.flatMap((b) => b.giv);
  const sortμ = alleP.slice().sort((a, b) => (a.μ ?? 0) - (b.μ ?? 0));
  const bøtter = 5;
  si(`  ${"μ-kvintil".padEnd(12)} ${"μ-snitt".padStart(9)} ${"vPASS − vPolicy".padStart(18)} ${"± se".padStart(8)} ${"policybud".padStart(24)}`);
  for (let q = 0; q < bøtter; q++) {
    const del = sortμ.slice(
      Math.floor((q * sortμ.length) / bøtter),
      Math.floor(((q + 1) * sortμ.length) / bøtter),
    );
    const d = del.map(dPass);
    const budtelling: Record<string, number> = {};
    for (const g of del) budtelling[g.bPolicy] = (budtelling[g.bPolicy] ?? 0) + 1;
    const topp = Object.entries(budtelling)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 3)
      .map(([k, v]) => `${k}:${v}`)
      .join(" ");
    si(
      `  ${`${q + 1}`.padEnd(12)} ${snitt(del.map((g) => g.μ ?? 0))
        .toFixed(2)
        .padStart(9)} ${snitt(d).toFixed(3).padStart(18)} ${se(d).toFixed(3).padStart(8)} ${topp.padStart(24)}`,
    );
  }
  si("");
}

// ---------------------------------------------------------------------------
// SPOR 3 — er søkets valg destillerbart?
// ---------------------------------------------------------------------------

si("--- SPOR 3: ER SØKETS ETIKETT DESTILLERBAR? ---------------------------");
if (bånd.length === 0) {
  si("  (ingen K-kurvedata)");
} else {
  const alle = bånd.flatMap((b) => b.giv);
  const Kmax = Math.min(...alle.map((g) => (g.anslag[g.bPolicy] ?? []).length));
  si("Etiketten er søkets valg ved Kmax. Spørsmålet destillasjonen stiller er");
  si("om den etiketten er en FUNKSJON AV HÅNDEN — hvis samme μ gir motsatte");
  si("etiketter, finnes det ingen billig modell som kan lære den.");
  si("");
  const etikett = (g: Giv) => argmaks(g, 0, Kmax);
  const endret = alle.filter((g) => etikett(g) !== g.bPolicy);
  si(`  giv der Kmax-søket bytter bud: ${endret.length} av ${alle.length} (${((100 * endret.length) / alle.length).toFixed(1)} %)`);
  const fordeling: Record<string, { n: number; sum: number; μ: number }> = {};
  for (const g of alle) {
    const k = `${g.bPolicy} → ${etikett(g)}`;
    const c = (fordeling[k] ??= { n: 0, sum: 0, μ: 0 });
    c.n++;
    c.sum += verdi(g, etikett(g));
    c.μ += g.μ ?? 0;
  }
  si(`  ${"bytte".padEnd(16)} ${"giv".padStart(5)} ${"sum".padStart(9)} ${"per runde".padStart(10)} ${"μ-snitt".padStart(9)}`);
  for (const [k, v] of Object.entries(fordeling).sort((a, b) => b[1].sum - a[1].sum)) {
    si(
      `  ${k.padEnd(16)} ${String(v.n).padStart(5)} ${v.sum.toFixed(0).padStart(9)} ${(v.sum / alle.length)
        .toFixed(3)
        .padStart(10)} ${(v.μ / v.n).toFixed(2).padStart(9)}`,
    );
  }
  si("");
  si("STABILITET: velger to DISJUNKTE halvdeler av verdenene samme bud?");
  const h = Math.floor(Kmax / 2);
  const enige = alle.filter((g) => argmaks(g, 0, h) === argmaks(g, h, Kmax)).length;
  si(`  ${enige} av ${alle.length} (${((100 * enige) / alle.length).toFixed(1)} %) ved K=${h} mot K=${h}`);
  si("  En etikett to uavhengige søk er uenige om, kan ingen modell lære.");
  si("");

  /**
   * ============ DEN ENE BESLUTNINGEN SOM BÆRER ALT =======================
   *
   * Bøttetabellen over sier at 10 → 9 alene bærer nesten hele Kmax-gevinsten.
   * Alt det andre søket finner på — 9 → PASS, 9 → 5, 8 → PASS — summerer til
   * null. Da er det ikke «budsøket» som er tiltaket; det er ÉN binær regel:
   *
   *     byr policyen 10, og søket foretrekker 9 — by 9.
   *
   * Det er den regelen som eventuelt skal destilleres, og den skal måles for
   * seg: båndvis, med tegntest, og med et stabilitetstall. En regel som er
   * verdifull men hvis ETIKETT to uavhengige søk er uenige om, er ikke
   * destillerbar uansett hvor stor gevinsten er.
   */
  si("DEN ENE BESLUTNINGEN: «byr policyen 10 og søket foretrekker 9 — by 9»");
  const følg = (g: Giv, fra: number, til: number) =>
    g.bPolicy === "10" && argmaks(g, fra, til) === "9" && g.vFaktisk["9"] !== undefined
      ? g.vFaktisk["9"]! - g.vPolicy
      : 0;
  si(`  ${"utvalg".padEnd(24)} ${"per runde".padStart(9)} ${"± se".padStart(8)} ${"tegntest".padStart(9)} ${"fyrer".padStart(8)}`);
  bånd.forEach((b, i) => si(`  ${rad(`BÅND ${i + 1}, K=${Kmax}`, b.giv.map((g) => følg(g, 0, Kmax)))}`));
  si(`  ${rad(`begge bånd, K=${Kmax}`, alle.map((g) => følg(g, 0, Kmax)))}`);
  for (const K of [48, 60, 120].filter((k) => k < Kmax)) {
    si(`  ${rad(`begge bånd, K=${K}`, alle.map((g) => følg(g, 0, K)))}`);
  }
  si("");
  si("  STABILITET PÅ AKKURAT DENNE ETIKETTEN (to disjunkte halvdeler):");
  const tiere = alle.filter((g) => g.bPolicy === "10");
  const a = tiere.map((g) => argmaks(g, 0, h) === "9");
  const c = tiere.map((g) => argmaks(g, h, Kmax) === "9");
  const enigeBin = a.filter((x, i) => x === c[i]).length;
  const beggeJa = a.filter((x, i) => x && c[i]).length;
  si(`  giv der policyen byr 10: ${tiere.length}`);
  si(`  de to halvdelene enige om «by 9 i stedet»: ${enigeBin} av ${tiere.length} (${((100 * enigeBin) / Math.max(1, tiere.length)).toFixed(1)} %)`);
  si(`  begge sier «by 9»: ${beggeJa}   bare den ene: ${tiere.length - enigeBin}`);
  si("");
  si("  KAN μ ALENE FORUTSI ETIKETTEN?  (det destillasjonen må klare)");
  const merket = tiere.filter((g) => argmaks(g, 0, Kmax) === "9");
  const ikke = tiere.filter((g) => argmaks(g, 0, Kmax) !== "9");
  si(`  μ-snitt der søket sier «by 9»:      ${snitt(merket.map((g) => g.μ ?? 0)).toFixed(3)}  (n=${merket.length})`);
  si(`  μ-snitt der søket lar 10 stå:       ${snitt(ikke.map((g) => g.μ ?? 0)).toFixed(3)}  (n=${ikke.length})`);
  const sp =
    Math.sqrt(
      (merket.length > 1
        ? merket.reduce((s, g) => s + ((g.μ ?? 0) - snitt(merket.map((x) => x.μ ?? 0))) ** 2, 0)
        : 0) +
        (ikke.length > 1
          ? ikke.reduce((s, g) => s + ((g.μ ?? 0) - snitt(ikke.map((x) => x.μ ?? 0))) ** 2, 0)
          : 0),
    ) / Math.sqrt(Math.max(1, tiere.length - 2));
  si(`  forskjell i μ: ${(snitt(merket.map((g) => g.μ ?? 0)) - snitt(ikke.map((g) => g.μ ?? 0))).toFixed(3)} ± ${sp.toFixed(3)}`);
  si("  Er forskjellen liten, ser hendene like ut for GBT-en, og en billig");
  si("  destillasjon av DENNE etiketten må ha trekk GBT-en ikke har i dag.");
}

writeFileSync(UT, `${linjer.join("\n")}\n`);
console.log(`\nskrevet: ${UT}`);
