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
import { MLB_AUKSJON, auksjonsrekkeTrekk } from "./auksjonsrekke.ts";
import { MLB_TRO_SIGNAL, signalTrekk } from "./signaltrekk.ts";
import { MLB_STILLING, stillingTrekk } from "./stillingtrekk.ts";
import { MLB_TEMPO, tempofaseAv, tempoTrekk, type Tempobok } from "./tempotrekk.ts";
import { MLB_VALGT_BORT, valgtBortTrekk } from "./valgtbort.ts";

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

/**
 * HUKOMMELSEN SOM INNGANG TIL TROEN (K6 → K8, 11. sep).
 *
 * Troen er motstanderspesifikk (§119: 12,34 % → 5,09 % på en annen motstander), men
 * trosnettet hadde ingen måte å vite HVEM det gjettet om. Hukommelsen
 * (`src/mlb/hukommelse.ts`) er nettopp det: 48 tall per motstander om hvordan hun
 * har budt, vraket og spilt i de FERDIGE rundene. Lagt BAKERST, så et nett med de
 * gamle 660 inngangene kan utvides med nullkolonner og gi nøyaktig samme svar.
 *
 * Tallet er skrevet ut her i stedet for importert, fordi `hukommelse.ts` og denne
 * fila ellers ville importert hverandre; `test/mlb-trohukommelse.test.ts` krever at
 * det er lik `HUKOMMELSE_LENGDE_4`.
 */
export const MLB_TRO_HUKOMMELSE = 144;
export const MLB_TRO_INN_H = MLB_TRO_INN + MLB_TRO_HUKOMMELSE;

/**
 * SIGNALBLOKKEN (K8 kanal 5 og 2, 11. sep): `src/mlb/signaltrekk.ts`, lagt BAKERST
 * etter det nettet allerede leser. To bredder, så begge dagens nett kan utvides med
 * nullkolonner og gi nøyaktig samme svar:
 *
 *   MLB_TRO_INN_S   660 + 116   uten hukommelse
 *   MLB_TRO_INN_HS  804 + 116   med hukommelse
 */
export const MLB_TRO_INN_S = MLB_TRO_INN + MLB_TRO_SIGNAL;
export const MLB_TRO_INN_HS = MLB_TRO_INN_H + MLB_TRO_SIGNAL;

/**
 * SANSER 2 (11. sep): stillingen per sete (`stillingtrekk.ts`, 36) og valgt bort, offentlig
 * (`valgtbort.ts`, 40), BAKERST etter 920. Bare én ny bredde — 920 er det loopen trener — så
 * et 920-nett utvidet med nullkolonner bakerst gir nøyaktig samme svar:
 *
 *   MLB_TRO_INN_HS2   920 + 36 + 40 = 996   (660 | hukommelse | signal | stilling | valgt bort)
 *
 * Begge blokkene er bygd av `SpillerVisning` alene, som resten; se toppen av hver fil.
 */
export const MLB_TRO_SANSER2 = MLB_STILLING + MLB_VALGT_BORT;
export const MLB_TRO_INN_HS2 = MLB_TRO_INN_HS + MLB_TRO_SANSER2;

/**
 * TO NYE SANSER SAMME DAG (12. sep), OG DE ER UAVHENGIGE.
 *
 *   TEMPO     tenketiden til de ANDRE setene, `src/mlb/tempotrekk.ts` (32). Bygd av
 *             `SpillerVisning` og den offentlige tempologgen alene — aldri av observatørens
 *             EGEN tid, og aldri av botenes regnetid (`bottrekk`); se toppen av den fila.
 *   AUKSJON   rekkefølgen meldingene falt i, `src/mlb/auksjonsrekke.ts` (44). Aggregatene
 *             (`passet`, `sisteBud`) kan ikke skille krypern fra hopperen; rekka kan.
 *
 * Begge ble skrevet som «den neste bredden». De utelukker ikke hverandre, og et nett skal
 * kunne ha den ene, den andre, begge eller ingen. Derfor er det FIRE bredder over 996:
 *
 *   MLB_TRO_INN_HS2     996                    (660 | hukommelse | signal | stilling | valgt bort)
 *   MLB_TRO_INN_HS2T    996 + 32      = 1028   (… | tempo)
 *   MLB_TRO_INN_HS2A    996 + 44      = 1040   (… | auksjon)
 *   MLB_TRO_INN_HS2TA   996 + 32 + 44 = 1072   (… | tempo | auksjon)
 *
 * REKKEFØLGEN I 1072 ER DEN DE LANDET I — tempo først. Det er ikke smak: da er 996 → 1028,
 * 996 → 1040, 996 → 1072 og 1028 → 1072 alle nuller BAKERST, og bare 1040 → 1072 må flytte
 * en blokk (auksjonen fra 996 til 1028). `troKolonnekart` gjør nettopp den flyttingen, på
 * NAVN — samme mekanikk som 776 → 920 flytter signalet fra 660 til 804. Legger man nullene
 * bakerst i stedet, leser auksjonsvektene tempoblokken, og troen blir en annen uten at noe
 * feiler. Det er den eneste feilen i denne stigen som ikke krasjer.
 *
 * Løkka trener 996. HVERT steg opp herfra må derfor gi bit-identisk tro for et nett utvidet
 * med nullkolonner; `test/mlb-tempo.test.ts`, `test/mlb-auksjonsrekke.test.ts` og
 * `test/mlb-sanser-stigen.test.ts` krever det, steg for steg og for hele stigen.
 */
