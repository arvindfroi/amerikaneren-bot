/**
 * VRAK OG TRUMFVALG SOM ÉN BESLUTNING.
 *
 * ARVINDS DOKTRINE, ordrett:
 *
 *   «Trumfvalg skjer etter vrak, men det henger sammen, og vi bestemmer oss for
 *    det når vi har 16 kort og skal hive ut 4. Det er da vi tar de
 *    beslutningene. Aldri vrak i fargen som blir trumf – ikke en toer engang.
 *    Heller vrak en urelatert knekt, dame eller til og med konge. Knekt kan jeg
 *    ofte hive, fordi jeg vil bli kvitt suits – renonse er bra for spillefører,
 *    da kan man bruke trumf.»
 *
 * HVA SOM SPILTE FØR DENNE. `E1Agent` sender VRAK og VELG videre til
 * NevroHjerne, i BEGGE armer av hver måling prosjektet har gjort:
 *
 *   `velgVrak`            et nett scorer «behold» per kort. Inngangen
 *                         (`byttTrekk`) har ingen trumf – den finnes ikke ennå.
 *   `velgTrumfOgEtterlys` `besteTrumf` på hånden som BLE IGJEN.
 *
 * De to er altså formelt uavhengige. Målt over 2 000 runder vraket Adams et
 * kort i den fargen som ble trumf i 36 av dem – 1,8 %. Nettet har lært
 * koblingen implisitt, men det er ikke det samme som å velge paret.
 *
 * OG INNSATSEN ER STOR: fasedelingen på D1 målte trumfvalget til
 * **32,4 ± 3,0 poeng per kamp** – den dyreste enkeltbeslutningen i spillet, og
 * den eneste som fortsatt tas av en håndlagd formel fra appen.
 *
 * SLIK VELGES PARET
 *
 * Kandidatrommet er `4 × C(16,4) = 7 280`, som er lite nok til å enumereres –
 * men hver kandidat koster en SD-evaluering, og det er de som er dyre. Derfor
 * genereres et DOKTRINSTYRT utvalg per trumffarge:
 *
 *   1. de fire laveste utenom trumf
 *   2. for hver kort sidefarge: kast HELE fargen (renonse) og fyll opp med de
 *      laveste
 *   3. to korte sidefarger samtidig, når de får plass
 *
 * Ingen kandidat inneholder et trumfkort. Doktrinen er altså en INVARIANT i
 * kandidatgenereringen, ikke et ønske evalueringen kan overkjøre.
 *
 * EVALUERINGEN ER PARRET, som `sdpar.ts`: alle kandidatparene måles i NØYAKTIG
 * de samme trukne verdenene, så forskjellen mellom dem ikke domineres av
 * hvilke hender som tilfeldigvis ble trukket. Og rollout-policyen er VÅR EGEN
 * BOT – den rettelsen var verdt +1,25 i førersetet (`ork:`-benken), og med
 * NevroHjerne der måler man modellfeilen i stedet for valget.
 */

import { lagRng, FARGER, type Farge, type Kort } from "../kort.ts";
import {
  lovligeEtterlys,
  utfør,
  type GameState,
  type Handling,
} from "../motor.ts";
import { medVerden, trekkVerdener, type Utspiller } from "./sdkort.ts";

export interface VrakvelgOpts {
  readonly verdener?: number;
  readonly frø?: number;
  /** Maks (trumf, vrak)-par som evalueres. Vokter tidsbudsjettet. */
  readonly maksPar?: number;
}

interface Par {
  readonly trumf: Farge;
  readonly vrak: Kort[];
}

const kortNøkkel = (k: Kort): string => `${k.farge}${k.verdi}`;

/**
 * Doktrinstyrte vrakkandidater for én trumffarge.
 *
 * INVARIANTEN: ingen kandidat inneholder trumf. Det er hele regelen, og den
 * håndheves ved at trumfkortene aldri legges i utvalgspoolen.
 */
