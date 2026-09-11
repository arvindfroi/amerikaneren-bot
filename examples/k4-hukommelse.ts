/**
 * K4 — «ha hukommelse over hele spill, og evnen til å planlegge framover»
 *
 * AdamsMax.md sier prøven skal være to ting, og denne fila er begge:
 *
 *   PRØVE A (hukommelsen)   Spill samme runde to ganger: én gang som runde 1 i
 *                           en kamp, én gang som runde 8 etter sju spilte runder
 *                           mot de samme motstanderne. Valgene MÅ avvike. Gjør
 *                           de ikke det, er hukommelsen dekorasjon.
 *
 *   PRØVE B (framoverblikk) Alpha-mu med M ≥ 2 søker over egne FRAMTIDIGE valg.
 *                           Gevinsten ved M=2 mot M=1 må måles.
 *
 * ================= HVORFOR PRØVE A ER BYGD SLIK DEN ER ====================
 *
 * Kravet er «samme runde, ulik hukommelse». Det som må holdes fast er derfor
 * ALT AGENTEN KAN SE, og det eneste som får variere er hva den HUSKER. Formen
 * er lånt fra K2-prøven, som er den eneste prøven i prosjektet som er avgjort:
 *
 *   K2:  samme synlige tilstand, ULIKE skjulte kort  → valget må være LIKT
 *   K4A: samme synlige tilstand, ULIK hukommelse     → valget må være ULIKT
 *
 * Konkret: én kamp spilles fram til og med runde 8. Hver stilling der fokussetet
 * skal handle i runde 8 lagres, sammen med valget den METTE agenten tok. Så
 * mates NØYAKTIG de samme stillingene inn i en FERSK agent av samme spek — en
 * som aldri har sett de sju rundene. Avviker valgene, har hukommelsen effekt.
 *
 * ================= DETERMINISME ER IKKE VALGFRITT =========================
 *
 * En agent med RNG (`amu:` trekker verdener, `sok` i budlaget trekker verdener)
 * har en RNG-posisjon som er FLYTTET av de sju rundene. Fersk mot mett ville da
 * målt RNG-posisjon, ikke hukommelse — og forskjellen ville sett like ekte ut.
 *
 * Derfor kjøres prøve A på en HELT DETERMINISTISK stakk: `budm` uten `sok`,
 * `vakt`, `e1`. Da er det bare én ting igjen som kan skille de to armene, og
 * det er profilboka. `vr:` er utelatt av samme grunn som `amu:` — se under.
 *
 * ================= NULLARMEN, SOM ER DEN VIKTIGSTE ========================
 *
 * `A_NULL` er den samme stakken UTEN `profil:`. Den har ingen hukommelse i det
 * hele tatt, og MÅ derfor måle nøyaktig null avvik. Gjør den ikke det, måler
 * prøven noe annet enn hukommelse, og tallet fra minnearmen er verdiløst.
 *
 * Det er den halvdelen K2-prøven lærte oss å aldri droppe.
 *
 * ================= HUKOMMELSEN HAR TO KANALER, OG DE MÅLER ULIKT =========
 *
 *   BUDET   `Profilbok.justering` forskyver terskelen på −3,0.
 *   KORTET  `Økt.motpartFor` gir alpha-mu én rollout-policy per motstander.
 *
 * Prøve A (over) måler den første. Den kan ikke måle den andre, fordi den
 * deterministiske stakken ikke har `amu:` — og med `amu:` ville RNG-posisjonen
 * forurenset målingen. Kortkanalen måles derfor av `prøveA2`, ETT NIVÅ NED:
 * samme stilling, samme trukne verdener, samme `alphaMu`, bare to ulike
 * rollout-motparter. Da er RNG-en bit-identisk i begge armene.
 *
 * ================= OG OVER DEM BEGGE: «okt:» BAK «vr:» ==================
 *
 * `lagIndre` sender `Spekkontekst` nedover, men `vr:` bygger sitt indre lag med
 * `lagIndre(rest)` UTEN `ctx`. ADAMS_V6 og ADAMS_V7 begynner begge med
 * «okt:vr:…», så økten opprettes og blir aldri levert videre. `øktNåesGjennom`
 * avgjør det med et tall i stedet for en lesning av koden.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { lovligeKort } from "../src/motor.ts";
import { lagIndre, ADAMS_MAALT, tall, type Spekagent } from "../src/moe2/agentspek.ts";
import { lagTrumftrekker } from "./k6-vaner.ts";
import { Økt } from "../src/moe2/okt.ts";
import { BEFOLKNING, krymp, tiltro } from "../src/moe2/profil.ts";
import { MAKS_UTSLAG, type Profilbok } from "../src/moe2/profilagent.ts";
import { alphaMu } from "../src/moe2/alphamu.ts";
import { standardMål, trekkVerdener, type Utspiller } from "../src/moe2/sdkort.ts";
import { lagRng } from "../src/kort.ts";
import { harLag, harSøk, utenMinne } from "./spek-lag.ts";

/**
 * DEN DETERMINISTISKE KJERNEN. Budmodellen uten `sok` (som trekker verdener),
 * konvensjonsvakten og nettet. Ingen av de tre bruker tilfeldighet, så to kall
 * på samme tilstand gir alltid samme svar — og det er forutsetningen for at
 * prøve A kan tilskrive et avvik til hukommelsen og ingenting annet.
 */
export const BASE_DET =
  "budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:e1:e1-modell/d7alle.bin";

/** NULLARMEN: ingen hukommelse i det hele tatt. Må måle eksakt 0 avvik. */
export const A_NULL = BASE_DET;

/**
 * MINNEARMEN: `profil:` rett over `budm:`, som i ADAMS_V6/V7.
 *
 * Rekkefølgen er ikke pynt. `Profilagent` fester `settForsvarsjustering` på det
 * laget den får inn, og bare `Budagent` har den metoden. Legges noe imellom,
 * lærer profilen fortsatt — men den påvirker ingenting, og prøven ville målt
 * null uten at hukommelsen manglet.
 */
export const A_MINNE = `profil:${BASE_DET}`;

export interface Agent {
  velgHandling(s: GameState): Handling;
  nyKamp(): void;
}

const navn = (h: Handling): string => {
  switch (h.type) {
    case "SPILL":
      return `S${h.kort.farge}${h.kort.verdi}`;
    case "BUD":
      return `B${String(h.bud)}`;
    case "VRAK":
      return `V${h.kort.map((k) => `${k.farge}${k.verdi}`).sort().join(",")}`;
    case "VELG":
      return `T${h.trumf}/${h.etterlyst === null ? "-" : `${h.etterlyst.farge}${h.etterlyst.verdi}`}`;
    default:
      return h.type;
  }
};

/**
 * En agentstakk med økten sin (om armen har en) og profilboka (om noe lag
 * holder en). Boka er det som faktisk HUSKER, og prøven må kunne lese den —
 * ellers kan den bare måle at valget ikke endret seg, ikke hvorfor.
 */
const snitt = (v: readonly number[]): number =>
  v.length === 0 ? 0 : v.reduce((a, b) => a + b, 0) / v.length;

/** Grenen med høyest snitt over verdenene. Samme regel som `Alphamuagent`. */
function beste<T extends { vektor: number[] }>(grener: readonly T[]): T {
  let b = grener[0]!;
  for (const g of grener) if (snitt(g.vektor) > snitt(b.vektor)) b = g;
  return b;
}

export function lagStakk(
  spek: string,
  medØkt: boolean,
): { agent: Agent; økt: Økt | null; bok: () => Profilbok | null } {
  const økt = medØkt ? new Økt() : null;
  const agent = (økt === null ? lagIndre(spek) : lagIndre(spek, { økt })) as Spekagent;
  /**
   * BOKA MÅ LESES SENT, ikke ved bygging.
   *
   * `Profilagent.nyKamp()` BYTTER UT boka med en ny når den ikke er en øktbok.
   * Første utgave tok en referanse ved konstruksjon, og den pekte etterpå på en
   * forlatt bok som alltid målte null runder — altså «ingen hukommelse» for en
   * arm som hadde den. Prøven ville løyet i retning av sin egen konklusjon.
   */
  return { agent, økt, bok: () => økt?.bok ?? (agent as unknown as { bok?: Profilbok }).bok ?? null };
}

export interface Opptak {
  /** Stillingene i målrunden der fokussetet skulle handle. */
  readonly stillinger: readonly GameState[];
  /** Valget den METTE agenten tok i hver av dem. */
  readonly valg: readonly string[];
  /** Fokussetets økt etter oppvarmingen, om armen har en. */
  readonly økt: Økt | null;
  /** Fokussetets profilbok etter oppvarmingen, om noe lag holder en. */
  readonly bok: Profilbok | null;
  /** Siste rundenummer kampen nådde. Under målrunden ⇒ giv forkastes. */
  readonly nådd: number;
  /** Antall runder profilboka faktisk fikk bokført, summert over setene. */
  readonly bokførte: number;
}

/**
 * Spiller én kamp fram til og med `målRunde` og tar opp fokussetets valg der.
 *
 * `tikk` er den avgjørende bryteren, og den finnes fordi den avdekket noe:
 *
 *   `Profilbok.observer` gjør ingenting med mindre den får en tilstand med
 *   `fase === "RUNDE_SLUTT"`. Den blir bare kalt fra `Profilagent.velgHandling`.
 *   Men `examples/kamp.ts` — kampbenken AdamsMax peker på — utfører `NESTE`
 *   SELV ved rundeslutt og spør aldri agenten. Profilboka får dermed aldri én
 *   eneste observasjon der.
 *
 * `tikk: false` er kampbenkens regime. `tikk: true` er `profilagent.test.ts`
 * sitt («la profilen bokføre runden»). Begge måles, fordi forskjellen mellom
 * dem ER funnet.
 */
