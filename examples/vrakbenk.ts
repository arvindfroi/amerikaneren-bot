/**
 * VRAKBENKEN: måler vrak- og trumfvalget PRESIST, ved å bare telle rundene der
 * det faktisk ble tatt.
 *
 *   node examples/vrakbenk.ts --kandidat vv2:24:6:nevro --miljo nevro \
 *     --froe 41000000 --giver 2000 --skard 0/4 --ut analyse/vb-0.jsonl
 *
 * HVORFOR GATE 2 ER FEIL VERKTØY HER. Vrak og trumf velges ÉN gang per runde,
 * og bare av budvinneren. I gate 2 er kandidatsetet budvinner i omtrent en
 * fjerdedel av radene — resten er runder der kandidaten aldri tok valget, og
 * de bidrar bare varians. Målt på `vv:`-forsøket ga det SE 0,104 på 3 600
 * rader, og +0,189 druknet.
 *
 * DENNE BENKEN GJØR TO TING ANNERLEDES:
 *
 *   1. BARE BUDVINNERRUNDER TELLES. En runde der kandidaten ikke vant budet
 *      forkastes — den inneholder null informasjon om beslutningen.
 *   2. PARRET PÅ GIV OG BUDVINNER. Samme giv spilles to ganger: én gang der
 *      budvinneren bruker kandidaten, én gang miljøet. Alt annet er
 *      identisk, og agentene er deterministiske, så differansen er EKSAKT
 *      for den giva — ikke et estimat.
 *
 * Resultatet er at hver rad bærer signal. Fire ganger så mange brukbare rader
 * per maskinminutt som gate 2 gir på samme spørsmål.
 *
 * MÅLTALLET er poengdifferansen for budvinnersetet mot snittet av de tre
 * andre — samme størrelse som gate 2 og som SD-orakelets `standardMål`, så
 * tallene er sammenlignbare på tvers.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { Budagent, lesBudmodell } from "../src/moe2/budagent.ts";
import { Vrakvelger } from "../src/moe2/vrakvelg.ts";
import { Vrakvelger2, lesVrakflagg } from "../src/moe2/vrakvelg2.ts";

let kandidatSpek: string[] = [];
let miljøSpek = "nevro";
let frøBase = 41_000_000;
let givere = 500;
let skardI = 0;
let skardN = 1;
let ut = "analyse/vrakbenk.jsonl";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--kandidat") kandidatSpek.push(process.argv[++i]!);
  else if (a === "--miljo") miljøSpek = process.argv[++i]!;
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--giver") givere = Number(process.argv[++i]);
  else if (a === "--skard") {
    const [x, y] = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(x);
    skardN = Number(y);
  } else if (a === "--ut") ut = process.argv[++i]!;
}
if (kandidatSpek.length === 0) throw new Error("minst én --kandidat");

type Agent = { velgHandling(s: GameState): Handling; nyKamp(): void };

function lag(spek: string): Agent {
  if (spek === "nevro") return new NevroAgent();
  if (spek.startsWith("vakt:")) {
    const v = delVaktspek(spek);
    if (v === null) throw new Error(`Ugyldig vaktspek «${spek}»`);
    return new Konvensjonsvakt(lag(v.indre), v.valg);
  }
  if (spek.startsWith("budm:")) {
    const rest = spek.slice(5);
    const i = rest.indexOf(":");
    return new Budagent(lag(rest.slice(i + 1)), lesBudmodell(rest.slice(0, i)));
  }
  if (spek.startsWith("vv2:")) {
    const d = spek.slice(4).split(":");
    const inn = lag(d.slice(3).join(":"));
    return new Vrakvelger2(inn, inn as never, {
      verdener: Number(d[0]),
      policy: lesVrakflagg(d[1] ?? "telrd"),
      sigma: Number(d[2] ?? 0),
    });
  }
  if (spek.startsWith("vv:")) {
    const d = spek.slice(3).split(":");
    const inn = lag(d.slice(1).join(":"));
    return new Vrakvelger(inn, inn as never, { verdener: Number(d[0]) });
  }
  if (spek.startsWith("e1:")) return E1Agent.fraFil(spek.slice(3));
  throw new Error(`Ukjent spek «${spek}»`);
}

/**
 * Spiller giva ferdig der `budvinnerAgent` sitter i budvinnersetet og `miljø` i
 * de tre andre. Returnerer differansen for budvinnersetet, eller null om
 * `ventetVinner` ikke ble budvinner (da er giva ubrukelig og forkastes).
 */
function spill(frø: number, budvinnerAgent: Agent, miljø: Agent[], ventetVinner: number | null): {
  vinner: number;
  diff: number;
} | null {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  budvinnerAgent.nyKamp();
  for (const m of miljø) m.nyKamp();
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 800) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) return null;
    // Budrunden spilles av MILJØET i alle seter, så budvinneren blir den samme
    // i begge armer. Ellers ville armene fått ulike kontrakter og differansen
    // målt budgivning i stedet for vraket.
    const bruker =
      s.fase !== "BUDRUNDE" && s.budvinner !== null && iTur === s.budvinner
        ? budvinnerAgent
        : miljø[iTur]!;
    s = utfør(s, bruker.velgHandling(s)).state;
  }
  if (s.budvinner === null || s.sisteRunde === null || s.sisteRunde === undefined) return null;
  if (ventetVinner !== null && s.budvinner !== ventetVinner) return null;
  const d = s.sisteRunde.delta;
  const v = s.budvinner;
  const egne = d[v] ?? 0;
  return { vinner: v, diff: egne - (d.reduce((a, b) => a + b, 0) - egne) / 3 };
}

mkdirSync(dirname(ut), { recursive: true });
const miljø = () => [0, 1, 2, 3].map(() => lag(miljøSpek));
const kandidater = kandidatSpek.map((s) => ({ spek: s, agent: lag(s) }));
const kontroll = lag(miljøSpek);

let skrevet = 0;
for (let i = skardI; i < givere; i += skardN) {
  const frø = frøBase + i * 7717;
  // KONTROLLARMEN FØRST: den fastsetter hvem som blir budvinner, og alle
  // kandidatene måles mot NØYAKTIG den giva og det setet.
  const basis = spill(frø, kontroll, miljø(), null);
  if (basis === null) continue;
  const rad: Record<string, number> = { giv: frø, vinner: basis.vinner, KONTROLL: basis.diff };
  let alleOk = true;
  for (const k of kandidater) {
    const r = spill(frø, k.agent, miljø(), basis.vinner);
    if (r === null) {
      alleOk = false;
      break;
    }
    rad[k.spek] = r.diff;
  }
  if (!alleOk) continue;
  appendFileSync(ut, JSON.stringify(rad) + "\n", "utf-8");
  skrevet++;
  if (skrevet % 50 === 0) process.stdout.write(`\r  skard ${skardI}: ${skrevet} givere   `);
}
console.log(`\nSkard ${skardI} ferdig: ${skrevet} BRUKBARE givere → ${ut}`);
