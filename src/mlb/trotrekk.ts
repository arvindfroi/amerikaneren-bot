/**
 * MLB — TROHODETS TREKK. Bygd fra `spillerVisning` ALENE.
 *
 * Fase 0a i `docs/mlb.md`: tren trohodet veiledet på perfekte etiketter, uten
 * liga, uten kredittilordning, uten mester. Etiketten er HVOR KORTENE FAKTISK
 * LÅ, kjent ved rundeslutt — fasit om fortiden, ikke en dom fra en sterkere
 * spiller.
 *
 * ===================== K2 ER STRUKTURELL HER, IKKE LOVET =================
 *
 * Funksjonen tar en `SpillerVisning`, ikke en `GameState`. Motoren har allerede
 * redigert bort andres hender, talongen, andres vrak og uavslørt makker. Det er
 * ikke mulig å lekke skjult informasjon inn i vektoren uten å endre signaturen,
 * og `test/mlb-k2-tro.test.ts` bytter i tillegg ut de skjulte hendene og krever
 * BIT-IDENTISK trekkvektor.
 *
 * Til sammenlikning tar `e1SpillTrekk` en `GameState` og holder disiplinen ved
 * konvensjon. Den er antakelig ærlig — men «antakelig» er nettopp det K2 ikke
 * godtar.
 *
 * ===================== HVORFOR AKKURAT DISSE TREKKENE ====================
 *
 * Grunnlaget er `neat/trekk.ts` sin `lagInn` (318 trekk), som allerede er
 * bygd på `SpillerVisning` og bærer hånd, historikk, budrunde, renonser,
 * trumfkontroll og lagspill. Oppå ligger en TROBLOKK med det en gjetting om
 * hvor kortene ligger trenger, og som `lagInn` ikke uttrykker:
 *
 *   HVEM_LA        hvem som la HVERT kort. `lagInn` legger alle spilte kort i
 *                  én blokk uten avsender, og «han trumfet, altså er han
 *                  renons» (kanal 4, 92,7 % av all K8-informasjon i dag) er
 *                  nettopp en slutning om AVSENDEREN.
 *   SPILT_FARGE    hvor mange kort hvert sete har lagt i hver farge — den myke
 *                  versjonen av renons, som er der de fleste slutningene bor.
 *   KAPASITET      den analytiske prioren: P(plassering) etter hvor mange kort
 *                  hver plassering har igjen. Referansen `tro-tren.py` kaller
 *                  «alt en teller kan få til». Nettet får den servert i stedet
 *                  for å måtte gjenoppfinne divisjon.
 *   USETT          hvilke av de 52 kortene som i det hele tatt er gjetning.
 *   MITT_VRAK      budvinnerens egne fire kastede kort. Bare hun ser dem
 *                  (`dittVrak`), og for henne er talongklassen umulig.
 *
 * ===================== FIRE KLASSER, IKKE TRE ============================
 *
 * Utgangen er 52 × 4: relativt sete 1, 2, 3 — og TALONGEN. §117s forgjenger
 * glemte den fjerde og «viste» dermed at Adams var verre enn uniform. Troens
 * rader summerer ikke til 1 over de tre setene; resten er talongen. Måling mot
 * et gulv som betinger på «kortet er på en hånd» krever renormalisering.
 */

import { FARGER, type Kort } from "../kort.ts";
import type { SpillerVisning } from "../motor.ts";
import { lagInn, ANTALL_INN as NEAT_INN } from "../neat/trekk.ts";
import { kortIndeks } from "../nevro/trekk.ts";

/** rel sete 1, 2, 3, talong. Samme koding som `moe2/trosnett.ts`. */
export const MLB_TRO_KLASSER = 4;
export const MLB_TRO_KORT = 52;
export const MLB_TRO_UT = MLB_TRO_KORT * MLB_TRO_KLASSER;

// --- Troblokkens layout, relativt til NEAT_INN ------------------------------
/** 52 × 4: hvem la kortet (relativt sete 0 = meg). Alt null = ikke spilt. */
const HVEM_LA = 0;
/** 4 rel seter × 4 farger: antall kort setet har lagt i fargen (/13). */
const SPILT_FARGE = 208;
/** 4 rel seter: kort igjen på hånden (/antallStikk). */
const KORT_IGJEN = 224;
/** 4: analytisk kapasitetsprior over rel sete 1, 2, 3 og talong. */
const KAPASITET = 228;
/** 1: jeg er budvinner, altså er talongklassen umulig for meg. */
const VRAK_KJENT = 232;
/** 52: mine egne vrakede kort (bare budvinneren har noen). */
const MITT_VRAK = 233;
/** 52: kortet er USETT for meg, altså en gjetning. */
const USETT = 285;
/** 1: antall usette kort (/52). */
const USETT_ANTALL = 337;
/** 4: hvor mange usette kort som finnes i hver farge (/13). */
const USETT_FARGE = 338;
const TRO_BLOKK = 342;

export const MLB_TRO_INN = NEAT_INN + TRO_BLOKK;

