/**
 * KONVENSJONSVAKTEN – to deterministiske regler lagt utenpå en vilkårlig agent.
 *
 * HVORFOR EN VAKT OG IKKE MER TRENING. Atferdsprofilen mot MesterAI
 * (`analyse/mesterai-atferd2.txt`, 320 kontrakter) fant to hull i
 * SPILLEFØRERSETET som begge er REGELFORMEDE – de handler om konvensjoner en
 * per-beslutning-evaluering ikke kan se, fordi gevinsten ligger utenfor det
 * ett kortvalg måler:
 *
 *   A) ÅPNINGSUTSPILLET. sd-r1 spiller ut sin høyeste trumf i 44 % av
 *      kontraktene. Det etterlyste kortet tar da stikket i bare 47 % av
 *      rundene, mot NevroHjernes 99 % og MesterAIs 93 % (|z| = 14,9).
 *      Regelen MesterAI følger er ikke «spill lavest» – den gjør det bare
 *      23 % – men «IKKE SLÅ DITT EGET ETTERLYSTE KORT».
 *
 *   B) GARANTERTE STIKK. Der stikket alt er sikret for laget brenner sd-r1
 *      trumf i 34 % av tilfellene mot MesterAIs 2 %: 0,39 unødvendige trumf
 *      per runde mot 0,03. Der stikket IKKE er garantert ligger alle likt
 *      (82/86/87 %), så det er bare de garanterte som lekker.
 *
 * FORBEHOLDET SOM HOLDER TALLET ÆRLIG. Å ta et garantert stikk gir deg
 * UTSPILLET, og det har verdi for spilleføreren. MesterAI legger selv «ikke
 * billigste kort» i 41 % av de garanterte – den kjøper utspillet med et
 * SIDEKORT. Skillet 41 % mot 66 % er altså diskutabelt; skillet 2 % mot 34 %
 * er det ikke. Derfor er vakt 2 delt i to flagg som kan måles hver for seg:
 * «aldri trumf» (`t`) og den strengere «alltid billigst» (`b`).
 *
 * INFORMASJONSDISIPLIN. Vakten er en SPILLER, ikke en måling. Den ser bare det
 * setet selv kan se: egen hånd, bordet, historikken, eget vrak og avslørte
 * renonser (`garantertSynlig`/`lagetSynlig` i `synlig.ts`). Den rører aldri
 * `garantertFasit` eller `state.makker` før makkeren er avslørt.
 *
 * MINIMALT INNGREP. Vakten overstyrer BARE når den indre agentens kort bryter
 * regelen. Gjør agenten allerede det riktige, står valget hennes urørt – alt
 * annet enn de to reglene er fortsatt agentens eget spill.
 *
 * SPESIFIKASJON: «vakt:<flagg>:<indre kandidat>», f.eks.
 *   vakt:a:e1:e1-modell/sd-r2.bin     bare åpningsvakten (billigste under)
 *   vakt:h:e1:e1-modell/sd-r2.bin     åpningsvakten, men HØYESTE under
 *   vakt:l:e1:e1-modell/sd-r2.bin     laveste trumf ut NAAR etterlysningen er garantert
 *   vakt:t:e1:e1-modell/sd-r2.bin     bare «garantert: aldri trumf»
 *   vakt:b:e1:e1-modell/sd-r2.bin     bare «garantert: alltid billigst»
 *   vakt:at:e1:e1-modell/sd-r2.bin    begge (billigst-varianten av vakt 2 er b)
 */

import { likeKort, type Kort } from "../kort.ts";
import { lovligeKort, stikkvinner, type GameState, type Handling } from "../motor.ts";
import { billigste, dyreste, garantertSynlig, lagetSynlig, ukjenteKort } from "./synlig.ts";

