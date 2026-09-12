/**
 * REFERANSEPOLICYEN FOR OVERRASKELSESBLOKKA (13. sep, andre forsøk).
 *
 * ===================== HVORFOR FILA FINNES ==============================
 *
 * Første forsøk (`src/mlb/overraskelse.ts`, gren `overraskelse-2026-09-13`) målte NULL:
 * holdout 0,95817 uten blokka mot 0,95819 med, snitt over tre frø, mens spennet mellom frø
 * var 0,0012 — seksti ganger større. Håndverket var i orden (blokka fylt i 97,8 % av radene,
 * prefikset bit-identisk, nullpunktprøven grønn). Diagnosen var referansepolicyen:
 *
 *   `genererOgOrdne` sin grådige ordning — «vinn billigst / kast billigst, ikke overtrumf
 *   makkeren» — er så forutsigbar at overraskelsen den måler nesten er en funksjon av
 *   kortrangene, og de ser nettet allerede.
 *
 * Det som VIRKET (likelihood-vekting ved søketid, `~lik=selv`, +3,83 pp sent i runden) bruker
 * botens EGEN policy som referanse. Denne fila bytter ut den grådige ordningen med et NETT, og
 * bare det: samme 48 trekk, samme ekvivalensklasser, samme vindu, samme layout.
 *
 * ===================== PROBLEMET INGEN AV DE TO ANDRE HAR ===============
 *
 * Den grådige ordningen er en funksjon av (kortet, kortet som holder, trumf, ledfarge, lag).
 * Alt offentlig. `likvekt` slipper unna fordi den har en TRUKKET VERDEN å spille i, altså en
 * konkret hånd. Et kortnett har ingen av delene: `e1SpillTrekk` tar setets EGEN HÅND.
 *
 * En tilskuer har ikke hånden. Det er ikke en detalj som kan vinkes bort — det er hele
 * grunnen til at blokka er interessant, og det er stedet en juks ville sneket seg inn. Løsningen
 * her er SKYGGEVISNINGEN: nettet får den offentlige kandidatmengden («kortene hun KUNNE hatt»)
 * som hånd. Ingen skjult kort kommer inn, og K2-prøven i `test/mlb-overraskelse.test.ts` — bytt
 * de skjulte hendene, krev bit-identisk vektor — dekker denne fila uendret.
 *
 * TO VARIANTER, fordi valget er en approksimasjon og ikke en sannhet:
 *
 *   HARD   hånden er kandidatmengden, ett-hot. Enkel, men nettet ser en hånd på 15–30 kort.
 *   MYK    hvert kandidatkort veies med w = håndstørrelse / antall kandidater, altså den
 *          marginale sannsynligheten for at hun har det. Da har håndblokka RIKTIG L1-masse,
 *          og for første lineære lag er dette nøyaktig snittet av nettet over alle hender
 *          som er forenlige med det bordet ser (mean field). Etter ReLU er det en
 *          approksimasjon, og det skal stå slik.
 *
 * Hvilken som brukes er ikke en smakssak: `_probe-ref2.ts` måler −log π(kortet som FAKTISK ble
 * spilt) på ekte stillinger for hver variant og hver temperatur, og den med lavest tall vinner.
 * Det er den samme kalibreringen en tilskuer kunne gjort selv, på offentlige data.
 *
 * ===================== TEMPERATUREN ER KALIBRERT, IKKE GJETTET ==========
 *
 * Den grådige policyen har `OVERRASKELSE_TEMP = 4` som én fri konstant. Nettpolicyen har
 * samme frihet, og den settes av kalibreringssveipet over: T som minimerer NLL på de faktiske
 * kortene. RANG, FRIHET og TVUNGET er temperaturfrie uansett.
 *
 * ===================== RESULTATET: OGSÅ NULL, OG DET ER ET SVAR =========
 *
 * Målt 13. sep, samme oppsett som første forsøk (152 831 treningsrader, 22 976 holdoutrader,
 * BIT-IDENTISKE rader i begge armer, tre frø):
 *
 *     996 (uten)   0,95790 / 0,95772 / 0,95889   snitt 0,95817
 *     1044 (med)   0,95885 / 0,95842 / 0,95737   snitt 0,95821
 *
 * Forskjellen er +0,00004 nat/kort mot et spenn mellom frø på 0,0012–0,0015. Ingen effekt.
 *
 * DET VIKTIGE ER SAMMENLIKNINGEN, ikke tallet. Nettreferansen er en MYE bedre spillermodell
 * enn den grådige: NLL 1,3287 mot 1,6679 på de faktiske kortene, topp1 43,2 % mot 39,3 %. De
 * to gir samme holdout til fjerde desimal (0,95819 mot 0,95821). Diagnosen fra første forsøk —
 * «referansen er for forutsigbar» — er dermed PRØVD OG FORKASTET. Ligger det noe igjen i denne
 * kanalen, ligger det i KODINGEN (48 aggregater over et vindu på 12 kort) eller i at trohodet
 * alt henter det samme ut av `valgtbort`, hvem-la-hva og kortrangene — ikke i referansen.
 *
 * Kostnaden, for den som vurderer å bruke den til noe annet: ~1,44 ms per rad mot 21,5 µs for
 * den grådige, altså ~9 foroverganger per rad. Full logg: `D:\amb-grp\loop\overraskelse2.md`.
 *
 * ===================== K2: HVA SKYGGEVISNINGEN INNEHOLDER ===============
 *
 * Bygd fra `SpillerVisning` ALENE, pluss kandidatmengden (som er utledet av visningen).
 * Historikken og bordet spoles tilbake til det tidspunktet valget ble tatt — samme grep som
 * `likvekt.ts` gjør for sitt vindu, og av samme grunn: en stilling satt sammen av felt fra to
 * tidspunkt er den stumme feilen som gir et tall som ser riktig ut.
 *
 * `e1SpillTrekk` kalles med `E1_SPILL_DIM` (273) og INGEN VIDERE. Det er en K2-grense, ikke en
 * ytelsesgrense: fra 273 og oppover leser kodingen `state.vrak` (minneblokka), `state.giving`
 * for døde kort og troblokka — felt en skygge ikke kan fylle ærlig. Bredden håndheves i
 * `nettReferanse`.
 */

