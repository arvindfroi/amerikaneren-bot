/**
 * VERDIBLOKKEN (v7, indeks 428–457): hva hånden min er verdt AKKURAT NÅ.
 *
 * ARVINDS INNVENDING, og den treffer et hull ingen av de fire foregående
 * blokkene dekker:
 *
 *   «det holder ikke bare å telle hvor mange av hver farge, men også hvilken
 *    valør. Det er bare slik at den kan vite selv hva kortene hans er verdt.
 *    Verdien av hånden endrer seg konstant gjennom spillet.»
 *
 * Telleblokken (v3) teller ANTALL per sete og farge. Troblokken (v6) gir
 * ytterpunktene og en øvre grense. Ingen av dem sier hva MINE kort er verdt –
 * og den verdien er ikke en egenskap ved kortet, den er en funksjon av hva som
 * er igjen ute. Spar konge er to sikre stikk verdt når esset er falt, og en
 * sikker taper når det ikke er.
 *
 * EKSEMPELET SOM VISER HVA SOM MANGLER, i Arvinds ord: en forsvarer spiller en
 * farge spillefører er renons i. Stikket tapes, men spillefører må trumfe.
 * «Selv om stikket går tapt, fikk det lave kortet mye verdi, fordi senere i
 * spillet er det ett mindre sikkert stikk.»
 *
 * Det er TVINGNING, og verdien ligger ikke i kortet – den ligger i FORHOLDET
 * mellom min fordeling og deres renonser. Ingen trekk i kodingen uttrykker
 * det i dag.
 *
 * TRETTI TREKK, ALLE EKSAKT REGNBARE – ingen sampling, ingen usikkerhet:
 *
 *   PER FARGE (6 × 4)
 *     har mesteren          holder jeg det høyeste kortet som er ute?
 *     sikre stikk           hvor mange topper på rad jeg holder
 *     sikre tapere          kort som ikke kan vinne et stikk i fargen
 *     jeg er renons         da må jeg trumfe eller kaste når den spilles
 *     noen andre er renons  da kan mine vinnere trumfes bort
 *     JEG KAN TVINGE        en motstander er renons og jeg har fargen –
 *                           å spille den koster ham en trumf
 *
 *   SAMLET (6)
 *     sum sikre stikk / sum sikre tapere
 *     sikre stikk minus det som mangler   – er kontrakten allerede i havn?
 *     hvor lett kan JEG tvinges           – renonser jeg har, som andre kan angripe
 *     hvor mange jeg kan tvinge           – Arvinds eksempel som et tall
 *     trumfovervekt                       – egne trumf minus trumf ute
 *
 * REN FUNKSJON AV DE 428 FØRSTE TREKKENE, som planblokken. Egen hånd ligger i
 * 0–51, alle spilte kort i 52–103, renonser per relativt sete i 246–261, og
 * trumffargen i 220–224. Ingenting her krever `state`, så 283 000 ferdige
 * rader kan utvides uten ny generering – og trekket finnes bare ett sted.
 *
 * «SIKKER» ER SIKKER I FARGEN, IKKE I RUNDEN. Et ess er et sikkert stikk til
 * noen trumfer det. Derfor står «noen andre er renons» ved siden av: sammen
 * uttrykker de forskjellen mellom et stikk man har og et stikk man tror man
 * har. Å love mer enn det ville vært å lyve i et trekk, og det er nøyaktig
 * feilen troblokkens øvre grense er testet mot.
 */


/** v6-bredden denne blokken legger seg oppå. */
export const VERDI_FRA = 428;
export const VERDI_ANTALL = 30;

const I_HAAND = 0; // 0–51
const I_SPILT = 52; // 52–103
const I_RENONS = 246; // 246–261: relativt sete × farge
const I_TRUMF = 220; // 220–223, 224 = ingen trumf
const I_BUD = 225;
const I_LAGSTIKK = 230;

/** Kortindeks for farge f, verdi v (2–14). Samme koding som `kortIndeks`. */
const idx = (f: number, v: number): number => f * 13 + (v - 2);

