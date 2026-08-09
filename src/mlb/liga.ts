/**
 * MLB fase 0.6 — LIGAEN, og PORTEN mellom epoker.
 *
 * `docs/mlb.md` §3 og `docs/sandkassen.md` §6: befolkningen er nåværende beste,
 * tidligere epoker og STILISERTE VANER. Den siste raden er en KRAV-avhengighet
 * og ikke en detalj: koblingssjekken målte 0 av 657 utnyttelser mot fire like
 * agenter. *Ingenting å lære er ikke det samme som ikke å kunne lære.* Møter
 * boten bare seg selv, finnes det ingen vane å utnytte, og K6 kan aldri
 * innfris uansett hvor lenge vi trener.
 *
 * ===================== HVOR BLE DET AV `rask`? ==========================
 *
 * `docs/sandkassen.md` §6 fører `rask` opp i befolkningen med 15 %.
 * `docs/mlb.md` AVGJØRELSE 1b — som er en senere revisjon av nettopp den
 * lista — flytter den ut igjen:
 *
 *   > «`rask` flyttes ut av treningsligaen og inn i målestokken — den er
 *   > referansen MLB skal slå, ikke en motstander den skal lære av.»
 *
 * Grunnen er herkomst: `rask` er Adams-stakken, og den bærer `d7alle` og
 * `vrakrang`, som begge er orakeltrent. En motstander former fordelingen av
 * stillinger gradienten tas over, og da er «orakelet er ikke i gradienten»
 * ikke lenger en påstand vi kan forsvare.
 *
 * **Og her er det ikke bare en avgjørelse, det er en TYPEGRENSE.** Denne fila
 * ligger under `src/mlb/`, og `test/mlb-herkomst.test.ts` følger importgrafen
 * herfra. Et forsøk på å importere `agentspek.ts` for å få tak i `rask` ville
 * dratt inn `vrakrang.ts`, `juksagent.ts`, `sdkort.ts` og `alphamu.ts` i samme
 * kall, og prøven ville blitt rød. `Ytre` under er derfor et SPOR, ikke en
 * import: en måleskript i `examples/` kan sende inn hva som helst, og
 * treningsvektene gir sporet vekt 0.
 *
 * ===================== VANENE MÅ DELES I TO DISJUNKTE SETT ==============
 *
 * `docs/mlb.md` §6, ærlig risiko: «K6 trener på testmotstanderen. Vanene i
 * ligaen er de samme som K6-prøven måler mot. Da måler prøven gjenkjenning i
 * vektene, ikke læring i løpet.»
 *
 * `VANER_TRENING` og `VANER_TEST` er derfor disjunkte, og disjunktheten er
 * MÅLT og ikke lovet: `atferdsavstand` teller hvor ofte to vaner velger ulikt
 * på de samme stillingene, og `test/mlb-liga.test.ts` krever at hver
 * treningsvane skiller seg fra hver testvane på et vesentlig antall valg.
 * To spesifikasjoner som ser ulike ut i kildekoden, men velger likt i praksis,
 * er nøyaktig `maks-uten-minne`-feilen fra §118: 0 av 440 valg ulike, og
 * målingen mellom dem var en måling av ingenting.
 */

import { FARGER, type Farge, type Kort } from "../kort.ts";
import { MINSTE_TALLBUD } from "../regler.ts";
import { budFraKode, kortFraKode, PASS_KODE, trumfFraKode } from "./handling.ts";
import { besteAnslag, pris, stikkanslag } from "./hukommelse.ts";
import type { Beslutningspunkt, Beslutter, NettLik, Sete } from "./selvspill.ts";

// ===========================================================================
// 1. Stiliserte vaner
// ===========================================================================

/**
 * En vane, som fire uavhengige stiler.
 *
 * Hver akse er en TENDENS et menneske faktisk har, ikke en tilfeldig
 * permutasjon: noen overbyr, noen sitter på honnørene, noen drar trumfen ut
 * med en gang. Poenget er at hver av dem er UTNYTTBAR — en motstander som
 * alltid legger høyest lovlige kort kan settes i skvis, og det er den evnen K6
 * måler.
 */
