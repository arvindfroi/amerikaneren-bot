/**
 * MLB — SØKEGRENSESNITTET. Bygd, koblet, og AV.
 *
 * ===================== HVORFOR DET FINNES ===============================
 *
 * `docs/mlb-arkitektur.md` punkt 9: sandkassen har **ingen søk**. Én
 * framoverpassering per delsteg, og valget tas av `velgKode` på policyens
 * logits. Adams har `alphamu`; MLB har ingenting.
 *
 * §117 målte at sluttspillsgapet er **informasjon, ikke dybde** — den som er
 * usikker på hvor kortene ligger tar feil valg uansett hvor langt hun regner.
 * Og §119 målte at trohodet er **tre ganger** bedre enn den håndlagde
 * slutningen (12,34 % av veien gulv → tak mot `gulv+`s 5,82 %).
 *
 * Et søk som **trekker verdener fra trohodet** bruker nøyaktig den
 * informasjonen. Uttømmende oppregning falt på kombinatorikken —
 * `analyse/mlb-ark-slutt.txt` teller **55 millioner** forenlige fordelinger ved
 * fem stikk igjen, som er nøyaktig der potten på +0,947 ligger — men
 * **trekking faller ikke på det samme**: prisen for N trukne verdener er N, og
 * ikke 55 millioner.
 *
 * ===================== OG DERFOR STÅR DET AV ============================
 *
 * Et søk oppå en policy som ikke leser hånden gjør ingenting.
 * `docs/mlb-arkitektur.md` punkt 1: trumfvalget var 217 av 217 samme farge,
 * 0,000 bit, og tolv forstyrrelser — inkludert å nulle HELE hånden — endret 0
 * av dem. Kollapsen må brytes først.
 *
 * Grensesnittet bygges likevel NÅ, av én grunn: for å slippe å ettermontere det
 * i en fil som til da har hatt én beslutningsvei. `Sete.søk` er `undefined` i
 * hver eneste driver, og `test/mlb-sok.test.ts` krever at et bord uten søk gir
 * BIT-IDENTISKE koder mot det samme bordet før denne fila fantes.
 *
 * ===================== AVGJØRELSE 5, SKREVET UT =========================
 *
 * `docs/mlb.md` AVGJØRELSE 5 sier «søket er IKKE et trekk under trening», og
 * begrunnelsen er en regnestykke: med `amu` som trekk koster én epoke på 5 000
 * kamper **~268 kjernetimer** i stedet for 10–40 minutter.
 *
 * Skillet den avgjørelsen forutsetter har vært UNDERFORSTÅTT, og det står her
 * eksplisitt fordi to ulike ting har hatt samme navn:
 *
 * | | **søk i gradienten** | **søk ved SPILLETID** |
 * |---|---|---|
 * | hvor | inne i `mlb-spill.ts` → `mlb-erfaring.ts` | bare i `spekagent.ts`/målingen |
 * | hva det koster | hver eneste beslutning i hver eneste epoke | bare de kampene som måles |
 * | hva det gjør med policyen | endrer hva `A` er regnet på | ingenting — vektene er ferdige |
 * | AVGJØRELSE 5 | **FORBUDT** | **tillatt, og umålt** |
 *
 * Den midterste raden er den som betyr noe, og den er den samme feilklassen
 * §122 kaller «det målte var ikke det jeg mente»: sto søket på i spillingen og
 * av i gjenspillingen, ville fordelen vært regnet på handlinger et annet system
 * tok. Sto det på begge steder, ville epoken kostet 268 kjernetimer.
 *
 * Derfor er `Sete.søk` det ENESTE stedet søket kan slås på, og
 * `examples/mlb-erfaring.ts` setter det aldri. Et søk ved spilletid er
 * derimot lovlig — det er en spillekomponent, akkurat som `amu` er i Adams —
 * og skal måles i en egen liten kjøring når kollapsen er brutt.
 *
 * ===================== K2 ================================================
 *
 * Verdenene trekkes fra `SpillerVisning` og trohodets fordeling. Ingen av dem
 * ser skjult informasjon: `troFordeling` er nettets GJETNING, og masken over
 * hvilke kort som er sett kommer fra `setteKort(visning)` — den samme
 * funksjonen fasiten bruker. En trukket verden er derfor en HYPOTESE, ikke et
 * oppslag, og `test/mlb-k2-sok.test.ts` bytter ut de skjulte hendene og krever
 * at de trukne verdenene er bit-identiske.
 */

import { FARGER, VERDIER, type Kort } from "../kort.ts";
import type { SpillerVisning } from "../motor.ts";
import type { Beslutningspunkt } from "./selvspill.ts";
import { setteKort } from "./trotrekk.ts";
import { TALONGKLASSE, trofakta, type Trofakta } from "./trofakta.ts";

