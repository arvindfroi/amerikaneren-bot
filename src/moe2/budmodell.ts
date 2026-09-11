/**
 * BUDMODELLEN, uten filsystem – delen som også kjører i nettleseren.
 *
 * `budagent.ts` importerte `node:fs` på toppnivå, og et slikt modul kan ikke
 * bunles til nettsiden: esbuild med nettleserplattform stopper på `node:fs`.
 * Derfor ligger alt som er rent regnestykke her, og `budagent.ts` er en tynn
 * innpakning som legger `lesBudmodell` (fil) oppå. Alle eksisterende importer
 * fra `budagent.ts` virker uendret.
 *
 * Se `budagent.ts` for hvorfor beslutningen er en UTREGNING og ikke en
 * klassifisering, og for forbeholdet om at budrunde-sannsynligheten er
 * estimert som en populasjonsstørrelse.
 */

import { lovligeHandlinger, type GameState, type Handling } from "../motor.ts";
import { AMERIKANER, PASS, type Bud } from "../regler.ts";
import { budTrekk, BUD_DIM, BUD_DIM_V2 } from "./budtrekk.ts";
import { blandMu } from "./budsok.ts";
import { budpress, kampjustertMu } from "./budrace.ts";

interface Node {
  blad: boolean;
  verdi?: number;
  kol?: number;
  terskel?: number;
  v?: Node;
  h?: Node;
}
interface Skog {
  basis: number;
  trær: Node[];
}
export interface Budmodell {
  dim: number;
  bud: number[];
  rate: number;
  vant: Record<string, number>;
  mμ: Skog;
  mσ: Skog;
}

/**
 * Validerer en allerede parset modell. Bredden sjekkes fordi en modell trent
 * med andre trekk enn `budTrekk` gir nå ville lest inngangen sin feil – og det
 * ville ikke krasjet, bare bydd dårligere.
 */
export function tolkBudmodell(rå: unknown): Budmodell {
  const m = rå as Budmodell;
  if (m === null || typeof m !== "object" || typeof m.dim !== "number") {
    throw new Error("Budmodellen mangler «dim» – er dette riktig fil?");
  }
  // TO LOVLIGE BREDDER, og modellen sier selv hvilken den vil ha.
  //
  // v1 (128) er egen hånd alene. v2 (140) legger BUDRUNDEN oppå – revisjonen
  // 5. august fant at modellen var blind for hva de andre hadde bydd.
  //
  // Sjekken er en ren utvidelse OG IKKE en oppmykning: en modell med en tredje
  // bredde avvises fortsatt. Poenget er at `bud-gbt.json` (128) skal virke
  // uendret mens en v2-modell kan trenes ved siden av – uten at en kodeendring
  // kan velte budgivningen i den boten som står ute.
  if (m.dim !== BUD_DIM && m.dim !== BUD_DIM_V2) {
    throw new Error(
      `Budmodellen er trent med ${m.dim} trekk, men budTrekk gir ${BUD_DIM} (v1) ` +
        `eller ${BUD_DIM_V2} (v2). Trekkene er endret siden modellen ble trent – ` +
        `tren den på nytt.`,
    );
  }
  if (!m.mμ?.trær || !m.mσ?.trær) throw new Error("Budmodellen mangler skogene mμ/mσ");
  return m;
}

const forutsi = (n: Node, x: Float32Array): number =>
  n.blad ? n.verdi! : forutsi(x[n.kol!]! <= n.terskel! ? n.v! : n.h!, x);
const anslå = (s: Skog, x: Float32Array, rate: number): number =>
  s.basis + rate * s.trær.reduce((a, t) => a + forutsi(t, x), 0);

/**
 * (μ, σ) for lagstikket, slik BUDAGENTEN SELV regner det.
 *
 * Eksportert 6. august fordi `examples/budtabell-kostnad.ts` trengte den. En
 * KOPI i måleverktøyet ville vært nøyaktig den driften revisjonen samme dag
 * ryddet bort: to uavhengige utgaver av samme regnestykke, der den ene kan
 * endres uten at den andre merker det.
 *
 * `σGulv` og `μSkift` er kallerens ansvar – de er kalibrerte anslag, ikke en
 * del av modellen.
 */
