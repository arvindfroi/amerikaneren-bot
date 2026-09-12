/**
 * SIKKERORAKELET: overstyrer policyen BARE der framoverblikket er sikkert.
 *
 * Dette er forbedringsoperatoren selvspill-løkka skal hvile på, og den er en
 * direkte konsekvens av en måling: det rå SD-orakelet er DÅRLIGERE enn nettet
 * det lærte opp, i alle tre roller (`ork:`-benken, 3. august):
 *
 *     spillefører  −0,357     makker  −0,078     forsvar  −0,153
 *
 * En forbedringsoperator som gjør policyen verre kan ingen løkke redde. Men
 * feilen er ikke at framoverblikket er verdiløst – den er at `argmax` over K
 * støyete anslag plukker det kortet som fikk de snilleste verdenene. Med
 * verdiene beholdt per verden (`sdpar.ts`) kan operatoren i stedet spørre:
 *
 *     er beste kort bedre enn nest beste MED MARGIN, parvis over verdenene?
 *
 * Er svaret nei, står nettets valg. Operatoren sier «jeg vet ikke» i stedet
 * for å gjette, og det er hele forskjellen.
 *
 * TERSKELEN `sigma` ER EN AKSE SOM MÅ MÅLES, IKKE GJETTES. σ=0 er nøyaktig
 * dagens rå orakel (overstyr alltid) og skal måle det samme som `ork:` gjorde.
 * σ→∞ er ren champion (overstyr aldri) og skal måle nøyaktig 0. At de to
 * ytterpunktene reproduserer kjente tall er selve valideringen av oppsettet;
 * går det ikke opp, er det operatoren som er feil, ikke funnet.
 *
 * ============ TROEN, LAGMÅLET OG FRISTEN (11. sep) ========================
 *
 * Søket i den utrullede boten trakk verdener vektet etter BUDET alene, blant tre
 * kandidater. Det skarpeste trosnettet prosjektet har (MLB-trohodet) satt aldri i
 * søket. `tro` kobler det inn (med hukommelsen: `soketro.ts`); `budvekt: false` slår
 * av budformelen når trohodet selv leser budrunden.
 *
 * `lagmål` bytter utfallsmålet til sidens snitt mot den andre sidens (`lagMål`).
 * Standardmålet trekker fra makkerens poeng, så søk som makker eller forsvarer
 * måler feil ting (§103) — og de to rollene er nettopp der troen skjerper verdenene
 * mest (+7 pp mot +2 for føreren).
 *
 * `fristMs` er appens tidsbudsjett. Uten den kunne ett tregt trekk fryse bordet;
 * med den kuttes hele verdener (se `vurderPar`), så σ regnes fortsatt parvis. All
 * MÅLING går uten frist — en frist gjør valget avhengig av maskinens fart.
 *
 * ============ HUKOMMELSEN OG VISNINGSFRØET (11. sep) ======================
 *
 * `motpartFor` er K4 i dette søket. Økten (`okt:` + `profil:`) lærte i hele boten, men
 * bare `amu:` leste den. `okt:…:profil:sik:…` hadde altså en hukommelse som fylte
 * boka og ikke påvirket ett eneste valg — K4/K6 var null PER KONSTRUKSJON. Nå spiller
 * hvert motstandersete utspillingene med økta sin policy for det setet, som i alpha-mu.
 *
 * `visningsfrø` gjør valget til en FUNKSJON AV DET SETET SER. Uten den trekkes verdenene
 * fra én strøm per instans, så samme stilling kan gi ulike valg ved to kall — og da kan
 * verken K2-prøven (bytt skjulte kort, se om valget står) eller K4-prøven (med og uten
 * hukommelse) skille støy fra virkning. Med den utledes strømmen for hver beslutning av
 * en hash av `spillerVisning(state, sete)` og instansfrøet. Visningen ER definisjonen
 * av det setet lovlig vet, så to verdener som bare skiller seg i skjulte kort gir samme
 * frø, samme verdener og samme valg.
 */

