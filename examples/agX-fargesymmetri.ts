/**
 * HVOR MYE BRYTER NETTENE FARGESYMMETRIEN I DAG?
 *
 *   node examples/agX-fargesymmetri.ts --kamper 12 --tro e1-modell/tro-7.bin \
 *     --kort e1-modell/kort-7.bin [--kanonisk] --ut analyse/agX-fargesymmetri.jsonl
 *
 * Spillet er invariant under enhver ombytting av fargene som lar TRUMF og det
 * ETTERLYSTE kortets farge stå (`src/mlb/fargebytte.ts`). Et nett som hadde lært
 * den symmetrien, ville gitt NØYAKTIG samme svar på en byttet stilling, bare med
 * utgangen permutert tilbake. Avstanden fra det er kapasitet og data brukt på å
 * lære noe spillet gir gratis.
 *
 * ===================== MÅLTALLENE ======================================
 *
 *   TROHODET   per USETT kort: total variasjonsavstand mellom fordelingen før og
 *              (den tilbakemappede) fordelingen etter byttet, ½·Σ_c |p_c − q_c|.
 *              0 = perfekt symmetrisk, 1 = disjunkte. I tillegg andelen kort der
 *              ARGMAX-klassen skifter — den delen som faktisk endrer en beslutning.
 *   KORTNETTET per LOVLIG kort: samme TV over softmax, og andelen stillinger der
 *              det VALGTE kortet (argmax) blir et annet.
 *
 * Begge deles på ROLLE (budvinner/makker/motspiller) og STIKK, fordi §117 målte at
 * troen oppfører seg helt ulikt der, og et snitt over alt ville skjult det.
 *
 * ===================== HVORFOR TALLET IKKE ER ET RENT «FEIL» ============
 *
 * Motstanderpolicyen er ikke selv fargesymmetrisk: `estimerStikk` brytes uavgjort
 * på fargerekkefølgen, og en byttet stilling er derfor ikke helt like sannsynlig
 * under den policyen som originalen. Den ekte posterioren kan altså skille dem en
 * SMULE. Målingen er dermed en ØVRE GRENSE for hva symmetrien kunne spart — og
 * tallet under er så stort at grensen ikke er det som avgjør.
 *
 * ===================== `--kanonisk`: RESTEN ETTER KANONISERING ==========
 *
 * Med flagget leses BEGGE stillingene — originalen og den byttede — gjennom
 * `kanoniskBytte` før nettet ser dem. Da er dette ikke lenger et mål på hva
 * nettet har lært, men på hva KANONISERINGEN SELV etterlater: er nøkkelen
 * entydig, faller de to stillingene på nøyaktig samme navn, trekkvektorene blir
 * bit-identiske og hvert tall under er EKSAKT null. Et tall over null her er
 * derfor ikke «nettet er litt usymmetrisk» — det er kanoniseringen som ikke
 * skiller, og de eneste stedene den ikke kan er de publikt uskillelige fargene
 * (`uavgjort > 0`, siste linje i sammendraget). Faller det ut restledd i
 * stillinger med `uavgjort = 0`, er kanoniseringen ufullstendig, og det er en
 * FEIL å lete opp — ikke en egenskap ved spillet.
 *
 * ===================== SE, IKKE «ANTALL RADER» ==========================
 *
 * Naborader i samme kamp er sterkt korrelerte. Overskriften rapporteres derfor med
 * standardfeil KLYNGET PÅ KAMP (snitt per kamp, SE over kamper). Cellene per rolle ×
 * stikk får vanlig SE over stillinger, og radtallet står ved siden av.
 *
 * PROSESSEN SKRIVER SELV: både rådataene (`--ut`) og sammendraget (`<ut>.sammendrag.txt`)
 * skrives fra prosessen, ikke gjennom et stdout-rør.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { lovligeKort, opprettSpill, spillerVisning, utfør, type GameState } from "../src/motor.ts";
import { lagIndre, ADAMS_MAALT, tall } from "../src/moe2/agentspek.ts";
import { rolleFor } from "../src/moe2/rolleorakel.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import { setteKort } from "../src/mlb/trotrekk.ts";
import { e1SpillTrekkMedTro } from "../src/e1/trekk.ts";
import { forover, nettFraBytes } from "../src/nevro/nett.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import {
  byttTilstand,
  byttVisning,
  erIdentitet,
  IDENTITET,
  invers,
  kanoniskBytte,
  komponer,
  KORT_INN,
  lovligeBytter,
  uavgjorteFarger,
  type Fargebytte,
} from "../src/mlb/fargebytte.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};

const KAMPER = tall(arg("--kamper", "12"), 12, "kamper");
const FRØ = tall(arg("--froe", "770000000"), 770_000_000, "froe");
const MAKSRUNDER = tall(arg("--maksrunder", "8"), 8, "maksrunder");
const MÅLPOENG = tall(arg("--maalpoeng", "100"), 100, "maalpoeng");
const TRO = arg("--tro", "e1-modell/tro-7.bin");
const KORT = arg("--kort", "e1-modell/kort-7.bin");
const UT = arg("--ut", "analyse/agX-fargesymmetri.jsonl");
/** Se hodet: måler restleddet ETTER kanonisering i stedet for nettets eget brudd. */
const KANONISK = process.argv.includes("--kanonisk");

