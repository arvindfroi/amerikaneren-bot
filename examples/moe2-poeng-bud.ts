/**
 * SLUTTMÅLET FOR BUDEKSPERTEN: POENG, ikke fasitavvik.
 *
 *   node examples/moe2-poeng-bud.ts --givere 240
 *
 * HVORFOR DETTE OG IKKE HOLDOUT-ANGEREN. Fire ganger 25. juli 2026 pekte et
 * støyfritt fasittall og poengbenken hver sin vei: E1-r2 slo NevroHjerne med
 * 0,34 anger og tapte 2,91 poeng; DD-vraket traff fasiten perfekt og tapte
 * 1,54 poeng mot nevro; DD-trumfen likeså. Anger er et gradientsignal, aldri
 * en forfremmelse. Budfasiten er den ENESTE som har bestått porten, og selv
 * den skal måles på poeng før den brukes til noe.
 *
 * METODEN er identisk med `examples/moe2-port-bud.ts`, med vilje: bare budet
 * i ett sete varieres. Vrak, trumfvalg, etterlysning og hele kortspillet – i
 * alle fire seter – er NevroHjerne. Da kan ingenting annet forklare
 * poengforskjellen. Tallene er dermed direkte sammenlignbare med portens:
 *
 *   nevro selv     0,00   (baselinjen)
 *   SD (fasiten)  +3,89   (orakelet, det eksperten prøver å nærme seg)
 *   SD − 1        +2,38
 *   SD + 1       −10,86
 *
 * GIVERSETTET er 8 000 000 / 8 500 000, det samme som porten – og disjunkt
 * fra treningens 9 000 000+. Eksperten har aldri sett en eneste av disse
 * givene, verken til læring eller til seleksjon.
 */

import { readFileSync, writeFileSync } from "node:fs";

import {
  lovligeHandlinger,
  opprettSpill,
  spillerVisning,
  utfør,
  type Bud,
  type GameState,
  type Handling,
} from "../src/index.ts";
import { genomFraJson } from "../src/neat/genom.ts";
import { Nettverk } from "../src/neat/nett.ts";
import { analyserGiv, sdBud, tømCache } from "../src/neat/singledummy.ts";
import { lagInn } from "../src/neat/trekk.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { billigsteBud, estimatFraUt, påstand } from "../src/moe2/eksperter/bud.ts";
import { BUD_SENSORER, projiser } from "../src/moe2/eksperter/sensorer.ts";

let givere = 240;
let ekspertFil = "analyse/moe2-budekspert.json";
let symFil = "analyse/moe2-budekspert-symmetrisk.json";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--givere") givere = Number(process.argv[++i]);
  else if (a === "--ekspert") ekspertFil = process.argv[++i] ?? ekspertFil;
  else if (a === "--symmetrisk") symFil = process.argv[++i] ?? symFil;
}

const nevro = new NevroAgent();

/** Nettet lastes én gang; `Nettverk` er statløst mellom `aktiver`-kall. */
function lastNett(fil: string): Nettverk | null {
  try {
    return new Nettverk(genomFraJson(readFileSync(fil, "utf8")));
  } catch {
    return null;
  }
}
const ekspert = lastNett(ekspertFil);
const symmetrisk = lastNett(symFil);
if (ekspert === null) throw new Error(`fant ikke ${ekspertFil} – kjør moe2-tren-bud.ts først`);

/**
 * Budeksperten i en EKTE budrunde: sensorer → nett → bud.
 *
 * `avrunding` er den ene tingen målingen skal avgjøre. Asymmetrien hører
 * hjemme i tapsfunksjonen – det er målt – men den kan komme inn TO steder, og
 * da telles den to ganger:
 *
 *   1. i LÆRINGEN, som flytter estimatet fra betinget forventning ned mot
 *      τ-ekspektilen (τ = 0,093 av de målte 1,51 og 14,75), og
 *   2. i AVRUNDINGEN, som velger det billigste lovlige budet gitt estimatet.
 *
 * Teorien sier at bare ett av dem er riktig: er estimatet allerede kvantilen
 * som minimerer forventet kostnad, skal det rundes til NÆRMESTE lovlige bud,
 * ikke ned en gang til. Er estimatet forventningen, må avrundingen bære hele
 * asymmetrien. Hvilken som vinner er et empirisk spørsmål, og det er dette
 * skriptet som svarer på det – i poeng.
 */
type Avrunding = "billigst" | "nærmest";

function ekspertBud(
  nett: Nettverk,
  avrunding: Avrunding,
  s: GameState,
  sete: number,
  lovlige: readonly Bud[],
): Bud {
  const T = s.giving.antallStikk;
  const inn = projiser(
    lagInn(spillerVisning(s, sete), "BUD", T, s.regler.målPoeng),
    BUD_SENSORER,
  );
  const handlinger = lovlige.map((b) => påstand(b, T));
  const est = estimatFraUt(nett.aktiver(inn), T);
  let i: number;
  if (avrunding === "billigst") {
    i = billigsteBud(handlinger, est);
  } else {
    i = 0;
    for (let k = 1; k < handlinger.length; k++) {
      if (Math.abs(handlinger[k]! - est) < Math.abs(handlinger[i]! - est)) i = k;
    }
  }
  return lovlige[i]!;
}

