/**
 * Summerer K5-skard. Hvert skard er en uavhengig frøbånd-kjøring av
 * examples/k5-kontekst.ts, så tellerne kan legges sammen rett fram.
 */
import { readFileSync } from "node:fs";

const filer = process.argv.slice(2);
const sum = {};
const legg = (nøkkel, a, b) => {
  sum[nøkkel] ??= [0, 0];
  sum[nøkkel][0] += a;
  sum[nøkkel][1] += b;
};

const møn = [
  ["kontroll", /^K\s+KONTROLL: begge armer bit-identiske\s*(\d+)\s+(\d+)/m, "nb"],
  ["tilpasning", /TILPASNING: (\d+) av (\d+) valg endret seg/],
  ["bak", /BAK-RETNINGEN[^:]*: (\d+) av (\d+) valg endret seg/],
  ["foran", /FORAN-RETNINGEN: (\d+) av (\d+) valg endret seg/],
  ["foerer_bak", /^ {2}BAK {2}\(fast 70-90\): (\d+) av (\d+) foerervalg/m],
  ["foerer_foran", /^ {2}FORAN \(fast 90-70\): (\d+) av (\d+) foerervalg/m],
];

for (const f of filer) {
  const t = readFileSync(f, "utf8");
  for (const [navn, re, form] of møn) {
    const m = t.match(re);
    /**
     * KASTER, den advarer ikke.
     *
     * Her sto `console.error(...); continue;`. Et mønster som ikke traff ville
     * da gitt en MINDRE nevner uten at totalen så noe annerledes ut — «14 av
     * 192» kunne i virkeligheten vært «14 av 144», og advarselen ville ligget
     * på stderr der en `| grep` eller `| tail` spiser den.
     *
     * Det er samme feilklasse som resten av denne mappa handler om: et tall som
     * ser gyldig ut fordi det som gikk galt ble håndtert i stillhet. En
     * aggregator som ikke kan si «jeg leste alle fire skardene» skal ikke
     * skrive ut en prosent.
     *
     * (Kjøringen 2. september ga null advarsler — nevnerne er ekte 4×48. Det er
     * verifisert, ikke antatt.)
     */
    if (!m) throw new Error(`«${navn}» ikke funnet i ${f} — nevneren ville blitt feil`);
    // Kontrollraden har n foer ulike; de andre har «X av Y».
    if (form === "nb") legg(navn, Number(m[2]), Number(m[1]));
    else legg(navn, Number(m[1]), Number(m[2]));
  }
  // Tegntesten: retning blant de endrede.
  const tb = t.match(/^ {2}BAK {2}\(fast 70-90\): (\d+) opp \/ (\d+) ned av (\d+) endrede/m);
  const tf = t.match(/^ {2}FORAN \(fast 90-70\): (\d+) opp \/ (\d+) ned av (\d+) endrede/m);
  if (tb) { legg("tegn_bak_opp", Number(tb[1]), Number(tb[3])); legg("tegn_bak_ned", Number(tb[2]), Number(tb[3])); }
  if (tf) { legg("tegn_foran_opp", Number(tf[1]), Number(tf[3])); legg("tegn_foran_ned", Number(tf[2]), Number(tf[3])); }
  const fa = t.match(/FALSIFISERING[^:]*: bak (\d+)\/(\d+) .*?foran (\d+)\/(\d+)/);
  if (fa) { legg("vendt_bak", Number(fa[1]), Number(fa[2])); legg("vendt_foran", Number(fa[3]), Number(fa[4])); }
}

const wilson = (k, n) => {
  if (n === 0) return [0, 0];
  const p = k / n, z = 1.96, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const h = z / d * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, c - h), Math.min(1, c + h)];
};

console.log(`skard: ${filer.length}\n`);
console.log("| mål | endret | av | andel | 95 %-KI |");
console.log("|---|---|---|---|---|");
const vis = (navn, etikett) => {
  const [k, n] = sum[navn] ?? [0, 0];
  const [lo, hi] = wilson(k, n);
  console.log(`| ${etikett} | ${k} | ${n} | ${(100 * k / n).toFixed(1)} % | ${(100 * lo).toFixed(1)}–${(100 * hi).toFixed(1)} |`);
};
vis("kontroll", "KONTROLL (må være 0)");
vis("tilpasning", "TILPASNING (bak vs foran)");
vis("bak", "BAK-retningen (avgjørende)");
vis("foran", "FORAN-retningen");
vis("vendt_bak", "FALSIFISERING bak (knott vendt feil)");
vis("vendt_foran", "FALSIFISERING foran (knott vendt feil)");
vis("foerer_bak", "UTRULLET (amu:foerer) bak");
vis("foerer_foran", "UTRULLET (amu:foerer) foran");
console.log("\ntegntest blant de ENDREDE:");
for (const [n, e] of [["tegn_bak_opp", "bak opp (kravet vil ha OPP)"], ["tegn_bak_ned", "bak ned"], ["tegn_foran_opp", "foran opp"], ["tegn_foran_ned", "foran ned (kravet vil ha NED)"]]) {
  const [k, tot] = sum[n] ?? [0, 0];
  console.log(`  ${e.padEnd(32)} ${k} av ${tot}`);
}
