/**
 * HVA STYRER FAKTISK VALGENE? — permutasjonsablasjon per trekkblokk.
 *
 * ARVIND: «kan vi ikke overvåke valgene til bottene og se hva som slår ut og
 * påvirker valgene, også repeterer vi det på samme hender og skrur av hver
 * variabel en etter en slik at det kan kontrolleres for hverandre.»
 *
 * Metoden er riktig. To ting måtte gjøres annerledes enn «skru av»:
 *
 * ---------------------------------------------------------------------------
 * 1. NULLSTILLING ER IKKE ABLASJON I DENNE KODINGEN.
 *
 * Trekkene er indikatorer: `v[52..103] = 1` betyr «dette kortet er spilt».
 * Setter man blokken til null, sier man ikke «jeg vet ikke hvilke kort som er
 * spilt» — man sier «INGEN kort er spilt», som er en gyldig og svært
 * informativ stilling. Nettet ville da fått en LØGN, ikke et fravær, og
 * effekten vi målte hadde vært en blanding av tapt informasjon og innplantet
 * feilinformasjon.
 *
 * Derfor PERMUTASJON: blokken byttes med den samme blokken fra en TILFELDIG
 * ANNEN stilling i korpuset. Da beholdes marginalfordelingen nøyaktig — like
 * mange enere, samme skala — mens koblingen til NETTOPP denne stillingen er
 * brutt. Det er standard permutasjonsviktighet, og det er den eneste formen
 * som svarer på «hvor mye betyr denne blokken» uten å svare på «hva skjer hvis
 * jeg lyver».
 *
 * ---------------------------------------------------------------------------
 * 2. TVUNGNE VALG MÅ UT AV NEVNEREN.
 *
 * `velgKort` kortslutter når bare ett kort er lovlig. De beslutningene har
 * INGEN forklaringsverdi — nettet er ikke involvert. Tar man dem med, faller
 * hver eneste blokks tall mot null, og det ser ut som om ingenting betyr noe.
 *
 * Rapporten skiller derfor alltid FRIE valg fra tvungne, og forklaringskraften
 * regnes bare over de frie.
 *
 * ---------------------------------------------------------------------------
 * BEGRENSNINGEN SOM MÅ STÅ: det utrullede nettet leser 273 trekk. Blokkene
 * v2–v10 (minne, hvem-la-hva, telling, sanser) kan ikke ablateres bort, for de
 * er ikke der. Dette måler hva Adams FAKTISK bruker i dag.
 */

import { appendFileSync } from "node:fs";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeKort } from "../src/motor.ts";
import { forover, nettFraBytes } from "../src/nevro/nett.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { e1SpillTrekk } from "../src/e1/trekk.ts";
import { lagIndre, ADAMS, tall } from "../src/moe2/agentspek.ts";
import { readFileSync } from "node:fs";
import { lagRng } from "../src/kort.ts";

const arg = (n: string, s: string) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const GIVER = tall(arg("--giver", "300"), 300, "giver");
const FRØ = tall(arg("--froe", "900000"), 900000, "froe");
const NETTFIL = arg("--nett", "e1-modell/d7alle.bin");
const UT = arg("--ut", "analyse/ablasjon.jsonl");

const nett = nettFraBytes(new Uint8Array(readFileSync(NETTFIL)))[0]!;
const DIM = nett.lag[0]!.inn;

/**
 * BLOKKENE i v1-kodingen (`src/nevro/trekk.ts` + de 35 e1-trekkene).
 * Rekkefølgen er den koden faktisk bruker, ikke en gjengivelse fra minnet.
 */
const BLOKKER: { navn: string; fra: number; til: number }[] = [
  { navn: "egen hånd", fra: 0, til: 52 },
  { navn: "spilte kort (alle)", fra: 52, til: 104 },
  { navn: "kort på bordet nå", fra: 104, til: 156 },
  { navn: "etterlyst kort", fra: 156, til: 208 },
  { navn: "hvem er fører", fra: 208, til: 212 },
  { navn: "hvem leder stikket", fra: 212, til: 216 },
  { navn: "hvem er makker", fra: 216, til: 220 },
  { navn: "trumffarge", fra: 220, til: 225 },
  { navn: "kontrakten", fra: 225, til: 228 },
  { navn: "hvor langt i runden", fra: 228, til: 229 },
  { navn: "stikk hittil", fra: 229, til: 233 },
  { navn: "stikk per sete", fra: 233, til: 238 },
  { navn: "e1-tilleggene", fra: 238, til: Math.min(273, DIM) },
];

