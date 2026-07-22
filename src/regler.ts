/**
 * Regelparametre, kortgiving, budrangering og poengberegning – nøyaktig
 * slik reglene i REGLER.md er beskrevet.
 */

/** Konfigurasjon for en kamp. Alle felt har fornuftige standardverdier. */
export interface GameRules {
  /** Antall spillere (3–6 støttes av companion-logikken; 4 er standard). */
  readonly antallSpillere: number;
  /**
   * Byttekort-varianten er standard (true): en talong deles ut som
   * budvinneren bytter med. false gir klassiske regler (kort deles helt
   * ut, ingen talong) – kun definert for 4 spillere (13 kort hver).
   */
  readonly medByttekort: boolean;
  /** Poengmål; først til dette vinner kampen. Standard 100. */
  readonly målPoeng: number;
}

export const STANDARD_REGLER: GameRules = {
  antallSpillere: 4,
  medByttekort: true,
  målPoeng: 100,
};

export function lagRegler(overstyr: Partial<GameRules> = {}): GameRules {
  const r = { ...STANDARD_REGLER, ...overstyr };
  if (r.antallSpillere < 3 || r.antallSpillere > 6) {
    throw new Error("antallSpillere må være mellom 3 og 6");
  }
  if (r.målPoeng <= 0) {
    throw new Error("målPoeng må være positivt");
  }
  if (!r.medByttekort && r.antallSpillere !== 4) {
    throw new Error("Klassiske regler (uten byttekort) er kun definert for 4 spillere");
  }
  return r;
}

export interface Kortgiving {
  /** Antall kort hver spiller får på hånden ved start. */
  readonly kortPerSpiller: number;
  /** Antall kort i talongen (byttekortene). 0 ved klassiske regler. */
  readonly talong: number;
  /** Antall stikk i runden = antall kort hver spiller ender opp med. */
  readonly antallStikk: number;
}

/**
 * Kortfordeling per spillerantall (byttekort-varianten):
 *  3 → 17 kort / 1 talong, 4 → 12/4, 5 → 10/2, 6 → 8/4.
 * Klassisk (4 spillere, uten byttekort): 13 kort, ingen talong.
 */
export function kortgiving(regler: GameRules): Kortgiving {
  if (!regler.medByttekort) {
    return { kortPerSpiller: 13, talong: 0, antallStikk: 13 };
  }
  const perSpiller: Record<number, number> = { 3: 17, 4: 12, 5: 10, 6: 8 };
  const kortPerSpiller = perSpiller[regler.antallSpillere]!;
  const talong = 52 - kortPerSpiller * regler.antallSpillere;
  // Budvinneren tar opp talongen og vraker like mange – hånden er
  // dermed kortPerSpiller også i spillefasen, altså like mange stikk.
  return { kortPerSpiller, talong, antallStikk: kortPerSpiller };
}

// ---------------------------------------------------------------------------
// Bud
// ---------------------------------------------------------------------------

export const AMERIKANER = "AMERIKANER" as const;
export const SOLO = "SOLO" as const;
export const PASS = "PASS" as const;

/** Et bud er enten et tall (5..antallStikk), Amerikaner, Solo eller pass. */
export type Bud = number | typeof AMERIKANER | typeof SOLO | typeof PASS;

export const MINSTE_TALLBUD = 5;

/**
 * Rangerer et forpliktende bud (ikke pass) som et tall for sammenligning.
 * Tallbud n → n. Amerikaner → høyere enn alle tallbud. Solo → høyest.
 */
export function budRang(bud: Exclude<Bud, typeof PASS>): number {
  if (bud === AMERIKANER) return 1000;
  if (bud === SOLO) return 2000;
  return bud;
}