import { readFileSync } from "node:fs";

import { FARGER, type Farge, type Kort, type Verdi } from "../kort.ts";
import type { GameState, KortPåBord, SpillerVisning, Stikk } from "../motor.ts";
import { e1SpillTrekk, E1_SPILL_DIM } from "../e1/trekk.ts";
import { forover, nettFraBytes, type NevroNett } from "../nevro/nett.ts";
import { SPILL_DIM } from "../nevro/trekk.ts";

/** Alt som skal til for å score ETT kortvalg, slik en tilskuer så det. */
export interface Valgkontekst {
  readonly visning: SpillerVisning;
  /** Absolutt sete som tok valget. */
  readonly sete: number;
  /** Stikknummeret (indeks i `stikkene`). */
  readonly stikk: number;
  /** Posisjonen i stikket: 0 = utspill. */
  readonly pos: number;
  /** Ledfargen som indeks i `FARGER`, eller −1 ved utspill. */
  readonly ledFarge: number;
  /** Kortindeksen som holdt stikket da valget ble tatt, eller −1 ved utspill. */
  readonly holder: number;
  /** Holder en KJENT lagkamerat stikket? (Før makkeren er avslørt: alltid usant.) */
  readonly makkerVinner: boolean;
  readonly trumf: number;
  readonly antallStikk: number;
  readonly målPoeng: number;
  /** Hele den offentlige kortrekka, stikk for stikk. */
  readonly stikkene: readonly (readonly KortPåBord[])[];
  /**
   * Kandidatmengden: 1 for hvert kort setet KUNNE hatt da valget ble tatt, utledet av
   * visningen alene (`kunneHa` i `overraskelse.ts`). Dette er skyggehånden.
   */
  readonly kandidater: Uint8Array;
  /** Hvor mange kort setet hadde på hånden DA valget ble tatt. */
  readonly håndStørrelse: number;
  /** Er makkeren kjent for bordet på dette tidspunktet? */
  readonly makkerKjent: boolean;
  /** Makkerens sete når det er kjent, ellers null. */
  readonly makker: number | null;
}

