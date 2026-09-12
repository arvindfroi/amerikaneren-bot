/**
 * MLB — SANS: OVERRASKELSEN I ET KORTVALG (13. sep). Bygd fra `SpillerVisning` alene.
 *
 * K8 kanal 5 i `AdamsMax.md`: «et spilt kort er bevis BARE i forhold til alternativene
 * spilleren hadde. Legger makker dame fra K-D blanke, betyr damen noe helt annet enn fra
 * D-J-10.» `valgtbort.ts` (40 trekk) gir trohodet HVILKE kort som ble valgt bort — rå
 * fakta, og det målte null. Hypotesen her er at rå alternativer er for svakt: nettet må
 * selv gjenoppdage hvor OVERRASKENDE valget var. Denne blokken gir tallet direkte.
 *
 * ===================== HVA SOM BEGRUNNER FORSØKET ========================
 *
 * Likelihood-vektingen av verdenene ved søketid (`~lik=selv,f7`, `src/moe2/likvekt.ts`)
 * vekter hver trukket kortfordeling etter hvor godt den forklarer motstandernes FAKTISKE
 * trekk. Den ga +3,83 pp riktig plasserte kort sent i runden og K8 −0,096 nat/kort.
 * Informasjonen finnes altså. Men den koster 2,5× i søk, virker bare i de siste stikkene,
 * og på K1 falt den (+0,91 mot +1,01 uten). Blokken her prøver den ANDRE veien: samme
 * slags informasjon som et TREKK — gratis, i hvert eneste valg, hele runden.
 *
 * Det er en ANNEN størrelse enn `likvekt`, og det skal stå tydelig. `likvekt` scorer en
 * HYPOTETISK verden mot de observerte trekkene. En tilskuer har ingen verden å score, så
 * her scores valget mot den OFFENTLIGE alternativmengden i stedet. Det er den ærlige
 * tilskuerversjonen av det samme spørsmålet, ikke det samme tallet.
 *
 * ===================== ANDRE FORSØK: REFERANSEN ER BYTTET UT (13. sep) ===
 *
 * Første forsøk målte NULL — holdout 0,95817 uten mot 0,95819 med, snitt over tre frø, mot et
 * spenn mellom frø på 0,0012. Diagnosen var referansepolicyen, ikke håndverket: den grådige
 * ordningen under er så forutsigbar at overraskelsen den måler nesten er en funksjon av
 * kortrangene, og dem ser nettet allerede.
 *
 * Policyen er derfor gjort til et ARGUMENT (`src/mlb/refpolicy.ts`). Alt annet står: samme 48
 * trekk, samme ekvivalensklasser, samme vindu, samme layout, samme klemming. Da er målingen en
 * ren sammenlikning av to referanser. Standarden i generatoren er nettreferansen
 * (`aktivReferanse()`); den grådige står igjen som `GRÅDIG` og er fortsatt standarden for et
 * kall med ett argument, slik at første forsøks tall kan gjenskapes.
 *
 * ===================== REFERANSEPOLICYEN I FØRSTE FORSØK ================
 *
 * Ingen ny håndskrevet heuristikk. `genererOgOrdne` (`src/solver/dds.ts`) er søkets egen
 * deterministiske trekkordning — «vinn så billig som mulig, ellers kast billigst, men ikke
 * overtrumf makkeren» — og `grådigTilSlutt` SPILLER etter den. Nøkkelen er:
 *
 *     utspill:  nøkkel = 12 − rang(c)                     (høyt kort først)
 *     følge:    vil    = makkerVinner ? !vinner : vinner
 *               nøkkel = (vil ? 0 : 100) + rang(c)        (vinn billigst / kast billigst)
 *
 * Den nøkkelen er en funksjon av kortet, kortet som holder stikket, trumf, ledfargen og om
 * holderen er lagkamerat. ALT dette er offentlig. `genererOgOrdne` selv tar en `DDPosisjon`
 * med hele given, så den kan ikke kalles herfra; regelen er skrevet ut, og det er regelen
 * — ikke koden — som er delt. To bevisste avvik:
 *
 *   100 → 13   13 er én hel rangstige, altså den MINSTE verdien som bevarer dds-ordningen
 *              fullstendig (største rangforskjell er 12). 100 ville gjort et gruppebrudd
 *              uendelig overraskende — −log p ≈ 25 nat — og mettet hele skalaen i hver
 *              eneste rad. 13 gjør bruddet overraskende, men endelig og målbart.
 *   softmax    π(c) ∝ exp(−nøkkel/TEMP). Samme grep som `likvekt` sin `temp = 0`-form:
 *              praktisk talt 0/1, men med ORDEN beholdt. TEMP er den ENE frie konstanten i
 *              fila, og RANG, FRIHET og TVUNGET er temperaturfrie — blokken bærer altså
 *              signal selv om temperaturen er feil satt.
 *
 * Policyen er en TILSKUERS modell, ikke spillerens. Før makkeren er avslørt vet ikke bordet
 * hvem som er på lag, og da regner policyen holderen som motpart. Det er ikke en unøyaktighet
 * som skal fikses: en policy som visste mer enn bordet, ville brutt K2.
 *
 * ===================== EKVIVALENS ER IKKE PYNT — DET ER KANALEN =========
 *
 * `genererOgOrdne` sender bare ut TOPPEN av hver ekvivalensrekke (`klasserIFarge`): to kort
 * i samme farge er samme trekk om alt strengt imellom er ute av spill. Blokken gjør nøyaktig
 * det samme, med den offentlige masken «spilt før dette valget». Dame fra K‑D blanke og dame
 * fra D‑J‑10 får derfor ulik rang, ulik entropi og ulik log-sannsynlighet. Det er hele
 * eierens poeng, gjort til fire tall.
 *
 * ===================== K2: HVA DEN LESER ================================
 *
 * Historikken, bordet, budrunden, trumf, etterlyst, `budvinner` — og, som lovlig kunnskap,
 * observatørens EGEN hånd og EGET vrak (`dittVrak`, tom for alle andre enn budvinneren).
 * Ingen andre hender, ingen talong, ingen fasit. Alternativmengden utledes med NØYAKTIG
 * samme regel som `valgtbort.ts` sin `kunneHa`.
 *
 * REGELEN ER SKREVET UT HER, IKKE IMPORTERT, og det er et bevisst valg. `valgtbort.ts` er en
 * av de fem blokkene i 996 — bredden løkka trener nå — og en refaktorering av den fila for å
 * dele en hjelper ville satt produksjonskorpuset i spill for å spare førti linjer i en
 * blokk som ennå ikke er målt. Prisen er en kopi av en deduksjonsregel; den er betalt med
 * åpne øyne, og K2-prøven (`test/mlb-overraskelse.test.ts`) er den samme for begge.
 *
 * ===================== MITT EGET VALG ER IKKE EN SANS ===================
 *
 * Blokken dekker relativt sete 1, 2 og 3. Sete 0 (meg) har ingen plass i layouten — ikke
 * fordi mitt kortvalg er hemmelig, men fordi det ikke er BEVIS: nettet ser hånden min
 * allerede, og overraskelsen i mitt eget trekk sier ingenting om hvor de ukjente kortene
 * ligger. Samme grep, og samme grunn i formen, som tempoblokka.
 *
 * ===================== LAYOUT (3 relative seter × 14 + 6 = 48) ==========
 *
 *   Per relativt sete r ∈ {1, 2, 3}, celle (r − 1) · 14:
 *      0 SETT            1 om setet har minst ett scoret valg i vinduet
 *      1 SISTE_LOGP      −log π(valgt) / LOGTAK for setets SISTE scorede valg, klemt [0, 1]
 *      2 SISTE_ENTROPI   H(π) / HTAK for det valget — var valget fritt eller tvunget?
 *      3 SISTE_RANG      rangen til det valgte, / (m − 1). 0 = policyens toppvalg
 *      4 SISTE_FRIHET    m (antall EKVIVALENSKLASSER hun kunne valgt mellom) / 13
 *      5 SISTE_TOPP      1 om hun spilte policyens toppvalg
 *      6 SISTE_TVUNGET   1 om m = 1 — valget fantes ikke, og kortet er null bevis
 *      7 SNITT_LOGP      snittet over setets scorede valg i vinduet
 *      8 SNITT_ENTROPI   snittet
 *      9 SNITT_RANG      snittet
 *     10 MAKS_LOGP       det ENE mest overraskende valget i vinduet
 *     11 ANDEL_TOPP      andelen av valgene der hun spilte policyens topp
 *     12 ANDEL_FRI       andelen med m ≥ 3 — hvor mye ekte valg det var å lese
 *     13 N_OBS           min(n, TAK_N) / TAK_N — hvor mye snittene hviler på
 *   Felles (indeks 42–47):
 *     42 DEKNING         scorede valg / vinduets lengde
 *     43 NOEN            1 om noe i det hele tatt ble scoret
 *     44 SNITT_LOGP      over alle tre setene
 *     45 SNITT_ENTROPI   over alle tre setene
 *     46 SUM_LOGP        samlet overraskelse i vinduet / SUMTAK, klemt
 *     47 ANDEL_TVUNGET   andelen av valgene som var tvunget (m = 1)
 *
 * DEKNINGEN STÅR I BLOKKEN, av samme grunn som i tempoblokka: en nullblokk som betyr «ingen
 * overraskelse» og en nullblokk som betyr «ingen valg å lese ennå» er ikke det samme. I
 * første stikk er vinduet nesten tomt, og uten `SETT`, `N_OBS` og `DEKNING` ville nettet
 * lest det som at bordet spilte fullstendig forutsigbart.
 */