export interface Vanespek {
  /** Hvor mange stikk over eller under eget anslag hun byr. */
  readonly dristighet: number;
  readonly vrak: "lavest" | "høyest" | "kortestFarge";
  readonly trumf: "lengst" | "sterkest";
  readonly etterlys: "høyest" | "lavest";
  /**
   * ==================== ÅTTE STILER, IKKE FIRE, OG HVORFOR =============
   *
   * Første utkast hadde fire spillestiler og lot trenings- og testsettet dele
   * dem. Det så disjunkt ut i kildekoden og var det ikke:
   * `test/mlb-liga.test.ts` målte `vane.trumfjeger` mot `test.nølende` til
   * **0,3 % ulike valg av 1 175** — to bots med hvert sitt navn og samme
   * atferd. `trumfjeger` («ta trumf når du kan») er nemlig det SAMME som
   * «høyest», fordi `pris` allerede legger 100 på trumf.
   *
   * Det er femtende forekomst av feilklassen §118 kaller «det målte var ikke
   * det jeg mente», og den ble tatt av en måling og ikke av en gjennomlesning.
   *
   * **84 % av alle beslutninger er kortvalg.** Deler to vaner spillestil, kan
   * de aldri skille seg i mer enn ~16 % av valgene uansett hvor ulikt de byr.
   * Derfor er stilene åtte, og settene deler ingen: treningsvanene spiller
   * HØYT, testvanene spiller LAVT, og enhver kryssammenlikning skiller seg
   * allerede i det første kortet som følges.
   */
  readonly spill:
    | "høyest"
    | "honnørFørst"
    | "sparTrumf"
    | "fargeordenHøy"
    | "lavest"
    | "trumfSløseri"
    | "midt"
    | "fargeordenLav";
}

/** Kortenes verdi som ren rangering, uavhengig av trumf. */
const verdirang = (k: Kort): number => k.verdi;

const lovligeKoder = (m: Uint8Array): number[] => {
  const ut: number[] = [];
  for (let i = 0; i < m.length; i++) if (m[i] === 1) ut.push(i);
  return ut;
};

/**
 * Velg koden med høyest poeng. UAVGJORT BRYTES PÅ LAVESTE KODE, aldri
 * tilfeldig: en vane som ikke er deterministisk kan ikke parres, og hele
 * målemetodikken i dette prosjektet forutsetter at to kjøringer med samme frø
 * gir samme kamp.
 */
function best(koder: readonly number[], poeng: (kode: number) => number): number {
  let beste = koder[0]!;
  let bestP = -Infinity;
  for (const k of koder) {
    const p = poeng(k);
    if (p > bestP) {
      bestP = p;
      beste = k;
    }
  }
  return beste;
}

const fargelengde = (hånd: readonly Kort[], f: Farge): number =>
  hånd.reduce((a, k) => a + (k.farge === f ? 1 : 0), 0);

/**
 * VANEN SOM BESLUTTER.
 *
 * Den ser `SpillerVisning`, aldri `GameState` — ikke fordi K2 gjelder for en
 * motstander (den gjør ikke det; K2 er en skranke på VÅR bot), men fordi en
 * vane som lekker ville vært en usynlig sterkere motstander, og da måler
 * ligaen noe annet enn den sier.
 *
 * Og valget går alltid gjennom `maske`: en vane kan ikke spille ulovlig, av
 * nøyaktig samme grunn og gjennom nøyaktig samme regel som nettet ikke kan.
 */