export function spillOgTaOpp(
  spek: string,
  medØkt: boolean,
  frø: number,
  målRunde: number,
  tikk: boolean,
  fokus = 0,
  forkamper = 0,
  /**
   * ============ ET BORD MED NOE AA HUSKE =============================
   *
   * Sto ingenting her, og alle fire setene var identiske Adams. Da finnes det
   * INGEN stil aa laere, og en riktig hukommelse skal ikke endre et eneste
   * valg. Den gamle detektoren «bestod» likevel - fordi den fyrte paa stoey
   * (§108: fire identiske agenter spredte seg -0,45..+0,17).
   *
   * Med residualmaalet (`stilbias.ts`) er nullpunktet null, saa proeven maa gi
   * hukommelsen noe ekte aa finne. Ellers maaler den at ingenting skjer naar
   * ingenting har skjedd - og kaller det en feil.
   */
  vaneSete?: number,
  /**
   * HELE BOTEN (11. sep, `--spek`). Begge feltene er AV som standard, og da er
   * stien bit-identisk med før.
   *
   *   andre         speken i de TRE andre setene. Hukommelsen skal lære et bord,
   *                 ikke søke; fire søkende seter koster fire ganger så mye uten å
   *                 endre hva prøve A spør om.
   *   observerTikk  tikk gjennom `observer(s)` når agenten har den, i stedet for
   *                 `velgHandling(s)` ved RUNDE_SLUTT. Søketroen (`sik:…~mlbu=`)
   *                 fyller boka si bare gjennom tilstander den faktisk får se.
   */
  ekstra: { readonly andre?: string; readonly observerTikk?: boolean } = {},
): Opptak {
  const stakker = [0, 1, 2, 3].map((p) => {
    const st = lagStakk(p === fokus || ekstra.andre === undefined ? spek : ekstra.andre, medØkt);
    if (p !== vaneSete) return st;
    // Bare KORTVALGET vris. Bud, vrak og trumf tas av samme agent som de
    // andre, saa det eneste som skiller setet er vanen.
    const vane = lagTrumftrekker(ekstra.andre ?? spek);
    return {
      ...st,
      agent: {
        nyKamp: () => st.agent.nyKamp(),
        velgHandling: (x: GameState): Handling => vane.velgHandling(x),
      } as Agent,
    };
  });
  const stillinger: GameState[] = [];
  const valg: string[] = [];

  /**
   * Én kamp. `taOpp` er av under forkampene: de skal bare fylle hukommelsen.
   *
   * FORKAMPENE ER ØKTENS EGEN PRØVE. `Profilagent.nyKamp()` nullstiller boka
   * med mindre den er en øktbok, så uten `okt:` er alt som skjedde i en
   * forkamp borte i det neste `nyKamp()`-kallet. Med `okt:` står den. Det er
   * hele forskjellen mellom de to armene, og forkampene er det eneste stedet
   * den kan vises.
   */
  const énKamp = (kampFrø: number, taOpp: boolean): number => {
    for (const st of stakker) st.agent.nyKamp();
    let s: GameState = opprettSpill({ antallSpillere: 4 }, kampFrø);
    let vakt = 0;
    while (s.fase !== "FERDIG" && vakt++ < 200_000) {
      if (s.fase === "RUNDE_SLUTT") {
        if (taOpp && s.rundeNr >= målRunde) break;
        if (tikk) {
          for (const st of stakker) {
            const obs = (st.agent as { observer?(x: GameState): void }).observer;
            if (ekstra.observerTikk === true && obs !== undefined) {
              obs.call(st.agent, s);
              continue;
            }
            // Agenten kan velge å ikke ha noe å si ved rundeslutt; poenget er
            // at profillaget SER tilstanden. Feiler et lag under, er det ikke
            // prøven som skal dø.
            try {
              st.agent.velgHandling(s);
            } catch {
              /* tomt med vilje */
            }
          }
        }
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      const h = stakker[iTur]!.agent.velgHandling(s);
      if (taOpp && iTur === fokus && s.rundeNr === målRunde) {
        stillinger.push(s);
        valg.push(navn(h));
      }
      s = utfør(s, h).state;
    }
    return s.rundeNr;
  };

  // Forkampene får EGNE frø, ellers ville hukommelsen bestått av den samme
  // runden om og om igjen - det er å lære én giv utenat, ikke å lære et bord.
  for (let k = 0; k < forkamper; k++) énKamp(frø + 1_000_003 * (k + 1), false);
  const nådd = énKamp(frø, true);

  const bok = stakker[fokus]!.bok();
  let bokførte = 0;
  if (bok !== null) for (let p = 0; p < 4; p++) bokførte += bok.runder(p);
  return { stillinger, valg, økt: stakker[fokus]!.økt, bok, nådd, bokførte };
}

export interface MinneMål {
  /** Antall giv som nådde målrunden. */
  giv: number;
  /** Antall sammenliknede beslutninger. */
  n: number;
  /** Antall der fersk og mett agent valgte ULIKT. */
  avvik: number;
  /** Avvik i budrunden / vrak / trumfvalg. */
  avvikBud: number;
  /** Avvik i kortspillet. */
  avvikSpill: number;
  /** Hvor mange runder profilboka hadde bokført per sete, etter oppvarming. */
  bokførte: number[];
  /** `Økt.aggressivitet` per sete etter oppvarming. `null` = «vet ikke nok». */
  aggressivitet: (number | null)[];
  /**
   * DEN STØRSTE FORSKYVNINGEN hukommelsen faktisk ba om, i budpoeng.
   *
   * Dette er tallet som gjør null avvik LESBART. `Profilbok.justering` er den
   * eneste kanalen profilen har inn i beslutningen, og terskelen den forskyver
   * står på −3,0. Er maks-forskyvningen 0,02, er det ikke rart at ingen valg
   * endret seg — og da er svaret ikke «hukommelsen virker ikke», men «den
   * lærer for sakte til å bite på sju runder».
   */
  maksJustering: number;
  /** Snittet av |justering| over alle budstillinger prøven så. */
  snittJustering: number;
  /** Antall budstillinger der justeringen i det hele tatt var ulik null. */
  justeringFyrte: number;
  /** Noen få eksempler, for å kunne se HVA som endret seg. */
  eksempler: string[];
}

/**
 * PRØVE A. Kjører hele armen og teller avvikene.
 *
 * Den ferske agenten bygges uten økt og uten oppvarming, og får bare
 * målrundens stillinger. `Profilbok.observer` krever `RUNDE_SLUTT` for å lære,
 * og den fasen finnes ikke i reprisen — så den ferske forblir fersk hele veien.
 */
export function prøveA(opts: {
  spek: string;
  medØkt: boolean;
  giv: number;
  frøBase: number;
  målRunde: number;
  tikk: boolean;
  fokus?: number;
  forkamper?: number;
  /** Se `spillOgTaOpp`: de tre andre setenes spek, og tikk gjennom `observer`. Av = som før. */
  andre?: string;
  observerTikk?: boolean;
}): MinneMål {
  const fokus = opts.fokus ?? 0;
  const ut: MinneMål = {
    giv: 0,
    n: 0,
    avvik: 0,
    avvikBud: 0,
    avvikSpill: 0,
    bokførte: [0, 0, 0, 0],
    aggressivitet: [null, null, null, null],
    maksJustering: 0,
    snittJustering: 0,
    justeringFyrte: 0,
    eksempler: [],
  };
  let justSum = 0;
  let justN = 0;
  for (let g = 0; g < opts.giv; g++) {
    const frø = opts.frøBase + g * 7717;
    const o = spillOgTaOpp(
      opts.spek,
      opts.medØkt,
      frø,
      opts.målRunde,
      opts.tikk,
      fokus,
      opts.forkamper ?? 0,
      undefined,
      {
        ...(opts.andre === undefined ? {} : { andre: opts.andre }),
        ...(opts.observerTikk === undefined ? {} : { observerTikk: opts.observerTikk }),
      },
    );
    if (o.nådd < opts.målRunde || o.stillinger.length === 0) continue;
    ut.giv++;
    if (o.bok !== null) {
      for (let s = 0; s < 4; s++) ut.bokførte[s] = Math.max(ut.bokførte[s]!, o.bok.runder(s));
    }
    if (o.økt !== null) {
      for (let s = 0; s < 4; s++) {
        const a = o.økt.aggressivitet(s);
        if (a !== null) ut.aggressivitet[s] = a;
      }
    }
    // REPRISEN: samme stillinger, fersk hukommelse.
    const fersk = lagIndre(opts.spek) as Spekagent;
    fersk.nyKamp();
    for (let i = 0; i < o.stillinger.length; i++) {
      const s = o.stillinger[i]!;
      if (o.bok !== null && s.fase === "BUDRUNDE") {
        const j = Math.abs(o.bok.justering(s));
        justSum += j;
        justN++;
        if (j > ut.maksJustering) ut.maksJustering = j;
        if (j > 0) ut.justeringFyrte++;
      }
      const f = navn(fersk.velgHandling(s));
      ut.n++;
      if (f !== o.valg[i]) {
        ut.avvik++;
        if (s.fase === "SPILL") ut.avvikSpill++;
        else ut.avvikBud++;
        if (ut.eksempler.length < 8) {
          ut.eksempler.push(
            `froe ${frø} runde ${s.rundeNr + 1} ${s.fase}: fersk ${f}, mett ${o.valg[i]}`,
          );
        }
      }
    }
  }
  ut.snittJustering = justN === 0 ? 0 : justSum / justN;
  return ut;
}

// =============== HVORFOR BUDKANALEN ER FOR SVAK, LEDD FOR LEDD =============

/**
 * DEKOMPONERINGEN AV `Profilbok.justering`.
 *
 * Prøve A måler at budkanalen ikke snur noe valg, og positivkontrollen måler
 * hvor mye som trengs. Ingen av dem sier HVORFOR forskyvningen er så liten.
 * Denne fila gjør det, og den regner ikke om formelen — den plukker den fra
 * hverandre i de leddene den faktisk består av:
 *
 *     avvik = (evForsvarMot(p, B) − befolkningens forsvarsverdi) · tiltro
 *           = (2B/3) · (pop_klarte − krymp(klarte)) · tiltro
 *
 * og `krymp(a, pop, k) − pop = tiltro · (snitt(a) − pop)` per definisjon.
 * Altså:
 *
 *     avvik = (2B/3) · tiltro² · (pop_klarte − snitt_klarte)
 *
 * TILTROEN STÅR TO GANGER. Én gang inne i `krymp`, som er hele grunnen til at
 * `krymp` finnes, og én gang til utenpå. Det er ikke en forsiktig knott — det
 * er den samme forsiktigheten talt to ganger, og den koster en faktor
 * `tiltro` som ingen har bedt om.
 *
 * Denne funksjonen måler de tre leddene hver for seg, på ekte budstillinger fra
 * en ekte kamp, slik at «for svak» kan tilskrives et av dem i stedet for
 * gjettes.
 */
export interface JustLedd {
  readonly rundeNr: number;
  /** Hvem lå høyest da vi skulle by, eller `null` om ingen hadde bydd. */
  readonly høyest: number | null;
  readonly høyestBud: number;
  /** Observasjoner av «klarte» for det setet — bare runder det VANT budet. */
  readonly klarteN: number;
  /** Observerte runder totalt for det setet. */
  readonly runderN: number;
  readonly tiltro: number;
  /** Det `Profilbok.justering` faktisk ga. */
  readonly just: number;
  /** Samme tall med tiltroen talt ÉN gang, altså uten dobbeltkrympingen. */
  readonly justEnkel: number;
  /** Traff `MAKS_UTSLAG` i noen av de to? */
  readonly klippet: boolean;
  readonly klippetEnkel: boolean;
}

export interface BudkanalDiagnose {
  /** Budbeslutninger fokussetet tok i hele kampen. */
  n: number;
  /** …der INGEN annen hadde bydd. `justering` gir 0 per konstruksjon. */
  ingenAnnenBod: number;
  /** …der noen hadde bydd, men vi aldri hadde sett ham vinne et bud. */
  ingenTiltro: number;
  /** …der justeringen faktisk var ulik null. */
  fyrte: number;
  klippet: number;
  klippetEnkel: number;
  maks: number;
  snittAbs: number;
  maksEnkel: number;
  snittAbsEnkel: number;
  /** Tiltroen i de stillingene der kanalen fikk fyre. */
  tiltroer: number[];
  ledd: JustLedd[];
}

/**
 * Regner ut `justering` slik den er, og slik den ville vært med tiltroen talt
 * én gang, av BOKAS EGEN tilstand i stillingen. Ingen omskriving av formelen —
 * bare de samme tallene, hentet fra `profilFor`.
 */
function leddIStilling(bok: Profilbok, s: GameState): JustLedd | null {
  if (s.fase !== "BUDRUNDE") return null;
  let høyest: number | null = null;
  let høyestBud = 0;
  for (let p = 0; p < s.antallSpillere; p++) {
    if (p === s.iTur) continue;
    const b = s.budrunde.sisteBud[p];
    if (typeof b === "number" && b > høyestBud) {
      høyestBud = b;
      høyest = p;
    }
  }
  const just = bok.justering(s);
  if (høyest === null) {
    return {
      rundeNr: s.rundeNr,
      høyest: null,
      høyestBud: 0,
      klarteN: 0,
      runderN: 0,
      tiltro: 0,
      just,
      justEnkel: just,
      klippet: false,
      klippetEnkel: false,
    };
  }
  const p = bok.profilFor(høyest);
  const t = tiltro(p.klarte);
  // (2B/3)·(pop − krymp) — nøyaktig «evForsvarMot minus befolkningens».
  const rått = ((2 * høyestBud) / 3) * (BEFOLKNING.klarte - krymp(p.klarte, BEFOLKNING.klarte));
  const enkel = Math.max(-MAKS_UTSLAG, Math.min(MAKS_UTSLAG, rått));
  return {
    rundeNr: s.rundeNr,
    høyest,
    høyestBud,
    klarteN: p.klarte.n,
    runderN: bok.runder(høyest),
    tiltro: t,
    just,
    justEnkel: enkel,
    klippet: Math.abs(rått * t) >= MAKS_UTSLAG - 1e-12,
    klippetEnkel: Math.abs(rått) >= MAKS_UTSLAG - 1e-12,
  };
}

/**
 * Spiller forkamper + én målkamp og dekomponerer HVER budbeslutning
 * fokussetet tar, med boka slik den faktisk sto i det øyeblikket.
 *
 * Det er en bredere prøve enn prøve A, med vilje: prøve A ser bare målrunden,
 * og fikk tre stillinger med ulik-null justering av seks giv. Tre stillinger
 * kan ikke bære en forklaring.
 */
export function budkanalDiagnose(opts: {
  giv: number;
  frøBase: number;
  målRunde: number;
  forkamper: number;
  fokus?: number;
}): BudkanalDiagnose {
  const fokus = opts.fokus ?? 0;
  const ut: BudkanalDiagnose = {
    n: 0,
    ingenAnnenBod: 0,
    ingenTiltro: 0,
    fyrte: 0,
    klippet: 0,
    klippetEnkel: 0,
    maks: 0,
    snittAbs: 0,
    maksEnkel: 0,
    snittAbsEnkel: 0,
    tiltroer: [],
    ledd: [],
  };
  let sum = 0;
  let sumEnkel = 0;

  for (let g = 0; g < opts.giv; g++) {
    const frø = opts.frøBase + g * 7717;
    const økt = new Økt();
    const stakker = [0, 1, 2, 3].map(() => lagIndre(A_MINNE, { økt }) as Spekagent);
    const bok = økt.bok;

    const énKamp = (kampFrø: number, mål: boolean): void => {
      for (const st of stakker) st.nyKamp();
      let s: GameState = opprettSpill({ antallSpillere: 4 }, kampFrø);
      let vakt = 0;
      while (s.fase !== "FERDIG" && vakt++ < 200_000) {
        if (s.fase === "RUNDE_SLUTT") {
          if (mål && s.rundeNr >= opts.målRunde) break;
          for (const st of stakker) {
            try {
              st.velgHandling(s);
            } catch {
              /* tomt med vilje */
            }
          }
          s = utfør(s, { type: "NESTE" }).state;
          continue;
        }
        const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
        if (iTur === null || iTur === undefined) break;
        if (mål && iTur === fokus && s.fase === "BUDRUNDE") {
          const l = leddIStilling(bok, s);
          if (l !== null) {
            ut.n++;
            ut.ledd.push(l);
            if (l.høyest === null) ut.ingenAnnenBod++;
            else if (l.tiltro <= 0) ut.ingenTiltro++;
            if (l.just !== 0) {
              ut.fyrte++;
              ut.tiltroer.push(l.tiltro);
            }
            if (l.klippet) ut.klippet++;
            if (l.klippetEnkel) ut.klippetEnkel++;
            sum += Math.abs(l.just);
            sumEnkel += Math.abs(l.justEnkel);
            if (Math.abs(l.just) > ut.maks) ut.maks = Math.abs(l.just);
            if (Math.abs(l.justEnkel) > ut.maksEnkel) ut.maksEnkel = Math.abs(l.justEnkel);
          }
        }
        s = utfør(s, stakker[iTur]!.velgHandling(s)).state;
      }
    };

    for (let k = 0; k < opts.forkamper; k++) énKamp(frø + 1_000_003 * (k + 1), false);
    énKamp(frø, true);
  }
  ut.snittAbs = ut.n === 0 ? 0 : sum / ut.n;
  ut.snittAbsEnkel = ut.n === 0 ? 0 : sumEnkel / ut.n;
  return ut;
}

/**
 * POSITIVKONTROLLEN — «kan prøven i det hele tatt SE at hukommelsen bet?»
 *
 * Måler minnearmen null avvik, er det to mulige forklaringer, og de er ikke i
 * nærheten av hverandre:
 *
 *   1. hukommelsen påvirker for lite til å snu et valg
 *   2. prøven greier ikke å oppdage at et valg ble snudd
 *
 * Nullarmen skiller dem ikke: den måler også null. Denne funksjonen gjør det.
 * Den bruker den EKTE lærte størrelsen — `Profilbok.justering`, tallet profilen
 * faktisk regnet ut av de faktisk observerte rundene — og ganger den med
 * `forsterk`. Ingenting annet endres.
 *
 * Kommer det avvik ved høy forsterkning og ingen ved 1, er svaret 1: prøven ser
 * hukommelsen fint, den er bare for svak. Kommer det ALDRI avvik, er prøven i
 * stykker og hele denne fila skal ikke leses som noe annet.
 *
 * Stakken bygges for hånd i stedet for med `profil:` fordi forsterkningen må
 * inn på `settForsvarsjustering`, og `Profilagent` setter den selv i
 * konstruktøren uten en vei til å endre den etterpå. Det som bygges er ellers
 * nøyaktig `profil:budm:…`: samme bok, samme `justering`, samme observasjon.
 */
export function forsterketStakk(
  forsterk: number,
  bok: Profilbok,
  modus: "ekte" | "flat" = "flat",
): Agent {
  const bud = lagIndre(BASE_DET) as Spekagent & {
    settForsvarsjustering(f: ((s: GameState) => number) | null): void;
  };
  if (typeof bud.settForsvarsjustering !== "function") {
    throw new Error(
      `«${BASE_DET}» ga ingen budagent med settForsvarsjustering - positivkontrollen ` +
        `ville da maalt null uten at det betydde noe`,
    );
  }
  /**
   * TO MODUSER, FORDI DEN FØRSTE IKKE STRAKK TIL.
   *
   * «ekte» ganger opp `Profilbok.justering` slik den er. Første kjøring målte
   * null avvik helt opp til 50x — men grunnen var ikke at prøven var blind:
   * `justering` returnerer 0 så snart INGEN ANNEN har bydd ennå, og det gjaldt
   * fem av seks budstillinger prøven fikk se. Kontrollen fikk knapt anledning
   * til å fyre.
   *
   * «flat» fjerner den anledningsbegrensningen uten å finne opp hukommelse:
   * forskyvningen er `forsterk` når boka HAR lært noe og eksakt 0 når den er
   * tom. Den er dermed fortsatt en ren funksjon av hukommelsen — en fersk
   * agent får nøyaktig null — men den fyrer på hver eneste budbeslutning.
   *
   * Det er «flat» som svarer på spørsmålet kontrollen finnes for: KAN prøven
   * se at et valg snudde? «ekte» svarer på et annet, som prøve A selv svarer
   * bedre på.
   */
  const lært = (): boolean => {
    for (let p = 0; p < 4; p++) if (bok.runder(p) > 0) return true;
    return false;
  };
  bud.settForsvarsjustering((s) =>
    modus === "ekte"
      ? forsterk * bok.justering(s)
      : s.fase === "BUDRUNDE" && lært()
        ? forsterk
        : 0,
  );
  return {
    velgHandling: (s: GameState): Handling => {
      bok.observer(s);
      return bud.velgHandling(s);
    },
    nyKamp: () => bud.nyKamp(),
  };
}

export interface ForsterkPunkt {
  forsterk: number;
  n: number;
  avvik: number;
}

/**
 * Sveiper forsterkningen og finner det minste nivået der ETT valg snur.
 *
 * Tallet som kommer ut er svaret på «hvor langt unna er hukommelsen fra å
 * bety noe»: forsterkning 20 betyr at profilen måtte vært tjue ganger så
 * bestemt før den flyttet én eneste beslutning.
 */
export function prøveAForsterket(opts: {
  giv: number;
  frøBase: number;
  målRunde: number;
  forkamper: number;
  nivåer: readonly number[];
  fokus?: number;
  modus?: "ekte" | "flat";
}): ForsterkPunkt[] {
  const fokus = opts.fokus ?? 0;
  const modus = opts.modus ?? "flat";
  const ut: ForsterkPunkt[] = opts.nivåer.map((f) => ({ forsterk: f, n: 0, avvik: 0 }));

  for (let g = 0; g < opts.giv; g++) {
    const frø = opts.frøBase + g * 7717;
    for (const punkt of ut) {
      // ÉN økt per nivå, slik at bare forsterkningen skiller kjøringene.
      const økt = new Økt();
      const stakker = [0, 1, 2, 3].map(() =>
        punkt.forsterk === 0
          ? (lagIndre(BASE_DET) as Spekagent)
          : forsterketStakk(punkt.forsterk, økt.bok, modus),
      );
      const stillinger: GameState[] = [];
      const valg: string[] = [];
      const énKamp = (kampFrø: number, taOpp: boolean): number => {
        for (const st of stakker) st.nyKamp();
        let s: GameState = opprettSpill({ antallSpillere: 4 }, kampFrø);
        let vakt = 0;
        while (s.fase !== "FERDIG" && vakt++ < 200_000) {
          if (s.fase === "RUNDE_SLUTT") {
            if (taOpp && s.rundeNr >= opts.målRunde) break;
            for (const st of stakker) {
              try {
                st.velgHandling(s);
              } catch {
                /* tomt med vilje */
              }
            }
            s = utfør(s, { type: "NESTE" }).state;
            continue;
          }
          const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
          if (iTur === null || iTur === undefined) break;
          const h = stakker[iTur]!.velgHandling(s);
          if (taOpp && iTur === fokus && s.rundeNr === opts.målRunde) {
            stillinger.push(s);
            valg.push(navn(h));
          }
          s = utfør(s, h).state;
        }
        return s.rundeNr;
      };
      for (let k = 0; k < opts.forkamper; k++) énKamp(frø + 1_000_003 * (k + 1), false);
      const nådd = énKamp(frø, true);
      if (nådd < opts.målRunde) continue;
      const fersk = lagIndre(A_MINNE) as Spekagent;
      fersk.nyKamp();
      for (let i = 0; i < stillinger.length; i++) {
        punkt.n++;
        if (navn(fersk.velgHandling(stillinger[i]!)) !== valg[i]) punkt.avvik++;
      }
    }
  }
  return ut;
}

/**
 * KANALEN INN I KORTSPILLET — A2, `Økt.motpartFor`.
 *
 * Den deterministiske stakken i prøve A har ingen `amu:`, så hukommelsen kan
 * per konstruksjon bare røre BUDET der. Null avvik i kortspillet er derfor
 * ikke en måling — det følger av oppsettet, og å rapportere det som et funn
 * ville vært å telle en tom kolonne som bevis.
 *
 * Den andre kanalen er `motpartFor`, som gir alpha-mu én rollout-policy per
 * motstander. Å måle den gjennom agenten ville dratt inn agentens RNG-posisjon,
 * som de sju rundene har flyttet — altså nøyaktig den forvekslingen prøven
 * ellers er bygd for å unngå.
 *
 * Derfor måles den ETT NIVÅ NED: samme stilling, samme trukne verdener, samme
 * `alphaMu` — bare to ulike rollout-motparter. Da er RNG-en bit-identisk i
 * begge armene, og alt som skiller dem er det økten lærte.
 */
export interface A2Mål {
  /** Antall kortstillinger prøvd. */
  n: number;
  /** Antall der motstandermodellen ga et ANNET kort. */
  endret: number;
  /**
   * NULLARMEN: samme stilling, samme verdener, men BASIS mot BASIS.
   *
   * Den må være eksakt 0. `alphaMu` er deterministisk gitt verdenene, så to
   * identiske motparter må gi identisk kort — og gjør de ikke det, måler
   * `endret` ustabilitet i søket og ikke hukommelse.
   */
  endretNull: number;
  /** Antall seter der `motpartFor` i det hele tatt ga noe annet enn basis. */
  vridde: number;
  /** Antall setesjekker (4 per giv), så `vridde` kan leses som en andel. */
  seteSjekker: number;
  aggressivitet: (number | null)[];
}

export function prøveA2(opts: {
  giv: number;
  frøBase: number;
  målRunde: number;
  forkamper: number;
  verdener: number;
  kandidater: number;
  maksPerGiv: number;
  fokus?: number;
  /** Setet som har en utnyttbar vane. Uten den er det ingenting aa laere. */
  vaneSete?: number;
}): A2Mål {
  const fokus = opts.fokus ?? 0;
  const ut: A2Mål = {
    n: 0,
    endret: 0,
    endretNull: 0,
    vridde: 0,
    seteSjekker: 0,
    aggressivitet: [null, null, null, null],
  };
  const basis = lagIndre(ADAMS_MAALT) as unknown as Utspiller;
  // NULLARMENS «modell»: en oekt som aldri har sett en runde. `motpartFor` gir
  // da basis uendret per konstruksjon, og ruteren er en identitetsfunksjon.
  const tom = new Økt();

  for (let g = 0; g < opts.giv; g++) {
    const frø = opts.frøBase + g * 7717;
    const o = spillOgTaOpp(
      A_MINNE, true, frø, opts.målRunde, true, fokus, opts.forkamper, opts.vaneSete,
    );
    if (o.økt === null || o.nådd < opts.målRunde) continue;
    const økt = o.økt;
    for (let s = 0; s < 4; s++) {
      ut.seteSjekker++;
      const a = økt.aggressivitet(s);
      if (a !== null) ut.aggressivitet[s] = a;
      if (økt.motpartFor(basis, s) !== basis) ut.vridde++;
    }
    const lagRuter = (kilde: Økt): Utspiller => ({
      velgHandling: (s: GameState): Handling => {
        const p = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
        return (p === null || p === undefined ? basis : kilde.motpartFor(basis, p)).velgHandling(s);
      },
    });
    const ruter = lagRuter(økt);
    const ruterNull = lagRuter(tom);
    let iGiv = 0;
    for (const s of o.stillinger) {
      if (iGiv >= opts.maksPerGiv) break;
      if (s.fase !== "SPILL" || s.iTur !== fokus) continue;
      if (lovligeKort(s, fokus).length < 2) continue;
      const rng = lagRng(600_000 + g * 41);
      const verdener = trekkVerdener(s, fokus, opts.verdener, rng, undefined, undefined, opts.kandidater);
      if (verdener.length < 2) continue;
      const uten = alphaMu(s, fokus, verdener, { M: 1, mål: standardMål, motpart: basis });
      const med = alphaMu(s, fokus, verdener, { M: 1, mål: standardMål, motpart: ruter });
      const null0 = alphaMu(s, fokus, verdener, { M: 1, mål: standardMål, motpart: ruterNull });
      if (uten.length === 0 || med.length === 0 || null0.length === 0) continue;
      ut.n++;
      iGiv++;
      const b1 = beste(uten);
      const b2 = beste(med);
      const b0 = beste(null0);
      if (b1.kort.farge !== b2.kort.farge || b1.kort.verdi !== b2.kort.verdi) ut.endret++;
      if (b1.kort.farge !== b0.kort.farge || b1.kort.verdi !== b0.kort.verdi) ut.endretNull++;
    }
  }
  return ut;
}

/**
 * STRUKTURPRØVEN: NÅR `okt:` FAKTISK GJENNOM SPEKEN?
 *
 * `lagIndre` sender konteksten nedover, men ikke gjennom alle lag. `vr:` bygger
 * sitt indre lag med `lagIndre(rest)` — uten `ctx`. Alt under `vr:` får dermed
 * en TOM kontekst, og både `profil:` og `amu:` mister økten.
 *
 * ADAMS_V6 og ADAMS_V7 begynner med nettopp `okt:vr:…`.
 *
 * Denne funksjonen avgjør det uten tolkning: gi speken MIN økt, spill noen
 * runder med tikk, og se om boka fikk noe i seg. Er den tom, ble økten aldri
 * levert til laget som lærer.
 */
export function øktNåesGjennom(spek: string, frø = 4_100_000, runder = 4): number {
  const økt = new Økt();
  const agent = lagIndre(spek, { økt }) as Spekagent;
  const miljø = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT) as Spekagent);
  agent.nyKamp();
  for (const m of miljø) m.nyKamp();
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.rundeNr < runder && vakt++ < 200_000) {
    if (s.fase === "RUNDE_SLUTT") {
      try {
        agent.velgHandling(s);
      } catch {
        /* tomt med vilje */
      }
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, (iTur === 0 ? agent : miljø[iTur]!).velgHandling(s)).state;
  }
  let sum = 0;
  for (let p = 0; p < 4; p++) sum += økt.bok.runder(p);
  return sum;
}

