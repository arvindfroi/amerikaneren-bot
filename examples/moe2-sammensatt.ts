/**
 * KOMPONERER DE MÅLTE KOMPONENTENE TIL ÉN AGENT – og måler den mot nevro.
 *
 *   node examples/moe2-sammensatt.ts --givere 300
 *
 * Fire beslutninger er målt hver for seg i dag, alle med resten holdt på
 * NevroHjerne. Hver av dem har en variant som slår nevros egen:
 *
 *   bud     SD-orakelet, rund NED           +3,89 poeng/runde
 *   trumf   lengste farge, høyest etterlys  +0,30 (5,88 mot nevros 5,58)
 *   vrak    ingen målt vinner – nevro står  (SD-vraket er umålt, n=6)
 *   spill   SD-evaluering, 12+ verdener     +0,22 til +0,78
 *
 * SPØRSMÅLET SOM IKKE ER STILT: komponerer de? Hver måling forutsatte at ALT
 * ANNET var nevro. Settes flere sammen samtidig, endres forutsetningene for
 * hver enkelt – budet påvirker hvilke kontrakter man havner i, som påvirker
 * hvilke kortvalg som oppstår.
 *
 * Det er ingen grunn til å anta at gevinstene legger seg sammen, og en god
 * grunn til å tro de ikke gjør det: et høyere bud gir vanskeligere kontrakter,
 * og verdien av godt kortspill måles da i en annen fordeling av stillinger
 * enn den den ble målt i.
 *
 * Derfor måles hver kombinasjon, ikke bare den fulle.
 */

import { writeFileSync } from "node:fs";

import {
  lovligeEtterlys,
  lovligeHandlinger,
  opprettSpill,
  utfør,
  type Bud,
  type Farge,
  type GameState,
  type Handling,
} from "../src/index.ts";
import { FARGER } from "../src/kort.ts";
import { lagRng } from "../src/kort.ts";
import { analyserGiv, sdBud, tømCache } from "../src/neat/singledummy.ts";
import { besteKortSD } from "../src/moe2/sdkort.ts";
import { NevroAgent } from "../src/nevro/index.ts";

let givere = 300;
let verdener = 12;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--givere") givere = Number(process.argv[++i]);
  else if (a === "--verdener") verdener = Number(process.argv[++i]);
}

const nevro = new NevroAgent();
const rng = lagRng(56789);

interface Oppsett {
  readonly navn: string;
  readonly bud: boolean;
  readonly trumf: boolean;
  readonly spill: boolean;
}
const oppsett: Oppsett[] = [
  { navn: "nevro (baseline)", bud: false, trumf: false, spill: false },
  { navn: "bud", bud: true, trumf: false, spill: false },
  { navn: "trumf", bud: false, trumf: true, spill: false },
  { navn: "spill", bud: false, trumf: false, spill: true },
  { navn: "bud+trumf", bud: true, trumf: true, spill: false },
  { navn: "bud+spill", bud: true, trumf: false, spill: true },
  { navn: "trumf+spill", bud: false, trumf: true, spill: true },
  { navn: "alle tre", bud: true, trumf: true, spill: true },
];

/** Lengste farge på hånden; ved likhet den med høyest sum. */
function lengsteFarge(s: GameState, sete: number): Farge {
  const hånd = s.hender[sete] ?? [];
  let beste: Farge = "S";
  let bestN = -1;
  let bestSum = -1;
  for (const f of FARGER) {
    const kort = hånd.filter((k) => k.farge === f);
    const sum = kort.reduce((a, k) => a + k.verdi, 0);
    if (kort.length > bestN || (kort.length === bestN && sum > bestSum)) {
      beste = f;
      bestN = kort.length;
      bestSum = sum;
    }
  }
  return beste;
}

