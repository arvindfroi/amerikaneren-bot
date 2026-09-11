/**
 * MLB — «VET» MOT «TROR» (K8, 11. sep).
 *
 * Trohodet (`tronett.ts`) gir en softmax over fire klasser per kort: relativt sete
 * 1, 2, 3 og talongen. Softmax er aldri null, så nettet legger ALLTID litt masse på
 * plasseringer setet VET er umulige: et sete som ikke fulgte farge, et sete uten
 * kort igjen, talongen for budvinneren som selv vraket. Den gamle verdenstrekkeren
 * (`src/solver/sampler.ts`) håndhever alt dette, så søkeverdenene har vært lovlige —
 * men K8-tallet (`examples/mlb-k8.ts`, armen `nett`) og MLB-søkets trekker
 * (`sok.ts`) har ikke gjort det. Da måles troen som om den ikke visste det enhver
 * spiller ved bordet vet, og tapet på de umulige klassene er ren straff for noe
 * reglene alt har avgjort.
 *
 * Denne fila skiller de to: `trofakta` regner ut det setet VET, `maskerFordeling`
 * fjerner det nettet TROR i strid med det. Alt er av som standard;
 * `MlbTronett.fordeling` er bit-identisk med før.
 *
 * ===================== K2 ER STRUKTURELL, SOM I TROTREKK =================
 *
 * Inngangen er en `SpillerVisning`, ikke en `GameState`. Motoren har allerede tatt
 * bort andres hender, talongen, andres vrak og uavslørt makker, så en regel her kan
 * ikke lese skjulte kort uten å endre signaturen. `test/mlb-trofakta.test.ts` bytter i
 * tillegg ut de skjulte hendene og krever identiske fakta.
 *
 * ===================== HVORFOR IKKE IMPORTERE `infererRenonce` ==========
 *
 * `src/solver/sampler.ts` har slutningen, men `src/mlb/` skal aldri nå `src/solver/`
 * (`test/mlb-herkomst.test.ts`: dobbeltdummy ser alle fire hender). Renonsregelen er
 * fire linjer og gjenskapes her, på `SpillerVisning` i stedet for `GameState`.
 *
 * ===================== FAKTAENE, OG REGELEN HVERT HVILER PÅ ==============
 *
 *   RENONS          et sete som la en annen farge enn den som ble spilt ut, har ikke
 *                   den fargen (`lovligeKort`: må følge farge). Kort går aldri TILBAKE
 *                   til en hånd, så renonsen varer runden ut.
 *   UTSPILLSPLIKT   budvinneren MÅ åpne stikk 1 med trumf om hun har trumf
 *                   (`lovligeKort`, tomt bord). Åpnet hun med en annen farge, er hun
 *                   renons i trumf. Den gamle trekkeren ser ikke denne.
 *   TOM HÅND        et sete med 0 kort igjen (`antallKort`, offentlig) har ingen av dem.
 *   TALONGEN        døde plasser = usette − Σ kort på de andre hendene. Er det 0, finnes
 *                   ingen talong å gjette på. Det dekker budvinneren (hun ser sitt eget
 *                   vrak) og enhver giv uten talong, uten et eget unntak for hver.
 *   KALT KORT       `lovligeEtterlys`/`utførVelg` forbyr å kalle et kort man har selv
 *                   eller har vraket. Så lenge det er uspilt, ligger det altså ALDRI hos
 *                   budvinneren og ALDRI i talongen.
 *   MAKKERPLIKT     i stikk 1 MÅ den som har det kalte kortet legge det når det er
 *                   lovlig (`lovligeKort`). Det er lovlig om utspillet var i kortets
 *                   farge, eller om setet ikke fulgte farge (da er hele hånden lovlig).
 *                   La et sete noe annet i ett av de to tilfellene, har det ikke kortet.
 *                   Den gamle trekkeren ser heller ikke denne.
 *
 * Det som IKKE er med: skuffprinsipp-slutninger («to plasser igjen, og bare dette
 * setet kan ta de to sparene»). De er sanne, men krever en tilordningsprøve og er ikke
 * enkeltkortfakta; de hører til trekkeren, ikke til masken.
 */

