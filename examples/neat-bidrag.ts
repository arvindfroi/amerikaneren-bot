/**
 * Bidragsbeskjæring: fjern det som MÅLT ikke gjør noe – ikke det som har
 * liten vekt.
 *
 *   node examples/neat-bidrag.ts trening-d5/gull.json ut-mappe [--nivaaer 20,40,60]
 *
 * Magnitude pruning (|vekt| minst først) er en GJETNING om hva som ikke
 * virker, og den gjetningen slo feil: den kuttet xT-hodene fra 51/31/34
 * koblinger til 5/2/2 og gjorde budet konstant 6 for alltid. En liten vekt
 * inn i en kritisk sti kan bety alt; en stor vekt fra en død node betyr
 * ingenting. Vekten sier ikke hva koblingen GJØR.
 *
 * Her måles det i stedet, per kobling: slå den av, kjør nettet på ekte
 * hender i alle fire beslutningstypene, og se hvor mye utgangene faktisk
 * flytter seg. Koblinger som ikke flytter noe er ekte døde – de kan fjernes
 * uten at nettet merker det. Det er saliency-beskjæring, og det er det
 * eneste som svarer på spørsmålet «virker denne?».
 *
 * Bidraget måles på UTGANGENE som styrer spill (kort, trumf, xT, margin),
 * ikke på skjulte noder: en kobling kan flytte en skjult node mye uten at
 * det når fram til en eneste beslutning, og da er den like verdiløs.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { opprettSpill, spillerVisning, utfør, type GameState } from "../src/index.ts";
import { genomFraJson, NeatAgent, type Genom } from "../src/neat/index.ts";
import { Nettverk } from "../src/neat/nett.ts";
import {
  lagInn,
  UT_KORT,
  UT_MARGIN,
  UT_TRUMF,
  UT_XT,
  UT_XT_HØY,
  UT_XT_LAV,
  type Beslutning,
} from "../src/neat/trekk.ts";

const genomFil = process.argv[2] ?? "trening-d5/gull.json";
const utMappe = process.argv[3] ?? "bidrag";
const nivåer = (process.argv.includes("--nivaaer")
  ? process.argv[process.argv.indexOf("--nivaaer") + 1]!
  : "20,40,60"
)
  .split(",")
  .map(Number);
const antallPrøver = Number(
  process.argv.includes("--proever") ? process.argv[process.argv.indexOf("--proever") + 1] : 40,
);

const rå = JSON.parse(readFileSync(genomFil, "utf8")) as { genom?: unknown };
const basis: Genom = genomFraJson(
  rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(genomFil, "utf8"),
);
mkdirSync(utMappe, { recursive: true });
writeFileSync(`${utMappe}/original.json`, JSON.stringify(basis));

// --- Prøvesett: ekte stillinger fra alle fire beslutningstypene -------------
// En kobling kan være død i budrunden og avgjørende i stikkspillet. Måler vi
// bare på én fase, beskjærer vi bort det som betyr noe i de andre.
const prøver: number[][] = [];
{
  const agent = new NeatAgent(basis, { læringsrate: 0 });
  const perFase = new Map<Beslutning, number>();
  for (let k = 0; k < 200 && prøver.length < antallPrøver * 4; k++) {
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 994_000 + k);
    let guard = 0;
    while (s.fase !== "FERDIG" && guard++ < 500) {
      if (s.fase === "RUNDE_SLUTT") {
        if (s.rundeNr + 1 >= 6) break;
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      const fase = s.fase as Beslutning extends string ? Beslutning : never;
      const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
      const b: Beslutning =
        s.fase === "BUDRUNDE" ? "BUD" : s.fase === "VRAK" ? "VRAK" : s.fase === "VELG" ? "VELG" : "SPILL";
      void fase;
      if ((perFase.get(b) ?? 0) < antallPrøver) {
        prøver.push(lagInn(spillerVisning(s, sete), b, s.giving.antallStikk, s.regler.målPoeng));
        perFase.set(b, (perFase.get(b) ?? 0) + 1);
      }
      s = utfør(s, agent.velgHandling(s)).state;
    }
  }
  console.log(`Prøvesett: ${prøver.length} stillinger (${[...perFase].map(([b, n]) => `${b} ${n}`).join(", ")})`);
}

/** Utgangene som faktisk styrer spill – bidrag måles her, ikke i skjulte noder. */
const BESLUTTENDE = [
  UT_XT,
  UT_XT_LAV,
  UT_XT_HØY,
  UT_MARGIN,
  ...[0, 1, 2, 3].map((f) => UT_TRUMF + f),
  ...Array.from({ length: 52 }, (_, i) => UT_KORT + i),
];