export const MLB_TRO_AUKSJON = MLB_AUKSJON;
export const MLB_TRO_INN_HS2T = MLB_TRO_INN_HS2 + MLB_TEMPO;
export const MLB_TRO_INN_HS2A = MLB_TRO_INN_HS2 + MLB_TRO_AUKSJON;
export const MLB_TRO_INN_HS2TA = MLB_TRO_INN_HS2 + MLB_TEMPO + MLB_TRO_AUKSJON;
/** Alle bredder trohodet kan ha. Bredden ER formatet – det finnes ikke noe versjonsfelt. */
export const MLB_TRO_BREDDER: readonly number[] = [
  MLB_TRO_INN,
  MLB_TRO_INN_H,
  MLB_TRO_INN_S,
  MLB_TRO_INN_HS,
  MLB_TRO_INN_HS2,
  MLB_TRO_INN_HS2T,
  MLB_TRO_INN_HS2A,
  MLB_TRO_INN_HS2TA,
];

/**
 * BLOKKENE I HVER BREDDE, i rekkefølge. Én kilde til sannhet for varmstarten: et smalere nett
 * utvides ved å legge hver av SINE blokker der blokken står i den bredere layouten, og null
 * alt annet. 776 → 920 setter altså signalvektene inn på 804 (ikke 660), mens 920 → 996 bare
 * legger nuller bakerst. `verktoy/mlb-tro-tren.py` har den samme tabellen, og
 * `test/mlb-sanser2-utvid.test.ts` krever at de to gir byte-identiske vektfiler.
 */
/**
 * Blokkene i 996, som ALLE de bredere layoutene begynner med. Skrevet ned ÉN gang: fire
 * bredder som gjentok de samme fem linjene kunne drevet fra hverandre i en enkelt rettelse,
 * og et prefiks som ikke stemmer flytter en blokk uten å endre noen bredde.
 */
const HS2_BLOKKER: readonly (readonly [string, number])[] = [
  ["grunn", MLB_TRO_INN],
  ["hukommelse", MLB_TRO_HUKOMMELSE],
  ["signal", MLB_TRO_SIGNAL],
  ["stilling", MLB_STILLING],
  ["valgtbort", MLB_VALGT_BORT],
];

export const MLB_TRO_LAYOUT: Readonly<Record<number, readonly (readonly [string, number])[]>> = {
  [MLB_TRO_INN]: [["grunn", MLB_TRO_INN]],
  [MLB_TRO_INN_H]: [["grunn", MLB_TRO_INN], ["hukommelse", MLB_TRO_HUKOMMELSE]],
  [MLB_TRO_INN_S]: [["grunn", MLB_TRO_INN], ["signal", MLB_TRO_SIGNAL]],
  [MLB_TRO_INN_HS]: [["grunn", MLB_TRO_INN], ["hukommelse", MLB_TRO_HUKOMMELSE], ["signal", MLB_TRO_SIGNAL]],
  [MLB_TRO_INN_HS2]: HS2_BLOKKER,
  [MLB_TRO_INN_HS2T]: [...HS2_BLOKKER, ["tempo", MLB_TEMPO]],
  [MLB_TRO_INN_HS2A]: [...HS2_BLOKKER, ["auksjon", MLB_TRO_AUKSJON]],
  // Tempo FØR auksjon — se `MLB_TRO_INN_HS2TA`. 1040 → 1072 flytter derfor auksjonen 996 → 1028.
  [MLB_TRO_INN_HS2TA]: [...HS2_BLOKKER, ["tempo", MLB_TEMPO], ["auksjon", MLB_TRO_AUKSJON]],
};

/**
 * Kolonnekartet `fra` → `til`: [kildestart, målstart, lengde] per blokk i `fra`. Kaster om en
 * blokk i `fra` ikke finnes i `til` (en utvidelse som MISTER en blokk er ikke en utvidelse).
 */
export function troKolonnekart(fra: number, til: number): [number, number, number][] {
  const a = MLB_TRO_LAYOUT[fra];
  const b = MLB_TRO_LAYOUT[til];
  if (a === undefined || b === undefined) throw new Error(`Ingen trolayout for ${fra} → ${til}`);
  const start = (layout: readonly (readonly [string, number])[], navn: string): number => {
    let o = 0;
    for (const [n, l] of layout) {
      if (n === navn) return o;
      o += l;
    }
    return -1;
  };
  const kart: [number, number, number][] = [];
  let o = 0;
  for (const [navn, lengde] of a) {
    const mål = start(b, navn);
    if (mål < 0) throw new Error(`Blokken «${navn}» i ${fra} finnes ikke i ${til}`);
    kart.push([o, mål, lengde]);
    o += lengde;
  }
  return kart;
}

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

