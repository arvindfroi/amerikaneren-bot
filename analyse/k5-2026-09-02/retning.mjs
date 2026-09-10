/**
 * K5 PER SKARD: antall endrede valg OG retningen blant dem, for den ekte og den
 * vendte knotten, med eksakt tosidig binomialtest på delmengder av båndene.
 *
 *   node analyse/k5-2026-09-02/retning.mjs analyse/k5-2026-09-02/skard-*.txt
 *
 * `samle.mjs` summerer antallene. Denne fila finnes fordi 2. september-dommen
 * hvilte på antallene (14 mot 14), og antallet kan ikke skille en knott som
 * peker riktig fra en som peker feil: begge dytter like hardt (|λ| = 1,5).
 * Det som KAN skille dem er fortegnet blant de endrede valgene. En ekte
 * retningsknott skal gi «opp» (mer spredning) bak og «ned» foran — og den
 * VENDTE knotten skal gi det motsatte. Et søkeartefakt som bare dytter
 * spredningen én vei, ville trukket begge armene samme vei.
 *
 * KASTER på et mønster som ikke treffer, samme regel som samle.mjs: et skard
 * som leses halvt ville gitt en mindre nevner uten at totalen så annerledes ut.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const krev = (t, re, f) => {
  const m = t.match(re);
  if (!m) throw new Error(`${f}: fant ikke ${re}`);
  return m.slice(1).map(Number);
};

const rader = process.argv.slice(2).map((f) => {
  const t = readFileSync(f, "utf8");
  const [froe] = krev(t, /froe (\d+)/, f);
  const [dBak, n] = krev(t, /BAK-RETNINGEN[^:]*: (\d+) av (\d+) valg/, f);
  const [dForan] = krev(t, /FORAN-RETNINGEN: (\d+) av \d+ valg/, f);
  const [fBak, fForan] = krev(t, /FALSIFISERING[^:]*: bak (\d+)\/\d+.*foran (\d+)\/\d+/, f);
  const [vBakOpp, vBakNed, vForanOpp, vForanNed] = krev(
    t, /vendte armene: bak (\d+) opp \/ (\d+) ned av \d+, foran (\d+) opp \/ (\d+) ned/, f);
  const [bakOpp, bakNed] = krev(t, /BAK {2}\(fast 70-90\): (\d+) opp \/ (\d+) ned/, f);
  const [foranOpp, foranNed] = krev(t, /FORAN \(fast 90-70\): (\d+) opp \/ (\d+) ned/, f);
  const skard = Number(basename(f).match(/skard-(\d+)/)[1]);
  return { skard, froe, n, dBak, fBak, bakOpp, bakNed, vBakOpp, vBakNed, dForan, fForan, foranOpp, foranNed, vForanOpp, vForanNed };
}).sort((a, b) => a.skard - b.skard);

/** Eksakt tosidig binomial-p for k av n ved p = 0,5. */
const binom = (k, n) => {
  if (n === 0) return 1;
  const lg = (x) => { let s = 0; for (let i = 2; i <= x; i++) s += Math.log(i); return s; };
  const pmf = (i) => Math.exp(lg(n) - lg(i) - lg(n - i) - n * Math.LN2);
  const obs = pmf(k);
  let p = 0;
  for (let i = 0; i <= n; i++) if (pmf(i) <= obs * (1 + 1e-9)) p += pmf(i);
  return Math.min(1, p);
};

console.log("skard froe       n  | BAK: D  Fb  D opp/ned  Fb opp/ned | FORAN: D  Fb  D opp/ned  Fb opp/ned");
for (const r of rader) {
  console.log(
    `${String(r.skard).padStart(5)} ${String(r.froe).padEnd(9)} ${String(r.n).padStart(3)} |` +
    `     ${String(r.dBak).padStart(2)}  ${String(r.fBak).padStart(2)}   ${r.bakOpp}/${r.bakNed}`.padEnd(29) +
    `${r.vBakOpp}/${r.vBakNed}`.padEnd(12) + "|" +
    `       ${String(r.dForan).padStart(2)}  ${String(r.fForan).padStart(2)}   ${r.foranOpp}/${r.foranNed}`.padEnd(29) +
    `${r.vForanOpp}/${r.vForanNed}`,
  );
}

const sum = (rs, k) => rs.reduce((s, r) => s + r[k], 0);
const rapport = (navn, rs) => {
  const bo = sum(rs, "bakOpp"), bn = sum(rs, "bakNed");
  const fo = sum(rs, "foranOpp"), fn = sum(rs, "foranNed");
  const vbo = sum(rs, "vBakOpp"), vbn = sum(rs, "vBakNed");
  const vfo = sum(rs, "vForanOpp"), vfn = sum(rs, "vForanNed");
  const riktig = bo + fn, feil = bn + fo; // kravet: BAK -> opp, FORAN -> ned
  const vr = vbn + vfo, vf = vbo + vfn; // vendt knott: BAK -> ned, FORAN -> opp
  console.log(`\n${navn}  (${rs.length} skard, n=${sum(rs, "n")} per arm)`);
  console.log(`  endrede valg BAK:   ekte D ${sum(rs, "dBak")}   vendt Fb ${sum(rs, "fBak")}`);
  console.log(`  endrede valg FORAN: ekte D ${sum(rs, "dForan")}   vendt Fb ${sum(rs, "fForan")}`);
  console.log(`  ekte BAK   opp/ned ${bo}/${bn}   p=${binom(bo, bo + bn).toFixed(4)}`);
  console.log(`  ekte FORAN opp/ned ${fo}/${fn}   p=${binom(fn, fo + fn).toFixed(4)}`);
  console.log(`  ekte samlet riktig/feil vei ${riktig}/${feil}   p=${binom(riktig, riktig + feil).toFixed(6)}`);
  console.log(`  VENDT BAK opp/ned ${vbo}/${vbn}   VENDT FORAN opp/ned ${vfo}/${vfn}`);
  console.log(`  vendt samlet i SIN retning / motsatt ${vr}/${vf}   p=${binom(vr, vr + vf).toFixed(6)}`);
};

rapport("ALLE", rader);
rapport("UTEN skard 0 (froe 5 100 000)", rader.filter((r) => r.skard !== 0));
rapport("BARE NYE 4-11 (replikasjon)", rader.filter((r) => r.skard >= 4));
rapport("GAMLE 0-3", rader.filter((r) => r.skard <= 3));
