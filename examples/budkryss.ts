/**
 * BUDKRYSSET: hva er MENNESKETS budplassering verdt, med kortspillet holdt fast?
 *
 *   node examples/budkryss.ts --skard 0/8
 *
 * ARVIND fant tallet som gjør dette til det eneste eksperimentet som trengs:
 *
 *   «summen av menneske og boten på melding + slakk er tilsynelatende det
 *    samme? så er ikke det et viktig tall?»
 *
 * Jo. `bud + slakk = lagstikk`, og det er 9,70 for menneskene, 9,70 for boten
 * og 9,74 for MesterAI. Alle tre tar altså LIKE MANGE STIKK. Hele forskjellen
 * mellom dem ligger i hvor de legger budet på den samme evnen:
 *
 *              melder   klarer   lagstikk   EV = 2N(2P−1)
 *   menneskene   8,95    83,2 %    9,70        +11,89
 *   vår bot      9,31    75,1 %    9,70         +9,35
 *   MesterAI     9,47    71,7 %    9,74         +8,20
 *
 * Men de tre tallene er målt i HVER SITT oppsett – menneskene mot nettsidens
 * boter, MesterAI mot vår kandidat, boten i selvspill. De kan derfor peke på
 * en forskjell uten å tallfeste den.
 *
 * DETTE EKSPERIMENTET TALLFESTER DEN. Samme giv, samme kort, samme spiller –
 * bare budet byttes:
 *
 *   A  boten byr som den vil, og spiller
 *   B  boten tvinges til MENNESKETS bud, og spiller
 *
 * B − A er verdien av menneskets budplassering ALENE. Kortspillet er identisk
 * i begge armene, så differansen kan ikke komme fra spilleføringen.
 *
 * HVORFOR AKKURAT DENNE FASEN, og ikke hele kryssdesignet Arvind skisserte:
 * menneskets KORTSPILL kan ikke settes inn – det er prøvd to ganger og feilet
 * begge (`menneske-mot-bot.ts`), fordi den loggede kortsekvensen blir ulovlig
 * så snart noe annet i runden endres. Vrak og trumfvalg KAN settes inn, og er
 * alt målt til null (−0,030 ± 0,051 og −0,007 ± 0,022 i `menneske-vrak.ts`).
 * Budet er dermed den eneste av de fire fasene som både kan isoleres og kan
 * bære noe.
 *
 * MÅLTALLET er poengdifferansen – egne poeng minus snittet av de tre andre –
 * så det teller like mye å holde motparten nede som å score selv.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { lovligeHandlinger, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";

const DATA = "analyse/menneskedata";
let skardI = 0;
let skardN = 1;
let kandidatSpek = "vakt:abmp:e1:e1-modell/d7alle.bin";
let ut = "analyse/budkryss-0.jsonl";
let rapport: string | null = null;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--kandidat") kandidatSpek = process.argv[++i]!;
  else if (a === "--ut") ut = process.argv[++i]!;
  else if (a === "--rapport") rapport = process.argv[++i]!;
  else if (a === "--skard") {
    const [x, y] = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(x);
    skardN = Number(y);
  }
}

interface Linje {
  frø: number;
  menneskebud: number;
  botbud: number;
  /** Arm → poengdifferanse for setet. */
  d: Record<string, number>;
  klart: Record<string, number>;
  kontrakt: Record<string, number>;
}

