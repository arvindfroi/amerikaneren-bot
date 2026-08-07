/**
 * A6 — SIGNALERING. Én konvensjon, brukt både til å sende og til å lese.
 *
 * Dette er den evnen som skilte Adams tydeligst fra et menneske: partnerspillet
 * har ingen KODE. Fire håndskrevne vaktregler (`abmp`) er ikke et språk — de
 * sier hva man skal gjøre, ikke hva et kort BETYR.
 *
 * ================= HVORFOR DEN HAR EN NATURLIG FORM HER ==================
 *
 * Etter §84 leser verdensmodellen observasjoner som en likelihood:
 *
 *     P(observasjoner | verden) = ∏ P(p la kort c | p sin hånd i w)
 *
 * En KONVENSJON er nettopp en endring i den fordelingen. Sier konvensjonen «et
 * høyt kort betyr styrke i fargen», så er
 *
 *     P(høyt kort | sterk hånd i fargen)  >  P(høyt kort | svak)
 *
 * og likelihooden LESER signalet automatisk. Avsender og mottaker deler
 * dermed én definisjon, og det er ikke en elegant tilfeldighet: en konvensjon
 * der de to sidene har hver sin kode er per definisjon en misforståelse.
 *
 * ================= KONVENSJONEN, OG HVORFOR AKKURAT DEN =================
 *
 * HØY-LAV PÅ ET TAPT STIKK BETYR STYRKE.
 *
 * Valget er fritt bare når kortet ikke endrer stikkets utfall — da koster
 * signalet ingenting i stikk, og det er hele grunnen til at nettopp de
 * stillingene er signalrommet. §70 målte at boten der spiller «feil» kort i
 * 36,2 % av tilfellene uten at det betyr noe. Det er ledig båndbredde.
 *
 * Signalet er svakt med vilje: et menneske kan ha andre grunner til å legge
 * høyt (blanke ut en farge, unngå å bli innspilt). Derfor `STYRKE` som en
 * moderat log-vekt og ikke et krav.
 *
 * ================= HVA DEN IKKE ER ======================================
 *
 * Dette er IKKE et lært språk. Det er én håndvalgt konvensjon, og Arvind har
 * med rette kritisert håndsatte konstanter (§84). Forskjellen er at en
 * konvensjon MÅ være avtalt på forhånd for å virke — to spillere kan ikke
 * lære et felles språk av å observere hverandre uten å først dele en kode.
 *
 * Det den derimot gjør riktig, er at STYRKEN på signalet (`STYRKE`) skal
 * sveipes, og at avsender og mottaker aldri kan drifte fra hverandre.
 */

import type { Farge, Kort } from "../kort.ts";
import type { GameState } from "../motor.ts";

/**
 * Hvor sterkt et observert signal vrir troen. Log-vekt, ikke krav.
 *
 * Lavere enn `STRAFF_IKKE_TRUMFET` (1,5) fordi et signal er en INTENSJON og
 * kan overstyres av spillets krav, mens «du lot et gratis stikk gå» er en
 * observasjon om hva som var mulig.
 */
export const STYRKE = 0.6;

/** Grensen for hva som regnes som «høyt» innen de lovlige kortene. */
const HØY_ANDEL = 0.5;

/** Vinnerkortet slik bordet ligger, gitt trumf. */
function ledende(bord: readonly { kort: Kort; spiller: number }[], trumf: Farge | null): Kort | null {
  if (bord.length === 0) return null;
  let best = bord[0]!.kort;
  for (const kp of bord) {
    if (kp.kort.farge === best.farge) {
      if (kp.kort.verdi > best.verdi) best = kp.kort;
    } else if (trumf !== null && kp.kort.farge === trumf && best.farge !== trumf) {
      best = kp.kort;
    }
  }
  return best;
}

/** Slår `k` det som ligger? */
function slår(k: Kort, best: Kort | null, trumf: Farge | null): boolean {
  if (best === null) return true;
  if (k.farge === best.farge) return k.verdi > best.verdi;
  return trumf !== null && k.farge === trumf && best.farge !== trumf;
}

