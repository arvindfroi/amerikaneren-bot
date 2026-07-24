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
 *  - FUNKSJONELL livssjekk: etter beskjæringen aktiveres nettet på ekte
 *    hender, og hvert hode må fortsatt VARIERE med hånden. Er et hode dødt,
 *    føres de sterkeste kuttede koblingene tilbake til det lever igjen.
 *    Dette erstatter et strukturelt vern som viste seg utilstrekkelig: å
 *    beskytte «siste kobling inn til noden» beskytter hodet, men ikke KJEDEN
 *    som mater det. Målt: 60 % beskjæring kuttet xT-hodene fra 51/31/34
 *    koblinger til 5/2/2, de skjulte nodene bak dem mistet sine innganger,
 *    og xT ga eksakt 0,0000 for enhver hånd – budet låst på 6 stikk for
 *    alltid. Et strukturelt vern kan ikke se det; bare aktivering kan.
 *  - Vi beskjærer flere NIVÅER og måler hvert enkelt parret mot originalen.
 *    Det er hele poenget: «færre koblinger er bedre» er en korrelasjon fra
 *    populasjonen, ikke et bevis for at akkurat DETTE genomet tåler kutt.
 *    Kurven over nivåer viser hvor det faktiske optimumet ligger.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { opprettSpill, spillerVisning } from "../src/index.ts";
import { genomFraJson, type Genom } from "../src/neat/index.ts";
import { Nettverk } from "../src/neat/nett.ts";
import { lagInn, UT_KORT, UT_MARGIN, UT_TRUMF, UT_XT, UT_XT_HØY, UT_XT_LAV } from "../src/neat/trekk.ts";

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

/**
 * Lever hodene? Aktiverer nettet på ekte hender og krever at hvert hode
 * varierer. Et hode som gir samme tall uansett hånd har ingen informasjon.
 */
function livssjekk(g: Genom): { navn: string; sd: number }[] {
  const nett = new Nettverk(g);
  const prøver: number[][] = [];
  for (let k = 0; k < 24; k++) {
    const s = opprettSpill({ antallSpillere: 4 }, 993_000 + k);
    prøver.push(nett.aktiver(lagInn(spillerVisning(s, s.iTur!), "BUD", 12, 100)).slice());
  }
  const sd = (u: number): number => {
    const v = prøver.map((p) => p[u]!);
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
  };
  return [
    { navn: "xT", sd: sd(UT_XT) },
    { navn: "xTlav", sd: sd(UT_XT_LAV) },
    { navn: "xThøy", sd: sd(UT_XT_HØY) },
    { navn: "margin", sd: sd(UT_MARGIN) },
    { navn: "trumf", sd: Math.max(...[0, 1, 2, 3].map((f) => sd(UT_TRUMF + f))) },
    { navn: "kort", sd: Math.max(...Array.from({ length: 52 }, (_, i) => sd(UT_KORT + i))) },
  ];
}

/** Fører kuttede koblinger tilbake (sterkeste først) til alle hoder lever. */
function gjenopplivt(original: Genom, beskåret: Genom): { genom: Genom; tilbake: number } {
  const g: Genom = JSON.parse(JSON.stringify(beskåret)) as Genom;
  // Kuttede koblinger, sterkeste først – de mest informative føres tilbake.
  const kuttet = g.koblinger
    .map((k, i) => ({ i, abs: Math.abs(k.vekt) }))
    .filter(({ i }) => g.koblinger[i]!.aktiv === false && original.koblinger[i]?.aktiv !== false)
    .sort((a, b) => b.abs - a.abs);
  let tilbake = 0;
  for (const { i } of kuttet) {
    const døde = livssjekk(g).filter((h) => h.sd < 1e-6);
    if (døde.length === 0) break;
    g.koblinger[i]!.aktiv = true;
    tilbake++;
  }
  return { genom: g, tilbake };
}

const linjer: string[] = [];
for (const n of nivåer) {
  const { genom: rå, fjernet: fjernet0 } = beskjær(basis, n);
  const { genom, tilbake } = gjenopplivt(basis, rå);
  const fjernet = fjernet0 - tilbake;
  const døde = livssjekk(genom).filter((h) => h.sd < 1e-6);
  if (døde.length > 0) console.log(`  ADVARSEL ${n} %: hoder fortsatt døde: ${døde.map((d) => d.navn).join(", ")}`);
  const fil = `${utMappe}/beskjaert-${n}.json`;
  writeFileSync(fil, JSON.stringify(genom));
  const igjen = genom.koblinger.filter((k) => k.aktiv !== false).length;
  const linje = `${n} % → fjernet ${fjernet} (${tilbake} gjenopplivet), ${igjen} aktive igjen → ${fil}`;
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
