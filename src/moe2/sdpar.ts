/**
 * PARRET SD: forbedringsoperatoren, med usikkerheten beholdt.
 *
 * HVORFOR DEN FINNES. `vurderSD` trekker verdenene én gang og evaluerer alle
 * kandidatene i NØYAKTIG de samme – parringen er allerede riktig. Men den
 * returnerer bare snittet per kandidat og kaster spredningen. Da kan ingen se
 * om det beste kortets forsprang er ekte eller trukket flaks, og `argmax` over
 * K=12 støyete anslag er vinnerens forbannelse: det kortet som tilfeldigvis
 * fikk de snilleste verdenene vinner.
 *
 * DET ER MÅLT, IKKE ANTATT. 3. august ble SD-orakelet satt inn som spiller i
 * én rolle om gangen mot nettet det selv lærte opp (`ork:`-benken):
 *
 *     spillefører  −0,357     makker  −0,078     forsvar  −0,153
 *
 * Orakelet er DÅRLIGERE enn eleven i alle tre roller. En forbedringsoperator
 * som gjør policyen verre kan ingen mengde destillasjon redde – og det
 * forklarer hvorfor fem trekk-blokker på 278k rader alle målte null.
 *
 * KUREN ER IKKE FLERE VERDENER, DET ER Å VITE NÅR MAN IKKE VET.
 * Fordi alle kandidatene deles om de samme verdenene, er den riktige
 * statistikken den PARREDE differansen per verden:
 *
 *     d_w = verdi(beste, w) − verdi(nest beste, w)
 *
 * Verden-effekten – «denne giva var snill mot alle» – kansellerer i d_w, så
 * SE-en blir langt mindre enn to uavhengige SE-er lagt sammen. Med den kan
 * operatoren si «jeg vet ikke» i stedet for å gjette, og bare overstyre der
 * forspranget overstiger støyen.
 *
 * DET GJØR OPERATOREN KONSERVATIV, OG DET ER MENINGEN. En operator som bare
 * flytter policyen der den er sikker, kan i verste fall la den stå. En som
 * flytter overalt, flytter den mot støy tre av fire ganger.
 */

import { lovligeKort, utfør, type GameState, type Handling } from "../motor.ts";
import type { Verden } from "../solver/sampler.ts";
import type { Kort } from "../kort.ts";
import { medVerden, standardMål, trekkVerdener, type Utspiller } from "./sdkort.ts";
import { lagHvemLaVekt } from "./hvemla-slutning.ts";

