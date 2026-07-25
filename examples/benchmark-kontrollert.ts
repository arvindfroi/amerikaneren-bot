/**
 * Kontrollert benchmark: nevronett vs. PIMC vs. MesterAI på samme målestokk,
 * med eksplisitt styring på de to feilkildene som ellers dominerer tallene –
 * STØY (kortflaks) og POENGDRIFT (metrikken driver med kamplengden).
 *
 * ---------------------------------------------------------------------------
 * Hvorfor en ny harness ved siden av examples/benchmark.ts
 * ---------------------------------------------------------------------------
 * Den gamle harnessen måler «snittpoeng per kamp» over N kamper der kandidaten
 * roterer sete med frøet (frø g ⇒ sete g % 4). To problemer:
 *
 *  1) POENGDRIFT. En kamp går til 100 poeng. Sluttpoengsummen er derfor låst
 *     til kamplengden: vinneren lander alltid på ~100–110 uansett hvor mye
 *     bedre den er, og en taper som drar kampen ut i mange runder samler opp
 *     forsvarspoeng den ikke fortjener. Metrikken er både METTET i toppen og
 *     KONFUNDERT med antall runder. Her måles derfor primært
 *     POENG PER RUNDE og DIFFERANSE PER RUNDE (kandidatens poeng minus
 *     snittet av de tre motstanderne, delt på runder spilt) – begge er
 *     skalafrie og metter ikke. Sluttpoeng rapporteres fortsatt, men som
 *     sekundærtall, og drift-seksjonen viser hvor sterkt det henger sammen
 *     med kamplengden.
 *
 *  2) STØY. Kortflaks er enorm i Amerikaner. Her spilles hver giving som en
 *     DUPLIKAT-BLOKK: samme frø spilles fire ganger, med kandidaten i sete
 *     0, 1, 2 og 3. Kort- og posisjonsflaks nulles ut innenfor blokken, og
 *     ANALYSE-ENHETEN er blokken, ikke enkeltkampen (de fire kampene i en
 *     blokk deler kort og er korrelerte – å telle dem som uavhengige ville
 *     undervurdert usikkerheten). Alle kandidater møter nøyaktig de samme
 *     blokkene, så sammenlikningen mot ankeret er PARET: usikkerheten på
 *     differansen er mye mindre enn på hvert enkelt nivå.
 *
 * ---------------------------------------------------------------------------
 * Driftdiagnostikk (skrives ut til slutt)
 * ---------------------------------------------------------------------------
 *  - Poengdrift:  korrelasjon mellom sluttpoeng og kamplengde + hva metrikk-
 *                 valget gjør med rangeringen.
 *  - Tidsdrift:   OLS-helling for blokkmetrikken mot blokknummer. Slår den
 *                 ut, har noe endret seg UNDERVEIS i kjøringen (typisk at
 *                 maskinen blir varm og de tidsbudsjetterte søkebotene
 *                 rekker færre verdener) – da er tallene ikke stasjonære.
 *  - Setedrift:   snitt per sete. Duplikatblokken skal ha fjernet dette;
 *                 slår det likevel ut, er noe skjevt i utdelingen.
 *  - Støygulv:    med --gjenta kjøres hele rutenettet to ganger med SAMME
 *                 frø. MesterAI og NevroHjerne er ikke deterministiske
 *                 mellom kjøringer, så differansen mellom replikatene er et
 *                 direkte mål på hvor mye støy som er igjen etter alle
 *                 kontrollene – ingen forskjell mindre enn dette er ekte.
 *
 * ---------------------------------------------------------------------------
 * Rettferdig søkebudsjett
 * ---------------------------------------------------------------------------
 * Swift rekker mange flere samplede verdener per millisekund enn Node. Å gi
 * begge «450 ms» måler derfor språk, ikke spillstyrke. Med --verdener N
 * kjøres i stedet et VERDENSMATCHET oppsett: MesterAI får et så stort
 * tidsbudsjett at den alltid når taket sitt, og begge søkebotene får samme
 * antall verdener per kortvalg og samme eksakte sluttspillsdybde. Det er den
 * sammenlikningen som faktisk handler om algoritmene.
 *
 * ---------------------------------------------------------------------------
 * Kjøring
 * ---------------------------------------------------------------------------
 *   bash arena/hent-appkode.sh /sti/til/Amerikaneren-App
 *   cd arena/adapter && swift build -c release && cd ../..
 *
 *   node examples/benchmark-kontrollert.ts --blokker 12 --verdener 28
 *   node examples/benchmark-kontrollert.ts --kun pimc,mester,c4 --gjenta
 *   node examples/benchmark-kontrollert.ts --nett e1=trening/e1.json,d5=trening/d5.json
 *
 * | Flagg        | Standard | Betydning                                        |
 * |--------------|----------|--------------------------------------------------|
 * | --blokker    | 8        | Duplikatblokker (1 blokk = 4 kamper, ett frø)    |
 * | --froe       | 90000    | Frøbase; blokk b bruker frø froe+b               |
 * | --verdener   | 28       | Verdensmatchet søk: verdener per kortvalg        |
 * | --terskel    | 6        | Stikk som løses eksakt (begge søkebotene)        |
 * | --ms         | 0        | > 0: mål i millisekunder i stedet for verdener   |
 * | --kun        | –        | Kommaliste med kandidat-id-er                    |
 * | --nett       | –        | navn=sti,navn=sti – NEAT-genomer som kandidater  |
 * | --gjenta     | av       | Kjør rutenettet to ganger (måler støygulvet)     |
 * | --anker      | vanskelig| Motstanderen kandidaten måles mot                |
 * | --json       | –        | Skriv råresultatene til denne fila               |
 * | --adapter    | …/adapter| Sti til adapterbinæren                           |
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { type Farge, type Kort, kortId } from "../src/kort.ts";
import {
  type GameState,
  type Handling,
  type Hendelse,
  opprettSpill,
  utfør,
} from "../src/motor.ts";
import { velgHandling as pimcHandling } from "../src/bot/bot.ts";
import { NeatAgent } from "../src/neat/agent.ts";
import { genomFraJson } from "../src/neat/genom.ts";
import { grådigHandling } from "./graadig.ts";
import {
  Adapter,
  type AdapterSvar,
  handlingFraJson,
  handlingTilJson,
  rundeStart,
} from "../arena/adapterklient.ts";

// ---------------------------------------------------------------------------
// Kommandolinje
// ---------------------------------------------------------------------------

function tallFlagg(navn: string, standard: number): number {
  const i = process.argv.indexOf(`--${navn}`);
  if (i < 0 || i + 1 >= process.argv.length) return standard;
  const v = Number(process.argv[i + 1]);
  if (!Number.isFinite(v)) throw new Error(`Ugyldig verdi for --${navn}`);
  return v;
}
function tekstFlagg(navn: string, standard: string): string {
  const i = process.argv.indexOf(`--${navn}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1]! : standard;
}
const harFlagg = (navn: string): boolean => process.argv.includes(`--${navn}`);

// Kan overstyres av --fra (reanalyse leser oppsettet fra fila).
let antallBlokker = tallFlagg("blokker", 8);
const frøBase = tallFlagg("froe", 90000);
const verdener = tallFlagg("verdener", 28);
const terskel = tallFlagg("terskel", 6);
const tidMs = tallFlagg("ms", 0);
const gjenta = harFlagg("gjenta");
let ankerId = tekstFlagg("anker", "vanskelig");
const jsonUt = tekstFlagg("json", "");
const adapterSti = tekstFlagg("adapter", "arena/adapter/.build/release/adapter");
const kunArg = tekstFlagg("kun", "");
const nettArg = tekstFlagg("nett", "");

/** Verdensmatchet (default) eller tidsmatchet søk. */
const tidsmatchet = tidMs > 0;