const tronett = MlbTronett.fraBytes(new Uint8Array(readFileSync(TRO)));
const kortnett = nettFraBytes(new Uint8Array(readFileSync(KORT)))[0];
if (kortnett === undefined) throw new Error(`Tomt kortnett i ${KORT}`);
if (kortnett.lag[0]!.inn !== KORT_INN) {
  throw new Error(`Kortnettet er ${kortnett.lag[0]!.inn} bredt; denne målingen er bygd for ${KORT_INN}`);
}

mkdirSync(dirname(UT), { recursive: true });
writeFileSync(UT, "");

/** ½·Σ|p−q| over en rad. */
const tv = (a: readonly number[], b: readonly number[]): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i]! - b[i]!);
  return s / 2;
};

/** Kortindeksen etter et fargebytte: valøren står, fargen flytter. */
const pi = (i: number, p: Fargebytte): number => p[Math.floor(i / 13)]! * 13 + (i % 13);

const argmaks = (a: readonly number[]): number => {
  let beste = 0;
  for (let i = 1; i < a.length; i++) if (a[i]! > a[beste]!) beste = i;
  return beste;
};

/** Softmax over de lovlige kortene alene — nøyaktig slik E1-agenten leser nettet. */
function kortfordeling(state: GameState, sete: number, bytte: Fargebytte | null): Map<number, number> {
  const s = bytte === null ? state : byttTilstand(state, bytte);
  const g = forover(kortnett!, e1SpillTrekkMedTro(s, sete, KORT_INN, null));
  const lov = lovligeKort(s, sete);
  let maks = -Infinity;
  for (const k of lov) maks = Math.max(maks, g[kortIndeks(k)] ?? 0);
  let sum = 0;
  const rå = new Map<number, number>();
  for (const k of lov) {
    const w = Math.exp((g[kortIndeks(k)] ?? 0) - maks);
    rå.set(kortIndeks(k), w);
    sum += w;
  }
  for (const [i, w] of rå) rå.set(i, w / sum);
  return rå;
}

interface Rad {
  kamp: number;
  runde: number;
  stikk: number;
  rolle: string;
  bytter: number;
  usett: number;
  /** Trohodet: snitt-TV per usett kort, og andel kort der argmax-klassen skifter. */
  troTv: number;
  troArgmaks: number;
  /** Kortnettet: TV over de lovlige kortene, og 1/0 for om det valgte kortet skifter. */
  kortTv: number;
  kortValg: number;
  /** Kanonisering: antall par av frie farger som er publikt uskillelige. */
  uavgjort: number;
}

const rader: Rad[] = [];
const t0 = Date.now();

