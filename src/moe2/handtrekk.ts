/**
 * TREKKUTTREKK FOR HÅNDVURDERINGEN – hva ser setet i budøyeblikket?
 *
 * Målet nettet skal treffe er SD-orakelets tall for setet: hvor mange
 * LAGSTIKK giva bærer hvis nettopp dette setet får kontrakten (se
 * `src/neat/singledummy.ts`). Fasiten er gratis, men den er regnet ut med alle
 * fire hender på bordet. INNGANGEN her må derfor være strengt lovlig, ellers
 * måler vi et nytt orakel i stedet for en spiller.
 *
 * DET SETET LOVLIG SER I BUDRUNDEN, og ikke ett trekk mer:
 *   - egen hånd (`state.hender[sete]`)
 *   - budrunden så langt (`state.budrunde` – passene og de meldte budene er
 *     offentlige)
 *   - hvor man sitter i forhold til giveren
 *   - reglene: antall stikk, antall spillere, hvilke bud som er lovlige
 *
 * DET SOM ER HOLDT UTE, med vilje:
 *   - de tre andre hendene og talongen. Det er hele poenget.
 *   - poengstillingen. Den er lovlig å se, men SD-fasiten avhenger ikke av
 *     den; å ta den inn ville bare gitt nettet en akse å overtilpasse på.
 *   - rundenummer og frø. Samme argument, og frøet ville vært en ren
 *     identifikator som lar nettet pugge giva.
 *
 * Testen som holder dette ærlig ligger i `test/moe2-handtrekk.test.ts`: bytt
 * om motstandernes kort og talongen, og vektoren skal være BIT-IDENTISK. Den
 * er speilvendt av lekkasjetesten for den blinde estimatoren i
 * `test/moe2-budvakt.test.ts`, og den er den viktigste testen i denne linjen.
 */

import { FARGER, type Farge, type Kort } from "../kort.ts";
import type { GameState } from "../motor.ts";
import { kortIndeks } from "../nevro/trekk.ts";
import { AMERIKANER, MINSTE_TALLBUD, SOLO, type Bud } from "../regler.ts";

/** Antall trekk. Se blokkene i `handTrekk` for hva som ligger hvor. */
export const HAND_DIM = 105;

/** Motpartens sete sett fra `sete` (0 = meg selv, 1 = neste i tur, …). */
function rel(sete: number, annet: number, n: number): number {
  return (annet - sete + n) % n;
}

/**
 * Skalerer et tallbud til [0, 1] over det lovlige området [5, antallStikk].
 * Amerikaner og Solo er ikke tallbud og kodes i egne flagg.
 */
function budSkala(bud: number, antallStikk: number): number {
  const spenn = Math.max(1, antallStikk - MINSTE_TALLBUD);
  return (bud - MINSTE_TALLBUD) / spenn;
}

/**
 * Det laveste TALLBUDET som fortsatt er lovlig i stillingen, eller null.
 *
 * Regnet ut fra `state.budrunde.høyeste` alene og ikke via
 * `lovligeHandlinger`, fordi den siste svarer for setet som er I TUR – og
 * trekkene skal kunne hentes for et hvilket som helst sete, også ett som ikke
 * har tur. Tallet er det samme; utledningen er bare fri for `iTur`.
 */
export function minstebudFraStilling(state: GameState): number | null {
  if (state.fase !== "BUDRUNDE") return null;
  const høyeste: Bud | null = state.budrunde.høyeste?.bud ?? null;
  const tak = state.giving.antallStikk;
  if (høyeste === null) return MINSTE_TALLBUD;
  if (høyeste === AMERIKANER || høyeste === SOLO) return null;
  const neste = (høyeste as number) + 1;
  return neste <= tak ? neste : null;
}

