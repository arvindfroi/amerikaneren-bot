/**
 * Beskjæring: fjern koblinger som ikke gjør nytte, og mål hva det koster.
 *
 *   node examples/neat-beskjaer.ts trening-d5/gull.json ut-mappe [--nivaaer 10,25,40,60]
 *
 * EDA-regresjonen over 44 672 individer ga `koblinger` koeffisienten −0,087 –
 * den STERKESTE av alle 22 trekk, og negativ. NEAT vokser monotont: hver
 * nyKobling-mutasjon som ikke er direkte skadelig kan overleve på drift, og
 * over hundrevis av generasjoner samler genomet opp koblinger som ikke gjør
 * annet enn å legge støy på aktiveringene.
 *
 * Metoden er magnitude pruning, som i vanlige nett: koblinger med minst
 * |vekt| bidrar minst, og fjernes først. To vern:
 *  - En utgang mister aldri sin SISTE kobling (da ville hodet blitt dødt og
 *    agenten mistet en hel beslutningstype).
 *  - Vi beskjærer flere NIVÅER og måler hvert enkelt parret mot originalen.
 *    Det er hele poenget: «færre koblinger er bedre» er en korrelasjon fra
 *    populasjonen, ikke et bevis for at akkurat DETTE genomet tåler kutt.
 *    Kurven over nivåer viser hvor det faktiske optimumet ligger.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { genomFraJson, type Genom } from "../src/neat/index.ts";

const genomFil = process.argv[2] ?? "trening-d5/gull.json";
const utMappe = process.argv[3] ?? "beskjaering";
const nivåArg = process.argv.includes("--nivaaer")
  ? process.argv[process.argv.indexOf("--nivaaer") + 1]!
  : "10,25,40,60";
const nivåer = nivåArg.split(",").map(Number);

const rå = JSON.parse(readFileSync(genomFil, "utf8")) as { genom?: unknown };
const basis: Genom = genomFraJson(
  rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(genomFil, "utf8"),
);

mkdirSync(utMappe, { recursive: true });
writeFileSync(`${utMappe}/original.json`, JSON.stringify(basis));

const aktive = basis.koblinger.filter((k) => k.aktiv !== false);
console.log(
  `${genomFil}: ${basis.noder.length} noder, ${basis.koblinger.length} koblinger (${aktive.length} aktive)`,
);

/** Beskjærer bort `andel` prosent av de svakeste aktive koblingene. */
function beskjær(g: Genom, andel: number): { genom: Genom; fjernet: number } {
  const ut: Genom = JSON.parse(JSON.stringify(g)) as Genom;
  const kandidater = ut.koblinger
    .map((k, i) => ({ i, abs: Math.abs(k.vekt), aktiv: k.aktiv !== false, ut: k.ut }))
    .filter((k) => k.aktiv)
    .sort((a, b) => a.abs - b.abs);
  const mål = Math.floor((kandidater.length * andel) / 100);

  // Tell hvor mange aktive koblinger hver mottakernode har, så ingen node
  // (og dermed ingen utgang) står igjen uten inngang.
  const inn = new Map<number, number>();
  for (const k of kandidater) inn.set(k.ut, (inn.get(k.ut) ?? 0) + 1);

  let fjernet = 0;
  for (const k of kandidater) {
    if (fjernet >= mål) break;
    const n = inn.get(k.ut) ?? 0;
    if (n <= 1) continue; // siste kobling inn til noden – la den stå
    ut.koblinger[k.i]!.aktiv = false;
    inn.set(k.ut, n - 1);
    fjernet++;
  }
  return { genom: ut, fjernet };
}

const linjer: string[] = [];
for (const n of nivåer) {
  const { genom, fjernet } = beskjær(basis, n);
  const fil = `${utMappe}/beskjaert-${n}.json`;
  writeFileSync(fil, JSON.stringify(genom));
  const igjen = genom.koblinger.filter((k) => k.aktiv !== false).length;
  const linje = `${n} % → fjernet ${fjernet}, ${igjen} aktive igjen → ${fil}`;
  console.log(linje);
  linjer.push(linje);
}

writeFileSync(`${utMappe}/beskjaering.txt`, linjer.join("\n") + "\n");
console.log(
  `\nMål dem parret mot originalen:\n` +
    `  node examples/neat-evaluer.ts ${utMappe}/original.json ` +
    nivåer.map((n) => `${utMappe}/beskjaert-${n}.json`).join(" ") +
    ` nevro --froe 940000 --kamper 60`,
);
