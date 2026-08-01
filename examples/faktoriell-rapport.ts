/**
 * FAKTORIELL ANALYSE av konvensjonsvaktens flagg – hovedeffekter OG samspill.
 *
 *   node examples/faktoriell-rapport.ts analyse/faktoriell.json
 *
 * HVORFOR. Reglene er hittil målt én av gangen, eller i noen få kombinasjoner
 * jeg valgte i forveien. Da ser man aldri om to regler forsterker eller
 * opphever hverandre. Arvind spurte om alle policyene kunne prøves samtidig og
 * hvordan de samkjører; et fullt faktorielt oppsett svarer på begge deler.
 *
 * OPPSETTET er 3 × 3 × 2 × 2 = 36 celler:
 *
 *   vakt 1   av | a (billigst under) | h (høyest under)
 *   vakt 2   av | t (ikke trumf)     | b (alltid billigst)
 *   vakt 3   av | l (laveste trumf når etterlysningen er garantert)
 *   vakt 4   av | k (billigst når stikket ikke kan tas)
 *
 * ALT ER PARRET på giveren: hver celle spilte NØYAKTIG de samme givene mot de
 * samme medspillerne. En kontrast regnes derfor per giver først, og
 * standardfeilen tas over givere. Det er den eneste ærlige SE-en her – cellene
 * er ikke uavhengige av hverandre, de deler kortene.
 *
 * HOVEDEFFEKTEN til et nivå er snittet over ALLE celler med det nivået minus
 * snittet over cellene med grunnivået, midlet over de andre faktorene. Med 12
 * celler i hver gruppe er den godt understøttet.
 *
 * MULTIPLISITET: 36 celler betyr at den BESTE cellen er valgt ut av 36, og
 * dens forsprang er systematisk overdrevet. Derfor rapporteres hovedeffektene
 * som hovedresultat, og den beste cellen bare med den advarselen påklistret.
 */

import { readFileSync } from "node:fs";

const fil = process.argv[2] ?? "analyse/faktoriell.json";
const data = JSON.parse(readFileSync(fil, "utf8")) as {
  rolle: string;
  kontrakt: number;
  andre: string;
  kandidater: { navn: string; spek: string }[];
  lagStikk: number[][];
};

/** Flaggene i en spesifikasjon: «vakt:abl:e1:…» → "abl", «e1:…» → "". */
function flagg(spek: string): string {
  return spek.startsWith("vakt:") ? spek.slice(5, spek.indexOf(":", 5)) : "";
}

interface Celle {
  readonly g1: "-" | "a" | "h";
  readonly g2: "-" | "t" | "b";
  readonly l: boolean;
  readonly k: boolean;
  readonly verdier: readonly number[];
  readonly navn: string;
}
const celler: Celle[] = data.kandidater.map((kand, i) => {
  const f = flagg(kand.spek);
  return {
    g1: f.includes("h") ? "h" : f.includes("a") ? "a" : "-",
    g2: f.includes("b") ? "b" : f.includes("t") ? "t" : "-",
    l: f.includes("l"),
    k: f.includes("k"),
    verdier: data.lagStikk[i]!,
    navn: f === "" ? "(ingen)" : f,
  };
});

const n = celler[0]!.verdier.length;
if (celler.some((c) => c.verdier.length !== n)) throw new Error("Cellene har ulikt antall givere – ikke parret");

const snitt = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / v.length;

/** Parret kontrast mellom to cellegrupper: snitt(A) − snitt(B), per giver. */
function kontrast(a: readonly Celle[], b: readonly Celle[]): { d: number; se: number } {
  if (a.length === 0 || b.length === 0) return { d: NaN, se: NaN };
  const per: number[] = [];
  for (let i = 0; i < n; i++) {
    let sa = 0;
    for (const c of a) sa += c.verdier[i]!;
    let sb = 0;
    for (const c of b) sb += c.verdier[i]!;
    per.push(sa / a.length - sb / b.length);
  }
  const d = snitt(per);
  let sq = 0;
  for (const x of per) sq += (x - d) * (x - d);
  return { d, se: Math.sqrt(sq / (per.length - 1) / per.length) };
}

const tall = (x: number): string => (x >= 0 ? "+" : "") + x.toFixed(3);
const medSE = (r: { d: number; se: number }): string =>
  `${tall(r.d).padStart(7)} ± ${r.se.toFixed(3)}  (${(r.d / r.se).toFixed(1)} SE)`;