/**
 * ER SPEKEN DETERMINISTISK? — forutsetningen prøve A hviler på, målt og ikke antatt.
 *
 * Prøve A sammenlikner en METT agent (sju runder bak seg) med en FERSK. Har speken et
 * søk med vedvarende RNG (`sik:`, `amu:`, budsøket), er RNG-posisjonen flyttet av de sju
 * rundene, og «fersk mot mett» måler RNG-posisjon like gjerne som hukommelse. Nullarmen
 * vil da vise avvik, og raden blir STUM — riktig, men uten å si hvorfor.
 *
 * Denne funksjonen sier hvorfor: ÉN agent, kalt TO ganger på rad på samme tilstand, i
 * fokussetets egne budrunde-, vrak- og kortstillinger. Er svarene ulike, er agenten ikke
 * en funksjon av tilstanden. Null ulikheter på et lite utvalg er ikke et bevis — derfor
 * rapporteres også om speken HAR søkelag (`harSøk`). Kuren er agent A sitt
 * deterministiske per-beslutning-frø for `sik`.
 *
 * VELG hoppes over med vilje: `Vrakrangerer` bruker den lagrede trumfen i første kall
 * og faller gjennom i det andre. Det er flerstegstilstand, ikke tilfeldighet.
 */
export function erDeterministisk(
  spek: string,
  giv = 2,
  frøBase = 4_700_000,
  fokus = 0,
): { kall: number; ulike: number; eksempler: string[] } {
  const ut = { kall: 0, ulike: 0, eksempler: [] as string[] };
  for (let g = 0; g < giv; g++) {
    const agent = lagIndre(spek) as Spekagent;
    const miljø = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT) as Spekagent);
    agent.nyKamp();
    for (const m of miljø) m.nyKamp();
    let s: GameState = opprettSpill({ antallSpillere: 4 }, frøBase + g * 7717);
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      let h: Handling;
      if (iTur === fokus && s.fase !== "VELG") {
        h = agent.velgHandling(s);
        const igjen = agent.velgHandling(s);
        ut.kall++;
        if (navn(h) !== navn(igjen)) {
          ut.ulike++;
          if (ut.eksempler.length < 4) {
            ut.eksempler.push(`froe ${frøBase + g * 7717} ${s.fase} stikk ${s.stikkSpilt}: ${navn(h)} så ${navn(igjen)}`);
          }
        }
      } else {
        h = (iTur === fokus ? agent : miljø[iTur]!).velgHandling(s);
      }
      s = utfør(s, h).state;
    }
  }
  return ut;
}

