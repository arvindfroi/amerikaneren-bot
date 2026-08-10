/**
 * MLB fase 0.5 — SELVSPILLØKKA. Én kamp, og all erfaringen den ga.
 *
 * `docs/mlb.md` fase 0.5: «Selvspilløkke + erfaringsbuffer». Denne fila spiller
 * ÉN kamp med fire seter, samler én rad per beslutning, og fyller på etiketten
 * når den er kjent. Den trener ingenting og adopterer ingenting — den lager
 * datagrunnlaget, og bare det.
 *
 * ===================== INGEN MESTER, INGEN ORAKEL =======================
 *
 * `docs/mlb.md` §0: det eneste som læres av er (a) hva som faktisk skjedde og
 * (b) hvor kortene faktisk lå. Ingen SD-evaluering, ingen dobbeltdummy, ingen
 * «policy = søkets valg». `test/mlb-herkomst.test.ts` følger importgrafen herfra
 * og feiler hvis noen dag drar inn et orakel — også transitivt.
 *
 * ===================== TEMPERATUREN ER TO ULIKE TING =====================
 *
 * AVGJØRELSE 4: **samplet handling i trening, argmaks i måling.** De to er ikke
 * en innstilling man kan glemme å sette: et nett som spiller sin egen argmaks i
 * selvspill ser aldri noe annet enn det den alt tror, og en måling med samplet
 * handling kan ikke parres, fordi parringen i hver eneste benk i dette
 * prosjektet forutsetter determinisme.
 *
 * Derfor er `temperatur` et PÅKREVD felt per sete, ikke et valgfritt med en
 * standardverdi. En glemt temperatur skal være en typefeil, ikke en stille
 * regresjon i én av de to modusene.
 *
 * ===================== BUFFERET LAGRER KAMPER, IKKE VEKTORER =============
 *
 * `docs/mlb.md` §5a: 1 032 flyttall × ~1 400 beslutninger × 5 000 kamper er
 * titalls GB per epoke, og det ville låst trekklayouten for alltid. Lagres i
 * stedet `(frø, hvem satt hvor, hvilke koder ble valgt)`, er en kamp noen få
 * hundre bytes, og den kan spilles om igjen deterministisk — med en NY
 * trekklayout om vi vil.
 *
 * `Kamplogg` er den formen. `gjenspill()` bygger radene på nytt fra den.
 *
 * ===================== ÉN LØKKE, IKKE TO ================================
 *
 * Og gjenspillingen bruker NØYAKTIG samme løkke som spillingen: `kjørKamp` tar
 * en `Beslutter` per sete, og forskjellen mellom å spille og å gjenspille er
 * bare hvor koden kommer fra — fra nettet, eller fra loggen. To løkker som
 * skulle gjøre det samme er feilklassen §118 kaller «det målte var ikke det jeg
 * mente», og den har rammet dette prosjektet fjorten ganger.
 * `test/mlb-selvspill.test.ts` krever bit-identiske trekkvektorer fra de to.
 *
 * ===================== VERDIETIKETTEN, OG HVORFOR DEN ER TO TALL =========
 *
 * `docs/sandkassen.md` §5 skriver «verdi ← rundens faktiske poeng».
 * `docs/mlb.md` §2 REVISJON overstyrer den: episoden er KAMPEN, ellers får
 * makrotrekkene eksakt null gradient og K5 kan aldri læres.
 *
 * Begge trengs, og de er ikke i strid når man skriver dem ned presist:
 *
 *     A(s, a) = r + V(s') − V(s)
 *
 * `r` er poengene som falt MELLOM denne beslutningen og neste beslutning dette
 * setet står i — altså rundens poeng, som delbelønning. `V` er lært mot
 * KAMPENS utfall. Raden bærer derfor `poengFør` (setets akkumulerte poeng ved
 * beslutningen) og `nesteISete`, og `Kampfasit` bærer sluttpoengene. Da er `r`
 * en differanse og ikke et tredje, uavhengig tall som kan komme i utakt.
 */

import { lagRng, type Kort } from "../kort.ts";
import {
  opprettSpill,
  spillerVisning,
  utfør,
  type GameState,
  type Handling,
  type SpillerVisning,
} from "../motor.ts";
import { kortgiving, lagRegler, type GameRules, type Kortgiving } from "../regler.ts";
import { troFasit } from "./fasit.ts";
import {
  maske,
  nesteDelsteg,
  ta,
  TOMT_DELVALG,
  type Delsteg,
  type Delvalg,
  type Giving,
} from "./handling.ts";
import { Hukommelse } from "./hukommelse.ts";
import { byggTrekk, fasenavn, type Beslutning, type Trofordeler } from "./trekk.ts";
import { POLICY_UT, TRO_UT, velgKode, type Framover } from "./nett.ts";

// ===========================================================================
// 1. Kontrakten mot nettet — SMAL MED VILJE
// ===========================================================================

/**
 * FORMEN OG VALGREGELEN KOMMER FRA `nett.ts`, og er IKKE gjentatt her.
 *
 * Fila ble skrevet mens `src/mlb/nett.ts` ennå ikke fantes, mot den avtalte
 * kontrakten, med et stillas: en egen `Framover`, egne `POLICY_UT`/`TRO_UT` og
 * en egen `velgKodeStandard`. Da nettet landet, var stillaset en ANDRE
 * definisjon av de samme fire tingene — nøyaktig feilklassen §118 kaller «det
 * målte var ikke det jeg mente», og den farligste varianten: begge ville
 * kjørt.
 *
 * Derfor re-eksporteres de i stedet. En kaller som vil ha bredden på policyen
 * kan hente den her eller der; det er samme tall, fordi det er samme konstant.
 */