// ---------------------------------------------------------------------------
// Kandidater
// ---------------------------------------------------------------------------

/** Én sittende spiller i én kamp. Native kandidater bygges per kamp. */
interface Sittende {
  handling(state: GameState, sete: number): Handling;
}

interface Kandidat {
  readonly id: string;
  readonly navn: string;
  readonly kilde: "motor" | "app";
  /** Søkebot – berøres av tids-/verdensbudsjettet. */
  readonly søk: boolean;
  /** App-side bot-type (adapteren), eller null for native. */
  readonly appType: string | null;
  /** Fabrikk for native kandidater: ny, ren spiller per kamp. */
  readonly lag: ((frø: number, sete: number) => Sittende) | null;
}

function pimcSittende(frø: number, sete: number): Sittende {
  let n = 0;
  return {
    handling(state) {
      // Deterministisk, men ulikt per beslutning: samme kamp gir samme spill.
      const d = (frø * 131 + sete * 17 + state.rundeNr * 7 + n++) >>> 0;
      return tidsmatchet
        ? pimcHandling(state, { tidsbudsjettMs: tidMs, terskel, frø: d })
        : pimcHandling(state, { verdener, terskel, frø: d });
    },
  };
}

function nettSittende(genomJson: string): (frø: number, sete: number) => Sittende {
  const genom = genomFraJson(genomJson);
  return () => {
    // læringsrate 0: nettet er frosset under måling (som i nettspillet).
    const agent = new NeatAgent(structuredClone(genom), { læringsrate: 0 });
    agent.nyKamp();
    return { handling: (state) => agent.velgHandling(state) };
  };
}

const KANDIDATER: Kandidat[] = [
  { id: "pimc", navn: "PIMC (denne motoren)", kilde: "motor", søk: true, appType: null, lag: pimcSittende },
  {
    id: "graadig",
    navn: "Grådig heuristikk",
    kilde: "motor",
    søk: false,
    appType: null,
    lag: () => ({ handling: (state) => grådigHandling(state) }),
  },
  { id: "mester", navn: "MesterAI (President)", kilde: "app", søk: true, appType: "mester", lag: null },
  { id: "nevro", navn: "NevroHjerne (appens nett)", kilde: "app", søk: false, appType: "nevro", lag: null },
  { id: "vanskelig", navn: "Vanskelig (anker)", kilde: "app", søk: false, appType: "vanskelig", lag: null },
  { id: "middels", navn: "Middels", kilde: "app", søk: false, appType: "middels", lag: null },
  { id: "lett", navn: "Lett", kilde: "app", søk: false, appType: "lett", lag: null },
];