for (let g = 0; g < KAMPER; g++) {
  const frø = FRØ + g * 7717;
  const agenter = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
  for (const a of agenter) a.nyKamp();
  const bok = new Hukommelse();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: MÅLPOENG }, frø);
  let vakt = 0;

  while (s.fase !== "FERDIG" && s.rundeNr < MAKSRUNDER && vakt++ < 20_000) {
    for (const a of agenter) a.observer?.(s);
    bok.observer(s);
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (sete === null || sete === undefined) break;

    if (s.fase === "SPILL" && lovligeKort(s, sete).length >= 2) {
      const visning = spillerVisning(s, sete);
      const bytter = lovligeBytter(s.trumf, s.etterlyst).filter((p) => !erIdentitet(p));
      if (bytter.length > 0) {
        /**
         * HUKOMMELSEN GÅR INN UENDRET I BEGGE GRENER. Den er 48 rene skalarer per
         * motstander uten et eneste fargeledd (`src/mlb/hukommelse.ts`), så et
         * fargebytte lar den stå — og symmetrien gjelder derfor også midt i en
         * kamp med full bok, ikke bare i første runde.
         */
        const minne = bok.vektor(sete, s.antallSpillere);
        /**
         * `c0` er RAMMEN stillingen leses i: identiteten uten `--kanonisk` (og da
         * er alt under ord for ord den gamle målingen), ellers det kanoniske
         * byttet. Alle indekser holdes i ORIGINALRAMMEN og flyttes med `pi` der de
         * skal slås opp — ellers blander vi to nummereringer i samme sum.
         */
        const c0 = KANONISK ? kanoniskBytte(visning) : IDENTITET;
        const c0inv = invers(c0);
        const før = tronett.fordeling(
          tronett.trekkFor(byttVisning(visning, c0), s.giving.antallStikk, MÅLPOENG, minne),
        );
        const kortFør = kortfordeling(s, sete, c0);
        const usett = [...Array(52).keys()].filter((i) => !setteKort(visning).has(i));

        let troTv = 0;
        let troArg = 0;
        let kortTv = 0;
        let kortBytte = 0;
        for (const p of bytter) {
          /**
           * Med kanonisering kanoniseres den BYTTEDE stillingen på nytt, så veien
           * fra originalen er `p` fulgt av dens egen nøkkel. Skiller nøkkelen de
           * to fargene, er `tot` nøyaktig `c0`: samme navn, samme vektor, null.
           */
          const tot = KANONISK ? komponer(p, kanoniskBytte(byttVisning(visning, p))) : p;
          const etter = tronett.fordeling(
            tronett.trekkFor(byttVisning(visning, tot), s.giving.antallStikk, MÅLPOENG, minne),
          );
          for (const i of usett) {
            // Kortet i indeks `i` ligger i hver ramme på `ramme[farge]·13 + valør`.
            const j0 = pi(i, c0);
            const j = pi(i, tot);
            troTv += tv(før[j0]!, etter[j]!);
            if (argmaks(før[j0]!) !== argmaks(etter[j]!)) troArg++;
          }
          const kortEtter = kortfordeling(s, sete, tot);
          let sum = 0;
          for (const [i, q] of kortFør) {
            const j = pi(pi(i, c0inv), tot);
            sum += Math.abs(q - (kortEtter.get(j) ?? 0));
          }
          kortTv += sum / 2;
          const valgFør = [...kortFør.entries()].sort((a, b) => b[1] - a[1])[0]![0];
          const valgEtter = [...kortEtter.entries()].sort((a, b) => b[1] - a[1])[0]![0];
          if (pi(pi(valgFør, c0inv), tot) !== valgEtter) kortBytte++;
        }
        const n = bytter.length;
        const rad: Rad = {
          kamp: g,
          runde: s.rundeNr,
          stikk: s.stikkSpilt,
          rolle: rolleFor(s, sete) ?? "ukjent",
          bytter: n,
          usett: usett.length,
          troTv: usett.length > 0 ? troTv / (n * usett.length) : 0,
          troArgmaks: usett.length > 0 ? troArg / (n * usett.length) : 0,
          kortTv: kortTv / n,
          kortValg: kortBytte / n,
          uavgjort: uavgjorteFarger(visning),
        };
        rader.push(rad);
        appendFileSync(UT, `${JSON.stringify(rad)}\n`);
      }
    }
    s = utfør(s, agenter[sete]!.velgHandling(s)).state;
  }
  for (const a of agenter) a.observer?.(s);
  bok.observer(s);
  process.stdout.write(`\r  kamp ${g + 1}/${KAMPER}, ${rader.length} stillinger, ${((Date.now() - t0) / 1000).toFixed(0)} s   `);
}

// --- Sammendraget ----------------------------------------------------------

/** Snitt og SE KLYNGET PÅ KAMP: naborader i en kamp er ikke uavhengige. */
function klynget(velg: (r: Rad) => number): { snitt: number; se: number; n: number } {
  const perKamp = new Map<number, number[]>();
  for (const r of rader) {
    if (!perKamp.has(r.kamp)) perKamp.set(r.kamp, []);
    perKamp.get(r.kamp)!.push(velg(r));
  }
  const m = [...perKamp.values()].map((xs) => xs.reduce((a, b) => a + b, 0) / xs.length);
  const snitt = m.reduce((a, b) => a + b, 0) / Math.max(1, m.length);
  const varians = m.length > 1 ? m.reduce((a, x) => a + (x - snitt) ** 2, 0) / (m.length - 1) : 0;
  return { snitt, se: Math.sqrt(varians / Math.max(1, m.length)), n: rader.length };
}