export { POLICY_UT, TRO_UT, velgKode, type Framover } from "./nett.ts";

/**
 * ALT selvspillet trenger av et nett.
 *
 * Med vilje smalere enn `Sandkassenett`: så lenge grensesnittet er dette, kan
 * løkka prøves med en tilfeldig stubbe, og en trent modell kan byttes inn uten
 * at noe her endres. `Sandkassenett` oppfyller den strukturelt.
 */
export interface NettLik {
  framover(trekk: Float32Array): Framover;
}

/**
 * Hvordan en kode plukkes ut av logitene.
 *
 * Typen finnes fordi kalleren skal KUNNE bytte den ut — en måling som vil
 * prøve en annen valgregel skal ikke måtte endre løkka. Standarden er
 * `velgKode` fra `nett.ts`, og det finnes ingen annen implementasjon.
 */
export type Velger = (
  logits: Float32Array,
  maske: Uint8Array,
  temperatur: number,
  rng: () => number,
) => number;

/**
 * STUBBEN: et nett med tilfeldig policy, verdi og tro.
 *
 * Fase 1 i `docs/mlb.md` er «et TILFELDIG nett spiller lovlig i 1000 kamper
 * uten å krasje». Det kan prøves NÅ, uten at `nett.ts` finnes, og det er
 * nettopp derfor stubben er her og ikke i en test: den samme koden brukes til
 * fornuftssjekken og til fartsmålingen.
 *
 * Verdien er trukket i `[-1, 1]`, som er skalaen et tanh-hode ville gitt.
 */
export function tilfeldigNett(rng: () => number): NettLik {
  return {
    framover(): Framover {
      const policy = new Float32Array(POLICY_UT);
      for (let i = 0; i < POLICY_UT; i++) policy[i] = (rng() - 0.5) * 4;
      const tro = new Float32Array(TRO_UT);
      for (let i = 0; i < TRO_UT; i++) tro[i] = rng();
      return { policy, verdi: rng() * 2 - 1, tro };
    },
  };
}

// ===========================================================================
// 2. Erfaringen
// ===========================================================================

/**
 * ÉN BESLUTNING, med alt som trengs for å lage en gradient av den.
 *
 * `trekk` og `maske` er `null` når raden er samlet uten `samleTrekk` — se
 * `Kamplogg` og §5a. Etikettene fylles av `spillKamp` når de er kjent:
 * `troFasit` ved beslutningen (fasit om nåtiden, kjent ved rundeslutt), og
 * kampens utfall via `Kampfasit` når kampen er over.
 */
export interface Beslutningsrad {
  readonly sete: number;
  readonly rundeNr: number;
  readonly stikkSpilt: number;
  readonly beslutning: Beslutning;
  readonly delsteg: Delsteg;
  /** Trekkvektoren, 1 032 tall. `null` når rader samles uten trekk. */
  readonly trekk: Float32Array | null;
  /** Masken, 68 plasser. `null` når rader samles uten trekk. */
  readonly maske: Uint8Array | null;
  /** Koden som ble valgt. Alltid lovlig — `ta()` kaster ellers. */
  readonly kode: number;
  /** Antall lovlige plasser. En rad med 1 lovlig bærer ingen policygradient. */
  readonly lovlige: number;
  /** Nettets verdianslag i stillingen, eller `null` uten nett. */
  readonly verdi: number | null;
  /**
   * ETIKETTEN TIL TROHODET: hvor lå hvert usett kort, sett fra dette setet, i
   * NØYAKTIG denne stillingen. 0 = sett (maskert bort), 1–3 = relativt sete,
   * 4 = talongen. Se `fasit.ts`.
   */
  readonly troFasit: Int8Array;
  /** Setets akkumulerte kamppoeng FØR denne beslutningen. */
  readonly poengFør: number;
  /** Indeks til neste rad for SAMME sete, eller −1 om dette var den siste. */
  nesteISete: number;
}

/** Kampens utfall — verdihodets etikett, og fasiten for alle radene. */
export interface Kampfasit {
  readonly vinner: number;
  readonly sluttpoeng: readonly number[];
  readonly runder: number;
  readonly målPoeng: number;
  /**
   * BLE KAMPEN AVBRUTT PÅ RUNDETAKET?
   *
   * ================= DET FØRSTE SOM VAR GALT, OG DET ER IKKE LITE ========
   *
   * Et løp til 30 ANTAR at noen kommer til 30. Med en TILFELDIG policy gjør de
   * ikke det: `amerikaner` og `solo` ligger i masken, en tilfeldig policy tar
   * dem i omtrent to av elleve budvalg, og de koster `målPoeng/2` og `målPoeng`
   * når de ryker — som de nesten alltid gjør. Alle fire seter synker da
   * monotont, og maksimum synker med dem.
   *
   * Målt: frø 4 161 736 kom til runde 365 med stillingen −1455 / −2364 /
   * −2044 / −1693 og var fortsatt ikke ferdig. Kampen er ikke treg — den er
   * UBUNDET.
   *
   * `docs/mlb.md` fase 1 sier «et TILFELDIG nett spiller lovlig i 1000 kamper
   * uten å krasje». Det gjorde det. Kampen tok bare aldri slutt, og det er en
   * annen feil enn den prøven lette etter.
   *
   * Taket er derfor en del av spillets DEFINISJON i selvspill, ikke en
   * nødbrems: en avbrutt kamp vinnes av lederen, og `avbrutt` står i fasiten
   * slik at andelen kan MÅLES per epoke. Den andelen er dessuten et gratis
   * helsetall: en policy som blir bedre, avbrytes sjeldnere.
   */
  readonly avbrutt: boolean;
}

