/**
 * MENNESKEKLONEN — mennesket som en agent, så K1 kan måles som et RACE (12. sep).
 *
 * ===================== HVORFOR DEN MÅTTE FINNES =========================
 *
 * Eieren formulerte K1 som «over 100 race til 100 poeng skal mennesker bare vinne rundt 5 %».
 * Det måles i dag som et DUPLIKAT (`duplikat-menneske.ts`): boten spiller menneskets egne kort
 * om igjen, og differansen er +1,12 ± 0,19 pp ΔP(seier) per runde. Duplikatet er riktig som
 * duplikat — kortflaksen er nullet ut — men det kan ikke gjøres om til en racesandel. Et race
 * er ~23 runder med en TERSKEL på 100 poeng, og `verktoy/race100.py` sier hvorfor oversettelsen
 * ikke finnes: to boter med samme snitt per runde kan ha svært ulik racesjanse, fordi racet måler
 * HALEN over femten-tjue runder, ikke snittet over uendelig mange.
 *
 * Skal racet måles, må mennesket kunne SPILLE et race det ikke har spilt. Det krever en agent
 * som velger som mennesket. Det er denne fila.
 *
 * ===================== FIRE HODER, IKKE ETT ==============================
 *
 * Mennesket tar fire slags valg, og et race er tapt eller vunnet i alle fire. Hvert hode
 * gjenbruker NØYAKTIG trekkfunksjonen og dekodingen det tilsvarende BOT-laget bruker, så
 * klonen og boten kan settes mot samme stilling og sammenliknes rad for rad:
 *
 *   bud    `budqTrekk` (143) → 11 utganger i `BUDQ_BUD`-rekkefølge, argmax over LOVLIGE bud.
 *          Samme dekoding som `BudQagent`.
 *   vrak   `vraktrekkK` (27) → 1 utgang per (trumf, vrak)-par, argmax over `vrakkandidater`
 *          PLUSS NevroHjernes eget par. Samme kandidatsett og samme dekoding som `Vrakrangerer`.
 *   kall   `etterlystTrekk` (25) → 1 utgang per kandidat, argmax over `etterlystKandidater`.
 *   kort   `e1SpillTrekkMedTro(…, 273, null)` → 52 utganger, argmax over LOVLIGE kort. Samme
 *          vektor og samme dekoding som `E1Agent.velgKort`.
 *
 * KANDIDATSETTENE ER BOTENS, MED VILJE. Et eget sett ville gjort «klonen er enigere med
 * mennesket enn boten er» til en sammenlikning av to ulike spørsmål. Her er spørsmålet det
 * samme, og bare vektene er ulike.
 *
 * ===================== K2 — KLONEN KAN IKKE JUKSE ========================
 *
 * Alle fire trekkfunksjonene leser bare det setet ser: egen hånd (`hender[sete]`), eget vrak
 * (`state.vrak` er budvinnerens eget), bordet, historikken, budrunden og poengtavla. Ingen
 * leser en annen hånd eller talongen. Det er ikke en påstand: `test/menneskeklon.test.ts`
 * bytter de skjulte hendene, budvinnerens vrak og talongen under klonen og krever BIT-IDENTISKE
 * valg — med en felle som leser en skjult hånd og som samme sjekk fanger.
 *
 * Det er ikke pedanteri her. En klone som kikker ville vært en BEDRE motstander enn mennesket,
 * og racetallet ville sagt at mennesket vinner sjeldnere enn det gjør. Feilen ville pekt i
 * nøyaktig den retningen prosjektet ønsker seg svar — den farligste retningen en feil kan ha.
 *
 * ===================== HVA KLONEN IKKE ER ================================
 *
 * Den er en ATFERDSKLONE, ikke mennesket. Den arver menneskets systematiske valg; den arver
 * ikke dagsform, tretthet eller at 69 % av kampene ble forlatt. Racetallet den gir er derfor
 * «hvor ofte vinner en spiller som VELGER som dette mennesket», ikke «hvor ofte vinner dette
 * mennesket». Forskjellen skal stå i rapporten, ikke i en fotnote.
 */

import { readFileSync } from "node:fs";

