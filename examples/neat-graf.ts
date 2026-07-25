/**
 * Genererer fremgangsgrafen for GitHub Pages og publiserer den.
 *
 *   node examples/neat-graf.ts --pages          # oppdater + push gh-pages
 *   node examples/neat-graf.ts <utmappe>        # bare skriv filene
 *
 * Leser alle trening*-loggene (benk-målingene), slår dem sammen med den
 * frosne historikken fra skykjøringen (trening-historikk.json), beregner
 * glidende snitt og en recency-vektet forventet utvikling per fokuslinje,
 * og skriver index.html + data.json. Med --pages vedlikeholdes en
 * git-worktree på grenen gh-pages og endringer pushes – siden på GitHub
 * Pages oppdaterer seg selv (henter data.json hvert minutt).
 *
 * Stier: repoet finnes ut fra skriptets egen plassering, worktreet legges
 * som søskenmappe («amerikaneren-pages»). Begge kan overstyres med
 * miljøvariablene AMB_REPO / AMB_PAGES. Fungerer på Linux, macOS og
 * Windows (kalles av verktoy/lokal-tren.ps1 hvert 2. minutt).
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { resolve } from "node:path";

const REPO = process.env.AMB_REPO ?? resolve(import.meta.dirname, "..");
const PAGES = process.env.AMB_PAGES ?? resolve(REPO, "..", "amerikaneren-pages");
const medPages = process.argv.includes("--pages");
const utMappe = medPages ? PAGES : (process.argv[2] ?? "trening-graf");

// --- Parse benk-serier fra loggene -----------------------------------------
interface Punkt { g: number; v: number }
/** Hvilken motstander differansen er målt mot – de to er IKKE samme skala. */
type Motstander = "grådig" | "nevro";
interface Serie { navn: string; mot: Motstander; rå: Punkt[]; glatt: Punkt[] }

function lesSerie(fil: string): Record<Motstander, Punkt[]> {
  const ut: Record<Motstander, Punkt[]> = { grådig: [], nevro: [] };
  let gen: number | null = null;
  for (const linje of readFileSync(fil, "utf8").split("\n")) {
    const g = linje.match(/^gen\s+(\d+):/);
    if (g) {
      gen = Number(g[1]);
      continue;
    }
    const b = linje.match(
      /benk vs (grådig bot|nevro): mester (-?[\d.]+) poeng\/kamp, (?:grådig|nevro) (-?[\d.]+)/,
    );
    if (b && gen !== null) {
      const mot: Motstander = b[1] === "nevro" ? "nevro" : "grådig";
      ut[mot].push({ g: gen, v: Math.round((Number(b[2]) - Number(b[3])) * 10) / 10 });
    }
  }
  return ut;
}

function glatt(s: Punkt[], vindu = 5): Punkt[] {
  return s.map((p, i) => {
    const del = s.slice(Math.max(0, i - vindu + 1), i + 1);
    return { g: p.g, v: Math.round((del.reduce((a, q) => a + q.v, 0) / del.length) * 10) / 10 };
  });
}

const navnFor = (fil: string): string =>
  fil === "trening.log" ? "A" : fil.replace("trening-", "").replace(".log", "").toUpperCase();

// --- Historikk fra skykjøringen --------------------------------------------
// Treningen flyttet fra sky-containeren til en lokal maskin. Loggene ble
// igjen i containeren, så kurven fram til overgangen ligger frosset i
// trening-historikk.json (hentet fra sidens egen data.json). Lokale
// målinger legges oppå: ved samme (linje, generasjon) vinner den lokale.
interface Historikk {
  overgang?: Record<string, number>;
  pimcRef?: { diff: number; kamper: number } | null;
  serier: { navn: string; mot?: Motstander; rå: Punkt[] }[];
}
let historikk: Historikk | null = null;
if (existsSync(`${REPO}/trening-historikk.json`)) {
  historikk = JSON.parse(readFileSync(`${REPO}/trening-historikk.json`, "utf8")) as Historikk;
}

// Nøkkelen er «navn|motstander»: de to skalaene må aldri blandes i én kurve.
const punktKart = new Map<string, Map<number, number>>();
for (const s of historikk?.serier ?? []) {
  punktKart.set(`${s.navn}|${s.mot ?? "grådig"}`, new Map(s.rå.map((p) => [p.g, p.v])));
}
const loggfiler = readdirSync(REPO)
  .filter((f) => /^trening(-[a-z0-9]+)?\.log$/.test(f))
  .sort();
// Aktive linjer = treningsmappene som finnes på disk akkurat nå. Alt som
// er i fokus på siden utledes av denne – et nytt løp krever ingen kodeendring.
const aktiveLinjer = readdirSync(REPO)
  .filter((f) => /^trening-[a-z0-9]+$/.test(f) && existsSync(`${REPO}/${f}/status.json`))
  .map((f) => f.replace("trening-", "").toUpperCase())
  .sort();