/**
 * En referansepolicy skriver ett POENG per ekvivalensklasse (høyere = mer sannsynlig),
 * ALLEREDE delt på sin egen temperatur. Softmaxen tas av kalleren, som dermed er den samme
 * for alle policyer — det er hele poenget med målingen.
 */
export interface Referansepolicy {
  readonly navn: string;
  poeng(ktx: Valgkontekst, rep: readonly number[], ut: number[]): void;
}

const rangAv = (c: number): number => c % 13;

/** Slår kortindeksen `c` det som holder stikket? Samme regel som i motoren og i dds. */
function slårIndeks(c: number, holder: number, ledFarge: number, trumf: number): boolean {
  const nf = Math.floor(c / 13);
  const hf = Math.floor(holder / 13);
  const nt = nf === trumf;
  const ht = hf === trumf;
  if (nt !== ht) return nt;
  if (nt) return rangAv(c) > rangAv(holder);
  if (nf !== ledFarge) return false;
  if (hf !== ledFarge) return true;
  return rangAv(c) > rangAv(holder);
}

/** Straffen for å bryte policyens gruppe. Én hel rangstige = minste verdi som bevarer ordningen. */
export const GRÅDIG_GRUPPE = 13;
/** Softmax-temperaturen i den grådige ordningen. Uendret fra første forsøk. */
export const GRÅDIG_TEMP = 4;

/**
 * FØRSTE FORSØKS POLICY, ord for ord: motorens egen trekkordning (`genererOgOrdne`).
 *
 *     utspill:  nøkkel = 12 − rang(c)
 *     følge:    vil    = makkerVinner ? !vinner : vinner
 *               nøkkel = (vil ? 0 : 13) + rang(c)
 *
 * Den står igjen fordi den er MÅLESTOKKEN: nullresultatet ble målt mot nøyaktig denne, og
 * `_probe-ref2.ts` sammenlikner den mot nettet på de samme stillingene.
 */
export const GRÅDIG: Referansepolicy = {
  navn: "grådig",
  poeng(ktx, rep, ut) {
    for (let q = 0; q < rep.length; q++) {
      const x = rep[q]!;
      let nøkkel: number;
      if (ktx.pos === 0) {
        nøkkel = 12 - rangAv(x);
      } else {
        const vinner = slårIndeks(x, ktx.holder, ktx.ledFarge, ktx.trumf);
        const vil = ktx.makkerVinner ? !vinner : vinner;
        nøkkel = (vil ? 0 : GRÅDIG_GRUPPE) + rangAv(x);
      }
      ut[q] = -nøkkel / GRÅDIG_TEMP;
    }
  },
};

const kortFra = (i: number): Kort => ({ farge: FARGER[Math.floor(i / 13)] as Farge, verdi: ((i % 13) + 2) as Verdi });

/** Der `e1SpillTrekk` legger sine egne 35 trekk (238). */
const BASIS = SPILL_DIM;

/**
 * SKYGGEVISNINGEN: stillingen slik den var RETT FØR valget, med kandidatmengden som hånd.
 *
 * Bygd av `SpillerVisning` alene. Feltene som beskriver NÅET og ikke tidspunktet — `bord`,
 * `stikkSpilt`, `stikkVunnet`, `forrigeStikk`, `utspiller`, `makkerAvslørt` — spoles tilbake.
 * Det er nøyaktig feilklassen `likvekt.ts` dokumenterer, og den er stum: ingenting krasjer,
 * tallet blir bare feil.
 */