import { FARGER, type Farge, type Kort } from "../kort.ts";
import { lovligeHandlinger, lovligeKort, utfør, type GameState, type Handling } from "../motor.ts";
import type { Bud } from "../regler.ts";
import { forover, nettFraBytes, type NevroNett } from "../nevro/nett.ts";
import { kortIndeks, NevroAgent } from "../nevro/index.ts";
import { budqTrekk, BUDQ_BUD, BUDQ_INN, BUDQ_UT } from "./budq.ts";
import {
  etterlystKandidater,
  etterlystTrekk,
  vraktrekk,
  vraktrekkK,
  ETTERLYST_DIM,
  VRAK_DIM,
  VRAK_DIM_K,
} from "./vraktrekk.ts";
import { vrakkandidater } from "./vrakrang.ts";
import { lesVrakflagg } from "./vrakpolicy.ts";
import { e1SpillTrekkMedTro, E1_SPILL_DIM } from "../e1/trekk.ts";

/** Bredden hvert hode tar. Håndheves i konstruktøren — se `krevNett`. */
export const KLON_BUD_DIM = BUDQ_INN;
export const KLON_KALL_DIM = ETTERLYST_DIM;
export const KLON_KORT_DIM = E1_SPILL_DIM;

const nøkkel = (k: Kort): string => `${k.farge}${k.verdi}`;

/** Vrakflagget kjeden bruker overalt (`vr:<fil>:telrd:`). Klonen scorer det SAMME settet. */
export const KLON_VRAKFLAGG = "telrd";

/**
 * KANDIDATPARENE (trumf, vrak) — EN FRI FUNKSJON, IKKE EN METODE PÅ KLONEN.
 *
 * Merkingen (`examples/menneske-klondata.ts`) må enumerere nøyaktig de parene klonen senere
 * velger mellom, men den kjører FØR klonen finnes: det er den som lager vektene. Lå settet
 * bare som en metode, måtte merkingen ha sin egen kopi — og to kopier av et kandidatsett er to
 * steder menneskets faktiske par kan mangle. Da ville treffraten hatt et tak ingen så, fordi
 * fasiten ikke var blant kandidatene.
 *
 * `nevro` er NevroHjernes eget par, som `Vrakrangerer` alltid legger til. Den sendes inn i
 * stedet for å lages her, så kalleren eier RNG-tilstanden.
 */
export function klonVrakpar(
  state: GameState,
  sete: number,
  nevroPar: { trumf: Farge; vrak: Kort[] } | null,
  flagg: string = KLON_VRAKFLAGG,
): { trumf: Farge; vrak: Kort[] }[] {
  const hånd = (state.hender[sete] ?? []).slice();
  const antall = state.giving.talong;
  if (antall <= 0 || hånd.length <= antall) return [];
  const pol = lesVrakflagg(flagg);
  const par: { trumf: Farge; vrak: Kort[] }[] = [];
  for (const trumf of FARGER) for (const vrak of vrakkandidater(hånd, trumf, antall, pol)) par.push({ trumf, vrak });
  if (nevroPar !== null) {
    const n = nevroPar.vrak.map(nøkkel).sort().join(",");
    if (!par.some((p) => p.trumf === nevroPar.trumf && p.vrak.map(nøkkel).sort().join(",") === n)) par.push(nevroPar);
  }
  return par;
}

/** NevroHjernes eget par: dens vrak, og trumfen den ville valgt etterpå. Som `Vrakrangerer`. */
export function nevroVrakpar(
  nevro: { velgHandling(s: GameState): Handling },
  s: GameState,
  sete: number,
): { trumf: Farge; vrak: Kort[] } | null {
  const h = nevro.velgHandling(s);
  if (h.type !== "VRAK") return null;
  const vrak = h.kort.slice();
  // Trumfen regnes av hånden som BLIR IGJEN, så den må simuleres.
  const etter = utfør(s, { type: "VRAK", spiller: sete, kort: vrak }).state;
  const v = nevro.velgHandling(etter);
  if (v.type !== "VELG") return null;
  return { trumf: v.trumf, vrak };
}

/**
 * BREDDEN OG UTGANGEN HÅNDHEVES PER HODE.
 *
 * Fire nett lastes fra fire filstier i én spek, og filene har samme endelse. Byttes to av dem
 * om, ville hvert hode fått en vektor det aldri ble trent på — og INGENTING ville feilet:
 * klonen ville spilt søppel, racetallet ville blitt et tall, og tallet ville vært tull. Samme
 * feilklasse som `Vrakrangerer` og `BudQagent` håndhever på sine egne bredder, av samme grunn.
 */