function utganger(g: Genom): number[][] {
  const n = new Nettverk(g);
  return prøver.map((p) => {
    const ut = n.aktiver(p);
    return BESLUTTENDE.map((u) => ut[u]!);
  });
}

// --- Mål bidraget per kobling -----------------------------------------------
const basisUt = utganger(basis);
const aktive = basis.koblinger.map((k, i) => ({ k, i })).filter(({ k }) => k.aktiv !== false);
console.log(`Måler bidrag for ${aktive.length} aktive koblinger × ${prøver.length} stillinger …`);

const bidrag: { i: number; verdi: number }[] = [];
const t0 = performance.now();
for (let n = 0; n < aktive.length; n++) {
  const { i } = aktive[n]!;
  const prøve: Genom = { ...basis, koblinger: basis.koblinger.map((k, j) => (j === i ? { ...k, aktiv: false } : k)) };
  const ut = utganger(prøve);
  let sum = 0;
  for (let p = 0; p < ut.length; p++) {
    for (let u = 0; u < BESLUTTENDE.length; u++) sum += Math.abs(ut[p]![u]! - basisUt[p]![u]!);
  }
  bidrag.push({ i, verdi: sum / (ut.length * BESLUTTENDE.length) });
  if ((n + 1) % 250 === 0) {
    const brukt = (performance.now() - t0) / 1000;
    console.log(`  ${n + 1}/${aktive.length} (${brukt.toFixed(0)}s, ~${((brukt / (n + 1)) * (aktive.length - n - 1)).toFixed(0)}s igjen)`);
  }
}

bidrag.sort((a, b) => a.verdi - b.verdi);
const helt_døde = bidrag.filter((b) => b.verdi < 1e-9).length;
console.log(
  `\nBidrag: ${helt_døde} koblinger flytter INGENTING (${((100 * helt_døde) / bidrag.length).toFixed(0)} %). ` +
    `Median ${bidrag[bidrag.length >> 1]!.verdi.toExponential(2)}, maks ${bidrag[bidrag.length - 1]!.verdi.toExponential(2)}.`,
);

// Korrelasjon mellom |vekt| og faktisk bidrag – viser hvor dårlig magnitude
// pruning egentlig gjetter.
{
  const x = bidrag.map((b) => Math.abs(basis.koblinger[b.i]!.vekt));
  const y = bidrag.map((b) => b.verdi);
  const mx = x.reduce((a, b) => a + b, 0) / x.length;
  const my = y.reduce((a, b) => a + b, 0) / y.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my);
    sxx += (x[i]! - mx) ** 2;
    syy += (y[i]! - my) ** 2;
  }
  console.log(`Korrelasjon |vekt| ↔ faktisk bidrag: r = ${(sxy / Math.sqrt(sxx * syy)).toFixed(3)}`);
}

const linjer: string[] = [];
for (const nivå of nivåer) {
  const antall = Math.floor((bidrag.length * nivå) / 100);
  const fjern = new Set(bidrag.slice(0, antall).map((b) => b.i));
  const g: Genom = {
    ...basis,
    koblinger: basis.koblinger.map((k, j) => (fjern.has(j) ? { ...k, aktiv: false } : { ...k })),
  };
  const fil = `${utMappe}/bidrag-${nivå}.json`;
  writeFileSync(fil, JSON.stringify(g));
  const linje = `${nivå} % → fjernet ${antall} (bidrag ≤ ${bidrag[antall - 1]?.verdi.toExponential(2) ?? "-"}), ${g.koblinger.filter((k) => k.aktiv !== false).length} igjen → ${fil}`;
  console.log(linje);
  linjer.push(linje);
}
writeFileSync(`${utMappe}/bidrag.txt`, linjer.join("\n") + "\n");