const MOTSTANDERE: readonly Motstander[] = ["grådig", "nevro"];
for (const fil of loggfiler) {
  const navn = navnFor(fil);
  const lest = lesSerie(`${REPO}/${fil}`);
  for (const mot of MOTSTANDERE) {
    if (lest[mot].length === 0) continue;
    const nøkkel = `${navn}|${mot}`;
    let m = punktKart.get(nøkkel);
    if (m === undefined) {
      m = new Map();
      punktKart.set(nøkkel, m);
    }
    for (const p of lest[mot]) m.set(p.g, p.v);
  }
}
const serier: Serie[] = [...punktKart]
  .map(([nøkkel, m]) => {
    const [navn, mot] = nøkkel.split("|") as [string, Motstander];
    const rå = [...m].map(([g, v]) => ({ g, v })).sort((a, b) => a.g - b.g);
    return { navn, mot, rå, glatt: glatt(rå) };
  })
  .filter((s) => s.rå.length > 0)
  .sort((a, b) => (a.navn === b.navn ? a.mot.localeCompare(b.mot) : a.navn.localeCompare(b.navn)));

// --- Forventet utvikling: recency-vektet trend PER fokuslinje --------------
// Oppdateres AKTIVT hver ny generasjon: bare et glidende siste-vindu teller,
// og nyere målinger veier eksponentielt tyngre. Slik sporer prognosen farten
// NÅ – ikke den historiske snittstigningen over hele arven (som ble dominert
// av tidlig, rask vekst og aldri endret seg). Én prognose per fokuslinje
// (C4, D1) i linjens egen farge.
interface Projeksjon {
  navn: string;
  mot: Motstander;
  proj: Punkt[];
  band: { g: number; lo: number; hi: number }[];
}
function projiser(rå: Punkt[]): Omit<Projeksjon, "navn"> {
  const K = 24; //          vindusstørrelse (siste K benk-målinger)
  const forfall = 0.88; //  nyere punkt veier mer (eksponentiell nedvekting)
  const vindu = rå.slice(-K);
  if (vindu.length < 4) return { proj: [], band: [] };
  const vekt = (i: number): number => forfall ** (vindu.length - 1 - i);
  let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
  vindu.forEach((p, i) => {
    const w = vekt(i);
    sw += w; swx += w * p.g; swy += w * p.v; swxx += w * p.g * p.g; swxy += w * p.g * p.v;
  });
  const stign = (sw * swxy - swx * swy) / (sw * swxx - swx * swx || 1);
  const skjær = (swy - stign * swx) / sw;
  let sws = 0;
  vindu.forEach((p, i) => { sws += vekt(i) * (p.v - (skjær + stign * p.g)) ** 2; });
  const sigma = Math.sqrt(sws / (sw || 1));
  const proj: Punkt[] = [];
  const band: { g: number; lo: number; hi: number }[] = [];
  const nyeste = vindu[vindu.length - 1]!.g;
  const HORISONT = 250, STEG = 25; // kortsiktig – prognosen fornyes fortløpende
  for (let t = 0; t <= HORISONT; t += STEG) {
    const g = nyeste + t;
    const v = Math.round((skjær + stign * g) * 10) / 10;
    proj.push({ g, v });
    const b = sigma * (0.5 + t / HORISONT); // usikkerheten vokser med horisonten
    band.push({ g, lo: Math.round((v - b) * 10) / 10, hi: Math.round((v + b) * 10) / 10 });
  }
  return { proj, band };
}
// Prognosen tegnes for fokuslinjene på den MENINGSFULLE skalaen: mot nevro
// der den finnes, ellers mot grådig (den historiske).
const projeksjoner: Projeksjon[] = aktiveLinjer
  .flatMap((navn) => {
    const valgt =
      serier.find((s) => s.navn === navn && s.mot === "nevro") ??
      serier.find((s) => s.navn === navn && s.mot === "grådig");
    return valgt !== undefined ? [{ navn, mot: valgt.mot, ...projiser(valgt.rå) }] : [];
  })
  .filter((p) => p.proj.length > 0);

