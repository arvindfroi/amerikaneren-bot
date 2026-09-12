/**
 * MLB — SANS C: AUKSJONENS REKKEFØLGE (12. sep). Bygd fra `SpillerVisning` alene.
 *
 * ===================== HVORFOR BLOKKEN FINNES ============================
 *
 * Alt boten hittil har visst om budrunden er AGGREGATER. `neat/trekk.ts` har BUD_HIST og
 * PASSET per sete, `moe2/budtrekk.ts` v2 har høyeste bud per relativt sete, `e1`-auksjonsblokken
 * (v4, 356–363) har hvor høyt hvert sete bød, og `mlb/stillingtrekk.ts` NÅR_EGET_BUD leser
 * `sisteBud`. Ingen av dem bærer REKKEFØLGEN. To auksjoner som ender i den samme
 * `sisteBud`-raden gir bit-identiske trekk overalt i boten — og de to bordene er ikke like:
 *
 *   «han hoppet rett til 11»        rekka er [11]
 *   «han krøp opp fra 5, én om gangen»  rekka er [5, 7, 9, 11]
 *
 * Samme sete, samme høyeste bud, samme pass — og et menneske ved bordet leser nettopp
 * forskjellen. To andre filer noterte mangelen som et FUNN de ikke kunne fylle, og det er
 * grunnen til at denne fila er ny og ikke en utvidelse: `valgtbort.ts` droppet «passet etter
 * å ha budt» fordi «NIVÅET hun passet på finnes ikke i `SpillerVisning`», og `sekvens.ts`
 * (sonde B) skrev at «budsekvensen finnes ikke … den lever bare i hendelsesstrømmen fra
 * `utfør`, som ingen bokfører». `motor.ts` bokfører den nå (`Budrunde.rekke`), og dette er
 * blokken som leser den.
 *
 * ===================== ALT ER OFFENTLIG, OG STRUKTURELT SÅ ===============
 *
 * Bare `budrunde.rekke`, `budrunde.høyeste`, `antallKort.length` og `deg` leses. Ikke egen
 * hånd, ikke eget vrak, ikke talongen, ikke `makker`. Auksjonen ER offentlig — alle ved
 * bordet hørte hver melding da den falt, og appen viser den alt på budtavla — så blokken er
 * den SAMME for alle fire observatørene, bare rotert til relativt sete.
 * `test/mlb-auksjonsrekke.test.ts` bytter alle skjulte hender, vraket og talongen og krever
 * bit-identitet, med en felle som leser en skjult hånd og MÅ bli tatt.
 *
 * ===================== «LEDEREN», IKKE «VINNEREN» ========================
 *
 * Eieren ville vite om et sete kom inn FØR eller ETTER den som vant budrunden. Men blokken
 * leses også MIDT I auksjonen (BudQ byr), og da finnes ingen vinner ennå. Å bruke den
 * endelige vinneren ville vært å lese framtiden — fasit i forkledning, akkurat den feilen
 * `valgtbort.ts` unngår ved å kode lagene «som de var kjent da». Referansen er derfor det
 * offentlige NÅ: `budrunde.høyeste`, den som leder auksjonen i dette øyeblikket. Etter siste
 * melding ER lederen vinneren, så for trohodet (som alltid leser i spillefasen) faller de to
 * sammen; for BudQ er referansen ærlig underveis.
 *
 * ===================== HVORFOR AKKURAT DISSE TALLENE =====================
 *
 * Hvert felt er noe rekka kan si og aggregatene IKKE kan. Nivået og hvem som passet står
 * allerede i BUD_HIST/PASSET, og gjentas ikke her; det som gjentas, lærer nettet to ganger.
 * «Bød aldri» må kunne skilles fra «bød på plass 0», derfor er BØD med ved siden av
 * FØRSTE_POS — ellers koder vi to helt ulike situasjoner til samme tall (samme regel som
 * auksjonsblokken i `test/e1-auksjonsblokk.test.ts` krever).
 *
 * ===================== LAYOUT (4 relative seter × 10 + 4 = 44) ===========
 *
 *   0 DELTOK            setet har gjort minst én melding (bud eller pass) i rekka
 *   1 BØD               setet har meldt minst ett FORPLIKTENDE bud
 *   2 FØRSTE_POS        posisjonen i rekka for setets FØRSTE bud, /MAKS_STEG, klemt. 0 når
 *                       setet aldri bød — derfor står BØD ved siden av
 *   3 SISTE_POS         posisjonen for setets SISTE melding (bud eller pass)
 *   4 ANTALL_BUD        hvor mange ganger setet HEVET, /4. Aggregatene ser bare det siste
 *   5 STØRSTE_HOPP      største sprang over det høyeste budet som sto FØR meldingen
 *   6 FØRSTE_HOPP       spranget i setets FØRSTE bud: åpnet hun forsiktig eller med et byks
 *   7 PASSET_ETTER_BUD  setet passet ETTER å ha meldt — det `valgtbort.ts` ikke kunne kode
 *   8 FØR_LEDEREN       setets første bud kom FØR lederens første bud
 *   9 ETTER_LEDEREN     ... eller ETTER. Lederen selv har 0 i begge, og det er ikke et hull:
 *                       «jeg er lederen» står i `stillingtrekk.ts` og i BUD_HØYESTE fra før
 *
 * Og fire felles tall til slutt (indeks 40–43), som ikke hører til noe sete:
 *
 *  40 LENGDE            antall meldinger i rekka, /MAKS_STEG, klemt
 *  41 BUDANDEL          andelen av meldingene som var bud og ikke pass
 *  42 LEDER_POS         posisjonen for det nåværende høyeste budet
 *  43 OMGANGER          hvor mange ganger auksjonen har vært rundt bordet
 *
 * Posisjonene deles på MAKS_STEG og klemmes, i stedet for på rekkas egen lengde: en auksjon
 * som VOKSER ville ellers flyttet et tall som allerede var bestemt («han åpnet på plass 1»
 * skal ikke bli et annet tall fordi to seter meldte etterpå). LENGDE står der for at nettet
 * skal kunne normalisere selv om det vil.
 */