import { FARGER } from "../kort.ts";
import type { KortPåBord, SpillerVisning } from "../motor.ts";
import { kortIndeks } from "../nevro/trekk.ts";
import { MLB_TRO_KLASSER, MLB_TRO_KORT, setteKort } from "./trotrekk.ts";

/** Klasseindeksen for talongen i `p[kort][klasse]`. */
export const TALONGKLASSE = MLB_TRO_KLASSER - 1;

export interface Trofakta {
  /**
   * 52 × 4, `umulig[kort·4 + klasse]`: 1 = reglene og det setet har sett utelukker
   * plasseringen. Bare USETTE kort får enere; et sett kort er ikke en gjetning og
   * har ingen rad å maskere.
   */
  readonly umulig: Uint8Array;
  /** 52: kortet er usett for setet, altså en gjetning (`setteKort`). */
  readonly usett: Uint8Array;
  /** `renons[absolutt sete][fargeindeks]`: setet er KJENT renons i fargen. */
  readonly renons: readonly (readonly boolean[])[];
  /** Absolutte seter som ikke kan ha det kalte kortet (tom om det er spilt eller ingen er kalt). */
  readonly ikkeKalt: readonly number[];
}

/** Kjent renons per absolutt sete, av offentlig informasjon alene. */
export function kjentRenons(visning: SpillerVisning): boolean[][] {
  const n = visning.antallKort.length;
  const renons = Array.from({ length: n }, () => [false, false, false, false]);
  const stikk = (kort: readonly KortPåBord[]): void => {
    const først = kort[0];
    if (først === undefined) return;
    const ledet = FARGER.indexOf(først.kort.farge);
    for (const kp of kort) if (kp.kort.farge !== først.kort.farge) renons[kp.spiller]![ledet] = true;
  };
  for (const s of visning.historikk) stikk(s.kort);
  stikk(visning.bord);

  // UTSPILLSPLIKTEN: budvinneren åpnet stikk 1 uten trumf ⇒ hun hadde ingen.
  const førsteStikk = visning.historikk[0]?.kort ?? (visning.stikkSpilt === 0 ? visning.bord : []);
  const åpning = førsteStikk[0];
  if (
    åpning !== undefined &&
    visning.trumf !== null &&
    visning.budvinner !== null &&
    åpning.spiller === visning.budvinner &&
    åpning.kort.farge !== visning.trumf
  ) {
    renons[åpning.spiller]![FARGER.indexOf(visning.trumf)] = true;
  }
  return renons;
}

/**
 * Seter som beviselig ikke har det kalte kortet: budvinneren (regelen) og hvert sete som
 * i stikk 1 la noe annet i en stilling der makkerplikten ville tvunget kortet ned.
 * Tom liste om kortet er spilt (da er det sett og ingen gjetning) eller ingen er kalt.
 */
export function ikkeKaltHos(visning: SpillerVisning, sett: ReadonlySet<number>): number[] {
  const kalt = visning.etterlyst;
  if (kalt === null || sett.has(kortIndeks(kalt))) return [];
  const ut = new Set<number>();
  if (visning.budvinner !== null) ut.add(visning.budvinner);
  const førsteStikk = visning.historikk[0]?.kort ?? (visning.stikkSpilt === 0 ? visning.bord : []);
  const ledet = førsteStikk[0]?.kort.farge;
  for (let i = 1; i < førsteStikk.length; i++) {
    const kp = førsteStikk[i]!;
    // Kortet er uspilt, så `kp.kort` er ikke det. Var det lovlig for setet, ville det lagt det.
    if (ledet === kalt.farge || kp.kort.farge !== ledet) ut.add(kp.spiller);
  }
  return [...ut].sort((a, b) => a - b);
}

