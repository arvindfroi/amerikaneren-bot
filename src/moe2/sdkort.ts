/**
 * SINGLE-DUMMY KORTEVALUERING – den validerte formen.
 *
 * BAKGRUNNEN, målt 25. juli 2026 med godkjenningsporten:
 *
 *   fasit      metode         korrigert korrelasjon mot poeng
 *   bud        single dummy   +0,925   GODKJENT
 *   trumf      double dummy   +0,234   avvist
 *   vrak       double dummy   +0,144   avvist
 *   kortspill  double dummy   −0,609   AVVIST, feil fortegn
 *
 * Fire uavhengige beslutninger, samme svar hver gang. En fasit som forutsetter
 * informasjon du ikke har er ikke et mål – den er en felle. DD-kortet er
 * optimalt mot et motspill som ser like mye som deg selv; mot skjult
 * informasjon setter det opp linjer som bare virker mot perfekt forsvar.
 *
 * Klarest i etterlysningen: DD kaller på valør 4,3 fordi den SER hvem som
 * sitter med toeren. Uten den informasjonen er samme trekk et sjansespill –
 * og å bytte til høyeste lovlige etterlysning er verdt +0,72 poeng.
 *
 * DENNE MODULEN gjør det motsatte, etter samme oppskrift som budet, som er
 * den ene som bestod:
 *
 *   1. Trekk K verdener som er forenlige med det AGENTEN har sett.
 *   2. Spill kandidatkortet, og la så en REALISTISK modell (NevroHjerne)
 *      spille resten ut – i alle seter, uten å se skjulte kort.
 *   3. Kortets verdi er snittutfallet over verdenene.
 *
 * Ingen ser noe de ikke skal. Det er hele forskjellen fra DD.
 */

import { lovligeKort, utfør, type GameState, type Handling, type Kort } from "../index.ts";
// Konverteringen HENTES, den skrives ikke paa nytt. Foerste utkast rullet sin
// egen med `i >> 4` mens den kanoniske bruker `floor(c / 13)` - to helt ulike
// kodinger, og feilen ville gitt gale kort i stillhet. Tre av dagens feil var
// av samme klasse (nt/t-vektorene), saa duplisert konvertering er forbudt her.
import { intTilKort } from "../solver/dds.ts";
import { trekkVerdenBelief } from "../solver/sampler.ts";

/** Motstandermodellen som spiller runden ferdig. NevroAgent oppfyller det. */
export interface Utspiller {
  velgHandling(state: GameState): Handling;
}

export interface SDKortOpts {
  /** Antall verdener forenlige med agentens informasjon. */
  readonly verdener: number;
  readonly rng: () => number;
  /** Begrens til disse kandidatene (ellers alle lovlige kort). */
  readonly kandidater?: readonly Kort[];
  /**
   * Utfallsmål. Standard er egne poeng minus snittet av de tre andre – samme
   * differanse som benken bruker, så treningsmålet og målestokken er ett.
   */
  readonly mål?: (sluttState: GameState, spiller: number) => number;
}

const standardMål = (s: GameState, spiller: number): number => {
  const egne = s.totalPoeng[spiller] ?? 0;
  return egne - (s.totalPoeng.reduce((a, b) => a + b, 0) - egne) / 3;
};

/**
 * Bytter ut de skjulte hendene med verdenens, og lar agentens egen hånd stå.
 *
 * Observatørens hånd ER kjent, så den skal ikke erstattes – gjør vi det,
 * evaluerer vi en annen hånd enn den vi faktisk har.
 */
function medVerden(s: GameState, hender: readonly number[][], observator: number): GameState {
  const nye = s.hender.map((h, p) => (p === observator ? h : hender[p]!.map(intTilKort)));
  return { ...s, hender: nye };
}

export interface KortVurdering {
  readonly kort: Kort;
  /** Snittutfall over verdenene. */
  readonly verdi: number;
  /** Hvor mange verdener som faktisk lot seg spille ut. */
  readonly n: number;
}

/**
 * Vurderer hvert lovlige kort ved å spille runden ferdig i K samplede verdener.
 *
 * Returnerer tom liste når ingen verden lot seg trekke – kalleren skal da IKKE
 * lære noe. Å behandle «ingen data» som «alle kort er like gode» var
 * mekanismen som gjorde `lærForsvar` verre enn ingenting.
 */
export function vurderKortSD(
  state: GameState,
  spiller: number,
  motpart: Utspiller,
  opts: SDKortOpts,
): KortVurdering[] {
  const lovlige = opts.kandidater ?? lovligeKort(state, spiller);
  if (lovlige.length === 0) return [];
  const mål = opts.mål ?? standardMål;

  // ALLE kandidatkort maales i de SAMME verdenene. Trakk vi nye verdener per
  // kort ville forskjellen mellom to kort blitt dominert av hvilke hender som
  // tilfeldigvis ble trukket - samme parringsprinsipp som duplikatgiverne.
  const verdener: number[][][] = [];
  for (let v = 0; v < opts.verdener; v++) {
    const w = trekkVerdenBelief(state, spiller, opts.rng);
    if (w !== null) verdener.push(w.hender);
  }
  if (verdener.length === 0) return [];

  const ut: KortVurdering[] = [];
  for (const kort of lovlige) {
    let sum = 0;
    let n = 0;
    for (const hender of verdener) {
      let s = medVerden(state, hender, spiller);
      s = utfør(s, { type: "SPILL", spiller, kort }).state;
      let vakt = 0;
      while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
        s = utfør(s, motpart.velgHandling(s)).state;
      }
      sum += mål(s, spiller);
      n++;
    }
    ut.push({ kort, verdi: sum / n, n });
  }
  return ut;
}

/** Det beste kortet etter SD-vurdering, eller null om ingen verden lot seg trekke. */
export function besteKortSD(
  state: GameState,
  spiller: number,
  motpart: Utspiller,
  opts: SDKortOpts,
): Kort | null {
  const vurdert = vurderKortSD(state, spiller, motpart, opts);
  if (vurdert.length === 0) return null;
  let beste = vurdert[0]!;
  for (const v of vurdert) if (v.verdi > beste.verdi) beste = v;
  return beste.kort;
}