// --- Rapport ----------------------------------------------------------------
if (rapport !== null) {
  const R: Linje[] = [];
  for (const f of rapport.split(",")) {
    for (const l of readFileSync(f, "utf8").split("\n")) {
      if (l.trim() === "") continue;
      try {
        R.push(JSON.parse(l) as Linje);
      } catch {
        continue;
      }
    }
  }
  const sn = (v: readonly number[]): number => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0);
  const se = (v: readonly number[]): number => {
    if (v.length < 2) return NaN;
    const m = sn(v);
    let s = 0;
    for (const x of v) s += (x - m) * (x - m);
    return Math.sqrt(s / (v.length - 1) / v.length);
  };
  const d = R.map((r) => (r.d["MENNESKEBUD"] ?? NaN) - (r.d["BOTBUD"] ?? NaN)).filter(Number.isFinite);
  const lavere = R.filter((r) => r.menneskebud < r.botbud).length;
  const hoyere = R.filter((r) => r.menneskebud > r.botbud).length;
  const dLav = R.filter((r) => r.menneskebud < r.botbud)
    .map((r) => (r.d["MENNESKEBUD"] ?? NaN) - (r.d["BOTBUD"] ?? NaN))
    .filter(Number.isFinite);
  const linjer = [
    `\n=== Budkrysset: hva er menneskets budplassering verdt? ===`,
    `${R.length} runder. Kortspillet er ${kandidatSpek} i BEGGE armene.`,
    `Samme giv, samme kort, samme spiller – bare budet byttes.`,
    ``,
    `arm                 bud     kontrakt klart    poengdiff`,
    `---------------------------------------------------------`,
    `BOTENS eget bud     ${sn(R.map((r) => r.kontrakt["BOTBUD"] ?? 0)).toFixed(2)}      ` +
      `${(100 * sn(R.map((r) => r.klart["BOTBUD"] ?? 0))).toFixed(1)} %        ` +
      `${sn(R.map((r) => r.d["BOTBUD"] ?? 0)).toFixed(3)}`,
    `MENNESKETS bud      ${sn(R.map((r) => r.kontrakt["MENNESKEBUD"] ?? 0)).toFixed(2)}      ` +
      `${(100 * sn(R.map((r) => r.klart["MENNESKEBUD"] ?? 0))).toFixed(1)} %        ` +
      `${sn(R.map((r) => r.d["MENNESKEBUD"] ?? 0)).toFixed(3)}`,
    `---------------------------------------------------------`,
    ``,
    `DIFFERANSE (menneskets bud − botens), parret paa giv:`,
    `  ${sn(d) >= 0 ? "+" : ""}${sn(d).toFixed(3)} ± ${se(d).toFixed(3)}   (${(sn(d) / se(d)).toFixed(1)} SE), n=${d.length}`,
    ``,
    `Mennesket boed LAVERE enn boten i ${lavere} runder, HOEYERE i ${hoyere}.`,
    `  paa de LAVERE:  ${sn(dLav) >= 0 ? "+" : ""}${sn(dLav).toFixed(3)} ± ${se(dLav).toFixed(3)}  (n=${dLav.length})`,
    ``,
    `LESEVEILEDNING. Positivt = menneskets budplassering gir flere poeng enn`,
    `botens, paa noeyaktig samme giv og med IDENTISK kortspill. Da kan`,
    `differansen ikke komme fra spillefoeringen - den kommer fra hvor budet ble`,
    `lagt.`,
    ``,
    `FORBEHOLD. Boten tvinges her til menneskets bud og FAAR kontrakten. I en`,
    `ekte budrunde kunne et lavere bud blitt overbudt, og da er den lave`,
    `plasseringen ikke gratis. Tallet er derfor verdien av aa SITTE med`,
    `menneskets kontrakt, ikke av aa by som mennesket i en aapen budrunde.`,
  ];
  const tekst = linjer.join("\n");
  console.log(tekst);
  writeFileSync(rapport.split(",")[0]!.replace(/-\d+\.jsonl$/, ".txt"), tekst + "\n");
  process.exit(0);
}

// --- Innsamling -------------------------------------------------------------
mkdirSync(dirname(ut), { recursive: true });
const vakt = delVaktspek(kandidatSpek)!;
const nett = lesE1Nett(vakt.indre.slice(3));
const nevro = new NevroAgent();
const lagBot = (): { velgHandling(s: GameState): Handling; nyKamp(): void } =>
  new Konvensjonsvakt(new E1Agent(nett), vakt.valg);