/**
 * `troTrekk` + hukommelsen bakerst (se `MLB_TRO_INN_H`). `null` gir en nullblokk —
 * den ærlige verdien før første runde er ferdig.
 *
 * K2: hukommelsen bokfører bare FERDIGE runder (`Hukommelse.observer`), og det den
 * leser der, er det alle så da runden var over.
 */
export function troTrekkMedHukommelse(
  visning: SpillerVisning,
  antallStikk: number,
  målPoeng: number,
  hukommelse: Float64Array | null,
): Float32Array {
  const v = new Float32Array(MLB_TRO_INN_H);
  v.set(troTrekk(visning, antallStikk, målPoeng), 0);
  if (hukommelse !== null) {
    if (hukommelse.length !== MLB_TRO_HUKOMMELSE) {
      throw new Error(`Hukommelsen har ${hukommelse.length} tall, trosnettet venter ${MLB_TRO_HUKOMMELSE}`);
    }
    for (let i = 0; i < MLB_TRO_HUKOMMELSE; i++) v[MLB_TRO_INN + i] = hukommelse[i]!;
  }
  return v;
}

/**
 * TREKKENE FOR EN GITT BREDDE — den ene veien alle skal gå (via `MlbTronett.trekkFor`
 * og `examples/mlb-trodata.ts --signal`). 660 og 804 er bit-identiske med før; 776 og
 * 920 legger signalblokken bakerst.
 *
 * `tempo` er kampens offentlige tempobok (`--tempo`, 12. sep) og leses BARE av breddene som
 * har tempoblokken (1028 og 1072). `null` — standarden, og alt som fantes før — gir en
 * nullblokk der, som er den ærlige verdien for en runde uten tider. Alle de andre breddene er
 * uberørt av argumentet, og auksjonsblokken (1040 og 1072) trenger det ikke: den leser
 * `visning.budrunde.rekke`, som følger med visningen.
 */
export function troTrekkForBredde(
  bredde: number,
  visning: SpillerVisning,
  antallStikk: number,
  målPoeng: number,
  hukommelse: Float64Array | null,
  tempo: Tempobok | null = null,
): Float32Array {
  if (bredde === MLB_TRO_INN) return troTrekk(visning, antallStikk, målPoeng);
  if (bredde === MLB_TRO_INN_H) return troTrekkMedHukommelse(visning, antallStikk, målPoeng, hukommelse);
  if (bredde === MLB_TRO_INN_HS2) {
    // 920 nøyaktig som over, og de to sanser-2-blokkene bakerst (se `MLB_TRO_INN_HS2`).
    const v = new Float32Array(MLB_TRO_INN_HS2);
    v.set(troTrekkForBredde(MLB_TRO_INN_HS, visning, antallStikk, målPoeng, hukommelse), 0);
    v.set(stillingTrekk(visning, antallStikk, målPoeng), MLB_TRO_INN_HS);
    v.set(valgtBortTrekk(visning), MLB_TRO_INN_HS + MLB_STILLING);
    return v;
  }
  if (bredde === MLB_TRO_INN_HS2T || bredde === MLB_TRO_INN_HS2A || bredde === MLB_TRO_INN_HS2TA) {
    /**
     * 996 nøyaktig som over, og de nye blokkene bakerst i LAYOUTENS rekkefølge.
     *
     * Offsetene slås opp i `MLB_TRO_LAYOUT` og skrives ikke ned her: auksjonen ligger på 996 i
     * 1040 og på 1028 i 1072, så ett håndskrevet offset ville vært riktig for den ene bredden
     * og stille galt for den andre — blokken hadde havnet oppå tempoet, og begge sansene ville
     * blitt lest som støy uten at noe feilet.
     */
    const v = new Float32Array(bredde);
    v.set(troTrekkForBredde(MLB_TRO_INN_HS2, visning, antallStikk, målPoeng, hukommelse), 0);
    let o = 0;
    for (const [navn, lengde] of MLB_TRO_LAYOUT[bredde] ?? []) {
      if (navn === "tempo") v.set(tempoTrekk(visning, tempo, tempofaseAv(visning.fase) ?? "S"), o);
      else if (navn === "auksjon") v.set(auksjonsrekkeTrekk(visning), o);
      o += lengde;
    }
    return v;
  }
  if (bredde !== MLB_TRO_INN_S && bredde !== MLB_TRO_INN_HS) {
    throw new Error(`Trohodet har ingen trekkbredde ${bredde} (${MLB_TRO_BREDDER.join(", ")})`);
  }
  const grunn =
    bredde === MLB_TRO_INN_HS
      ? troTrekkMedHukommelse(visning, antallStikk, målPoeng, hukommelse)
      : troTrekk(visning, antallStikk, målPoeng);
  const v = new Float32Array(bredde);
  v.set(grunn, 0);
  v.set(signalTrekk(visning), grunn.length);
  return v;
}
