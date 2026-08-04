/**
 * BUDTREKK: håndens struktur, ikke bare kortene den inneholder.
 *
 * ARVIND: «vi må ikke være kort-agnostiker … vi må finne både thresholds på
 * verdien av serier (valør, lengde, sammenheng) samt ikke behandle det
 * analogt. vi må også kunne estimere hva vi kan forvente fra makker (og
 * forsvar) i tillegg til innbytte.»
 *
 * `handTrekk` (105 trekk) koder hånden kort for kort pluss noen tellinger. Den
 * er strengt lovlig og har permutasjonstesten, og den beholdes uendret som de
 * første 105 indeksene. Men den er ADDITIV i formen: den teller honnører uten
 * å se om de henger sammen, og den skiller ikke den femte trumfen fra den
 * åttende.
 *
 * MÅLINGENE SOM BEGRUNNER HVERT NYE TREKK. Fra `analyse/handverdi.txt`,
 * 3 858 hender:
 *
 *   MARGINALVERDIEN FALLER. Lagstikk per trumflengde 4→7: +0,45 +0,45 +0,28.
 *   Den syvende trumfen er verdt ~40 % mindre enn den femte, fordi egne stikk
 *   stiger (+0,69 +0,70 +0,40) mens makkerens FALLER (−0,25 −0,24 −0,13).
 *   → derfor terskelindikatorer, ikke bare lengden som tall.
 *
 *   SAMMENHENG TELLER UTOVER KORTVERDIENE. Med trumflengde OG honnørtall
 *   holdt fast: serie 0 → 9,63 mot serie 1 → 9,87 (+0,24), og serie 0 → 9,95
 *   mot serie 2 → 10,12 (+0,17).
 *   → derfor serielengde fra toppen som eget trekk.
 *
 *   MAKKEREN OG TALONGEN ER NEGATIVT KORRELERT MED EGEN TRUMF. Makkerens
 *   bidrag 3,06 → 2,44 når trumflengden går 4 → 7; talongtrumf 0,90 → 0,58,
 *   korrelasjon −0,476.
 *   → derfor et eksplisitt anslag på hva som er IGJEN til de andre, i stedet
 *     for å håpe at modellen utleder det.
 *
 * ALT ER LOVLIG. Hvert trekk utledes av de tolv kortene på hånden og reglene.
 * Ingenting leser talongen, de andre hendene eller hvem makkeren er.
 */

import { FARGER, type Farge, type Kort } from "../kort.ts";
import type { GameState } from "../motor.ts";
import { handTrekk, HAND_DIM } from "./handtrekk.ts";
import { MINSTE_TALLBUD } from "../regler.ts";

/** 105 fra `handTrekk` + 23 strukturtrekk. */
export const BUD_DIM = HAND_DIM + 23;

/**
 * v2 (indeks 128–139): BUDRUNDEN.
 *
 * REVISJONEN 5. AUGUST FANT AT MODELLEN VAR BLIND FOR AUKSJONEN. Alle 128
 * trekk handlet om egen hånd. Auksjonen kom bare inn gjennom `vant[N]` – en
 * FAST populasjonstabell over hvor ofte hvert bud vinner kontrakten.
 *
 * Modellen kunne derfor ikke vite at to spillere alt hadde bydd høyt. Og det
 * betyr noe to veier:
 *
 *   HÅNDEN ER VERDT MINDRE. Har andre bydd høyt, sitter de med kortene. Samme
 *   tolv kort er verdt færre stikk i det rommet enn i et der alle passet.
 *
 *   OG SANNSYNLIGHETEN FOR Å VINNE BUDRUNDEN ER EN ANNEN. `vant[N]` er et
 *   populasjonssnitt; den vet ikke om noen alt har lagt seg på 10.
 *
 * VERSJONERT, IKKE UTVIDET. `tolkBudmodell` kaster hvis modellens `dim` ikke
 * stemmer med trekkbredden. En ren utvidelse ville derfor AVVIST den
 * utrullede `bud-gbt.json` og sendt Adams tilbake til NevroHjernes budgivning
 * – en levende regresjon utløst av en ren kodeendring. Samme mønster som
 * e1-blokkene: bredden er et argument, og gamle modeller virker uendret.
 */
export const BUD_DIM_V2 = BUD_DIM + 12;

const B = HAND_DIM;
const A = BUD_DIM;