export function lagVane(spek: Vanespek): Beslutter {
  return (punkt: Beslutningspunkt): number => {
    const koder = lovligeKoder(punkt.maske);
    if (koder.length === 0) throw new Error("Vanen fikk en tom maske");
    if (koder.length === 1) return koder[0]!;
    const v = punkt.visning;
    const hånd = v.dinHånd;

    switch (punkt.delsteg) {
      case "BUD": {
        /**
         * ANSLAGET ER HENNES EGET, ikke en fasit. `besteAnslag` er en håndlagd
         * formel over egen hånd (`hukommelse.ts`) — ingen vekter, ingen fasit,
         * ingen søk. Den er derfor lovlig herkomst, og den er nettopp den
         * grove tommelfingerregelen en stilisert spiller ville brukt.
         */
        const anslag = besteAnslag(hånd);
        const mål = anslag.stikk + spek.dristighet;
        let beste = -1;
        let bestTall = -Infinity;
        for (const kode of koder) {
          const bud = budFraKode(kode);
          if (typeof bud !== "number") continue; // aldri amerikaner/solo: for grovt
          if (bud > mål + 0.5) continue;
          if (bud > bestTall) {
            bestTall = bud;
            beste = kode;
          }
        }
        if (beste >= 0 && bestTall >= MINSTE_TALLBUD) return beste;
        // Ingen bud er lavt nok — pass, som alltid er lovlig i budrunden.
        return punkt.maske[PASS_KODE] === 1 ? PASS_KODE : koder[0]!;
      }

      case "VRAK_KORT": {
        const tenktTrumf = besteAnslag(hånd).trumf;
        const lengder: Record<string, number> = {};
        for (const f of FARGER) lengder[f] = fargelengde(hånd, f);
        return best(koder, (kode) => {
          const k = kortFraKode(kode);
          // Trumfen beholdes uansett stil — å vrake sin egen trumf er ikke en
          // vane, det er en feil, og en motstander som gjør det er en stråmann.
          const trumfstraff = k.farge === tenktTrumf ? -100 : 0;
          switch (spek.vrak) {
            case "lavest":
              return trumfstraff - verdirang(k);
            case "høyest":
              return trumfstraff + verdirang(k);
            case "kortestFarge":
              return trumfstraff - (lengder[k.farge] ?? 0) * 20 - verdirang(k) / 100;
          }
        });
      }

      case "VELG_TRUMF": {
        return best(koder, (kode) => {
          const f = trumfFraKode(kode);
          return spek.trumf === "lengst" ? fargelengde(hånd, f) : stikkanslag(hånd, f);
        });
      }

      case "VELG_ETTERLYST": {
        return best(koder, (kode) => {
          const k = kortFraKode(kode);
          return spek.etterlys === "høyest" ? verdirang(k) : -verdirang(k);
        });
      }

      case "SPILL_KORT": {
        const trumf = v.trumf;
        return best(koder, (kode) => {
          const k = kortFraKode(kode);
          const erTrumf = trumf !== null && k.farge === trumf;
          const p = trumf === null ? verdirang(k) : pris(k, trumf);
          switch (spek.spill) {
            // ---- de fire som spiller HØYT (treningssettet) ----------------
            case "høyest":
              return p;
            case "honnørFørst":
              return verdirang(k) >= 11 ? 500 + verdirang(k) : -verdirang(k);
            case "sparTrumf":
              // Sitter på trumfen, men bruker de høye kortene i de andre.
              return (erTrumf ? -1000 : 0) + verdirang(k);
            case "fargeordenHøy":
              // Spiller «fra venstre i hånden», og høyest innenfor fargen.
              return -FARGER.indexOf(k.farge) * 100 + verdirang(k);
            // ---- de fire som spiller LAVT (testsettet) --------------------
            case "lavest":
              return -p;
            case "trumfSløseri":
              // Kaster trumf ved første anledning, og ellers det billigste.
              return (erTrumf ? 1000 : 0) - verdirang(k);
            case "midt":
              return -Math.abs(verdirang(k) - 8);
            case "fargeordenLav":
              return -FARGER.indexOf(k.farge) * 100 - verdirang(k);
          }
        });
      }
    }
  };
}

/** En navngitt vane, klar til å settes i et sete. */
export interface Vane {
  readonly navn: string;
  readonly spek: Vanespek;
}

