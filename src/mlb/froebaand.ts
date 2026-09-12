/**
 * FRØBÅND OG DELTE GIV — én kilde til sannhet.
 *
 * ===================== HVORFOR DENNE FILA FINNES =====================
 *
 * Kontrollen prosjektet har brukt på frøbånd er «tell unike frø i hver gruppe og kryss dem:
 * 0 delte frø». Den er nødvendig og den er ikke tilstrekkelig, og forskjellen er målbar.
 *
 * `blandeSeed(frø, r) = (frø + (r+1)·2654435761) mod 2³²` (`src/motor.ts`) er LINEÆR i frøet.
 * Runde r i kamp A og runde s i kamp B får derfor NØYAKTIG samme kortgiving når
 *
 *     frøA − frøB ≡ (s − r) · 2654435761   (mod 2³²)
 *
 * To ULIKE frø, samme 52 kort i samme hender. Deles en slik giv mellom treningsdata og en
 * holdout — eller verre, K8-PRØVEN som dommen faller på — er fasiten lekket, og frøkontrollen
 * ser ingenting, fordi frøene er forskjellige.
 *
 * Med steg 7717 var det nesten aldri et problem ved uhell: målt deler det utgåtte
 * treningsbåndet 8 giv med K8-prøven. Med steg 1 (nødvendig for å få plass til millioner av
 * kamper under 2³¹) blir båndet TETT, og da treffer det 45 837 av 16 000 000. Derfor filtreres
 * frøene her i stedet for å håpe.
 *
 * ===================== HVA SOM ER VERNET =====================
 *
 * Ikke alle delte giv er lekkasje. En delt giv med `mlb-epoke` sitt styrkebånd betyr bare at
 * to ulike forsøk så samme kortfordeling. Lista under er båndene der en delt giv med
 * TRENINGSDATA for trohodet faktisk ødelegger et måltall.
 */

const TO32 = 2 ** 32;

/** Konstanten i `blandeSeed` (`src/motor.ts`). Endres den, er hele denne fila om noe annet. */
export const RUNDE_BLANDING = 2_654_435_761;

/**
 * Taket på `--maksrunder` som båndbeviset er ført for. Runde-differansen m er < dette, og
 * den minste forbudte frøavstanden (21 581 449) følger av nettopp det taket.
 */
export const KAMP_MAKSRUNDER_TAK = 128;

export interface Frøbånd {
  readonly navn: string;
  readonly base: number;
  readonly steg: number;
  readonly maks: number;
}

/** Båndene der en delt giv med treningsdata er ekte lekkasje. */
export const VERNEDE_BÅND: readonly Frøbånd[] = [
  // Trohodets egen holdout for `--kamp`.
  { navn: "kamp-holdout", base: 1_985_000_000, steg: 7717, maks: 1_500 },
  // DOMMEN. `examples/tro-noyaktighet.ts` / `examples/mlb-k8.ts` måler K8 på dette båndet.
  { navn: "K8-proeven", base: 12_000_000, steg: 6151, maks: 100_000 },
  // Holdout for korpuset uten `--kamp`.
  { navn: "trodata-holdout", base: 1_100_000_000, steg: 7717, maks: 20_000 },
];

/**
 * Alle frøavstander som gir samme giv, som ikke-negative rester mod 2³².
 * m = 0 er med: det er tilfellet «samme frø», altså det frøkontrollen alt fanger.
 */
export function forbudteAvstander(tak: number = KAMP_MAKSRUNDER_TAK): number[] {
  const ut: number[] = [];
  for (let m = -(tak - 1); m <= tak - 1; m++) {
    ut.push((((m * RUNDE_BLANDING) % TO32) + TO32) % TO32);
  }
  return ut;
}

/** Regnet én gang: 255 rester for standardtaket. */
const FORBUDTE = forbudteAvstander();

/**
 * Deler dette frøet en giv med et vernet bånd? Returnerer båndets navn, eller null.
 *
 * Kalles én gang per kamp (en kamp tar ~1 s), og koster 255 × antall bånd heltallsoperasjoner.
 */
export function delerGiv(
  frø: number,
  bånd: readonly Frøbånd[] = VERNEDE_BÅND,
  avstander: readonly number[] = FORBUDTE,
): string | null {
  for (const d of avstander) {
    const t = (((frø - d) % TO32) + TO32) % TO32;
    for (const b of bånd) {
      const q = t - b.base;
      if (q >= 0 && q % b.steg === 0 && q / b.steg < b.maks) return b.navn;
    }
  }
  return null;
}
