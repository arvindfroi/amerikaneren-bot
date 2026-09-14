/**
 * SAMMENDRAG av `bandit.ts`-radene fra alle arbeiderne.
 *
 *   node examples/bandit-sum.ts analyse/bandit-w*.jsonl
 *
 * ============ METODEKRAVENE, OG HVOR DE ER OPPFYLT ========================
 *
 * PARRET. Hver rad bærer begge fordelingene målt på SAMME stilling med de SAMME to
 * verdensfrøene. Alle tall under er derfor differanser innenfor raden, aldri to
 * gjennomsnitt trukket fra hverandre på tvers av utvalg.
 *
 * SE KLYNGET PÅ KAMP. Beslutninger i samme kamp deler giv, bok og motstandere, og er
 * ikke uavhengige. SE-en på et gjennomsnitt `d̄` er derfor
 *
 *     SE(d̄) = sqrt( Σ_c ( Σ_{i∈c} (d_i − d̄) )² ) / n
 *
 * summert over klyngene `c` og delt på TOTALT antall rader `n`. Uttrykket er allerede
 * SE-en til gjennomsnittet — det skal IKKE deles på √n en gang til. (Med én rad per
 * klynge kollapser det til den vanlige SE-en, som er den riktige grensen.)
 *
 * INGEN ANGER I FLATE STILLINGER. 88 % av sluttspillstillingene har spredning 0 i
 * fasiten (`troledd.md` §2). Regret regnes bare der fasiten skiller, og antallet
 * forkastede rapporteres ved siden av.
 */

import { readFileSync } from "node:fs";

const filer = process.argv.slice(2).filter((a) => a.endsWith(".jsonl"));
if (filer.length === 0) {
  console.error("Bruk: node examples/bandit-sum.ts <fil.jsonl> [...]");
  process.exit(1);
}

interface Rad {
  kamp: string;
  rolle: string;
  stikk: number;
  igjen: number;
  lovlige: number;
  ulikJ: boolean;
  ulikH: boolean;
  ulikSpiltJ: boolean;
  ulikSpiltH: boolean;
  utspJ1: number;
  utspJ2: number;
  utspH1: number;
  utspH2: number;
  nJ1: number;
  nH1: number;
  msJ: number;
  msH: number;
  kortJ1: string;
  kortJ2: string;
  kortH1: string;
  kortH2: string;
  spredning: number | null;
  [k: string]: unknown;
}

const rader: Rad[] = [];
for (const f of filer) {
  for (const linje of readFileSync(f, "utf8").split("\n")) {
    if (linje.trim() !== "") rader.push(JSON.parse(linje) as Rad);
  }
}
if (rader.length === 0) {
  console.error("Ingen rader.");
  process.exit(1);
}

/** Andel med binomisk SE — bare for de rå kolonnene; dommen står på den klyngede. */
const andel = (k: number, n: number): string => {
  if (n === 0) return "   –   ";
  const p = k / n;
  return `${(100 * p).toFixed(1)}% ± ${(100 * Math.sqrt((p * (1 - p)) / n)).toFixed(1)}`;
};

/**
 * Gjennomsnitt med KLYNGEROBUST SE. `d` er de parrede differansene, `klynge` hvilken
 * kamp hver av dem hører til. Returnerer også antall klynger, fordi en SE på fire
 * klynger ikke er den samme forsikringen som en på tjue.
 */
function klynget(d: readonly number[], klynge: readonly string[]): {
  m: number;
  se: number;
  n: number;
  k: number;
} {
  const n = d.length;
  if (n === 0) return { m: 0, se: Number.NaN, n: 0, k: 0 };
  const m = d.reduce((a, b) => a + b, 0) / n;
  const sum = new Map<string, number>();
  for (let i = 0; i < n; i++) sum.set(klynge[i]!, (sum.get(klynge[i]!) ?? 0) + (d[i]! - m));
  let kvadrat = 0;
  for (const v of sum.values()) kvadrat += v * v;
  // SE-en TIL GJENNOMSNITTET. Ikke del på √n en gang til.
  return { m, se: Math.sqrt(kvadrat) / n, n, k: sum.size };
}