export interface ParOpts {
  /**
   * Kandidatverdener importance-samplingen får VELGE MELLOM.
   *
   * Sto på 3 – og med tre å velge blant har vektingen nesten ingenting å
   * velge blant. Målt for trosnettet 6. august: +0,68 pp verdenskvalitet ved
   * 3 kandidater mot +2,62 ved 32. Budvektingen har hatt samme begrensning
   * hele tiden, og `vurderPar` sendte tallet ikke engang videre.
   *
   * BILLIG: en kandidat koster én TREKNING, ikke én utspilling, og
   * utspillingene er ~30x dyrere.
   */
  readonly verdenKandidater?: number;
  /**
   * ALPHA-MU-KRITERIET: hvordan utfallene over VERDENER slås sammen til én
   * rangering.
   *
   *   snitt    PIMC. Standard, og bit-identisk med før.
   *   min      maksimin over verdener.
   *   kvantil  nedre kvartil — maksimin uten at én katastrofeverden bestemmer.
   *   flest    i hvor mange verdener er kortet best? alpha-muens Pareto-tanke
   *            i skalar form.
   *
   * HVORFOR DEN FINNES. PIMC-middelet lar et kort se bra ut fordi det er
   * strålende i noen verdener og katastrofalt i andre, og velger det som om vi
   * fikk vite hvilken verden vi er i. Det er strategifusjon, og den er MÅLT to
   * ganger her: `eks:` (§56) og `juks:` (§58) døde begge av den. Dette er den
   * ene formen i litteraturen som angriper den direkte.
   *
   * `sigma` og `beste` regnes fortsatt fra SNITTET uansett kriterium — porten
   * skal måle hvor tydelig valget er, ikke hvilket kriterium som brukes.
   */
  readonly verdenKombi?: "snitt" | "min" | "kvantil" | "flest";
  /**
   * A1: vekt kandidatverdenene etter SPILLET, ikke bare budrunden. Se
   * `src/moe2/spillvekt.ts`. Av som standard - ingen stille regresjon.
   */
  readonly spillvekt?: boolean;
  /**
   * TROEN I VERDENENE (11. sep): vektfunksjonen for DENNE stillingen, bygd av
   * kalleren — se `lagTrovektFraVisning` i `troprior.ts`.
   *
   * Utelukker `spillvekt`. A1 og troen leser det samme beviset (hodet i
   * `verdensvekt.ts`), og begge på samtidig ville telt det to ganger. Det er en
   * feil å be om begge, ikke et valg, så det kastes.
   */
  readonly trovekt?: (v: Verden) => number;
  /** Budvekten på kandidatverdenene. Standard på; av når troen selv leser budet. */
  readonly budvekt?: boolean;
  /**
   * FRISTEN, i `klokke()`-millisekunder. Utspillingen går VERDEN FOR VERDEN, og en
   * verden som ikke rakk fristen tas ikke med for NOEN kandidat — marginen er
   * fortsatt parvis over nøyaktig de samme verdenene. Udefinert = ingen frist, og
   * all måling går uten.
   */
  readonly frist?: number;
  /** Klokka fristen måles mot. Standard `performance.now()`; prøvene setter sin egen. */
  readonly klokke?: () => number;
  readonly verdener: number;
  readonly rng: () => number;
  readonly mål?: (sluttState: GameState, spiller: number) => number;
}

export interface ParKandidat {
  readonly kort: Kort;
  /** Snittverdi over verdenene. */
  readonly snitt: number;
  /** Verdien i hver enkelt verden – grunnlaget for den parrede differansen. */
  readonly perVerden: readonly number[];
}

export interface ParResultat {
  readonly kandidater: readonly ParKandidat[];
  /** Antall verdener som faktisk lot seg trekke. */
  readonly n: number;
  /** Beste kandidat etter snitt. */
  readonly beste: ParKandidat;
  /** Nest beste etter snitt, eller null om det bare fantes én kandidat. */
  readonly nestBeste: ParKandidat | null;
  /**
   * PARRET margin: snittet av (beste − nest beste) per verden. Identisk med
   * differansen av snittene, men SE-en under hører til DENNE størrelsen.
   */
  readonly margin: number;
  /** SE til marginen, regnet på de parvise differansene. NaN om n < 2. */
  readonly marginSE: number;
  /** margin / marginSE. 0 når SE er 0 eller udefinert. */
  readonly sigma: number;
}

function spillFerdig(start: GameState, motpart: Utspiller): GameState {
  let s = start;
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
    s = utfør(s, motpart.velgHandling(s)).state;
  }
  return s;
}

/**
 * Vurderer hvert lovlige kort i K FELLES verdener og beholder verdien per
 * verden, så marginen mellom de to beste kan testes parvis.
 *
 * Returnerer null når ingen verden lot seg trekke, eller når det bare finnes
 * ett lovlig kort. Kalleren skal da la policyen stå – «ingen data» er ikke det
 * samme som «alle valg er like gode», og å blande dem sammen er feilen som
 * gjorde `lærForsvar` verre enn ingenting.
 */
