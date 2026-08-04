/**
 * DØDEBLOKKEN (v8, indeks 458–469): de fire kortene som ALDRI kommer tilbake.
 *
 * ARVINDS OBSERVASJON, 4. august:
 *
 *   «forsvaret var ikke klar over at 4 kort hadde blitt hevet vekk. både
 *    forsvar og makker burde kunne tippe seg frem til det i løpet av spillet.
 *    de vet at man hiver ikke trumf.»
 *
 * HAN HAR RETT, OG FEILEN ER EKSAKT MÅLBAR. Giva er 4 × 12 kort pluss en
 * talong på 4. Budvinneren tar talongen og vraker fire kort, som er borte for
 * godt. Fra en forsvarers side finnes det altså 52 − 12 = 40 usette kort, men
 * bare 36 av dem kan ligge på en hånd. Troblokken regner
 *
 *     grense = min(usett[farge], kort igjen)
 *
 * og `usett` teller de fire døde med. Modellen tror derfor at kort som
 * beviselig er ute av spill fortsatt kan dukke opp – hver eneste runde, på
 * 10 % av de ukjente kortene.
 *
 * ===================== HVORFOR TRUMFTALLET BLIR EKSAKT ====================
 *
 * Ingen vraker trumf. Vraket skjer riktignok FØR trumfen meldes, men den som
 * vraker vet hvilken farge han skal melde, og å kaste fra den ville vært å
 * kaste kontrakten.
 *
 * MÅLT, ikke antatt: av 21 loggede runder med både vrak og trumf i
 * datainnsamlingen var det **null** som inneholdt et kort i trumffargen.
 *
 * Følgen er en slutning nesten uten slark: **antall usette trumf er antall
 * trumf igjen på hender.** For en forsvarer er det det viktigste enkelttallet
 * som finnes – det avgjør når motparten er tom for trumf og når egne sidefarger
 * begynner å stå. I dag må nettet gjette det gjennom en telling som er
 * systematisk for høy i tre av fire farger.
 *
 * ========================== HVA BLOKKEN INNEHOLDER ========================
 *
 *   LEVENDE-MIN per farge usett minus FLEST mulig døde i fargen – det som
 *                         garantert fortsatt ligger på en hånd.
 *   LEVENDE-MAKS          samme farge, men med FÆRREST mulig døde. For trumf
 *                         faller de to sammen – der er tallet eksakt. For
 *                         sidefargene får nettet et intervall i stedet for ett
 *                         systematisk for høyt tall.
 *   UTESTÅENDE TRUMF      ANSLAG over trumf på de skjulte hendene, bygget på at
 *                         ingen vraker trumf. Målt treffrate: 100 % med Adams
 *                         (vrakflagget `t`), 98 % med NevroHjerne, 21 av 21 i
 *                         loggede menneskerunder. Det er et anslag og ikke en
 *                         grense – grensene over antar ingenting om trumf.
 *   EGEN TRUMF og ANDEL   hvor stor del av den utestående trumfen jeg har.
 *                         Andelen er det forsvaret faktisk handler på: «de har
 *                         to igjen og jeg har begge» er en helt annen verden
 *                         enn «de har to og jeg har ingen».
 *   ER BUDVINNER          for budvinneren er vraket kjent, ikke gjettet, så
 *                         blokken betyr noe annet i det setet. Uten flagget
 *                         måtte nettet lære å skille det fra andre trekk.
 *
 * ============================ HVA DEN IKKE GJØR ===========================
 *
 * Den gjetter ikke HVILKE kort som er døde. Fordelingen mellom sidefargene er
 * ukjent, og et anslag der ville vært en modell inni en modell – nøyaktig
 * den slags som har strøket før i dette prosjektet. Blokken bærer bare det
 * som følger med sikkerhet av offentlig informasjon: antallet er fire, ingen
 * av dem er trumf, og resten er et intervall.
 *
 * KARDINALITET: tolv tall, alle skalert til [0, 1]. Ingen én-av-blokk over
 * kort, som var memoreringsfellen i minneblokken.
 */

import { FARGER, type Farge, type Kort } from "../kort.ts";
import type { GameState } from "../motor.ts";
import { fargeIndeks, kortIndeks } from "../nevro/trekk.ts";

/** v7-bredden denne blokken legger seg oppå. */
export const DØDE_FRA = 458;
/** 4 levende-min + 4 levende-maks + utestående trumf + egen trumf + andel + flagg. */
export const DØDE_ANTALL = 12;

/**
 * Fyller indeks 458–469.
 *
 * Krever `state` av samme grunn som troblokken: talongstørrelsen og hvem som
 * er budvinner finnes ikke i trekkvektoren.
 */
