/**
 * EKSPERTRAMMEN – det seks eksperter deler, og det de ikke deler.
 *
 * DE DELER: formen på en måling. Hver eneste ekspert måles som ANGER mot en
 * deterministisk fasit over de lovlige handlingene i stillingen:
 *
 *     anger = max(fasit) − fasit(valgt)
 *
 * Det gir tre tall fra SAMME utvalg, i samme kall, uten et eneste sampletrinn:
 *   kandidat = anger for nettets valg
 *   gulv     = max(fasit) − snitt(fasit)   ← eksakt forventning ved uniformt
 *                                            lovlig valg, ikke estimert
 *   tak      = anger for NevroHjernes valg
 * Det er nøyaktig målekontrakten i docs/moe2.md, og den er umulig å bryte her:
 * `målEkspert` er den eneste veien til en `Maaling`, og den henter alle tre
 * fra den samme `Stilling`-lista.
 *
 * DE DELER IKKE: genom, innovasjonsbok, sensorer, utgangslag eller fasit. Det
 * var hele feilen i den gamle arkitekturen (feil 7 i docs/moe2.md): ett genom
 * med mange hoder ga indre bytteforhold, og budhodet kunne senke anger ved å
 * spille dårligere. Her har hver ekspert sin egen `Populasjon` med sin egen
 * `Innovasjonsbok`, og et genom fra én ekspert er ikke engang TYPEMESSIG
 * kompatibelt med en annens (ulikt antall innganger og utganger).
 *
 * PORTVAKTEN ER IKKE LÆRT. `portvakt()` under er en ren funksjon av fase og
 * rolle – begge observerbare. Ingen gating-modell, ingen lærte vekter.
 */

import { type Fase, type GameState } from "../../motor.ts";
import {
  Innovasjonsbok,
  type Genom,
  type MutasjonsRater,
  klonGenom,
  muter,
  nyttGenom,
} from "../../neat/genom.ts";
import { Nettverk } from "../../neat/nett.ts";
import { mål, type Maaling } from "../maaling.ts";

// ---------------------------------------------------------------------------
// Portvakten – deterministisk, ikke lært
// ---------------------------------------------------------------------------

export type Ekspertnavn =
  | "bud"
  | "vrak"
  | "trumf"
  | "spill-fører"
  | "spill-forsvar"
  | "spill-makker";

export type Rolle = "fører" | "makker" | "forsvar";

/**
 * Rollen en spiller HAR, avgjort av spillets egne data.
 *
 * Makkeren kjenner seg selv fra første stund – hen holder det etterlyste
 * kortet. Det er ikke skjult informasjon for makkeren selv; det er den samme
 * kunnskapen `ER_HEMMELIG_MAKKER` koder i inngangsvektoren.
 */
export function rolleFor(state: GameState, spiller: number): Rolle {
  if (state.budvinner === spiller) return "fører";
  if (state.makker === spiller) return "makker";
  return "forsvar";
}

/**
 * Hvilken ekspert som svarer. Ren funksjon av fase og rolle.
 *
 * Returnerer null i fasene ingen ekspert eier (RUNDE_SLUTT/FERDIG), og for
 * spillere som ikke er i tur i VRAK/VELG – der er det bare budvinneren som
 * handler.
 */
