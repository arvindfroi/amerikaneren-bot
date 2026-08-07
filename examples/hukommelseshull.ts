/**
 * HAR BOTEN VÅR ET HUKOMMELSESHULL?
 *
 *   node examples/hukommelseshull.ts --kamper 300
 *
 * Arvind vil at boten skal ha en hukommelse som gir den et fortrinn. Før vi
 * bygger noe: FINNES det et hull? Denne måler det, den fikser ingenting.
 *
 * MISTANKEN. `e1SpillTrekk` utleder «hvilke kort er fortsatt ute» av egen hånd
 * pluss de åpent spilte kortene. Men budvinneren tok opp talongen og vraket
 * fire kort. De fire er DØDE – de kan ikke ligge på noen hånd – og budvinneren
 * er den eneste som vet hvilke. Trekkuttrekket vårt får dem aldri.
 *
 * Følgen er ikke abstrakt. Vraker budvinneren spar ess, tror nettet fortsatt
 * at spar ess er ute og at spar konge kan bli slått. Det er nøyaktig den
 * feilen et menneske IKKE gjør: man husker hva man selv kastet.
 *
 * MÅLT HER, per stilling der budvinneren skal spille et kort:
 *   1. hvor ofte «høyeste kort ute» i en farge i virkeligheten er vraket selv
 *   2. hvor mange av de «utestående» kortene som egentlig er døde
 *   3. det samme sett fra en FORSVARER: der er de fire døde ukjente, men
 *      ANTALLET er kjent – 4 av de usette kortene finnes ikke. Også det
 *      mangler i kodingen, og gjelder alle fire setene.
 *
 * Alt her er lovlig informasjon. Ingen skjulte hender leses.
 */

import { writeFileSync } from "node:fs";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { FARGER, type Farge } from "../src/kort.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";

let kamper = 300;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--kamper") kamper = Number(process.argv[++i]);
}

const SPEK = "vakt:ab:e1:e1-modell/d7alle.bin";
const vakt = delVaktspek(SPEK)!;
const nett = lesE1Nett(vakt.indre.slice(3));
const nevro = new NevroAgent();

/** Kort budvinneren SELV vet er døde, men som kodingen ikke får vite om. */
const nøkkel = (f: Farge, v: number): string => `${f}${v}`;

let stillinger = 0;
/** Stillinger der minst én farges «høyeste ute» egentlig er vraket selv. */
let spøkelseshøyest = 0;
/** Fargeforekomster (stilling × farge) med samme feil. */
let spøkelsesfarger = 0;
let fargeforekomster = 0;
/** Døde kort talt som «ute», summert. */
let dødeTaltSomUte = 0;
/** Hvor mange av vrakets kort som er honnører (verdi ≥ 11). */
let vrakHonnør = 0;
let vrakTotalt = 0;

/** Samme spørsmål for et forsvarersete: de 4 døde er ukjente, men finnes. */
let forsvarStillinger = 0;
let forsvarDødeTaltSomUte = 0;