/**
 * TRENINGSVANENE. Boten møter disse, og skal lære å utnytte dem.
 */
export const VANER_TRENING: readonly Vane[] = [
  { navn: "vane.grisk", spek: { dristighet: 2, vrak: "lavest", trumf: "lengst", etterlys: "høyest", spill: "høyest" } },
  { navn: "vane.honnørsulten", spek: { dristighet: 1, vrak: "kortestFarge", trumf: "lengst", etterlys: "høyest", spill: "honnørFørst" } },
  { navn: "vane.trumfgjerrig", spek: { dristighet: 0, vrak: "lavest", trumf: "sterkest", etterlys: "høyest", spill: "sparTrumf" } },
  { navn: "vane.ordentlig", spek: { dristighet: 2, vrak: "kortestFarge", trumf: "sterkest", etterlys: "høyest", spill: "fargeordenHøy" } },
] as const;

/**
 * TESTVANENE. K6 måles mot DISSE, og de er aldri i treningsligaen.
 *
 * Er de samme sett, måler K6 gjenkjenning i vektene i stedet for læring i
 * løpet — og forskjellen mellom de to er hele forskjellen på om K6 er innfridd.
 */
export const VANER_TEST: readonly Vane[] = [
  { navn: "test.feig", spek: { dristighet: -2, vrak: "høyest", trumf: "sterkest", etterlys: "lavest", spill: "lavest" } },
  { navn: "test.trumfsløser", spek: { dristighet: 3, vrak: "høyest", trumf: "sterkest", etterlys: "lavest", spill: "trumfSløseri" } },
  { navn: "test.middelmådig", spek: { dristighet: -1, vrak: "høyest", trumf: "lengst", etterlys: "lavest", spill: "midt" } },
  { navn: "test.baklengs", spek: { dristighet: -3, vrak: "lavest", trumf: "lengst", etterlys: "lavest", spill: "fargeordenLav" } },
] as const;

/** Er to vaner ulike i SPESIFIKASJONEN? Nødvendig, men ikke tilstrekkelig. */
export const ulikeSpek = (a: Vanespek, b: Vanespek): number =>
  (a.dristighet === b.dristighet ? 0 : 1) +
  (a.vrak === b.vrak ? 0 : 1) +
  (a.trumf === b.trumf ? 0 : 1) +
  (a.etterlys === b.etterlys ? 0 : 1) +
  (a.spill === b.spill ? 0 : 1);

/**
 * ATFERDSAVSTAND: hvor ofte velger to vaner ULIKT på de SAMME stillingene?
 *
 * Dette er den målingen §118 manglet. To spesifikasjoner kan se ulike ut og
 * likevel gi bit-identiske valg — da er en sammenlikning mellom dem en
 * sammenlikning av ingenting, og K6s «disjunkte sett» er en illusjon.
 * Kalleren mater inn stillingene; funksjonen teller.
 */
export function atferdsavstand(
  a: Vanespek,
  b: Vanespek,
  punkter: readonly Beslutningspunkt[],
): { readonly ulike: number; readonly av: number } {
  const va = lagVane(a);
  const vb = lagVane(b);
  let ulike = 0;
  let av = 0;
  for (const p of punkter) {
    if (p.maske.reduce((x, y) => x + y, 0) < 2) continue;
    av++;
    if (va(p) !== vb(p)) ulike++;
  }
  return { ulike, av };
}

// ===========================================================================
// 2. Befolkningen
// ===========================================================================

export type Slag = "beste" | "tidligere" | "vane" | "ytre";

/** En deltaker i ligaen, uansett hva den er innvendig. */
export interface Deltaker {
  readonly navn: string;
  readonly slag: Slag;
  /** Setet, klart til `spillKamp`. `temperatur` settes av kalleren. */
  lagSete(temperatur: number): Sete;
}

