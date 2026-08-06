/**
 * T2.1 — BUDMODELLEN SOM HØRER BUDRUNDEN.
 *
 *   node examples/budmodell-v2.ts --data bud-auksjon --ut e1-modell/bud-v2.json
 *
 * `BUD_DIM_V2` (140 trekk) legger tolv trekk til de 128: de tre andres bud på
 * relativt sete, passflagg, høyeste bud, hvor mange som fortsatt kan overby.
 * Blokken er bygget, versjonert og testet siden 5. august — og aldri trent,
 * fordi korpuset ikke lot seg trene på (§68).
 *
 * ============ HVA SOM ER ANNERLEDES ENN `budmodell.ts` ====================
 *
 * TREKKENE BYGGES FRA EN EKTE AUKSJONSSTILLING. v1 bruker `opprettSpill(frø)`
 * og første budgiver — en fersk giv der ingen har bydd. Her spilles budprefikset
 * fra korpuset inn FØRST, så `budTrekk(s, sete, 140)` ser den auksjonen raden
 * faktisk sto i.
 *
 * ETIKETTEN ER BETINGET PÅ AUKSJONEN. Stikkfordelingen i korpuset er hentet med
 * forkastningstrekking: bare omdelinger som ville gitt samme budprefiks er med
 * (§68). Uten det ville gradienten på indeks 128–139 vært null i forventning.
 *
 * `vant[N]` ARVES, DEN TRENES IKKE. Tabellen er et faktum om OMGIVELSENE — hvor
 * ofte bud N vinner budrunden — og hører til et annet regnskap (§47, §65:
 * `bud-vant` for benken, `bud-menneske` for appen). Den kopieres fra `--vant`
 * slik at v1 og v2 skiller seg på NØYAKTIG én ting: om modellen hører auksjonen.
 * Blandet vi de to endringene, kunne ingen måling si hvilken som virket.
 *
 * GBT-EN ER DEN SAMME KODEN, ikke en kopi: `src/moe2/gbt.ts`, uttrukket og
 * verifisert bit-identisk (§76). `bredde` er 140 her og 128 der — sto den fast,
 * ville v2-blokken aldri blitt vurdert som splitt.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { budTrekk, BUD_DIM_V2 } from "../src/moe2/budtrekk.ts";
import { anslåSkog, trenSkog, type Skog } from "../src/moe2/gbt.ts";
import { tall } from "../src/moe2/agentspek.ts";

const arg = (n: string, s: string) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const DATA = arg("--data", "bud-auksjon");
const UT = arg("--ut", "e1-modell/bud-v2.json");
const VANT_FRA = arg("--vant", "e1-modell/bud-vant.json");
const RUNDER = tall(arg("--runder", "300"), 300, "runder");
const DYBDE = tall(arg("--dybde", "3"), 3, "dybde");
const RATE = tall(arg("--rate", "0.06"), 0.06, "rate");
const HOLD = tall(arg("--holdout", "0.2"), 0.2, "holdout");
/** Rader med for få godkjente trekninger er ren støy og skal ut. */
const MIN_STIKK = tall(arg("--minstikk", "6"), 6, "minstikk");
/**
 * `--kunv1` trener paa NOEYAKTIG samme korpus og samme etiketter, men lar
 * modellen bare se de 128 foerste trekkene.
 *
 * Det er den eneste kontrollen som isolerer v2-blokken. Uten den kan et
 * daarlig resultat like gjerne skyldes at korpuset er nytt, at etikettene er
 * hentet med forkastningstrekking, eller at stillingene er andre - alt sammen
 * ting som endret seg samtidig.
 */
const KUN_V1 = process.argv.includes("--kunv1");

interface Rad {
  frø: number;
  sete: number;
  prefiks: string;
  stikk: number[];
  godkjent: number;
  forsøk: number;
}

const rå: Rad[] = [];
for (const f of readdirSync(DATA).filter((x) => x.endsWith(".jsonl"))) {
  for (const linje of readFileSync(join(DATA, f), "utf8").split("\n")) {
    if (!linje.trim()) continue;
    try {
      const r = JSON.parse(linje) as Rad;
      if (Array.isArray(r.stikk) && r.stikk.length >= MIN_STIKK) rå.push(r);
    } catch {
      /* siste linje kan være halvskrevet mens generatoren kjører */
    }
  }
}
if (rå.length === 0) throw new Error(`Ingen brukbare rader i «${DATA}»`);

const sn = (v: readonly number[]): number => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0);
const sd = (v: readonly number[]): number => {
  if (v.length < 2) return 1;
  const m = sn(v);
  return Math.sqrt(v.reduce((a, x) => a + (x - m) * (x - m), 0) / (v.length - 1));
};

/**
 * Gjenskaper stillingen raden sto i: fersk giv fra frøet, så budprefikset
 * spilt inn.
 *
 * FAIL-FAST PÅ AVVIK. Blir det ikke `sete` sin tur etter prefikset, er raden
 * og koden uenige om hva prefikset betyr, og trekkene ville vært bygget for
 * feil spiller. Det ville ikke krasjet — det ville bare trent på søppel.
 */
