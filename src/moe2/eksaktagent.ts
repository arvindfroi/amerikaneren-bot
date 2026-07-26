/**
 * EKSAKT SLUTTSPILL SOM POLICY – full enumerasjon fra en terskel og ut.
 *
 * Legges utenpå en vilkårlig agent, akkurat som konvensjonsvakten, og
 * overstyrer BARE kortvalg der antall gjenstående stikk er innenfor terskelen
 * OG hele verdensrommet lot seg enumerere innenfor taket. Alt annet er
 * agentens eget spill.
 *
 * HVORFOR DETTE IKKE ER DD OM IGJEN. Dobbelt dummy ble målt til å være feil
 * fasit for kortspillet (−0,609 korrigert korrelasjon mot poeng): den løser én
 * verden der alle fire hender ligger åpne, og velger linjer som bare virker
 * mot et forsvar som ser like mye som deg selv. Her løses HVER verden som er
 * forenlig med det setet faktisk har sett, og kortet velges etter snittet over
 * dem. Informasjonsbildet er vårt eget – det er hele forskjellen.
 *
 * OG HVORFOR DET IKKE ER SD HELLER. SD sampler K verdener og lar en modell
 * (NevroHjerne) spille dem ut. To feilkilder: hvilke K som ble trukket, og hvor
 * god modellen er. Enumerasjonen har ingen av dem – den dekker rommet komplett
 * og løser hver verden eksakt.
 *
 * HVA DEN LIKEVEL IKKE ER. Å ta snittet av DD-verdier over verdener er PIMC med
 * KOMPLETT verdensliste. Hver verden løses som om alle parter – også vi selv,
 * senere i runden – fikk vite hvilken verden det var. Den virkelig optimale
 * strategien må spille samme kort i to verdener den ikke kan skille. Tallet er
 * altså den EKSAKTE PIMC-verdien, og beviselig optimalt bare der ingen
 * framtidig egen beslutning gjenstår (siste stikk, og stillinger der alle
 * gjenstående kortvalg er tvungne). Se toppen av `src/solver/eksakt.ts`.
 *
 * ÆRLIGHETSREGELEN. Blir rommet for stort til å dekkes innenfor taket, gjør
 * agenten INGENTING – den lar den indre agenten bestemme, og teller tilfellet.
 * En avkortet enumerasjon er en skjev sampling (den besøker systematisk de
 * første konfigurasjonene i enumerasjonsrekkefølgen), ikke en fasit, og å
 * bruke den ville gjort «eksakt» til et ord uten innhold. Andelen der
 * enumerasjonen faktisk slo til RAPPORTERES av målingene.
 *
 * SPESIFIKASJON: «eks:<terskel>:<indre kandidat>», f.eks.
 *   eks:3:vakt:at:e1:e1-modell/sd-r2.bin   eksakt de siste 3 stikkene
 *   eks:4:vakt:at:e1:e1-modell/sd-r2.bin   de siste 4
 *
 * Terskelen står YTTERST med vilje: fra terskelen og ut skal enumerasjonen
 * bestemme, også der konvensjonsvakten ville overstyrt. Vakten er en
 * tommelfingerregel for stillinger vi ikke kan regne ut; her KAN vi regne dem
 * ut. Utenfor terskelen er kandidaten bit for bit dagens beste.
 */

import { likeKort, type Kort } from "../kort.ts";
import { lovligeKort, type GameState, type Handling } from "../motor.ts";
import { eksaktKortverdier, lesInformasjon, tellKonfigurasjoner } from "../solver/eksakt.ts";
import type { Innagent } from "./konvensjonsvakt.ts";

/** Taket på klassekonfigurasjoner. Over det avstår agenten. */
export const STANDARD_TAK = 200_000;

export interface Eksaktvalg {
  /** Gjenstående stikk der enumerasjonen overtar (3 = de siste tre). */
  readonly terskel: number;
  /** Tak på klassekonfigurasjoner per beslutning. */
  readonly maksKonfigurasjoner: number;
}

