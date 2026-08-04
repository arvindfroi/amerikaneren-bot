/**
 * ROLLEANGER: hvor langt fra PERFEKT spill er hver rolle?
 *
 *   node examples/rolleanger.ts --spek "<agentspek>" --giver 300 --skard 0/6 \
 *     --ut analyse/ra-0.jsonl
 *
 * Arvind: «forsvaret kan ikke hente inn alt for mye mener jeg... årsaken er
 * som regel en blanding av flaks (hvordan kortene er fordelt) når man klarer å
 * felle budet, eller at poengene man får underveis er så små når man er i
 * forsvar. det er vanskelig å måle. fordi man kan spille bra forsvar og ikke
 * ha en sjangs.»
 *
 * ========================= HVORFOR ANGER OG IKKE POENG ====================
 *
 * Nettopp fordi han har rett. Å måle forsvar ved å telle poeng blander to ting
 * som ikke hører sammen: om giva GA en sjanse, og om vi TOK den. En håpløs giv
 * spilt feilfritt gir samme poengsum som en håpløs giv spilt elendig.
 *
 * Anger skiller dem. For hvert kort et sete legger, løses stillingen
 * dobbeltdummy – alle fire hender synlige – både før og etter trekket:
 *
 *     anger = |budlagets sluttstikk etter valgt kort
 *              − budlagets sluttstikk etter BESTE lovlige kort|
 *
 * der «beste» er størst for budlaget og minst for forsvaret. En håpløs giv
 * spilt optimalt gir anger 0. Flaksen forsvinner ved konstruksjon, og det som
 * står igjen er ferdighet.
 *
 * ============================ HVA DET IKKE ER ============================
 *
 * DD-anger er ikke et tak på hva en REELL spiller kan oppnå. Fasiten ser alle
 * hender; boten ser sin egen. En del av angeren er derfor uunngåelig – den
 * skyldes at informasjonen ikke finnes, ikke at den ble brukt dårlig. Tallet
 * er en ØVRE grense for hva bedre spill kan hente, ikke et mål på sløsing.
 *
 * Det er likevel akkurat det vi trenger her: er den øvre grensen for forsvar
 * liten, har Arvind rett og linja er ikke verdt å forfølge. Er den stor, vet
 * vi at det finnes noe der før vi bruker en natt på å lete.
 *
 * ============================== ENHETEN ==================================
 *
 * STIKK, ikke poeng, fordi omregningen avhenger av kontrakten: et stikk til
 * eller fra budlaget flytter ±2N når det avgjør om kontrakten holder, og
 * ingenting når den er trygt i havn eller trygt tapt. Angeren logges i stikk
 * sammen med kontrakten, så omregningen kan gjøres i etterkant uten å låse
 * den her.
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { FARGER } from "../src/kort.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { Budagent, lesBudmodell } from "../src/moe2/budagent.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { Vrakrangerer } from "../src/moe2/vrakrang.ts";
import { nettFraBytes } from "../src/nevro/nett.ts";
import { kortTilInt, rotVerdier, type DDOppsett } from "../src/solver/dds.ts";

let givere = 200;
let frøBase = 400_000_000;
let skardI = 0;
let skardN = 1;
let spek = "nevro";
/** Første stikk som analyseres. DD fra stikk 0 er dyrest; se `--fratrikk`. */
let fraStikk = 0;
let ut = "analyse/ra-0.jsonl";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--giver") givere = Number(process.argv[++i]);
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--spek") spek = process.argv[++i]!;
  else if (a === "--fratrikk") fraStikk = Number(process.argv[++i]);
  else if (a === "--ut") ut = process.argv[++i]!;
  else if (a === "--skard") {
    const [x, y] = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(x);
    skardN = Number(y);
  }
}

type Agent = { velgHandling(s: GameState): Handling; nyKamp(): void };

function lag(s: string): Agent {
  if (s === "nevro") return new NevroAgent();
  if (s.startsWith("vakt:")) {
    const v = delVaktspek(s);
    if (v === null) throw new Error(`Ugyldig vaktspek «${s}»`);
    return new Konvensjonsvakt(lag(v.indre), v.valg);
  }
  if (s.startsWith("vr:")) {
    const r = s.slice(3);
    const i = r.indexOf(":");
    const j = r.indexOf(":", i + 1);
    if (i < 0 || j < 0) throw new Error(`Ugyldig vr-spek «${s}»`);
    const nett = nettFraBytes(new Uint8Array(readFileSync(r.slice(0, i))))[0];
    if (nett === undefined) throw new Error(`Tomme vekter i «${r.slice(0, i)}»`);
    return new Vrakrangerer(lag(r.slice(j + 1)), nett, r.slice(i + 1, j));
  }
  if (s.startsWith("budm:")) {
    const r = s.slice(5);
    const k = r.indexOf(":");
    if (k < 0) throw new Error(`Ugyldig budm-spek «${s}»`);
    const hode = r.slice(0, k);
    const at = hode.lastIndexOf("@");
    const fil = at < 0 ? hode : hode.slice(0, at);
    const ev = at < 0 ? 2.5 : Number(hode.slice(at + 1));
    if (!Number.isFinite(ev)) throw new Error(`Ugyldig evForsvar i «${s}»`);
    return new Budagent(lag(r.slice(k + 1)), lesBudmodell(fil), ev);
  }
  if (s.startsWith("e1:")) return E1Agent.fraFil(s.slice(3));
  throw new Error(`Ukjent spek «${s}»`);
}

