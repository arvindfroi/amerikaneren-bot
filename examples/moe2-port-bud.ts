/**
 * GODKJENNINGSPORTEN FOR BUDFASITEN.
 *
 *   node examples/moe2-port-bud.ts --givere 300
 *
 * SPØRSMÅLET. MoE2 lot budeksperten selektere på å treffe SD-orakelets bud.
 * To målinger sår tvil:
 *   - NevroHjerne bommer 2,61 stikk fra SD, et uniformt lovlig bud bommer
 *     2,22 – taket ligger under gulvet.
 *   - Nevro byr 5,66 i snitt mot SDs 8,78, henter hjem 8,92, innfrir 97 %,
 *     og vinner på poeng mot alt vi har bygget.
 *
 * Er SD-fasiten da riktig mål? Porten svarer, og den svarer også på noe jeg
 * har antatt hele dagen uten å teste: at lavt bud er en DEFEKT. Hvis poengene
 * topper seg under SD-nivået, var antakelsen min feil.
 *
 * METODEN. Bare budet varieres. Alt annet – vrak, trumfvalg, etterlysning og
 * hele kortspillet, i alle fire seter – gjøres av NevroHjerne. Da er det
 * ingenting annet som kan forklare poengforskjellen.
 *
 * Poeng måles TO ganger på uavhengige giversett, slik at referansens egen
 * pålitelighet kan beregnes. Uten det tallet er en lav korrelasjon tvetydig:
 * måler fasiten feil, eller er poeng bare støyete? Det var nøyaktig fellen
 * korrelasjonsmålingen gikk i tidligere i dag.
 */

import { writeFileSync } from "node:fs";

import {
  lovligeHandlinger,
  opprettSpill,
  utfør,
  type Bud,
  type GameState,
  type Handling,
} from "../src/index.ts";
import { analyserGiv, sdBud, tømCache } from "../src/neat/singledummy.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { prøvPorten } from "../src/moe2/port.ts";

let givere = 300;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--givere") givere = Number(process.argv[++i]);
}

const nevro = new NevroAgent();

/** En budpolicy: gitt stillingen og SD-estimatet, hvilket bud? */
interface Policy {
  readonly navn: string;
  readonly velg: (lovlige: readonly Bud[], sd: number) => Bud;
}

/** Høyeste lovlige tallbud som ikke overstiger `mål`; ellers PASS. */
function høyesteUnder(lovlige: readonly Bud[], mål: number): Bud {
  let valgt: Bud = "PASS";
  for (const b of lovlige) {
    if (typeof b === "number" && b <= mål && (valgt === "PASS" || b > valgt)) valgt = b;
  }
  return valgt;
}

const policyer: Policy[] = [
  { navn: "SD (fasiten)", velg: (l, sd) => høyesteUnder(l, sd) },
  { navn: "SD − 1", velg: (l, sd) => høyesteUnder(l, sd - 1) },
  { navn: "SD − 2", velg: (l, sd) => høyesteUnder(l, sd - 2) },
  { navn: "SD − 3", velg: (l, sd) => høyesteUnder(l, sd - 3) },
  { navn: "SD + 1", velg: (l, sd) => høyesteUnder(l, sd + 1) },
  { navn: "konstant 6", velg: (l) => høyesteUnder(l, 6) },
  { navn: "konstant 9", velg: (l) => høyesteUnder(l, 9) },
  { navn: "konstant 12", velg: (l) => høyesteUnder(l, 12) },
  { navn: "alltid pass", velg: () => "PASS" },
  { navn: "nevro selv", velg: () => "PASS" }, // erstattes under: nevro velger selv
];

/**
 * Spiller ett sete gjennom én runde. Budet i `sete` kommer fra policyen (unntatt
 * for «nevro selv», der nevro byr som vanlig). Alt annet er nevro.
 */