export function fyllDødeblokk(v: Float32Array, state: GameState, sete: number): void {
  const LEVENDE = DØDE_FRA;
  const LEVENDE_MAKS = DØDE_FRA + 4;
  const UTE_TRUMF = DØDE_FRA + 8;
  const EGEN_TRUMF = DØDE_FRA + 9;
  const ANDEL = DØDE_FRA + 10;
  const ER_BUDVINNER = DØDE_FRA + 11;

  // Før trumfen er valgt bærer blokken ingenting; nullene står da for «vet
  // ikke», som er sant.
  if (state.trumf === null || state.trumf === undefined) return;
  const trumfF = fargeIndeks(state.trumf);

  // SETT = egen hånd pluss alt som er spilt åpent. Samme definisjon som
  // troblokken bruker, med vilje: de to skal kunne leses mot hverandre.
  const stikkene = [
    ...state.historikk.map((s) => s.kort),
    ...(state.bord.length > 0 ? [state.bord] : []),
  ];
  const sett = new Set<number>();
  const egen = state.hender[sete] ?? [];
  for (const k of egen) sett.add(kortIndeks(k));
  for (const stikk of stikkene) for (const kp of stikk) sett.add(kortIndeks(kp.kort));

  // BUDVINNEREN SER SITT EGET VRAK. `state.vrak` er skjult for alle andre, og
  // å lese den for en forsvarer ville vært lekkasje av nøyaktig den
  // informasjonen blokken finnes for å SLUTTE seg til. Derfor står oppslaget
  // bak setesjekken, ikke ved siden av den.
  //
  // Testen fanget at jeg først antok noe galt her: etter vraket ligger kortene
  // verken på hånden eller i historikken, så de telles som usette også for den
  // som kastet dem. Uten dette leddet påsto blokken 13 utestående trumf der
  // det bare fantes 11.
  const erBudvinner = state.budvinner === sete;
  if (erBudvinner) for (const k of state.vrak) sett.add(kortIndeks(k));
  const døde = erBudvinner ? 0 : state.giving.talong;

  const usett = [0, 0, 0, 0];
  for (let f = 0; f < 4; f++) {
    const farge = FARGER[f] as Farge;
    for (let verdi = 2; verdi <= 14; verdi++) {
      if (!sett.has(kortIndeks({ farge, verdi } as Kort))) usett[f]!++;
    }
  }

  // GRENSENE ANTAR INGENTING OM TRUMF. Målt på 400 giver vraker NevroHjerne
  // en trumf i 2,0 % av dem. Adams gjør det aldri (vrakflagget `t`), og av 21
  // loggede menneskerunder gjorde ingen det – men en grense som lyver i 2 % av
  // tilfellene er verre enn en litt løsere som alltid holder, og den lyver
  // nettopp der det betyr noe: når føreren var desperat nok til å kaste trumf.
  //
  // Kunnskapen om at trumf normalt ikke vrakes ligger derfor i UTE_TRUMF, som
  // er et ANSLAG og merket som det – ikke i grensene.
  const totalUsett = usett[0]! + usett[1]! + usett[2]! + usett[3]!;
  for (let f = 0; f < 4; f++) {
    // MEST MULIG DØDT i fargen: alle de døde, men aldri flere enn som finnes.
    const dødMaks = Math.min(døde, usett[f]!);
    // MINST MULIG DØDT: har de ANDRE fargene til sammen færre usette enn
    // talongen, må resten nødvendigvis ligge her. Den slutningen biter sent i
    // spillet, når fargene tømmes og det plutselig er avgjort hvor de døde lå.
    const dødMin = Math.max(0, døde - (totalUsett - usett[f]!));
    v[LEVENDE + f] = (usett[f]! - dødMaks) / 13;
    v[LEVENDE_MAKS + f] = (usett[f]! - dødMin) / 13;
  }

  // ANSLAGET, ikke en grense: alt usett i trumffargen ligger på en hånd,
  // fordi ingen vraker trumf. Målt feilrate 2,0 % med NevroHjerne som vraker,
  // 0 % med Adams (flagget `t`) og 0 av 21 i loggede menneskerunder. Nettet
  // får tallet skarpt og kan lære hvor mye det skal stole på det – det er en
  // annen sak enn å legge usannheten inn i en grense.
  const uteTrumf = usett[trumfF]!;
  const egenTrumf = egen.filter((k) => fargeIndeks(k.farge) === trumfF).length;
  v[UTE_TRUMF] = uteTrumf / 13;
  v[EGEN_TRUMF] = egenTrumf / 13;
  // ANDELEN er det forsvaret handler på. Er ingenting utestående, er andelen
  // 1: da er all gjenværende trumf min, og det er den riktige lesningen.
  v[ANDEL] = uteTrumf + egenTrumf === 0 ? 0 : egenTrumf / (uteTrumf + egenTrumf);
  v[ER_BUDVINNER] = erBudvinner ? 1 : 0;
}