function stillingFra(r: Rad): GameState | null {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, r.frø);
  if (r.prefiks !== "") {
    for (const del of r.prefiks.split(",")) {
      const k = del.indexOf(":");
      const spiller = Number(del.slice(0, k));
      const b = del.slice(k + 1);
      const bud = /^\d+$/.test(b) ? Number(b) : b;
      if (s.fase !== "BUDRUNDE" || s.iTur !== spiller) return null;
      s = utfør(s, { type: "BUD", spiller, bud } as Handling).state;
    }
  }
  return s.fase === "BUDRUNDE" && s.iTur === r.sete ? s : null;
}

interface Sak { x: Float32Array; μ: number; σ: number; hold: boolean }
const saker: Sak[] = [];
let avvist = 0;
for (const r of rå) {
  const s = stillingFra(r);
  if (s === null) {
    avvist++;
    continue;
  }
  saker.push({
    x: budTrekk(s, r.sete, BUD_DIM_V2),
    μ: sn(r.stikk),
    σ: Math.max(0.5, sd(r.stikk)),
    // Holdout deles på FRØ, ikke rad: samme giv gir flere budstillinger, og
    // havner de på hver sin side av delet, lekker treningen inn i holdouten.
    hold: (Math.imul(r.frø, 2654435761) >>> 0) / 2 ** 32 < HOLD,
  });
}

const tren = saker.filter((s) => !s.hold);
const hold = saker.filter((s) => s.hold);
console.log(`${KUN_V1 ? "KONTROLL (bare 128 trekk): " : ""}${rå.length} rader, ${avvist} avvist (prefiks stemte ikke), ${tren.length} tren / ${hold.length} hold`);
if (tren.length < 200) throw new Error(`For få treningsrader (${tren.length}) – la korpuset vokse`);

/** Andelen rader der v2-blokken faktisk bærer noe. Er den 0, er alt forgjeves. */
const medAuksjon = saker.filter((s) => {
  for (let i = 128; i < BUD_DIM_V2; i++) if (s.x[i]! !== 0) return true;
  return false;
}).length;
console.log(`v2-blokken er levende i ${((100 * medAuksjon) / saker.length).toFixed(1)} % av radene`);
if (medAuksjon < saker.length * 0.3) {
  throw new Error(
    `Bare ${medAuksjon} av ${saker.length} rader har noe i v2-blokken. ` +
      `Da kan modellen ikke lære den, og maalingen ville sagt «budrunden gir ` +
      `ingenting» paa et oppsett som ikke kunne gitt noe annet.`,
  );
}

const Xt = tren.map((s) => s.x);
const opts = { runder: RUNDER, dybde: DYBDE, rate: RATE, bredde: KUN_V1 ? 128 : BUD_DIM_V2 };
const mμ: Skog = trenSkog(Xt, tren.map((s) => s.μ), opts);
const mσ: Skog = trenSkog(Xt, tren.map((s) => s.σ), opts);

const rot = (v: Sak[], m: Skog, f: (s: Sak) => number): number =>
  Math.sqrt(sn(v.map((s) => (f(s) - anslåSkog(m, s.x, RATE)) ** 2)));
console.log(`RMSE mu:    tren ${rot(tren, mμ, (s) => s.μ).toFixed(4)}   hold ${rot(hold, mμ, (s) => s.μ).toFixed(4)}`);
console.log(`RMSE sigma: tren ${rot(tren, mσ, (s) => s.σ).toFixed(4)}   hold ${rot(hold, mσ, (s) => s.σ).toFixed(4)}`);

/** Hvor ofte v2-kolonnene velges som splitt – tom blokk ville gitt 0. */
let v2Splitt = 0;
let alleSplitt = 0;
const tellSplitt = (n: Skog["trær"][number]): void => {
  if (n.blad) return;
  alleSplitt++;
  if ((n.kol ?? 0) >= 128) v2Splitt++;
  tellSplitt(n.v!);
  tellSplitt(n.h!);
};
for (const t of [...mμ.trær, ...mσ.trær]) tellSplitt(t);
console.log(`splitter paa v2-blokken: ${v2Splitt} av ${alleSplitt} (${((100 * v2Splitt) / Math.max(1, alleSplitt)).toFixed(1)} %)`);

const gammel = JSON.parse(readFileSync(VANT_FRA, "utf8")) as { bud: number[]; vant: Record<string, number> };
mkdirSync(dirname(UT), { recursive: true });
writeFileSync(
  UT,
  JSON.stringify({ dim: BUD_DIM_V2, bud: gammel.bud, rate: RATE, vant: gammel.vant, mμ, mσ }),
);
console.log(`Skrev ${UT} (dim ${BUD_DIM_V2}, vant arvet fra ${VANT_FRA})`);
