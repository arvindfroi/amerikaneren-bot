/**
 * TENKETIDEN TIL MENNESKET — bare LOGGING (11. sep).
 *
 * En framtidig tempo-sans skal læres fra hvordan mennesker faktisk spiller:
 * hvor lenge de nøler med et bud, hvor fort de legger et tvunget kort. Da må
 * tiden måles fra riktig øyeblikk, og det er IKKE når forrige spiller handlet.
 *
 * ================= HVA SOM MÅLES =========================================
 *
 *   start   beslutningen ble TILGJENGELIG: det er menneskets tur, og panelet
 *           eller de spillbare kortene er tegnet og aktive (`fortsett()` i
 *           `web/app.ts`, rett etter `tegn()`).
 *   stopp   handlingen er SENDT (`menneskeBud`/`Vrak`/`Velg`/`Spill`).
 *
 *   ms        hele veggtiden mellom de to, avrundet.
 *   skjultMs  den delen av `ms` fanen var skjult (Page Visibility API).
 *   ufokusMs  den delen av `ms` vinduet var SYNLIG men uten fokus (`blur`).
 *             Disjunkt med `skjultMs`: skjult tid telles bare der.
 *   angre     antall tilbaketrekk INNE i beslutningen: «Angre»/«Bytt trumf» i
 *             trumfvalget, et avhuket vrakkort som hukes av igjen.
 *
 * De tre siste står bare med når de er > 0, så en vanlig beslutning koster
 * nøyaktig ett tall.
 *
 * ================= FELLEN DETTE ER BYGD MOT ==============================
 *
 * Mellom forrige spillers kort og menneskets tur kan det gå sekunder uten at
 * mennesket KAN gjøre noe: stikket står fryst i 2,6 s før vinneren spiller ut,
 * og botens trekk vises med en pause på 0,55 s. En klokke som startet ved
 * forrige handling ville lagt den ventetiden til menneskets tenketid — og en
 * tempo-sans lært av det ville trodd at den som vinner stikk tenker lenge.
 * `test/tempo-logg.test.ts` spiller en runde i en ekte nettleser med styrt
 * klokke og krever at `ms` er nøyaktig tiden kontrollene sto framme.
 *
 * ================= K2 ====================================================
 *
 * Ingen bot får se dette under spillet. Klokka leses bare av `logg()`, og
 * `test/tempo-logg.test.ts` håndhever at fila ikke importeres av noe annet
 * enn `web/app.ts` — ikke av workeren, kjeden eller `src/`.
 *
 * Botenes egen regnetid står der den alltid har stått, i `bottrekk`-raden, og
 * blandes med vilje ikke inn her.
 */

/** Tilstanden siden er i akkurat nå. */
export interface Synlighet {
  readonly skjult: boolean;
  readonly fokus: boolean;
}

/** Det som logges for én menneskebeslutning. Alle tall er hele millisekunder. */
export interface Tenketid {
  ms: number;
  skjultMs?: number;
  ufokusMs?: number;
  angre?: number;
}

export class Tenkeklokke {
  private startet: number | null = null;
  /** Siste gang tiden ble fordelt på synlig/skjult/ufokusert. */
  private sist = 0;
  private skjult = false;
  private fokus = true;
  private skjultSum = 0;
  private ufokusSum = 0;
  private angreN = 0;

  private readonly nå: () => number;

  constructor(nå: () => number) {
    this.nå = nå;
  }

  /** Går det en beslutning nå? */
  get går(): boolean {
    return this.startet !== null;
  }

  /** Beslutningen er tilgjengelig. Starter på nytt om en gammel sto åpen. */
  start(tilstand: Synlighet): void {
    const t = this.nå();
    this.startet = t;
    this.sist = t;
    this.skjultSum = 0;
    this.ufokusSum = 0;
    this.angreN = 0;
    this.skjult = tilstand.skjult;
    this.fokus = tilstand.fokus;
  }

  /** `visibilitychange`, `blur` eller `focus`. Uten pågående beslutning huskes bare tilstanden. */
  endre(tilstand: Synlighet): void {
    this.fordel();
    this.skjult = tilstand.skjult;
    this.fokus = tilstand.fokus;
  }

  /** Et tilbaketrekk inne i beslutningen. Telles bare mens klokka går. */
  angre(): void {
    if (this.startet !== null) this.angreN++;
  }

  /**
   * Handlingen er sendt. `null` om ingen beslutning var startet — da finnes
   * det ikke noe riktig tall, og et gjettet tall er verre enn et manglende.
   */
  stopp(): Tenketid | null {
    if (this.startet === null) return null;
    this.fordel();
    const ut: Tenketid = { ms: Math.round(this.sist - this.startet) };
    const skjult = Math.round(this.skjultSum);
    const ufokus = Math.round(this.ufokusSum);
    if (skjult > 0) ut.skjultMs = skjult;
    if (ufokus > 0) ut.ufokusMs = ufokus;
    if (this.angreN > 0) ut.angre = this.angreN;
    this.startet = null;
    return ut;
  }

  private fordel(): void {
    const t = this.nå();
    if (this.startet !== null) {
      const d = t - this.sist;
      if (this.skjult) this.skjultSum += d;
      else if (!this.fokus) this.ufokusSum += d;
    }
    this.sist = t;
  }
}
