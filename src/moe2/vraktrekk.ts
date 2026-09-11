/**
 * TREKKENE FOR ET (TRUMF, VRAK)-PAR — inngangen til en LÆRT vrakvelger.
 *
 * HVORFOR IKKE SØK. Arvind: «når det kommer til vrak og trumf komboen så bør
 * det ikke være søk.» Målingen sier det samme, presist: `examples/vrakbenk.ts`
 * på 3 000 budvinnerrunder ga søket **−0,5119 ± 0,2501** mot NevroHjerne, med
 * trimmet snitt og tegntest enige.
 *
 * Årsaken er strukturell og lar seg ikke pakke bort. Ved vrak er ingenting
 * spilt, så verdensrommet er 3,8 × 10¹⁴ (målt, §19). `argmax` over 28
 * kandidater à 24 trukne verdener plukker den som fikk de snilleste verdenene,
 * og skjevheten VOKSER med antall kandidater.
 *
 * MEN STØYEN ER ET SANNTIDSPROBLEM, IKKE ET LÆRINGSPROBLEM. Det er nøyaktig
 * lærdommen fra kortspillet 4. august: orakelet SPILLER forsvar dårligere enn
 * nettet (−0,09), men å LÆRE av det ga +0,187 ± 0,061. Destillasjon midler
 * støyen over tusenvis av rader; argmax i sanntid gjør det ikke.
 *
 * Derfor: merk paret offline med mange verdener, lær sammenhengen, og velg ved
 * spilletid med ett framoverpass. Ingen sampling, ingen forbannelse — og raskt
 * nok for nettleseren, som dagens søk aldri kunne blitt.
 *
 * TREKKENE er valgt så de beskriver hånden ETTER vraket, sett fra trumfen:
 *
 *   0–3    lengde i trumf, og i de tre sidefargene sortert lengst først
 *   4–7    ess, konger, damer, knekter i trumf
 *   8–11   ess, konger, damer, knekter utenfor trumf
 *   12–15  antall renonser, singletoner, doubletoner, femkortsfarger
 *   16     høyeste trumf jeg har
 *   17     trumf UTE (13 minus mine)
 *   18     kontrakten vi vant på
 *   19–21  hva de tre andre bød, relativt, sortert høyest først
 *   22     hvor mange som bød i det hele tatt
 *   23     bias
 *
 * Alt er lovlig informasjon budvinneren har ved vraket, og «hva de andre bød»
 * er med fordi Arvind ba om det: «den må vite hva alle har bydd og hva vi vant
 * byinga på».
 */

import { FARGER, type Farge, type Kort } from "../kort.ts";
import { lovligeEtterlys, type GameState } from "../motor.ts";

export const VRAK_DIM = 24;
/**
 * VRAKQ V2 (11. sep, K5): de 24 trekkene + KAMPSTILLINGEN bakerst – egne poeng og beste
 * motstanders poeng (/målPoeng) og rundenummeret (/20, klemt), nøyaktig som `budqTrekk`.
 * Uten dem kan et vraknett trent mot seiersmålet ikke lære at samme hånd bør vrakes
 * dristigere når man ligger bak. Et 24-nett utvidet med nullkolonner velger likt.
 */
export const VRAK_DIM_K = VRAK_DIM + 3;

/** `vraktrekk` med kampstillingen bakerst (`VRAK_DIM_K`). Offentlig informasjon: poengtavla. */
export function vraktrekkK(
  state: GameState,
  sete: number,
  hånd: readonly Kort[],
  vrak: readonly Kort[],
  trumf: Farge,
): Float32Array {
  const v = new Float32Array(VRAK_DIM_K);
  v.set(vraktrekk(state, sete, hånd, vrak, trumf), 0);
  const mål = state.regler.målPoeng;
  let beste = -Infinity;
  for (let p = 0; p < state.antallSpillere; p++) if (p !== sete) beste = Math.max(beste, state.totalPoeng[p] ?? 0);
  v[VRAK_DIM] = (state.totalPoeng[sete] ?? 0) / mål;
  v[VRAK_DIM + 1] = beste / mål;
  v[VRAK_DIM + 2] = Math.min(1, state.rundeNr / 20);
  return v;
}

/**
 * Trekkene for hånden som blir igjen når `vrak` er kastet og `trumf` valgt.
 *
 * `hånd` er de 16 kortene FØR vraket; funksjonen trekker fra selv, slik at
 * kalleren ikke kan komme til å sende inn en hånd som ikke stemmer med vraket.
 */
