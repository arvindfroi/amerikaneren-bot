/**
 * VRAK OG TRUMF, ANDRE FORSØK — med Arvinds krav som INVARIANTER.
 *
 * FØRSTE FORSØK (`vrakvelg.ts`) målte +0,189 ± 0,104 med jevn tegntest, og
 * forklaringen ble skrevet ned: ved vrak er ingenting spilt ennå, så
 * verdensrommet er på sitt aller største — 3,8 × 10¹⁴ forenlige verdener målt
 * i stikk 0 — og 24 utvalg er nesten ingenting.
 *
 * DENNE VERSJONEN ANGRIPER NØYAKTIG DET, på tre måter:
 *
 *   1. BUDPRIOR PÅ VERDENENE. Budvinneren vet hva alle bød. Verdenene trekkes
 *      derfor med `Motstandermodell` som vekt, så utvalget ikke er uniformt
 *      over et astronomisk rom, men skjevt mot det budene faktisk avslørte.
 *      Det krymper ikke rommet, men det gjør at få utvalg bærer mer.
 *
 *   2. POLICYER, IKKE EN HEURISTIKK. Kandidatene lages av navngitte regler som
 *      kan slås av og på hver for seg — samme mønster som `vakt:<flagg>`, der
 *      `b` ble målt til å bære nesten hele gevinsten mens `a` alene var
 *      skadelig. Et vektet uttrykk som `trumfLengde * 2 + ess * 1,5` er fire
 *      gjettede tall som ikke kan måles hver for seg; fire flagg kan.
 *
 *      Og fordi policyene lager FÅ kandidater, trengs ingen rangering i det
 *      hele tatt: SD evaluerer alle som slipper gjennom. Vektene forsvinner,
 *      de blir ikke bare skjult.
 *
 *   3. HARDE SKRANKER, ikke preferanser. Arvind: «den skal alltid ta inn trumf
 *      og ess hvis mulig, og den skal aldri vrake trumf og ess.» Det er
 *      håndhevet i kandidatgenereringen — trumf og ess legges ALDRI i
 *      utvalgspoolen. En invariant evalueringen ikke kan overkjøre, og som er
 *      testet direkte.
 *
 * RENONSE VURDERES EKSPLISITT. «Den skal også vurdere om mulig renons gir
 * fordel.» Kandidatgeneratoren lager alltid de vrakene som TØMMER en sidefarge,
 * når det lar seg gjøre uten å bryte skrankene — så evalueringen får velge
 * mellom «tøm en farge» og «kast de laveste» på like vilkår.
 *
 * TRUMFEN SENDES VIDERE. Paret velges ved VRAK, og trumfen huskes til VELG.
 * Uten den koblingen ville vraket blitt vurdert under én trumf og spilt under
 * en annen — som er nøyaktig det NevroHjerne gjør i dag.
 */

import { lagRng, FARGER, type Farge, type Kort } from "../kort.ts";
import { lovligeEtterlys, utfør, type GameState, type Handling } from "../motor.ts";
import { medVerden, trekkVerdener, type Utspiller } from "./sdkort.ts";
import { BOTTABELL, Motstandermodell } from "./motstander.ts";

/**
 * KANDIDATPOLICYENE. Hver bokstav er én regel som kan måles for seg.
 *
 *   t  ALDRI vrak trumf            (Arvinds skranke, hard)
 *   e  ALDRI vrak ess              (Arvinds skranke, hard)
 *   l  kast de laveste             (referansen alt annet måles mot)
 *   r  tøm ÉN kort sidefarge       (renonse — «da kan man bruke trumf»)
 *   d  tøm TO korte sidefarger     (dobbel renonse)
 *   k  behold konger sammen med ess (utvider skranken oppover)
 *
 * `t` og `e` FJERNER kort fra poolen; `l`, `r`, `d` LAGER kandidater. Uten
 * minst én av de tre siste finnes ingen kandidater, og velgeren faller
 * tilbake til det indre laget.
 */
export interface Vrakpolicy {
  readonly ikkeTrumf: boolean;
  readonly ikkeEss: boolean;
  readonly ikkeKonge: boolean;
  readonly laveste: boolean;
  readonly renonse: boolean;
  readonly dobbelRenonse: boolean;
}