function celle(velg: (r: Rad) => number, utvalg: Rad[]): { snitt: number; se: number; n: number } {
  if (utvalg.length === 0) return { snitt: NaN, se: NaN, n: 0 };
  const xs = utvalg.map(velg);
  const snitt = xs.reduce((a, b) => a + b, 0) / xs.length;
  const varians = xs.length > 1 ? xs.reduce((a, x) => a + (x - snitt) ** 2, 0) / (xs.length - 1) : 0;
  return { snitt, se: Math.sqrt(varians / xs.length), n: xs.length };
}

const f4 = (x: number): string => (Number.isFinite(x) ? x.toFixed(4) : "  –   ");
const L: string[] = [];
// Uten flagget er linja ord for ord den gamle, så de to kjøringene kan legges ved siden av hverandre.
L.push(
  `FARGESYMMETRI — ${rader.length} stillinger fra ${KAMPER} kamper (frø ${FRØ}), tro ${TRO}, kort ${KORT}` +
    (KANONISK ? "  [KANONISERT: restleddet etter kanonisering, ikke nettets eget brudd]" : ""),
);
L.push(`Bytter per stilling: snitt ${(rader.reduce((a, r) => a + r.bytter, 0) / Math.max(1, rader.length)).toFixed(2)}`);
L.push("");
for (const [navn, velg] of [
  ["TRO  TV per usett kort   ", (r: Rad) => r.troTv],
  ["TRO  argmaks-skifte      ", (r: Rad) => r.troArgmaks],
  ["KORT TV over lovlige     ", (r: Rad) => r.kortTv],
  ["KORT valgt kort skifter  ", (r: Rad) => r.kortValg],
] as const) {
  const k = klynget(velg);
  L.push(`${navn} ${f4(k.snitt)} ± ${f4(k.se)}  (klynget på kamp, ${k.n} stillinger)`);
}
L.push("");
L.push("PER ROLLE:");
for (const rolle of ["foerer", "makker", "forsvar"]) {
  const u = rader.filter((r) => r.rolle === rolle);
  const a = celle((r) => r.troTv, u);
  const b = celle((r) => r.troArgmaks, u);
  const c = celle((r) => r.kortTv, u);
  const d = celle((r) => r.kortValg, u);
  L.push(
    `  ${rolle.padEnd(8)} n=${String(a.n).padStart(5)}  troTV ${f4(a.snitt)}±${f4(a.se)}  troARG ${f4(b.snitt)}±${f4(b.se)}` +
      `  kortTV ${f4(c.snitt)}±${f4(c.se)}  kortVALG ${f4(d.snitt)}±${f4(d.se)}`,
  );
}
L.push("");
L.push("PER STIKK:");
for (let st = 0; st < 12; st++) {
  const u = rader.filter((r) => r.stikk === st);
  if (u.length === 0) continue;
  const a = celle((r) => r.troTv, u);
  const b = celle((r) => r.troArgmaks, u);
  const c = celle((r) => r.kortTv, u);
  const d = celle((r) => r.kortValg, u);
  L.push(
    `  stikk ${String(st).padStart(2)}  n=${String(a.n).padStart(5)}  troTV ${f4(a.snitt)}±${f4(a.se)}  troARG ${f4(b.snitt)}±${f4(b.se)}` +
      `  kortTV ${f4(c.snitt)}±${f4(c.se)}  kortVALG ${f4(d.snitt)}±${f4(d.se)}`,
  );
}
L.push("");
const medUavgjort = rader.filter((r) => r.uavgjort > 0).length;
L.push(
  `KANONISERING: ${medUavgjort} av ${rader.length} stillinger (${((100 * medUavgjort) / Math.max(1, rader.length)).toFixed(1)} %) ` +
    `har minst ett par frie farger som er PUBLIKT uskillelige — der faller kanoniseringen tilbake på den faste ` +
    `fargerekkefølgen, og restasymmetrien blir stående.`,
);
const kanoniskeNavn = new Map<string, number>();
for (const r of rader) kanoniskeNavn.set(r.rolle, (kanoniskeNavn.get(r.rolle) ?? 0) + 1);
void kanoniskBytte; // eksportert og prøvd i test/agX-fargesymmetri.test.ts

const tekst = `${L.join("\n")}\n`;
writeFileSync(`${UT}.sammendrag.txt`, tekst);
console.log(`\n${tekst}`);
console.log(`Rådata: ${UT}   sammendrag: ${UT}.sammendrag.txt`);
