/**
 * BROEN: et sandkassenett som en vanlig `Spekagent`.
 *
 * Ligaen i `liga.ts` er MLB-only — herkomstgrensen gjør at `src/mlb/` aldri
 * kan nå den gamle stakken, og det er med vilje: formålet med MLB er å lære
 * UTEN en mester. Men da finnes det heller ingen målestokk mot `ADAMS_MAALT`,
 * og uten den vet vi ikke om epokene går mot noe som er verdt å ha.
 *
 * Denne fila er broen. Den gjør et nett til noe `lagIndre` kan bygge, og da
 * arver MLB hele måleapparatet vi allerede stoler på: gate 2 med sin
 * nullarm på 0,0000, kampbenken på 0,2500, og matrisen.
 *
 * ## Retningen er det som gjør det trygt
 *
 * `agentspek.ts` importerer HERFRA. `src/mlb/` importerer ingenting derfra.
 * Herkomstprøven måler importgrafen UT FRA `src/mlb/`, så broen kan ikke
 * smugle et orakel inn i treningen — den lar bare en måling se inn.
 *
 * ## To løkker, bundet av en test
 *
 * Beslutningsløkka finnes også inne i `spillKamp` (`selvspill.ts`). To
 * implementasjoner av samme regel er prosjektets nest verste feilklasse, så
 * `test/mlb-spekagent.test.ts` kjører BEGGE med samme nett og samme frø og
 * krever identiske valg. Driver de fra hverandre, blir den rød.
 */

import {
  spillerVisning,
  type GameState,
  type Handling,
  type SpillerVisning,
} from "../motor.ts";
import { lagRng } from "../kort.ts";
import { byggTrekk, type Trekkontekst, type Trofordeler } from "./trekk.ts";
import { maske, ta, TOMT_DELVALG, type Delvalg, type Giving } from "./handling.ts";
import { velgKode, type Framover } from "./nett.ts";
import { Hukommelse } from "./hukommelse.ts";
import type { Bokfrø } from "./profil.ts";

export interface NettLik {
  framover(trekk: Float32Array): Framover;
}

export interface Sandkasseopsjoner {
  /**
   * 0 gir argmaks. Under MÅLING skal den være 0 — AVGJØRELSE 4 i `mlb.md`:
   * samplet i trening, argmaks i måling. En benk som sampler måler sin egen
   * støy oppå forskjellen den er satt til å finne.
   */
  readonly temperatur?: number;
  readonly frø?: number;
  /** Hukommelsen på. Av gir en nullblokk — den ærlige verdien uten runder. */
  readonly hukommelse?: boolean;
  /**
   * Kalles med HVER valgt kode, i rekkefølge — også delstegene i VRAK og VELG.
   *
   * Den finnes for `test/mlb-spekagent.test.ts`: `Kamplogg` bærer `koder`, og
   * uten den samme rekka herfra har prøven som binder de to beslutningsløkkene
   * ingenting å sammenlikne. Første utkast av prøven sammenliknet et felt som
   * ikke fantes og var grønn på tom mengde.
   */
  readonly påKode?: (kode: number) => void;
  /**
   * TROEN SOM INNGANG (§126). Den MÅ settes her og ikke bare i spillingen.
   *
   * Sto på `null` før, hardkodet i `velgHandling`. Da leste den utrullede
   * boten en TRO-blokk full av nuller, mens — hadde treningen hatt den på —
   * gradienten var tatt på en vektor der de 209 var fylt. Det er prosjektets
   * verste feilklasse ordrett: det målte og det trente er ikke samme ting.
   *
   * Nettet som mates hit er det EKSTERNE trohodet (`MlbTronett`), aldri
   * sandkassenettets eget — et hode kan ikke være sin egen inngang.
   */
  readonly tronett?: Trofordeler | null;
  /**
   * SPILLERPROFILEN SOM STARTBOK (12. sep, `profil.ts`).
   *
   * `undefined` er nullpunktet og betyr bokstavelig talt `new Hukommelse()`,
   * uttrykket som sto her før. Uten profil er hver bit som den var.
   */
  readonly bokfrø?: Bokfrø | null;
}

/**
 * Et sandkassenett som `Spekagent`.
 *
 * K2 er strukturell her på samme måte som i resten av `src/mlb/`: selv om
 * `velgHandling` FÅR hele tilstanden, går ingenting inn i nettet uten å ha
 * gått gjennom `spillerVisning`. Det eneste som leser `state` direkte er
 * `regler`, `giving` og hukommelsens bokføring — og de to første er
 * offentlige, mens den tredje bare bokfører på `RUNDE_SLUTT`, når alt er
 * avdekket. `test/mlb-spekagent.test.ts` bytter de skjulte hendene og krever
 * identisk valg, med en kontrollarm som blir tatt.
 */
export class Sandkasseagent {
  private readonly nett: NettLik;
  private readonly temperatur: number;
  private readonly frø: number;
  private readonly brukHukommelse: boolean;
  private readonly påKode: ((kode: number) => void) | null;
  private readonly tronett: Trofordeler | null;
  private readonly bokfrø: Bokfrø | null;
  private hukommelse: Hukommelse;
  private teller = 0;