export function muSigma(m: Budmodell, x: Float32Array): { μ: number; σ: number } {
  return { μ: anslå(m.mμ, x, m.rate), σ: anslå(m.mσ, x, m.rate) };
}

/** P(lagstikk >= n) for (μ, σ). Samme uttrykk som beslutningsregelen bruker. */
export function pMinst(μ: number, σ: number, n: number): number {
  return 1 - Φ((n - 0.5 - μ) / σ);
}

/** Normalfordelingens halesannsynlighet, Abramowitz–Stegun 7.1.26. */
function Φ(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p =
    d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

export interface Innagent {
  velgHandling(state: GameState): Handling;
  nyKamp(): void;
}

/**
 * Avviket fra snittresidualen, gitt hva de andre har bydd. Summerer til null
 * over populasjonen – se `auksjonskorreksjon`.
 */
function auksjonsavvik(state: GameState, sete: number): number {
  let høyest = 0;
  for (let p = 0; p < state.antallSpillere; p++) {
    if (p === sete) continue;
    const b = state.budrunde.sisteBud[p];
    if (typeof b === "number" && b > høyest) høyest = b;
  }
  // Målte residualer minus det vektede snittet (+0,133).
  if (høyest === 0) return -0.023;
  if (høyest <= 8) return +0.351;
  if (høyest === 9) return -0.021;
  return +0.095;
}

export class Budagent implements Innagent {
  private readonly indre: Innagent;
  private readonly m: Budmodell;
  /**
   * TERSKELEN: hvor godt et bud maa vaere for at det er verdt aa by i det hele
   * tatt. Dette er `bv`-startverdien, og den forsvinner IKKE av seg selv.
   */
  private readonly evForsvar: number;

  /**
   * FORSVARSVERDIEN: hva vi faar naar vi IKKE vinner budrunden.
   *
   * DETTE VAR SAMME KONSTANT SOM TERSKELEN, og det var en sammenblanding av to
   * ulike stoerrelser. I spoersmaalet «skal jeg by?» kansellerer leddet
   * (1−p)·forsvarsverdi seg mot terskelen og betyr ingenting. Men i valget
   * MELLOM to bud gjoer det det ikke:
   *
   *   ev(N1) − ev(N2) = p1·2N1(2P1−1) − p2·2N2(2P2−1) + (p2−p1)·forsvarsverdi
   *
   * Leddet overlever naar p1 ≠ p2 – og etter at `vant[N]` ble rettet spriker
   * de voldsomt (bud 9: 0,097, bud 10: 0,940). Konstanten styrer altsaa valget
   * mellom 9 og 10 direkte, uten noen gang aa ha vaert maalt i den rollen.
   */
  private readonly forsvarsverdi: number;
  /**
   * Gulv på usikkerheten i stikkanslaget. Er σ overvurdert, trekkes P mot 0,5
   * og modellen slutter å skille gode hender fra dårlige – den byr for likt
   * på alt. Gulvet ble satt til 0,6 mot et tidligere kortnett, og hører derfor
   * til samme klasse som `evForsvar`: et KALIBRERT ANSLAG, ikke en regel.
   */
  private readonly σGulv: number;

  /**
   * Forskyvning paa mu, det anslaatte lagstikket.
   *
   * MAALT 5. august paa 3 000 runder: modellen sier 9,804, laget tar 9,934 -
   * et avvik paa 0,130 stikk. sigma er derimot perfekt kalibrert (1,227 mot
   * faktisk 1,228), saa avviket er en ren forskyvning og ikke en skalering.
   *
   * MEN NIVAAET ER ET SELEKSJONSARTEFAKT, OG SKAL IKKE BRUKES. Residualen
   * regnes bare for dem som VANT budrunden, og man vinner budrunden nettopp
   * naar modellen anslaar hoeyt. Aa maale en skjevhet paa et utvalg som er
   * valgt PAA den stoerrelsen man maaler, er ikke aa maale en skjevhet.
   *
   * Her sto det tidligere at avviket «gjoer boten litt for feig i hvert eneste
   * bud» - en invitasjon til aa sette `μSkift` til +0,130. Det ble proevd, og
   * sveipet maalte **-0,090 og -0,393**. Se `auksjonskorreksjon` under, som
   * bygger paa samme maaling og derfor SENTRERER paa null: bare FORSKJELLENE
   * mellom auksjonstilstandene er informasjon, aldri nivaaet.
   *
   * `μSkift` staar derfor paa 0 i ADAMS, og skal bli staaende der til noen kan
   * vise en skjevhet maalt paa et utvalg som IKKE er valgt paa den.
   */
  private readonly μSkift: number;

  /**
   * AUKSJONSKORREKSJON på μ — modellen er 128 trekk og HØRER IKKE budrunden.
   *
   * MÅLT 6. august over 4 000 runder, residual (faktisk lagstikk − μ) etter
   * hva de andre hadde bydd i budøyeblikket:
   *
   *     ingen bud     +0,110 ± 0,031
   *     hoeyest <= 8  +0,484 ± 0,084     <- 0,37 over de andre, ~4 SE
   *     hoeyest 9     +0,112 ± 0,028
   *     hoeyest >= 10 +0,228 ± 0,067
   *
   * Byr de andre lavt, sitter de svakt, og stikkene flyter til oss. Modellen
   * kan ikke vite det.
   *
   * SENTRERT PÅ NULL, og det er ikke en detalj. Å legge til μ ABSOLUTT målte
   * −0,090 i går: nivået er et seleksjonsartefakt, fordi residualen regnes for
   * dem som VANT budrunden. Bare FORSKJELLENE mellom auksjonstilstandene er
   * informasjon. Derfor trekkes snittet fra, og korreksjonen summerer til null
   * over populasjonen.
   */
  private readonly auksjonskorreksjon: boolean;
  /**
   * A4: SØKT ANSLAG PÅ LAGSTIKK. Gitt, blandes modellens μ med et anslag fra
   * å faktisk spille hånden ut (`budsok.ts`). `null` = av, og da er
   * beslutningen bit-identisk med før.
   *
   * Budgivning skjer 1–4 ganger per runde mot kortvalgets 12, så en budbeslutning
   * har råd til det samme som ett kortsøk. Kostnaden var aldri grunnen til at
   * dette ikke fantes.
   */
  private readonly søktAnslag: ((state: GameState, sete: number) => { μ: number; σ: number } | null) | null;
  /**
   * Hvor mye av SOEKETS anslag som brukes, i [0, 1]. 0 = av (bit-identisk
   * med modellen alene), 1 = full erstatning. Skal sveipes, ikke settes.
   */
  private readonly budblanding: number;

  /**
   * MAKRO → MESO: hvor hardt kampstillingen skal vippe verdsettingen av budet.
   *
   * 0 = av, og da er beslutningen BIT-IDENTISK med før — `kampjustertMu`
   * returnerer μ uendret uten å røre et flyttall. Se `budrace.ts` for formen,
   * for hvorfor presset gjenbrukes fra `race.ts`, og for den viktigste
   * forbeholdet: **modulen er strukturelt usynlig på gate 2**, der hver giv
   * starter på 0–0 og `racepress` derfor er eksakt 0. Bare kampbenken
   * (`examples/kamp.ts`) kan måle den.
   */
  private readonly kampLambda: number;

  /**
   * PERSONAVHENGIG JUSTERING av forsvarsverdien, eller `null`.
   *
   * `evForsvar` er en KONSTANT der det burde stått en modell: hva forsvar er
   * verdt avhenger av HVEM som vant budrunden. Mot en som berger 92 % av
   * kontraktene sine er forsvar nesten verdiløst; mot en som berger 62 % er
   * det verdt omtrent dobbelt så mye.
   *
   * MEN DEN ERSTATTER IKKE KONSTANTEN, den forskyver den. Sveipen 5. august
   * målte at den koblede verdien er et lokalt optimum i BEGGE retninger, så
   * nullpunktet er riktig. Profilen bidrar med et AVVIK rundt det, vektet av
   * hvor mye vi faktisk vet om personen – null i første runde, voksende siden.
   */
  private forsvarsjustering: ((state: GameState) => number) | null;

  /**
   * Festes ETTER konstruksjon fordi agentspeken bygger innenfra og ut:
   * `profil:` ligger utenpå `budm:`, så budagenten finnes allerede når
   * profilboka opprettes.
   */
  settForsvarsjustering(f: ((state: GameState) => number) | null): void {
    this.forsvarsjustering = f;
  }

  constructor(
    indre: Innagent,
    m: Budmodell,
    evForsvar = 2.5,
    σGulv = 0.6,
    μSkift = 0,
    forsvarsverdi = evForsvar,
    forsvarsjustering: ((state: GameState) => number) | null = null,
    auksjonskorreksjon = false,
    søktAnslag = null as ((state: GameState, sete: number) => { μ: number; σ: number } | null) | null,
    budblanding = 1,
    kampLambda = 0,
  ) {
    this.indre = indre;
    this.m = m;
    this.evForsvar = evForsvar;
    this.forsvarsverdi = forsvarsverdi;
    this.forsvarsjustering = forsvarsjustering;
    this.auksjonskorreksjon = auksjonskorreksjon;
    this.σGulv = σGulv;
    this.μSkift = μSkift;
    this.søktAnslag = søktAnslag;
    this.budblanding = budblanding;
    this.kampLambda = kampLambda;
  }

  nyKamp(): void {
    this.indre.nyKamp();
  }

  /**
   * Videresender bokføringskroken (12. sep), som `Konvensjonsvakt`: laget svelget kallet, og et
   * kortnett med motstanderbok under (`e1:<493>`) ville aldri sett `RUNDE_SLUTT` og kastet i runde 1.
   * Uten bok under er kallet en no-op, så gamle speker spiller bit-identisk.
   */
  observer(state: GameState): void {
    (this.indre as { observer?(s: GameState): void }).observer?.(state);
  }

  velgHandling(state: GameState): Handling {
    if (state.fase !== "BUDRUNDE" || state.iTur === null) return this.indre.velgHandling(state);
    const lov = lovligeHandlinger(state);
    if (lov.fase !== "BUDRUNDE") return this.indre.velgHandling(state);
    const tall = lov.bud.filter((b): b is number => typeof b === "number");
    if (tall.length === 0) return this.indre.velgHandling(state);

    const sete = state.iTur;
    // Modellens EGEN bredde, ikke den nyeste. Et v1-nett skal se v1-trekk.
    const x = budTrekk(state, sete, this.m.dim);
    let μ = anslå(this.m.mμ, x, this.m.rate) + this.μSkift;
    if (this.auksjonskorreksjon) μ += auksjonsavvik(state, sete);
    const σ = Math.max(this.σGulv, anslå(this.m.mσ, x, this.m.rate));

    // Personavhengig forskyvning, null når vi ikke kjenner motparten.
    const just = this.forsvarsjustering === null ? 0 : this.forsvarsjustering(state);
    const terskel = this.evForsvar + just;
    const fv = this.forsvarsverdi + just;

    /**
     * A4: spør SPILLET hva hånden er verdt, ikke bare regresjonen.
     *
     * ÉN GANG PER BESLUTNING, ikke per bud — og det er ikke en optimalisering,
     * det er riktig modell. Antall stikk laget tar avhenger av KORTENE, ikke
     * av hva vi meldte; derfor anslår budmodellen én (μ, σ) og regner P(N) for
     * alle N fra samme fordeling.
     *
     * Første utgave kalte søket per N, og testen «anslaget skiller mellom
     * ulike bud» feilet. Premisset var mitt eget som var feil: at det IKKE
     * skiller er nettopp det som gjør det til et gyldig anslag på
     * stikkfordelingen.
     */
    /**
     * BLANDINGEN, ikke erstatningen.
     *
     * Første kobling erstattet modellens μ med søkets. Det er feil av samme
     * grunn `budsok.ts` selv skriver: rolloutene spiller som OSS, så søket
     * arver vår egen skjevhet, mens GBT-en er tilpasset faktiske utfall. En
     * full erstatning bytter én skjevhet mot en annen uten å kunne måle det.
     *
     * `blandMu` med `budblanding` = 0 gir NØYAKTIG modellens tall, altså
     * bit-identisk med at søket er av. Det er knotten som skal sveipes.
     */
    let μB = μ;
    let σB = σ;
    if (this.søktAnslag !== null) {
      const s2 = this.søktAnslag(state, sete);
      const b = blandMu({ μ, σ }, s2, this.budblanding);
      μB = b.μ;
      σB = Math.max(this.σGulv, b.σ);
    }

    /**
     * MAKRO → MESO (K5 → K3): kampstillingen inn i budet.
     *
     * `totalPoeng` hadde null treff i denne fila. Kampstillingen styrte hvor
     * mye risiko SØKET tok i et stikk, men ikke OM Adams bød — en bot 30 poeng
     * bak med tre runder igjen bød nøyaktig som en som ledet.
     *
     * Presset er `race.ts` sitt, ikke et nytt: to definisjoner av «hvor langt
     * er vi kommet» ville drevet fra hverandre uten at noe ble rødt.
     *
     * `kampLambda = 0` gir μ tilbake UENDRET, så nullpunktet er bit-identisk.
     * OG: **på gate 2 er `press` strukturelt eksakt 0** (hver giv starter på
     * 0–0), så modulen er usynlig der uansett λ. Bare `examples/kamp.ts` kan
     * måle den. Se `budrace.ts`.
     */
    const press = this.kampLambda === 0 ? 0 : budpress(state, sete);
    const μK = kampjustertMu(μB, σB, press, this.kampLambda);

    let beste: Bud = PASS;
    let bv = terskel;
    for (const N of tall) {
      const P = 1 - Φ((N - 0.5 - μK) / σB);
      const p = this.m.vant[String(N)] ?? (N >= 11 ? 1 : 0);
      const ev = p * (2 * N * (2 * P - 1)) + (1 - p) * fv;
      if (ev > bv) {
        bv = ev;
        beste = N;
      }
    }

    /**
     * AMERIKANER. Krever NØYAKTIG det samme som bud 12 – alle stikk til
     * budlaget – men betaler `mål/2` til budvinneren mot bud 12s `2 × 12`.
     * Med målet 100 er det 50 mot 24: **dobbel innsats for identisk krav**.
     *
     * Sannsynligheten er derfor den SAMME P som for bud 12, og valget mellom
     * dem er ren aritmetikk: over P = 0,5 er Amerikaner bedre, under er bud 12
     * bedre fordi tapet er mindre. Ingen nye data trengs.
     *
     * Fram til nå løkket agenten bare over TALLBUD, så den kunne aldri melde
     * Amerikaner uansett hvor god hånden var.
     */
    const kanAmerikaner = lov.bud.some((b) => b === AMERIKANER);
    if (kanAmerikaner) {
      const alle = state.giving.antallStikk;
      /**
       * Kampstillingen gjelder ogsaa her. Den ville ellers vaert av i nettopp
       * det budet som avgjoer flest poeng - og «leder vi, by forsiktigere»
       * ville ikke omfattet Amerikaner.
       *
       * MERK at dette leddet leser `μ`/`σ` og ikke `μB`/`σB`: budsoeket har
       * aldri naadd Amerikaner-grenen. Det er en eldre uoverensstemmelse, og
       * den roeres ikke her - aa rette den ville blandet to endringer i samme
       * maaling.
       */
      const P = 1 - Φ((alle - 0.5 - kampjustertMu(μ, σ, press, this.kampLambda)) / σ);
      const p = this.m.vant["AMERIKANER"] ?? 1;
      // Satsen skalerer med maalet: mål/2 til budvinneren, mål/4 til makker.
      const sats = state.regler.målPoeng / 2;
      const ev = p * (sats * (2 * P - 1)) + (1 - p) * fv;
      if (ev > bv) {
        bv = ev;
        beste = AMERIKANER;
      }
    }

    /**
     * SOLO ER IKKE MED, og det er et valg og ikke en forglemmelse.
     *
     * Solo krever at BUDVINNEREN ALENE tar alle stikk. `μ` anslår LAGETS
     * stikk, med en makker som bidrar – så P(alene alle 12) er en helt annen
     * størrelse, og systematisk lavere. Å bruke lagets P for solo ville gitt
     * en bot som melder solo på hender der makkeren gjør halve jobben.
     *
     * Solo krever sitt eget anslag, målt for seg. Til det finnes, er det
     * riktigere å la være enn å gjette.
     */
    return { type: "BUD", spiller: sete, bud: beste };
  }
}