export function epokeDeltaker(navn: string, nett: NettLik, slag: Slag = "tidligere"): Deltaker {
  return {
    navn,
    slag,
    lagSete: (temperatur) => ({ navn, nett, temperatur, samle: false }),
  };
}

export function vaneDeltaker(vane: Vane): Deltaker {
  const beslutter = lagVane(vane.spek);
  return {
    navn: vane.navn,
    slag: "vane",
    /**
     * En vane har ingen temperatur — den er deterministisk. Feltet tas imot og
     * ignoreres, fordi `Sete` krever det, og fordi et sete uten temperatur er
     * nettopp den glemte innstillingen AVGJØRELSE 4 handler om.
     */
    lagSete: () => ({ navn: vane.navn, nett: null, temperatur: 0, egen: beslutter, samle: false }),
  };
}

/**
 * EN YTRE MOTSTANDER — målestokken, ikke en læremester.
 *
 * `src/mlb/` kan ikke importere Adams-stakken (se toppen), så den kommer inn
 * som en ferdig `Beslutter` fra et skript i `examples/`. Slaget er `ytre`, og
 * `TRENINGSVEKTER.ytre` er 0: den kan MÅLES mot, ikke trenes mot, og
 * forskjellen er én linje som er umulig å endre ved et uhell.
 */
export function ytreDeltaker(navn: string, beslutter: Beslutter): Deltaker {
  return {
    navn,
    slag: "ytre",
    lagSete: () => ({ navn, nett: null, temperatur: 0, egen: beslutter, samle: false }),
  };
}

export interface Ligavekter {
  readonly beste: number;
  readonly tidligere: number;
  readonly vaner: number;
  readonly ytre: number;
}

/**
 * VEKTENE I TRENING.
 *
 * `docs/mlb.md` §3 sier 40 / 30 / 15 `rask` / 15 vaner. AVGJØRELSE 1b tar
 * `rask` ut, og de 15 prosentpoengene går til VANENE og ikke til «beste».
 * Grunnen er K6: den eneste raden i tabellen som er en KRAV-avhengighet er
 * vanene, og mer selvspill mot seg selv gir per definisjon ingenting å utnytte.
 */
export const TRENINGSVEKTER: Ligavekter = { beste: 0.4, tidligere: 0.3, vaner: 0.3, ytre: 0 };

/** Hvor mange tidligere epoker holdes i live. Eldre faller ut, epoke 0 blir. */
export const TIDLIGERE_VINDU = 8;

/**
 * BEFOLKNINGEN, med porten som eneste vei inn.
 *
 * Ligaen eier ingen filer og skriver ingenting. `docs/plan.md`s regel om at
 * spillerprofiler aldri lagres på tvers av økter gjelder hukommelsen i
 * `selvspill.ts`; her er den enda enklere — det finnes ingen disk å skrive til.
 */
export class Liga {
  private nåværende: Deltaker | null = null;
  private readonly gamle: Deltaker[] = [];
  private readonly vaner: Deltaker[];
  private readonly ytre: Deltaker[] = [];
  private readonly vekter: Ligavekter;

  constructor(
    vaner: readonly Vane[] = VANER_TRENING,
    vekter: Ligavekter = TRENINGSVEKTER,
  ) {
    this.vaner = vaner.map(vaneDeltaker);
    this.vekter = vekter;
    if (this.vaner.length === 0 && vekter.vaner > 0) {
      throw new Error("Ligaen har vekt på vaner, men ingen vaner. K6 kan da aldri innfris.");
    }
  }

  /** Setter epoke 0 uten port — det finnes ingenting å slå ennå. */
  settFørste(d: Deltaker): void {
    if (this.nåværende !== null) throw new Error("Ligaen har alt en beste — bruk adopter()");
    this.nåværende = d;
  }

  beste(): Deltaker {
    if (this.nåværende === null) throw new Error("Ligaen er tom");
    return this.nåværende;
  }

  tidligere(): readonly Deltaker[] {
    return this.gamle;
  }