export const INGEN_POLICY: Vrakpolicy = {
  ikkeTrumf: false,
  ikkeEss: false,
  ikkeKonge: false,
  laveste: false,
  renonse: false,
  dobbelRenonse: false,
};

/** Leser flaggstrengen, f.eks. «telrd». */
export function lesVrakflagg(flagg: string): Vrakpolicy {
  let v = INGEN_POLICY;
  for (const tegn of flagg) {
    if (tegn === "t") v = { ...v, ikkeTrumf: true };
    else if (tegn === "e") v = { ...v, ikkeEss: true };
    else if (tegn === "k") v = { ...v, ikkeKonge: true };
    else if (tegn === "l") v = { ...v, laveste: true };
    else if (tegn === "r") v = { ...v, renonse: true };
    else if (tegn === "d") v = { ...v, dobbelRenonse: true };
    else {
      throw new Error(
        `Ukjent vrakflagg «${tegn}» (t = ikke trumf, e = ikke ess, k = ikke konge, ` +
          `l = laveste, r = renonse, d = dobbel renonse)`,
      );
    }
  }
  return v;
}

export interface Vrakvelg2Opts {
  readonly verdener?: number;
  readonly frø?: number;
  /** Tak på antall kandidater som SD-evalueres. Vokter tidsbudsjettet. */
  readonly tak?: number;
  /** Bruk budprior når verdenene trekkes. */
  readonly budprior?: boolean;
  /** Kandidatpolicyene. Standard er «telrd». */
  readonly policy?: Vrakpolicy;
}

interface Par {
  readonly trumf: Farge;
  readonly vrak: Kort[];
  readonly renonser: number;
}

const nøkkel = (k: Kort): string => `${k.farge}${k.verdi}`;

/**
 * Kandidater for én trumffarge.
 *
 * SKRANKEN: poolen inneholder verken trumf eller ess. Det er Arvinds regel,
 * håndhevet ved konstruksjon i stedet for ved straff — en evaluering på 24
 * støyete verdener kan ikke overkjøre den.
 */
function kandidaterFor(
  hånd: readonly Kort[],
  trumf: Farge,
  antall: number,
  pol: Vrakpolicy,
): Par[] {
  const pool = hånd.filter(
    (k) =>
      !(pol.ikkeTrumf && k.farge === trumf) &&
      !(pol.ikkeEss && k.verdi === 14) &&
      !(pol.ikkeKonge && k.verdi === 13),
  );
  if (pool.length < antall) return []; // policyen gjør vraket umulig
  const lavest = pool.slice().sort((a, b) => a.verdi - b.verdi);
  const ut: Par[] = [];
  const sett = new Set<string>();

  const perFarge = new Map<Farge, Kort[]>();
  for (const k of hånd) perFarge.set(k.farge, [...(perFarge.get(k.farge) ?? []), k]);

  const legg = (vrak: Kort[]): void => {
    if (vrak.length !== antall) return;
    const n = vrak.map(nøkkel).sort().join(",");
    if (sett.has(n)) return;
    sett.add(n);
    // Hvor mange farger blir TOMME av dette vraket? Renonse er verdt noe i seg
    // selv - da kan trumfen brukes - og telles her så trakten kan se det.
    const igjen = new Map<Farge, number>();
    for (const [f, ks] of perFarge) igjen.set(f, ks.length);
    for (const k of vrak) igjen.set(k.farge, (igjen.get(k.farge) ?? 0) - 1);
    let renonser = 0;
    for (const [f, n2] of igjen) if (f !== trumf && n2 === 0) renonser++;
    ut.push({ trumf, vrak, renonser });
  };

  if (pol.laveste) legg(lavest.slice(0, antall));

  // RENONSE: tøm en hel sidefarge når den får plass innenfor policyen. En
  // farge som inneholder et kort policyen forbyr å vrake, kan ikke tømmes.
  const forbudt = (k: Kort): boolean =>
    (pol.ikkeEss && k.verdi === 14) || (pol.ikkeKonge && k.verdi === 13);
  const korte = [...perFarge.entries()]
    .filter(([f, ks]) => f !== trumf && ks.length <= antall && !ks.some(forbudt))
    .sort((a, b) => a[1].length - b[1].length);

  if (pol.renonse) for (const [f, ks] of korte) {
    const rest = lavest.filter((k) => k.farge !== f);
    legg([...ks, ...rest.slice(0, antall - ks.length)]);
  }
  if (pol.dobbelRenonse) for (let i = 0; i < korte.length; i++) {
    for (let j = i + 1; j < korte.length; j++) {
      const a = korte[i]![1];
      const b = korte[j]![1];
      if (a.length + b.length > antall) continue;
      const brukt = new Set([...a, ...b].map(nøkkel));
      const rest = lavest.filter((k) => !brukt.has(nøkkel(k)));
      legg([...a, ...b, ...rest.slice(0, antall - a.length - b.length)]);
    }
  }
  return ut;
}

