/**
 * MOTSTANDERPROFILEN: hvem er dette, og hvordan spiller hun?
 *
 * ARVINDS DESIGN, 4. august:
 *
 *   «i løpet av en kamp så bygger modellen en profil over sine motstandere og
 *    hvordan de spiller runde til runde, også tilpasser den seg. […] hvis de
 *    byr aggressivt, så kan det være smart å gi dem budet hvis man tror man
 *    klarer å felle det. […] vi bør også se om de var gode spillere og spiller
 *    optimalt selv. dette skal ikke bare endre hvordan vi byr, men også
 *    hvordan botten spiller.»
 *
 * ============================ HVORFOR EN EGEN MODUL =======================
 *
 * Jeg foreslo først at profilen måtte ligge ENTEN i verdenstrekkeren ELLER som
 * trekk i kortvektoren. Det var en falsk motsetning. Profilen er et FAKTUM om
 * en person, ikke en detalj i én algoritme, og alle tre lagene skal kunne
 * spørre den: budlaget om hun overbyr, verdenstrekkeren om hva hun pleier å ha,
 * kortnettet om hun er god.
 *
 * ===================== PROFILEN BYGGES VED BORDET, IKKE HER ================
 *
 * Arvind, samme dag:
 *
 *   «vi skal jo ikke slå de ved å se i databasen. vi skal slå hvem som helst
 *    gjennom spillet. ingen profilbygging skjer her. det skjer in real time i
 *    løpet av spillet, etter hver runde.»
 *
 * Profilen starter derfor TOM for enhver spiller, og fylles bare av
 * `oppdater()` med ting som var synlige ved bordet. Ingen forhåndslasting fra
 * historikk, ingen oppslag på navn. Boten skal slå en hun aldri har møtt, ved
 * å lære henne mens de spiller.
 *
 * Historikken under er brukt til ÉN ting: å vise at forskjellene finnes og er
 * store nok til å lønne seg å måle. Et maskineri som utnytter forskjeller er
 * verdiløst om forskjellene ikke er der:
 *
 *   spiller   runder   snittbud   klarte kontrakten   poeng/runde
 *      2        254      8,90          91,2 %            6,74
 *      3        156      9,08          92,0 %            6,62
 *      1        270      8,83          78,4 %            5,36
 *      5        107      9,74          61,8 %            2,19
 *
 * Spiller 5 byr HØYEST og klarer det SJELDNEST. 91,2 % mot 61,8 % er 29
 * prosentpoeng på n=91 og n=34 kontrakter – **3,3 SE**. Mot henne er det ofte
 * riktig å la kontrakten gå og felle den; mot spiller 2 må vi slåss om den.
 * I dag behandler boten dem likt, fordi `evForsvar` er én konstant.
 *
 * ============================== KRYMPINGEN ================================
 *
 * `(n·individ + k·befolkning) / (n + k)`, samme form som `motstander.ts`.
 *
 * HVA SOM FAKTISK ER LÆRBART I ÉN KAMP. En kamp er ~17 runder, og per
 * motstander gir det:
 *
 *   bud           ~17 observasjoner   – nok til budaggresjon
 *   kortvalg      ~50 observasjoner   – nok til grove stilmål
 *   kontrakter     ~4–6 observasjoner – FOR LITE til klarte-raten alene
 *
 * Med k=12 er n=5 bare 29 % av veien fra befolkningen til individet. Klarte-
 * raten krever derfor at profilen LEVER VIDERE mellom kamper: fem kamper mot
 * samme person gir n≈25, og da er den 68 % framme. Det er slik den blir verre
 * og verre å spille mot – ikke i løpet av én kveld, men over flere.
 *
 * Budaggresjonen derimot biter allerede i runde ti av den første kampen.
 *
 * ============================ INGEN NAVN HER ==============================
 *
 * Nøkkelen er en ugjennomsiktig `id`. Repoet er offentlig; navnene finnes bare
 * i Val Town-basen, og skal ikke havne i en fil, en test eller en commit.
 */