// ======================= PRØVE B — FRAMOVERBLIKKET =========================

export interface FramMål {
  /** Antall stillinger der begge dybdene fikk søke. */
  n: number;
  /** Antall stillinger der M=2 valgte et ANNET kort enn M=1. */
  uenig: number;
  /** Dommerens differanse (M=2 minus M=1) i hver uenighet. GRUNN dommer, M=1. */
  diff: number[];
  /**
   * SAMME uenighet, dømt av en DYP dommer (M=2) på de samme friske verdenene.
   *
   * Den grunne dommeren er strukturelt konservativ i M=2s disfavør: den kan
   * ikke se verdien av en plan som først betaler seg to av EGNE valg fram, og
   * det er nøyaktig den verdien M=2 påstår at den finner. Å dømme M=2 med en
   * dommer som per konstruksjon ikke kan se det den gjør, er å måle noe annet
   * enn spørsmålet.
   *
   * Den dype dommeren er ikke sirkulær: verdenene er FRISKE og trukket med et
   * uavhengig frø, så begge kortene er utenfor utvalget til begge søkene.
   * Den deler riktignok algoritmisk skjevhet med M=2-søket, og derfor står
   * BEGGE tallene. Samme fortegn i begge er et funn; ulikt fortegn er en
   * beskjed om at fortegnet avhenger av dommeren, og da er ingenting vist.
   */
  diffDyp: number[];
  msM1: number;
  msM2: number;
}