const frøFor = new Map<string, number>();
for (const l of readFileSync(`${DATA}/partier.txt`, "utf8").trim().split("\n")) {
  const f = l.split("|");
  frøFor.set(f[0]!, Number(f[1]));
}
interface R { g: string; rn: number; bud: number }
const runder: R[] = [];
for (const fil of ["runder-1.txt", "runder-2.txt"]) {
  for (const l of readFileSync(`${DATA}/${fil}`, "utf8").trim().split("\n")) {
    const f = l.split("|");
    if (f[2] !== "0" || f[3] !== "tall") continue; // mennesket meldte selv
    runder.push({ g: f[0]!, rn: Number(f[1]), bud: Number(f[4]) });
  }
}

/** Spiller giva ut. `tving` = null lar boten by fritt. */
function spill(
  frø: number,
  tving: number | null,
): { diff: number; klart: number; kontrakt: number } | null {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  const seter = [0, 1, 2, 3].map(() => lagBot());
  for (const b of seter) b.nyKamp();
  let bydd = false;
  let g = 0;
  while (s.fase === "BUDRUNDE" && g++ < 40) {
    if (s.iTur === null) break;
    if (s.iTur === 0 && tving !== null) {
      const lov = lovligeHandlinger(s);
      const tall = lov.fase === "BUDRUNDE" ? lov.bud.filter((b): b is number => typeof b === "number") : [];
      if (!bydd && tall.includes(tving)) {
        bydd = true;
        s = utfør(s, { type: "BUD", spiller: 0, bud: tving }).state;
        continue;
      }
      s = utfør(s, { type: "BUD", spiller: 0, bud: "PASS" }).state;
      continue;
    }
    // De tre andre byr som nevro; setet vaart byr fritt naar `tving` er null.
    s = utfør(s, s.iTur === 0 ? seter[0]!.velgHandling(s) : nevro.velgHandling(s)).state;
  }
  // Bare runder der VAART sete endte med kontrakten er sammenlignbare - ellers
  // maaler vi noe annet enn budplasseringen.
  if (s.fase === "BUDRUNDE" || s.budvinner !== 0) return null;
  g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    s = utfør(s, seter[iTur]!.velgHandling(s)).state;
  }
  const p = s.totalPoeng;
  const egne = p[0] ?? 0;
  const st = s.stikkVunnet;
  const lag = (st[0] ?? 0) + (s.makker !== null ? (st[s.makker] ?? 0) : 0);
  const bud = s.melding?.type === "tall" ? s.melding.bud : 0;
  return {
    diff: Math.round((egne - (p.reduce((a, x) => a + x, 0) - egne) / 3) * 1000) / 1000,
    klart: bud > 0 && lag >= bud ? 1 : 0,
    kontrakt: bud,
  };
}

let n = 0;
for (let i = 0; i < runder.length; i++) {
  if (i % skardN !== skardI) continue;
  const r = runder[i]!;
  const base = frøFor.get(r.g);
  if (base === undefined) continue;
  const frø = (base + Math.imul(r.rn, 2654435761)) >>> 0;
  const a = spill(frø, null);
  const b = spill(frø, r.bud);
  if (a === null || b === null) continue;
  appendFileSync(
    ut,
    JSON.stringify({
      frø,
      menneskebud: r.bud,
      botbud: a.kontrakt,
      d: { BOTBUD: a.diff, MENNESKEBUD: b.diff },
      klart: { BOTBUD: a.klart, MENNESKEBUD: b.klart },
      kontrakt: { BOTBUD: a.kontrakt, MENNESKEBUD: b.kontrakt },
    } satisfies Linje) + "\n",
  );
  n++;
  process.stdout.write(`\r  skard ${skardI}: ${n} runder   `);
}
console.log(`\nSkard ${skardI} ferdig: ${n} runder → ${ut}`);