/**
 * KAMPEN I KOMPAKT FORM — det som faktisk skrives til disk.
 *
 * `frø` + `regler` gir givene, `koder` gir handlingene, og `gjenspill()` bygger
 * radene på nytt. `seter` er hvem som satt hvor, som en streng per sete, slik
 * at en analyse i ettertid kan skille «MLB-epoke 7» fra «vanen `grisk`» uten å
 * måtte gjette ut fra spillet.
 */
export interface Kamplogg {
  readonly frø: number;
  readonly målPoeng: number;
  readonly antallSpillere: number;
  readonly seter: readonly string[];
  readonly koder: readonly number[];
  readonly fasit: Kampfasit;
  /**
   * HVILKE SETER BLE SAMLET — altså hvilke seter kandidaten satt i.
   *
   * Uten dette feltet må en gjenspilling GJETTE hvem som var kandidaten, og
   * navnet duger ikke: `liga.bord` trekker «beste» som motstander i 40 % av
   * setene, så to seter kan hete «epoke7» uten at begge er kandidaten. Å regne
   * `kampnr % 4` ut av frøet i ettertid ville dessuten bundet eksportøren til
   * kjøringsskriptets frøformel — nøyaktig den slags stille kobling som §122
   * kaller «det målte var ikke det jeg mente».
   *
   * Feltet er UTLEDET av seteoppsettet, ikke sendt inn, og valgfritt fordi
   * logger skrevet før §123 ikke har det. Leseren skal si fra, ikke gjette.
   */
  readonly samleSeter?: readonly number[];
}

export interface Erfaring {
  readonly rader: Beslutningsrad[];
  readonly fasit: Kampfasit;
  readonly logg: Kamplogg;
}

/**
 * TD-fordelen for én rad, gitt et verdianslag.
 *
 *     A = r + V(s') − V(s)
 *
 * `r` er poengene som falt mellom denne beslutningen og neste beslutning
 * SAMME sete står i — en differanse av `poengFør`, ikke et eget tall. Ved
 * siste rad er `V(s')` null og `r` er poengene fram til kampslutt.
 *
 * AVGJØRELSE 3: uten dette får det ene gode kortet og de elleve likegyldige
 * nøyaktig samme forsterkning, og nettet lærer korrelasjon i stedet for årsak.
 * Skalering er treningens sak; her er formen, én gang, riktig.
 */
export function tdFordel(
  rader: readonly Beslutningsrad[],
  i: number,
  fasit: Kampfasit,
  verdi: (rad: Beslutningsrad) => number,
): number {
  const rad = rader[i]!;
  const j = rad.nesteISete;
  const neste = j >= 0 ? rader[j]! : null;
  const poengEtter = neste !== null ? neste.poengFør : (fasit.sluttpoeng[rad.sete] ?? rad.poengFør);
  const r = poengEtter - rad.poengFør;
  const vNeste = neste !== null ? verdi(neste) : 0;
  return r + vNeste - verdi(rad);
}