function énRunde(
  p: Policy,
  sete: number,
  frø: number,
): { poeng: number; bud: number | null; sd: number } {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  const analyse = analyserGiv(s, nevro);
  const sd = sdBud(analyse, sete, s.giving.antallStikk);
  let mittBud: number | null = null;
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
    let h: Handling;
    if (iTur === sete && s.fase === "BUDRUNDE" && p.navn !== "nevro selv") {
      const lov = lovligeHandlinger(s);
      const bud = lov.fase === "BUDRUNDE" ? p.velg(lov.bud, sd) : "PASS";
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
  poengA: number;
  poengB: number;
  poeng: number;
  budSnitt: number;
  andelBud: number;
}

const halv = Math.floor(givere / 2);
const rader: Rad[] = [];
for (const p of policyer) {
  let avvik = 0;
  let pa = 0;
  let pb = 0;
  let budSum = 0;
  let budN = 0;
  let n = 0;
  for (let f = 0; f < givere; f++) {
    // Ferskt giversett for hver halvdel, saa paaliteligheten kan maales.
    const frø = (f < halv ? 8_000_000 : 8_500_000) + f;
    for (let sete = 0; sete < 4; sete++) {
      const r = énRunde(p, sete, frø);
      // Fasiten: hvor langt budet ligger fra SD-orakelet. PASS teller som 0
      // bud, altsaa fullt avvik - aa la vaere aa by ER et avvik fra fasiten.
      avvik += Math.abs((r.bud ?? 0) - r.sd);
      if (r.bud !== null) {
        budSum += r.bud;
        budN++;
      }
      if (f < halv) pa += r.poeng;
      else pb += r.poeng;
      n++;
    }
  }
  const halvN = n / 2;
  rader.push({
    navn: p.navn,
    avvikFraSD: avvik / n,
    poengA: pa / halvN,
    poengB: pb / halvN,
    poeng: (pa + pb) / n,
    budSnitt: budN > 0 ? budSum / budN : NaN,
    andelBud: budN / n,
  });
  process.stdout.write(`\r  ${rader.length}/${policyer.length} maalt   `);
  tømCache();
}
console.log();

console.log(`\n=== Budpolicyer, ${givere} givere x 4 seter, alt annet er NevroHjerne ===\n`);
console.log(
  "policy".padEnd(15) + "avvik fra SD".padStart(14) + "snittbud".padStart(10) +
    "byr%".padStart(7) + "poeng/runde".padStart(13),
);
console.log("-".repeat(59));
for (const r of [...rader].sort((a, b) => b.poeng - a.poeng)) {
  console.log(
    r.navn.padEnd(15) +
      r.avvikFraSD.toFixed(3).padStart(14) +
      (Number.isNaN(r.budSnitt) ? "–" : r.budSnitt.toFixed(2)).padStart(10) +
      `${Math.round(100 * r.andelBud)} %`.padStart(7) +
      r.poeng.toFixed(2).padStart(13),
  );
}

// PORTEN. Fasiten er avvik fra SD (lavere er bedre), referansen er poeng
// (hoeyere er bedre) - altsaa motsatt retning.
const dom = prøvPorten({
  fasit: rader.map((r) => r.avvikFraSD),
  referanseA: rader.map((r) => r.poengA),
  referanseB: rader.map((r) => r.poengB),
  sammeRetning: false,
});

console.log(`\n=== GODKJENNINGSPORTEN ===`);
console.log(`  splitt-halv paalitelighet   ${dom.paalitelighet.toFixed(3)} (splitt ${dom.splitt.toFixed(3)})`);
console.log(`  observert korrelasjon       ${dom.observert.toFixed(3)}`);
console.log(`  dempingskorrigert           ${dom.korrigert.toFixed(3)}`);
console.log(`  DOM: ${dom.dom.toUpperCase()}`);
console.log(`  ${dom.begrunnelse}`);

/**
 * SMAL PORT. Den brede porten over inneholder «konstant 12» og «alltid pass»,
 * som taper 19 og 1,6 poeng. Aa skille dem fra SD er ingen kunst, og en
 * paalitelighet paa 1,000 er derfor ikke betryggende - den sier bare at
 * referansen klarer aa rangere fornuftig mot vanvittig.
 *
 * Det seleksjonen faktisk maa klare, er aa skille NAERLIGGENDE budpolicyer.
 * Derfor kjoeres porten en gang til paa bare dem.
 */
const smale = new Set(["SD (fasiten)", "SD − 1", "SD − 2", "konstant 9", "nevro selv"]);
const smal = rader.filter((r) => smale.has(r.navn));
const domSmal = prøvPorten({
  fasit: smal.map((r) => r.avvikFraSD),
  referanseA: smal.map((r) => r.poengA),
  referanseB: smal.map((r) => r.poengB),
  sammeRetning: false,
});
console.log(`
=== SMAL PORT (bare naerliggende policyer, n=${smal.length}) ===`);
console.log(`  paalitelighet ${domSmal.paalitelighet.toFixed(3)}, korrigert ${domSmal.korrigert.toFixed(3)}`);
console.log(`  DOM: ${domSmal.dom.toUpperCase()}`);
console.log(`  ${domSmal.begrunnelse}`);

writeFileSync(
  "analyse/moe2-port-bud.json",
  JSON.stringify({ givere, rader, dom, domSmal }, null, 2),
);
console.log(`\nSkrev analyse/moe2-port-bud.json`);
