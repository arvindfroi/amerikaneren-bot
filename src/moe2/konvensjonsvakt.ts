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
 *   vakt:l:e1:e1-modell/sd-r2.bin     ALLTID laveste trumf ut (menneskeregelen)
 *   vakt:t:e1:e1-modell/sd-r2.bin     bare «garantert: aldri trumf»
 *   vakt:b:e1:e1-modell/sd-r2.bin     bare «garantert: alltid billigst»
 *   vakt:at:e1:e1-modell/sd-r2.bin    begge (billigst-varianten av vakt 2 er b)
 */

import { likeKort, type Kort } from "../kort.ts";
import { lovligeKort, stikkvinner, type GameState, type Handling } from "../motor.ts";
import { billigste, dyreste, garantertSynlig, lagetSynlig } from "./synlig.ts";

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
   * Vakt 3: som budvinner i stikk 1, spill ALLTID din laveste trumf.
   *
   * Dette er en STERKERE regel enn `åpning`, ikke en variant av den. `åpning`
   * griper bare inn når utspillet ville slått det etterlyste kortet; den lar et
   * lovlig, men middels høyt utspill stå. Denne griper alltid.
   *
   * Grunnlaget er menneskedataene (analyse/menneskedata-2026-08-01.md): på 304
   * parrede stillinger spiller menneskene sin laveste trumf i 99,3 % av
   * kontraktene, NevroHjerne i 44,7 %, SD-orakelet i 22,4 %.
   *
   * MERK at SD er UENIG i denne regelen. SD-rolloutens motstandermodell ER
   * NevroHjerne, så SD svarer på hva som er best mot nevro – ikke mot et
   * menneske. Konvensjonens påståtte verdi er å tvinge forsvaret til et valg,
   * og det forutsetter en motstander som kan presses. Regelen kan derfor godt
   * tape en måling mot nevro og likevel være riktig mot mennesker. Den skal
   * ikke adopteres på benken alene.
   */
  readonly åpningLavest?: boolean;
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
    else if (tegn === "t") valg = { ...valg, garantiIkkeTrumf: true };
    else if (tegn === "b") valg = { ...valg, garantiBilligst: true };
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

// --- Selve vakten ------------------------------------------------------------

/**
 * Kortet vakten ville lagt i stedet for `valgt`. Returnerer `valgt` uendret
 * når ingen regel slår inn – det er hovedtilfellet.
 */
export function vaktKort(s: GameState, sete: number, valgt: Kort, valg: Vaktvalg): Kort {
  if (s.fase !== "SPILL" || s.trumf === null) return valgt;
  const trumf = s.trumf;
  const lovlige = lovligeKort(s, sete);
  if (lovlige.length <= 1) return valgt;

  // Vakt 3 må stå FØR vakt 1: den er strengere og gjelder nøyaktig den samme
  // stillingen (budvinnerens utspill i stikk 1). Slår den inn, er vakt 1
  // automatisk oppfylt – den laveste trumfen kan ikke slå det etterlyste.
  if (valg.åpningLavest === true && s.bord.length === 0 && s.stikkSpilt === 0 && sete === s.budvinner) {
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