function krevNett(nett: NevroNett, inn: readonly number[], ut: number, navn: string, fil: string): NevroNett {
  const første = nett.lag[0];
  const siste = nett.lag[nett.lag.length - 1];
  if (første === undefined || siste === undefined) throw new Error(`Klonens ${navn}-nett (${fil}) er tomt`);
  if (!inn.includes(første.inn)) {
    throw new Error(`Klonens ${navn}-nett (${fil}) tar ${første.inn} trekk, forventet ${inn.join(" eller ")}`);
  }
  if (siste.ut !== ut) throw new Error(`Klonens ${navn}-nett (${fil}) har ${siste.ut} utganger, forventet ${ut}`);
  return nett;
}

const les = (fil: string): NevroNett => {
  const n = nettFraBytes(new Uint8Array(readFileSync(fil)))[0];
  if (n === undefined) throw new Error(`Tomme vekter i «${fil}»`);
  return n;
};

export interface Klonefiler {
  readonly bud: string;
  readonly vrak: string;
  readonly kall: string;
  readonly kort: string;
}

/**
 * MENNESKET SOM EN AGENT. Formen er `Spekagent`: `velgHandling`, `nyKamp` og `observer`, så den
 * kan sitte i et sete i `examples/lop-menneske.ts` og i `examples/kamp.ts` uten særbehandling.
 */
export class Menneskeklone {
  private readonly budnett: NevroNett;
  private readonly vraknett: NevroNett;
  private readonly kallnett: NevroNett;
  private readonly kortnett: NevroNett;
  /** 27-nettet leser kampstillingen (`vraktrekkK`); 24-nettet gjør det ikke. Bredden avgjør. */
  private readonly vrakKampstilling: boolean;
  private readonly nevro = new NevroAgent();
  /**
   * Trumfen vraket ble valgt SAMMEN MED, båret fram til VELG-fasen. Nøyaktig som
   * `Vrakrangerer.valgt`: paret vurderes under ett, og trumfen kan ikke velges om igjen etterpå
   * uten at vraket blir et annet vrak enn det som ble scoret.
   */
  private valgt: Farge | null = null;

  constructor(filer: Klonefiler) {
    this.budnett = krevNett(les(filer.bud), [KLON_BUD_DIM], BUDQ_UT, "bud", filer.bud);
    this.vraknett = krevNett(les(filer.vrak), [VRAK_DIM, VRAK_DIM_K], 1, "vrak", filer.vrak);
    this.kallnett = krevNett(les(filer.kall), [KLON_KALL_DIM], 1, "kall", filer.kall);
    this.kortnett = krevNett(les(filer.kort), [KLON_KORT_DIM], 52, "kort", filer.kort);
    this.vrakKampstilling = this.vraknett.lag[0]!.inn === VRAK_DIM_K;
  }

  nyKamp(): void {
    this.nevro.nyKamp();
    this.valgt = null;
  }

  /** Klonen har ingen bok å føre. Kroken finnes så drivere kan kalle den uten å vite det. */
  observer(_state: GameState): void {}

  velgHandling(state: GameState): Handling {
    if (state.fase === "BUDRUNDE" && state.iTur !== null) return this.velgBud(state, state.iTur);
    if (state.fase === "VRAK" && state.budvinner !== null) {
      const h = this.velgPar(state, state.budvinner);
      if (h !== null) return h;
    }
    if (state.fase === "VELG" && state.budvinner !== null) return this.velgTrumf(state, state.budvinner);
    if (state.fase === "SPILL" && state.iTur !== null) {
      return { type: "SPILL", spiller: state.iTur, kort: this.velgKort(state, state.iTur) };
    }
    // Faser klonen ikke har et hode for (i praksis bare RUNDE_SLUTT/FERDIG, som driveren tar).
    return this.nevro.velgHandling(state);
  }

  /** Q per bud i `BUDQ_BUD`-rekkefølge. For prøver og for enighetsmålingen. */
  budQ(state: GameState, sete: number): Float32Array {
    return forover(this.budnett, budqTrekk(state, sete, null, false));
  }

  private velgBud(state: GameState, sete: number): Handling {
    const lov = lovligeHandlinger(state);
    if (lov.fase !== "BUDRUNDE") return this.nevro.velgHandling(state);
    const q = this.budQ(state, sete);
    let beste: Bud | null = null;
    let bv = -Infinity;
    for (const b of lov.bud) {
      const i = BUDQ_BUD.indexOf(b);
      if (i < 0) continue;
      if (q[i]! > bv) {
        bv = q[i]!;
        beste = b;
      }
    }
    // Skal ikke skje med fire spillere; å gjette ville vært verre enn å la NevroHjerne svare.
    if (beste === null) return this.nevro.velgHandling(state);
    return { type: "BUD", spiller: sete, bud: beste };
  }