/** Alle beslutningsstillinger fra ekte spill, med trekkvektor og lovlige kort. */
interface Punkt {
  v: Float32Array;
  lovlige: number[];
  valg: number;
  fri: boolean;
  stikk: number;
}

const punkter: Punkt[] = [];
for (let g = 0; g < GIVER; g++) {
  const ag = [0, 1, 2, 3].map(() => lagIndre(ADAMS));
  let s: GameState = opprettSpill({ antallSpillere: 4 }, FRØ + g * 7717);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
    if (s.fase === "SPILL" && s.iTur !== null) {
      const sete = s.iTur;
      const lov = lovligeKort(s, sete).map(kortIndeks);
      const v = e1SpillTrekk(s, sete, DIM);
      const logits = forover(nett, v);
      let beste = lov[0]!;
      for (const k of lov) if (logits[k]! > logits[beste]!) beste = k;
      punkter.push({ v, lovlige: lov, valg: beste, fri: lov.length > 1, stikk: s.stikkSpilt });
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, ag[iTur]!.velgHandling(s)).state;
  }
}

const frie = punkter.filter((p) => p.fri);
const rng = lagRng(20260806);

/** Argmax over lovlige kort for en (eventuelt ablatert) vektor. */
function velg(v: Float32Array, lovlige: readonly number[]): number {
  const logits = forover(nett, v);
  let beste = lovlige[0]!;
  for (const k of lovlige) if (logits[k]! > logits[beste]!) beste = k;
  return beste;
}

console.log(`# ABLASJON av ${NETTFIL} (${DIM} trekk), ${GIVER} giver`);
console.log(`# ${punkter.length} beslutninger, ${frie.length} FRIE (${((100 * frie.length) / punkter.length).toFixed(1)} %)`);
console.log(`# ${punkter.length - frie.length} tvungne — nettet er ikke involvert i dem\n`);
console.log(`${"blokk".padEnd(22)} ${"trekk".padStart(6)} ${"endret".padStart(8)} ${"andel".padStart(8)}`);

const rader: Record<string, number> = {};
for (const b of BLOKKER) {
  if (b.fra >= DIM) continue;
  const til = Math.min(b.til, DIM);
  let endret = 0;
  for (const p of frie) {
    // Permutasjon: hent blokken fra en TILFELDIG ANNEN stilling.
    const annen = frie[Math.floor(rng() * frie.length)]!;
    const v2 = Float32Array.from(p.v);
    for (let i = b.fra; i < til; i++) v2[i] = annen.v[i]!;
    if (velg(v2, p.lovlige) !== p.valg) endret++;
  }
  const andel = endret / frie.length;
  rader[b.navn] = andel;
  console.log(
    `${b.navn.padEnd(22)} ${String(til - b.fra).padStart(6)} ${String(endret).padStart(8)} ${(100 * andel).toFixed(1).padStart(7)}%`,
  );
}

/**
 * KONTROLL: permuter ALT. Endres ikke valget da, måler vi ingenting og
 * rapporten er ugyldig — samme rolle som kontrollarmen i gate 2.
 */
let altEndret = 0;
for (const p of frie) {
  const annen = frie[Math.floor(rng() * frie.length)]!;
  if (velg(annen.v, p.lovlige) !== p.valg) altEndret++;
}
console.log(`\n${"ALT permutert (kontroll)".padEnd(22)} ${String(DIM).padStart(6)} ${String(altEndret).padStart(8)} ${((100 * altEndret) / frie.length).toFixed(1).padStart(7)}%`);

appendFileSync(UT, JSON.stringify({ nett: NETTFIL, dim: DIM, giver: GIVER, n: punkter.length, frie: frie.length, rader, alt: altEndret / frie.length }) + "\n");