/**
 * FORDELEN MED EN HORISONT — GAE(λ), og hvorfor den måtte inn.
 *
 * ===================== DET SOM VAR GALT MED TD ALENE ====================
 *
 * `tdFordel` over er λ = 0: `A = r + V(s') − V(s)`. AVGJØRELSE 3 valgte den
 * med rette, fordi den plasserer krediten på handlingen som flyttet noe. Men
 * den HVILER PÅ AT `V` VIRKER, og i epoke 1 gjør den ikke det.
 *
 * Målt i den første røykprøven med ekte gradienter:
 *
 *   - `r` er NULL for nesten hver beslutning. Poeng faller bare ved
 *     rundeslutt, og et sete tar ~15 beslutninger per runde (bud, vrak, velg,
 *     og kortene). For alle unntatt den siste er `A = V(s') − V(s)`.
 *   - verdihodet forklarte **−0,97 av variansen** etter én epoke, altså verre
 *     enn å spå snittet.
 *
 * Policygradienten ble da drevet av ren støy fra et utrent hode — og den drev
 * i FEIL retning: andelen `amerikaner`/`solo` steg fra 46,6 % til 58,0 % av
 * budvalgene på én epoke, og 82 % av kampene nådde rundetaket. Nettet lærte å
 * skyte seg selv i foten, fordi straffen lå femten steg unna i et ledd som
 * ikke fantes ennå.
 *
 * ===================== LØSNINGEN ER EN PARAMETER, IKKE ET VALG ==========
 *
 *     δ_t = r_t + V(s_{t+1}) − V(s_t)
 *     A_t = δ_t + λ · A_{t+1}
 *
 * λ = 0 gir NØYAKTIG `tdFordel`. λ = 1 gir NØYAKTIG `G_t − V(s_t)`, der
 * `G_t` er det setet faktisk fikk resten av kampen — «faktisk minus ventet»,
 * `docs/sandkassen.md` §6 ordrett, uten et eneste bootstrap-ledd.
 *
 * Begge endepunktene er ren selvtrening: `G` er utfallet, ikke en dom. λ er
 * derfor ikke et kompromiss mellom to filosofier, det er hvor mye vi tør å
 * stole på verdihodet — og det er et tall vi kan MÅLE oss fram til i stedet
 * for å velge én gang for alle.
 *
 * `test/mlb-epoke.test.ts` krever at de to endepunktene stemmer eksakt.
 *
 * ===================== OG SÅ MÅLTE §124 HVA λ = 1 KOSTET ===============
 *
 * λ = 1 gjør fordelen til `A_t = G_t − V(s_t)`, og `G_t = sluttpoeng[sete] −
 * poengFør` er **bit-identisk for hver eneste beslutning i samme runde** —
 * `poengFør` endrer seg jo bare ved rundeslutt. Forskjellen i fordel mellom to
 * kortvalg i samme runde er derfor NØYAKTIG `V(s_2) − V(s_1)` og ingenting
 * annet.
 *
 * Målt på epoke 10s egne 371 652 rader (`analyse/mlb-fordel-diagnose.txt`):
 *
 *   99,68 % av Var(A) ligger MELLOM runder, 0,32 % innenfor
 *   96,5 % av rundene gir IDENTISK fortegn på fordelen til alle sine valg
 *   sd(rundens poeng) = 9,9  mot  sd(resten av kampen) = 61,5
 *
 * Altså: λ = 1 tok kredittilordningen ut igjen. `docs/mlb.md` §2 kalte det
 * «kredittproblemet, som utkastet gikk rett forbi» og løste det med TD; §123
 * satte λ = 1 for å redde budrunden fra et verdihode som forklarte −0,97, og
 * fikk problemet tilbake uten at noe feilet.
 *
 * ===================== γ: DEMP HALEN, IKKE KUTT DEN ====================
 *
 *     δ_t = r_t + γ_t · V(s_{t+1}) − V(s_t)
 *     A_t = δ_t + γ_t · λ · A_{t+1}
 *
 * `γ_t` er `gamma` NÅR OG BARE NÅR steget krysser et rundeskille, ellers 1.
 * Poeng faller bare ved rundeslutt, så runden er den naturlige enheten — en
 * diskontering per BESLUTNING ville straffet et sent kortvalg i runden mot et
 * tidlig, og det er ikke en forskjell vi mener noe om.
 *
 * Hvorfor ikke bare et bedre verdihode? Fordi taket er målt: en regularisert
 * ridge på de SAMME 1 032 trekkene forklarer **+0,19** av resten av kampen på
 * holdout. Fire femtedeler av halen er altså ikke grunnlinjebar bort — den er
 * uforutsigbar, og den eneste veien ut er å veie den ned.
 *
 * Hvorfor ikke gjøre RUNDEN til episoden? Fordi da får makrotrekkene eksakt
 * null gradient, og K5 kunne aldri blitt lært — `docs/mlb.md` §2, og den
 * revisjonen var alvorlig. Med γ = 0,5 veier neste runde 0,5, den etter 0,25:
 * makro beholder gradient, den er bare ikke lenger 6× større enn signalet.
 *
 * Målt på de samme radene, for verdimålet `G^γ`:
 *
 *   | γ | sd(halen) | signal/støy | ridge R² på målet |
 *   |---|---|---|---|
 *   | 1,0 | 61,5 | 0,16 | +0,19 |
 *   | 0,7 |  9,5 | 1,04 | +0,36 |
 *   | 0,5 |  5,6 | 1,76 | +0,48 |
 *   | 0,3 |  3,1 | 3,24 | +0,56 |
 *
 * `gamma = 1` er identiteten, og hele §123s tallgrunnlag er reproduserbart.
 */
export function gaeFordel(
  rader: readonly Beslutningsrad[],
  fasit: Kampfasit,
  verdi: (rad: Beslutningsrad) => number,
  lambda: number,
  gamma = 1,
): Float64Array {
  const ut = new Float64Array(rader.length);
  // BAKLENGS, fordi `A_t` avhenger av `A_{t+1}`. Rekkefølgen i `rader` er
  // kronologisk per sete, og `nesteISete` peker framover — så en baklengs
  // gjennomgang over indeksen treffer alltid en ferdig utregnet etterfølger.
  for (let i = rader.length - 1; i >= 0; i--) {
    const rad = rader[i]!;
    const j = rad.nesteISete;
    const neste = j >= 0 ? rader[j]! : null;
    const poengEtter =
      neste !== null ? neste.poengFør : (fasit.sluttpoeng[rad.sete] ?? rad.poengFør);
    const r = poengEtter - rad.poengFør;
    const γ = γSteg(rad, neste, gamma);
    const vNeste = neste !== null ? verdi(neste) : 0;
    const δ = r + γ * vNeste - verdi(rad);
    ut[i] = δ + γ * lambda * (j >= 0 ? (ut[j] ?? 0) : 0);
  }
  return ut;
}

/**
 * Diskonteringen for ETT steg: `gamma` bare når steget krysser et rundeskille.
 *
 * Skillet leses av `rundeNr`, ikke av «falt det poeng her» — en runde kan gi
 * null poeng, og da hadde en `r !== 0`-test stille latt halen gå udiskontert
 * gjennom nettopp de rundene som var jevnest.
 */
const γSteg = (
  rad: Beslutningsrad,
  neste: Beslutningsrad | null,
  gamma: number,
): number => (neste !== null && neste.rundeNr > rad.rundeNr ? gamma : 1);

/**
 * VERDIMÅLET, med samme diskontering som fordelen.
 *
 *     G_t = r_t + γ_t · G_{t+1}
 *
 * Den MÅ regnes her og ikke i kalleren: er de to uenige om γ, er `A = G − V`
 * ikke lenger et TD-residual til noe konsistent mål, og fordelen får en
 * systematisk skjevhet uten at noe feiler. Det er nøyaktig feilen §123 punkt 1
 * beskriver, bare med γ i stedet for `r`.
 *
 * Med `gamma = 1` gir den EKSAKT `sluttpoeng[sete] − poengFør`, som er det
 * `examples/mlb-erfaring.ts` regnet i hånden før §124. Testen krever det.
 */