/** Ett målt tall med sitt eget bevisgrunnlag. */
export interface Anslag {
  /** Summen av observasjonene. */
  readonly sum: number;
  /** Antall observasjoner. */
  readonly n: number;
}

export const TOMT: Anslag = { sum: 0, n: 0 };

export const legg = (a: Anslag, x: number): Anslag => ({ sum: a.sum + x, n: a.n + 1 });

/**
 * Krympet anslag: individet veid mot befolkningen etter hvor mye vi har sett.
 *
 * `k` er hvor mange observasjoner befolkningssnittet «er verdt». Lav k gjør
 * profilen kvikk og støyete, høy k treg og trygg. k=12 er arvet fra
 * `motstander.ts`, der den ble satt slik at én kamp flytter anslaget merkbart
 * uten at én uheldig runde gjør det.
 */
export function krymp(a: Anslag, befolkning: number, k = 12): number {
  if (a.n <= 0) return befolkning;
  return (a.sum + k * befolkning) / (a.n + k);
}

/** Hvor mye vekt individet har fått, 0 = rent befolkningssnitt, 1 = rent individ. */
export const tiltro = (a: Anslag, k = 12): number => (a.n <= 0 ? 0 : a.n / (a.n + k));

/**
 * Alt vi måler om én spiller.
 *
 * VED RUNDESLUTT ER ALT AVDEKKET, og det er profilen sin store fordel.
 *
 * Hver spiller har lagt tolv kort, og alle tolv står i stikkhistorikken. Hånden
 * hun HADDE er dermed kjent i etterkant, selv om den var skjult mens det sto
 * på. Det er ikke lekkasje – det er nøyaktig slik et menneske bygger en
 * lesning på en medspiller også.
 *
 * SKILLET SOM MÅ HOLDES:
 *
 *   UNDER runden   bare det som er spilt. Dette styrer verdenstrekkeren, og
 *                  her ville et oppslag i fasiten vært juks.
 *   VED SLUTTEN    alt. Dette fyller profilen, og her er det bare observasjon.
 *
 * Uten det skillet ville profilen vært blind for det viktigste den kan vite:
 * hva hun bød MED HVILKEN HÅND.
 */
export interface Profil {
  readonly id: string;
  /** Bud hun avga, som tall. Sier hvor høyt hun legger seg. */
  readonly bud: Anslag;
  /** Andel budrunder hun gikk inn i i det hele tatt. */
  readonly bydde: Anslag;
  /**
   * Om kontrakten holdt, når hun var budvinner. DETTE ER NØKKELTALLET for
   * Arvinds poeng: en som byr høyt og klarer det sjelden, skal man la få
   * budet. Spennet i dataene er 61,8 % til 92,0 %.
   */
  readonly klarte: Anslag;
  /** Stikk laget hennes tok som budvinner, delt på kontrakten. Over 1 = margin. */
  readonly margin: Anslag;
  /** Poeng per runde. Grov, men den fanger alt vi ikke har tenkt på. */
  readonly poeng: Anslag;
  /**
   * Andel utspill som var trumf, når hun ikke var budvinner. Stilmål: en som
   * leder trumf i forsvar spiller aktivt, en som aldri gjør det spiller passivt.
   */
  readonly trumfutspill: Anslag;
  /**
   * DD-ANGER per ekte valg – hvor langt fra perfekt spill hun ligger.
   *
   * Dette er «er hun en god spiller» som et tall. Regnes av stikkhistorikken
   * ved rundeslutt, når alle fire hender er kjent.
   */
  readonly anger: Anslag;

  // --- Det som krever de avdekte kortene ---------------------------------

