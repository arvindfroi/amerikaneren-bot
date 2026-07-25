/**
 * GODKJENNINGSPORTEN – en fasit får ikke brukes før den er vist å måle det
 * vi faktisk vil ha.
 *
 * D8 ble byttet fra poeng til anger fordi anger er støyfri. Det er en god
 * grunn til å mistro poeng, men ingen grunn til å tro på anger: et støyfritt
 * tall som måler feil ting er nøyaktig det Elo-kurven i D7 var. Da spørsmålet
 * omsider ble stilt, viste det seg at referansen ikke kunne svare – poeng
 * korrelerte −0,084 med SEG SELV over to uavhengige giversett med 800 runder
 * per genom.
 *
 * REKKEFØLGEN ER HELE POENGET:
 *
 *   1. Mål referansens EGEN pålitelighet (splitt-halv, uavhengige sett).
 *   2. Er den under terskelen, er testen UGYLDIG – ikke negativ.
 *   3. Først da tolkes korrelasjonen, dempingskorrigert.
 *
 * Første versjon av korrelasjonsskriptet testet `Math.abs(r) < 0.3` først.
 * Med `r = NaN` er den testen usann, så koden falt til else-grenen og trykket
 * «henger sammen» på et resultat som ikke fantes. En konklusjon som ikke kan
 * bli «vet ikke» er ikke en konklusjon, og derfor er `ugyldig` en egen
 * tilstand her – ikke en variant av `nei`.
 */

export type Dom = "godkjent" | "avvist" | "ugyldig";

export interface Portresultat {
  readonly dom: Dom;
  /** Splitt-halv-korrelasjonen for referansen. */
  readonly splitt: number;
  /** Spearman-Brown-korrigert pålitelighet for snittet av halvdelene. */
  readonly paalitelighet: number;
  /** Observert korrelasjon fasit mot referanse. */
  readonly observert: number;
  /** Dempingskorrigert korrelasjon, eller NaN når påliteligheten svikter. */
  readonly korrigert: number;
  readonly n: number;
  readonly begrunnelse: string;
}

export function spearman(a: readonly number[], b: readonly number[]): number {
  const n = a.length;
  if (n !== b.length) throw new Error("ulik lengde");
  if (n < 3) return NaN;
  const rang = (v: readonly number[]): number[] => {
    const idx = v.map((x, i) => ({ x, i })).sort((p, q) => p.x - q.x);
    const r = new Array<number>(n);
    idx.forEach((p, k) => (r[p.i] = k));
    return r;
  };
  const ra = rang(a);
  const rb = rang(b);
  let d2 = 0;
  for (let i = 0; i < n; i++) d2 += (ra[i]! - rb[i]!) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
}

export interface PortInn {
  /** Fasitens verdi per kandidat – den vi vurderer å selektere på. */
  readonly fasit: readonly number[];
  /** Referansen, målt på ETT sett. */
  readonly referanseA: readonly number[];
  /** Samme referanse, målt på et UAVHENGIG sett. */
  readonly referanseB: readonly number[];
  /** Peker fasit og referanse samme vei? Ellers snus fortegnet. */
  readonly sammeRetning: boolean;
  /** Minste pålitelighet før korrelasjonen i det hele tatt tolkes. */
  readonly minPaalitelighet?: number;
  /** Minste korrigerte korrelasjon for godkjenning. */
  readonly minKorrelasjon?: number;
}

export function prøvPorten(inn: PortInn): Portresultat {
  const minP = inn.minPaalitelighet ?? 0.3;
  const minK = inn.minKorrelasjon ?? 0.3;
  const n = inn.fasit.length;

  const splitt = spearman(inn.referanseA, inn.referanseB);
  // Spearman-Brown: påliteligheten for SNITTET av to halvdeler er høyere enn
  // for én halvdel, og det er snittet vi faktisk bruker som referanse.
  const paalitelighet = (2 * splitt) / (1 + splitt);

  const snitt = inn.referanseA.map((x, i) => (x + inn.referanseB[i]!) / 2);
  const justert = inn.sammeRetning ? snitt : snitt.map((x) => -x);
  const observert = spearman(inn.fasit, justert);

  if (!(paalitelighet > minP)) {
    return {
      dom: "ugyldig",
      splitt,
      paalitelighet,
      observert,
      korrigert: NaN,
      n,
      begrunnelse:
        `Referansen korrelerer ${splitt.toFixed(3)} med seg selv over to uavhengige ` +
        `sett (pålitelighet ${paalitelighet.toFixed(3)} < ${minP}). Da kan den ikke ` +
        `avgjøre noe om fasiten – hverken for eller mot. Skaff kandidater med større ` +
        `faktisk forskjell, eller mål referansen på mer data.`,
    };
  }

  // Demping: støy i referansen trekker den observerte korrelasjonen mot null.
  const korrigert = observert / Math.sqrt(paalitelighet);
  if (Math.abs(korrigert) < minK) {
    return {
      dom: "avvist",
      splitt,
      paalitelighet,
      observert,
      korrigert,
      n,
      begrunnelse:
        `Referansen er pålitelig (${paalitelighet.toFixed(3)}), men fasiten henger ikke ` +
        `sammen med den (korrigert ${korrigert.toFixed(3)}). Å selektere på denne fasiten ` +
        `er da ikke bedre begrunnet enn Elo var: støyfritt, men på feil akse.`,
    };
  }
  if (korrigert < 0) {
    return {
      dom: "avvist",
      splitt,
      paalitelighet,
      observert,
      korrigert,
      n,
      begrunnelse:
        `Fasiten peker MOTSATT vei av referansen (korrigert ${korrigert.toFixed(3)}). ` +
        `Å selektere på den ville gjort kandidaten systematisk verre.`,
    };
  }
  return {
    dom: "godkjent",
    splitt,
    paalitelighet,
    observert,
    korrigert,
    n,
    begrunnelse:
      `Referansen er pålitelig (${paalitelighet.toFixed(3)}) og fasiten henger sammen ` +
      `med den (korrigert ${korrigert.toFixed(3)} over ${n} kandidater).`,
  };
}
