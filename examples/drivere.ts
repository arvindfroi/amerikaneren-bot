/**
 * BORDET SOM EN POPULASJON — én spek per sete for datagenereringen (K6 → K8, K6.5). 11. sep.
 *
 * Adams Max-løkka lager data med SAMME bot i alle fire seter (`budq-data.ts`, `vrakq-data.ts`,
 * `mlb-trodata.ts --kamp`). Hukommelsen (`src/mlb/hukommelse.ts`) som 287-BudQ og 920-trohodet
 * leser, kan da lære lite: fire identiske motstandere har ingen vaner som skiller dem. Målt
 * tidligere: hukommelse → tro ga gevinst bare i et BLANDET bord, null i rene Adams-kamper.
 *
 * ===================== ÉN FORM FOR ALLE TRE GENERATORENE ================
 *
 *   --drivere "A|B|C|D"   fire speker, én per sete (absolutt sete 0–3). Tokenet `@` betyr
 *                         kandidaten, altså `--spek`. BARE seter med `@` REGISTRERES (bud,
 *                         vrak/kall, trorader); de andre spiller og observeres, men skrives
 *                         aldri. Minst ett `@` kreves – et bord uten kandidat gir ingen data.
 *   --rotasjon            setene roterer per kamp: i kamp k sitter slot (sete + k) mod 4 i
 *                         setet. Uten den sitter kandidaten fast, og alle radene hennes arver
 *                         én setefordel (giver i første runde, budrekkefølge).
 *
 * «Tre motstandere rundt kandidaten» er `--drivere "@|A|B|C"`. To kandidatseter
 * (`"@|A|@|B"`) gir dobbelt så mange rader per kamp, mot at hver kandidat har den andre
 * kandidaten som én av tre motstandere.
 *
 * UTSPILLINGENE (BudQ- og VrakQ-etikettene) bruker SAMME speker per sete som kampen. Etiketten
 * er «hva er dette valget verdt mot DETTE bordet», og en utspilling med kandidaten i alle
 * seter ville merket mot et bord som ikke finnes.
 *
 * ===================== STANDARDEN ER UENDRET ============================
 *
 * Uten `--drivere` er bordet fire ganger `--spek`, alle registrert, ingen rotasjon – og
 * generatorene bygger agentene i nøyaktig samme rekkefølge som før. `slot(sete) = sete`, så
 * hver agent sitter der den satt. `test/populasjon-drivere.test.ts` holder at utdataene er
 * byte-identiske med `--drivere "@|@|@|@"`.
 *
 * OBSERVER: generatorene gir `observer(state)` til ALLE agentinstansene på hver virkelige
 * tilstand, også RUNDE_SLUTT. Populasjonssetene er med i de samme listene.
 */

/** Tokenet i `--drivere` som betyr kandidaten (`--spek`). Ingen ekte spek er bare «@». */
export const KANDIDAT = "@";

export interface Bord {
  /** Spek per slot (0–3), med `@` allerede byttet ut med kandidaten. */
  readonly spek: readonly string[];
  /** Registreres slotten? Sant nøyaktig der `--drivere` hadde `@` (alle, uten flagget). */
  readonly opptak: readonly boolean[];
  readonly rotasjon: boolean;
  /** Står `--drivere` på kommandolinja? Til rapporter, så en blandet kjøring SIER at den er det. */
  readonly blandet: boolean;
}

/**
 * `--drivere`-teksten → bordet. `null` = flagget mangler: fire kandidater, alle registrert.
 *
 * Nøyaktig fire felt, ingen sykling: `mlb-k8.ts` sykler én spek over fire seter, men her
 * avgjør feltet også HVEM som registreres, og en stille syklet liste ville flyttet opptaket.
 */
export function lesDrivere(tekst: string | null, kandidat: string, rotasjon = false, antall = 4): Bord {
  if (tekst === null) {
    if (rotasjon) throw new Error("--rotasjon uten --drivere roterer fire like seter – det gjør ingenting");
    return {
      spek: new Array<string>(antall).fill(kandidat),
      opptak: new Array<boolean>(antall).fill(true),
      rotasjon: false,
      blandet: false,
    };
  }
  const felt = tekst.split("|").map((x) => x.trim());
  if (felt.length !== antall) {
    throw new Error(`--drivere må ha ${antall} speker skilt med «|», fikk ${felt.length}: «${tekst}»`);
  }
  const tom = felt.findIndex((x) => x === "");
  if (tom >= 0) throw new Error(`--drivere: sete ${tom} er tomt i «${tekst}»`);
  const opptak = felt.map((x) => x === KANDIDAT);
  if (!opptak.includes(true)) {
    throw new Error(`--drivere trenger minst ett «${KANDIDAT}» (kandidaten, --spek): ellers registreres ingenting`);
  }
  return { spek: felt.map((x) => (x === KANDIDAT ? kandidat : x)), opptak, rotasjon, blandet: true };
}

/** Leser `--drivere` og `--rotasjon` av argv. */
export function lesBord(argv: readonly string[], kandidat: string, antall = 4): Bord {
  const i = argv.indexOf("--drivere");
  const tekst = i < 0 ? null : (argv[i + 1] ?? null);
  if (i >= 0 && (tekst === null || tekst.startsWith("--"))) throw new Error("--drivere mangler verdi");
  return lesDrivere(tekst, kandidat, argv.includes("--rotasjon"), antall);
}

/** Hvilken slot sitter i `sete` i kamp nummer `kamp`? Uten rotasjon: setet selv. */
export function slot(bord: Bord, sete: number, kamp: number): number {
  const n = bord.spek.length;
  return bord.rotasjon ? (((sete + kamp) % n) + n) % n : sete;
}

/** Slot-listen stokket til seter for kamp `kamp`: `seter[sete] = slots[slot(sete)]`. */
export function tilSeter<T>(bord: Bord, slots: readonly T[], kamp: number): T[] {
  return slots.map((_, sete) => slots[slot(bord, sete, kamp)]!);
}

/** Én linje til loggen: hvilken spek sitter i hvert sete i kamp `kamp`. */
export function bordTekst(bord: Bord, kamp: number): string {
  return bord.spek
    .map((_, sete) => {
      const s = slot(bord, sete, kamp);
      return `sete ${sete}${bord.opptak[s] ? " (kandidat)" : ""}: ${bord.spek[s]}`;
    })
    .join("  |  ");
}