  /** Trumflengde da hun bød. «Bød 10 med bare 4 trumf.» */
  readonly trumflengdeVedBud: Anslag;
  /** Honnører (kn/D/K/E) da hun bød. */
  readonly honnorerVedBud: Anslag;
  /**
   * OVERBUD: budet minus det hånden egentlig bar.
   *
   * Positivt = hun byr høyere enn kortene tilsier. Dette er tallet som gjør
   * Arvinds strategi mulig: en som systematisk overbyr skal man LA få
   * kontrakten, fordi den ryker oftere enn hun tror.
   */
  readonly overbud: Anslag;
  /**
   * FLAKS: klarte hun den uten at den var til å klare?
   *
   * 1 når kontrakten holdt SELV OM dobbeltdummy sier den ikke skulle det,
   * −1 når den røk selv om den var i havn med perfekt spill, 0 ellers.
   *
   * HVORFOR DETTE ER ET EGET FELT OG IKKE STØY. «Hun klarte tre av fire» er
   * ikke det samme som «hun er god» – det kan være at kortene falt hennes vei.
   * Uten dette leddet ville profilen forvekslet flaks med ferdighet, og det er
   * nøyaktig feilen Arvind advarte mot: «han klarte det pga flaks».
   */
  readonly flaks: Anslag;
}

export const tomProfil = (id: string): Profil => ({
  id,
  bud: TOMT,
  bydde: TOMT,
  klarte: TOMT,
  margin: TOMT,
  poeng: TOMT,
  trumfutspill: TOMT,
  anger: TOMT,
  trumflengdeVedBud: TOMT,
  honnorerVedBud: TOMT,
  overbud: TOMT,
  flaks: TOMT,
});

/**
 * Befolkningssnittene. Alt utenom `anger` er målt på de 1 172 loggede
 * rundene; `anger` er satt til førersnittet fra DD-målingen 4. august
 * (0,426 per ekte valg) i påvente av nok fullstendige runder.
 *
 * DE ER MÅLT, IKKE VALGT. En feil prior her flytter hver eneste profil, og
 * mest for dem vi har sett minst til – altså nettopp der vi trenger den mest.
 *
 * FORBEHOLD SOM SKAL STÅ: disse snittene er tatt av ÉN familie. En prior som
 * beskriver dem er ikke en prior som beskriver «et menneske». Skal boten møte
 * hvem som helst, bør snittene på sikt komme fra en BREDERE populasjon –
 * f.eks. selvspill mot et sett med ulike budpolicyer – ikke fra de trettien
 * som tilfeldigvis har spilt mot oss.
 */
export const BEFOLKNING = {
  bud: 8.95,
  bydde: 0.33,
  klarte: 0.82,
  margin: 1.08,
  poeng: 5.2,
  trumfutspill: 0.14,
  anger: 0.426,
  trumflengdeVedBud: 4.6,
  honnorerVedBud: 1.6,
  /** Et gjennomsnittsmenneske byr omtrent det hånden bærer. */
  overbud: 0.0,
  /** Flaksen midler til null over mange runder – det er definisjonen på flaks. */
  flaks: 0.0,
} as const;

/**
 * Én runde slik profilen ser den ETTER at den er ferdig.
 *
 * Feltene under streken krever de avdekte kortene, og de er valgfrie: en runde
 * som ikke ble logget fullstendig gir fortsatt de øverste, bare med mindre
 * innhold. Profilen skal ikke miste en observasjon fordi én del manglet.
 */
export interface Rundeobservasjon {
  readonly id: string;
  /** Budet hun avga, eller `null` for pass. */
  readonly bud: number | null;
  readonly varBudvinner: boolean;
  /** Bare meningsfullt når `varBudvinner`. */
  readonly klarte?: boolean;
  readonly lagStikk?: number;
  readonly poeng: number;
  /** Bare når hun ikke var budvinner og faktisk ledet et stikk. */
  readonly ledetTrumf?: boolean;

  // --- Fra de avdekte kortene ---------------------------------------------

  /** Antall trumf på hånden hennes den runden. */
  readonly trumflengde?: number;
  /** Antall kort med verdi ≥ 11 på hånden. */
  readonly honnorer?: number;
  /**
   * Hva dobbeltdummy sier laget hennes SKULLE tatt med perfekt spill.
   * Sammen med `lagStikk` skiller det flaks fra ferdighet.
   */
  readonly ddLagStikk?: number;
  /** Snittanger per ekte valg denne runden, fra stikkhistorikken. */
  readonly angerSnitt?: number;
}