// --nett navn=sti,navn=sti → NEAT-genomer fra repoets egen treningslinje.
for (const par of nettArg.split(",").filter(Boolean)) {
  const delt = par.indexOf("=");
  if (delt < 0) throw new Error(`--nett forventer navn=sti, fikk «${par}»`);
  const navn = par.slice(0, delt);
  const sti = par.slice(delt + 1);
  if (!existsSync(sti)) throw new Error(`Fant ikke genomfila ${sti} (--nett ${navn})`);
  KANDIDATER.push({
    id: navn,
    navn: `${navn.toUpperCase()} (NEAT-nett)`,
    kilde: "motor",
    søk: false,
    appType: null,
    lag: nettSittende(readFileSync(sti, "utf8")),
  });
}

const kun = kunArg ? new Set(kunArg.split(",")) : null;
const valgte = KANDIDATER.filter((k) => !kun || kun.has(k.id));
const reanalyse = tekstFlagg("fra", "");
const anker = KANDIDATER.find((k) => k.id === ankerId);
if (!anker && !reanalyse) throw new Error(`Ukjent anker «${ankerId}»`);
if (kun && !kun.has(ankerId) && anker) valgte.push(anker); // ankeret må alltid måles selv
if (valgte.length === 0 && !reanalyse) throw new Error("Ingen kandidater valgt");

