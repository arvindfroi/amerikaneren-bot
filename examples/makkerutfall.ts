/**
 * MAKKERENS UTSPILL I STIKK 2 – målt på UTFALLET, ikke mot et orakel.
 *
 *   node examples/makkerutfall.ts --kamper 4000 --skard 0/12
 *
 * ARVINDS IDÉ, og hvorfor den er bedre enn begge fasitene jeg har brukt:
 * «er det mulig å gjøre regret basert på om kontrakten ble felt i stedet for
 * å bruke en løsning?»
 *
 * Ja. Og de to orakelbaserte veiene har hver sin feil som denne slipper unna:
 *
 *   DOBBELT DUMMY forutsetter at alle spiller perfekt med alle kort synlige.
 *   Den ble AVVIST av godkjenningsporten (−0,609) og å følge den er målt
 *   skadelig. Regelen jeg bygget på DD-anger i natt målte −0,171.
 *
 *   SINGLE DUMMY sampler verdener og er godkjent (+0,718), men ETT anslag er
 *   støyete. Tar man argmax over åtte–ti støyete kortverdier, plukker man
 *   den heldigste MÅLINGEN like mye som det beste KORTET. Det er vinnerens
 *   forbannelse, og den blåste opp budtaket mitt fra ingenting til «+1,18».
 *
 * DENNE MÅLER DET SOM FAKTISK SKJEDDE. For hvert kandidatkort: legg det,
 * spill runden ferdig i den EKTE giva med de vanlige agentene, og les av
 * poengene motoren gir. Ingen sampling, ingen antakelse om perfekt spill.
 *
 * OG DEN ER STØYFRI. Agentene er deterministiske, så samme kort i samme
 * stilling gir samme utfall hver gang. Forskjellen mellom to kandidatkort er
 * derfor EKSAKT for den giva – ikke et estimat. Det er grunnen til at n her
 * teller mye mer enn n i en SD-måling.
 *
 * HVA DEN IKKE ER. Den ser den ekte giva, så den er en HINDSIGHT-måling: et
 * kort kan vinne fordi kortene tilfeldigvis lå slik. Derfor er ikke
 * per-stilling-tallet et mål på hva vi burde valgt. Det som ER gyldig, er
 * SNITTET over mange giver for en FAST REGEL: en regel som systematisk gir
 * flere poeng over 4 000 giver er systematisk bedre, uansett hva som lå hvor
 * i hver enkelt. Det er nettopp den formen en konvensjonsvakt har.
 *
 * MÅLTALLET er poengdifferansen – egne poeng minus snittet av de tre andre –
 * så «vi straffer motparten» teller like mye som «vi scorer selv». I tillegg
 * logges om kontrakten ble innfridd, siden det er den terskelen alt henger på.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { lovligeKort, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { type Farge, type Kort } from "../src/kort.ts";
import { NevroAgent, besteTrumf } from "../src/nevro/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";

let kamper = 4000;
let kontrakt = 9;
let skardI = 0;
let skardN = 1;
let kandidatSpek = "vakt:ab:e1:e1-modell/d7alle.bin";
let ut = "analyse/makkerutfall-0.jsonl";
let rapport: string | null = null;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--kontrakt") kontrakt = Number(process.argv[++i]);
  else if (a === "--kandidat") kandidatSpek = process.argv[++i]!;
  else if (a === "--ut") ut = process.argv[++i]!;
  else if (a === "--rapport") rapport = process.argv[++i]!;
  else if (a === "--skard") {
    const [x, y] = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(x);
    skardN = Number(y);
  }
}

interface Linje {
  frø: number;
  vårTrumf: boolean;
  /** Regelnavn → poengdifferanse for MAKKERSETET når den regelen spilles. */
  diff: Record<string, number>;
  /** Regelnavn → ble kontrakten innfridd? */
  klart: Record<string, number>;
  antallLovlige: number;
}

