/**
 * SENSORUTVALG PER EKSPERT – eksplisitt, og hvert kutt begrunnet.
 *
 * HVORFOR DETTE IKKE ER OPPRYDDING, MEN MEKANIKK. NEATs `muterNyKobling`
 * trekker kilden UNIFORMT blant inngangene. Med 318 innganger er sjansen for
 * å treffe en bestemt sensor 1/318 per forsøk, og det er ikke et teoretisk
 * problem: D2 fikk 14 nye sensorer og endte med 0 av 14 koblet etter 190
 * generasjoner (`examples/neat-kobling.ts`). Å fjerne det eksperten ikke
 * trenger øker tettheten av nyttige koblinger direkte.
 *
 * TO SLAGS KUTT, og de har ulik begrunnelse:
 *
 *  1. IRRELEVANT for oppgaven. Budrundens mekanikk sier ingenting om hvilket
 *     kort som feller kontrakten; håndvurderingen er laget for budgivning og
 *     trumfvalg, ikke for å legge kort i stikk 7.
 *
 *  2. KONSTANT for rollen. En sensor som har samme verdi i hver eneste
 *     stilling eksperten møter, bærer null informasjon – men koster en
 *     inngang som mutasjonen kan treffe. `ER_FORSVARER` er alltid 1 for
 *     forsvarseksperten og alltid 0 for de to andre. Dette kuttet er hele
 *     grunnen til at spilleksperten er delt i tre og ikke er én ekspert med
 *     en rollesensor: rollen ligger i PORTVAKTEN (deterministisk, fase +
 *     rolle), ikke i inngangsvektoren.
 *
 * Kutt av type 2 er MÅLBARE og skal måles: `konstanteSensorer` under finner
 * inngangene som ikke varierer i et utvalg, og testene låser at de kuttede
 * rollesensorene faktisk er konstante i rollen sin.
 */

import { ANTALL_INN, FORSVARSSENSORER, INNGANG } from "../../neat/trekk.ts";

/** Indeksene [fra, fra+antall). */
function spenn(fra: number, antall: number): number[] {
  const ut: number[] = [];
  for (let i = 0; i < antall; i++) ut.push(fra + i);
  return ut;
}

function bygg(deler: readonly (readonly number[])[]): readonly number[] {
  const med = new Set<number>();
  for (const d of deler) for (const i of d) med.add(i);
  return [...med].sort((a, b) => a - b);
}

function uten(basis: readonly number[], fjern: readonly number[]): readonly number[] {
  const ut = new Set(fjern);
  return basis.filter((i) => !ut.has(i));
}

// --- Håndvurdering: to blokker som hører sammen ----------------------------
/** EST_STIKK … LENGSTE (14): estimerStikk per farge + ess/konger/fordeling. */
const HÅNDVURDERING = spenn(INNGANG.EST_STIKK, 14);
/** SEKVENS … SORTER (7): serier og antall farger man sitter i. */
const SEKVENSER = spenn(INNGANG.SEKVENS, 7);

/**
 * BUD-EKSPERTEN – 87 av 318.
 *
 * Fasiten er SD-orakelet: hva hånden faktisk henter hjem når DETTE setet får
 * kontrakten. Ved budøyeblikket finnes det ingen trumf, ingen talong, ingen
 * lagte kort – tre 52-blokker (SETT, BORD, ETTERLYST) er identisk null i hver
 * eneste stilling eksperten møter. De koster 156 av 318 innganger og bærer
 * ingenting.
 *
 * BEHOLDT: egen hånd og alt som beskriver den (fargelengder, håndvurdering,
 * sekvenser), pluss budrundens offentlige tilstand. Det siste er ikke pynt:
 * hva de andre har meldt sier noe om hvor de andre kortene ligger, og det
 * påvirker hvor mange stikk MIN hånd tar.
 *
 * TO STRUKTURELT DØDE KUTTET (målt konstante over 2 433 budstillinger):
 *  - PASSET+0 «jeg har passet»: en spiller som har passet får aldri tur igjen.
 *  - BUD_MEG «jeg har høyeste bud»: holder jeg det høyeste budet og turen
 *    kommer tilbake til meg, har alle andre passet og budrunden er over.
 *
 * BEHOLDT selv om de er konstante i MÅLINGEN: BUD_AMERIKANER og BUD_SOLO.
 * De er null bare fordi NevroHjerne aldri melder dem, og det er referansens
 * policy – ikke en egenskap ved fasen. En ekspert som skal kunne svare på en
 * amerikanermelding må kunne se den.
 */