  /** Kandidatparene (trumf, vrak) — NØYAKTIG `Vrakrangerer` sitt sett, inkludert NevroHjernes eget. */
  vrakpar(state: GameState, sete: number): { trumf: Farge; vrak: Kort[] }[] {
    return klonVrakpar(state, sete, nevroVrakpar(this.nevro, state, sete), KLON_VRAKFLAGG);
  }

  /** Klonens poengsum for ett par. Eksportert gjennom klassen så merkingen kan bruke samme tall. */
  vrakScore(state: GameState, sete: number, p: { trumf: Farge; vrak: Kort[] }): number {
    const hånd = (state.hender[sete] ?? []).slice();
    const t = this.vrakKampstilling
      ? vraktrekkK(state, sete, hånd, p.vrak, p.trumf)
      : vraktrekk(state, sete, hånd, p.vrak, p.trumf);
    return forover(this.vraknett, t)[0] ?? 0;
  }

  private velgPar(state: GameState, sete: number): Handling | null {
    const par = this.vrakpar(state, sete);
    if (par.length === 0) return null;
    let beste = par[0]!;
    let bv = -Infinity;
    for (const p of par) {
      const s = this.vrakScore(state, sete, p);
      if (s > bv) {
        bv = s;
        beste = p;
      }
    }
    this.valgt = beste.trumf;
    return { type: "VRAK", spiller: sete, kort: beste.vrak };
  }

  /** Kallkandidatene og klonens poengsum for hver — samme sett `velgTrumf` velger fra. */
  kallScore(state: GameState, sete: number, trumf: Farge, kort: Kort): number {
    return forover(this.kallnett, etterlystTrekk(state, sete, trumf, kort))[0] ?? 0;
  }

  private velgTrumf(state: GameState, sete: number): Handling {
    // Uten en trumf fra vrakfasen er stillingen ikke klonens egen (f.eks. en prøve som hopper rett
    // til VELG). Da svarer NevroHjerne, som `Vrakrangerer` gjør i samme tilfelle.
    if (this.valgt === null) return this.nevro.velgHandling(state);
    const trumf = this.valgt;
    this.valgt = null;
    const kand = etterlystKandidater(state, trumf);
    if (kand.length === 0) return { type: "VELG", spiller: sete, trumf, etterlyst: null };
    let beste = kand[0]!;
    let bv = -Infinity;
    for (const k of kand) {
      const s = this.kallScore(state, sete, trumf, k);
      if (s > bv) {
        bv = s;
        beste = k;
      }
    }
    return { type: "VELG", spiller: sete, trumf, etterlyst: beste };
  }

  /** Alle 52 logitene for kortvalget. For prøver og for enighetsmålingen. */
  kortLogits(state: GameState, sete: number): Float32Array {
    return forover(this.kortnett, e1SpillTrekkMedTro(state, sete, KLON_KORT_DIM, null));
  }

  /** Argmax over LOVLIGE kort — reglene håndheves av motoren, ikke av nettet. */
  velgKort(state: GameState, sete: number): Kort {
    const lovlige = lovligeKort(state, sete);
    if (lovlige.length === 1) return lovlige[0]!;
    const logits = this.kortLogits(state, sete);
    let beste = lovlige[0]!;
    for (const k of lovlige) if (logits[kortIndeks(k)]! > logits[kortIndeks(beste)]!) beste = k;
    return beste;
  }

}

/**
 * `menn:<budfil>@<vrakfil>@<kallfil>@<kortfil>` — spekformen.
 *
 * FIRE FILER I ETT FELT, med `@` som skille slik `vr:<fil>@<etterlystfil>` og `budm:<fil>@<ev>`
 * alt bruker. Klonen er en TERMINAL form som `ens:`: den har et hode for hver fase mennesket
 * har et valg i, så det finnes ikke noe indre lag å falle igjennom til.
 */
export function delKlonespek(indre: string): Klonefiler {
  const felt = indre.split("@");
  if (felt.length !== 4 || felt.some((x) => x === "")) {
    throw new Error(
      `Ugyldig klonespek «menn:${indre}» – forventet menn:<budfil>@<vrakfil>@<kallfil>@<kortfil> (fire filer)`,
    );
  }
  return { bud: felt[0]!, vrak: felt[1]!, kall: felt[2]!, kort: felt[3]! };
}