/**
 * PRØVE B. Måler tre ting om M=2, i økende styrke:
 *
 *   1. KOSTER DEN MER?     Er tiden lik, søker den ikke dypere i det hele tatt.
 *   2. FYRER DEN?          Velger den noen gang et annet kort enn M=1? Gjør den
 *                          ikke det, er dybden dekorasjon uansett hva den koster.
 *   3. ER DEN BEDRE?       Der de er uenige: hvilket kort er best?
 *
 * ============================ DOMMEREN ==================================
 *
 * Punkt 3 kan ikke avgjøres av søkene selv — hver av dem mener sitt eget kort
 * er best, per konstruksjon. Derfor trekkes et FRISKT sett verdener med et
 * uavhengig frø, og begge kandidatkort evalueres i NØYAKTIG de samme verdenene.
 *
 * Begge kort er dermed UTENFOR UTVALGET til begge søkene. Det er poenget: et
 * søk som overtilpasser seg sine egne trukne verdener ser bra ut i dem og faller
 * tilbake i friske. Det er vinnerens forbannelse, og den rammer M=1 og M=2 likt
 * her.
 *
 * BEGRENSNINGEN SKAL STÅ: dommeren er selv et M=1-oppspill. Den kan ikke se
 * verdien av en plan som først betaler seg to av EGNE valg fram, og den er
 * derfor konservativ i M=2s disfavør. En dommer med større dybde er riktigere,
 * men koster mer enn budsjettet for denne kjøringen.
 */
export function prøveB(opts: {
  giv: number;
  frøBase: number;
  verdener: number;
  kandidater: number;
  dommerVerdener: number;
  maksPerGiv: number;
  fraStikk: number;
  fokus?: number;
}): FramMål {
  const fokus = opts.fokus ?? 0;
  const ut: FramMål = { n: 0, uenig: 0, diff: [], diffDyp: [], msM1: 0, msM2: 0 };
  const motpart = lagIndre(ADAMS_MAALT) as unknown as Utspiller;

  for (let g = 0; g < opts.giv; g++) {
    const frø = opts.frøBase + g * 7717;
    const drivere = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT) as Spekagent);
    for (const d of drivere) d.nyKamp();
    let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
    let vakt = 0;
    let iGiv = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
      if (
        iGiv < opts.maksPerGiv &&
        s.fase === "SPILL" &&
        s.iTur === fokus &&
        s.stikkSpilt >= opts.fraStikk &&
        lovligeKort(s, fokus).length >= 2
      ) {
        const rngS = lagRng(500_000 + g * 97);
        const verdener = trekkVerdener(s, fokus, opts.verdener, rngS, undefined, undefined, opts.kandidater);
        if (verdener.length >= 2) {
          const t0 = performance.now();
          const g1 = alphaMu(s, fokus, verdener, { M: 1, mål: standardMål, motpart });
          const t1 = performance.now();
          const g2 = alphaMu(s, fokus, verdener, { M: 2, mål: standardMål, motpart });
          const t2 = performance.now();
          if (g1.length >= 2 && g2.length >= 2) {
            ut.n++;
            iGiv++;
            ut.msM1 += t1 - t0;
            ut.msM2 += t2 - t1;
            const k1 = beste(g1).kort;
            const k2 = beste(g2).kort;
            if (k1.farge !== k2.farge || k1.verdi !== k2.verdi) {
              ut.uenig++;
              // DOMMEREN: friske verdener, felles for begge kandidatene.
              const rngD = lagRng(900_000 + g * 131 + ut.n);
              const dv = trekkVerdener(s, fokus, opts.dommerVerdener, rngD, undefined, undefined, opts.kandidater);
              if (dv.length >= 2) {
                const gd = alphaMu(s, fokus, dv, { M: 1, mål: standardMål, motpart });
                const d1 = gd.find((x) => x.kort.farge === k1.farge && x.kort.verdi === k1.verdi);
                const d2 = gd.find((x) => x.kort.farge === k2.farge && x.kort.verdi === k2.verdi);
                if (d1 !== undefined && d2 !== undefined) {
                  ut.diff.push(snitt(d2.vektor) - snitt(d1.vektor));
                }
                // DEN DYPE DOMMEREN, samme friske verdener, M=2.
                const gdD = alphaMu(s, fokus, dv, { M: 2, mål: standardMål, motpart });
                const e1 = gdD.find((x) => x.kort.farge === k1.farge && x.kort.verdi === k1.verdi);
                const e2 = gdD.find((x) => x.kort.farge === k2.farge && x.kort.verdi === k2.verdi);
                if (e1 !== undefined && e2 !== undefined) {
                  ut.diffDyp.push(snitt(e2.vektor) - snitt(e1.vektor));
                }
              }
            }
          }
        }
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      s = utfør(s, drivere[iTur]!.velgHandling(s)).state;
    }
  }
  return ut;
}

// ============================== KJØRINGEN ==================================