  /**
   * GJENOPPBYGG BEFOLKNINGEN I EN NY PROSESS.
   *
   * Ligaen eier ingen filer (se toppen), så en epoke som starter i et nytt
   * `node`-kall må kunne sette inn de forgjengerne PORTEN allerede har sluppet
   * inn. Det er ikke en vei UTENOM porten: dommen er felt, i en tidligere
   * epoke, av `portDom`, og driveren skriver den til en varig logg før den
   * skriver filnavnet den her leses tilbake fra.
   *
   * `adopter` er fortsatt den eneste veien inn når prosessen selv eier ligaen —
   * denne tar ikke en kandidat, den tar en historie.
   */
  leggTilTidligere(d: Deltaker): void {
    this.gamle.push({ ...d, slag: "tidligere" });
    while (this.gamle.length > TIDLIGERE_VINDU) this.gamle.splice(1, 1);
  }

  leggTilYtre(d: Deltaker): void {
    if (d.slag !== "ytre") throw new Error("leggTilYtre tar bare ytre deltakere");
    this.ytre.push(d);
  }

  /**
   * PORTEN. En ny epoke slipper inn BARE om dommen er «godkjent».
   *
   * Dommen fattes av `portDom` og sendes inn ferdig — ligaen skal ikke kunne
   * felle sin egen dom over seg selv, og det er tallene fra en parret måling
   * som avgjør, ikke en tapskurve.
   */
  adopter(kandidat: Deltaker, dom: Portdom): boolean {
    if (dom.dom !== "godkjent") return false;
    if (this.nåværende !== null) {
      this.gamle.push({ ...this.nåværende, slag: "tidligere" });
      // Epoke 0 blir liggende: uten et fast, svakt anker kan hele befolkningen
      // drive samtidig, og «beste» blir et snitt av støy (§3, ligakollaps).
      while (this.gamle.length > TIDLIGERE_VINDU) this.gamle.splice(1, 1);
    }
    this.nåværende = { ...kandidat, slag: "beste" };
    return true;
  }

  /** Trekk ÉN motstander etter vektene. Faller tilbake når en gruppe er tom. */
  trekkMotstander(rng: () => number): Deltaker {
    const grupper: { readonly vekt: number; readonly liste: readonly Deltaker[] }[] = [
      { vekt: this.vekter.beste, liste: this.nåværende === null ? [] : [this.nåværende] },
      { vekt: this.vekter.tidligere, liste: this.gamle },
      { vekt: this.vekter.vaner, liste: this.vaner },
      { vekt: this.vekter.ytre, liste: this.ytre },
    ].filter((g) => g.vekt > 0 && g.liste.length > 0);
    if (grupper.length === 0) throw new Error("Ligaen har ingen motstandere");

    const sum = grupper.reduce((a, g) => a + g.vekt, 0);
    let u = rng() * sum;
    for (const g of grupper) {
      u -= g.vekt;
      if (u <= 0) return g.liste[Math.floor(rng() * g.liste.length) % g.liste.length]!;
    }
    const siste = grupper[grupper.length - 1]!;
    return siste.liste[0]!;
  }

  /**
   * ET HELT BORD: kandidaten i ett sete, tre motstandere fra befolkningen.
   *
   * `kandidatsete` roterer med kampnummeret hos kalleren. Å la kandidaten sitte
   * fast i sete 0 ville blandet «bedre bot» sammen med «bedre plass ved
   * bordet» — giveren roterer, og setene er ikke symmetriske i budrunden.
   */
  bord(
    kandidat: Deltaker,
    kandidatsete: number,
    temperatur: number,
    rng: () => number,
    antallSeter = 4,
  ): Sete[] {
    const ut: Sete[] = [];
    for (let i = 0; i < antallSeter; i++) {
      if (i === kandidatsete) {
        ut.push({ ...kandidat.lagSete(temperatur), samle: true });
      } else {
        ut.push(this.trekkMotstander(rng).lagSete(temperatur));
      }
    }
    return ut;
  }
}

