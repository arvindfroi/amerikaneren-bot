/**
 * MLB — SANS B: VALGT BORT, OFFENTLIG (11. sep). Bygd fra `SpillerVisning` alene.
 *
 * `HVEM_LA` og signalblokken (`signaltrekk.ts`) sier hva en spiller GJORDE. Mye av det en
 * spiller ved bordet slutter, kommer av det hun synlig LOT VÆRE å gjøre: hun var renons og
 * lot motpartens stikk gå uten å trumfe, budvinneren spilte ut en sidefarge mens det fortsatt
 * var trumf ute, sistemann la lavt i fargen selv om et høyere kort kunne tatt stikket,
 * makkeren kom ikke tilbake i fargen budvinneren åpnet. Hvert av dem krever at vi vet hva
 * ALTERNATIVET var i øyeblikket — hvem som holdt stikket, og hvilket lag de var på — og det
 * står ikke i noen av dagens blokker.
 *
 * ===================== HVA SOM ER NYTT, OG HVA SOM BLE DROPPET ===========
 *
 * NYTT er relasjonen og alternativet: signalblokken teller KASTET per farge og FULGTE_UNDER
 * per farge uansett hvem som holdt stikket, hvor i stikket, og om det fantes noe å ta det med.
 *
 * DROPPET som overflødig:
 *   - «passet etter å ha budt» (eierens punkt 5): `lagInn` har PASSET og BUD_HIST per sete,
 *     og «passet ∧ hadde budt» er et OG av to innganger nettet alt ser. NIVÅET hun passet på
 *     finnes ikke i `SpillerVisning` — `Budrunde` har ingen budsekvens, bare høyeste bud per
 *     sete — og nedre grense (eget bud + 1) er lineær i BUD_HIST og BUD_HØYESTE.
 *   - «byttet farge fra eget forrige utspill»: nesten helt gitt av LEDET per farge.
 *   - «kastet mens egen side holdt stikket»: KASTET per farge minus kategoriene under.
 *   - rå renons: `lagInn` RENONS og `trofakta.ts`.
 *
 * ===================== LAGENE SOM DE VAR KJENT DA ========================
 *
 * Lagene er offentlige fra kortet ETTER det kalte kortet (og fra start ved solo eller uten
 * etterlysning). Før det kjenner bordet bare ROLLEN: budvinner eller ikke. Det er eierens
 * regel, og den gjelder selv når vi i dag vet hvem makkeren var: handlingen skal kodes med
 * det alternativet bordet kunne se da. `visning.makker` leses aldri; makkeren utledes av
 * hvem som la det kalte kortet, og bare for kort etter det.
 *
 * «Kunne hun ha hatt kortet?» avgjøres av det observatøren vet NÅ (se `kunneHa`): spilt
 * før — nei; spilt senere av en annen — nei; spilt senere av henne selv — ja (BEVIST);
 * uspilt og i min hånd eller mitt eget vrak — nei; uspilt og hun har vist renons i fargen —
 * nei; ellers kanskje. Egen hånd og eget vrak er lovlig kunnskap, men for en observatør som
 * ikke er budvinner er `dittVrak` tom: ingenting her kan lese vraket eller talongen.
 * `test/mlb-sanser2.test.ts` bytter alle skjulte hender, vraket og talongen og krever
 * bit-identitet, og har feller for vraket og for den ekte makkeren.
 *
 * ===================== LAYOUT (4 relative seter × 10 = 40) ==============
 *
 * Alle tellinger er /4, som i signalblokken.
 *
 *   0 KASTET_MOT             renons i utspillsfargen (ikke trumf ledet), la en sidefarge, og en KJENT
 *                            motpart holdt stikket med et kort i utspillsfargen: lot være å stjele
 *   1 KASTET_UNDER_TRUMF_MOT som 0, men motparten holdt med TRUMF: lot være å trumfe over
 *   2 KASTET_ROLLE           som 0/1, men lagene var ikke offentlige ennå og holderen hadde den
 *                            ANDRE rollen (budvinner mot ikke-budvinner)
 *   3 BUDLAG_UTSPILL         utspill fra stikk 2 av, setet på det kjente budlaget, og trumf kunne
 *                            fortsatt sitte utenfor setets egen hånd
 *   4 BUDLAG_SIDEUTSPILL     av dem: utspillet var IKKE trumf — lot være å trekke trumf
 *   5 SIST_SJANSE            sist i stikket, fulgte farge, motparten (kjent, eller annen rolle)
 *                            holdt med utspillsfargen, og setet kunne ha hatt et høyere kort
 *   6 DUKKET                 av dem: la under
 *   7 DUKKET_BEVIST          av dem: la under, og hadde BEVISLIG et høyere kort (spilte det senere)
 *   8 RETUR                  utspill i fargen en kjent lagkamerat sist spilte ut
 *   9 IKKE_RETUR             utspill i en annen farge, selv om setet kunne ha hatt lagkameratens farge
 */