/** Deler «eks:<terskel>:<resten>» i terskel og indre kandidatspesifikasjon. */
export function delEksaktSpek(spec: string): { valg: Eksaktvalg; indre: string } | null {
  if (!spec.startsWith("eks:")) return null;
  const rest = spec.slice(4);
  const skille = rest.indexOf(":");
  if (skille <= 0) throw new Error(`Eksaktspesifikasjonen mangler indre kandidat: «${spec}»`);
  const terskel = Number(rest.slice(0, skille));
  if (!Number.isInteger(terskel) || terskel < 1) {
    throw new Error(`Ugyldig terskel i «${spec}» – oppgi et helt antall stikk ≥ 1`);
  }
  return { valg: { terskel, maksKonfigurasjoner: STANDARD_TAK }, indre: rest.slice(skille + 1) };
}

/** Tellere som holder metoden ærlig: hvor ofte slo den til, og hvor ofte ikke? */
export interface Eksakttelling {
  /** Kortvalg innenfor terskelen. */
  innenfor: number;
  /** Av dem: enumerasjonen dekket HELE rommet og bestemte kortet. */
  enumerert: number;
  /** Av dem: rommet var for stort – den indre agenten fikk bestemme. */
  avstått: number;
  /** Av de enumererte: enumerasjonen valgte et ANNET kort enn den indre. */
  overstyrt: number;
  /** Samlet tid brukt på enumerasjon (ms). */
  msTotalt: number;
  /** Konfigurasjoner besøkt i alt. */
  konfTotalt: number;
}

/**
 * Kortet enumerasjonen ville lagt i stedet for `valgt`, eller `null` når
 * stillingen er utenfor terskelen eller rommet er for stort.
 */
export function eksaktKort(
  s: GameState,
  sete: number,
  valg: Eksaktvalg,
  telling?: Eksakttelling,
): Kort | null {
  if (s.fase !== "SPILL" || s.budvinner === null || s.melding === null) return null;
  const igjen = s.giving.antallStikk - s.stikkSpilt;
  if (igjen > valg.terskel) return null;
  if (telling) telling.innenfor++;
  // Ett lovlig kort er ikke et valg – ikke bruk et sekund på å bevise det.
  if (lovligeKort(s, sete).length <= 1) {
    if (telling) telling.enumerert++;
    return null;
  }

  // Billig forhåndssjekk: tell konfigurasjonene UTEN å bygge hender eller løse
  // noe. Er rommet for stort, har vi da brukt en brøkdel av det en avkortet
  // enumerasjon ville kostet.
  const info = lesInformasjon(s, sete);
  const forhånd = tellKonfigurasjoner(info, valg.maksKonfigurasjoner);
  if (!forhånd.full) {
    if (telling) telling.avstått++;
    return null;
  }

  const t0 = telling ? performance.now() : 0;
  const svar = eksaktKortverdier(s, sete, { maksKonfigurasjoner: valg.maksKonfigurasjoner });
  if (svar === null || svar.vurderinger.length === 0 || !svar.enumerasjon.full) {
    if (telling) telling.avstått++;
    return null;
  }
  if (telling) {
    telling.enumerert++;
    telling.msTotalt += performance.now() - t0;
    telling.konfTotalt += svar.enumerasjon.konfigurasjoner;
  }
  return svar.vurderinger[0]!.kort;
}

/** Legger eksakt sluttspill utenpå en vilkårlig agent. */
export class EksaktSluttspill implements Innagent {
  private readonly indre: Innagent;
  private readonly valg: Eksaktvalg;
  readonly telling: Eksakttelling = {
    innenfor: 0,
    enumerert: 0,
    avstått: 0,
    overstyrt: 0,
    msTotalt: 0,
    konfTotalt: 0,
  };

  constructor(indre: Innagent, valg: Eksaktvalg) {
    this.indre = indre;
    this.valg = valg;
  }

  nyKamp(): void {
    this.indre.nyKamp?.();
  }

  velgHandling(state: GameState): Handling {
    const h = this.indre.velgHandling(state);
    if (h.type !== "SPILL") return h;
    const kort = eksaktKort(state, h.spiller, this.valg, this.telling);
    if (kort === null || likeKort(kort, h.kort)) return h;
    this.telling.overstyrt++;
    return { type: "SPILL", spiller: h.spiller, kort };
  }
}