// --- Rapportmodus -----------------------------------------------------------
if (rapport !== null) {
  const rader: Linje[] = [];
  for (const f of rapport.split(",")) {
    for (const l of readFileSync(f, "utf8").split("\n")) {
      if (l.trim() === "") continue;
      try {
        rader.push(JSON.parse(l) as Linje);
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
  const navn = Object.keys(rader[0]?.diff ?? {}).filter((x) => x !== "BOTEN");
  const rad = navn
    .map((nv) => {
      const d = rader.map((r) => (r.diff[nv] ?? NaN) - (r.diff["BOTEN"] ?? NaN)).filter(Number.isFinite);
      const k = rader.map((r) => r.klart[nv] ?? NaN).filter(Number.isFinite);
      return { nv, m: snitt(d), se: se(d), klart: snitt(k), n: d.length };
    })
    .sort((a, b) => b.m - a.m);
  const linjer = [
    `\n=== Makkerens utspill i stikk 2, maalt paa UTFALLET ===`,
    `${rader.length} giver. Kandidat: ${kandidatSpek}, kontrakt ${kontrakt}.`,
    `Hvert kandidatkort spilles i den EKTE giva og runden spilles ferdig.`,
    `Agentene er deterministiske, saa hver differanse er EKSAKT for den giva.`,
    ``,
    `Botens eget valg: trumf ut i ${((100 * rader.filter((r) => r.vårTrumf).length) / Math.max(1, rader.length)).toFixed(0)} % av stillingene.`,
    `Botens egen innfrielsesrate: ${(100 * snitt(rader.map((r) => r.klart["BOTEN"] ?? NaN).filter(Number.isFinite))).toFixed(1)} %`,
    ``,
    `regel                          mot botens valg        innfridd`,
    `------------------------------------------------------------------`,
  ];
  for (const r of rad) {
    linjer.push(
      `${r.nv.padEnd(30)} ${(r.m >= 0 ? "+" : "") + r.m.toFixed(3)} ± ${r.se.toFixed(3)} ` +
        `(${(r.m / r.se).toFixed(1)} SE)   ${(100 * r.klart).toFixed(1).padStart(6)} %`,
    );
  }
  linjer.push(
    `------------------------------------------------------------------`,
    ``,
    `Positivt = regelen gir makkersetet MER poengdifferanse enn det boten`,
    `faktisk spilte, parret paa giv.`,
    ``,
    `FORBEHOLD. Dette er en HINDSIGHT-maaling: den ekte giva er kjent, saa et`,
    `kort kan vinne fordi kortene tilfeldigvis laa slik. Per stilling betyr`,
    `tallet derfor ingenting. Snittet over mange giver for en FAST regel er`,
    `derimot gyldig - det er akkurat den formen en konvensjonsvakt har - men`,
    `en vinnende regel maa likevel maales i full kamp foer den adopteres,`,
    `fordi den her bare byttes inn i ETT stikk.`,
  );
  const tekst = linjer.join("\n");
  console.log(tekst);
  writeFileSync(rapport.split(",")[0]!.replace(/-\d+\.jsonl$/, ".txt"), tekst + "\n");
  process.exit(0);
}

// --- Innsamling -------------------------------------------------------------
mkdirSync(dirname(ut), { recursive: true });
const vakt = delVaktspek(kandidatSpek)!;
const nett = lesE1Nett(vakt.indre.slice(3));
const lagBot = (): { velgHandling(s: GameState): Handling; nyKamp(): void } =>
  new Konvensjonsvakt(new E1Agent(nett), vakt.valg);

/** Kandidatreglene. Alle er lovlige – de ser bare egen hånd og trumfen. */
function reglerFor(lovlige: readonly Kort[], trumf: Farge): Record<string, Kort> {
  const sortert = [...lovlige].sort((a, b) => a.verdi - b.verdi);
  const trumfer = sortert.filter((k) => k.farge === trumf);
  const side = sortert.filter((k) => k.farge !== trumf);
  const ut: Record<string, Kort> = {
    "hoeyeste trumf": trumfer[trumfer.length - 1] ?? sortert[sortert.length - 1]!,
    "laveste trumf": trumfer[0] ?? sortert[0]!,
    "hoeyeste sidekort": side[side.length - 1] ?? sortert[sortert.length - 1]!,
    "laveste sidekort": side[0] ?? sortert[0]!,
    "hoeyeste uansett": sortert[sortert.length - 1]!,
    "laveste uansett": sortert[0]!,
  };
  const tell = new Map<Farge, Kort[]>();
  for (const k of side) tell.set(k.farge, [...(tell.get(k.farge) ?? []), k]);
  let lengst: Kort[] | null = null;
  let kortest: Kort[] | null = null;
  for (const v of tell.values()) {
    if (lengst === null || v.length > lengst.length) lengst = v;
    if (kortest === null || v.length < kortest.length) kortest = v;
  }
  ut["lengste sidefarge, hoeyest"] = lengst?.[lengst.length - 1] ?? ut["hoeyeste uansett"]!;
  ut["korteste sidefarge, hoeyest"] = kortest?.[kortest.length - 1] ?? ut["hoeyeste uansett"]!;
  return ut;
}

let n = 0;
for (let f = 0; f < kamper; f++) {
  if (f % skardN !== skardI) continue;
  const frø = 7_700_000 + f;
  const budsete = frø % 4;
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let g = 0;
  while (s.fase === "BUDRUNDE" && s.iTur !== budsete && g++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  if (s.fase !== "BUDRUNDE" || s.iTur !== budsete) continue;
  if (besteTrumf(s.hender[budsete] ?? []).estimat < kontrakt - 3.5) continue;
  try {
    s = utfør(s, { type: "BUD", spiller: budsete, bud: kontrakt }).state;
  } catch {
    continue;
  }
  g = 0;
  while (s.fase === "BUDRUNDE" && g++ < 8) s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;

  const oppstart = [0, 1, 2, 3].map(() => lagBot());
  for (const b of oppstart) b.nyKamp();
  g = 0;
  while ((s.fase === "VRAK" || s.fase === "VELG") && g++ < 20) {
    s = utfør(s, oppstart[s.budvinner!]!.velgHandling(s)).state;
  }
  if (s.fase !== "SPILL") continue;
  g = 0;
  while (s.fase === "SPILL" && s.stikkSpilt === 0 && g++ < 12) {
    s = utfør(s, oppstart[s.iTur!]!.velgHandling(s)).state;
  }
  // Betingelsen: makkeren tok stikk 1 og har utspillet i stikk 2.
  if (s.fase !== "SPILL" || s.stikkSpilt !== 1 || s.makker === null) continue;
  if (s.iTur !== s.makker || s.bord.length !== 0) continue;
  const makker = s.makker;
  const start = s;
  const trumf = s.trumf!;
  const lovlige = lovligeKort(s, makker);
  if (lovlige.length < 2) continue;

  /** Legg `kort` og spill runden ferdig i den EKTE giva. */
  const utfall = (kort: Kort): { diff: number; klart: number } | null => {
    let t: GameState;
    try {
      t = utfør(start, { type: "SPILL", spiller: makker, kort }).state;
    } catch {
      return null;
    }
    const seter = [0, 1, 2, 3].map(() => lagBot());
    for (const b of seter) b.nyKamp();
    let h = 0;
    while (t.fase !== "FERDIG" && t.fase !== "RUNDE_SLUTT" && h++ < 400) {
      t = utfør(t, seter[t.iTur!]!.velgHandling(t)).state;
    }
    const p = t.totalPoeng;
    const egne = p[makker] ?? 0;
    const st = t.stikkVunnet;
    const lag = (st[t.budvinner!] ?? 0) + (t.makker !== null ? (st[t.makker] ?? 0) : 0);
    return {
      diff: Math.round((egne - (p.reduce((a, x) => a + x, 0) - egne) / 3) * 1000) / 1000,
      klart: lag >= kontrakt ? 1 : 0,
    };
  };

  const botKort = oppstart[makker]!.velgHandling(start);
  if (botKort.type !== "SPILL") continue;
  const diff: Record<string, number> = {};
  const klart: Record<string, number> = {};
  const bot = utfall(botKort.kort);
  if (bot === null) continue;
  diff["BOTEN"] = bot.diff;
  klart["BOTEN"] = bot.klart;
  let ok = true;
  for (const [nv, kort] of Object.entries(reglerFor(lovlige, trumf))) {
    const r = utfall(kort);
    if (r === null) {
      ok = false;
      break;
    }
    diff[nv] = r.diff;
    klart[nv] = r.klart;
  }
  if (!ok) continue;

  appendFileSync(
    ut,
    JSON.stringify({
      frø,
      vårTrumf: botKort.kort.farge === trumf,
      diff,
      klart,
      antallLovlige: lovlige.length,
    } satisfies Linje) + "\n",
  );
  n++;
  process.stdout.write(`\r  skard ${skardI}: ${n} giver   `);
}
console.log(`\nSkard ${skardI} ferdig: ${n} giver → ${ut}`);