export function fyllVerdiblokk(v: Float32Array): void {
  const MESTER = VERDI_FRA;
  const SIKRE = VERDI_FRA + 4;
  const TAPERE = VERDI_FRA + 8;
  const MIN_RENONS = VERDI_FRA + 12;
  const ANDRE_RENONS = VERDI_FRA + 16;
  const KAN_TVINGE = VERDI_FRA + 20;
  const S = VERDI_FRA + 24;

  let trumf = -1;
  for (let f = 0; f < 4; f++) if ((v[I_TRUMF + f] ?? 0) > 0.5) trumf = f;

  let sumSikre = 0;
  let sumTapere = 0;
  let kanTvinges = 0;
  let kanTvinge = 0;
  let mineTrumf = 0;
  let trumfUte = 0;

  for (let f = 0; f < 4; f++) {
    // UTE = verken i min hånd eller spilt. Nøyaktig samme definisjon som 262–269.
    const mine: number[] = [];
    const ute: number[] = [];
    for (let verdi = 14; verdi >= 2; verdi--) {
      const i = idx(f, verdi);
      if ((v[I_HAAND + i] ?? 0) > 0.5) mine.push(verdi);
      else if ((v[I_SPILT + i] ?? 0) <= 0.5) ute.push(verdi);
    }
    const høyestUte = ute.length > 0 ? ute[0]! : 0;

    // SIKRE STIKK: topper på rad. Jeg teller nedover fra det høyeste kortet i
    // fargen; hvert av mine kort som ligger over ALT som er ute, er sikkert.
    // Stopper ved første motstanderkort som er høyere enn mitt neste.
    let sikre = 0;
    let uteIdx = 0;
    for (const m of mine) {
      if (uteIdx < ute.length && ute[uteIdx]! > m) break;
      sikre++;
    }
    // SIKRE TAPERE: mine kort som er lavere enn nok utekort til at de aldri
    // kan vinne – konservativt: kort under det laveste utekortet teller ikke,
    // så vi teller dem som ligger under høyeste ute OG ikke er blant de sikre.
    const tapere = mine.length - sikre;

    const minRenons = mine.length === 0 ? 1 : 0;
    // Rad 0 er meg selv i 246–261, og den er alltid 0 der. Motstanderrenonser
    // er radene 1–3. «Noen andre» = minst én av dem.
    let andreRenons = 0;
    for (let r = 1; r < 4; r++) if ((v[I_RENONS + r * 4 + f] ?? 0) > 0.5) andreRenons = 1;

    v[MESTER + f] = mine.length > 0 && mine[0]! > høyestUte ? 1 : 0;
    v[SIKRE + f] = sikre / 13;
    v[TAPERE + f] = tapere / 13;
    v[MIN_RENONS + f] = minRenons;
    v[ANDRE_RENONS + f] = andreRenons;
    // JEG KAN TVINGE: noen andre er tom i fargen, jeg har den, og det finnes
    // trumf å tvinge ut. Å spille fargen koster ham en trumf.
    v[KAN_TVINGE + f] = andreRenons === 1 && mine.length > 0 && trumf >= 0 && f !== trumf ? 1 : 0;

    sumSikre += sikre;
    sumTapere += tapere;
    // JEG KAN TVINGES: jeg er tom i en farge som fortsatt finnes ute, og det
    // er trumf i spill – da koster hver runde i den fargen meg en trumf.
    if (minRenons === 1 && ute.length > 0 && trumf >= 0 && f !== trumf) kanTvinges++;
    if (v[KAN_TVINGE + f] === 1) kanTvinge++;
    if (f === trumf) {
      mineTrumf = mine.length;
      trumfUte = ute.length;
    }
  }

  const bud = Math.round((v[I_BUD] ?? 0) * 13);
  const lagStikk = Math.round((v[I_LAGSTIKK] ?? 0) * 13);
  const mangler = Math.max(0, bud - lagStikk);

  v[S + 0] = sumSikre / 13;
  v[S + 1] = sumTapere / 13;
  // SIKRE STIKK MINUS DET SOM MANGLER. Positivt betyr at kontrakten er i havn
  // uten at et eneste kort til må spilles godt.
  v[S + 2] = Math.max(-1, Math.min(1, (sumSikre - mangler) / 13));
  v[S + 3] = kanTvinges / 4;
  v[S + 4] = kanTvinge / 4;
  v[S + 5] = Math.max(-1, Math.min(1, (mineTrumf - trumfUte) / 13));
}