/** Er `bud` et lovlig, høyere bud enn nåværende høyeste (evt. ingen)? */
export function erHøyereBud(
  bud: Bud,
  nåværendeHøyeste: Exclude<Bud, typeof PASS> | null,
  antallStikk: number,
): boolean {
  if (bud === PASS) return true; // pass er alltid lov
  if (typeof bud === "number") {
    if (!Number.isInteger(bud)) return false;
    if (bud < MINSTE_TALLBUD || bud > antallStikk) return false;
  }
  if (nåværendeHøyeste === null) return true;
  return budRang(bud) > budRang(nåværendeHøyeste);
}

// ---------------------------------------------------------------------------
// Poeng
// ---------------------------------------------------------------------------

export type Meldingstype = "tall" | "amerikaner" | "solo";

export interface Meldingsinfo {
  readonly type: Meldingstype;
  /** Budtallet ved tallbud (ellers uten betydning). */
  readonly bud: number;
}

/** Klassifiserer det vinnende budet. */
export function meldingsinfo(bud: Exclude<Bud, typeof PASS>): Meldingsinfo {
  if (bud === AMERIKANER) return { type: "amerikaner", bud: 0 };
  if (bud === SOLO) return { type: "solo", bud: 0 };
  return { type: "tall", bud };
}

export interface PoengInput {
  readonly regler: GameRules;
  readonly melding: Meldingsinfo;
  readonly antallStikk: number;
  /** Antall spillere. */
  readonly antallSpillere: number;
  readonly budvinner: number;
  /** Hemmelig makker, eller null (solo, eller ingen fant kortet). */
  readonly makker: number | null;
  /** Stikk vunnet per spiller (indeks = spiller). */
  readonly stikkPerSpiller: readonly number[];
}

export interface PoengResultat {
  /** Poengendring per spiller denne runden. */
  readonly delta: number[];
  /** Ble budet innfridd? */
  readonly klart: boolean;
  /** Antall stikk budlaget tok til sammen. */
  readonly lagStikk: number;
}

/**
 * Beregner rundepoeng etter tabellen i REGLER.md.
 *
 * - Budlaget får poeng etter budet, ikke antall stikk (overstikk teller ikke).
 * - Budvinner får alltid dobbelt så mye som makkeren.
 * - Amerikaner-satsene skaleres med målet: ±mål/2 og ±mål/4 (solo ±mål).
 * - Øvrige spillere får +1 per eget stikk.
 */
export function beregnPoeng(inp: PoengInput): PoengResultat {
  const { melding, budvinner, makker, stikkPerSpiller, antallSpillere } = inp;
  const mål = inp.regler.målPoeng;
  const delta = new Array<number>(antallSpillere).fill(0);

  const erBudlag = (s: number): boolean => s === budvinner || s === makker;
  const leggTil = (spiller: number, poeng: number): void => {
    delta[spiller] = (delta[spiller] ?? 0) + poeng;
  };

  // Øvrige spillere får alltid +1 per eget stikk.
  for (let s = 0; s < antallSpillere; s++) {
    if (!erBudlag(s)) delta[s] = stikkPerSpiller[s] ?? 0;
  }

  const budvinnerStikk = stikkPerSpiller[budvinner] ?? 0;
  const makkerStikk = makker === null ? 0 : (stikkPerSpiller[makker] ?? 0);
  const lagStikk = budvinnerStikk + makkerStikk;

  if (melding.type === "tall") {
    const n = melding.bud;
    const klart = lagStikk >= n;
    const fortegn = klart ? 1 : -1;
    leggTil(budvinner, fortegn * 2 * n);
    if (makker !== null) leggTil(makker, fortegn * n);
    return { delta, klart, lagStikk };
  }

  if (melding.type === "amerikaner") {
    const klart = lagStikk === inp.antallStikk; // alle stikk
    const fortegn = klart ? 1 : -1;
    leggTil(budvinner, fortegn * (mål / 2));
    if (makker !== null) leggTil(makker, fortegn * (mål / 4));
    return { delta, klart, lagStikk };
  }

  // solo-amerikaner: budvinner alene tar alle stikk
  const klart = budvinnerStikk === inp.antallStikk;
  leggTil(budvinner, klart ? mål : -mål);
  return { delta, klart, lagStikk };
}