export function vraktrekk(
  state: GameState,
  sete: number,
  hånd: readonly Kort[],
  vrak: readonly Kort[],
  trumf: Farge,
): Float32Array {
  const kastet = new Set(vrak.map((k) => `${k.farge}${k.verdi}`));
  const igjen = hånd.filter((k) => !kastet.has(`${k.farge}${k.verdi}`));

  const v = new Float32Array(VRAK_DIM);
  const perFarge = new Map<Farge, Kort[]>();
  for (const f of FARGER) perFarge.set(f, []);
  for (const k of igjen) perFarge.get(k.farge)!.push(k);

  const trumfKort = perFarge.get(trumf)!;
  const side = FARGER.filter((f) => f !== trumf)
    .map((f) => perFarge.get(f)!)
    .sort((a, b) => b.length - a.length);

  v[0] = trumfKort.length / 13;
  for (let i = 0; i < 3; i++) v[1 + i] = (side[i]?.length ?? 0) / 13;

  const tell = (ks: readonly Kort[], verdi: number): number =>
    ks.filter((k) => k.verdi === verdi).length;
  for (let i = 0; i < 4; i++) v[4 + i] = tell(trumfKort, 14 - i) / 4;
  const utenfor = igjen.filter((k) => k.farge !== trumf);
  for (let i = 0; i < 4; i++) v[8 + i] = tell(utenfor, 14 - i) / 4;

  let renonse = 0;
  let singel = 0;
  let dobbel = 0;
  let lang = 0;
  for (const ks of side) {
    if (ks.length === 0) renonse++;
    else if (ks.length === 1) singel++;
    else if (ks.length === 2) dobbel++;
    if (ks.length >= 5) lang++;
  }
  v[12] = renonse / 3;
  v[13] = singel / 3;
  v[14] = dobbel / 3;
  v[15] = lang / 3;

  let høyest = 0;
  for (const k of trumfKort) høyest = Math.max(høyest, k.verdi);
  v[16] = høyest === 0 ? 0 : (høyest - 1) / 13;
  // TRUMF UTE er 13 minus mine. Vraket kan inneholde trumf når policyen
  // tillater det, og de er da DØDE - men motparten vet det ikke, så tallet
  // her er det budvinneren faktisk kan regne med å møte.
  v[17] = Math.max(0, 13 - trumfKort.length) / 13;

  const bud = state.budrunde.høyeste;
  v[18] = bud !== null && typeof bud.bud === "number" ? bud.bud / 13 : 0;

  // HVA DE ANDRE BØD, sortert høyest først. Relativt, ikke per sete: hvem som
  // bød hva betyr mindre enn HVOR HØYT noen bød, og sortering gir en koding
  // som ikke avhenger av seteplassering.
  const andres: number[] = [];
  let bød = 0;
  for (let p = 0; p < 4; p++) {
    if (p === sete) continue;
    const b = state.budrunde.sisteBud[p];
    if (typeof b === "number") {
      andres.push(b);
      bød++;
    } else andres.push(0);
  }
  andres.sort((a, b) => b - a);
  for (let i = 0; i < 3; i++) v[19 + i] = (andres[i] ?? 0) / 13;
  v[22] = bød / 3;
  v[23] = 1;
  return v;
}

/**
 * ============ ETTERLYSNINGEN SOM ET LÆRT VALG (K3.5/K3.8, 11. sep) ============
 *
 * Det kalte kortet var den siste HÅNDREGELEN i vrak/trumf-kjeden: «høyeste lovlige».
 * Den ble målt best blant FASTE nivåer 4. august (nest høyeste −0,911, tredje −1,641),
 * men et fast nivå er ikke en lært beslutning – det sier bare at ett nivå for alle hender
 * slår et annet nivå for alle hender. Avveiningen er ekte og avhenger av hånden (se
 * `etterlys.ts`): høyt kall gir sterkest samlet trumf, lavere kall holder makkeren skjult.
 *
 * KANDIDATENE ER KAPPET (`ETTERLYST_MAKS`): de tre høyeste lovlige – nøyaktig nivåene som
 * ble målt – pluss den LAVESTE lovlige, den andre ytterkanten av hemmeligholdet. Et åpent
 * sett på opptil 13 ville gjentatt vrakforbannelsen: argmax over mange kandidater plukker
 * den nettet overvurderer mest. Samme sett merkes offline og velges fra ved spilletid.
 *
 * `lovligeEtterlys` begrenser kallet til TRUMFFARGEN, så «er kortet trumf?» er alltid ja og
 * er ikke et trekk; fargens lengde på hånden er trumflengden (10).
 */
export const ETTERLYST_MAKS = 4;

/**
 * Bredden er med vilje ULIK `VRAK_DIM` (24) og `VRAK_DIM_K` (27): et etterlystnett sendt inn
 * som vraknett – eller omvendt – avvises på bredden i stedet for å gi tause søppelvalg.
 */
export const ETTERLYST_DIM = 25;

/**
 * Kandidatsettet for kallet, HØYESTE FØRST (indeks 0 = dagens regel).
 *
 * Tomt når budvinneren har eller har vraket hver trumf – da er kallet `null`, som før.
 */