import { spillerVisning, type GameState, type Handling } from "../motor.ts";
import { lagRng } from "../kort.ts";
import type { Verden } from "../solver/sampler.ts";
import { vurderPar, type ParResultat } from "./sdpar.ts";
import type { Søketro } from "./soketro.ts";
import { lagMål, type Utspiller } from "./sdkort.ts";
import { rolleFor, type Rolle } from "./rolleorakel.ts";

export interface SikkerOpts {
  readonly verdener?: number;
  /** Minste parrede σ før nettets valg overstyres. */
  readonly sigma?: number;
  /** Roller operatoren får gripe inn i. Tom = alle. */
  readonly roller?: readonly Rolle[];
  readonly frø?: number;
  /** Kandidatverdener importance-samplingen velger mellom. Standard 3 var for lavt. */
  readonly verdenKandidater?: number;
  /**
   * ALPHA-MU-KRITERIET. `snitt` er PIMC og standard. De tre andre krever at
   * kortet er godt paa TVERS av verdenene i stedet for i snitt - se
   * `vurderSD` i sdkort.ts. Strategifusjon er maalt to ganger i dette
   * prosjektet (§56, §58), og dette er den ene formen som angriper den.
   */
  readonly verdenKombi?: "snitt" | "min" | "kvantil" | "flest";
  /** A1: vekt verdenene etter spillet, ikke bare budrunden. */
  readonly spillvekt?: boolean;
  /**
   * TROEN I VERDENENE. `vektFor` kalles én gang per vurdert beslutning og gir
   * vektfunksjonen for stillingen, eller null når ingenting er skjult. Har den en bok
   * (`MlbSøketro` med hukommelse), får den se hver tilstand gjennom `observer`.
   * Udefinert = som før. Utelukker `spillvekt` (samme bevis to ganger).
   */
  readonly tro?: Søketro | null;
  /** Budvekten på verdenene. Standard på. */
  readonly budvekt?: boolean;
  /** LAGMÅLET i utspillingene i stedet for `standardMål`. Standard av, bit-identisk. */
  readonly lagmål?: boolean;
  /** Tidsbudsjett per beslutning i millisekunder. Udefinert = ingen frist. */
  readonly fristMs?: number;
  /** Klokka fristen og `siste.ms` måles med. Standard `performance.now()`. */
  readonly klokke?: () => number;
  /** K7.2: utspillingene løses eksakt fra så mange stikk igjen (`e<T>` i speken). Udefinert = av. */
  readonly eksaktBlad?: number;
  /**
   * K4: rollout-policyen for et MOTSTANDERSETE (`M` i speken, typisk
   * `(sete) => økt.motpartFor(motpart, sete)`). Vårt eget sete bruker alltid `motpart`.
   * Udefinert = én policy for alle, bit-identisk. Se `ParOpts.motpartFor`.
   */
  readonly motpartFor?: (sete: number) => Utspiller;
  /**
   * DETERMINISTISK, K2-TRYGT FRØ PER BESLUTNING (`D` i speken): verdenene trekkes fra
   * `lagRng(visningsfrø(state, sete, frø))` i stedet for instansens løpende strøm. Samme
   * stilling gir samme valg, og å bytte skjulte kort kan ikke endre frøet. Standard av:
   * da går strømmen som før, bit for bit.
   */
  readonly visningsfrø?: boolean;
  /**
   * LIKELIHOOD-VEKTEN (`~lik=` i speken, 12. sep): vektfunksjonen for DENNE beslutningen,
   * eller null når vinduet ikke har én observert handling fra et annet sete. Bygges av
   * kalleren — se `lagLikvekt` i `likvekt.ts`.
   *
   * Samme form som `tro.vektFor`, og med vilje: begge er «en vekt per beslutning», og de
   * LEGGES SAMMEN i `vurderPar`. Udefinert = av, bit-identisk.
   */
  readonly likFor?: (state: GameState, sete: number) => ((v: Verden) => number) | null;
}

