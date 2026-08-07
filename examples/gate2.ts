/**
 * GATE 2: er en ny vekt bedre enn den som staar ute – VED VAART EGET BORD?
 *
 *   node examples/gate2.ts \
 *     --kandidat vakt:abmp:e1:e1-modell/ablasjon-v1.bin \
 *     --kandidat vakt:abmp:e1:e1-modell/ablasjon-v2.bin \
 *     --miljo vakt:abmp:e1:e1-modell/sd-r2.bin \
 *     --froe 900000 --giver 400 --skard 0/8 --ut analyse/gate2-0.jsonl
 *
 * ================= HVORFOR IKKE `neat-evaluer.ts` =========================
 *
 * neat-evaluer setter kandidaten i ETT sete og `grådig` i de tre andre. Det
 * gir et tall, men ikke det tallet vi trenger, av to grunner:
 *
 *   MILJOET ER FEIL. Arvind: «du må jo bruke de beste bottene vi har.» Vi
 *   skal spille mot MesterAI og mot familien, ikke mot en grådig agent. En
 *   forskjell maalt ved et svakt bord har ingen garanti for aa overleve ved
 *   et sterkt – linjer som straffes haardt av gode motstandere ser billige ut
 *   naar ingen straffer dem.
 *
 *   OG DET ER SKJEVT MOT KANDIDATEN. Nettene her trenes med
 *   `--motpart vakt:abmp`, altsaa med vaar egen beste bot i rolloutene. Et
 *   grådig bord er utenfor den fordelingen de er trent for, men ikke
 *   noedvendigvis utenfor fordelingen den GAMLE vekten ble trent for. Da
 *   maaler man hvem som passer testmiljoet, ikke hvem som spiller best.
 *
 * Derfor: alle fire seter er `vakt:abmp`, og BARE vektene skiller kandidaten
 * fra de tre andre. Samme forsoeksdesign som `budagent-benk.ts`.
 *
 * ============================ MAALTALLET ==================================
 *
 * Poengdifferanse per runde for kandidatsetet mot snittet av de tre andre.
 * Referansen er noedvendig: uten den summerer poengene til null over setene,
 * og enhver effekt forsvinner per konstruksjon.
 *
 * KONTROLLARMEN er miljoet mot seg selv i samme sete. Den skal maale 0 innen
 * stoeyen. Gjoer den ikke det, er det seteskjevhet i oppsettet og ingen av de
 * andre tallene kan leses.
 *
 * Parret paa (giv, sete), tegntest ved siden av snittet fordi poengene har
 * +/-50 og +/-100 i halene.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";

let giver = 400;
let frøBase = 900_000;
let skardI = 0;
let skardN = 1;
const kandidater: string[] = [];
let miljøSpek = "vakt:abmp:e1:e1-modell/sd-r2.bin";
let ut = "analyse/gate2-0.jsonl";
let rapport: string | null = null;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--giver") giver = Number(process.argv[++i]);
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--kandidat") kandidater.push(process.argv[++i]!);
  else if (a === "--miljo") miljøSpek = process.argv[++i]!;
  else if (a === "--ut") ut = process.argv[++i]!;
  else if (a === "--rapport") rapport = process.argv[++i]!;
  else if (a === "--skard") {
    const [x, y] = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(x);
    skardN = Number(y);
  }
}

interface Linje {
  giv: number;
  sete: number;
  /**
   * MILJOESPEKKEN raden ble maalt mot.
   *
   * Den staar i HVER rad, ikke i et filhode, fordi rapporten settes sammen av
   * shard-filer og en rad skal kunne leses alene. Uten den skrev rapporten
   * `miljoeSpek` fra argv - som i rapportmodus er STANDARDVERDIEN, siden
   * `--miljo` ikke gis da. En rapport som navngir feil miljoe er samme
   * feilklasse som har bitt oss ti ganger: det maalte og det skrevne var ikke
   * samme ting.
   */
  m?: string;
  /** armnavn → poengdifferanse for setet. */
  d: Record<string, number>;
  /**
   * armnavn → rollen setet fikk i DEN armen: «foerer», «makker» eller
   * «forsvar».
   *
   * ROLLEN KAN VARIERE MELLOM ARMENE, og det er hele grunnen til at den
   * lagres per arm og ikke per rad. Endrer en arm budgivningen, vinner den
   * budrunden oftere og havner i en annen rolle - og da maaler en
   * rolledekomponering delvis hvem som bydde, ikke hvem som spilte best.
   *
   * Fasegapet mot MesterAI viser at spillefoeringen er JEVN (+8,45 mot +8,45
   * poeng per kontrakt) mens hullene er makker (-86) og forsvar (-110).
   * Uten denne kolonnen kan gate 2 ikke si hvilken av de tre en ny vekt
   * flytter, og det er noeyaktig spoersmaalet Arvind stilte: «hvordan er den
   * bedre da?»
   */
  r: Record<string, string>;
}