export function diskontertRetur(
  rader: readonly Beslutningsrad[],
  fasit: Kampfasit,
  gamma: number,
): Float64Array {
  const ut = new Float64Array(rader.length);
  for (let i = rader.length - 1; i >= 0; i--) {
    const rad = rader[i]!;
    const j = rad.nesteISete;
    const neste = j >= 0 ? rader[j]! : null;
    const poengEtter =
      neste !== null ? neste.poengFør : (fasit.sluttpoeng[rad.sete] ?? rad.poengFør);
    const r = poengEtter - rad.poengFør;
    ut[i] = r + γSteg(rad, neste, gamma) * (j >= 0 ? (ut[j] ?? 0) : 0);
  }
  return ut;
}

/**
 * VERDIMÅLET DELT I TO, MED HVER SIN ETIKETT — §125, og hvorfor det ikke er
 * det samme som å bytte mål.
 *
 * ===================== DET TAKET SOM ER MÅLT ===========================
 *
 * §124 målte hvor mye av hvert mål som i det hele tatt LAR seg forutsi fra de
 * 1 032 trekkene. Regularisert ridge, holdout splittet på KAMP:
 *
 *   | mål                                | ridge R² |
 *   |------------------------------------|----------|
 *   | resten av kampen (`G`)             |  +0,19   |
 *   | **det som gjenstår av DENNE runden**| **+0,60**|
 *   | resten av kampen ETTER runden      |  +0,17   |
 *
 * Rundens poeng er TRE GANGER så forutsigbart. Det er ikke hodet som er for
 * svakt — det er målet som er for langt.
 *
 * ===================== MEN SUMMEN ER DET ENESTE SOM VEILEDES ===========
 *
 * §124 prøvde også det opplagte og forkastet det: ett hode med to utganger,
 * trent mot `G`. Da er delingen UIDENTIFISERBAR — nettet kan legge alt i den
 * ene. Skal den bety noe, må hver del ha SITT EGET mål, og begge finnes i
 * dataene:
 *
 *     G^γ_t  =  Gr_t  +  Gh_t
 *
 *   `Gr`  det som gjenstår av DENNE runden for setet
 *   `Gh`  den ALLEREDE DISKONTERTE halen — alt fra neste runde og ut
 *
 * Identiteten er eksakt, ikke omtrentlig, og `test/mlb-epoke.test.ts` krever
 * det: `Gr[i] + Gh[i] === diskontertRetur[i]` for hver rad, for enhver γ.
 *
 * ===================== HVORFOR γ MÅTTE KOMME FØRST =====================
 *
 * Med γ = 1 er splitten verdiløs, og også det er målt: variansveid blir et
 * todelt hode `(0,60·114 + 0,17·3779)/3893 ≈ 0,18` — praktisk talt nøyaktig det
 * ene felles hodet allerede får. **Splitten flytter ingen varians så lenge
 * halen veier 97 % av målet.** γ = 0,5 flyttet rundens andel av Var(målet) fra
 * 2,9 % til 79 %, og først da betaler det seg å gi runden sitt eget hode.
 *
 * Rekkefølgen er derfor γ → separat rundemål → λ ned, og dette er steg to.
 *
 * ===================== HALEN BÆRER γ-EN SELV ===========================
 *
 * `Gh` er den diskonterte halen, ikke den rå. Nettet spår altså `Gh` direkte,
 * og `V = V_runde + V_hale` uten en γ noe sted i framoverpasseringen. Alternativet
 * — å la hodet spå den RÅ halen og gange med γ i TS — ville lagt γ inn i
 * `nett.ts`, og da hadde to filer hatt hver sin mening om samme tall. Det er
 * §123 punkt 1 med en ny hovedrolle.
 */
export function delteRetur(
  rader: readonly Beslutningsrad[],
  fasit: Kampfasit,
  gamma: number,
): { readonly runde: Float64Array; readonly hale: Float64Array } {
  const runde = new Float64Array(rader.length);
  const hale = new Float64Array(rader.length);
  for (let i = rader.length - 1; i >= 0; i--) {
    const rad = rader[i]!;
    const j = rad.nesteISete;
    const neste = j >= 0 ? rader[j]! : null;
    const poengEtter =
      neste !== null ? neste.poengFør : (fasit.sluttpoeng[rad.sete] ?? rad.poengFør);
    const r = poengEtter - rad.poengFør;
    if (neste === null) {
      // Siste beslutning i setet: alt som er igjen faller i DENNE runden —
      // kampen tar slutt ved et rundeskille, så det finnes ingen hale.
      runde[i] = r;
      hale[i] = 0;
    } else if (neste.rundeNr > rad.rundeNr) {
      // Steget krysser rundeskillet: `r` er rundens siste poeng, og ALT etter
      // det er hale. Diskonteringen legges på her, én gang, samme sted som i
      // `γSteg` — halen bæres ferdig diskontert.
      runde[i] = r;
      hale[i] = gamma * ((runde[j] ?? 0) + (hale[j] ?? 0));
    } else {
      // Samme runde: `r` er 0 (poeng faller bare ved rundeslutt), og både
      // rundedelen og halen arves uendret fra neste beslutning.
      runde[i] = r + (runde[j] ?? 0);
      hale[i] = hale[j] ?? 0;
    }
  }
  return { runde, hale };
}

// ===========================================================================
// 3. Løkka
// ===========================================================================