function énRunde(o: Oppsett, sete: number, frø: number): number {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  // SD-budet trengs bare naar budpolicyen er paa - analysen koster 10 ms.
  const sd = o.bud ? sdBud(analyserGiv(s, nevro), sete, s.giving.antallStikk) : 0;
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
    let h: Handling | null = null;
    if (iTur === sete) {
      if (o.bud && s.fase === "BUDRUNDE") {
        const lov = lovligeHandlinger(s);
        let valgt: Bud = "PASS";
        if (lov.fase === "BUDRUNDE") {
          // RUND NED: maalt verdt +1,73 til +4,29 poeng mot aa runde til
          // naermeste, fordi overbud koster 14,75 per stikk og underbud 1,51.
          for (const b of lov.bud) {
            if (typeof b === "number" && b <= sd && (valgt === "PASS" || b > valgt)) valgt = b;
          }
        }
        h = { type: "BUD", spiller: sete, bud: valgt };
      } else if (o.trumf && s.fase === "VELG") {
        const lov = lovligeHandlinger(s);
        if (lov.fase === "VELG") {
          const trumf = lengsteFarge(s, sete);
          // Hoeyeste lovlige etterlysning. DD kaller paa valoer 4,3 fordi den
          // SER hvem som har toeren; uten den informasjonen er lavt kall et
          // sjansespill. Maalt: hoeyest er verdt et helt poeng.
          // Etterlysningen ligger ALLTID i trumffargen - lovligeEtterlys tar
          // trumfen som argument og returnerer bare kort i den fargen.
          const lovlige = lovligeEtterlys(s, trumf);
          let etterlyst: (typeof lovlige)[number] | null = null;
          for (const k of lovlige) {
            if (etterlyst === null || k.verdi > etterlyst.verdi) etterlyst = k;
          }
          h = { type: "VELG", spiller: sete, trumf, etterlyst };
        }
      } else if (o.spill && s.fase === "SPILL") {
        const kort = besteKortSD(s, sete, nevro, { verdener, rng });
        if (kort !== null) h = { type: "SPILL", spiller: sete, kort };
      }
    }
    s = utfør(s, h ?? nevro.velgHandling(s)).state;
  }
  const egne = s.totalPoeng[sete] ?? 0;
  return egne - (s.totalPoeng.reduce((a, b) => a + b, 0) - egne) / 3;
}

const rader: { navn: string; poeng: number; se: number; n: number }[] = [];
for (const o of oppsett) {
  const p: number[] = [];
  for (let f = 0; f < givere; f++) {
    for (let sete = 0; sete < 4; sete++) p.push(énRunde(o, sete, 9_000_000 + f));
  }
  const snitt = p.reduce((a, b) => a + b, 0) / p.length;
  let sq = 0;
  for (const x of p) sq += (x - snitt) * (x - snitt);
  rader.push({ navn: o.navn, poeng: snitt, se: Math.sqrt(sq / (p.length - 1) / p.length), n: p.length });
  process.stdout.write(`\r  ${rader.length}/${oppsett.length} maalt   `);
  tømCache();
}
console.log();

const base = rader[0]!.poeng;
console.log(`\n=== Sammensatt agent mot NevroHjerne, ${givere} givere x 4 seter ===`);
console.log(`Alt som ikke er slaatt paa, spilles av nevro. Vrak er alltid nevro.\n`);
console.log("oppsett".padEnd(20) + "poeng/runde".padStart(13) + "SE".padStart(8) + "mot nevro".padStart(12));
console.log("-".repeat(53));
for (const r of [...rader].sort((a, b) => b.poeng - a.poeng)) {
  const d = r.poeng - base;
  console.log(
    r.navn.padEnd(20) + r.poeng.toFixed(2).padStart(13) + r.se.toFixed(2).padStart(8) +
      `${d >= 0 ? "+" : ""}${d.toFixed(2)}`.padStart(12),
  );
}

// KOMPONERER DE? Summen av enkeltgevinstene mot den faktiske trippelen.
const g = (navn: string): number => rader.find((r) => r.navn === navn)!.poeng - base;
const sum = g("bud") + g("trumf") + g("spill");
const faktisk = g("alle tre");
console.log(`\nSum av enkeltgevinstene   ${sum >= 0 ? "+" : ""}${sum.toFixed(2)}`);
console.log(`Faktisk for «alle tre»    ${faktisk >= 0 ? "+" : ""}${faktisk.toFixed(2)}`);
console.log(
  `Komposisjonstap           ${(faktisk - sum).toFixed(2)}` +
    `  ${faktisk < sum * 0.7 ? "<- gevinstene legger seg IKKE sammen" : ""}`,
);

writeFileSync("analyse/moe2-sammensatt.json", JSON.stringify({ givere, verdener, rader }, null, 2));