import { FARGER, type Kort } from "../kort.ts";
import type { KortPåBord, SpillerVisning } from "../motor.ts";
import { GRÅDIG, GRÅDIG_GRUPPE, GRÅDIG_TEMP, type Referansepolicy } from "./refpolicy.ts";

export const OVERRASKELSE_PER_SETE = 14;
/** Bare relativt sete 1, 2, 3 — se toppen. Sete 0 har ingen plass her. */
export const OVERRASKELSE_SETER = 3;
export const OVERRASKELSE_FELLES = 6;
export const MLB_OVERRASKELSE = OVERRASKELSE_SETER * OVERRASKELSE_PER_SETE + OVERRASKELSE_FELLES;

const SETT = 0;
const SISTE_LOGP = 1;
const SISTE_ENTROPI = 2;
const SISTE_RANG = 3;
const SISTE_FRIHET = 4;
const SISTE_TOPP = 5;
const SISTE_TVUNGET = 6;
const SNITT_LOGP = 7;
const SNITT_ENTROPI = 8;
const SNITT_RANG = 9;
const MAKS_LOGP = 10;
const ANDEL_TOPP = 11;
const ANDEL_FRI = 12;
const N_OBS = 13;

/** Der fellesfeltene begynner. */
const FELLES = OVERRASKELSE_SETER * OVERRASKELSE_PER_SETE;
const F_DEKNING = 0;
const F_NOEN = 1;
const F_SNITT_LOGP = 2;
const F_SNITT_ENTROPI = 3;
const F_SUM_LOGP = 4;
const F_ANDEL_TVUNGET = 5;

