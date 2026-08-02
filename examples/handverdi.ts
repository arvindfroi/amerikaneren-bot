/**
 * HÅNDVERDI: hva er et kort verdt, og hva er en SERIE verdt?
 *
 *   node examples/handverdi.ts --hender 3000 --skard 0/10
 *
 * ARVINDS KRITIKK: «vi må ikke være kort-agnostiker. verdien på kortene er hva
 * som betyr noe. jo mer trumf jo mindre kan man forvente i innbyttekortene, og
 * fra makker. vi må finne både thresholds på verdien av serier (valør, lengde,
 * sammenheng) samt ikke behandle det analogt.»
 *
 * KRITIKKEN TREFFER MODELLEN MIN. Ridge-regresjon er ADDITIV: den kan bare
 * legge sammen bidrag fra hvert trekk. Den kan ikke uttrykke at A-K-D sammen er
 * verdt mer enn de tre hver for seg, og den kan ikke uttrykke at den åttende
 * trumfen er verdt mindre enn den femte fordi det da er færre igjen til
 * makkeren. Begge deler er samspill, og samspill er nettopp det en lineær
 * modell definisjonsmessig ikke har.
 *
 * MEN FØR MODELLEN BYTTES SKAL PÅSTANDEN MÅLES. «Jo mer trumf jo mindre fra
 * makker» er en hypotese om en negativ korrelasjon, og den er testbar direkte:
 * hold kontrakten fast, varier hånden, og se hva makkeren faktisk bidrar med.
 *
 * DET SOM MÅLES, per hånd og over K utspillinger av den EKTE giva:
 *
 *   egne stikk            hva budvinneren selv tar
 *   makkerens stikk       hva makkeren bidrar med
 *   talongtrumf           hvor mange trumf som fulgte med i innbyttet
 *
 * brutt ned på håndens egenskaper:
 *
 *   trumflengde           antall kort i den valgte trumffargen
 *   honnører              A/K/D i trumf
 *   SERIE                 lengste sammenhengende rekke fra toppen (A, A-K,
 *                         A-K-D …). Det er «sammenheng» i Arvinds forstand:
 *                         tre høye kort som henger sammen tar tre stikk, tre
 *                         som ikke gjør det tar kanskje ett.
 *
 * HVORFOR MARGINALVERDIEN ER DET INTERESSANTE. Er den n-te trumfen verdt like
 * mye som den (n−1)-te, er lengde en lineær størrelse og en additiv modell
 * holder. Faller den – eller hopper den ved en terskel – er den det ikke, og
 * da er tallet her selve begrunnelsen for å bytte modellklasse.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { lovligeHandlinger, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { FARGER, lagRng, nyStokk, stokk, kortId, type Farge, type Kort } from "../src/kort.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";

let hender = 3000;
let trekninger = 24;
let skardI = 0;
let skardN = 1;
let frøBase = 200_000_000;
let kontrakt = 9;
let kandidatSpek = "vakt:abmp:e1:e1-modell/sd-r2.bin";
let ut: string | null = null;
let rapport: string | null = null;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--hender") hender = Number(process.argv[++i]);
  else if (a === "--trekninger") trekninger = Number(process.argv[++i]);
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--kontrakt") kontrakt = Number(process.argv[++i]);
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
  /** Håndens egenskaper FØR talongen – det setet ser når det byr. */
  trumflengde: number;
  honnører: number;
  serie: number;
  sidefarger: number;
  /** Snitt over utspillingene. */
  egneStikk: number;
  makkerStikk: number;
  lagStikk: number;
  talongtrumf: number;
  n: number;
}