/**
 * VALG FOR TREKKINGEN (11. sep). Tomt = nøyaktig som før, bit for bit.
 *
 * `fakta` HÅNDHEVER DET SETET VET (`trofakta.ts`): en plassering reglene utelukker får
 * vekt 0 og regnes ikke som ledig i den uniforme reserven. Uten den stoler trekkeren på
 * at troen selv har null masse der — og en softmax har aldri det, så et sete som ikke
 * fulgte spar kunne fått en spar i verdenen. Den gamle trekkeren (`solver/sampler.ts`)
 * har alltid håndhevet renonsene; denne gjorde det ikke.
 *
 * Med `fakta` legges også de MEST BUNDNE kortene først (flest umulige plasser, stabil
 * sortering etter stokkingen), som i `solver/sampler.ts`: tas et kort med én lovlig plass
 * sist, er plassen ofte alt fylt, og verdenen går ikke opp.
 */
export interface Trekkvalg {
  /** `true` regner faktaene av visningen; en ferdig `Trofakta` gjenbrukes. */
  readonly fakta?: boolean | Trofakta;
}

/**
 * KORTINDEKSEN BAKLENGS. `nevro/trekk.ts` har `kortIndeks`, men ingen invers,
 * og en verden er en liste KORT og ikke en liste indekser.
 *
 * Formelen speiler `kortIndeks` (`fargeIndeks·13 + verdi − 2`) ledd for ledd,
 * og `test/mlb-sok.test.ts` krever at `kortFraIndeks(kortIndeks(k))` er `k` for
 * alle 52. To formler som skal være hverandres invers og ikke er prøvd mot
 * hverandre er en stille kortstokkbytting.
 */
export function kortFraIndeks(i: number): Kort {
  const farge = FARGER[Math.floor(i / 13)];
  const verdi = VERDIER[i % 13];
  if (farge === undefined || verdi === undefined) throw new Error(`Kortindeks ${i} finnes ikke`);
  return { farge, verdi };
}

// ===========================================================================
// 1. En trukket verden
// ===========================================================================

/**
 * ÉN HYPOTESE om hvor de usette kortene ligger, sett fra ett sete.
 *
 * `hender[r]` er kortene hypotesen legger hos RELATIVT sete `r` (1, 2, 3).
 * Plass 0 er tom med vilje: mine egne kort er ikke en hypotese, de står i
 * visningen. `talong` er resten.
 */
export interface Verden {
  readonly hender: readonly (readonly Kort[])[];
  readonly talong: readonly Kort[];
}

/** Hvor mange kort hvert relativt sete og talongen skal ha igjen. */
export interface Kapasitet {
  /** Indeks 1–3: antall kort relativt sete har igjen. Plass 0 er ubrukt. */
  readonly hender: readonly number[];
  readonly talong: number;
}

/**
 * KAPASITETEN, LEST og ikke utledet.
 *
 * Første utkast regnet den: `antallStikk − stikkSpilt` kort per sete, minus ett
 * for hver som alt hadde lagt i stikket som var i gang. Det er riktig — og det
 * er en ANDRE sannhet om noe motoren allerede sier. `SpillerVisning.antallKort`
 * er `state.hender.map(h => h.length)`, altså det eksakte antallet, og det er
 * lovlig informasjon (alle ser hvor mange kort de andre holder).
 *
 * Talongen er resten: alt usett som ikke får plass på en hånd. Det er en
 * differanse og ikke et tredje tall som kan komme i utakt.
 */
export function kapasitet(visning: SpillerVisning, usett: number): Kapasitet {
  const n = visning.antallKort.length;
  const hender: number[] = new Array<number>(n).fill(0);
  let sum = 0;
  for (let r = 1; r < n; r++) {
    const absolutt = (visning.deg + r) % n;
    hender[r] = Math.max(0, visning.antallKort[absolutt] ?? 0);
    sum += hender[r]!;
  }
  return { hender, talong: Math.max(0, usett - sum) };
}

// ===========================================================================
// 2. Trekkingen
// ===========================================================================

/**
 * TREKK ÉN VERDEN fra trohodets fordeling, med kapasitetene som skranke.
 *
 * `tro[kort][klasse]` er `Sandkassenett.troFordeling`-formen: klasse 0–2 er
 * relativt sete 1–3, klasse 3 er talongen.
 *
 * Metoden er den enkleste som ikke er gal: kortene tas i tilfeldig rekkefølge,
 * hvert kort trekkes fra sin egen betingede fordeling over de plassene som
 * fortsatt har ledig kapasitet, og en plass som fylles opp faller ut. Det er
 * ikke en eksakt trekking fra leddfordelingen — den ville krevd en permanent —
 * men den respekterer skrankene EKSAKT, og det er den egenskapen et søk trenger
 * for at utrullingen skal være lovlig.
 *
 * **Blir det umulig, returneres `null`.** En verden som ikke går opp skal ikke
 * repareres stille til en som er ulovlig; kalleren trekker en ny.
 */