export function etterlystKandidater(state: GameState, trumf: Farge): Kort[] {
  const lovlige = lovligeEtterlys(state, trumf); // stigende
  const ned = lovlige.slice().reverse();
  const ut = ned.slice(0, ETTERLYST_MAKS - 1);
  const lavest = ned[ned.length - 1];
  if (lavest !== undefined && !ut.includes(lavest)) ut.push(lavest);
  return ut;
}

/**
 * Trekkene for å kalle `kort` i VELG-fasen, sett fra budvinneren `sete`.
 *
 * `state` er VELG-tilstanden: hånden er ETTER vraket (`hender[sete]`) og `state.vrak` er
 * budvinnerens eget vrak. Både merkingen (`examples/vrakq-data.ts`, som utfører det tvungne
 * vraket først) og `Vrakrangerer` kaller den på en slik tilstand, så trekkene er de samme
 * offline og ved spilletid.
 *
 * K2 – BARE DET BUDVINNEREN VET: egen hånd, eget vrak, trumfen, meldingen og poengtavla.
 * Ingen andre hender, ingen `makker` (motoren setter den først ved VELG, og den er skjult).
 *
 *   0–3    nivå blant ALLE lovlige kall, én-varm: høyeste, nest, tredje, lavere
 *   4      nivå / 12 (0 = høyeste lovlige)
 *   5      kortets valør, (v − 2) / 12
 *   6      egne trumf HØYERE enn kortet / 13
 *   7      egne trumf LAVERE enn kortet / 13
 *   8      trumf i eget vrak / 13 (døde, men motparten vet det ikke)
 *   9      trumf i eget vrak høyere enn kortet / 13
 *   10     antall lovlige kall / 13 (= trumf jeg verken har eller har vraket)
 *   11     trumflengde på hånden / 13
 *   12     høyeste egne trumf, (v − 1) / 13, eller 0
 *   13     tallbudet / 13 (0 ved amerikaner og solo)
 *   14     amerikaner
 *   15     solo (kallet gir da ingen makker)
 *   16–18  renonser, singletoner, doubletoner i sidefargene / 3
 *   19–20  ess og konger utenfor trumf / 4
 *   21–22  egne poeng og beste motstanders poeng / målPoeng
 *   23     rundenummer / 20, klemt
 *   24     bias
 */
export function etterlystTrekk(state: GameState, sete: number, trumf: Farge, kort: Kort): Float32Array {
  const v = new Float32Array(ETTERLYST_DIM);
  const hånd = state.hender[sete] ?? [];
  const lovlige = lovligeEtterlys(state, trumf); // stigende
  let høyere = 0;
  for (const k of lovlige) if (k.verdi > kort.verdi) høyere++;
  v[Math.min(3, høyere)] = 1;
  v[4] = høyere / 12;
  v[5] = (kort.verdi - 2) / 12;

  let egneHøyere = 0;
  let egneLavere = 0;
  let høyest = 0;
  for (const k of hånd) {
    if (k.farge !== trumf) continue;
    if (k.verdi > kort.verdi) egneHøyere++;
    else egneLavere++;
    høyest = Math.max(høyest, k.verdi);
  }
  v[6] = egneHøyere / 13;
  v[7] = egneLavere / 13;
  let vraketTrumf = 0;
  let vraketHøyere = 0;
  for (const k of state.vrak) {
    if (k.farge !== trumf) continue;
    vraketTrumf++;
    if (k.verdi > kort.verdi) vraketHøyere++;
  }
  v[8] = vraketTrumf / 13;
  v[9] = vraketHøyere / 13;
  v[10] = lovlige.length / 13;
  v[11] = (egneHøyere + egneLavere) / 13;
  v[12] = høyest === 0 ? 0 : (høyest - 1) / 13;

  const m = state.melding;
  v[13] = m !== null && m.type === "tall" ? m.bud / 13 : 0;
  v[14] = m !== null && m.type === "amerikaner" ? 1 : 0;
  v[15] = m !== null && m.type === "solo" ? 1 : 0;

  let renonse = 0;
  let singel = 0;
  let dobbel = 0;
  for (const f of FARGER) {
    if (f === trumf) continue;
    const n = hånd.filter((k) => k.farge === f).length;
    if (n === 0) renonse++;
    else if (n === 1) singel++;
    else if (n === 2) dobbel++;
  }
  v[16] = renonse / 3;
  v[17] = singel / 3;
  v[18] = dobbel / 3;
  v[19] = hånd.filter((k) => k.farge !== trumf && k.verdi === 14).length / 4;
  v[20] = hånd.filter((k) => k.farge !== trumf && k.verdi === 13).length / 4;

  const mål = state.regler.målPoeng;
  let beste = -Infinity;
  for (let p = 0; p < state.antallSpillere; p++) if (p !== sete) beste = Math.max(beste, state.totalPoeng[p] ?? 0);
  v[21] = (state.totalPoeng[sete] ?? 0) / mål;
  v[22] = beste / mål;
  v[23] = Math.min(1, state.rundeNr / 20);
  v[24] = 1;
  return v;
}
