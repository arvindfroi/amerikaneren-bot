/**
 * BUDQ-DATA — etikettene budmodellen lærer av (K3.1, K3.2, K5). 11. sep.
 *
 *   node examples/budq-data.ts --kamper 200 --skard 0/8 --verdener 4 --ut D:/amb-grp/budq/d0/s0.jsonl
 *     [--spek <policy>] [--sjanse 0.5] [--froe 15000000] [--maksrunder 60] [--seier e1-modell/seier-g0.bin]
 *
 * For et utvalg budbeslutninger i hele kamper til 100: trekk K verdener forenlige med
 * det setet VET (`trekkVerdener`, budvekten på — de andres bud teller), og for HVERT
 * lovlige bud: tving budet nå, spill runden ferdig med policyen, og les av utfallet.
 * Alle budene får de SAMME verdenene, så forskjellene mellom dem er parvise.
 *
 * TO MÅL. Uten `--seier` er etiketten rundepoeng (egne minus snittet av de tre andre).
 * Første kampbenk (03:55) viste at det ikke holder: BudQ slo Adams' bud med +0,17 per
 * budbeslutning på det målet, og vant ikke én kamp mer. K1 er å VINNE KAMPEN. Med
 * `--seier <prediktor>` er etiketten 100·ΔP(seier) for setet — sjansen etter runden
 * minus sjansen før, lest av seiersprediktoren fra R-løpene (`src/mlb/seier.ts`); ender
 * runden kampen, er «etter» fasiten 0 eller 1. Da er et bud som gir 20 poeng i ledelse
 * verdt lite, og et dristig bud når man ligger langt bak verdt mer (K5). Rundepoengene
 * skrives likevel i `qp`, så de to målene kan sammenliknes på samme rader.
 *
 * INGEN FASIT I ETIKETTEN: verdenene trekkes fra setets visning, ikke fra den virkelige
 * given. Den virkelige given brukes bare til å spille KAMPEN videre, så stillingene
 * (auksjoner, kampstillinger) er de policyen faktisk havner i.
 *
 * Utspillingene har egne agentinstanser, aldri kampens: et lag med tilstand
 * (vrakrangereren husker vraket mellom VRAK og VELG) skal ikke kunne lekke mellom dem.
 *
 * EKSPERTITERASJON: `--spek` er policyen som spiller resten av runden. Start med
 * `ADAMS`; når et BudQ-nett finnes, spill med `budq:<fil>:…` og tren på nytt.
 *
 * MOTSTANDERBOKA (K6.6): `--hukommelse` skriver `x` med 287 tall — de 143 pluss
 * MLB-hukommelsen for det registrerte setet (`budqTrekk(s, sete, bok)`), bokført av
 * kampens ferdige runder. Uten flagget er utdataene byte-identiske med før.
 *
 * OBSERVER. Alle kamp- og utspillingsagenter ser HVER tilstand i kampen, også
 * `RUNDE_SLUTT`, gjennom `observer`. Før ble den aldri kalt: et 287-BudQ-nett i `--spek`
 * ville budt med tom bok, og et hukommelsesleddet trohode i speken ville kastet i neste
 * runde. Utspillingene selv (hypotetiske verdener) vises ALDRI — de når bare fram til
 * `RUNDE_SLUTT`, og en tenkt runde skal ikke bokføres som om den var spilt.
 *
 * POPULASJONEN (`--drivere "A|B|C|D"`, `--rotasjon`, 11. sep): én spek per sete, `@` =
 * kandidaten (`--spek`), og bare `@`-setene får budstillinger. Utspillingene bruker de samme
 * spekene per sete som kampen, så Q er verdien mot DETTE bordet. Se `examples/drivere.ts`.
 * Uten flagget er alt byte-identisk med før.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeHandlinger } from "../src/motor.ts";
import type { Bud } from "../src/regler.ts";
import { lagRng } from "../src/kort.ts";
import { ADAMS, lagIndre, tall } from "../src/moe2/agentspek.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { BUDQ_BUD, budqTrekk } from "../src/moe2/budq.ts";
import { Seiersprediktor } from "../src/mlb/seier.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import { bordTekst, lesBord, slot, tilSeter } from "./drivere.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const KAMPER = tall(arg("--kamper", "200"), 200, "kamper");
const [SI, SN] = arg("--skard", "0/1").split("/").map(Number) as [number, number];
const K = tall(arg("--verdener", "4"), 4, "verdener");
const SJANSE = Number(arg("--sjanse", "0.5"));
const FRØ = tall(arg("--froe", "15000000"), 15_000_000, "froe");
const MAKSRUNDER = tall(arg("--maksrunder", "60"), 60, "maksrunder");
const SPEK = arg("--spek", ADAMS);
const UT = arg("--ut", "D:/amb-grp/budq/d0/s0.jsonl");
const SEIER = arg("--seier", "");
const HUKOMMELSE = process.argv.includes("--hukommelse");
/**
 * `--sanser2` (11. sep): stillingen per sete (`src/mlb/stillingtrekk.ts`) bakerst etter boka,
 * 287 → 323. Krever `--hukommelse`: blokken ligger BAK boka, så et 287-nett kan utvides med
 * nullkolonner bakerst. Uten flagget er utdataene byte-identiske med før.
 */
const SANSER2 = process.argv.includes("--sanser2");
if (SANSER2 && !HUKOMMELSE) throw new Error("--sanser2 ligger bak motstanderboka: krever --hukommelse");
/** Én spek per sete; uten `--drivere` fire ganger `SPEK`, alle registrert (se `drivere.ts`). */
const BORD = lesBord(process.argv, SPEK);
const prediktor = SEIER === "" ? null : Seiersprediktor.fraFil(SEIER);
mkdirSync(dirname(UT), { recursive: true });

