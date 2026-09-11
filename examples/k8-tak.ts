/**
 * K8-TAKET — TROHODET MOT DET INFORMASJONSRETTFERDIGE TAKET, PÅ K8-STILLINGENE (12. sep).
 *
 *   node examples/k8-tak.ts --nett e1-modell/tro-3.bin --kamp --maksrunder 3 --giver 12 --regel \
 *     --drivere "okt:vr:e1-modell/vrak-3.bin:telrd:profil:budq:e1-modell/budq-3.bin:vakt:abmp:e1:e1-modell/kort-3.bin" \
 *     --skard 0/2 --ut analyse/k8-tak-0.jsonl
 *   node examples/k8-tak.ts --oppsummer analyse/k8-tak-0.jsonl,analyse/k8-tak-1.jsonl
 *
 * STILLINGENE, FRØENE OG MÅLTALLET er ordrett `examples/mlb-k8.ts` (samme flagg med
 * samme standardverdier, `gulvene`/`nettTap` fra `k8-maal.ts`), så `nett`-kolonnen her er
 * `nett`-kolonnen i K8-raden. DRIVERNE er K8-radens speker i KANONISK form (`kanoniskAgent`: hånden
 * sortert, frø 0), som skiller seg bare i likhetsbrudd — uten det var den sanne given uforenlig i 5 av
 * 24 kamper, se `naabart-tro.ts`. Stillingene er derfor nesten, ikke nøyaktig, K8-radens. Nytt er `eksakt`: log-tapet til
 * Bayes-posterioren gitt det setet ser og policyene bordet spiller, talt EKSAKT
 * (`naabart-tro.ts`) når størrelsen er ≤ `--eksakt-grense`. Over grensen er `eksakt` null, men
 * raden skrives likevel (nett, størrelse, kontroll), så DEKNINGEN per stikk kan leses av.
 *
 * ============ GRENSEN ====================================================
 *
 * Størrelsen er multinomialen av de frie kortene på gruppene (øvre grense for bladene). Standard
 * `--eksakt-grense` er valgt fra målt kostnad 12. sep, med treningsløkka på alle kjerner: se
 * `EKSAKT_STANDARD` under. Tidlig i runden er rommet millioner av ganger større; der finnes ikke
 * noe eksakt tak, og SMC-armen (`--partikler`) er EKSPERIMENTELL (kollapser, se `naabart-tro.ts`).
 *
 * ============ SESSIONSTILSTANDEN =========================================
 *
 * K8-raden kjører `--kamp` når troen leser hukommelsen (tro-3 gjør det), og driverne har tilstand
 * over kampen: `okt:`/`profil:` og BudQ-boka (323 inn). Den er IKKE en funksjon av hendene i
 * runden: bøkene bokfører ved RUNDE_SLUTT og leser ellers bare offentlig poengstilling
 * (`Hukommelse.observer`, `Profilbok.observer`). Likelihooden spilles derfor av SKYGGEAGENTER: fire
 * agenter fra de samme spekene som ser HVER ekte tilstand via `observer`, og som aldri spiller i
 * den ekte kampen. Målt 12. sep: 163 av 163 beslutninger over tre runder var identiske med de ekte
 * agentenes, også med partikkelstillinger spilt inn imellom. `sann_ok` sjekker det samme på hver
 * rad: den sanne given skal være forenlig med alt bordet gjorde.
 *
 * ============ KOLONNENE ==================================================
 *
 *   nett, nett_treff        trohodet, som i mlb-k8
 *   str                     størrelsen (enheten til grensen)
 *   eksakt, eksakt_treff    det eksakte rettferdige taket; null over grensen
 *   eksakt_n                forenlige giver (for en ikke-budvinner vektet med talongene)
 *   eksakt_ms, eksakt_kall  tid og policykall for DENNE stillingen (hukommelsen deles i runden per sete)
 *   eksakt_tom              1 = ingen forenlig giv (skal aldri skje)
 *   regel, regel_n          `--regel`: den POLICY-BLINDE tellingen (bare budvinnerstillinger under grensen)
 *   sann_ok                 KONTROLL (leser de ekte hendene, egen hukommelse, rører ikke posterioren)
 *   tak<N>, tak<N>_*        `--partikler`: SMC, eksperimentell
 *
 * K2: posterioren leser bare den vaskede loggen (`naabart-tro.ts`), prøvd i
 * `test/naabart-tro.test.ts` med en felle som leser den ekte given.
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeKort, spillerVisning } from "../src/motor.ts";
import { lagIndre, ADAMS_MAALT, tall } from "../src/moe2/agentspek.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import { gulvene, nettTap } from "./k8-maal.ts";
import { NaabartTro, Trominne, kanoniskAgent, sannPlassering, takTap, type Loggpost } from "./naabart-tro.ts";
import { skrivDom, skrivDomEksakt, type K8TakRad } from "./k8-tak-dom.ts";

/** Standardgrensen for den eksakte tellingen (størrelse), fra målt kostnad (filhodet). */
export const EKSAKT_STANDARD = 1_000_000;

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};