interface Valg {
  stikk: number;
  sete: number;
  rolle: string;
  /** Budlagets sluttstikk etter kortet som FAKTISK ble spilt. */
  valgt: number;
  /** Budlagets sluttstikk etter det beste lovlige kortet for setet. */
  beste: number;
  /** Antall lovlige kort. Er det ett, er angeren null per konstruksjon. */
  lovlige: number;
}

/** DD-oppsett for stillingen NÅ, med alle fire hender synlige. */
function ddNå(s: GameState): DDOppsett | null {
  if (s.budvinner === null || s.trumf === null || s.iTur === null) return null;
  const declLag = new Array<boolean>(s.antallSpillere).fill(false);
  declLag[s.budvinner] = true;
  if (s.makker !== null && s.makker !== undefined) declLag[s.makker] = true;
  const bord = (s.bord ?? []).map((b: { spiller: number; kort: { farge: string; verdi: number } }) => ({
    spiller: b.spiller,
    kort: kortTilInt(b.kort as never),
  }));
  let declStikk = 0;
  for (let p = 0; p < s.antallSpillere; p++) if (declLag[p]) declStikk += s.stikkVunnet[p] ?? 0;
  return {
    N: s.antallSpillere,
    trump: FARGER.indexOf(s.trumf),
    declLag,
    hender: s.hender.map((h) => h.map(kortTilInt)),
    iTur: s.iTur,
    bord,
    declStikkFør: declStikk,
    ferdigeStikk: s.stikkSpilt ?? 0,
    totalStikk: s.giving.antallStikk,
  };
}

function spillGiv(frø: number, agenter: Agent[]): { valg: Valg[]; bud: number; klart: boolean } | null {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  for (const a of agenter) a.nyKamp();
  const valg: Valg[] = [];
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 800) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) return null;
    const h = agenter[iTur]!.velgHandling(s);

    if (s.fase === "SPILL" && h.type === "SPILL" && (s.stikkSpilt ?? 0) >= fraStikk) {
      const o = ddNå(s);
      if (o !== null) {
        const verdier = rotVerdier(o);
        if (verdier.length > 0) {
          const påBudlag = o.declLag[iTur] === true;
          const mål = kortTilInt(h.kort as never);
          const valgtV = verdier.find((v) => v.kort === mål)?.lagStikk;
          if (valgtV !== undefined) {
            const alle = verdier.map((v) => v.lagStikk);
            // Budlaget vil ha FLEST stikk, forsvaret FÆRREST. Angeren er
            // alltid ikke-negativ: den måler avstanden til egen beste.
            const beste = påBudlag ? Math.max(...alle) : Math.min(...alle);
            valg.push({
              stikk: s.stikkSpilt ?? 0,
              sete: iTur,
              rolle:
                iTur === s.budvinner ? "fører" : iTur === s.makker ? "makker" : "forsvar",
              valgt: valgtV,
              beste,
              lovlige: verdier.length,
            });
          }
        }
      }
    }
    s = utfør(s, h).state;
  }
  const r = s.sisteRunde;
  if (r === null || r === undefined) return null;
  return { valg, bud: r.melding.bud, klart: r.klart };
}

mkdirSync(dirname(ut), { recursive: true });
const agenter = [0, 1, 2, 3].map(() => lag(spek));
let skrevet = 0;
const t0 = Date.now();
for (let i = skardI; i < givere; i += skardN) {
  const r = spillGiv(frøBase + i * 7717, agenter);
  if (r === null) continue;
  appendFileSync(ut, JSON.stringify({ frø: frøBase + i * 7717, ...r }) + "\n");
  skrevet++;
  if (skrevet % 10 === 0) {
    const s = (Date.now() - t0) / 1000;
    process.stdout.write(`  skard ${skardI}: ${skrevet} giver, ${(s / skrevet).toFixed(2)} s/giv\r`);
  }
}
console.log(`\nSkard ${skardI} ferdig: ${skrevet} giver -> ${ut}`);