/**
 * KANONISK TEKST FOR DET `sete` SER — og ingenting annet.
 *
 * Bygd av `spillerVisning`, som er motorens egen definisjon av hva som er trygt å vise
 * én spiller. Nøklene sorteres rekursivt, så to kort som er likeverdige men laget i ulik
 * nøkkelrekkefølge (`intTilKort` mot kortstokken) gir samme tekst. Ukjent/udefinert
 * skrives som `u`, så feltet ikke forsvinner stille slik det gjør i `JSON.stringify`.
 */
export function kanoniskVisning(state: GameState, sete: number): string {
  return kanonisk(spillerVisning(state, sete));
}

function kanonisk(x: unknown): string {
  if (x === undefined) return "u";
  if (x === null || typeof x !== "object") return JSON.stringify(x) ?? "u";
  if (Array.isArray(x)) return `[${x.map(kanonisk).join(",")}]`;
  const o = x as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${kanonisk(o[k])}`)
    .join(",")}}`;
}

/**
 * FRØET FOR ÉN BESLUTNING: FNV-1a (32 bit) over instansfrøet og den kanoniske visningen.
 *
 * Instansfrøet er med så to agenter med ulike `frø` fortsatt trekker ulike verdener —
 * frøbånd skal bety det samme som før. Hashen trenger ikke være kryptografisk: den skal
 * bare være en ren funksjon av det setet ser, og det er den per konstruksjon.
 */