/**
 * `z` BARE NÅR DEN BETYR NOE. Er SE-en null — differansen er identisk i hver eneste rad —
 * er forholdet `m/se` uendelig, og `se || 1` ville trykt et vilkårlig stort tall som om det
 * var en signifikanstest. Det er nøyaktig hvordan et måletall blir til et falskt funn.
 */
const zTekst = (m: number, se: number): string =>
  !Number.isFinite(se) || se <= 0 ? "z=–" : `z=${(m / se).toFixed(2)}`;

const vis = (navn: string, r: { m: number; se: number; n: number; k: number }, enhet = "pp", skala = 100): string =>
  `${navn.padEnd(26)} ${(skala * r.m >= 0 ? "+" : "") + (skala * r.m).toFixed(2)} ± ${(skala * r.se).toFixed(2)} ${enhet}` +
  `  (${zTekst(r.m, r.se)}, n=${r.n}, klynger=${r.k})`;

const kamper = new Set(rader.map((r) => r.kamp));
console.log(`\n=== BANDITTEN: ${rader.length} beslutninger, ${kamper.size} kamper, ${filer.length} filer ===\n`);

// ------------------------------------------------------------------ punkt 1
console.log("1. STØYGULVET — hvor ofte skifter argmaks kort BARE av et nytt verdenstrekk?");
console.log("   (dagens tall fra troledd.md §3a: 43,8 % ± 1,0)\n");
console.log("gruppe          |     n | JEVN (i dag)    | HALV            | PARRET HALV − JEVN");
console.log("-".repeat(96));

const grupper: [string, (r: Rad) => boolean][] = [
  ["ALLE", () => true],
  ["  foerer", (r) => r.rolle === "foerer"],
  ["  makker", (r) => r.rolle === "makker"],
  ["  forsvar", (r) => r.rolle === "forsvar"],
  ["  stikk 0-3", (r) => r.stikk <= 3],
  ["  stikk 4-7", (r) => r.stikk >= 4 && r.stikk <= 7],
  ["  stikk 8+", (r) => r.stikk >= 8],
  ["  2 lovlige", (r) => r.lovlige === 2],
  ["  3-4 lovlige", (r) => r.lovlige >= 3 && r.lovlige <= 4],
  ["  5+ lovlige", (r) => r.lovlige >= 5],
];

for (const [navn, filter] of grupper) {
  const g = rader.filter(filter);
  if (g.length === 0) continue;
  const j = g.filter((r) => r.ulikJ).length;
  const h = g.filter((r) => r.ulikH).length;
  const kl = klynget(
    g.map((r) => (r.ulikH ? 1 : 0) - (r.ulikJ ? 1 : 0)),
    g.map((r) => r.kamp),
  );
  console.log(
    `${navn.padEnd(15)} | ${String(g.length).padStart(5)} | ${andel(j, g.length).padStart(15)} | ${andel(h, g.length).padStart(15)} | ` +
      `${(100 * kl.m >= 0 ? "+" : "") + (100 * kl.m).toFixed(1)} ± ${(100 * kl.se).toFixed(1)} pp (${zTekst(kl.m, kl.se)})`,
  );
}

console.log("\n   Samme tall for KORTET SOM SPILLES (porten σ ≥ 0,5 anvendt):");
{
  const j = rader.filter((r) => r.ulikSpiltJ).length;
  const h = rader.filter((r) => r.ulikSpiltH).length;
  const kl = klynget(
    rader.map((r) => (r.ulikSpiltH ? 1 : 0) - (r.ulikSpiltJ ? 1 : 0)),
    rader.map((r) => r.kamp),
  );
  console.log(
    `   jevn ${andel(j, rader.length)}   halv ${andel(h, rader.length)}   ` +
      `parret ${(100 * kl.m >= 0 ? "+" : "") + (100 * kl.m).toFixed(1)} ± ${(100 * kl.se).toFixed(1)} pp`,
  );
}