/**
 * Trekkvektoren for `sete` i en budrunde.
 *
 * Blokkene, med startindeks:
 *   0    52  egen hånd, appens kortindeks (farge×13 + verdi−2)
 *   52    4  fargelengde / antallStikk
 *   56    4  høyeste verdi i fargen, (verdi−2)/12 (0 = renonse)
 *   60    4  ess i fargen
 *   64    4  konge i fargen
 *   68    4  dame i fargen
 *   72    4  knekt i fargen
 *   76    1  antall ess / 4
 *   77    1  antall honnører (J,Q,K,A) / 8
 *   78    1  lengste farge / antallStikk
 *   79    1  antall renonser / 4
 *   80    4  eget sete relativt giveren (én-hot)
 *   84    1  laveste lovlige tallbud, skalert (0 hvis ingen finnes)
 *   85    1  finnes et lovlig tallbud
 *   86    1  høyeste stående tallbud, skalert (0 hvis ingen)
 *   87    1  finnes et høyeste bud i det hele tatt
 *   88    1  det høyeste budet er Amerikaner eller Solo
 *   89    4  hvem som holder det høyeste budet, relativt eget sete (én-hot)
 *   93    1  antall som har passet / antallSpillere
 *   94    1  antall seter som har handlet / antallSpillere
 *   95    3  motpart rel. 1..3: har passet
 *   98    3  motpart rel. 1..3: har meldt et tallbud
 *  101    3  motpart rel. 1..3: sitt siste tallbud, skalert (0 hvis ingen)
 *  104    1  bias
 *
 * Blokkene fra 95 og ut er skrevet for fire seter (tre motparter). Ved andre
 * spillerantall fylles bare de tre første relative setene – motoren støtter
 * 3–6, men hele denne linjen er målt på 4, og et trekkuttrekk som stilltiende
 * skiftet betydning med spillerantallet ville vært verre enn ett som lar noen
 * felter stå tomme.
 */
export function handTrekk(state: GameState, sete: number): Float32Array {
  const v = new Float32Array(HAND_DIM);
  const hånd: readonly Kort[] = state.hender[sete] ?? [];
  const N = state.antallSpillere;
  const stikk = state.giving.antallStikk;

  // 0–51: egen hånd.
  for (const k of hånd) v[kortIndeks(k)] = 1;

  // 52–79: håndformen, eksplisitt. Alt kan i prinsippet leses ut av de 52
  // bitene, men et lite nett finner ikke lengde og honnørstyrke selv på den
  // datamengden vi har.
  const lengde = [0, 0, 0, 0];
  const høyest = [0, 0, 0, 0];
  let ess = 0;
  let honnør = 0;
  for (const k of hånd) {
    const f = FARGER.indexOf(k.farge);
    lengde[f]!++;
    if (k.verdi > høyest[f]!) høyest[f] = k.verdi;
    if (k.verdi === 14) ess++;
    if (k.verdi >= 11) honnør++;
  }
  let lengst = 0;
  let renonser = 0;
  for (let f = 0; f < 4; f++) {
    const farge = FARGER[f] as Farge;
    v[52 + f] = lengde[f]! / stikk;
    v[56 + f] = høyest[f]! === 0 ? 0 : (høyest[f]! - 2) / 12;
    for (const [j, verdi] of [14, 13, 12, 11].entries()) {
      if (hånd.some((k) => k.farge === farge && k.verdi === verdi)) v[60 + j * 4 + f] = 1;
    }
    if (lengde[f]! > lengst) lengst = lengde[f]!;
    if (lengde[f]! === 0) renonser++;
  }
  v[76] = ess / 4;
  v[77] = honnør / 8;
  v[78] = lengst / stikk;
  v[79] = renonser / 4;

  // 80–83: posisjon. Giveren er offentlig, og hvor man sitter avgjør hvor
  // mange som får si noe etter en.
  const posisjon = rel(state.giver, sete, N);
  if (posisjon < 4) v[80 + posisjon] = 1;

  // 84–92: budstillingen.
  const minste = minstebudFraStilling(state);
  v[84] = minste === null ? 0 : budSkala(minste, stikk);
  v[85] = minste === null ? 0 : 1;
  const høyeste = state.budrunde.høyeste;
  if (høyeste !== null) {
    v[87] = 1;
    if (typeof høyeste.bud === "number") v[86] = budSkala(høyeste.bud, stikk);
    else v[88] = 1;
    const r = rel(sete, høyeste.spiller, N);
    if (r < 4) v[89 + r] = 1;
  }

  // 93–103: hvem har sagt hva.
  let passet = 0;
  let handlet = 0;
  for (let s = 0; s < N; s++) {
    const harPasset = state.budrunde.passet[s] === true;
    const sisteBud = state.budrunde.sisteBud[s] ?? null;
    if (harPasset) passet++;
    if (harPasset || sisteBud !== null) handlet++;
    const r = rel(sete, s, N);
    if (r === 0 || r > 3) continue;
    if (harPasset) v[95 + (r - 1)] = 1;
    if (typeof sisteBud === "number") {
      v[98 + (r - 1)] = 1;
      v[101 + (r - 1)] = budSkala(sisteBud, stikk);
    } else if (sisteBud !== null) {
      // Amerikaner/Solo: meldt, men ikke et tallbud. Flagget står, skalaen ikke.
      v[98 + (r - 1)] = 1;
      v[101 + (r - 1)] = 1;
    }
  }
  v[93] = passet / N;
  v[94] = handlet / N;

  v[104] = 1;
  return v;
}
