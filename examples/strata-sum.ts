/**
 * SAMMENDRAG av `strata.ts`-radene fra alle arbeiderne.
 *
 *   node examples/strata-sum.ts analyse/strata-w*.jsonl
 *
 * ============ METODEKRAVENE, OG HVOR DE ER OPPFYLT ========================
 *
 * PARRET. Hver rad bærer begge modusene målt på SAMME stilling med de SAMME to
 * verdensfrøene. Alle tall under er differanser innenfor raden, aldri to
 * gjennomsnitt trukket fra hverandre på tvers av utvalg.
 *
 * SE KLYNGET PÅ KAMP. Beslutninger i samme kamp deler giv, bok og motstandere og er
 * ikke uavhengige. SE-en på et gjennomsnitt `d̄` er derfor
 *
 *     SE(d̄) = sqrt( Σ_c ( Σ_{i∈c} (d_i − d̄) )² ) / n
 *
 * summert over klyngene `c` og delt på TOTALT antall rader `n`. Uttrykket er allerede
 * SE-en til gjennomsnittet — det skal IKKE deles på √n en gang til.
 *
 * INGEN ANGER I FLATE STILLINGER. 88 % av sluttspillstillingene har spredning 0 i
 * fasiten (`troledd.md` §2). Regret regnes bare der fasiten skiller, og antallet
 * forkastede rapporteres ved siden av.
 *
 * ÉN FORHÅNDSREGISTRERT HYPOTESE. Rad `ALLE` i punkt 1. Undergruppene er trykt fordi
 * de er informative, ikke fordi noen av dem skal leses som et funn — ti sammenlikninger
 * gir en «største» av seg selv uansett. Se merknaden under tabellen.
 */

import { readFileSync } from "node:fs";

const filer = process.argv.slice(2).filter((a) => a.endsWith(".jsonl"));
if (filer.length === 0) {
  console.error("Bruk: node examples/strata-sum.ts <fil.jsonl> [...]");
  process.exit(1);
}

interface Rad {
  kamp: string;
  rolle: string;
  stikk: number;
  igjen: number;
  lovlige: number;
  ulikI: boolean;
  ulikS: boolean;
  ulikSpiltI: boolean;
  ulikSpiltS: boolean;
  ulikModus: boolean;
  nI1: number;
  nI2: number;
  nS1: number;
  nS2: number;
  utspI: number;
  utspS: number;
  msI: number;
  msS: number;
  kortI1: string;
  kortI2: string;
  kortS1: string;
  kortS2: string;
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

/**
 * DUPLIKATKONTROLL. To arbeidersett startet ved et uhell mot de samme filene ville
 * doblet hver rad, halvert SE-en og gjort et støytall til et «funn». Det skjedde i
 * `bandit`-kjøringen 14. sep og ble bare fanget fordi noen så etter. Her ser riggen
 * selv etter, hver gang.
 */
{
  const sett = new Set<string>();
  let dup = 0;
  for (const r of rader) {
    const n = `${r.kamp}|${r.r as number}|${r.sete as number}|${r.stikk}|${r.kortI1}|${r.kortI2}`;
    if (sett.has(n)) dup++;
    sett.add(n);
  }
  if (dup > 0) {
    console.error(`\n!!! ${dup} DUPLISERTE RADER av ${rader.length}. To arbeidersett har skrevet`);
    console.error(`    til de samme filene. Slett analyse/strata-w*.jsonl og kjør på nytt.\n`);
    process.exit(1);
  }
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
console.log(`\n=== STRATA: ${rader.length} beslutninger, ${kamper.size} kamper, ${filer.length} filer ===\n`);

// ------------------------------------------------------------------ punkt 1
console.log("1. STØYGULVET — hvor ofte skifter argmaks kort BARE av et nytt verdenstrekk?");
console.log("   FORHÅNDSREGISTRERT HYPOTESE: raden ALLE, strata < i.i.d.");
console.log("   (kjente tall: troledd.md §3a 43,8 % ± 1,0; bandit.md 43,0 % ± 1,4)\n");
console.log("gruppe          |     n | I.I.D. (i dag)  | STRATA          | PARRET STRATA − IID");
console.log("-".repeat(98));

const grupper: [string, (r: Rad) => boolean][] = [
  ["ALLE", () => true],
  ["  stikk 0-3", (r) => r.stikk <= 3],
  ["  stikk 4-7", (r) => r.stikk >= 4 && r.stikk <= 7],
  ["  stikk 8+", (r) => r.stikk >= 8],
  ["  foerer", (r) => r.rolle === "foerer"],
  ["  makker", (r) => r.rolle === "makker"],
  ["  forsvar", (r) => r.rolle === "forsvar"],
  ["  2 lovlige", (r) => r.lovlige === 2],
  ["  3-4 lovlige", (r) => r.lovlige >= 3 && r.lovlige <= 4],
  ["  5+ lovlige", (r) => r.lovlige >= 5],
];

for (const [navn, filter] of grupper) {
  const g = rader.filter(filter);
  if (g.length === 0) continue;
  const i = g.filter((r) => r.ulikI).length;
  const sx = g.filter((r) => r.ulikS).length;
  const kl = klynget(
    g.map((r) => (r.ulikS ? 1 : 0) - (r.ulikI ? 1 : 0)),
    g.map((r) => r.kamp),
  );
  console.log(
    `${navn.padEnd(15)} | ${String(g.length).padStart(5)} | ${andel(i, g.length).padStart(15)} | ${andel(sx, g.length).padStart(15)} | ` +
      `${(100 * kl.m >= 0 ? "+" : "") + (100 * kl.m).toFixed(1)} ± ${(100 * kl.se).toFixed(1)} pp (${zTekst(kl.m, kl.se)})`,
  );
}

console.log(
  `\n   MERK: bare raden ALLE er forhåndsregistrert. De ni undergruppene er ni ekstra\n` +
    `   sammenlikninger; den største av dem er ikke et funn uten en egen forhåndsregistrert\n` +
    `   prøve av akkurat den armen. Stikk 0–3 er nevnt på forhånd som den interessante\n` +
    `   (dekomp.md legger +0,49 av K1s +1,24 der), men er ikke lovet.`,
);

console.log("\n   Samme tall for KORTET SOM SPILLES (porten σ ≥ 0,5 anvendt):");
{
  const i = rader.filter((r) => r.ulikSpiltI).length;
  const sx = rader.filter((r) => r.ulikSpiltS).length;
  const kl = klynget(
    rader.map((r) => (r.ulikSpiltS ? 1 : 0) - (r.ulikSpiltI ? 1 : 0)),
    rader.map((r) => r.kamp),
  );
  console.log(
    `   iid ${andel(i, rader.length)}   strata ${andel(sx, rader.length)}   ` +
      `parret ${(100 * kl.m >= 0 ? "+" : "") + (100 * kl.m).toFixed(1)} ± ${(100 * kl.se).toFixed(1)} pp`,
  );
  console.log(
    `   (bandit.md §3: en arm som endrer σ endrer også hvor ofte porten åpner, og da er\n` +
      `    armen TO endringer. Strata rører ikke budsjettet, men σ kan likevel flytte seg —\n` +
      `    derfor står dette tallet her, ikke i en fotnote.)`,
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
        i: [r[`${felt}_I1`], r[`${felt}_I2`]].filter((x): x is number => typeof x === "number"),
        s: [r[`${felt}_S1`], r[`${felt}_S2`]].filter((x): x is number => typeof x === "number"),
        kamp: r.kamp,
      }))
      .filter((p) => p.i.length === 2 && p.s.length === 2);
    if (par.length < 2) continue;
    const snitt = (x: number[]): number => x.reduce((a, b) => a + b, 0) / x.length;
    const mi = snitt(par.map((p) => snitt(p.i)));
    const ms = snitt(par.map((p) => snitt(p.s)));
    const kl = klynget(
      par.map((p) => snitt(p.s) - snitt(p.i)),
      par.map((p) => p.kamp),
    );
    console.log(`   ${merke}: iid ${mi.toFixed(3)}   strata ${ms.toFixed(3)}   (lavere er bedre)`);
    console.log(`   ${vis("     parret strata − iid", kl, "poeng", 1)}`);
  }
}