// --- Rapport ----------------------------------------------------------------
if (rapport !== null) {
  const R: Rad[] = [];
  for (const f of rapport.split(",")) {
    for (const l of readFileSync(f, "utf8").split("\n")) {
      if (l.trim() === "") continue;
      try {
        R.push(JSON.parse(l) as Rad);
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
  const linjer = [
    `\n=== Haandverdi: hva er et kort og en SERIE verdt? ===`,
    `${R.length} hender, ${trekninger} utspillinger hver, tvungen kontrakt ${kontrakt}.`,
    `Kandidat: ${kandidatSpek}. Alle tall er snitt over utspillingene.`,
    ``,
    `1) «JO MER TRUMF, JO MINDRE FRA MAKKER» – Arvinds hypotese`,
    ``,
    `trumf   n      egne stikk   makker    LAG      talongtrumf   marginal`,
    `---------------------------------------------------------------------`,
  ];
  let forrige: number | null = null;
  for (let L = 4; L <= 10; L++) {
    const g = R.filter((r) => r.trumflengde === L);
    if (g.length < 20) continue;
    const lag = snitt(g.map((r) => r.lagStikk));
    const marg = forrige === null ? NaN : lag - forrige;
    forrige = lag;
    linjer.push(
      `${String(L).padStart(4)}${String(g.length).padStart(7)}   ` +
        `${snitt(g.map((r) => r.egneStikk)).toFixed(2).padStart(9)}  ` +
        `${snitt(g.map((r) => r.makkerStikk)).toFixed(2).padStart(7)}  ` +
        `${lag.toFixed(2).padStart(6)}   ` +
        `${snitt(g.map((r) => r.talongtrumf)).toFixed(2).padStart(10)}   ` +
        `${Number.isNaN(marg) ? "     –" : (marg >= 0 ? "+" : "") + marg.toFixed(2)}`,
    );
  }
  linjer.push(
    `---------------------------------------------------------------------`,
    ``,
    `  Faller «makker»-kolonnen naar trumf stiger, er hypotesen bekreftet:`,
    `  jo flere trumf vi selv har, jo faerre er igjen til makkeren.`,
    `  «marginal» er hva den n-te trumfen legger til LAGSTIKK. Er den konstant,`,
    `  er lengde en lineaer stoerrelse og en additiv modell holder. Faller den,`,
    `  gjoer den ikke det.`,
    ``,
    `2) SERIER – er sammenheng verdt mer enn summen?`,
    ``,
    `Sammenlikner hender med SAMME trumflengde og samme antall honnoerer, men`,
    `ulik SERIE (lengste sammenhengende rekke fra toppen: A, A-K, A-K-D ...).`,
    ``,
    `trumf  honn   serie   n      lagstikk`,
    `--------------------------------------`,
  );
  for (const L of [6, 7, 8]) {
    for (const h of [1, 2, 3]) {
      for (const s of [0, 1, 2, 3]) {
        const g = R.filter((r) => r.trumflengde === L && r.honnører === h && Math.min(r.serie, 3) === s);
        if (g.length < 25) continue;
        linjer.push(
          `${String(L).padStart(4)}${String(h).padStart(6)}${String(s).padStart(8)}` +
            `${String(g.length).padStart(7)}   ${snitt(g.map((r) => r.lagStikk)).toFixed(2)} ± ${se(g.map((r) => r.lagStikk)).toFixed(2)}`,
        );
      }
    }
  }
  linjer.push(
    `--------------------------------------`,
    ``,
    `  Rader med samme trumf og samme honnoertall, men ulik serie, isolerer`,
    `  sammenhengen. Stiger lagstikk med serie naar honnoertallet er FAST, er`,
    `  sammenheng verdt noe UTOVER kortverdiene - og det er nettopp det en`,
    `  additiv modell ikke kan uttrykke.`,
    ``,
    `3) HVA KAN VI FORVENTE FRA TALONGEN?`,
    ``,
    `  talongtrumf i snitt            ${snitt(R.map((r) => r.talongtrumf)).toFixed(2)} kort`,
    `  korrelasjon mot egen trumflengde  ` +
      (() => {
        const x = R.map((r) => r.trumflengde);
        const y = R.map((r) => r.talongtrumf);
        const mx = snitt(x);
        const my = snitt(y);
        let sxy = 0;
        let sx = 0;
        let sy = 0;
        for (let i = 0; i < x.length; i++) {
          sxy += (x[i]! - mx) * (y[i]! - my);
          sx += (x[i]! - mx) ** 2;
          sy += (y[i]! - my) ** 2;
        }
        return (sxy / Math.sqrt(sx * sy)).toFixed(3);
      })(),
    ``,
    `  Negativ korrelasjon = jo mer trumf vi har, jo faerre ligger i talongen.`,
    `  Det er ren kombinatorikk og maa vaere negativt - tallet sier HVOR sterkt.`,
  );
  const tekst = linjer.join("\n");
  console.log(tekst);
  writeFileSync(rapport.split(",")[0]!.replace(/-\d+\.jsonl$/, ".txt"), tekst + "\n");
  process.exit(0);
}

// --- Innsamling -------------------------------------------------------------
const utFil = ut ?? `hand-verdi/skard-${skardI}.jsonl`;
mkdirSync(dirname(utFil), { recursive: true });
const nevro = new NevroAgent();
const vakt = delVaktspek(kandidatSpek)!;
const nett = lesE1Nett(vakt.indre.slice(3));
const lagBot = (): { velgHandling(s: GameState): Handling; nyKamp(): void } =>
  new Konvensjonsvakt(new E1Agent(nett), vakt.valg);

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

const rng = lagRng((frøBase + skardI * 7919) >>> 0);
let n = 0;
for (let h = 0; h < hender; h++) {
  if (h % skardN !== skardI) continue;
  const mal = opprettSpill({ antallSpillere: 4 }, (frøBase + h) >>> 0);
  const sete = (mal.giver + 1) % mal.antallSpillere;
  const hånd = mal.hender[sete] ?? [];
  if (hånd.length !== 12 || mal.fase !== "BUDRUNDE") continue;

  // Haandens egenskaper, slik setet ser dem FOER talongen.
  const per: Record<Farge, Kort[]> = { S: [], H: [], R: [], K: [] };
  for (const k of hånd) per[k.farge].push(k);
  const trumf = (FARGER as readonly Farge[]).reduce((a, b) => (per[b].length > per[a].length ? b : a), "S");
  const t = [...per[trumf]].sort((a, b) => b.verdi - a.verdi);
  const honnører = t.filter((k) => k.verdi >= 12).length;
  // SERIEN: hvor langt ned fra ess rekka er ubrutt (A=14, K=13, D=12 ...).
  let serie = 0;
  for (let v = 14; v >= 2; v--) {
    if (t.some((k) => k.verdi === v)) serie++;
    else break;
  }
  const sidefarger = (FARGER as readonly Farge[]).filter((f) => f !== trumf && per[f].length > 0).length;

  const egne: number[] = [];
  const mk: number[] = [];
  const lag: number[] = [];
  const tt: number[] = [];
  for (let k = 0; k < trekninger; k++) {
    const giv = omtrekk(mal, sete, hånd, rng);
    // Tving kontrakten paa vaart sete.
    let s: GameState = giv;
    let bydd = false;
    let g = 0;
    while (s.fase === "BUDRUNDE" && g++ < 40) {
      if (s.iTur === null) break;
      if (s.iTur === sete && !bydd) {
        const lov = lovligeHandlinger(s);
        if (lov.fase === "BUDRUNDE" && lov.bud.some((b) => b === kontrakt)) {
          bydd = true;
          s = utfør(s, { type: "BUD", spiller: sete, bud: kontrakt }).state;
          continue;
        }
        s = utfør(s, { type: "BUD", spiller: sete, bud: "PASS" }).state;
      } else s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
    }
    if (s.fase === "BUDRUNDE" || s.budvinner !== sete) continue;
    const talongtrumf = giv.talong.filter((c) => c.farge === trumf).length;
    const seter = [0, 1, 2, 3].map(() => lagBot());
    for (const b of seter) b.nyKamp();
    g = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
      s = utfør(s, seter[iTur]!.velgHandling(s)).state;
    }
    const st = s.stikkVunnet;
    const m = s.makker !== null && s.makker !== sete ? (st[s.makker] ?? 0) : 0;
    egne.push(st[sete] ?? 0);
    mk.push(m);
    lag.push((st[sete] ?? 0) + m);
    tt.push(talongtrumf);
  }
  if (egne.length < 5) continue;
  const sn = (v: number[]): number => Math.round((v.reduce((a, x) => a + x, 0) / v.length) * 1000) / 1000;
  appendFileSync(
    utFil,
    JSON.stringify({
      frø: (frøBase + h) >>> 0,
      trumflengde: per[trumf].length,
      honnører,
      serie,
      sidefarger,
      egneStikk: sn(egne),
      makkerStikk: sn(mk),
      lagStikk: sn(lag),
      talongtrumf: sn(tt),
      n: egne.length,
    } satisfies Rad) + "\n",
  );
  n++;
  process.stdout.write(`\r  skard ${skardI}: ${n} hender   `);
}
console.log(`\nSkard ${skardI} ferdig: ${n} hender → ${utFil}`);