/**
 * VINDUET: de 12 siste offentlige kortene, altså tre stikk. Grensen er den samme slags
 * kostnadsgrense som `vindu` i `likvekt.ts`, og med samme begrunnelse: de ferskeste
 * observasjonene bærer mest om hva som er IGJEN på hånden, og de eldste er alt fanget av
 * renonseforbudet og av `valgtbort`. Tre stikk gir ~3 valg per motstander, som er akkurat
 * nok til at snittene betyr noe uten at blokken vokser.
 */
export const OVERRASKELSE_VINDU = 12;
/**
 * Softmax-temperaturen i den GRÅDIGE referansen. Bor i `refpolicy.ts` sammen med regelen den
 * hører til, og re-eksporteres her så første forsøks prøver og tall står uendret.
 */
export const OVERRASKELSE_TEMP = GRÅDIG_TEMP;
/** Straffen for å bryte policyens gruppe. Én hel rangstige = minste verdi som bevarer ordningen. */
export const OVERRASKELSE_GRUPPE = GRÅDIG_GRUPPE;
/** −log π klemmes mot dette. Et gruppebrudd koster 13/4 ≈ 3,25 nat, og et bredt valg ~2,5 til. */
export const OVERRASKELSE_LOGTAK = 8;
/** Entropien deles på log 13: en helt flat fordeling over en hel farge er 1. */
export const OVERRASKELSE_HTAK = Math.log(13);
/** Snittene er «mettet» ved fire observasjoner per sete. */
export const OVERRASKELSE_TAK_N = 4;
/** Samlet overraskelse i vinduet klemmes mot dette (nat). */
export const OVERRASKELSE_SUMTAK = 12;