const OPPSUMMER = arg("--oppsummer", "");
if (OPPSUMMER !== "") {
  const rader = OPPSUMMER.split(",").flatMap((f) =>
    readFileSync(f, "utf8").split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l) as K8TakRad),
  );
  for (const l of [...skrivDomEksakt(rader), ...skrivDom(rader)]) console.log(l);
  process.exit(0);
}

const GIVER = tall(arg("--giver", "60"), 60, "giver");
const FRAstikk = tall(arg("--frastikk", "2"), 2, "frastikk");
const PERSTIKK = tall(arg("--perstikk", "1"), 1, "perstikk");
const PERGIV = tall(arg("--pergiv", "8"), 8, "pergiv");
const DRIVERE = arg("--drivere", ADAMS_MAALT).split("|");
const NETTFIL = arg("--nett", "e1-modell/mlb-tro.bin");
const UT = arg("--ut", "analyse/k8-tak-0.jsonl");
const [SI, SN] = (arg("--skard", "0/1").split("/") as [string, string]).map(Number) as [number, number];
const FRØ = tall(arg("--froe", "12000000"), 12_000_000, "froe");
const KAMP = process.argv.includes("--kamp");
const FRA_RUNDE = tall(arg("--fra-runde", "1"), 1, "fra-runde");
const MAKSRUNDER = process.argv.includes("--maksrunder") ? tall(arg("--maksrunder", ""), 0, "maksrunder") : Infinity;
if (MAKSRUNDER !== Infinity && !KAMP) throw new Error("--maksrunder gjelder bare --kamp");

const EKSAKT = Number(arg("--eksakt-grense", String(EKSAKT_STANDARD)));
if (!(EKSAKT >= 0)) throw new Error("--eksakt-grense må være ≥ 0");
const REGEL = process.argv.includes("--regel");
const PARTIKLER = arg("--partikler", "").split(",").filter((x) => x !== "").map((x) => tall(x, 0, "partikler"));
if (PARTIKLER.some((x) => x < 1)) throw new Error("--partikler må være positive heltall");
const TREKK = tall(arg("--trekk", "6"), 6, "trekk");
const TERSKEL = Number(arg("--terskel", "0.5"));

const trohode = MlbTronett.fraBytes(new Uint8Array(readFileSync(NETTFIL)));

mkdirSync(dirname(UT), { recursive: true });
const alleRader: K8TakRad[] = [];
let n = 0;