import type { SpillerVisning } from "../motor.ts";
import { budRang, MINSTE_TALLBUD, PASS, SOLO } from "../regler.ts";

export const AUKSJON_PER_SETE = 10;
export const AUKSJON_FELLES = 4;
export const MLB_AUKSJON = 4 * AUKSJON_PER_SETE + AUKSJON_FELLES;

const DELTOK = 0;
const BØD = 1;
const FØRSTE_POS = 2;
const SISTE_POS = 3;
const ANTALL_BUD = 4;
const STØRSTE_HOPP = 5;
const FØRSTE_HOPP = 6;
const PASSET_ETTER_BUD = 7;
const FØR_LEDEREN = 8;
const ETTER_LEDEREN = 9;

/** Der fellesfeltene begynner. */
const FELLES = 4 * AUKSJON_PER_SETE;
const LENGDE = 0;
const BUDANDEL = 1;
const LEDER_POS = 2;
const OMGANGER = 3;

/**
 * Skalaen for posisjoner. Fire seter × tre omganger er en LANG auksjon; lengre finnes, og
 * de klemmes til 1. Ikke rekkas egen lengde — se hodet.
 */
const MAKS_STEG = 12;
/** Solo er det høyeste budet som finnes, så hoppene ligger i [0, 1]. */
const MAKS_RANG = budRang(SOLO);

/** Offsetene eksportert som ÉN kilde til sannhet, som ellers i prosjektet. */
export const AUKSJONINNGANG = {
  PER_SETE: AUKSJON_PER_SETE,
  DELTOK,
  BØD,
  FØRSTE_POS,
  SISTE_POS,
  ANTALL_BUD,
  STØRSTE_HOPP,
  FØRSTE_HOPP,
  PASSET_ETTER_BUD,
  FØR_LEDEREN,
  ETTER_LEDEREN,
  FELLES,
  LENGDE,
  BUDANDEL,
  LEDER_POS,
  OMGANGER,
} as const;