// ===========================================================================
// 3. PORTEN — aldri adoptere på støy
// ===========================================================================

export type Dom = "godkjent" | "avvist" | "ugyldig";

/**
 * ÉN PARRET OBSERVASJON: samme giv, kandidat mot forrige epoke.
 *
 * `bånd` er frøbåndet. Replikering i DISJUNKTE bånd er ikke et pyntetall — §65
 * og §109 er begge tilfeller der en effekt over 2 SE forsvant da den ble prøvd
 * på nytt i et annet bånd, og porten her skal brukes titalls ganger.
 */
export interface Parrad {
  readonly bånd: number;
  readonly giv: number;
  readonly kandidat: number;
  readonly forrige: number;
}

export interface Båndsammendrag {
  readonly bånd: number;
  readonly n: number;
  readonly snitt: number;
  readonly se: number;
}

export interface Portdom {
  readonly dom: Dom;
  readonly n: number;
  /** Snittet av (kandidat − forrige), parret på giv. */
  readonly snitt: number;
  readonly se: number;
  readonly z: number;
  readonly tegnFor: number;
  readonly tegnMot: number;
  /** Tegntestens z, normalapproksimasjon om binomial(n, ½). */
  readonly tegnZ: number;
  readonly bånd: readonly Båndsammendrag[];
  /** Kontrollarmen: forrige mot forrige på samme giv. Skal være ~0. */
  readonly kontroll: { readonly snitt: number; readonly se: number; readonly z: number } | null;
  readonly begrunnelse: string;
}

export interface Portkrav {
  readonly minN: number;
  readonly minZ: number;
  readonly minTegnZ: number;
  readonly minBånd: number;
  /** Hvor stor |z| kontrollarmen får ha før målingen er UGYLDIG. */
  readonly maksKontrollZ: number;
}

export const PORTKRAV: Portkrav = {
  minN: 200,
  minZ: 2,
  minTegnZ: 1.5,
  minBånd: 2,
  maksKontrollZ: 2,
};

function sammendrag(diff: readonly number[]): { n: number; snitt: number; se: number } {
  const n = diff.length;
  if (n === 0) return { n: 0, snitt: 0, se: NaN };
  const snitt = diff.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { n, snitt, se: NaN };
  const varians = diff.reduce((a, b) => a + (b - snitt) ** 2, 0) / (n - 1);
  return { n, snitt, se: Math.sqrt(varians / n) };
}

/**
 * DOMMEN.
 *
 * Fire krav, og alle fire må holde. De er ikke et kompromiss mellom strenghet
 * og framdrift — de er lista over måtene dette prosjektet FAKTISK har blitt
 * lurt på:
 *
 *   1. **parret på giv, over 2 SE** — det opprinnelige kravet
 *   2. **tegntest** — snittet kan bæres av noen få enorme kamper. Tegnet kan
 *      ikke. §109 er nettopp en effekt som overlevde snittet og ikke tegnet
 *   3. **replikert i disjunkte bånd, samme fortegn i hvert** — §65
 *   4. **kontrollarm** — forrige mot forrige på samme giv skal gi 0. Gjør den
 *      ikke det, er riggen gal, og da er svaret UGYLDIG og ikke NEI. En
 *      konklusjon som ikke kan bli «vet ikke» er ikke en konklusjon (`port.ts`)
 */
