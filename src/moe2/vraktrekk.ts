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
import type { GameState } from "../motor.ts";

export const VRAK_DIM = 24;

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