/** Hvilke av reglene som er slått på. */
export interface Vaktvalg {
  /** Vakt 1: slå aldri ditt eget etterlyste kort. */
  readonly åpning: boolean;
  /**
   * Vakt 1, variant: velg det HØYESTE utspillet som lar det etterlyste stå, i
   * stedet for det billigste. Atferdskontrollen viste at billigst-varianten
   * åpner med valør 3,85 mot MesterAIs 7,16 – konvensjonen krever bare at man
   * legger UNDER kortet, ikke at man legger lavest. Måles for seg.
   */
  readonly åpningHøyest?: boolean;
  /**
   * Vakt 3: som budvinner i stikk 1, spill laveste trumf – MEN BARE når det
   * etterlyste kortet er garantert.
   *
   * BETINGELSEN ER HELE REGELEN. Arvind formulerte konvensjonen presist: man
   * spiller ut laveste trumf når man har etterlyst den høyeste trumfen man
   * ikke selv har, altså når stikket er sikret. Sitter en forsvarer med en
   * trumf over etterlysningen, kan kortet slås, og da er utspillet et ekte
   * valg – det kan lønne seg å presse den høye trumfen ut.
   *
   * Er stikket derimot garantert, gir ENHVER trumf under etterlysningen
   * nøyaktig samme utfall: makkeren tar stikket med det etterlyste kortet.
   * Da er alt over den laveste ren sløsing – et kort brent uten å kjøpe noe.
   * Det er samme form som vakt 1: den forbyr en tabbe der utfallet er kjent,
   * i stedet for å gjette i en stilling der det ikke er det.
   *
   * FØRSTE FORSØK VAR UBETINGET, og målte null: −0,009 stikk på 1092
   * kontrakter og +0,00 ± 0,02 poeng på grådigbenken. Den versjonen fyrte
   * også i stillingene der etterlysningen kunne slås, altså der utspillet
   * betyr noe. Det er en annen regel enn denne, og den er forkastet.
   *
   * Menneskedataene (analyse/menneskedata-2026-08-01.md) sier at menneskene
   * spiller laveste trumf i 99,3 % av kontraktene og etterlyser høyeste
   * lovlige i 304 av 304 – de to henger sammen: å kalle høyest er nettopp det
   * som gjør stikket garantert så ofte som mulig.
   */
  readonly åpningLavest?: boolean;
  /**
   * Vakt 4: kan ingen av kortene dine TA stikket, legg det billigste.
   *
   * Kriteriet er «ingen av mine lovlige kort vinner stikket slik bordet står»,
   * og det dekker to stillinger som ser ulike ut men er samme sak:
   *
   *   MOTSTANDEREN leder og jeg nås ikke opp. Kortet er tapt uansett.
   *   MEDSPILLEREN leder og jeg kan ikke ta det fra ham. Da avgjøres stikket
   *   mellom ham og motstanderne bak meg, og mitt kort er uten innflytelse.
   *
   * I begge tilfeller er valget mitt likegyldig for hvem som vinner, så alt
   * over det billigste er dødvekt. Kan jeg derimot ta stikket, er valget ekte,
   * og regelen holder seg unna.
   *
   * FORBEHOLD, og grunnen til at dette er en hypotese og ikke et bevis: å
   * kaste seg tom i en farge for å kunne trumfe senere har verdi, og
   * `billigste` velger ikke kortet som best tømmer en farge. Regelen er derfor
   * bare gratis innenfor ETT stikk. Empirisk gjør `garantiBilligst` det samme
   * på garanterte stikk og måler positivt (+0,059), så utvidelsen er verdt å
   * prøve – men den skal måles, ikke antas.
   *
   * Signalering finnes ikke i denne motoren – ingen medspiller leser valøren
   * på et tapt kort – så der er det ingen skjult verdi å ødelegge.
   */
  readonly kastBilligst?: boolean;
  /**
   * Vakt 5: som budvinner, IKKE spill trumf ut når mange trumf står ute.
   *
   * FUNNET, og hvordan det ble funnet. `examples/tap-per-stikk.ts` måler anger
   * mot taket per beslutning; `examples/regelgraving.ts` leter i den etter
   * kjennetegn. Spilleførerens dyreste vane er å trumfe: i 254 av 511
   * trumfvalg var det beste kortet IKKE trumf, og de bar 57 % av hele tapet.
   * Motsatt vei fantes ingen feil – undertrumfing målte −0,02.
   *
   * ATFERDSPROFILEN SIER UAVHENGIG DET SAMME: vi spiller trumf ut i 58 % av
   * utspillene, MesterAI i 51 %.
   *
   * MIN FØRSTE HYPOTESE VAR FEIL. Jeg trodde skillet var mestertrumfen – at
   * man drar trumf når man selv har den høyeste. Dataene sier nei: «trumf ut
   * MED høyeste» måler +0,29, og den DYRESTE cellen er nettopp «≥3 ute OG vi
   * har høyeste» (+0,56). Skillet går på HVOR MANGE trumf som står ute, ikke
   * på hvem som har den øverste.
   *
   * KONTROLLERT FOR FORVEKSLING. «≥3 ute» opptrer tidlig, og tidlige stikk har
   * høyere anger uansett; mange lovlige kort gir også høyere anger. Begge er
   * egenskaper ved stillingen, ikke ved valget. `examples/trumfutspill.ts`
   * sammenligner derfor bare innenfor samme stikknummer OG samme antall
   * lovlige kort. Signalet svekkes og står:
   *
   *   gruppe                    rå          stratifisert
   *   alle trumfutspill      +0,239        +0,172 ± 0,059
   *   ≥3 trumf ute           +0,657        +0,451 ± 0,130
   *   ≤2 trumf ute           +0,122        +0,094 ± 0,058
   *
   * DENNE REGELEN HAR EN ANNEN FORM ENN «a», og det er en risiko som skal stå
   * her. «a» forbyr en tabbe med kjent utfall – å slå sitt eget etterlyste
   * kort kan aldri lønne seg. Å dra trumf KAN være riktig; dette er et
   * forskjøvet skjønn, ikke et forbud. Prosjektets egen erfaring er at bare
   * forbudsformen har målt positivt («k» døde, «a» levde). Regelen kan derfor
   * godt måle null, og den er ikke adoptert før en parret måling på et FRISKT
   * frøbånd sier noe annet.
   *
   * MÅLES PÅ POENG, IKKE PÅ ANGER. Angeren er målt mot et dobbelt-dummy-tak,
   * og å FØLGE dobbelt dummy er allerede målt skadelig (−0,609 gjennom
   * godkjenningsporten). At en regel senker DD-anger er derfor ikke i seg selv
   * et argument for den.
   *
   * ======================= FORKASTET. MÅLT, IKKE ANTATT. ===================
   *
   * Parret mot `vakt:ab` på 2 000 givere, tvungen kontrakt 9, alle tre andre
   * seter spilt av kontrollen:
   *
   *   kandidat     lagstikk   lagstikk − SD   mot kontrollen
   *   vakt:ab        9,840        +0,311            –
   *   vakt:abd       9,669        +0,140      −0,171 ± 0,028
   *   vakt:abD       9,734        +0,204      −0,106 ± 0,022
   *   vakt:abe       9,629        +0,099      −0,211 ± 0,029
   *
   * BEGGE erstatningene taper, og `d` og `e` spiller motsatt kort. Da er det
   * ikke valget av kort som er feil – det er BETINGELSEN. Regelen er død.
   *
   * HVORFOR SIGNALET LØY, og dette er lærdommen som er verdt mer enn regelen:
   * angeren ble målt mot DOBBELT DUMMY. Kjørt på nytt mot SD-fasiten – den
   * som faktisk bestod porten, +0,718 – snur fortegnet fullstendig:
   *
   *   situasjon                         DD-anger        SD-anger
   *   vi spilte trumf                  +0,217          −0,222 ± 0,103
   *   vi trumfet, beste ikke trumf     +0,723          +1,199
   *   vi trumfet ikke, beste trumf     −0,019          +0,939
   *
   * Under SD er det INGEN overtrumfing: å spille trumf måler bedre enn
   * snittet, og de to feilretningene er like store. «Spilleføreren trumfer
   * for mye» var et artefakt av å måle avstand til en policy vi allerede
   * hadde målt som dårligere enn vår egen.
   *
   * Flaggene beholdes som `k` beholdes: et forkastet forsøk med tallet sitt
   * er billigere å ha stående enn å finne på igjen om et halvt år.
   */
  readonly ikkeDraTrumf?: boolean;
  /** Terskel for vakt 5: hvor mange trumf ute som gjør utspillet forbudt. */
  readonly draTerskel?: number;
  /**
   * Vakt 5, variant: legg det BILLIGSTE sidekortet i stedet for det dyreste.
   *
   * Førsteversjonen spilte `dyreste`, og målte −0,171 ± 0,028. Regelen har to
   * uavhengige deler – NÅR den slår inn, og HVA den spiller i stedet – og et
   * negativt tall på den ene kombinasjonen skiller dem ikke. Denne prøver
   * samme betingelse med motsatt erstatning. Slår begge negativt ut, er det
   * betingelsen som er feil, og da er hele vakt 5 død.
   */
  readonly draBilligst?: boolean;
  /** Vakt 2, mild: på et garantert stikk, aldri trumf når et avkast er lovlig. */
  readonly garantiIkkeTrumf: boolean;
  /** Vakt 2, streng: på et garantert stikk, alltid det billigste lovlige kortet. */
  readonly garantiBilligst: boolean;
}