/**
 * Hva et bud «burde» vært, gitt hånden.
 *
 * GROV MED VILJE. Den skal ikke være en budmodell – den skal bare gi et
 * konsistent nullpunkt slik at OVERBUD blir sammenliknbart mellom spillere.
 * Feilen i formelen treffer alle likt og faller ut av sammenlikningen; det er
 * differansen mellom personer vi er ute etter, ikke et absolutt nivå.
 *
 * Kalibrert mot de målte familietallene: bud 7 kom med 4,32 lengste og 1,18
 * honnører, bud 9 med 5,00 og 2,31.
 */
export const budFraHand = (trumflengde: number, honnorer: number): number =>
  5.5 + 0.55 * trumflengde + 0.45 * honnorer;

/** Oppdaterer profilen med én runde. Rene data inn, ny profil ut. */
export function oppdater(p: Profil, o: Rundeobservasjon): Profil {
  let ut: Profil = {
    ...p,
    bydde: legg(p.bydde, o.bud === null ? 0 : 1),
    poeng: legg(p.poeng, o.poeng),
  };
  if (o.bud !== null) ut = { ...ut, bud: legg(ut.bud, o.bud) };
  if (o.varBudvinner && o.klarte !== undefined) {
    ut = { ...ut, klarte: legg(ut.klarte, o.klarte ? 1 : 0) };
    if (o.lagStikk !== undefined && o.bud !== null && o.bud > 0) {
      ut = { ...ut, margin: legg(ut.margin, o.lagStikk / o.bud) };
    }
  }
  if (!o.varBudvinner && o.ledetTrumf !== undefined) {
    ut = { ...ut, trumfutspill: legg(ut.trumfutspill, o.ledetTrumf ? 1 : 0) };
  }

  // --- Det de avdekte kortene gir ----------------------------------------
  if (o.trumflengde !== undefined && o.bud !== null) {
    ut = { ...ut, trumflengdeVedBud: legg(ut.trumflengdeVedBud, o.trumflengde) };
    if (o.honnorer !== undefined) {
      ut = {
        ...ut,
        honnorerVedBud: legg(ut.honnorerVedBud, o.honnorer),
        overbud: legg(ut.overbud, o.bud - budFraHand(o.trumflengde, o.honnorer)),
      };
    }
  }
  if (o.angerSnitt !== undefined) ut = { ...ut, anger: legg(ut.anger, o.angerSnitt) };

  // FLAKS: klarte hun noe som ikke var til å klare, eller omvendt?
  if (o.varBudvinner && o.klarte !== undefined && o.ddLagStikk !== undefined && o.bud !== null) {
    const skulleKlart = o.ddLagStikk >= o.bud;
    const f = o.klarte === skulleKlart ? 0 : o.klarte ? 1 : -1;
    ut = { ...ut, flaks: legg(ut.flaks, f) };
  }
  return ut;
}

/**
 * VERDIEN AV Å LA HENNE FÅ KONTRAKTEN.
 *
 * Dagens budregel er `2N(2P−1) > evForsvar` med `evForsvar` som en KONSTANT –
 * i praksis en antakelse om at forsvar er verdt det samme uansett hvem som
 * spiller ut. Det er samme klasse feil som terskelen på 2,5: en konstant der
 * det skulle stått en modell.
 *
 * Ryker kontrakten, taper budlaget `2N` og forsvarerne deler gevinsten. Med
 * `q` = sannsynligheten for at hun IKKE klarer den, er forsvarets forventning
 * grovt `q · 2N/3` – vi er én av tre forsvarere – mot omtrent ingenting når
 * hun berger.
 *
 * TALLET ER GROVT MED VILJE. Det eksakte oppgjøret avhenger av hvilke stikk vi
 * selv tar, og det vet vi ikke i budøyeblikket. Poenget er ikke presisjon, men
 * at leddet i det hele tatt VARIERER med hvem som byr: mot 61,8 % gir det
 * omtrent dobbelt så høy forsvarsverdi som mot 92 %.
 */
export function evForsvarMot(p: Profil, kontrakt: number, k = 12): number {
  const q = 1 - krymp(p.klarte, BEFOLKNING.klarte, k);
  return (q * 2 * kontrakt) / 3;
}
