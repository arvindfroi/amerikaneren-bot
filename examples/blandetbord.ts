/**
 * BLANDET BORD: to av hver, og hvem vinner hvor?
 *
 *   node examples/blandetbord.ts \
 *     --a "vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-gbt.json@-3.0:vakt:abmp:e1:e1-modell/d7alle.bin" \
 *     --b nevro --froe 300000000 --giver 3000 --skard 0/6 --ut analyse/bb-0.jsonl
 *
 * Arvind: «test et bord med 2 nevrohjerne og 2 adams, og mål hvordan de gjør
 * det i hver del av spillet. hvordan de spiller når de er på lag eller mot
 * hverandre.»
 *
 * ============================ HVORFOR TO OPPSETT ==========================
 *
 * Hver giv spilles TO ganger: A på sete {0,2} og B på {1,3}, så omvendt. Uten
 * det måler man seteflaks. Setene er ikke likeverdige i Amerikaneren – giveren
 * roterer, og den som melder først har en annen informasjonsmengde enn den som
 * melder sist. Med begge oppsett på samme giv kansellerer seteeffekten ved
 * konstruksjon, og det som står igjen er forskjellen på agentene.
 *
 * Parringen er derfor på GIV, og hvert giv-par gir ÉN observasjon:
 *
 *     d = ½[(snitt A-seter − snitt B-seter)_oppsett0
 *          + (snitt A-seter − snitt B-seter)_oppsett1]
 *
 * ========================== HVORFOR LAG ER DYNAMISKE ======================
 *
 * Amerikaneren har ikke faste makkerpar: budvinneren etterlyser et kort, og
 * den som har det blir makker. Et bord med to av hver gir derfor tre slags
 * lag – A+A, A+B og B+B – og hvilket som oppstår er UTFALL, ikke oppsett.
 * Derfor logges makkeren per runde i stedet for å antas.
 *
 * At A+B-lag i det hele tatt finnes er poenget med målingen: det er den eneste
 * måten å se om de to spiller SAMMEN dårligere enn de spiller hver for seg.
 *
 * ============================ HVA SOM LOGGES ==============================
 *
 * Én linje per (giv, oppsett) med alt som trengs for å dele opp i etterkant:
 * hvert setes type, delta og rolle, hvem som vant budrunden og på hvilket bud,
 * hvem som ble makker, og om kontrakten holdt. Ingen aggregering skjer her –
 * det ville låst spørsmålene til dem jeg tenkte på i dag.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { Budagent, lesBudmodell } from "../src/moe2/budagent.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { Vrakrangerer } from "../src/moe2/vrakrang.ts";
import { nettFraBytes } from "../src/nevro/nett.ts";
import { readFileSync } from "node:fs";

let givere = 2000;
let frøBase = 300_000_000;
let skardI = 0;
let skardN = 1;
let aSpek = "nevro";
let bSpek = "nevro";
let ut = "analyse/bb-0.jsonl";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--giver") givere = Number(process.argv[++i]);
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--a") aSpek = process.argv[++i]!;
  else if (a === "--b") bSpek = process.argv[++i]!;
  else if (a === "--ut") ut = process.argv[++i]!;
  else if (a === "--skard") {
    const [x, y] = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(x);
    skardN = Number(y);
  }
}

type Agent = { velgHandling(s: GameState): Handling; nyKamp(): void };

function lag(spek: string): Agent {
  if (spek === "nevro") return new NevroAgent();
  if (spek.startsWith("vakt:")) {
    const v = delVaktspek(spek);
    if (v === null) throw new Error(`Ugyldig vaktspek «${spek}»`);
    return new Konvensjonsvakt(lag(v.indre), v.valg);
  }
  if (spek.startsWith("vr:")) {
    const rest = spek.slice(3);
    const i = rest.indexOf(":");
    const j = rest.indexOf(":", i + 1);
    if (i < 0 || j < 0) throw new Error(`Ugyldig vr-spek «${spek}»`);
    const nett = nettFraBytes(new Uint8Array(readFileSync(rest.slice(0, i))))[0];
    if (nett === undefined) throw new Error(`Tomme vekter i «${rest.slice(0, i)}»`);
    return new Vrakrangerer(lag(rest.slice(j + 1)), nett, rest.slice(i + 1, j));
  }
  if (spek.startsWith("budm:")) {
    const rest = spek.slice(5);
    const skille = rest.indexOf(":");
    if (skille < 0) throw new Error(`Ugyldig budm-spek «${spek}»`);
    const hode = rest.slice(0, skille);
    const at = hode.lastIndexOf("@");
    const fil = at < 0 ? hode : hode.slice(0, at);
    const ev = at < 0 ? 2.5 : Number(hode.slice(at + 1));
    if (!Number.isFinite(ev)) throw new Error(`Ugyldig evForsvar i «${spek}»`);
    return new Budagent(lag(rest.slice(skille + 1)), lesBudmodell(fil), ev);
  }
  if (spek.startsWith("e1:")) return E1Agent.fraFil(spek.slice(3));
  throw new Error(`Ukjent spek «${spek}»`);
}

interface Runde {
  frø: number;
  /** 0: A på sete 0 og 2. 1: A på sete 1 og 3. */
  oppsett: number;
  /** Per sete: "A" eller "B". */
  type: string[];
  delta: number[];
  /** Per sete: «fører», «makker» eller «forsvar». */
  rolle: string[];
  budvinner: number;
  bud: number;
  makker: number | null;
  klart: boolean;
  lagStikk: number;
}

