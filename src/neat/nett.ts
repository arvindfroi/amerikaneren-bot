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
   * EKTE TILBAKEFORPLANTNING gjennom hele nettet.
   *
   * MÅLT PROBLEM som dette løser: `kalibrerUtgang` er ikke backprop, men en
   * delta-regel som når ett lag (eller to med `dybde: 2`). Testet med dybde
   * 1/2/4/6 ga IDENTISKE tall for 2, 4 og 6 – flagget lyver, koden har bare
   * en «dybde >= 2»-gren uten rekursjon. Nettet har 233 skjulte noder som
   * aldri får et læresignal, og all fasit-læring stoppet derfor to lag inn.
   *
   * Her forplantes feilen bakover gjennom koblingsgrafen i `steg` runder.
   * NEAT tillater rekurrens, så grafen er ikke asyklisk og vi kan ikke
   * topologisortere; i stedet gjør vi trunkert tilbakeforplantning – samme
   * prinsipp som BPTT, med `steg` som horisont. Aktiveringene fra siste
   * `aktiver`-kall brukes som arbeidspunkt.
   *
   * Gradientene akkumuleres per node FØR vektene skrives, slik at en node
   * som mater flere utganger får summen av bidragene sine – ikke bare det
   * siste, som en naiv per-kobling-oppdatering ville gitt.
   *
   * MÅLT: DENNE ER DÅRLIGERE ENN DEN GRUNNE DELTA-REGELEN, og verre jo
   * dypere den går. Hold-out val-anger etter 5 epoker (start 1,0716):
   *   kalibrerUtgang(dybde 2)  0,9366   ← best
   *   tilbakeforplant(steg 2)  0,9650
   *   tilbakeforplant(steg 4)  0,9801
   *   tilbakeforplant(steg 8)  0,9790
   * Hypotesen om at «233 skjulte noder aldri lærer» var et PROBLEM er altså
   * feil – det er en fordel. Å oppdatere dem river i stykker struktur
   * evolusjonen har bygget, mens en grunn oppdatering bare finpusser
   * utgangslaget.
   *
   * Det er samme mønster som alt annet vi har målt: hard imitasjon −44,8,
   * avmetning av utrente hoder −85, anger-trening fra feil fordeling −105.
   * Jo mer av nettet et tiltak rører, desto verre går det. Beholdt fordi den
   * er riktig implementert og kan bli nyttig på et nett som er TRENT fram
   * med gradienter fra start (E1-sporet) – men ikke bruk den på evolverte
   * genomer.
   */
  tilbakeforplant(
    mål: ReadonlyMap<number, number>,
    rate: number,
    steg = 4,
  ): number {
    const verdier = this.sisteVerdier;
    if (verdier === null) throw new Error("tilbakeforplant krever et foregående aktiver-kall");
    const n = this.antallNoder;
    const grad = new Float64Array(n);
    const neste = new Float64Array(n);
    let samletFeil = 0;

    // Startgradient i utgangene: dL/dsum = (mål − ut) · tanh'(sum).
    for (const [utNr, m] of mål) {
      const idx = this.utIdx[utNr]!;
      const ut = verdier[idx]!;
      const feil = m - ut;
      samletFeil += Math.abs(feil);
      grad[idx] = (grad[idx] ?? 0) + feil * (1 - ut * ut);
    }

    const klipp = (v: number): number => (v > 8 ? 8 : v < -8 ? -8 : v);
    for (let s = 0; s < steg; s++) {
      neste.fill(0);
      let aktiv = false;
      for (let i = this.antallInn + 1; i < n; i++) {
        const g = grad[i]!;
        if (g === 0) continue;
        for (const kobling of this.innkommende[i]!) {
          const kilde = kobling.fraIdx;
          const a = verdier[kilde]!;
          // Vekten leses FØR oppdatering, som i ekte backprop-rekkefølge.
          const w = kobling.gen.vekt;
          kobling.gen.vekt = klipp(w + rate * g * a);
          // Feilen videre bakover, dempet av kildens egen deriverte. Bias- og
          // inngangsnoder har ingen innkommende koblinger og stopper kjeden.
          if (kilde > this.antallInn) neste[kilde] = (neste[kilde] ?? 0) + g * w * (1 - a * a);
        }
        aktiv = true;
      }
      if (!aktiv) break;
      grad.set(neste);
    }
    return samletFeil;
  }

  /** Utgangsverdien fra SISTE aktiver-kall (for målrettet kalibrering). */
  lesUtgang(utNr: number): number {
    if (this.sisteVerdier === null) throw new Error("lesUtgang krever et foregående aktiver-kall");
    return this.sisteVerdier[this.utIdx[utNr]!]!;
  }

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
  /**
   * MÅLT PROBLEM (2026-07-25): denne virker ikke på modne genomer, fordi
   * `delta` ganges med tanh-deriverte (1 − ut²) og hodene står i METNING.
   * Målte kortutganger på en ekte stilling: 0,932 / 0,999 / 0,906 / 0,994 /
   * 0,962 / 1,000 → deriverte 0,131 / 0,001 / 0,179 / 0,013 / 0,074 / 0,0000.
   * 200 kalibreringer med rate 0,1 mot et annet kort endret ÉN av 593
   * koblinger, og valget flyttet seg ikke. Det gjelder også ubeskåret genom
   * med 16 koblinger per kortutgang – altså ikke et beskjæringsproblem.
   *
   * Konsekvens: ALLE fasit-lærerne (lærSpill, lærTrumf, lærVrak, lærEtterlys,
   * lærStikk) og MoE-forsterkningen er i praksis virkningsløse på modne nett.
   * Det forklarer hvorfor hvert eneste kalibreringstiltak målte ~0.
   *
   * Høyere rate hjelper ikke – faktoren er null. Fiksen må være strukturell:
   * lineære hoder for kortscorene, normalisering før tanh, eller å la
   * seleksjonen (som virker) bære læringen i stedet for kalibreringen.
   */
  kalibrerUtgang(utNr: number, mål: number, rate: number, dybde = 1): number {
    const verdier = this.sisteVerdier;
    if (verdier === null) throw new Error("kalibrerUtgang krever et foregående aktiver-kall");
    const n = this.utIdx[utNr]!;
    const ut = verdier[n]!;
    const feil = mål - ut;
    const delta = feil * (1 - ut * ut);
    const klipp = (v: number): number => (v > 8 ? 8 : v < -8 ? -8 : v);
    for (const kobling of this.innkommende[n]!) {
      // Vekten FØR justeringen brukes i tilbakeforplantningen (ekte backprop-
      // rekkefølge); les den før vi skriver.
      const gammelVekt = kobling.gen.vekt;
      kobling.gen.vekt = klipp(gammelVekt + rate * delta * verdier[kobling.fraIdx]!);
      // DYPERE KORREKSJON (dybde 2): feilen fordeles bakover til de skjulte
      // nodene som bidro – vektene INN til kilden justeres også, skalert med
      // kildens følsomhet (1 − h²) og halv rate. Korreksjonen retter da
      // forståelsen som ledet til valget, ikke bare valget selv.
      if (dybde >= 2) {
        const s = kobling.fraIdx;
        const h = verdier[s]!;
        const deltaS = delta * gammelVekt * (1 - h * h);
        if (deltaS !== 0) {
          for (const indre of this.innkommende[s]!) {
            indre.gen.vekt = klipp(indre.gen.vekt + rate * 0.5 * deltaS * verdier[indre.fraIdx]!);
          }
        }
      }
    }
    return feil;
  }
}