// Per SLOT, i samme rekkefølge som før (slot = sete uten `--rotasjon`).
const kamp = BORD.spek.map((x) => lagIndre(x));
const utspill = BORD.spek.map((x) => lagIndre(x));
const alleAgenter = [...kamp, ...utspill];
/** Slotene stokket til seter for kampen som spilles nå. Uten rotasjon: de samme objektene i samme rekkefølge. */
let kampSeter = kamp;
let utspillSeter = utspill;

/**
 * Motstanderboka per sete, nullstilt per kamp. Hvert sete får sin egen, som en
 * `BudQagent` i setet ville hatt; de ser de samme offentlige tilstandene, og `vektor`
 * roterer til setets relative motstandere.
 */
let bøker: Hukommelse[] | null = null;

/** Rundeutfallet for `sete`: egne poeng minus snittet av de tre andre. 0 om ingen runde ble spilt. */
function utfall(s: GameState, sete: number): number {
  const d = s.sisteRunde?.delta;
  if (d === undefined) return 0;
  const egne = d[sete] ?? 0;
  const andre = d.reduce((a, x) => a + x, 0) - egne;
  return egne - andre / (d.length - 1);
}

/** P(setet vinner kampen) i denne stillingen; fasiten når kampen er over. */
function vinnersjanse(s: GameState, sete: number): number {
  if (s.fase === "FERDIG") return s.vinner === sete ? 1 : 0;
  return prediktor!.fordeling(s.totalPoeng, sete, s.regler.målPoeng)[0]!;
}

/** Tving `bud` for `sete` nå, spill runden ferdig, og les av begge målene. */
function spillUt(start: GameState, sete: number, bud: Bud): { poeng: number; seier: number | null } {
  let s = utfør(start, { type: "BUD", spiller: sete, bud }).state;
  const runde = start.rundeNr;
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && s.rundeNr === runde && vakt++ < 400) {
    const i = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (i === null || i === undefined) break;
    // Setets EGEN spek i utspillingen også: Q skal være verdien mot bordet som faktisk sitter der.
    s = utfør(s, utspillSeter[i]!.velgHandling(s)).state;
  }
  const poeng = utfall(s, sete);
  if (prediktor === null) return { poeng, seier: null };
  return { poeng, seier: 100 * (vinnersjanse(s, sete) - vinnersjanse(start, sete)) };
}

const rund = (x: number): number => Math.round(x * 100) / 100;
const velg = lagRng(9_100_000 + SI);
let skrevet = 0;
const t0 = Date.now();
if (BORD.blandet) console.log(`Bord (kamp 0): ${bordTekst(BORD, 0)}${BORD.rotasjon ? "  [roterer per kamp]" : ""}`);
for (let g = 0; g < KAMPER; g++) {
  if (g % SN !== SI) continue;
  const frø = FRØ + g * 7717;
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, frø);
  for (const a of kamp) a.nyKamp();
  // Utspillingsagentene er også «i kampen» nå som de observerer den: ny kamp, ny bok.
  for (const a of utspill) a.nyKamp();
  kampSeter = tilSeter(BORD, kamp, g);
  utspillSeter = tilSeter(BORD, utspill, g);
  bøker = HUKOMMELSE ? [0, 1, 2, 3].map(() => new Hukommelse()) : null;
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.rundeNr < MAKSRUNDER && vakt++ < 40_000) {
    // HVER tilstand, også RUNDE_SLUTT; se hodet. Før trekket, så en bok som leser
    // poengstillingen ved rundestart har den før første beslutning.
    for (const a of alleAgenter) a.observer?.(s);
    if (bøker !== null) for (const b of bøker) b.observer(s);
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (sete === null || sete === undefined) break;
    const h = kampSeter[sete]!.velgHandling(s);

    // Opptaket sjekkes FØR trekningen: uten `--drivere` er det alltid sant, og rng-strømmen som før.
    if (s.fase === "BUDRUNDE" && BORD.opptak[slot(BORD, sete, g)] && velg() < SJANSE) {
      const lov = lovligeHandlinger(s);
      const kandidater = lov.fase === "BUDRUNDE" ? lov.bud.filter((b) => BUDQ_BUD.includes(b)) : [];
      if (kandidater.length >= 2) {
        const verdener = trekkVerdener(s, sete, K, lagRng((frø * 31 + skrevet * 104_729 + sete) >>> 0), undefined, undefined, 32, undefined, true);
        if (verdener.length > 0) {
          const q: Record<string, number[]> = {};
          const qp: Record<string, number[]> = {};
          for (const b of kandidater) {
            const utfallene = verdener.map((hender) => spillUt(medVerden(s, hender, sete), sete, b));
            qp[String(b)] = utfallene.map((u) => rund(u.poeng));
            q[String(b)] = utfallene.map((u) => rund(u.seier ?? u.poeng));
          }
          appendFileSync(
            UT,
            JSON.stringify({
              frø,
              runde: s.rundeNr,
              sete,
              maal: prediktor === null ? "poeng" : "seier",
              policy: h.type === "BUD" ? String(h.bud) : null,
              x: [...budqTrekk(s, sete, bøker?.[sete] ?? null, SANSER2)].map((x) => Math.round(x * 10_000) / 10_000),
              q,
              ...(prediktor === null ? {} : { qp }),
            }) + "\n",
          );
          skrevet++;
        }
      }
    }
    s = utfør(s, h).state;
  }
  process.stdout.write(`\r  skard ${SI}/${SN}: kamp ${g}, ${skrevet} budstillinger, ${((Date.now() - t0) / 1000).toFixed(0)} s   `);
}
console.log(`\nSkard ${SI}/${SN} ferdig: ${skrevet} budstillinger → ${UT}`);