/**
 * Auksjonen slik den falt, sett fra `visning.deg`. Tom rekke gir en nullvektor — den ærlige
 * verdien før første melding, og nøyaktig det et smalere nett ser i den nye blokken.
 */
export function auksjonsrekkeTrekk(visning: SpillerVisning): Float32Array {
  const v = new Float32Array(MLB_AUKSJON);
  const rekke = visning.budrunde.rekke;
  if (rekke.length === 0) return v;

  const antall = visning.antallKort.length;
  const meg = visning.deg;
  const rel = (sete: number): number => (((sete - meg) % antall) + antall) % antall;
  const pos = (i: number): number => Math.min(1, i / MAKS_STEG);

  /** Posisjonen for hvert relative setes FØRSTE bud, til FØR/ETTER_LEDEREN under. */
  const førsteBud: (number | null)[] = new Array<number | null>(4).fill(null);
  /**
   * Det høyeste budet som sto FØR meldingen som behandles nå. Starter under minste tallbud,
   * så det første budet i en auksjon får hoppet sitt målt fra bunnen og ikke fra null.
   */
  let forrigeRang = MINSTE_TALLBUD - 1;
  let antallBud = 0;
  let lederPos = -1;

  for (let i = 0; i < rekke.length; i++) {
    const steg = rekke[i]!;
    const r = rel(steg.sete);
    // Fem seter finnes ikke i dette spillet, men en rekke fra en annen regelvariant skal
    // ikke skrive utenfor blokken.
    if (r < 0 || r > 3) continue;
    const o = r * AUKSJON_PER_SETE;
    v[o + DELTOK] = 1;
    v[o + SISTE_POS] = pos(i);

    if (steg.bud === PASS) {
      // «Passet etter å ha budt» — bare mulig å se her, og bare med rekkefølgen.
      if (v[o + BØD] === 1) v[o + PASSET_ETTER_BUD] = 1;
      continue;
    }

    const rang = budRang(steg.bud);
    const hopp = Math.max(0, Math.min(1, (rang - forrigeRang) / MAKS_RANG));
    if (v[o + BØD] !== 1) {
      v[o + BØD] = 1;
      v[o + FØRSTE_POS] = pos(i);
      v[o + FØRSTE_HOPP] = hopp;
      førsteBud[r] = i;
    }
    v[o + ANTALL_BUD] = Math.min(1, (v[o + ANTALL_BUD]! * 4 + 1) / 4);
    if (hopp > v[o + STØRSTE_HOPP]!) v[o + STØRSTE_HOPP] = hopp;
    forrigeRang = rang;
    antallBud++;
    lederPos = i;
  }

  // --- FØR/ETTER LEDEREN ---------------------------------------------------
  const leder = visning.budrunde.høyeste?.spiller;
  if (leder !== undefined) {
    const lederRel = rel(leder);
    const lederFørste = lederRel >= 0 && lederRel <= 3 ? førsteBud[lederRel] : null;
    if (lederFørste !== null && lederFørste !== undefined) {
      for (let r = 0; r < 4; r++) {
        const p = førsteBud[r];
        if (p === null || p === undefined || r === lederRel) continue;
        v[r * AUKSJON_PER_SETE + (p < lederFørste ? FØR_LEDEREN : ETTER_LEDEREN)] = 1;
      }
    }
  }

  // --- FELLES --------------------------------------------------------------
  v[FELLES + LENGDE] = pos(rekke.length);
  v[FELLES + BUDANDEL] = antallBud / rekke.length;
  v[FELLES + LEDER_POS] = lederPos >= 0 ? pos(lederPos) : 0;
  v[FELLES + OMGANGER] = Math.min(1, rekke.length / Math.max(1, antall * 3));

  return v;
}
