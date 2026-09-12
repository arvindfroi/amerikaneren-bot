/**
 * LIKELIHOOD-VEKTING AV VERDENENE — «hvilke giver ville fått DEM til å spille slik?»
 *
 * ============ MÅLINGEN SOM BEGRUNNER DEN =================================
 *
 * Søket trekker i dag verdener som bare er FORENLIGE MED FAKTA (renonser, kapasiteter, død
 * talong, det etterlyste kortet, og for andre enn budvinneren hennes vrak som residual — se
 * K2-fiksen i `sdkort.ts` `medVerden`), vektet av trohodet (`~mlbu=`). Agent P bygde det
 * INFORMASJONSRETTFERDIGE taket (`examples/naabart-tro.ts`): tell opp de givene som er
 * forenlige med det setet ser, og behold dem som ved omspilling med motstandernes FAKTISKE
 * policyer gjenskaper hvert offentlige bud og kort. Sent i runden scorer den posterioren
 * 0,30 i log-tap der trohodet scorer 0,90.
 *
 * Agent T målte i tillegg at trohodet ikke tjener noe på å få vite motstanderens IDENTITET,
 * heller ikke som orakel. Verdien ligger altså ikke i å MERKE policyen, men i å SIMULERE
 * den. Det er nøyaktig det denne fila gjør, i den formen søket har råd til: ikke en
 * enumerasjon, men en vekt på de kandidatverdenene trekkeren alt lager.
 *
 * ============ FORMEN =====================================================
 *
 *     logW(verden) = − (andel bom) / temp
 *
 * «Bom» er en observert offentlig handling fra et ANNET sete som den antatte policyen IKKE
 * ville gjort, spilt på det setets hånd I DENNE VERDENEN. Andelen normaliseres på antall
 * scorede observasjoner — ellers straffes lange vinduer hardere enn korte, og vekten blir
 * uforenlig mellom stillinger (samme grep som `logTroverdighet`).
 *
 * `temp = 0` er den DETERMINISTISKE formen: én bom av seks gir exp(−8,3) ≈ 2,5·10⁻⁴, altså
 * praktisk talt 0/1, men med ORDEN beholdt. Ren 0/1 ville gjort alle kandidatene like når
 * ingen er perfekt, og da faller vektingen tilbake til uniform uten å si fra. Rekkefølgen
 * mellom «bommet én gang» og «bommet fem» er gratis og verdt å ha.
 *
 * ============ HVORFOR EN POLICY OG IKKE LOGITS ===========================
 *
 * `troverdighet.ts` (A5) gjør det samme med LOGITS fra kortnettet: softmax over lovlige
 * kort. Den formen er finere når modellen er ett nett. Men den antatte motstanderen her er
 * en SPEK — en hel kjede med vakt, budlag og eventuelt bok — og en slik kjede har ikke
 * logits, den har et valg. A5 kan altså ikke uttrykke «spill som HELE denne boten», som er
 * nettopp det taket måler mot. De to er alternativer, ikke tillegg: begge leser de samme
 * kortvalgene, og å legge dem sammen ville telt beviset to ganger (samme regel som hodet i
 * `verdensvekt.ts` slår fast for A1 mot A5).
 *
 * ============ POLICYEN MÅ VÆRE KANONISK ==================================
 *
 * Speken bryter likhet etter HVOR i hånden kortene ligger, og utdelingsordenen er skjult.
 * En ikke-kanonisk policy er derfor ikke en funksjon av det setet kan vite, og likelihooden
 * ville blitt en blanding over ordener. `kanoniskAgent` (`kanonisk.ts`) er kuren, og den
 * legges på HER — ett sted — så ingen kaller kan glemme den. Dobbel innpakning er en
 * no-op, så en kaller som alt har kanonisert taper ingenting.
 *
 * ============ K2: HVA DEN LESER ==========================================
 *
 * Bare offentlige felt (historikk, bord, budrunde, trumf, etterlyst, poeng) og VERDENENS
 * hender. `state.hender` for andre seter, `state.talong` og — for alle andre enn
 * budvinneren — `state.vrak` røres ikke: talongen og vraket regnes som RESIDUALET av
 * verdenen, nøyaktig som `medVerden` gjør det. Det er ikke pynt: sto de ekte igjen, ville
 * budvinnerens policy i omspillingen spilt med de EKTE byttekortene (`synlig.ts` legger
 * `s.vrak` i hennes kjente kort), og vekten hadde lekket. Prøvd i `test/lik-vekt.test.ts`
 * med en felle som leser de ekte hendene.
 *
 * ============ KOSTNADEN ==================================================
 *
 * Ett policykall per scoret observasjon per kandidatverden. `vindu` er kostnadsgrensen: med
 * standard 1 spilles siste fullførte stikk pluss det som ligger på bordet om igjen — de
 * ferskeste observasjonene, som bærer mest om hva som er IGJEN på hånden. Eldre stikk er
 * dessuten alt fanget av renonseforbudet i trekkeren. Grensen gjør vekten approksimativ,
 * og det står her, ikke i en fotnote.
 */