// ------------------------------------------------------------------ punkt 3
console.log("\n\n3. KOSTNADEN — SAMME antall verdener OG samme antall utspillinger");
{
  const snitt = (x: number[]): number => x.reduce((a, b) => a + b, 0) / x.length;
  const ulikN = rader.filter((r) => r.nI1 !== r.nS1 || r.nI2 !== r.nS2).length;
  const ulikU = rader.filter((r) => r.utspI !== r.utspS).length;
  console.log(`   verdener per vurdering:     iid ${snitt(rader.map((r) => r.nI1)).toFixed(2)}   strata ${snitt(rader.map((r) => r.nS1)).toFixed(2)}`);
  console.log(`   rader med ULIKT antall verdener:     ${ulikN} av ${rader.length}  (skal være 0)`);
  console.log(`   utspillinger per beslutning: iid ${(snitt(rader.map((r) => r.utspI)) / 2).toFixed(1)}   strata ${(snitt(rader.map((r) => r.utspS)) / 2).toFixed(1)}`);
  console.log(`   rader med ULIKT antall utspillinger: ${ulikU} av ${rader.length}  (skal være 0)`);
  console.log(
    `   (utspillinger = n × lovlige, som er nøyaktig løkka i vurderPar. Er begge tallene 0,\n` +
      `    er «samme budsjett» BEVIST rad for rad, ikke hevdet.)`,
  );

  const mi = snitt(rader.map((r) => r.msI / 2));
  const ms = snitt(rader.map((r) => r.msS / 2));
  const klms = klynget(
    rader.map((r) => (r.msS - r.msI) / 2),
    rader.map((r) => r.kamp),
  );
  console.log(`\n   ms/beslutning:              iid ${mi.toFixed(0)}   strata ${ms.toFixed(0)}   (${(100 * (ms / mi - 1)).toFixed(1)} %)`);
  console.log(`   ${vis("   parret strata − iid", klms, "ms", 1)}`);
  console.log(
    `   Den eneste posten som ikke er gratis: én sortering av ${"<kandidater>"} elementer per verden.`,
  );
}

// ------------------------------------------------------------------ punkt 4
console.log("\n\n4. BITER KNOTTEN? (samme frø, i.i.d. mot strata)");
{
  const b = rader.filter((r) => r.ulikModus).length;
  const b3 = rader.filter((r) => r.lovlige >= 3);
  const b3u = b3.filter((r) => r.ulikModus).length;
  console.log(`   ulikt kort på samme frø: ${andel(b, rader.length)} over alle rader`);
  console.log(`                            ${andel(b3u, b3.length)} med ≥ 3 lovlige kort`);
  console.log(
    `   En knott som aldri biter er død i strengen (jf. «12k16d4», som slo hele søket av\n` +
      `   i stillhet). Dette tallet skal være klart over null.`,
  );
}