export function portDom(
  rader: readonly Parrad[],
  kontrollrader: readonly Parrad[] | null = null,
  krav: Portkrav = PORTKRAV,
): Portdom {
  const diff = rader.map((r) => r.kandidat - r.forrige);
  const { n, snitt, se } = sammendrag(diff);
  const z = se > 0 && Number.isFinite(se) ? snitt / se : 0;

  let tegnFor = 0;
  let tegnMot = 0;
  for (const d of diff) {
    if (d > 0) tegnFor++;
    else if (d < 0) tegnMot++;
  }
  const m = tegnFor + tegnMot;
  const tegnZ = m > 0 ? (tegnFor - m / 2) / (Math.sqrt(m) / 2) : 0;

  const båndnr = [...new Set(rader.map((r) => r.bånd))].sort((a, b) => a - b);
  const bånd: Båndsammendrag[] = båndnr.map((b) => {
    const s = sammendrag(diff.filter((_, i) => rader[i]!.bånd === b));
    return { bånd: b, n: s.n, snitt: s.snitt, se: s.se };
  });

  let kontroll: Portdom["kontroll"] = null;
  if (kontrollrader !== null) {
    const kd = kontrollrader.map((r) => r.kandidat - r.forrige);
    const k = sammendrag(kd);
    kontroll = {
      snitt: k.snitt,
      se: k.se,
      z: k.se > 0 && Number.isFinite(k.se) ? k.snitt / k.se : 0,
    };
  }

  const grunner: string[] = [];
  if (kontroll === null) {
    grunner.push("ingen kontrollarm — riggen er uprøvd, og da er svaret ikke NEI, men VET IKKE");
  } else if (Math.abs(kontroll.z) > krav.maksKontrollZ) {
    grunner.push(
      `kontrollarmen bommer: ${kontroll.snitt.toFixed(4)} ± ${kontroll.se.toFixed(4)} ` +
        `(z = ${kontroll.z.toFixed(2)}) der den skal være 0`,
    );
  }
  if (grunner.length > 0) {
    return {
      dom: "ugyldig",
      n,
      snitt,
      se,
      z,
      tegnFor,
      tegnMot,
      tegnZ,
      bånd,
      kontroll,
      begrunnelse: grunner.join("; "),
    };
  }

  if (n < krav.minN) grunner.push(`bare ${n} parrede giv, krever ${krav.minN}`);
  if (!(z >= krav.minZ)) grunner.push(`z = ${z.toFixed(2)}, krever ${krav.minZ}`);
  if (!(tegnZ >= krav.minTegnZ)) {
    grunner.push(
      `tegntest ${tegnFor}/${m} (z = ${tegnZ.toFixed(2)}), krever ${krav.minTegnZ} — ` +
        `et snitt uten tegnet bak seg er båret av noen få kamper`,
    );
  }
  if (bånd.length < krav.minBånd) {
    grunner.push(`bare ${bånd.length} frøbånd, krever ${krav.minBånd} disjunkte`);
  } else {
    const uenige = bånd.filter((b) => !(b.snitt > 0));
    if (uenige.length > 0) {
      grunner.push(
        `båndene er uenige: ${uenige.map((b) => `bånd ${b.bånd} = ${b.snitt.toFixed(4)}`).join(", ")}`,
      );
    }
  }

  return {
    dom: grunner.length === 0 ? "godkjent" : "avvist",
    n,
    snitt,
    se,
    z,
    tegnFor,
    tegnMot,
    tegnZ,
    bånd,
    kontroll,
    begrunnelse:
      grunner.length === 0
        ? `godkjent: ${snitt.toFixed(4)} ± ${se.toFixed(4)} (z = ${z.toFixed(2)}), ` +
          `tegn ${tegnFor}/${m} (z = ${tegnZ.toFixed(2)}), ${bånd.length} bånd enige`
        : grunner.join("; "),
  };
}

/** Én linje, til den varige loggen. */
export const beskrivDom = (d: Portdom): string =>
  `${d.dom.toUpperCase()} n=${d.n} snitt=${d.snitt.toFixed(4)} se=${d.se.toFixed(4)} ` +
  `z=${d.z.toFixed(2)} tegn=${d.tegnFor}/${d.tegnFor + d.tegnMot} tegnZ=${d.tegnZ.toFixed(2)} ` +
  `bånd=[${d.bånd.map((b) => b.snitt.toFixed(4)).join(",")}] ` +
  `kontroll=${d.kontroll === null ? "MANGLER" : d.kontroll.z.toFixed(2)} — ${d.begrunnelse}`;