/** Alt en beslutter får se. Ingen `GameState` — K2 gjelder også her. */
export interface Beslutningspunkt {
  readonly visning: SpillerVisning;
  readonly sete: number;
  readonly delsteg: Delsteg;
  readonly delvalg: Delvalg;
  readonly maske: Uint8Array;
  /** Trekkvektoren, eller `null` når løkka kjører uten å bygge trekk. */
  readonly trekk: Float32Array | null;
  readonly framover: Framover | null;
}

export type Beslutter = (punkt: Beslutningspunkt) => number;

/** Ett sete i kampen. */
export interface Sete {
  /** Navnet som havner i `Kamplogg.seter`. */
  readonly navn: string;
  /**
   * Nettet, eller `null` for et sete som ikke bruker nettet i det hele tatt
   * (en stilisert vane). Uten nett bygges heller ikke trekkvektoren for setet,
   * og det er nesten hele fartsgevinsten ved å ha vaner i ligaen.
   */
  readonly nett: NettLik | null;
  /**
   * PÅKREVD. > 0 i trening (samplet), 0 i måling (argmaks). Se AVGJØRELSE 4 og
   * merknaden om at et glemt felt skal være en typefeil.
   */
  readonly temperatur: number;
  /** Brukes bare når `nett === null`. Får se visningen, aldri staten. */
  readonly egen?: Beslutter;
  /** Skal radene fra dette setet samles? Vaner gir sjelden nyttig gradient. */
  readonly samle?: boolean;
}

export interface Kampopsjoner {
  readonly frø: number;
  readonly seter: readonly Sete[];
  readonly målPoeng?: number;
  /**
   * ===================== `tronett` ER KOBLET PÅ (§126) ===================
   *
   * Feltet matet `tro.p.*`-blokken, og det ble aldri satt: `spillKamp` sendte
   * `opts.tronett ?? null`, og verken `examples/mlb-erfaring.ts` eller
   * epokedriveren fylte det. Blokken var derfor eksakt null i hver rad i hver
   * epoke — 209 innganger som per konstruksjon ikke KUNNE få gradient.
   *
   * Det ble først lest som at de er verdiløse. Det var feil lesning: en
   * inngang som aldri har vært påkoblet kan ikke ha lært noe, og å måle den
   * på tilfeldig initierte vekter måler støy og ikke evne. Sandkassens premiss
   * er at alle sensorene står på og at nettet finner ut av resten.
   *
   * Den er derfor PÅ fra epoke 0 — og den må være på de samme tre stedene:
   * spillingen, gjenspillingen som lager gradienten, og `spekagent.ts` som
   * måles. Er de uenige, er det målte ikke det som ble trent.
   */
  readonly tronett?: Trofordeler | null;
  /** Injiseres av kalleren; standard er stillaset i denne fila. */
  readonly velger?: Velger;
  /** Skal trekkvektorene bæres ut? Av: bare `Kamplogg`, som er §5a-formen. */
  readonly samleTrekk?: boolean;
  /** Hukommelsen på? Standard ja. Av gir en nullblokk, og er raskere. */
  readonly hukommelse?: boolean;
  /** Vakt mot en kamp som aldri tar slutt. */
  readonly maksSteg?: number;
  /**
   * RUNDETAKET. Se `Kampfasit.avbrutt` — dette er ikke en nødbrems, det er
   * grensen som gjør at et løp til 30 er en veldefinert episode også når
   * policyen er tilfeldig. Standard 100 er ~3× det lengste ferdigspilte løpet
   * vi har målt (31 runder), så et ekte langt løp avbrytes ikke.
   */
  readonly maksRunder?: number;
}

export const MAKS_RUNDER = 100;

const setetSomBestemmer = (s: GameState): number | null => {
  if (s.fase === "VRAK" || s.fase === "VELG") return s.budvinner;
  return s.iTur;
};

/**
 * MOTOREN I ØKTA — brukt både av `spillKamp` og av `gjenspill`.
 *
 * Løkka er identisk; det eneste som skiller er hvor koden kommer fra. Se
 * merknaden «ÉN LØKKE, IKKE TO» øverst.
 */