export const BUD_SENSORER: readonly number[] = uten(
  bygg([
    spenn(INNGANG.HÅND, 52),
    spenn(INNGANG.FARGELENGDER, 4),
    HÅNDVURDERING,
    SEKVENSER,
    spenn(INNGANG.BUD_HØYESTE, 4), // BUD_HØYESTE, _AMERIKANER, _SOLO, _MEG
    spenn(INNGANG.PASSET, 4),
    spenn(INNGANG.BUD_HIST, 4),
  ]),
  [INNGANG.BUD_MEG, INNGANG.PASSET],
);

/**
 * VRAK-EKSPERTEN – 81 av 318.
 *
 * Budvinneren har tatt opp talongen og sitter med 16 kort. Beslutningen er
 * ren håndvurdering: hvilke fire kort er hånden minst verdt uten?
 *
 * FJERNET: hele budrunden (den er avgjort), alt om stikkspillet (det har ikke
 * begynt), og kampstillingen (MINE_POENG/BESTE_MOTSTANDER påvirker ikke
 * hvilke kort som er verdt å beholde i DENNE kontrakten – nøyaktig samme
 * argument som i FORSVARSSENSORER).
 *
 * BEHOLDT ut over hånden: MELDING og KONTRAKT. Hvor mange stikk man har
 * forpliktet seg til avgjør om man skal vrake mot sikkerhet eller mot topp.
 * MELDING er målt konstant over 300 vrakstillinger, men bare fordi
 * NevroHjerne aldri melder amerikaner eller solo – det er referansens policy,
 * ikke en egenskap ved fasen, og en vrakekspert i en amerikanerkontrakt
 * skal kunne se at kontrakten er en amerikaner.
 */
export const VRAK_SENSORER: readonly number[] = bygg([
  spenn(INNGANG.HÅND, 52),
  spenn(INNGANG.FARGELENGDER, 4),
  HÅNDVURDERING,
  SEKVENSER,
  spenn(INNGANG.MELDING, 3),
  [INNGANG.KONTRAKT],
]);

/**
 * TRUMF-EKSPERTEN – 130 av 318.
 *
 * Som vraksensorene, pluss SETT (52). Det er ikke en generell historikkblokk
 * her: i VELG-fasen inneholder SETT nøyaktig budvinnerens EGET VRAK, og
 * motoren nekter å etterlyse et kort man har vraket (`utførVelg`). Uten den
 * blokken kan eksperten ikke se hvilke etterlysninger som er lovlige.
 *
 * MELDING (3) kuttes her, i motsetning til hos vrakeksperten: trumfeksperten
 * er avgrenset til tallbud (se `lagTrumfstilling` – ved solo er etterlysning
 * valgfri og betyr noe annet), så meldingstypen er konstant per definisjon.
 */
export const TRUMF_SENSORER: readonly number[] = uten(
  bygg([VRAK_SENSORER, spenn(INNGANG.SETT, 52)]),
  spenn(INNGANG.MELDING, 3),
);

/**
 * SPILL-EKSPERTENE.
 *
 * Grunnlaget er FORSVARSSENSORER (274 av 318) – begrunnelsen for de 44 kuttene
 * står i `src/neat/trekk.ts` og gjentas ikke her. Det som skjer under er kutt
 * av TYPE 2: sensorer som er konstante innenfor rollen.
 */