export function trekkVerden(
  visning: SpillerVisning,
  tro: readonly (readonly number[])[],
  rng: () => number,
  valg: Trekkvalg = {},
): Verden | null {
  const n = visning.antallKort.length;
  const sett = setteKort(visning);
  const usett: number[] = [];
  for (let i = 0; i < 52; i++) if (!sett.has(i)) usett.push(i);

  const kap = kapasitet(visning, usett.length);
  const ledig = [...kap.hender.slice(1, n), kap.talong];
  if (ledig.reduce((a, b) => a + b, 0) !== usett.length) return null;

  // Tilfeldig rekkefølge (Fisher–Yates på `rng`), så ingen farge systematisk
  // får velge først og dermed ta de trange plassene.
  for (let i = usett.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = usett[i]!;
    usett[i] = usett[j]!;
    usett[j] = t;
  }

  // FAKTAENE (se `Trekkvalg`). Av: `umulig` svarer alltid nei, og ingen rng trekkes ekstra.
  const fakta = valg.fakta === undefined || valg.fakta === false ? null : valg.fakta === true ? trofakta(visning) : valg.fakta;
  const talongPlass = ledig.length - 1;
  const umulig = (kort: number, k: number): boolean =>
    fakta !== null && fakta.umulig[kort * 4 + (k === talongPlass ? TALONGKLASSE : k)] === 1;
  if (fakta !== null) {
    const bundet = (kort: number): number => ledig.reduce((a, _, k) => a + (umulig(kort, k) ? 1 : 0), 0);
    usett.sort((a, b) => bundet(b) - bundet(a));
  }

  const plass: number[] = new Array<number>(52).fill(-1);
  for (const kort of usett) {
    const rad = tro[kort] ?? [];
    let sum = 0;
    const vekt = ledig.map((rest, k) => {
      const w = rest > 0 && !umulig(kort, k) ? Math.max(0, rad[k] ?? 0) : 0;
      sum += w;
      return w;
    });
    let valgt = -1;
    if (sum > 0) {
      let t = rng() * sum;
      for (let k = 0; k < vekt.length; k++) {
        t -= vekt[k]!;
        if (t <= 0) {
          valgt = k;
          break;
        }
      }
      if (valgt < 0) valgt = vekt.findIndex((w) => w > 0);
    } else {
      // Troen ga null vekt til hver ledig plass. Da er den ikke en veiledning,
      // og uniformt over de LEDIGE er fortsatt en lovlig verden.
      const åpne = ledig.flatMap((rest, k) => (rest > 0 ? [k] : []));
      if (åpne.length === 0) return null;
      valgt = åpne[Math.min(åpne.length - 1, Math.floor(rng() * åpne.length))]!;
    }
    if (valgt < 0) return null;
    ledig[valgt] = ledig[valgt]! - 1;
    plass[kort] = valgt;
  }

  const hender: Kort[][] = Array.from({ length: n }, () => []);
  const talong: Kort[] = [];
  const talongIndeks = ledig.length - 1;
  for (let i = 0; i < 52; i++) {
    const p = plass[i]!;
    if (p < 0) continue;
    if (p === talongIndeks) talong.push(kortFraIndeks(i));
    else hender[p + 1]!.push(kortFraIndeks(i));
  }
  return { hender, talong };
}

/** N verdener, med et tak på antall forsøk så en umulig stilling ikke henger. */
export function trekkVerdener(
  visning: SpillerVisning,
  tro: readonly (readonly number[])[],
  antall: number,
  rng: () => number,
  valg: Trekkvalg = {},
): Verden[] {
  // Faktaene regnes ÉN gang for stillingen, ikke én gang per forsøk.
  const v0: Trekkvalg = valg.fakta === true ? { fakta: trofakta(visning) } : valg;
  const ut: Verden[] = [];
  for (let forsøk = 0; forsøk < antall * 4 && ut.length < antall; forsøk++) {
    const v = trekkVerden(visning, tro, rng, v0);
    if (v !== null) ut.push(v);
  }
  return ut;
}

// ===========================================================================
// 3. Grensesnittet selvspillet ser
// ===========================================================================

/**
 * ET SØK. `velg` returnerer en LOVLIG kode, eller `null` for «ingen mening».
 *
 * `null` er ikke en feilverdi — det er den formen som gjør at et søk kan være
 * SMALT. En sluttspillsløser som bare mener noe ved fem stikk igjen skal kunne
 * si fra om det i stedet for å gjette resten av runden, og da faller valget
 * tilbake på policyen uten at noen driver må vite hvilke stillinger søket
 * dekker.
 *
 * Kontrakten er hard: returneres en kode, MÅ `punkt.maske[kode] === 1`.
 * `spillKamp` prøver det og kaster ellers — et søk som gir et ulovlig trekk
 * skal stoppe kampen, ikke bli stille rettet til noe annet.
 */
export interface Søk {
  /** Navnet som havner i rapporter. Et umerket søk er et umålbart søk. */
  readonly navn: string;
  velg(punkt: Beslutningspunkt): number | null;
}

/**
 * DET TOMME SØKET — mener aldri noe, og finnes for prøvene.
 *
 * `test/mlb-sok.test.ts` bruker det til å vise at et bord MED et søk som alltid
 * sier `null` gir bit-identiske koder mot et bord uten søk i det hele tatt. Det
 * er den ene egenskapen som gjør at grensesnittet kan stå påkoblet og AV
 * samtidig.
 */
export const INGEN_SØK: Søk = {
  navn: "ingen",
  velg: () => null,
};