if (!reanalyse && !existsSync(adapterSti)) {
  console.error(`Fant ikke adapteren på ${adapterSti}. Bygg den – se arena/README.md.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Én kamp
// ---------------------------------------------------------------------------

interface KampStat {
  readonly blokk: number;
  readonly frø: number;
  readonly sete: number;
  /** Kandidatens sluttpoeng. */
  readonly poeng: number;
  /** Snittet av de tre ankermotstanderne. */
  readonly motstandPoeng: number;
  readonly runder: number;
  readonly vant: boolean;
  readonly budVunnet: number;
  readonly budKlart: number;
  readonly beslutninger: number;
  readonly sekunder: number;
  /** Poeng gitt i hver runde, per sete. Lar metrikken avkortes til en
   *  felles horisont, se `horisontDiff`. */
  readonly rundeDelta: number[][];
}

const FASE_PAR: Record<string, string[]> = {
  BUDRUNDE: ["budrunde"],
  VRAK: ["byttekort"],
  VELG: ["velgTrumf"],
  SPILL: ["spill"],
  RUNDE_SLUTT: ["rundeFerdig", "spillFerdig"],
  FERDIG: ["spillFerdig"],
};

/** Fase OG poeng må stemme – ellers har motorene glidd fra hverandre. */
function sjekkSynk(state: GameState, svar: AdapterSvar): void {
  if (!svar.fase || !(FASE_PAR[state.fase] ?? []).includes(svar.fase)) {
    throw new Error(`DESYNK: motoren i ${state.fase}, adapteren i ${String(svar.fase)}`);
  }
  const poeng = svar.poeng ?? [];
  for (let s = 0; s < state.antallSpillere; s++) {
    if ((poeng[s] ?? 0) !== (state.totalPoeng[s] ?? 0)) {
      throw new Error(`DESYNK poeng: ${JSON.stringify(poeng)} vs ${JSON.stringify(state.totalPoeng)}`);
    }
  }
}

async function spillKamp(
  adapter: Adapter,
  blokk: number,
  frø: number,
  sete: number,
  kandidat: Kandidat,
): Promise<KampStat> {
  // Setekartet: kandidaten i `sete`, ankeret i de tre andre.
  const påSete: (Kandidat)[] = [anker!, anker!, anker!, anker!];
  påSete[sete] = kandidat;

  const appBots: Record<string, string> = {};
  for (let s = 0; s < 4; s++) {
    const app = påSete[s]!.appType;
    if (app !== null) appBots[String(s)] = app;
  }
  await adapter.send({ type: "nyKamp", adapterBots: appBots });

  let state = opprettSpill({ antallSpillere: 4 }, frø);
  await adapter.send(rundeStart(state));

  const native: (Sittende | null)[] = [null, null, null, null];
  for (let s = 0; s < 4; s++) {
    const k = påSete[s]!;
    if (k.lag !== null) native[s] = k.lag(frø + s * 1013904223, s);
  }

  const budVunnet = [0, 0, 0, 0];
  const budKlart = [0, 0, 0, 0];
  const rundeDelta: number[][] = [];
  let runder = 0;
  let beslutninger = 0;
  const start = Date.now();

  const håndter = async (hendelser: Hendelse[]): Promise<void> => {
    for (const h of hendelser) {
      if (h.type === "RUNDE_SLUTT") {
        runder++;
        rundeDelta.push(h.resultat.delta.slice());
        budVunnet[h.resultat.budvinner]!++;
        if (h.resultat.klart) budKlart[h.resultat.budvinner]!++;
      }
      if (h.type === "NY_RUNDE") await adapter.send(rundeStart(state));
    }
  };

  let vakt = 0;
  while (state.fase !== "FERDIG") {
    if (vakt++ > 40000) throw new Error("kampen henger");
    if (state.fase === "RUNDE_SLUTT") {
      const res = utfør(state, { type: "NESTE" });
      state = res.state;
      await håndter(res.hendelser);
      continue;
    }
    const aktør = state.fase === "VRAK" || state.fase === "VELG" ? state.budvinner! : state.iTur!;

    let handling: Handling;
    const egen = native[aktør];
    if (egen !== null) {
      handling = egen.handling(state, aktør);
    } else {
      const svar = await adapter.send({ type: "beslutt", sete: aktør });
      handling = handlingFraJson(svar.handling!);
    }
    if (aktør === sete) beslutninger++;

    const res = utfør(state, handling);
    state = res.state;
    sjekkSynk(state, await adapter.send({ type: "handling", handling: handlingTilJson(handling) }));
    await håndter(res.hendelser);
  }

  const poeng = state.totalPoeng;
  const andre = [0, 1, 2, 3].filter((s) => s !== sete);
  return {
    blokk,
    frø,
    sete,
    poeng: poeng[sete] ?? 0,
    motstandPoeng: andre.reduce((a, s) => a + (poeng[s] ?? 0), 0) / andre.length,
    runder,
    vant: state.vinner === sete,
    budVunnet: budVunnet[sete] ?? 0,
    budKlart: budKlart[sete] ?? 0,
    beslutninger,
    sekunder: (Date.now() - start) / 1000,
    rundeDelta,
  };
}

/**
 * DEN LENGDEUAVHENGIGE METRIKKEN.
 *
 * I et parti til 100 poeng er ALLE per-kamp-mål en funksjon av kamplengden:
 * kampen slutter nettopp når noen har nådd 100, så runder ≈ 100 / egen
 * poengrate. Det gjelder sluttpoeng OG poeng per runde – det er innebygd i
 * formatet, ikke en feil i metrikken.
 *
 * Kuttet her fjerner koblingen helt: hver kamp avkortes til de K FØRSTE
 * rundene, der K er det laveste rundetallet noen kamp i kjøringen hadde. Da
 * er nevneren identisk for alle kamper og alle boter, ingen kamp forkastes
 * (K er et minimum), og målstreken på 100 poeng rekker aldri å påvirke
 * tallet. Driftseksjonen viser korrelasjonen mot kamplengde for begge mål:
 * `diff/runde` ligger nær −1, `diff@K` skal ligge nær 0.
 */
function horisontDiff(k: KampStat, sete: number, K: number): number {
  const sum = [0, 0, 0, 0];
  for (let r = 0; r < Math.min(K, k.rundeDelta.length); r++) {
    for (let s = 0; s < 4; s++) sum[s]! += k.rundeDelta[r]![s] ?? 0;
  }
  const andre = [0, 1, 2, 3].filter((s) => s !== sete);
  const motstand = andre.reduce((a, s) => a + sum[s]!, 0) / andre.length;
  return (sum[sete]! - motstand) / K;
}

// ---------------------------------------------------------------------------
// Statistikk
// ---------------------------------------------------------------------------

/** t-kvantil, 95 % tosidig. Interpolerer mellom tabellverdier. */
function tKritisk(df: number): number {
  const tab: [number, number][] = [
    [1, 12.706], [2, 4.303], [3, 3.182], [4, 2.776], [5, 2.571], [6, 2.447],
    [7, 2.365], [8, 2.306], [9, 2.262], [10, 2.228], [11, 2.201], [12, 2.179],
    [13, 2.16], [14, 2.145], [15, 2.131], [16, 2.12], [17, 2.11], [18, 2.101],
    [19, 2.093], [20, 2.086], [22, 2.074], [24, 2.064], [26, 2.056], [28, 2.048],
    [30, 2.042], [40, 2.021], [60, 2.0], [120, 1.98], [100000, 1.96],
  ];
  if (df <= 1) return tab[0]![1];
  for (let i = 1; i < tab.length; i++) {
    const [d1, t1] = tab[i - 1]!;
    const [d2, t2] = tab[i]!;
    if (df <= d2) return t1 + ((t2 - t1) * (df - d1)) / (d2 - d1);
  }
  return 1.96;
}

interface Anslag {
  readonly n: number;
  readonly snitt: number;
  readonly se: number;
  readonly ci: number; // halv bredde, 95 %
}

function anslå(x: readonly number[]): Anslag {
  const n = x.length;
  const snitt = x.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { n, snitt, se: NaN, ci: NaN };
  const varians = x.reduce((a, b) => a + (b - snitt) ** 2, 0) / (n - 1);
  const se = Math.sqrt(varians / n);
  return { n, snitt, se, ci: tKritisk(n - 1) * se };
}

function korrelasjon(x: readonly number[], y: readonly number[]): number {
  const n = x.length;
  if (n < 3) return NaN;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - mx, dy = y[i]! - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx === 0 || syy === 0 ? NaN : sxy / Math.sqrt(sxx * syy);
}

/** OLS-helling av y mot x, med standardfeil og t-verdi. */
function helling(x: readonly number[], y: readonly number[]): { b: number; se: number; t: number } {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my);
    sxx += (x[i]! - mx) ** 2;
  }
  if (sxx === 0 || n < 3) return { b: NaN, se: NaN, t: NaN };
  const b = sxy / sxx;
  const a = my - b * mx;
  let rss = 0;
  for (let i = 0; i < n; i++) rss += (y[i]! - a - b * x[i]!) ** 2;
  const se = Math.sqrt(rss / (n - 2) / sxx);
  return { b, se, t: b / se };
}

// ---------------------------------------------------------------------------
// Kjøring
// ---------------------------------------------------------------------------

interface BotResultat {
  readonly kandidat: Kandidat;
  readonly kamper: KampStat[];
  /** Blokksnitt for hver metrikk – analyse-enheten. */
  readonly blokkPoengPerRunde: number[];
  readonly blokkDiffPerRunde: number[];
  readonly blokkVinnerandel: number[];
  readonly blokkSluttpoeng: number[];
}

function blokkAggreger(kamper: readonly KampStat[], blokker: number): BotResultat["blokkPoengPerRunde"][] {
  const ppr: number[] = [], dpr: number[] = [], vin: number[] = [], slutt: number[] = [];
  for (let b = 0; b < blokker; b++) {
    const i = kamper.filter((k) => k.blokk === b);
    if (i.length === 0) continue;
    ppr.push(i.reduce((a, k) => a + k.poeng / k.runder, 0) / i.length);
    dpr.push(i.reduce((a, k) => a + (k.poeng - k.motstandPoeng) / k.runder, 0) / i.length);
    vin.push(i.reduce((a, k) => a + (k.vant ? 1 : 0), 0) / i.length);
    slutt.push(i.reduce((a, k) => a + k.poeng, 0) / i.length);
  }
  return [ppr, dpr, vin, slutt];
}

async function kjørRutenett(adapter: Adapter, merkelapp: string): Promise<BotResultat[]> {
  const ut: BotResultat[] = [];
  for (const kandidat of valgte) {
    process.stdout.write(`  ${merkelapp}${kandidat.navn} … `);
    const kamper: KampStat[] = [];
    for (let b = 0; b < antallBlokker; b++) {
      for (let sete = 0; sete < 4; sete++) {
        kamper.push(await spillKamp(adapter, b, (frøBase + b) >>> 0, sete, kandidat));
      }
    }
    const [ppr, dpr, vin, slutt] = blokkAggreger(kamper, antallBlokker);
    const res: BotResultat = {
      kandidat,
      kamper,
      blokkPoengPerRunde: ppr!,
      blokkDiffPerRunde: dpr!,
      blokkVinnerandel: vin!,
      blokkSluttpoeng: slutt!,
    };
    ut.push(res);
    const a = anslå(dpr!);
    const sek = kamper.reduce((s, k) => s + k.sekunder, 0);
    console.log(
      `diff/runde ${a.snitt >= 0 ? "+" : ""}${a.snitt.toFixed(3)} ± ${a.ci.toFixed(3)}  ` +
        `(${(sek / kamper.length).toFixed(1)} s/kamp)`,
    );
  }
  return ut;
}

/** Felles horisont K = korteste kamp i kjøringen (0 hvis rådata mangler). */
function finnHorisont(res: readonly BotResultat[]): number {
  let K = Infinity;
  for (const r of res) {
    for (const k of r.kamper) {
      const n = k.rundeDelta?.length ?? 0;
      if (n < K) K = n;
    }
  }
  return Number.isFinite(K) ? K : 0;
}

/** Blokksnitt av diff@K – analyse-enheten, som for de andre metrikkene. */
function blokkHorisont(r: BotResultat, K: number, blokker: number): number[] {
  const ut: number[] = [];
  for (let b = 0; b < blokker; b++) {
    const i = r.kamper.filter((k) => k.blokk === b);
    if (i.length === 0) continue;
    ut.push(i.reduce((a, k) => a + horisontDiff(k, k.sete, K), 0) / i.length);
  }
  return ut;
}

const pad = (s: string, n: number): string => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));
const padV = (s: string, n: number): string => (s.length >= n ? s : " ".repeat(n - s.length) + s);

function skrivRangering(res: readonly BotResultat[]): void {
  const ankerRes = res.find((r) => r.kandidat.id === ankerId)!;
  const K = finnHorisont(res);

  const rader = res.map((r) => {
    const hor = K > 0 ? anslå(blokkHorisont(r, K, antallBlokker)) : null;
    const dpr = anslå(r.blokkDiffPerRunde);
    const ppr = anslå(r.blokkPoengPerRunde);
    const vin = anslå(r.blokkVinnerandel);
    const slutt = anslå(r.blokkSluttpoeng);
    // Paret mot ankeret: samme blokker, så differansen per blokk er paret.
    const paret = anslå(r.blokkDiffPerRunde.map((v, i) => v - (ankerRes.blokkDiffPerRunde[i] ?? 0)));
    const budV = r.kamper.reduce((a, k) => a + k.budVunnet, 0);
    const budK = r.kamper.reduce((a, k) => a + k.budKlart, 0);
    return { r, dpr, ppr, vin, slutt, paret, budV, budK, hor };
  });
  rader.sort((a, b) => b.dpr.snitt - a.dpr.snitt);

  console.log(`\n=== Rangering: differanse per runde mot 3× ${ankerId} (95 % KI) ===`);
  console.log(
    `${pad("Bot", 24)} ${pad("Kilde", 6)} ${padV("diff/runde", 16)} ${padV(`diff@${K}r`, 16)} ` +
      `${padV("Vinn%", 7)} ${padV("Sluttp.", 8)} ${padV("Budtreff", 9)}`,
  );
  for (const x of rader) {
    const treff = x.budV > 0 ? `${((100 * x.budK) / x.budV).toFixed(0)} %` : "–";
    console.log(
      `${pad(x.r.kandidat.navn, 24)} ${pad(x.r.kandidat.kilde, 6)} ` +
        `${padV(`${x.dpr.snitt >= 0 ? "+" : ""}${x.dpr.snitt.toFixed(3)} ± ${x.dpr.ci.toFixed(3)}`, 16)} ` +
        `${padV(x.hor ? `${x.hor.snitt >= 0 ? "+" : ""}${x.hor.snitt.toFixed(3)} ± ${x.hor.ci.toFixed(3)}` : "–", 16)} ` +
      `${padV(`${(100 * x.vin.snitt).toFixed(0)}`, 7)} ` +
        `${padV(x.slutt.snitt.toFixed(1), 8)} ${padV(treff, 9)}`,
    );
  }
  console.log(
    `\n  Analyse-enhet: ${antallBlokker} duplikatblokker à 4 kamper ` +
      `(kandidaten i hvert sete, samme kort). n = ${antallBlokker} per bot.\n` +
      "  Vinn% er kandidatens andel av 4 seter – nøytralt nivå er 25 %.\n" +
      `  diff@${K}r er samme differanse, men avkortet til de ${K} første rundene av\n` +
      "  hver kamp – felles nevner, så tallet kan ikke drive med kamplengden.",
  );

  console.log(`\n=== Paret mot ankeret (samme blokker – langt strammere KI) ===`);
  console.log(`${pad("Bot", 24)} ${padV("Δ diff/runde vs anker", 24)} ${padV("t", 7)} ${padV("Signifikant?", 13)}`);
  for (const x of rader) {
    if (x.r.kandidat.id === ankerId) continue;
    const t = x.paret.snitt / x.paret.se;
    const sig = Math.abs(t) > tKritisk(x.paret.n - 1) ? "ja" : "nei";
    console.log(
      `${pad(x.r.kandidat.navn, 24)} ` +
        `${padV(`${x.paret.snitt >= 0 ? "+" : ""}${x.paret.snitt.toFixed(3)} ± ${x.paret.ci.toFixed(3)}`, 24)} ` +
        `${padV(t.toFixed(2), 7)} ${padV(sig, 13)}`,
    );
  }
}

function skrivDrift(res: readonly BotResultat[]): void {
  console.log("\n=== Driftkontroll ===");

  // 1) Poengdrift. Testen må gjøres INNENFOR hver bot. På tvers av boter er
  //    både sluttpoeng og kamplengde drevet av styrke (en sterk bot vinner
  //    fort), så en korrelasjon der er ekte årsakssammenheng, ikke drift.
  //    Innenfor én bot er variasjonen i kamplengde derimot ren flaks – og da
  //    er korrelasjon med metrikken nettopp den driften vi vil unngå.
  const alle = res.flatMap((r) => r.kamper);
  const runder = anslå(alle.map((k) => k.runder));
  console.log(
    `\n1) Poengdrift: henger metrikken på kamplengden når styrken holdes fast?\n` +
      `   Kamplengde: ${runder.snitt.toFixed(1)} runder i snitt ` +
      `(${Math.min(...alle.map((k) => k.runder))}–${Math.max(...alle.map((k) => k.runder))}).\n` +
      `   Korrelasjonene under er regnet INNENFOR hver bot, der variasjonen i\n` +
      `   kamplengde er flaks. Sluttpoeng skal drive med lengden; diff/runde\n` +
      `   skal ikke.\n`,
  );
  const K = finnHorisont(res);
  console.log(
    `   ${pad("Bot", 24)} ${padV("korr(sluttp., R)", 18)} ${padV("korr(diff/runde, R)", 21)} ${padV(`korr(diff@${K}r, R)`, 20)}`,
  );
  let sumSlutt = 0, sumDiff = 0, sumHor = 0, antall = 0;
  for (const r of res) {
    const R = r.kamper.map((k) => k.runder);
    const rs = korrelasjon(r.kamper.map((k) => k.poeng), R);
    const rd = korrelasjon(r.kamper.map((k) => (k.poeng - k.motstandPoeng) / k.runder), R);
    const rh = K > 0 ? korrelasjon(r.kamper.map((k) => horisontDiff(k, k.sete, K)), R) : NaN;
    if (Number.isFinite(rs) && Number.isFinite(rd)) {
      sumSlutt += rs; sumDiff += rd; sumHor += Number.isFinite(rh) ? rh : 0; antall++;
    }
    console.log(
      `   ${pad(r.kandidat.navn, 24)} ${padV(rs.toFixed(3), 18)} ${padV(rd.toFixed(3), 21)} ${padV(Number.isFinite(rh) ? rh.toFixed(3) : "–", 20)}`,
    );
  }
  if (antall > 0) {
    console.log(
      `   ${pad("SNITT", 24)} ${padV((sumSlutt / antall).toFixed(3), 18)} ${padV((sumDiff / antall).toFixed(3), 21)} ${padV((sumHor / antall).toFixed(3), 20)}`,
    );
  }
  console.log(
    "\n   Å lese ut av tabellen – de to fortegnene betyr ikke det samme:\n" +
      "   * korr(sluttpoeng, R) POSITIV = poengdriften. Jo lengre kampen varer,\n" +
      "     jo mer samler alle opp, uansett hvor godt de spiller. En bot som\n" +
      "     drar ut kamper får uttelling den ikke har spilt seg til.\n" +
      "   * korr(diff/runde, R) NEGATIV er derimot ikke drift, men innebygd i\n" +
      "     formatet: kampen slutter nettopp når noen når 100, så runder ≈\n" +
      `     100 / egen poengrate. Går det bra, blir kampen kort.\n` +
      `   * diff@${K}r har FAST nevner (${K} runder for alle kamper og alle boter), så\n` +
      "     kamplengden kan ikke blåse opp tallet – der er driften borte ved\n" +
      "     konstruksjon. At den fortsatt samvarierer med R er samme\n" +
      "     årsaksretning som over: god start ⇒ kort kamp.\n" +
      `   Rangeringen bør derfor leses av diff@${K}r, med diff/runde som støtte.`,
  );

  // Rangeringen med gammel metrikk vs. ny – flytter noen på seg?
  const gammel = [...res].sort((a, b) => anslå(b.blokkSluttpoeng).snitt - anslå(a.blokkSluttpoeng).snitt);
  const ny = [...res].sort((a, b) => anslå(b.blokkDiffPerRunde).snitt - anslå(a.blokkDiffPerRunde).snitt);
  const flyttet = ny.filter((r, i) => gammel[i]!.kandidat.id !== r.kandidat.id);
  console.log(
    `\n   Rangering etter sluttpoeng vs. etter diff/runde: ` +
      (flyttet.length === 0
        ? "identisk (metrikkvalget endrer ikke rekkefølgen her)."
        : `${flyttet.length} bot(er) bytter plass – sluttpoeng er ikke til å stole på.`),
  );

  // 1b) Metningskontroll: et anker som taper alt kan ikke skille i toppen.
  const mettet = res.filter((r) => r.kandidat.id !== ankerId && anslå(r.blokkVinnerandel).snitt >= 0.95);
  if (mettet.length > 0) {
    console.log(
      `\n   METNING: ${mettet.length} bot(er) vinner ≥ 95 % av setene mot ankeret\n` +
        `   (${mettet.map((r) => r.kandidat.navn).join(", ")}).\n` +
        `   Ankeret er for svakt til å skille dem – rangeringen i toppen er da\n` +
        `   et gulv-effekt-artefakt, ikke en måling. Bruk et sterkere anker.`,
    );
  }

  // 2) Tidsdrift: blokkmetrikken mot blokknummer.
  console.log("\n2) Tidsdrift gjennom kjøringen (OLS-helling mot blokknummer)");
  console.log(`   ${pad("Bot", 24)} ${padV("helling/blokk", 16)} ${padV("t", 8)} ${padV("Drift?", 8)}`);
  for (const r of res) {
    const x = r.blokkDiffPerRunde.map((_, i) => i);
    const h = helling(x, r.blokkDiffPerRunde);
    const drift = Number.isFinite(h.t) && Math.abs(h.t) > tKritisk(r.blokkDiffPerRunde.length - 2) ? "JA" : "nei";
    console.log(
      `   ${pad(r.kandidat.navn, 24)} ${padV(h.b.toFixed(4), 16)} ${padV(h.t.toFixed(2), 8)} ${padV(drift, 8)}`,
    );
  }

  // 3) Setedrift: duplikatblokken skal ha nullet den ut.
  console.log("\n3) Setedrift (diff/runde per sete – duplikatblokken skal jevne ut)");
  console.log(`   ${pad("Bot", 24)} ${padV("sete 0", 9)} ${padV("sete 1", 9)} ${padV("sete 2", 9)} ${padV("sete 3", 9)} ${padV("spenn", 9)}`);
  for (const r of res) {
    const perSete = [0, 1, 2, 3].map((s) => {
      const i = r.kamper.filter((k) => k.sete === s);
      return i.reduce((a, k) => a + (k.poeng - k.motstandPoeng) / k.runder, 0) / i.length;
    });
    const spenn = Math.max(...perSete) - Math.min(...perSete);
    console.log(
      `   ${pad(r.kandidat.navn, 24)} ${perSete.map((v) => padV(v.toFixed(3), 9)).join(" ")} ${padV(spenn.toFixed(3), 9)}`,
    );
  }

  // 4) Søkebudsjett: fikk søkebotene den tenketiden de skulle ha?
  console.log("\n4) Tenketid per beslutning (kontroll på at budsjettet faktisk ble brukt)");
  for (const r of res) {
    const besl = r.kamper.reduce((a, k) => a + k.beslutninger, 0);
    const sek = r.kamper.reduce((a, k) => a + k.sekunder, 0);
    console.log(
      `   ${pad(r.kandidat.navn, 24)} ${padV(`${((1000 * sek) / besl).toFixed(0)} ms/beslutning`, 20)} ` +
        `${padV(`${besl} beslutninger`, 18)}`,
    );
  }
}

function skrivStøygulv(a: readonly BotResultat[], b: readonly BotResultat[]): void {
  console.log("\n=== Støygulv: to identiske kjøringer, samme frø ===");
  console.log(
    "   MesterAI og NevroHjerne trekker egne tilfeldige tall per kamp, så to\n" +
      "   kjøringer med identiske kort gir ulikt svar. Differansen under er den\n" +
      "   støyen som IKKE lar seg kontrollere bort – forskjeller mindre enn\n" +
      "   dette er ikke reelle.",
  );
  console.log(`\n   ${pad("Bot", 24)} ${padV("kjøring 1", 11)} ${padV("kjøring 2", 11)} ${padV("|Δ|", 9)} ${padV("KI-bredde", 11)}`);
  for (const r1 of a) {
    const r2 = b.find((x) => x.kandidat.id === r1.kandidat.id);
    if (!r2) continue;
    const m1 = anslå(r1.blokkDiffPerRunde);
    const m2 = anslå(r2.blokkDiffPerRunde);
    const paret = anslå(r1.blokkDiffPerRunde.map((v, i) => v - (r2.blokkDiffPerRunde[i] ?? 0)));
    console.log(
      `   ${pad(r1.kandidat.navn, 24)} ${padV(m1.snitt.toFixed(3), 11)} ${padV(m2.snitt.toFixed(3), 11)} ` +
        `${padV(Math.abs(paret.snitt).toFixed(3), 9)} ${padV(`± ${paret.ci.toFixed(3)}`, 11)}`,
    );
  }
}

/**
 * Bygger BotResultat på nytt fra rådataene i en --json-fil, så rapporten kan
 * regnes om (nye metrikker, ny driftanalyse) uten å spille kampene igjen.
 */
function lesFraFil(sti: string): BotResultat[][] {
  const rå = JSON.parse(readFileSync(sti, "utf8")) as {
    oppsett: { antallBlokker: number; ankerId: string };
    kjøringer: { id: string; navn: string; kamper: KampStat[] }[][];
  };
  antallBlokker = rå.oppsett.antallBlokker;
  ankerId = rå.oppsett.ankerId;
  return rå.kjøringer.map((kjøring) =>
    kjøring.map((b) => {
      const [ppr, dpr, vin, slutt] = blokkAggreger(b.kamper, rå.oppsett.antallBlokker);
      const kandidat = KANDIDATER.find((k) => k.id === b.id) ?? {
        id: b.id, navn: b.navn, kilde: "motor" as const, søk: false, appType: null, lag: null,
      };
      return {
        kandidat,
        kamper: b.kamper,
        blokkPoengPerRunde: ppr!,
        blokkDiffPerRunde: dpr!,
        blokkVinnerandel: vin!,
        blokkSluttpoeng: slutt!,
      };
    }),
  );
}

async function hoved(): Promise<void> {
  // --fra <json>: regn rapporten om fra en tidligere kjøring, ikke spill på nytt.
  if (reanalyse) {
    const kjøringer = lesFraFil(reanalyse);
    console.log(`Reanalyse av ${reanalyse} (${kjøringer.length} kjøring(er), ingen kamper spilt på nytt).\n`);
    skrivRangering(kjøringer[0]!);
    skrivDrift(kjøringer[0]!);
    if (kjøringer.length > 1) skrivStøygulv(kjøringer[0]!, kjøringer[1]!);
    return;
  }

  const adapter = new Adapter(adapterSti);
  // Alle søkeknappene settes eksplisitt: MesterKonfig.automatisk() skalerer
  // ellers etter maskinvaren, og da er kjøringen ikke reproduserbar.
  const mesterKonfig = tidsmatchet
    ? { tidsbudsjettMs: tidMs, eksaktStikkGrense: terskel }
    : {
        // Tidsbudsjettet settes så høyt at det aldri biter: MesterAI stopper
        // på maksVerdener, ikke på klokka. Da er sammenlikningen verdener mot
        // verdener i stedet for Swift-millisekunder mot Node-millisekunder.
        tidsbudsjettMs: 600000,
        maksVerdener: verdener,
        minVerdener: verdener,
        verdenerVedBud: verdener,
        verdenerVedBytte: verdener,
        eksaktStikkGrense: terskel,
      };
  await adapter.send({ type: "init", adapterBots: {}, ...mesterKonfig });

  console.log(
    `Kontrollert benchmark – ${valgte.length} kandidater mot 3× ${ankerId}.\n` +
      `  Design:  ${antallBlokker} duplikatblokker × 4 seter = ${antallBlokker * 4} kamper per bot ` +
      `(frø ${frøBase}–${frøBase + antallBlokker - 1}, delt av alle).\n` +
      `  Søk:     ${
        tidsmatchet
          ? `tidsmatchet, ${tidMs} ms/kortvalg (advarsel: Swift rekker flere verdener per ms enn Node)`
          : `VERDENSMATCHET, ${verdener} verdener/kortvalg, ${terskel} stikk løst eksakt hos begge`
      }\n` +
      `  Metrikk: diff/runde = (egne poeng − snitt motstander) / runder.\n`,
  );

  const kjøring1 = await kjørRutenett(adapter, gjenta ? "[1] " : "");
  skrivRangering(kjøring1);
  skrivDrift(kjøring1);

  let kjøring2: BotResultat[] | null = null;
  if (gjenta) {
    console.log("");
    kjøring2 = await kjørRutenett(adapter, "[2] ");
    skrivStøygulv(kjøring1, kjøring2);
  }

  if (jsonUt) {
    writeFileSync(
      jsonUt,
      JSON.stringify(
        {
          oppsett: { antallBlokker, frøBase, verdener, terskel, tidMs, tidsmatchet, ankerId },
          kjøringer: [kjøring1, kjøring2].filter(Boolean).map((k) =>
            k!.map((r) => ({ id: r.kandidat.id, navn: r.kandidat.navn, kamper: r.kamper })),
          ),
        },
        null,
        1,
      ),
    );
    console.log(`\nRåresultater skrevet til ${jsonUt}`);
  }

  adapter.stopp();
}

hoved().catch((feil: unknown) => {
  console.error(feil);
  process.exit(1);
});