console.log(`\n=== Faktoriell analyse: ${data.kandidater.length} celler, ${n} kontrakter ===`);
console.log(`Rolle «${data.rolle}», tvungen kontrakt ${data.kontrakt}, medspillere «${data.andre}».`);
console.log(`Alt parret på giveren. Enhet: lagstikk.\n`);

console.log("HOVEDEFFEKTER – hvert nivå mot grunnivået, midlet over de andre faktorene");
console.log("-".repeat(72));
const hoved: [string, Celle[], Celle[]][] = [
  ["vakt 1: a mot av", celler.filter((c) => c.g1 === "a"), celler.filter((c) => c.g1 === "-")],
  ["vakt 1: h mot av", celler.filter((c) => c.g1 === "h"), celler.filter((c) => c.g1 === "-")],
  ["vakt 1: h mot a", celler.filter((c) => c.g1 === "h"), celler.filter((c) => c.g1 === "a")],
  ["vakt 2: t mot av", celler.filter((c) => c.g2 === "t"), celler.filter((c) => c.g2 === "-")],
  ["vakt 2: b mot av", celler.filter((c) => c.g2 === "b"), celler.filter((c) => c.g2 === "-")],
  ["vakt 2: b mot t", celler.filter((c) => c.g2 === "b"), celler.filter((c) => c.g2 === "t")],
  ["vakt 3: l mot av", celler.filter((c) => c.l), celler.filter((c) => !c.l)],
  ["vakt 4: k mot av", celler.filter((c) => c.k), celler.filter((c) => !c.k)],
];
for (const [navn, a, b] of hoved) console.log(`  ${navn.padEnd(20)} ${medSE(kontrast(a, b))}`);

console.log(`\nSAMSPILL – avhenger effekten av én regel av hva de andre står på?`);
console.log("-".repeat(72));
/** Effekten av `test` innenfor hver undergruppe definert av `del`. */
function samspill(
  navn: string,
  test: (c: Celle) => boolean,
  del: { merke: string; velg: (c: Celle) => boolean }[],
): void {
  console.log(`\n  ${navn}`);
  for (const d of del) {
    const inne = celler.filter((c) => d.velg(c));
    console.log(
      `    ${d.merke.padEnd(18)} ${medSE(kontrast(inne.filter(test), inne.filter((c) => !test(c))))}`,
    );
  }
}
samspill("effekten av «l», delt på vakt 1", (c) => c.l, [
  { merke: "vakt 1 = av", velg: (c) => c.g1 === "-" },
  { merke: "vakt 1 = a", velg: (c) => c.g1 === "a" },
  { merke: "vakt 1 = h", velg: (c) => c.g1 === "h" },
]);
samspill("effekten av «k», delt på vakt 2", (c) => c.k, [
  { merke: "vakt 2 = av", velg: (c) => c.g2 === "-" },
  { merke: "vakt 2 = t", velg: (c) => c.g2 === "t" },
  { merke: "vakt 2 = b", velg: (c) => c.g2 === "b" },
]);
samspill("effekten av vakt 2 (b mot av), delt på vakt 1", (c) => c.g2 === "b", [
  { merke: "vakt 1 = av", velg: (c) => c.g1 === "-" && c.g2 !== "t" },
  { merke: "vakt 1 = a", velg: (c) => c.g1 === "a" && c.g2 !== "t" },
  { merke: "vakt 1 = h", velg: (c) => c.g1 === "h" && c.g2 !== "t" },
]);
samspill("effekten av vakt 1 (a mot av), delt på vakt 2", (c) => c.g1 === "a", [
  { merke: "vakt 2 = av", velg: (c) => c.g2 === "-" && c.g1 !== "h" },
  { merke: "vakt 2 = t", velg: (c) => c.g2 === "t" && c.g1 !== "h" },
  { merke: "vakt 2 = b", velg: (c) => c.g2 === "b" && c.g1 !== "h" },
]);

console.log(`\n\nALLE CELLENE, sortert`);
console.log("-".repeat(72));
const grunn = celler.find((c) => c.g1 === "-" && c.g2 === "-" && !c.l && !c.k)!;
const sortert = [...celler].sort((a, b) => snitt(b.verdier) - snitt(a.verdier));
for (const c of sortert) {
  const r = kontrast([c], [grunn]);
  console.log(`  ${c.navn.padEnd(8)} ${snitt(c.verdier).toFixed(3)}   mot rent nett ${medSE(r)}`);
}
console.log(`
MULTIPLISITET: den øverste cellen er valgt ut av ${celler.length}, så forspranget
dens er systematisk overdrevet. Hovedeffektene over midler over 12 celler hver
og er den delen av tabellen som tåler å bli lest som et funn.`);