export function vurderPar(
  state: GameState,
  spiller: number,
  motpart: Utspiller,
  opts: ParOpts,
): ParResultat | null {
  const lovlige = lovligeKort(state, spiller);
  if (lovlige.length < 2) return null;
  if (opts.spillvekt === true && opts.trovekt !== undefined) {
    throw new Error("vurderPar: spillvekt og trovekt leser det samme beviset - velg én");
  }

  const verdener = trekkVerdener(
    state,
    spiller,
    opts.verdener,
    opts.rng,
    undefined,
    opts.trovekt ?? (opts.spillvekt === true ? lagHvemLaVekt(state, spiller) : undefined),
    opts.verdenKandidater,
    undefined,
    opts.budvekt ?? true,
  );
  if (verdener.length === 0) return null;
  const mål = opts.mål ?? standardMål;
  const klokke = opts.klokke ?? ((): number => performance.now());

  /**
   * VERDEN FOR VERDEN, ikke kort for kort (11. sep). Det er det som gjør fristen
   * mulig uten å ødelegge parringen: en verden er enten spilt ut for ALLE kandidatene
   * eller for ingen. Rekkefølgen endrer ingen verdi — motparten er tilstandsløs i SPILL
   * (E1, vakt og budagent holder ingenting mellom kall der), og hver utspilling starter
   * fra sin egen `medVerden`. `test/sik-tro.test.ts` holder den gamle rekkefølgen som
   * referanse.
   */
  const verdier: number[][] = lovlige.map(() => []);
  let brukt = 0;
  for (const hender of verdener) {
    if (opts.frist !== undefined && klokke() >= opts.frist) break;
    for (let i = 0; i < lovlige.length; i++) {
      const h: Handling = { type: "SPILL", spiller, kort: lovlige[i]! };
      const etter = utfør(medVerden(state, hender, spiller), h).state;
      verdier[i]!.push(mål(spillFerdig(etter, motpart), spiller));
    }
    brukt++;
  }
  // Fristen rakk ikke én verden: «ingen data», og policyen skal stå.
  if (brukt === 0) return null;

  const kandidater: ParKandidat[] = lovlige.map((kort, i) => {
    const perVerden = verdier[i]!;
    const snitt = perVerden.reduce((a, b) => a + b, 0) / perVerden.length;
    return { kort, snitt, perVerden };
  });

  /**
   * RANGERINGEN. Med `snitt` er dette nøyaktig som før. De andre kriteriene
   * bruker `perVerden`, som allerede ble regnet ut — de koster ingen ekstra
   * utspillinger.
   */
  const vk = opts.verdenKombi ?? "snitt";
  const rang = new Map<ParKandidat, number>();
  if (vk === "flest") {
    for (const k of kandidater) rang.set(k, 0);
    for (let w = 0; w < brukt; w++) {
      let best = -Infinity;
      for (const k of kandidater) if (k.perVerden[w]! > best) best = k.perVerden[w]!;
      const vinnere = kandidater.filter((k) => k.perVerden[w]! >= best - 1e-9);
      for (const k of vinnere) rang.set(k, rang.get(k)! + 1 / vinnere.length);
    }
  } else {
    for (const k of kandidater) {
      if (vk === "snitt") {
        rang.set(k, k.snitt);
        continue;
      }
      const v = [...k.perVerden].sort((a, b) => a - b);
      rang.set(k, vk === "min" ? v[0]! : v[Math.floor(0.25 * (v.length - 1))]!);
    }
  }
  const sortert = kandidater.slice().sort((a, b) => rang.get(b)! - rang.get(a)!);
  const beste = sortert[0]!;
  const nestBeste = sortert[1] ?? null;

  if (nestBeste === null) {
    return {
      kandidater,
      n: brukt,
      beste,
      nestBeste: null,
      margin: 0,
      marginSE: Number.NaN,
      sigma: 0,
    };
  }

  // PARVIS per verden. Verden-effekten kansellerer her, og det er hele grunnen
  // til at kandidatene måtte dele verdener.
  const d = beste.perVerden.map((x, i) => x - nestBeste.perVerden[i]!);
  const margin = d.reduce((a, b) => a + b, 0) / d.length;
  let marginSE = Number.NaN;
  if (d.length > 1) {
    const varians = d.reduce((a, x) => a + (x - margin) ** 2, 0) / (d.length - 1);
    marginSE = Math.sqrt(varians / d.length);
  }
  const sigma = Number.isFinite(marginSE) && marginSE > 1e-12 ? margin / marginSE : 0;
  return { kandidater, n: brukt, beste, nestBeste, margin, marginSE, sigma };
}