function kjørKamp(
  opts: Kampopsjoner,
  besluttere: readonly Beslutter[],
  påRad: ((rad: Beslutningsrad) => void) | null,
): { fasit: Kampfasit; koder: number[] } {
  const regler: GameRules = lagRegler({
    antallSpillere: opts.seter.length,
    målPoeng: opts.målPoeng ?? 30,
  });
  const giving: Kortgiving = kortgiving(regler);
  const givingKort: Giving = { antallStikk: giving.antallStikk, talong: giving.talong };
  const brukHukommelse = opts.hukommelse !== false;
  const samleTrekk = opts.samleTrekk === true;
  const koder: number[] = [];

  /**
   * ÉN HUKOMMELSE FOR HELE BORDET — og det er MÅLT, ikke antatt.
   *
   * Første utgave ga hvert sete sin egen bok, med den begrunnelsen at en delt
   * bok ville vært «sete 0 som leser sete 1s observasjoner av sete 2». Den
   * begrunnelsen er feil, og forskjellen er verdt å skrive ned:
   *
   * `Hukommelse.bok(sete)` er statistikk OM `sete`, utledet av `RUNDE_SLUTT` —
   * altså av det ALLE fire så da runden var over. Innholdet avhenger ikke av
   * hvem som observerer. `vektor(egetSete)` plukker bare ut de tre andres
   * bøker i rotert rekkefølge. Fire bøker inneholder derfor de samme tallene,
   * bit for bit, og `test/mlb-selvspill.test.ts` krever nettopp det: 2 192
   * sammenlikninger, 0 avvik.
   *
   * Og det er ikke en detalj i regnskapet. `bokfør` spiller HELE runden om
   * igjen for å regne residualer; fire bøker gjorde det fire ganger, og den
   * duplikasjonen var ~0,10 ms av 0,15 ms per beslutning — den største enkelte
   * posten i hele selvspillet, større enn trekkbyggeren.
   *
   * K2 er urørt: blokken ser bare FERDIGSPILTE runder, og det er prøvd for seg
   * på selve trekkvektoren i `test/mlb-k2-trekk.test.ts`.
   *
   * OG DEN DØR MED KAMPEN. Ingen bok skrives, ingen bok leses fra disk. Det er
   * samme regel som `okt.ts` lever under, og den er håndhevet av test der.
   */
  const tronett = opts.tronett ?? null;
  const bok = new Hukommelse();

  let s: GameState = opprettSpill(regler, opts.frø);
  let vakt = 0;
  let avbrutt = false;
  const maksSteg = opts.maksSteg ?? 200_000;
  const maksRunder = opts.maksRunder ?? MAKS_RUNDER;

  while (s.fase !== "FERDIG" && vakt++ < maksSteg) {
    if (s.rundeNr >= maksRunder) {
      avbrutt = true;
      break;
    }
    bok.observer(s);
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const sete = setetSomBestemmer(s);
    if (sete === null || sete === undefined) break;
    const oppsett = opts.seter[sete]!;
    const beslutter = besluttere[sete]!;

    /**
     * DELVALGSLØKKA. VRAK er `talong` påfølgende kortvalg og VELG er trumf
     * etterfulgt av etterlysning; hver av dem er en EGEN beslutning med sin
     * egen maske og sin egen trekkvektor. Å slå dem sammen til én ville
     * betydd at bare det siste valget bar en gradient.
     */
    let delvalg: Delvalg = TOMT_DELVALG;
    let handling: Handling | null = null;
    let indre = 0;
    while (handling === null && indre++ < 64) {
      const visning = spillerVisning(s, sete);
      const delsteg = nesteDelsteg(visning, delvalg);
      if (delsteg === null) throw new Error(`Ingen delsteg i ${s.fase} for sete ${sete}`);
      const m = maske(visning, givingKort, delvalg);

      let lovlige = 0;
      for (let i = 0; i < m.length; i++) if (m[i] === 1) lovlige++;
      if (lovlige === 0) throw new Error(`Tom maske i ${s.fase}/${delsteg} for sete ${sete}`);

      const trengerTrekk = oppsett.nett !== null || (samleTrekk && oppsett.samle !== false);
      const trekk = trengerTrekk
        ? byggTrekk(visning, {
            regler,
            giving,
            delvalg,
            hukommelse: brukHukommelse ? bok.vektor(sete, regler.antallSpillere) : null,
            tronett,
          })
        : null;
      const framover = oppsett.nett !== null && trekk !== null ? oppsett.nett.framover(trekk) : null;

      const kode = beslutter({ visning, sete, delsteg, delvalg, maske: m, trekk, framover });
      koder.push(kode);

      if (påRad !== null && oppsett.samle !== false) {
        påRad({
          sete,
          rundeNr: s.rundeNr,
          stikkSpilt: s.stikkSpilt,
          beslutning: fasenavn(visning) ?? "SPILL",
          delsteg,
          trekk: samleTrekk ? trekk : null,
          maske: samleTrekk ? m : null,
          kode,
          lovlige,
          verdi: framover?.verdi ?? null,
          /**
           * ETIKETTEN KREVER `state` — og det er nettopp derfor den ligger her
           * og ikke i byggeren. `troFasit` ser skjult informasjon med vilje
           * (`fasit.ts`), men den skrives til ETIKETTEN, aldri til `trekk`.
           */
          troFasit: troFasit(s, sete),
          poengFør: s.totalPoeng[sete] ?? 0,
          nesteISete: -1,
        });
      }

      const steg = ta(visning, givingKort, delvalg, kode);
      if (steg.ferdig) {
        const h = steg.handling;
        handling =
          h.type === "BUD"
            ? { type: "BUD", spiller: sete, bud: h.bud }
            : h.type === "VRAK"
              ? { type: "VRAK", spiller: sete, kort: h.kort as readonly Kort[] }
              : h.type === "VELG"
                ? { type: "VELG", spiller: sete, trumf: h.trumf, etterlyst: h.etterlyst }
                : { type: "SPILL", spiller: sete, kort: h.kort };
      } else {
        delvalg = steg.delvalg;
      }
    }
    if (handling === null) throw new Error("Delvalgsløkka ble aldri ferdig");
    s = utfør(s, handling).state;
  }

  if (!avbrutt && (s.fase !== "FERDIG" || s.vinner === null)) {
    throw new Error(`Kampen ble ikke ferdig (fase ${s.fase}, ${vakt} steg)`);
  }
  /**
   * LEDEREN VINNER EN AVBRUTT KAMP, og uavgjort brytes på LAVESTE sete.
   * Tilfeldig bryting ville gjort selv en ferdigspilt kamp uparrbar, og
   * parringen er forutsetningen for hver eneste benk i dette prosjektet.
   */
  let vinner = s.vinner ?? 0;
  if (avbrutt) {
    let beste = -Infinity;
    for (let i = 0; i < s.totalPoeng.length; i++) {
      const p = s.totalPoeng[i] ?? 0;
      if (p > beste) {
        beste = p;
        vinner = i;
      }
    }
  }
  return {
    fasit: {
      vinner,
      sluttpoeng: [...s.totalPoeng],
      runder: s.rundeNr,
      målPoeng: regler.målPoeng,
      avbrutt,
    },
    koder,
  };
}

