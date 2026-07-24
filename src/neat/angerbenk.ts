/**
 * Angerbenk: mål et genom på BESLUTNINGSKVALITET mot det eksakte orakelet,
 * ikke på kamputfall.
 *
 * Problemet med kampfitness, målt: ett kortvalg er ett av ~250 bak ett tall,
 * støyen fra kortflaks er ±50 poeng mot et signal på ~0,3, og to
 * treningsløp fra SAMME startpopulasjon kan sprike 31 poeng på ren drift.
 * Da kan hverken evolusjonen eller vi lære hvilke beslutninger som var gode.
 *
 * Her scores hver beslutning for seg: orakelet har regnet ut forventet
 * egenpoeng for HVERT lovlig kort, og angeren er fasitens beste minus
 * verdien av kortet genomet velger. Alle genomer møter NØYAKTIG samme
 * stillinger, så variansen mellom dem er null – forskjellen er ren ferdighet.
 *
 * FASITEN ER IKKE NEVROHJERNE. Verdiene kommer fra eksakt dobbelt-dummy over
 * samplede verdener (src/e1/orakel.ts) – samme fasit E1 destilleres fra, og
 * langt over enhver spillende bot. Å lære av den er ikke å lære av en amatør.
 *
 * TO SKJEVHETER Å KJENNE TIL:
 *  1. STILLINGSFORDELING. Stillingene i e1-data er generert av NevroHjerne
 *     med utforskning. Vi måler altså kvalitet i de situasjonene NEVRO
 *     havner i. Et genom som spiller helt annerledes møter andre stillinger
 *     i praksis (distribution shift). Motmiddelet er å blande inn stillinger
 *     fra kandidatens EGEN spilling – se `--egne` i examples/neat-anger.ts.
 *  2. ORAKELETS EGET TAK. Dobbelt-dummy løser hver verden som om alt var
 *     kjent (strategifusjon), så fasiten er ikke perfekt spill under skjult
 *     informasjon. Den er likevel den sterkeste vi har, og den er ikke en
 *     bot vi allerede har slått.
 */

import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";

/** Én scoret stilling: trekkvektor + orakelverdi per lovlig kortindeks. */
export interface Benkstilling {
  /** E1-trekkvektoren (273 tall) – de 238 første er appens koding. */
  readonly t: readonly number[];
  /** NEAT-trekkvektoren (318 tall). Finnes bare i data skrevet etter 2026-07-25. */
  readonly nt?: readonly number[];
  /** kortindeks → forventet egenpoeng. */
  readonly v: Readonly<Record<string, number>>;
  readonly stikk: number;
}

export interface BenkStat {
  /** Snittanger: fasitens beste minus valgt, i egenpoeng. 0 = optimalt. */
  readonly anger: number;
  /** Andel valg som var optimale (innenfor 1e-6 av beste). */
  readonly optimalt: number;
  readonly n: number;
}

/**
 * Leser et fast utvalg stillinger. `steg` plukker hver n-te linje slik at
 * utvalget spres over hele datasettet i stedet for å ta de første – de
 * første partiene er korrelerte (samme skard, samme frøområde).
 */
export function lesBenk(mappe: string, antall: number, steg = 7): Benkstilling[] {
  const ut: Benkstilling[] = [];
  let filer: string[];
  try {
    filer = readdirSync(mappe).filter((f) => f.endsWith(".jsonl")).sort();
  } catch {
    return ut;
  }
  let teller = 0;
  for (const f of filer) {
    let tekst: string;
    try {
      tekst = readFileSync(`${mappe}/${f}`, "utf8");
    } catch {
      continue;
    }
    for (const linje of tekst.split("\n")) {
      if (linje.trim() === "") continue;
      if (teller++ % steg !== 0) continue;
      try {
        const r = JSON.parse(linje) as Benkstilling;
        if (r.t !== undefined && r.v !== undefined && Object.keys(r.v).length >= 2) ut.push(r);
      } catch {
        /* halvskrevet siste linje */
      }
      if (ut.length >= antall) return ut;
    }
  }
  return ut;
}

/**
 * Scorer en kortvelger mot benken. `velg` får trekkvektoren og de lovlige
 * kortindeksene, og returnerer indeksen den ville spilt.
 */
export function scoreBenk(
  benk: readonly Benkstilling[],
  velg: (trekk: readonly number[], lovlige: readonly number[]) => number,
  /** «neat» bruker NEAT-vektoren (n); stillinger uten den hoppes over. */
  format: "e1" | "neat" = "e1",
): BenkStat {
  let sumAnger = 0;
  let optimale = 0;
  let n = 0;
  for (const s of benk) {
    const lovlige = Object.keys(s.v).map(Number);
    if (lovlige.length < 2) continue;
    let beste = -Infinity;
    for (const k of lovlige) beste = Math.max(beste, s.v[String(k)]!);
    const trekk = format === "neat" ? s.nt : s.t;
    if (trekk === undefined) continue;
    const valgt = velg(trekk, lovlige);
    const verdi = s.v[String(valgt)];
    // Et ulovlig valg ville vært en feil i velgeren, ikke i benken – da
    // teller vi full anger i stedet for å hoppe over og pynte på tallet.
    const anger = verdi === undefined ? beste - Math.min(...lovlige.map((k) => s.v[String(k)]!)) : beste - verdi;
    sumAnger += anger;
    if (anger < 1e-6) optimale++;
    n++;
  }
  return { anger: n === 0 ? NaN : sumAnger / n, optimalt: n === 0 ? NaN : optimale / n, n };
}