export function budTrekk(state: GameState, sete: number, dim: number = BUD_DIM): Float32Array {
  const v = new Float32Array(dim);
  v.set(handTrekk(state, sete), 0);

  const hånd = state.hender[sete] ?? [];
  const per: Record<Farge, Kort[]> = { S: [], H: [], R: [], K: [] };
  for (const k of hånd) per[k.farge].push(k);
  const farger = FARGER as readonly Farge[];
  // Trumfkandidaten: lengste farge. Samme antakelse som `fastTrumfvalg`, og
  // riktig i det store flertallet – den er uansett bare et ANKER for
  // strukturtrekkene, ikke en beslutning.
  const trumf = farger.reduce((a, b) => (per[b].length > per[a].length ? b : a), "S" as Farge);
  const t = [...per[trumf]].sort((a, b) => b.verdi - a.verdi);
  const L = t.length;

  // 105–107: lengden, og de to TERSKLENE marginalverdien faller ved.
  v[B] = L / 13;
  v[B + 1] = L >= 6 ? 1 : 0;
  v[B + 2] = L >= 7 ? 1 : 0;

  // 108–110: SERIEN fra toppen – hvor langt ned fra ess rekka er ubrutt.
  let serie = 0;
  for (let val = 14; val >= 2; val--) {
    if (t.some((k) => k.verdi === val)) serie++;
    else break;
  }
  v[B + 3] = Math.min(serie, 5) / 5;
  v[B + 4] = serie >= 2 ? 1 : 0;
  v[B + 5] = serie >= 3 ? 1 : 0;

  // 111–113: honnører i trumf, og samspillet lengde × honnører. Produktet er
  // det en additiv modell IKKE kan lage av de to leddene hver for seg.
  const honn = t.filter((k) => k.verdi >= 12).length;
  v[B + 6] = honn / 4;
  v[B + 7] = (L * honn) / 40;
  v[B + 8] = (L * serie) / 40;

  // 114–117: hva som er IGJEN til de andre. Negativt korrelert med egen
  // lengde (målt −0,476 mot talongtrumf), og det er nettopp den korrelasjonen
  // som gjør at den n-te trumfen er verdt mindre enn den (n−1)-te.
  const uteTrumf = 13 - L;
  v[B + 9] = uteTrumf / 13;
  // Forventet antall av dem i talongen: hypergeometrisk snitt over de 40
  // kortene vi ikke har, fordelt på 4 talongplasser.
  v[B + 10] = (uteTrumf * 4) / 40 / 4;
  // Forventet per motspiller.
  v[B + 11] = (uteTrumf * 12) / 40 / 12;
  // Høyeste trumf vi IKKE har – det er den som kan brukes mot oss.
  let høyestUte = 0;
  for (let val = 14; val >= 2; val--) {
    if (!t.some((k) => k.verdi === val)) {
      høyestUte = val;
      break;
    }
  }
  v[B + 12] = (høyestUte - 1) / 13;

  // 118–121: sideformen. Renonser og singletoner er det som gjør trumfen
  // nyttig – de er grunnen til at man kaster seg tom, som Arvind beskrev.
  const side = farger.filter((f) => f !== trumf);
  v[B + 13] = side.filter((f) => per[f].length === 0).length / 3;
  v[B + 14] = side.filter((f) => per[f].length === 1).length / 3;
  v[B + 15] = side.filter((f) => per[f].length === 2).length / 3;
  v[B + 16] = Math.max(...side.map((f) => per[f].length)) / 12;

  // 122–124: sidefargenes styrke. Ess utenfor trumf er nesten sikre stikk;
  // konger uten ess er det ikke.
  const sideEss = side.reduce((a, f) => a + per[f].filter((k) => k.verdi === 14).length, 0);
  const sideKonge = side.reduce((a, f) => a + per[f].filter((k) => k.verdi === 13).length, 0);
  v[B + 17] = sideEss / 3;
  v[B + 18] = sideKonge / 3;
  // Konge med ess i samme farge er verdt langt mer enn uten.
  v[B + 19] =
    side.filter((f) => per[f].some((k) => k.verdi === 13) && per[f].some((k) => k.verdi === 14)).length / 3;

  // 125–127: grove stikkanslag som gir modellen et fornuftig utgangspunkt i
  // stedet for å måtte finne dem selv fra 128 tall.
  v[B + 20] = (L + sideEss) / 13;
  v[B + 21] = (serie + honn + sideEss) / 10;
  v[B + 22] = 1; // konstantledd

  if (dim <= BUD_DIM) return v;

  // --- BUDRUNDEN (v2, 128–139) ---------------------------------------------
  //
  // RELATIVT SETE, ikke absolutt, og IKKE sortert. Vrakrangereren sorterer
  // budene høyest først og mister dermed HVEM som bød hva. Her beholdes det:
  // at spilleren rett etter meg bød 10 er noe annet enn at spilleren rett før
  // meg gjorde det, fordi den ene har handlet med mindre informasjon enn den
  // andre.
  const bud = state.budrunde.sisteBud;
  const passet = state.budrunde.passet;
  let høyeste = 0;
  let antallBydd = 0;
  let antallPasset = 0;
  for (let r = 1; r <= 3; r++) {
    const p = (sete + r) % 4;
    const b = bud[p];
    const tall = typeof b === "number" ? b : 0;
    // AMERIKANER og SOLO kodes som 13 – over ethvert tallbud, som i budRang.
    const kodet = b === "AMERIKANER" || b === "SOLO" ? 13 : tall;
    v[A + (r - 1)] = kodet / 13;
    v[A + 3 + (r - 1)] = passet[p] === true ? 1 : 0;
    if (kodet > høyeste) høyeste = kodet;
    if (kodet > 0) antallBydd++;
    if (passet[p] === true) antallPasset++;
  }
  v[A + 6] = høyeste / 13;
  v[A + 7] = antallBydd / 3;
  v[A + 8] = antallPasset / 3;
  // Hvor mange som fortsatt KAN by over meg. Er alle andre passet, er budet
  // mitt uansett vinnende – og da er «vinner jeg budrunden» ikke et spørsmål.
  v[A + 9] = (3 - antallPasset) / 3;
  v[A + 10] = antallPasset === 3 ? 1 : 0;
  // Hvor mye over minste tallbud den høyeste ligger. Null når ingen har bydd.
  v[A + 11] = høyeste > 0 ? Math.min(1, (høyeste - MINSTE_TALLBUD) / 7) : 0;
  return v;
}