/** Sensorer som beskriver hvilken rolle man har. Portvakten vet det alt. */
const ROLLE = {
  erBudvinner: INNGANG.ER_BUDVINNER, // (allerede ute av FORSVARSSENSORER)
  erMakker: INNGANG.ER_MAKKER,
  erHemmeligMakker: INNGANG.ER_HEMMELIG_MAKKER,
  påBudlaget: INNGANG.PÅ_BUDLAGET,
  erForsvarer: INNGANG.ER_FORSVARER,
} as const;

/**
 * STRUKTURELT DØDE I ALLE TRE SPILLROLLENE.
 *
 * Disse er ikke konstante «i praksis», de kan ikke være noe annet:
 *  - UTSPILLER+0 : «jeg spilte ut i stikket» kodes bare når det ligger kort
 *    på bordet. Er det min tur og jeg spilte ut, er stikket enten fullt eller
 *    ferdig – bitten kan aldri stå når eksperten spør.
 *  - STIKKLEDER+0 : «jeg vinner stikket akkurat nå» krever at kortet mitt
 *    ligger der. Samme umulighet.
 *  - MAKKER_SETE+0 : «makkeren sitter på relativt sete 0», altså at makkeren
 *    er meg. Det er ER_MAKKER, ikke et sete.
 * MÅLT på 2 000 benkstillinger per rolle (`konstanteSensorer`): konstante i
 * alle tre.
 */
const DØDE_I_SPILL: readonly number[] = [
  INNGANG.UTSPILLER,
  INNGANG.STIKKLEDER,
  INNGANG.MAKKER_SETE,
];

/**
 * SPILL-FØRER – 264 av 318.
 *
 * TREKK_TRUMF legges TILBAKE: den er definert som «på budlaget OG levende
 * trumf ute hos andre», altså identisk 0 for en forsvarer (derfor kuttet der)
 * og et ekte signal for spilleføreren. Å trekke trumf er spilleførerens
 * viktigste plan.
 *
 * KUTTET fordi de er konstante for rollen (alle bekreftet med
 * `konstanteSensorer` over 2 000 benkstillinger):
 *  - ER_MAKKER, ER_HEMMELIG_MAKKER, ER_FORSVARER: alltid 0
 *  - PÅ_BUDLAGET: alltid 1
 *  - BUDVINNER (4): one-hot på relativt sete, og budvinneren er meg
 */
export const SPILL_FØRER_SENSORER: readonly number[] = uten(
  bygg([FORSVARSSENSORER, [INNGANG.TREKK_TRUMF]]),
  [
    ROLLE.erMakker,
    ROLLE.erHemmeligMakker,
    ROLLE.erForsvarer,
    ROLLE.påBudlaget,
    ...spenn(INNGANG.BUDVINNER, 4),
    ...DØDE_I_SPILL,
  ],
);

/**
 * SPILL-MAKKER – 262 av 318.
 *
 * Makkeren er på budlaget, så TREKK_TRUMF gjelder også her.
 *
 * KUTTET av rollegrunner: ER_HEMMELIG_MAKKER (alltid 1 – det ER definisjonen
 * på rollen), PÅ_BUDLAGET (alltid 1), ER_FORSVARER (alltid 0), BUDVINNER+0
 * (budvinneren er aldri meg).
 *
 * KUTTET ETTER MÅLING, mot det jeg først antok: ER_MAKKER, MAKKER_SETE (alle
 * fire) og MAKKER_KJENT er ALLE konstante for makkeren i benken, og
 * ETTERLYST_UTE likeså. Jeg skrev først at nettopp disse var makkerens
 * interessante sensorer – overgangen fra skjult til avslørt spill. Det er
 * feil, og grunnen er verdt å kjenne: makkerplikten i `lovligeKort` tvinger
 * det etterlyste kortet ut i FØRSTE stikk når det er lovlig, og orakelbenken
 * logger bare stillinger med minst to lovlige kort. Makkeren har altså i
 * praksis ikke et fritt valg før hen allerede er avslørt.
 *
 * FORBEHOLD som må stå: dette er målt på en benk generert av NevroHjerne. En
 * makker som spiller annerledes kan få frie valg før avsløringen, og da er
 * disse sensorene ikke lenger konstante. Kuttet skal etterprøves når vi har
 * stillinger fra ekspertens egen spilling.
 */
