/**
 * A8 — ALPHA-MU MED M≥2. Fusjon utover roten.
 *
 * `sdpar` med `verdenKombi` er alpha-mu med **M=1**: kriteriet virker i roten,
 * og deretter spilles hver verden ut hver for seg med policyen. Fusjonen er
 * dermed tilbake ved hver av de elleve neste beslutningene — vi later fortsatt
 * som vi vil vite hvilken verden vi er i før neste kort.
 *
 * Dette er den ekte formen (Cazenave & Ventos): søk M nivåer over VÅRE EGNE
 * beslutninger, der hver kandidat bærer en VEKTOR av utfall — ett per verden —
 * og dominerte vektorer beskjæres.
 *
 * ================= HVORFOR VEKTORER OG IKKE SNITT ========================
 *
 * En strategi må velges ÉN gang for hele informasjonsmengden. Tar man snittet
 * per nivå, kan søket velge kort A i verden 1 og kort B i verden 2 — en
 * «strategi» som ikke finnes, fordi vi ikke vet hvilken verden vi er i.
 *
 * Ved å bære vektoren gjennom hele treet blir det umulig: én gren = én
 * strategi = ett kort per informasjonsmengde, evaluert i alle verdener
 * samtidig. Det er hele poenget, og det er den ene formen i litteraturen som
 * angriper feilmoden vi har målt to ganger (`eks:` §56, `juks:` §58).
 *
 * ================= PARETO-BESKJÆRINGEN ===================================
 *
 * Vektor a DOMINERER b hvis a er minst like god i ALLE verdener og strengt
 * bedre i minst én. Dominerte grener kan forkastes uten tap, uansett hvilket
 * kriterium som til slutt brukes — det er beskjæringen som gjør M≥2 mulig.
 *
 * Fronten begrenses av `maksFront` fordi den i verste fall vokser
 * eksponentielt. Beskjæres den, er søket ikke lenger eksakt, og det skal stå
 * her: taket er en KOSTNADSGRENSE, ikke en del av algoritmen.
 *
 * ================= KOSTNADEN, ÆRLIG =====================================
 *
 * Hvert nivå multipliserer med forgreiningen (~3 lovlige kort sent i runden,
 * flere tidlig). M=2 er altså ~3x M=1, M=3 er ~9x. Førersøket koster i dag
 * 198 ms per trekk; M=3 blir sekunder. Derfor er `M` et argument og ikke en
 * konstant, og derfor står A8 SIST i §79: den er bare verdt kostnaden når A1
 * har gjort verdenene riktige.
 */

import { lovligeKort, utfør, type GameState, type Handling } from "../motor.ts";
import type { Kort } from "../kort.ts";
import { medVerden, type Utspiller } from "./sdkort.ts";

export interface AlphaMuOpts {
  /** Antall EGNE beslutninger å søke over. M=1 er dagens oppførsel. */
  readonly M: number;
  /** Utfallsmål per verden, sett fra `spiller`. */
  readonly mål: (s: GameState, spiller: number) => number;
  /** Policyen alle ANDRE seter spiller med, i alle verdener. */
  readonly motpart: Utspiller;
  /** Tak på Pareto-frontens størrelse. Beskjæring gjør søket inexakt. */
  readonly maksFront?: number;
}

/** En gren: kortet i roten, og utfallet i hver verden. */
export interface Gren {
  readonly kort: Kort;
  readonly vektor: number[];
}

const snitt = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);

/** Dominerer a b? Minst like god overalt, strengt bedre ett sted. */
function dominerer(a: readonly number[], b: readonly number[]): boolean {
  let strengt = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]! < b[i]!) return false;
    if (a[i]! > b[i]!) strengt = true;
  }
  return strengt;
}

/** Fjerner dominerte vektorer. Rekkefølgen bevares for determinisme. */
export function paretoFront<T extends { vektor: number[] }>(grener: T[], maks: number): T[] {
  const ut: T[] = [];
  for (const g of grener) {
    if (ut.some((o) => dominerer(o.vektor, g.vektor))) continue;
    for (let i = ut.length - 1; i >= 0; i--) if (dominerer(g.vektor, ut[i]!.vektor)) ut.splice(i, 1);
    ut.push(g);
  }
  if (ut.length <= maks) return ut;
  // BESKJÆRING: behold de med høyest snitt. Det er en kostnadsgrense, og den
  // gjør søket inexakt — derfor er den eksplisitt og ikke skjult.
  return ut
    .slice()
    .sort((a, b) => snitt(b.vektor) - snitt(a.vektor))
    .slice(0, maks);
}

