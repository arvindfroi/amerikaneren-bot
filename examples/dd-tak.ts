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

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { NevroAgent, besteTrumf } from "../src/nevro/index.ts";
import { byggDDOppsett } from "../src/solver/sampler.ts";
import { rotVerdier, kortTilInt } from "../src/solver/dds.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";

let kamper = 150;
let kontrakt = 9;
let skardI = 0;
let skardN = 1;
let kandidatSpek = "vakt:ab:e1:e1-modell/sd-r2.bin";
let ut = "analyse/dd-tak-0.jsonl";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--kontrakt") kontrakt = Number(process.argv[++i]);
  else if (a === "--kandidat") kandidatSpek = process.argv[++i]!;
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
  const start = s;

  // Vår faktiske linje.
  g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    s = utfør(s, s.iTur === budsete ? fører.velgHandling(s) : nevro.velgHandling(s)).state;
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

  appendFileSync(ut, JSON.stringify({ frø, budsete, vårt, tak, sek: (Date.now() - t0) / 1000 }) + "\n");
  n++;
  process.stdout.write(`\r  skard ${skardI}: ${n} givere   `);
}
console.log(`\nSkard ${skardI} ferdig: ${n} givere → ${ut}`);