/**
 * En budpolicy. `velg === null` betyr at NevroHjerne byr som vanlig – det er
 * baselinjen, og den må gå gjennom nøyaktig samme løkke som de andre.
 */
interface Policy {
  readonly navn: string;
  readonly velg: ((s: GameState, sete: number, lovlige: readonly Bud[], sd: number) => Bud) | null;
}

/** Høyeste lovlige tallbud som ikke overstiger `mål`; ellers PASS. */
function høyesteUnder(lovlige: readonly Bud[], mål: number): Bud {
  let valgt: Bud = "PASS";
  for (const b of lovlige) {
    if (typeof b === "number" && b <= mål && (valgt === "PASS" || b > valgt)) valgt = b;
  }
  return valgt;
}

/**
 * STØYKONTROLLEN – samme snittbud som «SD − 1», ren tilfeldig spredning på
 * toppen: halvparten av setene byr SD, halvparten SD − 2.
 *
 * Den finnes fordi et estimat aldri er en ren forskyvning. En trent ekspert
 * bommer i BEGGE retninger rundt sitt eget nivå, og med 14,75 mot 1,51 er det
 * ikke likegyldig. Uten denne linjen kan vi ikke skille «eksperten sikter
 * feil» fra «eksperten sikter riktig, men skjelver» – og det er to helt ulike
 * problemer å rette.
 *
 * Fordelingen er deterministisk (frø + sete), så målingen kan gjentas.
 */
function støy(frø: number, sete: number): number {
  let h = (frø ^ (sete * 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h >>> 8) % 2 === 0 ? 0 : -2;
}

const policyer: Policy[] = [
  { navn: "nevro selv", velg: null },
  { navn: "SD (fasiten)", velg: (_s, _p, l, sd) => høyesteUnder(l, sd) },
  { navn: "SD − 1", velg: (_s, _p, l, sd) => høyesteUnder(l, sd - 1) },
  {
    navn: "SD − 1 ± 1",
    velg: (s, p, l, sd) => høyesteUnder(l, sd - 1 + (støy(s.frø, p) === 0 ? 1 : -1)),
  },
  { navn: "asym+billigst", velg: (s, p, l) => ekspertBud(ekspert, "billigst", s, p, l) },
  { navn: "asym+nærmest", velg: (s, p, l) => ekspertBud(ekspert, "nærmest", s, p, l) },
];
if (symmetrisk !== null) {
  policyer.push(
    { navn: "sym+billigst", velg: (s, p, l) => ekspertBud(symmetrisk, "billigst", s, p, l) },
    { navn: "sym+nærmest", velg: (s, p, l) => ekspertBud(symmetrisk, "nærmest", s, p, l) },
  );
}

/** Spiller ett sete gjennom én runde. Alt annet enn budet i `sete` er nevro. */
function énRunde(p: Policy, sete: number, frø: number): { poeng: number; bud: number | null; sd: number } {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  const analyse = analyserGiv(s, nevro);
  const sd = sdBud(analyse, sete, s.giving.antallStikk);
  let mittBud: number | null = null;
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
    let h: Handling;
    if (iTur === sete && s.fase === "BUDRUNDE" && p.velg !== null) {
      const lov = lovligeHandlinger(s);
      const bud = lov.fase === "BUDRUNDE" ? p.velg(s, sete, lov.bud, sd) : "PASS";
      if (typeof bud === "number") mittBud = bud;
      h = { type: "BUD", spiller: sete, bud };
    } else {
      h = nevro.velgHandling(s);
      if (iTur === sete && h.type === "BUD" && typeof h.bud === "number") mittBud = h.bud;
    }
    s = utfør(s, h).state;
  }
  const egne = s.totalPoeng[sete] ?? 0;
  const andre = (s.totalPoeng.reduce((a, b) => a + b, 0) - egne) / 3;
  return { poeng: egne - andre, bud: mittBud, sd };
}

interface Rad {
  navn: string;
  avvikFraSD: number;
  poeng: number;
  poengA: number;
  poengB: number;
  se: number;
  budSnitt: number;
  andelBud: number;
  /** Snittet av (bud − SD), med fortegn. Nivået policyen sikter på. */
  skjevhet: number;
  /** Standardavviket til (bud − SD). Skjelvingen rundt nivået. */
  spredning: number;
  /** Hvor ofte budet ligger OVER SD – den dyre siden. */
  andelOver: number;
}