/** Spiller hver verden fram til `spiller` skal handle igjen, eller til slutt. */
function framTilVårTur(verdener: GameState[], spiller: number, motpart: Utspiller): GameState[] {
  return verdener.map((s0) => {
    let s = s0;
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 200) {
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      if (iTur === spiller && s.fase === "SPILL") break;
      s = utfør(s, motpart.velgHandling(s)).state;
    }
    return s;
  });
}

/** Spiller én tilstand helt ferdig med policyen. */
function tilSlutt(start: GameState, motpart: Utspiller): GameState {
  let t = start;
  let vakt = 0;
  while (t.fase !== "FERDIG" && t.fase !== "RUNDE_SLUTT" && vakt++ < 200) {
    const iTur = t.fase === "VRAK" || t.fase === "VELG" ? t.budvinner : t.iTur;
    if (iTur === null || iTur === undefined) break;
    t = utfør(t, motpart.velgHandling(t)).state;
  }
  return t;
}

/**
 * ALPHA-MU. Gir én gren per lovlig kort i roten, med utfallsvektoren over
 * verdenene når vi følger den beste fortsettelsen KONSISTENT i alle.
 */
export function alphaMu(
  state: GameState,
  spiller: number,
  verdenerHender: readonly number[][][],
  opts: AlphaMuOpts,
): Gren[] {
  const maksFront = opts.maksFront ?? 16;

  function søk(verdener: GameState[], dybde: number): { vektor: number[] }[] {
    const klare = framTilVårTur(verdener, spiller, opts.motpart);
    const våreTurer = klare.filter((s) => s.fase === "SPILL" && s.iTur === spiller);
    if (dybde <= 0 || våreTurer.length === 0) {
      return [{ vektor: klare.map((s) => opts.mål(tilSlutt(s, opts.motpart), spiller)) }];
    }

    /**
     * KORTET MÅ VÆRE LOVLIG I ALLE VERDENER, og det er selve poenget: en
     * strategi som krever et kort vi bare har i noen verdener, finnes ikke.
     * I roten er hånden vår lik i alle verdener, men lengre ned kan
     * følg-farge-plikten skille dem.
     */
    let felles: Map<string, Kort> | null = null;
    for (const s of våreTurer) {
      const lov = new Map(lovligeKort(s, spiller).map((k) => [`${k.farge}${k.verdi}`, k]));
      if (felles === null) felles = lov;
      else for (const id of [...felles.keys()]) if (!lov.has(id)) felles.delete(id);
    }
    if (felles === null || felles.size === 0) {
      return [{ vektor: klare.map((s) => opts.mål(tilSlutt(s, opts.motpart), spiller)) }];
    }

    const grener: { vektor: number[] }[] = [];
    for (const kort of felles.values()) {
      const etter = klare.map((s) =>
        s.fase === "SPILL" && s.iTur === spiller
          ? utfør(s, { type: "SPILL", spiller, kort } as Handling).state
          : s,
      );
      for (const g of søk(etter, dybde - 1)) grener.push(g);
    }
    return paretoFront(grener, maksFront);
  }

  const rot = verdenerHender.map((h) => medVerden(state, h, spiller));
  const ut: Gren[] = [];
  for (const kort of lovligeKort(state, spiller)) {
    const etter = rot.map((s) => utfør(s, { type: "SPILL", spiller, kort } as Handling).state);
    const front = søk(etter, opts.M - 1);
    /**
     * Én fortsettelse for HELE informasjonsmengden. Vi velger den beste over
     * fronten etter snitt; kriteriet over verdener i ROTEN tas av kalleren
     * (`verdenKombi`), slik at de to nivåene kan sveipes hver for seg.
     */
    let beste = front[0]!;
    for (const g of front) if (snitt(g.vektor) > snitt(beste.vektor)) beste = g;
    ut.push({ kort, vektor: beste.vektor });
  }
  return ut;
}