  constructor(nett: NettLik, opts: Sandkasseopsjoner = {}) {
    this.nett = nett;
    this.temperatur = opts.temperatur ?? 0;
    this.frø = opts.frø ?? 0;
    this.brukHukommelse = opts.hukommelse ?? true;
    this.påKode = opts.påKode ?? null;
    this.tronett = opts.tronett ?? null;
    this.bokfrø = opts.bokfrø ?? null;
    this.hukommelse = this.lagBok();
  }

  /** Uten profil er dette ordrett `new Hukommelse()` — nullpunktet er bit-identisk. */
  private lagBok(): Hukommelse {
    return this.bokfrø?.lagBok() ?? new Hukommelse();
  }

  nyKamp(): void {
    // Hukommelsen er KAMPENS, ikke botens: den bygges opp fra runde 1 av denne
    // kampens ferdige runder. Fra 12. sep kan STARTPUNKTET komme fra en lagret
    // spillerprofil (`bokfrø`), men bare av det som var offentlig ved bordet i
    // ferdigspilte runder — se `src/mlb/profil.ts`. Uten profil: som før.
    this.hukommelse = this.lagBok();
    this.teller = 0;
  }

  /**
   * Bokfør en tilstand uten å bli spurt om et trekk.
   *
   * ============ NAVNET ER GRENSESNITTETS, IKKE MITT ==================
   *
   * Denne het `observerRunde` fra 10. august til 11. august, og i hele den
   * tiden ble den ALDRI KALT. `Spekagent` erklærer kroken som `observer?(s)`,
   * og hver driver kaller `a.observer?.(s)` — et valgfritt kall på et navn
   * som ikke fantes, altså en stille ingenting.
   *
   * Følgen: et `mlb:`-lag på kampbenken bokførte aldri en runde, så
   * hukommelsen sto på null gjennom hele kampen. Hvert MLB-tall målt der er
   * målt UTEN hukommelse — og K4 og K6 handler om nettopp den.
   *
   * Kravbatteriet fant det med et tall, ikke ved lesing: en arm med beviselig
   * hukommelseseffekt målte +0,0000. `test/mlb-krav.test.ts` låser det.
   *
   * Lærdommen er at et VALGFRITT grensesnittkall ikke feiler når navnet er
   * feil — `?.` svelger alt. En påkrevd metode ville gitt typefeil på
   * sekundet.
   *
   * Og `implements Spekagent` er IKKE løsningen her: herkomstprøven leser
   * importgrafen tekstlig, så selv en `import type` fra `moe2/` gjør den rød.
   * Grensen mot den gamle stakken veier tyngre enn en typesjekk. Vakten er
   * derfor `test/mlb-krav.test.ts`, som måler at bokføringen FYRER.
   */
  observer(s: GameState): void {
    if (this.brukHukommelse) this.hukommelse.observer(s);
  }

  velgHandling(s: GameState): Handling {
    if (this.brukHukommelse) this.hukommelse.observer(s);

    // SAMME REGEL SOM `setetSomBestemmer` i `selvspill.ts`. Den kan ikke bare
    // være `iTur ?? budvinner`: i VRAK og VELG er det budvinneren som velger,
    // og hvis `iTur` ikke er null der, ville vi bygd trekk for feil sete uten
    // at noe krasjet. To løkker med hver sin regel er nettopp det testen som
    // binder dem finnes for.
    const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (sete === null) throw new Error(`Ingen i tur i fasen ${s.fase}`);

    const visning: SpillerVisning = spillerVisning(s, sete);
    const giving: Giving = { antallStikk: s.giving.antallStikk, talong: s.giving.talong };
    const hukommelse = this.brukHukommelse
      ? this.hukommelse.vektor(sete, s.regler.antallSpillere)
      : null;

    // Frøet er BUNDET TIL BESLUTNINGSNUMMERET, ikke til klokka. To kjøringer
    // av samme stilling må gi samme valg, ellers måler ingen benk noe.
    const rng = lagRng((this.frø ^ (this.teller++ * 0x9e3779b1)) >>> 0);

    let delvalg: Delvalg = TOMT_DELVALG;
    for (let steg = 0; steg < 24; steg++) {
      const kontekst: Trekkontekst = {
        regler: s.regler,
        giving: s.giving,
        delvalg,
        hukommelse,
        tronett: this.tronett,
      };
      const trekk = byggTrekk(visning, kontekst);
      const ut = this.nett.framover(trekk);
      const m = maske(visning, giving, delvalg);
      const kode = velgKode(ut.policy, m, this.temperatur, rng);
      this.påKode?.(kode);

      const res = ta(visning, giving, delvalg, kode);
      if (!res.ferdig) {
        delvalg = res.delvalg;
        continue;
      }
      const h = res.handling;
      switch (h.type) {
        case "BUD":
          return { type: "BUD", spiller: sete, bud: h.bud };
        case "VRAK":
          return { type: "VRAK", spiller: sete, kort: h.kort };
        case "VELG":
          return { type: "VELG", spiller: sete, trumf: h.trumf, etterlyst: h.etterlyst };
        case "SPILL":
          return { type: "SPILL", spiller: sete, kort: h.kort };
      }
    }
    throw new Error(`Fasen ${s.fase} ble ikke ferdig på 24 delsteg`);
  }
}