import { lovligeKort, utfør, type GameState } from "../motor.ts";
import { likeKort, type Kort } from "../kort.ts";
import { intTilKort, kortTilInt } from "../solver/dds.ts";
import type { Verden } from "../solver/sampler.ts";
import { usetteKort } from "./sdkort.ts";
import { kanoniskAgent, type Kanoniserbar } from "./kanonisk.ts";

/**
 * Straffen per full bom når `temp = 0`. Samme størrelsesorden som gulvet i
 * `lagTroverdighetsvekt` (−50): stort nok til at en forenlig verden alltid vinner, lite nok
 * til at `exp` ikke går til null for ALLE kandidatene og etterlater et NaN.
 */
export const HARD = 50;

export interface LikOpts {
  /** Skarphet. 0 = deterministisk (praktisk talt 0/1). Skal sveipes, ikke settes. */
  readonly temp?: number;
  /** Antall siste FULLFØRTE stikk som spilles om, i tillegg til bordet. Kostnadsgrense. */
  readonly vindu?: number;
}

/** Policyen søket antar at et sete spiller med. */
export type Policyvelger = (sete: number) => Kanoniserbar;

/**
 * log P(de observerte offentlige handlingene | verdenen), under `policyFor`.
 *
 * Verdenen gis som hender i kort-int-form, slik trekkeren leverer dem. Observatørens egne
 * handlinger scores ikke: vi trenger ingen slutning om vår egen policy.
 */
export function logLikelihood(
  state: GameState,
  observator: number,
  verdenHender: readonly number[][],
  policyFor: Policyvelger,
  opts: LikOpts = {},
): number {
  const temp = opts.temp ?? 0;
  const skala = temp > 0 ? 1 / temp : HARD;
  const vindu = Math.max(0, opts.vindu ?? 1);

  const alle = state.historikk;
  const fra = Math.max(0, alle.length - vindu);

  /**
   * HENDENE VED VINDUETS START: verdenens hender pluss kortene som er spilt SIDEN.
   * Rekonstruksjonen går bare over vinduet — å spille om fra stikk 0 ville krevd
   * originalhendene (budvinneren tok opp talongen) og møtt makkerplikten i stikk 1, som
   * gjør en observert historikk ulovlig i enhver verden der det etterlyste kortet ligger et
   * annet sted. Det er feilen `logTroverdighet` beskriver, og den gjelder her også.
   */
  const hender: Kort[][] = verdenHender.map((h) => h.map(intTilKort));
  while (hender.length < state.antallSpillere) hender.push([]);
  for (const kp of state.bord) hender[kp.spiller]!.push(kp.kort);
  for (let i = alle.length - 1; i >= fra; i--) {
    for (const kp of alle[i]!.kort) hender[kp.spiller]!.push(kp.kort);
  }

  /**
   * TALONGEN OG VRAKET SOM RESIDUAL — samme regel som `medVerden`, og av samme grunn.
   * Budvinneren KJENNER sitt eget vrak, så er observatøren budvinner står `state.vrak`; for
   * alle andre er vraket de kortene som verken er på en hånd eller spilt, og talongen er
   * for lengst tatt opp.
   */
  const brukt = new Set<number>();
  for (const h of hender) for (const k of h) brukt.add(kortTilInt(k));
  for (let i = 0; i < fra; i++) for (const kp of alle[i]!.kort) brukt.add(kortTilInt(kp.kort));
  const egetVrak = observator === state.budvinner;
  if (egetVrak) for (const k of state.vrak) brukt.add(kortTilInt(k));
  const rest = usetteKort(brukt);
  const vrak = egetVrak ? state.vrak : rest;
  const talong = egetVrak ? rest : [];

  /**
   * MAKKEREN FØLGER VERDENEN, som i `medVerden`. Er det etterlyste kortet fortsatt uspilt,
   * ligger det der VERDENEN sier, og makkerplikten gjelder derfra. Bryter den observerte
   * historikken plikten i denne verdenen, er verdenen genuint UMULIG — motoren kaster, og
   * `catch`-en under gir full bom. Det er riktig svar, ikke en feil.
   */
  let makker = state.makker;
  if (makker !== null && state.etterlyst !== null) {
    const holder = hender.findIndex((h) => h.some((k) => likeKort(k, state.etterlyst!)));
    if (holder >= 0) makker = holder;
  }

  /**
   * ============ TO FELT SOM MÅ SPOLES TILBAKE, IKKE BÆRES MED ==============
   *
   * FUNNET AV FASITPRØVEN, ikke gjettet: mot et KANONISK bord skal den sanne given aldri få
   * straff, og 4 av 103 fikk det likevel. Årsaken var at `{...state}` bar med seg to felt som
   * beskriver NÅET og ikke vinduets start:
   *
   *   `makkerAvslørt`  motoren setter den når det etterlyste kortet faller (`motor.ts`), og
   *                    `spillerVisning` viser makkeren BARE når den er sann. Falt kortet
   *                    inne i vinduet, så policyen i omspillingen en avslørt makker i trekk
   *                    den i virkeligheten tok blindt — og valgte noe annet, i en verden som
   *                    var helt riktig.
   *   `utspiller`      settes til stikkets leder, og er ved vinduets start nettopp den som
   *                    leder det første stikket der.
   *
   * Dette er samme feilklasse som talonglekkasjen i `medVerden`: en tilstand satt sammen av
   * felt fra to ulike tidspunkt. Den er stum — ingenting krasjer, tallet blir bare feil.
   */
  let avslørt = false;
  if (state.etterlyst !== null) {
    for (let i = 0; i < fra && !avslørt; i++) {
      for (const kp of alle[i]!.kort) if (likeKort(kp.kort, state.etterlyst)) avslørt = true;
    }
  }

  const vunnet = new Array<number>(state.antallSpillere).fill(0);
  for (let i = 0; i < fra; i++) {
    const v = alle[i]!.vinner;
    if (typeof v === "number") vunnet[v] = (vunnet[v] ?? 0) + 1;
  }

  // Hvem som er i tur ved vinduets start: den som ledet det første stikket i vinduet, ellers
  // den som ledet det som ligger på bordet. Er ingen av delene der, er det ingenting å score.
  const første = alle[fra]?.kort[0]?.spiller ?? state.bord[0]?.spiller;
  if (første === undefined) return 0;

  let s: GameState = {
    ...state,
    hender,
    talong,
    vrak,
    makker,
    historikk: alle.slice(0, fra),
    // `forrigeStikk` settes med: den er OFFENTLIG, og vakt- og konvensjonslagene leser den.
    // Sto den fra stillingen NÅ, ville policyen sett et stikk som ennå ikke er spilt i
    // omspillingen, og likelihooden målt en annen beslutning enn den som ble tatt.
    forrigeStikk: fra > 0 ? alle[fra - 1]! : null,
    bord: [],
    stikkSpilt: fra,
    stikkVunnet: vunnet,
    makkerAvslørt: avslørt,
    utspiller: første,
    iTur: første,
    fase: "SPILL",
  };

  let bom = 0;
  let n = 0;
  const observert: { spiller: number; kort: Kort }[] = [];
  for (let i = fra; i < alle.length; i++) for (const kp of alle[i]!.kort) observert.push(kp);
  for (const kp of state.bord) observert.push(kp);

  try {
    for (const kp of observert) {
      if (s.fase !== "SPILL" || s.iTur !== kp.spiller) return -skala;
      if (kp.spiller !== observator) {
        const lov = lovligeKort(s, kp.spiller);
        // Ulovlig her = verdenen er uforenlig med historikken. Full bom.
        if (!lov.some((k) => likeKort(k, kp.kort))) return -skala;
        // Ett lovlig kort sier ingenting om policyen — regelen valgte, ikke hun.
        if (lov.length > 1) {
          n++;
          const h = policyFor(kp.spiller).velgHandling(s);
          if (h.type !== "SPILL" || !likeKort(h.kort, kp.kort)) bom++;
        }
      }
      s = utfør(s, { type: "SPILL", spiller: kp.spiller, kort: kp.kort }).state;
    }
  } catch {
    // Motoren avviste omspillingen: verdenen er umulig under reglene, ikke bare usannsynlig.
    return -skala;
  }
  return n === 0 ? 0 : -(bom / n) * skala;
}

