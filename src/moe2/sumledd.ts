/**
 * DE FEM LEDDENE — de eksisterende modulene uttrykt som TALL PER KORT.
 *
 * `sumvelger.ts` har rammeverket og begrunnelsen. Denne fila har innmaten: de
 * fem delene av boten, hver omskrevet fra «hva jeg ville lagt» til «hva jeg
 * synes om hvert lovlige kort».
 *
 *     nett   `E1Agent.scorer`      logits per lovlig kort
 *     vakt   `vaktKort`            indikator på kortet konvensjonen vil ha
 *     søk    `alphaMu`             snittutfallet per kandidatkort
 *     stil   `Økt.stilvri`         nærhet til den lærte prisrangen
 *     race   `racepress`           kvantilkorreksjonen kampstillingen ber om
 *
 * ================= HVA SOM ER FORSKJELLEN FRA STABELEN ==================
 *
 * I stabelen er hvert av disse et LAG som kan skrive over det under. Her er de
 * fem tall som legges sammen. Tre konsekvenser er verdt å si høyt:
 *
 *   BASISKORTET. Vakten og stilen er begge definert i forhold til «kortet det
 *   indre laget ville lagt». I stabelen er det kortet den forrige overstyringen
 *   sitt; her er det NETTETS argmaks, alltid. Det er nettopp poenget — alle
 *   leddene leser samme grunnlag i stedet for hverandres utdata, og da kan de
 *   ikke lenger stå i kø.
 *
 *   SØKET OG RACET ER SKILT. `Alphamuagent` blander dem inne i én score:
 *   `(1−vekt)·snitt + vekt·kvantil`. Her er snittet ett ledd og kvantil−snitt
 *   et annet, med hver sin vekt. Det er IKKE den samme funksjonen — se
 *   kommentaren over `raceledd`.
 *
 *   VEKT 0 ER IKKE «REGN OG GANG MED NULL». `velgSum` kaller ikke et ledd med
 *   vekt 0, og buffret under gjør at søk og race deler ÉN alpha-mu når begge
 *   er på. Søket koster ~100 ms per beslutning; det er den ene kostnaden i
 *   summen som ikke er neglisjerbar.
 */

import type { GameState } from "../motor.ts";
import { lagRng, likeKort, type Kort } from "../kort.ts";
import { kortIndeks } from "../nevro/trekk.ts";
import { argmaks, type Ledd } from "./sumvelger.ts";
import { vaktKort, type Vaktvalg } from "./konvensjonsvakt.ts";
import { alphaMu, type Gren } from "./alphamu.ts";
import { standardMål, trekkVerdener, type Utspiller } from "./sdkort.ts";
import { racepress, racescore, snittOgSpredning } from "./race.ts";
import { rangOgPolicy } from "./stilbias.ts";
import { rolleFor, type Rolle } from "./rolleorakel.ts";
import type { Økt } from "./okt.ts";

/** Vektene og knottene summen kjøres med. Alle vekter 0 = leddet finnes ikke. */
export interface Sumvekter {
  readonly nett: number;
  readonly vakt: number;
  readonly sok: number;
  readonly stil: number;
  readonly race: number;
  /** Verdener alpha-mu får per beslutning. Bare brukt av søk- og raceleddet. */
  readonly verdener: number;
  /** Kandidatverdener importance-samplingen velger mellom. */
  readonly kand: number;
  /** Egne framtidige beslutninger søket går over. 1 = dagens dybde. */
  readonly M: number;
  /**
   * Setene søket kjører i. Tomt = alle.
   *
   * KOSTNADEN ER GRUNNEN. §103 målte dessuten søk i makker og forsvar til
   * −0,2837 ± 0,0519 (z = −5,5), så «alle» er en måling som må gjøres, ikke en
   * standard som kan arves.
   */
  readonly roller: readonly Rolle[];
  /** Hvor langt ut i halen racekvantilen går. Se `raceledd`. */
  readonly rlambda: number;
  /** Frø til verdenstrekningen. Fast, så to armer møter samme verdener. */
  readonly frø: number;
}

/** Delene leddene bygges av. Mangler en av dem, skal leddet ikke kunne bes om. */
export interface Sumkilder {
  /** Nettets logits per lovlig kort — `E1Agent.scorer`. */
  readonly scorer: (state: GameState, sete: number) => Map<number, number>;
  /** Konvensjonsflaggene, om vaktleddet er med. */
  readonly vaktvalg: Vaktvalg | null;
  /** Policyen rolloutene spilles med, om søke- eller raceleddet er med. */
  readonly motpart: Utspiller | null;
  /** Økten stilen leses av, om stilleddet er med. */
  readonly økt: Økt | null;
}

/**
 * ARBEID SOM DELES INNENFOR ÉN BESLUTNING.
 *
 * `velgSum` kaller hvert ledd én gang med samme `state`, så bufferet nøkles på
 * stillingen selv. Da regner søk- og raceleddet ÉN alpha-mu mellom seg, og
 * nett-, vakt- og stilleddet ÉN framoverpassering.
 *
 * `WeakMap` og ikke et felt, fordi `GameState` er uforanderlig og lages på nytt
 * for hvert trekk: nøkkelen forsvinner av seg selv når stillingen gjør det. Et
 * felt måtte tømmes av noen, og «noen» er alltid den som glemmer det.
 */
