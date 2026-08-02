/**
 * BUDAGENTEN I SPILL: hjelper modellen når den faktisk må vinne budrunden?
 *
 *   node examples/budagent-benk.ts --giver 4000 --skard 0/8
 *
 * HVORFOR DENNE MÅLINGEN ER EN ANNEN ENN `budmodell.ts`. Der måles modellen
 * mot simulerte etiketter: «hvis du fikk kontrakten på N, hva ga det?» Her må
 * budet vinne en ekte budrunde mot tre andre, og et bud som er riktig men blir
 * overbudt er verdt nøyaktig ingenting.
 *
 * Modellen målte +0,122 ± 0,027 mot «by alltid 9» på etiketter. Denne måler
 * hva det blir til i spill – og de to tallene har ingen grunn til å være like.
 *
 * DESIGNET er parret på giv og sete, med kandidaten i ETT sete og en fast
 * referanse i de tre andre. Uten referansen summerer poengdifferansen til null
 * over setene, og effekten forsvinner per konstruksjon.
 *
 *   A  vakt:abmp                  budet er NevroHjernes, som i dag
 *   B  vakt:abmp + Budagent       budet kommer fra modellen
 *
 * Alt annet – kortspill, vrak, trumfvalg – er identisk. Differansen kan derfor
 * bare komme fra budet.
 *
 * FORVENTNINGEN SKAL STÅ FØR TALLET, så den ikke kan justeres etterpå:
 * modellen kan anbefale bud 8 og 11, og kortnettet er trent på data der 92 %
 * av kontraktene er 9–10. Den spiller en åtter som om den var en nier. Blir
 * dette negativt, er det derfor IKKE nødvendigvis budmodellen som er motbevist
 * – det kan like gjerne være at kortspillet ikke kan levere kontrakten. Det
 * skillet lar seg avgjøre først etter fase 0, og til da er et negativt tall
 * uinformativt om modellen.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { Budagent, lesBudmodell } from "../src/moe2/budagent.ts";

let giver = 4000;
let skardI = 0;
let skardN = 1;
let frøBase = 400_000_000;
let kandidatSpek = "vakt:abmp:e1:e1-modell/sd-r2.bin";
let modellFil = "e1-modell/bud-gbt.json";
let ut = "analyse/budagent-0.jsonl";
let rapport: string | null = null;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--giver") giver = Number(process.argv[++i]);
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--kandidat") kandidatSpek = process.argv[++i]!;
  else if (a === "--modell") modellFil = process.argv[++i]!;
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
  d: Record<string, number>;
  kontrakt: Record<string, number>;
  vant: Record<string, number>;
  klart: Record<string, number>;
}

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
  const d = R.map((r) => (r.d["MODELL"] ?? NaN) - (r.d["NEVRO"] ?? NaN)).filter(Number.isFinite);
  const linjer = [
    `\n=== Budagenten i spill ===`,
    `${R.length} (giv, sete), parret. Kandidat ${kandidatSpek} i BEGGE armene.`,
    `Bare budet skiller dem.`,
    ``,
    `arm        vant budrunden   snittkontrakt   klart      poengdiff`,
    `------------------------------------------------------------------`,
    ...["NEVRO", "MODELL"].map(
      (k) =>
        `${k.padEnd(10)} ${(100 * sn(R.map((r) => r.vant[k] ?? 0))).toFixed(1).padStart(12)} %   ` +
        `${sn(R.filter((r) => (r.vant[k] ?? 0) > 0).map((r) => r.kontrakt[k] ?? 0)).toFixed(2).padStart(11)}   ` +
        `${(100 * sn(R.filter((r) => (r.vant[k] ?? 0) > 0).map((r) => r.klart[k] ?? 0))).toFixed(1).padStart(5)} %   ` +
        `${sn(R.map((r) => r.d[k] ?? 0)).toFixed(3).padStart(9)}`,
    ),
    `------------------------------------------------------------------`,
    ``,
    `MODELL − NEVRO, parret:  ${sn(d) >= 0 ? "+" : ""}${sn(d).toFixed(4)} ± ${se(d).toFixed(4)}  (${(sn(d) / se(d)).toFixed(1)} SE), n=${d.length}`,
    ``,
    `FORBEHOLD SKREVET FOER TALLET: modellen kan anbefale bud 8 og 11, og`,
    `kortnettet er trent paa data der 92 % av kontraktene er 9-10. Et negativt`,
    `tall her skiller ikke «modellen byr feil» fra «nettet kan ikke spille`,
    `kontrakten modellen gir den». Det skillet krever fase 0.`,
  ];
  const tekst = linjer.join("\n");
  console.log(tekst);
  writeFileSync(rapport.split(",")[0]!.replace(/-\d+\.jsonl$/, ".txt"), tekst + "\n");
  process.exit(0);
}

mkdirSync(dirname(ut), { recursive: true });
const vakt = delVaktspek(kandidatSpek)!;
const nett = lesE1Nett(vakt.indre.slice(3));
const modell = lesBudmodell(modellFil);
type Velger = { velgHandling(s: GameState): Handling; nyKamp(): void };
const lagBase = (): Velger => new Konvensjonsvakt(new E1Agent(nett), vakt.valg);
const lagModell = (): Velger => new Budagent(lagBase(), modell);

/** Spiller giva med `sete` bemannet av `lag`, referansen i resten. */
function spill(
  frø: number,
  sete: number,
  lag: () => Velger,
): { diff: number; vant: number; kontrakt: number; klart: number } | null {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  const v: Velger[] = [0, 1, 2, 3].map((p) => (p === sete ? lag() : lagBase()));
  for (const b of v) b.nyKamp();
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    s = utfør(s, v[iTur]!.velgHandling(s)).state;
  }
  if (s.fase === "BUDRUNDE" || s.budvinner === null) return null;
  const p = s.totalPoeng;
  const egne = p[sete] ?? 0;
  const st = s.stikkVunnet;
  const lagStikk = (st[s.budvinner] ?? 0) + (s.makker !== null ? (st[s.makker] ?? 0) : 0);
  const bud = s.melding?.type === "tall" ? s.melding.bud : 0;
  return {
    diff: Math.round((egne - (p.reduce((a, x) => a + x, 0) - egne) / 3) * 1000) / 1000,
    vant: s.budvinner === sete ? 1 : 0,
    kontrakt: bud,
    klart: bud > 0 && lagStikk >= bud ? 1 : 0,
  };
}

let n = 0;
for (let f = 0; f < giver; f++) {
  if (f % skardN !== skardI) continue;
  const frø = (frøBase + f) >>> 0;
  for (let sete = 0; sete < 4; sete++) {
    const a = spill(frø, sete, lagBase);
    const b = spill(frø, sete, lagModell);
    if (a === null || b === null) continue;
    appendFileSync(
      ut,
      JSON.stringify({
        giv: frø,
        sete,
        d: { NEVRO: a.diff, MODELL: b.diff },
        kontrakt: { NEVRO: a.kontrakt, MODELL: b.kontrakt },
        vant: { NEVRO: a.vant, MODELL: b.vant },
        klart: { NEVRO: a.klart, MODELL: b.klart },
      } satisfies Linje) + "\n",
    );
    n++;
  }
  process.stdout.write(`\r  skard ${skardI}: ${n} rader   `);
}
console.log(`\nSkard ${skardI} ferdig: ${n} rader → ${ut}`);