import { FARGER, type Kort } from "../kort.ts";
import type { KortPåBord, SpillerVisning } from "../motor.ts";

export const VALGT_BORT_PER_SETE = 10;
export const MLB_VALGT_BORT = 4 * VALGT_BORT_PER_SETE;

const KASTET_MOT = 0;
const KASTET_UNDER_TRUMF_MOT = 1;
const KASTET_ROLLE = 2;
const BUDLAG_UTSPILL = 3;
const BUDLAG_SIDEUTSPILL = 4;
const SIST_SJANSE = 5;
const DUKKET = 6;
const DUKKET_BEVIST = 7;
const RETUR = 8;
const IKKE_RETUR = 9;

/** Offsetene, relativt til setets celle (`rel · VALGT_BORT_PER_SETE`). */
export const VALGTBORTINNGANG = {
  PER_SETE: VALGT_BORT_PER_SETE,
  KASTET_MOT,
  KASTET_UNDER_TRUMF_MOT,
  KASTET_ROLLE,
  BUDLAG_UTSPILL,
  BUDLAG_SIDEUTSPILL,
  SIST_SJANSE,
  DUKKET,
  DUKKET_BEVIST,
  RETUR,
  IKKE_RETUR,
} as const;

const fargeAv = (k: Kort): number => FARGER.indexOf(k.farge);
const indeks = (k: Kort): number => fargeAv(k) * 13 + (k.verdi - 2);

/** Slår `ny` det som holder stikket? Samme regel som `slårKort` i motoren. */
function slår(ny: Kort, holder: Kort, ledFarge: number, trumf: number): boolean {
  const nt = fargeAv(ny) === trumf;
  const ht = fargeAv(holder) === trumf;
  if (nt !== ht) return nt;
  if (nt) return ny.verdi > holder.verdi;
  if (fargeAv(ny) !== ledFarge) return false;
  if (fargeAv(holder) !== ledFarge) return true;
  return ny.verdi > holder.verdi;
}

type Relasjon = "mot" | "med" | "rolle" | "ukjent";