interface Buffer {
  poeng: Map<number, Map<number, number>>;
  grener: Map<number, Gren[] | null>;
}

function lagBuffer(): (s: GameState) => Buffer {
  const kart = new WeakMap<GameState, Buffer>();
  return (s: GameState): Buffer => {
    let b = kart.get(s);
    if (b === undefined) {
      b = { poeng: new Map(), grener: new Map() };
      kart.set(s, b);
    }
    return b;
  };
}

export function lagSumledd(v: Sumvekter, k: Sumkilder): Ledd[] {
  if (v.vakt !== 0 && k.vaktvalg === null) {
    throw new Error(
      "sum: vaktleddet har vekt, men ingen konvensjonsflagg. Oppgi «vaktflagg=<flagg>» " +
        "eller la den indre speken ha et «vakt:<flagg>:»-lag.",
    );
  }
  if ((v.sok !== 0 || v.race !== 0) && k.motpart === null) {
    throw new Error("sum: søke-/raceleddet har vekt, men ingen rollout-motpart ble bygd.");
  }
  if (v.stil !== 0 && k.økt === null) {
    throw new Error(
      "sum: stilleddet har vekt, men speken har ingen «okt:». Uten økten er stilvrien " +
        "null i det uendelige, og leddet ville vært stumt uten at noe sa fra.",
    );
  }

  const buffer = lagBuffer();
  const rng = lagRng(v.frø);

  /** Nettets vurdering, én framoverpassering per (stilling, sete). */
  const poengFor = (s: GameState, sete: number): Map<number, number> => {
    const b = buffer(s);
    let p = b.poeng.get(sete);
    if (p === undefined) {
      p = k.scorer(s, sete);
      b.poeng.set(sete, p);
    }
    return p;
  };

  /**
   * BASISKORTET: det nettet ville lagt, med nettets egen uavgjortregel.
   * `argmaks` er den ene definisjonen, delt med `velgSum`.
   */
  const basisFor = (s: GameState, sete: number, lovlige: readonly Kort[]): Kort =>
    argmaks(lovlige, poengFor(s, sete));

  /** Alpha-mu, én gang per (stilling, sete), delt av søk- og raceleddet. */
  const grenerFor = (s: GameState, sete: number): Gren[] | null => {
    const b = buffer(s);
    if (b.grener.has(sete)) return b.grener.get(sete) ?? null;
    let ut: Gren[] | null = null;
    const rolle = rolleFor(s, sete);
    if (v.roller.length === 0 || (rolle !== null && v.roller.includes(rolle))) {
      const verdener = trekkVerdener(s, sete, v.verdener, rng, undefined, undefined, v.kand);
      if (verdener.length > 0) {
        const g = alphaMu(s, sete, verdener, {
          M: Math.max(1, v.M),
          mål: standardMål,
          motpart: k.motpart!,
        });
        if (g.length > 0) ut = g;
      }
    }
    b.grener.set(sete, ut);
    return ut;
  };

  const nettledd: Ledd = {
    navn: "nett",
    vekt: v.nett,
    /**
     * SOFTMAX, IKKE MIN-MAX. Nettets logits skal bli SANNSYNLIGHETER, fordi
     * magnituden da baerer hvor sikkert nettet er: en trygg stilling gir
     * 0,95/0,03/0,02, en aapen gir 0,4/0,35/0,25.
     *
     * Med min-max ville begge blitt [0, 1], og en konvensjonsbonus paa 0,3
     * ville veltet DEM BEGGE like lett. Da er det ikke en avveining, bare et
     * jevnt dytt - og hele grunnen til aa bygge summen faller bort.
     */
    skala: "softmax",
    poeng: (s, sete) => poengFor(s, sete),
  };

  /**
   * VAKTLEDDET er en INDIKATOR: 1 på kortet konvensjonen vil ha, 0 på resten.
   *
   * Slår ingen regel inn, er kartet TOMT og ikke fullt av nuller. Forskjellen
   * er ikke kosmetisk: `velgSum` hopper over tomme ledd, så leddet vises ikke i
   * `bidrag` i de stillingene det ikke har noe å si. Et ledd som alltid «sier
   * noe» er et ledd man ikke kan lese.
   *
   * Grensetilfellene er de samme som i `Konvensjonsvakt`: vekt 0 = vakten
   * finnes ikke, vekt → uendelig = dagens overstyring. Overstyringen er altså
   * et spesialtilfelle av dette leddet.
   */
  const vaktledd: Ledd = {
    navn: "vakt",
    vekt: v.vakt,
    poeng: (s, sete, lovlige) => {
      const basis = basisFor(s, sete, lovlige);
      const ønsket = vaktKort(s, sete, basis, k.vaktvalg!);
      if (likeKort(ønsket, basis)) return new Map();
      const m = new Map<number, number>();
      for (const kort of lovlige) m.set(kortIndeks(kort), 0);
      m.set(kortIndeks(ønsket), 1);
      return m;
    },
  };

  /**
   * SØKELEDDET er snittutfallet per kandidatkort — `racescore` med lambda 0,
   * altså nøyaktig det `Alphamuagent` scorer med når racejusteringen er av.
   *
   * Søket gir ingen grener i seter det ikke kjører i, eller når verdenene ikke
   * lot seg trekke. Da er kartet tomt, og de andre leddene avgjør alene.
   */
  const søkeledd: Ledd = {
    navn: "sok",
    vekt: v.sok,
    poeng: (s, sete) => {
      const grener = grenerFor(s, sete);
      if (grener === null) return new Map();
      const m = new Map<number, number>();
      for (const g of grener) m.set(kortIndeks(g.kort), racescore(g.vektor, 0, 0));
      return m;
    },
  };

  /**
   * STILLEDDET: hvor nær kortets prisrang ligger den lærte stilen.
   *
   *     mål = h(nettets kort) + stilvri(sete)
   *     poeng = −|h(kort) − mål|
   *
   * Samme akse og samme mål som `Økt.motpartFor` skyver rolloutmotstanderen
   * langs, og fra samme `rangOgPolicy`. To definisjoner ville drevet fra
   * hverandre — det var nøyaktig feilen A6 hadde da avsender og leser hadde
   * hver sin kode.
   *
   * NULL-PUNKTET ER EKSAKT: `stilvri` gir `null` til stilen er målt sikkert, og
   * da er kartet tomt. Er skiftet 0, er målet `h(basis)` og maks ligger på
   * basiskortet selv, uten en eneste flyttallsavrunding som kan vippe.
   *
   * MERK AT DETTE ER VÅR EGEN STIL, ikke motstanderens. I stabelen brukes
   * `stilvri` bare til å modellere ANDRE. Her er den et ledd i vårt eget valg,
   * og det er en ny bruk av samme tall — den skal måles, ikke antas.
   */
  const stilledd: Ledd = {
    navn: "stil",
    vekt: v.stil,
    poeng: (s, sete, lovlige) => {
      const skift = k.økt!.stilvri(sete);
      if (skift === null) return new Map();
      const atferd = k.økt!.bok.atferdModell();
      if (atferd === null) return new Map();
      const rp = rangOgPolicy(s, sete, atferd);
      if (rp === null) return new Map();

      const basis = basisFor(s, sete, lovlige);
      let hBasis = 0;
      for (let i = 0; i < rp.lov.length; i++) {
        if (likeKort(rp.lov[i]!, basis)) {
          hBasis = rp.h[i]!;
          break;
        }
      }
      const mål = Math.max(0, Math.min(1, hBasis + skift));
      const m = new Map<number, number>();
      for (let i = 0; i < rp.lov.length; i++) {
        m.set(kortIndeks(rp.lov[i]!), -Math.abs(rp.h[i]! - mål));
      }
      return m;
    },
  };

  /**
   * RACELEDDET: KORREKSJONEN kampstillingen ber om, ikke utfallet selv.
   *
   *     poeng = racescore(vektor, press, rlambda) − snitt(vektor)
   *
   * Ligger vi bak, løfter det grener med god hale; leder vi, straffer det
   * grener med dårlig hale. Snittet trekkes fra fordi snittet ALLEREDE er
   * søkeleddet — uten subtraksjonen ville utfallet vært talt to ganger, og
   * vektene ville ikke lenger vært uavhengige.
   *
   * ================= DETTE ER IKKE SAMME FUNKSJON SOM I STABELEN =========
   *
   * `Alphamuagent` scorer `(1−vekt)·snitt + vekt·kvantil` som ÉN størrelse.
   * Summen har `w_søk·N(snitt) + w_race·N(kvantil − snitt)`, der N normaliserer
   * hvert ledd for seg. Med `w_søk = 1, w_race = |press|` er de proporsjonale
   * FØR normaliseringen, men N skalerer de to leddene ulikt, så argmaks kan
   * skille lag. Racet i summen må derfor sveipes på nytt; `r1.5` fra stabelen
   * overføres ikke.
   *
   * NULL-PUNKTET: `racepress` er eksakt 0 tidlig i kampen og på gate 2, der
   * hver giv starter 0–0. Da er kartet tomt og leddet gratis — og strukturelt
   * umålbart. Det bet `r0.4` før; bare kampbenken kan måle dette leddet.
   */
  const raceledd: Ledd = {
    navn: "race",
    vekt: v.race,
    poeng: (s, sete) => {
      const press = racepress(s, sete);
      if (press === 0) return new Map();
      const grener = grenerFor(s, sete);
      if (grener === null) return new Map();
      const m = new Map<number, number>();
      for (const g of grener) {
        const { snitt } = snittOgSpredning(g.vektor);
        m.set(kortIndeks(g.kort), racescore(g.vektor, press, v.rlambda) - snitt);
      }
      return m;
    },
  };

  return [nettledd, vaktledd, søkeledd, stilledd, raceledd];
}