const sn = (v: readonly number[]): number => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const se = (v: readonly number[]): number => {
  if (v.length < 2) return NaN;
  const m = sn(v);
  let s = 0;
  for (const x of v) s += (x - m) * (x - m);
  return Math.sqrt(s / (v.length - 1) / v.length);
};
function tegntest(k: number, n: number): number {
  if (n === 0) return NaN;
  const lf: number[] = [0];
  for (let i = 1; i <= n; i++) lf[i] = lf[i - 1]! + Math.log(i);
  const m = Math.min(k, n - k);
  let s = 0;
  for (let i = 0; i <= m; i++) s += Math.exp(lf[n]! - lf[i]! - lf[n - i]! - n * Math.LN2);
  return Math.min(1, 2 * s);
}

if (rapport !== null) {
  const R: Linje[] = [];
  const kat = dirname(rapport);
  const møn = basename(rapport).replace(/\*/g, ".*");
  const re = new RegExp("^" + møn + "$");
  for (const f of readdirSync(kat).filter((x) => re.test(x))) {
    for (const l of readFileSync(join(kat, f), "utf8").split("\n")) {
      if (l.trim() === "") continue;
      try {
        const rad = JSON.parse(l) as Linje;
        // TOLERER DEN NOESTEDE FORMEN fra 2026-08-03. En tekstsubstitusjon
        // traff ikke skriveren, saa `d` fikk hele {diff, rolle}-objektet i
        // stedet for tallet - og rapporten ga NaN uten aa feile. Dataene er
        // komplette, bare pakket feil, saa de pakkes ut her i stedet for aa
        // kastes. Nye kjoeringer skriver flat form.
        const foerste = Object.values(rad.d ?? {})[0] as unknown;
        if (foerste !== null && typeof foerste === "object" && "diff" in (foerste as object)) {
          const flat: Record<string, number> = {};
          const roller: Record<string, string> = {};
          for (const [k, v] of Object.entries(rad.d as unknown as Record<string, { diff: number; rolle: string }>)) {
            flat[k] = v.diff;
            roller[k] = v.rolle;
          }
          rad.d = flat;
          rad.r = roller;
        }
        R.push(rad);
      } catch {
        continue;
      }
    }
  }
  const armer = [...new Set(R.flatMap((r) => Object.keys(r.d)))];
  /**
   * MILJOEET LESES FRA RADENE, ikke fra argv - i rapportmodus gis ikke
   * `--miljo`, saa argv ville gitt standardverdien og navngitt feil bot.
   *
   * Blander shardene flere miljoeer, er tallene ikke sammenliknbare i det hele
   * tatt, og da skal rapporten SI det heller enn aa velge ett av dem.
   */
  const miljøer = [...new Set(R.map((r) => r.m).filter((x): x is string => x !== undefined))];
  const miljøTekst =
    miljøer.length === 1
      ? miljøer[0]!
      : miljøer.length === 0
        ? "ukjent miljoe (rader fra foer miljoeet ble skrevet i radene)"
        : `BLANDEDE MILJOEER (${miljøer.join(" | ")}) - tallene er IKKE sammenliknbare`;
  const L = [
    ``,
    `=== GATE 2: kandidat i ett sete, ${miljøTekst} i de tre andre ===`,
    `${R.length} (giv, sete). Alle fire seter har konvensjonsvakten; bare vektene skiller.`,
    ``,
    `arm                                        poeng/runde for setet`,
    `--------------------------------------------------------------------`,
    ...armer.map((k) => {
      const v = R.map((r) => r.d[k] ?? NaN).filter(Number.isFinite);
      return `${k.padEnd(42)} ${(sn(v) >= 0 ? "+" : "") + sn(v).toFixed(3)} ± ${se(v).toFixed(3)}`;
    }),
    `--------------------------------------------------------------------`,
    ``,
    `PARRET mot KONTROLL (miljoet mot seg selv i samme sete):`,
  ];
  for (const k of armer) {
    if (k === "KONTROLL") continue;
    const d = R.map((r) => (r.d[k] ?? NaN) - (r.d["KONTROLL"] ?? NaN)).filter(Number.isFinite);
    if (d.length < 2) continue;
    const pos = d.filter((x) => x > 0).length;
    const neg = d.filter((x) => x < 0).length;
    L.push(
      `  ${k.padEnd(40)} ${(sn(d) >= 0 ? "+" : "") + sn(d).toFixed(4)} ± ${se(d).toFixed(4)} ` +
        `(${(sn(d) / se(d)).toFixed(1)} SE)  ${pos}/${pos + neg}  p=${tegntest(pos, pos + neg).toFixed(3)}`,
    );
  }
  // ROLLEDEKOMPONERING. Rollen tas fra KONTROLLARMEN, ikke fra kandidatens
  // egen: endrer kandidaten budgivningen, havner den i en annen rolle, og da
  // ville en gruppering paa dens EGEN rolle blandet «hvem bydde» inn i «hvem
  // spilte best». Med kontrollens rolle som noekkel sammenliknes de to armene
  // paa noeyaktig de samme (giv, sete)-parene.
  if (R.some((r) => r.r)) {
    L.push(``, `PER ROLLE (rollen er KONTROLLENS, saa parene er de samme):`);
    for (const k of armer) {
      if (k === "KONTROLL") continue;
      L.push(`  ${k}`);
      for (const rolle of ["foerer", "makker", "forsvar"]) {
        const d = R.filter((x) => x.r?.["KONTROLL"] === rolle)
          .map((x) => (x.d[k] ?? NaN) - (x.d["KONTROLL"] ?? NaN))
          .filter(Number.isFinite);
        if (d.length < 20) continue;
        const pos = d.filter((x) => x > 0).length;
        const neg = d.filter((x) => x < 0).length;
        L.push(
          `    ${rolle.padEnd(9)} n=${String(d.length).padStart(5)}  ` +
            `${(sn(d) >= 0 ? "+" : "") + sn(d).toFixed(4)} ± ${se(d).toFixed(4)} ` +
            `(${(sn(d) / se(d)).toFixed(1)} SE)  ${pos}/${pos + neg}  p=${tegntest(pos, pos + neg).toFixed(3)}`,
        );
      }
    }
  }

  L.push(
    ``,
    `KONTROLLARMEN skal ligge paa 0. Gjoer den ikke det, er det seteskjevhet`,
    `i oppsettet, og ingen av de andre tallene kan leses.`,
    ``,
    `PORTEN: en ny vekt adopteres bare om den er positiv med margin OG`,
    `positiv i klart over halvparten av parene. Aldri adoptere paa stoey.`,
  );
  const tekst = L.join("\n");
  console.log(tekst);
  writeFileSync(rapport.replace(/[-*\d]*\.jsonl$/, ".txt"), tekst + "\n");
  process.exit(0);
}