export class Vrakvelger2 {
  private readonly indre: { velgHandling(s: GameState): Handling; nyKamp(): void };
  private readonly motpart: Utspiller;
  private readonly verdener: number;
  private readonly tak: number;
  private readonly policy: Vrakpolicy;
  private readonly rng: () => number;
  private readonly prior: Motstandermodell | null;
  private valgt: Farge | null = null;

  constructor(
    indre: { velgHandling(s: GameState): Handling; nyKamp(): void },
    motpart: Utspiller,
    opts: Vrakvelg2Opts = {},
  ) {
    this.indre = indre;
    this.motpart = motpart;
    this.verdener = opts.verdener ?? 24;
    this.tak = opts.tak ?? 16;
    this.policy = opts.policy ?? lesVrakflagg("telrd");
    this.rng = lagRng(opts.frø ?? 20_260_807);
    // BOTTABELL, ikke familietabellen: i selvspill byr `bud-gbt.json`, ikke et
    // menneske, og de to byr målbart ulikt.
    this.prior = (opts.budprior ?? true) ? new Motstandermodell(BOTTABELL) : null;
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
      // Høyeste lovlige etterlysning. Målt 4. august: nest høyeste koster
      // −0,911 og tredje høyeste −1,641. Regelen er riktig, og skal stå.
      return {
        type: "VELG",
        spiller: state.budvinner,
        trumf,
        etterlyst: kand.length > 0 ? kand[kand.length - 1]! : null,
      };
    }
    return this.indre.velgHandling(state);
  }

  private velgPar(state: GameState, sete: number): Handling | null {
    const hånd = state.hender[sete] ?? [];
    const antall = state.giving.talong;
    if (antall <= 0 || hånd.length <= antall) return null;

    // POLICYENE lager kandidatene. Ingen rangering, ingen vekter: SD
    // evaluerer alle som slipper gjennom. Med «telrd» blir det høyst fire
    // trumffarger x (1 laveste + inntil 3 renonser + inntil 3 doble) = 28,
    // og taket kutter resten om en hånd er uvanlig fordelt.
    const alle: Par[] = [];
    for (const trumf of FARGER) alle.push(...kandidaterFor(hånd, trumf, antall, this.policy));
    if (alle.length === 0) return null;
    const finalister = alle.slice(0, this.tak);

    const verdener = trekkVerdener(
      state,
      sete,
      this.verdener,
      this.rng,
      this.prior === null
        ? undefined
        : {
            logVekt: (spiller, bud, h) => this.prior!.logVekt(spiller, bud, h),
          },
    );
    if (verdener.length === 0) {
      // Ingen verden lot seg trekke: bruk heuristikkens beste i stedet for å
      // gi opp. Skrankene holder uansett, så valget er trygt om ikke optimalt.
      const beste = finalister[0]!;
      this.valgt = beste.trumf;
      return { type: "VRAK", spiller: sete, kort: beste.vrak };
    }

    let beste: Par | null = null;
    let besteVerdi = -Infinity;
    for (const p of finalister) {
      let sum = 0;
      for (const hender of verdener) {
        let s = utfør(medVerden(state, hender, sete), {
          type: "VRAK",
          spiller: sete,
          kort: p.vrak,
        }).state;
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