export function valgtBortTrekk(visning: SpillerVisning): Float32Array {
  const n = visning.antallKort.length;
  if (n !== 4) throw new Error(`Valgt-bort-blokken er bygd for fire spillere, fikk ${n}`);
  const v = new Float32Array(MLB_VALGT_BORT);
  const bv = visning.budvinner;
  const m = visning.melding;
  if (bv === null || m === null || visning.trumf === null) return v;
  const trumf = FARGER.indexOf(visning.trumf);
  const meg = visning.deg;
  const rel = (sete: number): number => (((sete - meg) % n) + n) % n;

  // --- Sekvensen: hvert spilt kort, i den rekkefølgen bordet så dem ---------
  const stikkene: (readonly KortPåBord[])[] = visning.historikk.map((s) => s.kort);
  if (visning.bord.length > 0) stikkene.push(visning.bord);
  const spiltAv = new Int8Array(52).fill(-1);
  const spiltVed = new Int32Array(52).fill(-1);
  /** Første sekvensindeks der setet ikke fulgte fargen (renons), ellers uendelig. */
  const renonsVed = [0, 1, 2, 3].map(() => [Infinity, Infinity, Infinity, Infinity]);
  {
    let i = 0;
    for (const stikk of stikkene) {
      const led = stikk[0] === undefined ? -1 : fargeAv(stikk[0].kort);
      for (const { spiller, kort } of stikk) {
        spiltAv[indeks(kort)] = spiller;
        spiltVed[indeks(kort)] = i;
        const f = fargeAv(kort);
        if (f !== led && renonsVed[spiller]![led]! === Infinity) renonsVed[spiller]![led] = i;
        i++;
      }
    }
  }
  const minHånd = new Uint8Array(52);
  for (const k of visning.dinHånd) minHånd[indeks(k)] = 1;
  // Tom for alle andre enn budvinneren (`spillerVisning`), og bare lest som «ikke hos andre».
  const mittVrak = new Uint8Array(52);
  for (const k of visning.dittVrak) mittVrak[indeks(k)] = 1;

  // --- Lagene, som bordet kjente dem kort for kort -------------------------
  const utenMakker = m.type === "solo" || visning.etterlyst === null;
  const kalt = utenMakker ? -1 : indeks(visning.etterlyst!);
  /** Lagene er offentlige for kort med sekvensindeks STRENGT større enn denne. */
  const avsløring = utenMakker ? -1 : spiltVed[kalt]! >= 0 ? spiltVed[kalt]! : Infinity;
  const makker = utenMakker || avsløring === Infinity ? null : spiltAv[kalt]!;
  const påBudlag = (p: number): boolean => p === bv || p === makker;
  const relasjon = (a: number, h: number, i: number): Relasjon => {
    if (i > avsløring) return påBudlag(a) === påBudlag(h) ? "med" : "mot";
    return (a === bv) !== (h === bv) ? "rolle" : "ukjent";
  };

  /**
   * Kunne `a` ha holdt kortet `c` rett før sekvensindeks `i`, slik observatøren vet det nå?
   * `bevist` betyr at hun hadde det (hun spilte det selv senere, eller hun er meg og har det).
   */
  const kunneHa = (c: number, a: number, i: number): { mulig: boolean; bevist: boolean } => {
    const ved = spiltVed[c]!;
    if (ved >= 0 && ved < i) return { mulig: false, bevist: false };
    if (ved >= i) return spiltAv[c] === a ? { mulig: true, bevist: true } : { mulig: false, bevist: false };
    if (a === meg) return minHånd[c] === 1 ? { mulig: true, bevist: true } : { mulig: false, bevist: false };
    if (minHånd[c] === 1 || mittVrak[c] === 1) return { mulig: false, bevist: false };
    // Uspilt, og hun har vist renons i fargen: da hadde hun det ikke (kort går aldri tilbake).
    if (renonsVed[a]![Math.floor(c / 13)]! < Infinity) return { mulig: false, bevist: false };
    return { mulig: true, bevist: false };
  };
  /** Kan det sitte trumf utenfor `a` sin hånd rett før `i`? Ukjente regnes som ute. */
  const trumfUte = (a: number, i: number): boolean => {
    for (let x = 0; x < 13; x++) {
      const c = trumf * 13 + x;
      const ved = spiltVed[c]!;
      if (ved >= 0 && ved < i) continue;
      if (ved >= i) {
        if (spiltAv[c] !== a) return true;
        continue;
      }
      if (mittVrak[c] === 1) continue; // dødt, og bare budvinneren vet det
      if (a === meg && minHånd[c] === 1) continue;
      return true;
    }
    return false;
  };

  const utspill: { spiller: number; farge: number }[] = [];
  let i = 0;
  for (let s = 0; s < stikkene.length; s++) {
    const stikk = stikkene[s]!;
    const første = stikk[0];
    if (første === undefined) continue;
    const ledFarge = fargeAv(første.kort);
    let holder = første;
    for (let j = 0; j < stikk.length; j++, i++) {
      const { spiller: a, kort } = stikk[j]!;
      const f = fargeAv(kort);
      const celle = rel(a) * VALGT_BORT_PER_SETE;

      if (j === 0) {
        const kjent = i > avsløring;
        // Stikk 1 åpnes med trumf av plikt (`lovligeKort`), så valget begynner i stikk 2.
        if (s >= 1 && (kjent ? påBudlag(a) : a === bv) && trumfUte(a, i)) {
          v[celle + BUDLAG_UTSPILL]! += 1 / 4;
          if (f !== trumf) v[celle + BUDLAG_SIDEUTSPILL]! += 1 / 4;
        }
        if (kjent) {
          let lagkamerat: number | null = null;
          for (let u = utspill.length - 1; u >= 0; u--) {
            const q = utspill[u]!.spiller;
            if (q !== a && påBudlag(q) === påBudlag(a)) {
              lagkamerat = utspill[u]!.farge;
              break;
            }
          }
          if (lagkamerat !== null) {
            if (f === lagkamerat) v[celle + RETUR]! += 1 / 4;
            else {
              let kunne = false;
              for (let x = 0; x < 13 && !kunne; x++) kunne = kunneHa(lagkamerat * 13 + x, a, i).mulig;
              if (kunne) v[celle + IKKE_RETUR]! += 1 / 4;
            }
          }
        }
        utspill.push({ spiller: a, farge: f });
        continue;
      }

      const r = relasjon(a, holder.spiller, i);
      const motpart = r === "mot" || r === "rolle";
      if (f !== ledFarge) {
        // Renons. Trumf ledet gir ingen trumf å velge bort; trumfet hun, er det TRUMFET i signalblokken.
        if (f !== trumf && ledFarge !== trumf && motpart) {
          if (r === "rolle") v[celle + KASTET_ROLLE]! += 1 / 4;
          else if (fargeAv(holder.kort) === trumf) v[celle + KASTET_UNDER_TRUMF_MOT]! += 1 / 4;
          else v[celle + KASTET_MOT]! += 1 / 4;
        }
      } else if (j === n - 1 && motpart && fargeAv(holder.kort) === ledFarge) {
        let mulig = kort.verdi > holder.kort.verdi;
        let bevist = false;
        for (let verdi = holder.kort.verdi + 1; verdi <= 14; verdi++) {
          const c = ledFarge * 13 + (verdi - 2);
          if (c === indeks(kort)) continue;
          const k = kunneHa(c, a, i);
          if (k.mulig) mulig = true;
          if (k.bevist) bevist = true;
        }
        if (mulig) {
          v[celle + SIST_SJANSE]! += 1 / 4;
          if (kort.verdi < holder.kort.verdi) {
            v[celle + DUKKET]! += 1 / 4;
            if (bevist) v[celle + DUKKET_BEVIST]! += 1 / 4;
          }
        }
      }
      if (slår(kort, holder.kort, ledFarge, trumf)) holder = stikk[j]!;
    }
  }
  return v;
}