export const INGEN_VAKT: Vaktvalg = { åpning: false, garantiIkkeTrumf: false, garantiBilligst: false };

/** Leser flaggstrengen «a», «t», «b» eller kombinasjoner av dem. */
export function lesVaktflagg(flagg: string): Vaktvalg {
  let valg = INGEN_VAKT;
  for (const tegn of flagg) {
    if (tegn === "a") valg = { ...valg, åpning: true };
    else if (tegn === "h") valg = { ...valg, åpning: true, åpningHøyest: true };
    else if (tegn === "l") valg = { ...valg, åpningLavest: true };
    else if (tegn === "k") valg = { ...valg, kastBilligst: true };
    else if (tegn === "t") valg = { ...valg, garantiIkkeTrumf: true };
    else if (tegn === "b") valg = { ...valg, garantiBilligst: true };
    else if (tegn === "d") valg = { ...valg, ikkeDraTrumf: true, draTerskel: 3 };
    else if (tegn === "D") valg = { ...valg, ikkeDraTrumf: true, draTerskel: 4 };
    else if (tegn === "e") valg = { ...valg, ikkeDraTrumf: true, draTerskel: 3, draBilligst: true };
    else {
      throw new Error(
        `Ukjent vaktflagg «${tegn}» (a = åpning/billigst, h = åpning/høyest, ` +
          `l = åpning/alltid lavest, t = ikke trumf, b = billigst)`,
      );
    }
  }
  if (valg === INGEN_VAKT) throw new Error("Tom vaktspesifikasjon – oppgi minst ett av a, t, b");
  return valg;
}