const erHovedmodul =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (erHovedmodul && !process.argv.includes("--spek")) {
  let giv = 6;
  /**
   * EGET GIVTALL FOR PRØVE B, fordi de to prøvene har helt ulik flaskehals.
   *
   * Prøve A koster tre KAMPER per giv per arm — den skalerer med antall armer.
   * Prøve B koster to alpha-mu-søk per STILLING, og trenger mange stillinger
   * fordi bare uenighetene bærer informasjon (målt: 11 % av stillingene).
   * Å binde dem til samme tall gjør enten A for dyr eller B for svak.
   */
  let givB = 10;
  /**
   * EGET GIVTALL FOR RESPONSKURVEN. Den koster tre kamper per NIVÅ per giv, og
   * har ti nivåer — å binde den til `--giv` gjør enten kurven grov eller
   * budkanalmålingen ti ganger dyrere enn den trenger å være.
   */
  let givS = 20;
  let frøBase = 4_400_000;
  let målRunde = 7; // runde 8, nullindeksert
  let ut = "analyse/k4-hukommelse.txt";
  let bare = "ab";
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]!;
    const v = process.argv[i + 1];
    if (a === "--giv") giv = tall(v, giv, "--giv");
    else if (a === "--givb") givB = tall(v, givB, "--givb");
    else if (a === "--givs") givS = tall(v, givS, "--givs");
    else if (a === "--froe") frøBase = tall(v, frøBase, "--froe");
    else if (a === "--maalrunde") målRunde = tall(v, målRunde, "--maalrunde");
    else if (a === "--ut") ut = v ?? ut;
    else if (a === "--bare") bare = v ?? bare;
  }

  const l: string[] = [];
  const si = (t: string): void => {
    l.push(t);
    process.stderr.write(`${t}\n`);
  };

  si(`# K4 — hukommelse og framoverblikk`);
  si(`# ${new Date().toISOString()}  giv=${giv} froe=${frøBase} maalrunde=${målRunde + 1}`);
  si("");

  if (bare.includes("a")) {
    si(`## PROEVE A — hukommelsen`);
    si(`Samme runde ${målRunde + 1}, samme stillinger. FERSK agent mot METT agent.`);
    si(`Stakken er deterministisk (${BASE_DET}) saa et avvik ikke kan komme fra RNG.`);
    si("");
    si(`| arm | tikk | forkamper | giv | n | avvik | bud | spill | bokfoert | maks just |`);
    si(`|---|---|---|---|---|---|---|---|---|---|`);
    const armer: { navn: string; spek: string; økt: boolean; forkamper: number }[] = [
      { navn: "NULL (ingen minne)", spek: A_NULL, økt: false, forkamper: 0 },
      { navn: "profil (kampminne)", spek: A_MINNE, økt: false, forkamper: 0 },
      { navn: "okt+profil", spek: A_MINNE, økt: true, forkamper: 0 },
      { navn: "profil, 2 forkamper", spek: A_MINNE, økt: false, forkamper: 2 },
      { navn: "okt+profil, 2 forkamper", spek: A_MINNE, økt: true, forkamper: 2 },
    ];
    const lagret: MinneMål[] = [];
    for (const arm of armer) {
      for (const tikk of arm.forkamper > 0 ? [true] : [false, true]) {
        const m = prøveA({
          spek: arm.spek,
          medØkt: arm.økt,
          giv,
          frøBase,
          målRunde,
          tikk,
          forkamper: arm.forkamper,
        });
        lagret.push(m);
        si(
          `| ${arm.navn} | ${tikk ? "ja" : "nei"} | ${arm.forkamper} | ${m.giv} | ${m.n} | ` +
            `${m.avvik} | ${m.avvikBud} | ${m.avvikSpill} | ` +
            `${m.bokførte.join("/")} | ${m.maksJustering.toFixed(3)} |`,
        );
      }
    }
    si("");
    const sisteØkt = lagret[lagret.length - 1]!;
    si(`## HVA HUKOMMELSEN FAKTISK BA OM (okt-armen med forkamper)`);
    si(`Profilen har ÉN kanal inn i beslutningen: «Profilbok.justering», som`);
    si(`forskyver budterskelen paa -3,0. Alt annet den vet er ubrukt.`);
    si(`  budstillinger der justeringen var ulik null: ${sisteØkt.justeringFyrte}`);
    si(`  snitt |justering|: ${sisteØkt.snittJustering.toFixed(4)} budpoeng`);
    si(`  maks  |justering|: ${sisteØkt.maksJustering.toFixed(4)} budpoeng`);
    si(`  til sammenlikning er terskelen den forskyver -3,0000`);
    si("");
    si(
      `  Oekt.aggressivitet per sete: ` +
        sisteØkt.aggressivitet.map((a) => (a === null ? "null" : a.toFixed(3))).join(", "),
    );
    si(`  null = under MIN_RUNDER=4. Da returnerer «motpartFor» basis UENDRET,`);
    si(`  og A2-motstandermodellen i alpha-mu er en identitetsfunksjon.`);
    si(`  TO tellere maa over 4, og de teller ulike ting:`);
    si(`    «runder(sete)» = profil.bud.n, altsaa runder setet faktisk BOD i.`);
    si(`    «trumfutspill.n» = runder setet var FORSVARER og ledet et stikk.`);
    si(`  Den andre er den bindende: over ser du at bud.n naar 4 etter sju`);
    si(`  runder, mens aggressiviteten fortsatt er null uten forkamper.`);
    si("");
    if (sisteØkt.eksempler.length > 0) {
      si(`Eksempler paa avvik:`);
      for (const e of sisteØkt.eksempler) si(`  ${e}`);
      si("");
    }

    si(`## POSITIVKONTROLL — kan proeven SE at hukommelsen bet?`);
    si(`Forskyvningen er «forsterk» naar boka HAR laert noe og eksakt 0 naar den`);
    si(`er tom. Fortsatt en ren funksjon av hukommelsen, men den fyrer paa hver`);
    si(`budbeslutning i stedet for paa de fem prosentene «justering» treffer.`);
    si(`Er alle radene 0, er det PROEVEN som er i stykker, ikke hukommelsen.`);
    si("");
    si(`| forskyvning | n | avvik |`);
    si(`|---|---|---|`);
    /**
     * NIVÅENE ER KUTTET TIL FIRE MED VILJE. Sveipet koster tre kamper per nivå
     * per giv og er den dyreste delen av hele fila. 0,25 → 0,5 → 1 → 8 spenner
     * over det som trengs: den ekte hukommelsen ba om under 0,51, og terskelen
     * der noe snur ligger mellom 0,5 og 1.
     */
    const nivåer = [0.25, 0.5, 1, 8];
    const sveip = prøveAForsterket({
      giv,
      frøBase,
      målRunde,
      forkamper: 2,
      nivåer,
      modus: "flat",
    });
    for (const p of sveip) si(`| ${p.forsterk} budpoeng | ${p.n} | ${p.avvik} |`);
    const foerste = sveip.find((p) => p.avvik > 0);
    si("");
    si(
      foerste === undefined
        ? `INGEN forskyvning ga avvik. Proeven kan ikke SE hukommelse, og alt over er ugyldig.`
        : `Minste forskyvning som snudde et valg: ${foerste.forsterk} budpoeng.\n` +
            `Den EKTE hukommelsen ba om maks ${sisteØkt.maksJustering.toFixed(3)} - altsaa ` +
            `${(foerste.forsterk / Math.max(1e-9, sisteØkt.maksJustering)).toFixed(1)}x for lite.`,
    );
    si("");

    si(`## PROEVE A2 — kanalen inn i KORTSPILLET (Oekt.motpartFor, A2)`);
    si(`Samme stilling, samme trukne verdener, samme alphaMu. Eneste forskjell:`);
    si(`om rollout-motparten er basis eller den oekten laerte. RNG er bit-identisk.`);
    si("");
    si(`| forkamper | n | vridde seter | NULLARM (maa vaere 0) | kortvalg endret |`);
    si(`|---|---|---|---|---|`);
    let a2Med: A2Mål | null = null;
    for (const fk of [0, 2]) {
      const a2 = prøveA2({
        giv: Math.min(giv, 4),
        frøBase,
        målRunde,
        forkamper: fk,
        verdener: 12,
        kandidater: 16,
        maksPerGiv: 3,
      });
      if (fk === 2) a2Med = a2;
      si(
        `| ${fk} | ${a2.n} | ${a2.vridde}/${a2.seteSjekker} | ${a2.endretNull} | ` +
          `${a2.endret} (${((100 * a2.endret) / Math.max(1, a2.n)).toFixed(0)} %) |`,
      );
    }
    si("");
    si(`FORUTSETNINGEN BRUTT: raden med 0 forkamper er den samme proeven paa en oekt`);
    si(`som ikke rekker over MIN_RUNDER. Er den ogsaa null, sier proeven «ingen`);
    si(`hukommelse» naar det ikke er noen - og da betyr raden under noe.`);
    if (a2Med !== null) {
      si(
        `  aggressivitet per sete (2 forkamper): ` +
          a2Med.aggressivitet.map((x) => (x === null ? "null" : x.toFixed(3))).join(", "),
      );
    }
    si("");

    si(`## STRUKTUR — naar «okt:» faktisk gjennom speken?`);
    si(`Antall bokfoerte runder i MIN oekt etter 4 runder, per plassering:`);
    const strukt: [string, string][] = [
      ["profil rett paa budm", A_MINNE],
      ["profil bak vr:", `vr:e1-modell/vrakrang.bin:telrd:${A_MINNE}`],
    ];
    for (const [merkelapp, spek] of strukt) {
      si(`  ${merkelapp.padEnd(24)} ${øktNåesGjennom(spek)}`);
    }
    si(`  ADAMS_V6/V7 er «okt:vr:…», altsaa den nederste raden.`);
    si("");
  }

  /**
   * BUDKANALEN ALENE, MED NOK GIV TIL AT SPØRSMÅLET KAN BESVARES.
   *
   * `--bare a` kjører åtte armer og et sveip, og har derfor råd til seks giv.
   * Seks giv gir 87 beslutninger, men bare tre av dem er budstillinger der
   * justeringen i det hele tatt er ulik null — og et valg snur bare når
   * forskyvningen lander nær en beslutningsgrense. «Null avvik av tre
   * anledninger» er ikke et svar på om kanalen biter; det er et svar på at
   * prøven ikke fikk spurt.
   *
   * Denne seksjonen kjører DEN ENE armen som betyr noe (okt + profil, tikk, to
   * forkamper) med så mange giv som CLI-en får lov til å be om, og rapporterer
   * hvor mange ANLEDNINGER kanalen fikk — ikke bare hvor mange den brukte.
   */
  if (bare.includes("k")) {
    si(`## BUDKANALEN ALENE — samme arm, mange giv`);
    si(`okt+profil, tikk, to forkamper. Den ENESTE armen der hukommelsen baade`);
    si(`har rukket aa laere noe og har en vei inn i budet.`);
    si("");
    const k = prøveA({
      spek: A_MINNE,
      medØkt: true,
      giv,
      frøBase,
      målRunde,
      tikk: true,
      forkamper: 2,
    });
    si(`giv som naadde maalrunden:    ${k.giv}`);
    si(`beslutninger sammenliknet:    ${k.n}`);
    si(`bokfoerte runder per sete:    ${k.bokførte.join("/")}`);
    si(`budstillinger med just != 0:  ${k.justeringFyrte}   <- ANLEDNINGENE`);
    si(`snitt |justering|:            ${k.snittJustering.toFixed(4)} budpoeng`);
    si(`maks  |justering|:            ${k.maksJustering.toFixed(4)} budpoeng`);
    si("");
    si(`AVVIK (fersk mot mett):       ${k.avvik}  (bud ${k.avvikBud}, spill ${k.avvikSpill})`);
    for (const e of k.eksempler) si(`  ${e}`);
    si("");
  }

  /**
   * RESPONSKURVEN — HVOR FØLSOM ER BUDBESLUTNINGEN I DET HELE TATT?
   *
   * Positivkontrollen i `--bare a` svarer «ja» på om prøven KAN se en snudd
   * beslutning, og det er den jobben den har. Men de fire punktene sa noe mer
   * som ingen fulgte opp: 1 budpoeng snudde 2 av 87, og 8 budpoeng snudde 5.
   * Åtte ganger så hard dytt ga altså 2,5 ganger så mange snudde valg.
   *
   * Det er et utsagn om BUDMODELLEN, ikke om hukommelsen: om beslutningen
   * ligger langt fra sin egen grense i nesten hver stilling, kan ingen
   * realistisk hukommelse flytte mange valg gjennom denne kanalen — og da er
   * «hukommelsen er for svak» feil diagnose på riktig symptom.
   *
   * Kurven avgjør det. Flater den ut, er kanalen strukturelt lavgiret.
   */
  if (bare.includes("s")) {
    si(`## RESPONSKURVEN — hvor mye maa forsvarsverdien flyttes foer et valg snur?`);
    si(`Samme hukommelsesstyrte forskyvning som positivkontrollen, sveipet over`);
    si(`stoerre og stoerre nivaaer. Terskelen den forskyver er -3,0, saa 8`);
    si(`budpoeng er nesten TRE GANGER hele konstanten.`);
    si("");
    const nivåer = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 4, 8, 16];
    const sveip = prøveAForsterket({
      giv: givS,
      frøBase,
      målRunde,
      forkamper: 2,
      nivåer,
      modus: "flat",
    });
    si(`| forskyvning | n | avvik | andel |`);
    si(`|---|---|---|---|`);
    for (const p of sveip) {
      si(
        `| ${p.forsterk} budpoeng | ${p.n} | ${p.avvik} | ` +
          `${((100 * p.avvik) / Math.max(1, p.n)).toFixed(2)} % |`,
      );
    }
    si("");
    si(`NULLRADEN (0 budpoeng) MAA vaere 0 avvik: da er de to armene samme`);
    si(`funksjon. Er den ulik null, maaler hele sveipet noe annet enn styrke.`);
    si("");
  }

  if (bare.includes("d")) {
    si(`## DIAGNOSE — hvorfor budkanalen er for svak, ledd for ledd`);
    si(`Hver budbeslutning fokussetet tar i maalkampen, med boka slik den sto da.`);
    si("");
    const d = budkanalDiagnose({ giv, frøBase, målRunde, forkamper: 2 });
    si(`budbeslutninger:              ${d.n}`);
    si(
      `  ingen ANNEN hadde bydd:     ${d.ingenAnnenBod} ` +
        `(${((100 * d.ingenAnnenBod) / Math.max(1, d.n)).toFixed(0)} %) - «justering» gir 0 per konstruksjon`,
    );
    si(`  noen bod, men tiltro = 0:   ${d.ingenTiltro}`);
    si(
      `  justeringen fyrte:          ${d.fyrte} ` +
        `(${((100 * d.fyrte) / Math.max(1, d.n)).toFixed(0)} %)`,
    );
    si("");
    si(`| form | snitt \\|just\\| | maks \\|just\\| | klippet av MAKS_UTSLAG=${MAKS_UTSLAG} |`);
    si(`|---|---|---|---|`);
    si(`| «Profilbok.justering» slik den er | ${d.snittAbs.toFixed(4)} | ${d.maks.toFixed(4)} | ${d.klippet} |`);
    si(
      `| tiltroen talt EN gang, regnet for haand | ${d.snittAbsEnkel.toFixed(4)} | ` +
        `${d.maksEnkel.toFixed(4)} | ${d.klippetEnkel} |`,
    );
    si("");
    si(`RADENE ER EN SELVKONTROLL, ikke to varianter: den nederste er regnet ut`);
    si(`her i fila, av bokas egne tall, med tiltroen talt EN gang. Er de LIKE, er`);
    si(`«justering» fri for dobbelttellingen. Er den oeverste mindre, staar`);
    si(`tiltroen fortsatt to ganger og forholdet mellom dem ER den tapte faktoren.`);
    si("");
    if (d.tiltroer.length > 0) {
      const t = snitt(d.tiltroer);
      si(`tiltro der kanalen fyrte:     snitt ${t.toFixed(3)}, maks ${Math.max(...d.tiltroer).toFixed(3)}`);
      si(
        `forhold nederste/oeverste:    ` +
          `${(d.snittAbsEnkel / Math.max(1e-12, d.snittAbs)).toFixed(3)}x paa snittet, ` +
          `${(d.maksEnkel / Math.max(1e-12, d.maks)).toFixed(3)}x paa maks`,
      );
    }
    const medKlarte = d.ledd.filter((l) => l.høyest !== null);
    if (medKlarte.length > 0) {
      si("");
      si(`«klarte» observeres BARE naar setet vant budet, altsaa ~1 av 4 runder:`);
      const kn = medKlarte.map((l) => l.klarteN);
      const rn = medKlarte.map((l) => l.runderN);
      si(`  observerte runder for det hoeyeste setet: snitt ${snitt(rn).toFixed(1)}`);
      si(`  derav «klarte»-observasjoner:             snitt ${snitt(kn).toFixed(1)}`);
    }
    si("");
  }

  if (bare.includes("b")) {
    si(`## PROEVE B — framoverblikket (M=2 mot M=1)`);
    si(`12 verdener (k16), dommer paa 32 friske verdener med uavhengig froe.`);
    si(`TO DISJUNKTE FROEBAAND, fordi vedlegget krever replikasjon foer et`);
    si(`fortegn faar staa. Baandene deler ingen giv og ingen dommerfroe.`);
    si("");

    /**
     * MINSTE ANTALL UENIGHETER FØR ET FORTEGN FÅR LOV Å STÅ.
     *
     * Første kjøring fikk n=2, begge positive, og skrev «M=2 er bedre enn M=1».
     * To parrede observasjoner har en tegntest med p = 0,25 — det er ikke et
     * funn, det er en myntkast. Vedlegget sier «aldri adoptere paa stoey», og
     * en rapportlinje som sier noe annet er hvordan man ender med aa gjoere det.
     */
    const MIN_UENIG = 10;

    /** Snitt, SE og tegntest for én rekke parrede differanser. */
    const oppsummer = (
      d: readonly number[],
    ): { m: number; se: number; pos: number; n: number } => {
      const m = snitt(d);
      const sd = Math.sqrt(
        d.reduce((a, x) => a + (x - m) * (x - m), 0) / Math.max(1, d.length - 1),
      );
      return { m, se: sd / Math.sqrt(Math.max(1, d.length)), pos: d.filter((x) => x > 0).length, n: d.length };
    };
    const linje = (merkelapp: string, d: readonly number[]): string => {
      if (d.length === 0) return `| ${merkelapp} | 0 | - | - |`;
      const o = oppsummer(d);
      return (
        `| ${merkelapp} | ${o.n} | ${o.m >= 0 ? "+" : ""}${o.m.toFixed(3)} +/- ${o.se.toFixed(3)} | ` +
        `${o.pos}/${o.n} |`
      );
    };

    // BÅNDENE ER DISJUNKTE: giv g i baand i faar froe base + i·B + g·7717, og
    // B er valgt saa de to intervallene ikke overlapper.
    const bånd = [frøBase + 1_000_000, frøBase + 3_000_000];
    const kjørt: FramMål[] = [];
    for (const bf of bånd) {
      kjørt.push(
        prøveB({
          giv: givB,
          frøBase: bf,
          verdener: 12,
          kandidater: 16,
          dommerVerdener: 32,
          maksPerGiv: 6,
          fraStikk: 2,
        }),
      );
    }
    const n = kjørt.reduce((a, b) => a + b.n, 0);
    const uenig = kjørt.reduce((a, b) => a + b.uenig, 0);
    const msM1 = kjørt.reduce((a, b) => a + b.msM1, 0);
    const msM2 = kjørt.reduce((a, b) => a + b.msM2, 0);
    si(`stillinger:            ${n}`);
    si(`uenige (M2 != M1):     ${uenig}  (${((100 * uenig) / Math.max(1, n)).toFixed(1)} %)`);
    si(`ms per beslutning M=1: ${(msM1 / Math.max(1, n)).toFixed(1)}`);
    si(`ms per beslutning M=2: ${(msM2 / Math.max(1, n)).toFixed(1)}`);
    si(`kostnadsforhold:       ${(msM2 / Math.max(1e-9, msM1)).toFixed(2)}x`);
    si("");
    si(`| dommer / baand | n | gevinst M=2 minus M=1 | tegntest |`);
    si(`|---|---|---|---|`);
    for (let i = 0; i < kjørt.length; i++) si(linje(`GRUNN (M=1), baand ${i + 1}`, kjørt[i]!.diff));
    const grunnAlle = kjørt.flatMap((b) => b.diff);
    si(linje(`GRUNN (M=1), samlet`, grunnAlle));
    for (let i = 0; i < kjørt.length; i++) si(linje(`DYP (M=2), baand ${i + 1}`, kjørt[i]!.diffDyp));
    const dypAlle = kjørt.flatMap((b) => b.diffDyp);
    si(linje(`DYP (M=2), samlet`, dypAlle));
    si("");

    const dom = (merkelapp: string, d: readonly number[]): void => {
      if (d.length === 0) {
        si(`${merkelapp}: ingen uenigheter aa doemme`);
        return;
      }
      const o = oppsummer(d);
      si(
        `${merkelapp}: ${
          o.n < MIN_UENIG
            ? `n=${o.n} uenigheter er under gulvet paa ${MIN_UENIG}. INGENTING ER VIST.`
            : Math.abs(o.m) < 2 * o.se
              ? `snittet ${o.m >= 0 ? "+" : ""}${o.m.toFixed(3)} ligger innenfor 2 SE ` +
                `(${(2 * o.se).toFixed(3)}). Fortegnet er IKKE vist - underdimensjonert.`
              : o.m > 0
                ? `M=2 er BEDRE enn M=1 (${o.m.toFixed(3)} > 2 SE = ${(2 * o.se).toFixed(3)}).`
                : `M=2 er DAARLIGERE enn M=1 (${o.m.toFixed(3)}, |m| > 2 SE).`
        }`,
      );
    };
    dom("GRUNN dommer", grunnAlle);
    dom("DYP dommer", dypAlle);
    if (grunnAlle.length >= MIN_UENIG && dypAlle.length >= MIN_UENIG) {
      const g = oppsummer(grunnAlle);
      const dd = oppsummer(dypAlle);
      const enige = Math.sign(g.m) === Math.sign(dd.m);
      si("");
      si(
        enige
          ? `DE TO DOMMERNE ER ENIGE om fortegnet (${g.m >= 0 ? "+" : "-"}). Det er det sterkeste`
            + ` denne fila kan si: fortegnet henger ikke paa dommerens dybde.`
          : `DE TO DOMMERNE ER UENIGE om fortegnet (grunn ${g.m.toFixed(3)}, dyp ${dd.m.toFixed(3)}).`
            + ` Da avhenger svaret av hvem som doemmer, og INGENTING er vist.`,
      );
      const perBeslutning = (dd.m * uenig) / Math.max(1, n);
      si(
        `Per BESLUTNING (dyp dommer x uenighetsandel): ` +
          `${perBeslutning >= 0 ? "+" : ""}${perBeslutning.toFixed(4)} stikk.`,
      );
    }
    si("");
    si(`GRENSENE PAA DENNE MAALINGEN, SAGT HOEYT:`);
    si(`  1. Den GRUNNE dommeren er selv et M=1-oppspill. Den kan ikke se`);
    si(`     verdien av en plan som foerst betaler seg to av EGNE valg fram,`);
    si(`     saa den er konservativ i M=2s disfavoer. Den DYPE dommeren retter`);
    si(`     det, men deler algoritmisk skjevhet med soeket den doemmer.`);
    si(`     Derfor staar begge, og bare enighet mellom dem er et funn.`);
    si(`  2. Bare uenighetene doemmes. Der de er enige er gevinsten null per`);
    si(`     definisjon, saa tallet over er gevinsten NAAR den fyrer - ikke per`);
    si(`     beslutning. Per beslutning er den ganget med uenighetsandelen.`);
    si(`  3. Dommeren maaler STIKK i ett oppspill, ikke poeng over en kamp.`);
    si(`     Vekslingskursen mellom de to er ikke maalt her.`);
    si("");
  }

  mkdirSync(dirname(ut), { recursive: true });
  writeFileSync(ut, `${l.join("\n")}\n`);
  process.stderr.write(`\nSkrevet til ${ut}\n`);
}