// ------------------------------------------------------------------ punkt 2
console.log("\n\n2. ANGER MOT EKSAKT FASIT — bare der fasiten SKILLER");
const skiller = rader.filter((r) => typeof r.spredning === "number" && r.spredning > 1e-9);
const flate = rader.filter((r) => typeof r.spredning === "number" && r.spredning <= 1e-9);
console.log(
  `   ${skiller.length} skillende, ${flate.length} flate forkastet, ` +
    `${rader.length - skiller.length - flate.length} utenfor fasitvinduet\n`,
);

if (skiller.length < 2) {
  console.log("   For få skillende stillinger til en dom.");
} else {
  for (const [merke, felt] of [
    ["diff-målet", "reg"],
    ["lagmålet", "regl"],
  ] as const) {
    // Begge verdensfrøene teller: to uavhengige trekninger av samme arm, samme stilling.
    const par = skiller
      .map((r) => ({
        j: [r[`${felt}_J1`], r[`${felt}_J2`]].filter((x): x is number => typeof x === "number"),
        h: [r[`${felt}_H1`], r[`${felt}_H2`]].filter((x): x is number => typeof x === "number"),
        kamp: r.kamp,
      }))
      .filter((p) => p.j.length === 2 && p.h.length === 2);
    if (par.length < 2) continue;
    const snitt = (x: number[]): number => x.reduce((a, b) => a + b, 0) / x.length;
    const mj = snitt(par.map((p) => snitt(p.j)));
    const mh = snitt(par.map((p) => snitt(p.h)));
    const kl = klynget(
      par.map((p) => snitt(p.h) - snitt(p.j)),
      par.map((p) => p.kamp),
    );
    console.log(`   ${merke}: jevn ${mj.toFixed(3)}   halv ${mh.toFixed(3)}   (lavere er bedre)`);
    console.log(`   ${vis("     parret halv − jevn", kl, "poeng", 1)}`);
  }
}

// ------------------------------------------------------------------ punkt 3
console.log("\n\n3. KOSTNADEN — skal være uendret i UTSPILLINGER");
{
  const uj = rader.map((r) => r.utspJ1 + r.utspJ2);
  const uh = rader.map((r) => r.utspH1 + r.utspH2);
  const snitt = (x: number[]): number => x.reduce((a, b) => a + b, 0) / x.length;
  const kl = klynget(
    rader.map((_, i) => uh[i]! - uj[i]!),
    rader.map((r) => r.kamp),
  );
  const over = rader.filter((r, i) => uh[i]! > uj[i]!).length;
  console.log(`   utspillinger/beslutning:  jevn ${(snitt(uj) / 2).toFixed(1)}   halv ${(snitt(uh) / 2).toFixed(1)}`);
  console.log(`   ${vis("   parret halv − jevn", kl, "utsp.", 0.5)}`);
  console.log(`   rader der halv brukte FLERE utspillinger enn jevn: ${over} av ${rader.length}`);

  const mj = snitt(rader.map((r) => r.msJ / 2));
  const mh = snitt(rader.map((r) => r.msH / 2));
  const klms = klynget(
    rader.map((r) => (r.msH - r.msJ) / 2),
    rader.map((r) => r.kamp),
  );
  console.log(`\n   ms/beslutning:            jevn ${mj.toFixed(0)}   halv ${mh.toFixed(0)}   (${(100 * (mh / mj - 1)).toFixed(1)} %)`);
  console.log(`   ${vis("   parret halv − jevn", klms, "ms", 1)}`);
  console.log(
    `   verdener beste kort ble vurdert i:  jevn ${snitt(rader.map((r) => r.nJ1)).toFixed(1)}   ` +
      `halv ${snitt(rader.map((r) => r.nH1)).toFixed(1)}`,
  );
}

// ------------------------------------------------------------------ punkt 4
console.log("\n\n4. AV ER AV — k = 2 skal være BIT-IDENTISK");
{
  const to = rader.filter((r) => r.lovlige === 2);
  const ulike = to.filter((r) => r.kortJ1 !== r.kortH1 || r.kortJ2 !== r.kortH2);
  console.log(
    `   ${to.length} beslutninger med to lovlige kort. Med k=2 er halveringen ÉN runde over ` +
      `hele budsjettet,\n   altså nøyaktig den jevne fordelingen. Ulike kort: ${ulike.length} ` +
      `(skal være 0).`,
  );
}