export function visningsfrø(state: GameState, sete: number, frø: number): number {
  const tekst = `${frø >>> 0}|${kanoniskVisning(state, sete)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < tekst.length; i++) {
    h ^= tekst.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Tellere, så en kjøring kan vise HVOR ofte operatoren faktisk grep inn. */
export interface SikkerTellere {
  beslutninger: number;
  vurdert: number;
  overstyrt: number;
  enig: number;
  /** Vurderinger med færre verdener enn bedt om — fristen, eller trekninger som feilet. */
  avkortet: number;
}

/** Siste beslutning i en rolle søket dekker, for appens logg. `null` utenfor. */
export interface SikkerSiste {
  /** `søk` = overstyrt, `enig` = søket valgte det nettet valgte, `nett` = porten holdt. */
  readonly lag: "nett" | "søk" | "enig";
  /** Verdener som faktisk ble spilt ut. 0 = ingen vurdering (ett lovlig kort, eller fristen). */
  readonly n: number;
  readonly sigma: number;
  readonly ms: number;
}

/**
 * ============ PARLYTTEREN (11. sep): SØKETS VERDIER UT, UTEN Å RØRE VALGET ============
 *
 * `vurderPar` regner en verdi per lovlig kort på hver beslutning den hele boten tar, og porten
 * under kaster alt annet enn σ og beste kort. Det er nøyaktig etiketten kortnettet trenger for
 * ekspertiterasjon (`examples/kort-data.ts`): søket merker, nettet lærer, og det bedre nettet
 * blir basen søket bygger på.
 *
 * MODULNIVÅ OG IKKE EN OPSJON, med vilje. Speken bygger orakelet dypt inne i `okt:` → `vr:` →
 * `eks:` → `profil:`, og `okt:` returnerer en lukning uten felt å gå gjennom. En opsjon ville
 * krevd en ny bokstav i spekspråket — og en spek i loggen som ikke er den som spilte.
 *
 * VALGET KAN IKKE ENDRES: lytteren kalles etter `vurderPar` og før porten, får lesegrensesnitt,
 * og returverdien brukes ikke. Uten lytter er kallet `null?.(…)`, som ikke engang evaluerer
 * argumentet — bit-identisk (sha1 på to runder helbot i fire seter, før og etter, 11. sep).
 *
 * Bare når søket faktisk vurderte (`par !== null`): ett lovlig kort, ingen verden eller en frist
 * som ikke rakk én verden gir ingen etikett — «ingen data» er ikke «alle kort like gode».
 */
export interface Parhendelse {
  readonly sik: Sikkerorakel;
  readonly state: GameState;
  readonly sete: number;
  readonly par: ParResultat;
}
let parlytter: ((h: Parhendelse) => void) | null = null;
/** Sett lytteren, eller fjern den med `null`. Én per prosess; generatoren eier den. */
export function settParlytter(f: ((h: Parhendelse) => void) | null): void {
  parlytter = f;
}

export class Sikkerorakel {
  private readonly indre: { velgHandling(s: GameState): Handling; nyKamp(): void };
  private readonly motpart: Utspiller;
  private readonly verdener: number;
  private readonly sigma: number;
  private readonly roller: readonly Rolle[];
  private readonly rng: () => number;
  private readonly verdenKandidater: number;
  private readonly verdenKombi: "snitt" | "min" | "kvantil" | "flest";
  private readonly spillvekt: boolean;
  /** Søketroen, eller null. Offentlig for loggen og prøvene. */
  readonly tro: Søketro | null;
  private readonly budvekt: boolean;
  private readonly mål: ((s: GameState, spiller: number) => number) | undefined;
  private readonly fristMs: number | null;
  private readonly klokke: () => number;
  /** K7.2-bladet, eller null. Offentlig for loggen og prøvene. */
  readonly eksaktBlad: number | null;
  /** K4-motstandermodellen, eller null. Offentlig for prøvene: speken skal kunne bevises koblet. */
  readonly motpartFor: ((sete: number) => Utspiller) | null;
  /** `D`: frøet utledes av visningen per beslutning. Offentlig for loggen og prøvene. */
  readonly visningsfrø: boolean;
  /** `~lik=`: likelihood-vekten, eller null. Offentlig for prøvene: speken skal kunne bevises koblet. */
  readonly likFor: ((state: GameState, sete: number) => ((v: Verden) => number) | null) | null;
  /** `L`: utspillingene måles med lagmålet. Offentlig for kortdataene, som skriver hvilket mål verdiene har. */
  readonly lagmål: boolean;
  private readonly frø: number;
  readonly tellere: SikkerTellere = { beslutninger: 0, vurdert: 0, overstyrt: 0, enig: 0, avkortet: 0 };
  siste: SikkerSiste | null = null;

  constructor(
    indre: { velgHandling(s: GameState): Handling; nyKamp(): void },
    motpart: Utspiller,
    opts: SikkerOpts = {},
  ) {
    this.indre = indre;
    this.motpart = motpart;
    this.verdener = opts.verdener ?? 12;
    this.sigma = opts.sigma ?? 1.5;
    this.roller = opts.roller ?? [];
    this.frø = opts.frø ?? 20_260_804;
    this.rng = lagRng(this.frø);
    this.motpartFor = opts.motpartFor ?? null;
    this.visningsfrø = opts.visningsfrø === true;
    this.likFor = opts.likFor ?? null;
    this.verdenKandidater = opts.verdenKandidater ?? 3;
    this.verdenKombi = opts.verdenKombi ?? "snitt";
    this.spillvekt = opts.spillvekt === true;
    this.tro = opts.tro ?? null;
    this.budvekt = opts.budvekt ?? true;
    // Udefinert, ikke `standardMål`: da velger `vurderPar` selv, og standardstien er urørt.
    this.mål = opts.lagmål === true ? lagMål : undefined;
    this.lagmål = opts.lagmål === true;
    this.fristMs = opts.fristMs ?? null;
    this.klokke = opts.klokke ?? ((): number => performance.now());
    this.eksaktBlad = opts.eksaktBlad ?? null;
    if (this.eksaktBlad !== null && !(Number.isInteger(this.eksaktBlad) && this.eksaktBlad >= 1)) {
      throw new Error(`Sikkerorakel: eksaktBlad må være et helt antall stikk ≥ 1, fikk ${this.eksaktBlad}`);
    }
    // Feil ved bygging, ikke ved første trekk midt i en kamp.
    if (this.spillvekt && this.tro !== null) {
      throw new Error("Sikkerorakel: spillvekt og trovekt leser det samme beviset - velg én");
    }
    if (this.fristMs !== null && !(this.fristMs > 0)) {
      throw new Error(`Sikkerorakel: fristMs må være > 0, fikk ${this.fristMs}`);
    }
  }

  nyKamp(): void {
    this.indre.nyKamp();
    this.tro?.nyKamp?.();
  }

  /**
   * Bokfør en tilstand uten å bli spurt om et trekk — `RUNDE_SLUTT` kommer bare hit.
   * Sendes videre innover, så lag under søket som fører egen bok ser det samme.
   */
  observer(state: GameState): void {
    this.tro?.observer?.(state);
    (this.indre as { observer?(s: GameState): void }).observer?.(state);
  }

  velgHandling(state: GameState): Handling {
    this.siste = null;
    this.tro?.observer?.(state);
    if (state.fase !== "SPILL" || state.iTur === null) return this.indre.velgHandling(state);
    const sete = state.iTur;
    if (this.roller.length > 0) {
      const r = rolleFor(state, sete);
      if (r === null || !this.roller.includes(r)) return this.indre.velgHandling(state);
    }
    this.tellere.beslutninger++;
    const start = this.klokke();

    const par = vurderPar(state, sete, this.motpart, {
      verdenKandidater: this.verdenKandidater,
      verdenKombi: this.verdenKombi,
      spillvekt: this.spillvekt,
      trovekt: this.tro === null ? undefined : (this.tro.vektFor(state, sete) ?? undefined),
      likvekt: this.likFor === null ? undefined : (this.likFor(state, sete) ?? undefined),
      budvekt: this.budvekt,
      mål: this.mål,
      frist: this.fristMs === null ? undefined : start + this.fristMs,
      klokke: this.klokke,
      ...(this.eksaktBlad === null ? {} : { eksaktBlad: this.eksaktBlad }),
      ...(this.motpartFor === null ? {} : { motpartFor: this.motpartFor }),
      verdener: this.verdener,
      // Med `visningsfrø` står instansens strøm urørt; uten den er dette nøyaktig som før.
      rng: this.visningsfrø ? lagRng(visningsfrø(state, sete, this.frø)) : this.rng,
    });
    // Ingen verden lot seg trekke, bare ett lovlig kort, eller fristen rakk ingen
    // verden: la policyen stå.
    if (par === null) {
      this.siste = { lag: "nett", n: 0, sigma: 0, ms: this.klokke() - start };
      return this.indre.velgHandling(state);
    }
    this.tellere.vurdert++;
    if (par.n < this.verdener) this.tellere.avkortet++;
    // Før porten og før det indre valget; uten lytter evalueres ikke engang argumentet.
    parlytter?.({ sik: this, state, sete, par });

    if (par.sigma < this.sigma) {
      this.siste = { lag: "nett", n: par.n, sigma: par.sigma, ms: this.klokke() - start };
      return this.indre.velgHandling(state);
    }

    const eget = this.indre.velgHandling(state);
    if (
      eget.type === "SPILL" &&
      eget.kort.farge === par.beste.kort.farge &&
      eget.kort.verdi === par.beste.kort.verdi
    ) {
      this.tellere.enig++;
      this.siste = { lag: "enig", n: par.n, sigma: par.sigma, ms: this.klokke() - start };
      return eget;
    }
    this.tellere.overstyrt++;
    this.siste = { lag: "søk", n: par.n, sigma: par.sigma, ms: this.klokke() - start };
    return { type: "SPILL", spiller: sete, kort: par.beste.kort };
  }
}