/**
 * Klar til bruk som vekt på kandidatverdenene, slik `trekkVerdener` vil ha den.
 *
 * `null` når vinduet ikke inneholder ÉN observert handling fra et annet sete — da har vekten
 * ingenting å si, og en funksjon som alltid gir 0 ville tvunget trekkeren gjennom
 * vektingsgrenen med full kandidatkostnad for et uniformt svar (samme grunn som
 * `lagVerdensvekt` returnerer `undefined` for «av»).
 */
export function lagLikvekt(
  state: GameState,
  observator: number,
  policyFor: Policyvelger,
  opts: LikOpts = {},
): ((v: Verden) => number) | null {
  const vindu = Math.max(0, opts.vindu ?? 1);
  const alle = state.historikk;
  const fra = Math.max(0, alle.length - vindu);
  let andres = 0;
  for (let i = fra; i < alle.length; i++) {
    for (const kp of alle[i]!.kort) if (kp.spiller !== observator) andres++;
  }
  for (const kp of state.bord) if (kp.spiller !== observator) andres++;
  if (andres === 0) return null;

  // KANONISERINGEN LEGGES PÅ HER, ett sted. Den er idempotent, så en kaller som alt har
  // kanonisert taper ingenting; en som har glemt det, får den likevel.
  const buffer = new Map<number, Kanoniserbar>();
  const kanonisk: Policyvelger = (sete) => {
    let p = buffer.get(sete);
    if (p === undefined) {
      p = kanoniskAgent(policyFor(sete));
      buffer.set(sete, p);
    }
    return p;
  };
  return (v: Verden): number => logLikelihood(state, observator, v.hender, kanonisk, opts);
}