// ======================= HELE BOTEN (--spek, 11. sep) =======================

/**
 * PRØVE A PÅ EN VILKÅRLIG SPEK.
 *
 *   node examples/k4-hukommelse.ts --spek "<hele boten>" [--null-spek <spek>] \
 *     [--andre <spek>] --giv 6 --maalrunde 7 --ut analyse/k4-spek.txt --json analyse/k4-spek.json
 *
 * Uten `--spek` er fila uendret: armene over er FASTE (`A_NULL`, `A_MINNE`), og det er
 * de tallene `krav-status.md` siterer. Med `--spek` er armene:
 *
 *   NULL    `--null-spek`, eller speken med hukommelsen skrudd av (`utenMinne`: uten
 *           `okt:`/`profil:`, `h0` på `mlb:`, uten søketro som leser boka). MÅ gi 0 avvik.
 *   MINNE   speken selv. Avvik > 0 = hukommelsen endrer valg (K4.1).
 *
 * og kontrolldelen: `erDeterministisk` (to kall på samme tilstand), positivkontrollen
 * (`prøveAForsterket`, uavhengig av speken — kan prøven SE en snudd beslutning?) og
 * `øktNåesGjennom` når speken har `okt:`.
 *
 * ============ STOKASTISK SØK GJØR PRØVE A STUM, OG DET SKAL STÅ ==========
 *
 * Mett agent har sju runder med RNG-trekk bak seg, fersk har ingen. Med `sik:` i speken
 * kan nullarmen derfor avvike uten noen hukommelse, og raden blir STUM. Det er riktig
 * dom: prøven kan ikke skille RNG fra hukommelse. Advarselen sier hvorfor, og kuren er
 * agent A sitt deterministiske per-beslutning-frø for `sik` — ikke en løsere terskel her.
 *
 * `--del null,minne,kontroll` lar kravbatteriet dele armene på flere prosesser; skivene
 * slås sammen med `slåSammenK4`.
 */
export interface K4Armrad {
  readonly navn: "NULL" | "MINNE";
  readonly spek: string;
  readonly giv: number;
  readonly n: number;
  readonly avvik: number;
  readonly avvikBud: number;
  readonly avvikSpill: number;
  readonly bokførte: readonly number[];
  readonly eksempler: readonly string[];
}

export type K4Del = "null" | "minne" | "kontroll";