export function portvakt(state: GameState, spiller: number): Ekspertnavn | null {
  switch (state.fase) {
    case "BUDRUNDE":
      return "bud";
    case "VRAK":
      return state.budvinner === spiller ? "vrak" : null;
    case "VELG":
      return state.budvinner === spiller ? "trumf" : null;
    case "SPILL": {
      const rolle = rolleFor(state, spiller);
      if (rolle === "fører") return "spill-fører";
      if (rolle === "makker") return "spill-makker";
      return "spill-forsvar";
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Stillinger, fasit og holdout
// ---------------------------------------------------------------------------

/** Hvilken del av datasettet en stilling tilhører. */
export type Del = "trening" | "utvikling" | "holdout";

/**
 * En stilling med ferdig utregnet fasit, i ekspertens eget rom.
 *
 * `verdi` er fasiten per lovlig handling, og HØYERE ER BEDRE i alle
 * eksperter – bud måler negativ budfeil, resten måler stikk. Angeren snur
 * fortegnet én gang, i `anger()`, slik at det bare finnes ett sted å ta feil.
 */
export interface Råstilling<H> {
  /**
   * GIVA stillingen kommer fra. Påkrevd, og det er med vilje.
   *
   * MÅLT FEIL som dette hindrer: første utgave delte stillingene med `i % 10`.
   * To stillinger fra samme giv har de samme fire hendene, og havnet da i
   * hver sin del – seleksjonen så altså giva holdout ble målt på. Med 300
   * spillstillinger per rolle ga det et «holdout»-tall på 1,54 der gulvet var
   * 2,46 og alle tolv ferske genom lå mellom 2,46 og 2,80 på et ærlig utvalg.
   * Et ferskt, utrent nett så altså ut til å slå NevroHjerne med god margin.
   * En holdout som deler giv med treningssettet er ikke en holdout.
   */
  readonly gruppe: string | number;
  /** Sensorvektoren, allerede projisert ned i ekspertens inngangsrom. */
  readonly inn: readonly number[];
  /** De lovlige handlingene. Tolkes av eksperten. */
  readonly handlinger: readonly H[];
  /** Fasitverdi per handling, samme rekkefølge. Høyere er bedre. */
  readonly verdi: readonly number[];
  /**
   * Indeksen TAKET velger i akkurat denne stillingen.
   *
   * For de fleste ekspertene er taket NevroHjerne. Det er ikke gitt: taket
   * skal være en referanse som faktisk er bedre enn gulvet på DENNE oppgaven,
   * og det må måles, ikke antas. Budeksperten bruker SD-orakelet selv, fordi
   * nevro er målt til 2,6090 stikks avvik der et uniformt lovlig bud ligger på
   * 2,2229 – taket lå under gulvet. Se `lagBudstillinger`.
   */
  readonly takValg: number;
  /**
   * Indeksen NevroHjerne velger, når taket er noe annet enn nevro.
   *
   * Ren rapporteringslinje. Den finnes fordi «nevro duger ikke som tak her»
   * er en påstand som skal kunne etterprøves i hver eneste rapport, på samme
   * stillinger som kandidaten – ikke bare stå i en kommentar.
   */
  readonly nevroValg?: number | undefined;
  /**
   * Læremålet: utgang → ønsket tanh-verdi. Regnes ut sammen med fasiten, én
   * gang, av eksperten selv. Lagres her fordi den lamarckiske kalibreringen
   * ellers måtte regnet den på nytt for hver epoke og hvert genom.
   */
  readonly læremål: ReadonlyMap<number, number>;
}

export type Stilling<H> = Råstilling<H> & { readonly del: Del };

export interface Utvalg<H> {
  readonly navn: string;
  /** Læringen (lamarckisk kalibrering) kjører her. */
  readonly trening: readonly Stilling<H>[];
  /** Seleksjonen og topologivalget kjører her. */
  readonly utvikling: readonly Stilling<H>[];
  /** Rapporten kjører her. INGEN seleksjon får se disse. */
  readonly holdout: readonly Stilling<H>[];
}

/**
 * Tredeler et sett stillinger deterministisk.
 *
 * HVORFOR TRE OG IKKE TO. docs/moe2.md sier at topologi-evolusjonen skal
 * vurderes «på holdout etter at læringen har konvergert». Gjøres det bokstavelig
 * har seleksjonen sett holdout, og da er den ikke lenger en holdout – tallet
 * vi rapporterer ville vært optimistisk på nøyaktig den måten «beste noensinne
 * over åtte faste giver» var det. Derfor: læringen ser `trening`, seleksjonen
 * og topologivalget ser `utvikling`, og `holdout` røres bare av rapporten.
 *
 * Delingen skjer på GIV (`Råstilling.gruppe`), ikke på stilling. To
 * stillinger fra samme giv deler alle fire hender, og å legge dem i hver sin
 * del gir en holdout som ikke er en holdout – se kommentaren på `gruppe`.
 *
 * Nøkkelen hashes deterministisk, så delingen er stabil: å legge til flere
 * giver flytter ingen eksisterende giv fra én del til en annen.
 */
export function delUtvalg<H>(
  navn: string,
  alle: readonly Råstilling<H>[],
  fordeling: { trening: number; utvikling: number } = { trening: 6, utvikling: 2 },
): Utvalg<H> {
  const trening: Stilling<H>[] = [];
  const utvikling: Stilling<H>[] = [];
  const holdout: Stilling<H>[] = [];
  const t = fordeling.trening;
  const u = t + fordeling.utvikling;
  if (t < 0 || u > 10) throw new Error("delUtvalg: fordelingen må ligge innenfor 10 deler");
  for (const s of alle) {
    const r = bøtte(s.gruppe);
    if (r < t) trening.push({ ...s, del: "trening" });
    else if (r < u) utvikling.push({ ...s, del: "utvikling" });
    else holdout.push({ ...s, del: "holdout" });
  }
  return { navn, trening, utvikling, holdout };
}

/** FNV-1a over gruppenøkkelen → bøtte 0..9. Deterministisk, plattformfri. */
export function bøtte(gruppe: string | number): number {
  const s = String(gruppe);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 10;
}

// ---------------------------------------------------------------------------
// Eksperten
// ---------------------------------------------------------------------------

export interface Ekspert<H> {
  readonly navn: Ekspertnavn;
  /** Fasen portvakten sender stillinger hit fra. */
  readonly fase: Fase;
  /** Rollen, der fasen deles på rolle. */
  readonly rolle: Rolle | null;
  /** Indeksene i den fulle 318-vektoren eksperten faktisk får se. */
  readonly sensorer: readonly number[];
  readonly antallUt: number;
  /** Nettets valg: indeks i `handlinger`. */
  velg(ut: readonly number[], s: Råstilling<H>): number;
}

/** Angeren for et valg: fasitens beste minus det valgte. Aldri negativ. */
export function anger<H>(s: Råstilling<H>, valg: number): number {
  let beste = -Infinity;
  for (const v of s.verdi) if (v > beste) beste = v;
  const valgt = s.verdi[valg];
  if (valgt === undefined) throw new Error("anger: valget er ikke en lovlig handling");
  return beste - valgt;
}

/**
 * Gulvet for én stilling: forventet anger ved UNIFORMT lovlig valg.
 *
 * Eksakt, ikke samplet – `max − snitt` er den nøyaktige forventningen når
 * alle lovlige handlinger er like sannsynlige. Et samplet gulv ville lagt til
 * støy nøyaktig der vi trenger presisjon mest, siden hele spørsmålet er om
 * kandidaten i det hele tatt er over det.
 */
export function gulvFor<H>(s: Råstilling<H>): number {
  let beste = -Infinity;
  let sum = 0;
  for (const v of s.verdi) {
    if (v > beste) beste = v;
    sum += v;
  }
  return beste - sum / s.verdi.length;
}

/**
 * DEN ENESTE VEIEN TIL EN MÅLING AV EN EKSPERT.
 *
 * Kaster hvis utvalget ikke har en holdout i det hele tatt. Det er et
 * bevisst hinder: en ekspert uten holdout kan ikke rapporteres, og da kan
 * heller ingen tro på tallet den produserer.
 */
export function målEkspert<H>(
  ekspert: Ekspert<H>,
  genom: Genom,
  utvalg: Utvalg<H>,
  del: Del,
  navn = `${ekspert.navn}/${del}`,
): Maaling {
  if (utvalg.holdout.length === 0) {
    throw new Error(
      `${ekspert.navn}: utvalget «${utvalg.navn}» har ingen holdout. En ekspert uten ` +
        `holdout kan ikke måles – da er tallet en treningsscore som later som noe annet.`,
    );
  }
  const stillinger =
    del === "holdout" ? utvalg.holdout : del === "utvikling" ? utvalg.utvikling : utvalg.trening;
  if (stillinger.length === 0) throw new Error(`${ekspert.navn}: delen «${del}» er tom`);
  const nett = new Nettverk(genom);
  return mål({
    navn,
    stillinger,
    holdout: del === "holdout",
    retning: "lavereErBedre",
    kandidat: (s) => anger(s, ekspert.velg(nett.aktiver(s.inn), s)),
    gulv: gulvFor,
    tak: (s) => anger(s, s.takValg),
  });
}

// ---------------------------------------------------------------------------
// Populasjonen – én per ekspert, ingenting delt
// ---------------------------------------------------------------------------

/**
 * VEKTMUTASJON ER AV. Målt: seleksjon på støyete fitness ga −4,4 til −24,6
 * poeng over 525–1525 generasjoner, og vektmutasjonen var hovedkilden til
 * driften (den er en ubalansert tilfeldig gange uten tilbakestillende kraft,
 * se `normaliserVekter`). Fasit-læringen virker svakt, seleksjonen virker
 * ikke i det hele tatt – så her lærer vektene, og NEAT får bare gjøre det
 * bare NEAT kan: finne strukturen.
 */
export const MOE2_RATER: MutasjonsRater = {
  normaliser: 1.5,
  vekter: 0, // AV. Ikke skru på uten en A/B med gulv og tak fra samme utvalg.
  nyVekt: 0,
  styrke: 0,
  nyKobling: 0.6,
  nyNode: 0.2,
  beskjær: 0.25,
  veksle: 0.03,
};

export interface PopulasjonOpts {
  readonly antall?: number;
  readonly frø?: number;
  readonly koblingerPerUt?: number;
  readonly rater?: MutasjonsRater;
}

/** Deterministisk PRNG (mulberry32) – samme som resten av kodebasen. */
function lagRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Populasjon<H> {
  readonly ekspert: Ekspert<H>;
  /** EGEN innovasjonsbok. Deles aldri med en annen ekspert. */
  readonly bok: Innovasjonsbok;
  readonly genomer: Genom[];
  private readonly rng: () => number;
  private readonly rater: MutasjonsRater;

  constructor(ekspert: Ekspert<H>, opts: PopulasjonOpts = {}) {
    this.ekspert = ekspert;
    this.rng = lagRng(opts.frø ?? 0x4d6f4532);
    this.rater = opts.rater ?? MOE2_RATER;
    const antallInn = ekspert.sensorer.length;
    this.bok = new Innovasjonsbok(antallInn, ekspert.antallUt);
    this.genomer = [];
    const antall = opts.antall ?? 24;
    for (let i = 0; i < antall; i++) {
      this.genomer.push(
        nyttGenom(antallInn, ekspert.antallUt, this.bok, this.rng, opts.koblingerPerUt ?? 5),
      );
    }
  }

  /**
   * LAMARCKISK KALIBRERING – hovedmotoren.
   *
   * Vektene skrives rett i genomet, så det nettet lærer i løpet av livet
   * arves. Kalibreringen bruker `kalibrerUtgang` med dybde 1: målt
   * 2026-07-25 er den grunne delta-regelen BEDRE enn ekte tilbakeforplantning
   * på evolverte genom (holdout-anger 0,9366 mot 0,9650/0,9801/0,9790 for
   * steg 2/4/8) – å oppdatere de skjulte nodene river i stykker struktur
   * evolusjonen har bygget.
   *
   * Kaster hvis noen stilling er merket holdout. Det er invarianten fra
   * docs/moe2.md gjort til kode i stedet for til en vane.
   *
   * ASYMMETRISK LÆRING. `vektAvFeil` skalerer raten med fortegnet på feilen
   * (fasit − utgang). Delta-regelen er gradienten til et kvadratisk tap, og et
   * kvadratisk tap straffer de to retningene likt – som er MÅLT feil for
   * budet: ett stikk for høyt koster 14,75 poeng, ett for lavt 1,51. Med en
   * vekt per side blir gradienten den til et asymmetrisk kvadratisk tap, og
   * fikspunktet flytter seg fra betinget forventning til den τ-ekspektilen
   * kostnadene faktisk peker på. Se `budLærevekt` i `bud.ts`.
   *
   * Standard er `undefined` – altså symmetrisk – fordi de andre ekspertene
   * ikke har en målt asymmetri ennå. Å gjette en er verre enn å la være.
   */
  lærEpoke(
    stillinger: readonly Stilling<H>[],
    rate = 0.05,
    vektAvFeil?: (feil: number) => number,
  ): void {
    for (const s of stillinger) {
      if (s.del === "holdout") {
        throw new Error(
          `${this.ekspert.navn}: forsøk på å lære av en holdout-stilling. ` +
            `Holdout er det eneste tallet vi kan tro på – den røres ikke av læring.`,
        );
      }
    }
    for (const g of this.genomer) {
      const nett = new Nettverk(g);
      for (const s of stillinger) {
        if (s.læremål.size === 0) continue;
        nett.aktiver(s.inn);
        for (const [utgang, y] of s.læremål) {
          const v = vektAvFeil === undefined ? 1 : vektAvFeil(y - nett.lesUtgang(utgang));
          if (v !== 0) nett.kalibrerUtgang(utgang, y, rate * v);
        }
      }
    }
  }

  /** Snittanger for hvert genom på et sett stillinger. */
  rangér(stillinger: readonly Stilling<H>[]): { genom: Genom; anger: number }[] {
    if (stillinger.length === 0) throw new Error(`${this.ekspert.navn}: rangering uten stillinger`);
    return this.genomer
      .map((g) => {
        const nett = new Nettverk(g);
        let sum = 0;
        for (const s of stillinger) sum += anger(s, this.ekspert.velg(nett.aktiver(s.inn), s));
        return { genom: g, anger: sum / stillinger.length };
      })
      .sort((a, b) => a.anger - b.anger);
  }

  /**
   * TOPOLOGI-EVOLUSJON. Seleksjonen kjører på UTVIKLINGSSETTET – aldri på
   * holdout, og aldri på treningssettet (der har læringen alt tilpasset seg).
   *
   * Ingen kryssing og ingen artsinndeling her: begge deler er meningsfulle
   * først når vektene også muterer, og de gjør de ikke (MOE2_RATER.vekter=0).
   * Halve feltet beholdes som det er, halve erstattes av topologimuterte
   * kloner av de beste.
   */
  nyGenerasjon(utvikling: readonly Stilling<H>[]): { beste: number; median: number } {
    for (const s of utvikling) {
      if (s.del !== "utvikling") {
        throw new Error(
          `${this.ekspert.navn}: seleksjon på «${s.del}»-stillinger. Seleksjonen ser bare ` +
            `utviklingssettet – ellers er holdout ikke lenger en holdout.`,
        );
      }
    }
    const rangert = this.rangér(utvikling);
    const beholdt = Math.max(1, Math.floor(this.genomer.length / 2));
    const neste: Genom[] = rangert.slice(0, beholdt).map((r) => r.genom);
    while (neste.length < this.genomer.length) {
      const forelder = rangert[Math.floor(this.rng() * beholdt)]!.genom;
      const barn = klonGenom(forelder);
      muter(barn, this.bok, this.rng, this.rater);
      neste.push(barn);
    }
    this.genomer.length = 0;
    this.genomer.push(...neste);
    return {
      beste: rangert[0]!.anger,
      median: rangert[Math.floor(rangert.length / 2)]!.anger,
    };
  }
}

// ---------------------------------------------------------------------------
// Små felleshjelpere for fasitbygging
// ---------------------------------------------------------------------------

/** Min–max-normaliserer verdier til [−ytter, +ytter]. Flat liste → tom map. */
export function rangeringsmål(
  verdier: readonly { utgang: number; verdi: number }[],
  ytter = 0.8,
): Map<number, number> {
  const ut = new Map<number, number>();
  if (verdier.length === 0) return ut;
  let min = Infinity;
  let maks = -Infinity;
  for (const v of verdier) {
    if (v.verdi < min) min = v.verdi;
    if (v.verdi > maks) maks = v.verdi;
  }
  const spenn = maks - min;
  if (spenn < 1e-12) return ut; // ingenting å rangere – ikke lær støy
  for (const v of verdier) ut.set(v.utgang, -ytter + 2 * ytter * ((v.verdi - min) / spenn));
  return ut;
}
