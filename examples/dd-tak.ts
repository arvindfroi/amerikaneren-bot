/**
 * DET EKTE TAKET: full dobbelt-dummy på den VIRKELIGE giva.
 *
 *   node examples/dd-tak.ts --skard 0/6 --kamper 150
 *
 * HVORFOR DENNE FINNES – og hva som var galt før. I `perfeksjon-per-stikk.ts`
 * kalte jeg `solverBesteKort(..., {verdener: 3, dybde: 3})` for det «juksende
 * orakelet». Det var feil: den funksjonen SAMPLER tre verdener og søker til
 * dybde tre. Den ser ikke de virkelige hendene, og den er grunn. Den er et
 * svakt alternativt spill, ikke et tak – og den målte da også −0,806, altså
 * dårligere enn boten vår.
 *
 * Her bygges verdenen fra `state.hender` SLIK DEN FAKTISK ER, og `rotVerdier`
 * løser den eksakt. Det er det ekte taket: hva budlaget kunne tatt om alle
 * fire spilte perfekt med alle kort på bordet.
 *
 * TAKET ER MED VILJE UOPPNÅELIG. Det forutsetter informasjon ingen spiller
 * kan ha, så avstanden opp dit er IKKE bare ferdighet. Nytten er å bracketere:
 * ligger vi tett under, er det lite igjen å hente uansett metode; ligger vi
 * langt under, vet vi i hvert fall at rommet finnes. Kombinert med det lovlige
 * orakelet (SD) deler det gapet i «ferdighet» og «informasjon».
 *
 * KOSTNAD: ~55 sekunder per giv ved spillets start. Derfor skard, og derfor
 * beskjedne n. Skriv til fil linje for linje – en kjøring på timer skal ikke
 * kunne miste alt på et avbrudd.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { NevroAgent, besteTrumf } from "../src/nevro/index.ts";
import { byggDDOppsett } from "../src/solver/sampler.ts";
import { rotVerdier, kortTilInt } from "../src/solver/dds.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";

let kamper = 150;
let kontrakt = 9;
let skardI = 0;
let skardN = 1;
let kandidatSpek = "vakt:ab:e1:e1-modell/d7alle.bin";
let fraStikk = 3;
/**
 * FORSVARSMODUS. Settes den, spiller HOVEDKANDIDATEN baade budvinner- og
 * makkersetet OG det ene forsvarssetet, mens dette setet spilles av spec-en
 * her. Da er alt annet holdt fast, og forskjellen i `vaart` mellom to
 * kjoeringer med ulik `--forsvarer` isolerer forsvarskvaliteten mot ETT og
 * samme DD-tak.
 *
 * Merk hva `vaart - tak` betyr her: DD loeser med BEGGE sider perfekte, saa
 * tallet blander vaart forsvars svakhet med spillefoererens. Det er
 * DIFFERANSEN mellom to forsvarere som er ren.
 */
let forsvarerSpek: string | null = null;
let ut = "analyse/dd-tak-0.jsonl";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--kontrakt") kontrakt = Number(process.argv[++i]);
  else if (a === "--kandidat") kandidatSpek = process.argv[++i]!;
  else if (a === "--fraStikk") fraStikk = Number(process.argv[++i]);
  else if (a === "--forsvarer") forsvarerSpek = process.argv[++i]!;
  else if (a === "--ut") ut = process.argv[++i]!;
  else if (a === "--skard") {
    const [x, y] = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(x);
    skardN = Number(y);
  }
}
mkdirSync(dirname(ut), { recursive: true });

const vakt = delVaktspek(kandidatSpek)!;
const nett = lesE1Nett(vakt.indre.slice(3));
const nevro = new NevroAgent();
function lagAgent(spec: string): { velgHandling(s: GameState): Handling; nyKamp(): void } {
  const v = delVaktspek(spec);
  if (v !== null) return new Konvensjonsvakt(lagAgent(v.indre), v.valg);
  if (spec === "nevro") return new NevroAgent();
  if (spec.startsWith("e1:")) return new E1Agent(lesE1Nett(spec.slice(3)));
  throw new Error("ukjent agentspesifikasjon: "+spec);
}