for (let f = 0; f < kamper; f++) {
  const frø = 3_300_000 + f;
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  const bot = new Konvensjonsvakt(new E1Agent(nett), vakt.valg);
  bot.nyKamp();
  const budsete = frø % 4;

  let g = 0;
  while (s.fase === "BUDRUNDE" && s.iTur !== budsete && g++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  if (s.fase !== "BUDRUNDE" || s.iTur !== budsete) continue;
  try {
    s = utfør(s, { type: "BUD", spiller: budsete, bud: 9 }).state;
  } catch {
    continue;
  }
  g = 0;
  while (s.fase === "BUDRUNDE" && g++ < 8) s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;

  g = 0;
  while ((s.fase === "VRAK" || s.fase === "VELG") && g++ < 20) {
    s = utfør(s, s.budvinner === budsete ? bot.velgHandling(s) : nevro.velgHandling(s)).state;
  }
  if (s.fase !== "SPILL") continue;

  const vrak = s.vrak.slice();
  if (vrak.length === 0) continue;
  vrakTotalt += vrak.length;
  for (const k of vrak) if (k.verdi >= 11) vrakHonnør++;
  const døde = new Set(vrak.map((k) => nøkkel(k.farge, k.verdi)));

  g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = s.iTur!;
    const hånd = s.hender[iTur] ?? [];

    // Nøyaktig det `e1SpillTrekk` regner ut: sett = egen hånd + åpent spilte.
    const sett = new Set<string>();
    for (const k of hånd) sett.add(nøkkel(k.farge, k.verdi));
    for (const stikk of s.historikk) for (const kp of stikk.kort) sett.add(nøkkel(kp.kort.farge, kp.kort.verdi));
    for (const kp of s.bord) sett.add(nøkkel(kp.kort.farge, kp.kort.verdi));

    let dødeUte = 0;
    for (const d of døde) if (!sett.has(d)) dødeUte++;

    if (iTur === s.budvinner) {
      stillinger++;
      dødeTaltSomUte += dødeUte;
      let feilFarge = false;
      for (const farge of FARGER as readonly Farge[]) {
        // Er det noe å ta feil av i denne fargen?
        let høyestUte = 0;
        for (let v = 14; v >= 2; v--) {
          if (!sett.has(nøkkel(farge, v))) { høyestUte = v; break; }
        }
        if (høyestUte === 0) continue;
        fargeforekomster++;
        // Er det «høyeste ute» i virkeligheten et kort budvinneren vraket selv?
        if (døde.has(nøkkel(farge, høyestUte))) { spøkelsesfarger++; feilFarge = true; }
      }
      if (feilFarge) spøkelseshøyest++;
    } else {
      forsvarStillinger++;
      forsvarDødeTaltSomUte += dødeUte;
    }

    s = utfør(s, iTur === budsete || iTur === s.makker ? bot.velgHandling(s) : nevro.velgHandling(s)).state;
  }
}

const pst = (a: number, b: number): string => `${((100 * a) / Math.max(1, b)).toFixed(1)} %`;
const linjer = [
  `\n=== Hukommelseshullet i E1s trekkuttrekk ===`,
  `${kamper} givere, kontrakt 9, budvinner spilt av ${SPEK}.`,
  ``,
  `VRAKET SELV (kjent bare for budvinneren, aldri kodet):`,
  `  honnørandel i vraket (V/D/K/E)          ${pst(vrakHonnør, vrakTotalt)}  (${vrakHonnør}/${vrakTotalt})`,
  ``,
  `SETT FRA BUDVINNEREN – ${stillinger} kortvalg:`,
  `  stillinger der «høyeste ute» i minst én`,
  `  farge egentlig er vraket av en selv     ${pst(spøkelseshøyest, stillinger)}`,
  `  det samme talt per farge                ${pst(spøkelsesfarger, fargeforekomster)}  (${spøkelsesfarger}/${fargeforekomster})`,
  `  døde kort talt som «ute», per stilling  ${(dødeTaltSomUte / Math.max(1, stillinger)).toFixed(2)} av 4`,
  ``,
  `SETT FRA ET FORSVARERSETE – ${forsvarStillinger} kortvalg:`,
  `  døde kort talt som «ute», per stilling  ${(forsvarDødeTaltSomUte / Math.max(1, forsvarStillinger)).toFixed(2)} av 4`,
  `  (forsvareren vet ikke HVILKE fire, men vet at de finnes – heller ikke`,
  `   det antallet er kodet i dag.)`,
  ``,
  `LESEVEILEDNING. Dette er et hull i INFORMASJONEN nettet får, ikke et målt`,
  `tap i stikk. At hullet finnes betyr ikke at det koster noe – det må måles`,
  `for seg. Men det er lovlig informasjon vi kaster bort, og et menneske ved`,
  `bordet kaster den ikke: man husker hva man selv la ned.`,
];
console.log(linjer.join("\n"));
writeFileSync("analyse/hukommelseshull.txt", linjer.join("\n") + "\n");