/** Deler «vakt:<flagg>:<resten>» i flagg og indre kandidatspesifikasjon. */
export function delVaktspek(spec: string): { valg: Vaktvalg; flagg: string; indre: string } | null {
  if (!spec.startsWith("vakt:")) return null;
  const rest = spec.slice(5);
  const skille = rest.indexOf(":");
  if (skille <= 0) throw new Error(`Vaktspesifikasjonen mangler indre kandidat: «${spec}»`);
  const flagg = rest.slice(0, skille);
  return { valg: lesVaktflagg(flagg), flagg, indre: rest.slice(skille + 1) };
}

// --- Regel 1: slå aldri ditt eget etterlyste kort ---------------------------

/**
 * Ville `kort` slått vårt EGET etterlyste kort?
 *
 * Bare BUDVINNEREN kan komme i den situasjonen: det etterlyste kortet ligger
 * per definisjon hos en annen (motoren forbyr å etterlyse et kort man selv har
 * eller har vraket), og den som sitter med det er makkeren. Makkeren selv kan
 * ikke slå kortet – han er den som legger det. En forsvarer SKAL slå det.
 *
 * To situasjoner:
 *   UTSPILL i stikk 1 – makkerplikten tvinger kortet ned, så et utspill som
 *   slår det tar stikket fra vår egen makker. (I senere stikk finnes ingen
 *   makkerplikt, og da er ikke en høy trumf noe konvensjonsbrudd.)
 *   PÅLEGG – det etterlyste kortet ligger på bordet og vinner stikket akkurat
 *   nå. Da er stikket vårt allerede, og å legge over er å slå eget kort.
 */