export interface K4SpekRapport {
  readonly spek: string;
  readonly nullSpek: string;
  readonly andre: string | null;
  readonly opts: { readonly giv: number; readonly frøBase: number; readonly målRunde: number; readonly forkamper: number };
  readonly determinisme: {
    readonly kall: number;
    readonly ulike: number;
    readonly søkelag: boolean;
    readonly eksempler: readonly string[];
  } | null;
  readonly armer: readonly K4Armrad[];
  readonly positivkontroll: readonly ForsterkPunkt[] | null;
  readonly struktur: number | null;
  readonly sekunder: number;
}

export function kjørK4Spek(o: {
  readonly spek: string;
  readonly nullSpek: string;
  readonly andre: string | null;
  readonly giv: number;
  readonly frøBase: number;
  readonly målRunde: number;
  readonly forkamper: number;
  readonly deler: readonly K4Del[];
}): K4SpekRapport {
  const t0 = Date.now();
  const arm = (navn: "NULL" | "MINNE", spek: string): K4Armrad => {
    const m = prøveA({
      spek,
      // Har speken `okt:`, bygges den med VÅR økt (lagIndre er idempotent på den), så boka kan leses.
      medØkt: harLag(spek, "okt:"),
      giv: o.giv,
      frøBase: o.frøBase,
      målRunde: o.målRunde,
      tikk: true,
      forkamper: o.forkamper,
      observerTikk: true,
      ...(o.andre === null ? {} : { andre: o.andre }),
    });
    return {
      navn,
      spek,
      giv: m.giv,
      n: m.n,
      avvik: m.avvik,
      avvikBud: m.avvikBud,
      avvikSpill: m.avvikSpill,
      bokførte: m.bokførte,
      eksempler: m.eksempler,
    };
  };
  const armer: K4Armrad[] = [];
  if (o.deler.includes("null")) armer.push(arm("NULL", o.nullSpek));
  if (o.deler.includes("minne")) armer.push(arm("MINNE", o.spek));
  const kontroll = o.deler.includes("kontroll");
  const det = kontroll ? erDeterministisk(o.spek, 2, o.frøBase + 300_000) : null;
  return {
    spek: o.spek,
    nullSpek: o.nullSpek,
    andre: o.andre,
    opts: { giv: o.giv, frøBase: o.frøBase, målRunde: o.målRunde, forkamper: o.forkamper },
    determinisme: det === null ? null : { ...det, søkelag: harSøk(o.spek) },
    armer,
    positivkontroll: kontroll
      ? prøveAForsterket({
          // Seks giv som i standardkjøringen: der snudde 1 budpoeng 2 av 87 valg. Færre gir
          // fella for få anledninger, og den er billig (ingen søk).
          giv: Math.max(1, Math.min(o.giv, 6)),
          frøBase: o.frøBase,
          målRunde: o.målRunde,
          forkamper: 2,
          nivåer: [1, 8],
          modus: "flat",
        })
      : null,
    struktur: kontroll && harLag(o.spek, "okt:") ? øktNåesGjennom(o.spek) : null,
    sekunder: Math.round((Date.now() - t0) / 1000),
  };
}

/** Slår sammen skiver: armene summeres per navn, kontrolldelen tas fra skiva som har den. */
export function slåSammenK4(rs: readonly K4SpekRapport[]): K4SpekRapport {
  if (rs.length === 0) throw new Error("slåSammenK4: ingen rapporter");
  const armer = new Map<string, K4Armrad>();
  for (const r of rs) {
    for (const a of r.armer) {
      const f = armer.get(a.navn);
      armer.set(
        a.navn,
        f === undefined
          ? a
          : {
              ...f,
              giv: f.giv + a.giv,
              n: f.n + a.n,
              avvik: f.avvik + a.avvik,
              avvikBud: f.avvikBud + a.avvikBud,
              avvikSpill: f.avvikSpill + a.avvikSpill,
              bokførte: f.bokførte.map((x, i) => Math.max(x, a.bokførte[i] ?? 0)),
              eksempler: [...f.eksempler, ...a.eksempler].slice(0, 8),
            },
      );
    }
  }
  return {
    ...rs[0]!,
    opts: { ...rs[0]!.opts, giv: rs.reduce((s, r) => s + (r.armer.length > 0 ? r.opts.giv : 0), 0) },
    determinisme: rs.find((r) => r.determinisme !== null)?.determinisme ?? null,
    armer: [...armer.values()],
    positivkontroll: rs.find((r) => r.positivkontroll !== null)?.positivkontroll ?? null,
    struktur: rs.find((r) => r.struktur !== null)?.struktur ?? null,
    sekunder: rs.reduce((s, r) => s + r.sekunder, 0),
  };
}

export function dømK4Spek(r: K4SpekRapport): {
  kontrollOk: boolean;
  felleOk: boolean;
  andel: number;
  nullAndel: number;
  dom: "ja" | "nei" | "stum";
  grunn: string;
} {
  const nul = r.armer.find((a) => a.navn === "NULL");
  const min = r.armer.find((a) => a.navn === "MINNE");
  const andel = min === undefined || min.n === 0 ? NaN : min.avvik / min.n;
  const nullAndel = nul === undefined || nul.n === 0 ? NaN : nul.avvik / nul.n;
  const kontrollOk = nul !== undefined && nul.n > 0 && nul.avvik === 0;
  const felleOk = (r.positivkontroll ?? []).some((p) => p.avvik > 0);
  const støy = r.determinisme !== null && (r.determinisme.ulike > 0 || r.determinisme.søkelag);
  const base = { kontrollOk, felleOk, andel, nullAndel };
  if (!kontrollOk) {
    return {
      ...base,
      dom: "stum",
      grunn:
        nul === undefined || nul.n === 0
          ? "nullarmen fikk ingen stillinger"
          : `nullarmen (uten hukommelse) avvek i ${nul.avvik} av ${nul.n}` +
            (støy
              ? " — speken er ikke deterministisk (søkelag med vandrende RNG): fersk mot mett måler RNG-posisjon. Trenger agent A sitt per-beslutning-frø."
              : " — noe annet enn hukommelsen skiller fersk fra mett agent"),
    };
  }
  if (!felleOk) return { ...base, dom: "stum", grunn: "positivkontrollen snudde ingen valg — prøven kan ikke se hukommelse" };
  if (min === undefined || min.n === 0) return { ...base, dom: "stum", grunn: "minnearmen fikk ingen stillinger" };
  return min.avvik > 0
    ? { ...base, dom: "ja", grunn: `hukommelsen endret ${min.avvik} av ${min.n} valg, nullarmen 0` }
    : { ...base, dom: "nei", grunn: `hukommelsen endret ingen av ${min.n} valg` };
}

function kjørSpekModus(): void {
  const arg = (n: string, s: string): string => {
    const i = process.argv.indexOf(n);
    return i < 0 ? s : (process.argv[i + 1] ?? s);
  };
  const spek = arg("--spek", "");
  if (spek === "") throw new Error("--spek mangler verdi");
  const nullArg = arg("--null-spek", "");
  const andre = arg("--andre", "");
  const deler = arg("--del", "null,minne,kontroll")
    .split(",")
    .filter((x) => x !== "") as K4Del[];
  const ut = arg("--ut", "analyse/k4-spek.txt");
  const json = arg("--json", `${ut.replace(/\.txt$/, "")}.json`);
  const r = kjørK4Spek({
    spek,
    nullSpek: nullArg === "" ? utenMinne(spek) : nullArg,
    andre: andre === "" ? null : andre,
    giv: tall(arg("--giv", "6"), 6, "--giv"),
    frøBase: tall(arg("--froe", "4400000"), 4_400_000, "--froe"),
    målRunde: tall(arg("--maalrunde", "7"), 7, "--maalrunde"),
    forkamper: tall(arg("--forkamper", "0"), 0, "--forkamper"),
    deler,
  });
  const d = dømK4Spek(r);
  const l: string[] = [];
  l.push(`# K4 PRØVE A — hele boten`);
  l.push(`spek:      ${r.spek}`);
  l.push(`nullarm:   ${r.nullSpek}`);
  l.push(`andre:     ${r.andre ?? "(samme spek i alle seter)"}`);
  l.push(`giv ${r.opts.giv}, froe ${r.opts.frøBase}, maalrunde ${r.opts.målRunde + 1}, forkamper ${r.opts.forkamper}`);
  l.push("");
  if (r.determinisme !== null) {
    const x = r.determinisme;
    if (x.ulike > 0 || x.søkelag) {
      l.push(`ADVARSEL: speken er ${x.ulike > 0 ? `IKKE deterministisk (${x.ulike} av ${x.kall} dobbeltkall ga ulikt svar)` : `ikke vist deterministisk (0 av ${x.kall} ulike, men den har søkelag med vandrende RNG)`}.`);
      l.push(`  Fersk mot mett agent måler da RNG-posisjon like gjerne som hukommelse. Prøve A krever`);
      l.push(`  et deterministisk per-beslutning-frø (agent A, sik). Nullarmen avgjør om det slo ut.`);
      for (const e of x.eksempler) l.push(`  ${e}`);
    } else {
      l.push(`determinisme: 0 av ${x.kall} dobbeltkall ulike, ingen søkelag`);
    }
    l.push("");
  }
  l.push(`| arm | giv | n | avvik | bud | spill | bokført maks per sete |`);
  l.push(`|---|---|---|---|---|---|---|`);
  for (const a of r.armer) {
    l.push(`| ${a.navn} | ${a.giv} | ${a.n} | ${a.avvik} | ${a.avvikBud} | ${a.avvikSpill} | ${a.bokførte.join("/")} |`);
  }
  if (r.positivkontroll !== null) {
    l.push("");
    l.push(`positivkontroll (flat forskyvning, BASE_DET): ${r.positivkontroll.map((p) => `${p.forsterk} → ${p.avvik}/${p.n}`).join(", ")}`);
  }
  if (r.struktur !== null) l.push(`økten når gjennom speken: ${r.struktur} bokførte runder etter 4 runder`);
  l.push("");
  const hel = (["null", "minne", "kontroll"] as const).every((x) => deler.includes(x));
  l.push(
    hel
      ? `DOM ${d.dom.toUpperCase()}: ${d.grunn}`
      : `DELRAPPORT (--del ${deler.join(",")}): dommen felles etter slåSammenK4 i kravbatteriet.`,
  );
  mkdirSync(dirname(ut), { recursive: true });
  writeFileSync(ut, `${l.join("\n")}\n`);
  mkdirSync(dirname(json), { recursive: true });
  writeFileSync(json, `${JSON.stringify({ ...r, ...d }, null, 1)}\n`);
  process.stderr.write(`${l.join("\n")}\n\nSkrevet til ${ut} og ${json}\n`);
}

if (erHovedmodul && process.argv.includes("--spek")) kjørSpekModus();