// --- Live puls per linje ----------------------------------------------------
// Kurven flytter seg bare hver 10. generasjon (benk-intervallet). For å se at
// treningen faktisk lever mellom målingene leses hjerteslaget (status.json)
// og gullstandarden, og farten regnes ut fra en liten ringbuffer som denne
// kjøringen selv vedlikeholder (ett punkt per publisering, ca. 1 times minne).
interface Puls {
  navn: string;
  generasjon: number;
  hjerteslagMin: number;
  gullDiff: number | null;
  gullGen: number | null;
  /** Hvilken benk gulltallet er målt på – de to skalaene er ~100 poeng fra hverandre. */
  gullMot: Motstander | null;
  genPerTime: number | null;
}
const FARTSFIL = `${REPO}/trening-felles/fart.json`;
let fartsminne: Record<string, { t: number; g: number }[]> = {};
try {
  fartsminne = JSON.parse(readFileSync(FARTSFIL, "utf8")) as typeof fartsminne;
} catch {
  /* første kjøring */
}
const nå = Date.now();
const puls: Puls[] = [];
for (const dir of readdirSync(REPO).filter((f) => /^trening-[a-z0-9]+$/.test(f)).sort()) {
  let status: { generasjon: number; tidsstempel: number } | null = null;
  try {
    status = JSON.parse(readFileSync(`${REPO}/${dir}/status.json`, "utf8"));
  } catch {
    continue;
  }
  if (status === null) continue;
  const navn = dir.replace("trening-", "").toUpperCase();
  let gull: { diff: number; gen: number; motstander?: Motstander } | null = null;
  try {
    gull = JSON.parse(readFileSync(`${REPO}/${dir}/gull.json`, "utf8"));
  } catch {
    /* ingen gullstandard ennå */
  }
  const spor = [...(fartsminne[navn] ?? []), { t: nå, g: status.generasjon }].slice(-30);
  fartsminne[navn] = spor;
  const eldst = spor[0]!;
  const timer = (nå - eldst.t) / 3_600_000;
  puls.push({
    navn,
    generasjon: status.generasjon,
    hjerteslagMin: Math.round((nå - status.tidsstempel) / 60_000),
    gullDiff: gull !== null ? Math.round(gull.diff * 10) / 10 : null,
    gullGen: gull?.gen ?? null,
    gullMot: gull !== null ? (gull.motstander ?? "grådig") : null,
    genPerTime: timer > 0.05 ? Math.round((status.generasjon - eldst.g) / timer) : null,
  });
}
try {
  mkdirSync(`${REPO}/trening-felles`, { recursive: true });
  writeFileSync(FARTSFIL, JSON.stringify(fartsminne));
} catch {
  /* fart er pynt, aldri kritisk */
}