function oppsett(frø: number, budsete: number): GameState | null {
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  let g = 0;
  while (s.fase === "BUDRUNDE" && s.iTur !== budsete && g++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  if (s.fase !== "BUDRUNDE" || s.iTur !== budsete) return null;
  if (besteTrumf(s.hender[budsete] ?? []).estimat < kontrakt - 3.5) return null;
  try {
    s = utfør(s, { type: "BUD", spiller: budsete, bud: kontrakt }).state;
  } catch {
    return null;
  }
  g = 0;
  while (s.fase === "BUDRUNDE" && g++ < 8) s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  return s.fase === "BUDRUNDE" ? null : s;
}

let n = 0;
for (let f = 0; f < kamper; f++) {
  if (f % skardN !== skardI) continue;
  const frø = 2_100_000 + f; // SAMME frørom som perfeksjon-per-stikk, så
  // taket og perfeksjonsverdiene gjelder de samme givene.
  const budsete = frø % 4;
  let s = oppsett(frø, budsete);
  if (s === null) continue;

  // Vrak og trumfvalg gjøres av kandidaten, slik at taket måles fra NØYAKTIG
  // den stillingen kortspillet vårt starter i. Ellers ville taket inkludert
  // en annen trumf enn den vi faktisk spiller.
  const fører = new Konvensjonsvakt(new E1Agent(nett), vakt.valg);
  fører.nyKamp();
  let g = 0;
  while ((s.fase === "VRAK" || s.fase === "VELG") && g++ < 20) {
    s = utfør(s, s.budvinner === budsete ? fører.velgHandling(s) : nevro.velgHandling(s)).state;
  }
  if (s.fase !== "SPILL") continue;

  /**
   * SETEFORDELINGEN. I spillefører­modus er det bare budsetet som er vårt.
   * I forsvarsmodus holdes ALT annet fast på hovedkandidaten – budvinner,
   * makker og den ene medforsvareren – slik at det eneste som varierer
   * mellom to kjøringer er det ene forsvarssetet. Da er differansen i `vårt`
   * ren forsvarskvalitet, målt mot ett og samme DD-tak.
   */
  const testsete = forsvarerSpek === null
    ? budsete
    : [0, 1, 2, 3].find((p) => p !== budsete && p !== s!.makker)!;
  const underTest = forsvarerSpek === null ? fører : lagAgent(forsvarerSpek);
  const resten = lagAgent(kandidatSpek);
  underTest.nyKamp();
  resten.nyKamp();
  const velgFor = (st: GameState, sete: number): Handling =>
    sete === testsete
      ? underTest.velgHandling(st)
      : forsvarerSpek === null
        ? nevro.velgHandling(st)
        : resten.velgHandling(st);

  // SPILL FØRST `fraStikk` STIKK NORMALT. Full DD fra stikk 1 er 48 kort og
  // sprenger 4 GB heap – seks skard krasjet på nøyaktig det. Fra stikk 4 er
  // stillingen 9 kort per hånd og løses på 61 ms. Taket måles derfor fra der,
  // og er da «hva som var å hente FRA denne stillingen», gitt at åpningen ble
  // spilt som vi spiller den. Det er et ærligere spørsmål uansett: åpningen
  // er den delen vakten alt har fikset.
  g = 0;
  while (s.fase === "SPILL" && s.stikkSpilt < fraStikk && g++ < 400) {
    s = utfør(s, velgFor(s, s.iTur!)).state;
  }
  if (s.fase !== "SPILL") continue;
  const start = s;
  const stikkFør = (start.stikkVunnet[budsete] ?? 0) +
    (start.makker !== null ? (start.stikkVunnet[start.makker] ?? 0) : 0);

  // Vår faktiske linje videre.
  g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    s = utfør(s, velgFor(s, s.iTur!)).state;
  }
  const stikk = s.stikkVunnet;
  const vårt = (stikk[budsete] ?? 0) + (s.makker !== null ? (stikk[s.makker] ?? 0) : 0);

  // Taket: den VIRKELIGE verdenen, løst eksakt.
  const verden = {
    hender: start.hender.map((h) => h.map(kortTilInt)),
    declLag: [0, 1, 2, 3].map((p) => p === start.budvinner || p === start.makker),
    makkerVerden: start.makker,
  };
  const t0 = Date.now();
  const rot = rotVerdier(byggDDOppsett(start, verden));
  const tak = Math.max(...rot.map((r) => r.lagStikk));

  appendFileSync(
    ut,
    JSON.stringify({ frø, budsete, testsete, fraStikk, stikkFør, vårt, tak, sek: (Date.now() - t0) / 1000 }) + "\n",
  );
  n++;
  process.stdout.write(`\r  skard ${skardI}: ${n} givere   `);
}
console.log(`\nSkard ${skardI} ferdig: ${n} givere → ${ut}`);