/** Offsetene eksportert som ÉN kilde til sannhet, som ellers i prosjektet. */
export const OVERRASKELSEINNGANG = {
  PER_SETE: OVERRASKELSE_PER_SETE,
  SETT,
  SISTE_LOGP,
  SISTE_ENTROPI,
  SISTE_RANG,
  SISTE_FRIHET,
  SISTE_TOPP,
  SISTE_TVUNGET,
  SNITT_LOGP,
  SNITT_ENTROPI,
  SNITT_RANG,
  MAKS_LOGP,
  ANDEL_TOPP,
  ANDEL_FRI,
  N_OBS,
  FELLES,
  F_DEKNING,
  F_NOEN,
  F_SNITT_LOGP,
  F_SNITT_ENTROPI,
  F_SUM_LOGP,
  F_ANDEL_TVUNGET,
} as const;

const fargeAv = (k: Kort): number => FARGER.indexOf(k.farge);
const indeks = (k: Kort): number => fargeAv(k) * 13 + (k.verdi - 2);

/** Slår `ny` det som holder stikket? Samme regel som `slårKort` i motoren og `slår` i dds. */
function slår(ny: Kort, holder: Kort, ledFarge: number, trumf: number): boolean {
  const nt = fargeAv(ny) === trumf;
  const ht = fargeAv(holder) === trumf;
  if (nt !== ht) return nt;
  if (nt) return ny.verdi > holder.verdi;
  if (fargeAv(ny) !== ledFarge) return false;
  if (fargeAv(holder) !== ledFarge) return true;
  return ny.verdi > holder.verdi;
}

/** Ett scoret valg, slik en tilskuer kunne regnet det ut. */
export interface Valg {
  /** −log π(det spilte kortets ekvivalensklasse), i nat. */
  readonly logp: number;
  /** Entropien i π, i nat. */
  readonly entropi: number;
  /** Rangen til den valgte klassen under π, 0 = toppvalget. */
  readonly rang: number;
  /** Antall ekvivalensklasser hun kunne valgt mellom. */
  readonly m: number;
}

/**
 * Overraskelsen i de siste offentlige kortvalgene, sett fra `visning.deg`.
 *
 * Før trumfen er valgt finnes ingen policy å måle mot, og blokken er null — den ærlige
 * verdien, og nøyaktig det et smalere nett ser der den nye blokken skulle stått.
 */
