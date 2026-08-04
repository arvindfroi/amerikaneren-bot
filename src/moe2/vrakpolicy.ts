/**
 * VRAKPOLICYEN — flaggene som styrer hvilke (trumf, vrak)-par som i det hele
 * tatt vurderes.
 *
 * HVORFOR EN EGEN FIL. Dette er ren strengparsing uten avhengigheter, men den
 * lå i `vrakvelg2.ts`, som importerer verdenssampleren (`sdkort.ts`) og
 * dermed `node:worker_threads`. `vrakrang.ts` trenger BARE flaggene, og da
 * dro den med seg hele søkemaskineriet — nok til at nettleserbunten ikke lot
 * seg bygge i det hele tatt:
 *
 *     X [ERROR] Could not resolve "node:worker_threads"
 *
 * Rangereren finnes nettopp fordi søket ble erstattet (søk målte −0,5119,
 * rangereren +0,49). At den likevel dro søkets avhengigheter inn i
 * nettleseren var utilsiktet. `vrakvelg2.ts` re-eksporterer herfra, så alle
 * eksisterende importer virker uendret.
 */

export interface Vrakpolicy {
  readonly ikkeTrumf: boolean;
  readonly ikkeEss: boolean;
  readonly ikkeKonge: boolean;
  readonly laveste: boolean;
  readonly renonse: boolean;
  readonly dobbelRenonse: boolean;
}

export const INGEN_POLICY: Vrakpolicy = {
  ikkeTrumf: false,
  ikkeEss: false,
  ikkeKonge: false,
  laveste: false,
  renonse: false,
  dobbelRenonse: false,
};

/**
 * `t` aldri vrak trumf · `e` aldri vrak ess · `k` aldri vrak konge
 * `l` kast de laveste · `r` tøm ÉN kort sidefarge · `d` tøm TO korte
 *
 * Ukjent tegn KASTER. Et stille ignorert flagg ville gitt en bot som spiller
 * annerledes enn speken sier, og vrakvalget tas én gang per runde — feilen
 * ville nesten ikke syntes i statistikken.
 */
export function lesVrakflagg(flagg: string): Vrakpolicy {
  let v = INGEN_POLICY;
  for (const tegn of flagg) {
    if (tegn === "t") v = { ...v, ikkeTrumf: true };
    else if (tegn === "e") v = { ...v, ikkeEss: true };
    else if (tegn === "k") v = { ...v, ikkeKonge: true };
    else if (tegn === "l") v = { ...v, laveste: true };
    else if (tegn === "r") v = { ...v, renonse: true };
    else if (tegn === "d") v = { ...v, dobbelRenonse: true };
    else {
      throw new Error(
        `Ukjent vrakflagg «${tegn}» (t = ikke trumf, e = ikke ess, k = ikke konge, ` +
          `l = laveste, r = renonse, d = dobbel renonse)`,
      );
    }
  }
  return v;
}