function skyggetilstand(ktx: Valgkontekst, hånd: Kort[]): GameState {
  const v = ktx.visning;
  const n = v.antallKort.length;
  const hender: Kort[][] = [];
  for (let p = 0; p < n; p++) hender.push(p === ktx.sete ? hånd : []);
  const historikk: Stikk[] = v.historikk.slice(0, ktx.stikk);
  const stikkVunnet = new Array<number>(n).fill(0);
  for (const st of historikk) stikkVunnet[st.vinner] = (stikkVunnet[st.vinner] ?? 0) + 1;
  const stikk = ktx.stikkene[ktx.stikk] ?? [];
  const bord = stikk.slice(0, ktx.pos);
  const talong = 52 - ktx.antallStikk * n;
  return {
    regler: { antallSpillere: n, medByttekort: talong > 0, målPoeng: ktx.målPoeng },
    giving: { kortPerSpiller: ktx.antallStikk, talong: Math.max(0, talong), antallStikk: ktx.antallStikk },
    antallSpillere: n,
    frø: 0,
    rundeNr: v.rundeNr,
    giver: v.giver,
    fase: "SPILL",
    iTur: ktx.sete,
    totalPoeng: v.totalPoeng,
    vinner: null,
    hender,
    // Talongen og vraket er TOMME, ikke gjettet. Ved 273 leser kodingen ingen av dem
    // (`E1_SPILL_DIM`-grensen håndheves i `nettReferanse`), så tomheten kan ikke lekke inn.
    talong: [],
    budrunde: v.budrunde,
    budvinner: v.budvinner,
    melding: v.melding,
    vrak: [],
    trumf: v.trumf,
    etterlyst: v.etterlyst,
    makker: ktx.makkerKjent ? ktx.makker : null,
    makkerAvslørt: ktx.makkerKjent,
    utspiller: stikk[0]?.spiller ?? ktx.sete,
    bord,
    stikkVunnet,
    stikkSpilt: ktx.stikk,
    forrigeStikk: ktx.stikk > 0 ? (v.historikk[ktx.stikk - 1] ?? null) : null,
    historikk,
    sisteRunde: null,
  };
}

export interface NettOpts {
  /** Softmax-temperaturen på logitene. Kalibreres av `_probe-ref2.ts`. */
  readonly temp?: number;
  /** `true` gir MYK skyggehånd (mean field), `false` HARD (ett-hot kandidatmengde). */
  readonly myk?: boolean;
  /** Navnet som havner i loggen og i sondene. */
  readonly navn?: string;
}

/**
 * KORTNETTET SOM REFERANSEPOLICY.
 *
 * Ett kall til `forover` per scoret valg — nettet gir alle 52 logitene på én gang, så
 * kostnaden er ÉN forovergang per valg, ikke én per lovlig kort. Softmaxen tas over
 * ekvivalensklassene av kalleren.
 */