export function overraskelseTrekk(
  visning: SpillerVisning,
  antallStikk: number = 12,
  målPoeng: number = 100,
  policy: Referansepolicy = GRÅDIG,
  /**
   * SONDEKROKEN: fylles med de scorede valgene per absolutt sete, om den er gitt. Sondene
   * (`_probe-ref2.ts`) måler referansene på NØYAKTIG de tallene blokka bygges av — en egen
   * kopi av løkka i sonden ville målt en annen policy enn den som havner i korpuset.
   */
  utValg?: Valg[][],
): Float32Array {
  const v = new Float32Array(MLB_OVERRASKELSE);
  const n = visning.antallKort.length;
  if (n !== 4) throw new Error(`Overraskelsesblokken er bygd for fire spillere, fikk ${n}`);
  const bv = visning.budvinner;
  const m = visning.melding;
  if (bv === null || m === null || visning.trumf === null) return v;
  const trumf = FARGER.indexOf(visning.trumf);
  const meg = visning.deg;
  const rel = (sete: number): number => (((sete - meg) % n) + n) % n;

  // --- Sekvensen: hvert spilt kort, i den rekkefølgen bordet så dem ---------
  // Nøyaktig samme oppbygning som `valgtbort.ts`; se toppen om hvorfor den står to steder.
  const stikkene: (readonly KortPåBord[])[] = visning.historikk.map((s) => s.kort);
  if (visning.bord.length > 0) stikkene.push(visning.bord);
  const spiltAv = new Int8Array(52).fill(-1);
  const spiltVed = new Int32Array(52).fill(-1);
  /** Første sekvensindeks der setet ikke fulgte fargen (renons), ellers uendelig. */
  const renonsVed = [0, 1, 2, 3].map(() => [Infinity, Infinity, Infinity, Infinity]);
  let antallSpilt = 0;
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
    antallSpilt = i;
  }
  if (antallSpilt === 0) return v;
  /** Vinduets første sekvensindeks. */
  const start = Math.max(0, antallSpilt - OVERRASKELSE_VINDU);
  /** Hvor mange valg vinduet KUNNE båret — nevneren i DEKNING. */
  const vindu = antallSpilt - start;

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
  /**
   * Er holderen en KJENT lagkamerat av `a`? Før avsløringen svarer bordet nei — det er ikke
   * en unøyaktighet, det er det bordet vet. En policy som visste mer, ville brutt K2.
   */
  const kjentMakker = (a: number, h: number, i: number): boolean =>
    i > avsløring && påBudlag(a) === påBudlag(h) && a !== h;

  /**
   * Kunne `a` ha holdt kortet `c` rett før sekvensindeks `i`, slik observatøren vet det nå?
   * ORDRETT samme regel som `kunneHa` i `valgtbort.ts` (uten `bevist`, som ikke brukes her).
   */
  const kunneHa = (c: number, a: number, i: number): boolean => {
    const ved = spiltVed[c]!;
    if (ved >= 0 && ved < i) return false;
    if (ved >= i) return spiltAv[c] === a;
    if (a === meg) return minHånd[c] === 1;
    if (minHånd[c] === 1 || mittVrak[c] === 1) return false;
    // Uspilt, og hun har vist renons i fargen: da hadde hun det ikke (kort går aldri tilbake).
    if (renonsVed[a]![Math.floor(c / 13)]! < Infinity) return false;
    return true;
  };

  // --- Andre pass: score hvert valg i vinduet -------------------------------
  const perSete: Valg[][] = [[], [], [], []];
  /** Gjenbrukte buffere: blokken kalles én gang per rad, og allokering her dominerte ellers. */
  const kandidat = new Uint8Array(52);
  const rep: number[] = [];
  const nøkkel: number[] = [];
  const klasseAv = new Int32Array(52);

  let i = 0;
  for (let s = 0; s < stikkene.length; s++) {
    const stikk = stikkene[s]!;
    const første = stikk[0];
    if (første === undefined) continue;
    const ledFarge = fargeAv(første.kort);
    let holder = første;
    for (let j = 0; j < stikk.length; j++, i++) {
      const { spiller: a, kort } = stikk[j]!;
      const c = indeks(kort);
      const f = fargeAv(kort);
      // Holderen må oppdateres for HVERT kort, også de vi ikke scorer.
      const oppdaterHolder = (): void => {
        if (slår(kort, holder.kort, ledFarge, trumf)) holder = stikk[j]!;
      };
      // Mitt eget valg er ikke bevis (se toppen), og alt før vinduet er utenfor.
      if (a === meg || i < start) {
        oppdaterHolder();
        continue;
      }

      // --- Alternativmengden, slik en tilskuer kan lese den -----------------
      kandidat.fill(0);
      let antKand = 0;
      const leggTil = (x: number): void => {
        if (kandidat[x] === 1) return;
        kandidat[x] = 1;
        antKand++;
      };
      if (j === 0) {
        /**
         * Utspill. I stikk 1 har budvinneren TRUMFPLIKT (`lovligeKort`), og plikten kan
         * leses av kortet hun la: spilte hun trumf, var mengden trumfen hennes; spilte hun
         * noe annet, hadde hun ingen trumf i det hele tatt.
         */
        const pliktig = s === 0 && a === bv;
        for (let x = 0; x < 52; x++) {
          if (!kunneHa(x, a, i)) continue;
          const xf = Math.floor(x / 13);
          if (pliktig && f === trumf && xf !== trumf) continue;
          if (pliktig && f !== trumf && xf === trumf) continue;
          leggTil(x);
        }
      } else {
        const fulgte = f === ledFarge;
        for (let x = 0; x < 52; x++) {
          if (!kunneHa(x, a, i)) continue;
          const xf = Math.floor(x / 13);
          // Fulgte hun farge, HADDE hun fargen og måtte følge. Kastet hun, hadde hun den ikke.
          if (fulgte ? xf !== ledFarge : xf === ledFarge) continue;
          leggTil(x);
        }
        /**
         * MAKKERPLIKTEN I STIKK 1. Er det etterlyste kortet i basis (`lovligeKort`), MÅ det
         * legges. La hun det, fantes det ikke noe valg. La hun noe annet mens kortet ville
         * vært i basis, HADDE hun det ikke — og da er det ikke et alternativ.
         */
        if (s === 0 && kalt >= 0) {
          const kaltFarge = Math.floor(kalt / 13);
          const iBasis = fulgte ? kaltFarge === ledFarge : true;
          if (iBasis) {
            if (c === kalt) {
              kandidat.fill(0);
              kandidat[c] = 1;
              antKand = 1;
            } else if (kandidat[kalt] === 1) {
              kandidat[kalt] = 0;
              antKand--;
            }
          }
        }
      }
      // Det spilte kortet er alltid et alternativ; en tom mengde ville vært en regelfeil.
      if (kandidat[c] !== 1) {
        leggTil(c);
      }

      // --- Ekvivalensklassene, med den offentlige masken --------------------
      /**
       * Samme løkke som `genererOgOrdne`: gå fargen ovenfra og ned over kortene som ennå er
       * i spill, og start en ny klasse bare der rekka brytes av et kort setet IKKE kunne hatt.
       * «I spill» er her det offentlige «ikke spilt før dette valget».
       */
      rep.length = 0;
      nøkkel.length = 0;
      for (let farge = 0; farge < 4; farge++) {
        let forrigeMin = false;
        let nå = -1;
        for (let r = 12; r >= 0; r--) {
          const x = farge * 13 + r;
          const ved = spiltVed[x]!;
          if (ved >= 0 && ved < i) continue; // ute av spill da valget ble tatt
          if (kandidat[x] === 1) {
            if (!forrigeMin) {
              nå = x;
              rep.push(x);
            }
            klasseAv[x] = nå;
            forrigeMin = true;
          } else {
            forrigeMin = false;
          }
        }
      }
      const antKlasser = rep.length;
      if (antKlasser === 0) {
        oppdaterHolder();
        continue;
      }

      /**
       * --- Policyen scorer klassene; SOFTMAXEN ER FELLES --------------------
       *
       * Referansen leverer ett poeng per klasse, alt delt på SIN temperatur. Alt etterpå —
       * softmax, entropi, rang, klemming — er felles for alle referanser. Det er hele grunnen
       * til at de to armene kan sammenliknes: bare poengfunksjonen skiller dem.
       */
      const makkerVinner = j > 0 && kjentMakker(a, holder.spiller, i);
      nøkkel.length = antKlasser;
      // Håndstørrelsen DA valget ble tatt: det hun har nå, pluss det hun har spilt siden.
      let håndStørrelse = visning.antallKort[a] ?? 0;
      for (let x = 0; x < 52; x++) if (spiltAv[x] === a && spiltVed[x]! >= i) håndStørrelse++;
      policy.poeng(
        {
          visning,
          sete: a,
          stikk: s,
          pos: j,
          ledFarge: j === 0 ? -1 : ledFarge,
          holder: j === 0 ? -1 : indeks(holder.kort),
          makkerVinner,
          trumf,
          antallStikk,
          målPoeng,
          stikkene,
          kandidater: kandidat,
          håndStørrelse,
          makkerKjent: i > avsløring,
          makker,
        },
        rep,
        nøkkel,
      );
      let størst = -Infinity;
      for (let q = 0; q < antKlasser; q++) størst = Math.max(størst, nøkkel[q]!);
      let sum = 0;
      // `w` gjenbrukes ikke mellom valg: antall klasser varierer, og en gammel hale ville telt med.
      const w: number[] = [];
      for (let q = 0; q < antKlasser; q++) {
        const e = Math.exp(nøkkel[q]! - størst);
        w.push(e);
        sum += e;
      }
      const valgtKlasse = klasseAv[c]!;
      let pValgt = 0;
      let entropi = 0;
      let rang = 0;
      const poengValgt = nøkkel[rep.indexOf(valgtKlasse)] ?? 0;
      for (let q = 0; q < antKlasser; q++) {
        const p = w[q]! / sum;
        if (p > 0) entropi -= p * Math.log(p);
        if (rep[q] === valgtKlasse) pValgt = p;
        // HØYERE poeng = mer sannsynlig, altså foran i rangeringen (den grådige nøkkelen
        // gikk andre veien; `GRÅDIG` snur den selv, så denne linja er felles).
        if (nøkkel[q]! > poengValgt) rang++;
      }
      perSete[a]!.push({
        logp: pValgt > 0 ? -Math.log(pValgt) : OVERRASKELSE_LOGTAK,
        entropi,
        rang: antKlasser > 1 ? rang / (antKlasser - 1) : 0,
        m: antKlasser,
      });
      oppdaterHolder();
    }
  }

  // Sondekroken: de rå valgene, før klemming og aggregering (se signaturen).
  if (utValg !== undefined) for (let p = 0; p < n; p++) utValg[p] = perSete[p]!;

  // --- Fyll blokken ---------------------------------------------------------
  const klem = (x: number): number => Math.max(0, Math.min(1, x));
  let alleN = 0;
  let alleLogp = 0;
  let alleEntropi = 0;
  let alleTvunget = 0;
  for (let p = 0; p < n; p++) {
    const r = rel(p);
    if (r < 1 || r > OVERRASKELSE_SETER) continue;
    const liste = perSete[p]!;
    if (liste.length === 0) continue;
    const o = (r - 1) * OVERRASKELSE_PER_SETE;
    const siste = liste[liste.length - 1]!;
    v[o + SETT] = 1;
    v[o + SISTE_LOGP] = klem(siste.logp / OVERRASKELSE_LOGTAK);
    v[o + SISTE_ENTROPI] = klem(siste.entropi / OVERRASKELSE_HTAK);
    v[o + SISTE_RANG] = klem(siste.rang);
    v[o + SISTE_FRIHET] = klem(siste.m / 13);
    v[o + SISTE_TOPP] = siste.rang === 0 && siste.m > 1 ? 1 : 0;
    v[o + SISTE_TVUNGET] = siste.m === 1 ? 1 : 0;
    let sLogp = 0;
    let sEntropi = 0;
    let sRang = 0;
    let maks = 0;
    let topp = 0;
    let fri = 0;
    for (const x of liste) {
      sLogp += klem(x.logp / OVERRASKELSE_LOGTAK);
      sEntropi += klem(x.entropi / OVERRASKELSE_HTAK);
      sRang += klem(x.rang);
      maks = Math.max(maks, klem(x.logp / OVERRASKELSE_LOGTAK));
      if (x.rang === 0 && x.m > 1) topp++;
      if (x.m >= 3) fri++;
      alleLogp += x.logp;
      alleEntropi += klem(x.entropi / OVERRASKELSE_HTAK);
      if (x.m === 1) alleTvunget++;
      alleN++;
    }
    v[o + SNITT_LOGP] = sLogp / liste.length;
    v[o + SNITT_ENTROPI] = sEntropi / liste.length;
    v[o + SNITT_RANG] = sRang / liste.length;
    v[o + MAKS_LOGP] = maks;
    v[o + ANDEL_TOPP] = topp / liste.length;
    v[o + ANDEL_FRI] = fri / liste.length;
    v[o + N_OBS] = Math.min(liste.length, OVERRASKELSE_TAK_N) / OVERRASKELSE_TAK_N;
  }
  v[FELLES + F_DEKNING] = klem(alleN / Math.max(1, vindu));
  v[FELLES + F_NOEN] = alleN > 0 ? 1 : 0;
  if (alleN > 0) {
    v[FELLES + F_SNITT_LOGP] = klem(alleLogp / alleN / OVERRASKELSE_LOGTAK);
    v[FELLES + F_SNITT_ENTROPI] = alleEntropi / alleN;
    v[FELLES + F_SUM_LOGP] = klem(alleLogp / OVERRASKELSE_SUMTAK);
    v[FELLES + F_ANDEL_TVUNGET] = alleTvunget / alleN;
  }
  return v;
}