function kandidaterFor(hånd: readonly Kort[], trumf: Farge, antall: number): Kort[][] {
  const ikkeTrumf = hånd.filter((k) => k.farge !== trumf);
  if (ikkeTrumf.length < antall) return []; // må vrake trumf – ulovlig etter doktrinen
  const lavestFørst = ikkeTrumf.slice().sort((a, b) => a.verdi - b.verdi);
  const ut: Kort[][] = [];
  const sett = new Set<string>();
  const legg = (kort: Kort[]): void => {
    if (kort.length !== antall) return;
    const n = kort.map(kortNøkkel).sort().join(",");
    if (sett.has(n)) return;
    sett.add(n);
    ut.push(kort);
  };

  // 1. De laveste. Referansen alt annet måles mot.
  legg(lavestFørst.slice(0, antall));

  // 2. RENONSE: kast en hel sidefarge, fyll opp med de laveste av resten.
  const perFarge = new Map<Farge, Kort[]>();
  for (const k of ikkeTrumf) perFarge.set(k.farge, [...(perFarge.get(k.farge) ?? []), k]);
  const korteFarger = [...perFarge.entries()]
    .filter(([, ks]) => ks.length <= antall)
    .sort((a, b) => a[1].length - b[1].length);

  for (const [farge, ks] of korteFarger) {
    const rest = lavestFørst.filter((k) => k.farge !== farge);
    legg([...ks, ...rest.slice(0, antall - ks.length)]);
  }

  // 3. TO korte farger samtidig, når de får plass. To renonser er dobbelt så
  //    mange runder der trumfen kan brukes.
  for (let i = 0; i < korteFarger.length; i++) {
    for (let j = i + 1; j < korteFarger.length; j++) {
      const a = korteFarger[i]![1];
      const b = korteFarger[j]![1];
      if (a.length + b.length > antall) continue;
      const brukt = new Set([...a, ...b].map(kortNøkkel));
      const rest = lavestFørst.filter((k) => !brukt.has(kortNøkkel(k)));
      legg([...a, ...b, ...rest.slice(0, antall - a.length - b.length)]);
    }
  }
  return ut;
}

export class Vrakvelger {
  private readonly indre: { velgHandling(s: GameState): Handling; nyKamp(): void };
  private readonly motpart: Utspiller;
  private readonly verdener: number;
  private readonly maksPar: number;
  private readonly rng: () => number;
  /** Trumfen som ble valgt SAMMEN med vraket, og som VELG skal returnere. */
  private valgt: Farge | null = null;

  constructor(
    indre: { velgHandling(s: GameState): Handling; nyKamp(): void },
    motpart: Utspiller,
    opts: VrakvelgOpts = {},
  ) {
    this.indre = indre;
    this.motpart = motpart;
    this.verdener = opts.verdener ?? 12;
    this.maksPar = opts.maksPar ?? 24;
    this.rng = lagRng(opts.frø ?? 20_260_806);
  }

  nyKamp(): void {
    this.indre.nyKamp();
    this.valgt = null;
  }

  velgHandling(state: GameState): Handling {
    if (state.fase === "VRAK" && state.budvinner !== null) {
      const h = this.velgPar(state, state.budvinner);
      if (h !== null) return h;
    }
    if (state.fase === "VELG" && state.budvinner !== null && this.valgt !== null) {
      const trumf = this.valgt;
      this.valgt = null;
      const kand = lovligeEtterlys(state, trumf);
      // Appens regel for etterlysningen beholdes: HØYESTE lovlige. Én variabel
      // om gangen – dette forsøket handler om paret (trumf, vrak).
      const etterlyst = kand.length > 0 ? kand[kand.length - 1]! : null;
      return { type: "VELG", spiller: state.budvinner, trumf, etterlyst };
    }
    return this.indre.velgHandling(state);
  }

  /** Evaluerer (trumf, vrak)-par i felles verdener og velger det beste. */
  private velgPar(state: GameState, sete: number): Handling | null {
    const hånd = state.hender[sete] ?? [];
    const antall = state.giving.talong;
    if (antall <= 0 || hånd.length <= antall) return null;

    const par: Par[] = [];
    for (const trumf of FARGER) {
      for (const vrak of kandidaterFor(hånd, trumf, antall)) par.push({ trumf, vrak });
    }
    if (par.length === 0) return null;
    const utvalg = par.slice(0, this.maksPar);

    const verdener = trekkVerdener(state, sete, this.verdener, this.rng);
    if (verdener.length === 0) return null;

    let beste: Par | null = null;
    let besteVerdi = -Infinity;
    for (const p of utvalg) {
      let sum = 0;
      for (const hender of verdener) {
        const v0 = medVerden(state, hender, sete);
        // VRAK, så VELG – paret må utføres som ETT trekk gjennom motoren,
        // ellers måler vi vraket under en annen trumf enn det ble valgt for.
        let s = utfør(v0, { type: "VRAK", spiller: sete, kort: p.vrak }).state;
        const kand = lovligeEtterlys(s, p.trumf);
        s = utfør(s, {
          type: "VELG",
          spiller: sete,
          trumf: p.trumf,
          etterlyst: kand.length > 0 ? kand[kand.length - 1]! : null,
        }).state;
        let vakt = 0;
        while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
          s = utfør(s, this.motpart.velgHandling(s)).state;
        }
        const egne = s.totalPoeng[sete] ?? 0;
        sum += egne - (s.totalPoeng.reduce((a, b) => a + b, 0) - egne) / 3;
      }
      const snitt = sum / verdener.length;
      if (snitt > besteVerdi) {
        besteVerdi = snitt;
        beste = p;
      }
    }
    if (beste === null) return null;
    this.valgt = beste.trumf;
    return { type: "VRAK", spiller: sete, kort: beste.vrak };
  }
}