/**
 * DET SETET VET, som umulige plasseringer per usett kort. Ren funksjon av visningen.
 */
export function trofakta(visning: SpillerVisning): Trofakta {
  const n = visning.antallKort.length;
  const meg = visning.deg;
  const sett = setteKort(visning);
  const umulig = new Uint8Array(MLB_TRO_KORT * MLB_TRO_KLASSER);
  const usett = new Uint8Array(MLB_TRO_KORT);
  const renons = kjentRenons(visning);
  const ikkeKalt = ikkeKaltHos(visning, sett);

  let antallUsett = 0;
  for (let i = 0; i < MLB_TRO_KORT; i++) {
    if (sett.has(i)) continue;
    usett[i] = 1;
    antallUsett++;
  }
  let sumH = 0;
  for (let p = 0; p < n; p++) if (p !== meg) sumH += visning.antallKort[p] ?? 0;
  const ingenTalong = antallUsett - sumH <= 0;
  const kaltIndeks = visning.etterlyst === null ? -1 : kortIndeks(visning.etterlyst);

  for (let i = 0; i < MLB_TRO_KORT; i++) {
    if (usett[i] === 0) continue;
    const farge = Math.floor(i / 13);
    const b = i * MLB_TRO_KLASSER;
    for (let r = 1; r < n && r <= TALONGKLASSE; r++) {
      const p = (meg + r) % n;
      if ((visning.antallKort[p] ?? 0) <= 0 || renons[p]![farge] || (i === kaltIndeks && ikkeKalt.includes(p))) {
        umulig[b + r - 1] = 1;
      }
    }
    if (ingenTalong || i === kaltIndeks) umulig[b + TALONGKLASSE] = 1;
  }
  return { umulig, usett, renons, ikkeKalt };
}

export interface MaskertFordeling {
  /** `p[kort][klasse]`, de umulige klassene nullet og raden renormalisert. */
  readonly fordeling: number[][];
  /**
   * Usette kort der ALLE klassene var umulige, eller der nettet ga null masse til alle
   * de mulige. Raden står da umaskert. Er faktaene sanne, kan det første aldri skje,
   * så et tall over null her er en feil å lete etter, ikke en statistikk.
   */
  readonly tilbakefall: number;
  /** Summen av sannsynlighetsmassen som ble fjernet, over de usette kortene. */
  readonly fjernetMasse: number;
}

/**
 * NULL UT DET SETET VET ER UMULIG, og renormaliser per kort.
 *
 * Sette kort får raden sin uendret: de er ikke en gjetning, og K8 og søket leser dem
 * aldri. Ingen RNG, og `fordeling` endres ikke på plass.
 */
export function maskerFordeling(
  fordeling: readonly (readonly number[])[],
  visning: SpillerVisning,
  fakta: Trofakta = trofakta(visning),
): MaskertFordeling {
  const ut: number[][] = [];
  let tilbakefall = 0;
  let fjernetMasse = 0;
  for (let k = 0; k < MLB_TRO_KORT; k++) {
    const rad = fordeling[k] ?? [];
    if (fakta.usett[k] === 0) {
      ut.push(rad.slice());
      continue;
    }
    const ny = new Array<number>(MLB_TRO_KLASSER);
    let sum = 0;
    let fjernet = 0;
    for (let c = 0; c < MLB_TRO_KLASSER; c++) {
      const v = rad[c] ?? 0;
      if (fakta.umulig[k * MLB_TRO_KLASSER + c] === 1) {
        ny[c] = 0;
        fjernet += v;
      } else {
        ny[c] = v;
        sum += v;
      }
    }
    if (!(sum > 0) || !Number.isFinite(sum)) {
      tilbakefall++;
      ut.push(rad.slice());
      continue;
    }
    for (let c = 0; c < MLB_TRO_KLASSER; c++) ny[c] = ny[c]! / sum;
    fjernetMasse += fjernet;
    ut.push(ny);
  }
  return { fordeling: ut, tilbakefall, fjernetMasse };
}