// --- E1: destillasjonslinja ------------------------------------------------
// E1 har ingen generasjoner, så den hører ikke hjemme på cupkurvens akse.
// Her er den meningsfulle x-aksen hvor mange orakel-stillinger nettet har
// lært av, og y-aksen den PARRET målte differansen mot NevroHjerne –
// 0 er delmålet (jevnt med appens nett), ikke et vilkårlig nullpunkt.
interface E1Måling {
  kandidat: string;
  /** Parret differanse mot NevroHjerne – det eneste tallet delmålet handler om. */
  motNevro?: number;
  motNevroSe?: number;
  hybrid: boolean;
  merke: string;
}
interface E1Status {
  mb: number;
  stillinger: number;
  skard: number;
  valTreff: number | null;
  punkter: { x: number; diff: number; se: number; hybrid: boolean }[];
}
function lesE1(): E1Status | null {
  let mb = 0;
  let skard = 0;
  // Orakelet har byttet utmappe flere ganger (e1-data → e1-data2 → e1-data3),
  // og siden viste derfor et tall som sluttet å vokse: den leste bare den
  // FØRSTE mappa. Alle generasjonsmappene telles nå. `e1-frys` holdes utenfor
  // med vilje – den er den frosne benken, ikke treningsdata, og å blande den
  // inn ville blåst opp tallet med stillinger nettet aldri skal lære av.
  const dataMapper = readdirSync(REPO)
    .filter((f) => /^e1-data\d*$/.test(f))
    .sort();
  for (const mappe of dataMapper) {
    try {
      for (const f of readdirSync(`${REPO}/${mappe}`)) {
        if (!f.endsWith(".jsonl")) continue;
        skard++;
        mb += statSync(`${REPO}/${mappe}/${f}`).size / (1024 * 1024);
      }
    } catch {
      /* mappa forsvant mens vi leste – hopp over */
    }
  }
  if (skard === 0) return null;
  // Linjene er ~736 B; å telle dem eksakt ville lest hundrevis av MB hvert
  // 2. minutt, så tallet er et anslag – og merkes som det på siden.
  const stillinger = Math.round((mb * 1024 * 1024) / 736);

  // Treningsloggen het `tren.log` i røykprøven, men hver kjøring skriver nå
  // sin egen (`r1.log`, `r2.log`, …). Vi tar val-treffet fra den SIST endrede
  // loggen i stedet for et fast filnavn som sluttet å finnes.
  let valTreff: number | null = null;
  try {
    const logger = readdirSync(`${REPO}/e1-modell`)
      .filter((f) => f.endsWith(".log"))
      .map((f) => ({ f, t: statSync(`${REPO}/e1-modell/${f}`).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const { f } of logger) {
      const logg = readFileSync(`${REPO}/e1-modell/${f}`, "utf8").trim().split("\n");
      for (let i = logg.length - 1; i >= 0 && valTreff === null; i--) {
        const m = logg[i]!.match(/val-treff ([\d.]+) %/);
        if (m) valTreff = Number(m[1]);
      }
      if (valTreff !== null) break;
    }
  } catch {
    /* ikke trent ennå */
  }

  const punkter: E1Status["punkter"] = [];
  try {
    for (const linje of readFileSync(`${REPO}/e1-maalinger.jsonl`, "utf8").split("\n")) {
      if (linje.trim() === "") continue;
      const m = JSON.parse(linje) as E1Måling;
      if (!m.kandidat.startsWith("e1:") || m.motNevro === undefined) continue;
      const x = Number(m.merke.match(/stillinger=(\d+)/)?.[1] ?? 0);
      if (x > 0) punkter.push({ x, diff: m.motNevro, se: m.motNevroSe ?? 0, hybrid: m.hybrid });
    }
  } catch {
    /* ingen målinger ennå */
  }
  punkter.sort((a, b) => a.x - b.x);
  return { mb: Math.round(mb), stillinger, skard, valTreff, punkter };
}
const e1 = lesE1();

const kjør = (cmd: string, cwd: string): string =>
  execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

// Worktree på gh-pages må finnes FØR filene skrives (selvhelende etter restart).
if (medPages && !existsSync(`${PAGES}/.git`)) {
  kjør("git worktree prune", REPO);
  if (kjør("git branch --list gh-pages", REPO).trim() === "") {
    try {
      kjør("git fetch origin gh-pages:gh-pages", REPO); // grenen finnes alt på GitHub
    } catch {
      // Helt ny side: lag en rot-commit på det tomme treet (fast SHA i git).
      const tomTre = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
      const rot = kjør(`git commit-tree ${tomTre} -m "gh-pages: fremgangsgraf"`, REPO).trim();
      kjør(`git branch gh-pages ${rot}`, REPO);
    }
  }
  rmSync(PAGES, { recursive: true, force: true }); // evt. halvskrevne rester uten .git
  kjør(`git worktree add "${PAGES}" gh-pages`, REPO);
}

// PIMC-referansen (målt av neat-pimc-referanse.ts) – tegnes som nivålinje.
// Er den ikke målt lokalt, brukes verdien fra skykjøringen.
let pimcRef: { diff: number; kamper: number } | null = historikk?.pimcRef ?? null;
if (existsSync(`${REPO}/trening-felles/pimc-referanse.json`)) {
  pimcRef = JSON.parse(readFileSync(`${REPO}/trening-felles/pimc-referanse.json`, "utf8"));
}
// MesterAI-referansen (målt mot grådig via Swift-harnessen, samme metrikk som
// PIMC-streken) – fylles ut når `mesterai-referanse.json` finnes.
let mesterRef: { diff: number; kamper: number } | null = null;
if (existsSync(`${REPO}/trening-felles/mesterai-referanse.json`)) {
  mesterRef = JSON.parse(readFileSync(`${REPO}/trening-felles/mesterai-referanse.json`, "utf8"));
}

function skrivFiler(): void {
  mkdirSync(utMappe, { recursive: true });
  // Uten .nojekyll kjører GitHub Pages siden gjennom Jekyll, og det bygget
  // feilet med jevne mellomrom ("Page build failed") på pushene våre hvert
  // 2. minutt. Med filen kopieres filene rett ut – ingen byggsteg å feile.
  writeFileSync(`${utMappe}/.nojekyll`, "");
  writeFileSync(
    `${utMappe}/data.json`,
    JSON.stringify({
      oppdatert: new Date().toISOString(),
      maskin: hostname(),
      overgang: historikk?.overgang ?? {},
      // Linjene som finnes på disk akkurat nå – siden bruker denne til å
      // avgjøre hva som er i fokus, så et nytt løp ikke krever kodeendring.
      fokusLinjer: aktiveLinjer,
      // Hvilke linjer som faktisk KJØRER nå (hjerteslag < 10 min). Stoppede
      // linjer skal gråes ut på siden – ellers ser en frosset kurve like
      // «levende» ut som en som trener.
      levende: puls.filter((p) => p.hjerteslagMin < 10).map((p) => p.navn),
      puls,
      e1,
      serier,
      projeksjoner,
      pimcRef,
      mesterRef,
    }),
  );
  writeFileSync(`${utMappe}/index.html`, MAL());
}
skrivFiler();
console.log(`Skrev ${utMappe}/data.json (${serier.length} serier) + index.html`);

// --- Publiser til gh-pages --------------------------------------------------
// Taper vi kappløpet mot en annen publisist (skykjøringen pusher til samme
// gren), tar vi deres commit som utgangspunkt, skriver filene på nytt og
// prøver igjen – i stedet for å la pushen ryke.
if (medPages) {
  for (let forsøk = 1; forsøk <= 3; forsøk++) {
    try {
      if (kjør("git status --porcelain", PAGES).trim() === "") {
        console.log("Ingen endringer å publisere");
        break;
      }
      kjør("git add -A", PAGES);
      kjør('git commit -m "Oppdater fremgangsgraf"', PAGES);
      kjør("git push origin gh-pages", PAGES);
      console.log("Publiserte til gh-pages");
      break;
    } catch (feil) {
      console.error(`Publisering feilet (forsøk ${forsøk}/3): ${String(feil).slice(0, 300)}`);
      if (forsøk === 3) break;
      try {
        kjør("git fetch origin gh-pages", PAGES);
        kjør("git reset --hard FETCH_HEAD", PAGES);
        skrivFiler();
      } catch (feil2) {
        console.error(`Klarte ikke synkronisere gh-pages: ${String(feil2).slice(0, 300)}`);
      }
    }
  }
}

// --- Sidemal (selvoppdaterende klient) --------------------------------------
function MAL(): string {
  return `<!doctype html><html lang="no"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Amerikaneren-NEAT: fremgang</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; background:#fcfcfb; color:#0b0b0b; font:14px/1.45 system-ui,sans-serif; }
  @media (prefers-color-scheme: dark) { body { background:#1a1a19; color:#fff; } }
  .rot { max-width:1000px; margin:0 auto; padding:20px;
    --tx2:#52514e; --grid:#e8e7e3;
    --fokusC4:#2a78d6; --fokusD1:#d92b2b; --fokusD2:#e8590c; --retirert:#a5a39c; --mester:#1f9d55; --fokusE1:#7048e8; }
  @media (prefers-color-scheme: dark) { .rot { --tx2:#c3c2b7; --grid:#33322f;
    --fokusC4:#4593f0; --fokusD1:#f0524a; --fokusD2:#ff922b; --retirert:#6e6d67; --mester:#33c777; --fokusE1:#9775fa; } }
  h1 { font-size:19px; margin:0 0 2px; } .sub { color:var(--tx2); margin:0 0 12px; font-size:13px; }
  .akse { font-size:11px; fill:var(--tx2); } .merk { font-size:12px; font-weight:600; }
  .lgr { display:flex; flex-wrap:wrap; gap:14px; margin:0 0 6px; font-size:12.5px; color:var(--tx2); }
  .lg i { display:inline-block; width:14px; height:3px; border-radius:2px; margin-right:5px; vertical-align:middle; }
  .lg i.strek { background:repeating-linear-gradient(90deg,var(--tx2) 0 5px,transparent 5px 9px); }
  svg { width:100%; height:auto; display:block; }
  #tt { position:fixed; pointer-events:none; background:#fcfcfb; border:1px solid var(--grid);
    border-radius:6px; padding:6px 9px; font-size:12px; display:none; box-shadow:0 2px 8px rgb(0 0 0 / .2); color:#0b0b0b; }
  @media (prefers-color-scheme: dark) { #tt { background:#1a1a19; color:#fff; } }
  table { border-collapse:collapse; margin-top:8px; font-size:13px; color:var(--tx2); }
  td,th { padding:3px 12px 3px 0; text-align:left; } th { font-weight:600; }
  .puls { display:flex; flex-wrap:wrap; gap:8px; margin:0 0 12px; }
  .kort { border:1px solid var(--grid); border-radius:999px; padding:3px 12px; font-size:12.5px; color:var(--tx2); }
  .gtit { font-size:14px; margin:18px 0 2px; } .gtit span { font-weight:400; color:var(--tx2); font-size:12.5px; }
  .prikk { display:inline-block; width:7px; height:7px; border-radius:50%; background:#2f9e44; margin-right:6px; }
  .prikk.stille { background:#d92b2b; }
  .e1 { border:1px solid var(--grid); border-radius:10px; padding:12px 14px; margin:0 0 14px; }
  .e1 h2 { font-size:14px; margin:0 0 2px; } .e1 p { margin:0 0 8px; font-size:12.5px; color:var(--tx2); }
  .e1 .tall { display:flex; flex-wrap:wrap; gap:16px; font-size:12.5px; color:var(--tx2); margin-bottom:6px; }
  .e1 .tall b { color:var(--fokusE1); }
</style></head><body><div class="rot">
<h1>Amerikaneren-NEAT: kvalitet per modell</h1>
<p class="sub">Poengdifferanse per kamp, glidende snitt over 5 målinger (prikker = enkeltmålinger).
<b>To målestokker, aldri i samme kurve:</b> heltrukket = mot grådig-boten (historisk, og en svak motstander – den byr aldri over 5),
stiplet tykk = mot NevroHjerne, appens ferdigtrente nett. 0 = jevnt med den motstanderen kurven måles mot.
<b id="stempel"></b><span id="vert"></span> · siden henter nye tall hvert minutt.</p>
<div class="puls" id="puls"></div>
<div id="e1"></div>
<div class="lgr" id="legend"></div>
<h3 class="gtit">Mot NevroHjerne <span>– den harde målestokken</span></h3>
<div id="grafNevro"></div>
<h3 class="gtit">Mot grådig-boten <span>– historisk, svak motstander som aldri byr over 5</span></h3>
<div id="grafGraadig"></div><div id="tt"></div>
<table id="tabell"></table>
<script>
const W=960,H=560,ML=56,MR=150,MT=30,MB=46,PW=W-ML-MR,PH=H-MT-MB;
let DATA=null;
// C4 (blå) og D1 (rød) er i fokus; pensjonerte linjer (A, B, C, C2, C3) gråes ut.
// Fokuslinjene kommer fra DATAENE (pulsen lister linjene som finnes på
// disk), ikke fra en håndredigert liste – et nytt løp dukker opp av seg
// selv. Farger er faste for de historiske linjene og tildeles ellers fra
// paletten etter navn, så en linje beholder fargen sin mellom oppdateringer.
// Én farge per LINJE, brukt likt i begge grafer, så øyet kan følge en linje
// på tvers. Rekkefølgen er valgt for kontrast også i mørk modus.
const LINJEFARGER={C4:"#1c7ed6",D1:"#e8590c",D2:"#0d8050",D3:"#c2255c",D5:"#7048e8",D6:"#f59f00",A:"#868e96",B:"#868e96",C:"#868e96",C2:"#868e96",C3:"#868e96"};
const PALETT=["#12b886","#4c6ef5","#e64980","#fd7e14","#15aabf"];
// «Fokus» = linjen KJØRER nå. Stoppede linjer tegnes grå og tynne, selv om
// de fortsatt har en kurve i historikken.
function fokus(n){return (DATA&&DATA.levende||DATA&&DATA.fokusLinjer||[]).includes(n);}
function farge(n){
  if(!fokus(n)) return "var(--retirert)";
  if(LINJEFARGER[n]) return LINJEFARGER[n];
  const liste=(DATA&&DATA.fokusLinjer||[]).filter(x=>!LINJEFARGER[x]);
  return PALETT[liste.indexOf(n)%PALETT.length];
}
async function last(){
  try{
    const r=await fetch("data.json?ts="+Date.now(),{cache:"no-store"});
    DATA=await r.json(); tegn();
  }catch(e){/* prøver igjen */}
}
function tegn(){
  const d=DATA; if(!d) return;
  // Pulsen: lever linja NÅ? Kurven flytter seg bare hver 10. generasjon.
  document.getElementById("puls").innerHTML=(d.puls||[]).map(function(x){
    const stille=x.hjerteslagMin>10;
    return '<span class="kort"><i class="prikk'+(stille?' stille':'')+'"></i><b style="color:'+farge(x.navn)+'">'+x.navn+'</b>'+
      ' gen '+x.generasjon+
      (x.genPerTime!==null&&x.genPerTime!==undefined?' · '+x.genPerTime+' gen/t':'')+
      (x.gullDiff!==null&&x.gullDiff!==undefined?' · gull '+(x.gullDiff>0?'+':'')+x.gullDiff+' ('+(x.gullMot||'grådig')+')':'')+
      (stille?' · stille i '+x.hjerteslagMin+' min':'')+'</span>';
  }).join("");
  tegnE1(d.e1);
  const projs=d.projeksjoner||[];

  // TO GRAFER. De to målestokkene hører ikke hjemme i samme rute: en kurve
  // på -45 mot nevro og en på +50 mot grådig sier ingenting sammen, og
  // felles y-akse tvang begge inn i et spenn der ingen av dem var lesbare.
  function tegnRute(boksId, mot, tittelXMAX){
    const serier=d.serier.filter(x=>x.mot===mot);
    const boks=document.getElementById(boksId);
    if(!boks) return null;
    if(serier.length===0){ boks.innerHTML='<p class="sub">ingen målinger ennå</p>'; return null; }
    const pr=projs.filter(p=>p.mot===mot);
    const refs = mot==="grådig" ? [d.pimcRef&&{v:d.pimcRef.diff,t:"PIMC (+"+d.pimcRef.diff+")",c:"var(--tx2)"},
                                   d.mesterRef&&{v:d.mesterRef.diff,t:"MesterAI (+"+d.mesterRef.diff+")",c:"var(--mester)"}].filter(Boolean) : [];
    const verdier=[...serier.flatMap(x=>x.glatt.map(p=>p.v)), ...pr.flatMap(p=>p.band.flatMap(b=>[b.lo,b.hi])), ...refs.map(r=>r.v), 0];
    const rå=Math.max(...verdier), lav=Math.min(...verdier);
    const pad=Math.max(8,(rå-lav)*0.12);
    const YMAX=Math.ceil((rå+pad)/10)*10, YMIN=Math.floor((lav-pad)/10)*10;
    const XMAX=tittelXMAX;
    const X=g=>ML+PW*g/XMAX, Y=v=>MT+PH*(YMAX-v)/(YMAX-YMIN);
    const sti=p=>"M"+p.map(q=>X(q.g).toFixed(1)+" "+Y(q.v).toFixed(1)).join(" L");
    let s2='';
    const steg2=Math.max(10,Math.round((YMAX-YMIN)/5/10)*10);
    for(let v=Math.ceil(YMIN/steg2)*steg2; v<=YMAX; v+=steg2){
      const y=Y(v);
      s2+='<line x1="'+ML+'" y1="'+y+'" x2="'+(ML+PW)+'" y2="'+y+'" '+(v===0?'stroke="var(--tx2)" stroke-width="1.5"':'stroke="var(--grid)"')+'/>';
      s2+='<text x="'+(ML-8)+'" y="'+(y+4)+'" text-anchor="end" class="akse">'+(v>0?"+":"")+v+'</text>';
    }
    if(YMIN<=0&&YMAX>=0) s2+='<text x="'+(ML+PW-6)+'" y="'+(Y(0)-7)+'" text-anchor="end" class="akse">jevnt med '+(mot==="nevro"?"NevroHjerne":"grådig-boten")+'</text>';
    for(const r of refs){ const y=Y(r.v);
      s2+='<line x1="'+ML+'" y1="'+y+'" x2="'+(ML+PW)+'" y2="'+y+'" stroke="'+r.c+'" stroke-width="1.5" stroke-dasharray="2 3"/>';
      s2+='<text x="'+(ML+PW-6)+'" y="'+(y-7)+'" text-anchor="end" class="merk" fill="'+r.c+'">'+r.t+'</text>'; }
    const xsteg=XMAX>4000?1000:XMAX>1500?500:XMAX>600?200:100;
    for(let g=0;g<=XMAX;g+=xsteg) s2+='<text x="'+X(g)+'" y="'+(MT+PH+22)+'" text-anchor="middle" class="akse">'+g+'</text>';
    for(const p of pr){ if(!p.proj.length) continue; const col=farge(p.navn);
      const poly=p.band.map(b=>X(b.g).toFixed(1)+","+Y(b.hi).toFixed(1)).join(" ")+" "+[...p.band].reverse().map(b=>X(b.g).toFixed(1)+","+Y(b.lo).toFixed(1)).join(" ");
      s2+='<polygon points="'+poly+'" fill="'+col+'" opacity="0.07"/>';
      s2+='<path d="'+sti(p.proj)+'" fill="none" stroke="'+col+'" stroke-width="1.6" stroke-dasharray="7 5" opacity="0.8"/>'; }
    // Pensjonerte i bakgrunnen, aktive linjer over og tykkere.
    for(const serie of [...serier].sort((a,b)=>(fokus(a.navn)?1:0)-(fokus(b.navn)?1:0))){
      const f=fokus(serie.navn), col=farge(serie.navn);
      if(f) for(const p of serie.rå) if(p.v>=YMIN&&p.v<=YMAX)
        s2+='<circle cx="'+X(p.g).toFixed(1)+'" cy="'+Y(p.v).toFixed(1)+'" r="1.8" fill="'+col+'" opacity="0.18"/>';
      s2+='<path d="'+sti(serie.glatt)+'" fill="none" stroke="'+col+'" stroke-width="'+(f?2.6:1.2)+'"'+(f?'':' opacity="0.4"')+' stroke-linejoin="round"/>';
      const sp=serie.glatt[serie.glatt.length-1];
      s2+='<text x="'+(X(sp.g)+7)+'" y="'+(Y(sp.v)+4)+'" class="merk"'+(f?'':' opacity="0.5" font-size="10"')+' fill="'+col+'">'+serie.navn+'</text>';
    }
    boks.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Fremgang mot '+mot+'">'+
      '<line x1="'+ML+'" y1="'+MT+'" x2="'+ML+'" y2="'+(MT+PH)+'" stroke="var(--grid)"/>'+
      '<line x1="'+ML+'" y1="'+(MT+PH)+'" x2="'+(ML+PW)+'" y2="'+(MT+PH)+'" stroke="var(--grid)"/>'+
      '<text x="'+(ML+PW/2)+'" y="'+(H-8)+'" text-anchor="middle" class="akse">generasjon</text>'+s2+'</svg>';
    return XMAX;
  }
  // Felles x-akse i begge ruter, så generasjonstallene står på linje.
  const XMAX=Math.max(...d.serier.map(x=>x.rå[x.rå.length-1].g), ...projs.flatMap(p=>p.proj.length?[p.proj[p.proj.length-1].g]:[0]))*1.02;
  tegnRute("grafNevro","nevro",XMAX);
  tegnRute("grafGraadig","grådig",XMAX);

  const lever=(d.levende||[]);
  const stoppet=(d.fokusLinjer||[]).filter(n=>!lever.includes(n));
  document.getElementById("legend").innerHTML=
    lever.map(n=>'<span class="lg" style="font-weight:600"><i style="background:'+farge(n)+'"></i>'+n+' <span style="color:#2f9e44">●</span></span>').join("")+
    (stoppet.length?'<span class="lg" style="opacity:.55"><i style="background:#868e96"></i>stoppet: '+stoppet.join(", ")+'</span>':'')+
    '<span class="lg" style="opacity:.55"><i style="background:#868e96"></i>pensjonerte</span>'+
    '<span class="lg"><i class="strek"></i>stiplet: forventet utvikling · referansenivåer</span>';
  document.getElementById("tabell").innerHTML=
    '<tr><th>Modell</th><th>Målestokk</th><th>Siste gen</th><th>Beste</th><th>Nå</th></tr>'+
    d.serier.filter(x=>(d.fokusLinjer||[]).includes(x.navn)).map(x=>{
      const beste=Math.max(...x.glatt.map(p=>p.v)), nå=x.glatt[x.glatt.length-1].v;
      const lev=fokus(x.navn);
      return '<tr'+(lev?'':' style="opacity:.5"')+'><td style="color:'+farge(x.navn)+';font-weight:600">'+x.navn+(lev?' ●':'')+'</td><td>'+(x.mot==="nevro"?"NevroHjerne":"grådig")+'</td><td>'+x.rå[x.rå.length-1].g+'</td><td>'+(beste>0?"+":"")+beste.toFixed(0)+'</td><td>'+(nå>0?"+":"")+nå.toFixed(0)+'</td></tr>';
    }).join("");
  document.getElementById("stempel").textContent="Sist oppdatert "+new Date(d.oppdatert).toLocaleTimeString("nb-NO");
  document.getElementById("vert").textContent=d.maskin?" (trener på "+d.maskin+")":"";
}
// E1 destilleres fra det eksakte orakelet og har ingen generasjoner. Her er
// x-aksen antall orakel-stillinger den har lært av, og y-aksen den PARRET
// målte differansen mot NevroHjerne. 0 er delmålet, ikke et vilkårlig punkt.
function tegnE1(e){
  const boks=document.getElementById("e1");
  if(!e){boks.innerHTML="";return;}
  const p=e.punkter||[];
  let graf="";
  if(p.length>0){
    const w=640,h=170,ml=44,mr=90,mt=14,mb=28,pw=w-ml-mr,ph=h-mt-mb;
    const xmax=Math.max(...p.map(q=>q.x))*1.15||1;
    const alle=p.flatMap(q=>[q.diff-q.se,q.diff+q.se]).concat([0,2]);
    const ymax=Math.max(...alle)+3, ymin=Math.min(...alle)-3;
    const X=x=>ml+pw*x/xmax, Y=v=>mt+ph*(ymax-v)/(ymax-ymin);
    graf+='<line x1="'+ml+'" y1="'+Y(0)+'" x2="'+(ml+pw)+'" y2="'+Y(0)+'" stroke="var(--tx2)" stroke-width="1.5"/>';
    graf+='<text x="'+(ml+pw+6)+'" y="'+(Y(0)+4)+'" class="merk" fill="var(--tx2)">jevnt med NevroHjerne</text>';
    if(p.length>1){
      const sti="M"+p.map(q=>X(q.x).toFixed(1)+" "+Y(q.diff).toFixed(1)).join(" L");
      graf+='<path d="'+sti+'" fill="none" stroke="var(--fokusE1)" stroke-width="2.4" stroke-linejoin="round"/>';
    }
    for(const q of p){
      graf+='<line x1="'+X(q.x).toFixed(1)+'" y1="'+Y(q.diff-q.se).toFixed(1)+'" x2="'+X(q.x).toFixed(1)+'" y2="'+Y(q.diff+q.se).toFixed(1)+'" stroke="var(--fokusE1)" stroke-width="1.2" opacity="0.6"/>';
      graf+='<circle cx="'+X(q.x).toFixed(1)+'" cy="'+Y(q.diff).toFixed(1)+'" r="'+(q.hybrid?4:3)+'" fill="'+(q.hybrid?"none":"var(--fokusE1)")+'" stroke="var(--fokusE1)" stroke-width="1.6"/>';
    }
    const sisteP=p[p.length-1];
    graf+='<text x="'+(X(sisteP.x)+7)+'" y="'+(Y(sisteP.diff)+4)+'" class="merk" fill="var(--fokusE1)">'+(sisteP.diff>0?"+":"")+sisteP.diff.toFixed(1)+'</text>';
    for(const v of [ymin,0,ymax]) graf+='<text x="'+(ml-8)+'" y="'+(Y(v)+4)+'" text-anchor="end" class="akse">'+(v>0?"+":"")+v.toFixed(0)+'</text>';
    graf+='<text x="'+(ml+pw/2)+'" y="'+(h-6)+'" text-anchor="middle" class="akse">orakel-stillinger nettet har lært av</text>';
    graf='<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="E1-fremgang">'+graf+'</svg>';
  }
  const k=n=>n>=1e6?(n/1e6).toFixed(2)+" mill.":n>=1e3?Math.round(n/1e3)+"k":String(n);
  const siste=p.length>0?p[p.length-1]:null;
  boks.innerHTML='<div class="e1"><h2 style="color:var(--fokusE1)">E1 – destillert fra det eksakte orakelet</h2>'+
    '<p>Lærer av dobbelt-dummy-fasit uten tidspress, ikke av MesterAI – en elev når ikke forbi læreren sin. '+
    'Budgivning og trumfvalg er identiske med NevroHjerne, så differansen under er rent kortspill.</p>'+
    '<div class="tall">'+
      '<span>datasett <b>≈'+k(e.stillinger)+'</b> stillinger ('+e.mb+' MB, '+e.skard+' skard)</span>'+
      (e.valTreff!==null&&e.valTreff!==undefined?'<span>treff mot fasit <b>'+e.valTreff+' %</b></span>':'')+
      (siste?'<span>mot NevroHjerne <b>'+(siste.diff>0?"+":"")+siste.diff.toFixed(1)+' ± '+siste.se.toFixed(1)+'</b></span>':'<span>ingen måling ennå</span>')+
      (siste&&siste.diff>0?'<span><b>✓ delmålet er nådd</b></span>':'')+
    '</div>'+graf+
    (p.length>0?'<p style="margin-top:6px">Fylt punkt = rent nett · åpen ring = med eksakt sluttspill oppå. Loddrett strek = ett standardavvik.</p>':'')+
    '</div>';
}
// (kobleHover fjernet: den hektet seg på det gamle enkelt-plottet id="plot",
// som ikke finnes lenger etter oppdelingen i to ruter.)

last(); setInterval(last, 60_000);
</script></div></body></html>`;
}