for (let g = 0; g < GIVER; g++) {
  if (g % SN !== SI) continue;
  const frø = FRØ + g * 6151;
  // KANONISKE drivere (naabart-tro.ts): hånden sortert og frø 0, så policyen er en funksjon av det setet kan vite.
  const ag = [0, 1, 2, 3].map((i) => kanoniskAgent(lagIndre(DRIVERE[i % DRIVERE.length]!)));
  // Skyggeagentene: samme speker, ser hver ekte tilstand, spiller aldri i den ekte kampen.
  const skygge = [0, 1, 2, 3].map((i) => kanoniskAgent(lagIndre(DRIVERE[i % DRIVERE.length]!)));
  let s: GameState = opprettSpill(KAMP ? { antallSpillere: 4, målPoeng: 100 } : { antallSpillere: 4 }, frø);
  let vakt = 0;
  let iGiv = 0;
  let iStikk = 0;
  let sisteStikk = -1;
  const bok = new Hukommelse();
  let runde = s.rundeNr;
  let logg: Loggpost[] = [];
  const filtre = new Map<string, NaabartTro>();
  const minner = new Map<string, Trominne>();
  const minneFor = (nøkkel: string): Trominne => {
    let m = minner.get(nøkkel);
    if (m === undefined) {
      m = new Trominne();
      minner.set(nøkkel, m);
    }
    return m;
  };
  const filterFor = (nøkkel: string, lag: () => NaabartTro): NaabartTro => {
    let f = filtre.get(nøkkel);
    if (f === undefined) {
      f = lag();
      filtre.set(nøkkel, f);
    }
    return f;
  };

  while (s.fase !== "FERDIG" && (KAMP || s.fase !== "RUNDE_SLUTT") && vakt++ < (KAMP ? 20_000 : 200)) {
    for (const a of skygge) a.observer?.(s);
    if (logg.length > 0 && s.rundeNr !== logg[0]!.s.rundeNr) {
      logg = [];
      filtre.clear();
      minner.clear();
    }
    if (KAMP) {
      bok.observer(s);
      if (s.fase === "RUNDE_SLUTT") {
        for (const a of ag) a.observer?.(s);
        if (s.rundeNr + 1 >= MAKSRUNDER) break;
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      if (s.rundeNr !== runde) {
        runde = s.rundeNr;
        iGiv = 0;
        sisteStikk = -1;
      }
    }
    if (s.fase === "SPILL" && s.stikkSpilt !== sisteStikk) {
      sisteStikk = s.stikkSpilt;
      iStikk = 0;
    }
    if (s.fase === "SPILL" && s.iTur !== null && iGiv < PERGIV && iStikk < PERSTIKK && s.stikkSpilt >= FRAstikk && (!KAMP || s.rundeNr >= FRA_RUNDE)) {
      const sete = s.iTur;
      if (lovligeKort(s, sete).length >= 2) {
        iGiv++;
        iStikk++;
        const rad: Record<string, number | string | null> = { frø, stikk: s.stikkSpilt, sete };
        if (KAMP) rad.runde = s.rundeNr;
        const gl = gulvene(s, sete);
        if (gl.kort === 0) break;
        rad.kort = gl.kort;
        rad.erBv = sete === s.budvinner ? 1 : 0;
        rad.gulv = gl.gulv;
        rad.gulvPluss = gl.gulvPluss;
        const huk = KAMP && trohode.brukerHukommelse ? bok.vektor(sete, s.antallSpillere) : null;
        const f = trohode.fordeling(trohode.trekkFor(spillerVisning(s, sete), s.giving.antallStikk, s.regler.målPoeng, huk));
        const a = nettTap(f, s, sete, gl.kort);
        rad.nett = a.tap;
        rad.nett_treff = a.treff;

        // DET EKSAKTE TAKET. Hukommelsen deles i runden per sete (rene resultater per maske).
        const minne = minneFor(`${sete}`);
        const ek = filterFor(`${sete}|eksakt`, () => new NaabartTro(sete, { partikler: 0, agenter: skygge, eksaktGrense: EKSAKT, minne }));
        const kall0 = minne.kall;
        const t0 = performance.now();
        const e = ek.eksaktTro(logg, s);
        rad.str = e.størrelse;
        rad.eksakt = null;
        if (e.r === null) rad.eksakt_tom = 1;
        else if (e.r !== undefined) {
          const t = takTap(e.r.fordeling, s, sete, gl.kort, 1e-12);
          rad.eksakt = t.tap;
          rad.eksakt_treff = t.treff;
          rad.eksakt_n = e.r.n;
          rad.eksakt_ms = Math.round(performance.now() - t0);
          rad.eksakt_kall = minne.kall - kall0;
          if (REGEL && sete === s.budvinner) {
            const rg = filterFor(`${sete}|regel`, () => new NaabartTro(sete, { partikler: 0, agenter: skygge, eksaktGrense: EKSAKT, regel: true, minne: minneFor(`${sete}|regel`) }));
            const r = rg.eksaktTro(logg, s).r;
            if (r !== undefined && r !== null) {
              rad.regel = takTap(r.fordeling, s, sete, gl.kort, 1e-12).tap;
              rad.regel_n = r.n;
            }
          }
        }

        // SMC — EKSPERIMENTELL, bare med --partikler.
        for (const N of PARTIKLER) {
          const fl = filterFor(`${sete}|${N}`, () => new NaabartTro(sete, { partikler: N, agenter: skygge, trekk: TREKK, terskel: TERSKEL, eksaktGrense: EKSAKT, minne }));
          const k0 = minne.kall;
          const t1 = performance.now();
          const r = fl.tro(logg, s);
          rad[`tak${N}_ms`] = Math.round(performance.now() - t1);
          rad[`tak${N}_kall`] = minne.kall - k0;
          if (r === null) {
            rad[`tak${N}`] = null;
          } else {
            const t = takTap(r.fordeling, s, sete, gl.kort, r.eksakt ? 1e-12 : 1 / (2 * N));
            rad[`tak${N}`] = t.tap;
            rad[`tak${N}_treff`] = t.treff;
            rad[`tak${N}_gulvbandt`] = t.gulvbandt;
            rad[`tak${N}_eksakt`] = r.eksakt ? 1 : 0;
          }
          rad[`tak${N}_foryngelser`] = fl.tall.foryngelser;
          rad[`tak${N}_aksept`] = fl.tall.forslag === 0 ? 0 : Number((fl.tall.godtatt / fl.tall.forslag).toFixed(4));
          rad[`tak${N}_fersk`] = fl.tall.fersk === 0 ? 0 : Number((fl.tall.ferskGodtatt / fl.tall.fersk).toFixed(4));
          rad[`tak${N}_omstart`] = fl.tall.omstart;
        }
        // KONTROLLEN, etter posterioren og med egen hukommelse: den sanne given skal være forenlig.
        rad.sann_ok = ek.forenlig(sannPlassering(logg[0]!.s, sete, s.budvinner)) ? 1 : 0;

        appendFileSync(UT, JSON.stringify(rad) + "\n");
        alleRader.push(rad as unknown as K8TakRad);
        n++;
        process.stdout.write(`\r  skard ${SI}: ${n} stillinger   `);
      }
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    const h = ag[iTur]!.velgHandling(s);
    logg.push({ s, h });
    s = utfør(s, h).state;
  }
}
console.log(`\nSkard ${SI} ferdig: ${n} stillinger → ${UT}`);
for (const l of [...skrivDomEksakt(alleRader), ...skrivDom(alleRader)]) console.log(l);