/**
 * ER DETTE ET SIGNALROM? Bare når ingen av de lovlige kortene kan vinne
 * stikket — da er valget gratis, og først da er det båndbredde å bruke.
 *
 * Kan ett av dem vinne, er valget en STIKKBESLUTNING og skal tas av søket.
 * Å signalere der ville vært å betale for båndbredde med poeng.
 */
export function erSignalrom(state: GameState, lovlige: readonly Kort[]): boolean {
  if (state.fase !== "SPILL" || state.bord.length === 0) return false;
  if (lovlige.length < 2) return false;
  const best = ledende(state.bord, state.trumf);
  return !lovlige.some((k) => slår(k, best, state.trumf));
}

/**
 * KONVENSJONEN, sett fra AVSENDEREN: hvilket kort sier «jeg er sterk i denne
 * fargen»?
 *
 * Høyeste av de lovlige = styrke. Laveste = ingen interesse. Vi returnerer
 * begge, slik at kalleren kan velge etter sin egen hånd — og slik at
 * MOTTAKEREN kan bruke nøyaktig samme funksjon til å tolke.
 */
export function signalkort(lovlige: readonly Kort[]): { styrke: Kort; svakhet: Kort } {
  const sortert = [...lovlige].sort((a, b) => a.verdi - b.verdi);
  return { svakhet: sortert[0]!, styrke: sortert[sortert.length - 1]! };
}

/** Var kortet et STYRKESIGNAL blant de lovlige det ble valgt fra? */
export function erStyrkesignal(kort: Kort, lovlige: readonly Kort[]): boolean {
  if (lovlige.length < 2) return false;
  const sortert = [...lovlige].sort((a, b) => a.verdi - b.verdi);
  const plass = sortert.findIndex((k) => k.farge === kort.farge && k.verdi === kort.verdi);
  return plass >= Math.ceil((sortert.length - 1) * HØY_ANDEL);
}

/**
 * Hva et sete «har lovet» med signalene sine, per farge.
 *
 * Kun ferdigspilte stikk der signalrommet faktisk var åpent — ellers ville vi
 * lest en tvungen handling som et løfte.
 */
export function signalløfter(state: GameState, sete: number): Map<Farge, number> {
  const ut = new Map<Farge, number>();
  for (const stikk of state.historikk) {
    if (stikk.kort.length < 2) continue;
    const eget = stikk.kort.find((kp) => kp.spiller === sete);
    if (eget === undefined) continue;
    // Vant hen stikket, var kortet en stikkbeslutning og ikke et signal.
    const best = ledende(stikk.kort, state.trumf);
    if (best !== null && best.farge === eget.kort.farge && best.verdi === eget.kort.verdi) continue;
    // Signalet gjelder fargen kortet ble lagt I.
    const f = eget.kort.farge;
    // Grovt: verdi over knekt er et styrkesignal.
    ut.set(f, (ut.get(f) ?? 0) + (eget.kort.verdi >= 11 ? 1 : -1));
  }
  return ut;
}

/**
 * MOTTAKERSIDEN: log-vekt for hvor godt verdenen stemmer med signalene.
 *
 * Lovte et sete styrke i en farge, er en verden der de sitter med lite igjen
 * der mindre forenlig — og omvendt.
 */
export function signalForenlighet(
  state: GameState,
  hender: readonly (readonly Kort[])[],
  observator: number,
): number {
  let logW = 0;
  for (let p = 0; p < hender.length; p++) {
    if (p === observator) continue;
    const løfter = signalløfter(state, p);
    if (løfter.size === 0) continue;
    for (const [f, retning] of løfter) {
      const igjen = (hender[p] ?? []).filter((k) => k.farge === f).length;
      const honnør = (hender[p] ?? []).filter((k) => k.farge === f && k.verdi >= 12).length;
      // Lovet styrke (+) og har honnør igjen -> forenlig. Lovet svakhet (−)
      // og har honnoer -> mindre forenlig.
      const stemmer = retning > 0 ? honnør > 0 || igjen >= 3 : honnør === 0;
      logW += STYRKE * (stemmer ? 1 : -1) * Math.min(1, Math.abs(retning));
    }
  }
  return logW;
}