export function slårEgetEtterlyst(s: GameState, sete: number, kort: Kort): boolean {
  const etterlyst = s.etterlyst;
  if (etterlyst === null || s.trumf === null) return false;
  if (sete !== s.budvinner) return false;
  const trumf = s.trumf;
  const MERKE = -1;

  if (s.bord.length === 0) {
    if (s.stikkSpilt !== 0) return false;
    return stikkvinner(
      [
        { spiller: sete, kort },
        { spiller: MERKE, kort: etterlyst },
      ],
      trumf,
    ) === sete;
  }

  const påBordet = s.bord.find((b) => likeKort(b.kort, etterlyst));
  if (påBordet === undefined) return false;
  if (stikkvinner(s.bord, trumf) !== påBordet.spiller) return false; // vinner ikke nå uansett
  return stikkvinner(s.bord.concat({ spiller: sete, kort }), trumf) === sete;
}

// --- Regel 2: garantert stikk ------------------------------------------------

/**
 * Er stikket alt sikret for VÅRT lag, ut fra det `sete` selv kan se, og er det
 * en MEDSPILLER som leder det? (Leder en motstander, er det ikke vårt stikk;
 * er bordet tomt, er det ikke noe stikk å sikre ennå.)
 */
export function garantertVårt(s: GameState, sete: number): boolean {
  if (s.fase !== "SPILL" || s.trumf === null || s.bord.length === 0) return false;
  const våre = lagetSynlig(s, sete);
  if (våre === null) return false;
  const leder = stikkvinner(s.bord, s.trumf);
  if (leder === sete || !våre.includes(leder)) return false;
  return garantertSynlig(s, sete, våre);
}

/**
 * Er det etterlyste kortet garantert å ta stikk 1?
 *
 * Det holder at ingen ukjent trumf ligger OVER etterlysningen. Ukjent vil si
 * verken på egen hånd, i eget vrak eller spilt – `ukjenteKort` regner alle
 * tre. Ligger de høye trumfene hos oss selv eller i vraket, kan ingen forsvarer
 * slå kortet, og makkeren tar stikket med det (makkerplikten tvinger det ned).
 *
 * Merk at etterlysningen selv er «ukjent» for oss – den ligger jo hos makkeren
 * – men den er ikke høyere enn seg selv, så den teller ikke som trussel.
 */
function etterlystGarantert(s: GameState, sete: number): boolean {
  const e = s.etterlyst;
  if (e === null || s.trumf === null) return false;
  const trumf = s.trumf;
  return !ukjenteKort(s, sete).some((k) => k.farge === trumf && k.verdi > e.verdi);
}

/** Ville `kort` tatt stikket slik bordet står nå? */
function vinnerMed(s: GameState, sete: number, kort: Kort): boolean {
  return stikkvinner(s.bord.concat({ spiller: sete, kort }), s.trumf!) === sete;
}

// --- Selve vakten ------------------------------------------------------------

/**
 * Kortet vakten ville lagt i stedet for `valgt`. Returnerer `valgt` uendret
 * når ingen regel slår inn – det er hovedtilfellet.
 */
/**
 * Hvor mange trumf setet IKKE kan se – altså står ute hos de andre.
 *
 * `ukjenteKort` er allerede vrak-bevisst: budvinneren vet at hans egne fire
 * vrakede kort er døde, en forsvarer vet det ikke. Det er nøyaktig riktig
 * her, og grunnen til at regelen ikke bygger sin egen telling.
 */
function trumfUte(s: GameState, sete: number): number {
  if (s.trumf === null) return 0;
  const trumf = s.trumf;
  return ukjenteKort(s, sete).filter((k) => k.farge === trumf).length;
}

