/**
 * FRYSER DELINGEN. Skrev `analyse/k1-kampsett.tsv` 14. sep 2026, ÉN gang.
 *
 * KJØR MEG IKKE PÅ NYTT MOT DEN LÅSTE FILA. Etter frysingen er FILA fasit, ikke regelen her:
 * en ny kjøring med andre kamper inn (eller en annen ANDEL) ville flyttet kamper mellom utvalg
 * og holdout, og da er ingen tall sammenliknbare med noe eldre — og holdouten er ikke lenger
 * blind, fordi porten har sett kamper som havnet i den. Skal delingen gjøres om, skal den nye
 * lista ha et NYTT navn. Fila står her for at regelen skal kunne etterprøves, ikke gjentas.
 *
 * Leser bare lagrede rundedata — ingen K1-måling.
 */
import { readFileSync, writeFileSync } from "node:fs";

const UT = process.argv[2] ?? new URL("./k1-kampsett.tsv", import.meta.url);
const ANDEL = 50; // prosent av KAMPENE til utvalg

const fnv = (s) => {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619) >>> 0;
  return x;
};
const bland = (h) => {
  let x = h >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
};

const idAv = (iter) => {
  const s = new Set();
  for (let i = 0; i < 20; i++) {
    const f = `D:/amb-grp/loop/iter${iter}/krav-b0-k1-spek-s${i}.jsonl`;
    for (const l of readFileSync(f, "utf8").split("\n")) if (l.trim()) s.add(JSON.parse(l).spill);
  }
  return [...s].sort();
};

// KONTROLL: alle iterasjonene må ha nøyaktig samme kamper, ellers er «parret» en løgn.
const fasit = idAv(10);
for (const i of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
  const her = idAv(i);
  if (her.length !== fasit.length || her.some((x, k) => x !== fasit[k])) throw new Error(`iter${i} har andre kamper enn iter10`);
}

const linjer = [
  "# K1-KAMPSETT — LÅST 14. sep 2026. Denne FILA er fasit, ikke regelen under.",
  "#",
  "# HVORFOR: helporten i treningsløkka valgte nettsett på K1 målt på ALLE de 2641",
  "# rundene i disse 273 kampene, iterasjon etter iterasjon. Det er seleksjon på",
  "# testsettet: elleve iterasjoner pluss løsrevne målinger på samme sett, med",
  "# SE ±0,20, gir et forventet maksimum av ren støy på ~+0,3 pp — hele størrelsen",
  "# på «forbedringen» fra 1,01 til 1,24.",
  "#",
  "#   utvalg   porten får se. Alle valg av nettsett tas her.",
  "#   holdout  porten ser den ALDRI. Ren rapport, aldri en beslutning.",
  "#",
  "# REGELEN SOM LAGET LISTA (kjørt én gang, aldri igjen):",
  "#   bland(fnv(\"k1sett:\" + spill)) % 100 < 50  →  utvalg, ellers holdout",
  "#   fnv = FNV-1a 32 bit; bland = murmur3 fmix32. Blandingen er ikke pynt:",
  "#   examples/menneske-logg.ts dokumenterer at rå FNV ikke blander de LAVE",
  "#   bitene, og at fnv(\"hold:\"+id) % 4 la ALLE 76 holdout-kampene i halvdel 1.",
  "#",
  "# 50/50 og ikke 60/40: holdouten skal kunne SE en forskjell. Målt på de lagrede",
  "# rundene er parret SE for iter10−iter7 0,22 på 50/50-holdouten mot 0,26 på",
  "# 60/40-holdouten. Porten tåler et litt mindre utvalg bedre enn rapporten tåler",
  "# en blind holdout.",
  "#",
  "# KAMPENE er de 273 fra 10. aug 2026 som finnes i alle iterasjonene iter1..iter10",
  "# (kontrollert: identiske mengder). ENDRES LISTA, er ingen tall sammenliknbare",
  "# med noe eldre — da må den få nytt navn.",
  "spill\tsett",
];
let u = 0;
let h = 0;
for (const id of fasit) {
  const sett = bland(fnv(`k1sett:${id}`)) % 100 < ANDEL ? "utvalg" : "holdout";
  if (sett === "utvalg") u++; else h++;
  linjer.push(`${id}\t${sett}`);
}
writeFileSync(UT, `${linjer.join("\n")}\n`, "utf8");
console.log(`skrev ${UT}: ${fasit.length} kamper, ${u} utvalg, ${h} holdout`);