export const SPILL_MAKKER_SENSORER: readonly number[] = uten(
  bygg([FORSVARSSENSORER, [INNGANG.TREKK_TRUMF]]),
  [
    ROLLE.erHemmeligMakker,
    ROLLE.påBudlaget,
    ROLLE.erForsvarer,
    ROLLE.erMakker,
    INNGANG.BUDVINNER,
    INNGANG.MAKKER_KJENT,
    INNGANG.ETTERLYST_UTE,
    ...spenn(INNGANG.MAKKER_SETE, 4),
    ...DØDE_I_SPILL,
  ],
);

/**
 * SPILL-FORSVAR – 266 av 318.
 *
 * FORSVARSSENSORER minus rollekonstantene: ER_MAKKER (alltid 0 – forsvareren
 * blir aldri avslørt som makker), ER_HEMMELIG_MAKKER (alltid 0), PÅ_BUDLAGET
 * (alltid 0), ER_FORSVARER (alltid 1), BUDVINNER+0 (budvinneren er ikke meg).
 *
 * Merk at MAKKER_SETE+1..3, MAKKER_KJENT og MAKKER_LEDER BEHOLDES, og at de
 * er MÅLT variable her – i motsetning til hos makkereksperten. Det er
 * unntaket docs/moe2.md peker på: forsvareren vet ikke hvem makkeren er før
 * avsløringen, og det håndteres av sensorer, ikke av en lært gating.
 */
export const SPILL_FORSVAR_SENSORER: readonly number[] = uten(FORSVARSSENSORER, [
  ROLLE.erMakker,
  ROLLE.erHemmeligMakker,
  ROLLE.påBudlaget,
  ROLLE.erForsvarer,
  INNGANG.BUDVINNER,
  ...DØDE_I_SPILL,
]);

/**
 * Projiserer en full 318-vektor ned i ekspertens eget inngangsrom.
 *
 * Eksperten får et MINDRE inngangslag, ikke en maskert 318-vektor. Det er
 * poenget: `muterNyKobling` trekker uniformt blant nodene som finnes, så en
 * sensor som ikke finnes kan heller ikke stjele et koblingsforsøk.
 */
export function projiser(inn: readonly number[], sensorer: readonly number[]): number[] {
  if (inn.length !== ANTALL_INN) {
    throw new Error(`projiser: forventet ${ANTALL_INN} innganger, fikk ${inn.length}`);
  }
  const ut = new Array<number>(sensorer.length);
  for (let i = 0; i < sensorer.length; i++) ut[i] = inn[sensorer[i]!]!;
  return ut;
}

/**
 * Inngangene som er KONSTANTE over et utvalg fulle 318-vektorer.
 *
 * Brukes til å etterprøve kutt av type 2 med tall i stedet for med
 * resonnement: er en sensor konstant i alle stillingene rollen faktisk møter,
 * er den ingen sensor. Returnerer indeksene, sorterte.
 */
export function konstanteSensorer(vektorer: readonly (readonly number[])[]): number[] {
  if (vektorer.length === 0) return [];
  const første = vektorer[0]!;
  const konstant: number[] = [];
  for (let i = 0; i < ANTALL_INN; i++) {
    const v = første[i]!;
    let lik = true;
    for (const vek of vektorer) {
      if (vek[i] !== v) {
        lik = false;
        break;
      }
    }
    if (lik) konstant.push(i);
  }
  return konstant;
}