/** Spiller én giv med gitt seteoppsett. `null` om giva ikke ble fullført. */
function spill(frø: number, aSeter: readonly number[], agenter: Agent[]): Runde | null {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  for (const a of agenter) a.nyKamp();
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 800) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) return null;
    s = utfør(s, agenter[iTur]!.velgHandling(s)).state;
  }
  const r = s.sisteRunde;
  if (r === null || r === undefined || s.budvinner === null) return null;

  const makker = r.makker;
  const rolle = [0, 1, 2, 3].map((i) =>
    i === r.budvinner ? "fører" : i === makker ? "makker" : "forsvar",
  );
  return {
    frø,
    oppsett: aSeter[0] === 0 ? 0 : 1,
    type: [0, 1, 2, 3].map((i) => (aSeter.includes(i) ? "A" : "B")),
    delta: r.delta.slice(),
    rolle,
    budvinner: r.budvinner,
    bud: r.melding.bud,
    makker,
    klart: r.klart,
    lagStikk: r.lagStikk,
  };
}

mkdirSync(dirname(ut), { recursive: true });
let skrevet = 0;
let forkastet = 0;
for (let i = skardI; i < givere; i += skardN) {
  const frø = frøBase + i * 7717;
  const linjer: Runde[] = [];
  // BEGGE OPPSETT MÅ LYKKES, ellers forkastes giva. En halv observasjon ville
  // vært et usammenliknbart tall med seteeffekten fortsatt i seg.
  for (const aSeter of [
    [0, 2],
    [1, 3],
  ]) {
    const agenter = [0, 1, 2, 3].map((se) => lag(aSeter.includes(se) ? aSpek : bSpek));
    const r = spill(frø, aSeter, agenter);
    if (r === null) break;
    linjer.push(r);
  }
  if (linjer.length !== 2) {
    forkastet++;
    continue;
  }
  for (const l of linjer) appendFileSync(ut, JSON.stringify(l) + "\n");
  skrevet += 2;
  if (skrevet % 100 === 0) process.stdout.write(`  skard ${skardI}: ${skrevet} rader\r`);
}
console.log(`\nSkard ${skardI} ferdig: ${skrevet} rader (${forkastet} giver forkastet) -> ${ut}`);
