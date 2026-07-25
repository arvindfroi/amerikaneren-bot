/**
 * MÅLEKONTRAKTEN – invarianten som har sviktet flest ganger.
 *
 * Tre ganger 25. juli 2026 ble en konklusjon feil fordi et referansetall ble
 * lånt fra et ANNET stillingsutvalg enn kandidaten ble målt på:
 *
 *   - «D7 slår ikke nevro»  : D7-benken skrev differanser i samme tekstformat
 *     som D5/D6 skrev råpoeng. Kurvene havnet i samme diagram uten å bety det
 *     samme.
 *   - «ferske genom slår nevro» : genomet ble målt på halvdel B og
 *     sammenlignet med nevro målt på de første 2000. På samme halvdel er
 *     nevro 0,8381 og genomet 0,8777 – altså motsatt konklusjon.
 *   - «0,8313 mot 0,8352»   : med full benk er tallene 0,8589 mot 0,8179.
 *     BEGGE flyttet seg da utvalget endret seg.
 *
 * Benken er ikke homogen. NevroHjerne måler 0,9431 på de første 2000
 * stillingene, 0,8848 på annenhver og 0,8179 på 21 000. Et referansetall uten
 * sitt utvalg er meningsløst.
 *
 * Derfor kan en `Maaling` ikke KONSTRUERES uten at gulv og tak måles på
 * nøyaktig de samme stillingene, i samme kall. Det er ikke en konvensjon man
 * kan huske å følge – det er den eneste veien til typen.
 */

/** Retningen «bedre» går. Anger er lavereErBedre, poeng er ikke. */
export type Retning = "lavereErBedre" | "hoeyereErBedre";

export interface Maaling {
  readonly navn: string;
  /** Kandidatens tall. */
  readonly verdi: number;
  /** Tilfeldig lovlig valg, målt på SAMME stillinger. */
  readonly gulv: number;
  /** Referansen vi vil slå (NevroHjerne), målt på SAMME stillinger. */
  readonly tak: number;
  /** Antall stillinger. */
  readonly n: number;
  /** Har stillingene vært brukt til seleksjon? */
  readonly holdout: boolean;
  readonly retning: Retning;
}

/**
 * Eneste vei til en `Maaling`. Alle tre tallene beregnes i samme kall over
 * samme utvalg, så de ikke kan komme fra ulike sett.
 */
export function mål<T>(opts: {
  navn: string;
  stillinger: readonly T[];
  holdout: boolean;
  retning: Retning;
  /** Kandidatens score på én stilling. */
  kandidat: (s: T) => number;
  /** Forventet score ved uniformt lovlig valg. Eksakt, ikke samplet. */
  gulv: (s: T) => number;
  /** Referansens score. */
  tak: (s: T) => number;
}): Maaling {
  const n = opts.stillinger.length;
  if (n === 0) throw new Error(`${opts.navn}: null stillinger – en måling uten data er ikke en måling`);
  let sk = 0;
  let sg = 0;
  let st = 0;
  for (const s of opts.stillinger) {
    sk += opts.kandidat(s);
    sg += opts.gulv(s);
    st += opts.tak(s);
  }
  return {
    navn: opts.navn,
    verdi: sk / n,
    gulv: sg / n,
    tak: st / n,
    n,
    holdout: opts.holdout,
    retning: opts.retning,
  };
}

/**
 * Hvor langt kandidaten har kommet fra gulvet mot taket, i [0, 1].
 *
 * 0 = like god som tilfeldig valg. 1 = like god som referansen. Negativ =
 * DÅRLIGERE enn tilfeldig, som er der alle fire trente NEAT-genom faktisk lå
 * (anger 1,069–1,146 mot gulvet 1,035).
 *
 * Dette er tallet som skal rapporteres, ikke råverdien: råverdien flytter seg
 * når utvalget endres, framdriften gjør det ikke på samme måte.
 */
export function framdrift(m: Maaling): number {
  const spenn = m.retning === "lavereErBedre" ? m.gulv - m.tak : m.tak - m.gulv;
  if (Math.abs(spenn) < 1e-12) return 0;
  const naadd = m.retning === "lavereErBedre" ? m.gulv - m.verdi : m.verdi - m.gulv;
  return naadd / spenn;
}

/** Slår kandidaten referansen på disse stillingene? */
export function slaarTaket(m: Maaling): boolean {
  return m.retning === "lavereErBedre" ? m.verdi < m.tak : m.verdi > m.tak;
}

/** Er kandidaten i det hele tatt bedre enn å velge tilfeldig? */
export function overGulvet(m: Maaling): boolean {
  return m.retning === "lavereErBedre" ? m.verdi < m.gulv : m.verdi > m.gulv;
}

export function beskriv(m: Maaling): string {
  const f = framdrift(m);
  return (
    `${m.navn.padEnd(16)} ${m.verdi.toFixed(4)}  ` +
    `[gulv ${m.gulv.toFixed(4)} → tak ${m.tak.toFixed(4)}]  ` +
    `framdrift ${(100 * f).toFixed(1)} %  n=${m.n}` +
    `${m.holdout ? " holdout" : " TRENINGSSETT"}` +
    `${overGulvet(m) ? "" : "  ⚠ UNDER GULVET"}`
  );
}