export function nettReferanse(nett: NevroNett, opts: NettOpts = {}): Referansepolicy {
  const første = nett.lag[0];
  const siste = nett.lag[nett.lag.length - 1];
  if (første === undefined || siste === undefined) throw new Error("Referansenettet er tomt");
  if (første.inn !== E1_SPILL_DIM) {
    // Se hodet: over 273 leser kodingen vrak, talongstørrelse og tro — felt en skygge ikke
    // kan fylle ærlig. Et bredere nett ville fått nuller der og spilt etter noe annet enn
    // det det ble trent på, uten at noe feilet.
    throw new Error(`Referansenettet tar ${første.inn} trekk; skyggevisningen er bare definert for ${E1_SPILL_DIM}`);
  }
  if (siste.ut !== 52) throw new Error(`Referansenettet har ${siste.ut} utganger, forventet 52`);
  const temp = opts.temp ?? 1;
  if (!(temp > 0)) throw new Error(`Referansetemperaturen må være > 0, fikk ${temp}`);
  const myk = opts.myk ?? false;
  const navn = opts.navn ?? `nett${myk ? "-myk" : "-hard"}@${temp}`;
  /** Gjenbrukt: kandidatmengden som `Kort`, én gang per valg. */
  const hånd: Kort[] = [];

  return {
    navn,
    poeng(ktx, rep, ut) {
      // HÅNDEN ER KANDIDATMENGDEN, ikke bare klasserepresentantene: nettet skal se hva hun
      // KUNNE hatt, og to kort i samme ekvivalensrekke er to kort på hånden.
      hånd.length = 0;
      const kand = ktx.kandidater;
      for (let x = 0; x < 52; x++) if (kand[x] === 1) hånd.push(kortFra(x));
      const st = skyggetilstand(ktx, hånd);
      const v = e1SpillTrekk(st, ktx.sete, E1_SPILL_DIM);
      if (myk && hånd.length > 0) {
        /**
         * MEAN FIELD: hvert kandidatkort veies med sannsynligheten for at hun har det.
         * Håndblokka (0–51) og egen fargefordeling (238–241) skaleres, og «hvor mange kort
         * er fortsatt ute» (266–269) får kandidatene tilbake med vekt (1 − w). De to andre
         * håndavhengige cellene — høyeste kort ute (262–265) — står: en BRØKDEL av et kort
         * har ingen rang, og å gjette en ville vært å dikte.
         */
        const w = Math.min(1, ktx.håndStørrelse / hånd.length);
        for (let x = 0; x < 52; x++) if (kand[x] === 1) v[x] = w;
        for (let f = 0; f < 4; f++) v[BASIS + f] = 0;
        for (const k of hånd) v[BASIS + FARGER.indexOf(k.farge)]! += w / 13;
        const igjen = [0, 0, 0, 0];
        for (let x = 0; x < 52; x++) if (kand[x] === 1) igjen[Math.floor(x / 13)]! += 1 - w;
        for (let f = 0; f < 4; f++) v[BASIS + 28 + f]! += igjen[f]! / 13;
      }
      const g = forover(nett, v);
      for (let q = 0; q < rep.length; q++) ut[q] = g[rep[q]!]! / temp;
    },
  } as Referansepolicy;
}

/** Leser et nett fra fil (appformatet), med en feilmelding som sier hvilken fil som er gal. */
export function lesReferansenett(sti: string): NevroNett {
  const n = nettFraBytes(new Uint8Array(readFileSync(sti)))[0];
  if (n === undefined) throw new Error(`Tomme vekter i referansenettet «${sti}»`);
  return n;
}

/**
 * SPEKFORMEN, så generatoren og sondene velger den SAMME policyen fra ett felt:
 *
 *   `graadig`                          første forsøks ordning
 *   `nett:<fil>[@<temp>][:myk]`        kortnettet som referanse
 *
 * Standarden står i `STANDARD_REFERANSE` og er den som er kalibrert på ekte stillinger.
 */
export function lesReferansespek(spek: string): Referansepolicy {
  if (spek === "graadig" || spek === "grådig") return GRÅDIG;
  if (!spek.startsWith("nett:")) throw new Error(`Ukjent referansespek «${spek}» (graadig | nett:<fil>[@temp][:myk])`);
  const rest = spek.slice(5);
  const myk = rest.endsWith(":myk");
  const uten = myk ? rest.slice(0, -4) : rest;
  const kutt = uten.lastIndexOf("@");
  const fil = kutt < 0 ? uten : uten.slice(0, kutt);
  const temp = kutt < 0 ? 1 : Number(uten.slice(kutt + 1));
  if (!(temp > 0)) throw new Error(`Ugyldig temperatur i «${spek}»`);
  if (fil === "") throw new Error(`Referansespeken «${spek}» mangler filnavn`);
  return nettReferanse(lesReferansenett(fil), { temp, myk, navn: spek });
}

/**
 * DEN AKTIVE REFERANSEN, ett sted.
 *
 * `AMB_OVERRASKELSE_REF` overstyrer for sonder og A/B; standarden er den kalibrerte. Nettet
 * lastes ÉN gang og bufres, ellers ville hver rad lest 1,8 MB fra disk.
 */
export const STANDARD_REFERANSE = "nett:e1-modell/kort-7.bin@2";

let bufret: { spek: string; pol: Referansepolicy } | null = null;
export function aktivReferanse(): Referansepolicy {
  const spek = process.env["AMB_OVERRASKELSE_REF"] ?? STANDARD_REFERANSE;
  if (bufret === null || bufret.spek !== spek) bufret = { spek, pol: lesReferansespek(spek) };
  return bufret.pol;
}