/** Offsetene eksportert som ÉN kilde til sannhet, som ellers i prosjektet. */
export const TROINNGANG = {
  NEAT: 0,
  HVEM_LA: NEAT_INN + HVEM_LA,
  SPILT_FARGE: NEAT_INN + SPILT_FARGE,
  KORT_IGJEN: NEAT_INN + KORT_IGJEN,
  KAPASITET: NEAT_INN + KAPASITET,
  VRAK_KJENT: NEAT_INN + VRAK_KJENT,
  MITT_VRAK: NEAT_INN + MITT_VRAK,
  USETT: NEAT_INN + USETT,
  USETT_ANTALL: NEAT_INN + USETT_ANTALL,
  USETT_FARGE: NEAT_INN + USETT_FARGE,
} as const;

/**
 * Hvilke kort er SETT av observatøren?
 *
 * Egen hånd, alt som er spilt (historikk + bordet) og — bare for budvinneren —
 * eget vrak. Alt annet er gjetning. Eksportert fordi etikettbyggeren i
 * `examples/mlb-trodata.ts` må bruke NØYAKTIG samme definisjon: er de to uenige,
 * blir et sett kort merket som gjetning eller motsatt, og tapet måler noe annet
 * enn troen.
 */
export function setteKort(visning: SpillerVisning): Set<number> {
  const sett = new Set<number>();
  for (const k of visning.dinHånd) sett.add(kortIndeks(k));
  for (const stikk of visning.historikk) for (const kp of stikk.kort) sett.add(kortIndeks(kp.kort));
  for (const kp of visning.bord) sett.add(kortIndeks(kp.kort));
  for (const k of visning.dittVrak) sett.add(kortIndeks(k));
  return sett;
}

/**
 * Trekkvektoren for trohodet, bygd av lovlig informasjon alene.
 *
 * `antallStikk` er kort per spiller i runden (12 med fire spillere), og
 * `målPoeng` kampens mål. Begge er offentlige regelparametre, ikke tilstand.
 */
export function troTrekk(
  visning: SpillerVisning,
  antallStikk: number,
  målPoeng: number,
): Float32Array {
  const v = new Float32Array(MLB_TRO_INN);
  const grunn = lagInn(visning, "SPILL", antallStikk, målPoeng);
  for (let i = 0; i < NEAT_INN; i++) v[i] = grunn[i] ?? 0;

  const B = NEAT_INN;
  const meg = visning.deg;
  const n = visning.antallKort.length;
  const rel = (sete: number): number => (((sete - meg) % n) + n) % n;

  // --- HVEM_LA og SPILT_FARGE ---------------------------------------------
  const leggInn = (kort: Kort, spiller: number): void => {
    const r = rel(spiller);
    v[B + HVEM_LA + kortIndeks(kort) * 4 + r] = 1;
    v[B + SPILT_FARGE + r * 4 + FARGER.indexOf(kort.farge)]! += 1 / 13;
  };
  for (const stikk of visning.historikk) for (const kp of stikk.kort) leggInn(kp.kort, kp.spiller);
  for (const kp of visning.bord) leggInn(kp.kort, kp.spiller);

  // --- KORT_IGJEN ----------------------------------------------------------
  for (let p = 0; p < n; p++) {
    v[B + KORT_IGJEN + rel(p)] = (visning.antallKort[p] ?? 0) / Math.max(1, antallStikk);
  }

  // --- MITT_VRAK og VRAK_KJENT --------------------------------------------
  const erBudvinner = visning.budvinner === meg;
  if (erBudvinner) v[B + VRAK_KJENT] = 1;
  for (const k of visning.dittVrak) v[B + MITT_VRAK + kortIndeks(k)] = 1;

  // --- USETT ---------------------------------------------------------------
  const sett = setteKort(visning);
  let usett = 0;
  for (let i = 0; i < 52; i++) {
    if (sett.has(i)) continue;
    v[B + USETT + i] = 1;
    v[B + USETT_FARGE + Math.floor(i / 13)]! += 1 / 13;
    usett++;
  }
  v[B + USETT_ANTALL] = usett / 52;

  /**
   * --- KAPASITET: den analytiske prioren -----------------------------------
   *
   * Tre hender med h_i kort igjen og d døde plasser gir P(sete i) = h_i / (Σh +
   * d). Budvinneren SER sitt eget vrak, så for henne er d = 0 og talongen en
   * umulig klasse — nøyaktig samme asymmetri som `vrakLogVekt` er stum for i
   * §117, og av samme grunn.
   *
   * Døde plasser regnes av det som faktisk er igjen (usett − Σh) og ikke av
   * regelen, slik at blokken er riktig også om giveregelen endres.
   */
  {
    let sumH = 0;
    for (let p = 0; p < n; p++) if (p !== meg) sumH += visning.antallKort[p] ?? 0;
    const døde = erBudvinner ? 0 : Math.max(0, usett - sumH);
    const total = sumH + døde;
    if (total > 0) {
      for (let p = 0; p < n; p++) {
        const r = rel(p);
        if (r < 1 || r > 3) continue;
        v[B + KAPASITET + (r - 1)] = (visning.antallKort[p] ?? 0) / total;
      }
      v[B + KAPASITET + 3] = døde / total;
    }
  }

  return v;
}
