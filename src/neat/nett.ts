/**
 * Fenotypen: et kjørbart nettverk bygget fra et NEAT-genom.
 *
 * NEAT-genomer har VILKÅRLIG topologi – framover, bakover (rekurrent),
 * selvsløyfer, og skjulte noder som (ennå) ikke ligger på noen sti til en
 * utgang. Derfor aktiveres nettet ITERATIVT og synkront: i hvert pass
 * beregnes ny verdi for SAMTLIGE ikke-inngangsnoder ut fra forrige pass'
 * verdier. Dermed tas alle nevroner med i beregningen – også «dinglende»
 * noder (som mutasjoner senere kan koble videre) og rekurrente sløyfer,
 * som naturlig leser fjorårets verdi. Antall pass skalerer med antall
 * skjulte noder slik at signaler rekker å forplante seg gjennom kjeder.
 */

import { biasId, type Genom, type KoblingGen, utId } from "./genom.ts";

interface Innkommende {
  readonly fraIdx: number;
  /** Selve koblingsGENET – vekter leses (og kalibreres) direkte i genomet. */
  readonly gen: KoblingGen;
}

export class Nettverk {
  private readonly antallInn: number;
  private readonly antallUt: number;
  /** Alle noder i fast rekkefølge; index 0..antallInn-1 = innganger, deretter bias. */
  private readonly nodeIdx = new Map<number, number>();
  private readonly innkommende: Innkommende[][];
  private readonly utIdx: number[];
  private readonly antallNoder: number;
  private readonly pass: number;
  private readonly a: Float64Array;
  private readonly b: Float64Array;

  constructor(genom: Genom, maksPass = 8) {
    this.antallInn = genom.antallInn;
    this.antallUt = genom.antallUt;

    // Fast indeksering: innganger, bias, deretter resten (ut + skjulte) i node-id-orden.
    let idx = 0;
    for (let i = 0; i < genom.antallInn; i++) this.nodeIdx.set(i, idx++);
    this.nodeIdx.set(biasId(genom.antallInn), idx++);
    const øvrige = genom.noder
      .filter((n) => n.type === "ut" || n.type === "skjult")
      .sort((x, y) => x.id - y.id);
    for (const n of øvrige) if (!this.nodeIdx.has(n.id)) this.nodeIdx.set(n.id, idx++);
    this.antallNoder = idx;

    this.innkommende = Array.from({ length: this.antallNoder }, () => []);
    for (const k of genom.koblinger) {
      if (!k.aktiv) continue;
      const fra = this.nodeIdx.get(k.inn);
      const til = this.nodeIdx.get(k.ut);
      if (fra === undefined || til === undefined) continue; // gen uten node (defensivt)
      if (til < this.antallInn + 1) continue; // innganger/bias kan ikke være mål
      this.innkommende[til]!.push({ fraIdx: fra, gen: k });
    }

    this.utIdx = [];
    for (let j = 0; j < genom.antallUt; j++) {
      this.utIdx.push(this.nodeIdx.get(utId(genom.antallInn, j))!);
    }

    const skjulte = this.antallNoder - (this.antallInn + 1) - this.antallUt;
    this.pass = Math.min(maksPass, 2 + skjulte);
    this.a = new Float64Array(this.antallNoder);
    this.b = new Float64Array(this.antallNoder);
  }

  /** Antall aktiveringspass per evaluering (innsyn for tester). */
  get antallPass(): number {
    return this.pass;
  }

  /** Antall noder som faktisk beregnes (innsyn for tester). */
  get antallBeregnedeNoder(): number {
    return this.antallNoder - (this.antallInn + 1);
  }

  /**
   * Evaluerer nettet på en inngangsvektor og returnerer utgangsverdiene
   * (tanh, dvs. i (-1, 1)). Tilstanden nullstilles per kall – hvert
   * beslutningspunkt evalueres uavhengig, men rekurrente koblinger virker
   * innenfor passene.
   */
  aktiver(inn: readonly number[]): number[] {
    if (inn.length !== this.antallInn) {
      throw new Error(`Forventet ${this.antallInn} innganger, fikk ${inn.length}`);
    }
    const { a, b } = this;
    a.fill(0);
    b.fill(0);
    for (let i = 0; i < this.antallInn; i++) {
      a[i] = inn[i]!;
      b[i] = inn[i]!;
    }
    a[this.antallInn] = 1; // bias
    b[this.antallInn] = 1;

    let les = a;
    let skriv = b;
    for (let p = 0; p < this.pass; p++) {
      for (let n = this.antallInn + 1; n < this.antallNoder; n++) {
        let sum = 0;
        for (const kobling of this.innkommende[n]!) {
          sum += les[kobling.fraIdx]! * kobling.gen.vekt;
        }
        skriv[n] = Math.tanh(sum);
      }
      const tmp = les;
      les = skriv;
      skriv = tmp;
    }

    this.sisteVerdier = les;
    const ut = new Array<number>(this.antallUt);
    for (let j = 0; j < this.antallUt; j++) ut[j] = les[this.utIdx[j]!]!;
    return ut;
  }

  private sisteVerdier: Float64Array | null = null;

  /**
   * REGRET-LÆRING i selve nettet: kalibrerer utgang nr. `utNr` mot en
   * fasitverdi med en delta-regel på utgangens innkommende koblinger,
   * basert på aktiveringene fra SISTE `aktiver`-kall:
   *
   *   Δw_i = rate · (mål − ut) · (1 − ut²) · verdi_i
   *
   * Vektene oppdateres DIREKTE I GENOMET (lamarckisk): det nettet lærer av
   * angeren sin i løpet av livet, arves av avkommet i neste generasjon.
   * Returnerer feilen (mål − ut) før justeringen.
   */
  kalibrerUtgang(utNr: number, mål: number, rate: number): number {
    const verdier = this.sisteVerdier;
    if (verdier === null) throw new Error("kalibrerUtgang krever et foregående aktiver-kall");
    const n = this.utIdx[utNr]!;
    const ut = verdier[n]!;
    const feil = mål - ut;
    const faktor = rate * feil * (1 - ut * ut);
    for (const kobling of this.innkommende[n]!) {
      let v = kobling.gen.vekt + faktor * verdier[kobling.fraIdx]!;
      if (v > 8) v = 8;
      if (v < -8) v = -8;
      kobling.gen.vekt = v;
    }
    return feil;
  }
}
