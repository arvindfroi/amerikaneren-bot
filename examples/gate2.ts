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
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { Budagent, lesBudmodell } from "../src/moe2/budagent.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { Ensemble, type EnsembleModus } from "../src/moe2/ensemble.ts";
import { Rolleorakel, type Rolle } from "../src/moe2/rolleorakel.ts";
import { Sikkerorakel } from "../src/moe2/sikkerorakel.ts";
import { Vrakvelger } from "../src/moe2/vrakvelg.ts";
import { Etterlysvelger } from "../src/moe2/etterlys.ts";
import { Vrakvelger2, lesVrakflagg } from "../src/moe2/vrakvelg2.ts";

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
  const L = [
    ``,
    `=== GATE 2: kandidat i ett sete, ${miljøSpek} i de tre andre ===`,
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
/** Nettene leses ÉN gang og deles; E1Agent holder ingen tilstand mellom kamper. */
const nettbuf = new Map<string, ReturnType<typeof lesE1Nett>>();
const lesNett = (fil: string): ReturnType<typeof lesE1Nett> => {
  if (!nettbuf.has(fil)) nettbuf.set(fil, lesE1Nett(fil));
  return nettbuf.get(fil)!;
};

/**
 * Én spek → én agent. Formene nøstes, så en hel stige kan skrives på én linje:
 *
 *   nevro
 *   e1:<fil>
 *   ens:<modus>:<fil1,fil2,...>
 *   vakt:<flagg>:<indre>
 *   budm:<modellfil>:<indre>
 *
 * Rekursjonen er poenget: `budm:...:vakt:abmp:e1:sd-r2.bin` er budmodellen
 * utenpå konvensjonsvakten utenpå nettet, og hvert lag kan tas av for seg.
 * Det er den eneste måten å vise hva HVERT lag er verdt.
 */
function lagIndre(indre: string): { velgHandling(s: GameState): Handling; nyKamp(): void } {
  if (indre === "nevro") return new NevroAgent();
  if (indre.startsWith("vakt:")) {
    const v = delVaktspek(indre);
    if (v === null) throw new Error(`Ugyldig vaktspek «${indre}»`);
    return new Konvensjonsvakt(lagIndre(v.indre), v.valg);
  }
  if (indre.startsWith("budm:")) {
    const rest = indre.slice(5);
    const skille = rest.indexOf(":");
    if (skille < 0) throw new Error(`Ugyldig budm-spek «${indre}» – forventet budm:<modellfil>:<indre>`);
    return new Budagent(lagIndre(rest.slice(skille + 1)), lesBudmodell(rest.slice(0, skille)));
  }
  /**
   * `ork:<rolle>:<indre>` - SD-ORAKELET spiller den rollen, det indre alt annet.
   *
   * Svarer paa om orakelet er et TAK i den rollen. Makkerens atferd avviker
   * ~19 SE fra orakelets, men planen har alt et motbevis for spillefoerersetet
   * (`lagstikk - SD` = +0,26 - nettet slaar laereren der). Fasiten ble godkjent
   * paa en AGGREGERT korrelasjon, aldri per rolle.
   */
  if (indre.startsWith("ork:")) {
    // ork:<rolle>:<verdener>:<indre>
    //
    // ROLLOUT-POLICYEN ER `indre`, IKKE NevroHjerne. Foerste maaling brukte
    // nevro, mens treningsdataen ble generert med vaar sterke bot som motpart -
    // altsaa ble et svakere orakel maalt enn det som lager fasiten. Med `indre`
    // som motpart forestiller orakelet seg at bordet spiller som oss, som er
    // den korrekt spesifiserte varianten.
    const d = indre.slice(4).split(":");
    const rolle = d[0] as Rolle;
    if (rolle !== "foerer" && rolle !== "makker" && rolle !== "forsvar") {
      throw new Error(`Ukjent rolle «${rolle}» (foerer, makker, forsvar)`);
    }
    const verdener = Number(d[1]);
    if (!Number.isFinite(verdener) || verdener < 1) {
      throw new Error(`Ugyldig verdenstall i «${indre}» - forventet ork:<rolle>:<verdener>:<indre>`);
    }
    const inn = lagIndre(d.slice(2).join(":"));
    return new Rolleorakel(inn, inn as unknown as Parameters<typeof Rolleorakel>[1], rolle, { verdener });
  }
  /**
   * `sik:<sigma>:<verdener>:<indre>` - SIKKERORAKELET.
   *
   * Overstyrer `indre` bare der den PARREDE marginen mellom beste og nest
   * beste kort overstiger sigma ganger sin egen SE. sigma=0 er dagens raa
   * orakel; hoey sigma er ren champion. De to ytterpunktene er valideringen.
   */
  if (indre.startsWith("sik:")) {
    // sik:<rolle>:<sigma>:<verdener>:<indre>
    //
    // ROLLEN ER MED FORDI KOSTNADEN ER REELL: uten den evalueres HVER
    // beslutning med K verdener x alle lovlige kort, og en enkelt maaling tar
    // timer. Med rollen blir den dessuten direkte sammenlignbar med ork:-benken,
    // som er sigma=0-varianten av noeyaktig det samme.
    const d = indre.slice(4).split(":");
    const rolle = d[0] as Rolle;
    if (rolle !== "foerer" && rolle !== "makker" && rolle !== "forsvar" && rolle !== "alle") {
      throw new Error(`Ukjent rolle «${rolle}» (foerer, makker, forsvar, alle)`);
    }
    const sigma = Number(d[1]);
    const verdener = Number(d[2]);
    if (!Number.isFinite(sigma) || !Number.isFinite(verdener) || verdener < 1) {
      throw new Error(`Ugyldig sik-spek «${indre}» - forventet sik:<rolle>:<sigma>:<verdener>:<indre>`);
    }
    const inn = lagIndre(d.slice(3).join(":"));
    return new Sikkerorakel(inn, inn as unknown as Parameters<typeof Sikkerorakel>[1], {
      sigma,
      verdener,
      roller: rolle === "alle" ? [] : [rolle],
    });
  }
  /**
   * `vv:<verdener>:<indre>` - VRAK OG TRUMF SOM ETT VALG.
   *
   * Erstatter NevroHjernes to uavhengige beslutninger med et parret SD-valg
   * over doktrinstyrte (trumf, vrak)-kandidater. Trumfvalget er maalt til
   * 32,4 +/- 3,0 poeng per kamp og er den siste beslutningen som fortsatt tas
   * av en haandlagd formel fra appen.
   */
  if (indre.startsWith("vv:")) {
    const d = indre.slice(3).split(":");
    const verdener = Number(d[0]);
    if (!Number.isFinite(verdener) || verdener < 1) {
      throw new Error(`Ugyldig vv-spek «${indre}» - forventet vv:<verdener>:<indre>`);
    }
    const inn = lagIndre(d.slice(1).join(":"));
    return new Vrakvelger(inn, inn as unknown as Parameters<typeof Vrakvelger>[1], { verdener });
  }
  /**
   * `etl:<nivaa>:<indre>` - ETTERLYSNINGEN, den siste uundersoekte beslutningen.
   *
   * 0 = hoeyeste lovlige trumfkort (dagens regel), 1 = nest hoeyeste, osv.
   * Endrer BARE etterlysningen; trumfen kommer fra det indre laget.
   */
  if (indre.startsWith("etl:")) {
    const d = indre.slice(4).split(":");
    const nivaa = Number(d[0]);
    if (!Number.isFinite(nivaa) || nivaa < 0) {
      throw new Error(`Ugyldig etl-spek «${indre}» - forventet etl:<nivaa>:<indre>`);
    }
    return new Etterlysvelger(lagIndre(d.slice(1).join(":")), nivaa);
  }
  /**
   * `vv2:<verdener>:<finale>:<indre>` - VRAK OG TRUMF, andre forsoek.
   *
   * Harde skranker (aldri trumf, aldri ess i vraket), eksplisitte
   * renonskandidater, budprior paa verdenene og en to-trinns trakt.
   */
  if (indre.startsWith("vv2:")) {
    // vv2:<verdener>:<flagg>:<indre>, f.eks. vv2:24:telrd:nevro
    const d = indre.slice(4).split(":");
    const verdener = Number(d[0]);
    if (!Number.isFinite(verdener)) {
      throw new Error(`Ugyldig vv2-spek «${indre}» - forventet vv2:<verdener>:<flagg>:<indre>`);
    }
    const inn = lagIndre(d.slice(2).join(":"));
    return new Vrakvelger2(inn, inn as unknown as Parameters<typeof Vrakvelger2>[1], {
      verdener,
      policy: lesVrakflagg(d[1] ?? "telrd"),
    });
  }
  if (indre.startsWith("e1:")) return new E1Agent(lesNett(indre.slice(3)));
  /**
   * `e1s:<fil>` - E1 med SOEK i VRAK og VELG.
   *
   * I dag gjoer NevroHjerne baade vraket og trumfvalget for Adams: E1Agent
   * sender alt annet enn SPILL videre til `this.nevro`. To hele
   * beslutningsfaser er altsaa overlatt til den svakeste komponenten i
   * sammensetningen, og det er aldri maalt hva det koster.
   *
   * E1Agent har mekanismen fra foer (`soekFaser`), men ingen benk har kunnet
   * be om den. Denne spekken gjoer det, saa spoersmaalet kan avgjoeres med
   * tall i stedet for antakelse.
   */
  if (indre.startsWith("e1s:")) {
    return new E1Agent(lesNett(indre.slice(4)), new NevroAgent(), {
      søkFaser: ["VRAK", "VELG"],
      søkVerdener: 12,
    });
  }
  if (indre.startsWith("ens:")) {
    const rest = indre.slice(4);
    const skille = rest.indexOf(":");
    if (skille < 0) throw new Error(`Ugyldig ensemblespek «${indre}» – forventet ens:<modus>:<filer>`);
    const modus = rest.slice(0, skille) as EnsembleModus;
    if (modus !== "snitt" && modus !== "rang" && modus !== "flertall") {
      throw new Error(`Ukjent ensemblemodus «${modus}» (snitt, rang, flertall)`);
    }
    const filer = rest
      .slice(skille + 1)
      .split(",")
      .filter((x) => x !== "");
    if (filer.length < 2) throw new Error(`Ensemble med ${filer.length} nett – bruk e1: for ett`);
    return new Ensemble(filer.map(lesNett), modus);
  }
  throw new Error(`Ukjent indre agent «${indre}» (e1:<fil> eller ens:<modus>:<filer>)`);
}

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
    appendFileSync(ut, JSON.stringify({ giv: frø, sete, d, r: rr } satisfies Linje) + "\n");
    n++;
  }
  process.stdout.write(`\r  skard ${skardI}: ${n} rader   `);
}
console.log(`\nSkard ${skardI} ferdig: ${n} rader → ${ut}`);