const halv = Math.floor(givere / 2);
const rader: Rad[] = [];
for (const p of policyer) {
  let avvik = 0;
  let sum = 0;
  let kvadrat = 0;
  let pa = 0;
  let pb = 0;
  let budSum = 0;
  let budN = 0;
  let n = 0;
  // Skjevhet og spredning måles BARE på runder der policyen faktisk sa et
  // tall. Et pass er ikke et bud som bommer, det er et fravær av bud.
  let dSum = 0;
  let dKvadrat = 0;
  let over = 0;
  for (let f = 0; f < givere; f++) {
    const frø = (f < halv ? 8_000_000 : 8_500_000) + f;
    for (let sete = 0; sete < 4; sete++) {
      const r = énRunde(p, sete, frø);
      avvik += Math.abs((r.bud ?? 0) - r.sd);
      if (r.bud !== null) {
        budSum += r.bud;
        budN++;
        const d = r.bud - r.sd;
        dSum += d;
        dKvadrat += d * d;
        if (d > 0) over++;
      }
      if (f < halv) pa += r.poeng;
      else pb += r.poeng;
      sum += r.poeng;
      kvadrat += r.poeng * r.poeng;
      n++;
    }
  }
  const halvN = n / 2;
  const snitt = sum / n;
  const m = budN > 0 ? dSum / budN : NaN;
  rader.push({
    navn: p.navn,
    avvikFraSD: avvik / n,
    poeng: snitt,
    poengA: pa / halvN,
    poengB: pb / halvN,
    // Standardfeilen er ikke pynt: uten den kan «bedre enn nevro» være støy.
    se: Math.sqrt(Math.max(0, kvadrat / n - snitt * snitt) / n),
    budSnitt: budN > 0 ? budSum / budN : NaN,
    andelBud: budN / n,
    skjevhet: m,
    spredning: budN > 0 ? Math.sqrt(Math.max(0, dKvadrat / budN - m * m)) : NaN,
    andelOver: budN > 0 ? over / budN : NaN,
  });
  process.stdout.write(`\r  ${rader.length}/${policyer.length} maalt   `);
  tømCache();
}
console.log();

const linjer: string[] = [];
function skriv(s: string): void {
  console.log(s);
  linjer.push(s);
}

skriv(`Budeksperten mot poeng. ${new Date().toISOString()}`);
skriv(`${givere} givere x 4 seter, bare budet varieres, alt annet er NevroHjerne`);
skriv(`ekspert: ${ekspertFil}`);
skriv("");
skriv(
  "policy".padEnd(15) +
    "snittbud".padStart(10) +
    "byr%".padStart(7) +
    "skjevhet".padStart(10) +
    "spredning".padStart(11) +
    "over%".padStart(8) +
    "poeng".padStart(9) +
    "SE".padStart(7) +
    "mot nevro".padStart(11),
);
skriv("-".repeat(88));
const baselinje = rader.find((r) => r.navn === "nevro selv")!.poeng;
for (const r of [...rader].sort((a, b) => b.poeng - a.poeng)) {
  skriv(
    r.navn.padEnd(15) +
      (Number.isNaN(r.budSnitt) ? "–" : r.budSnitt.toFixed(2)).padStart(10) +
      `${Math.round(100 * r.andelBud)} %`.padStart(7) +
      r.skjevhet.toFixed(2).padStart(10) +
      r.spredning.toFixed(2).padStart(11) +
      `${Math.round(100 * r.andelOver)} %`.padStart(8) +
      r.poeng.toFixed(2).padStart(9) +
      r.se.toFixed(2).padStart(7) +
      (r.poeng - baselinje).toFixed(2).padStart(11),
  );
}
skriv(
  "skjevhet = snitt(bud − SD), spredning = standardavviket rundt den, " +
    "over% = hvor ofte budet ligger over SD",
);

const sd = rader.find((r) => r.navn === "SD (fasiten)")!.poeng;
// Den beste ekspertvarianten er den som skal rapporteres – men VALGT PÅ
// POENG, ikke på anger, og det står her fordi de fire variantene ellers ville
// blitt til «vi hadde en som virket» i etterkant.
const ekspertRader = rader.filter((r) => r.navn.includes("+"));
const eks = [...ekspertRader].sort((a, b) => b.poeng - a.poeng)[0]!;
skriv("");
for (const r of ekspertRader) {
  skriv(
    `  ${r.navn.padEnd(15)} ${(r.poeng - baselinje).toFixed(2).padStart(7)} mot nevro, ` +
      `snittbud ${r.budSnitt.toFixed(2)}, avvik fra SD ${r.avvikFraSD.toFixed(2)}`,
  );
}
skriv("");
skriv(
  `Beste variant «${eks.navn}» ${eks.poeng > baselinje ? "SLÅR" : "TAPER MOT"} nevros eget bud: ` +
    `${(eks.poeng - baselinje).toFixed(2)} poeng/runde (SE ${eks.se.toFixed(2)}).`,
);
skriv(
  `Av spennet nevro → SD (${(sd - baselinje).toFixed(2)} poeng) har den hentet ` +
    `${(100 * ((eks.poeng - baselinje) / (sd - baselinje))).toFixed(0)} %.`,
);

writeFileSync("analyse/moe2-poeng-bud.txt", linjer.join("\n") + "\n");
writeFileSync(
  "analyse/moe2-poeng-bud.json",
  JSON.stringify({ givere, ekspertFil, rader, baselinje, sd }, null, 2),
);
skriv(`\nSkrev analyse/moe2-poeng-bud.{txt,json}`);