/** Knytter hver rad til neste rad for samme sete. Se `tdFordel`. */
function lenkSeter(rader: Beslutningsrad[]): void {
  const sist = new Map<number, number>();
  for (let i = 0; i < rader.length; i++) {
    const s = rader[i]!.sete;
    const forrige = sist.get(s);
    if (forrige !== undefined) rader[forrige]!.nesteISete = i;
    sist.set(s, i);
  }
}

/**
 * SPILL ÉN KAMP, og samle erfaringen.
 *
 * Kaster hvis en kamp ikke blir ferdig eller en maske er tom — en stille
 * retting ville skjult en feil i nettet i stedet for å avsløre den, og fase 1
 * i `docs/mlb.md` er nettopp «spiller et tilfeldig nett lovlig?».
 */
export function spillKamp(opts: Kampopsjoner): Erfaring {
  const velger = opts.velger ?? velgKode;
  const rng = lagRng(opts.frø ^ 0x5f3a_9e11);
  const besluttere: Beslutter[] = opts.seter.map((sete) => {
    if (sete.nett === null) {
      const egen = sete.egen;
      if (egen === undefined) {
        throw new Error(`Sete «${sete.navn}» har verken nett eller egen beslutter`);
      }
      return egen;
    }
    return (punkt) => {
      if (punkt.framover === null) throw new Error("Nettet ga ikke noe framoverpass");
      return velger(punkt.framover.policy, punkt.maske, sete.temperatur, rng);
    };
  });

  const rader: Beslutningsrad[] = [];
  const { fasit, koder } = kjørKamp(opts, besluttere, (rad) => rader.push(rad));
  lenkSeter(rader);
  return {
    rader,
    fasit,
    logg: {
      frø: opts.frø,
      målPoeng: fasit.målPoeng,
      antallSpillere: opts.seter.length,
      seter: opts.seter.map((x) => x.navn),
      koder,
      fasit,
      samleSeter: opts.seter.flatMap((x, i) => (x.samle !== false ? [i] : [])),
    },
  };
}

/**
 * GJENSPILL en kamp fra loggen, og bygg radene på nytt.
 *
 * Det er dette som gjør at trekklayouten ikke er låst (§5a): endres den, kjøres
 * denne funksjonen på nytt over de samme kamploggene og bufferet er ferskt.
 *
 * `krev` er ikke pynt. Leser vi en logg som ble laget under andre regler eller
 * med et annet handlingsrom, vil `ta()` kaste på første ulovlige kode — men den
 * kunne også vært lovlig ved et uhell, og da hadde vi gjenspilt en ANNEN kamp
 * uten at noe feilet. Derfor sammenliknes fasiten til slutt.
 */
export function gjenspill(
  logg: Kamplogg,
  opts: Omit<Kampopsjoner, "frø" | "seter" | "målPoeng"> & {
    readonly seter?: readonly Sete[];
  } = {},
): Erfaring {
  let i = 0;
  const lesFraLogg: Beslutter = (punkt) => {
    const kode = logg.koder[i++];
    if (kode === undefined) throw new Error("Kamploggen er kortere enn kampen");
    if (punkt.maske[kode] !== 1) {
      throw new Error(
        `Gjenspilling: kode ${kode} er ulovlig i ${punkt.delsteg} — loggen hører til en ` +
          `annen regel- eller handlingsromversjon`,
      );
    }
    return kode;
  };
  const seter: Sete[] = logg.seter.map((navn) => ({
    navn,
    nett: null,
    temperatur: 0,
    egen: lesFraLogg,
    samle: true,
  }));

  const rader: Beslutningsrad[] = [];
  const { fasit, koder } = kjørKamp(
    {
      ...opts,
      frø: logg.frø,
      målPoeng: logg.målPoeng,
      seter: opts.seter ?? seter,
      samleTrekk: opts.samleTrekk ?? true,
    },
    seter.map(() => lesFraLogg),
    (rad) => rader.push(rad),
  );
  lenkSeter(rader);

  if (koder.length !== logg.koder.length || fasit.vinner !== logg.fasit.vinner) {
    throw new Error(
      `Gjenspillingen ga en annen kamp: ${koder.length} koder mot ${logg.koder.length}, ` +
        `vinner ${fasit.vinner} mot ${logg.fasit.vinner}`,
    );
  }
  return { rader, fasit, logg };
}

// ===========================================================================
// 4. Serialisering — én rad per kamp, og den er MENNESKELESELIG
// ===========================================================================

/**
 * Kamploggen som én JSON-linje.
 *
 * Én linje per kamp, skrevet LØPENDE. `docs/plan.md` har en hard regel om at
 * flertimers målinger aldri skal ligge i et stdout-rør, og den regelen er kjøpt
 * med tapte kjøringer. Formatet er derfor det billigste som kan appendes: én
 * linje, ferdig, uten at noe må lukkes til slutt.
 */
export const kamploggTilLinje = (logg: Kamplogg): string => JSON.stringify(logg) + "\n";

export function kamploggFraLinje(linje: string): Kamplogg {
  const o = JSON.parse(linje) as Kamplogg;
  if (!Array.isArray(o.koder) || !Array.isArray(o.seter)) {
    throw new Error("Ikke en kamplogg");
  }
  return o;
}

/** Hvor mange beslutninger bar en gradient? Rader med 1 lovlig gjør det ikke. */
export const antallMedValg = (rader: readonly Beslutningsrad[]): number =>
  rader.reduce((a, r) => a + (r.lovlige > 1 ? 1 : 0), 0);