if (kandidater.length === 0) {
  console.error("Bruk: --kandidat <vaktspek> [--kandidat ...] --miljo <vaktspek>");
  process.exit(1);
}

type Velger = { velgHandling(s: GameState): Handling; nyKamp(): void };




const lagVelger = (spek: string): Velger => lagIndre(spek) as Velger;

mkdirSync(dirname(ut), { recursive: true });
const armer: { navn: string; spek: string }[] = [
  { navn: "KONTROLL", spek: miljøSpek },
  ...kandidater.map((s) => ({ navn: s, spek: s })),
];

/** Spiller giva med `spek` i `sete` og miljoet i de tre andre. */
function spill(frø: number, sete: number, spek: string): { diff: number; rolle: string } | null {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  const v: Velger[] = [0, 1, 2, 3].map((p) => lagVelger(p === sete ? spek : miljøSpek));
  for (const b of v) b.nyKamp();
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    s = utfør(s, v[iTur]!.velgHandling(s)).state;
  }
  if (s.fase === "BUDRUNDE" || s.budvinner === null) return null;
  const p = s.totalPoeng;
  const egne = p[sete] ?? 0;
  const rolle = sete === s.budvinner ? "foerer" : sete === s.makker ? "makker" : "forsvar";
  return {
    diff: Math.round((egne - (p.reduce((a, x) => a + x, 0) - egne) / 3) * 1000) / 1000,
    rolle,
  };
}

let n = 0;
for (let f = 0; f < giver; f++) {
  if (f % skardN !== skardI) continue;
  const frø = (frøBase + f) >>> 0;
  for (let sete = 0; sete < 4; sete++) {
    const d: Record<string, number> = {};
    const rr: Record<string, string> = {};
    let ok = true;
    for (const a of armer) {
      const r = spill(frø, sete, a.spek);
      if (r === null) {
        ok = false;
        break;
      }
      d[a.navn] = r.diff;
      rr[a.navn] = r.rolle;
    }
    if (!ok) continue;
    appendFileSync(ut, JSON.stringify({ giv: frø, sete, m: miljøSpek, d, r: rr } satisfies Linje) + "\n");
    n++;
  }
  process.stdout.write(`\r  skard ${skardI}: ${n} rader   `);
}
console.log(`\nSkard ${skardI} ferdig: ${n} rader → ${ut}`);