export function vaktKort(s: GameState, sete: number, valgt: Kort, valg: Vaktvalg): Kort {
  if (s.fase !== "SPILL" || s.trumf === null) return valgt;
  const trumf = s.trumf;
  const lovlige = lovligeKort(s, sete);
  if (lovlige.length <= 1) return valgt;

  /**
   * Vakt 5 står FØRST fordi den bare gjelder utspill der bordet er tomt og
   * stikk 1 er unnagjort – altså stillinger ingen av de andre vaktene rører.
   * Skulle de likevel overlappe en dag, er rekkefølgen dokumentert her og
   * ikke tilfeldig: vakt 3 gjelder BARE stikk 1, og vakt 5 gjelder aldri der.
   */
  if (
    valg.ikkeDraTrumf === true && s.bord.length === 0 && s.stikkSpilt > 0 &&
    sete === s.budvinner && valgt.farge === trumf &&
    trumfUte(s, sete) >= (valg.draTerskel ?? 3)
  ) {
    const andre = lovlige.filter((k) => k.farge !== trumf);
    // Har vi bare trumf igjen, er det ikke noe valg å ta og regelen tier.
    if (andre.length > 0) return valg.draBilligst === true ? billigste(andre, trumf) : dyreste(andre, trumf);
  }

  // Vakt 3 må stå FØR vakt 1: der den slår inn, er vakt 1 automatisk oppfylt –
  // den laveste trumfen kan ikke slå det etterlyste kortet.
  if (
    valg.åpningLavest === true && s.bord.length === 0 && s.stikkSpilt === 0 &&
    sete === s.budvinner && etterlystGarantert(s, sete)
  ) {
    const trumfKort = lovlige.filter((k) => k.farge === trumf);
    if (trumfKort.length > 0) return billigste(trumfKort, trumf);
  }

  if (valg.åpning && slårEgetEtterlyst(s, sete, valgt)) {
    const trygge = lovlige.filter((k) => !slårEgetEtterlyst(s, sete, k));
    // Finnes ikke et lovlig kort som lar det etterlyste stå, spilles det
    // billigste lovlige: da er skaden uunngåelig, og da skal den være minst.
    if (trygge.length === 0) return billigste(lovlige, trumf);
    // Varianten «høyest under» gjelder bare utspillet. På et pålegg er kortet
    // uansett bortkastet, og da er billigst det eneste rimelige.
    if (valg.åpningHøyest === true && s.bord.length === 0) return dyreste(trygge, trumf);
    return billigste(trygge, trumf);
  }

  // Vakt 4: stikket kan ikke tas av oss. Står bordet tomt, er det ikke noe
  // stikk å tape ennå. Ellers gjelder regelen uansett hvem som leder – se
  // kommentaren over `kastBilligst` for hvorfor de to tilfellene er samme sak.
  if (valg.kastBilligst === true && s.bord.length > 0) {
    if (!lovlige.some((k) => vinnerMed(s, sete, k))) return billigste(lovlige, trumf);
  }

  if ((valg.garantiIkkeTrumf || valg.garantiBilligst) && garantertVårt(s, sete)) {
    if (valg.garantiBilligst) return billigste(lovlige, trumf);
    if (valgt.farge === trumf) {
      const avkast = lovlige.filter((k) => k.farge !== trumf);
      if (avkast.length > 0) return billigste(avkast, trumf);
    }
  }

  return valgt;
}

/** Det en vakt trenger av den innpakkede agenten. */
export interface Innagent {
  velgHandling(state: GameState): Handling;
  nyKamp?(): void;
}

/** Legger vaktreglene utenpå en vilkårlig agent uten å røre resten av spillet. */
export class Konvensjonsvakt implements Innagent {
  private readonly indre: Innagent;
  private readonly valg: Vaktvalg;
  /** Hvor mange kortvalg vakten har overstyrt – kontroll på at den virker. */
  overstyrt = 0;
  valgTotalt = 0;

  constructor(indre: Innagent, valg: Vaktvalg) {
    this.indre = indre;
    this.valg = valg;
  }

  nyKamp(): void {
    this.indre.nyKamp?.();
  }

  velgHandling(state: GameState): Handling {
    const h = this.indre.velgHandling(state);
    if (h.type !== "SPILL") return h;
    this.valgTotalt++;
    const kort = vaktKort(state, h.spiller, h.kort, this.valg);
    if (likeKort(kort, h.kort)) return h;
    this.overstyrt++;
    return { type: "SPILL", spiller: h.spiller, kort };
  }
}
